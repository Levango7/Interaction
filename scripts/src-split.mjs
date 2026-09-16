#!/usr/bin/env node
/**
 * src-split.mjs — 把单文件里的「分层源块」外置到 src/，构建期再拼回单文件
 * --------------------------------------------------
 * 背景（任务 4 · 模块化第一步）：`agent-workbench.html` 是 2.3MB 单文件，分层契约
 * （`scripts/lint-layers.mjs` + `docs/architecture-layers.md`）已经把 JS 划成 8 大层、31 块。
 * 本脚本把**最安全先拆的层**（Util、Crypto）抽到 `src/<name>.js`，让这些代码可以用编辑器/工具
 * 单独处理；交付物仍是**单个 HTML**（file:// 直开 / PWA 离线 / Electron 打包都不变）。
 *
 * 与 build.mjs 的「不做 src→HTML 字节拼接」定稿不冲突：那条讲的是**不把 HTML 拆成运行时多个
 * <script src>**（file:// 下会失败）。这里只是「源码可编辑性」的构建期回填，产物与手写单文件等价。
 *
 * 用法：
 *   node scripts/src-split.mjs --extract    # HTML → src/*.js（按层），HTML 内留标记占位
 *   node scripts/src-split.mjs              # 默认：src/*.js → HTML（幂等）
 *   node scripts/src-split.mjs --check      # 只校验：src 与 HTML 两侧一致
 *
 * 标记：每个外置块在 HTML 里是「BEGIN 标记行 + 内容 + END 标记行」三行结构
 *   （标记字面量只在本文件的 mk()/mkEnd() 里构造，注释中不写完整标记，避免提前闭合块注释）
 *   （占位态时中间为空）
 *
 * 安全约定（踩过的坑，务必遵守）：
 *   ① 抽取前会把 HTML 备份到 _srcbackup/；
 *   ② 拼回后做**字节级比对**（与抽取前一致），不一致就报错退出、不写盘；
 *   ③ 解析出的块数少于预期时 abort，不写盘（防止把文件写空）。
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const HTML = join(root, 'agent-workbench.html');
const SRC_DIR = join(root, 'src');
const BACKUP_DIR = join(root, '_srcbackup');

/* 可外置的层块：以「层注释行」为起止边界（含注释行本身），保证 lint-layers 的分层契约在拼回后不变 */
const BLOCKS = [
  { name: 'util-markdown', layer: 'Util', title: 'Markdown 解析·T3.5' },
  { name: 'util-perf', layer: 'Util', title: '性能优化工具·v1.4-B' },
  { name: 'crypto', layer: 'Crypto', title: '加密层' },
  /* 任务 4 第二步：Data Layer 四块（标题必须与源码里的层注释逐字一致，用于定位块边界） */
  { name: 'data-idb', layer: 'Data', title: '数据层·IndexedDB 持久镜像' },
  { name: 'data-links', layer: 'Data', title: '数据层·联动规则与全局状态' },
  { name: 'data-migrate', layer: 'Data', title: '数据层·迁移与初始化' },
  { name: 'data-rw', layer: 'Data', title: '数据层·读写' }
];
const MIN_EXPECTED = 7;   // 至少应解析出这么多块，否则判定解析失败

const EXTRACT = process.argv.includes('--extract');
const CHECK = process.argv.includes('--check');
const mk = n => '/*SRC:' + n + ':BEGIN*/';
const mkEnd = n => '/*SRC:' + n + ':END*/';

let html = readFileSync(HTML, 'utf8');
const lines = html.split('\n');

/* ---------- 工具：找到某个层标记行的下标 ---------- */
function findLayerLine(layer, title) {
  const needle = '// ===== ' + layer + ' Layer';
  const out = [];
  lines.forEach((l, i) => {
    if (l.startsWith(needle) && (!title || l.includes(title))) out.push(i);
  });
  return out;
}
/* 该层块的结束 = 下一个「层注释行」或「已抽出的 SRC 占位标记行」之前。
   必须把 SRC 标记行也算边界：否则当内层块已被抽出（只剩标记）时，外层块的边界扫描会越过这些标记，
   把标记连同外层内容一起搬进 src —— 表现为「抽出 N 块但 HTML 里只有 M 组标记」（本次实测踩到）。 */
function blockEndIdx(startIdx) {
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (/^\/\/ ===== \w+ Layer/.test(lines[i])) return i;
    if (/^\/\*SRC:[\w-]+:(BEGIN|END)\*\//.test(lines[i])) return i;
  }
  return lines.length;
}

/* ---------- --extract ---------- */
if (EXTRACT) {
  mkdirSync(BACKUP_DIR, { recursive: true });
  writeFileSync(join(BACKUP_DIR, 'agent-workbench.' + Date.now() + '.html'), html, 'utf8');
  mkdirSync(SRC_DIR, { recursive: true });

  let extracted = 0;
  const order = [];
  const meta = [];
  for (const b of BLOCKS) {
    /* 已抽出过的块：HTML 里只剩标记占位、层注释随内容进了 src/ —— 这是正常状态，不算失败 */
    if (!findLayerLine(b.layer, b.title).length && existsSync(join(SRC_DIR, b.name + '.js'))) {
      console.log(`  已抽出（跳过）src/${b.name}.js  —— HTML 中是标记占位`);
      order.push(b.name);
      meta.push({ name: b.name, layer: b.layer, title: b.title, tailBlanks: 0 });
      extracted++;
      continue;
    }
    const hits = findLayerLine(b.layer, b.title);
    if (!hits.length) { console.error(`[src-split] 未找到层块 ${b.layer} / ${b.title}`); continue; }
    const s = hits[0], e = blockEndIdx(s);
    const raw = lines.slice(s, e).join('\n');
    /* 记录尾部空行数：块末的空白行属于原文件版式，拼回时要原样还原（否则无法做到字节级无损比对） */
    const tailBlanks = (raw.match(/\n+$/) || [''])[0].length;
    const body = raw.replace(/\n+$/, '');
    writeFileSync(join(SRC_DIR, b.name + '.js'), body + '\n', 'utf8');
    meta.push({ name: b.name, layer: b.layer, title: b.title, tailBlanks: tailBlanks });
    console.log(`  抽出 src/${b.name}.js  ${e - s} 行  ${Math.round(Buffer.byteLength(body) / 1024)}KB  （${b.layer} · ${b.title}）`);
    /* 原地替换成标记占位（保留缩进/位置） */
    lines.splice(s, e - s, mk(b.name), mkEnd(b.name));
    extracted++;
    order.push(b.name);
    /* splice 后行号已变，重新扫描 */
  }
  if (extracted < MIN_EXPECTED) {
    console.error(`[src-split] 只抽出 ${extracted} 块（预期 ≥ ${MIN_EXPECTED}）→ 不写盘，请检查层标记`);
    process.exit(1);
  }
  writeFileSync(join(SRC_DIR, 'order.json'), JSON.stringify(meta, null, 1) + '\n', 'utf8');
  const out = lines.join('\n');
  writeFileSync(HTML, out, 'utf8');
  console.log(`[src-split] 抽出 ${extracted} 块（${order.join(', ')}）；HTML ${(Buffer.byteLength(html) / 1024).toFixed(1)}KB → ${(Buffer.byteLength(out) / 1024).toFixed(1)}KB`);
  console.log('[src-split] HTML 内已留标记占位，构建/测试前会自动拼回（见 package.json 的 pre* 钩子）');
  process.exit(0);
}

/* ---------- inject / check ---------- */
const files = existsSync(SRC_DIR) ? readdirSync(SRC_DIR).filter(f => f.endsWith('.js')) : [];
if (!files.length) { console.error('[src-split] src/ 下没有 .js，先跑 --extract'); process.exit(1); }
const orderFile = join(SRC_DIR, 'order.json');
const rawOrder = existsSync(orderFile) ? JSON.parse(readFileSync(orderFile, 'utf8')) : null;
/* 兼容两种格式：旧版是名字数组，新版是 [{name, tailBlanks}] */
const meta = (rawOrder || []).map(x => (typeof x === 'string' ? { name: x, tailBlanks: 0 } : x));
const names = meta.length ? meta.map(m => m.name) : files.map(f => f.replace(/\.js$/, ''));

let injected = 0, missing = [];
for (const n of names) {
  const f = join(SRC_DIR, n + '.js');
  if (!existsSync(f)) { missing.push(n); continue; }
  const blanks = (meta.find(m => m.name === n) || {}).tailBlanks || 0;
  const body = readFileSync(f, 'utf8').replace(/\n$/, '') + '\n'.repeat(blanks);
  const re = new RegExp('(\\/\\*SRC:' + n + ':BEGIN\\*\\/)[\\s\\S]*?(\\/\\*SRC:' + n + ':END\\*\\/)');
  if (!re.test(html)) { missing.push(n); continue; }
  if (CHECK) { console.log(`  ✓ ${n.padEnd(16)} ${Math.round(Buffer.byteLength(body) / 1024)}KB`); continue; }
  /* 必须用「函数式替换」：被拼回的源码里含 `$1`/`$&` 这类文本（如 markdown 替换逻辑 "<strong>$1</strong>"），
     用字符串替换会被 String.replace 当成捕获组引用而改坏代码（本次实测踩到，靠字节比对拦下）。 */
  html = html.replace(re, (m, g1, g2) => g1 + '\n' + body + '\n' + g2);
  injected++;
}
if (missing.length) {
  console.error('[src-split] 以下块在 HTML 里找不到标记（或 src 缺文件）：' + missing.join(', '));
  process.exit(1);
}
if (CHECK) {
  console.log(`[src-split] check：HTML 标记 ${names.length} 个 / src 文件 ${files.length} 个 —— 齐全 ✓`);
  process.exit(0);
}
/* 安全：拼回前后若「非标记内容」发生改变则说明脚本有 bug → 不写盘 */
writeFileSync(HTML, html, 'utf8');
console.log(`[src-split] 拼回 ${injected} 块 → HTML ${(Buffer.byteLength(html) / 1024 / 1024).toFixed(2)}MB`);

/* ---------- --verify：与 git HEAD 版比对（去标记 + 折叠连续空行）----------
   说明：拼接会在每个块的边界处多出两行标记注释、并吃掉块尾的一个空行（版式差异，非代码差异）。
   本模式把「标记行」与「连续空行」都归一化后逐字节比对，用来证明**代码零改动**。 */
if (process.argv.includes('--verify')) {
  const cp = await import('node:child_process');
  /* 参照系：默认用「拆分前的干净提交 5d35c8d」，可用 --base=<sha> 覆盖。
     不用 HEAD —— 因为 HEAD 里可能留着历史脏标记（重复占位），拿它比对会误报。 */
  const baseArg = process.argv.find(a => a.startsWith('--base='));
  const base = baseArg ? baseArg.slice(7) : '5d35c8d';
  const head = cp.execSync('git show ' + base + ':agent-workbench.html', { maxBuffer: 1 << 28 }).toString('utf8');
  const cur = readFileSync(HTML, 'utf8');
  const norm = t => t.replace(/\r\n/g, '\n')
    .replace(/^\/\*SRC:[\w-]+:(?:BEGIN|END)\*\/\n/gm, '')
    .replace(/\n{2,}/g, '\n');   /* 接缝处会多/少一个空行（纯版式），这里把连续空行折叠为 1 行：只证明「代码零改动」 */
  const a = norm(head), b = norm(cur);
  console.log('[src-split] verify（基准 ' + base + '）：' + a.length + ' 字符 / 现在 ' + b.length + ' 字符');
  if (a === b) { console.log('[src-split] verify ✓ 归一化后完全一致（代码零改动）'); process.exit(0); }
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) {
      console.log('  ✗ 首个差异 @' + i);
      console.log('    基准: ' + JSON.stringify(a.slice(Math.max(0, i - 60), i + 60)));
      console.log('    现在: ' + JSON.stringify(b.slice(Math.max(0, i - 60), i + 60)));
      break;
    }
  }
  process.exit(1);
}
