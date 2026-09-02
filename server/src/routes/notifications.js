// 通知路由：邮件 / Web Push / 定时提醒 / 通知偏好
import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { createError } from '../middleware/error.js';
import * as emailService from '../services/email.js';
import * as pushService from '../services/push.js';
import * as schedulerService from '../services/scheduler.js';

const router = Router();

// user_settings 中存储通知偏好的 key
const NOTIFICATION_PREFERENCES_KEY = 'notificationPreferences';

// 默认通知偏好：每种通知类型对应渠道开关
const DEFAULT_PREFERENCES = {
  taskDue: { email: true, push: true, local: true },
  habitBroken: { email: true, push: true, local: true },
  dailyDigest: { email: true, push: false, local: false },
};

// 所有路由都需要认证
router.use(requireAuth);

// ============================================================
// 1. 通知偏好
// ============================================================

/**
 * 读取通知偏好
 * GET /api/notifications/preferences
 */
router.get('/preferences', (req, res, next) => {
  try {
    const prefs = getPreferences(req.user.userId);
    return res.json({ preferences: prefs });
  } catch (err) {
    next(err);
  }
});

/**
 * 更新通知偏好
 * PUT /api/notifications/preferences
 * body: { taskDue?: { email, push, local }, habitBroken?: ..., dailyDigest?: ... }
 */
router.put('/preferences', (req, res, next) => {
  try {
    const current = getPreferences(req.user.userId);
    const incoming = req.body || {};
    const merged = { ...current };
    for (const key of Object.keys(DEFAULT_PREFERENCES)) {
      if (incoming[key] && typeof incoming[key] === 'object') {
        merged[key] = {
          email: !!incoming[key].email,
          push: !!incoming[key].push,
          local: !!incoming[key].local,
        };
      }
    }
    setPreferences(req.user.userId, merged);
    return res.json({ preferences: merged });
  } catch (err) {
    next(err);
  }
});

/**
 * 从 user_settings 读取通知偏好，缺失则返回默认值
 */
function getPreferences(userId) {
  const db = getDb();
  const row = db
    .prepare('SELECT value FROM user_settings WHERE userId = ? AND key = ?')
    .get(userId, NOTIFICATION_PREFERENCES_KEY);
  if (row && row.value) {
    try {
      return { ...DEFAULT_PREFERENCES, ...JSON.parse(row.value) };
    } catch {
      // 损坏数据则回退默认
    }
  }
  return { ...DEFAULT_PREFERENCES };
}

/**
 * 持久化通知偏好
 */
function setPreferences(userId, prefs) {
  const db = getDb();
  const now = new Date().toISOString();
  const value = JSON.stringify(prefs);
  const existing = db
    .prepare('SELECT id FROM user_settings WHERE userId = ? AND key = ?')
    .get(userId, NOTIFICATION_PREFERENCES_KEY);
  if (existing) {
    db.prepare('UPDATE user_settings SET value = ?, updatedAt = ? WHERE id = ?')
      .run(value, now, existing.id);
  } else {
    db.prepare(
      'INSERT INTO user_settings (id, userId, key, value, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(uuidv4(), userId, NOTIFICATION_PREFERENCES_KEY, value, now, now);
  }
}

// ============================================================
// 2. 邮件通知
// ============================================================

/**
 * 发送测试邮件
 * POST /api/notifications/email/test
 * body: { to?, smtpConfig? } - 不传 smtpConfig 时使用已保存配置
 */
router.post('/email/test', async (req, res, next) => {
  try {
    const { to, smtpConfig } = req.body || {};
    const target = to || req.user.email;
    // 临时覆盖 SMTP 配置（仅本次请求）
    if (smtpConfig) {
      emailService.setSmtpConfig(req.user.userId, smtpConfig);
    }
    const info = await emailService.sendMail(req.user.userId, {
      to: target,
      subject: '【Nexus Interaction】测试邮件',
      text: '这是一封来自 Nexus Interaction 的测试邮件。',
      html: `<div style="font-family:sans-serif;"><h2>测试邮件</h2><p>这是一封来自 Nexus Interaction 的测试邮件。</p><p>时间：${new Date().toISOString()}</p></div>`,
    });
    return res.json({ message: '测试邮件已发送', messageId: info.messageId, to: target });
  } catch (err) {
    next(err);
  }
});

/**
 * 保存 SMTP 配置
 * PUT /api/notifications/email/smtp
 * body: { host, port, secure, user, pass }
 */
router.put('/email/smtp', (req, res, next) => {
  try {
    const { host, port, secure, user, pass } = req.body || {};
    if (!host) return next(createError(400, 'SMTP host 不能为空'));
    emailService.setSmtpConfig(req.user.userId, { host, port, secure, user, pass });
    return res.json({ message: 'SMTP 配置已保存' });
  } catch (err) {
    next(err);
  }
});

/**
 * 获取 SMTP 配置（脱敏：不返回 pass）
 * GET /api/notifications/email/smtp
 */
router.get('/email/smtp', (req, res, next) => {
  try {
    const cfg = emailService.getSmtpConfig(req.user.userId);
    if (!cfg) return res.json({ smtp: null });
    return res.json({
      smtp: {
        host: cfg.host,
        port: cfg.port,
        secure: cfg.secure,
        user: cfg.user,
        hasPassword: !!cfg.pass,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// 3. Web Push
// ============================================================

/**
 * 获取 VAPID 公钥
 * GET /api/notifications/push/vapid-public
 */
router.get('/push/vapid-public', (req, res, next) => {
  try {
    const publicKey = pushService.getVapidPublicKey();
    return res.json({ publicKey });
  } catch (err) {
    next(err);
  }
});

/**
 * 订阅推送
 * POST /api/notifications/push/subscribe
 * body: { endpoint, keys: { p256dh, auth } }
 */
router.post('/push/subscribe', (req, res, next) => {
  try {
    const subscription = req.body;
    if (!subscription || !subscription.endpoint || !subscription.keys) {
      return next(createError(400, '订阅信息不完整：需要 endpoint 与 keys'));
    }
    const result = pushService.subscribe(req.user.userId, subscription);
    return res.status(201).json({ message: '订阅成功', subscription: result });
  } catch (err) {
    next(err);
  }
});

/**
 * 取消订阅
 * POST /api/notifications/push/unsubscribe
 * body: { endpoint }
 */
router.post('/push/unsubscribe', (req, res, next) => {
  try {
    const { endpoint } = req.body || {};
    if (!endpoint) return next(createError(400, '缺少 endpoint'));
    const ok = pushService.unsubscribe(req.user.userId, endpoint);
    if (!ok) return next(createError(404, '订阅不存在或不属于当前用户'));
    return res.json({ message: '已取消订阅' });
  } catch (err) {
    next(err);
  }
});

/**
 * 列出当前用户的所有订阅
 * GET /api/notifications/push/subscriptions
 */
router.get('/push/subscriptions', (req, res, next) => {
  try {
    const subs = pushService.listSubscriptions(req.user.userId);
    return res.json({ subscriptions: subs });
  } catch (err) {
    next(err);
  }
});

/**
 * 发送测试推送
 * POST /api/notifications/push/test
 * body: { payload? }
 */
router.post('/push/test', async (req, res, next) => {
  try {
    const payload = req.body?.payload || {
      title: '测试推送',
      body: '来自 Nexus Interaction 的测试通知',
      timestamp: new Date().toISOString(),
    };
    const results = await pushService.sendToUser(req.user.userId, payload);
    if (results.length === 0) {
      return next(createError(404, '当前用户没有推送订阅，请先订阅'));
    }
    return res.json({ message: '测试推送已发送', results });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// 4. 定时提醒
// ============================================================

/**
 * 获取定时提醒列表
 * GET /api/notifications/schedules
 */
router.get('/schedules', (req, res, next) => {
  try {
    const schedules = schedulerService.listSchedules(req.user.userId);
    return res.json({ schedules });
  } catch (err) {
    next(err);
  }
});

/**
 * 创建定时提醒
 * POST /api/notifications/schedules
 * body: { type, cron, enabled?, config? }
 */
router.post('/schedules', (req, res, next) => {
  try {
    const { type, cron: cronExpr, enabled, config } = req.body || {};
    if (!type) return next(createError(400, '缺少 type'));
    if (!cronExpr) return next(createError(400, '缺少 cron 表达式'));
    try {
      const schedule = schedulerService.createSchedule(req.user.userId, {
        type, cron: cronExpr, enabled, config,
      });
      // 立即注册到调度器
      if (schedule.enabled) schedulerService.startTask(schedule);
      return res.status(201).json({ schedule });
    } catch (err) {
      return next(createError(400, err.message));
    }
  } catch (err) {
    next(err);
  }
});

/**
 * 更新定时提醒
 * PUT /api/notifications/schedules/:id
 * body: { type?, cron?, enabled?, config? }
 */
router.put('/schedules/:id', (req, res, next) => {
  try {
    const { id } = req.params;
    try {
      const updated = schedulerService.updateSchedule(req.user.userId, id, req.body || {});
      if (!updated) return next(createError(404, '提醒不存在或不属于当前用户'));
      // 同步调度器状态
      if (updated.enabled && !schedulerService.isRunning(id)) {
        schedulerService.startTask(updated);
      } else if (!updated.enabled) {
        schedulerService.stopTask(id);
      }
      return res.json({ schedule: updated });
    } catch (err) {
      return next(createError(400, err.message));
    }
  } catch (err) {
    next(err);
  }
});

/**
 * 删除定时提醒
 * DELETE /api/notifications/schedules/:id
 */
router.delete('/schedules/:id', (req, res, next) => {
  try {
    const ok = schedulerService.deleteSchedule(req.user.userId, req.params.id);
    if (!ok) return next(createError(404, '提醒不存在或不属于当前用户'));
    return res.json({ message: '提醒已删除' });
  } catch (err) {
    next(err);
  }
});

export default router;