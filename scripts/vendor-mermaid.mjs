#!/usr/bin/env node
/**
 * vendor-mermaid.mjs —— 把 mermaid 的 UMD 产物复制到 vendor/mermaid/（随仓库交付）。
 * 选 10.x 的理由同 pdf.js：它是最后的 UMD 经典脚本线，file:// 单文件形态可用；11.x 起只发 ESM。
 * 只在出现 ```mermaid 代码块时按需加载，不进入主 HTML。
 *
 * 用法：node scripts/vendor-mermaid.mjs [--check]
 *
 * 2026-11-23：mermaid 10.9.8 起 npm 包不再随附 LICENSE（已从 git tag v10.9.8 取回，与
 * 10.9.1 版逐字节相同）。LICENSE 取材规则：node_modules 侧**有**则取自它并逐字节校验
 * （包恢复随附时自动回到强校验），**无**则保留仓内权威副本并留痕；dist 产物的逐字节
 * 强门始终不变。
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const FILES = [
  ["dist/mermaid.min.js", "mermaid.min.js"],
];
const outDir = join(root, "vendor", "mermaid");
const check = process.argv.includes("--check");
let bad = 0;

for (const [srcRel, destName] of FILES) {
  const src = join(root, "node_modules", "mermaid", srcRel);
  const dest = join(outDir, destName);
  if (!existsSync(src)) {
    console.error(`[vendor-mermaid] 缺少 ${src}（先 npm ci / npm install）`);
    process.exit(1);
  }
  const want = readFileSync(src);
  if (check) {
    const got = existsSync(dest) ? readFileSync(dest) : null;
    if (!got || !got.equals(want)) {
      console.error(`[vendor-mermaid] 不同步: ${dest}`);
      bad++;
    }
  } else {
    mkdirSync(outDir, { recursive: true });
    writeFileSync(dest, want);
    console.log(`[vendor-mermaid] ${destName} ← ${srcRel} (${want.length} bytes)`);
  }
}
if (check) {
  console.log(bad ? `[vendor-mermaid] check ✗ ${bad} 处不同步（跑 npm run vendor:mermaid）` : "[vendor-mermaid] check ✓ 与 node_modules 一致");
  process.exit(bad ? 1 : 0);
}

// LICENSE：npm 包自 10.9.8 起不再随附（见头注）。包侧有则必须逐字节一致；无则仓内副本
// 即为权威，仅校验其在位（内容由 bump 时从 git tag 取回复核，见 CHANGELOG 2026-11-23 节）。
const licenseSrc = join(root, "node_modules", "mermaid", "LICENSE");
const licenseDest = join(outDir, "LICENSE");
if (existsSync(licenseSrc)) {
  const same = existsSync(licenseDest) && readFileSync(licenseDest).equals(readFileSync(licenseSrc));
  if (check) {
    if (!same) { console.error(`[vendor-mermaid] 不同步: ${licenseDest}`); process.exit(1); }
    console.log("[vendor-mermaid] check ✓ LICENSE 与 node_modules 一致");
  } else {
    mkdirSync(outDir, { recursive: true });
    writeFileSync(licenseDest, readFileSync(licenseSrc));
    console.log(`[vendor-mermaid] LICENSE ← node_modules (${readFileSync(licenseSrc).length} bytes)`);
  }
} else if (existsSync(licenseDest)) {
  console.log("[vendor-mermaid] LICENSE：npm 包未随附，保留仓内权威副本（10.9.8 起，git tag v10.9.8 复核过）");
} else {
  console.error(`[vendor-mermaid] 缺少 ${licenseDest} 且 npm 包也未随附 LICENSE`);
  process.exit(1);
}
