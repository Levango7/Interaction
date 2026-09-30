#!/usr/bin/env node
/**
 * verify-ci-order.mjs —— 按 CI 的**真实步骤顺序**在本机预演一遍门禁
 *
 * 为什么需要它：单个门禁各自跑绿 ≠ CI 绿。本仓库的验证命令会改写 `agent-workbench.html`
 * （pre* 注入 / post* 抽回），所以**上一步把目录留在哪种状态，直接决定下一步的结论**。
 * v3.7.59 我给 build:check / lint / lint:layers / test:coverage / e2e 补齐 post* 自愈钩子时，
 * 就顺手把 CI 弄红了：`pet:check` 要在**拼装态**才读得到 `_PET_ART`，而它前一步
 * （lint:layers）现在会把目录抽回源码态 → 该步骤 exit 1。逐个命令手跑时完全看不出来。
 *
 * 本脚本从 `.github/workflows/ci.yml` 读出指定 job（默认 test）的 `run:` 序列（不写死清单，
 * 免得脚本与 workflow 漂移），按序执行，任一步非零即失败并打印该步输出尾部，
 * 最后再断言工作区回到源码态（CI 的下一步依赖它）。
 *
 * 用法：node scripts/verify-ci-order.mjs [--with-e2e] [--only=a,b] [--list]
 *   经 npm 调用时标志必须放在 `--` 之后，否则被 npm 吞掉：
 *   npm run verify:ci -- --with-e2e
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const optVal = (name) => { const m = argv.find(a => a.startsWith(`--${name}=`)); return m ? m.slice(name.length + 3) : null; };

/* 🔴 参数被 npm 吞掉的陷阱：`npm run verify:ci --with-e2e` 不会把标志传进来，
   npm 自己收作配置项（只 warn "Unknown cli config"），脚本 argv 是空的 →
   e2e 那步**静默不跑**，其余十步照样全绿退出 0。属"空 check 判绿"一类，必须挡。
   正确写法是加 `--` 分隔：npm run verify:ci -- --with-e2e */
const SWALLOWED = ["with-e2e", "list", "job", "only", "ci"]
  .filter((f) => process.env["npm_config_" + f.replace(/-/g, "_")] !== undefined);
if (SWALLOWED.length) {
  console.error(`ERR: 标志 ${SWALLOWED.map((f) => "--" + f).join(" ")} 被 npm 吞掉了，本次**不会生效**。`);
  console.error(`     改成：npm run verify:ci -- ${SWALLOWED.map((f) => "--" + f).join(" ")}`);
  process.exit(2);
}

const CI = path.resolve(ROOT, optVal("ci") || path.join(".github", "workflows", "ci.yml"));

if (!fs.existsSync(CI)) { console.error(`ERR: 找不到 ${CI}`); process.exit(2); }

/* ---- 解析指定 job 的 run 序列（按 YAML 缩进粗切，够用且不引依赖） ----
   ci.yml 的门禁 job 叫 `test`，deploy.yml 的叫 `verify` —— 用 --job= 指定，默认 test。 */
const JOB = optVal("job") || "test";
const lines = fs.readFileSync(CI, "utf8").split(/\r?\n/);
const jobStart = lines.findIndex(l => new RegExp("^  " + JOB + ":\\s*$").test(l));
if (jobStart < 0) {
  const names = lines.filter(l => /^ {2}[\w-]+:\s*$/.test(l)).map(l => l.trim().slice(0, -1));
  console.error(`ERR: ${path.basename(CI)} 里没有 job "${JOB}"；现有 job：${names.join(", ")}（用 --job=<name> 指定）`);
  process.exit(2);
}
const steps = [];
for (let i = jobStart + 1; i < lines.length; i++) {
  const l = lines[i];
  if (/^ {2}\w[\w-]*:\s*$/.test(l)) break;              // 下一个 job
  const m = /^\s*-\s+run:\s*(.+?)\s*$/.exec(l);
  if (m) steps.push(m[1]);
}
if (!steps.length) { console.error("ERR: 没解析出任何 run 步骤"); process.exit(2); }

let run = steps.slice();
if (!has("--with-install")) run = run.filter(s => !/npm ci/.test(s));
/* e2e 在 ci.yml 里是**独立 job**，不在门禁序列内 —— 用 --with-e2e 显式追加到末尾 */
if (has("--with-e2e")) run.push("npm run e2e");
const only = optVal("only");
if (only) { const want = only.split(",").map(s => s.trim()); run = run.filter(s => want.some(w => s.includes(w))); }

if (has("--list")) { console.log(`CI ${JOB} job 的 run 序列（按文件顺序）:`); steps.forEach((s, i) => console.log(`  ${i + 1}. ${s}`)); process.exit(0); }

console.log(`[ci-order] 将按序执行 ${run.length} 步（来自 ${path.relative(ROOT, CI)} 的 job ${JOB}）`);
run.forEach((s, i) => console.log(`  ${i + 1}. ${s}`));

const failures = [];
for (let i = 0; i < run.length; i++) {
  const cmd = run[i];
  process.stdout.write(`\n[ci-order] (${i + 1}/${run.length}) ${cmd} ... `);
  const r = spawnSync(cmd, { cwd: ROOT, shell: true, encoding: "utf8", maxBuffer: 1 << 28 });
  const out = (r.stdout || "") + (r.stderr || "");
  if (r.status === 0) {
    console.log("exit 0");
  } else {
    console.log(`exit ${r.status}  ✗`);
    failures.push({ cmd, out });
    /* 只给尾部 25 行会把失败清单本身切掉：实测 `npm test` 报 3 条失败时，
       尾部只剩最后 1 条 FAIL，另外 2 条看不见 —— 排查得先单独重跑一次全量。
       所以先把 FAIL / 汇总行整份打出来，尾部只作上下文。 */
    const hits = out.split("\n").filter((l) => /\bFAIL\b|Test Files\s|Tests\s+\d|✕|MOCK/.test(l));
    if (hits.length) {
      console.log("  ---- 失败清单（从完整输出里挑，不受尾部长度限制）----");
      for (const l of hits.slice(0, 60)) console.log("  " + l.trim());
    }
    console.log("  ---- 该步输出尾部 ----");
    for (const l of out.split("\n").slice(-25)) console.log("  " + l);
    break;                                       // 后续步骤的状态已被污染，先修这一个
  }
}

/* ---- 收尾断言：工作区必须回到源码态（CI 的下一步/提交都依赖它） ---- */
const st = spawnSync("npm run check:source-state", { cwd: ROOT, shell: true, encoding: "utf8" });
if (st.status !== 0) {
  console.log("\n[ci-order] ✗ 跑完后工作区不是源码态 —— CI 会红：");
  console.log(((st.stdout || "") + (st.stderr || "")).split("\n").slice(-8).map(l => "  " + l).join("\n"));
  failures.push({ cmd: "check:source-state(收尾断言)", out: "" });
} else {
  console.log("\n[ci-order] ✓ 收尾断言：工作区已回到源码态");
}

if (failures.length) {
  console.log(`\n[ci-order] ✗ ${failures.length} 步失败：${failures.map(f => f.cmd).join(" | ")}`);
  process.exit(1);
}
console.log(`[ci-order] ✓ 全部 ${run.length} 步按 CI 顺序通过`);
