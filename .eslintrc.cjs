module.exports = {
  root: true,
  env: { browser: true, node: true, es2022: true },
  parserOptions: { ecmaVersion: 2022, sourceType: "script" },
  plugins: ["html"],
  extends: ["eslint:recommended"],
  rules: {
    "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    "no-undef": "error",
    "eqeqeq": ["warn", "always"],
    "no-console": "off",
    "no-empty": ["error", { allowEmptyCatch: true }],
    "prefer-const": "warn",
    "no-var": "warn",
    "no-irregular-whitespace": "off",
    "no-misleading-character-class": "off"
  },
  ignorePatterns: [
    "node_modules/",
    "electron/node_modules/",
    "electron/dist/",
    ".codeartsdoer/",
    "2026-*/",
    "Claw/",
    "Projects/",
    "deliverables/",
    "deploy/",
    "docs/",
    "document-generate-pipeline/",
    ".workbuddy/",
    "tests/e2e/",
    "playwright.config.js",
    "tmp.js",
    "tmp.css",
    "*.md",
    "数擎*.html"
  ],
  overrides: [
    {
      files: ["*.html"],
      rules: {
        "no-undef": "error",
        "no-unused-vars": "off"
      }
    },
    {
      files: ["tests/**/*.js", "vitest.config.js"],
      parserOptions: { sourceType: "module" }
    },
    {
      // scripts 下 ESM 构建脚本（.mjs 始终为 module）
      files: ["scripts/**/*.mjs"],
      parserOptions: { sourceType: "module" }
    },
    {
      // Service Worker 环境：var 声明在 SW 生命周期作用域内是安全的，
      // 且 var→let/const 转换会引入块作用域错误（SW 事件回调跨作用域引用）。
      files: ["service-worker.js"],
      env: { serviceworker: true, browser: false, node: false },
      rules: { "no-var": "off" }
    }
  ]
};
