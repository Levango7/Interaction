/* 越权（IDOR）检查：跨用户读写/删除他人资源必须被拒。
 *
 * 运行：cd server && node verify/idor-check.cjs
 * 期望：全绿（exit 0）。
 *
 * 背景（2026-10-10 审查发现）：
 *   extras.js 的 DELETE /schedules/:id 与 auth.js 的 DELETE /devices/:id
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
const path = require("node:path");

const SRV = path.join(__dirname, "..");
const PORT = "4574";
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

  proc.kill();

  const failed = results.filter((x) => !x.pass);
  console.log("\n=== 汇总：" + (results.length - failed.length) + "/" + results.length + " 通过 ===");
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error("IDOR 脚本异常：", e); process.exit(2); });
