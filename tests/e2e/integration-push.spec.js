/**
 * integration-push.spec.js —— Notion / Linear 任务推送入口的真实浏览器不变量（v3.7.70）
 * ----------------------------------------------------------------------------
 * jsdom 只能证明"DOM 里有这个按钮"，看不见它是否真的**可见可点**：
 *   · `.int-action` 在窄屏/长文案下可能把按钮挤没；
 *   · 集成行是 flex 布局，多一个按钮会不会把 `断开` 推出可视区；
 *   · `confirm()` 是浏览器原生弹窗，jsdom 里被替身糊过去，真机上要点得掉才算通。
 * 所以这一组在真 Chromium 里跑：连接 → 出现入口 → 点得着 → 真发出 POST → 结果如实上屏。
 * 外网用 page.route 全替身（响应带 access-control-allow-origin，与真 Notion 在 http 源下同形），
 * 测试期间零真实外发。
 *
 * 跑 desktop + tablet 两个项目；断言与视口无关，故不进 mobile 名单（见 notify-hook.spec.js 头注）。
 */
import { test, expect } from "./_fixture.js";

const APP_URL = "./agent-workbench.html";
const NOTION_TOKEN = "secret_e2e_fake_token";
const NOTION_DB = "e2e-db-id";

/** 拦截 Notion 全部请求；pages 建页返回 200 并给 id，users/me 返回 200 */
async function stubNotion(page, { pagesFail = false } = {}) {
  const seen = [];
  await page.route(/^https:\/\/api\.notion\.com\//, async (route) => {
    const req = route.request();
    seen.push({ url: req.url(), method: req.method(), body: req.postData() });
    const okBody = req.url().includes("/v1/pages")
      ? (pagesFail ? { object: "error", code: "validation_error", message: "Title is not a property that exists" }
                   : { id: "e2e-page-1" })
      : { object: "user", id: "e2e-user" };
    await route.fulfill({
      status: pagesFail && req.url().includes("/v1/pages") ? 400 : 200,
      contentType: "application/json",
      /* 替身要与真服务同形：Notion 的预检对任何源都回 ACAO，缺了它会在 http 源下假红 */
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify(okBody)
    });
  });
  return seen;
}

/** 走应用自己的入口打开设置抽屉并切到「集成」页
    —— 不能只对 `[data-set-tab]` 派发 DOM 点击：那不需要元素在视口内，
    于是"面板开着"是假的，后续真机点击必然点不着（我第一版就这么自欺了一次）。 */
async function openPanel(page) {
  await page.evaluate(() => {
    AppBridge.openDrawer();
    AppBridge._switchSetTab("set-integration");
  });
  await page.waitForTimeout(300);
}

/** 真连一次 Notion（走真实配置弹窗路径，不是直接调 API） */
async function connectNotion(page) {
  await page.evaluate(() => {
    const row = [...document.querySelectorAll("#integrationPanel .int-row")]
      .find((r) => r.querySelector(".int-label").textContent === "Notion");
    row.querySelector("[data-int-conn]").click();
  });
  await page.locator("#intcfg_token").fill(NOTION_TOKEN);
  await page.locator("#intcfg_databaseId").fill(NOTION_DB);
  await page.locator("#btnIntCfgGo").click();
  await page.waitForTimeout(600);
}

test.describe("集成中心 · Notion 任务推送入口", () => {
  test.beforeAll(() => { test.skip(!process.env.E2E, "set E2E=1 to run"); });

  test.beforeEach(async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForSelector("#main", { state: "attached", timeout: 15_000 });
    /* 原生 confirm 要接受掉，否则点击会卡在弹窗上 */
    page.on("dialog", (d) => d.accept());
    await openPanel(page);
  });

  test("① 连接前没有入口；连接后入口真的可见、可点，且不把「断开」挤出可视区", async ({ page }) => {
    await stubNotion(page);
    const pushSel = '[data-int-push="notion"]';
    await expect(page.locator(pushSel), "未连接时不该有推送入口").toHaveCount(0);

    await connectNotion(page);
    await openPanel(page);
    const push = page.locator(pushSel);
    /* 🔴 必须用 toBeInViewport 而不是 toBeVisible：设置抽屉是靠 transform 平移到屏外的，
       屏外元素对 toBeVisible 来说**仍然算可见**（非空盒 + 非 display:none）——
       我第一版就是这么写的，于是"入口可见可点"这条断言在按钮实际点不着时照样绿。
       真正能点 ⇒ 落在视口内 ⇒ 用 toBeInViewport 判。 */
    await expect(push, "连接后入口必须落在视口内（toBeVisible 看不到屏外平移）").toBeInViewport({ timeout: 5_000 });
    const pb = await push.boundingBox();
    expect(pb.width, `推送按钮太小点不着：${pb && pb.width}x${pb && pb.height}`).toBeGreaterThan(40);
    expect(pb.height).toBeGreaterThan(20);
    const disc = page.locator('#integrationPanel [data-int-disc="notion"]');
    await expect(disc, "断开按钮必须仍在，且没被新按钮挤出去").toBeInViewport();
    const db = await disc.boundingBox();
    const rowBox = await page.locator("#integrationPanel .int-row").first().boundingBox();
    expect(db.x + db.width, "断开按钮不能越出行边界").toBeLessThanOrEqual(rowBox.x + rowBox.width + 1);
    expect(pb.x + pb.width, "两个按钮不能重叠").toBeLessThanOrEqual(db.x + 1);
  });

  test("② 点一次：真发出 POST /v1/pages，内容带上任务标题与数据库 ID，并如实报成功", async ({ page }) => {
    const seen = await stubNotion(page);
    await connectNotion(page);
    seen.length = 0;
    await page.evaluate(() => {
      setTasks([{ id: "e2e-t1", sc: "office", title: "E2E 推送任务", status: "todo", due: "", priority: "", doneAt: null, note: "", tags: [], created: Date.now() }]);
    });
    /* setTasks 会广播数据变更，应用随后（实测约 600ms）**自己把设置抽屉收起来** ——
       抽屉一收，按钮就被平移到屏外（实测 x 806→1473），此时点它必然点不着。
       所以顺序必须是：写完数据 → 等这次自动收起发生 → 再打开抽屉 → 立刻点。 */
    await page.waitForTimeout(700);
    await openPanel(page);
    await expect(page.locator('[data-int-push="notion"]'), "点击前必须真的落在视口内").toBeInViewport();
    await page.locator('[data-int-push="notion"]').click();
    await page.waitForTimeout(800);

    const posts = seen.filter((x) => x.method === "POST" && x.url.endsWith("/v1/pages"));
    expect(posts.length, "应当真发出一次建页请求").toBe(1);
    const body = JSON.parse(posts[0].body);
    expect(body.parent.database_id).toBe(NOTION_DB);
    expect(body.properties.Title.title[0].text.content).toBe("E2E 推送任务");
    const toasts = await page.evaluate(() => [...document.querySelectorAll("#toasts .toast")].map((t) => t.textContent));
    expect(toasts.join("\n"), "结果要如实上屏：" + toasts.join(" | ")).toMatch(/已推送|新建 1/);
  });

  test("③ 平台拒绝时不许报成功：toast 必须说失败条数与原因", async ({ page }) => {
    const seen = await stubNotion(page, { pagesFail: true });
    await connectNotion(page);
    seen.length = 0;
    await page.evaluate(() => {
      setTasks([{ id: "e2e-t2", sc: "office", title: "会被拒的任务", status: "todo", due: "", priority: "", doneAt: null, note: "", tags: [], created: Date.now() }]);
    });
    /* setTasks 会广播数据变更，应用随后（实测约 600ms）**自己把设置抽屉收起来** ——
       抽屉一收，按钮就被平移到屏外（实测 x 806→1473），此时点它必然点不着。
       所以顺序必须是：写完数据 → 等这次自动收起发生 → 再打开抽屉 → 立刻点。 */
    await page.waitForTimeout(700);
    await openPanel(page);
    await expect(page.locator('[data-int-push="notion"]'), "点击前必须真的落在视口内").toBeInViewport();
    await page.locator('[data-int-push="notion"]').click();
    await page.waitForTimeout(800);
    expect(seen.filter((x) => x.method === "POST").length, "请求确实发出去了").toBeGreaterThanOrEqual(1);
    const toasts = await page.evaluate(() => [...document.querySelectorAll("#toasts .toast")].map((t) => t.textContent));
    const all = toasts.join("\n");
    expect(all, "失败必须如实上屏，不能静默或报成功：" + all).toMatch(/失败|未成功/);
    expect(all, "原因要带出来：" + all).toMatch(/Title is not a property|validation_error|400/);
  });

  /* Linear 与 Notion 同款消费点，但失败形态不同：GraphQL 用 **HTTP 200 + errors[]** 报错。
     所以这一条专门在真浏览器里锁「200 也不能当成功」。 */
  test("④ Linear 入口同样可见可点；GraphQL 报错（HTTP 200）必须如实上屏", async ({ page }) => {
    const seen = [];
    await page.route(/^https:\/\/api\.linear\.app\//, async (route) => {
      const req = route.request();
      const body = JSON.parse(req.postData() || "{}");
      seen.push({ query: body.query || "", variables: body.variables || {} });
      const isViewer = /viewer/.test(body.query || "");
      await route.fulfill({
        status: 200,                       /* 关键：业务失败也回 200 */
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify(isViewer
          ? { data: { viewer: { id: "e2e-user" } } }
          : { errors: [{ message: "Argument 'state' is not defined by type IssueCreateInput." }] })
      });
    });

    await page.evaluate(() => {
      const row = [...document.querySelectorAll("#integrationPanel .int-row")]
        .find((r) => r.querySelector(".int-label").textContent === "Linear");
      row.querySelector("[data-int-conn]").click();
    });
    await page.locator("#intcfg_token").fill("lin_api_e2e");
    await page.locator("#intcfg_teamId").fill("team-e2e");
    await page.locator("#btnIntCfgGo").click();
    await page.waitForTimeout(600);

    await page.evaluate(() => {
      setTasks([{ id: "e2e-l1", sc: "office", title: "Linear 推送任务", status: "todo", due: "", priority: "", doneAt: null, note: "", tags: [], created: Date.now() }]);
    });
    /* 同 ②：等抽屉自动收起之后再打开，否则点的是屏外元素 */
    await page.waitForTimeout(700);
    await openPanel(page);
    const push = page.locator('[data-int-push="linear"]');
    await expect(push, "Linear 的推送入口必须落在视口内").toBeInViewport({ timeout: 5_000 });
    await push.click();
    await page.waitForTimeout(800);

    const creates = seen.filter((x) => /issueCreate/.test(x.query));
    expect(creates.length, "必须真发出 issueCreate").toBe(1);
    expect(creates[0].variables.input.teamId).toBe("team-e2e");
    expect(creates[0].variables.input.title).toBe("Linear 推送任务");
    expect(Object.keys(creates[0].variables.input), "状态映射未接线，请求里不许出现 state/stateId")
      .not.toContain("state");
    const all = (await page.evaluate(() => [...document.querySelectorAll("#toasts .toast")].map((t) => t.textContent))).join("\n");
    expect(all, "HTTP 200 + errors[] 必须判失败并上屏：" + all).toMatch(/失败|未成功/);
    expect(all, "要带出平台给的原因：" + all).toMatch(/not defined by type IssueCreateInput/);
  });
});
