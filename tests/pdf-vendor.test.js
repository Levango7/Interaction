/**
 * pdf-vendor.test.js —— vendor/pdfjs 与钉住依赖的一致性（2026-10-23）
 * 防止"改了 node_modules 版本但忘了刷新 vendor"或 vendor 被误删：
 * 两者不一致时，线上 PDF 解析行为会与锁文件声明不符。
 */
import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const MAP = [
  ["pdf.min.js", "build/pdf.min.js"],
  ["pdf.worker.min.js", "build/pdf.worker.min.js"],
  ["LICENSE", "LICENSE"],
];

describe("vendor/pdfjs", () => {
  it("版本钉在 3.11.174（最后一条 UMD 线，file:// 可用）", () => {
    const pkg = JSON.parse(readFileSync(join(root, "node_modules/pdfjs-dist/package.json"), "utf8"));
    expect(pkg.version).toBe("3.11.174");
    expect(readFileSync(join(root, "vendor/pdfjs/pdf.min.js"), "utf8")).toContain("3.11.174");
  });

  it("vendor 文件齐全且与 node_modules 逐字节一致", () => {
    for (const [dest, src] of MAP) {
      const d = join(root, "vendor/pdfjs", dest);
      const s = join(root, "node_modules/pdfjs-dist", src);
      expect(existsSync(d), d).toBe(true);
      expect(readFileSync(d).equals(readFileSync(s)), dest + " 与 node_modules 不同步").toBe(true);
    }
  });
});
