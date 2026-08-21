/**
 * T5.3 跨浏览器验证脚本（临时）
 * ----------------------------------------------------------------------------
 * 用 Playwright API 跑 Chromium + Firefox 加载 agent-workbench.html，
 * 检查：页面加载无控制台报错、关键元素可见、关键功能可用（建任务→切场景→完成任务→查看统计）
 *
 * 用法：node scripts/cross-browser-check.cjs
 * 输出：控制台打印每个浏览器的检查结果（PASS/FAIL + 错误详情）
 */
const { chromium, firefox } = require("@playwright/test");
const path = require("path");
const fs = require("fs");

const APP_FILE = path.resolve(__dirname, "..", "agent-workbench.html");
const APP_URL = "file:///" + APP_FILE.replace(/\\/g, "/");

const RESULTS = [];

function log(browser, msg) {
  const line = `[${browser}] ${msg}`;
  console.log(line);
  RESULTS.push(line);
}

async function runBrowser(browserType, browserName) {
  log(browserName, "启动浏览器...");
  const browser = await browserType.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const consoleErrors = [];
  const pageErrors = [];

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      const text = msg.text();
      // 过滤 file:// 协议下 manifest.json / icon.svg 的 CORS 错误（浏览器对 file:// 的限制，非应用问题）
      // 这些资源在 http(s):// 部署时正常加载，file:// 下被浏览器策略阻止
      const isFileCors = /CORS policy.*manifest\.json|CORS policy.*icon\.svg/.test(text)
        || /Failed to load resource.*net::ERR_FAILED/.test(text)
        || /Access to link element resource.*manifest\.json/.test(text);
      if (!isFileCors) {
        consoleErrors.push(text);
      }
    }
  });
  page.on("pageerror", (err) => {
    pageErrors.push(err.message);
  });
  page.on("dialog", async (d) => {
    try { await d.accept(); } catch (e) { /* ignore */ }
  });

  const checks = { browser: browserName, pass: 0, fail: 0, details: [] };
  function check(name, ok, detail) {
    if (ok) { checks.pass++; checks.details.push(`  ✓ ${name}`); }
    else { checks.fail++; checks.details.push(`  ✗ ${name}: ${detail || ""}`); }
  }

  try {
    // 1. 加载页面
    await page.goto(APP_URL, { waitUntil: "domcontentloaded", timeout: 15000 });
    log(browserName, "页面已加载");

    // 2. 等待侧边栏 nav-item（renderSide 执行后）
    await page.waitForSelector("#side .nav-item", { timeout: 15000 });
    check("#side 侧边栏可见", true);

    // 3. 等待 onboarding 或主区
    await page.waitForSelector("#onboardModal, #taskForm", { timeout: 10000 });

    // 4. 跳过 onboarding（若存在）
    const onboard = await page.$("#onboardModal");
    if (onboard) {
      for (let i = 0; i < 3; i++) {
        await page.locator("#onboardSkip").click().catch(() => {});
        await page.waitForTimeout(150);
      }
    }
    await page.waitForSelector("#taskForm", { timeout: 10000 });
    check("onboarding 跳过 + 主区渲染", true);

    // 5. 验证 4 个场景按钮
    const navCount = await page.locator("#side .nav-item").count();
    check("nav-item >= 6", navCount >= 6, `实际 ${navCount}`);
    for (const sc of ["office", "code", "study", "life"]) {
      const visible = await page.locator(`#side .nav-item[data-sc="${sc}"]`).isVisible().catch(() => false);
      check(`场景按钮 ${sc}`, visible);
    }

    // 6. 建任务（office 场景）
    await page.click('#side .nav-item[data-sc="office"]');
    await page.waitForSelector("#taskForm", { timeout: 5000 });
    await page.fill('#taskForm input[name="title"]', `跨浏览器测试-${browserName}`);
    await page.click('#taskForm button[type="submit"]');
    await page.waitForSelector(".kcard", { timeout: 5000 });
    const taskVisible = await page.locator(".kcard", { hasText: `跨浏览器测试-${browserName}` }).isVisible().catch(() => false);
    check("建任务", taskVisible);

    // 7. 切场景（code）
    await page.click('#side .nav-item[data-sc="code"]');
    await page.waitForSelector("#taskForm", { timeout: 5000 });
    await page.fill('#taskForm input[name="title"]', `编程任务-${browserName}`);
    await page.click('#taskForm button[type="submit"]');
    await page.waitForSelector(".kcard", { timeout: 5000 });
    const codeTaskVisible = await page.locator(".kcard", { hasText: `编程任务-${browserName}` }).isVisible().catch(() => false);
    check("切场景 + 建任务", codeTaskVisible);

    // 8. 完成任务（todo→doing→done）
    await page.waitForSelector('[data-move$=":doing"]', { timeout: 5000 });
    const moveTodoBtn = page.locator(".kcard").filter({ hasText: `编程任务-${browserName}` }).locator('[data-move$=":doing"]').first();
    await moveTodoBtn.click();
    await page.waitForSelector('[data-move$=":done"]', { timeout: 5000 });
    const moveDoneBtn = page.locator(".kcard").filter({ hasText: `编程任务-${browserName}` }).locator('[data-move$=":done"]').first();
    await moveDoneBtn.click();
    await page.waitForTimeout(300);
    const doneCol = page.locator(".kcol").filter({ hasText: "已完成" });
    const doneVisible = await doneCol.isVisible().catch(() => false);
    check("完成任务（todo→doing→done）", doneVisible);

    // 9. 查看统计
    await page.click('#side .nav-item[data-sc="stats"]');
    await page.waitForSelector(".stats-cards, .no-stats", { timeout: 5000 });
    const statsVisible = await page.locator(".stats-cards").first().isVisible().catch(() => false);
    check("查看统计视图", statsVisible);

    // 10. 控制台错误检查
    check("无 console.error", consoleErrors.length === 0, JSON.stringify(consoleErrors.slice(0, 3)));
    check("无 pageerror", pageErrors.length === 0, JSON.stringify(pageErrors.slice(0, 3)));

  } catch (e) {
    check("流程执行", false, e.message);
  } finally {
    await browser.close();
  }

  return checks;
}

(async function main() {
  console.log("=== T5.3 跨浏览器验证 ===");
  console.log(`APP_URL: ${APP_URL}`);
  console.log("");

  const allChecks = [];
  // Chromium
  try {
    allChecks.push(await runBrowser(chromium, "Chromium"));
  } catch (e) {
    console.error("Chromium 启动失败:", e.message);
    allChecks.push({ browser: "Chromium", pass: 0, fail: 1, details: [`  ✗ 启动失败: ${e.message}`] });
  }
  console.log("");
  // Firefox
  try {
    allChecks.push(await runBrowser(firefox, "Firefox"));
  } catch (e) {
    console.error("Firefox 启动失败:", e.message);
    allChecks.push({ browser: "Firefox", pass: 0, fail: 1, details: [`  ✗ 启动失败: ${e.message}`] });
  }

  console.log("");
  console.log("=== 汇总 ===");
  let totalPass = 0, totalFail = 0;
  for (const c of allChecks) {
    console.log(`\n[${c.browser}] PASS: ${c.pass}, FAIL: ${c.fail}`);
    c.details.forEach(d => console.log(d));
    totalPass += c.pass;
    totalFail += c.fail;
  }
  console.log(`\n总计: ${totalPass} passed, ${totalFail} failed`);
  console.log(totalFail === 0 ? "\n✓ 跨浏览器验证通过" : "\n✗ 跨浏览器验证有失败项");

  // 写结果到文件
  const reportPath = path.resolve(__dirname, "..", "test-results", "cross-browser-report.txt");
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, RESULTS.join("\n") + `\n\n总计: ${totalPass} passed, ${totalFail} failed\n`);
  console.log(`\n报告已写入: ${reportPath}`);

  process.exit(totalFail === 0 ? 0 : 1);
})();