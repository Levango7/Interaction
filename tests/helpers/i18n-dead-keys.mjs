/**
 * i18n-dead-keys.mjs —— 「字典里有、全仓零引用」的纯函数层（R-36，2026-10-25）
 * ----------------------------------------------------------------------------
 * 分工同 scripts/lib/empty-catch.mjs：**判定在这里**，测试与 freeze 脚本共用，
 * 避免"测试算一套、基线冻另一套"（第一版就因为这个对不上：测试把基线 JSON 自身
 * 当成消费者，417 个基线键全被判成"活着"，fresh 反而变成 483）。
 *
 * 三条口径：
 *   ① 死键 = 字典 zh 块里有、全仓零引用（`t("key"` / `data-i18n="key"` 等形态）。
 *   ② 动态拼接豁免：`t("tool.cat." + id)` 无法静态判定，祖先前缀命中即整族跳过。
 *   ③ 字典副本不是消费者：任何含 `const MESSAGES = {` 的文件一律排除
 *      （`src/core-i18n.js` 自身、以及 Electron 构建产物 `electron/agent-workbench.html`）。
 *      本文件自身与基线 JSON 也要排除 —— 基线里存的就是全部死键的键名，
 *      不排除等于把死键全判成活的。
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const _dir = dirname(fileURLToPath(import.meta.url));
const root = join(_dir, "..", "..");
const DICT_REL = "src/core-i18n.js";
/** 参与"是否被引用"判定的文件：源码 / 交付 HTML / SW / electron / 测试 / 脚本 / 服务端 */
const SCAN_DIRS = ["src", "electron", "tests", "scripts", "server"];

function collect(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) collect(p, out);
    else if (/\.(js|mjs|cjs|html|json)$/.test(e.name)) out.push(p);
  }
  return out;
}

/** 字典 zh 块的键集合（结构边界切法，与大括号计数不同 —— 值里含花括号会带偏） */
export function zhKeys() {
  const src = readFileSync(join(root, DICT_REL), "utf8");
  const marker = "\n  zh: {";
  const start = src.indexOf(marker);
  if (start < 0) throw new Error("未找到 MESSAGES.zh 块");
  const bodyStart = start + marker.length;
  const end = src.indexOf("\n  },\n  en: {", bodyStart);
  if (end < 0) throw new Error("未找到 MESSAGES.zh 块结尾");
  return [...src.slice(bodyStart, end).matchAll(/^\s{4}"([A-Za-z0-9_.]+)":/gm)].map((m) => m[1]);
}

/** 自身与基线：它们是"死键名单"而不是消费者，必须排除 */
const SELF_FILES = new Set([
  join(_dir, "i18n-dead-keys.mjs"),
  join(_dir, "i18n-dead-keys.test.js"),
  join(root, "tests", "i18n-dead-keys.baseline.json"),
]);

/* ---------- 双态陷阱（2026-10-25 实测，第一版就踩了） ----------
 * `agent-workbench.html` 有**两种形态**：源码态（~590KB，SRC 块只剩标记占位）与
 * 注入态（~3.6MB，含全部 src 代码 + 整份 MESSAGES 字典）。`npm test` 由 with-injected
 * 包装 ⇒ 测试看到的是**注入态**；而 `node scripts/freeze-*.mjs` 平时在源码态跑。
 * 若把整个 HTML 丢进语料：
 *   · 注入态下它含 `const MESSAGES = {` ⇒ 被"字典副本"规则整份排除 ⇒
 *     骨架里那 495 个 `data-i18n="key"` 一起不算数 ⇒ 死键从 417 涨到 858；
 *   · 源码态下它不含字典 ⇒ 整份进语料 ⇒ 死键 417。
 * ⇒ **同一个门禁，换一种树形就换一个结论**，CI（注入态）与本机（源码态）互相打脸。
 * 两条修法都试过，问题记在这里别再走：
 *   ① 只取 `data-i18n*` 属性值 —— 树形无关，但会漏掉骨架内联 <script> 里的 `t("key")`；
 *   ② 剥 SRC 标记取骨架 —— 走不通：实测 `core-i18n` 块在注入态**没有** SRC 标记
 *      （74 个标记 = 37 对，而 src/ 有 38 个文件），字典漏在剥不掉的残片里。
 * 最终修法：③ 剥掉**字典区段本身**（`const MESSAGES = {` 到 `\n  }\n};`），其余全留。
 *   字典区段在两种形态下都能被同一条规则定位并剥掉；剩下的内容两种形态等价
 *   （注入态多出来的正是 src 代码，而 src/ 早已在语料里，重复计入无害）。 */
function htmlSkeleton() {
  const p = join(root, "agent-workbench.html");
  if (!existsSync(p)) return "";
  let t = readFileSync(p, "utf8");
  const d = t.indexOf("const MESSAGES = {");
  if (d >= 0) {
    const end = t.indexOf("\n  }\n};", d);
    if (end > d) t = t.slice(0, d) + t.slice(end + 6);
  }
  return t;
}

/**
 * @returns {{total:number, dead:string[], dynPrefixes:string[], corpusFiles:number}}
 */
export function computeDeadKeys() {
  const keys = zhKeys();
  const files = [
    ...collect(join(root, "src")).filter((p) => p !== join(root, DICT_REL)),
    join(root, "service-worker.js"),
    ...SCAN_DIRS.flatMap((d) => collect(join(root, d))),
  ].filter((p) => existsSync(p) && !SELF_FILES.has(p));

  const corpus = files
    .map((p) => ({ p, t: readFileSync(p, "utf8") }))
    .filter((x) => !x.t.includes("const MESSAGES = {"))
    .map((x) => x.t)
    .join("\n") + "\n" + htmlSkeleton();

  const dynPrefixes = [...new Set(
    [...corpus.matchAll(/t\(\s*["']([A-Za-z0-9_.]+)["']\s*\+/g)].map((m) => m[1])
  )];
  const isDynExempt = (key) => {
    const parts = key.split(".");
    for (let i = 1; i < parts.length; i++) {
      if (dynPrefixes.includes(parts.slice(0, i).join("."))) return true;
    }
    return false;
  };

  const dead = keys.filter((k) => !corpus.includes(`"${k}"`) && !isDynExempt(k));
  return { total: keys.length, dead, dynPrefixes, corpusFiles: files.length };
}
