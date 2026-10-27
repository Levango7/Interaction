// @vitest-environment node
/* 服务端短信通道直测（2026-10-28 · 阿里云短信认证 provider 接入）。
 *
 * 动机：server/src/auth.js 此前没有任何服务端直测——tests/auth-sms-login 等
 * 全是 jsdom + mock 客户端 api，短信通道的服务端分支（签名、出站参数、错误映射、
 * 与本地一次性消费的衔接）从未被钉住。这次接第二把通道（provider:"aliyun"，
 * 阿里云短信认证 SendSmsVerifyCode：个人免资质路线），把两条分支一起测上。
 *
 * 搭法：真 express app + 真 authRouter + 内存 store + stub 全局 fetch（只拦
 * 出站的阿里云调用，本机回环请求放行走真 HTTP）。签名断言用**独立实现**复算
 * ——与被测代码零共享（同 verify 口径），被测函数改坏排序/编码/密钥拼接都能红。
 *
 * 钉住的语义：
 *   ① aliyun 分支出站请求：POP 签名可独立复算、CodeLength=6 / CodeType=1 /
 *      ReturnVerifyCode=true（默认 4 位码会被 ^\d{6}$ 拒，故必须显式传）；
 *   ② 阿里云回传的验证码落库后可完成登录，一次性消费生效；
 *   ③ 阿里云业务失败（如 FUNCTION_NOT_OPENED）如实映射 502 sms_send_failed，
 *      只透出 Code 不透出 Message（响应体里的号码字段不外泄）；
 *   ④ provider 缺省 = tencent：配不全仍走 demo 逃生舱（旧行为不变）；
 *   ⑤ provider=aliyun 而 endpoint 还是腾讯默认字面量 → 按「没改过」处理，
 *      出站打到阿里默认域名（config.example.json 照抄用户的高频脚枪）。
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/* express 与 server 的依赖都装在 server/node_modules，不在根 —— 用指向
   server/package.json 的 require 才解析得到（auth.js 内部也 require 这些包）。 */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const srvRequire = createRequire(join(ROOT, "server", "package.json"));
const authRouter = srvRequire("./src/auth.js");
const express = srvRequire("express");

const realFetch = globalThis.fetch;

function makeStore() {
  const codes = new Map();
  const users = new Map();
  const sessions = [];
  const audit = [];
  let seq = 0;
  return {
    codes, users, sessions, audit,
    setCode(key, code, ttlSec, purpose) {
      codes.set(key, { code, purpose, used: false, issuedAt: Date.now(), expiresAt: Date.now() + ttlSec * 1000 });
    },
    getCode(key, purpose) { const c = codes.get(key); return c && c.purpose === purpose ? c : null; },
    markCodeUsed(key, purpose) { const c = codes.get(key); if (c && c.purpose === purpose) c.used = true; },
    findUserByProvider(provider, providerId) {
      for (const u of users.values()) if (u.provider === provider && u.providerId === providerId) return u;
      return null;
    },
    createUser(o) { const u = Object.assign({}, o); users.set(u.id, u); return u; },
    addAudit(userId, action, meta) { audit.push({ userId, action, meta }); },
    saveSession(s) { sessions.push(s); },
    uid(prefix) { return prefix + (++seq) + "_" + crypto.randomBytes(4).toString("hex"); }
  };
}

function baseCfg(sms, dev) {
  return {
    port: 0,
    jwt: { accessSecret: "test-access-secret", refreshSecret: "test-refresh-secret", accessTtlSec: 900, refreshTtlSec: 3600 },
    sms: sms,
    dev: dev || { allowUnsafeDevEndpoints: false },
    security: { rateLimit: { enabled: false } }
  };
}

async function startApp(cfg) {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use("/api/auth", authRouter(cfg, makeStore()));
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  return { port: server.address().port, close: () => server.close() };
}

async function api(port, method, path, body) {
  const r = await realFetch("http://127.0.0.1:" + port + path, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: r.status, json: await r.json().catch(() => ({})) };
}

/** 拦出站、放行回环：回环请求走真 fetch，其余（阿里云 API）交给 outbound mock。 */
function stubOutbound(outbound) {
  vi.stubGlobal("fetch", (url, opts) => {
    if (String(url).startsWith("http://127.0.0.1")) return realFetch(url, opts);
    return outbound(url, opts);
  });
}

/** 独立实现的阿里云 POP 签名（与被测 aliyunPopSign 无共享代码）。 */
function independentPopSign(params, secret) {
  const enc = (s) => encodeURIComponent(String(s)).replace(/\+/g, "%20").replace(/\*/g, "%2A").replace(/%7E/g, "~");
  const qs = Object.keys(params).sort().map((k) => enc(k) + "=" + enc(params[k])).join("&");
  const stringToSign = "GET&" + enc("/") + "&" + enc(qs);
  return crypto.createHmac("sha1", Buffer.from(secret + "&", "utf8")).update(Buffer.from(stringToSign, "utf8")).digest("base64");
}

function okSend(verifyCode) {
  return () => Promise.resolve({
    ok: true, status: 200,
    text: () => Promise.resolve(JSON.stringify({
      Code: "OK", Success: true, RequestId: "req-1", OutId: "",
      Model: { VerifyCode: verifyCode, BizId: "biz-1", RequestId: "req-2", OutId: "" }
    }))
  });
}

let app;
afterEach(() => {
  if (app) { app.close(); app = undefined; }
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const ALIYUN_SMS = {
  enabled: true, provider: "aliyun",
  secretId: "AKIDtest123", secretKey: "testsecret456",
  /* endpoint 故意留腾讯默认字面量：模拟"从 example 抄配置后只切了 provider"的用户 */
  endpoint: "https://sms.tencentcloudapi.com",
  signName: "阿里云短信测试", templateId: "SMS_123456789",
  codeTtlSec: 600, resendIntervalSec: 60, timeoutMs: 2000
};

describe("短信 provider=aliyun（短信认证服务 SendSmsVerifyCode）", () => {
  it("发码：出站请求带 POP 签名（独立实现可复算）+ 三个救默认值的显式参数，端点按 provider 兜底", async () => {
    app = await startApp(baseCfg(ALIYUN_SMS));
    const outbound = vi.fn(okSend("654321"));
    stubOutbound(outbound);

    const r = await api(app.port, "POST", "/api/auth/sms-code", { phone: "13800138000" });
    expect(r.status).toBe(200);
    expect(r.json.ok).toBe(true);
    expect(r.json.data.demo, "真通道不发 demo 码").toBeUndefined();

    expect(outbound).toHaveBeenCalledTimes(1);
    const url = new URL(String(outbound.mock.calls[0][0]));
    expect(url.host, "endpoint 留着腾讯字面量时按没改过处理").toBe("dypnsapi.aliyuncs.com");
    const p = url.searchParams;
    expect(p.get("Action")).toBe("SendSmsVerifyCode");
    expect(p.get("Version")).toBe("2017-05-25");
    expect(p.get("PhoneNumber")).toBe("13800138000");
    expect(p.get("SignName")).toBe("阿里云短信测试");
    expect(p.get("TemplateCode")).toBe("SMS_123456789");
    expect(p.get("CodeLength")).toBe("6");
    expect(p.get("CodeType")).toBe("1");
    expect(p.get("ReturnVerifyCode")).toBe("true");
    expect(JSON.parse(p.get("TemplateParam")).code).toBe("##code##");

    const signed = {};
    for (const [k, v] of p) if (k !== "Signature") signed[k] = v;
    expect(p.get("Signature")).toBe(independentPopSign(signed, ALIYUN_SMS.secretKey));
  });

  it("回传的验证码落库、能完成登录，且一次性消费生效", async () => {
    app = await startApp(baseCfg(ALIYUN_SMS));
    stubOutbound(okSend("654321"));

    await api(app.port, "POST", "/api/auth/sms-code", { phone: "13800138000" });
    const login = await api(app.port, "POST", "/api/auth/sms-login", { phone: "13800138000", code: "654321" });
    expect(login.status).toBe(200);
    expect(login.json.ok).toBe(true);
    expect(typeof login.json.data.accessToken).toBe("string");
    expect(typeof login.json.data.refreshToken).toBe("string");
    expect(login.json.data.user.provider).toBe("phone");

    const again = await api(app.port, "POST", "/api/auth/sms-login", { phone: "13800138000", code: "654321" });
    expect(again.status).toBe(400);
    expect(again.json.error).toBe("code_expired_or_invalid");
  });

  it("重发冷却照旧生效（本地 issuedAt 判据，不依赖阿里云频控）", async () => {
    app = await startApp(baseCfg(ALIYUN_SMS));
    stubOutbound(okSend("654321"));

    await api(app.port, "POST", "/api/auth/sms-code", { phone: "13800138000" });
    const again = await api(app.port, "POST", "/api/auth/sms-code", { phone: "13800138000" });
    expect(again.status).toBe(429);
    expect(again.json.error).toBe("sms_code_cooldown");
  });

  it("阿里云业务失败如实映射 502 sms_send_failed，只透 Code 不透 Message", async () => {
    app = await startApp(baseCfg(ALIYUN_SMS));
    stubOutbound(() => Promise.resolve({
      ok: true, status: 200,
      text: () => Promise.resolve(JSON.stringify({
        Code: "FUNCTION_NOT_OPENED", Message: "请先开通融合认证功能-请到控制台开通", Success: false
      }))
    }));

    const r = await api(app.port, "POST", "/api/auth/sms-code", { phone: "13800138000" });
    expect(r.status).toBe(502);
    expect(r.json.error).toBe("sms_send_failed");
    expect(r.json.data.detail).toBe("FUNCTION_NOT_OPENED");
    expect(JSON.stringify(r.json)).not.toContain("开通融合认证");
  });

  it("回传的验证码不是 6 位数字 → bad_verify_code（防上游改默认长度静默破坏校验）", async () => {
    app = await startApp(baseCfg(ALIYUN_SMS));
    stubOutbound(okSend("4232"));

    const r = await api(app.port, "POST", "/api/auth/sms-code", { phone: "13800138000" });
    expect(r.status).toBe(502);
    expect(r.json.data.detail).toBe("bad_verify_code");
  });
});

describe("provider 缺省 = tencent（旧行为不变）", () => {
  it("腾讯字段配不全（缺 sdkAppId）时仍走 demo 逃生舱，不发请求", async () => {
    app = await startApp(baseCfg({
      enabled: true, secretId: "AKIDtest123", secretKey: "testsecret456",
      signName: "某签名", templateId: "1234567",
      endpoint: "https://sms.tencentcloudapi.com",
      codeTtlSec: 600, resendIntervalSec: 60, timeoutMs: 2000
    }, { allowUnsafeDevEndpoints: true }));
    const outbound = vi.fn(okSend("654321"));
    stubOutbound(outbound);

    const r = await api(app.port, "POST", "/api/auth/sms-code", { phone: "13800138000" });
    expect(r.status).toBe(200);
    expect(r.json.data.demo).toBe(true);
    expect(/^\d{6}$/.test(r.json.data.demoCode)).toBe(true);
    expect(outbound, "未配置齐全不该发出站请求").not.toHaveBeenCalled();
  });

  it("demo 码可登录且一次性消费（randomInt 升级不破坏原语义）", async () => {
    app = await startApp(baseCfg({
      enabled: true, secretId: "AKIDtest123", secretKey: "testsecret456",
      signName: "某签名", templateId: "1234567",
      endpoint: "https://sms.tencentcloudapi.com",
      codeTtlSec: 600, resendIntervalSec: 60, timeoutMs: 2000
    }, { allowUnsafeDevEndpoints: true }));
    stubOutbound(okSend("654321"));

    const codeRes = await api(app.port, "POST", "/api/auth/sms-code", { phone: "13800138000" });
    const code = codeRes.json.data.demoCode;
    const login = await api(app.port, "POST", "/api/auth/sms-login", { phone: "13800138000", code });
    expect(login.status).toBe(200);
    const again = await api(app.port, "POST", "/api/auth/sms-login", { phone: "13800138000", code });
    expect(again.json.error).toBe("code_expired_or_invalid");
  });
});
