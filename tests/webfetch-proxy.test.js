/**
 * web_fetch 代理兜底 · 回归验证
 * ----------------------------------------------------------------------------
 * 背景：web_fetch 原先直接 `fetch(url)`——浏览器跨域策略（CORS）会拦掉绝大多数
 * 站点，file:// 与本地服务形态下基本必然失败，等于"名有实无"。
 *
 * 本次改为：优先走代理（cfg.fetchProxy → cfg.apiBase + /api/tools/fetch），
 * 代理不可用则回退直连；两者都未配置时保持直连（与旧版行为一致）。
 *
 * 本文件守护四点：
 *   ① 未配置代理 → 仍直连（不改变既有行为）
 *   ② 配置 apiBase → 请求打到 /api/tools/fetch 且 url 被 encode
 *   ③ fetchProxy 优先于 apiBase
 *   ④ 代理失败 → 回退直连；无代理且直连失败 → 给出可操作的 CORS 提示
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

/** 记录 fetch 调用的 URL；按 needFail 决定哪些 URL 抛错 */
function stubFetch(failFor = []) {
  const calls = [];
  win.fetch = vi.fn((url) => {
    calls.push(String(url));
    if (failFor.some((f) => String(url).includes(f))) {
      return Promise.reject(new TypeError("Failed to fetch"));
    }
    return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve("<title>T</title><p>正文</p>") });
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

  it("② 配置 apiBase → 走 /api/tools/fetch 且 url 已编码", async () => {
    const toolWebFetch = await boot({ apiBase: "https://api.example.com" });
    const calls = stubFetch();
    await toolWebFetch("https://target.com/p?q=1&x=2");
    expect(calls).toHaveLength(1);
    expect(calls[0]).toBe("https://api.example.com/api/tools/fetch?url=" + encodeURIComponent("https://target.com/p?q=1&x=2"));
    expect(calls[0]).toContain("%3Fq%3D1");
  });

  it("③ fetchProxy 优先于 apiBase", async () => {
    const toolWebFetch = await boot({ apiBase: "https://api.example.com", fetchProxy: "https://proxy.example.com/fetch/" });
    const calls = stubFetch();
    await toolWebFetch("https://target.com");
    expect(calls[0].startsWith("https://proxy.example.com/fetch?url=")).toBe(true);
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

  it("非法 URL 仍被前置拦截", async () => {
    const toolWebFetch = await boot({ apiBase: "https://api.example.com" });
    const calls = stubFetch();
    const r = await toolWebFetch("ftp://x");
    expect(r.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });
});
