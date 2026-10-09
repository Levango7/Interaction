# 分层源块依赖图（自动生成，勿手改）

> 由 `scripts/module-graph.mjs` 从 `src/*.js` 的**符号级引用**分析得出：
> 定义 = 块内顶格书写的 function/const/let/var/class；依赖 = 某块引用了恰好由另一块定义的符号。
> 块数 35（本文件由脚本生成；不含时间戳，避免每日无意义 diff）

## 1. 依赖矩阵（行依赖列）

| 块 \ 依赖 | 层 | 依赖的块 | 依赖符号数 |
|---|---|---|---|
| `core` | Core | — | 0 |
| `util-markdown` | Util | — | 0 |
| `util-perf` | Util | — | 0 |
| `crypto` | Crypto | — | 0 |
| `data-idb` | Data | `crypto` | 1 |
| `data-links` | Data | `core` `crypto` | 6 |
| `data-migrate` | Data | `data-links` | 2 |
| `data-rw` | Data | `core` `crypto` `data-links` | 7 |
| `chain` | Chain | `data-links` `util-markdown` | 2 |
| `ai-tools` | AI | `ai-retry` `chain` `core` `data-idb` `data-links` `data-rw` `util-markdown` | 22 |
| `ai-loop` | AI | `ai-tools` `chain` `core` `crypto` | 9 |
| `ai-retry` | AI | `ai-loop` `ai-tools` `core` `data-links` `util-perf` | 29 |
| `render-entry` | Render | `ai-retry` `ai-tools` `core` `data-links` `data-rw` `render-overview` `render-scene-main` `render-scene-sub` `render-widgets` `util-markdown` `util-perf` | 60 |
| `render-scene-sub` | Render | `core` `render-entry` `util-markdown` `util-perf` | 9 |
| `render-scene-main` | Render | `ai-retry` `ai-tools` `core` `data-idb` `data-links` `data-rw` `render-entry` `render-overview` `render-scene-sub` `util-markdown` `util-perf` | 28 |
| `render-overview` | Render | `ai-retry` `chain` `core` `data-links` `data-rw` `render-entry` `render-scene-sub` `render-widgets` `util-markdown` | 42 |
| `render-widgets` | Render | `chain` `core` `crypto` `data-links` `data-rw` `render-entry` `render-overview` `render-scene-main` `render-scene-sub` | 24 |
| `ui-theme` | UI | — | 0 |
| `ui-onboarding` | UI | `chain` `ui-daily` | 2 |
| `ui-guide` | UI | `crypto` `data-links` `render-entry` `render-scene-sub` `render-widgets` `util-perf` | 9 |
| `ui-scene-bind` | UI | `chain` `core` `data-idb` `data-links` `data-rw` `render-scene-main` `render-scene-sub` | 16 |
| `ui-palette` | UI | `ai-retry` `ai-tools` `data-links` `render-entry` `render-widgets` `ui-backup-stats` `ui-global-events` | 12 |
| `ui-daily` | UI | `chain` `core` `data-rw` | 5 |
| `ui-backup-stats` | UI | `chain` `core` `crypto` `data-idb` `data-links` `data-rw` `render-entry` `render-widgets` | 27 |
| `ui-drawer` | UI | `ai-retry` `crypto` `data-links` `data-migrate` `render-widgets` `ui-daily` `ui-ge-api` `ui-ge-theme` `ui-global-events` `ui-guide` `ui-theme` `util-markdown` | 46 |
| `ui-hotkeys` | UI | `ai-retry` `data-rw` `render-widgets` `ui-drawer` `ui-palette` `ui-scene-bind` | 8 |
| `ui-select` | UI | — | 0 |
| `ui-global-events` | UI | `ai-retry` `ai-tools` `core` `crypto` `data-idb` `data-links` `data-migrate` `data-rw` `render-entry` `render-scene-main` `render-widgets` `ui-backup-stats` `ui-daily` `ui-drawer` `ui-ge-api` `ui-ge-calendar` `ui-ge-integrations` `ui-ge-pomodoro` `ui-ge-theme` `ui-guide` `ui-onboarding` `ui-palette` `ui-theme` `util-perf` | 136 |
| `ui-ge-api` | UI | `core` `render-overview` `ui-drawer` | 4 |
| `ui-ge-plugins` | UI | `data-links` `util-markdown` | 2 |
| `ui-ge-theme` | UI | `chain` | 1 |
| `ui-ge-pomodoro` | UI | `chain` | 1 |
| `ui-ge-calendar` | UI | `chain` `render-overview` `ui-ge-theme` `ui-guide` | 21 |
| `ui-ge-notes` | UI | `core` `data-rw` `render-entry` `render-widgets` `util-markdown` | 14 |
| `ui-ge-integrations` | UI | `ai-loop` `ai-retry` `ai-tools` `chain` `core` `crypto` `data-idb` `data-links` `data-migrate` `data-rw` `render-entry` `render-overview` `render-scene-main` `render-scene-sub` `render-widgets` `ui-backup-stats` `ui-daily` `ui-drawer` `ui-ge-api` `ui-ge-calendar` `ui-ge-notes` `ui-ge-plugins` `ui-ge-pomodoro` `ui-ge-theme` `ui-global-events` `ui-guide` `ui-onboarding` `ui-palette` `ui-scene-bind` `util-markdown` | 473 |

## 2. 共享符号（扇出 ≥ 8 个块，不计入依赖边）

| 符号 | 定义于 | 被多少块使用 |
|---|---|---|
| `t` | `core` | 31 |
| `toast` | `core` | 28 |
| `AppBridge` | `core` | 23 |
| `sanitizeHtml` | `util-markdown` | 21 |
| `SCENARIOS` | `core` | 21 |
| `getCfg` | `data-links` | 18 |
| `ORDER` | `core` | 17 |
| `render` | `render-entry` | 16 |
| `getActiveTasks` | `data-rw` | 15 |
| `getTasks` | `data-rw` | 15 |
| `active` | `data-links` | 12 |
| `getRec` | `data-rw` | 12 |
| `UI_ICONS` | `core` | 10 |
| `setTasks` | `data-rw` | 10 |
| `setActive` | `data-links` | 10 |
| `getLinks` | `data-links` | 9 |
| `getActiveProfile` | `data-migrate` | 9 |

> 这些是事实上的"全局助手"。层间倒挂多由它们造成，若要继续解耦，优先从这里动手。

### Core 层出边（必须为 0 —— 核心层零外部依赖）

✓ core 无外部依赖

## 3. 校验结果

- 跨块重复定义：**0** 项
- 循环依赖：**13** 条（ai-tools → ai-retry → ai-tools；ai-tools → ai-retry → ai-loop → ai-tools；render-entry → render-overview → render-scene-sub → render-entry；render-entry → render-overview → render-entry；render-overview → render-widgets → render-overview）
- 逆层依赖（低层用高层符号）：**18** 条（按「块对」计）
- 逆层依赖（按**符号**计，去重）：**102** 个符号

| 从（层） | 到（层） | 涉及符号 |
|---|---|---|
| `ai-tools`（AI） | `ai-retry`（AI） | `CHAT_SUGGEST_HTML` `_msgTokens` |
| `render-entry`（Render） | `render-overview`（Render） | `renderAuthLogin` `renderAuthRegister` `renderAuthWelcome` `renderChainPage` `renderOverview` `renderStats` … |
| `render-entry`（Render） | `render-scene-main`（Render） | `_featureCardBind` `_hydrateRecImgs` `_miniBarSVG` `_miniLineSVG` `_miniPieSVG` `bindCodeFrontendCard` … |
| `render-entry`（Render） | `render-scene-sub`（Render） | `getHealthRecs` `parseNum` |
| `render-entry`（Render） | `render-widgets`（Render） | `_addDaysStr` `_bindDropImport` `_bindRecordTool` `_bindRecordToolRedirect` `_cadSession` `_csvParse` … |
| `render-overview`（Render） | `render-widgets`（Render） | `openChartStore` |
| `render-scene-main`（Render） | `render-overview`（Render） | `_renderDiagramCanvas` `_renderFinanceStats` `_renderHealthTrend` |
| `ui-drawer`（UI） | `ui-ge-api`（UI） | `getLang` |
| `ui-drawer`（UI） | `ui-ge-theme`（UI） | `createCustomTheme` `exportTheme` `getCurrentTheme` `getCustomThemes` `getScenarioColors` `importTheme` … |
| `ui-drawer`（UI） | `ui-global-events`（UI） | `updateAgentStatus` |
| `ui-global-events`（UI） | `ui-ge-api`（UI） | `setLang` |
| `ui-global-events`（UI） | `ui-ge-calendar`（UI） | `closeDashboardModal` `closeGanttModal` `closeMindmapModal` `openDashboardModal` `openGanttModal` `openMindmapModal` … |
| `ui-global-events`（UI） | `ui-ge-integrations`（UI） | `INTEGRATION_TYPES` `_notifyScrubPersisted` `calendarDisconnect` `githubGistId` `githubHasToken` `githubTokenClear` … |
| `ui-global-events`（UI） | `ui-ge-pomodoro`（UI） | `pauseTracking` `startPomodoro` `stopPomodoro` `stopTracking` |
| `ui-global-events`（UI） | `ui-ge-theme`（UI） | `getCurrentTheme` `setTheme` |
| `ui-onboarding`（UI） | `ui-daily`（UI） | `dailyDigest` |
| `ui-palette`（UI） | `ui-backup-stats`（UI） | `doClear` `doExportCSV` `doExportMD` |
| `ui-palette`（UI） | `ui-global-events`（UI） | `showMemories` |

> 逆层依赖多为"低层回调/工具被高层注入"的历史耦合，不必然错误；基线策略只拦**新增**项。
