// 第三方 API 集成端到端测试
// 覆盖：OAuth 管理器、Notion、Todoist、Google Calendar、集成路由
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createApp } from '../src/index.js';
import { getDb, closeDb } from '../src/db.js';
import {
  getAuthorizeUrl,
  storeToken,
  getToken,
  revokeToken,
  isAuthorized,
  listProviders,
  makeState,
  parseState,
  PROVIDERS,
} from '../src/services/oauth-manager.js';
import { taskToNotionProperties, notionPageToTask } from '../src/services/notion.js';
import { taskToEvent } from '../src/services/gcalendar.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 测试用临时数据库路径
const TMP_DB = join(__dirname, '..', 'data', 'test-integrations.db');
let app;

// 测试用户常量
const TEST_USER = {
  email: 'int@example.com',
  password: 'password123',
  name: '集成测试用户',
};

// 登录态
let accessToken = '';
let userId = '';

// 保存原始 fetch 引用
const originalFetch = globalThis.fetch;

beforeAll(async () => {
  // 删除可能残留的测试数据库
  if (fs.existsSync(TMP_DB)) fs.unlinkSync(TMP_DB);
  for (const suffix of ['-wal', '-shm']) {
    const f = TMP_DB + suffix;
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
  process.env.DB_PATH = TMP_DB;
  closeDb();
  getDb();
  app = createApp();

  // 注册并登录测试用户
  await request(app).post('/api/auth/register').send(TEST_USER);
  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ email: TEST_USER.email, password: TEST_USER.password });
  accessToken = loginRes.body.accessToken;
  // 从 token 中解出 userId（通过 /me 接口）
  const meRes = await request(app)
    .get('/api/auth/me')
    .set('Authorization', `Bearer ${accessToken}`);
  userId = meRes.body.user.id;
});

afterAll(async () => {
  // 恢复 fetch
  globalThis.fetch = originalFetch;
  closeDb();
  // 清理测试数据库文件
  for (const suffix of ['', '-wal', '-shm']) {
    const f = TMP_DB + suffix;
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
});

afterEach(() => {
  // 每个测试后恢复 fetch
  globalThis.fetch = originalFetch;
});

/**
 * 构造 mock fetch：按 URL 前缀分发到不同 handler
 */
function mockFetch(handlers) {
  return async (url, options = {}) => {
    const urlStr = typeof url === 'string' ? url : url.toString();
    for (const { match, response } of handlers) {
      if (typeof match === 'string' && urlStr.startsWith(match)) {
        return response(urlStr, options);
      }
      if (match instanceof RegExp && match.test(urlStr)) {
        return response(urlStr, options);
      }
    }
    throw new Error(`mock fetch 未匹配 URL: ${urlStr}`);
  };
}

/**
 * 构造 JSON 响应对象
 */
function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Map([['content-type', 'application/json']]),
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

// ==================== OAuth 管理器单元测试 ====================

describe('OAuth 管理器', () => {
  it('应列出支持的提供商', () => {
    const providers = listProviders();
    const names = providers.map((p) => p.name);
    expect(names).toContain('notion');
    expect(names).toContain('todoist');
    expect(names).toContain('google');
  });

  it('应生成 Notion 授权 URL', () => {
    const state = makeState(userId);
    const url = getAuthorizeUrl('notion', { protocol: 'http', get: () => 'localhost:3001' }, state);
    expect(url).toContain('https://api.notion.com/v1/oauth/authorize');
    expect(url).toContain('client_id=');
    expect(url).toContain('state=');
  });

  it('应生成 Todoist 授权 URL', () => {
    const state = makeState(userId);
    const url = getAuthorizeUrl('todoist', { protocol: 'http', get: () => 'localhost:3001' }, state);
    expect(url).toContain('https://todoist.com/oauth/authorize');
    expect(url).toContain('scope=data%3Aread_write');
  });

  it('应生成 Google 授权 URL', () => {
    const state = makeState(userId);
    const url = getAuthorizeUrl('google', { protocol: 'http', get: () => 'localhost:3001' }, state);
    expect(url).toContain('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url).toContain('access_type=offline');
    expect(url).toContain('prompt=consent');
  });

  it('不支持的提供商应抛错', () => {
    expect(() => getAuthorizeUrl('unknown', {}, '')).toThrow();
  });

  it('makeState/parseState 应可逆', () => {
    const state = makeState('user-123');
    const parsed = parseState(state);
    expect(parsed.userId).toBe('user-123');
    expect(parsed.ts).toBeDefined();
  });

  it('storeToken/getToken 应正确存取', async () => {
    storeToken('notion', userId, {
      access_token: 'test-notion-token',
      token_type: 'bearer',
      scope: '',
    });
    const token = await getToken('notion', userId);
    expect(token.accessToken).toBe('test-notion-token');
  });

  it('isAuthorized 应反映授权状态', () => {
    expect(isAuthorized('notion', userId)).toBe(true);
    expect(isAuthorized('todoist', userId)).toBe(false);
  });

  it('revokeToken 应删除本地 token', async () => {
    storeToken('todoist', userId, { access_token: 'test-todoist-token' });
    expect(isAuthorized('todoist', userId)).toBe(true);
    // mock fetch 防止真实调用撤销端点
    globalThis.fetch = mockFetch([
      {
        match: 'https://api.todoist.com',
        response: () => jsonResponse({}, 204),
      },
    ]);
    await revokeToken('todoist', userId);
    expect(isAuthorized('todoist', userId)).toBe(false);
  });

  it('revokeToken 未授权的提供商应返回 404', async () => {
    await expect(revokeToken('todoist', userId)).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});

// ==================== 集成路由：状态与配置 ====================

describe('集成路由 - 状态与配置', () => {
  it('GET /api/integrations/status 未认证应返回 401', async () => {
    const res = await request(app).get('/api/integrations/status');
    expect(res.status).toBe(401);
  });

  it('GET /api/integrations/status 应返回所有提供商状态', async () => {
    const res = await request(app)
      .get('/api/integrations/status')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.integrations)).toBe(true);
    const names = res.body.integrations.map((i) => i.provider);
    expect(names).toContain('notion');
    expect(names).toContain('todoist');
    expect(names).toContain('google');
    // notion 已授权
    const notionStatus = res.body.integrations.find((i) => i.provider === 'notion');
    expect(notionStatus.authorized).toBe(true);
  });

  it('GET /api/integrations/config 应返回配置列表', async () => {
    const res = await request(app)
      .get('/api/integrations/config')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.configs)).toBe(true);
  });

  it('PUT /api/integrations/config 应更新配置', async () => {
    const res = await request(app)
      .put('/api/integrations/config')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        provider: 'notion',
        enabled: true,
        config: { databaseId: 'test-db-id' },
      });
    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(true);
    expect(res.body.config.databaseId).toBe('test-db-id');
  });

  it('PUT /api/integrations/config 不支持的提供商应返回 400', async () => {
    const res = await request(app)
      .put('/api/integrations/config')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ provider: 'unknown', enabled: true });
    expect(res.status).toBe(400);
  });
});

// ==================== OAuth 路由 ====================

describe('OAuth 路由', () => {
  it('POST /api/integrations/oauth/:provider/connect 应返回授权 URL', async () => {
    const res = await request(app)
      .post('/api/integrations/oauth/notion/connect')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.authorizeUrl).toContain('notion.com');
    expect(res.body.provider).toBe('notion');
    expect(res.body.state).toBeDefined();
  });

  it('POST /api/integrations/oauth/:provider/connect 不支持提供商应 400', async () => {
    const res = await request(app)
      .post('/api/integrations/oauth/unknown/connect')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(400);
  });

  it('GET /api/integrations/oauth/:provider/callback 缺少 code 应 400', async () => {
    const res = await request(app)
      .get('/api/integrations/oauth/notion/callback')
      .query({ state: makeState(userId) });
    expect(res.status).toBe(400);
  });

  it('GET /api/integrations/oauth/:provider/callback 带 error 应 400', async () => {
    const res = await request(app)
      .get('/api/integrations/oauth/notion/callback')
      .query({ error: 'access_denied' });
    expect(res.status).toBe(400);
  });

  it('GET /api/integrations/oauth/:provider/callback 应完成 token 交换', async () => {
    // mock Notion token 端点
    globalThis.fetch = mockFetch([
      {
        match: 'https://api.notion.com/v1/oauth/token',
        response: () =>
          jsonResponse({
            access_token: 'callback-notion-token',
            token_type: 'bearer',
            workspace_name: '测试空间',
          }),
      },
    ]);
    const state = makeState(userId);
    const res = await request(app)
      .get('/api/integrations/oauth/notion/callback')
      .query({ code: 'test-code', state });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('授权成功');
    // 验证 token 已存储
    const token = await getToken('notion', userId);
    expect(token.accessToken).toBe('callback-notion-token');
  });

  it('DELETE /api/integrations/oauth/:provider 应撤销授权', async () => {
    // 先确保有 token
    storeToken('google', userId, {
      access_token: 'g-token',
      refresh_token: 'g-refresh',
      expires_in: 3600,
    });
    // mock Google 撤销端点
    globalThis.fetch = mockFetch([
      {
        match: 'https://oauth2.googleapis.com/revoke',
        response: () => jsonResponse({}, 200),
      },
    ]);
    const res = await request(app)
      .delete('/api/integrations/oauth/google')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(isAuthorized('google', userId)).toBe(false);
  });

  it('DELETE 未授权的提供商应返回 404', async () => {
    const res = await request(app)
      .delete('/api/integrations/oauth/google')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(404);
  });
});

// ==================== Notion 集成测试 ====================

describe('Notion 集成', () => {
  beforeEach(() => {
    // 确保 notion 已授权
    storeToken('notion', userId, { access_token: 'notion-test-token' });
  });

  it('taskToNotionProperties 应正确转换', () => {
    const props = taskToNotionProperties({
      title: '测试任务',
      description: '描述',
      status: '进行中',
      dueDate: '2026-09-03',
    });
    expect(props.Name.title[0].text.content).toBe('测试任务');
    expect(props.Description.rich_text[0].text.content).toBe('描述');
    expect(props.Status.status.name).toBe('进行中');
    expect(props['Due Date'].date.start).toBe('2026-09-03');
  });

  it('notionPageToTask 应正确转换', () => {
    const task = notionPageToTask({
      id: 'page-1',
      last_edited_time: '2026-09-01T00:00:00.000Z',
      properties: {
        Name: { title: [{ plain_text: '页面任务' }] },
        Description: { rich_text: [{ plain_text: '页面描述' }] },
        Status: { status: { name: '已完成' } },
        'Due Date': { date: { start: '2026-09-05' } },
      },
    });
    expect(task.notionPageId).toBe('page-1');
    expect(task.title).toBe('页面任务');
    expect(task.description).toBe('页面描述');
    expect(task.status).toBe('已完成');
    expect(task.dueDate).toBe('2026-09-05');
  });

  it('GET /api/integrations/notion/databases 应列出数据库', async () => {
    globalThis.fetch = mockFetch([
      {
        match: 'https://api.notion.com/v1/search',
        response: () =>
          jsonResponse({
            results: [
              { id: 'db-1', object: 'database', title: [{ plain_text: '任务库' }] },
            ],
            has_more: false,
          }),
      },
    ]);
    const res = await request(app)
      .get('/api/integrations/notion/databases')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(1);
    expect(res.body.results[0].id).toBe('db-1');
  });

  it('POST /api/integrations/notion/pages 应创建页面', async () => {
    globalThis.fetch = mockFetch([
      {
        match: 'https://api.notion.com/v1/pages',
        response: (url, options) => {
          const body = JSON.parse(options.body);
          return jsonResponse({
            id: 'new-page-id',
            object: 'page',
            properties: body.properties,
          });
        },
      },
    ]);
    const res = await request(app)
      .post('/api/integrations/notion/pages')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        parent: { database_id: 'db-1' },
        properties: { Name: { title: [{ text: { content: '新页面' } }] } },
      });
    expect(res.status).toBe(201);
    expect(res.body.id).toBe('new-page-id');
  });

  it('POST /api/integrations/notion/pages 缺少 parent 应 400', async () => {
    const res = await request(app)
      .post('/api/integrations/notion/pages')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ properties: {} });
    expect(res.status).toBe(400);
  });

  it('PUT /api/integrations/notion/pages/:id 应更新页面', async () => {
    globalThis.fetch = mockFetch([
      {
        match: 'https://api.notion.com/v1/pages/page-123',
        response: () => jsonResponse({ id: 'page-123', object: 'page' }),
      },
    ]);
    const res = await request(app)
      .put('/api/integrations/notion/pages/page-123')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ properties: { Name: { title: [{ text: { content: '更新后' } }] } } });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('page-123');
  });

  it('POST /api/integrations/notion/sync 应同步任务', async () => {
    // mock 查询数据库返回空，创建页面返回新 id
    globalThis.fetch = mockFetch([
      {
        match: 'https://api.notion.com/v1/databases/db-sync/query',
        response: () => jsonResponse({ results: [], has_more: false, next_cursor: null }),
      },
      {
        match: 'https://api.notion.com/v1/pages',
        response: (url, options) => {
          const body = JSON.parse(options.body);
          return jsonResponse({
            id: 'synced-page-' + Date.now(),
            object: 'page',
            properties: body.properties || {},
            last_edited_time: new Date().toISOString(),
          });
        },
      },
    ]);
    const res = await request(app)
      .post('/api/integrations/notion/sync')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        databaseId: 'db-sync',
        localTasks: [
          { id: 't1', title: '本地任务1', updatedAt: '2026-09-01T00:00:00.000Z' },
          { id: 't2', title: '本地任务2', updatedAt: '2026-09-01T00:00:00.000Z' },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.stats.pushed).toBe(2);
  });

  it('POST /api/integrations/notion/sync 缺少 databaseId 应 400', async () => {
    const res = await request(app)
      .post('/api/integrations/notion/sync')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ localTasks: [] });
    expect(res.status).toBe(400);
  });
});

// ==================== Todoist 集成测试 ====================

describe('Todoist 集成', () => {
  beforeEach(() => {
    storeToken('todoist', userId, { access_token: 'todoist-test-token' });
  });

  it('GET /api/integrations/todoist/tasks 应列出任务', async () => {
    globalThis.fetch = mockFetch([
      {
        match: 'https://api.todoist.com/rest/v2/tasks',
        response: () =>
          jsonResponse([
            { id: 't1', content: '任务1' },
            { id: 't2', content: '任务2' },
          ]),
      },
    ]);
    const res = await request(app)
      .get('/api/integrations/todoist/tasks')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  it('POST /api/integrations/todoist/tasks 应创建任务', async () => {
    globalThis.fetch = mockFetch([
      {
        match: 'https://api.todoist.com/rest/v2/tasks',
        response: (url, options) => {
          const body = JSON.parse(options.body);
          return jsonResponse({ id: 'new-task-id', content: body.content }, 201);
        },
      },
    ]);
    const res = await request(app)
      .post('/api/integrations/todoist/tasks')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ content: '新任务', projectId: 'p1' });
    expect(res.status).toBe(201);
    expect(res.body.id).toBe('new-task-id');
  });

  it('POST /api/integrations/todoist/tasks 缺少 content 应 400', async () => {
    const res = await request(app)
      .post('/api/integrations/todoist/tasks')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ projectId: 'p1' });
    expect(res.status).toBe(400);
  });

  it('PUT /api/integrations/todoist/tasks/:id 应更新任务', async () => {
    globalThis.fetch = mockFetch([
      {
        match: 'https://api.todoist.com/rest/v2/tasks/task-1',
        response: (url, options) => {
          const body = JSON.parse(options.body);
          return jsonResponse({ id: 'task-1', content: body.content });
        },
      },
    ]);
    const res = await request(app)
      .put('/api/integrations/todoist/tasks/task-1')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ content: '更新内容' });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('task-1');
  });

  it('DELETE /api/integrations/todoist/tasks/:id 应删除任务', async () => {
    globalThis.fetch = mockFetch([
      {
        match: 'https://api.todoist.com/rest/v2/tasks/task-1',
        response: () => jsonResponse(null, 204),
      },
    ]);
    const res = await request(app)
      .delete('/api/integrations/todoist/tasks/task-1')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('任务已删除');
  });

  it('GET /api/integrations/todoist/projects 应列出项目', async () => {
    globalThis.fetch = mockFetch([
      {
        match: 'https://api.todoist.com/rest/v2/projects',
        response: () =>
          jsonResponse([
            { id: 'p1', name: '工作' },
            { id: 'p2', name: '生活' },
          ]),
      },
    ]);
    const res = await request(app)
      .get('/api/integrations/todoist/projects')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  it('POST /api/integrations/todoist/sync 应同步项目', async () => {
    globalThis.fetch = mockFetch([
      {
        match: 'https://api.todoist.com/rest/v2/projects',
        response: () =>
          jsonResponse([{ id: 'p1', name: '工作' }]),
      },
    ]);
    const res = await request(app)
      .post('/api/integrations/todoist/sync')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.projects).toHaveLength(1);
    expect(res.body.stats.pulled).toBe(1);
  });
});

// ==================== Google Calendar 集成测试 ====================

describe('Google Calendar 集成', () => {
  beforeEach(() => {
    storeToken('google', userId, {
      access_token: 'google-test-token',
      refresh_token: 'google-refresh',
      expires_in: 3600,
    });
  });

  it('taskToEvent 应正确转换', () => {
    const event = taskToEvent({
      title: '日历任务',
      description: '描述',
      dueDate: '2026-09-03T10:00:00Z',
      durationMinutes: 60,
    });
    expect(event.summary).toBe('日历任务');
    expect(event.start.dateTime).toBe('2026-09-03T10:00:00Z');
    expect(event.description).toBe('描述');
  });

  it('GET /api/integrations/gcalendar/calendars 应列出日历', async () => {
    globalThis.fetch = mockFetch([
      {
        match: 'https://www.googleapis.com/calendar/v3/users/me/calendarList',
        response: () =>
          jsonResponse({
            items: [{ id: 'primary', summary: '主日历' }],
          }),
      },
    ]);
    const res = await request(app)
      .get('/api/integrations/gcalendar/calendars')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
  });

  it('GET /api/integrations/gcalendar/events 应列出事件', async () => {
    globalThis.fetch = mockFetch([
      {
        match: 'https://www.googleapis.com/calendar/v3/calendars/primary/events',
        response: () =>
          jsonResponse({
            items: [{ id: 'e1', summary: '事件1' }],
          }),
      },
    ]);
    const res = await request(app)
      .get('/api/integrations/gcalendar/events')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
  });

  it('POST /api/integrations/gcalendar/events 应创建事件', async () => {
    globalThis.fetch = mockFetch([
      {
        match: 'https://www.googleapis.com/calendar/v3/calendars/primary/events',
        response: (url, options) => {
          const body = JSON.parse(options.body);
          return jsonResponse({ id: 'new-event-id', summary: body.summary }, 201);
        },
      },
    ]);
    const res = await request(app)
      .post('/api/integrations/gcalendar/events')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        summary: '新事件',
        start: { dateTime: '2026-09-03T10:00:00Z' },
        end: { dateTime: '2026-09-03T11:00:00Z' },
      });
    expect(res.status).toBe(201);
    expect(res.body.id).toBe('new-event-id');
  });

  it('POST /api/integrations/gcalendar/events 缺少 summary 应 400', async () => {
    const res = await request(app)
      .post('/api/integrations/gcalendar/events')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ start: { dateTime: '2026-09-03T10:00:00Z' } });
    expect(res.status).toBe(400);
  });

  it('POST /api/integrations/gcalendar/events 缺少 start 应 400', async () => {
    const res = await request(app)
      .post('/api/integrations/gcalendar/events')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ summary: '无开始时间' });
    expect(res.status).toBe(400);
  });

  it('PUT /api/integrations/gcalendar/events/:id 应更新事件', async () => {
    globalThis.fetch = mockFetch([
      {
        match: 'https://www.googleapis.com/calendar/v3/calendars/primary/events/evt-1',
        response: (url, options) => {
          const body = JSON.parse(options.body);
          return jsonResponse({ id: 'evt-1', summary: body.summary });
        },
      },
    ]);
    const res = await request(app)
      .put('/api/integrations/gcalendar/events/evt-1')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ summary: '更新事件' });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('evt-1');
  });

  it('DELETE /api/integrations/gcalendar/events/:id 应删除事件', async () => {
    globalThis.fetch = mockFetch([
      {
        match: 'https://www.googleapis.com/calendar/v3/calendars/primary/events/evt-1',
        response: () => jsonResponse(null, 204),
      },
    ]);
    const res = await request(app)
      .delete('/api/integrations/gcalendar/events/evt-1')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('事件已删除');
  });

  it('POST /api/integrations/gcalendar/sync 应同步任务到日历', async () => {
    globalThis.fetch = mockFetch([
      {
        match: 'https://www.googleapis.com/calendar/v3/calendars/primary/events',
        response: (url, options) => {
          const body = JSON.parse(options.body);
          return jsonResponse({
            id: 'gcal-event-' + Date.now(),
            summary: body.summary,
          });
        },
      },
    ]);
    const res = await request(app)
      .post('/api/integrations/gcalendar/sync')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        calendarId: 'primary',
        localTasks: [
          { id: 't1', title: '任务1', dueDate: '2026-09-03T10:00:00Z' },
          { id: 't2', title: '任务2', dueDate: '2026-09-04T10:00:00Z' },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.stats.created).toBe(2);
  });
});

// ==================== 未授权场景 ====================

describe('未授权场景', () => {
  it('未授权 Notion 时调用 API 应 401/404', async () => {
    // 先撤销 notion
    storeToken('notion', userId, { access_token: 'to-be-revoked' });
    globalThis.fetch = mockFetch([
      { match: 'https://api.notion.com', response: () => jsonResponse({}, 204) },
    ]);
    await revokeToken('notion', userId);

    globalThis.fetch = mockFetch([
      {
        match: 'https://api.notion.com/v1/search',
        response: () => jsonResponse({ results: [] }),
      },
    ]);
    const res = await request(app)
      .get('/api/integrations/notion/databases')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(404);
  });
});