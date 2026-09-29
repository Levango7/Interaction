/**
 * manifest-shortcuts.test.js —— 桌面快捷方式接线守护（v3.7.66 新增，B 项）
 * ----------------------------------------------------------------------------
 * manifest.json 的三个 shortcuts 指向 `./#overview`、`./#stats`、`./#settings`，但接线前全仓只有
 * `src/ui-guide.js:188`（指南锚点）与 `:256`（`#share=` 只读分享）读 location.hash ——
 * 也就是说从桌面图标 / 主屏快捷方式进来，只会落到上次退出时的视图，快捷方式形同虚设
 * （按 docs/product-scope.md 的纪律：入口存在但无接线＝虚假功能）。
 * 现在由 `src/ui-global-events.js` 的 `applyStartHash()` 把这三个片段落到真实视图。
 *
 * 两条来之不易的顺序不变量（都是被用例打出来才发现的，别回退）：
 *   · 调用点必须**晚于** render()/checkCount() —— render() 会把设置抽屉收回主视图
 *     （`src/render-entry.js:52-58`：_moveDrawerHome + classList.remove("open") + uiView="main"），
 *     先接线再 render 等于把 #settings 的跳转当场抹掉。
 *   · 用例里不要在 applyStartHash() 之后再补 render()，同一个理由。
 *
 * 运行：npm test（源码态直跑 npx vitest 会全量假失败，见 tests/helpers/loadApp.js 守卫）
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadApp } from "./helpers/loadApp.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
const geSrc = readFileSync(join(root, "src/ui-global-events.js"), "utf8");
const WIRED = new Set(["overview", "stats", "settings"]); // 与 applyStartHash 的白名单一致

const goto = (hash) => {
  const win = loadApp();
  win.localStorage.setItem("wb_agent_onboarded", "true"); // 聚焦路由本身，不与首启引导纠缠
  win.location.hash = hash;
  const T = win.__test;
  return { win, T, hit: T.applyStartHash() };
};

describe("manifest shortcuts 的声明与接线一致", () => {
  it("每个 shortcut 的 hash 片段都必须是应用认的入口（防再加死快捷方式）", () => {
    const urls = (manifest.shortcuts || []).map((s) => String(s.url || ""));
    expect(urls.length, "shortcuts 不应为空——空了说明入口被默默删掉").toBeGreaterThan(0);
    for (const u of urls) {
      const frag = (u.split("#")[1] || "").toLowerCase();
      expect(frag, `shortcut url 必须带 hash 片段：${u}`).toBeTruthy();
      expect(WIRED.has(frag), `shortcut 指向未接线的 #${frag}`).toBe(true);
    }
  });

  it("接线点在启动链里、且排在 render 之后（顺序反了 #settings 会被当场抹掉）", () => {
    const callSite = geSrc.indexOf("applyStartHash();");
    expect(callSite, "startup 里没有调用 applyStartHash()").toBeGreaterThan(-1);
    expect(geSrc.slice(0, callSite), "调用点不在启动链内").toContain("async function startup");
    expect(callSite, "applyStartHash() 必须晚于 render()/checkCount()").toBeGreaterThan(geSrc.indexOf("checkCount();"));
  });
});

describe("applyStartHash：hash → 真实视图", () => {
  it("#stats 进统计页（周/月/年筛选导航是它的独有标志）", () => {
    const { win, hit } = goto("#stats");
    expect(hit).toBe("stats");
    expect(win.document.querySelector(".stats-range-nav"), "统计页未渲染").toBeTruthy();
  });

  it("#overview 进主页总览（速览 4 卡是它的独有标志）", () => {
    const { win, T, hit } = goto("#overview");
    expect(hit).toBe("overview");
    expect(T.getActive()).toBe("overview");
    expect(win.document.querySelector(".overview-4cards"), "总览页未渲染").toBeTruthy();
  });

  it("#settings 打开设置抽屉", () => {
    const { win, hit } = goto("#settings");
    expect(hit).toBe("settings");
    const d = win.document.getElementById("drawer");
    expect(d && d.classList.contains("open"), "设置抽屉未打开").toBe(true);
  });

  it("未知 hash 一律不碰：不改 active、不开抽屉、返回空", () => {
    for (const hash of ["#office", "#share=abc", "#help", ""]) {
      const win = loadApp();
      win.localStorage.setItem("wb_agent_onboarded", "true");
      win.location.hash = hash;
      const T = win.__test;
      const before = T.getActive();
      const d = win.document.getElementById("drawer");
      const wasOpen = !!(d && d.classList.contains("open"));
      expect(T.applyStartHash(), `${hash} 不该被当成 shortcut 入口`).toBe("");
      expect(T.getActive(), `${hash} 改变了视图`).toBe(before);
      expect(!!(d && d.classList.contains("open"))).toBe(wasOpen);
    }
  });
});
