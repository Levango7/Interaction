#!/usr/bin/env node
/**
 * src-split.mjs — 把单文件里的「分层源块」外置到 src/，构建期再拼回单文件
 * --------------------------------------------------
 * 背景（任务 4 · 模块化第一步）：`agent-workbench.html` 曾是 2.3MB 单文件，分层契约
 * （`scripts/lint-layers.mjs` + `docs/architecture-layers.md`）把 JS 划成 8 大层、35 块
 * （v3.7.63：原 28 块，其中 369KB 的「全局事件绑定」按 section 拆成 8 块 → 28+7=35）。
 * 本脚本把这些层块抽到 `src/<name>.js`，让代码可以用编辑器/工具单独处理；
 * 交付物仍是**单个 HTML**（file:// 直开 / PWA 离线 / Electron 打包都不变）。
 *
 * 与 build.mjs 的「不做 src→HTML 字节拼接」定稿不冲突：那条讲的是**不把 HTML 拆成运行时多个
 * <script src>**（file:// 下会失败）。这里只是「源码可编辑性」的构建期回填，产物与手写单文件等价。
 *
 * 用法：
 *   node scripts/src-split.mjs --extract    # HTML → src/*.js（按层），HTML 内留标记占位
 *   node scripts/src-split.mjs              # 默认：src/*.js → HTML（幂等）
 *   node scripts/src-split.mjs --check      # 只校验：src 与 HTML 两侧一致
 *
 * 标记：每个外置块在 HTML 里是「BEGIN 标记行 + 内容 + END 标记行」三行结构
 *   （标记字面量只在本文件的 mk()/mkEnd() 里构造，注释中不写完整标记，避免提前闭合块注释）
 *   （占位态时中间为空）
 *
 * 安全约定（踩过的坑，务必遵守）：
 *   ① 抽取前会把 HTML 备份到 _srcbackup/；
 *   ② 拼回只允许改 SRC 标记之间的区间：写盘前把两侧的标记区折叠，再对「非标记骨架」逐字符
 *      比对，不同就报错退出、不写盘；
 *   ③ 抽取在跳过分支沿用 order.json 里记录的 tailBlanks（不再归零）；实测值与旧记录不一致时
 *      告警并按实测值修正（HTML 是抽取方向的事实源）；
 *   ④ 每个块的 BEGIN/END 标记必须全文件唯一；重复（历史嵌套）即硬失败；
 *   ⑤ 解析出的块数少于预期时 abort，不写盘（防止把文件写空）。
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const HTML = join(root, 'agent-workbench.html');
const SRC_DIR = join(root, 'src');
const BACKUP_DIR = join(root, '_srcbackup');

/* 可外置的层块：以「层注释行」为起止边界（含注释行本身），保证 lint-layers 的分层契约在拼回后不变 */
const BLOCKS = [
  /* v3.7.9：核心层 —— 全局助手与基础数据。摆在最前：它必须零外部依赖，且被上层普遍引用 */
  { name: 'core', layer: 'Core', title: '核心层·全局助手与基础数据' },
  { name: 'util-markdown', layer: 'Util', title: 'Markdown 解析·T3.5' },
  { name: 'util-perf', layer: 'Util', title: '性能优化工具·v1.4-B' },
  { name: 'crypto', layer: 'Crypto', title: '加密层' },
  /* 任务 4 第二步：Data Layer 四块（标题必须与源码里的层注释逐字一致，用于定位块边界） */
  { name: 'data-idb', layer: 'Data', title: '数据层·IndexedDB 持久镜像' },
  { name: 'data-links', layer: 'Data', title: '数据层·联动规则与全局状态' },
  { name: 'data-migrate', layer: 'Data', title: '数据层·迁移与初始化' },
  { name: 'data-rw', layer: 'Data', title: '数据层·读写' },
  /* 任务 4 第三步：Chain Layer（联动层·任务完成与跨场景触发，约 34KB，耦合最低） */
  { name: 'chain', layer: 'Chain', title: '联动层·任务完成与跨场景触发' },
  /* 任务 4 第四步：AI Layer 三块（合计约 214KB：工具调用 / 对话循环 / 取消重试） */
  { name: 'ai-tools', layer: 'AI', title: 'AI 层·工具调用' },
  { name: 'ai-loop', layer: 'AI', title: 'AI 层·对话循环' },
  { name: 'ai-retry', layer: 'AI', title: 'AI 层·取消/重试控制器' },
  /* 任务 4 第五步：Render Layer 五块（合计约 1,422KB：入口 / 场景细分 / 场景主区 / 概览 / 小工具） */
  { name: 'render-entry', layer: 'Render', title: '渲染层·入口' },
  { name: 'render-scene-sub', layer: 'Render', title: '渲染层·场景细分模块' },
  { name: 'render-scene-main', layer: 'Render', title: '渲染层·场景主区' },
  { name: 'render-overview', layer: 'Render', title: '渲染层·概览' },
  { name: 'render-widgets', layer: 'Render', title: '渲染层·小工具' },
  /* 任务 4 第六步：UI Layer 十一块（合计约 618KB，含最大的「全局事件绑定」369KB） */
  { name: 'ui-theme', layer: 'UI', title: '交互层·主题与通知' },
  { name: 'ui-onboarding', layer: 'UI', title: '交互层·Onboarding 引导' },
  { name: 'ui-guide', layer: 'UI', title: '交互层·使用指南' },
  { name: 'ui-scene-bind', layer: 'UI', title: '交互层·场景绑定' },
  { name: 'ui-palette', layer: 'UI', title: '交互层·命令面板' },
  { name: 'ui-daily', layer: 'UI', title: '交互层·每日播报' },
  { name: 'ui-backup-stats', layer: 'UI', title: '交互层·备份与统计' },
  { name: 'ui-drawer', layer: 'UI', title: '交互层·设置抽屉' },
  { name: 'ui-hotkeys', layer: 'UI', title: '交互层·快捷键' },
  { name: 'ui-select', layer: 'UI', title: '交互层·自研下拉选择框' },
  { name: 'ui-global-events', layer: 'UI', title: '交互层·全局事件绑定' },
  /* v3.7.63：把「全局事件绑定」（8566 行 / 376KB，原全仓最大块）按 section 拆成 8 块。
     第 1 块沿用原名与原标题；7 个新块的标题 = 源码里新插入的层注释行文本（逐字一致用于定位）。
     7 个切点均经 espree 机械审计：行首、AST 深度 0（最内层节点为 Program）、不在任何 token/注释内部。 */
  { name: 'ui-ge-api', layer: 'UI', title: '交互层·全局事件绑定·后端 API 客户端' },
  { name: 'ui-ge-plugins', layer: 'UI', title: '交互层·全局事件绑定·插件系统' },
  { name: 'ui-ge-theme', layer: 'UI', title: '交互层·全局事件绑定·主题/报表/AI 引擎' },
  { name: 'ui-ge-pomodoro', layer: 'UI', title: '交互层·全局事件绑定·专注与时间追踪' },
  { name: 'ui-ge-calendar', layer: 'UI', title: '交互层·全局事件绑定·日历与可视化' },
  { name: 'ui-ge-notes', layer: 'UI', title: '交互层·全局事件绑定·笔记与知识库' },
  { name: 'ui-ge-integrations', layer: 'UI', title: '交互层·全局事件绑定·集成框架与废弃簇' }
];
const MIN_EXPECTED = 35;   // v3.7.26 引入（28）→ v3.7.63 拆块后 35：至少应解析出这么多块，否则判定解析失败

const EXTRACT = process.argv.includes('--extract');
const CHECK = process.argv.includes('--check');
/* v3.7.58：--no-backup 供 posttest 自动还原使用 —— 自动化路径高频触发，不为每次
   还原都留 3MB 整页快照（人工排查时的 --extract 仍默认备份）。 */
const NO_BACKUP = process.argv.includes('--no-backup');
const mk = n => '/*SRC:' + n + ':BEGIN*/';
const mkEnd = n => '/*SRC:' + n + ':END*/';

let html = readFileSync(HTML, 'utf8');
const lines = html.split('\n');

/* ---------- 工具：找到某个层标记行的下标 ---------- */
function findLayerLine(layer, title) {
  const needle = '// ===== ' + layer + ' Layer';
  const out = [];
  lines.forEach((l, i) => {
    if (l.startsWith(needle) && (!title || l.includes(title))) out.push(i);
  });
  return out;
}
/* 该层块的结束 = 下一个「层注释行」或「已抽出的 SRC 占位标记行」之前。
   必须把 SRC 标记行也算边界：否则当内层块已被抽出（只剩标记）时，外层块的边界扫描会越过这些标记，
   把标记连同外层内容一起搬进 src —— 表现为「抽出 N 块但 HTML 里只有 M 组标记」（本次实测踩到）。 */
function blockEndIdx(startIdx) {
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (/^\/\/ ===== \w+ Layer/.test(lines[i])) return i;
    if (/^\/\*SRC:[\w-]+:(BEGIN|END)\*\//.test(lines[i])) return i;
    /* 块不得越过 </script>：文件最后一个层块后面是文档收尾标签（</script></body></html>），
       不设这条边界会把它们一起搬进 src，拼回后 END 标记会落到 HTML 之外（本轮实测踩到）。 */
    if (/^<\/script>/.test(lines[i])) return i;
  }
  return lines.length;
}

/* ---------- --extract ---------- */
if (EXTRACT) {
  if (!NO_BACKUP) {
    mkdirSync(BACKUP_DIR, { recursive: true });
    writeFileSync(join(BACKUP_DIR, 'agent-workbench.' + Date.now() + '.html'), html, 'utf8');
    /* v3.7.58：备份轮转 —— 只保留最近 KEEP_BACKUPS 份。历史实测无轮转时该目录
       曾累积 141 份 / 451MB，纯磁盘债；备份只服务"最近一次抽取"的回退场景。 */
    try {
      const KEEP_BACKUPS = 10;
      const baks = readdirSync(BACKUP_DIR)
        .filter(f => f.endsWith('.html'))
        .map(f => ({ f, m: statSync(join(BACKUP_DIR, f)).mtimeMs }))
        .sort((a, b) => b.m - a.m);
      for (const old of baks.slice(KEEP_BACKUPS)) {
        try { unlinkSync(join(BACKUP_DIR, old.f)); } catch (_e) { /* 占用/权限：跳过 */ }
      }
    } catch (_e) { /* 轮转失败不影响主流程 */ }
  }
  mkdirSync(SRC_DIR, { recursive: true });

  /* v3.7.62：先读旧 order.json —— 跳过分支的 tailBlanks 必须**沿用历史**。
     实测缺口：源码态跑 --extract 时块已只剩标记（走跳过分支），旧实现硬编码 tailBlanks:0
     并照写 order.json —— data-idb 的 1 被抹成 0（git diff 可复现），此后每次拼回的空白版式
     都会漂移，且没有任何门禁能发现。 */
  const prevByName = new Map();
  if (existsSync(join(SRC_DIR, 'order.json'))) {
    try {
      for (const x of JSON.parse(readFileSync(join(SRC_DIR, 'order.json'), 'utf8'))) {
        if (x && typeof x === 'object' && x.name) prevByName.set(x.name, x);
        else if (typeof x === 'string') prevByName.set(x, { name: x, tailBlanks: 0 });
      }
    } catch (_e) { /* 旧文件不可解析：按无历史处理 */ }
  }

  let extracted = 0;
  const order = [];
  const meta = [];
  const pendingWrites = [];   /* 全部写盘推迟到「块数校验」之后：中途失败不得留下半写状态 */
  for (const b of BLOCKS) {
    /* 已抽出过的块：HTML 里只剩标记占位、层注释随内容进了 src/ —— 这是正常状态，不算失败 */
    if (!findLayerLine(b.layer, b.title).length && existsSync(join(SRC_DIR, b.name + '.js'))) {
      const prev = prevByName.get(b.name);
      const tailBlanks = prev && typeof prev.tailBlanks === 'number' ? prev.tailBlanks : 0;
      if (!prev) console.warn(`  ⚠ src/${b.name}.js 不在旧 order.json 中，tailBlanks 暂按 0；建议在拼回态再跑一次 --extract 校准`);
      console.log(`  已抽出（跳过）src/${b.name}.js  —— HTML 中是标记占位（tailBlanks ${tailBlanks} 沿用旧记录）`);
      order.push(b.name);
      meta.push({ name: b.name, layer: b.layer, title: b.title, tailBlanks: tailBlanks });
      extracted++;
      continue;
    }
    const hits = findLayerLine(b.layer, b.title);
    if (!hits.length) { console.error(`[src-split] 未找到层块 ${b.layer} / ${b.title}`); continue; }
    let s = hits[0], e = blockEndIdx(s);
    /* 拼回后再抽取的情形：本块外面还留着上次的 BEGIN/END 标记（层注释已被拼回）。
       此时把旧标记一并纳入替换范围，否则会嵌套出「两个 BEGIN / 两个 END」的重复标记。 */
    const inOldPair = s > 0 && lines[s - 1].trim() === mk(b.name) && lines[e] && lines[e].trim() === mkEnd(b.name);
    if (inOldPair) s = s - 1;
    const eAdj = inOldPair ? e + 1 : e;
    const raw = lines.slice(inOldPair ? s + 1 : s, e).join('\n');
    /* 记录尾部空行数：块末的空白行属于原文件版式，拼回时要原样还原（否则无法做到字节级无损比对） */
    const tailBlanks = (raw.match(/\n+$/) || [''])[0].length;
    const body = raw.replace(/\n+$/, '');
    /* v3.7.62：实测值与旧记录不一致 → 告警并按实测值修正（HTML 是抽取方向的事实源）。
       这条会捕获 order.json 曾被旧缺陷归零 / 有人手改过块末空行的情形。 */
    const prev = prevByName.get(b.name);
    if (inOldPair && prev && typeof prev.tailBlanks === 'number' && prev.tailBlanks !== tailBlanks) {
      console.warn(`  ⚠ src/${b.name}.js tailBlanks ${prev.tailBlanks} → ${tailBlanks}（与旧 order.json 记录不符，按 HTML 实测值修正）`);
    }
    pendingWrites.push({ file: join(SRC_DIR, b.name + '.js'), data: body + '\n' });
    meta.push({ name: b.name, layer: b.layer, title: b.title, tailBlanks: tailBlanks });
    console.log(`  抽出 src/${b.name}.js  ${e - s} 行  ${Math.round(Buffer.byteLength(body) / 1024)}KB  （${b.layer} · ${b.title}）`);
    /* 原地替换成标记占位（保留缩进/位置） */
    lines.splice(s, eAdj - s, mk(b.name), mkEnd(b.name));
    extracted++;
    order.push(b.name);
    /* splice 后行号已变，重新扫描 */
  }
  if (extracted < MIN_EXPECTED) {
    console.error(`[src-split] 只抽出 ${extracted} 块（预期 ≥ ${MIN_EXPECTED}）→ 不写盘，请检查层标记`);
    process.exit(1);
  }
  for (const w of pendingWrites) writeFileSync(w.file, w.data, 'utf8');
  writeFileSync(join(SRC_DIR, 'order.json'), JSON.stringify(meta, null, 1) + '\n', 'utf8');
  const out = lines.join('\n');
  writeFileSync(HTML, out, 'utf8');
  console.log(`[src-split] 抽出 ${extracted} 块（${order.join(', ')}）；HTML ${(Buffer.byteLength(html) / 1024).toFixed(1)}KB → ${(Buffer.byteLength(out) / 1024).toFixed(1)}KB`);
  console.log('[src-split] HTML 内已留标记占位，构建/测试前会自动拼回（见 package.json 的 pre* 钩子）');
  process.exit(0);
}

/* ---------- inject / check ---------- */
const files = existsSync(SRC_DIR) ? readdirSync(SRC_DIR).filter(f => f.endsWith('.js')) : [];
if (!files.length) { console.error('[src-split] src/ 下没有 .js，先跑 --extract'); process.exit(1); }
const orderFile = join(SRC_DIR, 'order.json');
const rawOrder = existsSync(orderFile) ? JSON.parse(readFileSync(orderFile, 'utf8')) : null;
/* 兼容两种格式：旧版是名字数组，新版是 [{name, tailBlanks}] */
const meta = (rawOrder || []).map(x => (typeof x === 'string' ? { name: x, tailBlanks: 0 } : x));
const names = meta.length ? meta.map(m => m.name) : files.map(f => f.replace(/\.js$/, ''));

let injected = 0, missing = [];
/* v3.7.59：--check 增加**内容比对**（此前只查「标记在不在、数量对不对」，不比对内容）。
   缺口实测：HTML 已改、src 未同步抽取时，check 仍打印「齐全 ✓」并退 0 —— 而
   pretest / prebuild / pree2e / prelint 都会跑默认的**注入**方向（src → HTML），
   于是「直接改 HTML」的编辑会在下一次跑测试或构建时被 src 静默覆盖回滚。
   （本次审计开始时工作区正处该状态：HTML 已删 AI_BUILTIN_PLUGINS，src/ui-global-events.js 未同步。）
   比对口径与注入方向严格对齐：注入写的是 `'\n' + body + '\n'`（body 已按 tailBlanks 补齐）。 */
const mismatched = [];
let placeholderBlocks = 0;
const htmlBefore = html;   /* v3.7.62：写盘前「骨架自检」的对照样本（见文件尾部的 collapse 断言） */
/* v3.7.52：src/ 下未登记在 order.json 的 .js 必须报错，而不是静默忽略。
   原实现只循环 order.json 里的名字 —— 新加的模块忘了登记时，代码不会被拼回 HTML，
   而 --check 仍打印「齐全 ✓」并退 0：静默丢代码是最危险的一类构建缺陷。
   静默丢代码是最危险的一类构建缺陷，故两个模式都硬失败。 */
const orphans = files.map(f => f.replace(/\.js$/, '')).filter(n => !names.includes(n));
if (orphans.length) {
  console.error('[src-split] src/ 下以下文件未登记在 ' + orderFile + '（不会被拼回）：' + orphans.join(', '));
  process.exit(1);
}
for (const n of names) {
  const f = join(SRC_DIR, n + '.js');
  if (!existsSync(f)) { missing.push(n); continue; }
  const blanks = (meta.find(m => m.name === n) || {}).tailBlanks || 0;
  const body = readFileSync(f, 'utf8').replace(/\n$/, '') + '\n'.repeat(blanks);
  /* v3.7.62：改为「显式定位 + 切片」替换，不再用正则。理由有二：
     ① 唯一性可断言 —— 历史上出现过「两个 BEGIN / 两个 END」的嵌套重复（旧版抽取未把已有
        标记一并纳入替换范围），非贪婪正则只认第一对、静默忽略其余；
     ② 替换范围可精确证明 = 标记之间的区间，写盘前的骨架自检（见尾部 collapse 断言）才成立。
     另一个历史坑（正是骨架自检要拦的那类）：被拼回的源码含 `$1`/`$&` 这类文本（markdown
     替换逻辑里的 "<strong>$1</strong>"），字符串替换会被 String.replace 当捕获组展开而改坏代码。 */
  const beginTok = mk(n), endTok = mkEnd(n);
  const nBegin = html.split(beginTok).length - 1;
  const nEnd = html.split(endTok).length - 1;
  if (nBegin === 0 || nEnd === 0) { missing.push(n); continue; }
  if (nBegin !== 1 || nEnd !== 1) {
    console.error(`[src-split] ${n} 的标记不唯一（BEGIN ${nBegin} 个 / END ${nEnd} 个）→ 疑似历史嵌套重复，请人工修复后重跑`);
    process.exit(1);
  }
  const bi = html.indexOf(beginTok);
  const ei = html.indexOf(endTok, bi + beginTok.length);
  if (bi === -1 || ei === -1) { missing.push(n); continue; }
  if (CHECK) {
    const actual = html.slice(bi + beginTok.length, ei);
    /* 源码态占位（标记之间只有空白）：内容在 src/，HTML 侧无可比对对象 → 视为通过。
       形状由 check-source-state.mjs 守（标记数 / 体积 / 无 base64）。
       ⚠️ 忘了这一支会让 --check 在**源码态**（即提交进 git 的常态）对每个块都误报不一致。 */
    if (/^\s*$/.test(actual)) {
      placeholderBlocks++;
      console.log(`  ✓ ${n.padEnd(16)} ${Math.round(Buffer.byteLength(body) / 1024)}KB（源码态占位）`);
    } else if (actual === '\n' + body + '\n') {
      console.log(`  ✓ ${n.padEnd(16)} ${Math.round(Buffer.byteLength(body) / 1024)}KB`);
    } else {
      mismatched.push(n);
      console.log(`  ✗ ${n.padEnd(16)} HTML 块内容与 src/${n}.js 不一致`);
    }
    continue;
  }
  html = html.slice(0, bi + beginTok.length) + '\n' + body + '\n' + html.slice(ei);
  injected++;
}
if (missing.length) {
  console.error('[src-split] 以下块在 HTML 里找不到标记（或 src 缺文件）：' + missing.join(', '));
  process.exit(1);
}
if (CHECK) {
  if (names.length !== files.length) {
    console.error(`[src-split] check ✗ 数量不一致：order.json ${names.length} 个 / src 文件 ${files.length} 个`);
    process.exit(1);
  }
  if (mismatched.length) {
    console.error(`[src-split] check ✗ ${mismatched.length} 个块的 HTML 内容与 src/ 不一致：${mismatched.join(', ')}`);
    console.error('  说明：HTML 被直接编辑但未同步到 src/。若这些改动是要保留的，先跑');
    console.error('        node scripts/src-split.mjs --extract   （把 HTML 的内容抽回 src/）');
    console.error('        否则下一次注入（pretest/prebuild/pree2e 都会跑）会把它们覆盖回 src 的旧内容。');
    process.exit(1);
  }
  const stateNote = placeholderBlocks === names.length
    ? '源码态占位 · 内容在 src/，形状由 check-source-state 守'
    : `内容逐块一致 · 已比对 ${names.length - placeholderBlocks} 块`;
  console.log(`[src-split] check：HTML 标记 ${names.length} 个 / src 文件 ${files.length} 个 —— 齐全 ✓（${stateNote}）`);
  process.exit(0);
}
/* ---------- --verify：与指定提交的 HTML 比对（只读、与源码态/拼回态无关）----------
   ⚠️ 本分支必须放在下面的注入 + writeFileSync **之前**：
   旧实现放在注入之后，于是这个号称"证明代码零改动"的只读检查会先把 HTML 拼回写盘，
   再拿"源码态的 HEAD"去比"刚被自己写成拼回态的文件" —— 结构上永远不可能通过，
   而且顺带把工作区弄脏（check:source-state 变红）。实测于 v3.7.59。
   归一化口径：把「标记行 + 块体」整段摘除，只留下**非外置骨架**（内联脚本 / CSS / 静态 HTML）。
   这样源码态与拼回态都能直接比，也才符合本工具的真正用途：
   确认这次往返没有动到 src/ 之外的那部分文件。
   src/ 各块内容与 HTML 是否一致，是 `--check` 的职责（它会逐块比对）。 */
if (process.argv.includes('--verify')) {
  const cp = await import('node:child_process');
  /* 参照系：默认用「拆分前的干净提交 5d35c8d」，可用 --base=<sha> 覆盖。
     不用 HEAD —— 因为 HEAD 里可能留着历史脏标记（重复占位），拿它比对会误报。 */
  const baseArg = process.argv.find(a => a.startsWith('--base='));
  const base = baseArg ? baseArg.slice(7) : 'HEAD';
  const head = cp.execSync('git show ' + base + ':agent-workbench.html', { maxBuffer: 1 << 28 }).toString('utf8');
  const cur = readFileSync(HTML, 'utf8');
  const norm = t => t.replace(/\r\n/g, '\n')
    /* 一次到位：标记行连同其块体整体摘除（旧规则只删标记行 → 两种状态长度差 4 倍，必然误报） */
    .replace(/^\/\*SRC:[\w-]+:BEGIN\*\/[\s\S]*?\/\*SRC:[\w-]+:END\*\/\n?/gm, '')
    .replace(/\n{2,}/g, '\n')   /* 接缝处会多/少一个空行（纯版式），折叠为 1 行 */
    /* 立绘 base64 归一化：萌宠 _PET_ART 现位于 src/render-widgets.js，注入与否只影响这串数据 */
    .replace(/data:image\/png;base64,[A-Za-z0-9+/=]+/g, 'data:image/png;base64,<ART>')
    .replace(/const _PET_ART = \{[\s\S]*?\};/, 'const _PET_ART = {<ART_MAP>};');
  const a = norm(head), b = norm(cur);
  console.log(`[src-split] verify（基准 ${base} · 非外置骨架）：${a.length} 字符 / 现在 ${b.length} 字符`);
  if (a === b) {
    console.log('[src-split] verify ✓ 内联脚本 / CSS / 静态 HTML 与基准完全一致（src/ 之外的部分零改动）');
    console.log('[src-split]   注：本模式不改写 HTML；各 src 块与 HTML 是否一致请用 --check');
    process.exit(0);
  }
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) {
      console.log('  ✗ 首个差异 @' + i);
      console.log('    基准: ' + JSON.stringify(a.slice(Math.max(0, i - 60), i + 60)));
      console.log('    现在: ' + JSON.stringify(b.slice(Math.max(0, i - 60), i + 60)));
      break;
    }
  }
  process.exit(1);
}

/* v3.7.62：写盘前的**骨架自检**（对齐头部 ② 承诺；此前这里只有注释、没有实现）——
   把两侧的 SRC 标记区都折叠成 <SRC> 占位后，其余部分必须逐字符相同：
   注入只允许改标记之间的区间，伤到骨架即说明替换逻辑有 bug → 报错退出、不写盘。 */
if (injected) {
  const collapse = t => t.replace(/\/\*SRC:[\w-]+:BEGIN\*\/[\s\S]*?\/\*SRC:[\w-]+:END\*\//g, '<SRC>');
  const a = collapse(htmlBefore), b = collapse(html);
  if (a !== b) {
    let at = 0;
    while (at < Math.max(a.length, b.length) && a[at] === b[at]) at++;
    console.error('[src-split] 骨架自检失败：注入伤到了 SRC 标记之外的内容 → 不写盘');
    console.error(`  首个差异 @${at}:`);
    console.error(`    注入前 ${JSON.stringify(a.slice(Math.max(0, at - 60), at + 60))}`);
    console.error(`    注入后 ${JSON.stringify(b.slice(Math.max(0, at - 60), at + 60))}`);
    process.exit(1);
  }
}
writeFileSync(HTML, html, 'utf8');
console.log(`[src-split] 拼回 ${injected} 块 → HTML ${(Buffer.byteLength(html) / 1024 / 1024).toFixed(2)}MB`);
