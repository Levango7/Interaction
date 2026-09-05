# 遗留问题批次方案（v3.4.7）——分析与设计，待审核

> 依据：本轮存储层评估报告 G3-G5 + 产品建议清单 + 后端评估遗留项。
> 每项 = 根因分析 → 设计方案 → 改动面 → 验证方式 → 风险与回退。
> **审核通过后**按批次实施；任何批次测试不绿即回退。

---

## 批次一：G4 损坏防护扩展（静默丢数据——危害最大、改动面小）

### 根因
`migrate()`（L8255）只对 tasks/cfg/links 三个 key 做损坏备份（语法错→登记 `_corrupted`；结构错→`_backupBroken` 存原值再重置）。其余业务 key（`rec_*`、`chat_*`、`ai_sessions`、`notes`、`rag_docs`、`wb_conversations`、回收站等 10+ 个）在各自 load 处 catch 后**直接返回空数组**——一次 JSON 截断（配额边缘写半截）即让某场景全部记录静默消失且不可恢复。

### 设计
不逐 key 复制 `_validateAndMigrateTasks`（它是结构修复型，重）。轻量方案：
- `migrate()` 内新增 `_guardGenericJsonKey(key)`：对白名单 key 列表逐个 `JSON.parse`；
  - 语法错 → 存原值到 `wb_agent_broken_<key>_<ts>`（与 `_backupBroken` 同模式）+ 登记诊断，然后重置为空数组；
  - 语法对但非数组 → 同样备份 + 重置。
- 白名单（13 个）：`rec_office/code/study/life/data/design`（动态 `ORDER` 生成）+ `ai_sessions`、`chat_*`（7 场景动态生成）、`notes`、`rag_docs`、`wb_conversations`、`wb_long_term_memory`、`recycle_bin`。

### 改动面
- `migrate()` 尾部加 ~25 行循环；新增 `_brokenBackup(key, raw)` 复用函数 8 行。
- 不改任何 load 逻辑（它们兜底 `[]` 的行为保留—— migrate 先行备份后，兜底即安全）。

### 验证
- 新增测试 `tests/storage-guards.test.js`：预置一个损坏 JSON 到 `rec_office`，跑 migrate，断言 `wb_agent_broken_rec_office_*` 键存在且值等于原串、诊断登记 1 条。
- 全量回归（分批跑）。

### 风险
- 极低。只新增分支，不改既有路径。回退 = 删 25 行。

---

## 批次二：G3 自动备份三代滚动（快照单代覆盖问题）

### 根因
`snapshotAutoBackup`（L8493）单键覆盖写。若数据已损坏，下一次任何写入都会把"最后一份好快照"覆盖成"损坏数据的快照"，恢复入口只能回到最近一次（已损坏）。

### 设计
- 备份键从 1 个变 3 个：`autobackup`（最新）、`autobackup.1`（上一代）、`autobackup.2`（上上代）。
- 写入时**环形滚动**：`autobackup.2 ← autobackup.1`、`autobackup.1 ← autobackup`、`autobackup ← 新快照`。滚动只在快照成功后发生（失败不动旧代）。
- `recoverAutoBackup` 增加代际参数（默认最新代，设置页"从自动备份恢复"不变）；恢复前逐键校验 JSON 可解析（`_guardGenericJsonKey` 同款判定），损坏则提示并回退到上一代。
- 体积上限仍 1.5MB/代（3 代共 ~4.5MB，仍在 5MB 内但接近边缘——**配额护栏**：写入前若 `新串+旧2代 > 4MB` 则只保留 2 代）。

### 改动面
- `snapshotAutoBackup` +~18 行（滚动+护栏）；`getAutoBackup`/`recoverAutoBackup` 改造 +20 行；设置页恢复按钮流程不变。
- 存量用户升级：首次写入时旧 `autobackup` 自动成为第 1 代（无需迁移代码——滚动逻辑天然处理）。

### 验证
- 测试：连续 3 次快照后 3 个键各不相同；损坏最新代后 recover 回退到上一代；4MB 护栏触发时只留 2 代。

### 风险
- 低-中。备份键多占 ~3MB（数据量大时）。护栏防溢出。回退 = 恢复单代写入（保留滚动的备份键删除即可）。

---

## 批次三：G5 旁路写收编（6 处裸 setItem 绕过 save() 封装）

### 根因
`saveAiConfig`/`saveNotes`/`saveConversation`/`saveRagDocs`/`_persistTokens`/主题写入等 ~6 处直接 `localStorage.setItem`，**不走 save()**——无 IDB 镜像、无 QuotaExceeded 告警、无损坏登记。这些键在全量备份里存在，但 IDB 恢复时缺失（`idbRestoreAll` 只补缺失——它们从未进镜像）。

### 设计
逐个改为经 `save(PREFIX+key, value)`：
| 位置 | 现状 | 改法 |
|---|---|---|
| saveAiConfig (L22233) | 裸 setItem，catch 返回 false | 改 `return save(PREFIX+"ai_config_"+module, data)`（save 内部 try/catch 返回布尔语义对齐） |
| saveNotes (L34098) | 裸 setItem | 改 save() |
| saveConversation (L35259) | 裸 setItem | 改 save() |
| saveRagDocs (L7800) | 裸 setItem | 改 save() |
| _persistTokens (L30525) | 3 键裸写 | 改 save() ×3（wb_ 前缀在镜像范围内） |
| 主题写入（31350/31489 附近） | 裸 setItem | localStorage.theme 键**不带 PREFIX**（`localStorage.theme`），idbShouldMirror 不匹配——保持裸写但**包告警**（catch→toast） |
- save() 签名确认：现返回 undefined？→ 需要看 save 实现给它加返回布尔（不破坏现有调用——加返回值是向后兼容的）。

### 改动面
- 5 处函数体各 1-2 行改动 + save() 返回值 1 行 + 主题写入 2 处加告警。

### 验证
- 测试：saveAiConfig 写入后 `idbQueueMirror` 被调用（spy）；QuotaExceeded 场景 saveAiConfig 返回 false 且 toast。
- 现有 idb 测试（round5-loop1-idb）全量回归。

### 风险
- 低。save() 是既有的主入口，语义不变。唯一注意：`ai_config_*` 会开始进 IDB 镜像（多几 KB）。

---

## 批次四：存储用量仪表（评估报告"容量治理缺位"的直接解法 + 产品建议#4 简化版）

### 根因
无 `navigator.storage.estimate()` 调用、无按 key 体积统计。用户完全看不到离 5MB 上限还有多远；`checkCount`（L20028）只数条目不数字节且对象 key 无意义。

### 设计
设置页「数据管理」顶部加**存储用量卡**：
- 一条容量横条：已用/总量（`navigator.storage.estimate()` 的 usage/quota——注意 Electron/Chrome 下 quota 通常 >5GB 是 IDB 的，localStorage 实际限 5MB——**显示两者中更小者**并标注口径）；
- localStorage 字节统计（逐 key `getItem(k).length`，同步计算 <10ms，200+ 键无压力）；
- Top 5 大 key 列表（键名 + KB + 占比条）；
- 5 个警告阈值：70%/85%/95% 三档 toast + 用量卡变色；超限时"建议导出备份并清理"操作直达。
- i18n 全套 key（zh/en）。

### 改动面
- HTML：数据管理区 1 张卡（~15 行）；JS：`renderStorageUsage()` 函数 ~60 行 + 绑定；CSS ~15 行；字典 10+ key。
- `renderAutoBackupMeta` 保留不动（快照时间是另一维度）。

### 验证
- 测试：stub `navigator.storage.estimate` 返回固定值，断言横条文案/Top5 排序/阈值 class；jsdom 下 estimate 不存在时的降级路径（只显示 localStorage 字节）。

### 风险
- 极低。纯展示层。回退 = 删卡。

---

## 批次五：产品建议 #1「任务时间机器」（undo 栈扩展为时间轴回放）

### 根因/机会
undo 栈已有 50 快照（内存），但用户**看不见**历史——只能一级级撤销。任务状态变化的历史信息（何时创建/完成/移动）对周报复盘有真实价值。

### 设计（保守版——不新增存储，先做"可视化只读"）
- 侧栏任务组加「时间轴」子页（`active="timeline"`）：
  - 横轴 = 最近 14 天；每列一天；
  - 每天从 undo 栈快照差分出「新建 X 条 / 完成 Y 条 / 移动 Z 条」——**undo 栈是全量任务快照数组**，相邻快照 diff 即可得变化事件（新增 id / 消失且 status=done → 完成 / status 变更 → 移动）；
  - 纵向按场景色分泳道；空数据天显示灰点。
- **只读**——不做"回到第 N 步"（那是 undo 本体，跨数据状态恢复有 G4 级风险，v1 不做）。
- 持久化：undo 栈是内存态，刷新即失——v1 接受（时间轴显示"本次会话"），若验证有价值，v2 再做事件日志键（`wb_agent_task_events`，每次 task_create/complete 追加，上限 500 条，与迁移日志同模式）。
- **v1 直接带事件日志**（绕过 undo 栈差分的复杂度）：`_emitTaskEvent` 已存在（task_delete 等已发）——扩展它持久化到 `wb_agent_task_events`，时间轴直接读事件流。比差分简单且数据结构稳定。

### 改动面
- `_emitTaskEvent` +持久化 6 行；`renderTimelinePage()` ~90 行（含 SVG/HTML 混排泳道图）；侧栏菜单项 +1；CSS ~20 行；i18n 8 key。
- 路由：`render()` 加 `active==="timeline"` 分支（renderTasksPage 同款 + appendFoot）。

### 验证
- 测试：emit task_create → 事件键追加；时间轴渲染含当天列；14 天外的事件被裁剪；500 条上限滚动。

### 风险
- 低。纯新增页面 + 1 个追加型存储键（500 上限）。回退 = 删页面 + 事件键停写。

---

## 批次六：产品建议 #3「RAG 接入 AI 助手入口」（激活已有索引）

### 根因/机会
RAG 基础设施已建好（ragInit/ragIndexAdd/ragSearch + 降级关键词匹配），但消费点只有 sql_query 工具——用户提问时**不会自动注入**相关任务/记录上下文，索引资产闲置。

### 设计
- 在 `chatOnce` 组装 messages 时（发送用户消息前）：
  - 调 `ragSearch(userText, 3)` 取 top3 相关文档；
  - 有结果 → 在 system prompt 追加一段"用户相关上下文"（`ragInjectContext(userText)` 函数**已存在**——检查它的接线状态，可能只需一行调用）；
  - 开关：设置页 AI 区加「上下文注入（实验性）」checkbox，默认关（避免 token 意外膨胀），存 `ai_config_memory`。
- 查 `ragInjectContext` 现有调用点，若已有开关语义则复用其配置。

### 改动面
- chatOnce +1 处调用（带开关守卫）；设置页 1 个开关；i18n 4 key。

### 验证
- 测试：开关关→不注入；开+有索引→system 含上下文段；降级（sql.js 不可用）→ 关键词匹配注入。

### 风险
- 中。chatOnce 是 AI 主链路——改动必须有开关守卫 + 默认关。回退 = 关开关即等效未上线。

---

## 批次七：后端遗留——chat 重试矩阵跨进程双实现（文档化收尾，不改代码）

### 根因
electron/main.js `chat` handler（L469-556）与前端 chatOnce 是**跨进程双实现**，修改任一侧需人工同步（main.js L471 注释已警示）。合并依赖 H4 模块化拆分（架构级，非本轮）。

### 设计
不合并（H4 依赖），做**防护收尾**：
- 在两处文件的**重试矩阵顶部**加镜像警示注释已在（L471-473）——补齐**前端 chatOnce 侧**的对应警示注释（检查是否存在，不存在则加）；
- 在 `tests/ai-retry-contract.test.js` 补一条**双实现一致性契约测试**：断言两侧的重试次数（3）、退避公式（1s×attempt）、超时上限（120s）、可重试状态码（429/5xx）**四处参数一致**——任何一侧漂移即测试红。

### 改动面
- 前端注释 3 行；契约测试 1 个 describe（静态源码断言，无需跑真实请求）。

### 验证
- 契约测试绿；现有 electron-ipc/ai-retry 测试回归。

### 风险
- 零。纯测试 + 注释。

---

## 明确不做（本轮排除）

| 项 | 原因 |
|---|---|
| H4 模块化拆分（单文件→外部 JS/CSS） | 架构级工程，与"解决已列问题"不同量级；单文件是产品主动选择（PWA 单文件可移植） |
| 产品建议 #2 任务谱系可视化 | 联动触发数据量普遍小（多数用户 <10 条链），可视化价值密度低——待时间机器验证"历史可视化"接受度后再评估 |
| G4 中 `wb_conversations` 的 500 上限裁剪 | 已有长期记忆 500 上限模式，对话数据用户可能要完整历史——加裁剪有数据丢失争议，暂不动（写进评估记录） |
| 浏览器多标签同时打开的存储互踩 | localStorage 无跨 tab 锁，需要 BroadcastChannel 架构——超出"问题修复"范畴，记录为已知限制 |

---

## 实施顺序与依赖

```
批次七（零风险收尾） ──┐
批次一（G4 损坏防护）  ├─ 可并行，互不依赖
批次三（G5 旁路写）  ──┘
        ↓
批次二（G3 三代备份）——依赖批次一的 _brokenBackup 判定（恢复前校验复用）
        ↓
批次四（用量仪表）——独立，随时可做
        ↓
批次五（时间机器）——独立
        ↓
批次六（RAG 注入）——最后做（动 AI 主链路，放最后降低连环风险）
```

每批次独立 commit + 测试绿后才推下一个。
