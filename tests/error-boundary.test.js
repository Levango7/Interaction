/**
 * T2.4 错误边界 · 回归验证
 * ----------------------------------------------------------------------------
 * 验证对象：
 *   ① 关键函数（render/execTool/chatOnce/saveCfg/migrate）异常时不崩溃，toast + pushDiag。
 *   ② localStorage schema 校验：tasks 必须数组、cfg 必须对象、links 必须数组；
 *      损坏数据自动备份到 *_broken_${ts} 并重置为默认。
 *   ③ render() 异常时显示 fallback UI（包含"数据异常"文案 + 导出/清空按钮）。
 *   ④ 全局 window.onerror / unhandledrejection 捕获异常，toast 提示 + 入诊断日志。
 *   ⑤ errorBoundary 相关函数已加入 window.__test 导出。
 *
 * 设计原则（遵循 test-discipline / anti-gaming）：
 *  - 黑盒优先：经 jsdom 全局访问 window.__test.*
 *  - 不修改任何生产文件；本文件为新增测试。
 *  - 断言「可观测行为」：返回值、是否抛错、localStorage 状态、toast 是否被调用、DOM 文案。
 *
 * 运行：npx vitest run tests/error-boundary.test.js
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

const PREFIX = "wb_agent_";

/** 取全新 window 并清空 storage，获得干净状态 */
function freshWin() {
  const win = loadApp();
  win.localStorage.clear();
  return win;
}

/** 等待 startup 异步完成，避免破坏全局函数时触发 unhandled rejection */
function waitForStartup(ms = 60) { return new Promise(r => setTimeout(r, ms)); }

describe("T2.4 错误边界 · 用例 A：损坏 localStorage 不崩溃", () => {
  let win;
  beforeEach(() => { win = freshWin(); win.__test.resetCorrupted(); });

  it("A1: wb_agent_tasks 存非法 JSON → load 返回默认 []、不抛、_corrupted 记录", () => {
    const KEY = PREFIX + "tasks";
    const BAD = "not json";
    win.localStorage.setItem(KEY, BAD);

    let threw = false;
    let result;
    try { result = win.load(KEY, []); } catch (e) { threw = true; }

    expect(threw).toBe(false);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toEqual([]);
    expect(win.__test.getCorrupted()[KEY]).toBe(BAD);
  });

  it("A2: wb_agent_cfg 存非法 JSON → load 返回默认 {}、不抛", () => {
    const KEY = PREFIX + "cfg";
    win.localStorage.setItem(KEY, "{broken json");

    let threw = false;
    let result;
    try { result = win.load(KEY, {}); } catch (e) { threw = true; }

    expect(threw).toBe(false);
    expect(result).toEqual({});
  });

  it("A3: 损坏 localStorage 下 getTasks/migrate/seed/render 均不抛", () => {
    win.localStorage.setItem(PREFIX + "tasks", "not json");
    win.localStorage.setItem(PREFIX + "cfg", "not json");
    win.localStorage.setItem(PREFIX + "links", "not json");

    let threw = false;
    try {
      win.getTasks();
      win.migrate();
      win.seed();
      win.render();
    } catch (e) { threw = true; }

    expect(threw).toBe(false);
  });
});

describe("T2.4 错误边界 · 用例 B：schema 校验 + 损坏数据备份重置", () => {
  let win;
  beforeEach(() => { win = freshWin(); win.__test.resetCorrupted(); });

  it("B1: tasks 存合法 JSON 但非数组（{broken:true}）→ migrate 备份 + 重置为 []", () => {
    const KEY = PREFIX + "tasks";
    const BAD_JSON = JSON.stringify({ broken: true });
    win.localStorage.setItem(KEY, BAD_JSON);

    let threw = false;
    try { win.migrate(); } catch (e) { threw = true; }
    expect(threw).toBe(false);

    // 重置为空数组
    const after = win.localStorage.getItem(KEY);
    expect(after).toBe("[]");

    // 备份到独立键（含原值）
    const backupKeys = Object.keys(win.localStorage).filter(k => k.startsWith(PREFIX + "tasks_broken_"));
    expect(backupKeys.length, "应备份到 tasks_broken_* 键").toBe(1);
    expect(win.localStorage.getItem(backupKeys[0])).toBe(BAD_JSON);
  });

  it("B2: cfg 存合法 JSON 但非对象（数组）→ migrate 备份 + 重置为 {}", () => {
    const KEY = PREFIX + "cfg";
    const BAD_JSON = JSON.stringify([1, 2, 3]);
    win.localStorage.setItem(KEY, BAD_JSON);

    win.migrate();

    expect(win.localStorage.getItem(KEY)).toBe("{}");
    const backupKeys = Object.keys(win.localStorage).filter(k => k.startsWith(PREFIX + "cfg_broken_"));
    expect(backupKeys.length, "应备份到 cfg_broken_* 键").toBe(1);
    expect(win.localStorage.getItem(backupKeys[0])).toBe(BAD_JSON);
  });

  it("B3: links 存合法 JSON 但非数组 → migrate 备份 + 重置为 DEFAULT_LINKS", () => {
    const KEY = PREFIX + "links";
    const BAD_JSON = JSON.stringify({ not: "array" });
    win.localStorage.setItem(KEY, BAD_JSON);

    win.migrate();

    const after = JSON.parse(win.localStorage.getItem(KEY));
    expect(Array.isArray(after)).toBe(true);
    expect(after.length).toBe(win.__test.DEFAULT_LINKS.length);

    const backupKeys = Object.keys(win.localStorage).filter(k => k.startsWith(PREFIX + "links_broken_"));
    expect(backupKeys.length, "应备份到 links_broken_* 键").toBe(1);
    expect(win.localStorage.getItem(backupKeys[0])).toBe(BAD_JSON);
  });

  it("B4: tasks 数组但单条缺 id/sc/title/status → migrate 补全字段", () => {
    const KEY = PREFIX + "tasks";
    // 单条只有 done 字段（最旧格式）
    win.localStorage.setItem(KEY, JSON.stringify([{ done: true, created: 12345 }]));

    win.migrate();

    const tasks = JSON.parse(win.localStorage.getItem(KEY));
    expect(tasks.length).toBe(1);
    const t = tasks[0];
    expect(t.id, "应补全 id").toBeDefined();
    expect(t.sc, "应补全 sc=office").toBe("office");
    expect(t.title, "应补全 title").toBeDefined();
    expect(t.status, "应补全 status=done（done=true）").toBe("done");
    expect(t.doneAt, "应补全 doneAt=created").toBe(12345);
    expect(t.tags, "应补全 tags=[]").toEqual([]);
  });

  it("B5: tasks 是合法数组 → migrate 不触发备份、不误重置", () => {
    const KEY = PREFIX + "tasks";
    const good = [{ id: "g1", sc: "office", title: "正常", status: "todo", doneAt: null, tags: [], created: 1 }];
    win.localStorage.setItem(KEY, JSON.stringify(good));

    win.migrate();

    const after = JSON.parse(win.localStorage.getItem(KEY));
    expect(after).toEqual(good);
    const backupKeys = Object.keys(win.localStorage).filter(k => k.startsWith(PREFIX + "tasks_broken_"));
    expect(backupKeys.length).toBe(0);
  });

  it("B6: 损坏 JSON（语法错误）→ migrate 不重置（保留原值供恢复，P0-4 契约）", () => {
    const KEY = PREFIX + "tasks";
    const BAD = "{bad"; // 语法错误
    win.localStorage.setItem(KEY, BAD);

    win.migrate();

    // 保留原值（load 已登记 _corrupted，migrate 不覆盖）
    expect(win.localStorage.getItem(KEY)).toBe(BAD);
  });
});

describe("T2.4 错误边界 · 用例 C：render 异常 fallback UI", () => {
  let win;
  beforeEach(() => { win = freshWin(); win.__test.resetCorrupted(); });

  it("C1: render 异常时 #main 显示 fallback UI（含「数据异常」文案 + 导出/清空按钮）", () => {
    // 破坏 renderSide 让 render 抛错（renderSide 是 render 第一步）
    const origRenderSide = win.renderSide;
    win.renderSide = function () { throw new Error("renderSide boom"); };

    let threw = false;
    try { win.render(); } catch (e) { threw = true; }

    expect(threw, "render 应捕获异常不抛").toBe(false);

    const main = win.document.getElementById("main");
    expect(main, "#main 应存在").toBeTruthy();
    const html = main.innerHTML;
    expect(html, "应含「数据异常」文案").toContain("数据异常");
    expect(html, "应含导出按钮").toContain("导出备份");
    expect(html, "应含清空按钮").toContain("清空数据");
    expect(html, "应含 var(--muted) 令牌").toContain("var(--muted)");
    expect(html, "应含 var(--danger) 令牌").toContain("var(--danger)");

    // 诊断日志应记录 render error（where 在 ctx 中）
    const diag = win.__test.getDiag();
    expect(diag.some(d => d.ctx && d.ctx.where === "render" && d.msg.includes("renderSide boom")), "应入诊断缓冲").toBe(true);

    win.renderSide = origRenderSide;
  });

  it("C2: render 异常时 toast 提示「渲染异常：...」", () => {
    const toastSpy = vi.spyOn(win, "toast");
    const origRenderSide = win.renderSide;
    win.renderSide = function () { throw new Error("boom for toast"); };

    win.render();

    expect(toastSpy).toHaveBeenCalled();
    const args = toastSpy.mock.calls.find(c => c[0].includes("渲染异常"));
    expect(args, "应调用 toast 提示渲染异常").toBeTruthy();
    expect(args[0]).toContain("boom for toast");
    expect(args[1]).toBe("error");

    win.renderSide = origRenderSide;
    toastSpy.mockRestore();
  });

  it("C3: render 正常时不触发 fallback UI（#main 不含「数据异常」）", () => {
    win.render();
    const main = win.document.getElementById("main");
    // 正常渲染下 #main 不应含 fallback 文案
    expect(main.innerHTML.includes("数据异常")).toBe(false);
  });
});

describe("T2.4 错误边界 · 用例 D：全局错误捕获", () => {
  let win;
  beforeEach(() => { win = freshWin(); win.__test.resetCorrupted(); });

  it("D1: window error 事件 → 入诊断缓冲 + toast 提示", () => {
    const toastSpy = vi.spyOn(win, "toast");
    const ev = new win.Event("error");
    ev.message = "global boom";
    ev.filename = "app.js";
    win.dispatchEvent(ev);

    const diag = win.__test.getDiag();
    expect(diag.some(d => d.ctx && d.ctx.where === "global" && d.msg === "global boom"), "应入诊断缓冲").toBe(true);
    expect(toastSpy, "应 toast 提示").toHaveBeenCalled();
    const args = toastSpy.mock.calls.find(c => c[0].includes("global boom"));
    expect(args, "toast 应含错误消息").toBeTruthy();
    expect(args[1]).toBe("error");

    toastSpy.mockRestore();
  });

  it("D2: window error 事件含 ev.error.message → 优先取 ev.error.message", () => {
    const ev = new win.Event("error");
    ev.error = new Error("detailed boom");
    ev.message = "fallback";
    win.dispatchEvent(ev);

    const diag = win.__test.getDiag();
    expect(diag.some(d => d.msg === "detailed boom"), "应优先取 ev.error.message").toBe(true);
  });

  it("D3: unhandledrejection 事件 → 入诊断缓冲 + toast 提示", () => {
    const toastSpy = vi.spyOn(win, "toast");
    const ev = new win.Event("unhandledrejection");
    ev.reason = new Error("async boom");
    win.dispatchEvent(ev);

    const diag = win.__test.getDiag();
    expect(diag.some(d => d.ctx && d.ctx.where === "unhandledrejection" && d.msg === "async boom"), "应入诊断缓冲").toBe(true);
    expect(toastSpy, "应 toast 提示").toHaveBeenCalled();
    const args = toastSpy.mock.calls.find(c => c[0].includes("async boom"));
    expect(args, "toast 应含异步错误消息").toBeTruthy();
    expect(args[1]).toBe("error");

    toastSpy.mockRestore();
  });

  it("D4: unhandledrejection reason 为字符串 → toast 含该字符串", () => {
    const toastSpy = vi.spyOn(win, "toast");
    const ev = new win.Event("unhandledrejection");
    ev.reason = "string reason";
    win.dispatchEvent(ev);

    const args = toastSpy.mock.calls.find(c => c[0].includes("string reason"));
    expect(args, "reason 为字符串时也应提示").toBeTruthy();

    toastSpy.mockRestore();
  });
});

describe("T2.4 错误边界 · 用例 E：关键函数 try-catch 不崩溃", () => {
  let win;
  beforeEach(() => { win = freshWin(); win.__test.resetCorrupted(); });

  it("E1: execTool 异常时返回结构化错误 + toast + pushDiag（不抛）", () => {
    const toastSpy = vi.spyOn(win, "toast");
    // 传 undefined args 让 execTool 内部 args.scenario 抛 TypeError
    let threw = false;
    let result;
    try { result = win.__test.execTool("create_task", undefined); } catch (e) { threw = true; }

    expect(threw, "execTool 应捕获异常不抛").toBe(false);
    expect(result, "应返回 JSON 字符串").toBeTypeOf("string");
    const rj = JSON.parse(result);
    expect(rj.ok).toBe(false);

    expect(toastSpy, "应 toast 提示").toHaveBeenCalled();
    const toastArgs = toastSpy.mock.calls.find(c => c[0].includes("工具执行异常"));
    expect(toastArgs, "toast 应含工具执行异常").toBeTruthy();
    expect(toastArgs[1]).toBe("error");

    const diag = win.__test.getDiag();
    expect(diag.some(d => d.ctx && d.ctx.where === "execTool"), "应入诊断缓冲").toBe(true);

    toastSpy.mockRestore();
  });

  it("E2: saveCfg 异常时 toast 提示「保存失败」+ 不抛", async () => {
    await waitForStartup();
    const toastSpy = vi.spyOn(win, "toast");
    // 删除 #cfgName 让 saveCfg 内部 $("#cfgName").value 抛 TypeError
    const cfgName = win.document.getElementById("cfgName");
    const parent = cfgName ? cfgName.parentNode : null;
    const next = cfgName ? cfgName.nextSibling : null;
    if (cfgName) cfgName.remove();

    let threw = false;
    try { await win.__test.saveCfg(); } catch (e) { threw = true; }

    expect(threw, "saveCfg 应捕获异常不抛").toBe(false);
    const args = toastSpy.mock.calls.find(c => c[0].includes("保存失败"));
    expect(args, "应 toast 提示保存失败").toBeTruthy();
    expect(args[1]).toBe("error");

    const diag = win.__test.getDiag();
    expect(diag.some(d => d.ctx && d.ctx.where === "saveCfg"), "应入诊断缓冲").toBe(true);

    // 恢复 #cfgName
    if (cfgName && parent) { parent.insertBefore(cfgName, next); }
    toastSpy.mockRestore();
  });

  it("E3: migrate 异常时 toast 提示 + 不抛", async () => {
    await waitForStartup();
    const toastSpy = vi.spyOn(win, "toast");
    // 破坏全局 migrateProfiles 让 migrate 内部调用抛错
    const origMigrateProfiles = win.migrateProfiles;
    win.migrateProfiles = function () { throw new Error("migrateProfiles boom"); };

    let threw = false;
    try { win.migrate(); } catch (e) { threw = true; }

    expect(threw, "migrate 应捕获异常不抛").toBe(false);
    const args = toastSpy.mock.calls.find(c => c[0].includes("数据迁移异常"));
    expect(args, "应 toast 提示迁移异常").toBeTruthy();
    expect(args[1]).toBe("error");

    const diag = win.__test.getDiag();
    expect(diag.some(d => d.ctx && d.ctx.where === "migrate"), "应入诊断缓冲").toBe(true);

    win.migrateProfiles = origMigrateProfiles;
    toastSpy.mockRestore();
  });
});

describe("T2.4 错误边界 · 用例 F：errorBoundary 函数已导出到 window.__test", () => {
  it("F1: _backupBroken / _validateAndMigrateTasks / _validateCfg / _validateLinks 已导出", () => {
    const win = loadApp();
    const T = win.__test;
    expect(typeof T._backupBroken).toBe("function");
    expect(typeof T._validateAndMigrateTasks).toBe("function");
    expect(typeof T._validateCfg).toBe("function");
    expect(typeof T._validateLinks).toBe("function");
  });

  it("F2: chatOnce / doExport 已导出", () => {
    const win = loadApp();
    const T = win.__test;
    expect(typeof T.chatOnce).toBe("function");
    expect(typeof T.doExport).toBe("function");
  });

  it("F3: _backupBroken 写入独立备份键", () => {
    const win = freshWin();
    win.__test._backupBroken("tasks", "raw-broken-data");
    const keys = Object.keys(win.localStorage).filter(k => k.startsWith(PREFIX + "tasks_broken_"));
    expect(keys.length).toBe(1);
    expect(win.localStorage.getItem(keys[0])).toBe("raw-broken-data");
  });
});
