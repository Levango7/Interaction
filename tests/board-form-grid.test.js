/**
 * board-form-grid.test.js —— 方案 A 第三批：看板卡两行共用列栅格（v3.7.29）
 * ----------------------------------------------------------------------------
 * 问题（截图实证）：看板卡里两行字段各自 flex，列宽由内容决定 →
 *   行1「截止日期」右缘 672、行2「联动记录」左缘 684，同列的东西不在同一条竖线上。
 *
 * 改法：两行**共用一套 5 轨栅格**，按语义跨轨：
 *   第1轨 任务标题 | 第2轨 截止日期 | 第3轨 优先级 | 第4轨 标签 | 第5轨 添加按钮(64px 定宽)
 *   行2：搜索(跨1-2轨) · 联动记录(第3轨) · 标签(跨4-5轨)
 *
 * CDP 实测（改造后）：
 *   行1：任务标题 287→516 | 截止日期 528→672 | 优先级 684→804 | 标签 825→997 | [+] 1035→1073
 *   行2：搜索 287→672 | 联动记录 684→813 | 标签 825→1073
 *   → 行2 的每条边界都落在行1 已有的竖线上（287/672/684/825/1073 全部咬合）
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CSS = fs.readFileSync(path.join(ROOT, "agent-workbench.html"), "utf8");
const JS = fs.readFileSync(path.join(ROOT, "src/render-scene-main.js"), "utf8");

describe("看板卡 · 共用列栅格", () => {
  it("存在 .form-row--board 的 5 轨栅格（末轨定宽，否则 fr 计算会被按钮宽度带偏）", () => {
    /* 这里只断言"形状"：5 轨 + 末轨是 px 定宽。
       具体 fr 数值**只在 card-layers.test.js 里钉一处** —— 以前两个文件都写死数值，
       改模板时漏改这个，CI 就红过一次（"改了实现忘了改断言"）。 */
    const m = CSS.match(/\.form-row--board\{[^}]*\}/);
    expect(m, "应存在 .form-row--board 规则").toBeTruthy();
    expect(m[0]).toContain("display:grid");
    const tpl = m[0].match(/grid-template-columns:([^;}]+)/);
    expect(tpl, "应有列模板").toBeTruthy();
    const tracks = tpl[1].trim().split(/\s+/);
    expect(tracks.length, "应为 5 轨").toBe(5);
    expect(tracks[4], "末轨必须是 px 定宽").toMatch(/px$/);
    expect(m[0]).toContain("align-items:end");
  });

  it("跨轨规则齐备：搜索跨 1-2 轨、筛选行标签跨 4-5 轨", () => {
    expect(CSS).toMatch(/\.form-row--board>\.fld-xl\{grid-column:span 2\}/);
    expect(CSS).toMatch(/\.form-row--board>\.fld-fill\{grid-column:span 2\}/);
  });

  it("栅格变体里 .fld-* 尺寸类只决定跨轨、不再限宽（否则左右不等长）", () => {
    /* 实测：同一轨道里「优先级」120px 而「联动记录」129px —— 因为 .fld-sm{max-width:120px}
       把 129px 的轨道压窄了 9px。应用里已有先例（.form-row .fld-lg{max-width:none}）。
       只在栅格变体里释放：普通 .form-row 是 flex，仍需尺寸类表达宽度，不能动。 */
    expect(CSS).toMatch(/\.form-row--board>\.fld\{max-width:none\}/);
    expect(CSS, "普通 .form-row 的尺寸类必须保留（不能误伤）").toMatch(/\.fld-sm\{max-width:120px\}/);
  });

  it("栅格子项 min-width:0（否则长内容会把轨道撑破）", () => {
    expect(CSS).toMatch(/\.form-row--board>\*\{min-width:0\}/);
  });

  it("控件与标签统一走既有令牌（--control-h / --label-h）", () => {
    expect(CSS).toMatch(/\.form-row--board>\.fld>input,\.form-row--board>\.fld>select\{height:var\(--control-h\)\}/);
    expect(CSS).toMatch(/\.form-row--board>\.fld>label\{min-height:var\(--label-h\)\}/);
  });

  it("有窄屏回退（否则小屏下 5 轨会挤成条）—— 断点 820px，须覆盖 768 的平板", () => {
    /* 断点原写 760px，实测**平板 768 不触发回退** → 5 轨被压得过窄、字段不可交互，
       e2e 的 tablet 项目整片超时；抬到 820px。测试这里也把断点值一并锁住，
       避免"改了实现忘了改断言"（CI 就是这么红的）。 */
    expect(CSS).toMatch(/@media \(max-width:820px\)\{[\s\S]*?\.form-row--board\{grid-template-columns:1fr 1fr\}/);
    expect(CSS).not.toMatch(/@media \(max-width:760px\)\{\s*\.form-row--board/);
  });
});

describe("看板卡 · 标记侧", () => {
  it("任务表单与筛选行都带上了变体类（两行必须同一套栅格才谈得上对齐）", () => {
    expect(JS).toContain('class="form-row form-row--board" id="taskForm"');
    expect(JS).toContain('const tagFilterHTML = `<div class="form-row form-row--board">');
  });

  it("筛选行的标签字段带跨轨类（跨 4-5 轨，正好盖住标签+添加按钮）", () => {
    expect(JS).toContain('class="fld fld-lg fld-fill"><label for="tagFilter"');
  });

  it("只动了看板这两行，未波及其它 .form-row（28 处保持原样）", () => {
    const total = (JS.match(/class="form-row/g) || []).length;
    const board = (JS.match(/class="form-row form-row--board/g) || []).length;
    expect(board, "本文件里只有看板这两行用了变体").toBe(2);
    expect(total, "其余 .form-row 仍是普通写法").toBeGreaterThan(board);
  });
});
