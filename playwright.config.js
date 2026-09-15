// @ts-check
const { defineConfig, devices } = require("@playwright/test");
const path = require("path");

/**
 * Playwright E2E 配置
 *
 * 设计要点：
 * - 只装 chromium（CI 省时），headless 默认开
 * - baseURL 用 file 协议直接加载单文件 agent-workbench.html，无需起本地服务器
 * - 每个测试 30s 超时，整体 180s，避免偶发慢启动误报
 * - testDir 指向 tests/e2e，与 vitest 的单元测试完全隔离
 * - E2E 守护由测试文件内 beforeAll + test.skip 控制，默认跳过
 * - retry=0、workers=1：开启时保持串行可预测
 *
 * baseURL 解析：把 agent-workbench.html 的绝对路径转成 file URL。
 *   Windows 路径 F:\foo\bar.html 转成 file:///F:/foo/bar.html
 *   测试里 page.goto("./agent-workbench.html") 直接打开应用。
 */
const appDir = path.resolve(__dirname).replace(/\\/g, "/");
const appFileUrl = "file:///" + appDir + "/";

module.exports = defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  timeout: 30_000,
  expect: { timeout: 5_000 },
  globalTimeout: 180_000,
  use: {
    headless: true,
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
    baseURL: appFileUrl,
    launchOptions: { args: ["--no-sandbox", "--disable-setuid-sandbox"] },
  },
  /* v3.7.6：多视口矩阵。桌面/平板跑完整用户流程（workflow.spec.js）；
     手机竖屏用真实移动预设（Pixel 5：移动 UA + isMobile + 触摸）只跑移动专属断言（mobile.spec.js）——
     因为 ≤767px 时侧栏 #side 不可见，改走「底部 5 组导航 #mobBar + 底部抽屉 #sideSheet」的 IA。 */
  projects: [
    {
      name: "desktop-1280x800",
      use: { ...devices["Desktop Chrome"], channel: undefined, viewport: { width: 1280, height: 800 } },
      testIgnore: /mobile\.spec\.js/,
    },
    {
      name: "tablet-768x1024",
      use: { ...devices["Desktop Chrome"], channel: undefined, viewport: { width: 768, height: 1024 } },
      testIgnore: /mobile\.spec\.js/,
    },
    {
      name: "mobile-375x667",
      use: { ...devices["Pixel 5"], viewport: { width: 375, height: 667 } },
      testMatch: /mobile\.spec\.js/,
    },
  ],
});
