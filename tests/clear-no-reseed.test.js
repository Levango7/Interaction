/**
 * clear-no-reseed.test.js —— 「清空全部数据」必须真的清空（OD-004 裁定乙 · 2026-10-18）
 * ----------------------------------------------------------------------------
 * 缺陷（实测）：`doClear()` 只删不写 —— `allKeys()` 把 `wb_agent_init` 一起删掉，而
 * `seed()` 的触发条件是「init 未置位 **且** tasks 键为 null」⇒ 清空后两个条件恰好重新成立，
 * reload 后示例 4 条任务又回来了。于是：
 *   · 命令叫「清空全部数据」、确认弹窗写「此操作不可恢复」，实际却是"重置为示例"；
 *   · 「从零开始」在 UI 上**没有任何路径可达** —— 这正是三态走查第 1 轮进不去空态的原因。
 *
 * 裁定：用户选乙（2026-10-18「乙 吧」）= 改行为，真正清空。
 * 做法：清空后显式写 `tasks=[]`（+ `init`/`onboarded`），让下次启动走「已初始化、0 条任务」
 * 而不是「首次启动」。
 *
 * 本文件三例，第 ③ 例是**反向对照**：真正首次启动**仍须**播种示例 ——
 * 否则为了修"清空不干净"把"新用户有东西可看"这个原设计一起删掉了，属于过度修复。
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

const PREFIX = "wb_agent_";

/**
 * 在假计时器下调用 doClear（900ms 后的 location.reload 不会真的触发）
 *
 * ⚠️ 这里**不能**用 `autoDangerConfirm` 接盘器：它靠 `setTimeout` 轮询找按钮，而
 * `vi.useFakeTimers()` 把 setTimeout 一并假掉了 ⇒ 轮询永不推进、浮层没人点、清空永不发生。
 * 好在 dangerConfirm 是**同步**把浮层挂进 DOM 的（Promise executor 同步执行），
 * 于是可以「先拿到 Promise → 同步点掉确认按钮 → 再 await」：点掉之后的代码走微任务队列，
 * 而**微任务不受 fake timers 影响**，所以 await 能正常推进。
 */
async function clearWithFakeTimers(win) {
  vi.useFakeTimers();
  try {
    const p = win.__test.doClear();
    const yes = win.document.getElementById("dangerConfirmModalYes");
    if (!yes) throw new Error("doClear 必须先弹确认浮层，再动手清空");
    yes.click();
    await p;
  } finally {
    vi.useRealTimers();
  }
}

/** 把当前窗口的 wb_agent_* 全部读出来，用于「重启应用」时原样注入 */
function snapshot(win) {
  const out = {};
  const ls = win.localStorage;
  for (let i = 0; i < ls.length; i++) {
    const k = ls.key(i);
    if (k && k.startsWith(PREFIX)) out[k] = ls.getItem(k);
  }
  return out;
}

describe("清空全部数据 = 真的清空（OD-004 · 乙）", () => {
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

  it("① doClear 之后留下「已初始化 + 0 条任务 + 已过引导」，而不是把键删干净", async () => {
    const win = loadApp();
    expect(win.__test.getTasks().length, "前置：首启应有示例任务").toBeGreaterThan(0);
    await clearWithFakeTimers(win);

    expect(win.localStorage.getItem(PREFIX + "tasks"), "tasks 应是空数组而不是键为 null").toBe("[]");
    expect(win.localStorage.getItem(PREFIX + "init"), "init 应置位（seed 的第一道闸）").toBe("true");
    expect(win.localStorage.getItem(PREFIX + "onboarded"), "onboarded 应置位（引导第 1 步文案假定有演示任务）").toBe("true");
    /* 其余键仍应被清掉 —— 修"清不干净"不等于"不清了" */
    expect(win.localStorage.getItem(PREFIX + "rec_office"), "记录类键仍须被清空").toBeNull();
  });

  it("② 用清空后的存储重启：0 条任务，且任务页看板出现空态（空态真的可达）", async () => {
    const win1 = loadApp();
    await clearWithFakeTimers(win1);
    const carried = snapshot(win1);

    const win2 = loadApp({ storage: carried });
    expect(win2.__test.getTasks().length, "清空后重启不应再播种示例").toBe(0);

    win2.setActive("tasks");
    win2.render();
    await new Promise((r) => setTimeout(r, 70));
    const html = win2.document.getElementById("main").innerHTML;
    expect(html, "清空后任务页看板应给出空态而不是三条空栏").toMatch(/class="empty-state"/);
  });

  it("③ 反向对照：真正首次启动仍须播种示例（别把原设计一起删了）", () => {
    /* 这一例同时钉住了旧 bug 的机制：旧版 doClear 删完全部键后留下的正是「init 与 tasks 双双缺失」
       = 首次启动状态 ⇒ 下面这 4 条示例就会在 reload 时重新出现。所以「③ 成立」与
       「旧版清空不干净」是同一件事的两面，不是两条无关断言。 */
    const win = loadApp();
    expect(win.localStorage.getItem(PREFIX + "init"), "首次启动后 init 应被 seed 置位").toBe("true");
    expect(win.__test.getTasks().length, "首启示例任务数（seed 里是 4 条）").toBe(4);
  });
});
