/**
 * P1-a 范围收敛 · 回归验证
 * ----------------------------------------------------------------------------
 * 验证 MVP_SCOPE 边界声明已落地并暴露，且既有关键逻辑（pendingConfirm 危险操作闸门）
 * 未被 P1-a 误删（P1-a 仅做范围收敛文档，不动活跃代码）。
 *
 * 设计原则（遵循 test-discipline / anti-gaming）：
 *  - 黑盒优先：经 jsdom 全局访问 window.__test.MVP_SCOPE / _resetCrypto。
 *  - 对「逻辑未被删除」这类契约，直接读生产源码断言关键字符串存在。
 *  - 不修改任何生产文件；本文件为新增测试。
 *
 * 运行：npx vitest run tests/p1a-scope.test.js
 */

import { describe, it, expect, beforeEach } from "vitest";
import { loadApp } from "./helpers/loadApp.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HTML = path.resolve(__dirname, "..", "agent-workbench.html");

function freshWin() {
  const win = loadApp();
  win.localStorage.clear();
  return win;
}

describe("P1-a 范围收敛", () => {
  let win;
  let htmlSrc;
  beforeEach(() => {
    win = freshWin();
    htmlSrc = fs.readFileSync(HTML, "utf8");
  });

  it("MVP_SCOPE 已定义并暴露，含非空 IN_SCOPE / OUT_OF_SCOPE", () => {
    const s = win.__test.MVP_SCOPE;
    expect(s, "MVP_SCOPE 应暴露为对象").toBeTruthy();
    expect(Array.isArray(s.IN_SCOPE) && s.IN_SCOPE.length > 0, "IN_SCOPE 非空").toBe(true);
    expect(Array.isArray(s.OUT_OF_SCOPE) && s.OUT_OF_SCOPE.length > 0, "OUT_OF_SCOPE 非空").toBe(true);
  });

  it("MVP_SCOPE 声明 overview 瞬态视图契约例外，且自动备份已纳入范围", () => {
    const s = win.__test.MVP_SCOPE;
    expect(s.KNOWN_CONTRACT_EXCEPTIONS.some((x) => x.includes("overview")), "声明 overview 瞬态视图契约").toBe(true);
    expect(s.IN_SCOPE.some((x) => x.includes("自动备份")), "自动备份已纳入范围（P1-b）").toBe(true);
  });

  it("_resetCrypto 仍暴露（既有测试依赖未被破坏）", () => {
    expect(typeof win.__test._resetCrypto, "_resetCrypto 应为函数").toBe("function");
  });

  it("pendingConfirm 危险操作闸门仍是活跃代码（P1-a 仅收敛文档，未删除逻辑）", () => {
    expect(htmlSrc).toContain("let pendingConfirm = null");
    expect(htmlSrc).toContain('pendingConfirm={op:"delete_task"');
  });
});
