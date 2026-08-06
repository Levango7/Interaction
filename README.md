# Agent 工作台（v1.1.4）

一个跑在 Windows 上的**套壳 Agent 工作台**：把办公 / 编程 / 学习 / 生活四类场景收拢进一个原生窗口，每个场景是一个 subagent 面板，可本地使用，也可接入 LLM 让 subagent 真正"动手"操作数据。

零安装、单文件、纯本地；数据存本机浏览器，不依赖任何后端服务器。

> **线上体验**：<https://levango7.github.io/Interaction/>（PWA，可安装到桌面/手机，离线可用）

---

## 一、三种运行形态（共用同一份 HTML，不会版本漂移）

| 形态 | 启动方式 | 适用 | 桌面能力 |
|---|---|---|---|
| **Edge 应用模式** | 双击 `启动Agent工作台.bat` | 零安装、最常用 | 无托盘/自启 |
| **本地服务模式** | 双击 `启动本地服务.bat` | 需启用 AI 且避开 CORS | 无托盘/自启 |
| **Electron exe** | `electron/` 目录打包 | 真·独立应用 | 托盘 + 开机自启 |

> 三处都加载同一个 `agent-workbench.html`，改一处全生效。

---

## 二、核心特性

- **4 个场景 subagent**：办公 / 编程 / 学习 / 生活，左侧导航一键切换——覆盖知识工作主线 + 日常事务兜底，无娱乐等无关干扰项。
- **顶部「今天要处理」**：所有场景带截止日期的任务自动汇总、逾期标红 + 一键完成；昨天没做完的自动顺延。
- **每场景两个基础模块**：任务看板（待办 / 进行中 / 已完成，按钮移动）+ 场景专属资料库（办公→会议纪要、编程→代码片段、学习→学习资料、生活→生活备忘）。
- **场景细分工具**：周报生成器（办公/编程，自动汇总本周已完成任务）、SM-2 间隔复习（学习，遗忘曲线驱动的复习计划）。
- **数据总览**：近 14 天完成趋势折线图 + 本月日历热力图 + 各场景进度条；顶部全局搜索跨场景检索。
- **AI 接入（可选）**：设置里填 API Key（兼容 OpenAI 格式，DeepSeek / 通义 / 豆包 等均可），每个场景的 AI 助手可**调用工具**真正创建/修改/删除任务、查询/搜索/添加资料/导出。
- **Agent 能力（默认开启，设置可关）**：在 AI 工具之上扩展三层自主能力——
  - **工作记忆**：助手可用 `remember`/`recall`/`forget` 工具沉淀用户偏好与决定，按场景隔离、近期+命中加权召回、自动注入对话上下文（也可对我说「记住：xxx」直接写入）；最多 60 条环形截断。
  - **多步目标编排**：`plan` 工具把一句话目标拆成有序步骤，激活后对话循环上限由 6 轮放宽至 12 轮，助手逐步执行并用 `complete_step`/`complete_goal` 推进与收尾（单目标聚焦，新目标自动顶替旧的）。
  - **跨场景协调**：`list_records` 工具查任意场景资料库，目标步骤可跨场景调用既有工具。设置抽屉与命令面板（Ctrl/Cmd+K）提供记忆/目标管理入口。
- **场景联动（习惯链）**：任务完成时按规则跨场景自动生成奖励/后续任务，形成"习惯链"：
  - 办公(交付) → 学习(看技术视频)
  - 学习(复习) → 编程(写小项目)
  - 编程(上线) → 生活(犒劳自己)
  - 可自定义开关，链路完成情况在习惯链面板可视化（streak 计算 + GitHub 风格热力图 + 链条动画）。
- **机制**：暗色模式、命令面板（Ctrl/Cmd+K）、每日播报、任务标签、Toast 通知、快捷键。
- **数据安全**：导出 / 导入 / 清空（清空二次确认）统一收进设置抽屉「数据管理」；累计 30 条顶部提示备份；顶栏只保留指南/命令/主题/设置四枚主按钮。
- **响应式布局**：4 断点全分辨率适配——
  - 移动端 `<768px`：底部 Tab 导航，按钮 ≥44px、输入框 ≥16px，适配 iPhone 安全区；
  - 平板 `768–1024px`：侧边栏可折叠为图标态；
  - 小屏 PC `1024–1440px`：默认展开侧边栏；
  - 大屏 PC `>1440px`：内容区限宽居中，多列布局。
  - 侧边栏在 ≥1024px 时可手动折叠/展开，<1024px 自动收为底部 Tab。
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
│  └─ 交互层   (命令面板 / 快捷键 / Toast / 联动)  │
└───────────────────┬─────────────────────────┘
                    │ window.electronAPI（仅桌面端存在）
┌───────────────────┴─────────────────────────┐
│      electron/  (main.js + preload.js)        │  ← 桌面封装
│  BrowserWindow · Tray(内联图标) · 开机自启(IPC) │
│  单实例锁 · AppUserModelId · 窗口图标           │
└─────────────────────────────────────────────┘
```

**前后端交互契约（已核对一致）**

| 页面调用 | preload 暴露 | 主进程句柄 |
|---|---|---|
| `electronAPI.getAutoLaunch()` | `ipcRenderer.invoke` | `ipcMain.handle("get-auto-launch")` |
| `electronAPI.setAutoLaunch(on)` | `ipcRenderer.send` | `ipcMain.on("set-auto-launch")` |
| `electronAPI.platform / version / isPackaged` | `contextBridge` 静态值 | — |

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
3. Key **仅存本机浏览器**（`wb_agent_cfg`，AES-GCM 加密），不上传任何服务器。
   - **威胁模型（诚实说明）**：浏览器形态下加密用的设备密钥与密文同存 localStorage，属**混淆级防护**——防随手翻看，不防本机恶意进程读取。需要操作系统级保护（Windows DPAPI）请用 Electron 版，Key 由主进程 `safeStorage` 加密保管，不进渲染进程。
4. **跨域**：从 `file://` 直接调 API 可能被浏览器 CORS 拦截。最稳妥用 **`启动本地服务.bat`**（`http://localhost:8123`）打开再启用 AI。

---

## 五、快捷键

`1` 办公 · `2` 编程 · `3` 学习 · `4` 生活（1-4 切场景）· `G` 总览 · `N` 聚焦新建任务 · `Ctrl/Cmd+K` 命令面板。

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
- **隐私边界**：部署/分享只涉及文件本身；数据在用户本机，不在服务器。不要在工作台里预填真实敏感信息后再把文件发给他人。
- **AI 工具**：调用真实改写同一份 localStorage，AI 操作与手动操作等价；工具定位任务靠标题关键词，重名时取第一条。
- **无账号体系**：靠导出 / 导入迁移数据（单人使用场景）。

---

## 八、版本

当前版本 **v1.1.4**（与 `electron/package.json` 的 `version` 一致）。变更记录见 [CHANGELOG.md](CHANGELOG.md) 与代码内 `VERSION` 常量。

## 相关文件

- `agent-workbench.html` — 工作台本体（核心交付物）
- `启动Agent工作台.bat` — Edge 应用模式启动器
- `启动本地服务.bat` — 本地服务模式启动器（解决 AI 跨域）
- `electron/` — 桌面封装（见 [electron/README.md](electron/README.md)）
