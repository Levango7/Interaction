/**
 * ui-mode.test.js —— Code 模式（双模式工作台，2026-10-26 用户点单）
 * ----------------------------------------------------------------------------
 * Work = 现有布局（不动）；Code = agent-first 三栏（左：机制导航+会话停靠 /
 * 中：chatPanel 全高，DOM 零移动 / 右：todo 任务轨 + 能力停靠）。
 * 本文件守四件事：
 *  ① 默认 Work；toggle → code（.body.code-mode + wb_agent_uimode 持久化）→ 再 toggle 回；
 *  ② Work 模式下两 dock 清空（不占 DOM）；
 *  ③ sessionDock 渲染会话列表，点击切换 = 恢复该会话到工作缓冲（switchSession 语义，
 *     见 data-links：场景对齐 → 激活 → 装回 chats[sc]，镜像幂等落盘）；
 *  ④ 新建会话 = 创建 + 激活 + 工作缓冲清空；
 *  ⑤ agentDock 四段渲染（进程/技能/MCP/工作流）+ 各段显隐持久化（wb_agent_agent_dock）。
 * 运行：npm test -- ui-mode
 */
import { describe, it, expect } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

const PREFIX = "wb_agent_";

function boot(extra) {
  return loadApp({ storage: Object.assign({ [PREFIX + "onboarded"]: "true" }, extra || {}) });
}
const bodyEl = (win) => win.document.querySelector(".body");

describe("Code 模式：切换与持久化", () => {
  it("1: 默认 Work；toggle → code + 持久化；再 toggle 回 Work", () => {
    const win = boot();
    win.applyUIMode();
    expect(bodyEl(win).classList.contains("code-mode")).toBe(false);
    expect(win.document.getElementById("uiModeLbl").textContent).toBe("工作");
    win.toggleUIMode();
    expect(bodyEl(win).classList.contains("code-mode")).toBe(true);
    expect(win.document.getElementById("uiModeLbl").textContent).toBe("代码");
    expect(JSON.parse(win.localStorage.getItem(PREFIX + "uimode"))).toBe("code");
    win.toggleUIMode();
    expect(bodyEl(win).classList.contains("code-mode")).toBe(false);
    expect(win.document.getElementById("uiModeLbl").textContent).toBe("工作");
  });

  it("2: Work 模式下两 dock 清空（不占 DOM）", () => {
    const win = boot();
    win.toggleUIMode();          // 先进 code（让 dock 渲染过一次）
    win.toggleUIMode();          // 回 work
    expect(win.document.getElementById("sessionDock").innerHTML).toBe("");
    expect(win.document.getElementById("agentDock").innerHTML).toBe("");
  });
});

describe("Code 模式：会话停靠栏", () => {
  it("3: code 下渲染会话列表；点击切换 = 恢复该会话到工作缓冲", () => {
    const win = boot({
      [PREFIX + "chat_office"]: JSON.stringify([{ role: "user", content: "工作缓冲里的消息", createdAt: "2026-10-26T10:00:00.000Z" }]),
    });
    const s1 = win.createSession("office", "会话一");
    win.appendSessionMsg(s1.id, { role: "user", content: "会话一的消息" });
    win.createSession("office", "会话二");
    win.toggleUIMode();
    const dock = win.document.getElementById("sessionDock");
    expect(dock.textContent).toContain("会话一");
    expect(dock.textContent).toContain("会话二");
    expect(dock.querySelector(".sdock-item.active")).toBeTruthy();
    /* 点击「会话一」→ 激活切换 + 工作缓冲装回该会话内容 */
    const item = [...dock.querySelectorAll(".sdock-item")].find((el) => el.textContent.includes("会话一"));
    item.click();
    expect(win.getActiveSession()).toBe(s1.id);
    const buf = JSON.parse(win.localStorage.getItem(PREFIX + "chat_office"));
    expect(buf.some((m) => String(m.content || "").includes("会话一的消息"))).toBe(true);
  });

  it("4: 新建会话 = 创建 + 激活 + 工作缓冲清空", () => {
    const win = boot({ [PREFIX + "chat_office"]: JSON.stringify([{ role: "user", content: "旧消息", createdAt: "2026-10-26T10:00:00.000Z" }]) });
    win.toggleUIMode();
    win.document.getElementById("sdockNew").click();
    const sess = win.getActiveSessionObj();
    expect(sess.title).toBe("新会话");
    const buf = JSON.parse(win.localStorage.getItem(PREFIX + "chat_office"));
    expect(buf.length).toBe(0);
  });
});

describe("Code 模式：能力停靠栏", () => {
  it("5: 四段渲染（进程/技能/MCP/工作流）+ 各段显隐持久化", () => {
    const win = boot();
    win.toggleUIMode();
    const dock = win.document.getElementById("agentDock");
    for (const t of ["进程", "技能", "MCP", "工作流"]) expect(dock.textContent).toContain(t);
    expect(dock.textContent).toContain("空闲");                     // 无 agent_run
    expect(dock.textContent).toContain("未配置 MCP 服务器");        // 无 mcp 配置
    /* 折叠「技能」段 → 持久化 + 段体消失 */
    const head = (d) => [...d.querySelectorAll("[data-toggle]")].find((b) => b.textContent.includes("技能"));
    head(dock).click();
    expect(JSON.parse(win.localStorage.getItem(PREFIX + "agent_dock")).skills).toBe(false);
    expect(dock.querySelector('[data-sec="skills"] .adock-body')).toBeNull();
    /* 再点恢复 */
    head(dock).click();
    expect(JSON.parse(win.localStorage.getItem(PREFIX + "agent_dock")).skills).toBe(true);
    expect(dock.querySelector('[data-sec="skills"] .adock-body')).toBeTruthy();
  });
});
