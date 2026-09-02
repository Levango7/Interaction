// 认证路由：注册/登录/刷新/个人资料/设备管理/登出
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db.js';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  refreshExpiresAt,
} from '../auth/jwt.js';
import { requireAuth } from '../middleware/auth.js';
import { createError } from '../middleware/error.js';

const router = Router();

// 密码哈希盐轮数
const SALT_ROUNDS = 10;
// 邮箱格式正则
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// 密码最少长度
const MIN_PASSWORD_LENGTH = 8;

/**
 * 校验注册入参
 * @returns {string|null} 错误消息，null 表示通过
 */
function validateRegister({ email, password, name }) {
  if (!email || !EMAIL_REGEX.test(email)) {
    return '邮箱格式不正确';
  }
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    return `密码长度至少 ${MIN_PASSWORD_LENGTH} 位`;
  }
  if (!name || !name.trim()) {
    return '用户名不能为空';
  }
  return null;
}

/**
 * 注册新用户
 * POST /api/auth/register
 * body: { email, password, name }
 */
router.post('/register', (req, res, next) => {
  try {
    const { email, password, name } = req.body || {};
    const invalid = validateRegister({ email, password, name });
    if (invalid) {
      return next(createError(400, invalid));
    }

    const db = getDb();

    // 检查邮箱是否已注册（不泄露具体原因）
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
    if (existing) {
      return next(createError(409, '该邮箱已被注册'));
    }

    const passwordHash = bcrypt.hashSync(password, SALT_ROUNDS);
    const now = new Date().toISOString();
    const userId = uuidv4();

    db.prepare(
      `INSERT INTO users (id, email, passwordHash, name, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(userId, email.toLowerCase(), passwordHash, name.trim(), now, now);

    return res.status(201).json({
      message: '注册成功',
      user: { id: userId, email: email.toLowerCase(), name: name.trim() },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * 登录
 * POST /api/auth/login
 * body: { email, password, deviceName? }
 * 返回 accessToken + refreshToken
 */
router.post('/login', (req, res, next) => {
  try {
    const { email, password, deviceName } = req.body || {};
    if (!email || !password) {
      return next(createError(400, '邮箱和密码不能为空'));
    }

    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());

    // 统一返回"邮箱或密码错误"，不泄露用户是否存在
    if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
      return next(createError(401, '邮箱或密码错误'));
    }

    const userId = user.id;
    const sessionId = uuidv4();
    const deviceId = uuidv4();
    const now = new Date().toISOString();

    // 签发令牌
    const accessToken = signAccessToken({ userId, email: user.email });
    const refreshToken = signRefreshToken({ userId, sessionId });

    // 持久化会话
    db.prepare(
      `INSERT INTO sessions (id, userId, refreshToken, expiresAt, createdAt)
       VALUES (?, ?, ?, ?, ?)`
    ).run(sessionId, userId, refreshToken, refreshExpiresAt(), now);

    // 记录登录设备
    db.prepare(
      `INSERT INTO devices (id, userId, deviceName, lastSeen, createdAt)
       VALUES (?, ?, ?, ?, ?)`
    ).run(deviceId, userId, deviceName || '未知设备', now, now);

    return res.json({
      accessToken,
      refreshToken,
      user: { id: userId, email: user.email, name: user.name },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * 刷新 accessToken
 * POST /api/auth/refresh
 * body: { refreshToken }
 */
router.post('/refresh', (req, res, next) => {
  try {
    const { refreshToken } = req.body || {};
    if (!refreshToken) {
      return next(createError(400, '缺少 refreshToken'));
    }

    const payload = verifyRefreshToken(refreshToken);
    if (!payload) {
      return next(createError(401, 'refreshToken 无效或已过期'));
    }

    const db = getDb();
    // 校验会话是否仍然存在（未被登出撤销）
    const session = db
      .prepare('SELECT * FROM sessions WHERE refreshToken = ?')
      .get(refreshToken);
    if (!session) {
      return next(createError(401, '会话已失效，请重新登录'));
    }

    const user = db.prepare('SELECT email FROM users WHERE id = ?').get(payload.userId);
    if (!user) {
      return next(createError(401, '用户不存在'));
    }

    const accessToken = signAccessToken({ userId: payload.userId, email: user.email });
    return res.json({ accessToken });
  } catch (err) {
    next(err);
  }
});

/**
 * 获取当前用户信息
 * GET /api/auth/me
 */
router.get('/me', requireAuth, (req, res, next) => {
  try {
    const db = getDb();
    const user = db
      .prepare('SELECT id, email, name, createdAt, updatedAt FROM users WHERE id = ?')
      .get(req.user.userId);
    if (!user) {
      return next(createError(404, '用户不存在'));
    }
    return res.json({ user });
  } catch (err) {
    next(err);
  }
});

/**
 * 更新个人资料
 * PUT /api/auth/me
 * body: { name?, email? }
 */
router.put('/me', requireAuth, (req, res, next) => {
  try {
    const { name, email } = req.body || {};
    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.userId);
    if (!user) {
      return next(createError(404, '用户不存在'));
    }

    const updates = [];
    const params = [];

    if (email !== undefined) {
      if (!EMAIL_REGEX.test(email)) {
        return next(createError(400, '邮箱格式不正确'));
      }
      const conflict = db
        .prepare('SELECT id FROM users WHERE email = ? AND id != ?')
        .get(email.toLowerCase(), user.id);
      if (conflict) {
        return next(createError(409, '该邮箱已被其他账号占用'));
      }
      updates.push('email = ?');
      params.push(email.toLowerCase());
    }

    if (name !== undefined) {
      if (!name.trim()) {
        return next(createError(400, '用户名不能为空'));
      }
      updates.push('name = ?');
      params.push(name.trim());
    }

    if (updates.length === 0) {
      return next(createError(400, '没有需要更新的字段'));
    }

    updates.push('updatedAt = ?');
    params.push(new Date().toISOString());
    params.push(user.id);

    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    const updated = db
      .prepare('SELECT id, email, name, createdAt, updatedAt FROM users WHERE id = ?')
      .get(user.id);
    return res.json({ user: updated });
  } catch (err) {
    next(err);
  }
});

/**
 * 获取设备列表
 * GET /api/auth/devices
 */
router.get('/devices', requireAuth, (req, res, next) => {
  try {
    const db = getDb();
    const devices = db
      .prepare('SELECT id, deviceName, lastSeen, createdAt FROM devices WHERE userId = ? ORDER BY createdAt DESC')
      .all(req.user.userId);
    return res.json({ devices });
  } catch (err) {
    next(err);
  }
});

/**
 * 删除指定设备
 * DELETE /api/auth/devices/:id
 */
router.delete('/devices/:id', requireAuth, (req, res, next) => {
  try {
    const db = getDb();
    const result = db
      .prepare('DELETE FROM devices WHERE id = ? AND userId = ?')
      .run(req.params.id, req.user.userId);
    if (result.changes === 0) {
      return next(createError(404, '设备不存在或不属于当前用户'));
    }
    return res.json({ message: '设备已删除' });
  } catch (err) {
    next(err);
  }
});

/**
 * 登出：撤销当前 refreshToken 对应的会话
 * POST /api/auth/logout
 * body: { refreshToken }
 */
router.post('/logout', (req, res, next) => {
  try {
    const { refreshToken } = req.body || {};
    if (!refreshToken) {
      return next(createError(400, '缺少 refreshToken'));
    }

    const db = getDb();
    db.prepare('DELETE FROM sessions WHERE refreshToken = ?').run(refreshToken);
    return res.json({ message: '已登出' });
  } catch (err) {
    next(err);
  }
});

export default router;