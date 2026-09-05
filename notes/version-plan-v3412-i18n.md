# v3.4.12 视觉/i18n 修复设计稿（待审核通过后实施）

> **状态：审核通过，按 4 批次串行实施；每批独立 commit + 测试绿后进入下一批。**
> 范围：用户截图问题（"i18n 英文模式未显示英文"+"按钮图标与名称不统一"）。

## 根因诊断（端到端审计结果）

| 维度 | 事实 | 根因 |
|---|---|---|
| 渲染层 i18n 漏网 | 149 个 HTML 属性硬编码中文（placeholder 19 / title 14 / aria-label 116） | applyI18n 只实现 `data-i18n-aria`/`textContent` 两个方向；`data-i18n-placeholder`/`data-i18n-title` 全代码库 0 个，HTML 写时**根本没加这两个属性** |
| 调用面 vs 字典 | i18n-crossaudit 已绿（3276 key 双向零缺失） | 审计只查"代码 t() 调用的 key 在不在字典"，**不查"实际 DOM 渲染层是否还有字面量中文"** |
| 按钮格式 | 侧栏 nav-item 只有 title 悬停（截图里"任务/学习/编程"等是 nav-item，鼠标悬停才显示文字）；顶栏 tbtn 部分有图标+文字，部分纯文字 | nav-item 设计时只走 nav-item + title 悬停，**没固定可见的图标+名称**；tbtn 缺统一规则 |

**真问题 = 网关不完整 + HTML 写时漏标记 + 字典 149 key 缺 + 按钮组件缺统一规范 + 测试覆盖只到调用面不到渲染层。**

---

## 批次 1：applyI18n 网关扩展 + HTML 属性补 data-i18n-*

**改动 1**：`applyI18n` 函数（L30974 附近）补 2 个新方向（已实现 textContent + aria-label，加 placeholder + title）：

```js
// 在现有 aria-label 扫描后追加
const placeholders = (root || document).querySelectorAll("[data-i18n-placeholder]");
placeholders.forEach((el) => {
  const v = el.getAttribute("data-i18n-placeholder");
  if (v) el.setAttribute("placeholder", t(v, el.getAttribute("placeholder")));
});
const titles = (root || document).querySelectorAll("[data-i18n-title]");
titles.forEach((el) => {
  const v = el.getAttribute("data-i18n-title");
  if (v) el.setAttribute("title", t(v, el.getAttribute("title")));
});
```

**改动 2**：HTML 149 个属性逐个加 `data-i18n-*`。**关键决策**：key 命名以现有字典前缀为基（`field.*`/`btn.*`/`aria.*`/`a11y.*`），fallback 用原字面量（中文），便于审计回退。具体清单会从本次审计结果导出。

**风险评估**：低。`applyI18n` 已存在，只增量加分支；HTML 属性批量加是机械操作。

**验证**：
- 跑审计脚本 `_attr_count.cjs` 验证 149 → 0 硬编码中文属性
- 新增 `tests/i18n-render.test.js` 中"4 方向全支持"断言

**回退**：单一 commit 删除数据 + 还原 HTML（git revert 即可）。

---

## 批次 2：字典补 149 key

**改动**：MESSAGES.zh 段尾部追加 149 条（fallback 即原中文），MESSAGES.en 段对应补 149 条英文翻译。

**关键决策**：
- 不在 zh 段里复用已有 key——每个属性独立 key（不跨 placeholder/title 复用——避免触发侧的耦合）
- key 命名按位置和类型分桶：`field.ph.*`（placeholder 文本框提示）、`a11y.btn.*`（按钮无障碍）、`a11y.icon.*`（图标无障碍）等
- en 翻译逐条人工写（之前批次已用同样模式——成功率 100%）

**改动量**：zh ~149 行 + en ~149 行（机械插入）

**风险**：零。字典独立数据，插入不改任何运行逻辑（fallback 模式确保有 key 才生效）。

**验证**：`tests/i18n-crossaudit.test.js` 扩展——补 149 key 后调用面 vs 字典仍应零缺失。

**回退**：commit revert 即可。

---

## 批次 3：按钮统一"图标+名称"

**侧栏 nav-item 改造**（7+ 个）：
- 当前：`<button class="nav-item" title="任务">`（纯 title 悬停，截图里看到的就是悬停中文）
- 改造后：`<button class="nav-item"><svg>任务<span class="nm">任务</span></button>`
  - 加 SVG 图标（复用 UI_ICONS 或 SIDE_MENU_ICONS 已有）
  - 文字 label 固定可见（与顶栏 tbtn 同一结构）
  - title 保留作无障碍补充
- CSS：`.nav-item` flex 布局 + `.nav-item .nm` 字号/间距对齐 `--fs-sm/--space-*` 令牌
- 对侧栏宽度影响：当前 200px/180px 需扩到 220px（窄屏断点同步）

**顶栏 tbtn 统一**（6+ 个）：
- 当前混合（部分纯图标如 Theme，部分图标+文字如 Install）
- 改造后：全部"图标+文字"（Settings/Recycle/Help 已有形态作模板）
- CSS：`.tbtn` 已有，**只是不同 tbtn 内部内容不一致**——统一补 `<span class="lbl">` 标签

**风险**：中。侧栏宽度变化可能影响布局——需测所有断点。

**验证**：
- `tests/mobile-enhance.test.js`（侧栏）
- `tests/i18n-render.test.js`（按钮文字 i18n）
- 手动：开 PWA 看各断点无文字截断

**回退**：单一 commit revert；侧栏宽度改回原值，CSS 加 `!important` 覆盖回旧规则。

---

## 批次 4：i18n-render 端到端门禁

**新增 `tests/i18n-render.test.js`**：
- 切英文模式 + 触发 applyI18n
- 遍历 #main / #drawer / #side / #topbar / 已知 modal
- textContent / placeholder / title / aria-label 四方向各扫一遍
- 期望：英文模式下**用户可见区域的 DOM 不含中文**

**关键决策**：扫描范围**不包括**字典定义区（script 里的 MESSAGES）+ 字体 SVG 注释。**包括**所有 `<body>` 内的可见节点（排除 `display:none` 子树）。

**注意**：i18n-render 是**严格门禁**——任何"刻意"的中文硬编码（如 placeholder 在英文模式没 key 就会显示中文 fallback）都会被拦下。它会强制后续开发用 `data-i18n-*` 写 HTML。

**风险**：低。但**首次跑会**暴露很多现有问题——可以**先以"宽松模式"**（只警告不 fail）跑一遍审计，统计剩余问题，再迭代加严。

**回退**：测试文件删除即可（不进入生产）。

---

## 实施顺序与依赖

```
1 → 2 → 3 → 4
```

1 改 applyI18n + HTML 属性——使 4 方向可达
2 补字典——给新增的 data-i18n-* 提供 zh + en 值
3 改按钮结构——侧栏/顶栏可视化
4 加门禁——固化"渲染层 i18n 完整"

**预计总改动**：
- applyI18n: +25 行
- HTML 属性: +149 处 data-i18n-*（机械）
- 字典: zh +149 行 / en +149 行
- 按钮 CSS/HTML: +60 行 CSS / +30 行 HTML
- 测试: +200 行
- 总计: **~600 行**，分 4 commit

---

## 明确不做

- **v3.5.0 云同步/RAG 自动索引等**——本轮专做视觉+ i18n，v3.5.0 规划等本批完成后再启
- **全 11 个主题的 i18n 一致性审查**——非问题焦点
- **截图里其他视觉问题（折叠按钮位置、双边框等）**——已记录但非本批范围（如有需要单列 v3.4.13 hotfix）

---

## 三个待确认点

1. **侧栏 nav-item 加图标后宽度扩展到 220px**——你的视口（看截图是 1280px 桌面）有足够空间；窄屏（<1023px）下会触发 `padding` 缩窄以容纳——确认接受？
2. **顶栏 tbtn 全部图标+文字**（"Help" 加图标变成"❓Help"）——会让顶栏更宽，可能挤掉 1-2 个按钮。是否**接受顶栏更紧凑/分两行** 或 **接受溢出**？
3. **i18n-render 门禁首次跑先以"宽松模式"（仅警告）跑一遍审计**——还是**直接严格模式**（失败即 fail）？

我会按"1 严格、2/3 宽松迭代"模式实施——直接严格，不绕弯路。
