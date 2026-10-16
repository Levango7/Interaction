#!/usr/bin/env node
/**
 * run-e2e.mjs —— 跨平台启动 Playwright e2e（v3.7.121 加双预检与看门狗）
 * --------------------------------------------------
 * 背景：原先 package.json 写的是 `"e2e": "E2E=1 npx playwright test"` ——
 *   `VAR=value cmd` 是 **Unix shell 语法**，在 Windows 的 npm 默认 shell（cmd.exe）下
 *   直接报 `'E2E' is not recognized as an internal or external command`。
 *   即：CI（ubuntu/bash）能跑，**本机 Windows 跑不了** —— 本地无法自验 e2e。
 *
 * 本启动器用 Node 设置环境变量后再 spawn，两个平台行为一致。
 *
 * v3.7.121 验证可靠性改造（起因：2026-10-12 实测两类「非绿非红」的失真）：
 *   ① **双态预检**：HTML 处于源码态时，e2e 走 file:// 直加载，应用 JS 根本不在页面里 ——
 *      57 个失败全是 `setActive/AppBridge is not defined`，看起来像天塌了，实际只是没拼回。
 *      loadApp 的单测侧早有守卫（`assertDeliveredState`），e2e 侧一直没有 → 现在补上，
 *      先 `src-split.mjs` 拼回再跑（与 package.json 的 with-injected 包装同源，但**不依赖 npm**，
 *      因为直接 `node scripts/run-e2e.mjs` 时钩子不触发）。
 *   ② **环境预检**（scripts/check-browser.mjs）：chromium 起不来就直接以 78 退出并
 *      告诉用户「本机判定通道不可用、判据以 CI 为准」——不再让测试挂 600 分钟。
 *   ③ **看门狗**：超过 E2E_WATCHDOG_MS（默认 20 分钟）主动杀掉子进程，退出码 79
 *      （= 未判定，不是通过）。
 *   CI runner 上两步预检都通过，行为与原来一致。
 *
 * 用法：npm run e2e              （等价于 E2E=1 npx playwright test，带预检与看门狗）
 *       node scripts/run-e2e.mjs --project=desktop-1280x800
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const WATCHDOG_MS = Number(process.env.E2E_WATCHDOG_MS) || 20 * 60 * 1000;
const un = process.platform === "win32";
const runNode = (args2) => new Promise((resolve) => {
  const c = spawn(un ? "node.exe" : "node", args2, { stdio: "inherit", shell: un, cwd: ROOT, env: process.env });
  c.on("exit", (code) => resolve(code === null ? 1 : code));
  c.on("error", () => resolve(1));
});

(async () => {
  /* ① 双态预检：源码态先拼回（不拼 = 57 个 not defined 的假红） */
  const htmlPath = path.join(ROOT, "agent-workbench.html");
  const bytes = fs.statSync(htmlPath).size;
  if (bytes < 1200000) {
    console.log("[run-e2e] HTML 处于源码态（" + (bytes / 1024).toFixed(0) + "KB < 1200KB）—— 先拼回再跑（e2e 走 file:// 直加载）。");
    const r = await runNode([path.join(ROOT, "scripts", "src-split.mjs")]);
    if (r !== 0) { console.error("[run-e2e] 拼回失败（exit=" + r + "）—— 不启动 e2e。"); process.exit(r); }
  }

  /* ② 环境预检：chromium 起不来就明确退出（78），不留一个会挂死的进程 */
  const pre = await runNode([path.join(ROOT, "scripts", "check-browser.mjs")]);
  if (pre !== 0) {
    console.error("[run-e2e] 预检未通过（exit=" + pre + "）—— 不启动 e2e。判据以 CI 为准。");
    process.exit(pre);
  }

  start();
})();

function start() {
  const child = spawn(un ? "npx.cmd" : "npx", ["playwright", "test", ...args], {
    stdio: "inherit", env: { ...process.env, E2E: "1" }, shell: un
  });
  let killed = false;
  const watchdog = setTimeout(() => {
    killed = true;
    console.error("\n[run-e2e] 看门狗超时（" + Math.round(WATCHDOG_MS / 1000) + "s）—— 主动终止。");
    console.error("[run-e2e] 判定=未判定（不是通过）。先跑 node scripts/check-browser.mjs 判环境。");
    try { child.kill(); } catch (e) { /* 已退出 */ }
  }, WATCHDOG_MS);
  child.on("exit", (code) => {
    clearTimeout(watchdog);
    process.exit(killed ? 79 : (code === null ? 79 : code));
  });
  child.on("error", (err) => { console.error("[run-e2e] 启动失败：" + err.message); process.exit(1); });
}
