# vendor/pdfjs —— PDF 文本抽取（第三方）

- 来源：`pdfjs-dist@6.5.438`（Mozilla pdf.js，Apache-2.0，见同目录 `LICENSE`）。
- 构建：`esbuild@0.28.2` 将 `legacy/build/pdf.mjs` 与 `legacy/build/pdf.worker.mjs` 打包为经典 IIFE；`target=es2020`、minify、`legalComments=inline`，保留 `pdfjsLib` / `pdfjsWorker` 全局名。
- 文件：`pdf.min.js`（544,437 B，主库）、`pdf.worker.min.js`（1,281,069 B，Worker）、`LICENSE`（10,174 B）。不进入 `agent-workbench.html`，按需加载。
- 刷新：`npm run vendor:pdfjs`；校验：`npm run vendor:pdfjs:check`（在内存中按当前依赖重建并逐字节比对，`tests/pdf-vendor.test.js` 在 CI 里也守一条）。
- **为什么打包 6.x**：4.x 起只发 ESM，Chromium 的 `file://` 形态不能直接加载跨源模块。构建期打成无 `import/export` 的经典脚本，保留单文件本地打开与离线可用。
- **Worker 两路**：`file://` 先经典脚本预载 worker，注册 `WorkerMessageHandler` 后由 pdf.js 走 fake worker（主线程回退）；`http(s)` 不预载 worker，由 pdf.js 按 `GlobalWorkerOptions.workerSrc` 创建同源模块 Worker。
- **安全**：升级到包含 CVE-2024-4367（恶意 PDF 可执行任意 JavaScript）修复的 6.5.438；6.5.438 已不再消费 `isEvalSupported`，因此不再保留这个无效参数。调用点只做**文本抽取**，不渲染、不执行页面脚本；Worker 源固定同目录文件。
