/* server/src/store.js
 * 零依赖 JSON 文件持久化（对齐前端 localStorage 的简洁形态）。
 * 数据结构：{ users, codes, sessions, oauthStates, schedules, integrations, pushSubs, notifyPrefs }
 * 原子写：先写临时文件再 rename，避免崩溃写坏。
 */
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function uid(prefix) {
  return (prefix || "") + crypto.randomBytes(8).toString("hex") + Date.now().toString(36);
}

class Store {
  constructor(file) {
    this.file = file;
    this._data = {
      users: {},        // id -> { id, email, name, passwordHash, provider, providerId, createdAt }
      codes: {},        // email -> { code, expiresAt, used, purpose }
      sessions: {},     // refreshToken -> { userId, createdAt, expiresAt, deviceName }
      oauthStates: {},  // state -> { provider, createdAt, data }
      schedules: {},    // id -> { ... }
      integrations: {}, // provider -> { connected, meta, createdAt }
      pushSubs: [],     // [ { endpoint, userId, createdAt } ]
      notifyPrefs: {},  // userId -> { ... }
      snapshots: {}     // userId -> { snapshot, updatedAt, clientUpdatedAt }（云同步，LWW 全量快照）
    };
    this._load();
  }

  _load() {
    try {
      if (fs.existsSync(this.file)) {
        const raw = fs.readFileSync(this.file, "utf8");
        const parsed = JSON.parse(raw);
        this._data = Object.assign(this._data, parsed || {});
      }
    } catch (e) { /* 损坏则重建空库 */ }
  }

  _save() {
    /* v3.7.105：原实现这里吞掉所有写盘异常且不落任何痕迹 —— 磁盘满 / 目录只读 / 权限不足时，
       服务照常响应「注册成功」，但数据从未落盘，重启后账号凭空消失，且无人知晓。
       这类「用户主动操作 + 成功有回执、失败静默」的静默即谎报。现改为必须留痕。 */
    try {
      const dir = path.dirname(this.file);
      if (dir && !fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const tmp = this.file + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify(this._data, null, 2), "utf8");
      fs.renameSync(tmp, this.file);
    } catch (e) {
      console.error("[agent-workbench-auth][ERROR] 数据落盘失败，内存态与磁盘已不一致：" +
        ((e && e.message) || String(e)) + " | file=" + this.file);
    }
  }

  get data() { return this._data; }
  save() { this._save(); return this; }

  // 生成 ID（模块级 uid 的实例别名，路由直接 store.uid() 调用）
  uid(prefix) { return uid(prefix); }

  // ---- users ----
  findUserByEmail(email) {
    if (!email) return null;
    const key = String(email).trim().toLowerCase();
    return Object.keys(this._data.users)
      .map(id => this._data.users[id])
      .find(u => u.email && u.email.toLowerCase() === key) || null;
  }
  findUserByProvider(provider, providerId) {
    return Object.keys(this._data.users)
      .map(id => this._data.users[id])
      .find(u => u.provider === provider && u.providerId === String(providerId)) || null;
  }
  createUser(u) { this._data.users[u.id] = u; this._save(); return u; }
  updateUser(id, patch) { if (this._data.users[id]) { Object.assign(this._data.users[id], patch); this._save(); } return this._data.users[id]; }
  getUser(id) { return this._data.users[id] || null; }

  // ---- codes ----
  setCode(email, code, ttlSec, purpose) {
    this._data.codes[String(email).toLowerCase()] = {
      code, purpose: purpose || "register",
      expiresAt: Date.now() + (ttlSec || 600) * 1000,
      used: false
    };
    this._save();
  }
  getCode(email) { return this._data.codes[String(email).toLowerCase()] || null; }
  markCodeUsed(email) { const c = this._data.codes[String(email).toLowerCase()]; if (c) { c.used = true; this._save(); } }
  // 清理过期码（在发新码时顺带清同邮箱旧码）

  // ---- sessions ----
  saveSession(s) { this._data.sessions[s.refreshToken] = s; this._save(); return s; }
  getSession(rt) { return this._data.sessions[rt] || null; }
  deleteSession(rt) { if (this._data.sessions[rt]) { delete this._data.sessions[rt]; this._save(); } }
  deleteUserSessions(userId) {
    let changed = false;
    Object.keys(this._data.sessions).forEach(rt => {
      if (this._data.sessions[rt].userId === userId) { delete this._data.sessions[rt]; changed = true; }
    });
    if (changed) this._save();
  }

  // ---- oauth states ----
  setOAuthState(state, provider, data) {
    this._data.oauthStates[state] = { provider, createdAt: Date.now(), data: data || {} };
    this._save();
  }
  getOAuthState(state) { return this._data.oauthStates[state] || null; }
  deleteOAuthState(state) { if (this._data.oauthStates[state]) { delete this._data.oauthStates[state]; this._save(); } }

  // ---- schedules ----
  listSchedules(userId) {
    return Object.keys(this._data.schedules)
      .map(id => this._data.schedules[id])
      .filter(s => s.userId === userId)
      .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  }
  getSchedule(id) { return this._data.schedules[id] || null; }
  upsertSchedule(s) { this._data.schedules[s.id] = s; this._save(); return s; }
  deleteSchedule(id) { if (this._data.schedules[id]) { delete this._data.schedules[id]; this._save(); } }

  // ---- integrations ----
  listIntegrations() {
    return Object.keys(this._data.integrations).map(p => {
      const it = this._data.integrations[p];
      return { provider: p, connected: !!it.connected, createdAt: it.createdAt };
    });
  }
  setIntegration(provider, meta) { this._data.integrations[provider] = Object.assign({ connected: true, createdAt: Date.now() }, meta || {}); this._save(); }
  removeIntegration(provider) { if (this._data.integrations[provider]) { delete this._data.integrations[provider]; this._save(); } }

  // ---- push subs ----
  listPushSubs(userId) { return this._data.pushSubs.filter(s => s.userId === userId); }
  addPushSub(sub) { this._data.pushSubs = this._data.pushSubs.filter(s => s.endpoint !== sub.endpoint); this._data.pushSubs.push(sub); this._save(); }
  removePushSub(endpoint) { const before = this._data.pushSubs.length; this._data.pushSubs = this._data.pushSubs.filter(s => s.endpoint !== endpoint); if (this._data.pushSubs.length !== before) this._save(); }

  // ---- notify prefs ----
  getNotifyPrefs(userId) { return this._data.notifyPrefs[userId] || null; }
  setNotifyPrefs(userId, prefs) { this._data.notifyPrefs[userId] = prefs || {}; this._save(); }

  // ---- 云同步快照（全量 + LWW）----
  getSnapshot(userId) { return this._data.snapshots[userId] || null; }
  /* updatedAt 用服务端接收时刻：客户端时钟不可信（可能快也可能慢），
     而 LWW 的比较基准必须是同一时钟，否则「客户端时钟快」就会让旧数据挤掉新数据。
     clientUpdatedAt 仅留作诊断（客户端自报时间），不参与比较。 */
  setSnapshot(userId, snapshot, clientUpdatedAt) {
    const rec = { snapshot, updatedAt: Date.now(), clientUpdatedAt: clientUpdatedAt || null };
    this._data.snapshots[userId] = rec;
    this._save();
    return rec;
  }
}

module.exports = Store;
module.exports.uid = uid;