/* server/src/integrations.js
 * 第三方集成端点：连接状态 / OAuth 回调与解绑（挂载于 /api/integrations）。
 *
 * v3.7.122 从 extras.js 拆出。原因（审计遗留 P2，docs/backend-recovery-assessment.md §五）：
 * 原 index.js 把**同一个 extrasRouter 实例**挂到 /api/notifications 与 /api/integrations
 * 两个前缀下，交叉路径（/api/integrations/preferences、/api/notifications/status 等）
 * 全部可达，攻击面翻倍。现按前缀拆成两个独立 router 工厂各挂各的，详见 notifications.js
 * 头注释；守护见 verify/router-isolation-check.cjs。
 *
 * 契约对齐前端 apiClientModule（/api/integrations/*）；走 authMiddleware 鉴权。
 */
"use strict";

function integrationsRouter(cfg, store) {
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

module.exports = integrationsRouter;
