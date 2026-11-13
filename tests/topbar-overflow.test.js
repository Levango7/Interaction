/**
 * topbar-overflow.test.js —— UI 对齐批 A：左缘竖图标轨（jsdom 面）
 * ----------------------------------------------------------------------------
 * 背景（实测）：2026-11-13 用户裁「全挪，最贴 Qoder」——顶栏七图标整体迁入 #iconRail
 * （activity bar），低频按钮不再靠 data-fold 收进顶栏溢出菜单换窄屏不溢出；
 * btnMore / #topbarMorePanel / syncTopbarMoreItems 三件套随 B5 机制同批从仓里删除。
 * 真实几何（轨宽/不横溢/44px 命中区）在 tests/e2e/topbar-overflow.spec.js 里量，jsdom 没有布局。
 * 这里守四件事：
 *   ① 迁移完整性 —— 七钮 id 集合与期望一一对应、顶栏零残留、B5 三件套是删除不是隐藏；
 *   ② 常驻可见 —— 轨内按钮无 hidden / u-hidden / aria-hidden（B5 退役后「窄屏够不着」
 *      的风险面整个消失，这条钉的就是「不再有任何收纳态」）；
 *   ③ id 保真 —— 事件绑定全按 id 寻址（ui-drawer.js / ui-global-events.js），
 *      id 重复即串线、id 丢失即断绑；
 *   ④ 能力缺失即隐藏 —— 安装入口仍走 beforeinstallprompt 才 .show 的老机制，迁移不顺手删门。
 */
import { afterEach, describe, expect, it } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

const PREFIX = "wb_agent_";
const windows = [];
afterEach(() => windows.splice(0).forEach((w) => w.close()));

const RAIL_IDS = ["btnSearchTop", "btnCmd", "btnTaskRail", "btnMessages", "btnTheme", "btnDownload", "btnInstall"];
const STAY_IDS = ["btnSearchTop", "btnTaskRail", "btnMessages"]; /* 窄屏主路径，必须在轨常驻 */

function boot() {
  const win = loadApp({ storage: { [PREFIX + "onboarded"]: "true" } });
  windows.push(win);
  return win;
}

describe("① 迁移完整性：七钮恰好全家在轨、顶栏零残留", () => {
  it("轨内按钮 id 集合 = 期望七件套，谁都不能多也不能少", () => {
    const win = boot();
    const doc = win.document;
    const rail = doc.getElementById("iconRail");
    expect(rail, "左缘竖轨 #iconRail 必须存在").toBeTruthy();
    const inRail = Array.prototype.slice.call(rail.querySelectorAll(".rail-btn")).map((b) => b.id).sort();
    expect(inRail, "轨内按钮必须恰好是迁入的那七个（多=误收常驻钮，少=迁移漏钮）").toEqual(RAIL_IDS.slice().sort());
    /* 顶栏只允许留常驻系统件：btnHelp 占位 / syncStatus / btnUser / fileInput */
    const topbar = doc.querySelector(".topbar");
    RAIL_IDS.forEach((id) => {
      expect(topbar.querySelector("#" + id), id + " 已迁轨，顶栏不得再有副本").toBeFalsy();
    });
    /* B5 是删除不是隐藏：DOM 里不该再有任何痕迹 */
    expect(doc.getElementById("btnMore"), "btnMore 应已删除（不是 display:none）").toBeFalsy();
    expect(doc.getElementById("topbarMorePanel"), "溢出面板应已删除").toBeFalsy();
    expect(doc.querySelectorAll("[data-fold]").length, "data-fold 声明机制整批退役").toBe(0);
  });
});

describe("② 常驻可见：轨内不再有任何收纳态", () => {
  it("七钮无 hidden / u-hidden / aria-hidden，aria-label 都在（轨内纯图标，名字只能靠它）", () => {
    const win = boot();
    const doc = win.document;
    RAIL_IDS.forEach((id) => {
      const b = doc.getElementById(id);
      expect(b, "轨内按钮必须真实存在: " + id).toBeTruthy();
      expect(b.hasAttribute("hidden"), id + " 不许 hidden（轨内常驻可见是本批的几何契约）").toBe(false);
      expect(b.classList.contains("u-hidden"), id + " 不许 u-hidden").toBe(false);
      expect(b.getAttribute("aria-hidden"), id + " 不许 aria-hidden").not.toBe("true");
      expect((b.getAttribute("aria-label") || "").length, id + " 必须有 aria-label（i18n 应用后仍非空才作数）").toBeGreaterThan(0);
    });
  });

  it("高频钮的家不错位：搜索/今日/消息在轨，登录/同步状态留顶栏", () => {
    const win = boot();
    const doc = win.document;
    const rail = doc.getElementById("iconRail");
    STAY_IDS.forEach((id) => {
      expect(rail.contains(doc.getElementById(id)), id + " 属窄屏主路径，必须在轨常驻").toBe(true);
    });
    expect(doc.querySelector(".topbar").contains(doc.getElementById("btnUser")), "btnUser 是顶栏常驻系统件，不随七钮迁轨").toBe(true);
    expect(doc.querySelector(".topbar").contains(doc.getElementById("syncStatus")), "syncStatus 留顶栏").toBe(true);
  });
});

describe("③ id 保真：事件按 id 寻址，重复即串线、丢失即断绑", () => {
  it("七个 id 在全文档各只有一处", () => {
    const win = boot();
    const doc = win.document;
    RAIL_IDS.forEach((id) => {
      const n = doc.querySelectorAll('[id="' + id + '"]').length;
      expect(n, id + " 在文档中必须唯一（当前 " + n + " 处）").toBe(1);
    });
  });
});

describe("④ 能力缺失即隐藏：安装入口的门不随迁移丢", () => {
  it("jsdom 无 beforeinstallprompt ⇒ btnInstall 不带 .show（CSS .tbtn.install-btn 仍将其收起）", () => {
    const win = boot();
    const b = win.document.getElementById("btnInstall");
    expect(b.classList.contains("show"), "安装入口只在捕获到 beforeinstallprompt 后才 .show").toBe(false);
    expect(b.classList.contains("install-btn"), "能力门的 class 钩子必须还在").toBe(true);
  });
});
