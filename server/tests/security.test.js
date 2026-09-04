// 服务端安全机制测试：登录失败锁定、auth 总节流、CORS 白名单
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createApp } from '../src/index.js';
import { getDb, closeDb } from '../src/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TMP_DB = join(__dirname, '..', 'data', 'test-security.db');
const LOCK_USER = { email: 'lock@example.com', password: 'password123', name: '锁定测试' };

let app;

beforeAll(() => {
  if (fs.existsSync(TMP_DB)) fs.unlinkSync(TMP_DB);
  process.env.DB_PATH = TMP_DB;
  // 收紧阈值便于测试触发；CORS 白名单含一个可信外部 Origin
  process.env.LOGIN_MAX_FAILURES = '3';
  process.env.CORS_ORIGINS = 'https://trusted.example.com';
  closeDb();
  getDb();
  app = createApp();
});

afterAll(() => {
  closeDb();
  delete process.env.LOGIN_MAX_FAILURES;
  delete process.env.CORS_ORIGINS;
  for (const suffix of ['', '-wal', '-shm']) {
    const f = TMP_DB + suffix;
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
});

describe('登录失败锁定 POST /api/auth/login', () => {
  beforeAll(async () => {
    const res = await request(app).post('/api/auth/register').send(LOCK_USER);
    expect(res.status).toBe(201);
  });

  it('连续失败达到阈值前的请求仍正常返回 401', async () => {
    for (let i = 0; i < 2; i += 1) {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: LOCK_USER.email, password: 'wrong-password' });
      expect(res.status).toBe(401);
    }
  });

  it('失败达到阈值后，即使密码正确也返回 429 + Retry-After', async () => {
    // 第 3 次失败（达到阈值 3），响应本身仍为 401，随后进入锁定期
    const third = await request(app)
      .post('/api/auth/login')
      .send({ email: LOCK_USER.email, password: 'wrong-password' });
    expect(third.status).toBe(401);

    const locked = await request(app)
      .post('/api/auth/login')
      .send({ email: LOCK_USER.email, password: LOCK_USER.password });
    expect(locked.status).toBe(429);
    expect(locked.body.error).toContain('频繁');
    expect(Number(locked.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('不同邮箱不受同一 IP 下其他邮箱锁定的影响', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'other-user@example.com', password: 'whatever' });
    expect(res.status).toBe(401); // 未被锁定，正常走认证失败
  });
});

describe('auth 总节流', () => {
  it('超过 AUTH_RATE_MAX 后返回 429', async () => {
    // 用独立 app 实例设置极小阈值；env 在 createApp 调用时读取
    process.env.AUTH_RATE_MAX = '5';
    const throttledApp = createApp();
    let last;
    for (let i = 0; i < 7; i += 1) {
      last = await request(throttledApp).get('/api/auth/me');
    }
    expect(last.status).toBe(429);
    expect(Number(last.headers['retry-after'])).toBeGreaterThan(0);
    delete process.env.AUTH_RATE_MAX;
  });
});

describe('CORS 白名单', () => {
  it('白名单外 Origin 不返回 CORS 头', async () => {
    const res = await request(app).get('/api/health').set('Origin', 'https://evil.example.com');
    expect(res.status).toBe(200); // 请求本身可达（服务器不充当防火墙）
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('localhost 任意端口放行', async () => {
    const res = await request(app).get('/api/health').set('Origin', 'http://localhost:5173');
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  it('127.0.0.1 放行', async () => {
    const res = await request(app).get('/api/health').set('Origin', 'http://127.0.0.1:8080');
    expect(res.headers['access-control-allow-origin']).toBe('http://127.0.0.1:8080');
  });

  it('CORS_ORIGINS 白名单命中的外部 Origin 放行', async () => {
    const res = await request(app).get('/api/health').set('Origin', 'https://trusted.example.com');
    expect(res.headers['access-control-allow-origin']).toBe('https://trusted.example.com');
  });

  it('预检请求：白名单外 Origin 不返回 CORS 头', async () => {
    const res = await request(app)
      .options('/api/auth/me')
      .set('Origin', 'https://evil.example.com')
      .set('Access-Control-Request-Method', 'GET');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('预检请求：白名单内 Origin 返回允许的方法', async () => {
    const res = await request(app)
      .options('/api/auth/me')
      .set('Origin', 'https://trusted.example.com')
      .set('Access-Control-Request-Method', 'GET');
    expect(res.headers['access-control-allow-origin']).toBe('https://trusted.example.com');
    expect(res.headers['access-control-allow-methods']).toContain('GET');
  });
});
