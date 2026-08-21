#!/usr/bin/env node
/**
 * Release for agent-workbench · v1.11.1 引入
 * --------------------------------------------------
 * 一次性统一 bump 全部版本源，终结"手改版本号导致多源漂移、build:check 必红"。
 *
 * 用法：node scripts/release.mjs <版本号> [--tag 20260816a]
 *   npm run release 1.11.2
 *
 * bump 目标（与 build.mjs --check 的四源门禁一致 + lockfile 同步）：
 *   1. package.json / electron/package.json / manifest.json 的 version
 *   2. agent-workbench.html 的 VERSION + BUILD_TAG（未指定 --tag 时按当日日期+序号字母自动生成）
 *   3. service-worker.js 的 CACHE_VERSION = v{版本}-{tag}（保证 SW activate 清旧缓存）
 *   4. 两份 package-lock.json 的 version 字段（仅版本字段；依赖变更请另行 npm install 后提交）
 *   5. 收尾自动跑 build:check 自检，失败即退出非零
 *
 * 注意：发版后请更新 CHANGELOG.md，测试通过再提交。
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const newVer = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : null;
const tagIdx = process.argv.indexOf('--tag');
const tagArg = tagIdx > -1 ? process.argv[tagIdx + 1] : null;

if (!newVer || !/^\d+\.\d+\.\d+$/.test(newVer)) {
  console.error('[release] 用法：node scripts/release.mjs <版本号，如 1.11.2> [--tag 20260816a]');
  process.exit(1);
}

function fail(msg){ console.error('[release] ' + msg); process.exit(1); }
function read(p){ return readFileSync(join(root, p), 'utf8'); }
function write(p, s){ writeFileSync(join(root, p), s); }

// build tag 自动生成：当日日期（UTC）+ 序号字母；同日多次发版时在当前字母上递增
function autoBuildTag(currentTag){
  const now = new Date();
  const today = String(now.getUTCFullYear())
    + String(now.getUTCMonth() + 1).padStart(2, '0')
    + String(now.getUTCDate()).padStart(2, '0');
  if (currentTag && currentTag.startsWith(today) && /^[a-z]$/.test(currentTag.slice(-1))
      && currentTag.charCodeAt(currentTag.length - 1) < 122){
    return today + String.fromCharCode(currentTag.charCodeAt(currentTag.length - 1) + 1);
  }
  return today + 'a';
}

/* 1) package.json ×2 + manifest.json */
for (const p of ['package.json', 'electron/package.json', 'manifest.json']) {
  const j = JSON.parse(read(p));
  j.version = newVer;
  write(p, JSON.stringify(j, null, 2) + '\n');
  console.log(`[release] ${p} → ${newVer}`);
}

/* 2) HTML：VERSION + BUILD_TAG */
let html = read('agent-workbench.html');
if (!/const VERSION = "[^"]+";/.test(html)) fail('agent-workbench.html 中未找到 VERSION 定义');
const curTagM = html.match(/const BUILD_TAG = "([^"]+)"/);
const buildTag = tagArg || autoBuildTag(curTagM ? curTagM[1] : '');
html = html.replace(/const VERSION = "[^"]+";/, `const VERSION = "${newVer}";`);
html = html.replace(/const BUILD_TAG = "[^"]+";/, `const BUILD_TAG = "${buildTag}";`);
write('agent-workbench.html', html);
console.log(`[release] agent-workbench.html → VERSION=${newVer} BUILD_TAG=${buildTag}`);

/* 3) SW：CACHE_VERSION */
let sw = read('service-worker.js');
if (!/var CACHE_VERSION = "[^"]*";/.test(sw)) fail('service-worker.js 中未找到 CACHE_VERSION 定义');
sw = sw.replace(/var CACHE_VERSION = "[^"]*";/, `var CACHE_VERSION = "v${newVer}-${buildTag}";`);
write('service-worker.js', sw);
console.log(`[release] service-worker.js → CACHE_VERSION=v${newVer}-${buildTag}`);

/* 4) lockfile 版本字段同步 */
for (const p of ['package-lock.json', 'electron/package-lock.json']) {
  if (!existsSync(join(root, p))) continue;
  const j = JSON.parse(read(p));
  j.version = newVer;
  if (j.packages && j.packages['']) j.packages[''].version = newVer;
  write(p, JSON.stringify(j, null, 2) + '\n');
  console.log(`[release] ${p} → ${newVer}（仅 version 字段）`);
}

/* 5) 自检 */
const r = spawnSync(process.execPath, [join(__dirname, 'build.mjs'), '--check'], { stdio: 'inherit' });
if (r.status !== 0) fail('build:check 自检未通过，请检查上方输出');

console.log(`[release] OK 已统一 bump 至 v${newVer}（BUILD_TAG=${buildTag}）`);
console.log('[release] 提醒：请更新 CHANGELOG.md，测试通过后提交。');
