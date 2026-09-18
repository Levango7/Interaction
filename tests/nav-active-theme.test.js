/**
 * nav-active-theme.test.js —— 侧栏选中态统一走主题色（v3.7.26）
 * ----------------------------------------------------------------------------
 * 需求：侧栏选项被点击时，背景应是**主题色**，且**所有主题表现一致**。
 *
 * 现状问题（改前）：基础规则是 `.nav-item.active{background:var(--text)}`（反色块），
 *   而 aurora/forest/ocean 三个主题又各自覆盖成 `--brand-grad` —— 11 个主题里至少 3 种表现。
 * 改法：拉回**应用既有惯例**（`.cal-modal-tab/.chain-tab/.glob-view-chip/.ktag-chip/.pet-style-tab`
 *   的选中态统一是 `{background:var(--accent); color:var(--on-accent)}`），并删掉主题特例。
 *   二级用 `.nav-subitem.active{background:var(--accent-soft)}` 形成层级差
 *   —— 顺带修掉「子项文字用 --on-accent 却没有底色」在暗色主题下**文字看不见**的真 bug。
 *
 * 测试策略：**jsdom 不解析 CSS 自定义属性**，无法断言 computed 值，
 * 故这里做**静态 CSS 断言**（规则文本 + 不得再有主题特例）；
 * computed 值由 CDP 真机核对：实测 ink=rgb(212,175,55) / matrix=rgb(74,222,128) /
 * ocean=rgb(10,82,99) / light=rgb(0,112,243)，文字分别取各自 --on-accent。
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CSS = fs.readFileSync(path.join(ROOT, "agent-workbench.html"), "utf8");

describe("侧栏选中态：背景必须是主题色", () => {
  it("一级项 .nav-item.active 用 --accent 底 + --on-accent 字", () => {
    const m = CSS.match(/\.nav-item\.active\{[^}]*\}/);
    expect(m, "应存在 .nav-item.active 规则").toBeTruthy();
    expect(m[0]).toContain("background:var(--accent)");
    expect(m[0]).toContain("color:var(--on-accent)");
  });

  it("一级项**不得**再用 --text 反色块（改前的写法）", () => {
    expect(CSS).not.toContain(".nav-item.active{background:var(--text)");
  });

  it("计数徽章与图标跟随 --on-accent（在主题色底上仍可读）", () => {
    expect(CSS).toMatch(/\.nav-item\.active \.cnt\{[^}]*--on-accent/);
    expect(CSS).toMatch(/\.nav-item\.active svg\{[^}]*--on-accent/);
  });

  it("二级项 .nav-subitem.active 有底色（否则暗色主题下文字不可见）", () => {
    const m = CSS.match(/\.nav-subitem\.active\{[^}]*\}/);
    expect(m, "子项应有 active 背景规则").toBeTruthy();
    expect(m[0]).toContain("var(--accent-soft)");
  });

  it("子项文字不得只用 --on-accent（那是给主题色底设计的）", () => {
    expect(CSS).not.toMatch(/\.nav-subitem\.active \.nm\{color:var\(--on-accent\)\}/);
  });
});

describe("侧栏选中态：所有主题表现一致（不得再有主题特例）", () => {
  it("不存在 :root[data-theme=…] .nav-item.active 的 --brand-grad 覆盖", () => {
    const themed = [...CSS.matchAll(/:root\[data-theme="(\w+)"\] \.nav-item\.active\{([^}]*)\}/g)];
    const bad = themed.filter((m) => m[2].includes("--brand-grad"));
    expect(bad.map((m) => m[1]), "这些主题仍在给侧栏选中态搞特例").toEqual([]);
  });

  it("若存在主题特例，其背景也必须是 --accent（不允许各写各的）", () => {
    const themed = [...CSS.matchAll(/:root\[data-theme="(\w+)"\] \.nav-item\.active\{([^}]*)\}/g)];
    themed.forEach((m) => expect(m[2], m[1] + " 的特例应走 --accent").toContain("background:var(--accent)"));
  });
});

describe("与既有惯例保持一致", () => {
  it("tab/chip 类选中态本来就统一用 --accent（本次是向它们看齐）", () => {
    [".cal-modal-tab.active", ".chain-tab.active", ".glob-view-chip.active", ".ktag-chip.active", ".pet-style-tab.active"]
      .forEach((sel) => {
        const re = new RegExp(sel.replace(/\./g, "\\.") + "\\{[^}]*background:var\\(--accent\\)");
        expect(re.test(CSS), sel + " 应仍是 --accent 底").toBe(true);
      });
  });
});
