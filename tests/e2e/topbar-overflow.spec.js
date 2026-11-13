/**
 * topbar-overflow.spec.js —— UI 对齐批 A：左缘竖图标轨几何（真浏览器量布局）
 * ----------------------------------------------------------------------------
 * 2026-11-13 用户裁「全挪，最贴 Qoder」：顶栏七图标迁入左缘竖轨 #iconRail，
 * B5 顶栏溢出菜单（btnMore/#topbarMorePanel/data-fold）同批退役。
 * 窄屏契约随之反转：不再"收低频钮换不溢出"，而是「七钮常驻可见 + 整页不横溢 + 命中区够」。
 * jsdom 没有布局引擎，这三个数只能在真浏览器量（本仓老教训：元素存在≠可见可点）。
 *
 * 守护策略同其余 spec：默认跳过，E2E=1 才跑。
 */
const { test, expect } = require("./_fixture");

const APP_URL = "./agent-workbench.html";
const NARROW = [320, 360, 375, 412];
const RAIL_IDS = ["btnSearchTop", "btnCmd", "btnTaskRail", "btnMessages", "btnTheme", "btnDownload", "btnInstall"];
/* 安装入口受 beforeinstallprompt 能力门控，测试浏览器不触发该事件 ⇒ 恒隐藏 */
const ALWAYS_ON = ["btnSearchTop", "btnCmd", "btnTaskRail", "btnMessages", "btnTheme", "btnDownload"];

test.beforeAll(() => { test.skip(!process.env.E2E, "set E2E=1 to run"); });

test.describe("左缘竖图标轨：窄屏几何", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForSelector("#iconRail .rail-btn");
  });

  for (const w of NARROW) {
    test(`① ${w}px 整页/轨/顶栏都不横向溢出，轨内可见按钮命中区 ≥44×44`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 700 });
      const measure = await page.evaluate(() => {
        const rail = document.getElementById("iconRail");
        const bar = document.querySelector(".topbar");
        const visible = (root) => Array.from(root.querySelectorAll(".tbtn")).filter(function (b) {
          const r = b.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        });
        const box = (b) => { const r = b.getBoundingClientRect(); return { id: b.id, w: Math.round(r.width), h: Math.round(r.height) }; };
        return {
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          railScrollWidth: rail.scrollWidth,
          railClientWidth: rail.clientWidth,
          railButtons: visible(rail).map(box),
          barScrollWidth: bar.scrollWidth,
          barClientWidth: bar.clientWidth,
          barButtons: visible(bar).map(box),
        };
      });
      expect(measure.scrollWidth, `视口 ${w}px 出现横向溢出`).toBeLessThanOrEqual(measure.clientWidth);
      expect(measure.railScrollWidth, `图标轨 ${w}px 内部横向溢出`).toBeLessThanOrEqual(measure.railClientWidth + 1);
      expect(measure.barScrollWidth, `顶栏 ${w}px 内部横向溢出`).toBeLessThanOrEqual(measure.barClientWidth + 1);
      expect(measure.railButtons.length, "轨内必须真有可见按钮（全空=迁移把功能弄丢了）").toBeGreaterThanOrEqual(ALWAYS_ON.length);
      for (const b of measure.railButtons.concat(measure.barButtons)) {
        expect(b.w, `#${b.id} 命中宽度 ${b.w}px < 44`).toBeGreaterThanOrEqual(44);
        expect(b.h, `#${b.id} 命中高度 ${b.h}px < 44`).toBeGreaterThanOrEqual(44);
      }
      /* 能力门控：没有 beforeinstallprompt 的测试浏览器里安装入口必须保持隐藏 */
      const visibleIds = measure.railButtons.map((b) => b.id);
      expect(visibleIds.includes("btnInstall"), "无 beforeinstallprompt 时安装入口不可见（能力缺失即隐藏）").toBe(false);
      ALWAYS_ON.forEach((id) => {
        expect(visibleIds.includes(id), `#${id} 窄屏必须在轨可见（常驻，不靠溢出菜单二次进入）`).toBe(true);
      });
    });
  }

  test("② 顶栏瘦身后常驻件正确：用户在顶栏、七钮不在顶栏、B5 三件套整删", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    const home = await page.evaluate((ids) => {
      const rail = document.getElementById("iconRail");
      const bar = document.querySelector(".topbar");
      const inRail = (id) => { const el = document.getElementById(id); return !!el && rail.contains(el); };
      const inBar = (id) => { const el = document.getElementById(id); return !!el && bar.contains(el); };
      return {
        rail: ids.map(inRail),
        userInBar: inBar("btnUser"),
        syncInBar: inBar("syncStatus"),
        moreGone: !document.getElementById("btnMore") && !document.getElementById("topbarMorePanel"),
        foldGone: document.querySelectorAll("[data-fold]").length === 0,
      };
    }, RAIL_IDS);
    expect(home.rail, "七钮必须全家在轨").toEqual(RAIL_IDS.map(() => true));
    expect(home.userInBar, "btnUser 是顶栏常驻件").toBe(true);
    expect(home.syncInBar, "syncStatus 留顶栏").toBe(true);
    expect(home.moreGone, "btnMore/#topbarMorePanel 是删除不是隐藏（复活=开倒车）").toBe(true);
    expect(home.foldGone, "data-fold 声明机制整批退役，DOM 里不许再有").toBe(true);
  });

  test("③ 轨内点「主题」真的换了主题（行为不随迁移断——旧面板行项转发链的继任钉）", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    const before = await page.evaluate(() => document.documentElement.getAttribute("data-theme") || "light");
    await page.click("#btnTheme");
    const after = await page.evaluate(() => document.documentElement.getAttribute("data-theme") || "light");
    expect(after, `点轨内 #btnTheme 必须换主题（前后都是 ${before}）`).not.toBe(before);
  });

  test("④ 宽屏：轨常驻 + 顶栏只有同步/用户（桌面不凭空多出窄屏专属件）", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    for (const id of ["btnSearchTop", "btnCmd", "btnMessages", "btnTheme", "btnDownload"]) {
      await expect(page.locator("#" + id)).toBeVisible();
    }
    await expect(page.locator("#btnInstall")).toBeHidden();
    await expect(page.locator("#btnUser")).toBeVisible();
    /* 宽屏任务轨常驻 ⇒ 切换钮让位；折叠态反向。二者必居其一，不允许同时可见/同时消失 */
    const toggleVisible = await page.locator("#btnTaskRail").isVisible();
    const railVisible = await page.locator("#taskRail").isVisible();
    expect(toggleVisible, "宽屏任务轨常驻时切换钮必须让位（折叠态才出现）").toBe(!railVisible);
    /* 顶栏里不再有任何七钮成员 */
    const stray = await page.evaluate((ids) => {
      const bar = document.querySelector(".topbar");
      return ids.filter((id) => bar.contains(document.getElementById(id)));
    }, RAIL_IDS);
    expect(stray, "七钮在宽屏也不许回流顶栏").toEqual([]);
  });

  test("⑤ 窄屏高频钮真可点：点「今日」开任务抽屉、Esc 收起（键盘路径不卡死）", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.click("#btnTaskRail");
    await expect(page.locator("#taskRail")).toHaveClass(/open/);
    await page.keyboard.press("Escape");
    await expect(page.locator("#taskRail")).not.toHaveClass(/open/);
  });
});
