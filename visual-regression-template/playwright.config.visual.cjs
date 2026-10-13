// @ts-check
/**
 * playwright.config.visual.cjs —— 视觉回归模板的独立 Playwright 配置
 * ----------------------------------------------------------------------------
 * 为什么独立于主 config：视觉回归有自己的触发节奏（配色改版才跑，CI 可限定 paths），
 *   与功能 e2e 混在一个 config 里会互相拖慢。本配置只收 specs/ 目录下后缀为
 *   .visual.spec.js 的文件（像素基线插件也按此后缀命名），对主 e2e（tests/e2e/）
 *   零污染。
 *
 * 与主 config 的一致性：viewport 1280×800、file:// 直加载单文件、workers=1、
 *   CI 重试 2 次 / 本地 0 次，均与 tests/e2e 主配置同口径 —— 渲染层不变量不该因
 *   配置差异而结果不同。
 *
 * 双态架构适配（Interaction 专属；其他项目自动跳过）：
 *   若项目根存在 tests/e2e/global-setup.cjs（HTML 处于源码态时先拼回交付态），
 *   自动挂为 globalSetup；文件不存在时 globalSetup 为 undefined。
 *   这样模板复制到没有双态架构的项目也能直接跑，无需改配置。
 *
 * 环境变量：
 *   CI                        —— 重试次数切换（CI=2，本地=0）
 *   VISUAL_GLOBAL_TIMEOUT     —— 整套视觉回归总上限（默认 600000ms）
 *   VISUAL_APP_ENTRY          —— 入口页面文件名（spec 内读取，默认 agent-workbench.html）
 */
const { defineConfig, devices } = require("@playwright/test");
const fs = require("node:fs");
const path = require("path");

/* 模板根 = 本文件所在目录；项目根 = 上一级（复制到其他项目时相对结构不变）。 */
const PROJECT_ROOT = path.resolve(__dirname, "..").replace(/\\/g, "/");
const appFileUrl = "file:///" + PROJECT_ROOT + "/";

/* Interaction 双态架构：HTML 源码态时先拼回再跑（与主 e2e 同一 globalSetup）。
   该文件不存在（其他项目）时不挂 globalSetup。 */
const injectSetup = path.join(PROJECT_ROOT, "tests", "e2e", "global-setup.cjs");
const globalSetup = fs.existsSync(injectSetup) ? injectSetup : undefined;

module.exports = defineConfig({
  globalSetup,
  testDir: "./specs",
  testMatch: "**/*.visual.spec.js",
  fullyParallel: false,
  forbidOnly: true,
  retries: process.env.CI ? 2 : 0,   // CI 吸收环境抖动；本地保持 0，避免掩盖真实不稳定
  workers: 1,
  reporter: [["list"]],
  timeout: 30_000,
  expect: { timeout: 5_000 },
  globalTimeout: Number(process.env.VISUAL_GLOBAL_TIMEOUT || 600_000),
  use: {
    headless: true,
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
    baseURL: appFileUrl,
    screenshot: { mode: "only-on-failure", fullPage: false },
    launchOptions: { args: ["--no-sandbox", "--disable-setuid-sandbox"] },
  },
  projects: [
    {
      name: "desktop-1280x800",
      use: { ...devices["Desktop Chrome"], channel: undefined, viewport: { width: 1280, height: 800 } },
    },
  ],
});
