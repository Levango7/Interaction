// 定时提醒服务
// 基于 node-cron 实现 cron 风格的周期任务调度
// 负责：CRUD 定时提醒、注册/销毁调度任务、定时检查任务到期与习惯断链
import cron from 'node-cron';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db.js';

// 支持的提醒类型
export const SCHEDULE_TYPES = ['task-due', 'habit-broken', 'daily-digest', 'custom'];

// 运行中的 cron 任务映射：scheduleId -> cron.ScheduledTask
const runningTasks = new Map();

/**
 * 校验 cron 表达式是否合法
 * @param {string} expression
 * @returns {boolean}
 */
export function isValidCron(expression) {
  return cron.validate(expression);
}

/**
 * 列出用户的所有定时提醒
 * @param {string} userId
 * @returns {Array}
 */
export function listSchedules(userId) {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, userId, type, cron, enabled, lastRun, config, createdAt, updatedAt
       FROM notification_schedules WHERE userId = ? ORDER BY createdAt DESC`
    )
    .all(userId);
  return rows.map(normalizeScheduleRow);
}

/**
 * 获取单个定时提醒
 * @param {string} userId
 * @param {string} scheduleId
 * @returns {Object|null}
 */
export function getSchedule(userId, scheduleId) {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT id, userId, type, cron, enabled, lastRun, config, createdAt, updatedAt
       FROM notification_schedules WHERE id = ? AND userId = ?`
    )
    .get(scheduleId, userId);
  return row ? normalizeScheduleRow(row) : null;
}

/**
 * 创建定时提醒
 * @param {string} userId
 * @param {Object} data - { type, cron, enabled?, config? }
 * @returns {Object}
 */
export function createSchedule(userId, data) {
  if (!SCHEDULE_TYPES.includes(data.type)) {
    throw new Error(`不支持的提醒类型：${data.type}`);
  }
  if (!isValidCron(data.cron)) {
    throw new Error(`无效的 cron 表达式：${data.cron}`);
  }
  const db = getDb();
  const id = uuidv4();
  const now = new Date().toISOString();
  const enabled = data.enabled === false ? 0 : 1;
  const config = data.config ? JSON.stringify(data.config) : null;
  db.prepare(
    `INSERT INTO notification_schedules (id, userId, type, cron, enabled, config, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, userId, data.type, data.cron, enabled, config, now, now);
  return getSchedule(userId, id);
}

/**
 * 更新定时提醒
 * @param {string} userId
 * @param {string} scheduleId
 * @param {Object} data - { type?, cron?, enabled?, config? }
 * @returns {Object|null}
 */
export function updateSchedule(userId, scheduleId, data) {
  const existing = getSchedule(userId, scheduleId);
  if (!existing) return null;

  if (data.type !== undefined && !SCHEDULE_TYPES.includes(data.type)) {
    throw new Error(`不支持的提醒类型：${data.type}`);
  }
  if (data.cron !== undefined && !isValidCron(data.cron)) {
    throw new Error(`无效的 cron 表达式：${data.cron}`);
  }

  const db = getDb();
  const updates = [];
  const params = [];
  if (data.type !== undefined) { updates.push('type = ?'); params.push(data.type); }
  if (data.cron !== undefined) { updates.push('cron = ?'); params.push(data.cron); }
  if (data.enabled !== undefined) { updates.push('enabled = ?'); params.push(data.enabled ? 1 : 0); }
  if (data.config !== undefined) {
    updates.push('config = ?');
    params.push(data.config ? JSON.stringify(data.config) : null);
  }
  if (updates.length === 0) return existing;

  updates.push('updatedAt = ?');
  params.push(new Date().toISOString());
  params.push(scheduleId);
  db.prepare(`UPDATE notification_schedules SET ${updates.join(', ')} WHERE id = ?`).run(...params);

  // 若任务正在运行且 cron/enabled 变更，重启
  if (runningTasks.has(scheduleId)) {
    stopTask(scheduleId);
    const refreshed = getSchedule(userId, scheduleId);
    if (refreshed && refreshed.enabled) {
      startTask(refreshed);
    }
  }
  return getSchedule(userId, scheduleId);
}

/**
 * 删除定时提醒
 * @param {string} userId
 * @param {string} scheduleId
 * @returns {boolean}
 */
export function deleteSchedule(userId, scheduleId) {
  const db = getDb();
  // 先停止运行中的任务
  stopTask(scheduleId);
  const result = db
    .prepare('DELETE FROM notification_schedules WHERE id = ? AND userId = ?')
    .run(scheduleId, userId);
  return result.changes > 0;
}

/**
 * 记划单次执行：更新 lastRun 字段
 * @param {string} scheduleId
 */
function markRun(scheduleId) {
  const db = getDb();
  db.prepare('UPDATE notification_schedules SET lastRun = ? WHERE id = ?')
    .run(new Date().toISOString(), scheduleId);
}

/**
 * 启动单个调度任务
 * @param {Object} schedule
 * @param {Function} [handler] - 自定义处理函数，默认调用 defaultHandler
 */
export function startTask(schedule, handler) {
  if (!schedule || !schedule.enabled) return null;
  if (runningTasks.has(schedule.id)) return runningTasks.get(schedule.id);

  const fn = handler || defaultHandler;
  const task = cron.schedule(schedule.cron, () => {
    try {
      fn(schedule);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[scheduler] 调度 ${schedule.id} 执行失败:`, err.message);
    }
    markRun(schedule.id);
  }, { scheduled: true });

  runningTasks.set(schedule.id, task);
  return task;
}

/**
 * 停止调度任务
 * @param {string} scheduleId
 */
export function stopTask(scheduleId) {
  const task = runningTasks.get(scheduleId);
  if (task) {
    task.stop();
    runningTasks.delete(scheduleId);
  }
}

/**
 * 启动用户所有启用的定时提醒
 * @param {string} userId
 * @param {Function} [handler]
 */
export function startAllForUser(userId, handler) {
  const schedules = listSchedules(userId);
  for (const s of schedules) {
    if (s.enabled) startTask(s, handler);
  }
}

/**
 * 停止所有运行中的调度任务
 */
export function stopAll() {
  for (const [id, task] of runningTasks) {
    task.stop();
  }
  runningTasks.clear();
}

/**
 * 判断指定调度任务是否正在运行
 * @param {string} scheduleId
 * @returns {boolean}
 */
export function isRunning(scheduleId) {
  return runningTasks.has(scheduleId);
}

/**
 * 默认调度处理函数
 * 实际场景中会查询任务/习惯数据并触发邮件/推送通知
 * 此处仅做日志输出，便于测试与扩展
 * @param {Object} schedule
 */
function defaultHandler(schedule) {
  // eslint-disable-next-line no-console
  console.log(`[scheduler] 触发提醒 type=${schedule.type} id=${schedule.id}`);
}

/**
 * 把数据库行转换为对外对象（enabled 转 boolean、config 解析 JSON）
 */
function normalizeScheduleRow(row) {
  return {
    id: row.id,
    userId: row.userId,
    type: row.type,
    cron: row.cron,
    enabled: !!row.enabled,
    lastRun: row.lastRun,
    config: row.config ? JSON.parse(row.config) : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export default {
  SCHEDULE_TYPES,
  isValidCron,
  listSchedules,
  getSchedule,
  createSchedule,
  updateSchedule,
  deleteSchedule,
  startTask,
  stopTask,
  startAllForUser,
  stopAll,
  isRunning,
};