/**
 * v2.2.0 i18n 名称类接线回归测试
 * 覆盖：品牌名双语（Agent 工坊 / Agent Workshop）、页脚/标题/logo 随语言切换、
 *       t() 在 MESSAGES TDZ 期的防御、setLang 持久化。
 */
import { describe, it, expect, beforeEach } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

describe("v2.2.0 i18n 品牌接线", () => {
  let win, __test;
  beforeEach(() => {
    win = loadApp();
    __test = win.__test;
    // 每例从 zh 开始
    __test.setLang("zh");
  });

  it("字典双语对齐：zh/en 的 app.name 与 onboard.welcome 均存在", () => {
    const M = __test.MESSAGES;
    expect(M.zh["app.name"]).toBe("Agent 工坊");
    expect(M.en["app.name"]).toBe("Agent Workshop");
    expect(M.zh["onboard.welcome"]).toBe("欢迎使用 Agent 工坊");
    expect(M.en["onboard.welcome"]).toBe("Welcome to Agent Workshop");
  });

  it("t() 正常取值与兜底", () => {
    expect(__test.t("app.name")).toBe("Agent 工坊");
    expect(__test.t("no.such.key", "兜底文案")).toBe("兜底文案");
    expect(__test.t("no.such.key")).toBe("no.such.key");
  });

  it("zh 页脚含「Agent 工坊」，切 en 后含「Agent Workshop」", () => {
    __test.render();
    let foot = win.document.querySelector("#main > .foot");
    expect(foot).toBeTruthy();
    expect(foot.textContent).toMatch(/Agent 工坊 · v/);
    expect(__test.setLang("en")).toBe(true);
    __test.render();
    foot = win.document.querySelector("#main > .foot");
    expect(foot.textContent).toMatch(/Agent Workshop · v/);
  });

  it("setLang('en') 后 document.title 变为 Agent Workshop", () => {
    expect(win.document.title).toBe("Agent 工坊");
    __test.setLang("en");
    expect(win.document.title).toBe("Agent Workshop");
    __test.setLang("zh");
    expect(win.document.title).toBe("Agent 工坊");
  });

  it("applyI18n 替换 data-i18n 静态节点（logo）", () => {
    const logoSpan = win.document.querySelector('.logo [data-i18n="app.name"]');
    expect(logoSpan).toBeTruthy();
    expect(logoSpan.textContent).toBe("Agent 工坊");
    __test.setLang("en");
    expect(logoSpan.textContent).toBe("Agent Workshop");
  });

  it("setLang 持久化到 localStorage 并在无效值时返回 false", () => {
    expect(__test.setLang("xx")).toBe(false);
    expect(__test.setLang("en")).toBe(true);
    expect(win.localStorage.getItem("wb_agent_lang")).toBe("en");
    __test.setLang("zh");
    expect(win.localStorage.getItem("wb_agent_lang")).toBe("zh");
  });
});
