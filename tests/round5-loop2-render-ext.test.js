import { describe, it, expect, beforeEach } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

/**
 * 架构项② · 渲染扩展（Loop 2）回归测试
 * ----------------------------------------------------------------
 *   1) registerCard：自定义卡片注册 + 内置键保护 + 重复注册拒绝
 *   2) registerSceneSection：场景级/全局("*")扩展区注册
 *   3) getSceneSections：返回全局 + 场景专属合并列表
 *   4) renderSceneSections：渲染全部扩展区 + 渲染异常隔离
 */

describe("架构项② 渲染扩展", () => {
  let win, __test;
  beforeEach(async () => {
    win = await loadApp();
    __test = win.__test;
    __test.setTasks([]);
  });

  it("registerCard：注册自定义卡片成功", () => {
    const r = __test.registerCard("mycard", { render: () => "<div>hi</div>", bind: () => {} });
    expect(r.ok).toBe(true);
  });

  it("registerCard：拒绝覆盖内置卡片键", () => {
    expect(__test.registerCard("report", { render: () => "" }).ok).toBe(false);
    expect(__test.registerCard("none", { render: () => "" }).ok).toBe(false);
  });

  it("registerCard：拒绝重复注册与非法参数", () => {
    expect(__test.registerCard("dup", { render: () => "" }).ok).toBe(true);
    expect(__test.registerCard("dup", { render: () => "" }).ok).toBe(false);
    expect(__test.registerCard("", { render: () => "" }).ok).toBe(false);
    expect(__test.registerCard("x", { render: "notfn" }).ok).toBe(false);
  });

  it("registerSceneSection：场景级扩展区注册", () => {
    const r = __test.registerSceneSection("office", { render: () => "<div>office-sec</div>" });
    expect(r.ok).toBe(true);
  });

  it("getSceneSections：返回全局 + 场景专属合并", () => {
    __test.registerSceneSection("*", { render: () => "g" });
    __test.registerSceneSection("code", { render: () => "c" });
    const secs = __test.getSceneSections("code");
    expect(secs.length).toBe(2);
    expect(secs[0].render()).toBe("g");
    expect(secs[1].render()).toBe("c");
    // 未注册的场景只拿到全局段
    expect(__test.getSceneSections("study").length).toBe(1);
  });

  it("renderSceneSections：渲染全部扩展区并隔离渲染异常", () => {
    __test.registerSceneSection("*", { render: () => "<p>a</p>" });
    __test.registerSceneSection("*", { render: () => { throw new Error("boom"); } });
    __test.registerSceneSection("*", { render: () => "<p>b</p>" });
    const html = __test.renderSceneSections("office");
    expect(html).toContain("<p>a</p>");
    expect(html).toContain("<p>b</p>"); // 异常段被隔离，不影响后续段
  });

  it("bindSceneSections：绑定异常不抛出", () => {
    __test.registerSceneSection("life", { render: () => "", bind: () => { throw new Error("boom"); } });
    __test.registerSceneSection("life", { render: () => "", bind: () => {} });
    expect(() => __test.bindSceneSections("life")).not.toThrow();
  });

  it("bindSceneSections：无 bind 的扩展段安全跳过", () => {
    __test.registerSceneSection("study", { render: () => "x" });
    expect(() => __test.bindSceneSections("study")).not.toThrow();
  });
});
