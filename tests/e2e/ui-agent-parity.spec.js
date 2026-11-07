/**
 * ui-agent-parity.spec.js —— 向主流 agent 应用靠拢的三处观感（2026-11-07，真实浏览器）
 * ----------------------------------------------------------------------------
 * jsdom 侧（tests/ui-artifacts.test.js / rail-tabs.test.js）证契约；这里证**呈现**：
 *   ① 右栏「会话」页签在宽屏常驻可见，点开后是真实页（不是死按钮）；
 *   ② 空对话的快捷指令随模式切换（work 4 条 → code 3 条且指向代码域）——
 *      模式切换会重画聊天区（applyUIMode 里补的 renderChat），这里钉住真机可见结果；
 *   ③ 聊天里的围栏代码块渲染成代码卡（语言标签 + 复制按钮），点复制有真实回执
 *      （成功或失败都必须换字，不许"点了没反应"）。
 */
const { test, expect } = require("./_fixture");
const { waitMainRendered } = require("./helpers/wait-settled.cjs");

const APP_URL = "./agent-workbench.html";

/* 右栏页签与聊天坞是宽屏布局（≥1024）；窄屏 rail 走抽屉层，由 mobile/viewport 族覆盖。 */
test.beforeEach(async ({}, testInfo) => {
  test.skip(!process.env.E2E, "set E2E=1 to run");
  test.skip(testInfo.project.name !== "desktop-1280x800", "桌面布局断言只在宽屏项目跑");
});

async function bootWithAi(page) {
  await page.addInitScript(() => {
    /* AI 未配置时 #chat 渲染的是「尚未启用 AI」提示，空对话快捷指令无从出现。
       预置一份最小合法配置，让聊天区走真渲染路径（同 chat-drawer-mobile.spec.js 的惯例）。 */
    localStorage.setItem("wb_agent_cfg", JSON.stringify({
      enabled: true, activeId: "p",
      profiles: [{ id: "p", name: "默认", base: "https://example.invalid/v1", key: "k", model: "" }],
    }));
    localStorage.removeItem("wb_agent_chat_panel_collapsed");
  });
  await page.goto(APP_URL);
  await page.waitForSelector("#taskRail", { timeout: 15_000 });
  await waitMainRendered(page);
  await page.evaluate(() => { if (typeof window.__aiPanelExpand === "function") window.__aiPanelExpand(); });
  await waitMainRendered(page);
}

test.describe("主线 agent 观感（2026-11-07）", () => {
  test("右栏「会话」页常驻可开；快捷指令随模式切换", async ({ page }) => {
    await bootWithAi(page);

    const tab = page.locator('#taskRail [data-rail-tab="sessions"]');
    await expect(tab).toBeVisible();
    await tab.click();
    await expect(page.locator("#railSessionPane")).toBeVisible();
    await expect(page.locator("#railSessionPane")).toContainText(/会话|暂无会话/);

    const chips = page.locator("#chat .chat-suggest .chip");
    await expect(chips, "work 模式应有 4 条快捷指令").toHaveCount(4);
    expect((await chips.allTextContents()).join("|")).toContain("建个任务");

    const ok = await page.evaluate(() => window.setUIMode("code"));
    expect(ok, "1280 宽屏 setUIMode('code') 应被接受").toBe(true);
    await waitMainRendered(page);
    await expect(chips, "code 模式应有 3 条快捷指令").toHaveCount(3);
    expect((await chips.allTextContents()).join("|"), "code 模式第一条应指向代码域").toContain("代码");
  });

  test("聊天代码卡：语言标签 + 复制按钮，点击必须有回执", async ({ page }) => {
    await bootWithAi(page);
    await page.evaluate(() => {
      appendChat("office", { role: "assistant", content: "看这段：\n\n```js\nconst a = 1;\n```" });
      renderChat();
    });

    const card = page.locator("#chat .md-code").last();
    await expect(card).toBeVisible();
    await expect(card.locator(".md-code-lang")).toHaveText("js");
    const btn = card.locator("[data-code-copy]");
    await expect(btn).toBeVisible();
    await btn.click();
    /* 回执是判据：剪贴板被拦也必须说"复制失败"，不能静默 */
    await expect(btn).toHaveText(/已复制|复制失败/);
  });
});
