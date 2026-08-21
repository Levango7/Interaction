/**
 * T3.1 AI 增强（重试/取消/流式）· 用例验证
 * ----------------------------------------------------------------------------
 * 验证对象：chatOnce 的取消（AbortController）、重试（自动 + 手动）、流式 SSE 解析。
 * 覆盖：
 *   - createChatController 返回正确结构（ac/timer/aborted/reason）
 *   - abortChat 无进行中请求返回 false
 *   - chatOnce 非流式 fallback（application/json 一次性返回）
 *   - chatOnce 流式 SSE：逐 chunk 解析 data: 行，onDelta 收到累积 content
 *   - chatOnce 流式 SSE：chunk 跨边界（buffer 拼接）
 *   - readSSEStream 遇 [DONE] 终止
 *   - chatOnce 自动重试：前 2 次 TypeError 第 3 次成功
 *   - chatOnce 自动重试耗尽：3 次都 TypeError 抛出"无法连接"
 *   - chatOnce 非网络错误（401）不自动重试，只调用 1 次
 *   - chatOnce 取消：传 signal，abort 后抛 AbortError
 *   - retryChat 无上次请求返回 false
 *   - runChatLoop + abortChat 集成：取消后 hist 含 _canceled，#chat 显示「已取消」
 *
 * 设计原则：
 *   - 黑盒优先：通过 window.__test 访问内部函数，mock win.fetch
 *   - mock ReadableStream：用 TextEncoder 编码 SSE chunk，getReader 逐块返回
 *   - 自动重试间隔 1s 用 real timers + testTimeout 20000（简单可靠）
 *
 * 运行：npx vitest run tests/ai-enhance.test.js
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

const PREFIX = "wb_agent_";

/** 取全新 window 并等待启动 async 完成 */
async function boot() {
  const win = loadApp();
  await new Promise((r) => setTimeout(r, 80));
  return win;
}

/** 配置 AI enabled + 一个测试 profile（_resetCrypto 后 setItem 再 render 生效） */
function setupAiProfile(win, base) {
  win.__test._resetCrypto();
  win.localStorage.setItem(
    PREFIX + "cfg",
    JSON.stringify({
      enabled: true,
      profiles: [{ id: "p1", name: "Test", base: base || "https://api.test.com/v1", key: "sk-test", model: "gpt-4o-mini" }],
      activeId: "p1"
    })
  );
}

/** 构造 mock Response（非流式 JSON） */
function mockJsonResponse(obj, status) {
  status = status || 200;
  return {
    ok: status >= 200 && status < 300,
    status: status,
    headers: { get: function (k) { return k === "content-type" ? "application/json" : null; } },
    json: () => Promise.resolve(obj),
    body: null
  };
}

/** 构造 mock Response（流式 SSE）—— chunks 为字符串数组，逐块用 TextEncoder 编码 */
function mockSSEResponse(chunks) {
  const encoder = new TextEncoder();
  return {
    ok: true,
    status: 200,
    headers: { get: function (k) { return k === "content-type" ? "text/event-stream" : null; } },
    body: {
      getReader: () => {
        let i = 0;
        return {
          read: () => {
            if (i < chunks.length) {
              const value = encoder.encode(chunks[i++]);
              return Promise.resolve({ done: false, value: value });
            }
            return Promise.resolve({ done: true, value: undefined });
          }
        };
      }
    },
    json: () => Promise.reject(new Error("should not call json on SSE"))
  };
}

/** 构造 mock fetch：返回 pending Promise，监听 signal abort（模拟真实 fetch 取消行为） */
function mockFetchPendingAbort() {
  return vi.fn((url, opts) => new Promise((resolve, reject) => {
    const signal = opts && opts.signal;
    if (signal) {
      if (signal.aborted) {
        const err = new Error("aborted"); err.name = "AbortError"; reject(err); return;
      }
      signal.addEventListener("abort", () => {
        const err = new Error("aborted"); err.name = "AbortError"; reject(err);
      });
    }
    // 不 resolve，等待 abort 触发
  }));
}

/** 在 win 上注入 fetch mock（jsdom inline script 的 fetch 解析到 window.fetch） */
function setFetch(win, mockFn) {
  Object.defineProperty(win, "fetch", { value: mockFn, writable: true, configurable: true });
}

// 防止 fake timers 跨用例泄漏
afterEach(() => {
  vi.useRealTimers();
});

describe("T3.1 AI 增强 · createChatController", () => {
  it("返回 controller 对象（ac/timer/aborted/reason），ac 是 AbortController", async () => {
    const win = await boot();
    const { createChatController } = win.__test;
    const ctrl = createChatController();
    expect(ctrl).toBeTruthy();
    expect(ctrl.ac).toBeInstanceOf(win.AbortController);
    expect(typeof ctrl.timer).toBe("number");
    expect(ctrl.aborted).toBe(false);
    expect(ctrl.reason).toBe(null);
    expect(ctrl.ac.signal.aborted).toBe(false);
    clearTimeout(ctrl.timer);
  }, 15000);
});

describe("T3.1 AI 增强 · abortChat", () => {
  it("无进行中请求（chatController=null）返回 false", async () => {
    const win = await boot();
    const { abortChat } = win.__test;
    expect(abortChat()).toBe(false);
  }, 15000);
});

describe("T3.1 AI 增强 · chatOnce 非流式 fallback", () => {
  it("Content-Type=application/json → 一次性 json() 返回", async () => {
    const win = await boot();
    setupAiProfile(win);
    const { chatOnce } = win.__test;
    const fakeResp = mockJsonResponse({ choices: [{ message: { content: "你好" } }] });
    setFetch(win, vi.fn(() => Promise.resolve(fakeResp)));
    const j = await chatOnce([{ role: "user", content: "hi" }]);
    expect(j.choices[0].message.content).toBe("你好");
    expect(win.fetch).toHaveBeenCalledTimes(1);
  }, 15000);

  it("HTTP 401 → 抛「API Key 无效」且不自动重试（只调 1 次 fetch）", async () => {
    const win = await boot();
    setupAiProfile(win);
    const { chatOnce } = win.__test;
    setFetch(win, vi.fn(() => Promise.resolve(mockJsonResponse({}, 401))));
    await expect(chatOnce([{ role: "user", content: "hi" }])).rejects.toThrow(/API Key 无效/);
    expect(win.fetch).toHaveBeenCalledTimes(1);
  }, 15000);
});

// L2/L3：SSE 流式分支为不可达死代码（chatOnce 未请求 stream:true），已按审查报告清理移除；对应流式单测一并删除。chatOnce 现统一按非流式 json 解析（见 compat.test.js e2/e3）。

describe("T3.1 AI 增强 · chatOnce 自动重试（网络错误）", () => {
  it("前 2 次 TypeError 第 3 次成功 → 最终返回成功结果", async () => {
    const win = await boot();
    setupAiProfile(win);
    const { chatOnce } = win.__test;
    let calls = 0;
    setFetch(win, vi.fn(() => {
      calls++;
      if (calls <= 2) return Promise.reject(new TypeError("network error"));
      return Promise.resolve(mockJsonResponse({ choices: [{ message: { content: "ok" } }] }));
    }));
    const j = await chatOnce([{ role: "user", content: "hi" }]);
    expect(j.choices[0].message.content).toBe("ok");
    expect(win.fetch).toHaveBeenCalledTimes(3);
  }, 20000);

  it("3 次都 TypeError → 抛「无法连接 API」（重试耗尽）", async () => {
    const win = await boot();
    setupAiProfile(win);
    const { chatOnce } = win.__test;
    setFetch(win, vi.fn(() => Promise.reject(new TypeError("network error"))));
    await expect(chatOnce([{ role: "user", content: "hi" }])).rejects.toThrow(/无法连接 API/);
    expect(win.fetch).toHaveBeenCalledTimes(3);
  }, 20000);

  it("retry=1 → 仅尝试 1 次，不重试", async () => {
    const win = await boot();
    setupAiProfile(win);
    const { chatOnce } = win.__test;
    setFetch(win, vi.fn(() => Promise.reject(new TypeError("network error"))));
    await expect(chatOnce([{ role: "user", content: "hi" }], { retry: 1 })).rejects.toThrow(/无法连接 API/);
    expect(win.fetch).toHaveBeenCalledTimes(1);
  }, 15000);
});

describe("T3.1 AI 增强 · chatOnce 取消（AbortController）", () => {
  it("传 signal 并 abort → chatOnce 抛 AbortError，fetch 收到 signal", async () => {
    const win = await boot();
    setupAiProfile(win);
    const { chatOnce, createChatController } = win.__test;
    const fetchMock = mockFetchPendingAbort();
    setFetch(win, fetchMock);
    const ctrl = createChatController();
    const p = chatOnce([{ role: "user", content: "hi" }], { signal: ctrl.ac.signal });
    // 让 chatOnce 进入 fetch
    await new Promise((r) => setTimeout(r, 10));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const passedSignal = fetchMock.mock.calls[0][1].signal;
    expect(passedSignal).toBe(ctrl.ac.signal);
    ctrl.ac.abort();
    await expect(p).rejects.toSatisfy((err) => err && err.name === "AbortError");
    clearTimeout(ctrl.timer);
  }, 15000);
});

describe("T3.1 AI 增强 · retryChat", () => {
  it("无上次请求（lastChatRequest=null）返回 false", async () => {
    const win = await boot();
    const { retryChat } = win.__test;
    expect(await retryChat()).toBe(false);
  }, 15000);
});

describe("T3.1 AI 增强 · runChatLoop + abortChat 集成", () => {
  it("取消后 hist 含 _canceled，#chat 显示「已取消」", async () => {
    const win = await boot();
    setupAiProfile(win);
    win.__test.setActive("office");
    win.__test.render();
    const { runChatLoop, abortChat, appendChat, getChat } = win.__test;
    setFetch(win, mockFetchPendingAbort());
    // 用 appendChat 写入 chats 缓存，getChat 返回同一引用（runChatLoop push 会反映到 renderChat）
    appendChat("office", { role: "user", content: "hi" });
    const hist = getChat("office");
    const messages = [{ role: "system", content: "sys" }].concat(hist.map((m) => ({ ...m })));
    const p = runChatLoop(messages, hist);
    // 让 runChatLoop 进入 chatOnce（fetch pending）
    await new Promise((r) => setTimeout(r, 20));
    abortChat();
    await p;
    const last = hist[hist.length - 1];
    expect(last.role).toBe("assistant");
    expect(last._canceled).toBe(true);
    const chatEl = win.document.getElementById("chat");
    expect(chatEl).toBeTruthy();
    expect(chatEl.innerHTML).toContain("已取消");
  }, 15000);

  it("请求失败后 hist 含 _failed + content，#chat 显示重试按钮", async () => {
    const win = await boot();
    setupAiProfile(win);
    win.__test.setActive("office");
    win.__test.render();
    const { runChatLoop, appendChat, getChat } = win.__test;
    setFetch(win, vi.fn(() => Promise.resolve(mockJsonResponse({}, 500))));
    appendChat("office", { role: "user", content: "hi" });
    const hist = getChat("office");
    const messages = [{ role: "system", content: "sys" }].concat(hist.map((m) => ({ ...m })));
    await runChatLoop(messages, hist);
    const last = hist[hist.length - 1];
    expect(last.role).toBe("assistant");
    expect(last._failed).toBe(true);
    expect(last.content).toMatch(/服务异常/);
    const chatEl = win.document.getElementById("chat");
    expect(chatEl.innerHTML).toContain("chat-retry");
    expect(chatEl.innerHTML).toContain("重试");
  }, 15000);
});
