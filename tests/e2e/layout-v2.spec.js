/**
 * layout-v2.spec.js —— 布局 v2（底部对话坞 + 右栏今日任务）的真实浏览器判据
 * ----------------------------------------------------------------------------
 * jsdom 只能证明"元素在 DOM 里"，证明不了"坞在主列底部、任务轨在右栏、没有横向溢出"。
 * 这里只用可测几何：盒子位置、宽度对齐、视口内、命中测试，并自带反向对照（尺子要能判红）。
 *
 * 断点契约（与 DESIGN-SYSTEM 一致）：≥1024 三栏；768–1023 任务轨滑出；≤767 聊天保持右抽屉。
 */
const { test, expect } = require("./_fixture");
const { waitMainRendered } = require("./helpers/wait-settled.cjs");

const APP_URL = "./agent-workbench.html";

const ensureExpanded = async (page) => {
  const collapsed = await page.evaluate(() => document.getElementById("chatPanel").classList.contains("collapsed"));
  if (collapsed) await page.click("#chatPanelCollapse");
};

const geom = (page) => page.evaluate(() => {
  const r = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const b = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return { left: Math.round(b.left), right: Math.round(b.right), top: Math.round(b.top),
      bottom: Math.round(b.bottom), width: Math.round(b.width), height: Math.round(b.height),
      position: cs.position, display: cs.display, transform: cs.transform };
  };
  return {
    vw: window.innerWidth, vh: window.innerHeight,
    sw: document.scrollingElement.scrollWidth,
    main: r("#main"), wrap: r(".main-wrap"), chat: r("#chatPanel"),
    rail: r("#taskRail"), body: r(".body"), side: r("#side"),
  };
});

test.describe("桌面 1440", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("对话坞在主列底部且与主列同宽；任务轨在右栏", async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForSelector("#main");
    await waitMainRendered(page);
    /* 布局 v2 默认只留输入行（历史收起）；本用例量的是展开态几何 */
    await ensureExpanded(page);
    const g = await geom(page);
    expect(g.chat.position, "对话面板必须是贴底坞（sticky）").toBe("sticky");
    expect(g.chat.left, "坞左缘应与主列左缘对齐").toBe(g.wrap.left);
    /* .main-wrap 有 scrollbar-gutter:stable，会预留约 10px 滚动条槽 —— 允许 ≤12px 的差 */
    expect(g.chat.right).toBeLessThanOrEqual(g.wrap.right);
    expect(g.wrap.right - g.chat.right, "坞右缘应贴主列（扣除滚动条槽）").toBeLessThanOrEqual(12);
    expect(g.chat.top, "坞应在主区之后（不是并排）").toBeGreaterThan(g.main.top);
    expect(g.chat.bottom, "坞底应贴视口底").toBeLessThanOrEqual(g.vh + 1);
    expect(g.chat.height, "坞应占可见高度").toBeGreaterThan(60);

    expect(g.rail, "≥1024 任务轨应常驻").toBeTruthy();
    expect(g.rail.left, "任务轨应在主列右侧").toBeGreaterThanOrEqual(g.wrap.right - 1);
    expect(g.sw, "不得出现横向溢出").toBeLessThanOrEqual(g.vw + 1);
  });

  test("折叠任务轨后主列变宽，顶栏按钮可再展开", async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForSelector("#main");
    await waitMainRendered(page);
    const before = (await geom(page)).wrap.width;
    await page.click("#taskRailCollapse");
    await page.waitForFunction(() => document.querySelector(".body").classList.contains("rail-collapsed"));
    const mid = await geom(page);
    expect(mid.rail.width, "折叠后任务轨应为 0 宽（display:none）").toBe(0);
    expect(mid.wrap.width, "折叠后主列应更宽").toBeGreaterThan(before + 100);
    await page.click("#btnTaskRail");
    await page.waitForFunction(() => !document.querySelector(".body").classList.contains("rail-collapsed"));
    expect((await geom(page)).wrap.width).toBe(before);
  });

  test("对话折叠 = 只留输入行，历史收起；再点恢复", async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForSelector("#main");
    await waitMainRendered(page);
    await ensureExpanded(page);
    const before = await geom(page);
    await page.click("#chatPanelCollapse");
    await page.waitForFunction(() => document.getElementById("chatPanel").classList.contains("collapsed"));
    const after = await geom(page);
    expect(after.chat.height, "折叠后坞应变矮").toBeLessThan(before.chat.height);
    expect(await page.isVisible("#chatForm"), "输入行必须还在").toBe(true);
    expect(await page.isVisible("#chat"), "历史区应隐藏").toBe(false);
    await page.click("#chatPanelCollapse");
    await page.waitForFunction(() => !document.getElementById("chatPanel").classList.contains("collapsed"));
    expect((await geom(page)).chat.height).toBe(before.chat.height);
  });

  test("反向对照：尺子能判出「没对齐」的盒子", async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForSelector("#main");
    const ok = await page.evaluate(() => {
      const wrap = document.querySelector(".main-wrap").getBoundingClientRect();
      const mk = (dx) => {
        const d = document.createElement("div");
        d.style.cssText = "position:fixed;top:40px;height:10px;width:100px;left:" + (wrap.left + dx) + "px";
        document.body.appendChild(d);
        const b = d.getBoundingClientRect();
        const aligned = Math.abs(b.left - wrap.left) <= 1;
        d.remove();
        return aligned;
      };
      return { aligned: mk(0), shifted: mk(40) };
    });
    expect(ok.aligned, "对齐样本应判绿").toBe(true);
    expect(ok.shifted, "偏移 40px 的样本应判红（否则尺子没射程）").toBe(false);
  });
});

test.describe("平板 800（任务轨滑出）", () => {
  test.use({ viewport: { width: 800, height: 900 } });

  test("任务轨默认不可见；顶栏按钮滑出，Esc 关闭；无横向溢出", async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForSelector("#main");
    await waitMainRendered(page);
    let g = await geom(page);
    expect(g.rail.transform && g.rail.transform !== "none", "应移出视口（translate）").toBe(true);
    expect(g.sw).toBeLessThanOrEqual(g.vw + 1);
    await page.click("#btnTaskRail");
    await page.waitForFunction(() => document.getElementById("taskRail").classList.contains("open"));
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.getElementById("taskRail").classList.contains("open"));
    g = await geom(page);
    expect(g.sw, "滑出/关闭都不该产生横向滚动").toBeLessThanOrEqual(g.vw + 1);
  });

  test("对话坞仍在主列底部（不是右栏）", async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForSelector("#main");
    await waitMainRendered(page);
    await ensureExpanded(page);
    const g = await geom(page);
    expect(g.chat.position).toBe("sticky");
    expect(g.chat.left).toBe(g.wrap.left);
    expect(g.chat.right).toBeLessThanOrEqual(g.wrap.right);
    expect(g.wrap.right - g.chat.right).toBeLessThanOrEqual(12);
    expect(g.chat.top).toBeGreaterThan(g.main.top);
  });
});

test.describe("手机 375（聊天保持右抽屉）", () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test("底栏仍在、无横向溢出、任务轨可从顶栏滑出", async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForSelector("#main");
    await waitMainRendered(page);
    const g = await geom(page);
    expect(g.sw).toBeLessThanOrEqual(g.vw + 1);
    expect(await page.isVisible("#mobBar")).toBe(true);
    await page.click("#btnTaskRail");
    await page.waitForFunction(() => document.getElementById("taskRail").classList.contains("open"));
    await page.mouse.click(8, 300); /* 点遮罩的可见区域：轨道铺满右侧，元素中心其实落在轨道上 */
    await page.waitForFunction(() => !document.getElementById("taskRail").classList.contains("open"));
    expect((await geom(page)).sw).toBeLessThanOrEqual(g.vw + 1);
  });
});
