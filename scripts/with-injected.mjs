#!/usr/bin/env node
/**
 * with-injected.mjs —— 注入态生命周期包装器：**无论命令成功、失败还是被中断，都抽回源码态**
 * ----------------------------------------------------------------------------
 * 解决的问题（npm 语义，实测 npm 12.2.0）：
 *   `test` 脚本以非 0 退出时，npm **不会**执行 `posttest`。于是「npm test 失败」、
 *   以及「跑测试时 Ctrl-C」都会把工作区停在 3.9MB 的拼回态 —— 下一次 `git add` 就会
 *   把注入态 HTML 提交进去（本仓 v3.7.40 真实误提交过一次，CHANGELOG 记过多次）。
 *   同一缺陷对 test / lint / build / e2e 等**每一组**钩子都成立。
 *
 * 本包装器把「注入 → 跑命令 → 抽回」收敛成**一个进程**，抽回放在所有退出路径上：
 *   · 子进程正常退出（0 或非 0）→ 抽回后按原样透传退出码
 *   · 子进程被信号杀死        → 抽回后非 0 退出
 *   · 本进程收到 SIGINT/SIGTERM（Ctrl-C）→ 同步抽回后再退出
 * 因此 npm 的 post 钩子是否存在、是否被跳过，都不再影响工作区终态。
 *
 * 用法（package.json 里把原来的 pre/post 三件套换成这一条）：
 *   node scripts/with-injected.mjs vitest run
 *   node scripts/with-injected.mjs "npx eslint a.html && node scripts/lint-xss.mjs --check"
 * 参数会被原样拼成一条命令、交给当前平台的 shell 执行（与 npm 跑脚本的方式一致），
 * 因此 `&&` 链式调用、`npx`、带空格的参数都能照原样工作。
 *
 * 注入/抽回两条链与旧钩子**逐字同序**，不引入新的顺序：
 *   注入 = src-split（拼回层块）→ pet-art（注入立绘）
 *   抽回 = pet-art --extract → src-split --extract --no-backup
 * 两条链都幂等（重复跑走「跳过」分支），所以多跑一次是安全的。
 */
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/* 与旧 pre / post 钩子逐字同序。改这里等于改所有 npm 脚本的注入语义，务必同步 CHANGELOG。 */
const INJECT = [
  ["scripts/src-split.mjs"],
  ["scripts/pet-art.mjs"],
];
const EXTRACT = [
  ["scripts/pet-art.mjs", "--extract"],
  ["scripts/src-split.mjs", "--extract", "--no-backup"],
];

const MAXBUF = 1 << 28;

const argv = process.argv.slice(2);
if (!argv.length) {
  console.error("用法：node scripts/with-injected.mjs <命令...>");
  console.error("  例：node scripts/with-injected.mjs vitest run");
  process.exit(2);
}
/* npm 会把用户追加的参数一并给到我们（`npm test -- --reporter verbose`），
   这里原样拼回一条命令行；单参数时不做拼接，避免动到引号。 */
const CMD = argv.length === 1 ? argv[0] : argv.join(" ");

function runChain(chain) {
  for (const [script, ...args] of chain) {
    const r = spawnSync(process.execPath, [path.join(ROOT, script), ...args], {
      cwd: ROOT,
      stdio: "inherit",
      maxBuffer: MAXBUF,
    });
    if (r.error) return { ok: false, step: script, reason: r.error.message };
    if (r.status !== 0) return { ok: false, step: script, reason: `exit ${r.status}` };
  }
  return { ok: true };
}

let restored = false;
function restore(reason) {
  if (restored) return;          // 幂等：信号与子进程退出可能双触发
  restored = true;
  const r = runChain(EXTRACT);
  if (!r.ok) {
    /* 抽回失败是最坏情况（工作区会留在拼回态）→ 必须显式喊出来，不能静默 */
    console.error(`\n[with-injected] ✗ 抽回源码态失败（${r.step} ${r.reason}）—— 工作区可能仍是拼回态。`);
    console.error("[with-injected]   手动还原：npm run src:extract");
    return false;
  }
  if (reason) console.error(`[with-injected] ↩ ${reason}，已把 agent-workbench.html 抽回源码态。`);
  return true;
}

/* ---- 1) 注入：与旧 pre 钩子同序 ---- */
const inj = runChain(INJECT);
if (!inj.ok) {
  console.error(`\n[with-injected] ✗ 注入失败（${inj.step} ${inj.reason}），命令未执行。`);
  restore("注入失败");
  process.exit(2);
}

/* ---- 2) 跑命令，并在**所有**退出路径上抽回 ---- */
let exiting = false;
function finish(code, reason) {
  if (exiting) return;
  exiting = true;
  restore(reason);
  process.exit(code);
}

/* Ctrl-C / kill：终端会把信号发给整个前台进程组（本进程 + shell + 子进程），
   子进程自己会死，我们要做的是在退出前把工作区收拾干净。 */
for (const [sig, code] of [["SIGINT", 130], ["SIGTERM", 143], ["SIGHUP", 129]]) {
  process.on(sig, () => finish(code, `收到 ${sig}`));
}

/* npm 跑脚本时会把 node_modules/.bin 加进 PATH，本包装器是被 npm 调起来的所以能继承；
   但直接 `node scripts/with-injected.mjs vitest run` 时没有这一层 → 自己补上，免得
   `vitest` / `npx` 这类名字在该场景下解析不到。 */
const BIN = path.join(ROOT, "node_modules", ".bin");
const ENV = { ...process.env, PATH: BIN + path.delimiter + (process.env.PATH || "") };

const child = spawn(CMD, { cwd: ROOT, stdio: "inherit", shell: true, env: ENV });

child.on("error", (e) => {
  console.error(`\n[with-injected] ✗ 无法启动命令：${e && e.message}`);
  finish(2, null);
});

child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`\n[with-injected] ✗ 命令被信号 ${signal} 终止。`);
    /* 信号也传给了我们 → 我们的 handler 已经在抽回；这里兜底 null 的情况 */
    finish(code === null ? 1 : code, `命令被 ${signal} 终止`);
  } else if (code !== 0) {
    finish(code, `命令以 exit ${code} 结束（npm 不会跑 post 钩子的那种情况）`);
  } else {
    finish(0, null);
  }
});
