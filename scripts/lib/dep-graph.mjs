#!/usr/bin/env node
/**
 * dep-graph.mjs —— 分层源块的依赖分析（纯函数，不写盘）
 * --------------------------------------------------
 * 从 module-graph.mjs 抽出「分析」部分，供两处复用：
 *   · scripts/module-graph.mjs —— 生成 docs/module-graph.md 与基线（写盘）
 *   · scripts/lint-layers.mjs —— CI 门禁的方向校验（只读，不写盘）
 *
 * 为什么必须共用这一份：两个门禁若各算各的，判定口径会静默漂移
 * （同一个仓库同时出现「这里绿、那里红」，比没有门禁更糟）。
 * 判定的正确性由 tests/ 里的单元测试 + 与 module-graph.baseline.json 的一致性断言共同兜住。
 *
 * v3.7.70：lint-layers 此前名为「分层契约校验」却**零依赖方向校验**（只查结构配对/层存在），
 * 属「看起来在守护 ≠ 真的在守护」。本文件让它名副其实。
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripCommentsAndStrings } from './code-scan.mjs';

const _root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const SRC = join(_root, 'src');
export const ORDER_FILE = join(SRC, 'order.json');

/** 关键字/内置名：避免把语言关键字当引用 */
const KEYWORDS = new Set(('break case catch class const continue debugger default delete do else export extends finally for function if import in instanceof let new return super switch this throw try typeof var void while with yield async await of from as static get set true false null undefined void 0 arguments'.split(' ')));

export const DEFAULT_SHARED_FANOUT = 8;

/** 某下标处的花括号深度（输入应为已 strip 的代码） */
function depthAt(code, idx) {
  let d = 0;
  for (let i = 0; i < idx; i++) {
    const c = code[i];
    if (c === '{') d++;
    else if (c === '}') d--;
  }
  return d;
}

/** 抽顶层定义：只看花括号深度为 0 的 function/const/let/var/class */
function topLevelDefs(code) {
  const out = new Set();
  const re = /^(?:function\s+([A-Za-z_$][\w$]*)|(?:const|let|var)\s+([A-Za-z_$][\w$]*)|class\s+([A-Za-z_$][\w$]*))/gm;
  for (const m of code.matchAll(re)) {
    if (depthAt(code, m.index) === 0) out.add(m[1] || m[2] || m[3]);
  }
  return out;
}

/** 抽引用标识符：排除对象字面量键名与成员访问属性名 */
function identifiers(code) {
  const out = new Set();
  const re = /[A-Za-z_$][\w$]*/g;
  let m;
  while ((m = re.exec(code))) {
    const id = m[0];
    if (KEYWORDS.has(id)) continue;
    const after = code.slice(m.index + id.length, m.index + id.length + 8);
    let k = m.index - 1;
    while (k >= 0 && /\s/.test(code[k])) k--;
    const prevCh = k >= 0 ? code[k] : '';
    if (prevCh === '.' || (prevCh === '?' && code[k - 1] === '.')) continue;
    if (/^\s*:(?!:)/.test(after) && (prevCh === '{' || prevCh === ',')) continue;
    out.add(id);
  }
  return out;
}

/** 读 src/ 下按 order.json 排序的块 */
export function loadBlocks() {
  const order = JSON.parse(readFileSync(ORDER_FILE, 'utf8'));
  return order.map((o, idx) => {
    const file = join(SRC, o.name + '.js');
    return { ...o, idx, file, code: existsSync(file) ? readFileSync(file, 'utf8') : '' };
  });
}

/**
 * 依赖分析主入口。
 * @param {Array} blocks loadBlocks() 的结果
 * @param {{sharedFanout?:number}} [opts]
 * @returns {{duplicates:string[], cycles:string[], upward:string[], shared:string[], edges:Array, blockCount:number}}
 *   字符串格式与 module-graph.baseline.json 完全一致，便于直接比对。
 */
export function analyze(blocks, opts = {}) {
  const SHARED_FANOUT = opts.sharedFanout ?? DEFAULT_SHARED_FANOUT;

  for (const b of blocks) {
    const code = stripCommentsAndStrings(b.code);
    b.defs = topLevelDefs(code);
    b.refs = identifiers(code);
  }

  /* 重复定义 */
  const defOwners = new Map();
  for (const b of blocks) for (const d of b.defs) {
    if (!defOwners.has(d)) defOwners.set(d, []);
    defOwners.get(d).push(b.name);
  }
  const duplicates = [...defOwners.entries()].filter(([, owners]) => owners.length > 1);

  /* 高扇出「共享符号」（t / el / render / toast …）：不计入依赖边，
     否则几乎每个块都连到定义它的块上，图被噪声淹没。 */
  const fanout = new Map();
  for (const b of blocks) {
    for (const r of b.refs) {
      const owners = defOwners.get(r);
      if (!owners || owners.length !== 1 || owners[0] === b.name) continue;
      if (!fanout.has(r)) fanout.set(r, new Set());
      fanout.get(r).add(b.name);
    }
  }
  const shared = [...fanout.entries()]
    .filter(([, users]) => users.size >= SHARED_FANOUT)
    .sort((a, b) => b[1].size - a[1].size)
    .map(([sym]) => sym);

  /* 跨块边 */
  const edges = new Map();
  for (const b of blocks) {
    for (const r of b.refs) {
      const owners = defOwners.get(r);
      if (!owners || owners.length !== 1) continue;
      const owner = owners[0];
      if (owner === b.name) continue;
      if (fanout.get(r) && fanout.get(r).size >= SHARED_FANOUT) continue;
      const key = b.name + '>' + owner;
      if (!edges.has(key)) edges.set(key, new Set());
      edges.get(key).add(r);
    }
  }

  /* 循环依赖（DFS 找环，按块名归一，避免同一环的多个起点重复计数） */
  const depOf = new Map();
  for (const [key] of edges) {
    const [a, o] = key.split('>');
    if (!depOf.has(a)) depOf.set(a, new Set());
    depOf.get(a).add(o);
  }
  const idxOf = new Map(blocks.map(b => [b.name, b.idx]));
  /* 循环记录格式必须与 module-graph.mjs 逐字一致（`a → b → a`，含闭合回起点），
     否则与 module-graph.baseline.json 的比对会全量误报——基线里存的就是这种串。 */
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

  /* 逆层依赖：早序块用晚序块定义的符号 → 架构倒挂 */
  const upward = [];
  for (const [key, syms] of edges) {
    const [a, o] = key.split('>');
    if (idxOf.get(o) > idxOf.get(a)) {
      upward.push({
        from: a, to: o,
        layerFrom: blocks[idxOf.get(a)].layer,
        layerTo: blocks[idxOf.get(o)].layer,
        symbols: [...syms].sort(),
      });
    }
  }
  upward.sort((x, y) => (x.from + x.to).localeCompare(y.from + y.to));

  return {
    blockCount: blocks.length,
    duplicates: duplicates.map(([n, owners]) => n + ' @ ' + owners.slice().sort().join(',')).sort(),
    cycles: [...new Set(cycles)].sort(),
    upward: upward.map(u => u.from + '>' + u.to).sort(),
    upwardDetail: upward,
    shared,
    edges: [...edges.entries()].map(([k, syms]) => ({ key: k, symbols: [...syms].sort() })),
  };
}
