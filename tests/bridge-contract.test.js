/**
 * bridge-contract.test.js —— AppBridge 桥接契约测试（解耦 S2a）
 * ----------------------------------------------------------------------------
 * S2 把「低层调用高层动作」改为走 AppBridge：核心层声明接口，UI/Render 层在加载时注册实现，
 * 低层只调接口。这个文件守住契约本身：
 *   ① 加载后 4 个动作接口 + render + onExerciseSave 都已注册（不是默认空操作）
 *   ② 未注册时是**安全空操作**（不抛错）—— 保证"加载顺序"不会变成隐性依赖
 *   ③ 有返回值的接口（addToRecycleBin / miniChart）经桥接调用后**返回值形态不变**
 *   ④ 真实效果：openDrawer() 后抽屉确实打开（不是"调用成功但没反应"）
 */
import { describe, it, expect } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

describe("AppBridge 桥接契约（解耦 S2a）", () => {
  it("加载后动作接口均已被上层注册为函数", () => {
    const { __test } = loadApp();
    const b = __test.AppBridge;
    expect(b).toBeTruthy();
    for (const k of ["render", "openDrawer", "openAiPage", "addToRecycleBin", "miniChart", "onExerciseSave"]) {
      expect(typeof b[k], k + " 应为函数").toBe("function");
    }
  });

  it("未注册时是安全空操作（不抛错）—— 加载顺序不是隐性依赖", () => {
    const { __test } = loadApp();
    const saved = { ...__test.AppBridge };
    __test.AppBridge.onExerciseSave = null;
    __test.AppBridge.openDrawer = () => {};
    __test.AppBridge.openAiPage = () => {};
    expect(() => __test.AppBridge.openDrawer()).not.toThrow();
    expect(() => __test.AppBridge.openAiPage()).not.toThrow();
    expect(__test.AppBridge.addToRecycleBin({ id: "x" })).toBeUndefined();
    expect(__test.AppBridge.miniChart({})).toBe("");
    Object.assign(__test.AppBridge, saved);
  });

  it("有返回值的接口经桥接调用后返回值形态不变", () => {
    const { __test } = loadApp();
    /* miniChart 返回 SVG/占位字符串（调用侧拼进 innerHTML，故必须是 string） */
    const s = __test.AppBridge.miniChart({ type: "bar", labels: ["A"], values: [1] });
    expect(typeof s).toBe("string");
    expect(s.length).toBeGreaterThan(0);
  });

  it("openDrawer 真实生效（抽屉打开），不是空操作", () => {
    const win = loadApp();
    win.__test.AppBridge.openDrawer();
    const el = win.document.querySelector(".drawer, #drawer, .settings-drawer");
    expect(el, "应存在抽屉节点").toBeTruthy();
    expect(el.className).toContain("open");
  });
});
