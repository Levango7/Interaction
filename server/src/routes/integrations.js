// 集成路由：统一管理所有第三方集成的 OAuth + 业务 API
// 挂载路径：/api/integrations
import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { createError } from '../middleware/error.js';
import {
  getAuthorizeUrl,
  exchangeCodeForToken,
  storeToken,
  revokeToken,
  isAuthorized,
  listProviders,
  makeState,
  parseState,
} from '../services/oauth-manager.js';
import * as notion from '../services/notion.js';
import * as todoist from '../services/todoist.js';
import * as gcalendar from '../services/gcalendar.js';

const router = Router();

// 支持的提供商白名单
const SUPPORTED_PROVIDERS = new Set(['notion', 'todoist', 'google']);

/**
 * 校验 provider 参数
 */
function validateProvider(req, res, next) {
  const { provider } = req.params;
  if (!SUPPORTED_PROVIDERS.has(provider)) {
    return next(createError(400, `不支持的提供商: ${provider}`));
  }
  next();
}

// ==================== 集成状态与配置 ====================

/**
 * 集成状态查询
 * GET /api/integrations/status
 * 返回每个提供商的授权状态、最近同步时间
 */
router.get('/status', requireAuth, (req, res, next) => {
  try {
    const db = getDb();
    const providers = listProviders();
    const result = providers.map((p) => {
      const token = db
        .prepare('SELECT expiresAt, updatedAt FROM oauth_tokens WHERE userId = ? AND provider = ?')
        .get(req.user.userId, p.name);
      const cfg = db
        .prepare('SELECT enabled, config, updatedAt FROM integration_configs WHERE userId = ? AND provider = ?')
        .get(req.user.userId, p.name);
      const sync = db
        .prepare('SELECT lastSyncAt FROM integration_sync_state WHERE userId = ? AND provider = ?')
        .get(req.user.userId, p.name);
      return {
        provider: p.name,
        authorized: !!token,
        tokenExpiresAt: token?.expiresAt || null,
        enabled: cfg ? !!cfg.enabled : false,
        lastSyncAt: sync?.lastSyncAt || null,
      };
    });
    return res.json({ integrations: result });
  } catch (err) {
    next(err);
  }
});

/**
 * 获取集成配置
 * GET /api/integrations/config
 */
router.get('/config', requireAuth, (req, res, next) => {
  try {
    const db = getDb();
    const rows = db
      .prepare('SELECT provider, config, enabled, updatedAt FROM integration_configs WHERE userId = ?')
      .all(req.user.userId);
    const configs = rows.map((r) => ({
      provider: r.provider,
      enabled: !!r.enabled,
      config: safeParse(r.config),
      updatedAt: r.updatedAt,
    }));
    return res.json({ configs });
  } catch (err) {
    next(err);
  }
});

/**
 * 更新集成配置
 * PUT /api/integrations/config
 * body: { provider, enabled?, config? }
 */
router.put('/config', requireAuth, (req, res, next) => {
  try {
    const { provider, enabled, config } = req.body || {};
    if (!SUPPORTED_PROVIDERS.has(provider)) {
      return next(createError(400, `不支持的提供商: ${provider}`));
    }
    const db = getDb();
    const now = new Date().toISOString();
    const row = db
      .prepare('SELECT id, config, enabled FROM integration_configs WHERE userId = ? AND provider = ?')
      .get(req.user.userId, provider);

    const newConfig = config !== undefined ? JSON.stringify(config) : row?.config || '{}';
    const newEnabled = enabled !== undefined ? (enabled ? 1 : 0) : row?.enabled ?? 0;

    if (row) {
      db.prepare(
        'UPDATE integration_configs SET config = ?, enabled = ?, updatedAt = ? WHERE id = ?'
      ).run(newConfig, newEnabled, now, row.id);
    } else {
      db.prepare(
        `INSERT INTO integration_configs (id, userId, provider, config, enabled, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(uuidv4(), req.user.userId, provider, newConfig, newEnabled, now, now);
    }
    return res.json({
      message: '配置已更新',
      provider,
      enabled: !!newEnabled,
      config: safeParse(newConfig),
    });
  } catch (err) {
    next(err);
  }
});

// ==================== OAuth 通用流程 ====================

/**
 * 发起 OAuth 授权
 * POST /api/integrations/oauth/:provider/connect
 * 返回授权 URL，前端跳转
 */
router.post('/oauth/:provider/connect', requireAuth, validateProvider, (req, res, next) => {
  try {
    const { provider } = req.params;
    const state = makeState(req.user.userId);
    const url = getAuthorizeUrl(provider, req, state);
    return res.json({ authorizeUrl: url, provider, state });
  } catch (err) {
    next(err);
  }
});

/**
 * OAuth 回调
 * GET /api/integrations/oauth/:provider/callback
 * 提供商重定向回此端点，携带 code 与 state
 */
router.get('/oauth/:provider/callback', validateProvider, async (req, res, next) => {
  try {
    const { provider } = req.params;
    const { code, state, error } = req.query;

    if (error) {
      return next(createError(400, `OAuth 授权失败: ${error}`));
    }
    if (!code) {
      return next(createError(400, '缺少授权码 code'));
    }

    const statePayload = parseState(state);
    const userId = statePayload.userId;
    if (!userId) {
      return next(createError(400, 'state 无效，无法识别用户'));
    }

    const tokenResponse = await exchangeCodeForToken(provider, code, req);
    storeToken(provider, userId, tokenResponse);

    return res.json({
      message: '授权成功',
      provider,
      userId,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * 撤销授权
 * DELETE /api/integrations/oauth/:provider
 */
router.delete('/oauth/:provider', requireAuth, validateProvider, async (req, res, next) => {
  try {
    await revokeToken(req.params.provider, req.user.userId);
    return res.json({ message: '已撤销授权', provider: req.params.provider });
  } catch (err) {
    next(err);
  }
});

// ==================== Notion 集成 ====================

/**
 * 列出 Notion 数据库
 * GET /api/integrations/notion/databases
 */
router.get('/notion/databases', requireAuth, async (req, res, next) => {
  try {
    const data = await notion.listDatabases(req.user.userId, {
      pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
      startCursor: req.query.startCursor,
    });
    return res.json(data);
  } catch (err) {
    next(err);
  }
});

/**
 * 创建 Notion 页面
 * POST /api/integrations/notion/pages
 */
router.post('/notion/pages', requireAuth, async (req, res, next) => {
  try {
    const data = await notion.createPage(req.user.userId, req.body || {});
    return res.status(201).json(data);
  } catch (err) {
    next(err);
  }
});

/**
 * 更新 Notion 页面
 * PUT /api/integrations/notion/pages/:id
 */
router.put('/notion/pages/:id', requireAuth, async (req, res, next) => {
  try {
    const data = await notion.updatePage(req.user.userId, req.params.id, req.body || {});
    return res.json(data);
  } catch (err) {
    next(err);
  }
});

/**
 * 同步任务到 Notion
 * POST /api/integrations/notion/sync
 * body: { databaseId, localTasks, upsertLocalTask? }
 */
router.post('/notion/sync', requireAuth, async (req, res, next) => {
  try {
    const { databaseId, localTasks, upsertLocalTask } = req.body || {};
    const stats = await notion.syncTasks(req.user.userId, {
      databaseId,
      localTasks,
      upsertLocalTask,
    });
    return res.json({ stats });
  } catch (err) {
    next(err);
  }
});

// ==================== Todoist 集成 ====================

/**
 * 列出 Todoist 任务
 * GET /api/integrations/todoist/tasks
 */
router.get('/todoist/tasks', requireAuth, async (req, res, next) => {
  try {
    const data = await todoist.listTasks(req.user.userId, {
      projectId: req.query.projectId,
      filter: req.query.filter,
      cursor: req.query.cursor,
    });
    return res.json(data);
  } catch (err) {
    next(err);
  }
});

/**
 * 创建 Todoist 任务
 * POST /api/integrations/todoist/tasks
 */
router.post('/todoist/tasks', requireAuth, async (req, res, next) => {
  try {
    const data = await todoist.createTask(req.user.userId, req.body || {});
    return res.status(201).json(data);
  } catch (err) {
    next(err);
  }
});

/**
 * 更新 Todoist 任务
 * PUT /api/integrations/todoist/tasks/:id
 */
router.put('/todoist/tasks/:id', requireAuth, async (req, res, next) => {
  try {
    const data = await todoist.updateTask(req.user.userId, req.params.id, req.body || {});
    return res.json(data);
  } catch (err) {
    next(err);
  }
});

/**
 * 删除 Todoist 任务
 * DELETE /api/integrations/todoist/tasks/:id
 */
router.delete('/todoist/tasks/:id', requireAuth, async (req, res, next) => {
  try {
    await todoist.deleteTask(req.user.userId, req.params.id);
    return res.json({ message: '任务已删除' });
  } catch (err) {
    next(err);
  }
});

/**
 * 列出 Todoist 项目
 * GET /api/integrations/todoist/projects
 */
router.get('/todoist/projects', requireAuth, async (req, res, next) => {
  try {
    const data = await todoist.listProjects(req.user.userId);
    return res.json(data);
  } catch (err) {
    next(err);
  }
});

/**
 * 同步 Todoist 项目
 * POST /api/integrations/todoist/sync
 * body: { onProjectSynced? }
 */
router.post('/todoist/sync', requireAuth, async (req, res, next) => {
  try {
    const { onProjectSynced } = req.body || {};
    const result = await todoist.syncProjects(req.user.userId, { onProjectSynced });
    return res.json(result);
  } catch (err) {
    next(err);
  }
});

// ==================== Google Calendar 集成 ====================

/**
 * 列出日历
 * GET /api/integrations/gcalendar/calendars
 */
router.get('/gcalendar/calendars', requireAuth, async (req, res, next) => {
  try {
    const data = await gcalendar.listCalendars(req.user.userId);
    return res.json(data);
  } catch (err) {
    next(err);
  }
});

/**
 * 列出事件
 * GET /api/integrations/gcalendar/events
 */
router.get('/gcalendar/events', requireAuth, async (req, res, next) => {
  try {
    const data = await gcalendar.listEvents(req.user.userId, {
      calendarId: req.query.calendarId,
      timeMin: req.query.timeMin,
      timeMax: req.query.timeMax,
      q: req.query.q,
      pageToken: req.query.pageToken,
      maxResults: req.query.maxResults ? Number(req.query.maxResults) : undefined,
    });
    return res.json(data);
  } catch (err) {
    next(err);
  }
});

/**
 * 创建事件
 * POST /api/integrations/gcalendar/events
 */
router.post('/gcalendar/events', requireAuth, async (req, res, next) => {
  try {
    const data = await gcalendar.createEvent(req.user.userId, req.body || {});
    return res.status(201).json(data);
  } catch (err) {
    next(err);
  }
});

/**
 * 更新事件
 * PUT /api/integrations/gcalendar/events/:id
 */
router.put('/gcalendar/events/:id', requireAuth, async (req, res, next) => {
  try {
    const data = await gcalendar.updateEvent(req.user.userId, req.params.id, req.body || {});
    return res.json(data);
  } catch (err) {
    next(err);
  }
});

/**
 * 删除事件
 * DELETE /api/integrations/gcalendar/events/:id
 */
router.delete('/gcalendar/events/:id', requireAuth, async (req, res, next) => {
  try {
    await gcalendar.deleteEvent(req.user.userId, req.params.id, {
      calendarId: req.query.calendarId,
    });
    return res.json({ message: '事件已删除' });
  } catch (err) {
    next(err);
  }
});

/**
 * 同步任务到 Google Calendar
 * POST /api/integrations/gcalendar/sync
 * body: { calendarId?, localTasks, upsertLocalTask?, removeCompleted? }
 */
router.post('/gcalendar/sync', requireAuth, async (req, res, next) => {
  try {
    const { calendarId, localTasks, upsertLocalTask, removeCompleted } = req.body || {};
    const stats = await gcalendar.syncTasks(req.user.userId, {
      calendarId,
      localTasks,
      upsertLocalTask,
      removeCompleted,
    });
    return res.json({ stats });
  } catch (err) {
    next(err);
  }
});

/**
 * 安全解析 JSON，失败返回空对象
 */
function safeParse(str) {
  try {
    return typeof str === 'string' ? JSON.parse(str) : str || {};
  } catch {
    return {};
  }
}

export default router;