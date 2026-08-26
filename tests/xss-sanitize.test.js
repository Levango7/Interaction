import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadApp } from "./helpers/loadApp.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HTML = path.resolve(__dirname, "..", "agent-workbench.html");

/**
 * XSS 消毒回归（v3.0.1 A-4）：
 * Word 富文本导出 .html/.doc 拼接前必须过 sanitizeHtml（纵深防御——
 * 渲染路径 openToolStub 已统一消毒，导出路径是「文件再分发」场景的独立缺口）。
 */
describe("A-4 Word 导出消毒（源码契约）", () => {
  let src;

  beforeAll(() => {
    expect(fs.existsSync(HTML), "agent-workbench.html 应存在").toBe(true);
    src = fs.readFileSync(HTML, "utf8");
  });

  it("doc.html 导出拼接前过 sanitizeHtml(ed.innerHTML)", () => {
    expect(src).toContain('sanitizeHtml(ed.innerHTML) + "</body>", "text/html;charset=utf-8"');
  });

  it("doc.doc 导出拼接前过 sanitizeHtml(ed.innerHTML)", () => {
    expect(src).toContain('sanitizeHtml(ed.innerHTML) + "</body>", "application/msword"');
  });
});

describe("XSS 消毒器行为回归", () => {
  let win;

  beforeAll(() => {
    win = loadApp();
  });

  it("sanitizeHtml：移除 script 标签与 on* 事件属性", () => {
    const out = win.sanitizeHtml('<p onclick="alert(1)">hi</p><script>alert(2)</script>');
    expect(out).not.toContain("<script");
    expect(out).not.toContain("onclick");
    expect(out).toContain("hi");
  });

  it("sanitizeHtml：移除 javascript: 协议链接", () => {
    const out = win.sanitizeHtml('<a href="javascript:alert(1)">x</a>');
    expect(out).not.toContain("javascript:");
  });

  it("mdToHtml 输出经全量转义（Markdown 导出 HTML 路径安全）", () => {
    const out = win.mdToHtml("<script>alert(1)</script>\n\n**bold**");
    expect(out).not.toContain("<script>");
    expect(out).toContain("&lt;script&gt;");
  });
});