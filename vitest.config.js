import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.js"],
    include: ["tests/**/*.test.js"],
    exclude: ["tests/e2e/**", "node_modules/**", "dist/**"],
    globals: true,
    restoreMocks: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary", "lcov"],
      include: ["agent-workbench.html"],
      // 注：v8 无法对 .html 单文件做注入，当前覆盖率始终为 0%。
      // thresholds 在此架构下无效，保留空配置为未来拆模块（步骤②~⑤，见 docs/architecture-layers.md）后启用做准备。
    },
  },
});
