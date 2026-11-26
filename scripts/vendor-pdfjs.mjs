#!/usr/bin/env node
/**
 * vendor-pdfjs.mjs —— 把 pdfjs-dist 6.x 的 legacy ESM 打成经典 IIFE，随仓库交付。
 *
 * pdf.js 6.x 不再提供 UMD；应用既要 file:// 单文件形态，也要离线可用，因此在构建期
 * 用 esbuild 生成无 import/export 的经典脚本。file:// 先预载 worker 注册 fake worker，
 * http(s) 仍由 pdf.js 创建同源模块 Worker。
 *
 * 用法：node scripts/vendor-pdfjs.mjs            # 重建 vendor
 *       node scripts/vendor-pdfjs.mjs --check    # 重建并逐字节校验，不写文件
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkgDir = join(root, "node_modules", "pdfjs-dist");
const outDir = join(root, "vendor", "pdfjs");
const check = process.argv.includes("--check");
const bundles = [
  { entry: "legacy/build/pdf.mjs", dest: "pdf.min.js", globalName: "pdfjsLib" },
  { entry: "legacy/build/pdf.worker.mjs", dest: "pdf.worker.min.js", globalName: "pdfjsWorker" },
];
const common = {
  bundle: true,
  platform: "browser",
  format: "iife",
  target: "es2020",
  minify: true,
  legalComments: "inline",
  define: { "import.meta.url": "self.location.href" },
  write: false,
  logLevel: "silent",
};
let bad = 0;

for (const item of bundles) {
  const result = await build({
    ...common,
    entryPoints: [join(pkgDir, item.entry)],
    globalName: item.globalName,
  });
  const want = result.outputFiles[0].contents;
  const dest = join(outDir, item.dest);
  if (check) {
    const got = existsSync(dest) ? readFileSync(dest) : null;
    if (!got || !got.equals(want)) {
      console.error(`[vendor-pdfjs] 不同步: ${dest}`);
      bad++;
    }
  } else {
    mkdirSync(outDir, { recursive: true });
    writeFileSync(dest, want);
    console.log(`[vendor-pdfjs] ${item.dest} ← ${item.entry} (${want.length} bytes)`);
  }
}

const licenseSrc = join(pkgDir, "LICENSE");
const licenseDest = join(outDir, "LICENSE");
if (!existsSync(licenseSrc)) {
  console.error(`[vendor-pdfjs] 缺少 ${licenseSrc}`);
  process.exit(1);
}
const license = readFileSync(licenseSrc);
if (check) {
  const got = existsSync(licenseDest) ? readFileSync(licenseDest) : null;
  if (!got || !got.equals(license)) {
    console.error(`[vendor-pdfjs] 不同步: ${licenseDest}`);
    bad++;
  }
} else {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(licenseDest, license);
  console.log(`[vendor-pdfjs] LICENSE ← node_modules/pdfjs-dist (${license.length} bytes)`);
}

if (check) {
  console.log(bad ? `[vendor-pdfjs] check ✗ ${bad} 处不同步（跑 npm run vendor:pdfjs）` : "[vendor-pdfjs] check ✓ 与当前依赖重建结果一致");
  process.exit(bad ? 1 : 0);
}
