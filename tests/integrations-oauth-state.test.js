// @vitest-environment node
/* 集成 OAuth 回调的 state 校验钉子（v3.7.157 修复批）。
 *
 * 背景（审计 P1）：旧 `/oauth/:provider/callback` 挂在 Bearer 鉴权后，而浏览器 OAuth
 * 回跳是顶层导航、带不上 Authorization ⇒ 401，连接流程在真实浏览器里 100% 走不通。
 * 修法＝标准 OAuth state 模式：/status 生成一次性 state 存 store 并绑定 userId，
 * 回调改公开端点 + state 校验（TTL + 一次性消费 + provider/userId 绑定）。
 *
 * 钉子必须钉在「真实路由调用」上（不是 store 层）：state 的生成/校验/消费全在路由里。
 * https.request 用桩，保证 token 交换成功路径可测且零网络。
 */
import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import https from "node:https";
import { EventEmitter } from "node:events";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const srvRequire = createRequire(join(ROOT, "server", "package.json"));
const jwt = srvRequire("jsonwebtoken");
const Store = srvRequire("./src/store.js");
const integrationsRouter = srvRequire("./src/integrations.js");

function tmpStoreFile() {
  const dir = fs.mkdtempSync(join(os.tmpdir(), "awb-oauth-state-"));
  return path.join(dir, "auth.json");
}

const SECRET = "test-access-secret";
function cfgWith(overrides = {}) {
  return {
    jwt: { accessSecret: SECRET },
    integrations: {
      stateTtlSec: 600,
      notion: { clientId: "cid-notion", clientSecret: "sec-notion", redirectUri: "https://app.example/cb" },
      todoist: { clientId: "cid-todoist", clientSecret: "sec-todoist", redirectUri: "https://app.example/cb" },
      ...overrides,
    },
  };
}

function call(router, method, url, { token } = {}) {
  return new Promise((resolve) => {
    const req = { method, url, headers: {} };
    if (token) req.headers.authorization = "Bearer " + token;
    // Express 在 req 原型上提供 header()/get()，裸 mock 必须补上（否则鉴权中间件抛 TypeError）
    req.header = req.get = (name) => req.headers[String(name).toLowerCase()];
    // query 由 app 级 query parser 中间件填充；直驱 router 时 mock 必须自己解析
    req.query = Object.fromEntries(new URL(url, "http://localhost").searchParams.entries());
    const res = {
      statusCode: 200,
      _type: null,
      status(n) { this.statusCode = n; return this; },
      json(o) { resolve({ status: this.statusCode, kind: "json", body: o }); return this; },
      type(t) { this._type = t; return this; },
      send(b) { resolve({ status: this.statusCode, kind: this._type || "html", body: b }); return this; },
    };
    router.handle(req, res, (err) => { if (err) resolve({ status: 500, kind: "error", body: String(err) }); });
  });
}

const realRequest = https.request;
afterEach(() => { https.request = realRequest; });

function stubTokenEndpoint() {
  https.request = function (_opts, cb) {
    const r = new EventEmitter();
    r.statusCode = 200;
    process.nextTick(() => {
      cb(r);
      r.emit("data", JSON.stringify({ access_token: "tok-123", refresh_token: "ref-456", expires_in: 3600 }));
      r.emit("end");
    });
    return { on() {}, end() {}, destroy() {} };
  };
}

describe("集成 OAuth · state 生成与回调校验", () => {
  it("/status 为已配置 provider 生成一次性 state 并绑定 userId，写进 authorizeUrl", async () => {
    const store = new Store(tmpStoreFile());
    const router = integrationsRouter(cfgWith(), store);
    const token = jwt.sign({ sub: "userA" }, SECRET);
    const r = await call(router, "GET", "/status", { token });
    expect(r.status).toBe(200);
    const p = r.body.data.providers.notion;
    expect(p.configured).toBe(true);
    const au = new URL(p.authorizeUrl);
    const state = au.searchParams.get("state");
    expect(state).toBeTruthy();
    expect(state).toHaveLength(32);
    const rec = store.getOAuthState(state);
    expect(rec.provider).toBe("notion");
    expect(rec.data.userId).toBe("userA");
    expect(rec.createdAt).toBeGreaterThan(0);
  });

  it("回调带有效 state + code → 200 HTML 结果页（载荷含 state），集成按绑定用户落库", async () => {
    stubTokenEndpoint();
    const store = new Store(tmpStoreFile());
    const router = integrationsRouter(cfgWith(), store);
    const token = jwt.sign({ sub: "userA" }, SECRET);
    const st = (await call(router, "GET", "/status", { token })).body.data.providers.notion;
    const state = new URL(st.authorizeUrl).searchParams.get("state");
    const r = await call(router, "GET", `/oauth/notion/callback?state=${state}&code=abc`);
    expect(r.status).toBe(200);
    expect(r.kind).toBe("html");
    expect(String(r.body)).toContain("agent-integrations-connected");
    expect(String(r.body)).toContain(state);
    expect(store.listIntegrations("userA")).toEqual([
      { provider: "notion", connected: true, createdAt: expect.any(Number) },
    ]);
    // 一次性消费：state 已被删除，重放即 400
    const replay = await call(router, "GET", `/oauth/notion/callback?state=${state}&code=abc`);
    expect(replay.status).toBe(400);
    expect(replay.body.error).toBe("invalid_state");
  });

  it("缺 state / 无效 state → 400 invalid_state", async () => {
    const store = new Store(tmpStoreFile());
    const router = integrationsRouter(cfgWith(), store);
    const noState = await call(router, "GET", "/oauth/notion/callback?code=abc");
    expect(noState.status).toBe(400);
    expect(noState.body.error).toBe("invalid_state");
    const bogus = await call(router, "GET", "/oauth/notion/callback?state=deadbeef&code=abc");
    expect(bogus.status).toBe(400);
    expect(bogus.body.error).toBe("invalid_state");
  });

  it("state 属于别的 provider → 400 invalid_state（provider 绑定）", async () => {
    const store = new Store(tmpStoreFile());
    const router = integrationsRouter(cfgWith(), store);
    const token = jwt.sign({ sub: "userA" }, SECRET);
    const st = (await call(router, "GET", "/status", { token })).body.data.providers.notion;
    const state = new URL(st.authorizeUrl).searchParams.get("state");
    const r = await call(router, "GET", `/oauth/todoist/callback?state=${state}&code=abc`);
    expect(r.status).toBe(400);
    expect(r.body.error).toBe("invalid_state");
  });

  it("过期 state → 400 state_expired 且被清除", async () => {
    const store = new Store(tmpStoreFile());
    const router = integrationsRouter(cfgWith(), store);
    const token = jwt.sign({ sub: "userA" }, SECRET);
    const st = (await call(router, "GET", "/status", { token })).body.data.providers.notion;
    const state = new URL(st.authorizeUrl).searchParams.get("state");
    store._data.oauthStates[state].createdAt = Date.now() - 700 * 1000;
    const r = await call(router, "GET", `/oauth/notion/callback?state=${state}&code=abc`);
    expect(r.status).toBe(400);
    expect(r.body.error).toBe("state_expired");
    expect(store.getOAuthState(state)).toBeNull();
  });

  it("缺 code → 400 missing_code（state 有效但无授权码）", async () => {
    const store = new Store(tmpStoreFile());
    const router = integrationsRouter(cfgWith(), store);
    const token = jwt.sign({ sub: "userA" }, SECRET);
    const st = (await call(router, "GET", "/status", { token })).body.data.providers.notion;
    const state = new URL(st.authorizeUrl).searchParams.get("state");
    const r = await call(router, "GET", `/oauth/notion/callback?state=${state}`);
    expect(r.status).toBe(400);
    expect(r.body.error).toBe("missing_code");
  });

  it("provider 凭据未配置 → 200 {connected:false, reason:not_configured}（不假装连上）", async () => {
    const store = new Store(tmpStoreFile());
    const router = integrationsRouter(cfgWith(), store);
    const token = jwt.sign({ sub: "userA" }, SECRET);
    const st = (await call(router, "GET", "/status", { token })).body.data.providers.notion;
    const state = new URL(st.authorizeUrl).searchParams.get("state");
    // 把凭据抹掉，模拟部署者未配置
    const cfg = cfgWith();
    cfg.integrations.notion = {};
    const router2 = integrationsRouter(cfg, store);
    const r = await call(router2, "GET", `/oauth/notion/callback?state=${state}&code=abc`);
    expect(r.status).toBe(200);
    expect(r.body.data.connected).toBe(false);
    expect(r.body.data.reason).toBe("not_configured");
    expect(store.listIntegrations("userA")).toEqual([]);
  });
});