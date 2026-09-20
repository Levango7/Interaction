/**
 * record-card.test.js —— 记录工具卡的三处调整（v3.7.38）
 * ----------------------------------------------------------------------------
 * 用户要求（截图圈注）：
 *   ① 表格做成圆角矩形
 *   ② 金额、评分 输入框不用那么大
 *   ③ 日期插进同一行
 *
 * 关键数据（CDP 实测，卡片内可用宽 786px）：
 *   改前：基准 minmax(180px,1fr) → 只排得下 **4 列** ✗ → 日期被挤到第二行
 *   改后：基准 minmax(90px,1fr) + 列间距 8px → **8 列**（786−7×8)/8≈91）
 *         字段按类型跨列：文字/日期 span 2、数字 span 1
 *   实测：店铺/菜品/日期 **191px** · 金额/评分 **91px**（48%）· **5 字段占 1 行** ✓
 *
 * ⚠️ 踩到的算术坑：第一次只按 minmax 的 px 算列数，**漏算了列间距** ——
 *    (786/96=8.19 以为 8 列，实际 8×96+7×12=852>786 → 只有 7 列 → 日期仍换行)。
 *    列数必须按 `N×min + (N−1)×gap ≤ 可用宽` 求。
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CSS = fs.readFileSync(path.join(ROOT, "agent-workbench.html"), "utf8");
const JS = fs.readFileSync(path.join(ROOT, "src/render-widgets.js"), "utf8");

function rule(sel) {
  const i = CSS.indexOf(sel + '{');
  if (i < 0) return '';
  let d = 0; const s = CSS.indexOf('{', i);
  for (let k = s; k < CSS.length; k++) {
    if (CSS[k] === '{') d++; else if (CSS[k] === '}') { d--; if (!d) return CSS.slice(s + 1, k); }
  }
  return '';
}

describe("③ 日期并入同一行：基准列宽与跨列", () => {
  it("基准列宽 90px、列间距 8px（按 N×min+(N−1)×gap 才排得下 8 列）", () => {
    const g = rule('.tool-form-grid');
    expect(g).toContain('minmax(90px,1fr)');
    expect(g).toMatch(/gap:var\(--space-2\) var\(--space-2\)/);
  });

  it("文字/日期字段跨 2 列、数字字段 1 列", () => {
    expect(CSS).toMatch(/\.tool-field--wide\{grid-column:span 2\}/);
    expect(CSS).toMatch(/\.tool-field--date\{grid-column:span 2\}/);
  });

  it("渲染侧按字段类型加类（数字不加宽类 → 保持窄）", () => {
    expect(JS).toMatch(/const wcls = f\.type === "number" \? "" : f\.type === "date" \? " tool-field--date" : " tool-field--wide"/);
    expect(JS).toContain('class="tool-field\' + wcls + \'"');
  });
});

describe("① 表格圆角矩形", () => {
  it("圆角容器：圆角 + 边框 + 裁切（table 在 border-collapse 下不吃 radius）", () => {
    const w = rule('.tool-table-wrap');
    expect(w).toContain('border-radius:var(--radius-md)');
    expect(w).toContain('overflow:hidden');
    expect(w).toMatch(/border:1px solid var\(--line\)/);
  });

  it("渲染侧表格被包进该容器", () => {
    expect(JS).toContain('<div class="tool-table-wrap"><table class="tool-table">');
    expect(JS).toMatch(/<\/tbody><\/table><\/div>/);
  });
});

describe("② 金额/评分窄", () => {
  it("数字类型不加跨列类（默认 1 列 ≈ 91px，是文字字段的 48%）", () => {
    const wide = (JS.match(/tool-field--wide/g) || []).length;
    expect(wide, "只应出现在宽类的定义处，不应给数字类型").toBeGreaterThan(0);
    expect(JS).toMatch(/f\.type === "number" \? ""/);
  });
});
