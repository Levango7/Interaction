/* server/verify/router-isolation-check.cjs
 * 路由隔离检查（审计遗留 P2：extrasRouter 交叉污染，docs/backend-recovery-assessment.md §五）。
 *
 * 背景：原 index.js 把**同一个 extrasRouter 实例**挂到两个前缀下：
 *   app.use("/api/notifications", extrasRouter(cfg, store));
 *   app.use("/api/integrations",  extrasRouter(cfg, store));
 * → /api/integrations/preferences、/api/notifications/status 等交叉路径全部可达，
 *   攻击面翻倍（同一套 authMiddleware 保护，无越权，故定为 P2）。
 * 修法：按前缀拆成 notificationsRouter / integrationsRouter 两个独立工厂，各挂各的。
 * 本脚本把「各挂各的」钉成可执行断言，防回潮。
 *
 * 断言纪律（本项目血泪口径）：
 *   · **双向**：交叉路径必须 404（缺陷被拒）**且**合法路由必须仍 200（拆分没拆坏）；
 *   · **钉错误指纹**，不只状态码：交叉路径必须同时满足 404 + error==="not_found"——
 *     「被守卫拦下」与「路由不存在」可能同为 404，只查状态码分不清；
 *   · **防假修**：合法路由无 token 必须 401 + no_token——把 am 中间件摘掉也能让
 *     交叉路径变 404，那样"修好了隔离、打穿了鉴权"，必须被本脚本抓住；
 *   · **对照组**：真未知路径的 404 形状单独验一条，证明指纹判据本身是活的。
 *
 * 运行：cd server && node verify/router-isolation-check.cjs
 *
 * 环境坑沿用其余脚本：端口动态分配（Docker 占 3001）+ Node fetch 直连
 * （本机 http_proxy 劫持 localhost，curl 会拿到别的服务）。
 */
"use strict";
const { spawn } = require("node:child_process");
const path = require("node:path");

const SRV = path.join(__dirname, "..");
/* v3.7.114 起端口全部动态分配：写死端口实测被本机占用（Windows Hyper-V 保留段
   会让 listen 报 EACCES），而"端口被占"与"实现坏了"表现不同，会害脚本假红。 */
let PORT = null;
let BASE = null;
function freePort() {
  return new Promise((resolve, reject) => {
    const s = require("node:http").createServer();
    s.listen(0, "127.0.0.1", () => { const p2 = s.address().port; s.close(() => resolve(String(p2))); });
    s.on("error", reject);
  });
}

function startServer() {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, ["src/index.js"], {
      cwd: SRV,
      env: Object.assign({}, process.env, { PORT, ALLOW_PLACEHOLDER_SECRETS: "true" }),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    p.stdout.on("data", (d) => { out += d.toString(); });
    p.stderr.on("data", (d) => { out += d.toString(); });
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true; clearInterval(tick);
      reject(new Error("启动超时\n子进程输出：[" + out + "]"));
    }, 10000);
    const tick = setInterval(async () => {
      if (settled) return;
      try {
        const r = await fetch(BASE + "/api/health");
        const j = await r.json();
        if (j && j.name === "agent-workbench-auth") { settled = true; clearTimeout(timer); clearInterval(tick); resolve(p); }
      } catch (_e) { /* 未就绪 */ }
    }, 200);
    // spawn 自身失败（ENOENT / EACCES 等）不触发 exit，必须单独接，否则表现成"静默超时"
    p.on("error", (err) => { if (settled) return; settled = true; clearTimeout(timer); clearInterval(tick); reject(new Error("spawn 失败：" + err.message)); });
    p.on("exit", (code) => {
      if (settled || code === 0 || code === null) return;
      settled = true; clearTimeout(timer); clearInterval(tick);
      reject(new Error("进程退出 code=" + code + "\n子进程输出：[" + out + "]"));
    });
  });
}

let TOKEN = null;
async function hit(method, urlPath, body, opts) {
  const headers = {};
  if (body) headers["Content-Type"] = "application/json";
  // 默认带 token（客户端 apiGetHeaders 即默认带 Authorization）；显式 { auth:false } 才不带
  const wantAuth = opts ? opts.auth !== false : true;
  if (wantAuth && TOKEN) headers["Authorization"] = "Bearer " + TOKEN;
  const r = await fetch(BASE + urlPath, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  });
  let j = null;
  try { j = await r.json(); } catch (_e) { /* 非 JSON */ }
  return { status: r.status, json: j };
}

const steps = [];
/* want: { status, error? } —— error 给定时必须逐字匹配（错误指纹），不给则只判状态码 */
function expect(label, res, want) {
  const statusOk = res.status === want.status;
  const errOk = want.error === undefined || !!(res.json && res.json.error === want.error);
  const pass = statusOk && errOk;
  steps.push({ label, pass, status: res.status, error: res.json && res.json.error });
  console.log(
    (pass ? "  OK    " : "  FAIL  ") + label.padEnd(52) +
    "HTTP " + String(res.status).padEnd(4) +
    (res.json && res.json.error ? " " + res.json.error : "") +
    (pass ? "" : "  （期望 " + want.status + (want.error ? " + " + want.error : "") + "）")
  );
}

(async () => {
  PORT = await freePort();
  BASE = "http://127.0.0.1:" + PORT;
  const proc = await startServer();

  /* 数据文件持久化 → 固定邮箱第二次注册必 409，用时间戳保证幂等 */
  const mail = "isolation" + Date.now() + "@example.com";
  const reg = await hit("POST", "/api/auth/register", { email: mail, password: "abcd12345", deviceName: "router-isolation-check" }, { auth: false });
  if (!(reg.json && reg.json.data && reg.json.data.accessToken)) {
    console.error("注册失败，无法继续：HTTP " + reg.status + " " + JSON.stringify(reg.json));
    proc.kill();
    process.exit(2);
  }
  TOKEN = reg.json.data.accessToken;

  console.log("\n[1] 合法路由必须仍可达（拆分回归面：notifications 6 条 + integrations 2 条，期望 200）");
  let r = await hit("GET", "/api/notifications/preferences", null);
  expect("GET  /api/notifications/preferences", r, { status: 200 });
  r = await hit("PUT", "/api/notifications/preferences", { enabled: true });
  expect("PUT  /api/notifications/preferences", r, { status: 200 });
  const pushEp = "https://example.com/push/iso-" + Date.now();
  r = await hit("POST", "/api/notifications/push/subscribe", { endpoint: pushEp, keys: { auth: "a", p256dh: "p" } });
  expect("POST /api/notifications/push/subscribe", r, { status: 200 });
  r = await hit("POST", "/api/notifications/push/unsubscribe", { endpoint: pushEp });
  expect("POST /api/notifications/push/unsubscribe", r, { status: 200 });
  r = await hit("GET", "/api/notifications/schedules", null);
  expect("GET  /api/notifications/schedules", r, { status: 200 });
  r = await hit("POST", "/api/notifications/schedules", { title: "隔离检查", when: Date.now(), repeat: "once" });
  expect("POST /api/notifications/schedules", r, { status: 200 });
  r = await hit("GET", "/api/integrations/status", null);
  expect("GET  /api/integrations/status", r, { status: 200 });
  r = await hit("GET", "/api/integrations/oauth/notion/callback?code=x", null);
  expect("GET  /api/integrations/oauth/:p/callback", r, { status: 200 });

  console.log("\n[2] 交叉路径必须不存在（404 + not_found 指纹；缺陷本体，回潮即红）");
  r = await hit("GET", "/api/integrations/preferences", null);
  expect("GET  /api/integrations/preferences", r, { status: 404, error: "not_found" });
  r = await hit("GET", "/api/notifications/status", null);
  expect("GET  /api/notifications/status", r, { status: 404, error: "not_found" });
  r = await hit("PUT", "/api/integrations/preferences", { enabled: true });
  expect("PUT  /api/integrations/preferences", r, { status: 404, error: "not_found" });
  r = await hit("POST", "/api/integrations/schedules", { title: "x" });
  expect("POST /api/integrations/schedules", r, { status: 404, error: "not_found" });
  r = await hit("POST", "/api/integrations/push/subscribe", { endpoint: pushEp });
  expect("POST /api/integrations/push/subscribe", r, { status: 404, error: "not_found" });
  r = await hit("GET", "/api/notifications/oauth/github/callback?code=x", null);
  expect("GET  /api/notifications/oauth/:p/callback", r, { status: 404, error: "not_found" });

  console.log("\n[3] 合法路由的鉴权守卫必须仍在（无 token 期望 401 + no_token，防「摘 am 假修隔离」）");
  const saved = TOKEN; TOKEN = null;
  r = await hit("GET", "/api/notifications/preferences", null, { auth: false });
  expect("GET  /api/notifications/preferences（无 token）", r, { status: 401, error: "no_token" });
  r = await hit("GET", "/api/integrations/status", null, { auth: false });
  expect("GET  /api/integrations/status（无 token）", r, { status: 401, error: "no_token" });
  TOKEN = saved;

  console.log("\n[4] 对照组：真未知路径的 404 形状（证明第 2 组的指纹判据本身是活的）");
  r = await hit("GET", "/api/definitely-not-a-real-endpoint", null);
  expect("GET  /api/definitely-not-a-real-endpoint", r, { status: 404, error: "not_found" });

  proc.kill();

  const failed = steps.filter((s) => !s.pass);
  console.log("\n=== 汇总：" + (steps.length - failed.length) + "/" + steps.length + " 通过 ===");
  if (failed.length) {
    console.log("未通过：");
    failed.forEach((f) => console.log("  · " + f.label + " → HTTP " + f.status + (f.error ? " (" + f.error + ")" : "")));
  }
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error("隔离检查脚本异常：", e); process.exit(2); });
