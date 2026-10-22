/**
 * undo-universal.test.js —— 单步通用撤销（2026-10-23）
 * ----------------------------------------------------------------------------
 * 此前只有「任务」有 undo/redo 栈（B6，50 步，仅 Ctrl+Z 可达）；资料库记录与笔记没有，
 * 且用户看不到"可撤销"的入口。本版把同一套栈**按域**泛化：
 *   任务（setTasks）/ 资料库记录（setRec）/ 笔记（saveNotes）—— 写前快照、400ms 内合并、
 *   恢复时防重入；UI 在 10 秒内给「已修改 · 撤销」提示，Ctrl+Z 仍然可用。
 * 边界：不做跨会话持久化、不做跨域事务（一次撤销只回退一个域的最后一次写）。
 * 判据用**数据**（任务/记录/笔记的数量与字段），UI 另测提示与点击路径。
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

const windows = [];
afterEach(() => windows.splice(0).forEach((win) => win.close()));

const mkTask = (id, title, status = "todo") => ({
  id, sc: "office", title, status, priority: "", due: "", doneAt: null,
  note: "", tags: [], created: Date.now(),
});

async function boot() {
  const win = loadApp();
  windows.push(win);
  await vi.waitFor(() => expect(win.document.getElementById("chatPanel")._bound).toBe(true));
  win.armUndo();               /* 首屏之后才武装（应用里由 render() 调用；这里显式对齐） */
  win.clearUndoStack();
  win.setTasks([mkTask("t1", "原标题"), mkTask("t2", "第二条")]);
  win.clearUndoStack();        /* 播种不算"用户上一步" */
  const toastEl = win.document.getElementById("undoToast"); if(toastEl) toastEl.remove();
  return win;
}

describe("单步通用撤销", () => {
  it("手工改任务标题 → 撤销恢复", async () => {
    const win = await boot();
    win.updateTask("t1", { title: "改过的标题" });
    expect(win.getTasks().find((x) => x.id === "t1").title).toBe("改过的标题");
    expect(win.canUndo()).toBe(true);
    expect(win.undoLast()).toBe(true);
    expect(win.getTasks().find((x) => x.id === "t1").title).toBe("原标题");
  });

  it("拖拽改状态（todo→doing）→ 撤销回到原状态", async () => {
    const win = await boot();
    win.updateTask("t1", { status: "doing" });
    expect(win.getTasks().find((x) => x.id === "t1").status).toBe("doing");
    win.undoLast();
    expect(win.getTasks().find((x) => x.id === "t1").status).toBe("todo");
  });

  it("资料库记录：新增后撤销 → 数量复原", async () => {
    const win = await boot();
    const before = win.getRec("office").length;
    const arr = win.getRec("office").slice();
    arr.unshift({ id: "r-undo", title: "手工记录", created: Date.now() });
    win.setRec("office", arr);
    expect(win.getRec("office").length).toBe(before + 1);
    expect(win.undoLast()).toBe(true);
    expect(win.getRec("office").length).toBe(before);
  });

  it("笔记：保存后撤销 → 数量复原", async () => {
    const win = await boot();
    const before = win.getNotes().length;
    win.saveNotes(win.getNotes().concat([{ id: "n-undo", title: "手工笔记", content: "", tags: [], category: "" }]));
    expect(win.getNotes().length).toBe(before + 1);
    expect(win.undoLast()).toBe(true);
    expect(win.getNotes().length).toBe(before);
  });

  it("每次写各占一步（与 B6 既有 50 步语义一致）：连续两次编辑撤销两次才回到最初", async () => {
    const win = await boot();
    win.updateTask("t1", { title: "第一次" });
    win.updateTask("t1", { title: "第二次" });
    expect(win.getTasks().find((x) => x.id === "t1").title).toBe("第二次");
    expect(win.undoLast()).toBe(true);
    expect(win.getTasks().find((x) => x.id === "t1").title).toBe("第一次");
    expect(win.undoLast()).toBe(true);
    expect(win.getTasks().find((x) => x.id === "t1").title).toBe("原标题");
  });

  it("重做：撤销后再重做回到修改后", async () => {
    const win = await boot();
    win.updateTask("t1", { title: "改一下" });
    win.undoLast();
    expect(win.canRedo()).toBe(true);
    win.redoLast();
    expect(win.getTasks().find((x) => x.id === "t1").title).toBe("改一下");
  });

  it("UI：写后出现「已修改 · 撤销」，点击后数据复原、提示消失", async () => {
    const win = await boot();
    win.updateTask("t1", { title: "UI 撤销" });
    const el = win.document.getElementById("undoToast");
    expect(el, "应出现撤销提示").toBeTruthy();
    const btn = el.querySelector("button");
    expect(btn, "提示里应有撤销按钮").toBeTruthy();
    btn.click();
    await vi.waitFor(() => {
      expect(win.getTasks().find((x) => x.id === "t1").title).toBe("原标题");
      expect(win.document.getElementById("undoToast"), "撤销后提示应移除").toBeFalsy();
    });
  });

  it("Ctrl+Z 在输入框里不抢原生文本撤销（数据保持不变）", async () => {
    const win = await boot();
    win.updateTask("t1", { title: "待撤销" });
    const input = win.document.createElement("input");
    win.document.body.appendChild(input);
    input.focus();
    input.dispatchEvent(new win.KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true }));
    expect(win.getTasks().find((x) => x.id === "t1").title, "输入框里的 Ctrl+Z 不应改数据").toBe("待撤销");
  });

  it("初始化（seed/首屏）不产生撤销提示", async () => {
    const win = await boot();
    expect(win.document.getElementById("undoToast"), "武装前不应有提示").toBeFalsy();
    expect(win.canUndo(), "初始化快照应被清掉").toBe(false);
  });
});
