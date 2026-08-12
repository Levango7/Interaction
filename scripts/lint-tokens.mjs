#!/usr/bin/env node
/**
 * lint-tokens.mjs — 扫描 agent-workbench.html 里的裸 px 值，
 * 找出与 --space-n / --fs-n / --radius-n 令牌值等价但没用的硬编码，给出收敛提示。
 * 非阻断（CI 不 fail），是渐进式收敛的辅助工具。
 */
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../agent-workbench.html', import.meta.url), 'utf8');
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
  process.exit(0);
} else {
  console.log('[lint-tokens] 已无可收敛的裸 px 值 ✓');
  process.exit(0);
}
