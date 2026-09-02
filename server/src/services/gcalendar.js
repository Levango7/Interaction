// Google Calendar 集成：OAuth 2.0 授权 + 事件 CRUD + 日历同步
// API 文档：https://developers.google.com/calendar/api/v3/reference
import { v4 as uuidv4 } from 'uuid';
import { getToken, isAuthorized } from './oauth-manager.js';
import { getDb } from '../db.js';
import { createError } from '../middleware/error.js';

/**
 * 调用 Google Calendar API 的统一封装
 * @param {string} userId
 * @param {string} path - 相对 https://www.googleapis.com/calendar/v3/
 * @param {Object} [options]
 */
async function gcalFetch(userId, path, options = {}) {
  const { accessToken } = await getToken('google', userId);
  const res = await fetch(`https://www.googleapis.com/calendar/v3/${path.replace(/^\//, '')}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw createError(res.status, `Google Calendar API 错误: ${res.status} ${text}`);
  }
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return res.json();
  }
  return null;
}

/**
 * 列出用户的所有日历
 * GET /api/integrations/gcalendar/calendars
 * @param {string} userId
 */
export async function listCalendars(userId) {
  return gcalFetch(userId, '/users/me/calendarList', { method: 'GET' });
}

/**
 * 列出指定日历的事件
 * GET /api/integrations/gcalendar/events
 * @param {string} userId
 * @param {Object} [query] - { calendarId, timeMin, timeMax, q, pageToken }
 */
export async function listEvents(userId, query = {}) {
  const calendarId = query.calendarId || 'primary';
  const params = new URLSearchParams();
  if (query.timeMin) params.set('timeMin', query.timeMin);
  if (query.timeMax) params.set('timeMax', query.timeMax);
  if (query.q) params.set('q', query.q);
  if (query.pageToken) params.set('pageToken', query.pageToken);
  if (query.singleEvents !== undefined) params.set('singleEvents', String(query.singleEvents));
  else params.set('singleEvents', 'true');
  if (query.orderBy) params.set('orderBy', query.orderBy);
  else params.set('orderBy', 'startTime');
  if (query.maxResults) params.set('maxResults', String(query.maxResults));
  const qs = params.toString();
  return gcalFetch(userId, `/calendars/${encodeURIComponent(calendarId)}/events${qs ? '?' + qs : ''}`, {
    method: 'GET',
  });
}

/**
 * 创建日历事件
 * POST /api/integrations/gcalendar/events
 * @param {string} userId
 * @param {Object} payload - { calendarId?, summary, description?, start, end, ... }
 */
export async function createEvent(userId, payload) {
  if (!payload?.summary) {
    throw createError(400, '缺少 summary 字段');
  }
  if (!payload?.start) {
    throw createError(400, '缺少 start 字段');
  }
  const calendarId = payload.calendarId || 'primary';
  const body = {
    summary: payload.summary,
    start: payload.start,
    end: payload.end || payload.start,
  };
  if (payload.description) body.description = payload.description;
  if (payload.location) body.location = payload.location;
  if (payload.attendees) body.attendees = payload.attendees;
  if (payload.recurrence) body.recurrence = payload.recurrence;
  if (payload.reminders) body.reminders = payload.reminders;
  if (payload.colorId) body.colorId = payload.colorId;
  return gcalFetch(userId, `/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/**
 * 更新日历事件
 * PUT /api/integrations/gcalendar/events/:id
 * @param {string} userId
 * @param {string} eventId
 * @param {Object} payload
 */
export async function updateEvent(userId, eventId, payload) {
  const calendarId = payload.calendarId || 'primary';
  const body = {};
  if (payload.summary !== undefined) body.summary = payload.summary;
  if (payload.description !== undefined) body.description = payload.description;
  if (payload.start !== undefined) body.start = payload.start;
  if (payload.end !== undefined) body.end = payload.end;
  if (payload.location !== undefined) body.location = payload.location;
  if (payload.attendees !== undefined) body.attendees = payload.attendees;
  if (payload.reminders !== undefined) body.reminders = payload.reminders;
  return gcalFetch(userId, `/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

/**
 * 删除日历事件
 * DELETE /api/integrations/gcalendar/events/:id
 * @param {string} userId
 * @param {string} eventId
 * @param {Object} [options] - { calendarId }
 */
export async function deleteEvent(userId, eventId, options = {}) {
  const calendarId = options.calendarId || 'primary';
  return gcalFetch(userId, `/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`, {
    method: 'DELETE',
  });
}

/**
 * 将本地任务转换为 Google Calendar 事件
 * 约定：本地任务含 title/name, description, dueDate, durationMinutes
 * @param {Object} task
 */
function taskToEvent(task) {
  const summary = task.title || task.name || '未命名任务';
  const startDateTime = task.dueDate || task.startDateTime;
  // 默认持续 30 分钟
  const durationMs = (task.durationMinutes || 30) * 60 * 1000;
  const endDateTime = task.endDate || task.endDateTime;
  let end;
  if (endDateTime) {
    end = { dateTime: endDateTime };
  } else if (startDateTime) {
    end = { dateTime: new Date(new Date(startDateTime).getTime() + durationMs).toISOString() };
  } else {
    end = { dateTime: new Date(Date.now() + durationMs).toISOString() };
  }
  const event = {
    summary,
    start: startDateTime ? { dateTime: startDateTime } : { date: new Date().toISOString().slice(0, 10) },
    end,
  };
  if (task.description) event.description = task.description;
  if (task.location) event.location = task.location;
  return event;
}

/**
 * 同步本地任务到期日期到 Google Calendar
 * 策略：
 *  - 本地任务无 gcalEventId → 创建事件，回写 gcalEventId
 *  - 本地任务有 gcalEventId → 更新事件
 *  - 可选：删除已完成的本地任务对应的事件
 * POST /api/integrations/gcalendar/sync
 * @param {string} userId
 * @param {Object} options - { calendarId, localTasks, upsertLocalTask, removeCompleted }
 * @returns {Promise<Object>} 同步结果统计
 */
export async function syncTasks(userId, options = {}) {
  const { calendarId = 'primary', localTasks = [], upsertLocalTask, removeCompleted = false } = options;
  if (!isAuthorized('google', userId)) {
    throw createError(401, '未授权 Google');
  }

  const stats = { created: 0, updated: 0, deleted: 0, skipped: 0, errors: [] };

  for (const task of localTasks) {
    try {
      if (!task.gcalEventId) {
        // 创建事件
        const eventPayload = taskToEvent(task);
        eventPayload.calendarId = calendarId;
        const created = await createEvent(userId, eventPayload);
        task.gcalEventId = created.id;
        if (upsertLocalTask) await upsertLocalTask(task);
        stats.created += 1;
      } else if (task.completed && removeCompleted) {
        // 已完成且配置删除 → 删除事件
        await deleteEvent(userId, task.gcalEventId, { calendarId });
        task.gcalEventId = null;
        if (upsertLocalTask) await upsertLocalTask(task);
        stats.deleted += 1;
      } else {
        // 更新事件
        const eventPayload = taskToEvent(task);
        eventPayload.calendarId = calendarId;
        await updateEvent(userId, task.gcalEventId, eventPayload);
        stats.updated += 1;
      }
    } catch (err) {
      stats.errors.push({ taskId: task.id, error: err.message });
    }
  }

  // 记录同步状态
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO integration_sync_state (id, userId, provider, lastSyncAt, createdAt, updatedAt)
    VALUES (?, ?, 'google', ?, ?, ?)
    ON CONFLICT(userId, provider) DO UPDATE SET
      lastSyncAt = excluded.lastSyncAt,
      updatedAt = excluded.updatedAt
  `).run(uuidv4(), userId, now, now, now);

  return stats;
}

export { gcalFetch, taskToEvent };