import { describe, it, expect } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

const PREFIX = "wb_agent_";
async function boot() {
  const win = loadApp({ storage: { [PREFIX + "onboarded"]: "true" } });
  await new Promise((r) => setTimeout(r, 120));
  return win;
}
function tasks(win) { return JSON.parse(win.localStorage.getItem(PREFIX + "tasks") || "[]"); }
async function submit(win, text) {
  const input = win.document.querySelector("#chatTextInput");
  input.value = text;
  input.dispatchEvent(new win.Event("input", { bubbles: true }));
  await win.onChatSubmit({ preventDefault() {}, target: { msg: input } });
  await new Promise((r) => setTimeout(r, 40));
}

describe("NL 建任务意图：通用『做』不得脱离任务名词", () => {
  it("误意图：总览/报表/总结/海报均不得命中", async () => {
    const win = await boot();
    for (const text of ["你好，帮我做个总览", "帮我做个报表", "请做个总结", "做个海报"]) {
      expect(win.parseNaturalLanguageTask(text).hit, text).toBe(false);
    }
  });

  it("明确意图：既有四种格式保留字段解析", async () => {
    const win = await boot();
    const a = win.parseNaturalLanguageTask("帮我建个任务：明天下午3点复习数学");
    expect(a.hit).toBe(true);
    expect(a.title).toBe("复习数学");
    expect(a.scenario).toBe("study");
    expect(a.due).toBe(win.shiftDay(1));

    const b = win.parseNaturalLanguageTask("做个任务 下周一开会");
    expect(b.hit).toBe(true);
    expect(b.title).toBe("开会");
    expect(b.scenario).toBe("office");

    const c = win.parseNaturalLanguageTask("创建任务 紧急 写代码");
    expect(c.hit).toBe(true);
    expect(c.title).toBe("写代码");
    expect(c.priority).toBe("P0");
    expect(c.scenario).toBe("code");

    const d = win.parseNaturalLanguageTask("添加任务 跑步");
    expect(d.hit).toBe(true);
    expect(d.title).toBe("跑步");
    expect(d.scenario).toBe("life");
  });

  it("带寒暄的明确意图仍可命中；空标题与完成动作不误入", async () => {
    const win = await boot();
    expect(win.parseNaturalLanguageTask("你好，帮我做个任务：交周报").hit).toBe(true);
    expect(win.parseNaturalLanguageTask("建任务").hit).toBe(false);
    expect(win.parseNaturalLanguageTask("完成任务").hit).toBe(false);
  });
});

describe("NL 建任务提交：持久化与当前会话回执", () => {
  it("误文案经完整提交链仍零任务写入", async () => {
    const win = await boot();
    const before = tasks(win).length;
    await submit(win, "你好，帮我做个总览");
    expect(tasks(win).length).toBe(before);
    expect(win.document.querySelectorAll("#chat .msg.user").length).toBe(1);
    expect(win.document.querySelector("#chat").textContent).toContain("尚未配置 AI 模型");
  });

  it("明确意图恰好新建一条；AppBridge.render 后回执不被禁用 greeting 覆盖", async () => {
    const win = await boot();
    const before = tasks(win).length;
    await submit(win, "你好，帮我做个任务：交周报");
    const after = tasks(win);
    expect(after.length).toBe(before + 1);
    expect(after[after.length - 1].title).toBe("交周报");
    expect(win.document.querySelectorAll("#chat .msg.user").length).toBe(1);
    expect(win.document.querySelector("#chat").textContent).toContain("已为你创建任务");

    // 复现 F1 的最后一跳：无 AI 配置时 AppBridge.render 也会触发 disabled 渲染。
    // AppBridge 是 const 全局而非 window 属性；直接调用其注册的同一个 render 函数。
    win.render();
    expect(win.document.querySelectorAll("#chat .msg.user").length).toBe(1);
    expect(win.document.querySelector("#chat").textContent).toContain("已为你创建任务");

    const msgs = win.getActiveSessionObj().msgs;
    expect(msgs.some((m) => m.role === "user" && m.content === "你好，帮我做个任务：交周报")).toBe(true);
    expect(msgs.some((m) => m.role === "assistant" && String(m.content).includes("已为你创建任务"))).toBe(true);
  });
});
