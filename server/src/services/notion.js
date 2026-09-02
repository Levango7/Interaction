// Notion 集成：OAuth 授权 + 数据库查询 + 页面创建/更新 + 双向同步任务
// API 文档：https://developers.notion.com/
import { v4 as uuidv4 } from 'uuid';
import { getToken, storeToken, isAuthorized } from './oauth-manager.js';
import { getDb } from '../db.js';
import { createError } from '../middleware/error.js';

// Notion API 版本头
const NOTION_VERSION = '2022-06-28';

/**
 * 调用 Notion API 的统一封装
 * @param {string} userId
 * @param {string} path - API 路径（相对 https://api.notion.com/v1/）
 * @param {Object} [options] - fetch options
 */
async function notionFetch(userId, path, options = {}) {
  const { accessToken } = await getToken('notion', userId);
  const res = await fetch(`https://api.notion.com/v1/${path.replace(/^\//, '')}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw createError(res.status, `Notion API 错误: ${res.status} ${text}`);
  }
  // 部分端点返回空体
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return res.json();
  }
  return null;
}

/**
 * 列出已授权的 Notion 数据库
 * GET /api/integrations/notion/databases
 * @param {string} userId
 * @param {Object} [query] - { pageSize, startCursor }
 */
export async function listDatabases(userId, query = {}) {
  const params = new URLSearchParams();
  if (query.pageSize) params.set('page_size', String(query.pageSize));
  if (query.startCursor) params.set('start_cursor', query.startCursor);
  const qs = params.toString();
  return notionFetch(userId, `/search${qs ? '?' + qs : ''}`, {
    method: 'POST',
    body: JSON.stringify({ filter: { value: 'database', property: 'object' } }),
  });
}

/**
 * 查询数据库内容（按条件过滤）
 * @param {string} userId
 * @param {string} databaseId
 * @param {Object} [body] - Notion query body
 */
export async function queryDatabase(userId, databaseId, body = {}) {
  return notionFetch(userId, `/databases/${databaseId}/query`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/**
 * 在 Notion 中创建页面
 * POST /api/integrations/notion/pages
 * @param {string} userId
 * @param {Object} payload - { parent, properties, children? }
 */
export async function createPage(userId, payload) {
  if (!payload?.parent) {
    throw createError(400, '缺少 parent 字段');
  }
  return notionFetch(userId, '/pages', {
    method: 'POST',
    body: JSON.stringify({
      parent: payload.parent,
      properties: payload.properties || {},
      children: payload.children || [],
    }),
  });
}

/**
 * 更新 Notion 页面属性
 * PUT /api/integrations/notion/pages/:id
 * @param {string} userId
 * @param {string} pageId
 * @param {Object} payload - { properties, archived? }
 */
export async function updatePage(userId, pageId, payload) {
  const body = {};
  if (payload.properties) body.properties = payload.properties;
  if (payload.archived !== undefined) body.archived = payload.archived;
  if (payload.in_trash !== undefined) body.in_trash = payload.in_trash;
  return notionFetch(userId, `/pages/${pageId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

/**
 * 读取单个页面
 */
export async function retrievePage(userId, pageId) {
  return notionFetch(userId, `/pages/${pageId}`, { method: 'GET' });
}

/**
 * 将本地任务转换为 Notion 页面属性
 * 约定：本地任务表 tasks(id, title, description, status, dueDate, notionPageId)
 * @param {Object} task
 */
function taskToNotionProperties(task) {
  const props = {
    Name: {
      title: [{ text: { content: task.title || task.name || '未命名任务' } }],
    },
  };
  if (task.description) {
    props.Description = {
      rich_text: [{ text: { content: String(task.description).slice(0, 2000) } }],
    };
  }
  if (task.status) {
    props.Status = { status: { name: task.status } };
  }
  if (task.dueDate) {
    props['Due Date'] = { date: { start: task.dueDate } };
  }
  return props;
}

/**
 * 将 Notion 页面属性转换为本地任务
 */
function notionPageToTask(page) {
  const props = page.properties || {};
  const titleProp = props.Name || props.name || props.title;
  const title = titleProp?.title?.map((t) => t.plain_text).join('') || '';
  const descProp = props.Description || props.description;
  const description = descProp?.rich_text?.map((t) => t.plain_text).join('') || '';
  const status = props.Status?.status?.name || props.status?.status?.name || '';
  const dueDate = props['Due Date']?.date?.start || props.dueDate?.date?.start || '';
  return {
    notionPageId: page.id,
    title,
    description,
    status,
    dueDate,
    lastEditedTime: page.last_edited_time,
  };
}

/**
 * 双向同步本地任务 ↔ Notion 页面
 * 策略：
 *  - 本地任务无 notionPageId → 推送到 Notion 创建页面，回写 notionPageId
 *  - 本地任务有 notionPageId → 比较时间戳，较新者覆盖较旧者
 *  - Notion 存在但本地无对应记录 → 拉取到本地（需调用方提供本地写入回调）
 * POST /api/integrations/notion/sync
 * @param {string} userId
 * @param {Object} options - { databaseId, localTasks, upsertLocalTask }
 * @returns {Promise<Object>} 同步结果统计
 */
export async function syncTasks(userId, options = {}) {
  const { databaseId, localTasks = [], upsertLocalTask } = options;
  if (!databaseId) {
    throw createError(400, '缺少 databaseId');
  }
  if (!isAuthorized('notion', userId)) {
    throw createError(401, '未授权 Notion');
  }

  const stats = { pushed: 0, pulled: 0, updated: 0, skipped: 0, errors: [] };

  // 1) 拉取 Notion 数据库中所有页面
  const notionPages = [];
  let cursor = undefined;
  do {
    const page = await queryDatabase(userId, databaseId, {
      start_cursor: cursor,
      page_size: 100,
    });
    notionPages.push(...(page.results || []));
    cursor = page.has_more ? page.next_cursor : undefined;
  } while (cursor);

  const notionMap = new Map(notionPages.map((p) => [p.id, p]));

  // 2) 推送本地任务到 Notion
  for (const task of localTasks) {
    try {
      if (!task.notionPageId) {
        // 本地新任务 → 创建 Notion 页面
        const created = await createPage(userId, {
          parent: { database_id: databaseId },
          properties: taskToNotionProperties(task),
        });
        task.notionPageId = created.id;
        if (upsertLocalTask) await upsertLocalTask(task);
        stats.pushed += 1;
      } else {
        const remote = notionMap.get(task.notionPageId);
        if (!remote) {
          stats.skipped += 1;
          continue;
        }
        const localTs = task.updatedAt ? new Date(task.updatedAt).getTime() : 0;
        const remoteTs = new Date(remote.last_edited_time).getTime();
        if (localTs > remoteTs) {
          // 本地较新 → 推送更新
          await updatePage(userId, task.notionPageId, {
            properties: taskToNotionProperties(task),
          });
          stats.updated += 1;
        } else if (remoteTs > localTs) {
          // 远端较新 → 拉取到本地
          const merged = { ...task, ...notionPageToTask(remote) };
          if (upsertLocalTask) await upsertLocalTask(merged);
          stats.pulled += 1;
        } else {
          stats.skipped += 1;
        }
      }
    } catch (err) {
      stats.errors.push({ taskId: task.id, error: err.message });
    }
  }

  // 3) Notion 中存在但本地未跟踪的页面 → 拉取到本地
  const localPageIds = new Set(
    localTasks.filter((t) => t.notionPageId).map((t) => t.notionPageId)
  );
  for (const page of notionPages) {
    if (!localPageIds.has(page.id)) {
      try {
        const pulled = notionPageToTask(page);
        if (upsertLocalTask) await upsertLocalTask(pulled);
        stats.pulled += 1;
      } catch (err) {
        stats.errors.push({ pageId: page.id, error: err.message });
      }
    }
  }

  // 4) 记录同步状态
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO integration_sync_state (id, userId, provider, lastSyncAt, createdAt, updatedAt)
    VALUES (?, ?, 'notion', ?, ?, ?)
    ON CONFLICT(userId, provider) DO UPDATE SET
      lastSyncAt = excluded.lastSyncAt,
      updatedAt = excluded.updatedAt
  `).run(uuidv4(), userId, now, now, now);

  return stats;
}

export { notionFetch, taskToNotionProperties, notionPageToTask };
