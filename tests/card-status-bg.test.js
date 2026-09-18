/**
 * card-status-bg.test.js —— 状态归位到标题行 + 输入框与卡片背景拉开差异（v3.7.33）
 * ----------------------------------------------------------------------------
 * 需求（用户截图圈注）：
 *   ① 「状态」放在标题右侧 —— 箭头从操作行里的「→ 进行中」指向标题右侧
 *      → 理解：**状态切换不是"操作"**，不该混在 编辑/分享/删除 里 → 挪到标题行右侧
 *   ② 输入框背景与卡片背景「稍微有点差异」
 *
 * ⚠️ 挪 DOM 之前先查了绑定方式：
 *   `src/ui-scene-bind.js` 用 `$$("[data-move]").forEach(b=> b.onclick=...)` —— **全文档查询后逐次绑定**，
 *   不依赖父容器，所以把按钮从 `.kbtns` 挪到 `.khead` 是安全的。
 *   （若是"逐渲染按父容器绑定"，这一挪就会把状态切换点坏 —— 所以先查再改。）
 *   **并且真的点了它**：CDP 实测 点击前 todo → 点击后 doing ✓ 生效（不是只看位置）
 *
 * 背景差异实测：改前 卡片/输入框 完全相同（ink 都是 rgb(19,19,23)、light 都是纯白）；
 *   改后 ink 卡片 rgb(19,19,23) vs 输入框 rgb(23,23,28)、light 白 vs rgb(245,245,245)。
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CSS = fs.readFileSync(path.join(ROOT, "agent-workbench.html"), "utf8");
const JS = fs.readFileSync(path.join(ROOT, "src/render-scene-main.js"), "utf8");
const BIND = fs.readFileSync(path.join(ROOT, "src/ui-scene-bind.js"), "utf8");

describe("状态放在标题右侧", () => {
  it("卡片模板有 .khead（标题 + 状态同一行）", () => {
    expect(JS).toMatch(/<div class="khead"><div class="t">/);
    expect(JS).toMatch(/<div class="kstate">\$\{btns\}<\/div><\/div>/);
  });

  it("状态按钮只出现一次（不残留旧的 .kbtns 里那份，否则会出现两个）", () => {
    const hits = (JS.match(/\$\{btns\}/g) || []).length;
    expect(hits, "btns 模板变量应只在 kstate 里引用一次").toBe(1);
  });

  it("操作行不再包含状态按钮（只剩 编辑/分享/删除）", () => {
    const m = JS.match(/<div class="kbtns">([\s\S]*?)<\/div><\/div>`;/);
    expect(m, "应能取到操作行片段").toBeTruthy();
    expect(m[1]).toContain("data-edit");
    expect(m[1]).toContain("data-share");
    expect(m[1]).toContain("data-del");
    expect(m[1], "操作行里不应再有 data-move").not.toContain("data-move");
  });

  it("状态按钮的绑定是**全文档查询**（这是挪位置安全的前提，锁住它）", () => {
    expect(BIND).toMatch(/\$\$\("\[data-move\]"\)\.forEach/);
  });

  it("标题行的 CSS：标题可收缩、状态不收缩", () => {
    expect(CSS).toMatch(/\.khead\{display:flex;align-items:flex-start/);
    expect(CSS).toMatch(/\.khead \.t\{flex:1;min-width:0\}/);
    expect(CSS).toMatch(/\.kstate\{display:flex;gap:2px;flex-shrink:0\}/);
  });

  it("状态按钮用紧凑尺寸（min-height 走 --control-h-sm）", () => {
    expect(CSS).toMatch(/\.kstate button\{[^}]*min-height:var\(--control-h-sm\)/);
  });
});

describe("输入框背景与卡片背景拉开差异", () => {
  it("输入框不再用 --panel（那与卡片同色）", () => {
    const m = CSS.match(/input,select,textarea\{[\s\S]*?\}/);
    expect(m, "应存在 input/select/textarea 主规则").toBeTruthy();
    expect(m[0]).toContain("background:var(--surface-muted)");
    expect(m[0], "不得再用与卡片同色的 --panel").not.toContain("background:var(--panel)");
  });

  it("注释里记了原因（避免后人又改回 --panel）", () => {
    expect(CSS).toMatch(/输入框背景改用 --surface-muted/);
  });
});
