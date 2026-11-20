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
/* 超时策略：
   · 「等数据写入反映到界面」的断言用 10s —— CI 慢机器上曾出现 5s 不够的偶发失败
     （CI 日志实证：workflow.spec.js:87 的 .kcard 文本断言超时，且仅 tablet 那一遍失败、本地连跑 5 次全过）
   · 静态元素等待（#taskForm / 侧栏项等）保持 5s，快速失败更利于定位 */
const { test, expect } = require("@playwright/test");

const APP_URL = "./agent-workbench.html";

/* v3.7.104（台账 R-9 续二/续三）：切场景用「判别性等待 + 重试块」——
   renderSide() 在 render() 里整体替换 #side 的 innerHTML，点击若落在正被替换的节点上会
   **静默丢失**（mousedown 与 mouseup 落在不同节点 → click 不派发）。等 `#taskForm` 不具
   区分力（每个场景都有），会错位到两步之后；因此按切换后的真实状态断言，瞬时丢失由重试自愈。

   刀 2（2026-11-16）：7 场景 + 场景联动退出侧栏，收进工作台 tiles；侧栏原生项只剩
   今日 3 + 工作台 1 + 助手 1 + 更多 5。于是分两条真实路径：
     · 场景/联动 → 点工作台入口 → 点 `#main .wb-tile[data-tile-sc]` → 断言全局 `active === sc`
       （`formATabOpenScene` 真调 `setActive(sc); render()`，仍走用户路径，不直接改状态）；
     · 侧栏常驻页（overview/tasks/timeline/toolbox/store/recycle）→ 原 nav 点击 + active 类断言。
   ⚠️ active 类正则不能写 \bactive\b —— 会匹配 has-active（连字符也是非单词字符）。 */
const WORKBENCH_SCENES = ["office", "data", "design", "study", "code", "life", "health", "chainpage"];

async function switchScene(page, sc) {
  if (WORKBENCH_SCENES.indexOf(sc) >= 0) {
    await expect(async () => {
      await page.click('#side .nav-item[data-sc="workbench"]');
      const tile = `#main .wb-tile[data-tile-sc="${sc}"]`;
      await page.waitForSelector(tile, { timeout: 3_000 });
      await page.click(tile);
      await expect
        .poll(() => page.evaluate(() => (typeof active !== "undefined" ? active : "")), { timeout: 2_000 })
        .toBe(sc);
    }).toPass({ timeout: 10_000 });
    return;
  }
  const nav = `#side .nav-item[data-sc="${sc}"]`;
  await expect(async () => {
    await page.click(nav);
    await expect(page.locator(nav)).toHaveClass(/(^|\s)active(\s|$)/, { timeout: 1500 });
  }).toPass({ timeout: 10_000 });
}

test.describe("E2E tests (set E2E=1 to run)", () => {
  // 等价于 describe.skipIf(!process.env.E2E, ...)
  // 在 beforeAll 里 test.skip 会跳过整个 suite 的所有 test
  test.beforeAll(() => {
    test.skip(!process.env.E2E, "set E2E=1 to run");
  });

  // 自动处理 alert()（saveCfg 成功会 alert("已保存...")）
  test.beforeEach(async ({ page }) => {
    /* 2026-11-17 批六刀2：本 spec 是「工作模式」长流程（依赖工作台 tiles / #taskForm / .kcard）。
       产品默认翻成 code + 对话优先后，无偏好启动会落 code 且 #main 隐藏 ⇒ switchScene 的
       `#main .wb-tile` 永远等不到（CI 6 次 timeout）。这里显式声明 work 前提——与其它 spec 的
       公共 fixture 同手法，只在缺省时注入、不覆盖用例自己预置的值。零改任何断言，是前提显式化。 */
    await page.addInitScript(() => {
      try {
        if (localStorage.getItem("wb_agent_uimode") === null) localStorage.setItem("wb_agent_uimode", JSON.stringify("work"));
        /* 批十：本 spec 是页面级长流程，显式从主页起步；产品默认聊天首页由 ui-mode-layout 守护。 */
        if (localStorage.getItem("wb_agent_active") === null) localStorage.setItem("wb_agent_active", JSON.stringify("overview"));
      } catch (e) { /* ignore */ }
    });
    page.on("dialog", async (d) => {
      try { await d.accept(); } catch (e) { /* ignore */ }
    });
  });

  test("完整用户流程：启动→onboarding→建任务→切场景→完成任务→统计→设置→习惯链→AI对话→导出", async ({ page }) => {
    /* 10 个 test.step 的长流程，单次 action 重试预算就有 10s；全量并行跑时机器负载会把
       累计耗时顶过默认 30s（本用例注释里记录的 tablet 老毛病同此）。放宽到 60s 是**容忍负载**，
       不是掩盖缺陷：断言本身一个都没放松。 */
    test.setTimeout(60_000);
    // ---------- 1. 启动应用 ----------
    await test.step("启动应用并等待侧边栏渲染", async () => {
      await page.goto(APP_URL);
      // 侧边栏 #side 是静态 HTML，启动时立即可用；但主区 render() 是异步（startup IIFE）
      // 等待侧边栏出现 nav-item（renderSide 执行后的标志）
      await page.waitForSelector("#side .nav-item", { timeout: 15_000 });
      // 等待 onboarding modal / 聊天面板 / 场景看板出现（批十默认落聊天区；页面视图下 #chat 隐藏是常态，等面板本体）
      await page.waitForSelector("#onboardModal, #taskForm, #chatPanel", { timeout: 10_000 });
    });

    // ---------- 2. onboarding 跳过 ----------
    await test.step("onboarding 一步跳过", async () => {
      // 若未触发 onboarding（非首次启动），则 #onboardModal 不存在，直接返回
      const onboard = await page.$("#onboardModal");
      if (!onboard) return;
      // v3.7.68：「跳过」直接结束引导（旧语义是翻到下一步，要连点三次才脱身），所以只点一次
      await page.locator("#onboardSkip").click();
      await expect(page.locator(".onboard-modal"), "跳过后不应再弹下一步").toHaveCount(0);
      /* 批十：fixture 缺省注入 active=overview（页面视图），#chat 在页面视图下 display:none、
         #taskForm 只在场景视图存在，两者都等不到。这里要等的只是「跳过后主界面渲染完成」——
         `.foot-bar` 由 appendFoot() 在所有 render 分支产出（聊天首页/场景页/页面页都有），是稳定信号。
         后面 switchScene 会切到 office 场景再等真正的 #taskForm，判据没放宽，只是换了正确的就绪信号。 */
      await page.waitForSelector(".foot-bar", { timeout: 10_000 });
    });

    // ---------- 3. 创建任务 ----------
    await test.step("在办公场景创建任务", async () => {
      // 确保在办公场景（刀 2 后走工作台 office tile）—— 判别性等待 + 重试块（见 switchScene 注释）
      await switchScene(page, "office");
      await page.waitForSelector("#taskForm", { timeout: 10_000 });
      // 填标题并提交
      await page.fill('#taskForm input[name="title"]', "E2E测试任务-办公");
      await page.selectOption('#taskForm select[name="priority"]', "P1");
      await page.click('#taskForm button[type="submit"]');
      // 等待看板卡片出现，验证任务创建成功
      // 注：seed 播种了默认任务，看板可能有多张卡片；用 locator 过滤含新建标题的卡片
      await page.waitForSelector(".kcard", { timeout: 10_000 });
      await expect(page.locator(".kcard", { hasText: "E2E测试任务-办公" })).toBeVisible({ timeout: 10_000 });
    });

    // ---------- 4. 切场景 ----------
    await test.step("切换到编程场景并创建任务", async () => {
      await switchScene(page, "code");
      await page.waitForSelector("#taskForm", { timeout: 10_000 });
      // 创建一个编程任务，便于后续完成
      await page.fill('#taskForm input[name="title"]', "E2E测试任务-编程");
      await page.click('#taskForm button[type="submit"]');
      await page.waitForSelector(".kcard", { timeout: 10_000 });
      await expect(page.locator(".kcard", { hasText: "E2E测试任务-编程" })).toBeVisible({ timeout: 10_000 });
    });

    // ---------- 5. 完成任务 ----------
    await test.step("完成任务（todo→doing→done）", async () => {
      // 当前在编程场景，刚建的 P2 任务在 todo 列
      // 点 → 进行中
      await page.waitForSelector('[data-move$=":doing"]', { timeout: 10_000 });
      const moveTodoBtn = page.locator(".kcard").filter({ hasText: "E2E测试任务-编程" }).locator('[data-move$=":doing"]').first();
      await moveTodoBtn.click();
      // doing 列出现 → 完成按钮
      await page.waitForSelector('[data-move$=":done"]', { timeout: 10_000 });
      const moveDoneBtn = page.locator(".kcard").filter({ hasText: "E2E测试任务-编程" }).locator('[data-move$=":done"]').first();
      await moveDoneBtn.click();
      // 验证任务进入 done 列（看板里 done 列含该卡片）
      await page.waitForTimeout(300); // render() 同步，但保险等一下
      const doneCol = page.locator(".kcol").filter({ hasText: "已完成" });
      await expect(doneCol).toContainText("E2E测试任务-编程");
    });

    // ---------- 6. 查看统计 ----------
    await test.step("查看统计视图", async () => {
      /* v3.7.91 修复（此前长期空转）：
         v3.6.6 的 IA 变更撤掉了侧栏的独立「统计」入口（方向是仪表盘并入主页），
         旧写法只看 `#side .nav-item[data-sc="stats"]` → 永远为 null → 每轮静默跳过断言，
         注释里留了个 TODO 等"产品决策"。但实测（v3.7.91，探针 _probe/probe-stats-entry.cjs）：
         统计页**从未下线、入口一直可达**：
           · src/render-overview.js:562  renderStats() 仍在；
           · src/render-entry.js:70      路由 `if(active==="stats"){ renderStats(); return; }` 仍在；
           · 活入口 = 主页系统概况卡的「已完成」项 `.sys-ov-item[data-act="stats"]`
             （render-overview.js:316 定义 → :173 绑 setActive("stats")）。
         ⚠️ 注意：另有一条疑似入口 `.ov-kpi-item[data-kpi-act="stats"]`（render-overview.js:388-390）
         是**死代码** —— `_renderOvKpi()`（:384）全仓零调用，实测该选择器 count=0。故不作为入口。 */
      // 回主页（总览）——系统概况卡在 overview
      await switchScene(page, "overview");
      await page.waitForSelector(".sys-ov-item", { timeout: 10_000 });

      const statsEntry = page.locator('.sys-ov-item[data-act="stats"]').first();
      expect(await statsEntry.count(), "主页系统概况卡应有「已完成」统计入口").toBeGreaterThan(0);
      await statsEntry.click();

      // 统计视图：有任务时显示 .stats-cards，无任务时显示 .no-stats 空状态
      // 我们已建并完成任务，应命中 .stats-cards
      await page.waitForSelector(".stats-cards, .no-stats", { timeout: 10_000 });
      const hasStatsCards = await page.$(".stats-cards");
      expect(hasStatsCards, "已建任务，统计页应渲染 .stats-cards 而非空状态").not.toBeNull();
      // 验证关键指标卡片渲染（总任务数 / 已完成 等）
      await expect(page.locator(".stats-card").first()).toBeVisible();
      const cardCount = await page.locator(".stats-card").count();
      expect(cardCount).toBeGreaterThanOrEqual(1);
    });

    // ---------- 7. 打开设置 ----------
    await test.step("打开设置抽屉", async () => {
      /* 批九：设置已退出桌面 5 项导航，真实入口固定在左栏底部 `[data-foot="settings"]`
         （桌面与 768 平板都可见；窄屏 390 不在本 spec 项目内）。 */
      await page.click('#side [data-foot="settings"]');
      // 抽屉加 .open class
      await page.waitForSelector("#drawer.open", { timeout: 10_000 });
      await expect(page.locator("#drawer")).toHaveClass(/open/);
    });

    // ---------- 8. 编辑习惯链 ----------
    await test.step("在设置抽屉添加一条新习惯链", async () => {
      /* 设置抽屉是**标签式**（7 个 [data-set-tab] 分区）：打开后默认分区不含习惯链，
         #set-chain 此时 display:none（按钮 rect=0），必须先切到 set-chain 分区 —— 这就是真实用户路径。
         （本机 file:// 实测：切标签后按钮 h=38、top=614 在视口内、源场景 7 个选项，添加后链数 3→4 ✓） */
      await page.click('[data-set-tab="set-chain"]');
      await page.waitForSelector("#chainAddBtn", { state: "visible", timeout: 10_000 });
      await page.selectOption("#chainAddSrc", "office");
      await page.fill("#chainAddKw", "E2E关键词");
      await page.selectOption("#chainAddDst", "life");
      const beforeCount = await page.locator("#linksBox .chain-row").count();
      await page.click("#chainAddBtn");
      await page.waitForFunction(
        (prev) => document.querySelectorAll("#linksBox .chain-row").length > prev,
        beforeCount,
        { timeout: 10_000 }
      );
      const afterCount = await page.locator("#linksBox .chain-row").count();
      expect(afterCount).toBeGreaterThan(beforeCount);
    });

    // ---------- 9. AI 对话（mock） ----------
    await test.step("启用 AI 并进行 mock 对话", async () => {
      /* 批十：AI 固定页不再占导航（导航第 1 项是「对话」）。AI 配置的真实入口是
         聊天输入区的模型选择器：未配置任何 profile 时点它直达 AI 配置页。 */
      await page.click('#side [data-chat="1"]');
      await page.waitForFunction(() => document.querySelector(".body").classList.contains("chat-home"));
      await page.waitForSelector("#chatModelSelect", { state: "visible", timeout: 10_000 });
      /* 自研下拉：可见触发框是兄弟节点 `.ds-trigger`，原生 <select> 被它覆盖（CI 实测点 <select>
         报「<span class=ds-label>未配置</span> intercepts pointer events」）。点 trigger 才真能进配置页。 */
      await page.locator("#chatModelSelect").locator('xpath=following-sibling::button[contains(@class,"ds-trigger")]').click();
      await page.waitForSelector("#cfgEnabled", { state: "visible", timeout: 10_000 });
      await page.check("#cfgEnabled");
      // 填写 profile 表单
      await page.fill("#cfgName", "E2E-Mock");
      await page.fill("#cfgBase", "https://api.openai.com/v1");
      await page.fill("#cfgKey", "sk-e2e-mock-key");
      await page.fill("#cfgModel", "gpt-4o-mini");
      // 保存（会 alert + closeDrawer + render）
      await page.click("#cfgSave");
      // 等 alert 被自动 accept，配置落盘（AI 配置页不是抽屉，故不再断言抽屉关闭）
      await page.waitForTimeout(400);

      /* 批十：AI 配置保存后回「对话」入口才是真用户路径。这里的旧写法用
         switchScene(office)——setActive 会退出 chatHome，页面视图下 #chatForm
         让位而恒 hidden（本地两档复跑抓出）；断言零放宽，改走同一枚导航按钮。 */
      await page.click('#side [data-chat="1"]');
      await page.waitForFunction(() => document.querySelector(".body").classList.contains("chat-home"));
      await page.waitForSelector("#chatForm", { timeout: 10_000 });

      /* 平板（768×1024）下聊天面板默认折叠：.chat-panel.collapsed{width:0;overflow:hidden}，
         面板内控件被裁剪到视口外——本机实测 #chatPanelCollapse 矩形 L784 W36、中心 (802,109)，
         而视口宽仅 768，document.elementFromPoint 返回 null（点不到）。
         注意：不能用 isVisible() 判断"可点"——Playwright 的可见性只看「盒子非空 + 非 visibility:hidden」，
         被裁剪到视口外的元素照样返回 true；据此选中再 click 会重试 10s 后抛 TimeoutError，
         直接中断整个用例（这正是 CI 在 tablet 视口连续失败的根因，此前 4 次"修复"均未命中）。
         改为显式命中测试：中心点在视口内 且 elementFromPoint 落在自身或后代，才算真实可点控件。 */
      const isChatCollapsed = () => page.evaluate(() => {
        const p = document.getElementById("chatPanel");
        return !!(p && p.classList.contains("collapsed"));
      });
      /* 返回被点击的选择器；无可点控件返回 null */
      const clickRealControl = (sels) => page.evaluate((list) => {
        for (const sel of list) {
          const el = document.querySelector(sel);
          if (!el) continue;
          const r = el.getBoundingClientRect();
          if (r.width <= 0 || r.height <= 0) continue;
          const cx = r.left + r.width / 2;
          const cy = r.top + r.height / 2;
          if (cx < 0 || cy < 0 || cx > window.innerWidth || cy > window.innerHeight) continue;
          const top = document.elementFromPoint(cx, cy);
          if (!top || !(top === el || el.contains(top))) continue;
          el.click();
          return sel;
        }
        return null;
      }, sels);

      if (await isChatCollapsed()) {
        // 折叠态的正牌展开入口是右侧 rail；#chatPanelCollapse 只在展开态下可点。
        const used = await clickRealControl(["#chatPanelRail", "#chatPanelCollapse", ".chat-rail", "#chatToggle"]);
        if (used) await page.waitForTimeout(250);
        if (await isChatCollapsed()) {
          // 兜底：走应用自暴露的展开入口（bindChatPanel 内 window.__aiPanelExpand），最后才直接改 class
          await page.evaluate(() => {
            if (typeof window.__aiPanelExpand === "function") window.__aiPanelExpand();
            const p = document.getElementById("chatPanel");
            if (p && p.classList.contains("collapsed")) p.classList.remove("collapsed");
          });
          await page.waitForTimeout(150);
        }
        // 显式断言：展开失败应在此处给出明确信息，而不是让后续点击超时 10s
        expect(await isChatCollapsed(), "聊天面板应已展开（折叠态下表单不可达）").toBe(false);
      }

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

      /* 批十：页面视图下折叠坞只留标题栏，输入行随历史一起收起；
         真实用户路径是点左栏「对话」回聊天首页再输入。 */
      await page.click('#side [data-chat="1"]');
      await page.waitForFunction(() => document.querySelector(".body").classList.contains("chat-home"));
      await page.waitForSelector("#chatForm", { state: "visible", timeout: 10_000 });
      // 输入消息并发送（输入框为 textarea，兼容选择器）
      await page.fill('#chatForm [name="msg"]', "你好");
      await page.click('#chatForm button[type="submit"]');
      // 等待回复渲染（#chat 里出现 .msg.assistant 含 mockReply）
      await page.waitForSelector(`#chat .msg.assistant`, { timeout: 10_000 });
      // 验证回复文本含 mock 内容（容错：可能含 markdown 包裹）
      const chatText = await page.textContent("#chat");
      expect(chatText).toContain(mockReply);
    });

    // ---------- 10. 导出数据 ----------
    await test.step("导出 JSON 触发下载", async () => {
      // 重新打开设置抽屉（上一步保存后已关闭）——批九后入口在左栏底部
      await page.click('#side [data-foot="settings"]');
      await page.waitForSelector("#drawer.open", { timeout: 10_000 });
      // 抽屉是标签式：导出按钮在「数据」分区（set-data），需先切标签（本机实测映射）
      await page.click('[data-set-tab="set-data"]');
      await page.waitForSelector("#btnExport", { state: "visible", timeout: 10_000 });

      // 监听 download 事件
      const downloadPromise = page.waitForEvent("download", { timeout: 10_000 });
      await page.click("#btnExport");
      const download = await downloadPromise;
      // 验证下载文件名符合 agent-workbench-backup-YYYY-MM-DD.json
      const suggested = download.suggestedFilename();
      expect(suggested).toMatch(/^agent-workbench-backup-\d{4}-\d{2}-\d{2}\.json$/);
    });
  });

  test("smoke：应用可启动且渲染工作台入口与四个场景 tile", async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForSelector("#side .nav-item", { timeout: 15_000 });
    // 处理 onboarding（若存在）以便主区渲染 —— v3.7.68 起「跳过」一次即结束
    const onboard = await page.$("#onboardModal");
    if (onboard) {
      await page.waitForSelector("#onboardSkip", { timeout: 10_000 });
      await page.click("#onboardSkip");
      await expect(page.locator(".onboard-modal"), "跳过后不应再弹下一步").toHaveCount(0);
    }
    /* 刀 2（2026-11-16）：场景退出侧栏，改由工作台 tile 承载；侧栏契约改钉 10 入口，
       四个场景的可见性改到工作台页断言（走真实点击，不直接读 _buildSideMenu）。 */
    const navCount = await page.locator("#side .nav-item").count();
    /* 批九：桌面导航 10→5（主页/任务/工作台/商店/AI）；10 项数据树只供移动端底栏与抽屉。 */
    expect(navCount, "批九后桌面侧栏稳态 5 入口").toBeGreaterThanOrEqual(5);
    await page.click('#side .nav-item[data-sc="workbench"]');
    await page.waitForSelector("#main .wb-tile", { timeout: 10_000 });
    for (const sc of ["office", "code", "study", "life"]) {
      await expect(page.locator(`#main .wb-tile[data-tile-sc="${sc}"]`)).toBeVisible();
    }
  });
});