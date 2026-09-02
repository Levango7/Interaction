// 通知服务端到端测试
// 覆盖：邮件发送（mock nodemailer）、Web Push 订阅/推送（mock web-push）、
//       定时提醒 CRUD、通知偏好 CRUD
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// mock 记录
let sendMailCalls = [];
let sendNotificationCalls = [];

// 顶部 mock nodemailer：避免导出属性不可重定义的问题
vi.mock('nodemailer', () => {
  return {
    default: {
      createTransport: () => ({
        sendMail: async (opts) => {
          sendMailCalls.push(opts);
          return { messageId: '<test-id@nexus>', response: '250 OK' };
        },
        close: () => {},
      }),
    },
  };
});

// 顶部 mock web-push：sendNotification 改为记录调用
vi.mock('web-push', () => {
  return {
    default: {
      generateVAPIDKeys: () => ({
        publicKey: 'BMpYx...test-public-key-base64url',
        privateKey: 'test-private-key-base64url',
      }),
      setVapidDetails: () => {},
      sendNotification: async (sub, payload) => {
        sendNotificationCalls.push({ sub, payload });
        return { statusCode: 201, body: 'ok' };
      },
    },
  };
});

// mock 确立后再 import 被测模块
const { createApp } = await import('../src/index.js');
const { getDb, closeDb } = await import('../src/db.js');
const emailService = await import('../src/services/email.js');
const pushService = await import('../src/services/push.js');
const schedulerService = await import('../src/services/scheduler.js');

// 测试用临时数据库路径
const TMP_DB = join(__dirname, '..', 'data', 'test-notify.db');
let app;

// 测试用户常量
const TEST_USER = {
  email: 'notify-test@example.com',
  password: 'password123',
  name: '通知测试用户',
};

// 登录态
let accessToken = '';
let userId = '';

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
  userId = loginRes.body.user.id;
});

afterAll(async () => {
  schedulerService.stopAll();
  closeDb();
  for (const suffix of ['', '-wal', '-shm']) {
    const f = TMP_DB + suffix;
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
  vi.restoreAllMocks();
});

// ============================================================
// 1. 通知偏好 CRUD
// ============================================================
describe('通知偏好 GET/PUT /api/notifications/preferences', () => {
  it('未认证应返回 401', async () => {
    const res = await request(app).get('/api/notifications/preferences');
    expect(res.status).toBe(401);
  });

  it('首次获取应返回默认偏好', async () => {
    const res = await request(app)
      .get('/api/notifications/preferences')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    const prefs = res.body.preferences;
    expect(prefs.taskDue).toBeDefined();
    expect(prefs.taskDue.email).toBe(true);
    expect(prefs.habitBroken).toBeDefined();
    expect(prefs.dailyDigest).toBeDefined();
  });

  it('更新 taskDue 偏好应成功', async () => {
    const res = await request(app)
      .put('/api/notifications/preferences')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ taskDue: { email: false, push: true, local: false } });
    expect(res.status).toBe(200);
    expect(res.body.preferences.taskDue.email).toBe(false);
    expect(res.body.preferences.taskDue.push).toBe(true);
    expect(res.body.preferences.taskDue.local).toBe(false);
  });

  it('更新后的偏好应持久化', async () => {
    const res = await request(app)
      .get('/api/notifications/preferences')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.body.preferences.taskDue.email).toBe(false);
  });

  it('部分更新不应覆盖其他类型偏好', async () => {
    const res = await request(app)
      .put('/api/notifications/preferences')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ dailyDigest: { email: true, push: true, local: true } });
    expect(res.status).toBe(200);
    // taskDue 仍保持上一次设置
    expect(res.body.preferences.taskDue.push).toBe(true);
    expect(res.body.preferences.dailyDigest.local).toBe(true);
  });
});

// ============================================================
// 2. 邮件通知（mock nodemailer）
// ============================================================
describe('邮件通知服务', () => {
  beforeEach(() => {
    sendMailCalls = [];
  });

  it('未配置 SMTP 时 sendMail 应抛错', async () => {
    // 确保没有 SMTP 配置
    const db = getDb();
    db.prepare('DELETE FROM user_settings WHERE userId = ? AND key = ?')
      .run(userId, emailService.SMTP_SETTINGS_KEY);

    await expect(emailService.sendMail(userId, { to: 'x@y.com', subject: 't' }))
      .rejects.toThrow(/未配置 SMTP/);
  });

  it('SMTP 配置应可持久化与读取', () => {
    const cfg = { host: 'smtp.test.com', port: 587, secure: false, user: 'u', pass: 'p' };
    emailService.setSmtpConfig(userId, cfg);
    const got = emailService.getSmtpConfig(userId);
    expect(got.host).toBe('smtp.test.com');
    expect(got.user).toBe('u');
  });

  it('邮件模板应生成正确内容', () => {
    const t = emailService.templateTaskDue({ taskTitle: '写报告', dueAt: '2026-09-03 18:00' });
    expect(t.subject).toContain('写报告');
    expect(t.html).toContain('写报告');
    expect(t.text).toContain('2026-09-03 18:00');

    const h = emailService.templateHabitBroken({ habitName: '晨跑', lastDoneAt: '2026-09-01', streakDays: 5 });
    expect(h.subject).toContain('晨跑');
    expect(h.text).toContain('5');

    const d = emailService.templateDailyDigest({
      date: '2026-09-03',
      tasks: [{ title: 'A', dueAt: '18:00' }],
      habits: [{ name: '晨跑', done: true }],
    });
    expect(d.subject).toContain('2026-09-03');
    expect(d.html).toContain('A');
    expect(d.html).toContain('晨跑');
  });

  it('GET /email/smtp 应返回脱敏配置', async () => {
    const res = await request(app)
      .get('/api/notifications/email/smtp')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.smtp.host).toBe('smtp.test.com');
    expect(res.body.smtp).not.toHaveProperty('pass');
    expect(res.body.smtp.hasPassword).toBe(true);
  });

  it('PUT /email/smtp 缺 host 应返回 400', async () => {
    const res = await request(app)
      .put('/api/notifications/email/smtp')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ port: 587 });
    expect(res.status).toBe(400);
  });

  it('POST /email/test 应通过 mock transport 发送邮件', async () => {
    const res = await request(app)
      .post('/api/notifications/email/test')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ to: 'recipient@example.com' });
    expect(res.status).toBe(200);
    expect(res.body.messageId).toBeDefined();
    expect(sendMailCalls.length).toBe(1);
    expect(sendMailCalls[0].to).toBe('recipient@example.com');
    expect(sendMailCalls[0].subject).toContain('测试邮件');
  });

  it('POST /email/test 未配置 SMTP 应返回 500', async () => {
    // 清除 SMTP 配置
    const db = getDb();
    db.prepare('DELETE FROM user_settings WHERE userId = ? AND key = ?')
      .run(userId, emailService.SMTP_SETTINGS_KEY);

    const res = await request(app)
      .post('/api/notifications/email/test')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({});
    expect(res.status).toBe(500);
  });
});

// ============================================================
// 3. Web Push（mock web-push）
// ============================================================
describe('Web Push 服务', () => {
  beforeEach(() => {
    sendNotificationCalls = [];
  });

  it('应能生成 VAPID 密钥对', () => {
    const keys = pushService.generateVapidKeys();
    expect(keys.publicKey).toBeTruthy();
    expect(keys.privateKey).toBeTruthy();
    expect(typeof keys.publicKey).toBe('string');
  });

  it('getVapidPublicKey 应返回非空字符串', () => {
    const k = pushService.getVapidPublicKey();
    expect(typeof k).toBe('string');
    expect(k.length).toBeGreaterThan(0);
  });

  it('GET /push/vapid-public 应返回公钥', async () => {
    const res = await request(app)
      .get('/api/notifications/push/vapid-public')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.publicKey).toBeTruthy();
  });

  it('POST /push/subscribe 缺 endpoint 应返回 400', async () => {
    const res = await request(app)
      .post('/api/notifications/push/subscribe')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ keys: { p256dh: 'x', auth: 'y' } });
    expect(res.status).toBe(400);
  });

  it('完整订阅应成功', async () => {
    const sub = {
      endpoint: 'https://push.example.com/subscribe/abc',
      keys: { p256dh: 'p256dh-value', auth: 'auth-value' },
    };
    const res = await request(app)
      .post('/api/notifications/push/subscribe')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(sub);
    expect(res.status).toBe(201);
    expect(res.body.subscription.endpoint).toBe(sub.endpoint);
  });

  it('重复订阅同 endpoint 应复用', async () => {
    const sub = {
      endpoint: 'https://push.example.com/subscribe/abc',
      keys: { p256dh: 'p256dh-value', auth: 'auth-value' },
    };
    const res = await request(app)
      .post('/api/notifications/push/subscribe')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(sub);
    expect(res.status).toBe(201);
    expect(res.body.subscription.reused).toBe(true);
  });

  it('GET /push/subscriptions 应列出订阅', async () => {
    const res = await request(app)
      .get('/api/notifications/push/subscriptions')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.subscriptions.length).toBeGreaterThan(0);
    expect(res.body.subscriptions[0].keys.p256dh).toBe('p256dh-value');
  });

  it('POST /push/test 无订阅用户应返回 404', async () => {
    // 临时注册一个无订阅用户
    const altUser = { email: 'no-sub@example.com', password: 'password123', name: '无订阅' };
    await request(app).post('/api/auth/register').send(altUser);
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: altUser.email, password: altUser.password });
    const res = await request(app)
      .post('/api/notifications/push/test')
      .set('Authorization', `Bearer ${login.body.accessToken}`);
    expect(res.status).toBe(404);
  });

  it('POST /push/test 有订阅时应通过 mock 发送推送', async () => {
    const res = await request(app)
      .post('/api/notifications/push/test')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ payload: { title: '测试' } });
    expect(res.status).toBe(200);
    expect(res.body.results.length).toBeGreaterThan(0);
    expect(res.body.results[0].success).toBe(true);
    expect(sendNotificationCalls.length).toBeGreaterThan(0);
  });

  it('POST /push/unsubscribe 应取消订阅', async () => {
    const res = await request(app)
      .post('/api/notifications/push/unsubscribe')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ endpoint: 'https://push.example.com/subscribe/abc' });
    expect(res.status).toBe(200);
  });

  it('取消后再取消应返回 404', async () => {
    const res = await request(app)
      .post('/api/notifications/push/unsubscribe')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ endpoint: 'https://push.example.com/subscribe/abc' });
    expect(res.status).toBe(404);
  });
});

// ============================================================
// 4. 定时提醒 CRUD
// ============================================================
describe('定时提醒 CRUD', () => {
  let scheduleId = '';

  it('isValidCron 应正确校验', () => {
    expect(schedulerService.isValidCron('0 9 * * *')).toBe(true);
    expect(schedulerService.isValidCron('invalid')).toBe(false);
  });

  it('GET /schedules 空列表应返回数组', async () => {
    const res = await request(app)
      .get('/api/notifications/schedules')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.schedules)).toBe(true);
  });

  it('POST /schedules 合法参数应创建', async () => {
    const res = await request(app)
      .post('/api/notifications/schedules')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ type: 'task-due', cron: '0 9 * * *', config: { leadMinutes: 30 } });
    expect(res.status).toBe(201);
    expect(res.body.schedule.id).toBeDefined();
    expect(res.body.schedule.type).toBe('task-due');
    expect(res.body.schedule.enabled).toBe(true);
    expect(res.body.schedule.config.leadMinutes).toBe(30);
    scheduleId = res.body.schedule.id;
  });

  it('POST /schedules 非法 cron 应返回 400', async () => {
    const res = await request(app)
      .post('/api/notifications/schedules')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ type: 'task-due', cron: 'not-a-cron' });
    expect(res.status).toBe(400);
  });

  it('POST /schedules 非法 type 应返回 400', async () => {
    const res = await request(app)
      .post('/api/notifications/schedules')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ type: 'unknown', cron: '0 9 * * *' });
    expect(res.status).toBe(400);
  });

  it('POST /schedules 缺 type 应返回 400', async () => {
    const res = await request(app)
      .post('/api/notifications/schedules')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ cron: '0 9 * * *' });
    expect(res.status).toBe(400);
  });

  it('PUT /schedules/:id 应更新 enabled', async () => {
    const res = await request(app)
      .put(`/api/notifications/schedules/${scheduleId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ enabled: false });
    expect(res.status).toBe(200);
    expect(res.body.schedule.enabled).toBe(false);
  });

  it('PUT /schedules/:id 应更新 cron', async () => {
    const res = await request(app)
      .put(`/api/notifications/schedules/${scheduleId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ cron: '*/30 * * * *' });
    expect(res.status).toBe(200);
    expect(res.body.schedule.cron).toBe('*/30 * * * *');
  });

  it('PUT /schedules/:id 不存在 ID 应返回 404', async () => {
    const res = await request(app)
      .put('/api/notifications/schedules/non-existent')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ enabled: true });
    expect(res.status).toBe(404);
  });

  it('GET /schedules 应包含已创建的提醒', async () => {
    const res = await request(app)
      .get('/api/notifications/schedules')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.body.schedules.find((s) => s.id === scheduleId)).toBeTruthy();
  });

  it('DELETE /schedules/:id 应删除', async () => {
    const res = await request(app)
      .delete(`/api/notifications/schedules/${scheduleId}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
  });

  it('DELETE 不存在的 ID 应返回 404', async () => {
    const res = await request(app)
      .delete('/api/notifications/schedules/non-existent')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(404);
  });

  it('删除后 GET /schedules 不应再包含该提醒', async () => {
    const res = await request(app)
      .get('/api/notifications/schedules')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.body.schedules.find((s) => s.id === scheduleId)).toBeFalsy();
  });
});

// ============================================================
// 5. 服务层直接测试
// ============================================================
describe('服务层直接调用', () => {
  it('email.escapeHtml 应转义特殊字符', () => {
    expect(emailService.escapeHtml('<script>')).toBe('&lt;script&gt;');
    expect(emailService.escapeHtml('"a"')).toBe('&quot;a&quot;');
  });

  it('scheduler.createSchedule + listSchedules 应一致', () => {
    const s = schedulerService.createSchedule(userId, {
      type: 'daily-digest',
      cron: '0 8 * * *',
      enabled: true,
    });
    const list = schedulerService.listSchedules(userId);
    expect(list.find((x) => x.id === s.id)).toBeTruthy();
    // 清理
    schedulerService.deleteSchedule(userId, s.id);
  });

  it('scheduler.startTask + stopTask 应正常工作', () => {
    const s = schedulerService.createSchedule(userId, {
      type: 'custom',
      cron: '0 0 * * *',
      enabled: true,
    });
    const task = schedulerService.startTask(s);
    expect(task).toBeTruthy();
    expect(schedulerService.isRunning(s.id)).toBe(true);
    schedulerService.stopTask(s.id);
    expect(schedulerService.isRunning(s.id)).toBe(false);
    schedulerService.deleteSchedule(userId, s.id);
  });

  it('push.subscribe + unsubscribe 服务层调用', () => {
    const sub = {
      endpoint: 'https://push.example.com/svc-layer',
      keys: { p256dh: 'p', auth: 'a' },
    };
    const result = pushService.subscribe(userId, sub);
    expect(result.id).toBeDefined();
    const ok = pushService.unsubscribe(userId, sub.endpoint);
    expect(ok).toBe(true);
    const ok2 = pushService.unsubscribe(userId, sub.endpoint);
    expect(ok2).toBe(false);
  });
});