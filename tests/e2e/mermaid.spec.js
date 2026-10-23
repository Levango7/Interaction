/**
 * mermaid.spec.js —— file:// 下真 vendor 的 Mermaid 渲染（2026-10-23）
 * 证明 10.x UMD 经典脚本能在 file:// 加载（11.x 的 ESM 会被 CORS 拦），且产物是 SVG。
 */
const { test, expect } = require("./_fixture");
const { waitMainRendered } = require("./helpers/wait-settled.cjs");

test.describe("Mermaid 真渲染", () => {
  test("mermaid 代码块 → SVG（懒加载 vendor）", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("./agent-workbench.html");
    await waitMainRendered(page);
    await page.evaluate(() => {
      const box = document.createElement("div");
      box.id = "mmdTest";
      box.style.position = "fixed";
      box.style.left = "0";
      box.style.top = "0";
      box.innerHTML = '<div class="md-body">' + mdToHtml("```mermaid\ngraph TD\nA[开始]-->B[结束]\n```") + "</div>";
      document.body.appendChild(box);
      return renderMermaidBlocks(box);
    });
    await page.waitForSelector("#mmdTest .mermaid-figure svg", { timeout: 40_000 });
    const state = await page.evaluate(() => ({
      lib: typeof window.mermaid,
      hasScript: !!document.querySelector("#mmdTest .mermaid-figure script"),
      hasSvg: !!document.querySelector("#mmdTest .mermaid-figure svg"),
    }));
    expect(state.lib).toBe("object");
    expect(state.hasSvg).toBe(true);
    expect(state.hasScript).toBe(false);
  });
});
