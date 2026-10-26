/**
 * false-receipt.mjs —— 「假回执」判定层（R-37，2026-10-27 新增）
 * ----------------------------------------------------------------------------
 * 缺陷原型（台账 R-34，v3.7.147 修掉第一处）：
 *     try{ navigator.clipboard.writeText(x); toast("已复制", "ok"); }catch(_){}
 *   `writeText` 返回 Promise，**同步 try/catch 抓不到 rejection**；toast 在 promise 落地之前
 *   就弹了。结果是：浏览器拒绝写剪贴板时，用户照样看到「已复制」——**回执与事实相反**。
 *   这类缺陷浏览器不报错、控制台干净，只能靠构建期静态扫描发现。
 *
 * 本层只做判定（可单测），CLI 在 scripts/lint-false-receipt.mjs。
 *
 * 判定两种形态：
 *   ① **丢弃**（discard）：白名单 API 的调用结果没人接 —— 没 await、没赋值、没 .then/.catch。
 *   ② **吞掉**（swallow）：接了但两个处理器都是空函数 `.then(function(){}, function(){})`，
 *      成败一律不区分 —— 等价于丢弃，而且更隐蔽（外面看着"处理过了"）。
 *
 * 分级（只在"有回执"时升 P0，避免把无害的 fire-and-forget 判成阻断项）：
 *   P0 假回执 —— 结果被丢弃/吞掉，且**同一区域内之后出现了成功回执**
 *                （toast 且非 warn/error，或 `<标志> = true`）。失败也会报成功 = 与事实相反。
 *   P1 未接住 —— 结果被丢弃/吞掉，但后面没有成功回执（只是 rejection 无人处理）。
 *
 * 已知上限（别以为抓到就是全部）：
 *   · 只认白名单里的 Promise API（见 PROMISE_APIS），`fetch` 之类未列入（噪声远大于收益）；
 *   · 「成功回执」靠 toast 文案里有没有 warn/error 级别判断 —— 自定义函数里的回执看不见；
 *   · 跨函数/跨文件的间接调用看不见（先把 API 赋值给别名再调，静态不可判）。
 */
import { createHash } from 'node:crypto';

/** 白名单：已知**返回 Promise**、且被同步丢弃会造成假回执的浏览器 API */
export const PROMISE_APIS = [
  'navigator.clipboard.writeText',
  'navigator.clipboard.readText',
  'navigator.share',
  'Notification.requestPermission',
  'navigator.storage.persist',
  'navigator.storage.persisted',
  'document.requestStorageAccess',
  'document.hasStorageAccess',
  'navigator.wakeLock.request',
  'window.showOpenFilePicker',
  'window.showSaveFilePicker',
];

/* 空函数体：function(){} / () => {} / _ => {} */
const EMPTY_FN = '(?:function\\s*\\([^)]*\\)\\s*\\{\\s*\\}|\\([^)]*\\)\\s*=>\\s*\\{\\s*\\}|[A-Za-z_$][\\w$]*\\s*=>\\s*\\{\\s*\\})';
/* 吞掉结果的两种写法：`.then(空, 空)`（成败都不区分）与 `.catch(空)`（拒了也不管） */
const SWALLOW_RE = new RegExp(
  '^\\s*\\.\\s*(?:then\\s*\\(\\s*' + EMPTY_FN + '\\s*,\\s*' + EMPTY_FN
  + '\\s*\\)|catch\\s*\\(\\s*' + EMPTY_FN + '\\s*\\))'
);

/** 从 openIdx（'(' 的位置）找到配对的 ')' 下标；不匹配返回 -1。跳过字符串与模板里的括号。 */
export function matchParen(raw, openIdx) {
  if (raw[openIdx] !== '(') return -1;
  let depth = 0;
  let q = null; // 当前字符串引号
  for (let i = openIdx; i < raw.length; i++) {
    const c = raw[i];
    if (q) {
      if (c === '\\') { i++; continue; }
      if (c === q) q = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === '(') depth++;
    else if (c === ')') { depth--; if (depth === 0) return i; }
  }
  return -1;
}

/** 花括号配对：从 openIdx（'{'）找配对的 '}'；不匹配返回 -1 */
export function matchBrace(raw, openIdx) {
  if (raw[openIdx] !== '{') return -1;
  let depth = 0;
  let q = null;
  for (let i = openIdx; i < raw.length; i++) {
    const c = raw[i];
    if (q) {
      if (c === '\\') { i++; continue; }
      if (c === q) q = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return i; }
  }
  return -1;
}

/**
 * 「回执证据」的搜索上界 —— 关键：不能越出调用所在的那个块。
 * 早期版本固定往后看 600 字符，于是 `ui-daily.js:21` 的 `Notification.requestPermission()`
 * 被判成 P0：证据其实来自 try 块**外面**下一行的 `toast(..., "ok")`（每日播报），与本次调用无关。
 * 规则：① 若在 try 块内 ⇒ 上界 = 该 try 块的 '}'（假回执通常把标志位写在 try 内的调用之后）；
 *       ② 否则 ⇒ 上界 = 最近一层包围花括号块的 '}'；③ 都没有 ⇒ 退化为 300 字符。
 */
export function evidenceEnd(raw, idx) {
  const head = raw.slice(0, idx);
  let m = null;
  const tryRe = /try\s*\{/g;
  let t;
  while ((t = tryRe.exec(head))) m = t; // 取最后一个（最近的）try{
  if (m) {
    const open = head.indexOf('{', m.index);
    const end = matchBrace(raw, m.index + (open - m.index));
    if (end > idx) return end;
  }
  /* 找最近一层还没闭合的 '{'：倒着扫，深度抵消 */
  let depth = 0;
  let q = null;
  for (let i = idx - 1; i >= 0; i--) {
    const c = raw[i];
    if (q) { if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === '}') { depth++; continue; }
    if (c === '{') { if (depth === 0) { const end = matchBrace(raw, i); if (end > idx) return end; break; } depth--; }
  }
  return Math.min(raw.length, idx + 300);
}

const norm = (s) => String(s || '').replace(/\s+/g, '');
const hash = (s) => createHash('sha1').update(norm(s)).digest('hex').slice(0, 12);

/** 调用点之后（到 endIdx 为止）是否有「成功回执」痕迹 —— 决定 P0 还是 P1 */
export function hasSuccessReceipt(raw, fromIdx, endIdx) {
  const end = Math.min(raw.length, typeof endIdx === 'number' && endIdx > fromIdx ? endIdx : fromIdx + 600);
  const seg = raw.slice(fromIdx, end);
  /* toast(...) 且级别不是 warn / error ⇒ 报成功 */
  let i = 0;
  while ((i = seg.indexOf('toast(', i)) > -1) {
    const close = matchParen(seg, i + 'toast('.length - 1);
    if (close > -1) {
      const call = seg.slice(i, close + 1);
      if (!/["'](?:warn|error|danger)["']/.test(call)) return true;
    } else {
      /* 括号没配上（跨行/截断）：退化为看后面 80 字符里有没有 warn/error */
      if (!/["'](?:warn|error|danger)["']/.test(seg.slice(i, i + 80))) return true;
    }
    i += 'toast('.length;
  }
  /* 布尔标志被置真：copied / ok / done / saved / success = true */
  if (/\b(?:copied|ok|done|saved|success|opened)\s*=\s*true\b/.test(seg)) return true;
  return false;
}

/**
 * 扫一个源文件内容。
 * @param {string} raw  源码
 * @param {string} file 文件名（仅用于定位）
 * @param {object} occSeen 同名 sig 的计数（同文件内第几次出现）
 */
export function findFalseReceipts(raw, file = '?', occSeen = {}) {
  const items = [];
  for (const api of PROMISE_APIS) {
    const esc = api.replace(/\./g, '\\.');
    const re = new RegExp('(?<![$\\w.])(?:(?:window|globalThis)\\s*\\.\\s*)?' + esc + '\\s*\\(', 'g');
    let m;
    while ((m = re.exec(raw))) {
      const idx = m.index;
      const openIdx = raw.indexOf('(', m.index + m[0].length - 1);
      const closeIdx = matchParen(raw, openIdx);
      if (closeIdx < 0) continue;

      const before = raw.slice(Math.max(0, idx - 60), idx);
      const after = raw.slice(closeIdx + 1, closeIdx + 80);

      /* 已处理：await / return / yield 前缀，或结果被赋值，或链式接了**非空** then/catch/finally */
      const awaited = /(?:await|return|yield)\s+$/.test(before);
      const assigned = /[=:]\s*$/.test(before) && !/=>\s*$/.test(before);
      const chained = /^\s*\.\s*(?:then|catch|finally)\s*\(/.test(after);
      /* 吞掉：链式接了但处理器是空的 ⇒ 成败都被丢掉，比"丢弃"更隐蔽（外面看着处理过了） */
      const sw = SWALLOW_RE.exec(after);
      const swallowed = !!sw;
      if ((awaited || assigned || chained) && !swallowed) continue;

      const line = raw.slice(0, idx).split('\n').length;
      const snippet = raw.slice(idx, Math.min(raw.length, idx + 100)).replace(/\s+/g, ' ');
      /* 回执证据从「调用真正结束的位置」之后找：吞掉形态要把 .then(空,空) / .catch(空) 也跳过去 */
      const evidFrom = swallowed ? closeIdx + 1 + sw[0].length : closeIdx + 1;
      const receipt = hasSuccessReceipt(raw, evidFrom, evidenceEnd(raw, idx));

      const bhash = hash(snippet);
      const sig = api + '|' + bhash;
      occSeen[sig] = (occSeen[sig] || 0) + 1;

      items.push({
        file,
        line,
        api,
        level: receipt ? 'P0' : 'P1',
        kind: swallowed ? 'swallow' : 'discard',
        snippet,
        sig,
        bhash,
        occ: occSeen[sig],
        why: receipt
          ? (swallowed ? '结果被 .then(空,空) 吞掉，随后仍给出成功回执 —— 失败也会报成功'
            : 'Promise 既没 await 也没接 .then/.catch，随后却给出成功回执 —— 失败也会报成功')
          : (swallowed ? '结果被 .then(空,空) 吞掉，rejection 无人处理'
            : 'Promise 既没 await 也没接 .then/.catch，rejection 无人处理'),
      });
    }
  }
  return items.sort((a, b) => a.line - b.line || a.api.localeCompare(b.api));
}

export const keyOf = (it) => it.file + ':' + it.sig + '#' + (it.occ || 1);
