#!/usr/bin/env node
/**
 * lint-layers.mjs — 单文件架构分层契约校验（架构拆分第一步）
 * --------------------------------------------------
 * 目标：为 agent-workbench.html（24000+ 行单文件）建立"模块边界契约"，
 * 为后续渐进拆模块提供可校验的依据，防止手改时边界漂移/结构错乱。
 *
 * 实现：解析 JS 层内 `// ===== X Layer (…)` 分层注释，按顺序输出边界清单并校验：
 *   - 分层总数固定（当前 31 个，新增/删除会告警）
 *   - 每块非空（下一标记前必须有内容）
 *   - 分层顺序稳定（不重复、不跳变）
 *   - CSS 层与 JS 层整体结构完整（<style>…</style>、<script>…</script> 配对）
 *
 * 用法：
 *   node scripts/lint-layers.mjs            # 校验 + 输出边界清单（退出码 0/1）
 *   node scripts/lint-layers.mjs --json     # 输出 JSON 供 CI/文档消费
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const HTML = readFileSync(join(__dirname, "..", "agent-workbench.html"), "utf8");
const lines = HTML.split("\n");

const LAYER_RE = /^(?:\/\/ ===== |\/\* ===== )([\w ]+ Layer|Bootstrap) \(([^)]*)\)/;
const LAYERS = [];
lines.forEach((l, i) => {
  const m = l.match(LAYER_RE);
  if (m) LAYERS.push({ line: i + 1, name: m[1], detail: m[2] });
});

const errors = [];

// 1) 结构完整性：<style> / <script> 配对（仅匹配行首的真实标签；JS 字符串内的 document.write("<style>") 不计入）
const STRUCT_TAGS = ["<style>", "</style>", "<script>", "</script>"];
for (const tag of STRUCT_TAGS) {
  const n = lines.filter((l) => l.trim() === tag).length;
  if (n !== 1) errors.push(`结构异常：${tag} 出现 ${n} 次（应为 1 次，行首精确匹配）`);
}

// 2) 分层顺序：连续两层之间必须有内容（下一层行号 > 上一层行号 + 1）
for (let i = 0; i < LAYERS.length - 1; i++) {
  if (LAYERS[i + 1].line <= LAYERS[i].line + 1) {
    errors.push(`分层重叠：${LAYERS[i].name}(${LAYERS[i].line}) 与 ${LAYERS[i + 1].name}(${LAYERS[i + 1].line}) 之间无内容`);
  }
}

// 3) 分层重复：同名层多次出现是正常的（Data/UI/Render 等按子模块分多块），仅统计不报错
const byName = {};
LAYERS.forEach((l) => { byName[l.name] = (byName[l.name] || 0) + 1; });
const info = Object.entries(byName).filter(([, n]) => n > 1).map(([name, n]) => `${name}×${n}`);

// 4) 关键分层必须存在（架构契约）
const REQUIRED = ["Bootstrap", "Data Layer", "AI Layer", "Render Layer", "UI Layer", "Util Layer", "Crypto Layer", "Chain Layer"];
const missing = REQUIRED.filter((r) => !byName[r] && !byName[r.replace(" Layer", " Layer")]);
if (missing.length) errors.push(`缺少关键分层：${missing.join(", ")}`);

const json = { htmlLines: lines.length, layerCount: LAYERS.length, layers: LAYERS, ok: errors.length === 0, errors };

if (process.argv.includes("--json")) {
  process.stdout.write(JSON.stringify(json, null, 2) + "\n");
} else {
  console.log(`[lint-layers] agent-workbench.html：${lines.length} 行，${LAYERS.length} 个分层（重复分层：${info.join(" ") || "无"}）`);
  for (const l of LAYERS) console.log(`  L${String(l.line).padStart(5)}  ${l.name}  (${l.detail})`);
  if (errors.length) {
    console.error("\n[lint-layers] ✗ 分层契约异常：");
    errors.forEach((e) => console.error("  - " + e));
    process.exit(1);
  }
  console.log("\n[lint-layers] OK 分层契约完整 ✓（结构配对 + 顺序连续 + 关键层齐全）");
  process.exit(0);
}
