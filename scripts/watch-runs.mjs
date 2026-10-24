#!/usr/bin/env node
/* watch-runs.mjs —— 把"守 CI 到终态"从手搓 bash 变成可复用工具（v3.7.148）
 * ----------------------------------------------------------------------------
 * 为什么存在（2026-10-24 实测）：
 *   · 共享 `_probe/watch-run.sh` 的 node 内联脚本把环境变量写成了**字面量** `"process.env.TMPF"`
 *     ⇒ 每轮 `parse-fail`，永远给不出终态。它的沉默与"还在跑"完全同形 —— 这就是台账 R-28 记的
 *     "度量器自己坏掉"那一类，最坏情况是被当成"没跑完"而白白等下去。
 *   · 每次发版都要现写一遍轮询：`gh run watch` 会被 TLS 抖动打断（打断≠红），
 *     而"只认 in_progress 不认 queued"也踩过 ⇒ 谓词必须是 `status === "completed"`。
 *
 * 用法：
 *   node scripts/watch-runs.mjs <run_id> [<run_id> ...] [--timeout 分钟] [--interval 秒] [--repo owner/name]
 *   node scripts/watch-runs.mjs --selftest <一个已完成的 run_id>      # 自证解析器有射程
 *
 * 判据（可被测试直接引用，见 tests/watch-runs.test.js）：
 *   · done   = 每个 run 的 status 都 === "completed"（queued / in_progress / 查询失败 一律不算完成）
 *   · green  = 全部 completed 且 conclusion === "success"（结论缺失不当成功）
 *   · 退出码：0 全绿；1 有非 success 终态；7 超时未终态（NOT_TERMINAL，不许写成"通过"）；2 用法错误
 */
"use strict";
import { spawnSync } from "node:child_process";

const TERMINAL = "completed";

/** 纯函数：给一组 {id,name,status,conclusion,attempt} 判终态。null = 这条查询失败。 */
export function judge(runs) {
  const list = Array.isArray(runs) ? runs : [];
  const unknown = list.filter((r) => !r).length;
  const pending = list.filter((r) => r && r.status !== TERMINAL);
  const done = list.length > 0 && unknown === 0 && pending.length === 0;
  const notGreen = list.filter((r) => r && r.status === TERMINAL && r.conclusion !== "success");
  const green = done && notGreen.length === 0;
  const line = list.map((r, i) => {
    if (!r) return "#" + (i + 1) + "=query-failed";
    const c = r.conclusion || "-";
    const a = r.attempt ? " attempt" + r.attempt : "";
    const nm = r.name ? r.name.replace(/\s+/g, "_") : "run" + r.id;
    return nm + "=" + r.status + "/" + c + a;
  }).join(" ");
  return { done, green, unknown, pending: pending.length, notGreen, line };
}

/** 纯函数：判定 → 退出码（0 全绿 / 1 有非 success 终态 / 7 未终态）。 */
export function exitCodeFor(v) {
  if (v && v.green) return 0;
  return (v && v.done) ? 1 : 7;
}

function ghApi(args) {
  const r = spawnSync("gh", args, { encoding: "utf8" });
  if (r.status !== 0) return null;
  try { return JSON.parse(r.stdout); } catch (_e) { return null; }
}

function fetchRun(repo, id) {
  const j = ghApi(["api", "repos/" + repo + "/actions/runs/" + id,
    "--jq", "{id: .id, name: .name, status: .status, conclusion: .conclusion, attempt: .run_attempt}"]);
  return j && typeof j === "object" && j.status ? j : null;
}

function fetchJobs(repo, id) {
  const j = ghApi(["api", "repos/" + repo + "/actions/runs/" + id + "/jobs",
    "--jq", "[.jobs[] | {name: .name, conclusion: .conclusion}]"]);
  return Array.isArray(j) ? j : null;
}

function parseArgs(argv) {
  const out = { ids: [], timeoutMin: 45, intervalSec: 30, repo: "Levango7/Interaction", selftest: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--timeout") out.timeoutMin = Number(argv[++i]);
    else if (a === "--interval") out.intervalSec = Number(argv[++i]);
    else if (a === "--repo") out.repo = String(argv[++i]);
    else if (a === "--selftest") out.selftest = String(argv[++i]);
    else if (/^\d+$/.test(a)) out.ids.push(a);
    else { console.error("未知参数：" + a); return null; }
  }
  return out;
}

const stamp = () => new Date().toISOString().slice(11, 19) + "Z";
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

function selftest(repo, id) {
  const run = fetchRun(repo, id);
  const jobs = fetchJobs(repo, id);
  /* 自证必须两头都有：解析出终态 + 逐 job 至少一行，否则"看起来通过"只是解析器没工作 */
  const okRun = !!run && run.status === TERMINAL;
  const okJobs = Array.isArray(jobs) && jobs.length > 0 && jobs.every((j) => j && j.conclusion);
  console.log(JSON.stringify({ selftest: id, run: run && { status: run.status, conclusion: run.conclusion }, jobs: jobs ? jobs.length : null }));
  if (!okRun || !okJobs) {
    console.error("SELFTEST ✗ 解析器没有射程（run=" + (run && run.status) + " jobs=" + (jobs ? jobs.length : "null") + "）");
    process.exit(1);
  }
  console.log("SELFTEST ✓ 解析器能给出终态与逐 job 结论（样本 run=" + id + "）");
}

function main() {
  const opt = parseArgs(process.argv.slice(2));
  if (!opt) { console.error("用法见文件头"); process.exit(2); }
  if (opt.selftest) { selftest(opt.repo, opt.selftest); return; }
  if (!opt.ids.length) { console.error("至少给一个 run id（或 --selftest <run_id>）"); process.exit(2); }

  const deadline = Date.now() + opt.timeoutMin * 60 * 1000;
  let last = null;
  for (;;) {
    const runs = opt.ids.map((id) => fetchRun(opt.repo, id));
    last = judge(runs);
    console.log(stamp() + " " + (last.done ? "ALL_DONE" : "WAITING ") + " " + last.line);
    if (last.done) break;
    if (Date.now() >= deadline) {
      console.log("NOT_TERMINAL（" + opt.timeoutMin + " 分钟到点，仍非终态 —— 判据缺失，不许写成通过）");
      process.exit(7);
    }
    sleep(Math.max(5, opt.intervalSec) * 1000);
  }

  console.log("=== 逐 job 终态 ===");
  for (const id of opt.ids) {
    const jobs = fetchJobs(opt.repo, id);
    if (!jobs) { console.log("run " + id + ": query-failed"); continue; }
    console.log("run " + id + ":");
    for (const j of jobs) console.log("  " + j.name + " => " + (j.conclusion || "-"));
  }
  if (!last.green) {
    console.log("结论：有非 success 终态 —— " + last.notGreen.map((r) => (r.name || r.id) + "=" + r.conclusion).join(" "));
  } else {
    console.log("结论：全部 success");
  }
  process.exit(exitCodeFor(last));
}

/* 被测试 import 时不自动跑 CLI */
if (process.argv[1] && /watch-runs\.mjs$/.test(process.argv[1].replace(/\\/g, "/"))) main();
