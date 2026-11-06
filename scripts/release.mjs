#!/usr/bin/env node
/**
 * Release for agent-workbench · v1.11.1 引入
 * --------------------------------------------------
 * 一次性统一 bump 全部版本源，终结"手改版本号导致多源漂移、build:check 必红"。
 *
 * 用法：node scripts/release.mjs <版本号> --as <会话名> [--tag 20260816a]
 *   npm run release 1.11.2 -- --as Qoder
 *   `--as` 必填（也可用环境变量 WB_SESSION）：v3.7.155 起切版要先过板面认领门，身份靠猜会把
 *   认领登记到别人名下，所以不给默认值。
 *
 * bump 目标（与 build.mjs --check 的五源门禁一致 + lockfile 同步）：
 *   0. 前置：板面认领门（他人占用即失败；无冲突则自动登记一行**生而 RELEASED** 的审计行，见下面第 0 步）
 *   1. package.json / electron/package.json / manifest.json 的 version
 *   2. agent-workbench.html 的 VERSION + BUILD_TAG（未指定 --tag 时按当日日期+序号字母自动生成）
 *   3. service-worker.js 的 CACHE_VERSION = v{版本}-{tag}（保证 SW activate 清旧缓存）
 *   3b. README.md 的标题 /「当前版本」/ 页脚示例三处版本号（第五个版本源）
 *   4. 两份 package-lock.json 的 version 字段（仅版本字段；依赖变更请另行 npm install 后提交）
 *   5. 收尾自动跑 build:check 自检，失败即退出非零；自检后**自动抽回源码态**
 *
 * 注意：发版后请更新 CHANGELOG.md，测试通过再提交。
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { BOARD } from './claim-check.mjs';
import { RELEASE_PATHS, resolveIdentity, claimBoardForRelease, undeclaredWrites } from './lib/release-claim.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const newVer = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : null;
const tagIdx = process.argv.indexOf('--tag');
const tagArg = tagIdx > -1 ? process.argv[tagIdx + 1] : null;

if (!newVer || !/^\d+\.\d+\.\d+$/.test(newVer)) {
  console.error('[release] 用法：node scripts/release.mjs <版本号，如 1.11.2> [--tag 20260816a]');
  process.exit(1);
}

function fail(msg){ console.error('[release] ' + msg); process.exit(1); }
function read(p){ return readFileSync(join(root, p), 'utf8'); }
/* 记下真实写过的路径，供 4b 的反漂移判据核对（"登记范围 < 改动范围"就是假声明）。
   ⚠️ 板面自身那次写入**不进**这个集合：它是登记机制本身，不是发版产物。 */
const written = new Set();
function write(p, s){ writeFileSync(join(root, p), s); written.add(p); }

/* 0) 板面认领门（铁律第 5 条的机械化 · 2026-11-05 起）
   切版是全仓共写面最大的一次改动（写 8 个版本源，再按惯例一起提交 CHANGELOG），而铁律第 5 条
   恰好把这组文件列为「动之前必须先在这里声明一行」。此前只靠记性 ⇒ 实测漏过一次：
   `0e6b760`（切 v3.7.154）写了 9 个文件、其中 6 个在清单里，板上零声明（对照 ZCode 切 v3.7.153 是有行的）。
   现在：他人占用即失败；无冲突则由本脚本自己登记一行**生而 RELEASED** 的审计行。
   ⚠️ 刻意不登记 ACTIVE：CI 认领门（`claim-check-ci.mjs`）在 CI 里按**提交作者名**取会话身份
   （本仓全员同为 Levango7），与登记行里写的会话名永不匹配 ⇒ ACTIVE 自登记行会让发版提交把自己
   的 9 条路径全判成「他人占用」（v3.7.155 首推 CI/Deploy 双红的实证）。声明义务由「落一行」本身
   履行，不需要它持续占用。
   ⚠️ 判定**复用** scripts/claim-check.mjs（三面：我的工作文件 / origin/main / 其它脏工作树），不另造一套 ——
   两套判据迟早给出不同答案，那时"门过了"就不再有含义。
   ⚠️ `docs/agent-board.md` 刻意**不在** RELEASE_PATHS 里：它是追加式共享账本，认领它不等于排他
   （R13 的口径是"要躲的是同一节的同一插入点"）。若把它算进去，任何会话只要挂一行板面认领就能拦死别人的切版。 */
const me = resolveIdentity(process.argv.slice(2), process.env);
if (!me) {
  fail('缺少会话身份，切版中止。请加 --as <会话名>（或设环境变量 WB_SESSION）：\n'
     + '         node scripts/release.mjs ' + newVer + ' --as <会话名>\n'
     + '         npm run release ' + newVer + ' -- --as <会话名>\n'
     + '       身份靠猜会把认领登记到别人名下 —— 那比不登记更糟（对方以为自己占着，真正的占用者查不到）。');
}
const cc = spawnSync(process.execPath, [join(__dirname, 'claim-check.mjs'), '--as', me].concat(RELEASE_PATHS),
  { stdio: 'inherit' });
if (cc.status !== 0) {
  fail('板面认领门未通过（或压根没跑起来，见上方输出）—— 被他人占着就按 R13 沟通/等释放，别硬切。');
}
const boardP = join(root, BOARD);
if (!existsSync(boardP)) fail('找不到 ' + BOARD + ' —— 无法登记，切版中止');
let claim;
try {
  claim = claimBoardForRelease({ md: readFileSync(boardP, 'utf8'), me: me, ver: newVer, now: new Date() });
} catch (e) {
  fail('板面登记失败：' + (e && e.message));
}
if (claim.appended) {
  writeFileSync(boardP, claim.md, 'utf8');
  console.log('[release] 板面已自动登记一行 RELEASED 审计行（会话 ' + me + '，覆盖 ' + RELEASE_PATHS.length + ' 条发版路径，版本 v' + newVer + '）');
  console.log('[release] 说明：登记行生而 RELEASED —— ACTIVE 自登记行会让发版提交在 CI 认领门里被自判占用');
  console.log('[release]   （v3.7.155 双红实证），故该行只作审计、不参与任何门禁；也不用再手动翻状态。');
} else {
  console.log('[release] 板面已有本会话本次版本（v' + newVer + '）的审计行 ⇒ 跳过登记（幂等，重跑不会追加重复行）');
}

// build tag 自动生成：当日日期（UTC）+ 序号字母；同日多次发版时在当前字母上递增
function autoBuildTag(currentTag){
  const now = new Date();
  const today = String(now.getUTCFullYear())
    + String(now.getUTCMonth() + 1).padStart(2, '0')
    + String(now.getUTCDate()).padStart(2, '0');
  if (currentTag && currentTag.startsWith(today) && /^[a-z]$/.test(currentTag.slice(-1))
      && currentTag.charCodeAt(currentTag.length - 1) < 122){
    return today + String.fromCharCode(currentTag.charCodeAt(currentTag.length - 1) + 1);
  }
  return today + 'a';
}

/* 1) package.json ×2 + manifest.json */
for (const p of ['package.json', 'electron/package.json', 'manifest.json']) {
  const j = JSON.parse(read(p));
  j.version = newVer;
  write(p, JSON.stringify(j, null, 2) + '\n');
  console.log(`[release] ${p} → ${newVer}`);
}

/* 2) HTML：VERSION + BUILD_TAG */
let html = read('agent-workbench.html');
if (!/const VERSION = "[^"]+";/.test(html)) fail('agent-workbench.html 中未找到 VERSION 定义');
const curTagM = html.match(/const BUILD_TAG = "([^"]+)"/);
const buildTag = tagArg || autoBuildTag(curTagM ? curTagM[1] : '');
html = html.replace(/const VERSION = "[^"]+";/, `const VERSION = "${newVer}";`);
html = html.replace(/const BUILD_TAG = "[^"]+";/, `const BUILD_TAG = "${buildTag}";`);
write('agent-workbench.html', html);
console.log(`[release] agent-workbench.html → VERSION=${newVer} BUILD_TAG=${buildTag}`);

/* 3) SW：CACHE_VERSION */
let sw = read('service-worker.js');
if (!/var CACHE_VERSION = "[^"]*";/.test(sw)) fail('service-worker.js 中未找到 CACHE_VERSION 定义');
sw = sw.replace(/var CACHE_VERSION = "[^"]*";/, `var CACHE_VERSION = "v${newVer}-${buildTag}";`);
write('service-worker.js', sw);
console.log(`[release] service-worker.js → CACHE_VERSION=v${newVer}-${buildTag}`);

/* 3b) README：标题 / 「当前版本」/ 页脚示例三处版本号
   —— build.mjs --check 已把 README 列为第五个版本源，这里必须同步写，否则发版即漂。 */
let md = read('README.md');
const mdPats = [
  [/^# Agent 工坊（v\d+\.\d+\.\d+）/m, `# Agent 工坊（v${newVer}）`],
  [/当前版本 \*\*v\d+\.\d+\.\d+\*\*/, `当前版本 **v${newVer}**`],
  [/`v\d+\.\d+\.\d+ · b\{构建标记\}`/, `\`v${newVer} · b{构建标记}\``],
];
let mdHits = 0;
for (const [re, to] of mdPats) { if (re.test(md)) { md = md.replace(re, to); mdHits++; } }
if (!mdHits) fail('README.md 里找不到任何版本号锚点（标题/「当前版本」/页脚示例），请核对文案是否被改动');
write('README.md', md);
console.log(`[release] README.md → ${mdHits}/3 处版本号已更新`);

/* 4) lockfile 版本字段同步 */
for (const p of ['package-lock.json', 'electron/package-lock.json']) {
  if (!existsSync(join(root, p))) continue;
  const j = JSON.parse(read(p));
  j.version = newVer;
  if (j.packages && j.packages['']) j.packages[''].version = newVer;
  write(p, JSON.stringify(j, null, 2) + '\n');
  console.log(`[release] ${p} → ${newVer}（仅 version 字段）`);
}

/* 4b) 反漂移：本次实际写过的路径必须都在认领清单里。
   加了第 9 个版本源却忘了补 RELEASE_PATHS 时，板面上那行认领的范围会**小于**实际改动范围 ——
   那是"假声明"，比没声明更难发现（别人照着板面判断"他没碰我那个文件"，而其实碰了）。
   放在写入之后、自检之前：此时版本已写完，失败会留下半截发版状态，所以话要说清怎么收拾。 */
const undeclared = undeclaredWrites(written);
if (undeclared.length) {
  fail('本次写了未在认领清单里的路径：' + undeclared.join(', ')
    + '\n         请把它补进 scripts/lib/release-claim.mjs 的 RELEASE_PATHS 后重跑；'
    + '\n         ⚠️ 版本号已写入但板面登记范围不完整，收拾办法：git checkout -- 那 8 个版本源（或直接把清单补上再跑一次，本脚本对同版本号幂等）。');
}

/* 5) 自检
   ⚠️ 必须先注入再 check：build.mjs --check 要的是**拼回态** HTML（它在文件里找
   __TEST_GATE__ / window.__test / sanitizeHtml 这些关键标记，而源码态的块位置只剩 SRC 占位注释）。
   平时 `npm run build:check` 由 scripts/with-injected.mjs 负责注入，而这里是 spawn 直接调
   build.mjs，绕过了钩子 —— 于是"源码态下发版"必然以「真相源缺少关键标记」失败，
   且此时版本已写完、tag 未打，留下半截发版状态。 */
for (const step of ['src-split.mjs', 'pet-art.mjs']) {
  const inj = spawnSync(process.execPath, [join(__dirname, step)], { stdio: 'ignore' });
  if (inj.status !== 0) fail(`${step} 注入失败，无法自检（请手动 node scripts/${step} 查看原因）`);
}
const r = spawnSync(process.execPath, [join(__dirname, 'build.mjs'), '--check'], { stdio: 'inherit' });
if (r.status !== 0) fail('build:check 自检未通过，请检查上方输出');

/* 5b) 还原源码态（v3.7.131 起）
   自检必须在拼回态下做，所以本脚本此前**故意把 HTML 留在拼回态**、只在提示里让人记得还原 ——
   而「记得」不是机制（v3.7.40 那次误提交就是这么发生的）。改为自检通过后自动抽回，
   与 scripts/with-injected.mjs 同序（pet-art --extract → src-split --extract）。 */
for (const [step, extra] of [['pet-art.mjs', ['--extract']], ['src-split.mjs', ['--extract', '--no-backup']]]) {
  const e = spawnSync(process.execPath, [join(__dirname, step), ...extra], { stdio: 'ignore' });
  if (e.status !== 0) fail(`${step} 抽回源码态失败 —— 提交前请先手动 npm run src:extract（否则 check:source-state 会拦住提交）`);
}

console.log(`[release] OK 已统一 bump 至 v${newVer}（BUILD_TAG=${buildTag}）`);
console.log('[release] 提醒：请更新 CHANGELOG.md，测试通过后提交（工作区已自动还原源码态）。');

/* 6) 自动打 release tag（v3.7.58 起）
   此前 53 个版本全部无 tag 可回溯（仓库仅有重构过程快照 tag）。从本版起，
   release 即打 `v<版本>` 附注 tag，发布历史可用 tag 直接 checkout。 */
if (spawnSync('git', ['rev-parse', '--is-inside-work-tree'], { stdio: 'ignore' }).status === 0) {
  const tagName = 'v' + newVer;
  const dup = spawnSync('git', ['rev-parse', '-q', '--verify', 'refs/tags/' + tagName], { stdio: 'ignore' });
  if (dup.status === 0) {
    console.log(`[release] tag ${tagName} 已存在，跳过`);
  } else {
    const t = spawnSync('git', ['tag', '-a', tagName, '-m', `release v${newVer}`], { stdio: 'inherit' });
    console.log(t.status === 0 ? `[release] tag ${tagName} 已创建` : '[release] tag 创建失败（可手动 git tag ' + tagName + '）');
    /* v3.7.59：验证 tag 到底指向谁 —— 本脚本按自身文档的流程（先 bump → 更 CHANGELOG →
       测过 → 再提交）必然在**提交之前**打 tag，于是 tag 会指向上一个提交：
       实测 v3.7.59 的 tag 落在 v3.7.58 的提交上，而 release.mjs 的注释写着
       "发布历史可用 tag 直接 checkout"，即 tag 越用越误导。
       判据用"tag 那个提交里的 package.json 版本"，与本次 newVer 不符就撤掉并提示补打。 */
    if (t.status === 0) {
      const shown = spawnSync('git', ['show', `${tagName}:package.json`], { encoding: 'utf8' });
      let taggedVer = null;
      try { taggedVer = JSON.parse(shown.stdout).version; } catch (_) { /* 读不到当作未知 */ }
      if (taggedVer !== newVer) {
        spawnSync('git', ['tag', '-d', tagName], { stdio: 'ignore' });
        console.log(`[release] ⚠️ tag ${tagName} 已撤回：它指向的提交里 package.json 是 ${taggedVer || '未知'}，不是 ${newVer}。`);
        console.log(`[release]    正确顺序是先提交本次发版改动，再执行：git tag -a ${tagName} -m "release v${newVer}"`);
      }
    }
  }
}
