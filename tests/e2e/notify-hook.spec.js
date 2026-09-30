/**
 * notify-hook.spec.js —— 飞书 / 钉钉通知通道的真实浏览器不变量（v3.7.66）
 * ----------------------------------------------------------------------------
 * 为什么按「origin」分两组跑，而不是随便挑一个 URL：
 * 2026-09-30 用真实 Chromium + 真实网络量了 origin × 渠道 × 传输矩阵（`_probe/cors-origin-matrix.mjs`）：
 *   飞书  file:// → ❌ 被拦   飞书  http(s) → ✅ 放行   飞书  Electron 主进程 → ✅
 *   钉钉  file:// → ❌ 被拦   钉钉  http(s) → ❌ 被拦   钉钉  Electron 主进程 → ✅
 * 也就是说**同一个渠道在不同交付形态下的可达性不一样**，一条 spec 只能证明一种形态。
 * 本应用的 file:// 是「双击打开」，http 是「启动本地服务.bat / 线上站点」，两者都有真实用户，
 * 所以两组都要跑：http 组证明"接通了真能发"，file 组证明"发不出的那条被如实禁掉且零外发"。
 *
 * 覆盖的不变量（都是 jsdom 测不出来的：样式渲染 + 真实存储 + 真实刷新 + 真实 hit-testing）：
 *   ① 配置弹窗必须**真的可见可填** —— 已修掉一个长期缺陷：`openIntegrationConfig` 只给外层
 *      .overlay 加 show，而内层 `.cmd` 基类是 display:none，于是点「连接」后弹窗根本不出现。
 *      单测在 jsdom（不应用样式表）、v3.7.60 那轮探测又用 element.click() 直接驱动隐藏元素，
 *      所以谁都没发现。没有这条断言，它随时会回来。
 *   ② 凭据**零落盘**（用户 2026-09-29 的硬要求）：真实 localStorage 里不许出现任何集成键。
 *   ③ 刷新即失效：新会话必须回到「未连接」。
 *   ④ 非法地址零外发。
 *   ⑤ 能力门：发不出去的渠道必须禁用、写明原因，且**绕过 UI 直接调连接函数也被拦**。
 *
 * 全程用 page.route 把外网请求截在本地，测试期间零真实外发。
 *
 * 跑哪几个项目：desktop + tablet。`playwright.config.js` 的 mobile-375x667 用
 * `testMatch:/mobile\.spec\.js|viewport\.spec\.js/` 精挑过，只为压 CI 时长；本 spec 的断言
 * 都与视口无关，常驻 mobile 名单是纯付时长。窄屏可用性另作一次性取证：
 *   npm run src:inject && E2E=1 npx playwright test -c _probe/pw.mobile-notify.config.js --project=mobile-375x667
 * 2026-09-29 实测通过（含「窄屏下弹窗真的可见可填」）。
 */
import { test, expect } from "./_fixture.js";
import { startSyncMock } from "../mocks/sync-server.mjs";

const FILE_URL = "./agent-workbench.html";
const FEISHU_HOOK = "https://open.feishu.cn/open-apis/bot/v2/hook/e2e-fake-hook";
const DING_HOOK = "https://oapi.dingtalk.com/robot/send?access_token=e2e-fake-token";

/**
 * 把两家的 webhook 截在本地，返回被拦到的请求列表。
 * 🔴 替身必须带 `access-control-allow-origin`：page.route 造的是真 HTTP 响应，浏览器照样会做
 * CORS 判定。缺这个头的话「飞书在 http 源下可用」会被替身自己拦掉，测出来的红是测试的锅而不是代码的锅。
 * 带上它，替身才与真实飞书在 http origin 下的行为同形。
 */
async function stubHooks(page) {
  const seen = [];
  await page.route(/^https:\/\/(open\.feishu\.cn|oapi\.dingtalk\.com)\//, async (route) => {
    seen.push(route.request().url());
    await route.fulfill({
      status: 200, contentType: "application/json",
      headers: { "access-control-allow-origin": "*", "access-control-allow-content-type": "application/json" },
      body: JSON.stringify({ code: 0, errcode: 0, msg: "ok" })
    });
  });
  return seen;
}
const openConfigDialog = async (page, label) => {
  await page.evaluate((lab) => {
    document.querySelector('[data-set-tab="set-integration"]').click();
    const row = [...document.querySelectorAll("#integrationPanel .int-row")].find((r) => r.querySelector(".int-label").textContent === lab);
    row.querySelector("[data-int-conn], [data-int-disc]").click();
  }, label);
};
const statusOf = (page, label) => page.evaluate((lab) => {
  const row = [...document.querySelectorAll("#integrationPanel .int-row")]
    .find((r) => r.querySelector(".int-label").textContent === lab);
  const btn = row.querySelector(".int-action button");
  return { status: row.querySelector(".int-status").textContent, desc: row.querySelector(".int-desc").textContent,
    disabled: !!btn.disabled, title: btn.getAttribute("title") || "" };
}, label);
const leakKeys = (page) => page.evaluate(() => Object.keys(localStorage).filter((k) => /integration|hook|feishu|dingtalk/i.test(k)));

test.describe("通知通道 · http 源形态（本地服务 / 线上站点）", () => {
  let mock;
  test.beforeAll(async () => {
    test.skip(!process.env.E2E, "set E2E=1 to run");
    mock = await startSyncMock();          /* 同源托管应用，页面 origin 是真实 http://127.0.0.1:PORT */
  });
  test.afterAll(async () => { if (mock) await mock.close(); });

  test.beforeEach(async ({ page }) => {
    await page.goto(mock.url + "/agent-workbench.html");
    await page.waitForSelector("#main", { state: "attached", timeout: 15_000 });
    await page.evaluate(() => { setActive("office"); render(); });
    await page.waitForTimeout(300);
    const proto = await page.evaluate(() => location.protocol);
    expect(proto, "前提：这组必须跑在 http 源上，否则证明的不是这个形态").toBe("http:");
  });

  test("① 配置弹窗真的可见、可填（防 display:none 回归）", async ({ page }) => {
    await openConfigDialog(page, "飞书");
    const panel = page.locator("#intCfgOverlay .cmd");
    await expect(panel, "弹窗面板必须可见（.cmd 基类 display:none，必须自己加 show）").toBeVisible({ timeout: 5_000 });
    const box = await panel.boundingBox();
    expect(box.width, `弹窗面板过窄：${box && box.width}px`).toBeGreaterThan(200);
    const url = page.locator("#intcfg_url");
    await expect(url, "webhook 输入框必须可见可填").toBeVisible();
    await url.fill(FEISHU_HOOK);                       /* fill 会做真实 hit-testing，能填说明整条链路是给人用的 */
    await expect(url).toHaveValue(FEISHU_HOOK);
    const hint = page.locator("#intCfgOverlay .u-text-warn");
    await expect(hint, "必须明写「不落盘 / 刷新即失效」").toBeVisible();
    await expect(hint).toContainText(/刷新或关闭页面即失效/);
  });

  test("② 连接真的发得出去 + localStorage 零集成键 + 面板转「本会话已配置」", async ({ page }) => {
    const seen = await stubHooks(page);
    expect(await page.evaluate(() => notifyChannelAvailable("feishu")), "http 源下飞书应判为可用").toBe(true);
    await openConfigDialog(page, "飞书");
    await page.locator("#intcfg_url").fill(FEISHU_HOOK);
    await page.locator("#intcfg_secret").fill("e2e-not-a-real-secret");
    await page.locator("#btnIntCfgGo").click();
    await page.waitForTimeout(800);
    expect(seen.length, "连接应当发出过一次验证请求（说明链路真的接到底）").toBeGreaterThanOrEqual(1);
    expect(seen[0]).toMatch(/^https:\/\/open\.feishu\.cn\/open-apis\/bot\/v2\/hook\//);
    const got = await statusOf(page, "飞书");
    expect(got.status, "面板应显示本会话已配置：" + got.status).toContain("本会话已配置");
    expect(got.status, "加签状态要显示出来").toContain("加签");
    expect(await leakKeys(page), "🔴 凭据绝不落盘：localStorage 里出现了集成相关键").toEqual([]);
    /* 状态回显本身也不能漏出完整 token */
    expect(got.status).not.toContain("e2e-fake-hook");
    expect(got.status).not.toContain("e2e-not-a-real-secret");
  });

  test("③ 通知扇出真发出去，且依然零落盘", async ({ page }) => {
    const seen = await stubHooks(page);
    await page.evaluate(async (u) => { await notifyHookConnect("feishu", { url: u, secret: "" }); }, FEISHU_HOOK);
    expect(await page.evaluate(() => notifyHookGet("feishu").configured), "前提：已连接").toBe(true);
    const before = seen.length;
    await page.evaluate(() => { notifySystem("每日播报", "今日待处理 2 项", "daily"); });
    await page.waitForTimeout(700);
    expect(seen.length, "notifySystem 必须经通道扇出一条").toBeGreaterThan(before);
    const body = await page.evaluate(() => JSON.stringify(notifyHookState()));
    expect(body, "事件类别开关要在内存态里").toMatch(/daily/);
    expect(await leakKeys(page), "🔴 推送后依然零落盘").toEqual([]);
  });

  test("④ 刷新即失效：新会话回到未连接，且存储里什么都没有", async ({ page }) => {
    await stubHooks(page);
    await page.evaluate(async (u) => { await notifyHookConnect("feishu", { url: u, secret: "" }); }, FEISHU_HOOK);
    expect(await page.evaluate(() => notifyHookGet("feishu").configured)).toBe(true);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1200);
    await page.evaluate(() => { setActive("office"); render(); });
    await page.waitForTimeout(300);
    const got = await (async () => {
      await page.evaluate(() => document.querySelector('[data-set-tab="set-integration"]').click());
      return { s: await statusOf(page, "飞书"), configured: await page.evaluate(() => notifyHookGet("feishu").configured), leak: await leakKeys(page) };
    })();
    expect(got.configured, "刷新后凭据不该还在内存里").toBe(false);
    expect(got.s.status).toContain("未连接");
    expect(got.leak, "🔴 刷新后存储里也不该留下任何痕迹").toEqual([]);
  });

  test("⑤ 非法 webhook 地址：不发请求、不写存储", async ({ page }) => {
    const seen = await stubHooks(page);
    await openConfigDialog(page, "飞书");
    await page.locator("#intcfg_url").fill("http://evil.example.com/hook/x");   /* 非 https */
    await page.locator("#btnIntCfgGo").click();
    await page.waitForTimeout(600);
    expect(seen, "非 https 地址一个请求都不该发出").toEqual([]);
    expect(await leakKeys(page)).toEqual([]);
    expect(await page.evaluate(() => notifyHookGet("feishu").configured)).toBe(false);
  });

  /* http 源下钉钉依旧发不出去（钉钉任何 origin 都不回 ACAO）→ 必须仍然禁用。
     这条存在是因为「feishu 可用」与「dingtalk 可用」的判据不同轴，不能一起推。 */
  test("⑥ http 源下钉钉仍判不可用且入口禁用", async ({ page }) => {
    const seen = await stubHooks(page);
    expect(await page.evaluate(() => notifyHasMainSender()), "浏览器里没有主进程发送").toBe(false);
    expect(await page.evaluate(() => notifyChannelAvailable("dingtalk"))).toBe(false);
    await page.evaluate(() => document.querySelector('[data-set-tab="set-integration"]').click());
    const got = await statusOf(page, "钉钉");
    expect(got.status, "状态位要写「仅桌面版可用」：" + got.status).toContain("仅桌面版");
    expect(got.disabled, "入口必须禁用").toBe(true);
    expect(got.title, "禁用要给出原因：" + got.title).toMatch(/CORS|桌面/);
    const bypass = await page.evaluate(async (u) => await dingtalkConnect({ url: u, secret: "" }), DING_HOOK);
    expect(bypass, "绕过 UI 直接调也不该返回 provider").toBeNull();
    expect(await page.evaluate(() => notifyHookGet("dingtalk").configured), "更不能把 webhook 存进内存").toBe(false);
    expect(seen, "被拒的钉钉一个请求都不许发").toEqual([]);
  });
});

test.describe("通知通道 · file:// 形态（双击本地文件）", () => {
  test.beforeAll(() => { test.skip(!process.env.E2E, "set E2E=1 to run"); });

  test.beforeEach(async ({ page }) => {
    await page.goto(FILE_URL);
    await page.waitForSelector("#main", { state: "attached", timeout: 15_000 });
    await page.evaluate(() => { setActive("office"); render(); });
    await page.waitForTimeout(300);
    const proto = await page.evaluate(() => location.protocol);
    expect(proto, "前提：这组必须真的跑在 file:// 上").toBe("file:");
  });

  /* file:// 下连飞书都拿不到 CORS 头（实测），所以两个渠道都必须禁用。
     这是本文件最重要的一条：如果判据写成「飞书 = 恒可用」，双击打开的用户会配出一个
     永远发不出的通道，而单测（jsdom 固定 http://localhost）与 http 组 e2e 都照不到这个形态。 */
  test("⑦ file:// 下两个渠道都被如实禁用，且零外发", async ({ page }) => {
    const seen = await stubHooks(page);
    await page.evaluate(() => document.querySelector('[data-set-tab="set-integration"]').click());
    const fs = await statusOf(page, "飞书"), ding = await statusOf(page, "钉钉");
    expect(await page.evaluate(() => notifyOriginIsHttpish()), "前提：file:// 不是 http 源").toBe(false);
    expect(await page.evaluate(() => notifyChannelAvailable("feishu")), "file:// 下飞书发不出去").toBe(false);
    expect(await page.evaluate(() => notifyChannelAvailable("dingtalk"))).toBe(false);
    expect(fs.disabled, "飞书入口必须禁用").toBe(true);
    expect(fs.status, "飞书状态要指向 origin 问题而不是「桌面版」：" + fs.status).toContain("需以 http 方式打开");
    expect(fs.title, "禁用原因要给出可操作出路：" + fs.title).toMatch(/本地服务|http/);
    expect(fs.desc, "说明文字也要带上限制：" + fs.desc).toMatch(/CORS|http/);
    expect(ding.disabled, "钉钉入口必须禁用").toBe(true);
    expect(ding.status).toContain("仅桌面版");
    expect(seen, "file:// 形态下两个渠道都不许发出任何请求").toEqual([]);
    expect(await leakKeys(page), "被禁的渠道不该留下任何配置痕迹").toEqual([]);
  });
});
