/* 客户端 ↔ 后端契约联调检查（本仓「从未联调」的补课）。
 *
 * 运行：cd server && node verify/client-contract-check.cjs
 *
 * 做什么：忠实复现客户端 apiFetch 的真实调用序列（含鉴权头、含 401 刷新路径），
 * 逐个端点比对「客户端调用的」vs「后端实现的」，把缺口如实列出来。
 *
 * 端点清单来源：grep -rhno '"/api/...*"' src/*.js 与 src/ui-ge-api.js 的 apiFetch 调用点。
 * 客户端在 src，本脚本不改客户端（并行会话正在动 src/），只做只读比对 + 实测。
 *
 * 环境坑沿用 hardening-check：独立端口 4571（Docker 占 3001）+ Node fetch 直连（不读 http_proxy）。
 */
"use strict";
const { spawn } = require("node:child_process");
const path = require("node:path");

const SRV = path.join(__dirname, "..");
const PORT = "4572";
const BASE = "http://127.0.0.1:" + PORT;

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
  /* 默认带 token（客户端 apiGetHeaders 就是默认带 Authorization），
     只有显式 { auth:false } 才不带 —— 否则 "无 token 应 401" 那组用例永远"绿"，
     因为它和正常用例走的是同一条无 token 的路径。 */
  const wantAuth = opts ? opts.auth !== false : true;
  if (wantAuth && TOKEN) headers["Authorization"] = "Bearer " + TOKEN;
  const r = await fetch(BASE + urlPath, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  });
  let j = null;
  try { j = await r.json(); } catch (_e) { /* 非 JSON */ }
  return { status: r.status, json: j };
}

/* 每行：[标签, 方法, 路径, body, 客户端是否依赖它]
 * required=true 表示这是客户端主链路上的真实依赖，404 就是「功能不可用」。 */
const steps = [];
const knownGaps = [];
/* known=true 表示「已识别但本轮有意不做」的缺口：如实打印、不计失败，
   但每次跑都会显示，避免「记进文档后就被遗忘」。 */
function record(group, label, res, expectStatuses, known) {
  const pass = expectStatuses.includes(res.status);
  if (known && !pass) {
    knownGaps.push({ group, label, status: res.status });
    console.log("  KNOWN " + label.padEnd(42) + "HTTP " + String(res.status).padEnd(4) + " (已识别·待设计，不计失败)");
    return;
  }
  steps.push({ group, label, status: res.status, pass, err: res.json && res.json.error });
  console.log(
    (pass ? "  OK    " : "  GAP   ") + label.padEnd(42) +
    "HTTP " + String(res.status).padEnd(4) +
    (res.json && res.json.error ? " " + res.json.error : "")
  );
}

(async () => {
  const proc = await startServer();
  const mail = "contract" + Date.now() + "@example.com";

  console.log("\n[1] 鉴权主链路（客户端 apiClientModule）");
  let r = await hit("GET", "/api/health", null, { auth: false });
  record("auth", "GET  /api/health", r, [200]);

  r = await hit("POST", "/api/auth/register", { email: mail, password: "abcd12345", deviceName: "contract-check" }, { auth: false });
  record("auth", "POST /api/auth/register", r, [200]);
  if (r.json && r.json.data) { TOKEN = r.json.data.accessToken; }

  r = await hit("POST", "/api/auth/login", { email: mail, password: "abcd12345", deviceName: "contract-check" }, { auth: false });
  record("auth", "POST /api/auth/login", r, [200]);
  if (r.json && r.json.data && r.json.data.accessToken) TOKEN = r.json.data.accessToken;

  r = await hit("GET", "/api/auth/me", null);
  record("auth", "GET  /api/auth/me", r, [200]);

  r = await hit("GET", "/api/auth/devices", null);
  record("auth", "GET  /api/auth/devices", r, [200]);

  r = await hit("POST", "/api/auth/refresh", { refreshToken: "invalid-token-shape" }, { auth: false });
  // 用无效 token 只为证明端点存在且正确拒绝（401）；404 才是「端点没实现」
  record("auth", "POST /api/auth/refresh（无效 token 应 401）", r, [401]);

  console.log("\n[2] 通知 / 集成（客户端 /api/notifications/* 与 /api/integrations/*）");
  r = await hit("GET", "/api/notifications/preferences", null);
  record("notify", "GET  /api/notifications/preferences", r, [200]);

  r = await hit("PUT", "/api/notifications/preferences", { enabled: true }, { auth: true });
  record("notify", "PUT  /api/notifications/preferences", r, [200]);

  r = await hit("POST", "/api/notifications/push/subscribe", { endpoint: "https://example.com/push/x", keys: { auth: "a", p256dh: "p" } }, { auth: true });
  record("notify", "POST /api/notifications/push/subscribe", r, [200]);

  r = await hit("POST", "/api/notifications/push/unsubscribe", { endpoint: "https://example.com/push/x" }, { auth: true });
  record("notify", "POST /api/notifications/push/unsubscribe", r, [200]);

  r = await hit("GET", "/api/notifications/schedules", null);
  record("notify", "GET  /api/notifications/schedules", r, [200]);

  r = await hit("POST", "/api/notifications/schedules", { title: "联调用例", when: Date.now(), repeat: "once" }, { auth: true });
  record("notify", "POST /api/notifications/schedules", r, [200]);

  r = await hit("GET", "/api/integrations/status", null);
  record("integ", "GET  /api/integrations/status", r, [200]);

  r = await hit("GET", "/api/integrations/oauth/notion/callback?code=x", null);
  record("integ", "GET  /api/integrations/oauth/:p/callback", r, [200]);

  console.log("\n[3] 云同步 / 抓取代理（客户端主链路调用）");
  r = await hit("GET", "/api/sync/snapshot", null);
  record("sync", "GET  /api/sync/snapshot  ← 云同步读", r, [200]);

  r = await hit("PUT", "/api/sync/snapshot", { snapshot: { probe: true }, updatedAt: Date.now() }, { auth: true });
  record("sync", "PUT  /api/sync/snapshot  ← 云同步写", r, [200]);

  /* 回读验证：只验 PUT 返回 200 证明不了「真的存下来了」——
     端点可以回 200 却什么都不写。必须 PUT 一份带唯一标记的快照再 GET 回来比对。 */
  const probe = { marker: "roundtrip-" + Date.now(), tasks: [{ id: "t1" }] };
  await hit("PUT", "/api/sync/snapshot", { snapshot: probe, updatedAt: Date.now() }, { auth: true });
  const back = await hit("GET", "/api/sync/snapshot", null);
  const got = back.json && back.json.data ? back.json.data.snapshot : null;
  record("sync", "回读：PUT 后 GET 拿到同一份快照",
    { status: got && got.marker === probe.marker ? 200 : 0, json: null }, [200]);

  /* updatedAt 必须**原样回传**客户端写入时自报的值：
     客户端推送后用本地 Date.now() 记 lastPushAt（ui-ge-api.js:546），
     再用它跟服务端返回的 updatedAt 比大小判断「云端是否有其他设备的更新」（render-overview.js:1413），
     并按本地时区展示（:1428）。服务端若把它替换成自己的时间，跨设备部署就会判错方向。
     同机 localhost 两者同钟，所以这个错在本地联调里看不出来 —— 必须显式钉住。 */
  const stamp = 1700000000000;
  await hit("PUT", "/api/sync/snapshot", { snapshot: { t: 1 }, updatedAt: stamp }, { auth: true });
  const rt = await hit("GET", "/api/sync/snapshot", null);
  const gotTs = rt.json && rt.json.data ? rt.json.data.updatedAt : null;
  record("sync", "updatedAt 原样回传（不得替换为服务端时间）",
    { status: gotTs === stamp ? 200 : 0, json: null }, [200]);

  // 契约要求空态是 snapshot:null（不能是 {}，否则客户端会把空对象当成真实快照应用下去）
  const freshMail = "empty" + Date.now() + "@example.com";
  const reg2 = await hit("POST", "/api/auth/register", { email: freshMail, password: "abcd12345" }, { auth: false });
  const savedTok = TOKEN;
  if (reg2.json && reg2.json.data) TOKEN = reg2.json.data.accessToken;
  const empty = await hit("GET", "/api/sync/snapshot", null);
  record("sync", "空态：新账号读快照返回 snapshot:null",
    { status: (empty.json && empty.json.data && empty.json.data.snapshot === null) ? 200 : 0, json: null }, [200]);
  TOKEN = savedTok;

  r = await hit("POST", "/api/tools/fetch", { url: "https://example.com" }, { auth: true });
  record("tools", "POST /api/tools/fetch   ← web_fetch 代理", r, [200], true);

  console.log("\n[4] 鉴权边界（未带 token 必须被拒）");
  const saved = TOKEN; TOKEN = null;
  r = await hit("GET", "/api/auth/me", null, { auth: false });
  record("guard", "GET  /api/auth/me（无 token 应 401）", r, [401]);
  r = await hit("GET", "/api/notifications/preferences", null, { auth: false });
  record("guard", "GET  /api/notifications/preferences（无 token）", r, [401]);
  // 快照含该用户全部数据，未鉴权即可读写是最严重的一类缺陷 —— 单独钉死
  r = await hit("GET", "/api/sync/snapshot", null, { auth: false });
  record("guard", "GET  /api/sync/snapshot（无 token 应 401）", r, [401]);
  r = await hit("PUT", "/api/sync/snapshot", { snapshot: { x: 1 } }, { auth: false });
  record("guard", "PUT  /api/sync/snapshot（无 token 应 401）", r, [401]);
  TOKEN = saved;

  r = await hit("POST", "/api/auth/logout", { refreshToken: "x" }, { auth: true });
  record("auth", "POST /api/auth/logout", r, [200]);

  proc.kill();

  const gaps = steps.filter((s) => !s.pass);
  console.log("\n=== 汇总：" + (steps.length - gaps.length) + "/" + steps.length + " 端点符合契约 ===");
  if (gaps.length) {
    console.log("缺口：");
    gaps.forEach((g) => console.log("  · [" + g.group + "] " + g.label + " → HTTP " + g.status + (g.err ? " (" + g.err + ")" : "")));
  }
  if (knownGaps.length) {
    console.log("已识别、本轮有意不做的缺口（不计失败，但每次都会列出来）：");
    knownGaps.forEach((g) => console.log("  · [" + g.group + "] " + g.label + " → HTTP " + g.status));
  }
  process.exit(gaps.length ? 1 : 0);
})().catch((e) => { console.error("联调脚本异常：", e); process.exit(2); });
