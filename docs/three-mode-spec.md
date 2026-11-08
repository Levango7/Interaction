# three-mode-spec.md · 三模式行为契约（活文档）

> **状态**：活文档（2026-11-07 建立）。**层级**：`docs/README.md` 判读规则**第 2 级契约**，
> 与 `ARCHITECTURE.md` / `DESIGN-SYSTEM.md` 同级；冲突时以本文件裁决**模式行为与能力可达性**。
> **边界（防止三份契约互相压）**：视觉 / 断点 / 控件尺寸以 `DESIGN-SYSTEM.md` 为准；
> 分层与依赖方向以 `ARCHITECTURE.md` 为准；「为什么做 / 不做什么」以 `PRODUCT.md` 为准；
> 需求状态以 `docs/demand-ledger.md` 为准。本文件**不新增断点值、不改分层、不改工具清单**。
>
> **来源**：`docs/design-mode-phase-b.md:71-72` 定案「模式＝布局预设，不 gate 能力」；
> `src/render-widgets.js:3837-4103`、`agent-workbench.html:5284-5368`、`src/ai-tools.js:303-382`。
> **合入约束**：本文件与 `demand-ledger.md` 曾与 S5/S6 断言批共用同一插入点；后续任何改动须按
> `docs/agent-board.md` 的 R13 跑 `claim-check`，**占用释放以已提交的 `RELEASED` 为准**，
> 未提交 ACTIVE 行同样构成占用（`claim-check` 三面判据会读到）。

## 1. 公理与术语

| 项 | 契约 |
|---|---|
| **公理 M0** | **模式只改布局，不改数据、能力、权限**。三模式共用同一份数据、同一套工具、同一套撤销栈与工具白名单。任何"只在某模式可用"的新能力一律不做 |
| **公理 M1** | **不可用必须给理由**。模式不成立（窄屏 Code）、能力不可用（MCP 未勾选 / 工具被白名单剥离 / 未配 Key）都要有用户可见说明与诊断留痕，不做安慰剂、不静默 |
| **公理 M2** | **同一能力只有一个主入口**。其余入口只能是上下文快捷方式；Code 模式右栏 Agent tab 与 `#agentDock` 撞车时只留后者（P2-5） |
| 模式枚举 | `work` / `code` / `design` |
| 持久化键 | `wb_agent_uimode`，默认 `work`，非法值回落 `work` |
| 判读 | 现状以代码与门禁为准；历史快照（`design-mode-phase-b.md` 等）只作决策追溯 |

> **M0 的「产物域」边界（与 `PRODUCT.md` 同口径）**：`442483c` 之后空态快捷指令、聊天区提示与代码块观感随模式切换，
> `CHANGELOG.md` 称之为「产物域」。本规格认定这属于**呈现 / 提示词域差异**，落在 M0「只改布局」之内：
> 不新增能力、不 gate 工具、不分叉数据与权限。若后续实现把「产物域」做成能力开关，即违反 M0，
> 须先改本规格与 `PRODUCT.md`，不得靠 CHANGELOG 的一句描述改变契约。

## 2. 状态机

| 函数 | 位置 | 契约 |
|---|---|---|
| `_uiMode()` | `src/render-widgets.js:3837` | 读 `load(PREFIX+"uimode","work")`，try/catch 兜底 `work` |
| `applyUIMode()` | `:3853` | **幂等**：toggle `.body.code-mode` / `.body.design-mode`、更新顶栏标签、渲染 / 清空 dock |
| `setUIMode(mode)` | `:3906` | 显式设置；同模式 = no-op（只关菜单）；窄屏请求 `code` → toast + `return false`（菜单 disabled 之外的第二道拦截） |
| `toggleUIMode()` | `:3898` | 循环：`work → code`（窄屏跳过改 `design`）`→ design → work` |
| `_setUIMode(next)` | `:3920` | 先持久化，失败走 `pushDiag("warn")` 而非静默；随后 `applyUIMode()` + 切换 toast |
| 入口 | `agent-workbench.html:5458-5461` | 顶栏 `#btnUIMode` → `#uiModeMenu`：显式三态 + 当前态打勾标记 + 不可用态 disabled。**模式切换入口全仓仅此一处** |

**转移表**

| From → To | 条件 | 必须发生 | 必须不发生 |
|---|---|---|---|
| 任意 → `work` | 无条件 | 清 `#sessionDock` / `#agentDock` / `#diagramDock`；清 `_agentDockTimer` | 不写业务数据、不清聊天历史、不重置画布文档 |
| 任意 → `code` | `innerWidth >= 1024`（`:283`） | 停在右栏 Agent tab 时切回「今日」；渲染会话 / 能力停靠；起 2.5s 指纹轮询 | 不新增第二个能力清单入口；不改工具白名单 |
| 任意 → `design` | 无条件 | 清 `#sessionDock`、清轮询；`renderDrawWorkspace()` 渲染 `#drawStage` | 不因中栏让位而丢掉 AI 入口（对话坞移到 `.chat-panel-rail`） |
| 任意 → 同模式 | 无条件 | 仅关菜单 | 不重复起定时器、不重复渲染 |

**指纹轮询**：`_agentDockSignature()`（`:3845`）只取子代理 `id/status/steps`，指纹不变即跳过重渲染，
否则每 2.5s 一次 `innerHTML` 会打断正在看 / 正在点的人（滚动位置在 `renderAgentDock` 里保）。
**离开 `code` 必须 `clearInterval` 并把 `_agentDockTimer` / `_agentDockSig` 置空**（`:3875` / `:3895`）。

## 3. 布局契约（≥1024 主档）

| 模式 | 壳 / 网格 | 左 240px | 中 `minmax(0,1fr)` | 右 300px | 隐藏项 |
|---|---|---|---|---|---|
| **Work** | `.body` 默认三栏（导航 / 主列 / 今日任务轨 280px） | `#side` 场景导航 | `.main` 任务视图 + `.chat-panel` 贴底对话坞 | `.task-rail` 今日 / Agent / 文件 | — |
| **Code** | `.body.code-mode{display:grid;grid-template-columns:240px minmax(0,1fr) 300px}`（`agent-workbench.html:5284`） | `#side` + `#sessionDock`（列表 / 切换 / 新建；重命名删除仍在设置，不做第二套 CRUD） | `.main-wrap` 全高对话，输入行贴底居中 | `.task-rail` + `#agentDock`（进程 / 技能 / MCP / 工作流） | `.toolbar-row`、`.mob-bar`、`.side-sheet`、右栏 `[data-rail-tab="agent"]` |
| **Design** | `.body.design-mode{display:grid;...}`（`:5307`） | `#side` + `#diagramDock`（图列表） | `.main-wrap` 内 `#drawStage` 画布 | `.task-rail` + 对话坞轨道 | `.main`、`.chat-panel`、`.session-dock`、`.mob-bar` |

**Design 中栏两次修复（防回潮）**：① `.body.design-mode` 曾为 `display:block`，导致 `main-wrap` 高度退化为内容高（`:5324` 注释留档）；
② 768–1023 档漏隐藏 `nav#side.side`，侧栏作为 flex 子项吃掉 874px，画布只剩 85px、`svgH=0`（#110 取证，方案乙实修）。

## 4. 能力可达性（M0 的可核对面）

`src/ai-tools.js:303-382` 实测 **29 个工具**（`create_task` … `spawn_agents_parallel`）。
三模式共用的可达路径 = **贴底对话坞 + `Ctrl/Cmd+K` 命令面板（含 `>` 自主执行）**。

| 能力族 | 工具 | 备注 |
|---|---|---|
| 任务 / 资料 | `create_task` `list_tasks` `complete_task` `update_task` `delete_task` `add_record` `search` `query_overview` `export_data` `add_feature_record` `list_records` | Work 另有页面 CRUD，但那是同一能力的第二入口，不是模式特供 |
| 记忆 / 计划 | `remember` `recall` `forget` `plan` `complete_step` `complete_goal` | 计划-执行护栏（危险工具二次确认、步数封顶、abort）三模式一致 |
| 检索 / 执行 | `web_search` `web_fetch` `code_run` `sql_query` | `code_run` / `sql_query` 走本机 WASM 沙箱 |
| 笔记 / 报表 / 图 | `note_add` `note_search` `generate_report` `render_chart` `generate_doc` `draw_svg` | `draw_svg` 产物卡「在画布打开」是**产物级快捷方式**，不算第三个 AI 入口（Phase B §七） |
| 子代理 | `spawn_agent` `spawn_agents_parallel` | 运行态在 Code 的 `#agentDock` 可见；在 Work / Design 里同样可派生，只是不实时展示 |

**三处"看不见"不是能力门禁**（写清以免后人误判为 gate）：

1. Code 隐藏右栏 Agent tab —— 它是 `#agentDock` 同一批数据的**静态副本**，执行 M2；
2. Design 隐藏 `.main` / `.chat-panel` —— 中栏让位画布，对话坞移到 `.chat-panel-rail`（`:5336`）；
3. 窄屏禁用 Code —— **布局不成立**（三栏网格），不是能力被裁，且按 M1 必须 toast 说明原因。

## 5. 断点契约

断点允许集以 `scripts/lint-breakpoints.mjs` 为准（主档 `1440/1439`、`1024/1023`、`768/767`；
细分 `600/520/479/359`），**不得新增断点值**。断点只用于布局变化，不用于隐藏功能差异。

| 宽度 | Work | Code | Design | 现有守卫 |
|---|---|---|---|---|
| ≥1024 | 三栏 | ✅ 三栏 | ✅ 三栏 | `tests/e2e/ui-mode-layout.spec.js`、`tests/ui-mode.test.js` |
| 768–1023 | 左导航 / 主列，任务轨移出视口由顶栏「今日」滑出 | ⛔ **禁用 + 提示**（菜单 disabled + `setUIMode` 二次拦截 + toast） | ✅ **方案乙**：`#side` 隐藏、`#mobBar` 底栏（4 按钮）顶上、`svgH≈792`、点底栏弹场景抽屉 | `draw-responsive.spec.js` ⑤、`ui-mode-layout.spec.js` 窄屏组 |
| ≤767 | 底栏 4 组 + 侧栏抽屉 | ⛔ 禁用 + 提示 | ✅ 单栏画布，图列表收起 | `draw-responsive.spec.js` ①–④、`chat-drawer-mobile` |

**两条在册技术债**（状态见 `docs/demand-ledger.md`）：

- `DL-O15` 导航 / 抽屉外观有两份 CSS 副本（≤767 一份、768–1023 design 一份，#110 方案乙的代价），改样式需同步；CSS 注释已标注。
- `DL-O16` `draw-responsive.spec.js` / `ui-mode-layout.spec.js` 有 `test.skip(!process.env.E2E, ...)`：
  **裸跑 `playwright test` 是 `15 skipped / EXIT=0` 的假绿**，真跑必须 `E2E=1`。任何"e2e 已过"回执必须写明环境变量。

## 6. 数据契约

- 三模式共用键空间（`PREFIX = wb_agent_`）：任务 / 资料 / 笔记 / 聊天 / 会话 / `wb_agent_subagents` /
  `wb_agent_agent_run` / `wb_agent_diagrams` / `wb_agent_diagram_active` / `cfg` / `wb_agent_uimode`。
- **切换模式只允许写 `wb_agent_uimode` 一个键**。
- 撤销栈、工具白名单、MCP 勾选、技能启用、危险工具确认，**均不因模式切换改变**。
- 新键必须进 `DATA_KEY_REGISTRY`（`ARCHITECTURE.md §4`）；同步出站 / 入站 / 增量面、自动备份、JSON 导出的排除清单从注册表派生，不许手写。
- 画布预算有机械执行点：`DIAGRAM_MAX=50` / `DC_NODE_MAX=200` / `DC_ALL_BYTES_MAX=1MB`（`src/draw-canvas.js:21-28`），
  且**预算在改动之前算**，超了不碰文档、不压 undo。

## 7. 验收清单（Definition of Done）

| # | 断言 | 现状守卫 | 缺口 / 处置 |
|---|---|---|---|
| S1 | 三模式可进入且 `wb_agent_uimode` 落正确值 | `tests/ui-mode.test.js`（17 例） | — |
| S2 | 三栏几何、中栏回中、聊天贴底坞 | `tests/e2e/ui-mode-layout.spec.js` | 需 `E2E=1` 才是真跑 |
| S3 | 768–1023 档 Code 禁用且有可见理由 | `ui-mode-layout.spec.js` 窄屏组 | 缺「直接调 `setUIMode("code")` 也必须拒」的旁路负向断言 |
| S4 | 768–1023 档 Design 画布真铺开（`svgH>300`） | `draw-responsive.spec.js` ⑤ | 已实修；仍需 `E2E=1` |
| S5 | 离开 Code 必清 `_agentDockTimer` | `tests/ui-mode.test.js:230-280`（14/15，2026-11-08 补） | — |
| S6 | 切换模式零业务数据写入（仅 `uimode`） | `tests/ui-mode.test.js:282-350`（16/17，2026-11-08 补） | — |
| S7 | 能力不 gate：同一工具在三模式都可经命令面板 / 对话坞触发 | 未见 | **不升门禁**（Q-D）：改为季度复核清单，按工具族取样 |
| S8 | AI 入口 2 处、模式切换入口 1 处、同一能力主入口 = 1 | 静态门禁族 | **不升门禁**（Q-D）：改为静态清单人工复核 |
| S9 | 断点不新增值 | `scripts/lint-breakpoints.mjs` | — |
| S10 | 窄屏两档三模式零横向溢出 | `draw-responsive`、`layout-v2` | 部分覆盖 |

> **S5–S8 是规格缺口，不是代码缺陷**：现有 e2e 守的是**几何**，没守 M0 这条公理。
> **S5/S6 已于 2026-11-08 收口**（本批同提交）：S5 通过 `setInterval` 记账断「定时器生灭 + 重入必新起」；
> S6 以 localStorage 键快照差集断「稳态切换仅写 `uimode`」，且经窄变异自证（清 OS 定时器不置空标志位 →
> 15 红；`_setUIMode` 夹带业务键写入 → 16 红）。测前须把会话仓 / 画布文档 / `uimode` 预热到稳态，
> 否则懒加载首启迁移与 `uimode` 首次落盘会被误算成「切换写入」。
> S7/S8 维持 **不升门禁**（Q-D 裁决）：季度复核清单，按工具族取样、静态清单人工复核。
> 后续新增 `tests/*.test.js` 仍按 R13 跑 `claim-check`；占用释放以**已提交** `RELEASED` 为准，未提交
> ACTIVE 行同样构成占用。

## 8. 与其它契约的关系（不改写什么）

- `DESIGN-SYSTEM.md §2 / §2.1`：断点允许集、布局 v2、控件尺寸、浮层、三态 —— **本文件不覆盖**；
  其 §2.1「定位依据」引用 `PRODUCT.md` 闭环措辞，需随 PRODUCT 重写同步（台账 DL-O09）。
- `ARCHITECTURE.md §1 / §3 / §4`：Core 零出边、`AppBridge` 唯一跨层门面、绑定覆盖率门禁、键注册表 —— **本文件不覆盖**。
- `docs/design-mode-phase-b.md §九` 与 `docs/draw-capability-phase-a.md §十`：**Q1–Q4 均已定案**（D3 / E4 两批），本文件只引用结论，不重开决策。
- `docs/user-manual.md §3` 的三模式用户表须与本文件 §3 / §5 逐格一致（当前 `:159` 有冲突，台账 DL-O18）。

## 9. 复核纪律

- 每季度、或每次模式语义变更后复核；引用现状读代码 / 跑门禁，不引历史快照。
- 改动前跑 `node scripts/claim-check.mjs <路径>` 并追加 ACTIVE；提交前读 `git diff --cached --name-status`（R3 显式路径）；
  推前按 R10 在板面声明；**等 CI / Deploy 终态期间不再推任何一笔**（`ci.yml` 的 `cancel-in-progress` 会自掐）。
- 板面只记**意图与占用**，不记事实；版本与测试结论以 `git log` / CI 为准。

## 附录 · 现状锚点（2026-11-07 复核，非契约，引用前重跑）

| 结论 | 出处 |
|---|---|
| 模式状态机 / dock / 菜单 | `src/render-widgets.js:3837-3923`、`:3929`、`:3973`、`:4042-4103` |
| `isWide = () => innerWidth >= 1024` | `src/render-widgets.js:283` |
| 顶栏 DOM / 三模式 CSS / 768 档方案乙 | `agent-workbench.html:5458-5461`、`:5284-5320`、`:5346-5368` |
| 29 工具（源码计数） | `src/ai-tools.js:303-382` |
| 「模式不 gate 能力」原始定案 | `docs/design-mode-phase-b.md:71-72` |
| #110 方案乙取证与实修回执 | `docs/iteration-plan.md:425-469` |
| 最终用户口径 | `docs/user-manual.md:152-159` |
| 已发布版本 | `v3.7.155`（`AGENTS.md §二` 首行） |
