#!/usr/bin/env node
/**
 * flaky-freq.mjs —— CI 抖动频次统计（R-22 尾账工具，2026-10-27 从 _probe/ 入库）
 * ----------------------------------------------------------------------------
 * 干什么：统计几条**已知抖动**的 e2e 用例在 CI 里的真实首跑失败率与重试恢复率。
 *   不看 run 的红/绿结论 —— 那会被「重试后复绿」与「并发去重」掩盖；逐条落到 job 日志的用例行才数得准。
 *   用途只有一个：判断某条抖动是**该抬预算**还是**该当饥饿观察**。判据口径见台账 R-9 续五。
 *
 * ⚠️ 这不是门禁，不进 CI，不联网就不跑（本机要 GITHUB_TOKEN）。
 * 用法：GITHUB_TOKEN=ghp_xxx node scripts/flaky-freq.mjs [最多采集多少个 e2e job]
 * 输出：stdout 汇总表；原始数据落 _probe/r22-flaky-freq.json（便于复算）。
 *
 * 入库时改的一处实质：TARGETS 从**行号锚**改成**标题锚**
 *   （行号随文件增长漂移，实测 `ics-import-render:82` 已到 `:87`，行号锚会让那一条**统计恒为 0**，
 *    看起来"不抖了"，其实只是没数到 —— 这比数错更危险）。行号现在只用于报漂移。
 */
import fs from 'node:fs';
import path from 'node:path';
import { TARGETS, buildCases, summarize, drift } from './lib/flaky-freq.mjs';

const OWNER = 'Levango7', REPO = 'Interaction';
const TOKEN = process.env.GITHUB_TOKEN;
if (!TOKEN) { console.error('缺 GITHUB_TOKEN（本工具不进 CI，只在人工排查时跑）'); process.exit(2); }
const LIMIT = Number(process.argv[2] || 80);
const OUT = process.argv[3] || path.join(process.cwd(), '_probe', 'r22-flaky-freq.json');

const api = (p) => `https://api.github.com/repos/${OWNER}/${REPO}/${p}`;
async function get(p, { text = false } = {}) {
  const url = api(p);
  for (let attempt = 1; ; attempt++) {
    let res;
    try {
      res = await fetch(url, { headers: {
        Authorization: `Bearer ${TOKEN}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'flaky-freq',
      }});
    } catch (e) {
      if (attempt >= 4) throw e;
      await new Promise((r) => setTimeout(r, 1500 * attempt)); // TLS 抖断兜底重试
      continue;
    }
    if (res.status === 403 || res.status === 429) {
      if (attempt >= 3) throw new Error(`rate limited ${res.status} @ ${url}`);
      await new Promise((r) => setTimeout(r, 8000));
      continue;
    }
    if (!res.ok) throw new Error(`${res.status} @ ${url}`);
    return text ? res.text() : res.json();
  }
}

(async () => {
  // 1) 取 main 上 push 触发的 run（ci.yml + deploy.yml 两条 workflow 都有 e2e 腿）
  const runs = [];
  for (let page = 1; page <= 3 && runs.length < 400; page++) {
    const j = await get(`actions/runs?event=push&branch=main&per_page=100&page=${page}`);
    runs.push(...j.workflow_runs);
    if (j.workflow_runs.length < 100) break;
  }
  console.error(`main push run 总数 ${runs.length}，最近 ${runs[0].created_at}`);

  // 2) 逐 run 找 e2e job（skipped 的没有日志，单独计数 —— 它正是并发去重生效的样本）
  const jobs = [];
  let skippedE2e = 0;
  for (const run of runs) {
    if (run.status !== 'completed') continue;
    let j;
    try { j = await get(`actions/runs/${run.id}/jobs?per_page=50`); }
    catch (e) { console.error(`run ${run.id} jobs 取失败: ${e.message}`); continue; }
    for (const job of j.jobs) {
      if (!/^e2e/i.test(job.name)) continue;
      if (job.status !== 'completed') continue;
      if (job.conclusion === 'skipped') { skippedE2e++; continue; }
      jobs.push({
        runId: run.id, runNumber: run.run_number, sha: run.head_sha.slice(0, 7),
        fullSha: run.head_sha, workflow: run.name, createdAt: run.created_at, jobName: job.name,
        jobId: job.id, conclusion: job.conclusion, started: job.started_at,
      });
      if (jobs.length >= LIMIT) break;
    }
    if (jobs.length >= LIMIT) break;
  }
  console.error(`e2e job 执行 ${jobs.length} 个（上限 ${LIMIT}）、skipped ${skippedE2e} 个；跨度 ${jobs[jobs.length - 1]?.createdAt} → ${jobs[0]?.createdAt}`);

  // 3) 下载日志并解析
  const rows = [];
  for (const job of jobs) {
    let raw;
    try { raw = await get(`actions/jobs/${job.jobId}/logs`, { text: true }); }
    catch (e) { console.error(`job ${job.jobId} 日志取失败: ${e.message}`); rows.push({ ...job, logError: e.message }); continue; }
    const { summary, cases } = buildCases(raw);
    rows.push({ ...job, summary, cases });
    process.stderr.write(`.${summary.failed ?? '?'}${summary.flaky ?? '?'} `);
  }
  console.error('');

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(rows, null, 1));
  console.error(`原始数据 → ${OUT}`);

  // 4) 汇总（标题锚）
  const { sampleSize, targets } = summarize(rows, TARGETS);
  console.log(`\n样本：${sampleSize} 个 e2e job（日志可取）\n`);
  const hdr = ['用例', '首跑失败', '重试恢复', '硬失败(红)', '抖率', '首跑耗时中位', '重试耗时中位'];
  const table = [hdr];
  for (const t of targets) {
    table.push([
      t.spec.replace('tests/e2e/', '') + ' · ' + t.title.slice(0, 22),
      t.firstFail, t.recovered, t.hard,
      t.rate == null ? '-' : (t.rate * 100).toFixed(0) + '%',
      t.firstAttemptMsMed == null ? '-' : t.firstAttemptMsMed + 'ms',
      t.retryMsMed == null ? '-' : t.retryMsMed + 'ms',
    ]);
  }
  const w = hdr.map((_, i) => Math.max(...table.map((r) => String(r[i] ?? '').length)));
  for (const r of table) console.log(r.map((c, i) => String(c).padEnd(w[i])).join('  '));

  // 5) 锚漂移检查 —— 标题对不上/行号变了都要喊，否则台账里的行号引用会误导下一个人
  const d = drift(rows, TARGETS);
  const bad = d.filter((x) => x.drifted);
  if (bad.length) {
    console.log('\n⚠️ 锚漂移（登记行号与实测不符 —— 统计用标题锚不受影响，但台账引用要更新）：');
    for (const x of bad) console.log(`  ${x.spec}  登记 :${x.registeredLine}  实测 :${x.observedLines.join(',')}`);
  }
  const miss = d.filter((x) => x.observedLines.length === 0);
  if (miss.length) {
    console.log('\n⚠️ 样本里一次都没匹配到（标题可能被改写了 —— 改标题必须同步改 TARGETS）：');
    for (const x of miss) console.log(`  ${x.spec}  「${x.title}」`);
  }
})();
