/**
 * T3.5 Markdown 支持 · mdToHtml 解析器测试
 *
 * 覆盖：
 *  - 基本元素解析（标题 / 粗体 / 斜体 / 行内代码 / 代码块 / 列表 / 链接）
 *  - XSS 防护（script 标签被转义、javascript: 协议链接被拒）
 *  - 嵌套元素（粗体含链接、列表项含行内格式）
 *  - 边界情况（空串 / null / 纯文本 / 未闭合标记）
 *  - 代码块不解析内部 Markdown
 */
import { describe, it, expect } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

function freshMd() {
  const win = loadApp();
  return win.__test;
}

describe("T3.5 Markdown 解析器 · 基本元素", () => {
  it("标题 #/##/### → h1/h2/h3", () => {
    const { mdToHtml } = freshMd();
    expect(mdToHtml("# 大标题")).toBe("<h1>大标题</h1>");
    expect(mdToHtml("## 二级")).toBe("<h2>二级</h2>");
    expect(mdToHtml("### 三级")).toBe("<h3>三级</h3>");
  });

  it("粗体 **text** → <strong>", () => {
    const { mdToHtml } = freshMd();
    const out = mdToHtml("**重要**");
    expect(out).toContain("<strong>重要</strong>");
  });

  it("斜体 *text* → <em>", () => {
    const { mdToHtml } = freshMd();
    const out = mdToHtml("*斜的*");
    expect(out).toContain("<em>斜的</em>");
  });

  it("行内代码 `code` → <code>", () => {
    const { mdToHtml } = freshMd();
    const out = mdToHtml("用 `npm test` 跑测试");
    expect(out).toContain("<code>npm test</code>");
  });

  it("代码块 ``` → <pre><code>", () => {
    const { mdToHtml } = freshMd();
    const out = mdToHtml("```\nconst x = 1;\n```");
    expect(out).toContain("<pre>");
    expect(out).toContain("<code");
    expect(out).toContain("const x = 1;");
  });

  it("无序列表 -/* → <ul><li>", () => {
    const { mdToHtml } = freshMd();
    const out = mdToHtml("- 苹果\n- 香蕉");
    expect(out).toContain("<ul>");
    expect(out).toContain("<li>苹果</li>");
    expect(out).toContain("<li>香蕉</li>");
  });

  it("有序列表 1. → <ol><li>", () => {
    const { mdToHtml } = freshMd();
    const out = mdToHtml("1. 第一\n2. 第二");
    expect(out).toContain("<ol>");
    expect(out).toContain("<li>第一</li>");
    expect(out).toContain("<li>第二</li>");
  });

  it("链接 [text](url) → <a>", () => {
    const { mdToHtml } = freshMd();
    const out = mdToHtml("[官网](https://example.com)");
    expect(out).toContain('<a href="https://example.com"');
    expect(out).toContain(">官网</a>");
  });

  it("换行：双换行分段，单换行 <br>", () => {
    const { mdToHtml } = freshMd();
    const out = mdToHtml("第一行\n第二行\n\n第二段");
    expect(out).toContain("<br>");
    expect(out).toMatch(/<p>.*第二段.*<\/p>/);
  });
});

describe("T3.5 Markdown 解析器 · XSS 防护", () => {
  it("<script> 标签被转义，不产生可执行 script", () => {
    const { mdToHtml } = freshMd();
    const out = mdToHtml("<script>alert(1)</script>");
    expect(out).not.toContain("<script>");
    expect(out).not.toContain("</script>");
    expect(out).toContain("&lt;script&gt;");
  });

  it("javascript: 协议链接被拒，仅显示文本", () => {
    const { mdToHtml } = freshMd();
    const out = mdToHtml("[点我](javascript:alert(1))");
    expect(out).not.toContain("javascript:alert");
    expect(out).not.toContain("<a ");
    expect(out).toContain("点我");
  });

  it("img onload 注入被转义", () => {
    const { mdToHtml } = freshMd();
    const out = mdToHtml('<img src=x onerror="alert(1)">');
    expect(out).not.toContain("<img");
    expect(out).toContain("&lt;img");
  });

  it("escapeHtml 导出等价于 esc：转义 < > & \" '", () => {
    const { escapeHtml } = freshMd();
    expect(escapeHtml('<a href="x">&\'\'</a>')).toBe(
      "&lt;a href=&quot;x&quot;&gt;&amp;&#39;&#39;&lt;/a&gt;"
    );
  });
});

describe("T3.5 Markdown 解析器 · 嵌套元素", () => {
  it("粗体中含链接", () => {
    const { mdToHtml } = freshMd();
    const out = mdToHtml("**见 [文档](https://doc.com)**");
    expect(out).toContain("<strong>");
    expect(out).toContain('<a href="https://doc.com"');
    expect(out).toContain("文档</a>");
    expect(out).toContain("</strong>");
  });

  it("列表项含粗体与行内代码", () => {
    const { mdToHtml } = freshMd();
    const out = mdToHtml("- **重点**：用 `git pull` 更新");
    expect(out).toContain("<li>");
    expect(out).toContain("<strong>重点</strong>");
    expect(out).toContain("<code>git pull</code>");
  });
});

describe("T3.5 Markdown 解析器 · 边界情况", () => {
  it("空字符串 → 空 HTML", () => {
    const { mdToHtml } = freshMd();
    expect(mdToHtml("")).toBe("");
  });

  it("null/undefined → 空 HTML", () => {
    const { mdToHtml } = freshMd();
    expect(mdToHtml(null)).toBe("");
    expect(mdToHtml(undefined)).toBe("");
  });

  it("纯文本 → 原样输出（包裹在段落中，无 Markdown 标记）", () => {
    const { mdToHtml } = freshMd();
    const out = mdToHtml("就是普通文字");
    expect(out).toContain("就是普通文字");
    expect(out).not.toContain("**");
    expect(out).not.toContain("<strong>");
  });

  it("未闭合粗体标记 → 安全原样显示", () => {
    const { mdToHtml } = freshMd();
    const out = mdToHtml("**未闭合");
    expect(out).not.toContain("<strong>");
    expect(out).toContain("**未闭合");
  });

  it("未闭合链接 → 安全原样显示", () => {
    const { mdToHtml } = freshMd();
    const out = mdToHtml("[文本](https://x.com");
    expect(out).not.toContain("<a ");
    expect(out).toContain("[文本]");
  });
});

describe("T3.5 Markdown 解析器 · 代码块保护", () => {
  it("代码块内部 Markdown 不被解析", () => {
    const { mdToHtml } = freshMd();
    const out = mdToHtml("```\n**not bold**\n# not heading\n```");
    expect(out).toContain("**not bold**");
    expect(out).toContain("# not heading");
    expect(out).not.toContain("<strong>not bold</strong>");
    expect(out).not.toContain("<h1>");
  });

  it("代码块内 <script> 被转义不执行", () => {
    const { mdToHtml } = freshMd();
    const out = mdToHtml("```\n<script>alert(1)</script>\n```");
    expect(out).not.toContain("<script>");
    expect(out).toContain("&lt;script&gt;");
  });
});

describe("T3.5 Markdown 解析器 · safeUrl 协议白名单", () => {
  it("http/https/mailto 与相对路径放行", () => {
    const { safeUrl } = freshMd();
    expect(safeUrl("https://a.com")).toBe("https://a.com");
    expect(safeUrl("http://a.com")).toBe("http://a.com");
    expect(safeUrl("mailto:a@b.com")).toBe("mailto:a@b.com");
    expect(safeUrl("/path/page")).toBe("/path/page");
    expect(safeUrl("#anchor")).toBe("#anchor");
  });

  it("javascript/data/vbscript 协议被拒", () => {
    const { safeUrl } = freshMd();
    expect(safeUrl("javascript:alert(1)")).toBe("");
    expect(safeUrl("data:text/html,<script>")).toBe("");
    expect(safeUrl("vbscript:msgbox(1)")).toBe("");
  });
});