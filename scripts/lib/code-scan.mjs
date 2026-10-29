/**
 * code-scan.mjs —— 静态分析用的极简 JS 词法预处理：把注释与字符串/正则字面量剥掉，
 * 只留真实代码，供 module-graph 抽「顶层定义」和「标识符引用」。
 *
 * 为什么单独成文件：这段逻辑的正确性直接决定门禁口径（漏剥 → 假边假环；多剥 → 真边被吞），
 * 所以它必须能被单元测试直接打到，而不是只能靠跑整个脚本来间接观察。
 *
 * v3.7.57 修一处会**吞掉代码**的老 bug：旧实现只认 `" ' \`` 三种引号，不认正则字面量。
 * 于是 src/ai-tools.js 里的 `/["']/g` 被当成"字符串开始"，一路吃到后面的引号才收尾，
 * 中间成片真实代码被抹平（实测：那个版本的该文件 strip 后 61834 → 35079 字节，
 * getChat / lastChatRequest 等真实引用直接消失）→ 少算依赖边、少算环，
 * 门禁看着比实况干净（同一份源码，修好后循环 39 → 44、逆层块对 29 → 35）。
 *
 * 现在：
 *   ① 按"上一个有效字符"判定 `/` 是正则还是除法，正则整段跳过（字符类 `[...]` 里的 `/` 不算结束）；
 *   ② `'` / `"` 不允许跨行（JS 里换行必须转义），遇到裸换行就判定为未闭合、当普通字符处理，
 *      保证任何一个孤立引号最多污染一行。
 *
 * v3.7.152 加 `maskCommentsAndStrings()`：**保位**版本（注释/字符串替换成等长空格、换行保留）。
 *   为什么需要它：`stripCommentsAndStrings()` 是**删除**，剥离后长度与原文不等、行号会漂
 *   （`findEmptyCatches` 的注释里记过这个坑：多行模板串被删后行数变少，越往后偏得越多）。
 *   于是「在剥离后的文本上定位」这条路走不通 —— 而有些扫描（例如找 `.catch(` / `.then(` 的
 *   处理器）**必须在原文上定位**才能拿到真实行号，同时又必须**看不见注释/字符串里的假代码**。
 *   掩码版正好同时满足两条：偏移与原文 1:1，且注释/字符串内容不再是代码。
 *   两个模式共用同一个 walker（`_walk`），避免两套词法规则各自漂移。
 */

const REGEX_OK_AFTER = new Set(['(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '<', '>', '~', '^', '\n', '']);

/* `)` 之后理论上可能是正则（`if (x) /re/.test()`），但这些块里没这种写法，
   按除法处理更安全：漏判会把整段代码吞掉，误判成除法只是少剥几个字符。 */
function regexCanStart(tail) {
  let k = tail.length - 1;
  while (k >= 0 && (tail[k] === ' ' || tail[k] === '\t')) k--;
  const ch = k >= 0 ? tail[k] : '';
  if (REGEX_OK_AFTER.has(ch)) return true;
  /* 关键字结尾也要按"可以起正则"处理：return /x/、typeof /x/、case /x/ 等 */
  const m = /([A-Za-z_$][\w$]*)$/.exec(tail.slice(0, k + 1));
  return !!(m && /^(return|typeof|instanceof|in|of|new|delete|void|case|do|else|yield|await)$/.test(m[1]));
}

/** 把一段文本替换成**等长空格**，但保留换行（掩码模式的长度/行号必须与原文 1:1）。 */
function _blank(s) {
  let o = '';
  for (let k = 0; k < s.length; k++) o += (s[k] === '\n' ? '\n' : ' ');
  return o;
}

/**
 * 词法预处理 walker —— 两种模式共用一套词法规则，避免各自漂移。
 * @param {string} text
 * @param {boolean} mask false=**删除**注释/字符串/正则（历史行为，依赖边分析用）
 *                       true=**替换成等长空格**并保留换行（保位，需在原文上定位的扫描用）
 * @returns {string}
 */
function _walk(text, mask) {
  let out = '';
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i], d = text[i + 1];
    if (c === '/' && d === '/') {
      const s = i;
      while (i < n && text[i] !== '\n') i++;
      if (mask) out += _blank(text.slice(s, i));
      continue;
    }
    if (c === '/' && d === '*') {
      const s = i;
      i += 2;
      while (i < n && !(text[i] === '*' && text[i + 1] === '/')) i++;
      i += 2;
      if (i > n) i = n;                                 // 钳住，否则掩码会短 2 个字符
      if (mask) out += _blank(text.slice(s, i));
      continue;
    }
    if (c === '/' && regexCanStart(out)) {
      /* 正则字面量：整段吃掉（里面的字符不是标识符引用） */
      let j = i + 1, inClass = false, closed = false;
      while (j < n) {
        const x = text[j];
        if (x === '\\') { j += 2; continue; }
        if (x === '\n') break;                        // 未闭合：不吞后面的行
        if (x === '[') inClass = true;
        else if (x === ']') inClass = false;
        else if (x === '/' && !inClass) { closed = true; j++; break; }
        j++;
      }
      if (closed) {
        while (j < n && /[a-z]/i.test(text[j])) j++;   // flags
        out += mask ? _blank(text.slice(i, j)) : ' ';
        i = j; continue;
      }
      out += c; i++; continue;                          // 判不成正则 → 当除法处理
    }
    if (c === '"' || c === "'" || c === '`') {
      const q = c;
      /* 单/双引号串必须在一行内闭合；跨行说明这里其实是"未闭合/误判"，
         按普通字符跳过即可 —— 绝不能让一个引号吃掉后半篇代码。 */
      if (q !== '`') {
        let j = i + 1, closed = false;
        while (j < n) {
          if (text[j] === '\\') { j += 2; continue; }
          if (text[j] === '\n') break;
          if (text[j] === q) { closed = true; break; }
          j++;
        }
        if (!closed) { out += c; i++; continue; }
      }
      i++; out += ' ';                                  // 开引号
      while (i < n && text[i] !== q) {
        if (text[i] === '\\') { if (mask) out += _blank(text.slice(i, i + 2)); i += 2; continue; }
        if (q === '`' && text[i] === '$' && text[i + 1] === '{') {
          /* 模板字符串里的 ${...} 是真实表达式 → 保留其内容 */
          let depth = 1; i += 2;
          if (mask) out += '  ';
          while (i < n && depth > 0) {
            if (text[i] === '{') depth++;
            else if (text[i] === '}') { depth--; if (!depth) { i++; if (mask) out += ' '; break; } }
            out += text[i]; i++;
          }
          continue;
        }
        if (mask) out += (text[i] === '\n' ? '\n' : ' ');
        i++;
      }
      /* 闭引号。**只有真的吃到了闭引号才补那个空格** —— 串在 EOF 处未闭合时（反引号常见）
         补了就会让掩码比原文长 1，偏移从此整体错位（实测 tests/i18n-completeness.test.js）。 */
      const hadClose = i < n;
      i++;
      if (mask && hadClose) out += ' ';
      continue;
    }
    out += c; i++;
  }
  return out;
}

/**
 * 剥掉注释 / 字符串 / 正则字面量，保留其余代码（含换行，便于按行定位）。
 * @param {string} text
 * @returns {string}
 */
export function stripCommentsAndStrings(text) {
  return _walk(text, false);
}

/**
 * **保位**版：把注释 / 字符串 / 正则字面量替换成等长空格（换行保留）。
 * 用途：需要在**原文**上定位（拿真实行号/偏移）却又必须**看不见注释里的假代码**的扫描。
 * 不变量（有单测钉住）：`out.length === text.length` 且每个 `\n` 位置与原文一致。
 * @param {string} text
 * @returns {string}
 */
export function maskCommentsAndStrings(text) {
  return _walk(text, true);
}

