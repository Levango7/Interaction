/**
 * api-envelope.test.js —— apiFetch 的信封拆包（v3.7.112 真机联调抓到的 P0 的回归守护）
 * ----------------------------------------------------------------------------
 * 背景：本仓后端所有路由都返回 `{ok, data}` 信封（见 server/src/sync.js 的 ok()/fail()），
 * 而客户端各 api* 读的是载荷本体（r.data.accessToken / r.data.snapshot / r.data.devices）。
 * 两边从未对齐过 —— server/verify/client-contract-check.cjs 只比了 HTTP 状态与端点存在性
 * （读 r.json.data.accessToken，即按信封读），所以一直绿着；而 _probe/ui-backend-integration.mjs
 * 第一次跑**真 UI** 就抓到：登录拿 HTTP 200 + 「登录成功」提示，但 token / user 一个都取不到
 * （云同步的快照同理读不出来）—— 即"假成功"。
 *
 * 本文件钉三件事：
 *   ① 成功信封 {ok:true, data:{...}} → 拆包（r.data 即载荷本体）
 *   ② 错误体 {ok:false, error:"..."} → **不拆**（调用方要读 r.data.error 做错误提示）
 *   ③ 无信封的扁平响应（mock / 第三方代理）→ 原样透传
 * 外加两条端到端：apiLogin / apiGetSnapshot 在信封形状下真的把 token / 快照取回来。
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

const PREFIX = "wb_agent_";
let win;
afterEach(() => { if (win) win.close(); win = undefined; vi.restoreAllMocks(); });

async function boot() {
  win = loadApp({ storage: { [PREFIX + "cfg"]: JSON.stringify({ enabled: false, apiBase: "https://api.example.com" }) } });
  await vi.waitFor(() => expect(win.document.getElementById("chatPanel")._bound).toBe(true), { timeout: 15000, interval: 100 });
  return win;
}
/** 把 win.fetch 换成返回给定 JSON 体的假实现 */
function stubResponse(body, status) {
  win.fetch = vi.fn(() => Promise.resolve({
    ok: status >= 200 && status < 300,
    status: status,
    json: () => Promise.resolve(body)
  }));
}

describe("apiFetch 信封拆包", () => {
  it("① 成功信封拆包：r.data 即载荷本体", async () => {
    await boot();
    stubResponse({ ok: true, data: { accessToken: "tk-1", user: { email: "a@b.c" } } }, 200);
    const r = await win.apiFetch("/api/auth/login", { method: "POST" });
    expect(r.ok).toBe(true);
    expect(r.data.accessToken).toBe("tk-1");
    expect(r.data.user.email).toBe("a@b.c");
  });

  it("② 错误体不拆：r.data.error 仍可读（错误提示有具体原因）", async () => {
    await boot();
    stubResponse({ ok: false, error: "invalid_credentials", data: {} }, 401);
    const r = await win.apiFetch("/api/auth/login", { method: "POST" });
    expect(r.ok).toBe(false);
    expect(r.status).toBe(401);
    expect(r.data.error).toBe("invalid_credentials");
  });

  it("③ 无信封的扁平响应原样透传（mock / 第三方代理兼容）", async () => {
    await boot();
    stubResponse({ accessToken: "tk-2" }, 200);
    const r = await win.apiFetch("/api/auth/login", { method: "POST" });
    expect(r.data.accessToken).toBe("tk-2");
  });

  it("④ 端到端：信封形状下 apiLogin 真的把 token 落盘（本次 P0 的现象面）", async () => {
    await boot();
    stubResponse({ ok: true, data: { accessToken: "tk-3", refreshToken: "rt-3", expiresIn: 900, user: { email: "a@b.c" } } }, 200);
    const r = await win.apiLogin("a@b.c", "pw12345");
    expect(r.ok).toBe(true);
    expect(win.isApiLoggedIn(), "登录态必须为真（此前是假成功）").toBe(true);
    /* token 落盘是异步的（v3.7.62：密封 + 写盘在 Promise 链上）。本测试环境 WebCrypto 可用，
       token 以 **{__enc, iv, data} 密文**落盘（此前是明文 —— 密文是安全目标，不是 bug）；
       降级环境（无 crypto）则明文落盘。二态都算"落盘成功"。 */
    await vi.waitFor(() => expect(win.localStorage.getItem("wb_access_token")).toBeTruthy(), { timeout: 5000 });
    const stored = win.localStorage.getItem("wb_access_token");
    expect(stored.indexOf("__enc") !== -1 || stored.indexOf("tk-3") !== -1).toBe(true);
    expect(win.getApiUser().email).toBe("a@b.c");
  });

  it("⑤ 端到端：信封形状下 apiGetSnapshot 真的取回快照", async () => {
    await boot();
    stubResponse({ ok: true, data: { snapshot: { [PREFIX + "tasks"]: "[{\"id\":\"t1\"}]", _deviceMeta: { deviceId: "dev-1" } }, updatedAt: 12345 } }, 200);
    const rec = await win.apiGetSnapshot();
    expect(rec, "快照必须取得到（此前是 null）").not.toBeNull();
    expect(rec.snapshot._deviceMeta.deviceId).toBe("dev-1");
    expect(rec.updatedAt).toBe(12345);
  });
});
