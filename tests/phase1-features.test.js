/**
 * 第 1 期转正收尾 · 回归验证（v1.12）
 * ----------------------------------------------------------------------------
 * ① 事件源扩展：task_create / task_delete（execTool 路径）触发自动化规则；
 * ② 语音模块转正：默认意图处理器注册后 executeVoiceCommand 可创建/完成任务；
 * ③ UI 入口：自动化弹窗含 Webhook 订阅面板、OAuth 连接面板与测试规则按钮。
 */

import { describe, it, expect, beforeEach } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

function freshWin() {
  const win = loadApp();
  win.localStorage.clear();
  return win;
}
const BASE = { sc: "code", status: "todo", doneAt: null, priority: "P0", note: "", tags: [], created: Date.now(), due: "" };

describe("第 1 期 · 事件源扩展（task_create / task_delete）", () => {
  let win;
  beforeEach(() => { win = freshWin(); });

  it("execTool create_task 触发 task_create 规则", () => {
    win.__test._automationRules.push({
      id: "r-c", enabled: true, trigger: { type: "task_create" },
      actions: [{ type: "create_task", title: "创建链任务" }],
    });
    win.__test.execTool("create_task", { scenario: "office", title: "AI 建的任务" });
    expect(win.__test.getTasks().some((t) => t.title === "创建链任务"), "创建事件应触发规则").toBe(true);
  });

  it("execTool delete_task（force）触发 task_delete 规则", () => {
    win.__test.setTasks([{ id: "d1", ...BASE, title: "待删任务" }]);
    win.__test._automationRules.push({
      id: "r-d", enabled: true, trigger: { type: "task_delete" },
      actions: [{ type: "create_task", title: "删除链任务" }],
    });
    const r = JSON.parse(win.__test.execTool("delete_task", { task_id: "待删任务" }, true));
    expect(r.ok).toBe(true);
    expect(win.__test.getTasks().some((t) => t.title === "删除链任务"), "删除事件应触发规则").toBe(true);
  });

  it("回收站永久清除不触发 task_delete（契约：无任务对象的批量操作不发事件）", () => {
    win.__test._automationRules.push({
      id: "r-x", enabled: true, trigger: { type: "task_delete" },
      actions: [{ type: "create_task", title: "不应出现" }],
    });
    // clearRecycle 直接清空（无单任务对象）——按设计不发事件
    const tasks = win.__test.getTasks();
    tasks.push({ id: "z1", ...BASE, title: "回收站任务", deletedAt: Date.now() });
    win.__test.setTasks(tasks);
    win.clearRecycle();
    expect(win.__test.getTasks().some((t) => t.title === "不应出现")).toBe(false);
  });
});

describe("第 1 期 · 语音意图处理器（新模块转正）", () => {
  let win;
  beforeEach(() => { win = freshWin(); });

  it("CREATE_TASK 意图经 executeVoiceCommand 创建任务", () => {
    const r = win.executeVoiceCommand({ intent: "create_task", args: { title: "语音创建的任务" }, raw: "帮我创建任务 语音创建的任务" });
    expect(r.ok).toBe(true);
    expect(win.__test.getTasks().some((t) => t.title === "语音创建的任务")).toBe(true);
  });

  it("COMPLETE_TASK 意图按标题匹配完成任务", () => {
    win.__test.setTasks([{ id: "v1", ...BASE, title: "语音要完成的任务" }]);
    const r = win.executeVoiceCommand({ intent: "complete_task", args: {}, raw: "语音要完成的任务" });
    expect(r.ok).toBe(true);
    expect(win.__test.getTasks().find((t) => t.title === "语音要完成的任务").status).toBe("done");
  });

  it("未注册意图（SET_REMINDER）返回 not_implemented 类错误", () => {
    const r = win.executeVoiceCommand({ intent: "set_reminder", args: {}, raw: "x" });
    expect(r.ok).toBe(false);
  });
});

describe("第 1 期 · 自动化弹窗 UI 入口", () => {
  let win;
  beforeEach(() => { win = freshWin(); });

  it("弹窗含：task_delete 触发选项、测试规则按钮、Webhook 订阅面板、OAuth 连接面板", () => {
    win.openAutomationModal();
    const body = win.document.querySelector("#automationModalBody");
    expect(body).toBeTruthy();
    const html = body.innerHTML;
    expect(html).toContain('value="task_delete"');
    expect(html).toContain('id="btnAutoTestRule"');
    expect(html).toContain("Webhook 订阅");
    expect(html).toContain('id="btnWhBusAdd"');
    expect(html).toContain("OAuth 连接");
    expect(html).toContain('id="btnO2Add"');
  });

  it("Webhook 订阅按钮：非法 URL 拒绝、合法 URL 注册后列表可回显", () => {
    win.openAutomationModal();
    win.document.querySelector("#whBusEventType").value = "task_complete";
    win.document.querySelector("#whBusUrl").value = "https://example.com/hook";
    win.document.querySelector("#btnWhBusAdd").click();
    const subs = win.__test.webhookListSubscriptions();
    expect(subs.some((s) => s.callbackUrl === "https://example.com/hook" && s.eventType === "task_complete")).toBe(true);
    // 非法 URL（ftp）
    win.openAutomationModal();
    win.document.querySelector("#whBusUrl").value = "ftp://bad/x";
    win.document.querySelector("#btnWhBusAdd").click();
    expect(win.__test.webhookListSubscriptions().length).toBe(1);
  });
});
