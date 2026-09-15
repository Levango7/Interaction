#!/usr/bin/env node
/**
 * lint-colors.mjs — 硬编码颜色门禁
 *
 * 扫描 agent-workbench.html，正则找出所有硬编码 hex(#rgb/#rgba/#rrggbb/#rrggbbaa) / rgb() / rgba()
 * 字面量。以下为「允许的硬编码」（白名单），其余一律视为违规：
 *
 *   A. 令牌与声明
 *      A1 CSS 自定义属性定义行（`:root` / `:root[data-theme="dark"]` 中的 --token:值）
 *      A2 PWA meta 主题色（<meta name="theme-color" content="#xxxxxx">）
 *   B. 产品数据色（不是 UI 令牌，随数据走）
 *      B1 SCENARIOS 场景语义色 / 自定义场景默认色（`color:"#"` 与 `color = "#"` 两种写法）
 *      B2 PALETTES 调色板数组（用户可收藏的色值）
 *   C. 品牌识别色（第三方品牌色，不可令牌化）
 *      C1 微信绿 #07c160（SSO 登录按钮）
 *   D. 艺术素材（插画/立绘，属「美术资源」而非「界面配色」）
 *      D1 萌宠子系统 CSS（选择器含 .pet- 的规则块内的所有字面量）
 *      D2 萌宠立绘标定表与 SVG 渐变（`skin:"#"` / `lash:"#"` / `stop-color="#..."`）
 *      D3 行内 SVG 图标的 fill="#..." / stroke="#..."（仅在含 SVG 元素的字符串片段中）
 *   E. 生成物模板（字面量属于「导出产物/被注入文档」，不是宿主界面）
 *      E1 导出 SVG 文档（`'<svg xmlns="http://www.w3.org/2000/svg"` 至 `'</svg>'` 之间）
 *      E2 iframe srcdoc 预览文档（`'<!doctype html>` 至 `'</html>'` 之间）
 *      E3 canvas 绘制（`fillStyle = "#..."`）与 iframe 内联样式（`.cssText = "..."`）
 *   F. 变量回退值：`var(--token, <字面量>)` 中的字面量是「令牌缺失时的兜底」，按定义必须写死
 *      （扫描前由 stripVarFallbacks 剥离）
 *   G. 主题中性色：纯黑 / 纯白的 alpha 值（阴影、蒙层、遮罩、高光）不随主题变化
 *
 * 发现违规字面量 → 打印行号并 process.exit(1)；否则 exit(0)。
 * 该脚本是「剩余违规」的权威枚举器：改完后它必须报 0。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_FILE = path.resolve(__dirname, "..", "agent-workbench.html");
const file = process.argv[2] || DEFAULT_FILE;

if (!fs.existsSync(file)) {
  console.error(`ERR: 找不到目标文件 ${file}`);
  process.exit(2);
}

const src = fs.readFileSync(file, "utf8");
const lines = src.split(/\r?\n/);

/**
 * 颜色字面量正则。
 * hex 仅匹配合法 CSS 长度（3/4/6/8 位）且后接非标识符字符——
 * 否则 `$("#ccDec")` 这类 DOM id 会被误判为颜色（#ccDec 的 c/c/D/e/c 全是 hex 字符）。
 */
const HEX = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![0-9a-zA-Z_-])/g;
const RGB = /rgba?\(\s*[\d.,\s%]+\s*\)/g;

/** 剥离 var(--token, <fallback>) 中的回退字面量（回退值按定义必须写死，不算违规） */
function stripVarFallbacks(line) {
  return line.replace(/var\(\s*--[\w-]+\s*,\s*(?:[^()]|\([^()]*\))*\)/g, "var(--token)");
}

/** 主题中性色：纯黑 / 纯白（含 alpha）——阴影、蒙层、遮罩、高光，不随主题变化 */
function isNeutralColor(v) {
  const s = v.toLowerCase();
  if (s === "#fff" || s === "#ffffff" || s === "#000" || s === "#000000") return true;
  const m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*[\d.]+\s*)?\)$/.exec(s);
  if (!m) return false;
  const r = Number(m[1]), g = Number(m[2]), b = Number(m[3]);
  return (r === 0 && g === 0 && b === 0) || (r === 255 && g === 255 && b === 255);
}

/**
 * 预扫描：标记每一行是否落在「生成物模板」（导出 SVG / iframe srcdoc）区间内。
 * @returns {boolean[]}
 */
function markGeneratedDocRanges(lines) {
  const flags = new Array(lines.length).fill(false);
  let open = false;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/'<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/.test(l) || /'<!doctype html>/i.test(l)) open = true;
    if (open) flags[i] = true;
    if (/'<\/svg>'/.test(l) || /<\/html>';/.test(l) || /<\/html>'/.test(l)) open = false;
  }
  return flags;
}

/**
 * 预扫描：标记每一行是否位于「萌宠子系统 CSS 规则块」内（选择器含 .pet-）。
 * 该子系统的色值是美术资源（立绘/表情/3D 滤镜），不属于 UI 令牌体系。
 * @returns {boolean[]}
 */
function markPetCssRanges(lines) {
  const flags = new Array(lines.length).fill(false);
  let inPet = false;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();
    // 同一行内完成的选择器（如 `.pet-fx-heart{color:#ff6b9d}`）
    const inlineSel = /\.pet-[^{};]*\{/.test(l);
    // 多行规则的开头（选择器独占一行并以 { 结尾）
    if (/^[^{}]*\{\s*$/.test(l) && !/^--/.test(l)) {
      inPet = /\.pet-/.test(l);
    } else if (/^\}/.test(l)) {
      inPet = false;
    }
    if (inPet || inlineSel) flags[i] = true;
  }
  return flags;
}

const inGeneratedDoc = markGeneratedDocRanges(lines);
const inPetCss = markPetCssRanges(lines);

/** 白名单：返回 true 表示该行允许出现颜色字面量 */
function isWhitelisted(line, idx) {
  // A1) CSS 自定义属性定义行（含 --shadow:0 1px 3px rgba(...) 这类带前缀写法）
  if (/--[\w-]+\s*:.*?(#[0-9a-fA-F]{3,6}|rgba?\(|hsl)/.test(line)) return true;
  // A2) PWA meta 主题色
  if (/<meta\s+name=["']theme-color["']/.test(line)) return true;
  // B1) SCENARIOS 场景语义色 / 自定义场景默认色：color:"#..." 或 color = "#..."
  if (/\bcolor\s*[:=]\s*"#/.test(line)) return true;
  // B2) PALETTES 调色板数组：连续的引号 hex
  if (/"#[0-9a-fA-F]{3,6}","#/.test(line)) return true;
  // C1) 品牌识别色：微信绿
  if (/#07c160/i.test(line)) return true;
  // D1) 萌宠子系统 CSS 规则块
  if (inPetCss[idx]) return true;
  // D2) 萌宠立绘标定表 / SVG 渐变
  if (/stop-color="#|skin:"#|lash:"#/.test(line)) return true;
  // D3) 行内 SVG 元素的 fill/stroke（脚本字符串片段中的美术色）
  if (/fill="#[0-9a-fA-F]{3,6}"/.test(line) || /stroke="#[0-9a-fA-F]{3,6}"/.test(line)) {
    if (/['"`].*<svg|<circle|<ellipse|<path|<rect|<line|<polyline/.test(line)) return true;
  }
  // E1/E2) 生成物模板（导出 SVG / iframe srcdoc 预览）
  if (inGeneratedDoc[idx]) return true;
  // E3) canvas 绘制与 iframe 内联样式
  if (/fillStyle\s*=\s*"#/.test(line)) return true;
  if (/\.cssText\s*=/.test(line)) return true;
  return false;
}

const violations = [];
for (let i = 0; i < lines.length; i++) {
  const raw = lines[i];
  if (isWhitelisted(raw, i)) continue;
  const line = stripVarFallbacks(raw); // F) 剔除 var() 回退值后再扫描
  const found = [];
  const h = line.match(HEX);
  if (h) found.push(...h);
  const r = line.match(RGB);
  if (r) found.push(...r);
  // G) 主题中性色（纯黑/纯白 alpha）不算违规
  const real = [...new Set(found)].filter(v => !isNeutralColor(v));
  if (real.length) {
    violations.push({ line: i + 1, found: real });
  }
}

if (violations.length) {
  console.log(`FAIL: 发现 ${violations.length} 处硬编码颜色字面量`);
  for (const v of violations) {
    console.log(`  L${v.line}: ${v.found.join(", ")}`);
  }
  process.exit(1);
} else {
  console.log("PASS: 0 处非白名单硬编码颜色违规（允许的素材色、品牌色等仍保留）");
  process.exit(0);
}
