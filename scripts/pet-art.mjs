#!/usr/bin/env node
/**
 * pet-art.mjs — 萌宠立绘的「外置 / 回注」工具
 * --------------------------------------------------
 * 动机：9 张立绘以 base64 内嵌在 agent-workbench.html 里，占了整文件约 33%（1180KB），
 *   导致源码文件 3.5MB、编辑器卡顿、diff 不可读。把**数据**（不是代码）挪到 assets/pet/*.png，
 *   代码结构不动 —— agent-workbench.html 仍是逻辑的唯一真相源。
 *
 * 用法：
 *   node scripts/pet-art.mjs --extract    # 从 HTML 抽出立绘到 assets/pet/，HTML 中留标记占位
 *   node scripts/pet-art.mjs              # 默认：把 assets/pet/*.png 回注进 HTML（幂等）
 *   node scripts/pet-art.mjs --check      # 只校验：assets 齐全、HTML 已注入、两侧一致
 *
 * 标记：const _PET_ART = { <BEGIN标记> ... <END标记> };
 *   回注即替换两个标记之间的内容；重复执行结果一致（幂等）。
 *   注意：标记字面量只在本文件的 BEGIN/END 常量里出现 —— 不要在块注释里写完整标记，
 *   否则 `*` + `/` 会提前闭合注释（这里踩过）。
 *
 * 与构建的关系：交付物仍必须是**单个 HTML**（file:// 直开 / PWA 离线 / Electron 打包），
 *   所以回注是构建期的必要一步：
 *     · npm test / test:coverage / build / build:check / build:prod → 都挂了 pre 钩子自动回注
 *   只有本地直接双击打开源码 HTML 时才需要手工 `npm run pet:inject`。
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const HTML = join(root, 'agent-workbench.html');
const ART_DIR = join(root, 'assets', 'pet');

const BEGIN = '/*PET_ART:BEGIN*/';
const END = '/*PET_ART:END*/';
/* 通用块正则：不论有没有标记都能定位到 _PET_ART 字面量 */
const RE_ANY = /const _PET_ART = \{[\s\S]*?\};/;
const hasMarkers = h => h.includes(BEGIN) && h.includes(END);

const EXTRACT = process.argv.includes('--extract');
const CHECK = process.argv.includes('--check');
const sha = b => createHash('sha256').update(b).digest('hex').slice(0, 12);

function fail(msg) { console.error('[pet-art] ' + msg); process.exit(1); }

let html = readFileSync(HTML, 'utf8');
if (!RE_ANY.test(html)) fail(`未在 ${HTML} 找到 const _PET_ART = {…}; 字面量`);
if (!EXTRACT && !hasMarkers(html)) fail('HTML 里还没有标记，先跑一次 --extract');

const readArt = () => {
  const body = html.match(RE_ANY)[0].replace(BEGIN, '').replace(END, '');
  const out = {};
  for (const kv of body.matchAll(/"([\w]+)"\s*:\s*"data:image\/png;base64,([A-Za-z0-9+/=]+)"/g)) out[kv[1]] = kv[2];
  return out;
};

if (EXTRACT) {
  const art = readArt();
  const kinds = Object.keys(art);
  if (!kinds.length) {
    /* 已经是源码态（未注入）→ 无操作成功，不要当失败（否则会被误判成命令出错） */
    console.log('[pet-art] 已经是源码态（HTML 内无立绘），无需抽取');
    process.exit(0);
  }
  mkdirSync(ART_DIR, { recursive: true });
  let bytes = 0;
  for (const k of kinds) {
    const buf = Buffer.from(art[k], 'base64');
    writeFileSync(join(ART_DIR, k + '.png'), buf);
    bytes += buf.length;
    console.log(`  抽出 ${k.padEnd(9)} ${buf.readUInt32BE(16)}×${buf.readUInt32BE(20)}  ${Math.round(buf.length / 1024)}KB  sha=${sha(buf)}`);
  }
  /* 记录键顺序：回注时照它排 —— 保证 extract→inject 字节级无损（否则会退化成字母序，diff 不可信） */
  writeFileSync(join(ART_DIR, 'order.json'), JSON.stringify(kinds) + '\n', 'utf8');
  const before = Buffer.byteLength(html);
  html = html.replace(RE_ANY, `const _PET_ART = {${BEGIN}${END}};`);
  writeFileSync(HTML, html, 'utf8');
  console.log(`[pet-art] 抽出 ${kinds.length} 张 / ${Math.round(bytes / 1024)}KB（原始 PNG）`);
  console.log(`[pet-art] HTML ${(before / 1024 / 1024).toFixed(2)}MB → ${(Buffer.byteLength(html) / 1024 / 1024).toFixed(2)}MB（省 ${Math.round((before - Buffer.byteLength(html)) / 1024)}KB）`);
} else {
  /* 回注（幂等） */
  let files = existsSync(ART_DIR) ? readdirSync(ART_DIR).filter(f => f.endsWith('.png')) : [];
  if (!files.length) fail(`${ART_DIR} 下没有 PNG，无法回注`);
  const orderFile = join(ART_DIR, 'order.json');
  if (existsSync(orderFile)) {
    const order = JSON.parse(readFileSync(orderFile, 'utf8'));
    files.sort((a, b) => {
      const ia = order.indexOf(a.replace(/\.png$/, '')), ib = order.indexOf(b.replace(/\.png$/, ''));
      return (ia < 0 ? 1e9 : ia) - (ib < 0 ? 1e9 : ib) || a.localeCompare(b);
    });
  } else files = files.sort();

  const parts = [];
  for (const f of files) {
    const buf = readFileSync(join(ART_DIR, f));
    if (buf.readUInt32BE(0) !== 0x89504e47) fail(`${f} 不是 PNG`);
    if (CHECK) console.log(`  ✓ ${f.padEnd(13)} ${buf.readUInt32BE(16)}×${buf.readUInt32BE(20)}  ${Math.round(buf.length / 1024)}KB`);
    else parts.push(`"${f.replace(/\.png$/, '')}":"data:image/png;base64,${buf.toString('base64')}"`);
  }

  if (CHECK) {
    const inHtml = Object.keys(readArt());
    const onDisk = files.map(f => f.replace(/\.png$/, ''));
    const missing = onDisk.filter(k => !inHtml.includes(k));
    if (!inHtml.length) {
      /* 源码态（未注入）是仓库里的正常状态：assets 齐全即可，不算不一致 */
      console.log(`[pet-art] check：源码态 ✓（HTML 未注入，assets ${onDisk.length} 张齐全；构建/测试会自动回注）`);
    } else if (missing.length) {
      console.log(`[pet-art] check：✗ 部分注入 —— assets ${onDisk.length} 张，HTML 仅 ${inHtml.length} 张，缺：${missing.join(',')}`);
      process.exit(1);
    } else {
      console.log(`[pet-art] check：已注入态 ✓（assets ${onDisk.length} 张 = HTML ${inHtml.length} 张，一致）`);
    }
  } else {
    const injected = `const _PET_ART = {${BEGIN}${parts.join(',')}${END}};`;
    const before = Buffer.byteLength(html);
    html = html.replace(RE_ANY, injected);
    writeFileSync(HTML, html, 'utf8');
    console.log(`[pet-art] 回注 ${parts.length} 张 → HTML ${(before / 1024 / 1024).toFixed(2)}MB → ${(Buffer.byteLength(html) / 1024 / 1024).toFixed(2)}MB`);
  }
}
