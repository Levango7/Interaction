/**
 * overlay-cmd-show.test.js —— 动态浮层的内层 `.cmd` 必须真的被显示（审计 R-6 门禁化）
 * ----------------------------------------------------------------------------
 * 缺陷本体（同类已发生两次）：
 *   `.cmd` 基类是 `display:none`，靠自身 `.show` 才渲染。动态挂载浮层时只给外层 `.overlay`
 *   加 show → **DOM 建好了、内容也对，但屏幕上什么都没有**。
 *     · v3.7.66：`openIntegrationConfig`（点「连接」后弹窗不出现）
 *     · 2026-10-06：`openEventDetail`（点日历 ICS 徽章后详情浮层不出现）—— 由新增的
 *       `tests/e2e/ics-import-render.spec.js` 首次抓到；那条 e2e 只守日历这一处，本文件守**这一类**。
 *   为什么以前所有门禁都放过：jsdom 不应用样式表（`getComputedStyle` 拿不到真实 display），
 *   而 e2e 历史上没覆盖这两个弹窗 —— 单测全绿 + 结构门禁全绿，用户侧却是死按钮。
 *
 * 判定口径（两种合法写法，任一成立即 PASS）：
 *   A. CSS 里有后代规则（`.overlay.show .cmd{display:block}` 一类）—— 则外层 show 就够；
 *   B. JS 在内层元素上同步加了 `show`（`querySelector(".cmd")` + `classList.add("show")`）。
 * 负例 corpus 做**合成变异自测**：把 B 摘掉、且不给 A，断言必须报违规 —— 证明本门禁不是装饰。
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const SRC_DIR = path.join(ROOT, "src");

/** 是否声明了「外层 show 带动内层」的 CSS 后代规则（合法写法 A） */
function cssHasOverlayDescendantRule(cssText) {
  return /\.overlay\.show[^{}]*\.cmd\s*\{[^}]*display\s*:\s*(block|flex|grid)/i.test(cssText);
}

/** 该文件是否给内层 .cmd 同步补了 show（合法写法 B） */
function jsAddsShowToInnerCmd(srcText) {
  return /querySelector\(\s*["']\.cmd["']\s*\)[\s\S]{0,200}?classList\.add\(\s*"show"\s*\)/.test(srcText);
}

/** 该文件是否属于「overlay 里动态挂 .cmd」形态（门禁的作用域，须自证非空） */
function isOverlayCmdMountSite(text) {
  const mountsDialog = /<div class="cmd[\s"]/.test(text) || /class=\\"cmd[\s"]/.test(text);
  const usesOverlay = /["']overlay["']|className\s*=\s*["']overlay/.test(text);
  return mountsDialog && usesOverlay;
}

/**
 * 找出「动态挂载了 .cmd 面板、却没让它显示」的文件。
 * @param {Array<{name:string, text:string}>} files
 * @param {string} cssText
 * @returns {string[]} 违规文件名列表
 */
export function findOverlayCmdWithoutShow(files, cssText) {
  if (cssHasOverlayDescendantRule(cssText)) return [];      // 写法 A 成立，全仓豁免
  const bad = [];
  for (const f of files) {
    if (!isOverlayCmdMountSite(f.text)) continue;           // 不是"overlay 里动态挂 .cmd"的形态
    if (!jsAddsShowToInnerCmd(f.text)) bad.push(f.name);
  }
  return bad;
}

describe("动态浮层：内层 .cmd 必须被显示（同类缺陷已发生两次）", () => {
  const cssText = fs.readFileSync(path.join(ROOT, "agent-workbench.html"), "utf8");
  const files = fs.readdirSync(SRC_DIR).filter((f) => f.endsWith(".js"))
    .map((f) => ({ name: f, text: fs.readFileSync(path.join(SRC_DIR, f), "utf8") }));

  it("真实 src 里不存在「挂 .cmd 却不显示」的文件", () => {
    const bad = findOverlayCmdWithoutShow(files, cssText);
    expect(bad, "这些文件动态挂载了 .cmd 浮层却没让它显示（jsdom 测不出、用户点着是死按钮）：" + bad.join(", ")
      + "；修法：给内层元素 classList.add(\"show\")，或补一条 .overlay.show .cmd{display:block} 后代规则").toEqual([]);
  });

  it("自证作用域非空：两处历史现场必须都在门禁视野内（否则本门禁是空转）", () => {
    const inScope = files.filter((f) => isOverlayCmdMountSite(f.text)).map((f) => f.name).sort();
    // v3.7.66 的 openIntegrationConfig 与本轮的 openEventDetail —— 少一个就意味着口径漂了
    expect(inScope).toEqual(["ui-ge-calendar.js", "ui-global-events.js"]);
  });

  it("合成变异自测：摘掉内层 show 且无后代规则 → 必须报违规", () => {
    const mutant = [{
      name: "synthetic.js",
      text: [
        '  let html = \'<div class="cmd u-max-w-520" role="dialog">hi</div>\';',
        '  const ov = document.createElement("div");',
        '  ov.className = "overlay show";',
        "  ov.innerHTML = html;",
        "  document.body.appendChild(ov);",
      ].join("\n"),
    }];
    expect(findOverlayCmdWithoutShow(mutant, "")).toEqual(["synthetic.js"]);
  });

  it("合成对照：CSS 有后代规则时豁免（避免把合法写法判成红）", () => {
    const mutant = [{
      name: "synthetic.js",
      text: 'let html = \'<div class="cmd">hi</div>\'; const ov = document.createElement("div"); ov.className = "overlay show";',
    }];
    expect(findOverlayCmdWithoutShow(mutant, ".overlay.show .cmd{display:block}")).toEqual([]);
  });

  it("合成对照：JS 补了内层 show 时 PASS（守住的是形态不是字面量）", () => {
    const mutant = [{
      name: "synthetic.js",
      text: 'let html = \'<div class="cmd">hi</div>\'; const ov = document.createElement("div"); ov.className = "overlay";'
        + 'const el = ov.querySelector(".cmd"); if(el) el.classList.add("show");',
    }];
    expect(findOverlayCmdWithoutShow(mutant, "")).toEqual([]);
  });
});
