# 产品边界与已移除功能清单（Product Scope）

> 本文件作为"功能范围护栏"，防止已移除功能以死 UI / stub / 文档残留的形式回潮。
> 维护原则：**凡新增/移除功能，必须同步更新本清单与 README**（三处一致：README / CHANGELOG / 本文件）。

---

## 一、产品定位（一句话）

> **面向个人用户（自己 / 开发者 / 知识工作者）的本地优先任务工坊——AI 不只是聊天，而是能真正动手创建 / 修改 / 完成任务与资料。**

核心约束：
- 单文件 HTML + 本地优先存储，**基础功能无需后端服务器**。个人账号、邮箱验证码、第三方登录与云同步依赖另行部署的兼容 API；仓库包含客户端，但本次未完成实际后端联调。不登录时可使用本地任务、资料与导入导出。
- 三种运行形态共用同一份 `agent-workbench.html`（Edge 应用 / 本地服务 / Electron）
- **联网边界**：AI、检索、可选账号/云同步及外部集成需要访问对应服务；`code_run`/`sql_query` 在本机 WASM 沙箱执行，但运行时资源首次加载可能需要联网。

---

## 二、范围内功能（v1.14 之后保留）

| 模块 | 状态 | 说明 |
|---|---|---|
| 7 场景任务看板 | ✅ 核心 | 办公 / 数据 / 设计 / 学习 / 编程 / 生活 / 健康（ORDER 顺序），待办/进行中/已完成 |
| 预置场景「理财」 | ✅ 预置隐藏 | 定义保留但不进 ORDER，由插件市场启用后进入导航 |
| 场景资料库 | ✅ 核心 | 会议纪要 / 作品记录 / 学习资料 / 数据记录 / 代码片段 / 生活记录 / 健康记录 |
| AI 助手（26 工具） | ✅ 核心 | function-calling 增删改查 + 联网检索 + 代码/SQL 执行，Key AES-GCM 加密 |
| Agent 能力（7 工具） | ✅ 核心 | 工作记忆 / 多步目标 / 跨场景协调 |
| 账号与云同步 | ✅ 可选 | 微信 / GitHub 登录 + 快照同步（自建 API），默认不启用。客户端两侧（拉 `GET` / 推 `PUT` `/api/sync/snapshot`）均已实现（v3.7.53 补齐推送侧），**未与真实后端联调**；同步状态如实显示（推成功才「已同步」，能力缺失显示「仅本机」） |
| 习惯链（场景联动） | ✅ 核心 | 跨场景联动 + streak + 热力图 |
| SM-2 间隔复习 | ✅ 场景工具 | 学习场景 |
| 周报生成器 | ✅ 场景工具 | 办公/编程场景 |
| SQL Playground | ✅ 场景工具 | 数据场景，sql.js WASM 内存库 |
| 自定义仪表盘 | ✅ 核心 | 15 个可拖拽组件（DASHBOARD_WIDGETS），布局自动保存 |
| 图表画布 / 高级报表 | ✅ 核心 | 画布编排图表；周/月/年报表与对比 |
| 任务时间轴 | ✅ 核心 | 14 天 × 场景泳道回放（读任务事件流） |
| 插件市场（10 个内置插件） | ✅ 可选插件 | 番茄钟 / 阅读 / 理财 / 预算 / 健康助手 / 习惯追踪 / 天气 / 每日一言 / 专注计时 / 思维导图，默认关闭 |
| 数据管理 | ✅ 核心 | 导出/导入/自动备份/回收站 |
| 消息中心 | ✅ 系统 | 站内通知（顶栏） |
| **桌面萌宠** | ✅ 陪伴向（v3.6 起） | 9 只角色 / 两档风格 / 三档尺寸 / 眨眼·动作·说话；**不接入 AI、不读用户数据**，纯本地 UI 陪伴 |
| PWA（安装 + 离线） | ✅ 系统 | manifest + service worker |

> **健康助手的定位变更（v3.5.2）**：健康已由「可选插件」升级为**独立内置场景**（`SCENARIOS.health`，拥有运动/体重/睡眠/饮水/饮食记录字段）。
> 插件注册表中的 `health` 插件保留，语义变为「把健康卡挂载到**生活**场景」的可选开关（启用 → `SCENARIOS.life.extraCard="health"`，禁用 → 回 `"life"`），默认关闭。

---

## 二·补、萌宠相关的"已废弃实现"（禁止回潮）

| 做法 | 结论 | 原因 |
|---|---|---|
| 为 3D 风格**另做一套 img2img 重渲染稿** | ❌ 已废弃 | 细节必然糊（浅色毛长出黑斑），且体积翻倍 |
| 用 alpha 距离场做本地 2.5D 布光 | ❌ 已废弃 | 只对轮廓有效，贴纸内部无解，像浮雕 |
| 用 NCC 自动配准平移五官坐标 | ❌ 已废弃 | 低纹理区归一化失效（算出 >1 的 NCC），错位黑条比没有更糟 |
| **当前做法**：同一张清晰立绘 + CSS 2.5D（厚度/方向光/扫光/摇摆/倾斜） | ✅ 采用 | 细节零损失、体积更小；两档风格共用同一套五官标定 |

详见 [docs/pet-system.md](pet-system.md)。

---

## 三、已移除功能（v1.14 / v1.14.1 归档，禁止回潮）

### 🔴 代码已删，UI 必须同步清理（违反即 bug）

| 功能 | 移除版本 | 残留证据（修复前） | 修复状态 |
|---|---|---|---|
| **生物识别门禁**（WebAuthn / Windows Hello / Touch ID） | v1.14 | 设置页"生物识别"卡片 + `biometricRecheckAvailability`/`biometricRegister`/`biometricSaveSettings` stub + `_maybeBioProtect` 包装 | ✅ 已删（v1.15） |
| **多模态图片附件**（vision / OCR / 图片随消息发送） | v1.14 | 附件按钮图片分支 + `multimodalGetAttachment`/`multimodalAddAttachment` stub + `chatPendingImages` 发送队列 | ✅ 已删（v1.15，附件仅支持文本） |
| **E2EE 便捷封装**（e2eeEncrypt/Decrypt + WithDevice 包装） | v1.14 | stub 死链（无调用者） | ✅ 已删（v1.15） |
| **OAuth2 管理函数**（oauth2GetToken/BuildAuthUrl/RevokeToken/RegisterProvider） | v1.14 | stub 死链（无调用者） | ✅ 已删（v1.15，保留 `_oauth2HandleCallback` 启动占位） |
| **协作 / 分享按钮**（btnCollab / btnShare） | v1.15 | 死按钮（仅 HTML 定义、无 JS 绑定）；CRDT 协作模块 v1.14 已归档，纯本地无后端无法真正协作/分享 | ✅ 已删（v1.15，随更多菜单一并移除） |
| **"更多"工具菜单**（btnMoreTop / moreMenu） | v1.15 | 甘特/导图/仪表盘在图表页已有入口、笔记在知识页已有入口，菜单冗余 | ✅ 已删（v1.15，功能无丢失） |
| **离线 AI 框架**（WebLLM 本地推理 / ONNX Runtime / 模型缓存 / 隐私过滤 API） | v3.7.58 | 无 UI 入口、无测试引用、零外部调用的沉睡框架：`initWebLLM` 假进度条 + `_webllmEngine` 模拟引擎对象 + ONNX 模型表指向从未存在的 `assets/onnx/` | ✅ 已删（v3.7.58，连 data-idb 模型缓存四助手与 p5.* 孤儿 i18n 键一并清理，约 2270 行） |
| **ML 行为预测**（predictCompletionRate / calcProductivityScore / recommend 协同过滤等） | v3.7.58 | 数学实现真实但无任何 render/UI 调用点（"智能推荐"卡片走的是 LLM 版 `aiSmartRecommend`，与此无关） | ✅ 已删（v3.7.58，同上批） |
| **智能排期**（scoreTask / optimizeSchedule / smartSchedule / suggestBreaks） | v3.7.58 | 无 UI 入口、零外部调用 | ✅ 已删（v3.7.58，同上批） |
| **情绪分析**（analyzeSentiment / detectEmotion / emotionTrend） | v3.7.58 | 无 UI 入口、零外部调用 | ✅ 已删（v3.7.58，同上批） |
| **AI 扩展页的「AI 插件」卡**（`AI_BUILTIN_PLUGINS` code_runner / web_search / file_reader） | v3.7.59 | 「stub + 活 UI」典型：勾了只写配置、不改任何行为，其文案自己写着"暂无执行代码"；而 `web_search`/`code_run` **本就是模型可直接调用的真工具**，这份列表是已有能力的假副本 | ✅ 已删（v3.7.59：卡片 + `renderAiPluginList` + `#aiPluginSave` 处理器 + 桥导出 + `aiPlugin.*`/`ai.plugin*` i18n 键全清。**真·插件市场 `BUILTIN_PLUGINS`（10 个可安装插件）未受影响**） |
| **v1.7-A 本地"Agent 自主执行"**（agentPlan / agentExecuteStep / agentVerify / agentReflect / agentRun） | v3.7.59 | 关键词猜工具的本地规划，无 UI 入口、零测试、未上 `__test` 桥；唯一指向它的活代码是 `aiDecomposeTask` 的 `opts.useLocalPlan` 分支，而全仓无人传该选项 | ✅ 已删（v3.7.59。替代：命令面板 `>` → `proposeAgentPlan` 先出计划 → 回「确认执行」→ `executeAgentPlan`，且破坏性步骤被 `DANGER_CONFIRM_TOOLS` 拦下） |
| **v1.7-A 词袋"长期记忆"**（saveConversation / getRelevantMemory / addLongTermMemory / _textToVector / _cosineSimilarity） | v3.7.59 | 用词袋 + 余弦冒充向量检索，无入口无调用 | ✅ 已删（v3.7.59。真语义召回到 v3.7.59 起走 ai-tools 的 embedding 通道 + RRF，见 §二） |
| **v1.7-A 旧 TF-IDF RAG 索引**（buildIndex / tfidfScore / ragRetrieve / indexFromNotes / saveRagIndex / loadRagIndex） | v3.7.59 | v3.7.57 已换血为 CJK 二元组 BM25 + provider 向量（`getRagDocs`/`ragSearch`），这套旧索引**无任何读取方**；但笔记钩子 `_notifyNotesChanged`/`_onNotesChanged` 仍在每次笔记 CRUD 后刷它（空转） | ✅ 已删（v3.7.59，钩子与 4 处调用点一并移除。**✅ 遗留已清偿（v3.7.67）**：增量索引落地 —— 写路径（setTasks/setRec/saveNotes/appendChat）经 core 的 emitDataMutate 广播，ai-tools 的 ragSyncIncremental 按内容哈希 diff 只落变更文档（含导入/云恢复两个批量入口）；手动「重建索引」保留作全量兜底） |
| **v1.7-A 本地"AI 代码审查"**（reviewCode / detectSecurityIssues / suggestOptimization / reviewScore） | v3.7.59 | 纯本地模式匹配冒充 AI 能力，无入口无调用 | ✅ 已删（v3.7.59） |

### 🟡 代码仅留占位，入口已关（观察期后清理）

| 功能 | 现状 | 说明 |
|---|---|---|
| 工作流引擎 / 自动化规则 / Webhook 总线 | 已归档（`2321ec3`），入口冻结 | 代码中 `wfEvalCondition` 等恢复为可执行但无 UI 入口；调用点残留已清理（`_wfWireInjectors`/`startCronScheduler` 死引用已删） |
| 语音助手 | 已归档，UI 无入口 | 帮助文档相关条目已删 |
| **Electron 本机同步**（127.0.0.1:8124 + `syncPush`/`syncGet`） | 主进程侧从未实现；v3.7.52 起页面侧按能力缺失隐藏入口 | 页面曾调用 preload 未暴露的 `electronAPI.syncPush/syncGet`，并每 60s 弹一次失败告警（stub + 活 UI = 虚假功能）。现检测不到能力时隐藏「本机同步下载」按钮、不启定时器。**恢复方式**：主进程补 `sync-push` / `sync-get` IPC + 实现 8124 同步服务，preload 同步暴露 API 后入口自恢复 |
| 企业协作 / CRDT / Capacitor / RBAC / **企业级 SSO** | 已归档（`892a1da`） | 无 UI 残留。**注意区分**：v3.5 起新增的微信 / GitHub 第三方登录属「个人账号 + 可选云同步」，不是企业 SSO，见 §二 |

### 🟠 代码在、入口在、但能力未接到底（v3.7.60 标记废弃，等渠道定案）

> **v3.7.66 定案进度**：七个 provider 里 **飞书已接到底**（群机器人 webhook 通知；需页面跑在真实
> http(s) 源，即「启动本地服务.bat」或线上站点，双击 `file://` 拿不到 CORS 故被禁用），
> **钉钉接到底但仅桌面版**（它的 webhook 任何 origin 都不回 CORS 头，只能由 Electron 主进程发）。
> 详见下一节 ✅。本表只剩 **Notion / Linear / Jira / Slack / 日历** 五个待定
> （用户 2026-09-29：「等接通后再定」）。

| 功能 | 实测定性（v3.7.60，真实 Chromium + stub fetch） | 处置 |
|---|---|---|
| **集成中心 · 连接与凭据验证**（v3.7.60 时含 notion / linear / jira / slack / 飞书 / 钉钉 / 日历 七个；**现剩五个**，飞书 / 钉钉改走 webhook 且不再走凭据存储） | **是真的**：各 provider 打到正确验证端点（`api.notion.com/v1/users/me`、`slack.com/api/auth.test` 等），凭据进 `Authorization` 头、结果落 `wb_integration_providers`；401 时面板如实显示「已连接 · 未验证」；日历 OAuth 按钮在非 Electron 下自动隐藏 | 保留。附带修了一个凭据外泄面：`jiraConnect` 原样把用户填的 `domain` 拼成请求主机位，实测 `domain="evil.example.com/?x="` 会把 Bearer token 发去该主机；现由 `_intJiraBase()` 只放行纯主机名 |
| **集成中心 · 同步 / 通知**（`*SyncTask` / `*SyncNote` / `*ListIssues` / `*SendMessage` / `*NotifyEvent` / `*CreateTaskFromMessage` / `calendar*Event` / `integrationList·Enable·Disable·ConfigureProvider` / `integrationGetStatus`） | **零调用方**：连上七个 provider 后跑「建任务 / 完成任务 / 重渲染 / `notifySystem` / `checkDueTasks`」，集成域名 **0 次外发**；UI 里也没有任何"同步到 X"入口。共 **30 个函数、约 855 行**（其中 5 个只被同为废弃的函数调用，属传递性死） | **先只标记不删**（用户 2026-09-28：「先标记废弃，等我定好渠道再动」）。30 个函数逐个挂 `@deprecated v3.7.60 应用内零调用方…`，区域头留处置说明。**v3.7.66 渠道定案后已降到 24 个**：飞书 / 钉钉选定 webhook 通道，其 6 个旧函数（`feishu` / `dingtalk` × `SendMessage` / `NotifyEvent` / `CreateTaskFromMessage`，含被 `feishuNotifyEvent` 调用的 1 条内部边）随本次改造**直接删除** —— 留着就是给一个已被判定"个人场景配不通"的 App 凭据模型留尸体。剩余 24 个（notion / linear / jira / slack / 日历）**仍只标记**，等其余五个 provider 的定案（用户 2026-09-29：「等接通后再定」）。⚑ 守护：`tests/integration-deprecated.test.js`（锁"标记仍在 + 仍然零调用 + 活路径未被误标 + 已删的 6 个不回流"） |

### ✅ 已接到底：飞书（需 http(s) 源）/ 钉钉（仅桌面版）群机器人 webhook 通知（v3.7.66）

用户 2026-09-29 定案：「**那就飞书和钉钉吧，那种东西最好不要上远程，本地也不要**」—— 经追问明确
"那种东西"指 **凭据**，口径是 **绝不落盘**（不写 localStorage、不进备份、不上云）。

| 维度 | 落地情况（均实测，非静态结论） |
|---|---|
| **通道选型** | 群**自定义机器人 webhook**，不是企业自建应用。旧 `appKey/appSecret + chatId` 那套要管理员权限、还要用户拿不到的 `chatId`，个人场景根本配不通 —— 这正是 v3.7.60 把 6 个旧函数判死的原因。webhook 一个地址即可、天然单向，恰好匹配"通知推出去" |
| **可达性分流（v3.7.66，真实网络 + 真实 Chromium 矩阵实测）** | webhook 是 `Content-Type: application/json` 的 POST，**必触发 CORS 预检**，所以"能不能发"由 **origin × 传输两个轴**决定，单看渠道会判错。实测（`_probe/cors-origin-matrix.mjs` 用真实 Chromium 分别跑 `file://` 与 `http://127.0.0.1`；`_probe/electron-cors-main.cjs` 用真 Electron、webPreferences 与本应用一致）：<br>┌ 渠道 · 渲染进程 · `file://`（双击） ┐ 渠道 · 渲染进程 · `http(s)`（本地服务/线上站点） ┐ 主进程 Node fetch ┐<br>· **飞书**：❌ 被拦 ┐ ✅ 放行 ┐ ✅<br>· **钉钉**：❌ 被拦 ┐ ❌ 被拦 ┐ ✅<br>机制：钉钉/企微**任何 origin 都不回 `Access-Control-Allow-Origin`**（企微预检直接 403）；飞书只在 Origin 是真实 http(s) 源时给 `ACAO: *`，`file://` 下**一个 CORS 头都不回**（`curl -H "Origin: null"` 复测确认）。本应用 Electron 窗口 `sandbox:true` 且未关 `webSecurity`，加载方式又是 `loadFile()` = `file://` → **渲染进程连飞书都发不出去**，只有主进程能发。<br>⚠️ 我一开始只带 `Origin: http://localhost:8124` 用 curl 测出飞书给 `ACAO: *`，就下结论"飞书浏览器可用"—— 那是**一轴的证据推两轴的结论**，双击 `file://` 的用户实际发不出去。 |
| **主进程代发的由来** | 上面那条不是"能不能加个渠道"的问题，是"已写好的渠道是否真发得出去"。解法：`ipcMain.handle("notify-send")` 用主进程 Node 全局 `fetch`（无 CORS 约束）代发，`preload.js` 暴露 `electronAPI.notifySend`。渲染层按**两轴**分流（`notifyHasMainSender` + `notifyOriginIsHttpish`，汇成 `notifyChannelAvailable`）：飞书在 http(s) 源或有主进程时开放，**钉钉只在有主进程时开放**；其余情况面板给出对应标签（钉钉「仅桌面版可用」、飞书「需以 http 方式打开」）并禁用连接按钮、用 title 写出原因与出路。<br>被拒的通道**一个请求都不许发**，也不许把 webhook 存进内存冒充已连接（`notifyHookConnect` 里拦，不在按钮上拦 —— e2e 有绕过 UI 直接调用的用例）。 |
| **这条 IPC 的安全边界** | 它等于"让渲染进程驱动主进程对一个 URL 发 POST"，所以承重墙是主机白名单：`isSafeNotifyWebhookUrl` 只放行三家公开 webhook 主机，**精确匹配**（`oapi.dingtalk.com.evil.example.com` 必须拒）、强制 `https:`、拒 userinfo（`https://oapi.dingtalk.com@evil`）、拒回环与链路本地（`127.0.0.1` / `169.254.169.254`）。`assertTrustedSender` 与 chat 同一道门。`timeoutMs` 钳在 1s–20s。日志**只记主机与状态码**，绝不记 `access_token` / `sign` / 正文（有用例直接读 `logs/app.log` 反证）。 |
| **消费点** | `notifySystem(title, body, kind)`（`src/ui-daily.js`）本地展示之外多走一条外发漏斗，5 个生产调用点全部带上事件类别：`daily` / `due` / `chain` / `review`×2 |
| **层级** | 没有让 `ui-daily` 直接调 `ui-ge-integrations`（`check:modules` 实测会新增逆层边 `ui-daily>ui-ge-integrations`）。改为 `core` 暴露 `registerExternalNotifier` / `emitExternalNotify` 注册位，两条边都向下 |
| **签名口径** | 钉钉：ts 用**毫秒**，`sign = HMAC(key=secret, data=ts+"\n"+secret)`，进 **URL query**。飞书：ts 用**秒**，`sign = HMAC(key=ts+"\n"+secret, data=空串)`，进 **JSON body**。两者方向相反，写反必签失败 |
| **失败口径** | 钉钉 HTTP 200 仍可能 `errcode≠0` —— 只看 `resp.ok` 会把失败当成功，已按 `errcode` 判定。`notifyHookSend` **永不抛错**，广播 fire-and-forget，失败只进诊断面板（`pushDiag`），本地通知不受影响 |
| **不落盘（🔴 硬约束）** | webhook 地址与 Secret 只存在模块内存对象；不走 `integrationRegisterProvider` / `_intSaveProviders` 那条密封写盘链。**三条零持久化断言**在真实 Chromium 里跑：配置后 `localStorage` 无 `wb_integration_*` 飞书/钉钉条目、刷新后凭据确实失效、面板回显只给 `host/…xxxx…` 脱敏 hint |
| **历史凭据回扫** | 旧版本把 `appSecret` / `accessSecret`（甚至当时不算"敏感"的 `appId` / `accessKey` 明文）写进过 `wb_integration_providers`。`_notifyScrubPersisted()` 在 `startup()` 里一次性抹掉 feishu / dingtalk 两条，幂等 |
| **文案** | 面板与描述改成 webhook 口径，并显式写「⚠ 只保存在本次会话内存里：不写入本地存储、不进备份与云同步，**刷新或关闭页面即失效**」。不让用户误以为存下来了。钉钉的描述与状态位必须写明**仅桌面版可用**并带限制原因，飞书不许被一并误标。⚑ 文案诚实度守护统一归 `tests/integration-jira-domain.test.js` 的「集成中心文案只承诺真接了的能力」（分组：未接线 5 家必须写"尚未接入"、已接线 2 家必须写 webhook + 会话内存 + 不许承诺同步 + 钉钉必须写「仅桌面版」）；`tests/notify-webhook.test.js` 只测通道行为，不重复断言措辞 |
| **测试** | `tests/notify-webhook.test.js` 22 条（jsdom，签名用 Node `createHmac` 当独立 oracle；§⑥ 是传输分流与能力门）· `tests/electron-ipc.test.js` notify-send 组 13 条（白名单/子域伪装/userinfo/明文 http/回环与链路本地/payload 校验/未受信 sender/网络异常/超时/钳值/**日志不泄露 token**）· `tests/preload-contract.test.js` 4 条（preload 暴露面契约，见下）· `tests/e2e/notify-hook.spec.js` **按 origin 分两组**共 7 条 × desktop/tablet 两项目（真实 Chromium，实测 14/14）：http 组 6 条证明「接通了真能发」+ 零落盘 + 刷新失效 + 非法地址零外发 + http 源下钉钉仍禁；file 组 1 条证明 `file://` 下**两个渠道都被如实禁用且零外发**。另用 `_probe/pw.mobile-notify.config.js` 一次性在 375×667 复跑 · `_probe/verify-notify-hook.mjs` 真机断言（含 3 项零持久化）。**每条新守护都做过变异验证**：① 注入 `localStorage.setItem("wb_integration_providers", …)` → 零持久化转红并点名该键；② 摘掉 `_notifyScrubPersisted` 的写回 → 回扫两条转红；③ 未登记类别兜底改回旧写法 → 「关不掉的通道」转红（expected 2 to be 1）；④ 摘掉 `preload.js` 的 `notifySend` → 契约组 3 条转红且报出方法名 |
| **接线守护（为什么还要 preload 契约测试）** | 桌面专属能力是三段接线：主进程注册 IPC + preload 暴露同名方法 + 渲染层探测该方法。前两段与第三段此前各自有测试，**中间那层无人覆盖** —— preload 少暴露或改名，渲染层 `typeof api.notifySend === "function"` 恒 false，钉钉就退化成"标了仅桌面版但桌面版也用不了"，而全部门禁照绿。`tests/preload-contract.test.js` 是真的把 preload 用假 `require("electron")` 执行、捕获交给 `exposeInMainWorld` 的对象来断言（不是文本正则），与 §⑥ 的 consumer 侧断言合成闭环。**顺带清掉一个假守护**：原 `tests/preload-static-check.cjs` 已删除 —— 它永不执行（vitest `include` 只收 `tests/**/*.test.js`，CI 与 npm 脚本都没引用），断言本身还是错的（要求 preload 从 `electron` 解构出 `app`，而 `app` 属主进程、preload 里本就不该有），实测 `node tests/preload-static-check.cjs` 直接 exit 1。留着一个"看起来在检查、真跑必红"的文件比没有更糟。删除只落工作区、未入索引，避免与并行会话的提交纠缠。 |

**顺带修掉一个既有 P1（真机实测才发现）**：集成配置弹窗此前**完全不可见**。`.cmd` 基类是
`display:none`，靠自身 `.show` 才显示，而旧代码把 `.show` 加在外层 overlay 上、并把 `.cmd` 的
`classList.add("show")` 塞进了 `requestAnimationFrame`。headless 下没有合成帧，rAF 根本不触发 ——
这正是我用 `p.screenshot()` 强制出帧才暴露出来的。现改为 `appendChild` 后**同步**加 `.show`。
> 单测（jsdom）照不到：jsdom 不应用样式表，`display:none` 对它而言不存在。**"看不见"类缺陷必须真机断言。**

**剩余待决（等这条渠道跑通后再定，用户 2026-09-29）**：Notion / Linear / Jira / Slack / 日历 这五个
provider 的 24 个废弃函数是接消费点还是整清 —— 本轮不动，也不在它们上面加新 UI。

> ⚠️ **本簇曾被误判为"静态零引用死码"**，真因是 `openIntegrationConfig` 用字符串拼接派发
> `window[name + "Connect"]` / `window[name + "Disconnect"]` —— 按标识符计数的可达性普查看不见这条边。
> 判"零引用可删"前必须：① 枚举 `window[` / `new Function` / `eval` 类派发点（本仓 `window[...]` 仅 3 处）；
> ② 真机把入口跑一遍。详见 §四.4。

> ⚠️ **另一项实测缺口（部分定案，剩余未决）**：备份/迁移只枚举 `wb_agent_` 前缀 + `wb_custom_links`
> （`src/ui-backup-stats.js:395`），所以 `wb_integration_providers` / `_sync_state` / `_api_keys` /
> `_rate_limits` **不进备份**。
> - **飞书 / 钉钉（v3.7.66 已定案）**：本就不落任何磁盘，"不进备份"是策略的一部分而非副作用；
>   UI 与文档均已显式声明。旧版本可能残留的历史条目由 `_notifyScrubPersisted()` 启动时抹掉。
> - **Notion / Linear / Jira / Slack / 日历（未决）**：仍走 `wb_integration_providers` 密封写盘，
>   因而"连上就存、恢复备份后连接状态静默丢失"。要么显式声明"这批凭据不随备份走"，要么纳入并加密 —— 待用户定。

---

## 四、死 UI 检测规范（防回潮）

**每次改动 UI 后，自查四条：**

1. **按钮有绑定**：设置页 / 顶栏 / 侧栏每个 `<button id="...">` 必须有对应 `.onclick` 或事件委托分支。新增按钮时同步加绑定，否则视为 bug。
   - 已发现并修复的历史案例：日历按钮、自动化按钮、番茄钟/计时按钮、空态"新建任务"按钮、生物识别按钮、图片附件（均曾"点了没反应"）。
   - **v3.6.6 新增案例（已修）**：`#btnGantt` / `#btnDashboard` 自 v1.15「更多菜单移除」后已不在 DOM，但 `openGanttModal` / `openDashboardModal` 仍只绑在它们身上 → 甘特图与自定义仪表盘（15 组件 + 拖拽布局）全无入口。已在「工具箱 → 功能」补 `x-gantt` / `x-dashboard` 两个入口。
2. **stub 无 UI 引用**：删除模块时，保留的 stub 若被 UI 引用（按钮 / 开关 / 表单），必须同步移除 UI 或改为"已停用"提示——**stub + 活 UI = 虚假功能**。
3. **文档与代码一致**：帮助文档中出现的每个功能入口，必须在代码中有对应实现；README 宣称的每个功能，必须能在 UI 找到。
4. **文案承诺不得超出实际接线**（v3.7.60 集成簇实测）：入口和后端调用都是真的，但**说明文字承诺了没接的部分**，同样是虚假功能。
   - 实例：`设置 → 集成` 七个 provider 的文案写着"同步笔记和任务到 Notion""接收 Slack 消息通知"，
     实测「连接」确实各自打到正确端点（`api.notion.com/v1/users/me`、`slack.com/api/auth.test` 等）并落盘 `_verified`，
     但**没有任何代码路径消费这个连接** —— 建任务 / 完成任务 / 触发通知 / 每日检查后，集成域名 0 次外发，
     UI 里也没有任何"同步到 X"按钮。已把 8 条文案改为只承诺"验证凭据"，并在面板总说明里写明
     "任务 / 笔记 / 日程同步与消息通知尚未接入，连接本身不会向任何服务发送数据"。
   - 守护：`tests/integration-jira-domain.test.js` 断言 7 条 provider 描述 + 总说明的措辞。

> 🔴 **静态可达性普查有已知盲区，不能单独作为"可删"的依据**（v3.7.60 复核结论）：
> 本簇曾被普查判为"零引用死码"，真因是 `openIntegrationConfig` 用**字符串拼接派发**
> —— `window[name + "Connect"]` / `window[name + "Disconnect"]`（`src/ui-global-events.js`），
> 任何按标识符引用计数的工具都看不见这条边。全仓 `window[...]` 动态派发点只有 3 处
> （另 1 处是消息动作的 `data-msg-fn`，无集成用法）。
> **判"零引用可删"前必须**：① 枚举 `window[` / `new Function` / `eval` 类派发点；
> ② 真机跑一遍入口（点开、提交、看是否真的外发/落盘）。
> 反之，`*SyncTask` / `*SendMessage` / `*NotifyEvent` / `calendar*Event` 这批
> **确认既无静态调用方、也不在任何动态派发面上**，才是可删候选。

---

## 五、图标 / 文案规范

- **禁止彩色 emoji** 出现在 UI 文案（已清零）。统一用 `UI_ICONS` 2px 线性 SVG，模板内用 `${ic("name")}` 注入。
- 移除功能时同步更新：README 特性列表 / 帮助文档（`renderHelp` 里的 `helpSection`）/ 本清单。
