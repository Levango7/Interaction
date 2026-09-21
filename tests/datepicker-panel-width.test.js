// v3.7.57 守护：日期下拉面板宽度必须跟随触发输入框（全站同类错误的根治）
// 背景：面板原本写死 min-width:250px，而看板表单的截止日期输入框只有 114px → 差 136px。
// 修法在 _dpOpen 里统一处理（panel.style.minWidth = max(inputW, 220)），CSS 地板降到 220。
// 本文件只做静态断言（形状），像素级验证由 CDP 实测完成（见 _diag/measure-row1-v2.cjs）。
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const JS_MAIN = readFileSync(join(ROOT, "src/render-scene-main.js"), "utf8");
const HTML = readFileSync(join(ROOT, "agent-workbench.html"), "utf8");

describe("日期面板宽度跟随输入框（v3.7.57）", () => {
  it("_dpOpen 里按触发输入框宽度设置面板 min-width，下限 220", () => {
    expect(JS_MAIN).toContain("Math.max(220, Math.round(input.getBoundingClientRect().width || 0))");
    expect(JS_MAIN).toContain('panel.style.minWidth = w + "px"');
  });

  it("CSS 面板地板 220px + width:max-content（写死 250 会重新造成 136px 错位）", () => {
    expect(HTML).toMatch(/\.dp-panel\{[^}]*min-width:220px/);
    expect(HTML).toMatch(/\.dp-panel\{[^}]*width:max-content/);
    expect(HTML).not.toMatch(/\.dp-panel\{[^}]*min-width:250px/);
  });

  it("加号与输入框底对齐（chain-add-row 补上 v3.2 漏掉的横排化，实测 61px→38px、错位 11px→0）", () => {
    expect(HTML).toContain(".chain-add-row .add-wrap{flex-direction:row;align-items:center;gap:0}");
    expect(HTML).toContain(".chain-add-row .add-wrap .add-label{display:none}");
    expect(HTML).toContain(".chain-add-row .add-wrap .add-round{width:var(--control-h);height:var(--control-h)}");
  });
});
