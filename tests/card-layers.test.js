/**
 * card-layers.test.js —— 看板卡的层次与四行结构（v3.7.46/48 版）
 * ----------------------------------------------------------------------------
 * 卡片自上而下四行：
 *   第1行 `.t`      标题
 *   第2行 `.kstate` 状态（整行宽的圆角矩形卡 · 点它可切换状态）
 *   第3行 `.m`      属性 chips（**左右均匀分布**——用户规格："三个的位置太偏左，左中右"）
 *   第4行 `.kbtns`  操作按钮（**窄一点 + 间距大一点 + 左右中分布**——用户规格）
 *
 * ⚠️ 两条血泪教训（改本文件前先读）：
 *  ① 状态/操作两类按钮必须是**同一套圆角矩形外观**（背景/边框/圆角/最小高逐项一致）——
 *     全局 `button{border:none;background:none}` 之下，少补一项就会退化成"一行纯文字"。
 *  ② 操作按钮**等分填满一行**：用户明确要求"左右宽度小一点、间距大一点、左中右" →
 *     按钮要「宽、饱满**且留间距**」→ `flex:1 1 0`（basis 0，先扣间距再分空间）+ `:not(:last-child){margin-right}` 给间距。
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CSS = fs.readFileSync(path.join(ROOT, "agent-workbench.html"), "utf8");
const JS = fs.readFileSync(path.join(ROOT, "src/render-scene-main.js"), "utf8");
const BIND = fs.readFileSync(path.join(ROOT, "src/ui-scene-bind.js"), "utf8");

/** 取某选择器的**全部**规则体（同名可能多条，真实样式是它们的叠加） */
function allRules(sel) {
  const out = []; let i = 0;
  while ((i = CSS.indexOf(sel + '{', i)) >= 0) {
    let d = 0; const s = CSS.indexOf('{', i);
    for (let k = s; k < CSS.length; k++) {
      if (CSS[k] === '{') d++; else if (CSS[k] === '}') { d--; if (!d) { out.push(CSS.slice(s + 1, k)); i = k; break; } }
    }
    i++;
  }
  return out.join(' ');
}

describe("卡片四行结构", () => {
  it("行序：标题 → 状态 → 属性 → 操作", () => {
    const i = JS.indexOf('return `<div class="kcard"');
    const seg = JS.slice(i, i + 900);
    const st = seg.indexOf('class="kstate"'), m = seg.indexOf('class="m"'), kb = seg.indexOf("kbtns");
    expect(st).toBeGreaterThan(-1); expect(m).toBeGreaterThan(-1); expect(kb).toBeGreaterThan(-1);
    expect(seg.indexOf('class="t"')).toBeLessThan(st);
    expect(st).toBeLessThan(m);
    expect(m).toBeLessThan(kb);
  });

  it("状态行引用 btns；data-move 定义在 btns 赋值处", () => {
    const i = JS.indexOf('return `<div class="kcard"');
    expect(JS.slice(i, i + 900)).toContain("${btns}");
    expect(JS.slice(0, i)).toMatch(/data-move/);
  });

  it("状态按钮的绑定是全文档查询（挪位置安全的前提）", () => {
    expect(BIND).toMatch(/\$\$\("\[data-move\]"\)\.forEach/);
  });
});

describe("状态/操作按钮：同一套圆角矩形外观", () => {
  const st = allRules('.kstate button'), kb = allRules('.kbtns button');

  it("状态按钮整行宽（flex:1 / width:100%）", () => {
    expect(CSS).toMatch(/\.kstate\{display:flex/);
    expect(CSS).toMatch(/\.kstate button\{flex:1/);
  });

  it("四项目外观看齐：背景 / 边框 / 圆角 / 最小高", () => {
    ['background:var(--panel2)', 'border:1px solid var(--line)', 'border-radius:var(--radius-sm)', 'min-height']
      .forEach(k => { expect(st, '状态按钮缺 ' + k).toContain(k); expect(kb, '操作按钮缺 ' + k).toContain(k); });
  });

  it("两类按钮都有 hover", () => {
    expect(CSS).toMatch(/\.kstate button:hover\{background:var\(--surface-hover\)/);
    expect(CSS).toMatch(/\.kbtns button:hover\{background:var\(--surface-hover\)/);
  });
});

describe("操作按钮：窄一点 + 间距大一点 + 左中右（用户规格）", () => {
  it("等宽 + 留间距 + 左中右（flex:1 1 0 + margin 间距）", () => {
    /* v3.7.55 定稿：**flex-basis 必须是 0**（auto 会让按钮先把间距吃掉，实测间距只剩 1px）；
       间距用 `:not(:last-child){margin-right}` 给 —— `.kbtns` 的 gap 会被同名规则压掉（本项目老问题）。 */
    expect(CSS).toMatch(/\.kbtns button\{flex:1 1 0/);
    expect(CSS).toMatch(/\.kbtns button:not\(:last-child\)\{margin-right/);
    expect(CSS, '不应再回到 flex:1 等分').not.toMatch(/\.kbtns button\{flex:1\}/);
  });

  it("左右均匀分布：justify-content:space-between", () => {
    const kb = CSS.match(/\.kbtns\{[^}]*\}/);
    expect(kb[0]).toContain('justify-content:space-between');
  });
});

describe("属性 chips：左右均匀分布", () => {
  it(".kcard .m 用 space-between + flex", () => {
    /* ⚠️ .kcard .m 有**多条**规则（旧的 font-size/color 一条、分布这条另一条）——
       必须按 allRules 合并看，不能只取第一条（本文件开头已写明这个坑）。 */
    const m = allRules('.kcard .m');
    expect(m, '应存在 .kcard .m 规则').toBeTruthy();
    expect(m).toContain('display:flex');
    expect(m).toContain('justify-content:space-between');
  });
});

describe("列模板：6 轨 + 与看板同构（对齐的数学前提）", () => {
  it("表单为 12 个等宽 minmax(0,1fr) 轨（v3.7.59：微轨化，看板 1 列 = 4 微轨）", () => {
    /* ⚠️ .form-row--board 有多条规则，且**第一条未必含列模板** ——
       必须扫描出「含 grid-template-columns 的那条」，不能只取第一条（这个坑踩过多次）。 */
    const rules = []; let i = 0;
    while ((i = CSS.indexOf('.form-row--board{', i)) >= 0) { rules.push(CSS.slice(i, CSS.indexOf('}', i) + 1)); i++; }
    const tpl = rules.find(r => r.indexOf('grid-template-columns') >= 0);
    expect(tpl, '应有含列模板的 .form-row--board 规则').toBeTruthy();
    /* v3.7.58 起模板用 repeat(N,minmax(0,1fr)) 简写 → 数轨要兼容两种写法 */
    const tplVal = (tpl.match(/grid-template-columns:([^;]+)/) || [])[1] || '';
    const rep = tplVal.match(/repeat\((\d+),minmax\(0,1fr\)\)/);
    const tracks = rep ? Number(rep[1]) : (tplVal.match(/minmax\(0,1fr\)/g) || []).length;
    /* v3.7.59：6 轨 → 12 微轨。看板 1 列宽 W = 4t + 3g（4 微轨 3 间隙），
       故 3 列 = 12 微轨 + 11 间隙 → 表单 12 微轨与看板三列**严格同宽**，
       且能用"半列"粒度表达红框要求的宽度（优先级 56px / 截止日期整列等）。 */
    expect(tracks, '12 微轨（看板 3 列 × 4）').toBe(12);
    expect(tpl, '不应再有 1.333fr 的比例轨').not.toContain('1.333fr');
  });

  it("输入框也要 min-width:0（否则固有最小宽会把窄轨撑开）", () => {
    expect(CSS).toMatch(/\.form-row--board input[^{]*\{[^}]*min-width:0/);
  });
});

describe("输入框背景与卡片有差异", () => {
  it("输入框用 --surface-muted，不用与卡片同色的 --panel", () => {
    const m = CSS.match(/input,select,textarea\{[\s\S]*?\}/);
    expect(m[0]).toContain('background:var(--surface-muted)');
    expect(m[0]).not.toContain('background:var(--panel)');
  });
});

describe("卡片文字可读性（v3.7.9 · 用户：「字体大小，字体粗细，让字体显眼一点」）", () => {
  /* 背景：用户红框圈住待办卡片里的「→ 进行中」，要求字号、字重、显眼度一起提。
     实测旧态：.kstate button 只有 --fs-3xs（10px）——确实小到看不清。 */

  it("状态按钮：字号提到 --fs-sm 且加粗、文字色提到主色", () => {
    const st = allRules(".kstate button");
    expect(st, "状态按钮字号应 ≥ --fs-sm").toContain("font-size:var(--fs-sm)");
    expect(st, "必须加粗").toContain("font-weight:600");
    expect(st, "10px 的 --fs-3xs 已被否掉").not.toContain("font-size:var(--fs-3xs)");
    expect(st, "文字色由次要的 --text-dim 提到主色 --text").toContain("color:var(--text)");
  });

  it("操作按钮：同样放大加粗，且 min-width 必须是 max-content", () => {
    const kb = allRules(".kbtns button");
    expect(kb).toContain("font-size:var(--fs-sm)");
    expect(kb).toContain("font-weight:600");
    /* `min-width:0` + `white-space:nowrap` = 文字被裁（实测 1024px 下 6 个按钮全裁）。
       max-content 让按钮至少装得下自己的文字：空间够时照旧等分，不够则换行，永不裁字。 */
    expect(kb, "min-width 应为 max-content（0 会让 nowrap 的文字被裁）").toContain("min-width:max-content");
    expect(CSS, "不得回到 min-width:0").not.toMatch(/\.kbtns button\{flex:1 1 0;min-width:0\}/);
  });

  it("看板列标题加粗到 700", () => {
    expect(CSS).toMatch(/\.kcol h4\{[^}]*font-size:var\(--fs-sm\);font-weight:700/);
  });

  it("窄屏(≤1023) 操作按钮字号回退（pad 看板列仅 168px）", () => {
    const blk = CSS.match(/@media \(max-width:1023px\)\{[\s\S]*?\n\}/);
    expect(blk, "应存在窄屏回退块").toBeTruthy();
    /* ⚠️ 必须是 `.kcol .kbtns button` 这种更高特异性的写法 ——
       该块在源码里位于 `.kbtns button{font-size:var(--fs-sm)}` 之前，
       同特异性会被后者按源码顺序覆盖而静默失效（实测 900px 下仍是 14px）。 */
    expect(blk[0], "回退要用 .kcol 提高特异性").toContain(".kcol .kbtns button{font-size:var(--fs-xs)}");
  });
});
