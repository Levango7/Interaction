// SQLite 数据库初始化与连接管理
// 使用 Node.js 内置的 node:sqlite 模块（Node 22.5+ 实验性，Node 25 已稳定可用）
// 通过 createRequire 加载，避免 vite/vitest 尝试解析 node: 前缀
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite');

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 数据库文件存放目录：server/data/
const DATA_DIR = join(__dirname, '..', 'data');
// 默认数据库文件路径（可在运行时通过 DB_PATH 环境变量覆盖）
const DEFAULT_DB_PATH = join(DATA_DIR, 'app.db');

/**
 * 获取当前生效的数据库路径
 * 每次调用都读取环境变量，便于测试动态切换
 */
function resolveDbPath() {
  return process.env.DB_PATH || DEFAULT_DB_PATH;
}

// 单例数据库连接
let dbInstance = null;
let dbInstancePath = null;

/**
 * 初始化数据库目录与文件
 * 确保数据目录存在，避免启动时抛错
 */
function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

/**
 * 创建所有表结构
 * users：用户主表
 * devices：登录设备表
 * sessions：刷新令牌会话表
 * oauth_tokens：第三方 OAuth 令牌表（统一存储多提供商 token）
 * integration_configs：集成配置表（按用户/提供商存储开关与配置 JSON）
 * integration_sync_state：集成同步状态表（记录最近一次同步时间与游标）
 * push_subscriptions：Web Push 订阅表（每用户可订阅多个端点）
 * notification_schedules：定时提醒表（cron 风格周期任务）
 * user_settings：用户通用设置表（KV 结构，存储 SMTP/通知偏好等）
 */
function createSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      passwordHash TEXT NOT NULL,
      name TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      deviceName TEXT,
      lastSeen TEXT,
      createdAt TEXT NOT NULL,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      refreshToken TEXT NOT NULL UNIQUE,
      expiresAt TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS oauth_tokens (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      provider TEXT NOT NULL,
      accessToken TEXT NOT NULL,
      refreshToken TEXT,
      tokenType TEXT,
      scope TEXT,
      expiresAt TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      UNIQUE (userId, provider),
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS integration_configs (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      provider TEXT NOT NULL,
      config TEXT NOT NULL DEFAULT '{}',
      enabled INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      UNIQUE (userId, provider),
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS integration_sync_state (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      provider TEXT NOT NULL,
      lastSyncAt TEXT NOT NULL,
      cursor TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      UNIQUE (userId, provider),
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    );

    -- Web Push 订阅表：每个用户可订阅多个端点
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      endpoint TEXT NOT NULL,
      -- keys 字段存储 p256dh / auth 等加密密钥（JSON 字符串）
      keys TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    );

    -- 定时提醒表：cron 风格周期任务
    CREATE TABLE IF NOT EXISTS notification_schedules (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      -- 类型：task-due（任务到期）/ habit-broken（习惯断链）/ daily-digest（每日汇总）/ custom
      type TEXT NOT NULL,
      -- cron 表达式，例如 "0 9 * * *" 每天 9 点
      cron TEXT NOT NULL,
      -- 是否启用（0/1）
      enabled INTEGER NOT NULL DEFAULT 1,
      -- 上次执行时间 ISO 字符串
      lastRun TEXT,
      -- 附加配置（JSON 字符串，如提前分钟数、目标 ID 等）
      config TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    );

    -- 用户通用设置表：KV 结构，存储 SMTP 配置、通知偏好等
    CREATE TABLE IF NOT EXISTS user_settings (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      key TEXT NOT NULL,
      -- value 统一以字符串存储，复杂数据用 JSON
      value TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(userId, key)
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_userId ON sessions(userId);
    CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(refreshToken);
    CREATE INDEX IF NOT EXISTS idx_devices_userId ON devices(userId);
    CREATE INDEX IF NOT EXISTS idx_oauth_tokens_userId ON oauth_tokens(userId);
    CREATE INDEX IF NOT EXISTS idx_oauth_tokens_provider ON oauth_tokens(provider);
    CREATE INDEX IF NOT EXISTS idx_integration_configs_userId ON integration_configs(userId);
    CREATE INDEX IF NOT EXISTS idx_integration_sync_state_userId ON integration_sync_state(userId);
    CREATE INDEX IF NOT EXISTS idx_push_subs_userId ON push_subscriptions(userId);
    CREATE INDEX IF NOT EXISTS idx_push_subs_endpoint ON push_subscriptions(endpoint);
    CREATE INDEX IF NOT EXISTS idx_schedules_userId ON notification_schedules(userId);
    CREATE INDEX IF NOT EXISTS idx_settings_userId ON user_settings(userId);
  `);
}

/**
 * 获取数据库单例连接
 * @param {string} [overridePath] - 测试时可传入临时路径
 * @returns {Database}
 */
export function getDb(overridePath) {
  if (overridePath) {
    // 测试场景：每次创建独立连接
    const db = new DatabaseSync(overridePath);
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA foreign_keys = ON');
    createSchema(db);
    return db;
  }
  const currentPath = resolveDbPath();
  // 路径变化时（如测试切换）重建单例
  if (!dbInstance || dbInstancePath !== currentPath) {
    if (dbInstance) {
      dbInstance.close();
      dbInstance = null;
    }
    ensureDataDir();
    dbInstance = new DatabaseSync(currentPath);
    dbInstance.exec('PRAGMA journal_mode = WAL');
    dbInstance.exec('PRAGMA foreign_keys = ON');
    createSchema(dbInstance);
    dbInstancePath = currentPath;
  }
  return dbInstance;
}

/**
 * 关闭数据库连接（主要用于测试清理）
 */
export function closeDb() {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
    dbInstancePath = null;
  }
}

export { DATA_DIR, DEFAULT_DB_PATH };