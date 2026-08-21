import { describe, it, expect, beforeEach } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

/**
 * 第六轮 R5 · 工作记忆容量可配置（20~500，默认 60）
 * ----------------------------------------------------------------
 *   1) getMemMax 默认值与钳制
 *   2) saveMemories 按配置容量截断
 */
describe("R5 · 工作记忆容量可配置", () => {
  let win, __test;
  beforeEach(async () => {
    win = await loadApp();
    __test = win.__test;
  });

  it("getMemMax 未配置时返回默认 60", () => {
    expect(__test.getMemMax()).toBe(60);
  });

  it("getMemMax 合法配置生效", async () => {
    win.document.getElementById("cfgMemMax").value = "120";
    await __test.saveCfg();
    expect(__test.getMemMax()).toBe(120);
  });

  it("getMemMax 低于 20 钳制到 20，高于 500 钳制到 500", async () => {
    win.document.getElementById("cfgMemMax").value = "5";
    await __test.saveCfg();
    expect(__test.getMemMax()).toBe(20);
    win.document.getElementById("cfgMemMax").value = "999";
    await __test.saveCfg();
    expect(__test.getMemMax()).toBe(500);
  });

  it("留空回退默认 60", async () => {
    win.document.getElementById("cfgMemMax").value = "";
    await __test.saveCfg();
    expect(__test.getMemMax()).toBe(60);
  });

  it("记忆按配置容量环形截断", async () => {
    win.document.getElementById("cfgMemMax").value = "20";
    await __test.saveCfg();
    // 通过 execTool 的 remember 写入 25 条（走 addMemory → saveMemories 截断）
    for (let i = 0; i < 25; i++){
      JSON.parse(__test.execTool("remember", { text: "记忆条目" + i }, true));
    }
    const mem = JSON.parse(win.localStorage.getItem("wb_agent_memory"));
    expect(mem.length).toBe(20);
    // 环形截断保留最新的 20 条（第 5~24 条）
    expect(mem[0].text).toBe("记忆条目5");
    expect(mem[19].text).toBe("记忆条目24");
  });
});
