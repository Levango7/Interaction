/**
 * P1-c 可访问性 · 回归验证
 * ----------------------------------------------------------------------------
 * 验证 a11y 增强已落地：
 *   ① live region：#toasts role=status/aria-live=polite；#msgPanel aria-live=polite（消息中心替代 banner）。
 *   ② 工具栏 6 个图标按钮均有 aria-label，内联 SVG 标记为装饰(aria-hidden)。
 *   ③ 抽屉关闭按钮 aria-label。
 *   ④ 渲染后导航项 SVG 装饰化(aria-hidden)。
 *   ⑤ <html lang="zh-CN">。
 *   ⑥ :focus-visible 焦点环 CSS 已注入。
 *   ⑦ toast(error) 生成 role=alert 元素（危险态断言性播报）。
 *
 * 设计原则（遵循 test-discipline / anti-gaming）：
 *  - 黑盒优先：经 jsdom 全局访问 window / document。
 *  - 对 CSS 注入与 lang 属性，直接读生产源码断言。
 *  - 不修改任何生产文件；本文件为新增测试。
 *
 * 运行：npx vitest run tests/p1c-a11y.test.js
 */

import { describe, it, expect, beforeEach } from "vitest";
import { loadApp } from "./helpers/loadApp.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HTML = path.resolve(__dirname, "..", "agent-workbench.html");

function freshWin() {
  const win = loadApp();
  win.localStorage.clear();
  return win;
}

describe("P1-c 可访问性", () => {
  let win;
  let doc;
  let htmlSrc;
  beforeEach(async () => {
    win = freshWin();
    doc = win.document;
    htmlSrc = fs.readFileSync(HTML, "utf8");
    // 标记已引导，让 startup 走正常 render 流程（本套件测的是已引导后的渲染状态）
    win.localStorage.setItem("wb_agent_onboarded", "true");
    // 等 startup 异步 render（nav-item 由 renderSide 注入）完成
    await new Promise((r) => setTimeout(r, 120));
  });

  it("#toasts 为 role=status 且 aria-live=polite（live region）", () => {
    const t = doc.getElementById("toasts");
    expect(t, "#toasts 应存在").toBeTruthy();
    expect(t.getAttribute("role")).toBe("status");
    expect(t.getAttribute("aria-live")).toBe("polite");
  });

  it("#msgPanel 为 aria-live=polite（消息中心 live region，替代 banner）", () => {
    const p = doc.getElementById("msgPanel");
    expect(p, "#msgPanel 应存在").toBeTruthy();
    expect(p.getAttribute("aria-live")).toBe("polite");
  });

  it("顶栏 #btnMessages 含 aria-label 与装饰化 SVG", () => {
    const b = doc.getElementById("btnMessages");
    expect(b, "#btnMessages 应存在").toBeTruthy();
    expect(b.hasAttribute("aria-label") && b.getAttribute("aria-label").length > 0, "#btnMessages 应有非空 aria-label").toBe(true);
    const svg = b.querySelector("svg");
    expect(!svg || svg.getAttribute("aria-hidden") === "true", "#btnMessages 内 SVG 应 aria-hidden").toBe(true);
  });

  it("工具栏图标按钮均有 aria-label，且内联 SVG 标记为装饰(aria-hidden)", () => {
    for (const id of ["btnCmd", "btnTheme", "btnGear", "btnExport", "btnImport", "btnClear"]) {
      const b = doc.getElementById(id);
      expect(b, `#${id} 应存在`).toBeTruthy();
      expect(b.hasAttribute("aria-label") && b.getAttribute("aria-label").length > 0, `#${id} 应有非空 aria-label`).toBe(true);
      const svg = b.querySelector("svg");
      // 纯文本按钮（如 btnExport/btnImport/btnClear）无内联 SVG，跳过 aria-hidden 检查；
      // 仅对含 SVG 的图标按钮断言 SVG 已装饰化(aria-hidden="true")。
      expect(!svg || svg.getAttribute("aria-hidden") === "true", `#${id} 内 SVG 应 aria-hidden`).toBe(true);
    }
  });

  it("抽屉关闭按钮有 aria-label", () => {
    const b = doc.getElementById("drawerClose");
    expect(b, "#drawerClose 应存在").toBeTruthy();
    expect(b.hasAttribute("aria-label"), "#drawerClose 应有 aria-label").toBe(true);
  });

  it("渲染后导航项 SVG 已 aria-hidden（装饰化）", () => {
    const svgs = doc.querySelectorAll("#side .nav-item svg");
    expect(svgs.length > 0, "应存在导航 SVG").toBe(true);
    expect([...svgs].every((s) => s.getAttribute("aria-hidden") === "true"), "全部导航 SVG 应 aria-hidden").toBe(true);
  });

  it("<html lang=\"zh-CN\">", () => {
    expect(doc.documentElement.getAttribute("lang")).toBe("zh-CN");
  });

  it(":focus-visible 焦点环 CSS 已注入", () => {
    expect(/:focus-visible\{/.test(htmlSrc)).toBe(true);
  });

  it("toast(error) 生成 role=alert 元素（危险态断言性播报）", () => {
    expect(typeof win.toast, "toast 应为全局函数").toBe("function");
    win.toast("严重错误示例", "error");
    const alertEl = doc.querySelector('#toasts [role="alert"]');
    expect(alertEl, "error 态 toast 应带 role=alert").toBeTruthy();
  });
});
