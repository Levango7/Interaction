/**
 * 移动端（竖屏 375×667）关键路径 E2E
 * ----------------------------------------------------------------------------
 * 与 workflow.spec.js（桌面全链路）互补：≤767px 时侧栏 #side 不可见，
 * 移动端 IA 是「底部 5 组导航 #mobBar + 底部抽屉 #sideSheet（复用侧栏菜单树）」。
 *
 * 覆盖：① 启动无横向溢出 + 底栏 5 组可见 + 侧栏隐藏
 *       ② 场景组 → 抽屉 → 切到「办公」（active 变 office）
 *       ③ AI 组 → 抽屉 → AI 配置页（#cfgEnabled 可见）
 *
 * 本机以 file:// + 375×667 实测过上述三条路径后才写成断言（非推断）。
 * 守护策略同 workflow.spec：默认跳过，E2E=1 才跑。
 */
/* 等待策略（与 workflow.spec 一致，依据 CI 日志实证的偶发）：
   等「导航/视图切换 → 界面刷新」用 10s；等静态元素用 5s（快速失败更利于定位）。
   CI 日志实证过 workflow.spec.js:87 的 .kcard 文本断言在 5s 下超时（仅 tablet 那一次、本地连跑 5 次全过）→ 负载偶发。 */
const { test, expect } = require("@playwright/test");

const APP_URL = "./agent-workbench.html";

test.describe("移动端（竖屏 375×667）", () => {
  test.beforeAll(() => {
    test.skip(!process.env.E2E, "set E2E=1 to run");
  });

  test.beforeEach(async ({ page }) => {
    page.on("dialog", async (d) => { try { await d.accept(); } catch (e) { /* ignore */ } });
  });

  test("启动：无横向溢出 + 底部 5 组导航可见 + 侧栏隐藏", async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForSelector("#mobBar", { timeout: 15_000 });

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow, "文档横向溢出应为 0（v3.7.6 修过窄屏顶栏溢出 8px）").toBeLessThanOrEqual(0);

    const groups = await page.locator("#mobBar [data-mob-group]").count();
    expect(groups, "底部导航应有 5 组").toBeGreaterThanOrEqual(5);

    const visible = await page.locator("#mobBar [data-mob-group]:visible").count();
    expect(visible, "5 组都应可见").toBeGreaterThanOrEqual(5);

    await expect(page.locator("#side"), "移动端侧栏应隐藏").toBeHidden();
  });

  test("底部导航切换场景：场景组 → 抽屉 → 办公", async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForSelector("#mobBar", { timeout: 15_000 });

    await page.click('#mobBar [data-mob-group="scenario"]');
    await page.waitForSelector("#sideSheet.open", { timeout: 10_000 });

    const office = page.locator('#sideSheetBody [data-sc="office"]').first();
    await expect(office).toBeVisible();
    await office.click();

    await expect
      .poll(() => page.evaluate(() => (typeof active !== "undefined" ? active : "")), { timeout: 5_000 })
      .toBe("office");
  });

  test("底部导航进 AI 配置页：AI 组 → 抽屉 → AI 页", async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForSelector("#mobBar", { timeout: 15_000 });

    await page.click('#mobBar [data-mob-group="ai"]');
    await page.waitForSelector("#sideSheet.open", { timeout: 10_000 });

    await page.click('#sideSheetBody [data-menu="feat-ai"]');
    await expect(page.locator("#cfgEnabled"), "AI 配置页的启用开关应可见").toBeVisible({ timeout: 10_000 });
  });
});
