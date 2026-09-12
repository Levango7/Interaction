# v3.5.0 版本规划——罗列 · 分析 · 设计（待审核）

> 状态：**审核稿**。通过后按批次实施，任何批次测试不绿即回退。
> 基线：HEAD = a7113ea（v3.4.11 + v3.4.7 七批次，工作区干净，全量测试绿）。

---

## 一、候选池罗列（来源：历轮评估报告遗留 + CHANGELOG 记录 + 代码现状勘察）

### A. 既有承诺/记录在案的欠账

| # | 候选项 | 来源 | 现状证据 |
|---|---|---|---|
| A1 | **server 云同步前端对接** | CHANGELOG v3.4.8「排期做前端对接（云同步/推送/集成代理）」 | 勘察修正：登录/注册/账号面板 UI **已全部存在**（任务235 全套，agent-workbench.html L31260-31310 完整登录流）；apiLogin/apiRegister/register 引用 86+55 处。**真正缺的是云同步数据通道**——`sync` 引用 487 处但走的全是本地回环 sync-server；server 端 `notifications/scheduler/integrations` 三模块无前端消费入口 |
| A2 | **任务谱系可视化**（产品建议 #2） | 批次五方案文档「待时间机器验证接受度后再评估」 | 时间机器已上线（4ad87f2），事件日志基础设施就绪；谱系数据源=联动规则的 task.linked 标记 |
| A3 | **浏览器多标签存储互踩** | 批次方案「记录为已知限制」 | localStorage 无跨 tab 锁；BroadcastChannel 方案未做 |
| A4 | **H4 模块化拆分** | SECURITY TODO [C3] | 单文件 39,500 行；unsafe-inline 依赖 H4 解除。量级=架构工程 |
| A5 | **Electron 流式透传** | 记忆库「遗留已记录」 | chatOnce 流式（SSE）仅浏览器直连生效；Electron 主进程代理不透传 stream，Electron 用户无打字机效果 |

### B. 本轮勘察新发现（值得进版本）

| # | 候选项 | 现状证据 |
|---|---|---|
| B1 | **stub 工具落地**：视频生成 des-vidgen / 图片生成 des-imggen / 时间追踪 x-tracker 均为占位页（openToolStub 无 TOOL_APPS 实现） | 工具箱/设计场景点进去全是「即将上线」占位 |
| B2 | **时间机器 v2**：事件粒度扩展 | 当前只记 create/complete/delete 三类；无移动/优先级变更/编辑事件 |
| B3 | **RAG 注入的自动索引** | 批次六接通了注入开关，但索引构建靠 ragReindex 手动/启动触发——需确认任务/记录新增时是否自动 ragIndexAdd（若否则开关开了也只是旧索引） |
| B4 | **server README 缺失** | server/README.md 行数=0（空文件或仅标题）——CHANGELOG v3.4.8 说"新增 server/README.md"但实际为空 |

### C. 测试/基建健康项

| # | 候选项 | 现状证据 |
|---|---|---|
| C1 | **vitest-worker RPC 超时根除** | 两轮全量跑均随机吞 2-5 个文件（环境问题，补跑全绿）；vitest 2.1.9 升级 3.x 可解（breaking change 需迁移评估） |
| C2 | **e2e 久未跑** | tests/e2e 在 exclude 里，scripts/run-e2e.mjs 存在；上轮记录"e2e 全挂在 launch 阶段=环境问题"——PWA 启动链路无 e2e 保护 |

---

## 二、逐项分析与取舍建议

### 推荐 v3.5.0 纳入（按价值/风险比排序）

**① A1 云同步对接（补齐闭环）**——价值最高
- 前端 80% 已存在（登录/token/刷新/面板全有），缺的是「数据同步」这最后一环
- 设计：登录后设置页新增「云端同步」分区——手动「上传快照/下载合并」两按钮起步（复用 doImport 的 _deviceMeta 合并逻辑，POST 到 server /api/sync 端点），**不做后台自动同步**（本地优先原则，自动冲突合并风险大）
- server 端：`server/src/routes/` 新增 sync 路由（JWT 保护 + 快照存 SQLite + 按用户隔离）
- 改动面：前端 ~120 行（UI+client）+ server ~100 行 + 测试
- 风险：中（网络层，全部走已有 apiFetch 封装 + server 已有 JWT/限流基建）

**② B4 + server 文档补齐**——零风险顺手项
- server/README.md 写实际内容（API 表/环境变量/安全机制——CHANGELOG 已描述过，落到文件）
- 顺手做：A1 的文档同步

**③ B3 RAG 自动索引核查与接线**——激活批次六的完整价值
- 若新增/完成任务没有自动 ragIndexAdd，批次六的开关开了也只能检索到上次手动 rebuild 的旧数据
- 设计：`setTasks`/`setRec` 写穿钩子顺带 ragIndexAdd（增量、失败静默）；上限守卫（文档总数 2000 上限防膨胀）
- 改动面：~30 行 + 测试

**④ A5 Electron 流式透传**——体验补齐
- 设计：main.js chat handler 检测 body.stream → fetch 拿 ReadableStream → chunk 经 IPC `chat-chunk` 事件转发；preload 加 onChatChunk 监听；chatOnce Electron 分支拼 onChunk
- 改动面：main.js ~40 行 + preload ~8 行 + chatOnce ~10 行
- 风险：中（动 chat 主链路；有批次七契约测试护着重试矩阵，流式不进重试逻辑）

**⑤ C1 vitest 升级评估**（只评估+试验，不强制升）
- 锁 worker 数跑分批模式固化为 npm script（`test:batches`），绕开 RPC 超时；vitest 3 升级单独做 spike（新开 worktree 验证 72 文件全绿后另行提 PR）

### 明确不纳入 v3.5.0（理由）

| 项 | 理由 |
|---|---|
| A4 H4 模块化拆分 | 量级不匹配（39.5k 行单文件拆模块=整季度工程）；且单文件是产品主动选择。**建议单列 v4.0 立项**，v3.5.0 只把 SECURITY TODO 注释更新为指向 v4.0 |
| A2 任务谱系可视化 | 联动数据密度低（多数用户 <10 条链）的判断未变；时间机器刚上线需先积累使用反馈。**推迟到 v3.6** |
| A3 多标签 BroadcastChannel | 单机单用户场景下多标签并发写是低频边缘场景；存储层现有 IDB 镜像 + 三代备份已兜住恢复面。**保持已知限制** |
| B1 stub 工具落地（视频/图片生成） | 依赖外部 AI 生图/生视频 API 计费决策（用户未拍板供应商/预算）；时间追踪是独立功能开发。**各自单列待产品决策** |
| B2 时间机器 v2 | v1 刚上线，事件类型扩展（移动/编辑）待 v1 使用反馈。**v3.6 候选** |
| C2 e2e 修复 | 历史记录"launch 阶段全挂=环境问题"；需先人工在本机验证 e2e 是否可跑再谈修复。**另立调查项，不占版本** |

---

## 三、v3.5.0 批次设计（通过后实施）

```
批次 1：B3 RAG 自动索引接线（最小、独立、先做——激活批次六完整价值）
批次 2：A1 云同步对接（server sync 路由 + 前端手动上/下载 UI）
批次 3：A5 Electron 流式透传（chat 链路，放批次 2 后降低连环风险）
批次 4：B4 server README + CHANGELOG v3.5.0 条目 + SECURITY TODO 指向 v4.0
批次 5：C1 test:batches npm script 固化（vitest 3 spike 另开 worktree，不进主线）
```

每批次：独立 commit + 新增回归测试 + 全量分批验证绿后推送。
预计新增测试 ~15 个；预计改动 ~400 行（主文件 ~250 / server ~100 / 测试 ~50）。

---

## 四、需要你拍板的三个点

1. **①云同步的手动/自动取舍**：我建议 v1 只做**手动**上/下载（自动同步的冲突合并复杂度高，且与"本地优先"原则冲突）——同意吗？
2. **server 同步的存储形态**：快照整存（简单，每次覆盖用户最新）vs 按 key 分版本（可回溯，量大）——我建议**快照整存 + 服务端保留最近 3 代**（与本地 G3 三代滚动同哲学）？
3. **Electron 流式透传是否值得做**：它只影响 Electron 用户的观感（浏览器 PWA 已有流式）——如果你的主要使用形态是 Electron 桌面端，值得；纯浏览器用则可推迟。你的使用形态是？
