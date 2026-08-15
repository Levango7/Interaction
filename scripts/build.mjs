#!/usr/bin/env node
/**
 * Build for agent-workbench.html
 * --------------------------------------------------
 * 架构（v1.8.9+ 定稿）：agent-workbench.html 是唯一交付真相源。
 * v1.8.8–v1.8.9 的功能（插件系统 / 场景模板 / 习惯链可视化等）直接演进于
 * 交付 HTML；src/modules 是早期模块化快照、已落后，不再参与构建。
 *
 * 命令：
 *   node scripts/build.mjs                # 锁死：提示以 HTML 为源，不落盘、退出码 0
 *   node scripts/build.mjs --check        # 版本一致性校验（六处）+ HTML 完整性检查
 *   node scripts/build.mjs --prod         # 生产构建，产出部署四件套：
 *                                          #   agent-workbench.prod.html（__TEST_GATE__ 硬置 false）
 *                                          #   service-worker.prod.js（CACHE_VERSION 自动 bump：
 *                                          #     v{应用版本}-{UTC时间戳}，杜绝"改了 HTML 但 PWA 吃旧缓存"）
 *
 * 注意：不再有 src->HTML 字节拼接。--prod 通过把 __TEST_GATE__ 置 false 来
 * 停用测试钩子（块仍在但不执行/不暴露），避免物理剥离导致的括号配对风险。
 * 部署/hooks 请用 .prod 产物；仓库内的 service-worker.js 保持开发基线值不变。
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const TRUTH_HTML = join(root, 'agent-workbench.html');     // 唯一真相源
const PROD_HTML  = join(root, 'agent-workbench.prod.html'); // 生产产物

const PROD = process.argv.includes('--prod');
const CHECK = process.argv.includes('--check') || process.argv.includes('--version-check');

function fail(msg){ console.error('[build] ' + msg); process.exit(1); }
function sha(buf){ return createHash('sha256').update(buf).digest('hex').slice(0,16); }

if (!existsSync(TRUTH_HTML)) fail(`missing ${TRUTH_HTML}`);

/* ---------- --check：版本一致性 + 真相源完整性 ---------- */
if (CHECK) {
  // v1.11.1：版本门禁由六源改为四源（package.json ×2 / manifest.json / HTML VERSION）。
  // 变更原因：① src/modules 孤儿快照已归档删除（git tag archive/src-snapshot-v1.9.9）；
  // ② lockfile 根版本滞后是 npm 生态常态，纳入硬门禁导致 CI 长期必红——lockfile 的版本
  //   字段改由 scripts/release.mjs 发版时同步维护，不做 CI 硬校验。
  const readJsonVer = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')).version || null; } catch(e){ return null; } };
  const htmlVer = (() => { const m = readFileSync(TRUTH_HTML, 'utf8').match(/const VERSION = "([^"]+)"/); return m ? m[1] : null; })();
  const vers = {
    'package.json':              readJsonVer(join(root, 'package.json')),
    'electron/package.json':     readJsonVer(join(root, 'electron', 'package.json')),
    'manifest.json':             readJsonVer(join(root, 'manifest.json')),
    'agent-workbench.html':      htmlVer,
  };
  for (const [k,v] of Object.entries(vers)) console.log(`[version] ${k.padEnd(28)} ${v || '(缺失)'}`);
  const vals = Object.values(vers).filter(Boolean);
  const ok = vals.length === 4 && vals.every(v => v === vals[0]);
  // 完整性：真相源必须含关键功能区（防误传旧 src 拼接产物）
  const html = readFileSync(TRUTH_HTML, 'utf8');
  const required = ['__TEST_GATE__', 'window.__test', 'scMeta', 'sanitizeHtml'];
  const missing = required.filter(s => !html.includes(s));
  if (!ok) fail('MISMATCH: 版本号不一致，需统一（目标 ' + (htmlVer || '?') + '）；发版请用 npm run release <版本号>');
  if (missing.length) fail('完整性检查失败：真相源缺少关键标记 ' + missing.join(', '));
  console.log(`[build] OK 版本一致: ${vals[0]} · 真相源完整 (${html.length} bytes, sha256:${sha(Buffer.from(html))})`);
  process.exit(0);
}

/* ---------- --prod：truth HTML 直通 + 停用测试钩子 + SW 缓存版本自动 bump ---------- */
if (PROD) {
  const html = readFileSync(TRUTH_HTML, 'utf8');
  // 1) 把 __TEST_GATE__ 的计算结果硬置为 false：测试钩子块不执行，生产永不暴露内部 API。
  //    仅替换 IIFE 头，保留块体（死代码），不做有风险的物理剥离。
  const RE = /var __TEST_GATE__ = \(function\(\)\{[\s\S]*?\}\)\(\);/;
  if (!RE.test(html)) fail('未找到 __TEST_GATE__ 定义，无法安全生成生产构建');
  const prodHtml = html.replace(RE, 'var __TEST_GATE__ = false; /* [prod build] test hooks disabled */');
  writeFileSync(PROD_HTML, prodHtml);
  console.log(`[build] wrote ${PROD_HTML} (${prodHtml.length} bytes, sha256:${sha(Buffer.from(prodHtml))}) · __TEST_GATE__=false`);

  // 2) SW 缓存版本自动 bump：从真相源提取应用版本，叠加 UTC 时间戳，
  //    保证每次 prod 构建产物的 CACHE_VERSION 全局唯一 → SW activate 必然清旧缓存，
  //    根治"改了 HTML 但 PWA 用户一直看到旧版"的问题。
  const SW_SRC = join(root, 'service-worker.js');
  const SW_PROD = join(root, 'service-worker.prod.js');
  if (existsSync(SW_SRC)) {
    const appVer = (() => { const m = html.match(/const VERSION = "([^"]+)"/); return m ? m[1] : 'dev'; })();
    const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14); // yyyyMMddHHmmss（UTC）
    const newCacheVer = `v${appVer}-${ts}`;
    const sw = readFileSync(SW_SRC, 'utf8');
    const SW_RE = /var CACHE_VERSION = "[^"]*";/;
    if (!SW_RE.test(sw)) fail('service-worker.js 中未找到 CACHE_VERSION 定义');
    const swProd = sw.replace(SW_RE, `var CACHE_VERSION = "${newCacheVer}"; /* [prod build] auto-bumped */`);
    writeFileSync(SW_PROD, swProd);
    console.log(`[build] wrote ${SW_PROD} · CACHE_VERSION=${newCacheVer}`);
  } else {
    console.warn('[build] 未找到 service-worker.js，跳过 SW 产物（不影响 HTML 构建）');
  }
  process.exit(0);
}

/* ---------- 默认 build：锁死真相源 ---------- */
console.warn('[build] agent-workbench.html 是唯一交付真相源，不再由 src 拼接生成。');
console.warn('[build] 直接编辑 agent-workbench.html；校验用 --check，部署产物用 --prod。');
process.exit(0);
