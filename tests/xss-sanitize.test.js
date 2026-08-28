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

  // v3.1.1 [S1]：HTML 实体编码协议名绕过回归——浏览器渲染时会解码 &#106; → 'j'，
  // 消毒器必须先解码实体再判协议，否则 <a href="&#106;avascript:..."> 点击即执行。
  it("sanitizeHtml：实体编码协议名（十进制 &#106;avascript:）被中和", () => {
    const out = win.sanitizeHtml('<a href="&#106;avascript:alert(1)">x</a>');
    expect(out).not.toContain("&#106;avascript");
    expect(out).toContain('href=""');
  });

  it("sanitizeHtml：实体编码协议名（十六进制 &#x6a;avascript:）被中和", () => {
    const out = win.sanitizeHtml('<a href="&#x6a;avascript:alert(1)">x</a>');
    expect(out).not.toContain("&#x6a;avascript");
    expect(out).toContain('href=""');
  });

  it("sanitizeHtml：实体混入协议名中间（j&#97;vascript:）被中和", () => {
    const out = win.sanitizeHtml('<a href="j&#97;vascript:alert(1)">x</a>');
    expect(out).toContain('href=""');
  });

  it("sanitizeHtml：控制字符插入协议名（java&#9;script:）被中和", () => {
    const out = win.sanitizeHtml('<a href="java&#9;script:alert(1)">x</a>');
    expect(out).toContain('href=""');
  });

  it("sanitizeHtml：xlink:href 实体编码危险协议同样被中和", () => {
    const out = win.sanitizeHtml('<svg><use xlink:href="&#106;avascript:alert(1)"></use></svg>');
    expect(out).not.toContain("&#106;avascript");
  });

  it("sanitizeHtml：正常链接不受实体解码影响（https / 相对路径 / mailto 保留）", () => {
    const out = win.sanitizeHtml('<a href="https://example.com/a?x=1&amp;y=2">a</a><a href="/relative/path">b</a><a href="mailto:x@y.z">c</a><img src="img/pic.png">');
    expect(out).toContain('href="https://example.com/a?x=1&amp;y=2"');
    expect(out).toContain('href="/relative/path"');
    expect(out).toContain('href="mailto:x@y.z"');
    expect(out).toContain('src="img/pic.png"');
  });

  it("mdToHtml 输出经全量转义（Markdown 导出 HTML 路径安全）", () => {
    const out = win.mdToHtml("<script>alert(1)</script>\n\n**bold**");
    expect(out).not.toContain("<script>");
    expect(out).toContain("&lt;script&gt;");
  });
});