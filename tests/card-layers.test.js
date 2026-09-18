/**
 * card-layers.test.js —— 看板卡内的三层分类（v3.7.31）
 * ----------------------------------------------------------------------------
 * 用户观察（截图圈注）：卡片里其实有**三种不同性质的东西**挤在一起：
 *   第1行 `.t`      标题      —— 标识
 *   第2行 `.m`      属性 chip —— **只读**（P1 / 逾期日期 / 标签）
 *   第3行 `.kbtns`  操作按钮 —— **可点**（→进行中 / 编辑 / 分享 / 删除）
 * 但原先"属性 chip"与"操作按钮"**都是带边框/填充的小矩形**，读的人分不清哪个能点；
 * 且「删除」之所以掉到第二行，是**意外换行**（前三颗排到 284px、第 4 颗放不下），不是设计。
 *
 * 本轮做的分类（最小改动，不重画 chip）：
 *   ① 操作层加一条极淡分隔线 → "信息"与"可点"一眼可辨
 *   ② 危险操作（删除）靠右独立成组 → 把意外换行变成刻意分离，也避免与常用按钮误触
 *
 * 另附本次的第二项：标签输入框变长 + 与添加按钮间距收窄
 *   （第4轨 1.2fr→1.6fr、第5轨 64px→42px；实测输入框 172→218px、间距 38→16px）
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CSS = fs.readFileSync(path.join(ROOT, "agent-workbench.html"), "utf8");
const JS = fs.readFileSync(path.join(ROOT, "src/render-scene-main.js"), "utf8");

describe("卡片三层：标题 / 属性 / 操作", () => {
  it("三层各自的类名在渲染代码里齐备（.t / .m / .kbtns）", () => {
    expect(JS).toMatch(/class="kcard"/);
    expect(JS).toContain('<div class="m">');
    expect(JS).toContain('<div class="kbtns">');
    expect(JS).toMatch(/class="t"[^>]*>|class="t"/);
  });

  it("操作层有分隔线与内边距（与属性层分开）", () => {
    const m = CSS.match(/\.kbtns\{[^}]*\}/);
    expect(m, "应存在 .kbtns 规则").toBeTruthy();
    expect(m[0]).toContain("border-top:1px solid");
    expect(m[0]).toContain("padding-top:var(--space-2)");
  });

  it("分隔线用 color-mix 调淡（不抢视觉）", () => {
    expect(CSS).toMatch(/\.kbtns\{[^}]*color-mix\(in srgb, var\(--line\) 60%, transparent\)/);
  });

  it("危险操作（删除）靠右独立成组", () => {
    expect(CSS).toMatch(/\.kbtns \[data-del\]\{margin-left:auto\}/);
  });

  it("窄屏（≤520px）取消靠右，避免被挤出容器", () => {
    expect(CSS).toMatch(/@media \(max-width:520px\)\{\.kbtns \[data-del\]\{margin-left:0\}\}/);
  });

  it("删除按钮在渲染代码里带危险色类（u-text-danger）", () => {
    expect(JS).toMatch(/data-del="\$\{x\.id\}"[^>]*class="u-text-danger"/);
  });

  it("属性层的三种 chip 各有语义色（P0/P1/P2 + 逾期红）", () => {
    expect(CSS).toMatch(/\.pri\.P0\{background:var\(--danger-soft\)/);
    expect(CSS).toMatch(/\.pri\.P1\{background:var\(--warn-soft\)/);
    expect(CSS).toMatch(/\.kcard \.m \.due\.od\{background:var\(--danger-soft\)/);
  });
});

describe("标签输入框：更长 + 与添加按钮间距更小", () => {
  it("列模板已调整（第4轨 1.6fr / 第5轨 42px）", () => {
    expect(CSS).toMatch(/grid-template-columns:1\.6fr 1fr \.9fr 1\.6fr 42px/);
  });

  it("第5轨是定宽 px 而非 fr（否则按钮宽度会参与 fr 计算、把前四轨边界带偏）", () => {
    const m = CSS.match(/\.form-row--board\{[^}]*\}/);
    expect(m[0]).toMatch(/1\.6fr 42px/);
  });

  it("两行共用同一模板（模板字符串只应出现一次，避免两行各写各的）", () => {
    const hits = (CSS.match(/grid-template-columns:1\.6fr 1fr \.9fr 1\.6fr 42px/g) || []).length;
    expect(hits).toBe(1);
  });
});
