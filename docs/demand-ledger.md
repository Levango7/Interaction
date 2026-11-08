# demand-ledger.md · 需求与决策台账（唯一状态源）

> **状态**：活文档（2026-11-07 建立）。**本文件是「还有哪些事、谁在做、卡在哪、怎么算做完」的唯一状态源**。
> `docs/README.md` 归在「流程与台账」节；与 `PRODUCT.md`（要不要做）、`ARCHITECTURE.md` / `DESIGN-SYSTEM.md` /
> `three-mode-spec.md`（怎么做）分工：**本文件只记状态，不裁决方向**。
> 历史快照（`roadmap-2026Q4.md` / `iteration-plan.md` / `evaluation-*` / `半成品功能完善路线图.md`）
> **不再更新、不作现状依据**；它们的待办已迁入本表，原文只作来源链接（`docs/README.md:58-59` 零链接破坏决策）。

## 规范

| 项 | 规则 |
|---|---|
| 编号 | `DL-001…` 连续，只增不改；**别名列**保留旧号（`#110` / `R-40` / `B9` / `OD-001` / `Q3`），不重编号、不搬家 |
| 关单 | 只追加 + 就地关闭；`DONE` 必须写 **commit**（有 CI 回执更好），`CUT` 必须写**裁定人 + 日期**。**三档口径（2026-11-08 裁，依据 `_probe/wb-window-2026-11-08/receipts.md`）**：① 单提交事项写单个 hash；② 聚合阶段条目写 **commit 链**（≥2，逐个须在 `origin/main` 祖先链上）或「代表 commit + 批次说明」；③ 裁定 / 发布 / 真机验收类写「**记录落盘 commit + 验收文档出处**」，不强制功能代码 commit。**一律禁止凭印象代填**——`0009b8d` 与 `3fb849a` 同 subject 却不在 main 祖先链，即反例 |
| 状态枚举 | `OPEN`（可开工）/ `DOING`（带板面 ACTIVE 行）/ `DONE` / `BLOCKED`（外部硬条件，必写「谁能解」）/ `USER-ACTION`（工程已交付，只剩用户去点几下）/ `CUT`（已裁不做）/ `STALE`（超 30 天未复核）/ `OVERTURNED`（被代码事实推翻，不是建议）/ `ORPHAN`（原会话已离线、改动未提交未验证，只做只读保护，不认领源码） |
| 判据 | 每条必须有**可测判据**；写不出的先去补取证，不进表 |
| 复核度 | `已核` = 本轮读源码 / 门禁亲验；`仅据文档` = 只按出处记载，未亲验代码 |
| 事实源 | **状态以 `git log` / CI 结论为准**，不往 `docs/agent-board.md` 写结论（板面只记意图与占用） |
| 同步 | 谁改代码谁在收工提交里顺手关单（与 R3 显式路径同提交） |
| 门禁 | **不给台账装 CI 判定器**（#109 已实测仓内无工具解析 CHANGELOG，装了只会复刻 v3.7.155 双红）；季度用**只读脚本**出报告，不自动改文件 |
| 别名与外链 | 旧编号原样留在历史条目里（吸取 #109「改名不是搬家」）；本表用别名交叉引用 |

**季度只读复核脚本应报出**：① `DONE` 但无 commit；② `OPEN` / `DOING` 超 30 天未更新「最后复核」；
③ `BLOCKED` 缺「谁能解」；④ `USER-ACTION` 挂超 60 天（该催或该裁 `CUT`）；⑤ 别名指向已删除文件。
**只报不改**。

---

## A · DONE（已结案，可直接抄状态）

| ID | 事项 | 来源 / 回执 | 归属 | 判据 | 别名 | 复核度 |
|---|---|---|---|---|---|---|
| DL-D01 | 三模式基建 + 显式三态菜单 + Code「主客颠倒」修复 | 板面 11-02 23:57 `c3f3621`；v3.7.153 | 三模式 | `applyUIMode` / `#uiModeMenu` 在位；`ui-mode.test.js` 绿 | — | 已核 |
| DL-D02 | Design 模式 / 画布 Phase A + B（①–④）+ Phase C1/C3 | `design-mode-phase-b.md:3,144-176`；链 `6c43be9`(A①②) / `7ab3bc3`(A③④) / `ead6be6`(B MVP) / `fcd0912`+`b9aefc6`(B④) / `f5769e4`(B16) / `43738be`(C1) / `00c92d1`(C3)；v3.7.152/153/154 | Design | 四件套交互 + 定案常量 `DIAGRAM_MAX` 等 | Phase A/B/C | 已核 |
| DL-D03 | 768–1023 档 Design 画布塌陷 → 方案乙实修 | `iteration-plan.md:453-469`；`9f89e80`；v3.7.154 | Design | `svgH 0→792`、`draw-responsive.spec.js` ⑤ | #110 | 已核 |
| DL-D04 | CHANGELOG 第二个 `## [Unreleased]` 去重 | 板面 11-05 00:50 `5849db7` | 全局 | `grep -c '^## \[Unreleased\]'` = 1；存档段 64 条未动 | #109 | 已核 |
| DL-D05 | Phase B §九 Q1–Q4 定案（D3） | `design-mode-phase-b.md:144-176`；`94e9e8c`（D3 定案，stat 含该文档）+ `5b0ac01`（Q1–Q4 审核裁定）+ `00c92d1`（Q1 结案）。注意别与 `2596e23`（改的是 Phase A §十）混淆 | Design | 四条均带代码行号判据 | D3 | 已核 |
| DL-D06 | Phase A §十 Q1–Q4 定案（E4 补做） | `CHANGELOG.md [Unreleased]` E4；`2596e23` | Design | Q1–Q4 有结论；Q3 如实留「待真机」 | #117 / E4 | 已核 |
| DL-D07 | 云同步客户端设置入口（`apiBase` + `syncIncremental`） | `iteration-plan.md:378-388`；`079135a` / `496607f` | 全局 | `sync-settings-entry` 7/7、`sync-incremental-gate` 3/3 | 待拍板② | 已核 |
| DL-D08 | CSP `connect-src` 放行本地后端（条目作废） | `iteration-plan.md:374-377`；`b6bbc47` | 全局 | CSP 含 `127.0.0.1:*` / `localhost:*`；mixed content 另由主进程代理 | #16 | 仅据文档 |
| DL-D09 | 覆盖率真量 → **定案不做**（前提被证伪） | `iteration-plan.md:394-400`；`eef9692`（撤回错话 + 定案不做真量，stat 改 CHANGELOG / README / iteration-plan） | 全局 | 两条独立障碍已实测记录；README 归因已改正 | 待拍板⑥ | 已核 |
| DL-D10 | 空 catch 基线全仓对齐（604→631） | `iteration-plan.md:342-349`；`424f974` | 全局 | 新增 46→0 / 消失 19→0 / P0 前后 23 | B11① | 已核 |
| DL-D11 | R-40 幽灵命中 / R-41 静默 null | `iteration-plan.md:292-311`；`303ed49`（R-40 真修 + R-41 补痕，stat 含 `src/ai-tools.js` 与 `tests/rag-orphan-vectors.test.js`） | 全局 | 单测 + 6 条窄变异；**真浏览器 e2e 仍缺 → DL-O12** | B9 / R-40 / R-41 | 仅据文档 |
| DL-D12 | B6 MCP 幂等重试 + 延迟读数（含统计页） | `iteration-plan.md:183-206,226-232`；`eb8bfab`（重试只给幂等腿，tools/call 一次都不重放）/ `c4343bb`（延迟读数上统计页，B8-b 那半）/ `9dcc93e`（手册 §5.5） | 全局 | 假 MCP 服务器计请求次数；写腿恰好 1 次 | B6 / B8-b | 已核 |
| DL-D13 | B8-a / B12 空 catch 余片 | `iteration-plan.md:354-364`；`b2cad1e`（B12 第五片：P0 26→24）/ `3fb849a`（B8-a 第二片）/ `06e3963`（reject 类 5→4）。**`0009b8d` 同 subject 但不在 main 祖先链（rebase 前副本），不得引用** | 全局 | 全仓 P0 26→24；`ui-drawer:640` 理由订正 | B8-a / B12 | 仅据文档 |
| DL-D14 | R13 三面判据 + E3 认领门进 CI + D1×E3 订正 | `CHANGELOG [Unreleased]`；`3b70f50` / `00a94e1` / `0679171` | 全局 | 登记行生而 `RELEASED`；`fetch-depth:0` 修浅历史误红 | R13 / E3 / D1 | 已核 |
| DL-D15 | `v3.7.155` 已发布（CI / Deploy / Electron / Pages / 线上逐字节实核） | `AGENTS.md §二` 首行；`32d5601`（chore(release) 八版本源 bump）+ `86227d9`（收工回执，表行翻 ✅）+ `27d61fe` / `0679171`（双红事故订正） | 全局 | 表行含各 run 号与 sha256 回执 | — | 已核 |
| DL-D16 | 微信演示态诚实化 / 清空全部数据真清空 / 恢复前快照回滚入口 | `OPEN-DECISIONS.md:12,16,18`；`7f3b1b4`(OD-002 演示态诚实呈现) / `9ca2058`(OD-004 真清空) / `466816c`(OD-003 回滚入口可消费) / `b6f6c6a`(OD-004 销账) | 全局 | OD-002 / OD-004 / OD-003 各有守护用例 | OD-002/003/004 | 已核 |
| DL-D17 | GitHub OAuth（2026-10-19）、Linear（2026-10-11）真机验收 | `roadmap-2026Q4.md:85,127`；`21aa46e`（GitHub 四件套验收记录）+ `fcbb17b`（板面收工条）；Linear 侧 `3900179`（验收抓到的必现 bug 修复）+ `f798958`（验收一条命令脚本）——**验收动作在真机，修复 commit ≠ 验收回执** | 全局 | 两份验收四件套 / 建真 issue 记录 | roadmap ①⑤ | 仅据文档（**别重跑**） |
| DL-D18 | WebDAV 协议层 + 桌面 UI 8 步中 7 步 | `roadmap-2026Q4.md:128`；`f798958`（v3.7.87 WebDAV 载体，协议层）+ `0dd11c3`（B7：roadmap / webdav-verify 按现测改写，「UI 7/8」在此落盘）+ `2dc2073`（坚果云真机抓到的第二个 bug） | 全局 | 协议 11/11；UI 7/8，剩 1 步 → DL-O02 | roadmap ⑥ | 仅据文档 |

## B · OPEN（工程侧无硬阻塞，可开工）

| ID | 事项 | 来源 | 归属 | 判据（可测） | 别名 | 复核度 |
|---|---|---|---|---|---|---|
| DL-O01 | 云同步**真后端联调 + 增量上传真机验证** | `iteration-plan.md:387-388` | 全局 | 起后端真上传成功且 `/api/sync/changes` 收到增量；区分「开关切了路径」与「真上传成功」 | 待拍板②尾 | 仅据文档 |
| DL-O02 | WebDAV 桌面 UI 剩「改一条任务再上传」一步 | `roadmap-2026Q4.md:114,128` | 全局 | 探针定位任务行选择器后该步 PASS | roadmap ⑥ | 仅据文档 |
| DL-O03 | PNG 导出**成功支**无自动化断言 | `CHANGELOG` E4 附带发现①；`draw-export.test.js:109` | Design | 真浏览器成功导出并断言 blob 尺寸 / 类型 | E4-Q1 | 已核 |
| DL-O04 | Electron 下载真机验收（Phase A Q3，账未平） | `CHANGELOG` E4 Q3 段；`draw-capability-phase-a.md §十` | Design | **两条断言**：`will-download` 触发 **且** `will-navigate` 未触发 | E4-Q3 | 已核 |
| DL-O05 | `tests/draw-svg-tool.test.js:5` 头注释与实现相反（说落账 `kind:"svg"`） | `CHANGELOG` E4「顺手登记」 | Design | 注释改到与用例一致；**该文件属 ZCode，需授权后单开一笔** | E4 附带③ | 已核 |
| DL-O06（`DONE` 11-08） | 工具数四处口径打架：`product-scope.md:26-27` 26/7、`README.md` 29/8、手册 26+7、`ai-tools.md:5` 头注仍 `VERSION="3.7.12"` / 最后核对 2026-09-21 | 源码实测 `src/ai-tools.js:303-382` = **29** | 全局 | 四处统一到源码口径；agent 子族按分发边界重数，不抄任一旧数。**11-08 复核四处实测**：`README.md:55` 29 / `user-manual.md:103,277` 29+8 / `product-scope.md:26` 29 / `ai-tools.md:5,17` 29（`3.7.155` / 2026-11-07） | — | **已核（源码计数）** |
| DL-O07（`DONE` 11-08） | `PRODUCT.md` 三区定位过期（重写稿已备 `PRODUCT.rewrite.md`） | `PRODUCT.md:10,51-69` | 全局 | 新稿落盘 + README 索引跟随 + 附录 C 联动清单逐项签收。**`8e68530` 已落盘**（PRODUCT.md 244 行改动 + `README.md` 判读规则第 2 条补 `three-mode-spec`） | — | **已核** |
| DL-O08（`DONE` 11-08） | `OPEN-DECISIONS.md:7` 汇总「1 未决 / 3 已决」与 `:11` OD-001 `RESOLVED`、`:78`「维持 OPEN」自相矛盾 | `docs/decisions/OPEN-DECISIONS.md` | 全局 | 汇总改为 0 未决 / 4 已决（或如实列出仍开项），10-22 复核段标为历史。**`8e68530` 已改「0 未决 / 4 已决」**，11-08 复核 `:7` 实测一致 | OD-001 | **已核** |
| DL-O09（`DONE` 11-08） | `DESIGN-SYSTEM.md §2.1` 定位依据引用旧闭环「捕获→AI 落手→复核」 | `DESIGN-SYSTEM.md:27-29` | 全局 | 随 PRODUCT 重写同步措辞，**不改断点值**。**`8e68530` 已改**为「捕获 → 委派与执行 → 复核」并补三模式契约引用，断点允许集未动；**上一批漏关，本批就地关闭**（随 `acd673e` 提交） | — | **已核** |
| DL-O10 | 空 catch 数字三处打架：`roadmap:110` P0 118 处、`iteration-plan:266` 余 49 处 / 21 文件、`empty-catch-p0-triage.md` 记「真待修 0」 | 三份出处 | 全局 | 快照加抬头 + 台账注明「P0 是上界不是待办，引分诊表」 | R-2 | **已核（文档）** |
| DL-O11 | B11 第二条判据试点「下层已报失败、调用方不接返回值」，**已拍板做、只做 data-links 两处** | `iteration-plan.md:350-352,416-424` | 全局 | 查是否有交付 commit / 用例；未见则保持 OPEN | B11② | 仅据文档 |
| DL-O12 | B9 缺的真浏览器 e2e（R-40 孤儿向量） | `iteration-plan.md:304-311` | 全局 | 注入必然失败样本 ⇒ 用例判红 | B9 | 仅据文档 |
| DL-O13 | B10 范围 1「e2e 失败上传工件」端到端未验（只在真红时产生工件） | `iteration-plan.md:318-322` | 全局 | 下一次 e2e 真红 run 的 artifact 列表可读 | B10① | 仅据文档 |
| DL-O14 | `rag-hybrid` 就绪闸门 30s 超时**根因未定**（可归因性已到位） | `iteration-plan.md:326-331` | 全局 | 按超时快照逐项读数归因，**不许调大超时凑绿** | #90 | 仅据文档 |
| DL-O15 | 导航 / 抽屉外观两份 CSS 副本（#110 方案乙技术债） | `iteration-plan.md:468-469` | Design | 抽共享样式块，两档视觉逐像素一致 | #110 尾 | 已核（CSS 注释） |
| DL-O16 | `E2E=1` 守卫：裸跑 `15 skipped / EXIT=0` 假绿 | `draw-responsive.spec.js`、`ui-mode-layout.spec.js` | 三模式 | 台账 / CHANGELOG 所有 e2e 回执写明 `E2E=1` | — | **已核（15 passed / 36.3s）** |
| DL-O17 | 三模式 Spec 缺口 S5 / S6（待补断言）、S7 / S8（改人工复核清单） | `three-mode-spec.md §7` | 三模式 | **S5/S6 已收口（2026-11-08，CHANGELOG `[Unreleased]` 同日节 + 提交 hash 见下）**：`tests/ui-mode.test.js` 13→17 例（14/15 断定时器生灭 + 重入必新起，16/17 断切换零业务写入），窄变异 M5（清 OS 定时器不置空标志位 → 15 红）/ M6（`_setUIMode` 夹带 `wb_agent_notes` 写入 → 16 红）均精确抓红；测前预热会话仓 / 画布文档 / `uimode` 到稳态（懒加载首启迁移与 uimode 首次落盘不算切换写入）。**S7/S8 维持 Q-D 裁决**：季度复核清单、不升门禁，仍 OPEN。占用已随本批提交释放（DL-O21 解锁） | Q-D | **已核（17 passed + 窄变异双向）** |
| DL-O18（`DONE` 11-08） | **手册与代码冲突**：`user-manual.md:159` 写「窄屏下**代码模式**与设计模式都退回单栏」，但窄屏 `setUIMode("code")` 直接拒 + toast、菜单 disabled，`toggleUIMode` 也跳过 code；同句「点一次切下一个」是旧循环口径 | `user-manual.md:152-159` vs `render-widgets.js:3898-3916` | 全局 | 手册改为「窄屏不启用代码模式（附原因）；设计模式退回单栏」，与 Spec §3/§5 逐格一致。**`8e68530` 已改**，11-08 复核 `user-manual.md:160` 实测「窄屏（<1024px）**不启用代码模式**（三栏布局需要宽屏，菜单项会置灰并给出提示）」 | — | **已核（逐句比对）** |
| DL-O19（`DONE` 11-08） | README `38 个模块 / 654.2 KB` 与 Phase B 新增 `src/draw-canvas.js` 后的基线不一致 | `README.md:7`、`design-mode-phase-b.md:74` | 全局 | 现跑 `check:modules` / `check:source-state` 取现值再改。**11-08 实测**：`check:modules` 块 **40**、`check:source-state` 40/40、HTML **687,642 B = 671.5 KB**；README 已改 38→**40**、669,894 B→**687,642 B**（3 处） | — | **已核（HTML 实测量）** |
| DL-O20（`DONE` 11-08） | **`scripts/gen-ai-tools-doc.mjs:182-183` 的版本 / 日期回写正则与 `docs/ai-tools.md` 头注格式静默失配**：脚本用 `/适用版本：`VERSION = "…"`/` 与 `/最后核对：\d{4}-\d{2}-\d{2}/`，头注却是 `**适用版本**：` / `**最后核对**：`（粗体 + 冒号位置不同）⇒ 两个 `replace` 从未命中，头注长期停在 `VERSION="3.7.12"` / 2026-09-21。**不是本次落盘引入**；本次只把数字手动更新为现值（`3.7.155` / 2026-11-07），**未改脚本** | 02:39 只读正则实测：版本 `false`、日期 `false`、工具总数 `29` 命中 | 全局 | **探针已备好补丁**（11-08）：`_probe/wb-dlo20/dlo20.patch` 仅 L182/L183 两行，沿用同文件「工具总数」已有的 `\*{0,2}` 粗体容忍写法。`_probe/wb-dlo20/report.md` **12/12 全绿**——改前复现失配、改后逐文件对比仅头注 2 行变化、M1/M2/M3 + 对照组 + `--check` 零写入 + 仓内 4 文件 sha256 未变。**`scripts/*` 在落盘白名单外 ⇒ 单独成批，不混进 13 docs 提交**；应用后跑 `--check` 并复跑探针。注意脚本日期取 UTC、头注此前写本地日，两者可差一天，属口径不是漂移。**11-08 已应用** `_probe/wb-dlo20/dlo20.patch` 于本笔 **`acd673e`**（仅 L182/L183 两行）：仓内变异取证 —— 头注改成 `3.7.12` / `2020-01-01` 后跑生成器，版本自动回 `3.7.155`（与 HEAD 同值故 diff 不显示）、日期回 `2026-11-08`；`--check` exit 0 且零写入 | — | **已核（探针 12/12 + 仓内变异）** |
| DL-O21 | **三模式文档落盘的认领占用（已解除 / `DONE`）**：曾因 ZCode 主会话 11-07 13:05 的未提交 ACTIVE 行占 `docs/three-mode-spec.md` / `docs/demand-ledger.md`，`claim-check` 判 `exit=1` 而按住不推 | **解锁提交 `091f325`**：ZCode 把该行翻 `RELEASED`、提交 S5/S6 断言，并把两份成品一并纳入 main（工作树与 HEAD sha256 逐字节一致）；本批剩余 11 份 `docs/*` 随本次提交落地 | 全局 | **已解除**：`claim-check --list` 无 ACTIVE、板面无他人未提交 diff、13 路径逐条 `✓ 可动`、HEAD == origin/main、CI/Deploy/Pages 全终态 success。按 R13 以本地三面判据为准，**未利用**「CI 读不到未提交 ACTIVE 行」的不对称硬推 | — | **已核（`091f325` + 本次提交）** |
| DL-O22（`DONE` 11-08） | **A 段 10 条 `DONE` 行缺 commit / CI 回执**：`DL-D02` / `D05` / `D09` / `D11` / `D12` / `D13` / `D15` / `D16` / `D17` / `D18` 的来源列只有文档行号或版本号，违反台账「关单：`DONE` 必须写 commit」。**11-07 建台账时从历史快照迁移的既有口径，非本批回归** | `_probe/ledger-review-2026-11-08/report.md`（季度只读复核 11-08：13/14，唯一 FAIL） | 全局 | **已按三档补录完毕**：10 条全部找到真实且**在 `origin/main` 祖先链上**的 hash（37 个候选验证通过），逐条证据见仓外 `_probe/wb-window-2026-11-08/receipts.md`；`0009b8d` 同 subject 但不在 main 祖先链（rebase 前副本）已剔除；假 hash `0000000deadbeef` 射程自证判红 | — | **已核（只读脚本 + 窄变异）** |

## C · BLOCKED / USER-ACTION（硬阻塞，不是工程待办）

| ID | 事项 | 状态 | 谁能解 / 缺什么 | 来源 | 别名 |
|---|---|---|---|---|---|
| DL-B01 | 邮箱登录真机（SMTP） | `BLOCKED` | **用户**：一份真实 SMTP 配置，配不配、配哪家 | `iteration-plan.md:389` | 待拍板③ |
| DL-B02 | 短信验证码：阿里云通道工程侧**已交付**（个人实名免资质、免签名审核，`a2edd9c` + 7 例），只剩开通拿赠送值 + 填 `server/config.json` | **`USER-ACTION`** | **用户**：去阿里云开通并填配置。腾讯云个人签名 2025-09 起是资质墙，但已被该通道绕开 | `OPEN-DECISIONS.md:11`、`iteration-plan.md:390` | OD-001 / 待拍板④ |
| DL-B03 | Jira 真机验收 | `BLOCKED` | **用户**：站点 + API token（`_probe/accept-linear-jira.mjs jira`）；**Linear 已过，别重跑** | `iteration-plan.md:391-392`、`roadmap:127` | roadmap ⑤ |
| DL-B04 | 微信正式扫码接入 | `BLOCKED` | **商务**：企业主体认证 + ICP 备案域名 + 开放平台审核；演示态已诚实标注 | `roadmap:84,126` | 待拍板⑤ / OD-001 |
| DL-B05 | Notion 笔记推送 / Linear 反向拉取 / Jira 消费点 / 日历 | `BLOCKED` | **用户拍板**：渠道与产品价值待定；4 家凭据是否随备份走亦未定 | `product-scope.md:180-199`、`roadmap:89` | — |
| DL-B06 | 凭据纪律：一律只进会话内存，不落盘、不进备份与同步 | `BLOCKED`（长期约束） | **全体会话**：写进台账防回潮，不是待办 | `iteration-plan.md:393` | — |
| DL-B07 | **全量健康审计·修复批**（定时提醒调度器 + Web Push） | `DONE` | 已落 main：`aea72d6`（10 处实证缺陷 + 契约守护升级）；板面 11-06 21:49 行于 11-07 04:5x 翻 `RELEASED` | `git log origin/main` + 板面收工翻转 | 审计修复批 |
| DL-B08 | **UI 向主流 agent 靠拢·甲案第一批**（用户 11-07 拍板「甲 · 对话为主 + 产物卡」）：流式 + 工具并行、代码卡、右栏「会话」第 4 页签、三模式产物域 | `DONE` | 已落 main：`442483c`（rebase 到 `fede862`）；CI `42336245968` success / Deploy `42336246000` success / Pages `42338338499` success（`f96a02b` 推送回执）；板面 01:58 行于 11-07 11:22 翻 `RELEASED`。其「三模式成为产物域」表述与 M0 公理的口径澄清见 `PRODUCT.md §1` 与 `three-mode-spec.md §1` | `CHANGELOG.md [Unreleased]` + 板面收工翻转 | 甲案第一批 |
| DL-B09 | **UI 靠拢·甲案第二批**（图片附件 / Electron 主进程 SSE 透传 / 代码块语法高亮，零新依赖） | **`DONE`** | **用户 11-08 明示「靠齐主流 agent」= 台账等的那句「把第二批做完」，ZCode 接管并做完**：wb140 树先快照为 `210454f`（HTML 抽回源码态幂等校验通过），本机批次 5 文件 110/110、相关族 90/90、全量 `test:local` 2587 passed（5 红裁决：4 条 worker 饿死抖动单跑复绿 + `claim-check-ci` ③ 为接管行 ACTIVE 自冲突、同提交翻 RELEASED 即解）、lint exit 0、`check:source-state` ✓、`src-split --check` 40/40、server verify 11 脚本 316 条全绿；`ORPHAN` 时只做只读保护、未改源码一行（wb140 树保留未删）。设计意图与用户可见行为零改动，回执见 CHANGELOG `[Unreleased]` 2026-11-08 第二批节与同笔板面翻转 | `git -C F:/wt/wb140 status --porcelain` + `node --check` 11-08 06:0x 实测；接管核验 11-08 15:10–16:20 | 甲案第二批 |

> **为什么把 `USER-ACTION` 从 `BLOCKED` 拆出来**（02:25 裁决 Q-E）：原口径把「个人资质墙，永远做不了」
> 和「用户去点几下就能开」混成一类，会让台账看起来比实际更堵。`USER-ACTION` 挂超 60 天由季度复核报出，
> 届时要么催、要么裁 `CUT`，不许无限挂着。

## D · CUT（已裁定不做，防止回潮）

| ID | 事项 | 裁定 | 来源 |
|---|---|---|---|
| DL-C01 | Google / Outlook 日历双向 | 2026-10-03 用户裁定**永久不做**（暂不出国）；改走零凭据 ICS 路线 | `roadmap:82`、`product-scope.md:107-114` |
| DL-C02 | HMS 替代日历 | 形态不兼容（Android 原生 SDK vs Web/PWA/Electron） | `roadmap:83` |
| DL-C03 | Notion / Linear **笔记**双向 | 建议永久不做（个人场景不值当） | `roadmap:86` |
| DL-C04 | C4 | 11-04 用户裁决砍掉（零消费者 + 与 MVP 边界冲突 + 有损） | 板面 11-05 01:02 |
| DL-C05 | `coverage.include` 换 `src/**/*.js` | 2026-10-30 撤销：src 从未被 V8 加载 + 本机采集无数据 | `iteration-plan.md:394-400` |
| DL-C06 | B10 范围 2 | 同 DL-C05，已撤销 | `iteration-plan.md:323-325` |
| DL-C07 | 微信 / QQ 互联的**个人主体**路线 | 资质矩阵判定个人不可达，不是「再等等」 | `OPEN-DECISIONS.md:37-44` |

## E · OVERTURNED（被代码事实推翻，**不能**当现状或待办）

| ID | 旧口径 | 事实 | 来源 |
|---|---|---|---|
| DL-X01 | 「建议**不上** Plan-execute」 | 代码已有 `parseAgentPlan` / `executeAgentPlan` / `executeAgentPlanReactive` + 子代理；`agent-multi-agent-design.md:3-4` 明确「用户 2026-10-03 裁定护栏收益远大于换架构，multi-agent 在护栏之上生长」 | `evaluation-product-2026-10-16.md:198-208`、`agent-multi-agent-design.md:8-14` |
| DL-X02 | `PRODUCT.md` 三区 / 单文件个人工作台 | 三模式已成（DL-D01） | `PRODUCT.md:10,51-69` |
| DL-X03 | 26 / 7 工具数 | 源码 **29** | DL-O06 |
| DL-X04 | `ai-tools.md` 适用版本 `3.7.12` | 已发 `v3.7.155` | `AGENTS.md §二` |
| DL-X05 | roadmap「P0 118 处」待办 | P0 是上界、真待修 0（引 `docs/empty-catch-p0-triage.md`，别引 AGENTS.md 历史行） | `iteration-plan.md:294-296` |
| DL-X06 | 「#110 是 CI 侧浏览器 / 缩放差异」 | 证伪：本机同样复现，是 768–1023 布局链塌陷（`boxH=80` 是 `getScreenCTM().d=1` 的假性正常） | `iteration-plan.md:426-440` |

> **分类理由**：`CUT` 是**主动裁定不做**；`OVERTURNED` 是**被代码事实推翻**。后者若被当成"还没做的建议"，
> 会直接误导下一轮排期——这正是 `evaluation-product-2026-10-16.md §5.3` 最危险的地方。

---

## 复核与收口

- **本表 2026-11-07 02:25 建立**，基线 `e99e344`（`origin/main` 本地跟踪引用 `717b5d4`，未 fetch）。
- 所有「已核」条目均在本轮读源码 / 文档亲验，「仅据文档」未亲验代码，**下次动工前先重测再排期**
  （`iteration-plan.md:180-181` 的教训：本仓已三次把已完成的事再排一遍）。
- **`OVERTURNED` / `CUT` 不进排期**；`BLOCKED` / `USER-ACTION` 不占工程批次；`DOING` 不认领他人路径。
- 落盘顺序、窗口判据与提交白名单见仓外执行母稿
  `three-mode-spec-and-demand-ledger.md §2.6`；本表**不记录 CI / 版本结论**（事实以 `git log` / CI 为准）。
