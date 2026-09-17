# 分层源块依赖图（自动生成，勿手改）

> 由 `scripts/module-graph.mjs` 从 `src/*.js` 的**符号级引用**分析得出：
> 定义 = 块内顶格书写的 function/const/let/var/class；依赖 = 某块引用了恰好由另一块定义的符号。
> 块数 27（本文件由脚本生成；不含时间戳，避免每日无意义 diff）

## 1. 依赖矩阵（行依赖列）

| 块 \ 依赖 | 层 | 依赖的块 | 依赖符号数 |
|---|---|---|---|
| `core` | Core | — | 0 |
| `util-markdown` | Util | — | 0 |
| `util-perf` | Util | — | 0 |
| `crypto` | Crypto | `data-idb` | 2 |
| `data-idb` | Data | — | 0 |
| `data-links` | Data | `core` `crypto` `render-scene-main` | 6 |
| `data-migrate` | Data | `data-links` | 2 |
| `data-rw` | Data | `core` `crypto` `data-links` | 5 |
| `chain` | Chain | `data-links` `data-migrate` | 2 |
| `ai-tools` | AI | `ai-retry` `chain` `core` `data-rw` | 5 |
| `ai-loop` | AI | `ai-retry` `ai-tools` `chain` `crypto` `data-migrate` | 8 |
| `ai-retry` | AI | `ai-loop` `ai-tools` `core` `data-links` `util-perf` | 15 |
| `render-entry` | Render | `ai-retry` `core` `data-links` `data-migrate` `render-overview` `render-scene-main` `render-widgets` `ui-daily` `ui-drawer` `ui-scene-bind` | 33 |
| `render-scene-sub` | Render | `render-scene-main` `render-widgets` `ui-scene-bind` `util-perf` | 10 |
| `render-scene-main` | Render | `ai-retry` `core` `data-idb` `data-links` `data-rw` `render-overview` `render-scene-sub` `render-widgets` `util-perf` | 20 |
| `render-overview` | Render | `ai-retry` `chain` `data-links` `data-rw` `render-entry` `render-scene-main` `render-scene-sub` `render-widgets` `ui-drawer` `ui-global-events` `ui-scene-bind` | 29 |
| `render-widgets` | Render | `core` `crypto` `data-links` `data-rw` `render-entry` `render-overview` `ui-drawer` `ui-guide` `util-perf` | 16 |
| `ui-theme` | UI | — | 0 |
| `ui-onboarding` | UI | `chain` `ui-backup-stats` `ui-daily` `ui-drawer` | 4 |
| `ui-guide` | UI | `crypto` `data-links` `render-entry` `render-scene-sub` `render-widgets` `ui-drawer` `util-perf` | 9 |
| `ui-scene-bind` | UI | `chain` `core` `data-idb` `data-links` `data-rw` `render-scene-main` `render-scene-sub` `ui-backup-stats` | 17 |
| `ui-palette` | UI | `ai-tools` `data-links` `render-widgets` `ui-backup-stats` `ui-drawer` `ui-global-events` | 8 |
| `ui-daily` | UI | `chain` `data-links` | 2 |
| `ui-backup-stats` | UI | `chain` `crypto` `data-idb` `data-links` `data-migrate` `data-rw` | 20 |
| `ui-drawer` | UI | `ai-retry` `crypto` `data-links` `data-migrate` `render-widgets` `ui-daily` `ui-global-events` `ui-guide` `ui-theme` | 31 |
| `ui-hotkeys` | UI | `ai-retry` `data-links` `data-rw` `render-widgets` `ui-drawer` `ui-palette` `ui-scene-bind` | 8 |
| `ui-global-events` | UI | `ai-retry` `ai-tools` `chain` `core` `crypto` `data-idb` `data-links` `data-migrate` `data-rw` `render-overview` `render-scene-main` `render-widgets` `ui-backup-stats` `ui-daily` `ui-drawer` `ui-guide` `ui-palette` `ui-theme` `util-perf` | 101 |

## 2. 共享符号（扇出 ≥ 8 个块，不计入依赖边）

| 符号 | 定义于 | 被多少块使用 |
|---|---|---|
| `t` | `core` | 23 |
| `toast` | `core` | 22 |
| `SCENARIOS` | `core` | 18 |
| `ORDER` | `core` | 14 |
| `render` | `render-entry` | 13 |
| `getTasks` | `data-rw` | 13 |
| `getCfg` | `data-links` | 13 |
| `active` | `data-links` | 12 |
| `getActiveTasks` | `data-rw` | 12 |
| `setTasks` | `data-rw` | 10 |
| `AppBridge` | `core` | 9 |
| `getRec` | `data-rw` | 9 |
| `UI_ICONS` | `core` | 8 |

> 这些是事实上的"全局助手"。层间倒挂多由它们造成，若要继续解耦，优先从这里动手。

### Core 层出边（必须为 0 —— 核心层零外部依赖）

✓ core 无外部依赖

## 3. 校验结果

- 跨块重复定义：**0** 项
- 循环依赖：**39** 条（data-links → render-scene-main → data-links；data-links → render-scene-main → render-scene-sub → ui-scene-bind → ui-backup-stats → data-links；data-links → render-scene-main → render-scene-sub → ui-scene-bind → ui-backup-stats → data-migrate → data-links；data-links → render-scene-main → render-scene-sub → ui-scene-bind → ui-backup-stats → data-rw → data-links；data-links → render-scene-main → render-scene-sub → ui-scene-bind → ui-backup-stats → chain → data-links）
- 逆层依赖（低层用高层符号）：**30** 条（按「块对」计）
- 逆层依赖（按**符号**计，去重）：**59** 个符号

| 从（层） | 到（层） | 涉及符号 |
|---|---|---|
| `ai-loop`（AI） | `ai-retry`（AI） | `renderChat` `scrollChat` `trimChatHist` |
| `ai-tools`（AI） | `ai-retry`（AI） | `pendingConfirm` |
| `crypto`（Crypto） | `data-idb`（Data） | `idbMirrorKey` `idbReadKey` |
| `data-links`（Data） | `render-scene-main`（Render） | `SCENE_FEATURE_RENDER` |
| `render-entry`（Render） | `render-overview`（Render） | `renderAuthLogin` `renderAuthRegister` `renderAuthWelcome` `renderChainPage` `renderOverview` `renderStats` … |
| `render-entry`（Render） | `render-scene-main`（Render） | `_featureCardBind` `_hydrateRecImgs` `bindCodeFrontendCard` `bindCodeRunnerCard` `bindCodeSqlCard` `bindMeetingActionCard` … |
| `render-entry`（Render） | `render-widgets`（Render） | `openRecycle` `renderSide` |
| `render-entry`（Render） | `ui-daily`（UI） | `snoozeTask` |
| `render-entry`（Render） | `ui-drawer`（UI） | `_moveDrawerHome` |
| `render-entry`（Render） | `ui-scene-bind`（UI） | `bindScenario` `setupKanbanDnD` `setupKanbanKeyboard` |
| `render-overview`（Render） | `render-widgets`（Render） | `SIDE_MENU_ICONS` `TOOL_APPS` `lineChartSVG` `openChartStore` |
| `render-overview`（Render） | `ui-drawer`（UI） | `openTemplateModal` `registerPluginFromJson` |
| `render-overview`（Render） | `ui-global-events`（UI） | `_switchSetTab` `toggleToolPop` |
| `render-overview`（Render） | `ui-scene-bind`（UI） | `openTaskEdit` |
| `render-scene-main`（Render） | `render-overview`（Render） | `_renderDiagramCanvas` `_renderFinanceStats` `_renderHealthTrend` |
| `render-scene-main`（Render） | `render-widgets`（Render） | `TOOL_APPS` `lineChartSVG` |
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

> 逆层依赖多为"低层回调/工具被高层注入"的历史耦合，不必然错误；基线策略只拦**新增**项。
