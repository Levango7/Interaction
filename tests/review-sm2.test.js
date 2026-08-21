import { describe, it, expect } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

describe("SM-2 算法", () => {
  it("首次良好(q=4)：interval=1, reps=1, ef 保持 2.5", () => {
    const win = loadApp();
    const { sm2 } = win.__test;
    const r = sm2(null, 4);
    expect(r.interval).toBe(1);
    expect(r.reps).toBe(1);
    // SM-2 标准：q=4 时 ef 增量 = 0.1 - 1*(0.08+0.02) = 0，ef 保持 2.5
    expect(r.ef).toBe(2.5);
    expect(r.nextReviewDays).toBe(1);
  });
  it("第二次良好：interval=6", () => {
    const win = loadApp();
    const { sm2 } = win.__test;
    let s = sm2(null, 4);
    s = sm2(s, 4);
    expect(s.interval).toBe(6);
    expect(s.reps).toBe(2);
  });
  it("第三次良好：interval=round(6*ef)", () => {
    const win = loadApp();
    const { sm2 } = win.__test;
    let s = sm2(null, 4);
    s = sm2(s, 4);
    s = sm2(s, 4);
    expect(s.interval).toBe(Math.round(6 * s.ef));
    expect(s.reps).toBe(3);
  });
  it("回答错误(q<3)：reps 归零, interval=1", () => {
    const win = loadApp();
    const { sm2 } = win.__test;
    let s = sm2(null, 4);
    s = sm2(s, 4);
    s = sm2(s, 2); // 再来
    expect(s.reps).toBe(0);
    expect(s.interval).toBe(1);
  });
  it("ef 下限 1.3", () => {
    const win = loadApp();
    const { sm2 } = win.__test;
    let s = { ef: 1.3, interval: 1, reps: 1 };
    s = sm2(s, 0); // 极差
    expect(s.ef).toBeGreaterThanOrEqual(1.3);
  });
  it("q=5 简单：ef 增长更多", () => {
    const win = loadApp();
    const { sm2 } = win.__test;
    const r4 = sm2(null, 4);
    const r5 = sm2(null, 5);
    expect(r5.ef).toBeGreaterThan(r4.ef);
  });
});