/**
 * ui-scale-floor.test.js —— 字号与触控下限（2026-10-20 P1-4；2026-11-13 UI 对齐批 A 随布局迁轨）
 * ----------------------------------------------------------------------------
 * 契约来自 docs/DESIGN-SYSTEM.md：正文/提示字号下限 12px；窄屏触控目标 **44×44**。
 * 2026-11-13 起低频按钮不再"收进顶栏溢出菜单"（B5 机制随七钮迁左缘竖轨 #iconRail 退役），
 * 宽度不再靠牺牲命中区换不溢出 —— 命中区棘轮从「.topbar .tbtn[data-fold] 收起规则」
 * 改成「.icon-rail .rail-btn 的 44×44」。这里做**静态棘轮**：防止有人把 11px 或触控下限
 * 改回去，也防止有人用压布局凑 44×44。
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

  it("窄屏触控 44×44 —— 七钮迁轨后，棘轮钉在轨按钮与顶栏常驻件上", () => {
    const narrow = HTML.match(/@media\(max-width:479px\)\{[\s\S]*?\n\}/);
    expect(narrow, "找不到 479px 断点块").toBeTruthy();
    /* 2026-11-13 UI 对齐批 A：轨内按钮全宽常驻，44×44 全宽一致（base 与 479 档双钉）。
       真实不溢出与 44px 命中区由 tests/e2e/topbar-overflow.spec.js 在真浏览器里量；
       这里守的是**规则本身别被改回去**（改回 26px / 删掉轨的 44 钉 ⇒ 本用例红）。 */
    expect(narrow[0], "轨内按钮窄屏应保 44×44").toMatch(/\.icon-rail \.rail-btn\{min-width:44px;min-height:44px;padding:0\}/);
    expect(narrow[0], "顶栏常驻件（用户/指南占位）窄屏同样 44×44").toMatch(/\.topbar \.tbtn\{min-width:44px;min-height:44px/);
    const base = HTML.match(/\.icon-rail\{display:flex;flex-direction:column/);
    expect(base, "图标轨应是常驻结构（不该靠 media query 才出现）").toBeTruthy();
    const coarse = HTML.match(/@media\(pointer:coarse\)\{[\s\S]*?\n\}/);
    expect(coarse, "应有 pointer:coarse 覆盖").toBeTruthy();
    expect(coarse[0]).toMatch(/\.topbar \.tbtn\{min-height:44px\}/);
    /* B5 收起规则与「更多」入口不许复活：退役是靠删除，不是靠隐藏 */
    expect(HTML, "data-fold 收起规则已随 B5 退役，不许复活").not.toMatch(/\.tbtn\[data-fold\]\{display:none\}/);
    expect(HTML, "topbar-more-btn 入口已随 B5 退役，不许复活").not.toContain("topbar-more-btn");
  });

  it("检查器有射程：违规样本必须被同一套规则判红", () => {
    const bad = ":root{--fs-2xs:11px}\n.icon-rail{display:none}\n@media(max-width:479px){.icon-rail .rail-btn{min-width:26px;min-height:40px;padding:0}\n.topbar .tbtn{min-width:26px;min-height:40px}\n}\n";
    const badNarrow = bad.match(/@media\(max-width:479px\)\{[\s\S]*?\n\}/);
    expect(countToken(bad, "fs-2xs", "11px")).toBe(1);
    expect(/min-width:44px;min-height:44px/.test(badNarrow ? badNarrow[0] : ""), "退回 26px 宽度的样本必须判红").toBe(false);
    expect(/\.icon-rail \.rail-btn\{min-width:44px/.test(badNarrow ? badNarrow[0] : ""), "没有轨 44 钉的样本必须判红").toBe(false);
  });
});
