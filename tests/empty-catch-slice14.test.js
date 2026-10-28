/**
 * empty-catch-slice14.test.js —— R-2 续集第一批（4 个 ui-ge-* 文件，8 处 P0 空 catch 消解）
 * ----------------------------------------------------------------------------
 * 背景：`lint-empty-catch` 报全仓 55 处 P0（空 catch 静默吞真实错误）。B8-a 第一片（ui-ge-api 11 处）
 * 已由 `6bd9a97` 消解并复核（`docs/audit-2026-10-06.md` R-38）。本片取 4 个小文件共 8 处：
 *   ui-ge-pomodoro.js 2 · ui-ge-theme.js 2 · ui-ge-calendar.js 2 · ui-ge-notes.js 2 ⇒ 全仓 55 → 47。
 *
 * 处方沿用 B8-a 那套（已被 R-38 复核过）：**具名 pushDiag + where + 错误原文**，
 * **控制流一字不改**，二次保护包住诊断调用本身（否则"上报失败"会升级成未处理拒绝）。
 *
 * 本批 8 处的共同性质，一句话：
 *   **失败被渲染成了「没有」** —— 番茄计数/任务耗时静默丢失、主题刷新回退、重置不彻底、
 *   某日"没有会议/任务"、搜索结果"没有匹配"、HTML 正文混标签进检索。
 *   与 R-34「假回执」同族：不是崩，是**界面说了与真相相反的话**。
 *
 * ────────────────────────────────────────────────────────────────────────────
 * 关于「有没有行为测试」——本文件是**两段式**，历史值得记下来：
 *   首版**一行行为测试都写不出来**。原因不是懒：这 4 个文件当时都没有外部入口 ——
 *   唯一看似有出口的 theme 走 `AppBridge`，而 `AppBridge` 是 core.js:94 的 `const`、**从未挂到 window**
 *   （`grep -rn "window.AppBridge" src/` 零命中）。首版按 `win.AppBridge.setTheme()` 写，报的是
 *   `TypeError: Cannot read properties of undefined (reading 'setTheme')` —— 看着像被测代码坏了，其实是没出口。
 *   当时只能退成纯源码契约锁，并把这条**结构性障碍**记进 CHANGELOG 的「已知欠账」。
 *
 *   随后补了一批**测试出口**（`if(typeof window !== "undefined" && window.__test)` 挂载，
 *   与 ui-ge-api 的既有做法一致；只挂出口、不新增业务逻辑、不改生产路径）：
 *     ui-ge-theme    → setTheme / _resetThemeSystem
 *     ui-ge-pomodoro → _pomoTick / _saveTaskElapsed / getTaskTime
 *     ui-ge-calendar → _evCollectDay / openEventDetail
 *     ui-ge-notes    → searchAll / _ragFileText
 *   ⇒ 于是 ①②③ 组变成**真行为测试**（真调用、真断言诊断），④⑤ 组仍是源码契约回归锁。
 *   ⚠️ 但 8 处里仍有两处的**失败路径**没做到行为驱动（calendar 的依赖在闭包链更深处、
 *      notes 的 searchAll 内部异常源不稳定）—— 这两处只有「正常路径不许有诊断」的反向对照 +
 *      下面的契约锁。**别把整份文件读成「8 处都已行为验证」**，射程见各 describe 的说明。
 * ────────────────────────────────────────────────────────────────────────────
 *
 * 运行：npm run test:local -- tests/empty-catch-slice14.test.js
 *      （必须走 test:local：loadApp 有源码态守卫，直跑 npx vitest 会全量假失败）
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import { loadApp } from "./helpers/loadApp.js";
import { scanSource } from "../scripts/lib/empty-catch.mjs";

let win, diagCalls;
const orig = {};

function installProbes() {
  diagCalls = [];
  const origDiag = win.pushDiag;
  win.pushDiag = function (level, msg, ctx) {
    diagCalls.push({ level, msg: String(msg), ctx });
    return origDiag && origDiag.apply(win, arguments);
  };
}

const hasDiag = (re) => diagCalls.find((d) => re.test(d.msg));
const readSrc = (f) => fs.readFileSync("src/" + f, "utf8");
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

beforeEach(async () => {
  win = loadApp({ storage: {} });
  await new Promise((r) => setTimeout(r, 60));
  orig.setItem = win.Storage.prototype.setItem;
  installProbes();
});

afterEach(() => {
  if (orig.setItem) win.Storage.prototype.setItem = orig.setItem;
  try { win.close(); } catch (_e) { /* jsdom 关闭失败不影响断言 */ }
});

const breakStorage = () => {
  win.Storage.prototype.setItem = function () { throw new Error("QuotaExceededError"); };
};

describe("① 真行为 · theme：持久化失败必须留痕，且切换照旧生效", () => {
  it("setItem 抛错 → 诊断点名 setTheme，且不得改成「失败就返回 false」", () => {
    breakStorage();
    let ret;
    try { ret = win.setTheme("dark"); } catch (e) { ret = "THREW:" + ((e && e.message) || e); }
    expect(ret, "持久化失败不得让主题切换返回 false —— 内存切换是原有语义，必须保住").not.toBe(false);
    const hit = hasDiag(/theme persist failed/i);
    expect(hit, "不报的话，刷新后主题回退，用户会以为「设置没生效」").toBeTruthy();
    expect(hit.ctx && hit.ctx.where).toBe("setTheme");
  });

  it("反向对照：一切正常时不许出现这条诊断（否则上一条可能是恒真）", () => {
    const ret = win.setTheme("light");
    expect(ret, "正常路径应当成功").toBe(true);
    expect(hasDiag(/theme persist failed/i), "正常路径混进失败诊断 = 把「永远报失败」当可观测").toBeFalsy();
  });
});

describe("② 真行为 · pomodoro：任务耗时落盘失败必须留痕", () => {
  it("setItem 抛错 → 诊断点名 _saveTaskElapsed，且调用本身不抛（控制流不变）", () => {
    breakStorage();
    let threw;
    try { win._saveTaskElapsed("t-r2", 9000); } catch (e) { threw = (e && e.message) || String(e); }
    expect(threw, "落盘失败不得把异常抛给调用方 —— 计时器不该因为存储满了而崩").toBeUndefined();
    const hit = hasDiag(/task elapsed persist failed/i);
    expect(hit, "不报的话，累计耗时会静默回退到上次成功值，统计失真且无痕").toBeTruthy();
    expect(hit.ctx && hit.ctx.where).toBe("_saveTaskElapsed");
  });

  it("反向对照：正常落盘时不报这条", () => {
    win._saveTaskElapsed("t-r2-ok", 1000);
    expect(hasDiag(/task elapsed persist failed/i)).toBeFalsy();
  });
});

describe("③ 真行为 · 正常路径的反向对照（calendar / notes 的失败路径未做到行为驱动，见文件头射程说明）", () => {
  it("_evCollectDay 正常返回数组，且不许有「收集失败」诊断", () => {
    let out, err;
    try { out = win._evCollectDay("2026-10-29"); } catch (e) { err = (e && e.message) || String(e); }
    expect(err, "_evCollectDay 不应抛错").toBeUndefined();
    expect(Array.isArray(out), "返回值应始终是数组（调用方直接 forEach）").toBe(true);
    expect(hasDiag(/day meetings collect failed|day tasks collect failed/),
      "正常路径混进失败诊断 = 把「永远报失败」当可观测").toBeFalsy();
  });

  it("searchAll 正常返回结构，且不许有「搜索不完整」诊断", () => {
    let out, err;
    try { out = win.searchAll("zzz_no_match_zzz", {}); } catch (e) { err = (e && e.message) || String(e); }
    expect(err, "searchAll 不应抛错").toBeUndefined();
    expect(out && typeof out.total, "返回值必须带 total（UI 直接用）").toBe("number");
    expect(hasDiag(/search partial/i), "正常路径不该报「结果不完整」").toBeFalsy();
  });
});

describe("④ 源码契约回归锁：8 处具名留痕不许被删、where 不许写错、必须包二次保护", () => {
  const EXPECT = [
    ["ui-ge-pomodoro.js", "pomo count persist failed", "_savePomoCount"],
    ["ui-ge-pomodoro.js", "task elapsed persist failed", "_saveTaskElapsed"],
    ["ui-ge-theme.js", "theme persist failed", "setTheme"],
    ["ui-ge-theme.js", "theme reset incomplete", "_resetThemeSystem"],
    ["ui-ge-calendar.js", "day meetings collect failed", "_evCollectDay"],
    ["ui-ge-calendar.js", "day tasks collect failed", "_evCollectDay"],
    ["ui-ge-notes.js", "html extract failed", "_ragFileText"],
    ["ui-ge-notes.js", "search partial", "searchAll"]
  ];

  it("每条都能在源码里找到 pushDiag 消息，且同一调用带正确的 where", () => {
    for (const [f, msg, where] of EXPECT) {
      const raw = readSrc(f);
      expect(raw, f + " 里的「" + msg + "」被删了 —— 留痕没了，这条 P0 会悄悄回来").toContain(msg);
      const re = new RegExp(esc(msg) + "[\\s\\S]{0,200}?where\\s*:\\s*\"" + where + "\"");
      expect(re.test(raw), f + " 的诊断 where 应为 " + where).toBe(true);
    }
  });

  it("每处留痕都必须包二次保护（否则「上报失败」自己再抛会升级成未处理拒绝）", () => {
    for (const [f, msg] of EXPECT) {
      const raw = readSrc(f);
      const i = raw.indexOf(msg);
      const around = raw.slice(Math.max(0, i - 120), i + 260);
      expect(/try\{[\s\S]{0,80}pushDiag/.test(around),
        f + " 的 " + msg + " 没包在 try 里 —— 上报自己抛错会变成未处理拒绝").toBe(true);
      expect(/catch\s*\(\s*_e2\s*\)/.test(around), f + " 的 " + msg + " 缺 catch(_e2) 二次保护").toBe(true);
    }
  });
});

describe("⑤ 消解不许回退（P0 计数锁）", () => {
  it("这 4 个文件的 P0 必须为 0", () => {
    for (const f of ["ui-ge-pomodoro.js", "ui-ge-theme.js", "ui-ge-calendar.js", "ui-ge-notes.js"]) {
      const p0 = scanSource(readSrc(f), f).filter((i) => i.level === "P0");
      expect(p0.length, f + " 又出现 P0：" + p0.map((i) => ":" + i.line).join(" ")).toBe(0);
    }
  });

  it("全仓 P0 总数 ≤ 47（本批 55 → 47，不许回涨）", () => {
    const files = fs.readdirSync("src").filter((f) => f.endsWith(".js"));
    let n = 0;
    for (const f of files) {
      n += scanSource(readSrc(f), f).filter((i) => i.level === "P0").length;
    }
    expect(n, "P0 回涨说明有人新增了静默吞错，或把本批的留痕删了").toBeLessThanOrEqual(47);
  });
});

describe("⑥ 反向对照：不该被动的地方没被动", () => {
  it("ui-ge-api.js:63 必须仍是 P0（R-38 判定「刻意保留」的迁移路径）", () => {
    const p0 = scanSource(readSrc("ui-ge-api.js"), "ui-ge-api.js").filter((i) => i.level === "P0");
    expect(p0.length, "这条是「用异常做控制流」的合理写法；改掉它说明有人没读 R-38").toBe(1);
    expect(p0[0].line).toBe(63);
  });

  it("本批只动 4 个文件：其它文件里不该出现本批的留痕标记", () => {
    const mine = ["ui-ge-pomodoro.js", "ui-ge-theme.js", "ui-ge-calendar.js", "ui-ge-notes.js", "ui-ge-api.js"];
    const files = fs.readdirSync("src").filter((f) => f.endsWith(".js"));
    for (const f of files) {
      if (mine.includes(f)) continue;
      const raw = readSrc(f);
      for (const marker of ["pomo count persist failed", "day meetings collect failed", "search partial:", "theme reset incomplete"]) {
        expect(raw.includes(marker), f + " 里出现了本批的留痕标记「" + marker + "」—— 说明改串了文件").toBe(false);
      }
    }
  });

  it("顶层函数本来就在 window 上 —— 不该为了让测试能调而额外加 __test 出口", () => {
    /* 2026-10-29 实测结论：顶层 `function` 声明会自动成为 window 属性。
       我曾为这批函数补了 9 个 __test 出口，全部是多余的（后来整段移除）。
       真正需要出口的只有 `const`/`let`（如 AppBridge）或闭包内部的函数。 */
    for (const k of ["setTheme", "_resetThemeSystem", "_pomoTick", "_saveTaskElapsed", "getTaskTime",
      "_evCollectDay", "openEventDetail", "searchAll", "_ragFileText"]) {
      expect(typeof win[k], k + " 应直接在 window 上，不需要 __test 出口").toBe("function");
    }
    expect(readSrc("core.js").includes("window.AppBridge"),
      "AppBridge 是 const、不该为测试挂到 window —— 那是跨层契约").toBe(false);
  });
});
