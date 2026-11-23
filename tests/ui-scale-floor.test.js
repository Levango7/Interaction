/**
 * ui-scale-floor.test.js —— 字号与触控下限（2026-10-20 P1-4）
 * ----------------------------------------------------------------------------
 * 契约来自 docs/DESIGN-SYSTEM.md：正文/提示字号下限 12px；窄屏触控目标 **44×44**
 * （B5 顶栏退役后：系统按钮族落左栏快捷/工具区，44×44 地板写在 .side-quick/.side-tool 规则里）。
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

  it("左栏快捷/工具按钮 44×44 —— B5 顶栏退役后系统按钮落左栏，命中地板不随布局缩水", () => {
    /* 判据主体随实现迁移（B5）：旧顶栏「data-fold 收起 + 44px」形态不存在了；
       新家 = .side-quick / .side-tool 内的 .tbtn 必须显式 44×44 地板。
       真实不溢出与命中区由 tests/e2e/topbar-overflow.spec.js 在六档浏览器里量；
       这里守的是**规则本身别被改回去**（删掉 44px 地板 / 把顶栏族写回来 ⇒ 本用例红）。 */
    const floor = HTML.match(/\.side-quick \.tbtn,\.side-tool \.tbtn\{[^}]*\}/);
    expect(floor, "左栏快捷/工具区必须有 .tbtn 规则").toBeTruthy();
    expect(floor[0], "左栏工具按钮应是 44×44").toMatch(/min-width:44px;min-height:44px/);
    expect(HTML, "旧顶栏 tbtn 规则不许复活").not.toMatch(/\.topbar \.tbtn\{/);
    const coarse = HTML.match(/@media\(pointer:coarse\)\{[\s\S]*?\n\}/);
    expect(coarse, "应有 pointer:coarse 覆盖").toBeTruthy();
    expect(coarse[0]).toMatch(/\.toolbar-row \.tbtn\{min-height:40px\}/);
  });

  it("检查器有射程：违规样本必须被同一套规则判红", () => {
    const bad = ":root{--fs-2xs:11px}\n.side-quick .tbtn,.side-tool .tbtn{min-width:26px;min-height:40px;padding:0}";
    const badRule = bad.match(/\.side-quick \.tbtn,\.side-tool \.tbtn\{[^}]*\}/);
    expect(countToken(bad, "fs-2xs", "11px")).toBe(1);
    expect(/min-width:44px;min-height:44px/.test(badRule ? badRule[0] : ""), "退回 26px 宽度的样本必须判红").toBe(false);
  });
});
