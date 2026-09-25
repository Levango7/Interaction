/**
 * theme-scene-tokens.test.js —— 场景色令牌化与弱色阶达标的守护（v3.7.52）
 * ----------------------------------------------------------------------------
 * 背景（实测）：模板原先直接内联 `SCENARIOS[].color` 的裸 hex，导致 11 套主题下场景标签 /
 * 页头图标 / 链路图标 / 分享徽记**不随主题变化** —— mist 主题下任务标签文字与自身底色亮度相同
 * （对比度 1.0 = 完全不可见），forest 1.2:1，浅色主题下 study/code/health 也只有 2.7~4.3:1。
 *
 * 修复分两层，本文件各钉一条：
 *   ① CSS：10 个令牌块（:root + 9 个 data-theme）各自给出达标的 --sc-<场景> 与 -text 系列令牌
 *   ② JS：渲染端一律走 scCss()/scSoft()（出厂值 → 主题令牌；用户自定义色 → 原 hex）
 *
 * 渲染层对比度（真渲染算 luminance）由 e2e `theme-matrix.spec.js` 兜底，本文件只做静态与语义断言。
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadApp } from "./helpers/loadApp.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(join(root, "agent-workbench.html"), "utf8");

/** 按大括号计数切出每个令牌块的正文（不用"取全文第一个匹配"的正则——那类断言会指错块） */
function tokenBlocks() {
  const out = [];
  const re = /(:root(?:\[data-theme="([a-z]+)"\])?)\s*\{/g;
  let m;
  while ((m = re.exec(html))) {
    const bodyStart = m.index + m[0].length;
    let depth = 1, i = bodyStart;
    while (i < html.length && depth > 0) {
      if (html[i] === "{") depth++;
      else if (html[i] === "}") depth--;
      i++;
    }
    const body = html.slice(bodyStart, i - 1);
    /* 只保留真令牌块：@media 里也有 :root{（内容区宽度等）与 JS 字符串里的 :root{，都不是主题块 */
    if (!/--panel\s*:/.test(body)) continue;
    out.push({ theme: m[2] || "light", body });
  }
  return out;
}
const SCENES = ["office", "design", "study", "data", "code", "life", "health", "finance"];
const TEXT_TOKENS = ["--muted", "--text-dim", "--text-dim-2", "--text-dim-3", "--text-faint", "--accent-text", "--danger-text", "--warn-text", "--ok-text"];

describe("① 每个令牌块都要给出场景色与文字安全色令牌", () => {
  const blocks = tokenBlocks();

  it("10 个令牌块都能被切出来（:root + 9 个主题）", () => {
    expect(blocks.length).toBe(10);
    expect(blocks.filter((b) => b.theme !== "light").length).toBe(9);
  });

  it("每个块都定义全部 8 个场景令牌（漏一个 → 该主题下 var() 静默回退 = 不可见）", () => {
    for (const b of blocks) {
      const missing = SCENES.filter((s) => !new RegExp("--sc-" + s + "\\s*:").test(b.body));
      expect(missing, `主题 ${b.theme} 缺场景令牌`).toEqual([]);
    }
  });

  it("每个块都把文字色阶与 -text 系列声明全（含 v3.7.52 新增的 4 个）", () => {
    for (const b of blocks) {
      const missing = TEXT_TOKENS.filter((k) => !new RegExp(k.replace(/-/g, "\\-") + "\\s*:").test(b.body));
      /* aurora 是例外：它是浅色主题、文字色阶刻意继承 :root（只覆盖 --text/--muted/--accent） */
      const allowInherit = b.theme === "aurora" ? ["--text-dim", "--text-dim-2", "--text-dim-3", "--text-faint", "--danger-text", "--warn-text", "--ok-text", "--accent-text"] : [];
      const reallyMissing = missing.filter((k) => !allowInherit.includes(k));
      expect(reallyMissing, `主题 ${b.theme} 缺文字令牌`).toEqual([]);
    }
  });

  it("场景令牌值同块内不得重复声明（改一处漏一处是历史高发坑）", () => {
    for (const b of blocks) {
      for (const s of SCENES) {
        const hits = (b.body.match(new RegExp("--sc-" + s + "\\s*:", "g")) || []).length;
        expect(hits, `主题 ${b.theme} 的 --sc-${s} 声明 ${hits} 次`).toBe(1);
      }
    }
  });
});

describe("② 渲染端不得再内联场景 hex", () => {
  it("src/ 里没有 `style=\"…${x.color}…\"` 形态的裸 hex 注入", () => {
    const offenders = [];
    for (const f of readdirSync(join(root, "src")).filter((x) => x.endsWith(".js"))) {
      const code = readFileSync(join(root, "src", f), "utf8");
      for (const m of code.matchAll(/style="[^"]*\$\{[A-Za-z_.]+\.color\}[^"]*"/g)) offenders.push(f + ": " + m[0].slice(0, 60));
    }
    expect(offenders, "场景色必须经 scCss()/scSoft() 包裹").toEqual([]);
  });

  it("浅底不得用「hex + 透明度后缀」拼法（对 var() 无效）", () => {
    const offenders = [];
    for (const f of readdirSync(join(root, "src")).filter((x) => x.endsWith(".js"))) {
      const code = readFileSync(join(root, "src", f), "utf8");
      for (const m of code.matchAll(/\$\{[A-Za-z_.]+\.color\}(?:22|1f|1a|33|1e)\b/g)) offenders.push(f + ": " + m[0]);
    }
    expect(offenders).toEqual([]);
  });

  it("scCss/scSoft 已定义（防被误删）", () => {
    const dl = readFileSync(join(root, "src", "data-links.js"), "utf8");
    expect(/function scCss\(/.test(dl)).toBe(true);
    expect(/function scSoft\(/.test(dl)).toBe(true);
  });
});

describe("③ scCss 语义：出厂色走令牌，自定义色保留", () => {
  it("出厂色 → var(--sc-<场景>, <hex>)；改过色 → 原 hex", () => {
    const win = loadApp();
    const { scCss, scSoft } = win;
    const SCENARIOS = win.__test.SCENARIOS;
    const brand = SCENARIOS.office.color;
    expect(scCss(brand)).toContain("var(--sc-office");
    expect(scSoft(brand)).toContain("color-mix");
    expect(scSoft(brand)).toContain("var(--sc-office");
    /* 用户把场景色改成自定义值 → 必须原样内联（尊重自定义，不强行套令牌） */
    SCENARIOS.office.color = "#123456";
    expect(scCss("#123456")).toBe("#123456");
    expect(scSoft("#123456")).toContain("#123456");
    SCENARIOS.office.color = brand;
    expect(scCss(brand)).toContain("var(--sc-office");
  });
});
