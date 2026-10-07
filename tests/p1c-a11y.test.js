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
  /* v3.7.102：onboarded 标志必须**在脚本执行前**注入。
     原写法是 loadApp() 之后再 setItem，等于赌「启动流程比随后的 120ms 硬等待快」——
     windows CI 上赌输过两次（v3.7.96 的 run 37602769033、v3.7.102 的 run 37701045330），
     现象是 nav-item 还没由 renderSide 注入，「应存在导航 SVG」直接 false。
     改经 loadApp({storage}) 在 beforeParse 阶段注入（脚本执行前），配合下方轮询等待消除竞态。 */
  return loadApp({ storage: { wb_agent_onboarded: "true" } });
}

describe("P1-c 可访问性", () => {
  let win;
  let doc;
  let htmlSrc;
  beforeEach(async () => {
    win = freshWin();   // 已引导标志由 freshWin 经 storage 注入（见其注释）
    doc = win.document;
    htmlSrc = fs.readFileSync(HTML, "utf8");
    /* 等 startup 异步 render（nav-item 由 renderSide 注入）完成。
       不用固定 120ms —— 那是「赌机器够快」，windows CI 已赌输两次。
       轮询到 nav 真的出现即返回，上限 3s：快机器立即过、慢机器也不会假红。 */
    for (let i = 0; i < 120 && !doc.querySelector("#side .nav-item"); i++) {
      await new Promise((r) => setTimeout(r, 25));
    }
  });

  it("#toasts 为 role=status 且 aria-live=polite（live region）", () => {
    // #toasts 惰性创建：toast() 首次调用时才 document.createElement 并挂到 body
    // （见 agent-workbench.html toast()），因此先触发一次 toast 再断言容器语义。
    win.toast("可访问性测试", "ok");
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
