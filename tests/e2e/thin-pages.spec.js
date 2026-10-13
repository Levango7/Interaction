/**
 * thin-pages.spec.js —— 四个「薄页面」+ 任务页的**业务级**覆盖（v3.7.123 · 评估补缺 #2）
 * ----------------------------------------------------------------------------
 * 为什么要这一层（与 nav-pages-smoke.spec.js 的分工）：
 *   nav-pages-smoke 覆盖 17 个导航页的**渲染级**不变量（能打开、有文本、有控件、
 *   无报错、无模板残渣、不溢出）。那必要但不充分：
 *   **一个页面可以渲染得漂漂亮亮，业务却是错的** ——
 *     · 商店页分类按钮点了但没过滤（列表纹丝不动）
 *     · 安装按钮是死按钮（点了没装）
 *     · 联动状态页写死 0 条规则，而数据源里其实有 3 条
 *     · 说明页场景段停在「6 场景」，而内置场景早已是 7 个
 *   这四类缺陷在渲染级断言下**全绿**。
 *
 * 本 spec 因此断言的是**页面显示 == 数据源 / 操作真的改变了状态**：
 *   ① 商店：卡片清单非空 + 分类筛选真的过滤 + 「安装」真的把插件装进去 + 返回主页真跳转
 *   ② 场景联动：4 个 tab 都能切且内容对应 + 「联动状态」的 KPI 必须等于 getLinks() 真值
 *   ③ 时间轴：14 天列 / 恰好 1 个今天 / 泳道数 = 内置场景数 + 完成任务后事件计数同步
 *   ④ 说明：11 章节 + 首章默认展开 + 场景段覆盖全部内置场景（防文档漂移）
 *   ⑤ 任务：看板三列计数之和 = 数据源条数 + 待办视图行数一致 + 勾选完成真的写回数据源
 *
 * 契约来源（改这些函数时本 spec 就是回归网）：
 *   商店 renderStorePage —— src/render-overview.js:816
 *   联动 renderChainPage —— src/render-overview.js:899
 *   时间轴 renderTimelinePage —— src/render-overview.js:2360
 *   任务 renderTasksPage —— src/render-overview.js:619
 *   说明 renderHelp / helpSection —— src/ui-guide.js:4/12
 *
 * 方法论（与仓内其它 e2e 一致）：
 *   · **清单运行时取**（场景数从 ORDER 取、插件数从 BUILTIN_PLUGINS 取），不写死
 *   · **判别式等待**（helpers/wait-settled.cjs），不用固定 sleep
 *   · **取不到就判失败**，绝不当「空清单」放过（否则守护静默失效）
 *
 * 桌面专属（侧栏/商店布局在 ≤767px 走移动 IA），用**用例内 skip** 而不是改共享配置。
 * 守护策略同其它 e2e：默认跳过，E2E=1 才跑。
 */
const { test, expect } = require("./_fixture");
const { waitSideNav, waitMainRendered } = require("./helpers/wait-settled.cjs");

const APP_URL = "./agent-workbench.html";

function skipIfNarrow(page) {
  const vp = page.viewportSize();
  test.skip(!!vp && vp.width <= 767, "薄页面的桌面布局在窄屏下改走移动 IA，不适用");
}

/** 打开应用并等启动完成（侧栏注入 = 应用就绪的真实信号） */
async function openApp(page) {
  await page.goto(APP_URL);
  await page.waitForSelector("#main", { state: "attached", timeout: 15_000 });
  await waitSideNav(page);
}

/** 切到指定视图（setActive + render 是同步的，但页内子块随后才挂上 → 判别式等） */
async function gotoView(page, view) {
  await page.evaluate((v) => { setActive(v); render(); }, view);
  await page.waitForFunction(
    (v) => { try { return typeof active !== "undefined" && active === v; } catch (e) { return false; } },
    view,
    { timeout: 15_000 }
  );
  await waitMainRendered(page);
}

/* ============================ ① 商店页 ============================ */
test("商店页：卡片清单非空、分类筛选真过滤、安装真生效、返回主页真跳转", async ({ page }) => {
  skipIfNarrow(page);
  await openApp(page);
  await gotoView(page, "store");

  /* ① 清单非空且与数据源一致（BUILTIN_PLUGINS 是运行时真值，不写死条数） */
  const base = await page.evaluate(() => ({
    cards: document.querySelectorAll("#main .store-card").length,
    plugins: (typeof BUILTIN_PLUGINS !== "undefined" ? BUILTIN_PLUGINS.length : null),
    hasImport: !!document.querySelector("#storeImportBtn"),
    hasBack: !!document.querySelector("#btnBackHome"),
  }));
  expect(base.plugins, "BUILTIN_PLUGINS 读不到 —— 取值通道变了？").toBeTruthy();
  expect(base.cards, `商店一张卡都没渲染（数据源有 ${base.plugins} 个内置插件）`).toBeGreaterThan(0);
  expect(base.cards).toBeGreaterThanOrEqual(base.plugins);
  expect(base.hasImport, "缺 #storeImportBtn（导入插件入口）").toBe(true);
  expect(base.hasBack, "缺 #btnBackHome（返回主页入口）").toBe(true);

  /* ② 分类筛选**真的过滤**：切到「场景」后，每张卡都必须带「提供场景：」——
     因为 _pluginCategory() 的判据正是「该插件有 scenarios」，分类与内容必须自洽。
     只断言"数量变了"是弱断言（数量恰好相同就漏了），这里断言**内容属性**。 */
  const sceneCat = await page.evaluate(() => {
    const btn = document.querySelector('#main .store-cat-nav [data-store-cat="场景"]');
    if (!btn) return null;
    btn.click();
    const cards = [...document.querySelectorAll("#main .store-card")];
    return {
      total: cards.length,
      withScen: cards.filter((c) => (c.textContent || "").indexOf("提供场景") >= 0).length,
      activeBtn: (document.querySelector("#main .store-cat-nav .set-nav-btn.active") || {}).textContent || "",
    };
  });
  expect(sceneCat, "商店分类导航里没有「场景」这一档").toBeTruthy();
  expect(sceneCat.total, "「场景」分类下一张卡都没有（筛选过头 / 分类判据变了）").toBeGreaterThan(0);
  expect(sceneCat.withScen, `「场景」分类下有 ${sceneCat.total - sceneCat.withScen} 张卡其实不带场景 —— 分类判据与卡片内容脱节`).toBe(sceneCat.total);
  expect(sceneCat.activeBtn, "分类切换后 active 态没有跟着走").toContain("场景");

  /* ③ 启用**真的生效**（往返一次）：
     前提实测（v3.7.123）：10 个内置插件在启动时就已进注册表、但 enabled=false，
     所以商店里**没有「安装」按钮、全是「启用」** —— 第一版按「安装」写断言直接前提落空。
     判据因此改成：点「启用」→ 数据源 enabled 变 true 且卡片出现 .store-on；
     再点「禁用」→ enabled 回到 false。往返都验，才能挡住"只改 UI 不写数据"的死按钮。 */
  const toggled = await page.evaluate(() => {
    const on0 = document.querySelector('#main [data-store-toggle][data-on="0"]');
    if (!on0) return null;
    const id = on0.getAttribute("data-store-toggle");
    on0.click();
    const afterOn = {
      enabled: (typeof getPlugin === "function" && getPlugin(id)) ? !!getPlugin(id).enabled : null,
      badge: !!document.querySelector(`#main .store-card [aria-label*="启用中"], #main .store-on`),
    };
    const offBtn = document.querySelector(`#main [data-store-toggle="${id}"][data-on="1"]`);
    if (!offBtn) return Object.assign(afterOn, { id, hasOff: false });
    offBtn.click();
    return {
      id, hasOff: true, afterOn,
      afterOff: (typeof getPlugin === "function" && getPlugin(id)) ? !!getPlugin(id).enabled : null,
    };
  });
  expect(toggled, "商店里一个可启用的插件都没有（用例前提不成立）").toBeTruthy();
  expect(toggled.afterOn.enabled, `点「启用」后 getPlugin("${toggled.id}").enabled 仍为 false —— 启用是死按钮`).toBe(true);
  expect(toggled.afterOn.badge, "启用后卡片没出现「● 启用中」标记 —— UI 没跟着数据源走").toBe(true);
  expect(toggled.hasOff, `启用后没出现「禁用」按钮（卡片形态没切换）`).toBe(true);
  expect(toggled.afterOff, `点「禁用」后 enabled 仍是 true —— 禁用是死按钮`).toBe(false);

  /* ④ 返回主页**真的跳转**（v3.1.2 曾因内联 onclick 被 sanitizeHtml 剥离变成死按钮） */
  const back = await page.evaluate(() => {
    document.querySelector("#btnBackHome").click();
    return typeof active !== "undefined" ? active : null;
  });
  expect(back, "点「← 主页」后 active 没变成 overview —— 返回按钮是死的").toBe("overview");
});

/* ============================ ② 场景联动页 ============================ */
test("场景联动页：4 个 tab 都切得动且内容对应，状态页 KPI 必须等于 getLinks() 真值", async ({ page }) => {
  skipIfNarrow(page);
  await openApp(page);
  await gotoView(page, "chainpage");

  /* 打卡记录：每张场景一张卡，数量必须等于内置场景数（运行时取） */
  const streak = await page.evaluate(() => ({
    cards: document.querySelectorAll("#main .streak-card").length,
    order: (typeof ORDER !== "undefined" ? ORDER.length : null),
    kpis: document.querySelectorAll("#main .kpi").length,
    tabs: [...document.querySelectorAll("#main .chain-tab")].map((b) => b.getAttribute("data-chain-tab")),
  }));
  expect(streak.order, "ORDER 读不到").toBeTruthy();
  expect(streak.tabs, "联动页的 tab 清单与预期不符").toEqual(["streak", "graph", "status", "rate"]);
  expect(streak.cards, `打卡卡片数 ${streak.cards} ≠ 内置场景数 ${streak.order}（少一个场景就漏一张卡）`).toBe(streak.order);
  expect(streak.kpis, "打卡 tab 应有 3 个 KPI（活跃场景/最长连续/场景总数）").toBe(3);

  /* 逐 tab 切换：内容必须真的换掉，且各自有辨识特征 */
  const perTab = {};
  for (const t of ["graph", "status", "rate"]) {
    perTab[t] = await page.evaluate((tab) => {
      const btn = document.querySelector(`#main .chain-tab[data-chain-tab="${tab}"]`);
      if (!btn) return null;
      btn.click();
      return {
        graph: document.querySelectorAll("#main .graph-wrap svg, #main .graph-wrap").length,
        barRows: document.querySelectorAll("#main .bar-row").length,
        empty: document.querySelectorAll("#main .empty").length,
        kpis: [...document.querySelectorAll("#main .kpi .v")].map((e) => e.textContent.trim()),
      };
    }, t);
    expect(perTab[t], `联动页没有 [data-chain-tab="${t}"] 这个 tab 按钮`).toBeTruthy();
  }
  expect(perTab.graph.graph, "「联动关系」tab 没有渲染出关系图容器").toBeGreaterThan(0);

  /* 关键的一致性断言（本 spec 的核心价值）：
     「联动状态」页显示的「总规则 / 启用规则」必须等于 getLinks() 的**真值**。
     历史上这里调用了一个不存在的函数，被 typeof 守卫兜成空数组 → 页面恒显示 0 条，
     而页面渲染完全正常、渲染级断言全绿 —— 只有这种"页面 vs 数据源"对账才抓得到。 */
  const status = await page.evaluate(() => {
    document.querySelector('#main .chain-tab[data-chain-tab="status"]').click();
    const links = (typeof getLinks === "function" ? getLinks() : null) || [];
    const vals = [...document.querySelectorAll("#main .kpi .v")].map((e) => e.textContent.trim());
    return { shown: vals, total: links.length, enabled: links.filter((c) => c.enabled).length };
  });
  expect(status.shown.length, "联动状态页应有 3 个 KPI（启用规则/总规则/启用率）").toBe(3);
  expect(status.shown[1], `页面显示「总规则 ${status.shown[1]}」≠ 数据源 ${status.total} —— 页面与数据源脱节`).toBe(String(status.total));
  expect(status.shown[0], `页面显示「启用规则 ${status.shown[0]}」≠ 数据源 ${status.enabled}`).toBe(String(status.enabled));
});

/* ============================ ③ 时间轴页 ============================ */
test("时间轴页：14 天列、恰好一个今天、泳道数=场景数，完成任务后事件计数同步", async ({ page }) => {
  skipIfNarrow(page);
  await openApp(page);
  await gotoView(page, "timeline");

  const shape = await page.evaluate(() => ({
    days: document.querySelectorAll("#main .tl-hcell").length,
    today: document.querySelectorAll("#main .tl-hcell.today").length,
    lanes: document.querySelectorAll("#main .tl-row:not(.tl-head) .tl-sc").length,
    order: (typeof ORDER !== "undefined" ? ORDER.length : null),
    legendDots: document.querySelectorAll("#main .tl-legend .tl-dot").length,
    hasBack: !!document.querySelector("#tlBack"),
  }));
  expect(shape.order, "ORDER 读不到").toBeTruthy();
  expect(shape.days, `时间轴天数 ${shape.days} ≠ 14（页面写死 14 天窗口）`).toBe(14);
  expect(shape.today, `.today 标记有 ${shape.today} 个，应恰好 1 个（今天）`).toBe(1);
  expect(shape.lanes, `泳道数 ${shape.lanes} ≠ 内置场景数 ${shape.order} —— 有场景没进时间轴`).toBe(shape.order);
  expect(shape.legendDots, "图例应有 3 类事件点（新建/完成/删除）").toBe(3);
  expect(shape.hasBack, "缺 #tlBack 返回按钮").toBe(true);

  /* 业务真实性：完成一个任务 → 事件流 +1 → 页头「N 条事件」必须跟着变。
     只断言"能渲染"抓不到「事件没写进流 / 页头读的是旧值」这类错。 */
  const ev = await page.evaluate(() => {
    const before = (typeof getTaskEvents === "function" ? getTaskEvents() : null);
    if (!before) return null;
    const pend = (typeof getTasks === "function" ? getTasks() : []).filter((t) => !t.deletedAt && t.status !== "done");
    if (!pend.length) return { skipped: true, before: before.length };
    const ok = completeTask(pend[0].id);
    const after = getTaskEvents().length;
    renderTimelinePage();
    return {
      ok,
      before: before.length,
      after,
      headerHas: (document.querySelector("#main .ph-tx .sub") || {}).textContent || "",
    };
  });
  expect(ev, "getTaskEvents/getTasks 读不到 —— 取值通道变了？").toBeTruthy();
  if (ev.skipped) {
    /* 没有待办任务可完成（种子数据被改）—— 这是前提缺失，不是通过 */
    throw new Error("前提不成立：一个待完成任务都没有，无法验证事件流同步（种子数据被改？）");
  }
  expect(ev.ok, "completeTask() 返回 false —— 任务完成链路本身坏了").toBe(true);
  expect(ev.after, `完成任务后事件流没有 +1（${ev.before} → ${ev.after}）`).toBe(ev.before + 1);
  expect(ev.headerHas, `页头没有显示最新的事件条数（应含「${ev.after} 条事件」），实际：「${ev.headerHas}」`).toContain(ev.after + " 条事件");
});

/* ============================ ④ 说明页 ============================ */
test("说明页：11 章节、首章默认展开、场景段覆盖全部内置场景", async ({ page }) => {
  skipIfNarrow(page);
  await openApp(page);
  /* 说明页不走 setActive，是独立的 uiView === "help" 形态 */
  await page.evaluate(() => { renderHelp(); });
  await page.waitForSelector("#helpPage .help-section", { timeout: 15_000 });

  const help = await page.evaluate(() => ({
    secs: document.querySelectorAll("#helpPage .help-section").length,
    emptySummary: [...document.querySelectorAll("#helpPage .help-section > summary")].filter((s) => !(s.textContent || "").trim()).length,
    openCount: document.querySelectorAll("#helpPage .help-section[open]").length,
    firstOpen: (() => { const f = document.querySelector("#helpPage .help-section"); return !!f && f.hasAttribute("open"); })(),
  }));
  expect(help.secs, `说明页章节数 ${help.secs} ≠ 11（快速上手/场景说明/…/数据安全）`).toBe(11);
  expect(help.emptySummary, "有章节的 summary 是空的（渲染残次）").toBe(0);
  /* v3.7.123 抓到的真缺陷：helpSection() 的默认展开判据比对的是「标题」而参数传的是 id，
     条件恒假 → 11 个章节全折叠，与「3 步开始使用」的设计意图相反。改回比对 id 后钉在这里。 */
  expect(help.openCount, "说明页一个章节都没默认展开 —— 用户进来看到 11 个全折叠抽屉").toBeGreaterThan(0);
  expect(help.firstOpen, "第一个章节（快速上手）应默认展开").toBe(true);

  /* 文档漂移守卫：说明页「场景说明」段必须覆盖 ORDER 里的**每一个**内置场景。
     v3.5.2 起内置场景就是 7 个（补了 health），而说明页文案一直停在「6 场景」且漏了健康 ——
     渲染级断言全绿，只有这条对账抓得到。 */
  const drift = await page.evaluate(() => {
    const order = (typeof ORDER !== "undefined" ? ORDER : null) || [];
    const scen = (typeof SCENARIOS !== "undefined" ? SCENARIOS : null) || {};
    const sec = [...document.querySelectorAll("#helpPage .help-section")].find((d) => (d.textContent || "").indexOf("场景说明") >= 0);
    const txt = sec ? (sec.textContent || "") : "";
    return { missing: order.filter((k) => scen[k] && txt.indexOf(scen[k].name) < 0), names: order.map((k) => scen[k] && scen[k].name) };
  });
  expect(drift.missing, `说明页「场景说明」段缺少这些内置场景：${drift.missing.join("、")}（文档漂移）`).toEqual([]);
});

/* ============================ ⑤ 任务页 ============================ */
test("任务页：看板列计数=数据源、待办视图行数一致、勾选完成真的写回", async ({ page }) => {
  skipIfNarrow(page);
  await openApp(page);
  await gotoView(page, "tasks");

  /* ① 看板：三列标题里的计数之和必须等于数据源条数（防"列在数错"） */
  const kanban = await page.evaluate(() => ({
    cols: document.querySelectorAll("#main .kcol").length,
    sums: [...document.querySelectorAll("#main .kcol .n")].reduce((a, e) => a + (parseInt(e.textContent, 10) || 0), 0),
    cards: document.querySelectorAll("#main .kcard").length,
    total: (typeof getActiveTasks === "function" ? getActiveTasks().length : null),
  }));
  expect(kanban.total, "getActiveTasks() 读不到").toBeTruthy();
  expect(kanban.cols, "任务看板应有 3 列（待办/进行中/已完成）").toBe(3);
  expect(kanban.sums, `看板三列计数之和 ${kanban.sums} ≠ 数据源条数 ${kanban.total}`).toBe(kanban.total);
  expect(kanban.cards, `看板渲染了 ${kanban.cards} 张卡，但列头计数只有 ${kanban.sums} 条 —— 卡片与计数脱节`).toBe(kanban.sums);

  /* ② 待办视图：行数必须等于未完成任务数 */
  const todo = await page.evaluate(() => {
    const btn = document.querySelector('#main [data-tasks-view="todo"]');
    if (!btn) return null;
    btn.click();
    return {
      rows: document.querySelectorAll("#main .todo-row").length,
      pending: (typeof getActiveTasks === "function" ? getActiveTasks().filter((t) => t.status !== "done").length : null),
      chks: document.querySelectorAll("#main [data-tasks-done]").length,
    };
  });
  expect(todo, "任务页没有「待办」视图切换按钮").toBeTruthy();
  expect(todo.rows, `待办视图行数 ${todo.rows} ≠ 未完成任务数 ${todo.pending}`).toBe(todo.pending);
  expect(todo.chks, "每行待办都应有一个完成勾选框").toBe(todo.rows);

  /* ③ 勾选完成**真的写回数据源**：勾一个 → 该任务 status 变 done，行数 -1。
     死按钮（只改 UI 不写数据）在这条下无处可藏。 */
  const done = await page.evaluate(() => {
    const chk = document.querySelector("#main [data-tasks-done]");
    if (!chk) return null;
    const id = chk.getAttribute("data-tasks-done");
    chk.checked = true;
    chk.dispatchEvent(new Event("change", { bubbles: true }));
    const t = (typeof getTasks === "function" ? getTasks() : []).find((x) => x.id === id);
    return {
      status: t ? t.status : "(not found)",
      rows: document.querySelectorAll("#main .todo-row").length,
      pending: getActiveTasks().filter((x) => x.status !== "done").length,
    };
  });
  expect(done, "待办视图里一个勾选框都没有（前提不成立）").toBeTruthy();
  expect(done.status, "勾选完成后数据源里的 status 没变成 done —— 勾选是死按钮").toBe("done");
  expect(done.rows, `勾选完成后待办行数没减一（仍 ${done.rows}）`).toBe(todo.rows - 1);
});
