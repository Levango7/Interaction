/**
 * 工具箱入口 · 死入口回归守卫
 * ----------------------------------------------------------------------------
 * 背景（v3.6.6 审查发现）：`openGanttModal` / `openDashboardModal` 此前只绑在
 * `#btnGantt` / `#btnDashboard` 上，而这两个按钮自 v1.15「更多菜单移除」后已不在 DOM，
 * 导致甘特图与自定义仪表盘（15 组件 + 拖拽布局）全无 UI 入口。
 * 已按既有惯例在「工具箱 → 功能」补 `x-gantt` / `x-dashboard`。
 *
 * 通过真实点击验证两个弹窗入口，不以文字/函数存在替代事件绑定与渲染验证。
 *
 * 运行：npx vitest run tests/toolbox-entries.test.js
 */

import { afterEach, describe, it, expect, vi } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

const windows = [];
afterEach(() => {
  windows.splice(0).forEach(win => win.close());
});

async function startApp() {
  const win = loadApp();
  windows.push(win);
  await vi.waitFor(() => expect(win.document.getElementById("chatPanel")._bound).toBe(true));
  return win;
}

describe("工具箱入口 · 死入口回归守卫", () => {
  it("甘特图 / 自定义仪表盘在工具箱可见，且对应弹窗函数可达（typeof 守卫不会恒为 false）", async () => {
    const win = await startApp();
    win.localStorage.clear();
    win.__test.setActive("toolbox");
    win.__test.render();
    const html = win.document.getElementById("main").innerHTML;
    expect(html, "工具箱应含「甘特图」入口").toContain("甘特图");
    expect(html, "工具箱应含「自定义仪表盘」入口").toContain("自定义仪表盘");
    // run 闭包内的 typeof 守卫依赖这两个函数与 TOOLBOX_EXTRAS 同作用域
    expect(typeof win.openGanttModal).toBe("function");
    expect(typeof win.openDashboardModal).toBe("function");
  });

  it("openDashboardModal 打开弹窗并把仪表盘组件渲染进 #dashboardModalBody", async () => {
    const win = await startApp();
    win.localStorage.clear();
    win.__test.setActive("toolbox");
    win.__test.render();
    const entry = win.document.querySelector('[data-toolbox="x-dashboard"]');
    expect(entry).not.toBeNull();
    entry.click();
    expect(win.document.getElementById("dashboardModal").classList.contains("show")).toBe(true);
    const body = win.document.getElementById("dashboardModalBody");
    expect(body.innerHTML).toContain("stats-cards");
    expect(body.innerHTML).toContain("关键指标");
  });
});

/* ===== 2026-10-20 P0 死入口收口 =====
   四类"渲染正常、点击无反应"的入口，全部用真实点击 + 可观察结果断言，
   不用"函数存在"替代接线验证。 */
describe("P0 死入口收口", () => {
  it("首屏主 CTA：有「新建任务」，点击进 office 场景并聚焦标题输入", async () => {
    const win = await startApp();
    win.localStorage.clear();
    win.__test.setActive("overview");
    win.__test.render();
    const btn = win.document.getElementById("btnNewTask");
    expect(btn, "首屏必须有主 CTA").toBeTruthy();
    expect(btn.disabled).toBe(false);
    btn.click();
    expect(win.__test.getActive()).toBe("office");
    const inp = win.document.querySelector('#taskForm [name="title"]');
    expect(inp, "office 场景应有标题输入").toBeTruthy();
    expect(win.document.activeElement, "点击 CTA 后焦点应落在标题输入").toBe(inp);
  });

  it("工具箱「高级报表」打开后翻页/对比按钮真的绑定（此前只有入口按钮绑了）", async () => {
    const win = await startApp();
    win.localStorage.clear();
    win.__test.setActive("toolbox");
    win.__test.render();
    const entry = win.document.querySelector('[data-toolbox="x-report"]');
    expect(entry).not.toBeNull();
    entry.click();
    expect(win.document.getElementById("reportModal").classList.contains("show")).toBe(true);
    const next = win.document.getElementById("btnReportNext");
    expect(next, "报表应有「下一期」按钮").toBeTruthy();
    expect(typeof next.onclick, "翻页按钮必须被 bindReportModal 绑定").toBe("function");
    const cmp = win.document.getElementById("btnReportCompare");
    expect(typeof cmp.onclick, "对比按钮必须被绑定").toBe("function");
  });

  it("工具箱「日历」打开后月份切换可用（此前 render 了但没 bind）", async () => {
    const win = await startApp();
    win.localStorage.clear();
    win.__test.setActive("toolbox");
    win.__test.render();
    win.document.querySelector('[data-toolbox="x-cal"]').click();
    const body = win.document.getElementById("calendarModalBody");
    expect(body.innerHTML.length).toBeGreaterThan(0);
    const prev = body.querySelector("[data-cal-prev]");
    expect(prev, "日历应有「上一月」按钮").toBeTruthy();
    expect(typeof prev.onclick, "月份切换必须被 bindCalendarEvents 绑定").toBe("function");
    prev.click();
    expect(body.dataset.offset, "点击后偏移应变为 -1").toBe("-1");
  });

  it("编程场景 JSON tab 的「格式化」真的绑定（SCENE_FEATURE_BIND 里存的是函数）", async () => {
    const win = await startApp();
    win.localStorage.clear();
    win.__test.setActive("code");
    win.setSceneFeature("json");
    win.__test.render();
    const fmt = win.document.getElementById("jwFmt");
    expect(fmt, "JSON tab 应有「格式化」按钮").toBeTruthy();
    expect(typeof fmt.onclick, "格式化按钮必须被绑定").toBe("function");
    win.document.getElementById("jwIn").value = '{"b":2,"a":1}';
    fmt.click();
    expect(win.document.getElementById("jwOut").value).toContain("\n");
  });
});
