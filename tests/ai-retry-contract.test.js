/**
 * AI 调用链重试契约 · 浏览器侧（v1.11.1 新增）
 * ----------------------------------------------------------------------------
 * 审查报告 P1（AI 双实现）：electron/main.js 的 chat IPC 与真相源内联 chatOnce
 * 各自维护一份逐字镜像的重试矩阵（跨进程双实现），任何一侧调整另一侧必然漂移。
 * 在共享构建管线（H4）落地前，本文件把重试矩阵钉成可执行契约：
 *   ① 429 → 退避重试（1s*(attempt+1)），默认 3 次耗尽后抛「请求过于频繁」；
 *   ② 网络错误（TypeError）→ 同款退避重试；
 *   ③ 401 → 立即失败不重试（「API Key 无效」）；
 *   ④ 成功路径透传 JSON。
 * electron 侧同矩阵由 tests/electron-ipc.test.js 的 F2 用例覆盖——两侧任何一处
 * 修改重试行为都应先改本契约（及对侧用例），再同步实现。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

describe("AI 调用链重试契约（浏览器侧 chatOnce）", () => {
  let win;
  beforeEach(async () => {
    win = loadApp();
    await new Promise((r) => setTimeout(r, 80)); // 等启动 async 完成（项目惯例，见 ai-enhance.test.js）
    win.localStorage.clear();
    // 配置注入走项目既定模式（setupAiProfile）：_resetCrypto 置空内存缓存后直写原始 cfg
    win.__test._resetCrypto();
    win.localStorage.setItem(
      win.__test.PREFIX + "cfg",
      JSON.stringify({
        enabled: false,
        profiles: [{ id: "p1", name: "Test", base: "https://api.example.com/v1", key: "sk-test", model: "m" }],
        activeId: "p1",
      })
    );
  });
  afterEach(() => { vi.useRealTimers(); });

  it("① 429 两次后退避成功：共 3 次请求，结果透传", async () => {
    vi.useFakeTimers();
    let n = 0;
    win.fetch = vi.fn(async () => {
      n++;
      if (n < 3) return { ok: false, status: 429 };
      return { ok: true, status: 200, json: async () => ({ ok: 1, choices: [{ message: { content: "hi" } }] }) };
    });
    const p = win.__test.chatOnce([{ role: "user", content: "q" }]);
    await vi.advanceTimersByTimeAsync(3500); // 越过 1s + 2s 两轮退避
    const r = await p;
    expect(win.fetch).toHaveBeenCalledTimes(3);
    expect(r.choices[0].message.content).toBe("hi");
    expect(win.fetch.mock.calls[0][0]).toBe("https://api.example.com/v1/chat/completions");
  });

  it("② 网络错误（TypeError）同样退避重试后成功", async () => {
    vi.useFakeTimers();
    let n = 0;
    win.fetch = vi.fn(async () => {
      n++;
      if (n < 3) { const e = new TypeError("Failed to fetch"); throw e; }
      return { ok: true, status: 200, json: async () => ({ ok: 1, choices: [{ message: { content: "ok" } }] }) };
    });
    const p = win.__test.chatOnce([{ role: "user", content: "q" }]);
    await vi.advanceTimersByTimeAsync(3500);
    const r = await p;
    expect(win.fetch).toHaveBeenCalledTimes(3);
    expect(r.choices[0].message.content).toBe("ok");
  });

  it("③ 401 立即失败不重试：仅 1 次请求，错误文案「API Key 无效」", async () => {
    win.fetch = vi.fn(async () => ({ ok: false, status: 401 }));
    await expect(win.__test.chatOnce([{ role: "user", content: "q" }])).rejects.toThrow("API Key 无效");
    expect(win.fetch).toHaveBeenCalledTimes(1);
  });

  it("④ 429 重试耗尽（3 次全 429）抛「请求过于频繁」", async () => {
    vi.useFakeTimers();
    win.fetch = vi.fn(async () => ({ ok: false, status: 429 }));
    const p = win.__test.chatOnce([{ role: "user", content: "q" }]);
    const assertion = expect(p).rejects.toThrow("请求过于频繁"); // 先 attach 避免 unhandled rejection
    await vi.advanceTimersByTimeAsync(7000);
    await assertion;
    expect(win.fetch).toHaveBeenCalledTimes(3);
  });
});
