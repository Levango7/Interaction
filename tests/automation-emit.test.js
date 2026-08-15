/**
 * 任务事件源接线 · 回归验证（v1.11.2 半成品激活①）
 * ----------------------------------------------------------------------------
 * 勘察结论：自动化规则引擎与 Webhook 订阅总线引擎全真，但任务写路径从不发事件——
 * 规则引擎"聋"、webhookEmit 零调用。v1.11.2 在 completeTask 后接 _emitTaskEvent
 * 统一分发（规则 + 总线），带防重入护栏。
 */

import { describe, it, expect, beforeEach } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

function freshWin() {
  const win = loadApp();
  win.localStorage.clear();
  return win;
}
const BASE = { sc: "code", status: "todo", doneAt: null, priority: "P0", note: "", tags: [], created: Date.now(), due: "" };

describe("任务事件源接线（v1.11.2）", () => {
  let win;
  beforeEach(() => { win = freshWin(); });

  it("任务完成触发 task_complete 规则：规则动作 create_task 生效", () => {
    win.__test._automationRules.push({
      id: "r-create", enabled: true,
      trigger: { type: "task_complete", taskKeyword: "锚点" },
      actions: [{ type: "create_task", title: "规则生成任务", scenario: "office" }],
    });
    win.__test.setTasks([{ id: "a1", ...BASE, title: "带锚点的任务" }]);
    expect(win.__test.completeTask("a1")).toBe(true);
    const tasks = win.__test.getTasks();
    expect(tasks.some((t) => t.title === "规则生成任务"), "规则动作应创建任务").toBe(true);
  });

  it("触发器关键词不匹配的完成事件不触发规则", () => {
    win.__test._automationRules.push({
      id: "r-kw", enabled: true,
      trigger: { type: "task_complete", taskKeyword: "不存在的关键词" },
      actions: [{ type: "create_task", title: "不应出现" }],
    });
    win.__test.setTasks([{ id: "a2", ...BASE, title: "普通任务" }]);
    win.__test.completeTask("a2");
    expect(win.__test.getTasks().some((t) => t.title === "不应出现")).toBe(false);
  });

  it("防重入护栏：规则动作 complete_task 引发的连锁完成不再二次分发", () => {
    const win2 = win;
    // R1：完成"锚点"任务 → 完成另一个任务 C
    // R2：任意 task_complete → 创建"由二次规则生成"（若护栏失效，C 的完成会再触发一次 R2）
    win2.__test.setTasks([
      { id: "m1", ...BASE, title: "锚点主任务" },
      { id: "c1", ...BASE, title: "被连锁完成的任务" },
    ]);
    win2.__test._automationRules.push(
      { id: "r-chain", enabled: true, trigger: { type: "task_complete", taskKeyword: "锚点" },
        actions: [{ type: "complete_task", taskId: "c1" }] },
      { id: "r-count", enabled: true, trigger: { type: "task_complete" },
        actions: [{ type: "create_task", title: "由二次规则生成" }] }
    );
    expect(win2.__test.completeTask("m1")).toBe(true);
    const tasks = win2.__test.getTasks();
    expect(tasks.find((t) => t.id === "c1").status, "连锁完成应生效").toBe("done");
    const count = tasks.filter((t) => t.title === "由二次规则生成").length;
    expect(count, "仅主事件分发一次（防重入）").toBe(1);
  });

  it("任务完成向 Webhook 订阅总线发投递（mock httpClient，历史可观测）", async () => {
    const calls = [];
    win.__test.webhookSetHttpClient(async (url, opts) => {
      calls.push({ url, opts });
      return { ok: true, status: 200 };
    });
    const sub = win.__test.webhookRegister("task_complete", "https://example.com/hook");
    expect(sub, "订阅应注册成功").toBeTruthy();
    win.__test.setTasks([{ id: "w1", ...BASE, title: "总线任务" }]);
    expect(win.__test.completeTask("w1")).toBe(true);
    await new Promise((r) => setTimeout(r, 120)); // 投递异步完成
    expect(calls.length, "总线应至少投递一次").toBeGreaterThanOrEqual(1);
    expect(calls[0].url).toBe("https://example.com/hook");
    const body = JSON.parse(calls[0].opts.body);
    expect(body.event || body.type || body.eventType, "投递体应含事件信息").toBeTruthy();
    expect(win.__test.webhookGetHistory().length, "投递历史应可观测").toBeGreaterThanOrEqual(1);
  });
});
