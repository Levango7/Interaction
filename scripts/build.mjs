#!/usr/bin/env node
/**
 * Zero-dependency build for agent-workbench.html
 * --------------------------------------------------
 * Assembles the single-file SPA from modular sources:
 *   src/shell/top.html     -> everything before <script> (incl. <script> tag)
 *   src/modules/*.js       -> JS modules, concatenated in filename order
 *   src/shell/bottom.html  -> </script></body></html>
 *
 * Byte-level guarantee: every part is read/written as a raw Buffer, so the
 * output is byte-identical to the original monolithic file (verified by --check).
 *
 * Usage:
 *   node scripts/build.mjs          # dev/test build -> agent-workbench.html (含 __test 钩子，运行时有门控)
 *   node scripts/build.mjs --check  # build in-memory, diff vs current file, exit 1 on mismatch
 *   node scripts/build.mjs --prod   # 生产构建 -> agent-workbench.prod.html（剥离 __test 钩子模块）
 *
 * NOTE (v1.8.9 起架构调整): agent-workbench.html 是交付真相源（single source of truth）。
 * v1.8.8–v1.8.9 的功能（插件系统/场景模板等）直接演进于交付 HTML，
 * src/modules 当前为早期快照、落后于 HTML，build 输出会与 HTML 不一致。
 * 因此 --check 不再做字节级 diff，改为「版本一致性校验」：
 * 校验 package.json / src VERSION / agent-workbench.html 三者版本号一致。
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const SHELL_TOP = join(root, 'src', 'shell', 'top.html');
const SHELL_BOTTOM = join(root, 'src', 'shell', 'bottom.html');
const MOD_DIR = join(root, 'src', 'modules');
// 架构项③：生产构建剥离 __test 钩子模块（测试/本地构建保留，运行时有门控）
const PROD = process.argv.includes('--prod');
const FORCE = process.argv.includes('--force'); // 显式覆盖真相源 HTML（src 已回填 HTML 后才应使用）
const TEST_EXPORT_MOD = '31-bootstrap-test-export.js';
const PROD_STUB = Buffer.from('// [prod build] test hooks stripped (source: src/modules/' + TEST_EXPORT_MOD + ')\n');
const OUT = PROD ? join(root, 'agent-workbench.prod.html') : join(root, 'agent-workbench.html');
const TRUTH_HTML = join(root, 'agent-workbench.html'); // 交付真相源（版本校验固定读它）

function fail(msg) {
  console.error('[build] ' + msg);
  process.exit(1);
}

if (!existsSync(SHELL_TOP)) fail(`missing ${SHELL_TOP}`);
if (!existsSync(SHELL_BOTTOM)) fail(`missing ${SHELL_BOTTOM}`);
if (!existsSync(MOD_DIR)) fail(`missing ${MOD_DIR}`);

const mods = readdirSync(MOD_DIR).filter((f) => f.endsWith('.js')).sort();

const parts = [readFileSync(SHELL_TOP)];
for (const m of mods) {
  if (PROD && m === TEST_EXPORT_MOD) {
    parts.push(PROD_STUB); // 生产构建：剥离 __test 钩子
  } else {
    parts.push(readFileSync(join(MOD_DIR, m)));
  }
}
parts.push(readFileSync(SHELL_BOTTOM));

const out = Buffer.concat(parts);

function sha(b) {
  return createHash('sha256').update(b).digest('hex').slice(0, 16);
}

if (process.argv.includes('--version-check') || process.argv.includes('--check')) {
  // 版本一致性校验（取代旧的 src->HTML 字节 diff，后者因 HTML 已成真相源而失效）
  const readJsonVer = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')).version || null; } catch (e) { return null; } };
  const htmlVer = (() => { try { const m = readFileSync(TRUTH_HTML, 'utf8').match(/const VERSION = "([^"]+)"/); return m ? m[1] : null; } catch (e) { return null; } })();
  const srcVer = (() => { try { const m = readFileSync(join(MOD_DIR, '00-constants.js'), 'utf8').match(/const VERSION = "([^"]+)"/); return m ? m[1] : null; } catch (e) { return null; } })();
  const pkgVer = readJsonVer(join(root, 'package.json'));
  const pkgLockVer = readJsonVer(join(root, 'package-lock.json'));
  const elecVer = readJsonVer(join(root, 'electron', 'package.json'));
  const elecLockVer = readJsonVer(join(root, 'electron', 'package-lock.json'));
  const vers = { 'package.json': pkgVer, 'package-lock.json': pkgLockVer, 'electron/package.json': elecVer, 'electron/package-lock.json': elecLockVer, 'src VERSION': srcVer, 'agent-workbench.html': htmlVer };
  const vals = Object.values(vers).filter(Boolean);
  const all = vals.every(v => v === vals[0]);
  for (const [k, v] of Object.entries(vers)) console.log(`[version] ${k.padEnd(26)} ${v || '(缺失)'}`);
  if (all && vals.length === 6) {
    console.log(`[build] OK 版本一致: ${vals[0]}`);
    process.exit(0);
  } else {
    console.error('[build] MISMATCH: 版本号不一致，需统一');
    process.exit(1);
  }
}

// 安全护栏：交付真相源是 agent-workbench.html，src 为落后快照。
// 默认（非 prod 且未 --force）不覆盖真相源，避免误用旧 src 抹掉手改进 HTML 的功能。
if (!PROD && !FORCE) {
  console.warn('[build] 已跳过写入：agent-workbench.html 是交付真相源，默认构建不再覆盖它。');
  console.warn(`[build] 本次 src 拼接结果 ${out.length} bytes（sha256:${sha(out)}，${mods.length} 模块），未落盘。`);
  console.warn('[build] 仅在 src 已完整回填 HTML 之后，才用 `node scripts/build.mjs --force` 显式重建。');
  process.exit(0);
}
writeFileSync(OUT, out);
console.log(`[build] wrote ${OUT} (${out.length} bytes, sha256:${sha(out)}) from ${mods.length} modules`);
