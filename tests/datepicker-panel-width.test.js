/**
 * datepicker-panel-width.test.js —— 日期下拉面板守护（v3.7.57 创立 / v3.7.8 重写）
 * ----------------------------------------------------------------------------
 * 面板是**全站共用**的（所有 `input[data-date-picker="1"]`）—— 它的每个毛病都会在
 * 主表单 / 记录工具卡 / 编辑弹窗里同时出现，所以这里的守护要写得细。
 *
 * v3.7.8 定稿（依据用户 2026-09-21 截图 + 文字标注）：
 *  ① **永远向下展开**（用户原话："下拉框，不是上拉框"）。
 *     旧实现在下方空间不足时翻到输入框上方；用户窗口只有 560px 高，面板必然上翻。
 *     新策略：不够就先把输入框上移腾空间；仍不够就压缩高度 + 内部滚动。**绝不翻上去**。
 *  ② **宽度收敛到 [206, 260]**（用户："日期的下拉框没必要这么宽大"）。
 *     旧实现 `min-width:220 + width:max-content` 会被表头撑到 ~270px，比输入框还宽。
 *  ③ **滚动跟随重定位，而不是关闭面板**。
 *     旧的 scroll handler 是 `_dpClose()` —— 结果 ① 里的"滚动腾空间"把面板自己关掉了
 *     （矮窗口下表现为"点了日期框什么都不出现"）。
 *  ④ **z-index 必须是 `calc(var(--z-modal,3000) + 1)`**。
 *     旧写法少了 calc → 整条声明非法被丢弃 → 面板 z-index:auto → 触发它的输入框
 *     反过来盖在日历上（截图里「选日期」文字压在日期格上）。
 *
 * CDP 实测（v3.7.8，四档全部向下且完整显示、无需滚动）：
 *   1080x560 → 面板 206x286 top258(输入框 bottom252) · 1600x900 → 260x302 · 1280x620 → 226x286 · 1024x500 → 206x286
 *
 * ⚠️ 改实现必须同步改本文件；改测试文件要整篇重写，禁止正则手术。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const JS_MAIN = readFileSync(join(ROOT, "src/render-scene-main.js"), "utf8");
const HTML = readFileSync(join(ROOT, "agent-workbench.html"), "utf8");

describe("日期面板 · 宽度跟随输入框并收敛到 [206,260]（v3.7.8）", () => {
  it("_dpOpen 按输入框宽度取**固定**宽度（不再 min-width）", () => {
    expect(JS_MAIN).toContain("const iw = Math.round(input.getBoundingClientRect().width || 0);");
    expect(JS_MAIN).toContain("const panelW = Math.min(260, Math.max(206, iw));");
    expect(JS_MAIN).toContain('panel.style.width = panelW + "px"');
    /* 回到 min-width 就会重新被表头撑宽 —— 这是本条守护的核心 */
    expect(JS_MAIN, "不得再设 panel.style.minWidth").not.toContain("panel.style.minWidth");
  });

  it("CSS 用固定 width + max-width，不再 max-content / min-width:2xx", () => {
    expect(HTML).toMatch(/\.dp-panel\{[^}]*width:220px/);
    expect(HTML).toMatch(/\.dp-panel\{[^}]*max-width:260px/);
    expect(HTML, "max-content 会被表头撑到 ~270px").not.toMatch(/\.dp-panel\{[^}]*width:max-content/);
    expect(HTML, "旧地板 220/250 都应消失").not.toMatch(/\.dp-panel\{[^}]*min-width:2\d\dpx/);
  });
});

describe("日期面板 · 永远向下展开（v3.7.8 · 用户：「下拉框，不是上拉框」）", () => {
  it("定位里不得出现「翻到输入框上方」的写法", () => {
    /* 旧写法特征：Math.min(r.top - ph - GAP, …) / top = Math.max(8, r.top - ph - 6) */
    expect(JS_MAIN).not.toMatch(/r\.top\s*-\s*(ph|panel\.offsetHeight)/);
  });

  it("下方放不下时先**上移输入框**腾空间（而非改方向）", () => {
    expect(JS_MAIN).toContain("const wantBottom = Math.max(80, window.innerHeight - (panel.offsetHeight + GAP + 16));");
    expect(JS_MAIN, "需要能往上找到真正在滚的祖先容器").toContain("function _dpScroller(el)");
  });

  it("面板起点始终是输入框下沿 + 间隙", () => {
    expect(JS_MAIN).toContain("let top = r.bottom + GAP;");
  });
});

describe("日期面板 · 滚动跟随而非关闭（v3.7.8）", () => {
  it("scroll 监听器调 _dpLayout(false)", () => {
    expect(JS_MAIN).toContain('window.addEventListener("scroll", function(){ _dpLayout(false); }, true);');
    /* 旧的"一滚动就关"会把 _dpLayout 里的滚动腾空间动作变成自杀 */
    expect(JS_MAIN).not.toContain('window.addEventListener("scroll", function(){ _dpClose(); }, true);');
  });

  it("打开时用 _dpLayout(true)（允许滚动腾空间），切月后重算位置", () => {
    expect(JS_MAIN).toContain("_dpLayout(true);");
    expect(JS_MAIN).toMatch(/_dpRender\(\);\s*_dpLayout\(false\);/);
  });
});

describe("日期面板 · z-index 必须是合法 calc（v3.7.8）", () => {
  it("面板层级 = --z-modal + 1（用 calc 包裹）", () => {
    expect(HTML).toMatch(/\.dp-panel\{[^}]*z-index:calc\(var\(--z-modal,3000\) \+ 1\)/);
  });

  it("全文不得出现 `var(--z-xxx)+1` 这类非法写法（整条声明会被丢弃）", () => {
    /* CSS 里 `80+1` 不是合法 <integer>，必须写 calc(80 + 1)。这个坑踩过一次：
       面板 z-index 失效 → 触发它的输入框盖在日历上。 */
    expect(HTML).not.toMatch(/z-index:var\(--z-[a-z-]*\)[+-]\d/);
  });
});

describe("placeholder 提亮加粗（v3.7.8 · 用户：「字体大一点，粗一点，显眼一点」）", () => {
  it("全局 ::placeholder 有 color / weight / opacity 三项", () => {
    expect(HTML).toMatch(/input::placeholder,textarea::placeholder\{color:var\(--text-dim\);font-weight:600;opacity:1\}/);
  });

  it("日期框 placeholder 跟随全局（不再单独用更淡的 --text-faint）", () => {
    expect(HTML).toContain("input[data-date-picker]::placeholder{color:var(--text-dim)}");
  });

  it("输入框基础字号提到 --fs-base（原来 --fs-sm 偏小）", () => {
    expect(HTML).toMatch(/input,select,textarea\{font-family:inherit;font-size:var\(--fs-base\)/);
  });
});

describe("加号与输入框底对齐（chain-add-row，v3.7.57）", () => {
  it("chain-add-row 补上 v3.2 漏掉的横排化（实测 61px→38px、错位 11px→0）", () => {
    expect(HTML).toContain(".chain-add-row .add-wrap{flex-direction:row;align-items:center;gap:0}");
    expect(HTML).toContain(".chain-add-row .add-wrap .add-label{display:none}");
    expect(HTML).toContain(".chain-add-row .add-wrap .add-round{width:var(--control-h);height:var(--control-h)}");
  });
});
