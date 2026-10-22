/**
 * batch-ops-ui.test.js —— v1.6-B 批量操作（多选）**真入口**验证
 * ----------------------------------------------------------------------------
 * 为什么有这个文件：这套功能 2026-10-23 才第一次有 UI 入口。
 *
 * 考古结论（`git log -S` + 代码走查）：v1.6-B 就把批量操作写全了 ——
 * `_batchState` / `toggleBatchMode` / `toggleBatchSelect(All)` / `batchComplete` /
 * `batchDelete` / `batchMoveScenario` / `batchSetPriority` / `_renderBatchUI`（连
 * "工具栏显隐 + 选中计数 + 卡片 checkbox 显隐"都写好了）、`.batch-toolbar` 与
 * `.batch-mode` 两套 CSS、以及全部 i18n 文案 —— **唯独三样从来没有**：
 *   ① `#batchToolbar` 这个 DOM；② 进入多选模式的入口按钮；③ `bindBatchToolbar()` 的调用点。
 * ⇒ `bindBatchToolbar()` 全仓零调用点，整条链在 UI 上**没有入口**，用户没有任何路径
 *   能触发批量删除/完成/移动/改优先级。（`tests/confirm-migration-batch5.test.js`
 *   里原本有一条"按钮必须为 null"的缺陷登记断言，就是钉这件事的；入口接上后它已改写。）
 *
 * 判据（与前几批一致，全部走**用户看得见**的结果）：
 *   · 入口必须在真实渲染出来的场景页里，且真的接了线（`onclick` 是函数）；
 *   · 每个批量动作都必须让**数据与界面同时**变化（条目数 / 状态 / 场景 / 优先级）；
 *   · 确认框两条路径都要测：确认才动、取消一点都不动；
 *   · 没选中时不许弹确认框（不进死路）。
 *
 * 运行：npx vitest run tests/batch-ops-ui.test.js
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

const MODAL = "dangerConfirmModal";
const PREFIX = "wb_agent_";
const isOpen = (win) => !!win.document.getElementById(MODAL);
const tick = () => new Promise((r) => setTimeout(r, 30));

const windows = [];
afterEach(() => windows.splice(0).forEach((win) => win.close()));

async function boot() {
  const win = loadApp({ storage: {} });
  windows.push(win);
  await vi.waitFor(() => expect(win.document.getElementById("chatPanel")._bound).toBe(true));
  return win;
}

/** 播种 n 条办公场景任务并渲染到看板，返回条数 */
async function withTasks(win, titles) {
  win.setTasks(titles.map((title, i) => ({
    id: "bo-" + i, sc: "office", title: title, status: "todo",
    due: "", priority: "", doneAt: null, note: "", tags: [], created: Date.now(),
  })));
  win.setActive("office");
  win.render();
  await vi.waitFor(() => expect(win.document.querySelectorAll("[data-del]").length).toBeGreaterThan(0));
  return titles.length;
}

/** 点筛选行里真实的「多选」按钮（不是直接调 toggleBatchMode —— 那测不到接线） */
async function enterBatchMode(win) {
  const btn = win.document.getElementById("btnBatchMode");
  expect(btn, "筛选行必须有多选入口按钮").toBeTruthy();
  expect(typeof btn.onclick, "多选入口必须真的接了线").toBe("function");
  btn.click();
  await vi.waitFor(() => expect(win.document.getElementById("batchToolbar").style.display).toBe("flex"));
}

const cards = (win) => win.document.querySelectorAll(".kcard[data-drag]");
const chks = (win) => win.document.querySelectorAll(".kcard .batch-chk");
const selCount = (win) => Number(win.document.getElementById("batchSelCount").textContent);
const taskById = (win, id) => win.__test.getTasks().find((x) => x.id === id);

describe("① 入口：多选按钮 + 工具栏 DOM + 接线（缺陷已修的正向断言）", () => {
  it("默认态：入口在、工具栏藏着、卡片没有 checkbox", async () => {
    const win = await boot();
    await withTasks(win, ["甲", "乙"]);
    expect(win.document.getElementById("btnBatchMode"), "多选入口按钮必须在场景页里").toBeTruthy();
    const bar = win.document.getElementById("batchToolbar");
    expect(bar, "工具栏 DOM 必须存在").toBeTruthy();
    expect(bar.style.display, "没进多选模式时工具栏应隐藏").toBe("none");
    expect(chks(win).length, "没进多选模式时不该有 checkbox").toBe(0);
  });

  it("点多选 → 工具栏显示、每张卡片都出现 checkbox、六个工具钮全部接线", async () => {
    const win = await boot();
    const n = await withTasks(win, ["甲", "乙", "丙"]);
    await enterBatchMode(win);

    expect(chks(win).length, "多选模式下每张卡片都应有 checkbox").toBe(n);
    for (const id of ["btnBatchComplete", "btnBatchDelete", "btnBatchMove",
                      "btnBatchPriority", "btnBatchCancel", "btnBatchSelectAll"]) {
      const b = win.document.getElementById(id);
      expect(b, `工具栏按钮 #${id} 必须存在`).toBeTruthy();
      expect(typeof b.onclick, `#${id} 必须真的接了线（bindBatchToolbar）`).toBe("function");
    }
    /* 移动目标下拉必须把**当前场景**排除掉（移到自己是无意义操作），且选项非空 */
    const moveOpts = Array.from(win.document.getElementById("batchMoveTarget").options).map((o) => o.value);
    expect(moveOpts).toContain("");
    expect(moveOpts).not.toContain("office");
    expect(moveOpts.length, "至少还应有一个其它场景可移").toBeGreaterThan(1);
  });
});

describe("② 选择态：勾选 / 取消 / 全选，计数与界面一致", () => {
  it("勾两张 → 计数 2 且卡片高亮；再取消一张 → 计数 1", async () => {
    const win = await boot();
    await withTasks(win, ["甲", "乙", "丙"]);
    await enterBatchMode(win);

    chks(win)[0].click();
    chks(win)[1].click();
    await vi.waitFor(() => expect(selCount(win)).toBe(2));
    expect(cards(win)[0].classList.contains("batch-selected"), "选中的卡片应有高亮类").toBe(true);

    chks(win)[0].click();
    await vi.waitFor(() => expect(selCount(win)).toBe(1));
    expect(cards(win)[0].classList.contains("batch-selected"), "取消勾选后高亮应消失").toBe(false);
    expect(win.__test.getBatchSelected().length, "数据态与界面计数必须一致").toBe(1);
  });

  it("全选 → 计数等于活跃任务数", async () => {
    const win = await boot();
    const n = await withTasks(win, ["甲", "乙", "丙"]);
    await enterBatchMode(win);
    win.document.getElementById("btnBatchSelectAll").click();
    await vi.waitFor(() => expect(selCount(win)).toBe(n));
  });
});

describe("③ 批量删除：真路径（含确认框两条路径）", () => {
  it("勾两张 → 点批量删除 → 确认框先出且任务还在 → 确认后真的进回收站并退出多选", async () => {
    const win = await boot();
    const n = await withTasks(win, ["删甲", "删乙", "留丙"]);
    await enterBatchMode(win);
    chks(win)[0].click();
    chks(win)[1].click();
    await vi.waitFor(() => expect(selCount(win)).toBe(2));

    win.document.getElementById("btnBatchDelete").click();
    await vi.waitFor(() => expect(isOpen(win)).toBe(true));
    expect(win.document.querySelectorAll("[data-del]").length, "确认框还没点头，一条都不该少").toBe(n);
    expect(taskById(win, "bo-0").deletedAt, "确认前不该已经软删").toBeFalsy();

    win.document.getElementById(MODAL + "Yes").click();
    await vi.waitFor(() => expect(isOpen(win)).toBe(false));
    await tick();

    expect(taskById(win, "bo-0").deletedAt, "确认后 bo-0 应被软删（进回收站）").toBeTruthy();
    expect(taskById(win, "bo-1").deletedAt, "确认后 bo-1 应被软删").toBeTruthy();
    expect(taskById(win, "bo-2").deletedAt, "没勾选的 bo-2 不该被动").toBeFalsy();
    expect(win.document.querySelectorAll("[data-del]").length, "界面应少两张卡片").toBe(n - 2);
    expect(win.document.getElementById("batchToolbar").style.display, "删完应自动退出多选模式").toBe("none");
  });

  it("点取消 → 一条都不少，且仍留在多选模式（确认框不是走过场）", async () => {
    const win = await boot();
    const n = await withTasks(win, ["删甲", "删乙", "留丙"]);
    await enterBatchMode(win);
    chks(win)[0].click();
    chks(win)[1].click();
    await vi.waitFor(() => expect(selCount(win)).toBe(2));

    win.document.getElementById("btnBatchDelete").click();
    await vi.waitFor(() => expect(isOpen(win)).toBe(true));
    win.document.getElementById(MODAL + "No").click();
    await tick();

    expect(win.document.querySelectorAll("[data-del]").length, "取消不该删掉任何任务").toBe(n);
    expect(taskById(win, "bo-0").deletedAt, "取消后不该有 deletedAt").toBeFalsy();
    expect(win.__test.getBatchSelected().length, "取消后选择状态应保留").toBe(2);
    expect(win.document.getElementById("batchToolbar").style.display, "取消后仍应在多选模式").toBe("flex");
  });

  it("一条都没选时点批量删除：不弹确认框（不进死路）", async () => {
    const win = await boot();
    await withTasks(win, ["甲"]);
    await enterBatchMode(win);
    win.document.getElementById("btnBatchDelete").click();
    await tick();
    expect(isOpen(win), "没有选中项时不该弹确认框（batchDelete 内部提前 return 0）").toBe(false);
  });
});

describe("④ 批量完成 / 移动场景 / 改优先级", () => {
  it("批量完成 → 选中任务 status=done", async () => {
    const win = await boot();
    await withTasks(win, ["完甲", "完乙", "不动丙"]);
    await enterBatchMode(win);
    chks(win)[0].click();
    chks(win)[1].click();
    await vi.waitFor(() => expect(selCount(win)).toBe(2));

    win.document.getElementById("btnBatchComplete").click();
    await tick();
    expect(taskById(win, "bo-0").status, "bo-0 应被完成").toBe("done");
    expect(taskById(win, "bo-1").status, "bo-1 应被完成").toBe("done");
    expect(taskById(win, "bo-2").status, "没勾选的不该被动").toBe("todo");
  });

  it("批量移动 → 选中任务 sc 变成目标场景", async () => {
    const win = await boot();
    await withTasks(win, ["移甲", "留乙"]);
    await enterBatchMode(win);
    chks(win)[0].click();
    await vi.waitFor(() => expect(selCount(win)).toBe(1));

    const sel = win.document.getElementById("batchMoveTarget");
    sel.value = "life";
    win.document.getElementById("btnBatchMove").click();
    await tick();
    expect(taskById(win, "bo-0").sc, "bo-0 应被移到 life").toBe("life");
    expect(taskById(win, "bo-1").sc, "没勾选的不该被动").toBe("office");
  });

  it("批量改优先级 → 选中任务 priority 变成所选值", async () => {
    const win = await boot();
    await withTasks(win, ["改甲", "留乙"]);
    await enterBatchMode(win);
    chks(win)[0].click();
    await vi.waitFor(() => expect(selCount(win)).toBe(1));

    win.document.getElementById("batchPriorityTarget").value = "P0";
    win.document.getElementById("btnBatchPriority").click();
    await tick();
    expect(taskById(win, "bo-0").priority, "bo-0 优先级应变成 P0").toBe("P0");
    expect(taskById(win, "bo-1").priority, "没勾选的不该被动").toBe("");
  });
});

describe("⑤ 退出多选：取消键把界面与状态一起复位", () => {
  it("点取消 → checkbox 消失、工具栏隐藏、选择清空", async () => {
    const win = await boot();
    await withTasks(win, ["甲", "乙"]);
    await enterBatchMode(win);
    chks(win)[0].click();
    await vi.waitFor(() => expect(selCount(win)).toBe(1));

    win.document.getElementById("btnBatchCancel").click();
    await tick();
    expect(chks(win).length, "退出后卡片上的 checkbox 应被移除").toBe(0);
    expect(win.document.getElementById("batchToolbar").style.display, "退出后工具栏应隐藏").toBe("none");
    expect(win.__test.getBatchSelected().length, "退出后选择应清空").toBe(0);
  });

  it("再点一次「多选」→ 退出（入口是切换，不是只能进不能出）", async () => {
    const win = await boot();
    await withTasks(win, ["甲"]);
    await enterBatchMode(win);
    win.document.getElementById("btnBatchMode").click();
    await vi.waitFor(() => expect(win.document.getElementById("batchToolbar").style.display).toBe("none"));
    expect(chks(win).length, "再点一次应退出多选").toBe(0);
  });
});
