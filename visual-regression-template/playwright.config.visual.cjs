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
 * 双态架构适配（Interaction 专属；其他项目自动空转）：
 *   globalSetup 指向模板桥 helpers/visual-global-setup.cjs —— 它做存在性守卫：
 *   项目根有 tests/e2e/global-setup.cjs（HTML 源码态时先拼回交付态）就调用它，并在
 *   **本轮真的拼回过**时写标记文件 verify-out/.visual-injected；没有则该文件的项目
 *   （非双态架构）整体空转，无需改配置。
 *   globalTeardown 指向 helpers/visual-global-teardown.cjs —— 与 setup 完全对称：
 *   读到标记才按文档链顺序抽回（pet-art --extract && src-split --extract --no-backup），
 *   读完即删；无标记静默跳过。**跑完自动还原源码态，使用者无需手动抽回**，
 *   「提交前工作区必须源码态」这条铁律不依赖使用者记性。
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

/* 双态架构桥：setup 拼回（仅本轮真拼回时写标记）+ teardown 对称抽回（有标记才抽）。
   两个桥内部各自做存在性守卫，模板复制到非双态项目时自动空转。 */
const setupBridge = path.join(__dirname, "helpers", "visual-global-setup.cjs");
const teardownBridge = path.join(__dirname, "helpers", "visual-global-teardown.cjs");
const globalSetup = fs.existsSync(setupBridge) ? setupBridge : undefined;
const globalTeardown = fs.existsSync(teardownBridge) ? teardownBridge : undefined;

module.exports = defineConfig({
  globalSetup,
  globalTeardown,
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
