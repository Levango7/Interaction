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
      // R4：src/modules 为「全局拼接」架构（build.mjs 按文件名串联为单一 <script> 作用域），
      // 模块间通过全局函数/变量互相引用，故关闭 no-undef / no-unused-vars（跨模块引用会被误报），
      // 其余 recommended 规则照常生效。
      files: ["src/**/*.js"],
      rules: {
        "no-undef": "off",
        "no-unused-vars": "off",
        "prefer-const": "off"
      }
    },
    {
      files: ["tests/**/*.js", "vitest.config.js"],
      parserOptions: { sourceType: "module" }
    },
    {
      files: ["service-worker.js"],
      env: { serviceworker: true, browser: false, node: false }
    }
  ]
};
