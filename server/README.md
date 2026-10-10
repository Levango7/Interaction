# Agent 工坊 · 鉴权后端

单文件 PWA 的鉴权与账号服务，为 **Electron .exe 安装版**与**网页版（gh-pages）**共用。
纯 Node/Express，零原生编译依赖（bcryptjs 纯 JS，DB 用 JSON 文件持久化，对齐前端 localStorage 形态）。

---

## ⚠ 当前状态（必读，2026-10-10）

本目录是 **2026-10-10 从孤立提交 `ac1114a` 找回**的资产（该提交因远端强推而非 HEAD 祖先，
曾一度「代码还在仓库里、工作区里却不存在」）。找回后做过**一轮安全加固**，结论是：

> **这是一份可救的开发骨架，不是可交付产品。加固后仍不建议直接面向真实用户部署。**

| 项 | 状态 |
|---|---|
| 与客户端（`agent-workbench.html`）联调 | 🟡 **已做契约级联调**（`verify/client-contract-check.cjs` 24/24）。但客户端默认仍指向不存在的 `localhost:3001`，未做过「真机 + 真 UI」联调 |
| 自动化测试 | ✅ 四个自足验证脚本（`hardening-check` 9/9、`idor-check` 9/9、`client-contract-check` 24/24、`incremental-check` 38/38），**已接入 CI**（`ci.yml` 的 `server-verify` job） |
| 致命缺陷（P0） | ✅ 已修 3 条（见下） |
| 越权漏洞（IDOR） | ✅ 已修 2 条：跨用户删定时提醒、跨用户踢设备下线（见下） |
| 云同步端点 | ✅ 已补 `GET/PUT /api/sync/snapshot`（此前客户端在调、后端没有） |
| 生产可用 | ❌ 否 —— 缺速率限制、缺审计日志，且未做真机 UI 联调 |

**怎么跑验证**：

```bash
cd server && npm install
node verify/hardening-check.cjs        # 期望 9/9   —— 3 条 P0 守卫 + 反向放行
node verify/idor-check.cjs             # 期望 9/9   —— 跨用户越权必须被拒 + 本人操作必须成功
node verify/client-contract-check.cjs  # 期望 24/24 —— 客户端契约联调（tools/fetch 为已识别未做项）
node verify/incremental-check.cjs      # 期望 38/38 —— 增量协议：幂等/LWW/删除信号/快照相干/剪枝回退/隔离
```
（四个脚本均已接入 CI 的 `server-verify` job；本地跑法同上。）

**加固后仍存在的已知缺口（部署前必须补齐）**：无登录失败速率限制（可暴力破解）、
无审计日志、refresh token 明文落盘、`corsOrigin` 默认全开放、JSON 文件存储在多实例下不安全。

加固详情与缺陷清单：`docs/backend-recovery-assessment.md`。

---

## 快速启动

> **v3.7.105 起：JWT 密钥仍是占位值时拒绝启动。** 这是刻意的 fail fast —— 原实现不校验，
> 运维照旧文档跑起来却不改密钥，等于把签名密钥公开，任何人可自签 token 接管任意账号。

```bash
cd server
npm install

# 方式一（推荐）：复制配置并改成高强度随机值
cp config.example.json config.json   # 然后改 jwt.accessSecret / jwt.refreshSecret
npm start

# 方式二：用环境变量覆盖
JWT__ACCESSSECRET="<随机长串>" JWT__REFRESHSECRET="<另一个随机长串>" npm start

# 仅本地联调、确需沿用占位密钥时（启动会打 WARN）
ALLOW_PLACEHOLDER_SECRETS=true npm start
```

默认监听 `http://localhost:3001`，数据落在 `server/data/auth.json`。
⚠ 本机 3001 常被 Docker Desktop 占用，冲突时改端口：`PORT=4571 npm start`。

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
| github.postMessageOrigin | `GITHUB__POSTMESSAGEORIGIN` | OAuth 回调页回传 token 的 `targetOrigin`。**默认 `"*"`（任意站点可接收 token），生产必须改成自己的页面源** |
| wechat.enabled / appid / secret | `WECHAT__ENABLED` 等 | 微信开放平台/公众号扫码凭据 |
| dev.allowUnsafeDevEndpoints | `DEV__ALLOWUNSAFEDEVENDPOINTS` | **默认 `false`**。开启后才放行两个开发端点：`/wechat/confirm`（凭 email 直接签发 token）与 `/email-code` 的 `demoCode` 回传。两者都是完整认证绕过，**生产必须为 false** |
| （无配置项） | `ALLOW_PLACEHOLDER_SECRETS` | 允许沿用占位 JWT 密钥启动（默认拒绝）。仅本地联调 |
| corsOrigin | `CORSORIGIN` | **默认 `"*"` = 反射任意 origin，生产必须改成白名单** |
| sync.maxSnapshotBytes | `SYNC__MAXSNAPSHOTBYTES` | 快照上限，默认 2 MB（与 `express.json` 限制一致）。超限返 413，不静默截断 |
| sync.conflictPolicy | `SYNC__CONFLICTPOLICY` | 增量冲突策略：`lww`（默认，输了的一方静默丢弃）· `mv`（输了的一方记进冲突清单下发，客户端结构化合并或让用户二选一，见 `POST /api/sync/resolve`） |

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

### 云同步 `/api/sync`（v3.7.105 全量 + v3.7.106 增量）

客户端 `src/render-overview.js` 一直在调全量两个端点，而 `ac1114a` 那份后端**从未实现** ——
即「即使把后端部署起来，云同步依然不工作」。v3.7.105 补齐全量，v3.7.106 补齐**增量**：

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /snapshot | 读本用户快照。无快照时返回 `{snapshot: null}`（**不是 `{}`** —— 客户端会把空对象当成真实快照应用下去） |
| PUT | /snapshot | 写快照，body `{ snapshot, updatedAt }`。全量覆盖（LWW）；超过 `sync.maxSnapshotBytes`（默认 2 MB）返回 413 而非静默截断。**落盘时会重建增量逐键视图**（两条路同世界） |
| POST | /changes | **增量一轮**（v3.7.106）：body `{ since, changes:[{k,v,ts}], removed:[{k,ts}] }` → `{ token, changed, removed, needsFull }`。服务端权威水位 / tombstone（>200 条剪枝）/ 幂等重放 / 逐键 LWW（ts 大者胜、相等时删除胜）。`needsFull:true` = 客户端 too old（历史被剪枝）→ 回退全量。响应另带 `conflictPolicy`（`lww` 默认 / `mv`）与 `conflicts`（mv 下输了的一方的双方值清单） |
| POST | /resolve | **冲突解决**（v3.7.109，仅 mv 策略有意义）：body `{ k, choice, ts }`（choice = `local` 本机值 / `remote` 服务端值；ts 由客户端给、必须新于冲突双方）。404 = 该键没有未解决的冲突；400 = choice 非法 |

`updatedAt` **原样回传客户端写入时自报的值**（与客户端时钟同源）：客户端推送成功后用本地 `Date.now()`
记 `lastPushAt`，再拿它跟服务端返回的 `updatedAt` 比大小判断「云端是否有其他设备的更新」
（`src/render-overview.js:1413`）并按本地时区展示（`:1428`）。若把它替换成服务端时间，跨设备部署
两边时钟不一致就会判错方向 —— 同机 localhost 两者同钟，本地联调看不出这个错，故有专门的守护用例
（`verify/client-contract-check.cjs` 的「updatedAt 原样回传」）。服务端接收时刻另存 `serverUpdatedAt`
**仅作诊断、不参与任何比较**。已知局限：多客户端各用自己时钟 → 它们之间的 LWW 比较本就不可靠，
需两端一起改才能解，不在服务端单边处理。三个端点均需 Bearer 鉴权。

增量同步（阶段 2）**已两端同步升级**：客户端 `cfg.syncIncremental` 开关制（默认关=全量；开=增量，
不支持/落后自动回退全量）。契约定稿与实施记录见 `docs/cloud-sync-incremental-contract.md`；
真机验证 `node verify/incremental-check.cjs`（38/38，含幂等/LWW/删除信号/快照相干/剪枝回退/跨用户隔离）。
**冲突策略仍只有 `lww`**：`mv/三路合并` 是产品决策，未定不做。

`POST /api/tools/fetch`（`web_fetch` 的 CORS 兜底代理）**仍未实现** —— 它是 SSRF 敏感面
（服务端代抓任意 URL），需按 ics-fetch / notify-webhook 同款承重墙标准设计（主机白名单、
拒私网回环、限大小与超时），本轮未做。

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