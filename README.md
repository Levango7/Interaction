# Agent 工坊（v3.4.3）

一个跑在 Windows 上的**套壳 Agent 工坊**：把办公 / 数据 / 设计 / 学习 / 编程 / 生活六类场景收拢进一个原生窗口，每个场景是一个 subagent 面板，可本地使用，也可接入 LLM 让 subagent 真正"动手"操作数据。

零安装、单文件、纯本地；数据存本机浏览器，不依赖任何后端服务器。

> **线上体验**：<https://levango7.github.io/Interaction/>（PWA，可安装到桌面/手机，离线可用）

---

## 产品定位（一句话）

> **面向个人用户（自己 / 开发者 / 知识工作者）的跨端统一任务工作台——核心卖点是「AI 不只是聊天，而是能真正动手创建 / 修改 / 完成任务与资料」。**

**定位四要素**：

1. 目标用户：个人（含开发者与知识工作者），**非企业团队 / 多租户**。
2. 核心价值：AI 真能动手改数据（function-calling 工具，非纯聊天）。
3. 差异化：跨端统一——一套 HTML，浏览器 / 桌面 / 手机三形态同源，无版本漂移。
4. 非目标：企业协作 / SSO / 多租户（v1.14 已移除）；自动化工作流（规则/定时/工作流/Webhook）、语音助手（v1.14.1 已归档移除）。

---

## 一、三种运行形态（共用同一份 HTML，不会版本漂移）

| 形态 | 启动方式 | 适用 | 桌面能力 |
|---|---|---|---|
| **Edge 应用模式** | 双击 `启动Agent工坊.bat` | 零安装、最常用 | 无托盘/自启 |
| **本地服务模式** | 双击 `启动本地服务.bat` | 需启用 AI 且避开 CORS | 无托盘/自启 |
| **Electron exe** | `electron/` 目录打包 | 真·独立应用 | 托盘 + 开机自启 + 本机同步服务 + OAuth 后端 |

> 三处都加载同一个 `agent-workbench.html`，改一处全生效。

---

## 二、核心特性

- **6 个场景 subagent**：办公 / 数据 / 设计 / 学习 / 编程 / 生活，左侧导航一键切换——覆盖知识工作主线 + 日常事务兜底，无娱乐等无关干扰项。侧栏四组：总览 / 场景 / 应用 / 系统（v2.5.0 菜单精简后定案：总览组 = 主页 / 任务 / 习惯链，系统组 = 回收站 / 设置 / 说明）。回收站支持多类型（任务 / 配置 / 文件 / 插件，v3.1 起——软删任务与 bin 类型统一恢复/彻底删除/批量操作/按天数自动清理）。
- **顶部「今天要处理」**：所有场景带截止日期的任务自动汇总——今日到期与逾期任务（截止日 ≤ 今天）都计入今日待办，逾期标红 + 一键完成。
- **每场景两个基础模块**：任务看板（待办 / 进行中 / 已完成，按钮移动）+ 场景专属资料库（办公→会议纪要、数据→数据记录、设计→作品记录、学习→学习资料、编程→代码片段、生活→生活记录）；设计 / 数据 / 生活三场景另有专属 extraCard（灵感板 / 指标快照 / 健康摘要，v2.5.0）。
- **场景细分工具**：周报生成器（办公/编程，自动汇总本周已完成任务）、SM-2 间隔复习（学习，遗忘曲线驱动的复习计划）。
- **可选插件（插件市场）**：健康助手（运动/体重/睡眠/喝水记录 + 健康概览，挂载到生活场景）默认关闭，需要时在「设置 → 插件市场」启用/禁用/移除。
- **数据总览**：近 14 天完成趋势折线图 + 本月日历热力图 + 各场景进度条；顶部全局搜索跨场景检索；主页末尾有「数据可视化制作」入口（图表制作器，画布自由编排图表）。
- **AI 接入（可选）**：设置里填 API Key（兼容 OpenAI 格式，DeepSeek / 通义 / 豆包 等均可），每个场景的 AI 助手可**调用工具**真正创建/修改/删除任务、查询/搜索/添加资料/导出。
- **多会话管理**：AI 聊天支持多 Session——会话集中存储（`ai_sessions`），可新建/重命名/删除/搜索，首条用户消息自动命名。聊天面板头部「☰」打开会话管理弹窗（左列表 + 右消息预览）。
- **侧栏「工具」分区**：萌宠 / 闹钟 / 天气一键直达弹窗，笃行 / 时间追踪弹出浮层——专注工具不再藏在应用页深处。
- **Agent 能力（默认开启，设置可关）**：在 AI 工具之上扩展三层自主能力——
  - **工作记忆**：助手可用 `remember`/`recall`/`forget` 工具沉淀用户偏好与决定，按场景隔离、近期+命中加权召回、自动注入对话上下文（也可对我说「记住：xxx」直接写入）；最多 60 条环形截断。
  - **多步目标编排**：`plan` 工具把一句话目标拆成有序步骤，激活后对话循环上限由 6 轮放宽至 12 轮，助手逐步执行并用 `complete_step`/`complete_goal` 推进与收尾（单目标聚焦，新目标自动顶替旧的）。
  - **跨场景协调**：`list_records` 工具查任意场景资料库，目标步骤可跨场景调用既有工具。设置抽屉与命令面板（Ctrl/Cmd+K）提供记忆/目标管理入口。
- **场景联动（习惯链）**：任务完成时按规则跨场景自动生成奖励/后续任务，形成"习惯链"（办公交付→学习、学习复习→编程、编程上线→生活犒劳，可自定义开关），链路完成情况在习惯链面板可视化（streak 计算 + GitHub 风格热力图 + 链条动画）。
- **集成中心（v3.1.0）**：设置抽屉「集成」Tab，7 个外部集成 provider——Notion / Linear / Jira / Slack / 飞书 / 钉钉 / 日历（Google/Outlook）。每个 provider 有独立的**凭据配置弹窗**（按各自 connect 函数所需字段收集，如 Notion 需 token + databaseId，飞书需 appId + appSecret），凭据齐备才真正连接；连接状态如实显示「已连接 · 已验证/未验证」或「未连接」。另有 OpenAPI Key 管理（新建/吊销）。
- **SQL Playground（v3.1.0）**：编程场景 SQL 卡——sql.js WASM 从 cdnjs CDN 动态加载，在本地 SQLite 沙箱中执行 SQL，结果表格回显（首次使用需联网加载 WASM）。
- **JS 运行器（v3.0.1）**：在 Web Worker 沙箱中执行 JS 片段——无法访问应用数据、DOM 或 localStorage，最长 10 秒超时自动终止，console 输出回显。
- **本机同步服务（仅 Electron）**：主进程内置 HTTP 同步服务，**仅绑定 127.0.0.1:8124 回环**且拒绝非本机来源——用于本机快照下载（`/sync/download`）与数据上传合并（`/sync/upload`，经渲染进程确认后导入）。**不做跨设备局域网访问**；跨设备数据迁移请用「设置 → 数据管理 → 导出/导入」JSON。
- **机制**：主题系统（浅色 Vercel Geist 默认 / 极光 / 暗色 / 跟随系统 / 护眼 / 初雪 / 黑客帝国 / 秘境森林 / 幽蓝海洋，v3.1.1 起高对比度主题已移除）、命令面板（Ctrl/Cmd+K）、快捷键帮助面板（`?` 唤起）、每日播报、任务标签、Toast 通知。
- **数据安全**：导出 / 导入 / 清空（清空二次确认）统一收进设置抽屉「数据管理」；累计 30 条顶部提示备份。敏感配置（AI Key、集成凭据）在 Electron 形态下由主进程 `safeStorage` 加密持久化（Windows DPAPI），浏览器形态为 AES-GCM 混淆级防护（见下）。
- **响应式布局**：4 断点全分辨率适配——移动端 `<768px` 底部 Tab 导航（按钮 ≥44px、适配 iPhone 安全区）；平板 `768–1024px` 侧边栏可折叠；小屏 PC `1024–1440px` 默认展开侧边栏；大屏 PC `>1440px` 内容区限宽居中（B2 统一布局基线：主内容宽度约束 + 布局宽度令牌体系）。
- **PWA**：通过 `manifest.json` + `service-worker.js` 提供可安装、离线可用能力——可"安装"到桌面/手机主屏，离线时核心功能仍可用（数据本地化）。

---

## 三、架构

```
┌─────────────────────────────────────────────┐
│            agent-workbench.html               │  ← 单一交付物（UI + 逻辑 + 数据）
│  HTML/CSS(全内联) + 原生 JS + 内联 SVG 图标/图表 │
│  ├─ 场景引擎 (SCENARIOS / ORDER / ICONS)       │
│  ├─ 数据层   (localStorage + IDB 镜像)          │
│  ├─ AI 层    (chatOnce + function-calling 工具) │
│  ├─ Agent 引擎 (记忆/目标/跨场景，注入上下文+放宽循环) │
│  ├─ 集成中心 (7 provider 注册表 + 凭据配置弹窗)   │
│  └─ 交互层   (命令面板 / 快捷键 / Toast / 联动)  │
└───────────────────┬─────────────────────────┘
                    │ window.electronAPI（仅桌面端存在）
┌───────────────────┴─────────────────────────┐
│      electron/  (main.js + preload.js)        │  ← 桌面封装
│  BrowserWindow · Tray(内联图标) · 开机自启(IPC) │
│  单实例锁 · AppUserModelId · 窗口图标           │
│  本机同步服务 (127.0.0.1:8124，仅回环)          │
│  OAuth 轻量后端 (PKCE + state TTL + 加密令牌)   │
└─────────────────────────────────────────────┘
```

**前后端交互契约（v3.1.1 实况：14 个 IPC 通道，逐一对照 `electron/main.js` 与 `electron/preload.js`）**

| 能力 | preload 暴露 | 主进程句柄 | 方向 |
|---|---|---|---|
| 读开机自启状态 | `electronAPI.getAutoLaunch()` | `ipcMain.handle("get-auto-launch")` | 渲染→主 |
| 设置开机自启 | `electronAPI.setAutoLaunch(on)` | `ipcMain.on("set-auto-launch")` | 渲染→主 |
| 写 AI 配置（safeStorage 加密落盘） | `electronAPI.setAiConfig(cfg)` | `ipcMain.handle("set-ai-config")` | 渲染→主 |
| 读 AI 配置 | `electronAPI.getAiConfig()` | `ipcMain.handle("get-ai-config")` | 渲染→主 |
| AI 聊天（含工具调用） | `electronAPI.chat(arg)` | `ipcMain.handle("chat")` | 渲染→主 |
| 取消进行中的 AI 请求 | `electronAPI.abortChat()` | `ipcMain.on("abort-chat")` | 渲染→主 |
| 读本机同步快照 | `electronAPI.syncGet()` | `ipcMain.handle("sync-get")` | 渲染→主 |
| 上传同步数据（确认后导入） | `electronAPI.syncUpload(data)` | `ipcMain.handle("sync-upload")` | 渲染→主 |
| 推送本机快照到同步服务 | `electronAPI.syncPush(data)` | `ipcMain.handle("sync-push")` | 渲染→主 |
| 发起 OAuth 授权（PKCE） | `electronAPI.oauthBegin(cfg)` | `ipcMain.handle("oauth-begin")` | 渲染→主 |
| 读 OAuth 令牌 | `electronAPI.oauthTokens(provider)` | `ipcMain.handle("oauth-tokens")` | 渲染→主 |
| 列 OAuth 已授权 provider | `electronAPI.oauthList()` | `ipcMain.handle("oauth-list")` | 渲染→主 |
| 刷新 OAuth 令牌 | `electronAPI.oauthRefresh(provider)` | `ipcMain.handle("oauth-refresh")` | 渲染→主 |
| 吊销 OAuth 授权 | `electronAPI.oauthRevoke(provider)` | `ipcMain.handle("oauth-revoke")` | 渲染→主 |
| 同步上传请求通知 | `electronAPI.onSyncUploadRequest(cb)` | `webContents.send("sync-upload-request")` | 主→渲染 |
| OAuth 状态通知 | `electronAPI.onOauthStatus(cb)` | `webContents.send("oauth-status")` | 主→渲染 |

`contextIsolation: true` + `nodeIntegration: false` + `sandbox: true`，预加载脚本仅暴露最小且明确的 API；所有 IPC 处理器经 `assertTrustedSender` 校验调用方，符合 Electron 安全基线。

**本机同步服务（`startSyncServer`，仅 Electron 运行时启动）**：HTTP 服务绑定 `127.0.0.1:8124`（可经 `INTERACTION_SYNC_PORT` 覆写，测试用），拒绝一切非回环来源；提供 `/sync/download`（快照下载）、`/sync/upload`（上传后经渲染进程确认导入）、`/oauth/callback`（OAuth 回调，state 一次性 + TTL 10 分钟，回调页动态内容全部 HTML 转义）。

**OAuth 轻量后端（B3）**：主进程实现 PKCE（S256）授权流程——一次性 state（10 分钟 TTL）防 CSRF/重放，令牌以加密形式持久化（`oauth-tokens.json.enc`），5 分钟巡检自动刷新临期令牌。**UI 已接通（v3.1.1）**：集成中心 → 日历 → 「OAuth 授权」——填入服务商控制台注册应用的 Client ID 即可走授权码流程（Google/Outlook 公共端点，token 自动回填并验证）；其余 6 个 provider 走手动凭据。前提：在服务商控制台注册应用并把回调地址 `http://127.0.0.1:8124/oauth/callback` 登记为 redirect_uri；浏览器（非 Electron）形态无本地回调服务，该按钮会明确提示改用手动粘贴 Token。

---

## 四、AI 接入与跨域

1. 右上角「设置」→ 勾选"启用 AI" → 填 `API Base / Key / 模型`。
2. **多 AI Profile**：支持配置多个 AI 供应商 profile（OpenAI / Anthropic / Ollama / DeepSeek / 通义 / 豆包 等兼容 OpenAI 格式者均可）。在设置抽屉的「AI Profile」区域可切换 / 新建 / 删除 / 复制，每个 profile 独立存储，切换不丢配置。
3. Key **仅存本机**：浏览器形态存 `wb_agent_cfg`（AES-GCM 加密）；Electron 形态由主进程 `safeStorage` 加密保管，不进渲染进程。
   - **威胁模型（诚实说明）**：浏览器形态下加密用的设备密钥与密文同存 localStorage，属**混淆级防护**——防随手翻看，不防本机恶意进程读取。需要操作系统级保护（Windows DPAPI）请用 Electron 版。
4. **跨域**：从 `file://` 直接调 API 可能被浏览器 CORS 拦截。最稳妥用 **`启动本地服务.bat`**（`http://localhost:8123` 起，端口被占自动顺延）打开再启用 AI。

---

## 五、快捷键

`1` 办公 · `2` 数据 · `3` 设计 · `4` 学习 · `5` 编程 · `6` 生活（1-6 切场景）· `G` 总览 · `N` 聚焦新建任务 · `Ctrl/Cmd+K` 命令面板 · `Ctrl/Cmd+Z` 撤销 · `Ctrl/Cmd+Y` 或 `Ctrl/Cmd+Shift+Z` 重做 · `Ctrl/Cmd+Shift+F` 全局搜索 · `Esc` 关闭最上层弹窗 · `?` 快捷键帮助面板。

---

## 六、构建 Electron 便携包（需联网）

```bash
cd electron
npm install          # 下载 Electron + electron-builder（~100MB+，沙箱无法代跑）
npm start            # 开发预览
npm run dist         # 打包 Windows 便携版 exe（免安装）→ electron/dist/*.exe
```

`prebuild` 会先把仓库根的 `agent-workbench.html` 复制进 `electron/`，`build.files` 白名单（`main.js` / `preload.js` / `package.json` / `agent-workbench.html`）将其带入产物；`main.js` 的 `resolveHtml()` 按 `app.isPackaged` 解析路径，开发与打包两种布局都能正确加载同一份 HTML。

> 桌面端进阶能力（托盘、自启、窗口图标、本机同步服务、OAuth 后端）依赖 Electron 主进程，须在本机 `npm install && npm run dist` 后体验。

---

## 七、数据安全与已知限制

- **数据归属**：全部存于浏览器 `localStorage`（键前缀 `wb_agent_`，启动时镜像进 IndexedDB），刷新 / 关闭不丢；但**换浏览器、清缓存、移动 HTML 文件**（尤其是 `file://` 形态）可能导致数据不跟随。需要稳定数据请用本地服务模式或 Electron exe（同源持久）。
- **隐私边界**：部署/分享只涉及文件本身；数据在用户本机，不在服务器。不要在工作台里预填真实敏感信息后再把文件发给他人。
- **本机同步服务仅回环**：`127.0.0.1:8124` 绑定 + 非本机来源 403——**不支持**跨设备局域网访问（这是有意的安全边界，不是待修缺陷）。跨设备迁移走「设置 → 数据管理 → 导出/导入」JSON。
- **集成中心凭据双路径**：Notion/Linear/Jira/Slack/飞书/钉钉在配置弹窗手动填写 token/密钥；日历支持 OAuth 授权（Electron 版，需自备 Client ID 并登记回调地址 `http://127.0.0.1:8124/oauth/callback`）或手动粘贴 Access Token。
- **SQL Playground 首次需联网**：sql.js WASM 从 cdnjs CDN 动态加载；加载失败会给出提示，不影响其他功能。
- **AI 工具**：调用真实改写同一份 localStorage，AI 操作与手动操作等价；工具定位任务靠标题关键词，重名时取第一条。
- **无账号体系**：靠导出 / 导入迁移数据（单人使用场景）。

---

## 八、版本

当前版本 **v3.4.2**（`package.json`、`electron/package.json`、`manifest.json`、代码内 `VERSION` 常量四处一致，由 `scripts/build.mjs --check` 门禁守护）。变更记录见 [CHANGELOG.md](CHANGELOG.md)。

> **更新提示**：以本地服务 / PWA 方式使用时，更新后首次打开会弹出「新版本已就绪，点击刷新」提示（点击即刷新）；页面底部页脚显示 `v3.4.2 · b{构建标记}`，若未显示构建标记则说明仍在旧缓存版本（可 Ctrl+Shift+R 强制刷新）。Electron 打包版需重新 `npm run dist`（构建时自动拷贝最新 HTML）。

## 相关文件

- `agent-workbench.html` — 工作台本体（核心交付物）
- `启动Agent工坊.bat` — Edge 应用模式启动器
- `启动本地服务.bat` — 本地服务模式启动器（解决 AI 跨域）
- `electron/` — 桌面封装（见 [electron/README.md](electron/README.md)）

## 目录结构

```
Interaction/
├─ agent-workbench.html        # 工作台本体（单一交付物，UI+逻辑+数据全内联）
├─ index.html                  # 入口跳转页（重定向到 agent-workbench.html）
├─ manifest.json               # PWA 清单
├─ service-worker.js           # PWA Service Worker（离线缓存 + 后台同步 + 推送）
├─ icon.svg / icon-*.png       # 应用图标（SVG 源 + PWA 位图）
├─ 启动Agent工坊.bat          # Edge 应用模式启动器
├─ 启动本地服务.bat             # 本地服务模式启动器
├─ docs/                       # 设计文档（架构/UI 规范/产品范围/执行架构等）
├─ electron/                   # Electron 桌面封装（main/preload/打包配置）
├─ scripts/                    # 构建与门禁脚本（build/lint-colors/lint-layers/lint-tokens/release/make-icon）
├─ server/                     # 后端服务（Express，v3.3.0：auth / notifications / integrations API，默认端口 3001）
├─ tests/                      # vitest 单元测试（71 文件 889 用例）+ tests/integration/ + tests/e2e Playwright
└─ .github/workflows/          # CI（ci.yml：测试+门禁）+ CD（deploy.yml：部署 GitHub Pages）
```
