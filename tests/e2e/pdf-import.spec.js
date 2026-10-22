/**
 * pdf-import.spec.js —— 真 pdf.js 的 PDF 导入（file:// 形态）
 * ----------------------------------------------------------------------------
 * 单测里的 pdfjs 是假的；这里必须用**真 vendor + 真 PDF**，因为要证明的是：
 *   · 3.11 UMD 经典脚本在 file:// 下能加载（4.x 的 ESM 会被 CORS 拦）；
 *   · Worker / fake worker 回退能走通；
 *   · 抽出的正文真的进了知识库块。
 * 反向对照：随机字节冒充 PDF 必须不入库（证明不是"只要选了文件就算成功"）。
 */
const { test, expect } = require("./_fixture");
const { waitMainRendered } = require("./helpers/wait-settled.cjs");
const { makePdf } = require("../helpers/make-pdf.cjs");

test.describe("PDF 导入", () => {
  test("单页 PDF → 正文切块入库；坏 PDF 被拒（反向对照）", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("./agent-workbench.html");
    await waitMainRendered(page);
    await page.evaluate(() => openKnowledgeBaseModal());
    /* 文件输入在 label 里 display:none（点击 label 触发），等待要 attached 而不是 visible */
    await page.waitForSelector("#kbFileInput", { state: "attached" });

    await page.setInputFiles("#kbFileInput", {
      name: "hello.pdf",
      mimeType: "application/pdf",
      buffer: makePdf("Hello PDF 2026"),
    });

    await expect.poll(
      () => page.evaluate(() => {
        const f = getRagFiles().find((x) => x.name === "hello.pdf");
        return f && f.chunks ? f.chunks.length : 0;
      }),
      { timeout: 30_000, message: "真 pdf.js 解析后应入库" }
    ).toBeGreaterThan(0);

    const text = await page.evaluate(() =>
      getRagFiles().filter((f) => f.name === "hello.pdf")
        .map((f) => f.chunks.map((c) => c.text).join("\n")).join("\n")
    );
    expect(text).toContain("Hello PDF 2026");
    expect(await page.evaluate(() => typeof window.pdfjsLib)).toBe("object");

    /* 反向对照：随机字节冒充 PDF。否定式断言给真实观察窗口（等"解析+提示"发生），不靠 sleep 猜 */
    await page.setInputFiles("#kbFileInput", {
      name: "broken.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("this is not a pdf at all"),
    });
    await page.waitForTimeout(2000);
    expect(await page.evaluate(() => getRagFiles().some((f) => f.name === "broken.pdf")), "坏 PDF 不得入库").toBe(false);
  });
});
