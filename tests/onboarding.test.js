// 今日仪表盘 + Onboarding 引导测试
// 覆盖：greeting（按时间段返回问候语）、needsOnboarding（首次启动检测）、
//       renderOnboarding（生成 modal DOM）、引导完成后标记 onboarded。
// 策略：每个 it 用 loadApp 取独立 window，win.localStorage.clear() 重置后断言。

import { describe, it, expect } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

describe("今日仪表盘 + Onboarding", () => {
  it("greeting: 按时间段返回问候语", () => {
    const win = loadApp();
    const { greeting } = win.__test;
    const g = greeting();
    expect(["夜深了", "早安", "午安", "下午好", "晚上好"]).toContain(g);
  });

  it("needsOnboarding: 无任务且未引导 → true", () => {
    const win = loadApp();
    win.localStorage.clear();
    const { needsOnboarding } = win.__test;
    expect(needsOnboarding()).toBe(true);
  });

  it("needsOnboarding: 已标记引导 → false", () => {
    const win = loadApp();
    win.localStorage.clear();
    const { needsOnboarding, PREFIX } = win.__test;
    win.localStorage.setItem(PREFIX + "onboarded", "true");
    expect(needsOnboarding()).toBe(false);
  });

  it("needsOnboarding: 有任务 → false", () => {
    const win = loadApp();
    win.localStorage.clear();
    const { needsOnboarding, setTasks } = win.__test;
    setTasks([{ id: "t1", sc: "office", title: "测试", status: "todo", due: "2026-08-04", priority: "P1" }]);
    expect(needsOnboarding()).toBe(false);
  });

  it("renderOnboarding: 生成 modal DOM", () => {
    const win = loadApp();
    const { renderOnboarding } = win.__test;
    renderOnboarding();
    const modal = win.document.querySelector(".onboard-modal");
    expect(modal).toBeTruthy();
    // 第 1 步应包含欢迎标题
    expect(modal.textContent).toContain("欢迎使用 Agent 工坊");
  });

  it("onboarding 完成后标记 onboarded", () => {
    const win = loadApp();
    win.localStorage.clear();
    const { PREFIX } = win.__test;
    // 模拟完成引导
    win.localStorage.setItem(PREFIX + "onboarded", "true");
    expect(win.localStorage.getItem(PREFIX + "onboarded")).toBe("true");
  });

  it("renderToday: 仪表盘头部包含问候语 + Top3 + 习惯链状态条", () => {
    const win = loadApp();
    win.localStorage.clear();
    const { setTasks, setActive, render, greeting } = win.__test;
    // 造一个今日到期的任务
    const today = (function () {
      const d = new Date();
      const p = (n) => String(n).padStart(2, "0");
      return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
    })();
    setTasks([
      { id: "t1", sc: "office", title: "写周报", status: "todo", due: today, priority: "P1", created: Date.now() }
    ]);
    setActive("office");
    render();
    const main = win.document.querySelector("#main");
    expect(main.querySelector(".dashboard-hero")).toBeTruthy();
    expect(main.querySelector(".hero-greeting")).toBeTruthy();
    expect(main.querySelector(".top3-list")).toBeTruthy();
    expect(main.querySelector(".chain-bar")).toBeTruthy();
    // 问候语应出现在头部
    const g = greeting();
    expect(main.querySelector(".hero-greeting").textContent).toContain(g);
    // Top3 应包含任务标题
    expect(main.querySelector(".top3-list").textContent).toContain("写周报");
  });

  it("renderToday: 无任务时显示空态提示", () => {
    const win = loadApp();
    win.localStorage.clear();
    const { setActive, render } = win.__test;
    setActive("office");
    render();
    const main = win.document.querySelector("#main");
    expect(main.querySelector(".empty").textContent).toContain("今天没有待处理的事项");
  });

  it("renderToday: 习惯链状态条点击跳转场景", () => {
    const win = loadApp();
    win.localStorage.clear();
    const { setTasks, setActive, render, getActive } = win.__test;
    const today = (function () {
      const d = new Date();
      const p = (n) => String(n).padStart(2, "0");
      return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
    })();
    setTasks([
      { id: "t1", sc: "office", title: "交付功能", status: "todo", due: today, priority: "P1", created: Date.now() }
    ]);
    setActive("office");
    render();
    const pill = win.document.querySelector("[data-chain-sc]");
    expect(pill).toBeTruthy();
    // 点击第一个 chain-pill（from 场景）
    const fromSc = pill.dataset.chainSc;
    pill.click();
    expect(getActive()).toBe(fromSc);
  });
});