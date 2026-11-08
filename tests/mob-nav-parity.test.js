/**
 * mob-nav-parity.test.js —— 底栏 / 抽屉两份 CSS 副本的同步守卫（DL-O15 的「视觉回归工具」）
 * ----------------------------------------------------------------------------
 * 背景：#110 方案乙（768–1023 档 Design 照手机走）在 `@media(max-width:1023px)` 的 design 块里
 * **复制了一份** ≤767 的底栏 / 抽屉外观。两份必须同步，改一处忘另一处 = 静默视觉漂移
 * （hover 反馈、active 圆点、has-active 高亮这类"只在某档才有"的差异，肉眼在桌面宽度下永远看不到）。
 *
 * 为什么不用 Playwright `toHaveScreenshot`（这是本次选型的核心，别改回去前先读）：
 *   ① CI 跑 ubuntu、本机是 Windows，字体与抗锯齿渲染必然不同 ⇒ 像素基线跨平台必红；
 *   ② 本仓 e2e 已有抖动史（playwright.config.js 头部几十行都在记这些坑），再引入像素基线只会制造噪声；
 *   ③ 本例的「视觉差异」源头就是 **CSS 声明差异** —— 直接比声明集是 100% 覆盖、零抖动，
 *      还能进 `npm test`（不需要浏览器、不需要注入态，几十毫秒）。
 *   真正需要"渲染结果"才判得出的东西（层叠、继承、浏览器差异）不在本债务的射程内。
 *
 * 判据：去掉 `.body.design-mode ` 前缀后，同一选择器在两块里的声明集逐条相等；
 * 唯一允许的差异是**布局定位**（position / order / flex-shrink / inset / z-index）——
 * ≤767 是 fixed 底栏，design 里是 flex 列的流内项（order:3），这是设计差异，不是漂移。
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/* 与 tests/manual-consistency.test.js 同口径：从测试文件位置回溯仓库根。
   ⚠️ 别写成 `new URL("../agent-workbench.html", import.meta.url)` —— vitest 的 CJS transform 下
   import.meta.url 不是 file: 协议，会抛 "The URL must be of scheme file"。 */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const HTML = readFileSync(join(ROOT, "agent-workbench.html"), "utf8");

/* ---------------- 极简 CSS 块解析（只够本用例：无嵌套 @supports、无字符串内花括号） ---------------- */
function sliceBlock(css, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}") {
      depth--;
      if (depth === 0) return { text: css.slice(openIdx + 1, i), end: i + 1 };
    }
  }
  throw new Error("CSS 块未闭合（从索引 " + openIdx + " 起）");
}

function mediaBlocks(css) {
  const out = [];
  const re = /@media\s*\(([^)]*)\)\s*\{/g;
  let m;
  while ((m = re.exec(css))) {
    const openIdx = m.index + m[0].length - 1;
    const { text, end } = sliceBlock(css, openIdx);
    out.push({ cond: m[1].replace(/\s+/g, ""), text, index: m.index });
    re.lastIndex = end;
  }
  return out;
}

/** 摊平块内规则：组选择器按逗号拆开，保持出现顺序（同块内后写的覆盖先写的） */
function flatRules(blockText) {
  const out = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(blockText))) {
    const body = m[2];
    for (const raw of m[1].split(",")) {
      const sel = raw.replace(/\s+/g, " ").trim();
      if (sel) out.push({ sel, body });
    }
  }
  return out;
}

function declMap(body) {
  const map = new Map();
  for (const part of body.split(";")) {
    const i = part.indexOf(":");
    if (i < 0) continue;
    const k = part.slice(0, i).replace(/\s+/g, " ").trim().toLowerCase();
    if (!k) continue;
    map.set(k, part.slice(i + 1).replace(/\s+/g, " ").trim().toLowerCase());
  }
  return map;
}

/** 某选择器在某块内的**合并后**声明（模拟同块内的覆盖语义） */
function mergedDecls(blockText, selector) {
  const map = new Map();
  for (const r of flatRules(blockText)) {
    if (r.sel !== selector) continue;
    for (const [k, v] of declMap(r.body)) map.set(k, v);
  }
  return map;
}

const blocks = mediaBlocks(HTML);
/* 同一断点可能有多个 media 块（≤767 里还有 3535/3566/3653 等只改 .mob-bar-btn 的小块）。
   这里只要「定义底栏外观」的那一块，判据是块内出现 .mob-bar 的完整声明（display:flex 起头）。 */
const mobile = blocks.filter((b) => b.cond === "max-width:767px" && b.text.includes(".mob-bar{display:flex"));
const design = blocks.filter((b) => b.cond === "max-width:1023px" && b.text.includes(".body.design-mode .mob-bar{display:flex"));

/** 允许的布局定位差异（设计不同，不是漂移） */
const LAYOUT_ONLY = new Set(["position", "order", "flex-shrink", "inset", "inset-block", "inset-inline", "top", "left", "right", "bottom", "z-index"]);
const DESIGN_PREFIX = ".body.design-mode ";
const NAV_SEL = /^\.(mob-bar|side-sheet|sheet-)/;

describe("底栏 / 抽屉两份 CSS 副本必须同步（DL-O15 守护）", () => {
  it("两块都能定位到（否则本用例等于空跑）", () => {
    expect(mobile.length, "找不到 max-width:767px 的移动端导航块").toBe(1);
    expect(design.length, "找不到含 .body.design-mode 的 max-width:1023px 块").toBe(1);
  });

  it("移动端块里的每个导航选择器，design 块必须有对应规则", () => {
    const mobileSels = [...new Set(flatRules(mobile[0].text).map((r) => r.sel))].filter((s) => NAV_SEL.test(s));
    const designSels = new Set(flatRules(design[0].text).map((r) => r.sel));
    /* 哨兵：抽不到选择器说明解析器坏了，不能静静地"零差异通过" */
    expect(mobileSels.length, "移动端块里没抽到任何导航选择器").toBeGreaterThan(10);
    const missing = mobileSels.filter((s) => !designSels.has(DESIGN_PREFIX + s));
    expect(missing, "design 副本缺少这些选择器（改了一处忘另一处）").toEqual([]);
  });

  it("两侧声明集逐条相等（只允许布局定位差异）", () => {
    const mobileSels = [...new Set(flatRules(mobile[0].text).map((r) => r.sel))].filter((s) => NAV_SEL.test(s));
    const diffs = [];
    for (const sel of mobileSels) {
      const a = mergedDecls(mobile[0].text, sel);
      const b = mergedDecls(design[0].text, DESIGN_PREFIX + sel);
      for (const [k, v] of a) {
        if (LAYOUT_ONLY.has(k)) continue;
        if (!b.has(k)) diffs.push(sel + " · design 缺 " + k + ": " + v);
        else if (b.get(k) !== v) diffs.push(sel + " · " + k + " 不一致：≤767=`" + v + "` / design=`" + b.get(k) + "`");
      }
      for (const [k, v] of b) {
        if (LAYOUT_ONLY.has(k)) continue;
        if (!a.has(k)) diffs.push(sel + " · design 多出 " + k + ": " + v);
      }
    }
    expect(diffs, "两份副本的声明已经漂移：\n" + diffs.join("\n")).toEqual([]);
  });
});
