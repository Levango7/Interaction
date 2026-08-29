# AI 工具接口文档（TOOLS Schema）

> 本文档由 `agent-workbench.html` 中的 `const TOOLS = [...]` 及工具分发逻辑（`execTool` / `agentExec`）抽取而成，作为 AI 层函数调用契约的独立接口说明。
>
> **适用版本**：`VERSION = "3.1.1"`。
> **维护约定**：本文件为源码契约的镜像，**以源码为唯一权威**。任何 TOOLS 字段、参数或枚举变更后，须同步更新此处；并提交时一并纳入（见任务 T1）。
> **最后核对**：2026-08-29（定位代码请按函数名/常量名搜索，本文件不再维护行号）。

---

## 1. 总览

AI 通过 OpenAI 兼容的 function-calling 协议调用工具。运行时把 `TOOLS` 作为 `tools` 参数下发，模型返回 `tool_calls`，由前端 `execTool(name, args)` 分发执行，结果回灌下一轮对话。

**工具总数**：17。

| # | 工具名 | 所属分发器 | 必填参数 | 说明 |
|---|--------|-----------|----------|------|
| 1 | `create_task` | execTool | `title` | 在某场景创建任务 |
| 2 | `list_tasks` | execTool | — | 查询某场景任务（可按状态过滤） |
| 3 | `complete_task` | execTool | `task_id` | 按 id 或关键词标记完成 |
| 4 | `update_task` | execTool | `task_id` | 改状态/优先级/截止日/标签（**两步确认**） |
| 5 | `delete_task` | execTool | `task_id` | 软删除进回收站（**两步确认**） |
| 6 | `add_record` | execTool | `scenario`,`fields` | 向场景资料库添加记录 |
| 7 | `search` | execTool | `query` | 全局搜索任务与资料库 |
| 8 | `query_overview` | execTool | — | 各场景任务统计 + 今日/逾期 |
| 9 | `export_data` | execTool | — | 触发 JSON 备份导出 |
| 10 | `remember` | agentExec | `text` | 写入工作记忆 |
| 11 | `recall` | agentExec | — | 检索工作记忆 |
| 12 | `forget` | agentExec | `id` | 删除一条工作记忆 |
| 13 | `plan` | agentExec | `goal`,`steps` | 建立多步目标 |
| 14 | `complete_step` | agentExec | `index` | 标记目标某步完成 |
| 15 | `complete_goal` | agentExec | — | 收尾并总结目标 |
| 16 | `list_records` | agentExec | — | 查某场景资料库最近记录 |
| 17 | `add_feature_record` | agentExec | `feature`,`fields` | 向场景功能卡添加一条记录 |

**分发边界**：
- `execTool` 处理任务 / 资料库 / 搜索 / 概览 / 导出类。
- ` remember`/`recall`/`forget`/`plan`/`complete_step`/`complete_goal`/`list_records` 由 `agentExec` 处理；`execTool` 末尾 `return agentExec(name, args)` 兜底。
- 未识别的工具名返回 `{ok:false, msg:"未知工具：<name>"}`。

---

## 2. 公共枚举与场景

`scenario` 类参数的取值来自 `ORDER` 与 `SCENARIOS`：

```js
const ORDER = ["office","data","design","study","code","life"];
```

> v2.1.0 起扩展为 6 场景（新增 `data` 数据 / `design` 设计）；侧栏场景组显示序与 `ORDER` 一致。

| 场景键 | 中文名 | 资料库记录字段（k → label） |
|--------|--------|------------------------------|
| `office` | 办公 | `title` 会议主题 · `who` 参会人 · `note` 结论/跟进 |
| `data` | 数据 | `type` 类型 · `title` 标题 · `note` 备注 |
| `design` | 设计 | `type` 类型 · `title` 作品名 · `note` 灵感/备注 |
| `study` | 学习 | `title` 主题 · `type` 类型 · `status` 状态 · `note` 笔记 |
| `code` | 编程 | `lang` 语言 · `title` 标题 · `code` 代码 |
| `life` | 生活 | `type` 类型 · `title` 标题 · `value` 数值 · `note` 备注 |

**优先级枚举**：`["", "P0", "P1", "P2"]`（空串 = 未设置）。

**任务状态枚举**：
- `list_tasks` 过滤：`["", "todo", "doing", "done"]`（空串 = 全部）。
- `update_task` 设置：`["todo", "doing", "done"]`（无空串）。

> 注：`remember` 的 `scope` 枚举为 `["global"].concat(ORDER)` = `["global","office","data","design","study","code","life"]`。`global` 表示全场景通用；其余按场景键隔离。

---

## 3. 工具逐项定义

> 每个条目含：描述（取源码 `description`）、参数（取 `parameters.properties` + `required`）、执行行为（取自 `execTool`/`agentExec` 源码）、返回结构示例、与 schema 不一致的实现细节（⚠️ 备注）。

### 3.1 `create_task`

- **描述**：在指定场景创建一条任务（标题必填），可带标签。
- **参数**：
  - `scenario` `{string, enum: ORDER}` — 场景键，如 office/data/design/study/code/life；缺省时取当前激活场景 `active`。
  - `title` `{string}` — 任务标题（必填）。
  - `due` `{string}` — 截止日期 `YYYY-MM-DD`，可空。
  - `priority` `{string, enum: ["","P0","P1","P2"]}`。
  - `tags` `{array<string>}` — 标签列表。
- **必填**：`["title"]`
- **执行**：`ORDER.includes(scenario)` 校验，否则回退 `active`；`tags` 转为字符串数组去空。
- **返回**：`{ok:true, id:"<uid>", msg:"已在<场景名>创建任务：<title>"}`

### 3.2 `list_tasks`

- **描述**：查询某场景的任务，可按状态过滤。
- **参数**：
  - `scenario` `{string, enum: ORDER}`
  - `status` `{string, enum: ["","todo","doing","done"]}`
- **必填**：`[]`
- **执行**：按场景过滤，可选状态过滤；**最多返回前 20 条**。
- **返回**：`{count:N, items:[{title, status, due}]}`

### 3.3 `complete_task`

- **描述**：按任务 id 或标题关键词标记任务完成。
- **参数**：
  - `task_id` `{string}` — 任务 id，或任务标题中的关键词（用于定位，经 `findTask`）。
- **必填**：`["task_id"]`
- **返回**：
  - 命中：`{ok:true, msg:"已完成：<title>"}`
  - 未命中：`{ok:false, msg:"未找到匹配任务：<task_id>"}`

### 3.4 `update_task` ⚠️ 两步确认

- **描述**：修改任务的状态/优先级/截止日期/标签（按 id 或标题关键词定位）。
- **参数**：
  - `task_id` `{string}`（必填）
  - `status` `{string, enum: ["todo","doing","done"]}`
  - `priority` `{string, enum: ["","P0","P1","P2"]}`
  - `due` `{string}` — 新截止日期 `YYYY-MM-DD`
  - `tags` `{array<string>}` — 覆盖该任务的标签
  - `force` `{boolean}` — 设为 `true` 直接执行修改；默认 `false` 会先返回确认提示（需二次确认）
- **必填**：`["task_id"]`
- **⚠️ 实现细节（两步确认）**：首次调用且 `force` 未置 `true` 时，不真正修改，而是返回确认提示并挂起 `pendingConfirm`：
  ```json
  {"ok":false, "confirm":"将修改：「<title>」（id <id>）。发送「确认」以继续，其他内容取消。", "op":"update_task", "task_id":"<id>", "title":"<title>"}
  ```
  用户回复「确认」后由 UI 以 `force=true` 再次调用才落地。
- **返回（force 后）**：`{ok:true, msg:"已更新「<title>」：<变更JSON>"}`
  - `status==="done"` 会复用 `completeTask` 路径并设 `doneAt`；其余状态清空 `doneAt`。

### 3.5 `delete_task` ⚠️ 两步确认

- **描述**：按 id 或标题关键词删除一条任务（进入回收站，可恢复）。
- **参数**：
  - `task_id` `{string}`（必填）
  - `force` `{boolean}` — 设为 `true` 直接软删除（进回收站）；默认 `false` 会先返回确认提示（需二次确认）
- **必填**：`["task_id"]`
- **⚠️ 实现细节**：同 `update_task`，`force` 未置 `true` 时返回确认提示。`force=true` 后才执行软删除：
  ```js
  ft.task.deletedAt = Date.now(); setTasks(ft.tasks); // ③ 软删除：进回收站，可恢复
  ```
- **返回（force 后）**：`{ok:true, msg:"已删除（进入回收站，可在看板底部恢复）：<title>"}`

### 3.6 `add_record`

- **描述**：向某场景的资料库添加一条记录。
- **参数**：
  - `scenario` `{string, enum: ORDER}`（必填）
  - `fields` `{object}` — 该场景资料库的字段（必填）。schema 已按场景生成子结构（`anyOf`），键随 `scenario` 而定（见第 2 节表）。
- **必填**：`["scenario","fields"]`
- **⚠️ 字段键由场景决定**：实际落库字段以 `SCENARIOS[sc].record.fields` 为准（第 2 节表）。`fields` 中非场景字段会被忽略，缺字段置空字符串。v1.14.1 起 schema 已从 `SCENARIOS` 派生场景子 schema（`_recordFieldsSchema`）。
- **返回**：`{ok:true, msg:"已向<场景名>资料库添加记录"}`

### 3.7 `search`

- **描述**：全局搜索任务与资料库中的条目。
- **参数**：
  - `query` `{string}`（必填）
- **必填**：`["query"]`
- **执行**：任务标题 + 各场景资料库 `title` 做 `includes` 子串匹配（大小写不敏感）；各最多 10 条。
- **返回**：`{tasks:[{sc,name,title,status,due}], records:[{sc,name,title}], count:N}`

### 3.8 `query_overview`

- **描述**：返回各场景任务统计与今日/逾期待处理数量。
- **参数**：无。
- **必填**：`[]`
- **返回**：
  ```json
  {"byScenario": {"office":{"name":"办公","open":N,"done":N}, ...},
   "today":N, "overdue":N}
  ```
  - `today`：截止日等于今天且未完成（未删）。
  - `overdue`：有截止日且 `<` 今天且未完成（未删）。

### 3.9 `export_data`

- **描述**：导出当前全部数据为 JSON 备份。
- **参数**：无。
- **必填**：`[]`
- **执行**：调用 `doExport()` 触发浏览器下载。
- **返回**：`{ok:true, msg:"已触发 JSON 备份导出"}`

### 3.10 `remember`

- **描述**：把用户的事实/偏好/决定写入工作记忆，供后续对话自动召回（如"我喜欢简洁回复""本周重点是 v2 上线"）。
- **参数**：
  - `scope` `{string, enum: ["global","office","data","design","study","code","life"]}` — `global`=全场景通用，否则按场景键隔离。
  - `text` `{string}` — 要记住的内容，一句话（必填）。
- **必填**：`["text"]`
- **执行**：`scope` 不合法时回退 `active`；空文本不写入。
- **返回**：`{ok:true, id:"<uid>", msg:"已记住[<全局/场景名>]：<text>"}` 或 `{ok:false, msg:"记忆内容为空"}`

### 3.11 `recall`

- **描述**：按关键词检索工作记忆，回答涉及用户偏好/历史决定前先查。
- **参数**：
  - `query` `{string}`
- **必填**：`[]`
- **执行**：场景匹配 + 关键词命中 + 近期加权 + 命中次数，返回 **top 8**。
- **返回**：`{count:N, items:[{id, scope, text}]}`

### 3.12 `forget`

- **描述**：按 id 或内容关键词删除一条工作记忆。
- **参数**：
  - `id` `{string}` — 记忆 id 或内容关键词（必填）。
- **必填**：`["id"]`
- **返回**：`{ok:true, msg:"已遗忘：<text>"}` 或 `{ok:false, msg:"未找到该记忆"}`

### 3.13 `plan`

- **描述**：为多步任务建立目标与步骤清单（跨场景可拆步）。建立后按步骤调用工具执行，每步完成用 `complete_step` 标记，全部完成用 `complete_goal` 收尾。
- **参数**：
  - `goal` `{string}` — 目标标题（必填）。
  - `scenario` `{string, enum: ORDER}` — 主场景。
  - `steps` `{array<string>}` — 步骤清单，按执行顺序（必填）。
- **必填**：`["goal","steps"]`
- **执行**：新目标顶替旧进行中目标。
- **返回**：`{ok:true, id:"<uid>", msg:"已建立目标「<goal>」，共<N>步。请按步骤调用工具执行，每完成一步用 complete_step 标记，全部完成后用 complete_goal 收尾。"}`

### 3.14 `complete_step`

- **描述**：标记当前目标的某一步已完成。
- **参数**：
  - `index` `{integer}` — 步骤序号（从 0 开始，必填）。
  - `note` `{string}` — 该步结果说明，可空。
- **必填**：`["index"]`
- **返回**：
  - 有效：`{ok:true, msg:"步骤<N>已完成，剩余<M>步", remaining:M}`
  - 无效：`{ok:false, msg:"无进行中的目标或步骤序号无效"}`

### 3.15 `complete_goal`

- **描述**：目标全部步骤完成后调用，收尾并总结。
- **参数**：
  - `summary` `{string}` — 完成总结。
- **必填**：`[]`
- **返回**：`{ok:true, msg:"目标完成：<title>"}` 或 `{ok:false, msg:"当前无进行中的目标"}`

### 3.16 `list_records`

- **描述**：查询某场景资料库的最近记录（会议纪要/数据记录/作品记录/学习资料/代码片段/生活记录等）。
- **参数**：
  - `scenario` `{string, enum: ORDER}`
- **必填**：`[]`
- **执行**：返回该场景最近记录 **最多 10 条**，并剥离 `id`/`created` 字段。
- **返回**：`{count:N, items:[{<场景字段>}]}`

### 3.17 `add_feature_record`

- **描述**：向当前场景的功能卡添加一条记录（如会议/项目/考勤/报销/知识库/阅读/练习/考试/报表/图表/前端/SQL/UI/3D/计划）。
- **参数**：
  - `feature` `{string}` — 功能 id（meeting/project/attendance/expense/knowledge/reading/exercise/exam/report/chart/frontend/sql/ui/model3d/plan）
  - `fields` `{object}` — 字段键值对（各功能表单字段，如会议 title/date/who/note）
- **必填**：`["feature","fields"]`
- **执行**：校验功能 id 是否绑定于当前场景（`SCENE_FEATURE_BIND`）；未提供任何有效字段值则拒绝；记录插入该功能列表头部。
- **返回**：`{ok:true, msg:"已添加到<feature>功能"}` 或 `{ok:false, msg:"未知功能：<fid>..."}` / `{ok:false, msg:"请提供至少一个字段值"}`

---

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
