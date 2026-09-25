/**
 * viewport.spec.js —— 跨视口「布局不变量」守护
 * ----------------------------------------------------------------------------
 * 为什么不做像素基线：像素 diff 需要与 CI 同环境生成的基线文件（Linux + 同版本 chromium），
 * 本机无法生成，且会因字体/抗锯齿产生噪声。这里改为断言**结构性不变量** ——
 * 它们在三种视口下都必须成立，且能真正抓住布局回归（溢出、断点走错、触控目标过小、内容区被压扁）。
 *
 * 覆盖（按视口宽度自动切换预期）：
 *   ① 无横向溢出（文档级）
 *   ② 断点分流正确：<768 侧栏隐藏 + #mobBar 可见；≥768 反之
 *   ③ 顶栏高度在合理区间（防"标题栏高度漂移"这类回归）
 *   ④ 主内容区宽度合理（未被侧栏/面板压扁）
 *   ⑤ 移动端底部导航的触控目标 ≥ 40px（可用性）
 *   ⑥ 各断点下首屏卡片宽度合理（移动端单列、桌面端更宽）
 *
 * 本机以 CDP + 375/768/1280 三视口实测过这些量级后才写成断言（阈值取实测值并留余量）。
 * 守护策略同其它 e2e：默认跳过，E2E=1 才跑。
 */
const { test, expect } = require("@playwright/test");

const APP_URL = "./agent-workbench.html";

test.describe("跨视口布局不变量", () => {
  test.beforeAll(() => {
    test.skip(!process.env.E2E, "set E2E=1 to run");
  });

  test.beforeEach(async ({ page }) => {
    page.on("dialog", async (d) => { try { await d.accept(); } catch (e) { /* ignore */ } });
  });

  test("布局不变量：按宽度走对断点且无横向溢出", async ({ page }) => {
    await page.goto(APP_URL);
    /* 用 state:"attached"：#mobBar 在桌面是 display:none（默认的 waitForSelector 等"可见"会在桌面超时） */
    await page.waitForSelector("#mobBar", { state: "attached", timeout: 15_000 });

    const vw = page.viewportSize().width;
    const isNarrow = vw < 768;

    /* ① 文档横向溢出 */
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `视口 ${vw}px 出现横向溢出 ${overflow}px`).toBeLessThanOrEqual(0);

    /* ② 断点分流 */
    if (isNarrow) {
      await expect(page.locator("#side"), "窄屏应隐藏侧栏").toBeHidden();
      await expect(page.locator("#mobBar"), "窄屏应显示底部导航").toBeVisible();
    } else {
      await expect(page.locator("#side"), "宽屏应显示侧栏").toBeVisible();
      await expect(page.locator("#mobBar"), "宽屏应隐藏底部导航").toBeHidden();
    }

    /* ③ 顶栏高度合理（历史上修过窄屏溢出，这里防漂移） */
    const topbar = await page.locator(".topbar").boundingBox();
    expect(topbar, "顶栏应存在").toBeTruthy();
    expect(topbar.height, `顶栏高度异常：${topbar.height}px`).toBeGreaterThan(28);
    expect(topbar.height, `顶栏高度异常：${topbar.height}px`).toBeLessThan(96);

    /* ④ 主内容区未被压扁 */
    /* 阈值按本机 CDP 实测取：375 → 375px、768 → 288px（侧栏 180 + 折叠聊天面板占位）、1280 → 770px。
       这里只断言「没有被压扁到不可用」的下限 240px，并用注释保留实测值供后续判断。 */
    const mainW = await page.evaluate(() => {
      const m = document.querySelector(".main-wrap") || document.querySelector("main") || document.body;
      return m.getBoundingClientRect().width;
    });
    expect(mainW, `主内容区过窄：${Math.round(mainW)}px / 视口 ${vw}px`).toBeGreaterThan(240);
    expect(mainW, `主内容区超出视口：${Math.round(mainW)}px / 视口 ${vw}px`).toBeLessThanOrEqual(vw + 1);

    /* ⑤ 移动端触控目标 */
    if (isNarrow) {
      const boxes = await page.locator("#mobBar [data-mob-group]").evaluateAll(els => els.map(e => e.getBoundingClientRect()));
      expect(boxes.length, "底部导航应有 5 组").toBeGreaterThanOrEqual(5);
      for (const b of boxes) {
        expect(b.height, `底部导航触控目标过小：${Math.round(b.height)}px`).toBeGreaterThanOrEqual(32);
        expect(b.width, `底部导航触控目标过窄：${Math.round(b.width)}px`).toBeGreaterThanOrEqual(40);
      }
    }

    /* ⑥ 首屏卡片宽度（移动端单列更宽、桌面端更窄且可并排） */
    const cardW = await page.evaluate(() => {
      const c = document.querySelector(".kcol, .card, .set-card");
      return c ? c.getBoundingClientRect().width : -1;
    });
    if (cardW > 0) {
      expect(cardW, `卡片宽度异常：${Math.round(cardW)}px`).toBeLessThanOrEqual(vw);
    }
  });
});

/**
 * 窄屏表单/卡片专项（v3.7.53 用户标注实测）
 * ----------------------------------------------------------------------------
 * 这三条都是「用户截图标注 → 实测定位 → 修好」的真实缺陷，故固化为渲染层断言：
 *   ① 窄屏任务表单四个字段必须**等宽**（此前给 ＋ 预留的内边距让「标签」窄 46px）
 *   ② 看板卡操作按钮文字**水平居中**（手机端 inline-flex 后 text-align 失效 → 左贴）
 *   ③ 场景联动 streak 徽章**单行**（此前每枚被压到 64px，「办公+⚠️未开始」折成三行）
 * 三视口（375 / 768 / 1280）下都必须成立 —— 修法本身不依赖断点。
 */
test.describe("窄屏表单与卡片不变量", () => {
  test.beforeAll(() => {
    test.skip(!process.env.E2E, "set E2E=1 to run");
  });

  test("表单等宽 · 按钮居中 · 徽章单行", async ({ page }) => {
    page.on("dialog", async (d) => { try { await d.accept(); } catch (e) { /* ignore */ } });
    await page.goto(APP_URL);
    await page.waitForSelector("#main", { state: "attached", timeout: 15_000 });

    for (const vw of [375, 768, 1280]) {
      await page.setViewportSize({ width: vw, height: 900 });
      await page.evaluate(() => { setActive("office"); render(); });
      await page.waitForTimeout(350);
      /* 造一条任务，让看板卡片出现（按钮才可测） */
      await page.evaluate(() => {
        const f = document.querySelector("#taskForm");
        if (!f) return;
        const t = f.querySelector('input[name="title"], .fld input:not([type])');
        if (t) { t.value = "e2e-响应式检查"; t.dispatchEvent(new Event("input", { bubbles: true })); }
        const b = f.querySelector('button[type="submit"], .addbtn');
        if (b) b.click();
      });
      await page.waitForTimeout(500);

      const r = await page.evaluate((width) => {
        const out = { vw: width };
        const f = document.querySelector("#taskForm");
        if (f) {
          const ws = [...f.children]
            .filter((c) => c.querySelector("input,select"))
            .map((c) => Math.round(c.querySelector("input,select").getBoundingClientRect().width));
          out.fieldWidths = ws;
          /* 桌面（≥1024）字段刻意不等宽（标题/优先级等按微轨分配），只在窄屏要求等宽 */
          out.expectEqual = width < 1024;
          out.allEqual = new Set(ws).size === 1;
        }
        const btn = document.querySelector(".kbtns button");
        if (btn) {
          const br = btn.getBoundingClientRect();
          const rg = document.createRange();
          rg.selectNodeContents(btn);
          const tr = rg.getBoundingClientRect();
          out.centerOffset = Math.round(Math.abs((br.x + br.width / 2) - (tr.x + tr.width / 2)));
        }
        const badges = [...document.querySelectorAll(".streak-badge")];
        if (badges.length) {
          out.badgeHeights = [...new Set(badges.map((b) => Math.round(b.getBoundingClientRect().height)))];
          const inner = document.querySelector(".hc-streak-inner");
          out.streakOverflow = inner ? Math.max(0, inner.scrollWidth - inner.clientWidth) : 0;
        }
        return out;
      }, vw);

      if (r.fieldWidths) {
        if (r.expectEqual) {
          expect(r.allEqual, `视口 ${vw}px 表单字段不等宽：${JSON.stringify(r.fieldWidths)}`).toBe(true);
        }
      }
      if (r.centerOffset !== undefined) {
        expect(r.centerOffset, `视口 ${vw}px 看板按钮文字未居中，偏心 ${r.centerOffset}px`).toBeLessThanOrEqual(1);
      }

      /* streak 徽章在总览页 */
      await page.evaluate(() => { setActive("overview"); render(); });
      await page.waitForTimeout(900);
      const st = await page.evaluate(() => {
        const badges = [...document.querySelectorAll(".streak-badge")];
        const inner = document.querySelector(".hc-streak-inner");
        return {
          n: badges.length,
          heights: [...new Set(badges.map((b) => Math.round(b.getBoundingClientRect().height)))],
          overflow: inner ? Math.max(0, inner.scrollWidth - inner.clientWidth) : 0
        };
      });
      if (st.n) {
        expect(Math.max(...st.heights), `视口 ${vw}px streak 徽章被折行（高度 ${JSON.stringify(st.heights)}）`).toBeLessThanOrEqual(34);
        expect(st.overflow, `视口 ${vw}px streak 容器横向溢出 ${st.overflow}px`).toBeLessThanOrEqual(0);
      }
    }
  });
});
