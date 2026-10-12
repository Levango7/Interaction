#!/usr/bin/env node
/* verify-run.mjs —— 验证命令统一入口（v3.7.121 验证可靠性改造）
 * ----------------------------------------------------------------------------
 * 为什么存在：2026-10-11 实测 `npm run e2e | tail -2` 显示 exit 0 而真实有 2 失败 ——
 * **管道只保留最后一个命令的退出码**。验证命令的退出码是判据的一部分，不能交给管道。
 *
 * 用法：node scripts/verify-run.mjs "<标签>" -- <命令...>
 *   node scripts/verify-run.mjs "unit" -- npm test
 *   node scripts/verify-run.mjs "e2e"  -- npx playwright test
 *
 * 行为：
 *   · 输出落 verify-out/<标签>-<时间戳>.log（.gitignore 已含 verify-out/）；
 *   · 结束时打印**单行判据**：`[verify] ✓|✗|? <标签> exit=N · passed=X · failed=Y · did-not-run=Z`；
 *   · 退出码原样透传（0=通过；帧 1=失败；79=未判定：被看门狗杀掉或子进程异常退出）；
 *   · `passed / failed / did-not-run` 同时兼容 vitest 与 playwright 的摘要格式。
 */
"use strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const sep = argv.indexOf("--");
const label = sep > 0 ? argv.slice(0, sep).join(" ").trim() : "";
const cmd = sep > 0 ? argv.slice(sep + 1) : [];
if (!label || !cmd.length) {
  console.error("用法：node scripts/verify-run.mjs \"<标签>\" -- <命令...>");
  process.exit(2);
}

const WATCHDOG_MS = Number(process.env.VERIFY_WATCHDOG_MS) || 20 * 60 * 1000;
const OUT_DIR = path.join(ROOT, "verify-out");
fs.mkdirSync(OUT_DIR, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const logFile = path.join(OUT_DIR, label.replace(/[^\w.-]+/g, "_") + "-" + stamp + ".log");
const stream = fs.createWriteStream(logFile);

const started = Date.now();
console.log("[verify] 标签=" + label + " · 日志=" + path.relative(ROOT, logFile));
console.log("[verify] 命令=" + cmd.join(" ") + " · 看门狗=" + Math.round(WATCHDOG_MS / 1000) + "s");

/* Windows 上 npx/npm 只是 npx.cmd 的别名（spawn "npx" 会 ENOENT）——
   只对这类 shim 用 shell；普通命令不用（否则参数被二次切碎，自测实测踩到）。 */
const NEEDS_SHELL = process.platform === "win32" && /^(npx|npm|yarn|pnpm)(\.cmd)?$/i.test(cmd[0]);
const child = spawn(NEEDS_SHELL ? cmd[0] + ".cmd" : cmd[0], cmd.slice(1), {
  cwd: ROOT,
  shell: NEEDS_SHELL,
  env: process.env,
  stdio: ["ignore", "pipe", "pipe"]
});
let killed = false, out = "";
function onData(d) {
  out += d.toString();
  stream.write(d);
  process.stdout.write(d);
}
child.stdout.on("data", onData);
child.stderr.on("data", onData);

const watchdog = setTimeout(() => {
  killed = true;
  console.error("\n[verify] 看门狗超时（" + Math.round(WATCHDOG_MS / 1000) + "s）—— 主动终止子进程。");
  try { child.kill(); } catch (e) { /* 已退出 */ }
}, WATCHDOG_MS);

child.on("error", (e) => {
  console.error("[verify] 子进程启动失败：" + e.message);
});

child.on("exit", (code, signal) => {
  clearTimeout(watchdog);
  stream.end();
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  /* 摘要抽取：vitest（Test Files / Tests）与 playwright（N passed / N failed / N did not run） */
  const pick = (re) => { const m = out.match(re); return m ? m[1] : null; };
  const passed = pick(/(\d+) passed/) || pick(/Tests\s+(\d+) passed/);
  const failed = pick(/(\d+) failed/) || pick(/Tests\s+.*?(\d+) failed/);
  const notRun = pick(/(\d+) did not run/) || pick(/(\d+) skipped/);
  let verdict, exitOut;
  if (killed) { verdict = "?"; exitOut = 79; }
  else if (code === 0) { verdict = "✓"; exitOut = 0; }
  else { verdict = "✗"; exitOut = code === null ? 79 : code; }
  /* ⚠️ 第二种失真：「全跳过 ≠ 通过」。2026-10-12 实测 e2e 96 个全 skipped 而 exit=0 ——
     若照单全收会报「✓ e2e 通过」，而真实是一个用例都没跑。判据：有 did-not-run/skipped
     且 passed 为 0 时，判 **未判定（? / 79）** 而不是通过。 */
  const ranNothing = !passed && (Number(notRun) > 0);
  if (ranNothing && exitOut === 0) { verdict = "?"; exitOut = 79; }
  const parts = ["[verify] " + verdict + " " + label, "exit=" + exitOut];
  if (passed) parts.push("passed=" + passed);
  if (failed) parts.push("failed=" + failed);
  if (notRun) parts.push("did-not-run=" + notRun);
  parts.push(secs + "s");
  if (signal) parts.push("signal=" + signal);
  console.log("\n" + parts.join(" · "));
  if (killed || code === null || ranNothing) {
    console.log("[verify] 尾部输出：");
    console.log(out.split("\n").slice(-30).join("\n"));
    if (ranNothing) {
      console.log("[verify] 判定=未判定：一个用例都没跑（全 skipped / did not run）。**这不是通过**。");
      console.log("[verify] 常见原因：配置把用例全滤掉了（testIgnore/testMatch）、数据文件缺失、环境不滿足前置。");
    } else {
      console.log("[verify] 判定=未判定（不是通过）。若本机 harness 挂起：跑 node scripts/check-browser.mjs 判环境。");
    }
  }
  process.exit(exitOut);
});
