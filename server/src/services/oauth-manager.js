// 通用 OAuth 管理器：统一 token 存储 / 刷新 / 撤销
// 支持 Notion / Todoist / Google Calendar 等多个提供商
// token 持久化在数据库的 oauth_tokens 表中
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db.js';
import { createError } from '../middleware/error.js';

/**
 * 各提供商 OAuth 端点与配置
 * clientId/clientSecret 从环境变量读取，默认值仅用于开发
 */
const PROVIDERS = {
  notion: {
    name: 'notion',
    authorizeUrl: 'https://api.notion.com/v1/oauth/authorize',
    tokenUrl: 'https://api.notion.com/v1/oauth/token',
    revokeUrl: null, // Notion 暂无标准撤销端点，删除本地 token 即可
    clientId: process.env.NOTION_OAUTH_CLIENT_ID || 'dev-notion-client-id',
    clientSecret: process.env.NOTION_OAUTH_CLIENT_SECRET || 'dev-notion-client-secret',
    redirectPath: '/api/integrations/oauth/notion/callback',
    scopes: '',
    // Notion token 不返回 expires_in，长期有效；这里给一个保守的 1 年过期
    defaultExpiresInSec: 365 * 24 * 60 * 60,
  },
  todoist: {
    name: 'todoist',
    authorizeUrl: 'https://todoist.com/oauth/authorize',
    tokenUrl: 'https://todoist.com/oauth/access_token',
    revokeUrl: 'https://api.todoist.com/sync/v9/access_tokens/revoke',
    clientId: process.env.TODOIST_OAUTH_CLIENT_ID || 'dev-todoist-client-id',
    clientSecret: process.env.TODOIST_OAUTH_CLIENT_SECRET || 'dev-todoist-client-secret',
    redirectPath: '/api/integrations/oauth/todoist/callback',
    scopes: 'data:read_write',
    // Todoist token 长期有效
    defaultExpiresInSec: 365 * 24 * 60 * 60,
  },
  google: {
    name: 'google',
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    revokeUrl: 'https://oauth2.googleapis.com/revoke',
    clientId: process.env.GOOGLE_OAUTH_CLIENT_ID || 'dev-google-client-id',
    clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET || 'dev-google-client-secret',
    redirectPath: '/api/integrations/oauth/google/callback',
    scopes: 'https://www.googleapis.com/auth/calendar',
    defaultExpiresInSec: 3600,
  },
};

/**
 * 计算回调 URL（基于请求头或环境变量）
 */
function buildRedirectUrl(req, provider) {
  const cfg = PROVIDERS[provider];
  // 优先使用环境变量显式配置
  if (process.env.OAUTH_REDIRECT_BASE) {
    return process.env.OAUTH_REDIRECT_BASE + cfg.redirectPath;
  }
  // 从请求推断
  const proto = req?.headers?.['x-forwarded-proto'] || req?.protocol || 'http';
  const host = req?.headers?.['x-forwarded-host'] || req?.get?.('host') || 'localhost:3001';
  return `${proto}://${host}${cfg.redirectPath}`;
}

/**
 * 生成授权 URL（发起 OAuth 授权）
 * @param {string} provider - 提供商名称
 * @param {Object} req - Express 请求对象（用于推断回调域名）
 * @param {string} state - 透传 state（防 CSRF，通常含 userId）
 * @returns {string} 授权 URL
 */
export function getAuthorizeUrl(provider, req, state) {
  const cfg = PROVIDERS[provider];
  if (!cfg) {
    throw createError(400, `不支持的提供商: ${provider}`);
  }
  const redirectUri = buildRedirectUrl(req, provider);
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    state,
  });
  if (cfg.scopes) {
    if (provider === 'google') {
      params.set('scope', cfg.scopes);
      params.set('access_type', 'offline');
      params.set('prompt', 'consent');
    } else if (provider === 'todoist') {
      params.set('scope', cfg.scopes);
    }
  }
  return `${cfg.authorizeUrl}?${params.toString()}`;
}

/**
 * 用授权码换取 token（与提供商 token 端点交互）
 * @param {string} provider
 * @param {string} code - 授权码
 * @param {Object} req - 用于推断回调 URL
 * @returns {Promise<Object>} token 响应
 */
export async function exchangeCodeForToken(provider, code, req) {
  const cfg = PROVIDERS[provider];
  if (!cfg) {
    throw createError(400, `不支持的提供商: ${provider}`);
  }
  const redirectUri = buildRedirectUrl(req, provider);

  let body;
  if (provider === 'todoist') {
    // Todoist 使用 form-urlencoded
    body = new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      code,
      redirect_uri: redirectUri,
    }).toString();
  } else if (provider === 'notion') {
    // Notion 使用 Basic Auth + JSON
    const basic = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64');
    const res = await fetch(cfg.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${basic}`,
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw createError(502, `Notion token 交换失败: ${res.status} ${text}`);
    }
    return res.json();
  } else {
    // Google 标准 OAuth 2.0
    body = new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }).toString();
  }

  const res = await fetch(cfg.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw createError(502, `${provider} token 交换失败: ${res.status} ${text}`);
  }
  return res.json();
}

/**
 * 刷新 token（用于 Google 等有过期时间的提供商）
 * @param {string} provider
 * @param {string} refreshToken
 * @returns {Promise<Object>}
 */
export async function refreshAccessToken(provider, refreshToken) {
  const cfg = PROVIDERS[provider];
  if (!cfg) {
    throw createError(400, `不支持的提供商: ${provider}`);
  }
  // Notion / Todoist token 长期有效，无需刷新
  if (provider === 'notion' || provider === 'todoist') {
    throw createError(400, `${provider} 不支持刷新 token`);
  }
  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  }).toString();
  const res = await fetch(cfg.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw createError(502, `${provider} token 刷新失败: ${res.status} ${text}`);
  }
  return res.json();
}

/**
 * 撤销 token（调用提供商撤销端点 + 删除本地记录）
 * @param {string} provider
 * @param {string} userId
 * @returns {Promise<void>}
 */
export async function revokeToken(provider, userId) {
  const cfg = PROVIDERS[provider];
  if (!cfg) {
    throw createError(400, `不支持的提供商: ${provider}`);
  }
  const db = getDb();
  const row = db
    .prepare('SELECT accessToken, refreshToken FROM oauth_tokens WHERE userId = ? AND provider = ?')
    .get(userId, provider);
  if (!row) {
    throw createError(404, `未找到 ${provider} 的授权记录`);
  }

  // 调用提供商撤销端点（best-effort，失败不阻塞本地删除）
  try {
    if (provider === 'google' && row.accessToken) {
      await fetch(`${cfg.revokeUrl}?token=${encodeURIComponent(row.accessToken)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
    } else if (provider === 'todoist' && row.accessToken) {
      await fetch(cfg.revokeUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: row.accessToken }),
      });
    }
    // Notion 无撤销端点
  } catch {
    // 撤销端点失败不阻塞本地清理
  }

  db.prepare('DELETE FROM oauth_tokens WHERE userId = ? AND provider = ?').run(userId, provider);
  // 同步禁用集成配置
  db.prepare(
    'UPDATE integration_configs SET enabled = 0, updatedAt = ? WHERE userId = ? AND provider = ?'
  ).run(new Date().toISOString(), userId, provider);
}

/**
 * 存储 / 更新 token 到数据库
 * @param {string} provider
 * @param {string} userId
 * @param {Object} tokenResponse - 提供商返回的 token 对象
 */
export function storeToken(provider, userId, tokenResponse) {
  const cfg = PROVIDERS[provider];
  if (!cfg) {
    throw createError(400, `不支持的提供商: ${provider}`);
  }
  const db = getDb();
  const now = new Date().toISOString();

  // 计算过期时间
  const expiresInSec =
    tokenResponse.expires_in ?? tokenResponse.expiresIn ?? cfg.defaultExpiresInSec;
  const expiresAt = new Date(Date.now() + expiresInSec * 1000).toISOString();

  // 不同提供商字段命名差异归一化
  const accessToken =
    tokenResponse.access_token ?? tokenResponse.accessToken ?? tokenResponse.token;
  const refreshToken = tokenResponse.refresh_token ?? tokenResponse.refreshToken ?? null;
  const tokenType = tokenResponse.token_type ?? tokenResponse.tokenType ?? 'bearer';
  const scope = tokenResponse.scope ?? cfg.scopes ?? null;

  if (!accessToken) {
    throw createError(502, `${provider} 未返回 accessToken`);
  }

  const id = uuidv4();
  // upsert：同一用户同一提供商只保留一条
  db.prepare(`
    INSERT INTO oauth_tokens (id, userId, provider, accessToken, refreshToken, tokenType, scope, expiresAt, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(userId, provider) DO UPDATE SET
      accessToken = excluded.accessToken,
      refreshToken = excluded.refreshToken,
      tokenType = excluded.tokenType,
      scope = excluded.scope,
      expiresAt = excluded.expiresAt,
      updatedAt = excluded.updatedAt
  `).run(id, userId, provider, accessToken, refreshToken, tokenType, scope, expiresAt, now, now);
}

/**
 * 读取 token（若过期且支持刷新则自动刷新）
 * @param {string} provider
 * @param {string} userId
 * @returns {Promise<{accessToken: string, refreshToken: string|null, expiresAt: string|null}>}
 */
export async function getToken(provider, userId) {
  const cfg = PROVIDERS[provider];
  if (!cfg) {
    throw createError(400, `不支持的提供商: ${provider}`);
  }
  const db = getDb();
  const row = db
    .prepare(
      `SELECT accessToken, refreshToken, expiresAt FROM oauth_tokens
       WHERE userId = ? AND provider = ?`
    )
    .get(userId, provider);
  if (!row) {
    throw createError(404, `未授权 ${provider}，请先发起 OAuth 授权`);
  }

  // 检查是否过期（留 60 秒缓冲）
  const expired =
    row.expiresAt && new Date(row.expiresAt).getTime() - 60 * 1000 < Date.now();

  if (expired && row.refreshToken && provider === 'google') {
    // 自动刷新
    const refreshed = await refreshAccessToken(provider, row.refreshToken);
    storeToken(provider, userId, refreshed);
    return getToken(provider, userId);
  }
  return {
    accessToken: row.accessToken,
    refreshToken: row.refreshToken,
    expiresAt: row.expiresAt,
  };
}

/**
 * 同步检查是否已授权
 */
export function isAuthorized(provider, userId) {
  const db = getDb();
  const row = db
    .prepare('SELECT id FROM oauth_tokens WHERE userId = ? AND provider = ?')
    .get(userId, provider);
  return !!row;
}

/**
 * 列出所有支持的提供商及其配置摘要
 */
export function listProviders() {
  return Object.keys(PROVIDERS).map((key) => ({
    name: key,
    scopes: PROVIDERS[key].scopes,
    authorizeUrl: PROVIDERS[key].authorizeUrl,
  }));
}

/**
 * 解析 state（约定为 base64url(JSON)）以提取 userId
 * @param {string} state
 * @returns {{userId?: string}}
 */
export function parseState(state) {
  try {
    const json = Buffer.from(state, 'base64url').toString('utf8');
    return JSON.parse(json);
  } catch {
    return {};
  }
}

/**
 * 生成 state（包含 userId）
 */
export function makeState(userId) {
  return Buffer.from(JSON.stringify({ userId, ts: Date.now() }), 'utf8').toString('base64url');
}

export { PROVIDERS, buildRedirectUrl };