/**
 * main-cta.spec.js —— 首屏主 CTA 的真实浏览器守护（2026-10-20）
 * ----------------------------------------------------------------------------
 * 背景：首屏此前唯一 CTA 是「高级报表」，而主操作「新建任务」的 i18n 键
 * `top.addTask` 已存在却零引用（用户拿不到"3 秒记一件事"的入口）。
 * 本轮补了 #btnNewTask → office 场景 + 聚焦标题输入，这里用真浏览器钉住三件事：
 *   ① 三种视口下按钮**可见且不溢出**页头容器（元素级，不是文档级）；
 *   ② 点击后确实切到 office（任务表单出现）；
 *   ③ 焦点落在标题输入框（"点了就能打字"，不是只切页）。
 * 默认跳过，E2E=1 才跑（同其它 e2e 约定）。
 */
const { test, expect } = require("./_fixture");

const APP_URL = "./agent-workbench.html";
const VPS = [
  { w: 1280, h: 800 },
  { w: 768, h: 1024 },
  { w: 375, h: 700 },
];

for (const vp of VPS) {
  test(`首屏主 CTA @${vp.w}px：可见、不溢出、点击进任务场景并聚焦标题`, async ({ page }) => {
    await page.setViewportSize({ width: vp.w, height: vp.h });
    await page.goto(APP_URL);
    /* CTA 在「主页/overview」页；新用户默认落在 office 场景（`let active = load(PREFIX+"active","office")`），
       那里本身就有任务表单。本 spec 用应用自己的 setActive/render 打开展示该页
       （导航行为归 nav-pages-smoke.spec.js，不在这里重复测）。 */
    await page.evaluate(() => { setActive("overview"); render(); });
    await page.waitForFunction(() => !!document.querySelector("#btnNewTask"), null, { timeout: 15000 });

    const btn = page.locator("#btnNewTask");
    await expect(btn).toBeVisible();
    await expect(btn).toContainText("新建任务");

    // 元素级溢出：按钮必须完整落在页头容器内（±1px 容差）
    const out = await btn.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const p = el.parentElement.getBoundingClientRect();
      return { overRight: r.right - p.right, overLeft: p.left - r.left, w: r.width, h: r.height };
    });
    expect(out.overRight, "CTA 不得溢出页头右侧").toBeLessThanOrEqual(1);
    expect(out.overLeft, "CTA 不得溢出页头左侧").toBeLessThanOrEqual(1);
    expect(out.w).toBeGreaterThan(0);
    expect(out.h).toBeGreaterThan(0);

    await btn.click();
    // 切到 office 且标题输入框获得焦点
    await page.waitForFunction(
      () => document.querySelector('#taskForm [name="title"]') &&
        document.activeElement === document.querySelector('#taskForm [name="title"]'),
      null, { timeout: 10000 });
    const focused = await page.evaluate(() => ({
      name: document.activeElement && document.activeElement.name,
      hasForm: !!document.querySelector("#taskForm"),
    }));
    expect(focused.hasForm, "应已进入含任务表单的场景").toBe(true);
    expect(focused.name, "焦点应落在任务标题").toBe("title");
  });
}
