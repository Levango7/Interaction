import { describe, it, expect } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

/**
 * AI 层对齐核心价值 · 回归验证（v1.14.1）
 * ----------------------------------------------------------------------------
 * 锁定两项 schema 契约修复：
 *   ① update_task / delete_task 的 force 参数入 schema（可选 boolean，默认 false 仍走二次确认）。
 *   ② add_record.fields 从 SCENARIOS 派生场景子 schema（anyOf），提升模型调用准确率。
 *
 * 设计原则：黑盒优先——经 jsdom 全局 window.__test 访问 TOOLS / execTool / getTasks / setTasks，
 * 断言可观测行为（schema 结构 + execTool 返回 + 存储落盘）。
 */

/** 取全新 window 并清空 storage，获得干净状态（active 仍为默认 "office"） */
function freshWin() {
  const win = loadApp();
  win.localStorage.clear();
  return win;
}

/** 调用 execTool 并解析 JSON 结果 */
function tool(win, name, args) {
  return JSON.parse(win.__test.execTool(name, args || {}));
}

const BASE = { sc: "code", status: "todo", doneAt: null, priority: "P0", note: "", tags: [], created: Date.now(), due: "" };

describe("AI 层对齐（v1.14.1）：force 入 schema + add_record.fields 场景子 schema", () => {
  it("update_task / delete_task schema 声明可选 force（不进 required）", () => {
    const win = freshWin();
    const byName = Object.fromEntries(win.__test.TOOLS.map((t) => [t.function.name, t.function]));
    for (const name of ["update_task", "delete_task"]) {
      const fn = byName[name];
      expect(fn, `TOOLS 应含 ${name}`).toBeTruthy();
      expect(fn.parameters.properties, `${name} 应声明 force`).toHaveProperty("force");
      expect(fn.parameters.properties.force.type, `${name} force 应为 boolean`).toBe("boolean");
      expect(fn.parameters.required, `${name} force 不应进 required（默认 false 仍走确认）`).not.toContain("force");
    }
  });

  it("add_record.fields 含 4 个内置场景的 anyOf 子 schema（键随场景）", () => {
    const win = freshWin();
    const add = win.__test.TOOLS.find((t) => t.function.name === "add_record").function;
    const fields = add.parameters.properties.fields;
    expect(fields.anyOf, "fields 应有 anyOf 场景子 schema").toBeTruthy();
    expect(fields.anyOf.length, "内置场景应为 4 个").toBe(4);

    const office = fields.anyOf.find((o) => (o.description || "").includes("办公"));
    expect(office.properties, "办公字段应含 title/who/note").toMatchObject({
      title: expect.any(Object),
      who: expect.any(Object),
      note: expect.any(Object),
    });

    const code = fields.anyOf.find((o) => (o.description || "").includes("编程"));
    expect(code.properties, "编程字段应含 lang/title/code").toMatchObject({
      lang: expect.any(Object),
      title: expect.any(Object),
      code: expect.any(Object),
    });
  });

  it("execTool 经 args.force=true 跳过二次确认直接软删除", () => {
    const win = freshWin();
    win.__test.setTasks([{ id: "f1", ...BASE, title: "待删任务" }]);
    const del = tool(win, "delete_task", { task_id: "待删任务", force: true });
    expect(del.ok, "force 删除应成功").toBe(true);
    expect(win.__test.getTasks().find((t) => t.id === "f1").deletedAt, "force 删除应置 deletedAt").toBeTruthy();
  });

  it("不带 force 仍走确认流程（不变量：未确认不落地）", () => {
    const win = freshWin();
    win.__test.setTasks([{ id: "f2", ...BASE, title: "确认任务" }]);
    const del = tool(win, "delete_task", { task_id: "确认任务" });
    expect(del.ok, "未带 force 应进入确认流程").toBe(false);
    expect(del.confirm, "应返回确认提示").toBeTruthy();
    expect(win.__test.getTasks().find((t) => t.id === "f2").deletedAt, "未确认不应删除").toBeFalsy();
  });
});
