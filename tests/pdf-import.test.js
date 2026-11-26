/**
 * pdf-import.test.js —— PDF 文本抽取与知识库导入（2026-10-23）
 * ----------------------------------------------------------------------------
 * 真 pdf.js（vendor/pdfjs，6.x IIFE bundle）在 e2e 里跑真实文件；本文件用**假 pdfjsLib** 钉住
 * 我们的接线契约：items → 文本（hasEOL/空格启发式）、空文本、加密/损坏拒绝、
 * .pdf 必须经抽取才准入、以及 ragImportFiles 的 PDF 分支（成功入库 / 失败不入库）。
 */
import { afterEach, describe, expect, it } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

const windows = [];
afterEach(() => windows.splice(0).forEach((win) => win.close()));

function fakePdfjs(pages) {
  const state = { destroyed: 0, args: null };
  const doc = {
    numPages: pages.length,
    async getPage(i) {
      return {
        async getTextContent() { return { items: pages[i - 1] || [] }; },
        cleanup() {},
      };
    },
  };
  const lib = {
    GlobalWorkerOptions: {},
    getDocument(args) {
      state.args = args;
      return {
        promise: Promise.resolve(doc),
        destroy() { state.destroyed++; },
      };
    },
  };
  return { lib, state };
}

describe("PDF items → 文本", () => {
  it("hasEOL 断行；拉丁词之间补空格；中文块之间不插空格", () => {
    const win = loadApp({ storage: { wb_agent_onboarded: "true" } });
    windows.push(win);
    const text = win._pdfItemsToText([
      { str: "Hello", hasEOL: false },
      { str: "PDF", hasEOL: true },
      { str: "第一段", hasEOL: true },
      { str: "第二段", hasEOL: true },
    ]);
    expect(text).toBe("Hello PDF\n第一段\n第二段");
  });

  it("多页用空行分隔；空页跳过", async () => {
    const win = loadApp({ storage: { wb_agent_onboarded: "true" } });
    windows.push(win);
    const { lib, state } = fakePdfjs([
      [{ str: "Page one", hasEOL: true }],
      [],
      [{ str: "Page three", hasEOL: true }],
    ]);
    win.pdfjsLib = lib;
    const text = await win.extractPdfText(new ArrayBuffer(8));
    expect(text).toBe("Page one\n\nPage three");
    expect(state.destroyed).toBe(1);
    expect(state.args).not.toHaveProperty("isEvalSupported");
    expect(state.args.useSystemFonts).toBe(true);
    expect(state.args.data).toBeInstanceOf(win.Uint8Array);
    expect(Array.from(state.args.data)).toEqual(new Array(8).fill(0));
  });

  it("扫描件（无文本层）返回空串，由调用方提示", async () => {
    const win = loadApp({ storage: { wb_agent_onboarded: "true" } });
    windows.push(win);
    const { lib } = fakePdfjs([[]]);
    win.pdfjsLib = lib;
    expect(await win.extractPdfText(new ArrayBuffer(8))).toBe("");
  });

  it("解析失败如实拒绝（不吞成空文本）", async () => {
    const win = loadApp({ storage: { wb_agent_onboarded: "true" } });
    windows.push(win);
    win.pdfjsLib = { GlobalWorkerOptions: {}, getDocument() { return { promise: Promise.reject(new Error("Invalid PDF structure")) }; } };
    await expect(win.extractPdfText(new ArrayBuffer(8))).rejects.toThrow(/Invalid PDF/);
  });

  it("loading task 拒绝时也销毁任务，不泄漏 Worker", async () => {
    const win = loadApp({ storage: { wb_agent_onboarded: "true" } });
    windows.push(win);
    const state = { destroyed: 0 };
    win.pdfjsLib = {
      GlobalWorkerOptions: {},
      getDocument() {
        return {
          promise: Promise.reject(new Error("Invalid PDF structure")),
          destroy() { state.destroyed++; },
        };
      },
    };
    await expect(win.extractPdfText(new ArrayBuffer(8))).rejects.toThrow(/Invalid PDF/);
    expect(state.destroyed).toBe(1);
  });

  it("任务销毁失败不覆盖正文，但必须留下诊断", async () => {
    const win = loadApp({ storage: { wb_agent_onboarded: "true" } });
    windows.push(win);
    const diagnostics = [];
    win.pushDiag = (...args) => diagnostics.push(args);
    win.pdfjsLib = {
      GlobalWorkerOptions: {},
      getDocument() {
        return {
          promise: Promise.resolve({
            numPages: 1,
            async getPage() {
              return {
                async getTextContent() { return { items: [{ str: "正文保留", hasEOL: true }] }; },
                cleanup() {},
              };
            },
          }),
          async destroy() { throw new Error("cleanup failed"); },
        };
      },
    };
    expect(await win.extractPdfText(new ArrayBuffer(8))).toBe("正文保留");
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0][0]).toBe("warn");
    expect(diagnostics[0][1]).toContain("pdf task cleanup failed");
    expect(diagnostics[0][2]).toEqual({ where: "extractPdfText" });
  });
});

describe("准入与导入接线", () => {
  it(".pdf 原始串被拒；预抽取文本才收", async () => {
    const win = loadApp({ storage: { wb_agent_onboarded: "true" } });
    windows.push(win);
    expect(win._ragFileText("a.pdf", "%PDF-binary")).toBeNull();
    expect(win._ragFileText("a.pdf", "已经抽好的正文", true)).toBe("已经抽好的正文");
    expect(win.t("p5.kbFilesAccept")).toContain(".pdf");
  });

  it("ragImportFiles：PDF 走真 extractPdfText 后入库", async () => {
    const win = loadApp({ storage: { wb_agent_onboarded: "true" } });
    windows.push(win);
    const { lib } = fakePdfjs([[{ str: "PDF 正文", hasEOL: true }]]);
    win.pdfjsLib = lib;
    const file = { name: "doc.pdf", arrayBuffer: async () => new ArrayBuffer(8) };
    const r = await win.ragImportFiles([file]);
    expect(r.files).toBe(1);
    expect(win.getRagFiles().find((f) => f.name === "doc.pdf").chunks[0].text).toContain("PDF 正文");
  });

  it("ragImportFiles：损坏 PDF 不入库", async () => {
    const win = loadApp({ storage: { wb_agent_onboarded: "true" } });
    windows.push(win);
    win.pdfjsLib = { GlobalWorkerOptions: {}, getDocument() { return { promise: Promise.reject(new Error("Invalid PDF structure")) }; } };
    const file = { name: "bad.pdf", arrayBuffer: async () => new ArrayBuffer(8) };
    const r = await win.ragImportFiles([file]);
    expect(r.files).toBe(0);
    expect(win.getRagFiles().some((f) => f.name === "bad.pdf")).toBe(false);
  });
});
