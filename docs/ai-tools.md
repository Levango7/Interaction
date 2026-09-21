# AI 工具接口文档（TOOLS Schema）

> 本文档由 `agent-workbench.html` 中的 `const TOOLS = [...]` 及工具分发逻辑（`execTool` / `agentExec`）抽取而成，作为 AI 层函数调用契约的独立接口说明。
>
> **适用版本**：`VERSION = "3.7.12"`。
> **维护约定**：本文件为源码契约的镜像，**以源码为唯一权威**。任何 TOOLS 字段、参数或枚举变更后，须同步更新此处；并提交时一并纳入（见任务 T1）。
> **最后核对**：2026-09-21（定位代码请按函数名/常量名搜索，本文件不再维护行号）。

---

## 1. 总览

AI 通过 OpenAI 兼容的 function-calling 协议调用工具。运行时把 `TOOLS` 作为 `tools` 参数下发，模型返回 `tool_calls`，由前端 `execTool(name, args)` 分发执行，结果回灌下一轮对话。

**工具总数**：26。

| # | 工具名 | 所属分发器 | 必填参数 | 说明 |
|---|--------|-----------|----------|------|
| 1 | `create_task` | execTool | `title` | 在指定场景创建一条任务（标题必填），可带标签 |
| 2 | `list_tasks` | execTool | — | 查询某场景的任务，可按状态过滤 |
| 3 | `complete_task` | execTool | `task_id` | 按任务 id 或标题关键词标记任务完成 |
| 4 | `update_task` | execTool | `task_id` | 修改任务的状态/优先级/截止日期/标签（按 id 或标题关键词定位） |
| 5 | `delete_task` | execTool | `task_id` | 按 id 或标题关键词删除一条任务（进入回收站，可恢复） |
| 6 | `add_record` | execTool | `scenario`,`fields` | 向某场景的资料库添加一条记录 |
| 7 | `search` | execTool | `query` | 全局搜索任务与资料库中的条目 |
| 8 | `query_overview` | execTool | — | 返回各场景任务统计与今日/逾期待处理数量 |
| 9 | `export_data` | execTool | — | 导出当前全部数据为 JSON 备份 |
| 10 | `remember` | agentExec | `text` | 把用户的事实/偏好/决定写入工作记忆，供后续对话自动召回（如“我喜欢简洁回复”“本周重点 |
| 11 | `recall` | agentExec | `query` | 按关键词检索工作记忆，回答涉及用户偏好/历史决定前先查 |
| 12 | `forget` | agentExec | `id` | 按 id 或内容关键词删除一条工作记忆 |
| 13 | `plan` | agentExec | `goal`,`steps` | 为多步任务建立目标与步骤清单（跨场景可拆步）。建立后按步骤调用工具执行，每步完成用 co |
| 14 | `complete_step` | agentExec | `index` | 标记当前目标的某一步已完成 |
| 15 | `complete_goal` | agentExec | — | 目标全部步骤完成后调用，收尾并总结 |
| 16 | `list_records` | agentExec | `scenario` | 查询某场景资料库的最近记录（会议纪要/代码片段/学习资料/生活备忘等） |
| 17 | `add_feature_record` | execTool | `feature`,`fields` | 向当前场景的功能卡添加一条记录（如会议/项目/考勤/报销/知识库/阅读/练习/考试/报表 |
| 18 | `web_search` | execTool | `query` | 联网搜索（可配置搜索引擎，返回标题/摘要/链接） |
| 19 | `web_fetch` | execTool | `url` | 抓取指定 URL 的网页内容（纯文本，去标签） |
| 20 | `code_run` | execTool | `code` | 在 Web Worker 沙箱中运行 JS 代码（5s 超时，收集 console 输出 |
| 21 | `sql_query` | execTool | `sql` | 在内存 SQLite（sql.js WASM）中运行 SQL，返回列名与行数据 |
| 22 | `note_add` | execTool | `title`,`content` | 新增一条笔记（标题/内容/标签/分类），存 localStorage |
| 23 | `note_search` | execTool | `query` | 按关键词搜索笔记（标题+内容匹配） |
| 24 | `generate_report` | execTool | — | 生成指定周期的工作报表（Markdown 文本）：完成/逾期任务、各场景分布、周期内记录 |
| 25 | `render_chart` | execTool | `label`,`value` | 在对话里渲染一张数据图表（bar/line/pie），数据由你根据已查到的数据整理 |
| 26 | `generate_doc` | execTool | `title`,`content` | 生成一份文档（Markdown）并保存到笔记库 |

**分发边界**：
- `execTool` 处理任务 / 资料库 / 搜索 / 概览 / 导出类。
- ` remember`/`recall`/`forget`/`plan`/`complete_step`/`complete_goal`/`list_records` 由 `agentExec` 处理；`execTool` 末尾 `return agentExec(name, args)` 兜底。
- 未识别的工具名返回 `{ok:false, msg:"未知工具：<name>"}`。

---

## 2. 公共枚举与场景

`scenario` 类参数的取值来自 `ORDER` 与 `SCENARIOS`：

```js
const ORDER = ["office","code","study","life"];
```

| 场景键 | 中文名 | 资料库记录字段（k → label） |
|--------|--------|------------------------------|
| `office` | 办公 | `title` 会议主题 · `who` 参会人 · `note` 结论/跟进 |
| `code` | 编程 | `lang` 语言 · `title` 标题 · `code` 代码 |
| `study` | 学习 | `title` 主题 · `type` 类型 · `status` 状态 · `note` 笔记 |
| `life` | 生活 | `title` 事项 · `cat` 分类 · `note` 备注 |

**优先级枚举**：`["", "P0", "P1", "P2"]`（空串 = 未设置）。

**任务状态枚举**：
- `list_tasks` 过滤：`["", "todo", "doing", "done"]`（空串 = 全部）。
- `update_task` 设置：`["todo", "doing", "done"]`（无空串）。

> 注：`remember` 的 `scope` 枚举为 `["global"].concat(ORDER)` = `["global","office","code","study","life"]`。`global` 表示全场景通用；其余按场景键隔离。

---

## 3. 工具逐项定义

> 本节由脚本从源码 `const TOOLS` 生成（描述取 `description` 的中文兜底，参数取 `parameters.properties` + `required`）；
> **以源码为唯一权威**，改动 TOOLS 后请重新生成，不要手改本节。

### 3.1 `create_task`

- **描述**：在指定场景创建一条任务（标题必填），可带标签
- **参数**：
  - `scenario` `{string, enum: ORDER}` — 场景键，如 office/code/study
  - `title` `{string}` — 任务标题
  - `due` `{string}` — 截止日期 YYYY-MM-DD，可空
  - `priority` `{string, enum: ["","P0","P1","P2"]}` — （无说明）
  - `tags` `{array<string>}` — 标签列表
- **必填**：`["title"]`

### 3.2 `list_tasks`

- **描述**：查询某场景的任务，可按状态过滤
- **参数**：
  - `scenario` `{string, enum: ORDER}` — （无说明）
  - `status` `{string, enum: ["","todo","doing","done"]}` — （无说明）
- **必填**：`[]`

### 3.3 `complete_task`

- **描述**：按任务 id 或标题关键词标记任务完成
- **参数**：
  - `task_id` `{string}` — 任务 id，或任务标题中的关键词（用于定位任务）
- **必填**：`["task_id"]`

### 3.4 `update_task`

- **描述**：修改任务的状态/优先级/截止日期/标签（按 id 或标题关键词定位）
- **参数**：
  - `task_id` `{string}` — 任务 id，或任务标题中的关键词
  - `status` `{string, enum: ["todo","doing","done"]}` — （无说明）
  - `priority` `{string, enum: ["","P0","P1","P2"]}` — （无说明）
  - `due` `{string}` — 新截止日期 YYYY-MM-DD
  - `tags` `{array<string>}` — 覆盖该任务的标签
  - `force` `{boolean}` — 设为 true 直接执行修改；默认 false 会先返回确认提示（需二次确认）
- **必填**：`["task_id"]`

### 3.5 `delete_task`

- **描述**：按 id 或标题关键词删除一条任务（进入回收站，可恢复）
- **参数**：
  - `task_id` `{string}` — 任务 id，或任务标题中的关键词
  - `force` `{boolean}` — 设为 true 直接软删除（进回收站）；默认 false 会先返回确认提示（需二次确认）
- **必填**：`["task_id"]`

### 3.6 `add_record`

- **描述**：向某场景的资料库添加一条记录
- **参数**：
  - `scenario` `{string, enum: ORDER}` — （无说明）
- **必填**：`["scenario","fields"]`

### 3.7 `search`

- **描述**：全局搜索任务与资料库中的条目
- **参数**：
  - `query` `{string}` — 搜索关键词
- **必填**：`["query"]`

### 3.8 `query_overview`

- **描述**：返回各场景任务统计与今日/逾期待处理数量
- **参数**：
  - （无参数）
- **必填**：`[]`

### 3.9 `export_data`

- **描述**：导出当前全部数据为 JSON 备份
- **参数**：
  - （无参数）
- **必填**：`[]`

### 3.10 `remember`

- **描述**：把用户的事实/偏好/决定写入工作记忆，供后续对话自动召回（如“我喜欢简洁回复”“本周重点是 v2 上线”）
- **参数**：
  - `scope` `{string, enum: ["global"]}` — global=全场景通用，否则按场景键隔离
  - `text` `{string}` — 要记住的内容，一句话
- **必填**：`["text"]`

### 3.11 `recall`

- **描述**：按关键词检索工作记忆，回答涉及用户偏好/历史决定前先查
- **参数**：
  - `query` `{string}` — 检索关键词
- **必填**：`["query"]`

### 3.12 `forget`

- **描述**：按 id 或内容关键词删除一条工作记忆
- **参数**：
  - `id` `{string}` — 记忆 id 或内容关键词
- **必填**：`["id"]`

### 3.13 `plan`

- **描述**：为多步任务建立目标与步骤清单（跨场景可拆步）。建立后按步骤调用工具执行，每步完成用 complete_step 标记，全部完成用 complete_goal 收尾
- **参数**：
  - `goal` `{string}` — 目标标题
  - `scenario` `{string, enum: ORDER}` — 主场景
  - `steps` `{array<string>}` — 步骤清单，按执行顺序
- **必填**：`["goal","steps"]`

### 3.14 `complete_step`

- **描述**：标记当前目标的某一步已完成
- **参数**：
  - `index` `{integer}` — 步骤序号（从 0 开始）
  - `note` `{string}` — 该步结果说明，可空
- **必填**：`["index"]`

### 3.15 `complete_goal`

- **描述**：目标全部步骤完成后调用，收尾并总结
- **参数**：
  - `summary` `{string}` — 完成总结
- **必填**：`[]`

### 3.16 `list_records`

- **描述**：查询某场景资料库的最近记录（会议纪要/代码片段/学习资料/生活备忘等）
- **参数**：
  - `scenario` `{string, enum: ORDER}` — （无说明）
- **必填**：`["scenario"]`

### 3.17 `add_feature_record`

- **描述**：向当前场景的功能卡添加一条记录（如会议/项目/考勤/报销/知识库/阅读/练习/考试/报表/图表/前端/SQL/UI/3D/计划）
- **参数**：
  - `feature` `{string}` — 功能 id：meeting/project/attendance/expense/knowledge/reading/exercise/exam/report/chart/frontend/sql/ui/model3d/plan
  - `fields` `{object}` — 字段键值对（各功能表单字段，如会议 title/date/who/note）
- **必填**：`["feature","fields"]`

### 3.18 `web_search`

- **描述**：联网搜索（可配置搜索引擎，返回标题/摘要/链接）
- **参数**：
  - `query` `{string}` — 搜索关键词
  - `engine` `{string}` — 搜索引擎 id（可空，默认用配置）
  - `limit` `{integer}` — 返回条数（默认 5）
- **必填**：`["query"]`

### 3.19 `web_fetch`

- **描述**：抓取指定 URL 的网页内容（纯文本，去标签）
- **参数**：
  - `url` `{string}` — 要抓取的 URL（http/https）
  - `selector` `{string}` — 可选 CSS 选择器（提取局部）
- **必填**：`["url"]`

### 3.20 `code_run`

- **描述**：在 Web Worker 沙箱中运行 JS 代码（5s 超时，收集 console 输出）
- **参数**：
  - `code` `{string}` — 要执行的 JS 代码片段
  - `timeout` `{integer}` — 超时毫秒（默认 5000）
- **必填**：`["code"]`

### 3.21 `sql_query`

- **描述**：在内存 SQLite（sql.js WASM）中运行 SQL，返回列名与行数据
- **参数**：
  - `sql` `{string}` — SQL 语句（支持多语句，以分号分隔）
  - `schema` `{string}` — 建表 DDL（可选，执行前先运行）
- **必填**：`["sql"]`

### 3.22 `note_add`

- **描述**：新增一条笔记（标题/内容/标签/分类），存 localStorage
- **参数**：
  - `title` `{string}` — 笔记标题
  - `content` `{string}` — Markdown 内容
  - `tags` `{array<string>}` — 标签列表
  - `category` `{string}` — 分类（如知识库/工作笔记）
- **必填**：`["title","content"]`

### 3.23 `note_search`

- **描述**：按关键词搜索笔记（标题+内容匹配）
- **参数**：
  - `query` `{string}` — 搜索关键词
- **必填**：`["query"]`

### 3.24 `generate_report`

- **描述**：生成指定周期的工作报表（Markdown 文本）：完成/逾期任务、各场景分布、周期内记录统计
- **参数**：
  - `period` `{string, enum: ["day","week","month"]}` — 统计周期，默认 week
  - `scope` `{string}` — 场景键（office/health/finance 等），留空为全部场景
- **必填**：`[]`

### 3.25 `render_chart`

- **描述**：在对话里渲染一张数据图表（bar/line/pie），数据由你根据已查到的数据整理
- **参数**：
  - `type` `{string, enum: ["bar","line","pie"]}` — 图表类型，默认 bar
  - `title` `{string}` — 图表标题
  - `data` `{array<string>}` — 数据点数组，如 [{label:'周一',value:3}]
- **必填**：`["label","value"]`

### 3.26 `generate_doc`

- **描述**：生成一份文档（Markdown）并保存到笔记库
- **参数**：
  - `title` `{string}` — 文档标题
  - `content` `{string}` — Markdown 正文
  - `category` `{string}` — 分类，如 方案/复盘/工作文档
- **必填**：`["title","content"]`

## 4. 调用契约与错误模型

- **统一返回**：工具结果以 `JSON.stringify(...)` 字符串回传，外层由 `runChatLoop` 写入 `tool` 角色消息。结构通常为 `{ok:bool, ...}`，错误带 `msg` 或 `error` 字段。
- **异常兜底**：`execTool` 整体 `try/catch`，异常时 `pushDiag` 记录并返回 `{ok:false, error:"<message>"}`。
- **两步确认（破坏性操作）**：`update_task` / `delete_task` 首次返回 `confirm` 提示而非执行（见 3.4 / 3.5）。**⚠️ `force` 未置 `true` 时依赖二次确认**；纯 function-calling 调用方应显式传 `force:true` 跳过确认，或自行处理 `confirm` 分支。
- **未识别工具**：`{ok:false, msg:"未知工具：<name>"}`。

---

## 5. 已知不确定点（待核对 / 待决策）

> 以下为抽取阶段发现的、源码与 schema 存在出入或需产品侧确认的点，已逐条标注，待后续严格核对。

1. **~~`force` 参数未入 schema~~（v1.14.1 已解决）**：`force` 已作为可选 `boolean` 加入 `update_task`/`delete_task` schema，AI 可传 `force:true` 跳过二次确认（默认 `false` 仍走确认）。
2. **~~`add_record.fields` 无子 Schema~~（v1.14.1 已解决）**：schema 已按场景生成 `anyOf` 子结构（`_recordFieldsSchema` 从 `SCENARIOS` 派生）。
3. **`recall` 返回上限硬编码 8**：与 `agentContextPrompt` 注入的 `limit=6` 不一致。→ 确认是否为预期（检索 vs 注入取不同 topN）。
4. **`list_tasks` 返回上限 20**：schema 无 `limit` 参数，超量静默截断。→ 确认是否需分页/limit 参数。
5. **`due` 字符串无格式校验**：仅作字符串存储，`query_overview` 用字符串比较 `due < todayStr()`，依赖 `YYYY-MM-DD` 字典序正确性。→ 非该格式会静默失效。

---

## 6. 源码定位速查

| 内容 | 定位（按标识符搜索，不依赖行号） |
|------|------|
| `TOOLS` 数组 | `const TOOLS = [...]` |
| `SCENARIOS` 定义 | `const SCENARIOS = {...}` |
| `ORDER` 定义 | `const ORDER = [...]` |
| `execTool` 分发 | `function execTool(name, args, force)` |
| `agentExec` 分发（记忆/目标） | `function agentExec(name, args)` |
| `findTask` 定位 | `function findTask(...)`，用于 `complete/update/delete_task` 的 id/关键词解析 |
| 重试语义（chatOnce） | `async function chatOnce(...)` 与 Electron `main.js` 的 429/5xx 退避（跨进程双实现，修改需两侧同步） |
