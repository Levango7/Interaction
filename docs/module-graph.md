# 分层源块依赖图（自动生成，勿手改）

> 由 `scripts/module-graph.mjs` 从 `src/*.js` 的**符号级引用**分析得出：
> 定义 = 块内顶格书写的 function/const/let/var/class；依赖 = 某块引用了恰好由另一块定义的符号。
> 块数 27（本文件由脚本生成；不含时间戳，避免每日无意义 diff）

## 1. 依赖矩阵（行依赖列）

| 块 \ 依赖 | 层 | 依赖的块 | 依赖符号数 |
|---|---|---|---|
| `core` | Core | — | 0 |
| `util-markdown` | Util | — | 0 |
| `util-perf` | Util | `render-entry` | 1 |
| `crypto` | Crypto | `core` `data-idb` | 4 |
| `data-idb` | Data | — | 0 |
| `data-links` | Data | `ai-retry` `core` `crypto` `data-rw` `render-scene-main` `render-widgets` `ui-theme` | 13 |
| `data-migrate` | Data | `core` `data-links` `ui-backup-stats` | 6 |
| `data-rw` | Data | `chain` `core` `crypto` `data-links` `ui-backup-stats` | 8 |
| `chain` | Chain | `core` `data-links` `data-migrate` `data-rw` | 10 |
| `ai-tools` | AI | `ai-retry` `chain` `core` `data-links` `data-rw` | 15 |
| `ai-loop` | AI | `ai-retry` `ai-tools` `chain` `core` `crypto` `data-links` `data-migrate` `data-rw` | 17 |
| `ai-retry` | AI | `ai-loop` `ai-tools` `core` `data-links` `util-perf` | 20 |
| `render-entry` | Render | `ai-retry` `core` `data-links` `data-migrate` `data-rw` `render-overview` `render-scene-main` `render-widgets` `ui-daily` `ui-drawer` `ui-scene-bind` | 42 |
| `render-scene-sub` | Render | `core` `data-rw` `render-entry` `render-scene-main` `render-widgets` `ui-scene-bind` `util-perf` | 15 |
| `render-scene-main` | Render | `ai-retry` `core` `data-idb` `data-links` `data-rw` `render-entry` `render-overview` `render-scene-sub` `render-widgets` `ui-theme` `util-perf` | 32 |
| `render-overview` | Render | `ai-retry` `chain` `core` `data-links` `data-rw` `render-entry` `render-scene-main` `render-scene-sub` `render-widgets` `ui-backup-stats` `ui-drawer` `ui-global-events` `ui-scene-bind` | 42 |
| `render-widgets` | Render | `core` `crypto` `data-links` `data-rw` `render-entry` `render-overview` `ui-drawer` `ui-guide` `util-perf` | 25 |
| `ui-theme` | UI | `core` `data-links` | 4 |
| `ui-onboarding` | UI | `chain` `core` `data-rw` `render-entry` `ui-backup-stats` `ui-daily` `ui-drawer` | 11 |
| `ui-guide` | UI | `core` `crypto` `data-links` `data-rw` `render-entry` `render-scene-sub` `render-widgets` `ui-drawer` `util-perf` | 14 |
| `ui-scene-bind` | UI | `chain` `core` `data-idb` `data-links` `data-rw` `render-entry` `render-scene-main` `render-scene-sub` `ui-backup-stats` | 26 |
| `ui-palette` | UI | `ai-tools` `core` `data-links` `data-rw` `render-entry` `render-widgets` `ui-backup-stats` `ui-drawer` `ui-global-events` | 16 |
| `ui-daily` | UI | `chain` `core` `data-links` `data-rw` | 8 |
| `ui-backup-stats` | UI | `chain` `core` `crypto` `data-idb` `data-links` `data-migrate` `data-rw` `render-entry` | 28 |
| `ui-drawer` | UI | `ai-retry` `core` `crypto` `data-links` `data-migrate` `data-rw` `render-entry` `render-widgets` `ui-daily` `ui-global-events` `ui-guide` `ui-theme` | 42 |
| `ui-hotkeys` | UI | `ai-retry` `core` `data-links` `data-rw` `render-entry` `render-widgets` `ui-drawer` `ui-palette` `ui-scene-bind` | 13 |
| `ui-global-events` | UI | `ai-retry` `ai-tools` `chain` `core` `crypto` `data-idb` `data-links` `data-migrate` `data-rw` `render-entry` `render-overview` `render-scene-main` `render-widgets` `ui-backup-stats` `ui-daily` `ui-drawer` `ui-guide` `ui-palette` `ui-theme` `util-perf` | 111 |

## 2. 共享符号（扇出 ≥ 999 个块，不计入依赖边）

（无）

### Core 层出边（必须为 0 —— 核心层零外部依赖）

✓ core 无外部依赖

## 3. 校验结果

- 跨块重复定义：**0** 项
- 循环依赖：**57** 条（data-links → ui-theme → data-links；util-perf → render-entry → data-links → render-scene-main → util-perf；data-links → render-scene-main → data-rw → data-links；data-rw → chain → data-rw；data-links → render-scene-main → data-rw → chain → data-links）
- 逆层依赖（低层用高层符号）：**40** 条（按「块对」计）
- 逆层依赖（按**符号**计，去重）：**68** 个符号

| 从（层） | 到（层） | 涉及符号 |
|---|---|---|
| `ai-loop`（AI） | `ai-retry`（AI） | `renderChat` `scrollChat` `trimChatHist` |
| `ai-tools`（AI） | `ai-retry`（AI） | `pendingConfirm` |
| `crypto`（Crypto） | `data-idb`（Data） | `idbMirrorKey` `idbReadKey` |
| `data-links`（Data） | `ai-retry`（AI） | `_chatContentToText` |
| `data-links`（Data） | `data-rw`（Data） | `getTasks` |
| `data-links`（Data） | `render-scene-main`（Render） | `SCENE_FEATURE_RENDER` |
| `data-links`（Data） | `render-widgets`（Render） | `_sideActive` |
| `data-links`（Data） | `ui-theme`（UI） | `SCENE_FEATURES` |
| `data-migrate`（Data） | `ui-backup-stats`（UI） | `allKeys` |
| `data-rw`（Data） | `chain`（Chain） | `completeTask` |
| `data-rw`（Data） | `ui-backup-stats`（UI） | `allKeys` |
| `render-entry`（Render） | `render-overview`（Render） | `renderAuthLogin` `renderAuthRegister` `renderAuthWelcome` `renderChainPage` `renderOverview` `renderStats` … |
| `render-entry`（Render） | `render-scene-main`（Render） | `_featureCardBind` `_hydrateRecImgs` `bindCodeFrontendCard` `bindCodeRunnerCard` `bindCodeSqlCard` `bindMeetingActionCard` … |
| `render-entry`（Render） | `render-widgets`（Render） | `openRecycle` `renderSide` |
| `render-entry`（Render） | `ui-daily`（UI） | `snoozeTask` |
| `render-entry`（Render） | `ui-drawer`（UI） | `_moveDrawerHome` |
| `render-entry`（Render） | `ui-scene-bind`（UI） | `bindScenario` `setupKanbanDnD` `setupKanbanKeyboard` |
| `render-overview`（Render） | `render-widgets`（Render） | `SIDE_MENU_ICONS` `TOOL_APPS` `lineChartSVG` `openChartStore` |
| `render-overview`（Render） | `ui-backup-stats`（UI） | `allKeys` |
| `render-overview`（Render） | `ui-drawer`（UI） | `openTemplateModal` `registerPluginFromJson` |
| `render-overview`（Render） | `ui-global-events`（UI） | `_switchSetTab` `getAiConfig` `saveAiConfig` `toggleToolPop` |
| `render-overview`（Render） | `ui-scene-bind`（UI） | `openTaskEdit` |
| `render-scene-main`（Render） | `render-overview`（Render） | `_renderDiagramCanvas` `_renderFinanceStats` `_renderHealthTrend` |
| `render-scene-main`（Render） | `render-widgets`（Render） | `TOOL_APPS` `lineChartSVG` |
| `render-scene-main`（Render） | `ui-theme`（UI） | `SCENE_FEATURES` |
| `render-scene-sub`（Render） | `render-scene-main`（Render） | `renderMiniChart` |
| `render-scene-sub`（Render） | `render-widgets`（Render） | `thisWeekDone` `weekRange` |
| `render-scene-sub`（Render） | `ui-scene-bind`（UI） | `bindReportCard` `bindReviewCard` |
| `render-widgets`（Render） | `ui-drawer`（UI） | `closeDrawer` `openTemplateModal` |
| `render-widgets`（Render） | `ui-guide`（UI） | `renderHelp` |
| `ui-drawer`（UI） | `ui-global-events`（UI） | `updateAgentStatus` |
| `ui-guide`（UI） | `ui-drawer`（UI） | `_moveDrawerHome` |
| `ui-onboarding`（UI） | `ui-backup-stats`（UI） | `checkCount` |
| `ui-onboarding`（UI） | `ui-daily`（UI） | `dailyDigest` |
| `ui-onboarding`（UI） | `ui-drawer`（UI） | `openDrawer` |
| `ui-palette`（UI） | `ui-backup-stats`（UI） | `doClear` |
| `ui-palette`（UI） | `ui-drawer`（UI） | `openAiPage` `openDrawer` |
| `ui-palette`（UI） | `ui-global-events`（UI） | `showMemories` |
| `ui-scene-bind`（UI） | `ui-backup-stats`（UI） | `checkCount` |
| `util-perf`（Util） | `render-entry`（Render） | `render` |

> 逆层依赖多为"低层回调/工具被高层注入"的历史耦合，不必然错误；基线策略只拦**新增**项。
