/**
 * UI 一致性断言（静态扫描 agent-workbench.html）
 * 目的：把本轮审计修复的关键防线固化成回归测试，防止后续迭代回潮。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(__dirname, "..", "agent-workbench.html"), "utf8");

describe("UI 一致性 · 令牌体系", () => {
  it("z-index 全部使用语义令牌，无裸数字", () => {
    const bare = html.match(/z-index:\s*\d+/g);
    expect(bare, `发现裸 z-index 数字: ${bare?.join(",")}`).toBeNull();
  });

  it("topbar 单行布局 + 正文工具行存在（toolbar-row / main-wrap）", () => {
    expect(html).toContain('class="topbar"');
    expect(html).toContain('class="toolbar-row"');
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
