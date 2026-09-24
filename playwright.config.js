// @ts-check
const { defineConfig, devices } = require("@playwright/test");
const path = require("path");

/**
 * Playwright E2E 配置
 *
 * 设计要点：
 * - 只装 chromium（CI 省时），headless 默认开
 * - baseURL 用 file 协议直接加载单文件 agent-workbench.html，无需起本地服务器
 * - 每个测试 30s 超时；整体上限 600s（v3.7.42 从 180s 放宽，见下方 globalTimeout 注释）
 * - testDir 指向 tests/e2e，与 vitest 的单元测试完全隔离
 * - E2E 守护由测试文件内 beforeAll + test.skip 控制，默认跳过
 * - retry：**CI 下 2 次、本地 0 次**。原先两边都是 0；实测 CI 上 e2e 出现过两次偶发失败
 *   （同一 commit 本地 10/10 全过、重跑即绿），而 GitHub 的 job 日志又常拉不到，排查成本高。
 *   按 Playwright 官方建议给 CI 加 2 次重试吸收环境抖动；**本地保持 0**，避免掩盖真实不稳定。
 *   workers=1：开启时保持串行可预测
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
  retries: process.env.CI ? 2 : 0,   // CI 吸收环境抖动；本地保持 0（见上方注释）
  workers: 1,
  reporter: [["list"]],
  timeout: 30_000,
  expect: { timeout: 5_000 },
  /* globalTimeout：整套 e2e 的**总**上限（防挂死）。
     v3.7.42：原为 180_000（180s），实测**本机跑不完全部 3 个项目的 14 个用例** ——
       单个用例仅 2~9s，但每个用例都要新起一个 chromium 实例加载 3.3MB 单文件，
       启动开销累积起来 >3 分钟。表现为「7 passed / 7 did not run / Timed out waiting 180s」，
       看起来像"测试崩了"，实际只是**全局超时太紧**。
     即：CI（ubuntu 跑得更快 + 只跑 e2e job）能过，**本机无法自验 e2e**。
     现放宽到 600s，并支持 `E2E_GLOBAL_TIMEOUT` 覆盖（CI 想收紧可自行设）。

     ⚠️ v3.7.42 实测记录 —— 本机「测试全过但退出码 1」是**环境问题，不是代码问题**：
       现象：14 个用例全部 `ok`，随后报
         `Error: worker-0 process did not exit within 300000ms after stop, force-killed it`
       并最终 `EXIT=1`；CI（ubuntu）同版本代码全绿。
       定位过程（`_probe/probe-exit*.mjs`，只读对照实验）：
         · 打开 `about:blank` → `ctx.close()` 2456ms 返回 OK；
         · 紧接的 `await browser.close()` **永不 resolve**（15s 未返回）；
         · `browser.process()` 返回 null（拿不到底层句柄，无法自行 kill）；
         · 逐层降级后仍卡 → 与本应用代码/定时器/beforeunload 全部无关。
       → 结论：**本机沙箱内 chromium 的关闭路径不通**（与「拦 spawnSync 子进程」同源的环境限制）。
         判据：只要输出里 `ok N` 数量 == 用例总数、且无 failed 用例，就视为**本机通过**；
         退出码以 **CI 为准**。
     补充（v3.7.42 实测）：Playwright 清理上次 `test-results/` 时会被本机 safe-delete shim 拦下
       （报 `[safe-delete] 操作失败 ... trash` 且 exit 1）→ **再跑一次即可**（目录已存在时不触发）。

     🔴 v3.7.43 补充实测 —— 本机**跑不了"多条"用例，但可以逐条跑**（关键排障姿势）：
       现象：`Running 4 tests` 后长时间无输出，最终
         `Timed out waiting 600s for the test suite to run` + `4 did not run`；
         看起来像"整套崩了/用例挂死"。
       真相：第 1 条用例往往**已经 `ok`**（如 `ok 1 ... (5.0s)`），卡住的是
         **该 worker 收尾时的 `browser.close()`（永不 resolve，见上面 v3.7.42 记录）**，
         于是 runner 等不到 worker 释放 → 后续用例一条都起不来（`did not run`）。
       验证方式（**推荐的本机自验姿势**）：
         · `-g "用例名关键词"` **一次只跑一条**，看是否出现 `ok 1`；
         · 或绕开 runner，用裸 `playwright` 库写等价的探针脚本（本项目 `_probe/*.mjs`），
           实测 14s 即可跑完全部断言 —— 比等 600s 超时高效得多。
       → 也就是说：本机**看到 `ok N` 就算该条通过**；"后续 did not run" 是环境副作用，
         **不要**据此判断代码有问题，还是要以 CI 的三项目全量为准。 */
  globalTimeout: Number(process.env.E2E_GLOBAL_TIMEOUT || 600_000),
  use: {
    headless: true,
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
    baseURL: appFileUrl,
    launchOptions: { args: ["--no-sandbox", "--disable-setuid-sandbox"] },
  },
  /* v3.7.6：多视口矩阵。桌面/平板跑完整用户流程（workflow.spec.js）；
     手机竖屏用真实移动预设（Pixel 5：移动 UA + isMobile + 触摸）只跑移动专属断言（mobile.spec.js）——
     因为 ≤767px 时侧栏 #side 不可见，改走「底部 5 组导航 #mobBar + 底部抽屉 #sideSheet」的 IA。
     v3.7.42：theme-matrix.spec.js 与视口无关（跑的是「主题 → 令牌 → 对比度/可见性」），
     仅在 desktop 项目跑一次即可 —— 否则 3 视口 × 4 用例会让 e2e 时长无谓翻倍。 */
  projects: [
    {
      name: "desktop-1280x800",
      use: { ...devices["Desktop Chrome"], channel: undefined, viewport: { width: 1280, height: 800 } },
      testIgnore: /mobile\.spec\.js/,
    },
    {
      name: "tablet-768x1024",
      use: { ...devices["Desktop Chrome"], channel: undefined, viewport: { width: 768, height: 1024 } },
      testIgnore: /mobile\.spec\.js|theme-matrix\.spec\.js/,
    },
    {
      name: "mobile-375x667",
      use: { ...devices["Pixel 5"], viewport: { width: 375, height: 667 } },
      /* 移动项目跑「移动专属断言 + 跨视口不变量」 */
      testMatch: /mobile\.spec\.js|viewport\.spec\.js/,
    },
  ],
});
