# Linear / Jira 真机验收：一步到位的配方

> 为什么单独写这份：台账 §五 里这两条一直挂着「等 workspace 凭据」，但**光有凭据也验不完**——
> 代码侧曾把两家的凭据形态都发错（R-16，已修）。验收的人（包括拿到 key 之后的你自己）需要的
> 是「粘哪个字段、发哪一种 header、成功长什么样、失败怎么区分」，而不是回去读源码。
> 相关代码：`src/ui-ge-integrations.js`（`_linearAuthHeader` / `_jiraAuthHeader` / `_jiraRequest`）、
> `electron/main.js` 的 `jira-fetch` 中继；门禁 `tests/integration-auth-form.test.js`、
> `tests/electron-ipc.test.js` 的 jira-fetch 组。

## 一、形态对照（这两家不一样，别照抄）

| 服务商 | 凭据 | Authorization 头 | 备注 |
|---|---|---|---|
| Linear | 个人 API Key（`lin_api_…`） | **原样**：`Authorization: lin_api_…` | `Bearer` 前缀只属于 OAuth access token |
| Jira **Cloud** | API Token + **账号邮箱** | `Basic base64(email:apiToken)` | 面板里 email 必填 |
| Jira **Server/DC** | PAT | `Bearer <PAT>` | 面板里 email **留空**即为这一档 |

面板入口：设置 → 集成 → 对应卡片 → 「连接」（Jira 的 email 字段是 v3.7.124 才补上的）。

## 二、先分清"哪种失败"再动手

| 现象 | 判定 | 依据 |
|---|---|---|
| 浏览器（网页版）里连 Jira 直接拒绝，提示「仅桌面版可用」 | **按设计**，不是缺陷 | Atlassian 不回 CORS 头（实测），请求在网页形态根本发不出去；桌面版走主进程中继 |
| 连 Linear 报 401 `AUTHENTICATION_ERROR` | 凭据本身无效 / 权限不足 | ⚠️ **无凭据实测区分不出形态**：不带、原样、Bearer 三种写法 Linear 都回同一个 401；Atlassian 匿名只给 `WWW-Authenticate: OAuth realm=`。所以 401 先怀疑 key，不要怀疑形状 |
| 连 Jira 报 401/403 而 key 确认有效 | 大概率是没填 email（Cloud 必须 Basic） | 面板 email 留空 = 按 Server/DC 发 Bearer |
| 「连上了但每次同步都失败」 | 看诊断面板 `pushDiag` 的 `jiraConnect` / `idb` 行 | 中继是第二道门，域名/路径/方法白名单会拒非法值 |

## 三、验收步骤（每步都有可核对的期望值）

**前置**：一枚有效的 Linear 个人 API Key（Settings → API）、或一个 Atlassian Cloud 站点 + API Token + 该账号邮箱。

1. **免凭据自检**（随时可跑，不发真实请求）：
   `npx vitest run tests/integration-auth-form.test.js tests/electron-ipc.test.js`
   期望：全绿。这组锁的是 header 形态、中继每一跳都带 email、以及渲染/主进程两侧同值。
2. **命令行先验通凭据本身**（把 key 换成你的，别贴进仓库）：
   - Linear：`curl -s -X POST https://api.linear.app/graphql -H "Content-Type: application/json" -H "Authorization: lin_api_XXXX" -d '{"query":"query{viewer{id name}}"}'`
     → 期望 200 且返回 `viewer.id`。若这里就 401，应用里一定也连不上，先解决 key。
   - Jira Cloud：`curl -s -u "you@example.com:API_TOKEN" https://<子域>.atlassian.net/rest/api/3/myself`
     （`-u` 即 Basic）→ 期望 200 与自己的 `displayName`。
3. **应用内连接**：桌面版打开 → 设置 → 集成 → 填表 → 连接。
   期望：卡片显示"已连接"，且 `_verified` 为真（诊断面板里该 provider 行有验证时间）。
4. **走一次真数据通路**（这才算验收，光"连上"不算）：
   - Linear：任务页挑一条未完成任务 → 推送到 Linear → 期望 Linear 里真出现 issue，标题一致，
     **状态由团队工作流运行时匹配**（新 issue 落默认状态，不猜状态 id）。
   - Jira：推送一条任务 → 期望 `<项目Key>` 下新建 issue（创建请求**刻意不带 status**，Jira create 不接受，
     带了必 400）；改本地状态再推一次 → 期望走 transitions，命中才变换。
5. **回归面**：`npm run verify:ci`（源码态全量门禁）。

## 四、隐私与安全边界（别把这些当可选项）

- Jira token 与 Linear key 随应用数据**加密落本机**，不上传任何第三方；webhook 类凭据（飞书/钉钉/Slack）
  **不落盘**，是本会话内存态，刷新即失效。
- 验收脚本与日志里**不许出现真实 key**：主进程 `jira-fetch` 只记主机与状态码，不记 token 与正文。
- 不要把真实 key 提交进仓库，包括测试替身里 —— 测试一律用 `lin_api_TESTKEY` 这类假值 + 注入的假 HTTP。
