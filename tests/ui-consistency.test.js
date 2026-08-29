/**
 * UI 一致性断言（静态扫描 agent-workbench.html）
 * 目的：把本轮审计修复的关键防线固化成回归测试，防止后续迭代回潮。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadApp } from "./helpers/loadApp.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(__dirname, "..", "agent-workbench.html"), "utf8");

describe("UI 一致性 · 令牌体系", () => {
  it("z-index 全部使用语义令牌，无裸数字", () => {
    const bare = html.match(/z-index:\s*\d+/g);
    expect(bare, `发现裸 z-index 数字: ${bare?.join(",")}`).toBeNull();
  });

  it("topbar 单行布局 + 正文工具行存在（toolbar-row / main-wrap）", () => {
    expect(html).toContain('class="topbar"');
    // v1.9.7：工具行演化为正文顶部消息提示栏（class="toolbar-row msg-bar"），断言改为前缀匹配
    expect(html).toMatch(/class="toolbar-row[^"]*"/);
    expect(html).toContain('class="main-wrap"');
    expect(html).toContain("--brand-grad");
  });

  it("存在层级令牌定义（--z-modal / --z-toast 等）", () => {
    expect(html).toContain("--z-modal:");
    expect(html).toContain("--z-toast:");
    expect(html).toContain("--z-overlay:");
  });
});

describe("UI 一致性 · 图标体系", () => {
  it("全局无彩色 emoji 残留（BMP 表情符号区）", () => {
    const rest = html.match(/[\u{1F300}-\u{1FAFF}]/gu);
    expect(rest, `发现残留 emoji: ${[...new Set(rest || [])].join("")}`).toBeNull();
  });

  it("UI_ICONS 库包含 flame/target/brain 等新图标（矢量化已落库）", () => {
    for (const key of ["flame", "target", "brain", "chain", "robot"]) {
      expect(html).toContain(`${key}:`);
    }
  });

  it("存在 ic() 辅助函数（模板注入统一入口）", () => {
    expect(html).toMatch(/function ic\(name\)/);
  });

  it(".ic-inline 基线对齐样式存在", () => {
    expect(html).toMatch(/\.ic-inline\{/);
  });
});

describe("UI 一致性 · 可访问性", () => {
  it("模态框统一基座已挂载（setupModalA11yBase）", () => {
    expect(html).toContain("setupModalA11yBase");
    expect(html).toContain("setupModalFocusAutoTrap");
  });

  it("模态框 Esc/遮罩关闭使用全局委托（不再散写）", () => {
    expect(html).toContain('document.addEventListener("keydown", function(e)');
    expect(html).toContain('top.querySelector("[id$=\'Close\']');
  });

  it("设置抽屉核心字段已关联 label for（cfgName/cfgKey/cfgModel）", () => {
    expect(html).toContain('for="cfgName"');
    expect(html).toContain('for="cfgKey"');
    expect(html).toContain('for="cfgModel"');
  });

  it("交互基架覆盖全局 button（active/disabled）", () => {
    expect(html).toMatch(/button:active:not\(\[disabled\]\)/);
    expect(html).toMatch(/button\[disabled\]\{/);
  });
});

describe("UI 一致性 · 组件语义", () => {
  it("空态统一配方 .empty-state 保留", () => {
    expect(html).toContain(".empty-state{");
    expect(html).toContain(".empty-icon{");
  });

  it("toast 类型图标映射存在（TOAST_ICONS）", () => {
    expect(html).toContain("TOAST_ICONS");
    expect(html).toContain("TOAST_ICONS[key]");
  });

  it("跨内核滚动条（scrollbar-width）已覆盖", () => {
    expect(html).toContain("scrollbar-width:thin");
  });

  it("第二行背景令牌（--tb-row2-bg）在暗色主题有覆盖", () => {
    expect(html).toMatch(/--tb-row2-bg:/);
    expect(html).toMatch(/data-theme="dark"[\s\S]*--tb-row2-bg/);
  });
});

/**
 * 侧栏高亮状态机（v1.9.3g）
 * 高亮由显式 uiView 状态驱动（openDrawer→settings / renderHelp→help / render→main），
 * 弃 DOM 嗅探。以下用例锁住全链路，防止「设置/指南双高亮且切换不消失」回潮。
 */
describe("UI 一致性 · 侧栏高亮状态机（uiView）", () => {
  let win, __test;
  beforeEach(async () => {
    win = await loadApp();
    __test = win.__test;
  });

  // 返回 {gear, help, sc:{office:boolean,...}, activeCount}
  function highlightState() {
    const side = win.document.querySelector("#side");
    const navItems = [...side.querySelectorAll(".nav-item")];
    const isActive = (el) => el.classList.contains("active");
    const gear = navItems.find((b) => b.dataset.gear);
    const help = navItems.find((b) => b.dataset.help);
    const scMap = {};
    for (const sc of __test.ORDER) {
      scMap[sc] = navItems.some((b) => b.dataset.sc === sc && isActive(b));
    }
    const activeCount = navItems.filter(isActive).length;
    return {
      gear: gear ? isActive(gear) : false,
      help: help ? isActive(help) : false,
      sc: scMap,
      activeCount,
    };
  }

  it("openDrawer() 后仅 #btnGear 高亮，其余 nav-item 均不高亮", () => {
    __test.openDrawer();
    const h = highlightState();
    expect(win.document.getElementById("btnGear").classList.contains("active")).toBe(true);
    expect(h.help).toBe(false);
    expect(Object.values(h.sc).every((v) => v === false)).toBe(true);
    expect(h.activeCount).toBe(1);
  });

  it("renderHelp() 后仅 #sideBtnHelp 高亮，gear 与场景均不高亮", () => {
    __test.renderHelp();
    const h = highlightState();
    expect(win.document.getElementById("sideBtnHelp").classList.contains("active")).toBe(true);
    expect(h.gear).toBe(false);
    expect(Object.values(h.sc).every((v) => v === false)).toBe(true);
    expect(h.activeCount).toBe(1);
  });

  it("指南页点击场景按钮 → gear/help 均不高亮，且场景按钮高亮", () => {
    __test.renderHelp();
    const btn = win.document.querySelector('#side .nav-item[data-sc="office"]');
    expect(btn).toBeTruthy();
    btn.click();
    const h = highlightState();
    expect(h.gear).toBe(false);
    expect(h.help).toBe(false);
    expect(h.sc.office).toBe(true);
    expect(h.activeCount).toBe(1);
  });

  it("全链路 openDrawer → renderHelp → 场景 render 后无高亮残留", () => {
    __test.openDrawer();
    expect(highlightState().gear).toBe(true);
    __test.renderHelp();
    const h1 = highlightState();
    expect(h1.help).toBe(true);
    expect(h1.gear).toBe(false);
    __test.setActive("office");
    __test.render();
    const h2 = highlightState();
    expect(h2.gear).toBe(false);
    expect(h2.help).toBe(false);
    expect(h2.sc.office).toBe(true);
    expect(h2.activeCount).toBe(1);
  });

  it("主视图下场景高亮正常（uiView===\"main\"）", () => {
    __test.setActive("study");
    __test.render();
    const h = highlightState();
    expect(h.gear).toBe(false);
    expect(h.help).toBe(false);
    expect(h.sc.study).toBe(true);
    expect(h.activeCount).toBe(1);
  });
});

/**
 * 页脚 build 标记（v1.9.5）
 * 页脚文本含 b{BUILD_TAG}，用于用户自证是否已加载最新版（PWA 缓存排查）。
 * 注意：BUILD_TAG 随发布 bump，此处断言需同步更新（与 agent-workbench.html / service-worker.js CACHE_VERSION 保持一致）。
 */
describe("UI 一致性 · 页脚 build 标记", () => {
  let win, __test;
  beforeEach(async () => {
    win = await loadApp();
    __test = win.__test;
  });

  it("#main > .foot 文本含 b20260830c（v3.1.1）", () => {
    __test.render();
    const foot = win.document.querySelector("#main > .foot");
    expect(foot).toBeTruthy();
    expect(foot.textContent).toMatch(/v3\.1\.1 · b20260830c/);
  });

  it("openDrawer() 后 #drawer > .foot 文本含 b20260830c（v3.1.1）", () => {
    __test.openDrawer();
    const foot = win.document.querySelector("#drawer > .foot");
    expect(foot).toBeTruthy();
    expect(foot.textContent).toMatch(/b20260830c/);
  });
});
