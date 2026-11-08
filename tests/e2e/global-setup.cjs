/**
 * global-setup.cjs —— e2e 跑之前把 HTML 拼回交付态（v3.7.121 验证可靠性改造）
 * ----------------------------------------------------------------------------
 * 为什么放在这里（而不是 npm 的 pre/post 钩子）：钩子只在 npm run e2e 路径上生效 ——
 * 直接 node scripts/run-e2e.mjs、经 scripts/verify-run.mjs 包装、或裸 npx playwright test
 * 全都绕过了它。2026-10-12 实测：HTML 停在源码态（635KB）时 e2e 走 file:// 直加载，
 * 页面里只有 SRC 占位标记、没有应用 JS → 57~70 个用例报 setActive is not defined / AppBridge is not defined / window.apiLogin is not a function，
 * 看起来像天塌了，实际只是**没拼回**。globalSetup 是 Playwright 每次运行都走的入口，
 * 放这里 = 绕过任何 runner 都仍然生效。
 *
 * 判据与 scripts/check-source-state.mjs 完全一致（1.2MB），不另立标准。
 * CI 上 HTML 本就是交付态，这一步是 no-op（拼回脚本自身也很快）。
 */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..", "..");
const HTML = path.join(ROOT, "agent-workbench.html");
const INJECT = path.join(ROOT, "scripts", "src-split.mjs");
const THRESHOLD = 1_200_000;

module.exports = async () => {
  /* E2E 硬守卫（DL-O16，2026-11-08）：裸跑 `npx playwright test` 时，各 spec 里的
     `test.skip(!process.env.E2E, "set E2E=1 to run")` 会集体跳过，而 playwright 的
     退出码**仍是 0** —— 看起来"全部通过"，实际一个用例都没跑（2026-10-12 实测 96 个全 skipped / exit=0）。
     已有两道防线都只覆盖正式入口：
       · `npm run e2e` → run-e2e.mjs 注入 E2E=1（安全）；
       · verify-run.mjs 把「全 skip 且 passed=0」判成 `? / exit=79`，不算通过。
     唯独人手裸跑没人防，故在此拦死 —— globalSetup 是**任何入口都必经**的一步。
     注：只列用例（`--list`）不执行 globalSetup，不受影响。 */
  if (!process.env.E2E) {
    throw new Error(
      "[e2e globalSetup] 未设置 E2E：直接 `npx playwright test` 会让所有用例静默 skip，" +
      "退出码仍是 0（假绿，等于没跑）。\n" +
      "  正确用法：npm run e2e（脚本自动注入 E2E=1），或 E2E=1 npx playwright test。\n" +
      "  只想列用例：E2E=1 npx playwright test --list"
    );
  }
  let bytes = 0;
  try { bytes = fs.statSync(HTML).size; } catch (e) {
    throw new Error("[e2e globalSetup] 找不到 agent-workbench.html：" + HTML);
  }
  if (bytes >= THRESHOLD) return;   // 已是交付态：no-op
  console.log("[e2e globalSetup] HTML 处于源码态（" + (bytes / 1024).toFixed(0) +
    "KB < 1200KB）—— 先拼回再跑（否则应用 JS 不在页面里，用例会批量假红）。");
  const r = spawnSync(process.execPath, [INJECT], { cwd: ROOT, stdio: "inherit" });
  if (r.status !== 0) {
    throw new Error("[e2e globalSetup] 拼回失败（exit=" + r.status + "）—— 终止 e2e。");
  }
  const after = fs.statSync(HTML).size;
  console.log("[e2e globalSetup] 拼回完成（" + (after / 1024 / 1024).toFixed(2) + "MB）");
};
