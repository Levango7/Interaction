# 画图能力 Phase A 设计方案（聊天内真能力 · 模式后置）

> 状态：**待审核（未实现）**。2026-10-30 ZCode 会话起草，用户审核通过后才动代码。
> 审核结论写在本文件末尾「审核记录」节；通过后按「落地顺序」逐笔实现，每笔独立可回退。

## 一、背景与结论（为什么 Phase A 不含"Design 模式"）

用户点单：对标主流 agent（Trae 等）加一个 **Design 模式**，与 Work / Code 并列——写代码、办公、画图三
分。评估结论（2026-10-30 与用户对齐）：

- **主流不把"画图"当模式**：Trae 的 Chat/Builder/SOLO 是**自主度**轴；Claude/ChatGPT 的 Artifacts /
  Canvas 是**产物类型**；v0/Lovable 整个产品就是画布；Figma 的 Design/Dev 是同一制品的双视图。
  "代码/办公/画图"的任务域三分，在主流产品里没有先例。
- **本仓现状撑不起一个模式**：28 个 AI 工具里与"图"相关的只有 `render_chart`（bar/line/pie 内联块）与
  vendored mermaid（文本→图渲染）。没有画布、图元编辑、导出、"渲染→截图→自检"闭环。现在加 Design
  模式 = 换 CSS 类的聊天框 + 一个兑现不了的产品承诺——按本仓规范（R-37 假回执门禁同款价值观），这是
  **模式级假回执**。
- **决定**：Phase A 先把"画图"做成聊天里的**真能力**（本方案）；有了画布制品面之后，Design 模式作为
  布局预设（Phase B，另行立项）顺手加上——贵的从来不是模式，是画布。

## 二、范围与非目标

**范围（Phase A，三件事）**：A1 图表导出；A2 mermaid 确认与导出；A3 `draw_svg` 工具（AI 产出内联
SVG 草图 + 导出）。三件事全部发生在**现有 Work / Code 模式内**，不加新模式。

**非目标（明确不做，防蔓延）**：不做画布编辑器 / 图元拖拽 / 图层；不做图片生成（需要凭据，另行立项）；
不做 Design 模式（Phase B）；不改 `render_chart` 的数据契约；不动 WorkBuddy/Qoder 在途的 empty-catch
批次所涉文件。

## 三、现状盘点（全部已核实，带出处）

| # | 事实 | 出处 |
|---|---|---|
| 1 | `render_chart` 工具返回 `__CHART__{json}` 标记，聊天渲染走 `AppBridge.miniChart` = `renderMiniChart`，内部是 `_miniBarSVG/_miniLineSVG/_miniPieSVG`——**纯 SVG，零图表库** | ai-tools.js:172-177、render-entry.js:301、ai-tools.js:3410 |
| 2 | mermaid 已 vendor（10.9.1），出现 ```mermaid fence 时**按需懒加载** `vendor/mermaid/mermaid.min.js` | util-markdown.js:343+、package.json:68 |
| 3 | 文件下载已有 `URL.createObjectURL` + `<a download>` 先例（备份加密导出等），无中心化助手但模式统一 | render-widgets.js:1251、ui-backup-stats.js:89 |
| 4 | AI 产物跟踪已有 `_aiArtifactPush`（kind/task/record/note），统计页「AI 行动」卡消费 `aiArtifacts()` | ai-tools.js:266、render-overview.js:606 |
| 5 | 聊天 innerHTML 走 `sanitizeHtml`（util-markdown.js:245）；lint-xss 门禁盯新增 sink | util-markdown.js:245 |
| 6 | 加一个 AI 工具 ⇒ `check:ai-tools-doc` 门禁要求 docs/ai-tools.md 同步（工具总数 28→29 + 表格行 + 小节） | gen-ai-tools-doc 门禁，历史上真红过 |
| 7 | 剪贴板写必须走 `_copyTextWithReceipt`（R-37：回执等 Promise 落地） | render-entry.js |

## 四、A1：图表导出（PNG / SVG）

**行为**：聊天里每张 `.chart-msg` 卡片右上角加两个小按钮「SVG」「PNG」。点击即下载，文件名
`chart-<title或类型>-<YYYYMMDD-HHmm>.svg|png`。按钮渲染进 `renderMiniChart` 的包裹层（只在 AI 消息
管线里出现；工具箱离线卡 `render-overview.js:2548` 同函数复用，一并受益）。

**实现**：
- SVG：`chartEl.querySelector("svg")` → `XMLSerializer.serializeToString` → Blob(`image/svg+xml`) →
  既有 createObjectURL+anchor 模式。**同步、无依赖、必成**。
- PNG：同一 SVG → `Blob` → `Image` → `canvas`（2x 缩放，白底）→ `toBlob("image/png")`。**best-effort
  如实失败**：mermaid/foreignObject 类污染场景走 `onerror`/`toBlob=null` 分支，toast「PNG 导出不可用，
  已下载 SVG」（复用 ICS 导出「下载不可用环境如实返回 false」的口径，绝不假装成功——R-37 同款）。

**守护**（新 `tests/draw-export.test.js`，vitest + jsdom）：① SVG 导出产出合法 `image/svg+xml` Blob 且
含 `<svg`；② PNG 在 jsdom 无 canvas 2d 时**如实返回 false**（不抛、不假成功）；③ 文件名规则；④
`renderMiniChart` 输出含导出按钮且不破坏既有 `.mini-chart-wrap` 结构。

## 五、A2：mermaid 确认与导出

**先确认**（本方案的前置核查项，实现 A2 第一步就是补一个验证）：mermaid fence 在聊天里**已经渲染**
（util-markdown.js 懒加载 vendor）。若实测有版式/初始化问题，先修渲染再谈导出——**不带着坏渲染做导出**。

**导出**：与 A1 同一套 `svgToBlob/pngFromSvg` 助手（提取为 util，两处共用，不复制）。入口：mermaid 渲染
容器角落同款两按钮。PNG 的 foreignObject/htmlLabels 污染风险如实降级为「SVG 必成、PNG 尽力」。

**守护**：⑤ mermaid 容器渲染后存在 `svg` 节点；⑥ 导出按钮存在且点击触发下载（mock URL.createObjectURL）。

## 六、A3：`draw_svg` 工具（AI 草图）

**工具契约**（第 29 个工具）：
```
draw_svg { svg: string, title?: string }
→ AI 直接产出 SVG 源码（LLM 擅长）；做**安全子集过滤**后
  1) 内联渲染为聊天里的产物卡（.svg-msg，白底容器，固定 max-height 可滚动）；
  2) 卡上「SVG / PNG」导出按钮 = A1 同一助手。
```
**不做**：存入笔记库（第一版产物随会话；持久化列开放问题 Q3）；尺寸/图层编辑（Phase B 画布的事）。

> **实现期订正（2026-10-30，落地时如实改设计）**：原稿写「`_aiArtifactPush({kind:"svg"})` 进 AI 行动统计」是错的——
> 该账只收带 `refId` 的**可回访产物**（task/record/note），草图随会话、无可回访落点，入账即悬空引用（产物卡点了没反应）。
> 已订正为**不进账**；将来做持久草稿（笔记库/画廊）再回收此条。教训与 OD-002 同型：**承诺一个不存在的闭环**。

**SVG 安全子集（关键，必须先于功能被测试钉住）**：
- **标签白名单**：svg, g, defs, symbol, use(仅内部 #id), path, rect, circle, ellipse, line, polyline,
  polygon, text, tspan, title, desc, marker, linearGradient, radialGradient, stop, pattern, clipPath,
  mask, filter(仅 feGaussianBlur/feOffset/feMerge/feFlood/feColorMatrix)
- **一律剥除**：`script`、`foreignObject`、`iframe`、`object`、`embed`、`animate*/set`（SMIL 可被滥用
  于 UI 欺骗）、所有 `on*` 事件属性、`href/xlink:href` 中非 `#` 开头的引用（防外链/数据URI外呼）、
  `style` 属性中的 `url(...)` 与 `expression`
- **实现**：`sanitizeSvg(svgString)` 放 util-markdown.js（与 sanitizeHtml 同居），基于 `DOMParser` +
  白名单递归重建（**不是黑名单剥除**——黑名单必然漏）；产出再过现有 lint-xss 手工核查。
- **拒绝而非静默修正**：无根 `<svg>`、解析失败 → 工具返回 `{ok:false, msg}` 让模型重试，**不输出半成品**。

**守护**（`tests/draw-svg.test.js`）：① 8-10 个恶意样本（script/foreignObject/onload/外链 href/SMIL/
data:URI）逐个被剥或被拒；② 良性样本（渐变/文字/路径）无损通过；③ 无根 svg 拒绝；④ 工具注册后
ai-tools-doc 门禁口径（28→29 同步）；⑤ 产物卡渲染含导出按钮；⑥ `_aiArtifactPush` 收到 kind:"svg"。

## 七、i18n 清单（zh + en 双份，英不含中文）

`ui.mode.*` 不动。新增：`svg.cardTitle` / `svg.exportSvg` / `svg.exportPng` / `svg.pngUnavailable` /
`svg.invalid`(工具拒绝文案) / `chart.exportSvg` / `chart.exportPng` / `chart.pngFallback` / 共计约 9 键。
文件名时间戳格式不进 i18n（纯函数）。

## 八、门禁与文档影响

- `check:ai-tools-doc`：docs/ai-tools.md 28→29（总数、异步清单、表格行、`### 3.29 draw_svg` 小节）——
  **与工具同提交**，否则门禁红（历史教训：3fa0443 漏 spawn_agent 红一夜）。
- `docs/module-graph.md`：无新模块（助手进 util-markdown / render-entry 既有块），预期不动；跑了确认。
- `CHANGELOG.md`：[Unreleased] 段新增 2026-10-30 节（实现完成后写，不在本方案提交里）。
- `docs/user-manual.md`：AI 能力清单加 draw_svg 一行（实现批带上）。

## 九、落地顺序（每笔独立、独立可回退）

| 批次 | 内容 | 规模预估 |
|---|---|---|
| ① | `svgToBlob/pngFromSvg/downloadBlob` 助手 + A1 图表导出按钮 + 守护 ①-④ | ~150 行 + 4 例 |
| ② | A2 mermaid 渲染确认（有问题先修）+ 导出按钮 + 守护 ⑤-⑥ | ~60 行 + 2 例 |
| ③ | `sanitizeSvg` + 守护 ①-③（**先于工具落地**，安全件独立可审） | ~120 行 + 10 例 |
| ④ | `draw_svg` 工具 + 产物卡 + ai-tools-doc 28→29 + 守护 ④-⑥ + user-manual | ~180 行 + 3 例 |

**验收判据（Phase A 完成的定义，即当初立的三条真实任务）**：周报配图（render_chart→PNG 进文档）、
架构图（mermaid→SVG 导出）、海报草图（draw_svg→SVG/PNG 导出）——三个任务全程不离开聊天。

## 十、开放问题（Q1–Q4 均已定案 · 判据落在代码里）

> 2026-11-06 订正：这四条当年写的是「审核时请拍板」，而实现早已按其中一支落地并且发了版（随 v3.7.155
> 及更早的批次）。留着"待拍板"字样会让读的人以为还有决定没做，也让人没法判断哪一支是**故意**选的。
> 下面每条给的是**可复核的行号**（写前逐条 grep 现值）；当时没做到的边界照原样留着，
> 本轮补齐/订正的另在 ⚠️ 与审核记录里写明，不把"补过了"说成"当年就没问题"。

- **Q1 PNG 污染** —— 定案「**SVG 必成、PNG 如实降级**」，且不引 resvg-js 那类纯 JS 栅格化。
  判据分三层，但**别把 `securityLevel:"strict"` 当成压掉 foreignObject 的手段**（2026-11-06 订正：
  实测 vendor 默认 `htmlLabels:true`，`strict` 只禁脚本/外链，不阻止 foreignObject 生成）：
  ① 源头 —— mermaid 初始化显式 `htmlLabels:false` + `flowchart:{htmlLabels:false}`
  （`src/util-markdown.js:361`，本轮补的）；真正的兜底是渲染后 `_sanitizeMermaidSvg`
  （`:369`/`:375`）把 `script, foreignObject` 整块删除 —— 注意这会**连标签文字一起删**，
  这正是本轮 e2e 抓到的真实回归（缺 `htmlLabels:false` 时标签全空）；
  ② 转换链**任何一步不可用都 `resolve(null)`**（契约注释 `:465`、函数注释 `:549`、
  无 `document`/`URL.createObjectURL` 时提前返回 `:555`、`ctx.drawImage` 在 `:571`），
  调用方拿到 null 就降级成「已下载 SVG」并如实提示（`:608`，文案键 `draw.pngFallback` = `src/core-i18n.js:448`）；
  ③ 自动化现在两侧都有：失败侧 `tests/draw-export.test.js` ④（`toBlob→null` ⇒ 真下载 `.svg` + warn + 按钮复位）
  与 ④b（`createObjectURL` 抛错 ⇒ 只报「导出失败」并复位）；成功侧原以为没有断言，**订正**：
  CHANGELOG 970-971 记着 2026-10-30 在 Chromium 里真下载过 `架构草图-<时间戳>.png` **34,901 B**
  （Phase A 的"留真浏览器验收"当时已销账），缺的是**仓内回归** —— 本轮补进
  `tests/e2e/draw-export.spec.js`（draw_svg / render_chart 各导一张 PNG，并按像素断言红蓝块）。

- **Q2 产物持久化** —— 定案「**随会话存，不进 AI 产物账，不进笔记库/独立画廊**」。
  链路三段都有出处：SVG 源码直接进工具回执串（`src/ai-tools.js:191` 返回 `"__SVG__" + JSON`）⇒
  落盘走场景聊天键（`src/data-links.js:499`，并由 `:659` 的写穿镜像同步进该场景的激活 Session）⇒
  刷新后由 `renderChat`（`src/ai-tools.js:3402`）里的 `__SVG__` 分支重新渲染成 `.svg-msg` 卡片并挂回导出条
  （`:3447`）。**不进账是刻意的**：账只收「可回访的持久产物」（带真实 refId），草图没有可回访落点，
  进账就是留悬空引用（理由写在 `src/ai-tools.js:186-187`，断言在 `tests/draw-svg-tool.test.js:33`）。
  ⚠️ **「够吗」的真实答案带两条边界**：① 刷新不丢是真的，但**每个场景的聊天存储只留最近 50 条**
  （载入 `src/data-links.js:479`/`:693`、写入 `:498`、镜像 Session `:583`/`:674`）—— 这是**每场景
  工作缓冲/会话镜像的截断**，不是全局消息上限；AI 上下文另有 `trimChatHist`（`src/ai-tools.js:3527`，
  6000 token 预算、至少留 2 条；条数超 50 时裁到 50 但至少留 12 条）。草图作为聊天消息受前者约束。
  ② 要长期留图请导出文件；**设计模式画布不在这条链上，也不进 AI 产物账** —— 画布自持
  `wb_agent_diagrams`（文档数组 cap 50）+ `wb_agent_diagram_active`（`src/draw-canvas.js:9`，
  另有 200 节点/体积上限 `:26`），`aiArtifacts()`（`src/ai-tools.js:271`）里没有任何画布条目。

- **Q3 Electron 下载** —— **机制侧判据补齐；「需真机验一次」这笔账至今没平，本条不算已完成。**
  已核实的部分：下载收口在 `_downloadBlob`（`src/util-markdown.js:503`，先做能力守卫 `:505` 再
  `createObjectURL` `:506`，失败**如实返回 false** 而不是静默），且同款 `<a download>` 在桌面版已跑了多年
  （`src/render-widgets.js:1262`、`src/ui-backup-stats.js:90`/`:429`/`:1285`）；Electron 侧唯一的导航守卫在
  `electron/main.js:458`（`setWindowOpenHandler` `:459` + `will-navigate` `:464`），其 `_isInternalUrl`（`:434`）
  只放行本应用页面与 `about:`，**blob: 不在放行名单里** —— 这两件事叠起来的含义是：带 `download` 属性的同源
  blob 走下载通道、不发 `will-navigate`，所以按机制推理不会被拦；但**一旦**某种内核/版本把它降级成导航，
  守卫会 `preventDefault`，表现就是"点了没反应"。仓里没有 `will-download` 钩子（`session.defaultSession`
  仅出现在 CSP 安装处 `electron/main.js:150-153`），即默认下载行为未被改写。
  ⚠️ **未验的正是这一步**：改本笔之前，全仓同时含「真机」与「下载」的行只有本文档 Q3 这一句（原第 130 行），
  没有任何 Electron 侧记录（本笔之后仓里多出来的那些命中，都是这批新写的文字，不是证据）。**最短坐实路径**（留给有真机窗口的那一批，别在文档里预支结论）：起 Electron + CDP，
  渲染一张 `draw_svg` 卡，点「导出 SVG」，断言 `will-download` 触发且文件名前缀是 `chart-`/`draw`，
  同时断言 `will-navigate` **没有**被触发；两半都要有，只有前半说明不了守卫没插手。

- **Q4 工具名** —— 定案 **`draw_svg`**（名实相符：产出就是 SVG 源码，不假装是位图生成）。
  注册处 `src/ai-tools.js:371`（参数与描述同段 `:372-373`）、执行分支 `:188`、安全检查失败文案走
  `draw.invalid`（`:190`，键定义 `src/core-i18n.js:451`）；对外契约见 `docs/ai-tools.md:47`
  （表内第 27 号，**工具总数 29** —— 「第 29 个」是总数口径，别与表内序号混）与 §3.27（`:299`）。

## 审核记录

- 2026-10-30 起草（ZCode 会话），**待用户审核**：通过 / 修改意见 / 否决。通过后按批次①→④实现，
  每批过 CI 后再下一批；安全批③先于工具批④（先有围栏再养动物）。
- 2026-11-06 §十 四条由「审核时请拍板」改成「已定案 + 可复核行号」（台账 #117，与
  `docs/design-mode-phase-b.md` §九 在 D3 里治的是同一批病）。上面 ZCode 那条**原文一字未改**。
  顺带三条发现按原样写在 §十 里、不粉饰：① PNG **成功**侧无仓内自动化断言；② 「随会话存」
  受每场景聊天存储 `.slice(-50)` 约束；③ `tests/draw-svg-tool.test.js:5` 的头注释与实现相反
  （注释称产物落账 `kind:"svg"`，实现与用例都是**不进账**；该串全仓仅那一处命中）。
- 2026-11-06（同日第二批，用户「把现有的问题麻烦都解决一下」）把上面三条落到实处、并订正两处写错的判断：
  ① 原写「PNG 成功从未验收」**不成立** —— CHANGELOG 970-971 记着 2026-10-30 Chromium 实下载 34,901 B，
  缺的是仓内回归，已补 `tests/e2e/draw-export.spec.js`（像素级断言）；② 原写「`strict` 压掉 foreignObject」
  **不成立** —— `strict` 只禁脚本/外链，foreignObject 是渲染后消毒 `:375` 删的（连文字一起），
  本轮补 `htmlLabels:false`（`:361`）从源头消除；③ 原写「画布产物进账」**不成立** —— 画布自持
  `wb_agent_diagrams`，`aiArtifacts()` 无画布条目；④ `tests/draw-svg-tool.test.js:5` 的头注释已在
  取得该文件改动后修正（属越界修 ZCode 的文件，在此明写）。
