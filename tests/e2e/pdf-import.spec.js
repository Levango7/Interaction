/**
 * pdf-import.spec.js —— 真 pdf.js 的 PDF 导入（file:// + 同源 HTTP）
 * ----------------------------------------------------------------------------
 * 单测里的 pdfjs 是假的；这里必须用**真 vendor + 真 PDF**，因为要证明的是：
 *   · 6.x legacy ESM 构建的 IIFE 在 file:// 下能加载；
 *   · file:// 预载 worker 注册 fake worker，HTTP 创建同源模块 Worker；
 *   · 抽出的正文真的进了知识库块。
 * 反向对照：随机字节冒充 PDF 必须不入库（证明不是"只要选了文件就算成功"）。
 */
const { test, expect } = require("./_fixture");
const { waitMainRendered } = require("./helpers/wait-settled.cjs");
const { makePdf } = require("../helpers/make-pdf.cjs");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..");

function startStaticServer() {
  const requests = [];
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, "http://127.0.0.1").pathname;
    requests.push(pathname);
    const files = {
      "/agent-workbench.html": "text/html; charset=utf-8",
      "/vendor/pdfjs/pdf.min.js": "text/javascript; charset=utf-8",
      "/vendor/pdfjs/pdf.worker.min.js": "text/javascript; charset=utf-8",
    };
    if (!Object.prototype.hasOwnProperty.call(files, pathname)) {
      // 真实 SW 会预缓存 worker，污染“应用是否预载 worker”的观测。
      if (pathname === "/service-worker.js") {
        res.writeHead(200, { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-store" });
        res.end('self.addEventListener("install", function() {});');
        return;
      }
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("not found");
      return;
    }
    res.writeHead(200, { "content-type": files[pathname], "cache-control": "no-store" });
    res.end(fs.readFileSync(path.join(ROOT, pathname)));
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port, requests }));
  });
}

test.describe("PDF 导入", () => {
  test("单页 PDF → 正文切块入库；坏 PDF 被拒（反向对照）", async ({ page }) => {
    test.setTimeout(60_000);
    const pageErrors = [];
    const fakeWorkerWarnings = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));
    page.on("console", (msg) => {
      if (msg.type() === "warning" && /fake worker/i.test(msg.text())) fakeWorkerWarnings.push(msg.text());
    });
    await page.addInitScript(() => {
      window.__pdfWorkerCalls = [];
      const NativeWorker = window.Worker;
      window.Worker = class extends NativeWorker {
        constructor(url, options) {
          window.__pdfWorkerCalls.push({ url: String(url), type: options && options.type });
          super(url, options);
        }
      };
    });
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
    const workerEvidence = await page.evaluate(() => ({
      workerSrc: window.pdfjsLib.GlobalWorkerOptions.workerSrc,
      workerCalls: window.__pdfWorkerCalls,
      preloadedWorker: typeof window.pdfjsWorker?.WorkerMessageHandler,
    }));
    expect(workerEvidence.preloadedWorker).toBe("function");
    expect(new URL(workerEvidence.workerSrc).protocol).toBe("file:");
    expect(workerEvidence.workerCalls).toEqual([]);
    expect(fakeWorkerWarnings).toHaveLength(1);
    expect(fakeWorkerWarnings[0]).toMatch(/Setting up fake worker/i);
    expect(pageErrors).toEqual([]);

    /* 反向对照：随机字节冒充 PDF。先等真实错误提示，再断言不入库，不靠 sleep 猜 */
    await page.setInputFiles("#kbFileInput", {
      name: "broken.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("this is not a pdf at all"),
    });
    await expect(page.getByText(/无法解析该 PDF|Cannot parse this PDF/)).toBeVisible({ timeout: 10_000 });
    expect(await page.evaluate(() => getRagFiles().some((f) => f.name === "broken.pdf")), "坏 PDF 不得入库").toBe(false);
  });

  test("HTTP 同源加载真模块 Worker，不预载 worker、不回落 fake worker", async ({ page }) => {
    test.setTimeout(60_000);
    const staticServer = await startStaticServer();
    const base = "http://127.0.0.1:" + staticServer.port;
    const pageErrors = [];
    const fakeWorkerWarnings = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));
    page.on("console", (msg) => {
      if (msg.type() === "warning" && /fake worker/i.test(msg.text())) fakeWorkerWarnings.push(msg.text());
    });
    await page.addInitScript(() => {
      window.__pdfWorkerCalls = [];
      const NativeWorker = window.Worker;
      window.Worker = class extends NativeWorker {
        constructor(url, options) {
          window.__pdfWorkerCalls.push({ url: String(url), type: options && options.type });
          super(url, options);
        }
      };
    });
    try {
      await page.goto(base + "/agent-workbench.html");
      await waitMainRendered(page);
      expect(await page.evaluate(() => typeof window.pdfjsWorker)).toBe("undefined");
      expect(staticServer.requests).not.toContain("/vendor/pdfjs/pdf.worker.min.js");

      await page.evaluate(() => openKnowledgeBaseModal());
      await page.waitForSelector("#kbFileInput", { state: "attached" });
      await page.setInputFiles("#kbFileInput", {
        name: "http.pdf",
        mimeType: "application/pdf",
        buffer: makePdf("HTTP PDF 2026"),
      });
      await expect.poll(
        () => page.evaluate(() => {
          const f = getRagFiles().find((x) => x.name === "http.pdf");
          return f && f.chunks ? f.chunks.length : 0;
        }),
        { timeout: 30_000, message: "HTTP 真 pdf.js 解析后应入库" }
      ).toBeGreaterThan(0);

      const evidence = await page.evaluate(() => ({
        text: getRagFiles().filter((f) => f.name === "http.pdf")
          .map((f) => f.chunks.map((c) => c.text).join("\n")).join("\n"),
        workerSrc: window.pdfjsLib.GlobalWorkerOptions.workerSrc,
        workerCalls: window.__pdfWorkerCalls,
        workerGlobal: typeof window.pdfjsWorker,
        origin: location.origin,
      }));
      expect(evidence.text).toContain("HTTP PDF 2026");
      expect(evidence.workerGlobal).toBe("undefined");
      expect(new URL(evidence.workerSrc).origin).toBe(evidence.origin);
      expect(evidence.workerCalls.length).toBeGreaterThan(0);
      for (const call of evidence.workerCalls) {
        expect(new URL(call.url, evidence.origin).origin).toBe(evidence.origin);
        expect(call.type).toBe("module");
      }
      expect(staticServer.requests).toContain("/vendor/pdfjs/pdf.worker.min.js");
      expect(fakeWorkerWarnings).toEqual([]);
      expect(pageErrors).toEqual([]);
    } finally {
      staticServer.server.closeAllConnections();
      await new Promise((resolve) => staticServer.server.close(resolve));
    }
  });
});
