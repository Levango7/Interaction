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
| 与客户端（`agent-workbench.html`）联调 | ✅ **契约级 + 真机 UI 双通**：契约级 `verify/client-contract-check.cjs` 29/29；真机 UI `_probe/ui-backend-integration.mjs` 19/19（真 Chromium + 真后端 + 真表单，双 context 当两台设备，注册→上传→回读数据文件→跨设备拉取→错误密码负例）。客户端默认仍指向不存在的 `localhost:3001`，v3.7.103 的 `probeAccountBackend()` 在 UI 如实说明「未检测到账号服务」。**第三方登录另见 `verify/oauth-check.cjs` 33/33**（假 GitHub provider 全链路 + 微信演示模式全链路；v3.7.113 起 GitHub 未配凭据 → 503 `github_not_configured`，不再 404） |
| 自动化测试 | ✅ **九个**自足验证脚本（`hardening-check` 9/9、`idor-check` 9/9、`client-contract-check` 29/29、`incremental-check` 54/54、`security-check` 25/25、`tools-fetch-check` 17/17、`oauth-check` 33/33、`router-isolation-check` 17/17、`config-check` 19/19，合计 **212**），**已接入 CI**（`ci.yml` 的 `server-verify` job） |
| 致命缺陷（P0） | ✅ 已修 3 条（见下） |
| 越权漏洞（IDOR） | ✅ 已修 2 条：跨用户删定时提醒、跨用户踢设备下线（见下） |
| 云同步端点 | ✅ 已补 `GET/PUT /api/sync/snapshot` + **增量** `POST /api/sync/changes` / `/resolve`（全量 LWW / 增量含冲突策略，见 `docs/cloud-sync-incremental-contract.md`） |
| 速率限制 / 审计日志 | ✅ 已有（v3.7.110）：登录/注册/发码按 IP + 同 email 限流（429 + `Retry-After`）；审计环有界、`GET /api/auth/audit` 只读本人 |
| 生产可用 | 🟡 **骨架可用、直接上线仍否** —— 联调（契约级 + 真机 UI）已通；另见下方已知缺口：refresh token 明文、corsOrigin 默认全开 |

**怎么跑验证**：

```bash
cd server && npm install
node verify/hardening-check.cjs        # 期望 9/9   —— 3 条 P0 守卫 + 反向放行
node verify/idor-check.cjs             # 期望 9/9   —— 跨用户越权必须被拒 + 本人操作必须成功
node verify/client-contract-check.cjs  # 期望 29/29 —— 客户端契约联调（含 OAuth fail-closed 契约）
node verify/incremental-check.cjs      # 期望 54/54 —— 增量协议：幂等/LWW/删除信号/快照相干/剪枝回退/冲突与解决
node verify/security-check.cjs         # 期望 22/22 —— 速率限制（阈值内正常/超限 429/分桶/可关）+ 审计环（记录/隔离/有界）
node verify/tools-fetch-check.cjs      # 期望 17/17 —— 抓取代理：代回原文/拒私网与云元数据/重定向每跳重校/体积与超时/401
node verify/oauth-check.cjs            # 期望 33/33 —— 第三方登录：假 GitHub 全链路（授权/兑换/签发/审计/负例/限流）+ 微信演示模式全链路
node verify/router-isolation-check.cjs # 期望 17/17 —— 路由隔离：/api/notifications 与 /api/integrations 各挂各的（交叉路径必须 404 + not_found，合法路由必须仍 200，无 token 必须 401）
node verify/config-check.cjs           # 期望 19/19 —— 配置加载：config.json 生效/深合并保默认/env 优先级/坏 JSON fail loud
```
（九个脚本均已接入 CI 的 `server-verify` job；本地跑法同上。）

**加固后仍存在的已知缺口（部署前必须补齐）**：无登录失败**验证码/锁定**策略
（已有速率限制，但无限次试错同一口令仍可在线慢速爆破 —— 要彻底堵需账号级失败计数与锁定）、
JSON 文件存储在多实例下不安全、限流计数在进程内（多实例各算各的，与 JSON 存储的
单实例假设同源）。

**两项「默认宽松」的处理口径（v3.7.114，已按产品决策落地，不再是缺口）**：
- `corsOrigin` 默认 `"*"`：刻意为之（自托管部署形态千差万别，收紧默认值会让「开箱即通」变成
  「开箱报错」）。值为 `"*"` 时启动打 WARN；对外/过反代请设为具体源。
- 数据文件明文（内含 refresh token 与全部用户数据）：POSIX 上目录 0700 / 文件 0600
  （写盘时自动收紧，失败打 WARN）；**`cfg.dataFile` 即凭证文件**，请把它当密钥对待
  （别进版本库、别进备份共享盘）。口令派生/KMS 加密是独立课题（拿到文件 ≈ 拿到整机，
  性价比不成立），未做。

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

**三层优先级（后者覆盖前者）**，由 `src/config.js` 的 `loadConfig()` 统一处理：

```
config.example.json（仓库基线，含全部安全默认值）
      ↓  深合并（不是整体替换！只写一节不会丢其它默认值）
config.json（本机用户配置，已在 .gitignore，勿提交）
      ↓  环境变量覆盖（点号路径 → 大写双下划线，如 GITHUB__CLIENTID）
最终配置
```

> **⚠️ v3.7.124 修掉的历史坑**：在此之前 `config.json` **根本不会被读取**（实现只读
> `config.example.json`），而本节与启动报错都在教「复制成 config.json」——那一步是空转的。
> 已实测确认（往 config.json 写入非占位密钥后启动，仍被判定"占位值"拒绝启动）。
> 现在三种方式都真实生效，启动日志会打一行 `config: example + config.json + env 覆盖`
> 让你一眼看出配置到底从哪来。
>
> 合并是**深合并**：只配 `github` 一节时，`security.rateLimit` / `wechat.*` / `sync.*`
> 等安全默认值仍然在。若实现成整体替换，限流与同步上限会静默失效且无任何报错。

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
| sms.enabled / secretId / secretKey / sdkAppId / signName / templateId | `SMS__ENABLED` 等 | **短信验证码登录**（OD-001 选型 C）：腾讯云短信服务凭据 + 已审核的签名与模板。**六项缺一即 503 `sms_not_configured`**（fail-closed）；`countryCode` 默认 `+86`，**只认中国大陆号码**（1[3-9] 开头 11 位）——国际号段规则不同，不猜正则假装支持，发错号是按条计费的 |

> `config.json` 里 JSON 语法错误会**直接拒绝启动并指向该文件**（不静默按默认值跑）——
> 「改了配置却没生效」这类不可诊断问题，宁可开箱报错也不放过。

## 配置加载的守护

`verify/config-check.cjs`（v3.7.124 新增，已接入 CI，共 9 个服务端脚本）把上述语义钉成断言：
config.json 生效 / 深合并保默认 / env 优先级最高 / 数组整份替换 / 坏 JSON fail loud，
外加一条 HTTP 层差分对照（同一实例下基线回显请求源、配了之后固定回显，证明配置值真到了 express）。
故障注入反证：把 config.json 分支短路成旧行为 → 6 条转红。
| dev.allowUnsafeDevEndpoints | `DEV__ALLOWUNSAFEDEVENDPOINTS` | **默认 `false`**。开启后才放行：`/wechat/confirm`（凭 email 直接签发 token）与 `/email-code` 的 `demoCode` 回传（两者都是完整认证绕过），以及 **GitHub 兑换端点指向 loopback/私网**（`verify/oauth-check.cjs` 的假 provider 联调用）。**生产必须为 false** |
| github.* | `GITHUB__*` | GitHub 登录（v3.7.113）：`enabled/clientId/clientSecret/redirectUri/postMessageOrigin`（targetOrigin 默认 `*`，生产应收紧成应用源）+ `scope`（默认 `read:user`，只读身份）。`authorizeBase/tokenUrl/userUrl` 默认真端点，**仅联调/自建网关才覆盖**；指向 loopback 需另开上面的 dev 开关，否则回调返 `forbidden_host`。`stateTtlSec` 授权票据有效期（默认 600s，一次性消费+过期惰性清扫） |
| wechat.* | `WECHAT__*` | 微信扫码登录：当前为**演示模式**（无开放平台凭据也可跑通取码→确认→签发全链路；响应带 `demo:true` 自证）。`qrcodeTicketTtlSec` 票据有效期（默认 300s，过期即清）。正式接入见 roadmap 阶段④ |
| sms.*（其余） | `SMS__*` | `region`（默认 `ap-guangzhou`）/ `endpoint`（默认 `https://sms.tencentcloudapi.com`，**指向 loopback 需开上面的 dev 开关**，否则 `sms_endpoint_forbidden`）/ `codeTtlSec`（验证码有效期，默认 600s，一次性消费）/ **`resendIntervalSec`（默认 60s：短信按条计费，同一号码冷却期内重发返 429 `sms_code_cooldown` 并带 `retryAfter`——固定窗口限流挡不住窗口边界的突刺，所以这道闸用码的真实签发时刻做判据）** / `timeoutMs`（默认 10000）/ `templateParamCount`（模板参数个数，2 时第二个参数是有效分钟数） |
| security.rateLimit.* | `SECURITY__RATELIMIT__*` | 速率限制（v3.7.110，默认开）：`enabled/windowMs/max`（每 IP 每窗口 30 次，覆盖 email-code/register/login/sms-code/sms-login）+ `loginMax`（同邮箱或同号码 10 次）+ `emailCodeMax`（同邮箱 5 次）+ **`smsCodeMax`（同号码 5 次，按号码分桶：只留数字，故 `+86 138-0013-8000` 与 `13800138000` 是同一只桶）**。命中返 **429 + `rate_limited`**（带 `Retry-After`）；进程内计数，多实例各算各的 |
| （无配置项） | `AUDIT_MAX` | 审计环上限，默认 200 条/用户（溢出丢最旧；是"近期活动"而非不可变归档） |
| （无配置项） | `ALLOW_PLACEHOLDER_SECRETS` | 允许沿用占位 JWT 密钥启动（默认拒绝）。仅本地联调 |
| corsOrigin | `CORSORIGIN` | **默认 `"*"` = 反射任意 origin，生产必须改成白名单** |
| sync.maxSnapshotBytes | `SYNC__MAXSNAPSHOTBYTES` | 快照上限，默认 2 MB（与 `express.json` 限制一致）。超限返 413，不静默截断 |
| sync.conflictPolicy | `SYNC__CONFLICTPOLICY` | 增量冲突策略：`mv`（默认，v3.7.127 起——输了的一方记进冲突清单下发，客户端结构化合并或让用户二选一，见 `POST /api/sync/resolve`）· `lww`（输了的一方静默丢弃） |
| tools.fetch.* | `TOOLS__FETCH__*` | 抓取代理（`GET /api/tools/fetch`，v3.7.111）：`maxBytes`（默认 1MB，超限 413）/ `timeoutMs`（默认 10s，超时 504）/ `maxRedirects`（默认 3，**每跳重新校验主机**）/ `allowHosts`（默认空；列进去的主机才跳过私网检查，联调/内网部署的显式逃生舱） |

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
| POST | /sms-code | 发短信验证码（2026-10-23，OD-001 选型 C）。腾讯云 SendSms，服务端自算 TC3-HMAC-SHA256、**零新依赖**；未配置 → 503 `sms_not_configured`（fail-closed）；重发冷却 `sms.resendIntervalSec`（默认 60s，**按条计费**所以用码的真实签发时刻判据，不用固定窗口）；**不查该号是否已注册**（否则接口本身成了"这个号注册过没有"的枚举器） |
| POST | /sms-login | 短信码登录 / 首次即建号（find-or-create）。码**一次性消费**先于建号 |
| POST | /password-reset-code | 发**密码重置**验证码（2026-10-24）。⚠️ 与 `/email-code` 的差别是刻意的：注册那条用 `email_exists` 拒绝已存在的邮箱（产品必需，否则用户填完整个表单才被拒），所以**枚举面收敛在注册这一处**；重置这条对「邮箱是否注册过」一个字都不漏 —— 存在与不存在返回**同一状态码、同一响应体**，且**发信失败也返回 200**（回 502 的话，"这个地址偶尔 502"本身就是存在性信号，失败详情只进服务端日志）。不做 per-address 冷却：冷却判据"这个地址刚发过码"本身就是存在性状态，给它对齐得给不存在的地址也写码，而 `security.rateLimit.resetCodeMax`（默认 5/分钟）已经覆盖。**只有 `provider==="email"` 的账号会真收到信** |
| POST | /password-reset | 凭码改密（2026-10-24）。三步合一：校验并**一次性消费**码 → 重算 bcrypt → **吊销该用户全部 refreshToken**（`sessionsRevoked` 如实回给客户端）。最后一步不是可选项：忘记密码的真实场景里有一半是"密码可能已泄露"，只改 hash 不踢会话，攻击者手上的 refreshToken 还能续 30 天。**不自动登录**（不签发 token，少一处「重置即接管」窗口）。⚠️ 已知边界：accessToken（15 分钟）**无法吊销**，只能靠短 TTL 兜着 |
| GET | /github | GitHub 登录：返回 `{authorizeUrl, state}`（v3.7.113 加固）。**未配置凭据 → 503 `github_not_configured`**（fail-closed，永不 404） |
| GET | /github/callback | GitHub 授权回调（浏览器直开，非 apiFetch）：state 一次性消费+TTL → code 以 **form-urlencoded** 兑换（旧实现打 JSON body，GitHub 会拒）→ 按 GitHub id 建/找账号 → 签发 token → postMessage 页**回传 state + token**（旧实现漏传 state，客户端校验 `d.state===session.state` 会直接拒收，链路本是断的） |
| POST | /wechat/qrcode | 微信扫码登录取码（v3.7.113 加固）。**演示模式**：无微信开放平台凭据时返回带 scene 的 SVG data-URI + `demo:true`；真受权需企业资质（roadmap 阶段④），协议不变只换 provider |
| GET | /wechat/status?scene= | 轮询扫码状态：`pending` →（dev 确认后）`confirmed` 带 token（**scene 一次性消费**，不能反复领 token）→ `expired`（超 `qrcodeTicketTtlSec` 即清） |
| GET | /wechat/confirm?scene=&email= | 开发用模拟扫码确认（等价"凭 email 直签 token"）——**默认 404 不暴露**，仅 `dev.allowUnsafeDevEndpoints` 放行 |

### 云同步 `/api/sync`（v3.7.105 全量 + v3.7.106 增量）

客户端 `src/render-overview.js` 一直在调全量两个端点，而 `ac1114a` 那份后端**从未实现** ——
即「即使把后端部署起来，云同步依然不工作」。v3.7.105 补齐全量，v3.7.106 补齐**增量**：

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /snapshot | 读本用户快照。无快照时返回 `{snapshot: null}`（**不是 `{}`** —— 客户端会把空对象当成真实快照应用下去） |
| PUT | /snapshot | 写快照，body `{ snapshot, updatedAt }`。全量覆盖（LWW）；超过 `sync.maxSnapshotBytes`（默认 2 MB）返回 413 而非静默截断。**落盘时会重建增量逐键视图**（两条路同世界） |
| POST | /changes | **增量一轮**（v3.7.106）：body `{ since, changes:[{k,v,ts}], removed:[{k,ts}] }` → `{ token, changed, removed, needsFull }`。服务端权威水位 / tombstone（>200 条剪枝）/ 幂等重放 / 逐键 LWW（ts 大者胜、相等时删除胜）。`needsFull:true` = 客户端 too old（历史被剪枝）→ 回退全量。响应另带 `conflictPolicy`（`mv` 默认 / `lww`）与 `conflicts`（mv 下输了的一方的双方值清单） |
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
真机验证 `node verify/incremental-check.cjs`（54/54，含幂等/LWW/删除信号/快照相干/剪枝回退/跨用户隔离/
**冲突策略声明与 `mv` 解决**）。**冲突策略默认 `lww`、可切 `mv`**（v3.7.109：输了的一方记进冲突清单
随响应下发，`POST /api/sync/resolve {k, choice, ts}` 由客户端裁决；`mv/三路合并` 仍是产品决策，未定不做）。

`GET /api/tools/fetch?url=`（`web_fetch` 的 CORS 兜底代理）**已实现（v3.7.111）** —— 按 ics-fetch /
notify-webhook 同款承重墙：必须 Bearer（不做开放代理）、拒 userinfo、拒回环/私网/链路本地/.local、
**手动跟随重定向且每一跳重新校验**（`redirect:"follow"` 一个 302 就能绕开主机校验）、`cfg.tools.fetch`
控制体积/超时/重定向次数，`allowHosts` 是显式白名单逃生舱（默认空）。断言见
`node verify/tools-fetch-check.cjs`（17/17，含默认拒回环、302 跳私网被拒、413/504/401）。

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