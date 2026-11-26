/**
 * AI 写入的撤销覆盖（v3.7.157 修复批）——此前 generate_doc / add_feature_record / remember / forget
 * 落用户数据却不进撤销账（note_add 有、generate_doc 没有，同类不同命）。
 * 原则：没有 undo 的写操作不允许上线。本批把它们接进同一份回执账，并验证撤销真生效。
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
const receipts = (win) => win.aiUndoList();

describe("AI 写入撤销覆盖", () => {
  it("generate_doc → 回执 note_add；撤销 = 删掉这篇笔记", async () => {
    const win = await boot();
    const r = run(win, "generate_doc", { title: "AI 文档甲", content: "正文", category: "AI 文档" });
    expect(r.ok).toBe(true);
    const noteId = r.id;
    expect(win.getNotes().some((n) => n.id === noteId)).toBe(true);
    const rec = receipts(win)[0];
    expect(rec.kind).toBe("note_add");
    expect(rec.noteId).toBe(noteId);
    const u = win.undoAiAction(rec.id);
    expect(u.ok).toBe(true);
    expect(win.getNotes().some((n) => n.id === noteId)).toBe(false);
  });

  it("add_feature_record → 回执 feature_add（带 feature key）；撤销 = 从该 key 删掉", async () => {
    const win = await boot();
    win.__test.setActive("office");
    const r = run(win, "add_feature_record", { feature: "meeting", fields: { title: "周会", date: "2026-01-01" } });
    expect(r.ok).toBe(true);
    const rec = receipts(win)[0];
    expect(rec.kind).toBe("feature_add");
    expect(rec.key).toBe("meetings");
    const before = win.load("wb_agent_meetings", []);
    expect(before.length).toBe(1);
    const u = win.undoAiAction(rec.id);
    expect(u.ok).toBe(true);
    const after = win.load("wb_agent_meetings", []);
    expect(after.length).toBe(0);
  });

  it("remember → 回执 memory_add；撤销 = 忘掉这条记忆", async () => {
    const win = await boot();
    const r = run(win, "remember", { text: "撤销测试·记忆甲", scope: "global" });
    expect(r.ok).toBe(true);
    const memId = r.id;
    const rec = receipts(win)[0];
    expect(rec.kind).toBe("memory_add");
    expect(rec.memId).toBe(memId);
    const u = win.undoAiAction(rec.id);
    expect(u.ok).toBe(true);
    // 撤销后该记忆应已不存在（recall 不再命中）
    const hits = win.recallMemories("撤销测试·记忆甲", "global", 8);
    expect(hits.some((m) => m.id === memId)).toBe(false);
  });

  it("forget → 回执 memory_del（带原文）；撤销 = 把原文记回来", async () => {
    const win = await boot();
    const r0 = run(win, "remember", { text: "撤销测试·记忆乙", scope: "global" });
    expect(r0.ok).toBe(true);
    const memId = r0.id;
    const r = run(win, "forget", { id: memId });
    expect(r.ok).toBe(true);
    const rec = receipts(win)[0];
    expect(rec.kind).toBe("memory_del");
    expect(rec.beforeText).toBe("撤销测试·记忆乙");
    const u = win.undoAiAction(rec.id);
    expect(u.ok).toBe(true);
    const hits = win.recallMemories("撤销测试·记忆乙", "global", 8);
    expect(hits.some((m) => m.text === "撤销测试·记忆乙")).toBe(true);
  });
});