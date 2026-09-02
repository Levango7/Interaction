# 场景联动诊断报告（v3.2 任务 5）

> 范围：6 大内置场景（office/study/data/design/code/life）的功能卡（SCENE_FEATURES + SCENE_FEATURE_RENDER）
> 目的：找出现状的不足、不合理之处、缺哪些机制，作为下一轮改造的清单
> 状态：诊断报告（不动代码）

---

## 诊断方法

逐场景过审 3 件事：
1. **功能卡列表**（SCENE_FEATURES 里 tab 是否齐全）
2. **每个卡"展示什么/能操作什么"**（_featureCardHtml 的 fields/cols/rowAfter/sum）
3. **联动机制**（数据来源是否与其他场景打通）

---

## 一、办公 office（4 工具 + 1 概览）

| Tab | 数据键 | 字段 | 当前状态 | 缺什么 |
|---|---|---|---|---|
| 概览 | (default) | — | 任务看板 + 资料库 + 专属卡 | OK |
| 会议 meeting | `office_meetings` | title/date/attendees/conclusion | 4 字段，纯记录 | **缺行动项追踪**——会议结论落地谁负责？截止？状态？ |
| 项目 project | `office_projects` | name/status/priority/start/end | 5 字段基础 | **缺关联任务**（"这个项目的子任务"）+ 进度条（无 sum 区域） |
| 考勤 attendance | `office_attendance` | date/status | 2 字段极简 | **缺"迟到/早退/请假"细分**；没法看月度出勤率 |
| 报销 expense | `office_expense` | title/amount/category/date/status | 5 字段 | **缺金额合计**（sum 没金额列）；缺分类统计 |

**联动现状**：
- 会议 → 任务：未做（结论产生待办没有自动化）
- 项目 → 任务：未做（项目子任务无关联）

---

## 二、学习 study（4 记录 + 1 概览）

| Tab | 数据键 | 字段 | 当前状态 | 缺什么 |
|---|---|---|---|---|
| 概览 | (default) | — | OK | — |
| 知识库 knowledge | `knowledge` | title/category/content/tags | 4 字段 | OK |
| 阅读 reading | `readings` | title/author/status/rating/note | 5 字段 | **缺阅读进度/页数** |
| 练习 exercise | `exercises` | subject/question/answer/correct/explain | 5 字段 | ✅ 阶段二已加 SM-2 错题自动入复习队列 |
| 考试 exam | `exams` | title/subject/date/score/total | 5 字段 | **缺逐题回顾**——错题定位 |

**联动现状**：
- 练习错题 → 阅读：未做（错题对应的知识点没推荐阅读材料）
- 考试 → 知识库：未做（错题→知识库关联）

---

## 三、数据 data（3 工具 + 1 概览）

| Tab | 数据键 | 字段 | 当前状态 | 缺什么 |
|---|---|---|---|---|
| 概览 | (default) | — | OK | — |
| 报表 report | `data_reports` | title/type/value/note | 4 字段 | **缺"指标快照"标准格式**（用户要"5 步走"没数据源） |
| 图表 chart | (图表商店) | 静态展示 | OK | 缺"绑定数据"——图表只能看不能改 |
| SQL sql | `data_sql_queries` | title/query/result | 3 字段 | OK |

**联动现状**：
- SQL 结果 → 报表：未做（SQL 跑出的数不能存为指标）
- 指标 → 图表：未做（图表不能绑定指标自动刷新）

---

## 四、设计 design（4 记录 + 1 概览）

| Tab | 数据键 | 字段 | 当前状态 | 缺什么 |
|---|---|---|---|---|
| 概览 | (default) | — | OK | — |
| CAD cad | `design_cad` | title/format/standard/desc | 4 字段 | **缺版本/状态**——不知道是草稿还是定稿 |
| 图片 image | `design_image` | title/category/tag/desc | 4 字段 | **缺来源 URL/参考图**——用户提到"灵感板收藏源" |
| UI ui | `design_ui` | title/platform/style/desc | 4 字段 | OK |
| 3D model3d | `design_3d` | title/poly/scale/desc | 4 字段 | **缺渲染快照**（无图） |

**联动现状**：
- 图片 + UI + 3D：各自独立，**没"作品集"概念**——一个项目散落在 3 个 tab 找不回
- ✅ 阶段四阶段一已加"图片附件"（作品记录 img 字段）

---

## 五、编程 code（4 工具/记录 + 1 概览）

| Tab | 数据键 | 字段 | 当前状态 | 缺什么 |
|---|---|---|---|---|
| 概览 | (default) | — | OK | — |
| 运行器 runner | `code_runner` | title/language/code/result | 4 字段 | ✅ 阶段四阶段一已加"运行历史"（最近 5 次折叠展开） |
| 正则 regex | `code_regex` | title/pattern/text/result | 4 字段 | OK |
| 前端 frontend | `code_frontend` | title/html/css/js | 4 字段 | OK |
| SQL sql | 复用 data | — | OK | 缺"代码片段 → 任务"（"这个 bug 要修" 没快捷入口） |

**联动现状**：
- 代码片段 → 任务：未做
- SQL 结果 → 任务：未做

---

## 六、生活 life（4 记录 + 1 概览）

| Tab | 数据键 | 字段 | 当前状态 | 缺什么 |
|---|---|---|---|---|
| 概览 | (default) | — | OK | — |
| 计划 plan | `life_plans` | title/type/priority/date/note | 5 字段 | OK |
| 健康 health | `life_health` | date/weight/exercise/sleep/note | 5 字段 | OK（已收敛双轨） |
| 缴费 bill | `life_bills` | name/amount/cycle/due/status | 5 字段 | **缺"提前 X 天提醒"**（本轮未做，复杂度高） |
| 采购 shop | `life_shopping` | name/qty/amount/status | 4 字段 | OK |

**联动现状**：
- 缴费 → 任务：未做（自动生成"明天去缴费"任务）
- 健康 → 计划：未做（健康数据反推计划——如体重异常 → 加运动计划）

---

## 七、跨场景联动（DEFAULT_LINKS）

```js
const DEFAULT_LINKS = [
  { from:"office", kw:"交付", to:"study", taskTitle:"奖励：看一集技术分享视频" },
  { from:"study",  kw:"复习", to:"code",  taskTitle:"奖励：写个有趣的小项目 30 分钟" },
  { from:"code",   kw:"上线", to:"life",  taskTitle:"犒劳：吃顿好的 / 看部想看的片" }
];
```

**问题**：
- 只有 3 条默认规则，**设置 → 场景联动** 是入口，但用户能添加的规则数 / 触发时机不清楚
- kw 关键词匹配过于朴素——只查标题包含字符串，**没有正则 / 标签 / 状态触发**
- 触发后**直接生成任务**，没有"延迟 N 天"、"先提醒"等选项
- 缺"反向链路"——任务完成后**不**通知源场景

---

## 八、本次先做的（本轮已实现）

| 痛点 | 方案 | 状态 |
|---|---|---|
| 编程运行结果只能看最后一次 | 运行历史（最近 5 次折叠） | ✅ |
| 练习错题没复习机制 | 错题自动入 SM-2 复习队列 | ✅ |
| 主题样式老气 | 极光/森林/海洋 3 主题（已推） | ✅ |

## 九、下一轮 sprint 候选（按用户痛点优先级排）

| # | 痛点 | 工作量 | 影响面 |
|---|---|---|---|
| 1 | 跨场景联动规则太弱（kw/正则/状态触发/延迟/反向） | 大 | 6 场景通用 |
| 2 | 会议 → 行动项追踪闭环 | 中 | office 场景 |
| 3 | 缴费提前 X 天通知 | 中 | life 场景 |
| 4 | 项目子任务关联 + 进度条 | 中 | office 场景 |
| 5 | 设计"作品集"（跨 CAD/UI/3D/图片） | 中 | design 场景 |
| 6 | 报销金额合计 + 分类统计 | 小 | office 场景 |
| 7 | 阅读进度/页数追踪 | 小 | study 场景 |
| 8 | 考试 → 错题 → 知识库关联 | 中 | study 场景 |
| 9 | 数据指标快照标准格式 | 大 | data 场景 |
| 10 | 图表绑定数据自动刷新 | 大 | data 场景 |
| 11 | 考勤细分（迟到/早退/请假）+ 月度统计 | 小 | office 场景 |
| 12 | 缴费/采购 → 任务 | 小 | life 场景 |
| 13 | SQL 结果 → 报表存指标 | 中 | data 场景 |
| 14 | 设计灵感板收藏源（URL/参考） | 小 | design 场景 |

---

## 总结

**现状**：
- 6 场景 28 个功能卡（不含 6 概览）
- **每个卡只有 CRUD**（添加/查看/删除）——"分析"和"联动"几乎为 0
- **跨场景联动 3 条**——DEFAULT_LINKS 是占位
- **统计/进度/汇总**只在少数卡有（健康/学习/办公概览）——多数卡没 sum

**根本问题**：
- 卡的字段是"原子数据"（每条记录独立的字段）
- 缺"**视图**"层——把多条记录"折叠"成单个洞察（项目进度、缴费总额、出勤率、阅读量、错题率）
- 缺"**触发器**"层——一条记录变更时，跨场景自动反应

**建议下轮工作方向**：
1. 优先做"视图"层（让用户先看到"我这一周做了什么"）——工作量大但直观
2. 再做"触发器"层（让数据有联动）——技术复杂
3. 12-14 号候选（汇总/关联/收藏源）性价比高，2-3 个工作日内可完成

具体做什么等你定。
