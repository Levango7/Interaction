/**
 * rag-undo.test.js —— 知识库文件写操作纳入通用撤销（2026-10-23）
 * ----------------------------------------------------------------------------
 * 覆盖两条用户路径：导入（含同名替换）与删除；撤销/重做要恢复**整个文件列表（含块）**，
 * 并触发索引重同步（emitDataMutate("import")）。另钉两个易错点：
 *   · 写失败（配额）不得留下"假撤销步"；
 *   · 跨域隔离：撤销 rag 不能动任务栈。
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

const windows = [];
afterEach(() => windows.splice(0).forEach((win) => win.close()));

const boot = () => {
  const win = loadApp({ storage: { wb_agent_onboarded: "true" } });
  windows.push(win);
  win.clearUndoStack();
  return win;
};

describe("知识库文件撤销", () => {
  it("导入 → 撤销移除整份文件 → 重做恢复（含块）", async () => {
    const win = boot();
    win.armUndo();
    const r = await win.ragImportText("备忘.txt", "第一段\n\n第二段", { preExtracted: true });
    expect(r).not.toBeNull();
    expect(win.getRagFiles()).toHaveLength(1);
    const toast = win.document.getElementById("undoToast");
    expect(toast, "导入后应出现撤销入口").toBeTruthy();
    expect(toast.textContent).toContain("文件知识");

    expect(win.undoLast()).toBe(true);
    expect(win.getRagFiles()).toHaveLength(0);
    expect(win.redoLast()).toBe(true);
    const f = win.getRagFiles()[0];
    expect(f.name).toBe("备忘.txt");
    expect(f.chunks.length).toBeGreaterThan(0);
  });

  it("删除 → 撤销恢复文件与块", async () => {
    const win = boot();
    await win.ragImportText("合同.txt", "条款一\n\n条款二", { preExtracted: true });
    const id = win.getRagFiles()[0].id;
    win.ragDeleteFile(id);
    expect(win.getRagFiles()).toHaveLength(0);
    expect(win.undoLast()).toBe(true);
    expect(win.getRagFiles()).toHaveLength(1);
    expect(win.getRagFiles()[0].name).toBe("合同.txt");
  });

  it("同名替换 → 撤销恢复旧内容", async () => {
    const win = boot();
    await win.ragImportText("同名.txt", "旧内容", { preExtracted: true });
    await win.ragImportText("同名.txt", "新内容", { preExtracted: true });
    expect(win.getRagFiles()[0].chunks[0].text).toContain("新内容");
    expect(win.undoLast()).toBe(true);
    expect(win.getRagFiles()[0].chunks[0].text).toContain("旧内容");
  });

  it("写失败（配额）不产生假撤销步", () => {
    const win = boot();
    win.armUndo();
    const proto = win.Storage.prototype;
    const orig = proto.setItem;
    proto.setItem = function (k, v) {
      if (/rag_files/.test(k)) throw new Error("QuotaExceededError");
      return orig.call(this, k, v);
    };
    try {
      expect(win.saveRagFiles([{ id: "x", name: "x.txt", chunks: [] }])).toBe(false);
    } finally {
      proto.setItem = orig;
    }
    expect(win.canUndo()).toBe(false);
  });

  it("跨域隔离：撤销 rag 不影响任务栈", async () => {
    const win = boot();
    await win.ragImportText("a.txt", "正文", { preExtracted: true });
    win.setTasks([{ id: "t1", sc: "office", title: "任务A", status: "todo", created: Date.now() }]);
    expect(win.undoLast()).toBe(true); // 先撤任务
    expect(win.getTasks().some((t) => t.id === "t1")).toBe(false);
    expect(win.getRagFiles()).toHaveLength(1); // rag 不受影响
    expect(win.undoLast()).toBe(true); // 再撤 rag
    expect(win.getRagFiles()).toHaveLength(0);
  });
});
