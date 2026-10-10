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
      snapshots: {},    // userId -> { snapshot, updatedAt, serverUpdatedAt }（云同步，LWW 全量快照）
      syncIncr: {}      // userId -> { keys: {k:{v,ts,seq}}, tomb: {k:{ts,seq}}, watermark, prunedBelow }（增量视图，阶段 2）
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
  /* v3.7.105：为每个会话生成独立 sid。此前设备 id 借用 refreshToken 前 8 字符，
     而 JWT 的 header 段在所有会话里相同 → 所有设备 id 前缀一致，删设备退化成删任意会话。
     sid 与 refreshToken 解耦：换 token 不影响设备标识，且不暴露 token 片段。 */
  saveSession(s) {
    if (!s.sid) s.sid = crypto.randomBytes(6).toString("hex");
    this._data.sessions[s.refreshToken] = s;
    this._save();
    return s;
  }
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
  /* updatedAt 必须**与客户端时钟同源**：客户端推送成功后用本地 Date.now() 记录 lastPushAt
     （ui-ge-api.js:546），随后拿它跟服务端返回的 updatedAt 比大小判断「云端是否有其他设备的更新」
     （render-overview.js:1413），并直接 new Date(ts).toLocaleString() 展示（:1428）。
     若服务端换成自己的时间，跨设备部署时两边时钟不一致就会判错方向：
     服务端快 → 每次都误报「有其他设备更新」；服务端慢 → 真的远端更新被忽略。
     （同机 localhost 两者同钟，所以本地联调看不出这个错 —— 一度就是这么误判的。）
     serverUpdatedAt 仅作诊断，不参与任何比较。
     已知局限：多客户端各用自己的时钟 → 它们之间的 LWW 比较本就不可靠，
     这是客户端既有契约带来的，需客户端与服务端一起改才能解，不在服务端单边处理。 */
  setSnapshot(userId, snapshot, clientUpdatedAt) {
    const rec = {
      snapshot,
      updatedAt: clientUpdatedAt || Date.now(),
      serverUpdatedAt: Date.now(),
    };
    this._data.snapshots[userId] = rec;
    /* 阶段 2：全量落盘 = 重建逐键视图（见 _rebuildIncr 注释）——两条路（全量/增量）必须同世界。 */
    this._rebuildIncr(userId, snapshot, rec.updatedAt);
    this._save();
    return rec;
  }

  /* ============================================================
   * 增量同步（阶段 2，2026-10-10）
   * 设计（完整契约见 docs/cloud-sync-incremental-contract.md §二/§三）：
   *   · 逐键视图 keys[k] = { v, ts, seq }：v=值、ts=**客户端自报**的变更时间（与全量
   *     updatedAt 同一时钟口径；多客户端跨钟的 LWW 局限同全量路径，已文档化）、
   *     seq=服务端分配的单调水位（逐键版本号）；
   *   · tomb[k] = { ts, seq }：删除墓碑 —— 现行全量协议靠「键消失」表达删除，增量必须显式；
   *   · watermark：服务端权威、单调递增；响应里的 token = 它（客户端下次带 since=token）；
   *   · 剪枝：tomb 超过 TOMB_MAX 丢最旧，prunedBelow 记录已丢水位 —— 客户端 since 低于
   *     它时无法重放历史 ⇒ 回 needsFull=true，客户端走全量回退（下行保留全量回退的口子）；
   *   · 幂等：同 (k,v,ts) 重放不改状态、水位不动（移动端重试是常态）；
   *   · LWW：ts 大者胜；ts 相等时**删除胜**（确定性平局规则，且防「重放已删键把它复活」）；
   *   · `_` 前缀键（如 _deviceMeta）是快照级元数据，不进逐键视图。
   * ============================================================ */
  static _isMetaKey(k) { return typeof k !== "string" || !k || k.charAt(0) === "_"; }

  /** 取（必要时惰性建/迁移）某用户的增量视图。首建时若已有全量快照则就地播种 ——
   *  老库（只有 snapshots 没有 syncIncr）不能表现为「什么都没有」，那会让增量端漏掉全部既有键。 */
  _incr(userId) {
    if (!this._data.syncIncr) this._data.syncIncr = {};
    let s = this._data.syncIncr[userId];
    if (!s) {
      s = { keys: {}, tomb: {}, watermark: 0, prunedBelow: 0 };
      const rec = this._data.snapshots[userId];
      if (rec && rec.snapshot && typeof rec.snapshot === "object") {
        const ts = rec.updatedAt || Date.now();
        for (const k of Object.keys(rec.snapshot)) {
          if (!Store._isMetaKey(k)) s.keys[k] = { v: rec.snapshot[k], ts, seq: ++s.watermark };
        }
      }
      this._data.syncIncr[userId] = s;
    }
    if (!s.keys || typeof s.keys !== "object") s.keys = {};
    if (!s.tomb || typeof s.tomb !== "object") s.tomb = {};
    if (!s.conflicts || typeof s.conflicts !== "object") s.conflicts = {};   // v3.7.109 mv 冲突清单
    if (typeof s.watermark !== "number") s.watermark = 0;
    if (typeof s.prunedBelow !== "number") s.prunedBelow = 0;
    return s;
  }

  /** v3.7.109（mv+提示）：记一条冲突。同一键只留最新一条（旧证据没意义）；
   *  上限 50 条，溢出丢最旧（超出的冲突在客户端表现为"下次全量再对"）。 */
  _recordConflict(s, k, local, remote) {
    s.conflicts[k] = { k: k, local: local, remote: remote, at: Date.now() };
    const ks = Object.keys(s.conflicts);
    if (ks.length > 50) {
      ks.sort((a, b) => (s.conflicts[a].at || 0) - (s.conflicts[b].at || 0));
      ks.slice(0, ks.length - 50).forEach((kk) => { delete s.conflicts[kk]; });
    }
  }

  /**
   * 全量 PUT 后重建逐键视图：快照是权威 —— 每个键取新 seq（对增量端而言「全量重定义」
   * 就是所有键都变了），快照里消失的键补 tombstone。保证「一台走全量、另一台走增量」同世界。
   */
  _rebuildIncr(userId, snapshot, ts) {
    const s = this._incr(userId);
    const next = {};
    for (const k of Object.keys(snapshot || {})) {
      if (!Store._isMetaKey(k)) next[k] = { v: snapshot[k], ts, seq: ++s.watermark };
    }
    for (const k of Object.keys(s.keys)) {
      if (!(k in next)) s.tomb[k] = { ts, seq: ++s.watermark };
    }
    for (const k of Object.keys(next)) delete s.tomb[k];
    s.keys = next;
    this._pruneTomb(s);
  }

  _pruneTomb(s) {
    const TOMB_MAX = 200;
    const ks = Object.keys(s.tomb);
    if (ks.length <= TOMB_MAX) return;
    ks.sort((a, b) => (s.tomb[a].seq || 0) - (s.tomb[b].seq || 0));
    let maxDropped = 0;
    for (const k of ks.slice(0, ks.length - TOMB_MAX)) {
      maxDropped = Math.max(maxDropped, s.tomb[k].seq || 0);
      delete s.tomb[k];
    }
    s.prunedBelow = Math.max(s.prunedBelow, maxDropped);
  }

  /**
   * 增量一轮：先应用上行（changes/removed），再返回 since 之后的下行。
   * @returns {{token:number, changed:Array<{k,v,ts}>, removed:Array<{k,ts}>, needsFull:boolean}}
   */
  mergeIncremental(userId, payload) {
    const s = this._incr(userId);
    const since = Math.max(0, Number(payload && payload.since) || 0);
    const inChanges = Array.isArray(payload && payload.changes) ? payload.changes : [];
    const inRemoved = Array.isArray(payload && payload.removed) ? payload.removed : [];
    const appliedSets = [], appliedDels = [];
    let maxAppliedTs = 0;
    /* v3.7.109（mv+提示）：冲突策略由**服务端下发**（cfg.sync.conflictPolicy，"lww" 默认）。
       lww：输了的一方静默丢弃（现状，零行为变化）；mv：输了的一方记进冲突清单下发给客户端，
       由客户端做结构化合并（如任务数组按 id×updatedAt）或让用户「保留本机 / 使用云端」二选一。
       注意：服务端**不替客户端合并** —— 合并语义在客户端（单边做会"后端以为在合并、客户端以为被覆盖"）。 */
    const mv = payload.conflictPolicy === "mv";
    for (const c of inChanges) {
      const k = c && c.k, ts = Number(c && c.ts) || 0;
      if (Store._isMetaKey(k)) continue;
      const cur = s.keys[k], t = s.tomb[k];
      if (cur && cur.ts === ts && cur.v === c.v) continue;     // 幂等重放（同值同刻）—— 与策略无关
      if (t && t.ts >= ts) continue;                           // 删除胜平局（确定性，与策略无关）
      if (cur && cur.ts > ts) {                                // 服务端已有更新
        if (mv) this._recordConflict(s, k, { v: c.v, ts }, { v: cur.v, ts: cur.ts });
        continue;                                              // 两策略都不应用（mv 只是把它记下来）
      }
      if (cur && cur.ts === ts && cur.v !== c.v) {             // 同刻不同值 = 并发写
        if (mv) this._recordConflict(s, k, { v: c.v, ts }, { v: cur.v, ts: cur.ts });
        continue;                                              // mv：留住服务端值，交给客户端解决
      }
      s.keys[k] = { v: c.v, ts, seq: ++s.watermark };
      delete s.tomb[k];
      delete s.conflicts[k];                                   // 新值落定 → 该键旧冲突作废
      appliedSets.push(k);
      if (ts > maxAppliedTs) maxAppliedTs = ts;
    }
    for (const r of inRemoved) {
      const k = r && r.k, ts = Number(r && r.ts) || 0;
      if (Store._isMetaKey(k)) continue;
      const cur = s.keys[k], t = s.tomb[k];
      if (cur && cur.ts > ts) {                                // 本地更新更晚 → 不删
        if (mv) this._recordConflict(s, k, { v: null, ts }, { v: cur.v, ts: cur.ts });   // v:null = 本机选择删除
        continue;
      }
      if (t && t.ts >= ts) continue;                           // 已有同/更新墓碑 → 幂等
      delete s.keys[k];
      s.tomb[k] = { ts, seq: ++s.watermark };
      delete s.conflicts[k];
      appliedDels.push(k);
      if (ts > maxAppliedTs) maxAppliedTs = ts;
    }
    const dirty = appliedSets.length > 0 || appliedDels.length > 0;
    if (dirty) this._pruneTomb(s);
    /* 快照记录随增量保持相干：逐键补丁（O(变更数)，不重写整快照）——
       否则「增量客户端 UP 的键、全量客户端 GET 不到」。无快照记录时建一份（键由补丁填入）。 */
    if (dirty) {
      if (!this._data.snapshots[userId]) {
        this._data.snapshots[userId] = { snapshot: {}, updatedAt: maxAppliedTs || Date.now(), serverUpdatedAt: Date.now() };
      }
      const rec = this._data.snapshots[userId];
      if (rec.snapshot && typeof rec.snapshot === "object") {
        for (const k of appliedSets) rec.snapshot[k] = s.keys[k].v;
        for (const k of appliedDels) delete rec.snapshot[k];
        if (maxAppliedTs > 0) rec.updatedAt = Math.max(rec.updatedAt || 0, maxAppliedTs);
        rec.serverUpdatedAt = Date.now();
      }
      this._save();
    }
    const needsFull = since < s.prunedBelow;
    const changed = [], removed = [];
    if (!needsFull) {
      for (const k of Object.keys(s.keys)) if (s.keys[k].seq > since) changed.push({ k, v: s.keys[k].v, ts: s.keys[k].ts });
      for (const k of Object.keys(s.tomb)) if (s.tomb[k].seq > since) removed.push({ k, ts: s.tomb[k].ts });
    }
    /* v3.7.109：冲突清单随响应下发（lww 下恒为空数组）。local = 本机那个输了的值
       （v:null 表示本机想删）、remote = 服务端当前值；at = 记录时刻。 */
    const conflicts = [];
    for (const k of Object.keys(s.conflicts)) {
      const c = s.conflicts[k];
      conflicts.push({ k: c.k, local: c.local, remote: c.remote, at: c.at });
    }
    return { token: s.watermark, changed, removed, needsFull, conflictPolicy: payload.conflictPolicy === "mv" ? "mv" : "lww", conflicts };
  }

  /**
   * v3.7.109（mv+提示）：解决一条冲突。choice = "local"（本机值）/ "remote"（服务端值）。
   * clientTs 由客户端提供（与全量路径同一时钟口径）；实际落定取 max(客户端 ts, 双方 ts)
   * —— 解决必须新于双方，否则下一轮又被判成"输了"。
   * 返回 { ok, token } 或 { ok:false, error }。
   */
  resolveConflict(userId, k, choice, clientTs) {
    const s = this._incr(userId);
    const c = s.conflicts && s.conflicts[k];
    if (!c) return { ok: false, error: "not_found" };
    if (choice !== "local" && choice !== "remote") return { ok: false, error: "invalid_choice" };
    const pick = choice === "local" ? c.local : c.remote;
    if (!pick) return { ok: false, error: "invalid_choice" };
    const ts = Math.max(Number(clientTs) || 0, Number(c.local && c.local.ts) || 0, Number(c.remote && c.remote.ts) || 0);
    if (pick.v === null || pick.v === undefined) {
      delete s.keys[k];                       // 选"本机删除" → 落墓碑
      s.tomb[k] = { ts, seq: ++s.watermark };
    } else {
      s.keys[k] = { v: pick.v, ts, seq: ++s.watermark };
      delete s.tomb[k];
    }
    delete s.conflicts[k];
    /* 快照记录逐键补丁（与 mergeIncremental 同口径：全量 GET 必须看得到解决结果） */
    if (!this._data.snapshots[userId]) {
      this._data.snapshots[userId] = { snapshot: {}, updatedAt: ts, serverUpdatedAt: Date.now() };
    }
    const rec = this._data.snapshots[userId];
    if (rec.snapshot && typeof rec.snapshot === "object") {
      if (pick.v === null || pick.v === undefined) delete rec.snapshot[k]; else rec.snapshot[k] = pick.v;
      rec.updatedAt = Math.max(rec.updatedAt || 0, ts);
      rec.serverUpdatedAt = Date.now();
    }
    this._save();
    return { ok: true, token: s.watermark };
  }
}

module.exports = Store;
module.exports.uid = uid;