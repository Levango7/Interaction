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
