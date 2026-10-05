/**
 * test-verdict.mjs —— 从 vitest 输出文本判定「真失败 / 仅环境抖动」
 * ----------------------------------------------------------------------------
 * 为什么需要：本机全量跑 vitest 时，`[vitest-worker]: Timeout calling "onTaskUpdate"`
 * 这类**未处理错误**会让退出码变成 1，即使**全部断言都通过**。
 * 本仓 CHANGELOG 从 v3.7.43 起三次记录同一现象（v3.7.65 / v3.7.89 亦有），
 * 并形成约定「退出码以 CI 为准」—— 但那会训练所有人忽略本机退出码，
 * 一旦某天真有回归也会被当成抖动略过。
 *
 * 本模块把两类信号分开，判定规则刻意保守：
 *   · 断言失败（`Tests N failed` 的 N>0，或 `Failed Tests` 段）→ **真失败**
 *   · 未处理错误若**全部**匹配已知抖动特征（vitest worker 的 onTaskUpdate 超时、
 *     沙箱/系统临时目录写入被拒）→ 视为抖动，**不改变结论**，但如实打印条数
 *   · 未处理错误里有**任何不匹配**已知特征的 → 仍判为**真失败**（不放过未知错误）
 * 即：只对「已被反复确认是环境噪声」的两类特征放行，其余一律按失败处理。
 *
 * 本模块是**纯函数**，不依赖子进程，因此可直接单测（见 tests/test-verdict.test.js）。
 */

/** 已知的环境抖动特征（命中即视为噪声） */
const BENIGN_PATTERNS = [
  /\[vitest-worker\]:\s*Timeout calling/i,                 // worker ↔ main IPC 超时（并行压力）
  /EPERM: operation not permitted, open .*[\\/]Temp[\\/]/i, // 临时目录写入被拒（沙箱/权限）
];

/**
 * 解析 vitest 输出，给出判定。
 * @param {string} raw vitest 的完整 stdout+stderr
 * @returns {{assertionFailed:number, testFilesFailed:number, unhandledTotal:number,
 *            unhandledBenign:number, unhandledUnknown:number, verdict:"pass"|"fail",
 *            reason:string, benignSamples:string[]}}
 */
export function verdictOf(raw) {
  const out = String(raw || "").replace(/\u001b\[[0-9;]*m/g, ""); // 剥 ANSI

  // 断言失败数：优先取汇总行 `Tests  N failed | M passed (T)`
  let assertionFailed = 0;
  const t = out.match(/^\s*Tests\s+(?:(\d+)\s+failed\s*\|\s*)?(\d+)\s+passed\s*\((\d+)\)/m);
  if (t) assertionFailed = t[1] ? Number(t[1]) : 0;
  else {
    // 没有汇总行（例如被中断）：退化为数 `Failed Tests` 段里的用例标记
    const seg = out.match(/Failed Tests\s+(\d+)/);
    if (seg) assertionFailed = Number(seg[1]);
  }

  let testFilesFailed = 0;
  const f = out.match(/^\s*Test Files\s+(?:(\d+)\s+failed\s*\|\s*)?(\d+)\s+passed\s*\((\d+)\)/m);
  if (f) testFilesFailed = f[1] ? Number(f[1]) : 0;

  // 未处理错误：先看汇总计数，再逐条抽取 `Unhandled Error` 块的首行做特征匹配。
  // 注意 `(?!s)`：vitest 的**小节标题**是复数 `──── Unhandled Errors ────`，
  // 若不加这个负向断言，它会被当成一条错误块，把计数多算 1（首版即栽在这里，被单测抓到）。
  const errCount = out.match(/^\s*Errors\s+(\d+)\s+error/m);
  const blocks = [...out.matchAll(/Unhandled Error(?!s)[^\n]*\n([\s\S]{0,400}?)(?=\n\s*\n|$)/g)]
    .map((m) => m[1].trim());

  let benign = 0, unknown = 0;
  const benignSamples = [];
  for (const b of blocks) {
    const hit = BENIGN_PATTERNS.find((re) => re.test(b));
    if (hit) { benign++; if (benignSamples.length < 3) benignSamples.push(b.split("\n")[0].slice(0, 120)); }
    else unknown++;
  }
  // 汇总计数存在但抽取不到块（格式变动）时，按「未知」计，避免静默放过
  const declared = errCount ? Number(errCount[1]) : 0;
  if (declared > blocks.length) unknown += declared - blocks.length;
  const unhandledTotal = Math.max(declared, blocks.length);

  let verdict = "pass", reason = "";
  if (assertionFailed > 0) {
    verdict = "fail";
    reason = `断言失败 ${assertionFailed} 条（${testFilesFailed} 个文件）—— 这是真失败，需修。`;
  } else if (unknown > 0) {
    verdict = "fail";
    reason = `无断言失败，但有 ${unknown} 条**未知**未处理错误 —— 不放过未识别的错误，按失败处理。`;
  } else if (unhandledTotal > 0) {
    verdict = "pass";
    reason = `全部断言通过；另有 ${benign} 条**已知环境抖动**（vitest worker 超时 / 临时目录写入被拒），不影响结论。`;
  } else {
    verdict = "pass";
    reason = "全部断言通过，且无未处理错误。";
  }

  return { assertionFailed, testFilesFailed, unhandledTotal, unhandledBenign: benign,
           unhandledUnknown: unknown, verdict, reason, benignSamples };
}

/** 供 CLI 打印的判定块 */
export function formatVerdict(v) {
  const lines = [];
  lines.push("");
  lines.push("──────────────── 判定 ────────────────");
  lines.push(`  断言失败     ${v.assertionFailed} 条` + (v.testFilesFailed ? `（${v.testFilesFailed} 个文件）` : ""));
  lines.push(`  未处理错误   ${v.unhandledTotal} 条（已知抖动 ${v.unhandledBenign} · 未知 ${v.unhandledUnknown}）`);
  lines.push(`  结论         ${v.verdict === "pass" ? "✅ 通过" : "❌ 失败"}`);
  lines.push(`  依据         ${v.reason}`);
  if (v.benignSamples.length) {
    lines.push("  抖动的具体内容（供核对）：");
    v.benignSamples.forEach((s) => lines.push(`    · ${s}`));
  }
  lines.push("──────────────────────────────────────");
  return lines.join("\n");
}
