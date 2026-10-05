#!/usr/bin/env node
/**
 * lint-layers.mjs — 单文件架构分层契约校验（架构拆分第一步）
 * --------------------------------------------------
 * 目标：为 agent-workbench.html（24000+ 行单文件）建立"模块边界契约"，
 * 为后续渐进拆模块提供可校验的依据，防止手改时边界漂移/结构错乱。
 *
 * 实现：解析 JS 层内 `// ===== X Layer (…)` 分层注释，按顺序输出边界清单并校验：
 *   - 每块非空（下一标记前必须有内容）
 *   - 分层顺序稳定（不重复、不跳变）
 *   - CSS 层与 JS 层整体结构完整（<style>…</style>、<script>…</script> 配对）
 *   - 关键分层必须存在（架构契约）
 *   - 🔴 v3.7.70 补：**依赖方向校验**（逆层/循环/重复定义，与 module-graph 基线同源同心）
 *
 * 🔴 v3.7.70 补的方向校验（本脚本此前是「假守护」）：
 *   本脚本名为「分层契约校验」，旧版**只查结构配对与层是否存在，零依赖方向校验** ——
 *   真正守方向的是 module-graph 的基线棘轮，而它只拦新增、且扇出≥8 的共享符号不计边
 *   （新增逆层可隐形通过）。本脚本现补上方向校验，与 `module-graph.baseline.json` 比对：
 *     · 基线内既有项 → 只报告（历史耦合，不必然错误）
 *     · **基线外新增项 → 失败**
 *   判定逻辑复用 `scripts/lib/dep-graph.mjs`（与 module-graph.mjs 同一份），
 *   两份口径若漂移会立刻在比对中暴露。本脚本**只读不写盘**（module-graph --check 会写文档）。
 *
 * 用法：
 *   node scripts/lint-layers.mjs            # 校验 + 输出边界清单（退出码 0/1）
 *   node scripts/lint-layers.mjs --json     # 输出 JSON 供 CI/文档消费
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadBlocks, analyze } from "./lib/dep-graph.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const HTML = readFileSync(join(__dirname, "..", "agent-workbench.html"), "utf8");
const lines = HTML.split("\n");

const LAYER_RE = /^(?:\/\/ ===== |\/\* ===== )([\w ]+ Layer|Bootstrap) \(([^)]*)\)/;
const LAYERS = [];
lines.forEach((l, i) => {
  const m = l.match(LAYER_RE);
  if (m) LAYERS.push({ line: i + 1, name: m[1], detail: m[2] });
});

/* v3.7.70：双态寻源（项目铁律，见 README「解析型脚本的头号陷阱」）。
   分层注释住在**块内容**里，而源码态 HTML 的块内容已被抽到 src 目录、只剩
   SRC 占位标记 → 旧版直接跑本脚本会误报「缺少关键分层」
   （CI 靠 prelint:layers 先拼回才侥幸不红）。
   判据：HTML 含 SRC:BEGIN 标记即为源码态 → 从 src 目录下的 js 补齐分层注释。 */
const IS_SOURCE_STATE = /\/\*SRC:[\w-]+:BEGIN\*\//.test(HTML);
/* 源码态下每个 src 文件的行号都从 1 起算，跨文件不可直接比大小 →
   用「块序（order.json）× 大步长 + 文件内行号」构造全局可比的序号，
   否则「相邻层之间必须有内容」这条校验会因行号回退而误报。 */
const BLOCK_STRIDE = 1_000_000;
if (IS_SOURCE_STATE) {
  const SRC_DIR = join(__dirname, "..", "src");
  const ORDER_PATH = join(SRC_DIR, "order.json");
  let seq = new Map();
  if (existsSync(ORDER_PATH)) {
    try {
      const ord = JSON.parse(readFileSync(ORDER_PATH, "utf8"));
      ord.forEach((o, i) => seq.set(o.name + ".js", i + 1));
    } catch (e) { /* order.json 不可读时退化为按文件名字典序 */ }
  }
  if (existsSync(SRC_DIR)) {
    const files = readdirSync(SRC_DIR).filter(x => x.endsWith(".js"));
    files.sort((a, b) => (seq.get(a) || 999) - (seq.get(b) || 999) || a.localeCompare(b));
    files.forEach((f, fi) => {
      const blockIdx = seq.get(f) || (fi + 1);
      readFileSync(join(SRC_DIR, f), "utf8").split("\n").forEach((l, i) => {
        const m = l.match(LAYER_RE);
        if (m) LAYERS.push({ line: blockIdx * BLOCK_STRIDE + (i + 1), rawLine: i + 1, name: m[1], detail: m[2], from: f });
      });
    });
  }
  LAYERS.sort((a, b) => a.line - b.line);
}

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
const REQUIRED = ["Bootstrap", "Core Layer", "Data Layer", "AI Layer", "Render Layer", "UI Layer", "Util Layer", "Crypto Layer", "Chain Layer"];
/* v3.7.91：原写 `!byName[r] && !byName[r.replace(" Layer", " Layer")]` —— 第二个条件是
   **替换成自身的 no-op**（看不出差别），恒等于 `!byName[r]`，属复制粘贴残留的死代码。
   删掉它，语义不变、行为不变。 */
const missing = REQUIRED.filter((r) => !byName[r]);
if (missing.length) errors.push(`缺少关键分层：${missing.join(", ")}`);

/* ── 5) v3.7.70：依赖方向校验 ──────────────────────────────────────────
   与 scripts/module-graph.baseline.json 比对：基线内既有项只报告，**新增**项失败。
   （口径、去重、排序全部与 module-graph.mjs 一致 —— 共用 lib/dep-graph.mjs。） */
const BASELINE = join(__dirname, "module-graph.baseline.json");
/* v3.7.91：字段名原为 baseUpward / baseCycles，但赋的是 `cur.upward.length`（**当前实测值**），
   不是基线内既有项数 —— 输出里还写着「（基线内既有 → 仅报告）」，把当前总数当成了基线数，
   新增发生时这行数字含新增项却标着「既有」，会把人带偏。改名为 cur*，并在输出里
   显式给出「基线内既有」= 当前 − 新增，两者都可见。 */
const depInfo = { checked: false, addedUpward: [], addedCycles: [], addedDup: [], curUpward: 0, curCycles: 0, baseUpward: 0, baseCycles: 0 };
if (existsSync(join(__dirname, "..", "src", "order.json"))) {
  const cur = analyze(loadBlocks());
  depInfo.checked = true;
  depInfo.curUpward = cur.upward.length;
  depInfo.curCycles = cur.cycles.length;
  depInfo.shared = cur.shared.length;
  const base = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, "utf8")) : { duplicates: [], cycles: [], upward: [] };
  depInfo.addedUpward = cur.upward.filter(x => !base.upward.includes(x));
  depInfo.addedCycles = cur.cycles.filter(x => !base.cycles.includes(x));
  depInfo.addedDup = cur.duplicates.filter(x => !base.duplicates.includes(x));
  depInfo.baseUpward = depInfo.curUpward - depInfo.addedUpward.length;
  depInfo.baseCycles = depInfo.curCycles - depInfo.addedCycles.length;
  if (depInfo.addedUpward.length) {
    errors.push(`新增逆层依赖 ${depInfo.addedUpward.length} 条（低层用高层符号）：${depInfo.addedUpward.slice(0, 6).join(", ")}${depInfo.addedUpward.length > 6 ? " …" : ""}`);
  }
  if (depInfo.addedCycles.length) {
    errors.push(`新增循环依赖 ${depInfo.addedCycles.length} 条：${depInfo.addedCycles.slice(0, 4).join(" | ")}${depInfo.addedCycles.length > 4 ? " …" : ""}`);
  }
  if (depInfo.addedDup.length) {
    errors.push(`新增跨块重复定义 ${depInfo.addedDup.length} 处：${depInfo.addedDup.slice(0, 6).join(", ")}`);
  }
}

const json = { htmlLines: lines.length, layerCount: LAYERS.length, layers: LAYERS, ok: errors.length === 0, errors };

if (process.argv.includes("--json")) {
  process.stdout.write(JSON.stringify(json, null, 2) + "\n");
} else {
  console.log(`[lint-layers] agent-workbench.html：${lines.length} 行，${LAYERS.length} 个分层（重复分层：${info.join(" ") || "无"}）`);
  for (const l of LAYERS) {
    const loc = l.from ? `${l.from}:${l.rawLine}` : `L${String(l.line).padStart(5)}`;
    console.log(`  ${loc.padEnd(28)}  ${l.name}  (${l.detail})`);
  }
  if (depInfo.checked) {
    console.log(`[lint-layers] 依赖方向：当前 逆层 ${depInfo.curUpward} 条 / 循环 ${depInfo.curCycles} 条 / 共享符号豁免 ${depInfo.shared} 个`);
    console.log(`[lint-layers] 其中基线内既有：逆层 ${depInfo.baseUpward} 条 / 循环 ${depInfo.baseCycles} 条（仅报告，不失败）`);
    console.log(`[lint-layers] 基线外新增：逆层 ${depInfo.addedUpward.length} · 循环 ${depInfo.addedCycles.length} · 重复定义 ${depInfo.addedDup.length}（新增 → 失败）`);
  }
  if (errors.length) {
    console.error("\n[lint-layers] ✗ 分层契约异常：");
    errors.forEach((e) => console.error("  - " + e));
    process.exit(1);
  }
  console.log("\n[lint-layers] OK 分层契约完整 ✓（结构配对 + 顺序连续 + 关键层齐全 + 依赖方向无新增）");
  process.exit(0);
}
