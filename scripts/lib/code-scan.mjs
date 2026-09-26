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

/**
 * 剥掉注释 / 字符串 / 正则字面量，保留其余代码（含换行，便于按行定位）。
 * @param {string} text
 * @returns {string}
 */
export function stripCommentsAndStrings(text) {
  let out = '';
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i], d = text[i + 1];
    if (c === '/' && d === '/') { while (i < n && text[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') { i += 2; while (i < n && !(text[i] === '*' && text[i + 1] === '/')) i++; i += 2; continue; }
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
        out += ' '; i = j; continue;
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
      i++; out += ' ';
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
