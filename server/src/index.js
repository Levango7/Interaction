// Express 应用入口：注册中间件与路由
import express from 'express';
import cors from 'cors';
import { getDb, closeDb } from './db.js';
import authRoutes from './routes/auth.js';
import healthRoutes from './routes/health.js';
import notificationRoutes from './routes/notifications.js';
import integrationRoutes from './routes/integrations.js';
import { notFoundHandler, errorHandler } from './middleware/error.js';

/**
 * 创建 Express 应用实例
 * 抽离为函数便于测试复用
 */
export function createApp() {
  const app = express();

  // 基础中间件
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // 路由挂载
  app.use('/api/health', healthRoutes);
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