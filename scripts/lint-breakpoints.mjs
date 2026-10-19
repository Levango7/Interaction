#!/usr/bin/env node
/**
 * lint-breakpoints.mjs —— 断点纪律守卫（规范 ui-standards §8.1：四档制，不得新增）
 * --------------------------------------------------
 * 为什么从 vitest 升格到这里：此前这条断言只活在 `tests/ui-spec-guards.test.js`
 * ——「全量单测才跑到」。2026-10-19 实测教训：`29ce6c8` 给时间轴图例写了
 * `@media (max-width:1099px)`，**漏跑全量**导致 run `39161220080` windows 腿红、
 * ubuntu 被 cancel、Pages 一并 failure，红了一夜。断点纪律是**纯静态、零 IO、零误报**
 * 的判据（把 `@media` 里的宽度值与允许集对一遍），成本最低、收益最直接，
 * 因此提进 `npm run lint` 链 —— 每个碰 CSS 的人、每次提交前的 lint 都能撞上它。
 *
 * 允许集（与 tests/ui-spec-guards.test.js 共用同一份常量，防两处漂移）：
 *   · 主档 1440 / 1439 / 1024 / 1023 / 768 / 767（四档 + 各自的 ±1 邻值）
 *   · 细分档 520 / 600 / 479 / 359（规范 §8.1 明确允许的同档内细分）
 *   · 历史债务 879 / 519 不得回潮（v3.7.48 已收敛到 1023 / 520）
 *
 * 用法：node scripts/lint-breakpoints.mjs   （npm run lint:breakpoints）
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** 允许的断点集合 —— tests/ui-spec-guards.test.js 直接 import 这三个常量，不另抄一份 */
export const MAIN_BREAKPOINTS = ["1440", "1439", "1024", "1023", "768", "767"];
export const SEGMENT_BREAKPOINTS = ["520", "600", "479", "359"];
export const DEBT_FORBIDDEN = ["879", "519"];
/** 四个主档必须齐备：缺一个说明有人把整档删了（响应式骨架残缺） */
export const MAIN_REQUIRED = ["1440", "1023", "1024", "767"];

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function run() {
  const html = readFileSync(path.join(ROOT, "agent-workbench.html"), "utf8");
  /* 两态一致：源码态与拼回态都含同一份 <style> 媒体查询，读哪个都不影响结论 */
  const widths = new Set();
  for (const m of html.matchAll(/@media[^{]*?\((?:max|min)-width\s*:\s*(\d+)px\)/g)) widths.add(m[1]);

  const allowed = new Set([...MAIN_BREAKPOINTS, ...SEGMENT_BREAKPOINTS]);
  const unknown = [...widths].filter((w) => !allowed.has(w));
  const debtBack = DEBT_FORBIDDEN.filter((w) => widths.has(w));
  const missingMain = MAIN_REQUIRED.filter((w) => !widths.has(w));

  if (unknown.length || debtBack.length || missingMain.length) {
    if (unknown.length) {
      console.error(`[lint-breakpoints] ✗ 出现未登记的断点值（规范 §8.1 不得新增）：${unknown.join(", ")}`);
      console.error("  允许集：主档 " + MAIN_BREAKPOINTS.join("/") + " + 细分档 " + SEGMENT_BREAKPOINTS.join("/"));
      console.error("  要立新档位，先改规范 ui-standards §8.1，再改这里与 tests/ui-spec-guards.test.js。");
    }
    if (debtBack.length) console.error(`[lint-breakpoints] ✗ 历史债务断点回潮：${debtBack.join(", ")}（应并入 1023 / 520）`);
    if (missingMain.length) console.error(`[lint-breakpoints] ✗ 主档缺失：${missingMain.join(", ")}`);
    process.exit(1);
  }
  console.log(`[lint-breakpoints] ✓ ${widths.size} 个断点值全部登记（主档 ${MAIN_BREAKPOINTS.length} + 细分档 ${SEGMENT_BREAKPOINTS.length}），无新增、无债务回潮`);
}

/* 直接执行才跑（被 tests/ui-spec-guards.test.js import 时只取常量，不执行扫描） */
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) run();
