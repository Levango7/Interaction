#!/usr/bin/env node
/**
 * lint-false-receipt.mjs —— 「假回执」门禁（R-37，2026-10-27 新增）
 * ----------------------------------------------------------------------------
 * 抓的是这一类缺陷：**异步操作的成败还没落地，代码先把「成功了」告诉用户**。
 *   原型（台账 R-34，v3.7.147 修掉第一处）：
 *     try{ navigator.clipboard.writeText(x); toast("已复制", "ok"); }catch(_){}
 *   `writeText` 返回 Promise，同步 try/catch 抓不到 rejection；toast 已经弹出去了。
 *   浏览器拒绝写剪贴板 ⇒ 用户看到「已复制」，剪贴板里什么都没有 —— **回执与事实相反**。
 *
 * 为什么单开一条门禁而不是并进 lint-empty-catch：
 *   那条判的是「异常被吞」，这条判的是「**结果没等就报成功**」——两者都能由同一个
 *   `catch(_){}` 引起，但**修法完全不同**（那条要补诊断，这条要改成「等 promise 落地再给回执」），
 *   合成一条会让"三选一"提示自相矛盾。判定层在 scripts/lib/false-receipt.mjs。
 *
 * 棘轮口径（与 lint-tokens / module-graph / lint-empty-catch 一致）：
 *   存量进基线只报告，**新增 P0 才失败**。修掉一处，该条即从基线消失；
 *   谁再写回一个「没等就报成功」，门禁当场红。
 *
 * 为什么扫 src/*.js 而不是 agent-workbench.html：
 *   与 lint-empty-catch / lint-layers 同款理由 —— src/ 是源码态真相源，两种状态下结果一致，
 *   不依赖注入步骤是否拼回。
 *
 * 用法：
 *   node scripts/lint-false-receipt.mjs                # 检查：新增 P0 失败（阻断）
 *   node scripts/lint-false-receipt.mjs --report       # 只出报告，不判失败
 *   node scripts/lint-false-receipt.mjs --freeze       # 把当前存量写为基线
 *   node scripts/lint-false-receipt.mjs --scan <路径>  # 指定目录/文件（测试与临时排查用）
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findFalseReceipts, keyOf, PROMISE_APIS } from './lib/false-receipt.mjs';
import { classifyDelta } from './lib/empty-catch.mjs';

const _dir = dirname(fileURLToPath(import.meta.url));
const _root = join(_dir, '..');
const SRC_DIR = join(_root, 'src');
const BASELINE = join(_dir, 'lint-false-receipt.baseline.json');

const FREEZE = process.argv.includes('--freeze');
const REPORT = process.argv.includes('--report');

const _scanIdx = process.argv.indexOf('--scan');
const SCAN = _scanIdx > -1 ? process.argv[_scanIdx + 1] : null;
const _isFile = !!SCAN && SCAN.endsWith('.js');
const _scanDir = _isFile ? dirname(SCAN) : (SCAN || SRC_DIR);
const files = _isFile ? [basename(SCAN)] : readdirSync(_scanDir).filter((f) => f.endsWith('.js')).sort();

const items = [];
const _occSeen = {};
for (const f of files) items.push(...findFalseReceipts(readFileSync(join(_scanDir, f), 'utf8'), f, _occSeen));

const p0 = items.filter((it) => it.level === 'P0');
const p1 = items.filter((it) => it.level === 'P1');

/* ---- 冻结 ---- */
if (FREEZE) {
  writeFileSync(BASELINE, JSON.stringify({
    _note: '假回执（R-37）基线（存量）。棘轮：新增 P0 即失败；修掉一处该条消失。',
    updated: new Date().toISOString().slice(0, 10),
    count: items.length,
    items: items.slice().sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)
  }, null, 2) + '\n');
  console.log(`[lint-false-receipt] 基线已冻结：${items.length} 处（P0 ${p0.length} / P1 ${p1.length}）→ ${basename(BASELINE)}`);
  process.exit(0);
}

console.log(`[lint-false-receipt] 扫描 ${files.length} 个源文件 · 白名单 ${PROMISE_APIS.length} 个 Promise API：命中 ${items.length} 处`);
console.log(`  P0 假回执（没等结果就报成功）: ${p0.length}`);
console.log(`  P1 未接住（rejection 无人处理）: ${p1.length}`);

if (REPORT) {
  for (const it of items) {
    console.log(`  ${it.level} ${it.kind}  ${it.file}:${it.line}  ${it.why}\n      ${it.snippet}`);
  }
  console.log('\n—— 标准修法（等结果落地再给回执，不要靠同步 try/catch）——');
  console.log('  const p = navigator.clipboard.writeText(txt);');
  console.log('  if(p && typeof p.then === "function") p.then(function(){ toast("已复制","ok"); }, function(){ toast("复制失败","warn"); });');
  console.log('  else toast("已复制","ok");   // 旧 API 同步返回 undefined 的情形');
  process.exit(0);
}

/* ---- 门禁判定（棘轮）---- */
if (!existsSync(BASELINE)) {
  console.error('[lint-false-receipt] FAIL：基线文件不存在，先跑 `node scripts/lint-false-receipt.mjs --freeze`');
  process.exit(1);
}
const prev = JSON.parse(readFileSync(BASELINE, 'utf8'));
const prevItems = prev.items || [];
const { added, addedReal, removedReal, movedTo } = classifyDelta(items, prevItems);

console.log(`[lint-false-receipt] 基线 ${prevItems.length} 处 · 新增 ${addedReal.length} 处 · 消失 ${removedReal.length} 处`
  + (movedTo.size ? ` · 搬家 ${movedTo.size} 处（body 一致 ⇒ 不计新增）` : ''));
for (const it of addedReal) console.log(`  新 增 ${it.level}  ${it.file}:${it.line}  ${it.why}\n      ${it.snippet}`);

const newP0 = addedReal.filter((it) => it.level === 'P0');
if (newP0.length) {
  console.error(`\n[lint-false-receipt] FAIL：新增 ${newP0.length} 处「假回执」（异步结果没等就报成功）。`);
  console.error('  修法：把回执挪进 promise 的落地回调 ——');
  console.error('   const p = navigator.clipboard.writeText(x);');
  console.error('   if(p && typeof p.then === "function") p.then(成功回调, 失败回调); else 成功回调();');
  console.error('  （确属不可避免的少数情形：`node scripts/lint-false-receipt.mjs --freeze`，commit message 里写理由）');
  process.exit(1);
}
console.log('[lint-false-receipt] ✓ 无新增假回执' + (addedReal.length ? `（新增 ${addedReal.length} 处为 P1，仅提示）` : ''));
process.exit(0);
