#!/usr/bin/env node
/**
 * run-e2e.mjs —— 跨平台启动 Playwright e2e
 * --------------------------------------------------
 * 背景：原先 package.json 写的是 `"e2e": "E2E=1 npx playwright test"` ——
 *   `VAR=value cmd` 是 **Unix shell 语法**，在 Windows 的 npm 默认 shell（cmd.exe）下
 *   直接报 `'E2E' is not recognized as an internal or external command`。
 *   即：CI（ubuntu/bash）能跑，**本机 Windows 跑不了** —— 本地无法自验 e2e。
 *
 * 本启动器用 Node 设置环境变量后再 spawn，两个平台行为一致。
 * 用法：npm run e2e  （等价于 E2E=1 npx playwright test）
 */
import { spawn } from "node:child_process";

const args = process.argv.slice(2);
const child = spawn(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["playwright", "test", ...args],
  { stdio: "inherit", env: { ...process.env, E2E: "1" }, shell: process.platform === "win32" }
);
child.on("exit", (code) => process.exit(code === null ? 1 : code));
child.on("error", (err) => { console.error("[run-e2e] 启动失败：" + err.message); process.exit(1); });
