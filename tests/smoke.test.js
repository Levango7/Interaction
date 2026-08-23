import { describe, it, expect } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

describe("测试基建自检", () => {
  it("loadApp 能加载 HTML 且 window.__test 已挂载", () => {
    const win = loadApp();
    expect(win).toBeDefined();
    expect(win.__test).toBeDefined();
    expect(typeof win.__test.execTool).toBe("function");
    expect(typeof win.__test.migrate).toBe("function");
    expect(Array.isArray(win.__test.ORDER)).toBe(true);
    expect(win.__test.ORDER.length).toBe(6);
  });

  it("window.__test 暴露关键函数（execTool / migrate / getTasks / getCfg / seed）", () => {
    const { __test } = loadApp();
    expect(typeof __test.execTool).toBe("function");
    expect(typeof __test.migrate).toBe("function");
    expect(typeof __test.getTasks).toBe("function");
    expect(typeof __test.getCfg).toBe("function");
    expect(typeof __test.seed).toBe("function");
    expect(typeof __test.sm2).toBe("function");
  });

  it("SCENARIOS 包含 6 个场景：office / design / study / data / code / life", () => {
    const { __test } = loadApp();
    const { SCENARIOS } = __test;
    expect(SCENARIOS).toBeDefined();
    expect(Object.keys(SCENARIOS).sort()).toEqual(["code", "data", "design", "life", "office", "study"]);
    for (const k of ["office", "data", "design", "study", "code", "life"]) {
      expect(SCENARIOS[k]).toBeDefined();
      expect(typeof SCENARIOS[k].name).toBe("string");
      expect(typeof SCENARIOS[k].sysprompt).toBe("string");
    }
  });

  it("ORDER 长度为 6 且与 SCENARIOS 键一致", () => {
    const { __test } = loadApp();
    expect(__test.ORDER).toHaveLength(6);
    expect(__test.ORDER).toEqual(["office", "data", "design", "study", "code", "life"]);
    __test.ORDER.forEach(k => {
      expect(__test.SCENARIOS[k]).toBeDefined();
    });
  });

  it("DEFAULT_LINKS 长度为 3 且每条 link 结构完整", () => {
    const { __test } = loadApp();
    const { DEFAULT_LINKS } = __test;
    expect(Array.isArray(DEFAULT_LINKS)).toBe(true);
    expect(DEFAULT_LINKS).toHaveLength(3);
    DEFAULT_LINKS.forEach(link => {
      expect(link.id).toBeDefined();
      expect(typeof link.name).toBe("string");
      expect(typeof link.fromSc).toBe("string");
      expect(typeof link.toSc).toBe("string");
      expect(typeof link.taskTitle).toBe("string");
    });
  });

  it("getCfg 返回对象（默认空对象）", () => {
    const { __test } = loadApp();
    const cfg = __test.getCfg();
    expect(cfg).toBeDefined();
    expect(typeof cfg).toBe("object");
    expect(Array.isArray(cfg)).toBe(false);
  });

  it("getTasks 返回数组（默认空数组）", () => {
    const { __test } = loadApp();
    const tasks = __test.getTasks();
    expect(Array.isArray(tasks)).toBe(true);
  });
});
