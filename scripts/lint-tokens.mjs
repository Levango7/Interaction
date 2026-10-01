#!/usr/bin/env node
/**
 * lint-tokens.mjs — 设计令牌两件事：
 *   ① 扫描 agent-workbench.html 里的裸 px 值，找出与 --space-n / --fs-n / --radius-n
 *      令牌值等价但没用的硬编码，给出收敛提示。**非阻断**，是渐进式收敛的辅助工具。
 *   ② v3.7.70 新增：**悬空令牌检查**（var(--x) 引用了但全仓零定义）。
 *      这类缺陷浏览器**不报错、静默回退**（背景透明 / 描边丢失 / 字号变默认），
 *      只能靠构建期门禁发现。**阻断**，但采用基线棘轮：基线内既有项只报告，**新增**才失败。
 *
 * 用法：
 *   node scripts/lint-tokens.mjs             # ① 提示 + ② 检查
 *   node scripts/lint-tokens.mjs --freeze    # 把当前悬空令牌写为基线
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const _dir = dirname(fileURLToPath(import.meta.url));
const _root = join(_dir, '..');
const BASELINE = join(_dir, 'lint-tokens.baseline.json');
const html = readFileSync(join(_root, 'agent-workbench.html'), 'utf8');
const lines = html.split('\n');

// 收集令牌定义（:root 里的 --space-* / --fs-* / --radius-*）
const TOKEN_RE = /(--(?:space|fs|radius)-[\w-]+)\s*:\s*([0-9.]+)px/g;
const tokenMap = {}; // 值px → 令牌名（同名值只记第一个）
for (const m of html.matchAll(TOKEN_RE)) {
  if (!tokenMap[m[2]]) tokenMap[m[2]] = m[1];
}

// CSS 值里的裸 px（排除注释行和已用 var() 的行）
// 只收敛"间距/圆角"这两类（图标尺寸等 width/height 属中性，而且 svg 宽高本就该用 px；font-size 与 font-* 留给人工判断）
const PXC_RE = /(?:padding|margin|gap|border-radius|top|left|right|bottom)\s*:\s*([0-9.]+)px/g;

const hits = [];
lines.forEach((ln, idx) => {
  if (ln.trim().startsWith('*') || ln.trim().startsWith('//')) return; // 注释行
  if (ln.includes('var(--')) return; // 已用令牌
  for (const m of ln.matchAll(PXC_RE)) {
    const px = m[1];
    if (tokenMap[px]) {
      hits.push({ line: idx + 1, prop: m[0].trim(), px, token: tokenMap[px], context: ln.trim().slice(0, 100) });
    }
  }
});

console.log(`[lint-tokens] 扫描完成：共 ${hits.length} 处裸 px 可用令牌代替`);
if (hits.length) {
  // 按值分组统计（收敛优先级参考）
  const byPx = {};
  hits.forEach(h => { byPx[h.px] = (byPx[h.px] || 0) + 1; });
  console.log('\n按像素值聚合（收敛优先从频次高的值入手）：');
  Object.entries(byPx).sort((a, b) => b[1] - a[1]).forEach(([px, cnt]) => {
    console.log(`  ${px}px → ${tokenMap[px]}  × ${cnt} 处`);
  });
  console.log('\n前 10 个具体位置：');
  hits.slice(0, 10).forEach(h => console.log(`  行${h.line}: ${h.context}  →  var(${h.token})`));
  console.log('\n（用 --fix 可逐步收敛；CI 不强制阻断）');
}

/* ═══════════════════════════════════════════════════════════════════════
   ② 悬空令牌检查（v3.7.70）—— var(--x) 引用了但全仓零定义
   ═══════════════════════════════════════════════════════════════════════ */
/* 收集所有「定义」：--x: 值 （含 6 处主题块重复声明，任一处有定义即算已定义） */
const defRe = /(--[a-z][\w-]*)\s*:/g;
const defs = new Set();
const addDefs = (text) => { for (const m of text.matchAll(defRe)) defs.add(m[1]); };
addDefs(html);
const SRC = join(_root, 'src');
const srcList = [];
if (existsSync(SRC)) {
  for (const f of readdirSync(SRC).filter(x => x.endsWith('.js'))) {
    const s = readFileSync(join(SRC, f), 'utf8');
    srcList.push({ f, s });
    addDefs(s);
  }
}

/* 收集所有「引用」：var(--x) */
const useRe = /var\(\s*(--[a-z][\w-]*)/g;
const useAt = new Map();
const addUses = (text, where) => {
  text.split('\n').forEach((ln, i) => {
    for (const m of ln.matchAll(useRe)) {
      const n = m[1];
      if (!useAt.has(n)) useAt.set(n, []);
      useAt.get(n).push(`${where}:${i + 1}`);
    }
  });
};
addUses(html, 'HTML');
for (const { f, s } of srcList) addUses(s, f);

/* 运行时动态注入的（setProperty / 模板拼接 var(--sc-${x})）不算悬空，否则误报 */
const DYNAMIC = /^--(sc-|pt|sx|sy|pet-|token)/;
const dangling = [...useAt.keys()].filter(n => !defs.has(n) && !DYNAMIC.test(n)).sort();

if (process.argv.includes('--freeze')) {
  writeFileSync(BASELINE, JSON.stringify({ dangling }, null, 2) + '\n');
  console.log(`[lint-tokens] 已冻结悬空令牌基线 ${dangling.length} 条 → scripts/lint-tokens.baseline.json`);
  process.exit(0);
}

const base = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : { dangling: [] };
const added = dangling.filter(n => !base.dangling.includes(n));
const fixed = base.dangling.filter(n => !dangling.includes(n));

console.log(`\n[lint-tokens] 悬空令牌：当前 ${dangling.length} 条 / 基线 ${base.dangling.length} 条（新增 ${added.length} · 已修 ${fixed.length}）`);
if (fixed.length) console.log('  已修（可从基线移除）：' + fixed.join(', '));
if (added.length) {
  console.error('\n[lint-tokens] ✗ 新增悬空令牌（引用了未定义的令牌 → 浏览器静默回退）：');
  added.forEach(n => console.error(`  - ${n}  引用 ${useAt.get(n).length} 处：${useAt.get(n).slice(0, 3).join(', ')}`));
  process.exit(1);
}
console.log('[lint-tokens] ✓ 无新增悬空令牌');
process.exit(0);
