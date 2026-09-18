/**
 * theme-token-pairing.test.js —— 主题颜色令牌的**配对完整性**（v3.7.34）
 * ----------------------------------------------------------------------------
 * 起因：做「侧栏选中态 = 主题色」时用了 `background:var(--accent)` + `color:var(--on-accent)`，
 *   但审计发现 **aurora 覆盖了 `--accent` 却没给 `--on-accent`** ——
 *   它靠"继承 root 的值"（恰好是 #fff，在它的紫色 #7b3fec 上对比度 5.58 ✓ 合格）才可读。
 *   **这是侥幸**：root 的值一旦变化，aurora 会**静默变差**，而且看不出来。
 *
 * 本文件的规则（比"缺令牌"更准，避免把只放 :root 的几何令牌误判为缺失）：
 *   **一个主题只要覆盖了某个"颜色令牌"，就必须把它的配对项一起给全。**
 *   （几何令牌 --control-h/--label-h 等只在 :root，不需要逐主题覆盖。）
 *
 * 另：几何令牌只放 :root 也要断言一次 —— 防止有人误把它们逐个主题抄一遍（或反过来漏了 :root）。
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CSS = fs.readFileSync(path.join(ROOT, "agent-workbench.html"), "utf8");

/** 取每个主题块内的令牌集合（light 走 :root） */
function themeTokens() {
  const lines = CSS.split('\n');
  const out = {};
  let cur = null, depth = 0;
  for (const line of lines) {
    const m = line.match(/^:root\[data-theme="(\w+)"\]\{/) || line.match(/^:root\{/);
    if (m && !cur) { cur = m[1] || 'light'; out[cur] = out[cur] || new Set(); depth = 0; }
    if (cur) {
      for (const t of line.match(/--[\w-]+(?=\s*:)/g) || []) out[cur].add(t);
      depth += (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
      if (depth <= 0) cur = null;
    }
  }
  return out;
}

const TOK = themeTokens();
const THEMES = Object.keys(TOK);
const PAIRS = [
  ['--accent', ['--on-accent', '--accent-soft']],
  ['--danger', ['--danger-soft', '--danger-border']],
  ['--warn', ['--warn-soft']],
  ['--panel', ['--line', '--text', '--muted']]
];

describe("主题颜色令牌：覆盖了就要配对给全", () => {
  it("至少 10 个主题被识别到（light + 9 个 data-theme）", () => {
    expect(THEMES.length).toBeGreaterThanOrEqual(10);
  });

  it.each(THEMES)("主题 %s 的配对完整", (th) => {
    const s = TOK[th];
    const bad = [];
    for (const [a, needs] of PAIRS) {
      if (!s.has(a)) continue;                       // 没覆盖 a → 走继承，不算问题
      const miss = needs.filter(n => !s.has(n));
      if (miss.length) bad.push(a + ' 已覆盖但缺 ' + miss.join('/'));
    }
    expect(bad, th + ' 的配对缺口').toEqual([]);
  });

  it("aurora 必须显式声明 --on-accent（它覆盖了 --accent，靠继承是侥幸）", () => {
    expect(TOK['aurora'].has('--on-accent')).toBe(true);
  });
});

describe("几何令牌：只在 :root 定义，主题无需覆盖", () => {
  it("--control-h / --label-h / --field-msg-h / --label-col-w 在 :root 里齐备", () => {
    const root = TOK['light'];
    ['--control-h', '--control-h-sm', '--label-h', '--field-msg-h', '--label-col-w'].forEach(tk => {
      expect(root.has(tk), ':root 应有 ' + tk).toBe(true);
    });
  });

  it("主题不必逐个抄几何令牌（避免「抄漏一处就错位」）—— 断言它们不从主题块里冒出来", () => {
    const themed = THEMES.filter(t => t !== 'light');
    const offenders = themed.filter(t => TOK[t].has('--label-col-w'));
    expect(offenders, '这些主题重复声明了几何令牌（没必要，且容易抄漏）').toEqual([]);
  });
});
