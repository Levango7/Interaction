/* tests/list-body-class.test.js —— 列表项 class 改名守卫（2026-11-03）
 * ----------------------------------------------------------------------------
 * 背景：列表项与布局壳曾共用 class="body"，带来两个真实问题：
 *   ① 裸选择器 `.body{flex:1;display:flex;min-height:0}` 会**误伤列表项**（列表项因此
 *      额外吃到 display:flex 与 min-height:0）；移动端 `.body{flex-direction:column}`
 *      同样命中 ⇒ 桌面端标题与副标题并排、窄屏竖排。
 *   ② `document.querySelector(".body")` 取文档序第一个，靠"壳恰好在前"才正确 ——
 *      已导致一次 e2e 误判（把列表项当布局壳）。
 * 改名后列表项 = `.body-row`，壳保持 `.body`。
 *
 * 本文件守：
 *   ① CSS 契约：新规则必须**自带** display:flex / min-height:0（原来是从裸 .body 继承来的，
 *      不搬过来 ⇒ 桌面端标题与副标题从并排变竖排 = 视觉回归）；
 *   ② 窄屏契约：媒体查询里必须有 flex-direction:column（否则窄屏从竖排变并排）；
 *   ③ 源码契约：src/ 里不再有列表项发射 class="body"；
 *   ④ 反向对照：壳仍是 .body、`.app > .body` 仍可用，且旧选择器 `.list li .body` 不得复活。
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadApp } from "./helpers/loadApp.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HTML = fs.readFileSync(path.join(ROOT, "agent-workbench.html"), "utf8");
const SRC = fs.readdirSync(path.join(ROOT, "src")).filter(f => f.endsWith(".js"))
  .map(f => fs.readFileSync(path.join(ROOT, "src", f), "utf8")).join("\n");

describe("① CSS 契约：.body-row 必须自带继承来的属性", () => {
  it("主规则含 flex:1 / min-width:0 / display:flex / min-height:0", () => {
    const m = HTML.match(/\.list li \.body-row\{([^}]*)\}/);
    expect(m, "缺少 .list li .body-row 规则").toBeTruthy();
    const decl = m[1];
    for (const need of ["flex:1", "min-width:0", "display:flex", "min-height:0"]) {
      expect(decl.includes(need), "新规则丢了 " + need + " —— 它原本来自裸 .body 选择器，不搬过来就是视觉回归").toBe(true);
    }
  });
  it("标题/副标题的子选择器跟着改名", () => {
    expect(HTML).toContain(".list li .body-row .t{");
    expect(HTML).toContain(".list li .body-row .m{");
  });
  it("窄屏媒体查询里有列向规则（否则窄屏标题副标题变并排）", () => {
    expect(HTML, "缺 .list li .body-row{flex-direction:column} —— 窄屏会与桌面端同向").toContain(".list li .body-row{flex-direction:column}");
  });
});

describe("② 源码契约：列表项不再发射 class=\"body\"", () => {
  it("src/ 里没有 class=\"body\"", () => {
    expect(SRC.includes('class="body"'), "src 里还有列表项在发射 class=\"body\" —— 与壳同名的问题没解决").toBe(false);
  });
});

describe("③ 反向对照：壳没被动，且旧选择器不得复活", () => {
  it("旧规则 .list li .body{ 已不存在", () => {
    expect(HTML).not.toContain(".list li .body{");
  });
  it("壳仍是 .body（HTML 里只有一个 class=\"body\"）", () => {
    const n = (HTML.match(/class="body"/g) || []).length;
    expect(n, "class=\"body\" 应只剩布局壳一处").toBe(1);
  });
  it(".app > .body 在运行时仍能定位布局壳（画布布局依赖它）", () => {
    const win = loadApp();
    const shell = win.document.querySelector(".app > .body");
    expect(shell, "布局壳定位失败 —— 画布三栏布局依赖 .app > .body").toBeTruthy();
  });
});
