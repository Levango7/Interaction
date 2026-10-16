#!/usr/bin/env node
/**
 * check-source-state.mjs — 断言「提交进仓库的是源码态」
 * --------------------------------------------------
 * 仓库约定（v3.7.5+ 任务 4）：提交进 git 的应是**源码态** ——
 *   · HTML 内只有层块占位标记（形如 SRC-xxx-BEGIN 的注释对）与立绘占位（_PET_ART 空对象）
 *   · 具体代码在 src/，立绘在 assets/pet/（HTML 与 src/ 两份文本都不得内联 base64；v3.7.64 起 src 侧也纳入本门禁）
 *   · 拼回/注入由 pre 钩子在构建、测试、e2e、部署前自动完成（交付态仍是单个 HTML）
 *   （注：本注释刻意不写完整的标记字面量，否则其中的注释结束符会提前闭合块注释 —— 踩过两次）
 *
 * 为什么需要这个门禁：开发者为了调试常先跑 `src-split`/`pet-art`（变成 3MB+ 拼回态），
 *   若忘记 `--extract` 就提交，会把 3MB+ 的拼回态塞进仓库，源码态收益（-85%）直接失效。
 *   （本脚本就是因为真实发生过一次误提交而加的。）
 *
 * 两种模式：
 *   · 默认（无参数）：检查**工作树**。CI 在跑 pre 钩子之前调用（ci.yml / deploy.yml / electron-build.yml）。
 *   · `--staged`：只检查**暂存区（index）**里被改动的文件 —— 供 .githooks/pre-commit 使用。
 *     为什么按 index 而非工作树：工作树可能正处在**别人测试链**的注入瞬时态（pretest 拼回、
 *     posttest 才抽回），拿工作树当判据会误拦与源码态无关的正常提交。真正要拦的是
 *     「注入态被 git add 进了 index」，所以判据必须是 index。
 *
 * ⚠️ 这条门禁的存在理由（真实事故）：`npm test`（= vitest run）**失败时 npm 不跑 posttest**
 *   （npm v8+ 语义；本机 npm 12.2.0 实测），工作树会**停在注入态**。此后任何 `git add -A` /
 *   显式 `git add agent-workbench.html` 都会把 3.88MB 拼回态提交进仓库，而 CI 的
 *   `check:source-state` 要到 push 之后才跑 —— 那时坏 blob 已进历史，只能改写。
 *   本门禁把判据前移到**提交前**，且只看 index，不误伤别人在跑的测试链。
 *
 * 用法：
 *   node scripts/check-source-state.mjs            # 工作树（CI）
 *   node scripts/check-source-state.mjs --staged   # 暂存区（pre-commit 钩子）
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const STAGED = process.argv.includes('--staged');
const HTML_REL = 'agent-workbench.html';
const SRC_REL = 'src';
const srcDir = join(root, SRC_REL);

/** 读 git 暂存区某路径内容；未暂存/不存在返回 null */
function stagedContent(rel) {
  try {
    /* maxBuffer 必须放宽：注入/交付态的 HTML 约 3.9MB，超过 execFileSync 默认 1MB 会抛 ENOBUFS，
       把「读不到」误报成「暂存区里不是源码态」——诊断会指向错误的原因（实测踩过）。 */
    return execFileSync('git', ['show', ':' + rel], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });
  } catch { return null; }
}
/** 某路径（或目录）在暂存区被改动的文件清单 */
function stagedNames(rel) {
  try {
    return execFileSync('git', ['diff', '--cached', '--name-only', '--', rel], { cwd: root, encoding: 'utf8' })
      .split('\n').map(s => s.trim()).filter(Boolean);
  } catch { return []; }
}

const srcFiles = existsSync(srcDir)
  ? readdirSync(srcDir).filter(f => f.endsWith('.js')).map(f => f.replace(/\.js$/, ''))
  : [];

/* ===== 取内容：--staged 走 index，默认走工作树 ===== */
let html = null;
let stagedSrc = [];
if (STAGED) {
  const htmlStaged = stagedNames(HTML_REL).length > 0;
  stagedSrc = stagedNames(SRC_REL).filter(s => s.startsWith(SRC_REL + '/') && s.endsWith('.js'));
  if (!htmlStaged && stagedSrc.length === 0) {
    console.log('[check-source-state] ✓ 暂存区未改动 agent-workbench.html / src/*.js —— 无需检查源码态');
    process.exit(0);
  }
  if (htmlStaged) {
    html = stagedContent(HTML_REL);
    if (html === null) {
      console.error('[check-source-state] ✗ 无法读取暂存区的 agent-workbench.html');
      process.exit(1);
    }
  }
} else {
  html = readFileSync(join(root, HTML_REL), 'utf8');
}

const bytes = html === null ? 0 : Buffer.byteLength(html);
const problems = [];
let srcBlocks = [];

/* ① src 层块占位标记应存在（有 HTML 可比时才判） */
if (html !== null) {
  srcBlocks = [...html.matchAll(/\/\*SRC:([\w-]+):BEGIN\*\//g)].map(m => m[1]);
  if (!srcBlocks.length) problems.push('HTML 里没有 /*SRC:…:BEGIN*/ 占位标记（疑似拼回态）');
  if (!STAGED && srcBlocks.length !== srcFiles.length) problems.push(`标记数 ${srcBlocks.length} ≠ src 文件数 ${srcFiles.length}`);
  /* ② 立绘占位应是空对象（不含 base64） */
  if (/const _PET_ART = \{[^}]*data:image\/png;base64/.test(html)) problems.push('HTML 内嵌了立绘 base64（疑似已注入态）');
  /* ③ 体量守门：源码态应显著小于交付态 */
  if (bytes > 1_200_000) problems.push(`HTML 体积 ${(bytes / 1024 / 1024).toFixed(2)}MB 偏大（源码态应 <1.2MB；交付态约 3.2MB）`);
}

/* ②b v3.7.64：src/ 侧同断言 —— 立绘数据在仓库里只允许以 assets/pet/*.png 存在，两份文本都不得内联 base64。
   历史坑（v3.7.58~v3.7.63，本断言就是为它而加）：post 钩子按「src-split --extract → pet-art --extract」顺序时，
   base64 会随 render-widgets 层块被抽回 src/render-widgets.js —— 仓库双存 ~849KB，且当时 HTML 侧检查恒绿。
   正确顺序 = 与注入严格逆序：pet-art --extract 先跑（数据搬回 assets），再 src-split --extract。 */
const BASE64_RE = /data:image\/[a-z0-9.+-]+;base64,/i;
if (STAGED) {
  for (const rel of stagedSrc) {
    const c = stagedContent(rel);
    if (c && BASE64_RE.test(c)) problems.push(`${rel} 内联了 base64 图片数据（立绘只应存 assets/pet/）`);
  }
} else {
  for (const n of srcFiles) {
    const p = join(srcDir, n + '.js');
    if (!existsSync(p)) continue;
    if (BASE64_RE.test(readFileSync(p, 'utf8'))) {
      problems.push(`src/${n}.js 内联了 base64 图片数据（立绘只应存 assets/pet/）`);
    }
  }
}

if (problems.length) {
  console.error(STAGED
    ? '[check-source-state] ✗ 暂存区里的 agent-workbench.html 不是源码态：'
    : '[check-source-state] ✗ 当前不是源码态：');
  for (const p of problems) console.error('  · ' + p);
  console.error('\n回到源码态：npm run src:extract   （链内顺序 = post 钩子：pet-art --extract → src-split --extract）');
  if (STAGED) console.error('  抽回源码态后重新 `git add agent-workbench.html`。');
  console.error('  若报的是「src/ 内联 base64」（历史遗留态）：先拼回再按上述顺序抽一遍即可迁出 —— 直接跑一次 npm test 会自动完成。');
  process.exit(1);
}
console.log(html === null
  ? `[check-source-state] ✓ 暂存区未改动 agent-workbench.html（仅核对 src：${stagedSrc.length} 个文件）`
  : `[check-source-state] ✓ 源码态（HTML ${(bytes / 1024).toFixed(0)}KB；src 标记 ${srcBlocks.length} 个 / 文件 ${srcFiles.length} 个）`);
