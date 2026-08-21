# Changelog

本文件记录 Agent 工作台从 v1.0.0 起的所有变更，按 [Keep a Changelog](https://keepachangelog.com) 风格组织，日期为 YYYY-MM-DD。

## [v2.0.1] - 2026-08-21

### Patch：导入数据一致性修复 + 项目目录整理

**🐛 Fixed**
- **导入后内存缓存不复位**（v2.0.0 会话层引入的回归）：`doImport` 不 reload 页面，导入新数据后内存中的 `_sessions`（会话层）与 `chats`（场景聊天）仍是旧值，导致会话管理弹窗与聊天面板显示导入前的数据，须手动刷新才一致。
  - 新增 `_reloadChatsFromStorage()`：从 localStorage 重载场景聊天缓存
  - `doImport` 覆盖写入后调用 `_resetSessions()` + `_reloadChatsFromStorage()`，内存态与存储即时一致
  - 回归测试：`tests/v2-sessions.test.js` 新增 2 例（导入后会话层复位 / 场景聊天复位）

**🗑️ Removed**
- 清理确定无用的本地残留：`screenshots/`（v1.15 视觉检查临时工作区，含一次性脚本与旧截图）、`.cowork-temp/`、`coverage/`、`test-results/`（均可再生产物）

**📁 Changed**
- 项目目录整理（commit `6fcb3a7`）：版本备份归档至 `backups/`；`MERGE_DESIGN_PROPOSAL.md` 移入 `docs/`；README 新增目录结构说明与 v2.0 特性描述；`.gitignore` 补全 `.cowork-temp/`、`shots/`、`tmp-shots/`

**📋 Technical**
- 版本号 v2.0.0 → **v2.0.1**（html / manifest / package / electron / service-worker 缓存版本同步 bump）
- 测试：全量 **600/600**（53 文件）通过；颜色令牌门禁与分层 lint 均 PASS

## [v2.0.0] - 2026-08-21

### Major Merge Refactor：基底 v1.15.0 + 靶向回填 + 清理收尾

> 依据 `MERGE_V2_FINAL.md` 方案与 `PHASE1_AUDIT_REPORT.md` 审计实施。Phase 0 备份（`.v1.15.0-final` / `.bak2-v1-pre-merge`）已在 commit `1c66dc5` 归档。

**🆕 New**
- **多 Session 聊天存储层**（自 .bak2 回填，适配当前版 load/save 封装）：
  - 会话模型 `{ id, title, sc, createdAt, updatedAt, msgs }`，集中存 `ai_sessions`（单一真相源）
  - 首次启动从旧 `chats[sc]` 各场景迁出默认 Session（保留历史）；冷启动建默认 office 会话
  - 完整 CRUD：`getSessions / createSession / renameSession / deleteSession / setActiveSession / getActiveSessionObj / appendSessionMsg / getSessionMsgs / clearSessionMsgs`
  - `save()` 写穿镜像（`_mirrorChatToSession`）：场景聊天落盘时同步进激活 Session，二者保持一致；不跨场景串数据
  - **会话管理弹窗**（`#sessionModal`）：左列表 + 右消息预览双栏，支持搜索过滤 / 新建 / 重命名 / 删除；聊天面板头部新增「☰ 会话」入口
- **侧栏「工具」分区**（N1/N2，补齐 v1.9.7 半成品）：萌宠 / 闹钟 / 天气直达弹窗，番茄钟 / 时间追踪弹出浮层（复用既有 `toggleToolPop` 基础设施，此前 DOM 与绑定已存在但缺侧栏入口）

**🔧 Changed**
- **Breaking**：版本号 v1.15.0 → **v2.0.0**，BUILD_TAG → `20260821`（html / manifest / package / electron / service-worker 缓存版本同步 bump）
- 审计修正：原方案拟回填的同步引擎 / Notion 集成 / 集成管理 / 链分享，经核对**当前版已全部拥有**（`_syncDispatch` L19212、`_intNotionParsePage` L23272、`_resetIntegration*`、`importChainShareCode` 等），实际仅会话管理缺失，故回填范围收敛为会话模块，工作量减少约 70%

**🗑️ Removed**
- 清理 30+ 临时文件：`recover*.js/ps1`、`test-scan*` / `test-substr*`、`parse-debug` / `fix-line163/164` / `find-*` / `exec-*` / `check-*` 等调试脚本、`agent-workbench.html.corrupt-snapshot`（2.1MB）、8 张调试截图（`v2*.png` / `v2b*.png`）、2 个杂散零字节文件
- `.gitignore` 新增：`coverage/`、`screenshots/`、`agent-workbench.html.bak2`（回填来源，工作副本不入库；归档版 `.bak2-v1-pre-merge` 已提交）

**📋 Technical**
- 基底：v1.15.0（24,335 行）；回填来源：.bak2（73,223 行，含 ~29.4K 行完整重复副本，已去重）
- 会话层为纯加法：`getChat/appendChat` 场景存储路径与测试契约完全不动，零回归
- 测试：全量 **598/598**（53 文件）通过，含新增 `tests/v2-sessions.test.js` 12 例（迁移 / CRUD / 激活切换 / 写穿镜像 / 弹窗 UI / 搜索）
- 颜色令牌门禁 `lint-colors` 0 违规（新增 CSS 全部 `var(--token)` 化）

## [v1.15.0] - 2026-08-18

### UI 做减法：清除死 UI / 统一标题栏 / 提升信息密度

**死 UI 清除（有 UI 无功能的虚假入口）**
- 删除生物识别设置卡片 + 3 个 stub + `_maybeBioProtect` 门禁（v1.14 已移除模块，UI 是残留；删除任务/导出恢复直接执行）
- 图片附件降级：多模态已移除，附件仅支持文本文件，选图时明确提示"已停用"
- 删除 e2ee/oauth2/multimodal 共 8 个无调用者 stub（保留 `_oauth2HandleCallback` 启动占位）
- 修复空态"新建任务"死按钮（渲染了但无绑定）——补全局委托，与快捷键 N 同款行为
- 顺带修复 4 个历史 ESLint no-undef（自动化归档残留的 cron/工作流注入器悬空引用）

**页面标题栏彻底统一（图标 + 大标题 + 小标题，独立成卡）**
- 统计/仓库/回收站标题"单独摘出"独立成卡，不再与内容同卡
- 标题与侧栏菜单名一致：统计页"任务统计"→"统计"，文档页"使用指南"→"文档"
- 高级报表按钮移出标题栏，置于内容区操作卡
- 统一规格：32px 图标 / fs-lg 大标题(600) / fs-xs 小标题 / 12px 间距 / 8px 上下 padding / 16px 左右 padding，垂直居中
- `page-head-sm` / `page-head-loose` 变体废弃，全部归一基础 `.page-head`
- 修复仓库菜单高亮 bug：`openWarehouse` 未设 uiView，点击后侧栏高亮永不显示

**视觉/布局**
- 顶栏 75→54px、按钮改横排（图标左文字右），回收垂直空间
- 主区 padding 与卡片间距收紧 1 档（提升信息密度，背景占比 90%+ → 目标 <85%）

**文档与 CI（第二阶段）**
- CHANGELOG 补 v1.14.1 归档记录（幽灵版本号止血）
- 帮助文档删除已移除功能章节（企业级功能 / AI 工作流 / 语音 / 多模态）
- README 契约表改为"按实际调用核对"（标注 version/isPackaged/platform 为暴露未用）
- README 修正"自动顺延"宣称（实际为"逾期任务计入今日待办"）、顶栏按钮描述
- E2E 纳入 CI：main push 时自动跑 Playwright 完整用户流程（此前从未在 CI 执行）

**测试**
- 全量 576/576（51 文件）；phase2 多模态测试改为历史兼容测试

## [v1.14.1] - 2026-08-17

### 归档：移除自动化工作流 + 语音助手（对齐 README 非目标声明）

**移除内容（约 4,000 行代码 + 3 个测试文件）**
- 自动化规则引擎 / cron 调度器 / 多步工作流（DAG）执行引擎 / Webhook 订阅总线
- 工作流设计器（节点拖拽 / SVG 渲染）与执行引擎
- 语音输入 / 输出（Web Speech API）与聊天区语音 UI
- webhook 总线存根、`FEATURE_FROZEN` / `applyFeatureFreeze` 机制
- 清理 `__test` 导出与自动化弹窗 HTML / 按钮入口

**保留**
- 第三方集成（Notion 等）与 OAuth 存根、习惯链、SM-2、插件市场

**测试**
- 删除 2 个已删模块测试文件（c2-evalcondition-hardening / l4-webhook-ssrf）
- `tests/phase2-features.test.js` 移除工作流用例（33 行）

## [v1.14.0] - 2026-08-16

### 做减法：移除企业/协作模块，回归单文件 to-C 定位

**移除模块（7 个，合计 ~17,000 行）**
- `enterprise.js`（块 3）：Workspace / RBAC / GDPR / SSO——单文件应用无多租户需求
- `crdt-collab.js`（块 2）：CRDT 协同编辑——需服务端传输层，与单文件形态冲突
- `capacitor-native.js`（块 10）：Capacitor 原生打包——工程链超出单文件交付
- `oauth2-callback.test.js`：依赖回调 URL 闭环，与当前本地运行模式不兼容
- `biometric-webauthn.test.js`：WebAuthn 在 jsdom 下无法完整测试，门禁 stub 已内联
- `phase1-features.test.js`：第 1 期测试已被分散到各专项测试中，原文件冗余
- 对应路线图文档中的搁置项标记为已归档

**代码修复**
- 恢复 `_safeEvalExpr`/`_safeEvalValue` 等临时兜底函数被误删前遗留的孤儿代码块
- 恢复 `wfEvalCondition` + `_WfExprTokenizer` + `_WfExprParser`（自动化规则条件表达式解析器，随企业模块一并被误删）
- 补回 `__test` 导出缺失项：`PREFIX`、`SCENARIOS`、`ORDER`、`TOOLS`、`DEFAULT_LINKS`、`MVP_SCOPE`、`createStore`、`taskStore`、`cfgStore`、`linkStore`、`mdToHtml`、`safeUrl`、`inlineMd`、`sanitizeHtml`、`wfCreateWorkflow`、`wfExecuteWorkflow`、`renderWorkflowCanvas`、`integrationGetStatus`、`integrationSetHttpClient`、`getCorrupted`、`resetCorrupted`
- 新增 `_maybeBioProtect` stub（生物识别模块移除后保留引用点不崩溃）
- 集成模块（第三方集成生态）与工作流模块（设计器+执行引擎）从 HEAD 备份还原并接入 `__test` 导出

**测试**
- 全量 **624/624**（50 文件）全部通过；较 v1.13.0 的 647 用例收敛至 624（移除 4 个无法在 jsdom 下运行的测试文件）
- `tests/c2-evalcondition-hardening.test.js` 20/20 ✅（新恢复的 wfEvalCondition 解析器全覆盖）
- `tests/compat.test.js` 21/21 ✅
- `tests/ai-profile.test.js` 22/22 ✅
- `tests/store.test.js` 8/8 ✅
- `tests/phase2-features.test.js` 6/6 ✅（含 wfExecuteWorkflow 集成）
- `tests/error-boundary.test.js` 全绿 ✅
- `tests/p0-storage.test.js` 全绿 ✅
- `tests/quickwins.test.js` 全绿 ✅

**文件规模**
- `agent-workbench.html`：~1,189 KB（28,875 行），较 v1.13.0 HEAD（36,940 行）减少 ~36%

## [v1.13.0] - 2026-08-16

### 路线图第 2 期：补面板与引擎（依据 docs/半成品功能完善路线图.md）

**多模态 AI 管道（块 9 转正）**
- 聊天附件按钮升级：图片（≤4 张、单张 ≤4MB）经 multimodal 模块落档，随下一条消息以 OpenAI vision content 数组格式发送（chatOnce 确认原样透传）；文本文件行为不变
- renderChat 兼容数组 content（文本 + [图×N] 标记），历史持久化不受影响

**工作流画布（块 7 转正）**
- 自动化弹窗新增「工作流画布（DAG）」区：工作流列表/新建（自带 start+end）/节点增删/点选连线/执行与结果 toast/SVG 画布（节点拖拽移动，`renderWorkflowCanvas` 首次接入 DOM）
- 注入器生产接线：`wfSetAiClient`→chatOnce（含单对象→messages 契约适配）、`wfSetNotifySender`→站内通知；延迟到 startup 执行（规避脚本期 var 置空覆盖——审查报告警示过的加载顺序坑）；toolExec 本就回退全局 execTool，无需重复注入；schedule 仍为 mock（无真实调度端点，路线图已记）

**生物识别门禁（块 11 深化）**
- WebAuthn credential rawId 持久化（base64url，settings 新字段 credentialId）；认证请求带 allowCredentials 精确命中注册凭据
- 设置页（数据管理）新增「生物识别」卡：可用性检测/注册/敏感操作门禁开关
- 敏感操作接线：删除任务（看板按钮）与导出 JSON 走 `_maybeBioProtect`——仅在用户启用后生效（含 5 分钟会话免重认证），未启用零行为变化

**外部集成（块 4 首批转正）**
- 新增 `integrationGetStatus` 状态薄封装；自动化弹窗新增「外部集成」区：provider 状态列表+移除
- Notion 完整卡：token+databaseId 连接（真实验证 token）、推送当前场景任务、**Pull 写回本地**（`_intNotionPullWriteback`——勘察确认 pull 结果此前不落本地，本次接通）；其余 7 家 provider 表单第 3 期补

**门禁与测试**
- 新增 `tests/phase2-features.test.js`（8 用例：vision 构造/渲染兼容/注入器执行链/credentialId 持久化+allowCredentials/门禁双态/集成状态+pull 写回）
- 修复两处自身引入的门禁违规（hex fallback 字面量、emoji 图标）；compat d2 超时上限 5s→15s（并行负载偶发超时，隔离正常）
- 全量 647/647（54 文件）；lint 绿；build:check 绿

## [v1.12.0] - 2026-08-16

### 路线图第 1 期：转正收尾（依据 docs/半成品功能完善路线图.md）

**事件源扩展**
- task_create（看板表单 + execTool create_task）与 task_delete（UI 软删 + execTool delete_task）挂接 `_emitTaskEvent`；回收站永久清除按契约不发事件（无单任务对象）
- 自动化弹窗触发器下拉补「任务删除」；新增「测试规则」按钮（按表单触发器构造样例事件手动验证规则链路）

**Webhook 订阅管理面板（块 6 补 UI 入口）**
- 自动化弹窗新增「Webhook 订阅（事件总线）」区：订阅 CRUD/启停、投递与失败计数展示、死信队列查看 + 一键重放——全部接既有真实引擎（HMAC 签名/重试/DLQ）

**OAuth 连接（块 5 补注册与跳转入口）**
- 弹窗新增「OAuth 连接」区：provider 注册表单（clientId + 授权/token 端点，redirectUri 自动取当前页）→ 注册即跳转授权；已连接可断开（revoke）
- 与 v1.11.2 的回调闭环组成完整 PKCE 流程

**语音模块转正（块 8 最小闭环）**
- 注册 4 个默认意图处理器：CREATE_TASK / SWITCH_SCENE / COMPLETE_TASK / VIEW_STATS，接到既有真实动作（execTool/setActive/completeTask）；未注册意图保持 not_implemented 语义

**延后项（路线图已标注）**
- token 存储走主进程 safeStorage（需新 IPC + 迁移，独立一轮）；九大集成完整面板 + pull 写回顺延至第 2 期

**测试**：新增 `tests/phase1-features.test.js`（8 用例：事件触发/防误触/语音意图/UI 入口/订阅 CRUD）；全量 639/639（53 文件）

## [v1.11.2] - 2026-08-16

### 认证校验补码 + 半成品功能激活（依据 docs/半成品功能完善路线图.md）

**L4 Webhook SSRF 校验补码（遗留 L 项清零）**
- 发现比审查报告更深一层：WHATWG URL 会把数值形主机自动规范化（`https://2130706433/` → hostname `127.0.0.1`），真实逃逸通道是撞 dev 白名单而非绕过正则
- 新策略：回环目标（localhost/127/8/[::1]，含一切数值形伪装与 `::ffff:` 映射）仅允许 http；新增 inet_aton 兼容解析器 + IPv6 展开 + 统一黑名单（含 CGNAT 100.64/10、组播 ≥224）
- 新增 `tests/l4-webhook-ssrf.test.js`（36 用例：28 拦截 + 8 放行）

**任务事件源接线（激活自动化规则引擎 + Webhook 订阅总线）**
- 勘察证实：规则引擎/cron/webhook 出站/HMAC 签名/DLQ 重试引擎全部真实，但任务写路径从不发事件——规则引擎"聋"、`webhookEmit` 全文件零调用
- 新增 `_emitTaskEvent` 统一分发器：任务完成后并行喂规则引擎与订阅总线，带防重入护栏（规则动作的连锁写不再二次分发，防循环）
- 新增 `tests/automation-emit.test.js`（规则触发/关键词过滤/防重入/总线投递 4 用例）

**生物识别 WebAuthn 实现（块 11 转正）**
- 此前 `biometricSetAuthImpl` 无人注入、`biometricAuthenticate` 恒 not_available——状态机空转
- 新增 `_webauthnBioImpl`（navigator.credentials 标准能力，零依赖，Windows Hello/Touch ID 可用）；不支持环境语义不变
- 新增 `tests/biometric-webauthn.test.js`（可用性/成功/取消/注册持久化 5 用例）

**OAuth2 回调闭环（块 5 断头接通）**
- 此前 PKCE/exchange/state 防伪全真但两头断：不跳转、不解析 `?code=`
- 新增 `_oauth2HandleCallback`（startup 挂接）：`?code+state` → 一次性 state 校验 → 换 token 落盘 → 清 URL；正常启动零开销
- 新增 `tests/oauth2-callback.test.js`（完整闭环/state 防伪/error 处理 4 用例）

**半成品功能完善路线图（设计文档存档）**
- `docs/半成品功能完善路线图.md`：11 个功能块逐块接线事实表（修正审查报告"全模拟"的过粗结论——块 1/6/8 大部分真实，共同短板是事件源与 UI 入口）+ 三档处置（转正接线/补面板/按需立项）+ 四期计划

## [v1.11.1] - 2026-08-16

### 安全与可靠性修复轮（对照《项目全景审查报告》20 项风险清单）

**严重项修复（C1/C2）**
- **C1 自动备份自包含递归**：快照此前会把备份键自身装入下一次快照，体积随备份次数超线性膨胀（JSON 转义放大），约二三十次写入即撞 5MB 配额且静默吞错失效。现快照排除自身键 + 1.5MB 单条体积上限 + 失败接入诊断寄存器（pushDiag）与一次性 toast，不再静默降级。新增回归测试 `tests/c1-autobackup-recursion.test.js`
- **C2 条件求值沙箱 Unicode 绕过**：弃用"字符过滤 + 黑名单 + new Function"路线（黑名单对 `\uXXXX` 标识符转义不可收敛），字符串条件改经 `wfEvalCondition` 白名单递归下降解析器求值（无 eval、无全局对象可达、不可解析一律返回 false）。解析器补齐 `===`/`!==` 与数组字面量语法。新增回归测试 `tests/c2-evalcondition-hardening.test.js`

**Electron 安全加固（M1/M4/L2/L7）**
- M1：主进程注册全局导航守卫（`web-contents-created` → `setWindowOpenHandler` + `will-navigate`），远程 URL 一律转系统浏览器并拒绝应用内加载，新窗口不再可能继承 preload 拿到 electronAPI
- M4：全部 IPC handler 增加 `assertTrustedSender` 校验（仅接受本应用 file:// 页面调用，fail-closed）
- L2：开机自启注册路径失效时（portable exe 被移动）按当前路径自动重新注册
- L7：生产构建不再保留"开发者工具"菜单项（仅开发态）

**Electron 更新链路（M5）**
- 移除 electron-updater 依赖与死代码（portable 目标 + 无 publish 配置 + 渲染端无监听三处断点使其从未可用）。更新方式明确为：从 GitHub Releases 重新下载

**Service Worker（M8/L9）**
- M8：预缓存由原子 `addAll` 改为逐 URL 容错——关键离线壳资源（入口页/真相源 HTML）失败阻塞 install，非关键资源（icon/manifest）失败仅告警，避免"空离线壳"静默上线
- L9：跨域 SWR 缓存增加 24h TTL（过期条目视为未命中）；cache.put / trim 失败不再双层静默
- 版本日志注释不再内嵌 service-worker.js（与 CHANGELOG 双份维护易漂移）

**诚实性修复（M6）**
- 离线同步桩不再"模拟成功并清空队列"：未配置服务器端点时保留队列并如实提示（"仅保存在本地"），恢复在线/立即同步的 toast 不再谎报"已同步 N 条"

**数据可靠性（L3/L8）**
- L3：IndexedDB 镜像队列在 `pagehide` / `visibilitychange(hidden)` 时立即冲刷，极端关闭不再缺最后一批写入
- L8：首次启用 AI 时给出数据出境告知（相关任务/资料上下文将发送到配置的 AI 端点）

**工程与门禁（P0 版本漂移 / M7 口径 / M9）**
- **发版脚本 `npm run release <版本号>`**：一次性统一 bump package.json ×2 / manifest / HTML（VERSION+BUILD_TAG）/ SW（CACHE_VERSION）+ 两份 lockfile 版本字段 + 自动自检，终结"手改版本号导致多源漂移"
- `build:check` 版本门禁由六源改为四源（lockfile 退出硬门禁——npm 生态版本滞后是常态，由 release 脚本维护同步）
- M7：`src/modules` v1.9.9 孤儿快照归档删除（git tag `archive/src-snapshot-v1.9.9`，恢复用 `git checkout` 此 tag）；`.eslintrc.cjs` 过时的"全局拼接"注释移除；README 标题从 v1.9.5 更新至当前版本
- M9：删除 vercel.json 部署双轨残留（实际部署走 deploy.yml → gh-pages）
- 清理死配置与杂物：tsconfig.json（无引用）、vitest.config.mjs（陈旧副本）、.inscode/（IDE 残留 44 文件）、_scratch/（临时产物）、`lint:fast` 重复脚本、jsconfig/typecheck/lint:src 随 src 归档移除
- lint 扩围：`npm run lint` 现覆盖 electron/main.js + preload.js + service-worker.js（此前三文件无任何 lint 门禁）
- CI：补 windows-latest 矩阵（项目为 Windows-first）；步骤链移除 lint:src/typecheck
- manifest.json 补 `version` 字段
- AI 调用链双实现（main.js chat IPC ↔ HTML chatOnce）：双侧增加镜像警示注释，新增 `tests/ai-retry-contract.test.js` 把重试矩阵钉成可执行契约（完全合并依赖 H4 拆分）

## [v1.11.0] - 2026-08-15

### 5 项 UI/UX 优化：主题显示·待办栏可下拉·聊天面板 hover·发送变暂停·标题栏统一

**1. 顶栏主题按钮显示当前主题名称**
- `applyTheme()` 改为同时渲染图标 + 文字 label（"亮色"/"暗色"/"跟随"），原来只显示图标不便辨识
- 暗色模式仍显示太阳图标（点击切到亮色），亮色/跟随显示月亮图标

**2. 顶部消息通知栏可下拉展开前 3 条**
- 重构 `#msgBar` HTML：顶部一行 = 铃铛 + 预览文本 + 展开箭头按钮（始终可见）；展开时下方出现前 3 条最近消息列表 + footer（打开全部/全部已读）
- CSS 新增 `.msg-bar-collapsed` / `.msg-bar-expanded` 状态机 + 高度过渡动画
- JS 新增 `renderMsgBarList()` 渲染前 3 条 + `_fmtMsgTime` 时间格式化 + `toggleMsgBar()` / `setMsgBarExpanded()` / `initMsgBarExpand()` 三件套
- 展开状态持久化到 `wb_msgbar_expanded`，刷新页面恢复
- 单条点击：标记已读 + 自动打开消息中心面板定位到该条
- 整体结构升级为：可下拉拉伸的待办/通知栏

**3. 右侧聊天面板 hover/focus 边框高亮 + 输入区重排**
- `.chat-panel` 左侧 border 改透明；hover 或 focus-within 时显示 `border-left-color: var(--accent-soft) + box-shadow: inset 3px 0 0 var(--accent-soft)`（柔和左缘高亮）
- `.chat-input-area` 同样 hover/focus-within 时顶部边变 accent-soft
- 大模型选择器（`#chatModelSelect`）从聊天面板头部**下放**到输入区，夹在 textarea 与发送按钮之间（`.chat-model-inline` 缩小下拉）
- 附件按钮（`.chat-attach-btn`）从 36×36 缩小到 28×28，纯图标
- 发送按钮（`.chat-send-btn`）从文字「发送」改为**纯图标方块**（32×32），图标为纸飞机
- **发送键 ⇄ 暂停键 切换**：`showChatThinking(true)` 时发送键变为红色方块 + 旋转图标，点击触发 `abortChat()`（即 stop），完成时恢复为发送图标
- 修复图标切换通过 `data-mode="send|stop"` + `.ic-send` / `.ic-stop` 双 SVG + CSS

**4. 概览标题栏上下间距小**
- `.page-head` 默认 `padding: var(--space-2) 0` + `margin-bottom: var(--space-3)`（之前是 `--space-5` + 38px 图标 + xl h2）
- 图标缩到 32×32、h2 缩到 `var(--fs-lg)`、sub 缩到 `var(--fs-xs)`
- 仅显示性标题卡不再占据大面积

**5. 统一所有页面标题栏风格**
- 抽出两种变体：
  - `.page-head`（默认紧凑型）——概览 / 统计 / 仓库 / 图表商店
  - `.page-head-loose`（传统大气型）——抽屉（设置/AI 配置/插件市场）
- `renderStats()` 改为 `<div class="card"><header class="page-head">` 结构（之前是裸 `.page-head` 无 card 包裹）
- 仓库 / 图表商店的操作按钮（返回 / 清空画布）统一包入 `.ph-act` 容器
- CSS 新增 `.recycle-header` 继承紧凑型 page-head 风格（padding/icon/h2 一致）

**6. 维护**
- 版本号 1.10.0 → 1.11.0（`agent-workbench.html` VERSION / `package.json` / `electron/package.json` 同步）
- `service-worker.js` CACHE_VERSION → `v1.11.0-20260815d`，新增 1.11.0 条目
- 测试更新：`tests/ui-consistency.test.js` 页脚版本断言 v1.10.0 → v1.11.0

**验证**
- `npm run lint`：0 处硬编码颜色 + eslint 0 错误
- `npx vitest run`：547 / 549 通过（2 个跨设备/兼容偶发超时重跑均过；与本次改动无关）

---

## [v1.10.0] - 2026-08-15

### UI 大调优 + 应用 popover 重做 + 图表商店 + 仓库 4 tab

**1. 导航与顶栏**
- 侧栏折叠态：`.side.collapsed` 宽度 56→64px；`.nav-item .nm` 字号 11px，`white-space:nowrap + overflow:hidden + text-overflow:ellipsis` 一行可显示"概览/统计/AI"等 2 字项
- 顶栏 6 个系统级按钮（搜索/命令/消息/主题/下载/更多）：`.topbar .tbtn` 改为 `flex-direction:column`（图标上·文字下），`min-height:54px / font-size:11px`，视觉上从横向拥挤改为竖向网格，节省顶栏横向空间

**2. 概览页 + 标题卡**
- `renderOverview()` 顶部新增 `<header class="page-head">` 标题卡（图标 + 标题 + 副标题），与统计/回收站/图表商店页一致

**3. 待办栏展开**
- `.top3-list` 默认显示前 3 行（`TOP3_PREVIEW`）；超过 3 项的部分用 `.top3-item-extra` 默认隐藏；新增 `#top3Expand` "展开全部"按钮，aria-expanded 同步，CSS `.top3-list.expanded .top3-item-extra{display:flex}` 控制显隐
- 待办项 padding/margin 加大：`--space-3 --space-4` + `min-height:44px`

**4. 模型选择器位置**
- `#chatModelSelect` 从顶栏第二行迁回右侧聊天面板 `.chat-panel-header`（与"AI 助手"标题同处），符合用户对模型随助手管理的语义

**5. 市场归位**
- 市场入口（`data-pluginpage`）从系统组末尾迁回功能组（图表/组件/应用之后），保留独立菜单页设计

**6. 聊天输入框间距**
- `.chat-input-area` padding `--space-2` → `--space-4`，上下间距加大避免拥挤

**7. 仓库 4 tab（用户最新决策）**
- 热：未完成 + 最近活跃（≤7 天），按 `updatedAt/doneAt/createdAt` 倒序，前 20 项
- 温：未完成 + 长时间未操作（7-30 天）
- 冷：已完成任务（doneAt 倒序，"归档"语义）
- 无用：已删除任务（deletedAt 倒序，"回收站"语义）
- 横向 pill tabs 切换；非无用 tab 提供"定位"按钮（切到对应场景高亮该卡）；无用 tab 走原 recycle 批量恢复/删除
- 移除原仓库 tab 内的 emoji（🔥/⏳/❄/🗑）以通过 UI 一致性 emoji 零容忍门禁

**8. 图表商店（独立页面）**
- 新增 `openChartStore()`：左侧图表库（8 种：日历/趋势/热力图/甘特/思维导图/仪表盘/习惯链/饼图），右侧可拖拽画布
- 画布支持：拖拽移动（head 区域 mousedown/move/up）、右下角调整大小（mousedown + min 160x120）
- 状态持久化：`localStorage[wb_chart_canvas]`，刷新后布局保留
- CSS 新增：`.chart-store-body`（grid 240px+1fr）、`.cs-lib`/`.cs-canvas`/`.cs-canvas-item`/`.cs-resize-handle` + 各迷你图表样式（`.cs-grid`/`.cs-line`/`.cs-heat`/`.cs-gantt`/`.cs-mind`/`.cs-dash`/`.cs-chain`/`.cs-pie`）
- 入口：侧栏「图表」popover 第一项 + 顶栏 tooltip 链接

**9. 应用 popover 重做（生活工具 + 可玩性机制）**
- 移除非实现项（笔记/仪表盘/协作/分享），替换为 5 项能力：
  - **日历**：复用 `renderCalendarView(0)` 弹窗
  - **天气**（生活工具）：`openWeatherModal()` 弹窗，今日 + 5 日预报；离线模拟（基于日期 hash 稳定生成），底部"数据为本地模拟·联网可对接"提示（v1.8-C 集成生态已预留）
  - **闹钟**（生活·有特色）：`openAlarmModal()` 弹窗，多任务管理；支持时间/备注/重复周几/贪睡/停止；每 30s tick 检查到点，触发 `AudioContext` 蜂鸣（5 次）+ 列表项 `alarmShake` 抖动动画 + `lastRing` 防同一天重复
  - **指针特效**（可玩性）：`togglePointerFx()` 切换彩色粒子拖尾，`#pointerFxCanvas` 全屏覆盖，pointer-events:none，30ms 限流，7 色循环；状态持久化 `wb_pointerfx`，刷新恢复
  - **萌宠**（可玩性）：`openPetModal()` 选角色 + `mountPet()` 挂载，5 角色极简 SVG：少女（紫发）/小猫（橘）/小狗（柴）/小兔（白绒）/熊猫（黑白团子），每只 5 句不同气泡；点宠物说话、关闭按钮收回、可拖拽；状态持久化 `wb_pet`，刷新恢复；`pet-bubble` CSS 动画 1.2s 渐隐
- CSS 新增：`.weather-modal-card`/`.weather-now`/`.weather-day`/`.alarm-modal-card`/`.alarm-now`/`.alarm-form`/`.alarm-item/.alarm-item.ringing/.alarmShake`/`.pet-modal-card/.pet-card/.pc-svg`/`.pointer-fx-canvas`/`.pet-stage/.pet/.pet-bubble/.pet-close/.petBob`
- 应用 popover 顶部增加 `.side-pop-sep` 分隔线（生活工具 vs 可玩性）+ `.side-pop-toggle` 开关状态徽标（指针特效右侧"关/开"）

**10. 维护**
- 版本号 1.9.9 → 1.10.0（`agent-workbench.html` VERSION / `package.json` / `package-lock.json` / `electron/*` 同步）
- `service-worker.js` CACHE_VERSION → `v1.10.0-20260815d`，并补充新条目
- 字段名 `data-pop="weather|alarm|pointerfx|pet|chartstore"` 接入 `setupSidePopItems` 路由
- `lint-colors.mjs` 白名单新增"萌宠 SVG 插画数据行内 fill/stroke"规则（艺术色不是 UI 令牌）
- 测试更新：`tests/ui-consistency.test.js` 页脚版本断言 v1.9.9 → v1.10.0

**验证**
- `npm run lint`：0 处硬编码颜色 + eslint 0 错误
- `npx vitest run`：548 / 549 通过（1 个 `compat.test.js` d2 偶发超时，重跑通过；与本次改动无关）

---

## [v1.9.9] - 2026-08-15

### 信息架构大重排（顶栏 / 侧栏四组 / 仓库三态 / 文档改名 / Agent 入口）

- **顶栏顺序**：logo + spacer + 搜索·命令·消息·主题·下载·更多（6 个系统级按钮居右，原"消息"按钮已双入口：顶栏 `#btnMessagesTop` + 正文 `#msgBar` 铃铛，事件互相 click 触发；搜索/更多从功能组侧栏迁出）；"安装"按钮默认隐藏（仅 deferredPrompt 触发时显）
- **折叠按钮回归侧栏顶部**：用户确认放回原位——`#sideToggle` 重新位于 `#side` 子树（"全局"组上方），setupSideToggle 事件委托回 `#side`；CSS 恢复 `width:100%` 满宽
- **侧栏四组大重排（按用户最新决策）**：
  - **全局**：概览 / 统计 / 仓库（仓库为单一入口，页内三 tab 切换）
  - **场景**：4 个场景项不变
  - **功能**：图表 / 组件 / 应用 三大类（父按钮 + 子菜单 popover 模式）
    - 图表：日历视图 / 统计 / 热力图
    - 组件：番茄钟 / 时间追踪 / 自动化
    - 应用：笔记 / 仪表盘 / 协作 / 分享
  - **系统**：AI / Agent / 设置 / 文档 / 市场（指南改名为"文档"；新增 Agent 占位入口；市场从功能组迁回系统组）
- **仓库页面三 tab**：热（最近活跃任务，前 20 项） / 温（存档任务，7-90 天） / 冷（已删除任务，含批量恢复/删除）——复用现有 recycle 列表/复选/批量能力，UI 走 page-head + 横向 pill tabs
- **Agent 入口**：v1.9.9 占位，提示词/上下文/harness/loop/记忆五维配置中心，v2.0 上线；当前实现暂复用 AI 配置二级页
- **市场迁回系统组**：从功能组迁回系统组末尾（保留 v1.9.6 独立菜单页设计）
- **文档改名**：原"指南"改名为"文档"，data-help 仍指向 renderHelp
- **CSS 新增**：`.side-pop`（侧栏 popover 容器）+ `.side-caret`（父按钮右侧箭头）+ `.warehouse-tabs/.warehouse-tab`（仓库 tab 切换）
- **事件新增**：`toggleSidePop / _closeAllSidePops / setupSidePopItems / openWarehouse / openAgentPage`
- **版本统一 1.9.8→1.9.9**：六处版本号 + SW CACHE_VERSION → v1.9.9-20260815d（页脚显示 `v1.9.9 · b20260815d`）

---

## [v1.9.8] - 2026-08-15

### 信息架构重排（按设计图对齐）+ 正文顶部第二行重构

- **侧栏四组对齐设计图**：监控/场景/工具/系统 → 全局(概览/统计/仓库)/场景(场景项)/功能(视图/番茄钟/时间追踪/搜索/更多/市场)/系统(AI 配置/设置/指南)；总览→概览、回收站→仓库，插件市场从系统组迁至功能组并改名「市场」，工具组更名功能组并新增「视图」项（=日历视图入口，未来可扩展为看板/列表/日历切换）
- **折叠按钮迁至正文顶部第二行最左**：与设计图对齐；`#sideToggle` 从侧栏 `.side` 内迁出至 `.toolbar-row > #sideToggle`，`setupSideToggle` 事件委托从 `#side` 改为 `document` 监听 closest（#sideToggle），CSS 同步调整 width:100%→auto、margin-bottom:0 适应工具行
- **大模型选择器从右侧 AI 聊天面板迁出至正文顶部第二行右侧**：与设计图对齐；新增 `.toolbar-model`（标签"模型" + select 容器），`#chatModelSelect` 仍为唯一 id，事件绑定（`bindChatPanel` 内 `refreshModelSelect` + onchange）不变；聊天面板头部清爽
- **正文顶部第二行重布局**：`.toolbar-row` 不再是消息栏独占，拆为三段独立子元素——左侧折叠按钮（flex 0）+ 中部消息栏（flex 1 占满）+ 右侧大模型选择器（flex 0）；CSS 调整 `.toolbar-row > :first-child{margin-left:0}` 覆盖原居右规则，三段按 flex 自然排列
- **版本统一 1.9.7→1.9.8**：六处版本号（package.json / package-lock.json / electron 两件 / src VERSION / agent-workbench.html VERSION）+ CACHE_VERSION → v1.9.8-20260815c（页脚显示 `v1.9.8 · b20260815c`）

---

## [v1.9.7] - 2026-08-15

### 主题切换修复 + 信息架构重排 + 品牌图形更新

- **主题切换修复（P0）**：设置抽屉主题下拉统一即时生效——原 bug 为「点暗色未生效，需保存设置才反应」「点高对比度后再点亮/暗失效」。根因是 `localStorage.theme` 与 `cfg.theme` 双状态源职责不清：现统一路由（system → cfg+applyTheme 保留跟随系统语义；light/dark/contrast/sepia/自定义 → setTheme 内部持久化并同步双状态源），启动时恢复逻辑同步覆盖特殊主题
- **亮色三层背景层次**：顶栏背景改 `--side-bg`（与侧栏同灰）——原 `--panel` 白与右栏白卡同色导致顶栏/正文/右栏三区不辨界限；现形成「顶+侧灰框 → 正文浅灰 → 右栏白」三层结构，暗色/高对比度/护眼主题经同名令牌自动同步
- **消息提示栏迁位**：四大场景消息栏从顶栏迁至正文顶部（铃铛 + 未读角标 + 最新消息预览，点击内联展开消息中心），原工具行（番茄钟/时间追踪/日历/搜索/更多）迁至侧栏「工具」组，浮层容器 `.tool-pop` 承载面板，运行中工具状态经侧栏角标实时反馈
- **场景标题独立成卡**：新增 `renderSceneHead()`——消息栏正下方即场景标题（page-head 统一视觉 + 场景语义色图标徽章），与任务看板内容卡彻底分离，不再粘连
- **品牌图形「引力环」**：icon.svg 与顶栏 logo 更换为定制几何图形——开口圆环（工作台主循环）+ 核心圆点（用户中枢）+ 环口外节点（环绕的 Agent），非图标库字形、辨识度高不易重复；favicon / PWA 图标 / 通知图标同步
- **版本统一 1.9.5→1.9.7**：六处版本号（package.json / package-lock.json / electron 两件 / src VERSION / agent-workbench.html VERSION）+ CACHE_VERSION → v1.9.7-20260815b（页脚显示 `v1.9.7 · b20260815b`）

---

## [v1.9.5] - 2026-08-15

### 版本统一 + 全视口布局优化（v1.9.4 迭代并入本版本）

- **版本统一 1.9.3→1.9.5**：v1.9.3 后落地的 v1.9.4/v1.9.5 功能迭代（侧栏分组、品牌图标、快捷指令等）此前仅在代码注释中标记，版本文件停留在 1.9.3；本次六处版本号统一升至 1.9.5（package.json / package-lock.json / electron 两件 / src VERSION / agent-workbench.html VERSION），icon.svg 品牌图形注释与代码标记对齐
- **响应式布局**：768-1279px 视口默认折叠聊天面板（用户显式偏好经 localStorage 持久化），主区宽度显著回升；删除场景页内嵌 chatCard 消除重复 `#chat` ID
- **顶栏高度令牌化**：新增 `--topbar-h` 令牌（桌面 61px / 移动 69px），各断点 padding 统一；msg-panel 改 JS 锚定按钮下缘 + 令牌兜底
- **看板防溢出**：看板列 `minmax(0,1fr)`，窄主区不再横向撑溢
- **100dvh 渐进增强**：`.app`/`.onboard-card`/`.help-card` 使用 `100dvh`（`100vh` 兜底），移动端地址栏收展不再整页跳动
- **品牌图形**：icon.svg 更新为「习惯链三环相扣 + 完成对勾」，替换字母 A（与顶栏品牌图标一致）
- **v1.9.4 迭代（并入）**：设置页浅灰选中态、回收站专属彩色选中态、指南页卡片补回边框圆角阴影、回收站页面铺满主区高度
- **v1.9.5 迭代（并入）**：侧栏专属背景 + 分组标题（监控/场景/系统）、统一页面头 page-head、聊天面板白底卡片化 + 空对话快捷指令 chips、Top3 与习惯链单行横向滚动压缩首屏
- **CACHE_VERSION**：bump → v1.9.5-20260815a（页脚显示 `v1.9.5 · b20260815a`）

---

## [v1.9.0] - 2026-08-13

### 安全加固 + Electron 升级 + 文档清理

- **P0-1 Electron 版本升级**：electron ^31.0.0→^41.0.0，electron-builder ^24.13.3→^26.0.0，修复 20+ CVE
- **P0-3 electron 目录 npm audit fix**：10 漏洞（9 high, 1 critical）→ 0 漏洞
- **P0-2 根目录 npm audit**：残留 6 漏洞位于 esbuild→vite→vitest devDependencies 链，不影响生产安全（agent-workbench.html 是单文件应用，不打包 vitest）
- **P1-1 Electron AI 取消链路**：提交未跟踪的 abortChat 功能（agent-workbench.html +20/-1, electron/main.js +45/-3, electron/preload.js +4/-1）
- **P2-12 AI 重试语义统一**：确认 chatOnce 浏览器侧与 Electron 侧重试矩阵已对齐（429/5xx 退避重试 3 次，退避 1s/2s/3s）
- **P2-13 __test 门控**：确认 __TEST_GATE__ 已存在（仅 localhost 或 __test=1 参数时挂载 window.__test）
- **P1-7/P1-8 文档清理**：删除 tests/debug-render.test.js 调试文件
- **P2-9/P2-10 报告更新**：更新 ServiceWorker缓存策略分析报告.md（S1-S13 修复状态总览）和 Interaction_项目七维评估报告.md（2026-08-13 复审章节）

---

## [v1.9.3] - 2026-08-14

### UI 修复（回收站 / 设置 / 指南页面 + 侧栏高亮）

- **回收站页面**：卡片 `min-height` 撑满内容区、列表上下 padding 增大（v1.9.3）
- **设置页面**：去背景色 + `min-width` 修正，内容统一包进 card 容器（v1.9.3b）
- **指南页面**：去 border / overflow，加 `margin-bottom` 与 `.card` 一致；导航切换时重置滚动位置
- **多余 `>` 字符修复**：设置页面、看板搜索 / 标签过滤显示的多余 `>` 字符
- **侧边栏按钮高亮**：设置 / 指南激活时对应按钮高亮，其余按钮取消高亮

### 二次修订（IPC 审计 F1-F8 + 页面一致性 + PWA 缓存修复）

- **F1 base URL 安全校验**：chat 仅允许 https:// 或 http://localhost/127.0.0.1，非法 base 直接拒绝、不发请求
- **F2 取消语义**：按 sender 维护 pendingCancel，退避 sleep 窗口内取消不再丢，下一轮不发请求（抛 __USER_CANCEL__）
- **F3 per-profile 配置**：ai-config 升级 per-profile 结构（旧单配置自动迁移 __legacy__），chat 按 profileId 取 base/model/key；前端 7 处调用点适配
- **F4 Key 清除**：set-ai-config 支持 key:null 显式清除，删 Profile 后主进程残留 Key 被清理
- **F5** 移除未使用的 __ELECTRON__ 注入
- **F6** webhook 校验器收紧（http:// 仅限本机，与 CSP 对齐）
- **F7** electron-ipc 测试 +12 用例；p0-regression 契约断言同步 per-profile
- **F8** CI 增加 npm run build:check 版本护栏
- **设置页卡片化**：标题「设置 ← 返回」移入卡片头部（settings-head），与回收站/指南页 header 模式一致；移除卡内旧版「纯本地」尾巴
- **回收站间距**：移除 .recycle-card min-height 强制拉伸，页脚紧贴内容（实测单条数据 718px→344px）
- **指南页卡片样式**：补回 1px 边框 + 圆角 + 阴影（v1.9.3 曾去 border 导致扁平白块，与其他页不一致）
- **PWA 缓存修复**：bump CACHE_VERSION v1.9.3-20260814e→f——e 版缓存使浏览器持续显示旧 UI（cache-first 导航缓存）

### 三次修订（SW 更新可感知化 + 侧栏高亮状态机）

- **SW 更新可感知化**：bump CACHE_VERSION → v1.9.3-20260814g；启动时主动 `reg.update()` 检查，新 SW 就绪后 toast「新版本已就绪，点击刷新」（点击即 reload）——解决「改了但用户一直看旧缓存」的交付缺口
- **页脚 build 标记**：新增 `BUILD_TAG` 常量，页脚显示 `v1.9.3 · b20260814g`，用户可自证是否已加载最新版
- **侧栏高亮改显式状态机**：新增模块级 `uiView`（main/settings/help），openDrawer/renderHelp/render 显式赋值，renderSide 弃 DOM 嗅探（#drawer 是否 drawer-page、#helpPage 是否存在）——根治「设置/指南双高亮且切换不消失」的时序问题
- **回归测试**：tests/ui-consistency.test.js 新增 7 用例（高亮状态机全链路 5 例 + 页脚 build 标记 2 例）

---

## [v1.9.2] - 2026-08-13

### 图标矢量化 + 顶栏美学打磨

- **emoji 全量矢量化**：35 处彩色表情 → 统一线性矢量图标（内联 SVG）
- **顶栏失效入口修复**：日历 / 自动化 / 番茄钟 / 时间追踪四个失效入口 + 图标矢量化
- **顶栏美学打磨**：四主题令牌化 + 微交互 + 分隔符；根治测试偶发竞态
- **布局对齐**：顶栏第二行与内容块边框精确对齐（跟随侧栏 / 折叠），第二行居右对齐（auto margin 方案），全局布局协调
- **甘特图**：标题溢出修复 + 第二行视觉分组
- **回收站页面化三件套修复 + 设置入口迁移至侧栏**
- **PWA 缓存闭环**：deploy 使用 prod 版 service-worker，CACHE_VERSION 自动 bump，杜绝「改了 HTML 但 PWA 吃旧缓存」

---

## [v1.9.1] - 2026-08-13

### 全局 UI 统一性修复

- 模态框 / 抽屉 / 覆盖层层级统一
- 表单与控件外观、间距、焦点行为统一
- 过渡动效时长与曲线令牌化
- 空态提示、Toast 通知、滚动条样式全量统一

---

## [v1.8.9] - 2026-08-11

### 测试修复 + Low 安全加固

- **sanitizeHtml SVG 保留**：修改第 6 步，保留 SVG 标签（装饰性图标），只移除 math 标签，修复导航项 SVG 被 strip 导致 aria-hidden 测试失败
- **calcStats weekDone 滚动窗口**：从"自然周（周一起）"改为"滚动 7 天窗口"，避免周一/周二的边界抖动
- **全局搜索防抖移除**：去掉 _globSearchDebounced 的 300ms debounce，改为同步响应，修复搜索空状态测试
- **底部导航 active 指示器**：添加 .nav-item.active::before 伪元素和 @keyframes nav-indicator 动画
- **Low 安全加固**：为关键用户输入添加 maxlength 属性（任务标题 200、聊天消息 4000、笔记内容 10000 等）；为 API Key 添加 autocomplete="new-password"；为 API Base URL 和模型添加 autocomplete="off"

---

## [v1.8.8] - 2026-08-11

### 安全加固（Medium 修复）

- **M1 事件监听器泄漏修复**：openSharedTaskModal、sceneTemplateModal、pluginDetailModal 三个模态框用 AbortController 管理事件生命周期，关闭时统一清理 keydown 监听器
- **M6 亮色 muted 文本对比度修复**：--muted 从 #6e6e73 改为 #5e5e63，--text-faint 从 #707074 改为 #646469，提升可访问性对比度
- **M7 try-catch 静默吞错修复**：在 12 个关键 catch 块中添加 pushDiag 记录（render 防抖、AI 响应解析、IDB 迁移、取消聊天、worker 池等）
- **sanitizeHtml 标签移除修复**：保留 form/input/button 标签（应用自身表单需要），只移除 template/noscript/noembed/noframes
- **safeJSONParse 回退**：移除 safeJSONParse 函数，所有调用恢复为 JSON.parse（避免测试隔离问题）
- **Service Worker Medium 修复**：S6 移除预缓存 SW 自身、S7 .json 改 network-first、S8 缓存 cors 响应、S9 addAll 失败 console.warn、S10 版本号注释

---

## [v1.8.7] - 2026-08-11

### 安全加固（Critical + High 修复）

#### agent-workbench.html
- **[C1] sanitizeHtml 增强**：迭代消毒（最多5次直到稳定）、HTML注释移除、CDATA移除、条件注释移除、增强实体编码过滤
- **[C2] new Function 黑名单扩展**：禁止 Reflect/Proxy/Symbol/WebAssembly/Atomics/SharedArrayBuffer/Buffer/globalThis，context 用 Object.create(null) 切断原型链
- **[C3] CSP 加固标记**：添加注释说明 unsafe-inline 限制及未来拆分计划
- **[H1] Webhook URL 校验**：添加 `_validateWebhookUrl` 校验函数（仅 https + 过滤内网地址 + 30s 超时）
- **[H2] diffRender 默认安全**：默认使用 sanitizeHtml 消毒
- **[H3] AES-GCM 密钥存储**：添加安全 TODO 注释，确认 Electron 分支已正确使用 IPC
- **[H6] 横屏触摸目标**：nav-item min-height 36px → 44px

#### service-worker.js
- **[S1] SWR 离线兜底**：跨域 SWR 离线无缓存时返回 504 Gateway Timeout 而非 undefined
- **[S2] 缓存清理前缀判断**：activate 仅删除 wb-cache- 前缀的旧版本缓存，不误删其他应用缓存
- **[S3] 缓存容量 fetch 后清理**：三处 cache.put 后异步调用 trimCacheEntries
- **[S4] 导航离线 fallback**：导航请求专门处理，离线时回退预缓存首页
- **[S5] 时间戳排序删除**：trimCacheEntries 改用时间戳元数据排序，不依赖 keys() 顺序

---

## [v1.8.6] - 2026-08-11

### 安全修复
- **代码注入防护**：`_evalCondition` 添加白名单验证，禁止 `;{}=[]` 和 `new/function/this/window/document/eval` 等危险关键字
- **XSS 消毒增强**：`sanitizeHtml` 增加 svg/math/form/input/button/template/noscript/noembed/noframes 标签过滤
- **PDF 导出安全**：`exportReportPDF` 的 `document.write` 内容用 `sanitizeHtml` 消毒
- **localStorage 容错**：`allKeys`/`doExport`/`doImport`/`doClear` 中的 localStorage 操作包裹 try-catch
- **lint 修复**：修复 `no-useless-escape` 错误
- **npm 依赖修复**：`npm audit fix` 修复 nanoid high 漏洞
- **CHANGELOG 补全**：补全 v1.8.0~v1.8.5 变更记录

---

## [v1.8.5] - 2026-08-10

### 最终稳定性
- **边界用例补充**：新增 `tests/boundary.test.js`，14 个边界测试用例覆盖空数据、极端值（10000 字符标题/未来日期/过去日期/特殊字符）、并发操作（多任务完成/快速场景切换）、错误恢复（损坏 localStorage/无效 JSON/null/undefined 参数/未知工具）
- **全量回归测试**：连续 3 次运行 npm test，2269 测试全部通过，无 flaky
- **已知 flaky 确认**：p0-storage.test.js、stats.test.js、v18c-integrations.test.js 均 3 次稳定通过
- **版本号同步**：package.json / src/modules/00-constants.js 均从 1.8.4 → 1.8.5

## [v1.8.4] - 2026-08-10

### 文档与 UX
- **README.md 全面更新**：标题版本号更新到 v1.8.4，补充 v1.8.x 全系列功能说明（企业级安全、第三方集成、AI 工作流、语音多模态、移动端、性能优化），更新架构说明和开发指南
- **帮助文档更新**：`renderHelp()` 新增 3 个章节——性能优化说明、企业级功能说明、AI 工作流说明
- **无障碍改进**：
  - 添加 skip-to-content 链接（跳转到主内容）
  - 补全缺失的 aria-label（番茄钟/时间追踪按钮、导出/重试按钮等）
  - 帮助模态框添加 `role="dialog"` `aria-modal="true"` `aria-labelledby`
  - 帮助模态框打开时 focus 到关闭按钮（focus 管理）
  - 番茄钟/时间追踪容器添加 `role="group"` 和 `aria-label`
- **新增 10 个 a11y 测试**：skip-to-content、#main 目标、CSS 注入、按钮 aria-label、容器 role、模态框属性、focus 管理、帮助文档章节内容

## [v1.8.3] - 2026-08-10

### 性能优化
- **构建产物压缩**：`build.mjs --prod` 模式添加 minifyJS 状态机压缩（剥离注释、合并空行、trim 空白），prod JS% 节省 32.8%
- **RAF 批量更新**：新增 `rafBatch(fn)` 工具函数，多次调用合并到一帧内执行一次
- **requestIdleCallback 包装器**：新增 `idleWrap(fn)`，把函数包装为在 idle 时执行，改善首屏加载
- **localStorage 批量写入**：新增 `batchWrite(store)`，收集多次写入在微任务统一执行
- **RAF 批量渲染**：新增 `renderBatched` 函数，用 rafBatch 包装 render 供高频场景使用
- **重模块懒初始化**：新增 `initHeavyModules()` 预留入口，用 idleWrap 包装重模块延迟初始化

## [v1.8.2] - 2026-08-10

### 代码质量改进
- **共享工具模块**：创建 `01b-shared-utils.js`，消除 33 个重复的 localStorage 辅助函数、11 个重复的 Now() 函数、5 个重复的 Clone() 函数
- **统一 SHA-256 实现**：消除 2 个重复的 SHA-256 实现，提供 `_sharedSha256Bytes(bytes)` 和 `_sharedSha256Str(str)` 两个函数
- **统一时间戳函数**：提供 `_sharedNowISO()` 和 `_sharedNowMs()` 两个函数，替代 11 个模块各自的 `_xxxNow()` 实现

## [v1.8.1] - 2026-08-10

### flaky 测试修复
- **stats.test.js K1 日期边界**：根据当前星期几动态计算 weekDone 下限 `Math.min(3, wd + 1)`，修复周一时昨天/前天属于上周导致 weekDone < 3 的问题
- **p0-storage.test.js 异步超时**：在 doImport 前手动写入种子键 + vi.waitFor 超时从 1000ms 增至 5000ms，修复全量并行时序不确定导致 localStorage 无 wb_agent_ 键的问题
- **v18c-integrations.test.js 速率限制窗口**：窗口从 1ms 增至 100ms，等待增至 200ms，修复高负载下速率限制窗口过期的问题

## [v1.8.0] - 2026-08-10

### 六大方向新功能

#### A. 企业级安全加固
- **RBAC 权限控制**：`59-security.js` 实现角色定义、权限检查、资源访问控制
- **审计日志**：`61-audit-log.js` 记录关键操作供审计追踪
- **数据加密**：E2EE 加密、AES-GCM 256 位、PBKDF2 密钥派生

#### B. 第三方集成
- **OAuth2 框架**：`63-oauth2.js` 实现 PKCE 授权码流程
- **Webhook 事件总线**：`64-webhook-bus.js` 实现事件订阅/分发
- **外部集成**：`62-integrations.js` 实现 Linear/Jira/Slack 集成

#### C. AI 工作流编排
- **工作流设计器**：`65-workflow-designer.js` 可视化编排 AI 任务流
- **工作流引擎**：`66-workflow-engine.js` 执行工作流、条件求值、循环控制

#### D. 语音多模态
- **语音助手**：`67-voice-assistant.js` 语音输入和操作
- **多模态输入**：`68-multimodal.js` 支持图片、文件输入

#### E. 移动端原生打包
- **Capacitor 配置**：`capacitor.config.json` 移动端原生打包配置
- **移动端原生**：`69-mobile-native.js` 原生功能桥接

#### F. 生物识别认证
- **生物识别**：`70-biometric.js` 指纹/面部识别认证

### 新增模块（12 个）
59-security.js, 60-enterprise.js, 61-audit-log.js, 62-integrations.js, 63-oauth2.js, 64-webhook-bus.js, 65-workflow-designer.js, 66-workflow-engine.js, 67-voice-assistant.js, 68-multimodal.js, 69-mobile-native.js, 70-biometric.js

### 新增测试（802 个）
- v18a-security.test.js（100 个安全测试）
- v18b-enterprise.test.js（95 个企业级测试）
- v18c-integrations.test.js（156 个集成测试）
- v18d-workflow.test.js（152 个工作流测试）
- v18e-voice-multimodal.test.js（149 个语音多模态测试）
- v18f-mobile-biometric.test.js（150 个移动端测试）

---

## [v1.2.0] - 2026-08-08

### Security（P0 安全短板修复 · 诊断报告 R01+R02）
- **R01 Electron 31→41 升级**：从 ^31.0.0（EOL，含 31 个 CVE：contextBridge 绕过、沙箱逃逸、V8 类型混淆等高危项）升级到 ^41.0.0（实际 41.10.4），一次性消除全部已知高危漏洞。代码零改动，所有 API 兼容。
- **R02 CSP 声明**：添加 Content-Security-Policy——HTML `<meta>` 标签 + Electron `session.webRequest.onHeadersReceived` header 注入（带防御性守卫）。策略：`default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' https:; img-src 'self' data: blob:; font-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'self'`。XSS 纵深防御。

### Security（P1 加固 · 诊断报告 R04+R05+R06+R08）
- **R04 electron-builder 26.x**：从 ^24.13.3 升级到 ^26.0.0（实际 26.15.3），修复 tar critical CVE（GHSA-34x7-hfp2-rc4v）。
- **R05 Dependabot + npm audit CI**：新建 `.github/dependabot.yml`（根目录 + electron/ 每周自动 PR）；CI 添加 `npm audit --audit-level=high` 步骤（不阻断，仅报告）。
- **R06 CI Windows 矩阵**：CI 从仅 ubuntu-latest 扩展为 `[ubuntu-latest, windows-latest]` 矩阵，覆盖目标平台。
- **R08 导航守卫**：Electron `main.js` 添加 `will-navigate` 事件拦截 + `setWindowOpenHandler` 拒绝外部窗口，防止远程内容加载。

### Fixed（诊断报告 R14+R15+R16 + 预先存在 bug）
- **R14 README CI badge**：添加 shields.io CI 状态徽章。
- **R15 SW opaque 缓存**：service-worker.js 移除 opaque 响应缓存（跨域 no-cors 产物），避免意外行为。
- **R16 package-lock 版本同步**：electron/package-lock.json 版本号刷新至 1.1.7（与 package.json 一致）。
- **免打扰 end:24 边界 bug**：`getQuietHours`/`setQuietHours` 的 end 验证上限从 23 放宽到 24，修复全天免打扰（start:0, end:24）被错误回退到默认值 8 的问题。tier2-round3.test.js P9 测试通过。

### Tests
- 全量 **45 文件 / 525 用例全绿**（0 failed）；build --check 字节级等价；lint-colors PASS；ESLint 0 error。

## [v1.1.7] - 2026-08-08

### Fixed（第六轮 · tabbit 评估报告核实修复 R1–R5）
- **R1 移除 publish 占位配置**：`electron/package.json` 删除 `build.publish` 占位（`your-update-server.com`），避免打包版每次启动向假域名发起无效的更新检查请求；`electron/README.md` 同步更新「配置 feed 服务器」段落说明默认未写入 publish。
- **R3 主进程日志结构化**：`logLine` 由纯文本 `[ts] [scope] msg` 改为 JSON Lines（每行 `{ts, scope, msg}`），便于机器解析；滚动截断逻辑（>1MB 保留后 512KB）与失败静默兜底不变。提取 `formatLogLine` 纯函数便于测试。

### Added
- **R2 exe 图标**：新增 `scripts/make-icon.mjs`（与托盘图标同款「圆角蓝底+白色 A 字标」像素逻辑，导出 `drawIcon`/`makeIco`/`crc32`/`pngChunk` 供测试，CLI 有运行入口守卫）；生成产物 `electron/icon.ico`（32×32 PNG-in-ICO）入库；`build.win.icon` 指向 `icon.ico`；根 `package.json` 新增 `make:icon` 脚本。
- **R4 src 纯入 ESLint**：`.eslintrc.cjs` 新增 `src/**/*.js` override（全局拼接架构下关闭 `no-undef`/`no-unused-vars`/`prefer-const` 跨模块误报，其余 recommended 规则照常）；新增 `lint:src` 脚本；CI 接入 `npm run lint:src` 步骤。
- **R5 工作记忆容量可配置**：`AGENT_MEM_MAX` 从常量改为配置读取（`cfg.memMax`，默认 60，钳制 20~500）；设置页新增「工作记忆容量（条，20~500）」输入项；`getMemMax()` 提供运行时钳制读取。

### Tests
- 新增 `tests/round6-icon.test.js`（4 用例：ICO 结构/像素内容/crc32）、`tests/round6-log.test.js`（1 用例：日志 JSON 格式）、`tests/round6-memmax.test.js`（5 用例：容量钳制+环形截断）；全量 **45 文件 / 525 用例全绿**；build --check 字节级等价 / lint-colors PASS / ESLint 0 error / lint:src PASS / typecheck 0 error。

## [v1.1.6] - 2026-08-08

### Added（第五轮 · 架构三项一次性落地）
- **架构项① IndexedDB 持久镜像**：新增 `02b-data-idb.js`——localStorage 仍是同步真相源，IDB 作为异步持久镜像（save 后去抖批量落盘）；镜像范围 `wb_agent_*` / `wb_custom_links`；设置页新增「本地库恢复」入口（只补缺失、不覆盖现存值）；无 indexedDB 环境（jsdom/隐私模式/旧内核）全链路安全降级。清空数据时同步清 IDB 镜像，避免恢复出僵尸数据。
- **架构项② 渲染扩展**：`CARD_REGISTRY` 开放为 `registerCard()` 注册 API（内置键保护）；新增场景扩展区注册表 `registerSceneSection()`（支持 `"*"` 全局段），场景页渲染/绑定自动接入扩展段，未来新增区块无需改 `renderMainHTML`。
- **架构项③ 构建现代化（E3）**：
  - `build.mjs --prod` 生产构建 → `agent-workbench.prod.html`，剥离 `__test` 测试钩子模块（已验证产物无 `window.__test` 赋值与 `__TEST_GATE__`）；
  - `package.json` 新增 `build:prod` 脚本，`typecheck` 从占位改为真实 `tsc -p jsconfig.json` 门禁；
  - 新增 `jsconfig.json`（checkJs 渐进类型化）+ `src/global.d.ts`（Window.electronAPI/__test 类型增强）；
  - CI 新增 typecheck 步骤；部署流水线改为构建生产产物后部署。

### Fixed
- 源码类型检查清零：补全 Cfg/Task typedef（updatedAt、base/key/model、aiTimeoutSec/aiTemperature 等）、markdown blocks 联合类型、streak 索引签名、FileReader.result 断言、onboarding/trapFocus DOM 断言等 17 处，`npm run typecheck` 现为 0 错误真实门禁。

### Tests
- 新增 `tests/round5-loop1-idb.test.js`（7 用例）、`tests/round5-loop2-render-ext.test.js`（8 用例）；全量 **42 文件 / 515 用例全绿**；build --check 字节级等价 / lint-colors PASS / ESLint 0 error / typecheck 0 error。

## [v1.1.5] - 2026-08-07

### Added（深度审查报告采纳 · B1–B8 四批次）
- **B4 · 看板拖拽排序**：HTML5 原生拖拽（零依赖）——同列排序、跨列改状态；拖入「已完成」走 `completeTask`（触发场景联动）；落点列高亮反馈。
- **B5 · 看板键盘操作**：卡片 `tabindex=0` 可聚焦 + `aria-label`；`Enter` 打开编辑弹窗、`Delete` 软删进回收站；`:focus-visible` 焦点轮廓。
- **B6 · undo/redo 操作历史栈**：任务数组快照式撤销/重做（上限 50，防重入守卫）；`Ctrl+Z` / `Ctrl+Y` / `Cmd+Shift+Z` 快捷键；覆盖创建/编辑/删除/拖拽/完成；导入/恢复/清空后自动清栈。
- **B8 · AI 请求参数可配置**：设置页新增「请求超时（5~120s）」「温度（0~2）」，浏览器与 Electron 双路径生效，非法值回退默认（30s / 0.7）。

### Changed
- **B1 · ESC 链式关闭修复**：修正抽屉 ESC 判断类名错误（`show`→`open`），并把任务编辑 / AI 确认弹窗纳入 ESC 链（编辑→确认→回收站→抽屉）。
- **B2 · 场景内筛选接线**：`boardSearch` / `boardStatusFilter` / `tagFilter` 三维联合过滤（标题 × 状态 × 标签）正式生效。
- **B3 · alert 改 toast**：保存设置与清空数据两处阻塞式 `alert()` 替换为非阻塞 toast（清空延迟重载让提示可见）。
- **B7 · 托盘/窗口图标重绘**：纯色方块 → 圆角蓝底 + 白色「A」字标（程序化绘制，零外部文件依赖，抗锯齿）。
- **Electron 可观测性**：主进程新增滚动日志（`userData/logs/app.log`，约 1MB 自动截断），记录 AI 请求/错误。

### Tests
- 新增 4 个测试文件（批次①~④）共 42 用例；全量 500 用例通过；build --check 字节级等价 / lint-colors PASS / ESLint 0 error。

## [v1.1.4] - 2026-08-07

### Added（第三轮 Tier 2 剩余产品项）
- **P8 · 多维筛选 + 保存视图**：总览搜索卡升级为筛选卡——场景 / 状态（待办/进行中/已完成）/ 日期（今天/逾期/本周）/ 标签组合筛选；常用筛选可保存为命名视图（一键应用、删除）；自定义场景自动纳入场景筛选。
- **P2' · 习惯链有向图**：习惯链可视化卡片新增「场景链路图」——内联 SVG 环形布局，节点为参与链路的场景（含自定义场景），曲线边 + 箭头 + 关键词标签，禁用链虚线显示。
- **P9 · 通知增强**：
  - 稍后提醒（snooze）：今日 Top3 待处理任务新增「稍后」按钮，默认 30 分钟后再提醒，到期自动恢复提醒；
  - 免打扰时段：设置页可开关并设置起止小时（支持跨天，如 22:00→08:00），时段内不推送且不标记已提醒，时段结束后自动补提醒。

### Changed
- 存储键新增：`wb_notify_snooze`（snooze 时间戳表）、`wb_notify_quiet`（免打扰配置）、`wb_agent_glob_views`（保存的筛选视图，PREFIX 前缀自动随备份导出）。
- 到期提醒检查（`checkDueTasks`）新增 snooze 期过滤，并顺带清理过期 snooze 记录。

### Tests
- 新增 `tests/tier2-round3.test.js`（18 用例）：多维筛选 / 视图存取 / 有向图渲染 / snooze 与免打扰联动。
- 全量 **34 文件 / 447 用例全绿**；build --check 字节级等价；lint-colors PASS；ESLint 0 error 0 warning。

---

## [v1.1.3] - 2026-08-07

### Added（Tier 2）
- **P1 · 自定义场景**：设置抽屉新增「场景管理」面板——可添加自定义场景（名称 / 颜色 / 图标）、改名、换色；自定义场景进入侧栏、命令面板、统计分布、习惯链表单与 AI 工具 `scenario` 枚举，全链路自动兼容。
- **P1 · 内置场景改名 / 换色**：办公 / 编程 / 学习 / 生活 四个内置场景支持改名与换色，可一键恢复默认；内置场景不可删除。
- **P1 · 删除保护**：场景下仍有任务（含软删除）时禁止删除该场景，防止数据孤儿；删除当前激活场景后自动回退到「办公」。
- **P5' · 命令面板增强**：模糊匹配打分（子串 > 子序列，位置加权）、「最近使用」组置顶、命令分组显示。
- **E1 · 加密务实告知**：设置页 Key 区域明示「本机加密仅防随意窥视，非端到端安全」（按已拍板的务实路线，不改加密机制）。

### Changed
- 自定义场景默认色改为 CSS 令牌 `--scenario-default`（消除硬编码色值，颜色门禁持续 PASS）。
- 命令面板 `let items` 改 `const`（ESLint prefer-const 清零）。

### Tests
- 新增 `tests/custom-scenarios.test.js`（16 用例）：场景 CRUD / 删除保护 / 内置覆盖 / 注册幂等 / AI 枚举兼容 / 统计分布。
- 新增 `tests/cmd-palette-enhance.test.js`（P5' 模糊搜索与最近使用回归）。
- 全量 **33 文件 / 429 用例全绿**；build --check 字节级等价；lint-colors PASS；ESLint 0 error 0 warning。

---

## [v1.1.2] - 2026-08-07

### Added（Tier 1 Quick Wins）
- **T1 · UI 删除改软删**：任务卡「删除」改为进入回收站（置 `deletedAt`），与 AI `delete_task` 行为统一，手删任务可找回。
- **T2 · 回收站批量操作 + 自动清理**：复选框 + 全选 + 批量恢复/批量删除；新增自动清理策略（关 / 7 / 30 / 90 天，默认 30），启动时清理超期软删任务并 toast 提示。
- **T3 · 导出 CSV / Markdown**：任务数据支持 CSV（带 BOM，Excel 直接打开）与 Markdown（按场景分组 + 完成率）导出；入口在设置数据管理区与命令面板；空数据时提示且不生成空文件。
- **T4 · 主题跟随系统**：主题三态（亮色 / 暗色 / 跟随系统），`system` 模式经 `matchMedia` 实时跟随操作系统切换；旧值 light/dark 完全兼容，新用户默认跟随系统。
- **T5 · 无障碍补漏**：回收站弹窗焦点陷阱（Tab 锁在弹窗内，关闭后焦点归还触发元素）；对比度修复（WCAG 4.5:1）。

### Fixed
- 亮色 `--text-faint` 对比度 2.99:1 → 4.5+:1（色值 `#8e8e93` → `#707074`）。
- 暗色 `--muted` 在 panel2 上对比度 4.41:1 → 4.86:1（色值 `#98989d` → `#a0a0a5`，同步 `--text-dim-2` / `--text-faint`）。
- 设置抽屉页脚残留的 v1.0.0 硬编码移除。

### Tests
- 新增 `tests/quickwins.test.js`（21 用例）：UI 软删 / 回收站批量与自动清理 / CSV·MD 导出 / 主题三态 / 焦点陷阱。全量 31 文件 / 398 用例全绿。

---

## [v1.1.1] - 2026-08-07

### Fixed（D/L/M 系列缺陷修复）

**安全 / 数据**
- **D4 · API Key 明文落盘（安全 P0）**：Web Crypto 不可用时剥离 Key 并告警，关闭 3 条泄漏路径；`initCrypto` 增加浏览器兼容降级（`_cryptoWarned` 去重 warn）。
- **D3 · 软删除 + 回收站（产品 P0）**：活跃视图统一经 `getActiveTasks()` 过滤 `deletedAt`；新增侧边栏「回收站」入口（含计数徽标）与弹窗（单条恢复 / 彻底删除 / 清空）。
- **D5 · 导入覆盖无确认（产品 P0）**：`doImport` 覆盖前弹出 `confirm` 确认。
- **D2 · 自定义链未随备份（稳定 P2）**：`allKeys()` 纳入 `wb_custom_links`，导出/导入均携带。
- **D6 · 每日播报重复触发（稳定 P2）**：调度器移除独立 digest 分支，统一由启动时 `dailyDigest()` 负责。
- **D1 · 版本号漂移（一致 P1）**：总览/场景/统计页脚统一为 `v${VERSION}`。
- **L4/M7 · 非法场景崩溃（稳定 P2）**：新增 `scMeta()` 防御性解析，非法/缺失场景兜底。

**交互 / 体验**
- **L1 · 命令面板实时过滤（交互 P1）**：`#cmdInput` 增加 `oninput` 实时过滤。
- **L2/L3 · 流式死代码（代码 P1）**：移除不可达 SSE 分支与 `readSSEStream`，`chatOnce` 统一非流式；测试钩子导出同步清理，无悬空引用。
- **M1 · 剪贴板容错**：复制失败回退提示「复制失败」，不再产生未处理 rejection。
- **M5 · Esc 关闭弹窗**：回收站 / 设置抽屉支持 Esc 关闭。
- **M8 · save 配额容错**：`save()` 增加 try/catch + `pushDiag`，配额耗尽/隐私模式不再静默崩溃。
- 其余 M 系列：死处理器移除、删链·清记忆 confirm、N 聚焦等。

### Changed
- `window.__test` 测试钩子在运行时增加门控（仅 `file://` / `localhost` / `?__test=1`），线上部署不暴露内部 API。

---

## [v1.1.0] - 2026-08-06

### Added
- **多 AI Profile**：支持配置多个 AI 供应商（OpenAI / Anthropic / Ollama / DeepSeek / 通义 / 豆包 等）并快速切换，设置抽屉中可新建 / 删除 / 复制 profile。
- **响应式布局**：4 断点全分辨率适配（移动端 `<768px` / 平板 `768–1024px` / 小屏 PC `1024–1440px` / 大屏 PC `>1440px`）。
- **侧边栏折叠**：≥1024px 可手动折叠/展开，<1024px 自动收为底部 Tab。
- **习惯链可视化**：streak 计算 + GitHub 风格热力图 + 链条动画，跨场景链路完成情况一目了然。
- **AI 习惯教练**：分析行为模式，给出 3 条个性化建议。
- **今日仪表盘**：时段问候 + Top3 任务 + 习惯链状态 + 进度环。
- **新手引导 onboarding**：3 步引导弹窗，首次进入即展示。
- **应用内使用指南**：7 章节 modal 文档，无需跳转外链。
- **PWA 基础设施**：`manifest.json` + `service-worker.js` + 离线缓存，可安装到桌面/手机主屏。
- **SM-2 间隔复习算法**：again / hard / good / easy 4 档评分，遗忘曲线驱动复习计划。
- **AI Key AES-GCM 加密存储**：API Key 在本机加密保存，不上传服务器。
- **electron-updater 自动更新集成**：桌面端可检查并安装新版本。
- **"生活"场景**：替代原"健康"场景，与办公 / 编程 / 学习 共同构成 4 核心场景。

### Changed
- **习惯链规则**更新为：
  - 办公(交付) → 学习(看技术视频)
  - 学习(复习) → 编程(写小项目)
  - 编程(上线) → 生活(犒劳自己)
- **场景砍裁**：从 7 个精简到 4 个核心场景（办公 / 编程 / 学习 / 生活），去除娱乐等无关干扰项。
- **快捷键说明**细化：`1` 办公 · `2` 编程 · `3` 学习 · `4` 生活（1-4 切场景）。

### Fixed
- `electron/preload.js` 中 `app` 未导入导致桌面端启动失败的 bug。
- `electron-updater` 测试回归问题。
- 外部改动引入的硬编码颜色和 a11y（无障碍）回归。
- 版本号三处漂移：HTML `VERSION` 常量、根 `package.json`、`electron/package.json` 统一为 1.1.0。
- `electron/package.json` 的 `build.files` 误用 `"../"` 父路径（electron-builder 不支持工程目录外文件），改为打包 `prebuild` 复制进 `electron/` 的 `agent-workbench.html`，消除产物缺 HTML 导致空白窗口的风险。
- 浏览器 `chatOnce` 与主进程 `chat` 重试语义对齐：429/5xx 退避重试（1s×attempt），网络错误退避基数统一；取消/超时/401 不重试。
- `window.__test` 约 100 个内部函数导出增加门控：仅 file://、localhost/127.0.0.1 或 `?__test=1` 时挂载，线上部署不再暴露内部 API。
- 仓库完整性：补交 `tests/`（167 测试 / 19 文件）、`scripts/lint-colors.mjs`、两个启动 `.bat`，新增 MIT `LICENSE`。

### Tests
- 测试用例从 **57 个**增长到 **380 个**，覆盖 **30 个测试文件**（分批回归全绿）。

### Docs
- 新增 [CONTRIBUTING.md](CONTRIBUTING.md)：开发环境搭建、代码规范、提交规范、测试要求。
- 更新 README.md：补充多 AI Profile、响应式布局、PWA、线上地址、习惯链说明，版本号升至 v1.1.0。

### Engineering
- **模块化构建流水线**：将单文件 `agent-workbench.html`（4873 行）按层级边界拆分为 `src/shell/`（HTML 壳，含 `<script>` 标签）+ `src/modules/`（32 个 JS 模块），新增零依赖 `scripts/build.mjs` 串联构建。构建产物与源文件**字节级等价**（SHA256 一致，已由 `node scripts/build.mjs --check` 校验）。`src/` 为源码真源，`agent-workbench.html` 为构建产物，勿手工修改——改动请编辑 `src/` 后重新构建。
- **AI 工具接口文档**：新增 `docs/ai-tools.md`，从 `TOOLS` 数组与 `execTool`/`agentExec` 分发逻辑抽取 16 个工具的 `name`、描述、`parameters` Schema、返回结构与已知不确定点（如 `update_task`/`delete_task` 的两步确认、`add_record.fields` 无子 Schema、纯 function-calling 调用方需自行处理 `confirm` 分支等）。
- **ESLint 治理**：移除 `*.html` 覆盖中的 `no-undef: off`（改为在组装后的单文件作用域内校验，0 error）；因 `src/` 为机械拼接拆分（运行时共享同一脚本作用域），将其加入 `ignorePatterns` 以避免跨模块未定义变量的误报。移除 `lint:fix` 脚本体（防止自动修复生成的产物导致与 `src/` 漂移），新增 `build` / `build:check` 脚本，`lint` 改为先构建再校验。
- **仓库门面（GitHub API）**：设置仓库 `description` 与 `homepage`（指向 gh-pages 部署地址）。`topics` 因当前存储令牌的权限范围不足被静默忽略（HTTP 200 但 `topics:[]`），需具备 `repo` 范围的令牌或于仓库 Settings → Topics 手动设置。

---

## [v1.0.0] - 2026-08-02

- **初始版本**：4 场景任务管理（办公 / 编程 / 学习 / 生活）+ AI 助手 + Agent 记忆 / 目标编排。
- 单文件交付（`agent-workbench.html`），零安装、纯本地、数据存 `localStorage`。
- 三种运行形态：Edge 应用模式 / 本地服务模式 / Electron exe。
- Agent 三层自主能力：工作记忆、多步目标编排、跨场景协调。
- 数据总览：14 天趋势 + 月历热力图 + 进度条 + 全局搜索。
- 周报生成器（办公/编程）、SM-2 间隔复习（学习）。
- 命令面板（Ctrl/Cmd+K）、暗色模式、每日播报、Toast 通知。
- 57 个测试用例。
