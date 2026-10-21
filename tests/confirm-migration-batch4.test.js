/**
 * confirm-migration-batch4.test.js —— 第四批原生 confirm() → dangerConfirm 的**真路径**验证
 * --------------------------------------------------------------------------------------------
 * 与前几批同一条判据，不重复论证：
 *   ① 点触发键 → 出现 dangerConfirm，且**动作还没发生**；
 *   ② 点「确认执行」→ 动作真的发生（用用户看得见的条目数 / 真实外发请求来判，不读内部变量）；
 *   ③ 取消与 Esc 两条路径都必须"什么都不发生"。
 *
 * 本批迁移 2 处：
 *   · `src/ui-backup-stats.js` `doClear()`（清空全部数据）
 *   · `src/ui-global-events.js` `[data-int-push]`（集成任务推送）
 *
 * 这两处各自带来一个**上一批没遇到过的坑**，写在这里以免第五批重踩：
 *
 * ① `doClear` 结尾有 `setTimeout(() => location.reload(), 900)`。真实计时器下这条尾巴会在
 *    断言之后才落地，打在已关闭的窗口上就是一条与本次改动无关的 Unhandled 噪声
 *    （第三批 batch3 为此红过一次，见该文件文末登记）。所以本文件对清空路径一律
 *    **切假计时器**：reload 永不触发。
 *    而假计时器下 `autoDangerConfirm` 接盘器**失效**（它靠 setTimeout 轮询找按钮），
 *    所以这里改成"同步点掉确认按钮 + 微任务 flush"—— 浮层是在 Promise executor 里同步
 *    挂进 DOM 的，点掉之后的代码走微任务队列，而**微任务不受 fake timers 影响**。
 *
 * ② `[data-int-push]` 的替换牵动 e2e：`tests/e2e/integration-push.spec.js` 原来靠
 *    `page.on("dialog", d => d.accept())` 接原生框，而这个事件**只管原生 alert/confirm/
 *    prompt**，对真浮层毫无作用 —— 已改为注入 MutationObserver 自动点「确认执行」。
 *    这一步自身还有个坑：init script 跑在**文档创建之前**，实测此刻 `readyState` 还是
 *    `"loading"`、`document.documentElement` 是 null，`observe(null)` 会**静默失败**
 *    （第一版因此一次红了 6 例，快照里能看到确认框开着而请求数为 0）。正解是先试挂一次、
 *    不成交给 `readystatechange` 重试。
 *    本文件只覆盖 jsdom 侧；e2e 那一侧由 spec 自身保证。
 *
 * 未覆盖登记（如实写，不写"已验证"）：`[data-int-push]` 这一处代码是所有 provider 共用的
 * 同一个委托绑定，本文件只驱动 notion 一个 provider 的按钮；Linear / Jira 走的是同一段
 * 确认代码，不复测。
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

const windows = [];
afterEach(() => { vi.useRealTimers(); windows.splice(0).forEach((win) => win.close()); });

const MODAL = "dangerConfirmModal";
const PREFIX = "wb_agent_";
const isOpen = (win) => !!win.document.getElementById(MODAL);

async function boot(storage) {
  const win = loadApp({ storage: storage || {} });
  windows.push(win);
  await vi.waitFor(() => expect(win.document.getElementById("chatPanel")._bound).toBe(true));
  return win;
}

/** 把微任务队列跑干（fake timers 下也能用：微任务不受假计时器影响） */
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

/** 让未 settle 的 Promise / 定时器跑完 */
const tick = () => new Promise((r) => setTimeout(r, 30));

describe("清空全部数据（src/ui-backup-stats.js doClear）", () => {
  it("点「清空全部数据」→ 先出确认框且数据还在；点确认后才真的清空", async () => {
    const win = await boot();
    expect(win.__test.getTasks().length, "前置：首启应有示例任务").toBeGreaterThan(0);

    const btn = win.document.getElementById("btnClear");
    expect(btn, "设置页应有「清空全部数据」键").toBeTruthy();
    expect(typeof btn.onclick, "该键必须真的接上了处理函数（函数正确 ≠ 被接线）").toBe("function");

    vi.useFakeTimers(); /* 拦掉 doClear 结尾 900ms 后的 location.reload */
    try {
      btn.click();
      expect(isOpen(win), "点清空必须先弹确认浮层").toBe(true);
      expect(win.__test.getTasks().length, "确认框还没点头，任务数不该变").toBeGreaterThan(0);

      win.document.getElementById(MODAL + "Yes").click();
      await flush();

      expect(isOpen(win), "确认后浮层应关掉").toBe(false);
      expect(win.localStorage.getItem(PREFIX + "tasks"), "确认后 tasks 应变成空数组").toBe("[]");
      expect(win.__test.getTasks().length, "确认后应当一条任务都不剩").toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("点取消 → 一条任务都不少（确认框不是走过场）", async () => {
    const win = await boot();
    const before = win.__test.getTasks().length;
    expect(before, "前置：首启应有示例任务").toBeGreaterThan(0);

    vi.useFakeTimers();
    try {
      win.document.getElementById("btnClear").click();
      await flush();
      expect(isOpen(win), "取消前确认框应当开着").toBe(true);

      win.document.getElementById(MODAL + "No").click();
      await flush();

      expect(isOpen(win), "取消后浮层应关掉").toBe(false);
      expect(win.__test.getTasks().length, "取消不该清掉任何任务").toBe(before);
      expect(win.localStorage.getItem(PREFIX + "tasks"), "取消后不该改写 tasks 键").not.toBe("[]");
    } finally {
      vi.useRealTimers();
    }
  });

  it("Esc 取消同样不清（键盘路径与鼠标路径同结果）", async () => {
    const win = await boot();
    const before = win.__test.getTasks().length;
    expect(before, "前置：首启应有示例任务").toBeGreaterThan(0);

    vi.useFakeTimers();
    try {
      win.document.getElementById("btnClear").click();
      await flush();
      const wrap = win.document.getElementById(MODAL);
      expect(wrap, "Esc 前确认框应当开着").toBeTruthy();
      wrap.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      await flush();

      expect(isOpen(win), "Esc 后浮层应关掉").toBe(false);
      expect(win.__test.getTasks().length, "Esc 不该清掉任何任务").toBe(before);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("集成任务推送（src/ui-global-events.js [data-int-push]）", () => {
  const T = (id, title) => ({ id: id, sc: "office", title: title, status: "todo", due: "", priority: "", doneAt: null, note: "", tags: [], created: Date.now() });

  /** 装 http 替身 + 连上 Notion，返回记录到的请求数组（已清零，只看推送阶段） */
  async function connected(win) {
    const calls = [];
    win.integrationSetHttpClient(async (url, opts) => {
      const rec = { url: String(url), method: (opts && opts.method) || "GET" };
      calls.push(rec);
      return { ok: true, status: 200, body: { id: "page-me" }, json: async () => ({ id: "page-me" }) };
    });
    const prov = await win.notionConnect({ token: "secret_test_token", databaseId: "db-1" });
    expect(prov, "前提：Notion 已连接").toBeTruthy();
    calls.length = 0;
    return calls;
  }

  /** 渲染出推送按钮（连上之后面板里才有） */
  async function pushButton(win) {
    win.setTasks([T("t1", "未完成 A")]);
    win.renderIntegrationPanel();
    const btn = win.document.querySelector('[data-int-push="notion"]');
    expect(btn, "连接后必须出现推送入口").toBeTruthy();
    return btn;
  }

  it("点推送 → 先出确认框且一个请求都还没发；点确认后请求才真的出去", async () => {
    const win = await boot();
    const calls = await connected(win);
    const btn = await pushButton(win);

    btn.onclick();
    await vi.waitFor(() => expect(isOpen(win)).toBe(true));
    expect(calls.length, "确认框还没点头，一个请求都不该发出去").toBe(0);
    await tick(); /* 再给一点时间：确认"没发"不是"还没来得及发" */
    expect(calls.length, "等待后仍然不该有请求").toBe(0);

    win.document.getElementById(MODAL + "Yes").click();
    await vi.waitFor(() => expect(calls.length).toBeGreaterThan(0), { timeout: 10_000, interval: 20 });
    expect(isOpen(win), "确认后浮层应关掉").toBe(false);
  });

  it("点取消 → 一个请求都不发（确认框不是走过场）", async () => {
    const win = await boot();
    const calls = await connected(win);
    const btn = await pushButton(win);

    btn.onclick();
    await vi.waitFor(() => expect(isOpen(win)).toBe(true));
    win.document.getElementById(MODAL + "No").click();
    await vi.waitFor(() => expect(isOpen(win)).toBe(false));
    await tick();
    expect(calls.length, "取消后一个请求都不该发").toBe(0);
  });

  it("Esc 取消同样不发（键盘路径与鼠标路径同结果）", async () => {
    const win = await boot();
    const calls = await connected(win);
    const btn = await pushButton(win);

    btn.onclick();
    await vi.waitFor(() => expect(isOpen(win)).toBe(true));
    const wrap = win.document.getElementById(MODAL);
    wrap.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await vi.waitFor(() => expect(isOpen(win)).toBe(false));
    await tick();
    expect(calls.length, "Esc 后一个请求都不该发").toBe(0);
  });

  it("确认文案带上了条数与目标名（不是一句干巴巴的「确定吗」）", async () => {
    const win = await boot();
    await connected(win);
    const btn = await pushButton(win);

    btn.onclick();
    await vi.waitFor(() => expect(isOpen(win)).toBe(true));
    const text = win.document.getElementById(MODAL).textContent;
    expect(text, "文案应带条数").toMatch(/1/);
    expect(text, "文案应带目标集成名").toMatch(/Notion|notion/);
    win.document.getElementById(MODAL + "No").click();
  });
});
