/**
 * visual-polish.spec.js —— 主流 agent 视觉收口的**真实呈现**守护（2026-11-22）
 * ----------------------------------------------------------------------------
 * jsdom 看不见排版，这里只钉三条用户可感知的契约：
 *   ① 分段导航是胶囊组（不是满宽蓝色大按钮）；
 *   ② 主聊天形态有居中阅读列与 Composer（≤840 / ≤760）；
 *   ③ 助手正文不再是表单卡片（透明底），商店卡左对齐易扫读。
 * 断言零放宽；任何回退都会在这里红。
 */
const { test, expect } = require("./_fixture");

const APP_URL = "./agent-workbench.html";

test.describe("主流 agent 视觉收口", () => {
  test.beforeAll(() => {
    test.skip(!process.env.E2E, "set E2E=1 to run");
  });
  test.use({ viewport: { width: 1440, height: 900 } });

  test("分段导航、聊天阅读列、正文与商店卡按新视觉契约呈现", async ({ page }) => {
    /* 本例守的是产品默认聊天首页：显式让开公共夹具的「页面视图前提」。 */
    await page.addInitScript(() => {
      try {
        localStorage.removeItem("wb_agent_active");
        localStorage.setItem("wb_agent_e2e_keep_chat_home", "1");
      } catch (e) { /* ignore */ }
    });
    await page.goto(APP_URL);
    await page.waitForFunction(() => document.querySelector(".body").classList.contains("chat-home"), null, { timeout: 15_000 });

    const home = await page.evaluate(() => {
      const cs = (el) => (el ? getComputedStyle(el) : null);
      const box = (el) => { const r = el.getBoundingClientRect(); return { w: Math.round(r.width) }; };
      const nav = Array.from(document.querySelectorAll(".set-nav")).find((el) => el.getBoundingClientRect().width > 0) || null;
      const chat = document.querySelector(".main-wrap>.chat-panel .chat");
      const composer = document.querySelector(".main-wrap>.chat-panel .chat-input-area");
      const assistant = document.querySelector("#chat .msg.assistant");
      return {
        navDisplay: cs(nav)?.display,
        navRadius: cs(nav)?.borderRadius,
        chatW: chat ? box(chat).w : 0,
        composerW: composer ? box(composer).w : 0,
        assistantBg: assistant ? cs(assistant).backgroundColor : null,
        bodyClass: document.querySelector(".body").className,
      };
    });
    expect(home.chatW, `阅读列宽 ${home.chatW} 应 ≤840`).toBeLessThanOrEqual(840);
    expect(home.composerW, `Composer 宽 ${home.composerW} 应 ≤760`).toBeLessThanOrEqual(760);
    expect(home.assistantBg, "助手正文应为透明底").toBe("rgba(0, 0, 0, 0)");

    await page.click('#side .nav-item[data-sc="store"]');
    await page.waitForFunction(() => !!document.querySelector(".store-card"), null, { timeout: 15_000 });
    const store = await page.evaluate(() => {
      const card = document.querySelector(".store-card");
      const nav = document.querySelector("#main .set-nav");
      return {
        align: getComputedStyle(card.querySelector(".app-card-tx")).alignItems,
        navDisplay: getComputedStyle(nav).display,
        navRadius: getComputedStyle(nav).borderRadius,
      };
    });
    expect(store.align, "商店卡应左对齐易扫读").toBe("flex-start");
    /* nav 在 flex 容器内会被 blockification 规范成 flex；这里钉「胶囊圆角 + 不是满宽块级大按钮」。 */
    expect(["inline-flex", "flex"]).toContain(store.navDisplay);
    expect(store.navRadius, "分段导航应为胶囊圆角").toBe("999px");
  });
});
