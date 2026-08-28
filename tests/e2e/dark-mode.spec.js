// E2E tests: Dark mode toggle
const { test, expect } = require("@playwright/test");
const APP_URL = "./agent-workbench.html";

test.describe("E2E tests (set E2E=1 to run)", () => {
  test.beforeAll(() => {
    test.skip(!process.env.E2E, "set E2E=1 to run");
  });
  test.beforeEach(async ({ page }) => {
    page.on("dialog", async (d) => { try { await d.accept(); } catch (e) {} });
  });

  test("Dark mode toggle persists via settings", async ({ page }) => {
    // Launch app and skip onboarding
    await test.step("Launch and skip onboarding", async () => {
      await page.goto(APP_URL);
      await page.waitForSelector("#side .nav-item", { timeout: 15000 });
      const onboard = await page.$("#onboardModal");
      if (onboard) {
        for (let i = 0; i < 3; i++) { await page.click("#onboardSkip"); await page.waitForTimeout(150); }
        await page.waitForSelector("#taskForm", { timeout: 10000 });
      }
    });

    // Open settings drawer and switch to appearance tab
    await test.step("Open appearance settings", async () => {
      await page.click("#btnGear");
      await page.waitForSelector("#drawer.open", { timeout: 5000 });
      await page.click('[data-set-tab="set-look"]');
      await page.waitForSelector('#cfgTheme', { timeout: 3000 });
    });

    // Switch to dark theme and verify attribute
    await test.step("Toggle dark theme", async () => {
      await page.selectOption('#cfgTheme', 'dark');
      // The UI updates the document attribute; check via evaluate
      const theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
      expect(theme).toBe('dark');
    });

    // Switch back to light theme and verify persistence in localStorage
    await test.step("Switch back to light and verify localStorage", async () => {
      await page.selectOption('#cfgTheme', 'light');
      // 亮色是默认态：applyTheme 移除 data-theme 属性（而非设为 "light"），见 agent-workbench.html applyTheme
      const theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
      expect(theme).toBeNull();
      // 主题持久化在 wb_agent_cfg JSON 的 theme 字段（仅 AI Key 加密，theme 为明文）
      const stored = await page.evaluate(() => {
        try { return JSON.parse(localStorage.getItem('wb_agent_cfg') || '{}').theme; } catch (e) { return null; }
      });
      expect(stored).toBe('light');
    });

    // Close settings drawer（btnGear 只开不关——关闭走 #drawerClose，见 setupSideMenu data-gear 分支）
    await test.step("Close drawer", async () => {
      await page.click('#drawerClose');
      await expect(page.locator('#drawer')).not.toHaveClass(/open/);
    });
  });
});
