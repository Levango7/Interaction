import { describe, it, expect, beforeEach } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

/**
 * 第四轮 批次② · B4 看板拖拽排序 / B5 看板卡片键盘操作
 * -------------------------------------------------------------
 */
describe("B4 · reorderTask 数据层", () => {
  let win, __test;
  beforeEach(async () => {
    win = await loadApp();
    __test = win.__test;
    __test.setTasks([]); // 清空种子数据
    __test.execTool("create_task", { scenario: "office", title: "任务A" }, true);
    __test.execTool("create_task", { scenario: "office", title: "任务B" }, true);
    __test.execTool("create_task", { scenario: "office", title: "任务C" }, true);
  });
  const byTitle = (t) => __test.getTasks().find(x => x.title === t);

  it("同列拖拽：把任务A移到任务C之前", () => {
    const a = byTitle("任务A"), c = byTitle("任务C");
    const ok = __test.reorderTask(a.id, c.id, "todo");
    expect(ok).toBe(true);
    const order = __test.getTasks().filter(x => !x.deletedAt).map(x => x.title);
    expect(order.indexOf("任务A")).toBeLessThan(order.indexOf("任务C"));
  });

  it("beforeId 为 null 时移到末尾", () => {
    const a = byTitle("任务A");
    __test.reorderTask(a.id, null, "todo");
    const list = __test.getTasks().filter(x => !x.deletedAt);
    expect(list[list.length - 1].title).toBe("任务A");
  });

  it("跨列：todo 拖到 doing 改变状态", () => {
    const a = byTitle("任务A");
    __test.reorderTask(a.id, null, "doing");
    expect(byTitle("任务A").status).toBe("doing");
    expect(byTitle("任务A").doneAt).toBeNull();
  });

  it("拖入 done 列触发 completeTask（doneAt 非空）", () => {
    const a = byTitle("任务A");
    __test.reorderTask(a.id, null, "done");
    const t = byTitle("任务A");
    expect(t.status).toBe("done");
    expect(t.doneAt).not.toBeNull();
  });

  it("不存在的任务返回 false", () => {
    expect(__test.reorderTask("no-such", null, "todo")).toBe(false);
  });

  it("已软删任务不可重排", () => {
    const a = byTitle("任务A");
    __test.execTool("delete_task", { task_id: a.id }, true);
    expect(__test.reorderTask(a.id, null, "todo")).toBe(false);
  });
});

describe("B4 · 看板 DOM 拖拽属性", () => {
  let win, __test;
  beforeEach(async () => {
    win = await loadApp();
    __test = win.__test;
    __test.setTasks([]);
    __test.execTool("create_task", { scenario: "office", title: "拖拽测试" }, true);
    __test.setActive("office");
    __test.render();
  });

  it("看板卡片带 draggable / data-drag / tabindex 属性", () => {
    const card = win.document.querySelector(".kcard[data-drag]");
    expect(card).not.toBeNull();
    expect(card.getAttribute("draggable")).toBe("true");
    expect(card.getAttribute("tabindex")).toBe("0");
    expect(card.hasAttribute("aria-label")).toBe(true);
  });

  it("看板列带 data-drop 落点属性", () => {
    const cols = win.document.querySelectorAll(".kcol[data-drop]");
    expect(cols.length).toBe(3);
    const drops = [...cols].map(c => c.getAttribute("data-drop"));
    expect(drops).toEqual(expect.arrayContaining(["todo", "doing", "done"]));
  });
});

describe("B5 · 看板卡片键盘操作", () => {
  let win, __test, taskId;
  beforeEach(async () => {
    win = await loadApp();
    __test = win.__test;
    __test.setTasks([]);
    const res = JSON.parse(__test.execTool("create_task", { scenario: "office", title: "键盘测试" }, true));
    taskId = res.id;
    __test.setActive("office");
    __test.render();
  });
  const card = () => win.document.querySelector(`.kcard[data-drag="${taskId}"]`);

  function pressKey(el, key) {
    el.dispatchEvent(new win.KeyboardEvent("keydown", { key, bubbles: true }));
  }

  it("卡片可聚焦（tabindex=0）", () => {
    expect(card().getAttribute("tabindex")).toBe("0");
  });

  it("Enter 打开任务编辑弹窗", () => {
    pressKey(card(), "Enter");
    expect(win.document.getElementById("taskEditModal")).not.toBeNull();
  });

  it("Delete 软删任务（进回收站）", () => {
    pressKey(card(), "Delete");
    const t = __test.getTasks().find(x => x.id === taskId);
    expect(t.deletedAt).not.toBeUndefined();
    expect(t.deletedAt).not.toBeNull();
  });
});
