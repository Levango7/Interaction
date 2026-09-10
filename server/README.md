# Agent 工坊 · 鉴权后端

单文件 PWA 的鉴权与账号服务，为 **Electron .exe 安装版**与**网页版（gh-pages）**共用。
纯 Node/Express，零原生编译依赖（bcryptjs 纯 JS，DB 用 JSON 文件持久化，对齐前端 localStorage 形态）。

## 快速启动

```bash
cd server
npm start          # 等价于 node src/index.js
# 默认监听 http://localhost:3001，数据落在 server/data/auth.json
```

健康检查：`GET /api/health` → `{ok:true, version:"3.6.1"}`

## 前端如何连上

前端 `apiClientModule`（agent-workbench.html）默认 `API_BASE = "http://localhost:3001"`。
- Electron .exe：把 `server/src` 打成后端模块随应用内嵌，启动时在 3001 起服务。
- 网页版：把本后端部署到任意 Node 服务器/云函数，把页面 `设置 → API 基址` 指过去即可（CORS 默认放开）。

## 配置（credentials 全部走配置，不硬编码）

复制 `config.example.json` 为 `config.json`（或直接用环境变量覆盖，路径用 `__` 分隔 + 大写）：

| 路径 | 环境变量示例 | 说明 |
|---|---|---|
| port | `SERVER__PORT=4000` | 监听端口 |
| jwt.accessSecret / refreshSecret | `JWT__ACCESSSECRET` / `JWT__REFRESHSECRET` | JWT 签名密钥，生产必改 |
| email.enabled | `EMAIL__ENABLED=true` | 开启后注册强制要求验证码并真发邮件 |
| email.smtp.* | `EMAIL__SMTP__HOST` 等 | SMTP 发码通道（QQ/163/Gmail…） |
| github.enabled / clientId / clientSecret / redirectUri | `GITHUB__ENABLED` 等 | GitHub OAuth App 凭据 |
| wechat.enabled / appid / secret | `WECHAT__ENABLED` 等 | 微信开放平台/公众号扫码凭据 |

## 端点清单（对齐前端 apiClientModule）

### 鉴权 `/api/auth`
| 方法 | 路径 | 说明 |
|---|---|---|
| POST | /register | 邮箱+密码+验证码注册，返回 {accessToken, refreshToken, user}（注册后自动登录） |
| POST | /login | 邮箱+密码登录，返回 token 三件套 + user |
| POST | /refresh | 用 refreshToken 换新 accessToken |
| POST | /logout | 注销当前 refreshToken |
| GET/PUT | /me | 当前用户信息 |
| GET/DELETE | /devices[/:id] | 登录设备管理 |
| POST | /email-code | 发邮箱验证码（未配 SMTP 时返回 demoCode 供开发） |
| GET | /github | 获取 GitHub 授权跳转 URL（{authorizeUrl, state}） |
| GET | /github/callback | GitHub 授权回调：code→token→建/绑账号→postMessage 回传 |
| POST | /wechat/qrcode | 取扫码二维码（{qr, scene, expireIn}；未配微信时给演示码） |
| GET | /wechat/status?scene= | 轮询扫码状态（pending→confirmed 带 token） |
| GET | /wechat/confirm?scene=&email= | 开发用：模拟扫码确认 |

### 通知/集成 `/api/notifications`、`/api/integrations`
| 方法 | 路径 | 说明 |
|---|---|---|
| GET/PUT | /notifications/preferences | 通知偏好 |
| POST | /notifications/push/subscribe · /notifications/push/unsubscribe | Web Push 订阅 |
| GET/POST | /notifications/schedules[/:id] | 定时提醒 |
| GET | /integrations/status | 集成列表 |
| GET | /integrations/oauth/:provider/callback | 集成 OAuth 回调（占位连接） |
| DELETE | /integrations/oauth/:provider | 断开集成 |

## 未配置凭据时的降级行为（重要）

- **邮箱验证码**：`email.enabled=false` 时，`/email-code` 在响应里带 `demoCode`（6 位码），方便开发联调；开启 SMTP 后才真发邮件，且注册强制要求验证码。
- **微信扫码**：未配微信 appid 时，二维码是带说明的演示图（无法真扫码）；轮询可配 `/wechat/confirm` 模拟确认。
- **GitHub 登录**：未配 clientId 时 `/github` 返回 503 + `github_not_configured`，前端 toast 提示。

真实上线只需在微信开放平台 / GitHub OAuth App / 邮件服务商各注册拿凭据，填入配置即可，前端无需改动。