# Agent 工作台 · UI 设计规范

> 本文件基于 2026-08-12 的全局 UI 审计 + 五档问题修复沉淀，作为后续 UI 改动的一致标准。
> 现状基线：Apple Minimalist 风格 + 四主题令牌体系（亮/暗/高对比/护眼）。

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
