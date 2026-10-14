/* server/src/index.js
 * Agent 工坊鉴权后端入口（供 .exe 安装版内嵌、或独立部署供网页版共用）。
 * 启动：node src/index.js   （或 npm start）
 * 配置：见 src/config.js —— 三层优先级 config.example.json < config.json < 环境变量。
 * 依赖：仅 express / cors / bcryptjs / jsonwebtoken / nodemailer（均已在 server/node_modules）。
 */
"use strict";
const fs = require("fs");
const express = require("express");
const cors = require("cors");
const Store = require("./store");
const authRouter = require("./auth");
/* v3.7.124：loadConfig 从本文件抽到 src/config.js（入口文件只装配零业务）。
   连带修掉一个真实缺陷：原实现只读 config.example.json，README 与启动报错里
   「复制 config.example.json 为 config.json」那一步**从来没有效果**——
   已实测确认（在 config.json 写入非占位密钥后启动，仍被判定"占位值"拒绝启动）。
   现在 config.json 真正生效，且与基线做**深合并**（不整体替换，保住安全默认值）。 */
const { loadConfig, USER_PATH } = require("./config");
/* v3.7.122：原 extrasRouter 同一个实例挂两个前缀（/api/notifications 与 /api/integrations），
   交叉路径全部可达、攻击面翻倍（审计遗留 P2）。现按前缀拆成两个独立工厂各挂各的，
   路由集合以客户端真实调用为准；守护见 verify/router-isolation-check.cjs。 */
const notificationsRouter = require("./notifications");
const integrationsRouter = require("./integrations");
const syncRouter = require("./sync");
const toolsFetchRouter = require("./tools-fetch");

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
/* v3.7.114：corsOrigin 默认 "*" 是刻意为之（自托管部署形态千差万别：file:// 直开、IP 访问、
   反代、跨端口 —— 收紧默认值会把「开箱即通」变成「开箱报错」，违背本地优先定位）。
   但「默认宽松」不能是「静默宽松」：与占位密钥同款口径，启动时打一次 WARN，
   运维收紧了自然不再出现；配了却没看日志的人至少有一次被提醒的机会。 */
if (cfg.corsOrigin === "*") {
  console.warn("[agent-workbench-auth][WARN] corsOrigin 为 \"*\"（任何源都可带凭据跨站调用本 API）。" +
    " 本地/个人使用可忽略；对外或过反代请设 corsOrigin 为具体源（如 https://app.example.com）。");
}
app.use(cors({ origin: cfg.corsOrigin === "*" ? true : cfg.corsOrigin }));
app.use(express.json({ limit: "2mb" }));

// 健康检查
app.get("/api/health", (req, res) => res.json({ ok: true, name: "agent-workbench-auth", version: "3.6.1", time: Date.now() }));

app.use("/api/auth", authRouter(cfg, store));
app.use("/api/notifications", notificationsRouter(cfg, store));
app.use("/api/integrations", integrationsRouter(cfg, store));
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
  /* v3.7.124：把「配置到底从哪来」打进启动日志。这一行的存在本身就是为了防那类
     「我改了 config.json 但没生效」的不可诊断问题——现在启动时就能看到有没有读到它。 */
  console.log("[agent-workbench-auth] config: example"
    + (fs.existsSync(USER_PATH) ? " + config.json" : "（无 config.json，用基线默认）")
    + " + env 覆盖");
  console.log("[agent-workbench-auth] email:" + (cfg.email && cfg.email.enabled ? "on" : "off") + " github:" + (cfg.github && cfg.github.enabled ? "on" : "off") + " wechat:" + (cfg.wechat && cfg.wechat.enabled ? "on" : "off"));
});