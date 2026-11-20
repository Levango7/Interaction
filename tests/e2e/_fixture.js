/**
 * _fixture.js —— e2e 共用夹具：让页面以「应用稳态」启动（v3.7.65）
 * ----------------------------------------------------------------------------
 * 为什么需要：首次启动引导 modal 是 `position:fixed;inset:0` 的全屏层
 * （`agent-workbench.html` 的 `.onboard-modal`）。v3.7.65 修好了「引导永不触发」——
 * 旧代码里 seed() 先播种演示任务、而 needsOnboarding() 又要求「无任务」，于是新用户
 * 永远进不了引导；修正后每次全新存储启动都会出引导。若不先关掉这一层，
 * 除引导本身以外的所有点击/可见性断言都会被全屏遮罩挡住（真实浏览器有 hit-testing，
 * 不像 jsdom 能直接 .click() 穿透）。
 *
 * 做法：在页面脚本执行前写入 `wb_agent_onboarded` 标记，页面直接进入稳态。
 * 例外：`workflow.spec.js` 负责跑引导三步本身，故意继续用 `@playwright/test` 的原生 test。
 *
 * 2026-11-17（默认落地页翻成 agent-first）：产品默认已改为 code 模式，但绝大多数 e2e
 * 写于"默认 work"时代、断言的是各自功能而非默认形态。这里在**缺省时**注入
 * `wb_agent_uimode=work`，把前提钉在夹具里——测试声明自己的前提，而不是隐式依赖产品默认值；
 * 模式本身的默认契约由 `tests/ui-mode.test.js` 独占守护。不这么做的后果是几十个 spec 同时换基线，
 * 红因会被"默认变了"淹没，真正的功能回归反而看不见。
 * ⚠️ 必须"仅缺省时"注入：有 spec 会自己预置 design 再 reload，无条件 setItem 会把它覆盖成 work。
 */
const base = require("@playwright/test");

const APP_URL = "./agent-workbench.html";

/**
 * gotoPageView —— 给写于「打开就是页面视图」时代的 spec 声明启动前提。
 * 批十产品默认落聊天首页：fixture 缺省注入 office（场景键）⇒ chatHome=true ⇒
 * `.body.chat-home .main-wrap>.main{display:none}`，于是 `waitForSelector("#main")`
 * 会一直看到 hidden 的 #main 并超时（第五轮 CI 15 条红全是这一条）。
 * 这里不改产品形态、不放宽任何等待：显式调用既有 `setActive(scene)`（它会把
 * chatHome 置 false）再 `render()`，之后才进入原本的 `#main` 就绪判据。
 * scene 默认 office（保留场景头控件）；只需页面几何的用例可传 "overview"。
 * 与 addInitScript 的 active 注入不冲突：这是 goto 之后对同一键的显式写入。
 */
async function gotoPageView(page, scene = "office") {
  await page.goto(APP_URL);
  await page.waitForSelector(".body", { state: "attached" });
  await page.evaluate((sc) => {
    if (typeof setActive === "function") setActive(sc);
    if (typeof render === "function") render();
  }, scene);
  await page.waitForSelector("#main");
}

const test = base.test.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => {
      try {
        localStorage.setItem("wb_agent_onboarded", "true");
        /* 仅缺省时注入：draw-edge-routing / draw-embed-bridge / draw-export 那几条用例
           会自己预置 `wb_agent_uimode=design` 再 reload，期望"持久化的设计模式真回到 Design"。
           无条件 setItem 会在每次导航时覆盖它们（CI 全量 e2e 当场抓出，本地只跑了 5 个 spec 没覆盖到）。
           缺省注入仍然让写于"默认 work"时代的 spec 拿到 work 前提，而预置 design 的不被改写。 */
        if (localStorage.getItem("wb_agent_uimode") === null) {
          localStorage.setItem("wb_agent_uimode", JSON.stringify("work"));
        }
        /* 批十（产品默认落聊天首页）：绝大多数 e2e 写于「打开就是 office 场景」时代，
           且大量用例的 helper 直接 appendChat("office") / getChat("office")/ 断言场景头控件。
           缺省注入 overview（页面键）会让：① 聊天输入区在页面视图下不渲染；② 写死 office 的
           会话与 renderChat() 读的 getChat(active=overview) 错开——CI 连红三轮的根因。
           改注入 office（场景键）：chatHome=true ⇒ 聊天首页（气泡+输入区可见），写死 office 的
           helper 自然对齐；要测页面视图的用例点侧栏导航即可（setActive 会退出 chatHome）。
           产品「无偏好 → 聊天首页」仍由 ui-mode-layout 的专门用例独占守护（它显式删本键）。
           与 uimode 同理：只缺省注入，不覆盖 spec 自己预置的 active（如 ics 预置 tasks）。 */
        if (localStorage.getItem("wb_agent_active") === null) {
          localStorage.setItem("wb_agent_active", JSON.stringify("office"));
        }
        /* 批十复绿轮五（CI 44801250619 / Deploy 44801250613）：上面注入 office 让
           chatHome=true、#main 让位，结果几十条写于「打开就是页面视图」时代的
           spec 全部卡在 waitForSelector/waitMainRendered 的 #main 就绪判据
           （第五轮 15 条红 + 本地全量续跑的 ui-agent-parity / three-state-layout 等）。
           这里在 DOMContentLoaded 时**以当前 active 重放一次 setActive**：chatHome
           置 false、active 原值不变（office / ics 的 tasks / draw 的 design 都不覆盖）。
           产品默认「无偏好 → 聊天首页」不变，由 ui-mode-layout 的专门用例写
           wb_agent_e2e_keep_chat_home=1 跳过本段后独占守护。 */
        document.addEventListener("DOMContentLoaded", function () {
          /* 标志必须在回调里读：spec 自己的 addInitScript 排在本夹具之后注册，
             在外层读时它还没执行，会把「默认聊天首页」守护用例误翻成页面视图。 */
          if (localStorage.getItem("wb_agent_e2e_keep_chat_home") === "1") return;
          try {
            if (typeof setActive === "function") {
              setActive((typeof active !== "undefined" && active) || "office");
              if (typeof render === "function") render();
            }
          } catch (e) { /* 后续就绪等待判据自然决定红绿，不放宽 */ }
        }, { once: true });
      } catch (e) { /* 存储不可用时保持原行为 */ }
    });
    await use(page);
  },
});

module.exports = { test, expect: base.expect, gotoPageView };
