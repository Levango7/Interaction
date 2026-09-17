/**
 * ai-config-readpath.test.js —— AI 配置「读写路径对称」回归测试（v3.7.19 修复）
 * ----------------------------------------------------------------------------
 * 背景（真实缺陷）：saveAiConfig 早已收敛到 save() 主入口（注释称此前直接 setItem 会
 *   「绕过 IDB 镜像/配额告警/损坏登记」），但 getAiConfig 仍**直接读 localStorage** ——
 *   读路径绕过了写路径已收敛的那套机制，可能出现「写进去了却读不到」。
 *   修复：读路径改走同一 store 的读入口 load()。
 *
 * 本文件守住三件事：
 *   ① 读到的就是写进去的（读写对称 —— 这是缺陷的本质）
 *   ② 缺失时返回 null（与旧行为一致，不能因修复而改变契约）
 *   ③ 值形态（对象/数组/原始值）经 store 往返后不变（load 会做 JSON 解析，需保证形态一致）
 */
import { describe, it, expect } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

describe("AI 配置读写路径对称（v3.7.19 修复）", () => {
  it("两个函数都挂在全局（数据层入口）", () => {
    const win = loadApp();
    expect(typeof win.getAiConfig).toBe("function");
    expect(typeof win.saveAiConfig).toBe("function");
  });

  it("① 读到的就是写进去的（对象）", () => {
    const win = loadApp();
    win.saveAiConfig("readpath_probe", { model: "gpt-x", temperature: 0.3, nested: { a: [1, 2] } });
    expect(win.getAiConfig("readpath_probe")).toEqual({ model: "gpt-x", temperature: 0.3, nested: { a: [1, 2] } });
  });

  it("③ 值形态经 store 往返后不变（数组 / 字符串 / 数字 / 布尔）", () => {
    const win = loadApp();
    win.saveAiConfig("shape_arr", [1, "a", true]);
    expect(win.getAiConfig("shape_arr")).toEqual([1, "a", true]);
    win.saveAiConfig("shape_str", "hello");
    expect(win.getAiConfig("shape_str")).toBe("hello");
    win.saveAiConfig("shape_num", 42);
    expect(win.getAiConfig("shape_num")).toBe(42);
    win.saveAiConfig("shape_bool", false);
    expect(win.getAiConfig("shape_bool")).toBe(false);
  });

  it("② 缺失时返回 null（与修复前一致，契约不变）", () => {
    const win = loadApp();
    expect(win.getAiConfig("never_saved_" + Date.now())).toBeNull();
  });

  it("覆盖写：后写的生效", () => {
    const win = loadApp();
    win.saveAiConfig("overwrite_probe", { v: 1 });
    win.saveAiConfig("overwrite_probe", { v: 2 });
    expect(win.getAiConfig("overwrite_probe")).toEqual({ v: 2 });
  });
});
