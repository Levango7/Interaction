# ARCHITECTURE.md · 分层契约与工程边界（活文档）

> 状态：**活文档（2026-10-20 起）**。与 `docs/architecture-layers.md`（现状描述）、
> `docs/module-graph.md`（自动生成的依赖图）、`docs/decoupling-plan.md`（解耦排期）分工：
> 本文件写**必须守住的契约**，那几份写**现在是什么样、怎么一步步改过去**。
> 契约与实现冲突时，以本文件为目标态，在台账里记差距，不许把差距写成契约。

## 1. 层与依赖方向

| 层 | 职责 | 允许依赖 |
|---|---|---|
| **Core**（core / core-shared / core-i18n / core-commands） | 状态、契约、i18n、命令注册表 | **零出边**（不得依赖 Data/Render/UI/AI） |
| **Data**（data-rw / data-idb / data-links / data-migrate） | 持久化、迁移、键空间、同步载荷 | Core |
| **AI**（ai-tools / ai-loop / ai-retry） | 工具调用、对话循环、重试 | Core、Data |
| **Render**（render-*） | 生成 HTML 字符串（**不写存储、不发请求**） | Core、Data（只读）、AI（只读接口） |
| **UI**（ui-*） | 事件绑定、视图切换、跨层编排 | 全部，但只能通过 `AppBridge` 触碰 Core/Data/AI |
| **Bootstrap**（HTML 内联） | PREFIX / 存储壳 / 启动 | 不新增业务逻辑；新逻辑一律进 src 块 |

**硬约束**
1. Core 出边必须为 0；需要读数据时由调用方（UI）传入，或经 `AppBridge` 注入。
2. UI 不得直接 `localStorage` / IndexedDB；一律走 Data 层函数（键空间见 §4）。
3. Render 不得读取全局可变状态做副作用；需要数据由入口函数显式传入。
4. `AppBridge` 是唯一的跨层门面：新增跨层能力必须先在桥里登记，禁止"隐式全局函数"。
5. 依赖图门禁只拦**新增**跨层边（棘轮）；目标是把现有基线逐条降到 0，不是维持现状。

## 2. 模块与构建

- **唯一权威**：`scripts/src-split.mjs` 的 `BLOCKS` 清单 + `src/order.json` 的层序；两者不一致即构建失败。
- 新增一个源码块的三步（缺一即"静默忽略"）：① 建 `src/<name>.js`；② 进 `BLOCKS`；③ 进 `order.json` 对应层。
- 双态纪律：git 存**源码态**（≈630KB）；注入态（≈3.9MB）只存在于构建/运行期，由 `with-injected.mjs` 保证任何退出路径都抽回。
- 不允许直接改 `agent-workbench.html` 里的空块区（会被下次注入覆盖）；静态结构与样式可以改，脚本一律改 `src/`。
- 构建链门禁：`check-source-state`（体积/标记/base64）、`src:check`（逐块比对）、块清单双向一致性。

## 3. 视图与事件接线（治"死按钮"的根）

现状的"渲染正常、点击无反应"全部来自**渲染与绑定分离且没有配对校验**。目标态：

1. **视图注册表**：每个可交互视图声明 `{ id, render(), bind(ctx) }`；入口只按注册表调度。
2. **动作标记**：渲染出的交互元素一律带 `data-action="<name>"`；绑定层按注册表消费。
3. **绑定覆盖率门禁（已落地，2026-10-22）**：`tests/binding-coverage.test.js` 对 15 个视图做
   "渲染 → 收集 `#main` 控件 → 按五种合法绑定形态判定"（自身 `on*` / 自身 listener / ≤3 层祖先委托 /
   表单 submit / 已登记的委托动作属性），**未覆盖数必须为 0**，且自带射程自检（无绑定样本必须判红）。
   当前实测 **271 个控件（196 按钮 + 75 表单控件）、0 未覆盖**；判定已覆盖 `[role=button] / select / checkbox / radio / textarea`，
并含「表单内控件随 submit 生效」规则；委托动作注册表另有"每个属性必须有可证明的消费方"断言。
   仍未做的目标态：① 视图注册表；② 全量 `data-action` 标记；④ 渲染层禁写 `onclick`。
   ⚠️ 口径边界：只证明"有处理器"，不证明"点了有反应"（后者仍需 e2e）。
4. 禁止在 `render*` 里写 `onclick=...`；事件绑定只能出现在 `bind`/`ui-*`。

## 4. 数据契约

- **键空间**：所有键必须带 `PREFIX`（`wb_agent_`）；禁止新增裸 `wb_*` 旁路键；动态族（`rec_/chat_/tool_/ai_config_`）需在键注册表登记。
- **schema 版本**：引入 `dataSchemaVersion`；每次结构变更写一条**单向迁移**（N→N+1），迁移前自动快照。
- **迁移可逆性**：`_broken_*` 只保留一份；迁移日志上限 50 条；任何"可能删数据"的迁移必须带 dry-run 与回滚点。
- **备份**：整库自动备份不得超过 localStorage 配额的 50%；超过即降级到 IDB + 压缩；单代大小与总大小都要校验。
- **同步**：客户端与服务端共享 `docs/cloud-sync-incremental-contract.md`；冲突策略默认 `mv`；凭据与备份键双向排除。
- **导入**：必须校验 `version` + 关键键类型；导入前先做结构与体积预检，再写库。

## 5. 安全边界

- 出网 IPC（Electron）：统一拒私网 + `redirect: error`；新增出网点必须复用同一守卫并加测试。
- 服务端：JWT + refresh；CORS 默认收紧；口令与令牌不落日志；同步接口按用户隔离。
- 前端：所有用户内容进 DOM 前 `esc()`/`sanitizeHtml()`；`innerHTML` 只允许拼接已转义字符串。
- 凭据：只存内存或加密存储；禁止进入云快照/备份/日志（现有排除清单继续由测试钉住）。

## 6. 交付与版本

- **版本单一真相源**：`AGENTS.md §二` + `package.json` + `manifest.json` + HTML `VERSION` + SW `CACHE_VERSION`；
  发布脚本统一 bump 并自检，禁止手改单处。
- **发布顺序**：合入 → 全绿 → 打 tag → 部署 → 线上核验（`CACHE_VERSION` 实拉）。
- **回滚**：任一版本可用"tag 重建部署"回滚；gh-pages 历史是线上账本，不 force-push。
- **发布后纪律**：发版 commit 的 run 出终态前不推无关提交（`AGENTS.md` R11）。

## 7. 已知偏差（目标态 vs 现状）

| 偏差 | 现状 | 收敛路径 |
|---|---|---|
| Core 出边 | `core-shared → data-rw`（getActiveTasks） | 下移或经桥注入；门禁覆盖全部 Core 块 |
| 上帝块 | `ui-ge-integrations`（依赖 32 块）、`ui-global-events`（25 块） | 按 scene / integration / assistant 三簇拆 |
| Bootstrap 内联 | ~564 行不进 src 拆分 | 分批迁入 `src/bootstrap.js` |
| 键空间 | **注册表已建**（v3.7.148：75 字面量 + 4 动态族 + 18 裸键 = 97 条，带 kind/sync/backup；门禁守「新键必须登记」）；**但消费方还没切**：`SYNC_EXCLUDED_KEYS` 仍是手写负名单 | 把同步/备份排除改成从注册表派生，并证明派生集 ⊇ 旧集合 |
| 迁移 | **已落地 `schemaVersion`（v3.7.148，`SCHEMA_VERSION=1`）**：成功才推进 / 更高版本只读告警 / 失败不推进；键注册表仍未建 | 键注册表（与上一行合并收口） |
| 视图接线 | 无配对校验 | §3 覆盖率门禁 |

每一行在 `docs/audit-2026-10-06.md` 有对应实测条目；改完一行，把台账对应项标闭环。
