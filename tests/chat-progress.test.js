/**
 * chat-progress.test.js —— 聊天真实进度条 + 提示词悬停（2026-10-23）
 * ----------------------------------------------------------------------------
 * 进度只认真实数据：流式 onChunk 的字数、工具批次 current/total、计划步骤。
 * 这里同时钉住「流式路径真的在 onChunk 时让进度条可见」与「结束后收起」，
 * 以及 assistant 消息带 _prompt 后渲染出 title（悬停可见）。
 */
import { afterEach, describe, expect, it } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

const PREFIX = "wb_agent_";
const windows = [];
afterEach(() => windows.splice(0).forEach((win) => win.close()));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function boot() {
  const win = loadApp({ storage: { [PREFIX + "onboarded"]: "true" } });
  windows.push(win);
  win.__test._resetCrypto();
  /* enabled:false ⇒ canStream=true（工具模式下才关流式）；chatOnce 被本用例替换 */
  win.localStorage.setItem(PREFIX + "cfg", JSON.stringify({
    enabled: false,
    profiles: [{ id: "p", name: "T", base: "https://api.test/v1", key: "sk-test", model: "m" }],
    activeId: "p",
  }));
  win.__test.setActive("office");
  win.__test.render();
  await wait(30);
  return win;
}

describe("进度条 UI 契约", () => {
  it("计划进度：显示 当前/总数 与百分比；结束收起", async () => {
    const win = await boot();
    const box = win.document.getElementById("chatProgress");
    expect(box).toBeTruthy();
    win.chatProgressStart("plan", "执行计划", 4);
    expect(box.hidden).toBe(false);
    expect(win.document.getElementById("chatProgressLabel").textContent).toContain("0/4");
    win.chatProgressUpdate({ current: 2 });
    expect(win.document.querySelector("#chatProgressBar > i").style.width).toBe("50%");
    expect(win.getChatProgress().percent).toBe(50);
    win.chatProgressEnd();
    expect(box.hidden).toBe(true);
  });

  it("无总数时走不确定态（不伪造百分比）", async () => {
    const win = await boot();
    win.chatProgressStart("stream", "正在生成", 0);
    const box = win.document.getElementById("chatProgress");
    expect(box.classList.contains("indeterminate")).toBe(true);
    win.chatProgressUpdate({ received: 1200 });
    expect(win.document.getElementById("chatProgressLabel").textContent).toContain("1.2k");
    win.chatProgressEnd();
  });
});

describe("真实接线", () => {
  it("流式 onChunk 时进度条可见，结束后收起，assistant 记录 _prompt", async () => {
    const win = await boot();
    let visibleDuringChunk = null;
    let receivedDuringChunk = null;
    win.chatOnce = async (_messages, opts) => {
      opts.onChunk("Hello");
      visibleDuringChunk = !win.document.getElementById("chatProgress").hidden;
      receivedDuringChunk = win.getChatProgress() && win.getChatProgress().received;
      opts.onChunk(" world");
      return { choices: [{ message: { role: "assistant", content: "Hello world" } }] };
    };
    const { runChatLoop, appendChat, getChat } = win.__test;
    appendChat("office", { role: "user", content: "原始提问" });
    const hist = getChat("office");
    const messages = [{ role: "system", content: "sys" }].concat(hist.map((m) => ({ ...m })));
    await runChatLoop(messages, hist);

    expect(visibleDuringChunk, "onChunk 期间进度条必须是可见的").toBe(true);
    expect(receivedDuringChunk).toBeGreaterThan(0);
    expect(win.document.getElementById("chatProgress").hidden).toBe(true);
    const last = hist[hist.length - 1];
    expect(last.role).toBe("assistant");
    expect(last._prompt).toBe("原始提问");
    expect(win.document.querySelector(".msg.assistant[data-prompt]"), "渲染后应带提示词悬停元数据").toBeTruthy();
  }, 15000);

  it("渲染：_prompt 出现在 title；无 _prompt 的历史消息不伪造", async () => {
    const win = await boot();
    win.__test.appendChat("office", { role: "assistant", content: "有提示词", _prompt: "刚才问的事" });
    win.__test.appendChat("office", { role: "assistant", content: "老消息" });
    win.renderChat();
    const withTip = win.document.querySelectorAll(".msg.assistant[data-prompt]");
    expect(withTip.length).toBe(1);
    expect(withTip[0].getAttribute("title")).toContain("刚才问的事");
  });
});
