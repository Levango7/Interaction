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
 *  ⑭~⑮ 三模式契约 S5（three-mode-spec.md §7 / 台账 DL-O17）：离开 code 必清能力轮询
 *      定时器（含「切走再切回必须新起、不叠加」＝ _agentDockTimer 置空的可观测反证）。
 *  ⑯~⑰ 三模式契约 S6：切换模式零业务数据写入，localStorage 差集恰好 = {wb_agent_uimode}。
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

/* ---------- 三模式行为契约 S5/S6（three-mode-spec.md §7 验收清单缺口，DL-O17）
 * S5：离开 code 必须 clearInterval 并把 _agentDockTimer / _agentDockSig 置空；
 *     判据取**可观测面**——render-widgets.js 的 setInterval/clearInterval 走 jsdom 全局，
 *     包一层记账即可数「能力轮询定时器的生灭」；_agentDockSig 是模块内缓存，
 *     不暴露到 window —— 但「离开后置空」可由「再进 code 必须新起一个定时器」
 *     反证：若 _agentDockTimer 没置空，`if(!_agentDockTimer)` 守卫会吞掉新定时器，
 *     定时器计数不增长 ⇒ 断言红（这正是该守卫被设计成的形状，见 :3923）。
 * S6：切换模式零业务数据写入——契约 §6「切换模式只允许写 wb_agent_uimode 一个键」。
 * 三模式各切一轮，比对 localStorage 键值快照：中段差集必须恰好 = {uimode}，
 * 全循环回到原模式后快照必须完全复原（含 uimode 自己）。 */
describe("三模式契约 S5：离开 code 必清能力轮询定时器", () => {
  /* 装一个记账器：模式切换发生在 boot 之后、我们的调用之前，
     故包 win.setInterval 只会看到 applyUIMode 路径上新起的定时器。 */
  function spyTimers(win) {
    const live = new Set();
    const log = [];
    const origSI = win.setInterval.bind(win);
    const origCI = win.clearInterval.bind(win);
    win.setInterval = function (fn, ms) { const id = origSI(fn, ms); live.add(id); log.push({ id, ms, t: "set" }); return id; };
    win.clearInterval = function (id) { live.delete(id); log.push({ id, t: "clear" }); return origCI(id); };
    return {
      liveCount: () => live.size,
      pollCreated: () => log.filter((e) => e.t === "set" && e.ms === 2500).length,
      pollLive: () => log.filter((e) => e.t === "set" && e.ms === 2500).map((e) => e.id).filter((id) => live.has(id)).length,
    };
  }

  it("14: work→code 起一个 2500ms 轮询；→design 清掉；零泄漏", () => {
    const win = boot();
    const sp = spyTimers(win);
    expect(win.setUIMode("code")).toBe(true);
    expect(sp.pollCreated()).toBe(1);
    expect(sp.pollLive()).toBe(1);
    win.setUIMode("design");
    expect(sp.pollLive()).toBe(0);
    expect(sp.liveCount()).toBe(0);
    win.setUIMode("work");
    expect(sp.pollLive()).toBe(0);
  });

  it("15: 切走再切回 code 必须新起定时器（_agentDockTimer 置空的反证），且不叠加", () => {
    const win = boot();
    const sp = spyTimers(win);
    win.setUIMode("code");
    expect(sp.pollCreated()).toBe(1);
    win.setUIMode("design");
    expect(sp.pollLive()).toBe(0);
    /* 再进 code：若离开时 _agentDockTimer 没置空，`if(!_agentDockTimer)` 不会新起
       定时器 ⇒ pollCreated 停在 1 ⇒ 断言红（能力停靠将永远不刷新 = 真缺陷） */
    win.setUIMode("code");
    expect(sp.pollCreated()).toBe(2);
    expect(sp.pollLive()).toBe(1);
    /* 第三次进出仍只一个活的（不叠加） */
    win.setUIMode("work");
    win.setUIMode("code");
    expect(sp.pollCreated()).toBe(3);
    expect(sp.pollLive()).toBe(1);
    win.setUIMode("work");
    expect(sp.pollLive()).toBe(0);
  });
});

describe("三模式契约 S6：切换模式零业务数据写入（仅 uimode）", () => {
  it("16: 三模式各切一轮，localStorage 键值差集 = {wb_agent_uimode}；全循环完全复原", () => {
    /* 预置业务键（任务/笔记/聊天/会话/子代理/图/配置），覆盖契约 §6 的键空间清单；
       rail_tab 预置 today，避免「进 code 时 agent tab 让位」这条视图态写入混入差集。
       ⚠️ ai_sessions / ai_active_session 必须预置：getSessions() 是**懒加载 + 首启迁移**
       （无键时从旧 chats[sc] 迁出默认会话并落盘，`src/data-links.js:545-562`）——
       那是**首次渲染时的一次性业务初始化**，不是「切换模式」产生的写入；
       断言的是「稳态下切模式零写入」这一契约，故先把会话仓预热到稳态。 */
    const seed = {
      /* uimode 预置：默认值 "work" 是惰性读取、未落盘；不预置的话切一个来回
         会把 uimode 首次持久化，那就是契约允许的唯一写入而非违约。预置后基线才真稳态。 */
      [PREFIX + "uimode"]: JSON.stringify("work"),
      [PREFIX + "rail_tab"]: JSON.stringify("today"),
      [PREFIX + "tasks"]: JSON.stringify([{ id: "t1", title: "任务一", done: false }]),
      [PREFIX + "notes"]: JSON.stringify([{ id: "n1", text: "笔记一" }]),
      [PREFIX + "chat_office"]: JSON.stringify([{ role: "user", content: "工作缓冲", createdAt: "2026-10-26T10:00:00.000Z" }]),
      [PREFIX + "ai_sessions"]: JSON.stringify([{ id: "s_pre", sc: "office", title: "预热会话", createdAt: "2026-10-26T09:00:00.000Z", updatedAt: "2026-10-26T09:00:00.000Z", msgs: [] }]),
      [PREFIX + "ai_active_session"]: JSON.stringify("s_pre"),
      [PREFIX + "subagents"]: JSON.stringify([{ id: "a1", status: "idle", steps: [] }]),
      /* diagrams 同理：design 首进时 renderDrawWorkspace() 的 `if (!dcActive()) dcCreate()`
         会在**无活动图**时建一张「未命名图」落盘（`src/draw-canvas.js:828`）——首启初始化，
         不是切换写入。预置活动图即进入稳态。 */
      [PREFIX + "diagrams"]: JSON.stringify([{ id: "d1", title: "图一", updatedAt: 1730000000000, nodes: [], edges: [] }]),
      [PREFIX + "diagram_active"]: JSON.stringify("d1"),
      [PREFIX + "cfg"]: JSON.stringify({ theme: "light" }),
    };
    const win = boot(seed);
    const snap = () =>
      Object.fromEntries(Object.keys(win.localStorage).map((k) => [k, win.localStorage.getItem(k)]));
    /* 稳态确认：提前触发一次 getSessions 的懒加载（渲染路径会触发，
       这里显式调一次把「迁移落盘」挡在时间轴之外） */
    win.getSessions();
    const steady = snap();
    /* 中段：切到 code 时，允许且仅允许 uimode 变化 */
    expect(win.setUIMode("code")).toBe(true);
    const mid = snap();
    const changedMid = Object.keys(mid).filter((k) => mid[k] !== steady[k]);
    expect(changedMid).toEqual([PREFIX + "uimode"]);
    /* 切到 design：仍只有 uimode（相对稳态也只有 uimode 变回） */
    expect(win.setUIMode("design")).toBe(true);
    const mid2 = snap();
    const changedMid2 = Object.keys(mid2).filter((k) => mid2[k] !== steady[k]);
    expect(changedMid2).toEqual([PREFIX + "uimode"]);
    /* 全循环回 work：快照完全复原（含 uimode 自己——写了一个来回） */
    expect(win.setUIMode("work")).toBe(true);
    const final = snap();
    expect(final).toEqual(steady);
    /* 弱化断言（差集为空）不够：还应证明 uimode 确实被写过（否则「啥都没写」也过） */
    expect(mid[PREFIX + "uimode"]).toBe(JSON.stringify("code"));
  });

  it("17: 设计模式出入同样零业务写入（design-only 往返）", () => {
    /* 与 16 同款预热：ai_sessions 与 diagram_active 各挡掉一条首启初始化写入 */
    const seed = {
      [PREFIX + "uimode"]: JSON.stringify("work"),
      [PREFIX + "ai_sessions"]: JSON.stringify([{ id: "s_pre", sc: "office", title: "预热会话", createdAt: "2026-10-26T09:00:00.000Z", updatedAt: "2026-10-26T09:00:00.000Z", msgs: [] }]),
      [PREFIX + "ai_active_session"]: JSON.stringify("s_pre"),
      [PREFIX + "diagrams"]: JSON.stringify([{ id: "d1", title: "图一", updatedAt: 1730000000000, nodes: [], edges: [] }]),
      [PREFIX + "diagram_active"]: JSON.stringify("d1"),
    };
    const win = boot(seed);
    win.getSessions();
    const before = Object.fromEntries(Object.keys(win.localStorage).map((k) => [k, win.localStorage.getItem(k)]));
    expect(win.setUIMode("design")).toBe(true);
    expect(win.setUIMode("work")).toBe(true);
    const after = Object.fromEntries(Object.keys(win.localStorage).map((k) => [k, win.localStorage.getItem(k)]));
    expect(after).toEqual(before);
    /* 图数据未被画布渲染路径改写（只读渲染） */
    expect(after[PREFIX + "diagrams"]).toBe(JSON.stringify([{ id: "d1", title: "图一", updatedAt: 1730000000000, nodes: [], edges: [] }]));
  });
});

