/**
 * render-scheduler.test.js —— 渲染调度契约测试（解耦 S3）
 * ----------------------------------------------------------------------------
 * S3 把 Data 层的「改完数据直接调 render()」改为 `markDirty()` 置脏 + 下一帧统一重绘。
 * 这个文件把两个契约锁住：
 *   ① **合帧**：同一帧内 N 次数据变更 → 只渲染 1 次（这是性能收益的来源）
 *   ② **不丢渲染**：置脏后下一帧一定会渲染一次（不能为了合并而漏掉刷新）
 *
 * 测试手法：把 AppBridge.render 换成计数器（记录调用次数），再驱动 markDirty，
 * 用 setTimeout 等过一帧后断言次数 —— 不依赖 rAF（jsdom 默认不跑 rAF，实现里有 setTimeout 回退）。
 */
import { describe, it, expect } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

const wait = (win, ms) => new Promise((r) => win.setTimeout(r, ms));

describe("渲染调度 markDirty（解耦 S3）", () => {
  it("markDirty 已挂在全局（数据层可直接调用）", () => {
    const win = loadApp();
    expect(typeof win.markDirty).toBe("function");
  });

  it("同一帧内多次置脏 → 只渲染一次（合帧）", async () => {
    const win = loadApp();
    const real = win.__test.AppBridge.render;
    let n = 0;
    win.__test.AppBridge.render = () => { n++; };
    try {
      for (let i = 0; i < 5; i++) win.markDirty();
      expect(n, "同步阶段不应立刻渲染（要等到下一帧）").toBe(0);
      await wait(win, 120);
      expect(n, "5 次变更应合并为 1 次渲染").toBe(1);
    } finally {
      win.__test.AppBridge.render = real;
    }
  });

  it("置脏后下一帧一定会渲染一次（不丢刷新）", async () => {
    const win = loadApp();
    const real = win.__test.AppBridge.render;
    let n = 0;
    win.__test.AppBridge.render = () => { n++; };
    try {
      win.markDirty();
      await wait(win, 120);
      expect(n).toBe(1);
      /* 再置脏一次 → 应再渲染一次（脏标记被正确复位） */
      win.markDirty();
      await wait(win, 120);
      expect(n).toBe(2);
    } finally {
      win.__test.AppBridge.render = real;
    }
  });

  it("渲染抛异常不应影响数据写入（置脏是旁路）", async () => {
    const win = loadApp();
    const real = win.__test.AppBridge.render;
    win.__test.AppBridge.render = () => { throw new Error("boom"); };
    try {
      win.markDirty();
      await wait(win, 120);
      /* 关键：抛异常后下一次置脏仍能正常调度（_dirty 已被复位） */
      let called = 0;
      win.__test.AppBridge.render = () => { called++; };
      win.markDirty();
      await wait(win, 120);
      expect(called).toBe(1);
    } finally {
      win.__test.AppBridge.render = real;
    }
  });
});
