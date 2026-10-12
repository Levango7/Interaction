# Agent 架构与前端测试策略评估（v3.7.118 快照 · 2026-10-12）

> 评估对象：`F:\Nexus\Interaction`（单文件 HTML 应用「Agent 工坊」PWA + Electron 双形态）。
> 方法：**逐行读代码取证**，不采信文档结论；文档仅用于交叉验证。
> 证据行号基于本次读取的快照（`src/*.js` 35 块 / 合计 42,625 行；行号会随迭代漂移，引用时以文件实际内容为准）。
> 产出性质：**只读评估**，未改动 `src/` 任何文件。

---

## 任务 1 · Agent 机制的完善度

### 1.0 机制全貌（先厘清"两条执行链"，否则会误诊）

本仓存在**两条独立的工具执行链**，能力并不等价：

| 链路 | 入口 | 规划方式 | 工具结果如何回喂 | 规划是否可改 | 代码位置 |
|---|---|---|---|---|---|
| **A. 对话链（隐式 ReAct）** | 聊天框正常发送 | 无显式计划，模型按 `tool_choice:auto` 自由调用 | 每轮 `role:"tool"` 回执 push 进 `messages`，下一轮模型可见 | 天然可改（模型每轮重新决策） | `ai-retry.js:845` `runChatLoop` |
| **B. 自主计划链（显式 Plan-Execute）** | 命令面板 `>` 前缀 | 一次 `chatOnce` 产出 JSON 计划，用户「确认执行」 | 仅**段末**把压缩文本回喂校准（每 3 步一次） | 段末可 `replan`（上限 2 次） | `ui-palette.js:203` → `ai-retry.js:429` → `ai-tools.js:1276` |

**关键差异**：链路 A 的步骤依赖（前一步输出喂给后一步）由模型在对话中自然完成；链路 B 的计划在规划时就把每步 `args` **静态定死**，执行引擎不做事后绑定（见 1.1）。基于此，下面逐项评估。

### 1.1 规划质量

- **规划形态**：**单轮规划 + 分段重规划**，不是纯迭代重规划。
  - 规划：`proposeAgentPlan`（`ai-retry.js:429`）一次 `chatOnce`，系统提示 `agentPlanSysPrompt`（`ai-tools.js:1040`）要求输出 JSON；`parseAgentPlan`（`ai-tools.js:1053`）解析，只认 `{goal, steps:[{tool,args,desc}]}`。
  - 执行：用户回「确认执行」→ `confirmAgentPlan`（`ai-retry.js:482`）→ `executeAgentPlanReactive`（`ai-tools.js:1276`）。
  - 备选旧链 `chatOnceAgent`（`ai-tools.js:1333`）仍在（plan→execute→summarize），但**无生产入口**（仅 `__test` 桥暴露，见 `ui-ge-integrations.js:2189`）。

- **重规划触发条件**：段末校准 `_calibrateRemaining`（`ai-tools.js:1248`）。
  - 触发判据：`replans < MAX_REPLANS || consecFail >= 2`（`ai-tools.js:1308`）。即"例行每段一次（未封顶时）"或"连续失败 ≥2 步强制一次"。
  - 校准返回 `{"action":"continue"}` 或 `{"action":"replan","steps":[...]}`（`ai-tools.js:1270`）；`replan` 用新步骤替换剩余，封顶 `STEP_CAP=12`（`ai-tools.js:1311`）；cальibrate 调用失败/非法输出 → 返回 `null` → 按原计划继续（`ai-tools.js:1272`，降级优先）。
  - 重规划总次数上限 `MAX_REPLANS=2`（`ai-tools.js:1283`）。

- **步骤依赖传递（前一步输出喂给后一步）——这是最大的能力缺口**：
  - 执行引擎 `_execPlanStep(step, wl)` 直接使用 `step.args`（`ai-tools.js:1207-1216`），**不把第 N 步的 result 注入第 N+1 步的 args**。
  - 唯一的间接回喂：段末校准把 `executedLines.slice(-6)`（压缩成"✓ 工具：msg"单行的文本，`ai-tools.js:1228-1237`）发给模型，模型可据此 `replan`（`ai-tools.js:1309`）——但这是**文本级、段边界、非结构化**的，且新步骤的 args 仍是模型重新编造的值，引擎不会用真实 id 替换占位。
  - 结论：在 `>` 自主计划路径下，「先 create_task 拿到 id，再用该 id add_record / complete_task」**做不到**（除非模型在规划时就猜中 id，不可能）；跨步依赖只能退回链路 A（对话链）完成。
  - 对比证据：链路 A 里工具回执以 `role:"tool"` 入 `messages` 并 `continue` 下一轮（`ai-retry.js:950/976/978`），模型确实能看到上一步结果。

### 1.2 错误处理

- **工具执行失败**：`_execPlanStep` 内 try/catch，异常转 `{resultStr: JSON.stringify({ok:false,error}), stepOk:false}`（`ai-tools.js:1218-1221`）。**不终止计划，继续下一步**（`ai-tools.js:1295-1305`）。
- **重试策略**：
  - 单步级：**读操作失败自动重试 1 次**（`for(attempt<2)`，仅当 `AGENT_READ_TOOLS.has(step.tool)`；`ai-tools.js:1194/1207/1222`）。
  - **写操作不自动重试**（`ai-tools.js:1222` 的 `!AGENT_READ_TOOLS.has(...)` 直接 `break`）——设计意图是"写可能已生效，重试会重复写"（注释 `ai-tools.js:1189`）。
  - LLM 级：`chatOnce` 对网络错误(TypeError)/429/5xx 退避重试，`maxRetry` 默认 **3**，间隔 `1000*(attempt+1)` ms（`ai-loop.js:319/380-407`）；401 / 其他 4xx / 取消 / 超时不重试（`ai-loop.js:472-486`）。
- **幂等性——无幂等键，是真实缺陷**：
  - `create_task` 每次 `tasks.push(nt)` 新任务（`ai-tools.js:26-29`）；`add_record` 每次 `arr.unshift(obj)` 新记录（`ai-tools.js:83`）；均无去重/幂等键。
  - 全仓 `ai-tools.js` 内 `幂等` 仅出现在 `sql_query` 写 IDB（`ai-tools.js:1671`，与任务域无关）。
  - 后果：同一工具（或重规划后语义相同的步骤、或用户重跑计划）重复调用 → **重复数据**。缓解仅来自"写操作不自动重试"这一点，但重规划/续跑/人工重试三条路径不受此保护。
- **破坏性操作防护**：`DANGER_CONFIRM_TOOLS = {delete_task, update_task}`（`ai-tools.js:277`）。自主路径在 `_execPlanStep` 开头拦成 `blocked`（`ai-tools.js:1198-1201`），**不中断整个计划**（后续非破坏步骤照跑，`ai-tools.js:1297-1299`）。白名单 `toolWhitelistSet`（`ai-tools.js:286`）同样在自主路径生效（`ai-tools.js:1202`）——两条路径共用同一清单，无旁路。
- **参数非法容错**：模型给的 `arguments` 非法 JSON → `_parseToolArgs` 返回 `null`（`ai-retry.js:96`），补一条 tool 回执让模型自纠（`ai-retry.js:105`），不抛裸 SyntaxError 中断循环。

### 1.3 终止条件与失控防护

- **循环硬上限（链路 A）**：`runChatLoop` 用 `while(guard++ < maxLoops)`（`ai-retry.js:867`）。`maxLoops` 默认 6；目标激活时用 `AGENT_GOAL_LOOP_MAX=12`（`ai-tools.js:305`）；可配 `cfg.agentLoops`（6~30）/`cfg.agentGoalLoops`（12~50）（`ai-retry.js:853-856`）。
- **步数硬上限（链路 B）**：`AGENT_PLAN_STEPS_MAX=12`（`ai-tools.js:309`）。超限在 `parseAgentPlan` 截断并记 `truncatedFrom`（`ai-tools.js:1074-1077`），评审文案**如实标注"原计划 N 步，已裁到 12 步"**（`ai-retry.js:420`）——不静默丢弃。
- **重规划上限**：`MAX_REPLANS=2` + `STEP_CAP=12`（`ai-tools.js:1283-1284`），"replan 后剩余步骤上限"防无限膨胀。
- **主循环收敛性**：`while(remaining.length)` 每轮 `remaining.splice(0, SEG)`（`SEG=3`，`ai-tools.js:1294`），replan 有 2 次硬顶 → 总步数有界（≤ 12 + 2×12 量级），不会死循环。
- **Token 预算（关键判定：是"截断式"不是"熔断式"）**：
  - 会话历史：`trimChatHist` 预算 `6000`（粗估 token）+ 条数上限 50，超出**从最旧丢弃保留最近**（`ai-tools.js:2637-2655`）；token 估算 `_estTokens`（中文 1 字≈1 token，其他 1/4；`ai-tools.js:2658`）。
  - 注入上下文：`ctxBudgetTokens` 默认 1200、钳制 200~4000（`ai-tools.js:2067-2078`）；技能段占 ≤40%（`CTX_SKILL_SHARE=0.4`，`ai-tools.js:2068/847`）。
  - 长会话：`maybeSummarizeHistory` 超 40 条把最旧段折成一次摘要请求（`ai-retry.js:380`），只发"摘要 + 最近 20 条"。
  - **达到预算的行为 = 从最旧裁剪/折叠，不中止本轮**。`addTokensUsage`（`ai-tools.js:2572`）只累计用量到 `localStorage`，**不参与任何决策**（无"预算耗尽即停止循环"的硬停）。即：预算控制的是"每轮发送体量"，不是"任务总花费上限"。

### 1.4 用户中断语义

- **可取消**：`AbortController` + 每轮重置超时（`ai-retry.js:21-41`）；`abortChat`（`ai-retry.js:47`）。
- **取消在工具批次内即时生效**：`_chatCancelled()`（`ai-retry.js:66`）在批次循环内检查（`ai-retry.js:936/959`），剩余调用补「已跳过」回执（`ai-retry.js:78`）后 `throw __USER_CANCEL__`——**避免"界面显示已取消但写操作照落"**（这正是 v3.7.59 修的口径，注释 `ai-retry.js:57-63`）。
- **执行计划路径**：`executeAgentPlanReactive` 每段开头检查 `o.signal.aborted`（`ai-tools.js:1291`），返回 `{ok:false, summary:"已取消"}`。
- **取消后状态一致性（明确取舍，非 bug）**：
  - 已执行的写操作**保留，无回滚/补偿事务**。
  - `agent_run` 盘上记录**不清档**（取消是"中断当轮"，不是"放弃"；`ai-retry.js:327/541`），`onProgress` 已落盘的 `done` 保留 → 可「继续执行」原地续跑（`ai-retry.js:280` `continueAgentRun`，`done` 权威不重跑）。
  - `wb_agent_goals` 那份保持 `active` → 下轮 `agentContextPrompt` 注入「请继续执行第 N 步」（`ai-tools.js:640-647`）。
  - 取消 vs 放弃语义分离："放弃执行"才清两处存档（`discardAgentRun` + `cancelGoal`，`ai-retry.js:710-717`）。
  - **缺口**：无"部分完成"的显式一致性报告（`summarizeAgentPlan` 只汇总成功/失败/待确认，`ai-tools.js:1159-1173`），也无补偿。半完成的写入就是半完成——用"续跑 + 提示"降低伤害，而非消除。
  - **取消粒度**：单步正在 `await` 的异步工具（web_search/code_run/sql_query）无法中断，要等它返回后到下一个检查点才退出（`ai-tools.js:1291` 是段级检查）。

### 1.5 并行能力

- **严格串行，无任何并行**：
  - 计划路径：`for(const step of seg){ await _execPlanStep(...) }`（`ai-tools.js:1295`）。
  - 对话路径：同一轮多个 `tool_calls` 也是 `for` 串行 `await execToolAuto`（`ai-retry.js:933-951/956-977`）。
  - 全仓无 `Promise.all` 执行工具批次。
- 取舍合理：写操作有顺序/状态依赖，串行避免竞态；代价是"多步独立检索/聚合"这类任务时延线性叠加。

### 1.6 任务 1 结论

单 agent + 26 工具 + 显式 Plan-Execute 的机制**在"个人任务域内的短程（≤12 步）多步操作"上已相当完整**：规划可评审、破坏性操作强制确认、白名单双路径一致、失败分段校准、断点续跑、长会话摘要、取消即时生效——这些是过去五批迭代（v3.7.114~118）补齐的成果，工程质量明显高于一般 MVP。

**三个真实天花板**（按严重度）：
1. **P0 · 计划路径的步骤间数据依赖缺失**（1.1）：`>` 自主计划无法表达"用上一步产出的 id 做下一步"，跨步依赖只能退回对话链。
2. **P0 · 写操作无幂等**（1.2）：重规划/续跑/重试可能产生重复数据。
3. **P1 · 中断粒度粗 + 无部分完成一致性报告**（1.4）：单步异步工具不可中断；半完成状态无补偿。

---

## 任务 2 · 「单 agent 单点」vs「multiagent」

> 用户原话：「单点而不是 multiagent 的架构，能否解决大量的用户需求？」

### 2.1 单 agent 的能力边界（具体到本产品）

产品定位：个人效率工具；场景 7 个（办公/数据/设计/学习/编程/生活/健康）。26 工具里 **22 个是本应用自身数据操作**（任务/记录/笔记/记忆），域封闭（代码内自陈，`ai-tools.js:1179-1184`）。

**它天然做不好的具体几类**：

1. **跨步骤数据依赖的任务**（如"读某任务的详情生成报告并回写到该任务的备注"）——受 1.1 所限，`>` 计划路径做不到。
2. **长时程 / 并发多目标**：`createGoal` 把上一个 `active` 直接置 `done`（`ai-tools.js:561`）——**单目标聚焦**，无法并行推进两个目标（如"同时跟踪工作项目 + 个人健身计划"）。
3. **需要不同"专家人格 + 不同工具子集"的复合任务**（如"调研→设计→实现→验证"）：单 agent 一套系统提示 + 全量 26 工具 schema，长任务下上下文被稀释，且无角色隔离。
4. **需要独立验证/对抗式质量的产出**（代码生成→测试→修复、事实核查）：无独立 verifier 角色，自检的假阳率无法通过架构消除。
5. **大规模并行检索/交叉验证**（同时查 N 个来源再综合）：串行 + token 预算（`ctxBudgetTokens` ≤4000）双重限制。
6. **超出 26 工具的能力**（真正的设计/绘图/文件系统操作）：**工具即能力天花板**，单/多 agent 都突破不了，需先加工具。

### 2.2 multiagent 的"可判定触发条件"（不能泛泛说"需求复杂"）

判据必须能落到**可实测的指标 / 明确的工具-提示结构需求**：

| 编号 | 触发条件（可判定） | 可测口径 |
|---|---|---|
| T1 | 单个任务的系统提示 + 所需工具 schema 总量**逼近/超过上下文预算**，且拆分后每子任务可独立定义系统提示 | 统计任务所需提示词 + 工具 schema 字符数 vs `ctxBudgetTokens`（`ai-tools.js:2073`） |
| T2 | 任务需要**并行独立子任务**，且串行 P95 时延超过用户可接受阈值 | 实测串行总时延 vs 阈值（当前串行是硬事实，`ai-tools.js:1295`） |
| T3 | 需要**生成者≠验证者**才能达标，且单 agent 自检的假阳率实测不可接受 | 构造"已知正确的产出 + 已知错误的产出"，测单 agent 自检的漏杀率 |
| T4 | 需要**并发多目标**（当前单目标聚焦结构性不支持） | `createGoal` 一次只能服务一个 active（`ai-tools.js:561`）；产品是否真有并发需求 |

**关键**：以上四条的任一条若未在同一产品迭代周期内**实测超标**，就不构成引入 multiagent 的理由。

### 2.3 明确结论：**当前引入 multiagent 是过度设计**

对当前产品，判据 T1/T2/T3/T4 **均未实测成立**。成本/收益判断：

**成本侧**
- **改造成本高**：26 工具 + 存储契约（`wb_agent_goals` / `wb_agent_agent_run` / `wb_agent_memory` 等）+ 危险确认双路径 + 白名单双路径 + 断点续跑 + 单目标模型，全部建立在**单 agent 假设**上（`ai-tools.js:1179-1184` 是显式架构决策记录）。multiagent 要重构编排层、目标/进度模型、确认交互、断点续跑的下标模型（`ai-retry.js:507-535` 的 `done` 下标重建是单 agent 专用的）。
- **token 成本倍增**：代码内已自陈"multi-agent 每步 2~3 倍 token，与节省用户 token 直接矛盾"（`ai-tools.js:1180`）。
- **调试复杂度陡增**：多 agent 轨迹交叉，现有 147 单测（jsdom 全量加载）+ 14 e2e（按主题切片、**零视觉回归**）的守护模型不覆盖。
- **与既有契约不兼容**：危险确认（`DANGER_CONFIRM_TOOLS`）、白名单（`toolWhitelistSet`）、技能固化（`SKILL_DANGER_TOOLS`）都按"单一调用者"设计。

**收益侧**
- 产品是**个人效率工具**，26 工具域封闭，绝大多数需求单 agent + function-calling 足够（对话链 A 已经支持引式 ReAct 链式调用）。
- 真正的缺口是 **1.6 的三个天花板**——而这三个都是**单 agent 内可解的工程问题**（依赖绑定、幂等、中断粒度），不是"架构不够"的问题。

**判定：必要演进 vs 过度设计 → 过度设计。** 引入 multiagent 解决的是本产品当前不存在（或未实测存在）的问题，代价是重构已稳定的编排/存储/确认三层。

### 2.4 不上 multiagent 时，当前架构应优先补什么（按优先级）

| 优先级 | 补什么 | 为什么 | 落点（文件） |
|---|---|---|---|
| **P0** | **计划步骤的输出→输入绑定**：允许 step N 的 result 以占位符（如 `${prev.id}`）被 step N+1 的 args 引用，执行引擎做结构化替换 | 这是 1.1 唯一真实的边界；不补则 `>` 自主计划只能做"互不依赖的并列步骤" | `ai-tools.js:1197` `_execPlanStep` + `parseAgentPlan` |
| **P0** | **写操作幂等**：planner 生成的写步骤带幂等键（或执行前查重），防重规划/续跑重复写 | 1.2 缺陷；重复数据是用户可感知的伤害 | `ai-tools.js:22-85` 写工具 + 计划执行 |
| **P1** | **更细的中断粒度**：单步异步工具可被 signal 中断 | 1.4；长 `web_fetch`/`code_run` 当前不可打断 | `ai-tools.js:1207-1223` |
| **P1** | **"部分完成"显式报告 + 可选补偿**：汇总里明示"哪些步已落地、哪些未做、建议如何处理" | 1.4；当前 `summarizeAgentPlan` 只报成败，不提"数据现状" | `ai-tools.js:1159` |
| **P2** | **多目标并发**（若产品确认有此需求，T4） | 2.1 第 2 点 | `ai-tools.js:554-580` |
| **P2** | **检索降级可见性**（迭代计划 v3.7.115 已排期） | 语义检索静默降级对用户不可见 | `docs/iteration-plan.md` 已列 |
| **P2** | token 预算从"截断"升级为"预算耗尽即优雅收尾" | 1.3；当前无熔断 | `ai-retry.js:867` 循环 |

---

## 任务 3 · 前端大规模测试策略（技术侧）

### 3.1 现状事实（实测）

- **单测**：147 个 `tests/*.test.js`（`git ls-files` 口径），主力是 **jsdom 全量加载 3.7MB HTML**（`tests/helpers/loadApp.js:49`），单次构造 0.8~1.3s，`testTimeout` 放宽到 60s（`vitest.config.js:11-17`）。**覆盖率恒 0%**（v8 无法插桩 `.html`，`vitest.config.js:23`）→ **不能用覆盖率做门**。
- **e2e**：14 个 `tests/e2e/*.spec.js`，`grep 'test('` 计 56 个 `test()`，Playwright 按 3 个项目（desktop/tablet/mobile）展开后 **约 90 例**；`workers=1` 串行（`playwright.config.js:31`），单例新起 chromium 加载 3.3MB（`playwright.config.js:36-68`），全量约 **4.1 分钟**。
- **视觉回归**：**0**。全仓 `toHaveScreenshot` / `toMatchSnapshot` / `screenshot(` **命中 0**（已实测）。`viewport.spec.js:4-6` 明确记录了**拒绝像素基线**的理由（本机无法生成 Linux 同环境基线 + 字体/抗锯齿噪声），改用**结构性不变量**（溢出/断点/触控目标/主区宽度）。
- **静态门禁**（`ci.yml` 实测，非"6 道"而是更多）：`check:source-state`、`src:check`、`check:modules`、`check:ai-tools-doc`、`lint`（eslint + lint-colors + lint-xss + lint-css-structure 四合一）、`lint:layers`、`lint:tokens`、`lint:empty-catch`、`check:pwa-icons`、`pet:check`；另有独立 `server-verify` job（7 个自足脚本）。
- **页面结构（17 个菜单项，已核对 `render-widgets.js:76-159`）**：
  - 总览组 4：`home` / `tasks` / `chainpage`（场景联动）/ `timeline`（时间轴）
  - 场景组 7：`ORDER`（office/data/design/study/code/life/health）
  - AI 组 1：`feat-ai`
  - 工具组 2：`toolbox` / `store`
  - 系统组 3：`recycle` / `settings`(sys-gear) / `help`
  > 注：以上是**内置**口径（`ORDER` 于 `core.js:8223`，7 个）。场景清单实为**两层**：内置 `ORDER` + **运行时**由插件启用/自定义场景 `ORDER.push` 追加的键（`data-links.js:142/147/153/157`；`:141` 只删"非内置且非预置"的键，故 `SCENARIOS.finance` 定义**常驻**，`core.js:8207` 预置"理财"场景，仅当插件启用才进 `ORDER`）。故"17 项"是内置基线；冒烟矩阵建立 `PAGES` 常量时必须处理该动态性。
  > 与 QA 复核确认（互补）：e2e 现有对 `finance` 的引用（`theme-matrix.spec.js:188` 只读 `--sc-finance` 令牌；`viewport.spec.js:314/365` 走 `page.evaluate(setActive(...))`）**均不点侧栏**，故只要 `SCENARIOS.finance` 在就能渲染——**既不假红也不静默跳过**。真实风险是**清单漂移**：e2e 里硬编码的 SCENES 列表与运行时 `ORDER` 会不一致（`viewport.spec.js` 第一组就漏了 `code`）。落点应是**导出「内置 ORDER + 运行时 ORDER」的只读快照**作为单一事实来源。

### 3.2 测试金字塔分配建议（本仓架构需要"重定义"金字塔）

**核心洞察**：本仓没有真正的"单元测试"物理层——所有用例都加载 3.7MB HTML，所以 147 文件其实是**集成级**。金字塔应按"**是否触发 DOM/存储/网络**"分层，而非目录。

| 层 | 占比建议 | 内容 | 理由 |
|---|---|---|---|
| **逻辑单测（纯函数）** | **40%** | NLP 解析（`parseNaturalLanguageTask`/`parseNaturalLanguageAction`/`parseDecomposeIntent`/`parseCodeGenIntent`）、`_estTokens`/`trimChatHist`、`_skillRelevance`、`ragTokenize`、`_parseToolArgs`、ICS 解析、`crypto` 往返、`_cn2num` | 这些**不需要 DOM**，当前却散在重型 `loadApp` 用例里白等 1s/次。抽出来后可脱离 jsdom 或最小 jsdom，单文件 <2s |
| **集成 / jsdom** | **35%** | 保持现有 `loadApp` 模式：`execTool`、Agent 链路（`agent-*.test.js`）、渲染函数、i18n 完整性、门禁契约 | 这是本仓最有价值的"中间层"，不可丢；也是唯一能覆盖"全量拼回产物"真实行为的手段 |
| **e2e** | **15%** | 用户旅程 + 跨视口不变量 + 真实浏览器独有（断点、命中测试、download、dialog） | jsdom 到不了的层（真实 hit-testing / CSS 断点 / 下载） |
| **视觉回归** | **10%** | **几何/DOM 不变量**（非像素），仅少量高价值低波动表面 | 见 3.4 |

**为什么不提高 e2e 占比**：单例冷启动 + 3.3MB 加载使 e2e 单价极高（4.1min/90 例 ≈ 2.7s/例仅 runner 侧，实际每例含启动开销更高）。金字塔的"重"要压在能快速反馈的层。
**为什么覆盖率不能当门**：`vitest.config.js:23` 实证 v8 无法插桩 `.html`，覆盖率恒 0；必须用"**按风险面的用例 + 回归率**"替代（与专家库 `test-discipline` 的"回归率与解决率并列"一致）。

### 3.3 e2e 矩阵设计（覆盖 17 页面而不让时长爆炸）

**不要**做 17 页面 × 3 视口 × 全流程（=51+ 组合，每组合冷启动一次 chromium）。采用**三轴分层矩阵**：

**轴 1 · 冒烟矩阵（覆盖 17 页面，性价比最高）**
- 新增 `tests/e2e/page-navigation.spec.js`：定义一处 `PAGES` 常量（`{ id, 菜单选择器, 期望根容器选择器, needSkipOnboard }`），数据驱动 `for (const p of PAGES) test(...)`。
- 每例只断言三件事：① 点击菜单项后目标容器渲染；② 无 `pageerror`/console error；③ 文档无横向溢出（`scrollWidth - clientWidth <= 0`，复用 `viewport.spec.js:41` 口径）。
- **同 chromium 实例内顺序导航**（`test.describe.configure({ mode: 'serial' })` + 复用 context 顺序点菜单），而非 17 次 `page.goto` 冷启动——这是把"17 页"从"17 次冷启动"降到"1 次冷启动 + 17 次导航"的关键。
- 预期收益：覆盖全 17 页面，CI 时长增量 ≤60s。

**轴 2 · 用户旅程矩阵（少而深，5~8 例）**
- 跨页面真实旅程：建任务→联动→统计→导出（现有 `workflow.spec.js`）；AI 对话→工具→落盘；集成推送（`integration-push.spec.js`）；云同步契约（`sync-contract.spec.js`）。
- 这些**已存在**，保持"每个旅程一个 spec、内部 `test.step` 组织"，不拆碎。

**轴 3 · 视口不变量矩阵（结构断言）**
- 沿用 `viewport.spec.js` 模式：断点分流 + 无溢出 + 触控目标 ≥40px + 主区宽度；**每组视口一组断言**，而非"每页面 × 每视口"。
- 新增页面只进轴 1，不进轴 3（除非该页面有独特响应式布局，如编辑器类）。

**时长控制手段（任选组合）**
1. 冒烟矩阵合并进 1 个 spec 顺序导航（省 16 次冷启动）。
2. CI 开 `fullyParallel: true` + `workers: 2~4` 并保留 `retries: 2`（`playwright.config.js:30` 现仅 CI 重试 2 次；当前 3.3min，翻倍也仅 6min）。
3. **本地/CI 分层**：本地默认只跑冒烟 + 受影响 spec（`--grep`），全量留 CI。
4. 把"每例都跑全量 3 项目"改为"仅冒烟在 3 项目跑、其余按需"（`playwright.config.js:87-104` 的 testMatch/testIgnore 已具备雏形）。

### 3.4 是否值得引入视觉回归？—— 值得，但**不是像素 diff**

**判断**：值得引入，但采用**分层策略**，从最稳的开始，避免一上来就吃像素噪声。

| 层级 | 手段 | 覆盖对象 | 维护成本控制 |
|---|---|---|---|
| L1（先做） | **几何不变量**（现有 `viewport.spec.js` 已实现） | 溢出/断点/触控目标/主区宽度/顶栏高度 | 极低；阈值取实测 + 余量 |
| L2（推荐） | **DOM 结构快照**（`toMatchAriaSnapshot` 或自定义脱敏后的结构 hash） | 侧栏菜单树（17 项）、设置抽屉各分区控件清单、卡片层级 class | 中；**必须先脱敏**动态 id/时间戳/计数 |
| L3（可选） | **像素 diff**（`toHaveScreenshot({ animations:'disabled', maxDiffPixels, threshold })`） | **仅 ≤5 个核心页面**（主页/任务/场景主区/AI/设置）× 桌面视口 | 高；**只在 CI（固定 Linux + 固定 chromium 版本）生成基线**，`mask` 掉动态区（时间/计数/宠物立绘） |

**flaky 控制**（本仓已有正反例）：
- 正例：`workflow.spec.js:38` 的 `switchScene` 用"判别性等待（断言 `active` 令牌）+ `toPass` 重试块"，正是对 `renderSide()` 整体替换 `#side` innerHTML 引发的点击竞态的正确解法。
- 反例：`workflow.spec.js:125` 的 `page.waitForTimeout(300)`（固定等待）是 flaky 温床，应逐步替换为判别性等待。
- 硬约束：像素 diff 的基线**只能由 CI 生成/更新**（本地环境不同必红）；`maxDiffPixels`/`threshold` 放宽到只抓"结构性变化"而非抗锯齿噪声；`workers=1` 时像素测试才稳定，若开并行需给像素用例单独 serial 项目。

### 3.5 分阶段可执行建议

**阶段 1（1~2 天 · 零风险）— 覆盖 17 页面的冒烟矩阵**
- 建 `PAGES` 常量 + `page-navigation.spec.js`（轴 1，单 spec 顺序导航）。
- 验收标准：17 页面 100% 覆盖；CI e2e 时长增量 ≤60s；连跑 3 次零 flaky；断言含"无 pageerror + 无横向溢出"。

**阶段 2（2~3 天）— 抽离纯逻辑单测**
- 把 NLP/token/技能打分/ICS 解析/crypto 往返等纯函数用例从重型 `loadApp` 迁出（目标 30~50 个快用例）。
- 验收标准：这批用例单文件跑完 <2s；不依赖全量 `loadApp`；迁移后原用例语义零损失（回归率 0）。

**阶段 3（2~3 天）— 结构/DOM 视觉不变量**
- L2：为侧栏菜单树 + 设置抽屉分区 + 5 个核心页面加**脱敏后的 DOM 结构快照**；L1 几何断言扩展到 5 核心页 × 3 视口。
- 验收标准：注入一次布局回归（如删一个断点规则）能被断言抓红（**变异定向验证**，参考 `test-discipline` §5）；每 PR 需更新的快照数 ≤ 1~2 个（维护成本可控）。

**阶段 4（持续）— 分层 + 并行**
- 本地跑"冒烟 + 受影响 spec"，CI 跑全量；CI 开 `workers: 2~4`。
- 验收标准：CI e2e < 6min；本地全量 e2e < 3min；`retries: 2` 下连续 10 次全绿。

### 3.6 任务 3 结论

- 现有 e2e 是"**按功能主题切片**"，覆盖的是**横切的不变量**（i18n/主题/移动/同步契约），**不覆盖"每个页面可达且渲染正确"这一纵向维度**——这就是"17 页面"的空白所在。用"数据驱动冒烟矩阵"补这一维，成本最低。
- **不要引入全量像素视觉回归**；用 L1 几何不变量 + L2 脱敏 DOM 快照，把像素 diff 限制在 ≤5 核心页 × 桌面视口 × 仅 CI 基线。
- 金字塔应重定义为"**40% 逻辑 / 35% jsdom 集成 / 15% e2e / 10% 结构视觉**"，并以"风险面用例 + 回归率"替代恒 0 的覆盖率门。

---

## 附录 A · 关键证据索引

| 主题 | 证据（文件:行号） |
|---|---|
| 两条执行链分离 | `ai-retry.js:845`（runChatLoop）、`ui-palette.js:203` → `ai-retry.js:429` → `ai-tools.js:1276` |
| 计划解析与步数封顶 | `ai-tools.js:1053` / `ai-tools.js:309,1074` |
| 步骤依赖缺失 | `ai-tools.js:1207-1216`（直接用 `step.args`） |
| 重规划触发/上限 | `ai-tools.js:1248,1308,1283-1284,1311` |
| 读重试/写不重试 | `ai-tools.js:1194,1207,1222` |
| LLM 重试矩阵 | `ai-loop.js:319,380-407,472-486` |
| 幂等缺失 | `ai-tools.js:26-29`（push）、`ai-tools.js:83`（unshift） |
| 破坏性拦截/白名单 | `ai-tools.js:277,1198-1202` |
| 循环/步数硬上限 | `ai-retry.js:867,853-856`、`ai-tools.js:305,309` |
| Token 预算（截断式） | `ai-tools.js:2637-2655,2067-2078`、`ai-retry.js:380` |
| 取消即时生效 | `ai-retry.js:66,936,959`、`ai-tools.js:1291` |
| 断点续跑/done 权威 | `ai-retry.js:280,507-535,327,541` |
| 单目标聚焦 | `ai-tools.js:561` |
| 串行执行 | `ai-tools.js:1295`、`ai-retry.js:956-977` |
| 架构决策自陈 | `ai-tools.js:1179-1184` |
| 17 页面菜单 | `render-widgets.js:76-159` |
| e2e 配置/时长 | `playwright.config.js:30-71,87-104` |
| 覆盖率恒 0 | `vitest.config.js:19-25` |
| 视觉回归 0 / 拒绝像素基线 | 全仓 grep 命中 0；`viewport.spec.js:4-6` |
| jsdom 加载 3.7MB | `tests/helpers/loadApp.js:49` |

## 附录 B · 本次评估未覆盖 / 需人工确认

1. **真实模型下的规划质量**：本次只做静态代码路径评估，未跑真实 LLM 驱动 `>` 计划（`_probe/agent-features.mjs` 已验证过假 LLM 全链路，本次未复跑）。
2. **`ai-tools.js` 全文 2673 行中 1450~2670 段**（RAG/向量/SQL 沙箱/note 工具）：本次聚焦 Agent 链路，未逐行深读，但结论不依赖该段。
3. **性能/容量**：`ctxBudgetTokens` 与真实模型 token 计的换算误差（`_estTokens` 是粗估）未在真实会话中采样验证。
