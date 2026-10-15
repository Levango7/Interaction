# AGENTS.md —— 多会话协作守则（唯一入口）

> **谁读这个**：任何在这个仓库干活的 AI 会话（以及人）。**开工第一件事读本文件，
> 动手前到 `docs/agent-board.md` 声明占用，收工销账。** OpenAI Codex 等编码 agent
> 会自动读仓库根的 `AGENTS.md`——这就是留言板的门牌。
>
> **层级**：不设 agent 指挥层级。**用户（Levango7 / 天问）是唯一最高裁决**；agent
> 之间平等，靠「规矩 + 声明 + 升级」防冲突，不靠职级。
>
> **分工**（一版一事，防漂移）：
> - 本文件：常驻规矩 + **版本号预登记**（防撞号）
> - `docs/agent-board.md`：实时条目流（占用声明/释放，**只追加**）
> - 技术账不记在这里：CHANGELOG / `docs/audit-*.md` / `docs/decisions/OPEN-DECISIONS.md`
>
> **建册背景**：2026-10-14~15 的真实冲突与事故——v3.7.124 撞号、CI `cancel-in-progress`
> 互杀、未跟踪文件险被 `git add -A` 吞掉、**共享树 `node_modules/` 被清空连带
> `_probe/*` junction 全废**。规矩原来散落在 commit message 与各会话私有记忆里靠
> 考古拼凑，现在显式化。

## 一、硬规矩（违反 = 返工；出处是真实事故，不是理论）

| # | 规矩 | 出处 |
|---|------|------|
| R1 | **排队期不 push**：CI 队列 >10 分钟未开跑时不推送（托管 runner 积压 + `cancel-in-progress` 会取消并行会话正在等的验证）。push 前先 `gh run list --limit 5` | `48fda29`（2026-10-14 run 互杀实测） |
| R2 | **发版三查**：`git fetch && git log --oneline -1 origin/main` + `head -3 CHANGELOG.md` + 本文「三、版本号预登记表」→ 都对上才跑 `release.mjs` | v3.7.124 撞号（2026-10-14） |
| R3 | **`git add` 只用显式路径**，永不 `-A`/`.`——并行会话在建的未跟踪文件会被你吞进提交 | 2026-10-14 `scripts/lint-server-*.mjs` 险情 |
| R4 | **动高共写面之前，先到 agent-board 声明一行**：`CHANGELOG.md`（顶部 `[Unreleased]` 两边都会写）、`.github/workflows/*`（被 `tests/ci-workflow-guard.test.js` 钉住，**改 workflow = 改断言，必须同提交**）、`package-lock.json`/`electron/package.json` 依赖段、`node_modules/` | `docs/agent-board.md` 铁律 5 |
| R5 | **⚠️ 别在共享树上跑 `npm ci`**——中断的 `npm ci` 会把整棵 `node_modules/` 清成空目录，`_probe/*` 验证副本的 junction 全废（**2026-10-15 实际发生**）。要装依赖/跑全量验证，自建净副本：`git archive HEAD \| tar -x -C _probe/<你的副本> && cd _probe/<你的副本> && npm ci`。同理：`post*` 钩子的 `--extract` 会改 `agent-workbench.html`，在共享树上可能**静默销毁别人的 src 编辑** | `docs/agent-board.md` 铁律 6 |
| R6 | **不碰别人的东西**：他人占用的文件（看 agent-board 最新条目）、`_probe/iso*` 净副本、本地 ref `r21-cancel-probe`（R-21 探针 YAML 存档，远端已删，`git show` 可取回）、工作区里归属不明的未跟踪文件（主人自认前谁都别动） | agent-board 2026-10-15 条目 |
| R7 | **撞车/分歧 → 停手**：agent-board 追加「冲突说明」，等用户裁决。不许抢先推；`--force` 绝对禁止 | v3.7.124 处置过程 |
| R8 | **提交前抽回源码态**：`node scripts/pet-art.mjs --extract && node scripts/src-split.mjs --extract --no-backup`，确认 `agent-workbench.html` ≈ 635KB 再 add。git 里存的是**源码态**，把 3.87MB 拼回态提交进 git = 污染仓库 | 双态纪律（`docs/architecture-layers.md`） |
| R9 | **判据以 CI 为准**：本机全绿不能证明 CI 形态已修（teardown 竞态本机复现不出）；本机 worker 噪声（少数文件未完成 + Unhandled 但 0 FAIL）不阻塞发版 | `docs/iteration-plan.md`「已知 CI 形态」 |
| R10 | **push 前在 agent-board 声明一行**（照最新条目的样子），紧急时刻用板内列出的实时喊话通道：① 我即将 push；② 我即将动你正在改的文件 | agent-board 2026-10-15 11:48 立的先例 |
| R11 | **发版 commit 之后，禁止立刻 push 无关提交**（如板条目、文档收尾）——后一条 push 会用 `cancel-in-progress` 取消发版 commit 自己的验证 run，绿判只能落在后一条上（2026-10-15 实测：`c865fb0` 的两条 run 被我自己的 `2d1d407` 取消）。正确顺序：发版 commit 推 → **等它的 run 出终态** → 再推板条目等收尾 | agent-board 2026-10-15 17:55 事实通告 |

## 二、版本号预登记表（防撞号——登记了才算数）

| 版本 | 会话 | 状态 |
|------|------|------|
| 3.7.126 | WorkBuddy 主会话 | ✅ 已发（2026-10-15，`7f3b1b4`，线上已核） |
| 3.7.124 | qoder 账本会话 | ✅ 已发（2026-10-14；tag 曾漏推，已由 v3.7.126 发版顺带补上） |
| 3.7.127 | WorkBuddy 主会话 | ✅ 已发（2026-10-15，`c865fb0`，线上已核） |
| 3.7.128 | WorkBuddy 主会话 | ✅ 已发（2026-10-16，`5b2eed0`；CI 排队较久） |
| 3.7.129 | WorkBuddy 主会话 | ✅ 已发（2026-10-16，`e148f71`；CI 排队较久） |
| **3.7.130** | WorkBuddy 主会话 | 🔄 已登记（2026-10-16；R-26 检索不等有界回填 → 消除 rag-hybrid/workflow 首跑红） |

**用号流程**：发版前把号写进本表（含会话名）→ 提交 → 再跑 `release.mjs`。
两个会话同时想发 → 表上必然暴露 → 按 R7 停手。

## 三、实时喊话与条目流

- **条目流**：`docs/agent-board.md`（只追加，最新在上；格式照板内模板）。
- **紧急喊话**（仅两种时刻）：Qoder 会话间用内置 `send_message_to_chat_session`；
  OpenCode 侧 `opencode run -s <ses_id> "<事实通告>"`。其余一律写板。
- **销账**：条目流收工追加「释放」；本表版本号完成标 ✅。板条目 24h 未更新视为
  `[stale?]`，再 24h 无人认领可清。

## 四、分歧升级路径

```
会话间分歧（文件占用 / 版本号 / 方向）
  → 停手，agent-board 追加「冲突说明」
  → 等用户裁决（用户是唯一最高层）
  → 裁决结果写回（可升格为 ADR / 本文件新规矩）
```

---
*建册：2026-10-15，WorkBuddy 主会话。与 `docs/agent-board.md`（qoder 账本会话同期建）
合并定位：本文件 = 宪法 + 预登记；agent-board = 条目流。修订在下方追加。*

| 日期 | 修订 | 会话 |
|------|------|------|
| 2026-10-15 | 建册（R1-R8 + 登记表 + 预登记 + 销账 + 升级路径） | WorkBuddy 主会话 |
| 2026-10-15 | 与 `docs/agent-board.md` 合并定位：吸收 npm ci 禁令/净副本/高共写面/喊话通道（R4-R6、R10），登记职责归 agent-board 条目流，本文件留版本预登记 | WorkBuddy 主会话 |
