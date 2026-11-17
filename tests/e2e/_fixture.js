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
 * 写于"默认 work"时代、断言的是各自功能而非默认形态。这里显式注入 `wb_agent_uimode=work`
 * 把前提钉在夹具里——测试声明自己的前提，而不是隐式依赖产品默认值；模式本身的默认契约
 * 由 `tests/ui-mode.test.js` 独占守护。不这么做的后果是几十个 spec 同时换基线，
 * 红因会被"默认变了"淹没，真正的功能回归反而看不见。
 */
const base = require("@playwright/test");

const test = base.test.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => {
      try {
        localStorage.setItem("wb_agent_onboarded", "true");
        localStorage.setItem("wb_agent_uimode", JSON.stringify("work"));
      } catch (e) { /* 存储不可用时保持原行为 */ }
    });
    await use(page);
  },
});

module.exports = { test, expect: base.expect };
