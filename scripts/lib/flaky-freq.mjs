/**
 * flaky-freq.mjs —— CI 抖动频次统计的**判定层**（R-22 尾账工具，2026-10-27 入库）
 * ----------------------------------------------------------------------------
 * 干什么：不看 run 的"红/绿"结论（那会被重试与去重掩盖），而是**逐条落到 job 日志的用例行**，
 *   统计某几条已知抖动用例的真实首跑失败率与重试恢复率 —— 用来判断"要不要抬超时预算"。
 *   判据口径见台账 R-9 续五：抖动是**资源饥饿**还是**真缺陷**，只能靠频次说话，不能靠猜。
 *
 * 为什么入库（2026-10-27，板上 10-26 21:56 交接项）：
 *   原稿在 `_probe/r22-flaky-freq.mjs`（不入 git，随 _probe 清理就没了），且它的 TARGETS 按
 *   **行号**锚 —— 实测 `ics-import-render:82` 已漂到 `:87`，于是那一条的统计**系统性低估**
 *   （行号一漂就再也匹配不上，看起来"这条不抖了"，其实只是没数到）。
 *   现在改成 **标题锚**（行号随文件增长漂移，标题是稳定锚），行号只用于**报漂移**，不用于匹配。
 *
 * 本层只做解析与汇总（可单测、不联网）；CLI 与 GitHub API 在 scripts/flaky-freq.mjs。
 */

/** 观察目标。**title 是匹配锚**（改标题必须同步改这里，否则静默漏统计）；line 只用于漂提醒。 */
export const TARGETS = [
  { spec: 'tests/e2e/i18n.spec.js', title: '② 用真实下拉切换语言：页面重载后常量按新语言求值', line: 112 },
  { spec: 'tests/e2e/ics-import-render.spec.js', title: '导入 .ics → 刷新 → 日历不崩且当日有徽章，点徽章出详情', line: 87 },
  { spec: 'tests/e2e/workflow.spec.js', title: '完整用户流程：启动→onboarding→建任务→切场景→完成任务→统计→设置→习惯链→AI对话→导出', line: 60 },
  { spec: 'tests/e2e/notify-hook.spec.js', title: '② 连接真的发得出去 + localStorage 零集成键 + 面板转「本会话已配置」', line: 106 },
];

/* 失败详情块：`  1) [desktop-1280x800] › tests/e2e/i18n.spec.js:112:3 › 标题` 后跟若干行，
   其中决定形状的是 `Error: ...` 首行、`Timeout: Nms`（expect 预算）与
   `Test timeout of 30000ms exceeded`（整条用例预算跑光 = 饥饿指纹）。 */
const BLOCK_RE = /^\s*\d+\)\s+\[([^\]]+)\]\s+›\s+(tests\/e2e\/[^\s:]+):(\d+):(\d+)/;

export function parseErrors(raw) {
  const out = new Map();
  let key = null;
  for (const raw0 of String(raw || '').split(/\r?\n/)) {
    // GitHub Actions 每行前面有 `2026-10-15T04:08:08.037Z ` 时间戳，必须先剥掉再锚定行首
    const line = raw0.replace(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z\s+/, '');
    const m = line.match(BLOCK_RE);
    if (m) {
      key = `${m[2]}:${m[3]} × ${m[1]}`;
      if (!out.has(key)) out.set(key, { err: null, expectTimeoutMs: null, testTimedOut: false });
      continue;
    }
    if (!key) continue;
    const rec = out.get(key);
    const e = line.match(/Error:\s+(.{0,110})/);
    if (e && !rec.err) rec.err = e[1].trim();
    const et = line.match(/Timeout:\s*(\d+)ms/);
    if (et && !rec.expectTimeoutMs) rec.expectTimeoutMs = Number(et[1]);
    if (/Test timeout of \d+ms exceeded/.test(line)) rec.testTimedOut = true;
  }
  return out;
}

/* 解析 playwright list reporter 的用例行。
   ✓ 行：  `...   ✓    9 [desktop-1280x800] › tests/e2e/i18n.spec.js:112:3 › 标题 (15.5s)`
   ✘ 行：  同上但前导是 ✘；重试成功会再多一条 `(retry #1)` 的 ✓ 行。 */
const CASE_RE = /[✓✘]\s+\d+\s+\[([^\]]+)\]\s+›\s+(tests\/e2e\/[^\s:]+):(\d+):(\d+)\s+›\s+(.*)$/;

/** 去掉结尾的 `(15.5s)` / `(retry #1)`，得到干净标题 */
export function cleanTitle(title) {
  return String(title || '')
    .replace(/\s*\(([\d.]+)(ms|s)\)\s*$/, '')
    .replace(/\s*\(retry #\d+\)\s*$/, '')
    .trim();
}

export function parseLog(raw) {
  const firstFail = new Map();
  const retryPass = new Map();
  for (const line of String(raw || '').split(/\r?\n/)) {
    const m = line.match(CASE_RE);
    if (!m) continue;
    const mark = m[0].trim().startsWith('✘') ? 'fail' : 'pass';
    const project = m[1], spec = m[2], ln = m[3];
    const title = m[5];
    const isRetry = /\(retry #\d+\)/.test(title);
    const dur = (title.match(/\(([\d.]+)(ms|s)\)\s*$/) || []);
    const durMs = dur[1] ? Number(dur[1]) * (dur[2] === 's' ? 1000 : 1) : null;
    const key = `${spec}:${ln} × ${project}`;
    const ct = cleanTitle(title);
    if (mark === 'fail' && !isRetry) {
      if (!firstFail.has(key)) firstFail.set(key, { spec, line: Number(ln), project, durMs, recovered: false, title: ct });
    } else if (mark === 'pass' && isRetry) {
      retryPass.set(key, durMs);
      if (firstFail.has(key)) firstFail.get(key).recovered = true;
    }
  }
  const g = (re) => { const m = String(raw || '').match(re); return m ? Number(m[1]) : 0; };
  const summary = {
    passed: g(/(\d+) passed/), failed: g(/(\d+) failed/),
    flaky: g(/(\d+) flaky/), didNotRun: g(/(\d+) did not run/),
    wall: (String(raw || '').match(/passed \(([\d.]+m)/) || [])[1] || null,
  };
  return { firstFail, retryPass, summary };
}

const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();

/** 按 **spec + 标题** 匹配观察目标 —— 行号不参与匹配（会漂） */
export function matchTarget(c, targets = TARGETS) {
  const ct = norm(c.title);
  for (const t of targets) {
    if (t.spec !== c.spec) continue;
    if (ct && norm(t.title) === ct) return t;
  }
  /* 标题对不上但 spec 对上了：多半是标题被改写过 ⇒ 交给 drift 去喊，不当成命中 */
  return null;
}

/**
 * 锚漂移检查：每个目标在样本里被观测到的行号集合；若登记的 line 不在其中 ⇒ 漂了。
 * （漂移本身不代表统计错 —— 已经改标题锚了 —— 但台账里的行号引用会误导下一个人。）
 */
export function drift(rows, targets = TARGETS) {
  const seen = new Map(); // target → Set(line)
  for (const r of rows) for (const c of (r.cases || [])) {
    const t = matchTarget(c, targets);
    if (!t) continue;
    if (!seen.has(t)) seen.set(t, new Set());
    seen.get(t).add(c.line);
  }
  return targets.map((t) => {
    const lines = [...(seen.get(t) || [])].sort((a, b) => a - b);
    return { spec: t.spec, title: t.title, registeredLine: t.line, observedLines: lines,
      drifted: lines.length > 0 && !lines.includes(t.line) };
  });
}

const median = (a) => {
  if (!a.length) return null;
  const s = a.slice().sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
};

/** 汇总：每个目标的首跑失败次数 / 重试恢复 / 硬失败 / 抖率 / 耗时中位 */
export function summarize(rows, targets = TARGETS) {
  const withLog = rows.filter((r) => !r.logError);
  const out = [];
  for (const t of targets) {
    let ff = 0, rec = 0, hard = 0;
    const fms = [], rms = [];
    for (const r of withLog) for (const c of (r.cases || [])) {
      if (matchTarget(c, targets) !== t) continue;
      ff++; c.recovered ? rec++ : hard++;
      if (c.firstAttemptMs != null) fms.push(c.firstAttemptMs);
      if (c.retryMs != null) rms.push(c.retryMs);
    }
    out.push({
      spec: t.spec, title: t.title,
      firstFail: ff, recovered: rec, hard,
      rate: withLog.length ? ff / withLog.length : null,
      firstAttemptMsMed: median(fms), retryMsMed: median(rms),
    });
  }
  return { sampleSize: withLog.length, targets: out };
}

/** 把 parseLog + parseErrors 合成一行行 case（CLI 与单测共用） */
export function buildCases(raw) {
  const { firstFail, retryPass, summary } = parseLog(raw);
  const errs = parseErrors(raw);
  const cases = [];
  for (const [key, v] of firstFail) {
    const e = errs.get(key) || {};
    cases.push({
      key, spec: v.spec, line: v.line, project: v.project, title: v.title ?? null,
      firstAttemptMs: v.durMs, recovered: v.recovered,
      retryMs: retryPass.has(key) ? retryPass.get(key) : null,
      err: e.err ?? null, expectTimeoutMs: e.expectTimeoutMs ?? null, testTimedOut: e.testTimedOut ?? false,
    });
  }
  return { summary, cases };
}
