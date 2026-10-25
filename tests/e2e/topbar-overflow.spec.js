/**
 * topbar-overflow.spec.js —— B5：窄屏顶栏溢出菜单（真浏览器量布局）
 * ----------------------------------------------------------------------------
 * 为什么必须走 e2e：jsdom 没有布局引擎，"44px 命中宽度"和"横向溢出=0"这两个数
 * 在 jsdom 里只能读 CSS 文本，读不到**实际渲染结果**（本仓的老教训：元素存在≠可见可点）。
 * 2026-10-20 那版把宽度压到 26px 就是为了躲溢出；本批用"data-fold 声明的低频按钮收进溢出菜单"
 * 换回 44px，所以这里要同时钉住两件事：**不溢出** 与 **命中区真的够**（少一个就是假修）。
 *
 * 守护策略同其余 spec：默认跳过，E2E=1 才跑。
 */
const { test, expect } = require("./_fixture");

const APP_URL = "./agent-workbench.html";
const NARROW = [320, 360, 375, 412];

test.beforeAll(() => { test.skip(!process.env.E2E, "set E2E=1 to run"); });

test.describe("窄屏顶栏溢出菜单", () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test.beforeEach(async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForSelector("#btnMore", { state: "attached" });
  });

  for (const w of NARROW) {
    test(`① ${w}px 顶栏不产生横向溢出，且可见按钮命中区 ≥44×44`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 700 });
      const measure = await page.evaluate(() => {
        const doc = document;
        const bar = doc.querySelector(".topbar");
        const visible = Array.from(bar.querySelectorAll(".tbtn")).filter(function (b) {
          const r = b.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        });
        return {
          scrollWidth: doc.documentElement.scrollWidth,
          clientWidth: doc.documentElement.clientWidth,
          barScrollWidth: bar.scrollWidth,
          barClientWidth: bar.clientWidth,
          buttons: visible.map(function (b) {
            const r = b.getBoundingClientRect();
            return { id: b.id, w: Math.round(r.width), h: Math.round(r.height) };
          }),
        };
      });
      expect(measure.scrollWidth, `视口 ${w}px 出现横向溢出`).toBeLessThanOrEqual(measure.clientWidth);
      expect(measure.barScrollWidth, `顶栏内部横向溢出 ${measure.barScrollWidth}>${measure.barClientWidth}`)
        .toBeLessThanOrEqual(measure.barClientWidth + 1);
      expect(measure.buttons.length, "窄屏应仍有常驻按钮（全被收起=把功能藏没了）").toBeGreaterThanOrEqual(4);
      /* 「更多」入口本身也必须可点 —— 它掉到 44 以下就等于给用户一个难点中的抽屉把手 */
      expect(measure.buttons.some((b) => b.id === "btnMore"), "窄屏必须露出溢出入口").toBe(true);
      for (const b of measure.buttons) {
        expect(b.w, `#${b.id} 命中宽度 ${b.w}px < 44`).toBeGreaterThanOrEqual(44);
        expect(b.h, `#${b.id} 命中高度 ${b.h}px < 44`).toBeGreaterThanOrEqual(44);
      }
    });
  }

  test("② 低频按钮在窄屏真的不占位（收起，而不是挤成一团）", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    const boxes = await page.evaluate(() => {
      const out = {};
      ["btnCmd", "btnTheme", "btnDownload", "btnInstall"].forEach(function (id) {
        const el = document.getElementById(id);
        const r = el.getBoundingClientRect();
        out[id] = { w: r.width, h: r.height };
      });
      return out;
    });
    for (const [id, box] of Object.entries(boxes)) {
      expect(box.w, `${id} 应被收进溢出菜单，窄屏不该还有宽度`).toBe(0);
    }
  });

  test("③ 从「更多」进菜单选「主题」真的换了主题（端到端可点，不是元素存在）", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    const before = await page.evaluate(() => document.documentElement.getAttribute("data-theme") || "light");
    await page.click("#btnMore");
    const panel = page.locator("#topbarMorePanel");
    await expect(panel).toBeVisible();
    const row = page.locator('#topbarMorePanel [data-fold-target="btnTheme"]');
    await expect(row).toBeVisible();
    /* Playwright 的 click 自带 actionability + hit-target 检查；
       再补一次 elementFromPoint，挡住"被别的层盖住但仍可 JS 点击"这种假通过。 */
    const box = await row.boundingBox();
    const topmostIsRow = await page.evaluate(([x, y]) => {
      const el = document.elementFromPoint(x, y);
      return !!el && !!el.closest && !!el.closest('[data-fold-target="btnTheme"]');
    }, [box.x + box.width / 2, box.y + box.height / 2]);
    expect(topmostIsRow, "行项中心点上最该命中的就是它自己（被遮挡=窄屏上点不到）").toBe(true);
    await row.click();
    await expect(panel).toBeHidden();
    const after = await page.evaluate(() => document.documentElement.getAttribute("data-theme") || "light");
    expect(after, `点「主题」行必须换主题（前后都是 ${before}）`).not.toBe(before);
  });

  test("④ 「更多」入口在宽屏收起（否则桌面顶栏凭空多一个按钮）", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(page.locator("#btnMore")).toBeHidden();
    await expect(page.locator("#btnCmd")).toBeVisible();
    await expect(page.locator("#btnTheme")).toBeVisible();
  });

  test("⑤ Esc 收起（键盘路径与触屏路径行为一致）", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.click("#btnMore");
    await expect(page.locator("#topbarMorePanel")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("#topbarMorePanel")).toBeHidden();
    const expanded = await page.getAttribute("#btnMore", "aria-expanded");
    expect(expanded).toBe("false");
  });
});
