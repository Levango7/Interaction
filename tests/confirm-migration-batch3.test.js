/**
 * confirm-migration-batch3.test.js —— 第三批原生 confirm() → dangerConfirm 的**真路径**验证
 * --------------------------------------------------------------------------------------------
 * 判据与 batch1/batch2 完全一致（不重复论证）：
 *   ① 点触发键 → 出现 dangerConfirm，且**动作还没发生**；
 *   ② 点「确认执行」→ 动作真的发生（用持久化状态来判）。
 *
 * 本批迁移 3 处（全在 src/ui-backup-stats.js）：
 *   · doImport 的 reader.onload（154）—— 宿主本就是 async 闭包，**改一句 await 即可**；
 *   · _preRestoreRollbackFlow（613）→ async
 *   · _preRestoreDeleteFlow（623）→ async
 *
 * 走真实入口（不是内部函数）：
 *   · `#fileInput` 的 onchange（导入唯一入口，ui-global-events.js:33 绑的）
 *   · `#btnPreRestoreRollback` / `#btnPreRestoreDelete` 的 onclick（bindPreRestoreButtons 绑的）
 * jsdom 建不出真 FileList，导入用的是「真实 onchange 处理器 + 手造 files 数组」——
 * 处理器本身是生产代码，喂给它的文件对象由测试构造，这一点如实说明。
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

const windows = [];
afterEach(() => windows.splice(0).forEach((win) => win.close()));

const MODAL = "dangerConfirmModal";
const PREFIX = "wb_agent_";
const PRE = PREFIX + "pre_restore_backup";
const TASKS = PREFIX + "tasks";
const isOpen = (win) => !!win.document.getElementById(MODAL);

function boot(storage) {
  const win = loadApp({ storage: storage || {} });
  windows.push(win);
  return win;
}
const tasks = (win) => {
  try { return JSON.parse(win.localStorage.getItem(TASKS) || "[]"); } catch (_e) { return null; }
};

/* ══════════════════════════════════════════════════════════════════════
   一、导入覆盖确认（doImport · reader.onload · #fileInput.onchange）
   ══════════════════════════════════════════════════════════════════════ */
describe("导入覆盖确认（src/ui-backup-stats.js doImport）", () => {
  /* FileReader 回调在 jsdom 里要经过事件循环，**负载下远超默认 1000ms**（实测两次
     复跑分别耗时 8s / 15s 才触发）。这里是等"文件被读完并解析"这个真实条件，
     不是给慢测试打马虎眼 —— 判据本身不变（确认框出现时数据未被覆盖）。 */
  const READ_TIMEOUT = { timeout: 30000, interval: 50 };
  const mkBackup = (t) => JSON.stringify({
    version: 1, exportedAt: "2026-10-21T00:00:00.000Z",
    [TASKS]: JSON.stringify([{ id: t, sc: "office", title: t, status: "todo" }]),
  });

  function driveImport(win, payload) {
    const input = win.document.getElementById("fileInput");
    expect(input, "导入入口 #fileInput 应在").toBeTruthy();
    const file = new win.File([payload], "backup.json", { type: "application/json" });
    /* 调真实绑定的 onchange；jsdom 造不出真 FileList，手递 files 数组 */
    input.onchange({ target: { files: [file], value: "" } });
  }

  /** 等到导入全程跑完（终端 toast 上屏）—— 否则 initCrypto/toast 的异步尾巴会
      跑到 afterEach 关窗之后，变成 afterEach 关窗后才执行的 Unhandled Rejection。 */
  const waitImportDone = (win) => vi.waitFor(() => {
    const toasts = [...win.document.querySelectorAll("#toasts .toast")].map((el) => el.textContent);
    expect(toasts.join("\n")).toMatch(/导入成功/);
  }, READ_TIMEOUT);

  it("点导入 → 先出确认框且数据没被覆盖；确认后才真的覆盖", { timeout: 180_000 }, async () => {
    const win = boot({ [TASKS]: JSON.stringify([{ id: "now", sc: "office", title: "本机现有", status: "todo" }]) });
    expect(tasks(win).map((x) => x.id), "前提：本机现值在").toEqual(["now"]);

    driveImport(win, mkBackup("from-backup"));
    await vi.waitFor(() => expect(isOpen(win)).toBe(true), READ_TIMEOUT);
    expect(tasks(win).map((x) => x.id), "确认框还没点头，本机数据不许被覆盖").toEqual(["now"]);

    win.document.getElementById(MODAL + "Yes").click();
    await vi.waitFor(() => expect(tasks(win).map((x) => x.id)).toEqual(["from-backup"]));
    await waitImportDone(win);   /* 把异步尾巴跑完，别泄漏到关窗之后 */
    expect(isOpen(win), "确认后浮层应关掉").toBe(false);
  });

  it("点取消 → 本机数据一条不动", { timeout: 120_000 }, async () => {
    const win = boot({ [TASKS]: JSON.stringify([{ id: "now", sc: "office", title: "本机现有", status: "todo" }]) });
    driveImport(win, mkBackup("from-backup"));
    await vi.waitFor(() => expect(isOpen(win)).toBe(true), READ_TIMEOUT);
    win.document.getElementById(MODAL + "No").click();
    await vi.waitFor(() => expect(isOpen(win)).toBe(false));
    expect(tasks(win).map((x) => x.id)).toEqual(["now"]);
    expect([...win.document.querySelectorAll("#toasts .toast")].map((el) => el.textContent).join("\n"),
      "取消后不该出现成功提示").not.toMatch(/导入成功/);
  });

  it("Esc 取消同样不覆盖（键盘路径与鼠标路径同结果）", { timeout: 120_000 }, async () => {
    const win = boot({ [TASKS]: JSON.stringify([{ id: "now", sc: "office", title: "本机现有", status: "todo" }]) });
    driveImport(win, mkBackup("from-backup"));
    await vi.waitFor(() => expect(isOpen(win)).toBe(true), READ_TIMEOUT);
    win.document.getElementById(MODAL)
      .dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await vi.waitFor(() => expect(isOpen(win)).toBe(false));
    expect(tasks(win).map((x) => x.id)).toEqual(["now"]);
  });
});

/* ══════════════════════════════════════════════════════════════════════
   二、恢复前快照：回滚 / 删除（#btnPreRestoreRollback / #btnPreRestoreDelete）
   ══════════════════════════════════════════════════════════════════════ */
describe("恢复前快照回滚（src/ui-backup-stats.js _preRestoreRollbackFlow）", () => {
  const seed = () => ({
    [TASKS]: JSON.stringify([{ id: "after-restore", sc: "office", title: "云端恢复后的", status: "todo" }]),
    [PRE]: JSON.stringify({
      at: 1700000000000,
      keys: { [TASKS]: JSON.stringify([{ id: "before-restore", sc: "office", title: "覆盖前的", status: "todo" }]) },
    }),
  });

  it("点回滚 → 先出确认框且当前值未变；确认后才写回覆盖前", { timeout: 150_000 }, async () => {
    const win = boot(seed());
    expect(tasks(win).map((x) => x.id)).toEqual(["after-restore"]);

    /* 该流程成功后 1.2s 会 location.reload —— fake timers 下不推进，reload 永不触发 */
    vi.useFakeTimers();
    try {
      const btn = win.document.getElementById("btnPreRestoreRollback");
      expect(btn, "回滚入口按钮应存在").toBeTruthy();
      btn.click();

      await vi.waitFor(() => expect(isOpen(win)).toBe(true));
      expect(tasks(win).map((x) => x.id), "确认框还没点头，不许回滚").toEqual(["after-restore"]);

      win.document.getElementById(MODAL + "Yes").click();
      await vi.waitFor(() => expect(tasks(win).map((x) => x.id)).toEqual(["before-restore"]));
      expect(win.localStorage.getItem(PRE), "回滚档可重复使用：确认后仍应保留").toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("点取消 → 当前值不动", { timeout: 120_000 }, async () => {
    const win = boot(seed());
    vi.useFakeTimers();
    try {
      win.document.getElementById("btnPreRestoreRollback").click();
      await vi.waitFor(() => expect(isOpen(win)).toBe(true));
      win.document.getElementById(MODAL + "No").click();
      await vi.waitFor(() => expect(isOpen(win)).toBe(false));
      expect(tasks(win).map((x) => x.id)).toEqual(["after-restore"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("没有快照时不弹确认框，直接如实告知（不走进「点了没反应」）", () => {
    const win = boot({ [TASKS]: JSON.stringify([]) });   /* 无 PRE */
    /* 本路径在第一个 await 之前就 return（preRestoreInfo() 与 toast 都是同步的），
      所以既不需要等、也不该有浮层 —— **刻意不用 fake timers**：
      fake timers 下裸 setTimeout 永不触发，会让这条用例白等到超时（本次实测踩过）。 */
    win.document.getElementById("btnPreRestoreRollback").click();
    expect(isOpen(win), "无快照时不该弹确认框").toBe(false);
  });
});

describe("恢复前快照删除（src/ui-backup-stats.js _preRestoreDeleteFlow）", () => {
  const seed = () => ({
    [TASKS]: JSON.stringify([{ id: "after-restore", sc: "office", title: "云端恢复后的", status: "todo" }]),
    [PRE]: JSON.stringify({
      at: 1700000000000,
      keys: { [TASKS]: JSON.stringify([{ id: "before-restore", sc: "office", title: "覆盖前的", status: "todo" }]) },
    }),
  });

  it("点删除 → 先出确认框且快照还在；确认后才真的删", async () => {
    const win = boot(seed());
    expect(win.localStorage.getItem(PRE), "前提：快照在").toBeTruthy();

    const btn = win.document.getElementById("btnPreRestoreDelete");
    expect(btn, "删除入口按钮应存在").toBeTruthy();
    btn.click();

    await vi.waitFor(() => expect(isOpen(win)).toBe(true));
    expect(win.localStorage.getItem(PRE), "确认框还没点头，快照不许被删").toBeTruthy();

    win.document.getElementById(MODAL + "Yes").click();
    await vi.waitFor(() => expect(win.localStorage.getItem(PRE)).toBeNull());
  });

  it("点取消 → 快照原样保留", async () => {
    const win = boot(seed());
    win.document.getElementById("btnPreRestoreDelete").click();
    await vi.waitFor(() => expect(isOpen(win)).toBe(true));
    win.document.getElementById(MODAL + "No").click();
    await vi.waitFor(() => expect(isOpen(win)).toBe(false));
    expect(win.localStorage.getItem(PRE), "取消不该删掉快照").toBeTruthy();
  });
});

/* 未覆盖登记（本批如实留下的口子，不是"已验证"）：
   - src/ui-backup-stats.js:252 doClear —— **本批刻意未迁**。它有三个非事件型调用方：
       ui-palette.js:153（`run:doClear`，ui-palette.js:289 以 `it.run()` 调用）、
       ui-global-events.js:34（`$("#btnClear").onclick = doClear`）、
       以及两个直接调用的测试 tests/clear-no-reseed.test.js:26 与
       tests/round4-batch1.test.js:113（均**不带 await**，且 OD-004 的守护就在这里）。
     改 async 会让这两个测试在删除发生前就读盘 ⇒ 红的是守护本身。迁移必须连它们一起改成
     点浮层按钮，作为独立一批做，不混在本批。
   两处 preRestore 流程的「确认后失败」分支（r.ok=false / deletePreRestoreBackup() 返回 false）
   需构造失败才能走，播种成本高于本批价值，未覆盖。 */
