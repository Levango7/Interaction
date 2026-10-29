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
→ AI 直接产出 SVG 源码（LLM 擅长）；服务端（其实都在前端管线）做**安全子集过滤**后
  1) 内联渲染为聊天里的产物卡（.svg-msg，白底容器，固定 max-height 可滚动）；
  2) _aiArtifactPush({kind:"svg", title, tool:"draw_svg"}) 进「AI 行动」统计；
  3) 卡上「SVG / PNG」导出按钮 = A1 同一助手。
```
**不做**：存入笔记库（第一版产物随会话；持久化列开放问题 Q3）；尺寸/图层编辑（Phase B 画布的事）。

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

## 十、开放问题（审核时请拍板/知悉）

- **Q1 PNG 污染**：mermaid htmlLabels 的 foreignObject 在部分内核 `canvas.drawImage` 会污染或空白。
  方案取「SVG 必成、PNG 如实降级」，接受吗？（替代：引 resvg-js 之类纯 JS 栅格化，+依赖，不建议）
- **Q2 产物持久化**：第一版 SVG 随会话存（刷新不丢——聊天消息本就落盘），不进笔记库/独立画廊。够吗？
- **Q3 Electron 下载**：`<a download>` 在 Electron 内嵌页通常可用，但需真机验一次；不可用则走
  Electron 主进程保存对话框（一行 IPC，Electron 批再处理）。
- **Q4 工具名**：`draw_svg` vs `draw_sketch` vs `generate_svg`。倾向 `draw_svg`（名实相符：产出就是
  SVG 源码，不假装是位图生成）。

## 审核记录

- 2026-10-30 起草（ZCode 会话），**待用户审核**：通过 / 修改意见 / 否决。通过后按批次①→④实现，
  每批过 CI 后再下一批；安全批③先于工具批④（先有围栏再养动物）。
