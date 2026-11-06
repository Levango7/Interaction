/* server/src/notifications.js
 * 通知辅助端点：偏好 / Web Push / 定时提醒（挂载于 /api/notifications）。
 *
 * v3.7.122 从 extras.js 拆出。原因（审计遗留 P2，docs/backend-recovery-assessment.md §五）：
 * 原 index.js 把**同一个 extrasRouter 实例**挂到两个前缀下——
 *   app.use("/api/notifications", extrasRouter(cfg, store));
 *   app.use("/api/integrations",  extrasRouter(cfg, store));
 * 导致交叉路径（/api/integrations/preferences、/api/notifications/status 等）全部可达，
 * 攻击面翻倍（同一套 authMiddleware 保护、无越权，故定为 P2）。现按前缀拆成两个独立
 * router 工厂各挂各的；路由集合以客户端真实调用为准（grep -rhno '"/api/...' src/*.js：
 * notifications 侧 preferences/push/schedules，integrations 侧 status/oauth）。
 * 守护：verify/router-isolation-check.cjs（交叉路径必须 404 + not_found，合法路由必须仍 200）。
 *
 * v3.7.156 审计修复批（「绿却残废」三条 P0 收口）：
 *  · 偏好 GET/PUT 统一包 {preferences}（客户端读 r.data.preferences，此前服务端把 prefs
 *    当 data 平铺 ⇒ 永远走默认值）；PUT 改合并写（此前整体覆盖：客户端只发面板可编辑位，
 *    没读过的位被默认值冲掉）。
 *  · 定时提醒此前**没有任何调度器**（grep server/src 零 setInterval 消费 schedules），
 *    且客户端存 {type,cron,enabled}、服务端读 {title,when,repeat,note}，字段整段错位。
 *    现在服务端是单一权威：cron 在服务端解析（cron.js）、when 由服务端算
 *    （nextCronTime），进程内调度器 startScheduler 每 30s 扫到点就推 Web Push +
 *    落审计事件。旧记录 {title,when,repeat,note} 整体兼容（一次性：触发后 enabled=false）。
 *  · 新增 GET /vapid-public-key：此前客户端写死假公钥（非法 P-256 点 ⇒ subscribe 必抛错），
 *    订阅也从不 POST 服务端 ⇒ pushSubs 恒空。现在公钥从服务端取、订阅落库，链路闭合。
 *
 * 契约对齐前端 apiClientModule（/api/notifications/*）；账号数据 CRUD，走 authMiddleware 鉴权。
 */
"use strict";

const cron = require("./cron");
const wp = require("./web-push");

/* type 是前端三个预设的语义标签（UI 里决定推送文案分组），白名单收窄：
   非法的 type 落库没有意义（渲染端只认这三个）。 */
const SCHED_TYPES = ["taskDue", "dailyDigest", "habitBroken"];
function validateType(t) {
  const s = String(t || "");
  return SCHED_TYPES.indexOf(s) !== -1 ? s : null;
}

function notificationsRouter(cfg, store) {
  const express = require("express");
  const router = express.Router();
  const jwt = require("jsonwebtoken");
  const ok = (res, data) => res.json({ ok: true, data: data || {} });
  const fail = (res, status, error, data) => res.status(status || 400).json({ ok: false, error: error, data: data || {} });

  // 复用 auth.js 的同款鉴权中间件（各自闭包内实现，保持一致）
  const authMiddleware = () => (req, res, next) => {
    const h = req.header("authorization") || "";
    const token = h.startsWith("Bearer ") ? h.slice(7) : null;
    if (!token) return res.status(401).json({ ok: false, error: "no_token" });
    try { req.user = jwt.verify(token, cfg.jwt.accessSecret); next(); }
    catch (e) { return res.status(401).json({ ok: false, error: "invalid_token" }); }
  };
  const am = authMiddleware();

  // ===== 通知偏好 =====
  router.get("/preferences", am, (req, res) => {
    return ok(res, { preferences: store.getNotifyPrefs(req.user.sub) || { enabled: true } });
  });
  router.put("/preferences", am, (req, res) => {
    /* 合并写：客户端只发面板上可编辑的位，整体覆盖会把没读过的位写成默认值
       （即「保存一次偏好 = 丢一次别的位」）。 */
    const cur = store.getNotifyPrefs(req.user.sub) || {};
    const body = (req.body && typeof req.body === "object") ? req.body : {};
    store.setNotifyPrefs(req.user.sub, Object.assign({}, cur, body));
    return ok(res, { preferences: store.getNotifyPrefs(req.user.sub) });
  });

  // ===== VAPID 公钥（公开值：本来就下发给浏览器做订阅用，无需鉴权）=====
  router.get("/vapid-public-key", (req, res) => {
    try {
      const k = wp.ensureVapidKeys(store);
      return ok(res, { publicKey: wp.applicationServerKey(k.publicKey) });
    } catch (e) {
      return fail(res, 500, "vapid_unavailable", { message: (e && e.message) || String(e) });
    }
  });

  // ===== Web Push 订阅 =====
  router.post("/push/subscribe", am, (req, res) => {
    const sub = req.body || {};
    if (!sub || !sub.endpoint || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) {
      return fail(res, 400, "invalid_subscription", { message: "需要 endpoint 与 keys.p256dh / keys.auth" });
    }
    store.addPushSub({ endpoint: sub.endpoint, userId: req.user.sub, auth: sub.keys.auth, p256dh: sub.keys.p256dh, createdAt: Date.now() });
    return ok(res, {});
  });
  router.post("/push/unsubscribe", am, (req, res) => {
    const endpoint = String((req.body && req.body.endpoint) || "");
    /* v3.7.129（R-24）：必须带 req.user.sub —— endpoint 只是资源标识、不是凭据，
       此前只按 endpoint 删，任何登录用户都能删掉别人的推送订阅（idor-check 实测红）。 */
    if (endpoint) store.removePushSub(endpoint, req.user.sub);
    return ok(res, {});
  });

  // ===== 定时提醒（Schedules）=====
  /* 形状（服务端整存整回）：
     { id, userId, createdAt, type, cron, enabled, when, title, repeat, note, lastFiredAt }
     · cron 在**服务端**解析（单一权威，cron.js）：客户端时钟/时区不可信，且调度器
       扫描需要服务端可计算的 when。非法 cron → 400 bad_cron，不存一个永不触发的提醒。
     · when = 下次触发 epoch ms：有 cron 时服务端用 nextCronTime 算；旧形态（无 cron）
       接受客户端传入的绝对 when，调度器按一次性处理。 */
  router.get("/schedules", am, (req, res) => {
    return ok(res, { schedules: store.listSchedules(req.user.sub) });
  });
  router.post("/schedules", am, (req, res) => {
    const d = (req.body && typeof req.body === "object") ? req.body : {};
    const s = {
      id: store.uid("sch_"),
      userId: req.user.sub,
      createdAt: Date.now(),
      type: validateType(d.type),
      cron: null,
      enabled: d.enabled !== undefined ? !!d.enabled : true,
      when: null,
      title: String(d.title || "提醒").slice(0, 200),
      repeat: d.repeat !== undefined ? String(d.repeat) : "once",
      note: String(d.note || "").slice(0, 2000)
    };
    if (d.cron !== undefined && d.cron !== null && d.cron !== "") {
      const err = cron.cronValidationError(d.cron);
      if (err) return fail(res, 400, "bad_cron", { message: err });
      s.cron = String(d.cron).trim();
    }
    if (s.cron) {
      const when = cron.nextCronTime(s.cron, Date.now());
      if (when === null) return fail(res, 400, "bad_cron", { message: "4 年内没有可触发的时刻（如 2 月 31 号）" });
      s.when = when;
    } else if (Number(d.when) > 0) {
      s.when = Number(d.when);   // 旧形态：客户端直接指定绝对时刻
    } else {
      return fail(res, 400, "bad_schedule", { message: "需要 cron 或 when 之一" });
    }
    store.upsertSchedule(s);
    return ok(res, { schedule: s });
  });
  router.put("/schedules/:id", am, (req, res) => {
    const s = store.getSchedule(String(req.params.id));
    if (!s || s.userId !== req.user.sub) return fail(res, 404, "schedule_not_found");
    const d = (req.body && typeof req.body === "object") ? req.body : {};
    const next = Object.assign({}, s);
    if (d.title !== undefined) next.title = String(d.title || "提醒").slice(0, 200);
    if (d.note !== undefined) next.note = String(d.note || "").slice(0, 2000);
    if (d.repeat !== undefined) next.repeat = String(d.repeat);
    if (d.type !== undefined) next.type = validateType(d.type);
    if (d.enabled !== undefined) next.enabled = !!d.enabled;
    if (d.cron !== undefined) {
      if (d.cron === null || d.cron === "") {
        next.cron = null;   // 显式清空 cron：回到一次性形态
      } else {
        const err = cron.cronValidationError(d.cron);
        if (err) return fail(res, 400, "bad_cron", { message: err });
        next.cron = String(d.cron).trim();
      }
    }
    if (next.cron) {
      /* cron 变了或重新启用：重算 when（启用一个过期 when 会立即补发 —— 按设计，见调度器） */
      const when = cron.nextCronTime(next.cron, Date.now());
      if (when === null) return fail(res, 400, "bad_cron", { message: "4 年内没有可触发的时刻（如 2 月 31 号）" });
      next.when = when;
    } else if (Number(d.when) > 0) {
      next.when = Number(d.when);
    } else if (d.cron !== undefined) {
      next.when = null;   // cron 被清空且没给 when：提醒失效（不会被调度器捡起）
    }
    store.upsertSchedule(next);
    return ok(res, { schedule: store.getSchedule(s.id) });
  });
  router.delete("/schedules/:id", am, (req, res) => {
    /* v3.7.105 越权修复：原实现只按 id 从全局表删，**不看归属** ——
       任何已登录用户都能删掉别人的定时提醒（IDOR）。
       对比同文件的 PUT /schedules/:id 是有 s.userId !== req.user.sub 校验的，
       说明这条 DELETE 是遗漏而非设计。 */
    const s = store.getSchedule(String(req.params.id));
    if (!s || s.userId !== req.user.sub) return fail(res, 404, "schedule_not_found");
    store.deleteSchedule(String(req.params.id));
    return ok(res, {});
  });

  return router;
}

// ===== 进程内调度器（由 index.js 启动；router 工厂本身不启动，supertest 不受影响）=====

/** 扫一遍全部 schedules：到点（enabled && when<=now）的推送 + 落审计 + 重排。
 *  导出供单测直接调用（注入假 store/fetch）。 */
async function fireDueSchedules(store, vapidSubject, sendPush) {
  const push = sendPush || wp.sendPush;
  const vapid = wp.ensureVapidKeys(store);
  vapid.subject = vapidSubject || wp.SUBJECT_DEFAULT;
  const all = (store && typeof store.listAllSchedules === "function") ? store.listAllSchedules() : [];
  const now = Date.now();
  for (const s of all) {
    if (!s || s.enabled === false) continue;
    if (!s.when || Number(s.when) > now) continue;
    const subs = store.listPushSubs(s.userId) || [];
    const payload = JSON.stringify({
      title: String(s.title || "提醒"),
      body: String(s.note || ""),
      type: s.type || null,
      scheduleId: s.id,
      firedAt: now
    });
    for (const sub of subs) {
      /* 订阅表存的是扁平 {endpoint, p256dh, auth}，sendPush 要嵌套 keys —— 适配一次，
         不改存储形状（已落库的旧订阅不用迁移）。 */
      const r = await push({
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth }
      }, payload, vapid);
      if (r.gone) store.removePushSub(sub.endpoint, s.userId);
    }
    if (typeof store.addAudit === "function") {
      store.addAudit(s.userId, "schedule_fired", { scheduleId: s.id, title: s.title, subs: subs.length });
    }
    /* 重排：cron 型续下一次（算不出来 = 永不触发，直接停掉并如实标 enabled=false）；
       一次性（旧形态无 cron）触发即停 —— 保留 when 与 lastFiredAt 供客户端展示「已触发」。 */
    if (s.cron) {
      const when = cron.nextCronTime(s.cron, now);
      store.upsertSchedule(Object.assign({}, s, { when: when, lastFiredAt: now, enabled: when !== null }));
    } else {
      store.upsertSchedule(Object.assign({}, s, { enabled: false, lastFiredAt: now }));
    }
  }
}

/** 启动定时扫描。intervalMs 默认 30s（最小 1s 防配错）。
 *  上一轮没跑完（推送网络慢）就跳过本轮，不堆积并发。timer.unref：进程退出不等它。 */
function startScheduler(cfg, store) {
  const nCfg = (cfg && cfg.notifications) || {};
  const intervalMs = Number(nCfg.schedulerIntervalMs) > 999 ? Number(nCfg.schedulerIntervalMs) : 30000;
  const subject = nCfg.vapidSubject || wp.SUBJECT_DEFAULT;
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try { await fireDueSchedules(store, subject); }
    catch (e) { console.error("[scheduler] tick 失败：" + ((e && e.message) || e)); }
    finally { busy = false; }
  };
  const timer = setInterval(tick, intervalMs);
  if (timer && typeof timer.unref === "function") timer.unref();
  return { stop: () => clearInterval(timer), tick: tick };
}

module.exports = notificationsRouter;
module.exports.startScheduler = startScheduler;
module.exports.fireDueSchedules = fireDueSchedules;
module.exports.SCHED_TYPES = SCHED_TYPES;
