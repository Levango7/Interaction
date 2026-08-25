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
      const theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
      expect(theme).toBe('light');
      const stored = await page.evaluate(() => localStorage.getItem('wb_agent_theme'));
      expect(stored).toBe('light');
    });

    // Close settings drawer
    await test.step("Close drawer", async () => {
      await page.click('#btnGear');
      await expect(page.locator('#drawer')).not.toHaveClass(/open/);
    });
  });
});
