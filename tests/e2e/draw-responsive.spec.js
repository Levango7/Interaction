/**
 * draw-responsive.spec.js —— Design 模式窄屏零溢出 + 画布真指针可用（真浏览器量布局）
 * ----------------------------------------------------------------------------
 * 为什么必须走 e2e：`docs/design-mode-phase-b.md` 的三栏网格是 `240px / 1fr / 300px`，
 * 在 320/375/412 上 jsdom 量不出来（没有布局引擎），CSS 文本存在 ≠ 渲染不溢出
 * （本仓踩过的坑：元素存在≠可见可点，topbar-overflow 同一口径）。
 *
 * 钉两件事：
 *   ① ≤1023px 单栏：横向溢出 = 0，且画布真的占满（宽度 ≈ 视口宽），图列表停靠收起；
 *   ② 画布在窄屏仍可用：真指针放一个节点 → 命中 `g.dnode` → 拖动后坐标变化。
 *      只测"渲染出 SVG"不算数 —— 那样窄屏给一块死图也能绿。
 *
 * 守护策略同其余 spec：默认跳过，E2E=1 才跑。
 */
const { test, expect } = require("./_fixture");

const APP_URL = "./agent-workbench.html";
const NARROW = [320, 375, 412];

test.beforeAll(() => { test.skip(!process.env.E2E, "set E2E=1 to run"); });

test.describe("Design 模式窄屏", () => {
  test.use({ viewport: { width: 375, height: 667 } });

  /** 切到 Design 模式（循环 work→code→design）。
   *  ⚠️ 选择器必须是 `.app > .body`：`.body` 这个类名在正文列表项里也被复用
   *  （render-overview / render-entry 的 `<div class="body">`），裸 `.body` 在 Playwright
   *  严格模式下会因命中多个元素而报错 —— 这是本 spec 首轮 CI 的真实红法。 */
  const SHELL = ".app > .body";
  async function toDesign(page) {
    await page.click("#btnUIMode");
    await page.click("#btnUIMode");
    await expect(page.locator(SHELL)).toHaveClass(/design-mode/);
    await page.waitForSelector("#drawCanvasHost svg", { state: "attached" });
  }

  for (const w of NARROW) {
    test(`① ${w}px Design 模式零横向溢出，画布占满中栏`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 700 });
      await page.goto(APP_URL);
      await toDesign(page);
      const m = await page.evaluate(() => {
        const doc = document;
        const stage = document.getElementById("drawStage");
        const host = document.getElementById("drawCanvasHost");
        const dock = document.getElementById("diagramDock");
        const sr = stage ? stage.getBoundingClientRect() : null;
        const hr = host ? host.getBoundingClientRect() : null;
        return {
          scrollWidth: doc.documentElement.scrollWidth,
          clientWidth: doc.documentElement.clientWidth,
          stageW: sr ? Math.round(sr.width) : -1,
          hostW: hr ? Math.round(hr.width) : -1,
          hostH: hr ? Math.round(hr.height) : -1,
          dockShown: dock ? getComputedStyle(dock).display !== "none" : false,
        };
      });
      expect(m.scrollWidth, `视口 ${w}px 出现横向溢出`).toBeLessThanOrEqual(m.clientWidth);
      /* 画布区铺满视口；宿主再扣掉 #drawStage 的 8px 两侧内边距与 1px 边框。
         容差写死在这些实测量上，不用「乘以百分比」那种会随视口变宽的松判据。 */
      expect(m.stageW, `画布区必须铺满视口宽度（单栏降级）；实测 ${m.stageW}/${m.clientWidth}`)
        .toBeGreaterThanOrEqual(m.clientWidth - 2);
      expect(m.hostW, `画布宿主宽度应随视口收缩；实测 ${m.hostW}，画布区 ${m.stageW}`)
        .toBeGreaterThanOrEqual(m.stageW - 20);
      expect(m.hostH, "画布宿主必须有实际高度（否则是一块看不见的 0 高区域）").toBeGreaterThan(120);
      expect(m.dockShown, "窄屏图列表停靠应收起（三栏在 320 上必溢出）").toBe(false);
    });
  }

  test("② 窄屏画布真能用：放一个节点 + 拖动它（坐标真的变了）", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 700 });
    await page.goto(APP_URL);
    await toDesign(page);

    /* 放节点走工具条按钮（与用户路径一致，不是直接调 API） */
    await page.click('.dc-toolbar .dc-btn[data-dshape="rect"]');
    const node = page.locator("#drawCanvasHost g.dnode").first();
    await expect(node).toBeVisible();

    const before = await page.evaluate(() => {
      const svg = document.getElementById("drawSvg");
      const d = dcActive();
      const n = d.nodes[0];
      const sr = svg.getBoundingClientRect();
      /* 世界坐标 → 屏幕坐标（与产品同一套 getScreenCTM 换算） */
      const pt = svg.createSVGPoint();
      pt.x = n.x + n.w / 2; pt.y = n.y + n.h / 2;
      const sc = pt.matrixTransform(svg.getScreenCTM());
      return { id: n.id, x: n.x, y: n.y, sx: sc.x, sy: sc.y, svgW: Math.round(sr.width) };
    });

    /* 真指针拖动（Playwright 的 mouse 走完整事件链：pointerdown/move/up） */
    const box = page.viewportSize();
    const cx = Math.min(Math.max(before.sx, 20), box.width - 20);
    const cy = Math.min(Math.max(before.sy, 20), box.height - 20);
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 40, cy + 30, { steps: 6 });
    await page.mouse.up();

    const after = await page.evaluate((id) => {
      const d = dcActive();
      const n = d.nodes.find((m) => m.id === id);
      return { x: n.x, y: n.y };
    }, before.id);
    expect(after.x, "拖动后 X 必须变化（窄屏不是死图）").not.toBe(before.x);
    expect(after.y, "拖动后 Y 必须变化").not.toBe(before.y);
    /* 10px 吸附：落点必须是 10 的整数倍 */
    expect(after.x % 10, "坐标应吸附到 10px 网格").toBe(0);
    expect(after.y % 10, "坐标应吸附到 10px 网格").toBe(0);
  });
});
