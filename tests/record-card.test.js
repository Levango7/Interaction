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
/* _fieldSpanCls 定义在场景主区（render-scene-main.js）：两族共用，故两文件都要读 */
const JS_MAIN = fs.readFileSync(path.join(ROOT, "src/render-scene-main.js"), "utf8");

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
  it("基准 56px + 间距 8px（单位制：文字3 数字2 日期2 = 12 单位，须满足 N×c+(N−1)×g ≤ 可用宽）", () => {
    const g = rule('.tool-form-grid');
    expect(g).toContain('minmax(56px,1fr)');
    expect(g).toMatch(/gap:var\(--space-2\) var\(--space-2\)/);
  });

  it("跨列：文字/下拉 3、数字 2、日期 2", () => {
    expect(CSS).toMatch(/\.tool-field--wide\{grid-column:span 3\}/);
    expect(CSS).toMatch(/\.tool-field--num\{grid-column:span 2\}/);
    expect(CSS).toMatch(/\.tool-field--date\{grid-column:span 2\}/);
  });

  it("渲染侧按字段类型加类（两族共用 _fieldSpanCls，不再各写一套）", () => {
    /* v3.7.42 起：记录工具与工具卡共用 _fieldSpanCls —— 之前记录工具自己写了一套内联表达式，
       且漏了下拉框；共用后 select 才拿得到 --sel。 */
    expect(JS).toMatch(/const wcls = _fieldSpanCls\(f\);/);
    expect(JS).toContain('class="tool-field\' + wcls + \'"');
    /* 共用函数本身必须覆盖四种类型（定义在 render-scene-main.js） */
    expect(JS_MAIN).toMatch(/function _fieldSpanCls\(f\)\{/);
    expect(JS_MAIN).toMatch(/tool-field--sel/);
    expect(JS_MAIN).toMatch(/tool-field--num/);
    expect(JS_MAIN).toMatch(/tool-field--date/);
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

  it("容器内的表格 margin 必须归零（否则多出一条空白小节，看着像表头被拆两行）", () => {
    /* 用户截图指出：表格上方有一条空白小节。实测是 table 自带的 margin-top:8px 被圆角容器圈住了
       （wrapper 顶到 table 顶之间 9px）。加 .tool-table-wrap .tool-table{margin-top:0} 后降到 1px（＝容器自身边框）。 */
    expect(CSS).toMatch(/\.tool-table-wrap \.tool-table\{margin-top:0\}/);
  });

  it("表头只有一行（空白首格是「删除✕」那一列的列头，属于同一行，不是被拆出来的）", () => {
    /* 结构上就一行：<thead><tr><th></th><th>日期</th>…</tr></thead> —— CDP 实测 thead 行数=1。
       只在本函数范围内数，避免把文件里**其它表格**的 thead 也算进来。 */
    const i = JS.indexOf('function _recordToolHtml');
    const seg = JS.slice(i, i + 4000);
    expect(seg).toMatch(/<thead><tr><th><\/th>/);
    expect((seg.match(/<thead><tr>/g) || []).length, "本函数内表头不应出现第二个 tr").toBe(1);
  });
});

describe("② 金额/评分（数字）宽度", () => {
  it("数字走 --num（2 单位 ≈124px）—— 比原来的 1 单位 91px 宽，比文字字段 191px 窄", () => {
    expect(JS_MAIN).toMatch(/" tool-field--num"/);
    expect(JS).toMatch(/const wcls = _fieldSpanCls\(f\);/);
    expect(CSS).toMatch(/\.tool-field--num\{grid-column:span 2\}/);
  });

  it("日期同为 2 单位（191→124 变窄），'2026-09-18' 这类时间戳够显示", () => {
    expect(CSS).toMatch(/\.tool-field--date\{grid-column:span 2\}/);
  });
});
