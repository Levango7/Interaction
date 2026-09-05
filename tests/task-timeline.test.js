/**
 * v3.4.7 批次五：任务时间机器回归
 * _emitTaskEvent 激活为事件日志（wb_agent_task_events，500 上限滚动）；
 * 侧栏「时间轴」页 renderTimelinePage 渲染 14 天 × 场景泳道（只读回放）。
 */
import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadApp } from "./helpers/loadApp.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HTML = path.resolve(__dirname, "..", "agent-workbench.html");
const PREFIX = "wb_agent_";
const EVENTS_KEY = PREFIX + "task_events";

describe("任务时间机器", () => {
  let win;
  beforeAll(() => {
    win = loadApp();
  });

  it("源码契约：事件持久化 + 路由 + 泳道渲染存在", () => {
    const src = fs.readFileSync(HTML, "utf8");
    expect(src).toMatch(/TASK_EVENTS_KEY = PREFIX \+ "task_events"/);
    expect(src).toMatch(/TASK_EVENTS_MAX = 500/);
    expect(src).toMatch(/active===.timeline.\)\{ renderTimelinePage/);
    expect(src).toMatch(/function renderTimelinePage/);
    expect(src).toMatch(/side\.menu\.timeline/);
  });

  it("运行时：_emitTaskEvent 追加事件（含 type/sc/title/ts）", () => {
    const w = loadApp();
    w._emitTaskEvent("task_create", { id: "t1", sc: "office", title: "写周报" });
    w._emitTaskEvent("task_complete", { id: "t1", sc: "office", title: "写周报" });
    const evs = JSON.parse(w.localStorage.getItem(EVENTS_KEY));
    expect(evs.length).toBe(2);
    expect(evs[0].type).toBe("task_create");
    expect(evs[0].sc).toBe("office");
    expect(evs[0].title).toBe("写周报");
    expect(typeof evs[0].ts).toBe("number");
    expect(evs[1].type).toBe("task_complete");
  });

  it("运行时：500 上限滚动（第 501 条丢弃最老一条）", () => {
    const w = loadApp();
    for(let i = 0; i < 505; i++){
      w._emitTaskEvent("task_create", { id: "x"+i, sc: "code", title: "任务"+i });
    }
    const evs = JSON.parse(w.localStorage.getItem(EVENTS_KEY));
    expect(evs.length).toBe(500);
    // 最老是 x5（x0-x4 被滚掉）
    expect(evs[0].title).toBe("任务5");
    expect(evs[499].title).toBe("任务504");
  });

  it("运行时：completeTask 真链路发事件（端到端）", () => {
    const w = loadApp();
    const tasks = [{ id: "tc1", title: "端到端", sc: "life", status: "todo", created: Date.now() }];
    w.localStorage.setItem(PREFIX + "tasks", JSON.stringify(tasks));
    w.completeTask("tc1");
    const evs = JSON.parse(w.localStorage.getItem(EVENTS_KEY));
    expect(evs.some((e) => e.type === "task_complete" && e.title === "端到端")).toBe(true);
  });

  it("运行时：时间轴页渲染 14 天列 + 场景行 + 返回按钮", () => {
    const w = loadApp();
    w._emitTaskEvent("task_create", { id: "t1", sc: "office", title: "今天的事" });
    w.renderTimelinePage();
    const main = w.document.getElementById("main");
    expect(main.innerHTML).toContain("tl-grid");
    // 14 个日期头（今天在最后）
    const hcells = main.querySelectorAll(".tl-hcell");
    expect(hcells.length).toBe(14);
    expect(hcells[13].classList.contains("today")).toBe(true);
    // 至少 6 场景行
    expect(main.querySelectorAll(".tl-row").length).toBeGreaterThanOrEqual(7); // head + 场景行
    // 返回按钮存在
    expect(w.document.getElementById("tlBack")).toBeTruthy();
    // 尾栏
    expect(main.querySelector(".foot")).toBeTruthy();
  });
});
