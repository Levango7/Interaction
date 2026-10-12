# 跨项目可复用的视觉回归模板 · 设计方案（2026-10-12）

> 用户需求：七个前端项目（Interaction / corps / OpsMesh / Levee / NexusChain / NexusSky /
> Modulo / FlintSpark）各有一套 e2e，但没有**共享的视觉回归机制**。本文设计一个可复用的
> 内部模板，先在一个项目落地，再复制到其余项目。

## 一、现状调研（不重复造轮子）

| 项目 | 现有机制 | 性质 |
|---|---|---|
| **Interaction** | `theme-matrix.spec.js`（11 主题 × 对比度计算 + 可见性 + 溢出） | **渲染层不变量**，不依赖像素基线 → 本机与 CI 一致 |
| **corps** | `ui-style.spec.ts`（emoji/图标复用/最小字号硬断言）+ `ui-layout.spec.ts`（包含块劫持）+ CI 有 `--update-snapshots=missing` 但 **无 spec 实际调用 `toHaveScreenshot`** | 风格硬断言已成熟；像素基线机制**空转** |
| **Modulo** | `scripts/shot-window.ps1`（桌面窗口手动截图 + 像素 diff 工具） | 手动工具，非自动化门禁 |
| **其余项目** | 各自 e2e（功能回归），无视觉回归 | 缺口 |

**关键发现**：各项目的「视觉」守护实际是**两类不同的东西**，不该混为一谈：

1. **渲染层不变量**（Interaction/corps 已做）：对比度、可见性、溢出、样式硬断言。
   **不依赖像素基线**，本机与 CI 结果一致——这是主力，应统一模板化。
2. **像素基线比对**（corps 空转、Modulo 手动）：`toHaveScreenshot` 逐像素 diff。
   **本机与 CI 因字体/渲染差异不可比**，只能 CI-only。这是补充，需谨慎设计。

**模板的核心判断：主推第 1 类（渲染层不变量模板化），第 2 类做成可选插件。**

## 二、模板架构

```
visual-regression-template/
├── README.md                      # 接入指南（5 分钟）
├── playwright.config.visual.ts    # 独立 config（不污染主 e2e）
├── specs/
│   ├── contrast-matrix.spec.ts    # 主题 × 关键配色对比度矩阵
│   ├── visibility-matrix.spec.ts  # 主题/视口 × 核心控件可见性
│   ├── overflow-matrix.spec.ts    # 各断点横向溢出扫描
│   └── style-rules.spec.ts        # 项目自定义硬断言（emoji/字号/图标复用）
├── helpers/
│   ├── theme-list.ts              # 主题清单（各项目覆盖写）
│   ├── contrast.ts                # WCAG 对比度计算（共享内核）
│   ├── viewport-list.ts           # 断点清单（375/768/1280/1920）
│   └── measure.ts                 # 元素测量工具（可见性/尺寸/溢出）
├── baselines/                     # 可选：像素基线（CI-only）
│   └── README.md                  # 何时启用/如何更新
└── .github/
    └── visual-regression.yml      # 独立 CI job（可复制）
```

## 三、核心设计决策

### 1. 渲染层不变量是主力（本机+CI 一致）

**为什么**：像素基线在本机因系统字体栈差异不可比（corps 的 spec 已 `test.skip` 本地），
而渲染层不变量（对比度、可见性、溢出）**任何环境都能跑，结果确定**。模板 80% 的价值在这里。

**对比度矩阵**（以 Interaction 的 theme-matrix 为原型）：
- 输入：主题清单 × 关键前景/背景配对清单（各项目覆盖写）
- 计算：运行时 `getComputedStyle` 取真实色值 → WCAG 对比度公式
- 阈值：**实测定基线**（当前最小值 - 余量），不照抄 4.5:1（现状低于理想值时会造成基线红，掩盖新回归）
- 断言：每套主题每对配色 ≥ 阈值；关键控件可见；无横向溢出

### 2. 像素基线做成可选插件（CI-only）

**何时启用**：仅当项目有**稳定的视觉契约**（设计系统已定型），且愿意维护基线快照。

**机制**：
- 独立 `playwright.config.visual.ts`（`testMatch: **/*.visual.spec.ts`）
- CI job 专用，`--update-snapshots=missing` 首跑记录，提交入库
- spec 顶部 `test.skip(!process.env.CI)` 强制 CI-only（本机跳过）
- 基线变更需人工 review（PR diff 里看 PNG）

**风险控制**：字体渲染差异导致 flaky → 基线只在**同镜像同 chromium** 的 CI 环境比对；
本机永远跳过；阈值用 `maxDiffPixels` 容错（不用 0）。

### 3. 项目适配层（各项目覆盖写的部分）

```typescript
// helpers/theme-list.ts —— 各项目改这里
export const THEMES = [
  { name: "light", attr: "data-theme", value: "" },
  { name: "dark", attr: "data-theme", value: "dark" },
  // ... 按项目实际主题数补充
];

// helpers/contrast-pairs.ts —— 各项目改这里
export const CONTRAST_PAIRS = [
  { name: "正文/背景", fg: ".prose", bg: "body" },
  { name: "侧栏项/侧栏底", fg: ".nav-item", bg: "#side" },
  // ... 按项目关键 UI 补充
];
```

## 四、落地路径

1. **原型**：在 Interaction 已有 `theme-matrix.spec.js` 基础上，抽出共享内核
   （对比度计算、视口测量）成 `helpers/`，验证等价性。
2. **模板化**：加 `style-rules.spec.ts`（从 corps 的 ui-style 抽 emoji/字号/图标复用）。
3. **试点**：复制到 corps（它已有 CI 的截图空转机制，正好补上 spec 层）。
4. **推广**：按需复制到 OpsMesh / Levee / NexusChain / NexusSky / Modulo / FlintSpark。

## 五、明确不做

- 不做通用「任意页面截图」——那是 tester-army/e2e 的领域（自然语言驱动），
  且需要模型订阅，不适合做门禁。
- 不做像素基线的**本机**比对（字体差异不可比，做了就是 flaky 源）。
- 不替换各项目已有的功能 e2e（那是另一层，本模板只补视觉层）。

## 六、预期收益

| 项目 | 当前视觉守护 | 模板化后 |
|---|---|---|
| Interaction | theme-matrix（11 主题） | 同左 + 可复制到其他项目 |
| corps | ui-style + ui-layout + 空转截图机制 | 同左 + 渲染层矩阵 + 像素基线插件启用 |
| OpsMesh/Levee/NexusChain/NexusSky/Modulo/FlintSpark | 无或手动 | 渲染层矩阵（本机+CI 一致） |
