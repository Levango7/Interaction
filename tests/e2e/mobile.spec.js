/**
 * 移动端（竖屏 375×667）关键路径 E2E
 * ----------------------------------------------------------------------------
 * 与 workflow.spec.js（桌面全链路）互补：≤767px 时侧栏 #side 不可见，
 * 移动端 IA 是「底部 5 组导航 #mobBar + 底部抽屉 #sideSheet（复用侧栏菜单树）」。
 *
 * 覆盖：① 启动无横向溢出 + 底栏 5 组可见 + 侧栏隐藏
 *       ② 场景组 → 抽屉 → 切到「办公」（active 变 office）
 *       ③ AI 组 → 抽屉 → AI 配置页（#cfgEnabled 可见）
 *       ④ 引导 modal 的移动端布局不变量（v3.7.68，见文件末尾的 describe）
 *
 * 本机以 file:// + 375×667 实测过上述三条路径后才写成断言（非推断）。
 * 守护策略同 workflow.spec：默认跳过，E2E=1 才跑。
 */
/* 等待策略（与 workflow.spec 一致，依据 CI 日志实证的偶发）：
   等「导航/视图切换 → 界面刷新」用 10s；等静态元素用 5s（快速失败更利于定位）。
   CI 日志实证过 workflow.spec.js:87 的 .kcard 文本断言在 5s 下超时（仅 tablet 那一次、本地连跑 5 次全过）→ 负载偶发。 */
const { test, expect } = require("./_fixture");

const APP_URL = "./agent-workbench.html";

test.describe("移动端（竖屏 375×667）", () => {
  test.beforeAll(() => {
    test.skip(!process.env.E2E, "set E2E=1 to run");
  });

  test.beforeEach(async ({ page }) => {
    page.on("dialog", async (d) => { try { await d.accept(); } catch (e) { /* ignore */ } });
  });

  test("启动：无横向溢出 + 底部 5 组导航可见 + 侧栏隐藏", async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForSelector("#mobBar", { timeout: 15_000 });

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow, "文档横向溢出应为 0（v3.7.6 修过窄屏顶栏溢出 8px）").toBeLessThanOrEqual(0);

    const groups = await page.locator("#mobBar [data-mob-group]").count();
    expect(groups, "底部导航应有 5 组").toBeGreaterThanOrEqual(5);

    const visible = await page.locator("#mobBar [data-mob-group]:visible").count();
    expect(visible, "5 组都应可见").toBeGreaterThanOrEqual(5);

    await expect(page.locator("#side"), "移动端侧栏应隐藏").toBeHidden();
  });

  test("底部导航切换场景：场景组 → 抽屉 → 办公", async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForSelector("#mobBar", { timeout: 15_000 });

    await page.click('#mobBar [data-mob-group="scenario"]');
    await page.waitForSelector("#sideSheet.open", { timeout: 10_000 });

    const office = page.locator('#sideSheetBody [data-sc="office"]').first();
    await expect(office).toBeVisible();
    await office.click();

    await expect
      .poll(() => page.evaluate(() => (typeof active !== "undefined" ? active : "")), { timeout: 5_000 })
      .toBe("office");
  });

  test("底部导航进 AI 配置页：AI 组 → 抽屉 → AI 页", async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForSelector("#mobBar", { timeout: 15_000 });

    await page.click('#mobBar [data-mob-group="ai"]');
    await page.waitForSelector("#sideSheet.open", { timeout: 10_000 });

    await page.click('#sideSheetBody [data-menu="feat-ai"]');
    await expect(page.locator("#cfgEnabled"), "AI 配置页的启用开关应可见").toBeVisible({ timeout: 10_000 });
  });
});

/**
 * 移动端引导 modal 的布局不变量（v3.7.68）
 * ----------------------------------------------------------------------------
 * 缺陷来源：@media(max-width:767px) 把 .onboard-card 拉到 height:100dvh，但内容仍按文档流顶对齐。
 * 375×667 真机实测三步都是「主按钮悬在屏幕中部 y≈265–309，下方 358px 一整块空白面板」。
 * 修法：卡片改 flex 列，.onboard-step 与 .onboard-actions 各吃一个 margin-top:auto
 *      → 剩余空间上下平分（内容居中、操作贴底）。
 * 为什么这样断言：单看「按钮贴底」会漏掉空白本身，所以把「内容上方留白 ≈ 内容到按钮的留白」
 * 写成不变量（回归时 gapAbove=20 / gapToActions=358，差 338px，阈值 40px 足够狠也足够松）。
 * 阈值依据：本机 Pixel 5 预设实测 gapAbove 177–229、gapToActions 171–229、
 *          vh-actions.bottom=20（即 padding-bottom）、按钮高 44（WCAG 2.5.5 下限）。
 */
test.describe("移动端引导 modal（375×667 布局不变量）", () => {
  test.beforeAll(() => {
    test.skip(!process.env.E2E, "set E2E=1 to run");
  });

  /* 夹具默认写入 wb_agent_onboarded=true 让页面进稳态；引导本身要用例必须把它抹掉。
     必须是 addInitScript 而不是「clear 后 reload」：夹具那条 initScript 在**每次导航**前都会重写
     true（file:// 全量跑实测：改成 clear+reload 后三条用例全部等不到 modal，20s 超时），
     而 initScript 按注册顺序执行，所以这条排在夹具之后、应用脚本之前 —— 顺序即语义，无竞态。 */
  const freshOnboarding = async (page) => {
    await page.addInitScript(() => { try { localStorage.removeItem("wb_agent_onboarded"); } catch (e) { /* 存储不可用 */ } });
    await page.goto(APP_URL);
    await page.waitForSelector("#onboardModal", { state: "attached", timeout: 20_000 });
  };

  const geometry = (page) => page.evaluate(() => {
    const card = document.querySelector(".onboard-card");
    const step = card.querySelector(".onboard-step");
    const acts = card.querySelector(".onboard-actions");
    const c = card.getBoundingClientRect(), s = step.getBoundingClientRect(), a = acts.getBoundingClientRect();
    const bodyBottom = Math.max(0, ...[...card.children]
      .filter((el) => el !== acts).map((el) => el.getBoundingClientRect().bottom));
    return {
      vh: window.innerHeight, vw: window.innerWidth,
      cardH: c.height,
      actionsTop: a.top, actionsBottom: a.bottom,
      gapAbove: s.top - c.top,
      gapToActions: a.top - bodyBottom,
      btnHeights: [...acts.querySelectorAll("button")].map((b) => b.getBoundingClientRect().height),
      hOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });

  test("第 1 步：卡片满屏、操作贴底落在拇指区、内容居中不留空白面板", async ({ page }) => {
    await freshOnboarding(page);
    const g = await geometry(page);
    expect(g.cardH, "移动端引导卡片应占满视口高").toBeGreaterThanOrEqual(g.vh - 2);
    expect(g.vh - g.actionsBottom, "操作区应贴底（只留 padding-bottom）").toBeLessThanOrEqual(32);
    expect(g.actionsTop, "主按钮应落在拇指区（视口下方 40% 内）").toBeGreaterThanOrEqual(g.vh * 0.6);
    expect(Math.abs(g.gapAbove - g.gapToActions),
      "内容上下留白应大致相等；差距大 = 又退回顶对齐 + 大片空白").toBeLessThanOrEqual(40);
    for (const h of g.btnHeights) expect(h, "按钮高度应 ≥44px（WCAG 2.5.5）").toBeGreaterThanOrEqual(44);
    expect(g.hOverflow, "不应有横向溢出").toBeLessThanOrEqual(0);
  });

  test("第 3 步（内容最少的一步）同样成立", async ({ page }) => {
    await freshOnboarding(page);
    await page.click("#onboardDone");
    await page.waitForSelector("#onboardTrigger", { timeout: 10_000 });
    await page.click("#onboardNext");
    await page.waitForSelector("#onboardConfig", { timeout: 10_000 });
    const g = await geometry(page);
    expect(g.vh - g.actionsBottom, "操作区应贴底").toBeLessThanOrEqual(32);
    expect(g.actionsTop, "主按钮应落在拇指区").toBeGreaterThanOrEqual(g.vh * 0.6);
    expect(Math.abs(g.gapAbove - g.gapToActions),
      "内容少的步骤更不该出现「上方挤着、下方一整块空白」").toBeLessThanOrEqual(40);
    for (const h of g.btnHeights) expect(h, "按钮高度应 ≥44px").toBeGreaterThanOrEqual(44);
  });

  test("跳过引导后遮罩消失、主界面可交互", async ({ page }) => {
    await freshOnboarding(page);
    await page.click("#onboardSkip");
    await expect(page.locator(".onboard-modal")).toHaveCount(0);
    await expect(page.locator("#taskForm")).toBeVisible();
  });
});
