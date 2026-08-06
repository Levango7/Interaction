/**
 * E2E 测试：Agent Workbench 完整用户流程
 *
 * 守护策略：默认跳过，避免 CI 超时。
 *   - npx playwright test            → 全部 skipped（process.env.E2E 未设）
 *   - E2E=1 npx playwright test      → 真正运行
 *
 * 注：Playwright 无 describe.skipIf API（那是 Vitest 语法），
 *   这里用 beforeAll + test.skip 等价实现"整个 suite 条件跳过"，
 *   语义与 describe.skipIf(!process.env.E2E, ...) 完全一致。
 *
 * 覆盖流程（test.step 组织）：
 *   启动应用 → onboarding 跳过 → 创建任务 → 切场景 → 完成任务
 *   → 查看统计 → 打开设置 → 编辑习惯链 → AI 对话(mock) → 导出数据
 *
 * 选择器策略：优先用现有 id/class（应用未暴露 data-testid）。
 *   启动有异步初始化（initCrypto / SW 注册），用 waitForSelector 等关键元素。
 */
const { test, expect } = require("@playwright/test");

const APP_URL = "./agent-workbench.html";

test.describe("E2E tests (set E2E=1 to run)", () => {
  // 等价于 describe.skipIf(!process.env.E2E, ...)
  // 在 beforeAll 里 test.skip 会跳过整个 suite 的所有 test
  test.beforeAll(() => {
    test.skip(!process.env.E2E, "set E2E=1 to run");
  });

  // 自动处理 alert()（saveCfg 成功会 alert("已保存...")）
  test.beforeEach(async ({ page }) => {
    page.on("dialog", async (d) => {
      try { await d.accept(); } catch (e) { /* ignore */ }
    });
  });

  test("完整用户流程：启动→onboarding→建任务→切场景→完成任务→统计→设置→习惯链→AI对话→导出", async ({ page }) => {
    // ---------- 1. 启动应用 ----------
    await test.step("启动应用并等待侧边栏渲染", async () => {
      await page.goto(APP_URL);
      // 侧边栏 #side 是静态 HTML，启动时立即可用；但主区 render() 是异步（startup IIFE）
      // 等待侧边栏出现 nav-item（renderSide 执行后的标志）
      await page.waitForSelector("#side .nav-item", { timeout: 15_000 });
      // 等待 onboarding modal 或主区看板出现（二者必居其一）
      await page.waitForSelector("#onboardModal, #taskForm", { timeout: 10_000 });
    });

    // ---------- 2. onboarding 跳过 ----------
    await test.step("onboarding 三步跳过", async () => {
      // 若未触发 onboarding（非首次启动），则 #onboardModal 不存在，直接返回
      const onboard = await page.$("#onboardModal");
      if (!onboard) return;
      // 三步引导：step1 跳过 → step2，step2 跳过 → step3，step3 跳过 → 完成
      // 每步点 #onboardSkip（同步重新渲染，新按钮立即可用）
      for (let i = 0; i < 3; i++) {
        await page.locator("#onboardSkip").click();
        // 等待 modal 重新渲染或关闭（同步操作，150ms 足够）
        await page.waitForTimeout(150);
      }
      // 引导完成后主区渲染，等待任务表单出现
      await page.waitForSelector("#taskForm", { timeout: 10_000 });
    });

    // ---------- 3. 创建任务 ----------
    await test.step("在办公场景创建任务", async () => {
      // 确保在办公场景（点侧边栏 office）
      await page.click('#side .nav-item[data-sc="office"]');
      await page.waitForSelector("#taskForm", { timeout: 5_000 });
      // 填标题并提交
      await page.fill('#taskForm input[name="title"]', "E2E测试任务-办公");
      await page.selectOption('#taskForm select[name="priority"]', "P1");
      await page.click('#taskForm button[type="submit"]');
      // 等待看板卡片出现，验证任务创建成功
      // 注：seed 播种了默认任务，看板可能有多张卡片；用 locator 过滤含新建标题的卡片
      await page.waitForSelector(".kcard", { timeout: 5_000 });
      await expect(page.locator(".kcard", { hasText: "E2E测试任务-办公" })).toBeVisible({ timeout: 5_000 });
    });

    // ---------- 4. 切场景 ----------
    await test.step("切换到编程场景并创建任务", async () => {
      await page.click('#side .nav-item[data-sc="code"]');
      await page.waitForSelector("#taskForm", { timeout: 5_000 });
      // 创建一个编程任务，便于后续完成
      await page.fill('#taskForm input[name="title"]', "E2E测试任务-编程");
      await page.click('#taskForm button[type="submit"]');
      await page.waitForSelector(".kcard", { timeout: 5_000 });
      await expect(page.locator(".kcard", { hasText: "E2E测试任务-编程" })).toBeVisible({ timeout: 5_000 });
    });

    // ---------- 5. 完成任务 ----------
    await test.step("完成任务（todo→doing→done）", async () => {
      // 当前在编程场景，刚建的 P2 任务在 todo 列
      // 点 → 进行中
      await page.waitForSelector('[data-move$=":doing"]', { timeout: 5_000 });
      const moveTodoBtn = page.locator(".kcard").filter({ hasText: "E2E测试任务-编程" }).locator('[data-move$=":doing"]').first();
      await moveTodoBtn.click();
      // doing 列出现 → 完成按钮
      await page.waitForSelector('[data-move$=":done"]', { timeout: 5_000 });
      const moveDoneBtn = page.locator(".kcard").filter({ hasText: "E2E测试任务-编程" }).locator('[data-move$=":done"]').first();
      await moveDoneBtn.click();
      // 验证任务进入 done 列（看板里 done 列含该卡片）
      await page.waitForTimeout(300); // render() 同步，但保险等一下
      const doneCol = page.locator(".kcol").filter({ hasText: "已完成" });
      await expect(doneCol).toContainText("E2E测试任务-编程");
    });

    // ---------- 6. 查看统计 ----------
    await test.step("查看统计视图", async () => {
      await page.click('#side .nav-item[data-sc="stats"]');
      // 统计视图：有任务时显示 .stats-cards，无任务时显示 .no-stats 空状态
      // 我们已建并完成任务，应有 .stats-cards
      await page.waitForSelector(".stats-cards, .no-stats", { timeout: 5_000 });
      const hasStatsCards = await page.$(".stats-cards");
      if (hasStatsCards) {
        // 验证关键指标卡片渲染（总任务数 / 已完成 等）
        await expect(page.locator(".stats-card").first()).toBeVisible();
        const cardCount = await page.locator(".stats-card").count();
        expect(cardCount).toBeGreaterThanOrEqual(1);
      }
    });

    // ---------- 7. 打开设置 ----------
    await test.step("打开设置抽屉", async () => {
      await page.click("#btnGear");
      // 抽屉加 .open class
      await page.waitForSelector("#drawer.open", { timeout: 5_000 });
      await expect(page.locator("#drawer")).toHaveClass(/open/);
    });

    // ---------- 8. 编辑习惯链 ----------
    await test.step("在设置抽屉添加一条新习惯链", async () => {
      // 习惯链管理面板在抽屉内
      await page.waitForSelector("#chainAddBtn", { timeout: 5_000 });
      // 选源场景（office）、输入关键词、选目标场景（life）
      await page.selectOption("#chainAddSrc", "office");
      await page.fill("#chainAddKw", "E2E关键词");
      await page.selectOption("#chainAddDst", "life");
      // 记录添加前的链数量
      const beforeCount = await page.locator("#linksBox .chain-row").count();
      await page.click("#chainAddBtn");
      // 等待新链行出现（renderLinksBox 重新渲染）
      await page.waitForFunction(
        (prev) => document.querySelectorAll("#linksBox .chain-row").length > prev,
        beforeCount,
        { timeout: 5_000 }
      );
      const afterCount = await page.locator("#linksBox .chain-row").count();
      expect(afterCount).toBeGreaterThan(beforeCount);
      // 验证新链含关键词
      const linksText = await page.textContent("#linksBox");
      expect(linksText).toContain("E2E关键词");
    });

    // ---------- 9. AI 对话（mock） ----------
    await test.step("启用 AI 并进行 mock 对话", async () => {
      // 仍在设置抽屉。勾选启用 AI
      await page.check("#cfgEnabled");
      // 填写 profile 表单
      await page.fill("#cfgName", "E2E-Mock");
      await page.fill("#cfgBase", "https://api.openai.com/v1");
      await page.fill("#cfgKey", "sk-e2e-mock-key");
      await page.fill("#cfgModel", "gpt-4o-mini");
      // 保存（会 alert + closeDrawer + render）
      await page.click("#cfgSave");
      // 等 alert 被自动 accept，抽屉关闭
      await page.waitForSelector("#drawer:not(.open)", { timeout: 5_000 });

      // 切到办公场景，应有聊天框
      await page.click('#side .nav-item[data-sc="office"]');
      await page.waitForSelector("#chatForm", { timeout: 5_000 });

      // mock fetch 拦截：拦截 /chat/completions 返回假回复
      const mockReply = "这是 E2E mock 的 AI 回复";
      await page.route("**/chat/completions", (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            choices: [{ message: { role: "assistant", content: mockReply } }],
          }),
        })
      );

      // 输入消息并发送
      await page.fill('#chatForm input[name="msg"]', "你好");
      await page.click('#chatForm button[type="submit"]');
      // 等待回复渲染（#chat 里出现 .msg.assistant 含 mockReply）
      await page.waitForSelector(`#chat .msg.assistant`, { timeout: 10_000 });
      // 验证回复文本含 mock 内容（容错：可能含 markdown 包裹）
      const chatText = await page.textContent("#chat");
      expect(chatText).toContain(mockReply);
    });

    // ---------- 10. 导出数据 ----------
    await test.step("导出 JSON 触发下载", async () => {
      // 重新打开设置抽屉（上一步保存后已关闭）
      await page.click("#btnGear");
      await page.waitForSelector("#drawer.open", { timeout: 5_000 });
      await page.waitForSelector("#btnExport", { timeout: 5_000 });

      // 监听 download 事件
      const downloadPromise = page.waitForEvent("download", { timeout: 10_000 });
      await page.click("#btnExport");
      const download = await downloadPromise;
      // 验证下载文件名符合 agent-workbench-backup-YYYY-MM-DD.json
      const suggested = download.suggestedFilename();
      expect(suggested).toMatch(/^agent-workbench-backup-\d{4}-\d{2}-\d{2}\.json$/);
    });
  });

  test("smoke：应用可启动且渲染侧边栏四个场景", async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForSelector("#side .nav-item", { timeout: 15_000 });
    // 处理 onboarding（若存在）以便主区渲染
    const onboard = await page.$("#onboardModal");
    if (onboard) {
      for (let i = 0; i < 3; i++) {
        await page.waitForSelector("#onboardSkip", { timeout: 5_000 });
        await page.click("#onboardSkip");
        await page.waitForTimeout(200);
      }
    }
    // 侧边栏应含 overview / stats / office / code / study / life 六个 nav-item
    const navCount = await page.locator("#side .nav-item").count();
    expect(navCount).toBeGreaterThanOrEqual(6);
    // 验证四个场景按钮存在
    for (const sc of ["office", "code", "study", "life"]) {
      await expect(page.locator(`#side .nav-item[data-sc="${sc}"]`)).toBeVisible();
    }
  });
});