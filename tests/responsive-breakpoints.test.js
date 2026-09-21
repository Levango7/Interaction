/**
 * responsive-breakpoints.test.js —— 响应式三档守护（v3.7.7 创立）
 * ----------------------------------------------------------------------------
 * 用户要求的优先级顺序：**先 PC 宽屏 → 再 phone 竖屏 → 再 pad**。
 * 三档各自的验收标准（CDP 实测定稿，见下方数值）：
 *
 *   PC 宽屏  ≥1024：表单/筛选行字段边界 = 看板列框线（误差 0px）。
 *            1920 列宽 408.7 · 1600 302 · 1440 248.7 · 1080 159.3 —— 全部 0px。
 *   phone竖屏 ≤767：看板单列垂直堆叠；表单 2 列；加号单格右对齐（避开宠物浮层）；无横向溢出。
 *   pad 768-1023 ：看板列宽**自适应**（下限 160px）——
 *            768 主区仅 212px → 1 列 212px；900 → 2 列 168px；1023 → 2 列 229px。
 *
 * ⚠️ 两条历次事故（改本文件前先读）：
 *  ① 断点只有 4 个：≥1440 / 1024-1439 / 768-1023 / ≤767（另 ≤600 细分看板）。
 *     不要引入新断点值 —— `max-width:768px` 与 `max-width:767px` 同时存在时，
 *     768 那一个像素宽的视口会同时命中两套规则。
 *  ② pad 看板**绝不能再写死 `repeat(2,minmax(0,1fr))`** ——
 *     768px 下侧栏占 180px、主区只剩 212px，两列各 **102px**，卡片完全放不下（实测）。
 *
 * ⚠️ 改实现必须同步改本文件；改测试文件要整篇重写，禁止正则手术。
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CSS = fs.readFileSync(path.join(ROOT, "agent-workbench.html"), "utf8");

/**
 * 取**全部**同 query 的媒体查询块，返回其中包含 needle 的那一块。
 * ⚠️ 同一个 query 在文件里常有多处（如 min-width:1440px 有 3 处、
 * max-width:600px 有 4 处）—— 只取第一条必然误判。本项目媒体查询的结束
 * 花括号都在行首，故用 `\n}` 截断。
 */
function mediaBlock(query, needle) {
  const re = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\{[\\s\\S]*?\\n\\}", "g");
  const blocks = CSS.match(re) || [];
  if (!needle) return blocks[0] || null;
  return blocks.find(b => b.includes(needle)) || null;
}

const PAD_Q = "@media(min-width:768px) and (max-width:1023px)";
const NARROW_FORM_Q = "@media (max-width:1023px)";
const SMALL_PC_Q = "@media (min-width:1024px) and (max-width:1439px)";
const WIDE_Q = "@media(min-width:1440px)";

describe("响应式三档 · pad(768-1023)", () => {
  it("看板列宽**自适应**（auto-fit），不得写死 2 列", () => {
    /* 血泪：v3.2 起写死 repeat(2,minmax(0,1fr))，768px 下每列只剩 102px（用户环境侧栏 180px）。
       改 auto-fit minmax(160px,1fr) 后：768→1 列 212 · 900→2 列 168 · 1023→2 列 229。 */
    const blk = mediaBlock(PAD_Q, "auto-fit");
    expect(blk, "平板断点里应有 auto-fit 自适应列宽").toBeTruthy();
    expect(blk, "平板看板应用 minmax(160px,1fr)").toContain("repeat(auto-fit,minmax(160px,1fr))");
    expect(blk, "不得写死 2 列（768px 会压成 102px 卡片放不下）")
      .not.toContain("grid-template-columns:repeat(2,minmax(0,1fr))");
  });

  it("平板侧栏保持紧凑 180px（不吃掉主区）", () => {
    const blk = mediaBlock(PAD_Q, ".side{width:180px");
    expect(blk, "平板断点应把侧栏收到 180px").toBeTruthy();
  });
});

describe("响应式三档 · phone 竖屏(≤767)", () => {
  it("看板单列垂直堆叠（实测 390/430 三列 top 各不相同）", () => {
    /* ⚠️ 单列规则写在 **≤767**（移动端主断点），不是 ≤600 —— 后者只处理顶栏按钮等细节。
       我第一版断言写在 600 上，实测 390 的三列 top=974/1368/1516 明显是 ≤767 那条生效。 */
    const blk = mediaBlock("@media(max-width:767px)", ".kanban{grid-template-columns:1fr}");
    expect(blk, "≤767 应把看板压成单列").toBeTruthy();
  });
});

describe("响应式三档 · 窄屏表单回退(≤1023)", () => {
  it("表单退回 2 列、列间距跟随降到 --space-3", () => {
    const blk = mediaBlock(NARROW_FORM_Q, "grid-template-columns:1fr 1fr");
    expect(blk, "应存在 ≤1023 表单回退").toBeTruthy();
    expect(blk).toContain(".form-row--board{grid-template-columns:1fr 1fr;gap:var(--space-2) var(--space-3)}");
  });

  it("加号保持单格右对齐（**不要**跨行贴右 —— 会落进宠物浮层被遮挡）", () => {
    /* 实测 390px：跨行贴右 → 加号落到 309-347，正好被右下角的桌面宠物盖住，点不到。
       回到 auto-placement 的列 1 右对齐（166-204）后既避开宠物、又紧邻右列的「标签」字段。 */
    const blk = mediaBlock(NARROW_FORM_Q, "#taskForm>.add-wrap");
    expect(blk, "窄屏应显式声明加号列位").toBeTruthy();
    expect(blk, "加号保持单格（auto）右对齐").toContain("#taskForm>.add-wrap{grid-column:auto;justify-self:end");
    /* ⚠️ 只匹配**规则行**，不能用 `not.toContain("grid-column:1/-1")` ——
       上方注释里为了留档写了「试过 grid-column:1/-1 但被宠物盖住」，toContain 会扫到注释。 */
    expect(blk, "不得跨行贴右（宠物遮挡）").not.toMatch(/#taskForm>\.add-wrap\{grid-column:1\/-1/);
  });
});

describe("响应式三档 · PC 宽屏(≥1024) 不得重排", () => {
  it("1024-1439 只收列间距，不得改行位或列位", () => {
    const blk = mediaBlock(SMALL_PC_Q, "gap:var(--space-2) var(--space-2)");
    expect(blk, "应存在 1024-1439 区间规则").toBeTruthy();
    expect(blk, "只收紧列间距").toContain(".form-row--board{gap:var(--space-2) var(--space-2)}");
    expect(blk, "PC 不得把字段推到第 2 行").not.toContain("grid-row:2");
    expect(blk, "PC 不得改 id 显式列位").not.toContain("#taskForm>.fld");
  });

  it("≥1440 放宽看板间距，且不得重排行位", () => {
    const blk = mediaBlock(WIDE_Q, ".kanban{gap:var(--space-5)}");
    expect(blk, "应存在大屏断点并把看板间距放到 --space-5").toBeTruthy();
    expect(blk, "≥1440 不得重排行位").not.toContain("grid-row:2");
  });
});
