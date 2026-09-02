// 认证中间件：校验 accessToken
import { verifyAccessToken } from '../auth/jwt.js';
import { createError } from './error.js';

/**
 * 要求请求携带有效 accessToken
 * 校验通过后将 user 信息挂载到 req.user
 */
export function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(createError(401, '未提供认证令牌'));
  }

  const token = authHeader.slice(7); // 去掉 "Bearer "
  const payload = verifyAccessToken(token);
  if (!payload) {
    return next(createError(401, '认证令牌无效或已过期'));
  }

  req.user = { userId: payload.userId, email: payload.email };
  next();
}