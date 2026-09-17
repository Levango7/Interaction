/**
 * sql.js 加载器 · 基址回退顺序回归
 * ----------------------------------------------------------------------------
 * 背景：SQL Playground 与 RAG 依赖 sql.js。原先硬编码 CDN，首次使用必须联网。
 * 现改为候选基址逐级回退：cfg.sqlJsBase → assets/sql/（随包发布）→ CDN。
 *
 * 这段逻辑的价值全在"顺序"与"失败降级"上，写错了不会报错、只会静默走 CDN，
 * 所以必须用会失败的用例守住，而不是只断言函数存在。
 *
 * 本文件守护四点：
 *   ① 未配置 cfg.sqlJsBase → 首选 assets/sql/（本地优先）
 *   ② 本地不可达 → 自动降级到 CDN
 *   ③ 显式配置 cfg.sqlJsBase → 只用它，不再兜底 CDN（尊重用户选择）
 *   ④ window.initSqlJs 已存在 → 直接复用，不重复插脚本
 *
 * 运行：npx vitest run tests/sqljs-loader.test.js
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

const PREFIX = "wb_agent_";
const CDN_JS = "https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/sql-wasm.js";
let win;

afterEach(() => { if (win) win.close(); win = undefined; vi.restoreAllMocks(); });

/** 载入应用（cfg 必须启动前注入，getCfg 启动时读入内存） */
async function boot(cfg) {
  win = loadApp({ storage: { [PREFIX + "cfg"]: JSON.stringify(cfg || {}) } });
  await vi.waitFor(
    () => expect(win.document.getElementById("chatPanel")._bound).toBe(true),
    { timeout: 15000, interval: 100 }
  );
  return win;
}

/**
 * 替换脚本加载：记录每次 src，并按 failFor 决定该 URL 是否加载失败。
 * 加载成功时注入 window.initSqlJs，模拟真实脚本的行为。
 */
function stubLoader(failFor = []) {
  const attempts = [];
  const origCreate = win.document.createElement.bind(win.document);
  win.document.createElement = function (tag) {
    if (String(tag).toLowerCase() !== "script") return origCreate(tag);
    const el = { tagName: "SCRIPT", _src: "" };
    Object.defineProperty(el, "src", {
      configurable: true,
      get() { return this._src; },
      set(v) {
        this._src = v;
        attempts.push(v);
        setTimeout(() => {
          if (failFor.some((f) => v.includes(f))) {
            if (el.onerror) el.onerror(new Error("simulated load failure: " + v));
          } else {
            win.initSqlJs = function () { return { ok: true }; };
            if (el.onload) el.onload();
          }
        }, 0);
      },
    });
    return el;
  };
  win.document.head.appendChild = function () { /* 由上面的 setTimeout 触发结果 */ };
  return attempts;
}

describe("sql.js 加载器 · 基址回退", () => {
  it("① 未配置 cfg.sqlJsBase → 首选本地 assets/sql/", async () => {
    const w = await boot({});
    const attempts = stubLoader();
    await w.__test.loadSqlJs();
    expect(attempts[0]).toBe("assets/sql/sql-wasm.js");
  });

  it("② 本地不可达 → 降级到 CDN", async () => {
    const w = await boot({});
    const attempts = stubLoader(["assets/sql/"]);
    await w.__test.loadSqlJs();
    expect(attempts).toHaveLength(2);
    expect(attempts[0]).toBe("assets/sql/sql-wasm.js");
    expect(attempts[1]).toBe(CDN_JS);
  });

  it("③ 显式配置 cfg.sqlJsBase → 只用它，失败也不兜底 CDN", async () => {
    const w = await boot({ sqlJsBase: "https://my.host/sqljs" });
    const attempts = stubLoader(["my.host"]);
    await expect(w.__test.loadSqlJs()).rejects.toThrow();
    expect(attempts).toEqual(["https://my.host/sqljs/sql-wasm.js"]);
  });

  it("④ window.initSqlJs 已存在 → 直接复用，不插脚本", async () => {
    const w = await boot({});
    w.initSqlJs = function () { return { ok: true }; };
    const attempts = stubLoader();
    await w.__test.loadSqlJs();
    expect(attempts).toHaveLength(0);
  });
});
