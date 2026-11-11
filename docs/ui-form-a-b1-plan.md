# 形态 A 批次 B1 实施草案（行级落点预研）

> 2026-11-11 落库。批次定义见 `docs/ui-form-a-functional.md` §6（本文只补行级落点，不改契约）。
> **性质：预研文档，零代码。** B1 代码阶段被「布局批 L·Move B」ACTIVE 行（Qoder 主会话 2026-11-11 08:09，
> 树 f:/wt/wblayout）占 `agent-workbench.html` 挡住（R13 不硬上，已排队 REQUEST，板面行＝7605d3f）；
> 释放后按本文开刀。行号是 2026-11-11 main 落库时证据，实施时以当时为准。

## 1. B1 是什么 / 不是什么

- 是：menubar / tabbar / statusbar 三壳 + `#uiModePill` 从 `.topbar` 迁 tab 条左 + 新壳断点规则；**零行为变化**（模式语义、三态循环、窄屏拒 code、任务轨规则、坞折叠通则全不动）。
- 不是：视图注册表（B2）、data-action 委托 + `FORM_A_ACTIONS` + lint-bindings 门禁（B2）、composer（B3）、右栏分节（B4）、topbar 退役（B5）、沉浸页 `:has()` 扩展（B3 §4）。

## 2. 行级落点

### 2.1 statusbar 壳（主底栏升级）

- 现状：`appendFoot()` `src/render-entry.js:16-46` 在 `#main` 内产 `.foot`（三列 `foot-id`/`foot-stat`/`foot-ai`，:40-44），全仓 28 处调用（render-entry 12 / render-overview 9 / render-widgets 5 / ui-guide 1）；`.foot` CSS `agent-workbench.html:1647-1659`、`:1677`（`.main > .foot{margin-top:auto}`）、`:1689`。
  （`src/ui-drawer.js:259` 的 grep 命中是注释文字，非调用——drawer 底栏走独立 `_appendDrawerFoot()` :287/:261，不受影响。）
- 改法：`<footer class="statusbar" id="statusbar">` 壳放 `.app` 尾（抽屉/沉浸页规则之后）；`appendFoot` 体内 `main.appendChild(footEl)` 改为更新 statusbar 三个 span（`foot-id`/`foot-stat`/`foot-ai` 类名与文案逻辑原样搬，`esc()` 保留——lint-xss 放行依据同源）。
- 调用点（14 处）**零改动**；`_appendDrawerFoot()` `src/ui-drawer.js:287`（drawer 页底栏，:261 调用）**不动** ⇒ `.foot` CSS 全保留（drawer 仍用）。
- 判据：各场景页底栏三列读数与 B1 前逐字节同（版本号/待办数/资料数/AI 状态）。

### 2.2 menubar 壳

- 新增 `<header class="menubar">` 于 `.app` 首（topbar 之上）；logo（`agent-workbench.html:5513`）整块迁入 menubar 左。
- mi 文字菜单容器留空：内容清单是功能设计 §8 待决②（原型占位），**B1 不放任何 mi 项**（防空窗假控件）。
- topbar 其余控件（btnHelp/btnSearchTop/btnCmd/btnTaskRail/btnMessages/btnTheme/btnDownload/btnInstall/syncStatus/btnMore/btnUser :5528-5562）**原地不动**（B5 退役表）。

### 2.3 tabbar 壳 + pill 迁移

- 新增 `<div class="tabbar">` 于 menubar 与 `.body`（:5584）之间。
- `#uiModePill`（:5516-5526）整块剪贴迁入 tabbar 左。**零 JS 改动原理**：`_renderUiModePill()` `src/render-widgets.js:4092-4119` 只认 `#uiModePill` id 与 `.mode-pill-item` 类名，id 不变 ⇒ 三态/aria-pressed/resize 防抖 150ms/窄屏拒 code（<1024 disabled+aria-disabled 双保险，`tests/ui-mode.test.js:160-185`）全原路。
- tabs 容器放空 `<div class="tabs" id="formATabs"></div>`（B2 注册表填）。
- ＋/railbtn/immersive 三控件 **B1 不落**：B2 随 `FORM_A_ACTIONS` 同批落（控件与 handler 同批，零假控件窗口）。`#btnTaskRail`（:5538）现状不动，与 B2 的 `faRailToggle` 并存至 B5。

### 2.4 断点 CSS（复用 1023/767/479，不新增值）

- 新增 ≤767：`.menubar .mi{display:none}`（文字菜单隐藏；B1 mi 空，这条先落＋窄变异用它）。
- 新增 ≤479：`.tabbar` 压缩（tabs 槽标签省略/图标化；pill 压缩现状 `:758-762` 选择器 `.mode-pill` 类名不变 ⇒ 零改动随行）。
- ≤1023「右栏滑出」＝**回归项非新实现**：现状 `#taskRail` 滑出（`render-widgets.js:466-498` setOpen/backdrop 互斥）不被 pill 迁移破坏即可；rightrail 本体（B4）尚不存在。
- 令牌：按 DESIGN-SYSTEM §2.2（控件三档 28/36/44；正文 ≥12px；禁正 tabindex）。

## 3. 过渡态声明（B1→B5 之间如实存在）

topbar 未退役 ⇒ menubar + tabbar + topbar + statusbar 四条横带并存，双条顶栏（menubar+topbar）是分批代价，B5 退役 topbar 时消除。视觉可接受性在原型三壳口径内核对过；不接受则 B1 与 B5 合并为一批（待用户拍板，默认按分批走）。

## 4. 门禁与窄变异

- 门禁：`npm run lint`（package.json:22 全链：eslint/lint-colors/lint-xss/lint-css-structure/lint-appbridge/src-split/lint-breakpoints/lint-false-receipt/lint-save-receipt）+ `tests/ui-mode.test.js` 定向 + draw-responsive 复测 + 七档溢出探针（§7 原文写「六档」列七值 320/360/375/480/768/1024/1280，按七值执行；口径＝scrollWidth==innerWidth + 反向对照）+ `check:source-state` + `src-split --check`。
- 窄变异（≥1 打在判定维度）：临时删 ≤767 `.menubar .mi{display:none}` ⇒ 320 档溢出探针红；还原复绿。

## 5. 实施顺序（每步可回退、绿色）

1. statusbar 壳 + appendFoot 改造（drawer foot 不动）→ 2. menubar 壳 + logo 迁入 → 3. tabbar 壳 + pill 迁入（零 JS）→ 4. 断点 CSS → 5. 全门禁 + 窄变异 + commit。

## 6. 高共写面声明

ZCode DL-O24 ACTIVE 占 `src/render-overview.js`/`agent-workbench.html`/`CHANGELOG.md` 等，Qoder L·Move B ACTIVE 占 `agent-workbench.html`/`src/render-side.js`/`tests/ui-consistency.test.js`/`docs/demand-ledger.md`/`docs/agent-board.md`；本批代码面（HTML/render-entry/render-widgets）与两行均撞 ⇒ **本文档落地时零代码**，等释放后按 claim-check 窗口动手。本文件纯新增，零冲突。
