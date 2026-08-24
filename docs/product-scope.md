# 产品边界与已移除功能清单（Product Scope）

> 本文件作为"功能范围护栏"，防止已移除功能以死 UI / stub / 文档残留的形式回潮。
> 维护原则：**凡新增/移除功能，必须同步更新本清单与 README**（三处一致：README / CHANGELOG / 本文件）。

---

## 一、产品定位（一句话）

> **面向个人用户（自己 / 开发者 / 知识工作者）的本地优先任务工作台——AI 不只是聊天，而是能真正动手创建 / 修改 / 完成任务与资料。**

核心约束：
- 单文件 HTML + 纯本地存储（localStorage），**无后端服务器、无账号体系**
- 三种运行形态共用同一份 `agent-workbench.html`（Edge 应用 / 本地服务 / Electron）

---

## 二、范围内功能（v1.14 之后保留）

| 模块 | 状态 | 说明 |
|---|---|---|
| 6 场景任务看板 | ✅ 核心 | 办公 / 数据 / 设计 / 学习 / 编程 / 生活，待办/进行中/已完成 |
| 场景资料库 | ✅ 核心 | 会议纪要 / 代码片段 / 学习资料 / 生活备忘 |
| AI 助手（16 工具） | ✅ 核心 | function-calling 增删改查，Key AES-GCM 加密 |
| Agent 能力 | ✅ 核心 | 工作记忆 / 多步目标 / 跨场景协调 |
| 习惯链 | ✅ 核心 | 跨场景联动 + streak + 热力图 |
| SM-2 间隔复习 | ✅ 场景工具 | 学习场景 |
| 周报生成器 | ✅ 场景工具 | 办公/编程场景 |
| 插件市场（健康助手） | ✅ 可选插件 | 默认关闭 |
| 数据管理 | ✅ 核心 | 导出/导入/自动备份/回收站 |
| 消息中心 | ✅ 系统 | 站内通知（顶栏） |

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

### 🟡 代码仅留占位，入口已关（观察期后清理）

| 功能 | 现状 | 说明 |
|---|---|---|
| 工作流引擎 / 自动化规则 / Webhook 总线 | 已归档（`2321ec3`），入口冻结 | 代码中 `wfEvalCondition` 等恢复为可执行但无 UI 入口；调用点残留已清理（`_wfWireInjectors`/`startCronScheduler` 死引用已删） |
| 语音助手 | 已归档，UI 无入口 | 帮助文档相关条目已删 |
| 企业协作 / CRDT / Capacitor / RBAC / SSO | 已归档（`892a1da`） | 无 UI 残留 |

---

## 四、死 UI 检测规范（防回潮）

**每次改动 UI 后，自查三条：**

1. **按钮有绑定**：设置页 / 顶栏 / 侧栏每个 `<button id="...">` 必须有对应 `.onclick` 或事件委托分支。新增按钮时同步加绑定，否则视为 bug。
   - 已发现并修复的历史案例：日历按钮、自动化按钮、番茄钟/计时按钮、空态"新建任务"按钮、生物识别按钮、图片附件（均曾"点了没反应"）。
2. **stub 无 UI 引用**：删除模块时，保留的 stub 若被 UI 引用（按钮 / 开关 / 表单），必须同步移除 UI 或改为"已停用"提示——**stub + 活 UI = 虚假功能**。
3. **文档与代码一致**：帮助文档中出现的每个功能入口，必须在代码中有对应实现；README 宣称的每个功能，必须能在 UI 找到。

---

## 五、图标 / 文案规范

- **禁止彩色 emoji** 出现在 UI 文案（已清零）。统一用 `UI_ICONS` 2px 线性 SVG，模板内用 `${ic("name")}` 注入。
- 移除功能时同步更新：README 特性列表 / 帮助文档（`renderHelp` 里的 `helpSection`）/ 本清单。
