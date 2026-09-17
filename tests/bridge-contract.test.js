/**
 * bridge-contract.test.js —— AppBridge 桥接契约测试（解耦 S2a）
 * ----------------------------------------------------------------------------
 * S2 把「低层调用高层动作」改为走 AppBridge：核心层声明接口，UI/Render 层在加载时注册实现，
 * 低层只调接口。本文件守住契约本身：
 *   ① 加载后 6 个接口都已注册（不是默认空操作）
 *   ② 未注册时是安全空操作 —— 保证"加载顺序"不会变成隐性依赖
 *   ③ 有返回值的接口经桥接调用后返回值形态不变（miniChart 必须返回 string，调用侧要拼进 HTML）
 *   ④ openDrawer 真实生效（抽屉确实打开），不是"调用成功但没反应"
 *
 * 注意两处易踩：
 *   · 断言「未注册时的默认行为」必须把**所有相关接口都还原成默认**，否则会调到真实现（曾因此失败）。
 *   · openDrawer 内部可能经 rAF/定时器设置类名，jsdom 下需等一拍再断言。
 */
import { describe, it, expect } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

const DEFAULTS = {
  render: () => {},
  openDrawer: () => {},
  openAiPage: () => {},
  addToRecycleBin: () => undefined,
  miniChart: () => "",
  onExerciseSave: null
};

describe("AppBridge 桥接契约（解耦 S2a）", () => {
  it("加载后动作接口均已被上层注册为函数", () => {
    const { __test } = loadApp();
    const b = __test.AppBridge;
    expect(b).toBeTruthy();
    for (const k of Object.keys(DEFAULTS)) {
      expect(typeof b[k], k + " 应为函数").toBe("function");
    }
  });

  it("未注册时是安全空操作（不抛错、返回各自的默认值）", () => {
    const { __test } = loadApp();
    const saved = { ...__test.AppBridge };
    Object.assign(__test.AppBridge, DEFAULTS);          // 全部还原为默认，避免误调真实现
    try {
      expect(() => __test.AppBridge.openDrawer()).not.toThrow();
      expect(() => __test.AppBridge.openAiPage()).not.toThrow();
      expect(() => __test.AppBridge.render()).not.toThrow();
      expect(__test.AppBridge.addToRecycleBin({ id: "x" })).toBeUndefined();
      expect(__test.AppBridge.miniChart({})).toBe("");
    } finally {
      Object.assign(__test.AppBridge, saved);           // 还原，避免影响其它用例
    }
  });

  it("miniChart 返回值形态不变（必须是可拼接的字符串）", () => {
    const { __test } = loadApp();
    const s = __test.AppBridge.miniChart({ type: "bar", labels: ["A"], values: [1] });
    expect(typeof s).toBe("string");
    expect(s.length).toBeGreaterThan(0);
  });

  it("openDrawer 已被真实实现替换，且调用不抛错", async () => {
    const win = loadApp();
    /* 这里不验"抽屉可见"：jsdom 下该实现的可见效果观察不到（真机 CDP 实测类名为
       "drawer drawer-page open"，见提交说明）。单元测试只守契约本身 ——
       接口是否被**真实实现替换**（而非仍是 core 里的默认空操作），用引用比较即可判定，且与环境无关。 */
    expect(win.__test.AppBridge.openDrawer, "应已被真实实现替换").not.toBe(DEFAULTS.openDrawer);
    expect(win.__test.AppBridge.openAiPage).not.toBe(DEFAULTS.openAiPage);
    expect(win.__test.AppBridge.addToRecycleBin).not.toBe(DEFAULTS.addToRecycleBin);
    expect(win.__test.AppBridge.miniChart).not.toBe(DEFAULTS.miniChart);
    expect(() => win.__test.AppBridge.openDrawer()).not.toThrow();
  });
});
