/* server/src/store.js
 * 零依赖 JSON 文件持久化（对齐前端 localStorage 的简洁形态）。
 * 数据结构：{ users, codes, sessions, oauthStates, schedules, integrations(停用), userIntegrations, pushSubs, notifyPrefs, vapid, snapshots, syncIncr }
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
      codes: {},        // "purpose:address" -> { code, expiresAt, issuedAt, used, purpose }（2026-10-24 起分桶，见 setCode 注释）
      sessions: {},     // refreshToken -> { userId, createdAt, expiresAt, deviceName }
      oauthStates: {},  // state -> { provider, createdAt, data }
      schedules: {},    // id -> { ... }（定时提醒：type/cron/enabled/when/title/note，见 notifications.js）
      integrations: {}, // 实例级 provider -> { connected, meta, createdAt }（**已停用**：无用户维度，见 listIntegrations 注释）
      userIntegrations: {}, // userId -> provider -> { connected, meta, createdAt }（v3.7.155 后的隔离形态）
      pushSubs: [],     // [ { endpoint, userId, createdAt } ]
      notifyPrefs: {},  // userId -> { ... }
      vapid: null,      // { publicKey, privateKey } base64url —— Web Push 发送方密钥，首次用到时自动生成（公开值可下发客户端）
      snapshots: {},    // userId -> { snapshot, updatedAt, serverUpdatedAt }（云同步，LWW 全量快照）
      syncIncr: {}      // userId -> { keys: {k:{v,ts,seq}}, tomb: {k:{ts,seq}}, watermark, prunedBelow }（增量视图，阶段 2）
    };
    this._load();
  }

  _load() {
    /* 审计修复批：原实现 catch 里写「损坏则重建空库」并继续启动 —— 但 _save() 是
       原子 rename 覆盖：内存态被重置成空库后，下一次任意写操作就把空库盖回磁盘，
       全部用户/会话/快照**不可恢复**。「静默重置 + 原子覆盖」合起来就是数据消失的
       双保险，且服务全程表现正常，无人知晓。
       现改为 fail fast：解析失败或顶层不是对象就抛错，进程起不来，运维去查同目录
       .bak.<时间戳> 滚动备份（见 _save）。文件不存在 = 首次启动，不抛。 */
    if (!fs.existsSync(this.file)) return;
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(this.file, "utf8"));
    } catch (e) {
      const err = new Error("数据文件损坏（JSON 解析失败），已拒绝启动以免空库覆盖磁盘："
        + ((e && e.message) || String(e)) + " | file=" + this.file
        + " | 可从同目录 " + path.basename(this.file) + ".bak.<时间戳> 滚动备份恢复");
      err.code = "STORE_CORRUPT";
      throw err;
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      const err = new Error("数据文件 JSON 顶层不是对象，已拒绝启动 | file=" + this.file);
      err.code = "STORE_CORRUPT";
      throw err;
    }
    this._data = Object.assign(this._data, parsed);
  }

  _save() {
    /* v3.7.105：原实现这里吞掉所有写盘异常且不落任何痕迹 —— 磁盘满 / 目录只读 / 权限不足时，
       服务照常响应「注册成功」，但数据从未落盘，重启后账号凭空消失，且无人知晓。
       这类「用户主动操作 + 成功有回执、失败静默」的静默即谎报。现改为必须留痕。 */
    try {
      const dir = path.dirname(this.file);
      if (dir && !fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      /* v3.7.114：数据文件内含 refresh token 与全部用户数据，等同凭证文件 ——
         目录 0700 / 文件 0600（POSIX；Windows 的 chmod 近乎空操作，不报错也不假装生效，
         权限收紧失败不影响写盘本身，只留一次 WARN）。权限判断见 security-check.cjs。 */
      try { if (dir) fs.chmodSync(dir, 0o700); } catch (e) { this._warnPermOnce("目录"); }
      /* 审计修复批：写盘前**滚动备份**当前磁盘版本（最多留 3 份 .bak.<时间戳>）。
         动机是 _load 的 fail fast 兄弟条款：损坏时进程拒绝启动，但「拒启动」只在
         还有得救时才有意义 —— 没有备份的话运维只能面对一份坏文件。复制用同步 IO、
         失败不阻塞主写盘流程（备份是韧性项，不是正确性项）。 */
      try {
        if (dir && fs.existsSync(this.file)) {
          fs.copyFileSync(this.file, this.file + ".bak." + Date.now());
          const pref = path.basename(this.file) + ".bak.";
          const keep = 3;
          const baks = fs.readdirSync(dir)
            .filter(n => n.startsWith(pref))
            .sort();                                  // 时间戳定长（13 位），字典序=时间序
          for (const n of baks.slice(0, Math.max(0, baks.length - keep))) {
            try { fs.unlinkSync(path.join(dir, n)); } catch (e) { /* 旧备份删不掉不阻塞 */ }
          }
        }
      } catch (e) { /* 备份失败不阻塞写盘 */ }
      const tmp = this.file + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify(this._data, null, 2), "utf8");
      try { fs.chmodSync(tmp, 0o600); } catch (e) { this._warnPermOnce("文件"); }
      fs.renameSync(tmp, this.file);
    } catch (e) {
      console.error("[agent-workbench-auth][ERROR] 数据落盘失败，内存态与磁盘已不一致：" +
        ((e && e.message) || String(e)) + " | file=" + this.file);
    }
  }
  _warnPermOnce(what) {
    if (this._permWarned) return;
    this._permWarned = true;
    console.warn("[agent-workbench-auth][WARN] 数据" + what + "权限收紧失败（不影响写盘）：" +
      this.file + " —— 请自行确认该文件只有服务账户可读（内含 refresh token 与全部用户数据）。");
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
  /* issuedAt（2026-10-23 短信验证码）：此前只有 expiresAt，"这个码是什么时候发的"只能靠
     expiresAt - ttl 反推，一旦 ttl 在两次请求之间被改过就推错。短信通道是按条计费的，
     「同一号码 60 秒内重发」要么靠限流器的固定窗口（窗口边界会放过 2×max），要么靠
     这个真实签发时刻——后者才是精确判据。邮箱路径只是多一个字段，行为不变。

     🔴 2026-10-24 分桶（密码重置批次）：此前 key **只有地址**（`codes[email]`），而 setCode
     收到的 purpose 只被**写进记录、从未被读取** —— 代码看起来分了用途，实际没有任何一处校验它。
     后果不是"理论上可能串用"，而是**一处覆盖即失效**：同一邮箱先发注册码（purpose=register）、
     再发重置码（purpose=reset）时，后者直接盖掉前者 ⇒ 回到注册页输原来那个码，报的是
     `code_invalid`，而用户手里那张邮件明明是对的。
     现在 key = `purpose:address`，两种码各占一格可并存；读侧**同时校验 purpose**：
     记录里的 purpose 与本次要用的不符一律当作没有这个码（拿注册码去重置、拿重置码去注册都被拒）。

     `getCode` 保留对**老 key**（裸地址）的回退，否则升级瞬间所有在跑的注册/登录会一起失配；
     回退分支同样过 purpose 校验，所以兼容不等于放水。 */
  _codeKey(addr, purpose) { return String(purpose || "register") + ":" + String(addr || "").toLowerCase(); }
  _findCode(addr, purpose) {
    const p = purpose || "register";
    const key = this._codeKey(addr, p);
    const rec = this._data.codes[key];
    if (rec) return { key: key, rec: rec };
    const legacyKey = String(addr || "").toLowerCase();
    const legacy = this._data.codes[legacyKey];
    // 老数据：purpose 在记录里写着（setCode 一直有存），对不上就不认
    if (legacy && (legacy.purpose || "register") === p) return { key: legacyKey, rec: legacy };
    return null;
  }
  setCode(addr, code, ttlSec, purpose) {
    const p = purpose || "register";
    const key = this._codeKey(addr, p);
    const now = Date.now();
    /* 审计修复批：兑现下行那条挂了许久的注释（"在发新码时顺带清同邮箱旧码"）。
       分桶后同桶直接被覆盖，但**过期**的其它桶仍会无限堆积 —— 发码是天然的
       低频清扫窗口（比单独开定时器省一个起停点），在此一并清掉。
       只清 expiresAt 已过的（used 未过期的仍按 TTL 保留，读取侧本就不认过期码）。 */
    for (const k of Object.keys(this._data.codes)) {
      const rec = this._data.codes[k];
      if (k !== key && rec && rec.expiresAt && rec.expiresAt < now) delete this._data.codes[k];
    }
    this._data.codes[key] = {
      code, purpose: p,
      expiresAt: now + (ttlSec || 600) * 1000,
      issuedAt: now,
      used: false
    };
    this._save();
  }
  getCode(addr, purpose) { const f = this._findCode(addr, purpose); return f ? f.rec : null; }
  markCodeUsed(addr, purpose) { const f = this._findCode(addr, purpose); if (f) { f.rec.used = true; this._save(); } }
  /* 清掉某地址某用途的码（重置成功后立刻作废，别等 TTL；也让"改完密码再点一次"必然失败） */
  deleteCode(addr, purpose) {
    const f = this._findCode(addr || "", purpose);
    if (f) { delete this._data.codes[f.key]; this._save(); }
  }
  /** 过期码公开清扫入口（供启动/定时调用）。只在有删除时落盘；返回清掉的条数。 */
  sweepCodes() {
    const now = Date.now();
    let n = 0;
    for (const k of Object.keys(this._data.codes)) {
      const rec = this._data.codes[k];
      if (rec && rec.expiresAt && rec.expiresAt < now) { delete this._data.codes[k]; n++; }
    }
    if (n) this._save();
    return n;
  }

  // ---- sessions ----
  /** 懒清理过期会话：refresh token 有 TTL（默认 30 天），过期且不再被使用的会话
   *  otherwise 永远占着（refresh 路径只在有人拿它换新 token 时才顺带删自己那一条）。
   *  惰性触发 = 启动时扫一次（见 index.js），不引入后台定时器。返回清掉的条数。 */
  sweepSessions() {
    const now = Date.now();
    let n = 0;
    for (const rt of Object.keys(this._data.sessions)) {
      const s = this._data.sessions[rt];
      if (s && s.expiresAt && s.expiresAt < now) { delete this._data.sessions[rt]; n++; }
    }
    if (n) this._save();
    return n;
  }
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
  /* 返回删掉的会话数：改密（2026-10-24）要把「踢掉了几台设备」如实回给用户与审计，
     返回 void 的话只能写「已吊销」，而用户想知道的是"是不是连我办公室那台也断了"。 */
  deleteUserSessions(userId) {
    let changed = false;
    let n = 0;
    Object.keys(this._data.sessions).forEach(rt => {
      if (this._data.sessions[rt].userId === userId) { delete this._data.sessions[rt]; changed = true; n++; }
    });
    if (changed) this._save();
    return n;
  }

  // ---- oauth states ----
  setOAuthState(state, provider, data) {
    this._data.oauthStates[state] = { provider, createdAt: Date.now(), data: data || {} };
    this._save();
  }
  getOAuthState(state) { return this._data.oauthStates[state] || null; }
  deleteOAuthState(state) { if (this._data.oauthStates[state]) { delete this._data.oauthStates[state]; this._save(); } }
  /* 惰性清扫：state 只由回调消费删除，"授权中途放弃"的 state 会无限堆积（JSON 数据文件缓慢膨胀）。
     maxAgeMs 之外的判定不归 store 管（TTL 是 auth.js 的策略），store 只按年龄删。
     返回删掉的条数（仅日志用）；任何异常都不许影响主流程。 */
  sweepOAuthStates(maxAgeMs) {
    try {
      const now = Date.now();
      const max = Number(maxAgeMs) || 600000;
      let n = 0;
      for (const s of Object.keys(this._data.oauthStates)) {
        const rec = this._data.oauthStates[s];
        if (rec && rec.createdAt && now - rec.createdAt > max) { delete this._data.oauthStates[s]; n++; }
      }
      if (n) this._save();
      return n;
    } catch (e) { return 0; }
  }

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
  /** 调度器遍历用（notifications.js startScheduler 每 30s 扫一遍）：
      返回全部提醒、不过滤用户 —— 调度器按 userId 取各自的推送订阅再发。 */
  listAllSchedules() {
    return Object.keys(this._data.schedules).map(id => this._data.schedules[id]);
  }

  // ---- integrations ----
  /* 审计修复批：原 listIntegrations/setIntegration/removeIntegration 是**实例级**
     provider -> meta 字典 —— 任何登录用户都能读、连、断全实例的集成，且 provider
     是路径段（任意键可污染存储，无界增长）。这是 lint-server-idor.mjs 白名单里
     自我登记的已知缺口。现按 userId 隔离（与 notifyPrefs / schedules 同维度）。
     旧字典（this._data.integrations）保留在文件里不再被任何路由读取 —— 那些连接
     从来没换过真 token（回调只存 code 占位），按"未连接"如实呈现。
     userId/provider 缺一即拒（漏 userId 就写进去 = 退回实例级）。 */
  listIntegrations(userId) {
    const mine = this._data.userIntegrations && this._data.userIntegrations[userId];
    if (!mine || typeof mine !== "object") return [];
    return Object.keys(mine).map(p => {
      const it = mine[p];
      return { provider: p, connected: !!it.connected, createdAt: it.createdAt };
    });
  }
  setIntegration(userId, provider, meta) {
    if (!userId || !provider) return null;
    if (!this._data.userIntegrations) this._data.userIntegrations = {};
    if (!this._data.userIntegrations[userId]) this._data.userIntegrations[userId] = {};
    this._data.userIntegrations[userId][provider] = Object.assign({ connected: true, createdAt: Date.now() }, meta || {});
    this._save();
    return this._data.userIntegrations[userId][provider];
  }
  removeIntegration(userId, provider) {
    const mine = this._data.userIntegrations && this._data.userIntegrations[userId];
    if (mine && mine[provider]) { delete mine[provider]; this._save(); }
  }

  // ---- push subs ----
  listPushSubs(userId) { return this._data.pushSubs.filter(s => s.userId === userId); }
  addPushSub(sub) { this._data.pushSubs = this._data.pushSubs.filter(s => s.endpoint !== sub.endpoint); this._data.pushSubs.push(sub); this._save(); }
  /* v3.7.129（R-24）：按外部键删改**必须判归属** —— endpoint 是资源标识而非凭据
     （知道 endpoint ≠ 有权删它）。此前只按 endpoint 删，任何登录用户都能删掉别人的推送订阅；
     同一形态的第三次（v3.7.105 修过 devices 与 schedules）。userId 为必传参数：漏传就删不掉
     任何人的订阅，表现为静默失败 —— 宁可这样，也不留「不传就删全部」的向后兼容口子。 */
  removePushSub(endpoint, userId) {
    const before = this._data.pushSubs.length;
    this._data.pushSubs = this._data.pushSubs.filter(s => !(s.endpoint === endpoint && s.userId === userId));
    if (this._data.pushSubs.length !== before) this._save();
  }

  // ---- notify prefs ----
  getNotifyPrefs(userId) { return this._data.notifyPrefs[userId] || null; }
  setNotifyPrefs(userId, prefs) { this._data.notifyPrefs[userId] = prefs || {}; this._save(); }

  // ---- Web Push 发送方密钥（VAPID）----
  /* 公开值（publicKey）可随意下发给客户端用于订阅；privateKey 是发送方凭据。
     首次用到时由 web-push.js 自动生成并存到这里 —— 单文件零配置部署不需要
     运维事先填密钥（与 jwt secret 的"占位即拒"不同：VAPID 是自签的应用密钥，
     自动生成即可，不是共享密钥）。返回 { publicKey, privateKey }（base64url）。 */
  getVapidKeys() { return (this._data.vapid && this._data.vapid.publicKey) ? this._data.vapid : null; }
  setVapidKeys(keys) {
    if (!keys || !keys.publicKey || !keys.privateKey) return;
    this._data.vapid = { publicKey: keys.publicKey, privateKey: keys.privateKey };
    this._save();
  }

  // ---- 审计日志（v3.7.110 生产化）----
  /* 记「谁在什么时候做了什么」。**有界环形**（AUDIT_MAX，默认 200，溢出丢最旧）——
     它是"近期活动"而不是合规归档（要不可变归档需外置存储，README 已写清单）。
     仅记安全相关事件（register/login/logout/device_delete）；同步读写太高频，不进环
     —— 同步量看服务端访问日志。 */
  addAudit(userId, ev, ctx) {
    if (!this._data.audit) this._data.audit = {};
    const max = Number(process.env.AUDIT_MAX) || 200;
    let list = this._data.audit[userId];
    if (!Array.isArray(list)) list = [];
    list.push({ at: Date.now(), ev: String(ev || "?"), ctx: (ctx && typeof ctx === "object") ? ctx : {} });
    if (list.length > max) list = list.slice(list.length - max);
    this._data.audit[userId] = list;
    this._save();
    return list[list.length - 1];
  }
  /** 只返回本人的（调用方必须传 req.user.sub —— 越权读取在这里就没有入口） */
  getAudit(userId, since) {
    const list = this._data.audit && this._data.audit[userId];
    if (!Array.isArray(list)) return [];
    const s = Number(since) || 0;
    return list.filter((e) => !s || (e && e.at > s));
  }

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