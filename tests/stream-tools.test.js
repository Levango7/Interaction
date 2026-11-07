/**
 * stream-tools.test.js —— 流式输出在工具模式下的回归护栏（2026-11-07）
 * ----------------------------------------------------------------------------
 * 覆盖两条：
 *   ① SSE 最终消息的 content 必须携带累积文本。此前 chatOnce 合成的最终消息 content 恒为空串，
 *      调用方删掉流式占位消息后入历史的只剩空内容 ⇒ 实测退化成「(无内容)」（本文件第一条用例
 *      修复前直接红）。
 *   ② 工具模式（cfg.enabled=true，请求带 tools）不再关闭流式：onChunk 必须被传入，
 *      边收边渲染；工具轮的 assistant 开场文字与 tool_calls 一起入历史，且取消/失败不留
 *      _streaming 残影（占位清理已在 finally 兜底）。
 */
import { describe, it, expect } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

const PREFIX = "wb_agent_";
const enc = new TextEncoder();

async function boot({ tools = true } = {}) {
  const win = loadApp({ storage: { [PREFIX + "onboarded"]: "true" } });
  win.__test._resetCrypto();
  win.localStorage.setItem(PREFIX + "cfg", JSON.stringify({
    enabled: tools,
    profiles: [{ id: "p", name: "T", base: "https://api.test/v1", key: "sk-test", model: "m" }],
    activeId: "p",
  }));
  win.__test.setActive("office");
  win.__test.render();
  await new Promise((r) => setTimeout(r, 30));
  return win;
}

function sseResponse(chunks) {
  return {
    ok: true, status: 200,
    headers: { get: (k) => (k === "content-type" ? "text/event-stream" : null) },
    body: {
      getReader: () => {
        let i = 0;
        return { read: () => (i < chunks.length ? Promise.resolve({ done: false, value: enc.encode(chunks[i++]) }) : Promise.resolve({ done: true, value: undefined })) };
      },
    },
    json: () => Promise.reject(new Error("SSE 响应不应走 json()")),
  };
}

function jsonResponse(payload) {
  return {
    ok: true, status: 200,
    headers: { get: (k) => (k === "content-type" ? "application/json" : null) },
    json: () => Promise.resolve(payload),
  };
}

/** 按轮次脚本化 fetch：script[i] 是第 i 次请求的响应；同时记录每次请求 body */
function scriptedFetch(win, script) {
  const sent = [];
  Object.defineProperty(win, "fetch", {
    value: (url, opts) => {
      sent.push(JSON.parse(opts.body));
      const next = script.shift();
      if (!next) return Promise.reject(new Error("unexpected extra request"));
      return Promise.resolve(next);
    },
    writable: true, configurable: true,
  });
  return sent;
}

async function runOnce(win, userText) {
  const { runChatLoop, appendChat, getChat } = win.__test;
  appendChat("office", { role: "user", content: userText });
  const hist = getChat("office");
  const messages = [{ role: "system", content: "sys" }].concat(hist.map((m) => ({ ...m })));
  await runChatLoop(messages, hist);
  return hist;
}

const assistants = (hist) => hist.filter((m) => m.role === "assistant" && !m._streaming);

describe("① SSE 文本必须进历史（修复前退化成「(无内容)」）", () => {
  it("纯文本轮：分块文本完整落在 assistant.content", async () => {
    const win = await boot({ tools: false });
    scriptedFetch(win, [sseResponse([
      'data: {"choices":[{"delta":{"content":"你好"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"，世界"},"finish_reason":"stop"}]}\n\n',
      "data: [DONE]\n\n",
    ])]);
    const hist = await runOnce(win, "hi");
    const last = hist[hist.length - 1];
    expect(last.role).toBe("assistant");
    expect(last.content).toBe("你好，世界");
    expect(JSON.stringify(hist)).not.toContain("(无内容)");
    expect(hist.some((m) => m._streaming)).toBe(false);
    win.close();
  });
});

describe("② 工具模式也流式", () => {
  it("请求同时带 stream:true 与 tools，且工具轮开场文字与 tool_calls 一起入历史", async () => {
    const win = await boot({ tools: true });
    const toolRuns = [];
    win.execToolAuto = async (name, args) => { toolRuns.push({ name, args }); return '{"ok":true}'; };
    const sent = scriptedFetch(win, [
      sseResponse([
        'data: {"choices":[{"delta":{"content":"我先查一下"}}]}\n\n',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"list_tasks","arguments":"{\\"scenario\\":\\"office\\"}"}}]},"finish_reason":"tool_calls"}]}\n\n',
        "data: [DONE]\n\n",
      ]),
      sseResponse([
        'data: {"choices":[{"delta":{"content":"完成"},"finish_reason":"stop"}]}\n\n',
        "data: [DONE]\n\n",
      ]),
    ]);
    const hist = await runOnce(win, "看看任务");

    /* 请求侧：工具模式下流式与 tools 同时打开 */
    expect(sent[0].stream).toBe(true);
    expect(Array.isArray(sent[0].tools) && sent[0].tools.length > 0).toBe(true);

    /* 执行侧：tool_calls delta 被完整拼装并真的执行了一次 */
    expect(toolRuns.length).toBe(1);
    expect(toolRuns[0].name).toBe("list_tasks");

    /* 历史侧：开场文字保留在带 tool_calls 的 assistant 消息里，工具回执与收尾文本都在 */
    const toolTurn = hist.find((m) => m.role === "assistant" && m.tool_calls && m.tool_calls.length);
    expect(toolTurn, "应有一条带 tool_calls 的 assistant 消息").toBeTruthy();
    expect(toolTurn.content).toBe("我先查一下");
    expect(hist.some((m) => m.role === "tool" && m.tool_call_id === "call_1")).toBe(true);
    const texts = assistants(hist).map((m) => m.content);
    expect(texts).toContain("完成");
    expect(texts.join("|")).not.toContain("(无内容)");
    expect(hist.some((m) => m._streaming)).toBe(false);
    win.close();
  });

  it("服务端不支持 SSE（回 JSON）时整包路径不受影响", async () => {
    const win = await boot({ tools: true });
    scriptedFetch(win, [jsonResponse({ choices: [{ message: { role: "assistant", content: "整包回复" } }] })]);
    const hist = await runOnce(win, "hi");
    const last = hist[hist.length - 1];
    expect(last.content).toBe("整包回复");
    expect(hist.some((m) => m._streaming)).toBe(false);
    win.close();
  });
});
