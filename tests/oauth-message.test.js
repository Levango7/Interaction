import { afterEach, describe, expect, it, vi } from "vitest";
import { loadApp } from "./helpers/loadApp.js";
let win;
afterEach(() => { if (win) win.close(); win = undefined; vi.restoreAllMocks(); });
async function boot() {
  win = loadApp();
  await vi.waitFor(() => expect(win.document.getElementById("chatPanel")._bound).toBe(true));
  win.__test.setActive("authwelcome");
  win.__test.render();
  win.apiSetTokens = vi.fn();
  win._loadApiPanels = vi.fn();
}
function message({ origin = "http://localhost:3001", source = null, state = "expected-state" } = {}) {
  win.dispatchEvent(new win.MessageEvent("message", {
    origin, source, data: { type: "agent-github-oauth", state, accessToken: "test-access", refreshToken: "test-refresh" }
  }));
}
async function openFlow() {
  const popup = { closed: false };
  win.open = vi.fn(() => popup);
  win.apiGithubOauthUrl = vi.fn().mockResolvedValue({ ok: true, data: {
    authorizeUrl: "https://github.com/login/oauth/authorize?state=expected-state", state: "expected-state"
  } });
  win.document.getElementById("authSsoGithub").click();
  await vi.waitFor(() => expect(win.open).toHaveBeenCalledTimes(1));
  return popup;
}

describe("GitHub OAuth 消息来源与会话绑定", () => {
  it("未发起登录时不接收任意窗口发送的 token", async () => {
    await boot();
    message({ origin: "https://untrusted.example" });
    expect(win.apiSetTokens).not.toHaveBeenCalled();
    expect(win.__test.getActive()).toBe("authwelcome");
  });
  it("发起登录后拒绝错误 origin、source 和 state", async () => {
    await boot();
    const popup = await openFlow();
    message({ origin: "https://untrusted.example", source: popup });
    message({ source: {} });
    message({ source: popup, state: "wrong-state" });
    expect(win.apiSetTokens).not.toHaveBeenCalled();
  });
  it("合法回调发送后弹窗已关闭，异步送达的消息仍能完成登录", async () => {
    await boot();
    const popup = await openFlow();
    popup.closed = true; // postMessage 排队后回调页立即 close 是正常完成流程。
    message({ source: popup });
    expect(win.apiSetTokens).toHaveBeenCalledTimes(1);
    expect(win.__test.getActive()).toBe("overview");
  });
  it("同一登录窗口、API 来源和 state 匹配时只接受一次并刷新账号面板", async () => {
    await boot();
    const popup = await openFlow();
    message({ source: popup });
    message({ source: popup });
    expect(win.apiSetTokens).toHaveBeenCalledTimes(1);
    expect(win._loadApiPanels).toHaveBeenCalledTimes(1);
    expect(win.__test.getActive()).toBe("overview");
  });
});
