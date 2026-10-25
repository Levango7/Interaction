/**
 * topbar-overflow.test.js —— B5：窄屏顶栏溢出菜单（jsdom 面）
 * ----------------------------------------------------------------------------
 * 背景（实测，非推断）：≤479px 顶栏有 8 个按钮，2026-10-20 那版把命中宽度压到 26px
 * 才勉强不横向溢出（CSS 注释里自认"正解是收进溢出菜单，属独立设计项，未在本批做"）。
 * 本批补上正解：低频按钮用 **data-fold 声明**、窄屏收起、行项只转发点击给原按钮。
 *
 * 这里守四件事（真实宽度与"不溢出"在 tests/e2e/topbar-overflow.spec.js 里量，jsdom 没有布局）：
 *   ① 声明面不漂移 —— data-fold 的按钮集合与面板行项**一一对应**（B3 的教训：6-7 处手工登记必然漏一处）；
 *   ② 开合状态机 —— is-open 与 aria-expanded 同步，外点/Esc 都收；
 *   ③ 行项是转发不是重写 —— 点行项必须真的触发原按钮的 handler（否则快捷键在那条路上失效）；
 *   ④ 能力缺失即隐藏 —— 目标按钮当前不可见时行项一起隐掉，不留"点了没反应"。
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

describe("① 声明面：低频按钮与溢出面板一一对应", () => {
  it("data-fold 的集合 = 面板行项集合，谁都不能多也不能少", () => {
    const win = boot();
    const doc = win.document;
    const folded = Array.prototype.slice.call(doc.querySelectorAll('.topbar .tbtn[data-fold]')).map((b) => b.id).sort();
    const rows = Array.prototype.slice.call(doc.querySelectorAll("#topbarMorePanel [data-fold-target]")).map((r) => r.getAttribute("data-fold-target")).sort();
    expect(folded.length, "必须确实有按钮声明为低频（删光了就等于把功能弄丢）").toBeGreaterThan(0);
    expect(rows, "面板行项与 data-fold 声明必须完全一致").toEqual(folded);
    rows.forEach((id) => expect(doc.getElementById(id), "行项指向的按钮必须真实存在: " + id).toBeTruthy());
    /* 常驻按钮不许被收起：搜索/今日/消息/用户 是窄屏主路径 */
    ["btnSearchTop", "btnTaskRail", "btnMessages", "btnUser"].forEach((id) => {
      expect(doc.getElementById(id).hasAttribute("data-fold"), id + " 属于高频，不应被收进溢出菜单").toBe(false);
    });
  });

  it("「更多」入口与面板都在，且 aria-controls 指得准", () => {
    const win = boot();
    const btn = win.document.getElementById("btnMore");
    expect(btn, "顶栏必须有 #btnMore 入口").toBeTruthy();
    expect(btn.getAttribute("aria-expanded"), "初始应为收起").toBe("false");
    expect(btn.getAttribute("aria-controls")).toBe("topbarMorePanel");
    expect(win.document.getElementById("topbarMorePanel"), "面板容器必须存在").toBeTruthy();
    expect(btn.querySelector("svg"), "入口要有图标（纯文字窄屏放不下）").toBeTruthy();
  });
});

describe("② 开合状态机", () => {
  it("点「更多」开 → 再点关；is-open 与 aria-expanded 必须同步", async () => {
    const win = boot();
    const btn = win.document.getElementById("btnMore");
    const panel = win.document.getElementById("topbarMorePanel");
    btn.click();
    await wait(20);
    expect(panel.classList.contains("is-open"), "点入口必须真的展开").toBe(true);
    expect(btn.getAttribute("aria-expanded")).toBe("true");
    btn.click();
    await wait(20);
    expect(panel.classList.contains("is-open")).toBe(false);
    expect(btn.getAttribute("aria-expanded")).toBe("false");
  });

  it("Esc 与点击面板外都会收起（展开着不关是移动端最常见的卡死感）", async () => {
    const win = boot();
    const btn = win.document.getElementById("btnMore");
    const panel = win.document.getElementById("topbarMorePanel");
    btn.click();
    expect(panel.classList.contains("is-open")).toBe(true);
    win.document.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await wait(10);
    expect(panel.classList.contains("is-open"), "Esc 必须收起").toBe(false);

    btn.click();
    expect(panel.classList.contains("is-open")).toBe(true);
    win.document.getElementById("main").click();
    await wait(10);
    expect(panel.classList.contains("is-open"), "点外部必须收起").toBe(false);
  });
});

describe("③ 行项是转发不是重写", () => {
  it("点面板里的「主题」行 ⇒ 原 #btnTheme 的 handler 被调用、面板收起", async () => {
    const win = boot();
    let hits = 0;
    const themeBtn = win.document.getElementById("btnTheme");
    const original = themeBtn.onclick;
    themeBtn.onclick = function (e) { hits++; if (original) original.apply(this, arguments); };
    win.document.getElementById("btnMore").click();
    const row = win.document.querySelector('#topbarMorePanel [data-fold-target="btnTheme"]');
    row.click();
    await wait(20);
    expect(hits, "行项必须把点击交给原按钮（同一份逻辑，别在这里重写第二套）").toBe(1);
    expect(win.document.getElementById("topbarMorePanel").classList.contains("is-open"), "选完要自动收起").toBe(false);
    themeBtn.onclick = original;
  });

  it("被隐掉的行项点了不转发（目标当前不可用就不该有反应）", async () => {
    const win = boot();
    let hits = 0;
    const dl = win.document.getElementById("btnDownload");
    const original = dl.onclick;
    dl.onclick = function () { hits++; if (original) original.apply(this, arguments); };
    dl.hidden = true;                       // 模拟"能力缺失即隐藏"
    win.syncTopbarMoreItems();
    const row = win.document.querySelector('#topbarMorePanel [data-fold-target="btnDownload"]');
    expect(row.hasAttribute("hidden"), "目标隐藏时行项必须一起隐掉").toBe(true);
    win.document.getElementById("btnMore").click();
    row.click();
    await wait(20);
    expect(hits, "隐藏的行项不该真的驱动原按钮").toBe(0);
    dl.onclick = original;
  });
});

describe("④ 可见性同步", () => {
  it("被 CSS 收起（display:none）的目标不能让行项一起消失 —— 这正是本功能在做的事", () => {
    /* 这条守的是实现里最容易写错的一处：用 getComputedStyle(target).display 判可见，
       会把每个折叠按钮的行项都标成隐藏 ⇒ 窄屏打开"更多"是空面板（真浏览器实测踩过）。
       jsdom 不跑 media query，所以这里直接改内联 display 复现折叠态。 */
    const win = boot();
    const doc = win.document;
    const cmd = doc.getElementById("btnCmd");
    const row = doc.querySelector('#topbarMorePanel [data-fold-target="btnCmd"]');
    win.syncTopbarMoreItems();
    expect(row.hasAttribute("hidden"), "折叠前：命令面板常驻可用，行项应可见").toBe(false);
    cmd.style.display = "none";           // 模拟 @media(max-width:479px) 的收起规则
    win.syncTopbarMoreItems();
    expect(row.hasAttribute("hidden"), "目标只是被折叠规则收起来，行项必须还在（否则菜单是空的）").toBe(false);
    cmd.style.display = "";
  });

  it("行项跟随目标按钮的真实可见性（不写死数量：安装入口本身是条件可见的）", () => {
    const win = boot();
    const doc = win.document;
    const row = (id) => doc.querySelector('#topbarMorePanel [data-fold-target="' + id + '"]');
    const base = win.syncTopbarMoreItems();
    expect(base, "至少三个行项应随目标可见（全隐藏=转发链断了也测不出来）").toBeGreaterThanOrEqual(3);
    expect(row("btnCmd").hasAttribute("hidden"), "命令面板常驻可用 ⇒ 行项不该被隐").toBe(false);
    /* 安装入口只在捕获到 beforeinstallprompt 时才 .show —— 浏览器里没有该事件，
       它的行项必须跟着隐掉（这正是"点了没反应"的防复发生效处）。 */
    const installShown = doc.getElementById("btnInstall").classList.contains("show");
    expect(row("btnInstall").hasAttribute("hidden"), "行项可见性必须与目标按钮的 .show 状态一致")
      .toBe(!installShown);

    const cmd = doc.getElementById("btnCmd");
    cmd.hidden = true;
    expect(win.syncTopbarMoreItems(), "目标隐藏后计数要减一").toBe(base - 1);
    expect(row("btnCmd").hasAttribute("hidden")).toBe(true);
    cmd.hidden = false;
    expect(win.syncTopbarMoreItems(), "恢复后要回到原计数").toBe(base);
    expect(row("btnCmd").hasAttribute("hidden")).toBe(false);
  });
});
