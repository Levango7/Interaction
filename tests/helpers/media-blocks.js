/**
 * 扫描器：把每个 `@media (...) {` 块连同其内容整体切出来（支持嵌套大括号计数）。
 * 用于测试里「精确定位到某个媒体查询块」而不用脆弱的正则。
 */
export function mediaBlocks(css) {
  const out = [];
  const re = /@media[^{]*\{/g;
  let m;
  while ((m = re.exec(css))) {
    const start = m.index;
    const bodyStart = m.index + m[0].length;
    let depth = 1, i = bodyStart;
    while (i < css.length && depth > 0) {
      if (css[i] === "{") depth++;
      else if (css[i] === "}") depth--;
      i++;
    }
    out.push({ query: m[0].slice(0, -1).trim(), start, body: css.slice(bodyStart, i - 1), raw: css.slice(start, i) });
  }
  return out;
}
