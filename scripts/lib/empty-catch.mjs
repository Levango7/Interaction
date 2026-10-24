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
    /* bare = 连一句解释都没有。同风险下，它才是"作者压根没评估过"的那一类，优先处理。
     *
     * ⚠️ 曾经的错误做法（只判 catch 体内部）：v3.7.88 实测踩到 ——
     *   `/* 本轮没补到的缺失向量由检索侧按需再补 *\/` 这类说明写在 **try 块上方**，
     *   catch 体本身是空的（`catch(_){}`），于是被判 bare="作者未评估"，
     *   P0-a 台账 34 处里混进了这种**假阳性**，会误导人去改本来正确的代码。
     *   实测 ai-tools.js:2188 / 2240 就是这种（await 空 catch 危害标成"永远等得到成功了"，
     *   实际失败不改控制流、正文已入库、向量走检索侧兜底 —— 是合理设计）。
     *   故 bare 改为「catch 体 **或** try 块上方」都没有解释才算 bare。
     *   判据只影响台账排序，**不参与 P0/P1/P2 分级**，故不会削弱拦截能力。
     */
    const hasBodyNote = /\/\*[\s\S]*?\*\/|\/\/[^\n]*/.test(bodyText);
    const hasTryNote = /\/\*[\s\S]*?\*\/|\/\/[^\n]*/.test(leadingCommentBefore(raw, m.index));
    const bare = !hasBodyNote && !hasTryNote;
    out.push({ idx: m.index, end: end + 1, open, file, bare,
      note: bodyText.replace(/\s+/g, ' ').trim().slice(0, 60) });
  }
  return out;
}

/**
 * 取 catch 之前、紧邻 try 块上方的一小段注释（最多向上 10 行），只认**真正连续的注释**。
 *
 * ⚠️ v3.7.88 实测踩了四轮才做对，教训是**别逐行独立判断**：
 *   ① `try{ ... }catch(_){}` 常写在**同一行**。从「catch 前最后一个 `}`」所在整行回溯会撞上
 *      同行的 `try` 真实代码而立即 break → 上方说明整段漏掉。故起点取 catch 所在行的**行首**。
 *   ② 块注释跨行形态至少三种：行首星号续行（`   星号 B`）、行尾星号斜杠收尾（`   B 星号斜杠`）、
 *      纯文本中间行（`   B`）。**逐行猜形态必然顾此失彼**（先漏 (b)，再漏 (c)）。
 *   ③ 「把这行的块注释片段剔掉，看还剩不剩残留」这条看似聪明的判据同样错：
 *      多行注释的**首行**（只有起始符没有闭合符）剔不掉 → 残留非空 → 被误判成代码。
 *   ④ 正确姿势：**跨行跟踪块注释开闭配对**。从 catch 往上逐行喂进一个开关状态机
 *      （遇块注释起始符 depth+1、遇闭合符 depth-1），任一时刻「处于注释内」或
 *      「本行是完整行注释/纯空白」才收；一旦某行是**未处于注释内的真实代码**就停。
 *      这样 (a)(b)(c) 三种形态自然统一处理，不需要任何逐行特例。
 *
 * @returns {string} 段文本（供调用方用「有没有注释」正则判是否已评估）；无则空串
 */
export function leadingCommentBefore(raw, catchStart) {
  const lineStart = raw.lastIndexOf('\n', catchStart) + 1;
  /* 步骤 1：自下而上粗收集最多 10 行（此时**不做**注释判断，方向是反的、判断必然失准） */
  const raw_up = [];
  let p0 = lineStart - 1;                  /* catch 所在行的行首前一字符 */
  for (let hops = 0; hops < 10 && p0 >= 0; hops++) {
    const prevStart = raw.lastIndexOf('\n', p0 - 1) + 1;
    raw_up.push(raw.slice(prevStart, p0).trim());
    p0 = prevStart - 1;
  }
  raw_up.reverse();                        /* 变为自上而下 */
  /* 步骤 2：自上而下跑块注释配对状态机，给每行打「是否整行在注释内」的标记。
     ⚠️ 必须自上而下：从下往上先遇到闭合符会让 depth 变负、配对全乱（v3.7.88 实测）。 */
  const flags = [];
  let depth = 0;
  for (const line of raw_up) {
    const entryDepth = depth;
    let openedHere = false;
    if (line.startsWith('//')) { flags.push('line'); continue; }   /* 行注释整行算注释 */
    if (line === '') { flags.push('blank'); continue; }           /* 空行算中性 */
    for (let k = 0; k < line.length - 1; k++) {
      const two = line.slice(k, k + 2);
      if (two === '*/') depth--;
      else if (two === '/*') { depth++; openedHere = true; }
    }
    /* entryDepth>0 表示进入本行时已在注释中；openedHere 表示本行开启了注释（尚未闭合也算） */
    flags.push(entryDepth > 0 || openedHere || depth > 0 ? 'block' : 'code');
  }
  /* 步骤 3：从最靠近 catch 的那一行（数组末尾）往前，截取**连续非 code** 的片段 */
  const kept = [];
  for (let i = flags.length - 1; i >= 0; i--) {
    if (flags[i] === 'code') break;       /* 撞上真实代码 → 停 */
    kept.unshift(raw_up[i]);
  }
  return kept.join('\n');
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
 * 找**空的 Promise rejection 处理器**（R-36 补，2026-10-25）。
 * ----------------------------------------------------------------------------
 * 为什么单开一类：`try{ await f() }catch(e){}` 有门禁盯着，但 `f().catch(()=>{})`
 * 与 `f().then(ok, ()=>{})` **同样把失败路径静默吞掉**，却从来不在任何门禁视野里 ——
 * 探针实测（`_probe/gatescope/`）原门禁对这两形状的判定是"非空 catch，不管"。
 * 这不是理论风险：R-34「右栏复制产出在浏览器拒绝剪贴板时仍报成功」正是这一族
 * （失败路径没有观测口，用户看到的是假回执）。
 *
 * 只认**空体**（`{}` 或只含注释）：非空的 rejection 处理器本仓一律要写观测，
 * 由 lint:empty-catch 的 P0/P1/P2 分级在 try/catch 侧把关，这里不重复判。
 *
 * 形状覆盖：`.catch(fn)` / `.catch(()=>{})` / `.catch(function(e){})` /
 *           `.then(ok, fn)` / `.then(a, b, ()=>{})`
 * 用「整形状正则」而非括号计数：体为空 ⇒ 没有嵌套结构要处理，
 * 反而比先定位再括号匹配更不容易误判（findEmptyCatches 里 `\{([^{}]*)\}` 的教训）。
 *
 * @param {string} raw 原始源码
 * @returns {Array<{idx:number}>} 命中位置（供上层取上下文与行号）
 */
export function findEmptyRejectionHandlers(raw) {
  const out = [];
  const EMPTY_REJECT = /\.(?:catch|then)\s*\(\s*(?:[A-Za-z_$][\w$]*\s*,\s*)*(?:function\s*\([^)]*\)|(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>)\s*\{\s*(?:\/\*[\s\S]*?\*\/|\/\/[^\n]*)*\s*\}/g;
  let m;
  while ((m = EMPTY_REJECT.exec(raw)) !== null) out.push({ idx: m.index });
  return out;
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
    const normBody = tryBody.replace(/\s+/g, ' ');
    const sig = createHash('sha1').update(file + '|' + normBody).digest('hex').slice(0, 10);
    /* v3.7.132：`bhash` = **不含文件名**的 body 指纹。用途单一：识别「同一处 try 只是搬了家」。
       为什么需要它：`sig` 把文件名混进哈希 ⇒ 把一个大块拆成多块（或把函数挪到别的模块）时，
       同一条目在新文件里的 key 与基线完全不同 ⇒ 门禁把它当成"新增"，连**已基线的 P0** 也会
       重新变红（v3.7.132 拆 core.js 实测：`core.js:232` P0 → `core-i18n.js:10`，CI 红）。
       那是"假红"，且每次重构都会复发。判据见 classifyDelta()。 */
    const bhash = createHash('sha1').update(normBody).digest('hex').slice(0, 10);
    const line = raw.slice(0, c.idx).split('\n').length;
    /* occ：同一文件内相同内容的出现序号。没有它，两条 tryBody 相同的空 catch
       会被 keyOf 去重成一条（实测 493 被吞成 452）——修掉一处，另一处也跟着"消失"。 */
    const k = file + '|' + sig;
    const occ = (occSeen[k] = (occSeen[k] || 0) + 1);
    items.push({ file, line, sig, bhash, occ, level, why, bare: c.bare, note: c.note,
      snippet: normBody.slice(0, 70), kind: 'catch' });
  }
  /* R-36：空的 Promise rejection 处理器。kind='reject' 与 try/catch 分开记 ——
     两者分级依据不同（这里看 `.catch` 前那条 promise 表达式，try/catch 看 try 体），
     混在一类会让"修了一类、另一类不动"在基线里看不出来。 */
  for (const r of findEmptyRejectionHandlers(raw)) {
    const ctx = raw.slice(Math.max(0, r.idx - 200), r.idx).replace(/\s+/g, ' ');
    const { level, why } = classify(stripCommentsAndStrings(ctx));
    const sig = createHash('sha1').update(file + '|' + ctx).digest('hex').slice(0, 10);
    const bhash = createHash('sha1').update(ctx).digest('hex').slice(0, 10);
    const line = raw.slice(0, r.idx).split('\n').length;
    const k = file + '|' + sig;
    const occ = (occSeen[k] = (occSeen[k] || 0) + 1);
    const handler = raw.slice(r.idx, r.idx + 60).replace(/\s+/g, ' ').trim();
    /* bare 判据（只影响台账排序，不参与 P0/P1/P2 分级，见 findEmptyCatches 的同款说明）：
       ① 处理器体里有注释；② 紧邻上方有注释（复用 try/catch 侧的 leadingCommentBefore）；
       ③ **向上 1500 字符内出现过注释** —— 这一条是为 reject 形态专设的：说明常常写在
          「包住这条 promise 的那个 if / 那个变量赋值」的上方（实测 ai-tools.js:2408 的说明
          在 2406 行结束的块注释里，中间隔着 `if(!cache.size && _ragEnsuring){` 一行代码），
          leadingCommentBefore 遇到那行代码就停了，会把**已经评估过**的判成"未评估"。
          1500 字符是启发式上限（约 10~20 行），宁可宽一点：判错方向只会让排序失真，
          不会让真危险溜过去（分级不受它影响）。 */
    const hasBodyNote = /\/\*[\s\S]*?\*\/|\/\/[^\n]*/.test(handler);
    const hasAboveNote = /\/\*[\s\S]*?\*\/|\/\/[^\n]*/.test(leadingCommentBefore(raw, r.idx))
      || /\/\*[\s\S]*?\*\/|\/\/[^\n]*/.test(raw.slice(Math.max(0, r.idx - 1500), r.idx));
    items.push({ file, line, sig, bhash, occ, level, why,
      bare: !hasBodyNote && !hasAboveNote,
      note: handler.slice(0, 60), snippet: ctx.slice(-70), kind: 'reject' });
  }
  return items;
}

/** 条目标识 —— 必须含 occ，否则同文件相同 try 内容会撞车导致基数缩水。 */
export const keyOf = (it) => it.file + ':' + it.sig + '#' + (it.occ || 1);

/**
 * 棘轮差集：把「新增 / 消失」再拆出**搬家**那一类（v3.7.132）。
 *
 * @param {Array} cur   当前扫描结果（scanSource 的产物，带 bhash）
 * @param {Array} prev  基线条目（**需带 bhash**；旧基线没有该字段时，搬家判定自动降级为"不作数"）
 * @returns {{added:Array, removed:Array, movedTo:Set<string>, movedFrom:Array, addedReal:Array, removedReal:Array}}
 *   · added / removed = 原始差集（键级）
 *   · movedTo  = added 里被判定为"搬家落点"的条目 key 集合
 *   · movedFrom= removed 里被判定为"搬家原点"的条目
 *   · addedReal / removedReal = 扣掉搬家之后的真·新增 / 真·消失
 *
 * 判据（**必须成对**，否则会变成洗白通道）：
 *   一条 added 与一条 removed 的 `bhash` 相同 ⇒ 判为搬家（同一处 try 换了位置）。
 *   用**多重集配对**而不是集合包含：同 body 出现多次时，各配对各的（否则一处真新增会被
 *   另一处的消失"盖住"）。**只复制不删除**（原地的还在）⇒ removed 里没有可配对的 ⇒ 仍报新增。
 */
export function classifyDelta(cur, prev) {
  const prevKeys = new Set(prev.map(keyOf));
  const curKeys = new Set(cur.map(keyOf));
  const added = cur.filter((it) => !prevKeys.has(keyOf(it)));
  const removed = prev.filter((p) => !curKeys.has(keyOf(p)));

  /* 旧基线没有 bhash ⇒ 搬家判定降级（宁可假红一次，也不能凭空放过一条真新增） */
  const gone = new Map();
  for (const p of removed) if (p.bhash) gone.set(p.bhash, (gone.get(p.bhash) || 0) + 1);

  const movedTo = new Set();
  const movedFromKey = new Set();
  for (const it of added) {
    if (!it.bhash) continue;
    const left = gone.get(it.bhash) || 0;
    if (left > 0) { gone.set(it.bhash, left - 1); movedTo.add(keyOf(it)); }
  }
  /* 反向配对：先从 removed 侧标出被"用掉"的原点（与上面同一套多重集语义） */
  const back = new Map();
  for (const it of added) if (it.bhash && movedTo.has(keyOf(it))) back.set(it.bhash, (back.get(it.bhash) || 0) + 1);
  for (const p of removed) {
    const left = back.get(p.bhash) || 0;
    if (left > 0) { back.set(p.bhash, left - 1); movedFromKey.add(keyOf(p)); }
  }

  return {
    added,
    removed,
    movedTo,
    movedFrom: removed.filter((p) => movedFromKey.has(keyOf(p))),
    addedReal: added.filter((it) => !movedTo.has(keyOf(it))),
    removedReal: removed.filter((p) => !movedFromKey.has(keyOf(p))),
  };
}
