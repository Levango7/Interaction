/* server/src/auth.js
 * 鉴权路由：register / login / logout / me / devices / refresh / email-code / github / wechat。
 * 契约严格对齐前端 apiClientModule（agent-workbench.html）。
 * 所有凭据（邮件 SMTP / GitHub / 微信）走 config，未配置时优雅降级（返回可理解的错误码，不崩溃）。
 */
"use strict";
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");

const BCRYPT_ROUNDS = 10; // 测试时降低以加速（生产可调 12）

// 发邮件：config.email.enabled=false 时返回 {ok:false, error:'email_not_configured'}，不真发
let _mailer = null;
function getMailer(cfg) {
  if (!cfg.email || !cfg.email.enabled) return null;
  if (_mailer) return _mailer;
  const s = cfg.email.smtp || {};
  _mailer = nodemailer.createTransport({
    host: s.host, port: s.port || 465, secure: s.secure !== false,
    auth: (s.user && s.pass) ? { user: s.user, pass: s.pass } : undefined
  });
  return _mailer;
}

/* ---- 腾讯云 API 3.0 的 TC3-HMAC-SHA256 签名（2026-10-23 短信验证码）----
   为什么自己算：服务端至今零 HTTP 客户端依赖，为一个 POST 拉 SDK 不划算；
   算法是公开的（见腾讯云「签名方法 v3」文档），四步：规范请求串 → 待签串 → 派生密钥 → 签名。
   两个最容易写错、且错了只在真机才暴露的点（verify/sms-check.cjs 用**独立实现**验签，不复用本函数）：
     · date 必须是 **UTC 日期**（YYYY-MM-DD），与 X-TC-Timestamp 的秒级时间戳同源；
       用本地时区会在 UTC+8 的 08:00 之前算成前一天 —— 表现为「签名错误」但代码看不出错；
     · X-TC-* 头**不参与**签名，SignedHeaders 只有 content-type;host。多签一个头就是签名不匹配。 */
function tc3sha256hex(s) { return crypto.createHash("sha256").update(s, "utf8").digest("hex"); }
function tc3hmac(key, msg) { return crypto.createHmac("sha256", key).update(msg, "utf8").digest(); }
function tc3Sign(o) {
  const algorithm = "TC3-HMAC-SHA256";
  const date = new Date(o.timestamp * 1000).toISOString().slice(0, 10); // UTC 日期
  const canonicalHeaders = "content-type:application/json\nhost:" + o.host + "\n";
  const signedHeaders = "content-type;host";
  const canonicalRequest = ["POST", "/", "", canonicalHeaders, signedHeaders, tc3sha256hex(o.payload)].join("\n");
  const scope = date + "/" + o.service + "/tc3_request";
  const stringToSign = [algorithm, String(o.timestamp), scope, tc3sha256hex(canonicalRequest)].join("\n");
  const kDate = tc3hmac("TC3" + o.secretKey, date);
  const kService = tc3hmac(kDate, o.service);
  const kSigning = tc3hmac(kService, "tc3_request");
  const signature = crypto.createHmac("sha256", kSigning).update(stringToSign, "utf8").digest("hex");
  return algorithm + " Credential=" + o.secretId + "/" + scope + ", SignedHeaders=" + signedHeaders + ", Signature=" + signature;
}

function makeTokens(cfg, userId) {
  const accessToken = jwt.sign({ sub: userId }, cfg.jwt.accessSecret, { expiresIn: cfg.jwt.accessTtlSec || 900 });
  /* 2026-10-10：refreshToken 加 jti 随机数。此前载荷只有 {sub, iat, exp} —— **同一秒内两次签发
     是同一个字符串**，而会话表（store.sessions）以 refreshToken 为主键 → 同秒两次登录 / 一台设备
     快速重登会把前一个会话**覆盖**掉：设备列表少一台，「多设备」语义失真（刷新仍能用，故长期
     无感）。实测判据：verify/incremental-check.cjs 的「同账号第二次登录拿到独立会话」用例。
     accessToken 刻意不加：它只是 15 分钟的同一身份凭据，同串无害。 */
  const refreshToken = jwt.sign({ sub: userId, jti: crypto.randomBytes(8).toString("hex") }, cfg.jwt.refreshSecret, { expiresIn: cfg.jwt.refreshTtlSec || 2592000 });
  return { accessToken, refreshToken, accessTtlSec: cfg.jwt.accessTtlSec || 900 };
}

function publicUser(u) {
  return { id: u.id, email: u.email, name: u.name || u.email, provider: u.provider || "email", providerId: u.providerId || null, createdAt: u.createdAt };
}

function authRouter(cfg, store) {
  const express = require("express");
  const router = express.Router();
  const ok = (res, data) => res.json({ ok: true, data: data || {} });
  const fail = (res, status, error, data) => res.status(status || 400).json({ ok: false, error: error, data: data || {} });

  /* ---- v3.7.110 速率限制（生产必需：防暴力破解/撞库/滥发验证码）----
     默认开、阈值取宽（正常使用不可能碰到）；要关或调阈值走 cfg.security.rateLimit。
     维度：IP 总量一桶 + login/email-code 再按 email 各一桶（同一目标反复试才是攻击面）。 */
  const rl = require("./rate-limit");
  const rlCfg = (cfg.security && cfg.security.rateLimit) || {};
  const _rlEnabled = rlCfg.enabled !== false;
  function rlAuth(name, extra) {
    if (!_rlEnabled) return function (_req, _res, next) { next(); };
    const base = { windowMs: Number(rlCfg.windowMs) || 60000, max: Number(rlCfg.max) || 30 };
    const ipLimit = rl.rateLimit(base);
    if (!extra) return ipLimit;
    /* extra.key（2026-10-23 短信）：分桶维度可指定，默认仍是 email。短信按号码分桶
       （rl.byPhoneField），否则同一号码换个写法就是一只新桶 —— 见 rate-limit.js 注释。 */
    const extraOpts = Object.assign({}, base, { max: Number(rlCfg[extra.maxKey]) || extra.max || 10, key: extra.key || rl.byEmailField });
    const extraLimit = rl.rateLimit(extraOpts);
    return function (req, res, next) { ipLimit(req, res, function(){ extraLimit(req, res, next); }); };
  }
  router.use("/email-code", rlAuth("email-code", { maxKey: "emailCodeMax", max: 5 }));
  router.use("/register", rlAuth("register"));
  router.use("/login", rlAuth("login", { maxKey: "loginMax", max: 10 }));

  // ---- 发邮箱验证码 ----
  router.post("/email-code", async (req, res) => {
    try {
      const email = String((req.body && req.body.email) || "").trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(res, 400, "email_invalid");
      const existing = store.findUserByEmail(email);
      if (existing) return fail(res, 409, "email_exists");
      const code = String(Math.floor(100000 + Math.random() * 900000));
      store.setCode(email, code, 600, "register");
      const mailer = getMailer(cfg);
      if (!mailer) {
        /* v3.7.105 加固：把 6 位注册验证码放进响应体，等于任何人都能自助通过注册校验
           —— 邮箱归属验证形同虚设，可批量注册任意邮箱。原实现没有环境开关，
           只要运维忘了配 SMTP，生产就退化成这个状态。
           现改为：未配邮件通道直接报 503（注册流程中止，不会静默放行），
           只有显式开启 cfg.dev.allowUnsafeDevEndpoints 才回传 demoCode 供联调。 */
        if (!cfg.dev || cfg.dev.allowUnsafeDevEndpoints !== true) {
          return fail(res, 503, "email_not_configured");
        }
        // 未配置邮件通道：仅开发联调模式把验证码放响应里，生产必须配置 SMTP 才发真邮件
        return ok(res, { demo: true, demoCode: code, expireIn: 600, message: "email_not_configured_demo" });
      }
      try {
        await mailer.sendMail({ from: cfg.email.from, to: email, subject: "Agent 工坊 · 注册验证码", text: "您的注册验证码是：" + code + "，10 分钟内有效。" });
        return ok(res, { expireIn: 600 });
      } catch (e) {
        return fail(res, 502, "email_send_failed", { detail: (e && e.message) || String(e) });
      }
    } catch (e) {
      return fail(res, 500, "server_error", { detail: (e && e.message) || String(e) });
    }
  });

  // ---- 注册（邮箱+密码+验证码；code 可缺省向后兼容）----
  router.post("/register", async (req, res) => {
    try {
      const email = String((req.body && req.body.email) || "").trim().toLowerCase();
      const password = String((req.body && req.body.password) || "");
      const name = String((req.body && req.body.name) || "").trim() || email;
      const code = String((req.body && req.body.code) || "").trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(res, 400, "email_invalid");
      if (password.length < 8) return fail(res, 400, "password_too_short");
      if (store.findUserByEmail(email)) return fail(res, 409, "email_exists");
      // 验证码校验：仅当后端启用了发码（config.email.enabled）或已发过码时强校验
      const saved = store.getCode(email);
      if (code) {
        if (!saved || saved.used || saved.expiresAt < Date.now()) return fail(res, 400, "code_expired_or_invalid");
        if (saved.code !== code) return fail(res, 400, "code_invalid");
        store.markCodeUsed(email);
      } else if (cfg.email && cfg.email.enabled) {
        // 强制注册必须带验证码（邮件通道启用时）
        return fail(res, 400, "code_required");
      }
      const passwordHash = bcrypt.hashSync(password, BCRYPT_ROUNDS);
      const user = store.createUser({ id: store.uid("u_"), email, name, passwordHash, provider: "email", providerId: null, createdAt: Date.now() });
      store.addAudit(user.id, "register", { email: email });
      const t = makeTokens(cfg, user.id);
      const deviceName = String((req.body && req.body.deviceName) || "web");
      store.saveSession({ refreshToken: t.refreshToken, userId: user.id, createdAt: Date.now(), expiresAt: Date.now() + (cfg.jwt.refreshTtlSec || 2592000) * 1000, deviceName });
      return ok(res, { accessToken: t.accessToken, refreshToken: t.refreshToken, expiresIn: t.accessTtlSec, user: publicUser(user) });
    } catch (e) {
      return fail(res, 500, "server_error", { detail: (e && e.message) || String(e) });
    }
  });

  // ---- 登录 ----
  router.post("/login", async (req, res) => {
    try {
      const email = String((req.body && req.body.email) || "").trim().toLowerCase();
      const password = String((req.body && req.body.password) || "");
      const user = store.findUserByEmail(email);
      if (!user || user.provider !== "email") return fail(res, 401, "invalid_credentials");
      if (!bcrypt.compareSync(password, user.passwordHash || "")) return fail(res, 401, "invalid_credentials");
      store.addAudit(user.id, "login", { device: String((req.body && req.body.deviceName) || "web") });
      const t = makeTokens(cfg, user.id);
      const deviceName = String((req.body && req.body.deviceName) || "web");
      store.saveSession({ refreshToken: t.refreshToken, userId: user.id, createdAt: Date.now(), expiresAt: Date.now() + (cfg.jwt.refreshTtlSec || 2592000) * 1000, deviceName });
      return ok(res, { accessToken: t.accessToken, refreshToken: t.refreshToken, expiresIn: t.accessTtlSec, user: publicUser(user) });
    } catch (e) {
      return fail(res, 500, "server_error", { detail: (e && e.message) || String(e) });
    }
  });

  // ---- refresh ----
  router.post("/refresh", (req, res) => {
    try {
      const rt = String((req.body && req.body.refreshToken) || "");
      const session = store.getSession(rt);
      if (!session) return res.status(401).json({ ok: false, error: "invalid_refresh" });
      let payload;
      try { payload = jwt.verify(rt, cfg.jwt.refreshSecret); } catch (e) { store.deleteSession(rt); return res.status(401).json({ ok: false, error: "invalid_refresh" }); }
      if (session.expiresAt < Date.now()) { store.deleteSession(rt); return res.status(401).json({ ok: false, error: "invalid_refresh" }); }
      const accessToken = jwt.sign({ sub: payload.sub }, cfg.jwt.accessSecret, { expiresIn: cfg.jwt.accessTtlSec || 900 });
      return res.json({ ok: true, accessToken: accessToken, expiresIn: cfg.jwt.accessTtlSec || 900 });
    } catch (e) {
      return res.status(500).json({ ok: false, error: "server_error", data: { detail: (e && e.message) || String(e) } });
    }
  });

  /* ---- GitHub OAuth 登录（v3.7.113，评估+方案：docs/oauth-login-design.md）----
     契约来自客户端 _doGithubLogin()（src/render-overview.js）：
       GET  /api/auth/github            → {authorizeUrl, state}
       弹窗打开 authorizeUrl → GitHub 回跳 GET /api/auth/github/callback?code&state
       → 服务端 code 兑换 + 签发 → 内联页 postMessage
         {type:"agent-github-oauth", state, accessToken, refreshToken} 给 opener
       客户端校验 e.source===弹窗 / e.origin===API_BASE origin / state 一次性消费。
     未配置（cfg.github.enabled≠true 或缺 clientId/clientSecret/redirectUri）→
     **503 + github_not_configured**（fail-closed；客户端据此显示"未配置"而不是笼统"无后端"）。 */
  router.use("/github", rlAuth("github"));
  const gh = cfg.github || {};
  const GH_STATE_TTL = (Number(gh.stateTtlSec) || 600) * 1000;
  const GH_AUTHORIZE = gh.authorizeBase || "https://github.com/login/oauth/authorize";
  const GH_TOKEN = gh.tokenUrl || "https://github.com/login/oauth/access_token";
  const GH_USER = gh.userUrl || "https://api.github.com/user";
  function ghConfigured() {
    return gh.enabled === true && !!gh.clientId && !!gh.clientSecret && !!gh.redirectUri;
  }
  /* tokenUrl/userUrl 默认真端点；覆盖它们只服务两种合法场景：假 provider 联调、自建网关。
     loopback/私网目标**仅当 cfg.dev.allowUnsafeDevEndpoints===true 放行**（与 demoCode 同款显式逃生舱），
     否则服务端发起 SSRF 的口子由配置静默打开（tools-fetch.js 同口径的另一半）。 */
  function ghEndpointAllowed(urlStr, errorOut) {
    let u;
    try { u = new URL(String(urlStr || "")); } catch (err) { errorOut.bad_url = true; return false; }
    if (u.protocol !== "https:" && u.protocol !== "http:") { errorOut.bad_proto = true; return false; }
    if (u.username || u.password) { errorOut.userinfo = true; return false; }
    const h = String(u.hostname || "").toLowerCase();
    const loopback = h === "localhost" || h === "127.0.0.1" || h === "::1" || /^127\./.test(h);
    if (loopback && !(cfg.dev && cfg.dev.allowUnsafeDevEndpoints === true)) { errorOut.forbidden_host = true; return false; }
    return true;
  }
  /* oauthStates 表无消费即残留（授权中途放弃）→ JSON 数据文件会缓慢增长。
     清扫逻辑放 store（表是它的私有结构），这里只在签发入口惰性调一次。 */
  router.get("/github", (req, res) => {
    try {
      if (!ghConfigured()) return fail(res, 503, "github_not_configured");
      store.sweepOAuthStates(GH_STATE_TTL);
      const state = crypto.randomBytes(16).toString("hex");
      /* 记录 opener 的 origin 作 postMessage targetOrigin：浏览器跨源 fetch 会带 Origin 头；
         同源部署可能不带 → 回落 cfg.github.postMessageOrigin（config 默认 "*" 只发给 opener 本身）。 */
      const origin = req.header("origin") || null;
      store.setOAuthState(state, "github", { origin: origin, createdAt: Date.now() });
      const u = new URL(GH_AUTHORIZE);
      u.searchParams.set("client_id", gh.clientId);
      u.searchParams.set("redirect_uri", gh.redirectUri);
      u.searchParams.set("state", state);
      u.searchParams.set("scope", gh.scope || "read:user");
      return ok(res, { authorizeUrl: u.toString(), state: state });
    } catch (e) {
      return fail(res, 500, "server_error", { detail: (e && e.message) || String(e) });
    }
  });

  /* 回调页：浏览器直开（非 apiFetch），因此不带 token、不发 JSON。token 只出现在
     postMessage 的 script 串里 —— 序列化时把 < > & 转义成 \uXXXX，堵掉任何 </script> 逃逸。 */
  function ghCallbackPage(code, accessToken, refreshToken, targetOrigin) {
    const payload = JSON.stringify({ type: "agent-github-oauth", state: code, accessToken: accessToken, refreshToken: refreshToken })
      .replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
    const target = JSON.stringify(String(targetOrigin || "*"));
    return "<!doctype html><html lang=\"zh-CN\"><head><meta charset=\"utf-8\"><title>登录成功</title></head>"
      + "<body style=\"font:14px/1.6 system-ui,sans-serif;text-align:center;padding-top:48px\">"
      + "<p>登录成功，正在返回应用…</p><p><a href=\"#\" onclick=\"window.close();return false\">如未自动返回，点击关闭</a></p>"
      + "<script>(function(){try{if(window.opener)window.opener.postMessage(" + payload + "," + target + ");}catch(e){}"
      + "setTimeout(function(){try{window.close();}catch(e){}},800);})();</script></body></html>";
  }
  function ghErrorPage(errCode) {
    return "<!doctype html><html lang=\"zh-CN\"><head><meta charset=\"utf-8\"><title>登录失败</title></head>"
      + "<body style=\"font:14px/1.6 system-ui,sans-serif;text-align:center;padding-top:48px\">"
      + "<p>登录失败：" + errCode + "</p><p><a href=\"#\" onclick=\"window.close();return false\">关闭窗口</a></p></body></html>";
  }

  router.get("/github/callback", async (req, res) => {
    try {
      if (!ghConfigured()) return fail(res, 503, "github_not_configured");
      /* 拒绝路径也先消费 state：用户按了「取消」，这个 state 已是死的，
         不消费就留一条永不清理的记录（oauthStates 表无自然回收）。 */
      const deniedState = String(req.query.state || "");
      if (req.query.error) {
        if (deniedState) { const d = store.getOAuthState(deniedState); if (d) store.deleteOAuthState(deniedState); }
        return res.type("html").send(ghErrorPage("denied"));
      }
      const state = String(req.query.state || "");
      const code = String(req.query.code || "");
      const st = store.getOAuthState(state);
      if (!state || !st || st.provider !== "github") return res.type("html").send(ghErrorPage("state_invalid"));
      /* 一次性消费**先于**任何网络调用：重放窗口哪怕兑换失败也留不下可再用 state */
      store.deleteOAuthState(state);
      if (!code) return res.type("html").send(ghErrorPage("code_missing"));
      if (Date.now() - (st.createdAt || 0) > GH_STATE_TTL) return res.type("html").send(ghErrorPage("state_expired"));
      const bad = {};
      if (!ghEndpointAllowed(GH_TOKEN, bad) || !ghEndpointAllowed(GH_USER, bad)) {
        console.warn("[auth] github 端点被拒：" + Object.keys(bad)[0]);
        return res.type("html").send(ghErrorPage("forbidden_host"));
      }
      /* 兑换 code → access_token（form 编码 + Accept: json；旧默认是 XML） */
      const tr = await fetch(GH_TOKEN, {
        method: "POST",
        headers: { "Accept": "application/json", "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_id: gh.clientId, client_secret: gh.clientSecret, code: code, redirect_uri: gh.redirectUri }).toString()
      });
      if (!tr.ok) { console.warn("[auth] github 兑换失败 HTTP " + tr.status); return res.type("html").send(ghErrorPage("exchange_failed")); }
      const tbody = await tr.json().catch(() => null);
      if (!tbody || !tbody.access_token) return res.type("html").send(ghErrorPage("exchange_failed"));
      /* 拉资料：providerId 只认 GitHub 的 id（login 可改，id 不可改） */
      const ur = await fetch(GH_USER, { headers: { "Authorization": "Bearer " + tbody.access_token, "Accept": "application/vnd.github+json", "User-Agent": "agent-workbench-oauth" } });
      if (!ur.ok) { console.warn("[auth] github 资料拉取失败 HTTP " + ur.status); return res.type("html").send(ghErrorPage("profile_failed")); }
      const profile = await ur.json().catch(() => null);
      const pid = profile && profile.id ? String(profile.id) : "";
      if (!pid) return res.type("html").send(ghErrorPage("profile_failed"));
      let user = store.findUserByProvider("github", pid);
      if (!user) {
        user = store.createUser({ id: store.uid("u_"), email: null, name: String((profile.login || profile.name) || "github"), passwordHash: null, provider: "github", providerId: pid, createdAt: Date.now() });
        store.addAudit(user.id, "register", { provider: "github" });
      }
      store.addAudit(user.id, "login", { provider: "github", device: "github-oauth" });
      const t = makeTokens(cfg, user.id);
      store.saveSession({ refreshToken: t.refreshToken, userId: user.id, createdAt: Date.now(), expiresAt: Date.now() + (cfg.jwt.refreshTtlSec || 2592000) * 1000, deviceName: "github-oauth" });
      console.log("[auth] github 登录完成 providerId=" + pid + " user=" + user.id);
      const target = (st.data && st.data.origin) || gh.postMessageOrigin || "*";
      return res.type("html").send(ghCallbackPage(state, t.accessToken, t.refreshToken, target));
    } catch (e) {
      /* 只记消息不记堆栈敏感面；错误页同样不含细节 */
      console.error("[auth] github 回调异常：" + (e && e.message));
      return res.type("html").send(ghErrorPage("server_error"));
    }
  });

  /* ---- 微信扫码登录（v3.7.113 重写）----
     契约来自客户端 _wechatPollStart()（src/render-overview.js）：
       POST /wechat/qrcode            → {qr, scene, expireIn}（qr 为图片 URL/data-URI）
       GET  /wechat/status?scene=     → {status:"pending"|"confirmed"|"expired", accessToken?, refreshToken?}
     客户端每 2.5s 轮询一次；confirmed 且带 accessToken 即登录。
     **演示模式（本来就有的形态，非 v3.7.113 新增）**：无微信开放平台凭据时 qrcode 返回标注了
     scene 的 SVG data-URI（响应带 demo:true 让 UI 可自证是演示），确认入口是 /wechat/confirm
     （凭 email 直签 token = 完整认证绕过，**默认 404，仅 dev.allowUnsafeDevEndpoints 放行**）。
     真正的微信授权（扫码后由微信回调确认）需企业资质，见 roadmap 阶段④ —— 协议不变、只换 provider。 */
  router.use("/wechat", rlAuth("wechat"));
  const W = cfg.wechat || {};
  const W_TTL = (Number(W.qrcodeTicketTtlSec) || 300) * 1000;
  router.post("/wechat/qrcode", (req, res) => {
    try {
      /* 未配置对象整体缺失才 503；config.example.json 自带 wechat 段 → 默认走演示。
         演示码必须让调用方消费端看得出是演示（demo:true），不能伪装成真二维码。 */
      if (!W || typeof W !== "object") return fail(res, 503, "wechat_not_configured");
      store.sweepOAuthStates(W_TTL);
      const scene = store.uid("wx_");
      store.setOAuthState(scene, "wechat", {});
      return ok(res, { qr: makeDemoWechatQr(W, scene), scene, expireIn: Math.round(W_TTL / 1000), demo: true });
    } catch (e) {
      return fail(res, 500, "server_error", { detail: (e && e.message) || String(e) });
    }
  });
  router.get("/wechat/status", (req, res) => {
    try {
      const scene = String((req.query && req.query.scene) || "");
      const st = store.getOAuthState(scene);
      if (!scene || !st || st.provider !== "wechat") return fail(res, 404, "scene_not_found");
      if (st.data && st.data.confirmed && st.data.userId) {
        const user = store.getUser(st.data.userId);
        if (!user) return fail(res, 404, "scene_not_found");
        /* 一次性消费：token 只给一次，防止 scene 被反复轮询出多枚 token */
        store.deleteOAuthState(scene);
        store.addAudit(user.id, "login", { provider: "wechat_demo" });
        const t = makeTokens(cfg, user.id);
        store.saveSession({ refreshToken: t.refreshToken, userId: user.id, createdAt: Date.now(), expiresAt: Date.now() + (cfg.jwt.refreshTtlSec || 2592000) * 1000, deviceName: "wechat-demo" });
        return ok(res, { status: "confirmed", accessToken: t.accessToken, refreshToken: t.refreshToken, expiresIn: t.accessTtlSec, user: publicUser(user) });
      }
      const elapsed = Date.now() - (st.createdAt || 0);
      if (elapsed > W_TTL) { store.deleteOAuthState(scene); return ok(res, { status: "expired" }); }
      return ok(res, { status: "pending", expireIn: w_expire(cfg, st) });
    } catch (e) {
      return fail(res, 500, "server_error", { detail: (e && e.message) || String(e) });
    }
  });
  /* 开发确认入口：等价于「凭一个 email 直接签发 accessToken + refreshToken」——完整认证绕过。
     默认 404（不暴露端点存在）；仅显式 dev.allowUnsafeDevEndpoints 放行（v3.7.105 加固口径）。 */
  router.get("/wechat/confirm", (req, res) => {
    try {
      if (!cfg.dev || cfg.dev.allowUnsafeDevEndpoints !== true) return fail(res, 404, "not_found");
      const scene = String((req.query && req.query.scene) || "");
      const st = store.getOAuthState(scene);
      if (!st || st.provider !== "wechat") return fail(res, 404, "scene_not_found");
      const email = String((req.query && req.query.email) || "").trim().toLowerCase();
      if (!email) return fail(res, 400, "email_invalid");
      let user = store.findUserByEmail(email);
      if (!user) user = store.createUser({ id: store.uid("u_"), email, name: email, passwordHash: null, provider: "wechat", providerId: "wx_demo_" + scene, createdAt: Date.now() });
      store.setOAuthState(scene, "wechat", Object.assign({}, st.data, { confirmed: true, userId: user.id }));
      return ok(res, {});
    } catch (e) {
      return fail(res, 500, "server_error", { detail: (e && e.message) || String(e) });
    }
  });

  /* ---- 短信验证码登录（2026-10-23 · OD-001 选型 C，见 docs/decisions/OPEN-DECISIONS.md）----
     为什么是「腾讯云 SMS 直签」而不是引 CloudBase SDK：
       · 服务端依赖至今只有 bcryptjs/cors/express/jsonwebtoken/nodemailer，**没有 HTTP 客户端库**，
         全局 fetch（Node 18+）已经够用；
       · 腾讯云 API 3.0 的 TC3-HMAC-SHA256 用 node:crypto 约 30 行就能算出来，
         为一个「发一条短信」的动作拉一个 SDK，与本仓把 pdfjs / mermaid vendor 化的取舍相反；
       · CloudBase 短信底层同样是腾讯云短信服务，差在封装层，不影响这里的安全口径。

     契约：
       POST /api/auth/sms-code  {phone}              → {expireIn}；未配置 → 503 sms_not_configured
       POST /api/auth/sms-login {phone, code, name?} → {accessToken, refreshToken, user}

     三条**设计决定**（不是待办，别当成"以后再补"，改之前先读）：
       ① **只支持中国大陆号码**（countryCode 默认 +86，号段正则 1[3-9] 开头共 11 位）。
          其它国家号段规则完全不同，与其猜一个宽松正则假装支持，不如明确不接受——
          否则非法号码会走进发码流程，**按条计费**且查不出来。
       ② **发码不查该号是否已注册**：一旦按存在性分支返回不同响应，/sms-code 本身就变成
          「这个手机号有没有注册过」的枚举接口（比登录接口泄露得更直接）。
       ③ **验证码即凭据**（无密码），所以三重兜底缺一不可：一次性消费 + 短 TTL + 按号码限流。 */
  const S = cfg.sms || {};
  /* `Number(x) || 默认` 会把**显式配置的 0** 也吞成默认值（0 是 falsy）——
     resendIntervalSec:0 的语义是"不冷却"，被吞成 60 就变成一个改不动的默认值。
     显式 0 与"没配"必须区分开，所以走 numOr 而不是 ||。 */
  function numOr(v, d) { const n = Number(v); return (v === undefined || v === null || v === "" || !isFinite(n)) ? d : n; }
  const SMS_TTL = numOr(S.codeTtlSec, 600);
  const SMS_RESEND = numOr(S.resendIntervalSec, 60) * 1000;
  const SMS_TIMEOUT = numOr(S.timeoutMs, 10000);
  function smsConfigured() {
    return S.enabled === true && !!S.secretId && !!S.secretKey && !!S.sdkAppId && !!S.signName && !!S.templateId;
  }
  /* 手机号归一：接受 "+86 138 0013 8000" / "8613800138000" / "13800138000" 三种写法，
     输出**纯 11 位国内号码**；其它一律 ""（= phone_invalid）。
     与 rate-limit 的 byPhoneField 取同一口径（只留数字），保证「分桶键 == 实际发码目标」。 */
  function normalizePhone(raw, countryCode) {
    const cc = String(countryCode || "+86").replace(/\D/g, "") || "86";
    let digits = String(raw || "").replace(/\D/g, "");
    if (digits.indexOf(cc) === 0 && digits.length === cc.length + 11) digits = digits.slice(cc.length);
    if (cc !== "86") return ""; // 见决定①：非中国大陆号段不做猜测式支持
    return /^1[3-9]\d{9}$/.test(digits) ? digits : "";
  }
  /* 发码：直调腾讯云短信 SendSms（API 版本 2021-01-11）。
     端点白名单复用 github 那把尺子（ghEndpointAllowed —— 名字带 gh 是历史原因，
     口径是通用的 HTTP 端点校验：协议 / userinfo / loopback 仅 dev 逃生舱放行）。
     不新开第二把尺子：两把尺子各自演进就是 SSRF 的入口。 */
  async function smsSend(phone, code) {
    const endpoint = String(S.endpoint || "https://sms.tencentcloudapi.com");
    let host = "";
    try { host = new URL(endpoint).host; } catch (e) { return { ok: false, detail: "bad_endpoint" }; }
    const timestamp = Math.floor(Date.now() / 1000);
    const paramSet = Number(S.templateParamCount) === 1
      ? [code]
      : [code, String(Math.max(1, Math.round(SMS_TTL / 60)))];
    const payload = JSON.stringify({
      PhoneNumberSet: [String(S.countryCode || "+86") + phone],
      SmsSdkAppId: String(S.sdkAppId),
      SignName: S.signName,
      TemplateId: String(S.templateId),
      TemplateParamSet: paramSet
    });
    const authorization = tc3Sign({
      secretId: S.secretId, secretKey: S.secretKey, service: "sms", host: host,
      timestamp: timestamp, payload: payload
    });
    const r = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-TC-Action": "SendSms",
        "X-TC-Version": "2021-01-11",
        "X-TC-Timestamp": String(timestamp),
        "X-TC-Region": S.region || "ap-guangzhou",
        "Authorization": authorization
      },
      body: payload,
      signal: AbortSignal.timeout(SMS_TIMEOUT)
    });
    const text = await r.text().catch(() => "");
    let body = null;
    try { body = JSON.parse(text); } catch (e) { body = null; }
    const resp = body && body.Response;
    /* 腾讯云的失败有两层：HTTP 非 2xx，或 2xx 里带 Response.Error（业务拒绝）。
       只回 Code 不回整段 Message —— 响应体里可能出现的号码/签名等字段不该外泄给调用方。 */
    if (!r.ok || (resp && resp.Error)) {
      return { ok: false, detail: String((resp && resp.Error && resp.Error.Code) || ("HTTP " + r.status)) };
    }
    const st = resp && resp.SendStatusSet && resp.SendStatusSet[0];
    if (!st || st.Code !== "Ok") return { ok: false, detail: String((st && st.Code) || "unknown") };
    return { ok: true, requestId: (resp && resp.RequestId) || "" };
  }
  router.use("/sms-code", rlAuth("sms-code", { maxKey: "smsCodeMax", max: 5, key: rl.byPhoneField }));
  router.post("/sms-code", async (req, res) => {
    try {
      const phone = normalizePhone(req.body && req.body.phone, S.countryCode);
      if (!phone) return fail(res, 400, "phone_invalid");
      if (!smsConfigured()) {
        /* 与 email-code 同款 fail-closed：通道没配就中止注册/登录流程，绝不静默放行。
           demoCode 只在显式 dev 逃生舱下出现（生产配置下这个分支返回 503）。 */
        if (cfg.dev && cfg.dev.allowUnsafeDevEndpoints === true) {
          const code = String(Math.floor(100000 + Math.random() * 900000));
          store.setCode(phone, code, SMS_TTL, "sms-login");
          return ok(res, { demo: true, demoCode: code, expireIn: SMS_TTL, message: "sms_not_configured_demo" });
        }
        return fail(res, 503, "sms_not_configured");
      }
      /* 重发冷却：短信按条计费，"同一号码 60 秒内再来一次"就是白花钱（也可能是有人在刷）。
         固定窗口限流挡不住窗口边界的突刺（窗口末尾 + 新窗口开头 = 2×max），所以这里用
         码的**真实签发时刻**（store.setCode 的 issuedAt）做精确判据。 */
      const prev = store.getCode(phone);
      if (prev && !prev.used) {
        const issuedAt = prev.issuedAt || (prev.expiresAt - SMS_TTL * 1000);
        if (Date.now() - issuedAt < SMS_RESEND) {
          return fail(res, 429, "sms_code_cooldown", { retryAfter: Math.ceil((SMS_RESEND - (Date.now() - issuedAt)) / 1000) });
        }
      }
      const bad = {};
      if (!ghEndpointAllowed(S.endpoint, bad)) {
        console.warn("[auth] sms 端点被拒：" + Object.keys(bad)[0]);
        return fail(res, 500, "sms_endpoint_forbidden");
      }
      const code = String(Math.floor(100000 + Math.random() * 900000));
      const r = await smsSend(phone, code);
      if (!r.ok) return fail(res, 502, "sms_send_failed", { detail: r.detail });
      store.setCode(phone, code, SMS_TTL, "sms-login");
      return ok(res, { expireIn: SMS_TTL });
    } catch (e) {
      return fail(res, 500, "server_error", { detail: (e && e.message) || String(e) });
    }
  });
  router.use("/sms-login", rlAuth("sms-login", { maxKey: "loginMax", max: 10, key: rl.byPhoneField }));
  router.post("/sms-login", async (req, res) => {
    try {
      const phone = normalizePhone(req.body && req.body.phone, S.countryCode);
      if (!phone) return fail(res, 400, "phone_invalid");
      const code = String((req.body && req.body.code) || "").trim();
      if (!/^\d{6}$/.test(code)) return fail(res, 400, "code_invalid");
      const saved = store.getCode(phone);
      if (!saved || saved.used || saved.expiresAt < Date.now()) return fail(res, 400, "code_expired_or_invalid");
      if (saved.code !== code) return fail(res, 400, "code_invalid");
      /* 一次性消费**先于**建号：哪怕后面建号失败，这个码也留不下来第二次用 */
      store.markCodeUsed(phone);
      let user = store.findUserByProvider("phone", phone);
      if (!user) {
        const name = String((req.body && req.body.name) || "").trim() || ("手机用户" + phone.slice(-4));
        user = store.createUser({ id: store.uid("u_"), email: null, name: name, passwordHash: null, provider: "phone", providerId: phone, createdAt: Date.now() });
        store.addAudit(user.id, "register", { provider: "phone" });
      }
      store.addAudit(user.id, "login", { provider: "phone", device: String((req.body && req.body.deviceName) || "sms") });
      const t = makeTokens(cfg, user.id);
      store.saveSession({ refreshToken: t.refreshToken, userId: user.id, createdAt: Date.now(), expiresAt: Date.now() + (cfg.jwt.refreshTtlSec || 2592000) * 1000, deviceName: String((req.body && req.body.deviceName) || "sms") });
      return ok(res, { accessToken: t.accessToken, refreshToken: t.refreshToken, expiresIn: t.accessTtlSec, user: publicUser(user) });
    } catch (e) {
      return fail(res, 500, "server_error", { detail: (e && e.message) || String(e) });
    }
  });

  // ---- auth 中间件：解析 Bearer token -> req.user ----
  router.use("/me", authMiddleware(cfg));
  router.use("/devices", authMiddleware(cfg));
  router.use("/audit", authMiddleware(cfg));

  router.get("/me", (req, res) => {
    const user = store.getUser(req.user.sub);
    if (!user) return fail(res, 404, "user_not_found");
    return ok(res, { user: publicUser(user) });
  });
  router.put("/me", (req, res) => {
    const user = store.getUser(req.user.sub);
    if (!user) return fail(res, 404, "user_not_found");
    const name = String((req.body && req.body.name) || "").trim();
    const patch = {};
    if (name) patch.name = name;
    const updated = store.updateUser(user.id, patch);
    return ok(res, { user: publicUser(updated) });
  });

  router.get("/devices", (req, res) => {
    const sessions = Object.keys(store.data.sessions)
      .map(rt => store.data.sessions[rt])
      .filter(s => s.userId === req.user.sub)
      /* v3.7.105：设备 id 原为 refreshToken.slice(0,8) —— 但 JWT 的 header 段
         （{"alg":"HS256","typ":"JWT"}）在所有会话里完全相同，于是**每个设备的 id 都是同一个
         前缀**，"按 id 删设备"实际退化成"删任意一个会话"。改为自增生成的 sid。
         客户端只透传该 id（GET 拿到、DELETE 送回），字段名不变，故对客户端兼容。 */
      .map(s => ({ id: s.sid || s.refreshToken.slice(0, 8), deviceName: s.deviceName || "web", createdAt: s.createdAt, current: s.refreshToken === (req.header("x-refresh") || "") }));
    return ok(res, { devices: sessions });
  });
  router.delete("/devices/:id", (req, res) => {
    /* v3.7.105 越权修复：原实现按 id 在**全局** session 表里找，不看归属 ——
       任何已登录用户都能踢掉别人的设备（强制他人下线，IDOR）。
       现同时限定 sid 命中且属于当前用户；旧会话（无 sid）回退前缀匹配，但同样带归属校验。 */
    const want = String(req.params.id);
    const rtKey = Object.keys(store.data.sessions).find((k) => {
      const s = store.data.sessions[k];
      if (!s || s.userId !== req.user.sub) return false;
      return s.sid ? s.sid === want : k.slice(0, 8) === want;
    });
    if (!rtKey) return fail(res, 404, "device_not_found");
    store.deleteSession(rtKey);
    store.addAudit(req.user.sub, "device_delete", { id: want });
    return ok(res, {});
  });

  /* ---- 审计环只读（v3.7.110）：只能看本人的（userId 由中间件注入，越权读取没有入口）---- */
  router.get("/audit", (req, res) => {
    return ok(res, { events: store.getAudit(req.user.sub, Number(req.query && req.query.since) || 0) });
  });

  // ---- logout ----
  router.post("/logout", (req, res) => {
    const rt = String((req.body && req.body.refreshToken) || "");
    if (rt) {
      const s = store.getSession(rt);
      store.deleteSession(rt);
      if (s && s.userId) store.addAudit(s.userId, "logout", {});
    }
    return ok(res, {});
  });

  // ---- GitHub OAuth：获取授权 URL ----
  /* v3.7.113：以下约 90 行是 ac1114a 骨架自带的旧版 github/wechat 实现，已被本文件上半部分
     的加固实现取代（同路径双注册 = 前者永远命中、后者成死码，比没有更坏）。旧版的三处实质问题：
     ① 回调兑换用 JSON body 打 GitHub 令牌端点（GitHub 要 form-urlencoded，JSON 会被拒）；
     ② postMessage 载荷不带 state —— 客户端校验 d.state===session.state 会直接拒收，登录链路本是断的；
     ③ state 无 TTL / 无一次性之外的保护、无 origin 记录、无审计。删除而非保留两份。 */

  return router;

  // ---------- helpers ----------

  function authMiddleware(cfg) {
    return (req, res, next) => {
      const h = req.header("authorization") || "";
      const token = h.startsWith("Bearer ") ? h.slice(7) : null;
      if (!token) return res.status(401).json({ ok: false, error: "no_token" });
      try {
        const payload = jwt.verify(token, cfg.jwt.accessSecret);
        req.user = payload;
        next();
      } catch (e) {
        return res.status(401).json({ ok: false, error: "invalid_token" });
      }
    };
  }

  function w_expire(cfg, st) {
    const ttl = (cfg.wechat && cfg.wechat.qrcodeTicketTtlSec) || 300;
    const elapsed = (Date.now() - st.createdAt) / 1000;
    return Math.max(0, Math.round(ttl - elapsed));
  }

  function makeDemoWechatQr(w, scene) {
    // 无凭据演示码：生成一个带 scene 提示的 SVG data-URI，标注「演示二维码（未配置微信）」
    const svg = "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"220\" height=\"220\"><rect width=\"220\" height=\"220\" fill=\"#f1f3f4\"/><text x=\"110\" y=\"100\" font-size=\"14\" text-anchor=\"middle\" fill=\"#666\">微信登录（演示）</text><text x=\"110\" y=\"130\" font-size=\"11\" text-anchor=\"middle\" fill=\"#999\">未配置微信 appid</text><text x=\"110\" y=\"160\" font-size=\"10\" text-anchor=\"middle\" fill=\"#bbb\">scene: " + scene + "</text></svg>";
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }
}

module.exports = authRouter;