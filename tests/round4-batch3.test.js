import { describe, it, expect, beforeEach } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

/**
 * 第四轮 批次③ · B6 undo/redo 操作历史栈
 * -------------------------------------------------------------
 */
describe("B6 · undo/redo 操作历史栈", () => {
  let win, __test;
  beforeEach(async () => {
    win = await loadApp();
    __test = win.__test;
    __test.clearUndoStack();
    __test.setTasks([]);
    __test.clearUndoStack(); // setTasks([]) 也会记录快照，测试从干净栈开始
  });

  function createTask(title) {
    return JSON.parse(__test.execTool("create_task", { scenario: "office", title }, true));
  }

  it("创建任务后可撤销（回到创建前状态）", () => {
    createTask("撤销测试");
    expect(__test.getTasks().filter(t => !t.deletedAt).length).toBe(1);
    expect(__test.canUndo()).toBe(true);
    const ok = __test.undoTasks();
    expect(ok).toBe(true);
    expect(__test.getTasks().filter(t => !t.deletedAt).length).toBe(0);
  });

  it("撤销后可重做", () => {
    createTask("重做测试");
    __test.undoTasks();
    expect(__test.canRedo()).toBe(true);
    const ok = __test.redoTasks();
    expect(ok).toBe(true);
    expect(__test.getTasks().filter(t => !t.deletedAt).length).toBe(1);
    expect(__test.getTasks().find(t => t.title === "重做测试")).not.toBeUndefined();
  });

  it("新操作清空重做栈", () => {
    createTask("任务1");
    __test.undoTasks();
    expect(__test.canRedo()).toBe(true);
    createTask("任务2"); // 新操作
    expect(__test.canRedo()).toBe(false);
  });

  it("编辑任务可撤销（回到编辑前标题）", () => {
    const t = createTask("原标题");
    __test.updateTask(t.id, { title: "新标题" });
    __test.undoTasks();
    expect(__test.getTasks().find(x => x.id === t.id).title).toBe("原标题");
  });

  it("删除任务可撤销（恢复软删任务）", () => {
    const t = createTask("删除测试");
    __test.execTool("delete_task", { task_id: t.id }, true);
    expect(__test.getTasks().find(x => x.id === t.id).deletedAt).not.toBeNull();
    __test.undoTasks();
    expect(__test.getTasks().find(x => x.id === t.id).deletedAt).toBeUndefined();
  });

  it("空栈时撤销/重做返回 false", () => {
    expect(__test.undoTasks()).toBe(false);
    expect(__test.redoTasks()).toBe(false);
  });

  it("undo/redo 恢复本身不产生新历史（防重入）", () => {
    createTask("防重入测试");
    const before = __test.canUndo();
    __test.undoTasks();
    __test.redoTasks();
    // 恢复操作不应额外堆栈增长：此时再撤销应回到「任务不存在」状态
    __test.undoTasks();
    expect(__test.getTasks().filter(t => !t.deletedAt).length).toBe(0);
    expect(before).toBe(true);
  });

  it("clearUndoStack 后不可撤销", () => {
    createTask("清栈测试");
    __test.clearUndoStack();
    expect(__test.canUndo()).toBe(false);
    expect(__test.undoTasks()).toBe(false);
  });

  it("历史栈上限 50：超过后最旧快照被丢弃", () => {
    for (let i = 0; i < 60; i++) createTask("任务" + i);
    let count = 0;
    while (__test.undoTasks()) count++;
    expect(count).toBe(50);
  });
});
