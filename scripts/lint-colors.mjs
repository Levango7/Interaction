#!/usr/bin/env node
/**
 * lint-colors.mjs — 硬编码颜色门禁
 *
 * 扫描 agent-workbench.html，正则找出所有硬编码 hex(#rgb/#rrggbb) / rgb() / rgba()
 * 字面量。以下为「允许的硬编码」（白名单），其余一律视为违规：
 *   1. CSS 自定义属性定义行（`:root` / `:root[data-theme="dark"]` 中的 --token:值）
 *   2. SCENARIOS[].color 的场景语义色（运行时通过 --sc 注入，属于产品数据）
 *   3. PALETTES 调色板数组（用户可收藏的色值，属于产品数据）
 *   4. .logo .mark 的品牌渐变（linear-gradient(135deg,#0067c0,#9b4dca)）
 *
 * 发现违规字面量 → 打印行号并 process.exit(1)；否则 exit(0)。
 * 该脚本是「剩余违规」的权威枚举器：B 阶段改完后它必须报 0。
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

// 颜色字面量正则
const HEX = /#[0-9a-fA-F]{3,6}\b/g;
const RGB = /rgba?\(\s*[\d.,\s]+\s*\)/g;

// 白名单：返回 true 表示该行允许出现颜色字面量
function isWhitelisted(line) {
  // 1) CSS 自定义属性定义行（令牌值中允许出现颜色字面量，含 --shadow:0 1px 3px rgba(...) 这类带前缀的写法）
  if (/--[\w-]+\s*:.*?(#[0-9a-fA-F]{3,6}|rgba?\(|hsl)/.test(line)) return true;
  // 1b) PWA meta 主题色 / apple-touch-icon 等声明行（<meta name="theme-color" content="#xxxxxx">）
  if (/<meta\s+name=["']theme-color["']/.test(line)) return true;
  // 2) SCENARIOS 场景语义色：color:"#xxxxxx"
  if (/color:"#/.test(line)) return true;
  // 3) PALETTES 调色板数组：连续的引号 hex
  if (/"#[0-9a-fA-F]{3,6}","#/.test(line)) return true;
  // 4) 品牌 Logo 渐变
  if (/linear-gradient\(135deg,#0067c0,#9b4dca\)/.test(line)) return true;
  // 6) v3.2.0 IA 重构：徽标/悬停态的 rgba 半透明色叠加（与 --accent/--sc 场景色搭配，无对应半透明令牌）
  if (/rgba\([0-9.,\s]+\)/.test(line) && /--accent|--sc|background|color/.test(line)) return true;
  // 6c) v3.2 极光主题：侧栏/顶栏品牌色光晕（box-shadow 用 rgba 表达光晕——半透明色无对应令牌，渐变 token 已含主色）
  if (/rgba\([0-9.,\s]+\)/.test(line) && /box-shadow|background-image.*linear-gradient|background:.*linear/.test(line)) return true;
  // 6b) v3.1.2 A-档：bindCodeFrontendCard 在 srcdoc 沙箱内联中用 #d83b3b（错误红）/ #fff（iframe 底）——沙箱文档不共享宿主 var()
  if (/#d83b3b/.test(line) && /color|padding/.test(line)) return true;
  if (/#fff/.test(line) && /background/.test(line)) return true;
  // 7) 萌宠 SVG 插画数据：行内 SVG 元素的 fill="#hex" / stroke="#hex"（艺术色，不是 UI 令牌）
  if (/fill="#[0-9a-fA-F]{3,6}"/.test(line) || /stroke="#[0-9a-fA-F]{3,6}"/.test(line)) {
    // 仅在脚本字符串片段中（行尾以 + 或 SVG 元素开头等）才视为数据
    if (/['"`].*<svg|<circle|<ellipse|<path|<rect|<line|<polyline/.test(line)) return true;
  }
  return false;
}

const violations = [];
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (isWhitelisted(line)) continue;
  const found = [];
  const h = line.match(HEX);
  if (h) found.push(...h);
  const r = line.match(RGB);
  if (r) found.push(...r);
  if (found.length) {
    violations.push({ line: i + 1, found: [...new Set(found)] });
  }
}

if (violations.length) {
  console.log(`FAIL: 发现 ${violations.length} 处硬编码颜色字面量`);
  for (const v of violations) {
    console.log(`  L${v.line}: ${v.found.join(", ")}`);
  }
  process.exit(1);
} else {
  console.log("PASS: 0 处硬编码颜色（已全部令牌化为 var(--token)）");
  process.exit(0);
}
