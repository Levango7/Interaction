/**
 * ui-mode.test.js —— 界面模式（工作台三态：工作/代码/设计）
 * ----------------------------------------------------------------------------
 * Work = 现有布局（不动）；Code = agent-first 三栏（左：机制导航+会话停靠 /
 * 中：工作视图 .main，聊天沿用 work 的贴底对话坞（2026-11-02 P1：原实现藏 .main 让聊天占中栏，
 * 主客颠倒，已改回）/ 右：todo 任务轨 + 能力停靠）。Design = 画布优先，会话/聊天隐藏。
 * 本文件守：
 *  ① 默认 Work；toggle → code（.body.code-mode + wb_agent_uimode 持久化）→ design → 回 work；
 *  ② Work 模式下两 dock 清空（不占 DOM）；
 *  ③ sessionDock 渲染会话列表，点击切换 = 恢复该会话到工作缓冲（switchSession 语义，
 *     见 data-links：场景对齐 → 激活 → 装回 chats[sc]，镜像幂等落盘）；
 *  ④ 新建会话 = 创建 + 激活 + 工作缓冲清空；
 *  ⑤ agentDock 四段渲染（进程/技能/MCP/工作流）+ 各段显隐持久化（wb_agent_agent_dock）；
 *  ⑥~⑪ P2-3/P2-8：setUIMode 显式三态 + 菜单三态项/当前勾选/窄屏（<1024）禁用「代码」；
 *  ⑫~⑬ P2-5：进 code 时右栏 Agent tab 让位 agentDock（正停在 agent 就切回今日）。
 * CSS 层的几何断言（.main 可见、聊天贴底、tab 藏掉）在 e2e，jsdom 不量布局。
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
  it("1: 默认 Work；toggle → code + 持久化；再 toggle → design（三态循环回 Work）", () => {
    const win = boot();
    win.applyUIMode();
    expect(bodyEl(win).classList.contains("code-mode")).toBe(false);
    expect(win.document.getElementById("uiModeLbl").textContent).toBe("工作");
    win.toggleUIMode();
    expect(bodyEl(win).classList.contains("code-mode")).toBe(true);
    expect(win.document.getElementById("uiModeLbl").textContent).toBe("代码");
    expect(JSON.parse(win.localStorage.getItem(PREFIX + "uimode"))).toBe("code");
    /* 画图能力 Phase B：三态循环 work → code → design → work */
    win.toggleUIMode();
    expect(bodyEl(win).classList.contains("design-mode")).toBe(true);
    expect(win.document.getElementById("uiModeLbl").textContent).toBe("设计");
    expect(JSON.parse(win.localStorage.getItem(PREFIX + "uimode"))).toBe("design");
    win.toggleUIMode();
    expect(bodyEl(win).classList.contains("code-mode")).toBe(false);
    expect(bodyEl(win).classList.contains("design-mode")).toBe(false);
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

/* ---------- 2026-11-02 P1/P2 批次守卫 ----------
 * P1：code 模式中栏回归 .main（工作面居中），聊天沿用 work 的贴底对话坞（CSS 层，几何断言在 e2e）。
 * P2-3：切换器从盲循环单按钮改成显式三态菜单；P2-8：窄屏（<1024）「代码」禁用；
 * P2-5：进 code 时右栏 Agent tab 让位 agentDock（藏 tab + 正停在 agent 就切回今日）。 */
describe("模式切换器：显式菜单与窄屏保护（P2-3/P2-8）", () => {
  it("6: setUIMode 显式三态；同模式调用幂等", () => {
    const win = boot();
    expect(win.setUIMode("design")).toBe(true);
    expect(bodyEl(win).classList.contains("design-mode")).toBe(true);
    expect(JSON.parse(win.localStorage.getItem(PREFIX + "uimode"))).toBe("design");
    expect(win.setUIMode("design")).toBe(true);            // 幂等：不报错不跳状态
    expect(win.setUIMode("work")).toBe(true);
    expect(bodyEl(win).classList.contains("code-mode")).toBe(false);
    expect(bodyEl(win).classList.contains("design-mode")).toBe(false);
  });

  it("7: 未知/空入参兜底为 work", () => {
    const win = boot();
    win.setUIMode("design");
    expect(win.setUIMode("nonsense")).toBe(true);
    expect(JSON.parse(win.localStorage.getItem(PREFIX + "uimode"))).toBe("work");
  });

  it("8: 菜单点开有三态项 + 当前态打勾 + 选中即切换并关菜单", () => {
    const win = boot();
    const btn = win.document.getElementById("btnUIMode");
    btn.click();
    const menu = win.document.getElementById("uiModeMenu");
    expect(menu.style.display).not.toBe("none");
    const items = [...menu.querySelectorAll(".ui-mode-item")];
    expect(items.length).toBe(3);
    const modes = items.map((el) => el.getAttribute("data-mode"));
    expect(modes).toEqual(["work", "code", "design"]);
    /* 默认 work → work 项 is-on */
    expect(items[0].classList.contains("is-on")).toBe(true);
    expect(items[0].getAttribute("aria-checked")).toBe("true");
    /* 点「设计」→ 切换 + 菜单关闭 + aria-expanded 复位 */
    items[2].click();
    expect(bodyEl(win).classList.contains("design-mode")).toBe(true);
    expect(menu.style.display).toBe("none");
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    /* 再点开：当前态勾在「设计」 */
    btn.click();
    const items2 = [...win.document.querySelectorAll("#uiModeMenu .ui-mode-item")];
    expect(items2[2].classList.contains("is-on")).toBe(true);
  });

  it("9: 窄屏（<1024）toggleUIMode 跳过 code：work → design → work", () => {
    const win = boot();
    win.innerWidth = 800;
    win.toggleUIMode();
    expect(bodyEl(win).classList.contains("code-mode")).toBe(false);
    expect(bodyEl(win).classList.contains("design-mode")).toBe(true);
    expect(JSON.parse(win.localStorage.getItem(PREFIX + "uimode"))).toBe("design");
    win.toggleUIMode();
    expect(bodyEl(win).classList.contains("code-mode")).toBe(false);
    expect(bodyEl(win).classList.contains("design-mode")).toBe(false);
  });

  it("10: 窄屏 setUIMode('code') 拒绝（返回 false、停在当前模式）；菜单里「代码」禁用", () => {
    const win = boot();
    win.innerWidth = 800;
    expect(win.setUIMode("code")).toBe(false);
    expect(bodyEl(win).classList.contains("code-mode")).toBe(false);
    expect(JSON.parse(win.localStorage.getItem(PREFIX + "uimode"))).not.toBe("code");
    /* 菜单项禁用（disabled 属性 + aria-disabled） */
    win.document.getElementById("btnUIMode").click();
    const codeItem = [...win.document.querySelectorAll("#uiModeMenu .ui-mode-item")]
      .find((el) => el.getAttribute("data-mode") === "code");
    expect(codeItem.disabled).toBe(true);
    expect(codeItem.getAttribute("aria-disabled")).toBe("true");
    /* 禁用项点了也不切（setUIMode 再挡一道） */
    expect(win.setUIMode("code")).toBe(false);
    expect(bodyEl(win).classList.contains("code-mode")).toBe(false);
  });

  it("11: 宽屏（>=1024）「代码」可正常选择", () => {
    const win = boot();
    win.innerWidth = 1440;
    expect(win.setUIMode("code")).toBe(true);
    expect(bodyEl(win).classList.contains("code-mode")).toBe(true);
  });
});

describe("Code 模式：右栏 Agent tab 让位 agentDock（P2-5）", () => {
  it("12: 停在 agent tab 时进 code → 自动切回「今日」", () => {
    /* load() 走 JSON.parse，存储值必须是 JSON 串（见 loadApp 约定） */
    const win = boot({ [PREFIX + "rail_tab"]: JSON.stringify("agent") });
    expect(win._railTabGet()).toBe("agent");
    win.toggleUIMode();
    expect(bodyEl(win).classList.contains("code-mode")).toBe(true);
    expect(win._railTabGet()).toBe("today");
    /* 回 work 后 agent tab 仍可选（tab 按钮恢复由 CSS 控制，这里只验状态栈） */
    win.setUIMode("work");
    expect(win._railTabGet()).toBe("today");
    win._railTabSet("agent");
    expect(win._railTabGet()).toBe("agent");
  });

  it("13: 停在今日/文件 tab 时进 code 不改 tab", () => {
    const win = boot({ [PREFIX + "rail_tab"]: JSON.stringify("files") });
    win.toggleUIMode();
    expect(win._railTabGet()).toBe("files");
  });
});
