/**
 * ai-undo.test.js —— AI 改动的回执与撤销（2026-10-22，PRODUCT §7.3）
 * ----------------------------------------------------------------------------
 * 原则是"没有 undo 的写操作不允许上线"。本版覆盖**任务级**四种可逆写：
 *   创建 → 撤销 = 软删除（进回收站，仍可再恢复）
 *   更新 → 撤销 = 回到更新前的快照（status/doneAt/priority/due/tags）
 *   完成 → 撤销 = 回到之前的 status/doneAt
 *   删除 → 撤销 = 清除 deletedAt（从回收站恢复）
 * 边界：完成操作触发的联动规则新建的任务不连带撤销（见实现注释与文档）。
 * 判据用**任务数据与回执状态**，不只看 UI；UI 另有一条点击路径。
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

const windows = [];
afterEach(() => windows.splice(0).forEach((win) => win.close()));

async function boot() {
  const win = loadApp();
  windows.push(win);
  await vi.waitFor(() => expect(win.document.getElementById("chatPanel")._bound).toBe(true));
  return win;
}

const run = (win, name, args) => JSON.parse(win.execTool(name, Object.assign({ force: true }, args)));
const findTask = (win, id) => win.getTasks().find((x) => x.id === id);
const receipts = (win) => win.aiUndoList();
const lastId = (win) => receipts(win)[0] && receipts(win)[0].id;

describe("AI 改动回执与撤销", () => {
  it("创建 → 回执落账；撤销 = 软删除", async () => {
    const win = await boot();
    const r = run(win, "create_task", { title: "AI 建的任务", scenario: "office" });
    expect(r.ok).toBe(true);
    const id = r.id;
    expect(findTask(win, id).deletedAt, "创建后应未删除").toBeFalsy();
    const rec = receipts(win)[0];
    expect(rec.kind).toBe("create");
    expect(rec.taskId).toBe(id);

    const u = win.undoAiAction(rec.id);
    expect(u.ok).toBe(true);
    expect(findTask(win, id).deletedAt, "撤销创建应软删除该任务").toBeTruthy();
    expect(receipts(win)[0].undone).toBe(true);
  });

  it("更新 → 撤销恢复快照（优先与标签）", async () => {
    const win = await boot();
    const id = run(win, "create_task", { title: "原任务", scenario: "office", priority: "P2" }).id;
    const before = findTask(win, id);
    run(win, "update_task", { task_id: id, priority: "P0", tags: ["紧急"], due: "2026-12-31" });
    expect(findTask(win, id).priority).toBe("P0");

    expect(win.undoAiAction(lastId(win)).ok).toBe(true);
    const after = findTask(win, id);
    expect(after.priority).toBe("P2");
    expect(after.tags).toEqual(before.tags);
    expect(after.due).toBe(before.due);
  });

  it("完成 → 撤销回到之前的 status/doneAt", async () => {
    const win = await boot();
    const id = run(win, "create_task", { title: "要做完的任务", scenario: "office" }).id;
    run(win, "complete_task", { task_id: id });
    expect(findTask(win, id).status).toBe("done");
    expect(findTask(win, id).doneAt).toBeTruthy();

    expect(win.undoAiAction(lastId(win)).ok).toBe(true);
    const t = findTask(win, id);
    expect(t.status).toBe("todo");
    expect(t.doneAt).toBeFalsy();
  });

  it("删除 → 撤销 = 从回收站恢复", async () => {
    const win = await boot();
    const id = run(win, "create_task", { title: "会被删的任务", scenario: "office" }).id;
    run(win, "delete_task", { task_id: id });
    expect(findTask(win, id).deletedAt).toBeTruthy();

    expect(win.undoAiAction(lastId(win)).ok).toBe(true);
    expect(findTask(win, id).deletedAt).toBeFalsy();
  });

  it("二次撤销与未知回执都如实拒绝（不许假成功）", async () => {
    const win = await boot();
    run(win, "create_task", { title: "只撤一次", scenario: "office" });
    const id = lastId(win);
    expect(win.undoAiAction(id).ok).toBe(true);
    const again = win.undoAiAction(id);
    expect(again.ok).toBe(false);
    expect(again.msg).toBeTruthy();
    expect(win.undoAiAction("no-such-id").ok).toBe(false);
  });

  it("UI：回执条出现，点「撤销」后任务进回收站、回执消失", async () => {
    const win = await boot();
    const r = run(win, "create_task", { title: "UI 撤销", scenario: "office" });
    expect(win.document.getElementById("aiReceipts"), "回执条应已挂载").toBeTruthy();
    /* 按钮上的 data-ai-undo 是**回执 id**（不是任务 id） */
    const anyBtn = win.document.querySelector("#aiReceipts [data-ai-undo]");
    expect(anyBtn, "应渲染撤销按钮").toBeTruthy();
    anyBtn.click();
    await vi.waitFor(() => {
      expect(findTask(win, r.id).deletedAt, "点撤销后应软删除").toBeTruthy();
      expect(win.document.getElementById("aiReceipts"), "没有未撤销回执时应移除回执条").toBeFalsy();
    });
  });
});
