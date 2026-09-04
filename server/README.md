# Nexus Interaction Server

Agent 工坊的配套后端服务：用户账号系统（注册/登录/JWT 刷新）、Web Push 推送、邮件通知、第三方集成 OAuth。

技术栈：Express + node:sqlite（`DatabaseSync`）+ jsonwebtoken + bcryptjs + web-push + nodemailer + node-cron。

## 快速开始

```bash
cd server
npm ci                 # 安装依赖
npm run dev            # 开发模式（node --watch），默认监听 http://localhost:3001
npm test               # 运行测试（vitest + supertest）
```

生产部署前请配置环境变量（参见 [.env.example](./.env.example)）：

```bash
cp .env.example .env   # 填写 JWT 密钥等配置
node --env-file=.env src/index.js
```

## 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `3001` | 监听端口 |
| `NODE_ENV` | - | `production` 时强制校验 JWT 密钥（fail-fast） |
| `DB_PATH` | `./data/app.db` | SQLite 数据库文件路径 |
| `JWT_ACCESS_SECRET` | 开发默认值 | accessToken 签名密钥，**生产必填强随机值** |
| `JWT_REFRESH_SECRET` | 开发默认值 | refreshToken 签名密钥，**生产必填强随机值** |
| `CORS_ORIGINS` | 空 | 额外放行的 Origin 白名单（逗号分隔） |
| `RATE_WINDOW_MS` | `900000` | 限流窗口（15 分钟） |
| `AUTH_RATE_MAX` | `60` | auth 路由每 IP 每窗口最大请求数 |
| `LOGIN_MAX_FAILURES` | `5` | 登录失败锁定阈值（按 IP+邮箱） |
| `VAPID_SUBJECT` / `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | - | Web Push VAPID 配置 |
| `OAUTH_REDIRECT_BASE` | - | OAuth 回调基地址 |
| `MAIL_FROM` | `Nexus Interaction <no-reply@nexus.local>` | 默认发件人 |

SMTP 服务器配置由用户在应用内设置（存于数据库），不走环境变量。

## 安全机制

- **JWT 密钥 fail-fast**：`NODE_ENV=production` 时，`JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` 缺失或仍为开发默认值将**拒绝启动**；开发环境仅打印警告。
- **CORS 白名单**：无 Origin（同源/服务间调用）与 `localhost` / `127.0.0.1` 放行；其余须命中 `CORS_ORIGINS`，未命中不返回 CORS 头（浏览器拦截）。
- **登录失败锁定**：同一 `IP + 邮箱` 在窗口内登录失败（401）达到 `LOGIN_MAX_FAILURES` 次后锁定一个窗口，返回 `429` + `Retry-After`；登录成功自动清零计数。
- **auth 总节流**：auth 路由整体限流，每 IP 每窗口 `AUTH_RATE_MAX` 次请求，超出返回 `429`。

> 限流为进程内存实现，适用于单实例部署。多实例/水平扩展时需替换为 Redis 等外置存储。

## API 概览

| 路由 | 说明 |
| --- | --- |
| `GET /api/health` | 健康检查 |
| `POST /api/auth/register` | 注册 |
| `POST /api/auth/login` | 登录（受失败锁定限流保护） |
| `POST /api/auth/refresh` | 刷新 accessToken |
| `GET/PUT /api/auth/me` | 个人资料 |
| `GET/DELETE /api/auth/devices` | 登录设备管理 |
| `POST /api/auth/logout` | 登出 |
| `/api/notifications/*` | 通知与推送 |
| `/api/integrations/*` | 第三方集成 OAuth |

测试覆盖见 [tests/](./tests/)：`auth.test.js`（认证全流程）、`security.test.js`（限流 + CORS）、`notify.test.js`、`integrations.test.js`。测试在 CI 的 `server-test` job 中自动运行。
