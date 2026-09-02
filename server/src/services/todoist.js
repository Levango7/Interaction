// Todoist 集成：OAuth 授权 + 任务 CRUD + 项目同步
// API 文档：https://developer.todoist.com/
// 使用 Sync v9 API：https://developer.todoist.com/sync/v9/
import { v4 as uuidv4 } from 'uuid';
import { getToken, isAuthorized } from './oauth-manager.js';
import { getDb } from '../db.js';
import { createError } from '../middleware/error.js';

/**
 * 调用 Todoist Sync API 的统一封装
 * @param {string} userId
 * @param {Array} commands - Sync 命令数组
 * @returns {Promise<Object>} Sync 响应（temp_id 映射等）
 */
async function todoistSync(userId, commands) {
  const { accessToken } = await getToken('todoist', userId);
  const res = await fetch('https://api.todoist.com/sync/v9/sync', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ commands }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw createError(res.status, `Todoist API 错误: ${res.status} ${text}`);
  }
  return res.json();
}

/**
 * 调用 Todoist REST API（v2）的统一封装
 * 用于任务 CRUD（REST 比 Sync 更直观）
 * @param {string} userId
 * @param {string} path
 * @param {Object} [options]
 */
async function todoistRest(userId, path, options = {}) {
  const { accessToken } = await getToken('todoist', userId);
  const res = await fetch(`https://api.todoist.com/rest/v2/${path.replace(/^\//, '')}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw createError(res.status, `Todoist REST API 错误: ${res.status} ${text}`);
  }
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return res.json();
  }
  return null;
}

/**
 * 列出 Todoist 任务
 * GET /api/integrations/todoist/tasks
 * @param {string} userId
 * @param {Object} [query] - { projectId, filter, cursor }
 */
export async function listTasks(userId, query = {}) {
  const params = new URLSearchParams();
  if (query.projectId) params.set('project_id', String(query.projectId));
  if (query.filter) params.set('filter', query.filter);
  if (query.cursor) params.set('cursor', query.cursor);
  const qs = params.toString();
  return todoistRest(userId, `/tasks${qs ? '?' + qs : ''}`, { method: 'GET' });
}

/**
 * 创建 Todoist 任务
 * POST /api/integrations/todoist/tasks
 * @param {string} userId
 * @param {Object} payload - { content, projectId?, dueString?, priority?, labels? }
 */
export async function createTask(userId, payload) {
  if (!payload?.content) {
    throw createError(400, '缺少 content 字段');
  }
  const body = { content: payload.content };
  if (payload.projectId) body.project_id = payload.projectId;
  if (payload.sectionId) body.section_id = payload.sectionId;
  if (payload.parentId) body.parent_id = payload.parentId;
  if (payload.dueString) body.due_string = payload.dueString;
  if (payload.dueDate) body.due_date = payload.dueDate;
  if (payload.priority) body.priority = payload.priority;
  if (payload.labels) body.labels = payload.labels;
  if (payload.description) body.description = payload.description;
  return todoistRest(userId, '/tasks', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/**
 * 更新 Todoist 任务
 * PUT /api/integrations/todoist/tasks/:id
 * @param {string} userId
 * @param {string} taskId
 * @param {Object} payload
 */
export async function updateTask(userId, taskId, payload) {
  const body = {};
  if (payload.content !== undefined) body.content = payload.content;
  if (payload.projectId !== undefined) body.project_id = payload.projectId;
  if (payload.sectionId !== undefined) body.section_id = payload.sectionId;
  if (payload.parentId !== undefined) body.parent_id = payload.parentId;
  if (payload.dueString !== undefined) body.due_string = payload.dueString;
  if (payload.dueDate !== undefined) body.due_date = payload.dueDate;
  if (payload.priority !== undefined) body.priority = payload.priority;
  if (payload.labels !== undefined) body.labels = payload.labels;
  if (payload.description !== undefined) body.description = payload.description;
  return todoistRest(userId, `/tasks/${taskId}`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/**
 * 删除 Todoist 任务
 * DELETE /api/integrations/todoist/tasks/:id
 * @param {string} userId
 * @param {string} taskId
 */
export async function deleteTask(userId, taskId) {
  return todoistRest(userId, `/tasks/${taskId}`, { method: 'DELETE' });
}

/**
 * 列出 Todoist 项目
 * GET /api/integrations/todoist/projects
 * @param {string} userId
 */
export async function listProjects(userId) {
  return todoistRest(userId, '/projects', { method: 'GET' });
}

/**
 * 同步 Todoist 项目到本地场景
 * 策略：拉取 Todoist 项目列表，写入 integration_configs.config.projects
 * POST /api/integrations/todoist/sync
 * @param {string} userId
 * @param {Object} [options] - { onProjectSynced }
 * @returns {Promise<Object>} 同步结果
 */
export async function syncProjects(userId, options = {}) {
  const { onProjectSynced } = options;
  if (!isAuthorized('todoist', userId)) {
    throw createError(401, '未授权 Todoist');
  }

  const projects = await listProjects(userId);
  const stats = { pulled: 0, errors: [] };

  // 写入 integration_configs.config.projects
  const db = getDb();
  const now = new Date().toISOString();
  const row = db
    .prepare('SELECT id, config FROM integration_configs WHERE userId = ? AND provider = ?')
    .get(userId, 'todoist');
  let config = {};
  try {
    config = row?.config ? JSON.parse(row.config) : {};
  } catch {
    config = {};
  }
  config.projects = projects;

  if (row) {
    db.prepare(
      'UPDATE integration_configs SET config = ?, updatedAt = ? WHERE id = ?'
    ).run(JSON.stringify(config), now, row.id);
  } else {
    db.prepare(
      `INSERT INTO integration_configs (id, userId, provider, config, enabled, createdAt, updatedAt)
       VALUES (?, ?, 'todoist', ?, 1, ?, ?)`
    ).run(uuidv4(), userId, JSON.stringify(config), now, now);
  }

  // 逐个项目回调（供上层写入本地 scenes 表）
  for (const project of projects) {
    try {
      if (onProjectSynced) await onProjectSynced(project);
      stats.pulled += 1;
    } catch (err) {
      stats.errors.push({ projectId: project.id, error: err.message });
    }
  }

  // 记录同步状态
  db.prepare(`
    INSERT INTO integration_sync_state (id, userId, provider, lastSyncAt, createdAt, updatedAt)
    VALUES (?, ?, 'todoist', ?, ?, ?)
    ON CONFLICT(userId, provider) DO UPDATE SET
      lastSyncAt = excluded.lastSyncAt,
      updatedAt = excluded.updatedAt
  `).run(uuidv4(), userId, now, now, now);

  return { projects, stats };
}

export { todoistRest, todoistSync };