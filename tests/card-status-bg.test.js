/**
 * card-status-bg.test.js —— 状态行 + 输入框背景差异（v3.7.33/35，随重排更新）
 * ----------------------------------------------------------------------------
 * ① **状态独立成行**（标题正下方，整行宽）—— 放在标题右侧会被长标题挤压（用户实测指出），
 *    改为独立行后「标题任意长」与「状态位置稳定」同时成立。
 *    挪 DOM 前查过绑定：`ui-scene-bind.js` 的 `$$("[data-move]").forEach(b=> b.onclick=…)`
 *    是**全文档查询后逐次绑定**，不依赖父容器 → 挪动安全；且 CDP 实测点击生效（todo→doing）。
 * ② 输入框背景与卡片背景**必须有细微差**：
 *    改前两者完全相同（ink 都是 rgb(19,19,23)、light 都是纯白），缺少"这里能输入"的暗示；
 *    改用 `--surface-muted` 后两个主题都拉开了差，且**零新色值**。
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CSS = fs.readFileSync(path.join(ROOT, "agent-workbench.html"), "utf8");
const JS = fs.readFileSync(path.join(ROOT, "src/render-scene-main.js"), "utf8");
const BIND = fs.readFileSync(path.join(ROOT, "src/ui-scene-bind.js"), "utf8");

describe("状态独立成行（v3.7.35）", () => {
  it("卡片模板：标题在状态行之前，状态行引用 btns（data-move 在 btns 定义处）", () => {
    const i = JS.indexOf('return `<div class="kcard"');
    const seg = JS.slice(i, i + 900);
    const t = seg.indexOf('class="t"');
    const st = seg.indexOf('class="kstate"');
    expect(t, "标题应在").toBeGreaterThan(-1);
    expect(st, "状态行应在").toBeGreaterThan(-1);
    expect(t, "标题应在状态之前").toBeLessThan(st);
    /* 源码里状态行放的是 `${btns}` 变量（data-move 定义在 btns 的赋值处，本文件另一条断言它） */
    expect(seg.slice(st), "状态行应引用 btns").toContain("${btns}");
    expect(JS.slice(0, i), "btns 的定义应包含 data-move").toMatch(/data-move/);
  });

  it("不应再有 .khead 包裹（标题与状态不同行）", () => {
    expect(JS, "不应再用 .khead 包裹标题与状态").not.toContain('class="khead"');
  });

  it("状态按钮的绑定是全文档查询（挪位置安全的前提）", () => {
    expect(BIND).toMatch(/\$\$\("\[data-move\]"\)\.forEach/);
  });

  it("状态行 CSS：flex 容器 + 按钮整行宽", () => {
    expect(CSS).toMatch(/\.kstate\{display:flex/);
    expect(CSS).toMatch(/\.kstate button\{flex:1/);
  });
});

describe("输入框背景与卡片背景有差异", () => {
  it("输入框用 --surface-muted，不用与卡片同色的 --panel", () => {
    const m = CSS.match(/input,select,textarea\{[\s\S]*?\}/);
    expect(m, "应存在 input/select/textarea 主规则").toBeTruthy();
    expect(m[0]).toContain("background:var(--surface-muted)");
    expect(m[0], "不得再用与卡片同色的 --panel").not.toContain("background:var(--panel)");
  });

  it("注释里记了原因（避免后人又改回 --panel）", () => {
    expect(CSS).toMatch(/输入框背景改用 --surface-muted/);
  });
});
