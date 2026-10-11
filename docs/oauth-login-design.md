# 第三方登录服务端补全 —— 评估与方案（2026-10-11，v3.7.112 后）

> **⚠️ 2026-10-11 当日更正（先读这条）**：本文开头「三个端点后端一个都没有（404）」的结论
> **是错的**。当日读全 `server/src/auth.js`（367 行）时发现：`ac1114a` 找回的骨架**本来就实现了**
> 这三个端点——GitHub 授权/回调、微信**演示模式**（取码返回带 scene 的 SVG data-URI +
> `/wechat/confirm` dev 开关确认）。先前只 grep 了文件前半部分（到 `/api/auth/audit` 为止）就下了结论。
> **真实缺口不是"没有"，而是"演示形态 + 两处真 bug"**：
> ① GitHub 兑换打 **JSON body**（GitHub 要 form-urlencoded，会被拒）；
> ② 回调页 postMessage **漏传 state**（客户端校验 `d.state === session.state` 会直接拒收——
> 登录链路本是断的）；外加 scene 可反复领 token、无 TTL/审计/限流、未配凭据时行为不明确。
> 2026-10-11 v3.7.113 已按本文的承重墙口径实施加固（`verify/oauth-check.cjs` 33/33 全链路），
> 微信演示模式保留、正式接入仍等商务触发。**下面保留原始评估作为过程记录**，其中"后端 404"
> 与"端点未实现"的表述请按本条更正读。

> 起因（原始记录，其中"后端一个都没有"已按上条更正）：客户端在调 `/api/auth/github`、
> `/api/auth/wechat/qrcode`、`/api/auth/wechat/status`；用户裁定：评估、设计解决方案、列入计划。

## 一、评估

**现象面**：部署了后端的环境里点「GitHub 登录 / 微信扫码」→ 404 → UI 笼统提示
「当前环境无后端，无法登录」——**误导**（后端明明在跑）。未部署环境则是真离线提示，语义撞车。

**骨架遗产（好消息，方案因此便宜很多）**：`ac1114a` 找回的后端本来就打算做这两条——
- `store.js` 已有 `oauthStates` 状态表（`set/get/deleteOAuthState`）、`findUserByProvider`、
  users 表的 `provider` / `providerId` 字段；
- `config.example.json` 已有完整 `github`（`clientId/clientSecret/redirectUri/postMessageOrigin`）
  与 `wechat`（`appid/secret/qrcodeTicketTtlSec/pollIntervalMs`）段；
- `auth.js` 文件头注释承诺了 "github / wechat" 路由，函数体在文件**后半部分**实现了
  （当时只看前半部分就下了"从未实现"的错误结论，见文首更正）。
  即：**地基全在，地上也有，缺的是承重墙级别的加固**（v3.7.113 已补）。

**两个 provider 的可行性不同（关键评估结论）**：
- **GitHub：可以做全量。** OAuth App 个人可免费自注册（github.com/settings/developers），
  无企业资质门槛；本地跑填 `http://localhost:<port>/api/auth/github/callback` 即可。
  此前「拿不到 client_id」的裁定（2026-10-03）针对的是 **Gist 载体**那件顺不顺手，
  登录侧的门槛其实只是"注册一次"。→ **建议做全量（阶段 2）**。
- **微信：正式接入维持商务触发**（开放平台网站应用要企业主体认证 + 备案域名，与
  roadmap 硬阻塞表 2026-10-03 裁定一致）。协议位可以先落（阶段 1/3），凭据就位后换
  provider 实现、客户端零改动。

## 二、契约（客户端消费代码已存在，服务端照它实现，不改契约）

| 端点 | 成功响应（信封内 data） | 未配置 | 客户端行为 |
|---|---|---|---|
| `GET /api/auth/github` | `{authorizeUrl, state}`（state 非空字符串） | 503 `{error:"github_not_configured"}` | 弹窗打开 authorizeUrl；记录 `{source, origin, state}`，10 分钟有效 |
| `GET /api/auth/github/callback?code&state` | **HTML 页**（浏览器直开，非 apiFetch）：`postMessage({type:"agent-github-oauth", state, accessToken, refreshToken}, targetOrigin)` 后 `window.close()` | — | 校验 `e.source`===弹窗 · `e.origin`===API_BASE origin · state 匹配 · 一次性消费 |
| `POST /api/auth/wechat/qrcode` | `{qr, scene, expireIn}`（qr 为图片 URL/data-URI） | 503 `{error:"wechat_not_configured"}` | 渲染二维码，每 2.5s 轮询 |
| `GET /api/auth/wechat/status?scene=` | `{status:"pending"|"confirmed"|"expired", accessToken?, refreshToken?}` | 503 同上 | confirmed 且带 accessToken → 落 token 登录 |

注：客户端注释里提过 `/api/auth/github/status` 轮询备选，**实际代码只用 postMessage** ——
不做该端点（少一面）。`expireIn` 与 config 的 `wechat.qrcodeTicketTtlSec`（默认 300s）对齐；
轮询 2.5s 与 `wechat.pollIntervalMs` 对齐。

## 三、设计（核心是阶段 2 的 GitHub 全量）

1. **状态机**：`store.setOAuthState(state, "github", {origin})`（复用既有表）；
   state = `crypto.randomBytes(16).toString("hex")`；TTL 10 分钟；**兑换时一次性消费**
   （`deleteOAuthState` 先于任何外部请求，防并发重放）。
2. **兑换与身份**（callback 内）：
   - `tokenUrl` / `userUrl` 可配置，默认 `https://github.com/login/oauth/access_token`、
     `https://api.github.com/user`；**指向 loopback/私网 仅在 `cfg.dev.allowUnsafeDevEndpoints===true`
     时放行**（复用 demoCode 同款逃生舱，为假 provider 验证与自建网关留口，默认关闭）；
   - 兑换：POST form（`client_id/client_secret/code/redirect_uri`，`Accept: application/json`）；
   - 拉资料：GET userUrl（Bearer 兑换到的 token）→ 取 `id`（稳定 subject）与 `login`（显示名）；
   - `findUserByProvider("github", id)` 命中则登录，未命中
     `createUser({provider:"github", providerId:String(id), name:login, email:null})`
     ——email 为 null 的用户不会进 `findUserByEmail` 命中域（已核实现），与邮箱注册互不污染。
3. **签发与审计**：`makeTokens` + `saveSession`（`deviceName:"github-oauth"`）与密码登录同路；
   审计**复用 `ev:"login"`** 加 `ctx.provider` 字段 —— 不新增事件类型，审计消费方零改动。
4. **回调页**：内联 HTML（无外部资源），成功页 postMessage 后 `setTimeout(close)` 并留手动关闭链接；
   失败页只给错误码（`state_invalid` / `exchange_failed`），**任何情况下 token 不出现在 URL、
   页面文案与服务器日志里**（日志只记 provider + 结果码，与既有日志纪律一致）。
   `targetOrigin` = `cfg.github.postMessageOrigin`（config 默认 `"*"`；收紧部署可填应用 origin）。
   弹窗被拦走 `location.href` 整页跳转的兜底路径（客户端已有）拿不到 opener —— 文档如实注明该形态不支持。
5. **限流**：`/api/auth/github` 与 `/wechat/qrcode` 挂 login 同款 IP 桶；
   `/wechat/status` 单独桶（默认 30/min —— 客户端 2.5s 一轮 ≈ 24/min，login 的 10/min 会误伤轮询）。
6. **安全不变量（每条都要有 verify 用例）**：state 一次性 + TTL；`redirect_uri` 逐字取 config；
   token 不进 URL/日志/错误页；错误码不含敏感细节；新用户不共享邮箱命名空间；
   未配置 fail-closed（503 + 明确错误码，**永不 404**）。

## 四、验证策略（本地可全链路，不赌 CI）

`server/verify/oauth-check.cjs`（新）：本地起**假 GitHub**（loopback 小 HTTP 服务，发 code、
接兑换 POST、回 profile）——服务端 `tokenUrl/userUrl` 指过去（仅 dev flag 下合法），
**走的是真服务端代码路径**，不是 mock 掉一层。用例约 10 条：
未配置 503 双端点 / authorize 形状与 state 入库 / 回调全链路（state 消费、
签发的 token 打 `/api/auth/me` 真的可用）/ 坏 state 重放拒绝 / 兑换失败错误页 /
审计有 `login`+provider / 会话表新增一条 / `/wechat/*` 未配置 503 / 限流命中。
`client-contract-check` 补 3 条形状断言（github authorize、wechat qrcode、wechat status）。
客户端侧 `tests/` 补错误文案细分用例（见阶段 1）。

## 五、分期计划（已列入 docs/roadmap-2026Q4.md 硬阻塞表）

> **执行结果（2026-10-11 当日）**：阶段 1+2 已合并为 **v3.7.113 一次交付**（见文首更正：端点本来就在，
> 真实工作是加固而非新建——所以"落地三端点/阶段3 建握手"不适用）。下表为原计划，保留作过程记录。

| 阶段 | 内容 | 工作量 | 版本 | 前置 |
|---|---|---|---|---|
| **1. fail-closed + 文案** | ~~三端点落地（未配置=503+错误码）~~ → 实为：GitHub 未配凭据 503 fail-closed；`client-contract-check` 补断言；客户端错误文案按 `r.data.error` 细分（新增 `api.ssoNotConfigured`，别再把"没配 OAuth"说成"没有后端"） | 0.5 天 | **v3.7.113（已交付）** | 无 |
| **2. GitHub 全量** | form 兑换 + state TTL/一次性/origin 记录 + 审计 + 限流；`oauth-check` 假 provider 全链路 | 1 天 | **v3.7.113（已交付）** | 真机验收差用户注册一次 OAuth App（免费） |
| ~~3. 扫码确认握手~~ | **不单独做**——微信演示模式的确认链路骨架里已有（`/wechat/confirm`），v3.7.113 一并加固（scene 一次性/过期清理/审计） | — | — | — |
| **4. 微信正式接入** | 换 provider 实现（appid/secret + 官方回调），协议与客户端零改动 | 1 天 | 商务触发 | 企业主体认证 + ICP（维持 2026-10-03 裁定） |

## 六、明确不做

- `/api/auth/github/status` 轮询端点（客户端不用）；
- 账号绑定（`extras.js` 的 `/oauth/:provider/callback` 是"已登录用户绑定第三方身份"，
  与登录是两件事；本轮不动，"GitHub 登录账号 ↔ 已有邮箱账号合并"列为余量）;
- 任何对客户端契约的改动（只细分错误文案）。

## 七、操作纪律

实施沿用本仓发版铁律：门禁链 → 单测 → e2e → 服务端七脚本全绿 → release.mjs →
commit（显式路径）→ tag → push → CI 观察 → 线上指纹字节比对。
**src 双态铁律：改 src/ 后必须先 `src:inject` 再 `src:extract`**（2026-10-11 实测：直接 extract
会把 src 编辑静默回滚——extract 的内容源是"上次注入的 HTML"）。
