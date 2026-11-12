/* bindings-scan.mjs —— data-action 绑定覆盖门禁的判定层（形态 A B2，功能设计 §2）
 * ---------------------------------------------------------------------------
 * 为什么有它：形态 A 新增控件统一走 data-action + FORM_A_ACTIONS 委托表。
 * 控件写在 HTML 骨架 / 由 src 动态发射（tab 条就是 JS 渲染的）， handler 挂在
 * ui-global-events.js 的表里 —— 三处散落，漏一边就是「死控件」（点了没反应）
 * 或「死 handler」（表里有键、无控件发射，纯假覆盖）。本模块做**双向包含**：
 *   ① HTML ∪ src 发射的 action 名 ⊆ FORM_A_ACTIONS 键集（无缺 handler）
 *   ② FORM_A_ACTIONS 键集 ⊆ HTML ∪ src 发射的 action 名（无死 handler）
 * 缺一边即红。
 *
 * 纯函数，不碰文件系统 —— 窄变异自证（删一个 handler / 去一个发射）由单元测试
 * 直接喂字符串完成，同 icon-scan 的进程内判定层口径。
 */

const ACTION_ATTR_RE = /data-action=(?:"([^"]+)"|'([^']+)')/g;

/** 从单份源码文本提取 data-action 用量（HTML 骨架与 src 发射并同一口径）
 * @param {string} srcText
 * @param {string} fileName 仅用于报告定位
 * @returns {{action: string, line: number, file: string}[]} */
export function scanActionsInSource(srcText, fileName) {
  const out = [];
  const lines = String(srcText).split("\n");
  lines.forEach(function(lineText, i) {
    ACTION_ATTR_RE.lastIndex = 0;
    let m;
    while((m = ACTION_ATTR_RE.exec(lineText)) !== null){
      out.push({ action: m[1] || m[2], line: i + 1, file: fileName });
    }
  });
  return out;
}

/** 解析 FORM_A_ACTIONS 表的键集（ui-global-events.js 里的 const 表定义）
 * @param {string} srcText
 * @returns {string[]} */
export function parseFormAActions(srcText) {
  const text = String(srcText);
  const block = text.match(/const\s+FORM_A_ACTIONS\s*=\s*\{([\s\S]*?)\n\};/);
  if(!block) return [];
  const keys = [];
  block[1].split("\n").forEach(function(lineText) {
    const km = lineText.match(/^\s*([A-Za-z_$][\w$]*)\s*:/);
    if(km) keys.push(km[1]);
  });
  return keys;
}

/** 双向包含校验
 * @param {object} p
 * @param {{action:string}[]} p.used  HTML ∪ src 发射的 action（去重前均可）
 * @param {string[]} p.handlers  FORM_A_ACTIONS 键集
 * @returns {{ok:boolean, union:string[], missingHandler:string[], deadHandler:string[]}}
 *   missingHandler = 发射了却没 handler（死控件）；deadHandler = 有 handler 却没人发射（死键） */
export function checkBindings(p) {
  const used = (p && p.used) || [];
  const handlers = (p && p.handlers) || [];
  const unionSet = {};
  used.forEach(function(u){ unionSet[u.action] = true; });
  const union = Object.keys(unionSet).sort();
  const handlerSet = {};
  handlers.forEach(function(h){ handlerSet[h] = true; });
  const missingHandler = union.filter(function(a){ return !handlerSet[a]; });
  const deadHandler = handlers.filter(function(h){ return !unionSet[h]; }).sort();
  return {
    ok: missingHandler.length === 0 && deadHandler.length === 0,
    union: union,
    missingHandler: missingHandler,
    deadHandler: deadHandler
  };
}
