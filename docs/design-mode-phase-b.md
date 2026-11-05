# Design 模式 Phase B 设计方案（draw.io 式画布编辑器）

> 状态：**批次①–④全部落地并经 CI 验证**（①–③随 `b9aefc6`，④含 AI 桥随 **v3.7.153** 发布）。
> 2026-10-31 ZCode 会话起草、用户审核「通过」，随后用户点单画流程图/架构图即实现本批。
> 前置：Phase A（`docs/draw-capability-phase-a.md`，已落地）——导出助手、产物卡模式、AI 工具管线均复用。
>
> **与本节原文的差异（实现期的真实情况，逐条对上）**：
> - 批次④拆成两半：**导出 + 缩放 + 窄屏单栏 + 连线 label + 体积预算 + 文档**已随
>   `fcd0912`（原 `d684bf5` rebase 后）/`e6e9817`/`b9aefc6` 落地并经 CI 验证；
>   **AI 桥「在画布打开」由 Qoder 会话 2026-11-02 落地**（`f5769e4` + 用例自纠 `6716d92`，
>   CI `41371420355` 四腿 success / Deploy `41371420361` 绿，随 v3.7.153 上线）——实现注记见第七节末。
> - 原第八节表格写「④ ... 文档全量」——文档已随同批补进 `docs/user-manual.md` §3.1 与
>   CHANGELOG `[Unreleased]`，不是删掉，只是没等第四批。
> - 原「~250 行 + 4 例」的预估：批次④实际产出 ① ② ③ 三批合计 ~1250 行、测试 21 例 + 追加
>   e2e 4 例（窄屏）+ `draw-canvas` 扩到 14 例 —— 规模预估总体准确，超出的是 e2e（jsdom 量不出布局）。
> - **Q3 仍保持 MVP 口径**（节点统一 `var(--panel)`、无语义色映射）：实测 9 个主题里
>   `--ok/--warn/--danger` 各有 9 处定义（可用），但 **`--ok-soft` 全仓 0 处**
>   ⇒ 「给异常分支换底色」这条路现在走不通，要么先补 `--ok-soft` 一族，要么 Phase C 一起做。

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
碰撞绕行留 Phase C）〔**Phase C3 已把绕行做了**，2026-11-03，见第九节 Q1；仍是"有界搜索"而不是全图 A*〕。

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
  选中态 = class + 8 手柄；连线 = 正交三段 path（中点出发，MVP 不绕障）+ 箭头 marker
  〔Phase C3 起：撞了才改成有界绕障，不撞时输出逐字节不变；标签落点随之走同一条路由〕。
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

**实现注记（2026-11-02 Qoder 落地，`f5769e4` + 用例自纠 `6716d92`，随 v3.7.153 上线）**
- 落点：按钮加在**导出条上**（`_svgExportBar(name, extra)` + Util 侧的 `_svgToCanvasBtn`）；
  AI 层只出标记 `data-canvasembed`，**点击委托与画布逻辑都在 Draw 层**
  （`dcBindChatBridge` 绑文档级 —— 卡片是 innerHTML 重建的，与 `_bindSvgExport` 同一套理由）。
- 载荷：`dcEmbedPayload` 入库前过 `sanitizeSvg`，只取根节点的**子内容 + 定标框**（`viewBox` 优先，
  退化到 `width/height`；两者都缺 ⇒ 整张拒，不放一张会失真的 0×0）。渲染为 `g.dnode` 里的**嵌套 `<svg>`**，
  随节点尺寸缩放，外加虚线框与透明热区。
- 三条与原文不同的实现决定（都各有判据）：
  ① **底稿垫底** —— 渲染分两趟，embed 先画；否则"后加的 AI 图"会盖住用户手工画的节点，与"垫底加工"相反。
  ② **预算前置** —— 单图 128KB 的字节数在**改动之前**算，超了就不碰文档、不压 undo；
     `_dcSaveDoc` 返回值被接住，写盘失败回滚内存态（不留"半条底稿"）。
  ③ **文字维度封两处** —— `dcSetNodeText` 公开入口 + 双击（同判据，不只拦 UI），双击给专用回执而不是静默无反应。
- 已知边界（原文未列，实测后如实记）：底稿内的 `id`（marker / gradient / clipPath）原与画布自身、
  与别的底稿**共享同一文档 id 空间**，同名会互相覆盖 ⇒ 表现为箭头/渐变串色。
  **这条已在 Phase C1 关掉**（2026-11-03）：入库前给 inner 里所有 id 加本底稿专属前缀 `dce-<uid>-`，
  并成对重写 `url(#x)` 与 `href="#x"` 两类内部引用（`sanitizeSvg` 只放行这两类，覆盖面即全部）；
  节点上留 `pfx` 字段，v3.7.153 那批无 `pfx` 的老底稿在载入时一次性补隔离并回写
  —— 补完超单图 128KB 或总量 1MB 就**整图还原不写**，宁可不优化也不在启动面上冒存储告警。
- 覆盖：单测 8 例（`draw-canvas` ⑭–⑱b，含反向对照与 6 条窄变异自证）+ e2e 2 例
  （`tests/e2e/draw-embed-bridge.spec.js`：真点按钮 → 底稿真有外框尺寸 → 真指针拖动 → 落盘带回 inner）。
  e2e 不是可选：jsdom 没有布局引擎，**量不出这张嵌套 `<svg>` 到底有没有被画出来**。
  C1 再加单测 8 例（⑲–㉑c + ㉒）与 e2e 2 例（④⑤）—— id 解析是浏览器行为，jsdom 既不解析也不判重。

## 八、落地顺序（四批，每批过 CI）

| 批次 | 内容 | 预估 |
|---|---|---|
| ① | DiagramDoc 模型 + 画布渲染（节点/连线）+ 选择/拖动/吸附 | ~350 行 + 6 例 |
| ② | resize 手柄 + 连线模式 + 双击文字 + Delete | ~300 行 + 5 例 |
| ③ | 快照 undo/redo + 持久化 + 图列表停靠 + **Design 模式三预设集成** | ~350 行 + 6 例 |
| ④ | 导出（复用 Phase A 助手）+ 缩放 + AI 桥「在画布打开」 + 文档全量 | ~250 行 + 4 例 —— **✅ 四批全落地**（AI 桥 2026-11-02，见第七节实现注记） |

**规模预估**：~1250 行 + 21 例测试，跨 4 批。是本会话最大单特性——审核重点请放在
第四节（架构）与第五节（交互清单）：这两张表定下来，后面都是体力活。

## 九、开放问题（Q1–Q4 均已定案 · 判据落在代码里）

- **Q1 连线路由**：MVP 直角三段（中点水平出发）不绕障，接受吗？（绕障 = Phase C）
  —— **已在 Phase C3 落地**（2026-11-03）：撞了才做**有界**搜索（层数 3、每层前沿 8、绕障留白一个网格 10px），
  同层取"不撞且最短"，预算用尽仍不通则**退回默认三段**；没东西挡路时输出串与 MVP 那版**逐字节相同**
  （回归面只落在真撞了的边上）。中点标签随同一条路由，不会飘回被绕开的那段上。
  判据：`tests/draw-canvas.test.js` ㉓–㉘（含"末端锚点必须被保留"那条，它抓出了 splice 吞 `q` 的真缺陷）
  + `tests/e2e/draw-edge-routing.spec.js`（真浏览器用 `getPointAtLength`/`getScreenCTM` 采样，
  并与"故意横穿的假线"做对照，防采样器空转）。
- **Q2 文本编辑**：浮层 input（MVP）vs contenteditable 就地编辑（更 draw.io，实现重）——倾向前者。
  —— **定案：浮层 input**，四批全落地后仍是这一形态（2026-11-05 复核）。理由与实现同一处：
  `src/draw-canvas.js:689` 的函数注释就是判据 ——「浮层而非 contenteditable：后者带选区与 XSS 双坑」。
  落点：`:692` 建 `input`、`:696` 用 `position:fixed` 按节点 rect 居中并压到 `z-index:var(--z-max)`；
  双击进入编辑的时间窗判据是 `_dcLastTap`（`:350`）。
  ⚠️ contenteditable 那条不是"实现重"这么轻：它会把用户 HTML 直接放进产物 SVG，
  而本仓的画布产物要走 `sanitizeSvg` 白名单（Phase A 批次③），就地编辑等于给自己开一个绕过面。
- **Q3 颜色/样式**：MVP 节点用主题色令牌（与 mini-chart 同源），不给取色器——够吗？
  —— **定案：只用主题色令牌，画布内不给取色器**（2026-11-05 复核，现状与 MVP 口径一致）。
  判据在 `_dcShapeSvg`（`src/draw-canvas.js:353-355`）：`stroke = selected ? var(--accent) : var(--line)`、
  `fill = var(--panel)`；连线 `:549` 用 `var(--accent)`/`var(--text)`，拖拽预览 `:561` 用 `var(--accent)`。
  可调的样式维度只有**形状**（rect / round / ellipse / diamond / embed，`:358-371`）与**线宽**（选中 2.5 / 常态 1.5）。
  取色器在本仓确实存在，但只在主题与场景编辑器里（`src/ui-drawer.js:61,71,1228,1298`、`src/render-entry.js:660`），
  `draw-canvas.js` 里一个都没有 —— 这是刻意的：画布产物要跟着主题走，
  写死 hex 会在换主题时组成不可读的搭配（B 批次「场景色令牌化」治的就是这个病）。
- **Q4 图的上限与配额**：50 张（对齐产物账），单图节点上限 200（防卡顿）——可以吗？
  —— **定案：50 张 / 单图 200 节点，另加一条当时没写的总量预算 1MB**（2026-11-05 复核）。
  三个数都是常量、且**都有机械执行点**，不是文档口径：`src/draw-canvas.js:21-22` 的
  `DIAGRAM_MAX = 50` / `DC_NODE_MAX = 200`，加 `:28` 的 `DC_ALL_BYTES_MAX = 1024 * 1024`。
  执行点：列表侧 `_dcSaveList`（`:43-44`）先截到 50 张再算字节、超预算 toast 且**不落盘**；
  `dcCreate`（`:67`）夹住列表长度；节点侧 `dcAddNode`（`:124`）与 `dcAddEmbedNode`（`:245`）
  都在达上限时 toast `draw.nodeMax` 并返回 null。
  后两处刻意**在改动之前**判（`:242` 的注释写明「预算在改动之前算：超了就不碰文档、不压 undo」）——
  否则上限会留下半条数据 + 一条无法回退的 undo。

## 审核记录

- 2026-10-31 起草（ZCode 会话），**待用户审核**。通过后按批次①→④实现（每批过 CI）；
  若只通过部分（如先不要 Design 模式集成、只要独立编辑器），在批注里写明即可，批次可裁。
- 2026-11-05 收口（Qoder 会话）：上面那条「待用户审核」已过期 —— 四批全部落地（见第八节表尾），
  第九节 Q1–Q4 四条全部定案，判据逐条改写成「代码里的行号 + 为什么」而不是「倾向前者」。
  改写前逐个 grep 过现值（`:242` 那条注释原本被我写成 `:243`，已订正）——
  文档里的行号是会漂的，所以这一节引用的是**判据所在的行**，不是"实现大概在附近"。
