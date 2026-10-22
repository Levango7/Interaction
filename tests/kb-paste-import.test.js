/**
 * kb-paste-import.test.js —— 剪贴板文本导入（2026-10-22，PDF 的零依赖替代）
 * ----------------------------------------------------------------------------
 * PDF 要真抽取必须引库（字体/CMap 解析），与单文件体积/离线交付冲突；本版给的是无风险替代：
 * 用户在系统阅读器里全选复制，粘到知识库的「粘贴导入」里，进检索索引。对任何 PDF 都有效、不联网。
 * 判据：真实入口（工具箱 → 知识库 → 粘贴导入）打开浮层；空正文不得入库；
 * 填充后入库且浮层关闭；Esc 可关。
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

const windows = [];
afterEach(() => windows.splice(0).forEach((win) => win.close()));

async function boot() {
  const win = loadApp();
  windows.push(win);
  await vi.waitFor(() => expect(win.document.getElementById("chatPanel")._bound).toBe(true));
  win.__test.setActive("toolbox");
  win.__test.render();
  const card = win.document.querySelector('[data-toolbox="x-kb"]');
  expect(card, "工具箱应有知识库卡片").toBeTruthy();
  card.click();
  await vi.waitFor(() => expect(win.document.getElementById("kbPasteBtn")).toBeTruthy());
  return win;
}

const modal = (win) => win.document.getElementById("kbPasteModal");

describe("知识库：粘贴文本导入", () => {
  it("空正文 → 不入库、浮层保留", async () => {
    const win = await boot();
    win.document.getElementById("kbPasteBtn").click();
    expect(modal(win), "应打开粘贴导入浮层").toBeTruthy();
    const before = win.getRagFiles().length;
    win.document.getElementById("kbPasteName").value = "空.txt";
    win.document.getElementById("kbPasteOk").click();
    await new Promise((r) => setTimeout(r, 30));
    expect(win.getRagFiles().length, "空正文不得入库").toBe(before);
    expect(modal(win), "失败后浮层应保留").toBeTruthy();
  });

  it("填名称与正文 → 入库、浮层关闭、块数 > 0", async () => {
    const win = await boot();
    win.document.getElementById("kbPasteBtn").click();
    win.document.getElementById("kbPasteName").value = "合同-2026.txt";
    win.document.getElementById("kbPasteText").value = "第一段正文\n\n第二段正文";
    win.document.getElementById("kbPasteOk").click();
    await vi.waitFor(() => {
      const f = win.getRagFiles().find((x) => x.name === "合同-2026.txt");
      expect(f, "应入库").toBeTruthy();
      expect(f.chunks.length, "应切成块").toBeGreaterThan(0);
    });
    await vi.waitFor(() => expect(modal(win), "成功后浮层应关闭").toBeFalsy());
  });

  it("名称留空 → 自动生成带日期的文件名", async () => {
    const win = await boot();
    win.document.getElementById("kbPasteBtn").click();
    win.document.getElementById("kbPasteText").value = "自动命名的正文";
    win.document.getElementById("kbPasteOk").click();
    await vi.waitFor(() => {
      expect(win.getRagFiles().some((x) => /^粘贴文本-\d{4}-\d{2}-\d{2}\.txt$/.test(x.name))).toBe(true);
    });
  });

  it("Esc 关闭浮层且不入库", async () => {
    const win = await boot();
    win.document.getElementById("kbPasteBtn").click();
    const before = win.getRagFiles().length;
    modal(win).dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(modal(win), "Esc 应关闭").toBeFalsy();
    expect(win.getRagFiles().length).toBe(before);
  });
});
