/**
 * ui-mode-layout.spec.js —— 界面模式切换的**几何/呈现层**守护（真实浏览器）
 * ----------------------------------------------------------------------------
 * 与 tests/ui-mode.test.js（vitest/jsdom，13 条）的分工：
 *   · jsdom 侧证的是**契约**：菜单状态机、存储读写、rail tab 让位、窄屏拒绝。
 *     但 jsdom 没有排版引擎——display:none 生不生效、sticky 贴不贴底、z-index 分不分层，
 *     它一概看不见（getBoundingClientRect 恒 0）。
 *   · 本 spec 证的是**呈现**：P1 修完后 code 模式真的是「工作面居中 + 聊天贴底坞」，
 *     而不是旧实现那种「聊天占满中栏、.main 被藏掉」（用户点单的「主客颠倒」）。
 *     CSS 层的断言只能放这里——写进 jsdom 会全绿但什么都没守住。
 *
 * 覆盖（P1-1/2、P2-3/5/7/8 的呈现侧）：
 *   ① 宽屏 1440：code 模式 #main 可见且居中、chat 是 sticky 底坞（非全高）、
 *      sessionDock/agentDock 在位、右栏 Agent tab 消失而「今日」仍在（P2-5）
 *   ② 宽屏：菜单真实点击路径（开 → 三项齐 → 当前勾选 → 点 code 生效 → 关门）
 *   ③ 窄屏 390：菜单「代码」项禁用、setUIMode("code") 返回 false、
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
  const dock = q("#agentDock"), sd = q("#sessionDock");
  const agentTab = q('#taskRail [data-rail-tab="agent"]');
  const todayTab = q('#taskRail [data-rail-tab="today"]');
  return {
    bodyClass: q(".body").className,
    mainDisplay: main ? getComputedStyle(main).display : null,
    main: main ? box(main) : null,
    wrap: wrap ? box(wrap) : null,
    chatPos: chat ? getComputedStyle(chat).position : null,
    chat: chat ? box(chat) : null,
    dockDisplay: dock ? getComputedStyle(dock).display : null,
    dock: dock ? box(dock) : null,
    sdDisplay: sd ? getComputedStyle(sd).display : null,
    agentTabDisplay: agentTab ? getComputedStyle(agentTab).display : null,
    todayTabDisplay: todayTab ? getComputedStyle(todayTab).display : null,
    vw: window.innerWidth, vh: window.innerHeight,
  };
};

test.describe("宽屏 1440×900 · code 模式几何（P1-1/2、P2-5）", () => {
  test.beforeAll(() => {
    test.skip(!process.env.E2E, "set E2E=1 to run");
  });
  test.use({ viewport: { width: 1440, height: 900 } });

  test("中栏=工作面（可见且居中），聊天=贴底坞（sticky、非全高）", async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForSelector("#main", { timeout: 15_000 });
    await waitMainRendered(page);

    const ok = await page.evaluate(() => window.setUIMode("code"));
    expect(ok, "1440 宽屏 setUIMode('code') 应被接受").toBe(true);
    await waitMainRendered(page);
    const g = await page.evaluate(probeCodeMode);

    /* ---- P1 主客颠倒的回归判据：旧实现是 .main{display:none} + chat 占满中栏 ---- */
    expect(g.bodyClass, "body 应带 code-mode").toContain("code-mode");
    expect(g.mainDisplay, `#main 被 display:${g.mainDisplay} 藏掉（主客颠倒回归）`).not.toBe("none");
    expect(g.main.w, `#main 宽 ${g.main.w}px，应是有宽度的中栏`).toBeGreaterThan(200);
    expect(g.main.h, `#main 高 ${g.main.h}px，应是有高度的中栏`).toBeGreaterThan(200);

    /* ---- 三栏位：中栏在 240 左栏与 300 右栏之间 ---- */
    expect(g.wrap.x, `中栏左缘 ${g.wrap.x}，应在 240px 左栏之后`).toBeGreaterThanOrEqual(238);
    expect(g.wrap.x + g.wrap.w, `中栏右缘 ${g.wrap.x + g.wrap.w}，应在 300px 右栏之前`).toBeLessThanOrEqual(g.vw - 298);
    expect(g.main.x, `#main 左缘 ${g.main.x} 应落在中栏内`).toBeGreaterThanOrEqual(g.wrap.x - 1);

    /* ---- 聊天 = 贴底坞：sticky、≤46vh、贴视口底、不出中栏 ----
       旧实现（全高中栏） height≈vh 且 position 不是 sticky——两条一起抓。 */
    expect(g.chatPos, `聊天面板 position=${g.chatPos}，应为贴底 sticky`).toBe("sticky");
    expect(g.chat.h, `聊天面板高 ${g.chat.h}px，超过 46vh 上限（${Math.round(g.vh * 0.46)}px）`).toBeLessThanOrEqual(g.vh * 0.47 + 2);
    expect(g.chat.y, `聊天面板顶缘 ${g.chat.y}，应在视口下半部（贴底坞）`).toBeGreaterThan(g.vh * 0.45);
    expect(g.chat.y + g.chat.h, "聊天坞底缘不得超出视口").toBeLessThanOrEqual(g.vh);
    expect(g.chat.x, "聊天坞应在中栏内（左缘）").toBeGreaterThanOrEqual(g.wrap.x - 1);
    expect(g.chat.x + g.chat.w, "聊天坞应在中栏内（右缘）").toBeLessThanOrEqual(g.wrap.x + g.wrap.w + 1);

    /* ---- P2-5：右栏 Agent tab 让位 agentDock ---- */
    expect(g.agentTabDisplay, "code 模式右栏 Agent tab 应隐藏").toBe("none");
    expect(g.todayTabDisplay, "「今日」tab 不应被误伤").not.toBe("none");

    /* ---- 两个 dock 在位（左下会话 / 右下能力面） ---- */
    expect(g.sdDisplay, "sessionDock 应显示").not.toBe("none");
    expect(g.dockDisplay, "agentDock 应显示").not.toBe("none");
    expect(g.dock.x, `agentDock 左缘 ${g.dock.x}，应在 300px 右栏内`).toBeGreaterThanOrEqual(g.vw - 302);
    expect(g.dock.y + g.dock.h, "agentDock 不得溢出视口底").toBeLessThanOrEqual(g.vh);
  });

  test("模式菜单真实点击路径：三项齐、当前勾选、点击切换并关门（P2-3）", async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForSelector("#btnUIMode", { timeout: 15_000 });
    await waitMainRendered(page);

    await page.click("#btnUIMode");
    const menu = page.locator("#uiModeMenu");
    await expect(menu, "点开关按钮后菜单应可见").toBeVisible();
    const items = page.locator("#uiModeMenu .ui-mode-item");
    await expect(items, "菜单应是三项（工作/代码/设计）").toHaveCount(3);

    /* 宽屏下三项都可点；当前（work）项带勾选态 */
    await expect(page.locator('#uiModeMenu .ui-mode-item[data-mode="work"]'), "当前模式项应带 is-on").toHaveClass(/is-on/);
    await expect(page.locator('#uiModeMenu .ui-mode-item[data-mode="work"]'), "当前模式项应 aria-checked=true").toHaveAttribute("aria-checked", "true");
    await expect(page.locator('#uiModeMenu .ui-mode-item[data-mode="code"]'), "宽屏下「代码」不应禁用").not.toBeDisabled();

    await page.click('#uiModeMenu .ui-mode-item[data-mode="code"]');
    await expect(menu, "选中后菜单应收起").toBeHidden();
    await expect(page.locator("#btnUIMode"), "菜单收起后触发按钮应回到 aria-expanded=false").toHaveAttribute("aria-expanded", "false");
    /* 注意选择器：布局壳钉住 `.app > .body`。历史上正文列表项曾复用同名 `.body`，
       Playwright 严格模式会因歧义直接红（evaluate 的 querySelector 取第一个恰好是
       布局壳，所以同页探针不受影响）；2026-11-03 那批列表项已改名 `.body-row`
       （496607f），`.body` 重新唯一，但钉壳选择器留作保险，防将来再有复用。 */
    await expect(page.locator(".app > .body"), "点击「代码」应真的进入 code 模式").toHaveClass(/code-mode/);

    /* 再开一次：勾选应跟到 code 上（证明菜单是按当前态重渲染的，不是死标记） */
    await page.click("#btnUIMode");
    await expect(page.locator('#uiModeMenu .ui-mode-item[data-mode="code"]'), "重开后勾选应跟到 code").toHaveAttribute("aria-checked", "true");
    await page.keyboard.press("Escape");
    await expect(menu, "Escape 应能关菜单").toBeHidden();
  });
});

test.describe("窄屏 390×844 · 菜单禁用与抽屉层（P2-8、P2-7）", () => {
  test.beforeAll(() => {
    test.skip(!process.env.E2E, "set E2E=1 to run");
  });
  test.use({ viewport: { width: 390, height: 844 } });

  test("模式菜单：「代码」项禁用 + setUIMode 拒绝 + 循环跳过 code（P2-8）", async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForSelector("#btnUIMode", { timeout: 15_000 });
    await waitMainRendered(page);

    await page.click("#btnUIMode");
    const codeItem = page.locator('#uiModeMenu .ui-mode-item[data-mode="code"]');
    await expect(codeItem, "「代码」项应可见（禁用不是藏起来）").toBeVisible();
    await expect(codeItem, "窄屏「代码」项应 disabled").toBeDisabled();
    await expect(codeItem, "窄屏「代码」项应 aria-disabled=true").toHaveAttribute("aria-disabled", "true");
    await expect(codeItem, "窄屏「代码」项应带 is-disabled 样式类").toHaveClass(/is-disabled/);
    await expect(page.locator('#uiModeMenu .ui-mode-item[data-mode="work"]'), "「工作」项不应被连坐禁用").not.toBeDisabled();
    await page.keyboard.press("Escape");

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
