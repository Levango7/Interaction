/**
 * form-grid-scheme-a.test.js —— 密集表单「方案 A：统一基线栅格」试点（v3.7.27）
 * ----------------------------------------------------------------------------
 * 需求：同一 card 内多行密集的输入/选择/下拉，水平对齐合理之外，**上下排列也要有规则**。
 * 试点范围（刻意最小化，先稳）：工具卡的 `.tool-form-grid / .tool-field` + 工具条 `.tool-filter-bar`。
 *
 * 方案 A 的四条规则（本文件逐条守）：
 *   ① 控件等高 —— 复用既有 `--control-h`（不另造高度体系）
 *   ② 标签占固定行高 `--label-h` —— 有无标签都不错行；长标签截断，保持一行
 *   ③ 行距/列距同源（走 `--space-*`），不用魔法数字
 *   ④ 提示/报错占固定高度 `--field-msg-h` —— **出错时整块不跳动**（最容易被忽略的一条）
 * 另：工具条 `.tool-app-card .tool-filter-bar` 必须**底边对齐**（"添加"是"标签+按钮"两行块），
 *     否则计数/chip 会各自错开（实测改前 4 个子元素有 3 种底边，改后为 1 种）。
 *
 * 说明：jsdom 不解析 CSS 自定义属性，故做**静态 CSS 断言**；
 *   实际 computed 结果由 CDP 真机核对（实测：4 个子元素底边均为 304；控件高统一 38px）。
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CSS = fs.readFileSync(path.join(ROOT, "agent-workbench.html"), "utf8");

describe("方案 A · 四个几何令牌", () => {
  it("--label-h 与 --field-msg-h 已定义（几何令牌只在 :root，主题无需覆盖）", () => {
    expect(CSS).toMatch(/--label-h:\s*\d+px/);
    expect(CSS).toMatch(/--field-msg-h:\s*\d+px/);
  });

  it("控件高度复用既有 --control-h（不另造一套高度）", () => {
    expect(CSS).toMatch(/--control-h:\s*38px/);
    expect(CSS).toMatch(/\.tool-field>input,\.tool-field>select\{height:var\(--control-h\)\}/);
  });
});

describe("方案 A · 字段层规则", () => {
  it("标签占固定行高且单行截断（不错行、不撑高）", () => {
    expect(CSS).toMatch(/\.tool-field>label\{[^}]*min-height:var\(--label-h\)/);
    expect(CSS).toMatch(/\.tool-field>label\{[^}]*text-overflow:ellipsis/);
    expect(CSS).toMatch(/\.tool-field>label\{[^}]*white-space:nowrap/);
  });

  it("提示/报错占固定高度（出错时整块不跳）", () => {
    expect(CSS).toMatch(/\.tool-field>\.hint[^{]*\{[^}]*min-height:var\(--field-msg-h\)/);
  });

  it("栅格行距列距走 --space-*（不写魔法数字）", () => {
    const m = CSS.match(/\.tool-form-grid\{[^}]*\}/);
    expect(m).toBeTruthy();
    /* v3.7.60：gap 格式为 var(--space-2) var(--space-2) —— 两个 --space-* token */
    expect(m[0]).toMatch(/gap:var\(--space-2\) var\(--space-2\)/);
    expect(m[0]).toContain("align-items:start");
  });

  it("textarea 有独立下限高度（不与单行控件同高）", () => {
    expect(CSS).toMatch(/\.tool-field>textarea\{min-height:calc\(var\(--control-h\) \* 2\)\}/);
  });
});

describe("方案 A · 工具条底边对齐", () => {
  it("生效的那条规则（.tool-app-card .tool-filter-bar，特异性更高）必须是 flex-end", () => {
    const m = CSS.match(/\.tool-app-card \.tool-filter-bar\{[^}]*\}/);
    expect(m, "应存在 .tool-app-card .tool-filter-bar 规则").toBeTruthy();
    expect(m[0], "必须是底部对齐，否则计数/chip 与按钮会各自错开").toContain("align-items:flex-end");
    expect(m[0]).not.toContain("align-items:center");
  });

  it("计数与摘要 chip 有统一最小高度（与按钮同档 --control-h-sm）", () => {
    expect(CSS).toMatch(/\.tool-filter-bar>\.sub,\.tool-filter-bar \.tool-summary-item\{[^}]*min-height:var\(--control-h-sm\)/);
  });

  it("按钮组也底边对齐（.tool-actions）", () => {
    const m = CSS.match(/\.tool-actions\{[^}]*\}/);
    expect(m[0]).toContain("align-items:flex-end");
  });
});
