/**
 * topbar-overflow.test.js —— B5：左栏工具镜像组（jsdom 面；文件名保留历史前缀）
 * ----------------------------------------------------------------------------
 * 背景：B5 把 .topbar 整体退役，系统按钮族迁入左栏底部工具区（宽屏直接可见）；
 * ≤767px 左栏整列藏，由底部抽屉里的 #sideSheetTools 镜像组兜底可达。
 * 镜像行**只转发点击**给真按钮，不重写任何行为——与旧 topbarMorePanel 同口径。
 *
 * 这里守四件事（真实宽度与"不溢出"在 tests/e2e/topbar-overflow.spec.js 里量，jsdom 没有布局）：
 *   ① 声明面不漂移 —— 镜像行集合与左栏工具按钮集合**一一对应**；
 *   ② 行项是转发不是重写 —— 点行项必须真的触发原按钮 handler（幂等/账号态逻辑只有一份）；
 *   ③ 能力缺失即隐藏 —— 目标按钮 hidden/u-hidden/未 .show 的安装入口，行项一起隐掉；
 *   ④ 标签跟真源 —— #btnUser 登录态会改写 .lbl，镜像行文本必须跟随（否则抽屉里显示"登录"但点下去是登出）。
 */
import { afterEach, describe, expect, it } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

const PREFIX = "wb_agent_";
const windows = [];
afterEach(() => windows.splice(0).forEach((w) => w.close()));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function boot() {
  const win = loadApp({ storage: { [PREFIX + "onboarded"]: "true" } });
  windows.push(win);
  return win;
}

describe("① 声明面：左栏工具按钮与抽屉镜像组一一对应", () => {
  it("快捷区 + 工具区的按钮集合 = 镜像行集合，谁都不能多也不能少", () => {
    const win = boot();
    const doc = win.document;
    const tools = Array.prototype.slice.call(doc.querySelectorAll("#sideQuick .tbtn, #sideTool .tbtn"))
      .map((b) => b.id).sort();
    const rows = Array.prototype.slice.call(doc.querySelectorAll("#sideSheetTools [data-fold-target]"))
      .map((r) => r.getAttribute("data-fold-target")).sort();
    expect(tools.length, "左栏工具区必须有按钮（删光了就等于把抽屉入口弄丢）").toBeGreaterThan(0);
    expect(rows, "镜像行与左栏工具按钮必须完全一致").toEqual(tools);
    rows.forEach((id) => expect(doc.getElementById(id), "行项指向的按钮必须真实存在: " + id).toBeTruthy());
  });

  it("顶栏已退役：.topbar 壳与溢出面板都不再存在（防复活）", () => {
    const win = boot();
    const doc = win.document;
    expect(doc.querySelector(".topbar"), "B5 起 .topbar 必须不存在").toBeFalsy();
    expect(doc.getElementById("btnMore"), "#btnMore 已随顶栏退役").toBeFalsy();
    expect(doc.getElementById("topbarMorePanel"), "溢出面板已随顶栏退役").toBeFalsy();
  });

  it("同步状态是指示器不是控件，不进镜像组", () => {
    const win = boot();
    const doc = win.document;
    const sync = doc.getElementById("syncStatus");
    expect(sync, "syncStatus 仍在左栏工具区").toBeTruthy();
    expect(sync.closest("#sideTool"), "syncStatus 必须住在底部工具区").toBeTruthy();
    expect(doc.querySelector('#sideSheetTools [data-fold-target="syncStatus"]'), "指示器不镜像").toBeFalsy();
  });
});

describe("② 行项是转发不是重写", () => {
  it("点镜像行「主题」⇒ 原 #btnTheme 的 handler 被调用一次", async () => {
    const win = boot();
    let hits = 0;
    const themeBtn = win.document.getElementById("btnTheme");
    const original = themeBtn.onclick;
    themeBtn.onclick = function () { hits++; if (original) original.apply(this, arguments); };
    const row = win.document.querySelector('#sideSheetTools [data-fold-target="btnTheme"]');
    row.click();
    await wait(20);
    expect(hits, "行项必须把点击交给原按钮（同一份逻辑，别在这里重写第二套）").toBe(1);
    themeBtn.onclick = original;
  });

  it("被隐掉的行项点了不转发（目标当前不可用就不该有反应）", async () => {
    const win = boot();
    let hits = 0;
    const dl = win.document.getElementById("btnDownload");
    const original = dl.onclick;
    dl.onclick = function () { hits++; if (original) original.apply(this, arguments); };
    dl.hidden = true;                       // 模拟"能力缺失即隐藏"
    win.syncSideSheetTools();
    const row = win.document.querySelector('#sideSheetTools [data-fold-target="btnDownload"]');
    expect(row.hasAttribute("hidden"), "目标隐藏时行项必须一起隐掉").toBe(true);
    row.click();
    await wait(20);
    expect(hits, "隐藏的行项不该真的驱动原按钮").toBe(0);
    dl.onclick = original;
    dl.hidden = false;
    win.syncSideSheetTools();
  });
});

describe("③ 可见性同步", () => {
  it("被 CSS 收起（display:none）的目标不能让行项一起消失 —— 左栏 ≤767 整列藏正是这一步", () => {
    /* 这条守的是实现里最容易写错的一处：用 getComputedStyle(target).display 判可见，
       会把整列被 CSS 藏起来的每个按钮的行项都标成隐藏 ⇒ 抽屉里是空面板。
       jsdom 不跑 media query，所以这里直接改内联 display 复现"整列藏"态。 */
    const win = boot();
    const doc = win.document;
    const cmd = doc.getElementById("btnCmd");
    const row = doc.querySelector('#sideSheetTools [data-fold-target="btnCmd"]');
    win.syncSideSheetTools();
    expect(row.hasAttribute("hidden"), "同步前：命令面板常驻可用，行项应可见").toBe(false);
    cmd.style.display = "none";           // 模拟 ≤767 左栏整列藏 / 任何折叠规则
    win.syncSideSheetTools();
    expect(row.hasAttribute("hidden"), "目标只是被 CSS 藏起来，行项必须还在（否则抽屉是空的）").toBe(false);
    cmd.style.display = "";
  });

  it("行项跟随目标按钮的真实可见性（不写死数量：安装入口本身是条件可见的）", () => {
    const win = boot();
    const doc = win.document;
    const row = (id) => doc.querySelector('#sideSheetTools [data-fold-target="' + id + '"]');
    const base = win.syncSideSheetTools();
    expect(base, "至少三个行项应随目标可见（全隐藏=转发链断了也测不出来）").toBeGreaterThanOrEqual(3);
    expect(row("btnCmd").hasAttribute("hidden"), "命令面板常驻可用 ⇒ 行项不该被隐").toBe(false);
    /* 安装入口只在捕获到 beforeinstallprompt 时才 .show —— 浏览器里没有该事件，
       它的行项必须跟着隐掉（这正是"点了没反应"的防复发生效处）。 */
    const installShown = doc.getElementById("btnInstall").classList.contains("show");
    expect(row("btnInstall").hasAttribute("hidden"), "行项可见性必须与目标按钮的 .show 状态一致")
      .toBe(!installShown);

    const cmd = doc.getElementById("btnCmd");
    cmd.hidden = true;
    expect(win.syncSideSheetTools(), "目标隐藏后计数要减一").toBe(base - 1);
    expect(row("btnCmd").hasAttribute("hidden")).toBe(true);
    cmd.hidden = false;
    expect(win.syncSideSheetTools(), "恢复后要回到原计数").toBe(base);
    expect(row("btnCmd").hasAttribute("hidden")).toBe(false);
  });
});

describe("④ 标签跟真源", () => {
  it("#btnUser 的 .lbl 被登录态改写后，镜像行文本随之同步（含中文文案）", () => {
    const win = boot();
    const doc = win.document;
    const userBtn = doc.getElementById("btnUser");
    const row = doc.querySelector('#sideSheetTools [data-fold-target="btnUser"]');
    const lbl = userBtn.querySelector(".lbl");
    expect(lbl, "#btnUser 必须有 .lbl（登录态写回点）").toBeTruthy();
    lbl.textContent = "user@example.com";
    win.syncSideSheetTools();
    expect(row.textContent, "镜像行必须显示与真按钮一致的标签").toBe("user@example.com");
    lbl.textContent = "登录";
    win.syncSideSheetTools();
    expect(row.textContent).toBe("登录");
  });
});
