#!/usr/bin/env node
/* password-reset-check.cjs —— 密码重置 / 忘记密码（2026-10-24）
 *
 * 为什么这个脚本必须先写：本仓的登录面已有 13 条端点（邮箱密码 / 邮箱验证码 / GitHub OAuth /
 * 短信验证码 / 微信演示），但**没有一条找回路径**。`/register` 与 `/email-code` 都以
 * `email_exists` 拒绝已存在的邮箱，所以邮箱密码用户一旦忘密码，账号就永久锁死。
 * 这类缺口不会让测试变红，只会让真实的用户在第三天放弃。
 *
 * 运行：cd server && node verify/password-reset-check.cjs
 *
 * 两层断言，分工明确：
 *   ① 单元层：直接 `new Store(tmpfile)` 钉住 **code 分桶 / purpose 隔离**。
 *      这一层只能白盒：黑盒根本看不到"注册码在重置桶里是否可见"，而串用恰恰是最危险的那类缺陷
 *      （两种用途的码共用一个槽位时，一种用途的码会在另一种用途被接受）。
 *   ② 端到端层：起真服务，走真路由、真限流、真 bcrypt、真数据文件。
 *
 * 为什么取码要读数据文件，而**不给**自己开一个 demoCode 后门：
 *   `/email-code` 那种"未配置 SMTP 就回显验证码"的逃生舱，在注册场景里最多让人注册别人的邮箱；
 *   放到重置场景，回显一个重置码等于**任何人可重置任何人密码**。所以这里宁可用白盒读 DATAFILE
 *   （脚本是内部工具、跑在 CI 里），也不在业务代码里留这条后门。
 *
 * 为什么 SMTP 指向一个关闭的端口而不是起假 SMTP：要顺带验证「发信失败也必须返回 200」——
 * 若失败回 502，那么"这个地址偶尔 502"本身就是「该邮箱已注册」的信号，等于把接口做成枚举器。
 * 连接被拒是立刻发生的，脚本不会卡在超时上。
 */
"use strict";
const { spawn } = require("node:child_process");
const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const SRV = path.join(__dirname, "..");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "pwreset-check-"));

let passN = 0, failN = 0;
function check(label, cond, detail) {
  if (cond) { passN++; console.log("  PASS  " + label.padEnd(56) + (detail ? "| " + detail : "")); }
  else { failN++; console.log("  FAIL  " + label.padEnd(56) + (detail ? "| " + detail : "")); }
}
function group(n) { console.log("\n" + n); }
const envKey = (dotted) => dotted.split(".").map((s) => s.toUpperCase()).join("__");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function freePort() {
  return new Promise((resolve, reject) => {
    const s = http.createServer();
    s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => resolve(p)); });
    s.on("error", reject);
  });
}

const procs = [];
function startServer(port, env, datafile) {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, ["src/index.js"], {
      cwd: SRV,
      env: Object.assign({}, process.env, {
        PORT: String(port),
        ALLOW_PLACEHOLDER_SECRETS: "true",
        DATAFILE: datafile || path.join(TMP, "data-" + port + ".json"),
        AGENT_WORKBENCH_USER_CONFIG: path.join(SRV, "verify", ".no-user-config.json"), // 屏蔽本机 config.json（钩子见 src/config.js）
      }, env || {}),
      stdio: ["ignore", "pipe", "pipe"]
    });
    procs.push(p);
    let out = "", settled = false;
    p.stdout.on("data", (d) => { out += d.toString(); });
    p.stderr.on("data", (d) => { out += d.toString(); });
    const timer = setTimeout(() => { if (!settled) { settled = true; reject(new Error("端口 " + port + " 启动超时\n" + out)); } }, 20000);
    const tick = setInterval(async () => {
      if (settled) return;
      try {
        const j = await (await fetch("http://127.0.0.1:" + port + "/api/health")).json();
        if (j && j.name === "agent-workbench-auth") { settled = true; clearTimeout(timer); clearInterval(tick); resolve(p); }
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

async function jAt(p, pathname, init) {
  const r = await fetch("http://127.0.0.1:" + p + pathname, init);
  let json = null; try { json = await r.json(); } catch (_e) { /* 非 JSON */ }
  return { status: r.status, json: json, raw: null };
}
const post = (p, path, obj, headers) => jAt(p, path, { method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, headers || {}), body: JSON.stringify(obj || {}) });
const get = (p, path, headers) => jAt(p, path, { headers: headers || {} });

/** 白盒取码：从服务端数据文件里读指定用途的码（见文件头"为什么不给 demoCode 后门"） */
function readCode(datafile, addr, purpose) {
  try {
    const raw = fs.readFileSync(datafile, "utf8");
    const j = JSON.parse(raw);
    const rec = (j.codes || {})[String(purpose || "register") + ":" + String(addr).toLowerCase()];
    return rec ? rec.code : null;
  } catch (_e) { return null; }
}

(async () => {
  /* ================= ① 单元层：code 分桶 / purpose 隔离 ================= */
  group("① Store 层：验证码按 purpose 分桶（黑盒看不到，只能白盒钉）");
  const Store = require("../src/store");
  const ufile = path.join(TMP, "unit.json");
  const s = new Store(ufile);
  const A = "unit@example.com";
  s.setCode(A, "111111", 600, "register");
  check("register 码写入后在 register 桶可见", (s.getCode(A, "register") || {}).code === "111111");
  check("同一地址的 password-reset 桶**看不见**它（purpose 隔离）", s.getCode(A, "password-reset") === null);
  s.setCode(A, "222222", 600, "password-reset");
  check("两桶并存：register 码未被覆盖", (s.getCode(A, "register") || {}).code === "111111");
  check("两桶并存：password-reset 是新码", (s.getCode(A, "password-reset") || {}).code === "222222");
  s.markCodeUsed(A, "register");
  check("markCodeUsed 只动指定桶",
    (s.getCode(A, "register") || {}).used === true && (s.getCode(A, "password-reset") || {}).used === false,
    "register.used=" + (s.getCode(A, "register") || {}).used + " reset.used=" + (s.getCode(A, "password-reset") || {}).used);
  s.deleteCode(A, "password-reset");
  check("deleteCode 只删指定桶", s.getCode(A, "password-reset") === null && s.getCode(A, "register") !== null);

  /* 老数据兼容：本批之前写入的码 key 是**裸地址**，升级瞬间若全不认，正在注册的用户会一起失配 */
  const L = "legacy@example.com";
  s._data.codes[L] = { code: "333333", purpose: "register", expiresAt: Date.now() + 600000, used: false };
  check("老 key（裸地址）仍可读 —— 升级不打断在跑的注册", (s.getCode(L, "register") || {}).code === "333333");
  check("老 key 但 purpose 不符 → null（兼容不等于放水）", s.getCode(L, "password-reset") === null);
  s.markCodeUsed(L, "register");
  check("老 key 也能被消费（写回原 key，不产生孤儿）",
    s._data.codes[L] && s._data.codes[L].used === true && !s._data.codes["register:" + L],
    "legacy.used=" + (s._data.codes[L] || {}).used);

  /* ================= 起服务 ================= */
  const MAIL_FILE = path.join(TMP, "main.json");
  const P_MAIN = await freePort();
  const mailEnv = {
    [envKey("email.enabled")]: "true",
    [envKey("email.from")]: "工坊测试 <no-reply@example.com>",
    [envKey("email.smtp.host")]: "127.0.0.1",
    [envKey("email.smtp.port")]: "1",          // 关闭端口：ECONNREFUSED，立刻失败
    [envKey("email.smtp.secure")]: "false",
    [envKey("security.rateLimit.max")]: "500",
    [envKey("security.rateLimit.emailCodeMax")]: "50",
    [envKey("security.rateLimit.resetCodeMax")]: "50",
    [envKey("security.rateLimit.loginMax")]: "50",
  };
  await startServer(P_MAIN, mailEnv, MAIL_FILE);

  const P_BARE = await freePort();
  await startServer(P_BARE, {}, path.join(TMP, "bare.json"));

  const P_RL = await freePort();
  await startServer(P_RL, Object.assign({}, mailEnv, { [envKey("security.rateLimit.resetCodeMax")]: "1" }), path.join(TMP, "rl.json"));

  /* 预置一个 provider=github 但**有 email** 的账号：模拟"GitHub 登录、后来补了邮箱"的形态。
     它必须**不能**走重置 —— 否则等于给 OAuth 账号凭空开一条免 OAuth 的密码登录旁路。 */
  const GH_FILE = path.join(TMP, "gh.json");
  const GH_EMAIL = "gh-user@example.com";
  fs.writeFileSync(GH_FILE, JSON.stringify({
    users: { u_gh1: { id: "u_gh1", email: GH_EMAIL, name: "gh", passwordHash: null, provider: "github", providerId: "42", createdAt: Date.now() } }
  }, null, 2));
  const P_GH = await freePort();
  await startServer(P_GH, mailEnv, GH_FILE);

  /* ================= ② 前置：注册一个邮箱密码账号 =================
     注册要邮箱+密码+验证码，而 SMTP 是关着的 —— 正好用「发信失败但码已落库」这条既有行为取码。 */
  group("② 前置：注册邮箱密码账号（借发信失败时码已落库）");
  const REG_EMAIL = "reset-target@example.com";
  const OLD_PW = "oldpassword123";
  let r = await post(P_MAIN, "/api/auth/email-code", { email: REG_EMAIL });
  check("发注册码 → 502（SMTP 不可达，如实报）", r.status === 502 && r.json && r.json.error === "email_send_failed", "status=" + r.status + " err=" + (r.json && r.json.error));
  const regCode = readCode(MAIL_FILE, REG_EMAIL, "register");
  check("  → 但码已落库（失败不影响已签发，用户可重发）", !!regCode, "code=" + regCode);
  r = await post(P_MAIN, "/api/auth/register", { email: REG_EMAIL, password: OLD_PW, code: regCode, deviceName: "first-device" });
  const firstTokens = r.json && r.json.data;
  check("注册成功并拿到 token", r.status === 200 && !!(firstTokens && firstTokens.refreshToken), "status=" + r.status);

  /* 再登录一台设备：用来验证「改密会踢掉全部会话」不是只踢一台 */
  r = await post(P_MAIN, "/api/auth/login", { email: REG_EMAIL, password: OLD_PW, deviceName: "second-device" });
  const secondTokens = r.json && r.json.data;
  check("第二台设备登录成功", r.status === 200 && !!(secondTokens && secondTokens.refreshToken));

  /* ================= ③ 重置码：不泄露邮箱是否存在 ================= */
  group("③ /password-reset-code 不泄露「该邮箱是否注册过」");
  const ghost = await post(P_MAIN, "/api/auth/password-reset-code", { email: "never-registered@example.com" });
  const real = await post(P_MAIN, "/api/auth/password-reset-code", { email: REG_EMAIL });
  check("不存在的邮箱 → 200（不是 404/409）", ghost.status === 200, "status=" + ghost.status);
  check("已注册邮箱 → 200", real.status === 200, "status=" + real.status);
  check("两者响应体**逐字节相同**（{ok:true,data:{expireIn}}）",
    JSON.stringify(ghost.json) === JSON.stringify(real.json),
    JSON.stringify(ghost.json) + " vs " + JSON.stringify(real.json));
  check("  → 且响应里没有任何「已发送/未注册」之类的分支字样",
    !/exist|not_found|sent|未注册/i.test(JSON.stringify(real.json)), JSON.stringify(real.json));
  check("不存在的邮箱**不产生**任何码（不给自己留垃圾记录）", readCode(MAIL_FILE, "never-registered@example.com", "password-reset") === null);
  group("③b 发信失败也必须 200（失败态不能成为存在性信号）");
  const code1 = readCode(MAIL_FILE, REG_EMAIL, "password-reset");
  check("已注册邮箱在 SMTP 拒连的情况下仍 200 且码已落库", real.status === 200 && !!code1, "code=" + code1);

  /* ================= ④ OAuth 账号不得走密码重置 ================= */
  group("④ provider=github 的账号不能被设密码（否则是免 OAuth 旁路）");
  r = await post(P_GH, "/api/auth/password-reset-code", { email: GH_EMAIL });
  check("对它求重置码 → 仍是 200（不泄露「这是 OAuth 账号」）", r.status === 200, "status=" + r.status);
  check("  → 但**没有**签发任何重置码", readCode(GH_FILE, GH_EMAIL, "password-reset") === null);
  r = await post(P_GH, "/api/auth/password-reset", { email: GH_EMAIL, code: "123456", newPassword: "whatever12345" });
  check("拿码去重置 → code_expired_or_invalid（与「码错」同码，不区分 provider）",
    r.status === 400 && r.json && r.json.error === "code_expired_or_invalid", "err=" + (r.json && r.json.error));

  /* ================= ⑤ 用码改密 ================= */
  group("⑤ /password-reset：凭码改密");
  const NEW_PW = "brandnewpassword456";
  r = await post(P_MAIN, "/api/auth/password-reset", { email: REG_EMAIL, code: "000000", newPassword: NEW_PW });
  check("错码 → code_invalid", r.status === 400 && r.json && r.json.error === "code_invalid", "err=" + (r.json && r.json.error));
  r = await post(P_MAIN, "/api/auth/password-reset", { email: REG_EMAIL, code: code1, newPassword: "short" });
  check("弱密码 → password_too_short（先校验形状再动账号）",
    r.status === 400 && r.json && r.json.error === "password_too_short", "err=" + (r.json && r.json.error));
  r = await post(P_MAIN, "/api/auth/password-reset", { email: REG_EMAIL, code: code1, newPassword: NEW_PW, deviceName: "reset-flow" });
  check("正确码改密 → 200 changed=true", r.status === 200 && r.json && r.json.data && r.json.data.changed === true, "status=" + r.status);
  check("  → 响应里**没有** token（不自动登录，少一处「重置即接管」窗口）",
    r.json && r.json.data && !r.json.data.accessToken && !r.json.data.refreshToken, JSON.stringify(r.json && r.json.data));
  check("  → 如实回报踢掉几台设备 sessionsRevoked=2",
    r.json && r.json.data && r.json.data.sessionsRevoked === 2, "sessionsRevoked=" + (r.json && r.json.data && r.json.data.sessionsRevoked));

  group("⑤b 改密后：旧口令、旧会话、旧码 全部失效");
  r = await post(P_MAIN, "/api/auth/login", { email: REG_EMAIL, password: OLD_PW });
  check("旧密码登录 → 401 invalid_credentials", r.status === 401 && r.json && r.json.error === "invalid_credentials", "status=" + r.status);
  r = await post(P_MAIN, "/api/auth/refresh", { refreshToken: firstTokens.refreshToken });
  check("第一台设备的 refreshToken → 401（会话已被吊销）", r.status === 401, "status=" + r.status + " err=" + (r.json && r.json.error));
  r = await post(P_MAIN, "/api/auth/refresh", { refreshToken: secondTokens.refreshToken });
  check("第二台设备的 refreshToken → 401（是吊销全部，不是只踢当前）", r.status === 401, "status=" + r.status);
  r = await post(P_MAIN, "/api/auth/password-reset", { email: REG_EMAIL, code: code1, newPassword: "anotherpass7890" });
  check("同一码再用一次 → code_expired_or_invalid（一次性消费）",
    r.status === 400 && r.json && r.json.error === "code_expired_or_invalid", "err=" + (r.json && r.json.error));

  group("⑤c 新密码可用 + 审计留痕");
  r = await post(P_MAIN, "/api/auth/login", { email: REG_EMAIL, password: NEW_PW, deviceName: "after-reset" });
  const newTokens = r.json && r.json.data;
  check("新密码登录 → 200", r.status === 200 && !!(newTokens && newTokens.accessToken), "status=" + r.status);
  r = await get(P_MAIN, "/api/auth/audit", { Authorization: "Bearer " + (newTokens && newTokens.accessToken) });
  const evs = (r.json && r.json.data && r.json.data.events) || [];
  const resetEv = evs.filter(function (e) { return e.ev === "password_reset"; })[0];
  check("审计里有 password_reset", !!resetEv, "events=" + evs.map(function (e) { return e.ev; }).join(","));
  check("  → 审计记录了吊销台数", !!(resetEv && resetEv.ctx && resetEv.ctx.sessionsRevoked === 2), resetEv && JSON.stringify(resetEv.ctx));

  /* ================= ⑥ fail-closed / 限流 / 形状 ================= */
  group("⑥ 未配置邮件通道：505→503 fail-closed（绝不假装已发送）");
  r = await post(P_BARE, "/api/auth/password-reset-code", { email: REG_EMAIL });
  check("未配置 SMTP → 503 email_not_configured",
    r.status === 503 && r.json && r.json.error === "email_not_configured", "status=" + r.status + " err=" + (r.json && r.json.error));
  check("  → 不返回 demoCode（重置码回显 = 任何人可重置任何人）",
    !(r.json && r.json.data && r.json.data.demoCode), JSON.stringify(r.json && r.json.data));

  group("⑦ 输入形状");
  r = await post(P_MAIN, "/api/auth/password-reset-code", { email: "not-an-email" });
  check("重置码：非法邮箱 → 400 email_invalid", r.status === 400 && r.json && r.json.error === "email_invalid");
  r = await post(P_MAIN, "/api/auth/password-reset", { email: "not-an-email", code: "123456", newPassword: "12345678" });
  check("改密：非法邮箱 → 400 email_invalid", r.status === 400 && r.json && r.json.error === "email_invalid");
  r = await post(P_MAIN, "/api/auth/password-reset", { email: REG_EMAIL, code: "abc", newPassword: "12345678" });
  check("改密：非 6 位码 → 400 code_invalid", r.status === 400 && r.json && r.json.error === "code_invalid");
  r = await post(P_MAIN, "/api/auth/password-reset", { email: "never-registered@example.com", code: "123456", newPassword: "12345678" });
  check("改密：不存在的账号 → 与「码过期」同码（不泄露账号存在性）",
    r.status === 400 && r.json && r.json.error === "code_expired_or_invalid", "err=" + (r.json && r.json.error));

  group("⑧ 限流：resetCodeMax=1 时同邮箱第二次 429");
  r = await post(P_RL, "/api/auth/password-reset-code", { email: REG_EMAIL });
  check("首次 → 200（该实例里这个邮箱不存在，仍是 200）", r.status === 200, "status=" + r.status);
  r = await post(P_RL, "/api/auth/password-reset-code", { email: REG_EMAIL });
  check("同邮箱第二次 → 429 rate_limited", r.status === 429 && r.json && r.json.error === "rate_limited", "status=" + r.status + " err=" + (r.json && r.json.error));

  for (const p of procs) { try { p.kill(); } catch (_e) { /* 已退出 */ } }
  fs.rmSync(TMP, { recursive: true, force: true });

  console.log("\n=== 汇总：" + passN + "/" + (passN + failN) + " 通过 ===");
  process.exit(failN ? 1 : 0);
})().catch((e) => {
  console.error("password-reset-check 异常：", e);
  for (const p of procs) { try { p.kill(); } catch (_e) { /* 已退出 */ } }
  process.exit(2);
});
