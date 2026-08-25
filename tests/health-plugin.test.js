import { describe, it, expect, beforeEach } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

/**
 * 健康助手插件 · 回归验证（v1.14.1）
 * 定位决策：健康追踪从「生活场景内置卡片」改为「可选插件」，默认关闭，需要时在插件市场启用。
 * v2.5：生活场景默认 extraCard=life（健康摘要卡片），插件启用时切换为 health（健康概览卡片）。
 * 断言：extraCard 随插件启用/禁用/卸载切换（life ↔ health）。
 */

function freshWin() {
  const win = loadApp();
  win.localStorage.clear();
  return win;
}

describe("健康助手插件（v1.14.1）", () => {
  let win;
  beforeEach(() => { win = freshWin(); });

  it("默认关闭：生活场景 extraCard=life，插件已注册且 enabled=false", () => {
    expect(win.__test.SCENARIOS.life.extraCard).toBe("life");
    const p = win.__test.getPlugin("health");
    expect(p, "健康助手插件应存在").toBeTruthy();
    expect(p.enabled).toBe(false);
  });

  it("启用→生活场景挂载健康卡；禁用→恢复 life", () => {
    expect(win.__test.setPluginEnabled("health", true)).toBe(true);
    expect(win.__test.SCENARIOS.life.extraCard).toBe("health");
    expect(win.__test.getPlugin("health").enabled).toBe(true);

    expect(win.__test.setPluginEnabled("health", false)).toBe(true);
    expect(win.__test.SCENARIOS.life.extraCard).toBe("life");
  });

  it("卸载启用中的插件会触发 onDeactivate，extraCard 复位为 life", () => {
    win.__test.setPluginEnabled("health", true);
    expect(win.__test.SCENARIOS.life.extraCard).toBe("health");
    expect(win.__test.unloadPlugin("health")).toBe(true);
    expect(win.__test.SCENARIOS.life.extraCard).toBe("life");
  });
});
