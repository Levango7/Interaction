// 健康检查路由
import { Router } from 'express';

const router = Router();

/**
 * GET /api/health
 * 返回服务运行状态与时间戳
 */
router.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'nexus-interaction-server',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

export default router;