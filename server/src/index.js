/* server/src/index.js
 * Agent 工坊鉴权后端入口（供 .exe 安装版内嵌、或独立部署供网页版共用）。
 * 启动：node src/index.js   （或 npm start）
 * 配置：读 config.example.json；同名 env（SERVER__PORT / AUTH__EMAIL__SMTP__HOST 等）可覆盖。
 * 依赖：仅 express / cors / bcryptjs / jsonwebtoken / nodemailer（均已在 server/node_modules）。
 */
"use strict";
const path = require("path");
const fs = require("fs");
const express = require("express");
const cors = require("cors");
const Store = require("./store");
const authRouter = require("./auth");
const extrasRouter = require("./extras");

function loadConfig() {
  const base = path.join(__dirname, "..", "config.example.json");
  let cfg = {};
  try { cfg = JSON.parse(fs.readFileSync(base, "utf8")); } catch (e) { /* 用默认 */ }
  // 环境变量覆盖（点号路径 -> 大写双下划线）：SERVER__PORT、AUTH__EMAIL__SMTP__HOST ...
  const applyEnv = (obj, prefix) => {
    Object.keys(obj).forEach(k => {
      const envKey = (prefix + k).toUpperCase().replace(/\./g, "__");
      const envVal = process.env[envKey];
      if (envVal !== undefined) {
        if (typeof obj[k] === "number") obj[k] = Number(envVal);
        else if (typeof obj[k] === "boolean") obj[k] = envVal === "true" || envVal === "1";
        else obj[k] = envVal;
      }
      if (obj[k] && typeof obj[k] === "object" && !Array.isArray(obj[k])) applyEnv(obj[k], prefix + k + ".");
    });
  };
  applyEnv(cfg, "");
  // 数据文件相对 server 根
  if (!path.isAbsolute(cfg.dataFile)) cfg.dataFile = path.join(__dirname, "..", cfg.dataFile || "data/auth.json");
  return cfg;
}

const cfg = loadConfig();
const store = new Store(cfg.dataFile);

const app = express();
app.use(cors({ origin: cfg.corsOrigin === "*" ? true : cfg.corsOrigin }));
app.use(express.json({ limit: "2mb" }));

// 健康检查
app.get("/api/health", (req, res) => res.json({ ok: true, name: "agent-workbench-auth", version: "3.6.3", time: Date.now() }));

app.use("/api/auth", authRouter(cfg, store));
app.use("/api/notifications", extrasRouter(cfg, store));
app.use("/api/integrations", extrasRouter(cfg, store));

// 未知端点
app.use((req, res) => res.status(404).json({ ok: false, error: "not_found", path: req.path }));

const port = Number(process.env.PORT) || Number(cfg.port) || 3001;
app.listen(port, () => {
  console.log("[agent-workbench-auth] listening on http://localhost:" + port);
  console.log("[agent-workbench-auth] data file: " + cfg.dataFile);
  console.log("[agent-workbench-auth] email:" + (cfg.email && cfg.email.enabled ? "on" : "off") + " github:" + (cfg.github && cfg.github.enabled ? "on" : "off") + " wechat:" + (cfg.wechat && cfg.wechat.enabled ? "on" : "off"));
});