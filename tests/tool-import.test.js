/**
 * tool-import.test.js —— 办公工具的「导入」能力（v3.7.23）
 * ----------------------------------------------------------------------------
 * 背景：办公簇 4 个工具（md/word/sheet/ppt）**只有导出、没有导入**（实测确认）。
 *   本次先给最干净的两个补上：
 *     · off-md  「导入 .md」——纯文本，读入后填进源码框并走既有 sync()（保存+预览）
 *     · off-ppt 「导入 JSON」——导出是 slides.json，导入即其逆操作
 *   并抽出共用助手 `_toolImportFile(accept, cb)`（动态建 file input，不必改各工具 HTML）
 *   与纯函数 `_pptFromJson`（归一化 + 校验）。
 *
 * 测试策略：纯函数全量断言；`_toolImportFile` 的副作用恰好**可观测** ——
 *   调用后会在 DOM 里挂上一个 `input[type=file]`（accept 与传入一致），据此断言。
 */
import { describe, it, expect, beforeEach } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

let win;
beforeEach(() => { win = loadApp(); });

describe("纯函数 _pptFromJson（导入的 slides JSON 归一化）", () => {
  it("对象数组：保留 title/body，缺少 id 的补一个", () => {
    const r = win._pptFromJson(JSON.stringify([{ title: "甲", body: "一" }, { id: "x", title: "乙", body: "二" }]));
    expect(r.length).toBe(2);
    expect(r[0].title).toBe("甲");
    expect(typeof r[0].id).toBe("string");
    expect(r[0].id.length).toBeGreaterThan(0);
    expect(r[1].id).toBe("x");
  });

  it("字符串数组：当作只有标题的页", () => {
    const r = win._pptFromJson(JSON.stringify(["第一页", "第二页"]));
    expect(r.length).toBe(2);
    expect(r[0].title).toBe("第一页");
    expect(r[0].body).toBe("");
  });

  it("字段缺失/为 null → 归一成空串（不出现 \"undefined\" 文本）", () => {
    const r = win._pptFromJson(JSON.stringify([{ title: null }]));
    expect(r[0].title).toBe("");
    expect(r[0].body).toBe("");
  });

  it("非法输入一律返回 null（调用方提示，不抛错）", () => {
    expect(win._pptFromJson("不是 json")).toBeNull();
    expect(win._pptFromJson("{}")).toBeNull();      // 不是数组
    expect(win._pptFromJson("[]")).toBeNull();      // 空数组
    expect(win._pptFromJson("")).toBeNull();
    expect(win._pptFromJson(null)).toBeNull();
    expect(win._pptFromJson("[123, null]")).toBeNull();  // 全是不可用元素
  });

  it("混合数组：只保留可用元素", () => {
    const r = win._pptFromJson(JSON.stringify([{ title: "A" }, 123, null, "B"]));
    expect(r.length).toBe(2);
    expect(r[0].title).toBe("A");
    expect(r[1].title).toBe("B");
  });

  it("导出 → 导入 往返一致（与 _toolDownload 的 JSON 形状互逆）", () => {
    const slides = [{ id: "a1", title: "标题", body: "正文" }];
    const round = win._pptFromJson(JSON.stringify(slides, null, 2));
    expect(round).toEqual(slides);
  });
});

describe("共用助手 _toolImportFile", () => {
  it("是函数（各工具的导入按钮都靠它）", () => {
    expect(typeof win._toolImportFile).toBe("function");
  });

  it("调用后会在 DOM 挂上 file input，且 accept 与传入一致", () => {
    const before = win.document.querySelectorAll('input[type="file"]').length;
    win._toolImportFile(".json,application/json", () => {});
    const inputs = win.document.querySelectorAll('input[type="file"]');
    expect(inputs.length).toBe(before + 1);
    expect(inputs[inputs.length - 1].getAttribute("accept")).toBe(".json,application/json");
  });

  it("多次调用各自独立（不共用同一 input，避免 accept 串味）", () => {
    win._toolImportFile(".md", () => {});
    win._toolImportFile(".json", () => {});
    const inputs = win.document.querySelectorAll('input[type="file"]');
    const accepts = [...inputs].map((i) => i.getAttribute("accept"));
    expect(accepts).toContain(".md");
    expect(accepts).toContain(".json");
  });
});

describe("DOM：两个办公工具页面出现导入入口", () => {
  it("Markdown 编辑器出现「导入 .md」按钮", () => {
    win.openToolStub("off-md");
    const btn = win.document.querySelector("#mdImport");
    expect(btn).toBeTruthy();
    expect(btn.textContent).toContain("导入");
  });

  it("Markdown 页仍保留原有导出按钮（导入是新增，不是替换）", () => {
    win.openToolStub("off-md");
    expect(win.document.querySelector("#mdExportMd")).toBeTruthy();
    expect(win.document.querySelector("#mdExportHtml")).toBeTruthy();
  });

  it("幻灯片出现「导入 JSON」按钮，且导出按钮仍在", () => {
    win.openToolStub("off-ppt");
    expect(win.document.querySelector("#pptImportJson")).toBeTruthy();
    expect(win.document.querySelector("#pptExportJson")).toBeTruthy();
  });
});
