/* 越权（IDOR）检查：跨用户读写/删除他人资源必须被拒。
 *
 * 运行：cd server && node verify/idor-check.cjs
 * 期望：全绿（exit 0）。
 *
 * 背景（2026-10-10 审查发现）：
 *   notifications.js（v3.7.122 前为 extras.js）的 DELETE /schedules/:id 与 auth.js 的 DELETE /devices/:id
 *   只按 id 查找全局集合，**不校验该资源属不属于当前登录用户** →
 *   任何已登录用户都能删掉别人的定时提醒、或踢掉别人的登录设备（强制下线）。
 *   对比同文件的 PUT /schedules/:id 是有归属校验的（s.userId !== req.user.sub），
 *   说明这是遗漏而非设计。
 *
 * 判定口径：所有「B 动 A 的资源」的用例都必须失败（404），
 * 且「A 动自己的资源」必须成功 —— 后者不可省，否则「把端点改死」也会绿。
 */
"use strict";
const { spawn } = require("node:child_process");
const { readFileSync, writeFileSync } = require("node:fs");
const path = require("node:path");

const SRV = path.join(__dirname, "..");
/* v3.7.114：端口改**动态分配**。写死 4574 实测被本机占用（Windows Hyper-V 保留段会让 listen 报 EACCES，
   而"端口被占"与"实现坏了"表现不同，会让本脚本假红 —— 今天连栽三次）。security-check/oauth-check 同因改过。 */
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
      env: Object.assign({}, process.env, { PORT, ALLOW_PLACEHOLDER_SECRETS: "true", AGENT_WORKBENCH_USER_CONFIG: path.join(SRV, "verify", ".no-user-config.json") /* 屏蔽本机 config.json（钩子见 src/config.js） */ }),
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
        const j = await (await fetch(BASE + "/api/health")).json();
        if (j && j.name === "agent-workbench-auth") { settled = true; clearTimeout(timer); clearInterval(tick); resolve(p); }
      } catch (_e) { /* 未就绪 */ }
    }, 200);
    p.on("error", (err) => { if (settled) return; settled = true; clearTimeout(timer); clearInterval(tick); reject(new Error("spawn 失败：" + err.message)); });
    p.on("exit", (code) => {
      if (settled || code === 0 || code === null) return;
      settled = true; clearTimeout(timer); clearInterval(tick);
      reject(new Error("进程退出 code=" + code + "\n子进程输出：[" + out + "]"));
    });
  });
}

async function req(method, urlPath, body, token) {
  const headers = {};
  if (body) headers["Content-Type"] = "application/json";
  if (token) headers["Authorization"] = "Bearer " + token;
  const r = await fetch(BASE + urlPath, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let j = null;
  try { j = await r.json(); } catch (_e) { /* 非 JSON */ }
  return { status: r.status, json: j };
}

async function register(tag) {
  const r = await req("POST", "/api/auth/register", { email: tag + Date.now() + "@example.com", password: "abcd12345", deviceName: tag });
  return r.json && r.json.data ? r.json.data : null;
}

const results = [];
function check(name, cond, detail) {
  results.push({ name, pass: !!cond });
  console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "  |  " + detail : ""));
}

(async () => {
  PORT = await freePort();
  BASE = "http://127.0.0.1:" + PORT;
  const proc = await startServer();

  const A = await register("alice");
  const B = await register("bob");
  check("前置：两个独立账号注册成功", !!(A && B && A.user.id !== B.user.id));

  // ---------- 定时提醒 ----------
  console.log("\n[1] 定时提醒：B 不得动 A 的 schedule");
  const created = await req("POST", "/api/notifications/schedules", { title: "A 的私密提醒", when: Date.now() }, A.accessToken);
  const schId = created.json && created.json.data && created.json.data.schedule ? created.json.data.schedule.id : null;
  check("前置：A 创建 schedule 成功", !!schId, "id=" + schId);

  let r = await req("PUT", "/api/notifications/schedules/" + schId, { title: "B 篡改" }, B.accessToken);
  check("B 改 A 的 schedule 应 404（同文件 PUT 已有归属校验）", r.status === 404, "HTTP " + r.status + " " + JSON.stringify(r.json));

  r = await req("DELETE", "/api/notifications/schedules/" + schId, null, B.accessToken);
  check("B 删 A 的 schedule 应 404（越权删除）", r.status === 404, "HTTP " + r.status + " " + JSON.stringify(r.json));

  r = await req("DELETE", "/api/notifications/schedules/" + schId, null, A.accessToken);
  check("对照：A 删自己的 schedule 应 200（缺此条则「把端点改死」也会绿）", r.status === 200, "HTTP " + r.status);

  // ---------- 设备会话 ----------
  console.log("\n[2] 设备会话：B 不得踢掉 A 的设备");
  const A2 = await req("POST", "/api/auth/login", { email: A.user.email, password: "abcd12345", deviceName: "alice-2nd" }, null);
  const aToken2 = A2.json && A2.json.data ? A2.json.data.accessToken : null;
  const devs = await req("GET", "/api/auth/devices", null, aToken2 || A.accessToken);
  const devList = devs.json && devs.json.data ? devs.json.data.devices : [];
  check("前置：A 至少有一个设备会话", devList.length >= 1, "count=" + devList.length);
  const victimDev = devList.find((d) => !d.current) || devList[0];
  check("前置：拿到 A 的某个设备 id", !!(victimDev && victimDev.id), "id=" + (victimDev && victimDev.id));

  const before = (await req("GET", "/api/auth/devices", null, aToken2 || A.accessToken)).json.data.devices.length;
  r = await req("DELETE", "/api/auth/devices/" + victimDev.id, null, B.accessToken);
  const after = (await req("GET", "/api/auth/devices", null, aToken2 || A.accessToken)).json.data.devices.length;
  check("B 删 A 的设备应 404（越权踢人 = 强制他人下线）", r.status === 404, "HTTP " + r.status + " " + JSON.stringify(r.json));
  check("且 A 的设备数不得因 B 的调用而减少", after === before, "before=" + before + " after=" + after);

  // ---------- 推送订阅（同一形态第三次：v3.7.105 修过 devices/schedules，这条一直漏着） ----------
  /* 判据设计：push 没有「列出我的订阅」端点，所以**直读服务端数据文件**判定 ——
     不让被测对象给自己出成绩单（同本仓 R-22 的口径）。 */
  console.log("\n[3] 推送订阅：B 不得删掉 A 的订阅");
  const EP = "https://push.example.com/ep-" + Date.now();
  const DATA = path.join(SRV, "data", "auth.json");
  const subsOf = (ep) => {
    try {
      const j = JSON.parse(readFileSync(DATA, "utf8"));
      return (j.pushSubs || []).filter((s) => s && s.endpoint === ep);
    } catch (_e) { return []; }
  };

  let r3 = await req("POST", "/api/notifications/push/subscribe", { endpoint: EP, keys: { auth: "k1", p256dh: "k2" } }, A.accessToken);
  check("前置：A 订阅推送成功", r3.status === 200, "HTTP " + r3.status);
  const pre = subsOf(EP);
  check("前置：数据文件里确实有 A 的这条订阅（否则下面的断言是空转）", pre.length === 1 && pre[0].userId === A.user.id, JSON.stringify(pre));

  await req("POST", "/api/notifications/push/unsubscribe", { endpoint: EP }, B.accessToken);
  const afterB = subsOf(EP);
  check("B 调 unsubscribe 后 A 的订阅**必须还在**（endpoint 是资源标识，不是凭据）", afterB.length === 1, "剩余 " + afterB.length + " 条：" + JSON.stringify(afterB));

  await req("POST", "/api/notifications/push/unsubscribe", { endpoint: EP }, A.accessToken);
  const afterA = subsOf(EP);
  check("对照：A 删自己的订阅应生效（缺此条则「把端点改死」也会绿）", afterA.length === 0, "剩余 " + afterA.length + " 条");

  // ---------- 第三方集成（v3.7.156：userId 维度）----------
  /* 判据设计：集成没有「他人资源 id」可猜（provider 固定三个、连接落在各自 userId 下），
     所以测的是隔离本身：A 已连的 provider，B 的 status 里必须看不到；B 的「断开」
     必须动不了 A 的连接。
     前置需要一个「已连接」状态 —— OAuth 交换要真凭据 + 真网络，verify 环境两样都没有，
     于是用与 push 小节同口径的办法：**直读写服务端数据文件**种子 A 的连接
     （不让被测对象给自己出成绩单）。必须先杀服务端再写：内存态会在任意写时回写磁盘，
     并行写入会被覆盖。 */
  console.log("\n[4] 第三方集成：A 的连接对 B 不可见、B 断不开");
  proc.kill();
  await new Promise((r2) => setTimeout(r2, 300)); // 等端口/进程退出，避免种子被回写覆盖
  let seeded = false;
  try {
    const j = JSON.parse(readFileSync(DATA, "utf8"));
    if (!j.userIntegrations) j.userIntegrations = {};
    j.userIntegrations[A.user.id] = { notion: { connected: true, token: "seed-for-idor", createdAt: Date.now() } };
    writeFileSync(DATA, JSON.stringify(j, null, 2), "utf8");
    seeded = true;
  } catch (e) { seeded = false; }
  PORT = await freePort();
  BASE = "http://127.0.0.1:" + PORT;
  const proc2 = await startServer();
  check("前置：A 的 notion 连接种入数据文件并重启服务端", seeded, "userId=" + A.user.id);

  let r4 = await req("GET", "/api/integrations/status", null, A.accessToken);
  const aList = r4.json && r4.json.data ? r4.json.data.integrations : null;
  check("A 的 status 看到自己的 notion 连接（种子生效；不生效则下面全部空转）",
    Array.isArray(aList) && aList.some((i) => i && i.provider === "notion" && i.connected === true),
    JSON.stringify(aList));

  r4 = await req("GET", "/api/integrations/status", null, B.accessToken);
  const bList = r4.json && r4.json.data ? r4.json.data.integrations : null;
  check("B 的 status 里**不得**出现 A 的连接（userId 隔离）",
    Array.isArray(bList) && bList.length === 0, JSON.stringify(bList));

  await req("DELETE", "/api/integrations/oauth/notion", null, B.accessToken);
  r4 = await req("GET", "/api/integrations/status", null, A.accessToken);
  const aList2 = r4.json && r4.json.data ? r4.json.data.integrations : null;
  check("B 调 DELETE 后 A 的连接**必须还在**（此前任意登录用户可断全实例的集成）",
    Array.isArray(aList2) && aList2.some((i) => i && i.provider === "notion" && i.connected === true),
    JSON.stringify(aList2));

  const rBad = await req("DELETE", "/api/integrations/oauth/evilcorp", null, B.accessToken);
  check("无效 provider 的 DELETE 应 400（此前任意字符串键可落库污染存储）", rBad.status === 400,
    "HTTP " + rBad.status + " " + JSON.stringify(rBad.json));

  // 收尾：A 断开自己的种子连接（给数据文件留干净状态；也证「A 能断自己的」这条对照）
  const rA = await req("DELETE", "/api/integrations/oauth/notion", null, A.accessToken);
  r4 = await req("GET", "/api/integrations/status", null, A.accessToken);
  const aList3 = r4.json && r4.json.data ? r4.json.data.integrations : [];
  check("对照：A 断开自己的连接应生效（缺此条则「把端点改死」也会绿）",
    rA.status === 200 && Array.isArray(aList3) && aList3.length === 0, "HTTP " + rA.status);

  proc2.kill();

  const failed = results.filter((x) => !x.pass);
  console.log("\n=== 汇总：" + (results.length - failed.length) + "/" + results.length + " 通过 ===");
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error("IDOR 脚本异常：", e); process.exit(2); });
