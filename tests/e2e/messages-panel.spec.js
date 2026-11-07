/**
 * messages-panel.spec.js —— 消息中心面板开合的真机守护（v3.7.156 修「永远打不开」）
 * ----------------------------------------------------------------------------
 * 缺陷史：#msgPanel 在 markup 里常驻 `u-hidden`（display:none），但开合逻辑只切内联
 * `style.display` —— 内联空值压不过 class，第一次点「开」设 display="" 后 class 仍把它
 * 藏住，第二次点又走开分支……面板从任何一次点击起都没真正可见过。点测审计
 * （仓外 L4b）抓到「有 mutation 无视觉变化」的信号，jsdom/vitest 侧看不见排版，
 * 只能在这里用真浏览器钉住「点开真的可见、再点真的隐藏」。
 *
 * 对应仓内口径：B5 块自述「面板用 is-open 类开合（不用内联 style，窄屏基线由 CSS 决定）」
 * ——本面板随该口径一并类化。
 *
 * 守护策略同其它 e2e：默认跳过，E2E=1 才跑。
 */
const { test, expect } = require("./_fixture");

const APP_URL = "./agent-workbench.html";

const visState = () => {
  const el = document.querySelector("#msgPanel");
  if (!el) return { missing: true };
  const b = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  return {
    missing: false,
    display: cs.display,
    w: Math.round(b.width),
    h: Math.round(b.height),
    hasHiddenClass: el.classList.contains("u-hidden"),
  };
};

test.describe("消息中心面板开合（v3.7.156）", () => {
  test("点开真可见、再点真隐藏", async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForSelector("#main", { timeout: 20_000 });
    await page.waitForTimeout(600);

    const before = await page.evaluate(visState);
    expect(before.missing).toBe(false);
    // 初始态：隐藏（class 口径下由 u-hidden 保证，不依赖内联 style）
    expect(before.hasHiddenClass).toBe(true);
    expect(before.display).toBe("none");

    await page.click("#btnMessages");
    await page.waitForTimeout(200);
    const open = await page.evaluate(visState);
    expect(open.hasHiddenClass).toBe(false);
    expect(open.display).not.toBe("none");
    expect(open.w).toBeGreaterThan(0); // 不只是 class 摘掉 —— 排版真的把它铺开了
    expect(open.h).toBeGreaterThan(0);

    await page.click("#btnMessages");
    await page.waitForTimeout(150);
    const closed = await page.evaluate(visState);
    expect(closed.hasHiddenClass).toBe(true);
    expect(closed.display).toBe("none");
  });

  test("点开消息条目动作后面板自动关闭", async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForSelector("#main", { timeout: 20_000 });
    await page.waitForTimeout(600);

    await page.click("#btnMessages");
    await page.waitForTimeout(200);
    const open = await page.evaluate(visState);
    expect(open.hasHiddenClass).toBe(false);

    // 消息条目里的动作（.msg-item-action）执行后应顺手把面板关掉
    const item = await page.locator(".msg-item-action").first();
    const hasItem = (await item.count()) > 0;
    if (hasItem) {
      await item.click();
      await page.waitForTimeout(250);
      const after = await page.evaluate(visState);
      expect(after.hasHiddenClass).toBe(true);
      expect(after.display).toBe("none");
    } else {
      // 无条目时不点条目，但断言面板仍可正常关闭（不因数据为空而失守）
      await page.click("#btnMessages");
      await page.waitForTimeout(150);
      const after = await page.evaluate(visState);
      expect(after.hasHiddenClass).toBe(true);
    }
  });
});
