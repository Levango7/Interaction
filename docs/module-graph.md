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
| `crypto` | Crypto | `data-idb` | 2 |
| `data-idb` | Data | — | 0 |
| `data-links` | Data | `core` `crypto` `render-scene-main` `ui-ge-plugins` | 8 |
| `data-migrate` | Data | `data-links` | 2 |
| `data-rw` | Data | `core` `crypto` `data-links` | 6 |
| `chain` | Chain | `data-links` `util-markdown` | 2 |
| `ai-tools` | AI | `ai-retry` `chain` `core` `data-idb` `data-links` `data-rw` `ui-ge-notes` | 18 |
| `ai-loop` | AI | `ai-retry` `ai-tools` `chain` `core` `crypto` | 9 |
| `ai-retry` | AI | `ai-loop` `ai-tools` `core` `data-links` `util-markdown` `util-perf` | 25 |
| `render-entry` | Render | `ai-retry` `core` `data-links` `render-overview` `render-scene-main` `render-widgets` `ui-daily` `ui-drawer` | 30 |
| `render-scene-sub` | Render | `render-scene-main` `render-widgets` `ui-scene-bind` `util-markdown` `util-perf` | 11 |
| `render-scene-main` | Render | `ai-retry` `ai-tools` `core` `data-idb` `data-links` `data-rw` `render-overview` `render-scene-sub` `render-widgets` `ui-ge-calendar` `util-markdown` `util-perf` | 28 |
| `render-overview` | Render | `ai-retry` `chain` `core` `data-links` `data-rw` `render-entry` `render-scene-main` `render-scene-sub` `render-widgets` `ui-backup-stats` `ui-drawer` `ui-ge-calendar` `ui-ge-notes` `ui-ge-plugins` `ui-ge-theme` `ui-global-events` `ui-scene-bind` `util-markdown` | 58 |
| `render-widgets` | Render | `ai-tools` `chain` `core` `crypto` `data-links` `data-rw` `render-entry` `render-overview` `render-scene-main` `render-scene-sub` `ui-drawer` `ui-ge-calendar` `ui-ge-notes` `ui-ge-plugins` `ui-ge-theme` `ui-guide` `util-markdown` `util-perf` | 33 |
| `ui-theme` | UI | — | 0 |
| `ui-onboarding` | UI | `chain` `ui-backup-stats` `ui-daily` `ui-drawer` | 4 |
| `ui-guide` | UI | `crypto` `data-links` `render-entry` `render-scene-sub` `render-widgets` `ui-drawer` `util-perf` | 10 |
| `ui-scene-bind` | UI | `chain` `core` `data-idb` `data-links` `data-rw` `render-scene-main` `render-scene-sub` `ui-backup-stats` `ui-ge-calendar` | 18 |
| `ui-palette` | UI | `ai-retry` `ai-tools` `data-links` `render-widgets` `ui-backup-stats` `ui-drawer` `ui-global-events` | 14 |
| `ui-daily` | UI | `chain` `core` | 2 |
| `ui-backup-stats` | UI | `chain` `core` `crypto` `data-idb` `data-links` `data-rw` `render-widgets` | 20 |
| `ui-drawer` | UI | `ai-retry` `crypto` `data-links` `data-migrate` `render-widgets` `ui-daily` `ui-ge-api` `ui-ge-notes` `ui-ge-plugins` `ui-ge-theme` `ui-global-events` `ui-guide` `ui-theme` `util-markdown` | 56 |
| `ui-hotkeys` | UI | `ai-retry` `data-rw` `render-widgets` `ui-drawer` `ui-palette` `ui-scene-bind` | 8 |
| `ui-select` | UI | — | 0 |
| `ui-global-events` | UI | `ai-loop` `ai-retry` `ai-tools` `chain` `core` `crypto` `data-idb` `data-links` `data-migrate` `data-rw` `render-overview` `render-scene-main` `render-scene-sub` `render-widgets` `ui-backup-stats` `ui-daily` `ui-drawer` `ui-ge-api` `ui-ge-calendar` `ui-ge-integrations` `ui-ge-notes` `ui-ge-plugins` `ui-ge-pomodoro` `ui-ge-theme` `ui-guide` `ui-onboarding` `ui-palette` `ui-scene-bind` `ui-theme` `util-markdown` `util-perf` | 506 |
| `ui-ge-api` | UI | `core` `render-overview` `ui-drawer` | 4 |
| `ui-ge-plugins` | UI | `data-links` `render-widgets` `util-markdown` | 4 |
| `ui-ge-theme` | UI | `chain` | 1 |
| `ui-ge-pomodoro` | UI | `chain` | 1 |
| `ui-ge-calendar` | UI | `chain` `render-overview` `ui-ge-theme` `ui-guide` | 21 |
| `ui-ge-notes` | UI | `core` `render-widgets` `util-markdown` | 6 |
| `ui-ge-integrations` | UI | `core` `crypto` | 2 |

## 2. 共享符号（扇出 ≥ 8 个块，不计入依赖边）

| 符号 | 定义于 | 被多少块使用 |
|---|---|---|
| `t` | `core` | 30 |
| `toast` | `core` | 26 |
| `SCENARIOS` | `core` | 21 |
| `sanitizeHtml` | `util-markdown` | 19 |
| `render` | `render-entry` | 16 |
| `ORDER` | `core` | 16 |
| `getCfg` | `data-links` | 16 |
| `AppBridge` | `core` | 14 |
| `getActiveTasks` | `data-rw` | 14 |
| `getTasks` | `data-rw` | 13 |
| `getRec` | `data-rw` | 13 |
| `active` | `data-links` | 12 |
| `setTasks` | `data-rw` | 10 |
| `UI_ICONS` | `core` | 9 |
| `setActive` | `data-links` | 9 |
| `getLinks` | `data-links` | 8 |
| `getActiveProfile` | `data-migrate` | 8 |

> 这些是事实上的"全局助手"。层间倒挂多由它们造成，若要继续解耦，优先从这里动手。

### Core 层出边（必须为 0 —— 核心层零外部依赖）

✓ core 无外部依赖

## 3. 校验结果

- 跨块重复定义：**0** 项
- 循环依赖：**50** 条（data-links → ui-ge-plugins → render-widgets → ui-ge-calendar → chain → data-links；data-links → ui-ge-plugins → render-widgets → ui-ge-calendar → render-overview → render-scene-sub → ui-scene-bind → ui-backup-stats → data-links；data-links → ui-ge-plugins → render-widgets → ui-ge-calendar → render-overview → render-scene-sub → ui-scene-bind → ui-backup-stats → data-rw → data-links；render-widgets → ui-ge-calendar → render-overview → render-scene-sub → ui-scene-bind → ui-backup-stats → render-widgets；ui-ge-calendar → render-overview → render-scene-sub → ui-scene-bind → ui-ge-calendar）
- 逆层依赖（低层用高层符号）：**53** 条（按「块对」计）
- 逆层依赖（按**符号**计，去重）：**207** 个符号

| 从（层） | 到（层） | 涉及符号 |
|---|---|---|
| `ai-loop`（AI） | `ai-retry`（AI） | `renderChat` `scrollChat` `trimChatHist` |
| `ai-tools`（AI） | `ai-retry`（AI） | `_estTokens` `lastChatRequest` `pendingConfirm` |
| `ai-tools`（AI） | `ui-ge-notes`（UI） | `createNote` `getNotes` |
| `crypto`（Crypto） | `data-idb`（Data） | `idbMirrorKey` `idbReadKey` |
| `data-links`（Data） | `render-scene-main`（Render） | `SCENE_FEATURE_RENDER` |
| `data-links`（Data） | `ui-ge-plugins`（UI） | `getPluginScenarios` |
| `render-entry`（Render） | `render-overview`（Render） | `renderAuthLogin` `renderAuthRegister` `renderAuthWelcome` `renderChainPage` `renderOverview` `renderStats` … |
| `render-entry`（Render） | `render-scene-main`（Render） | `_featureCardBind` `_hydrateRecImgs` `bindCodeFrontendCard` `bindCodeRunnerCard` `bindCodeSqlCard` `bindMeetingActionCard` … |
| `render-entry`（Render） | `render-widgets`（Render） | `openRecycle` `openToolStub` `renderSide` |
| `render-entry`（Render） | `ui-daily`（UI） | `snoozeTask` |
| `render-entry`（Render） | `ui-drawer`（UI） | `_moveDrawerHome` |
| `render-overview`（Render） | `render-widgets`（Render） | `SIDE_MENU_ICONS` `TOOL_APPS` `_priWeight` `lineChartSVG` `openAlarmModal` `openChartStore` … |
| `render-overview`（Render） | `ui-backup-stats`（UI） | `getDeviceId` |
| `render-overview`（Render） | `ui-drawer`（UI） | `openTemplateModal` `registerPluginFromJson` |
| `render-overview`（Render） | `ui-ge-calendar`（UI） | `_bindDashToolbar` `bindCalendarEvents` `bindDashboardDnD` `openDashboardModal` `openGanttModal` `openMindmapModal` … |
| `render-overview`（Render） | `ui-ge-notes`（UI） | `createNote` `getNotes` `openKnowledgeBaseModal` `openNotesModal` |
| `render-overview`（Render） | `ui-ge-plugins`（UI） | `BUILTIN_PLUGINS` `getAllPlugins` `getEnabledPlugins` `getPlugin` `loadPlugin` `setPluginEnabled` … |
| `render-overview`（Render） | `ui-ge-theme`（UI） | `bindReportModal` `openReportModal` |
| `render-overview`（Render） | `ui-global-events`（UI） | `toggleToolPop` |
| `render-overview`（Render） | `ui-scene-bind`（UI） | `openTaskEdit` |
| `render-scene-main`（Render） | `render-overview`（Render） | `_renderDiagramCanvas` `_renderFinanceStats` `_renderHealthTrend` |
| `render-scene-main`（Render） | `render-widgets`（Render） | `TOOL_APPS` `lineChartSVG` `renderEmpty` |
| `render-scene-main`（Render） | `ui-ge-calendar`（UI） | `renderCalendarView` |
| `render-scene-sub`（Render） | `render-scene-main`（Render） | `renderMiniChart` |
| `render-scene-sub`（Render） | `render-widgets`（Render） | `thisWeekDone` `weekRange` |
| `render-scene-sub`（Render） | `ui-scene-bind`（UI） | `bindReportCard` `bindReviewCard` |
| `render-widgets`（Render） | `ui-drawer`（UI） | `closeDrawer` `openTemplateModal` |
| `render-widgets`（Render） | `ui-ge-calendar`（UI） | `openMindmapModal` `renderCalendarView` |
| `render-widgets`（Render） | `ui-ge-notes`（UI） | `getNotes` `openKnowledgeBaseModal` `openNotesModal` `saveNotes` |
| `render-widgets`（Render） | `ui-ge-plugins`（UI） | `_plugins` `setPluginConfig` `setPluginEnabled` |
| `render-widgets`（Render） | `ui-ge-theme`（UI） | `openReportModal` |
| `render-widgets`（Render） | `ui-guide`（UI） | `renderHelp` |
| `ui-drawer`（UI） | `ui-ge-api`（UI） | `getLang` |
| `ui-drawer`（UI） | `ui-ge-notes`（UI） | `closeKnowledgeBaseModal` `closeNoteEditorModal` `closeNotesModal` `closeSearchModal` `executeSearch` `openKnowledgeBaseModal` … |
| `ui-drawer`（UI） | `ui-ge-plugins`（UI） | `getAllPlugins` `getPlugin` `getPluginScenarios` `registerPlugin` `setPluginConfig` `setPluginEnabled` … |
| `ui-drawer`（UI） | `ui-ge-theme`（UI） | `createCustomTheme` `deleteCustomTheme` `exportTheme` `getCurrentTheme` `getCustomThemes` `getScenarioColors` … |
| `ui-drawer`（UI） | `ui-global-events`（UI） | `updateAgentStatus` |
| `ui-global-events`（UI） | `ui-ge-api`（UI） | `applyI18n` `getLang` `initI18n` `setLang` |
| `ui-global-events`（UI） | `ui-ge-calendar`（UI） | `DASHBOARD_WIDGETS` `bindCalendarEvents` `bindDashboardDnD` `closeDashboardModal` `closeGanttModal` `closeMindmapModal` … |
| `ui-global-events`（UI） | `ui-ge-integrations`（UI） | `INTEGRATION_PROVIDERS_KEY` `INTEGRATION_SYNC_STATE_KEY` `INTEGRATION_TYPES` `_intFindLocalId` `_intGetSyncState` `_intLoadProviders` … |
| `ui-global-events`（UI） | `ui-ge-notes`（UI） | `NOTES_STORAGE_KEY` `closeKnowledgeBaseModal` `closeNoteEditorModal` `closeNotesModal` `closeSearchModal` `createNote` … |
| `ui-global-events`（UI） | `ui-ge-plugins`（UI） | `BUILTIN_PLUGINS` `_loadPluginsState` `_plugins` `_resetPlugins` `_savePluginsState` `getAllPlugins` … |
| `ui-global-events`（UI） | `ui-ge-pomodoro`（UI） | `POMO_BREAK_MIN` `POMO_FOCUS_MIN` `_pomoState` `_tracker` `getPomoCount` `getPomoState` … |
| `ui-global-events`（UI） | `ui-ge-theme`（UI） | `PRESET_THEMES` `SEPIA_TOKENS` `_applyScenarioColors` `_rangeCustom` `_rangeMonth` `_rangeWeek` … |
| `ui-guide`（UI） | `ui-drawer`（UI） | `_moveDrawerHome` |
| `ui-onboarding`（UI） | `ui-backup-stats`（UI） | `checkCount` |
| `ui-onboarding`（UI） | `ui-daily`（UI） | `dailyDigest` |
| `ui-onboarding`（UI） | `ui-drawer`（UI） | `openDrawer` |
| `ui-palette`（UI） | `ui-backup-stats`（UI） | `doClear` `doExportCSV` `doExportMD` |
| `ui-palette`（UI） | `ui-drawer`（UI） | `openAiPage` `openDrawer` |
| `ui-palette`（UI） | `ui-global-events`（UI） | `showMemories` |
| `ui-scene-bind`（UI） | `ui-backup-stats`（UI） | `checkCount` |
| `ui-scene-bind`（UI） | `ui-ge-calendar`（UI） | `bindCalendarEvents` |

> 逆层依赖多为"低层回调/工具被高层注入"的历史耦合，不必然错误；基线策略只拦**新增**项。
