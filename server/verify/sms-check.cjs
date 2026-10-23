#!/usr/bin/env node
/* sms-check.cjs —— 短信验证码登录（v3.7.141 · OD-001 选型 C）
 *
 * 为什么必须有假腾讯云：真短信要 SecretId/Key + 已审核的签名与模板，而且**按条计费** ——
 * 在验证脚本里既不可重复，也不可断言负例（"签名算错了"在真机上表现为一条发不出去的短信，
 * 分不清是算法错还是配置错）。这里在 loopback 起一个**假腾讯云短信**：收 SendSms、
 * 用**独立实现**重算 TC3 签名并比对、按号码前缀回 Ok 或业务错误。服务端 endpoint 指向它
 * —— 走的是**真服务端代码路径**（号码归一、冷却、限流、发码、兑换、find-or-create、签发、审计），
 * 不是把实现 mock 掉一层。
 *
 * ⚠️ 验签函数在本文件**重新实现一遍**（tc3Verify），不 require auth.js 的 tc3Sign：
 *    拿被测实现去验它自己就是恒真断言 —— 算法错了两边一起错，脚本永远绿。
 *    独立实现顺带覆盖两个只在真机才暴露的坑：UTC 日期（东八区 08:00 前会算成前一天）、
 *    SignedHeaders 只应有 content-type;host。
 *
 * 运行：cd server && node verify/sms-check.cjs
 */
"use strict";
const { spawn } = require("node:child_process");
const http = require("node:http");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const SRV = path.join(__dirname, "..");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "sms-check-"));

const SECRET_ID = "AKIDfakesecretid0000";
const SECRET_KEY = "fakesecretkey0000000000000000";
const SDK_APP_ID = "1400000000";
const SIGN_NAME = "工坊测试";
const TEMPLATE_ID = "1234567";

let passN = 0, failN = 0;
function check(label, cond, detail) {
  if (cond) { passN++; console.log("  PASS  " + label.padEnd(50) + (detail ? "| " + detail : "")); }
  else { failN++; console.log("  FAIL  " + label.padEnd(50) + (detail ? "| " + detail : "")); }
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

/* ===== 假腾讯云短信：独立验签 + 按号码前缀回业务错误 =====
   记录最后一次请求供断言；`fake.seen` 是 {headers, body, verify}。 */
const fake = { seen: null, mode: "ok" };
function sha256hex(s) { return crypto.createHash("sha256").update(s, "utf8").digest("hex"); }
function hmacBuf(key, msg) { return crypto.createHmac("sha256", key).update(msg, "utf8").digest(); }
/** 独立实现的 TC3 校验：返回 {ok, why}，why 用于定位而不是给业务用。 */
function tc3Verify(headers, body, secretId, secretKey) {
  const auth = String(headers["authorization"] || "").trim();
  const m = /^TC3-HMAC-SHA256 Credential=([^/]+)\/([^/]+)\/([^/]+)\/tc3_request, SignedHeaders=([^,]+), Signature=([0-9a-f]+)$/.exec(auth);
  if (!m) return { ok: false, why: "authorization_shape" };
  const credId = m[1], date = m[2], svc = m[3], signedHeaders = m[4], signature = m[5];
  if (credId !== secretId) return { ok: false, why: "credential_id" };
  if (svc !== "sms") return { ok: false, why: "service" };
  if (signedHeaders !== "content-type;host") return { ok: false, why: "signed_headers=" + signedHeaders };
  const ts = Number(headers["x-tc-timestamp"]);
  if (!Number.isFinite(ts)) return { ok: false, why: "timestamp_missing" };
  /* 抓「本地时区 vs UTC」那个坑：签名里的 credential date 必须是时间戳对应的 **UTC** 日期 */
  if (new Date(ts * 1000).toISOString().slice(0, 10) !== date) return { ok: false, why: "date_not_utc" };
  const host = String(headers["host"] || "");
  const canonicalRequest = ["POST", "/", "",
    "content-type:application/json\nhost:" + host + "\n",
    signedHeaders, sha256hex(body)].join("\n");
  const stringToSign = ["TC3-HMAC-SHA256", String(ts), date + "/" + svc + "/tc3_request", sha256hex(canonicalRequest)].join("\n");
  const kSigning = hmacBuf(hmacBuf(hmacBuf("TC3" + secretKey, date), svc), "tc3_request");
  const expect = crypto.createHmac("sha256", kSigning).update(stringToSign, "utf8").digest("hex");
  return { ok: expect === signature, why: expect === signature ? "" : "signature_mismatch", expect: expect.slice(0, 16) };
}

function startFakeSms(port) {
  return new Promise((resolve, reject) => {
    const s = http.createServer((req, res) => {
      let body = "";
      req.on("data", (c) => { body += c; });
      req.on("end", () => {
        const verify = tc3Verify(req.headers, body, SECRET_ID, SECRET_KEY);
        let parsed = null; try { parsed = JSON.parse(body); } catch (_e) { /* 非 JSON */ }
        const phone = (parsed && parsed.PhoneNumberSet && parsed.PhoneNumberSet[0]) || "";
        fake.seen = {
          headers: req.headers, body: body, verify: verify,
          action: req.headers["x-tc-action"], version: req.headers["x-tc-version"],
          region: req.headers["x-tc-region"], phone: phone,
          paramSet: (parsed && parsed.TemplateParamSet) || [],
          sdkAppId: parsed && parsed.SmsSdkAppId, signName: parsed && parsed.SignName, templateId: parsed && parsed.TemplateId
        };
        /* 号码前缀 1380000 走"业务拒绝"分支：腾讯云的真实形态是 2xx + Response.Error */
        if (/^\+861380000/.test(String(phone)) || fake.mode === "error") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ Response: { Error: { Code: "LimitExceeded.PhoneNumberInBlocklist", Message: "号码在黑名单中" }, RequestId: "req-err" } }));
          return;
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ Response: { SendStatusSet: [{ Code: "Ok", Message: "send success", PhoneNumber: phone }], RequestId: "req-ok" } }));
      });
    });
    s.on("error", reject);
    s.listen(port, "127.0.0.1", () => resolve(s));
  });
}

const procs = [];
function startServer(port, env) {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, ["src/index.js"], {
      cwd: SRV,
      env: Object.assign({}, process.env, {
        PORT: String(port),
        ALLOW_PLACEHOLDER_SECRETS: "true",
        DATAFILE: path.join(TMP, "data-" + port + ".json"),
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
  return { status: r.status, json: json };
}
const post = (p, path, obj) => jAt(p, path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(obj || {}) });

(async () => {
  const P_FAKE = await freePort();
  await startFakeSms(P_FAKE);
  const EP = "http://127.0.0.1:" + P_FAKE;
  const smsEnv = Object.assign({
    [envKey("dev.allowUnsafeDevEndpoints")]: "true",
    [envKey("sms.enabled")]: "true",
    [envKey("sms.secretId")]: SECRET_ID,
    [envKey("sms.secretKey")]: SECRET_KEY,
    [envKey("sms.sdkAppId")]: SDK_APP_ID,
    [envKey("sms.signName")]: SIGN_NAME,
    [envKey("sms.templateId")]: TEMPLATE_ID,
    [envKey("sms.endpoint")]: EP,
    [envKey("security.rateLimit.smsCodeMax")]: "100",
  });

  // ---- P_MAIN：完整配置 + 冷却 60s ----
  const P_MAIN = await freePort();
  await startServer(P_MAIN, smsEnv);
  // ---- P_DEMO：dev 逃生舱（sms 未启用）----
  const P_DEMO = await freePort();
  await startServer(P_DEMO, { [envKey("dev.allowUnsafeDevEndpoints")]: "true" });
  // ---- P_BARE：dev=false、sms 未启用 ----
  const P_BARE = await freePort();
  await startServer(P_BARE, {});
  // ---- P_LOOPBACK：dev=false 但短信指向 loopback → 端点白名单必须拦 ----
  const P_LOOPBACK = await freePort();
  await startServer(P_LOOPBACK, {
    [envKey("sms.enabled")]: "true",
    [envKey("sms.secretId")]: SECRET_ID,
    [envKey("sms.secretKey")]: SECRET_KEY,
    [envKey("sms.sdkAppId")]: SDK_APP_ID,
    [envKey("sms.signName")]: SIGN_NAME,
    [envKey("sms.templateId")]: TEMPLATE_ID,
    [envKey("sms.endpoint")]: EP,
  });
  // ---- P_NOCOOL：resendIntervalSec=0（验证显式 0 不被 || 吞掉）----
  const P_NOCOOL = await freePort();
  await startServer(P_NOCOOL, Object.assign({}, smsEnv, { [envKey("sms.resendIntervalSec")]: "0" }));
  // ---- P_RL：smsCodeMax=1（限流维度是号码，不是 IP）----
  const P_RL = await freePort();
  await startServer(P_RL, Object.assign({}, smsEnv, { [envKey("sms.resendIntervalSec")]: "0", [envKey("security.rateLimit.smsCodeMax")]: "1" }));

  let r;

  group("① 未配置通道：fail-closed，不静默放行");
  r = await post(P_BARE, "/api/auth/sms-code", { phone: "13800138001" });
  check("sms 未配置 → 503 sms_not_configured", r.status === 503 && r.json && r.json.error === "sms_not_configured", "status=" + r.status + " err=" + (r.json && r.json.error));

  group("② 端点白名单：loopback 端点在非 dev 下必须被拒（SSRF 面）");
  r = await post(P_LOOPBACK, "/api/auth/sms-code", { phone: "13800138001" });
  check("dev=false + loopback endpoint → 500 sms_endpoint_forbidden",
    r.status === 500 && r.json && r.json.error === "sms_endpoint_forbidden", "status=" + r.status + " err=" + (r.json && r.json.error));

  group("③ dev 逃生舱：显式开关下回 demoCode，且该码可真登录");
  r = await post(P_DEMO, "/api/auth/sms-code", { phone: "13800138002" });
  const demoCode = r.json && r.json.data && r.json.data.demoCode;
  check("未配置 + dev 开关 → demo:true 且带 demoCode",
    r.status === 200 && r.json && r.json.data && r.json.data.demo === true && /^\d{6}$/.test(String(demoCode || "")), "demoCode=" + demoCode);
  r = await post(P_DEMO, "/api/auth/sms-login", { phone: "13800138002", code: demoCode });
  check("demoCode 可直接兑出 token（逃生舱不是摆设）",
    r.status === 200 && r.json && r.json.data && !!r.json.data.accessToken, "status=" + r.status);

  group("④ 号码归一：三种写法是同一个号码（也是限流分桶的同一只桶）");
  for (const bad of ["", "123", "23800138000", "1380013800", "138001380000", "abcdefghijk"]) {
    r = await post(P_MAIN, "/api/auth/sms-code", { phone: bad });
    check("非法号码 " + JSON.stringify(bad) + " → 400 phone_invalid", r.status === 400 && r.json && r.json.error === "phone_invalid", "status=" + r.status);
  }
  r = await post(P_MAIN, "/api/auth/sms-code", { phone: "+86 138 0013 8003" });
  check("带 +86 与空格的写法被接受（归一成功）", r.status === 200, "status=" + r.status);

  group("⑤ 真发：请求形状与腾讯云 SendSms 契约一致");
  const seen = fake.seen;
  check("X-TC-Action = SendSms", seen && seen.action === "SendSms", seen && seen.action);
  check("X-TC-Version = 2021-01-11", seen && seen.version === "2021-01-11", seen && seen.version);
  check("X-TC-Region 已带", seen && !!seen.region, seen && seen.region);
  check("号码带 +86 前缀送出去", seen && seen.phone === "+8613800138003", seen && seen.phone);
  check("SdkAppId / SignName / TemplateId 齐全",
    seen && seen.sdkAppId === SDK_APP_ID && seen.signName === SIGN_NAME && seen.templateId === TEMPLATE_ID,
    seen && [seen.sdkAppId, seen.signName, seen.templateId].join(" / "));
  check("TemplateParamSet[0] 是 6 位验证码", seen && /^\d{6}$/.test(String(seen.paramSet[0])), seen && JSON.stringify(seen.paramSet));

  group("⑥ 签名：假端用独立实现验签（不复被测函数）");
  check("TC3 签名校验通过", seen && seen.verify && seen.verify.ok === true, seen && seen.verify && (seen.verify.why || "ok"));
  /* 反向：把 secretKey 换一个再验，必须不通过 —— 否则上面那条是恒真断言 */
  const wrongVerify = tc3Verify(seen.headers, seen.body, SECRET_ID, SECRET_KEY + "x");
  check("  → 反向：换错 secretKey 验签必须失败（证明有区分力）", wrongVerify.ok === false, wrongVerify.why);
  const tampered = tc3Verify(Object.assign({}, seen.headers), seen.body.replace(/13800138003/, "13800138009"), SECRET_ID, SECRET_KEY);
  check("  → 反向：改 body 不改签名必须失败", tampered.ok === false, tampered.why);

  group("⑦ 冷却：短信按条计费，60s 内同一号码不得重发");
  r = await post(P_MAIN, "/api/auth/sms-code", { phone: "13800138004" });
  check("首次发码 → 200", r.status === 200, "status=" + r.status);
  r = await post(P_MAIN, "/api/auth/sms-code", { phone: "13800138004" });
  check("60s 内再发 → 429 sms_code_cooldown", r.status === 429 && r.json && r.json.error === "sms_code_cooldown", "status=" + r.status + " err=" + (r.json && r.json.error));
  check("  → 且带 retryAfter（客户端可显示还要等多久）", r.json && r.json.data && r.json.data.retryAfter > 0, r.json && r.json.data && r.json.data.retryAfter);
  r = await post(P_NOCOOL, "/api/auth/sms-code", { phone: "13800138005" });
  const noCool1 = r.status;
  r = await post(P_NOCOOL, "/api/auth/sms-code", { phone: "13800138005" });
  check("resendIntervalSec 显式配 0 → 冷却关闭（显式 0 不被默认吞掉）", noCool1 === 200 && r.status === 200, "first=" + noCool1 + " second=" + r.status);

  group("⑧ 腾讯云业务拒绝 → 502，且不静默当成成功");
  r = await post(P_MAIN, "/api/auth/sms-code", { phone: "13800000111" });
  check("Response.Error → 502 sms_send_failed", r.status === 502 && r.json && r.json.error === "sms_send_failed", "status=" + r.status + " err=" + (r.json && r.json.error));
  check("  → detail 只回错误 Code，不外泄整段 Message",
    r.json && r.json.data && r.json.data.detail === "LimitExceeded.PhoneNumberInBlocklist", r.json && r.json.data && r.json.data.detail);

  group("⑨ 兑换：一次性消费 + find-or-create");
  r = await post(P_MAIN, "/api/auth/sms-code", { phone: "13800138006" });
  check("发码 → 200", r.status === 200);
  const code6 = fake.seen.paramSet[0];
  r = await post(P_MAIN, "/api/auth/sms-login", { phone: "13800138006", code: "000000" });
  check("错码 → 400 code_invalid（不是「码不存在」，说明码确实在库里）", r.status === 400 && r.json && r.json.error === "code_invalid", "err=" + (r.json && r.json.error));
  r = await post(P_MAIN, "/api/auth/sms-login", { phone: "13800138006", code: code6, name: "甲" });
  const uid1 = r.json && r.json.data && r.json.data.user && r.json.data.user.id;
  check("正确码 → 200 + token，user.provider=phone",
    r.status === 200 && !!r.json.data.accessToken && r.json.data.user.provider === "phone", "provider=" + (r.json && r.json.data && r.json.data.user && r.json.data.user.provider));
  check("  → 首次登录即建号，name 用传入值", r.json && r.json.data && r.json.data.user && r.json.data.user.name === "甲", r.json && r.json.data && r.json.data.user && r.json.data.user.name);
  r = await post(P_MAIN, "/api/auth/sms-login", { phone: "13800138006", code: code6 });
  check("同一码再兑 → code_expired_or_invalid（一次性消费）",
    r.status === 400 && r.json && r.json.error === "code_expired_or_invalid", "err=" + (r.json && r.json.error));

  group("⑩ find-or-create：同一号码第二次登录不重复建号");
  await post(P_NOCOOL, "/api/auth/sms-code", { phone: "13800138007" });
  const c7 = fake.seen.paramSet[0];
  r = await post(P_NOCOOL, "/api/auth/sms-login", { phone: "13800138007", code: c7 });
  const uidA = r.json && r.json.data && r.json.data.user && r.json.data.user.id;
  await post(P_NOCOOL, "/api/auth/sms-code", { phone: "13800138007" });
  const c7b = fake.seen.paramSet[0];
  r = await post(P_NOCOOL, "/api/auth/sms-login", { phone: "13800138007", code: c7b });
  const uidB = r.json && r.json.data && r.json.data.user && r.json.data.user.id;
  check("两次登录是同一个 user.id（不重复建号）", !!uidA && uidA === uidB, uidA + " vs " + uidB);
  check("  → 未传 name 时用脱敏默认名（不含完整号码）",
    r.json && r.json.data && r.json.data.user && r.json.data.user.name === "手机用户8007", r.json && r.json.data && r.json.data.user && r.json.data.user.name);

  group("⑪ 限流维度是号码（换号即新桶，同号必受限）");
  r = await post(P_RL, "/api/auth/sms-code", { phone: "13800138098" });
  check("smsCodeMax=1：首次 → 200", r.status === 200, "status=" + r.status);
  r = await post(P_RL, "/api/auth/sms-code", { phone: "13800138098" });
  check("同号第二次 → 429 rate_limited", r.status === 429 && r.json && r.json.error === "rate_limited", "status=" + r.status + " err=" + (r.json && r.json.error));

  group("⑫ 未发码直接登录：不得凭空通过");
  r = await post(P_MAIN, "/api/auth/sms-login", { phone: "13800138099", code: "123456" });
  check("没发过码 → code_expired_or_invalid", r.status === 400 && r.json && r.json.error === "code_expired_or_invalid", "err=" + (r.json && r.json.error));
  r = await post(P_MAIN, "/api/auth/sms-login", { phone: "13800138099", code: "" });
  check("空码 → code_invalid（先挡格式再查库）", r.status === 400 && r.json && r.json.error === "code_invalid", "err=" + (r.json && r.json.error));

  for (const p of procs) { try { p.kill(); } catch (_e) { /* 已退出 */ } }
  fs.rmSync(TMP, { recursive: true, force: true });

  console.log("\n=== 汇总：" + passN + "/" + (passN + failN) + " 通过 ===");
  process.exit(failN ? 1 : 0);
})().catch((e) => {
  console.error("sms-check 异常：", e);
  for (const p of procs) { try { p.kill(); } catch (_e) { /* 已退出 */ } }
  process.exit(2);
});
