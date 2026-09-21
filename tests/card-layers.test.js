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
  it("表单为 6 个等宽 minmax(0,1fr) 轨（用户定稿：输入框与下拉框同宽）", () => {
    /* ⚠️ .form-row--board 有多条规则，且**第一条未必含列模板** ——
       必须扫描出「含 grid-template-columns 的那条」，不能只取第一条（这个坑踩过多次）。 */
    const rules = []; let i = 0;
    while ((i = CSS.indexOf('.form-row--board{', i)) >= 0) { rules.push(CSS.slice(i, CSS.indexOf('}', i) + 1)); i++; }
    const tpl = rules.find(r => r.indexOf('grid-template-columns') >= 0);
    expect(tpl, '应有含列模板的 .form-row--board 规则').toBeTruthy();
    /* v3.7.58：模板改用 repeat(6,minmax(0,1fr)) 简写 → 数轨要兼容两种写法 */
    const tplVal = (tpl.match(/grid-template-columns:([^;]+)/) || [])[1] || '';
    const rep = tplVal.match(/repeat\((\d+),minmax\(0,1fr\)\)/);
    const tracks = rep ? Number(rep[1]) : (tplVal.match(/minmax\(0,1fr\)/g) || []).length;
    expect(tracks, '6 轨应等宽').toBe(6);
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
