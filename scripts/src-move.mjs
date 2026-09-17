#!/usr/bin/env node
/**
 * src-move.mjs — 分层源块的「安全搬迁 / 调用点改写」工具（把 S1~S4 的经验固化成一条命令）
 * ---------------------------------------------------------------------------
 * 为什么需要它：本仓库把层块放在 src/*.js，搬迁符号时要同时保证
 *   ① 依赖闭包完整（人工清单必然漏 —— S1 实测漏了 _sqlJsBases 等 3 个符号，搬到一半失败）
 *   ② 定义不丢失（"纯搬迁不变量"：搬迁前后顶层定义全集必须一致，否则就是改了行为）
 *   ③ 改写不越界（只改真实调用点；注释/字符串里的同名文本不能碰 —— S2b 曾因此把 app 改坏）
 * 这三件事在 S1~S4 里各踩过一次坑，本工具把它们做成默认行为。
 *
 * 用法（**默认 dry-run**，必须显式 --apply 才落盘）：
 *   node scripts/src-move.mjs --jobs=jobs.json            # 预演：打印闭包、行数、改写计数
 *   node scripts/src-move.mjs --jobs=jobs.json --apply    # 执行 + 自动做定义不变量校验
 *
 * jobs.json 格式：
 * {
 *   "move": [
 *     { "roots": ["SCENE_FEATURES"], "from": "ui-theme", "to": "core", "note": "……" }
 *   ],
 *   "rewrite": [
 *     { "block": "data-rw", "symbol": "completeTask", "to": "AppBridge.completeTask(", "expect": 2 }
 *   ]
 * }
 *
 * 说明
 *  · move：自动计算依赖闭包（同块内被引用且同块定义的符号一并搬），并连"紧邻其上的文档注释"一起搬
 *  · rewrite：**按行粒度**在原文上替换（剥离只用于判定哪些行含真实调用），并校验每行只替换 1 处 + 总数符合预期
 *  · 落盘后自动校验「定义全集不变」，不一致则直接报错（此时请 git checkout 还原）
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(root, 'src');
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const jobsArg = args.find(a => a.startsWith('--jobs='));
if (!jobsArg) { console.error('用法：node scripts/src-move.mjs --jobs=<jobs.json> [--apply]'); process.exit(2); }
const jobs = JSON.parse(readFileSync(jobsArg.slice(7), 'utf8'));

/* ---------- 工具函数 ---------- */
function stripKeep(t) {                      // 剥注释/字符串，**保留换行**（用于按行判定）
  let out = '', i = 0, n = t.length;
  while (i < n) {
    const c = t[i], d = t[i + 1];
    if (c === '/' && d === '/') { while (i < n && t[i] !== '\n') { out += ' '; i++; } continue; }
    if (c === '/' && d === '*') { out += '  '; i += 2; while (i < n && !(t[i] === '*' && t[i + 1] === '/')) { out += (t[i] === '\n' ? '\n' : ' '); i++; } out += '  '; i += 2; continue; }
    if (c === '"' || c === "'" || c === '`') { const q = c; out += ' '; i++; while (i < n && t[i] !== q) { if (t[i] === '\\') { out += '  '; i += 2; } else { out += (t[i] === '\n' ? '\n' : ' '); i++; } } out += ' '; i++; continue; }
    out += c; i++;
  }
  return out;
}
const strip = t => stripKeep(t);
const readLines = b => readFileSync(join(SRC, b + '.js'), 'utf8').split('\n');
const writeLines = (b, L) => writeFileSync(join(SRC, b + '.js'), L.join('\n'), 'utf8');
const DEF_RE = /^(?:async\s+)?(?:function\s+([A-Za-z_$][\w$]*)|(?:const|let|var)\s+([A-Za-z_$][\w$]*)|class\s+([A-Za-z_$][\w$]*))/gm;

function topDefs(text) {
  const out = new Set();
  for (const m of strip(text).matchAll(DEF_RE)) out.add(m[1] || m[2] || m[3]);
  return out;
}
/* 语句区间（含紧邻文档注释）；单行声明直接落在本行 —— 这里曾因"无花括号导致配平永不闭合"踩坑 */
function span(L, sym) {
  const re = new RegExp('^(?:async\\s+)?(?:function\\s+' + sym + '\\b|(?:const|let|var)\\s+' + sym + '\\b)');
  const s = L.findIndex(l => re.test(l));
  if (s < 0) return null;
  let d = 0;
  for (const ch of L[s].replace(/\/\/.*$/, '')) { if ('{[('.includes(ch)) d++; else if ('}])'.includes(ch)) d--; }
  let e = s;
  if (d !== 0) {
    d = 0; let st = false;
    for (let i = s; i < L.length; i++) {
      for (const ch of L[i]) { if ('{[('.includes(ch)) { d++; st = true; } else if ('}])'.includes(ch)) d--; }
      if (st && d <= 0) { e = i; break; }
    }
  }
  let top = s, j = s - 1;
  while (j >= 0 && L[j].trim() === '') j--;
  if (j >= 0 && L[j].trim().endsWith('*/')) { let k = j; while (k >= 0 && !L[k].trim().startsWith('/*')) k--; if (k >= 0) top = k; }
  return { top, end: e };
}
/* 依赖闭包：roots 同块内被引用且同块定义的符号全部纳入 */
function closure(L, roots) {
  const defs = new Set();
  for (const m of strip(L.join('\n')).matchAll(DEF_RE)) defs.add(m[1] || m[2] || m[3]);
  const out = new Set(roots), q = [...roots];
  while (q.length) {
    const sym = q.pop();
    const sp = span(L, sym);
    if (!sp) continue;
    const used = new Set(strip(L.slice(sp.top, sp.end + 1).join('\n')).match(/[A-Za-z_$][\w$]*/g) || []);
    for (const u of used) if (defs.has(u) && !out.has(u) && u !== sym) { out.add(u); q.push(u); }
  }
  return [...out];
}

/* ---------- 预演 ---------- */
const blocks = readdirSync(SRC).filter(f => f.endsWith('.js')).map(f => f.replace(/\.js$/, ''));
const beforeDefs = new Map();
for (const b of blocks) for (const d of topDefs(readFileSync(join(SRC, b + '.js'), 'utf8'))) beforeDefs.set(d, b);

console.log('=== 预演（dry-run）===');
/* 跨块依赖表：用于判断"搬到目标层后，闭包里的符号会不会引用更晚的块"（那等于把倒挂换个方向） */
const ownerAll = new Map();
for (const b of blocks) for (const d of topDefs(readFileSync(join(SRC, b + '.js'), 'utf8'))) ownerAll.set(d, b);
const movePlan = [];
for (const mv of jobs.move || []) {
  const L = readLines(mv.from);
  const syms = closure(L, mv.roots);
  let lines = 0;
  const cross = new Map();
  syms.forEach(s => {
    const sp = span(L, s);
    if (!sp) return;
    lines += sp.end - sp.top + 1;
    const used = new Set(strip(L.slice(sp.top, sp.end + 1).join('\n')).match(/[A-Za-z_$][\w$]*/g) || []);
    for (const u of used) if (ownerAll.has(u) && ownerAll.get(u) !== mv.from && !syms.includes(u)) cross.set(u, ownerAll.get(u));
  });
  console.log('  move  ' + mv.from.padEnd(18) + '→ ' + mv.to.padEnd(12) + ' 闭包 ' + syms.length + ' 个 / 约 ' + lines + ' 行');
  console.log('        [' + syms.join(', ') + ']');
  if (cross.size) {
    console.log('        ⚠️ 跨块依赖（搬走后这些引用方向会变）：' + [...cross.entries()].map(([k, v]) => k + '(' + v + ')').join(', '));
    console.log('        → 请确认目标层位置合适：若这些块**排在目标块之后**，搬过去等于把倒挂换个方向');
  }
  movePlan.push({ ...mv, syms });
}
const rewritePlan = [];
for (const rw of jobs.rewrite || []) {
  const raw = readFileSync(join(SRC, rw.block + '.js'), 'utf8');
  const rawL = raw.split('\n'), skL = stripKeep(raw).split('\n');
  const re = new RegExp('(^|[^\\w$.])' + rw.symbol + '\\s*\\(');
  const lineNos = [];
  skL.forEach((l, i) => { if (re.test(l)) lineNos.push(i + 1); });
  const ok = lineNos.length === rw.expect;
  console.log('  ' + (ok ? '✓' : '✗') + ' rewrite ' + rw.block.padEnd(16) + rw.symbol.padEnd(16) + lineNos.length + ' 行（期望 ' + rw.expect + '）→ L' + lineNos.join(',L'));
  if (!ok) { console.error('\n✗ 改写计数不符 → 不落盘'); process.exit(1); }
  rewritePlan.push({ ...rw, lineNos, rawL, re });
}
if (!movePlan.length && !rewritePlan.length) { console.log('  （无任务）'); }

if (!APPLY) { console.log('\n预演结束。加 --apply 才会落盘。'); process.exit(0); }

/* ---------- 落盘 ---------- */
console.log('\n=== 执行 ===');
for (const p of movePlan) {
  const L = readLines(p.from);
  const parts = [];
  for (const s of p.syms) {
    const sp = span(L, s);
    if (!sp) { console.log('    （跳过 ' + s + '：已不在本块）'); continue; }
    parts.push({ s, text: L.slice(sp.top, sp.end + 1).join('\n'), decl: !/^(?:async\s+)?function |^class /.test(L[sp.top]) });
  }
  const spans = parts.map(x => { const L2 = readLines(p.from); const sp = span(L2, x.s); return { top: sp.top, end: sp.end }; }).sort((a, b) => b.top - a.top);
  for (const sp of spans) { const after = L[sp.end + 1] === '' ? sp.end + 2 : sp.end + 1; L.splice(sp.top, after - sp.top); }
  writeLines(p.from, L);
  const body = [p.note || '', parts.filter(x => x.decl).map(x => x.text).join('\n\n'), parts.filter(x => !x.decl).map(x => x.text).join('\n\n')].filter(Boolean).join('\n\n');
  const T = readLines(p.to);
  writeFileSync(join(SRC, p.to + '.js'), T.join('\n').replace(/\n+$/, '\n') + '\n' + body + '\n', 'utf8');
  console.log('  move  ' + p.from + ' → ' + p.to + '：' + parts.length + ' 个符号 ✓');
}
for (const x of rewritePlan) {
  let n = 0;
  for (const no of x.lineNos) {
    const before = x.rawL[no - 1];
    const after = before.replace(typeof x.re === 'string' ? x.re : new RegExp('(^|[^\\w$.])' + x.symbol + '\\s*\\('), '$1' + x.to);
    if (after === before) { console.error('  ✗ L' + no + ' 替换未生效，请 git checkout 还原后检查'); process.exit(1); }
    x.rawL[no - 1] = after; n++;
  }
  writeFileSync(join(SRC, x.block + '.js'), x.rawL.join('\n'), 'utf8');
  console.log('  rewrite ' + x.block + '：' + n + ' 行 ' + x.symbol + ' → ' + x.to);
}

/* ---------- 落盘后：定义不变量 ---------- */
const afterDefs = new Map();
for (const b of blocks) { const p = join(SRC, b + '.js'); if (existsSync(p)) for (const d of topDefs(readFileSync(p, 'utf8'))) afterDefs.set(d, b); }
const missing = [...beforeDefs.keys()].filter(d => !afterDefs.has(d));
const moved = [...afterDefs.keys()].filter(d => beforeDefs.has(d) && beforeDefs.get(d) !== afterDefs.get(d));
console.log('\n=== 定义不变量 ===');
console.log('  前 ' + beforeDefs.size + ' / 后 ' + afterDefs.size + ' 个定义');
moved.forEach(d => console.log('    移位 ' + d.padEnd(22) + beforeDefs.get(d) + ' → ' + afterDefs.get(d)));
if (missing.length) { console.error('  ✗ 丢失定义：' + missing.join(', ') + '  → 请 git checkout 还原'); process.exit(1); }
console.log('  ✅ 无丢失');
console.log('\n别忘了：node scripts/src-split.mjs && node scripts/pet-art.mjs 拼回，再跑本地测试');
