import { afterEach, describe, expect, it, vi } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

const windows = [];
afterEach(() => windows.splice(0).forEach(win => win.close()));
async function boot(storage = {}) {
  const win = loadApp({ storage });
  windows.push(win);
  await vi.waitFor(() => expect(win.document.getElementById("chatPanel")._bound).toBe(true));
  return win;
}

describe("插件跨启动持久化", () => {
  it("启动恢复已启用插件和自定义配置，不用默认值覆盖存档", async () => {
    const state = {
      pomodoro: { enabled: true, config: { workMinutes: 37 } },
      weather: { enabled: false, config: { city: "test-city" } }
    };
    const win = await boot({ wb_agent_plugins: JSON.stringify(state) });
    expect(win.getPlugin("pomodoro").enabled).toBe(true);
    expect(win.getPluginConfig("pomodoro")).toEqual(state.pomodoro.config);
    expect(win.__test.ORDER).toContain("pomodoro");
    expect(win.getPluginConfig("weather")).toEqual(state.weather.config);
    expect(JSON.parse(win.localStorage.getItem("wb_agent_plugins"))).toMatchObject(state);
  });

  it("保存配置并重新打开页面后仍保留启用状态和配置", async () => {
    const first = await boot();
    first.setPluginEnabled("pomodoro", true);
    first.setPluginConfig("pomodoro", { workMinutes: 42 });
    const stored = first.localStorage.getItem("wb_agent_plugins");
    const second = await boot({ wb_agent_plugins: stored });
    expect(second.getPlugin("pomodoro").enabled).toBe(true);
    expect(second.getPluginConfig("pomodoro").workMinutes).toBe(42);
  });
});
