#!/usr/bin/env node
/* check-browser.mjs —— 本机 Playwright 判定通道预检（v3.7.121 验证可靠性改造）
 * ----------------------------------------------------------------------------
 * 为什么存在：2026-10-12 本机 e2e harness 卡死（600s、worker/teardown 双挂），
 * 输出只有「96 did not run」—— 既非绿也非红，无法判定。根因是浏览器环境被误伤
 * （taskkill 打了 headless_shell）。本脚本把「环境能不能跑 e2e」变成**一句话**：
 *
 *   退出码 0  → 通道可用（chromium 能启动、能开页、能取 title、能关）
 *   退出码 78 → 通道不可用（不要在本机跑 e2e；判据以 CI 为准）
 *
 * 用法：node scripts/check-browser.mjs
 */
"use strict";
import { chromium } from "@playwright/test";

const TIMEOUT_MS = Number(process.env.CHECK_BROWSER_TIMEOUT_MS) || 45000;

function withTimeout(p, ms, label) {
  return Promise.race([
    p,
    new Promise((_, rej) => setTimeout(() => rej(new Error(label + " 超时（" + Math.round(ms / 1000) + "s）")), ms))
  ]);
}

(async () => {
  let browser = null;
  try {
    browser = await withTimeout(chromium.launch({ headless: true }), TIMEOUT_MS, "chromium.launch");
    const page = await withTimeout(browser.newPage(), TIMEOUT_MS, "newPage");
    await withTimeout(page.goto("data:text/html,<title>probe</title><h1>ok</h1>"), TIMEOUT_MS, "goto");
    const title = await withTimeout(page.title(), TIMEOUT_MS, "title");
    if (title !== "probe") throw new Error("title 读不到（拿到 " + JSON.stringify(title) + "）");
    await withTimeout(browser.close(), TIMEOUT_MS, "close");
    console.log("[check-browser] ✓ 本机 Playwright 判定通道可用（launch/goto/title/close 全通）");
    process.exit(0);
  } catch (e) {
    if (browser) { try { await browser.close(); } catch (e2) { /* 已在坏状态 */ } }
    console.error("[check-browser] ✗ 本机 Playwright 判定通道**不可用**：" + (e && e.message || e));
    console.error("[check-browser] 结论：本机 e2e 结果不可信（既非通过也非失败，是未判定）。");
    console.error("[check-browser] 处置：不要在本机跑 e2e；判据以 CI 为准。修复：npx playwright install chromium");
    console.error("[check-browser]      （修复后重跑本脚本确认 0，再跑 e2e）");
    process.exit(78);
  }
})();
