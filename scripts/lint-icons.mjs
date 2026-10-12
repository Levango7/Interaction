#!/usr/bin/env node
/**
 * lint-icons.mjs —— 字符图标门禁（v3.7.120 新增）
 * ----------------------------------------------------------------------------
 * 背景：项目 P0 规则要求「图标必须是统一描边、可矢量缩放的 SVG 方案」，但代码里长期存在
 * 用字符字形充当功能图标的地方 —— 评估时扫出 19 处（`✕` 关闭按钮）、以及已修的
 * `☰`（订阅源）/ `⚙`（编辑布局）/ `✓`（保存）。这类写法看着"能跑"，实际代价是：
 * 字形随字体变、对不齐、不可参与 stroke-width / currentColor 规范、读屏器念错语义。
 *
 * 存量不能一刀切改（视觉回归面大），所以本门禁沿用本仓成熟口径 —— **分级 + 棘轮**：
 *   ① 分级：P0 = 按钮内容只有符号（用户只能靠字形猜功能）；P1 = 符号与文字混排（文字可兜底）
 *   ② 基线棘轮：存量写进基线只报告，**新增 P0 才失败**（同 lint-tokens / lint-empty-catch）
 *
 * 🔴 判定逻辑在 `scripts/lib/icon-scan.mjs`（可被单元测试直接 import）。
 *    本文件只负责：参数解析 / 基线读写 / 输出格式 / 退出码。改判定请去改 lib。
 *
 * 为什么扫 `src/*.js` 而不是 `agent-workbench.html`：
 *   同 lint-empty-catch —— src/ 是源码态真相源，HTML 源码态只有壳、拼回态才是全量；
 *   扫 src/ 则两种状态下结果一致，不依赖 pre 钩子是否已拼回。
 *
 * ⚠️ 已知覆盖缺口（如实留痕，勿以为它覆盖了全仓）：
 *   `agent-workbench.html` 的**骨架区**（不属于任何 SRC 块）实测含 1 处字符图标按钮
 *   （`✕` 关闭按钮）。该区不在 src/ 内，本门禁看不见它。未扩到 HTML 的理由同
 *   lint-empty-catch：naive 扩展会引入基线漂移，而收益只有 1 处。
 *
 * 用法：
 *   node scripts/lint-icons.mjs                # 检查：新增 P0 失败（阻断）
 *   node scripts/lint-icons.mjs --report       # 只出分级报告，不判失败
 *   node scripts/lint-icons.mjs --freeze       # 把当前存量写为基线
 *   node scripts/lint-icons.mjs --scan <路径>  # 指定目录/文件（测试与临时排查用）
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanSource, keyOf } from './lib/icon-scan.mjs';

const _dir = dirname(fileURLToPath(import.meta.url));
const _root = join(_dir, '..');
const SRC_DIR = join(_root, 'src');
const BASELINE = join(_dir, 'lint-icons.baseline.json');

const FREEZE = process.argv.includes('--freeze');
const REPORT = process.argv.includes('--report');

const _scanIdx = process.argv.indexOf('--scan');
const SCAN = _scanIdx > -1 ? process.argv[_scanIdx + 1] : null;
const _isFile = !!SCAN && SCAN.endsWith('.js');
const _scanDir = _isFile ? dirname(SCAN) : SCAN || SRC_DIR;
const files = _isFile
  ? [basename(SCAN)]
  : readdirSync(_scanDir).filter((f) => f.endsWith('.js')).sort();

const items = [];
for (const f of files) {
  items.push(...scanSource(readFileSync(join(_scanDir, f), 'utf8'), f));
}

const byLevel = (lv) => items.filter((it) => it.level === lv);
const p0 = byLevel('P0');
const p1 = byLevel('P1');
const uniq = (arr) => [...new Set(arr.map((it) => it.text))];

/* ---- 冻结 ---- */
if (FREEZE) {
  writeFileSync(
    BASELINE,
    JSON.stringify(
      {
        _note:
          '字符图标基线（存量）。棘轮：只减不增 —— 改一处该条即消失；新增 P0 会在门禁里失败。',
        updated: new Date().toISOString().slice(0, 10),
        count: items.length,
        items: items
          .slice()
          .sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line),
      },
      null,
      2
    ) + '\n'
  );
  console.log(
    `[lint-icons] 基线已冻结：${items.length} 处（P0 ${p0.length} / P1 ${p1.length}）→ ${basename(BASELINE)}`
  );
  process.exit(0);
}

/* ---- 报告头 ---- */
console.log(`[lint-icons] 扫描 ${files.length} 个源文件：字符图标按钮共 ${items.length} 处`);
console.log(`  P0 按钮内容只有符号（无文字线索）: ${p0.length}   不同字形：${uniq(p0).join(" ")}`);
console.log(`  P1 符号与文字混排（文字可兜底）  : ${p1.length}   不同字形：${uniq(p1).join(" ")}`);

if (REPORT) {
  console.log('\n—— P0 明细（按文件）——');
  const byFile = {};
  for (const it of p0) (byFile[it.file] = byFile[it.file] || []).push(it);
  for (const [f, arr] of Object.entries(byFile)) {
    console.log(`  ${f}  ${arr.length} 处：${arr.map((x) => `L${x.line} ${JSON.stringify(x.text)}`).join("  ")}`);
  }
  console.log('\n—— 标准修法 ——');
  console.log('  1) 在 core.js 的 UI_ICONS 里确认已有对应语义图标（无则新增一个描边 SVG，viewBox 0 0 24 24）；');
  console.log('  2) 模板里把字符换成 ${UI_ICONS.xxx}；');
  console.log('  3) 该容器补一条 `.容器 svg{width:16px;height:16px}` —— 尺寸走图标档位，不写裸 px；');
  console.log('  4) 若按钮原本只有字形，记得补 aria-label（读屏器念字形是错的）。');
  process.exit(0);
}

/* ---- 门禁判定（棘轮）---- */
if (!existsSync(BASELINE)) {
  console.error('[lint-icons] FAIL：基线文件不存在，先跑 `node scripts/lint-icons.mjs --freeze`');
  process.exit(1);
}
const prev = JSON.parse(readFileSync(BASELINE, 'utf8'));
/* prevKeys 是 Set —— 取规模用 .size（同 lint-empty-catch 的踩坑注记） */
const prevKeys = new Set((prev.items || []).map(keyOf));
const added = items.filter((it) => !prevKeys.has(keyOf(it)));
const removed = (prev.items || []).filter((p) => !items.some((it) => keyOf(it) === keyOf(p)));

console.log(`[lint-icons] 基线 ${prevKeys.size} 处 · 新增 ${added.length} 处 · 消失 ${removed.length} 处`);
for (const it of added) {
  console.log(`  新 增 ${it.level}  ${it.file}:${it.line}  ${it.why}\n      按钮内容 ${JSON.stringify(it.text)}`);
}

const newP0 = added.filter((it) => it.level === 'P0');
if (newP0.length) {
  console.error(`\n[lint-icons] FAIL：新增 ${newP0.length} 处 P0 级字符图标（按钮内容只有符号字形）。`);
  console.error('  三选一：');
  console.error('   (a) 换成 SVG —— 模板写 ${UI_ICONS.xxx}，并给容器补 `.xx svg{width:16px;height:16px}`');
  console.error('   (b) 补文字 —— 让按钮内容不只由符号组成（纯图标按钮则保留符号但加 aria-label 不够，仍应换 SVG）');
  console.error('   (c) 确实要留 —— node scripts/lint-icons.mjs --freeze 重冻基线（须在 commit message 说明理由）');
  process.exit(1);
}
console.log('[lint-icons] ✓ 无新增 P0 级字符图标' + (added.length ? `（新增 ${added.length} 处为 P1，仅提示）` : ''));
process.exit(0);
