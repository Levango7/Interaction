# docs/README.md · 文档索引（三级）

> **先看这张表再翻具体文档。** 30+ 份文档混着"活的契约"与"某天的快照"；按下面三级区分，
> 别把历史评估当现状，也别在历史文档里找现行规则。

## 判读规则（冲突时的优先级）

1. **`PRODUCT.md`** —— 为什么做、给谁做、不做什么（唯一裁决依据）。
2. **`DESIGN-SYSTEM.md` / `ARCHITECTURE.md`** —— 视觉与结构契约。
3. **`ui-standards.md` / `architecture-layers.md`** 等规范 —— 实现细节；与上一条冲突时以上一条为准。
4. **历史快照** —— 只供追溯"当时为什么这么定"，**不作为现状依据**；要看现状请读代码 / 跑门禁。

## 一、权威活文档（随代码更新，冲突以它们为准）

| 文档 | 说明 |
|---|---|
| [PRODUCT.md](PRODUCT.md) | 定位、用户、反目标、核心闭环、功能分层、设计原则、指标 |
| [ARCHITECTURE.md](ARCHITECTURE.md) | 分层契约、AppBridge、绑定覆盖率门禁、数据 schema |
| [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md) | 令牌、断点、布局 v2、控件尺寸、浮层、三态、确认框 |
| [ui-standards.md](ui-standards.md) | 实现细节与历史沿革（设计契约以 DESIGN-SYSTEM 为准） |

## 二、流程与台账（只追加）

| 文档 | 说明 |
|---|---|
| [agent-board.md](agent-board.md) | 并行会话占用公告板（**只追加**，最新在上；过期条目当没看见） |
| [audit-2026-10-06.md](audit-2026-10-06.md) | 审计台账（R-1…R-32，按批次续写；每条必须带实测命令+数字+分级） |
| [decisions/OPEN-DECISIONS.md](decisions/OPEN-DECISIONS.md) | 待拍板决策清单 |

## 三、规范 / 契约 / 指引（需要时查）

| 文档 | 说明 |
|---|---|
| [architecture-layers.md](architecture-layers.md) | 单文件架构分层（改结构前必读） |
| [product-scope.md](product-scope.md) | 产品边界与已移除功能清单（防"死 UI 回潮"） |
| [ai-tools.md](ai-tools.md) | AI 工具（function-calling）接口与 26 个 Schema |
| [cloud-sync-incremental-contract.md](cloud-sync-incremental-contract.md) | 云同步增量契约 |
| [oauth-login-design.md](oauth-login-design.md) | 第三方登录设计与回调契约 |
| [module-graph.md](module-graph.md) | 模块依赖图（由脚本生成，勿手改） |
| [pet-system.md](pet-system.md) | 萌宠子系统：立绘外置/回注、五官标定 |
| [verification-reliability.md](verification-reliability.md) | 验证可信度：哪些结论在什么条件下成立 |
| [integrations-verify.md](integrations-verify.md) | 集成能力的验收步骤 |
| [user-manual.md](user-manual.md) / [privacy-policy.md](privacy-policy.md) / [terms-of-service.md](terms-of-service.md) | 面向用户的说明与法务文本 |

## 四、规划与历史快照（**不再更新**，只供追溯）

| 文档 | 时间点 |
|---|---|
| [roadmap-2026Q4.md](roadmap-2026Q4.md) | 2026-10-03 编制 / 10-06 复核 |
| [iteration-plan.md](iteration-plan.md) | 2026-10-11 起 |
| [evaluation-product-2026-10-16.md](evaluation-product-2026-10-16.md) | 2026-10-16 产品评估 |
| [evaluation-agent-arch.md](evaluation-agent-arch.md) / [evaluation-conclusion.md](evaluation-conclusion.md) | Agent 架构评估快照 |
| [evaluation-test-coverage.md](evaluation-test-coverage.md) / [evaluation-multi-file-delivery.md](evaluation-multi-file-delivery.md) | 测试覆盖 / 多文件交付评估 |
| [qa-walkthrough.md](qa-walkthrough.md) | 某轮走查记录 |
| [control-matrix-audit.md](control-matrix-audit.md) / [backend-recovery-assessment.md](backend-recovery-assessment.md) | 控件矩阵 / 后端恢复评估 |
| [decoupling-plan.md](decoupling-plan.md) | 解耦计划（历史） |

> 为什么**没有**把历史文档挪进 `docs/archive/`：它们被 README 与台账交叉引用，移动会打断既有链接
> （2026-10-22 决策）。用这张索引做同一件事：**分级 + 判读规则**，零链接破坏。
