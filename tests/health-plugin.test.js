import { describe, it, expect, beforeEach } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

/**
 * 健康助手插件 · 回归验证
 * ----------------------------------------------------------------------------
 * 现状（v3.5.2 起）：健康已升级为**内置场景**（SCENARIOS.health，extraCard="health"，
 * 拥有独立记录字段：运动/体重/睡眠/饮水/饮食），生活场景 extraCard 回到 "life"。
 * 插件注册表中的 health 插件保留，语义变为「把健康卡挂载到生活场景」的可选开关，默认关闭：
 *   启用   → SCENARIOS.life.extraCard = "health"
 *   禁用/卸载 → SCENARIOS.life.extraCard = "life"
 * （早期 v1.14.1 的健康是纯插件、extraCard 复位为 "none"，该基线已不成立。）
 */

function freshWin() {
  const win = loadApp();
  win.localStorage.clear();
  return win;
}

describe("健康助手插件", () => {
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

  it("健康已是内置场景：SCENARIOS.health 自带 extraCard=health 且进入 ORDER", () => {
    const h = win.__test.SCENARIOS.health;
    expect(h, "健康应为内置场景").toBeTruthy();
    expect(h.extraCard).toBe("health");
    expect(h.record && Array.isArray(h.record.fields)).toBe(true);
    expect(win.__test.ORDER).toContain("health");
  });
});
