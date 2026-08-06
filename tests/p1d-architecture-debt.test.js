/**
 * P1-d 架构耐久债 · 回归验证
 * ----------------------------------------------------------------------------
 * 验证两项架构耐久债已修复：
 *   ① search 软删泄漏：getTasks() 软删除任务（deletedAt 存在）不应出现在搜索结果。
 *   ② TOOLS schema 与 execTool 实际契约对齐：
 *      complete_task / update_task / delete_task 在 TOOLS 中曾声明 keyword 参数，
 *      但 execTool 实际读取 args.task_id（findTask 支持 id 或标题回退）。
 *      该漂移导致 AI 发出的 keyword 入参被忽略 → "未找到匹配任务：undefined"，
 *      AI 永远无法 complete/update/delete。修复后 schema 改 task_id（force 保持内部确认参数，不入 schema）。
 *
 * 设计原则（遵循 test-discipline / anti-gaming）：
 *  - 黑盒优先：经 jsdom 全局访问 window.__test.execTool / TOOLS / setTasks。
 *  - 不修改任何生产文件；本文件为新增测试。
 *  - 断言「可观测行为」：搜索结果集合、TOOLS 参数契约、execTool 返回结构。
 *
 * 运行：npx vitest run tests/p1d-architecture-debt.test.js
 */

import { describe, it, expect, beforeEach } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

function freshWin() {
  const win = loadApp();
  win.localStorage.clear();
  return win;
}

const BASE = { sc: "code", status: "todo", doneAt: null, priority: "P0", note: "", tags: [], created: Date.now(), due: "" };

describe("P1-d 架构耐久债", () => {
  let win;
  beforeEach(() => { win = freshWin(); });

  function setTasks(arr) { win.__test.setTasks(arr); }

  it("search 排除软删除任务（deletedAt 不进入结果）", () => {
    setTasks([
      { id: "a", ...BASE, title: "修复登录页 500" },
      { id: "b", ...BASE, title: "修复登录页 旧版本", status: "done", doneAt: Date.now(), deletedAt: Date.now() },
    ]);
    const res = JSON.parse(win.__test.execTool("search", { query: "登录页" }));
    const titles = res.tasks.map((t) => t.title);
    expect(titles, "活跃任务应命中").toContain("修复登录页 500");
    expect(titles, "软删任务不应泄漏").not.toContain("修复登录页 旧版本");
  });

  it("TOOLS：complete/update/delete 不再声明 keyword，改 task_id 且 required 含 task_id", () => {
    const byName = Object.fromEntries(win.__test.TOOLS.map((t) => [t.function.name, t.function]));
    for (const name of ["complete_task", "update_task", "delete_task"]) {
      const fn = byName[name];
      expect(fn, `TOOLS 应含 ${name}`).toBeTruthy();
      expect(fn.parameters.properties, `${name} 不应再有 keyword 参数`).not.toHaveProperty("keyword");
      expect(fn.parameters.properties, `${name} 应声明 task_id 参数`).toHaveProperty("task_id");
      expect(fn.parameters.required, `${name} required 应含 task_id`).toContain("task_id");
    }
  });

  it("execTool 以 task_id 标题回退可匹配：complete→ok，delete→confirm（而非未找到）", () => {
    setTasks([{ id: "c", ...BASE, title: "修复登录页 500" }]);
    const done = JSON.parse(win.__test.execTool("complete_task", { task_id: "登录页" }));
    expect(done.ok, "complete 应成功匹配并完成").toBe(true);

    const del = JSON.parse(win.__test.execTool("delete_task", { task_id: "登录页" }));
    expect(del.ok, "未带 force 应进入确认流程").toBe(false);
    expect(del.confirm, "匹配成功应返回确认提示").toBeTruthy();
    // 确认路径由 confirm 字段表达（见 html:566），不携带 not-found 文案（not-found 路径才带 msg）
    expect(del.msg, "确认路径不应携带 not-found 文案（msg 字段仅 not-found/success 路径出现）").toBeUndefined();
  });

  it("execTool 只认 task_id：传 keyword 入参被忽略（契约不变量）", () => {
    setTasks([{ id: "d", ...BASE, title: "修复登录页 500" }]);
    const r = JSON.parse(win.__test.execTool("complete_task", { keyword: "登录页" }));
    expect(r.ok, "keyword 不是有效入参").toBe(false);
    expect(r.msg, "代码读 task_id，keyword 应被识别为未找到").toMatch(/未找到匹配任务：undefined/);
  });
});
