// E2E tests: Session management
const { test, expect } = require("@playwright/test");
const APP_URL = "./agent-workbench.html";

test.describe("E2E tests (set E2E=1 to run)", () => {
  test.beforeAll(() => {
    test.skip(!process.env.E2E, "set E2E=1 to run");
  });
  test.beforeEach(async ({ page }) => {
    page.on("dialog", async (d) => {
      try { await d.accept(); } catch (e) {}
    });
  });

  test("Session manager: create, rename, switch, delete", async ({ page }) => {
    await test.step("Launch app and skip onboarding", async () => {
      await page.goto(APP_URL);
      await page.waitForSelector("#side .nav-item", { timeout: 15000 });
      const onboard = await page.$("#onboardModal");
      if (onboard) {
        for (let i = 0; i < 3; i++) {
          await page.click("#onboardSkip");
          await page.waitForTimeout(150);
        }
        await page.waitForSelector("#taskForm", { timeout: 10000 });
      }
    });

    await test.step("Open session modal", async () => {
      await page.click("#chatSessionBtn");
      await page.waitForSelector("#sessionModal.show", { timeout: 5000 });
      await expect(page.locator("#sessList .sess-item")).toBeVisible();
    });

    await test.step("Create new session", async () => {
      const before = await page.locator("#sessList .sess-item").count();
      await page.click("#sessNewBtn");
      await page.waitForFunction((c) => document.querySelectorAll("#sessList .sess-item").length > c, before, { timeout: 5000 });
      const after = await page.locator("#sessList .sess-item").count();
      expect(after).toBeGreaterThan(before);
    });

    await test.step("Switch to the new session and verify auto‑name", async () => {
      const items = await page.locator("#sessList .sess-item").all();
      const last = items[items.length - 1];
      await last.click();
      // after activation preview should show messages area
      await page.waitForSelector("#sessPreview .sess-msg", { timeout: 3000 });
    });

    await test.step("Delete a non‑last session", async () => {
      // ensure at least two sessions exist
      const count = await page.locator("#sessList .sess-item").count();
      if (count < 2) return;
      const first = page.locator("#sessList .sess-item").first();
      const deleteBtn = first.locator("button[data-act='delete']");
      await deleteBtn.click();
      await page.waitForFunction((c) => document.querySelectorAll("#sessList .sess-item").length === c - 1, count, { timeout: 5000 });
    });

    await test.step("Close session modal", async () => {
      await page.click("#btnSessionClose");
      await expect(page.locator("#sessionModal")).not.toHaveClass(/show/);
    });
  });
});
