/**
 * pdf-vendor.test.js —— vendor/pdfjs 与钉住依赖的一致性（2026-10-23）
 * 防止"改了 node_modules 版本但忘了刷新 vendor"或 vendor 被误删：
 * 两者不一致时，线上 PDF 解析行为会与锁文件声明不符。
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("vendor/pdfjs", () => {
  it("pdfjs-dist 与构建依赖精确钉在 6.5.438 / esbuild 0.28.2", () => {
    const pkg = JSON.parse(readFileSync(join(root, "node_modules/pdfjs-dist/package.json"), "utf8"));
    const appPkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    expect(pkg.version).toBe("6.5.438");
    expect(appPkg.devDependencies["pdfjs-dist"]).toBe("6.5.438");
    expect(appPkg.devDependencies.esbuild).toBe("0.28.2");
  });

  it("Node engines 与 pdfjs-dist 实际要求一致", () => {
    const pkg = JSON.parse(readFileSync(join(root, "node_modules/pdfjs-dist/package.json"), "utf8"));
    const appPkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8"));
    expect(appPkg.engines.node).toBe(pkg.engines.node);
    expect(lock.packages[""].engines.node).toBe(pkg.engines.node);
  });

  it("两个 IIFE bundle 与 LICENSE 在位", () => {
    for (const name of ["pdf.min.js", "pdf.worker.min.js", "LICENSE"]) {
      const path = join(root, "vendor/pdfjs", name);
      expect(existsSync(path), path).toBe(true);
      expect(readFileSync(path).length, path).toBeGreaterThan(0);
    }
  });

  it("vendor 与当前依赖经脚本重建后逐字节一致", () => {
    const out = execFileSync(process.execPath, [join(root, "scripts/vendor-pdfjs.mjs"), "--check"], {
      cwd: root,
      encoding: "utf8",
    });
    expect(out).toContain("check ✓");
  });
});
