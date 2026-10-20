/**
 * confirm-migration-batch1.test.js —— 首批原生 confirm() → dangerConfirm 的**真路径**验证
 * ----------------------------------------------------------------------------
 * 为什么单独立一个文件：这几个调用点此前**零测试覆盖**（全仓 grep 找不到 `#sessList` /
 * `data-ics-del` / `kb-file-del` / `btnNoteDelete` 的测试）。只把 `confirm(...)` 换成
 * `await dangerConfirm(...)` 而不跑通一条真路径，就正好落进本仓反复记的那类坑 ——
 * **接线存在 ≠ 调用能通过**。所以判据只有两条：
 *   ① 点删除 → 出现 dangerConfirm，且**动作还没发生**；
 *   ② 点「确认执行」→ 动作真的发生（用用户看得见的路径条目数来判，不读内部变量）。
 *
 * 本批 4 处迁移里，本文件覆盖「会话删除」这一条（可纯 storage 播种、无需文件/网络）。
 * 另外 3 处（日历源 / 笔记 / 知识库文件）需要 ics 订阅、已有笔记、上传文件条目才能进入
 * 编辑态，播种成本高于本批价值 —— **未覆盖这件事如实登记在文末**，不写"已验证"。
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

const windows = [];
afterEach(() => windows.splice(0).forEach((win) => win.close()));

const MODAL = "dangerConfirmModal";
const isOpen = (win) => !!win.document.getElementById(MODAL);

/** 两条 office 会话：deleteSession 在只剩一条时是"清空消息"而非删条目，所以必须播种两条 */
function seedSessions() {
  const mk = (id, title, updatedAt) => ({
    id, sc: "office", title, createdAt: updatedAt, updatedAt,
    msgs: [{ role: "user", content: "种子消息", createdAt: updatedAt }],
  });
  return {
    wb_agent_ai_sessions: JSON.stringify([
      mk("sess-a", "会话甲", "2026-10-20T10:00:00.000Z"),
      mk("sess-b", "会话乙", "2026-10-20T09:00:00.000Z"),
    ]),
  };
}

async function bootWithSessions() {
  const win = loadApp({ storage: seedSessions() });
  windows.push(win);
  await vi.waitFor(() => expect(win.document.getElementById("chatPanel")._bound).toBe(true));
  /* 走真实入口：#chatSessionBtn → openSessionModal() → renderSessionList()。
     直接调 openSessionModal 会把"按钮绑定是否还活着"这一环测漏掉（P0 刚清过一批死入口）。 */
  const btn = win.document.getElementById("chatSessionBtn");
  expect(btn, "会话管理入口按钮应存在").toBeTruthy();
  btn.click();
  await vi.waitFor(() => expect(win.document.querySelectorAll("#sessList .sess-item").length).toBe(2));
  return win;
}

describe("会话删除（src/data-links.js renderSessionList 的 delete 分支）", () => {
  it("点删除 → 先出确认框且条目没少；确认后才真的少一条", async () => {
    const win = await bootWithSessions();
    const rows = () => win.document.querySelectorAll("#sessList .sess-item").length;
    expect(rows(), "播种的两条会话应都渲染出来").toBe(2);

    const delBtn = win.document.querySelector('#sessList [data-act="delete"]');
    expect(delBtn, "会话条目应有删除键").toBeTruthy();
    const sid = delBtn.getAttribute("data-sid");

    delBtn.click();
    await vi.waitFor(() => expect(isOpen(win)).toBe(true));
    expect(rows(), "确认框还没点头，条目不该少").toBe(2);

    win.document.getElementById(MODAL + "Yes").click();
    await vi.waitFor(() => expect(rows()).toBe(1));
    expect(isOpen(win), "确认后浮层应关掉").toBe(false);
    const rest = [...win.document.querySelectorAll("#sessList .sess-item")]
      .map((el) => el.getAttribute("data-sid"));
    expect(rest, "被确认的那条应已消失").not.toContain(sid);
  });

  it("点取消 → 一条不少（确认框不是走过场）", async () => {
    const win = await bootWithSessions();
    const rows = () => win.document.querySelectorAll("#sessList .sess-item").length;
    expect(rows()).toBe(2);
    win.document.querySelector('#sessList [data-act="delete"]').click();
    await vi.waitFor(() => expect(isOpen(win)).toBe(true));
    win.document.getElementById(MODAL + "No").click();
    await vi.waitFor(() => expect(isOpen(win)).toBe(false));
    expect(rows(), "取消不该删掉任何会话").toBe(2);
  });

  it("Esc 取消同样不删（键盘路径与鼠标路径同结果）", async () => {
    const win = await bootWithSessions();
    const rows = () => win.document.querySelectorAll("#sessList .sess-item").length;
    win.document.querySelector('#sessList [data-act="delete"]').click();
    await vi.waitFor(() => expect(isOpen(win)).toBe(true));
    win.document.getElementById(MODAL)
      .dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await vi.waitFor(() => expect(isOpen(win)).toBe(false));
    expect(rows()).toBe(2);
  });
});

describe("笔记删除（src/ui-ge-notes.js btnNoteDelete）", () => {
  const mkNote = (id, title) => ({
    id, sc: "study", title, body: "正文", tags: ["种子"],
    createdAt: "2026-10-20T10:00:00.000Z", updatedAt: "2026-10-20T10:00:00.000Z",
  });
  const storedNotes = (win) => JSON.parse(win.localStorage.getItem("wb_agent_notes") || "[]");

  it("进笔记 → 打开已有笔记 → 点删除 → 确认后才少一条", async () => {
    const win = loadApp({
      storage: { wb_agent_notes: JSON.stringify([mkNote("n1", "笔记甲"), mkNote("n2", "笔记乙")] ) },
    });
    windows.push(win);
    await vi.waitFor(() => expect(win.document.getElementById("chatPanel")._bound).toBe(true));
    win.__test.setActive("toolbox");
    win.__test.render();
    const card = win.document.querySelector('[data-toolbox="x-notes"]');
    expect(card, "工具箱应有「笔记」卡片").toBeTruthy();
    card.click();

    const item = win.document.querySelector("[data-note-id]");
    expect(item, "笔记列表应渲染出播种的笔记").toBeTruthy();
    item.click();

    const del = win.document.getElementById("btnNoteDelete");
    expect(del, "进入已有笔记编辑态时删除键应存在").toBeTruthy();
    expect(storedNotes(win).length).toBe(2);

    del.click();
    await vi.waitFor(() => expect(isOpen(win)).toBe(true));
    expect(storedNotes(win).length, "确认框还没点头，笔记不该少").toBe(2);

    win.document.getElementById(MODAL + "Yes").click();
    await vi.waitFor(() => expect(storedNotes(win).length).toBe(1));
    expect(storedNotes(win).some((n) => n.id === "n1" || n.id === "n2"),
      "剩下的应是没被选中的那条").toBe(true);
    expect(isOpen(win), "确认后浮层应关掉").toBe(false);
  });
});

/* 未覆盖登记（本批如实留下的口子，不是"已验证"）：
   - src/ui-ge-calendar.js:1407  日历源删除：需先有 ics 订阅并进 openIcsPanel 才会出现 [data-ics-del]
   - src/ui-ge-notes.js:526      知识库文件删除：需真实文件条目（.kb-file-del），要过文件导入路径
   两处只做了「原生 confirm 已消失 + 改为 await dangerConfirm」的静态替换与语法校验，
   行为路径未跑。下一批要么补播种、要么把它们并入 P1-6 的绑定覆盖率台账。 */
