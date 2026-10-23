# vendor/mermaid —— Mermaid 图渲染（第三方）

- 来源：`mermaid@10.9.1`（MIT，见同目录 `LICENSE`），只保留 UMD 版 `dist/mermaid.min.js`（约 3.3MB）。
- 刷新：`npm run vendor:mermaid`；校验：`npm run vendor:mermaid:check`（`tests/mermaid.test.js` 也守一条）。
- **为什么钉 10.x**：11.x 起只发 ESM；本应用要支持 file:// 单文件打开（Chromium 会以 CORS 拦 ESM），
  10.x 的 UMD 经典脚本是最后的可用线。按需加载：只有消息里出现 ` ```mermaid ` 代码块时才拉这个文件。
- **安全**：`securityLevel:'strict'` + 渲染后再做一次 SVG 消毒（移除 script/foreignObject/on* 事件/
  外链 href，style 里剥离 @import 与外部 url）。失败时保留源码并给提示，不静默吞图。
- 体积：3.3MB，不进入 `agent-workbench.html`，也不在 SW 预缓存（首次使用时由运行时缓存接管）。
