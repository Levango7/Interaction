/**
 * empty-catch-slice14.test.js —— R-2 续集第一批（4 个 ui-ge-* 文件，8 处 P0 空 catch 消解）的**回归锁**
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
 * ⚠️⚠️ 本文件**没有任何行为测试**，全部是源码契约断言。原因是实测出来的，不是图省事：
 *   1) 唯一看起来有出口的是 theme —— `AppBridge.setTheme = setTheme`（ui-ge-theme.js:944）。但 `AppBridge`
 *      本身是 core.js:94 的 `const`，**从未挂到 window**（`grep -rn "window.AppBridge\|globalThis.AppBridge" src/`
 *      零命中；实测 `win.AppBridge === undefined`）。首版按 `win.AppBridge.setTheme(...)` 写，报的是
 *      `TypeError: Cannot read properties of undefined (reading 'setTheme')` —— 看着像被测代码坏了，
 *      其实是**没有出口**。这个坑值得后人少走一遍，故写在文件头。
 *   2) 其余 7 处的触发点在私有闭包里：`_pomoTick`（要等计时器 tick）、`_evCollectDay`（要经
 *      `openEventDetail` 渲染）、`_ragFileText`（要过文件导入链路），在现有 jsdom 骨架下拿不到稳定入口。
 *   ⇒ 因此本文件只锁三件事：**留痕还在 / where 没写错 / P0 没回涨**。
 *      **它不证明「失败时真的调用到了」** —— 别把绿读成行为已验证。
 *   ⇒ 要补行为证明，前提是先给这些模块加测试出口（如把 `_pomoTick` / `_evCollectDay` 挂到 `__test`），
 *      那是另一笔事，已记进 CHANGELOG 的「已知欠账」。
 *
 * 运行：npm run test:local -- tests/empty-catch-slice14.test.js
 *      （必须走 test:local：loadApp 有源码态守卫，直跑 npx vitest 会全量假失败）
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { scanSource } from "../scripts/lib/empty-catch.mjs";

const readSrc = (f) => fs.readFileSync("src/" + f, "utf8");
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

describe("① 8 处具名留痕不许被删、where 不许写错", () => {
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

  it("每处留痕都必须包二次保护（否则「上报失败」会升级成未处理拒绝）", () => {
    for (const [f, msg] of EXPECT) {
      const raw = readSrc(f);
      const i = raw.indexOf(msg);
      const around = raw.slice(Math.max(0, i - 120), i + 260);
      expect(/try\{[^}]*pushDiag/.test(around) || /try\{[\s\S]{0,80}pushDiag/.test(around),
        f + " 的 " + msg + " 没包在 try 里 —— 上报自己抛错会变成未处理拒绝").toBe(true);
      expect(/catch\s*\(\s*_e2\s*\)/.test(around), f + " 的 " + msg + " 缺 catch(_e2) 二次保护").toBe(true);
    }
  });
});

describe("② 消解不许回退（P0 计数锁）", () => {
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

describe("③ 反向对照：不该被动的地方没被动", () => {
  it("ui-ge-api.js:63 必须仍是 P0（R-38 判定「刻意保留」的迁移路径）", () => {
    const p0 = scanSource(readSrc("ui-ge-api.js"), "ui-ge-api.js").filter((i) => i.level === "P0");
    expect(p0.length, "这条是「用异常做控制流」的合理写法；改掉它说明有人没读 R-38").toBe(1);
    expect(p0[0].line).toBe(63);
  });

  it("本批只动 4 个文件：其它 17 个有 P0 的文件不应出现新留痕（防止顺手改到别人面上）", () => {
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
});
