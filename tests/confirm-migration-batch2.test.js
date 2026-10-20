/**
 * confirm-migration-batch2.test.js —— 第二批原生 confirm() → dangerConfirm 的**真路径**验证
 * --------------------------------------------------------------------------------------------
 * 与 batch1 同一条判据，不重复论证：
 *   ① 点触发键 → 出现 dangerConfirm，且**动作还没发生**；
 *   ② 点「确认执行」→ 动作真的发生（用用户看得见的条目数来判，不读内部变量）。
 *
 * 本批迁移 8 处（全在 src/ui-global-events.js）：
 *   #ghClear（GitHub token 清除）/ #wdClear（WebDAV 配置清除）/ [data-revoke]×2（API Key 吊销）
 *   / #aiSessClear（AI 会话历史清除）/ #btnClearMem（工作记忆清空）
 *   / #chainResetBtn（联动规则重置）/ [data-del]（联动规则删除，委托）
 *
 * 本文件覆盖其中**能靠 storage 播种驱动真实入口**的 3 条（AI 会话历史 / 工作记忆 / 联动规则）。
 * 其余 5 条需要 electronAPI 或真实 key 列表才能进入可点状态 —— **未覆盖这件事如实登记在文末**，
 * 不写"已验证"。
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

/** 让未 settle 的 Promise / 微任务跑完，避免"点了但断言太快"的假红 */
const tick = () => new Promise((r) => setTimeout(r, 30));

describe("AI 会话历史清除（src/ui-global-events.js #aiSessClear）", () => {
  const KEY = PREFIX + "ai_config_session";
  const seed = () => ({ [KEY]: JSON.stringify({ history: [
    { id: "h1", title: "历史甲", time: "2026-10-20 10:00" },
    { id: "h2", title: "历史乙", time: "2026-10-20 09:00" },
  ] }) });
  const rows = (win) => {
    const box = win.document.getElementById("aiSessHistory");
    return box ? box.querySelectorAll(".set-switch").length : -1;
  };

  it("点清除 → 先出确认框且历史还在；点确认后才真的清空", async () => {
    const win = await boot(seed());
    /* 前提：会话历史面板已渲染出播种的两条（否则后面"少了"是假象） */
    await vi.waitFor(() => expect(rows(win)).toBe(2));

    const btn = win.document.getElementById("aiSessClear");
    expect(btn, "AI 页应有「清除会话历史」键").toBeTruthy();
    btn.click();

    await vi.waitFor(() => expect(isOpen(win)).toBe(true));
    expect(rows(win), "确认框还没点头，历史不该少").toBe(2);

    win.document.getElementById(MODAL + "Yes").click();
    await vi.waitFor(() => expect(rows(win)).toBe(0));
    expect(isOpen(win), "确认后浮层应关掉").toBe(false);
  });

  it("点取消 → 历史一条不少（确认框不是走过场）", async () => {
    const win = await boot(seed());
    await vi.waitFor(() => expect(rows(win)).toBe(2));
    win.document.getElementById("aiSessClear").click();
    await vi.waitFor(() => expect(isOpen(win)).toBe(true));
    win.document.getElementById(MODAL + "No").click();
    await vi.waitFor(() => expect(isOpen(win)).toBe(false));
    expect(rows(win), "取消不该清掉任何历史").toBe(2);
  });

  it("Esc 取消同样不清（键盘路径与鼠标路径同结果）", async () => {
    const win = await boot(seed());
    await vi.waitFor(() => expect(rows(win)).toBe(2));
    win.document.getElementById("aiSessClear").click();
    await vi.waitFor(() => expect(isOpen(win)).toBe(true));
    win.document.getElementById(MODAL)
      .dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await vi.waitFor(() => expect(isOpen(win)).toBe(false));
    expect(rows(win)).toBe(2);
  });
});

describe("工作记忆清空（src/ui-global-events.js #btnClearMem）", () => {
  const KEY = PREFIX + "memory";
  const seed = () => ({ [KEY]: JSON.stringify([{ id: "m1", text: "记忆甲" }, { id: "m2", text: "记忆乙" }]) });
  const memLen = (win) => {
    try { return JSON.parse(win.localStorage.getItem(KEY) || "[]").length; } catch (_e) { return -1; }
  };

  it("点清空 → 先出确认框且记忆还在；确认后才真的空", async () => {
    const win = await boot(seed());
    expect(memLen(win), "前提：播种的两条记忆在").toBe(2);

    const btn = win.document.getElementById("btnClearMem");
    expect(btn, "应有「清空工作记忆」键").toBeTruthy();
    btn.click();
    await vi.waitFor(() => expect(isOpen(win)).toBe(true));
    expect(memLen(win), "确认框还没点头，记忆不该少").toBe(2);

    win.document.getElementById(MODAL + "Yes").click();
    await vi.waitFor(() => expect(memLen(win)).toBe(0));
  });

  it("点取消 → 记忆一条不少", async () => {
    const win = await boot(seed());
    win.document.getElementById("btnClearMem").click();
    await vi.waitFor(() => expect(isOpen(win)).toBe(true));
    win.document.getElementById(MODAL + "No").click();
    await vi.waitFor(() => expect(isOpen(win)).toBe(false));
    expect(memLen(win)).toBe(2);
  });
});

describe("联动规则（src/ui-global-events.js #chainResetBtn / #linksBox 委托删除）", () => {
  const KEY = "wb_custom_links";   /* ⚠️ 该键**不带** PREFIX（data-links.js 显式约定） */
  const mkLink = (id, kw) => ({ id, name: "办公→学习", fromSc: "office", kw, toSc: "study",
    taskTitle: "奖励：" + kw, priority: "P2", enabled: true });
  const seed = () => ({ [KEY]: JSON.stringify([mkLink("c1", "种子甲"), mkLink("c2", "种子乙")]) });
  const linkLen = (win) => {
    const raw = win.localStorage.getItem(KEY);
    if (raw === null) return 0;                       /* resetCustomLinks 是整键删除 */
    try { return JSON.parse(raw).length; } catch (_e) { return -1; }
  };

  it("重置为默认：点 → 先出确认框且自定义链还在；确认后才真的清掉", async () => {
    const win = await boot(seed());
    expect(linkLen(win), "前提：播种的两条自定义链在").toBe(2);

    const btn = win.document.getElementById("chainResetBtn");
    expect(btn, "设置抽屉联动页应有「重置为默认」键").toBeTruthy();
    btn.click();

    await vi.waitFor(() => expect(isOpen(win)).toBe(true));
    expect(linkLen(win), "确认框还没点头，自定义链不该消失").toBe(2);

    win.document.getElementById(MODAL + "Yes").click();
    await vi.waitFor(() => expect(win.localStorage.getItem(KEY)).toBeNull());
  });

  it("重置点取消 → 自定义链一条不少", async () => {
    const win = await boot(seed());
    win.document.getElementById("chainResetBtn").click();
    await vi.waitFor(() => expect(isOpen(win)).toBe(true));
    win.document.getElementById(MODAL + "No").click();
    await vi.waitFor(() => expect(isOpen(win)).toBe(false));
    expect(linkLen(win)).toBe(2);
  });

  it("单条删除（事件委托）：点 [data-del] → 先出确认框；确认后少一条且少的正是那条", async () => {
    const win = await boot(seed());
    /* 走真实渲染入口，保证断言的是 DOM 里真实存在的行 */
    win.__test.renderLinksBox();
    const delBtn = win.document.querySelector("#linksBox [data-del]");
    expect(delBtn, "联动列表应渲染出删除键").toBeTruthy();
    const id = delBtn.getAttribute("data-del");
    expect(linkLen(win)).toBe(2);

    delBtn.click();
    await vi.waitFor(() => expect(isOpen(win)).toBe(true));
    expect(linkLen(win), "确认框还没点头，不该删").toBe(2);

    win.document.getElementById(MODAL + "Yes").click();
    await vi.waitFor(() => expect(linkLen(win)).toBe(1));
    expect(win.__test.getLinks().map((l) => l.id), "被确认的那条应已消失").not.toContain(id);
    await tick();
  });

  it("单条删除点取消 → 一条不少", async () => {
    const win = await boot(seed());
    win.__test.renderLinksBox();
    win.document.querySelector("#linksBox [data-del]").click();
    await vi.waitFor(() => expect(isOpen(win)).toBe(true));
    win.document.getElementById(MODAL + "No").click();
    await vi.waitFor(() => expect(isOpen(win)).toBe(false));
    expect(linkLen(win)).toBe(2);
  });
});

/* 未覆盖登记（本批如实留下的口子，不是"已验证"）：
   - src/ui-global-events.js:588   #ghClear：需先存过 github_device_token 且走 renderIntegrationPanel
   - src/ui-global-events.js:626   #wdClear：需 electronAPI.webdavFetch 存在才会渲染输入框/按钮（浏览器形态刻意不渲染）
   - src/ui-global-events.js:679   [data-revoke]（集成面板）：需真实 API Key 列表
   - src/ui-global-events.js:716   [data-revoke]（AI 面板）：需真实 API Key 列表
   - src/ui-global-events.js:645   [data-int-push]：本批**刻意未迁** —— 它被
       tests/notion-push.test.js:168 与 tests/e2e/integration-push.spec.js 用 `win.confirm` 替身 /
       `page.on("dialog")` 自动接盘驱动；改成真浮层必须同时改这两处，否则测试会静默走"没确认"分支
       而生产行为已变（本仓记过两次的同型坑）。留给下一批连同测试一起做。
   以上各点只做了「原生 confirm 已消失 + 改为 await dangerConfirm」的静态替换与语法校验，
   行为路径未跑。 */
