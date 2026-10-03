/**
 * empty-catch.mjs —— 空 catch 判定的核心逻辑（v3.7.87 抽取）
 * ----------------------------------------------------------------------------
 * 为什么单独成文件，而不是写在 lint-empty-catch.mjs 里：
 *   这段逻辑的正确性**直接决定门禁口径**（漏判 → 真危险溜过去；误判 → 满屏噪音没人看）。
 *   它必须能被单元测试**直接打到**，而不是只能通过"跑整个 CLI 再读 stdout"间接观察
 *   —— 与 scripts/lib/code-scan.mjs 注明的同一条原则。
 *   更实际的一条：走 execFileSync 子进程在受限环境里会 EBUSY，纯函数调用不受影响。
 *
 * 职责边界：本文件只做「扫描 + 分级」，不含 CLI 参数解析 / 基线读写 / 输出格式。
 */
import { createHash } from 'node:crypto';
import { stripCommentsAndStrings } from './code-scan.mjs';

/* ---------------------------------------------------------------- 分级规则 */
/**
 * P0（危险 · 静默吞真实错误）：try 块里出现这些 API，失败即真实故障而非预期降级。
 * 每一条都对应一类可复现的用户可见故障；尤其是 `await` 与 `save*()` ——
 * 前者让调用方永远等得到"成功了"，后者让用户数据真丢了却无人知晓。
 */
export const P0_PATTERNS = [
  { re: /\bawait\b/, why: 'await：异步 reject 被吞，调用方永远等得到"成功了"' },
  { re: /\blocalStorage\s*\./, why: 'localStorage：配额满 / 隐私模式读写出错，用户数据静默丢失' },
  { re: /\bsessionStorage\s*\./, why: 'sessionStorage：同上，会话数据静默丢失' },
  { re: /JSON\.parse\s*\(/, why: 'JSON.parse：脏数据/截断数据解析失败，配置静默回落默认值' },
  { re: /\.(transaction|objectStore)\s*\(/, why: 'IndexedDB：事务 abort / 存储损坏，数据静默不落盘' },
  { re: /\b(atob|btoa)\s*\(/, why: 'atob/btoa：非法 base64 直接抛，导入导出静默失败' },
  { re: /\bnew\s+URL\s*\(/, why: 'new URL：非法 URL 抛出，链接/跳转静默不生效' },
  { re: /\bsave[A-Za-z_$]*\s*\(/, why: 'save*()：项目持久化封装（内部 localStorage.setItem），配额满/隐私模式时用户数据静默丢失' },
  { re: /\.setItem\s*\(/, why: 'setItem：写盘失败，用户数据静默丢失' },
  { re: /JSON\.stringify\s*\(/, why: 'JSON.stringify：循环引用会抛，整条记录静默丢' },
  { re: /\bpersist[A-Za-z_$]*\s*\(/, why: 'persist*()：配置/凭据持久化失败，重启后静默回到默认值' },
  { re: /\.decode\s*\(/, why: 'decode()：资源解码失败，图片/音频静默不显示' },
  { re: /\.forEach\s*\(/, why: 'forEach：回调内抛异常被吞，批量操作只做一半且不报错' }
];

/** P2（无害 · 预期降级）：能力探测专用写法。仅在未命中 P0 时才看它。 */
export const P2_PATTERNS = [
  /\btypeof\b/,
  /\bin\s+(?:window|document|globalThis)\b/,
  /\bwindow\s*\.\s*\w+\s*(?:===|!==|\?)\s*["']?\w*/
];

/**
 * 「反馈性调用」：只做提示/上报、不改变业务状态。试块里**仅含**这些调用时属规范写法。
 * 反过来想：外面那层 catch 正是为了防止"连报错都报不出去"，抽掉它反而制造递归风险。
 */
const FEEDBACK_CALLS = /\b(pushDiag|toast|pushNotify|console\.(?:log|warn|error|debug|info))\b/;

/**
 * 抹掉 `fn(...)` 整体（含嵌套括号），剩下的就是"还做了别的事吗"。
 * 用括号计数而非贪婪正则 —— 嵌套调用会骗过 `\(.*?\)`。
 */
export function stripFeedbackCalls(s) {
  let out = '', i = 0;
  while (i < s.length) {
    const rest = s.slice(i);
    const m = FEEDBACK_CALLS.exec(rest);
    if (!m) { out += rest; break; }
    out += s.slice(i, i + m.index);
    const parenStart = i + m.index + m[0].length;
    if (s[parenStart] !== '(') { out += m[0]; i = parenStart; continue; }
    let depth = 0, j = parenStart;
    for (; j < s.length; j++) {
      if (s[j] === '(') depth++;
      else if (s[j] === ')') { depth--; if (depth === 0) { j++; break; } }
    }
    i = j;
  }
  return out;
}

/**
 * 给单个 catch 定级。
 * @param {string} tryBody try 块内容（**必须已剥注释/字符串**，否则注释里的词会抬高级别）
 * @returns {{level:'P0'|'P1'|'P2', why:string}}
 */
export function classify(tryBody) {
  if (!tryBody) return { level: 'P1', why: '无法定位 try 块，保守计为 P1（人工复核）' };
  const hit = P0_PATTERNS.find((p) => p.re.test(tryBody));
  if (hit) return { level: 'P0', why: hit.why };
  const residue = stripFeedbackCalls(tryBody);
  if (residue.replace(/[;{}\s]/g, '') === '') {
    return { level: 'P2', why: '仅反馈性调用（诊断/提示自成闭环），属规范写法，勿改' };
  }
  if (P2_PATTERNS.some((re) => re.test(tryBody))) {
    return { level: 'P2', why: '预期降级（仅能力探测），无需改动' };
  }
  return { level: 'P1', why: 'try 块含业务逻辑，需人工判断是否该上报' };
}

/**
 * 找空 catch。**全程在 raw 原文上定位**，只在判断 catch 体时对它单独剥注释。
 *
 * ⚠️ 曾经的错误做法（两次，都记下来）：
 *   ① 先在全文 stripCommentsAndStrings 再在上面定位 —— 多行模板字符串被删后**行数变少**，
 *      越往后行号偏得越多，实测位置落在 `${esc(p.name)}` 这种 HTML 字面量行上；
 *   ② 用 `\{([^{}]*)\}` 取 catch 体 —— 体里出现 `if(x){...}` 时只吃到内层 `{`，
 *      body 判空 → 把有真实逻辑的 catch 误报成空（92 处被报成 489 处）。
 *   教训：**定位用原文、判断用剥离**；嵌套结构一律括号计数。
 *
 * @param {string} raw 原始源码
 */
export function findEmptyCatches(raw, file) {
  const out = [];
  const CATCH_HEAD = /catch\s*(?:\(\s*([A-Za-z_$][\w$]*)\s*\))?\s*\{/g;
  let m;
  while ((m = CATCH_HEAD.exec(raw)) !== null) {
    /* 防御：catch 语法上必须紧跟 try 体或 finally 体的闭括号，要求前 60 字符内有 `}` */
    if (raw.slice(Math.max(0, m.index - 60), m.index).lastIndexOf('}') < 0) continue;
    const open = m.index + m[0].length - 1;
    let depth = 0, end = -1;
    for (let i = open; i < raw.length; i++) {
      if (raw[i] === '{') depth++;
      else if (raw[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end < 0) continue;
    if (stripCommentsAndStrings(raw.slice(open + 1, end)).trim() !== '') continue;
    const bodyText = raw.slice(open + 1, end);
    /* bare = 连一句注释都没有。同风险下，它才是"作者压根没评估过"的那一类，优先处理。 */
    const bare = !/\/\*[\s\S]*?\*\/|\/\/[^\n]*/.test(bodyText);
    out.push({ idx: m.index, end: end + 1, open, file, bare,
      note: bodyText.replace(/\s+/g, ' ').trim().slice(0, 60) });
  }
  return out;
}

/**
 * 反向括号匹配：定位 catch 所属 try 块的内容。
 * `try { A } catch(e) {}` 中 catch 前紧邻的 `}` 是 try 体闭括号，与之配对的 `{` 是开括号。
 * @returns {string|null}
 */
export function tryBlockBefore(raw, catchStart) {
  let i = catchStart - 1;
  while (i >= 0 && /\s/.test(raw[i])) i--;
  if (i < 0 || raw[i] !== '}') return null;
  let depth = 0, openIdx = -1;
  for (; i >= 0; i--) {
    const ch = raw[i];
    if (ch === '}') depth++;
    else if (ch === '{') { depth--; if (depth === 0) { openIdx = i; break; } }
  }
  if (openIdx < 0) return null;
  return raw.slice(openIdx + 1, catchStart).trim();
}

/**
 * 扫描一个源文件的全部空 catch。
 * @param {string} raw
 * @param {string} file 文件名（参与签名，使不同文件的同内容互不混淆）
 * @param {object} [occSeen] 跨文件共享的出现计数（默认新建）
 */
export function scanSource(raw, file, occSeen = {}) {
  const items = [];
  for (const c of findEmptyCatches(raw, file)) {
    const tryBody = tryBlockBefore(raw, c.idx) || '';
    const { level, why } = classify(stripCommentsAndStrings(tryBody));
    const sig = createHash('sha1').update((file + '|' + tryBody).replace(/\s+/g, ' ')).digest('hex').slice(0, 10);
    const line = raw.slice(0, c.idx).split('\n').length;
    /* occ：同一文件内相同内容的出现序号。没有它，两条 tryBody 相同的空 catch
       会被 keyOf 去重成一条（实测 493 被吞成 452）——修掉一处，另一处也跟着"消失"。 */
    const k = file + '|' + sig;
    const occ = (occSeen[k] = (occSeen[k] || 0) + 1);
    items.push({ file, line, sig, occ, level, why, bare: c.bare, note: c.note,
      snippet: tryBody.replace(/\s+/g, ' ').slice(0, 70) });
  }
  return items;
}

/** 条目标识 —— 必须含 occ，否则同文件相同 try 内容会<｜hy_place▁holder▁no▁813｜>撞车导致基数缩水。 */
export const keyOf = (it) => it.file + ':' + it.sig + '#' + (it.occ || 1);
