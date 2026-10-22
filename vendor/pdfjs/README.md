# vendor/pdfjs —— PDF 文本抽取（第三方）

- 来源：`pdfjs-dist@3.11.174`（Mozilla pdf.js，Apache-2.0，见同目录 `LICENSE`）。
- 文件：`pdf.min.js`（主库）、`pdf.worker.min.js`（Worker；file:// 下 pdf.js 会自动回退 fake worker）、`LICENSE`。
- 刷新：`npm run vendor:pdfjs`；校验：`npm run vendor:pdfjs:check`（`tests/pdf-vendor.test.js` 在 CI 里也守一条）。
- **为什么钉 3.11（而不是最新 6.x）**：4.x 起只发 ESM。本应用有两种加载形态：
  线上/PWA（http(s)）与单文件本地打开（file://，Chromium 会以 CORS 拦 ESM）。
  3.11 是最后一条 UMD 经典脚本线，`<script src>` 在 file:// 下仍可用；最新的 6.x 只能靠
  HTTP 加载，等于把「单文件可用」这条产品承诺砍掉。
- **安全**：调用点固定 `isEvalSupported: false`（规避 CVE-2024-4367 的字体脚本执行路径），
  且只做**文本抽取**，不渲染、不执行页面脚本；Worker 源固定同目录文件。
- 体积：~1.4MB（主库 320KB + worker 1.09MB），不进入 `agent-workbench.html`，按需加载。
