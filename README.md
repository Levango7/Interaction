# Agent 工坊（v3.7.81）

一个跑在 Windows 上的**套壳 Agent 工坊**：把办公 / 数据 / 设计 / 学习 / 编程 / 生活 / 健康七类场景收拢进一个原生窗口，每个场景是一个 subagent 面板，可本地使用，也可接入 LLM 让 subagent 真正"动手"操作数据。

零安装、单文件、纯本地；数据存本机浏览器，**默认不依赖任何后端服务器**（可选开启账号云同步与联网工具）。

> **源码态说明（v3.7.0 起）**：仓库内的 `agent-workbench.html` 是约 607 KB 的**骨架**——应用 JS 已外置到 `src/`（35 个模块，由 `scripts/src-split.mjs` 拆分），文件中只保留 `/*SRC:xxx:BEGIN*/ … END*/` 标记。**直接双击打开仓库里的 HTML 不会得到可用应用**，需先组装：
>
> ```bash
> npm run src:inject     # 把 src/ 拼回单文件 HTML
> ```
>
> 线上体验与 Electron 打包产物由构建自动组装（`pretest` / `prebuild*` / `pree2e` 均会先跑 `src-split.mjs`），不受此影响。

> **线上体验**：<https://levango7.github.io/Interaction/>（PWA，可安装到桌面/手机，离线可用）

---

## 产品定位（一句话）

> **面向个人用户（自己 / 开发者 / 知识工作者）的跨端统一任务工坊——核心卖点是「AI 不只是聊天，而是能真正动手创建 / 修改 / 完成任务与资料」。**

**定位四要素**：

1. 目标用户：个人（含开发者与知识工作者），**非企业团队 / 多租户**。
2. 核心价值：AI 真能动手改数据（function-calling 工具，非纯聊天）。
3. 差异化：跨端统一——一套 HTML，浏览器 / 桌面 / 手机三形态同源，无版本漂移。
4. 非目标：**企业级**协作 / SSO / 多租户（v1.14 已移除）；自动化工作流（规则/定时/工作流/Webhook）、语音助手（v1.14.1 已归档移除）。
   （注：v3.5 起新增**个人账号**能力——微信 / GitHub 第三方登录 + 可选的跨设备云同步，与已移除的企业 SSO 不是同一回事。）

---

## 一、三种运行形态（共用同一份 HTML，不会版本漂移）

| 形态 | 启动方式 | 适用 | 桌面能力 |
|---|---|---|---|
| **Edge 应用模式** | 双击 `启动Agent工坊.bat` | 零安装、最常用 | 无托盘/自启 |
| **本地服务模式** | 双击 `启动本地服务.bat` | 需启用 AI 且避开 CORS | 无托盘/自启 |
| **Electron exe** | `electron/` 目录打包 | 真·独立应用 | 托盘 + 开机自启 |

> 三处都加载同一个 `agent-workbench.html`，改一处全生效。

---

## 二、核心特性

- **7 个场景 subagent**：办公 / 数据 / 设计 / 学习 / 编程 / 生活 / 健康，左侧导航一键切换——覆盖知识工作主线 + 日常事务与健康兜底，无娱乐等无关干扰项。（另有预置场景「理财」，默认不进导航，由「设置 → 插件市场」启用后出现。）
- **顶部「今天要处理」**：所有场景带截止日期的任务自动汇总——今日到期与逾期任务（截止日 ≤ 今天）都计入今日待办，逾期标红 + 一键完成。
- **每场景两个基础模块**：任务看板（待办 / 进行中 / 已完成，按钮移动）+ 场景专属资料库（办公→会议纪要、设计→作品记录、学习→学习资料、数据→数据记录、编程→代码片段、生活→生活记录、健康→健康记录）。
- **场景细分工具**：周报生成器（办公/编程，自动汇总本周已完成任务）、SM-2 间隔复习（学习，遗忘曲线驱动的复习计划）、SQL Playground（数据，sql.js WASM 内存库）、图表画布（数据可视化编排）。
- **自定义仪表盘**：15 个可拖拽组件（关键指标 / 今日待办 / 完成趋势 / 场景分布 / 饼图 / 热力图 / 联动触发率 / 最近动态 / 快捷操作 / 时段分布 / 高级报表 / 甘特 / 思维导图 / 雷达 / 桑基），布局自动保存；入口在「工具箱 → 功能 → 自定义仪表盘」。
- **账号与云同步（可选，默认不启用）**：微信扫码 / GitHub OAuth 登录个人账号后，可把本地数据快照同步到自建 API，跨设备恢复；不登录则完全本地，功能不受影响。
- **插件市场（10 个内置插件）**：番茄钟（笃行专注法）/ 阅读 / 理财 / 预算 / 健康助手 / 习惯追踪 / 天气 / 每日一言 / 专注计时 / 思维导图——按需启用/禁用/移除。其中「健康助手」用于把健康卡挂载到**生活**场景（健康本身已是独立内置场景）。
- **数据总览**：近 14 天完成趋势折线图 + 本月日历热力图 + 各场景进度条；顶部全局搜索跨场景检索。
- **AI 接入（可选）**：设置里填 API Key（兼容 OpenAI 格式，DeepSeek / 通义 / 豆包 等均可），每个场景的 AI 助手可**调用 26 个工具**真正创建/修改/删除任务、查询/搜索/添加资料、导出、联网检索、跑代码与 SQL。
- **Agent 能力（默认开启，设置可关）**：在 AI 工具之上扩展三层自主能力（7 个 agent 工具）——
  - **工作记忆**：助手可用 `remember`/`recall`/`forget` 工具沉淀用户偏好与决定，按场景隔离、近期+命中加权召回、自动注入对话上下文（也可对我说「记住：xxx」直接写入）；最多 60 条环形截断。
  - **多步目标编排**：`plan` 工具把一句话目标拆成有序步骤，激活后对话循环上限由 6 轮放宽至 12 轮，助手逐步执行并用 `complete_step`/`complete_goal` 推进与收尾（单目标聚焦，新目标自动顶替旧的）。
  - **跨场景协调**：`list_records` 工具查任意场景资料库，目标步骤可跨场景调用既有工具。设置抽屉与命令面板（Ctrl/Cmd+K）提供记忆/目标管理入口。
- **技能（v3.7.59 起为真实能力）**：「设置 → AI → 扩展 → 技能配置」里的自定义 JSON 不再只是存配置——已启用的技能会按相关度注入每轮对话的系统提示（带做法与建议工具，单次最多 6 条且受上下文预算约束），命令面板（Ctrl/Cmd+K）新增「技能」组可一键触发；一轮对话成功执行 ≥2 个工具后，回「存为技能」即可把这条流程固化成可复用技能（`delete_task`/`update_task`/`forget` 不参与固化）。
- **AI 自主执行（v3.7.59 起有入口）**：命令面板输入 `>` 开头的一句话 → 助手先出**计划**（只问模型、不改任何数据）→ 我回「确认执行」才逐步落地。三条硬约束：破坏性步骤（删除/修改任务）一律拦成「待确认已跳过」交回交互路径、工具白名单在此路径同样生效、步骤数封顶 12（超出如实标注裁了多少）。
- **上下文装配（v3.7.59）**：开启「上下文注入」后，工作记忆改用**语义召回**（复用 embedding 通道，换了说法也能命中）而非仅字面匹配；检索结果按可配置 token 预算（`ctxBudgetTokens`，默认 1200）整条装配，每条带 `[序号·来源·召回方式]` 出处标注，被裁掉时如实说明。未配置 embedding 或未开开关时自动退回纯词法，行为与从前一致。
- **未配置 AI 时不再外发请求（v3.7.59 安全修复）**：此前没配模型也会带空 Bearer 真打 `api.openai.com` 并重试 3 次（内容已出本机、且表现为卡十几秒）；现在直接拒发并给出可操作的提示，与 Electron 主进程侧的既有守卫对齐。
- **需联网的工具（例外说明）**：`web_search` / `web_fetch` 需访问外网；`code_run` / `sql_query` 在本机沙箱（WASM）内执行，不需联网。除此之外全部功能可离线使用。
- **场景联动（习惯链）**：任务完成时按规则跨场景自动生成奖励/后续任务，形成"习惯链"：
  - 办公(交付) → 学习(看技术视频)
  - 学习(复习) → 编程(写小项目)
  - 编程(上线) → 生活(犒劳自己)
  - 可自定义开关，链路完成情况在习惯链面板可视化（streak 计算 + GitHub 风格热力图 + 链条动画）。
- **机制**：暗色模式、命令面板（Ctrl/Cmd+K）、每日播报、任务标签、Toast 通知、快捷键。
- **数据安全**：导出 / 导入 / 清空（清空二次确认）统一收进设置抽屉「数据管理」；累计 30 条顶部提示备份；顶栏保留搜索 / 命令 / 消息 / 主题 / 下载 / 账号六枚快捷按钮（指南入口在侧栏底部，设置 / AI / 插件市场在侧栏系统组）。
- **响应式布局**：4 断点全分辨率适配——
  - 移动端 `<768px`：底部 Tab 导航，按钮 ≥44px、输入框 ≥16px，适配 iPhone 安全区；
  - 平板 `768–1024px`：侧边栏可折叠为图标态；
  - 小屏 PC `1024–1440px`：默认展开侧边栏；
  - 大屏 PC `>1440px`：内容区限宽居中，多列布局。
  - 侧边栏在 ≥1024px 时可手动折叠/展开，<1024px 自动收为底部 Tab。
### 桌面萌宠（v3.6 起，9 只）

右下角常驻一只会动的角色，点击说话、会眨眼、会做动作；两种风格、三档尺寸可切。

| 分组 | 成员 | 说明 |
|---|---|---|
| 🐾 动物（5） | 橘座（橘猫）· 棉花（萨摩耶）· 雪团（兔）· 团子（熊猫）· 泡泡（海豚） | Q 版贴纸风，同一套 chibi 比例 |
| 👦 Q 版（2） | 小星（少女）· 小辰（少男） | 与动物同风格，星星 / 月亮帽衫成对 |
| 👩 青年（2） | 阿妍（靓女）· 阿岸（俊男） | 全身立绘，日常时尚向 |

- **两套风格**：`精致二次元`（平涂原图）与 `3D 立体渲染`（同一张清晰立绘 + 2.5D 渲染：厚度挤出 / 方向光 / 镜面扫光 / 接地影 / 转台摇摆 / 指针倾斜）——后者**不重画、不降清晰度**。
- **三档尺寸**：小 72 / 中 96（默认）/ 大 128 px。
- **会动**：眨眼、张嘴、摇头 / 点头 / 跳舞 / 倾斜 / 转圈；立体档另有星光特效。
- 详见 [docs/pet-system.md](docs/pet-system.md)。

---

- **PWA**：通过 `manifest.json` + `service-worker.js` 提供可安装、离线可用能力——可"安装"到桌面/手机主屏，离线时核心功能仍可用（数据本地化）。

---

## 三、架构

```
┌─────────────────────────────────────────────┐
│            agent-workbench.html               │  ← 单一交付物（UI + 逻辑 + 数据）
│  HTML/CSS(全内联) + 原生 JS + 内联 SVG 图标/图表 │
│  ├─ 场景引擎 (SCENARIOS / ORDER / ICONS)       │
│  ├─ 数据层   (localStorage, 前缀 wb_agent_)     │
│  ├─ AI 层    (chatOnce + function-calling 工具) │
│  ├─ Agent 引擎 (记忆/目标/跨场景，注入上下文+放宽循环) │
│  ├─ 萌宠层   (9 只角色·立绘·标定·双风格·动作特效) │
│  └─ 交互层   (命令面板 / 快捷键 / Toast / 联动)  │
└───────────────────┬─────────────────────────┘
                    │ window.electronAPI（仅桌面端存在）
┌───────────────────┴─────────────────────────┐
│      electron/  (main.js + preload.js)        │  ← 桌面封装
│  BrowserWindow · Tray(内联图标) · 开机自启(IPC) │
│  单实例锁 · AppUserModelId · 窗口图标           │
└─────────────────────────────────────────────┘
```

**前后端交互契约（v1.15 修订：按实际调用核对）**

| 能力 | preload 暴露 | 主进程句柄 | 页面调用 |
|---|---|---|---|
| AI 聊天（含工具） | `electronAPI.chat(arg)` | `ipcMain.handle("chat")` | ✅ 实际使用 |
| 取消进行中的 AI 请求 | `electronAPI.abortChat()` | `ipcMain.on("abort-chat")` | ✅ 实际使用 |
| 读 AI 配置 | `electronAPI.getAiConfig()` | `ipcMain.handle("get-ai-config")` | ✅ 实际使用 |
| 写 AI 配置 | `electronAPI.setAiConfig(cfg)` | `ipcMain.handle("set-ai-config")` | ✅ 实际使用 |
| 读开机自启状态 | `electronAPI.getAutoLaunch()` | `ipcMain.handle("get-auto-launch")` | ✅ 实际使用 |
| 设置开机自启 | `electronAPI.setAutoLaunch(on)` | `ipcMain.on("set-auto-launch")` | ✅ 实际使用 |

`contextIsolation: true` + `nodeIntegration: false` + `sandbox: true`，预加载脚本仅暴露最小且明确的 API，符合 Electron 安全基线。

---

## 四、AI 接入与跨域

1. 右上角「设置」→ 勾选"启用 AI" → 填 `API Base / Key / 模型`。
2. **多 AI Profile**：支持配置多个 AI 供应商 profile（OpenAI / Anthropic / Ollama / DeepSeek / 通义 / 豆包 等兼容 OpenAI 格式者均可）。在设置抽屉的「AI Profile」区域可：
   - **切换**：下拉选择当前激活的 profile，一键换供应商；
   - **新建**：填 Base/Key/模型 保存为新 profile；
   - **删除**：移除不再使用的 profile；
   - **复制**：基于现有 profile 克隆一份再微调。
   - 每个 profile 独立存储，切换不丢配置。
3. Key **仅存本机浏览器**（`wb_agent_cfg`，AES-GCM 加密），且云同步快照**排除** `cfg` 键（v3.7.58 起）——Key 密文不会上传任何服务器。
   - **威胁模型（诚实说明）**：浏览器形态下加密用的设备密钥与密文同存 localStorage，属**混淆级防护**——防随手翻看，不防本机恶意进程读取。需要操作系统级保护（Windows DPAPI）请用 Electron 版，Key 由主进程 `safeStorage` 加密保管，不进渲染进程。
4. **跨域**：从 `file://` 直接调 API 可能被浏览器 CORS 拦截。最稳妥用 **`启动本地服务.bat`**（`http://localhost:8123`）打开再启用 AI。

---

## 五、快捷键

`1` 办公 · `2` 数据 · `3` 设计 · `4` 学习 · `5` 编程 · `6` 生活（`1`-`6` 切场景，按 `ORDER` 序）· `G` 总览 · `N` 聚焦新建任务 · `Ctrl/Cmd+K` 命令面板。

> **键位 = `ORDER` 数组下标 + 1**（`src/core.js` `const ORDER = ["office","data","design","study","code","life","health"]`），
> 不是「导航显示顺序」也非固定语义。第 7 个场景**健康**无数字快捷键（仅 1-6）。
> v3.7.70 修正：此处旧写「2 编程 / 3 学习 / 4 生活」与实现不符（实现为 2 数据 / 3 设计 / 4 学习），且漏了 `5` `6`。

---

## 六、构建 Electron 便携包（需联网）

```bash
cd electron
npm install          # 下载 Electron + electron-builder（~100MB+，沙箱无法代跑）
npm start            # 开发预览
npm run dist         # 打包 Windows 便携版 exe（免安装）→ electron/dist/*.exe
```

`prebuild` 会先把仓库根的 `agent-workbench.html` 复制进 `electron/`，`build.files` 白名单（`main.js` / `preload.js` / `package.json` / `agent-workbench.html`）将其带入产物；`main.js` 的 `resolveHtml()` 按 `app.isPackaged` 解析路径，开发与打包两种布局都能正确加载同一份 HTML。

> 桌面端进阶能力（托盘、自启、窗口图标）依赖 Electron 主进程，须在本机 `npm install && npm run dist` 后体验。

---

## 七、数据安全与已知限制

- **数据归属**：全部存于浏览器 `localStorage`（键前缀 `wb_agent_`），刷新 / 关闭不丢；但**换浏览器、清缓存、移动 HTML 文件**（尤其是 `file://` 形态）可能导致数据不跟随。需要稳定数据请用本地服务模式或 Electron exe（同源持久）。
- **隐私边界**：部署/分享只涉及文件本身；数据在用户本机，不在服务器。不要在工坊里预填真实敏感信息后再把文件发给他人。
- **反馈出口（v3.7.65 起）**：「设置 → 关于 → 诊断与反馈」可自助查看近期诊断、复制脱敏报告，或一键「提交 Issue」—— 由浏览器打开 GitHub 新建 Issue 页并预填报告，**应用自身不发起任何请求**（回归用例 `tests/diag-report.test.js` ⑤ 断言 fetch / XHR 零调用）。报告只含版本、运行形态、存储用量与脱敏后的技术日志，不含任务 / 笔记正文与凭据。模板见 `.github/ISSUE_TEMPLATE/feedback.md`；该目录刻意**只保留一个模板并关闭空白 Issue**，以保证 `/issues/new?title=&body=` 的预填参数直达表单 —— 多模板或允许空白 Issue 时 GitHub 会先进「选择模板」页，预填参数存在丢失风险。
- **浏览器态 XSS 防护能力（如实说明，v3.7.59 补充）**：CSP 为 `script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com 'wasm-unsafe-eval'` —— 单文件架构必须内联脚本，`'unsafe-inline'` 去不掉，**因此 CSP 对 XSS 不提供任何缓解**（它只约束资源类型与协议，`object-src 'none'` / `base-uri 'self'` / `form-action 'self'` 三项是有效的）。同理 `connect-src` 含裸 `https:`：应用需要调用用户自填的任意 API 基址、`web_fetch` 抓任意 URL、`web_search` 用可配置引擎，**不能**收敛为域名白名单 —— 这是功能必需的放宽，不是配置疏漏。
  真正的 XSS 防线是 `sanitizeHtml`（自研轻量消毒，约 130 处 `innerHTML` 依赖它；已知限制见 `src/util-markdown.js` 顶部 SECURITY NOTE）。2026-09-27 审计实测修复了 4 类可绕过写法（`<svg/onload=…>` 斜杠分隔事件属性、`<img/src=x/onerror=…>`、SVG `<animate>/<set>` 运行期改 `href`、`<button formaction="javascript:…">`）与 1 条未消毒的注入路径（图表画布 `_dgmSvgHtml`），回归用例见 `tests/sanitize-xss-regression.test.js`（21 条）。**注意：XSS 在本应用中等价于读走整个 localStorage（含 Key 密文与设备密钥），故不要把「混淆级防护」当作能扛住 XSS 的保护。**
- **AI 工具**：调用真实改写同一份 localStorage，AI 操作与手动操作等价；工具定位任务靠标题关键词，重名时取第一条。
- **可选账号与云同步**：客户端包含登录、注册、邮箱验证码与同步接口，依赖兼容后端；API 基址取 `cfg.apiBase`，默认 `http://localhost:3001`。本仓库未附带该服务，不能把打开静态页面或 Electron 外壳等同于后端已运行。未配置后端时用导出 / 导入迁移数据。
  - **同步端点契约（v3.7.53 补齐推送侧）**：`GET /api/sync/snapshot` 取快照、`PUT /api/sync/snapshot` 上传快照（body `{snapshot, updatedAt}`，快照内含 `_deviceMeta.deviceId`）。客户端两侧都已实现；**未与真实后端联调**，故同步状态如实显示：推成功才显示「已同步」，失败/离线显示「同步失败 / 离线模式」，能力缺失显示「仅本机（云同步未接入）」。
  - **快照范围（v3.7.58 修订）**：快照包含业务数据（任务 / 记录 / 笔记 / 记忆 / AI 会话历史等 `wb_agent_*` 键）；**排除** AI 配置（`wb_agent_cfg`，内含 Key 密文）、设备密钥（`wb_agent___dk`）、同步元数据与本机回滚备份（`wb_agent_pre_restore_backup`）。
- **第三方登录回调契约**：GitHub 授权接口需返回 `authorizeUrl` 和 `state`；回调页面必须位于配置的 API 同源，在本次打开的登录窗口内发送 `{type:"agent-github-oauth", state, accessToken, refreshToken}`。客户端校验来源、窗口及一次性 state；未与实际后端完成联调。
- **Electron 本机同步入口会自动隐藏（v3.7.52 起）**：页面侧曾调用 preload 未暴露的 `electronAPI.syncPush/syncGet`，而主进程从未实现 127.0.0.1:8124 同步服务，导致每 60s 弹一次失败告警。现按「stub + 活 UI = 虚假功能」原则：检测到能力缺失时直接隐藏「本机同步下载」按钮并停掉定时器。恢复方式（补 IPC + 同步服务）见 [docs/product-scope.md](docs/product-scope.md)。

---

## 八、版本

当前版本 **v3.7.80**（与 `electron/package.json`、`package.json`、`manifest.json`、代码内 `VERSION` 常量、本文件共五处保持一致）。变更记录见 [CHANGELOG.md](CHANGELOG.md)。

> **更新提示**：以本地服务 / PWA 方式使用时，更新后首次打开会弹出「新版本已就绪，点击刷新」提示（点击即刷新）；页面底部页脚显示 `v3.7.80 · b{构建标记}`，若未显示构建标记则说明仍在旧缓存版本（可 Ctrl+Shift+R 强制刷新）。Electron 打包版需重新 `npm run dist`（构建时自动拷贝最新 HTML）。

## 九、相关文件

- `agent-workbench.html` — 工坊本体（核心交付物；**源码态是骨架**：不含立绘 base64，且应用 JS 已外置到 `src/`，构建时由 `src-split.mjs` 拼回 + 回注立绘）
- `src/` — 应用源码（35 个模块 + `order.json`），由 `src-split.mjs` 与单文件 HTML 双向同步（`src:extract` / `src:inject` / `src:check`）
- `assets/pet/` — 萌宠立绘 PNG + 注入顺序 `order.json`（见 [docs/pet-system.md](docs/pet-system.md)）
- `启动Agent工坊.bat` — Edge 应用模式启动器
- `启动本地服务.bat` — 本地服务模式启动器（解决 AI 跨域）
- `electron/` — 桌面封装（见 [electron/README.md](electron/README.md)）

---

## 十、文档索引

| 文档 | 内容 |
|---|---|
| [docs/architecture-layers.md](docs/architecture-layers.md) | 单文件架构分层契约（改结构前必读） |
| [docs/pet-system.md](docs/pet-system.md) | 萌宠系统：角色 / 立绘外置与回注 / 五官标定 / 双风格 / 加新角色 |
| [docs/ai-tools.md](docs/ai-tools.md) | AI 工具（function-calling）接口与 Schema |
| [docs/ui-standards.md](docs/ui-standards.md) | UI 唯一权威规范（含规范⇄测试对照表） |
| [docs/product-scope.md](docs/product-scope.md) | 产品边界与已移除功能清单（防"死 UI 回潮"） |
| [docs/半成品功能完善路线图.md](docs/半成品功能完善路线图.md) | 半成品处置与收尾计划 |
| [docs/项目诊断报告-2026-08-17.md](docs/项目诊断报告-2026-08-17.md) | 历史诊断（病因与整改依据） |
| [CONTRIBUTING.md](CONTRIBUTING.md) | 开发环境 / 命令 / 提交与测试规范 |
| [CHANGELOG.md](CHANGELOG.md) | 变更记录 |

---

## 十一、开发与发布

**真相源分两处，各管一段**（顶部「源码态说明」是这一节的前提）：
- **CSS 与内联 JS**（`:root` 令牌、主题块、`save()` 等）直接演进于 `agent-workbench.html` —— 改这些就改 HTML。
- **应用 JS**（35 个模块）在 `src/*.js` 里演进，由 `scripts/src-split.mjs` 在**构建期**拼回 HTML；
  运行时仍是单个 `<script>`，不存在多文件加载（`file://` 下会失败）。
- 推送前用 `npm run verify:ci` 按 **CI 的真实步骤顺序**在本机预演一遍（从 `.github/workflows/*.yml` 读序列，不写死清单；`-- --job=verify --ci=.github/workflows/deploy.yml` 可预演发布链）。🔴 **本脚本的标志必须写在 `--` 之后**：`npm run verify:ci --with-e2e` 会被 npm 自己收作配置项（只 warn 一句 `Unknown cli config`），脚本收到的 argv 是空的 → e2e 那步**静默不跑**而其余十步照样全绿退出 0；现在脚本会检查 `npm_config_*` 并直接 exit 2。单个门禁各自跑绿 ≠ CI 绿：验证命令会改写 `agent-workbench.html`（`pre*` 注入 / `post*` 抽回），**上一步把目录留在哪种状态直接决定下一步的结论**——v3.7.59 补齐 post* 自愈钩子后，`pet:check`（要在拼装态才读得到 `_PET_ART`）就被前一步抽回源码态而长期 exit 1，逐个命令手跑完全看不出来。
- 提交的是**源码态**（HTML 只有标记、代码在 `src/`、立绘在 `assets/pet/` —— 两份文本都不含 base64）；本地要双击运行先跑 `npm run src:inject`，或直接双击 `启动Agent工坊.bat`（v3.7.58 起检测到源码态会自动拼回）。所有 `pre*` 注入钩子都配了自愈：`npm test` / `lint` / `lint:layers` / `test:coverage` / `build` / `build:check` / `build:prod` / `e2e` / `pet:check` 跑完由对应 `post*` 自动还原源码态，工作区不会因跑检查或跑发布构建而变脏。**v3.7.65 起不再有例外**：原先 `build` 与 `build:prod` 跑完故意留在拼回态（称其产物即完整交付物），但交付物实际落在独立的 `agent-workbench.prod.html` / `service-worker.prod.js` 里，真相源留在拼回态只会让工作区变脏并诱发误提交，故补齐两条 `post*` 钩子；需要完整单文件请用 `npm run src:inject` 显式获取。

```bash
npm ci
npm run build:check     # 版本一致性 + 真相源完整性门禁（提交前必跑）
npm test                # vitest 单测
npm run build:prod      # 产出 agent-workbench.prod.html + service-worker.prod.js
```

> **覆盖率口径**：`npm run test:coverage` 当前**恒为 0%**（单文件 HTML 无法插桩），已从 CI 移除，暂不纳入验收。

**立绘已外置（v3.7.0 起）**：9 张萌宠立绘移出 HTML，存在 `assets/pet/*.png`，由构建回注；v3.7.64 起 `src/` 侧也不再残留 base64（立绘数据在仓库里只以 PNG 存在）。

| 命令 | 作用 |
|---|---|
| `npm run pet:inject` | 把 `assets/pet/*.png` 回注进 HTML（幂等） |
| `npm run pet:extract` | 反向：从 HTML 抽出立绘到 `assets/pet/`，HTML 留标记占位 |
| `npm run pet:check` | 校验 assets 与 HTML 注入是否一致 |

- 源码态 HTML（约 607KB，无 base64、JS 与立绘均已外置）**不能直接当成品用**：立绘区会退化为 SVG 兜底 + 控制台告警。
  本地预览前先 `npm run pet:inject`；`npm test` / `npm run build:check` / `npm run build:prod`
  都挂了 `pre` 钩子会自动回注，CI 无需额外步骤。
- 改立绘 = 替换 `assets/pet/<kind>.png` → `npm run pet:inject`（顺序由 `assets/pet/order.json` 保持）。
- **抽取方向顺序固定**：`pet-art --extract` → `src-split --extract`（`npm run src:extract` 与所有 `post*` 钩子都已按此链好）。顺序反了会把 base64 抽进 `src/render-widgets.js`（v3.7.58~v3.7.63 的历史双存坑，`check:source-state` 现已拦）。
- 收益：立绘外置让源码 HTML 3.50MB → 2.34MB，JS 分层外置后再降到**约 607KB（35 个模块）**，`src/render-widgets.js` 也不再内联 base64（v3.7.64：1,149,465 → 279,851 字节，-869KB），编辑器与 diff 恢复可用；交付产物仍是**单个 HTML**（拼回 + 立绘回注后约 3.5MB）。

**分层源块已外置（v3.7.0 起 · 任务 4 第一步）**：`Util`（Markdown 解析、性能工具）与 `Crypto` 两个层块
先行抽到 `src/*.js`（合计约 36KB），HTML 内留标记占位，构建/测试前由 `scripts/src-split.mjs` 拼回；
此后五层全部外置，共 **35 个模块**。

| 命令 | 作用 |
|---|---|
| `npm run src:inject` | 把 `src/*.js` 拼回 HTML 并回注立绘（幂等；链 = `src-split` → `pet-art`） |
| `npm run src:extract` | 反向：回到源码态（链 = `pet-art --extract` → `src-split --extract`，与注入严格逆序；抽取前自动备份到 `_srcbackup/`） |
| `npm run src:check` | 校验 src 与 HTML 两侧标记齐全 |
| `npm run src:verify` | 与 git HEAD 比对，证明拼接是**代码零改动**（空白不敏感） |

- 与 `build.mjs`「不做 src→HTML 字节拼接」的定稿不冲突：那条讲的是**不做运行时多 `<script src>`**（file:// 会失败）；
  这里是**构建期回填**，交付物仍是单个 HTML。
- 空载态（只有占位、未拼回）**不能直接跑**：请先 `npm run src:inject`；所有 `pre*` 钩子都会自动拼回，CI 无需额外步骤。

**版本号五处必须一致**（`build:check` 会校验，不一致直接失败）：

| 位置 | 字段 |
|---|---|
| `agent-workbench.html` | `const VERSION` |
| `package.json` | `version` |
| `electron/package.json` | `version` |
| `manifest.json` | `version` |
| `README.md` | 标题 / 「当前版本」/ 页脚示例 |

发版请用 `npm run release <版本号>`（自动同步五处 + 锁文件根字段 + CHANGELOG）。
部署：`.github/workflows/deploy.yml` 在 push 到 `main` 时**先过门禁**（`verify` job：源码态 + 测试 + build:check + lint + 模块图）再执行 `build:prod` 发布到 GitHub Pages；`.github/workflows/ci.yml` 跑测试 / 门禁 / lint / 静态检查，**e2e 在 push 与 PR 都运行**（含渲染层对比度与跨视口布局硬断言），两个工作流都带 `concurrency`（连续 push 自动取消旧 run）。

> **改完主文件的自检清单**：`npm run build:check` 通过 → 页面无控制台报错 → PWA 资源（manifest 图标等）无 404。
