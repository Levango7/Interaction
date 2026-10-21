/**
 * confirm-migration-batch5.test.js —— 第五批原生 confirm() → dangerConfirm 的**真路径**验证
 * --------------------------------------------------------------------------------------------
 * 与前几批同一条判据，不重复论证：
 *   ① 点触发键 → 出现 dangerConfirm，且**动作还没发生**；
 *   ② 点「确认执行」→ 动作真的发生（用用户看得见的条目数来判，不读内部变量）；
 *   ③ 取消与 Esc 两条路径都必须"什么都不发生"。
 *
 * 本批迁移 10 处：
 *   · `src/ui-drawer.js` 5 处：场景删除 / **Profile 删除** / 模板导入 / 插件卸载 / 自定义主题删除
 *   · `src/ui-scene-bind.js` 5 处：**删除任务** ×3（看板按钮 ×2 + 键盘 Delete）/ 删除记录 / **批量删除**
 *
 * 本文件覆盖其中能靠真实入口稳定驱动的 4 处（加粗那四处），分别是：
 *   describe 1 —— 删除任务（`[data-del]`，覆盖 ui-scene-bind:49 与 :377 两处同一文案的调用点）
 *   describe 2 —— 批量删除（`batchDelete`；**UI 入口未接线**，测试自造最小载体走真实绑定）
 *   describe 3 —— Profile 删除（`delProfile` + `#cfgProfileDel`）
 *
 * 🔴 本批唯一一处**非机械**改动：`batchDelete()` 有返回值（`return n`），改 async 之后
 *    返回的是 **Promise<number>**，调用方 `ui-scene-bind.js` 里那句
 *    `batchDelete(); render();` 因此改成了 `await batchDelete(); render();`。
 *    ⚠️ 但要如实说：变异验证证明这个 await **不是必须的** —— 不 await 也能最终刷新
 *    （删除走 `setTasks`，其数据广播会触发整体 render）。保留它只是为了让刷新发生在
 *    删除之后、语义更清晰，且不把正确性押在"setTasks 一定广播"这个隐式副作用上。
 *    describe 2 的「确认后界面真的少两张卡片」钉住的是"界面最终刷新"这个**用户可见**性质，
 *    它**不区分**上面两种写法 —— 射程写清楚，免得后人误以为它在守 await。
 *
 * 🔴 本批还顺带查出一条**未接线**缺陷（已登记审计项，不在本批修）：批量删除整条链
 *    `bindBatchToolbar()` 全仓没有任何调用点，`#batchToolbar` / `#btnBatchDelete` 也不在
 *    静态 HTML 里 —— 即用户在界面上**没有任何路径能触发批量删除**。修它要动布局，超出
 *    "confirm 迁移"的批次职责，所以只在 batch5 里用一条断言把缺陷钉住（见文末）。 *
 *
 * 未覆盖登记（如实写，不写"已验证"）：ui-drawer 的场景删除 / 模板导入 / 插件卸载 /
 * 自定义主题删除（分别要先打开抽屉对应分区、装插件、建自定义主题，驱动成本高）；
 * ui-scene-bind 的键盘 Delete 路径与删除记录（`[data-rdel]`）。它们与前几批已覆盖的
 * 调用点走的是**同一个 dangerConfirm 组件**，差异只在触发方式。
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

const windows = [];
afterEach(() => windows.splice(0).forEach((win) => win.close()));

const MODAL = "dangerConfirmModal";
const PREFIX = "wb_agent_";
const isOpen = (win) => !!win.document.getElementById(MODAL);

async function boot(storage) {
  const win = loadApp({ storage: storage || {} });
  windows.push(win);
  await vi.waitFor(() => expect(win.document.getElementById("chatPanel")._bound).toBe(true));
  return win;
}

/** 让未 settle 的 Promise / 微任务跑完 */
const tick = () => new Promise((r) => setTimeout(r, 30));

/** 用户看得见的「可删除条目」数量：每个任务卡片上有一个 [data-del] 删除键 */
const delBtns = (win) => win.document.querySelectorAll("[data-del]").length;

/**
 * 播种若干任务并渲染到看板。
 * ⚠️ 必须是 `setActive("office")`（**场景页**）而不是 "tasks" —— 任务卡片的
 * `[data-del]` 是场景看板渲染出来的，切到 "tasks" 页面上一个都找不到，
 * 表现是 `expected 0 to be greater than 0`，很容易被误读成"删除生效了"。
 */
async function withTasks(win, titles) {
  win.setTasks(titles.map((title, i) => ({
    id: "b5-" + i, sc: "office", title: title, status: "todo",
    due: "", priority: "", doneAt: null, note: "", tags: [], created: Date.now(),
  })));
  win.setActive("office");
  win.render();
  await vi.waitFor(() => expect(delBtns(win)).toBeGreaterThan(0));
  return titles.length;
}

describe("删除任务（src/ui-scene-bind.js [data-del]）", () => {
  it("点删除 → 先出确认框且任务还在；点确认后任务才真的进回收站", async () => {
    const win = await boot();
    const n = await withTasks(win, ["任务甲", "任务乙"]);
    expect(n, "前置：播种了两条任务").toBe(2);

    win.document.querySelector("[data-del]").click();
    await vi.waitFor(() => expect(isOpen(win)).toBe(true));
    expect(delBtns(win), "确认框还没点头，一条都不该少").toBe(n);

    win.document.getElementById(MODAL + "Yes").click();
    await vi.waitFor(() => expect(isOpen(win)).toBe(false));
    await tick();
    expect(delBtns(win), "确认后应少一条").toBe(n - 1);
  });

  it("点取消 → 一条任务都不少（确认框不是走过场）", async () => {
    const win = await boot();
    const n = await withTasks(win, ["任务甲", "任务乙"]);

    win.document.querySelector("[data-del]").click();
    await vi.waitFor(() => expect(isOpen(win)).toBe(true));
    win.document.getElementById(MODAL + "No").click();
    await vi.waitFor(() => expect(isOpen(win)).toBe(false));
    await tick();
    expect(delBtns(win), "取消不该删掉任何任务").toBe(n);
  });

  it("Esc 取消同样不删（键盘路径与鼠标路径同结果）", async () => {
    const win = await boot();
    const n = await withTasks(win, ["任务甲", "任务乙"]);

    win.document.querySelector("[data-del]").click();
    await vi.waitFor(() => expect(isOpen(win)).toBe(true));
    const wrap = win.document.getElementById(MODAL);
    wrap.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await vi.waitFor(() => expect(isOpen(win)).toBe(false));
    await tick();
    expect(delBtns(win), "Esc 不该删掉任何任务").toBe(n);
  });
});

describe("批量删除（src/ui-scene-bind.js batchDelete）", () => {
  /** 进入批量模式并选中前两条，返回播种条数 */
  async function selectTwo(win) {
    const n = await withTasks(win, ["批量甲", "批量乙", "批量丙"]);
    win.__test.toggleBatchMode(true);
    win.__test.toggleBatchSelect("b5-0", true);
    win.__test.toggleBatchSelect("b5-1", true);
    win.render();
    await vi.waitFor(() => expect(win.__test.getBatchSelected().length).toBe(2));
    return n;
  }

  /* 🔴 新发现（本批顺带查出，属**既有缺陷**，已登记审计项，不在本批修）：
     批量删除整条链在 UI 上**没有入口** —— `#batchToolbar` / `#btnBatchDelete` 不在静态
     HTML 里，而 `bindBatchToolbar()`（src/ui-scene-bind.js:601）在整个仓库里
     **没有任何调用点**。

     为了仍能测到调用方那句 `await batchDelete(); render();`，这里**自己造一个最小载体**：
     补上 `#batchToolbar` 与 `#btnBatchDelete` 两个节点，再调 `bindBatchToolbar()` 走
     **真实绑定**，然后点按钮。这样被测的是源码里那一句本身，而不是测试里抄的一份 ——
     否则"漏 await"这种回归根本没有判据能抓到（实测过：第一版测试自己
     `await p; render()` 去模拟调用方，把源码改回 `batchDelete(); render();` 后
     **一条都没红**，即判据无射程）。 */

  /** 造最小入口载体并点一次「批量删除」，走 bindBatchToolbar 的真实绑定 */
  function clickBatchDelete(win) {
    const bar = win.document.createElement("div");
    bar.id = "batchToolbar";
    win.document.body.appendChild(bar);
    const btn = win.document.createElement("button");
    btn.id = "btnBatchDelete";
    win.document.body.appendChild(btn);
    win.__test.bindBatchToolbar();
    expect(typeof btn.onclick, "bindBatchToolbar 必须真的把批量删除绑到按钮上").toBe("function");
    btn.click();
  }

  it("点批量删除 → 先出确认框且任务还在；点确认后真的删掉，且**界面确实刷新了**", async () => {
    const win = await boot();
    const n = await selectTwo(win);
    expect(win.__test.getBatchSelected().length, "前提：选中了两条").toBe(2);

    clickBatchDelete(win);
    await vi.waitFor(() => expect(isOpen(win)).toBe(true));
    expect(delBtns(win), "确认框还没点头，一条都不该少").toBe(n);

    win.document.getElementById(MODAL + "Yes").click();
    /* 判据看 DOM 而不是只看数据：确认后界面必须真的少两张卡片。
       ⚠️ 这条**不区分**调用方写 `await batchDelete(); render();` 还是
       `batchDelete(); render();` —— 变异验证实测后者也能刷新（删除走 setTasks，
       其数据广播会补上整体 render）。所以它的射程是"界面最终刷新"这个用户可见性质，
       不是"await 与否"；不 await 的问题只是多跑一次多余 render、并把正确性押在
       隐式广播上。 */
    await vi.waitFor(() => expect(delBtns(win)).toBe(n - 2), { timeout: 10_000, interval: 30 });
  });

  it("点取消 → 一条都不少，且仍处于批量模式（确认框不是走过场）", async () => {
    const win = await boot();
    const n = await selectTwo(win);

    clickBatchDelete(win);
    await vi.waitFor(() => expect(isOpen(win)).toBe(true));
    win.document.getElementById(MODAL + "No").click();
    await tick();
    expect(delBtns(win), "取消不该删掉任何任务").toBe(n);
    expect(win.__test.getBatchSelected().length, "取消后选择状态应保留").toBe(2);
  });

  it("一条都没选时点批量删除：不该弹确认框（不进死路）", async () => {
    const win = await boot();
    await withTasks(win, ["批量甲"]);
    win.__test.toggleBatchMode(true);
    win.render();

    clickBatchDelete(win);
    await tick();
    expect(isOpen(win), "没有选中项时不该弹确认框（batchDelete 内部提前 return 0）").toBe(false);
  });

  it("登记：批量删除的 UI 入口当前**不存在**（缺陷钉住，防遗忘）", async () => {
    const win = await boot();
    await withTasks(win, ["登记用"]);
    win.__test.toggleBatchMode(true);
    win.render();
    await tick();

    /* 这不是"期望状态"，而是**缺陷登记**：bindBatchToolbar() 全仓无调用点、
       `#batchToolbar` 也不在静态 HTML 里 ⇒ 用户界面上没有任何路径能触发批量删除。
       这条断言的作用是把缺陷钉在测试里，让它不至于被遗忘；将来有人把工具栏接上线，
       这条会红 —— 那时就该把它删掉，并把上面三条改成走真实入口 `#btnBatchDelete` 的真路径验证。 */
    expect(win.document.getElementById("btnBatchDelete"),
      "登记：批量删除按钮当前缺失（bindBatchToolbar 无人调用）。接上线后这条会红，请改走真实入口")
      .toBeNull();
  });
});

describe("Profile 删除（src/ui-drawer.js delProfile / #cfgProfileDel）", () => {
  const seed = () => ({
    [PREFIX + "cfg"]: JSON.stringify({
      enabled: true, base: "https://a", key: "sk-1", model: "m",
      activeId: "p1",
      profiles: [
        { id: "p1", name: "Profile 甲", base: "https://a", key: "sk-1", model: "m" },
        { id: "p2", name: "Profile 乙", base: "https://b", key: "sk-2", model: "m" },
      ],
    }),
  });
  const count = (win) => win.__test.getCfg().profiles.length;

  it("点删除 Profile → 先出确认框且数量不变；点确认后才真的 -1", async () => {
    const win = await boot(seed());
    await vi.waitFor(() => expect(count(win)).toBe(2));
    const btn = win.document.getElementById("cfgProfileDel");
    expect(btn, "设置页应有删除 Profile 的键").toBeTruthy();

    btn.click();
    await vi.waitFor(() => expect(isOpen(win)).toBe(true));
    expect(count(win), "确认框还没点头，不该少").toBe(2);

    win.document.getElementById(MODAL + "Yes").click();
    await vi.waitFor(() => expect(isOpen(win)).toBe(false));
    await tick();
    expect(count(win), "确认后应少一个").toBe(1);
  });

  it("点取消 → 数量不变（确认框不是走过场）", async () => {
    const win = await boot(seed());
    await vi.waitFor(() => expect(count(win)).toBe(2));

    win.document.getElementById("cfgProfileDel").click();
    await vi.waitFor(() => expect(isOpen(win)).toBe(true));
    win.document.getElementById(MODAL + "No").click();
    await vi.waitFor(() => expect(isOpen(win)).toBe(false));
    await tick();
    expect(count(win), "取消不该删掉任何 Profile").toBe(2);
  });
});
