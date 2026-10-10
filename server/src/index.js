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
const syncRouter = require("./sync");
const toolsFetchRouter = require("./tools-fetch");

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

/* v3.7.105 加固：config.example.json 里 jwt.accessSecret / refreshSecret 是占位值
   "change-me-*-secret"，而原实现启动时从不校验 —— 运维照 README 跑起来却不改密钥，
   等于把 JWT 签名密钥公开，任何人都能自签 token 接管任意账号。
   现改为 fail fast：仍是占位值就直接拒绝启动，不给「忘了改」留静默窗口。
   本地联调确需沿用占位值时，显式设 ALLOW_PLACEHOLDER_SECRETS=true 放行，
   启动日志会打醒目 WARN —— 显式 opt-in 比隐式环境判断更难被误用。 */
const _PLACEHOLDER_SECRET = /^change-me/i;
const _secretsArePlaceholder =
  !cfg.jwt || !cfg.jwt.accessSecret || !cfg.jwt.refreshSecret ||
  _PLACEHOLDER_SECRET.test(cfg.jwt.accessSecret) || _PLACEHOLDER_SECRET.test(cfg.jwt.refreshSecret);
if (_secretsArePlaceholder) {
  if (process.env.ALLOW_PLACEHOLDER_SECRETS === "true") {
    console.warn("[agent-workbench-auth][WARN] 正在使用占位 JWT 密钥，仅限本地联调，严禁用于生产。");
  } else {
    console.error("[agent-workbench-auth] 拒绝启动：jwt.accessSecret / refreshSecret 仍是占位值或缺失。");
    console.error("  请复制 config.example.json 为 config.json 后改成高强度随机值，");
    console.error("  或用环境变量 JWT__ACCESSSECRET / JWT__REFRESHSECRET 覆盖。");
    console.error("  本地联调确需沿用占位值：ALLOW_PLACEHOLDER_SECRETS=true node src/index.js");
    process.exit(1);
  }
}

const store = new Store(cfg.dataFile);

const app = express();
app.use(cors({ origin: cfg.corsOrigin === "*" ? true : cfg.corsOrigin }));
app.use(express.json({ limit: "2mb" }));

// 健康检查
app.get("/api/health", (req, res) => res.json({ ok: true, name: "agent-workbench-auth", version: "3.6.1", time: Date.now() }));

app.use("/api/auth", authRouter(cfg, store));
app.use("/api/notifications", extrasRouter(cfg, store));
app.use("/api/integrations", extrasRouter(cfg, store));
/* v3.7.105：云同步端点。客户端 src/render-overview.js 一直在调 GET/PUT /api/sync/snapshot，
   而 ac1114a 那份后端从未实现 —— 即「部署了后端云同步也不工作」。契约见 src/sync.js 头注释。 */
app.use("/api/sync", syncRouter(cfg, store));
/* v3.7.111：网页抓取代理。客户端 src/ai-tools.js 的 web_fetch 直连被 CORS 拦时会退到这里
   （GET /api/tools/fetch?url=），此前同样从未实现。安全口径见 src/tools-fetch.js 头注释。 */
app.use("/api/tools", toolsFetchRouter(cfg, store));

// 未知端点
app.use((req, res) => res.status(404).json({ ok: false, error: "not_found", path: req.path }));

const port = Number(process.env.PORT) || Number(cfg.port) || 3001;
app.listen(port, () => {
  console.log("[agent-workbench-auth] listening on http://localhost:" + port);
  console.log("[agent-workbench-auth] data file: " + cfg.dataFile);
  console.log("[agent-workbench-auth] email:" + (cfg.email && cfg.email.enabled ? "on" : "off") + " github:" + (cfg.github && cfg.github.enabled ? "on" : "off") + " wechat:" + (cfg.wechat && cfg.wechat.enabled ? "on" : "off"));
});