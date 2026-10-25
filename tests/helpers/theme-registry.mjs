/**
 * theme-registry.mjs —— 主题登记面的三个提取器（供 theme-registration.test.js 用）
 * ----------------------------------------------------------------------------
 * 为什么要单独立一个 helper（而不是继续在测试里各写一份正则）：
 *   本仓主题**漏注册过 3 次**（v3.1.2 elegant/matrix、v3.4.0 forest/ocean、v3.6.3 mist），
 *   形态都是「CSS 与下拉有、PRESET_THEMES 没有」，表象是"设置里能选、页面毫无变化"。
 *   旧的门禁从 PRESET_THEMES 出发做正向 7 处断言 —— 那个方向只能抓"注册了但没实现"，
 *   **抓不到历史上真正发生的那 3 次**（注册表里根本没有这个 id，循环就不会检查它）。
 *   另外旧解析用 `slice(at, at+2000)` 硬窗口取 id：实测注册表块已 1683 B，
 *   只剩 317 B 余量 —— 再加一套主题就会把末尾 id 悄悄切在窗口外，门禁从此看不见它。
 * ⇒ 这里统一做**配对取块**（不靠长度窗口），并把三个方向的集合都吐出来，供正反双向断言。
 */
import fs from "node:fs";
import path from "node:path";

/** 从 `const NAME = {` 起按大括号配对取出整块正文（含首尾花括号） */
export function balancedObjectBlock(src, declMarker) {
  const at = src.indexOf(declMarker);
  if (at < 0) return null;
  const start = src.indexOf("{", at + declMarker.length - 1);
  if (start < 0) return null;
  let depth = 0, i = start;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) break; }
  }
  return src.slice(start, i + 1);
}

/** PRESET_THEMES 的键名 = 注册表认定的主题 id 集合 */
export function presetThemeIds(src) {
  const block = balancedObjectBlock(src, "const PRESET_THEMES = {");
  if (block === null) throw new Error("找不到 const PRESET_THEMES = { —— 主题门禁的真相源被挪走了");
  return [...block.matchAll(/^\s{2}([a-z][\w-]*)\s*:\s*\{/gm)].map((m) => m[1]);
}

/** CSS 令牌块里声明的主题（:root[data-theme="X"]{…}）；light 是"不设属性"的默认态，不出现 */
export function cssThemeIds(html) {
  return [...new Set([...html.matchAll(/:root\[data-theme="([a-z][\w-]*)"\]/g)].map((m) => m[1]))];
}

/** 设置页主题下拉里的 option value —— 只取 #cfgTheme 这一段，别把全站 option 混进来 */
export function selectThemeIds(html) {
  const at = html.indexOf('<select id="cfgTheme">');
  if (at < 0) throw new Error("找不到 #cfgTheme 下拉 —— 主题入口被挪走或改名");
  const seg = html.slice(at, html.indexOf("</select>", at));
  return [...new Set([...seg.matchAll(/<option value="([a-z][\w-]*)"/g)].map((m) => m[1]))];
}

export function readText(root, rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }
