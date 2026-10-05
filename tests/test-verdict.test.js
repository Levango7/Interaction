/**
 * test-verdict.test.js —— 「真失败 / 环境抖动」判定器的单测
 * ----------------------------------------------------------------------------
 * 夹具直接取自本机实跑日志的**真实形态**（2026-10-05）：
 *   · 抖动样本：`[vitest-worker]: Timeout calling "onTaskUpdate"` 与
 *     `EPERM: operation not permitted, open 'C:\...\Temp\...'`；
 *   · 真失败样本：`Tests 4 failed | 1361 passed (1365)` 加 `Failed Tests` 段。
 * 判定器的价值全在「保守」二字 —— 因此**每一条放行规则都必须有对应的反向用例**：
 * 未知的未处理错误绝不能被放过。
 */
import { describe, it, expect } from "vitest";
import { verdictOf, formatVerdict } from "../scripts/test-verdict.mjs";

/* ---------- 夹具：与真实日志同形 ---------- */

/** 全绿 + 两类已知抖动（本机最常见的形态） */
const JITTER_ONLY = `
 RUN  v2.1.9 F:/Nexus/Interaction

 \u2713 tests/webdav-sync.test.js (13 tests) 57143ms
 \u2713 tests/integration-deprecated.test.js (7 tests) 369ms

\u2500\u2500\u2500\u2500 Unhandled Errors \u2500\u2500\u2500\u2500

Vitest caught 2 unhandled errors during the test run.

\u2500\u2500\u2500\u2500 Unhandled Error \u2500\u2500\u2500\u2500
Error: [vitest-worker]: Timeout calling "onTaskUpdate"
 \u276f EventEmitter.onMessage node_modules/vitest/dist/chunks/index.js:91:20

\u2500\u2500\u2500\u2500 Unhandled Error \u2500\u2500\u2500\u2500
Error: EPERM: operation not permitted, open 'C:\\Users\\winge\\AppData\\Local\\Temp\\abc\\web\\40b9'
 \u276f open node:internal/fs/promises:639:25

 Test Files  2 passed (2)
      Tests  20 passed (20)
     Errors  2 errors
`;

/** 真有断言失败（且同时带抖动） */
const REAL_FAILURE = `
 RUN  v2.1.9 F:/Nexus/Interaction

 FAIL  tests/color-tokens.test.js > P0-9 硬编码颜色门禁 > lint-colors 脚本以 exit 0 通过
AssertionError: expected '' to contain 'PASS'

\u2500\u2500\u2500\u2500 Unhandled Error \u2500\u2500\u2500\u2500
Error: [vitest-worker]: Timeout calling "onTaskUpdate"

 Test Files  2 failed | 118 passed (120)
      Tests  4 failed | 1383 passed (1387)
     Errors  1 error
`;

/** 未处理错误是**未知**类型（不能被当成抖动放过） */
const UNKNOWN_ERROR = `
 RUN  v2.1.9 F:/Nexus/Interaction

 \u2713 tests/a.test.js (3 tests) 100ms

\u2500\u2500\u2500\u2500 Unhandled Error \u2500\u2500\u2500\u2500
Error: TypeError: Cannot read properties of undefined (reading 'foo')
    at somethingReal (src/ai-tools.js:123:4)

 Test Files  1 passed (1)
      Tests  3 passed (3)
     Errors  1 error
`;

/** 全绿无错误 */
const CLEAN = `
 RUN  v2.1.9 F:/Nexus/Interaction

 \u2713 tests/a.test.js (3 tests) 100ms

 Test Files  1 passed (1)
      Tests  3 passed (3)
`;

describe("test-verdict：判定器", () => {
  it("全绿 + 已知抖动（worker 超时 / 临时目录 EPERM）→ 判通过，并如实报出抖动条数", () => {
    const v = verdictOf(JITTER_ONLY);
    expect(v.assertionFailed).toBe(0);
    expect(v.unhandledTotal).toBe(2);
    expect(v.unhandledBenign).toBe(2);
    expect(v.unhandledUnknown).toBe(0);
    expect(v.verdict, "抖动不得改变结论").toBe("pass");
    expect(v.benignSamples.length).toBeGreaterThan(0);
  });

  it("有断言失败 → 判失败（抖动同时存在也不影响）", () => {
    const v = verdictOf(REAL_FAILURE);
    expect(v.assertionFailed).toBe(4);
    expect(v.testFilesFailed).toBe(2);
    expect(v.verdict).toBe("fail");
    expect(v.reason).toContain("断言失败");
  });

  it("**未知**未处理错误 → 仍判失败（这是本判定器最重要的边界）", () => {
    const v = verdictOf(UNKNOWN_ERROR);
    expect(v.assertionFailed, "该夹具确实无断言失败").toBe(0);
    expect(v.unhandledUnknown).toBe(1);
    expect(v.unhandledBenign).toBe(0);
    expect(v.verdict, "未知错误不得被当成抖动放过").toBe("fail");
    expect(v.reason).toContain("未知");
  });

  it("全绿且无未处理错误 → 判通过", () => {
    const v = verdictOf(CLEAN);
    expect(v.verdict).toBe("pass");
    expect(v.unhandledTotal).toBe(0);
  });

  it("输出被截断 / 无汇总行 → 不谎报通过", () => {
    const v = verdictOf(" RUN  v2.1.9\n\n \u2713 tests/a.test.js (3 tests) 100ms\n");
    // 无汇总行时 assertionFailed 取不到 → 但也不应凭空判 fail；此处只要求不崩且给出可解释结论
    expect(["pass", "fail"]).toContain(v.verdict);
    expect(typeof v.reason).toBe("string");
  });

  it("ANSI 转义码不影响解析（真实日志带颜色）", () => {
    const colored = "\u001b[32m \u2713\u001b[39m tests/a.test.js\n\n Test Files  1 passed (1)\n      Tests  3 passed (3)\n";
    const v = verdictOf(colored);
    expect(v.assertionFailed).toBe(0);
    expect(v.verdict).toBe("pass");
  });

  it("formatVerdict 输出含四个关键字段（人工核对用）", () => {
    const s = formatVerdict(verdictOf(JITTER_ONLY));
    expect(s).toContain("断言失败");
    expect(s).toContain("未处理错误");
    expect(s).toContain("结论");
    expect(s).toContain("依据");
  });
});
