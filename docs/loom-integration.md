# Interaction ↔ nexusloom：MCP 接入指南

nexusloom 在办公系统里充当**不可见的 AI 交付运行时**：负责长任务执行、持久状态、人工审批、恢复、输出契约与审计。Interaction 继续使用自己的聊天界面、工具白名单和危险确认，不需要把 DAG 或另一套控制台交给用户。

本指南采用 **MCP over Streamable HTTP**。Interaction 的产品执行链无需修改。

## 1. 启动 nexusloom

在 nexusloom 项目目录启动 Admin API（默认仅回环地址）：

```bash
# 示例：设置本机管理凭据；请换成自己的值，不要写进文档、URL 或提交。
export ADMIN_API_KEY='<本机管理凭据>'
python run.py --dashboard
```

默认地址为 `http://127.0.0.1:8910`，MCP 端点为：

```text
http://127.0.0.1:8910/mcp
```

需要模型生成的流水线还应按 nexusloom 文档配置供应商环境变量。密钥只通过环境变量或密钥服务注入，不写入 Interaction 配置。

**边界**：`/mcp` 首版只接受 admin Principal；未鉴权返回 401，具名非 admin token 返回 403。不要把回环服务改成公网绑定后再共用同一把管理密钥。

## 2. 在 Interaction 添加服务器

推荐使用 **Electron 桌面版**：其主进程 `mcp-fetch` 代理不受浏览器 CORS 与 Local Network Access 限制。浏览器直连本机服务是否可用取决于部署来源和浏览器权限，不能当作验收捷径。

1. 打开「设置 → 集成 → MCP」。
2. 新增服务器：
   - 名称：`loom`
   - URL：`http://127.0.0.1:8910/mcp`
   - 启用：是
   - 鉴权：Bearer
3. 在会话内填入 `ADMIN_API_KEY`。Interaction 只保存鉴权方式和头名，密钥值只活在本页内存中，不进备份、云同步或刷新后的页面。
4. 刷新工具清单，应看到 **9 个工具**。

## 3. 工具与确认语义

| 工具 | 用途 | Interaction 默认确认 |
|---|---|---|
| `get_task` | 查询状态、审批等待、产物与错误 | 只读，免确认 |
| `list_tasks` | 列出任务 | 只读，免确认 |
| `list_pipelines` | 列出已安装流水线 | 只读，免确认 |
| `get_pipeline_info` | 查询拓扑与输入声明 | 只读，免确认 |
| `generate_document` | 提交文档任务 | 需要确认 |
| `run_workflow` | 提交任意流水线 | 需要确认 |
| `approve_task` | 批准审批门并续跑 | 需要确认 |
| `reject_task` | 驳回审批门并终止 | 需要确认 |
| `resume_task` | 恢复用户主动暂停的任务 | 需要确认 |

默认不要把写工具加入自动执行白名单。模型生成工具调用后，先由用户确认，再执行；`tools/call` 不因网络失败而自动重放。

## 4. 长任务：提交、轮询、审批、恢复

### 提交

长任务使用 `wait=false`，不要用同步等待堵住 Interaction 的 15 秒 MCP 客户端窗口：

```json
{
  "name": "office-daily-report",
  "inputs": "这里放当前用户已经有权访问的内部上下文",
  "wait": false
}
```

保存返回的 `task_id`，随后用 `get_task` 轮询，而不是重复提交。

### 审批

当 `get_task` 同时满足：

```text
status = paused
awaiting_approval != null
```

这表示流水线声明的人工审批门，不是普通暂停：

- 放行：`approve_task(task_id, note?)`
- 终止：`reject_task(task_id, reason?)`
- **不要调用 `resume_task`**；引擎会拒绝它，以防绕过人工审批。

### 普通暂停恢复

仅当任务是用户主动暂停、且 `awaiting_approval == null` 时，使用 `resume_task(task_id)`。已完成、失败或等待审批的任务不能靠 resume 改写状态。

## 5. 已验证的联调链

2026-11-24 使用 Interaction 自己的 MCP 客户端连接 nexusloom `/mcp` 实测：

1. initialize → notifications/initialized → tools/list，发现 9 个工具；
2. 查询工具免确认，run/approve/resume 保持危险确认；
3. `run_workflow(wait=false)` 写调用恰好一次；
4. 任务进入 `paused + awaiting_approval`；
5. `resume_task` 被拒；
6. `approve_task` 后任务到 `done`。

该验收使用离线摘要与审批流水线，不调用付费模型，也不发送短信或外部业务数据。
