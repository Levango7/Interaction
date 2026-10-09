# 鉴权后端：资产找回与安全加固评估

> 编制：2026-10-10（HEAD `db2dd15` / v3.7.104）
> 起因：商业化盘点发现「仓库没有 `server/`，但登录/注册 UI 对所有用户可见可点」。
> 结论一句话：**后端代码一直都在仓库里，只是不在 HEAD 的祖先链上；找回后做了加固，
> 但它仍是「可救的开发骨架」，不是可交付产品。**

---

## 一、资产是怎么丢的，又是怎么找回的

| 项 | 事实 |
|---|---|
| 丢失形态 | 鉴权后端完成于提交 **`ac1114a`**（2026-09-10，709 行 / 8 文件），但 `git merge-base --is-ancestor ac1114a HEAD` 为**假** —— 被远端强推挤出主线 |
| 表象 | `ls server/` 为空 → 长期被记为「后端不存在、需从零开发」 |
| 真相 | 对象仍在仓库里，`git show ac1114a:server/<path>` 随时可取 |
| 找回方式 | `git archive ac1114a server \| tar -x`（**不用 `git checkout`** —— 后者会动索引，在并行会话在场时极危险） |

**教训**：「目录不存在」不等于「代码不存在」。本仓远端有强推史，判断某物是否存在必须以
`merge-base --is-ancestor` 为准，不能以工作区 `ls` 为准。这条已写进项目长期记忆。

---

## 二、落盘的兼容性验证（先证伪「会不会打红门禁」）

落盘 709 行新代码前，先确认它不会触动任何共享门禁 —— **门禁状态是与并行会话共享的，
打红等于动到别人的地盘**。逐项实测：

| 门禁 / CI 步骤 | 扫描面 | 是否覆盖 `server/` |
|---|---|---|
| `npm run lint`（eslint） | 显式文件列表：HTML + electron/main.js + preload.js + service-worker.js | ❌ 否 |
| `lint:empty-catch` | 默认 `src/`（`scripts/lint-empty-catch.mjs:52,62`） | ❌ 否 |
| `lint:layers` / `check:modules` / `src:check` | `src/` 35 块 | ❌ 否 |
| `lint:colors` / `lint:xss` / `lint:appbridge` | HTML 与 src 模板 | ❌ 否 |
| vitest（`npm test`） | `tests/**/*.test.js` | ❌ 否 |
| `ci.yml` 全部步骤 | 均为上表的显式脚本，无全仓扫描 | ❌ 否 |
| `server/.gitignore` | 忽略 `data/`、`node_modules/`、`*.log` | ✅ 数据不入库 |

**结论：落盘 `server/` 零门禁风险，已实证。** 落盘后 `git status` 仅 `?? server/`（未跟踪）。

---

## 三、缺陷清单（行号基于 `ac1114a` 原始文件）

### P0 · 部署即失守（3 条，均已修）

| # | 位置 | 缺陷 | 后果 |
|---|---|---|---|
| P0-1 | `src/auth.js:244-253` | `/wechat/confirm` **无任何鉴权**：传 `email` 即建号/接管，随后 `/wechat/status` 直接签发 `accessToken`+`refreshToken`。README 标「开发用」，但代码**不看 `NODE_ENV`、不看任何配置开关** | **完整认证绕过**：任何人 GET 一次即可接管任意邮箱账号 |
| P0-2 | `src/auth.js:55` | 未配 SMTP 时把 6 位注册验证码放进**响应体**（`demoCode`），同样无环境开关 | 邮箱归属验证形同虚设，可批量注册任意邮箱 |
| P0-3 | `config.example.json:4-5` + `src/index.js:16-37` | JWT 密钥是占位值 `"change-me-access-secret"`，且 `loadConfig()` **从不做校验** | 运维照文档跑起来却不改密钥 = 签名密钥公开，任何人可自签 JWT 接管任意账号 |

### P1 · 应收敛（1 条已修，1 条留作部署项）

| # | 位置 | 缺陷 | 处置 |
|---|---|---|---|
| P1-1 | `src/auth.js:276` | `postMessage(..., '*')` —— token 以**通配符 targetOrigin** 发回 opener，任意 origin 可接收；且 token 直接字符串拼进 `<script>` 未转义 | ✅ 已修：改为读 `cfg.github.postMessageOrigin`，payload 用 `JSON.stringify` 并把 `<` 转义为 `\u003c` |
| P1-2 | `src/index.js:43` + 配置 `corsOrigin:"*"` | `origin: true` = 反射任意 origin，全站开放 | ⚠️ 保留可配置（改死会破坏部署便利性），README 已标红「生产必须改成白名单」 |

### P2 · 已知缺口（未修，部署前需评估）

| # | 位置 | 缺陷 |
|---|---|---|
| P2-1 | `src/store.js:88` | refreshToken **明文落盘**且兼作主键 |
| P2-2 | `src/store.js:41-49` | `_save()` 原吞掉所有写盘异常 → 磁盘不可写时服务照常回「注册成功」，重启后数据凭空消失且无人知晓 |
| P2-3 | 全局 | **无登录失败速率限制**（可暴力破解）、**无审计日志** |
| P2-4 | `src/auth.js:159` | `/devices/:id` 用 refreshToken 前 8 字符反查全表，把短前缀当凭据用 |
| P2-5 | `src/index.js:47` | `/api/health` 版本写死 `3.6.1`（前端已 3.7.104），版本漂移 |

P2-2 属「用户主动操作 + 成功有回执、失败静默」，按本项目判据是**谎报**，已顺手修（改为 `console.error` 留痕）。
P2-1 / P2-3 / P2-4 / P2-5 未修 —— 它们不阻断「本地开发与联调」，但**阻断生产部署**。

### 正面结论（不是一团糟）

bcryptjs 哈希（rounds 10）不存明文、双 token + refresh 可吊销、邮箱正则与密码长度校验、
原子写（`tmp` + `rename`）、凭据全走 config、异常统一收敛不泄栈。
**骨架质量高于平均，缺的是「生产化」而不是「重写」。**

---

## 四、加固内容与验证记录

### 改动

| 文件 | 改动 |
|---|---|
| `src/auth.js` | 新增 `dev.allowUnsafeDevEndpoints` 守卫（P0-1、P0-2 两处）；`sendAuthResult` 改用可配置 `targetOrigin` + payload 转义（P1-1） |
| `src/index.js` | 启动时校验 JWT 密钥是否仍为占位值，是则 **fail fast 拒绝启动**（P0-3）；`ALLOW_PLACEHOLDER_SECRETS=true` 可显式放行并打 WARN |
| `src/store.js` | `_save()` 失败从静默改为 `console.error` 留痕（P2-2） |
| `config.example.json` | 新增 `dev.allowUnsafeDevEndpoints:false`、`github.postMessageOrigin:"*"` |
| `README.md` | 顶部新增「⚠ 当前状态」章节；补充三项新配置与「默认拒绝启动」说明 |
| `verify/hardening-check.cjs` | 新增实证验证脚本（9 条） |

### 验证：`node verify/hardening-check.cjs` → **9/9 通过**

每个 P0 都验**两向**，不只单向：

- **关闭态**：`/wechat/confirm` → `404 not_found`；`/email-code` → `503 email_not_configured` 且响应体无 `demoCode`
- **开启态**（`DEV__ALLOWUNSAFEDEVENDPOINTS=true`）：两者恢复开发行为，证明是**开关在控制**，不是端点被改死
- **回归**：注册 + 验证码链路仍通、已注册邮箱再发码仍 `409`

### 故障注入（证明断言真的在守护）

| 步骤 | 结果 |
|---|---|
| 强化断言：关闭态必须 `error === "not_found"`（而非只查 404） | 仍 9/9 —— 原断言**过弱**，守卫被摘也会绿 |
| 注入：把守卫条件改为 `if (false)` | **8/9**，P0-1 关闭态如期转红 |
| 还原 + 复绿 | 9/9，`node --check` 通过 |

### 踩到的两个环境坑（已固化进脚本注释）

1. **本机 3001 被 Docker Desktop 占用**（PID 54076），独立端口 4571 绕开。
2. **本机有 `http_proxy=127.0.0.1:2972`**，curl 会把 localhost 请求也发去代理 ——
   首次验证拿到 `{"code":200,"db":"up","uptimeSec":213046}`（另一个服务，uptime 59 小时）
   却误判为后端正常。**Node 的 fetch 不读代理环境变量**，故脚本改用 Node 直连。

---

## 五、客户端契约联调（2026-10-10 补做）

「从未联调」是本项目后端的头号缺口，本轮把它从**从未做过**推进到**契约级已通**。

### 做法

新增 `server/verify/client-contract-check.cjs`：忠实复现客户端 `apiFetch` 的真实调用序列
（端点清单由 `grep -rhno '"/api/...*"' src/*.js` 提取，不在客户端源码里改任何东西），
逐个比对「客户端调用的」vs「后端实现的」。独立端口 + Node fetch 直连（沿用 §四 的两个环境坑规避）。

### 结果：修复前 17/20，修复后 23/23

| 端点 | 修复前 | 处置 |
|---|---|---|
| `GET /api/sync/snapshot` | **404** not_found | ✅ 已实现（新增 `src/sync.js`） |
| `PUT /api/sync/snapshot` | **404** not_found | ✅ 已实现 |
| `POST /api/tools/fetch` | **404** not_found | ⚠️ **有意不做**，理由见下 |

**这是「从未联调」最实质的后果**：即使把后端部署起来，**云同步依然不工作** ——
客户端 `src/render-overview.js:1302/1316` 一直在调 GET/PUT `/api/sync/snapshot`，
而 `ac1114a` 那份后端从未实现这两个端点。客户端代码注释里甚至自己写着
「本仓库不含该后端，需部署方实现同名端点」。

### 新实现的云同步端点（`src/sync.js`）

契约严格对齐客户端（字段名不可擅改）：

- `PUT /api/sync/snapshot`，body `{ snapshot, updatedAt }` → 全量覆盖（LWW）
- `GET /api/sync/snapshot` → `{ ok:true, data:{ snapshot } }`；**空态必须是 `null` 而非 `{}`**
  —— 否则客户端会把空对象当成一份真实快照应用下去，覆盖掉本地数据
- 两者均需 Bearer 鉴权（快照含该用户全部数据）
- `updatedAt` 用**服务端接收时刻**：客户端时钟不可信，而 LWW 的比较基准必须同一时钟，
  否则「客户端时钟快」就会让旧数据挤掉新数据；客户端自报时间仅作诊断字段

**刻意不做增量 / 冲突合并**：那需要客户端契约同步升级，
单方面在服务端做会造成「后端以为在合并、客户端以为被覆盖」的错位
（见 `docs/cloud-sync-incremental-contract.md`）。

### 为什么不做 `/api/tools/fetch`

它是 `web_fetch` 的 CORS 兜底代理 —— 本质是「让服务端代抓任意 URL」，
**典型 SSRF 面**。要做就得按本项目已有的承重墙标准实现（主机白名单、拒 userinfo/回环/私网/链路本地/
重定向、限大小与超时，同 ics-fetch 与 notify-webhook 的做法），而不是先接上再补安全。
且它只在用户配置了 `apiBase` 或 `fetchProxy` 时才走代理分支，**不在主链路**。
故如实标为「已识别、待设计」——脚本每次运行都会把它列出来，避免记进文档后就被遗忘。

### 新发现：路由交叉污染（未修）

`src/index.js` 把**同一个 router 实例**挂了两次：

```js
app.use("/api/notifications", extrasRouter(cfg, store));
app.use("/api/integrations",  extrasRouter(cfg, store));
```

实测（非推理）后果 —— 双方前缀下都能访问对方的端点：

| 路径 | 实测 | 应当 |
|---|---|---|
| `/api/notifications/preferences` | 200 | 200 ✅ |
| `/api/integrations/preferences` | **200** | ❌ 不存在 |
| `/api/notifications/status` | **200** | ❌ 不存在 |
| `/api/integrations/status` | 200 | 200 ✅ |

**攻击面翻倍**。危害有限（同一套 `authMiddleware` 保护，无越权），故本轮记为 **P2 已知缺陷**，
未修 —— 修它要把 `extras.js` 拆成 notify / integ 两个 router，属结构性改动，
而本轮遵循「只做加法」，不动已验证通过的文件。**修法建议**：按前缀拆分 router 后各挂各的。

### 新增的守护（含故障注入）

验证脚本新增 4 条（总计 23 条），并对新增的鉴权面做了故障注入：

| 步骤 | 结果 |
|---|---|
| 回读验证：PUT 一份带唯一 marker 的快照，再 GET 回来比对 | 通过（只验 PUT 返 200 证明不了「真的存了」） |
| 空态：新账号读快照必须 `snapshot === null` | 通过（同时验证了跨用户隔离） |
| 无 token 读写快照必须 401（GET + PUT 两条） | 通过 |
| 注入：摘掉 `/api/sync` 的 `am` 中间件 | **两条 401 用例如期转红**（实测返回 500，因 `req.user.sub` 取不到） |
| 精确字符串还原 + 复绿 | 23/23；`hardening-check` 回归仍 9/9 |

---

## 六、距「可卖给客户」还差什么

| 缺项 | 现状 | 说明 |
|---|---|---|
| **客户端联调** | ❌ 从未 | 客户端 `ui-ge-api.js` 默认 `apiBase()=http://localhost:3001`，该服务不存在。v3.7.103 已加 `probeAccountBackend()` 探测并在 UI 如实说明「未检测到账号服务」 |
| **自动化测试** | ❌ 零 | 仅本轮 9 条手工实证。要进 CI 需新增一条 job（属发版文件，本轮未动） |
| **速率限制 / 审计日志** | ❌ 无 | 生产必需 |
| **许可与计费** | ❌ 全零 | `支付/套餐/许可/license/计费/订单/价格` 在 `src/*.js` 命中 **0 文件** |
| **LICENSE** | ⚠️ MIT | 与「售卖」冲突 |
| **隐私政策 / 服务条款 / 用户手册** | ❌ 无 | 商业化必备文本 |

**判断（2026-10-10 更新）**：本轮把后端从「工作区里根本不存在」推进到
**找回 + 修 3 条 P0 + 补上缺失的云同步端点 + 契约级联调 23/23**。
后端本身**已不再是最大缺口** —— 现在拦在商业化前面的是：

1. **真机 UI 联调**（本轮只到契约级：脚本按客户端真实调用序列打，没跑过真实 UI）
2. **未接入 CI**（两个验证脚本是自足的，但 `ci.yml` 里没有它们；改 CI 属发版必改文件）
3. **合规文本 + 计费**（见下表，纯产品决策而非技术问题）

---

## 七、复现命令

```bash
# 1. 找回（若 server/ 再次丢失）
git archive ac1114a server | tar -x

# 2. 安装依赖并跑两个验证脚本
cd server && npm install
node verify/hardening-check.cjs        # 期望 9/9   —— 3 条 P0 守卫 + 反向放行
node verify/client-contract-check.cjs  # 期望 23/23 —— 客户端契约联调

# 3. 启动（默认因占位密钥拒绝，需先给密钥）
JWT__ACCESSSECRET="$(openssl rand -hex 32)" JWT__REFRESHSECRET="$(openssl rand -hex 32)" npm start
# 端口冲突时：PORT=4571 npm start   （本机 3001 常被 Docker Desktop 占用）
```

```bash
# 4. 复现「客户端到底调了哪些端点」的清单（后端实现要对齐它）
grep -rhno '"/api/[a-zA-Z0-9/_:{}$-]*"' src/*.js | sed 's/.*"\(\/api[^"]*\)"/\1/' | sort -u
```

*本文件不替代 `server/README.md`；后者是运维口径，本文是审计口径。*
