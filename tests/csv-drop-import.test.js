/**
 * csv-drop-import.test.js —— word/sheet 的导入 + 三个工具的拖拽导入（v3.7.23/24）
 * ----------------------------------------------------------------------------
 * 本轮补齐办公簇的导入能力：
 *   · off-word「导入 HTML/TXT」+ off-sheet「导入 CSV」（复用上轮的 _toolImportFile）
 *   · 三个工具（md/word/sheet）支持**拖拽导入**，与按钮走同一套回调（共用 _bindDropImport）
 *
 * 新增纯函数（本文件主要断言它们）：
 *   · _txtToHtmlParagraphs —— 纯文本逐行转 <p>，并**转义标签**（防注入）
 *   · _csvParse —— RFC4180 常用子集：引号包裹、引号内逗号/换行、"" 转义、CRLF/LF、去 BOM
 *
 * 说明：jsdom 没有 DragEvent / DataTransfer，**拖拽行为无法在单测里模拟**
 *   —— 该部分由 CDP 真机验证（实测：md 拖入后源码框与预览都更新；sheet 拖入 CSV 后表格出现内容；
 *   .exe 被正确拒绝）。单测这里只守纯函数与"入口存在"。
 */
import { describe, it, expect, beforeEach } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

let win;
beforeEach(() => { win = loadApp(); });

describe("纯函数 _txtToHtmlParagraphs（word 的纯文本导入）", () => {
  it("逐行包 <p>", () => {
    expect(win._txtToHtmlParagraphs("甲\n乙")).toBe("<p>甲</p><p>乙</p>");
  });
  it("CRLF 归一为 LF", () => {
    expect(win._txtToHtmlParagraphs("甲\r\n乙")).toBe("<p>甲</p><p>乙</p>");
  });
  it("标签被转义（防注入）", () => {
    const h = win._txtToHtmlParagraphs("<script>alert(1)</script>");
    expect(h).not.toContain("<script>");
    expect(h).toContain("&lt;script&gt;");
  });
  it("null / undefined → 空段落集合而非报错", () => {
    expect(win._txtToHtmlParagraphs(null)).toBe("<p></p>");
    expect(win._txtToHtmlParagraphs(undefined)).toBe("<p></p>");
  });
});

describe("纯函数 _csvParse（sheet 的 CSV 导入）", () => {
  it("最基础：逗号分行列", () => {
    expect(win._csvParse("a,b\nc,d")).toEqual([["a", "b"], ["c", "d"]]);
  });
  it("引号包裹 + 引号内有逗号", () => {
    expect(win._csvParse('"甲,乙",丙')).toEqual([["甲,乙", "丙"]]);
  });
  it('引号转义："" → 一个引号', () => {
    expect(win._csvParse('"说""好",2')).toEqual([['说"好', "2"]]);
  });
  it("引号内换行不算换行", () => {
    expect(win._csvParse('"第一\n第二",x')).toEqual([["第一\n第二", "x"]]);
  });
  it("CRLF 与 LF 等价", () => {
    expect(win._csvParse("a,b\r\nc,d")).toEqual(win._csvParse("a,b\nc,d"));
  });
  it("去掉 Excel 常带的 BOM", () => {
    expect(win._csvParse("\uFEFFa,b")).toEqual([["a", "b"]]);
  });
  it("空 / 无效输入 → null（调用方提示）", () => {
    expect(win._csvParse("")).toBeNull();
    expect(win._csvParse("   \n  ")).toBeNull();
    expect(win._csvParse(null)).toBeNull();
  });
  it("末尾空行被丢掉", () => {
    expect(win._csvParse("a,b\n")).toEqual([["a", "b"]]);
  });
  it("行列不等长时原样保留（不是错误）", () => {
    expect(win._csvParse("a\nb,c")).toEqual([["a"], ["b", "c"]]);
  });
});

describe("DOM：入口存在，且原有导出未被替换", () => {
  it("word：出现导入按钮，且两个导出按钮仍在", () => {
    win.openToolStub("off-word");
    expect(win.document.querySelector("#wordImport")).toBeTruthy();
    expect(win.document.querySelector("#wordExportHtml")).toBeTruthy();
    expect(win.document.querySelector("#wordExportDoc")).toBeTruthy();
  });

  it("sheet：出现导入按钮，且导出按钮仍在", () => {
    win.openToolStub("off-sheet");
    expect(win.document.querySelector("#shImportCsv")).toBeTruthy();
    expect(win.document.querySelector("#shExportCsv")).toBeTruthy();
  });

  it("md：导入与两个导出按钮并存", () => {
    win.openToolStub("off-md");
    expect(win.document.querySelector("#mdImport")).toBeTruthy();
    expect(win.document.querySelector("#mdExportMd")).toBeTruthy();
    expect(win.document.querySelector("#mdExportHtml")).toBeTruthy();
  });

  it("拖拽助手已定义（拖拽行为由 CDP 真机验证）", () => {
    expect(typeof win._bindDropImport).toBe("function");
  });
});
