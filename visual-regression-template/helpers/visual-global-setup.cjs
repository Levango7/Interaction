/**
 * visual-global-setup.cjs —— 模板 globalSetup 桥（双态架构项目专用，其他项目自动空转）
 * ----------------------------------------------------------------------------
 * 职责：把「跑视觉回归前的拼回」与「拼回状态的标记」绑在一起，供 globalTeardown 对称还原。
 *
 *   ① 非双态项目（项目根没有 tests/e2e/global-setup.cjs）→ 直接返回，零副作用；
 *   ② 双态项目 → 调用仓库自己的 global-setup.cjs（它负责：HTML 处于源码态时先拼回，
 *      已是交付态则 no-op）；
 *   ③ **只有本轮真的拼回过**（HTML 从 <1.2MB 源码态变为 ≥1.2MB 交付态）才写标记文件
 *      verify-out/.visual-injected —— 用户本就停留在交付态时不动他的工作区。
 *
 * 为什么用标记文件而不是模块级变量：Playwright 的 globalSetup 与 globalTeardown
 * 不保证同进程，模块级状态会丢；标记文件是跨进程唯一可靠的传递方式。
 *
 * 阈值 1.2MB 与仓库 tests/e2e/global-setup.cjs、scripts/check-source-state.mjs 同口径，
 * 不另立标准。
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

/* 模板根 = 本文件所在目录的上一级（helpers/ 的父级）；项目根 = 再上一级。 */
const PROJECT_ROOT = path.resolve(__dirname, "..", "..");
const REPO_SETUP = path.join(PROJECT_ROOT, "tests", "e2e", "global-setup.cjs");
const HTML = path.join(PROJECT_ROOT, "agent-workbench.html");
const MARKER = path.join(PROJECT_ROOT, "verify-out", ".visual-injected");
const THRESHOLD = 1_200_000;   /* 与仓库 global-setup.cjs / check-source-state.mjs 同口径 */

function sizeOf(p) {
  try { return fs.statSync(p).size; } catch (e) { return 0; }
}

module.exports = async () => {
  /* ① 非双态项目：没有仓库拼回钩子 → 不拼回、不写标记（teardown 随之静默跳过） */
  if (!fs.existsSync(REPO_SETUP)) return;

  /* ② 调用仓库自己的 globalSetup（源码态→拼回；交付态→no-op）。
        用 require 拿函数引用而不是再 spawn 一个 node —— 同一进程内完成，错误直接抛出。 */
  const repoSetup = require(REPO_SETUP);
  const before = sizeOf(HTML);
  await repoSetup();
  const after = sizeOf(HTML);

  /* ③ 仅当本轮发生「源码态 → 交付态」跃迁才写标记。
        用户本就交付态（before ≥ 阈值）时不写 —— 那不是我们改的状态，teardown 也不该动。 */
  if (before < THRESHOLD && after >= THRESHOLD) {
    try {
      fs.mkdirSync(path.dirname(MARKER), { recursive: true });
      fs.writeFileSync(MARKER,
        "assembled-by-visual-run\n" + new Date().toISOString() + "\n", "utf8");
    } catch (e) {
      /* 标记写不出去 = teardown 不会抽回 → 必须此刻就大声说，不能等跑完才发现工作区脏了 */
      console.error("[visual globalSetup] 拼回完成，但标记文件写入失败（" + MARKER + "）：" + e.message);
      console.error("[visual globalSetup] globalTeardown 将无法自动抽回 —— 跑完后请手动执行：npm run src:extract");
    }
  }
};
