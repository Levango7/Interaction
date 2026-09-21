/**
 * board-form-grid.test.js —— 看板卡两行共用列栅格（v3.7.29 创立 / v3.7.57 重排）
 * ----------------------------------------------------------------------------
 * 问题（截图实证）：看板卡里两行字段各自 flex，列宽由内容决定 →
 *   同列的东西不在同一条竖线上（行1「截止日期」右缘 672、行2「联动记录」左缘 684）。
 *
 * v3.7.57 现状（用户定稿「截止日期与下拉面板同宽 / 优先级窄 / 标签窄」）：
 *   6 轨 = 看板 3 列各拆两半，两行全部**显式定位**：
 *     行1：任务标题 轨1-2(249=待办列) · 截止日期 轨3-4(249=进行中列)
 *          优先级 轨5(114) · 标签 轨6(114) + 加号叠加其右端（align-self:end）
 *     行2：搜索 轨1-3(383) · 联动记录 轨4-5(249) · 标签 轨6(114，与上方同位)
 *
 * CDP 实测（v3.7.4）：
 *   待办列 287→536 · 进行中列 556→804 · 已完成列 824→1073
 *   → 标题右缘=待办右缘 0 / 截止整列=进行中列 0 / 优先级左缘=已完成左缘 0 / 加号右缘=已完成右缘 0
 *   → 截止日期输入框 249 = 日期面板 249（差 0，旧态差 136px）
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
  it("存在 .form-row--board 的 6 轨栅格，且与看板三列**同构**（对齐的数学保证）", () => {
    /* v3.7.44 起：表单 = 6 个等宽轨道 + 与看板**同一个**列间距（3 列各拆两半）。
       这样 2t + g === 看板列宽 必然成立 → 字段边界与卡边框线自动咬合（实测 0px 误差）。
       ⚠️ 这两条必须成对存在，少一条对齐就崩：
       · 表单轨数 = 看板列数 × 2
       · 两者用同一个 gap token
       具体数值不在本文件钉（避免"改一处漏一处"），只断结构关系。 */
    const m = CSS.match(/\.form-row--board\{[^}]*\}/);
    expect(m, "应存在 .form-row--board 规则").toBeTruthy();
    expect(m[0]).toContain("display:grid");
    /* v3.7.58：模板改为 repeat(6,minmax(0,1fr)) 简写 —— 数轨要同时兼容两种写法：
       ① 逐个展开 "minmax(0,1fr) minmax(0,1fr)…"  ② 简写 "repeat(6,minmax(0,1fr))" */
    const tpl = (m[0].match(/grid-template-columns:([^;]+)/) || [])[1] || "";
    const rep = tpl.match(/repeat\((\d+),minmax\(0,1fr\)\)/);
    const tracks = rep ? Number(rep[1]) : (tpl.match(/minmax\(0,[\d.]+fr\)/g) || []).length;
    expect(tracks, "表单轨数应为 6（= 看板 3 列的 2 倍）").toBe(6);
    /* 看板列数 */
    const kb = CSS.match(/\.kanban\{[^}]*grid-template-columns:repeat\((\d+),minmax\(0,1fr\)\)/);
    expect(kb, "看板应为 repeat(N,minmax(0,1fr))").toBeTruthy();
    expect(tracks, "表单轨数 = 看板列数 × 2").toBe(Number(kb[1]) * 2);
    /* 轨宽：**6 轨等宽**（用户 2026-09-21 定稿：「输入框与下拉框同宽」，
       取代早先的「截止日期:优先级 = 2:1」）。等宽时 列2 的 1+1 自然等于 列1 的 1+1，边界不变。 */
    expect(rep, "6 轨应用 repeat(6,minmax(0,1fr)) 等宽写法").toBeTruthy();
    expect(tpl, "不应再出现 1.333fr 的比例轨").not.toContain("1.333fr");
    /* 同一个列间距 —— 注意：看板**基础规则**写 --space-2，但桌面媒体查询里覆盖为 --space-5
       （实测桌面 1440 下看板 column-gap = 20px = --space-5）。所以要比的是**桌面生效值**。 */
    const formGap = (m[0].match(/gap:var\((--[\w-]+)\) var\((--[\w-]+)\)/) || [])[2];
    expect(formGap, "表单需显式给列间距 token").toBeTruthy();
    expect(formGap, "表单列间距应为 --space-5（与看板桌面生效值一致）").toBe("--space-5");
    expect(CSS, "看板桌面下也必须是 --space-5").toMatch(/\.kanban\{[^}]*gap:var\(--space-5\)/);
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

  it("有窄屏回退（否则小屏下 6 轨会挤成条）—— 断点 1023px，须覆盖 768 的平板", () => {
    /* v3.7.29：断点原写 760px，实测平板 768 不触发回退 → 轨道过窄、e2e tablet 整片超时。
       v3.7.58：抬到 **1023px** —— 实测 1024px 时 6 轨只剩 63px（优先级/标签不可用），
       而平板档(768-1023)看板本来就是 2 列，表单同期退回 2 列才同构。 */
    expect(CSS).toMatch(/@media \(max-width:1023px\)\{[\s\S]*?\.form-row--board\{grid-template-columns:1fr 1fr/);
    expect(CSS).not.toMatch(/@media \(max-width:760px\)\{\s*\.form-row--board/);
  });

  it("窄 PC(1024-1439) 改上下两行，且间距跟随看板降到 12px（v3.7.58）", () => {
    /* 用户 1128px 截图实证：6 轨等分 84px → 标签框「逗号分隔」截断、label 竖成两行。
       取舍（用户决定）：窄屏放弃与看板列严格对齐，改两行 —— 标题+截止日期 / 优先级+标签+加号 */
    const m = CSS.match(/@media \(min-width:1024px\) and \(max-width:1439px\)\{[\s\S]*?\n\}/);
    expect(m, "应存在 1024-1439 区间的表单重排规则").toBeTruthy();
    const blk = m[0];
    expect(blk, "标题跨 1-3 轨占首行").toContain("#taskForm>.fld:nth-child(1){grid-column:1/4;grid-row:1}");
    expect(blk, "截止日期跨 4-6 轨占首行").toContain("#taskForm>.fld:nth-child(2){grid-column:4/7;grid-row:1}");
    expect(blk, "优先级落到第二行").toContain("#taskForm>.fld:nth-child(3){grid-column:1/3;grid-row:2}");
    expect(blk, "标签落到第二行").toContain("#taskForm>.fld:nth-child(4){grid-column:3/5;grid-row:2}");
    // 加号必须紧跟标签框（justify-self:start），用 end 会把它推到容器最右造成悬空
    expect(blk, "加号紧跟标签框而非推到最右").toContain("justify-self:start");
  });
});

describe("看板卡 · 标记侧", () => {
  it("任务表单与筛选行都带上了变体类（两行必须同一套栅格才谈得上对齐）", () => {
    expect(JS).toContain('class="form-row form-row--board" id="taskForm"');
    // v3.7.57：筛选行加 id="taskFilterRow" —— 两行都显式定位，标签列位上下对齐
    expect(JS).toContain('const tagFilterHTML = `<div class="form-row form-row--board" id="taskFilterRow">');
  });

  it("两行的显式列位互相咬合（标签列上下同位，截止日期占满进行中列）", () => {
    // v3.7.57：这些是 CSS 规则，真相源在 HTML（src-split 只管 JS，CSS 不进 src）
    // 第一行：标题轨1-2 · 截止日期轨3-4 · 优先级轨5 · 标签轨6
    expect(CSS).toContain('#taskForm>.fld:nth-child(2){grid-column:3/5;grid-row:1}');
    expect(CSS).toContain('#taskForm>.fld:nth-child(3){grid-column:5/6;grid-row:1}');
    expect(CSS).toContain('#taskForm>.fld:nth-child(4){grid-column:6/7;grid-row:1}');
    expect(CSS).toContain('#taskForm>.add-wrap{grid-column:6/7;grid-row:1;justify-self:end;align-self:end;');
    // 筛选行：搜索轨1-3 · 联动记录轨4-5 · 标签轨6（与第一行标签同位）
    expect(CSS).toContain('#taskFilterRow>.fld:nth-child(1){grid-column:1/4;grid-row:1}');
    expect(CSS).toContain('#taskFilterRow>.fld:nth-child(3){grid-column:6/7;grid-row:1}');
    // 加号与输入框底对齐（align-self:center 会让 38px 按钮比输入框高出 13px——实测过的坑）
    expect(CSS).not.toContain('#taskForm>.add-wrap{grid-column:6/7;grid-row:1;justify-self:end;align-self:center');
  });

  it("窄屏解除两行的 id 显式定位（column 与 row 都要解除，否则挤成一行造隐式列）", () => {
    /* 实测（768px）：只解除 grid-column 时 5 个元素仍被 grid-row:1 钉在第 1 行，
       auto-placement 造出隐式列（模板变 0 0 47 47 38 五轨、两字段宽 0）。 */
    expect(CSS).toContain('{grid-column:auto;grid-row:auto}');
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
