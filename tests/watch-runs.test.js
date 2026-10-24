/**
 * watch-runs.test.js —— 「守 CI 到终态」的判定器（scripts/watch-runs.mjs 的 judge()）
 * ----------------------------------------------------------------------------
 * 为什么值得单独测：这类工具坏掉时，症状与"任务还没跑完"完全同形（台账 R-28 记过两次：
 * 匹配器失效 ⇒ 0 命中 ⇒ 被读成"没有抖动"；共享 watch-run.sh 把环境变量写成字面量 ⇒ 恒 parse-fail）。
 * 所以钉的不是"它能打印"，而是**每条判定维度**：queued 不算完成、查询失败不算完成、空集不许算成功、
 * 结论缺失不许当成功。
 */
import { describe, expect, it } from "vitest";
import { exitCodeFor, judge } from "../scripts/watch-runs.mjs";

const run = (over) => Object.assign({ id: 1, name: "CI", status: "completed", conclusion: "success", attempt: 1 }, over || {});

describe("judge()：CI 终态判定", () => {
  it("全部 completed/success ⇒ done 且 green", () => {
    const v = judge([run(), run({ id: 2, name: "Deploy to GitHub Pages" })]);
    expect(v.done).toBe(true);
    expect(v.green).toBe(true);
    expect(v.line).toContain("CI=completed/success");
  });

  it("留在 in_progress ⇒ 未完成（不许提前收工）", () => {
    const v = judge([run(), run({ id: 2, status: "in_progress" })]);
    expect(v.done).toBe(false);
    expect(v.green).toBe(false);
    expect(v.pending).toBe(1);
  });

  it("queued 也是未完成 —— 这是踩过的坑：只看 in_progress 会把排队的 run 判成跑完了", () => {
    const v = judge([run(), run({ id: 2, status: "queued", conclusion: null })]);
    expect(v.done).toBe(false);
    expect(v.line).toContain("queued/-");
  });

  it("查询失败（null）不许当成完成，也不许当成绿", () => {
    const v = judge([run(), null]);
    expect(v.done).toBe(false);
    expect(v.green).toBe(false);
    expect(v.unknown).toBe(1);
    expect(v.line).toContain("query-failed");
  });

  it("completed 但结论是 failure ⇒ 判完成、判非绿，并点名是谁", () => {
    const v = judge([run(), run({ id: 2, name: "e2e", conclusion: "failure" })]);
    expect(v.done).toBe(true);
    expect(v.green).toBe(false);
    expect(v.notGreen.map((r) => r.name)).toEqual(["e2e"]);
  });

  it("completed 但结论缺失（null）⇒ 不算成功（防'没报结论=通过'）", () => {
    const v = judge([run({ conclusion: null })]);
    expect(v.done).toBe(true);
    expect(v.green).toBe(false);
  });

  it("空集不许算成功（没有证据不等于全绿）", () => {
    const v = judge([]);
    expect(v.done).toBe(false);
    expect(v.green).toBe(false);
  });
});

/* 退出码是这门工具的对外契约：CI 判据要能被脚本消费，不能只靠人看输出。
   7 专门留给"没判完"——它与 1（有非 success 终态）必须分开，否则"没等到"会被写成"通过了/失败了"。 */
describe("exitCodeFor()：判定 → 退出码", () => {
  it("全绿 ⇒ 0", () => {
    expect(exitCodeFor(judge([run()]))).toBe(0);
  });
  it("已终态但有非 success ⇒ 1", () => {
    expect(exitCodeFor(judge([run({ conclusion: "failure" })]))).toBe(1);
  });
  it("未终态 ⇒ 7（NOT_TERMINAL，不与 1 混用）", () => {
    expect(exitCodeFor(judge([run({ status: "in_progress", conclusion: null })]))).toBe(7);
  });
  it("空集/查询失败 ⇒ 7（判据缺失，不许当 0）", () => {
    expect(exitCodeFor(judge([]))).toBe(7);
    expect(exitCodeFor(judge([null]))).toBe(7);
  });
});
