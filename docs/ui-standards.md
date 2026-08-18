# UI 标准（v1.15 修订）

> 本文件固化 v1.15 UI/前端修复后的视觉与交互标准。新增 UI 代码前先对照本规范。

---

## 〇、页面标题栏（所有页面统一）

**标准**：每个页面顶部 = `图标(ph-ic) + 大标题(h2) + 小标题(sub)`，装入带边框的标题栏卡片（"框起来"）。

| 页面 | 实现 | 状态 |
|---|---|---|
| 统计 | `.card > header.page-head`（ph-ic + h2 + sub + 操作按钮） | ✅ v1.15 前已统一 |
| 仓库 | `.recycle-header.page-head`（ph-ic + h2 + sub） | ✅ v1.15 前已统一 |
| 设置 / AI / 插件（抽屉页） | `header.page-head.page-head-loose.drawer-ph`——v1.15 加"框"：panel 背景 + 边框 + 圆角 + 阴影 + 内边距 | ✅ v1.15 统一 |
| 文档（使用指南） | `header.help-header.page-head`——v1.15 改为 ph-ic + h2 + sub + 返回按钮，复用 help-page 卡片框 | ✅ v1.15 统一 |
| Agent | ❌ 已删除（v1.15 移除冗余侧栏菜单，原指向 AI 配置） | ✅ 删除 |

**规则**：
- 新增页面一律用 `header.page-head`（图标 `span.ph-ic` + `div.ph-tx > h2 + p.sub`），需要"框"时加卡片类（`card` / `drawer-ph` 同款边框）。
- 禁止再手写 `<h2>标题</h2>` 裸标题（无图标、无副标题、无框）。
- 侧栏导航项与页面标题一一对应；占位/冗余菜单（点击只转发到另一页）不允许存在，应删除入口。

---

## 一、顶栏（单行）

- **结构**：品牌 + spacer + 系统级按钮居右，单行 flex。
- **高度**：`--topbar-h: 54px`（所有断点一致；移动端触摸态 44px 按钮在内，保持 54px 不变）。
- **按钮**：横排（图标左 · 文字右），`min-height:36px`，`gap: var(--space-1)`，字号 11px。
- **背景**：`--side-bg`（与侧栏同灰），四主题经同名令牌自动同步。
- **主按钮**：搜索 / 命令 / 消息 / 主题 / 下载 / 更多（指南在侧栏底部）。

## 二、正文工具行

- 位置：主区上方独立一行（`.toolbar-row`），`--tb-row2-bg` 渐变背景 + 下边框分隔。
- 按钮：胶囊（`border-radius: var(--radius-full)`）、30px 高、15px 图标、`--fs-xs` 文字。
- 分组：视图组 / 动作组之间用 1px 竖线分隔符（`::before` 伪元素）。
- 番茄钟 / 时间追踪 widget 同胶囊造型，与按钮形状语言统一。

## 三、主内容区密度

- `.main` 内边距：`var(--space-5) var(--space-6)`（默认）。
- `.card`：内边距 `var(--space-4)`，卡片间距 `var(--space-3)`（v1.15 收紧 1 档，提升信息密度）。
- 目标：主色（背景）占比应 < 85%（此前实测 90-97% 过疏）。

## 四、空态（Empty State）

- 统一组件：`.empty-state` + `.empty-icon` + `.empty-text` + `.empty-action`。
- **必须带引导动作按钮**：`<button data-empty-action="...">`，并在全局委托中绑定。
  - `new-task` → 切场景 + 聚焦新建表单（与快捷键 N 同款行为，见 `data-empty-action` 委托）。
- 禁止再手写 `.empty` / `.empty-hint`（历史别名，视觉已对齐但新代码用 `.empty-state`）。

## 五、按钮交互

- 全局基架（最低特异性兜底）：`:active` 缩 3%、`[disabled]` 透明度 .55 + `cursor:not-allowed`。
- 组件无需重复写 active/disabled，只在需要差异化时覆盖。

## 六、表单

- 每个 `<input>/<select>/<textarea>` 必须配 `<label for="...">` 或 `aria-label`。
- 新增字段：`.row > label + input`，label 的 `for` 与 input 的 `id` 同名。

## 七、模态框

- 全部弹窗带 `role="dialog"` + `aria-modal="true"` + `aria-labelledby`。
- Esc / 遮罩点击 / 焦点陷阱由 `setupModalA11yBase()` 全局接管，**不要**为单个弹窗重复写 keydown 处理。

## 八、图标

- 彩色 emoji 清零。统一 `UI_ICONS`（2px 线性 SVG），模板内 `${ic("name")}` 注入（自动 `.ic-inline` 基线对齐）。
- 尺寸：文字旁 13px、按钮旁 15px、空态 24-44px。

## 九、层级（z-index 令牌）

- 只用语义令牌：`--z-under / --z-sticky / --z-sidebar / --z-overlay / --z-drawer / --z-popover / --z-modal / --z-toast / --z-max`。
- **禁止**裸数字 z-index。

## 十、主题

- 四主题（亮 / 暗 / 高对比 / 护眼）通过同名令牌覆盖，新增令牌必须四主题同步补。

---

## 附：验收清单（改 UI 后跑）

```bash
npm run lint                       # eslint + lint-colors
node scripts/lint-tokens.mjs       # 裸 px 收敛检查
npm test                           # vitest 全量
npm run build:check                # 版本一致 + 真相源完整
```
