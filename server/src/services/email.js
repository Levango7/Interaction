// 邮件通知服务
// 基于 nodemailer 实现，SMTP 配置存储在 user_settings 表中
// 支持纯文本与 HTML 邮件，内置任务到期/习惯断链/每日 digest 模板
import nodemailer from 'nodemailer';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db.js';

// user_settings 中存储 SMTP 配置的 key
export const SMTP_SETTINGS_KEY = 'smtp';
// user_settings 中存储邮件发件人地址的 key
export const MAIL_FROM_SETTINGS_KEY = 'mailFrom';

/**
 * 默认发件人地址（可通过环境变量覆盖）
 */
const DEFAULT_FROM = process.env.MAIL_FROM || 'Nexus Interaction <no-reply@nexus.local>';

/**
 * 从数据库读取用户的 SMTP 配置
 * @param {string} userId
 * @returns {Object|null} SMTP 配置对象，含 host/port/secure/user/pass
 */
export function getSmtpConfig(userId) {
  const db = getDb();
  const row = db
    .prepare('SELECT value FROM user_settings WHERE userId = ? AND key = ?')
    .get(userId, SMTP_SETTINGS_KEY);
  if (!row || !row.value) return null;
  try {
    return JSON.parse(row.value);
  } catch {
    return null;
  }
}

/**
 * 持久化 SMTP 配置到 user_settings 表
 * @param {string} userId
 * @param {Object} config - { host, port, secure, user, pass }
 */
export function setSmtpConfig(userId, config) {
  const db = getDb();
  const now = new Date().toISOString();
  const value = JSON.stringify(config);
  // upsert：已存在则更新，否则插入
  const existing = db
    .prepare('SELECT id FROM user_settings WHERE userId = ? AND key = ?')
    .get(userId, SMTP_SETTINGS_KEY);
  if (existing) {
    db.prepare('UPDATE user_settings SET value = ?, updatedAt = ? WHERE id = ?')
      .run(value, now, existing.id);
  } else {

    db.prepare(
      'INSERT INTO user_settings (id, userId, key, value, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(uuidv4(), userId, SMTP_SETTINGS_KEY, value, now, now);
  }
}

/**
 * 读取用户自定义发件人地址
 * @param {string} userId
 * @returns {string}
 */
export function getMailFrom(userId) {
  const db = getDb();
  const row = db
    .prepare('SELECT value FROM user_settings WHERE userId = ? AND key = ?')
    .get(userId, MAIL_FROM_SETTINGS_KEY);
  return (row && row.value) || DEFAULT_FROM;
}

/**
 * 创建 nodemailer transport（每次按需创建，便于配置变更即时生效）
 * @param {Object} smtpConfig
 * @returns {Object} nodemailer transport
 */
export function createTransport(smtpConfig) {
  return nodemailer.createTransport({
    host: smtpConfig.host,
    port: smtpConfig.port || 587,
    secure: !!smtpConfig.secure,
    auth: smtpConfig.user
      ? { user: smtpConfig.user, pass: smtpConfig.pass || '' }
      : undefined,
  });
}

/**
 * 发送邮件
 * @param {string} userId - 用于读取 SMTP 配置
 * @param {Object} options - { to, subject, text?, html? }
 * @returns {Promise<Object>} nodemailer sendMail 结果
 */
export async function sendMail(userId, options) {
  const smtpConfig = getSmtpConfig(userId);
  if (!smtpConfig) {
    throw new Error('未配置 SMTP，请先在通知偏好中设置邮件服务器');
  }
  const transport = createTransport(smtpConfig);
  try {
    const info = await transport.sendMail({
      from: getMailFrom(userId),
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
    });
    return info;
  } finally {
    transport.close();
  }
}

// ============================================================
// 邮件模板：返回 { subject, text, html }
// ============================================================

/**
 * 任务到期提醒邮件模板
 * @param {Object} params - { taskTitle, dueAt, taskUrl? }
 * @returns {{ subject: string, text: string, html: string }}
 */
export function templateTaskDue({ taskTitle, dueAt, taskUrl }) {
  const subject = `【任务到期提醒】${taskTitle}`;
  const text = `您的任务「${taskTitle}」即将到期。\n到期时间：${dueAt}\n请尽快处理。`;
  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #c0392b;">任务到期提醒</h2>
      <p>您的任务 <strong>${escapeHtml(taskTitle)}</strong> 即将到期。</p>
      <p>到期时间：${escapeHtml(dueAt)}</p>
      <p>请尽快处理${taskUrl ? `：<a href="${escapeHtml(taskUrl)}">查看详情</a>` : '。'}</p>
      <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
      <p style="color: #999; font-size: 12px;">此邮件由 Nexus Interaction 自动发送</p>
    </div>`;
  return { subject, text, html };
}

/**
 * 习惯链断链提醒邮件模板
 * @param {Object} params - { habitName, lastDoneAt, streakDays }
 * @returns {{ subject: string, text: string, html: string }}
 */
export function templateHabitBroken({ habitName, lastDoneAt, streakDays }) {
  const subject = `【习惯断链提醒】${habitName}`;
  const text = `您习惯「${habitName}」已断链。\n上次完成：${lastDoneAt}\n连续坚持：${streakDays} 天\n重新开始，永不嫌晚。`;
  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #e67e22;">习惯断链提醒</h2>
      <p>您习惯 <strong>${escapeHtml(habitName)}</strong> 已断链。</p>
      <p>上次完成：${escapeHtml(lastDoneAt)}</p>
      <p>连续坚持：<strong>${streakDays}</strong> 天</p>
      <p style="color: #7f8c8d;">重新开始，永不嫌晚。</p>
      <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
      <p style="color: #999; font-size: 12px;">此邮件由 Nexus Interaction 自动发送</p>
    </div>`;
  return { subject, text, html };
}

/**
 * 每日 digest 邮件模板
 * @param {Object} params - { date, tasks: [{title, dueAt}], habits: [{name, done}] }
 * @returns {{ subject: string, text: string, html: string }}
 */
export function templateDailyDigest({ date, tasks = [], habits = [] }) {
  const subject = `【每日汇总】${date}`;
  const taskLines = tasks.map((t) => `  - ${t.title}（到期 ${t.dueAt}）`).join('\n');
  const habitLines = habits.map((h) => `  - ${h.name}：${h.done ? '已完成' : '未完成'}`).join('\n');
  const text = `今日汇总（${date}）\n\n待办任务：\n${taskLines || '  无'}\n\n习惯打卡：\n${habitLines || '  无'}`;

  const taskHtml = tasks.length
    ? tasks.map((t) => `<li>${escapeHtml(t.title)}（到期 ${escapeHtml(t.dueAt)}）</li>`).join('')
    : '<li>无</li>';
  const habitHtml = habits.length
    ? habits.map((h) => `<li>${escapeHtml(h.name)}：${h.done ? '✅ 已完成' : '⬜ 未完成'}</li>`).join('')
    : '<li>无</li>';
  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #2c3e50;">每日汇总 · ${escapeHtml(date)}</h2>
      <h3>待办任务</h3>
      <ul>${taskHtml}</ul>
      <h3>习惯打卡</h3>
      <ul>${habitHtml}</ul>
      <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
      <p style="color: #999; font-size: 12px;">此邮件由 Nexus Interaction 自动发送</p>
    </div>`;
  return { subject, text, html };
}

/**
 * 简易 HTML 转义，防止注入
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export { escapeHtml };