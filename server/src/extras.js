/* server/src/extras.js
 * 非鉴权辅助端点：通知偏好 / Web Push / 定时提醒 / 第三方集成。
 * 契约对齐前端 apiClientModule（/api/notifications/*、/api/integrations/*）。
 * 这些端点多数是账号数据 CRUD，走 authMiddleware 鉴权。
 */
"use strict";

function extrasRouter(cfg, store) {
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
    store.deleteSchedule(String(req.params.id));
    return ok(res, {});
  });

  // ===== 第三方集成 =====
  router.get("/status", am, (req, res) => {
    return ok(res, { integrations: store.listIntegrations() });
  });
  // OAuth 回调：code -> token -> 保存（未配置凭据时降级为占位连接）
  router.get("/oauth/:provider/callback", am, (req, res) => {
    const provider = String(req.params.provider || "");
    store.setIntegration(provider, { code: req.query.code || null, connected: true });
    return ok(res, { connected: true, provider });
  });
  router.delete("/oauth/:provider", am, (req, res) => {
    store.removeIntegration(String(req.params.provider));
    return ok(res, {});
  });

  return router;
}

module.exports = extrasRouter;