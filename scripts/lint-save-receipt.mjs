#!/usr/bin/env node
/* lint-save-receipt.mjs —— save() 回执丢弃门禁 CLI（零容忍，无基线文件） */
import { scanSrc } from "./lib/save-receipt.mjs";

const args = process.argv.slice(2);
const items = scanSrc();

if (args.includes("--scan")) {
  console.log(JSON.stringify(items, null, 2));
  process.exit(0);
}

if (items.length) {
  console.error("[lint-save-receipt] " + items.length + " 处持久化包装器丢弃 save() 的写入结果（P0 假回执同族）:");
  for (const it of items) console.error("  " + it.file + ":" + it.line + " [" + it.wrapper + "] " + it.evidence);
  process.exit(1);
}
console.log("[lint-save-receipt] OK — 持久化包装器全部把 save() 的写入结果交还调用方");
