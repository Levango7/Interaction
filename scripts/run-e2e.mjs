#!/usr/bin/env node
/**
 * run-e2e.mjs — 跨平台 e2e 入口
 *
 * package.json 原写法 "E2E=1 npx playwright test" 是 Unix shell 语法，
 * Windows CMD 下 `E2E=1` 会被当成无法识别的命令导致 npm run e2e 直接失败。
 * 此脚本以 Node 设置环境变量后透传 playwright test，行为等价、零新依赖。
 */
import { spawn } from "node:child_process";

const child = spawn("npx playwright test", {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, E2E: "1" }
});
child.on("exit", (code) => process.exit(code ?? 1));
