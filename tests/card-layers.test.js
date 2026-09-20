/**
 * card-layers.test.js —— 看板卡的**四行结构**（v3.7.35，按用户思路重排）
 * ----------------------------------------------------------------------------
 * 用户明确的新布局（截图圈注三色框）：
 *   第1行 标题（`.t`）
 *   第2行 状态（`.kstate`）—— **红框：状态独立成行，整行宽**
 *   第3行 属性（`.m`）—— 蓝框：P1 / 逾期日期 / 标签
 *   第4行 操作（`.kbtns`）—— 绿框：编辑 / 分享 / 删除，**三颗等宽铺满整行**
 *
 * 为什么状态要独立成行（用户原话的动机）：
 *   「如果标题比较长，右上角的状态会被挤到乱七八糟的地方」——
 *   状态与标题同行时，长标题必然挤压状态；分行使两者**互不影响**。
 *
 * ⚠️ 挪 DOM 前查过绑定：`ui-scene-bind.js` 的 `$$("[data-move]").forEach(b=> b.onclick=…)`
 *    是**全文档查询后逐次绑定**，不依赖父容器 → 挪动安全。且 CDP 实测点击生效（todo→doing）。
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CSS = fs.readFileSync(path.join(ROOT, "agent-workbench.html"), "utf8");
const JS = fs.readFileSync(path.join(ROOT, "src/render-scene-main.js"), "utf8");
const BIND = fs.readFileSync(path.join(ROOT, "src/ui-scene-bind.js"), "utf8");

describe("看板卡四行结构（v3.7.35）", () => {
  it("卡片模板的行序：标题 → 状态 → 属性 → 操作", () => {
    const i = JS.indexOf('return `<div class="kcard"');
    const seg = JS.slice(i, i + 900);
    /* 标题没有独立类名的标记，用 .kstate / .m / .kbtns 三个标记的先后顺序断言 */
    const order = ['class="kstate"', 'class="m"', "kbtns"].map(k => seg.indexOf(k));
    order.forEach((pos, i2) => expect(pos, "标记 " + i2 + " 应存在").toBeGreaterThan(-1));
    expect(order[0], "kstate 应在属性行之前").toBeLessThan(order[1]);
    expect(order[1], "属性行应在操作行之前").toBeLessThan(order[2]);
    expect(seg.indexOf('class="t"'), "标题在状态之前").toBeLessThan(order[0]);
  });

  it("不再有 .khead 包裹（标题与状态已分行，不需要同一行容器）", () => {
    expect(JS, "不应再用 .khead 包裹标题与状态").not.toContain('class="khead"');
  });

  it("状态按钮的绑定是全文档查询（挪位置安全的前提）", () => {
    expect(BIND).toMatch(/\$\$\("\[data-move\]"\)\.forEach/);
  });
});

describe("CSS：各行铺满", () => {
  it("状态按钮整行宽（flex:1 / width:100%）", () => {
    expect(CSS).toMatch(/\.kstate\{display:flex/);
    expect(CSS).toMatch(/\.kstate button\{flex:1/);
  });

  it("状态按钮与操作按钮**同一套圆角矩形卡片外观**（v3.7.37）", () => {
    /* 根因：全局 `button{border:none;background:none;color:inherit}`，
       而 .kstate button 原先只给了 flex/字号/最小高 → 状态行看着就是一行纯文字。
       现补齐与 .kbtns button 相同的四项外观，二者视觉一致。 */
    const pick = (sel) => {
      const out = []; let i = 0;
      while ((i = CSS.indexOf(sel + '{', i)) >= 0) {
        let d = 0; const s = CSS.indexOf('{', i);
        for (let k = s; k < CSS.length; k++) {
          if (CSS[k] === '{') d++; else if (CSS[k] === '}') { d--; if (!d) { out.push(CSS.slice(s + 1, k)); i = k; break; } }
        }
        i++;
      }
      return out.join(' ');
    };
    const st = pick('.kstate button'), kb = pick('.kbtns button');
    ['background:var(--panel2)', 'border:1px solid var(--line)', 'border-radius:var(--radius-sm)', 'flex:1', 'min-height']
      .forEach(k => {
        expect(st, '状态按钮缺 ' + k).toContain(k);
        expect(kb, '操作按钮缺 ' + k).toContain(k);
      });
    expect(CSS).toMatch(/\.kstate button:hover\{background:var\(--surface-hover\)/);
  });

  it("操作按钮间隙已收紧到 1px", () => {
    const m = CSS.match(/\.kbtns\{[^}]*\}/);
    expect(m[0]).toContain("display:flex");
    expect(m[0]).toMatch(/gap:1px/);
  });

  it("列模板为 6 轨（v3.7.44 起与看板三列同构：3 列各拆两半）", () => {
    /* 这条只断"形态"。数值关系（轨数 = 看板列数×2、同一个 gap token）由 board-form-grid.test.js 守。 */
    expect(CSS).toMatch(/\.form-row--board\{[^}]*grid-template-columns:repeat\(6,minmax\(0,1fr\)\)/);
    expect((CSS.match(/repeat\(6,minmax\(0,1fr\)\)/g) || []).length).toBeGreaterThanOrEqual(1);
  });
});

describe("输入框背景与卡片背景有差异（上一轮的 B，一并守住）", () => {
  it("输入框用 --surface-muted，不用与卡片同色的 --panel", () => {
    const m = CSS.match(/input,select,textarea\{[\s\S]*?\}/);
    expect(m[0]).toContain("background:var(--surface-muted)");
    expect(m[0]).not.toContain("background:var(--panel)");
  });
});
