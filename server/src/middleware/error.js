// 错误处理中间件
import { Router } from 'express';

/**
 * 自定义 API 错误类
 * 携带 HTTP 状态码与错误消息
 */
export class ApiError extends Error {
  constructor(statusCode, message, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.name = 'ApiError';
  }
}

/**
 * 创建 API 错误的便捷工厂
 */
export const createError = (statusCode, message, details) =>
  new ApiError(statusCode, message, details);

/**
 * 404 处理中间件
 * 未匹配到任何路由时触发
 */
export function notFoundHandler(req, res, next) {
  next(createError(404, `路径不存在: ${req.method} ${req.originalUrl}`));
}

/**
 * 统一错误响应中间件
 * 必须放在所有路由之后注册
 */
export function errorHandler(err, req, res, next) {
  // eslint-disable-next-line no-console
  console.error('[错误]', err.message);

  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      error: err.message,
      details: err.details || undefined,
    });
  }

  // better-sqlite3 唯一约束冲突
  if (err && err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
    return res.status(409).json({ error: '资源已存在' });
  }

  // JSON 解析错误
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: '请求体格式错误' });
  }

  // 兜底：500
  return res.status(500).json({ error: '服务器内部错误' });
}