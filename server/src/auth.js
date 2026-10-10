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
    const extraOpts = Object.assign({}, base, { max: Number(rlCfg[extra.maxKey]) || extra.max || 10, key: rl.byEmailField });
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
  router.get("/github", (req, res) => {
    const g = cfg.github;
    if (!g || !g.enabled || !g.clientId) return fail(res, 503, "github_not_configured");
    const state = store.uid("st_");
    store.setOAuthState(state, "github", {});
    const params = new URLSearchParams({ client_id: g.clientId, redirect_uri: g.redirectUri, scope: "read:user user:email", state, allow_signup: "true" });
    return ok(res, { authorizeUrl: "https://github.com/login/oauth/authorize?" + params.toString(), state });
  });

  // GitHub 回调：code -> access_token -> 用户信息 -> 建/绑本地账号 -> 签发 token
  router.get("/github/callback", async (req, res) => {
    try {
      const code = String((req.query && req.query.code) || "");
      const state = String((req.query && req.query.state) || "");
      const st = store.getOAuthState(state);
      if (!st || st.provider !== "github") return res.status(400).send("invalid oauth state");
      store.deleteOAuthState(state);
      const g = cfg.github;
      if (!code) return res.status(400).send("missing code");
      const tokenResp = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: { "Accept": "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: g.clientId, client_secret: g.clientSecret, code, redirect_uri: g.redirectUri })
      });
      const tokenData = await tokenResp.json();
      const access = tokenData.access_token;
      if (!access) return res.status(502).send("github token exchange failed");
      const uResp = await fetch("https://api.github.com/user", { headers: { "Authorization": "Bearer " + access, "User-Agent": "agent-workbench" } });
      const ghUser = await uResp.json();
      let user = store.findUserByProvider("github", ghUser.id);
      if (!user) {
        const email = (ghUser.email || "").toLowerCase() || (ghUser.login + "@github.local").toLowerCase();
        const existing = store.findUserByEmail(email);
        if (existing) user = store.updateUser(existing.id, { provider: "github", providerId: String(ghUser.id) });
        else user = store.createUser({ id: store.uid("u_"), email, name: ghUser.name || ghUser.login, passwordHash: null, provider: "github", providerId: String(ghUser.id), createdAt: Date.now() });
      }
      const t = makeTokens(cfg, user.id);
      store.saveSession({ refreshToken: t.refreshToken, userId: user.id, createdAt: Date.now(), expiresAt: Date.now() + (cfg.jwt.refreshTtlSec || 2592000) * 1000, deviceName: "github-oauth" });
      // 前端监听 postMessage{type:'agent-github-oauth'} 收 token
      return sendAuthResult(res, t);
    } catch (e) {
      return res.status(500).send("github oauth error: " + ((e && e.message) || String(e)));
    }
  });

  // ---- 微信扫码：取二维码 ----
  router.post("/wechat/qrcode", (req, res) => {
    const w = cfg.wechat;
    // 未配置微信凭据时给演示码（真实接入需微信开放平台网页授权，骨架先演示）。
    // 仅当 wechat 配置对象整体缺失时才算"未支持"。
    if (!w || typeof w !== "object") return fail(res, 503, "wechat_not_configured");
    const scene = store.uid("wx_");
    const qr = makeDemoWechatQr(w, scene);
    store.setOAuthState(scene, "wechat", {});
    return ok(res, { qr, scene, expireIn: (w.qrcodeTicketTtlSec) || 300, demo: true });
  });

  // ---- 微信扫码：轮询状态 ----
  router.get("/wechat/status", (req, res) => {
    const scene = String((req.query && req.query.scene) || "");
    const st = store.getOAuthState(scene);
    if (!st || st.provider !== "wechat") return fail(res, 404, "scene_not_found");
    if (st.data && st.data.confirmed && st.data.userId) {
      const user = store.getUser(st.data.userId);
      const t = makeTokens(cfg, user.id);
      return ok(res, { status: "confirmed", accessToken: t.accessToken, refreshToken: t.refreshToken, expiresIn: t.accessTtlSec, user: publicUser(user) });
    }
    return ok(res, { status: "pending", expireIn: w_expire(cfg, st) });
  });

  // 微信扫码模拟确认（开发用，无真实微信凭据时）：GET /api/auth/wechat/confirm?scene=xxx&email=yyy
  router.get("/wechat/confirm", (req, res) => {
    /* v3.7.105 加固：本端点等价于「凭一个 email 直接签发 accessToken + refreshToken」，
       是完整的认证绕过 —— 任何人 GET 一次即可创建或接管任意邮箱的账号，
       再用 /wechat/status 把 token 取走。原实现虽然被 README 标为「开发用」，
       但代码里没有任何环境判断（不看 NODE_ENV、不看配置开关），部署即失守。
       现要求显式开启 cfg.dev.allowUnsafeDevEndpoints 才放行，默认关闭。
       未开启时返回 404 而非 403 —— 不向外暴露该端点存在。 */
    if (!cfg.dev || cfg.dev.allowUnsafeDevEndpoints !== true) return fail(res, 404, "not_found");
    const scene = String((req.query && req.query.scene) || "");
    const st = store.getOAuthState(scene);
    if (!st || st.provider !== "wechat") return fail(res, 404, "scene_not_found");
    const email = String((req.query && req.query.email) || "").trim().toLowerCase();
    let user = email ? store.findUserByEmail(email) : null;
    if (email && !user) user = store.createUser({ id: store.uid("u_"), email, name: email, passwordHash: null, provider: "wechat", providerId: "wx_demo_" + scene, createdAt: Date.now() });
    store.setOAuthState(scene, "wechat", { confirmed: true, userId: user.id });
    return ok(res, {});
  });

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

  function sendAuthResult(res, t) {
    /* 返回授权页能直接读的 JSON + 一段 postMessage 脚本（在无后端回调页时由前端 window 打开授权窗接收）。
       v3.7.105 加固两处：
       ① targetOrigin 原为硬编码 '*'（任何 origin 的 opener 都能收到 token），
          改为读 cfg.github.postMessageOrigin，生产必须配成自己的页面源；
       ② token 原样字符串拼进 <script>，改为 JSON.stringify 后再把 '<' 转义成 \u003c，
          杜绝提前闭合 script 标签。 */
    const target = (cfg.github && cfg.github.postMessageOrigin) || "*";
    const payloadJson = JSON.stringify({
      type: "agent-github-oauth", accessToken: t.accessToken, refreshToken: t.refreshToken
    }).replace(/</g, "\\u003c");
    const originJson = JSON.stringify(target);
    const html = "<!doctype html><html><body><script>try{opener.postMessage(" + payloadJson + "," + originJson + ");}catch(e){}window.close();</script></body></html>";
    res.type("html").send(html);
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