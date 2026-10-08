/**
 * refreeze-baseline.mjs —— 按**文件**精确重冻 `lint-empty-catch` 基线
 * ----------------------------------------------------------------------------
 * 为什么不能直接用 `--freeze`（全量）：
 *   全量冻结会把**当前工作区里所有人的在途改动**一并写进基线。并行会话正在写的那部分
 *   缺陷一旦被冻成「合法存量」，门禁就永久失去对它们的拦截能力 —— 等于替别人销账。
 *   每片收尾只应重冻**自己动过的那几个文件**（协作纪律里的铁律 0f）。
 *
 * 用法：
 *   node scripts/refreeze-baseline.mjs src/ui-backup-stats.js [src/core.js ...]
 *   node scripts/refreeze-baseline.mjs --dry-run src/xxx.js       # 只看将要怎么变
 *
 * 行为：把基线里 `file` 等于指定文件的条目**整体替换**为当前扫描结果，其余文件的条目
 *       一个字节都不动；最后把 `updated` 换成今天、`count` 换成新的条目数。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, basename } from "node:path";
import { scanSource } from "./lib/empty-catch.mjs";

const BASE_PATH = resolve(process.cwd(), "scripts", "lint-empty-catch.baseline.json");

/**
 * 纯函数版：把 base.items 里属于 files 的条目替换为 current 中对应文件的条目。
 * @param {Array} baseItems 基线条目
 * @param {Array} currentItems 当前扫描结果（全量）
 * @param {string[]} fileNames 要重冻的文件名（basename 形态，与条目里的 file 字段同口径）
 * @returns {{items: Array, replaced: Object<string, number>}}
 */
export function refreezeItems(baseItems, currentItems, fileNames) {
  const set = new Set(fileNames);
  const freshByFile = new Map(fileNames.map((f) => [f, currentItems.filter((i) => i.file === f)]));
  const replaced = {};
  for (const f of set) {
    replaced[f] = {
      before: baseItems.filter((i) => i.file === f).length,
      after: (freshByFile.get(f) || []).length,
    };
  }
  /* 必须在**原位置**替换，不能拼到数组末尾：拼末尾会让整个数组错位，
     git diff 从几十行涨到上千行，事后根本无法核对「有没有连带别人的条目」。
     （2026-10-09 第九片实测：拼末尾产生 617+/584- 的巨大噪音 diff。） */
  const inserted = new Set();
  const items = [];
  for (const it of baseItems) {
    if (set.has(it.file)) {
      if (!inserted.has(it.file)) { inserted.add(it.file); items.push(...(freshByFile.get(it.file) || [])); }
      continue; // 该文件的旧条目整体丢弃
    }
    items.push(it);
  }
  /* baseline 里此前没有的文件（新源文件）补到末尾 */
  for (const f of set) if (!inserted.has(f)) items.push(...(freshByFile.get(f) || []));
  return { items, replaced };
}

/** 扫描一组源文件，产出与基线同形态的条目数组 */
export function scanFiles(filePaths) {
  const out = [];
  for (const p of filePaths) {
    const name = basename(p);
    const items = scanSource(readFileSync(p, "utf8"), name, {});
    for (const i of items) out.push(i);
  }
  return out;
}

function main(argv) {
  const dry = argv.includes("--dry-run");
  const files = argv.filter((a) => !a.startsWith("--"));
  if (!files.length) {
    console.error("用法: node scripts/refreeze-baseline.mjs <src 文件> [...]\n      node scripts/refreeze-baseline.mjs --dry-run <src 文件>");
    process.exit(2);
  }
  const base = JSON.parse(readFileSync(BASE_PATH, "utf8"));
  const current = scanFiles(files.map((f) => resolve(process.cwd(), f)));
  const { items, replaced } = refreezeItems(base.items, current, files.map((f) => basename(f)));

  console.log("[refreeze] 重冻范围：", Object.keys(replaced).join(", "));
  for (const [f, n] of Object.entries(replaced)) {
    console.log(`  ${f}: ${n.before} → ${n.after} 条`);
  }
  const others = (a) => a.filter((i) => !Object.prototype.hasOwnProperty.call(replaced, i.file));
  console.log(`[refreeze] 其它文件条目：${others(base.items).length} → ${others(items).length} 条（必须相等）`);
  if (others(base.items).length !== others(items).length) {
    console.error("[refreeze] 中止：其它文件条目数变了，说明改动范围超出预期，请核对");
    process.exit(1);
  }
  console.log(`[refreeze] 总数 ${base.items.length} → ${items.length}`);

  if (dry) {
    console.log("[refreeze] --dry-run：未写入");
    return;
  }
  writeFileSync(BASE_PATH, JSON.stringify({ ...base, updated: new Date().toISOString().slice(0, 10), count: items.length, items }, null, 2) + "\n");
  console.log("[refreeze] 已写入 ", BASE_PATH);
}

if (process.argv[1] && process.argv[1].endsWith("refreeze-baseline.mjs")) main(process.argv.slice(2));
