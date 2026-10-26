/**
 * flaky-freq.test.js —— 抖动频次统计工具的单测（2026-10-27 随入库一起补）
 * ----------------------------------------------------------------------------
 * 这个工具的价值全在**数得准**：数漏了会得出「这条其实不抖」的假结论，
 *   而假结论会直接导向「抬超时预算」这种错处置（台账 R-9 续五定过：饥饿型抖动抬预算无效）。
 *
 * 每条都钉死一个真实踩过的坑：
 *   ① **行号漂移仍要数得到** —— 原稿按行号锚，`ics-import-render:82` 漂到 `:87` 之后
 *      统计恒为 0，看起来"不抖了"，其实只是没数到。现改标题锚，两个行号都要归到同一条。
 *   ② **反向对照**：同 spec 同行的另一条用例不得被算进来（标题锚也不能误吃邻居）。
 *   ③ 重试恢复 vs 硬失败要分开（决定这条是"抖"还是"真红"）。
 *   ④ 标题锚匹配前必须剥掉 `(15.5s)` / `(retry #1)` 尾巴，否则永远匹配不上。
 *   ⑤ 行号漂移要**报出来**（台账里的行号引用得跟着更新），但**不影响统计**。
 *   ⑥ 饥饿指纹（Test timeout of Nms exceeded）要从失败详情块里读出来。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  TARGETS, buildCases, parseLog, parseErrors, cleanTitle, matchTarget, summarize, drift,
} from "../scripts/lib/flaky-freq.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TITLE = "导入 .ics → 刷新 → 日历不崩且当日有徽章，点徽章出详情";
const SPEC = "tests/e2e/ics-import-render.spec.js";

const logAt = (line, { retry = false, hard = false } = {}) => [
  `     ✘  12 [tablet-768x1024] › ${SPEC}:${line}:3 › ${TITLE} (31.2s)`,
  retry ? `     ✓  13 [tablet-768x1024] › ${SPEC}:${line}:3 › ${TITLE} (retry #1) (18.4s)` : null,
  hard ? `   1) [tablet-768x1024] › ${SPEC}:${line}:3 › ${TITLE}` : null,
  hard ? `      Error: expect(received).toBe(expected)` : null,
  hard ? `      Test timeout of 30000ms exceeded` : null,
  `   1 failed, ${retry ? 1 : 0} flaky, 60 passed (2.1m)`,
].filter(Boolean).join("\n");

describe("R-22 尾账工具 · 行号漂移到标题锚", () => {
  it("① 行号从 82 漂到 87，标题锚仍把两条都数到（原稿行号锚会漏掉后一条）", () => {
    const rows = [
      { cases: buildCases(logAt(82)).cases },
      { cases: buildCases(logAt(87)).cases },
    ];
    const { targets } = summarize(rows, [{ spec: SPEC, title: TITLE, line: 82 }]);
    expect(targets[0].firstFail, "两条样本都要计入，不能因为行号变了就漏").toBe(2);
  });

  it("①b 反向对照：行号锚在这个场景下确实会漏（证明上面那条不是白测）", () => {
    const rows = [{ cases: buildCases(logAt(87)).cases }];
    const byLine = rows[0].cases.filter((c) => `${c.spec}:${c.line}` === `${SPEC}:82`).length;
    expect(byLine, "按登记的 82 去数 ⇒ 一条都数不到（这就是原稿的 bug）").toBe(0);
    const byTitle = rows[0].cases.filter((c) => matchTarget(c, [{ spec: SPEC, title: TITLE, line: 82 }]));
    expect(byTitle.length).toBe(1);
  });

  it("② 同 spec 同行的另一条用例不得被算进来", () => {
    const other = `     ✘  12 [tablet-768x1024] › ${SPEC}:87:3 › 完全另一条用例 (9.9s)\n   1 failed, 60 passed (2.1m)`;
    const rows = [{ cases: buildCases(other).cases }];
    const { targets } = summarize(rows, [{ spec: SPEC, title: TITLE, line: 87 }]);
    expect(targets[0].firstFail).toBe(0);
  });

  it("③ 重试恢复 vs 硬失败要分开数", () => {
    const rows = [
      { cases: buildCases(logAt(87, { retry: true })).cases },
      { cases: buildCases(logAt(87, { hard: true })).cases },
    ];
    const { targets } = summarize(rows, [{ spec: SPEC, title: TITLE, line: 87 }]);
    expect(targets[0].firstFail).toBe(2);
    expect(targets[0].recovered).toBe(1);
    expect(targets[0].hard).toBe(1);
  });

  it("④ 标题匹配前必须剥掉耗时与 retry 尾巴", () => {
    expect(cleanTitle(`${TITLE} (31.2s)`)).toBe(TITLE);
    expect(cleanTitle(`${TITLE} (retry #1) (18.4s)`)).toBe(TITLE);
    const { cases } = buildCases(logAt(87, { retry: true }));
    expect(cases[0].title).toBe(TITLE);
  });

  it("⑤ 行号漂移要报出来，但不影响统计", () => {
    const rows = [{ cases: buildCases(logAt(87)).cases }];
    const d = drift(rows, [{ spec: SPEC, title: TITLE, line: 82 }]);
    expect(d[0].drifted, "登记 82 / 实测 87 ⇒ 必须报漂移").toBe(true);
    expect(d[0].observedLines).toEqual([87]);
    const { targets } = summarize(rows, [{ spec: SPEC, title: TITLE, line: 82 }]);
    expect(targets[0].firstFail, "报漂移归报漂移，统计一个都不能少").toBe(1);
  });

  it("⑥ 饥饿指纹：Test timeout of Nms exceeded 要读出来", () => {
    const errs = parseErrors(logAt(87, { hard: true }));
    const rec = [...errs.values()][0];
    expect(rec.testTimedOut).toBe(true);
    expect(rec.err).toContain("expect(received)");
  });

  it("⑦ 工具自带的四条 TARGETS 标题必须与仓库里真实存在的标题一致（改标题要同步改这里）", () => {
    for (const t of TARGETS) {
      const src = readFileSync(join(ROOT, t.spec), "utf8");
      expect(src, `${t.spec} 应含登记标题`).toContain(t.title);
    }
  });

  it("⑧ parseLog 的 summary 要能读出 flaky 计数", () => {
    const { summary } = parseLog(logAt(87, { retry: true }));
    expect(summary.failed).toBe(1);
    expect(summary.flaky).toBe(1);
    expect(summary.passed).toBe(60);
  });
});
