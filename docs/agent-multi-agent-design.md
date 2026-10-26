# Multi-Agent 设计 · 从单点 Agent 到多代理协作（v1 提案 · 2026-10-26）

> 发起：用户「一开始是 single 单点，现在有必要做 multi-agent 了，多 agent 协调问题要解决好」。
> 本文是在**既有护栏内**的落地设计——不推翻 v3.7.x 的计划-执行架构（用户 2026-10-03 裁定过
> 「护栏收益远大于换架构」，multi-agent 在护栏之上生长，与该裁定不冲突）。

## 一、现状盘点（实测，非推断）

| 已有 | 位置 | 说明 |
|---|---|---|
| 计划-执行器 | `ai-tools.js parseAgentPlan/executeAgentPlan` | LLM 产出 `{goal, steps:[{tool,args}]}` JSON，逐步执行；危险工具跳过回 `needsConfirm`；步数封顶（`AGENT_PLAN_STEPS_MAX`）；abort 传播 |
| Reactive 执行 | `executeAgentPlanReactive` | 第二条执行路径（ Reactive 型） |
| 对话循环 | `ai-loop.js chatOnce` / `ai-retry.js runChatLoop` | 工具调用轮；写穿镜像进会话 |
| 运行台账 | `ai-retry.js agent_run`（`wb_agent_agent_run`） | `{goal, text, sc, steps, done[], at}`——Code 模式 dock 的「进程」面板已消费 |
| 能力面 | 技能（`listEnabledSkills` 注入提示词）、MCP（真接入）、记忆（remember/recall） | |
| 护栏 | 危险工具二次确认、步数封顶、abort、诊断、工具白名单 | 全部可复用 |

**缺的**：subagent（隔离子任务执行体）、编排（多步骤委托）、多代理协调与可观测（注册表 + 监控 UI）。

## 二、核心设计：SubAgent = 隔离上下文的委托执行体

**协调模型（一句话）**：主对话循环是唯一协调者（Coordinator）；「派生子代理」对它只是一个**新工具**
（`spawn_agent`）。Coordinator 把子目标委托出去，子代理在**隔离上下文**里用自己的工具白名单跑完，
把**最终报告**作为工具结果交回——coordinator 决定下一步。这是最简单可靠的协调模型：
单事件循环、顺序执行、无锁、无竞态。

### 关键决策（默认值，用户可推翻）

1. **顺序编排优先**：P1 不做并发（单事件循环天然无竞态）；P3 再引入「只读侦查子代理并行」。
2. **深度 1**：subagent 的工具白名单**不含** `spawn_agent`——防递归派生失控。
3. **工具白名单 per-subagent**：spawn 时声明 `tools`（默认只读集：list_tasks/list_notes/search/list_records…）；
   写工具须显式授予。
4. **护栏全部继承**：危险工具不因 multi-agent 豁免（白名单默认就不含）、步数预算（默认 12，硬顶 24）、
   abort 传播、诊断上报、成本可见（每子代理的 token 计入既有 usage 账）。
5. **本地优先**：无服务端 agent runtime——子代理与主循环同进程、同模型配置；持久化走 localStorage
   （`wb_agent_subagents` 注册表，登记进键注册表）。
6. **可观测优先**：注册表即监控面——Code 模式 dock 的「进程」段实时显示每个 subagent 的
   状态（排队/运行/完成/失败）、步数、最终报告摘要。先有监控再有并发。

### 数据模型

```
wb_agent_subagents: [{
  id, name,                      // "侦查-1" 等人读名
  role,                          // 注入子代理系统提示的角色描述
  goal,                          // 子目标
  tools: [..],                   // 工具白名单（名字数组）
  maxSteps,                      // 步数预算
  status: "queued|running|done|failed|cancelled",
  steps: n,                      // 已执行步数
  msgs: [...],                   // 隔离上下文（coordinator 的历史不进子代理）
  result: "最终报告",             // 结束时的报告（工具结果回传给 coordinator）
  createdAt, updatedAt, ms
}]
```

### 交互流（真机链路）

1. 用户对主 AI 说「把三份资料整理成对比报告」；
2. 主循环（coordinator）规划 → 选择 `spawn_agent({name:"整理员", role:…, goal:…, tools:[list_notes,…]})`；
3. `spawn_agent` 实现：建注册表记录 → 起隔离循环（系统提示 = 角色描述 + 可用工具说明；
   循环 = 复用 chatOnce 的工具调用轮）→ 结束后把最终 assistant 报告作为工具结果返回；
4. coordinator 读报告 → 决定继续派生还是给用户最终答复；
5. 全程在 dock「进程」段可见：子代理名/状态/步数（v3.7.148 的监控位正好接上）。

## 三、阶段计划

- **Phase 1（本批）**：`src/ai-subagent.js` 运行时核心（spawnSubAgent/注册表/深度与预算护栏）+
  `spawn_agent` 工具接入（TOOLS + execTool 分发 + 默认白名单）+ 键注册表登记 +
  dock「进程」段消费 + `tests/subagent.test.js`（假 LLM：apiFetch 桩按脚本回 tool_calls，走真循环）。
- **Phase 2**：UI 完整化——Code 模式中栏的会话里显式渲染 subagent 卡片（派生参数/实时步数/结果）；
  用户面板开关（默认开）；提示词技能（预置「如何委派」示例）。
- **Phase 3**：并发只读侦查（两阶段：并行侦查 → 串行写入）+ workflow 编辑器（DAG 可视化）。

## 四、风险与对策

| 风险 | 对策 |
|---|---|
| 递归派生失控 | 深度 1 + 白名单不含 spawn_agent + 步数预算 |
| 成本失控 | 每子代理步数预算 + token 入既有 usage 账 + dock 可见 |
| 危险操作绕过 | 白名单默认只读；写工具显式授予；危险工具二次确认**不豁免** |
| 会话镜像污染 | 子代理上下文隔离（不写 chat_<sc>，只写注册表）——与 v2.0 镜像层零交集 |
| 并发竞态 | P1 顺序执行；P3 并发仅只读子代理 |
| 测试假绿 | 假 LLM 走真循环（apiFetch 桩），不 mock 实现——与 oauth-check/sms-check 同纪律 |
