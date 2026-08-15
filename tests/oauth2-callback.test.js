/**
 * OAuth2 回调闭环 · 回归验证（v1.11.2 认证补码）
 * ----------------------------------------------------------------------------
 * 此前流程两头断：oauth2BuildAuthUrl 只返回 URL 不跳转，页面加载也不解析 ?code=。
 * v1.11.2 新增 _oauth2HandleCallback（startup 挂接）：?code+state → 一次性 state 校验
 * → 授权码换 token 落盘 → 清理 URL。本文件直接调用该函数验证闭环。
 */

import { describe, it, expect, beforeEach } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

function freshWin() {
  const win = loadApp();
  win.localStorage.clear();
  return win;
}

function seedProvider(win) {
  win.localStorage.setItem("wb_oauth2_providers", JSON.stringify({
    tprov: {
      enabled: true,
      clientId: "cid-1",
      clientSecret: "sec-1",
      tokenEndpoint: "https://oauth.example/token",
      redirectUri: "https://app.example/cb",
    },
  }));
}
function seedState(win, state, provider) {
  win.localStorage.setItem("wb_oauth2_states", JSON.stringify({
    [state]: { provider: provider || "tprov", createdAt: Date.now(), pkceVerifier: "ver-1" },
  }));
}

describe("OAuth2 回调闭环（v1.11.2）", () => {
  let win;
  beforeEach(() => { win = freshWin(); });

  it("正常启动（无 code/state）：零开销返回 false", async () => {
    await expect(win.__test._oauth2HandleCallback()).resolves.toBe(false);
  });

  it("完整闭环：?code+state → 换 token 落盘 → URL 清理 → state 一次性消费", async () => {
    seedProvider(win);
    seedState(win, "st-ok");
    win.history.replaceState(null, "", "/cb?code=authcode1&state=st-ok");
    const fetchCalls = [];
    win.fetch = async (url, opts) => {
      fetchCalls.push({ url, opts });
      return { ok: true, status: 200, json: async () => ({ access_token: "AT-1", token_type: "Bearer", expires_in: 3600, refresh_token: "RT-1" }) };
    };
    const ok = await win.__test._oauth2HandleCallback();
    expect(ok, "闭环应成功").toBe(true);
    expect(fetchCalls.length).toBe(1);
    expect(fetchCalls[0].url).toBe("https://oauth.example/token");
    const body = fetchCalls[0].opts.body;
    const parsed = Object.fromEntries(new win.URLSearchParams(body)); // token 端点按 form-urlencoded 发送
    expect(parsed.code).toBe("authcode1");
    expect(parsed.code_verifier).toBe("ver-1");
    const token = win.__test.oauth2GetToken("tprov");
    expect(token, "token 应落盘").toBeTruthy();
    expect(win.location.search, "URL 应已清理 query").toBe("");
    expect(win.__test.oauth2ValidateState("st-ok"), "state 应一次性消费").toBeNull();
  });

  it("state 不匹配（非本应用发起）：忽略且不发请求", async () => {
    seedProvider(win);
    win.history.replaceState(null, "", "/cb?code=x&state=forged");
    const fetchCalls = [];
    win.fetch = async (u, o) => { fetchCalls.push(1); return { ok: true, status: 200, json: async () => ({}) }; };
    await expect(win.__test._oauth2HandleCallback()).resolves.toBe(false);
    expect(fetchCalls.length).toBe(0);
    expect(win.location.search).toBe("");
  });

  it("error 回调：返回 false 并清理 URL", async () => {
    win.history.replaceState(null, "", "/cb?error=access_denied");
    await expect(win.__test._oauth2HandleCallback()).resolves.toBe(false);
    expect(win.location.search).toBe("");
  });
});
