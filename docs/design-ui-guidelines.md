# Agent 工坊 · UI 设计规范

> 本文件基于 2026-08-12 的全局 UI 审计 + 五档问题修复沉淀，作为后续 UI 改动的一致标准。
> 现状基线：Inter 字体 + Vercel Geist 风格默认主题（2026-08-30 改版，v3.1.1 起）+ 七主题令牌体系（浅色/极光/暗色/护眼/初雪/黑客帝国/跟随系统；原「高对比」主题已移除、「Apple Minimalist」基线已被 Geist 改版取代）。

---

## 一、分层布局

| 区块 | 语义 | z-index 令牌 |
|---|---|---|
| 内容卡片/侧栏 | 内容层 | `--z-under` / `--z-sticky` |
| 移动端底部导航 | 工具栏 | `--z-sidebar` |
| 背景遮罩 | 全局遮罩 | `--z-overlay` |
| 设置抽屉 | 层叠面板 | `--z-drawer` |
| 命令面板/下拉 | 弹出菜单 | `--z-popover` |
| 模态框（全屏弹窗） | 对话层 | `--z-modal` |
| toast 通知 | 瞬时反馈 | `--z-toast` |
| skip-link（跳至主内容） | 最高层 | `--z-max` |

**禁止**新增裸数字 z-index。如需新层级，往令牌表里加语义名。

---

## 二、模态框（统一基座）

- **所有弹窗**都应有 `role="dialog"` + `aria-modal="true"` + `aria-labelledby="<id>"`。
- 基座 `setupModalA11yBase()` 在启动时统一接管：Esc 关最上层、遮罩点击关闭、焦点陷阱随显隐自动挂/卸。
- 新弹窗**不需要**再写 `document.addEventListener("keydown", ...)` 处理 Esc，也不要手动挂 `trapFocus`——基座全覆盖。
- 弹窗结构按已有的 `viz-modal` 模式：外层遮罩 `.viz-modal`、内内容卡 `.viz-modal-card`、标题栏 `.viz-modal-header`。

---

## 三、表单可访问性

- 每个 `<input>`/`<select>`/`<textarea>` 必须有对应的 `<label for="...">` 配对（或 `aria-label`）。
- 设置抽屉作为典型示例，所有 AI Profile 字段均已关联。
- 未来新增表单字段时，按样式 `.row > label + input` 写，label 的 `for` 与 input 的 `id` 同名。

---

## 四、交互动效

- 所有可点击元素默认享受全局基架（`:active` 缩 3%、`:disabled` 透明度 .55 + 手型取消）。
- 组件无需重复写 `:active`/`:disabled`——只在需要**差异化**时才覆盖（如 `.toolbar-row .tbtn:active` 的 3% 缩放）。
- 过渡统一走 `--transition-fast`（颜色类）/ `--transition-base`（布局类）令牌。

---

## 五、空态

- 新增空态统一用 `.empty-state` 组件类（已含居中、虚线边框、图标 + 标题 + 描述 + 可选动作按钮）。
- `.empty`/`.empty-hint` 是历史别名，视觉上与 `.empty-state` 对齐；新代码不再用它们。

---

## 六、toast 通知

- 类型语义：`ok`（成功·绿色+勾）、`warn`（警告·橙黄+警示三角）、`error`/`danger`（错误·红色+错号）。
- 调用时带上 `type` 参数（`toast("...", "ok")`），图标和颜色自动出现；读屏器会按严重程度播报。
- 通知文案保持一句话、动词开头（"已保存" 而非 "保存成功！"）。

---

## 七、图标

- 全局图标统一走 `UI_ICONS`（2px 线性 SVG）。彩色 emoji 已清零，禁止回潮。
- 新图标补进 `UI_ICONS`，命名按语义（如 `brain`、`target`、`chain`），不要按位置。
- 在模板字符串/innerHTML 里用 `${ic("name")}` 辅助函数注入，它自动包 `.ic-inline` span 处理基线对齐。
- 尺寸约定：文字旁 13px、按钮旁 15px、空态/hero 区 24px。

### 7.1 单一真相源（v2.1.1 去重规则）

- `UI_ICONS` 是**唯一**图标定义处。其他字典（`TOAST_ICONS` / `SIDE_MENU_ICONS` / `EMPTY_ICONS` / `_WEATHER_ICONS` / chartLibs / apps）同形图标一律 `key: UI_ICONS.xxx` 引用，**禁止**复制 SVG 字符串。
- 新增图标前先查 `UI_ICONS` 是否已有同形；有则引用，无则补进 `UI_ICONS` 再引用。
- 一个 key 只承载一个语义。禁止让一个图标身兼多职（v2.1.1 已把自定义/插件场景兜底从 `overview` 拆出独立 `tag` 图标）。
- 删除无引用 key 前先全局 grep 确认（含 `ic("key")`、`UI_ICONS.key`、`resolveScIcon("key")` 三种访问形态）。

### 7.2 文字符号字形规范

UI 中允许的文字符号（非 SVG）图标，每个语义**只用一种字形**：

| 语义 | 唯一字形 | 禁用 |
|---|---|---|
| 关闭/删除 | `✕`（U+2715） | `×`（乘号 U+00D7，仅数学/维度文案可用） |
| 警告 | `⚠️`（带 FE0F） | `⚠`（无变体选择符） |
| 展开/收起箭头 | `▸` `▾` `▴` `◂`（小三角族） | `▶` `▼` `◀`（大播放三角） |
| 保存/完成 | `✓` | — |
| 链状态 | `‖` 暂停 / `●` 进行中 / `✓` 已触发 / `○` 未开始 | emoji（⏸ 等） |

---

## 八、滚动条

- 现代浏览器走标准 `scrollbar-width:thin` + `scrollbar-color`，webkit 的渐变为补充。
- 不再单独为某个容器写滚动条样式，全局一致。

---

## 九、设计令牌

- 颜色、间距、字号、圆角、阴影、过渡、z-index、第二行背景渐变（`--tb-row2-bg`）都已令牌化。
- **修改 UI 时先想：能不能用令牌？**新增裸值前先查令牌表（`:root` 区）。
- 颜色改动跑 `npm run lint`（含 `lint-colors` 门禁），间距/字号改动跑 `node scripts/lint-tokens.mjs` 检查收敛空间。

---

## 十、标题层级

- `h1` 页面标题（只有一个）
- `h2` 卡片标题
- `h3` 卡片内子区块
- `h4` 列表项/小组件内部

同一层级的面板不要用不同的 heading 级。

---

## 十一、按钮高度阶梯（v2.1.1）

同类按钮必须同高。全局只允许四档小操作钮高度 + 主按钮：

| 档位 | 类 | min-height | 用途 |
|---|---|---|---|
| 图标钮 | `.chat-send-btn` / `.chat-attach-btn` / `.cal-nav` | 32×32 固定 | 纯图标方块 |
| 小操作钮 | `.kbtns button` / `.todo-ops button` / `.addbtn` / `.report-toolbar button` | 32px | 卡片/行内操作 |
| 次小钮 | `.addbtn.sm` | 28px | 紧凑工具行 |
| 迷你钮 | `.addbtn.xs` | 24px | 列表行尾微型操作 |
| 主按钮 | `.btn-primary` / `.btn-ghost` / `.btn-danger` | 内容撑（约 38px） | 弹窗/页面主操作 |
| 移动触摸 | 媒体查询内 | 44px | WCAG 触控目标 |

**规则**：
- 并排的两个按钮必须同档（如弹窗「取消 + 保存」都用 `.btn-ghost`/`.btn-primary`，禁止 `.btn-ghost` + `.addbtn` 混排）。
- 「添加/提交」一族统一用 `.addbtn`（32px），禁止借用 `.tbtn` 或内联 padding 改高。
- 禁止用内联 `style="padding:..."` 覆写按钮高度——需要更小就用 `.sm`/`.xs` 变体。
- `.addbtn.danger` 已定义（红底），危险按钮用它，不要内联 `--sc:var(--danger)`。

---

## 十二、输入框布局（v2.1.1）

- checkbox/radio 由全局 `input[type="checkbox"],input[type="radio"]{width:auto}` 统一，**禁止**再写内联 `style="width:auto"`。
- 颜色选择器用全局 `input[type="color"]` 规格（44×32），禁止内联 `width:44px;padding:2px`。
- `.form-row` 内字段宽度用工具类，不用内联 max-width：`.fld-sm`(120) / `.fld-md`(160) / `.fld-lg`(200) / `.fld-xl`(480)。这样移动端 `max-width:none` 媒体查询才能生效（内联样式打不过）。
- 纵向表单间距用容器 `gap`，不用子元素 `margin-bottom`（对齐 `.note-editor` 模式）。
- 主移动断点统一 **767px**，禁止新增 720px 等孤立断点。
- 胶囊圆角用 `--radius-full`（已定义 999px），不要再写 `var(--radius-full,回退)` 兜底。
