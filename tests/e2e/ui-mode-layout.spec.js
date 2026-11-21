/**
 * ui-mode-layout.spec.js —— 界面模式切换的**几何/呈现层**守护（真实浏览器）
 * ----------------------------------------------------------------------------
 * 与 tests/ui-mode.test.js（vitest/jsdom，13 条）的分工：
 *   · jsdom 侧证的是**契约**：模式状态机、存储读写、rail tab 让位、窄屏拒绝。
 *     但 jsdom 没有排版引擎——display:none 生不生效、sticky 贴不贴底、z-index 分不分层，
 *     它一概看不见（getBoundingClientRect 恒 0）。
 *   · 本 spec 证的是**呈现**：P1 修完后 code 模式真的是「工作面居中 + 聊天贴底坞」，
 *     而不是旧实现那种「聊天占满中栏、.main 被藏掉」（用户点单的「主客颠倒」）。
 *     CSS 层的断言只能放这里——写进 jsdom 会全绿但什么都没守住。
 *
 * 覆盖（P1-1/2、P2-3/5/7/8 的呈现侧）：
 *   ① 宽屏 1440：code 模式 #main 可见且居中、chat 是 sticky 底坞（非全高）、
 *      sessionDock/agentDock 在位、右栏 Agent tab 消失而「今日」仍在（P2-5）
 *   ② 宽屏：胶囊真实点击路径（三段齐 → 当前段高亮 → 点 code 生效 → 高亮跟随）
 *   ③ 窄屏 390：胶囊「代码」段禁用、setUIMode("code") 返回 false、
 *      toggleUIMode 循环跳过 code（work → design → work）（P2-8）
 *   ④ 窄屏：taskRail 在抽屉层（z=--z-drawer=60，不再是 popover 70），
 *      右缘双抽屉互斥（开聊天关 rail、开 rail 关聊天）（P2-7）
 *
 * 守护策略同其它 e2e：默认跳过，E2E=1 才跑。
 */
const { test, expect } = require("./_fixture");
const { waitMainRendered } = require("./helpers/wait-settled.cjs");

const APP_URL = "./agent-workbench.html";

/** 宽屏 code 模式几何探针：一次取全，避免多次 evaluate 之间布局变动 */
const probeCodeMode = () => {
  const q = (sel) => document.querySelector(sel);
  const box = (el) => {
    const b = el.getBoundingClientRect();
    return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) };
  };
  const main = q("#main"), wrap = q(".main-wrap"), chat = q("#chatPanel");
  const msgs = q("#chat"), collapseBtn = q("#chatPanelCollapse");
  const inputArea = q("#chatPanel .chat-input-area");
  const dock = q("#agentDock"), sd = q("#sessionDock");
  const agentSec = q('#taskRail [data-rr-sec="agent"]');
  const todaySec = q('#taskRail [data-rr-sec="today"]');
  return {
    bodyClass: q(".body").className,
    mainDisplay: main ? getComputedStyle(main).display : null,
    main: main ? box(main) : null,
    wrap: wrap ? box(wrap) : null,
    chatPos: chat ? getComputedStyle(chat).position : null,
    chat: chat ? box(chat) : null,
    /* 2026-11-16 中栏分屏：消息区几何 + 运行态控件落位（刀1/刀2 判据） */
    msgs: msgs ? box(msgs) : null,
    msgsDisplay: msgs ? getComputedStyle(msgs).display : null,
    collapseDisplay: collapseBtn ? getComputedStyle(collapseBtn).display : null,
    inputDisplay: inputArea ? getComputedStyle(inputArea).display : null,
    input: inputArea ? box(inputArea) : null,
    sessionBtnInMenubar: !!q(".menubar #chatSessionBtn"),
    chipInStatusbar: !!q(".statusbar #ctxBudgetChip"),
    /* 2026-11-17 批八：tabbar 整条退役，中栏常驻纯聊天 */
    tabbarExists: !!q(".tabbar"),
    formATabsExists: !!q("#formATabs"),
    chatTabExists: !!q("#tabChat"),
    pillInSide: !!q("#side #uiModePill"),
    footInSide: !!q("#side .side-foot"),
    dockDisplay: dock ? getComputedStyle(dock).display : null,
    dock: dock ? box(dock) : null,
    sdDisplay: sd ? getComputedStyle(sd).display : null,
    agentSecDisplay: agentSec ? getComputedStyle(agentSec).display : null,
    todaySecDisplay: todaySec ? getComputedStyle(todaySec).display : null,
    vw: window.innerWidth, vh: window.innerHeight,
  };
};

test.describe("宽屏 1440×900 · code 模式几何（P1-1/2、P2-5）", () => {
  test.beforeAll(() => {
    test.skip(!process.env.E2E, "set E2E=1 to run");
  });
  test.use({ viewport: { width: 1440, height: 900 } });

  /* 2026-11-17 批八判据随用户新裁定再次**反转**（「取消 tabbar 那一栏 / 不需要工作区入口，
     直接常驻聊天」明确覆盖 11-02「主客颠倒」、11-16「分屏」与批六「顶部标签页往返」）。
     新判据钉死：chat 占满中栏主体、#main 无入口可达、tabbar/tab 节点彻底不存在。
     产品裁决反转而非放宽——旧判据里的往返路径本身被用户删除，不能留作「功能没删」的挡箭牌。 */
  test("批十：无 active 偏好时默认落聊天首页，点页面/对话可往返", async ({ page }) => {
    /* 这是产品默认形态的唯一守护：公共 fixture 会注入 office（场景前提），
       这里显式删掉，模拟真实新用户打开。 */
    await page.addInitScript(() => {
      try {
        localStorage.removeItem("wb_agent_active");
        /* 本例守的是产品默认聊天首页：公共夹具的「页面视图前提」必须显式让开，
           否则刚打开就被 setActive 翻回页面视图，默认形态守护会假红。 */
        localStorage.setItem("wb_agent_e2e_keep_chat_home", "1");
      } catch (e) { /* ignore */ }
    });
    await page.goto(APP_URL);
    await page.waitForFunction(() => document.querySelector(".body").classList.contains("chat-home"), null, { timeout: 15_000 });
    const home = await page.evaluate(() => ({
      main: getComputedStyle(document.getElementById("main")).display,
      chatH: Math.round(document.getElementById("chat").getBoundingClientRect().height),
      form: getComputedStyle(document.getElementById("chatForm")).display,
    }));
    expect(home.main, "默认聊天首页 #main 应让位").toBe("none");
    expect(home.chatH, "聊天气泡区应占中栏").toBeGreaterThan(300);
    expect(home.form, "输入行应可见").not.toBe("none");

    await page.click('#side .nav-item[data-sc="tasks"]');
    await page.waitForFunction(() => !document.querySelector(".body").classList.contains("chat-home"));
    expect(await page.evaluate(() => getComputedStyle(document.getElementById("main")).display), "点任务应回页面视图").not.toBe("none");

    await page.click('#side .nav-item[data-chat="1"]');
    await page.waitForFunction(() => document.querySelector(".body").classList.contains("chat-home"));
    expect(await page.evaluate(() => getComputedStyle(document.getElementById("main")).display), "点对话应回聊天首页").toBe("none");
  });

  test("常驻纯聊天：chat 占满中栏、tabbar 与工作区入口整条退役（产品裁决反转）", async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForSelector("#main", { timeout: 15_000 });
    await waitMainRendered(page);

    const ok = await page.evaluate(() => window.setUIMode("code"));
    expect(ok, "1440 宽屏 setUIMode('code') 应被接受").toBe(true);
    await waitMainRendered(page);
    const g = await page.evaluate(probeCodeMode);

    /* ---- 常驻纯聊天：body 带 code-mode，#main 永久让位（无工作区入口） ---- */
    expect(g.bodyClass, "body 应带 code-mode").toContain("code-mode");
    expect(g.mainDisplay, `常驻聊天时 #main 应 display:none（实测 ${g.mainDisplay}）`).toBe("none");

    /* ---- 三栏位：中栏在 240 左栏与 300 右栏之间（不变） ---- */
    expect(g.wrap.x, `中栏左缘 ${g.wrap.x}，应在 240px 左栏之后`).toBeGreaterThanOrEqual(238);
    expect(g.wrap.x + g.wrap.w, `中栏右缘 ${g.wrap.x + g.wrap.w}，应在 300px 右栏之前`).toBeLessThanOrEqual(g.vw - 298);

    /* ---- chat 占满中栏主体（非贴底坞、非半屏）：static + 高度≈中栏全高 ---- */
    expect(g.chatPos, `聊天面板 position=${g.chatPos}，主形态应为 static`).toBe("static");
    expect(g.chat.h, `对话区高 ${g.chat.h}px，应≈中栏全高（${Math.round(g.wrap.h)}px）`).toBeGreaterThan(g.wrap.h * 0.85);
    expect(g.chat.y, "对话区顶缘应落在中栏顶部附近").toBeLessThanOrEqual(g.wrap.y + 4);
    expect(g.chat.y + g.chat.h, "对话区底缘不得超出中栏").toBeLessThanOrEqual(g.wrap.y + g.wrap.h + 1);
    expect(g.chat.x, "对话区应在中栏内（左缘）").toBeGreaterThanOrEqual(g.wrap.x - 1);
    expect(g.chat.x + g.chat.w, "对话区应在中栏内（右缘）").toBeLessThanOrEqual(g.wrap.x + g.wrap.w + 1);

    /* ---- 气泡常驻：#chat display:flex 且有实质高度 ---- */
    expect(g.msgsDisplay, `#chat display=${g.msgsDisplay}，应常驻 flex`).toBe("flex");
    expect(g.msgs.h, `#chat 高 ${g.msgs.h}px，应有实质高度承载气泡`).toBeGreaterThan(80);
    expect(g.msgs.y, "消息区应落在对话区内").toBeGreaterThanOrEqual(g.chat.y - 1);

    /* ---- 批八骨架：tabbar / 标签 / 工作区入口零残留；模式胶囊与用户设置在左栏 ---- */
    expect(g.tabbarExists, "整条 tabbar 应删除").toBe(false);
    expect(g.formATabsExists, "#formATabs 应删除").toBe(false);
    expect(g.chatTabExists, "#tabChat 应删除").toBe(false);
    expect(g.pillInSide, "模式胶囊应迁入左侧栏").toBe(true);
    expect(g.footInSide, "用户/设置应固定在左栏最下方").toBe(true);
    expect(g.collapseDisplay, "主形态无折叠概念，#chatPanelCollapse 应隐藏").toBe("none");
    /* 2026-11-22 批十回归：折叠规则不得误伤 code 主形态——collapse 控件隐藏时，
       输入区必须仍可见，否则用户在默认 code 聊天页没有任何可达输入/展开路径。 */
    expect(g.inputDisplay, "code 主形态输入区必须可达，collapsed 类也不得隐藏").not.toBe("none");
    expect(g.input.h, `输入区高 ${g.input.h}px，应可实际输入`).toBeGreaterThan(80);
    expect(g.sessionBtnInMenubar, "会话管理按钮应留在顶栏 menubar").toBe(true);
    expect(g.chipInStatusbar, "上下文预算芯片应迁至状态栏").toBe(true);

    /* ---- P2-5：右栏 Agent 节让位 agentDock（B4 起按节藏，不再按 tab） ---- */
    expect(g.agentSecDisplay, "code 模式右栏 Agent 节应隐藏").toBe("none");
    expect(g.todaySecDisplay, "「今日」节不应被误伤").not.toBe("none");

    /* ---- 批八：左下会话 dock 删除（会话只在右栏），右下能力 dock 保留 ---- */
    expect(g.sdDisplay, "code 模式左栏会话 dock 应隐藏").toBe("none");
    expect(g.dockDisplay, "agentDock 应显示").not.toBe("none");
    expect(g.dock.x, `agentDock 左缘 ${g.dock.x}，应在 300px 右栏内`).toBeGreaterThanOrEqual(g.vw - 302);
    expect(g.dock.y + g.dock.h, "agentDock 不得溢出视口底").toBeLessThanOrEqual(g.vh);
  });

  /* 批八（2026-11-17，用户二次标注图 + 三问裁定）：顶栏 Session 名 / 左栏快捷格 / 左栏会话列表
     全部删除；模式胶囊迁移左栏顶部；用户+设置固定左栏底部；右栏五区保持。
     真浏览器几何守候——不靠 jsdom 推演（历史上有过推演错落点、main 连红 5 笔）。 */
  test("批八新结构：无 Session 名/快捷格 + 模式胶囊在左栏顶 + 用户设置居底 + 右栏五区 + 零溢出", async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForSelector("#main", { timeout: 15_000 });
    await waitMainRendered(page);
    await page.evaluate(() => window.setUIMode("code"));
    await waitMainRendered(page);

    const g = await page.evaluate(() => {
      const q = (s) => document.querySelector(s);
      const rect = (s) => { const e = q(s); if (!e) return null; const r = e.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height, display: getComputedStyle(e).display }; };
      const side = q("#side");
      return {
        sessionExists: !!q("#mbSessionName"),
        quickCount: document.querySelectorAll(".side-quick-item").length,
        navCount: document.querySelectorAll("#side .nav-item").length,
        sessGroups: Array.from(document.querySelectorAll("#side .side-sess-group"))
          .map((e) => e.getAttribute("data-sess-group")),
        sessItems: document.querySelectorAll("#side .side-sess-item").length,
        pill: rect("#uiModePill"),
        side: side ? rect("#side") : null,
        nav: rect("#side .side-nav"),
        foot: rect("#side .side-foot"),
        footLabels: Array.from(document.querySelectorAll("#side .side-foot-lbl")).map((e) => e.textContent.trim()),
        railSecs: Array.from(document.querySelectorAll("#taskRail .rr-sec"))
          .map((s) => s.getAttribute("data-rr-sec")),
        usagePane: !!q("#railUsagePane"),
        scrollW: document.documentElement.scrollWidth,
        vw: window.innerWidth,
        vh: window.innerHeight,
      };
    });

    expect(g.sessionExists, "顶栏中部 Session 名应彻底删除").toBe(false);
    expect(g.quickCount, "左栏快捷格应彻底删除").toBe(0);
    expect(g.navCount, "桌面导航应收敛为 5 项").toBe(5);
    expect(g.sessGroups, "sessions 区应按工作区 / 无工作区分两组").toEqual(["workspace", "free"]);
    expect(g.sessItems, "默认工作区会话应至少 1 条").toBeGreaterThanOrEqual(1);
    expect(g.pill && g.pill.display, "模式胶囊应显示").not.toBe("none");
    expect(g.pill.x, "胶囊应落在左栏内").toBeGreaterThanOrEqual(g.side.x - 1);
    expect(g.pill.x + g.pill.w, "胶囊右缘不得越出左栏").toBeLessThanOrEqual(g.side.x + g.side.w + 1);
    expect(g.pill.y + g.pill.h, "胶囊应在导航区之上").toBeLessThanOrEqual(g.nav.y + 1);
    expect(g.foot && g.foot.display, "用户/设置行应显示").not.toBe("none");
    expect(g.foot.y, "用户/设置应在导航区下方（左栏最底部）").toBeGreaterThanOrEqual(g.nav.y);
    expect(g.side.y + g.side.h - (g.foot.y + g.foot.h), "用户/设置应贴左栏底缘（留白 ≤20px）").toBeLessThanOrEqual(20);
    expect(g.foot.y + g.foot.h, "用户/设置不得溢出视口底").toBeLessThanOrEqual(g.vh + 1);
    expect(g.footLabels, "同一行应为用户 + 帮助 + 设置（批十帮助从顶栏移入）").toEqual(["登录", "帮助", "设置"]);
    expect(g.railSecs, "右栏五区顺序＝todo/文件/会话/大模型用量/运行与能力")
      .toEqual(["today", "files", "sessions", "usage", "agent"]);
    expect(g.usagePane, "大模型用量 pane 应在位").toBe(true);
    expect(g.scrollW, `1440 宽屏零横向溢出（实测 ${g.scrollW}）`).toBeLessThanOrEqual(g.vw);
  });

  test("批九/批十：code 模式点页面入口先回 work，点「对话」回聊天首页", async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForSelector("#side .nav-item", { timeout: 15_000 });
    await waitMainRendered(page);
    await page.evaluate(() => window.setUIMode("code"));
    await waitMainRendered(page);

    /* 场景入口走 data-sc；AI 是固定页 data-aipage。两条过去只修了一条，都会因 #main 隐藏而"点了没反应"。 */
    await page.click('#side [data-sc="store"]');
    await waitMainRendered(page);
    const afterStore = await page.evaluate(() => ({
      code: document.querySelector(".body").classList.contains("code-mode"),
      mainDisplay: getComputedStyle(document.getElementById("main")).display,
      store: !!document.querySelector("#main [data-store-view]")
    }));
    expect(afterStore.code, "点商店后应已回 work 模式").toBe(false);
    expect(afterStore.mainDisplay).not.toBe("none");
    expect(afterStore.store, "商店页应真渲染出来").toBe(true);

    await page.evaluate(() => window.setUIMode("code"));
    await waitMainRendered(page);
    await page.click('#side [data-chat="1"]');
    await page.waitForFunction(() => document.querySelector(".body").classList.contains("chat-home"));
    const afterChat = await page.evaluate(() => {
      const main = document.getElementById("main");
      const chat = document.getElementById("chat");
      return {
        code: document.querySelector(".body").classList.contains("code-mode"),
        chatHome: document.querySelector(".body").classList.contains("chat-home"),
        mainDisplay: getComputedStyle(main).display,
        chatDisplay: getComputedStyle(chat).display,
        chatH: Math.round(chat.getBoundingClientRect().height),
        formDisplay: getComputedStyle(document.getElementById("chatForm")).display
      };
    });
    expect(afterChat.code, "点「对话」后应回 work 形态").toBe(false);
    expect(afterChat.chatHome, "应进入聊天首页").toBe(true);
    expect(afterChat.mainDisplay, "聊天首页 #main 应让位").toBe("none");
    expect(afterChat.chatDisplay, "聊天气泡区应常驻").toBe("flex");
    expect(afterChat.chatH, "聊天气泡区应有实质高度").toBeGreaterThan(200);
    expect(afterChat.formDisplay, "输入行应可见").not.toBe("none");
  });

  test("批九：左右栏折叠是真收起（含 agent-dock 残留回归），把手能再展开", async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForSelector("#side .nav-item", { timeout: 15_000 });
    await waitMainRendered(page);
    await page.evaluate(() => window.setUIMode("code"));
    await waitMainRendered(page);

    const measure = () => page.evaluate(() => {
      const q = (s) => document.querySelector(s);
      const info = (s) => { const e = q(s); if (!e) return null; const r = e.getBoundingClientRect();
        return { display: getComputedStyle(e).display, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
      return {
        collapsed: document.querySelector(".body").classList.contains("rail-collapsed"),
        rail: info("#taskRail"), dock: info("#agentDock"),
        handle: info(".task-rail-toggle"), side: info("#side"),
        scrollW: document.documentElement.scrollWidth, vw: innerWidth,
      };
    });

    const open = await measure();
    expect(open.rail.display, "展开时右栏应显示").not.toBe("none");
    expect(open.dock.display, "展开时 agent-dock 应显示").not.toBe("none");

    await page.evaluate(() => document.querySelector("#taskRailCollapse").click());
    const railed = await measure();
    expect(railed.collapsed, "点收起后 body 应带 rail-collapsed").toBe(true);
    expect(railed.rail.display, "右栏整栏应隐藏").toBe("none");
    /* 回归：code 模式后面那条 `.body.code-mode .agent-dock{display:flex}` 同特异度覆盖隐藏，
       实测折叠后仍有 216px 面板赖在右下角；这里必须钉 display:none，不是只看 class。 */
    expect(railed.dock.display, "折叠后 agent-dock 不得残留（真机 216px 回归）").toBe("none");
    expect(railed.handle.display, "右缘应出现常驻展开把手").not.toBe("none");
    expect(railed.handle.x + railed.handle.w, "把手应贴视口右缘").toBeLessThanOrEqual(railed.vw + 1);

    await page.evaluate(() => document.querySelector(".task-rail-toggle").click());
    const reOpened = await measure();
    expect(reOpened.collapsed, "点把手应恢复展开").toBe(false);
    expect(reOpened.rail.display, "恢复后右栏应重新显示").not.toBe("none");
    expect(reOpened.dock.display, "恢复后 agent-dock 应重新显示").not.toBe("none");

    await page.evaluate(() => document.querySelector("#sideToggle").click());
    const sided = await measure();
    expect(sided.side.w, "grid 模式下左栏折叠必须改列宽（不是只改子元素）").toBeLessThanOrEqual(60);
    expect(sided.scrollW, "折叠后不得引入横向溢出").toBeLessThanOrEqual(sided.vw);
    await page.evaluate(() => document.querySelector("#sideToggle").click());
    expect((await measure()).side.w, "再点应恢复左栏宽度").toBeGreaterThan(200);
  });

  test("模式胶囊真实点击路径：三段齐、当前段高亮、点段切换且高亮跟随（P2-3）", async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForSelector("#uiModePill", { timeout: 15_000 });
    await waitMainRendered(page);

    const items = page.locator("#uiModePill .mode-pill-item");
    await expect(items, "胶囊应是三段（工作/代码/设计）").toHaveCount(3);

    /* 宽屏下三段都可点；当前（work）段带高亮态 */
    await expect(page.locator('#uiModePill .mode-pill-item[data-mode="work"]'), "当前模式段应带 is-on").toHaveClass(/is-on/);
    await expect(page.locator('#uiModePill .mode-pill-item[data-mode="work"]'), "当前模式段应 aria-pressed=true").toHaveAttribute("aria-pressed", "true");
    await expect(page.locator('#uiModePill .mode-pill-item[data-mode="code"]'), "宽屏下「代码」不应禁用").not.toBeDisabled();

    await page.click('#uiModePill .mode-pill-item[data-mode="code"]');
    /* 注意选择器：布局壳钉住 `.app > .body`。历史上正文列表项曾复用同名 `.body`，
       Playwright 严格模式会因歧义直接红（evaluate 的 querySelector 取第一个恰好是
       布局壳，所以同页探针不受影响）；2026-11-03 那批列表项已改名 `.body-row`
       （496607f），`.body` 重新唯一，但钉壳选择器留作保险，防将来再有复用。 */
    await expect(page.locator(".app > .body"), "点击「代码」应真的进入 code 模式").toHaveClass(/code-mode/);

    /* 高亮应跟到 code 上（证明胶囊是按当前态同步的，不是死标记） */
    await expect(page.locator('#uiModePill .mode-pill-item[data-mode="code"]'), "点后「代码」段应高亮").toHaveClass(/is-on/);
    await expect(page.locator('#uiModePill .mode-pill-item[data-mode="code"]'), "点后「代码」段应 aria-pressed=true").toHaveAttribute("aria-pressed", "true");
  });
});

test.describe("窄屏 390×844 · 胶囊禁用与抽屉层（P2-8、P2-7）", () => {
  test.beforeAll(() => {
    test.skip(!process.env.E2E, "set E2E=1 to run");
  });
  test.use({ viewport: { width: 390, height: 844 } });

  test("模式胶囊：「代码」段禁用 + setUIMode 拒绝 + 循环跳过 code（P2-8）", async ({ page }) => {
    await page.goto(APP_URL);
    /* 批八：胶囊在窄屏隐藏的左栏里，等待附着即可（可见性由底栏导航承担）。 */
    await page.waitForSelector("#uiModePill", { state: "attached", timeout: 15_000 });
    await waitMainRendered(page);

    const codeItem = page.locator('#uiModePill .mode-pill-item[data-mode="code"]');
    /* 批八：胶囊已迁入左侧栏，窄屏 #side 整体隐藏（模式切换由底栏/快捷键的 toggleUIMode 承担），
       因此这里不再钉「可见」，只钉三段仍在 DOM 且禁用态正确——禁用不是从 DOM 删掉。 */
    await expect(page.locator("#uiModePill .mode-pill-item"), "三段仍应存在于 DOM").toHaveCount(3);
    await expect(codeItem, "窄屏「代码」段应 disabled").toBeDisabled();
    await expect(codeItem, "窄屏「代码」段应 aria-disabled=true").toHaveAttribute("aria-disabled", "true");
    await expect(codeItem, "窄屏「代码」段应带 is-disabled 样式类").toHaveClass(/is-disabled/);
    await expect(page.locator('#uiModePill .mode-pill-item[data-mode="work"]'), "「工作」段不应被连坐禁用").not.toBeDisabled();

    /* 显式调用也应被拒绝（菜单是防误点，setUIMode 是契约层） */
    const res = await page.evaluate(() => window.setUIMode("code"));
    expect(res, "窄屏 setUIMode('code') 应返回 false").toBe(false);
    expect(await page.evaluate(() => document.querySelector(".body").className), "拒绝后 body 不得带 code-mode").not.toContain("code-mode");

    /* 循环路径：work → design → work，code 被跳过 */
    await page.evaluate(() => window.toggleUIMode());
    expect(await page.evaluate(() => document.querySelector(".body").className), "窄屏循环第一跳应到 design").toContain("design-mode");
    expect(await page.evaluate(() => localStorage.getItem("wb_agent_uimode")), "持久化值应为 JSON 串 \"design\"").toBe('"design"');
    await page.evaluate(() => window.toggleUIMode());
    const finalCls = await page.evaluate(() => document.querySelector(".body").className);
    expect(finalCls, "窄屏循环第二跳应回 work（无修饰类）").not.toContain("design-mode");
    expect(finalCls, "循环全程不得经过 code-mode").not.toContain("code-mode");
  });

  /* 2026-11-17：产品默认翻成 code 后，启动路径 applyUIMode() 直接读 _uiMode() 而不经过
     setUIMode 的窄屏拒绝——若不按屏宽分流，窄屏新用户一打开就是"对话占满全屏"（实测 375×667
     chat 667px 全高）。fixture 会先注入 work，这里再注册一条 initScript 把它删掉，
     模拟"无偏好的窄屏新用户"（后注册的脚本后执行）。 */
  test("无偏好启动：窄屏落 work，不被全局默认 code 翻转（P2-8 × 新默认）", async ({ page }) => {
    await page.addInitScript(() => {
      try { localStorage.removeItem("wb_agent_uimode"); } catch (e) { /* 存储不可用时保持原行为 */ }
    });
    await page.goto(APP_URL);
    await page.waitForSelector("#uiModePill", { state: "attached", timeout: 15_000 });
    await waitMainRendered(page);

    const mode = await page.evaluate(() => document.querySelector("#uiModePill .mode-pill-item.is-on").getAttribute("data-mode"));
    expect(mode, "窄屏无偏好应落 work（默认 code 只给宽屏）").toBe("work");
    expect(await page.evaluate(() => document.querySelector(".body").className), "body 不得带 code-mode").not.toContain("code-mode");
  });

  test("taskRail 在抽屉层（z=60）且与聊天抽屉互斥（P2-7）", async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForSelector("#main", { timeout: 15_000 });
    await waitMainRendered(page);

    /* ① 层级：应为抽屉层 60（--z-drawer），不再是旧的 popover 层 70 */
    const z = await page.evaluate(() => getComputedStyle(document.getElementById("taskRail")).zIndex);
    expect(z, `窄屏 taskRail z-index=${z}，应为抽屉层 60（--z-drawer）`).toBe("60");

    /* ② 真点击开 taskRail（聊天此刻是关的，按钮没被盖住——顺带证明 390 下按钮可用） */
    await page.click("#btnTaskRail");
    await page.waitForFunction(() => document.getElementById("taskRail").classList.contains("open"));

    /* ③ 再开聊天抽屉（__aiPanelExpand 的窄屏分支走真实 setChatDrawer）→ taskRail 应被关掉 */
    await page.evaluate(() => window.__aiPanelExpand());
    await page.waitForFunction(() => document.getElementById("chatPanel").classList.contains("show"));
    const afterChat = await page.evaluate(() => ({
      railOpen: document.getElementById("taskRail").classList.contains("open"),
      railBdHidden: document.getElementById("taskRailBackdrop").hidden,
      chatShow: document.getElementById("chatPanel").classList.contains("show"),
    }));
    expect(afterChat.chatShow, "聊天抽屉应已打开").toBe(true);
    expect(afterChat.railOpen, "开聊天抽屉应关掉 taskRail（互斥）").toBe(false);
    expect(afterChat.railBdHidden, "taskRail 遮罩应随抽屉一起隐藏").toBe(true);

    /* ④ 反向：开 taskRail 关聊天。此时聊天开着、遮罩盖屏——真浏览器的 hit-testing 会
       正确拒绝点被盖住的顶栏按钮（首跑实测 timeout 证明遮罩在工作），现实里用户这
       一指点的是遮罩（=关聊天）。互斥分支守护的是绕过 hit-testing 的入口（键盘、
       程序化调用、过渡期快点），所以这一腿用 DOM 事件派发走真实 onclick 链。 */
    await page.evaluate(() => document.getElementById("btnTaskRail").click());
    await page.waitForFunction(() => document.getElementById("taskRail").classList.contains("open"));
    const afterRail = await page.evaluate(() => ({
      chatShow: document.getElementById("chatPanel").classList.contains("show"),
      chatBdHidden: document.getElementById("chatBackdrop").hidden,
      railOpen: document.getElementById("taskRail").classList.contains("open"),
    }));
    expect(afterRail.railOpen, "taskRail 应已打开").toBe(true);
    expect(afterRail.chatShow, "开 taskRail 应关掉聊天抽屉（互斥）").toBe(false);
    expect(afterRail.chatBdHidden, "聊天遮罩应随抽屉一起隐藏").toBe(true);
  });
});

test.describe("沉浸页 :has() 六选择器族（B3 §4，真 :has() 引擎）", () => {
  test.beforeAll(() => {
    test.skip(!process.env.E2E, "set E2E=1 to run");
  });

  test("两页壳 × 三壳全 display:none，撤 class 恢复（jsdom 无 :has 引擎，几何真值只能在这里守）", async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForSelector("#chatPanel", { timeout: 15_000 });

    /* 批八：tabbar 已整条删除，沉浸壳族收敛为 .composer / .statusbar 两处
       （menubar 与左栏保留，应用内轻菜单/模式切换仍可用）。
       加 class 模拟真实触发：drawer-page 真实流程是 JS 把 #drawer 移入 .main-wrap 再加 class
       （src/ui-drawer.js _showDrawerPage），:has() 只看后代关系，体外加 class 与真流程对 CSS 而言等价；
       page-recycle 真实流程是 $("#main").classList.add("page-recycle")。
       容器必须是 body（.statusbar/#drawer 在 .main-wrap 之外，.main-wrap:has() 是死选择器）。 */
    const shellsDisplay = () => page.evaluate(() => {
      const cs = (s) => { const el = document.querySelector(s); return el ? getComputedStyle(el).display : "MISSING"; };
      return { composer: cs(".composer"), statusbar: cs(".statusbar"), tabbarMissing: !document.querySelector(".tabbar") };
    });

    for (const [sel, cls] of [["#drawer", "drawer-page"], [".main", "page-recycle"]]) {
      await page.evaluate((o) => document.querySelector(o.sel).classList.add(o.c), { sel, c: cls });
      await page.waitForTimeout(100);
      const hidden = await shellsDisplay();
      expect(hidden.tabbarMissing, "批八：.tabbar 应不存在").toBe(true);
      expect(hidden.composer, `[${cls}] .composer 应 display:none`).toBe("none");
      expect(hidden.statusbar, `[${cls}] .statusbar 应 display:none`).toBe("none");

      await page.evaluate((o) => document.querySelector(o.sel).classList.remove(o.c), { sel, c: cls });
      await page.waitForTimeout(100);
      const restored = await shellsDisplay();
      expect(restored.composer, `[${cls}] 撤 class 后 .composer 应恢复显示`).not.toBe("none");
      expect(restored.statusbar, `[${cls}] 撤 class 后 .statusbar 应恢复显示`).not.toBe("none");
    }
  });

  /* B6：专注态是「用户主动」，与上面两组「页面驱动」取并集——两个条件各管各的，互不覆盖。
     这条必须在真 :has() 引擎里跑：jsdom 只断言得了 class，display 真值只能在这里守。 */
  test("B6 专注态与页面驱动取并集：用户主动态不被页面进出覆盖", async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForSelector("#chatPanel", { timeout: 15_000 });

    const shellsDisplay = () => page.evaluate(() => {
      const cs = (s) => { const el = document.querySelector(s); return el ? getComputedStyle(el).display : "MISSING"; };
      return { composer: cs(".composer"), statusbar: cs(".statusbar") };
    });
    const SHELLS = ["composer", "statusbar"];

    /* 1) 手动开专注 ⇒ 两壳 hidden（批八 tabbar 已删） */
    await page.evaluate(() => document.body.classList.add("is-focus"));
    await page.waitForTimeout(100);
    const focusOn = await shellsDisplay();
    for (const k of SHELLS) expect(focusOn[k], `[is-focus] ${k} 应 display:none`).toBe("none");

    /* 2) 专注同时进沉浸页 ⇒ 仍 hidden（并集，不互相抵消） */
    await page.evaluate(() => document.querySelector("#drawer").classList.add("drawer-page"));
    await page.waitForTimeout(100);
    const both = await shellsDisplay();
    for (const k of SHELLS) expect(both[k], `[is-focus + drawer-page] ${k} 应仍 none`).toBe("none");

    /* 3) 退出沉浸页但专注还在 ⇒ 仍 hidden（页面驱动退出不能顺手关掉用户主动态） */
    await page.evaluate(() => document.querySelector("#drawer").classList.remove("drawer-page"));
    await page.waitForTimeout(100);
    const stillFocus = await shellsDisplay();
    for (const k of SHELLS) expect(stillFocus[k], `撤页面后 ${k} 应仍 none（专注未退）`).toBe("none");

    /* 4) 关专注 ⇒ 恢复两种壳 */
    await page.evaluate(() => document.body.classList.remove("is-focus"));
    await page.waitForTimeout(100);
    const restored = await shellsDisplay();
    for (const k of SHELLS) expect(restored[k], `关专注后 ${k} 应恢复显示`).not.toBe("none");

    /* 5) 反向对照：页面驱动单独仍有效（证明并集没把旧路径弄坏） */
    await page.evaluate(() => document.querySelector("#main").classList.add("page-recycle"));
    await page.waitForTimeout(100);
    expect((await shellsDisplay()).composer, "单靠 page-recycle 也必须 hidden").toBe("none");
    await page.evaluate(() => document.querySelector("#main").classList.remove("page-recycle"));
  });
});
