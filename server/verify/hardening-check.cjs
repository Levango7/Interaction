/* 后端加固实证验证（本仓纪律：故障注入三部曲 + 不靠"看着对"下结论）。
 *
 * 运行：cd server && npm install && node verify/hardening-check.cjs
 * 期望：9/9 通过，exit 0。
 *
 * 为什么是 .cjs + Node 原生 fetch，而不是 curl：
 *   ① 本机 3001 常被 Docker Desktop 占用 —— 脚本自己起独立端口 4571；
 *   ② 本机环境有 http_proxy，curl 会把 localhost 请求也发去代理，
 *      实测曾因此拿到另一个服务的响应（uptime 59 小时）而误判为后端正常。
 *      Node 的 fetch 不读代理环境变量，可直连。
 *
 * 每个 P0 都验两向：关闭态必须拦住、开启态必须放行。
 * 只验单向等于没验 —— 端点被改死也会"绿"。
 */
"use strict";
const { spawn } = require("node:child_process");
const path = require("node:path");

const SRV = path.join(__dirname, "..");
const PORT = "4571";
const BASE = "http://127.0.0.1:" + PORT;

function startServer(extraEnv) {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, ["src/index.js"], {
      cwd: SRV,
      env: Object.assign({}, process.env, { PORT, ALLOW_PLACEHOLDER_SECRETS: "true" }, extraEnv),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    p.stdout.on("data", (d) => { out += d.toString(); });
    p.stderr.on("data", (d) => { out += d.toString(); });
    /* 启动预算 8s → 20s（2026-10-10）：实测本机满载（并行全量测试）时首跑启动超时、
       重跑 9/9 —— 固定预算遇满载机器的假红，与客户端测试批 slice4/9/10 同治理口径。
       另两个脚本（idor/client-contract）本就是 10s，本次不动（无假红证据）。 */
    const timer = setTimeout(() => reject(new Error("启动超时\n" + out)), 20000);
    const tick = setInterval(async () => {
      try {
        const r = await fetch(BASE + "/api/health");
        const j = await r.json();
        // 必须是本后端才认 —— 防又打到端口上别的服务
        if (j && j.name === "agent-workbench-auth") {
          clearTimeout(timer); clearInterval(tick); resolve({ proc: p, log: out });
        }
      } catch (_e) { /* 还没起来，下一轮再试 */ }
    }, 200);
  });
}

async function hit(method, urlPath, body) {
  const r = await fetch(BASE + urlPath, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  let j = null;
  try { j = await r.json(); } catch (_e) { /* 非 JSON 响应 */ }
  return { status: r.status, json: j };
}

const results = [];
function check(name, cond, detail) {
  results.push({ name, pass: !!cond });
  console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "  |  " + detail : ""));
}

(async () => {
  // ---------- [1] 关闭态（默认 dev.allowUnsafeDevEndpoints=false）----------
  console.log("\n[1] 关闭态：两个不安全端点必须拦住");
  let s = await startServer({});

  const health = await hit("GET", "/api/health");
  check("健康检查是本后端（防又打到别的服务）",
    health.json && health.json.name === "agent-workbench-auth", JSON.stringify(health.json));

  const confirmOff = await hit("GET", "/api/auth/wechat/confirm?scene=s1&email=victim@example.com");
  /* 必须钉 error==="not_found" 而不只是 404：守卫拦下与「scene 不存在」都是 404，
     只查状态码的话，把守卫摘掉这个用例照样绿 —— 那是假守护。 */
  check("P0-1 /wechat/confirm 关闭态被守卫拦下（404 + not_found）",
    confirmOff.status === 404 && confirmOff.json && confirmOff.json.error === "not_found",
    "HTTP " + confirmOff.status + " " + JSON.stringify(confirmOff.json));

  const codeOff = await hit("POST", "/api/auth/email-code", { email: "new@example.com" });
  check("P0-2 /email-code 关闭态返回 503",
    codeOff.status === 503, "HTTP " + codeOff.status + " " + JSON.stringify(codeOff.json));
  check("P0-2 关闭态响应体不含 demoCode",
    !(codeOff.json && codeOff.json.data && codeOff.json.data.demoCode), JSON.stringify(codeOff.json));

  s.proc.kill();
  await new Promise((r) => setTimeout(r, 600));

  // ---------- [2] 开启态（显式放行：证明是开关在控制，不是端点被改死）----------
  console.log("\n[2] 开启态：显式打开后必须恢复开发行为（反向验证）");
  s = await startServer({ DEV__ALLOWUNSAFEDEVENDPOINTS: "true" });

  // scene 必须先由 /wechat/qrcode 创建，否则进到业务逻辑后是 scene_not_found，
  // 与「被守卫拦下」的 not_found 是两种 404 —— 区分这两者是本用例的关键。
  const qr = await hit("POST", "/api/auth/wechat/qrcode", {});
  const scene = qr.json && qr.json.data ? qr.json.data.scene : null;
  check("前置：/wechat/qrcode 能取到 scene", !!scene, JSON.stringify(qr.json).slice(0, 100));

  const confirmOn = await hit("GET", "/api/auth/wechat/confirm?scene=" + encodeURIComponent(scene || "") + "&email=dev@example.com");
  check("P0-1 开启态 /wechat/confirm 放行（200）",
    confirmOn.status === 200 && confirmOn.json && confirmOn.json.ok === true,
    "HTTP " + confirmOn.status + " " + JSON.stringify(confirmOn.json));

  // 每轮用唯一邮箱：数据文件是持久化的，固定邮箱第二次跑必 409 email_exists（测试要幂等）
  const mail = "dev" + Date.now() + "@example.com";
  const codeOn = await hit("POST", "/api/auth/email-code", { email: mail });
  check("P0-2 开启态 /email-code 回传 demoCode",
    codeOn.status === 200 && codeOn.json && codeOn.json.data && /^\d{6}$/.test(String(codeOn.json.data.demoCode)),
    "HTTP " + codeOn.status + " " + JSON.stringify(codeOn.json));

  // 顺带回归：加固没把正常功能改坏
  const regCode = codeOn.json && codeOn.json.data ? codeOn.json.data.demoCode : null;
  const reg = await hit("POST", "/api/auth/register", { email: mail, password: "abcd12345", code: regCode });
  check("回归：注册 + 验证码链路仍通（加固未破坏正常功能）",
    reg.status === 200 && reg.json && reg.json.data && reg.json.data.accessToken,
    "HTTP " + reg.status + " " + (reg.json ? JSON.stringify(reg.json).slice(0, 100) : ""));

  const dup = await hit("POST", "/api/auth/email-code", { email: mail });
  check("回归：已注册邮箱再发码返回 409 email_exists",
    dup.status === 409, "HTTP " + dup.status + " " + JSON.stringify(dup.json));

  s.proc.kill();

  const failed = results.filter((r) => !r.pass);
  console.log("\n=== 汇总：" + (results.length - failed.length) + "/" + results.length + " 通过 ===");
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error("验证脚本异常：", e); process.exit(2); });
