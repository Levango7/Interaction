# 形态 A 功能设计（四件套 4/4）

> 2026-11-10 落库。定位见 `docs/ui-redesign-phase-a.md`，令牌见 `docs/DESIGN-SYSTEM.md` §2.2，
> 可点原型 `docs/prototypes/ui-form-a.html`。本文只定功能契约；行号是落库时证据。

## 0. 不变量（动刀前后必须仍然成立的既有契约）

- 模式语义：三态循环；`isWide = innerWidth >= 1024`（`src/render-widgets.js:284`），<1024「代码」段
  `disabled`+`aria-disabled`、`setUIMode('code')` 返回 false 双保险（`tests/ui-mode.test.js:160-185`）。
- 任务轨规则照 §2.1：排序 逾期→今天→有日期→无日期、≤8、勾选 `completeTask`、标题 `openTaskEdit`、
  `+` 走首屏同一新建入口、禁止第二套 CRUD。
- 坞折叠通则：折叠只收历史与工具条，输入行保留（`agent-workbench.html:5228-5231`）。
- 沉浸页隐藏坞：纯 CSS `:has()` 路线（`agent-workbench.html:5281-5288`），不增 JS 状态类（避 R-31 病根）。
- 新存储键先登记 `DATA_KEY_REGISTRY`（`src/data-links.js:800`，门 `tests/data-keys-registry.test.js`）。
- 控件三档 28/36/44；断点允许集 1023/767/479 不新增值；正文 ≥12px；禁止正 tabindex。

## 1. 视图注册表（tab 条）

- 现状：无注册表；`render()` 按全局 active 分发（`src/render-entry.js:61-94`），`setActive` 持久化
  （`src/data-links.js:478`）。
- 设计：内存视图表 `_formATabs = [{id, scene, title}]`，默认 `[{id:"today", scene:"office", title:今日}]`；
  （2026-11-12 裁：§1 原字面 `scene:"today"` 无此场景——`SCENARIOS` 7 键无 today，`render()` 通用分支
  会崩进兜底卡；真实落地页是 office（`active` 默认值，`src/data-links.js:437`），故默认场景裁 office，
  id/title 仍按字面。实现处 `src/render-entry.js` FORM_A_DEFAULT_SCENE 同注释。）
  tab 条由它渲染。**切 tab = `setActive(scene)` + `render()`**——active 仍是唯一事实源，tab 只是壳，
  不引入第二套场景状态机。`+` 追加默认场景视图；`×` 移除且常驻 ≥1，关掉活跃项时 setActive 兜底到剩余首项。
- 持久化：`wb_form_a_tabs`（kind:"d"，sync:false——布局偏好不上云，同 `chat_panel_collapsed` 口径），
  先登记再实现。

## 2. data-action 绑定覆盖

- 现状：无 data-action 约定；委托在 `src/ui-global-events.js:62/126/137` + render 时逐元素绑定
  （`data-move/data-del/data-chain-sc` `src/ui-scene-bind.js:36-75` 等；`data-rail-tab` 分页已于 B4 退役，
  右栏折叠改走 `faRrSec` 委托）。
- 设计：形态 A 新增控件一律走 `data-action`，集中一张表
  `FORM_A_ACTIONS = {faTabSwitch, faTabAdd, faTabClose, faRailToggle, faRrSec, faCmpToggle, faMenuOpen, faFocusToggle}`
  （B6 起原型里的 `faImmersive` 定名为 `faFocusToggle`——语义是「用户主动切专注」，不是页面驱动的沉浸页）
  挂在 `ui-global-events.js` 委托分支；既有绑定（data-move/data-del/data-chain-sc 等）原路径不动
  （B4 起 data-rail-tab 分页退役，右栏折叠统一走本表 faRrSec）。
- 覆盖门禁：新脚本 `scripts/lint-bindings.mjs` 静态扫 `agent-workbench.html` 的 `[data-action]` ⇄
  `FORM_A_ACTIONS` 键集，**双向包含**，缺一边即红。窄变异自证：临时删一个 handler 引用 → 门红；恢复 → 绿
  （同 #134 窄变异口径）。

## 3. 焦点顺序与 Esc 栈

- 顺序：menubar → tabbar（pill → tabs → ＋ → railbtn → immersive）→ sidebar → main（面包屑 → 内容 →
  Composer 输入行）→ rightrail → statusbar。靠 DOM 顺序实现，不写正 tabindex。
- Composer 展开：焦点落 `#chatTextInput`（原型期占位名 `#cmpInput`，B3 落地按壳迁 id 留原则改用真实 id，同义映射、行为不变）；Esc 先关 composer（若开），再走各面板既有 Esc 惯例
  （`ui-global-events.js:133`、`render-widgets.js:499`、`ai-retry.js:1483`、`ui-drawer.js:410`）；
  关闭后焦点归还 `#chatPanelCollapse`（原型期占位名 `#cmpToggle`，同义映射；复用 `trapFocus` 的归还语义，`src/core-shared.js:418`）。
- 沉浸页整壳隐藏，不参与焦点序。

## 4. 沉浸页隐藏规则（扩展）

- 沉浸页隐藏三壳 `.tabbar` / `.composer` / `.statusbar` + 对话坞 `.chat-panel`（menubar 保留——应用内轻菜单仍可用）：
  规则块共 8 条选择器：三壳 `.tabbar` / `.composer` / `.statusbar` × 两页壳 `#drawer.drawer-page` / `.main.page-recycle` ＝ 6 条本批新增
  （`body:has(#drawer.drawer-page) .tabbar, body:has(.main.page-recycle) .tabbar {display:none}` 等）；
  `.chat-panel` 2 条本批前已存在（`7997e225` 入仓，容器原 `.main-wrap:has()`：drawer-page 案死选择器、page-recycle 案命中），B3 同批迁容器到 `body`。
  **B3 实测修订**：初版按本节原字面落 `.main-wrap:has(...)`，真浏览器七档探针抓到死选择器——
  `.tabbar` / `.statusbar` / `#drawer` 均在 `.main-wrap` 之外（tabbar 在 `.app` 内、statusbar/drawer 是 `.app` 兄弟层），
  `.main-wrap:has()` 对它们永不命中（page-recycle 案仅 `.composer` 命中）；容器改 `body`
  （同文件 `body:has(#drawer.drawer-page.open) .topbar` 先例），并在 `tests/e2e/ui-mode-layout.spec.js`
  加真 `:has()` 引擎断言钉死（jsdom 无排版/:has 引擎，静态扫只能兜底字面）。

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
- **B4 右栏分节化（已落地 2026-11-13，用户裁选项甲）**：今日任务轨首节（`renderTaskRail`
  `src/render-widgets.js:244` 原样搬）+ 其余三节壳迁 id 留 + h4 折叠持久化（新键 `wb_agent_form_a_rr_sec`，
  kind:"c" sync:true backup:true，值＝收起节 id 数组 JSON；旧键 `rail_tab` 连登记原子同批删）。
  原型「产出 / 网页速览」两节不落地（无数据源映射，留 §8 待决）。
- **B5 topbar 退役 + 旧坞 CSS 清理 + draw-responsive 判据重写 + 六档探针入 e2e**。
- **B6 专注模式 + 帮助菜单（2026-11-14 落地，用户两句裁定）**：menubar 右侧「帮助」（`faMenuOpen`，
  菜单四项转既有真入口）与「专注」（`faFocusToggle`，`body.is-focus` 与页面驱动取并集，落盘
  `wb_agent_form_a_focus` 布尔）；Esc / 外点 / 选项后三路收起，开菜单首项获焦。
  `FORM_A_ACTIONS` 6→8，`lint-bindings` 基线同批改；测试 `tests/form-a-menu.test.js` 12 例。
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

- **[B2 已结案]** tab 序默认持久化跨重启：裁「持久化、不上云」（`wb_agent_form_a_tabs`，
  kind:"d" sync:false backup:true）；要会话内即弃就删该键，不做开关。
- **[B6 已结案，2026-11-14 用户裁]** 菜单栏轻菜单内容清单：**不做三组**，只做一组「帮助」四项
  —— 快捷键说明（转 `openCmd`，命令面板本就带快捷键提示）/ 诊断报告（转 `openDiagIssue`）/
  用户手册（仓库 `docs/user-manual.md` 外链）/ 关于本应用（`openDrawer` + `_switchSetTab("set-about")`）。
  四项全部转发既有真入口、不自造面板；视图组与左栏既有入口重复、快捷键组已由命令面板承载 ⇒ 不重复建设。
- **[B6 同批结案]** 原型里的「沉浸页演示」按钮：应用侧原为**页面驱动**（`body:has(...)` 八条），
  照原型加按钮会语义打架 ⇒ 裁「加专注模式按钮」，`body.is-focus` 与页面驱动**取并集**，
  两者各管各的、互不覆盖（进设置页仍自动隐；手动开专注退出页面也不残留）。
- **[B4 已结案]** 右栏非首节（产出 / 网页速览）：原型两节无数据源映射，裁「不落地」；
  右栏四节＝今日 / Agent / 文件 / 会话（选项甲，现状三 pane 转节）。
