# Design 模式 Phase B 设计方案（draw.io 式画布编辑器 · 待审核）

> 状态：**待审核（未实现）**。2026-10-31 ZCode 会话起草。审核通过后按第九节四批实现。
> 前置：Phase A（`docs/draw-capability-phase-a.md`，已落地）——导出助手、产物卡模式、AI 工具管线均复用。

## 一、目标（用户点单 → 一句话产品定义）

对标 draw.io 的核心手感，在 Agent 工坊里**手动画流程图/架构图**：拖出形状、连线、改文字、导出。
落点是用户点单的**第三模式**：Work（现有布局）/ Code（agent-first 三栏）/ **Design（画布优先）**。

**MVP 完成判据（draw.io 四件套）**：
1. 从形状栏拖出/点击放置矩形、圆角矩形、椭圆、菱形，双击改文字；
2. 从形状边缘拖出连线到另一形状（正交三段 + 箭头），删除连线；
3. 点选后拖动移动、8 向手柄缩放，Delete 删除，Ctrl+Z/Y 撤销重做；
4. 多图管理（新建/重命名/复制/删除，自动保存），导出 SVG/PNG（复用 Phase A 助手）。

## 二、非目标（防蔓延，列明不做）

多选/框选、图层、模板库、形状库扩展（MVP 四种）、协作、触屏多点手势、AI 深度操纵图元
（AI 桥见第七节，MVP 只有"从聊天产物卡在画布打开"这一条窄桥）、连线自动绕障（MVP 直角三段，
碰撞绕行留 Phase C）。

## 三、关键资产与选型

| 事实 | 出处 | 对 Phase B 的意义 |
|---|---|---|
| `_dgmSvgHtml(d)`：`{nodes:[{id,x,y,w,h,text}],edges:[{from,to}]}` → SVG（节点+中点连线）已存在 | render-overview.js:2262（依赖图展示用，只读） | **数据模型与渲染底子现成**；编辑器在其上加交互层，不从零画图 |
| miniChart/`_miniBarSVG` 等手写 SVG 先例 | render-scene-main.js:384 | 本仓"手写 SVG + 数据驱动"路线成熟，无图表库依赖 |
| 导出助手 `_svgToPngBlob`/`_downloadBlob`/`_svgExportBar` | util-markdown.js（Phase A） | 画布导出零新代码 |
| 模式基建：`.body.code-mode` CSS 预设 + `wb_agent_uimode` 持久化 + toggle 循环 | render-widgets.js:3843（Code 模式） | 第三预设 = 同款一处 CSS + 一个枚举值 |
| 产物卡/工具注册/ai-tools-doc 门禁管线 | ai-tools.js、gen-ai-tools-doc | AI 桥与工具文档同步路径现成 |

**选型：自研轻量 SVG 编辑器，不 vendor draw.io / Excalidraw。** 理由：draw.io embed 是 10MB+ iframe
（postMessage 集成 + file:// 加载复杂度 + 双份存储），Excalidraw 绑 React（本仓无框架）；两者都违背
"零新依赖、单文件 PWA"的产品底座。自研 MVP 的量级（四件套）与本仓 miniChart/ui-mode 的既有
先例同数量级。

## 四、架构

- **数据模型**（复用并扩展 `_dgmSvgHtml` 的形状）：
  ```js
  DiagramDoc = { id, title, updatedAt,
    nodes:  [{ id, type: "rect"|"round"|"ellipse"|"diamond", x, y, w, h, text }],
    edges:  [{ id, from: nodeId, to: nodeId, label }] }   // 连线几何渲染时算，不入存储
  ```
  存储：`wb_agent_diagrams`（文档数组）+ `wb_agent_diagram_active`。多图上限 50（对齐产物账纪律）。
- **命令系统**：每次提交变更（加/删/移/缩/连线/改文字）前压快照栈（JSON 序列化，cap 50），
  Ctrl+Z/Y 弹栈——MVP 用快照而非 delta，简单可靠。
- **渲染**：数据 → SVG 字符串全量重绘（同 renderChat 口径）；节点 = `<g class="dnode" data-id>`，
  选中态 = class + 8 手柄；连线 = 正交三段 path（中点出发，MVP 不绕障）+ 箭头 marker。
- **交互层**：pointerdown 命中测试（节点/手柄/画布空白）→ pointermove 拖拽（网格吸附 10px）→
  pointerup 提交命令压栈；双击节点 → 文本编辑浮层（input 覆盖定位，回车/失焦提交）。
- **Design 模式**：`.body.design-mode` 第三预设——中 = 画布 + 工具条（形状/连线/删除/undo/redo/
  导出），左 = **图列表停靠**（新建/打开/删除，对齐会话停靠交互），右 = 属性面板（选中节点的
  文字/颜色占位）+ AI 停靠（复用 agent_dock）。切换循环 work → code → design → work；
  i18n `ui.mode.design`（设计）。**模式=布局预设，不 gate 能力**（Work/Code 里画图工具照用——
  工具箱内亦可嵌入同一编辑器组件，后续）。
- **新 src 块**：`src/draw-canvas.js`（Draw · 画布层，预估 800-1000 行）——独立成块而非塞进
  render-widgets（4K 行），模块图 39→40 基线重生成 + ARCHITECTURE 契约补一段。

## 五、MVP 交互清单（验收 = 这张表逐条过）

| 交互 | 规格 |
|---|---|
| 放置 | 点工具条形状 → 画布中心放置；或拖拽放置（按下即拖） |
| 选择 | 单击节点；空白处点击取消选择 |
| 移动 | 拖动选中节点，10px 网格吸附 |
| 缩放 | 选中后 8 向手柄，最小 40×30 |
| 连线 | 连线模式下从节点边缘按下拖到目标节点松开（近中心 30px 吸附），Esc 取消 |
| 文字 | 双击节点 → 浮层 input，Enter/失焦提交 |
| 删除 | 选中后 Delete 键（连线随节点删除） |
| 撤销 | Ctrl+Z / Ctrl+Y，快照栈 cap 50 |
| 缩放 | 工具条 +/−/100%/适应（viewBox 级） |
| 导出 | SVG/PNG（Phase A 助手）；另存 .json（后续导入） |

## 六、测试计划

- **jsdom 守护（~15 例，`tests/draw-canvas.test.js`）**：模型 CRUD、命中测试、快照栈
  undo/redo、网格吸附、序列化往返（JSON→SVG→含 data-id）、连线生成（三段正交几何）、
  持久化（保存/载入/上限）、Design 模式切换与持久化、ai-tools-doc 门禁如涉新工具。
- **Playwright 冒烟（1 条，`tests/e2e/draw-canvas.spec.js`）**：真指针拖出两个矩形 + 连线 +
  导出 SVG 下载（对齐本会话 Phase A 验收手法）。
- **门禁**：module-graph 基线 39→40、ARCHITECTURE 补 Draw 层契约、i18n 双语、CHANGELOG。

## 七、AI 桥（窄桥，MVP 含）

聊天里 `draw_svg` 产物卡（Phase A）加一个按钮「**在画布打开**」：
- MVP 语义：把该 SVG **作为底稿嵌入当前图**（一个 `type:"embed"` 节点，不可逐图元编辑，
  可整体移动/缩放/删除）——SVG→图元的自动识别（rect/text/path → 图元）是 Phase B2 的活，
  MVP 不承诺。
- 价值：AI 生成的架构图从"聊天里看一眼"变成"画布上可继续手工加工"——这是 Design 模式
  相对纯聊天的核心增量，也是当初"模式后置"判断里画布闭环的最后一环。

## 八、落地顺序（四批，每批过 CI）

| 批次 | 内容 | 预估 |
|---|---|---|
| ① | DiagramDoc 模型 + 画布渲染（节点/连线）+ 选择/拖动/吸附 | ~350 行 + 6 例 |
| ② | resize 手柄 + 连线模式 + 双击文字 + Delete | ~300 行 + 5 例 |
| ③ | 快照 undo/redo + 持久化 + 图列表停靠 + **Design 模式三预设集成** | ~350 行 + 6 例 |
| ④ | 导出（复用 Phase A 助手）+ 缩放 + AI 桥「在画布打开」 + 文档全量 | ~250 行 + 4 例 |

**规模预估**：~1250 行 + 21 例测试，跨 4 批。是本会话最大单特性——审核重点请放在
第四节（架构）与第五节（交互清单）：这两张表定下来，后面都是体力活。

## 九、开放问题（审核时拍板）

- **Q1 连线路由**：MVP 直角三段（中点水平出发）不绕障，接受吗？（绕障 = Phase C）
- **Q2 文本编辑**：浮层 input（MVP）vs contenteditable 就地编辑（更 draw.io，实现重）——倾向前者。
- **Q3 颜色/样式**：MVP 节点用主题色令牌（与 mini-chart 同源），不给取色器——够吗？
- **Q4 图的上限与配额**：50 张（对齐产物账），单图节点上限 200（防卡顿）——可以吗？

## 审核记录

- 2026-10-31 起草（ZCode 会话），**待用户审核**。通过后按批次①→④实现（每批过 CI）；
  若只通过部分（如先不要 Design 模式集成、只要独立编辑器），在批注里写明即可，批次可裁。
