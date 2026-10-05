#!/usr/bin/env node
/**
 * prod-guards.mjs —— prod 构建的「转换 + 转换后自检」（纯函数，不写盘）
 * --------------------------------------------------
 * 供两处复用：
 *   · scripts/build.mjs --prod —— 生成 agent-workbench.prod.html / service-worker.prod.js
 *   · tests/prod-guards.test.js —— 进程内直测（不依赖子进程，见该测试头注释）
 *
 * 背景（审计 P2-4）：`build:prod` 此前只做「存在性」检查（RE.test）就替换落盘 ——
 *   ① __TEST_GATE__ 的 RE 是非贪心 `[\s\S]*?\}\)\(\);`，命中的是**第一个** `})();`。
 *      若将来 IIFE 块体内出现更早的 `})();`（嵌套函数表达式 / 字符串），替换会截断块体，
 *      在产物里留下悬挂的 `})();` 尾巴 —— 整段 <script> 变成语法错误，
 *      而构建步骤**照样绿**（坏的是 3.7MB 里的几字节，肉眼与门禁都照不到）。
 *      同类事故形态在本仓已有先例：v3.7.65 用 try/catch 包裹的 onerror 消息里
 *      带出半个 `</script>` 字样就会截断；以及 v3.7.64 的字节口径坑（String.length 冒充 bytes）。
 *   ② SW 的 CACHE_VERSION 替换同样只查存在性：若文件里出现第二处定义，
 *      replace() 只换第一个，第二个会覆盖回旧值 → 缓存不失效（静默退化）。
 *
 * 本模块的定位：**把「转换后必须自检」固化成断言**，任何一处不满足即抛错，
 *   由 build.mjs 转成 fail() 拒绝落盘 —— 宁可构建红，不产可疑产物。
 */
import vm from 'node:vm';

/* ---------------------------------------------------------------------------
 * ① __TEST_GATE__ 硬置 false
 * ------------------------------------------------------------------------- */
/** 与 v3.7.6 起的构建口径**逐字一致**（RE 与替换串改动会改变产物字节，进而改变发布指纹） */
const GATE_RE = /var __TEST_GATE__ = \(function\(\)\{[\s\S]*?\}\)\(\);/;
const GATE_PROD = 'var __TEST_GATE__ = false; /* [prod build] test hooks disabled */';

/**
 * 把 __TEST_GATE__ 的 IIFE 计算硬置为 false（块体保留为死代码，不做有风险的物理剥离）。
 * @param {string} html 已注入的真相源
 * @returns {string} prodHtml
 * @throws 定义数 ≠ 1 / 替换后仍可匹配 / false 标记数 ≠ 1
 */
export function transformTestGate(html) {
  const defs = html.match(new RegExp(GATE_RE.source, 'g')) || [];
  if (defs.length !== 1) {
    throw new Error(`__TEST_GATE__ 定义数应为 1，实际 ${defs.length}（无法安全生成生产构建）`);
  }
  const out = html.replace(GATE_RE, GATE_PROD);
  // 替换后不得再匹配：若仍匹配，说明 RE 的 `[\s\S]*?` 截断在了块体内部（坏形态见文件头 ①）
  if (GATE_RE.test(out)) {
    throw new Error('替换后仍能匹配到 __TEST_GATE__ IIFE —— RE 截断（块体内出现更早的 `})();`？），拒绝落盘');
  }
  const falseCount = (out.match(/var __TEST_GATE__ = false;/g) || []).length;
  if (falseCount !== 1) {
    throw new Error(`替换后 “__TEST_GATE__ = false” 出现 ${falseCount} 次（应为 1）`);
  }
  return out;
}

/* ---------------------------------------------------------------------------
 * ② 真实 <script> 块抽取 + 整体编译自检
 * ------------------------------------------------------------------------- */
/**
 * 按**浏览器语义**扫描真实 <script> 块。
 *
 * ⚠️ 不能用 lastIndexOf("<script") 之类的朴素截取：本产物 HTML 里 `<script` 字样共出现 6 次，
 * 其中 **5 次是应用 JS 内的字符串字面量**，只有 1 次是真标签（实测）。
 * 朴素截取会抽到字符串中间，得到一坨必然编译失败/假通过的"代码"（审计取证时首版即踩此坑）。
 *
 * 浏览器语义：进入 <script> 后即为「script data」状态，内部一切文本（含 `<script` 字样）
 * 都是代码，直到**第一个** `</script` 结束标签；转义写法 `<\/script>` 不构成结束
 * （本函数与浏览器在这一点上判定一致，因为 `</` 要求 `<` 后紧跟 `/`）。
 *
 * @param {string} html
 * @returns {Array<{kind:'js'|'other'|'external', tag:string, code:string, start:number, end:number}>}
 *   kind=js 的块可/应编译；external=带 src（正文为空）；other=非 JS 类型（如 JSON-LD）。
 */
export function findScriptBlocks(html) {
  const CLASSIC_JS = /^(?:text\/javascript|application\/javascript|text\/ecmascript|application\/ecmascript)$/i;
  const blocks = [];
  const tagRe = /<\/?script\b[^>]*>/gi;
  let m;
  let open = null; // { tag, start }
  while ((m = tagRe.exec(html)) !== null) {
    const tag = m[0];
    if (!tag.startsWith('</')) {
      // 已在块内再遇 <script：按浏览器语义属于脚本文本，忽略（这正是 5 处字符串字面量的形态）
      if (open === null) open = { tag, start: m.index + tag.length };
      continue;
    }
    if (open !== null) {
      const attrs = open.tag;
      const typeM = attrs.match(/\btype\s*=\s*["']([^"']*)["']/i);
      const kind = /\bsrc\s*=/i.test(attrs) ? 'external'
        : (!typeM || typeM[1].trim() === '' || CLASSIC_JS.test(typeM[1].trim())) ? 'js'
        : 'other';
      blocks.push({ kind, tag: attrs, code: html.slice(open.start, m.index), start: open.start, end: m.index });
      open = null;
    }
    // 无配对 open 的 </script> 按文本处理（与浏览器一致）
  }
  return blocks;
}

/**
 * 把代码当经典脚本整体编译（vm.Script）—— 这是唯一能抓住「RE 截断留下悬挂尾巴」类
 * 静默损坏的检查：产物字节看不出异常，门禁（体积/标记）也照不到，只有解析器会拒绝。
 * @throws 语法错误（message 带块标签，指向具体是哪一段坏了）
 */
export function assertScriptParses(code, label = '<script>') {
  try {
    new vm.Script(code, { filename: `prod-guards:${label}` });
  } catch (e) {
    throw new Error(`${label} 编译失败（产物已损坏，拒绝落盘）：${e && e.message}`);
  }
}

/**
 * 抽取全部真实 <script> 块并编译其中的 JS 块。
 * @returns {{blocks:number, checked:number, bytes:number}}
 * @throws 无真实 <script> 块 / 无内联 JS 块可校验 / 任一 JS 块编译失败
 */
export function assertScriptsParse(html, label = 'html') {
  const blocks = findScriptBlocks(html);
  if (blocks.length === 0) {
    throw new Error(`${label}: 未找到任何真实 <script> 块（浏览器语义扫描）——HTML 未注入或结构损坏？`);
  }
  const js = blocks.filter((b) => b.kind === 'js');
  if (js.length === 0) {
    throw new Error(`${label}: 无内联 JS 块可校验（存在 ${blocks.length} 个块但均非 JS 类型）`);
  }
  for (const b of js) assertScriptParses(b.code, `${label} ${b.tag}`);
  return { blocks: blocks.length, checked: js.length, bytes: js.reduce((n, b) => n + b.code.length, 0) };
}

/* ---------------------------------------------------------------------------
 * ③ service-worker 缓存版本 bump
 * ------------------------------------------------------------------------- */
const SW_RE = /var CACHE_VERSION = "[^"]*";/;

/**
 * 生成 service-worker.prod.js 正文：CACHE_VERSION → `v{appVer}-{ts}`。
 * 产出的版本全局唯一 → SW activate 必然清旧缓存（根治"改了 HTML 但 PWA 用户看旧版"）。
 * @param {string} swText service-worker.js（开发基线）正文
 * @param {string} appVer 应用版本（如 3.7.93）
 * @param {string} ts UTC 时间戳 yyyyMMddHHmmss（调用方生成，便于测试注入）
 * @returns {{code:string, cacheVer:string}}
 * @throws 定义数 ≠ 1（第二处定义会让 replace 只换第一处、旧值覆盖回来）/ 入参形态不合法 / 替换后自检失败
 */
export function bumpServiceWorker(swText, appVer, ts) {
  if (!appVer) throw new Error('应用版本为空，无法生成 CACHE_VERSION');
  if (!/^\d{14}$/.test(ts)) throw new Error(`时间戳格式应为 yyyyMMddHHmmss（14 位数字），实际 "${ts}"`);
  const defs = swText.match(new RegExp(SW_RE.source, 'g')) || [];
  if (defs.length !== 1) {
    throw new Error(`service-worker 中 CACHE_VERSION 定义数应为 1，实际 ${defs.length}（多定义会让缓存失效被静默绕过）`);
  }
  const cacheVer = `v${appVer}-${ts}`;
  const code = swText.replace(SW_RE, `var CACHE_VERSION = "${cacheVer}"; /* [prod build] auto-bumped */`);
  const after = code.match(new RegExp(SW_RE.source, 'g')) || [];
  if (after.length !== 1 || after[0] !== `var CACHE_VERSION = "${cacheVer}";`) {
    throw new Error(`替换后自检失败：CACHE_VERSION 定义数 ${after.length}，值 ${after[0] || '(缺失)'}`);
  }
  return { code, cacheVer };
}
