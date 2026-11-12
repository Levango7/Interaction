#!/usr/bin/env node
/**
 * lint-bindings.mjs —— data-action 绑定覆盖门禁（形态 A B2，功能设计 docs/ui-form-a-functional.md §2）
 * ---------------------------------------------------------------------------
 * 形态 A 新增控件一律走 data-action + FORM_A_ACTIONS 委托表（src/ui-global-events.js）。
 * 控件有两个家：HTML 骨架（静态钮如 ＋ / 右栏把手）与 src 动态发射（tab 条由
 * render-entry.js 渲染，faTabSwitch/faTabClose 是 JS 拼进 innerHTML 的）。本门禁扫
 * **两处并集** ⇄ handler 键集，双向包含：
 *   ① 发射了没 handler ⇒ 死控件（点了没反应）→ 红
 *   ② handler 没人发射   ⇒ 死键（表里有、界面没有，纯假覆盖）→ 红
 *
 * ⚠️ 偏离披露：功能设计 §2 字面只扫 agent-workbench.html；tab 条是 JS 动态渲染的，
 *    只扫 HTML 会把 faTabSwitch/faTabClose 误判成「死 handler」⇒ 扫描面取 HTML ∪ src。
 *    判定层在 scripts/lib/bindings-scan.mjs（单元测试直接喂字符串，同 icon-scan 口径）。
 *
 * 用法：
 *   node scripts/lint-bindings.mjs               # 检查：双向包含不齐即红
 *   node scripts/lint-bindings.mjs --scan <路径> # 单文件排查（测试/临时取证用）
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanActionsInSource, parseFormAActions, checkBindings } from './lib/bindings-scan.mjs';

const _dir = dirname(fileURLToPath(import.meta.url));
const _root = join(_dir, '..');
const HTML = join(_root, 'agent-workbench.html');
const SRC_DIR = join(_root, 'src');
const EVENTS = join(SRC_DIR, 'ui-global-events.js');

const _scanIdx = process.argv.indexOf('--scan');
const SCAN = _scanIdx > -1 ? process.argv[_scanIdx + 1] : null;

const used = [];
if (SCAN) {
  used.push(...scanActionsInSource(readFileSync(SCAN, 'utf8'), basename(SCAN)));
} else {
  used.push(...scanActionsInSource(readFileSync(HTML, 'utf8'), 'agent-workbench.html'));
  for (const f of readdirSync(SRC_DIR).filter((x) => x.endsWith('.js')).sort()) {
    used.push(...scanActionsInSource(readFileSync(join(SRC_DIR, f), 'utf8'), 'src/' + f));
  }
}
const handlers = parseFormAActions(readFileSync(EVENTS, 'utf8'));
const r = checkBindings({ used: used, handlers: handlers });

console.log('[lint-bindings] data-action 覆盖：发射并集 ' + r.union.length + ' 个 ⇄ FORM_A_ACTIONS ' + handlers.length + ' 键');
console.log('  发射并集: ' + (r.union.join(' ') || '（无）'));
console.log('  handler : ' + (handlers.join(' ') || '（无）'));

if (!r.ok) {
  if (r.missingHandler.length) {
    console.error('[lint-bindings] FAIL：发射了 data-action 但 FORM_A_ACTIONS 里没有 handler（死控件，点之无反应）：');
    r.missingHandler.forEach(function(a) {
      const hit = used.filter(function(u) { return u.action === a; });
      hit.forEach(function(h) { console.error('  ' + h.file + ':' + h.line + '  ' + a); });
    });
  }
  if (r.deadHandler.length) {
    console.error('[lint-bindings] FAIL：FORM_A_ACTIONS 里有键但全仓没有控件发射它（死 handler / 假覆盖）：');
    r.deadHandler.forEach(function(a) { console.error('  ' + a); });
  }
  console.error('  修法：控件侧删掉错名 / handler 侧补键（或删死键）；两边集合必须完全一致。');
  process.exit(1);
}
console.log('[lint-bindings] OK：发射并集与 handler 键集双向包含（' + r.union.length + ' == ' + handlers.length + '）');
