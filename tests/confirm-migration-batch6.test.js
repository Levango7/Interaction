/**
 * confirm-migration-batch6.test.js —— 第六批原生 confirm() → dangerConfirm 的**真路径**验证
 * --------------------------------------------------------------------------------------------
 * **本批把债务棘轮打到 0** —— src/ 里的原生 confirm() 至此全部迁完。
 *
 * 迁移的 12 处：
 *   · `src/render-entry.js` 3 处 —— `#fbClearBtn`（首屏清空）/ `#mdClear`（Markdown 清空）/
 *     `#cadClear`（CAD 画布清空）
 *   · `src/render-overview.js` 4 处 —— 商店插件卸载 / `_restoreFromCloud`（云端恢复）/
 *     `#dgmPresetSel` onchange（切换模板）/ `#dgmClearAll`（清空画布）
 *   · `src/render-widgets.js` 3 处 —— `#recycleClear`（清空回收站）/
 *     `#recycleBatchPurge`（批量彻底删除）/ `#csClear`（清空图表画布）
 *   · `src/ui-ge-integrations.js` 2 处 —— `webdavSyncUpload` 412 冲突分支 /
 *     `webdavSyncDownload` 覆盖确认
 *
 * 本批风险比预想低，两条结论已写进棘轮注释：
 *   ① `_restoreFromCloud` / `webdavSyncUpload` / `webdavSyncDownload` **3 处宿主本就是 async**，
 *      只加 await；且 `ui-global-events.js:614-615` 的 WebDAV 上/下载按钮**本就写成
 *      `await webdavSyncXxx()`**，故那两处改 await 后调用方零改动；
 *   ② 其余 9 处都是 `onclick` / `onchange` / `addEventListener` 事件处理器，无外部调用方。
 *
 * 🔴 本批新增一类**前几批没遇到过**的坑，值得单独记：`webdavSyncDownload` /
 *    `webdavSyncUpload` 在 confirm **之前还有多个 await**（`await webdavGet()` 等），
 *    所以浮层**不是同步出现的** —— 前几批那种「同步 getElementById + click」手法在这里
 *    拿到的是 null（实测 `expected null to be truthy`）。改用轮询等浮层，且**只点一次
 *    指定按钮**（不是无条件确认的接盘器），这样才能分别表达同意/拒绝两条路径。
 *    该helper 在 `tests/webdav-sync.test.js` 的 `answerConfirm()`，本文件不重复造。
 *
 * 本文件覆盖其中能靠真实入口稳定驱动的 1 组（回收站清空，3 例）。
 * 其余 11 处如实登记为未覆盖 —— 原因见文末。
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

const windows = [];
afterEach(() => windows.splice(0).forEach((win) => win.close()));

const MODAL = "dangerConfirmModal";
const isOpen = (win) => !!win.document.getElementById(MODAL);

async function boot(storage) {
  const win = loadApp({ storage: storage || {} });
  windows.push(win);
  await vi.waitFor(() => expect(win.document.getElementById("chatPanel")._bound).toBe(true));
  return win;
}

/** 让未 settle 的 Promise / 微任务跑完 */
const tick = () => new Promise((r) => setTimeout(r, 30));

describe("清空回收站（src/render-widgets.js #recycleClear）", () => {
  /** 往回收站丢两条，再打开回收站弹窗，返回初始条数 */
  async function withBin(win, n = 2) {
    for (let i = 0; i < n; i++) {
      /* AppBridge 是模块顶层的 const，**不会挂成 window 属性**（jsdom 全局词法环境里才有），
         所以写 win.AppBridge.xxx 拿到的是 undefined；addToRecycleBin 走 __test 导出。 */
      win.__test.addToRecycleBin("config", "待清空甲" + i, "描述" + i, { kind: "test", i }, "batch6");
    }
    win.eval("AppBridge.openRecycle()");
    /* 空回收站时「清空回收站」按钮**不渲染**（见最后一例），所以只有 n>0 才等那个按钮；
       n=0 时改为等弹窗本身出现，否则 waitFor 会一直等到超时。 */
    await vi.waitFor(() => expect(win.document.getElementById(n > 0 ? "recycleClear" : "recycleModal")).toBeTruthy());
    return win.__test.getRecycleBin().length;
  }

  it("点「清空回收站」→ 先出确认框且内容还在；点确认后才真的清空", async () => {
    const win = await boot();
    const before = await withBin(win);
    expect(before, "前置：回收站应有内容").toBeGreaterThan(0);

    win.document.getElementById("recycleClear").click();
    await vi.waitFor(() => expect(isOpen(win)).toBe(true));
    expect(win.__test.getRecycleBin().length, "确认框还没点头，一条都不该少").toBe(before);

    win.document.getElementById(MODAL + "Yes").click();
    await vi.waitFor(() => expect(isOpen(win)).toBe(false));
    await tick();
    expect(win.__test.getRecycleBin().length, "确认后回收站应为空").toBe(0);
  });

  it("点取消 → 一条都不少（确认框不是走过场）", async () => {
    const win = await boot();
    const before = await withBin(win);

    win.document.getElementById("recycleClear").click();
    await vi.waitFor(() => expect(isOpen(win)).toBe(true));
    win.document.getElementById(MODAL + "No").click();
    await vi.waitFor(() => expect(isOpen(win)).toBe(false));
    await tick();
    expect(win.__test.getRecycleBin().length, "取消不该清掉任何内容").toBe(before);
  });

  it("Esc 取消同样不清（键盘路径与鼠标路径同结果）", async () => {
    const win = await boot();
    const before = await withBin(win);

    win.document.getElementById("recycleClear").click();
    await vi.waitFor(() => expect(isOpen(win)).toBe(true));
    const wrap = win.document.getElementById(MODAL);
    wrap.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await vi.waitFor(() => expect(isOpen(win)).toBe(false));
    await tick();
    expect(win.__test.getRecycleBin().length, "Esc 不该清掉任何内容").toBe(before);
  });

  it("回收站为空时**没有**「清空回收站」入口（没东西可清就不给按钮）", async () => {
    const win = await boot();
    const before = await withBin(win, 0);
    expect(before, "前置：回收站应为空").toBe(0);
    /* 原以为"空回收站点清空也会给确认框"，实测按钮**根本不渲染** —— 这其实是更合理的
       设计（没东西可清就不给入口），所以这里如实钉住现状，而不是把它当成缺陷。 */
    expect(win.document.getElementById("recycleClear"), "空回收站不该给「清空回收站」入口").toBeFalsy();
  });
});

/*
 * 未覆盖登记（如实写，不写"已验证"）—— 其余 11 处及原因：
 *   · `render-entry.js` `#mdClear` / `#cadClear` / `#fbClearBtn`：要先切进对应工具页
 *     （off-md / off-cad / 首屏），DOM 才渲染出这些按钮，驱动成本高；
 *   · `render-overview.js` 商店卸载 / `#dgmPresetSel` / `#dgmClearAll` / `_restoreFromCloud`：
 *     分别要先有已装插件、进入 diagram 工具、以及打通 apiGetSnapshot 云端链路；
 *   · `render-widgets.js` `#recycleBatchPurge` / `#csClear`：要先进批量勾选态 / 图表画布；
 *   · `ui-ge-integrations.js` `webdavSyncUpload` 412 分支 / `webdavSyncDownload`：
 *     **已由 `tests/webdav-sync.test.js` 覆盖**（该文件用 answerConfirm 轮询点 Yes/No，
 *     分别钉住"非静默覆盖：先弹确认框"、"拒绝则不动"、"同意才下载应用"三条），此处不重复。
 *
 * 上述未覆盖处与已覆盖处走的是**同一个 dangerConfirm 组件**，差异只在触发方式；
 * 且本批 12 处全部有既有测试或全量门禁兜底（全量单测 + e2e 无删除/清空类用例回归）。
 */
