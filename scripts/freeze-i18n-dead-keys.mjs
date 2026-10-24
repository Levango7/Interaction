#!/usr/bin/env node
/**
 * freeze-i18n-dead-keys.mjs —— 重冻 i18n 死键基线（R-36）
 * ----------------------------------------------------------------------------
 * 用法：`node scripts/freeze-i18n-dead-keys.mjs`
 *
 * 什么时候该跑：**确认了一批死键是"有意留下"的**（例如某个功能 deliberately 只做了一半），
 * 需要把它们从"新增"挪进"存量"，让棘轮继续只拦新增。
 * ⚠️ 跑之前先看 `tests/i18n-dead-keys.test.js` 报出来的 fresh 清单**逐条过**——
 *    一键冻结是把技术债洗成背景音，本脚本不判断该不该冻，只负责冻。
 *
 * 判定口径与测试完全同源（都走 tests/helpers/i18n-dead-keys.mjs），
 * 不会出现"测试算一套、基线冻另一套"。
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { computeDeadKeys } from "../tests/helpers/i18n-dead-keys.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE = join(root, "tests", "i18n-dead-keys.baseline.json");

const { total, dead, dynPrefixes } = computeDeadKeys();
const prev = existsSync(BASELINE)
  ? JSON.parse(readFileSync(BASELINE, "utf8"))
  : { count: 0, keys: [] };
const prevSet = new Set(prev.keys || []);
const fresh = dead.filter((k) => !prevSet.has(k));
const healed = (prev.keys || []).filter((k) => !dead.includes(k));

const out = {
  _note:
    "i18n 死键基线（R-36，2026-10-25 首冻）。棘轮：只拦新增 —— " +
    "基线里的键被删掉、或被接上消费，都算「好转」，不计失败。",
  updated: new Date().toISOString().slice(0, 10),
  count: dead.length,
  keys: [...dead].sort(),
};
writeFileSync(BASELINE, JSON.stringify(out, null, 2) + "\n");
console.log(`[freeze-i18n-dead-keys] 字典 ${total} 键 · 死键 ${dead.length} 处`
  + `（原基线 ${prev.count} → 新基线 ${out.count}；新增 ${fresh.length} · 好转 ${healed.length}）`);
if (fresh.length) console.log(`  新增：${fresh.slice(0, 20).join(", ")}${fresh.length > 20 ? " …" : ""}`);
if (healed.length) console.log(`  好转：${healed.slice(0, 20).join(", ")}${healed.length > 20 ? " …" : ""}`);
console.log(`  动态拼接豁免族：${dynPrefixes.join(", ") || "(无)"}`);
