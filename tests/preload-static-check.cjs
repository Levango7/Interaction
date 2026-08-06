// 静态校验：确认 electron/preload.js 已正确从 electron 解构导入 app，避免 ReferenceError。
// 纯文本正则检查，不依赖 electron 运行时，任何 Node 环境均可直接运行。
const fs = require("fs");
const path = require("path");

const preloadPath = path.resolve(__dirname, "..", "electron", "preload.js");
const src = fs.readFileSync(preloadPath, "utf8");

// 匹配形如 const { ... } = require("electron") 的解构语句
const m = src.match(/const\s*\{([^}]*)\}\s*=\s*require\(["']electron["']\)/);
if (!m) {
  console.error("preload.js: 未找到 electron 解构语句 ✗");
  process.exit(1);
}

const destructured = m[1];
const required = ["contextBridge", "ipcRenderer", "app"];
const missing = required.filter((name) => !new RegExp(`\\b${name}\\b`).test(destructured));

if (missing.length > 0) {
  console.error(`preload.js: 解构缺少 ${missing.join(", ")} ✗`);
  process.exit(1);
}

console.log("preload.js: app 已正确导入 ✓");
process.exit(0);