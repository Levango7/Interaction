/**
 * pwa-metadata.test.js —— PWA 元数据守护（v3.7.66 新增，A 项）
 * ----------------------------------------------------------------------------
 * 全部规则来自 2026-09-29 的**线上实测控制台**，不是凭印象立的规矩：
 *   ① `<meta name="apple-mobile-web-app-capable"> is deprecated. Please include
 *      <meta name="mobile-web-app-capable">` —— 标准名此前缺失。
 *   ② 「The resource https://…/icon.svg（及 manifest.json）was preloaded using link preload
 *      but not used within a few seconds from the window's load event」—— 两条死预取：
 *      页面里没有 <img> 用 icon.svg（只有 manifest / apple-touch-icon / favicon 引用它），
 *      而 manifest.json 由浏览器的清单解析器取，根本不吃 preload。
 *   ③ manifest 的 `screenshots` 曾拿 icon.svg 冒充 1280x720 / 390x844 两张截图 ——
 *      虚假元数据比缺字段更糟（与 docs/product-scope.md 对「stub + 活 UI」的态度一致）。
 *
 * 运行：npm test（源码态直跑 npx vitest 会全量假失败，见 tests/helpers/loadApp.js 守卫）
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(join(root, "agent-workbench.html"), "utf8");
const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));

describe("PWA 元数据（线上警告驱动）", () => {
  it("head 里必须有标准名 mobile-web-app-capable，且保留 apple 旧名做老 iOS 兼容", () => {
    expect(html).toContain('<meta name="mobile-web-app-capable" content="yes">');
    expect(html).toContain('<meta name="apple-mobile-web-app-capable" content="yes">');
  });

  it("不得再有 preload 链接（当前两条都是死预取，浏览器实测警告为据）", () => {
    const preloads = [...html.matchAll(/<link[^>]*rel=["']preload["'][^>]*>/g)].map((m) => m[0]);
    expect(preloads, "死预取会常驻控制台警告并白烧首屏：" + preloads.join(" ;; ")).toEqual([]);
  });

  it("manifest 不得用图标冒充 screenshots（要加就加真素材）", () => {
    expect(manifest.screenshots, "screenshots 里的图标冒充截图").toBeUndefined();
  });

  it("manifest 引用的每个图标文件都真实存在（清单里写错路径＝装到桌面没图标）", () => {
    for (const icon of manifest.icons || []) {
      const rel = String(icon.src || "").replace(/^\.\//, "");
      expect(() => readFileSync(join(root, rel)), `manifest.icons 指向不存在的文件：${icon.src}`).not.toThrow();
    }
  });
});
