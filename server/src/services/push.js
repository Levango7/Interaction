// Web Push 通知服务
// 基于 web-push 库实现 VAPID 密钥对生成、订阅管理与推送发送
// VAPID 密钥对优先从环境变量读取，否则启动时生成并缓存到内存
// （生产环境建议通过 VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY 环境变量持久配置）
import webpush from 'web-push';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db.js';

// VAPID 邮件联系地址（按 RFC 8291 建议提供）
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:no-reply@nexus.local';

// 内存缓存的 VAPID 密钥对（未通过环境变量配置时使用）
let cachedVapidKeys = null;

/**
 * 生成 VAPID 密钥对
 * @returns {{ publicKey: string, privateKey: string }}
 */
export function generateVapidKeys() {
  return webpush.generateVAPIDKeys();
}

/**
 * 获取系统 VAPID 密钥对
 * 优先级：环境变量 > 内存缓存（首次调用时生成）
 * @returns {{ publicKey: string, privateKey: string }}
 */
export function getVapidKeys() {
  // 优先使用环境变量配置（生产环境推荐）
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    return {
      publicKey: process.env.VAPID_PUBLIC_KEY,
      privateKey: process.env.VAPID_PRIVATE_KEY,
    };
  }
  // 内存缓存（开发环境：进程重启后会重新生成，订阅将失效）
  if (!cachedVapidKeys) {
    cachedVapidKeys = generateVapidKeys();
  }
  return cachedVapidKeys;
}

/**
 * 获取 VAPID 公钥（供前端订阅使用）
 * @returns {string}
 */
export function getVapidPublicKey() {
  return getVapidKeys().publicKey;
}

/**
 * 显式设置 VAPID 密钥对（主要用于测试或运行时配置）
 * @param {{ publicKey: string, privateKey: string }} keys
 */
export function setVapidKeys(keys) {
  cachedVapidKeys = { publicKey: keys.publicKey, privateKey: keys.privateKey };
}

/**
 * 配置 web-push 库的 VAPID 详情
 * 在每次发送前调用，确保使用最新密钥
 */
function configureWebPush() {
  const keys = getVapidKeys();
  webpush.setVapidDetails(VAPID_SUBJECT, keys.publicKey, keys.privateKey);
}

/**
 * 保存 push 订阅
 * @param {string} userId
 * @param {Object} subscription - { endpoint, keys: { p256dh, auth } }
 * @returns {Object} 已保存的订阅记录
 */
export function subscribe(userId, subscription) {
  if (!subscription || !subscription.endpoint || !subscription.keys) {
    throw new Error('订阅信息不完整：需要 endpoint 与 keys');
  }
  const db = getDb();
  // 同一 endpoint 视为同一订阅，避免重复
  const existing = db
    .prepare('SELECT id FROM push_subscriptions WHERE userId = ? AND endpoint = ?')
    .get(userId, subscription.endpoint);
  if (existing) {
    return { id: existing.id, endpoint: subscription.endpoint, reused: true };
  }
  const id = uuidv4();
  const now = new Date().toISOString();
  db.prepare(
    'INSERT INTO push_subscriptions (id, userId, endpoint, keys, createdAt) VALUES (?, ?, ?, ?, ?)'
  ).run(id, userId, subscription.endpoint, JSON.stringify(subscription.keys), now);
  return { id, endpoint: subscription.endpoint, reused: false };
}

/**
 * 取消订阅
 * @param {string} userId
 * @param {string} endpoint
 * @returns {boolean} 是否成功删除
 */
export function unsubscribe(userId, endpoint) {
  const db = getDb();
  const result = db
    .prepare('DELETE FROM push_subscriptions WHERE userId = ? AND endpoint = ?')
    .run(userId, endpoint);
  return result.changes > 0;
}

/**
 * 列出用户的所有订阅
 * @param {string} userId
 * @returns {Array<{ id, endpoint, keys, createdAt }>}
 */
export function listSubscriptions(userId) {
  const db = getDb();
  const rows = db
    .prepare('SELECT id, endpoint, keys, createdAt FROM push_subscriptions WHERE userId = ?')
    .all(userId);
  return rows.map((r) => ({ ...r, keys: JSON.parse(r.keys) }));
}

/**
 * 向单个订阅对象发送推送
 * @param {Object} subscription - { endpoint, keys }
 * @param {Object} payload - 任意可 JSON 序列化的对象
 * @returns {Object} web-push sendNotification 结果
 */
export async function sendToSubscription(subscription, payload) {
  configureWebPush();
  return webpush.sendNotification(subscription, JSON.stringify(payload));
}

/**
 * 向指定用户的所有订阅推送消息
 * @param {string} userId
 * @param {Object} payload
 * @returns {Array<{ endpoint, success, error? }>}
 */
export async function sendToUser(userId, payload) {
  const subs = listSubscriptions(userId);
  const results = [];
  for (const sub of subs) {
    try {
      await sendToSubscription(sub, payload);
      results.push({ endpoint: sub.endpoint, success: true });
    } catch (err) {
      // 推送失败常见原因：订阅过期/失效（410 Gone）
      results.push({ endpoint: sub.endpoint, success: false, error: err.message });
      // 若订阅已失效（410/404），自动清理
      if (err.statusCode === 410 || err.statusCode === 404) {
        unsubscribe(userId, sub.endpoint);
      }
    }
  }
  return results;
}

export default {
  generateVapidKeys,
  getVapidKeys,
  getVapidPublicKey,
  setVapidKeys,
  subscribe,
  unsubscribe,
  listSubscriptions,
  sendToSubscription,
  sendToUser,
};