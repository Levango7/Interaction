# Changelog

本文件记录 Agent 工作台从 v1.0.0 起的所有变更，按 [Keep a Changelog](https://keepachangelog.com/) 风格组织，日期为 YYYY-MM-DD。

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
