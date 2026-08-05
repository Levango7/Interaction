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
        "no-undef": "off",
        "no-unused-vars": "off"
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