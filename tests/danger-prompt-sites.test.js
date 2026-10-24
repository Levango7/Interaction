/**
 * danger-prompt-sites.test.js —— 原生 prompt() → dangerPrompt 的**真路径**验证（R-33）
 * ----------------------------------------------------------------------------
 * 为什么单独立一个文件：`tests/danger-confirm.test.js` 证明的是**组件契约**（布尔 vs
 * 字符串语义、required、secret、互斥），但"组件能用"不等于"迁过的调用点真的通"。
 * 本仓反复记的那类坑就是**接线存在 ≠ 调用能通过** —— confirm 那六批每一批都配了
 * 一条真路径用例，prompt 这批照办。
 *
 * 覆盖的三个调用点，按"风险从高到低"选，不是按好写程度选：
 *   ① 会话重命名（src/data-links.js）—— 唯一一条**纯 storage 播种**就能跑通的迁移点，
 *      顺带钉住 `o.value` 回填与 maxlength；
 *   ② 分享链接回退（src/ui-global-events.js，无 clipboard 的 else 分支）——
 *      本批**改动结构最大**的一处（抽了 showLinkForCopy、删掉两层 try/catch），
 *      且它的用途不是"要用户输入"而是"把链接摆出来让他复制"，契约与别处不同
 *      （required:false + 确认键叫「关闭」+ 打开即全选）；
 *   ③ 分享链接回退（clipboard 失败走 .catch 的分支）—— 同一函数的另一条入口，
 *      原代码两处各写了一遍 prompt，迁移后必须两条都还通。
 *
 * 未覆盖的调用点如实登记（不写"已验证"）：插件 JSON 导入 / 导图节点改字 / 视图命名 /
 * 导出密码 / 日历源重命名 / API Key 命名 ×2。前两者要真实渲染商店页与 SVG 画布，
 * 后几个要文件/加密/ICS 订阅等外部条件，播种成本高于本批价值；组件契约已由
 * `danger-confirm.test.js` 的 9 例钉住（含 required:false 与 secret 两条口径），
 * 调用点的形态与已覆盖的三处同构。
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

const windows = [];
afterEach(() => windows.splice(0).forEach((win) => win.close()));

const PMODAL = "dangerPromptModal";
const isOpen = (win) => !!win.document.getElementById(PMODAL);

/** 两条 office 会话：renameSession 对空标题有兜底，但播两条才能让"改的是哪条"可判 */
function seedSessions() {
  const mk = (id, title, updatedAt) => ({
    id, sc: "office", title, createdAt: updatedAt, updatedAt,
    msgs: [{ role: "user", content: "种子消息", createdAt: updatedAt }],
  });
  return {
    wb_agent_ai_sessions: JSON.stringify([
      mk("sess-a", "会话甲", "2026-10-24T10:00:00.000Z"),
      mk("sess-b", "会话乙", "2026-10-24T09:00:00.000Z"),
    ]),
  };
}

async function bootWithSessions() {
  const win = loadApp({ storage: seedSessions() });
  windows.push(win);
  await vi.waitFor(() => expect(win.document.getElementById("chatPanel")._bound).toBe(true));
  const btn = win.document.getElementById("chatSessionBtn");
  expect(btn, "会话管理入口按钮应存在").toBeTruthy();
  btn.click();
  await vi.waitFor(() => expect(win.document.querySelectorAll("#sessList .sess-item").length).toBe(2));
  return win;
}

describe("会话重命名（src/data-links.js renderSessionList 的 rename 分支）", () => {
  it("点重命名 → 输入框带着当前标题出现；填新标题确认后条目真的改名", async () => {
    const win = await bootWithSessions();
    const titleOf = () => [...win.document.querySelectorAll("#sessList .sess-item")]
      .map((el) => el.querySelector(".sess-title .tx").textContent);

    const renameBtn = win.document.querySelector('#sessList [data-act="rename"]');
    expect(renameBtn, "会话条目应有重命名键").toBeTruthy();
    const sid = renameBtn.getAttribute("data-sid");
    expect(titleOf(), "播种的两条会话应都渲染出来").toContain("会话甲");

    renameBtn.click();
    await vi.waitFor(() => expect(isOpen(win)).toBe(true));
    const modal = win.document.getElementById(PMODAL);
    const input = modal.querySelector("#" + PMODAL + "Input");
    expect(input.value, "输入框应回填当前标题（对齐原生 prompt 的第二个参数）").toBe("会话甲");
    expect(input.getAttribute("maxlength"), "maxlength 60 与调用点一致").toBe("60");
    expect(titleOf(), "确认框还没点头，标题不该变").toContain("会话甲");

    input.value = "改过的名字";
    modal.querySelector("#" + PMODAL + "Yes").click();
    await vi.waitFor(() => expect(isOpen(win)).toBe(false));
    expect(titleOf(), "确认后应显示新标题").toContain("改过的名字");
    expect(titleOf(), "旧标题应消失").not.toContain("会话甲");
    expect(win.document.querySelector('#sessList [data-sid="' + sid + '"]'),
      "同一条会话（按 sid 判，不靠标题文案）").toBeTruthy();
  });

  it("取消 → 标题不变（prompt 的取消语义必须与原生一致：resolve(null)）", async () => {
    const win = await bootWithSessions();
    win.document.querySelector('#sessList [data-act="rename"]').click();
    await vi.waitFor(() => expect(isOpen(win)).toBe(true));
    win.document.getElementById(PMODAL).querySelector("#" + PMODAL + "No").click();
    await vi.waitFor(() => expect(isOpen(win)).toBe(false));
    const titles = [...win.document.querySelectorAll("#sessList .sess-item")]
      .map((el) => el.querySelector(".sess-title .tx").textContent);
    expect(titles, "取消后标题应原样").toContain("会话甲");
  });

  it("空标题不被接受：点确认只出内联提示，标题不变", async () => {
    const win = await bootWithSessions();
    win.document.querySelector('#sessList [data-act="rename"]').click();
    await vi.waitFor(() => expect(isOpen(win)).toBe(true));
    const modal = win.document.getElementById(PMODAL);
    modal.querySelector("#" + PMODAL + "Input").value = "   ";
    modal.querySelector("#" + PMODAL + "Yes").click();
    await new Promise((r) => setTimeout(r, 0));
    expect(isOpen(win), "空值不得关框").toBe(true);
    expect(modal.querySelector("#" + PMODAL + "Err"), "应有内联错误提示").toBeTruthy();
    modal.querySelector("#" + PMODAL + "No").click();
    await vi.waitFor(() => expect(isOpen(win)).toBe(false));
    const titles = [...win.document.querySelectorAll("#sessList .sess-item")]
      .map((el) => el.querySelector(".sess-title .tx").textContent);
    expect(titles, "空值被拒后标题应原样").toContain("会话甲");
  });
});

describe("分享链接回退（src/ui-global-events.js setupTaskShareDelegate）", () => {
  function seedTask() {
    return {
      wb_agent_tasks: JSON.stringify([{
        id: "task-share-1", sc: "office", title: "周报草稿", status: "todo",
        note: "", tags: [], createdAt: "2026-10-24T10:00:00.000Z", updatedAt: "2026-10-24T10:00:00.000Z",
      }]),
    };
  }

  /** 造一个 [data-share] 按钮挂进 #main —— 委托绑在 #main 静态容器上，这样才走真实链路 */
  function mountShareButton(win, id) {
    const btn = win.document.createElement("button");
    btn.setAttribute("data-share", id);
    win.document.getElementById("main").appendChild(btn);
    return btn;
  }

  it("没有 clipboard API 时（else 分支）→ 弹出填好链接的输入框，且内容已全选", async () => {
    const win = loadApp({ storage: seedTask() });
    windows.push(win);
    await vi.waitFor(() => expect(win.document.getElementById("chatPanel")._bound).toBe(true));
    /* jsdom 不实现 navigator.clipboard —— 正是这里要的 else 分支，不补 stub */
    expect(win.navigator.clipboard, "本用例依赖 jsdom 没有 clipboard（否则走到另一条分支）").toBeFalsy();

    mountShareButton(win, "task-share-1").click();
    await vi.waitFor(() => expect(isOpen(win)).toBe(true));
    const modal = win.document.getElementById(PMODAL);
    const input = modal.querySelector("#" + PMODAL + "Input");
    expect(input.value, "输入框应填好分享链接").toContain("#share=");
    expect(input.value, "链接应指向本页（原生 prompt 那一版也是当前页）").toContain(win.location.href.split("#")[0]);
    /* 打开即全选：这是"摆出来让他复制"的关键，Ctrl+C 一步到位 */
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(input.value.length);
    expect(modal.querySelector("#" + PMODAL + "Yes").textContent, "这一处不需要用户输入，确认键应叫「关闭」").toBe("关闭");
    /* required:false —— 用户不该被逼着"输入"什么 */
    modal.querySelector("#" + PMODAL + "Yes").click();
    await vi.waitFor(() => expect(isOpen(win)).toBe(false));
  });

  it("clipboard 写入失败时（.catch 分支）→ 同样回退到填好链接的输入框", async () => {
    const win = loadApp({ storage: seedTask() });
    windows.push(win);
    await vi.waitFor(() => expect(win.document.getElementById("chatPanel")._bound).toBe(true));
    /* 造一个"存在但一定失败"的 clipboard，逼进 .catch 分支 */
    win.navigator.clipboard = { writeText: () => Promise.reject(new Error("denied")) };

    mountShareButton(win, "task-share-1").click();
    await vi.waitFor(() => expect(isOpen(win)).toBe(true));
    const input = win.document.getElementById(PMODAL).querySelector("#" + PMODAL + "Input");
    expect(input.value, "回退框里应填好分享链接").toContain("#share=");
    win.document.getElementById(PMODAL).querySelector("#" + PMODAL + "No").click();
    await vi.waitFor(() => expect(isOpen(win)).toBe(false));
  });
});
