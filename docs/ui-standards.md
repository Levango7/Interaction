# UI 标准（v1.15 修订）

> 本文件固化 v1.15 UI/前端修复后的视觉与交互标准。新增 UI 代码前先对照本规范。

---

## 〇、页面标题栏（所有页面统一）

**标准**：每个页面顶部 = `图标(ph-ic) + 大标题(h2) + 小标题(sub)`，装入带边框的标题栏卡片（"框起来"），标题与内容**不在同一卡片**。

### 统一规格（所有页面一致，禁止再用 page-head-sm / page-head-loose 变体）

| 维度 | 值 |
|---|---|
| 容器 | `<div class="card"><header class="page-head sc-page-head">…</header></div>`（标题卡独立） |
| 上下内边距 | `var(--space-2)`（8px） |
| 左右内边距 | `var(--space-4)`（16px，与 .card 一致；图标距左边框线 16px） |
| 图标尺寸 | 32×32，圆角 `--radius-md`，SVG 17px |
| 图标背景/前景 | `--accent-soft` 背景 / `--accent` 前景（场景页允许用场景色 `--sc-*`） |
| 图标与标题间距 | `gap: var(--space-3)`（12px） |
| 垂直对齐 | `align-items: center`（上下居中） |
| 大标题 | `font-size: var(--fs-lg)`（16px）、字重 600、`letter-spacing:-.01em` |
| 小标题 | `font-size: var(--fs-xs)`（12px）、`color: var(--muted)` |
| 大/小标题间距 | 小标题 `margin-top: 1px` |
| 与内容卡间距 | `sc-page-head{margin-bottom:0}` + 卡片间 `gap/margin space-3` |

### 逐页状态

| 页面 | 标题 | 实现 |
|---|---|---|
| 概览 | 概览 | `.card > header.page-head.sc-page-head` ✅ |
| 统计 | 统计（与侧栏一致） | ✅ 标题独立卡，高级报表按钮在内容区操作卡 |
| 仓库 | 仓库 | ✅ 标题独立卡 |
| 回收站 | 回收站 | ✅ 标题独立卡 |
| 场景（办公/编程/…） | 场景名 · 任务看板 | ✅ 独立卡（图标用场景色） |
| 设置 / AI / 插件（抽屉） | 设置 / AI 配置 / 插件市场 | ✅ drawer-ph 独立框卡（内边距统一 space-4） |
| 文档 | 文档（与侧栏一致） | ✅ help-page-wrap 标题卡 + 正文卡分离 |
| Agent | — | ❌ 已删除菜单 |

**规则**：
- 新增页面一律用 `header.page-head`（图标 `span.ph-ic` + `div.ph-tx > h2 + p.sub`），标题卡独立成 `<div class="card">`。
- 标题文字 = 侧栏菜单名（三处一致：侧栏 / 标题栏 / 页面 h2）。
- 操作按钮（如"高级报表"）不放标题栏，放内容区。
- 禁止再手写裸 `<h2>标题</h2>`；`page-head-sm` / `page-head-loose` 变体已废弃。
- 侧栏导航项与页面标题一一对应；占位/冗余菜单不允许存在。

### 返回键标准（v1.15）

| 页面类型 | 返回键 | 理由 |
|---|---|---|
| 主导航落地页（概览/统计/仓库/场景） | ❌ 无 | 侧栏点击切换即可，无需显式返回 |
| 抽屉子页（设置 / AI / 插件） | ✅ `← 返回` | 浮层需显式关闭返回 |
| 独立页面（文档 / 回收站 / 仓库 tab） | ✅ `← 返回` | 从侧栏进入，需返回入口回到上一视图 |

实现：
- 统一类 `.page-back`（唯一返回键样式），按钮文案 `← 返回`，`aria-label="返回上一视图"`。
- 旧类名（`drawer-close` / `help-back` / `recycle-back`）保留仅为 JS 绑定 / a11y 测试兼容，新代码一律用 `.page-back`。
- 新增"需要返回"的页面时，用 `class="page-back"` + 绑定关闭逻辑。

---

## 一、顶栏（单行）

- **结构**：品牌 + spacer + 系统级按钮居右，单行 flex。
- **高度**：`--topbar-h: 54px`（所有断点一致；移动端触摸态 44px 按钮在内，保持 54px 不变）。
- **按钮**：横排（图标左 · 文字右），`min-height:36px`，`gap: var(--space-1)`，字号 11px。
- **背景**：`--side-bg`（与侧栏同灰），六主题经同名令牌自动同步。
- **主按钮**：搜索 / 命令 / 消息 / 主题 / 下载 / 安装（指南在侧栏底部；"更多"按钮 v1.15 已移除，甘特/导图/仪表盘入图表页、笔记入知识页）。

## 二、正文工具行

- 位置：主区上方独立一行（`.toolbar-row`），`--tb-row2-bg` 渐变背景 + 下边框分隔。
- 按钮：胶囊（`border-radius: var(--radius-full)`）、30px 高、15px 图标、`--fs-xs` 文字。
- 分组：视图组 / 动作组之间用 1px 竖线分隔符（`::before` 伪元素）。
- 笃行 / 时间追踪 widget 同胶囊造型，与按钮形状语言统一。
- **待办栏**（v1.15，替代原消息栏）：`.todo-bar` 位于 toolbar-row 内，显示"今天 X 件待处理 · 已完成 Y 件 · 习惯链 Z 条"摘要；点击展开 Top3 今日待办（`.todo-bar-list`，可跳转对应场景）。消息中心收进顶栏 `#btnMessages` 按钮。

## 三、主内容区密度

- `.main` 内边距：`var(--space-5) var(--space-6)`（默认）。
- `.card`：内边距 `var(--space-4)`，卡片间距 `var(--space-3)`（v1.15 收紧 1 档，提升信息密度）。
- 目标：主色（背景）占比应 < 85%（此前实测 90-97% 过疏）。

### 三.1 布局宽度体系（B2 统一基线，2026-08-27 新增）

**问题**：`#main` 直接子级此前无任何宽度约束，宽屏（≥1440px）下卡片横跨整个视口（扣除侧栏与 AI 面板后仍可达 ~2000px），单列阅读行宽远超舒适区。

**规则**：
| 令牌 | 值 | 生效 |
|---|---|---|
| `--content-max` | 1240px | 全断点默认 |
| `--content-max-wide` | 1440px | `@media(min-width:1440px)` 抬升覆盖 |

- **统一约束**：`.main > *{max-width:var(--content-max);width:100%;margin-left:auto;margin-right:auto}` —— 所有渲染进主区的功能卡片/网格自动受控并水平居中。
- **窄屏安全**：视口 < 令牌值时约束数学上无效果，零副作用。
- **新增页面/卡片**：直接作为 `.main` 子级渲染即自动合规；**禁止**在子级上覆写 `width` 或 `max-width` 逃离约束（确需更宽内容如甘特图，先在本文件增补例外档位再实现）。
- **例外登记表**：目前为空。首个需要逃逸的功能须在此登记（选择器 + 理由 + 宽度上限）。

## 四、空态（Empty State）

- 统一组件：`.empty-state` + `.empty-icon` + `.empty-text` + `.empty-action`。
- **必须带引导动作按钮**：`<button data-empty-action="...">`，并在全局委托中绑定。
  - `new-task` → 切场景 + 聚焦新建表单（与快捷键 N 同款行为，见 `data-empty-action` 委托）。
- 禁止再手写 `.empty` / `.empty-hint`（历史别名，视觉已对齐但新代码用 `.empty-state`）。

## 五、按钮交互

- 全局基架（最低特异性兜底）：`:active` 缩 3%、`[disabled]` 透明度 .55 + `cursor:not-allowed`。
- 组件无需重复写 active/disabled，只在需要差异化时覆盖。
- **高度阶梯（v2.1.1）**：图标钮 32×32 / 小操作钮 32px（`.addbtn`、`.kbtns`、`.todo-ops`）/ 次小 28px（`.addbtn.sm`）/ 迷你 24px（`.addbtn.xs`）/ 主按钮 `.btn-primary` 系 / 移动触摸 44px。并排按钮必须同档；禁止内联 padding 改高。详见 design-ui-guidelines.md §十一。

## 六、表单

- 每个 `<input>/<select>/<textarea>` 必须配 `<label for="...">` 或 `aria-label`。
- 新增字段：`.row > label + input`，label 的 `for` 与 input 的 `id` 同名。
- **布局规则（v2.1.1）**：checkbox/radio 全局 `width:auto`（禁内联）；颜色选择器走全局 `input[type="color"]` 规格；`.form-row` 字段宽度用 `.fld-sm/md/lg/xl` 工具类（禁内联 max-width）；纵向间距用容器 gap。详见 design-ui-guidelines.md §十二。

## 七、模态框

- 全部弹窗带 `role="dialog"` + `aria-modal="true"` + `aria-labelledby`。
- Esc / 遮罩点击 / 焦点陷阱由 `setupModalA11yBase()` 全局接管，**不要**为单个弹窗重复写 keydown 处理。

## 八、图标

- 彩色 emoji 清零。统一 `UI_ICONS`（2px 线性 SVG），模板内 `${ic("name")}` 注入（自动 `.ic-inline` 基线对齐）。
- 尺寸：文字旁 13px、按钮旁 15px、空态 24-44px。
- **单一真相源（v2.1.1）**：`UI_ICONS` 是唯一图标定义处，其他字典同形图标按 key 引用，禁止复制 SVG；一个 key 只承载一个语义。
- **文字符号字形**：关闭 `✕`（禁 `×`）、警告 `⚠️`（带 FE0F）、展开箭头小三角族 `▸▾▴◂`（禁大播放三角 `▶▼◀`）。详见 design-ui-guidelines.md §7.1/7.2。

## 九、层级（z-index 令牌）

- 只用语义令牌：`--z-under / --z-sticky / --z-sidebar / --z-overlay / --z-drawer / --z-popover / --z-modal / --z-toast / --z-max`。
- **禁止**裸数字 z-index。

## 十、主题

- 七主题（浅色 / 极光 / 暗色 / 护眼 / 初雪 / 黑客帝国 / 跟随系统）通过同名令牌覆盖，新增令牌必须各主题同步补（v3.1.1 起「高对比度」已移除、「极光」为新增；`PRESET_THEMES` 注册表与设置页下拉为权威清单）。
- 主题三处清单必须一致：设置页 `#cfgTheme` 下拉选项 / `PRESET_THEMES` 注册表 / CSS `:root[data-theme=…]` 块。

---

## 附：验收清单（改 UI 后跑）

```bash
npm run lint                       # eslint + lint-colors
node scripts/lint-tokens.mjs       # 裸 px 收敛检查
npm test                           # vitest 全量
npm run build:check                # 版本一致 + 真相源完整
```
