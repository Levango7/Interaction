/**
 * 步数耗尽可见化（v3.7.157 修复批）——此前 guard 打满即静默退出，用户分不清
 * 「说完了」还是「被掐停」。现在：自然收尾才不算被掐停；cap 消息明确给出上限与「继续」的出路。
 *
 * 触发方式：fetch 恒返带 tool_calls 的 assistant 消息（模型永远想继续调工具），
 * 把 cfg.agentLoops 压到 2，让循环必撞上上限。
 */
import { describe, it, expect } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

const PREFIX = "wb_agent_";
async function boot() {
  const win = loadApp();
  await new Promise((r) => setTimeout(r, 80));
  return win;
}
function setupAiProfile(win) {
  win.__test._resetCrypto();
  win.localStorage.setItem(PREFIX + "cfg", JSON.stringify({
    enabled: true,
    profiles: [{ id: "p1", name: "Test", base: "https://api.test.com/v1", key: "sk-test", model: "gpt-4o-mini" }],
    activeId: "p1",
  }));
}
const setFetch = (win, fn) => Object.defineProperty(win, "fetch", { value: fn, writable: true, configurable: true });

describe("步数耗尽可见化", () => {
  it("循环打满上限 → 出现 _capped 提示消息（含上限数字与「继续」出路）", async () => {
    const win = await boot();
    setupAiProfile(win);
    win.__test.setActive("office");
    win.__test.render();
    // 模型永远想继续调 list_tasks（只读工具，jsdom 可执行）
    setFetch(win, () => Promise.resolve({
      status: 200, ok: true,
      json: () => Promise.resolve({
        choices: [{ message: { role: "assistant", content: "", tool_calls: [{ id: "t1", function: { name: "list_tasks", arguments: "{}" } }] } }],
      }),
    }));
    const { runChatLoop, appendChat, getChat } = win.__test;
    const cfg = JSON.parse(win.localStorage.getItem(PREFIX + "cfg"));
    cfg.agentLoops = 6; // 代码下限是 6（更小的值会被忽略、回落默认）
    win.localStorage.setItem(PREFIX + "cfg", JSON.stringify(cfg));
    appendChat("office", { role: "user", content: "hi" });
    const hist = getChat("office");
    const messages = [{ role: "system", content: "sys" }].concat(hist.map((m) => ({ ...m })));
    await runChatLoop(messages, hist);
    const last = hist[hist.length - 1];
    expect(last._capped).toBe(true);
    expect(last.content).toContain("已达本轮步数上限");
    expect(last.content).toContain("6");
    expect(last.content).toContain("继续");
  });

  it("自然收尾（模型不再调工具）→ 不出现 _capped 消息", async () => {
    const win = await boot();
    setupAiProfile(win);
    win.__test.setActive("office");
    win.__test.render();
    // 模型直接给出最终回复（无 tool_calls）→ 自然收尾
    setFetch(win, () => Promise.resolve({
      status: 200, ok: true,
      json: () => Promise.resolve({
        choices: [{ message: { role: "assistant", content: "好的，已完成。" } }],
      }),
    }));
    const { runChatLoop, appendChat, getChat } = win.__test;
    appendChat("office", { role: "user", content: "hi" });
    const hist = getChat("office");
    const messages = [{ role: "system", content: "sys" }].concat(hist.map((m) => ({ ...m })));
    await runChatLoop(messages, hist);
    const last = hist[hist.length - 1];
    expect(last._capped).toBeUndefined();
    expect(last.content).toBe("好的，已完成。");
  });
});