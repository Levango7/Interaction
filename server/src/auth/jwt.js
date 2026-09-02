// JWT 签发、验证与刷新工具
import jwt from 'jsonwebtoken';

// 密钥从环境变量读取，默认值仅用于开发环境
const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'dev-access-secret-change-me';
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-change-me';

// 有效期常量
const ACCESS_EXPIRES_IN = '15m'; // accessToken 15 分钟
const REFRESH_EXPIRES_IN = '7d'; // refreshToken 7 天
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 天毫秒数

/**
 * 签发 accessToken
 * @param {Object} payload - { userId, email }
 * @returns {string}
 */
export function signAccessToken(payload) {
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: ACCESS_EXPIRES_IN });
}

/**
 * 签发 refreshToken
 * @param {Object} payload - { userId, sessionId }
 * @returns {string}
 */
export function signRefreshToken(payload) {
  return jwt.sign(payload, REFRESH_SECRET, { expiresIn: REFRESH_EXPIRES_IN });
}

/**
 * 验证 accessToken
 * @param {string} token
 * @returns {{ userId: string, email: string } | null}
 */
export function verifyAccessToken(token) {
  try {
    return jwt.verify(token, ACCESS_SECRET);
  } catch {
    return null;
  }
}

/**
 * 验证 refreshToken
 * @param {string} token
 * @returns {{ userId: string, sessionId: string, exp: number } | null}
 */
export function verifyRefreshToken(token) {
  try {
    return jwt.verify(token, REFRESH_SECRET);
  } catch {
    return null;
  }
}

/**
 * 计算刷新令牌过期时间戳（ISO 字符串）
 * @returns {string}
 */
export function refreshExpiresAt() {
  return new Date(Date.now() + REFRESH_TTL_MS).toISOString();
}

export { ACCESS_EXPIRES_IN, REFRESH_EXPIRES_IN, REFRESH_TTL_MS };