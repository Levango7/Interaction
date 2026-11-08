/**
 * 渲染进程侧的 Electron 流式接线（2026-11-08）
 *
 * 主进程 SSE 解析由 tests/electron-ipc.test.js 的 F8 覆盖；这里钉客户端契约：
 *  - 调用 chat 时带 { stream:true, streamId }，且订阅时**先订阅后调用**；
 *  - 只处理本请求 streamId 的分块（同窗口并发请求不串字）；
 *  - 请求结束（成功/失败）都退订，监听器不累积；
 *  - 旧版 preload 没有 onChatChunk → 退回整包，不报错（前后版本可混用）。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function bootWith(electronAPI) {
  const win = loadApp();
  await wait(80);
  win.electronAPI = electronAPI;
  return win;
}

describe("Electron 流式 · 渲染进程接线", () => {
  let win;
  beforeEach(() => { win = null; });

  it("传 stream/streamId，按 streamId 过滤分块，结束后退订", async () => {
    const unsub = vi.fn();
    let listener = null;
    const sent = [];
    win = await bootWith({
      chat: vi.fn(async (body) => { sent.push(body); return { choices: [{ message: { content: "ok" } }] }; }),
      onChatChunk: vi.fn((cb) => { listener = cb; return unsub; }),
      abortChat: vi.fn(),
    });
    const got = [];
    const r = await win.__test.chatOnce([{ role: "user", content: "q" }], { onChunk: (s) => got.push(s) });
    expect(r.choices[0].message.content).toBe("ok");
    expect(sent[0].stream).toBe(true);
    expect(typeof sent[0].streamId).toBe("string");
    expect(listener).toBeTypeOf("function");
    listener({ streamId: sent[0].streamId, text: "A" });
    listener({ streamId: "someone-else", text: "X" });
    listener({ text: "no-id" });
    expect(got).toEqual(["A"]);
    expect(unsub).toHaveBeenCalledTimes(1);
  });

  it("旧 preload（无 onChatChunk）→ 不开流式也不报错", async () => {
    const sent = [];
    win = await bootWith({
      chat: vi.fn(async (body) => { sent.push(body); return { choices: [{ message: { content: "ok" } }] }; }),
      abortChat: vi.fn(),
    });
    const got = [];
    const r = await win.__test.chatOnce([{ role: "user", content: "q" }], { onChunk: (s) => got.push(s) });
    expect(r.choices[0].message.content).toBe("ok");
    expect(sent[0].stream).toBeUndefined();
    expect(sent[0].streamId).toBeUndefined();
    expect(got).toEqual([]);
  });

  it("失败也要退订；__USER_CANCEL__ 转成 AbortError", async () => {
    const unsub = vi.fn();
    win = await bootWith({
      chat: vi.fn(async () => { throw new Error("__USER_CANCEL__"); }),
      onChatChunk: vi.fn(() => unsub),
      abortChat: vi.fn(),
    });
    await expect(win.__test.chatOnce([{ role: "user", content: "q" }], { onChunk: () => {} }))
      .rejects.toMatchObject({ name: "AbortError" });
    expect(unsub).toHaveBeenCalledTimes(1);
  });
});