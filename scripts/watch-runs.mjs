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
 *   · 传输：gh 优先，取不到时**用 curl 兜底**（2026-10-27 实测：api.github.com 多条 A 记录里有一条
 *     从本机不可达，gh 与 node fetch 都撞上就整体失败，而 curl 会换下一条 —— 于是"gh 查不到"与
 *     "CI 红/没跑完"同形）。兜底只在真取到东西时才打一行提示，两头都空按查询失败处理（多半是 id 写错）。
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
/* ---------- curl 兜底（2026-10-27 加）----------
 * 实测：`api.github.com` 有多条 A 记录，其中一条（本机遇到的是 20.205.243.168）不可达；
 * `gh api` 与 node 的 fetch 都会直接 dial tcp 失败，而 **curl 会换下一条并成功**。
 * 于是"gh 查不到"与"CI 红/没跑完"完全同形 —— 这正是台账 R-28 那类「度量器自己坏掉」。
 * 兜底只在 gh 那条路拿不到东西时启用；**只有兜底真的取到了东西才打一行提示**，
 * 免得 run id 写错（两头都 404）时被误读成"传输问题"。 */
let _fellBack = false;
function accessToken() {
  const env = String(process.env.GH_TOKEN || process.env.GITHUB_TOKEN || "").trim();
  if (env) return env;
  const r = spawnSync("gh", ["auth", "token"], { encoding: "utf8" });
  return r && r.status === 0 ? String(r.stdout || "").trim() : "";
}
function curlJson(path) {
  const tok = accessToken();
  if (!tok) return null;
  const r = spawnSync("curl", ["-s", "--max-time", "30", "-H", "Authorization: Bearer " + tok,
    "-H", "Accept: application/vnd.github+json", "https://api.github.com" + path], { encoding: "utf8" });
  if (r.status !== 0 || !r.stdout) return null;
  try { return JSON.parse(r.stdout); } catch (_e) { return null; }
}
/** 只在**兜底真的取到了东西**时才打提示：两头都失败多半是 run id 写错，
 *  那种情况下喊"传输问题"会把人从正确答案上引开。 */
function announceFallback(kind) {
  if (_fellBack) return;
  _fellBack = true;
  console.log("[watch-runs] gh 取不到 " + kind + "，本轮起改用 curl 兜底（同端点、同判据，不改结论口径）");
}
/** 给测试看的两个小口子（CLI 不用） */
export function fellBack() { return _fellBack; }
export function resetFallbackFlag() { _fellBack = false; }

/**
 * 纯函数：传输选择规则 —— gh 有值就用它；gh 没值才试兜底；**兜底也没值时不打提示**
 * （两头都空通常是 run id 写错，喊"传输问题"会把人从正确答案上引开）。
 * @param {*} ghValue gh 那条路归一后的值（null 表示没拿到）
 * @param {()=>*} curlLoader 兜底加载器（只在需要时调用）
 * @param {string} kind 提示里点名的对象
 * @param {(kind:string)=>void} announce 提示函数
 */
export function resolveWithFallback(ghValue, curlLoader, kind, announce) {
  if (ghValue) return ghValue;
  const v = curlLoader();
  if (v) announce(kind);
  return v;
}

/** 纯函数：run 载荷归一。gh 的 --jq 投影把 attempt 改过名，curl 的原样是 run_attempt ⇒ 两种都认。 */
export function normalizeRun(j) {
  if (!j || typeof j !== "object" || Array.isArray(j) || !j.status) return null;
  return { id: j.id, name: j.name, status: j.status, conclusion: j.conclusion || null,
    attempt: j.attempt !== undefined ? j.attempt : j.run_attempt };
}
/** 纯函数：jobs 载荷归一（gh 投影是裸数组，REST 原样是 {jobs:[…]}；出错载荷一律 null） */
export function normalizeJobs(j) {
  const arr = Array.isArray(j) ? j : (j && Array.isArray(j.jobs) ? j.jobs : null);
  if (!arr) return null;
  return arr.map((x) => ({ name: (x && x.name) || "?", conclusion: (x && x.conclusion) || null }));
}

function fetchRun(repo, id) {
  const viaGh = normalizeRun(ghApi(["api", "repos/" + repo + "/actions/runs/" + id,
    "--jq", "{id: .id, name: .name, status: .status, conclusion: .conclusion, attempt: .run_attempt}"]));
  return resolveWithFallback(viaGh, () => normalizeRun(curlJson("/repos/" + repo + "/actions/runs/" + id)),
    "run " + id, announceFallback);
}

function fetchJobs(repo, id) {
  const viaGh = normalizeJobs(ghApi(["api", "repos/" + repo + "/actions/runs/" + id + "/jobs",
    "--jq", "[.jobs[] | {name: .name, conclusion: .conclusion}]"]));
  return resolveWithFallback(viaGh,
    () => normalizeJobs(curlJson("/repos/" + repo + "/actions/runs/" + id + "/jobs?per_page=60")),
    "run " + id + " 的 jobs", announceFallback);
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
if (process.argv[1] && /watch-runs.mjs$/.test(process.argv[1].replace(/\\/g, "/"))) {
  try{ main(); }
  catch(e){ console.error("[watch-runs] 内部错误（不是 CI 判据）：" + ((e && e.stack) || e)); process.exit(2); }
}
