#!/usr/bin/env node
/**
 * run-tests.mjs —— 本机测试运行器：把「真失败」与「环境抖动」分开，让退出码重新可读
 * ----------------------------------------------------------------------------
 * 问题：本机全量跑 vitest 时，`[vitest-worker]: Timeout calling "onTaskUpdate"`
 * （32 核跑 ~31 worker 的 JSDOM 压力）与临时目录写入被拒这类**未处理错误**
 * 会让退出码变成 1，即使全部断言通过。本仓 CHANGELOG 三次记录该现象并约定「以 CI 为准」，
 * 但那等于让人长期忽略本机退出码 —— 真回归也会被当抖动略过。
 *
 * 本脚本**不改变 CI 的路径**：CI 仍跑 `npm test`（= `vitest run`，原生严格语义）。
 * 这里只是给本机一个更可读的入口：
 *   · 完整转发 vitest 的原始输出（不吞、不截断）
 *   · 结束后按 scripts/test-verdict.mjs 的规则给出判定并据此设置退出码
 *   · 原始输出同时落盘到 `.vitest-last.log`（便于回溯）
 *
 * 判定规则见 test-verdict.mjs：只有「全部断言通过 + 未处理错误全部是已知抖动特征」才判通过；
 * 出现任何**未知**未处理错误仍判失败（不放过未识别的错误）。
 *
 * 用法：npm run test:local
 */
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { verdictOf, formatVerdict } from "./test-verdict.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const LOG = join(root, ".vitest-last.log");

const args = process.argv.slice(2);
const child = spawn(process.execPath, [join(root, "node_modules", "vitest", "vitest.mjs"), "run", ...args], {
  cwd: root,
  stdio: ["ignore", "pipe", "pipe"],
});

let buf = "";
const tee = (chunk, to) => { const s = chunk.toString(); buf += s; to.write(s); };
child.stdout.on("data", (c) => tee(c, process.stdout));
child.stderr.on("data", (c) => tee(c, process.stderr));

child.on("error", (e) => {
  console.error("[run-tests] 无法启动 vitest：", e && e.message);
  process.exit(2);
});

child.on("close", (code) => {
  try { writeFileSync(LOG, buf, "utf8"); } catch (e) { /* 落盘失败不影响判定 */ }
  const v = verdictOf(buf);
  console.log(formatVerdict(v));
  console.log(`  原始输出已存至 ${LOG}`);
  if (v.verdict === "fail") process.exit(code && code !== 0 ? code : 1);
  /* 通过：即便 vitest 因环境抖动退出非 0，也如实说明并返回 0 */
  if (code && code !== 0) {
    console.log(`  （vitest 退出码为 ${code}，但按上述依据判定为通过 —— 差异来自已知环境抖动）`);
  }
  process.exit(0);
});
