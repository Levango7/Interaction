// 认证系统端到端测试
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createApp } from '../src/index.js';
import { getDb, closeDb } from '../src/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 测试用临时数据库路径
const TMP_DB = join(__dirname, '..', 'data', 'test.db');
let app;

// 测试用户常量
const TEST_USER = {
  email: 'test@example.com',
  password: 'password123',
  name: '测试用户',
};

// 保存登录态：accessToken + refreshToken
let accessToken = '';
let refreshToken = '';

beforeAll(async () => {
  // 删除可能残留的测试数据库
  if (fs.existsSync(TMP_DB)) fs.unlinkSync(TMP_DB);
  // 指向测试数据库
  process.env.DB_PATH = TMP_DB;
  closeDb();
  getDb();
  app = createApp();
});

afterAll(async () => {
  closeDb();
  // 清理测试数据库文件
  for (const suffix of ['', '-wal', '-shm']) {
    const f = TMP_DB + suffix;
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
});

describe('健康检查', () => {
  it('GET /api/health 应返回 ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.timestamp).toBeDefined();
  });
});

describe('注册 POST /api/auth/register', () => {
  it('合法参数应注册成功', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send(TEST_USER);
    expect(res.status).toBe(201);
    expect(res.body.message).toBe('注册成功');
    expect(res.body.user.email).toBe(TEST_USER.email);
    expect(res.body.user.id).toBeDefined();
  });

  it('重复邮箱应返回 409', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send(TEST_USER);
    expect(res.status).toBe(409);
  });

  it('无效邮箱应返回 400', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'not-an-email', password: 'password123', name: '用户' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('邮箱');
  });

  it('密码过短应返回 400', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'short@example.com', password: '123', name: '用户' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('密码');
  });

  it('缺少用户名应返回 400', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'noname@example.com', password: 'password123', name: '' });
    expect(res.status).toBe(400);
  });
});

describe('登录 POST /api/auth/login', () => {
  it('正确凭据应返回双令牌', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: TEST_USER.email, password: TEST_USER.password, deviceName: '测试设备' });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
    expect(res.body.user.email).toBe(TEST_USER.email);
    accessToken = res.body.accessToken;
    refreshToken = res.body.refreshToken;
  });

  it('错误密码应返回 401 且不泄露用户存在性', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: TEST_USER.email, password: 'wrongpassword' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('邮箱或密码错误');
  });

  it('不存在的用户应返回相同的错误消息', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'password123' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('邮箱或密码错误');
  });

  it('缺少字段应返回 400', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: TEST_USER.email });
    expect(res.status).toBe(400);
  });
});

describe('刷新令牌 POST /api/auth/refresh', () => {
  it('有效 refreshToken 应返回新 accessToken', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    accessToken = res.body.accessToken;
  });

  it('无效 refreshToken 应返回 401', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: 'invalid.token.here' });
    expect(res.status).toBe(401);
  });

  it('缺少 refreshToken 应返回 400', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({});
    expect(res.status).toBe(400);
  });
});

describe('个人资料 GET /api/auth/me', () => {
  it('携带有效 token 应返回当前用户', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(TEST_USER.email);
    expect(res.body.user.name).toBe(TEST_USER.name);
  });

  it('无 token 应返回 401', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('无效 token 应返回 401', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer invalid.token.here');
    expect(res.status).toBe(401);
  });
});

describe('更新资料 PUT /api/auth/me', () => {
  it('更新 name 应成功', async () => {
    const res = await request(app)
      .put('/api/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: '新名字' });
    expect(res.status).toBe(200);
    expect(res.body.user.name).toBe('新名字');
  });

  it('更新为空 name 应返回 400', async () => {
    const res = await request(app)
      .put('/api/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: '   ' });
    expect(res.status).toBe(400);
  });

  it('无 token 应返回 401', async () => {
    const res = await request(app)
      .put('/api/auth/me')
      .send({ name: '无token' });
    expect(res.status).toBe(401);
  });
});

describe('设备管理', () => {
  it('GET /api/auth/devices 应返回设备列表', async () => {
    const res = await request(app)
      .get('/api/auth/devices')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.devices)).toBe(true);
    expect(res.body.devices.length).toBeGreaterThan(0);
  });

  it('DELETE /api/auth/devices/:id 应删除设备', async () => {
    // 先获取设备列表
    const listRes = await request(app)
      .get('/api/auth/devices')
      .set('Authorization', `Bearer ${accessToken}`);
    const deviceId = listRes.body.devices[0].id;

    const res = await request(app)
      .delete(`/api/auth/devices/${deviceId}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('设备已删除');
  });

  it('删除不存在的设备应返回 404', async () => {
    const res = await request(app)
      .delete('/api/auth/devices/non-existent-id')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(404);
  });
});

describe('登出 POST /api/auth/logout', () => {
  it('登出后 refreshToken 应失效', async () => {
    // 登出
    const logoutRes = await request(app)
      .post('/api/auth/logout')
      .send({ refreshToken });
    expect(logoutRes.status).toBe(200);

    // 刷新应失败
    const refreshRes = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken });
    expect(refreshRes.status).toBe(401);
  });

  it('缺少 refreshToken 应返回 400', async () => {
    const res = await request(app)
      .post('/api/auth/logout')
      .send({});
    expect(res.status).toBe(400);
  });
});

describe('404 与兜底', () => {
  it('未知路径应返回 404', async () => {
    const res = await request(app).get('/api/unknown');
    expect(res.status).toBe(404);
  });
});