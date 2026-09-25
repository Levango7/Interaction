# Agent 工坊 · 统一设计规范（UI Spec）

> **本文件是全站 UI 的唯一权威规范。** 新增/修改任何界面代码前，先在这里找到对应条目；
> 找不到就先提 issue，别自己发明。
>
> - 合并自 `ui-standards.md`（v1.15 交互标准）与 `design-ui-guidelines.md`（v2.x 审计沉淀），
>   两文件已删除，历史内容全部并入本文。**不要再新建第二份规范文档。**
> - 所有数值来自 **CDP 实测**（`_probe/measure-spec.mjs`），不是估算。标注 `⚑ 实测` 的条目有自动化守护。
> - 守护测试清单见文末「规范 ⇄ 测试对照表」。改实现必须同步改断言。

**当前版本**：v3.7.48 ｜ **主题数**：11 ｜ **断点**：4 档

---

## 目录

- [〇、第一原则](#〇第一原则)
- [一、令牌体系](#一令牌体系)
- [二、间距节奏](#二间距节奏)
- [三、控件高度（五档制）](#三控件高度五档制)
- [四、字号与图标](#四字号与图标)
- [五、圆角与阴影](#五圆角与阴影)
- [六、颜色与对比度](#六颜色与对比度)
- [七、主题体系](#七主题体系)
- [八、布局与断点](#八布局与断点)
- [九、表单栅格](#九表单栅格)
- [十、页面骨架](#十页面骨架)
- [十一、组件契约](#十一组件契约)
- [十二、可访问性](#十二可访问性)
- [十三、浮层与层级](#十三浮层与层级)
- [附录 A：规范 ⇄ 测试对照表](#附录-a规范--测试对照表)
- [附录 B：验收清单](#附录-b验收清单)
- [附录 C：已知例外与债务](#附录-c已知例外与债务)

---

## 〇、第一原则

这四条优先于本文其它所有条款。冲突时按序取舍：

1. **用户圈注 = 精确规格。** 用户在截图上标了数值/比例，照抄。不要"顺手优化"，
   也不要替用户在「对齐」与「可用」之间拍板。有冲突**先问**。
2. **用户要的是视觉结果，不是达成手段。** 不要把自己推导出的工程目标（如"表单与看板严格对齐"）
   当成用户需求。用户说"理解不了基础需求"时，先自查：我是不是在追一个他没要过的目标？
3. **先量再改。** 涉及尺寸/布局，先用 CDP 量出实际数值（`_probe/measure-spec.mjs`）再动手。
   凭直觉的改动必错。
4. **只看令牌，不写裸值。** 颜色、间距、字号、圆角、阴影、过渡、层级 —— 一律走 `var(--token)`。
   新增裸值前先查令牌表。

---

## 一、令牌体系

唯一真相源：`agent-workbench.html` 顶部的 `:root` 块。**令牌分两类**：

### 1.1 主题令牌（随主题变）

颜色类。11 个主题各自覆盖一套（light 是默认态、不设 `data-theme` 属性）。

### 1.2 几何令牌（**只在 `:root` 定义**，11 主题共用）

间距 / 字号 / 圆角 / 控件高 / 图标 / 层级。它们只关乎节奏，与配色无关，
**不要往主题块里抄**（会抄漏，且无意义）。

> ⚑ 实测守护：`tests/theme-token-pairing.test.js` 断言主题块里**不得出现** `--label-col-w`。

### 1.3 命名规则

| 前缀 | 含义 | 例 |
|---|---|---|
| `--space-*` | 间距（4px 基线网格） | `--space-3` = 12px |
| `--fs-*` | 字号 | `--fs-sm` = 14px |
| `--radius-*` | 圆角 | `--radius-md` = 10px |
| `--control-h*` | 控件高度 | `--control-h` = 38px |
| `--icon-*` | 图标尺寸 | `--icon-md` = 20px |
| `--z-*` | 层级（语义名，**禁裸数字**） | `--z-modal` = 80 |
| `--text / --muted / --text-dim` | 文字色阶 | 见 §6.2 |

### 1.4 半档令牌

`--space-1h:6px` / `--space-2h:10px` 是**正式收编**的高频设计值（徽标微间隙、按钮横向留白），
不是临时补丁。可以放心用。

---

## 二、间距节奏

**基线网格 = 4px。** 全部间距必须落在下表里：

| 令牌 | 值 | 典型用途 |
|---|---|---|
| `--space-1` | 4px | 图标与文字、徽标内边距、紧凑 gap |
| `--space-1h` | 6px | 徽标/标签条微间隙 |
| `--space-2` | 8px | **默认 gap**、表单行距与列距、卡片内小间距 |
| `--space-2h` | 10px | 按钮与输入框横向留白 |
| `--space-3` | 12px | 卡片间距、区块内分隔 |
| `--space-4` | 16px | 标题栏左右内边距、卡片内边距（紧凑档） |
| `--space-5` | 20px | 主区内边距（纵向）、≥1440 时看板 gap |
| `--space-6` | 24px | 主区内边距（横向）、卡片内边距（默认档）⚑ 实测 |
| `--space-7` | 28px | 大区块分隔 |
| `--space-8` | 32px | 页面级留白 |

**规则**：
- 行距 = 列距。栅格容器**只写一个 `gap` 值**，不要 `gap: var(--space-2) var(--space-3)` 这种 8/12 混用。
  ⚑ 守护：`tests/form-grid-scheme-a.test.js`
- 禁止出现不在表内的 px 值（3/5/7/9px 等）。

---

## 三、控件高度（五档制）

⚑ 实测：当前站内交互元素高度分布有 **7 档**（48/42/38/36/32/28/16），
其中 4 档无令牌管辖。规范收敛为 **5 档**：

| 档位 | 值 | 令牌 | 用途 |
|---|---|---|---|
| XL | 48px | 无令牌（顶栏专用） | `.topbar .tbtn`（顶栏按钮，触摸态不缩） |
| L | 42px | 无令牌（聊天专用） | 聊天面板输入区、附件按钮 |
| **M（默认）** | **38px** | `--control-h` ⚑ | 所有 `input`/`select`/`textarea`、主按钮、导航胶囊、`.ds-trigger`（自研下拉） |
| S | 28px | `--control-h-sm` | 行内小按钮、紧凑操作、`.addbtn.sm`、面板折叠键 |
| XS | 32px | 无令牌（侧栏专用） | `.nav-item`（侧栏导航项） |

**规则**：
- 默认用 `--control-h`。新增控件先问："它是不是主控件？"是 → 38px，否 → 28px。
- 同一水平行内的控件**必须等高**（水平对齐场景错位是历史高发缺陷）。
- 表单里 textarea 的最小高度 = `calc(var(--control-h) * 2)`。
- ✅ 侧栏 `.nav-item` 32px 是**桌面端**的信息密度取舍；**移动端 `≤767` 侧栏整体隐藏**
  （`.side{display:none}`），导航改用底部 `.mob-bar-btn`（实测 48px），
  触控目标**已达标**。详见 [附录 C](#附录-c已知例外与债务)。

---

## 四、字号与图标

### 4.1 字号阶梯

| 令牌 | 值 | 用途 |
|---|---|---|
| `--fs-3xs` | 10px | 顶栏徽标、时间戳、迷你图表标签（密集场景） |
| `--fs-2xs` | 11px | 顶栏按钮文字、次级注释 |
| `--fs-xs` | 13px | 小标题（`.sub`）、chip、辅助文字、表格 |
| `--fs-sm` | 14px | **正文主力**（实测出现 901 次）、卡片标题、按钮、看板卡 ⚑ |
| `--fs-base` | 15px | 长文阅读区（实测 423 次） |
| `--fs-md` | 16px | 页面大标题（`--fs-lg` 别名场景） |
| `--fs-lg` | 18px | 页面标题 h2、区块标题 |
| `--fs-xl` | 20px | 统计数字 |
| `--fs-2xl` | 24px | hero 数字（罕见） |

**规则**：
- 正文默认 `--fs-sm`（14px），不是 `--fs-base`。15px 只用于长文阅读。
- 输入框字号 `--fs-sm`，**不得**回 `--fs-base`。
  ⚑ 守护：`tests/datepicker-panel-width.test.js`
- placeholder 全局 400 字重 + `var(--muted)`，**不得 600**。
- 阶梯外幽灵值必须收敛。

### 4.2 图标三档制

⚑ 实测（**已排除 `display:none` 子树**）：真渲染图标 69 个，为 **16 / 18 / 20 / 15** 四档。

**18px 已收敛为 `--icon-set` 令牌**（v3.7.49）。它原为 **14 处硬编码**，散落在设置页图标容器
（`.set-ic`）、侧栏折叠键（`.side-toggle`）、聊天 rail（`.rail-btn`/`.rail-ic`）、
命令面板（`.cmd li .ci`）、离线横幅、SSO 登录图标、用户头像、安装卡勾选、联动行图标等处。
详见 [附录 C](#附录-c已知例外与债务)。新代码禁止再用非令牌的裸 px 图标尺寸。
**收敛为三档，按「层级」而非「感觉」取用**：

| 令牌 | 值 | 用途 | 实测用量 |
|---|---|---|---|
| `--icon-sm` | 16px | 行内、次级小按钮、导航项、状态徽标 | 40 处 ✅ 主力 |
| `--icon-md` | 20px | 工具栏按钮、卡片标题、消息图标、面板标题 | 15 处 ✅ |
| `--icon-lg` | 24px | 应用卡片、文档工具主入口、空态 | 0 处 ⚠️ |

**例外（不纳入令牌）**：
- `.page-head .ph-ic` 32px —— 页面级标识，属布局尺寸
- `.mini-chart-wrap svg` 100% 自适应
- 空态 `.empty-icon` 24~44px —— 装饰性，随容器

**说明**：18px 原为硬编码（`.set-ic svg`），v3.7.49 已收敛为 `--icon-set` 令牌。
15px 余 2 处（`.page-head` / `.button`），属零散残留，新代码禁止再用。

### 4.3 文字与图标的基线对齐

模板字符串里用 `${ic("name")}` 注入图标，它自动包 `.ic-inline` span 处理基线对齐。
**不要手写 `<svg>` 拼在文字旁。**

---

## 五、圆角与阴影

### 5.1 圆角

| 令牌 | 值 | 用途 |
|---|---|---|
| `--radius-sm` | 6px | 小徽标、状态按钮、表格内元素 |
| `--radius-md` | 10px | **卡片、面板、下拉面板**（默认）、`.nav-item` ⚑ |
| `--radius-lg` | 16px | 大卡片、弹窗卡片 |
| `--radius-xl` | 22px | hero 区块 |
| `--radius-full` | 999px | 胶囊（工具行按钮、chip） |
| `--control-r` | 12px | **表单控件专属**（input/select/button） |

**规则**：同层级同类控件必须同圆角。表单控件走 `--control-r`，容器走 `--radius-md`。

### 5.2 阴影五档

| 令牌 | 用途 |
|---|---|
| `--shadow-0` | 无阴影（平面） |
| `--shadow-1` | 轻浮（轻微抬升） |
| `--shadow-2` | **卡片默认** |
| `--shadow-3` | 悬浮（hover 抬升） |
| `--shadow-4` | 弹窗、拖拽中 |

暗色主题需逐档加深 alpha（亮/暗两套必须成对）。
⚑ 守护：`tests/design-tokens.test.js`

---

## 六、颜色与对比度

### 6.1 硬编码颜色：零容忍

除白名单外，**不得出现任何颜色字面量**。白名单见 `scripts/lint-colors.mjs` 头部注释（7 类，A~G）。

门禁：`node scripts/lint-colors.mjs` 必须 exit 0。
⚑ 守护：`tests/color-tokens.test.js`（含精度探针，证明它不会误杀 `#ccDec` 这类 DOM id）

> 🔴 **写 CSS 注释时不要写裸十六进制色值** —— lint-colors 只放行「`--令牌: 值`」定义行。
> 这个坑本项目**踩过 3 次**（v3.7.44 / v3.7.47 / ……）。
> **替代句式**：只写令牌名 + 实测对比度数值，如「`--warn` 加深：徽章 3.26:1 → 4.95:1 ✓」。

### 6.2 文字色阶

| 令牌 | 语义 | 何时用 |
|---|---|---|
| `--text` | 主文字 | 标题、正文、需要强调的值 |
| `--muted` | 次要文字 | 副标题（`.sub`）、说明、标签 |
| `--text-dim` | 弱文字 | 页脚、时间戳、极次要信息 |
| `--text-dim-2` | ⚠️ **慎用** | 仅用于大字/非关键信息，见下 |

🔴 **`--text-dim-2` 在浅色页脚底上只有 3.85:1，不达标**。页脚必须用 `--text-dim`（实测 7.61:1）。
这是 v3.7.47 实际踩到的缺陷。

### 6.3 对比度硬指标
| 场景 | 阈值 | 依据 |
|---|---|---|
| 正文（< 18px） | ≥ **4.5:1** | WCAG 2.1 AA |
| 大字（≥ 18px 或 ≥ 14px 粗体） | ≥ **3.0:1** | WCAG 2.1 AA |
| 徽章/状态标签 | ≥ **4.5:1**（按正文算，因为字号小） | 本项目从严 |
| 非文本 UI（边框、图标） | ≥ **3.0:1** | WCAG 2.1 AA |

**改颜色必须实测对比度**，不能凭感觉。工具：`_probe/audit-ui.mjs`。

实测基线（v3.7.47）：

| 元素 | 修前 | 修后 |
|---|---|---|
| 页脚底文字 | 2.23:1 ❌ | **7.61:1** ✅（dark 12.44 / sepia 5.89 / forest 6.06 / ink 9.59） |
| P1/实验性徽章 | 3.26:1 ❌ | **4.95:1** ✅ |
| 成功 toast 白字 | 3.06:1 ❌ | **5.0:1** ✅ |

### 6.4 语义色

`--danger` / `--warn` / `--ok` / `--accent`，每个都必须配对应的 `-soft`（浅底）与
必要的 `-border`。覆盖了 `--accent` 就必须给 `--on-accent`（否则继承 root，静默变差）。
⚑ 守护：`tests/theme-token-pairing.test.js`

### 6.5 写注释与量测的三条禁令（**踩过 3 次 + 1 次 + 1 次**）

在 CSS/JS 注释里写"改了什么"的说明时，**下列两样都不许写**：

| 禁止 | 原因 | 替代句式 |
|---|---|---|
| **裸十六进制色值**（如 `#9a5a12`） | `lint-colors` 只放行「`--令牌: 值`」定义行，注释里的色值会被判违规 → CI 红。**踩过 3 次**（v3.7.44 / v3.7.47 / …） | 只写**令牌名 + 实测对比度数值**：「`--warn` 加深：徽章 3.26:1 → 4.95:1 ✓」 |
| **彩色 emoji**（`U+1F300–1FAFF`，含 🔴✅⚠️） | `ui-consistency.test.js` 有"全局零 emoji"门禁，扫全 HTML → CI 红。**踩过 1 次**（v3.7.48） | 用纯文本标记：「**必读**」「注意」「」 |

> v3.7.48 实录：我在 `#recForm` 修复注释里写了 🔴，`npm test` 立刻报
> `发现残留 emoji: 🔴`。改纯文本后恢复全绿。

**第三条禁令 —— 量 computed 前必须先判「是否真的在渲染」**（v3.7.49，**导致 5 条误判**）：

```js
// ❌ 错：display:none 子树照样返回 computed，且是 UA 默认值
const fs = getComputedStyle(el).fontSize;   // "13.3333px" —— 幽灵值

// ✅ 对：先确认真的上屏，再取值
if (!el.getClientRects().length) continue;  // 或逐级检查祖先 display
const fs = getComputedStyle(el).fontSize;   // 真实生效值
```

`getComputedStyle` **不会因 `display:none` 返回空** —— 它返回「该元素假设被渲染时」的样式；
继承链在 `display:none` 处断开，大量属性回落到 UA 默认值（`<button>` 的 `13.3333px` /
`padding:1px 6px` / `inline-block`），**看起来像幽灵样式污染，实际元素根本没上屏**。

**同时必须核对规则的媒体查询归属**：`.mob-bar-btn` 源码里确有 `font-size:var(--fs-xs)`，
但整块位于 `@media(max-width:767px)` 内 —— 桌面态不生效是**正确行为**，不是遗漏。

---

## 七、主题体系

### 7.1 十一个主题

`light`（默认，不设属性）/ `dark` / `system` / `sepia` / `elegant` / `aurora` /
`matrix` / `forest` / `ocean` / `mist` / `ink`（黑金）

### 7.2 🔴 新增主题必须同步 7 处

漏任何一处都会"主题能选但没效果"或"选项缺失"。**这是本项目最容易漏的地方（历史漏过 3 次）**：

| # | 位置 |
|---|---|
| ① | CSS 令牌块 `:root[data-theme="X"]{…}`（light 是默认态，不需要） |
| ② | 设置页 `<option value="X">` |
| ③ | `PRESET_THEMES` 注册表 |
| ④ | `applyTheme()` 判定链 |
| ⑤ | **`setTheme()` 判定链**（最易漏） |
| ⑥ | i18n 中文 `look.theme.X` + `look.themeDesc.X` |
| ⑦ | i18n 英文 `look.theme.X` + `look.themeDesc.X` |

⚑ 守护：`tests/theme-registration.test.js`（53 条，逐处核对）
唯一真相源 = `PRESET_THEMES`，其它 6 处跟着它核对。

### 7.3 令牌配对

覆盖了 A 就必须给全 A 的配对项。四组配对规则：

| 覆盖了 | 必须同时给 |
|---|---|
| `--accent` | `--on-accent`、`--accent-soft` |
| `--danger` | `--danger-soft`、`--danger-border` |
| `--warn` | `--warn-soft` |
| `--panel` | `--line`、`--text`、`--muted` |

⚑ 守护：`tests/theme-token-pairing.test.js`（14 条）

### 7.4 新增主题的验证方法

jsdom 不解析 CSS 变量，**颜色结果单测断言不了**，必须 CDP 真机核对：
1. 跑 `_probe/audit-ui.mjs` 做 11 套主题的对比度矩阵
2. 跑 `tests/e2e/theme-matrix.spec.js` 验渲染层不变量

---

## 八、布局与断点

### 8.1 四档断点（**不得新增**）

| 档 | 范围 | 定位 |
|---|---|---|
| PC 宽 | `≥ 1440px` | `--content-max` 生效，看板 gap 抬到 `--space-5` |
| PC | `1024 – 1439px` | 标准桌面 |
| Pad | `768 – 1023px` | 侧栏 180px，看板 2 列 |
| Phone | `≤ 767px` | 单列堆叠，底栏导航 |

另有两个**细分断点**（仅在确有必要时用，不算新增档）：

| 断点 | 用途 |
|---|---|
| `≤ 600px` | 图表/表格等特种布局收窄 |
| `≤ 520px` | 表单退 2 列 → 见 §9.3 |
| `≤ 359px` | 极窄兜底 |

🔴 **不得引入新断点值**。细分档只允许 `520 / 600 / 479 / 359`。
`479` 已登记为**合法细分档**（极窄屏顶栏纯图标，语义独立）。详见 [附录 C](#附录-c已知例外与债务)。
`768` 与 `767` 并存是**故意的**：`768` 属于 pad 档起点，`767` 属于 phone 档终点，两者互补不重叠。

### 8.2 内容宽度

| 令牌 | 实测值 | 说明 |
|---|---|---|
| `--content-max` | **1440px** ⚑ | 主内容区最大宽度 |
| `--content-max-wide` | **1440px** | ⚠️ 与上面同值（源码注释写"≥1440 抬升到 wide"，实际未抬升） |

> ⚠️ **注释漂移**：源码 `:root` 里 `--content-max` 的注释写「1240px」，实测是 **1440px**。
> 规范以实测为准，注释待修。

### 8.3 主区与卡片内边距

| 元素 | 实测 ⚑ | 说明 |
|---|---|---|
| `.main` 内边距 | `--space-5` `--space-6`（20/24px） | 纵向 20 · 横向 24 |
| `.card` 内边距 | **24px**（=`--space-6`） | ⚠️ 旧文档写 `var(--space-4)`（16px），**是错的**，以实测为准 |
| `.card` 间距 | `--space-3`（12px） | |
| `.card` 圆角 | `--radius-md`（10px，实测 16px 疑为 `.card` 变体） | |

### 8.4 顶栏与侧栏

| 元素 | 值 |
|---|---|
| 顶栏高度 | `--topbar-h: 54px`（全断点一致；移动端触摸态按钮 44px，顶栏仍 54px） |
| 顶栏结构 | 品牌 + spacer + 系统按钮居右，单行 flex |
| 顶栏按钮 | 横排（图标左·文字右）、`min-height:36px`、`gap: var(--space-1)`、字号 `--fs-2xs` |
| 侧栏（pad 档） | `width: 180px` |
| 侧栏导航项 | 实测 `213×32`、`padding:6px 8px`、`font-size:--fs-sm`、`border-radius:--radius-md` ⚑ |

---

## 九、表单栅格

### 9.1 三套栅格模型（按容器类型选）

| 容器类 | 栅格 | 适用场景 | 判据 |
|---|---|---|---|
| `.form-row--board` | `repeat(12, minmax(0,1fr))` | 看板卡表单行、筛选行 | 需要与看板三列对齐 |
| `.form-row--grid` | `repeat(4, minmax(0,1fr))` | 常规表单行 | 字段 ≤ 4 个 |
| `.tool-form-grid` | `repeat(4, minmax(0,1fr))` | 记录/工具卡表单 | 独立卡片内的表单 |

### 9.2 微轨数学（看板 ↔ 表单同宽）

```
看板列宽  W = 4t + 3g        （4 微轨 + 3 间隙）
3 列      = 12 微轨 + 11 间隙 = 表单总宽
```

**因此**：轨定义必须纯 `repeat(4,minmax(0,1fr))` 或 `repeat(12,minmax(0,1fr))`，
**绝不许出现固定 px 轨道**（写死 56px 会让截止日期少 69px，实测）。

### 9.3 列数与折行

| 断点 | `.form-row--grid` / `.tool-form-grid` | `.form-row--board` |
|---|---|---|
| `≥ 521px` | **4 列** | 12 微轨（看板 3 列对齐） |
| `≤ 520px` | **2 列** | — |
| `≤ 1023px` | — | **2 列**（`1fr 1fr`） |

**跨行规则**：
- `:last-child:nth-child(4n+1)` → 跨全行（`grid-column: 1/-1`）
- `:has(> textarea)` → 跨全行
- 上述两条是为了让"剩下的单个字段"和"长文本框"占满整行，避免视觉参差。

⚑ 守护：`tests/record-card.test.js`（含"不得回 auto-fill"反向断言）

### 9.4 字段宽度

`.fld-*` 在**栅格变体里只决定跨几轨**，不限制宽度（宽度由轨道决定）：
`.form-row--board>.fld-xl/.fld-lg/.fld-md/.fld-sm/.fld-fill { grid-column: span 3 }`

在**普通 `.form-row`（flex）里**才用 max-width：`sm 120 / md 160 / lg 200 / xl 480`。

**说明**：`.form-row--board` 的五个 `.fld-*` 全部 `span 3`，是 v3.7.60 **有意统一**为等宽四列
（尺寸类在此语境下退化为语义标签）。实测宽度差异来自 `#taskForm` 的 id 级定位，与尺寸类无关。
详见 [附录 C](#附录-c已知例外与债务)。

### 9.5 表单垂直节奏（方案 A）

| 规则 | 值 |
|---|---|
| 标签行高 | `min-height: var(--label-h)`（18px） |
| 提示/报错行高 | `min-height: var(--field-msg-h)`（16px）—— **出错不许跳动** |
| 控件高 | `var(--control-h)`（38px） |
| 标签溢出 | `text-overflow: ellipsis` + `white-space: nowrap` |
| 行距 = 列距 | 单一 `gap: var(--space-2)` |
| 行对齐 | `align-items: end`（标签在上、控件底对齐） |

### 9.6 键值行与设置行

| 类 | 栅格 |
|---|---|
| `.api-row` | `grid-template-columns: var(--label-col-w) 1fr`（88px 标签列） |
| `.set-field` | `minmax(0, min(230px, 55%))  minmax(0, 1fr)` |

🔴 **`minmax` 的 max 也必须按容器比例约束**。只降 min 是无效的 ——
网格最大化阶段会把非 fr 轨道顶到 growth limit（`minmax(min(150px,45%),230px)` 实测 computed = `230px 40px`，
fr 轨道只剩 40px）。正确写法：`minmax(0, min(230px, 55%))`。

### 9.7 每个字段必须有的东西

- `<label for="...">` 或 `aria-label`（**二者必居其一**）
- `min-width: 0`（防栅格溢出）
- 提示/报错用 `min-height: var(--field-msg-h)` 占位（防跳动）

---

## 十、页面骨架

### 10.1 页面标题栏（全页面统一）

**结构**：`<div class="card"><header class="page-head sc-page-head">…</header></div>`
—— 标题卡**独立**，不与内容同卡。

| 维度 | 值 |
|---|---|
| 上下内边距 | `var(--space-2)`（8px） |
| 左右内边距 | `var(--space-4)`（16px，与 `.card` 一致） |
| 图标 | 32×32 圆角 `--radius-md`，内 SVG 17px |
| 图标背景/前景 | `--accent-soft` / `--accent`（场景页允许用 `--sc-*`） |
| 图标与标题间距 | `gap: var(--space-3)` |
| 垂直对齐 | `align-items: center` |
| 大标题 | `--fs-lg`（18px）· 600 · `letter-spacing:-.01em` |
| 小标题 | `--fs-xs`（13px）· `--muted` · `margin-top: 1px` |
| 与内容卡间距 | `sc-page-head{margin-bottom:0}` + 卡片间 `--space-3` |

**规则**：
- 标题文字 = 侧栏菜单名（三处一致：侧栏 / 标题栏 / 页面 h2）。
- 操作按钮不放标题栏，放内容区。
- ❌ 禁止手写裸 `<h2>标题</h2>`；`page-head-sm` / `page-head-loose` 变体**已废弃**。

### 10.2 返回键

| 页面类型 | 返回键 |
|---|---|
| 主导航落地页（概览/统计/仓库/场景） | ❌ 无（侧栏切换即可） |
| 抽屉子页（设置 / AI / 插件） | ✅ `← 返回` |
| 独立页面（文档 / 回收站） | ✅ `← 返回` |

统一类 `.page-back`，文案 `← 返回`，`aria-label="返回上一视图"`。
旧类名（`drawer-close` / `help-back` / `recycle-back`）保留仅作兼容，新代码一律 `.page-back`。

### 10.3 正文工具行

- `.toolbar-row` 独立一行，`--tb-row2-bg` 渐变背景 + 下边框
- 按钮：胶囊（`--radius-full`）、30px 高、15px 图标、`--fs-xs`
- 分组之间用 1px 竖线（`::before`）
- 番茄钟/时间追踪 widget 同胶囊造型

### 10.4 卡片层级

| 类 | 语义 |
|---|---|
| `.t` | 标题（标识） |
| `.m` | chip（只读） |
| `.kstate` | 状态 |
| `.kbtns` | 操作（可点） |

⚑ 守护：`tests/card-layers.test.js`（行序、按钮外观、字号、不许裁字）

### 10.5 空态

统一 `.empty-state` + `.empty-icon` + `.empty-text` + `.empty-action`。
**必须带引导动作按钮** `<button data-empty-action="...">`，在全局委托里绑定。
❌ 禁止手写 `.empty` / `.empty-hint`（历史别名）。

---

## 十一、组件契约

### 11.1 按钮

| 类 | 用途 |
|---|---|
| `.btn-primary` | 主动作 |
| `.btn-ghost` | 次要动作 |
| `.btn-danger` | 危险动作（删除等） |

全局基架兜底（**组件不要重复写**）：
- `:active:not([disabled])` → 缩 3%
- `[disabled]` → 透明度 .55 + `cursor: not-allowed`

### 11.2 自研下拉 `.ds-trigger`

- 高 `--control-h`（38px），样式与原生 select 对齐
- 必须设 `aria-autocomplete`，并继承无障碍名：
  **优先级**：原生 select 的 `aria-label` > 关联 `<label>` 文本 > `title`
- **面板宽度 = 触发框宽度**（`Math.min(320, Math.max(150, 触发框宽))`）⚑
  —— 用户明确要求"选择框和日期卡片宽度应该一致"
- 窄字段（`.fld-sm`）内边距收为 `--space-1`

### 11.3 日期面板

- 宽度跟随触发控件（同上）
- **永远向下展开**（`top = r.bottom + GAP`），空间不足时整体上移，**不向上展开**
- 滚动时**跟随不关闭**（`window.addEventListener("scroll", ..., true)` 调 `_dpLayout(false)`）
- 层级 `calc(var(--z-modal) + 1)`

⚑ 守护：`tests/datepicker-panel-width.test.js`（125 条，反向断言密度最高）

### 11.4 toast

类型语义：`ok`（绿+勾）/ `warn`（橙黄+警示三角）/ `error`/`danger`（红+错号）。
调用带 `type` 参数，图标与颜色自动出现，读屏器按严重程度播报。
文案一句话、动词开头（"已保存" 而非 "保存成功！"）。

### 11.5 表格

`.tool-table-wrap`：`border-radius: var(--radius-md)` + `overflow: hidden` + `border: 1px solid var(--line)`。
内部 `.tool-table { margin-top: 0 }`（否则表格自带 margin 会在圆角容器里漏出白边）。

### 11.6 滚动条

全局一致：`scrollbar-width: thin` + `scrollbar-color`，webkit 渐变为补充。
**不要**为某个容器单独写滚动条样式。

---

## 十二、可访问性

### 12.1 表单

每个 `<input>`/`<select>`/`<textarea>` 必须有 `<label for>` 或 `aria-label`。
⚑ 实测：v3.7.47 前有 **5 个元素无可访问名**，修复后 **0 个**。

### 12.2 弹窗

全部带 `role="dialog"` + `aria-modal="true"` + `aria-labelledby`。
Esc / 遮罩点击 / 焦点陷阱由 `setupModalA11yBase()` **全局接管** ——
**不要**为单个弹窗重复写 keydown。

### 12.3 图标

- 彩色 emoji **清零**，禁止回潮
- 统一走 `UI_ICONS`（2px 线性 SVG），命名按**语义**（`brain`/`target`/`chain`），不按位置
- 模板里用 `${ic("name")}` 注入

⚑ 守护：`tests/ui-consistency.test.js`（含全局 emoji 正则）

### 12.4 焦点

- 移动端浮层 / 下拉须有 `_dpFocusGuard` 显式豁免
- roving tabindex 用于列表型控件
- `_dpPointerDown` 需区分鼠标/键盘触发

### 12.5 动效

尊重 `prefers-reduced-motion`（站内有 2 处 `@media` 处理）。

---

## 十三、浮层与层级

### 13.1 z-index 语义令牌（**禁裸数字**）

| 令牌 | 值 | 层 |
|---|---|---|
| `--z-under` | 2 | 内容卡片 / 侧栏 |
| `--z-sticky` | 20 | 吸顶元素 |
| `--z-sidebar` | 40 | 移动端底部导航 |
| `--z-overlay` | 50 | 背景遮罩 |
| `--z-drawer` | 60 | 设置抽屉 |
| `--z-popover` | 70 | 命令面板 / 下拉 |
| `--z-modal` | 80 | 全屏弹窗 |
| `--z-toast` | 90 | toast |
| `--z-max` | 100 | skip-link |

⚑ 守护：`tests/ui-consistency.test.js` —— 全站 `z-index: <裸数字>` 必须为 **0 处**。

### 13.2 浮层三条铁律

1. **可用高度按「视口 ∩ 裁切容器」算**，不能只看视口（抽屉/卡片内的浮层会被容器裁掉）。
2. **关闭判定用「几何错位」，不用时间窗**（时间窗方案在慢速交互下会误关）。
3. **宽度必须跟随触发控件**，写死像素迟早错位（曾实测 114 vs 250 差 136px）。

---

## 附录 A：规范 ⇄ 测试对照表

改某条规范 → 必须同步改对应测试。

| 规范章节 | 守护测试 | 断言数 |
|---|---|---|
| §1.4 半档间距 | `ui-spec-guards.test.js` | — |
| §2 间距令牌 | `design-tokens.test.js` + `ui-spec-guards.test.js` | 10 |
| §3 控件高度 | `form-grid-scheme-a.test.js` + `ui-spec-guards.test.js` | — |
| §4.1 字号阶梯 | `design-tokens.test.js` + `ui-spec-guards.test.js` | — |
| §4.2 图标三档 | `ui-spec-guards.test.js` | — |
| §5 圆角/阴影 | `design-tokens.test.js` | — |
| §6 颜色 | `color-tokens.test.js` + `lint-colors.mjs` | — |
| §7 主题注册 | `theme-registration.test.js` | 53 |
| §7 令牌配对 | `theme-token-pairing.test.js` | 14 |
| §8 断点 | `responsive-breakpoints.test.js` + `ui-spec-guards.test.js` | — |
| §9.1/9.2 看板栅格 | `board-form-grid.test.js` | 12 |
| §9.3 工具卡 4 列 | `record-card.test.js` | — |
| §9.5 表单节奏 | `form-grid-scheme-a.test.js` / `form-row-rollout.test.js` | — |
| §10.4 卡片层级 | `card-layers.test.js` | — |
| §11.3 日期面板 | `datepicker-panel-width.test.js` | 125 |
| §12.3 图标/emoji、§13.1 z-index | `ui-consistency.test.js` | 214 |
| §7.4 渲染层 | `tests/e2e/theme-matrix.spec.js` | 4 |

> **`ui-spec-guards.test.js`（19 条）** 是 v3.7.48 新增，专门补三处空洞：
> 图标尺寸体系、几何令牌的具体数值、半档间距令牌 —— 此前它们**完全无守护**。
>
> **辅助工具**：`tests/helpers/media-blocks.js` —— 括号计数式媒体查询扫描器。
> 需要「精确定位到某个 `@media` 块」时用它，**不要写「取全文第一个匹配」的正则**
> （v3.7.48 实测踩到：断点收敛后这类断言会指到别的块而误报）。

---

## 附录 B：验收清单

改 UI 后按序跑：

```bash
# ① 改 src/*.js 或 HTML 内联区
node_modules/.bin/eslint agent-workbench.html electron/main.js electron/preload.js service-worker.js
node scripts/lint-colors.mjs agent-workbench.html   # 必须 PASS
node scripts/lint-tokens.mjs                        # 非阻断，看收敛提示
node scripts/lint-layers.mjs                        # 分层契约

# ② 拼回后跑测试
npm test                                            # vitest 全量
node scripts/run-e2e.mjs --project=desktop          # e2e 分项目跑
node scripts/run-e2e.mjs --project=tablet
node scripts/run-e2e.mjs --project=mobile

# ③ 提交前必须还原源码态
node scripts/src-split.mjs --extract && node scripts/pet-art.mjs --extract
npm run check:source-state                          # 必须 ✓（HTML < 1.2MB / 28 个 src 标记）
git diff --stat                                     # HTML 应只 2 行
```

**判据速记**：`git show HEAD:agent-workbench.html | wc -c` 应 ≈ 580KB。若是 3.3MB 就是错的。

---

## 附录 C：已知例外与债务

> **v3.7.49 全面复核**：本附录原列 11 条，经 CDP 实测逐条复验后，
> **5 条为误判已删除**（C3/C6/C7/C10 + C5 降级），**1 条为真债已修**（C2），
> 其余为文献性记录。复核方法与证据见 `_probe/DEBT-REVIEW.md`。
>
> **误判为什么发生**（写入规范以免后人重犯）：早期探针用 `getComputedStyle` 扫全站，
> 但**未排除 `display:none` 子树**。浏览器对不可见元素**照样返回 computed 值**，
> 而那些值是「CSS 继承链断开后的 UA 默认值」，看起来像幽灵样式污染，实际元素根本没上屏。
> **判据：`el.getClientRects().length > 0`，或祖先链 `display` 不为 `none`。**

### C1. 控件高度的非标准档位是「组件专属尺寸」（非债务，补说明）

规范 §3 定义五档标准高度，实测还有 6 个非标准档位。复核确认**均为有意的组件专属尺寸**，
不应强行归并：

| 实测档 | 元素 | 归属判定 |
|---|---|---|
| 48px | `.topbar .tbtn`、`.mob-bar-btn` | ✅ 标准 XL 档（工具栏/移动底栏，触控密集） |
| 42px | 聊天面板输入区（`input`/发送键/附件键） | ✅ **聊天专属**（多行输入+发键等高的圆角胶囊） |
| 38px | `input`/`select`/`.ds-trigger`（约 70 处主力） | ✅ `--control-h` 标准档 |
| 36px | `.del`（列表删除键）、`.set-ic`（设置页图标容器） | ✅ **图标容器**，与图标 18px + padding 成对 |
| 33px | `.ph-ai-btn`（页头 AI 按钮） | ✅ 页头紧凑场景 |
| 32px | `.nav-item`、`.side-toggle`、`.kbtns button` | ✅ **导航/卡片操作专项**（见 §12 触控说明） |
| 30px | `.page-back`（返回键） | ✅ 页头紧凑场景 |
| 28px | `.addbtn.sm`、`.chat-panel-collapse` | ✅ `--control-h-sm` 标准档 |
| 25/24px | `.todo-bar-preview` / `.todo-bar-toggle` | ✅ 待办条折叠态专项 |
| 16px | `input[type=checkbox]` | ✅ 原生复选框，豁免 |

→ **结论**：无需改造。规范 §3 已补「组件专属高度白名单」。

### C2. 图标 18px 档位（v3.7.49 **已收敛为令牌**）

复核前记录「18px 14 处、15px 3 处，未收敛」。实测**真渲染**（排除 `display:none`）的 69 个图标：

| 实测 | 处数 | 归属 |
|---|---|---|
| 16×16 | 38 | ✅ `--icon-sm` |
| 18×18 | 12（稳态视图）→ **静态 14 处** | ✅ `--icon-set`（v3.7.49 收编） |
| 20×20 | 11 | ✅ `--icon-md` |
| 15×15 | 2 | ⚠️ `.page-head`/`.button` 各 1，零散残留 |

**关键发现（两次核查，首轮结论被推翻）**：首轮运行时探针只看到默认视图，
误判「18px 全来自 `.set-ic` 一条规则」。**静态扫描发现实为 14 处硬编码，散布 9 个组件**
（`.set-ic svg` · `.rail-btn svg`×2 · `.rail-ic` · `.chain-ic svg` · `.cmd li .ci` ·
`.side-toggle svg` · `.offline-banner .ic`+`svg` · `.user-avatar svg` · `.auth-sso-ic svg` ·
`.install-card .check`）。

> **教训**：运行时探针只能看到「当前视图渲染到的东西」。未打开的侧栏/抽屉/横幅/
> 命令面板等，其 CSS **静态存在但运行时测不到** → **静态扫描与运行时实测缺一不可**。

**修法**：新增 `--icon-set:18px` 令牌，14 处全部替换；**3 处非图标 18px 登记豁免**
（`.ov4-badge` 徽标 `min-width` · `.todo-chk` 原生复选框 · `.pet .pet-close` 圆形关闭键）。

`--icon-lg: 24px` 当前**零使用**（0 处），保留（空态/hero 备用）。

### C3. ~~字号幽灵值~~（v3.7.49 **误判，已删除**）

原记录「`13.3333px` 11 处，应显式设 `--fs-sm`」。**实测证明这些元素根本没在渲染。**

`13.3333px / 1px 6px / inline-block` 是**浏览器对 `<button>` 的 UA 默认值**。
命中元素全部位于媒体查询块内：

- `.mob-bar{display:none}`（726 行）→ 其内 `.mob-bar-btn` 规则整体位于
  `@media(max-width:767px)`（729 行起）
- `.side-sheet{display:none}`（728 行）→ `.side-sheet-close` 同理

**反证**：390px 视口（媒体查询生效）实测 `.mob-bar-btn` 为 `font-size:13px`（= `var(--fs-xs)`）、
`height:48px`、`min-height:48px` —— **规则完全正确生效**。桌面态量到的默认值纯属 UA 回退。

→ **无需任何修改。**

### C4. 断点残留

**v3.7.48 已收敛两处**：

| 断点 | 处数 | 处理 |
|---|---|---|
| ~~879px~~ | 1 | ✅ **已并入 1023**（原 `#recForm` 2 列档；与 `.form-row--board` 的边界统一） |
| ~~519px~~ | 1 | ✅ **已并入 520**（原 `#recForm` 1 列档；与 `.form-row--grid` 的 2→1 列边界统一，差 1px 无意义） |
| 479px | 1 | ✅ **登记为合法细分档**（极窄屏顶栏纯图标，语义独立，不与 520 合并） |
| 600px | 4 | ✅ 保留（细分档） |
| 520px | 2 | ✅ 保留（细分档） |

⚑ 守护：`tests/ui-spec-guards.test.js` 断言 879/519 **不得回潮**。

### C5. `.form-row--board` 的 `.fld-*` 尺寸类等值冗余（非债务，补说明）

五个尺寸类（`.fld-xl/.fld-lg/.fld-md/.fld-sm/.fld-fill`）确实全部声明为
`grid-column:span 3`（1125-1129 行），源码注释（1124 行）写明是 **v3.7.60 有意统一**为等宽四列。

**原描述「视觉无差别」有误**：实测宽度确有差异（`fld-sm=47` / `fld-md=182` / `fld-lg=249`），
但差异来自 **`#taskForm` 的 id 级 `grid-column` 定位**（1137-1148 行，优先级高于类选择器），
与 `.fld-*` 类无关。

→ **结论**：五条等值声明是冗余但无害的「统一后残留」，删除会丢失语义标签，
保留则表达「有意等宽」。**维持现状**，本节仅作说明。

### C6. ~~侧栏导航项触控高度~~（v3.7.49 **误判，已删除**）

原记录「`.nav-item` 32px < 44px 触屏建议」。**实测证明移动端根本不使用侧栏。**

- 桌面（≥1024）：`.nav-item` = 32px —— 鼠标指针精度下完全合理
- 平板（900px）：`.nav-item` = 35px，侧栏仍显示
- **手机（≤767）：`.side{display:none}`**（731 行），导航改用底部 `.mob-bar`
- 手机（390px 实测）：5 个 `.mob-bar-btn` **全部 height = 48px** ✅ 远超 44px 建议值

→ **移动端触控目标已达标**，无需修改。

### C7. ~~`--content-max` 注释漂移~~（v3.7.49 **误判，已删除**）

原记录「注释写 1240px，实测 1440px」。**实测证明注释完全正确。**

- `:root` 中静态定义 = `1240px`（100 行）
- `@media(min-width:1440px){ :root{--content-max:var(--content-max-wide)} }`（982 行）
  → 宽屏**有意抬升**到 `--content-max-wide:1440px`

在 1440px 视口下量到 1440px 是**预期行为**，注释「≥1440 视口抬升到 `--content-max-wide`」准确无误。

→ **误判，无需修改。**

### C8. 卡片 padding 旧文档错误

旧 `ui-standards.md` 写「`.card` 内边距 `var(--space-4)` = 16px」，
实测 **24px**（=`--space-6`）。本文档已纠正。

### C9. 启动正常但运行中 localStorage 配额超限

存储安全壳（v3.7.46）只覆盖"启动时不可用"，未覆盖"运行中写入超限"。
已知取舍，非缺陷。

### C10. ~~颜色对比度未自动化~~（v3.7.49 **误判，已删除**）

原记录「对比度只能 CDP 人工核对」。**实测 `tests/e2e/theme-matrix.spec.js` 已含对比度断言**
（含 luminance 计算与 contrast ratio 判定），覆盖 11 套主题的渲染层。

→ **误判，无需补充。**

### C12. 复核方法论：量 computed 前必须先判「是否在渲染」

本轮 5 条误判里，**4 条的同一根因**：

```js
// ❌ 错：display:none 子树照样有 computed 值，且是 UA 默认值
const fs = getComputedStyle(el).fontSize;   // "13.3333px"（幽灵值）

// ✅ 对：先确认真的上屏
if (!el.getClientRects().length) continue;  // 或逐级检查祖先 display
const fs = getComputedStyle(el).fontSize;   // 真实生效值
```

`getComputedStyle` **不因 `display:none` 而返回空** —— 它返回的是
「该元素在**假设被渲染**时的样式」，继承链在 `display:none` 处即断开，
于是大量属性回落到 UA 默认值。这些值看起来像「幽灵样式污染」，极具迷惑性。

**同时必须核对规则的媒体查询归属**：`.mob-bar-btn{...}` 在源码里写了
`font-size:var(--fs-xs)`，但整块位于 `@media(max-width:767px)` 内 ——
桌面态不生效是**正确行为**，不是遗漏。

→ 已同步写入 §6.5「写注释的两条禁令」之后，作为第三条禁令。

### C11. `#recForm` 固定列位在窄屏越界（v3.7.48 **已修**）

**症状**：断点收敛后，`#recForm` 在 ≤1023px 的列宽塌陷。CDP 实测：

| 视口 | 修前 | 修后 |
|---|---|---|
| 1023px | `89.8 89.8 213 38` ⚠️ | `225 225` ✅ |
| 900px | `28.5 28.5 213 38` ⚠️ | `166 166` ✅ |
| 768px | `0px 0px 138 38` 🔴 | `100 100` ✅ |
| 520px | `0 185 185 38` ⚠️ | `444` ✅ |

**根因**：`#recForm>.fld:has(>textarea){grid-column:1/4}`（id 特异性）与
`#recForm>.add-wrap{grid-column:4}` 在 2 列/1 列布局里**越界** → Grid 造隐式列，
把真实列挤成 0px。

**正确姿势**（同 MEMORY §5.4）：
- 必须**同特异性成对解除** `grid-column` **与** `grid-row`——只解 column 会被残留的
  `grid-row:1` 钉住，再引发 auto-placement 造隐式列。
- 解除规则必须**保留 `#recForm` 前缀**（同特异性才压得过 id 规则）。

⚑ 守护：`tests/ui-spec-guards.test.js` 的「#recForm 固定列位在窄屏必须成对解除」三条
（已做**故障注入验证**：移除解除规则后立刻变红）。

---

*本文档由 v3.7.48 制定。所有 ⚑ 实测数据来自 `_probe/measure-spec.mjs`（1440×900 视口）。*
