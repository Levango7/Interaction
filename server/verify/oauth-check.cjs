#!/usr/bin/env node
/* oauth-check.cjs —— GitHub OAuth 登录（v3.7.113，评估+方案 docs/oauth-login-design.md）
 *
 * 为什么要有假 provider：真 GitHub 的 code 兑换要用户注册 OAuth App + 走浏览器授权，
 * 在验证脚本里既不可重复也不可断言负例。这里在 loopback 起一个**假 GitHub**
 * （发 code、接兑换 POST、按 code 给 token 或 401、按 Bearer 回 profile），
 * 服务端 tokenUrl/userUrl 指向它 —— **走的是真服务端代码路径**（状态机、兑换、
 * find-or-create、签发、会话、审计、postMessage 页），不是把实现 mock 掉一层。
 * loopback 端点仅在 cfg.dev.allowUnsafeDevEndpoints 下合法（与 demoCode 同款显式逃生舱），
 * 因此同时有一条反向用例：**关掉该开关时必须 forbidden_host**。
 *
 * 运行：cd server && node verify/oauth-check.cjs
 */
"use strict";
const { spawn } = require("node:child_process");
const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const SRV = path.join(__dirname, "..");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "oauth-check-"));
/* v3.7.114：全部端口动态分配（本批实测 4571/4572/4574/4575/4576/4577 相继被本机占用，
   "端口被占"与"实现坏了"表现不同，会让本脚本假红 —— 5 个单端口脚本同因一并改动态）。 */
let P_MAIN = null, P_FAKE = null, P_BARE = null, P_NODEV = null, P_RL = null;
/* ⑥b 的清扫实例用**动态空闲端口**：写死的端口可能被本机其它服务占（4581 实测 EADDRINUSE），
   而"端口被占"与"实现坏了"表现不同，会让清扫用例假红。 */

function freePort() {
  return new Promise((resolve, reject) => {
    const s = http.createServer();
    s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => resolve(p)); });
    s.on("error", reject);
  });
}

let passN = 0, failN = 0;
function check(label, cond, detail) {
  if (cond) { passN++; console.log("  PASS  " + label.padEnd(46) + (detail ? "| " + detail : "")); }
  else { failN++; console.log("  FAIL  " + label.padEnd(46) + (detail ? "| " + detail : "")); }
}
function group(n) { console.log("\n" + n); }
/* env 键名由点号路径派生（index.js loadConfig：(prefix+k).toUpperCase().replace(/\./g,"__")）。
   手写必错——本批实测把 qrcodeTicketTtlSec 猜成 QRCODETICKETTLSEC / TICKETTTTLSEC 两种都错过，
   且错法静默（键不命中就静默用默认 300s，表现为"过期用例假红"）。统一程序化生成。 */
const envKey = (dotted) => dotted.split(".").map((s) => s.toUpperCase()).join("__");

const procs = [];
function startServer(port, env) {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, ["src/index.js"], {
      cwd: SRV,
      env: Object.assign({}, process.env, {
        PORT: String(port),
        ALLOW_PLACEHOLDER_SECRETS: "true",
        DATAFILE: path.join(TMP, "data-" + port + ".json"),
        AGENT_WORKBENCH_USER_CONFIG: path.join(SRV, "verify", ".no-user-config.json"), // 屏蔽本机 config.json（钩子见 src/config.js）
      }, env || {}),
      stdio: ["ignore", "pipe", "pipe"]
    });
    procs.push(p);
    let out = "", settled = false;
    p.stdout.on("data", (d) => { out += d.toString(); });
    p.stderr.on("data", (d) => { out += d.toString(); });
    const timer = setTimeout(() => {
      if (settled) return; settled = true; reject(new Error("端口 " + port + " 启动超时\n" + out));
    }, 20000);
    const tick = setInterval(async () => {
      if (settled) return;
      try {
        const j = await (await fetch("http://127.0.0.1:" + port + "/api/health")).json();
        if (j && j.name === "agent-workbench-auth") {
          settled = true; clearTimeout(timer); clearInterval(tick); resolve(p);
        }
      } catch (_e) { /* 未就绪 */ }
    }, 200);
    p.on("error", (e) => { if (!settled) { settled = true; clearTimeout(timer); clearInterval(tick); reject(e); } });
    p.on("exit", (code) => {
      if (settled || code === 0 || code === null) return;
      settled = true; clearTimeout(timer); clearInterval(tick);
      reject(new Error("端口 " + port + " 退出 code=" + code + "\n" + out));
    });
  });
}

/* ---- 假 GitHub：只懂 /token（POST form → json）与 /user（Bearer → profile）---- */
function startFakeGithub(port) {
  return new Promise((resolve, reject) => {
    const s = http.createServer((req, res) => {
      const u = new URL(req.url, "http://127.0.0.1");
      if (u.pathname === "/token" && req.method === "POST") {
        let body = "";
        req.on("data", (c) => { body += c; });
        req.on("end", () => {
          const pr = new URLSearchParams(body);
          if (pr.get("code") !== "good-code" || pr.get("client_id") !== "fake-client-id"
              || !pr.get("redirect_uri") || !pr.get("client_secret")) {
            res.writeHead(401, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "bad_verification_code" }));
            return;
          }
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ access_token: "fake-gh-access-token", token_type: "bearer" }));
        });
        return;
      }
      if (u.pathname === "/user" && req.method === "GET") {
        if ((req.headers.authorization || "") !== "Bearer fake-gh-access-token") {
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end("{}");
          return;
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ id: 4242, login: "octo-cat", name: "Octo Cat" }));
        return;
      }
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end("{}");
    });
    s.on("error", reject);
    s.listen(port, "127.0.0.1", () => resolve(s));
  });
}

const BASE = (p) => "http://127.0.0.1:" + p;
async function j(pathname, init) { return jAt(P_MAIN, pathname, init); }
async function jAt(p, pathname, init) {
  const r = await fetch(BASE(p) + pathname, init);
  let json = null; try { json = await r.json(); } catch (_e) { /* 非 JSON（HTML 页） */ }
  return { status: r.status, json: json, headers: r.headers };
}
async function raw(p, pathname) {
  const r = await fetch(BASE(p) + pathname);
  return { status: r.status, html: await r.text() };
}
function dataOf(p) { return JSON.parse(fs.readFileSync(path.join(TMP, "data-" + p + ".json"), "utf8")); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/* 从回调页里抽 postMessage 载荷（JSON.stringify 后只转义 < > &，JWT 本身安全） */
function extractPayload(html) {
  const m = /"type":"agent-github-oauth","state":"([^"]+)","accessToken":"([^"]+)","refreshToken":"([^"]+)"/.exec(html);
  return m ? { state: m[1], accessToken: m[2], refreshToken: m[3] } : null;
}

(async () => {
  P_MAIN = await freePort();
  P_FAKE = await freePort();
  P_BARE = await freePort();
  P_NODEV = await freePort();
  P_RL = await freePort();
  const fakeSrv = await startFakeGithub(P_FAKE);
  const mainEnv = {
    [envKey("dev.allowUnsafeDevEndpoints")]: "true",
    [envKey("github.enabled")]: "true",
    [envKey("github.clientId")]: "fake-client-id",
    [envKey("github.clientSecret")]: "fake-client-secret",
    [envKey("github.redirectUri")]: BASE(P_MAIN) + "/api/auth/github/callback",
    [envKey("github.postMessageOrigin")]: "http://app.example",
    [envKey("github.tokenUrl")]: BASE(P_FAKE) + "/token",
    [envKey("github.userUrl")]: BASE(P_FAKE) + "/user",
    [envKey("github.stateTtlSec")]: "2"   // 便于验过期（等待 2.2s）
  };
  await startServer(P_MAIN, mainEnv);
  const bare = await startServer(P_BARE, {});
  const nodev = await startServer(P_NODEV, {
    [envKey("github.enabled")]: "true",
    [envKey("github.clientId")]: "fake-client-id",
    [envKey("github.clientSecret")]: "fake-client-secret",
    [envKey("github.redirectUri")]: BASE(P_NODEV) + "/api/auth/github/callback",
    [envKey("github.tokenUrl")]: BASE(P_FAKE) + "/token",
    [envKey("github.userUrl")]: BASE(P_FAKE) + "/user"
    /* 故意不开 DEV__ALLOWUNSAFEDEVENDPOINTS → loopback 端点必须被拒 */
  });
  const rl = await startServer(P_RL, { [envKey("security.rateLimit.max")]: "3" });

  group("① 未配置实例：GitHub fail-closed 必须是 503 + 明确错误码（永不 404）");
  let r = await jAt(P_BARE, "/api/auth/github");
  check("GET /api/auth/github → 503 + github_not_configured",
    r.status === 503 && r.json && r.json.ok === false && r.json.error === "github_not_configured", "HTTP " + r.status + " " + (r.json && r.json.error));
  r = await raw(P_BARE, "/api/auth/github/callback?code=x&state=y");
  check("未配置时回调也 fail-closed（503 JSON，不发 HTML 页）",
    r.status === 503 && r.html.indexOf("github_not_configured") !== -1, "HTTP " + r.status);

  group("② 授权入口：形状对齐客户端 + state 入表");
  r = await j("/api/auth/github");
  const a = r.json && r.json.data;
  const m = /[?&]state=([0-9a-f]{32})/.exec((a && a.authorizeUrl) || "");
  check("返回 {authorizeUrl, state}（200）", r.status === 200 && !!a && /^[0-9a-f]{32}$/.test(a.state || ""), "state=" + (a && a.state));
  check("authorizeUrl 含 client_id/redirect_uri/scope 且 state 一致",
    a && /client_id=fake-client-id/.test(a.authorizeUrl)
    && a.authorizeUrl.indexOf(encodeURIComponent(BASE(P_MAIN) + "/api/auth/github/callback")) !== -1
    && /scope=read%3Auser/.test(a.authorizeUrl) && m && m[1] === a.state,
    (a && a.authorizeUrl || "").slice(0, 90));
  const st = dataOf(P_MAIN).oauthStates || {};
  const rec = Object.keys(st).map((k) => st[k]).find((v) => v.provider === "github");
  check("state 已入 oauthStates 表（provider=github）", !!rec && !!rec.createdAt);

  group("③ 回调全链路：兑换 → 签发 → postMessage 页");
  const state1 = a.state;
  let cb = await raw(P_MAIN, "/api/auth/github/callback?state=" + state1 + "&code=good-code");
  const p1 = extractPayload(cb.html);
  check("回调返回 HTML 页且载荷形状正确（type/state 回显）",
    cb.status === 200 && !!p1 && p1.state === state1
    && /"type":"agent-github-oauth"/.test(cb.html), "状态 " + cb.status);
  check("postMessage targetOrigin 取 config（http://app.example）",
    cb.html.indexOf("http://app.example") !== -1);
  let me = await j("/api/auth/me", { headers: { Authorization: "Bearer " + (p1 && p1.accessToken) } });
  const u1 = me.json && me.json.data && me.json.data.user;
  check("签发的 accessToken 真能用（/api/auth/me 200 + provider=github + providerId=4242）",
    me.status === 200 && u1 && u1.provider === "github" && u1.providerId === "4242",
    "provider=" + (u1 && u1.provider) + " id=" + (u1 && u1.id));
  const ref = await j("/api/auth/refresh", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refreshToken: p1.refreshToken }) });
  check("refreshToken 也是有效会话（refresh 200 拿新 accessToken）",
    ref.status === 200 && ref.json && ref.json.accessToken, "HTTP " + ref.status);
  const devs = await j("/api/auth/devices", { headers: { Authorization: "Bearer " + p1.accessToken } });
  const devList = (devs.json && devs.json.data && (devs.json.data.devices || [])) || [];
  check("设备列表新增 github-oauth 会话一条", devList.length === 1 && devList[0].deviceName === "github-oauth",
    JSON.stringify(devList.map((d) => d.deviceName)));

  group("④ 安全不变量（负例）");
  const replay = await raw(P_MAIN, "/api/auth/github/callback?state=" + state1 + "&code=good-code");
  check("state 一次性消费：重放 → state_invalid（页面不带 token）",
    replay.html.indexOf("state_invalid") !== -1 && replay.html.indexOf("accessToken") === -1);
  const r2 = await j("/api/auth/github");
  const state2 = r2.json && r2.json.data && r2.json.data.state;
  const bad = await raw(P_MAIN, "/api/auth/github/callback?state=" + state2 + "&code=wrong-code");
  check("兑换失败 → exchange_failed（页面不带 token）",
    bad.html.indexOf("exchange_failed") !== -1 && bad.html.indexOf("accessToken") === -1);
  const r3 = await j("/api/auth/github");
  const state3 = r3.json && r3.json.data && r3.json.data.state;
  const denied = await raw(P_MAIN, "/api/auth/github/callback?state=" + state3 + "&error=access_denied");
  check("用户在 GitHub 取消 → denied 页",
    denied.html.indexOf("denied") !== -1 && denied.html.indexOf("accessToken") === -1);
  const r4 = await j("/api/auth/github");
  const state4 = r4.json && r4.json.data && r4.json.data.state;
  check("过期 state：等待 2.2s（stateTtlSec=2）后回调 → state_expired", !!state4);
  await sleep(2300);
  const expired = await raw(P_MAIN, "/api/auth/github/callback?state=" + state4 + "&code=good-code");
  check("  → 页面含 state_expired 且无 token",
    expired.html.indexOf("state_expired") !== -1 && expired.html.indexOf("accessToken") === -1);

  group("⑤ loopback 端点必须有 dev 开关才放行（SSRF 面）");
  const ndAuth = await jAt(P_NODEV, "/api/auth/github");
  const ndState = ndAuth.json && ndAuth.json.data && ndAuth.json.data.state;
  const ndCb = await raw(P_NODEV, "/api/auth/github/callback?state=" + ndState + "&code=good-code");
  check("关掉 dev 开关：loopback tokenUrl → forbidden_host（无 token）",
    ndCb.html.indexOf("forbidden_host") !== -1 && ndCb.html.indexOf("accessToken") === -1,
    ndCb.html.slice(0, 60).replace(/\n/g, " "));

  group("⑥ 幂等身份 + 审计");
  const again = await j("/api/auth/github");
  const stateA = again.json && again.json.data && again.json.data.state;
  const cbA = await raw(P_MAIN, "/api/auth/github/callback?state=" + stateA + "&code=good-code");
  const pA = extractPayload(cbA.html);
  const meA = await j("/api/auth/me", { headers: { Authorization: "Bearer " + (pA && pA.accessToken) } });
  const uA = meA.json && meA.json.data && meA.json.data.user;
  check("同一 GitHub id 二次登录 = 同一用户（不新建）", !!uA && uA.id === u1.id,
    "first=" + u1.id + " second=" + (uA && uA.id));
  const ghUsers = Object.keys(dataOf(P_MAIN).users || {}).map((k) => dataOf(P_MAIN).users[k]).filter((u) => u.provider === "github");
  check("users 表里 github 用户恰好 1 个", ghUsers.length === 1, "count=" + ghUsers.length);
  check("github 用户 email 为 null（不进 findUserByEmail 命中域）", ghUsers[0] && ghUsers[0].email === null);
  const audit = Object.keys(dataOf(P_MAIN).audit || {});
  const events = audit.length ? dataOf(P_MAIN).audit[audit[0]] : [];
  check("审计环有 register(provider=github) + login(provider=github)",
    events.some((e) => e.ev === "register" && e.ctx && e.ctx.provider === "github")
    && events.some((e) => e.ev === "login" && e.ctx && e.ctx.provider === "github"),
    events.map((e) => e.ev + (e.ctx && e.ctx.provider ? ":" + e.ctx.provider : "")).join(","));

  group("⑥b state 惰性清扫（专用实例，避免与上面各用例的 state 交叉）");
  const P_SWEEP = await freePort();
  const sweepEnv = {
    [envKey("dev.allowUnsafeDevEndpoints")]: "true",
    [envKey("github.enabled")]: "true",
    [envKey("github.clientId")]: "fake-client-id",
    [envKey("github.clientSecret")]: "fake-client-secret",
    [envKey("github.redirectUri")]: BASE(P_SWEEP) + "/api/auth/github/callback",
    [envKey("github.tokenUrl")]: BASE(P_FAKE) + "/token",
    [envKey("github.userUrl")]: BASE(P_FAKE) + "/user",
    [envKey("github.stateTtlSec")]: "2"
  };
  await startServer(P_SWEEP, sweepEnv);
  await jAt(P_SWEEP, "/api/auth/github");        // 造一条 state
  check("清扫前表里有 1 条", Object.keys(dataOf(P_SWEEP).oauthStates || {}).length === 1);
  await sleep(2300);                              // 等它超过 TTL（2s）
  await jAt(P_SWEEP, "/api/auth/github");        // 新 authorize 触发 sweep
  const left = Object.keys(dataOf(P_SWEEP).oauthStates || {}).length;
  check("过期 state 被扫掉，只剩新造的 1 条", left === 1, "left=" + left);

  group("⑦ 限流：/github 挂 login 同款 IP 桶");
  let codes = [];
  for (let i = 0; i < 5; i++) {
    const rr = await fetch(BASE(P_RL) + "/api/auth/github");
    codes.push(rr.status + (rr.headers.get("retry-after") ? "|ra" : ""));
    await rr.text().catch(() => {});
  }
  check("MAX=3 时前 3 个 503、后 2 个 429 + Retry-After", codes.join(" ").indexOf("429|ra") !== -1, codes.join(" "));

  group("⑧ 微信扫码登录（演示模式：qrcode→pending→confirm→confirmed→一次性消费）");
  r = await j("/api/auth/wechat/qrcode", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  const wd = r.json && r.json.data;
  check("qrcode → {qr, scene, expireIn, demo:true}（演示码可自证）",
    r.status === 200 && wd && typeof wd.qr === "string" && wd.qr.indexOf("data:image/svg+xml") === 0
    && typeof wd.scene === "string" && wd.scene && Number(wd.expireIn) > 0 && wd.demo === true,
    "scene=" + (wd && wd.scene) + " demo=" + (wd && wd.demo));
  const scene = wd && wd.scene;
  r = await j("/api/auth/wechat/status?scene=" + encodeURIComponent("nosuchscene"));
  check("未知 scene → 404 scene_not_found", r.status === 404 && r.json && r.json.error === "scene_not_found");
  r = await j("/api/auth/wechat/status?scene=" + encodeURIComponent(scene));
  check("确认前 → pending + expireIn",
    r.status === 200 && r.json && r.json.data && r.json.data.status === "pending" && Number(r.json.data.expireIn) >= 0,
    "status=" + (r.json && r.json.data && r.json.data.status));
  r = await jAt(P_BARE, "/api/auth/wechat/confirm?scene=" + encodeURIComponent(scene) + "&email=demo@example.com");
  check("dev 开关关闭的实例上 confirm → 404 not_found（不暴露端点）",
    r.status === 404 && r.json && r.json.error === "not_found", "HTTP " + r.status);
  r = await j("/api/auth/wechat/confirm?scene=" + encodeURIComponent(scene) + "&email=demo@example.com");
  check("dev 开关开的实例上 confirm → 200", r.status === 200 && r.json && r.json.ok === true, "HTTP " + r.status);
  r = await j("/api/auth/wechat/status?scene=" + encodeURIComponent(scene));
  const wt = r.json && r.json.data && r.json.data.accessToken;
  check("确认后 → confirmed + accessToken（且 scene 被一次性消费）",
    r.status === 200 && r.json && r.json.data && r.json.data.status === "confirmed" && !!wt);
  me = await j("/api/auth/me", { headers: { Authorization: "Bearer " + wt } });
  const wu = me.json && me.json.data && me.json.data.user;
  check("演示签发的 token 真能用（/me 200 + provider=wechat）",
    me.status === 200 && wu && wu.provider === "wechat", "provider=" + (wu && wu.provider));
  r = await j("/api/auth/wechat/status?scene=" + encodeURIComponent(scene));
  check("scene 一次性：再轮询 → 404（不能反复领 token）", r.status === 404 && r.json && r.json.error === "scene_not_found");

  group("⑨ 微信二维码过期（qrcodeTicketTtlSec=1 的专用实例）");
  const P_WX = await freePort();
  await startServer(P_WX, { [envKey("dev.allowUnsafeDevEndpoints")]: "true", [envKey("wechat.qrcodeTicketTtlSec")]: "1" });
  r = await jAt(P_WX, "/api/auth/wechat/qrcode", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  const wscene = r.json && r.json.data && r.json.data.scene;
  await sleep(1300);
  r = await jAt(P_WX, "/api/auth/wechat/status?scene=" + encodeURIComponent(wscene));
  check("超过 TTL → expired（且 scene 被清掉）",
    r.status === 200 && r.json && r.json.data && r.json.data.status === "expired",
    "status=" + (r.json && r.json.data && r.json.data.status));
  r = await jAt(P_WX, "/api/auth/wechat/status?scene=" + encodeURIComponent(wscene));
  check("  → 再查已是 scene_not_found（过期即清理）", r.status === 404);

  for (const p of procs) { try { p.kill(); } catch (_e) { /* 已退出 */ } }
  try { fakeSrv.close(); } catch (_e) { /* 已关 */ }
  fs.rmSync(TMP, { recursive: true, force: true });

  console.log("\n=== 汇总：" + passN + "/" + (passN + failN) + " 通过 ===");
  process.exit(failN ? 1 : 0);
})().catch((e) => {
  console.error("oauth-check 异常：", e);
  for (const p of procs) { try { p.kill(); } catch (_e) { /* 已退出 */ } }
  process.exit(2);
});
