import { describe, it, expect, beforeEach } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

/**
 * 第四轮 批次④ · B8 AI 请求参数（超时/温度）可配置 —— 前端部分
 * -------------------------------------------------------------
 * saveCfg 从 DOM 输入框读值，因此走真实用户路径：设置输入框值 → saveCfg → getAiParams。
 * B7 托盘图标的 PNG 有效性测试见 round4-batch4-electron.test.js
 */
describe("B8 · getAiParams 参数读取与校验", () => {
  let win, __test;
  beforeEach(async () => {
    win = await loadApp();
    __test = win.__test;
  });

  // 走真实用户路径：写入设置抽屉输入框 → 保存 → 读回
  async function setParams(timeoutStr, tempStr) {
    const doc = win.document;
    const to = doc.getElementById("cfgAiTimeout");
    const te = doc.getElementById("cfgAiTemperature");
    if (to) to.value = timeoutStr;
    if (te) te.value = tempStr;
    await __test.saveCfg();
  }

  it("未配置时返回默认值（30s / 0.7）", () => {
    const p = __test.getAiParams();
    expect(p.timeoutSec).toBe(30);
    expect(p.temperature).toBe(0.7);
  });

  it("配置合法值时生效", async () => {
    await setParams("60", "1.2");
    const p = __test.getAiParams();
    expect(p.timeoutSec).toBe(60);
    expect(p.temperature).toBe(1.2);
  });

  it("超时低于 5 秒被钳制到 5", async () => {
    await setParams("1", "");
    expect(__test.getAiParams().timeoutSec).toBe(5);
  });

  it("超时高于 120 秒被钳制到 120", async () => {
    await setParams("999", "");
    expect(__test.getAiParams().timeoutSec).toBe(120);
  });

  it("温度低于 0 被钳制到 0", async () => {
    await setParams("", "-1");
    expect(__test.getAiParams().temperature).toBe(0);
  });

  it("温度高于 2 被钳制到 2", async () => {
    await setParams("", "5");
    expect(__test.getAiParams().temperature).toBe(2);
  });

  it("留空 = 使用默认值", async () => {
    await setParams("", "");
    const p = __test.getAiParams();
    expect(p.timeoutSec).toBe(30);
    expect(p.temperature).toBe(0.7);
  });
});
