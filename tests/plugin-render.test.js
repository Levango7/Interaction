import { describe, it, expect, beforeEach } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

/**
 * 插件场景/卡片渲染接线 · 回归验证（v1.14.1）
 * 验证 getPluginScenarios / getPluginCards 已接入渲染层：
 *   - 启用带 scenarios 的插件 → 场景并入 SCENARIOS/ORDER（侧栏/统计/命令面板可见）
 *   - 禁用 → 场景移除
 *   - 启用带 cards 的插件 → renderPluginCards 产出卡片 HTML
 */

function freshWin() {
  const win = loadApp();
  win.localStorage.clear();
  return win;
}

describe("插件场景/卡片渲染接线（v1.14.1）", () => {
  let win;
  beforeEach(() => { win = freshWin(); });

  it("默认无插件场景：ORDER 仅内置六场景", () => {
    expect(win.__test.ORDER).toEqual(["office", "design", "study", "data", "code", "life"]);
  });

  it("启用场景插件 → 场景并入 SCENARIOS/ORDER；禁用 → 移除", () => {
    win.__test.setPluginEnabled("pomodoro", true);
    expect(win.__test.ORDER).toContain("pomodoro");
    expect(win.__test.SCENARIOS.pomodoro).toBeTruthy();
    expect(win.__test.SCENARIOS.pomodoro.name).toBe("笃行");

    win.__test.setPluginEnabled("pomodoro", false);
    expect(win.__test.ORDER).not.toContain("pomodoro");
    expect(win.__test.SCENARIOS.pomodoro).toBeUndefined();
  });

  it("启用卡片插件 → renderPluginCards 产出卡片；禁用 → 空", () => {
    win.__test.setPluginEnabled("budget", true);
    expect(win.__test.renderPluginCards()).toContain("预算概览");

    win.__test.setPluginEnabled("budget", false);
    expect(win.__test.renderPluginCards()).toBe("");
  });
});
