/**
 * topbar-overflow.spec.js —— B5：六档 chrome 探针（真浏览器量布局；文件名保留历史前缀）
 * ----------------------------------------------------------------------------
 * 为什么必须走 e2e：jsdom 没有布局引擎，"44×44 命中区"和"横向溢出=0"这两个数
 * 在 jsdom 里只能读 CSS 文本，读不到**实际渲染结果**（本仓的老教训：元素存在≠可见可点）。
 *
 * B5 起 .topbar 退役，系统按钮族落左栏底部工具区；≤767px 左栏整列藏，
 * 可达性由底部抽屉的镜像组（#sideSheetTools）承担。本 spec 六档（320/375/480/768/1024/1280）守：
 *   ① 文档零横向溢出；.topbar 不存在（防复活）；
 *   ② ≥768：左栏可见，快捷/工具按钮真实命中区 ≥44×44；
 *   ③ ≤767：左栏整列藏，抽屉镜像组可见且行项 ≥44 高，点「主题」端到端真的换主题（不是元素存在）；
 *   ④ 真按钮路径：桌面点 #btnTheme 必须换主题（迁移后绑定没断）。
 *
 * 守护策略同其余 spec：默认跳过，E2E=1 才跑。
 */
const { test, expect } = require("./_fixture");

const APP_URL = "./agent-workbench.html";
const TIERS = [320, 375, 480, 768, 1024, 1280];
const NARROW = new Set([320, 375, 480]);

test.beforeAll(() => { test.skip(!process.env.E2E, "set E2E=1 to run"); });

test.describe("六档 chrome 探针（左栏快捷/工具区 + 抽屉镜像组）", () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test.beforeEach(async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForSelector("#sideTool", { state: "attached" });
  });

  for (const w of TIERS) {
    test(`① ${w}px 零横向溢出 + 顶栏不存在`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 760 });
      const m = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        topbar: document.querySelectorAll(".topbar").length,
      }));
      expect(m.scrollWidth, `视口 ${w}px 出现横向溢出`).toBeLessThanOrEqual(m.clientWidth);
      expect(m.topbar, `视口 ${w}px 仍有 .topbar（B5 已退役，防复活）`).toBe(0);
    });
  }

  for (const w of TIERS.filter((x) => !NARROW.has(x))) {
    test(`② ${w}px 宽档：左栏可见，快捷/工具按钮命中区 ≥44×44`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 760 });
      const m = await page.evaluate(() => {
        const col = document.querySelector(".side-col");
        const colBox = col.getBoundingClientRect();
        const btns = Array.from(document.querySelectorAll("#sideQuick .tbtn, #sideTool .tbtn"))
          .filter(function (b) { const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
          .map(function (b) { const r = b.getBoundingClientRect(); return { id: b.id, w: Math.round(r.width), h: Math.round(r.height) }; });
        return { colW: Math.round(colBox.width), btns };
      });
      expect(m.colW, "宽档左栏必须占位").toBeGreaterThan(0);
      expect(m.btns.length, "宽档左栏工具区必须有可见按钮（全被藏=把功能弄丢）").toBeGreaterThanOrEqual(6);
      for (const b of m.btns) {
        expect(b.w, `#${b.id} 命中宽度 ${b.w}px < 44`).toBeGreaterThanOrEqual(44);
        expect(b.h, `#${b.id} 命中高度 ${b.h}px < 44`).toBeGreaterThanOrEqual(44);
      }
    });
  }

  for (const w of TIERS.filter((x) => NARROW.has(x))) {
    test(`③ ${w}px 窄档：左栏整列藏，抽屉镜像组 ≥44 高，点「主题」端到端换主题`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 760 });
      await expect(page.locator(".side-col")).toBeHidden();
      /* 打开底部抽屉（真入口同款：调 openSideSheet 的公开函数，不伪造 DOM） */
      await page.evaluate(() => { openSideSheet("today"); });
      const sheet = page.locator("#sideSheet");
      await expect(sheet).toBeVisible();
      const rows = page.locator("#sideSheetTools [data-fold-target]");
      const n = await rows.count();
      expect(n, "镜像组行项不能少于左栏工具按钮数").toBeGreaterThanOrEqual(6);
      const boxes = await page.evaluate(() => Array.from(document.querySelectorAll("#sideSheetTools [data-fold-target]:not([hidden])"))
        .map(function (r) { const b = r.getBoundingClientRect(); return { id: r.getAttribute("data-fold-target"), h: Math.round(b.height) }; }));
      expect(boxes.length, "可见行项不能为空（否则抽屉工具区是空的）").toBeGreaterThanOrEqual(6);
      for (const b of boxes) expect(b.h, `镜像行 ${b.id} 命中高度 ${b.h}px < 44`).toBeGreaterThanOrEqual(44);

      const before = await page.evaluate(() => document.documentElement.getAttribute("data-theme") || "light");
      const row = page.locator('#sideSheetTools [data-fold-target="btnTheme"]');
      /* 真命中：Playwright click 带 actionability/hit-target 检查，再补 elementFromPoint 防遮挡假通过 */
      const box = await row.boundingBox();
      const topmost = await page.evaluate(([x, y]) => {
        const el = document.elementFromPoint(x, y);
        return !!el && !!el.closest && !!el.closest('[data-fold-target="btnTheme"]');
      }, [box.x + box.width / 2, box.y + box.height / 2]);
      expect(topmost, "行项中心点上最该命中的就是它自己（被遮挡=窄屏点不到）").toBe(true);
      await row.click();
      const after = await page.evaluate(() => document.documentElement.getAttribute("data-theme") || "light");
      expect(after, `点镜像「主题」必须换主题（前后都是 ${before}）`).not.toBe(before);
    });
  }

  test("④ 真按钮路径没断：宽档直点 #btnTheme 换主题", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const before = await page.evaluate(() => document.documentElement.getAttribute("data-theme") || "light");
    await page.click("#btnTheme");
    const after = await page.evaluate(() => document.documentElement.getAttribute("data-theme") || "light");
    expect(after, `直点 #btnTheme 必须换主题（前后都是 ${before}）`).not.toBe(before);
  });

  test("⑤ 镜像行标签跟真源：#btnUser 的 .lbl 改写后开抽屉即同步", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 700 });
    await page.evaluate(() => {
      const lbl = document.querySelector('#btnUser .lbl');
      if (lbl) lbl.textContent = "user@example.com";
      openSideSheet("today");
    });
    const rowText = await page.evaluate(() =>
      document.querySelector('#sideSheetTools [data-fold-target="btnUser"]').textContent.trim());
    expect(rowText, "镜像行必须显示与真按钮一致的登录态标签").toBe("user@example.com");
  });
});
