#!/usr/bin/env node
/**
 * lint-xss.mjs —— 未消毒 innerHTML 门禁
 * ----------------------------------------------------------------------------
 * 背景（2026-09-27 审计）：本项目的 XSS 防线是自研的 `sanitizeHtml`
 * （`src/util-markdown.js`，非 DOMPurify），全仓约 225 处 `innerHTML`。
 * 应用内**本来就有**一条 `xss_risk` 规则（`src/ui-global-events.js` 的 dev-tools 面板里），
 * 但它只是给用户看的提示，**从未接入构建期**（`scripts/*.mjs` 0 命中）。
 * 结果是：`_dgmSvgHtml` 那条「id/color 直接拼进属性、调用点没过 sanitizeHtml」的注入
 * 能长期存在，只靠人眼守 —— 而它已经被证明可经「导入 JSON 备份 / 云同步快照」写入任意值。
 *
 * 本脚本把这件事变成构建期硬门禁。
 *
 * 判定规则（刻意保守，只拦「看起来真的会把外部数据拼进 HTML」的写法）：
 *   · 目标：`.innerHTML =` / `.outerHTML =` 赋值，以及 `.insertAdjacentHTML(pos, html)`（v3.7.91 补）
 *   · 放过：右侧是空串字面量（`= ""`，清空元素）、或右侧含 `sanitizeHtml` / `esc(`
 *   · 拦下：右侧含插值（模板 `${…}` 或字符串拼接 `+` 且不是纯字面量拼接）
 *   · 豁免：该行或上一行带 `lint-xss-ok:` 注释（必须写明理由）
 *
 * 用法：
 *   node scripts/lint-xss.mjs            # 只报告，exit 0
 *   node scripts/lint-xss.mjs --check    # 有违规即 exit 1（CI 用）
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const SRC = join(root, "src");
const CHECK = process.argv.includes("--check");

/** 从 `pos` 起取出这条赋值语句的右侧文本（到深度 0 的分号 / 换行收尾） */
function readRhs(text, pos) {
  let i = pos, depth = 0, out = "";
  let inS = "", inT = "", inC = "";
  for (; i < text.length; i++) {
    const c = text[i], n = text[i + 1];
    if (inC) { out += c; if (c === "\n") inC = ""; continue; }
    if (inS) { out += c; if (c === "\\") { out += n || ""; i++; continue; } if (c === inS) inS = ""; continue; }
    if (inT) { out += c; if (c === "\\") { out += n || ""; i++; continue; } if (c === inT) inT = ""; continue; }
    if (c === "/" && n === "/") { inC = "//"; out += c; continue; }
    if (c === '"' || c === "'") { inS = c; out += c; continue; }
    if (c === "`") { inT = c; out += c; continue; }
    if ("([{".includes(c)) depth++;
    if (")]}".includes(c)) depth--;
    if (c === ";" && depth <= 0) break;
    if (c === "\n" && depth <= 0) {
      // 无分号换行收尾：若已积累出实质内容则停（避免把下一行吞进来）
      if (out.trim() && !/[+\-*/%=&|?,:.(]$/.test(out.trim())) break;
    }
    out += c;
  }
  return out;
}

/** 纯字面量拼接？（全部由字符串/数字/布尔字面量与 + 组成 → 无外部数据） */
function isLiteralOnly(rhs) {
  const stripped = rhs.replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/'(?:[^'\\]|\\.)*'/g, "''");
  return !/[A-Za-z_$][\w$]*/.test(stripped.replace(/\btrue\b|\bfalse\b|\bnull\b|\bundefined\b/g, ""));
}

/** 把 `t("key","默认值")` 整段替换成字面量 —— 字典值属可信内容，不应算作外部插值 */
function stripI18n(rhs) {
  let out = rhs, prev;
  do {
    prev = out;
    out = out.replace(/\bt\(\s*"(?:[^"\\]|\\.)*"\s*(?:,\s*"(?:[^"\\]|\\.)*"\s*)?\)/g, '""');
  } while (out !== prev);
  return out;
}

/**
 * 收集「本文件里被赋值为 sanitizeHtml(...) / esc(...) 结果的标识符」。
 * 这类变量在赋值点已经消毒，后续 `x.innerHTML = thatVar` 是安全的。
 * 这是**启发式**：同名变量若在别处被赋成未消毒内容会漏判，但相比「所有间接引用都报」，
 * 它把噪声从十几处降到个位数，门禁才可能被真正执行（否则处处豁免 = 没有门禁）。
 *
 * v3.7.91 修一处**已被实测复现的漏判**：本函数只看 `const x = sanitizeHtml(...)` 的
 * 首次赋值，不追后续覆写。于是
 *     let safeHtml = sanitizeHtml("<i>x</i>");
 *     safeHtml = evil;            // 覆写成未消毒内容
 *     el.innerHTML = safeHtml;    // 门禁放过（因 safeHtml 在 names 里）→ 漏报
 * 复现方式：把上面三行追加进任一 src 文件，`--check` 仍 exit 0（修前实测）。
 * 现补一条：**任何非声明式重新赋值**（`x = ...`，排除 `x == / === / >=` 等比较）
 * 都从 names 中移除 —— 覆写后不再可信。当前生产代码零实例（已全仓扫描确认），
 * 属防未来回归的硬化，不改变今日判定结果。
 */
function sanitizedNames(text) {
  const names = new Set();
  /* 注意用 `\b(sanitizeHtml|esc)\b` 而不是要求紧跟 `(`：
     形如 `const safeHtml = (opts.sanitize || sanitizeHtml)(html)` 里，
     消毒函数是**被引用后调用**的，紧跟的是 `)`。 */
  const re = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*[^;\n]*?\b(sanitizeHtml|esc)\b/g;
  let m;
  while ((m = re.exec(text)) !== null) names.add(m[1]);
  if (!names.size) return names;
  /* 逐名检查是否在声明之外被重新赋值。用「声明语句之外出现 `x =`」判定，
     并排除 `=>`（箭头）、`==`/`===`/`!=`/`!==`/`<=`/`>=`（比较）与对象字面量键（`{x: ...}` 不匹配 `=`）。 */
  for (const n of [...names]) {
    const esc = n.replace(/[$]/g, "\\$");
    const reassign = new RegExp(
      "(?:^|[^\\w$.])" + esc + "\\s*=(?!=|>)",
      "gm"
    );
    const decl = new RegExp("(?:const|let|var)\\s+" + esc + "\\s*=(?!=|>)", "g");
    const total = (text.match(reassign) || []).length;
    const declCount = (text.match(decl) || []).length;
    if (total > declCount) names.delete(n); // 有声明之外的赋值 → 不再可信
  }
  return names;
}

const files = readdirSync(SRC).filter((f) => f.endsWith(".js"));
const offenders = [];
const skipped = [];

for (const f of files) {
  const text = readFileSync(join(SRC, f), "utf8");
  const lines = text.split("\n");
  const safeNames = sanitizedNames(text);
  /* v3.7.91：原只扫 `.innerHTML =` / `.outerHTML =`。补上 `insertAdjacentHTML(pos, html)`
     —— 它把字符串**按 HTML 解析**，XSS 面与 innerHTML 完全相同，却不在门禁视野里
     （全仓 11 处，其中 10 处在 src/；本仓是「约定式安全」：渲染函数由调用方负责包
     sanitizeHtml，缺了这一道就没有第二层兜底）。
     判定沿用同一套：取第二个实参为 rhs，同样放过 sanitizeHtml/esc/纯字面量/已消毒变量。
     R-36（2026-10-25 射程审计）：探针实测本门禁原来**只覆盖 10 类 HTML 注入 sink 中的 2 类** ——
     名字叫"未消毒 innerHTML 门禁"，实际 `innerHTML +=` / `outerHTML +=` / `.srcdoc =` /
     `document.write(` 全都从正则底下走过去。三处一起补：
       ① `\+?=` —— `x.innerHTML += dirty` 与 `x.innerHTML = dirty` 的注入面**完全相同**
          （都是把字符串按 HTML 解析后写进 DOM），却因为正则写死 `=` 而整类漏扫。
          `+=` 还更隐蔽：它看起来像"只是追加一点"，审查时最容易被打扫过去。
       ② `\.srcdoc =` —— iframe 的整份文档入口，注入面与 innerHTML 等价且**作用域是整篇文档**。
         全仓 1 处（render-scene-main.js 的实时预览），此前靠作者自觉加 lint-xss-ok。
       ③ `document.write(` —— 同样是"按 HTML 解析写入"。全仓 13 处，全在 ui-ge-theme.js
         的报表打印（往新窗口写）。此前**没有任何门禁看得见它**。
     判定沿用同一套 rhs 逻辑：sanitizeHtml/esc/纯字面量/已消毒变量一律放过，
     剩下必须显式 `lint-xss-ok:` 豁免并写理由 —— 门禁的价值正是"逼人把理由写下来"。
     仍未覆盖（写明上限，不假装全能）：`a.href=` / `style.cssText=` / `new Function(` / `eval` /
     `globalThis` 前缀 / 取别名后再调用。前者在本仓均为 0 处且 `style.cssText` 会误伤大量合法的
     字面量 CSS 赋值；后三类静态不可判（见 tests/danger-confirm.test.js 的同一条上限说明）。 */
  const re = /\.(inner|outer)HTML\s*\+?=\s*|\.insertAdjacentHTML\s*\(\s*[^,)]*,\s*|\.srcdoc\s*\+?=\s*|\bdocument\s*\.\s*write\s*\(\s*|setAttribute\s*\(\s*["']on[a-zA-Z]*["']\s*,\s*/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const rhsStart = m.index + m[0].length;
    const rhs = readRhs(text, rhsStart);
    const lineNo = text.slice(0, m.index).split("\n").length;
    const cur = lines[lineNo - 1] || "";
    const prev = lines[lineNo - 2] || "";
    const hasExempt = /lint-xss-ok:/.test(cur) || /lint-xss-ok:/.test(prev);

    const trimmed = rhs.trim();
    if (trimmed === "" || /^["']{2}$/.test(trimmed)) continue;            // 清空元素
    if (/sanitizeHtml\s*\(/.test(rhs)) continue;                           // 已消毒
    if (/\besc\s*\(/.test(rhs)) continue;                                  // 已逐项转义
    const noI18n = stripI18n(rhs);
    if (isLiteralOnly(noI18n)) continue;                                   // 纯字面量（含仅 t(...) 插值）
    // 右侧出现的标识符是否全都来自 sanitizeHtml/esc 的赋值
    const ids = [...new Set((noI18n.match(/[A-Za-z_$][\w$]*/g) || []))]
      .filter((x) => !/^(true|false|null|undefined|String|Number|Boolean|Array|Object)$/.test(x));
    if (ids.length && ids.every((x) => safeNames.has(x))) continue;         // 全部来自已消毒变量
    if (hasExempt) { skipped.push(`${f}:${lineNo}`); continue; }

    offenders.push({
      file: f,
      line: lineNo,
      rhs: trimmed.replace(/\s+/g, " ").slice(0, 110),
    });
  }
}

console.log(`[lint-xss] 扫描 src/ ${files.length} 个文件`);
if (skipped.length) console.log(`[lint-xss] 显式豁免 ${skipped.length} 处：${skipped.join(", ")}`);
if (!offenders.length) {
  console.log("[lint-xss] ✓ 未发现未消毒的动态 innerHTML 赋值");
  process.exit(0);
}

console.log(`\n[lint-xss] ${offenders.length} 处疑似未消毒的动态 innerHTML：`);
for (const o of offenders) {
  console.log(`  src/${o.file}:${o.line}`);
  console.log(`      ${o.rhs}`);
}
console.log("\n  修法：用 sanitizeHtml(...) 包裹，或对插值逐项 esc()；");
console.log("  确认安全（如纯内部常量）时在该行或上一行加注释 `lint-xss-ok: <理由>`。");

if (CHECK) {
  console.error(`\n[lint-xss] check ✗ ${offenders.length} 处未消毒 innerHTML`);
  process.exit(1);
}
process.exit(0);
