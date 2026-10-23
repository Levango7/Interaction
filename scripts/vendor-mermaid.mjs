#!/usr/bin/env node
/**
 * vendor-mermaid.mjs —— 把 mermaid 的 UMD 产物复制到 vendor/mermaid/（随仓库交付）。
 * 选 10.x 的理由同 pdf.js：它是最后的 UMD 经典脚本线，file:// 单文件形态可用；11.x 起只发 ESM。
 * 只在出现 ```mermaid 代码块时按需加载，不进入主 HTML。
 *
 * 用法：node scripts/vendor-mermaid.mjs [--check]
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const FILES = [
  ["dist/mermaid.min.js", "mermaid.min.js"],
  ["LICENSE", "LICENSE"],
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
