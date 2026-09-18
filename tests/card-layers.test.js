/**
 * card-layers.test.js —— 看板卡内的三层分类 + 操作行必须一行（v3.7.32）
 * ----------------------------------------------------------------------------
 * 卡片天然是**三种性质不同的东西**：
 *   第1层 `.t`      标题      —— 标识
 *   第2层 `.m`      属性 chip —— **只读**（P1 / 逾期日期 / 标签）
 *   第3层 `.kbtns`  操作按钮 —— **可点**（→进行中 / 编辑 / 分享 / 删除）
 *
 * ⚠️ 这里记录一次**我改错了又改回来**的过程，避免后人重犯：
 *   先给「删除」加 `margin-left:auto` 让它靠右独立 —— **是错的** ✗
 *   实测卡片仅 223px 宽，「删除」被推到最右后**孤零零占一行**，不成排列（用户当场指出）。
 *   量清楚才发现：真正的问题是**四颗按钮差 12px 挤不进一行**（可用 205px、共需 216px）。
 *   正确做法：收紧间距（4→2px）与按钮水平内边距（8→6px）→ 共需 194px → **四颗一行** ✓
 *   （只压水平方向：按钮高度 32px 与移动端 44px 触控高度都不动）
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CSS = fs.readFileSync(path.join(ROOT, "agent-workbench.html"), "utf8");
const JS = fs.readFileSync(path.join(ROOT, "src/render-scene-main.js"), "utf8");

describe("卡片三层：标题 / 属性 / 操作", () => {
  it("三层各自的类名在渲染代码里齐备", () => {
    expect(JS).toMatch(/class="kcard"/);
    expect(JS).toContain('<div class="m">');
    expect(JS).toContain('<div class="kbtns">');
    expect(JS).toContain('<div class="t">');
  });

  it("操作层与属性层之间有分隔（border-top + 内边距）", () => {
    const m = CSS.match(/\.kbtns\{[^}]*\}/);
    expect(m, "应存在 .kbtns 规则").toBeTruthy();
    expect(m[0]).toContain("border-top:1px solid");
    expect(m[0]).toContain("padding-top:var(--space-2)");
  });

  it("分隔线用 color-mix 调淡（不抢视觉）", () => {
    expect(CSS).toMatch(/\.kbtns\{[^}]*color-mix\(in srgb, var\(--line\) 60%, transparent\)/);
  });

  it("删除按钮带危险色类（u-text-danger）", () => {
    expect(JS).toMatch(/data-del="\$\{x\.id\}"[^>]*class="u-text-danger"/);
  });

  it("属性层的 chip 各有语义色（P0/P1/P2 + 逾期红）", () => {
    expect(CSS).toMatch(/\.pri\.P0\{background:var\(--danger-soft\)/);
    expect(CSS).toMatch(/\.pri\.P1\{background:var\(--warn-soft\)/);
    expect(CSS).toMatch(/\.kcard \.m \.due\.od\{background:var\(--danger-soft\)/);
  });
});

describe("操作行：四颗按钮必须在同一行", () => {
  it("不得再用 margin-left:auto 把删除推走（实测会变成孤零零一行）", () => {
    expect(CSS, "不应再出现 [data-del]{margin-left:auto}").not.toMatch(/\[data-del\]\s*\{[^}]*margin-left:auto/);
  });

  it("间距已收紧到 2px", () => {
    expect(CSS).toMatch(/\.kbtns\{[^}]*gap:2px/);
  });

  it("按钮只压水平内边距到 6px（高度与触控靶不动）", () => {
    expect(CSS).toMatch(/\.kbtns button\{padding-left:6px;padding-right:6px\}/);
  });

  it("移动端 44px 触控高度仍然保留（收紧不能牺牲可点区域）", () => {
    expect(CSS).toMatch(/@media[^{]*\{\s*[\s\S]*?\.kbtns button\{min-height:44px/);
  });

  it("仍保留 flex-wrap（极窄屏允许换行，不做硬塞）", () => {
    expect(CSS).toMatch(/\.kbtns\{[^}]*flex-wrap:wrap/);
  });
});

describe("标签输入框：更长 + 与添加按钮间距更小", () => {
  it("列模板已调整（第4轨 1.6fr / 第5轨 42px），且只出现一次", () => {
    const hits = (CSS.match(/grid-template-columns:1\.6fr 1fr \.9fr 1\.6fr 42px/g) || []).length;
    expect(hits, "模板值只应钉在一处，避免改一处漏一处").toBe(1);
  });

  it("第5轨是定宽 px（否则按钮宽度会参与 fr 计算、把前四轨边界带偏）", () => {
    const m = CSS.match(/\.form-row--board\{[^}]*\}/);
    expect(m[0]).toMatch(/1\.6fr 42px/);
  });
});
