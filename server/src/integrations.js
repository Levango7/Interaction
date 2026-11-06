/* server/src/integrations.js
 * 第三方集成端点：连接状态 / OAuth 回调与解绑（挂载于 /api/integrations）。
 *
 * v3.7.122 从 extras.js 拆出。原因（审计遗留 P2，docs/backend-recovery-assessment.md §五）：
 * 原 index.js 把**同一个 extrasRouter 实例**挂到 /api/integrations 与 /api/integrations
 * 两个前缀下，交叉路径（/api/integrations/preferences、/api/notifications/status 等）
 * 全部可达，攻击面翻倍。现按前缀拆成两个独立 router 工厂各挂各的，详见 notifications.js
 * 头注释；守护见 verify/router-isolation-check.cjs。
 *
 * v3.7.156 审计修复批（P0-3 + P1-6 收口）：
 *  · **userId 维度**：原三条路由都是实例级（store.listIntegrations() / setIntegration(provider) /
 *    removeIntegration(provider)），任何登录用户可读写**全实例**的集成 —— lint-server-idor.mjs
 *    白名单里自我登记的已知缺口。现在全部按 req.user.sub 作用域（store 侧已改
 *    userIntegrations[userId][provider]）。
 *  · **provider 白名单**：原实现 provider 是裸路径段（任意字符串可落库，无界污染存储）。
 *    现在只认 PROVIDERS 注册表里的三个键。
 *  · **不再「占位连接」**：原回调把 code 收下即弃、无条件回 connected:true —— 面板永远
 *    「已连接」但从来没有真 token（client-contract-check 绿通道就是它的遮羞布）。
 *    现在 connected 只在 token 交换成功后置真；provider 凭据未配置时如实回
 *    {connected:false, reason:"not_configured"}（仍 200，让客户端能展示真实原因）。
 *  · token 交换零依赖走 https，目标主机来自下方**常量注册表**（不是用户输入）——
 *    与 tools-fetch 的 SSRF 硬化不同面积：那里代理的是用户指定的任意 URL，这里固定。
 *
 * 契约对齐前端 apiClientModule（/api/integrations/*）；走 authMiddleware 鉴权。
 */
"use strict";

/* 已知 provider 注册表：URL 与交换口径都是**常量**（不来自用户输入）。
   scope/authorizeUrl 给客户端拼授权页；tokenUrl + basicAuth/jsonBody 给服务端换 token。
   凭据（clientId/clientSecret/redirectUri）来自 cfg.integrations[provider]，
   未配置 ⇒ status 里 configured=false、回调走 not_configured 分支（不假装连上）。 */
const PROVIDERS = {
  notion: {
    authorizeUrl: "https://api.notion.com/v1/oauth/authorize",
    tokenUrl: "https://api.notion.com/v1/oauth/token",
    basicAuth: true,
    jsonBody: true
  },
  todoist: {
    authorizeUrl: "https://todoist.com/oauth/authorize",
    tokenUrl: "https://api.todoist.com/oauth/token"
  },
  google: {
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scope: "https://www.googleapis.com/auth/calendar"  // 面板按钮是 Google Calendar
  }
};

function validProvider(p) {
  const s = String(p || "").trim();
  return Object.prototype.hasOwnProperty.call(PROVIDERS, s) ? s : null;
}

/** 零依赖 OAuth code -> token 交换（固定主机，超时 10s）。失败 reject，调用方 502。 */
function exchangeCode(prov, cred, code) {
  return new Promise((resolve, reject) => {
    const https = require("https");
    const u = new URL(prov.tokenUrl);
    const headers = { "Accept": "application/json" };
    let body;
    if (prov.jsonBody) {
      headers["Content-Type"] = "application/json";
      const payload = { grant_type: "authorization_code", code: code };
      if (prov.basicAuth) {
        headers["Authorization"] = "Basic " + Buffer.from(cred.clientId + ":" + cred.clientSecret).toString("base64");
      } else {
        payload.client_id = cred.clientId;
        payload.client_secret = cred.clientSecret;
      }
      if (cred.redirectUri) payload.redirect_uri = cred.redirectUri;
      body = JSON.stringify(payload);
    } else {
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      const form = new URLSearchParams({ grant_type: "authorization_code", code: code, client_id: cred.clientId, client_secret: cred.clientSecret });
      if (cred.redirectUri) form.set("redirect_uri", cred.redirectUri);
      body = String(form);
    }
    const req = https.request({
      hostname: u.hostname, port: u.port || 443, path: u.pathname + u.search,
      method: "POST", headers: headers, timeout: 10000
    }, (r) => {
      let d = "";
      r.on("data", (x) => { d += x; });
      r.on("end", () => {
        if (r.statusCode >= 200 && r.statusCode < 300) {
          try { resolve(JSON.parse(d)); } catch (e) { reject(new Error("bad_token_response")); }
        } else {
          reject(new Error("token_endpoint_" + r.statusCode));
        }
      });
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.end(body);
  });
}

/** 浏览器直达的回调结果页：把结果 postMessage 给开窗的应用页（同 ghCallbackPage 的口径）。
 *  载荷不含任何 token —— 应用侧收到消息后**重新拉 /status 取真值**，所以这条消息
 *  即使被伪造也只能触发一次「重新查询」，无法伪造连接状态本身。 */
function integrationsResultPage(provider, connected, errCode, targetOrigin) {
  const payload = JSON.stringify({ type: "agent-integrations-connected", provider: provider, connected: !!connected, error: connected ? null : String(errCode || "unknown") })
    .replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
  const target = JSON.stringify(String(targetOrigin || "*"));
  const title = connected ? "连接成功" : "连接失败";
  const msg = connected ? "已连接，正在返回应用…" : ("连接失败：" + (errCode || "unknown") + "，请回到应用重试或联系部署者");
  return "<!doctype html><html lang=\"zh-CN\"><head><meta charset=\"utf-8\"><title>" + title + "</title></head>"
    + "<body style=\"font:14px/1.6 system-ui,sans-serif;text-align:center;padding-top:48px\">"
    + "<p>" + msg + "</p><p><a href=\"#\" onclick=\"window.close();return false\">如未自动返回，点击关闭</a></p>"
    + "<script>(function(){try{if(window.opener)window.opener.postMessage(" + payload + "," + target + ");}catch(e){}"
    + "setTimeout(function(){try{window.close();}catch(e){}},1200);})();</script></body></html>";
}

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

  const cred = (provider) => ((cfg.integrations && cfg.integrations[provider]) || {});
  /* 回调结果页的 postMessage targetOrigin：与 github 通道同口径（默认 "*" 只发给
     opener 本身；部署在同源域名下时配成具体源更严）。 */
  const postMessageOrigin = (cfg.integrations && cfg.integrations.postMessageOrigin) || "*";

  // ===== 第三方集成 =====
  /* status 返回两块：该用户已连的集成（connected 真值）+ provider 目录（configured 标志与
     授权页 URL —— 客户端据此决定「打开授权页」还是「提示部署者填凭据」）。 */
  router.get("/status", am, (req, res) => {
    const providers = {};
    Object.keys(PROVIDERS).forEach((name) => {
      const c = cred(name);
      const p = { configured: !!(c.clientId && c.clientSecret), authorizeUrl: null };
      if (c.clientId) {
        const au = new URL(PROVIDERS[name].authorizeUrl);
        au.searchParams.set("client_id", c.clientId);
        au.searchParams.set("response_type", "code");
        if (c.redirectUri) au.searchParams.set("redirect_uri", c.redirectUri);
        if (PROVIDERS[name].scope) au.searchParams.set("scope", PROVIDERS[name].scope);
        p.authorizeUrl = au.toString();
      }
      providers[name] = p;
    });
    return ok(res, { integrations: store.listIntegrations(req.user.sub), providers: providers });
  });
  // OAuth 回调：code -> token -> 保存；凭据未配置时如实回 not_configured（不假装连上）
  router.get("/oauth/:provider/callback", am, async (req, res) => {
    const provider = validProvider(req.params.provider);
    if (!provider) return fail(res, 400, "bad_provider", { message: "未知 provider（支持: " + Object.keys(PROVIDERS).join(", ") + ")" });
    const code = req.query.code;
    if (!code) return fail(res, 400, "missing_code");
    const c = cred(provider);
    if (!c.clientId || !c.clientSecret) {
      return ok(res, { connected: false, provider: provider, reason: "not_configured" });
    }
    try {
      const tok = await exchangeCode(PROVIDERS[provider], c, String(code));
      store.setIntegration(req.user.sub, provider, {
        token: tok.access_token || null,
        refreshToken: tok.refresh_token || null,
        expiresAt: tok.expires_in ? Date.now() + Number(tok.expires_in) * 1000 : null
      });
      /* 浏览器 OAuth 流的最后一跳：渲染结果页（postMessage 通知应用窗刷新状态）。
         bad_provider/missing_code/not_configured 仍是 JSON —— 那三支是 API/契约
         语义（客户端直调与 verify 都按 JSON 断言），只有真正换完 token 的浏览器
         流程需要人可读的收尾页。 */
      return res.type("html").send(integrationsResultPage(provider, true, null, postMessageOrigin));
    } catch (e) {
      return res.type("html").send(integrationsResultPage(provider, false, "exchange_failed", postMessageOrigin));
    }
  });
  router.delete("/oauth/:provider", am, (req, res) => {
    const provider = validProvider(req.params.provider);
    if (!provider) return fail(res, 400, "bad_provider", { message: "未知 provider（支持: " + Object.keys(PROVIDERS).join(", ") + ")" });
    store.removeIntegration(req.user.sub, provider);
    return ok(res, {});
  });

  return router;
}

module.exports = integrationsRouter;
module.exports.PROVIDERS = PROVIDERS;
