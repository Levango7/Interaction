#!/usr/bin/env node
/**
 * check-source-state.mjs — 断言「提交进仓库的是源码态」
 * --------------------------------------------------
 * 仓库约定（v3.7.5+ 任务 4）：提交进 git 的应是**源码态** ——
 *   · HTML 内只有层块占位标记（/*SRC:<name>:BEGIN*/ … END */）与立绘占位（_PET_ART 空对象）
 *   · 具体代码在 src/，立绘在 assets/pet/
 *   · 拼回/注入由 pre 钩子在构建、测试、e2e、部署前自动完成（交付态仍是单个 HTML）
 *
 * 为什么需要这个门禁：开发者为了调试常先跑 `src-split`/`pet-art`（变成 3.18MB 拼回态），
 *   若忘记 `--extract` 就提交，会把 3MB+ 的拼回态塞进仓库，源码态收益（-85%）直接失效。
 *   （本脚本就是因为真实发生过一次误提交而加的。）
 *
 * 用法：node scripts/check-source-state.mjs   （CI 在跑 pre 钩子之前调用）
 *   失败时打印如何回到源码态。
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const htmlPath = join(root, 'agent-workbench.html');
const html = readFileSync(htmlPath, 'utf8');
const bytes = Buffer.byteLength(html);
const problems = [];

/* ① src 层块占位标记应存在 */
const srcBlocks = [...html.matchAll(/\/\*SRC:([\w-]+):BEGIN\*\//g)].map(m => m[1]);
const srcDir = join(root, 'src');
const srcFiles = existsSync(srcDir) ? readdirSync(srcDir).filter(f => f.endsWith('.js')).map(f => f.replace(/\.js$/, '')) : [];
if (!srcBlocks.length) problems.push('HTML 里没有 /*SRC:…:BEGIN*/ 占位标记（疑似拼回态）');
if (srcBlocks.length !== srcFiles.length) problems.push(`标记数 ${srcBlocks.length} ≠ src 文件数 ${srcFiles.length}`);

/* ② 立绘占位应是空对象（不含 base64） */
if (/const _PET_ART = \{[^}]*data:image\/png;base64/.test(html)) problems.push('HTML 内嵌了立绘 base64（疑似已注入态）');

/* ③ 体量守门：源码态应显著小于交付态 */
if (bytes > 1_200_000) problems.push(`HTML 体积 ${(bytes / 1024 / 1024).toFixed(2)}MB 偏大（源码态应 <1.2MB；交付态约 3.2MB）`);

if (problems.length) {
  console.error('[check-source-state] ✗ 当前不是源码态：');
  for (const p of problems) console.error('  · ' + p);
  console.error('\n回到源码态：node scripts/src-split.mjs --extract && node scripts/pet-art.mjs --extract');
  process.exit(1);
}
console.log(`[check-source-state] ✓ 源码态（HTML ${(bytes / 1024).toFixed(0)}KB；src 标记 ${srcBlocks.length} 个 / 文件 ${srcFiles.length} 个）`);
