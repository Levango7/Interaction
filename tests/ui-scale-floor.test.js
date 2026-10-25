/**
 * ui-scale-floor.test.js —— 字号与触控下限（2026-10-20 P1-4）
 * ----------------------------------------------------------------------------
 * 契约来自 docs/DESIGN-SYSTEM.md：正文/提示字号下限 12px；窄屏触控目标 **44×44**
 * （2026-10-26 B5 起：低频按钮由 data-fold 声明并收进顶栏溢出菜单，宽度不再靠牺牲命中区换不溢出）。
 * 这里做**静态棘轮**：防止有人把 11px 或触控下限改回去，也防止有人用压布局凑 44×44。
 * 自带射程自检：同一套匹配规则必须能在一个"违规样本"上报红。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const HTML = readFileSync(join(root, "agent-workbench.html"), "utf8");

const countToken = (css, name, value) =>
  [...css.matchAll(new RegExp("--" + name + ":\\s*" + value, "g"))].length;

describe("字号与触控下限", () => {
  it("--fs-2xs 在全部主题块里都是 12px，没有 11px 残留", () => {
    expect(countToken(HTML, "fs-2xs", "11px"), "仍有 11px 的 --fs-2xs（某个主题块漏改）").toBe(0);
    const n12 = countToken(HTML, "fs-2xs", "12px");
    expect(n12, "每个主题块都应声明 12px（当前实测 6 处）").toBe(6);
  });

  it("窄屏顶栏按钮 44×44 —— 低频按钮收进溢出菜单后不再靠牺牲宽度换不溢出", () => {
    const narrow = HTML.match(/@media\(max-width:479px\)\{[\s\S]*?\n\}/);
    expect(narrow, "找不到 479px 断点块").toBeTruthy();
    /* 2026-10-20 那版宽度停在 26px（8 个按钮抬到 40px 会横向溢出 103px，只能先保高度）。
       2026-10-26 B5 补上"正解"：data-fold 声明的低频按钮移出顶栏，宽度回到 44px。
       真实不溢出与 44px 命中区由 tests/e2e/topbar-overflow.spec.js 在浏览器里量；
       这里守的是**规则本身别被改回去**（改回 26px / 删掉 data-fold 收起 ⇒ 本用例红）。 */
    expect(narrow[0], "窄屏顶栏按钮应是 44×44").toMatch(/\.topbar \.tbtn\{min-width:44px;min-height:44px/);
    expect(narrow[0], "低频按钮必须在窄屏收起").toMatch(/\.topbar \.tbtn\[data-fold\]\{display:none\}/);
    const base = HTML.match(/\.topbar \.tbtn\.topbar-more-btn\{display:none\}/);
    expect(base, "宽屏必须收起「更多」入口，否则桌面顶栏会多出一个没用的按钮").toBeTruthy();
    const coarse = HTML.match(/@media\(pointer:coarse\)\{[\s\S]*?\n\}/);
    expect(coarse, "应有 pointer:coarse 覆盖").toBeTruthy();
    expect(coarse[0]).toMatch(/\.topbar \.tbtn\{min-height:44px\}/);
  });

  it("检查器有射程：违规样本必须被同一套规则判红", () => {
    const bad = ":root{--fs-2xs:11px}\n@media(max-width:479px){.topbar .tbtn{min-width:26px;min-height:40px;padding:0}\n}";
    const badNarrow = bad.match(/@media\(max-width:479px\)\{[\s\S]*?\n\}/);
    expect(countToken(bad, "fs-2xs", "11px")).toBe(1);
    expect(/min-width:44px;min-height:44px/.test(badNarrow ? badNarrow[0] : ""), "退回 26px 宽度的样本必须判红").toBe(false);
    expect(/data-fold/.test(badNarrow ? badNarrow[0] : ""), "没有收起规则的样本必须判红").toBe(false);
  });
});
