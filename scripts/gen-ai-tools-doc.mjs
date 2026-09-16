#!/usr/bin/env node
/**
 * gen-ai-tools-doc.mjs — 从源码 TOOLS 重新生成 docs/ai-tools.md 的「总览表 + 逐项定义」
 * --------------------------------------------------
 * 动机：docs/ai-tools.md 是 AI 工具（function-calling）的接口文档，属「源码的镜像」。
 *   曾经只写了 16 个工具、而源码已演进到 26 个（缺 10 个），人工维护必然漂移。
 *   这里从 `const TOOLS = [...]` 直接生成，保证文档与源码一致（**以源码为唯一权威**）。
 *
 * 用法：
 *   node scripts/gen-ai-tools-doc.mjs          # 生成/更新 docs/ai-tools.md
 *   node scripts/gen-ai-tools-doc.mjs --check  # 只校验：文档记录的工具集与源码是否完全一致
 *
 * 解析口径：
 *   · 名称/描述：`{type:"function", function:{name, description:t("i18n键","中文兜底")}}` → 取中文兜底
 *   · 参数：`parameters.properties` 的每个键（type / items / enum）+ `required`
 *   · 分发器：execTool 或 agentExec（后者为 Agent 记忆/目标系列）
 */
import fs from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const html = fs.readFileSync(join(root, 'agent-workbench.html'), 'utf8');
const docPath = join(root, 'docs', 'ai-tools.md');
let doc = fs.readFileSync(docPath, 'utf8');

function blockEnd(s, start) {
  let d = 0, inS = 0, q = '';
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inS) { if (c === '\\') { i++; continue; } if (c === q) inS = 0; continue; }
    if (c === '"' || c === "'" || c === '`') { inS = 1; q = c; continue; }
    if (c === '{') d++; else if (c === '}') { d--; if (d === 0) return i; }
  }
  return -1;
}
/* 取 i18n 兜底中文：description:t("k","中文") 或 description:"中文" */
function pickText(seg) {
  let m = /description:\s*t\(\s*"[^"]*"\s*,\s*"((?:[^"\\]|\\.)*)"\s*\)/.exec(seg);
  if (m) return m[1];
  m = /description:\s*"((?:[^"\\]|\\.)*)"/.exec(seg);
  return m ? m[1] : '';
}

const toolsStart = html.indexOf('const TOOLS = [');
const region = html.slice(toolsStart, html.indexOf('\n];', toolsStart));

const tools = [];
let cursor = 0;
while (true) {
  const m = /function:\s*\{\s*name:\s*"([a-z_]+)"/.exec(region.slice(cursor));
  if (!m) break;
  const at = cursor + m.index;
  const objStart = region.lastIndexOf('{', at);
  const objEnd = blockEnd(region, objStart);
  const obj = region.slice(objStart, objEnd + 1);
  const name = m[1];
  const desc = pickText(obj);
  /* parameters.properties 里的键 */
  const params = [];
  const pStart = obj.indexOf('properties:{');
  if (pStart >= 0) {
    const pb = obj.indexOf('{', pStart);
    const pe = blockEnd(obj, pb);
    const propsText = obj.slice(pb + 1, pe);
    let pi = 0;
    while (true) {
      const pm = /([a-z_]+)\s*:\s*\{/.exec(propsText.slice(pi));
      if (!pm) break;
      const key = pm[1];
      const oStart = pi + pm.index + pm[0].length - 1;
      const oEnd = blockEnd(propsText, oStart);
      const spec = propsText.slice(oStart, oEnd + 1);
      const type = (/type:\s*"([a-z]+)"/.exec(spec) || [])[1] || '?';
      const items = (/items:\s*\{[^}]*type:\s*"([a-z]+)"/.exec(spec) || [])[1];
      const enumM = /enum:\s*(\[[^\]]*\]|[A-Za-z_][\w.]*)/.exec(spec);
      let ty = type + (items ? '<' + items + '>' : '');
      if (enumM) ty += ', enum: ' + enumM[1].replace(/\s+/g, '');
      params.push({ key, ty, desc: pickText(spec) });
      pi = oEnd + 1;
    }
  }
  const reqM = /required:\s*(\[[^\]]*\])/.exec(obj);
  tools.push({ name, desc, params, required: reqM ? reqM[1].replace(/\s+/g, '') : '[]' });
  cursor = objEnd + 1;
}
console.log('解析到工具 ' + tools.length + ' 个');
if (tools.length < 5) { console.error('[abort] 解析结果异常，未写入'); process.exit(1); }

const agentExecSet = new Set(['remember', 'recall', 'forget', 'plan', 'complete_step', 'complete_goal', 'list_records']);
const reqText = r => (r === '[]' ? '—' : '`' + r.replace(/[[\]"]/g, '').replace(/,/g, '`,`') + '`');
const table = [
  '| # | 工具名 | 所属分发器 | 必填参数 | 说明 |',
  '|---|--------|-----------|----------|------|',
  ...tools.map((t, i) => '| ' + (i + 1) + ' | `' + t.name + '` | ' + (agentExecSet.has(t.name) ? 'agentExec' : 'execTool') + ' | ' + reqText(t.required) + ' | ' + t.desc.replace(/\|/g, '\\|').slice(0, 44) + ' |'),
].join('\n');

const sections = tools.map((t, i) => {
  const lines = ['### 3.' + (i + 1) + ' `' + t.name + '`', '', '- **描述**：' + (t.desc || '（源码未提供）'), '- **参数**：'];
  if (t.params.length) for (const p of t.params) lines.push('  - `' + p.key + '` `{' + p.ty + '}` — ' + (p.desc || '（无说明）'));
  else lines.push('  - （无参数）');
  lines.push('- **必填**：`' + t.required + '`', '');
  return lines.join('\n');
}).join('\n');

doc = doc.replace(/适用版本：`VERSION = "[^"]*"`/, '适用版本：`VERSION = "3.6.4"`');
doc = doc.replace(/最后核对：\d{4}-\d{2}-\d{2}/, '最后核对：2026-09-16');
doc = doc.replace(/工具总数：[0-9]+/, '工具总数：' + tools.length);

const tableStart = doc.indexOf('| # | 工具名 | 所属分发器');
if (tableStart < 0) { console.error('[abort] 未找到总览表'); process.exit(1); }
{
  const rest = doc.slice(tableStart).split('\n');
  let n = 0;
  while (n < rest.length && rest[n].startsWith('|')) n++;
  doc = doc.slice(0, tableStart) + table + '\n' + rest.slice(n).join('\n');
}
const h3 = doc.indexOf('## 3. 工具逐项定义');
const h4 = doc.indexOf('## 4.', h3);
if (h3 < 0 || h4 < 0) { console.error('[abort] 未找到第 3/4 节边界'); process.exit(1); }
const head = '## 3. 工具逐项定义\n\n> 本节由脚本从源码 `const TOOLS` 生成（描述取 `description` 的中文兜底，参数取 `parameters.properties` + `required`）；\n> **以源码为唯一权威**，改动 TOOLS 后请重新生成，不要手改本节。\n\n';
doc = doc.slice(0, h3) + head + sections + '\n' + doc.slice(h4);
fs.writeFileSync(docPath, doc, 'utf8');
console.log('已写入：总览表 ' + tools.length + ' 行 + 逐项 ' + tools.length + ' 节');


/* ---------- --check：只校验文档工具集与源码一致 ---------- */
if (process.argv.includes('--check')) {
  const inDoc = [...fs.readFileSync(docPath, 'utf8').matchAll(/^###\s+[\d.]+\s+`([a-z_]+)`/gm)].map(m => m[1]);
  const missing = tools.map(t => t.name).filter(n => !inDoc.includes(n));
  const stale = inDoc.filter(n => !tools.some(t => t.name === n));
  console.log(`[ai-tools-doc] 源码 ${tools.length} 个 / 文档 ${inDoc.length} 个`);
  if (missing.length) console.log('  ✗ 文档缺：' + missing.join(', '));
  if (stale.length) console.log('  ✗ 文档多（源码已无）：' + stale.join(', '));
  console.log(missing.length || stale.length ? '[ai-tools-doc] check 失败' : '[ai-tools-doc] check ✓ 一致');
  process.exit(missing.length || stale.length ? 1 : 0);
}
