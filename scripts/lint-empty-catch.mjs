#!/usr/bin/env node
/**
 * lint-empty-catch.mjs —— 空 catch 可观测性门禁（v3.7.87 新增）
 * ----------------------------------------------------------------------------
 * 背景：`catch(_){}` 是**静默失败的唯一温床**。用户遇到"点了没反应 / 数据没保存 / 面板空白"，
 * 控制台干净、日志为空、无人报警 —— 因为异常被吞了。这类缺陷**浏览器根本不报错**，
 * 只能靠构建期静态扫描发现（与 v3.7.70 的悬空令牌同构：都是"不报错但静默降级"）。
 *
 * 存量 493 处不能一刀切删 —— 其中大量是有意保留的降级路径。所以本门禁做的是**分级 + 棘轮**：
 *   ① **分级**（不是数数）：按 try 块内容判断吞掉的是"预期降级"还是"真实错误"
 *      P0 真危险（localStorage / setItem / save 系 / JSON.parse / await 等）/ P1 待判断 / P2 规范写法
 *      再叠加第二根轴 `bare`：catch 体连注释都没有 = 作者未评估，同风险下优先处理
 *   ② **基线棘轮**：存量记为基线只报告，**新增 P0 才失败**（沿用 lint-tokens / module-graph 口径）
 *   ③ **给标准修法**：`catch(e){ try{ if(typeof pushDiag==="function") pushDiag("warn", ...); }catch(_){} }`
 *      —— 上报但不改变原控制流：原本静默继续的，改后依然继续。
 *
 * 🔴 判定逻辑在 `scripts/lib/empty-catch.mjs`（可被单元测试直接 import）。
 *    本文件只负责：参数解析 / 基线读写 / 输出格式 / 退出码。改判定请去改 lib。
 *
 * 为什么扫 `src/*.js` 而不是 `agent-workbench.html`：
 *   src/ 是源码态真相源，HTML 源码态只有壳（617KB）、拼回态才是全量（3.5MB）。
 *   扫 src/ 则**两种状态下结果一致**，不依赖 pre 钩子是否已拼回（同 lint-layers.mjs 做法）。
 *
 * 用法：
 *   node scripts/lint-empty-catch.mjs                # 检查：新增 P0 失败（阻断）
 *   node scripts/lint-empty-catch.mjs --report       # 只出分级报告，不判失败
 *   node scripts/lint-empty-catch.mjs --freeze       # 把当前存量写为基线
 *   node scripts/lint-empty-catch.mjs --scan <路径>  # 指定目录/文件（测试与临时排查用）
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanSource, keyOf } from './lib/empty-catch.mjs';

const _dir = dirname(fileURLToPath(import.meta.url));
const _root = join(_dir, '..');
const SRC_DIR = join(_root, 'src');
const BASELINE = join(_dir, 'lint-empty-catch.baseline.json');

const FREEZE = process.argv.includes('--freeze');
const REPORT = process.argv.includes('--report');

/* --scan 默认 src/；单文件时 lodash basename 后再拼回去 */
const _scanIdx = process.argv.indexOf('--scan');
const SCAN = _scanIdx > -1 ? process.argv[_scanIdx + 1] : null;
const _isFile = !!SCAN && SCAN.endsWith('.js');
const _scanDir = _isFile ? dirname(SCAN) : (SCAN || SRC_DIR);
const files = _isFile ? [basename(SCAN)] : readdirSync(_scanDir).filter((f) => f.endsWith('.js')).sort();

const items = [];
const _occSeen = {};
for (const f of files) {
  items.push(...scanSource(readFileSync(join(_scanDir, f), 'utf8'), f, _occSeen));
}

const byLevel = (lv) => items.filter((it) => it.level === lv);
const p0 = byLevel('P0'), p1 = byLevel('P1'), p2 = byLevel('P2');
const bareN = (arr) => arr.filter((it) => it.bare).length;

/* ---- 冻结 ---- */
if (FREEZE) {
  writeFileSync(BASELINE, JSON.stringify({
    _note: '空 catch 基线（存量）。棘轮：只减不增 —— 改一处该条即消失；新增 P0 会在门禁里失败。',
    updated: new Date().toISOString().slice(0, 10),
    count: items.length,
    items: items.slice().sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)
  }, null, 2) + '\n');
  console.log(`[lint-empty-catch] 基线已冻结：${items.length} 处（P0 ${p0.length} / P1 ${p1.length} / P2 ${p2.length}）→ ${basename(BASELINE)}`);
  process.exit(0);
}

/* ---- 报告头 ---- */
console.log(`[lint-empty-catch] 扫描 ${files.length} 个源文件：空 catch 共 ${items.length} 处`);
console.log(`  P0 危险（静默吞真实错误）: ${p0.length}   其中无注释 ${bareN(p0)}`);
console.log(`  P1 待人工判断            : ${p1.length}   其中无注释 ${bareN(p1)}`);
console.log(`  P2 无害（能力探测）      : ${p2.length}   其中无注释 ${bareN(p2)}`);

if (REPORT) {
  console.log('\n—— P1 抽样（前 10 条，判断这堆是否值得再细分）——');
  for (const it of p1.slice(0, 10)) console.log(`  ${it.file}:${it.line}  try{ ${it.snippet} }`);

  const bareP0 = p0.filter((it) => it.bare), evalP0 = p0.filter((it) => !it.bare);
  console.log(`\n—— P0-a 无任何注释（作者未评估，优先处理）：${bareP0.length} 处 ——`);
  for (const it of bareP0) console.log(`  ${it.file}:${it.line}  ${it.why}\n      try{ ${it.snippet} }`);
  console.log(`\n—— P0-b 有注释说明（作者权衡过，次优先）：${evalP0.length} 处 ——`);
  for (const it of evalP0.slice(0, 20)) console.log(`  ${it.file}:${it.line}  ${it.why}\n      try{ ${it.snippet} }  catch{ ${it.note} }`);
  if (evalP0.length > 20) console.log(`  …… 余 ${evalP0.length - 20} 处同此型`);

  console.log('\n—— 标准修法（改变蹊默，不改变控制流）——');
  console.log('  catch(e){ try{ if(typeof pushDiag === "function") pushDiag("warn", "<发生了什么>: "+((e&&e.message)||e), {where:"<函数名>"}); }catch(_){} }');
  console.log('  说明：诊断自身必须二次保护；原本静默继续的逻辑，改后依然继续。');
  process.exit(0);
}

/* ---- 门禁判定（棘轮）---- */
if (!existsSync(BASELINE)) {
  console.error('[lint-empty-catch] FAIL：基线文件不存在，先跑 `node scripts/lint-empty-catch.mjs --freeze`');
  process.exit(1);
}
const prev = JSON.parse(readFileSync(BASELINE, 'utf8'));
/* 注意 prevKeys 是 Set —— 取规模用 .size；写 Object.keys(prevKeys).length 恒为 0（項是内部槽位不是自有属性），
   表现为"基线 0 处"，判定虽不受影响但读数骗人，排查时会带偏方向。 */
const prevKeys = new Set((prev.items || []).map(keyOf));
const added = items.filter((it) => !prevKeys.has(keyOf(it)));
const removed = (prev.items || []).filter((p) => !items.some((it) => keyOf(it) === keyOf(p)));

console.log(`[lint-empty-catch] 基线 ${prevKeys.size} 处 · 新增 ${added.length} 处 · 消失 ${removed.length} 处`);
for (const it of added) console.log(`  新 增 ${it.level}  ${it.file}:${it.line}  ${it.why}\n      try{ ${it.snippet} }`);

const newP0 = added.filter((it) => it.level === 'P0');
if (newP0.length) {
  console.error(`\n[lint-empty-catch] FAIL：新增 ${newP0.length} 处 P0 级空 catch（静默吞真实错误）。`);
  console.error('  三选一：');
  console.error('   (a) 上报诊断 —— catch(e){ try{ if(typeof pushDiag==="function") pushDiag("warn","...",{where:"..."}); }catch(_){} }');
  console.error('   (b) 确为无害 —— 改写成显式能力探测（try 体只剩 typeof / in window 判定），自然降为 P2');
  console.error('   (c) 确实 unavoidable —— node scripts/lint-empty-catch.mjs --freeze 重冻基线（须在 commit message 说明理由）');
  process.exit(1);
}
console.log('[lint-empty-catch] ✓ 无新增 P0 级空 catch' + (added.length ? `（新增 ${added.length} 处为 P1/P2，仅提示）` : ''));
process.exit(0);
