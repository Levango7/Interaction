/**
 * web_fetch 代理兜底 · 回归验证
 * ----------------------------------------------------------------------------
 * 背景：web_fetch 原先直接 `fetch(url)`——浏览器跨域策略（CORS）会拦掉绝大多数
 * 站点，file:// 与本地服务形态下基本必然失败，等于"名有实无"。
 *
 * 演进：优先走代理（cfg.fetchProxy → cfg.apiBase + /api/tools/fetch），代理不可用则回退直连。
 * v3.7.111：后端补上了 /api/tools/fetch 且**必须 Bearer**（不做开放代理），故 apiBase 这条路
 * 从裸 fetch 改为 apiFetch（带 token、带 401 刷新）；用户自备的 fetchProxy 鉴权方式未知，
 * 保持裸 fetch。
 *
 * 本文件守护五点：
 *   ① 未配置代理 → 仍直连（不改变既有行为）
 *   ② 配置 apiBase → 走 apiFetch 打 /api/tools/fetch 且 url 被 encode
 *   ③ fetchProxy 优先于 apiBase，且仍是裸 fetch
 *   ④ 代理失败 → 回退直连；无代理且直连失败 → 给出可操作的 CORS 提示
 *   ⑤ 代理返回非 2xx / 异常 → 不当成抓取结果，回退直连（旧实现把代理的 404 当结果）
 *
 * 运行：npx vitest run tests/webfetch-proxy.test.js
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

const PREFIX = "wb_agent_";
let win;

afterEach(() => { if (win) win.close(); win = undefined; vi.restoreAllMocks(); });

/** 载入应用并设置 cfg（getCfg 每次调用读取 localStorage）
 *  必须等 startup 异步完成再返回——否则 afterEach 关窗口会让 startup 尾部
 *  访问已销毁 DOM，产生 applyTheme/documentElement 的 unhandled rejection。 */
async function boot(cfg) {
  // cfg 必须在应用脚本执行前注入：getCfg() 在启动时即读入内存，启动后再写 localStorage 不生效。
  win = loadApp({ storage: { [PREFIX + "cfg"]: JSON.stringify(cfg || {}) } });
  await vi.waitFor(
    () => expect(win.document.getElementById("chatPanel")._bound).toBe(true),
    { timeout: 15000, interval: 100 }
  );
  return win.__test.toolWebFetch;
}

/** 记录 fetch / apiFetch 调用的 URL；failFor 命中的 URL 走失败路径 */
function stubFetch(failFor = []) {
  const calls = [];
  const bad = (url) => failFor.some((f) => String(url).includes(f));
  win.fetch = vi.fn((url) => {
    calls.push(String(url));
    if (bad(url)) return Promise.reject(new TypeError("Failed to fetch"));
    return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve("<title>T</title><p>正文</p>") });
  });
  /* apiBase 路（v3.7.111）：apiFetch 的形状是 {ok, data:{text}}，与 fetch 的 Response 不同，分开桩 */
  win.apiFetch = vi.fn((url) => {
    calls.push(String(url));
    if (bad(url)) return Promise.reject(new TypeError("Failed to fetch"));
    return Promise.resolve({ ok: true, status: 200, data: { text: "<title>T</title><p>正文</p>" } });
  });
  return calls;
}

describe("web_fetch 代理兜底", () => {
  it("① 未配置代理 → 直连目标 URL（行为与旧版一致）", async () => {
    const toolWebFetch = await boot({});
    const calls = stubFetch();
    const r = await toolWebFetch("https://example.com/a");
    expect(r.ok).toBe(true);
    expect(calls).toEqual(["https://example.com/a"]);
  });

  it("② 配置 apiBase → 走 apiFetch 打 /api/tools/fetch 且 url 已编码", async () => {
    const toolWebFetch = await boot({ apiBase: "https://api.example.com" });
    const calls = stubFetch();
    await toolWebFetch("https://target.com/p?q=1&x=2");
    expect(calls).toHaveLength(1);
    expect(calls[0]).toBe("https://api.example.com/api/tools/fetch?url=" + encodeURIComponent("https://target.com/p?q=1&x=2"));
    expect(calls[0]).toContain("%3Fq%3D1");
    expect(win.apiFetch).toHaveBeenCalledTimes(1);
  });

  it("③ fetchProxy 优先于 apiBase，且仍是裸 fetch", async () => {
    const toolWebFetch = await boot({ apiBase: "https://api.example.com", fetchProxy: "https://proxy.example.com/fetch/" });
    const calls = stubFetch();
    await toolWebFetch("https://target.com");
    expect(calls[0].startsWith("https://proxy.example.com/fetch?url=")).toBe(true);
    expect(win.apiFetch).not.toHaveBeenCalled();
  });

  it("④a 代理失败 → 回退直连", async () => {
    const toolWebFetch = await boot({ apiBase: "https://api.example.com" });
    const calls = stubFetch(["api.example.com"]);
    const r = await toolWebFetch("https://target.com");
    expect(r.ok).toBe(true);
    expect(calls).toHaveLength(2);
    expect(calls[1]).toBe("https://target.com");
  });

  it("④b 无代理且直连失败 → 提示配置代理，而非裸 TypeError", async () => {
    const toolWebFetch = await boot({});
    stubFetch(["https://target.com"]);
    const r = await toolWebFetch("https://target.com");
    expect(r.ok).toBe(false);
    expect(r.error).toContain("CORS");
  });

  it("⑤ 代理返回非 2xx → 不当成抓取结果，回退直连（旧实现把代理的 404 当结果）", async () => {
    const toolWebFetch = await boot({ apiBase: "https://api.example.com" });
    const calls = [];
    win.fetch = vi.fn((url) => {
      calls.push(String(url));
      return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve("<title>T</title><p>正文</p>") });
    });
    win.apiFetch = vi.fn((url) => { calls.push(String(url)); return Promise.resolve({ ok: false, status: 404, data: null }); });
    const r = await toolWebFetch("https://target.com");
    expect(r.ok, "代理 404 不应成为最终结果").toBe(true);
    expect(calls[1]).toBe("https://target.com");
  });

  it("非法 URL 仍被前置拦截", async () => {
    const toolWebFetch = await boot({ apiBase: "https://api.example.com" });
    const calls = stubFetch();
    const r = await toolWebFetch("ftp://x");
    expect(r.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });
});
