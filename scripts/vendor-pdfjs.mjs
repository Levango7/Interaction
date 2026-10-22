#!/usr/bin/env node
/**
 * vendor-pdfjs.mjs —— 把 pdfjs-dist 的浏览器产物复制到 vendor/pdfjs/（随仓库交付）。
 *
 * 为什么 vendor 而不是运行时从 CDN 拉：
 *   · 应用是本地优先/离线可用，PDF 解析不能依赖外网；
 *   · CSP 只放行 'self'，CDN 也过不了；
 *   · Electron/file:// 形态下 ESM 会被 CORS 拦，故固定用 pdfjs-dist 3.11 的 **UMD 经典脚本**
 *     （4.x 起只发 ESM；动态 import 在 file:// 下不可用）。
 *
 * 用法：node scripts/vendor-pdfjs.mjs            # 复制（刷新 vendor）
 *       node scripts/vendor-pdfjs.mjs --check    # 只校验 vendor 与 node_modules 一致
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const PKG = "pdfjs-dist";
const FILES = [
  ["build/pdf.min.js", "pdf.min.js"],
  ["build/pdf.worker.min.js", "pdf.worker.min.js"],
  ["LICENSE", "LICENSE"],
];
const outDir = join(root, "vendor", "pdfjs");
const check = process.argv.includes("--check");
let bad = 0;

for (const [srcRel, destName] of FILES) {
  const src = join(root, "node_modules", PKG, srcRel);
  const dest = join(outDir, destName);
  if (!existsSync(src)) {
    console.error(`[vendor-pdfjs] 缺少 ${src}（先 npm ci / npm install）`);
    process.exit(1);
  }
  const want = readFileSync(src);
  if (check) {
    const got = existsSync(dest) ? readFileSync(dest) : null;
    if (!got || !got.equals(want)) {
      console.error(`[vendor-pdfjs] 不同步: ${dest}`);
      bad++;
    }
  } else {
    mkdirSync(outDir, { recursive: true });
    writeFileSync(dest, want);
    console.log(`[vendor-pdfjs] ${destName} ← ${srcRel} (${want.length} bytes)`);
  }
}
if (check) {
  console.log(bad ? `[vendor-pdfjs] check ✗ ${bad} 处不同步（跑 npm run vendor:pdfjs）` : "[vendor-pdfjs] check ✓ 与 node_modules 一致");
  process.exit(bad ? 1 : 0);
}
