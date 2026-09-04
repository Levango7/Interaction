// Express 应用入口：注册中间件与路由
import express from 'express';
import cors from 'cors';
import { getDb, closeDb } from './db.js';
import authRoutes from './routes/auth.js';
import healthRoutes from './routes/health.js';
import notificationRoutes from './routes/notifications.js';
import integrationRoutes from './routes/integrations.js';
import { notFoundHandler, errorHandler } from './middleware/error.js';
import { createRateLimiter } from './middleware/rate-limit.js';
import { getSecretIssues } from './auth/jwt.js';

// CORS 白名单策略：
// 1) 无 Origin（同源请求、curl、服务间调用）→ 放行；
// 2) localhost / 127.0.0.1（任意端口）→ 放行，便于本地开发调试；
// 3) 命中 CORS_ORIGINS（逗号分隔的完整 Origin）→ 放行；
// 4) 其余 Origin → 不返回 CORS 头（浏览器将拦截跨域响应）。
const corsOptions = {
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    const allowList = (process.env.CORS_ORIGINS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (allowList.includes(origin)) return callback(null, true);
    try {
      const { hostname } = new URL(origin);
      if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return callback(null, true);
      }
    } catch {
      // 非法 Origin，走拒绝分支
    }
    return callback(null, false);
  },
};

/**
 * 创建 Express 应用实例
 * 抽离为函数便于测试复用；限流阈值可在调用前通过环境变量覆盖
 */
export function createApp() {
  const app = express();

  // 限流配置（环境变量可覆盖，均有安全默认值）
  const windowMs = Number(process.env.RATE_WINDOW_MS) || 15 * 60 * 1000; // 15 分钟
  const authMax = Number(process.env.AUTH_RATE_MAX) || 60; // auth 总节流：60 次/窗口/IP
  const loginMaxFailures = Number(process.env.LOGIN_MAX_FAILURES) || 5; // 登录失败锁定：5 次失败/窗口

  // 基础中间件
  app.use(cors(corsOptions));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // 路由挂载
  app.use('/api/health', healthRoutes);
  // auth 双层限流：整体节流（防滥用）+ 登录失败锁定（按 IP+邮箱 防爆破）
  const authLimiter = createRateLimiter({ windowMs, max: authMax });
  const loginFailureLimiter = createRateLimiter({
    windowMs,
    max: loginMaxFailures,
    failureOnly: true,
    failureStatus: (status) => status === 401,
    keyGenerator: (req) => (req.body && req.body.email ? String(req.body.email).toLowerCase() : ''),
    message: '登录尝试过于频繁，账户已临时锁定，请稍后再试',
  });
  app.use('/api/auth', authLimiter);
  app.use('/api/auth/login', loginFailureLimiter);
  app.use('/api/auth', authRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/integrations', integrationRoutes);

  // 错误处理：404 + 统一错误响应
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

// 仅在直接运行时启动服务（非被 import 引入，如测试）
const isMain = process.argv[1] && process.argv[1].endsWith('index.js');
if (isMain) {
  // 生产环境 fail-fast：JWT 密钥未配置或仍为开发默认值时拒绝启动
  const secretIssues = getSecretIssues();
  if (secretIssues.length > 0) {
    if (process.env.NODE_ENV === 'production') {
      // eslint-disable-next-line no-console
      console.error('[server] 生产环境配置校验失败，拒绝启动：');
      for (const issue of secretIssues) {
        // eslint-disable-next-line no-console
        console.error(`  - ${issue}`);
      }
      // eslint-disable-next-line no-console
      console.error('  请通过环境变量或 .env 配置强随机密钥（参见 server/.env.example）');
      process.exit(1);
    }
    // eslint-disable-next-line no-console
    console.warn('[server] 警告：正在使用开发默认 JWT 密钥，禁止用于生产环境');
  }

  // 初始化数据库连接
  getDb();

  const PORT = process.env.PORT || 3001;
  const app = createApp();
  const server = app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`[server] 服务已启动，监听端口 ${PORT}`);
  });

  // 优雅关闭
  function shutdown() {
    // eslint-disable-next-line no-console
    console.log('[server] 正在关闭...');
    server.close(() => {
      closeDb();
      process.exit(0);
    });
  }
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

export default createApp;
