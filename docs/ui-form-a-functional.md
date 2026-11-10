# 形态 A 功能设计（四件套 4/4）

> 2026-11-10 落库。定位见 `docs/ui-redesign-phase-a.md`，令牌见 `docs/DESIGN-SYSTEM.md` §2.2，
> 可点原型 `docs/prototypes/ui-form-a.html`。本文只定功能契约；行号是落库时证据。

## 0. 不变量（动刀前后必须仍然成立的既有契约）

- 模式语义：三态循环；`isWide = innerWidth >= 1024`（`src/render-widgets.js:284`），<1024「代码」段
  `disabled`+`aria-disabled`、`setUIMode('code')` 返回 false 双保险（`tests/ui-mode.test.js:160-185`）。
- 任务轨规则照 §2.1：排序 逾期→今天→有日期→无日期、≤8、勾选 `completeTask`、标题 `openTaskEdit`、
  `+` 走首屏同一新建入口、禁止第二套 CRUD。
- 坞折叠通则：折叠只收历史与工具条，输入行保留（`agent-workbench.html:5228-5231`）。
- 沉浸页隐藏坞：纯 CSS `:has()` 路线（`agent-workbench.html:5240-5243`），不增 JS 状态类（避 R-31 病根）。
- 新存储键先登记 `DATA_KEY_REGISTRY`（`src/data-links.js:800`，门 `tests/data-keys-registry.test.js`）。
- 控件三档 28/36/44；断点允许集 1023/767/479 不新增值；正文 ≥12px；禁止正 tabindex。

## 1. 视图注册表（tab 条）

- 现状：无注册表；`render()` 按全局 active 分发（`src/render-entry.js:61-94`），`setActive` 持久化
  （`src/data-links.js:478`）。
- 设计：内存视图表 `_formATabs = [{id, scene, title}]`，默认 `[{id:"today", scene:"today", title:今日}]`；
  tab 条由它渲染。**切 tab = `setActive(scene)` + `render()`**——active 仍是唯一事实源，tab 只是壳，
  不引入第二套场景状态机。`+` 追加默认场景视图；`×` 移除且常驻 ≥1，关掉活跃项时 setActive 兜底到剩余首项。
- 持久化：`wb_form_a_tabs`（kind:"d"，sync:false——布局偏好不上云，同 `chat_panel_collapsed` 口径），
  先登记再实现。

## 2. data-action 绑定覆盖

- 现状：无 data-action 约定；委托在 `src/ui-global-events.js:62/126/137` + render 时逐元素绑定
  （`data-rail-tab` `src/render-widgets.js:460`、`data-move/data-del/data-chain-sc` `src/ui-scene-bind.js:36-75`）。
- 设计：形态 A 新增控件一律走 `data-action`，集中一张表
  `FORM_A_ACTIONS = {faTabSwitch, faTabAdd, faTabClose, faRailToggle, faRrSec, faCmpToggle, faImmersive, faMenuOpen}`
  挂在 `ui-global-events.js` 委托分支；既有绑定（data-rail-tab 等）原路径不动。
- 覆盖门禁：新脚本 `scripts/lint-bindings.mjs` 静态扫 `agent-workbench.html` 的 `[data-action]` ⇄
  `FORM_A_ACTIONS` 键集，**双向包含**，缺一边即红。窄变异自证：临时删一个 handler 引用 → 门红；恢复 → 绿
  （同 #134 窄变异口径）。

## 3. 焦点顺序与 Esc 栈

- 顺序：menubar → tabbar（pill → tabs → ＋ → railbtn → immersive）→ sidebar → main（面包屑 → 内容 →
  Composer 输入行）→ rightrail → statusbar。靠 DOM 顺序实现，不写正 tabindex。
- Composer 展开：焦点落 `#cmpInput`；Esc 先关 composer（若开），再走各面板既有 Esc 惯例
  （`ui-global-events.js:133`、`render-widgets.js:499`、`ai-retry.js:1476`、`ui-drawer.js:410`）；
  关闭后焦点归还 `#cmpToggle`（复用 `trapFocus` 的归还语义，`src/core-shared.js:418`）。
- 沉浸页整壳隐藏，不参与焦点序。

## 4. 沉浸页隐藏规则（扩展）

- 现有规则隐藏 `.chat-panel`；形态 A 扩展为同选择器族追加隐藏 `.tabbar` / `.composer` / `.statusbar`
  （menubar 保留——应用内轻菜单仍可用）：
  `.main-wrap:has(#drawer.drawer-page) .tabbar, .main-wrap:has(.main.page-recycle) .tabbar {display:none}` 等三条。

## 5. 删除面（旧 topbar 退役）

- `#uiModePill` 从 `.topbar` 迁到 tab 条左（#134 已删 `#btnUIMode`/`#uiModeMenu`，全仓 grep 0 命中）。
- `.topbar` 整体退役，控件逐一定好新家后再删旧壳（每批可回退）：

| 旧控件 | 新家 | 契约随迁 |
|---|---|---|
| logo | menubar 左 | — |
| btnSearchTop | 左栏快捷「搜索」 | B5 44px 触控 |
| btnCmd（Ctrl+K） | 左栏快捷「命令面板」 | 快捷键不变 |
| btnHelp（隐藏占位） | 删 | `#sideBtnHelp` 已是真入口 |
| btnMsg / btnTheme / btnDownload / #btnMore 溢出菜单 | 左栏底部工具区 | data-fold 窄屏收口改走左栏抽屉内分组 |

## 6. 分批实现（每批可回退、绿色、可独立收口）

- **B1 骨架**：menubar/tabbar/statusbar 壳 + pill 迁移 + 断点行为（≤1023 右栏滑出、≤767 左栏抽屉+文字菜单
  隐藏、≤479 压缩）；零行为变化。门禁：lint 三件套 + ui-mode.test.js + draw-responsive 复测 + 六档溢出探针。
- **B2 视图注册表 + data-action 委托 + lint-bindings 门禁**（含窄变异自证）。
- **B3 Composer 迁移**：旧 `#chatPanel` → 底部 composer（单行收起态 + 展开 40vh + Esc + 焦点规则）；
  `chat_panel_collapsed` 语义映射到 composer 态；沉浸页 `:has()` 扩展落地。
- **B4 右栏分节化**：今日任务轨首节（`renderTaskRail` `src/render-widgets.js:244` 原样搬）+ 其余节
  h4 折叠持久化（新键登记）。
- **B5 topbar 退役 + 旧坞 CSS 清理 + draw-responsive 判据重写 + 六档探针入 e2e**。
- 每批：`scripts/claim-check.mjs --as WorkBuddy <路径>` 显式路径 → 改 → 本地门禁 → 窄变异 → commit；
  代码阶段与 ZCode DL-O24 ACTIVE（`src/render-overview.js` / `agent-workbench.html` / `CHANGELOG.md`）
  按并集约定或等释放，不硬接管；回执批走 CHANGELOG [Unreleased] + 板面 RELEASED 行 + 推 main 双 run 绿。

## 7. 验证

- 六档零溢出（320/360/375/480/768/1024/1280）入 `tests/e2e/form-a-overflow.spec.js`，口径同原型探针
  （scrollWidth==innerWidth + 反向对照）。
- `lint-bindings` 进 npm lint 链；窄变异每批 ≥1 条打在判定维度上（删 handler / 去 disabled 同步 / 关一条
  `:has()`），必须红。
- CI 为权威终态；本机全量 `npm run test:local`（passed+failed==total 口径）。

## 8. 待决（实现批遇到即停回用户）

- tab 序默认持久化跨重启；若要会话内即弃则删 `wb_form_a_tabs` 登记。
- 菜单栏轻菜单内容清单（原型是占位）：视图 / 帮助 / 快捷键三组是否够了。
- 右栏非首节（产出 / 网页速览）的数据源映射（`renderTaskRail` 之外的取数路径）。
