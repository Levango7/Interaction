/**
 * markdown-extras.test.js —— 手写 Markdown 的表格 / 引用块（2026-10-23）
 * 解析器先 esc 再解析：这里同时钉住「功能」与「XSS 不因新语法回潮」。
 */
import { afterEach, describe, expect, it } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

const windows = [];
afterEach(() => windows.splice(0).forEach((win) => win.close()));
const md = (s) => { const w = loadApp({ storage: { wb_agent_onboarded: "true" } }); windows.push(w); return w.mdToHtml(s); };

describe("Markdown 表格", () => {
  it("表头/表体/对齐都按行解析", () => {
    const html = md("| 名称 | 状态 | 量 |\n| :--- | :---: | ---: |\n| A | **完成** | 12 |\n| B | 待办 | 3 |");
    expect(html).toContain("<table>");
    expect(html).toContain('<th class="md-left">名称</th>');
    expect(html).toContain('<th class="md-center">状态</th>');
    expect(html).toContain('<th class="md-right">量</th>');
    expect(html).toContain("<strong>完成</strong>");
    expect(html).toContain("<tbody>");
  });

  it("单元格里的 \\| 是字面竖线；缺列按空补齐", () => {
    const html = md("| a | b |\n| --- | --- |\n| x \\| y |");
    expect(html).toContain("x | y");
    expect(html.match(/<td/g).length).toBe(2);
  });

  it("没有表体的表格也能渲染", () => {
    const html = md("| a | b |\n| --- | --- |");
    expect(html).toContain("<thead>");
    expect(html).not.toContain("<tbody>");
  });

  it("分隔行不合法时回退为普通段落（不误吞正文）", () => {
    const html = md("a | b\n不是分隔行");
    expect(html).not.toContain("<table>");
    expect(html).toContain("a | b");
  });
});

describe("Markdown 引用块", () => {
  it("连续 > 行合并为一段，行内 markdown 生效", () => {
    const html = md("> 第一行 **粗**\n> 第二行\n\n普通段落");
    expect(html).toContain("<blockquote>第一行 <strong>粗</strong><br>第二行</blockquote>");
    expect(html).toContain("<p>普通段落</p>");
  });

  it("引用块内的 HTML 仍被转义（XSS 不回潮）", () => {
    const html = md("> <img src=x onerror=alert(1)>");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });
});
