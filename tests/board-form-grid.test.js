/**
 * board-form-grid.test.js —— 看板卡表单/筛选行共用列栅格（v3.7.29 创立 / v3.7.59 微轨化）
 * ----------------------------------------------------------------------------
 * 问题（截图实证）：看板卡里两行字段各自 flex，列宽由内容决定 →
 *   同列的东西不在同一条竖线上（行1「截止日期」右缘 672、行2「联动记录」左缘 684）。
 *
 * v3.7.59 现状（用户定稿「按红框宽度做单行 / 优先级 56px」）：
 *   12 微轨 = 看板 3 列 × 4。因为 看板列宽 W = 4t + 3g（4 微轨 3 间隙），
 *   所以 3 列 = 12 微轨 + 11 间隙 = 表单总宽 → 两者**严格同宽**，
 *   且能用「半列 / 整列」粒度表达用户红框的宽度序列：
 *     任务标题 1/5(整列1) · 截止日期 5/9(整列2) · 优先级 9/11(半列3) · 标签 11/13(半列3) + 加号叠右端
 *   筛选行：搜索 1/7(一列半) · 联动记录 7/10 · 标签 10/13
 *
 * CDP 实测（v3.7.59，三档断点全部与看板框线咬合）：
 *   vp=1440 看板[287/536 556/804 824/1073]
 *     任务标 287-536 · 截止日 556-804 · 优先级 824-880(56) · 标签 959-1073 · ＋ 1035-1073
 *   vp=1120 看板[243/416 424/596 604/777]
 *     任务标 243-416 · 截止日 424-596 · 优先级 604-660(56) · 标签 695-777 · ＋ 739-777
 *   vp=1024 看板[243/384 392/532 540/681]
 *     任务标 243-384 · 截止日 392-532 · 优先级 540-596(56) · 标签 615-681 · ＋ 643-681
 *
 * ⚠️ 改实现必须同步改本文件（CI 因此红过多次）；改测试文件要整篇重写，禁止正则手术。
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CSS = fs.readFileSync(path.join(ROOT, "agent-workbench.html"), "utf8");
const JS = fs.readFileSync(path.join(ROOT, "src/render-scene-main.js"), "utf8");

describe("看板卡 · 共用列栅格", () => {
  it("存在 .form-row--board 的 12 微轨栅格，且与看板三列**同构**（对齐的数学保证）", () => {
    /* v3.7.59 起：表单 = 12 个等宽微轨 + 与看板**同一个**列间距（1 列 = 4 微轨）。
       数学：看板列宽 W = 4t + 3g → 3 列 + 2 个列间 gap = 12t + 11g = 表单总宽，
       所以只要「轨数 = 列数 × 4」且「gap 相同」，字段边界必然与卡边框线咬合（实测 0px 误差）。
       ⚠️ 这两条必须成对存在，少一条对齐就崩：
       · 表单轨数 = 看板列数 × 4
       · 两者用同一个 gap token
       具体数值不在本文件钉（避免"改一处漏一处"），只断结构关系。 */
    const m = CSS.match(/\.form-row--board\{[^}]*\}/);
    expect(m, "应存在 .form-row--board 规则").toBeTruthy();
    expect(m[0]).toContain("display:grid");
    /* 模板既有展开写法也有 repeat(N,…) 简写 —— 数轨要同时兼容两种写法：
       ① 逐个展开 "minmax(0,1fr) minmax(0,1fr)…"  ② 简写 "repeat(12,minmax(0,1fr))" */
    const tpl = (m[0].match(/grid-template-columns:([^;]+)/) || [])[1] || "";
    const rep = tpl.match(/repeat\((\d+),minmax\(0,1fr\)\)/);
    const tracks = rep ? Number(rep[1]) : (tpl.match(/minmax\(0,[\d.]+fr\)/g) || []).length;
    expect(tracks, "表单轨数应为 12（= 看板 3 列的 4 倍 · v3.7.59 微轨化）").toBe(12);
    /* 看板列数 */
    const kb = CSS.match(/\.kanban\{[^}]*grid-template-columns:repeat\((\d+),minmax\(0,1fr\)\)/);
    expect(kb, "看板应为 repeat(N,minmax(0,1fr))").toBeTruthy();
    expect(tracks, "表单轨数 = 看板列数 × 4（1 列 = 4 微轨）").toBe(Number(kb[1]) * 4);
    /* 轨宽：**12 轨等宽**（v3.7.59）。等宽才能与看板保持 4t+3g=W 的精确关系。
       ⚠️ 优先级**绝不能**用固定 px 写进轨定义 —— 那会破坏等分（实测 1440 下截止日期被挤掉 69px）；
       它的窄是靠「select width:56px」实现的。 */
    expect(rep, "12 轨应用 repeat(12,minmax(0,1fr)) 等宽写法").toBeTruthy();
    expect(tpl, "不应再出现 1.333fr 的比例轨").not.toContain("1.333fr");
    /* 同一个列间距 —— 注意：看板**基础规则**写 --space-2，但桌面媒体查询里覆盖为 --space-5
       （实测桌面 1440 下看板 column-gap = 20px = --space-5）。所以要比的是**桌面生效值**。 */
    const formGap = (m[0].match(/gap:var\((--[\w-]+)\) var\((--[\w-]+)\)/) || [])[2];
    expect(formGap, "表单需显式给列间距 token").toBeTruthy();
    expect(formGap, "表单列间距应为 --space-5（与看板桌面生效值一致）").toBe("--space-5");
    expect(CSS, "看板桌面下也必须是 --space-5").toMatch(/\.kanban\{[^}]*gap:var\(--space-5\)/);
    expect(m[0]).toContain("align-items:end");
  });

  it("跨轨规则齐备：所有 fld-* 统一 span 3（等宽四列）", () => {
    /* v3.7.60：所有 fld-* 统一 span 3 —— 等宽四列，不再区分宽窄。 */
    expect(CSS).toMatch(/\.form-row--board>\.fld-xl\{grid-column:span 3\}/);
    expect(CSS).toMatch(/\.form-row--board>\.fld-lg\{grid-column:span 3\}/);
    expect(CSS).toMatch(/\.form-row--board>\.fld-fill\{grid-column:span 3\}/);
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

  it("有窄屏回退（否则小屏下 12 轨会挤成条）—— 断点 1023px，须覆盖 768 的平板", () => {
    /* v3.7.29：断点原写 760px，实测平板 768 不触发回退 → 轨道过窄、e2e tablet 整片超时。
       v3.7.58：抬到 **1023px** —— 实测 1024px 时微轨只剩 ~16px（不可用），
       而平板档(768-1023)看板本来就是 2 列，表单同期退回 2 列才同构。 */
    expect(CSS).toMatch(/@media \(max-width:1023px\)\{[\s\S]*?\.form-row--board\{grid-template-columns:1fr 1fr/);
    expect(CSS).not.toMatch(/@media \(max-width:760px\)\{\s*\.form-row--board/);
  });

  it("窄 PC(1024-1439) 保持**单行**、只把列间距收紧到 --space-2（v3.7.59）", () => {
    /* 用户 1128px 截图实证 + 明确指令：「按红框宽度做单行」。
       v3.7.58 曾在此区间改成上下两行 —— 那是**错的**（用户原话"我让你向东，你非要向西"），
       v3.7.59 已撤销：PC 档永远单行，窄只是把 gap 从 --space-5(20) 降到 --space-2(8)。 */
    const m = CSS.match(/@media \(min-width:1024px\) and \(max-width:1439px\)\{[\s\S]*?\n\}/);
    expect(m, "应存在 1024-1439 区间的表单间距收紧规则").toBeTruthy();
    const blk = m[0];
    expect(blk, "只收紧列间距到 --space-2（跟随该档看板）").toContain(".form-row--board{gap:var(--space-2) var(--space-2)}");
    /* 关键回归护栏：本区间**不得**再出现任何「行位」重排 —— 那正是 v3.7.5 的错误 */
    expect(blk, "窄 PC 不得把字段推到第 2 行（v3.7.5 的错就在这）").not.toContain("grid-row:2");
    expect(blk, "窄 PC 不得改 id 显式列位（保持单行红框布局）").not.toContain("#taskForm>.fld");
    expect(blk, "窄 PC 不得用 justify-self 改加号位置（保持最右）").not.toContain("justify-self");
  });
});

describe("看板卡 · 标记侧", () => {
  it("任务表单与筛选行都带上了变体类（两行必须同一套栅格才谈得上对齐）", () => {
    expect(JS).toContain('class="form-row form-row--board" id="taskForm"');
    // v3.7.57：筛选行加 id="taskFilterRow" —— 两行都显式定位，标签列位上下对齐
    expect(JS).toContain('const tagFilterHTML = `<div class="form-row form-row--board" id="taskFilterRow">');
  });

  it("两行的显式列位：等宽四列（v3.7.60 起字段宽度统一）", () => {
    /* v3.7.60：任务表单改为**等宽四列**（每列 span 3），字段宽度统一、视觉规整。
       标题(1/4) · 截止日期(4/7) · 优先级(7/10) · 标签(10/13) —— 四个字段等宽。
       筛选行：搜索(1/4) · 联动记录(4/7) · 标签筛选(7/13) —— 前两字段与任务表单对齐。 */
    expect(CSS).toContain('#taskForm>.fld:nth-child(1){grid-column:1/4;grid-row:1}');
    expect(CSS).toContain('#taskForm>.fld:nth-child(2){grid-column:4/7;grid-row:1}');
    expect(CSS).toContain('#taskForm>.fld:nth-child(3){grid-column:7/10;grid-row:1;min-width:0}');
    expect(CSS).toContain('#taskForm>.fld:nth-child(4){grid-column:10/13;grid-row:1}');
    // 优先级 select 撑满轨道
    expect(CSS, "优先级 select 应撑满轨道").toContain("#taskForm>.fld:nth-child(3)>select{width:100%}");
    // 标签输入框右侧给加号让出 44px
    expect(CSS).toContain("#taskForm>.fld:nth-child(4)>input{padding-right:44px}");
    // 加号：靠右对齐、底对齐。
    expect(CSS).toContain('#taskForm>.add-wrap{grid-column:10/13;grid-row:1;justify-self:end;align-self:end;');
    // 筛选行前两字段与任务表单对齐，第三字段延伸到末尾
    expect(CSS).toContain('#taskFilterRow>.fld:nth-child(1){grid-column:1/4;grid-row:1}');
    expect(CSS).toContain('#taskFilterRow>.fld:nth-child(2){grid-column:4/7;grid-row:1}');
    expect(CSS).toContain('#taskFilterRow>.fld:nth-child(3){grid-column:7/13;grid-row:1}');
    // 加号与输入框底对齐
    expect(CSS).not.toContain('#taskForm>.add-wrap{grid-column:10/13;grid-row:1;justify-self:end;align-self:center');
  });

  it("窄屏解除显式定位（column 与 row 都要解除，否则挤成一行造隐式列）", () => {
    /* 实测（768px）：只解除 grid-column 时 5 个元素仍被 grid-row:1 钉在第 1 行，
       auto-placement 造出隐式列（模板变 0 0 47 47 38 五轨、两字段宽 0）。 */
    expect(CSS).toContain('{grid-column:auto;grid-row:auto}');
    /* 窄屏还要撤掉标签框给加号预留的右内边距（加号此时已换行/不叠加） */
    expect(CSS).toContain("#taskForm>.fld:nth-child(4)>input{padding-right:0}");
  });

  it("筛选行的标签字段带跨轨类（跨 4 微轨 = 看板一列）", () => {
    expect(JS).toContain('class="fld fld-lg fld-fill"><label for="tagFilter"');
  });

  it("只动了看板这两行，未波及其它 .form-row（28 处保持原样）", () => {
    const total = (JS.match(/class="form-row/g) || []).length;
    const board = (JS.match(/class="form-row form-row--board/g) || []).length;
    expect(board, "本文件里只有看板这两行用了变体").toBe(2);
    expect(total, "其余 .form-row 仍是普通写法").toBeGreaterThan(board);
  });
});
