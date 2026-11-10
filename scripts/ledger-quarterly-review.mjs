#!/usr/bin/env node
/**
 * ledger-quarterly-review.mjs —— 季度台账只读复核脚本（2026-11-10 新增）
 * ----------------------------------------------------------------------------
 * 出处：`docs/demand-ledger.md`「规范」节的季度 mandate（五项应报出）+
 *       「门禁」条：**不给台账装 CI 判定器**（#109 教训：仓内无工具解析
 *       CHANGELOG，装了只会复刻 v3.7.155 双红）。本脚本据此设计成
 *       **独立、只读、报告式**：
 *         · 只读 —— 绝不写台账任何字节（与「只追加 + 就地关闭」纪律正交）；
 *         · 不进 CI —— 不入 lint 链、不入 verify:ci、不做任何 job 的判定器；
 *         · 退出码恒 0（仅脚本自身出错才非 0）——有意不做门禁，出报告给人看。
 *
 * 五项报出（mandate 原文）：
 *   ① `DONE` 但无 commit；
 *   ② `OPEN` / `DOING` 超 30 天未更新「最后复核」；
 *   ③ `BLOCKED` 缺「谁能解」；
 *   ④ `USER-ACTION` 挂超 60 天（该催或该裁 `CUT`）；
 *   ⑤ 别名指向已删除文件（实现为：行内一切文件形引用解析不到磁盘文件）。
 *
 * 「最后复核」信号定义（如实记账）：行内可解析的最新日期
 * （ISO `YYYY-MM-DD` 或 `M-D`；ID 格戳优先语义同义——取最大即可，
 * 因为关单/翻面时刻必晚于行内其他日期）。行内无任何日期 → 列入
 * 「数据质量」节，**不**按超龄判（无信号不能定罪）。
 *
 * 已知口径限制（勿当缺陷报）：
 *   · 只扫表格行；「复核与收口」等散文不参与（仓外母稿引用在那里，天然排除）；
 *   · `_probe/*` 为 gitignore 探查面，存在性不作判据，单独注明；
 *   · 白名单 `EXCLUDED_FILES` 载明不判的引用及理由（无理由的白名单＝放水）。
 *
 * 用法：
 *   node scripts/ledger-quarterly-review.mjs [台账路径]
 *     默认 `docs/demand-ledger.md`；可传任意副本路径（自证注入用，不碰真账）。
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LEDGER = process.argv[2]
  ? resolve(process.cwd(), process.argv[2])
  : join(ROOT, 'docs', 'demand-ledger.md');

const DAY = 86400000;
const STALE_OPEN_DAYS = 30;   // ② OPEN/DOING 超 30 天未复核
const STALE_USERACTION_DAYS = 60; // ④ USER-ACTION 挂超 60 天

/* 不判的引用（必须附理由 —— 无理由的白名单就是放水） */
const EXCLUDED_FILES = new Map([
  ['three-mode-spec-and-demand-ledger.md', '仓外执行母稿（规范节「复核与收口」明载「仓外」）'],
  ['error-context.md', 'CI 失败工件下载物（`gh run download` 产物，非仓内文件）'],
  ['server/config.json', '用户待建配置（DL-B02 判据本身；仓内仅 config.example.json 模板）'],
  ['config.json', '用户本机/服务端本地配置（gitignore 面，DL-O01/DL-B02 语境），非仓内引用'],
]);
const SKIP_PREFIXES = ['_probe/', 'tmp/']; // gitignore 探查面 + /tmp 临时证据面，存在性不作判据

/* ---------------- 解析 ---------------- */

/** 按未转义 `|` 切行；`\|` 还原为文字管道 */
function splitRow(line) {
  const inner = line.replace(/^\|/, '').replace(/\|$/, '');
  const cells = [];
  let buf = '';
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch === '\\' && inner[i + 1] === '|') { buf += '|'; i++; continue; }
    if (ch === '|') { cells.push(buf.trim()); buf = ''; continue; }
    buf += ch;
  }
  cells.push(buf.trim());
  return cells;
}

function parseLedger(text) {
  const sections = [];
  let cur = null;
  let expectHeader = false;
  text.split('\n').forEach((raw, idx) => {
    const lineNo = idx + 1;
    const h = /^##\s+([A-E])\s*·/.exec(raw);
    if (h) {
      cur = { key: h[1], name: raw.replace(/^##\s+/, ''), rows: [] };
      sections.push(cur);
      expectHeader = false;
      return;
    }
    if (!cur || !raw.startsWith('|')) return;
    const cells = splitRow(raw);
    if (cells.every((c) => /^:?-+:?$/.test(c))) return; // 分隔行
    if (cells[0] === 'ID') { expectHeader = false; return; } // 列名行
    if (!cells[0]) return;
    cur.rows.push({ id: cells[0], cells, lineNo });
  });
  return sections;
}

/* ---------------- 信号提取 ---------------- */

const ISO_RE = /(\d{4})-(\d{2})-(\d{2})/g;
const MD_RE = /(?<![\d:.\-–—])(0?[1-9]|1[0-2])[-/.](0?[1-9]|[12]\d|3[01])(?![\d\-–—])/g;

function rowDates(cellsText) {
  const now = new Date();
  const dates = [];
  let m;
  ISO_RE.lastIndex = 0;
  while ((m = ISO_RE.exec(cellsText))) {
    dates.push(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  }
  MD_RE.lastIndex = 0;
  while ((m = MD_RE.exec(cellsText))) {
    let year = now.getFullYear();
    const d = new Date(year, Number(m[1]) - 1, Number(m[2]));
    if (d > now) year -= 1; // 未来日期＝去年 rollover
    dates.push(new Date(year, Number(m[1]) - 1, Number(m[2])));
  }
  return dates;
}

const HASH_BACKTICK_RE = /`([0-9a-f]{7,40})`/g;

/* 本地日期显示（toISOString 会把 UTC+8 的零点前一天化，年龄计算不受影响但报告会骗人） */
function fmtDate(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
const HASH_BARE_RE = /(?<![\w.:`\-–—])([0-9a-f]{7,40})(?![\w`\-–—])/g;

function rowHasCommit(cellsText) {
  HASH_BACKTICK_RE.lastIndex = 0;
  if (HASH_BACKTICK_RE.test(cellsText)) return true;
  HASH_BARE_RE.lastIndex = 0;
  return HASH_BARE_RE.test(cellsText);
}

/* 文件形引用：扩展名长的在前（否则 `config.json` 会被 `js` 截成 `config.js`）；
   token 必须以字母数字开头（`*.test.js` 这类 glob 不产生匹配） */
const RAW_FILE_RE = /(?<![\w.\-])(?:[\w.\-]+\/)*[\w\-]*[A-Za-z0-9][\w.\-]*\.(?:json|mjs|cjs|js|md|html|css|ya?ml|toml)/g;

function rowFileRefs(cellsText) {
  const noUrl = cellsText.replace(/https?:\/\/[^\s|]+/g, '');
  const out = new Set();
  RAW_FILE_RE.lastIndex = 0;
  let m;
  while ((m = RAW_FILE_RE.exec(noUrl))) {
    let t = m[0];
    t = t.replace(/[:,\s].*$/, '').replace(/§.*$/, ''); // 去行号/锚点/逗号尾
    t = t.replace(/^`+|`+$/g, '');
    if (t) out.add(t);
  }
  return [...out];
}

function fileExists(ref) {
  if (EXCLUDED_FILES.has(ref)) return { excluded: true };
  if (SKIP_PREFIXES.some((p) => ref.startsWith(p))) return { probe: true };
  const dirs = ['', 'docs/', 'docs/decisions/', 'tests/', 'tests/e2e/', 'scripts/', 'scripts/lib/', 'src/', 'server/src/', 'electron/', '.github/', '.github/workflows/'];
  for (const d of dirs) {
    if (existsSync(join(ROOT, d + ref))) return { found: true };
  }
  return { found: false };
}

/* ---------------- 五项检查 ---------------- */

function run(ledgerText) {
  const sections = parseLedger(ledgerText);
  const findings = { c1: [], c2: [], c3: [], c4: [], c5: [] };
  const noDate = [];
  const probeRefs = new Set();

  const rowText = (r) => r.cells.join(' | ');

  for (const s of sections) {
    for (const r of s.rows) {
      const text = rowText(r);
      const where = `${s.name.split(' ')[0]} 段 :${r.lineNo} ${r.id}`;
      const idCell = r.id;

      /* ① DONE 但无 commit：A 段全体 + B 段 DONE/SIMULATED 戳 + C 段状态 DONE */
      const isDoneA = s.key === 'A';
      const isDoneB = s.key === 'B' && /DONE|SIMULATED/.test(idCell);
      const isDoneC = s.key === 'C' && /DONE/.test(r.cells[2] ?? '');
      if ((isDoneA || isDoneB || isDoneC) && !rowHasCommit(text)) {
        findings.c1.push(`${where} —— DONE 行内无任何 commit hash（来源/判据整行扫）`);
      }

      /* ② OPEN/DOING 超 30 天未复核：B 段未盖 DONE/SIMULATED 的行 */
      if (s.key === 'B' && !/DONE|SIMULATED/.test(idCell)) {
        const dates = rowDates(text);
        if (!dates.length) noDate.push(`${where} —— 行内无任何日期，「最后复核」无信号`);
        else {
          const newest = new Date(Math.max(...dates));
          const age = Math.floor((Date.now() - newest.getTime()) / DAY);
          if (age > STALE_OPEN_DAYS) {
            findings.c2.push(`${where} —— 最后复核信号 ${fmtDate(newest)}，已 ${age} 天（> ${STALE_OPEN_DAYS}）`);
          }
        }
      }

      /* ③ BLOCKED 缺「谁能解」：C 段状态含 BLOCKED 且第 4 格空/— */
      if (s.key === 'C' && /BLOCKED/.test(r.cells[2] ?? '')) {
        const owner = (r.cells[3] ?? '').trim();
        if (!owner || owner === '—' || owner === '-') {
          findings.c3.push(`${where} —— 状态 BLOCKED 但「谁能解 / 缺什么」格为空`);
        }
      }

      /* ④ USER-ACTION 挂超 60 天：C 段状态 USER-ACTION */
      if (s.key === 'C' && /USER-ACTION/.test(r.cells[2] ?? '')) {
        const dates = rowDates(text);
        if (!dates.length) noDate.push(`${where} —— USER-ACTION 行无挂账日期，无法判龄（建议补挂账日）`);
        else {
          const newest = new Date(Math.max(...dates));
          const age = Math.floor((Date.now() - newest.getTime()) / DAY);
          if (age > STALE_USERACTION_DAYS) {
            findings.c4.push(`${where} —— USER-ACTION 挂账信号 ${fmtDate(newest)}，已 ${age} 天（> ${STALE_USERACTION_DAYS}）——该催或该裁 CUT`);
          }
        }
      }

      /* ⑤ 别名/出处指向已删除文件：全表行扫文件形引用 */
      for (const ref of rowFileRefs(text)) {
        const st = fileExists(ref);
        if (st.excluded) continue;
        if (st.probe) { probeRefs.add(ref); continue; }
        if (!st.found) findings.c5.push(`${where} —— 引用文件 \`${ref}\` 在仓内任何解析位都不存在`);
      }
    }
  }
  return { sections, findings, noDate, probeRefs };
}

/* ---------------- 报告 ---------------- */

function report(ledgerPath) {
  const text = readFileSync(ledgerPath, 'utf8');
  const { sections, findings, noDate, probeRefs } = run(text);
  const totalRows = sections.reduce((n, s) => n + s.rows.length, 0);

  const out = [];
  out.push('== 季度台账只读复核报告 ==');
  out.push(`台账: ${ledgerPath}`);
  out.push(`段落: ${sections.map((s) => s.key).join(' / ')}（共 ${sections.length} 段 / ${totalRows} 行）`);
  out.push('口径: 只读 · 不进 CI · 退出码恒 0；「最后复核」＝行内最新日期信号；无日期行不定罪、列数据质量节');
  out.push('');

  const label = [
    ['c1', '① DONE 但无 commit'],
    ['c2', `② OPEN/DOING 超 ${STALE_OPEN_DAYS} 天未复核`],
    ['c3', '③ BLOCKED 缺「谁能解」'],
    ['c4', `④ USER-ACTION 挂超 ${STALE_USERACTION_DAYS} 天`],
    ['c5', '⑤ 引用指向已删除/不存在文件'],
  ];
  let total = 0;
  for (const [k, name] of label) {
    const list = findings[k];
    total += list.length;
    out.push(`${name}：${list.length} 处`);
    for (const f of list) out.push('  · ' + f);
  }
  out.push('');
  out.push(`数据质量（无日期信号，不定罪）：${noDate.length} 行`);
  for (const n of noDate) out.push('  · ' + n);
  if (probeRefs.size) {
    out.push(`忽略目录（${SKIP_PREFIXES.join(' ')}，gitignore 探查面，存在性不判）：${probeRefs.size} 条引用`);
  }
  const excluded = [...EXCLUDED_FILES.keys()].map((k) => `\`${k}\`（${EXCLUDED_FILES.get(k)}）`);
  out.push(`引用白名单（不判）：${excluded.join('；')}`);
  out.push('');
  out.push(total === 0 ? '结果：五项 mandate 零命中（本次只读报告，未改任何字节）' : `结果：共 ${total} 处待人工复核（本报告只读，处置权在人）`);
  console.log(out.join('\n'));
}

try {
  if (!existsSync(LEDGER)) {
    console.error(`[ledger-quarterly-review] 台账不存在: ${LEDGER}`);
    process.exit(2);
  }
  report(LEDGER);
  process.exit(0); // 报告式工具：发现不转退出码（刻意不做门禁）
} catch (e) {
  console.error('[ledger-quarterly-review] 脚本自身出错:', e && e.message);
  process.exit(1);
}
