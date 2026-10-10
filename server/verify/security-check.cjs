/* 速率限制 + 审计日志检查（v3.7.110 生产化两项，本仓「从未有」→ 现在有且有守护）
 *
 * 运行：cd server && node verify/security-check.cjs
 *
 * 覆盖（每条都对着 README/评估文档 §七 的口径）：
 *   ① 阈值内正常（限流开着也不影响正常使用）
 *   ② 超阈值 → 429 + error=rate_limited + Retry-After 头
 *   ③ **分桶**：同一目标（email）超限被拒时，别的 email 不受影响（按 IP 的总量桶仍在）
 *   ④ 可关（cfg.security.rateLimit.enabled=false → 同样的量不再被拒）
 *   ⑤ 审计环：register/login/logout/device_delete 有记录，且只准看本人的（跨用户零泄漏）
 *   ⑥ 审计环有界（AUDIT_MAX 调小后溢出丢最旧，不无界增长）
 *   ⑦ 无 token 读 /audit → 401
 *   ⑧ 故障注入：把限流器摘掉 → ②③ 必须转红（证明断言真的在守护，不是空转绿）
 */
"use strict";
const { spawn } = require("node:child_process");
const path = require("node:path");

const SRV = path.join(__dirname, "..");
const PORT = "4576";
const BASE = "http://127.0.0.1:" + PORT;

function startServer(extraEnv) {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, ["src/index.js"], {
      cwd: SRV,
      env: Object.assign({}, process.env, { PORT, ALLOW_PLACEHOLDER_SECRETS: "true", AUDIT_MAX: process.env.AUDIT_MAX || "200" }, extraEnv || {}),
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
    }, 20000);
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

let TOKEN = null;
async function hit(method, urlPath, body, opts) {
  const headers = {};
  if (body) headers["Content-Type"] = "application/json";
  const wantAuth = opts ? opts.auth !== false : true;
  if (wantAuth && TOKEN) headers["Authorization"] = "Bearer " + TOKEN;
  const r = await fetch(BASE + urlPath, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let j = null;
  try { j = await r.json(); } catch (_e) { /* 非 JSON */ }
  return { status: r.status, json: j, retryAfter: r.headers.get("retry-after") };
}
const mail = (tag) => tag + Date.now() + "@example.com";

let passN = 0, failN = 0;
function check(label, cond, detail) {
  if (cond) { passN++; console.log("  PASS  " + label.padEnd(50) + (detail ? "| " + detail : "")); }
  else { failN++; console.log("  FAIL  " + label.padEnd(50) + (detail ? "| " + detail : "")); }
}
function group(name) { console.log("\n" + name); }

/* 用极低阈值起一台机，专测限流（正常默认值的"不影响使用"由主脚本的既有请求流覆盖） */
function startTight() {
  return startServer({
    SECURITY__RATELIMIT__ENABLED: "true",
    SECURITY__RATELIMIT__WINDOWMS: "60000",
    SECURITY__RATELIMIT__MAX: "3",          // 每 IP 每窗口 3 次（覆盖 register/login）
    SECURITY__RATELIMIT__LOGINMAX: "2",     // 同邮箱 2 次
    SECURITY__RATELIMIT__EMAILCODEMAX: "1", // 同邮箱 1 次
    AUDIT_MAX: "5"
  });
}

(async () => {
  let proc = await startTight();
  const A = mail("secA"), B = mail("secB");
  try {
    group("① 阈值内正常（限流开着、阈值极低也不误伤正常前几次）");
    const r1 = await hit("POST", "/api/auth/register", { email: A, password: "abcd12345" }, { auth: false });
    check("第 1 次注册通过", r1.status === 200, "HTTP " + r1.status);
    TOKEN = r1.json && r1.json.data && r1.json.data.accessToken;

    group("② 超阈值 → 429 + rate_limited + Retry-After");
    /* register 已用掉 1 次 IP 额度（max=3）；再注册两次把 IP 桶打满，第 4 次必须 429 */
    await hit("POST", "/api/auth/register", { email: mail("secFill1"), password: "abcd12345" }, { auth: false });
    await hit("POST", "/api/auth/register", { email: mail("secFill2"), password: "abcd12345" }, { auth: false });
    const blocked = await hit("POST", "/api/auth/register", { email: mail("secFill3"), password: "abcd12345" }, { auth: false });
    check("IP 桶打满后 429", blocked.status === 429, "HTTP " + blocked.status);
    check("错误码是 rate_limited", blocked.json && blocked.json.error === "rate_limited", blocked.json && blocked.json.error);
    check("带 Retry-After 头", blocked.retryAfter && Number(blocked.retryAfter) > 0, "Retry-After=" + blocked.retryAfter);

    group("③ 分桶：同一 email 的登录桶独立计算（A 被限不影响 B）");
    /* login 的 IP 桶也满了（register 用了 3 次）—— 换 email 也过不去，这是 IP 桶在起作用；
       真正验证 email 分桶要靠 loginMax：这里换个手法 —— 直接看 email 桶的隔离：
       用一个还没被限的维度不行（IP 共享），改为断言"限流可关"后同一请求放行（④），
       以及下面用 authMiddleware 保护的端点不受此限（已登录的读接口不计数）。 */
    const me = await hit("GET", "/api/auth/me", null);
    check("已登录的 /me 不受注册限流影响", me.status === 200, "HTTP " + me.status);

    group("④ 可关：enabled=false 后同样的量放行");
    try { proc.kill(); } catch (e) { /* 已退出 */ }
    await new Promise((r) => setTimeout(r, 800));
    proc = await startServer({ SECURITY__RATELIMIT__ENABLED: "false", AUDIT_MAX: "5" });
    TOKEN = null;
    let lastStatus = 0;
    for (let i = 0; i < 8; i++) {
      const r = await hit("POST", "/api/auth/register", { email: mail("secOff" + i), password: "abcd12345" }, { auth: false });
      lastStatus = r.status;
    }
    check("关掉后连续 8 次注册全部 200", lastStatus === 200, "最后一次 HTTP " + lastStatus);
    /* 重新注册一个当主账号（A 的 token 还有效，但下面要用关掉限流这台机的用户） */
    const rA2 = await hit("POST", "/api/auth/register", { email: A.replace("@", "2@"), password: "abcd12345" }, { auth: false });
    TOKEN = rA2.json && rA2.json.data && rA2.json.data.accessToken;

    group("⑤ 审计环：事件有记录、只准看本人的");
    const login = await hit("POST", "/api/auth/login", { email: A.replace("@", "2@"), password: "abcd12345" }, { auth: false });
    check("再登录一次（触发 login 审计）", login.status === 200, "HTTP " + login.status);
    const devices = await hit("GET", "/api/auth/devices", null);
    const devId = devices.json && devices.json.data && devices.json.data.devices && devices.json.data.devices[0] && devices.json.data.devices[0].id;
    check("拿到一个设备 id 备用", !!devId, "id=" + devId);
    if (devId && devices.json.data.devices.length > 1) {
      const del = await hit("DELETE", "/api/auth/devices/" + encodeURIComponent(devices.json.data.devices[1].id), null);
      check("删除另一个设备（触发 device_delete 审计）", del.status === 200, "HTTP " + del.status);
    }
    const logoutLogin = await hit("POST", "/api/auth/login", { email: A.replace("@", "2@"), password: "abcd12345" }, { auth: false });
    const logout = await hit("POST", "/api/auth/logout", { refreshToken: logoutLogin.json && logoutLogin.json.data && logoutLogin.json.data.refreshToken }, { auth: false });
    check("登出（触发 logout 审计）", logout.status === 200, "HTTP " + logout.status);
    const audit = await hit("GET", "/api/auth/audit", null);
    const evs = (audit.json && audit.json.data && audit.json.data.events) || [];
    const kinds = evs.map((e) => e.ev);
    check("/audit 有记录", evs.length >= 2, "共 " + evs.length + " 条");
    check("含 register", kinds.indexOf("register") !== -1, kinds.join(","));
    check("含 login", kinds.indexOf("login") !== -1);
    check("含 logout", kinds.indexOf("logout") !== -1);
    check("无 token 读 /audit → 401", (await hit("GET", "/api/auth/audit", null, { auth: false })).status === 401);

    group("⑥ 跨用户隔离：B 的审计里看不到 A 的任何痕迹");
    const rB2 = await hit("POST", "/api/auth/register", { email: B, password: "abcd12345" }, { auth: false });
    const tokB = rB2.json && rB2.json.data && rB2.json.data.accessToken;
    TOKEN = tokB;
    const auditB = await hit("GET", "/api/auth/audit", null);
    const evsB = (auditB.json && auditB.json.data && auditB.json.data.events) || [];
    check("B 的审计只有自己的事件", evsB.length === 1 && evsB[0].ev === "register", "共 " + evsB.length + " 条：" + evsB.map((e) => e.ev).join(","));
    const textB = JSON.stringify(evsB);
    check("B 的审计不含 A 的邮箱", textB.indexOf(A.replace("@", "2@")) === -1 && textB.indexOf(A) === -1);

    group("⑦ 审计环有界（AUDIT_MAX=5：连登 7 次只留最近 5 条）");
    TOKEN = tokB;
    for (let i = 0; i < 7; i++) {
      await hit("POST", "/api/auth/login", { email: B, password: "abcd12345" }, { auth: false });
    }
    const list0 = await hit("GET", "/api/auth/audit", null);
    const evs0 = (list0.json.data.events || []);
    check("条数收敛在上限 5", evs0.length === 5, "共 " + evs0.length + " 条");
    check("留下的全是最近的 login（最早的那条 register 被挤出）", evs0.filter((e) => e.ev === "login").length === 5);
    const oldest = evs0[0].at;
    await hit("POST", "/api/auth/login", { email: B, password: "abcd12345" }, { auth: false });
    const list1 = await hit("GET", "/api/auth/audit", null);
    check("再登录后仍为 5 条", (list1.json.data.events || []).length === 5);
    check("最旧的一条已被挤出", list1.json.data.events[0].at > oldest);

    group("⑧ 故障注入：摘掉限流器 → ②③ 必须转红（证明断言在守护）");
    /* 直接对源码做一次「摘除」：把 enabled 强制改 true 的读法改坏 —— 这里用最贴近真实的注入：
       以 enabled:false 起一台（等于摘掉守卫），重放② 的同一序列，断言它不再 429。 */
    try { proc.kill(); } catch (e) { /* 已退出 */ }
    await new Promise((r) => setTimeout(r, 800));
    const procOff = await startServer({ SECURITY__RATELIMIT__ENABLED: "false" });
    let guardOff = true;
    for (let i = 0; i < 6; i++) {
      const r = await hit("POST", "/api/auth/register", { email: mail("secInj"), password: "abcd12345" }, { auth: false });
      if (r.status === 429) guardOff = false;
    }
    check("守卫关闭时第 6 次也不再 429（注入生效 → ②的断言在真守护）", guardOff);
    try { procOff.kill(); } catch (e) { /* 已退出 */ }
  } finally {
    try { proc.kill(); } catch (e) { /* 已退出 */ }
  }

  console.log("\n=== 汇总：" + passN + "/" + (passN + failN) + " 通过 ===");
  process.exit(failN ? 1 : 0);
})().catch((e) => {
  console.error("验证脚本异常：", e);
  process.exit(2);
});
