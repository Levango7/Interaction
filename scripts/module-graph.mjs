#!/usr/bin/env node
/**
 * module-graph.mjs — 分层源块的「符号级依赖图」分析与静态校验
 * --------------------------------------------------
 * 背景：交付物是经典 <script> 单文件（不能用 ESM import）。因此"模块化"的落点不是 import/export，
 *   而是**可验证的边界**：把 26 个 src 块的真实依赖关系（谁用了谁定义的符号）算出来，并校验：
 *     ① 跨块重复定义（同名符号在多个块里定义 → 拼回后后者覆盖前者，是真实 bug 温床）
 *     ② 循环依赖（A 用 B 的符号、B 又用 A 的 → 无法单独理解任何一个）
 *     ③ 逆层依赖（文件序靠前的低层块，用了靠后高层块定义的符号 → 架构倒挂）
 *   ③ 这类通常不是"错误"而是"耦合气味"，数量可能不少，故采用**基线**策略：
 *     基线内的既有项只报告、不失败；**新增**的逆层依赖/循环/重复定义才让 CI 失败。
 *
 * 用法：
 *   node scripts/module-graph.mjs            # 分析 + 写 docs/module-graph.md + 更新基线（--freeze 时才写基线）
 *   node scripts/module-graph.mjs --check    # 只校验：对照基线，出现新增问题则 exit 1
 *   node scripts/module-graph.mjs --freeze   # 接受当前状态为新基线（人工确认后用）
 *
 * 解析口径（与项目的分层契约一致）：
 *   · 块 = src/<name>.js，层与顺序取自 src/order.json（其顺序 = 文件中的出现顺序 = 层序）
 *   · 定义 = 顶格书写的 function / const / let / var / class 名字（块内嵌套定义不计）
 *   · 引用 = 块内出现的标识符中，恰好被**另一个块**定义的那些 → 形成一条边
 *     若某标识符被多个块定义 → 记入「重复定义」，不计边（避免歧义）
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(root, 'src');
const ORDER_FILE = join(SRC, 'order.json');
const DOC = join(root, 'docs', 'module-graph.md');
const BASELINE = join(root, 'scripts', 'module-graph.baseline.json');

const CHECK = process.argv.includes('--check');
const FREEZE = process.argv.includes('--freeze');

const order = JSON.parse(readFileSync(ORDER_FILE, 'utf8'));
const blocks = order.map((o, idx) => {
  const file = join(SRC, o.name + '.js');
  return { ...o, idx, file, code: existsSync(file) ? readFileSync(file, 'utf8') : '' };
});

/* ---------- 关键字/内置名（避免把语言关键字当引用） ---------- */
const KEYWORDS = new Set(('break case catch class const continue debugger default delete do else export extends finally for function if import in instanceof let new return super switch this throw try typeof var void while with yield async await of from as static get set true false null undefined void 0 arguments'.split(' ')));

/* ---------- 去注释与字符串字面量 ----------
   必须先剥掉再抽标识符：这些块里注释/文案大量提到别的函数名（如 "见 renderOverview"、t("chain.reset")），
   不剥会把它们当成真实引用 → 图里出现大量假边与假环（实测：不加这步会报 122 条环，加完降到个位数）。 */
function stripCommentsAndStrings(text) {
  let out = '';
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i], d = text[i + 1];
    if (c === '/' && d === '/') { while (i < n && text[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') { i += 2; while (i < n && !(text[i] === '*' && text[i + 1] === '/')) i++; i += 2; continue; }
    if (c === '"' || c === "'" || c === '`') {
      const q = c; i++; out += ' ';
      while (i < n && text[i] !== q) {
        if (text[i] === '\\') { i += 2; continue; }
        if (q === '`' && text[i] === '$' && text[i + 1] === '{') {
          /* 模板字符串里的 ${...} 是真实表达式 → 保留其内容 */
          let depth = 1; i += 2;
          while (i < n && depth > 0) {
            if (text[i] === '{') depth++;
            else if (text[i] === '}') { depth--; if (!depth) { i++; break; } }
            out += text[i]; i++;
          }
          continue;
        }
        i++;
      }
      i++; continue;
    }
    out += c; i++;
  }
  return out;
}
/* ---------- 抽顶层定义 ---------- */
function topLevelDefs(code) {
  const out = new Set();
  const re = /^(?:function\s+([A-Za-z_$][\w$]*)|(?:const|let|var)\s+([A-Za-z_$][\w$]*)|class\s+([A-Za-z_$][\w$]*))/gm;
  /* 只看**花括号深度为 0** 的定义：函数体内若把语句顶格写（作者习惯），
     只按 ^ 锚点会把 rec/arr 这类局部变量误判成"顶层定义"（实测踩到），
     进而把它们的引用算成跨块依赖，污染依赖图。 */
  for (const m of code.matchAll(re)) {
    const depth = depthAt(code, m.index);
    if (depth === 0) out.add(m[1] || m[2] || m[3]);
  }
  return out;
}
/* 计算某个下标处的花括号深度（忽略注释与字符串，输入应为已 strip 的代码） */
function depthAt(code, idx) {
  let d = 0;
  for (let i = 0; i < idx; i++) {
    const c = code[i];
    if (c === '{') d++;
    else if (c === '}') d--;
  }
  return d;
}
/* ---------- 抽引用（剥注释/字符串后的标识符） ---------- */
function identifiers(code) {
  const out = new Set();
  const re = /[A-Za-z_$][\w$]*/g;
  let m;
  while ((m = re.exec(code))) {
    const id = m[0];
    if (KEYWORDS.has(id)) continue;
    const after = code.slice(m.index + id.length, m.index + id.length + 8);
    /* 视为「对象字面量键名」的条件：后面紧跟冒号（非 `::`），且前面最近的非空字符是 `{` 或 `,`。
       实测踩到：core 里声明 AppBridge 的键 `openDrawer: () => {}` 被算成"core 引用了 ui-drawer 的 openDrawer"，
       凭空造出 core→UI 出边与 core↔ui-drawer 假环（循环 49→57、core 出边 0→2）。
       加"前一个非空字符"这一条是为了不误伤三元表达式 `cond ? a : b`（那里 a 前面是 `?` 或空白，不是 `{`/`,`）。 */
    let k = m.index - 1;
    while (k >= 0 && /\s/.test(code[k])) k--;
    const prevCh = k >= 0 ? code[k] : '';
    /* 成员访问不算变量引用：`AppBridge.addToRecycleBin(...)` 里的 addToRecycleBin 是属性名，
       不应算作"Data 层引用了 Render 层的 addToRecycleBin"（实测踩到，会让 S2 的成果看起来没生效）。 */
    if (prevCh === '.' || (prevCh === '?' && code[k - 1] === '.')) continue;
    if (/^\s*:(?!:)/.test(after) && (prevCh === '{' || prevCh === ',')) continue;
    out.add(id);
  }
  return out;
}

for (const b of blocks) {
  const code = stripCommentsAndStrings(b.code);   // 定义与引用都基于「剥掉注释/字符串」的代码
  b.defs = topLevelDefs(code);
  b.refs = identifiers(code);
}

/* ---------- 重复定义 ---------- */
const defOwners = new Map();   // name -> [blockName...]
for (const b of blocks) for (const d of b.defs) {
  if (!defOwners.has(d)) defOwners.set(d, []);
  defOwners.get(d).push(b.name);
}
const duplicates = [...defOwners.entries()].filter(([, owners]) => owners.length > 1);

/* ---------- 高扇出符号：被很多块共用的"全局助手"（t / el / render / toast …）
   它们会把几乎每个块都连到定义它的那个块上 → 图被噪声淹没（实测：不排除时 26 块报出 83 条环）。
   处理：扇出 ≥ SHARED_FANOUT 的符号单独归类为「共享符号」，不计入依赖边；在报告里单列，
   它们恰恰是「架构倒挂」的元凶，值得单独观察。 ---------- */
/* 可用 --fanout=N 覆盖：阈值越小越保守（把更多符号当"共享"排除）。默认 8 用于门禁，
   想观察"把全局助手抽到 core 之后"的结构收益，可用更大的阈值（如 --fanout=20）。 */
const _fArg = process.argv.find(a => a.startsWith("--fanout="));
const SHARED_FANOUT = _fArg ? Math.max(1, parseInt(_fArg.slice(9), 10) || 8) : 8;
const fanout = new Map();   // symbol -> Set(使用它的块名)
for (const b of blocks) {
  for (const r of b.refs) {
    const owners = defOwners.get(r);
    if (!owners || owners.length !== 1 || owners[0] === b.name) continue;
    if (!fanout.has(r)) fanout.set(r, new Set());
    fanout.get(r).add(b.name);
  }
}
const shared = [...fanout.entries()].filter(([, users]) => users.size >= SHARED_FANOUT)
  .sort((a, b) => b[1].size - a[1].size);

/* ---------- 跨块边 ---------- */
const edges = new Map();       // "a>b" -> Set(symbol)
for (const b of blocks) {
  for (const r of b.refs) {
    const owners = defOwners.get(r);
    if (!owners || owners.length !== 1) continue;      // 未定义/多处定义 → 不计边
    const owner = owners[0];
    if (owner === b.name) continue;                    // 自引用不计
    if (fanout.get(r) && fanout.get(r).size >= SHARED_FANOUT) continue;   // 全局助手 → 不计边
    const key = b.name + '>' + owner;
    if (!edges.has(key)) edges.set(key, new Set());
    edges.get(key).add(r);
  }
}
const depOf = new Map();       // blockName -> Set(ownerName)
for (const b of blocks) depOf.set(b.name, new Set());
for (const key of edges.keys()) {
  const [a, o] = key.split('>');
  depOf.get(a).add(o);
}

/* ---------- 循环依赖（DFS） ---------- */
const cycles = [];
{
  const state = new Map();     // 0=未访问 1=在栈 2=完成
  const stack = [];
  const visit = (name) => {
    state.set(name, 1); stack.push(name);
    for (const next of depOf.get(name) || []) {
      if (state.get(next) === 1) {
        const i = stack.indexOf(next);
        cycles.push(stack.slice(i).concat(next).join(' → '));
      } else if (!state.get(next)) visit(next);
    }
    stack.pop(); state.set(name, 2);
  };
  for (const b of blocks) if (!state.get(b.name)) visit(b.name);
}

/* ---------- 逆层依赖（早序块用晚序块定义的符号） ---------- */
const idxOf = new Map(blocks.map(b => [b.name, b.idx]));
const upward = [];
for (const [key, syms] of edges) {
  const [a, o] = key.split('>');
  if (idxOf.get(o) > idxOf.get(a)) upward.push({ from: a, to: o, layerFrom: blocks[idxOf.get(a)].layer, layerTo: blocks[idxOf.get(o)].layer, symbols: [...syms].sort() });
}
upward.sort((x, y) => (x.from + x.to).localeCompare(y.from + y.to));

/* ---------- 基线对比 ---------- */
const current = {
  duplicates: duplicates.map(([n, owners]) => n + ' @ ' + owners.slice().sort().join(',')).sort(),
  cycles: [...new Set(cycles)].sort(),
  upward: upward.map(u => u.from + '>' + u.to).sort(),
};
const base = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : { duplicates: [], cycles: [], upward: [] };
const added = {
  duplicates: current.duplicates.filter(x => !base.duplicates.includes(x)),
  cycles: current.cycles.filter(x => !base.cycles.includes(x)),
  upward: current.upward.filter(x => !base.upward.includes(x)),
};

/* ---------- 报告 ---------- */
const lines = [];
lines.push('# 分层源块依赖图（自动生成，勿手改）');
lines.push('');
lines.push('> 由 `scripts/module-graph.mjs` 从 `src/*.js` 的**符号级引用**分析得出：');
lines.push('> 定义 = 块内顶格书写的 function/const/let/var/class；依赖 = 某块引用了恰好由另一块定义的符号。');
lines.push('> 块数 ' + blocks.length + '（本文件由脚本生成；不含时间戳，避免每日无意义 diff）');
lines.push('');
lines.push('## 1. 依赖矩阵（行依赖列）');
lines.push('');
lines.push('| 块 \\ 依赖 | 层 | 依赖的块 | 依赖符号数 |');
lines.push('|---|---|---|---|');
for (const b of blocks) {
  const deps = [...(depOf.get(b.name) || [])].sort();
  const symCount = deps.reduce((n, d) => n + (edges.get(b.name + '>' + d)?.size || 0), 0);
  lines.push(`| \`${b.name}\` | ${b.layer} | ${deps.length ? deps.map(d => '`' + d + '`').join(' ') : '—'} | ${symCount} |`);
}
lines.push('');
lines.push('## 2. 共享符号（扇出 ≥ ' + SHARED_FANOUT + ' 个块，不计入依赖边）');
lines.push('');
if (shared.length) {
  lines.push('| 符号 | 定义于 | 被多少块使用 |');
  lines.push('|---|---|---|');
  for (const [sym, users] of shared.slice(0, 20)) {
    lines.push(`| \`${sym}\` | \`${(defOwners.get(sym) || ['?'])[0]}\` | ${users.size} |`);
  }
  lines.push('');
  lines.push('> 这些是事实上的"全局助手"。层间倒挂多由它们造成，若要继续解耦，优先从这里动手。');
} else lines.push('（无）');
lines.push('');
lines.push('### Core 层出边（必须为 0 —— 核心层零外部依赖）');
lines.push('');
const coreBlock = blocks.find(b => b.layer === 'Core');
const coreDeps = coreBlock ? [...(depOf.get(coreBlock.name) || [])] : [];
lines.push(coreDeps.length ? ('✗ core 依赖了：' + coreDeps.map(d => '`' + d + '`').join(' ') + '（共 ' + coreDeps.length + ' 个块）—— 见 docs/decoupling-plan.md 的 S0') : '✓ core 无外部依赖');
lines.push('');
lines.push('## 3. 校验结果');
lines.push('');
lines.push(`- 跨块重复定义：**${duplicates.length}** 项${duplicates.length ? '（' + duplicates.map(([n, o]) => n + ' → ' + o.join('/')).join('；') + '）' : ''}`);
lines.push(`- 循环依赖：**${new Set(cycles).size}** 条${cycles.length ? '（' + [...new Set(cycles)].slice(0, 5).join('；') + '）' : ''}`);
lines.push(`- 逆层依赖（低层用高层符号）：**${upward.length}** 条（按「块对」计）`);
/* 符号级计数：同一条块对边可能由多个符号造成，且解耦往往一次只消掉其中一个符号
   （实测：S2b 把 render 改走桥接后，data-links→render-entry 这条边因 setActive 等符号仍在，条数不变，
   但逆层**符号**确实少了）→ 两个口径都给出，才看得出逐步解耦的真实进展。 */
lines.push(`- 逆层依赖（按**符号**计，去重）：**${new Set(upward.flatMap(u => u.symbols)).size}** 个符号`);
lines.push('');
if (upward.length) {
  lines.push('| 从（层） | 到（层） | 涉及符号 |');
  lines.push('|---|---|---|');
  for (const u of upward) lines.push(`| \`${u.from}\`（${u.layerFrom}） | \`${u.to}\`（${u.layerTo}） | ${u.symbols.slice(0, 6).map(s => '`' + s + '`').join(' ')}${u.symbols.length > 6 ? ' …' : ''} |`);
  lines.push('');
  lines.push('> 逆层依赖多为"低层回调/工具被高层注入"的历史耦合，不必然错误；基线策略只拦**新增**项。');
}
writeFileSync(DOC, lines.join('\n') + '\n', 'utf8');

if (FREEZE) {
  writeFileSync(BASELINE, JSON.stringify(current, null, 2) + '\n', 'utf8');
  console.log('[module-graph] 已冻结基线与 docs/module-graph.md');
  process.exit(0);
}

console.log(`[module-graph] 块 ${blocks.length} · 重复定义 ${duplicates.length} · 循环 ${new Set(cycles).size} · 逆层 ${upward.length}`);
if (CHECK) {
  const total = added.duplicates.length + added.cycles.length + added.upward.length;
  if (added.duplicates.length) { console.log('  ✗ 新增重复定义：'); added.duplicates.forEach(x => console.log('     ' + x)); }
  if (added.cycles.length) { console.log('  ✗ 新增循环依赖：'); added.cycles.forEach(x => console.log('     ' + x)); }
  if (added.upward.length) { console.log('  ✗ 新增逆层依赖：'); added.upward.forEach(x => console.log('     ' + x)); }
  console.log(total ? `[module-graph] check ✗ 新增 ${total} 项（如确为有意，跑 --freeze 更新基线）` : '[module-graph] check ✓ 无新增问题');
  process.exit(total ? 1 : 0);
}
console.log('[module-graph] 已写 docs/module-graph.md（基线未更新，需 --freeze 才写入）');
