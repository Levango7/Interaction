import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.js"],
    include: ["tests/**/*.test.js"],
    exclude: ["tests/e2e/**", "node_modules/**", "dist/**"],
    globals: true,
    restoreMocks: true,
    /* 单文件 HTML 架构下 loadApp() 需用 JSDOM 解析 3.4 MB 全文，实测单次构造 ~0.8–1.3 s；
       默认 5000 ms 对「一次 it 内多次 loadApp / 重渲染」的重型用例偏紧，统一放宽到 60 s。
       v3.7.64：20 s 在本机全量并行（32 核跑 ~31 worker，JSDOM 内存/GC 压力大）下不够 ——
       实测单用例被拉长 5~20×：④ 31.4 s、① 16.7 s（均通过），③ 被 20 s 掐断成偶发假红；
       隔离运行同一文件时 ② 仅 1.7 s。超时定时器本身也会被事件循环饥饿拖晚，故留足余量。
       单用例内部仍可通过 it(..., { timeout }) 覆盖更短/更长阈值。 */
    testTimeout: 60000,
    hookTimeout: 60000,
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary", "lcov"],
      include: ["agent-workbench.html"],
      // 注：v8 无法对 .html 单文件做注入，当前覆盖率始终为 0%。
      // thresholds 在此架构下无效，保留空配置为未来拆模块（步骤②~⑤，见 docs/architecture-layers.md）后启用做准备。
    },
  },
});
