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
| R8 | **开工先看 diff 归属，提交前才抽回源码态**：开工第一件事是 `git status`，判据是**diff 归属**而不是 HTML 形态——链在跑时树天然呈注入态，若写成"开工时 HTML 不得是注入态"，每次开工都误报，几次之后就没人看了。① **`src/` 有非本人 diff ⇒ 有在飞会话，此时绝不 `--extract`**（会用 HTML 旧内容整体覆盖对方在飞编辑；2026-10-15/16 两个会话各踩过一侧：先改 `src/` 再跑 extract = 白改一轮）；② **`src/` 零 diff 而 HTML 是注入态 ⇒ 只是形态遗留**（2026-10-16 08:53 实测：链已停、板已释放、无在飞 run，树却留着 3.87MB —— 这个时间窗原先没人检查），可安全抽回。要提交时：`node scripts/pet-art.mjs --extract && node scripts/src-split.mjs --extract --no-backup`，再用 `node scripts/check-source-state.mjs` 复核到 ≈635KB 源码态才 add。git 里存的是**源码态**，把 3.87MB 拼回态提交进 git = 污染仓库 | 双态纪律（`docs/architecture-layers.md`）+ agent-board 2026-10-16 09:17 通告、19:00 措辞修订 |
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
| 3.7.130 | WorkBuddy 主会话 | ✅ 已发（2026-10-16，`abe7fde`；R-26 检索等有界回填 + 台账 R-24/R-25 收口） |
| 3.7.131 | WorkBuddy 主会话 | ✅ 已发（2026-10-16，`3a22a5e` + tag `fee0169`；线上已核 `v3.7.131-20261016192153`） |
| 3.7.132 | WorkBuddy 主会话 | ✅ **已发（2026-10-17，`b2e51d9` + tag `v3.7.132`；CI 3/3 全绿；线上已核 `v3.7.132-20261017050213`）** —— 原登记行的攒批清单见 CHANGELOG v3.7.132 |
| 3.7.133 | WorkBuddy 主会话 | ✅ **已发（2026-10-19，`a24ff13` + tag `v3.7.133`；CI 4/4 全绿 + Electron 产物 ✓；线上已核 `VERSION=3.7.133` / `BUILD_TAG=20261019a` / SW `v3.7.133-20261019102500`）** —— 三态走查批次。① 机械化预检 `tests/three-state-render.test.js`（15 视图 × 非空/无 garbage、空态可见、体量与极端长度）；② **元素级溢出** e2e `tests/e2e/three-state-layout.spec.js`（3 视口 × 3 数据态 × 15 视图 = 135 次真实浏览器渲染，自带反向自检）；③ 本批实测修掉两处"空态看不见"（任务页看板整块空时无空态、`renderEmpty("no-today")` 未登记 ⇒ 静默返回空串）+ 空态「+ 新建任务」在任务页系死按钮；④ **OD-004 已关闭**（用户裁乙）：`doClear()` 真正清空、不再重新播种示例（清空后写 `tasks=[]`/`init`/`onboarded`），守护 `clear-no-reseed` 3 例含反向对照，空态至此 UI 可达；⑤ **用户走查当场抓到的布局缺陷已修并固化**：待办栏与卡片宽度不一致（1024–1439 档内边距 28 vs 16 → 差 12px；宽屏+侧栏折叠时少了 `--content-max` 上限 → 差 91.5px），守护 `three-state-layout` 12 宽度档 + 折叠态对齐 ≤1px；⑥ 走查第 2/3 轮反馈：尾栏只留版本号、空态图标用对语义、输入区去厚重、任务页卡片补 tags、属性行折行参差与时间轴图例 `margin-left:auto` 推右（断点用既有 1023，1099 被 §8.1 拦过一次）。e2e 共 18 例均带反向对照。**发版门槛由用户 2026-10-19「发版吧」放行** |
| **3.7.134** | Qoder 主会话 | ✅ **已发（2026-10-20，`ab65144` + tag `v3.7.134`（`66d6fe3`）；CI 四腿全绿 + Deploy success + e2e 127 passed；线上已核 `CACHE_VERSION = v3.7.134-20261020111023`）** —— P0 死入口清零 + P1 四片（三区导航 / 首页待办上移 / 工具箱降 Labs / 主题入口收敛）+ 六层浮层键盘可达 + i18n 属性键门禁；含 10-20 凌晨已入库的 R-6 断点守卫 |
| **3.7.135** | Qoder 主会话 | ✅ **已发（2026-10-21，`0f8d1c2` + tag `v3.7.135`；CI 四腿 + Electron 产物全 success、Deploy success、e2e 135 passed（1 条已知 `i18n:79` 饥饿型 flake，重试即过）；线上已核 `VERSION=3.7.135` / `BUILD_TAG=20261020b` / SW `v3.7.135-20261020175942`）** —— 攒的是 `CHANGELOG.md` 的 `[3.7.135]` 四片： ① 可读性与触控下限（`--fs-2xs` 11→12px ×6 主题块；窄屏顶栏高度 ≥40 / 触屏 ≥44；新门禁 `tests/ui-scale-floor.test.js`； 宽度抬到 40px 实测造成 375px 视口 103px 横向溢出，**已撤销**，「窄屏顶栏溢出菜单」登记为独立设计项）； ② **P1 缺陷实修 + `dangerConfirm()` 组件**（台账 R-29：AI「危险操作确认」用 `.recycle-modal` 静态卡片， 375×667 下按钮被固定底部导航压住、手机上点不到；旧 jsdom 测只断言"元素存在"故恒绿）； ③ 原生 `confirm()` 迁移第一批 39→35 + 真实路径覆盖（`tests/confirm-migration-batch1.test.js`）； ④ 本机全量判定器两头判错修复（台账 R-30：抖动的 Rejection 形状被漏认 ⇒ 真绿判红；文件没报结果看不见 ⇒ 假绿）。 已入库 `47c96cf` / `ebf9173` / `7fc5105` / `dd3b598`，前三笔 CI 均四腿 success、e2e 136 passed / 0 flaky、线上已核。 |
| **3.7.136** | Qoder 主会话 | ✅ **已发（2026-10-22，`91d64c0` + tag `v3.7.136`；CI 四腿 + Electron + Deploy success、e2e 150 passed / 0 flaky；线上已核 `VERSION=3.7.136` / `BUILD_TAG=20261021a` / SW `v3.7.136-20261021224535`）** —— 两片：① **布局 v2**（对话坞默认收起 + 右栏今日任务轨 + 沉浸页隐藏；e2e 150 passed / 0 flaky，线上已核）；② **原生 confirm 迁移 35→12**（第二~五批：会话/日历/笔记/知识库、全局事件簇 8 处、备份导入簇 3 处、集成推送 2 处、ui-drawer 5 + ui-scene-bind 5），全部走 dangerConfirm + 真路径覆盖；台账 R-31（手机聊天面板不可达，先于本批存在，登记未修）。已入库 bc2f0db / 7997e22 / b5e40f5 / 20c75bf / fd9c07c / c7b42f6 / 433f5a9。 |

| **3.7.137** | Qoder 主会话 | ✅ **已发（2026-10-22，`d893fb6` + tag `v3.7.137`；CI 四腿 + Electron + Deploy 全 success、e2e 150 passed / 0 flaky；线上已核 `VERSION=3.7.137` / `BUILD_TAG=20261022a` / **原生 confirm 调用 0 处**）** —— 两片：① **原生 confirm 迁移第五、六批（22→12→0，棘轮清零）**：`src/` 里的原生 `confirm()` **至此全部迁完**（累计 39→0，共六批），新增 `confirm-migration-batch5/6.test.js` 13 例，全部走真实入口；② **R-2 空 catch 基线逐文件精确重冻**（16 处漂移噪声 → 2 处；基线 540→551，P0 78 / 无注释仍为 0）。另做 **OD-001 第三方登录选型复核**（不重查已标注"勿重查"的资质矩阵，把三条阻塞条件里能由主人一句话解除的部分摘出来，给出 A/B/C 三个可单独执行选项，条维持 OPEN）。已入库 `433f5a9` / `1a7e20e` / `e2d1c2a` / `d893fb6`。 |
| **3.7.138** | Qoder 主会话 | ✅ **已发（2026-10-23，`bbc1159` + tag `v3.7.138`；CI `39847330313` / Deploy `39847330845` / Electron `39847334109` 全 success）** —— 稳定检查点：单步通用撤销（任务/资料/笔记）、AI 改动回执撤销、.docx 零依赖导入 + 粘贴导入、绑定门禁扩到 271 控件（0 未覆盖）；另修三处 CI 红（`data-rw→ui-hotkeys` 逆层、粘贴浮层字符图标、slice10 期望漂移）。 |

| **3.7.139** | Qoder 主会话 | ✅ **已发（2026-10-23，`8bdb579` + tag `v3.7.139`；CI `39851466348` / Deploy `39851466185` / Electron `39851469817` 全 success；线上已核 `VERSION = "3.7.139"` / `BUILD_TAG = "20261022c"`，2026-10-23 14:30 带 cache-buster 实测）** —— PDF 真解析（`pdfjs-dist@3.11.174` vendor，file:// 可用）+ 知识库文件撤销（rag 域：导入/同名替换/删除）；vendor 随仓库交付、deploy/Electron 已带。 |
| **3.7.141** | Qoder 主会话 | ✅ **已发（2026-10-24，`2a5320bd` + tag `v3.7.141`；CI `40001120766` / Deploy `40001120739` / Electron `40001119857` 全 success；Pages built 19:07:35Z（本次构建 35 分钟）；线上已核 `VERSION = "3.7.141"` / `BUILD_TAG = "20261023b"`，界面五项 + MCP-LIVE 均实测）** —— **MCP 真接线**（JSON-RPC over Streamable HTTP：initialize/tools-list/tools-call、SSE 帧也解；两个插入点 = `effectiveTools` 并入 schema + `execToolAuto` 按 `mcp__服务器__工具` 路由；**默认零注入**、逐工具勾选、上限 30；`isDangerTool` 动态判定——只有服务端显式标 readOnly 的才免确认；执行前按 allow 再拒一次；连不上如实点名 CORS）+ **Mermaid 首图加载态**（线上首图 13.6s 冷加载无反馈 → 同步中间态）。**线上实测的关键约束**：MCP-LIVE 从 `https://levango7.github.io` 直连本机 127.0.0.1 服务被 Chrome 的 **Local Network Access 权限**拦下（补 `Access-Control-Allow-Private-Network: true` 也不行，headless 无法授予）⇒ https 页面连本机 MCP 不可用；`file://`（e2e）与同私网场景可用；要彻底解决走 Electron 主进程代理（下一阶段）。 |
| **3.7.140** | Qoder 主会话 | ✅ **已发（2026-10-23，`6a6ffea` + tag `v3.7.140`；CI `39914362902` —— 首跑 e2e 腿红在 `ics-import-render:82`（已登记的 CPU 饥饿型抖动），**同 SHA rerun attempt2 四腿全绿**、Deploy `39914363069` success、Electron `39914362693` success；Pages built 07:09:23Z；线上已核 `VERSION = "3.7.140"` / `BUILD_TAG = "20261023a"`，复核脚本五项全过）** —— AI 输出的可读性与运行可见性四片：Markdown 表格/引用块、聊天**真实**进度条（流式字数 / 工具批次 / 计划步数，替换掉从没接通的 `streamProgress*` 死码）、悬停回复可见触发提示词、右栏三页（今日 / Agent / 文件，MCP 仍是壳故不列）、**Mermaid 出图**（`mermaid@10.9.1` UMD vendor + 严格安全模式 + 产物二次消毒，按需加载、失败保留源码；线上首图冷加载实测 13.6s，本机 file:// 秒级）。 |

**用号流程**：发版前把号写进本表（含会话名）→ 提交 → 再跑 `release.mjs`。
两个会话同时想发 → 表上必然暴露 → 按 R7 停手。
**注释不许先跑号**：代码注释里也不得写**尚未上表**的版本号（2026-10-17 实测：`grep -rn "v3\.7\.132" src/` 命中 6 处，
而本表当时只到 3.7.131 —— 号跑在了登记前面）。要锚住"这批还没发"的内容，就写**日期或引入它的 commit**
（如 `2026-10-16/17 批次`、`9358aae`），等内容对应的号上了表再改成版本号。
理由：注释里的号一旦先跑，本表就不再是唯一真相源，后来的人照注释去找发布会找不到对应 tag。

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
| 2026-10-16 | **R8 扩写**：从"只管提交前"扩到"开工先看 `git status` 的 diff 归属"——`src/` 有非本人 diff 时绝不 extract（覆盖在飞编辑），零 diff 而 HTML 是注入态才属形态遗留可抽；判据按 WorkBuddy 19:00 通告钉在**归属**而非 HTML 形态，避免告警疲劳。本会话名下无待推版本号 | Qoder 主会话（用户批准"做吧"，措辞采纳 WorkBuddy 提议） |
| 2026-10-17 | **登记表补正 + 立"注释不许先跑号"规矩（用户指示"修正那几处注释里跑号的问题"）**：① `3.7.131` 由「已登记」改「已发」（tag `fee0169`→`3a22a5e`，线上 `v3.7.131-20261016192153` 已 curl 核）；② 用号流程新增一条：代码注释里不得写未上表的号，要锚"这批还没发"就写日期或引入它的 commit；③ **`3.7.132` 我没有代登**——WorkBuddy 11:10 板上明写该号"仍空闲"，而我先一版曾按未发版批次代登，两说相抵 ⇒ 按 R7 停手、把分歧写在表上待用户裁。**两种解法**：(甲) WorkBuddy 自登 132 ⇒ 现存 6 处注释立刻成立，本行删除；(乙) 由注释侧改锚（把 `v3.7.132：` 换成日期或 `9358aae` 这类 commit 锚，等内容真进版本时再写号）。我这边选不了：那 6 处里有 4 处在他此刻正在编辑的 `src/ui-global-events.js` / `src/core-i18n.js`（板上 11:10 占用路径已声明），动它就是 R6/R8 违规 | Qoder 主会话 |
| 2026-10-17 | **WorkBuddy 自登 3.7.132（解法甲）**：采纳 qoder 11:07 的两解法中之甲 —— 由本人（本批唯一发版方）把 132 登进上表，则 `src/` 里已有的 `v3.7.132` 注释全部成立，注释侧无需改锚。**同时承认规矩成立**：本批确实有"注释先跑号"（先写注释、后登记），此后按新规矩办（未上表的号一律写日期或 commit 锚）。qoder 原「未登记，待裁」行按他自己写的"本行删除"撤掉 | WorkBuddy 主会话 |
