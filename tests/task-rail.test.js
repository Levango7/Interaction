/**
 * task-rail.test.js —— 右栏「今日任务」任务轨（2026-10-21 布局 v2）
 * ----------------------------------------------------------------------------
 * 定位依据 docs/PRODUCT.md §5：Today 是三个入口区之一，但"今天该做什么"不该要求先切页面。
 * 本文件钉四件事：
 *   ① 排序：逾期 → 今天 → 有日期 → 无日期；
 *   ② 计数只算 due ≤ 今天（与任务页口径一致）；
 *   ③ 勾选即完成（走 completeTask，不是只改 DOM）；
 *   ④ 空态可见、+ 走首屏同一个新建入口（切 office 并聚焦标题）。
 * 可见性/遮挡判据不在这里（jsdom 没有排版引擎），见 tests/e2e/layout-v2.spec.js。
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

const windows = [];
afterEach(() => windows.splice(0).forEach((win) => win.close()));

const today = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
const shift = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const mk = (id, title, due, priority = "mid") => ({
  id, sc: "office", title, status: "todo", priority,
  due, createdAt: "2026-10-20T10:00:00.000Z", updatedAt: "2026-10-20T10:00:00.000Z",
});

async function boot(tasks) {
  const win = loadApp();
  windows.push(win);
  await vi.waitFor(() => expect(win.document.getElementById("chatPanel")._bound).toBe(true));
  const list = typeof tasks === "function" ? tasks() : tasks;
  win.setTasks(list);
  win.render();
  return win;
}

describe("右栏今日任务轨", () => {
  it("排序：逾期 → 今天 → 有日期 → 无日期", async () => {
    const win = await boot([
      mk("t-nodue", "无日期任务", ""),
      mk("t-later", "以后的任务", shift(5)),
      mk("t-today", "今天的任务", today()),
      mk("t-over", "逾期任务", shift(-2)),
    ]);
    const titles = [...win.document.querySelectorAll("#taskRailList .task-rail-item .t")]
      .map((el) => el.textContent);
    expect(titles).toEqual(["逾期任务", "今天的任务", "以后的任务", "无日期任务"]);
  });

  it("计数只算 due ≤ 今天，并同步顶栏徽标", async () => {
    const win = await boot([
      mk("a", "逾期", shift(-1)), mk("b", "今天", today()), mk("c", "以后", shift(3)),
    ]);
    expect(win.document.getElementById("taskRailCount").textContent).toBe("2");
    expect(win.document.getElementById("taskRailBadge").textContent).toBe("2");
    expect(win.document.getElementById("taskRailBadge").classList.contains("u-hidden")).toBe(false);
  });

  it("勾选即完成：走 completeTask 后从任务轨消失", async () => {
    const win = await boot([mk("x", "要完成的任务", today()), mk("y", "另一条", shift(-1))]);
    const cb = win.document.querySelector('[data-rail-done="x"]');
    expect(cb, "应有勾选框").toBeTruthy();
    cb.click();
    await vi.waitFor(() => {
      expect(win.getTasks().find((t) => t.id === "x").status).toBe("done");
      expect(win.document.querySelector('[data-rail-done="x"]'), "完成后应离开任务轨").toBeFalsy();
    });
    expect(win.document.querySelectorAll("#taskRailList .task-rail-item").length).toBe(1);
  });

  it("空态可见，且 + 走首屏同一个新建入口（切 office + 聚焦标题）", async () => {
    const win = await boot([]);
    expect(win.document.querySelector("#taskRailList .task-rail-empty")
      .textContent).toContain("没有待办");
    win.document.getElementById("taskRailAdd").click();
    await vi.waitFor(() => {
      expect(win.document.getElementById("taskForm")).toBeTruthy();
      expect(win.document.activeElement && win.document.activeElement.getAttribute("name")).toBe("title");
    });
  });

  it("桌面折叠/展开：.rail-collapsed 往返并持久化", async () => {
    const win = await boot([mk("z", "一条", today())]);
    win.innerWidth = 1280;
    expect(win.document.querySelector(".body").classList.contains("rail-collapsed")).toBe(false);
    win.document.getElementById("taskRailCollapse").click();
    expect(win.document.querySelector(".body").classList.contains("rail-collapsed")).toBe(true);
    expect(win.load("wb_agent_task_rail_collapsed")).toBe("1");
    win.document.getElementById("btnTaskRail").click();
    expect(win.document.querySelector(".body").classList.contains("rail-collapsed")).toBe(false);
    expect(win.load("wb_agent_task_rail_collapsed")).toBe("0");
  });

  it("窄屏：顶栏按钮打开滑出层，Esc 与遮罩都能关", async () => {
    const win = await boot([mk("z", "一条", today())]);
    win.innerWidth = 800;
    const rail = win.document.getElementById("taskRail");
    const backdrop = win.document.getElementById("taskRailBackdrop");
    win.document.getElementById("btnTaskRail").click();
    expect(rail.classList.contains("open")).toBe(true);
    expect(backdrop.hidden).toBe(false);
    win.document.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(rail.classList.contains("open")).toBe(false);
    expect(backdrop.hidden).toBe(true);
    win.document.getElementById("btnTaskRail").click();
    backdrop.click();
    expect(rail.classList.contains("open")).toBe(false);
  });
});
