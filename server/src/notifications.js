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
 * 契约对齐前端 apiClientModule（/api/notifications/*）；账号数据 CRUD，走 authMiddleware 鉴权。
 */
"use strict";

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
    return ok(res, store.getNotifyPrefs(req.user.sub) || { enabled: true });
  });
  router.put("/preferences", am, (req, res) => {
    store.setNotifyPrefs(req.user.sub, req.body || {});
    return ok(res, store.getNotifyPrefs(req.user.sub));
  });

  // ===== Web Push 订阅 =====
  router.post("/push/subscribe", am, (req, res) => {
    const sub = req.body || {};
    if (!sub || !sub.endpoint) return fail(res, 400, "invalid_subscription");
    store.addPushSub({ endpoint: sub.endpoint, userId: req.user.sub, auth: sub.keys && sub.keys.auth || "", p256dh: sub.keys && sub.keys.p256dh || "", createdAt: Date.now() });
    return ok(res, {});
  });
  router.post("/push/unsubscribe", am, (req, res) => {
    const endpoint = String((req.body && req.body.endpoint) || "");
    if (endpoint) store.removePushSub(endpoint);
    return ok(res, {});
  });

  // ===== 定时提醒（Schedules）=====
  router.get("/schedules", am, (req, res) => {
    return ok(res, { schedules: store.listSchedules(req.user.sub) });
  });
  router.post("/schedules", am, (req, res) => {
    const d = req.body || {};
    const s = { id: store.uid("sch_"), userId: req.user.sub, createdAt: Date.now(), title: d.title || "提醒", when: d.when || null, repeat: d.repeat || "once", note: d.note || "" };
    store.upsertSchedule(s);
    return ok(res, { schedule: s });
  });
  router.put("/schedules/:id", am, (req, res) => {
    const s = store.getSchedule(String(req.params.id));
    if (!s || s.userId !== req.user.sub) return fail(res, 404, "schedule_not_found");
    const d = req.body || {};
    store.upsertSchedule(Object.assign(s, { title: d.title || s.title, when: d.when !== undefined ? d.when : s.when, repeat: d.repeat !== undefined ? d.repeat : s.repeat, note: d.note !== undefined ? d.note : s.note }));
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

module.exports = notificationsRouter;
