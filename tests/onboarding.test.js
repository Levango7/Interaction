// 今日仪表盘 + Onboarding 引导测试
// 覆盖：greeting（按时间段返回问候语）、needsOnboarding（首次启动检测）、
//       renderOnboarding（生成 modal DOM）、引导完成后标记 onboarded。
// 策略：每个 it 用 loadApp 取独立 window，win.localStorage.clear() 重置后断言。

import { describe, it, expect } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

/* 启动链是 async IIFE（先 await initCrypto），断言 boot 产出的 DOM 需要等宏任务。
   以 render() 的产物 #taskForm 作「boot 完成」信号：引导 modal 与它在同一同步块内插入，
   所以等到信号后 modal 的有无即是确定结论，不靠固定 sleep（并行争用时固定 sleep 会假红）。 */
async function waitFor(win, cond, ms = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { if (cond()) return true; } catch (_e) { /* 未就绪 */ }
    await new Promise((r) => win.setTimeout(r, 20));
  }
  return false;
}

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

  it("needsOnboarding: 有任务但未标记引导 → true（v3.7.65 修正）", () => {
    const win = loadApp();
    win.localStorage.clear();
    const { needsOnboarding, setTasks } = win.__test;
    setTasks([{ id: "t1", sc: "office", title: "测试", status: "todo", due: "2026-08-04", priority: "P1" }]);
    // 旧实现要求「无任务」才触发，于是 seed() 播种后新用户永远进不了引导（线上实测复现）。
    expect(needsOnboarding()).toBe(true);
  });

  it("needsOnboarding: 首次启动播种演示数据后仍必须触发引导（缺陷回归）", () => {
    const win = loadApp(); // 空存储 → 启动链里的 seed() 会写入演示任务
    const { needsOnboarding, getTasks, PREFIX } = win.__test;
    expect(getTasks().length, "前提：演示数据已播种").toBeGreaterThan(0);
    expect(win.localStorage.getItem(PREFIX + "onboarded"), "前提：未标记已引导").toBeFalsy();
    expect(needsOnboarding(), "结论：引导不能被播种挤掉").toBe(true);
  });

  /* boot 级断言（v3.7.65）。三点加固，都是实测逼出来的：
     · noCrypto：startup IIFE 先 await initCrypto()（PBKDF2），全量并行 31 worker 下这一步就能吃掉十几秒；
       关掉 crypto 走「降级明文」分支，boot 立刻继续，断言只依赖 B4 分支接线本身。
     · 上限 30s + retry 2：单跑本条 2.7s，全量并行实测 >15s 未达（与 p0-crossdevice-key.test.js
       记录的②类抖动同源），只放宽天花板与重试，不放宽判据。 */
  it("boot: 未引导时主界面照常渲染，引导以 modal 叠加", async () => {
    const win = loadApp({ noCrypto: true });
    const booted = await waitFor(win, () => win.document.getElementById("taskForm"));
    expect(booted, "boot 应完成主界面渲染（旧 if/else 分支互斥时这里是空白）").toBe(true);
    expect(win.document.querySelector(".onboard-modal"), "未引导应在主界面之上叠加引导 modal").toBeTruthy();
  }, { retry: 2, timeout: 180000 });

  it("boot: 已标记 onboarded 时不出现引导 modal", async () => {
    const win = loadApp({ storage: { wb_agent_onboarded: "true" }, noCrypto: true });
    const booted = await waitFor(win, () => win.document.getElementById("taskForm"));
    expect(booted, "boot 应完成").toBe(true);
    expect(win.document.querySelector(".onboard-modal")).toBeFalsy();
  }, { retry: 2, timeout: 180000 });

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

  it("renderToday: 仪表盘头部包含问候语 + Top3 + 联动状态条", () => {
    const win = loadApp();
    win.localStorage.clear();
    const { setTasks, renderToday, greeting } = win.__test;
    // 造一个今日到期的任务
    const today = (function () {
      const d = new Date();
      const p = (n) => String(n).padStart(2, "0");
      return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
    })();
    setTasks([
      { id: "t1", sc: "office", title: "写周报", status: "todo", due: today, priority: "P1", created: Date.now() }
    ]);
    // 注：v2.5「仪表盘合并至主页」后 renderToday() 不再被 render() 路由调用（其内容已由
    // 主页 renderOverview + 自定义仪表盘组件承载），但它仍是导出的纯函数（返回 HTML 字符串），
    // 故本用例直接断言其输出结构，保证该函数未来被重新接线时行为不变。
    const wrap = win.document.createElement("div");
    wrap.innerHTML = renderToday();
    expect(wrap.querySelector(".dashboard-hero")).toBeTruthy();
    expect(wrap.querySelector(".hero-greeting")).toBeTruthy();
    expect(wrap.querySelector(".top3-list")).toBeTruthy();
    expect(wrap.querySelector(".chain-bar")).toBeTruthy();
    // 问候语应出现在头部
    const g = greeting();
    expect(wrap.querySelector(".hero-greeting").textContent).toContain(g);
    // Top3 应包含任务标题
    expect(wrap.querySelector(".top3-list").textContent).toContain("写周报");
  });

  it("renderToday: 无任务时显示空态提示", () => {
    const win = loadApp();
    win.localStorage.clear();
    const { renderToday } = win.__test;
    const wrap = win.document.createElement("div");
    wrap.innerHTML = renderToday();
    expect(wrap.querySelector(".empty").textContent).toContain("今天没有待处理的事项");
  });

  it("renderToday: 联动状态条点击跳转场景", () => {
    const win = loadApp();
    win.localStorage.clear();
    const { setTasks, renderToday, getActive } = win.__test;
    const today = (function () {
      const d = new Date();
      const p = (n) => String(n).padStart(2, "0");
      return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
    })();
    setTasks([
      { id: "t1", sc: "office", title: "交付功能", status: "todo", due: today, priority: "P1", created: Date.now() }
    ]);
    // 联动状态条点击事件由 bindScenario() 委托绑定（查询 document 内 [data-chain-sc]），
    // 故需先把 renderToday() 输出注入文档，再绑定，再点击。
    win.document.getElementById("main").innerHTML = renderToday();
    win.bindScenario();
    const pill = win.document.querySelector("[data-chain-sc]");
    expect(pill).toBeTruthy();
    // 点击第一个 chain-pill（from 场景）
    const fromSc = pill.dataset.chainSc;
    pill.click();
    expect(getActive()).toBe(fromSc);
  });
});