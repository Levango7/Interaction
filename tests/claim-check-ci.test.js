/**
 * claim-check-ci.test.js —— 认领门 CI 适配层的契约守卫（E3，2026-11-06）
 * ----------------------------------------------------------------------------
 * 为什么要有它：E3 实装时差点把一个**不存在的 --ci 模式**写进 workflow（凭接口印象写，
 * 落笔前没核）——workflow 引用一个不存在的脚本/参数，CI 会直接红在跑不起来。这个测试
 * 把「CI 步骤引用的东西真实存在且行为符合预期」钉进单测，先于 CI 红就红。
 *
 * 与被测代码的关系：直接 import { main } 调用（不派生子进程、不经 shell），
 * 用 vi.spyOn(console) 截输出做断言；workflow 侧的形态约束用文本断言钉住。
 *
 * 三条契约：
 *   ① workflow 两处 `- run:` 引用的脚本真实存在，且都是 verify-ci-order 能解析的单行形态；
 *   ② 取不到基线（--base 给全零串）→ **显式跳过**（返回 0 + 打印原因），不静默放行也不误红；
 *   ③ 默认形态在本仓（HEAD~1..HEAD）可跑通且认领门子进程被真正调起（输出含 claim-check 标记）。
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { main } from "../scripts/claim-check-ci.mjs";

const ROOT = process.cwd();
const SCRIPT = resolve(ROOT, "scripts", "claim-check-ci.mjs");
const WORKFLOW_CI = resolve(ROOT, ".github", "workflows", "ci.yml");
const WORKFLOW_DEPLOY = resolve(ROOT, ".github", "workflows", "deploy.yml");
const ZERO = "0".repeat(40);

let logs;
const capture = () => {
  logs = [];
  vi.spyOn(console, "log").mockImplementation((...a) => logs.push(a.join(" ")));
  vi.spyOn(console, "error").mockImplementation((...a) => logs.push(a.join(" ")));
};
afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.GITHUB_EVENT_PATH;
});

describe("认领门 CI 适配层（claim-check-ci.mjs）", () => {
  it("① workflow 引用的脚本真实存在，且两处都是 verify-ci-order 能解析的单行形态", () => {
    expect(existsSync(SCRIPT), "scripts/claim-check-ci.mjs 必须存在——workflow 引用了它").toBe(true);
    for (const [label, p] of [["ci.yml", WORKFLOW_CI], ["deploy.yml", WORKFLOW_DEPLOY]]) {
      const text = readFileSync(p, "utf8");
      expect(text, label + " 必须包含认领门步骤").toContain("node scripts/claim-check-ci.mjs");
      /* 单行 `- run:` 形态；若有人改回多行块，verify-ci-order 会把它当命令字面量执行
         （实测过的失败形态），这里提前红。 */
      expect(text, label + " 认领门必须是同行 - run: 单条命令").toMatch(/^\s+- run: node scripts\/claim-check-ci\.mjs$/m);
    }
  });

  it("② --base 全零 → 显式跳过（返回 0），不静默放行也不误红", () => {
    capture();
    const code = main(["--base", ZERO]);
    expect(code).toBe(0);
    expect(logs.join("\n")).toContain("跳过判定");
    expect(logs.join("\n")).toContain("显式跳过");
  });

  it("③ 默认形态在本仓可跑通：走 HEAD~1 预演并真正调起 claim-check 子进程", () => {
    capture();
    const code = main([]);
    expect(code).toBe(0);
    const out = logs.join("\n");
    expect(out).toContain("[claim-check-ci] 基线");
    expect(out).toContain("claim-check");   // 子进程的输出标记被透传（认领门真的跑了）
  });
});
