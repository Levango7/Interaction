/**
 * ui-scale-floor.test.js —— 字号与触控下限（2026-10-20 P1-4）
 * ----------------------------------------------------------------------------
 * 契约来自 docs/DESIGN-SYSTEM.md：正文/提示字号下限 12px；窄屏触控目标**高度** ≥40px、
 * 粗指针（触屏）≥44px，宽度仍 26px（抬宽会横向溢出，正解是窄屏溢出菜单）。
 * 这里做**静态棘轮**：防止有人把 11px 或高度下限改回去，也防止有人用压布局凑 44×44。
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

  it("窄屏顶栏按钮高度 ≥40px，粗指针 ≥44px（宽度保持 26，抬宽会溢出）", () => {
    const narrow = HTML.match(/@media\(max-width:479px\)\{[\s\S]*?\n\}/);
    expect(narrow, "找不到 479px 断点块").toBeTruthy();
    /* 实测：把 min-width 抬到 40px，375px 视口横向溢出 103px（顶栏按钮数量多）。
       正解是"低频按钮收进溢出菜单"，属独立设计项；当前先保高度。 */
    expect(narrow[0], "窄屏顶栏按钮最小高度应 ≥40px").toMatch(/\.topbar \.tbtn\{min-width:26px;min-height:40px/);
    const coarse = HTML.match(/@media\(pointer:coarse\)\{[\s\S]*?\n\}/);
    expect(coarse, "应有 pointer:coarse 覆盖").toBeTruthy();
    expect(coarse[0]).toMatch(/\.topbar \.tbtn\{min-height:44px\}/);
  });

  it("检查器有射程：违规样本必须被同一套规则判红", () => {
    const bad = ":root{--fs-2xs:11px}\n@media(max-width:479px){.topbar .tbtn{min-width:26px;padding:0}}";
    const badNarrow = bad.match(/@media\(max-width:479px\)\{[\s\S]*?\n?\}/);
    expect(countToken(bad, "fs-2xs", "11px")).toBe(1);
    expect(/min-height:40px/.test(badNarrow ? badNarrow[0] : "")).toBe(false);
  });
});
