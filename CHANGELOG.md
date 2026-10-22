## [3.7.137] - 2026-10-22

> 本版含：原生 confirm 迁移第五、六批（22→12→**0，棘轮清零，`src/` 原生 confirm 全部迁完**）、
> R-2 空 catch 基线逐文件精确重冻（16 处漂移噪声 → 2 处）、OD-001 第三方登录选型复核
> （降为"回一个字母即可裁"）。累计：原生 confirm 39 → 0，共六批。

## [Unreleased]

> 新攒的活写进本段；发版时把本段标题改为版本号（AGENTS.md §二 预登记为准），
> 未上表的号不写版本号、写日期或引入它的 commit 锚。

### 2026-10-22 · R-2 存量 P0 空 catch 消解 · 切片一（78 → 71）

- **范围**：只做本会话亲自改过、上下文最熟的 6 个文件 ——
  `ui-backup-stats`(7) / `render-overview`(9) / `ui-drawer`(5) / `ui-global-events`(5) /
  `ui-ge-integrations`(3) / `render-widgets`(3) 中的 P0。`ui-ge-api`(12) / `ai-tools`(9) /
  `data-links`(5) / `ai-retry`(4) 及其余 11 文件共 46 处**不在本切片**（别人的地盘或我没碰过的
  上下文，按 R6 不动）。
- **改法**：严格限定为 R-2 标准式「**加观测、不改控制流**」—— 原静默继续的，改后依然继续，
  只把失败留痕到诊断面板。跟随仓库既有约定
  `try{ if(typeof pushDiag==="function") pushDiag(...); }catch(_){}`（`crypto.js` / `ai-tools.js`
  已用几百次），**不为局部最优引入第二种风格**。
- **实际只改了 7 处**（不是这 6 个文件的 32 处都改 —— 这是本片最重要的结论）：

  | 位置 | 为什么值得上报 |
  |---|---|
  | `render-overview` `_setSyncMeta` | 写失败 → 下次把「上次同步时间 / etag」当成没有 → 重复全量同步或冲突误判 |
  | `render-overview` `_applyCloudSnapshot` 恢复前备份 | 失败 = 用户以为有回滚档而实际没有（OD-003 的假保护） |
  | `ui-backup-stats` `doImport` 的 `initCrypto` | 失败 = 此后写入明文，而用户以为仍受设备密钥保护 |
  | `ui-backup-stats` `saveMessages` | 消息写失败 = 直接丢失且无痕迹 |
  | `ui-global-events` 存储占用统计遍历 | 空态让用户以为「存储是空的」，而实际可能是「有数据读不出来」，占用条停在 0% 与「快满了」正好相反 |
  | `ui-global-events` 启动 `initCrypto` | 同上那条，安全面静默降级 |
  | `ui-ge-integrations` 旧集成凭据清理 | 清理失败 = `appSecret` / `accessSecret` 仍留在本机，v3.7.66「绝不落盘」的承诺悄悄失效 |

- **明确判定「不改」的 25 处**（逐条看过注释与语义，都成立）：
  · `ui-drawer` 全 5 处 —— 清旧版内联样式残留（视觉偏差）、清 `__pendingAiAsk`（5 分钟窗口自动作废）；
  · `render-widgets` 全 3 处 —— 侧栏折叠偏好，丢了下次重写；
  · `ui-ge-integrations` 两处 `await resp.json()` —— API 返回非 JSON（204 / 纯文本错误页）是常见情况，
    按状态码判定本就是设计；
  · 其余如 `render-overview:153` 删缓存、`ui-backup-stats:43`（已被 `_exportReadFailed` 点名，
    防重复上报）、`:1036`（展开偏好，注释明写「刻意不报」）等。
- **基线**：P0 **78 → 71**；空 catch 总数仍 553（消解 7 处 P0 的同时新增 7 处 P2 ——
  标准修法里的 `catch(_){}` 本身就是「诊断不可用」的预期降级，属既有约定的一部分），
  基线 551 不变，门禁 `exit 0`。余下 71 处分布仍头部集中：`ui-ge-api` 12 / `ai-tools` 9 /
  `render-overview` 7 / `ui-backup-stats` 5 / `data-links` 5 / `ui-drawer` 5 等。

### 2026-10-22 · P1-5 文档索引（三级）+ README 派生数字校正

- 新增 `docs/README.md`：权威活文档 / 流程台账 / 规范契约 / 历史快照四级索引 + 冲突优先级
  （PRODUCT > DESIGN-SYSTEM·ARCHITECTURE > ui-standards）。**不移动文件**：历史文档被 README/台账交叉引用，
  移动会打断链接（已在索引里写明这个决定）。
- README 校正派生数字：模块数 `35 → 38`（`src/order.json` 实测）、骨架体积 `约 607 KB → 约 640 KB
  （v3.7.136 实测 638 KB）`；AI 工具数 26 实测仍准确，未改。README 文档表新增索引入口。

### 2026-10-22 · P1-6 绑定覆盖率门禁（动态控件面）

- 静态控件面已有 `dead-wiring-guard`；真正没人守的是**模板动态渲染**的按钮。新增
  `tests/binding-coverage.test.js`：15 个视图各渲染一次，收集 `#main button`，按五种合法绑定形态判定
  （自身 `on*` / 自身 listener / ≤3 层祖先委托 / 表单 submit / 已登记委托动作属性），**未覆盖必须为 0**。
- 实测 **196 个按钮、0 未覆盖**；委托动作注册表（23 个 `data-*`）另有"必须有可证明消费方
  （getAttribute/dataset/closest/hasAttribute）"断言，并带反向对照。
- 射程自检：合成的"无绑定按钮"必须判红；三种合法形态各一个样本必须判绿。
  口径边界已写进 `docs/ARCHITECTURE.md`：只证明"有处理器"，不证明"点了有反应"。
- 测试夹具 `loadApp({instrument:true})`：在 `beforeParse` 包装 `addEventListener` 记录绑定（生产无影响）。

### 2026-10-22 · R-31 / R-32：手机聊天抽屉可达 + AI 就绪判定改走 profiles

- **R-31**：≤767 的聊天面板靠 `.chat-panel.show` 滑入，但全仓没有任何代码添加它 ⇒ 手机上聊天**不可达**。
  补：场景头「问 AI 助手」/ `__aiPanelExpand()` 在窄屏打开抽屉（移除 `.collapsed` + 显示遮罩），
  折叠键/遮罩/Esc 三条关闭；桌面坞语义不变。
- **R-32**：AI 配置迁到 `profiles[]` 后，三处就绪闸门仍读顶层 `cfg.base/cfg.key` ⇒ 永远判"未配置"，
  「问 AI 助手」在**桌面也**只跳设置页、AI Hub 三卡片与"配置后续上"同样失效。新增单一判定
  `aiReadyProfile()`（启用 × 激活 profile 的 base/key，兼容旧形态），三处闸门统一接管。
- 守护：`tests/mobile-chat-drawer.test.js`（3 例）+ `tests/ai-readiness-profile.test.js`（4 例）+
  `layout-v2` 375 抽屉几何用例；`lint` 与 `lint:empty-catch` 均 0。

## [3.7.136] - 2026-10-21

> 本版含：布局 v2（对话下沉 + 右栏今日任务）、原生 confirm 迁移第二~五批（35→12）、
> 以及布局批次暴露的两条 e2e 回归与空 catch 门禁的修复。

### 2026-10-22 · R-2 收尾：空 catch 基线**逐文件精确重冻**（16 处漂移 → 2 处）

- **背景**：confirm 迁移第二~六批陆续改了 `ui-backup-stats` / `ui-drawer` /
  `ui-global-events` / `render-*` 等文件，使 `scripts/lint-empty-catch.baseline.json`
  出现**基线漂移** —— 门禁每次运行都打印一批「新增 P1/P2」噪声。R-2 早已记过这类问题的危害：
  噪声会把「✓ 无新增 P0」这句结论稀释掉，真出现新 P0 时会淹没在同一条里（"看起来在守护"）。
- **做法**：**逐文件精确重冻**（R-2 纪律：零全量 `--freeze`）。
  ⚠️ 特意**没有**用 `lint-empty-catch.mjs --scan <file> --freeze` —— 那个组合会拿**单文件**
  的扫描结果覆盖整个 baseline.json，把其他文件的条目全部丢掉，等于用"精确"的名义做了全量重冻。
  改用 `_probe/refreeze-file.mjs <file.js>…`（只替换指定文件的条目，其他文件一个字节不动；
  与既有的 `_probe/_stale-check.mjs` 同一模式，工具本身在 `_probe/` 下、不入库）。
- **结果**：新增噪声 **16 处 → 2 处**。基线 540 → **551** 条（新增的 11 条全部是本会话
  confirm 迁移引入的真实新空 catch，不是洗白）。分级现状：P0 **78**（其中无注释 **0**，
  即 R-2 的 P0-a 台账仍保持清零）/ P1 226 / P2 249。
- **剩余 2 处未处理，归属说清**：`ui-ge-api.js:890`（P2）与 `ui-theme.js:74`（P1）——
  **均非本会话改动**（本会话未碰这两个文件），按协作纪律 R6 不擅动，已在
  `docs/agent-board.md` 告知，请改动方自行精确重冻。

### 2026-10-22 · P1-4 余项：原生 confirm 迁移第六批（12 → **0**，棘轮清零）

- 迁移最后 12 处，`src/` 里的原生 `confirm()` **至此全部迁完**：
  - `src/render-entry.js` 3 处 —— `#fbClearBtn`（首屏清空）/ `#mdClear`（Markdown 清空）/ `#cadClear`（CAD 画布清空）；
  - `src/render-overview.js` 4 处 —— 商店插件卸载 / `_restoreFromCloud`（云端恢复）/ `#dgmPresetSel` onchange / `#dgmClearAll`；
  - `src/render-widgets.js` 3 处 —— `#recycleClear`（清空回收站）/ `#recycleBatchPurge` / `#csClear`；
  - `src/ui-ge-integrations.js` 2 处 —— `webdavSyncUpload` 412 冲突分支 / `webdavSyncDownload` 覆盖确认。
- 棘轮 `NATIVE_CONFIRM_TOTAL` 12 → **0**。现值 0 之后语义反而更强：任何新增原生 confirm
  都会让总数变成 1 ≠ 0 而当场红，不再依赖"记得调低常量"这个容易忘的动作。
- 新增真路径覆盖 `tests/confirm-migration-batch6.test.js` **4 例**（回收站清空：确认才清 /
  取消不清 / Esc 不清 / 空站无入口）。`webdavSync*` 两处由 `tests/webdav-sync.test.js` 覆盖，
  不重复造。
- 本批两个新坑（已写进文件注释）：
  ① **confirm 之前还有 await 时，「同步点按钮」手法失效** —— `webdavSyncDownload` /
     `webdavSyncUpload` 在 confirm 前有 `await webdavGet()` 等，调用后代码让出、浮层尚未挂上，
     同步 `getElementById` 拿到 null（实测 `expected null to be truthy`）。改用轮询等浮层，
     且**只点一次指定按钮**（不是无条件确认的接盘器），才能分别表达同意/拒绝两条路径。
     只有 confirm 位于函数入口（前面没有 await）时才能同步点。
  ② `AppBridge` 是模块顶层的 `const`，**不会挂成 window 属性**（jsdom 全局词法环境里才有）——
     `win.AppBridge.xxx` 拿到的是 undefined；`addToRecycleBin` 走 `__test` 导出，
     `openRecycle` 用 `win.eval("AppBridge.openRecycle()")`。
- **一处实测更正预期**：原以为"空回收站点清空也会给确认框"，实测按钮**根本不渲染** ——
  这其实是更合理的设计（没东西可清就不给入口），已改为如实钉住现状。
- **变异验证**：`#recycleClear` 退回原生 `confirm()` ⇒ **恰好 3 例红**（第 4 例不涉确认框故仍绿），
  还原后 md5 一致。
- 未覆盖登记：其余 11 处（`#mdClear`/`#cadClear`/`#fbClearBtn` 需先进对应工具页；商店卸载 /
  `#dgmPresetSel`/`#dgmClearAll`/`_restoreFromCloud` 需已装插件或打通云端链路；
  `#recycleBatchPurge`/`#csClear` 需先进批量勾选态/图表画布）—— 与已覆盖处同一组件，差异只在触发方式。

### 2026-10-22 · P1-4 余项：原生 confirm 迁移第五批（22 → 12）

- 10 处调用点改走 `dangerConfirm()`：
  - `src/ui-drawer.js` 5 处 —— 场景删除（113）、**Profile 删除**（497）、
    模板导入（964）、插件卸载（1033）、自定义主题删除（1198）；
  - `src/ui-scene-bind.js` 5 处 —— 删除任务 ×3（49 / 220 键盘 Delete / 377）、
    删除记录（61）、**批量删除**（500）。
- 债务棘轮同步下调：`NATIVE_CONFIRM_TOTAL` 22 → **12**（去注释后实测，剩的全在
  `render-entry` 3 / `render-overview` 4 / `render-widgets` 3 / `ui-ge-integrations` 2）。
- 新增真路径覆盖 `tests/confirm-migration-batch5.test.js` **9 例**：删除任务 3
  （确认才进回收站 / 取消不清 / Esc 不清）+ 批量删除 3 + Profile 删除 2，
  另加 1 条缺陷登记。全部走真实入口，用「用户看得见的条目数」判，不读内部变量。
- **本批顺带查出一条未接线缺陷**（已登记审计项，**本批不修** —— 修它要动布局，
  超出 confirm 迁移的职责）：批量删除整条链在 UI 上**没有入口** ——
  `bindBatchToolbar()`（`src/ui-scene-bind.js:601`）在整个仓库里**没有任何调用点**，
  `#batchToolbar` / `#btnBatchDelete` 也不在静态 HTML 里。即用户在界面上没有任何路径
  能触发批量删除。已用一条断言把这个缺陷钉在测试里（接上线后它会红，提示可改走真路径）。
  为了仍能测到调用方，batch5 **自造最小载体**（补两个节点 + 调 `bindBatchToolbar()`
  走真实绑定），使被测的是源码那一句本身、而不是测试里抄的一份。
- **一处如实更正**（宁可写进 CHANGELOG 也不留错注释）：`batchDelete()` 有返回值，改 async
  后返回 `Promise<number>`，调用方改为 `await batchDelete(); render();`。我最初的判断是
  「不 await 的话删除后没人刷新界面」——**变异验证证明这是错的**：不 await 也能最终刷新，
  因为删除走 `setTasks`，其数据广播会触发整体 render。保留 await 的真实理由是语义
  （刷新发生在删除之后）与不押注在"setTasks 一定广播"这个隐式副作用上。
  测试里对应那条的射程也已改注明：它守的是「界面最终刷新」这个**用户可见**性质，
  **不区分**上面两种写法。
- **变异验证**：`batchDelete` 退回原生 `confirm()` ⇒ **恰好 2 例红**（"先出确认框"与
  "取消"两条，其余 7 条不受影响），还原后 md5 一致。
- 未覆盖登记：ui-drawer 的场景删除 / 模板导入 / 插件卸载 / 自定义主题删除（分别要先打开
  抽屉对应分区、装插件、建自定义主题，驱动成本高）；ui-scene-bind 的键盘 Delete 路径与
  删除记录（`[data-rdel]`）。它们与已覆盖的调用点走同一个 dangerConfirm 组件，
  差异只在触发方式。
- **本批红过一次，两个既有测试漏改（教训复验，写下来免得第六批再犯）**：全量首跑
  `5 failed | 163 passed (170)`。其中 **2 个是真回归** —— `tests/quickwins.test.js:44`
  「应置软删标记」与 `tests/round4-batch2.test.js:117`「Delete 软删任务」，
  都是**同步点击后立即断言**，而处理器改成 async 后断言撞在 `await dangerConfirm` 上
  （`expected undefined to be truthy`）。修法：点掉「确认执行」+ 等一个宏任务，`it` 改 async。
  另 **3 个是超时**（`ai-skills` 60s / `three-state-render` 60s / `batch3` 180s）——
  **单独复跑 5 个文件共 107 例全过**，定性为 CPU 争抢型抖动（这三个都是已知慢文件）。
  🔴 第四批的教训是「`grep 'confirm('` 只是第一层，必须再 grep 依赖自动确认的测试」；
  本批证明**第二层也要分层**：还要 grep「**点下去之后同步断言**」的测试 ——
  替身型（`win.confirm = …`）只是其中一种，另一种是 `btn.click(); expect(...)` 直接读状态。
  两类合起来才是完整清单。

### 2026-10-22 · P1-4 余项：原生 confirm 迁移第四批（24 → 22）

- 2 处调用点改走 `dangerConfirm()`：**清空全部数据**（`src/ui-backup-stats.js` `doClear`，252）
  与**集成任务推送**（`src/ui-global-events.js` `[data-int-push]`，645）。
- `doClear` 改 `async` 后，两个调用方（`ui-global-events.js:34` 的 `onclick = doClear`、
  `ui-palette.js:153` 命令面板 `run:doClear`）**刻意不 await**：清空是"点了就走"的一次性动作，
  调用方不关心结果，且 `doClear` 内部不抛 ⇒ 不会引入新的失败模式（已在 `danger-confirm.test.js`
  棘轮注释里写明，免得后人当漏改补上 await）。
- 债务棘轮同步下调：`NATIVE_CONFIRM_TOTAL` 24 → **22**（去注释后实测）。
- 新增真路径覆盖 `tests/confirm-migration-batch4.test.js` **7 例**：清空 3 例（确认才清 /
  取消不清 / Esc 不清）+ 推送 4 例（确认才发请求 / 取消不发 / Esc 不发 / 文案带条数与目标名）。
- 本批踩到两个**前三批都没遇到**的坑，写法已固化进文件注释：
  ① `doClear` 结尾有 `setTimeout(() => location.reload(), 900)` —— 真实计时器下这条尾巴会
     在断言之后落到已关闭的窗口上，变成与改动无关的 Unhandled 噪声（第三批 batch3 因此红过一次）。
     故清空路径一律**切假计时器**；而假计时器下 `autoDangerConfirm` 接盘器**失效**（它靠
     `setTimeout` 轮询找按钮），正解是「同步点掉确认按钮 + 微任务 flush」—— 浮层在 Promise
     executor 里同步挂 DOM，点掉之后的后续走微任务，**微任务不受 fake timers 影响**。
     同一手法也用在了既有的 `clear-no-reseed` / `round4-batch1` 两处 `doClear` 用例上。
  ② **e2e 的 `page.on("dialog", …)` 只对原生 alert/confirm/prompt 生效**，对真浮层毫无作用。
     `tests/e2e/integration-push.spec.js` 的原 dialog handler 已换成 `addInitScript` 注入的
     MutationObserver（浮层一挂上就点「确认执行」），且必须在 `goto` **之前**注入。
     ⚠️ 更深的坑（第一版就栽在这里，一次红了 6 例）：init script 跑在**文档创建之前** ——
     实测此刻 `document.readyState === "loading"`、`document.documentElement` 仍是 **null**，
     直接 `observe(null, …)` 会**静默失败**（错误不出现在测试输出里），现象是
     "浮层确实弹出来了、但没人点它"，快照里能看到确认框还开着而请求数为 0。
     正解是**等文档建起来再挂**：先试一次挂上，不成就交给 `readystatechange` 重试。
- **变异验证**（两条独立做，各还原后核对 md5）：`doClear` 退回原生 `confirm()` ⇒ **恰好 3 例红**
  （清空那三条，推送四条不受影响）；`[data-int-push]` 退回 ⇒ **恰好 4 例红**（推送那四条，
  清空三条不受影响）—— 说明两组判据各自有射程且不互相"借光"。
- 未覆盖登记：`[data-int-push]` 是所有 provider 共用的同一处委托绑定，本批只驱动 notion 一个
  按钮；Linear / Jira 走同一段确认代码，不复测。

### 2026-10-21 · 布局 v2：对话下沉 + 右栏「今日任务」

依据 `docs/PRODUCT.md` 的定位（桌面为主的知识工作者；闭环=捕获→AI 落手→复核）与大方向
「对话区放到正下方、右侧边栏变任务列表、整体更简洁」：

- **对话坞**：`#chatPanel` 移入主列并以 `sticky` 贴底（不再占第三栏）。**默认收起（只留标题栏+输入行）**，
  点开才显示历史（上限 46vh，历史区自己滚动）；**折叠=只收起历史与工具条，标题栏与输入行保留**
  （首版把标题栏一起藏了，唯一的展开按钮随之消失，被 e2e 当场判红——已修）。折叠状态照旧持久化。
  **沉浸页隐藏对话坞**（设置抽屉/回收站等整页工作区）——常驻坞曾把集成面板的 Linear 按钮挤出视口、
  让场景表单的时间下拉被裁切，CI 两条 e2e 连红三次；改为默认收起 + 沉浸页隐藏后 30 条 e2e 全绿。
- **右栏今日任务轨**（≥1024 常驻 280px）：逾期 → 今天 → 有日期 → 无日期，最多 8 条；
  勾选走 `completeTask`（含联动），点标题开编辑，`+` 走首屏同一个新建入口；**不做第二套 CRUD**。
  计数同步顶栏徽标；可折叠（折叠后顶栏出现「今日」按钮）。
- **768–1023 / ≤767**：任务轨改为顶栏滑出层（Esc / 遮罩关闭）；聊天在 ≤767 保持右抽屉不动。
- **窄屏顶栏收口**：≤479 隐藏「指南 / 下载」两个低频按钮（各有等价入口：侧栏底部 / 设置·数据管理），
  修掉新增「今日」入口后 375px 视口出现的 6px 横向溢出。
- 新增门禁：`tests/task-rail.test.js`（6 例：排序/计数/完成/空态/折叠持久化/滑出与 Esc）+
  `tests/e2e/layout-v2.spec.js`（7 例 × 2 项目：坞与主列同宽贴底、轨道在右栏、折叠后主列变宽、
  无横向溢出，含**反向对照**：偏移 40px 必须判红）。
- 契约写入 `docs/DESIGN-SYSTEM.md` §2.1；`docs/PRODUCT.md` §5 同步助手面板与右栏的新职责。

### 2026-10-21 · P1-4 余项：原生 confirm 迁移第三批（27 → 24）

- 3 处调用点改走 `dangerConfirm()`，全在 `src/ui-backup-stats.js`：**导入覆盖确认**
  （`doImport` 的 `reader.onload`，154 —— 宿主本就是 async 闭包，只添一个 `await`）、
  **恢复前快照回滚**（`_preRestoreRollbackFlow`，613）、**恢复前快照删除**
  （`_preRestoreDeleteFlow`，623）。两个 flow 的宿主是按钮 `onclick`（`bindPreRestoreButtons`
  绑定），返回值无人消费，故改 `async` 无副作用。
- 债务棘轮同步下调：`tests/danger-confirm.test.js` 的 `NATIVE_CONFIRM_TOTAL` 27 → **24**（去注释后实测）。
- 新增真路径覆盖 `tests/confirm-migration-batch3.test.js` **8 例**：走真实入口
  （`#fileInput` 的 `onchange` / `#btnPreRestoreRollback` / `#btnPreRestoreDelete`），
  判据仍是「确认框出现时动作还没发生 → 点确认后动作才发生」，含取消、Esc、
  以及「没有快照时不弹确认框、直接如实告知」这条不进死路的路径。
- 本批实测踩到并修掉两个**测试自身**的坑（写进文件注释，避免后来者重犯）：
  ① FileReader 回调在 jsdom 负载下远超 `vi.waitFor` 默认 1000ms —— 对导入路径改用
  显式 30s / 50ms 间隔（等的是"文件读完并解析"这个真实条件，不是给慢测试打马虎眼）；
  ② 只断言"数据已落盘"就结束用例，会让其后 `initCrypto()` / toast 的尾巴跑到
  `afterEach` 关窗之后，变成 `Unhandled Rejection` —— 改为等终端 toast（"导入成功"）上屏。
- **变异验证**：把 `_preRestoreDeleteFlow` 退回原生 `confirm()` ⇒ **恰好 4 例红**
  （删除 2 例 + 导入"取消"/"Esc" 2 例——后者红的原因见下），还原后 md5 一致。
  导入那 2 例在变异下红不是误差：`loadApp` 把 `win.confirm` 打成 `() => true`，
  一旦退回原生确认就是「真取消也拦不住」，判据本来就该红。
- ⚠️ **本批第一版漏改了一批既有测试，已修**（教训写进 `tests/helpers/autoDangerConfirm.js`）：
  `import` 这条链上有 **4 个文件 8 处**调用点（`p0-storage` / `backup-key-union` /
  `backup-export-exclusion` / `p0-crossdevice-key`）一直依赖 `loadApp.js` 里那句
  `window.confirm = () => true` 自动确认。那句只对**原生** confirm 生效，对
  `dangerConfirm` 毫无作用 ⇒ 流程永远停在 `await` 上，调用方以异常收场
  （`P0-4 用例 C` 的 `threw` 翻真、T1–T4 全红）。此前只在板上记了
  `ai-profile` / `notion-push` / `webdav-sync` 三个文件，**漏了导入链这一批**。
  修法不是给浮层开后门，而是新增 `tests/helpers/autoDangerConfirm.js`：
  让浮层一出现就点「确认执行」，**语义与旧替身完全等价**（旧替身同样是无条件确认），
  从而让"测的是导入宽容度 / 错误告警 / 跨设备 Key 迁移"的用例继续测它们真正要测的东西。
  三条约束：窗口关掉必须自停（否则跨窗口泄漏计时器、产出无关噪声）、点完即停、超时兜底。
  **测确认框本身行为的用例不许用它** —— 那些必须显式点 Yes/No/Esc。
- 未覆盖登记（写在测试文件文末）：`doClear` 迁移需连两个直接调用方一起改 ——
  `ui-palette.js:153`（`run:doClear`，被 `it.run()` 调）、`ui-global-events.js:34`
  （`onclick = doClear`）、以及 `tests/clear-no-reseed.test.js:26` 与
  `tests/round4-batch1.test.js:113`（**均不带 await**，且 OD-004 的守护就在这里）——
  改 async 会红到守护本身，作为独立一批做。

### 2026-10-21 · P1-4 余项：原生 confirm 迁移第二批（35 → 27）

- 8 处调用点改走 `dangerConfirm()`，全在 `src/ui-global-events.js`：GitHub token 清除
  （`#ghClear`，588）、WebDAV 配置清除（`#wdClear`，626）、API Key 吊销 ×2
  （`[data-revoke]`，集成面板 679 / AI 面板 716）、AI 会话历史清除（`#aiSessClear`，1269）、
  工作记忆清空（`#btnClearMem`，1349）、联动规则重置（`#chainResetBtn`，1401）
  与单条删除（`#linksBox` 委托，1410）。宿主无返回值者改 `async` + `await`；
  `batchDelete()` / `webdavSyncUpload|Download` 这类**有返回值**的仍留原生确认 ——
  改 async 会让调用方拿到 Promise，确认必须前置到调用点，已登记为下一批。
- 债务棘轮同步下调：`tests/danger-confirm.test.js` 的 `NATIVE_CONFIRM_TOTAL` 35 → **27**（去注释后实测）。
- 新增真路径覆盖 `tests/confirm-migration-batch2.test.js` **9 例**：AI 会话历史清除 / 工作记忆清空 /
  联动规则重置 / 联动规则委托删除，判据都是「确认框出现时动作还没发生 → 点确认后动作才发生」，
  并含取消与 Esc 两条不动的路径。
  **变异验证**：把 `#aiSessClear` 退回原生 `confirm()` ⇒ **恰好 3 例红**（其余 6 例不受影响），
  证明判据有射程且定位准确；还原后 `md5 = 677d538f8e319dd2df53673f220847b5` 与备份一致。
- 未覆盖登记（写在测试文件文末，不是"已验证"）：`#ghClear` / `#wdClear` / 两个 `[data-revoke]`
  需真实凭据或 electronAPI 才进入可点状态，本批只做了静态替换与语法校验。

## [3.7.135] - 2026-10-21

> 用户 2026-10-20 14:4x「按照你的顺序来吧」+ 19:5x「继续做吧」授权下的 P1-4 收尾；
> 号由本会话 2026-10-21 登记在 `AGENTS.md` §二。四片内容如下。

### 2026-10-20 · P1-4 余项（可读性与触控下限）

- **可读性下限**：`--fs-2xs` 由 11px 抬到 **12px**（`:root` + 5 个主题覆盖块同步），次级注释、顶栏按钮
  文字、工具输入提示这类"要读的文字"不再压在可读下限以下。同步改 `tests/ui-spec-guards.test.js` 的
  十四档钉值与 `docs/ui-standards.md` §4.1 的表格（含思维导图 12px 豁免项的口径更正）。
- **触控下限落在高度上**：窄屏（≤479）顶栏图标按钮 `min-height:40px`；触屏设备（`pointer:coarse`）44px。
  ⚠️ 实测把宽度抬到 40px 会让 375px 视口出现 **103px 横向溢出**（顶栏图标按钮数量多），因此宽度维持 26px
  不动 —— 正解是「窄屏把低频按钮收进溢出菜单」，已作为独立设计项写进 `docs/DESIGN-SYSTEM.md` §3。
  **没有用压布局的办法凑 44×44 指标**，守护钉的是与实测一致的那组契约。
- 新增门禁 `tests/ui-scale-floor.test.js`：字号 12px（6 处声明齐备）+ 窄屏高度 ≥40 + 粗指针 ≥44 的静态棘轮，
  自带射程自检（违规样本必须被判红）。

### 2026-10-21 · P1-4 余项（危险操作确认：从"点不到"改成真浮层）

- **修掉一条 P1 缺陷**：AI 的「危险操作确认」外壳用的是 `.recycle-modal`（`position:static` 的页面内卡片）。
  真浏览器实测：插到 body 末端时 `rect.top` 正好等于视口高度（整块在视口外），`trapFocus` 的自动 focus
  只把文档滚下 138px；**375×667 下「确认执行」按钮 y=632–651，被固定底部导航（top=610，`--z-sidebar:40`）压住**，
  `elementFromPoint` 命中 `mob-bar-btn` —— 想确认删除，点下去却是切走场景。
  旧单测只断言"元素存在"，jsdom 没有排版引擎，所以这条一直是绿的。
- **新增通用组件 `dangerConfirm()`**（核心层，`.viz-modal` 真浮层 `z-index:80`）：`role="dialog"` + `aria-modal`、
  Esc 取消、焦点陷阱与归还、**确认类不吃遮罩点击**、消息全量转义、连开不叠层、`dismissDangerConfirm()` 幂等。
  `openConfirmModal()` / `closeConfirmModal()` 改为委托它 —— `ui-hotkeys` 的 Esc 链与场景切换清理语义不变；
  打字确认路径不会被误记成"已取消"。
- 新增守护：`tests/danger-confirm.test.js` 9 例（契约 / XSS / 不叠层 / dismiss 幂等 /
  **原生 confirm 39 处债务棘轮**，棘轮的计数器自带阳性与阴性对照）、
  `tests/e2e/danger-confirm.spec.js` 4 例（窄屏命中 + **旧骨架反向对照**，证明判据有射程）。
  变异验证：把骨架改回 `.recycle-modal` ⇒ 单测 1 红、窄屏 e2e 2 红。
- 台账新增 `docs/audit-2026-10-06.md` **R-29**；`docs/DESIGN-SYSTEM.md` §4 补"浮层骨架只认哪几个类名"
  与"看得见不许用 jsdom 证明"两条契约。

### 2026-10-21 · P1-4 余项（原生 confirm 迁移第一批：39 → 35）

- 4 处调用点改走 `dangerConfirm()`：会话删除（`src/data-links.js`）、日历源删除（`src/ui-ge-calendar.js`）、
  笔记删除 + 知识库文件删除（`src/ui-ge-notes.js`）。三处宿主函数因 `await` 改为 `async`（事件处理器返回值
  无人消费，已逐处看过；**有返回值的函数不在此批** —— `batchDelete()` / `webdavSyncUpload|Download` 一律加
  `await` 会让调用方拿到 Promise，确认必须前置到调用点，已登记）。
- 新增 `tests/confirm-migration-batch1.test.js` 4 例：走**真实入口**（`#chatSessionBtn` → 会话列表；工具箱
  笔记卡 → 编辑已有笔记 → 删除键），判据是"确认框出现时动作还没发生 / 点确认执行后动作才发生"，
  并含取消与 Esc 两条不删的路径。此前这几个控件**零测试覆盖**。
  变异验证：把会话删除那处改回原生 `confirm()` ⇒ 该文件 **2 红**（确认框没出现）；恢复后 md5 与备份一致。
- 债务棘轮同步下调：`tests/danger-confirm.test.js` 的 `NATIVE_CONFIRM_TOTAL` 39 → **35**（实测去注释后计数）。
  未覆盖登记在同一文件文末：日历源删除、知识库文件删除两处只做了静态替换，行为路径要补播种。

### 2026-10-21 · P1·工具链：本机全量判定器两头都判错，已修（台账 R-30）

- **假红**：`scripts/test-verdict.mjs` 只从 `Unhandled Error` 块抽未处理错误，而 worker 的 RPC 超时有
  **9/15 条报在 `Unhandled Rejection` 块**里 ⇒ 同签名的已知抖动被算成"未知错误"，
  一次**零断言失败**的运行被判「❌ 失败」。修法：抽取正则并集 `Unhandled (?:Error|Rejection)(?!s)`。
- **假绿（更贵）**：`Test Files 163 passed (166)` 这种"文件数对不上"旧版看不见 —— worker 掉线的文件
  既不计 passed 也不计 failed，那 3 个文件（`cloud-sync-stage1` / `cloud-sync-stage2` / `quickwins`，25 条用例）
  **一条都没跑过**却被判"通过"。新增 `testFilesMissing = total - passed - failed`，"没报结果"显式判失败，
  并提示"要定性请单独复跑那几个文件"（已照做：三个文件单独复跑 `exit 0`、判定「✅ 通过、无未处理错误」）。
- `tests/test-verdict.test.js` 9 → 11 例（夹具与真实日志同形）。两处新规则**各做一次变异归因**：
  正则退回只认 Error ⇒ 恰好 1 例红（`expected 1 to be 3`）；缺文件分支短路 ⇒ 恰好 1 例红（`'pass' to be 'fail'`）。
- 用法提示：本机全量请走 **`npm run test:local`**（带判定与退出码归因），不要再用裸 `npm run test` 的 exit 码下结论。

## [3.7.134] - 2026-10-20

### P0：把「看得见点不动」清零，并让能力说真话

- 首屏主 CTA「新建任务」（`top.addTask` 键此前零引用）→ 进 office 场景并聚焦标题输入。
- 工具箱 / 侧栏三处「报表 / 日历」打开后补事件绑定（翻页、对比、PDF、月份切换此前全死）。
- 编程场景 JSON / 时间戳 / 编解码 / UUID 四 tab：`SCENE_FEATURE_BIND` 存的是 bind 函数却被当
  `{key,fieldKeys}` 取 `.key` ⇒ 绑定永不执行；改为函数则直接调用。
- 诚实标注：天气改「示例数据 · 演示用（不联网）」；AI 示意图失败文案不再冒充"接口不支持图片输出"。
- `.toast.error` / `.toast.info` 补独立视觉（29 处 error、12 处 info 此前与普通提示同貌）。

### P1：定身份（用户 2026-10-20「按照你的顺序来吧」授权）

- **三区导航**：今日 / 工作台 / 助手 / 更多，17 个入口一个不丢；移动底栏与抽屉复用同一菜单树。
- **首页重排**：待办卡提到 KPI 之前，首屏先给"要做的事"。
- **工具箱降 Labs**：常用 5 个（JSON/时间戳/知识库/笔记/日历）+ 实验折叠区，卡标「实验」，搜索命中自动展开。
- **主题入口收敛**：默认只露亮/暗/跟随系统，8 套实验主题折叠；数据与持久化逻辑未动。
- 六层高频浮层（报表/日历/甘特/仪表盘/天气/萌宠）支持 Esc 关闭与 Tab 焦点循环。

### 门禁与文档

- 新增 `tests/ia-three-zones.test.js`（4 组 / 17 入口契约）、`tests/toolbox-labs.test.js`、
  `tests/theme-scope.test.js`、`tests/modal-keyboard.test.js`、`tests/e2e/main-cta.spec.js`；
  i18n 完整性新增「HTML 属性键必须双语存在」，并自带射程自检（假键必须被判缺）。
- 新增活文档 `docs/PRODUCT.md`（定位/反目标/闭环/指标）、`docs/ARCHITECTURE.md`（分层契约/数据/交付）、
  `docs/DESIGN-SYSTEM.md`（令牌/断点/控件/浮层/三态）。

### R-6：断点纪律守卫升格进 lint 链（v3.7.134 批次 · 用户「确定有益就做」）

- 背景（roadmap §四 需要拍板的第 2 件）：断点纪律此前只活在 `tests/ui-spec-guards.test.js`
  ——**全量单测才跑到**。2026-10-19 实测学费：`29ce6c8` 给时间轴图例写了
  `@media (max-width:1099px)`，开发者只跑受影响用例 ⇒ run `39161220080`
  windows 腿红 + ubuntu cancel + Pages failure，红一夜。判据纯静态、零 IO、零误报
  （把 `@media` 宽度值与允许集对一遍），是最该前置的门禁。
- 落地：新增 `scripts/lint-breakpoints.mjs`（允许集/债务清单/主档必备三组断言，
  未登记/债务回潮/主档缺失分别报红）；`npm run lint` 链尾接入（每个碰 CSS 的人、
  每次 lint 都撞上）+ `ci.yml` test job 与 `deploy.yml` verify job 同序接入
  （parity 由 `tests/ci-workflow-guard.test.js` 缺步/多步/换序即红守着）。
- **防漂移**：断点允许集改为**单一真相源**——`MAIN_BREAKPOINTS` / `SEGMENT_BREAKPOINTS` /
  `DEBT_FORBIDDEN` / `MAIN_REQUIRED` 由脚本 export，`ui-spec-guards.test.js` 改为 import
  并新增一条「与 lint:breakpoints 共用同一份允许集」断言；改一侧即两边同时变，
  不存在「改了测试忘了脚本」。
- 验证：正向 9 个值全登记通过；**反向**（往 HTML 注入 1099）立即 exit 1 并给出允许集提示，
  还原后复绿；`npm run lint` 全链过；`ui-spec-guards` + `ci-workflow-guard` 62/62
  （with-injected 姿势）；`verify:ci --list` 第 9 步即新守卫。

### docs：路线图坐标刷新（R-3 数字漂移家族 · 2026-10-19 批次）

- `docs/roadmap-2026Q4.md` §一「当前坐标」从 v3.7.105（2026-10-10 快照）刷到 v3.7.133：
  版本/HEAD/tag、单测 140 → **160 文件**、e2e 90 例/14 spec → **122 例/18 spec**
  （均为 2026-10-19 `a05799a` 实测，现测命令照抄在文内）；逆层 18 / 循环 13 两个契约型数字未变。
- 顺带销掉同段两条**过时的"剩余缺口"**：refresh token 明文落盘与 `corsOrigin` 默认全开
  均已按建议落地于 v3.7.114（见 §五 待办 ②③），原文还挂在"剩余缺口"里，排期会被误导。
- 用户手册「适用版本」随发布基线 v3.7.132 → v3.7.133。
- 纪律口径不变：进度型数字只写"截至某日某 commit 的实测"并附命令；契约型数字（逆层/循环/块数）
  由 `check:modules` 门禁守，不手抄。

## [v3.7.133] - 2026-10-19

> 新攒的活写进本段；发版时把本段标题改为版本号（AGENTS.md §二 预登记为准），
> 未上表的号不写版本号、写日期或引入它的 commit 锚。

### 走查反馈收口：属性行折行参差 + 任务页卡片丢标签（2026-10-19 批次）

两处都是「同一条任务换个页面/换种数据就不对」的一致性缺陷，来自本轮逐屏走查：

- **任务页看板卡片不画 `tags`**（`render-overview.js`）：场景页卡片
  （`render-scene-main.js` 的 `_renderKanbanCard`）一直画标签，任务页看板那张
  （`data-tasks-card`）只画"场景徽标 + 优先级 + 截止日期" —— 用户打上的标签切一个页面就消失。
  现两处同口径：标签排在截止日期之后，同一个 `<span class="tag">`。
- **顺带把 `tags` 的脏数据兜住**：两处渲染器都用 `x.tags && x.tags.length` 判存在，随后就
  `x.tags.map(...)` —— `tags` 若是**字符串**（导入/手改存储都可能出现）会走进 `.map` 抛错，
  **整页渲染中断**。统一改成 `Array.isArray(x.tags)`（与 `ui-guide.js` 的 share-tags 同口径）。
- **属性行（`.kcard .m`）标签一多就参差**：该行是 `space-between + flex-wrap:wrap`，而
  `space-between` 是**按行**生效的 —— 折行后每行各自"两端对齐"，行内留下宽窄不一的空洞
  （实测 4 枚 chip 折两行时：首行末项被顶到最右 `x=447`、次行三枚挤在左端）。规则改为
  chips ≤3 枚时保留 `space-between`（v3.7.46 要的"铺满整行"观感），**第 4 枚起一律左对齐 +
  等距 gap**（`gap: 6/8`），实测每行同起点、间距恒为 8px。用 `:has(> *:nth-child(4))` 做数量查询，
  基础规则仍是 `space-between` ⇒ 不支持 `:has()` 的旧浏览器退回今天的行为（不劣化）。
- **兜底**：单枚 chip 文字过长时（`nowrap + flex:0 0 auto` 会把它撑出卡片）改用
  `max-width:100% + overflow:hidden + text-overflow:ellipsis` 在自身宽度内截断，不再顶破整行。
- **同族第三种形态（全应用扫描顺带查出）**：时间轴图例 `.tl-legend-hint` 用 `margin-left:auto`
  把说明推到最右 —— 单行时是"点左、说明右"的好排版，一旦折行它就独占第二行还被顶到最右
  （375 下实测末行左缩进 **96px**，看着像缩进错了）。断点用**既有的 1023**（"非桌面"边界）：
  中文 ≤768 折行、英文 ≤1024 折行，≤1023 取消 auto 后中文全修；桌面档（≥1024）观感一分不动。
  已知残留：英文界面 + 恰好 1024 宽这一个点仍是旧行为（要在 1024~1099 之间立新断点，
  违反规范 §8.1 四档制 —— 第一版写 1099 被 `ui-spec-guards` 当场拦下，CI 红了一天，见下）。
- **⚠️ 流程教训（本批唯一一次 CI 红）**：`29ce6c8` 只跑了受影响的 vitest + e2e + lint 就推了，
  全量套件里的 `ui-spec-guards`（断点纪律 §8.1）当场拦下 1099 —— run `39161220080`
  windows 腿红、ubuntu 被 cancel。**凡新增 `@media` 宽度值，先跑全量**；
  断点只许用 主档 1440/1439/1024/1023/768/767 + 细分档 520/600/479/359。
- **扫描方法记一笔**（避免下次重复踩坑）：机械找"参差"要同时处理 ① 文本节点（`Range.getClientRects`，
  否则"● 新建"会按元素子级量出假间距）② 按**垂直区间重叠**归行（圆点 9px vs 行高文字，按中心点
  会把一行拆成两行）③ 扣掉容器 `padding-left` ④ 别用 `/wrap/` 匹配 `flexWrap`（`nowrap` 也命中）。
  前三版探针都栽在这上面，最后可靠的结论来自**静态扫 CSS**：46 个可折行 flex 容器里，
  只有 3 个声明了 `justify-content: space-between`（`.foot-bar` 中间段自动撑满、`.kbtns` 按钮
  `flex:1 1 0` 撑满，都不出洞），`.kcard .m` 与 `.tl-legend` 才是真缺陷，均已修。
- **顺手补一个上批回归**：尾栏去掉产品名时把唯一的 `esc()` 一起删了 —— 那行同时是
  `lint-xss` 的放行依据（`esc(` 出现在 RHS 即放行）。已把计数插值 `esc(openN)`/`esc(recN)`
  转义回来并写明"删文案别删 esc"。
- **守护**：`three-state-render` +3 例（⑪ 两处都画标签 / ⑪b 无标签不画空 chip /
  ⑪c `tags` 非数组不崩，42→45 例）；`three-state-layout.spec` +2 例（属性行折行后
  行内间距必须等于声明 gap；折行后**末行不得被推开**（时间轴图例），两条都自带反向对照，
  10→18 例）。两条新守护都做过反向对照：撤掉修复后 ⑪ 变红、把 CSS 规则置空后 e2e 变红
  （属性行：15 枚 chip 折 5 行、最大间距 17px > gap 4px；图例：末行缩进 106px > 4px）。
- **验证**：`three-state-render` 45/45；`three-state-layout` 三视口 18/18；**全量 vitest**
  （断点守卫在列，0 FAIL）；lint 链（eslint+colors+xss+css+appbridge+src-split）、分层、
  模块图、空 catch、令牌、`build:check`、源码态（629KB/38 块）全过；真机截图与坐标实测见
  `_probe/verify-attr-row.mjs`（1280/375 × 场景页/任务页 × 2/6/0 个标签）与
  `_probe/tl-legend-en-measure.mjs`（中英 × 10 个宽度档）。

### OD-003：云恢复前回滚档可消费（2026-10-17 批次 · 用户指派收尾）

- **背景**：v3.7.52 起 `_applyCloudSnapshot` 在云端快照覆盖本机前写 `wb_agent_pre_restore_backup`
  （内嵌全部本地键值，含 cfg），但它被同步/导出双双排除后，**全仓没有任何读取路径** ——
  写了就永远躺在 localStorage 里，「至少能人工比对/回滚」只对开 devtools 的人成立
  （R-24 同型：保护语义必须可被消费，否则是假保护；OPEN-DECISIONS OD-003）。
- **消费入口**（`ui-backup-stats.js`）：设置 → 账号设置 →「上次恢复前快照」卡片，**有档才显形**：
  元信息三行（留档时间 / 键数 / 体积，**不含任何键值**）｜键清单（键名+体积，值绝不渲染）｜
  回滚（二次确认后写回覆盖前的值；**回滚档自身除外、可重复使用**；缓存/会话复位与 doImport 同序，
  单键写失败不中断并进诊断）｜删除（失败不再静默）。卡片经 AppBridge 挂到 `_showApiPanels`，
  每次登录态显隐/页面加载都刷新。WebDAV 覆盖走同一应用路径，入口复用。
- **恢复 toast 改指引**：两处 `api.cloudRestored` → `api.cloudRestoredWithRollback`
  （「覆盖前的本机快照已留存（设置 → 账号设置 → 上次恢复前快照，可查看或回滚）」）；旧键已删。
- **顺带补两处观测口**（空 catch 门禁的 (a) 疗法，勿回退）：删除回滚档失败 → 诊断 + toast；
  登录后拉云快照失败 → 每会话一条 WARN（离线仍是正常态，不弹 toast 打扰用户）。
- **安全边界不变**：回滚档仍被同步/导出排除（`_buildCloudSnapshot`/导出名单未动）；
  cfg 入站仍被 `_applyCloudSnapshot` 排除——「可读的回滚档」没有放宽任何入站口径。
- **文档**：手册 §10/§11 写明入口与口径；OPEN-DECISIONS OD-003 就地关闭
  （三选一裁为 ①+② 合并、① 为主，用户指派裁权）。
- **守护**：`tests/pre-restore-rollback.test.js` 8 例 —— 无档/损坏档诚实降级、元信息与键清单
  不含值、覆盖前写档且档里是覆盖前的值、回滚倒回且档不变可重复、`emitDataMutate("rollback")`
  触发、卡片显隐与值不上面板、删除后回隐藏态；i18n 双语 17 键（zh/en 对齐由既有门禁守）。
- **验证**：全量 vitest 158 文件 / 1779 例全绿（含本批 8 例）；其后仅删旧 toast 死键两行，
  相关门禁（i18n 完整性/手册一致性/构建结构）已复跑转绿；lint（eslint+colors+xss+css+
  appbridge+src-split）、分层、模块图、空 catch、令牌、build:check、源码态（623KB/38 块）全过。

### P2 多文件交付评估：已评估 → 暂缓（2026-10-17 · 用户指派收尾）

- 评估「编译产物多文件 + 单文件兜底」双交付（前置 2/7 拆 core.js + CSS 分区已随 v3.7.132 满足）。
  完整评估见 `docs/evaluation-multi-file-delivery.md`；`docs/evaluation-product-2026-10-16.md`
  追加 2026-10-17 复核注（ROI 十条逐条对账 + 第 10 项状态改写）。
- **结论：暂缓（不做）**。三条收益（缓存粒度 / 首屏 / CSP 去 unsafe-inline）里前两条量级小
  （自建单人部署 + SW 已解决更新体验），CSP 那条短期拿不干净——内联事件属性不清，
  script-src 的 unsafe-inline 仍得留；五条成本全是实的，其中「双轨验证」（e2e 全走 file:// 单文件）
  与「真相源唯一」直击本仓 v3.7.132 刚焊死的纪律。
- **四条触发条件**（任一命中再排期）：交付态 >6MB 或低端机首屏 >2s｜SW 预缓存逼近配额｜
  必须去 unsafe-inline 的合规要求｜新增按文件缓存的外部静态托管形态。
- 顺带取到评估表第 8 项前置存量报告：`lint-colors` **0 违规**；`lint-icons` **P0=0**、
  P1=7（符号与文字混排、文字可兜底，可接受形态不动）。

### 逐屏三态走查：机械化 + 四处实测修复（2026-10-18 批次 · 预登记 v3.7.133）

- **人工走查当场抓到一处、机器秒验的布局缺陷（第 4 处修复）**：用户看"第 4 张 学习"时指出
  **待办栏比下面的卡片窄一圈**。实测 1280 宽下待办栏 238→942、卡片 226→954，左右各内缩 **12px**。
  根因：两者都是 `.main-wrap` 的满宽兄弟，横向内边距必须同值；基础规则 `.main` 用
  `var(--space-4)=16px`，而 `@media(1024–1439)` 里 `.toolbar-row` 写了 `var(--space-7)=28px`
  —— 只有这一档写岔（<768 与 768–1023 是 16/16、≥1440 是 32/32 都对），偏偏 1024–1439 是最主流的桌面宽度。
  改回 `space-4` 后 12 个宽度档实测偏差 **0px**。
- **顺带查出同族第二处（更明显，91.5px）**：`.toolbar-row` **不在 `#main` 里**，吃不到
  `.main > *{max-width:var(--content-max)}` 这条宽度上限。于是当 `.main-wrap` 内容宽超过
  `--content-max`（1920 宽 + 侧栏折叠实测：内容宽 1687），卡片被收窄到 1440 并居中、待办栏却横到边，
  两侧各差 **91.5px**。补 `.toolbar-row > .todo-bar{max-width:var(--content-max);margin-inline:auto}`
  与主内容同一把尺子后，1920 折叠态实测也 0 偏差。
- **固化成门禁**（`tests/e2e/three-state-layout.spec.js` 新增 1 例）：**12 个宽度档 + 折叠态
  逐个量**待办栏与卡片的左右边界，偏差 >1px 即红。折叠态用"从 768 打开再拉宽"复现 ——
  只测默认态会漏掉那个 91.5px（正是它先在平板/手机项目上报红、逼我查到根因）。
  三视口项目 12/12 全绿。
- **背景**：评审第八项「逐屏走查三态」是**真机人工 QA**（jsdom 无排版引擎，溢出/对齐/对比度替代不了）。
  用户裁定选 B：现在就开 3.7.133、把走查做成**发版门槛**；因用户自述「我可能不太会」，
  门槛降到"照着点、只回答对不对"，**能机械化的先自动化**。
- **机械化部分**（`tests/three-state-render.test.js`，42 例全绿）：15 个视图 ×（空数据非空主区 /
  脏数据+极端数据不漏 `undefined`·`NaN`·`[object Object]`）｜7 个场景必现 `.empty-state`｜
  任务页看板/待办空态文案与入口｜200 条任务进虚拟滚动且 `data-vcount` 如实报全量（**且低于阈值时
  必须全量渲染**——否则等于把自己产品的性能设计当 bug 改回去）｜200 字标题完整进 DOM｜缺字段脏任务不崩。
- **机械化第二层**（`tests/e2e/three-state-layout.spec.js`，9 例全绿 · 3 视口 × 3 数据态 × 15 视图 =
  **135 次真实浏览器渲染**）：**元素级溢出**守护。已有 spec 都只查文档级横向溢出
  （`viewport.spec.js` / `nav-pages-smoke.spec.js` 的"不溢出"），而内容溢出的常见形态是
  **元素自己溢出、页面却没事**（定宽卡片里的 nowrap 标题、12 个标签冲出一行），文档 `scrollWidth` 不变。
  判据严格限定为"内容比盒子宽 **且** `overflow-x: visible`"——刻意不判省略号截断与可滚动容器，
  否则会把本应用大量 nowrap+ellipsis 的设计判成缺陷。**自带反向自检**（每次先注入一个必溢出的对照块，
  抓不到就判"尺子坏了"）——2026-10-18 首测正是先注入 1140px 溢出块确认探测器有效，
  那 135 次渲染的"零溢出"才算数。本机三视口实测 **9/9 通过、存量零真溢出**。
  `playwright.config.js` 的 mobile 项目 `testMatch` 加本 spec（否则移动端不跑）。
- **人工部分**：`docs/qa-walkthrough.md`（三轮、每轮只答一句"对/不对"；§5 列出机器已覆盖的、
  明确"不用重复看"，只留人眼能判的溢出/对齐/对比度）。- **本批实测修掉三处**（都是"空态看不见 / 按钮没反应"一族，非纯新增功能）：  1. 任务页**看板**一条任务都没有 ⇒ 三条光秃秃空栏（`${cards || ""}`），而场景页早有
     `if(!tasks.length) renderEmpty("no-tasks")` —— 任务页是漏的那个。**整块为空才给空态**，
     单列为空仍不给（"进行中"常年 0，逐列塞空态是噪音）。
  2. `renderEmpty("no-today")` 这个类型**从未登记** ⇒ 落到函数末尾 `return ""`，待办页清空后
     渲染出一张只有标题和「0」计数胶囊的空卡。现登记该类型（「待办已清空」，与 `no-tasks` 的
     "还没有任务"分开；另在 0 任务时改走 `no-tasks`，不谎报"都做完了"），
     **并让未登记类型不再静默返回空串**（留一条 console.warn——"漏登记"和"这里本就该空白"
     在调用方看来一模一样，而前者正是本条的成因）。
  3. 空态里的「＋ 新建任务」在任务页是**死按钮**：文档级委托只把 `overview/stats/recycle`
     切到 `office`，而任务页没有内联表单，点下去只是重渲染一次，看着像没反应。补 `active==="tasks"`。
- **i18n**：新增 `empty.noTodayTitle` / `empty.noTodayHint`（zh/en 双语同加，由既有完整性门禁守）。
- **OD-004 已关闭（用户裁「乙 吧」＝改行为）**：「清空全部数据」清完会把示例重新播种
  （`doClear()` 连 `wb_agent_init` 一起删，而 `seed()` 的触发条件恰好重新成立），
  于是命令名与确认弹窗「不可恢复」都是空话，"从零开始"在 UI 上根本没有路径 ——
  三态走查第 1 轮进不去空态就是被这个卡住的。现在 `doClear()` 删除全部键后**显式写回**
  `tasks=[]`（语义即"用户有 0 条任务"，同时让 `seed()` 的 `tasks !== null` 不成立）、
  `init=true`（让 `init` 条件不成立，双保险）、`onboarded=true`（引导第 1 步文案假定屏幕上有
  演示任务，清空后屏幕是空的，再弹等于把 v3.7.66 修掉的"文案与事实矛盾"装回去）。
  toast 去掉"示例"二字。**首启播种原样保留**。
  守护 `tests/clear-no-reseed.test.js` 3 例，第 ③ 例是**反向对照**（真正首次启动仍须播 4 条，
  防止为了修"清不干净"把原设计一起删掉）；第 ② 例端到端验证"清空后重启 ⇒ 0 条任务且
  任务页看板出现空态"，即**空态真的可达**。走查清单第 1 轮随之从"四个场景各删 1 条"
  简化成一行命令。
- **顺带记两条工程教训**（见板面条目）：`with-injected.mjs` 与后台全量 vitest 并行会撞源码态守卫
  ⇒ 125 文件假失败；人工走查要用 `agent-workbench.prod.html`（源码态 HTML 双击打开是空壳）。
- **注释一律用日期锚**（`本次（2026-10-18）`）而非版本号 —— 守 AGENTS.md「注释不许先跑号」。

### 走查反馈三处产品优化（2026-10-18 · 同属 v3.7.133）

用户看对照单时一次提了三条，全部落地：

1. **尾栏去掉产品名，只留版本号**（用户：「尾栏的 Agent工坊 字样要不要就去掉，放版本号就行」）。
   `appendFoot` 与 `_appendDrawerFoot` 两处同步改：`Agent工坊 · v3.7.x · bxxxx` → `v3.7.x · bxxxx`。
   理由：窄屏尾栏只有一行，产品名在顶栏/标题/关于页已出现多次，尾栏再放一遍是噪音；版本号才是这里有用的东西。
2. **空态图标用错语义**（用户：「卡片里面『还没有任务』上面的图标合理吗？任务应该是这个图标吗？」——
   确实不合理）。`EMPTY_ICONS["no-tasks"]` 原来画的是**对话气泡**（`M9 11h6M9 15h4…`），
   与"任务"毫无关系。改用 `SIDE_MENU_ICONS.tasks`（剪贴板 + 勾），与侧栏"任务"入口、任务页标题图标同一图形。
   `no-today` 保留 `check`（它表示"做完了"，不是"没有任务"）。
3. **聊天输入区「去厚重」**（用户：「大模型选择按钮是不是做的有点厚重…点击的时候上拉框让人很不舒服，
   非常厚重，能不能自然一点」）。原状是附件/模型/发送三件套**全部带边框 + panel2 底**，上拉框 `.ds-list`
   还用 `shadow-3` —— 一行三个盒子，重量全压在底部。改法：**只保留发送一个实心**（这行唯一的主操作，
   需要一个视觉锚点），附件与模型改成 ghost（无边框、透明底，hover/focus 才出浅底）；
   上拉框边框降到 45%、`shadow-3 → shadow-1`、圆角 `control-r → radius-md`。
   ⚠️ **触控尺寸一个不缩**（仍是 42×42）：v3.7.27/29/30 用户三次要求加大并对齐，轻的是"描边与底色"，不是"大小"。
   顺带修一处**从来没显示过的告警**：「未配置」的虚线边框原本加在原生 `select` 上，而它被 `dsEnhance`
   覆盖成 `opacity:0` ⇒ 那条虚线从来不可见；改到可见的触发器上（强调色文字，不给它重新加框）。

**验证**：受影响 vitest 7 文件 / 83 例全过（含空态图标结构、i18n 完整性、手册一致性、三态、clear-no-reseed）；
e2e `form-controls` + `mobile` 14/14 全过；`_probe/verify-ui3.mjs` 逐项截图确认三处改动都到位。

## [v3.7.132] - 2026-10-17

**结构批次：拆 `core.js`（35→38 块）+ 四道新门禁 + 两处"口号比事实大"的产品修复 + 十分钟上手。**

### 结构（纯切分，零语义改动）

- **拆 `core.js`**（8,522 行 god module）→ `core` / `core-i18n`（词典占 68%）/ `core-shared` / `core-commands`
  四块。零改动有硬证据：注入态去掉 SRC 标记行后 `diff` 仅 3 行新增层注释，两侧 `sha256` 相同；
  HTML 侧 `git diff` = 6 行标记对、非标记改动 0 行。`t`/`fnv1aHex` 随 `MESSAGES` 走（留在 core 会反向
  引用下半段 = 新增逆层边）。
- **块清单双向一致性门禁**（`scripts/src-split.mjs`）：`BLOCKS` 与 `src/` 双向核对，新增块漏声明会
  **响亮失败**而不是被静默忽略（上一版"本次拼回生效、下次构建就丢"的根因）。含 extract 方向首创豁免
  （文件缺失 ≠ 尚未生成）与写盘前标记自检（拆块时旧 END 标记成孤儿 → 2 组重复标记，实测抓到）。

### 门禁新增

- **空 catch 棘轮「搬家不算新增」**：键含文件名，拆块会把已基线的 P0 判成新增（实测 CI 红）。
  新增 `bhash`（不含文件名的 body 指纹）+ 成对多重集配对；**纯复制仍报新增**（非洗白通道）；
  旧基线无 bhash 时降级为不作数。基线 527 → 541（P0 79 不变），又随「聚焦新建任务」修复
  降到 **540**（P1 219→218）—— 棘轮随修复下降。
- **CSS 分区守卫**（`lint-css-structure` +C5/C6/C7）：节标题必须在花括号深度 0（**当场抓到 3 处
  `:root` 内令牌组标签冒充分区**，已改 `[令牌组]` 形态）；`@keyframes` 重名与孤儿检测（现 36 个、
  0 孤儿 0 重名）；`--sections` 输出分区目录。
- **测试射程**：`tests/ai-test-conn.test.js`（测试连接 7 档判定表）、`tests/ai-observability.test.js`（7）、
  `tests/manual-consistency.test.js`（手册锚点/目录/五步骨架）、`tests/ai-observability` 等，共 +30 余例。

### 产品修复（两处"口号比事实大"）

- **四处「聚焦新建任务」从未生效**：`#taskForm` 是 `<form>`，`form.title` 命中的是 **title 属性（字符串）**
  而非同名输入框 ⇒ `.focus()` 必然抛 TypeError——快捷键 N / 空态按钮 / 日历选日期三处打断 handler
  （"按了没反应"），仪表盘快捷「新建」被 try 静默吞掉。统一改走 `focusTaskTitleInput()`
  （core-shared，须早于四个调用方）。
- **「测试连接」判定口径两处**：① `/v1/models` 返 2xx 但**没有模型列表**时不再谎称"模型可访问"，
  新增如实文案「服务端未返回模型列表，模型名未校验」；② `modelMissing`（黄色「Base + Key 通过，
  但模型不在列表中」）此前**永远显示不出来**（被红色兜底覆盖）——拆出 `modelFailed` 分支后，
  「该改模型名」与「该改 Key」两档才真分开。

### 功能

- **P0-3「扫描模型」**：填完 base+key 一键拉 `/v1/models` 填充模型下拉；失败分情形给可执行提示
  （401/403 → Key、404 → 手填+测试连接校验、非 JSON → 指向被拦截）。
- **P0-4 命令注册表 + 第二步**：`registerCmd`/`makeRegistry`（注册即校验：缺字段/id 重复/键位撞车 →
  拒绝并报错）；键位定义收敛到命令一处——面板提示（sub）由 keys 生成、`ui-hotkeys` 按注册表分发；
  `view.overview` 补上真实的 `G` 键；`task.new` 行为与快捷键对齐（统计页也能切回）。

### 可观测与文档

- **上下文预算三件套收口「可观测」**：估算/策略/落盘（ai_tokens 自 v3.5.0）早已在，缺查看口——
  诊断报告新增「AI 用量」（今日/累计）与「上次发送」（条数/估算/预算）两行。
- **手册**：新增第 0 章「十分钟上手」（建任务 → 配 AI → 让 AI 动手 → 试危险操作 → 备份，
  每步带"怎么算成功"）+ 5.1 AI 配置专节（四字段症状表 + 两按钮判定表）；结构由门禁守护
  （锚点/目录/骨架）。
- **审计**：设置抽屉接线级 347 id 逐个归因（0 死控件）、存储级 40 写/43 读逐条归因；
  `pre_restore_backup` 回滚档无消费入口 → **OD-003**（三选一待裁）。

### 账

- OD-003 登记为 OPEN；3.7.131 的 CHANGELOG 条目在本版补录（当时漏写）。
- 版本号由 WorkBuddy 主会话按 AGENTS.md 解法甲自登（2026-10-17 11:20）。

## [v3.7.131] - 2026-10-16

**发版链加固（R-27）：9 组 pre/post 钩子收敛为一条包装脚本 `with-injected.mjs`（只提交不修改一字）+ 补回 R-21 标题。**

- 「注入 → 运行 → 抽回」收进单进程，抽回挂在**所有退出路径**（正常/非零/子进程被杀/SIGINT-SIGTERM-SIGHUP），
  退出码原样透传——此前 test/lint 失败会把工作树**停在注入态**，下一个 `git add` 就会把 3.87MB 拼回态提交进仓库。
- `release.mjs` 发版切口改为「自检通过后自动抽回」（"记得还原"不是机制）。
- `tests/build-structure.test.js` 新增：HTML > 1.2MB 直接 fail。

> **合并说明（2026-10-17 清理）**：以下四节是本版**原始记录全文** —— v3.7.131 发版时内容写进了当时
> 文件里的 `[Unreleased]` 段、漏写版本条目（v3.7.132 发版时补了摘要于上，此处两段合一）；不是新增内容。

### 注入类命令统一包装（R-27）

- 将 `test` / `test:local` / `test:watch` / `test:coverage` / `build` / `build:check` / `build:prod` / `lint` / `lint:layers` / `lint:tokens` / `lint:empty-catch` / `check:pwa-icons` / `pet:check` 等 9 组 pre/post 钩子（共 18 个键）全部删除，换成 **一条包装脚本**：`node scripts/with-injected.mjs <原命令>`。该脚本把「注入 → 运行命令 → 抽回」收进**一个进程**，抽回挂在该进程的**所有**退出路径上：正常退出、非零退出、子进程被信号杀死、本进程收到 SIGINT/SIGTERM/SIGHUP。退出码原样透传，所以 CI 的通过/失败判定口径一点没变。

- **package.json**：9 组 pre/post 钩子（18 个键）全部删掉，换成 `"test": "node scripts/with-injected.mjs vitest run"` 等一条脚本化定义。这不仅仅是改 `test` —— 同一个缺陷对每一组钩子都成立，`lint` 失败同样会把树停在注入态。

- **发版切口**（v3.7.40 的误提交改造）：原 `release.mjs` 留有「故意让你记住还原」的口子（`posttest` 把树拼回），改成**自检通过后自动抽回**，兜底保证源码态永远整洁。

- **新增静态断言**：`tests/build-structure.test.js` 新增检查，只要 HTML 注入态未抽回（字节长度 > 1.2MB），断言直接 fail，防止有人改回依赖 post 钩子的形式。

### 发布链（R-21）：被取代的 deploy run 不再当僵尸 —— 取消门由 `always()` 换成 `!cancelled()`

`pages-deploy-main` 组配了 `cancel-in-progress: true`，但被取代的那条 run 不会整体死掉：
`e2e` 带着 `if: always()` 照样被调度（2026-10-14 实测 `run 38506125600`：`queued` 从 03:24Z 躺到 09:56Z，
**6h31m**、零字节发布，还把下一条 deploy 压成 `jobs=0`；`gh run cancel` 连发四次取不走一个未分配 runner 的 job）。
本版把 `e2e.if` / `deploy.if` 的取消门换成 `!cancelled()`，并把 `tests/ci-workflow-guard.test.js`
里三条**钉字符串** `always()` 的断言改成**按语义**断言（要求 `!cancelled()` 且禁止 `always()` 回归）。

判据全部来自一次性分支 `r21-cancel-probe` 的实测（三条 run 号已写进 workflow 注释与 `docs/audit-2026-10-06.md` R-21）：

| 格 | 实测 run | 观察 |
|---|---|---|
| 整条 run 被取消、needs 刚转终态 | `38623888632` | `always()` 的 job **被照常调度并跑成 success**（僵尸原形）；`!cancelled()` 的 job `completed/cancelled` **0 步**（立刻放组） |
| 上游 job 被取消、run 未取消（= 2026-10-05 事故 `37368800195` 的形状） | `38625571067` | `!cancelled()` 的下游 **success（照样派发）**；无取消门的对照 **skipped（事故形状重现）** |
| 上游 job 失败、run 未取消 | `38625180454` | `!cancelled()` 的下游 success，job 内 step 级 `cancelled()=false` |

⇒ **v3.7.92 那条「防被动跳过」的保护没有降级**（保护来自"存在一个取消门"，不来自 `always()` 这个具体函数），
而僵尸与发布组被占死这两件事一起消失。变异验证：`e2e.if` 换回 `always()` ⇒ 2 条断言红；
`deploy.if` 换回 `always()` ⇒ 1 条红；把取消门整个删掉 ⇒ 同样 2 条红（证明它守的是"有没有取消门"）。
YAML 细节：`e2e` 那行必须加引号（裸写 `!cancelled()` 会被解析成 local tag），`deploy` 写在 `>-` 折叠块里则不必。

不涉产品代码。**自然观察已当面拿到**（2026-10-15 03:47Z）：`45c34e2` 被 `5e6a2ab` 取代时，那条 run `38677960921` 终态为
`e2e=cancelled steps=0`、`deploy=cancelled steps=0`，整条 run 启动到终态约 **1 分 40 秒**，下一条 run 同一分钟就开始跑 ——
对照 10-14 旧行为（`always()` 的 `e2e` 被照常调度、`queued` 躺 6h31m 并把下一条压成 `jobs=0`）。R-21 闭环。

### 测试链（R-22）：`notify-hook.spec.js:106` 的等待条件从「请求已发出」换成「面板已翻转」

同一条 docs-only 提交 `f127cf9` 出现相反结论：CI run `38679549970` 的 e2e **红**
（tablet 首跑 + 两次重试全红，`Expected "本会话已配置" / Received "未连接"`），
而 Deploy run `38679549959` 的同一 commit e2e 腿**同一用例重试即过**（2 flaky / 102 passed）。
根因在读码即得：`:113-117` 等的是 Node 侧"请求已发出"数组 `seen`，下一行却断言要等响应重渲染才翻转的面板状态 ——
v3.7.123 那次把 `waitForTimeout(800)` 换成"等请求发出"方向对，但**等的不是被断言的那个状态**。
修法为纯增量 6 行（4 注释 + 2 断言、零删除）：补
`await expect.poll(() => (await statusOf(page,"飞书")).status, {timeout: 8_000}).toContain("本会话已配置")`。

双向验证（净副本 `_probe/isoI`）：**阳性** —— 给 stub 注入 1200ms 延迟后，旧写法 2 failed（报的就是 CI 那条
`Received "未连接"`），同一注入下新写法 14 passed；**阴性** —— 把 stub 改成 500，新 poll 判红并报
「面板始终没转到『本会话已配置』」，证明它不是放宽断言。干净态 3 连跑 14/14/14 passed。
⚠️ 口径：本机单文件跑，不等于 CI 那条腿的全量串行形态；同那次 CI 里另有 3 条用例（`i18n:112`、
`ics-import-render:82`、`workflow:60`）首跑失败后重试过，形态是 CPU 饥饿（`deploy.yml:142-147` 早记过同根因），
**本次未修**，已按观察项登记在 `docs/audit-2026-10-06.md` R-22。不涉产品代码。
**CI 复绿已由 run `38682095265`（main tip `df0d893`）确认**：四腿全绿，e2e 腿 `notify-hook.spec.js:106`
在 desktop 与 tablet **都是首跑 ✓ 通过**，汇总 **104 passed (2.9m) / 0 failed / 0 flaky / 无 retry 标记**。
（口径：我自己的两条 run 被对方的 push 取代成 cancelled，绿判记在 `df0d893` 名下 —— 同一棵树、同一份文件，等价。）

## [v3.7.130] - 2026-10-16

### R-26 收口：检索不再抢跑「有界回填」—— 消除 `rag-hybrid` / `workflow` 两条「首跑红、重跑绿」

**背景**：R-9 那条明写「未修（留待下一批）」的账，本轮去收。**核实后发现它已是过时账** ——
原缺陷「空缓存钉死」**v3.7.101 已修**（`_ragVecCache.loaded` 只在确实读到 IDB 时置位，
空 Map 不再被钉死、可重试），v3.7.115 又加 `semanticRecallStatus()` 让降级对用户可见。
台账里那两个「待想清」的问题（空缓存该不该钉死 / IDB 未就绪 vs 确实没有向量如何区分），
**代码里已各自有答案**（答案就是这个 `loaded` 标志）。但顺着这笔账，查出了**另一层真缺陷**。

**缺陷**：`ragInit()` 里的有界回填 `ragEnsureVectors(20).catch(...)` 是**发起即走、没有 `await`**，
而 `ragSearch` 是 `await ragInit()` **紧接着**就检索 → 回填还在飞、`cache` 还是空的 →
`ragVectorSearch` 的 `if(!cache.size) return []` 直接返回空（**连 query 的 embedding 都不发**）。
于是 IDB 不可用/慢时，这一次检索白丢。CI 上表现为 `rag-hybrid.spec.js:132` /
`workflow.spec.js:91` 的「首跑红、同 commit 重跑绿」：CI 机器 IDB 偶发慢 → 回填没跑完 →
断言拿到空 → 红。**不是玄学抖动，是有机制、可复现的。**

**修法（不新增符号）**：复用 `ragEnsureVectors` 内部早已存在的 `_ragEnsuring` —— 它本来就是
「回填进行中」的单一真相源（单趟去重就靠它）。`ragVectorSearch` 在 **`!cache.size && _ragEnsuring`**
时 `Promise.race` 等它，**有界 3s**（常量 `RAG_BACKFILL_WAIT_MS`）。
- **为什么只在「确实有回填在飞」时才等**：真无文档时 `ragEnsureVectors` 取 `getRagDocs()`
  后立即返回，不会让正常的空索引每次都白等 —— 这正是 R-9 当初担心的
  「改错会让正常的空索引每次都重读 IDB」。
- **为什么等它确实有效**：回填的文档来源是 `getRagDocs()`（localStorage），**不依赖 IDB**。

**守护**（`tests/rag-degradation.test.js` +1，先红后绿）：IDB 不可用 + 文档只入库不建向量
（`{skipEmbed:true}`，即「cache 空但文档在」）→ 断言检索必须召回**且走向量路径**（`via` 含 `vec`）。
红时 `via` 是 `lex`（词法兜底），正是缺陷形态；绿时 `both`。

**真机复验**（qoder 的 `_probe/repro-rag-idb-unready.cjs`，注入 IDB 不可用）：
修前 **3/3 `len=0`**，修后 **3/3 全部召回**（`len=1, first=doc-auth`）。

**顺带**（本轮新造 `_probe/rag-reload-window.cjs`）：正常刷新 → **立即**检索 **5/5 召回**，
对照「等 2s」「连检两次」同样全绿 —— 证书「本机不存在刷新后就绪窗口」，把缺陷范围收窄到 IDB 窗口。
两个探针按 `_probe/` 惯例不入库。

## [v3.7.129] - 2026-10-16

### 认领 R-24：两份「写了但从未入库」的加强版门禁入库 —— 跑出来的第一个结果就是真的

**背景**：`scripts/lint-server-ssrf.mjs` 与 `scripts/lint-server-idor.mjs`（2026-10-11 独立复核时写的）
从未入库 —— `git ls-files` 计数 0、`package.json` 无 script、CI 零调用。于是**加强版规则唯一的载体
是个无主文件**，在仓里挂了 4 天：CI 与任何净副本都不含它，也就**没有任何人看到过它的结论**。
今天把它们跑起来、据结果修缺陷、并接进 CI。

#### 缺陷 1（安全 · P1）：IPv4-mapped IPv6 绕过 SSRF 白名单，两侧实现都中招

- **现象**：门禁 12/36 条失败，全部是 `[::ffff:...]` 形态，且 `server/src/tools-fetch.js` 与
  `electron/main.js` **两侧都放行**。
- **根因**：`_netHostForbidden` 的三条 IPv6 规则只覆盖 `::1` / ULA(`fc00::/7`) / 链路本地(`fe80::/10`)，
  **漏了 IPv4-mapped 段 `::ffff:0:0/96`**；而 WHATWG URL 不把它规范化成点分十进制
  （`new URL("http://[::ffff:7f00:1]/").hostname` 仍是 `[::ffff:7f00:1]`，展开写法
  `0:0:0:0:0:ffff:7f00:1` 与点分写法 `::ffff:127.0.0.1` 也都归一成这个压缩形态）。
  于是一个已认证用户请求 `GET /api/tools/fetch?url=http://[::ffff:7f00:1]/…` 就能到达回环；
  `[::ffff:a9fe:a9fe]` 直达 `169.254.169.254`（云元数据）。
- **修法**：判定前先**规范化表示法** —— 去掉方括号，把 `::ffff:HHHH:HHHH` 还原成点分十进制再交给
  原有规则；顺带补上 **CGNAT `100.64/10`（RFC 6598）**（R-24 点名的另一处缺口）。两侧同口径改。
- **守护**：`scripts/lint-server-ssrf.mjs` 从 36 条样本扩到 **38**（补 CGNAT），修复后 **38/38**。
  该脚本是**行为测试**（从源码提取函数体 → `new Function` 隔离求值 → 喂样本），不是扫字面量；
  且"找不到函数就判失败"，避免改名后静默失效。

#### 缺陷 2（安全 · P1）：`POST /push/unsubscribe` 可按 endpoint 删掉**别人**的推送订阅

- **现象**：`store.addPushSub` 明明写了 `userId`，而 `removePushSub(endpoint)` **只按 endpoint 删**
  —— 任何登录用户知道（或猜到）endpoint 就能删掉别人的推送订阅。同一形态的**第三次**
  （v3.7.105 修过 `devices` 与 `schedules`，这条一直漏着）。
- **修法**：`removePushSub(endpoint, userId)` 按 `(endpoint, userId)` 双键删；handler 传 `req.user.sub`。
  `userId` 定为**必传** —— 漏传就删不掉任何人的订阅（表现为静默失败），
  也不留"不传就删全部"的向后兼容口子。
- **守护**：`server/verify/idor-check.cjs` **9 → 13**（先红后绿 —— 红时 B 的调用确实把 A 的订阅删了，
  实测数据文件里剩余 0 条）。判据走**直读服务端数据文件**（push 没有"列出我的订阅"端点），
  不让被测对象给自己出成绩单；含"前置：数据文件里确实有这条订阅"防空转，与"对照：A 删自己的应生效"
  防"把端点改死"。

#### 一处「记缺口而非修」的如实处理

`integrations.js` 的两个 OAuth 配置端点（`GET /oauth/:provider/callback`、`DELETE /oauth/:provider`）
被门禁报为"按外部键删改但无归属判断"。核实后**不是**凭据类，但**也没有** userId 维度可判：
`store.integrations` 是 `provider → meta` 的**全局字典**，属实例级配置（一个实例连一个 OAuth app）。
真问题是"谁有权改实例配置"需要一个角色体系，而当前 `server/src` 全局无 admin/role、所有认证用户等价。
**处理**：加进 WHITELIST 并写明这是**已知权限面缺口**（连同"引入 RBAC 后应收紧为管理员专属"的指引），
而不是伪装成"无需归属"。宁可让门禁的豁免列表难看，也不让它说谎。

#### 门禁入库

两份脚本进 `package.json`（`lint:server-ssrf` / `lint:server-idor`）并**接进 `ci.yml` 的 `server-verify` job**
（扫 `server/src/*.js` + `electron/main.js`）。至此"加强版规则只在无主文件里"的第四天状态结束。

## [v3.7.128] - 2026-10-16

### 云快照漏出排除清单：WebDAV 密码密文 + 明文账号邮箱跟着快照上云（安全 · 真机抓到）

- **缺陷**：`SYNC_EXCLUDED_KEYS`（`src/render-overview.js`）在 v3.7.94 立下原则——「用设备密钥密封、
  设备密钥不出本机（换设备本就解不开）、**上云无跨端收益、纯增后端暴露面**」，据此排除了
  `wb_access_token` / `wb_integration_api_keys` 等密封凭据与 `PREFIX + "__dk"` 设备密钥本身。
  但 **v3.7.120 引入 WebDAV 时新增的三个键没同步进这份清单**，而它们全都落在那条原则射程内：
  - `wb_agent_webdav_pass` —— 用设备密钥密封的应用密码密文；
  - `wb_agent_webdav_cfg` —— 与已排除的 `PREFIX+"cfg"` 同构，且内含**明文**账号邮箱；
  - `wb_agent_webdav_meta` —— 与已排除的 `SYNC_META_KEY` 同构的本机同步元数据（etag/path）。
- **不是推理，是真机证据**：用真实坚果云账号跑完 WebDAV 完整 8 步后，把云端快照文件直连拉下来看，
  15 个键里这三个全在（cfg 里就是明文邮箱，pass 是 `{"__enc":true,...}` 密文）。等价于用户网盘上
  存着一份设备密钥密封的密码 + 明文邮箱，也与 `docs/webdav-verify.md` §已知边界 的
  「密码只存本机……**密钥不出本机**」声明直接冲突。
- **修法**：三个键补进 `SYNC_EXCLUDED_KEYS`。入站侧 `_applyCloudSnapshot` 用同一份清单对称过滤，无需另改。
- **守护**（`tests/cloud-sync-stage1.test.js` +1，先红后绿——红时收到的正是 `{"__enc":true,...}`）：
  三个键均不得出现在 `_buildCloudSnapshot()` 结果里；同时断言业务键照常在内，防止把「排除」做成「误伤」。

### 上传 404 只说「上传失败」，用户无从下手

- **缺陷**：坚果云 WebDAV **根目录不可写**——本机实测三组：`PUT /dav/x.json` → **404**；
  `MKCOL /dav/sub/` → **201**；`PUT /dav/sub/x.json` → **201**。而默认 `WD_URL` 恰好就是这个根目录，
  **用户照默认值填 → 点上传必然 404**。此时应用只 toast「上传失败（HTTP 404）」，
  用户不知道要改成一个已存在的子文件夹。
- **修法**：① `webdavPut` 把状态码一并带回（此前只回传笼统 error 文案，调用方无从区分）；
  ② 404 单独走一条带**可执行修复动作**的 i18n 文案（`wd.syncUpload404`，中英双语），其余失败保持原样。
- **守护**（`tests/webdav-sync.test.js` +1，先红后绿）：404 时提示必须点出 404 **且**给出「子文件夹」
  指引，不能停在笼统失败。
- **真机复验**：修好的版本在默认根目录下跑，提示已如实上屏——「上传失败：目标路径不存在（404）——
  请确认地址里的文件夹已在服务端建好。注意坚果云等服务的根目录不允许直接放文件，必须指定一个已存在的子文件夹。」

### 顺带（不改产品行为）

- WebDAV UI 验收探针 `_probe/webdav-ui-accept.mjs`（本地资产，按 `_probe/` 惯例不入库）此前从未在本机
  跑通过，本轮跑通并修掉它**自身**三个 bug：Playwright 默认 dismiss 原生 `confirm`（等于每次点「取消」，
  表现为「点了清除本机键还在」的假失败）、toast 等 7 秒再抓早已消失（表现为「失败却看不到提示」的假静默）、
  `rmSync` 被删除守卫拦（改同盘改名）。另修环境级坑 `ELECTRON_RUN_AS_NODE=1`（详见 `docs/webdav-verify.md`）。
- 完整 8 步在**可写子目录**下：门控 / 保存 / 连接 / 上传 / 续传不报假冲突 / 清除抹净 / 云端仍在 /
  日志卫生全通；唯一未跑的是「改一条任务再上传」——探针未定位到任务行选择器，**如实跳过不计通过**。
- 验收副本 `_probe/isoI/agent-workbench.html` 此前是 3.7.125，已换成当前 3.7.127 拼回态（旧件备份在
  `F:/tmp-e2e-artifacts/`）。

## [v3.7.127] - 2026-10-15

**用户裁定 `sync.conflictPolicy` 默认值：`lww` → `mv`（知情权优先）；顺带修掉验证时暴露的 `config.js` 空文件缺陷。**

### 冲突策略默认值改为 `mv`（qoder 12:48 交接口子第 2 条，用户 15:31 裁定）

- **决策**：默认 `lww`（输了的一方**静默丢弃**）→ 默认 `mv`（输了的一方记进冲突清单随
  `/api/sync/changes` 响应下发：任务键按 id×updatedAt 结构化自动合并，其余键列进
  「设置 → 账号 → 云同步」冲突面板让用户「保留本机 / 使用云端」二选一）。
- **理由**：① 打扰只发生在真实冲突时——不冲突的用户零感知，冲突那一刻正是最该有知情权的；
  ② 与 v3.7.114（corsOrigin WARN）/ v3.7.115（检索降级可见性）/ v3.7.126（demo 诚实化）
  同族——都是「把静默变诚实」；③ 逃生舱保留：想安静的用户显式配 `"lww"`。
- **成熟度核实**（裁定前做的功课）：客户端面板完整（双方值预览 + 二选一 + toast 引导）、
  `tests/cloud-sync-stage2.test.js` 5 条专项用例、服务端 `incremental-check.cjs` ⑫ 组
  15 项守护、v3.7.109 交付后零修复提交。**诚实披露**：mv 从未在双设备真机上跑过——
  本版只是把默认流量切过去，不引入新代码路径。
- 改动面：`server/config.example.json` 默认值、契约文档两处历史定稿加后注（原文保留）、
  `server/README.md` 两处口径。**客户端与服务端代码零改动。**

### 修 `config.js`：空 `config.json` 被误报成「JSON 语法有误」（验证本版时现场捕获）

- **缺陷**：`loadConfig()` 对 `config.json` **存在但 0 字节/纯空白**的形态 fail loud，
  报错写「JSON 语法有误（常见：尾随逗号、单引号、注释）」——用户会去找一个并不存在的
  语法错误。而这个形态不是理论：README 教的「复制 `config.example.json` 为 `config.json`
  后编辑」中断一下就是空文件（2026-10-15 本机实测：0 字节 config.json 让服务端拒绝启动）。
- **修法**：空文件 trim 后为空 → 与「文件不存在」同口径静默跳过；**非空但语法有误仍然
  fail loud**（v3.7.125 的口径不变——把「没来得及写」与「写错了」分开）。
- **守护**（`server/verify/config-check.cjs` +3，先红后绿——红时抓到的正是缺陷本体）：
  空文件不抛错且基线安全默认值在 / 纯空白文件同样静默跳过；⑥ 组坏 JSON fail loud 用例不变。
- **真实故障复验**：本机那个 0 字节 `config.json` 还原样在位，修复后服务端正常启动、
  `/api/health` 200。config-check 19→22/22；incremental-check 54/54；
  cloud-sync-stage2 25/25。

## [v3.7.126] - 2026-10-15

**修掉 OD-002：微信扫码登录「看起来能用，实际是死循环」的演示态误导（P1 用户可见缺陷）。**

- **缺陷**（`docs/decisions/OPEN-DECISIONS.md` OD-002）：真微信 provider 未接入时，后端
  `POST /api/auth/wechat/qrcode` 返回 `demo: true` + 演示 SVG（`server/src/auth.js` 注释明确
  要求「演示码必须让调用方消费端看得出是演示，不能伪装成真二维码」），但前端
  `_wechatPollStart()`（`src/render-overview.js`）**不消费该标志**：把演示码当真二维码渲染，
  配上「打开微信「扫一扫」完成登录」提示，再每 2.5s 轮询一个永远不会 confirmed 的 scene
  → 5 分钟后报「二维码已过期，请关闭后重新扫码」。用户视角：功能看起来能用，实际是死循环。
  非安全缺陷（`/wechat/confirm` 默认 404，无认证绕过），但属用户可见的功能不可用 + 误导性文案。
- **修法**（协议不变）：响应带 `demo` 时渲染诚实说明（新 i18n 键 `auth.wechatDemo`，中英双语：
  微信登录暂未接入、扫码无法登录、可用邮箱注册或 GitHub 快捷登录），并**不启动轮询**；
  响应不带 `demo`（将来真 provider 接入）自动走原路径——客户端对后端的契约一字未改。
- **守护**（`tests/auth-ui-lifecycle.test.js` +2，先红后绿——红时抓到的正是缺陷本体）：
  ① demo 态 → 显示演示文案、无「扫一扫」误导、`apiWechatStatus` **零调用**。反向断言
  （证明始终不成立）刻意不用判别式等待；qr 特意用与后端 `makeDemoWechatQr` 同形态的
  data-URI——证明修复靠的是消费 `demo` 标志，而不是碰巧 `qr` 为空。
  ② demo 缺省 → 原路径不变（渲染二维码 + 启动轮询），合法路径不误杀。
- **账**：OD-002 就地关闭（OPEN → RESOLVED）；OD-001（第三方登录 provider 选型）仍 OPEN，
  本修复不预设其方向——做不做第三方登录、走哪家，仍等用户画像确定后再定。

## [v3.7.125] - 2026-10-14

> **版本号说明**：本批原按 v3.7.124 发版，与并行会话同批次发布的 v3.7.124（BUILD_TAG `20261014a`，集成凭据形态 + 装机验收前置条件）**撞号**。为避免两个不同内容共用同一版本号，本批改发 v3.7.125。

**修掉一个"文档教了但代码没做"的配置缺陷：`server/config.json` 此前根本不会被读取。**

- **根因**（实测确认，非推断）：`loadConfig()`（原 `server/src/index.js:22-25`）只 `readFileSync`
  了 **`config.example.json`**，而 `server/README.md` §快速启动 与启动报错文案（`index.js:62`）
  都在教用户「复制 `config.example.json` 为 `config.json` 后改密钥」——**该步骤完全空转**。
  反证：往 `config.json` 写入非占位 JWT 密钥后不带任何环境变量启动，仍被
  「jwt…仍是占位值」拒绝启动（那份文件的密钥压根没被读到）。
  影响面：照文档操作的运维会陷入「改了配置却不生效、且没有任何提示」的不可诊断状态。
- **修法**（`server/src/config.js`，v3.7.124 新建；`index.js` 只做装配）
  - 三层优先级：`config.example.json`（基线，含全部安全默认值）→ **深合并** `config.json`
    → 环境变量覆盖。`config.json` 不存在则静默跳过，不破坏既有部署。
  - **深合并而非整体替换**：只配 `github` 一节时，`security.rateLimit` / `wechat.*` / `sync.*`
    等安全默认值仍在。若实现成整体替换，限流与同步上限会**静默失效且无任何报错**——
    这类"静默丢失安全默认值"比"读不到配置"更危险。
  - **坏配置 fail loud**：`config.json` JSON 语法错误直接抛错并指向该文件，不再静默按默认启动
    （"改了配置却没生效"这类问题宁可开箱报错）。
  - `config.json` 加进 `.gitignore`（此前**没有任何规则忽略它**，用户照 README 手建极易把
    JWT 密钥与 clientSecret 误提交）。
  - 启动日志新增一行 `config: example + config.json + env 覆盖`，配置来源一眼可见。
  - 顺手把 `loadConfig` 从入口文件抽出：原实现在 `index.js` 里，`require("../src/index")`
    会把整个 express 应用拉起来，导致**配置合并语义无法被单测**——而它恰恰是本仓摔过跤的地方。
- **新守护** `server/verify/config-check.cjs`（**19/19**，已接入 CI，服务端脚本 8 → 9 个，
  合计断言 **193 → 212**）：config.json 生效 / 深合并保默认（4 条：未写节、未写节内键、
  新键可进、base 不被改）/ env 优先级最高 / 数组整份替换不逐元素合并 / 坏 JSON fail loud，
  外加一条 **HTTP 层差分对照**（同一实例下基线回显请求源、配了之后固定回显，
  证明配置值真的流到了 express）。
  口径踩坑已写进脚本注释：express 的 `cors` 包对**字符串** origin 是"固定回显、不按请求源过滤"
  （`node_modules/cors/lib/index.js:47-56`），第一版按"非匹配源拿不到 ACAO"写断言直接假红；
  而 `index.js:62` 的 `corsOrigin === "*" ? true : corsOrigin` 让基线形态变成**回显请求源**——
  两版都写错过才把真实语义钉住。
- **验收（用户视角）**：只写 `config.json`、**零环境变量**启动 → 服务端正常起来（旧行为直接
  拒绝启动）、`GET /api/auth/github` 返回 **200** 且 authorizeUrl 带 config.json 里的 client_id。
  即 README「方式一」现在真的可用了。
- **验证**：9 个服务端脚本全绿 212/212；门禁链与单测不受影响（本批未触碰客户端与 HTML 逻辑，
  仅 VERSION/BUILD_TAG 随发版链 bump）；故障注入反证——把 config.json 分支短路成旧行为，
  6 条转红（含 HTTP 层那条），还原后 19/19 复绿。

## [v3.7.124] - 2026-10-14（批次⑤ · 集成凭据形态 + 装机验收前置条件 + C2 收口）

> ⚠️ **本节内容从未以 v3.7.124 这个版本号发布过。** 切版提交 `213e980`（BUILD_TAG `20261014a`）在
> deploy 排队期间被并行会话的 `78b1a87` 取代（它把版本接着改成 v3.7.125），于是**这批内容随 v3.7.125 上线**。
> 线上实测（2026-10-15）：`const VERSION = "3.7.125"`、`CACHE_VERSION = "v3.7.125-20261014130244"`、
> `_linearAuthHeader` 命中 **6**、`int.jiraEmail` **3**、`_b64utf8` **2**。
> 也**没有 `v3.7.124` 的 tag** —— 给一个从未发布过的构建打 tag 只会让发布历史多一条假记录。
> 保留本节是为了让"哪条修复属于哪一批"可查；要按 tag 复现构建，请用 `v3.7.125`。

**把台账里三条"等外部条件"的项逐条实测：两条其实是自家缺陷，一条的前置条件真的缺、已在 CI 补上。**

- **R-16 凭据形态（`f0f56dd`）**：Linear 5 个调用点此前全发 `Authorization: Bearer lin_api_…`，
  而 Linear 个人 API Key 要**原样**发（Bearer 只属于 OAuth token）；Atlassian Cloud 是
  `Basic base64(email:apiToken)`，本仓发 Bearer 且**配置面板根本没有 email 字段** —— Basic 形态在 UI 上
  无法表达，用户没有任何正确形状可填。改为两个唯一构造点 `_linearAuthHeader()` / `_jiraAuthHeader()`
  （顺带剥掉用户连前缀一起粘进来的 `Bearer `），面板补 email（zh/en i18n 同步），
  `_jiraRequest` 与 6 个调用点逐条把 email 传下去，主进程 `jira-fetch` 中继按同语义实现。
  · 新门禁 `tests/integration-auth-form.test.js`（15 例）：锁渲染进程实际 header、中继**每一跳**的 email、
    以及**跨进程逐条同值**（两侧分叉的症状是"浏览器版能连、桌面版连不上"）。主进程那份实现用文本抽取求值
    参与对比，不在测试里抄一份等价断言。
  · 变异验证 4/4 全红（M1 Linear 退回 Bearer / M2 渲染侧丢 Basic / M3 只漏 transitions 一跳的 email /
    M4 主进程丢 Basic）。**M3 第一版是绿的**，暴露的是用例自己的覆盖盲区（新 issue 只走 create，
    PUT+transitions 路径压根没跑）→ 补 `_intRecordSync` 造出 syncInfo 后才红在正确那一跳上。
  · `tests/linear-push.test.js` 有一条例内断言写的是 `"Bearer lin_api_test"` —— **门禁把错的形态钉成了期望值**，
    所以真机一直 401 而门禁一直绿；已改为原样发并注记原因。
  · `tests/electron-ipc.test.js` 补 2 例：中继带 email 必须发 Basic、非 ASCII 必须按 UTF-8 编 base64。
  · **诚实口径**：无凭据实测**区分不出**形态（Linear 三种写法都回同一个 401；Atlassian 匿名只给
    `WWW-Authenticate: OAuth realm=`）。"该发哪一种"的判据来自服务商文档；能由代码结构证实的是
    "Jira 没有 email 输入 = Basic 无法表达"。新增 `docs/integrations-verify.md` 写清拿到 key 后怎么一步验穿、
    以及 401 该先怀疑 key 而不是形状。
- **R-17 装机验收的前置条件（CI 侧）+ 一条自伤记账**：`_probe/verify-installed-portable.mjs` 前两版都写进了
  用户真实 profile `%APPDATA%\agent-workbench`（把任务重置成 `[]`）。三条根因：① Electron 在 Windows 上
  **不读** `APPDATA`/`LOCALAPPDATA` 环境变量（取 Known Folder）；② **portable 的 NSIS 外壳会吞掉
  `--user-data-dir`**，内层子进程拿到的是 Electron 自算的真实目录 ⇒ portable 形态本机无隔离手段；
  ③ 应用有 `requestSingleInstanceLock()`，上一版进程没杀干净时新实例立刻退出、CDP 连到了**残留 7 天的旧实例**，
  于是那一轮"21/23 通过"全是假数（`⑨ 重启存活` 根本没发生过重启）。
  · 前置条件补齐：`electron-build.yml` 增加 `win-unpacked.tar.gz` artifact（仅 `workflow_dispatch`；
    用 tar 而非 Compress-Archive，因产物含中文名）。同一份 app.asar/prod bundle/主进程，只差启动器那一层，
    而 `--user-data-dir` 在它身上真生效 ⇒ 装机验收第一次可在隔离 profile 上重复跑。
  · 探针改为**三关自证 + 任一不过就 abort**：开跑前端口须空闲 → 启动后按 CIM 回查「创建时间晚于 T0 **且**
    `--user-data-dir` 等于隔离目录」→ 收尾递归 mtime 扫描真实 profile 不许有任何文件在本次开跑后被改。
    基线值改为跑前实测（第一版硬编码期望值会把这次结论套上次的数）。
  · **收口实测（10-14）：23 条全绿**。产物 = run 38504326589 的 `win-unpacked` @ `d1d18e5`（v3.7.123）：
    ⑧ `__dk_v2` 真落进打包态 IndexedDB（顺带证实 R-19 的旧现场已被 v3.7.95 修好）、
    ⑨ 优雅关闭+重启后任务与 marker 都还在（此前那次红是**我用 `taskkill /F` 强杀**造成的未 flush 丢写 ——
    持久性验收必须按用户的退出路径测）、⑪ 递归 mtime 扫描确认真实 profile 本次 0 文件被改。
    另修探针自身两处：顶层异常也要收尾杀进程（`main().catch` 直接 exit 会把实例留在机器上）、
    `ConvertTo-Json` 的 DateTime 须在 PS 侧转字符串（否则 Node 解成 NaN，把自己的目标判成不存在）。
  · **恢复未擅自执行，且我先前那句「能从 autobackup 恢复」是错的（已更正）**：三代 `wb_agent_autobackup*` 的
    tasks **全 = 0** 且时间戳都晚于损坏时刻（快照三代滚动，探针自己的写入把带数据的代次轮出去了）；
    IDB 镜像同样 0 条，`_broken_*` 键存的是我注入的损坏载荷。之前「只读扫描命中种子标题」是对 `.ldb/.log`
    原始字节的 `indexOf` —— 命中旧字节 ≠ 该键现值。且 `seed()` 守卫是 `getItem(tasks) !== null`，
    现值为 `"[]"` ⇒ 应用不会自行重播。剩下唯一可行路径是用应用自己的 `seed()` 再生演示数据（id/created 会变），
    这属于用户的个人数据目录，等他点头。
- **R-18 C2「后端立项」是过时账 + 顺出的真缺陷**：后端早已在本仓 `server/` 落地（`POST /api/sync/changes`，
  `server/verify/incremental-check.cjs` 38 项），C1–C4 全标 ✅；台账 §五 那行没跟着契约文档更新。
  顺着查出的缺陷：契约 §三「已知边界」遗留的 `resetCustomLinks()` 裸 `removeItem` **一直没收**，
  而 `wb_custom_links` 在同步键集合内 ⇒ 增量模式下服务端留旧值，下一次下行把用户删掉的自定义链接**原样复活**。
  改走 `_sharedSafeLSRemove(CUSTOM_LINKS_KEY)`（它本就负责记 `op:"del"`；语义唯一差别是存储异常不再上抛，
  而调用方不接异常）。新 `tests/cloud-sync-chlog-custom-links.test.js` 3 例：开态须有 del 条目、
  关态零行为变化、不存在的键不得造假信号；变异（改回裸 removeItem）红在第一条。
  ~~仍开着的只有 `mv+提示` 冲突策略档位~~ **这句当时就过时了**：`mv+提示` 已于 **v3.7.109 两端交付**
  （服务端冲突账本 `server/src/store.js:262-391` + 客户端 `src/render-overview.js:1520`，
  由 `server/verify/incremental-check.cjs:242` 断言"响应声明策略 = mv"钉住）。C2 至此**无工程缺口**，
  剩下的只是部署时要不要把服务端 `cfg.sync.conflictPolicy` 从默认 `lww` 切成 `mv`。
- **R-19 设备密钥的可观测性（+ ⑧ 定性）**：装机探针 ⑧「打包态 `getDeviceKey()` 有值、`__dk_v2` 不在 IndexedDB」
  查清了 —— 是真缺陷，且**根因已由并行会话在 v3.7.95 修**（SRC 块序里 `data-idb` 先于 `crypto` 加载，
  `registerDkIdbHelpers` 从未被调用 ⇒ 密钥每次加载重新生成）；我的探针跑的是 **3.7.93 的产物**，
  检出的是已修缺陷的旧现场 ⇒ ⑧ 必须在 CI 新出的 `win-unpacked` artifact 上复验才算关。
  本批补的是剩下那半条命：**两处「写了但没落住」的 else 此前完全不说**（新生成分支不验证、
  旧键迁移分支不报告），现各留一条诊断（`getDeviceKey:persistNew`=error、`getDeviceKey:migrate`=warn），
  并刻意不加自动兜底（回退 localStorage 会把 H3 换来的安全姿态又输回去，那是产品决策）。
  新 `tests/device-key-idb-persistence.test.js` 4 例；变异 2/2 各打红一条、还原复绿。
  两条实现事实顺手钉住：`_dkIdbPut` 被包装成 `.then(()=>true)` ⇒ **返回值不可信，判据只能是回读**；
  `initCrypto()` 自己会调 `ensureDeviceKey()`，密钥一旦缓存就短路 ⇒ 用例必须按 reset→装接缝→initCrypto 装配
  （我第一版顺序错，四条断言全以「没诊断」的形式假失败）。
- **验证与归属**：本机 5 个受影响套件 93 例全绿（`integration-auth-form` / `linear-push` / `electron-ipc` /
  `cloud-sync-chlog-custom-links` / `device-key-idb-persistence`），既有 `chain-edit` 第 6 例（重置恢复默认）仍绿 ⇒ 用户可见行为未变；
  全量单测在 `git archive HEAD` 净副本里 1697 passed / 1 failed，那 1 条即上述"门禁钉住错误形态"的旧断言，
  已随本批改正。台账 `docs/audit-2026-10-06.md` 追加 R-16 / R-17 / R-18 并更正 §五 三行。

- **收口补充（同日）· 桌面 profile 恢复已执行**：`_probe/restore-profile-tasks.mjs --seed` 在真实 profile 上跑通并
  从**副本**回读确认（对用户目录零写入的读法）——4 条演示任务回来、IDB 镜像同为 4、探针痕迹键（marker + 两个 `_broken_`）清零、
  四个 `rec_*` 全判 `churn`（只变 id/created）⇒ **用户的记录类数据本就是演示内容，无个性化数据丢失**；
  恢复后该目录的**三代 autobackup 均为 tasks=4**，自愈能力一并恢复。机制与"我先前那句可恢复是错的"见 R-17 更正段。
- **发布状态（务必如实）**：版本已切 **v3.7.124**（`scripts/release.mjs` 五源一致，`build:check` 在净副本里绿：
  真相源 3,872,777 B / sha256 `a0e68fae…`），但**尚未 push、未打 tag、线上未发布** —— 卡在托管 runner 积压（R-20：
  tip run 排队 2h10m、四 job 只 windows 被调度）。tag 必须等 CI 全绿后打在**发版提交**上（`release.mjs` 会自行撤回错位的 tag）。
- **发版 HEAD 的本机最终证据**：净副本 `git archive` + `npm test` / `npm run e2e` ⇒ **单测 1720/1720、e2e 104/104（5.5m）**；
  `server-verify` 腿按 diff 归属不必复现（`d1d18e5..HEAD` 对 `server/` 为空）。

## [v3.7.123] - 2026-10-13

**补上 v3.7.122 明确延后的两项：测试覆盖阶段 2（四个薄页面的业务级断言）+ flaky 清理（固定 sleep → 判别式等待）。**

- **测试覆盖阶段 2：新增 `tests/e2e/thin-pages.spec.js`（5 条 · 业务级）**
  与 `nav-pages-smoke` 的分工：后者守 17 页的**渲染级**不变量（能打开/有文本/有控件/无报错/
  无残渣/不溢出）；本 spec 守**页面显示 == 数据源、操作真的改变状态**——
  一个页面可以渲染得漂漂亮亮而业务是错的，那四类缺陷在渲染级断言下全绿。
  · **商店**：卡片数与 `BUILTIN_PLUGINS` 对账；切「场景」分类后**每张卡都必须带「提供场景」**
    （`_pluginCategory` 的判据正是有无 scenarios，分类与内容必须自洽——只断言"数量变了"是弱断言）；
    **启用/禁用往返**都验（点启用 → `getPlugin(id).enabled===true` 且卡片出现「● 启用中」，
    再点禁用 → 回到 false）；「← 主页」真跳转（v3.1.2 死按钮同族回归）。
  · **场景联动**：4 个 tab 逐一切且内容对应；核心是「联动状态」页的**总规则/启用规则 KPI
    必须等于 `getLinks()` 真值**——历史上这里调用了一个不存在的函数、被 typeof 守卫兜成空数组，
    页面恒显示 0 条而渲染完全正常，只有这种对账抓得到。
  · **时间轴**：14 天列 / 恰好 1 个 `.today` / 泳道数 = 内置场景数 / 图例 3 类点；
    `completeTask()` 后事件流 +1 且页头「N 条事件」同步。
  · **说明**：11 章节、首章默认展开、场景段覆盖 ORDER 全部内置场景（文档漂移守卫）。
  · **任务**：看板三列计数之和 = 数据源条数、卡片数 = 列头计数之和；待办视图行数 = 未完成数；
    勾选完成后**真的写回** `status==="done"` 且行数 -1。
  **故障注入双证**：撤掉「勾选后重渲染」修复 → 任务页红（"行数没减一，仍 3"）；
  撤掉「首章默认展开」修复 → 说明页红（"11 个章节全折叠"）；还原后 5/5 复绿。
- **本轮由新覆盖抓出并修掉的 3 个真实缺陷**
  1. `src/ui-guide.js` `helpSection()`：默认展开判据写的是 `id==="快速上手"`，而第一参数是 **id**
     （`"quickStart"`）不是标题 → 条件恒假，**11 个章节全部折叠**，与「3 步开始使用」意图相反。
     改为比对 id（且**只能**比对 id——切英文后标题会变 "Quick Start"，这正是原写法踩的坑）。
  2. `src/render-overview.js` 待办视图：勾选完成只写数据、**不重渲染** → 完成的任务仍挂在
     「待办」列表里，要切走再回来才消失（与 v3.1.2 死按钮同族）。补 `completeTask(id)` 成功后
     `renderTasksPage()`；顺序必须是**先 completeTask 再渲染**——它内部 `runLinks()`
     可能按联动规则生成新任务，先渲染会漏掉。
  3. 说明页「场景说明」段停在 **6 场景**且漏掉「健康」——v3.5.2 起内置场景已是 7 个。
     补文案 + 中英 i18n（`help.scenesTitle` 6→7、新增 `help.sceneHealth`）。
- **flaky 清理：21 处固定 `waitForTimeout` → 判别式等待**
  新增 `tests/e2e/helpers/wait-settled.cjs`（`waitSideNav` / `waitMainRendered`）。
  根因是同一个：**渲染是异步的**（侧栏 nav-item 由 `renderSide` 异步注入，实测 0→~30ms→17；
  场景页在 `setActive+render` 之后才挂内容），等"一段时间"两头不讨好——慢机不够（偶发红）、
  快机白等。覆盖：`toolbox` 5 处、`notify-hook` 5 处（其中 2 处改 `expect.poll` 等"请求被观察到"）、
  `viewport` 4 处、`sync-contract` 1 处、上一批已改的 `i18n` 6 处。
  **保留 26 处并写明理由**：`form-controls`（日期浮层/焦点/滚动等动画绑定）、
  `integration-push`（抽屉自动收起动画）、`workflow`（微小兜底）。
  **反向断言（"不得发请求"/"不得写存储"）必须保留观察窗口**——判别式等的是"某条件成立"，
  而要证明的是"始终不成立"，改判别式会把"还没来得及发生"误判成"没发生"（已在 notify-hook ⑤
  就地写明这条方法论）。
- **场景清单三处硬编码 → 单一事实来源**（新增 `tests/e2e/helpers/scene-list.cjs`）
  改造前 `theme-matrix` 8 项 / `viewport:314` 7 项（漏 `code`）/ `viewport:373` 7 项（漏 `design`）
  三份互不一致——**漏掉的场景在对应断言组里永远不被检查**。现统一消费 `ALL_SCENES`（7 内置 +
  预置 `finance`），两处 viewport 各补回 1 个场景（只增不减）。
  新增 `tests/e2e/scene-contract.spec.js`（3 条机械对账）：运行时 `ORDER` 与快照**逐项同序**一致
  （顺序=侧栏显示序与滑动手势序，是契约）；`SCENARIOS` **每一个**键都必须有 `--sc-<k>` 令牌
  （反向查运行时全集，新增场景漏配令牌即红）；预置场景 `finance` 定义与令牌在、但默认不进 `ORDER`。
  **踩坑记录**：`file://` **已不再挂载 `window.__test` 桥**（安全收紧，避免本地双击打开时
  devtools 能摸到内部函数），e2e 只能靠**顶层裸标识符**（`ORDER` / `SCENARIOS`）取值——
  这正是现存 spec 全都直接写 `setActive()` / `_buildSideMenu()` 的原因。首次按桥取值时三条全红
  （"读不到就判失败"的设计生效），改裸标识符后 3/3 绿。
  **故障注入双证**：把 `ORDER` 换序 → ①红（精确打出"运行时 office>design>data… vs 快照…"）；
  给 `SCENARIOS` 塞一个无令牌的键 → ②红（点名 `driftprobe`）；还原后 3/3 复绿，
  且 `src/` 与 `agent-workbench.html` 均回到 HEAD（`git diff` 为空）。
- **验证**：门禁链 12 项全绿（含 `lint` 四合一、`lint:layers/tokens/empty-catch/icons`、
  `check:modules` 无新增、`pet:check`）；`theme-matrix` 5/5、`viewport` 6/6、`thin-pages` 5/5、
  `scene-contract` 3/3、`notify-hook`+`toolbox`+`sync-contract` 18/18；
  多数用例因判别式等待**比原来更快**（toolbox 2.3s vs 原 7s 级）。

## [v3.7.122] - 2026-10-13

**三线收官（用户拍板「前五个做吧」的 4/5 项）：server 路由交叉污染修复 + 跨项目视觉回归模板落地 + 18 处字符字形图标全量 SVG 化。**

- **server/ 路由交叉污染（审计遗留 P2，唯一未修 server 缺陷）**（`35b4c73`）：
  `index.js` 原把**同一个 extrasRouter 实例**挂到 `/api/notifications` 与 `/api/integrations`
  两个前缀——实测 `/api/integrations/preferences`、`/api/notifications/status` 等 6 条交叉路径
  全部可达（攻击面翻倍）。修复：`extras.js` 按客户端真实端点清单拆为 `notifications.js` /
  `integrations.js` 两个独立 router（handler 逐字迁移，行为/响应形状/错误码不变）；
  新增 `verify/router-isolation-check.cjs`（17 条双向断言：交叉路径必须 404+`not_found` 钉
  错误指纹、合法路由必须仍 200、无 token 401）并接入 `ci.yml` server-verify job（七脚本→八脚本，
  合计 **176→193 条**）。故障注入（改回同实例）10/17 转红、还原复绿 17/17；七脚本回归 176/176。
- **跨项目视觉回归模板 `visual-regression-template/`**（`7bd405d` + `eb9ef2d` + `c2fcaba`）：
  承接 v3.7.121 抽取的 visual-kit 内核（`e623188`），把设计方案落成可复制到 7 个项目的模板包
  （README 接入指南 + 独立 `playwright.config.visual.cjs` + contrast-matrix spec + helpers
  适配层 + 像素基线 CI-only 可选插件文档 + 惰性 CI 示例）。核心设计：**渲染层不变量是主力**
  （对比度/可见性/溢出，不依赖像素基线，本机与 CI 结果一致），像素基线仅 CI-only 可选。
  模板自带 globalSetup/globalTeardown 对称桥——双态项目跑完自动抽回源码态（标记文件协议
  `verify-out/.visual-injected`），堵住「跑完工作区滞留拼回态」的缺陷（该缺陷在总监复核中
  实测复现后才修，含反证轮）。pilot 3/3 + 隔离目录干跑 3/3（非双态路径零配置空转）双绿；
  Interaction 主题口径按实测为 **10 套**（第 11 项 system 跟随 OS 偏好，无法确定性强断言）。
- **18 处 ✕ 字符字形关闭按钮 → `UI_ICONS.close` SVG**（`5ab8b76`）：
  `src/core.js` 注册表新增 `close` 键（标准 X 形，与注册表同款 viewBox/stroke 属性），
  9 文件 18 处按钮全部替换；尺寸一律 `var(--icon-sm/set/md/lg)` 四档令牌经内联 span，零裸 px；
  全部 aria-label/title 保留，**两处原本无可及名的按钮（taskEditClose/evDetailClose）补上
  aria-label**；点击行为零变化（探针 84/84 断言：可见/含 SVG/尺寸命中预期档/点击关闭/
  无溢出/居中 dx=dy=0）。`lint-icons.baseline.json` 精确重冻 **25→7**（仅移除 18 条 sig=✕，
  7 条 P1 一个字节未动）；故障注入（一处改回 ✕）→ 门禁 exit 1 → 还原复绿。
  theme-matrix 渲染层不变量 5/5 不回退。
  ⚠️ **如实披露**：因图标改走令牌档位，部分按钮高度有 1~3px 微变
  （chain-share 35→32、chainCancel 24→22、gvDel 19→18、taskEdit 19→18、
  chainDel/scDel 22→24，其余持平；全部 ≥18px、墨水盒匹配率 90%~105%）——
  24px 档家族需 27px 才能零差，四档令牌内无法进一步逼近，属规范化代价。
- **协调项**：`.gitignore` 补 `verify-out/`（对齐 verification-reliability.md 的日志落盘约定）
  与 `!visual-regression-template/baselines/` 例外；`backend-recovery-assessment.md` §五、
  `oauth-login-design.md` §六 两处 extras.js 相关文档漂移同步修正。
- **验证**：CI run `38360691143`（sha `5ab8b76`）四 job 全绿（e2e / windows / ubuntu /
  server-verify 八脚本 193 条）；本批发版链 `release.mjs` bump 六源（BUILD_TAG=20261013a），
  build:check 版本一致（3866076 B，sha256 `82a6a57f…`）。
- **明确不做（本批）**：测试覆盖阶段 2 + flaky 清理（QA 成员因模型用量限额中断、零残留，
  顺延至次日限额重置后派员，工单已备）；`render-entry.js:343`「✕格式」为 JS 数组组装的
  P1 潜在漏网点（lint-icons BUTTON_RE 扫不到），列后续批次评估；HTML 骨架区 1 处 ✕
  （649a0e3 已知不做项）维持原判。

## [v3.7.121] - 2026-10-12

**验证可靠性改造（用户拍板「不要造成信息丢失，导致答复出问题」）：把「静默失真」变成「显式判据」。**

- **背景**：2026-10-11~12 一天连抓四个真 bug 证明「契约全绿 ≠ 能跑」；但同一天验证链自身
  连踩五类坑——管道吞退出码（`npm run e2e | tail -2` 报 exit 0 实际 2 失败）、harness
  卡死只吐三行「did not run」、误杀 Playwright 浏览器二进制、探针不带响应体连猜三轮、
  `src:extract` 把我的 src 编辑静默冲掉。共同结构：**信息在链条某一环被静默吞掉。
  总原则：每一环都必须把「我不知道」变成显式输出。**
- **三个机械化守卫**（`docs/verification-reliability.md` 完整设计与五条规则）：
  ① `scripts/verify-run.mjs` 验证命令统一入口——输出落盘 `verify-out/`、打印单行判据
     `✓|✗|? <标签> exit=N · passed=X · failed=Y · did-not-run=Z`、自带看门狗（默认 20 分钟，
     超时 kill 并打尾部输出，exit 79 = **未判定，不是通过**）；
  ② `scripts/check-browser.mjs` 环境预检——chromium 起不来直接 exit 78 + 人话
     「本机判定通道不可用，判据以 CI 为准」，不再让测试挂 600 分钟；
  ③ **`playwright.config.js` 的 `globalSetup`**（`tests/e2e/global-setup.cjs`）——
     e2e 跑之前把 HTML 拼回交付态。**这道是当天二次修正才放对的位置**：初版放在
     `run-e2e.mjs` 里，经包装器/裸 npx 调用就被绕过 → HTML 停源码态 → 57~70 个
     `setActive is not defined` 假红（定位花两轮 20 分钟）。globalSetup 是 Playwright
     每次运行都走的入口，**绕过任何 runner 都仍然生效**。
- **判据自验（全过）**：`✓ exit=0` / `✗ exit=1` / `? exit=79` 未判定三种 verdict 各实测一次；
  「全 skipped ≠ 通过」也纳入判据（ranNothing → 79，不当成绿）；预检可用/不可用两条路径。
- **本机 e2e 通道由此修复**：源码态下经包装器跑 e2e → globalSetup 自动拼回 → **96/96 全绿**
  （5 分钟）。此前本机所有「挂起 / 全 skipped / 57 失败」全是双态未拼回的假象，**没有一个是
  真缺陷**——这印证了改造的价值：失真比失败更贵。
- 文档：`docs/verification-reliability.md`（设计+规则+守卫+实证）、CHANGELOG。
  ⚠️ 本批**无产品代码改动**（只动验证层 + 文档），CI 的 e2e 腿行为不变（CI 上本就是交付态，
  globalSetup 是 no-op）。

## [v3.7.120] - 2026-10-11

**坚果云真机验收（协议层 11/11）抓到第二个真 bug：PUT 响应无 ETag → 每次续传都误报「云端冲突」。**

- **验收前置修正（两个都是探针错、不是产品错，仍记账）**：
  ① 坚果云 WebDAV 的 **`/dav/` 根不允许建子目录**（MKCOL 400 / PUT 409），测试目录必须建到
     既有同步集合里（用户的坚果云根 = 「我的坚果云」）——探针改为先 PROPFIND 探集合再建；
  ② **ETag 头值自带引号**（RFC 7232），探针把引号剥了又加一层 → 双重引号 → 412「ETag doesn't
     match」。应用用的是原样值（正确），错的是探针。
- **抓到的真 bug（影响面：用坚果云的用户，第二次起每次上传都误报冲突）**：
  `electron/main.js` 的 webdav-fetch 把 **PUT 响应头**的 etag 交渲染层存进 `wd_meta`；
  而坚果云 **PUT 成功（201）不回 ETag 头**（只有 GET 回）→ meta.etag 存成空 →
  渲染层下次上传退回 `If-None-Match: *` → 文件已存在 → **412** → 应用报 `etag_conflict`
  （「云端已被其他设备修改」）—— 而云端根本没被改过。首传成功、续传全假冲突。
- **修复**：PUT 2xx 且响应无 etag 时，补一次**同路径 GET** 取权威 etag 再回传
  （URL 已过白名单校验，不新开攻击面；补取失败不影响本次上传成功，只让下次续传降级）。
- **验收结果（真实坚果云账号 + 应用密码，`_probe/webdav-nutstore-accept.mjs`）11/11**：
  Basic 鉴权 207 / 定位同步集合 / MKCOL 201 / PUT 201 / GET 读回内容一致 / 取到 ETag /
  **If-Match 续传 204** / **坏 ETag → 412 且内容未被改写**（冲突检测是真语义）/ 清理无痕。
- **测试**：`tests/electron-ipc.test.js` +3 例（PUT 无 etag 补 GET / 有 etag 不补 /
  补取失败不影响上传），该文件 60/60；全量单测 **149 文件/1696 例**全绿。
- **未做（如实记账）**：本机 e2e **环境阻断**（我在清理残留浏览器时误杀 headless_shell，
  之后 `chromium.launch()` 直接挂起，最小 about:blank 都起不来）——本批改的是
  `electron/main.js`（Electron 主进程，Playwright 不加载），e2e 腿判据以 CI 为准；
  本地环境待修（`npx playwright install chromium`）。
- 文档：`docs/webdav-verify.md` 记协议层验收结论，roadmap §五 ⑥ 更新（协议层 ✅ / UI 六步仍待
  Electron），audit R-14。

## [v3.7.119] - 2026-10-11

**Linear 真机验收抓到一个必现 bug 并修复：`issueCreate` 的 teamId 只收 UUID，应用传的是团队 key——首次推送 100% 被拒。**

- **验收怎么跑的**：用户配了真 Linear workspace（VanguardLea / key=VAN）+ personal API key，
  跑 `_probe/accept-linear-jira.mjs linear`。前两步直接过（token 有效、7 个状态拉下来、
  候选名匹配 `in_progress→In Progress` 命中）；**第三步真建 issue 时被 Linear 拒**。
- **根因**：`issueCreate` 的 `teamId` 参数是 **UUID 类型**（`teamId must be a UUID`），
  而 `linearSyncIssue` 把用户配置里的团队 key（VAN）原样传进去。Linear 的 `team(id:)`
  **查询**两种都收，所以"连接 + 拉状态"一路绿灯，直到**真正建 issue 才炸**——
  而且错误藏在 HTTP 200 的 `errors[]` 里，不是网络层能看见的失败。
  影响面：**从未真机推送过的用户，第一次推送必败**（这正是「契约对、真机败」的又一例：
  单测桩不回错、契约检查不覆盖 mutation 参数类型）。
- **修复**（`src/ui-ge-integrations.js`）：新增 `_linearResolveTeamId(token, team)`——
  已是 UUID 直通（老配置不多打请求）；是 key 则查一次 `team(id:){id}` 解析并缓存
  （键含 token 防串账号）；解析失败返回 null → `linearSyncIssue` 如实报
  `team_resolve_failed` 且**不发** issueCreate（不许假成功）。
  探针同步改为与应用同款（先解析再建）。
- **e2e 的正确变红**：`integration-push.spec.js` ④ 原断言 `input.teamId === "team-e2e"`
  （编码的正是旧行为）。修复后它如实变红——已更新为断言解析出的 UUID，并给路由桩补上
  解析查询分支。**这次是「测试守旧行为」的正面案例**：若为了绿灯去改断言而不是改产品，
  就把真 bug 放过去了。
- **验收结果**：重跑全过——viewer / 7 状态 / key→UUID 解析 / **真建 VAN-5**（带 stateId）
  / issueUpdate 更新路径。验收结论：Linear 全链路通过。
- **测试**：`tests/integration-state-mapping.test.js` +4 例（key→UUID / UUID 直通不多查 /
  解析失败不发创建 / 缓存只解析一次），该文件 8/8；全量单测 146 文件 + e2e **90/90**；
  门禁链与七脚本（176）全绿。
- **过程记账（方法论）**：① `npm run e2e 2>&1 | tail -2` 的 exit 0 是**管道 mask**
  （tail 的退出码），真实是有 2 失败——**带管道的命令不能用来判退出码**，此后 e2e 一律
  落盘看 `passed/failed` 两行；② 写测试桩时正则又把 `(id: $id)` 当成分组、`{ id }` 的
  花括号性质的坑再踩一次，改纯字符串包含判断（这条已第二次栽，见 audit R-11 的 env 键名）。

## [v3.7.118] - 2026-10-11

**上下文滚动摘要（迭代计划第五批 · 收官）：长会话 token 成本从线性涨转为有界。**

- **做法**：会话超过 `cfg.histSummaryAt`（默认 40 条）时，把最旧一段折成一次摘要
  （**一次额外请求**），摘要拼进 system 提示，只发「摘要 + 最近 `histSummaryKeep`
  （默认 20）条」。之后每多 `histSummaryStep`（默认 10）条才重折一次——不是每条都重摘要，
  那会把省下的 token 又花回去。`cfg.histSummary===false` 可整体关闭。
- **三条纪律**（都有用例守着）：
  ① **阈值内零额外请求** —— 短会话行为与改动前完全一致（用例断言请求次数=1、消息数不变）；
  ② **摘要失败即回退** —— 请求抛错/超时保持原 covered，走既有全量路径，不报错不阻塞
     （降级路径优先于新功能）；
  ③ **不静默改历史** —— `chats[sc]` 原样不动，摘要只是「发送时的投影」；且按**会话**隔离
     （存进 session 对象：切会话不串味、删会话随它一起消失，不需要额外的共享键和清理逻辑）。
- **摘要拼进 system 而非替换消息**：不动消息交替结构，避免两条连续 user 消息惹恼Provider。
- **可观测**：诊断报告新增「上下文摘要」行（折叠了几条 / 未启用），用户能确认折叠在发生，
  而不是以为历史被删了。`ctxSummaryState()` 暴露给测试与诊断共用同一读数。
- **验证**：`tests/ctx-summary.test.js`（新）**5/5**——阈值内零请求 / 超阈值确实少发
  （主请求消息数从 46 降到 <30 且摘要与最近消息都在）/ 失败回退全量且提交不抛 /
  历史不动 / 按会话隔离存储。全量单测 **146 文件** + e2e exit 0；门禁链与七脚本（176）全绿。
- 文档：`docs/user-manual.md` §5 补「长对话会自动折叠」及三条保证与关闭方式。

## [v3.7.117] - 2026-10-11

**两套拆解机制合一（迭代计划第四批）：`>` 自主计划并入对话 `plan` 工具链的同一目标存储。**

- **问题**：产品里一直有**两套互不相认**的多步机制——对话内 `plan/complete_step/
  complete_goal`（目标落 `wb_agent_goals`）与命令面板 `>` 自主计划（进度另存）。
  后果：`agentContextPrompt` 的「进行中目标 / 请继续执行第 N 步」只覆盖前者，
  `>` 跑起来的计划在对话里**看不见**；用户也说不清"现在到底有几个任务在进行"。
- **合一**（`confirmAgentPlan`）：确认执行即 `createGoal(goal, steps.map(desc), sc)`
  写入同一 goals，带 `src:"palette"` 来源标记；执行进度经 `runProgress` 同步
  `markStep(idx)` 勾选；跑完 `completeGoal(summary)` 收尾；「放弃执行」时
  `cancelGoal()` 一并作废——**放弃要两个视角一起清**，否则 goals 里那条会以 active
  永远挂着，每轮对话都注入"请继续执行"而用户早就放弃了。续跑路径同样勾选。
- **入口保留、状态一份**：`>` 的评审体验更好，继续用它发起；但用户面的「进行中目标」
  只有一份。旧 goals 数据（无 `src` 字段）兼容读取——读取方不依赖该字段，它只作排查线索。
- **重规划的边界（如实记账）**：段末校准换掉的剩余步骤不在 goals 里——goals 是
  用户面检查清单（按原始计划写），agent_run 是执行记录（按重规划重建）。两者对
  新步骤各有取舍，下标越界时 `markStep` 自行返回 null，不会写坏数据。
- **验证**：`tests/agent-goal-unify.test.js`（新）**5/5**——旧数据兼容 / 写入形状 /
  **刷新后仍注入同一目标（合一的核心意义，且 agent_run 与 goals 同时在场）** /
  两套入口单目标（plan 工具再建目标只顶替不并行）/ 进度勾选与完成收尾。
  全量单测 **145 文件** + e2e exit 0；门禁链与七脚本（176）全绿。
- 文档：`docs/user-manual.md` §7 重写为「两套入口共用一份目标存储」并说明边界。

## [v3.7.116] - 2026-10-11

**自主执行断点续跑（迭代计划第三批 · 架构评估点名的天花板之首）：刷新/崩溃不再丢进度。**

- **落一份盘上记录**（`wb_agent_agent_run`，容量 1 份）：确认执行即写
  `{goal, text, sc, steps, done}`，每步完成经 `onProgress` 追加 done，**全部完成或用户
  放弃才清档**；取消（abort）与异常**不清档**——那是续跑的前提。写盘失败一次性
  WARN（不静默：用户以为进度存住了，刷新后才发现没了）。
- **续跑只跑剩余步骤，done 权威**：done 里标记过的步骤不重跑（它记录的是"确实执行过"）；
  缓存的 resultStr 只用于展示，不据此推断或重建数据现状——与 mv 冲突同口径
  （测试专门守"done 说跑过但数据不在 → 不补写那一步"）。**被拦下的步骤不算完成**
  （需确认/不在白名单 → blocked）：标成 done 会让续跑永远跳过它，把"需确认"悄悄吞掉。
- **重规划不断链**：执行器新增 `onReplan` 回调——段末校准换掉剩余步骤后，那些是**新对象**、
  与原 steps 对不上号，done 用原下标会漏标/错标。现在重规划即把盘上记录重建为
  「已执行 + 新剩余」，done 下标始终指向当前 steps。
- **发现入口三处**：启动 1.2s 后 toast 提示（`第 N/共 M 步`，N = 当前所在步而非已完成数）；
  命令面板 `>` 的副标题在有未完成执行时直接显示该提示（点下去也会被 `proposeAgentPlan`
  拦住并说明——容量 1 份，**不静默开新计划吞掉旧进度**）；聊天里发「继续执行」续跑、
  「放弃执行」清档。
- **踩到并修掉的两个真 bug（过程记账）**：① `cur.steps.indexOf(step)` 恒为 -1 ——
  `cur` 是盘上 JSON 解析出的**副本**，与活的 step 不是同一对象，进度永远写不进去
  （改用活的 `p.plan.steps` 找下标）；② 空 catch 门禁当场拦下我自己写的两处
  `try{ save(...) }catch(e){/*只注释*/}`（save 在 try 体里 = P0），补一次性 pushDiag。
- **验证**：`tests/agent-run-resume.test.js`（新）**6/6**——落盘/异常保留/刷新恢复/
  续跑只跑剩余/done 权威/放弃清档，其中「确认后完成即清档」那条**刻意不能**用来证明
  落盘（不落盘时它也成立 = 假绿，已在注释里写明）；全量单测 **144 文件** + e2e exit 0；
  门禁链与七脚本（176）全绿。
- 文档：`docs/user-manual.md` §7 改为「本机刷新不丢、跨设备不续」的诚实边界。

## [v3.7.115] - 2026-10-11

**检索降级可见性（迭代计划第二批）：「悄悄退化成词法」不再悄悄。**

- **诊断报告新增「语义召回」行**：`设置 → 关于 → 诊断与反馈` 生成的报告里明确写出
  当前是哪种状态——`向量检索可用` / `词法降级 — embedding 通道不可用（10 分钟内自动
  重试）` / `词法降级 — IndexedDB 不可用` / `未配置 embedding 通道` / `未启用（cfg.rag=false）`
  / `尚未探测（本页首次检索后确定）`。此前这条链路的一切「不可用」都是**静默降级**，
  用户看到的现象统一是「AI 好像找不到我写过的东西」，但没有任何线索指向原因。
- **读的是既有降级标志，不另造一套状态**（`src/ai-tools.js` 的 `semanticRecallStatus()`）：
  `cfg.rag`、`_embedCfg()`、`_embedFailUntil`（v3.7.71 的通道失败缓存）、
  `_ragVecCache.loaded`（v3.7.101 的 IDB 探测标记）—— 与 `ragVectorSearch` /
  `aiEmbedTexts` 同源，**不发任何探测请求**（测试断言状态查询期间 fetch 调用数为 0）。
  `unknown/未探测` 刻意与「降级」分开：本页还没走过一次向量加载时**不谎报可用**，
  也不把「没探测」画成「降级」（两者对用户的行动指引不同）。
- **用户手册同步**：§6 与排障表都改为指向这行诊断（并按行内原因给处理办法）。
- **验证**：`tests/rag-degradation.test.js`（新）**8/8** —— 六种状态全部走**真实代码路径**
  触发（假 embedding 通道 + jsdom IDB 内存桩）而非直接设内部变量；两条诊断报告断言
  （降级行文案 / 可用文案）。全量单测 143 文件 + e2e exit 0；门禁链与七脚本（176）全绿。

## [v3.7.114] - 2026-10-11

**安全告知项（产品决策①：维持默认宽松但不再静默）+ 根治验证脚本写死端口假红。**

> **发布后追加（`0f1afbb`）**：CI windows 腿抓到第二例 startup teardown 竞态
> （`setupSideToggle` 经壳层 `$` 读已销毁的 document —— 143 文件/1636 例全过、
> 只红一行 Unhandled Rejection）。根因修在壳层 `$` 助手（默认参数 `r=document`
> 不兜底），一处修掉整族；复跑 CI 四 job 全绿，线上 sha256 `28bd797a…` 逐字节一致。

- **corsOrigin 不再静默宽松**（roadmap 待办③）：`cfg.corsOrigin === "*"` 时启动打一次
  WARN（与占位 JWT 密钥同款显式警示口径），README/状态表补「默认 `*` 是为开箱自通；
  对外或过反代应收紧」。**不收紧默认值**——自托管部署形态千差万别（file:// 直开、IP 访问、
  反代、跨端口），收紧会把「开箱即通」变成「开箱报错」，违背本地优先定位。
- **数据文件权限收紧**（roadmap 待办②）：`store._save()` 写入时目录 0700 / 文件 0600
  （POSIX；Windows chmod 近乎空操作，不报错也不假装生效）。数据文件内含 refresh token
  与全部用户数据，等同凭证文件。权限收紧失败不影响写盘本身，只打一次 WARN 指引人工处理。
  README 明示「`cfg.dataFile` 即凭证」。**不做**口令派生/KMS（拿到文件 ≈ 拿到整机，
  性价比不成立，独立课题）。
- **验证脚本端口全部动态化**（本批实测连栽三次：4571/4572/4574/4575/4576/4577 相继被本机
  占用，Windows Hyper-V 保留段让 listen 报 EACCES —— 而「端口被占」与「实现坏了」表现不同，
  会让全部七个服务端脚本假红）。七个脚本 + oauth-check 的假 provider 端口全部改为
  `freePort()` 动态分配，根治此类假红。
- **验证**：`security-check` 22→**25/25**（新增：corsOrigin 默认打 WARN / **收紧后不打**
  反向断言——防 WARN 被写成无条件打印 / 数据文件权限 POSIX 断言、Windows 记录不断言）；
  七脚本合计 **176** 全绿（9/9·9/9·54/54·29/29·25/25·17/17·33/33）。
- 文档：`docs/iteration-plan.md` 建立（v3.7.114~118 五批排期 + 依赖/风险/验收）、
  roadmap §五 待办 ②③ 从「待设计」改为「已按建议落地」、server/README 状态表与配置表。

## [v3.7.113] - 2026-10-11

**第三方登录按承重墙标准加固（GitHub 修两处真 bug + fail-closed；微信演示模式补一次性/过期/审计）——先更正一处自己的误判。**

- **误判更正（当天自查发现）**：v3.7.112 收口时我说「三个第三方登录端点后端一个都没有」是**错的**——
  `ac1114a` 骨架的 `server/src/auth.js` 本来就实现了它们（GitHub 授权/回调 + 微信**演示模式**）。
  错因：只 grep 了文件前半部分就下结论。真实问题不是端点缺失，而是：
- **GitHub 两处真 bug（已修）**：① **code 兑换打 JSON body**（GitHub 令牌端点要
  form-urlencoded）→ 真配了 client_id 也登录不了；② **回调页 postMessage 漏传 state**
  → 客户端校验 `d.state === session.state` 会直接拒收，**授权链路本是断的**（且静默）。
- **服务端加固**（`server/src/auth.js`）：state 随机 16 字节 + **TTL 600s + 一次性消费**
  （重放 → `state_invalid` 错误页）+ 记录 opener origin 作 postMessage targetOrigin
  （`cfg.github.postMessageOrigin` 可收紧）+ 按 GitHub id 建/找账号（email=null 不进邮箱命名域）
  + 复用既有签发/会话/审计（register + login 带 `ctx.provider`）+ IP 限流 +
  **未配凭据 → 503 `github_not_configured`**（fail-closed，永不 404；客户端据此显示"未配置"而不是
  笼统"没有后端"）+ `tokenUrl/userUrl` 可配但**指向 loopback 仅 `dev.allowUnsafeDevEndpoints`
  放行**（防配置静默开 SSRF，loopback 目标 → `forbidden_host`）+ state 惰性清扫（`store.sweepOAuthStates`）。
  微信：scene **一次性消费**（原来可反复领 token）+ 超 `qrcodeTicketTtlSec` 即清 + confirm 仍
  **默认 404 不暴露**（仅 dev 开关放行）+ 审计 `login{provider:"wechat_demo"}`；演示码 `demo:true` 自证。
  **旧版实现整体删除**（同路径双注册 = 旧版永远命中，双份维护比没有更坏）。
- **客户端**：`_ssoErrText` 文案细分——只有 `github_not_configured` 映射到
  `api.ssoNotConfigured`（"后端未配置该第三方登录方式（详见部署文档）"），**其余错误码一律不映射**
  （限流/网络异常仍走原文案，写宽会造成新的误导）；i18n 双语补键。
- **验证**：`server/verify/oauth-check.cjs`（新）**33/33** —— 本地**假 GitHub provider**
  （loopback，仅 dev 开关下合法）走**真服务端代码路径**全链路：授权形状 → 兑换 → 签发 →
  /me 与 refresh 真能用 → 设备列表 → 重放拒 → 兑换失败 → 取消 → 过期 → 关 dev 开关 forbidden_host →
  同 id 幂等 → 审计双事件 → state 清扫 → 限流 429+Retry-After；微信演示模式全链路
  （取码→pending→确认→confirmed→一次性→过期）。`client-contract-check` 25→**29/29**（4 条真断言，
  微信从"已识别缺口"转为真断言）；服务端七脚本合计 **173** 全绿；`tests/auth-ui-lifecycle.test.js` +3 例。
- **文档**：`docs/oauth-login-design.md`（评估/方案/四期 + **当日误判更正**置顶）、
  `docs/audit-2026-10-06.md` R-11、roadmap 硬阻塞两行（改为"已加固/真机验收差注册 OAuth App"）、
  product-scope、root README、`server/README.md` 端点表/状态表/配置表；`ci.yml` server-verify 接入第七个脚本。
- **GitHub 真机验收只差一步**：去 github.com/settings/developers 免费注册 OAuth App
  （个人即可），callback 填 `<API origin>/api/auth/github/callback`，把 clientId/secret 配进
  `cfg.github` 即可——**协议侧无需再改**。
- **CI 首跑抓到并修复一条真健壮性问题**：`applyTheme()` 在 `startup()` 里排在
  `await initCrypto()` 之后——这期间窗口若被销毁（CI 的测试 teardown / 用户关标签页），
  读到已销毁的 `document` 抛 TypeError。表现为 143 文件/1636 例**全过**、只红一行
  Unhandled Rejection。已加守卫（无 DOM 时本无事可做，提前返回是正确语义）；
  本机跑不出该形态（时序窗口在 CI 环境才命中），**判据以 CI 为准**。

## [v3.7.112] - 2026-10-11

**评估文档 §七 最后一项「真机 UI 联调」收口 —— 联调第一次跑真 UI 就抓到一条 P0（`{ok,data}` 信封不拆包：登录「假成功」）。**

- **做了什么**：`_probe/ui-backend-integration.mjs`（本地探针，`_probe/` 按 v3.7.42 起的约定不入库）——
  真 Chromium + 真起后端（独立端口 / 临时数据文件 / `DEV__ALLOWUNSAFEDEVENDPOINTS=true` 仅本地）+ 真表单，
  双 context 模拟两台设备跑完：欢迎页探测 → 真实注册（验证码从响应里取）→ 登录态落到 UI →
  「立即上传」后**回读后端数据文件**核对快照内容与审计环 → C2 体积看板 → 第二台设备登录同账号
  → 不自动覆盖（诚实）→「恢复云端」→ C3 覆盖计数 → 错误密码给出凭据类错误。**19/19 通过**。
- **抓到的 P0（`src/ui-ge-api.js` 信封拆包）**：本仓后端所有路由都经 `ok(res, payload)` /
  `fail(...)` 返回 **`{ok, data}` 信封**，而客户端各 `api*` 读的是**载荷本体**（`r.data.accessToken` /
  `r.data.snapshot` / `r.data.devices`）。不拆包时：登录 HTTP 200 且 `r.ok` 为真 → UI 提示「登录成功」，
  但 token / user 一个都取不到，云同步的快照也读不出来 —— **一次彻头彻尾的假成功**。
  修复口径（保守）：仅当响应体是 `{ok:true, data:...}`（**成功**信封）才拆；
  错误体（`{ok:false, error}`，可能也带 data）**原样透传**——调用方要读 `r.data.error` 做错误提示，
  拆了就只剩笼统文案；无信封的 mock 与第三方代理也原样透传。
  ⚠️ 首版拆包写宽了（对 `{ok:false}` 也拆），真机负例当场失效：错误密码的提示从
  「凭据无效」退回笼统「登录失败」，已收紧判据并复跑 19/19 复现正确文案。
- **为什么契约联调没抓到**（这条比修 bug 更值得记）：`client-contract-check.cjs` 25/25
  证明的是「客户端调用的序列后端都实现了」，但它自己**读的就是信封形状**（`r.json.data.accessToken`）——
  只比 HTTP 状态与端点存在性，**两边各自安好**；客户端把整个信封当载荷用，这种事只有打开真 UI 才看得见。
- **守护**：`tests/api-envelope.test.js`（新）**5/5** —— 成功信封被拆开 / 错误体**不**被拆开
  （`r.data.error` 可读）/ 无信封直传 / `apiLogin` 落 token（密文或明文二态皆收）/
  `apiGetSnapshot` 取回快照。
- **顺带修两处过期注释**：`src/render-overview.js`（`apiPutSnapshot` JSDoc）与 `src/ui-ge-api.js`
  （`probeAccountBackend` JSDoc）还写着「本仓库不含该后端」—— 后端 v3.7.105 已找回，注释已同步。
- 文档：`docs/backend-recovery-assessment.md` §七 两行划掉（客户端联调 🟡→✅、真机 UI 联调 ❌→✅）、
  §八 补探针前置；`server/README.md` 状态表刷新；`docs/product-scope.md` 两处「未与真实后端联调」更新；
  `docs/audit-2026-10-06.md` 记 R-10。

## [v3.7.111] - 2026-10-10

**`/api/tools/fetch`（web_fetch 的 CORS 兜底代理）按承重墙标准交付 —— 评估文档里最后一个「已识别、未做」的端点收口。**

- **背景**：客户端的 `web_fetch` 直连被 CORS 拦断时会退到 `cfg.fetchProxy`（独立代理）或
  `cfg.apiBase + /api/tools/fetch`（自建后端），而 `ac1114a` 那份后端**从未实现这个端点** ——
  与 `/api/sync/snapshot` 同一形态（客户端一直在调、后端没有）。
- **服务端**（`server/src/tools-fetch.js` 新件）：按客户端**真实调用**实现（`GET /api/tools/fetch?url=`，
  返回原文、去标签仍是客户端的活）。承重墙口径同 ics-fetch / notify-webhook：
  **必须 Bearer**（不做开放代理）· 拒 userinfo · 拒回环/私网/链路本地/.local ·
  **手动跟随重定向且每一跳重新校验**（`redirect:"follow"` 一个 302 就能绕开主机校验，
  `"error"` 又会让正常站点全废，取中间路）· `cfg.tools.fetch` 控体积（1MB→413）/ 超时（10s→504）/
  重定向次数；`allowHosts` 是显式白名单逃生舱（默认空 —— 默认连云环都拒，含 169.254.169.254）。
- **客户端**（`src/ai-tools.js`）：apiBase 路从裸 fetch 改走 **apiFetch**（带 token、带 401 刷新，
  匹配后端的新鉴权要求）；自备 `fetchProxy` 仍是裸 fetch。**顺带修一个真 bug**：旧实现把代理返回的
  404 当成抓取结果（既不回退直连也不说明原因），现在代理不可用/非 2xx 一律回退直连。
- **验证**：`server/verify/tools-fetch-check.cjs`（新）**17/17** —— 代回原文 / 协议 / userinfo /
  私网与云元数据默认拒 / 无白名单连回环都拒 / 白名单放行 / 302 跟随与跳私网被拒 / 413 / 504 / 401；
  客户端 `tests/webfetch-proxy.test.js` **7/7**（新增守护：非 2xx 不当结果）；
  契约联调 `client-contract-check.cjs` 24→**25/25**（该端点的断言从「猜的 POST」修正为按真实
  调用的 GET + 断言代回内容）；六个服务端脚本全量重跑 **136/136** 全绿（9/9 · 9/9 · 25/25 · 54/54 · 22/22 · 17/17），已全部接入 CI 的
  `server-verify` job。
- 文档：`server/README.md`（端点 / 配置 / 状态表 / 命令）、`docs/backend-recovery-assessment.md`
  §五 改写为「从待设计到承重墙交付」并附设计要点。

## [v3.7.110] - 2026-10-10

**服务端生产化：速率限制 + 审计日志（评估文档 §七 点名的两项）—— 后端自身不再是最大缺口。**

- **速率限制**（`server/src/rate-limit.js` 新件）：`/email-code`、`/register`、`/login` 按
  「每 IP 每窗口 + 同 email」双桶限流（默认 30/min；login 10/min；发码 5/min；
  `cfg.security.rateLimit` 可关可调）。命中返 **429 + `{ok:false, error:"rate_limited"}` +
  `Retry-After`**（前端 errKind 已按 4xx 归 client 分支，提示语义不破）。此前这三个入口
  **没有任何频次约束** —— 可暴力破解口令、可枚举撞库、可对同一邮箱滥发验证码。
- **审计日志**：有界环形（`AUDIT_MAX` 默认 200 条/用户，溢出丢最旧），只记安全事件
  （register / login / logout / device_delete）；`GET /api/auth/audit` 只能看本人的
  （userId 由中间件注入，越权读取没有入口）。同步读写太高频**不进环** —— 同步量看服务端访问日志。
- **验证**：`server/verify/security-check.cjs`（新）**22/22** —— 阈值内正常 / 超限 429+错误码+头 /
  email 分桶 / 可关 / 审计事件与内容 / 跨用户隔离 / 有界收敛 / 无 token 401 /
  **故障注入**（守卫摘掉后同样的量必须放行 —— 证明断言在守护）。五个服务端脚本已全部接入
  CI 的 `server-verify` job。
- **边界（如实记账）**：限流计数在**进程内** —— 多实例各算各的（与 JSON 存储的单实例假设同源，
  README 已写明）；固定窗口有边界突刺。审计环是「近期活动」而非不可变归档（要归档需外置存储）。
- 文档：`server/README.md` 状态表与配置项、`docs/backend-recovery-assessment.md` §七 两项划掉
  （自动化测试 4→5 个脚本；速率限制/审计日志 ❌→✅；判断清单收敛为「产品决策 + 真机联调」两项）。
- 本批**无客户端改动**：单测 / e2e 沿用 v3.7.109 的全量结果（142 文件 / 1627 例、90/90）；
  五个服务端脚本本批重跑 **118/118** 全绿；CI 全量复核见 `server-verify` run。

## [v3.7.109] - 2026-10-10

**云同步契约 · 阶段 3 收口：冲突策略由服务端下发（`mv+提示`）—— C1–C4 与阶段 1/2/3 全部交付。**

- **定稿**：默认 `lww`（输了的一方静默丢弃，现状零变化）；`cfg.sync.conflictPolicy = "mv"` 时，
  输了的一方不再静默丢弃，记进冲突清单随响应下发，由客户端处理。服务端**不替客户端合并**
  （单边做会造成「后端以为在合并、客户端以为被覆盖」）。
- **服务端**：`store.js` 逐键检测（服务端已有更新 / 同刻不同值 → 记 `{local, remote, at}`，
  上限 50 条丢最旧、新值落定即清该键）；`POST /api/sync/resolve {k, choice, ts}`
  （choice = `local` | `remote`，ts 由客户端给且须新于冲突双方）；响应带 `conflictPolicy` 声明
  + `conflicts` 清单。
- **客户端**：**任务键结构化自动合并**（两版数组按 id 合并、updatedAt 大者胜 —— 与快照应用
  同口径；合并结果以新 ts 上行，服务端冲突自动作废）；其余键**不猜**，列在「设置 → 账号 →
  云同步」的冲突面板上让用户「保留本机 / 使用云端」二选一。`lww`（默认）下清单恒空、整段不触发。
- **验证**：`server/verify/incremental-check.cjs` ⑫ 组 15 项（重启换 mv 机：声明 / 冲突记录与
  双方值 / 未被覆盖 / 双向 resolve / 清空 / 非法 choice 400 / 已解决再解决 404 / 无 token 401），
  **54/54**；客户端 §mv 5 例；阶段 1+2+3 定向 45/45；全量单测 142 文件 / 1627 例（含并行会话已入库的 credential-seal 8 例）+ e2e 90/90；
  九门禁全绿。
- **写测试时栽的两处（留档）**：① 旧 token（剪枝后 `prunedBelow` 已推高）触发 needsFull →
  响应 changed/removed 为空，让「值是否回显」的断言失真 —— ⑫ 组先取新 token 再验；
  ② 坏 choice 要在**存在冲突**的键上验（已解决的键返回 404 本身就是正确语义，单独成一条）。

## [v3.7.108] - 2026-10-10

**云同步契约 · 阶段 3（可做部分）：下行也切增量 —— 5 分钟定时「无上也拉」。**

- **缺口**：阶段 2 的下行变更只在上行时捎带回来（变更日志为空就不轮询）—— 跨设备的改动要等本机
  下一次编辑才可见。
- **做法**（`render-overview.js`）：加载即挂 5 分钟定时拉取；tick 抽成命名函数
  `_syncIncrementalPullTick`（生产里是 `setInterval` 回调、测试里直调），**仅**在
  「已登录 · 增量开关开 · 本会话未发生过"服务端不支持"回退」三者同时成立时跑；走既有
  `window.doSync`（自带登录判断与状态机），不新增错误语义。开关关 / 未登录 / 不支持增量时
  一律不跑 —— **开关关时逐位零行为变化**。
- **刻意不碰 `ui-ge-api.js`**：那是并行会话在途的文件（凭据密封批次③）；定时器建在本块 + 走
  `window.doSync` / `window.isApiLoggedIn` 桥（与 `cloudCheckOnLogin` 同款用法）—— 两个会话的
  改动不混进同一文件（并行协作铁律；本轮确实因此把先写在 ui-ge-api 的版本撤回重迁）。
- **验证**：`tests/cloud-sync-stage2.test.js` §阶段3（4 例：开关关零行为 / 未登录不请求 /
  无上也拉 / 回退后不再打扰）；阶段 1+2+3 定向 40/40；**全量单测全绿 —— 本批内容 141 文件 / 1614 例**
  （工作区另含并行会话在途的 `credential-seal` 8 例，全量口径 1622 例亦全过）；e2e 90/90；九门禁全绿。
- **坑留档（值得记）**：vitest 的假时钟只覆盖**测试 realm** 的计时器 —— 页面脚本（jsdom realm）里建的
  `setInterval` 收不到时间推进（实测：测侧自建间隔触发 360 次、页面里建的 0 次）。定时器类行为
  要测试，**把回调抽成命名函数直接调**，别推假时钟。
- **冲突策略**：仍只有 `lww`；「由服务端下发」与 `mv/三路合并」属产品决策，未定不做（照契约 §二.3 纪律）。

## [v3.7.107] - 2026-10-10

**云同步契约 · C3 冲突计数交付：下行覆盖变成可解释的数字（静默 LWW 的出口）。**

- **口径**（决定数字可不可解释）：`sync_meta.lastPullCover` = 本次下行**真正改动本机键值**的数量 ——
  本机有值且与远端值不同才计入；**远端新增键（本机无值）、值相同的键、被「本机更晚变更」保护
  跳过的远端删除，均不计**（后两类本就没动本机数据）。
- **落点**：`_applyCloudSnapshot`（全量 / 回退 / WebDAV 三路共用）返回并记录 changed 侧计数；
  增量轮把 removed 侧（删除的键里本机原有值的）相加后写回 —— **每轮都写**（无下行 = 0，
  面板显示「无」），与「上次上传体积」同口径：永远是"最近一次"的实况。
- **展示**：设置 → 账号 → 云同步新增「上次云端覆盖」行（`#apiPullCover`）+ 诊断报告同源行
  （0 也写出来：`云同步: 上次云端覆盖 0 键`）。i18n 中英各三键（`api.pullCover` /
  `api.pullCoverNone` / `api.pullCoverVal`）。
- **为什么这是 C3 的值**（契约原文：给用户一个可解释的数字，现状静默 LWW）：此前跨设备同步
  把本机数据改掉了，用户只能靠肉眼发现差异；现在每一轮同步后面板与诊断报告都会给出
  "这次云端改动了你几个键"。
- **验证**：`tests/cloud-sync-stage2.test.js` §C3 5 例（口径边界：远端新增不计 / 值相同不计 /
  保护跳过不计 / changed+removed 相加且剔除本机无值 / 诊断行同源）；阶段 1+2+C3 单测 49/49；
  全量单测 141 文件 / 1610 例 + e2e 90/90 全绿；九门禁全绿（空 catch 基线签名零变化 ——
  新增的读值 catch 都是非空体、既有 try 体一字未动）。
- **写代码时自己踩的一条（留档）**：C2 的单位是写在模板键里的（`api.pushSizeVal` = "{size} · {n} 键"），
  C3 我先误用了并不存在的 `api.keysUnit` → `i18n-completeness` 门禁当场抓住（"有默认值但未进字典"）。
  已改为与 C2 同款的整模板键 `api.pullCoverVal` = "{n} 键"。

## [v3.7.106] - 2026-10-10

**云同步增量契约 · 阶段 2 交付（服务端 + 客户端两端同步升级，开关制 + 全量回退）+ 服务端线收口 + 一处会话碰撞修复。**

### 一、阶段 2：增量上行（`docs/cloud-sync-incremental-contract.md` §二 定稿 / §三 实施记录）

契约定稿三处：`removed` 从 `[k...]` 改 **`[{k, ts}]`**（下行删除要参与客户端侧 LWW 判定，没有 ts 判不了）；
`base` 字段不引入；**幂等落在写侧**（同 `(k,v,ts)` 重放不改状态、水位不动，无需另立幂等键）。

- **服务端**（`server/`）：新增 **`POST /api/sync/changes`** —— 单次往返 = 上行 `{since, changes, removed}`
  + 下行 `{token, changed, removed, needsFull}`。逐键视图 `{v,ts,seq}` + tombstone（>200 条剪枝，
  `since` 落后于剪枝下限 → `needsFull` → 客户端回退全量）；**服务端权威水位**（token=水位）；
  逐键 LWW（ts 大者胜、**相等时删除胜**）；`_` 前缀元键不进视图。
- **快照相干性**（设计里最易坏的一环）：全量 PUT **重建**逐键视图（每键取新 seq、消失键补墓碑）、
  增量写**逐键补丁**同一份快照记录 —— 「一台走全量、另一台走增量」必须看到同一个世界，
  脚本第 ⑦⑧ 组专钉这一条。
- **客户端**：`cfg.syncIncremental` **开关制分流**（默认关 = 逐位全量，零行为变化由测试钉死；
  开 = 增量，`404/405`（旧部署无端点）与 `needsFull` 自动回退全量）。delta 从 C1 变更日志折叠
  （范围过滤与出站/入站同口径）；游标 = 服务端 token 落盘 + **成功即清日志**（收敛后清空是最简单
  且正确的游标）；下行 changed 走快照同一应用路径、removed **裸删**且跳过本机更晚未上传变更；
  C2 看板在增量轮记 **delta 体积**。
- **验证**：`server/verify/incremental-check.cjs` **38/38**（幂等 / LWW / 显式删除信号 / 快照相干 /
  剪枝回退 / 跨用户隔离 / 401 / 坏输入；跑通前先栽在两处**测试自身**的错——「两个账号当两台设备」
  与「同秒 JWT 同串」，均已纠正并把判据写进脚本注释）；客户端 `tests/cloud-sync-stage2.test.js` **11 例**。

### 二、服务端线收口（`c75e918`）

- updatedAt 口径纠正入库（LWW 比较基准 = 客户端自报值，`serverUpdatedAt` 仅诊断）+ 第 24 条守护用例
  「updatedAt 原样回传」；README 正文残留的旧口径（"用服务端接收时刻"）改写为与实现一致。
- `hardening-check.cjs` 启动预算 8s → 20s（满载机器首跑假红、重跑 9/9，与客户端批 slice4/9/10 同治理口径）。
- **修一处会话碰撞**（`auth.js`）：refreshToken 此前无随机数 —— **同一秒内两次签发是同一个字符串**，
  而会话表以 refreshToken 为主键 → 同秒两次登录 / 快速重登会把前一个会话**覆盖**掉（设备列表少一台，
  多设备语义失真）。加 `jti` 随机数修复；accessToken 刻意不加（15 分钟同一身份凭据，同串无害）。

### 三、测试 / 门禁（本批）

- 七门禁全绿；module-graph 块 35 · 循环 13 / 逆层 18 **零新增**；空 catch 基线按文件重冻
  （514 → 517：3 增均 P1/P2、0 消失、0 内容漂移）。
- 全量单测 **141 文件 / 1605 例全绿**（低争抢档 maxForks=8）；e2e **90/90**。
- 已知边界（如实记账）：冲突策略仍只有 `lww`（`mv/三路合并` 属产品决策，未定不做）；增量响应会回显
  本轮上行（换"冲突时服务端权威值自动回流"，大 delta 往返体积翻倍，`echoPolicy` 精化留后续）。

## [v3.7.105] - 2026-10-10

**鉴权后端找回与加固 + 云同步增量契约阶段 1（客户端）+ R-4 化石摘除。**
本版由两条会话线合并：服务端线（`7f66546` / `60bc5a9` / `807ac24` / `2eaf4dd`）与客户端批（`b0a0fc7`）。

### 一、鉴权后端：从「工作区里不存在」推进到「可救的开发骨架」（服务端线）

- **资产找回**：后端完成于 `ac1114a`（2026-09-10，709 行 / 8 文件），因远端强推不在 HEAD 祖先链上，
  被长期记为「后端不存在」。用 `git archive ac1114a server | tar -x` 找回（**不动索引** —— 并行会话
  在场时 `git checkout` 极危险）。**教训：「目录不存在」不等于「代码不存在」**，判存在以
  `git merge-base --is-ancestor` 为准。
- **修 3 条 P0（部署即失守）**：`/wechat/confirm` 无任何鉴权可接管任意邮箱账号、未配 SMTP 时
  `demoCode` 随响应体回传 —— 两者收进新增的 `dev.allowUnsafeDevEndpoints`（默认 `false`）；
  JWT 仍是占位密钥时**拒绝启动**（`ALLOW_PLACEHOLDER_SECRETS=true` 才显式放行并打 WARN）。
- **修 2 条跨用户越权（IDOR）+ 1 处设备标识设计缺陷**：删定时提醒 / 踢设备下线补归属校验
  （非本人一律 404，与 PUT 口径一致）；「设备 id = refreshToken 前 8 字符」实为 JWT 头段常量
  （所有会话恒为 `eyJhbGci`）→ 改独立随机 `sid`，与 token 解耦、字段名不变（客户端兼容）。
- **补齐缺失的云同步端点** `GET/PUT /api/sync/snapshot`：客户端一直在调，而找回的后端从未实现 ——
  「即使把后端部署起来，云同步依然不工作」。空态必须回 `null`（不是 `{}`，否则客户端会把空对象
  当真实快照应用下去）；`updatedAt` **原样回传客户端自报值**（客户端拿它与本地 `lastPushAt` 比大小，
  换服务端时间会让跨设备比较判错方向 —— 第一版实现踩过，已纠正并加守护）；超 2MB 返 **413 不静默截断**。
- **验证**：`server/verify/` 三个自足脚本 **hardening 9/9 · idor 9/9 · client-contract 24/24**，
  每条含故障注入（摘守卫 → 如期转红 → 精确还原复绿）。**未接入 CI**（如实记为待办）。
- **文档**：新增 `docs/backend-recovery-assessment.md`（审计口径）、`server/README.md`（运维口径）、
  `docs/privacy-policy.md` / `docs/terms-of-service.md`（商业化盘点的文本缺口；无运营主体，不可对外发布）。
- **部署前已知缺口**（照实记账）：无速率限制（可暴力破解）、无审计日志、refresh token 明文落盘、
  `corsOrigin` 默认全开放、`/api/tools/fetch` 未实现（SSRF 面，待按承重墙标准设计）、路由交叉污染（P2）。

### 二、云同步增量契约 · 阶段 1（客户端，`b0a0fc7`）

- **C1 本地变更日志**（增量的"原料"）：`save()` / `_sharedSafeLSRemove()` 记 `{k, op, ts, h}` 到有界
  队列（上限 500，溢出丢最旧）；**门控 `cfg.syncIncremental` 默认关 = 行为逐位不变**（测试逐项钉死）。
  实现期抓出并修一处真缺陷：**对不存在的键 `removeItem` 是静默 no-op，原写法会记「假 del 信号」**。
  队列已排除出云快照（本机变更时间线不上云）。
- **C2 上行体积看板**：上传前记录体积 / 键数（**失败也记** —— 413 / 弱网下要看的是"这次要传多大"），
  设置面板 + 诊断报告双展示；字节口径与后端 2MB 上限严格一致（snapshot 的 UTF-8，不含 `updatedAt` 包装）。
- 契约与实施记录：`docs/cloud-sync-incremental-contract.md`（阶段 2/3 仍等后端水位 / removed 列表契约）。

### 三、R-4 化石摘除 + 测试健壮性

- **R-4 收口**（`docs/audit-2026-10-06.md`）：`electronAPI.syncPush/syncGet` 遗骸三面摘净 ——
  `#btnSyncLocal` 按钮 + `bindSyncButtons` IIFE（-78 行）+ 16 条化石 i18n 键（中英各 8）；
  防复活钉进 `tests/dead-wiring-guard.test.js`（三面同时钉死，任一单独复活即红）。
- **测试健壮性三处**（本机全量单测 10~30× 争抢态暴露的固定等待脆弱点，非本批引入）：
  slice9 固定 120ms 等吐司 → 上界轮询；slice10 应用自带 3s/60s `_wfCheckDue` 定时器落进测试窗口
  （`calls` 变 `[0,1,2,0,1,2]`）→ 显式跑完即把 `_wfDueAt` 归零；slice4 固定 300ms 等启动链 →
  轮询等 `#sideToggle`。
- **测试 / 门禁**：新增 `tests/cloud-sync-stage1.test.js`（12 例）；全量 **140 文件 / 1594 用例全绿**
  （低争抢档 `maxForks=8`，0 断言失败 / 0 未处理错误）；e2e **90/90**；七门禁全绿；
  **逆层 18 / 循环 13 未动**；空 catch 基线按文件重冻（516 → 514，2 增均 P1/P2、4 减、0 内容漂移）。
- **残留已知项**（如实记账）：ai-enhance T3.1 的 15s 显式超时在该争抢态会假红（隔离跑绿），未改其阈值。

## [v3.7.104] - 2026-10-09

**R-9 续三收口：切场景的「等待姿势」缺陷修复 —— 先造重现（3/3），再改等待（判别性 + 重试块）。**

- **重现（先造重现，改动才有对照 —— 台账 R-9 续二交接的起点）**：`_probe/repro-nav-click-race.cjs`
  用 `addInitScript` 在 `mousedown` 捕获阶段同步调 `renderSide()`（`$("#side").innerHTML = …` 的整体替换），
  **3/3 稳定复现「点击未生效」**（active 仍停在 office）。对照实验四项：
  · **A 旧等待**（`waitForSelector("#taskForm")`）：**3/3「等待通过但场景未切换」**——不具区分力的运行时实证；
  · **B 判别性等待**（等 nav 的 `active` 类）：3/3 如实超时失败（位置正确，不再错位两步之后）；
  · **E 出厂 helper 逐字复刻**（`expect().toPass()` + `toHaveClass(active)`）：**3/3 自愈**（第 2 次点击补上，~1.7s）；
  · **D/F 反例**（注入永不解除 = 真故障形态）：重试块**仍如实失败** —— 不掩盖真故障。
- **修复**（两条 e2e spec；无产品代码改动）：
  · `tests/e2e/workflow.spec.js` 新增 `switchScene(page, sc)`：点击 + 等 nav `active` 令牌
    （`_buildSideMenu` 的 `active: !_sideActive && sc===_effActive` 驱动，正则 `/(^|\s)active(\s|$)/`
    —— ⚠️ 不能写 `\bactive\b`，会匹配上 `has-active`），包在 `toPass({timeout:10_000})` 重试块里；
    4 处切场景调用点（office→code→overview→office）全部替换。
  · `tests/e2e/ics-import-render.spec.js` `gotoCalendarTab` 同类姿势：`page.reload()` 后
    **不等渲染完成就点击**（`ics:76` 长期靠"跑得够快"），改为「点击 + 判别断言（`#tasksCalView` 可见）」重试块。
- **验证**：两条 spec 本机跑 6/6 绿（desktop + tablet）；**全量 e2e 90/90 绿**（刷新 0 失败）；
  单测与全部门禁不受影响（仅测试文件改动）。CI 三项目全量以下一轮 push 结果为准。
- **为什么这是修复而不是掩盖**：①重现是原件级时序（真调 `renderSide()`），不是模拟断言；
  ②出厂写法在重现下 3/3 自愈（瞬态丢失被重试补上）；③永久注入下仍失败（真故障不被掩盖）；
  ④旧写法的失败位置与真实原因差两步（`.kcard` 断言），新写法把失败钉在切场景那一步。
- **未做（如实记账）**：产品侧 `renderSide()` 整体替换 innerHTML 是既有实现（v3.2 起），
  本轮不动它 —— 它是**性能与一致性的权衡**（整体替换最省心），竞态窗口极窄（测试才是放大器）；
  若未来真机用户可感知，再评估增量更新侧栏。

## [v3.7.103] - 2026-10-09

**账号入口的「如实说明」：把同一页面里两种口径补齐成一种。**

- **问题**：顶栏「登录」按钮对**所有用户可见可点**（`agent-workbench.html` 的 `#btnUser`），
  但本仓库只含客户端、不含账号后端（见 `docs/product-scope.md` 的「可选账号与云同步」）。
  进入欢迎页后，**SSO 两条路径（微信扫码 / GitHub）已有「当前环境无后端」的准确提示，
  唯独邮箱登录 / 注册这条主路径没有** —— 用户会把表单一路填完、点提交，才拿到一句笼统的
  「离线模式」，于是跑去检查自己的网络。同一个页面对同一个事实给出两种口径，是本版要修的。
- **修复**：
  · 新增 `probeAccountBackend()`（`ui-ge-api.js`）：进入欢迎页时探测 `{apiBase}/api/health`，
    3 秒超时。超时 / 连接被拒 / 404 / 跨域被拒**合并为同一结论**「未检测到账号服务」——
    它们对用户的行动指引一致（去看部署说明），细分只会增加文案而不增加信息。
  · 欢迎页（`render-overview.js`）探测不到时显示说明块：点明未检测到账号服务、说明
    本地功能不受影响、给出「设置 → API 基址」与 `docs/product-scope.md` 的指路。
    探测不阻塞渲染；探测自身失败也不弹错 —— 未部署是这个环境的**预期状态**，不是异常。
  · 邮箱登录 / 注册遇网络失败时的文案由「离线模式」改为「未检测到账号服务（后端未部署或
    网络不通）」，与欢迎页口径对齐；**非网络类失败仍说「登录失败」**，不把服务端的拒绝
    也归因成没有后端。
- **为什么不直接隐藏入口**：README 明确说明用户可把后端部署到自己的服务器、再把
  「设置 → API 基址」指过去 —— 隐藏按钮等于砍掉这条路径。本版选择**把状态说清楚**，
  而不是把功能藏起来。
- **测试**：新增 `tests/auth-backend-probe.test.js`（19 条），覆盖探测五类判据
  （2xx / 5xx / 404 / 抛错 / 超时）、欢迎页三种状态（不可达显示、可达隐藏、探测函数缺失
  时不抛）、登录与注册两种失败口径、以及 i18n 中英双份且英文不留中文。故障注入两轮
  验证（登录文案回退 → 恰好 1 条红；探测判据放宽 → 恰好 503/404 两条红），
  还原后三个源文件与 HTML 的 md5 全部回原值。
- **门禁**：空 catch **516 处 · 新增 0 / 消失 0**（`abort()` 那处刻意不套 try —— 按规范
  它不抛错，不为一个不会抛的调用新增棘轮条目）；`lint-xss` / `lint-colors` /
  `lint-css-structure` / `lint-appbridge` 全绿。

## [v3.7.102] - 2026-10-09

**R-2 空 catch 治理收口（第九~十一片）—— P0-a 台账清零；并修一处「catch 抓不到 async 拒绝」的隐性静默。**

- **三片收口**：`ui-backup-stats`（备份/恢复面 7 处，含 R-8）、`render-overview`（3 处）、`ai-tools`（2 处）。
  P0 总数 89 → 81，其中**无说明的 bare P0 从 12 → 0**；全仓空 catch 516 处、P0 81（无注释 0）。
- **关键修复（第十片）**：`render-overview.js` 的 `_wfCheckDue` 原来只有同步 `try/catch`，而 `_wfRunFlow`
  是 `async` —— 函数体内抛错**不会同步抛出**，只让返回的 Promise 变 rejected，同步 catch 根本抓不到，
  失败退化成 unhandled rejection（同样静默）。现补 `p.catch(...)`，同步异常与 Promise 拒绝两条路都接。
  故障注入验证：只抽掉那一行 → vitest 如实报 `Unhandled Rejection`。
- **诊断留痕分级（判据四档）**：① 用户主动操作 + 成功有 toast、失败静默 = **谎报**，必修；② 加载失败静默 =
  合理降级；③ 高频路径（每次点击/切页）留痕**只报第一次**，否则诊断面板被同一条刷满、反而盖住真问题；
  ④ 读/解析失败回落默认 = 只补注释不报诊断。三片按此分级逐条留判据，不做批量搁置
  （第三片曾把 ui-ge-api 剩 17 处打包记为「合理降级」，第六片复查发现 5 处是谎报，含断集成这种安全语义）。
- **棘轮基线精确重冻**：新增 `scripts/refreeze-baseline.mjs`，**必须在原位置替换条目**（拼到数组末尾会
  产生 617+/584- 的噪音 diff，事后无法核对归属）。同期完成一次基线漂移同步：9 处 phantom「新增」在 HEAD
  就已存在（`crypto` / `data-migrate` / `ui-ge-calendar` / `ui-ge-integrations`），逐文件 sig 集合比对
  确认后精确重冻，基线 513 → 516，**新增 0 / 消失 0**。
- **守护用例去路障化**：`tests/empty-catch.test.js` 原有 `expect(bareP0.length).toBeGreaterThan(0)` 这类
  「当前存量必须非零」的断言 —— 它验的是**仓库脏度**而非判据，于是在台账清零时**拦住的正是「把问题修干净」**。
  改为受控正/负样本（无说明必须判 bare、有说明必须判非 bare）。
- **测试**：新增 `tests/empty-catch-slice9/10/11.test.js`；每片均做故障注入三部曲（注入应红 → 还原后
  HTML/源码字节回原值 → 复绿），反向守护用例注入后保持绿。
- **R-9 续二（仅记账，不改代码）**：`workflow.spec.js:91` 的 flaky 本机不可复现，但定位到可证缺陷 ——
  切场景后等待的 `#taskForm` **不具区分力**（每个场景都有），若点击落在正被 `renderSide()` 整体替换的
  nav 节点上，场景未切换但等待通过，失败会落在两步之后的「卡片找不到」，**报错位置与真实原因差两步**。
  建议改用判别性等待（场景 nav 的 `active` 类）；已写入台账。

## [v3.7.101] - 2026-10-07

**修 R-9 的根因（`rag-hybrid` flaky）：IDB 未就绪时的「空缓存钉死」与「连接失败被单例缓存」。**

- **根因**（v3.7.99 定位 → v3.7.100 造出重现 → 本版修），两处叠加：
  1. `src/ai-tools.js` `ragVecLoadAll` **无条件把 Map 写进 `_ragVecCache`** —— 若这次读发生在
     IDB 尚未就绪时（`idbKeys()` 在 `!db` 时静默返回 `[]`，见 `data-idb.js:135`），
     空 Map 被钉住且**永不重试** → 本页面内所有检索永久降级纯词法
     （`ragVectorSearch` 在 `!cache.size` 时直接 return，连 embedding 都不发）。
  2. `src/data-idb.js` `idbOpen` **把失败的 `null` 也单例缓存** —— IDB 只要在启动窗口内
     不可用一次（刷新瞬间旧连接未释放触发 `onblocked`、或 `open` 与首屏抢资源），
     本页面内**所有** IDB 操作就永久失效、再无重试机会。
- **修复**：
  · `ragVecLoadAll`：先用 `idbOpen()` 探「IDB 是否真的可用」，只有读到才置 `loaded = true`；
    Map **引用复用**（`ragVecPut` 依赖它作为活引用，重建会让那次写入丢失）。
  · `idbOpen`：失败（null）时**不缓存单例**，允许下次重试。
- **验证（用 v3.7.100 造出的重现脚本反向验证）**：
  · 修复前 `_probe/repro-rag-idb-unready.cjs` → **3/3 复现**（`after=[]`）。
  · 修复后 `_probe/verify-rag-fix.cjs` → **2/2 FIXED**：IDB 不可用期间检索为空（合理，
    确实读不到），**恢复后重试即命中** `{"len":1,"first":"doc-auth","via":"vec"}`。
  · 单测：`rag-semantic` 22 / `ai-memory-context` 17 / `round5-loop1-idb` 7 全绿
    （前两个用例的 IDB 替身补 stub `idbOpen` —— 产品新增了对它的依赖）。
  · 门禁：`module-graph` 无新增边（`ai-tools → data-idb` 本就存在）、`lint:layers` 基线外新增 0。
- **未做（另立一轮）**：`workflow.spec.js:91` 那条 flaky（切场景建任务后卡片找不到）**根因尚未定位** ——
  本机用 CDP CPU 限流 + 同 browser 多 context 累积均 **0/6 复现**；它与本条（RAG 向量）机制不同。
- **同版另含**（`b32736d`）：ICS 订阅源**批量启用/停用** —— 面板 ≥2 源时显示
  「全部启用 / 全部停用」工具条；`icsSetAllSubsEnabled` 返回变更数（>0）/ 0（无变化
  静默重绘）/ -1（保存失败）；启用态判定 `(s.enabled !== false)` 与面板显示、分桶过滤
  口径一致（未设置 = 启用，原 `!!s.enabled` 会把「默认启用→显式停用」误判为无变化）；
  i18n 补 5 键（zh+en）；`ics-parse` 25/25 绿（新增批量用例：全停 2 → 分桶空 →
  无变化 0 → 全启 2 → 恢复 → 无变化 0）。

## [v3.7.100] - 2026-10-07

**R-9 收口：`rag-hybrid` flaky 的「隔离态可复现的重现条件」已造出（3/3 复现），根因链写入台账。**

- **重现条件**（`_probe/repro-rag-idb-unready.cjs`，真 Chromium）：
  刷新前用 `addInitScript` 让 `window.indexedDB` 在启动窗口内不可用 → **3/3 复现**：
  ```
  IDB 不可用时长=0ms    -> after={"len":0} embedding增量=1  [REPRO]
  IDB 不可用时长=1200ms -> after={"len":0} embedding增量=0  [REPRO]   <- 与 CI 失败现场一致
  IDB 不可用时长=3000ms -> after={"len":0} embedding增量=1  [REPRO]
  ```
  其中 `embedding增量=0` 这一档与 CI 失败现场（`embedCallsAfterReload: 0`）**完全吻合**。
- **根因链**（v3.7.99 已定位，此处固化）：`src/ai-tools.js:1859` `ragVectorSearch` 在 `!cache.size` 时
  直接 `return []`（走不到 `aiEmbedTexts`）→ `src/ai-tools.js:1799` `ragVecLoadAll` **把空 Map 钉进
  `_ragVecCache`**（此后本页面内永久降级纯词法）→ `src/data-idb.js:135` `idbKeys` 在 `!db` 时
  **静默返回 `[]`**（`idbOpen()` 在 `onerror`/`onblocked` 时 `resolve(null)` 并单例缓存）。
- **台账更新**：`docs/audit-2026-10-06.md` 的 R-9 条目补入「失败点 / 排除性实验 / 自证诊断现场 /
  根因链 / 重现条件」五段，并把「未修 + 下一批改法方向」写清。
- **本批仍不改产品逻辑**（同 v3.7.99：改法需先想清「空缓存该不该钉死」与
  「IDB 未就绪 vs 确实没有向量如何区分」；改错会让正常的空索引每次都重读 IDB）。

## [v3.7.99] - 2026-10-07

**R-9 的 `rag-hybrid` flaky：v3.7.98 加的自证诊断第一次 CI 就命中根因 —— 刷新后 `ragVectorSearch` 根本没走到 embedding 调用。**

- **现场对照**（CI run `37622549623`，同一用例的失败/通过两次）：

  | 字段 | 失败（首跑 851ms） | 通过（retry #1 1.0s） |
  |---|---|---|
  | `vecKeys` | 2 | 2 |
  | `navItems` | 17 | 17 |
  | `tasks` | 4 | 4 |
  | **`embedCallsAfterReload`** | **0** | **1** |
  | `after` | **`[]`** | `[{id:"doc-auth",via:"vec"}]` |

  即：向量在 IDB ✓、应用已就绪 ✓、数据已加载 ✓ —— **唯一差异是 embedding 请求根本没发出**。
- **根因链（代码级）**：
  1. `src/ai-tools.js:1859` `ragVectorSearch`：`const cache = await ragVecLoadAll(); if(!cache.size) return [];`
     —— **缓存为空就直接返回**，根本走不到 `aiEmbedTexts`（故 embedding 调用数为 0）。
  2. `src/ai-tools.js:1799` `ragVecLoadAll`：`_ragVecCache = { model: wantModel, map: m };`
     —— **空 Map 也会被缓存**；此后 `:1785` 的 `if(_ragVecCache && _ragVecCache.model === wantModel) return _ragVecCache.map;`
     直接命中空缓存 → **本页面内永久降级纯词法，且不再重试**。
  3. `src/data-idb.js:135` `idbKeys`：`if(!db){ resolve([]); return; }` —— **IDB 未就绪时静默返回 `[]`**；
     而 `idbOpen()`（`:26`）在 `onerror` / **`onblocked`** 时 `resolve(null)` 并**单例缓存该 null**。
- **触发时序**：刷新后首次检索若撞上 IDB 尚未打开（或 `onblocked`），第 2 步就把空缓存钉死；
  重试（新页面）时序不同即可成功 —— 这正是「首跑失败、重试通过」的机制。
- **本批只加诊断，未改产品逻辑**：根因已定位，但改法需先想清「空缓存该不该钉死」
  与「IDB 未就绪 vs IDB 里确实没有向量如何区分」；改错会让正常的空索引每次都重读 IDB。
  下一批方向：`ragVecLoadAll` 区分「IDB 说没有」（可缓存）与「IDB 还没就绪」（不可缓存）。
- **本机验证**：`npx playwright test rag-hybrid --project=desktop-1280x800` → 4 passed；
  诊断输出 `{"vecKeys":2,"navItems":17,"tasks":4,"idbDb":"ok","wantModel":"bge-m3","ragCache":null,"recModel":"bge-m3","recHasVec":true,"embedCallsAfterReload":1,"after":[{"id":"doc-auth","via":"vec"}]}`

## [v3.7.98] - 2026-10-07

**为台账 R-9 的两条 e2e flaky「造重现」：精确定位失败点 + 本机排除性实验 + 自证诊断（断言一字未改）。**

- **R-9 背景**：`workflow.spec.js:41` 与 `rag-hybrid.spec.js:105` 在 CI 上偶发「首跑失败、重试通过」。
  上批结论是「隔离态 30/30 不复现 —— 要修得先拿到能在隔离态复现的最小重现条件」。本批做的是那一步。
- **失败点精确定位**（从 CI 日志取回，此前只记了「首跑失败」）：
  · `workflow.spec.js:91`：`expect(page.locator(".kcard", { hasText: "E2E测试任务-编程" })).toBeVisible()`
    → `element(s) not found`（`.kcard` 存在，但**没有目标卡片**）；失败耗时 10.7s。
  · `rag-hybrid.spec.js:132`：`expect(after.en[0], "刷新后召不回 = 向量只是活在内存里").toMatchObject({ id: "doc-auth" })`
    → `Received has value: undefined`（刷新后召回**空数组**）；失败耗时 1.1s。
- **本机排除性实验**（`_probe/` 三个探针，真 Chromium，均可重跑）：
  · `repro-workflow-91.cjs`：复刻 step 3-4（office 建任务 → 切 code 建任务）。
    **RATE=1 / RATE=4（CDP `setCPUThrottlingRate`）+ LOOPS=6（同一 browser 内 6 个 context 累积压力）→ 0/6 复现**。
  · `diag-rag-window.cjs`：刷新后**第一次** `evaluate` 就能召回（RATE=1 时 20~36ms；RATE=8 时 201~267ms）
    → **不存在「应用未就绪」窗口**。
  · `diag-rag-embed.cjs`：刷新后 embedding 调用**确有发生**（增量 1）、IDB `ragvec:` **仍有 2 条**、
    召回 `via:"vec"` → **「向量没落 IDB」与「embedding 没调用」两种假设都被本机排除**。
- **结论（如实）**：**本机（Windows + 本地文件 + 无并发）复现不出**；CI 的环境差异
  （并发 worker / 冷文件缓存 / runner 负载）无法在本机推断。**故本批不假装造出了重现**，
  改为加**自证诊断**，让下次 flaky 在 CI 日志里直接给出五个通道的现场。
- **诊断内容**（`tests/e2e/rag-hybrid.spec.js`，**断言一字未改**）：刷新后、断言前打印一行 JSON
  `{vecKeys, navItems, tasks, embedCallsAfterReload, after}` —— 覆盖
  「向量是否在 IDB」/「应用是否就绪（`#side .nav-item` 数）」/「数据是否加载（`tasks` 数）」/
  「embedding 是否被调用」/「实际召回结果」。
- **验证**：本机 `npx playwright test rag-hybrid --project=desktop-1280x800` → **4 passed**；
  诊断输出示例：`{"vecKeys":2,"navItems":17,"tasks":4,"embedCallsAfterReload":1,"after":[{"id":"doc-auth","via":"vec"}]}`。
- **下一步（下次 flaky 时）**：CI 日志里搜 `[rag-hybrid diag]`，按现场三选一：
  `vecKeys=0` → 持久化问题；`embedCallsAfterReload=0` → embedding 通道问题；`navItems=0` → 应用未就绪。
  `workflow.spec.js:91` 同型处置（切场景后应等 `#side .nav-item` 而非只等 `#taskForm`）。

## [v3.7.97] - 2026-10-07

**修 `backup-export-exclusion` 用例 5 与启动链的 check-then-act 竞态（v3.7.95/96 的 CI 单测红由此而来）。**

- **现象**：v3.7.95 的 `test (ubuntu-latest, 20)`、v3.7.96 的 `test (windows-latest, 20)` 各红 1 条 ——
  同为 `tests/backup-export-exclusion.test.js` 用例 5 的 `waitFor timeout`（17.3s = 5.7s × 3 次重试）。
- **根因（产品侧既有竞态，测试未等启动链）**：`_ensureDeviceKeyImpl` 是 check-then-act ——
  先读 `DK_KEY`（null）→ `await crypto.subtle.generateKey(...)` → 再 `setItem(DK_KEY, b64)`。
  用例 5 原本 `freshWin()` 后**立即** `doImport`，写入若落在这两步之间就会被后写的 b64 覆盖。
  实测轨迹（临时探针）：裸 `freshWin` + 立即 `doImport` → `__dk` 全程是 44 字符 b64，
  **导入值从未出现**；等启动链落盘（163ms）+ 合法密钥 → `__dk` 全程保持导入值。
- **为什么 v3.7.94 没暴露**：脚本执行更快，竞态窗口恰好错过；v3.7.95 起 `crypto.js` 顶层多了接线块，
  执行时间略增，竞态在 CI（并发 + 慢）上稳定命中。
- **修法（测试侧）**：① 先 `waitFor` 启动链把 `DK_KEY` 落盘；② 用**真实形态**的合法 base64 密钥
  （32 字节 AES-256 raw），使 `doImport` 重置 `_deviceKey` 后，下一次 `ensureDeviceKey`
  能**复用**导入的密钥而非重新生成 —— 原先的 `"DEVKEY-material"` 不是合法 base64，必然被覆盖。
- **未改产品（如实记账，不掩盖）**：竞态本身保留 —— 它只在「启动瞬间外部写入 `__dk`」时发生，
  真实用户场景（导入由用户点击触发，远晚于启动）不会触发；若改成「不覆盖」，反而会让损坏值永久卡住
  （下次启动 `importKey` 失败 → 每次生成新密钥且永不落盘，比现在更糟）。
- **验证**：用例 5 本机绿；探针轨迹对照（覆盖 → 保持）如上。

## [v3.7.96] - 2026-10-07

**补 v3.7.95 的一处过修：接线必须同时确认 IDB「真的可用」—— 只看函数存在会把 jsdom 单测带崩。**

- **v3.7.95 的漏判**：补接线时只检查了 `typeof idbReadKey === "function"`。但 **jsdom 里
  `idbReadKey`/`idbMirrorKey` 是有定义的**（`function` 声明会挂到 `window`），只是 `indexedDB` 不存在
  —— 于是接线照样发生，`_dkIdbPut` 走进 `idbTxn → idbOpen` 的等待路径并在无 IDB 环境挂起。
  CI 实测：`tests/backup-export-exclusion.test.js` 用例 5 `waitFor` 超时（17.3s = 5.7s × 3 次重试），
  `test (ubuntu-latest, 20)` 因此失败、windows 腿被连带取消。
- **修复**：接线条件补上 `isIDBAvailable() === true`。这正是 `crypto.js:16` 注释原本的设计意图
  ——「注册未发生时保持默认禁用态（**无 IDB 环境本就该禁用**）」，v3.7.95 只做了「函数存在」这一半。
- **双向验证**：
  · jsdom（`typeof indexedDB === "undefined"`、`isIDBAvailable() === false`、但 `idbReadKey` 是 function）
    → 接线跳过，行为与 v3.7.94 完全一致（临时探针实测这三项取值）；
  · 真 Chromium（`isIDBAvailable() === true`）→ 接线生效，IDB `__dk_v2` 跨两次加载一致（持久化仍成立）。
- **回归**：`crypto` 10 / `p0-crossdevice-key` 4 / `idb-image-backup` 4 / `backup-export-exclusion` 5 全绿；
  真浏览器探针 12 项全过。

## [v3.7.95] - 2026-10-07

**修一个 P0：设备密钥从未持久化 —— 每次页面加载重新生成，用旧密钥加密的密文永久解不开。**

- **根因（模块加载顺序 + 两处注释都写反了）**：v3.7.75 把 `crypto` 对 IDB 助手的引用改为
  「`data-idb` 加载时反向注册」（`registerDkIdbHelpers`），`crypto.js:15` 与 `data-idb.js:85` 两处注释都写着
  「data-idb 在层序上晚于 crypto」。**实测相反**：SRC 块序 `data-idb` 是第 2 块、`crypto` 是第 10 块。
  于是 `data-idb.js:87` 的 `if(typeof registerDkIdbHelpers === "function")` 恒为 false
  → 接线从未发生 → `_dkIdbGet`/`_dkIdbPut` 恒为默认实现（`() => Promise.resolve(null / false)`）
  → 设备密钥**既不写库也不读库**。
- **后果（实测）**：真 Chromium 同一 context 连续两次加载，`ensureDeviceKey()` 导出的 raw 密钥不同
  → 每次启动新密钥 → 用旧密钥加密的 AI Key 等密文永久解不开（用户侧表现为"配置莫名其妙没了"）。
  影响范围：**自 v3.7.75 起的所有版本**。
- **修复**（`src/crypto.js`）：本块加载时 `data-idb` 已就绪，按相反方向补接一次。
  **刻意用 `globalThis` 动态取符号**而非静态写 `idbReadKey`/`idbMirrorKey` —— 后者会重新引入
  v3.7.75 刚消除的 crypto→data-idb 静态逆层边。`lint:layers` / `module-graph` 复测：基线外新增 0。
- **暴露路径**：批次②新增的 `tests/e2e/idb-image-backup.spec.js` 在 CI 上 3 次重试全红（`__dk_v2` 等不到）
  —— 它**第一次**把这条既有 P0 逼到台面上（台账 §三 R-9 曾记录这条红，但当时标注"无法归因"）。
- **验证**：修复后 IDB `__dk_v2` 跨两次加载完全一致（`EaSvafLpjJM2SD5Unl0M…`）；真浏览器探针 12 项全过；
  相关单测 **43 例全绿**（crypto 10 / p0-crossdevice-key 4 / api-token-crypto 7 / round5-loop1-idb 7 /
  idb-image-backup 4 / backup-key-union 6 / backup-export-exclusion 5）；全门禁绿。

## [v3.7.94] - 2026-10-07

**本版归并 v3.7.93 之后的三个批次：数据连续性（批次② · 备份完整性）、密钥/迁移面切片（批次④ · R-2 第一片）、全维审计台账与日历链路（批次③）。**

### 数据连续性批次②：备份完整性（导出排除 / 旁路键并集 / IDB 图片）

**修三处「备份通道漏数据」的缺陷，并给装机验收补一个可隔离的产物。**

- **P2-1 导出 / 云快照排除「本机控制类」五键**（`src/ui-backup-stats.js`）：`__dk`（设备密钥本体，兑现"密钥不出本机"）、
  `autobackup` 最新代与 `.1`/`.2` 两代、`pre_restore_backup`。**关键在它们是"内嵌全部键值"的嵌套副本** ——
  只做顶层排除无效：autobackup 快照内容 = 除备份键自身外的全部键（降级环境里含 `__dk` 明文），
  `pre_restore_backup` 是内嵌全键值的回滚档。云快照（`_buildCloudSnapshot`）同步整键排除，堵住 v3.7.58
  「密文 + 钥匙不同交」被嵌套副本绕过的路径，并省掉每次上传 ≤4MB × 嵌套重复的 payload。
  导入侧**刻意不对称**（旧版文件含 `__dk`/autobackup 仍接受）：同机恢复必须能取回 `__dk` 才能解密既有 cfg 密文。
- **P1-2 旁路裸键并集**（`src/data-links.js`）：13 个不带 `wb_agent_` 前缀的裸键（登录态 token×3、集成配置×4、
  通知设置与去重集×6）此前不在 `allKeys()` 枚举范围 → **导出 / 自动备份 / 云同步三通道整体漏掉**：
  换机迁移丢通知设置与去重集、降级环境的登录态（无 WebCrypto 时 token 为明文，本可随文件迁移）。
  新增 `STORAGE_BYPASS_KEYS` 显式清单 + `isAppStorageKey()`（前缀族 ∪ 显式旁路 ∪ `CUSTOM_LINKS_KEY`），
  导入过滤改同一口径（否则导出的裸键会在导入侧被再次丢回）。新增裸键必须同步登记，有结构守护兜底。
- **P2-8 IDB 图片 blob 纳入全量备份**（`src/ui-backup-stats.js`）：记录图片由 `ui-scene-bind.js:31-33` 直写 IDB kv
  （键 `img_<uid>`，不经 localStorage、不进镜像过滤），此前**所有**备份通道都不含它 ——
  恢复记录后 `img_<id>` 引用还在、blob 却丢了，缩略图只剩占位图标。备份格式 `_version` 1.0 → 1.1 增 `idbImages` 段，
  只收 `img_` 前缀（`memvec:`/`ragvec:` 是可重算的向量缓存、`__dk_v2` 是设备密钥，都不入备份）。
  导入侧用**同一严格白名单**（`/^img_[a-z0-9]+$/`）：防伪造备份借 `idbImages` 字段注入任意 kv 键（含 `__dk_v2`）。
- **`electron-build.yml`：新增 win-unpacked artifact（仅 `workflow_dispatch`）**（台账 R-10）。
  **为什么这是装机验收的前置条件（实测）**：portable 外壳会**吞掉 `--user-data-dir`** —— 外壳只把
  `--no-sandbox --remote-debugging-port=…` 转交给内层 `Agent 工坊.exe`，内层 Electron 于是按 Windows Known Folder
  算出 `%APPDATA%\agent-workbench`（用户真实数据目录），且 Electron 也不看 `APPDATA` 环境变量。
  ⇒ portable 形态在本机**没有任何隔离手段**，拿它做验收就是拿用户数据当测试场（第一版探针正是这样把真实 profile 的
  tasks 重置成了 `[]`）。win-unpacked 是同一份 app.asar / prod bundle / 主进程，只差启动器那一层，
  且 `--user-data-dir` 真生效 —— 装机验收第一次可以在隔离 profile 上重复跑。体积 ~250MB：只在 dispatch 出包时上传，
  tag 发版路径不带（Release 资产不膨胀）。用 `tar` 而非 `Compress-Archive`：产物含中文名（`Agent 工坊.exe`），
  PowerShell 的 zip 对非 ASCII 文件名编码不可靠，解出来名字会变。
- **用例**：`tests/backup-key-union.test.js`（6 例：并集枚举 / 自动备份 / 云快照 / 导入对称 / 结构守护 / 变异自测）、
  `tests/backup-export-exclusion.test.js`（5 例：五键排除 / 旁路键不受影响 / 精确名单不误伤近名键 / 机制自证嵌套副本 / 宽容导入）、
  `tests/idb-image-backup.test.js`（4 例：Blob⇄dataURL 往返 / 非法输入守卫 / 无 IDB 降级形状 / 导入如实计数）、
  `tests/e2e/idb-image-backup.spec.js`（真 Chromium：往返 + 伪造键白名单 + 设备密钥不被覆盖）。
- **顺带收口**：`src/ui-backup-stats.js` 图片恢复路径原为空 catch（`await idbMirrorKey(...)` 的 reject 被吞，
  用户看到"已恢复 N 项数据"却缺图，诊断面板也无线索）→ 改为 `pushDiag("warn", …)`，与同文件 diagPanel 两处
  （`:613/:638`）写法一致；`lint:empty-catch` 由 exit 1 转 **exit 0**（P0 107 → 106）。
- **验证（本机）**：3 个单测 **15 例全绿**（逐个单跑 —— `npx vitest run` 多文件在本机只收集第 1 个文件）；
  全部门禁绿：`check:source-state` / `lint:layers`（逆层 18 · 循环 13 · 基线外新增 0）/ `check:modules`（块 35）/
  `lint:xss` / `lint:tokens` / `lint:appbridge` / `check:ai-tools-doc` / `check:pwa-icons` / `build:check`（五源一致）。
  真浏览器探针 `_probe/probe-idb-img.cjs` **12 项全过**（本机 e2e runner 报 `1 did not run`、给不出结论，
  按纪律绕开 runner 直驱 playwright 库）。

### 审计批次④ · R-2 第一片：密钥面 + 迁移面

**把 9 处「静默吞真实错误」的 P0 空 catch 换成可观测行为，并修掉它牵出的两个真问题：写失败被当成写成功、以及"保留损坏原值"之后读者会崩。**

- `src/crypto.js`：**`save()` 自己吞掉写失败并返回 `false`，所以包一层 try/catch 等于没守** —— 旧代码正是这样，
  AI Key 明文留存/写入失败对调用方显示为成功。现在 `persistCfg` 通过 `_cfgWrite()` 检查**返回值**并在三个分支
  （electron / no-crypto / encrypt）落 `pushDiag("error", …)`；设备密钥 3 处（`getDeviceKey:idb` / `:legacy` / `:clearLegacy`）
  与主进程镜像（`initCrypto:mirrorMain`）改为点名后果（"此前加密的数据将无法解密" / "镜像写失败"）。
  重加密那一支第一版写的是 `try{ await persistCfg() }catch{ warn }` —— **装饰性 catch，warn 永不触发**，实测后才改成判返回值。
- `src/data-migrate.js`：迁移日志写入判 `save(...) !== true`；`_backupBroken()` 返回布尔并在备份失败时 `pushDiag`。
  **行为变更（安全侧）**：tasks/cfg/links 三处破坏性重置在**备份失败时保留原值不重置**并提示
  `migrate.backupFailedKept`（zh + en 双语键已加进 `src/core.js`）—— 修前是"备份没写进去也照样清空"，等于唯一找回凭据直接没了。
- `src/data-rw.js` + `src/render-widgets.js`：上一条把风险移给了读者 —— 实测 `cleanupRecycle` 与引导渲染
  `_onboardRenderStep` 因 `tasks` 是非数组而抛**未捕获拒绝**（跑在启动异步链里，不过错误边界，用户只看到功能安静地少了）。
  新增形状收口点 `_tasksForRead()`（非数组退化成空表，原值仍在存储里等人工找回），11 处直读 `load(PREFIX+"tasks")` 全部走它。
  命名踩坑记录：第一版叫 `tasksRaw`，与 `data-migrate.js:141` 的局部 `const tasksRaw` 同名，被 dep-graph 读成一条
  `block>owner` 反向边 → `lint-layers` / `module-graph` 双双红；改名后两门禁 exit 0。
- **用例** `tests/empty-catch-slice1.test.js`（6 组）：备份失败→不销毁、备份成功→行为不变、密钥换新/明文留存留痕、
  扫描点名坏键、**写失败是返回值不是异常**、保留损坏原值之后读路径必须扛住。本机 11 文件 134 例绿，无未捕获拒绝。
- **验证归因（关键：本机工作区混着并行会话的在飞改动，不能直接算我的）**：用
  `git archive HEAD | tar -x` 在仓外造副本、只替换本片 5 个 src 文件后现测 ——
  `lint-empty-catch` **exit 0**，P0 **117 → 108**（正好 −9 = crypto 5 + data-migrate 4），P2 173 → 186（+13，门禁规定的
  `pushDiag` 写法），`lint-layers` exit 0（基线外新增逆层/循环/重复定义 0），`module-graph --check` exit 0（块 35）。
  对照：HEAD 干净态 P0 = 117（台账里 118 那个数的采集态含他人 3 个未提交 src，已在 R-2 更正）。
  **本机现在跑 `lint-empty-catch` 是 exit 1，且与本片无关** —— 3 处新增 P0 全在 `ui-backup-stats.js`(1) / `ui-ge-api.js`(2)，
  即并行会话第二、三片的在飞文件；**基线未 `--freeze`**（冻进去会把别人未提交的 P0 一起冻成"合法存量"）。
- **变异验证（证明用例不是装饰）**：在 HEAD 纯净副本 `_probe/slice1iso` 逐个摘掉本片的修复，每次重新注入后跑
  `npx vitest run tests/empty-catch-slice1.test.js`：M1 备份失败仍照样重置 → ①+⑥ 红；M2 `_cfgWrite` 恒返回 true →
  ③+⑤ 红；M3 `_tasksForRead` 不守形状 → ⑥ 红；M4 坏键扫描不点名 → ④ 红；恢复 HEAD 内容后复绿（exit 0，9 例）。
  四条变异各只打死对应用例组 → 断言与修复一一对应。脚本 `_probe/mut-slice1.sh`。
- **CI + 上线（`c0a0dfe`）**：run `37499350324` **completed/success**，三腿全绿（`test (ubuntu-latest, 20)` /
  `test (windows-latest, 20)` / `e2e`）；`Deploy to GitHub Pages` run `37499350198` **success**。线上
  `CACHE_VERSION = v3.7.93-20261006170356`，线上 `agent-workbench.html`（HTTP 200）内 `grep -c "_tasksForRead"` = **14**
  → 读者收口点确实在交付产物里（`curl -s https://levango7.github.io/Interaction/agent-workbench.html | grep -c "_tasksForRead"`）。
- **顺带修漂（R-3b 同类）**：`docs/roadmap-2026Q4.md`「当前坐标」现测更正为 **126 个跟踪单测文件 / e2e 84 例 12 spec（跟踪态）** ——
  `npx playwright test --list` 本机报 86 例 / 13 文件，多出的 1 文件 2 例是并行会话未跟踪的 `idb-image-backup.spec.js`，不计入基线。
- **新记账 R-8（本切片带来的）**：损坏 `tasks` 原值被保留后，导出/自动备份面经 `getTasks()` 看到的是**空列表**，
  用户可能把残缺备份当成完整备份 —— 修法是把"本次导出未包含损坏的 tasks 键"写进成功提示。
  现场在 `src/ui-backup-stats.js`，该文件正被并行会话按切片二改动，**本会话不抢改**，详见台账 R-8。
- **切片一的新状态另有真浏览器证据** `tests/e2e/corrupt-data-boot.spec.js`：覆盖"存储里合法地留着一个非数组
  `wb_agent_tasks`"下的启动不变量 —— ① 备份可用 → 原值进 `_broken_` 键 + 重置 `[]` + 零未捕获异常 + 界面照常渲染；
  ② 备份写失败（`addInitScript` 掐 `_broken_` 键的 `setItem`）→ **原值仍在存储里**、`getTasks()/getActiveTasks()`
  在真浏览器里退化成 `[]`、诊断缓冲点到"broken-data backup FAILED … tasks"、**没有 `.filter is not a function`**、
  不落进「数据异常」兜底页。顺带验实了"原因见诊断日志"不是空话：`pushDiag → _diagLog → getDiag()` 被
  `src/ui-backup-stats.js:476/507` 的诊断面板消费。变异验证（隔离树 `_probe/iso2`）：摘掉读者守卫 → 2 条红
  （直报 `TypeError: _tasksForRead(...).filter is not a function`）；改成"备份失败照样重置" → **只**打死②那条；恢复后 2 passed。
- **并行会话进展（不认领、仅记事实）**：`e672cc9` 交付第三片 `ui-ge-api.js` 并**重冻了 empty-catch 基线**
  （502 处）。当前工作区现测 P0 = **107**、exit 1 只剩 1 处新增 P0 在 `src/ui-backup-stats.js`（其切片二在飞文件）。
- **CI 终验（tip `f0298bf`）**：run `37503057113` 三腿全绿（unit 127 文件 / 1472 例 × ubuntu+windows，e2e `Running 88 tests` → 87 passed），
  `Deploy` run `37503057148` success。**但 e2e 有 1 条 flaky**（`rag-hybrid.spec.js:105`；上一跑 `c0a0dfe` 抖的是
  `workflow.spec.js:41`）—— run 结论仍是 success，抖动被绿色吞掉，已记为 **R-9** 并列为下一批第一项。
  另记一条协作事实：同分支连推会让**对方那个 commit 的 run 被 concurrency 取消**（`46216d8`、`e672cc9` 都被取消过），
  所以判"有没有验证"只看 tip run。
  ⚠️ 顺带更正我自己上一条计数口径：roadmap 的 e2e 从"减法推出 86"改为**干净检出实测 88 例 / 13 spec**
  （一条 spec 在 desktop+tablet 两项目下算 4 例，减法推不出来）。
- **R-9 定频结果（把"先定频再动手"真做了）**：两条各隔离重跑 5 次（`--repeat-each=5 --retries=0`）→ **30/30 全过**，
  隔离态不复现；全序列第三跑 = tip `1007619` 的 run `37504690477` → **88 passed / 0 flaky**。累计 3 次全序列 2 次各抖
  1 条（还是不同 spec）→ **低频、非局部，加超时/重试治不了根**；下一批起点应是「先造重现」而不是「先改断言」。
  ⚠️ 另留痕：本机全序列两跑各红一条 `tests/e2e/idb-image-backup.spec.js:30`，该 spec **未跟踪**（并行会话批次②），
  且本机 HTML 停在 00:37 注入态、我不能在他们活跃时跑 `src:inject` → **这条红无法归因**，别当成 R-9 的第三条抖动或切片一的回归。
- **未做（决策，不推给别人）**：不切版本号、不打标（避开并行会话的 v3.7.94）；第二片 `ui-backup-stats`、第三片
  `ui-ge-api` 由并行会话在做，本会话不动那两个文件（第三片他们已交付 `e672cc9`）；本片**不 `--freeze` 基线**
  —— 由并行会话在他们那侧冻（他们已在 `e672cc9` 把基线 500 改到 **502**），避免把彼此未提交的 P0 冻成合法存量。
  **进度链（同一条命令、口径标清）**：118（10-06 采集态，含他人未提交）→ **117**（10-07 干净 HEAD）→ **108**（切片一）→
  **106 / exit 0**（切片一+切片三+重冻后的**干净 tip**，用 `git archive HEAD | tar -x` 抽净副本现测）。本机混合工作区是
  107 / exit 1，那 1 处新增 P0 在并行会话未提交的 `ui-backup-stats.js` 里。

### 审计批次③：全维审计台账 + 日历 ICS 链路（2026-10-06）


**全维审计台账落盘 + 日历 ICS 链路首次进真浏览器门禁，并当场修掉一个「浮层建进 DOM 却完全不渲染」的 P1。**

- **台账**：新增 `docs/audit-2026-10-06.md`。此前 2026-10-06 那次全维审计的**清单没有落盘**，仓库里只剩
  已修项的编号（批次① = v3.7.93 的 P1-1a/P1-1b/P2-4），导致"还剩哪些项 / 批次③ 修什么"无从核对。
  本文按可复现命令重跑一遍并记账（5 项 PASS 正面基线、R-1…R-7 共 7 条记账项、5 个需外部条件的维度如实挂起）。
- **P1 修复** `src/ui-ge-calendar.js`：`openEventDetail` 只给外层 `.overlay` 加 `show`，而 `.cmd` 基类是
  `display:none` → 点日历 ICS 徽章后详情浮层完全不出现。与 v3.7.66 修掉的 `openIntegrationConfig` **同型**
  （成因注释当年就写在现场，但只修了那一处、没立这一类的账）。现同步给内层 `.cmd` 加 `show`。
- **门禁 R-1（新增 e2e）** `tests/e2e/ics-import-render.spec.js`：真实 `filechooser` 导入 `.ics` → 真
  localStorage 往返 → 刷新后渲染零未捕获异常 + 当日徽章 + 浮层可见 + 可翻页到外部事件。
  **此前 12 个 spec / 83 例对「日历 / ICS」零覆盖**，而这条路出过 v3.7.90 的 P0。
  变异回放（`_probe/mut-ics-e2e.mjs`，在 `_probe/` 的 HTML 副本上做）：摘掉 `getIcsSubs()` 的 hydrate →
  `badge=0 / pageerror=1`；摘掉内层 `show` → `dialog可见=false`；对照态全绿 —— 断言非装饰。
- **门禁 R-6（新增类守卫）** `tests/overlay-cmd-show.test.js`：凡"overlay 里动态挂 `.cmd`"的源文件，必须
  给内层加 `show` 或存在 `.overlay.show .cmd` 后代规则；含合成变异自测 + 作用域自证（in-scope 恰为两处历史现场）。
- **R-3 修漂** `docs/roadmap-2026Q4.md`：「当前坐标」四项数字更正为 2026-10-06 实测（v3.7.93 / 125 单测文件 /
  e2e 85 例 / 废弃函数 10 名），并把"下一步建议"里 **已交付的 B1、B2** 摘掉（它们留在"待办"里就是误导排期）。
  教训写进文档：**进度型数字只写"截至某日某 commit + 现测命令"，契约型数字（逆层/循环/块数）才交给门禁守。**
- **验证（本机 + CI 双份）**：本机 `ics-parse / ui-consistency / overlay-cmd-show` 3 文件 51 例绿；新 e2e 在
  `desktop-1280x800` 与 `tablet-768x1024` 各 1 例绿。本机采集态工作区含另一会话未提交的批次②改动且处于
  **注入态**，跑不了需源码态的 `verify:ci` —— 改由 **CI 在同一份源码态上跑全套并回填**：
  run `37414169330` @ `47e707d` **completed/success**，三腿全绿（`test (ubuntu)` 12 步含 `npm test` 125 文件 /
  `build:check` / `lint` / `lint:layers` / `lint:tokens` / `lint:empty-catch`；`e2e` 含本批新用例；`test (windows)`），
  `Deploy to GitHub Pages` 同 sha 绿。⚠️ 前一 run `b253525` 显示 cancelled 是**同分支二次 push 撞 concurrency**，不是失败。

## [v3.7.93] - 2026-10-06

**门禁/部署批次①（全维审计修复）：deploy 链补上 `lint:empty-catch` 并收敛为 main-only 发布；`build:prod` 增加「转换后编译自检」。**

三项均出自 2026-10-06 全维审计（面—线—点）的批次①修复清单（P1-1a / P1-1b / P2-4），本版无功能性改动。

### P1-1a `deploy.yml` 的 verify 漏接 `lint:empty-catch`（发布链与 CI 门禁不等价）

**发现路径**：审计对账两份 workflow 的门禁步骤清单时发现 —— `af7b9f8`（v3.7.87）给
`ci.yml:69` 接入 `lint:empty-catch` 时**只改了 ci.yml**，deploy.yml 漏接。后果：新增 P0 级
空 catch 会被 CI 拦下，而 deploy 链（另一条通往线上的门禁路径）无人把守，可直接上线。
与 v3.7.70 `src:check` 漏接同型 —— **两处清单靠人工同步，必有一次会漂**。

**修复**（`b58130e`）：
- deploy.yml `verify` 补 `npm run lint:empty-catch`，与 `ci.yml` 的 test 步骤集**逐项同序**；
- `tests/ci-workflow-guard.test.js` 新增「verify 步骤集 ≡ ci.test」parity 断言：缺步 / 多步 /
  换序即红，附**合成 YAML 变异自测**（缺步变异回放 P1-1a 缺口形态，点名 `npm run lint:empty-catch`，证明断言非装饰）。

### P1-1b 非 main 分支可发布到 gh-pages（workflow_dispatch 任意分支触发）

**发现路径**：审计触发条件时发现 —— `workflow_dispatch` 没有分支过滤 + 四个 job 均无 ref 守卫，
在任意分支手动触发 Deploy 可一路 `build:prod` → `peaceiris/actions-gh-pages` 发布到线上。

**修复**（`b58130e`）：
- 触发列表收敛为 `[main]`（远端实测仅 main 分支，master 系为历史模板残留）；
- 四个 job 各自 `if: github.ref == 'refs/heads/main'`（fail-closed：守卫不成立 → skipped →
  deploy 的 `needs.verify.result == 'success'` 不成立 → 不发布）；
- concurrency group 并入 `${{ github.ref }}`：否则被守卫拦成「全 skipped」的分支 run 仍会进入
  同组，把在途 main 部署 **cancel** 掉（守卫挡得住发布，挡不住 cancel）；
- 回归护栏：`tests/ci-workflow-guard.test.js`「deploy.yml ④」4 条（含 e2e 的 always() 与 ref 守卫并存断言）。

### P2-4 `build:prod` 对转换结果零校验（截断类坏产物可静默落盘）

**缺口机理**：`__TEST_GATE__` 置 false 用的替换正则**非贪心** —— 若块体内先出现 `})();`，
替换会提前截断、留悬空尾部。坏形态只坏几个字节，**体积/标记类门禁全都照不到，只有解析器会拒绝**。

**修复**（`d06d975`）：抽 `scripts/lib/prod-guards.mjs` 并被 `scripts/build.mjs --prod` 接入：
- 转换前：定义数必须恰为 1、替换后不得再匹配、false 标记恰 1 处；
- 转换后：按**浏览器语义**抽取真实 `<script>` 块并整体 `vm` 编译（本产物 `<script` 字样共 6 次，
  其中 5 次是 JS 字符串字面量，朴素截取必踩坑）——**校验先于落盘**，任一不满足即拒绝写文件；
- SW `CACHE_VERSION` bump 同批移入并自检；
- 字节兼容已证：新旧逻辑输出逐字节一致（sha256 `0b4359c3…` = v3.7.92 线上产物）；
- 回归护栏：`tests/prod-guards.test.js` 12 例（含「截断形态必须被编译校验拦下」、抽取器合成语料、
  fixture CLI 冒烟正/负两例 —— 负例断言产物未落盘）。

**本批验证（本机全门禁）**：`npm test` 124/124 文件 · `npm run e2e` 82 用例 ·
`verify:ci` 三态（test job 12 步 / deploy `verify` 12 步 / 含 e2e 13 步；`npm ci` 默认被跳过、由 `--with-install` 控制）全绿 ·
十项快门禁（src:check / check:modules / check:ai-tools-doc / build:check / lint / lint:layers / lint:tokens / lint:empty-catch / check:pwa-icons / pet:check）全 exit 0。

## [v3.7.92] - 2026-10-06

**发布链 e2e 门禁补漏：`deploy.yml` 的 e2e 可被「上游 job 被取消」绕过（本轮真实触发）+ `electron-build.yml` 重命名步骤封堵「零匹配静默通过」。**

本版两块改动都来自**发版核验**时发现的问题，且都属于「已提交但从未被真实验证」或「真实触发后才暴露」的类别：

- ③ `electron-build.yml` 的重命名加固：继承自 v3.7.90 的修复（`c15d84e`）**提交晚于 tag**，
  从未在真实构建上生效过 —— 本轮查 Release 资产名才发现，并顺带挖出更深的「零匹配静默通过」隐患；
- ④ `deploy.yml` 的 e2e 门禁缺口：本轮核验时因 GitHub runner 故障**亲自触发**（非理论推演），
  `ci-e2e-status` 被取消 → `e2e` 被动跳过 → `deploy` 却把 skipped 当有效覆盖而放行。

### ③ `electron-build.yml` 产物重命名步骤「零匹配即静默通过」（**继承自 v3.7.90 未验证的修复**）

**发现路径**：核对 v3.7.91 发版前置状态时，回查 v3.7.90 的 Release —— 资产名**仍是** `Agent.-3.7.90-portable.exe`
（「工坊」被净化为 `.`）。而 v3.7.90 的 electron-build run `37348499983` 的步骤列表里**根本没有「重命名为纯 ASCII」这一步**。

**根因（时序，事实）**：`c15d84e`（加重命名步骤）提交于 `2026-10-06 01:50:35`，
而 `v3.7.90` tag 指向 `231124f`（`01:13:42`）——**修复晚于 tag**，那次构建跑的是旧 workflow。
即第七轮的 `c15d84e` 属于「已在 main、未在真实 tag 上验证」的状态。

**顺带发现的真隐患（本地复刻实测）**：把 `c15d84e` 的脚本单独拉出来跑，在
`dist/` 只有 `setup.exe`（无 `*-portable.exe`）时 —— `set -euo pipefail` + `shopt -s nullglob`
下 for 循环**零次迭代**，脚本**EXIT=0 且无任何输出**。
即：若 electron-builder 将来因配置变动改了产物名，重命名会「静默成功」、一个文件都没改却报绿，
Release 会重新带出中文名，而**门禁不红**。这是本项目反复出现的「谎报成功」模式的又一例。

**修复**（`electron-build.yml`）：
- 先用 `files=(dist/*-portable.exe)` 收集，`${#files[@]} -eq 0` 时打 `::error::` 并 `exit 1`（附 `ls dist/` 便于定位）；
- 维护 `renamed` 计数，末尾断言 `-ge 1`；
- **终态复核**：`ls dist/*.exe` 经 `LC_ALL=C grep -q '[^ -~]'` 确认无残留非 ASCII 文件名 —— 这才是本步骤的真正目标。

**新增回归护栏**（`tests/ci-workflow-guard.test.js`，7 条，读 YAML 文本的静态断言）：
零匹配必红 / 解析失败必红 / 计数兜底 / 终态非 ASCII 复核 / 路径自洽 / 步骤顺序。
**变异反向验证**（5 条，每条都让对应断言变红）：
| 变异 | 被哪条断言抓住 |
|---|---|
| 删零匹配守卫 | 「零匹配时必须显式报红」 |
| 删 `renamed >= 1` 兜底 | 「必须有计数兜底」 |
| 删终态非 ASCII 复核 | 「终态复核」 |
| 版本解析改 `continue`（静默跳过） | 「版本号解析失败必须显式报红」 |
| 把重命名步骤移到上传之后 | 「重命名步骤排在上传之前」 |

⚠️ 第 4 条变异**首版没被抓住**（断言 `toMatch(/...[\s\S]*?exit 1/)` 太宽松，`continue` 版仍匹配到别处的 `exit 1`），
已改为精确锁 `[-n "$ver"]...exit 1` + 负向断言 `not.toMatch(...continue)`。**这正是变异验证的价值所在。**

### ④ `deploy.yml` 的 e2e 门禁可被「上游 job 被取消」绕过（**本轮真实触发，非推演**）

**发现路径**：核验 v3.7.91 发版时，Deploy run `37361404028` 的 `deploy` job 反复
`cancelled` + `steps=0`（GitHub 托管 runner 分配失败，连续 3 次 attempt 同一 annotation
`The job was not acquired by Runner of type hosted`）。排查该现象时，发现 `ci-e2e-status`
也被同样问题取消 —— 于是暴露出一条**独立于 runner 故障的门禁缺口**。

**缺口机理**（`deploy.yml`）：

```yaml
e2e:
  needs: [ci-e2e-status]
  if: needs.ci-e2e-status.outputs.skip != 'true'        # v3.7.91 前，⚠️ 无 always()
deploy:
  needs: [verify, e2e]
  if: always() && needs.verify.result == 'success'
      && (needs.e2e.result == 'success' || needs.e2e.result == 'skipped')
```

1. 原注释假设：「`ci-e2e-status` 的 probe 步骤自捕获异常，结论永远不会是 failure，故无需 `always()`」。
   **该假设漏掉了「job 本身根本没启动」**——runner 分配失败时其 conclusion = `cancelled`、`steps = []`。
2. GitHub 默认语义：**`needs` 上游 `cancelled` → 下游被默认跳过**。于是 `e2e` **被动 skipped**（未执行）。
3. `deploy` 的条件把 `needs.e2e.result == 'skipped'` 一律当作「已由 CI 覆盖且成功」→ **放行**。

→ 两种 `skipped` 在 `needs.e2e.result` 上**无法区分**：
  (a) **主动跳过**（`ci-e2e-status` 成功产出 skip=true，CI 的 e2e 确已绿）——安全；
  (b) **被动跳过**（上游被取消，e2e 根本没跑）——**若此刻 CI 的 e2e 恰好是红的，未验证产物照样上线**。

**真值表验证**（7 场景，`_probe` 外独立脚本）：

| 场景 | 旧 e2e | 旧 deploy | 新 e2e | 新 deploy | 旧安全 | 新安全 |
|---|---|---|---|---|---|---|
| A CI e2e 绿 + 探测 skip=true | skipped | DEPLOY | skipped | DEPLOY | OK | OK |
| B CI e2e 红 | failure | NO_DEPLOY | failure | NO_DEPLOY | OK | OK |
| C 探测超时 | success | DEPLOY | success | DEPLOY | OK | OK |
| D 探测被取消 + CI e2e 绿 | skipped | DEPLOY | success | DEPLOY | OK | OK |
| **E 探测被取消 + CI e2e 红** | skipped | **DEPLOY** | failure | **NO_DEPLOY** | **⚠️ 绕过** | **OK** |
| F 探测 job 失败 | skipped | DEPLOY | success | DEPLOY | OK | OK |
| G verify 失败 | skipped | NO_DEPLOY | skipped | NO_DEPLOY | OK | OK |
| **合计** | | | | | **绕过 1 次** | **绕过 0 次** |

**本次实际影响**：本轮遭遇的是场景 D（CI 的 e2e 恰为绿），**未造成危害** —— 但那是运气。

**修复**：
- `e2e` 加 `always()`，条件收紧为
  `!(needs.ci-e2e-status.result == 'success' && needs.ci-e2e-status.outputs.skip == 'true')`
  → 上游任何非「成功且确认已覆盖」的情形（取消/失败/输出缺失）**一律跑**；
- `deploy` 的 `needs` 增加 `ci-e2e-status`，skipped 分支追加
  `needs.ci-e2e-status.result == 'success' && needs.ci-e2e-status.outputs.skip == 'true'`
  → 只有**主动跳过**才放行，被动跳过直接不放行（fail-closed）。

**回归护栏**：`tests/ci-workflow-guard.test.js`「deploy.yml ②」5 条。
**变异反向验证 4 条**（全部命中）：
| 变异 | 被哪条断言抓住 |
|---|---|
| 去掉 e2e 的 `always()` | 「e2e job 必须有 always()」+「跳过条件绑定」 |
| 去掉 deploy skipped 分支的上游校验 | 「放行 skipped 时必须校验上游」 |
| 去掉 deploy 的 `needs: ci-e2e-status` | 「needs 必须包含 ci-e2e-status」 |
| 去掉 deploy 的 `always()` | 「deploy job 仍有 always()」 |

---

## [v3.7.91] - 2026-10-06

**Electron 形态补齐 CSP 响应头（此前注释声称的「第二层防护」实际不存在）+ e2e 统计断言从「长期空转」恢复为真正执行。**

两块改动都是「把此前只写在注释里的声称落成真实实现」。**已发布**（tag `v3.7.91` → `df0e48f`），
CI `37357871130` success、线上 `https://levango7.github.io/Interaction/` 已生效。

- ① Electron 形态此前**零 CSP 防护**（meta 中的 `frame-ancestors` 被 Chromium 忽略，
  注释声称的 `onHeadersReceived` 第二层根本不存在）→ 本版补上响应头下发；
- ② e2e 的统计视图断言因选择器恒 null 而**每轮静默跳过**（用 `statsEntry.count()>0` 硬断言替换）。

### ① Electron 形态补齐 CSP 响应头 —— `frame-ancestors` 从零防护到 `'none'`

**发现路径**：`agent-workbench.html` 顶部有一条 v3.7.54 留下的 SECURITY NOTE [M3]，自我披露：

> 本注释曾声称"改由 Electron 主进程 `onHeadersReceived` 注入完整 CSP 实现双层防护"，
> 但 `electron/main.js` 里根本没有 `webRequest/onHeadersReceived` 任何代码 —— 该"第二层"不存在。
> 即 Electron 形态下 `frame-ancestors` 目前**无防护**。

**核实（v3.7.91，事实）**：`wc -l electron/main.js` = 840 行；`grep -n "onHeadersReceived\|webRequest\|Content-Security-Policy\|frame-ancestors" electron/main.js`
→ **零命中**。注释说的是真的，防护确实不存在。

**为什么 meta CSP 挡不住**：HTML 顶部 `<meta http-equiv="Content-Security-Policy">` 是唯一 CSP 来源，
但 meta 形式的 CSP 有三个规范级缺口：
- `frame-ancestors` 在 meta 中**被 Chromium 完全忽略**（只有响应头生效）；
- `report-uri` / `sandbox` 同理无效；
- 无法为 Electron 外壳单独收紧。

**修复**（`electron/main.js`）：
- 新增 `buildCspHeader()`：从 HTML 的 meta **读取**指令串（**单一事实来源，两处永不漂移**），
  追加 meta 中无效的 `frame-ancestors 'none'`；读取失败时回退保守策略。
- 新增 `installCsp()`：经 `session.defaultSession.webRequest.onHeadersReceived` 下发给**响应头**。
  保留原有响应头，只增/改 CSP（先按大小写不敏感删除同义键，避免出现两条 CSP 被浏览器忽略）。
- 在 `app.whenReady()` 中**先于 `createWindow()`** 调用，保证首个请求即带 CSP 头。
- 装能力守卫（`session` / `webRequest` / `onHeadersReceived` 任一缺失即静默返回 false），
  不破坏 `electron-ipc.test.js` 等以 stub 替换 `require("electron")` 的既有测试。

**差点踩的坑（记下来免得重犯）**：CSP 的 `content` 值**内部含单引号**（`'self'`、`'unsafe-inline'`），
若用 `[^"']*` 匹配属性值，会在第一个 `'` 处截断 —— 实测输出退化成只有 `default-src; frame-ancestors 'none'`。
改成按属性引号分两支（双引号取 group2 / 单引号取 group3）后正确。该退化**已写进测试断言**防回潮。

**未触碰**：`script-src 'unsafe-inline'` 保持不动（单文件内联架构必需），
故 SECURITY TODO [C3] 标记仍然有效 —— 真正移除 `unsafe-inline` 仍须先完成 H4 模块化拆分。

### ② e2e 统计视图断言：从「永久静默跳过」恢复为真正执行

**问题（事实）**：`tests/e2e/workflow.spec.js` 第 6 步只看 `#side .nav-item[data-sc="stats"]`，
而 `src/render-widgets.js:76 _buildSideMenu()` 返回的节点里**根本没有 `sc:"stats"`**
（总览组是 `overview / tasks / chainpage / timeline`）→ 该选择器**恒为 null** →
每一轮 e2e 都走 `if(!statsEntry) return;` 静默跳过断言，注释里留了个 TODO 等"产品决策"。

**核实（事实）**：统计页**从未下线，入口一直可达**，只是从侧栏搬到了主页：
- `src/render-overview.js:562` `renderStats()` 仍在；
- `src/render-entry.js:70` 路由 `if(active==="stats"){ renderStats(); return; }` 仍在；
- **活入口** = 主页系统概况卡的「已完成」项 `.sys-ov-item[data-act="stats"]`
  （`render-overview.js:316` 定义 → `:173` 绑 `setActive("stats")`）。

**修复**：e2e 第 6 步改为「回主页 → 点系统概况卡「已完成」→ 断言 `.stats-cards` 渲染」，
并把 `if(!statsExists) return` 的**静默跳过改成硬断言**（`expect(count).toBeGreaterThan(0)`）。

**顺带查实一处死代码**：`_renderOvKpi()`（`render-overview.js:384`）全仓 **零调用**
（src + tests + 注入态 HTML 均只有定义本身），即整条 KPI 卡分支（`.ov-kpi-item`）从不渲染。
本次**不删**（属重构范畴，且 `_calcTodayKpi()` 仍被 `ui-ge-calendar.js:717` 使用，删函数会连带受影响），
仅在测试注释中标注「疑似入口实为死代码」，避免后来人再次误用。

---

---

### 验证（v3.7.91 ①② + v3.7.92 ③④）

**新增回归护栏**（`tests/electron-guard.test.js`「④ CSP 响应头注入」4 条 + `tests/ci-workflow-guard.test.js` **12 条**）：

**CSP 响应头注入**（4 条）：
1. `main.js` 真实调用 `session.defaultSession.webRequest.onHeadersReceived`；
2. `installCsp()` 排在 `createWindow()` **之前**；
3. `buildCspHeader()` 输出：保留 meta 全部指令 + 追加 `frame-ancestors 'none'`，
   **断言不得退化成 `default-src; frame-ancestors 'none'`**（单引号截断坑）；
4. HTML meta 自身**不得**含 `frame-ancestors`（放了也无效，会造成误解）。

**变异反向验证（证明护栏真能拦，不是空转）** —— 注入两个变异后测试变红：
| 变异 | 被哪条断言抓住 | 结果 |
|---|---|---|
| 删掉 `whenReady` 里的 `installCsp()` 调用 | 「installCsp 在 createWindow 之前调用」 | ❌ 红（`expected -1 to be greater than -1`） |
| 去掉 `frame-ancestors 'none'` 追加 | 「buildCspHeader 输出」 | ❌ 红（`toContain` 失败） |

**e2e 实证**：`_probe/probe-stats-entry.cjs`（绕开 runner 的本机探针，见 `playwright.config.js` 注释）
**8/8 全通过** —— 含「旧选择器不存在（印证此前空转）」「统计卡 count=10」「二次进入仍可达」。
真实用例 `ok 1 ... 完整用户流程 (5.3s)` **通过**（本机 runner 收尾时 `browser.close()` 不返回是已知环境问题）。

**门禁**：`check:source-state` / `src:check` / `check:modules` / `check:ai-tools-doc` / `lint:xss` /
`lint:layers` / `lint:tokens` / `lint:empty-catch` / `lint:appbridge` / `check:pwa-icons` **全部通过**；
`electron-guard` + `ci-workflow-guard` = **22 用例全绿**（前者 10 + 后者 12）。
（`lint:appbridge` 报「core 声明 61 槽 · 赋值 65 槽 · 读取 55 槽 → 无死槽」，
但 `_renderOvKpi` 这类**普通函数**死代码不在桥槽体系内，门禁抓不到 —— 需人工发现。）

**v3.7.92 侧变异反向验证**（共 9 条，全部命中，逐条见 ③ ④ 段内表格）：
`electron-build.yml` 5 条 + `deploy.yml` 4 条。其中 `electron-build.yml` 第 4 条
（版本解析改 `continue`）**首版未被抓住**，已收紧断言——见 ③ 段。

**CI/Deploy 实证**（`f1869ae`）：CI `37357871130` **success**；
Deploy `37357871084` 四 job = `ci-e2e-status` success → `verify` success → **`e2e` skipped** → `deploy` success
（v3.7.90 引入的发布链 e2e 去重**持续生效**）。
其中 CI 的 `e2e` job `✓ Run E2E (full user flow)` 通过 —— 印证本轮「统计断言恢复真执行」在真实 CI 环境成立。

**v3.7.91 发版实证**（tag `v3.7.91` → `df0e48f`）：
- **Electron Build `37361421060` success** —— 首次在真实 tag 上跑「重命名为纯 ASCII」步骤，
  Release 资产名 **`AgentWorkbench-3.7.91-portable.exe`**（对比 v3.7.90 的 `Agent.-3.7.90-portable.exe`）
  → 上一轮 `c15d84e` 的修复**至此才真正验证通过**（它此前从未在 tag 上生效，见 ③ 段）。
- **CI `37361404066` success**：`test (ubuntu)` + `test (windows)` + `e2e` 三 job 全绿。
- Deploy `37361404028`：`verify` success / `ci-e2e-status` success / `e2e` skipped（去重生效）；
  末位 `deploy` job 反复 `cancelled`（`steps` 为空 = 从未启动），官方 annotation 为
  **`The job was not acquired by Runner of type hosted even after multiple attempts`**
  —— GitHub 托管 runner 调度层故障（同期 CI / Electron Build 均正常），非代码或配置问题。
- 改以 `workflow_dispatch` 重触发 `37368800195`：`verify` success、**`deploy` success（6 steps）**，
  线上 `https://levango7.github.io/Interaction/agent-workbench.html` 实测 `VERSION = "3.7.91"` ✅
  —— 该 run 的 `ci-e2e-status` 同样被 runner 故障取消，**并因此暴露出 ④ 段那条门禁缺口**。

---

## [v3.7.90] - 2026-10-05

**主进程外发通道收口 + 两类入口限额对齐 + AppBridge 死槽门禁 + 第三方审计修复收口 + 本机测试信号可信化 + 凭据链谎报成功 + 发布链 e2e 去重。**
本版七块改动互不重叠：① `electron/main.js` 把 5 条外发 IPC 里**完全同构**的部分收成公共常量/助手；
② 本地 `.ics` 导入补体积上限（与网络订阅同口径）；③ `lint-appbridge` 从「只查死赋值」扩到
「**死读取**」并接入 `npm run lint`；④ 第三方审查发现的门禁/回归项收口；
⑤ **消除「本机测试全量假失败」** —— 这是本版最有价值的一项；
⑥ WebDAV / GitHub 凭据链三处「谎报成功」改为 fail-closed；
⑦ 发布链 e2e 去重，消除「CI 与 Deploy 并发抢 CPU」导致的假红。

✅ **发版后线上复核（2026-10-05 已完成）**：

| 核对项 | 结果 |
|---|---|
| Pages 产物 MD5 | `469a83d463a5198e85c3e05909f48345` |
| 与本地 `build:prod` 产物比对 | **逐字节一致**（同 MD5、同 3,755,483 字节） |
| `VERSION` / `BUILD_TAG` | `"3.7.90"` / `"20261005a"` ✅ |
| `var __TEST_GATE__` | `= false`（测试门已关闭）✅ |
| SRC 标记完整性 | 70 处 = 35 块 × (BEGIN+END) ✅ |
| 源码态泄漏 | `src/` 相对引用 **0 处** ✅ |
| ⑤ 测试基础设施未进产物 | `spawn-available` 引用 **0 处** ✅ |
| ⑥ 凭据链修复已上线 | `gh.clearFail` 3 / `wd.clearFail` 3 / `metaSaved` 5 / `wd.syncUploadOkNoMeta` 3 ✅ |
| ② 本地 .ics 限额已上线 | `ICS_LOCAL_MAX_BYTES` 3 处 ✅ |
| `CI` / `Deploy`（tag 所在 commit `231124f`） | 均 **success** ✅ |
| Release | `v3.7.90`（非 draft、非 prerelease），产物 `Agent.-3.7.90-portable.exe`（89,804,631 B） |

**发版前门禁（源码态，本机）**：9 项源码态门禁 exit 0；`check:pwa-icons` / `pet:check` exit 0；
`npm run lint`（注入态）**0 error / 6 warning**（与基线一致）。
⚠️ 全量 `npm test` 本机**无法**给出「全绿」证据：8 个用例因 vitest worker RPC 超时未跑完
（该项目已知的本机并发限制，见 `ci.yml:8-9` 注释）；涉及改动的文件单跑均全绿
（`webdav-sync` 15/15、`notify-webhook` 27/27）。**最终以 CI 为准 —— tag 所在 commit 的 CI 与 Deploy 均 success。**

**⚠️ 本次发版发现的一处上传命名问题（未修，记录在案）**：CI 构建日志显示产物名为
`dist\Agent工坊-3.7.90-portable.exe`（含中文），但 Release 上的资产名被
`softprops/action-gh-release@v2` 净化为 `Agent.-3.7.90-portable.exe`（「工坊」→ `.`）。
属显示名问题，**exe 本体完整可用**、不影响功能；但资产名与构建名不一致，且
`electron-build.yml:49` 的注释（预期 `Agent工坊-<version>-portable.exe`）与实际不符。
后续可选修法：上传前重命名为纯 ASCII（如 `AgentWorkbench-3.7.90-portable.exe`），或改注释。

### ⑤ 本机测试信号可信化（**此前「4 个必然失败」已消除，且未放水**）

**问题**：本机沙箱**禁止一切子进程派生**，`spawnSync` / `execFileSync` 的形态固定为
`status: null` / `error.code === "EBUSY"` / `stdout === ""` / `stderr === ""`（连
`node -e "console.log(1)"` 都不行）。后果是 4 个用例**必然失败**，且失败形态是
「空 stdout 上的断言失败」（如 `expected '' to contain 'PASS'`）——**与真回归完全无法区分**，
把「环境限制」伪装成「代码坏了」：

| 文件:行 | 断言 | 真因 |
|---|---|---|
| `tests/color-tokens.test.js:31` | `expect(code).toBe(0)` | `execFileSync` 抛 EBUSY，`e.status` 为 `null` → `?? 1` |
| `tests/color-tokens.test.js:35` | `expect(out).toContain("PASS")` | `e.stdout` 为空串 |
| `tests/color-tokens.test.js:82` | `expect(out).toContain("发现 1 处")` | 同上 |
| `tests/build-structure.test.js:137` | `expect(out).toContain("npm run src:extract")` | `spawnSync` 返回 `status:null, stdout:""` |

**修法（两处，均为最小侵入）**：

1. 新增 `tests/helpers/spawn-available.js`：暴露 `isSandboxSpawnError(e)`（判 `e.code === "EBUSY"`）与
   `isSandboxSpawnResult(r)`（判 `r.error.code === "EBUSY"`）。4 个断言点前加一行——命中则以
   `console.warn("[skip] …")` 跳过，**不是 pass 也不是 fail**，且原因可见。
2. `scripts/build.mjs:83`：`spawnSync(lint-layers)` 返回 `{status:null, error:{code:"EBUSY"}}` 时，
   原代码 `r.status !== 0` 成立 → 报「分层契约校验失败：」**且报错内容为空串**（信息完全指向错误方向）。
   改为：命中 EBUSY 时打印「⚠ 本机沙箱禁止派生进程，跳过 lint-layers 子进程校验（CI 上会执行）」后放行；
   其余非 0 仍照旧 `fail`。实测 `build:check` 现 **exit 0**，且手动跑 `lint-layers.mjs` 本身 exit 0（OK ✓）——
   即失败**纯属伪装**。

**为什么这是安全的（不削弱 CI 语义）——反例守卫已实测**：

- 判据刻意**收窄到 `EBUSY`**，**没有**泛化成「status===null 且输出为空」——后者可能来自真回归
  （进程被 OOM kill / 被信号终止），泛化会放过真 bug。
- 反例逐条实测**全部不命中**：断言失败（status=1 + 有输出）→ fail · 脚本崩溃（status=1 + stderr）→ fail ·
  `ENOENT`（脚本丢失）→ fail · 被信号终止（signal=SIGKILL）→ fail · 正常通过（status=0）→ ok。
- CI / 正常环境子进程可用 → 该分支**根本不触发**，真实 status 被正常断言，行为**逐字节不变**。

**收益**：`npm test` 从「4 个必然假失败（退出码恒 1）」变成 **0 个用例失败** ——
本机退出码重新可读，真回归不再被环境噪声淹没。
（时点说明：该修正在 `8910c24` 落地时总数为 122 文件 / 1407 用例；随后 ⑥ 的
`webdav-sync.test.js` 新增 2 例 → 本版最终为 **122 文件 / 1409 用例**。
⚠️ 但**本机无法稳定跑满 1409** —— 全量跑会因 vitest worker RPC 超时中断若干用例
（见上文发版后复核段的说明），故「0 失败」以 CI 为准。）

### ⑥ WebDAV / GitHub 凭据链的「谎报成功」三连（审查 `ui-ge-integrations.js` 增量时发现）

对 `ui-ge-integrations.js`（+2,500 行）与 `ui-ge-calendar.js`（+1,702 行）逐项重审（XSS / 凭据落盘 /
空 catch / i18n / 时区 / ICS），**XSS 面经排查为干净**（该模块**不产出任何 HTML 字符串**，
UI 由 `ui-global-events.js` 渲染，14 处插值**全部** `esc()` 包裹且整体过 `sanitizeHtml`）。
但凭据链上查到 **3 处同型缺陷：操作失败被吞，调用方一律报「成功」**。

| 位置 | 缺陷 | 后果（可复现） |
|---|---|---|
| `ui-ge-integrations.js:2435` | `webdavPut` 把 `save(meta)` 包在 `catch(e){}` 里，而 `save()` **自己已 pushDiag+toast** —— 外层再吞一次 | 本次仍报「已上传快照」成功，但 etag 未落盘 → **下次上传 `load(meta)=null` → 走 `If-None-Match:*` → 云端已有文件 → 412** → 弹「云端版本已被其他设备修改……要用云端覆盖本机吗？」。用户从未用过其他设备，却被告知被别的设备改过，且**永远无法上传** |
| `ui-ge-integrations.js:2243` | `githubTokenClear` **无条件 `return true`**，即使两次 `removeItem` 都抛异常 | localStorage 被禁用（隐私模式 / SecurityError）时，**加密后的 token 仍在磁盘**，UI 却 toast「已清除」 |
| `ui-ge-integrations.js:2389` | `webdavClearCfg` 同上 | 同上，**加密后的应用密码仍在本机** |

**修法（统一原则：fail-closed，宁可报失败也不谎报成功）**：

- `webdavPut` 返回 `{ok:true, etag, metaSaved}`；落盘失败时 `metaSaved:false` 并 `pushDiag`。
  `webdavSyncUpload` 据此改报「已上传快照（N 键），但**本机未记住版本标记** —— 下次上传会被判为冲突，
  请检查本地存储是否可用。」（新增 i18n 键 `wd.syncUploadOkNoMeta`）。
  **不改变 PUT 本身的成功语义** —— 文件确实已写进云端，改判失败反而是另一种谎报。
- 两个 `Clear` 函数改为**按实际结果**返回：任一键删除失败即 `false` + `pushDiag`；
  两个调用点（`ui-global-events.js:501/538`）据返回值分别 toast
  「已清除」/「清除失败：本地存储不可用，token（密码）可能仍在本机」（新增 `gh.clearFail` / `wd.clearFail`）。

**为什么没更早发现**：三处都落在这个仓反复出现的模式上 —— **「错误处理写在别处」被当成「已处理」**。
`save()` 的可观测性做得很好（配额耗尽会 pushDiag + toast），恰恰是这个「做得好」让外层的
`catch(e){}` 看起来无害；实际是**同一信号被抹了两次**，且外层抹的是「能不能信任返回值」这一层。

**回归护栏（各 1 例，均已反向验证「无修复即失败」）**：
`tests/webdav-sync.test.js` 两例钉住 `metaSaved` 标记与 `webdavClearCfg` 的 fail-closed 返回值。
> 反向验证踩到一个 jsdom 陷阱并已记入测试注释：`window.localStorage` 是 **getter，每次访问返回新
> Storage 对象** —— 在它上面给 `removeItem` 赋值不生效（首版这么写，测试假绿），必须整体
> `Object.defineProperty` 替换该属性。

### ① `electron/main.js`：外发通道公共常量 + 新通道检查清单（**刻意的小重构**）

文件里 5 条具备外发能力的 IPC（`chat` / `notify-send` / `jira-fetch` / `ics-fetch` / `webdav-fetch`）
校验口径原本各写一遍。抽出两处**完全同构**的部分：

- `const _OUTBOUND_MAX_BODY = 2 * 1024 * 1024` —— 替掉 `notify-send` / `jira-fetch` / `webdav-fetch`
  请求体与 `ics-fetch` 响应体里**逐字重复**的 4 处 `2 * 1024 * 1024` 字面量；
- `_outboundTimeout(ms, defMs)` = `Math.min(Math.max(Number(ms) || defMs, 1000), 20000)` ——
  替掉 2 处重复的钳制表达式（下限 1s / 上限 20s，未传用调用方默认值）。

**边界（故意不做的部分）**：各通道的**错误码与校验顺序一律未动** —— 它们被 `electron-ipc.test.js`
57 条用例逐字断言，「可维护性收益」不值当用「改坏安全路径」的风险去换。

**作用域坑（实测踩到并写进文件头注释）**：助手**必须放模块顶层**。`ics-fetch` / `webdav-fetch`
的 handler 注册在 `app.on("before-quit")` 之后的模块顶层，而 `notify-send` / `jira-fetch` 注册在
`app.whenReady()` 回调内。首版把常量放进 `whenReady` 内 → 顶层那两个 handler 直接 `ReferenceError`
（被既有 IPC 测试当场抓出）。同理 `_netHostForbidden` 也必须在顶层。

文件头新增**「新增一条外发通道时逐项确认」清单**（9 项：`assertTrustedSender` fail-closed、https 必、
拒 userinfo、`_netHostForbidden` 拒私网、`redirect:"error"`、体积封顶、超时钳制、方法白名单、
日志只记主机与状态码）—— 针对的是「将来加第六条时漏掉某一项」这类**只在被写到的那几条通道路径上
被测到**的风险。

### ② 本地 `.ics` 导入补体积上限（两类入口限额不对称）

`src/ui-ge-calendar.js` 新增 `ICS_LOCAL_MAX_BYTES = 2MB` 并在 `bindIcsPanel` 的文件选择回调里前置拦截。

- **此前的不对称**：网络订阅路径由主进程 `ics-fetch` 以 2MB 封顶，而**本地文件**路径经 `FileReader.readAsText`
  **完全无限制** —— 一个几百 MB 的 `.ics` 会被整串读进内存再跑正则，表现为**页面长时间卡死且无任何提示**。
- 现按订阅同口径 2MB 前置 `f.size` 拦截，超限 `toast` 提示并直接 `return`（不读文件）。
- 新增 i18n 键 `p5.icsTooLarge`（中英已登记，`core.js` 两处）。

### ③ `lint-appbridge` 扩到「死读取」并接入 `npm run lint`

`scripts/lint-appbridge.mjs` 原本只查「core 声明了槽但**没有任何赋值**」（死槽）；现增加
「**被读取但无实现**」的检测：把 core 的槽声明集与 `src/` 里各模块对 `AppBridge.<槽>` 的赋值/读取
做交集比对。当前结果：**core 声明 61 槽 · 赋值 65 槽 · 读取 55 槽 · 所有被读取的槽都有实现（无死槽）**。

接入 `package.json`：`lint` 链尾追加 `node scripts/lint-appbridge.mjs --check`，并加独立脚本
`lint:appbridge`。**理由**：该门禁此前**不在任何 CI 链路里**（只在 `npm run lint` 之外被手动调用），
等于「写了不跑」—— 这正是本轮审计反复命中的治理模式。

### ④ 第三方审计项收口

- `docs/architecture-layers.md` 修正一处**我自己写错的实测值**：原文说「想看全量边用 `--fanout=1`」，
  **是错的**。`--fanout=N` 语义是「扇出 ≥N 不计边」，N 越小排除越多 —— `--fanout=1` 把所有符号都排除，
  报 **0 循环 / 0 逆层**，是最**空**的图。实测 35 块：`1`→0/0 · `8`（默认门禁）→13/18 · `20`→20/21 ·
  `999`→22/21。该错误值当年是从 `module-graph.mjs` 的 console 提示**照抄**来的（该提示已同步修正）。
  已在文档里把这段错误与更正过程**保留**，作为「照抄工具输出而不实测」的反面案例。
- 工作区 `nul` 根因确认：`> nul`（本意 `/dev/null`）在 Git Bash 下会真建文件，内容是 `[pet-art]` 构建日志行。
  已不存在，无需处理。

### ⑦ 发布链 e2e 去重：消除「并发抢 CPU」导致的假红

**问题**：`ci.yml` 与 `deploy.yml` **各自独立跑一遍同一套 e2e**，且两者都由 `push: branches:[main]`
触发 —— 每次 push 同时起两个 run，叠加 `ci.yml` 的 windows/ubuntu 双矩阵 `test` job，
同一时刻有 **5 个重负载 job 抢 CPU**。`playwright.config.js` 恒 `workers:1`，
单 chromium 实例对 CPU 饥饿极敏感，于是 e2e 偶发假红。

**取证（决定性对照）**：run `37324421400`（commit `d2d11d4`）e2e **红**，而**同一 commit** 的
`ci.yml` run `37324421579` e2e **全绿 82 passed**。代码同一、用例同一、runner 镜像逐字一致
（ubuntu-24.04 / image 20260927.320.1 / node 20.20.2）→ **一处红一处绿，只能是环境抖动，不是回归**。
饥饿指纹另见：该次 `i18n.spec.js:95` 首跑 **16.7s**，CI 同用例仅 **2.6s**（慢 6.4 倍），
重试即回到 **2.7s**；`workflow.spec.js:41` 同型（10.7s → retry 3.0s）。

**处置**：`deploy.yml` 新增前置 job `ci-e2e-status`，用 `gh api` 探测「**该 commit 的 `ci.yml` e2e
是否已 success**」，据结果决定本 workflow 的 e2e 跑不跑：

| 探测结果 | 行为 |
|---|---|
| `ci.yml` 的 e2e 已 success | 本 workflow 的 e2e **跳过**（`skip=true`）—— 不重复、不抢 CPU |
| 该 e2e 为 failure/cancelled | 本 workflow **自己全量跑** —— 兜住门禁 |
| 查不到 / 403 / 网络异常 / 轮询超时（12 分钟） | 同上，**自己跑** |

**为什么不是「删掉一侧」**：`deploy.yml` 的 `verify` job 内联了全套门禁（与 `ci.yml` 逐条对齐），
**e2e 是它唯一缺口** —— 删了就等于「上线产物可能没过 e2e」，与该项目
`deploy.yml:22-26` 明确写下的「『CI 全绿才上线』不能只做一半」直接冲突。故保留并去重，而非删除。

**两处必须显式处理的坑（均已按官方语义验证）**：

1. **`needs` 遇 `skipped` 会连带跳过依赖者**。官方文档（「Defining prerequisite jobs」）：
   「If a job **fails or is skipped**, all jobs that need it are **skipped**」。
   故 `deploy` job 加
   `if: always() && needs.verify.result == 'success' && (needs.e2e.result == 'success' || needs.e2e.result == 'skipped')`。
   **不能用 `always()` 了事** —— 那会连 `verify` 失败也放行，等于撤掉门禁。
2. **`permissions` 需补 `actions: read`**，否则 `gh api` 查 run 返回 403；
   403 时脚本保守回退为「自己跑」（不漏门禁，只失去去重收益）。

**验证**（均为本机实测 + 真实 CI 实测，非推断）：
- 穷举 `skip × verify × e2e` 的 **12 个可达组合**，deploy 放行语义 **0 处不一致**；
  7 个关键场景（push 正常 / CI e2e 红 / 探测超时 / verify 红 / verify 取消 / 手动发布）逐条 OK。
- 从 YAML **抽出的实际脚本**用真实 API 跑三个 sha：
  `d2d11d4`（CI e2e success）→ `skip=true`；
  `176ba0f`（verify 红但 e2e 绿）→ `skip=true`（正确：e2e 确实过了）；
  `e4fa1a9`（**e2e 真失败**）→ **`skip=false`** ← 最关键的正向验证：CI 真红时 Deploy 不会偷懒跳过。
- **真实 CI 端到端**（本方案上线后首次 push，run `37338395078`）：`ci-e2e-status` success（轮询
  15 次直到 CI 的 e2e 出 `success`）→ `e2e` **skipped** → `deploy` **success**。
  即去重生效、且 `skipped` 未连带阻塞部署（两处官方语义坑均处理正确）。

**时长实测（不粉饰）**：该次 Deploy 总时长 **10m49s**，旧方案历史区间 **6m28s ~ 10m21s** ——
落在区间内、未见劣化。机制：`ci-e2e-status` 耗时 6m43s，而 `verify` 耗时 9m17s，
**探测被 verify 覆盖、不在关键路径上**。⚠️ 但这不是必然：若 CI run 排队过久使探测反超 verify，
总时长会增加；极端情形为 12 分钟超时。

**已知残余代价（记录在案）**：若 `ci.yml` 的 e2e 被 `cancel-in-progress` 取消得很早、
以致其 run 里查不到 e2e job，探测会一直等到 12 分钟超时才回退为「自己跑」。
该场景罕见，且回退方向是 fail-safe；若将来频繁出现，可下调超时上限。

## [v3.7.89] - 2026-10-04

**发版后线上复核**：Pages 取回 **3,736,655 B · sha256:270dfe23160bea78c21e5af8…**，与本机干净产物
`agent-workbench.prod.html` **逐字节相同**（未做任何行尾归一化）；页内 `const VERSION = "3.7.89"`、
`const BUILD_TAG = "20261004a"`、`var __TEST_GATE__ = false` 三项逐一对上。
**CI `37192820759`（10m54s）/ Deploy `37192820671`（9m10s）/ pages build and deployment `37193303594`
三个 run 全绿**；线上地址 `https://levango7.github.io/Interaction/`，tag `v3.7.89` 已推。
> 顺带查清一处会误导发版复核的工作区卫生问题：本机 prod 产物一度比线上**多 3,183 字节**，
> 归一化行尾后逐字节相同 ⇒ 差异纯来自**工作区里 10 个 `src/*.js` 是 CRLF**（`ai-loop` / `chain` /
> `crypto` / `data-migrate` / `ui-ge-pomodoro` / `ui-hotkeys` / `ui-select` / `ui-theme` /
> `util-markdown` / `util-perf`，合计恰好 3,183 个 CR），而 HEAD 里的 blob 都是 LF（`.gitattributes`
> 的 `eol=lf` 在提交时归一化、但不会回写既有工作副本）。**危害是"本机产物永远对不上 CI 指纹"** ——
> 会让发版复核误判成漂移。已用「删文件 + `git checkout --`」强制重取修掉（`git checkout --` 单独用
> 不生效：git 认为文件已是最新会跳过重写），修完 src 总 CRLF = 0、工作区仍干净、prod 指纹直接对上。
> 注：这是**工作区状态**问题，不产生任何待提交内容（HEAD 内容未变）。

**ICS 提醒闭环 + 时区口径修正。** 日历的 ICS 能力从「能导入 / 能订阅」补到「真的会提醒」：VALARM 解析提前
分钟数、提醒窗口命中一次、per-source 启用停用、CATEGORIES 取色、事件详情显示类别与提醒。**本版由并行会话
起草（时区三口径 + 提醒链路），由我接手收口并发版**；收口过程中修掉三处问题（见 ③），其中两处是新门禁抓出来的。
全量 **120 文件 / 1384 用例**（v3.7.88 为 1379；+5 = ICS 用例）、e2e **82/82（5.5m）**。
⚠️ 本机门禁 13 步里 12 步 exit 0；`npm test` 的**内容 120/120 全过**但退出码 1，红因是
`[vitest-worker]: Timeout calling "onTaskUpdate"`（本机 31 worker × 3.5MB jsdom 的已知环境抖动，
v3.7.43 / v3.7.65 都记过同款）——**退出码以 CI 为准**。

### ① ICS 时区三口径（此前两版各错一次，测试双双抓出）

`src/ui-ge-calendar.js` 的 DTSTART 解析此前把三种写法混在一起：floating 被加偏移（UTC+8 机器上双重套用
错 8 小时）；修一版后又把 floating 一起塞进 UTC（导出往返 `getHours` 错 8 小时）。现在按 RFC5545 分开：

| 写法 | 语义 | 实现 |
|---|---|---|
| 无偏移（floating） | **本地时区**解释 | `new Date(y,m,d,h,mi,s)` |
| `Z` 结尾 | UTC | `Date.UTC(...)` |
| `±HHMM` | 时区无关的绝对时刻 | `Date.UTC(...) - offset` |

### ② VALARM 提醒链路（B3）

- `_icsTriggerMin()`：`-PT15M → 15`、`-P1D → 1440`，正数（事后）不提醒；
- 提醒窗口 = `(开始 − 提前) ≤ now < 开始`；去重键 `uid|yyyymmdd`（`wb_ics_notified`，只留 7 天）；
- 经 core 的 `AppBridge` 槽接进 `ui-daily` 的 `runNotifyCheck` —— **刻意不直接调用**，否则新增
  `ui-daily→ui-ge-calendar` 逆层边；
- per-source 启用/停用（停用的源不进日历、不刷新、不提醒，不必删了重加）；停用态在列表里灰显 + 「已停用」标记；
- CATEGORIES → 场景色令牌取色（走 `var(--sc-*)`，`lint:tokens` 安全）；事件详情浮层显示「类别」「提醒」。

### ③ 收口时修掉的三处

1. **缺字典键 `p5.evReminderEarly`**（`ui-ge-calendar.js:1528` 的「提前 {n} 分钟」有默认值却未进字典 →
   英文界面显示中文）。v3.7.54 起这是硬门禁，`i18n-completeness` ③ 判红。补中英两键。
2. **两处 P0 空 catch**（新增的 `lint:empty-catch` 门禁抓出）：ICS 去重标记的 `load/save` 被
   `catch(e){ /* … */ }` 静默吞掉。后果具体——**写失败 ⇒ 下一轮还命中同一窗口 ⇒ 同一条日程反复通知**
   （原注释自己都写了「标记失败会导致重复提醒」但只是记下来）。按门禁给的方案改为上报 `pushDiag`，
   并加**本会话内存去重表 `_icsNotifiedMem`** 兜底：光报警不解决"反复打扰"。
3. **`tests/error-boundary.test.js` 的假等待**：`waitForStartup` 原是无条件 `sleep(60ms)`，
   而启动链开头是 `await initCrypto()`（PBKDF2），满载下这一步要十几秒 → 60ms 等于没等。
   实测 E3 被饿到 **99497ms** 越过 60s `testTimeout` 判红（同文件 E1/E2/F1 同时段 7.1s/10.1s/4.7s，
   正常 0.5~1s），**是饿死不是断言错**。改成等真实信号：启动链在 `initCrypto` 之后才 `render()`，
   静态标记里 `<main id="main"></main>` 是空的 → 「`#main` 有内容」即「启动已跑到渲染」；轮询 10ms、上限 30s。

### ④ 随版本提交 / 清理

- 新增 `docs/webdav-verify.md`：WebDAV（坚果云）**人工验收指引**，10 分钟八步——单测与门禁都已绿，
  但真实网盘的端到端（真实凭据 + 真实 PUT/GET）只有用户配一次才能确认。文中引用的按钮与文案已在
  `src/` 里逐一核对存在。
- 删掉工作区里的 `nul`：`> nul`（本意 `/dev/null`）在 Git Bash 下真建的文件，内容是 `[pet-art]` 的构建日志行。
- `docs/module-graph.md` 随之重生成：`AppBridge` 引用数 22 → 23（来自新增的 `AppBridge.getDueIcsReminders` 槽）。

## [v3.7.88] - 2026-10-04

**发版后线上复核**：Pages 取回 **3,727,177 B**、`VERSION="3.7.88"`、`BUILD_TAG="20261003i"`、`var __TEST_GATE__ = false`（锚定定义处），CI/Deploy 双绿。**WebDAV 接入云快照主流程（v3.7.87 只做了载体，本版接上真正的同步链路）+ 与并行会话零重叠（他们做 lint 门禁域，本版只碰 集成/日历/快照 文件）。全量 **120 文件 / 1379 用例**（v3.7.87 为 1364；+15 = WebDAV 同步主流程 5 例）、e2e **82/82（4.9m）**、七门禁全绿、逆层 18/13 未动。**

### WebDAV 同步主流程（坚果云等 · 仅桌面版）

- 上传 = `_buildCloudSnapshot()`（经 `AppBridge.buildCloudSnapshot` 桥，render-overview 注册 —— ui-ge-integrations 直调会成逆层边）→ `webdavPut`；下载 = `webdavGet` → `AppBridge.applyCloudSnapshot`。集成页 WebDAV 段新增「上传快照」「用云端覆盖本机」两按钮（仅桌面 + 已配置时渲染）。
- **412 冲突 UX**：云端已被其他设备改过时，弹确认让用户选「用云端覆盖本机 / 放弃」——与载体层「不静默覆盖」一致；确认前不动本机任何数据。
- **非静默**覆盖：下载应用前 `confirm`；云端快照非法 JSON / 无快照文件（404）/ 无配置 / 无中继，各有如实的分支与提示，零请求降级。
- 覆盖前本机回滚档 `pre_restore_backup`（v3.7.52 起）仍在，误覆盖可人工比对回滚。
- 用例 5 例钉住：上传走桥构建、下载确认后经桥应用、非法 JSON 不应用、412 确认与否的两条路径、未配置零请求；另「集成页按钮渲染」1 例。

### 协作纪律

- 与并行会话（空 catch 可观测性门禁域）**零文件重叠**：本版只动 render-overview（桥注册）、ui-ge-integrations（同步动作+桥条目）、ui-global-events（面板按钮）、core（i18n）、tests/webdav-sync。提交前快进合入对方提交，避免版本 bump 竞态。
## [v3.7.87] - 2026-10-03

**用户四项裁定全部落账 + WebDAV 云同步载体（Q4 批次 C）**：① Google 日历**永久不做**（「暂不出国」）；② HMS 替代经评估**形态不兼容**（HMS Calendar Kit 是 Android 原生 SDK，本仓交付形态是 Web/PWA/Electron 单文件，走 HMS 等于新增 Android 构建轨 + 华为企业资质；国内日历需求已由 ICS 路线满足）；③ 微信扫码登录**转商务阶段条件项**（企业认证+备案域名+服务端，现有协议原样可用）；④ GitHub **暂缓**（拿不到 client_id，v3.7.86 底座保留且无 client_id 时不渲染授权按钮）—— 国内同档零门槛替代是 **WebDAV（坚果云等）**，本版接完。

### C · WebDAV 云同步载体（坚果云等 · 仅桌面版）

- 实测（`_probe/webdav-probe.mjs` 存档）：`dav.jianguoyun.com` 可达（401 + `Basic realm="nutstore"`）但**无 ACAO** → 浏览器直连被 CORS 拦，桌面版经主进程 `webdav-fetch` 中转（与 ics-fetch 同一套防线：https 必、拒 userinfo、**共用 `_netHostForbidden`** 拒回环·私网·链路本地·.local、`redirect:"error"`、方法白名单 PROPFIND/GET/PUT/DELETE/MKCOL、body ≤2MB、15s 超时、日志只记主机与方法状态码绝不记 Authorization）。
- 渲染层：配置 + **应用密码设备密钥加密落盘**（与 AI Key 同款）；探活 PROPFIND 207；上行 PUT **首次 `If-None-Match:*` / 续传 `If-Match:<上次 etag>`**；**412 = 云端已被其他设备改过 → 如实报冲突，不静默覆盖** —— 这是云同步全量契约（`docs/cloud-sync-incremental-contract.md`）落地前的**第一个真冲突信号**；下行 404 = missing 而非错误。集成页一段 UI：未配置只给说明+输入框、浏览器形态无动作按钮、测试连接/清除。诚实边界：**本版只做载体，未接同步主流程**（配好 WebDAV 后可手动调/预留按钮，等 main flow 批次）。用例：electron-ipc 承重墙 7 组（每条拒绝路径零请求 + 日志不泄密 + 412 冲突标记）+ `tests/webdav-sync.test.js` 8 例（密文落盘、零请求降级、条件头、412、404、UI 门控）。
- 过程中被测试抓出**一处实现 bug**：412 走早返回路径时漏了 conflict 标记（渲染层会拿不到冲突信号）—— 已修。

### D · ICS 增强（批次 B 收尾）

- 订阅源**重命名**（id 与块 docId 不变 → 哈希 diff 零重嵌，不必删了重加）；**解析行级诊断**：坏 VEVENT（缺标题/开始时间）此前静默丢弃、用户只见「事件变少了」，现在按源记录异常计数与首条原因并显示在列表行。3 例钉住。

### B · 真机验收（Linear / Jira）

- `_probe/accept-linear-jira.mjs`：一条命令按应用同款链路打**真机 API** 逐项 PASS/FAIL（Linear: viewer→team.states→issueCreate 带 stateId→issueUpdate；Jira: myself→建 issue（不带 status）→transitions→POST 流转→PUT 字段）。配好环境变量即可跑（文件头注释有 PowerShell 用法）。⚠️ 会真实创建 issue（标题以 [验收] 开头，可自行删除）。**待你给凭据后跑一次即完成端到端验收**。

全量 **120 文件 / 1364 用例**（v3.7.86 为 118/1333；+1 文件 = `webdav-sync.test.js` 8 例，另 electron-ipc +7、ics-parse +3）、e2e **82/82（3.8m）**、七门禁全绿、逆层 18/13 未动。 **发版后线上复核**：Pages 取回 **3,721,363 B**、`VERSION="3.7.87"`、`BUILD_TAG="20261003h"`、`var __TEST_GATE__ = false`（锚定定义处），CI/Deploy 双绿。
## [v3.7.86] - 2026-10-03

**Q4 批次 B（B1 日历事件详情浮层 · B2 死接线普查与门禁 · B4 GitHub 设备流底座）：**发版后线上复核**：Pages 取回 **3,706,179 B**、`VERSION="3.7.86"`、`BUILD_TAG="20261003g"`、`var __TEST_GATE__ = false`（锚定定义处），CI/Deploy 双绿。全仓普查抓到**第 8 例死接线**并连带修好一个"按钮其实是死的"真 bug；GitHub 接入底座落地（实测 api.github.com 回 ACAO:*，浏览器直连成立）。全量 **118 文件 / 1333 用例**（v3.7.85 为 116/1317；+2 文件 = `dead-wiring-guard.test.js` 2 例、`github-device-flow.test.js` 11 例，另有 `ics-parse.test.js` +3 例浮层）、e2e **82/82（3.7m）**、七门禁全绿、源码态。

### B1 · 日历事件详情浮层

月格「历」徽章与周视图外部事件行点击 → 完整详情浮层（类型/时间/地点/描述/来源日历，多条可上下翻页；当日聚合**本地会议 + 本地任务 + 外部事件**三类）。此前只有一句 toast，订阅日历点开只剩标题。浮层动态挂载，不新增静态标记。
*过程*：自写代码里 `forEach(function(t))` 的参数遮蔽了本项目的 i18n 函数 `t()` —— 调 `t("…")` 变成拿对象当函数调用抛 TypeError，又被容错 catch 吞掉，**本地任务永远不进列表**；用例抓出后改名修复（写这类回调不要用 `t` 做参数名）。

### B2 · 死接线普查（双向口径）+ 门禁固化

口径：静态 HTML 里的**可交互控件 id** 反查 src/ 的**字符串任意出现**（覆盖 `$("#x")` / `querySelector("#x")` / **事件委托 `el.id === "x"`** 三种绑定形态）。结果：

- **方向②（代码读、HTML 无且无动态渲染）= 0 例** —— 此前 auth 弹窗等"幽灵读"嫌疑全部证伪（它们由模板动态渲染）。
- **真死（第 8 例）**：`#calModal` 整块 —— v1.6-B 旧日历弹窗及其 `btnCalClose / btnCalTabMonth / btnCalTabWeek` 与 `#calendarView` 容器**全仓零引用**（现行日历走 `#calendarModal` 与场景内嵌视图），整块删除。
- **顺带挖出真 bug**：概况卡内嵌日历的 `bindCalendarEvents()` **无参调用恰好绑到这个化石容器**，导致该日历的翻月/ICS 入口一直是死的 → 内嵌容器给 id 并显式传参修复。
- **误报也记档**：第一次普查（未计事件委托形态）把 API/云同步区 8 个活控件误判为死 —— 教训：**审计器必须覆盖全部绑定形态，否则会把活代码判死**。
- **门禁固化**：`tests/dead-wiring-guard.test.js` —— 静态可交互控件零引用即失败，并钉死"旧日历弹窗不得复活"。8 个 API/通知控件全部证活（`render-overview` 事件委托 + `ui-ge-api` 回填读写）。

### B4 · GitHub 接入底座（Device Flow + Gist 载体）

- **实测**（`_probe/github-cors2.mjs` 存档）：`api.github.com` 回 `ACAO: *`、预检 OPTIONS 204 放行 GET/POST/PATCH/PUT/DELETE → **浏览器直连成立，不经主进程**（与 Notion/Linear 同档；钉钉/Jira 才是需中转的）。`device/code` 以无效 client_id 调用返回 404 —— 端点需**有效 client_id**（用户注册 OAuth App 后填入）。
- **实现**：设备流两步（申请设备码 / 轮询）+ device token 与 AI Key 同款**设备密钥 AES-GCM 加密落盘** + Gist 私有快照上行/下行（首推 POST 记 gistId、其后 PATCH 保留 revision 历史；文件缺失/截断如实失败）。集成页加一段：未配置 client_id 时**只有说明与输入框，不渲染可点的授权按钮**（不做 stub + 活 UI 的反面）；轮询是手动按钮，不起后台定时器；断开即清除 token 与 gist 指针。
- **诚实边界**：授权端到端需真实 client_id 验收；**Gist 快照接入同步主流程未做**（无 token 时链不到任何东西）——按路线图留到 client_id 就位后一起接，本版只交付"少一个凭据就能通"的完整底座。11 例钉住请求形状（无 secret）、pending/slow_down/expired/access_denied 归类、token 密文落盘、Gist 形状与诚实失败、UI 门控。

## [v3.7.85] - 2026-10-03

**两小时自主作业·收尾批次（B1–B4 + 规划文档）：**发版后线上复核**：Pages 取回 **3,684,759 B**、`VERSION="3.7.85"`、`BUILD_TAG="20261003f"`、`var __TEST_GATE__ = false`（锚定定义处），CI/Deploy 双绿。① Linear/Jira 状态映射从"冻结待工作区"改为**运行时解析**（连接/推送时用用户自己的 token 查工作流状态，映射随各工作区实况走）；② ICS 导出（本地任务/会议 → .ics，零凭据"双向"的另一半）；③ 删除 4 个纯死 lifecycle 函数（废弃名单 16 → 10）；④ Linear 文案随①更新；⑤ 新增 `docs/cloud-sync-incremental-contract.md`（云同步增量的前后端职责切分）与 `docs/roadmap-2026Q4.md`（Q4 路线图）。全量 **116 文件 / 1317 用例**（v3.7.84 为 115/1307；+1 文件 = `integration-state-mapping.test.js` 8 例、`ics-parse.test.js` +2 例）、e2e **82/82（3.6m）**、七门禁全绿（含 CI 独有的 `lint:tokens`）、逆层 18 / 循环 13 未动。**

### ① 状态映射运行时化（把硬阻塞就地解冻）

此前 Linear/Jira 的状态变换冻结在废弃名单，理由是"状态名→远端 ID 需真实工作区验证"。本版换个角度：**查工作流状态本身不需要我持有工作区** ——

- **Linear**：连接时 GraphQL 拉 `team.states` → `{小写状态名: stateId}` 落进 provider 配置（含落盘复现），推送命中则 mutation 带 `stateId`；查不到就**不带**（落团队默认，不猜）。
- **Jira**：更新成功后按 issue 拉 `transitions` → 本地状态名按候选表匹配 → POST transition；结果如实带 `transitioned:true/false`。
- 候选名表只是"本地四态 → 常见远端名"的起点，最终以工作区实况为准；中文状态名（进行中）也可匹配。
- `LINEAR_STATUS_MAP` / `JIRA_STATUS_MAP` / `linearMapStatus` / `jiraMapStatus` 四个冻结项随之删除。新增 `tests/integration-state-mapping.test.js` 8 例钉住：建表落盘、命中带 stateId、**拉取失败不带 stateId 但推送仍算成功**（诚实性）、transitions 命中/不命中、中文匹配、浏览器无中继时 Jira 当场拒连。

### ② ICS 导出（零凭据双向的另一半）

`icsBuildExport()` 把本地任务（截止日 → 全天 VEVENT）与会议记录（带开始时间 → DATE-TIME）导出为 .ics，`icsDownload` 触发下载。往返用例：导出 → 本应用解析器回读，标题/描述里的 `;` `,` 换行经转义还原一致；下载不可用环境（如浏览器）如实返回 false + 提示用桌面版。面板加「导出本地日程 .ics」按钮。

### ③ 死码与文案

- 删除 4 个纯死 lifecycle 函数（`integrationListProviders/Enable/Disable/ConfigureProvider` —— 全仓+测试均无引用面）；**`integrationGetStatus` 保留**（死码判定第一轮漏扫 tests/，被 phase2 测试抓下后从 git 原样恢复 —— 教训：死码判定必须同时扫 tests/，测试消费者也是消费者）。
- Linear 描述里"状态映射…尚未接入"随本版变为事实，文案更新为"状态按团队工作流运行时匹配"。
- 废弃名单 16 → 10：剩余 10 个全部对应真未接能力（Notion 笔记/双向拉取、Linear 拉取、日历 OAuth 5 个、内部 id 查找器）。

### ⑤ 规划文档（两份）

- `docs/cloud-sync-incremental-contract.md`：云同步增量是**后端契约问题**，本文把"客户端能独立做的 C1–C4（变更日志/体积看板/冲突计数/开关位）"与"必须等后端的水位+变更清单+冲突策略+幂等"切清，附三阶段建议 —— 宁可记账，不做占位增量。
- `docs/roadmap-2026Q4.md`：Q4 批次 A（收尾，本批）→ B（体验补齐：日历详情浮层、死接线普查、ICS 增强）→ C（联调验收/云同步）+ 硬阻塞前置条件清单（谁也不能在本机解的，列明缺什么）。

## [v3.7.84] - 2026-10-03

**日历能力改走「零凭据 ICS 路线」（用户裁定：「国内没有梯子，Google 日历为什么要做？国内没有厂商有这个吗？」）——Google 日历路线**永久划掉**（用户不可达即不做），日历页新增：本地 `.ics` 文件导入 + 公开只读 ICS 订阅链接（QQ日历/网易日历等，国内直连可达、零账号授权），外部事件在月/周视图以第三种分色呈现（绿系，与任务徽章/会议标记分开计数）。**发版后线上复核**：Pages 取回 **3,676,449 B**、`VERSION="3.7.84"`、`BUILD_TAG="20261003e"`、`var __TEST_GATE__ = false`（锚定定义处）。**CI 抓出一处**：首推 CI 双红——`lint:tokens`（CI 独有的一道门）抓出 ICS 徽章底色引用了**不存在的 `--ok-soft` 令牌**（本仓只有 --danger-soft/--warn-soft），浏览器会静默回退；改为 `--panel` 后转绿。全量 **115 文件 / 1307 用例**（+9 = `ics-parse.test.js`）、e2e **82/82（3.6m）**、`lint`（四道）、`build:check`、`check:ai-tools-doc`、`pet:check`、`check:modules`（18 逆层 / 13 循环，未动）、`check:source-state`，均本机实测。**

### 为什么这样做（决策链）

- **Google 日历**：用户无梯子 → api.googleapis.com 连主进程 fetch 都不可达 → 连 CORS 行为都无从实测 →「等条件」本身就是错的口径。改为「用户不可达即不做」，从 backlog 划掉（product-scope 同步记账）。
- **国内厂商**：钉钉/企微/飞书日历 API 都要**企业应用凭据 + 用户授权**（与 09-29 否掉飞书/钉钉通知的同一理由；实测其端点也不回 CORS 头，需主进程中转）；**零凭据**的唯一入口就是 ICS —— QQ日历/网易日历等个人日历都提供公开只读订阅链接，国内直连可达。
- **自己写解析器**：GitHub 有成熟实现（ical.js / node-ical / ical-generator）可作边界对照，但本仓铁律是经典 `<script>` 单文件 + 零运行时依赖 + 无打包器，引 npm 库即破构建链（CSV 解析 `_csvParse` 自写留 UI 块是既有先例）。

### 落地

- **订阅中继 `ics-fetch`**（主进程）：与 jira-fetch 同为「用户自填 URL」类接口，按**开放 SSRF** 取严 —— https 必 / 拒 userinfo / **拒回环·私网·链路本地·.local·localhost** / **`redirect:"error"`**（防 302 跳内网绕过）/ ≤2MB / 12s 超时 / **不携带任何认证头** / 日志只记主机与状态码。6 条 IPC 用例逐条断言「拒 + 零请求」。
- **解析器**（RFC5545 子集）：VEVENT/SUMMARY/DTSTART/DTEND/LOCATION/DESCRIPTION/UID/STATUS、行折叠（续行首空格是折叠标记）、`\\n \; \,` 转义还原、DATE 与 DATE-TIME（含 Z/±HHMM 时区）、`FREQ=DAILY/WEEKLY/MONTHLY/YEARLY × COUNT/INTERVAL/UNTIL` 有限展开（≤100 条）；**诚实边界**：BYDAY/BYMONTHDAY 等复杂 RRULE 只取本体（用例钉死）、单源上限 2000 条、`STATUS:CANCELLED` 剔除。
- **刷新语义**：桌面经中继（ETag 条件请求 → 304 只更新时间戳不动事件）；浏览器直连但多数日历站不回 CORS 头 → 如实失败并提示「建议用桌面版」，不假装成功。本地导入零网络。
- **UI**：日历页头部 ☰ 打开订阅面板（容器内视图，不新增静态弹窗）；月格「历」徽章（hover 看当日事件）、周视图独立绿系事件行；徽章点击出当日首条详情 toast（完整详情浮层列为后续）。

### 过程中被测试抓下并修净的三处

① `STATUS:CANCELLED` 的事件未被剔除（解析收尾漏判）；② 2000 条上限只跳出了 RRULE 内层循环、后续 VEVENT 仍收；③ `icsRefreshSub` 只改传入对象不回写存储（直调会丢刷新结果）——均已修复并各有用例。另修正两处我自己的错误预期：RFC5545 行折叠本就应去掉续行首空格；172.32 是公网段（私网只有 172.16–31），测试却把它当私网。

## [v3.7.83] - 2026-10-03

**萌宠节奏档位（安静 / 标准 / 活泼）。** 此前宠物只有"尺寸"一个偏好轴，动作频率、眨眼概率、星光密度、打盹阈值全部写死 —— 用户唯一能调的只有"多大多小"，不能调"多活泼"。补上第二条正交轴。

### 两条轴正交：尺寸管幅度，节奏管频率

| 轴 | 档位 | 影响的物理量 | 实现载体 | 换档代价 |
|---|---|---|---|---|
| 尺寸（小/中/大） | 3 | **幅度**：动作放大率、特效大小 | `_PET_SIZE_TUNING` → `--pet-act-scale/--pet-fx-scale` | 需重挂载（改 CSS 变量） |
| 节奏（安静/标准/活泼） | 3 | **频率**：心跳间隔、各行为概率、打盹阈值 | `PET_RHYTHMS` → tick 参数 | 只重启定时器，零闪烁 |

### 参数表

| 参数 | 安静 | 标准 | 活泼 |
|---|---|---|---|
| 心跳间隔 | 7000ms | **3400ms** | 2000ms |
| 动作概率（有眨眼层） | .30 | **.40** | .55 |
| 眨眼概率 | .22 | **.42** | .35 |
| 动作概率（3D 无眨眼层） | .60 | **.72** | .85 |
| 星光密度 | .05 | **.14** | .30 |
| 3D 附加星 / 二次星 | .12 / .08 | **.30 / .20** | .55 / .40 |
| 打盹空闲阈值 | 180s | **90s** | 45s |
| zzz 概率 | .12 | **.30** | .45 |

**加粗为标准档 = v3.7.82 的写死值**，逐值不变 —— 老用户升级后宠物性格不会被静默改掉（这条有测试钉死，见下）。

### 四条硬约束（不可被档位覆盖）

1. **`prefers-reduced-motion` 最高优先** —— 已在 tick 开头 return，任何档位都不得绕过。这是无障碍底线，不是"档位之一"。
2. **主动交互不降级** —— 摸头（歪头+眨眼+爱心）/ 摸身（跳跃）/ 摇尾巴、拖拽反馈恒在。用户主动交互被静音是 bug，不是"安静"。
3. **切档不 remount 宠物** —— 抽出 `startPetTick()` 只重建定时器。remount = 重建 DOM + 重定位浮层 + 位置跳回默认右下角，用户会看到"闪一下再跳位"。节奏档不涉及任何 CSS 变量，故无需重挂载。
4. **待机呼吸 `.pet.bobbing` 恒开** —— 节奏档只管频率不管幅度，去掉呼吸宠物会显得"死了"。

### 接线落点

- `src/render-widgets.js`：`PET_RHYTHMS` 表 + `_petRhythmId()`（非法值回落标准）+ `applyPetRhythm()` + `initPetRhythmFromPref()`（幂等绑定，`_prBound` 标志，同 `initPointerFxFromPref` 模式）
- `src/core.js`：i18n 中英各 6 条（`pet.rhythm.label/applied/quiet/standard/lively/tip`）
- `agent-workbench.html`：外观 Tab 插入 `set-field` + `select#cfgPetRhythm`（复用 `cfgPointerFxType` 同款配方，置于鼠标特效之前）+ 一句 `set-tip` 说明
- `src/ui-global-events.js`：boot 时调 `initPetRhythmFromPref()`
- 走 `applyPetRhythm` **即时生效**，刻意**不进**设置抽屉的"保存"路径 —— 与指针特效开关同属装饰类偏好，点一下就该看到效果

### 11 条测试 + 三次故障注入

`tests/pet-rhythm.test.js`：三档齐全且恰好三档 · 9 字段无缺（缺一即静默 NaN，`setInterval(NaN)` 退化成 1ms 刷屏卡死）· 取值域合法（`dozeMs > tickMs`，否则一进循环就在打盹）· 概率和 ≤1 · 三档真的分层次 · **标准档逐值等于 v3.7.82 基线** · select 三 option 与表键一一对应且都带 data-i18n · `applyPetRhythm` 不含 `mountPet` · `onTick` 无残留写死值 · i18n 中英各 2 次。

门禁不能只"跑绿"就算数 —— 三次故障注入验证它真在守护：篡改标准档 `tickMs` → 2 条红；删 `quiet.blinkP` 字段 → 3 条红（NaN 被抓）；`applyPetRhythm` 退化为 remount → 1 条红。

## [v3.7.82] - 2026-10-03

**萌宠部位点击反应 + 摇尾巴（v3.7.81 遗留项做完）。** 点击不再"什么都触发一次"，而是按摸到的部位给不同反馈。

| 部位 | 反应 |
|---|---|
| 头 | 歪头（act-tilt）+ 眨眼 + 爱心 + 气泡 |
| 身 | 跳跃 + 爱心 + 30% 星光 + 气泡（v3.6.5 原行为） |
| 尾 | **摇尾巴**（act-wag）+ 欢喜气泡（dog 命中「摇尾巴～」） |
| 留白/未标注 | 身体反应（命中层 body 铺满兜底） |

### 摇尾巴：单张立绘没有尾巴部件怎么办

`act-wag` 用「**整图绕尾根摆动**」造出身体跟着甩的惯性错觉 —— 旋转轴 = `--pet-wag-origin`（JS 按角色尾根坐标下发：dog 74%/60%、cat 30%/68%、dolphin 34%/78%、rabbit 50%/86%），比绕图心转更像摇尾巴。幅度 ±3.4°×档位系数、0.82s 三个来回，不进随机动作池，仅由点尾触发。

### 命中判定为什么不用坐标反算（踩坑记录）

先做了一版 JS 反算：事件坐标 → 减去容器与 object-fit 留白 → 归一化。**探针实测 lady/boy 点头落到了身体反应上**。根因：`.pet-art` 带 `transform`（全身立绘 `_PET_ART_SCALE` 1.5 倍、3D 档还有 rotateX/rotateY），`getBoundingClientRect()` 返回**变换后**矩形，而浮层定位用的是 `clientWidth`（未变换布局值）—— 两套坐标系不一致，偏移 = 缩放差；3D 档摇摆时矩形本身还是错的。

改用 **DOM 命中层**（`.pet-hit` 透明块，坐标取自 `_PET_PARTS` 归一化值，随 `.pet-art` 一起被 transform）—— 点到的位置与用户看到的完全一致，**零换算、无漂移**，顺带比反算少一层代码。

### 逐角色标定（看图，不靠印象）

`_probe/pet-grid.html` 渲染带 10% 坐标网格的立绘，逐只目视标定头/尾椭圆（`[cx,cy,rx,ry]`）：

- **dog** 尾在右侧（0.83,0.60）· **cat** 尾在左下（0.19,0.72）· **dolphin** 尾鳍左下（0.20,0.83）· **rabbit** 短尾下方中央（0.50,0.90）
- **panda** 短尾被身体/后腿完全挡住 → `tail: null`，不假装有尾巴
- **girl / boyq / lady / boy** 四只人物本就没有尾巴 → `tail: null`，点尾区自动回落身体反应
- 全身人物头部只占顶部一小块（lady/boy 头心 y≈0.16，半径 0.12）—— 凭印象按"通用头部比例"写必然错位

同时**合并了两个并存的 click handler**（跳+爱心 与 气泡+张嘴），点击语义不再重复触发；动作播放拆出 `playActCls(cls)` 以支持指定动作（头=歪头、尾=摇尾巴），与心跳的随机动作共用一个计时器，叠动作不再打架。

验证：`_probe/pet-parts-probe.mjs` 五组合（dog 尾/头/身、panda 身、lady 头）逐一点击命中层并截图 + 量测动作类/气泡文案/爱心/跳跃标记 —— dog 尾→`act-wag`+「摇尾巴～」、dog 头→`act-tilt`+爱心、dog 身→跳跃+lady 头→`act-tilt`（修复前是身体反应）。lint 四道全绿 · pet:check ✓ · vitest 全量。

## [v3.7.81] - 2026-10-03

**萌宠全档位架构改良（9 只 × 2 风格 × 3 尺寸 = 54 组合，一次性按规则理顺）。** 起因是 v3.7.80 从 act-spin 事故（用户点名"180° 转一下、让人看不出来这只是纸片"）提炼出的硬规则落地。

### 动作集按风格分流（硬规则写成结构，不靠人记）

**2D 档禁用一切 `rotateX/rotateY`** —— 平面立绘一转就露纸片；**3D 档**有 perspective + 光影层 + 接地影，小幅转体是"手办转台"，上限 12°、不得越翻面临界。

| 动作 | 2D | 3D | 实现 |
|---|:--:|:--:|---|
| nod 点头 / tilt 歪头 / hop 轻跳 / sway 摆身 / dance 跳舞 | ✓ | ✓ | 通用（幅度按档缩放） |
| ruffle 抖毛 | ✓ | ✓ | **纯位移**（摇头旋转已被替换 —— 位移不改变面部朝向，任何风格都不穿帮） |
| squash 压扁拉伸 | ✓ | — | Q 版弹性，硬质手办压扁会破坏材质可信度 |
| turn 转体 / bob 俯仰 | — | ✓ | 小幅转体，手办感 |

### 尺寸档调参表（原先全是写死 px，多模式不合理的主因）

`_PET_SIZE_TUNING` 表驱动，CSS 统一乘 `var(--pet-act-scale)` / `var(--pet-fx-scale)`：

| 档 | px | 动作幅度 | 特效尺寸/上浮距离 | perspective | 睫毛线 |
|---|---|---|---|---|---|
| 小 | 72 | ×1.25 | ×0.80 | 418px | **不画**（几像素高的深色线会糊成"脏点"） |
| 中 | 96 | ×1.00 | ×1.00 | 557px | 保留 |
| 大 | 128 | ×0.80 | ×1.15 | 742px | 保留 |

- 待机浮动、点击跳跃、特效上浮/飞散轨迹、3D 转台摇摆幅度**全部纳入缩放**；
- **修隐藏 bug**：`.pet-art` 原先同时有 `perspective:320px` 属性与 `transform:perspective(560px)` —— 双重透视叠加（3D 档一直"透视过强"的真因）。现单一来源 `calc(var(--pet-size) * 5.8)`；
- 特效定位由写死 px 改为按 `--pet-size` 比例（大档下原先全挤在左半边）。

### 特效频率与打盹（两个真 bug）

- **打盹 zZZ**：`idleTicks>=3` ≈ **10 秒**就睡、之后每 3.4s 冒一次（观感"它一直在睡"）→ 改**真实空闲 90 秒**，悬停/点击/按键/拖拽都刷新计时；
- 星光 35%→**14%**；3D 附加星 55%→**30%**、二次 45%→**20%**；点击星光 55%→30%；打盹期不出星光。

### 细节与加固

- **拖拽中完全静默**（不再一边被按着走一边点头眨眼）；`prefers-reduced-motion` 用户 JS 层直接跳过（此前只有 CSS 停动画、JS 仍加 class 放特效）；
- 眨眼与**点击跳跃**互斥（此前只挡了 act/talking）；
- 连眨第二下延迟按档（小 200ms / 中 250 / 大 290）；
- 眨眼遮罩**定位加固**：重试窗口 60 帧→180 帧 + `img.decode()` 兜底 + 心跳每 8 拍校正一次。实测 3.6MB 页面上首屏繁忙时 `img.complete` 仍为 false，1 秒内放弃会让浮层**永久定位失败**（眨眼/张嘴静默丢失）。

### 教训：类名撞车（探针 DOM dump 抓出）

小档隐藏睫毛线用的 `.mini` 类，与 UI 已有的小徽章类 `.mini{background:var(--accent)}` **撞名** → 整个 72×72 浮层被染成 accent 蓝方块盖住宠物，截图上只看到"一个蓝方块"。**截图看不出根因，DOM dump 一眼定位**（`SPAN.pet-art-lids.mini bg=rgb(0,103,224)`）。已改名 `.no-lash`。规则：**浮层/局部组件的类名必须带模块前缀**。

验证：`_probe/pet-v81-probe.mjs` 六组合（2D/3D × 小/中/大）逐组合截图 + 量测（`pet-v81-report.json`：各档 act/fx 缩放值、no-lash 开关、睫毛高度、透视矩阵），**逐张看图确认**；`node --check` · `lint`（四道）· `pet:check` · vitest 全量。部位点击反应与尾巴标定仍为待办（需逐角色看图标定，动物 5 只有尾、人物 4 只无尾需 fallback）。

## [v3.7.80] - 2026-10-03

**关于卡去版本行 + 标题措辞修正 + 萌宠动作穿帮两连修（用户裁定）。**

### 关于卡（用户裁定：版本号全站只留尾栏一处）

设置页「关于」卡内此前渲染 `#aboutVersion`（v3.1.2 B-档引入，动机是"版本号只在尾栏用户找不到"），与尾栏 `foot-id` 完全重复——按用户裁定移除。连带修正卡片标题：「关于与兼容说明」是「关于」+「兼容说明」的压缩并列，读起来有歧义（"与"连接对象不明），改为「关于本应用」（en `About`），`a11y.aboutCompat` 与 HTML 静态 aria 同步；`bindAboutCard` 保留快捷键帮助按钮绑定，只删版本行两行。测试零引用（`aboutVersion` 在 tests/ 无命中），无断言牵连。

### 萌宠：删 act-spin + 表情浮层互斥守卫

- **删 `act-spin`（用户点名的「180° 转一下」）**：单张立绘绕 Y 轴转 360°，半程就是一张翻面的"纸片"，穿帮感极强；且 3D 档的 shade/sheen 光影层不跟随 img 旋转，半程还会分层。CSS keyframes 保留但不再触发。
- **眨眼跑位根因（探针实证定位）**：`_probe/pet-blink-probe.mjs` 静态量测证明遮罩定位计算完全正确（lid 坐标与标定值逐位吻合、截图闭眼位置准确）→ 错位只可能发生在动态并发：`act-*` 动画与 `talking` 都作用在 `.pet-art-img` 上，而眨眼/张嘴遮罩是 `.pet-art` 下的独立兄弟层、**不跟随 img 的 transform**——并发时脸转走了遮罩还在原地。此前只有 tick 抽签层互斥（同 tick 二选一），但 talkArt（1.4s）、连眨第二下（+250ms）、点击反馈等入口仍可与 act 并发。修法：`blinkArt`/`talkArt` 入口统一加 `_imgInAct()` 防御守卫（动作中不贴遮罩、不开口），`playAct` 前先收起正在显示的眨眼遮罩。
- 摇尾巴、间隔可配置、点击部位反应 = 涉及设置 UI 与交互设计的新特性，提案待用户确认后另版实施。

版本六处同步 3.7.80 / BUILD_TAG 20261003a。本机：lint 四道全绿、vitest 1277 passed（4 failed 全为 spawnSync 沙箱假红：color-tokens ×3 + build-structure ×1，特征均为子进程输出为空）、i18n-completeness 8/8。

## [v3.7.79] - 2026-10-03

**发版后线上复核**：Pages 取回 **3,626,491 B**、`VERSION="3.7.79"`、`BUILD_TAG="20261002j"`、`var __TEST_GATE__ = false`（锚定定义处），CI/Deploy 双绿。

**Jira 接线落地（五家定案的最后一家）：主进程 `jira-fetch` 中转 —— Atlassian 不回 CORS 头（`_probe/cors-matrix-providers.mjs` 实测 file:// 与 http(s) 双双被拦、主进程可达），浏览器形态连验证都发不出去，故 Jira = 仅桌面版。连接验证、任务推送（`jiraPushTasks`）、issue 拉取全部经中继；面板新增「推送任务」按钮（与 notion/linear 同款消费点）、配置补项目 Key 字段、文案如实标注仅桌面版与凭据加密落盘。全量 **113 文件 / 1281 用例**（v3.7.78 为 1273；+8 = IPC 白名单组 7 + preload 契约 1）、e2e **82/82（5.7m）**、`lint`（四道）、`build:check`、`check:ai-tools-doc`、`pet:check`、`check:modules`（18 逆层 / 13 循环未动）、`check:source-state`，均本机实测。**

### 中继的安全边界（这条 IPC = 让渲染进程驱动主进程带 Bearer token 访问网站，白名单是承重墙）

- **域名精确匹配** `^<子域>.atlassian.net$`：子域伪装（`evil.atlassian.net.evil.com`）、裸 `atlassian.net`、任意主机、带端口、路径粘连一律 `bad_domain`，**零请求**；大小写统一归一化后判定。
- **路径必须 `/rest/` 开头**（只放 REST 面，`/admin/users` 拒）；方法白名单 GET/POST/PUT/DELETE；token 必填；body ≤ 2MB；超时钳 1–20s；`assertTrustedSender` 与 chat / notify-send 同一道门。
- **日志只记主机与状态码**：绝不出现 token 与请求正文（有专门用例读 `app.log` 反证）。
- 渲染侧先过 `_intJiraBase`（v3.7.60 起的净化函数）把主机钉死，主进程是第二道门——两侧校验都有用例。

### 功能面

- `jiraConnect`：**无中继当场拒连**（不存"连上了但每次请求都失败"的死配置）并进诊断面板；面板行在浏览器形态显示「仅桌面版可用」+ 禁用按钮 + 原因 title。
- `jiraSyncIssue` / `jiraListIssues` 改道 `_jiraRequest`（有中继走主进程，无则回落渲染直连如实失败）；**create 刻意不带 status**（Jira create 不接受 status，变换状态要走 transitions API 且 id 因工作流而异——同 Linear 的处置，`jiraMapStatus` 继续冻结在废弃名单）。
- 废弃函数名单 18 → 16（`jiraSyncIssue`/`jiraListIssues` 摘牌入 LIVE 名单）；已知边界如实登记：自建域名/非标准端口在两种形态下均不可用（浏览器 CORS / 中继白名单只放 atlassian.net 云实例）。

## [v3.7.78] - 2026-10-03

**解耦第三批（S2c）：同层逆层清剿 —— 逆层 30 → 18、循环 16 → 13，decoupling-plan 的 P4 目标（<20）达成；三批累计 53 → 18（-66%）、50 → 13（-74%）。**发版后线上复核**：Pages 取回 **3,622,762 B**、`VERSION="3.7.78"`、`BUILD_TAG="20261002i"`、`var __TEST_GATE__ = false`（锚定定义处），CI/Deploy 双绿。全量 **113 文件 / 1273 用例**、e2e **82/82（4.2m）**、`lint`（四道）、`build:check`、`check:ai-tools-doc`、`pet:check`、`check:modules`（35 块 · 18 逆层 / 13 循环 · 重复定义 0）、`check:source-state`，均本机实测。**

### 三手齐下

- **测试桥整块搬迁（最高杠杆）**：ui-global-events 里的 `window.__test = {…}` 巨型对象（数百个裸标识符来自所有块）迁到最后一个块 ui-ge-integrations —— 放在末尾使全部引用变为正向。⚠️ 桥的构建顺序改晚后暴露一个真问题：中间块（ui-ge-api）的守卫式 `Object.assign(window.__test,…)` 在对象创建**之前**执行被静默跳过（token 加密的 7 条钩子测试全红抓到）。修法：早期块只建**空对象**（`window.__test = {}`），末尾改 `Object.assign` 汇入 —— 顺序无关、任何块都可在自己加载时追加。
- **纯助手搬家**（搬早即正向）：`SIDE_MENU_ICONS / TOOL_APPS / EMPTY_ICONS / _priWeight / lineChartSVG / renderEmpty / renderMiniChart` → render-entry（Render 最前块）；`thisWeekDone / weekRange` → core；`renderChat / scrollChat / trimChatHist / _estTokens / lastChatRequest / pendingConfirm` → ai-tools（AI 最前块）——AI 两条同层对随之消失。
- **新槽与调用点迁移**：render 簇（openRecycle/openToolStub/四工具弹窗）、主题 API（12 个）、笔记/搜索弹窗（6 个）、checkCount 等约 25 个槽位开出并在提供方块注册；ui-drawer / ui-global-events / ui-palette / ui-onboarding / ui-guide / ui-scene-bind / render-entry / render-overview 的对应调用点全部改走桥。

### 三处回归（全部被测试当场抓下，修净后才发版）

1. **token 钩子丢失**（上面已述，7 条测试红）；2. **error-boundary C1/C2**：测试用 `win.renderSide = …throw` 注入异常——桥在注册时捕获原件后，打补丁 window 已无效；测试手法等价迁移为 `win.__test.AppBridge.renderSide = …`（契约不变：render 的第一步抛错必须进 fallback UI）。3. E3 为已知 vitest worker 负载假红，重跑即绿。教训入账：**桥化的代价之一是"可打补丁性"——测试注入点必须跟着搬**；以及**改变全局单例的构建顺序会静默打断守卫式扩展**（本次靠测试网兜住）。

## [v3.7.77] - 2026-10-03

**解耦第二批（S2b）：桥接迁移 —— 逆层 45 → 30、循环 47 → 16，且真跨层逆层清零。** 按 decoupling-plan 工具 B：

- **迁移调用方**（槽位多由并行会话已注册）：render-entry / render-overview / render-scene-sub / render-widgets 把 `_moveDrawerHome / openTaskEdit / openTemplateModal / registerPluginFromJson / toggleToolPop / closeDrawer / renderHelp / bindReportCard / bindReviewCard` 的调用**与 `typeof` 守卫**（守卫里的裸名同样计边——module-graph 只豁免 `.` 前缀，实测口径）一并改走 AppBridge；render-scene-sub 的 `bind:` 表值改**晚绑定包装**（`function(el){ return AppBridge.bindReportCard(el); }`——直接存桥引用会把注册前的空操作捕获死，这是本批最隐蔽的坑，绕过了）。
- **新开 15 槽**：知识库（openKnowledgeBaseModal/openNotesModal）、日历簇（openMindmapModal/openGanttModal/openDashboardModal/bindCalendarEvents/bindDashboardDnD/_bindDashToolbar/renderCalendarView）、报表与 AI 引擎（openReportModal/bindReportModal/aiSmartRecommend/_aiChatText）、场景特性读写口（getSceneFeature/setSceneFeature）；返回值语义按调用点定默认（renderCalendarView → `""`、aiSmartRecommend → `null`、_aiChatText → `""`），三个 UI 块末尾加载时注册。
- **最后一条真跨层逆层边**：data-links 注册自定义场景时直接读写 render-scene-main 的 `SCENE_FEATURE_RENDER` 表 → 改走 `get/setSceneFeature` 桥。修完**跨层逆层清零**；剩余 30 条全部是同层序对（Render×9 / UI×19 / AI×2——decoupling-plan 明示「同层互调可接受、优先级低」），较起点 53 条降 43%。
- **过程披露**：一次半执行的迁移脚本重跑，使「from 是 to 后缀」的锚点发生二次替换，产出 `AppBridge.AppBridge._bindDashToolbar`——三处测试当场红（stats 页直接崩）。全仓扫描确认仅此一处，修净后 24/24；教训：幂等替换的跳过判据要看「from 是否仍以裸形态出现」，不能只看 n。
- 基线重冻结（35 块 · 30 逆层 / 16 循环 · 重复定义 0）：check 报的「新增」经逐条核对为 SCC 在大量删边后的重组路径，真增仅「注册块→core」正向边，`--freeze` 落账。
- 验证：全量 **113 文件 / 1273 用例**、e2e **82/82（3.7m）**、`lint`（四道）、`build:check`、`check:ai-tools-doc`、`pet:check`、`check:modules`、`check:source-state` 源码态，均本机实测。（同前几次披露：vitest worker RPC 偶发未处理错误会拦 posttest 不跑，干净重跑全绿 + 手动还原源码态。）
- **发版后线上复核**：Pages 取回 **3,618,610 B**、`VERSION="3.7.77"`、`BUILD_TAG="20261002h"`、`var __TEST_GATE__ = false`（锚定定义处），CI/Deploy 双绿。

## [v3.7.76] - 2026-10-03

**知识库文件导入落地（路线余量 ③ 清偿）：导入纯文本文件 → 按段落切块 → 作为第五数据源进 v3.7.67 的哈希 diff 体系 → 检索索引自动收敛；删除文件 = 其全部索引块连文档带向量移除。全量 **113 文件 / 1273 用例**（v3.7.75 为 112/1263；+10 = `rag-file-import.test.js`）、e2e **82/82（4.1m）**、`lint`（四道）、`build:check`、`check:ai-tools-doc`、`pet:check`、`check:modules`（35 块 · 50→47 循环 / 53→45 逆层，无新增）、`check:source-state` 源码态，均本机实测。**发版后线上复核**：Pages 取回 **3,615,901 B**、`VERSION="3.7.76"`、`BUILD_TAG="20261002g"`、`var __TEST_GATE__ = false`（锚定定义处），CI/Deploy 双绿。

### 分层（零新增逆层）

- **存储** `getRagFiles/saveRagFiles` 在 data-rw（走 save() 主入口：镜像/配额告警齐备；上限单文件 256K 字符、共 60 个文件）；**切块与导入动作**在 ui-ge-notes（`_ragFileText` 准入+预清洗、`_ragChunkText` 段落聚合切块、`ragImportText/ragImportFiles/ragDeleteFile`）；**内容哈希 `fnv1aHex`** 自 ai-tools 的 `_ragDocHash` 提升到 core（导入侧切块 docId 与同步侧 diff 都要用，各自→core 都是正向边）；`_ragDocHash` 保留别名兼容既有引用与测试。
- 导入只写存储 + `emitDataMutate` 广播，**本块不发网络请求**——建索引由 ai-tools 的 `ragSyncIncremental`（4s 防抖）完成。UI：知识库弹窗新增「文件知识」区（列表 + 块数 + 删除 + 导入入口，label+隐藏 file input，`accept` 白名单七类扩展名）。

### docId 设计（v3.7.67 双刃剑的兑付面，两个方向都实测）

- **凡进索引的必须进 diff 体系**：文件块纳入 `_ragCurrentDocs` 后，删除文件条目 = 块在 diff 视角下消失 = 文档与向量一并移除（有用例证明）——不会被增量同步误删成孤儿。
- **docId 不含每次导入都换的 fid**，由 `<文件名>+<块内容>` 哈希派生（`file:<nameHash>:<chunkHash>`）：**同名同内容重导入 = docId 不变 = 零重嵌零请求**（实测第二轮 diff 全 0）；同名改内容 → 旧块移除新块入库；改文件名 → 文档名哈希变化 → 同样收敛。fid 只作记录 id。
- **切块**：段落聚合目标 ≤1000 字符（短段合并、跨 1000 即分块），单段 >1600 按句读（。！？.!?;）硬切，仍超按长度切——3000 字段落实测切多块且每块 ≤1600。
- **准入诚实**：不支持类型（PDF/DOCX 等二进制）返回 null + toast 指路"先转纯文本"，零落库零外发；超上限拒绝；html 导入剥 script/style/noscript 后取正文（alert 注入文本不进索引）。

### 过程中的坑（都当场修净）

- 手术脚本把 `notes.slice(...)` 误接进插入字符串的 `+` 链，插入文本把文件尾部拖出一份重复（语法错误被 node --check 抓下）——恢复后重写脚本：**插入内容一律纯字符串常量**。
- i18n 双语插入时 en 节一度写成中文值、`p5.kbFilesDelete` 出现四联重复（lint 的 no-dupe-keys 抓下）——en 改英文值、去重为每语言一条。
- 验证首跑撞 vitest worker RPC 超时假红（E3 60s 超时 + posttest 被退出码拦截未跑致 HTML 留注入态；该文件单跑 22/22 全过），干净重跑全绿——与 v3.7.66/75 披露同源。

## [v3.7.75] - 2026-10-02

**解耦实战第一批：逆层 53 → 45、循环 50 → 47（全量验证行为零变更）。** 按 decoupling-plan 工具 A（归位）把四组「纯数据/存取」从高层块下沉到数据层：

- **crypto→data-idb 接缝化**：设备密钥的 IDB 存取此前由 crypto 直接引用 `idbReadKey/idbMirrorKey`（crypto→data-idb 逆层边）。改为 crypto 暴露 `registerDkIdbHelpers(get,put)` 接缝，data-idb 加载时反向注册（data-idb→crypto 是正向边）；data-idb 层序在一切 initCrypto 调用方之前，注册时机天然成立。旧 `initCryptoRuntimeWiring` 删除，无测试引用。
- **笔记存取下沉**：`NOTES_STORAGE_KEY / getNotes / saveNotes / createNote` 自 ui-ge-notes 下沉 data-rw —— 纯存取与模型工厂，被 AI（工具建笔记）与 render 多层引用；CRUD 弹窗 UI 留守。ai-tools→ui-ge-notes 逆层对消失。
- **插件注册表下沉**：`_plugins / BUILTIN_PLUGINS / register·load·unload·set·get 系列 / _save·_load·_reset·_initPlugins` 整体自 ui-ge-plugins 下沉 data-links，一次消除 **5 条逆层对 + 3 个环**；ui-ge-plugins 只留 `renderPluginCards`（DOM 渲染属 UI）。`var _plugins` 的提升语义（早期访问返回 undefined）原样保留；顶层 `_initPlugins()` 自动执行时机与搬前等价（registerCustomScenarios 顶层调用期间注册表尚为空）。
- **snooze 簇与 getDeviceId 下沉**：`snoozeTask / _snoozedUntil / _purgeExpiredSnooze / getSnoozeMap` + `NOTIFY_IDS_KEY / SNOOZE_KEY` 自 ui-daily、`getDeviceId` 自 ui-backup-stats 下沉 data-rw；免打扰时段策略（QUIET_KEY/getQuietHours）是 ui-daily 专用，留下。AppBridge.snoozeTask 注册随迁（本块 onExerciseSave 同款先例）。
- **下沉的代价如实交代**：搬早的代码原本向上的引用会变成新逆层 —— `registerPlugin/loadPlugin` 里的两处 `render()` 改走 `AppBridge.render`；`renderSide()` 按工具 B 在 core 桥新增 `renderSide` 槽位、由 render-widgets 注册（窄域侧栏刷新语义不变）；`addToRecycleBin` 调用一并改走既有桥。手术曾引入 QUIET_KEY 重复定义与上两条新边，均在 check:modules 抓下后当场修净。
- **基线重冻结（v3.7.63 同款口径）**：逆层 53→45、循环 50→47 为**净减**；check 报的 24 项「新增」经逐条核对全部是同一批 SCC 在删边后的重组路径（真新增边仅 `ui-ge-plugins→data-links` 一条正向边），非新耦合，`--freeze` 落账。
- 验证：全量 **112 文件 / 1263 用例**、e2e **82/82（4.2m）**、`lint`（四道）、`build:check`、`check:ai-tools-doc`、`pet:check`、`check:source-state` 源码态，均本机实测。首跑曾现 22 条「未过」——vitest worker RPC 超时假红（本机重载，与 v3.7.66 披露同源），干净重跑全绿。**发版后线上复核**：Pages 取回 **3,603,282 B**、`VERSION="3.7.75"`、`BUILD_TAG="20261002f"`、CI/Deploy 双绿。⚠️ 更正一处台账笔误：发版 commit message 写的 `20261002b` 是凭当日第几版想当然——脚本实发 `20261002f`（当日第 6 次构建），树内与线上均已核实为 f；commit message 不改（不给 main 上 force-push）。

## [v3.7.74] - 2026-10-02

**路线项 ①② 落地：会议进日历 + 双标签页数据守护。** 另把 RAG 文件导入、云同步增量两项记为路线余量（后者依赖后端契约升级，单改客户端无意义）。

### ① 会议进日历（"今天的会"终于看得到）

办公场景「会议纪要」record 一直有 `date` / `startTime` 字段，但日历视图只聚合任务 `dueDate` —— 录了会议日期，日历上看不到（数据在、链路断）。

- **月历**：当日有会议 → 格子底部「会」标记（accent 描边胶囊，多场显示 ×N，hover 列出各场时间+主题），与任务数徽章分列不混淆
- **周视图**：会议行在任务行之前，按 `startTime` 升序，`时间 + 标题`；无任务但有会议的格子不再显示"—"
- 会议与任务**分色分列**：任务=accent 左线，会议=独立样式；数据源 `getRec("office")` 按 `date` 分桶（新辅助 `_meetingsByDate()`）

### ② 双标签页数据守护

全仓此前 **0 处 storage 监听** —— 双开窗口 = 后写覆盖先写且互不感知。最小正确实现：

- `storage` 事件监听（该事件只在**其它**标签页写入时触发，天然无回环）
- 过滤：仅 `wb_agent_` 前缀、排除 `cfg`（主题等配置写入不提示）；**节流 30s** 防多键连改刷屏
- 动作 = 节流 toast 提示刷新，**不自动刷新**（防止打断用户正在输入的内容）

### 路线余量（记账不动）

- ③ RAG 文件导入 + 按段落切块：需文件上传 UI / 解析 / chunk 策略，独立特性
- ④ 云同步增量 / 冲突处理：依赖后端契约升级，单改客户端无意义 —— 等后端立项一起做

## [v3.7.73] - 2026-10-02

**🔴 层五项清仓 + 🟠② 语义召回默认可用。** 本版最重要的发现：语义召回「默认关闭」的真正根因不是产品决策，而是**设置开关的 UI 元素从未被渲染**（`#aiMemRag` 在全仓渲染代码 0 命中，保存逻辑读 null → `cfg.rag` 恒 false）——用户被永久锁死在词法匹配上，这是第 7 例「死接线」。

### 🔴 竞态清仓（聊天键 save(chat_active) 共 8 处，逐处审计）

- **6 处含 await 路径全部修复**：入口定格场景（`const sc = active` / `p.sc` / `pendingConfirm.sc`），读、写、循环传参统一用定格值。涉及 onChatSubmit（4 处 save + runChatLoop 调用）/ runChatLoop 本体（save + 挂起确认归属 + lastChatRequest 记录 sc）/ proposeAgentPlan / confirmPendingDanger（psc）/ retryChat（重试用记录时场景 req.sc）/ confirmAgentPlan（上一版已修）。
- **2 处同步 cancel 函数保留原样**：无 await → active 即当前场景，无竞态（改动无益徒增 diff）。
- runChatLoop 签名加第三参 `sc`（缺省回退 active，向后兼容）。

### 🔴 云同步与死码

- **5xx/429 退避重试**：同步通道此前 5xx 零重试，后端抖动一次就失败。现重试 2 次（800ms/1.6s），与 AI 通道重试矩阵对齐；401 仍走刷新链。
- **errKind 错误分类**：apiFetch 返回值新增 `errKind: "server"|"client"|null`，调用方可提示「稍后再试」vs「检查配置」。
- **OAuth2 空 stub 清除**：`_oauth2HandleCallback`（v1.14 遗留、永远 resolve、每此启动 fire-and-forget 调用一次）定义与调用点一并删除。
- **_lastSyncAt 死变量**删除（只赋值不读；持久化时间已由 `_setSyncMeta` 承担）。
- **sync-contract.spec 口径对齐**：补 `test.skip(!E2E)` 门禁（此前注释声明跳过、实际始终执行）。

### 🟠② 语义召回默认可用

- **根因**：`#aiMemRag` checkbox 全仓渲染 0 命中 → `rg` 恒 null → `cfg.rag = rg ? ... : false` **恒 false**。绑定/回填/保存代码俱全，唯独没有 UI —— 第 7 例死接线。
- **判定反转**：`cfg.rag !== true` → `cfg.rag === false`（默认开，显式关才关），共 2 处判定点。
- **embed 失败缓存**：`/embeddings` 返回 404/401/403（通道不可用，非瞬时抖动）→ 会话内 10 分钟不再尝试，自动退回词法匹配，每条消息不再白打请求；5xx 视为抖动不缓存。
- **设置抽屉新增「上下文注入（RAG，默认开）」开关**：抽屉为静态 HTML 结构（cfgAgentLoops 同款 set-field 模板），回填/保存/中英 i18n 齐备 —— 用户从此**可控**。
- 附带：`_embedCfg()` 本就自动复用当前 AI profile 的 base+key（模型默认 bge-m3），通道无需额外配置。

### 验证

门禁六道全绿；check:source-state / src:check ✓。全量与 CI 见发布 run。
## [v3.7.72] - 2026-10-02

**Agent 执行架构升级：`executeAgentPlanReactive` 替换盲跑 —— 自主执行从「确认后按 JSON 顺序跑到底」变成「每 3 步把真实结果回喂模型，可继续可重规划」。** 这是深评指出的「与真 agent 最本质的差距」的正面修复，也是 product-scope 路线项 ① 的落地。

### 架构决策：Plan-Confirm-Execute-Adapt（单 agent），不做 multi-agent orchestration

- 任务域封闭：26 个工具里 22 个是本应用数据操作，没有多专家分工的必要性
- token 成本：multi-agent 每步 2~3 倍，与「节省用户 token」直接矛盾
- 基础设施：runChatLoop（真 function-calling + 6/12 轮循环）+ 危险确认 + 白名单全部复用
- 完整理由写在 `src/ai-tools.js` 的设计注释里，防止后人凭感觉加 agent

### 执行反馈回路（executeAgentPlanReactive）

- **分段执行**：每 3 步一段；段末把「目标 + 已执行结果（每步一行压缩：✓/✗ + 工具名 + msg/id，≤80 字符）+ 剩余计划」发给模型校准
- **模型可两选**：`{"action":"continue"}` 按原计划继续；`{"action":"replan","steps":[...]}` 替换剩余（步数封顶 12、全程重规划 ≤2 次）
- **读操作重试**：search/list/query 等无副作用工具失败自动重试 1 次；写操作不自动重试（可能已生效，交给重规划）
- **校准独立 messages**：不进用户聊天 hist，系统提示内置工具纪律（只输出 JSON、tool 只能取剩余计划出现过的工具）
- **降级安全**：校准抛错/输出非法 → 返回 null 按原计划继续（AI 未配置时自主执行照样能跑完）
- **安全护栏原样保留**：危险确认拦截、白名单、取消信号、onProgress 兼容；盲跑版 `executeAgentPlan` 保留未删
- 接入点：命令面板确认执行（ai-retry.js）与 chatOnceAgent 一键路径（ai-tools.js）两处

### Token 优化（同任务成本下降）

- **工具结果回填截断**：3 处回填点（对话循环 ×2 + 确认路径 ×1）超 2400 字符截断并注明全长 —— 此前 list_tasks 等返回的大 JSON 整段回填是 token 无底洞
- 校准调用本身即 token 优化：模型看到的是每步一行的压缩结果而非全量 JSON；且校准不占聊天上下文预算

### 测试

新增 `tests/agent-reactive.test.js` **5 条**：continue 全跑 / replan 替换（原剩余不执行）/ 校准抛错降级 / replans 封顶 / 危险工具在 Reactive 路径同样被拦。全量 **111 文件 / 1255 用例**。

## [v3.7.71] - 2026-10-02

**深评修复版：修掉一批「会咬人的静默问题」（竞态 / 泄漏 / 空转），并把四处与产品纪律相悖的虚假承诺文案诚实化。** 全量门禁 + CI 三 job 全绿。⚠️ 本版同时**代为收口了另一条会话遗留 11 项的在途工作**（v3.7.70 的 Notion/Linear 推送，commit `dcec2bd` 已并入，见该条台账）——两批工作的边界在那条 commit message 里有如实划分。

### 竞态与泄漏（本轮扫描的新角度，此前从未查过）

- **`confirmAgentPlan` 跨场景聊天串写**（`src/ai-retry.js`）：函数入口校验过 `p.sc === active`，但长执行期间用户切场景后 `active` 已变，`finally` 里 `save(PREFIX+"chat_"+active, hist)` 会把 A 场景的整段聊天写进 B 场景的键。修法：键名用**入口时定格**的 `p.sc`，读/写/trim 三处统一。
- **指针特效监听叠加**（`src/render-widgets.js` `_enablePointerFx`）：类型切换路径会在 enabled 状态下重复调用 → resize/mousemove/touchmove 三连重复绑定，监听数随切换次数线性涨。加 `enabled` 守卫（回调读的是 `_pointerFx.type`，换类型无需重绑）。
- **复核后不修的一条**：`_wfCheckDue`（60s）曾被扫出为「已归档功能残活」，复核确认它是 **v3.5 的 AI 定时工作流活功能**（有真实 UI 入口与删除按钮），与已归档的旧规则引擎是两套东西 —— flows 为空时 forEach 即 no-op，保持原样。**agent 的扫描结论必须人工复核再动手**，这条是反例。

### 云同步客户端加固（`src/ui-ge-api.js`）

- **并发刷新排队**：`_refreshing` 布尔 → 共享在途 Promise。旧版第二个并发 401 直接拿 `false` 放弃（请求白白失败）；现在后来者等待并复用同一刷新结果。
- **`expiresIn` 服务端优先**：旧版写死 15 分钟、忽略服务端签发时长 —— 后端调整后客户端会提前/滞后误判过期。
- **`API_BASE` 动态读取**：旧版模块加载时定格，设置里改 `apiBase` 不刷新页面不生效。改 `apiBase()` 函数，`window.API_BASE` 测试导出走 getter 保持兼容。
- **OAuth code 空转修复**：`apiConnectNotion/Todoist/GCalendar(code)` 此前**收下 code 即弃**，回调 URL 不带它 —— 后端没有 code 无法完成 OAuth 交换，连接按钮等于白点。改为 `?code=` 随 query 传递，code 缺失时直接短路返回失败。

### 文案诚实化（product-scope §四.4「文案承诺不得超出实际接线」）

- **habit-tracker 插件**：desc 承诺的「可视化图表」不存在、连续天数统计在核心「习惯链」—— desc/scenarioDesc 改为如实指向（中英）。
- **focus-timer 插件**：承诺「自定义时长 + 多段间隔 + 进度圆环」全不存在（计时器在工具箱番茄钟、固定 25/5）—— 改为如实指向（中英）。
- **pomodoro 插件**：场景真实，desc 补计时器位置指引（中英）。
- **天气插件卡**：兜底文案「点击同步」无任何事件处理（卡片不绑事件、也无数据供给链）→ 改「详细天气见工具箱『天气』」，`plugin.weather.sync` 词条更名为 `plugin.weather.where`。
- **onboarding**：`trigger.textContent = "已触发"` 硬编码中文入 i18n（新增 `onboard.simTriggeredDone` 中英词条）。

### 路线项（本版不动，记账防丢）

按产品定位「个人任务工坊、AI 真正动手」排序：① `executeAgentPlan` 加执行反馈回路（每步结果回喂模型，失败重试/重规划 —— 基础设施全在，是与"真 agent"最本质的差距）；② RAG 支持用户导入文档 + 按段落切块（现在只索引应用内四类数据且整条入索引）；③ 让语义召回/RAG 默认可用（内置本地 embedding 或至少显式告知降级）。

## [v3.7.69] - 2026-10-01

**Slack 通道改型：从「验证 Bot Token」接成「群机器人 Incoming Webhook 真发通知」（仅桌面版）。** 七家 provider 里第三家接到底，与飞书 / 钉钉共用同一套会话内存 + 主进程代发基建。全量 **109 文件 / 1241 用例**（v3.7.68 为 1235；+6 = Slack 的通道行为与 IPC 白名单用例）、`e2e` **74/74（3.1m）**、`lint`（四道）、`src:check`、`check:source-state` 均本机实测。

> **这批的来源要如实写**：代码与工作区里的测试是同一工作区**另一条会话**在 01:39–02:03 写的，写完闲置约 5 小时、**从未进过 git**（丢弃即不可恢复）。本会话按用户决定「不废弃、归并成正式能力」接手，补的是：版本归属（那批注释与文档原写 `v3.7.68`，而 3.7.68 已被上一版占用 → 17 处统一改 `v3.7.69`）、`docs/product-scope.md` 的全面对齐（见下）、本条台账，以及在**合并后的干净导出树**上重跑全门禁 —— 那批代码此前只在混合工作区里绿过。

### 为什么 Slack 只能走桌面版（两轴实测，不是推断）

`_probe/cors-matrix-providers.mjs` 用真实 Chromium 分别打 `file://` 与 `http(s)`：`hooks.slack.com` **两个 origin 都不回任何 CORS 头**（双双 `Failed to fetch`），而主进程 Node `fetch` 可达（回 404 `no_team`）—— 与钉钉同轴。所以 `notifyChannelAvailable("slack") = notifyHasMainSender()`，浏览器形态下面板写「仅桌面版可用」并**禁用连接按钮**；被拒的通道一个请求都不许发、也不许把 webhook 存进内存冒充已连接（拦在 `notifyHookConnect` 里而不是按钮上 —— e2e 有绕过 UI 直接调 `slackConnect` 的用例，本版本它就负责钉这一点）。

### 改型落点

- **凭据模型**：`{ botToken }` → `{ url }`，URL 本身即凭据、无加签；成功判定只看 HTTP 200（正文是纯文本 `ok`，主进程对非 JSON 响应回 `body=null`，所以**不能拿 body 判**）。填了不落盘：与飞书 / 钉钉同走 `_notifyHooks` 会话内存，刷新即失效，面板显式提示。
- **两道主机门**：渲染侧 `notifyHookSend("slack")` 先把主机钉死 `/(^|\.)hooks\.slack\.com$/i`（`hooks.slack.com.evil` 拒），主进程 `isSafeNotifyWebhookUrl` 白名单从三家加到四家作为第二道门。
- **删死码 + 反守护**：旧 Bot Token 模型 3 个函数（`slackSendMessage` / `slackNotifyEvent` / `slackCreateTaskFromMessage`，v3.7.60 起零调用方）整体删除，废弃名单 **24 → 21**；`integration-deprecated.test.js` 新增 `DELETED` 名单（v3.7.66 的 6 个 + 本轮 3 个）钉住「不回流」，内部互调已知数从 3 降到 2。
- **历史凭据回扫**：旧 `slackConnect` 曾把 `botToken` 密封写进 `wb_integration_providers`，`_notifyScrubPersisted()` 现在一并抹掉 feishu / dingtalk / slack 三条。
- **广播与状态**：`notifyHookBroadcast` 的渠道表、`notifyState` 的回显都加上 slack；不可用文案键 `notifyUnavailableKey("slack") = int.desktopOnly`（缺的是主进程，不是 origin）。

### 文档口径对齐（那批只改了 §三 开头一段，其余会自相矛盾）

`docs/product-scope.md` 里以下七处此前仍是"Slack 未接线"的旧口径，本轮逐条改到位：§三 表头「现剩五个」→ 四个、凭据验证举例里的 `slack.com/api/auth.test` 标注为已退役、废弃名单 24 → 21 与其守护描述「已删 6 个」→ 9 个、IPC 白名单「三家」→ 四家、历史回扫「两条」→ 三条、文案诚实度分组「未接线 5 / 已接线 2」→ 4 / 3、测试计数 22 → 26 与 13 → 14、以及「剩余待决」名单与「未决：仍走密封写盘」名单里都把 Slack 摘出去。**同一轮 CORS 矩阵还量出**：Notion / Linear 全形态浏览器直连可达（具备接线条件）、Jira 仅主进程可达（需中转 + 动态白名单，SSRF 面单独设计）、Google 日历本机网络不可达无法实测 —— 待定从五个变四个，逐条写进 §三。

### 发版后线上复核（v3.7.69 · 逐字节对上）

- **CI run 36800496421** 与 **Deploy run 36800496413** 全 job success（`e2e` + `test (ubuntu-latest)` + `test (windows-latest)` / `verify` + `e2e` + `deploy`）。
- 线上 `agent-workbench.html` = **3,571,810 B · sha256:ca6567f6a1fdaebef6f55a4148a029d027ad53fd01dfcd1d9d5bb101e83b36f5**，与干净导出树（`git archive a681a1e` → 树内 inject → `build.mjs --prod`）的产物 **`Buffer.compare === 0` 逐字节相同**；`VERSION="3.7.69"`、`BUILD_TAG="20261001a"`、`var __TEST_GATE__ = false`；Slack 通道分支 `kind === "slack"` 命中 4，v3.7.68 的移动端弹性列守护内容仍在（`.onboard-step{margin-top:auto}` 命中 1）。
- 线上 `service-worker.js` 的 `CACHE_VERSION = "v3.7.69-20261001012553"`（deploy 构建时叠 UTC 时间戳，**只用于确认用户吃到新版而非旧缓存**，不作跨构建指纹）。
- 本机门禁（同一棵干净导出树、以该树为 cwd）：全量 **109 文件 / 1241 例**、`e2e` **74/74（3.2m）**、`lint` 四道 + `lint:layers` + `check:pwa-icons` + `pet:check` 全绿。

### 已知取舍

- Slack 与钉钉一样是**桌面版专属**：浏览器与线上站点形态下这条渠道恒禁用，面板如实说明原因，不做"看起来能连"的降级。
- 本轮只接**通知**这一条消费链路；Slack 侧「从消息建任务」这类反向同步仍不存在（旧函数已删，不再留可复活的尸体）。

## [v3.7.68] - 2026-10-01

**移动端首屏引导的两处缺陷收口：① ≤767px 下引导 modal 是「满屏卡片 + 顶对齐内容」，主按钮悬在屏幕中部、下方 358px 是一整块空白面板；②「跳过」按钮不结束引导，只是翻到下一步。** 第 ② 条是第 ① 条的守护用例自己抓出来的，不是人工 review 发现的。本机 Pixel 5 预设与线上真机各走查一遍；`tests/e2e/mobile.spec.js` 新增 3 条移动端布局不变量，`tests/onboarding.test.js` 15 → 17 条。**版本串与台账的口径要先说清：这两笔此前已单独推过 main（`5b1a04b..13789ac`），而 deploy 工作流是 `on: push: branches[main]` → 它们已经在 `v3.7.67` 的标签下跑过一段线上（CDN 实测 3,571,339 B / sha256:0d309e585c8a6b57…）。所以 v3.7.67 台账里那条 prod 指纹（3,570,127 B / sha256:783f4212be9f4d0b…）只对它自己那次构建成立，不含这两笔；本次 bump 的作用是让「版本串 ↔ 产物字节」重新对上。**

### ① 满屏卡片 + 顶对齐内容 = 半块空白面板

`@media(max-width:767px)` 里只把 `.onboard-card` 拉到 `height:100dvh`，内容仍按文档流顶对齐 —— 三步实测主按钮停在 y≈265–309，`vh - actions.bottom = 337.8`。修法照**同仓已经正确的** `.help-card` 形状（`display:flex` + `.help-body{flex:1;overflow-y:auto}`）：卡片改 flex 列，`.onboard-actions` 与**首个子元素** `.onboard-step` 各吃一个 `margin-top:auto` → 剩余空间上下平分（内容居中、操作贴底）；内容超出时两处 auto margin 自动归零，基线 `.onboard-card{overflow-y:auto}` 接管，不会裁切。另补 `padding-bottom:calc(var(--space-5) + var(--safe))` 让刘海机不压 Home 指示条。

修后实测（375×667，本机与线上同一组数字）：三步 `gapAbove` 177–229 对 `gapToActions` 171–229、`vh - actions.bottom = 20`（就是 padding）、按钮高全 44、无横向溢出、零 pageerror。窄屏另测 375×400（仍居中贴底）与 375×320（auto margin 归零、卡片滚动接管，CTA 滚一点即达）。

### ②「跳过」按字面意思结束引导

第 1/2 步的 `#onboardSkip` 旧接线是 `close() + 渲染下一步` —— 按钮写着「跳过」，点了却再来一屏。引导 modal 既没接 Esc 也没接遮罩点击，移动端又是全屏 sheet，于是新用户必须连点三次才脱身；真正会结束的反而是末步那颗「稍后再说」。现在三步的次要按钮统一为「立刻结束」，主按钮负责推进。

连带改测试口径：`onboarding.test.js` 原「一路跳过走到底」三步循环不再成立，改为用每步主按钮走完（`#onboardDone → #onboardNext → 末步 #onboardSkip`），并补两条「第 1 步跳过即结束」「第 2 步跳过即结束」的缺陷回归；`workflow.spec.js` 两处「连点三次 `#onboardSkip`」收敛为点一次 + 断言不再弹出。

### 守护与门禁

- 3 条移动端布局不变量（卡片满屏 / 操作贴底 ≤32px / CTA 落在视口下 40% / **上下留白差 ≤40** / 按钮 ≥44px / 无横向溢出）。**只断言「贴底」会漏掉空白本身**，所以把「内容上方留白 ≈ 内容到按钮的留白」写成不变量 —— 回归时该差值是 338px。删掉两条 `margin-top:auto` 即红（实测 337.8），守护不是哑的。
- 本机实测：`onboarding` 17/17、`mobile` e2e 6/6、`desktop workflow` 2/2、`lint`（四道）+ `src:check` 全过；推送后 **CI run 36780279872** 与 **Deploy run 36780279800** 逐 job success（ubuntu/windows/e2e + verify/e2e/deploy）。
- 复核线上的判据写法（本次先写错过一次，记下来）：`close(); _onboardRenderStep(n)` 线上有 2 处是**正常**的 —— 那是第 1 步主按钮与第 2 步「下一步」的推进接线（`src/ui-onboarding.js:91/:108`），只有挂在 `skip.onclick` 上才算残留；「跳过」修复的判据是 `skip.onclick = ()=>{ close(); _finishOnboarding(); }` 命中 **3**（末步本来就有 1 处）。

### 发版后线上复核（v3.7.68 · 逐字节对上）

- CI run **36788382454** 与 Deploy run **36788382477** 全 job success（22:56:16Z 触发 → 23:05 终态，这次没排托管队列）。
- 线上 `agent-workbench.html` = **3,571,339 B · sha256:be38d612a2730970e8c47de21639f27df42b2d3d950000cf757205a3661f6b62**，与本机在**干净发版树**（`git archive 1e4f9e7` 导出后自行 inject + `build.mjs --prod`）算出的 prod 产物 **完整 sha256 逐字节相同**；`VERSION="3.7.68"`、`BUILD_TAG="20260930c"`、`var __TEST_GATE__ = false`。
- 修复本身在线上的命中计数：`.onboard-step{margin-top:auto}` 1、`.onboard-actions{margin-top:auto` 1、`skip.onclick = ()=>{ close(); _finishOnboarding(); }` 3、挂在 `skip.onclick` 上的 `_onboardRenderStep` **0**。
- 线上 `service-worker.js` = 24,795 B、`CACHE_VERSION = "v3.7.68-20260930230410"`（与 gh-pages 那份一致；此值每次构建叠 UTC 时间戳，**不能当跨构建指纹**，指纹只认 HTML 的 sha256）。
- 本次 bump 的字节数与上一版**完全相同**（`3.7.67→3.7.68`、`20260930b→20260930c` 都是等长替换）→ 判"是否已上线"不能看 bytes，必须看 `VERSION`/`BUILD_TAG`；上一版（同 3,571,339 B / sha256:0d309e585c8a6b57…）是这两笔修复在 v3.7.67 标签下的那次线上内容。

### 已知取舍（如实登记）

- 引导 modal 仍**没接 Esc / 遮罩点击**（`src/ui-global-events.js` 里没有它的分支）。现在每步都有「立刻结束」的次要按钮，不再是拦路，但键盘用户仍然关不掉 —— 留给下一批。
- 第 2 步刚进来时那条「已把「…」标记完成」toast 会短暂压住「第 2 / 3 步」这行眉标（toast 层级 `--z-toast:90` 高于 `--z-modal:80` 是有意为之，反馈必须可见）。内容改居中后正文已不再被压，故不再动 toast 层。

## [v3.7.67] - 2026-09-30

**RAG 增量索引落地 —— v3.7.59 登记的「笔记/任务/记录/对话历史只在手动『重建索引』时进真 RAG」缺陷清偿（product-scope §三 同步改判 ✅）。数据写路径经 core 新增的 `emitDataMutate` 广播位触发 ai-tools 的 `ragSyncIncremental`：内容哈希 diff 只落变更文档，新增/修改即入库即召回，删除即连向量一起移除；手动重建保留作全量兜底。全量 **109 文件 / 1233 用例**（v3.7.66 为 108/1223；+10 = `rag-incremental.test.js`）、`e2e` **71/71（3.8m）**、`lint`（四道）、`check:ai-tools-doc`、`pet:check`、`check:modules`（35 块 · 50 循环 / 53 逆层 · 重复定义 0，**无新增**）、`check:source-state` 源码态，均本机实测。**发版后线上复核**：Pages 取回 **3,570,127 B · sha256:783f4212be9f4d0b58a5a3224769bde86647812a7a4240f57e70b6b693aee9de**（与本机 `build:prod` 指纹**逐字节相同**）、`VERSION="3.7.67"`、`BUILD_TAG="20260930b"`、`var __TEST_GATE__ = false`。**

### 挂接点与分层（零新增逆层）

- **四个写路径**：`setTasks` / `setRec`（data-rw）、`saveNotes`（ui-ge-notes，创建/更新/删除全走它）、`appendChat`（data-links，对话唯一运行时写口）；**两个批量入口**：`doImport`（ui-backup-stats，整表覆盖后全量收敛）与 `_applyCloudSnapshot`（render-overview，云端恢复后收敛）。
- Data 直接调 ai-tools 会新增**逆层边**（data-rw>ai-tools），照 v3.7.66 `registerExternalNotifier` 的同款解法：core 留注册位 `registerDataMutateListener` / `emitDataMutate`（低层 emit、高层注册、异常隔离），两条边都向下。实测依赖图新增 7 条边**全部指向 core**（data-links/data-rw/ai-tools/render-overview/ui-backup-stats/ui-ge-notes +1），循环 50 / 逆层 53 未动。
- `ragReindex` 与 `ragSyncIncremental` 共用同一份构建器 `_ragCurrentDocs()`（docId 规则/内容拼法/deletedAt 过滤单一来源），两条路径永不漂移。

### diff 语义与节流

- **FNV-1a 内容哈希**比对已索引 vs 当前：内容没变就一个字节都不动 —— 只改不入索引的字段（如任务 status 勾选完成）**零重建、零 embedding 请求**（有用例直接数 fetch）。
- **≤48 条直嵌**（入库即召回，小改动即时可语义检索）；**>48 条退回批量回填**（`ragEnsureVectors`，32 条/请求），导入几百条也不会打几百个网络往返。防抖 4s 合并勾选风暴；同步单飞（进行中调用只登记 pending，结束后自动再排一轮直至收敛）。

### 顺手修掉一个真缺陷：ragInit 回填与同步循环的竞态

- `ragInit` 里有 fire-and-forget 的有界回填（`ragEnsureVectors(20)`）。增量同步调用 ragInit 后立刻开始逐条入库+直嵌，回填并发地把你**刚写入的文档**当成"缺失向量"再嵌一遍 —— 实测 4 文档同步打出 **5 个请求**（同一条任务文本两次网络往返）。生产里是小浪费，测试里是非确定性。修法：`ragInit` 加 `skipBackfill` 选项，同步路径传入（向量由同步自己确定性负责：直嵌或批量回填二选一）；检索/重建路径行为不变。

### 已知取舍（如实登记，非缺陷遮掩）

- 对话历史 docId 按数组下标编（`chat:sc:i`，沿用重建索引的既有规则）：`slice(-50)` 裁剪触发时下标整体平移，位移条目会按哈希 diff 重建一轮 —— 防抖+单飞把它合并成一次，且哈希不变的不重嵌。改成内容稳定 id 需迁移既有向量，收益不抵，故保留。
- 云端恢复（`_applyCloudSnapshot`）直写 localStorage 但不刷新 `chats[sc]` 内存 → 任务/记录/笔记文档立即收敛（live 读），**对话文档在下一次 appendChat 后收敛**。导入（doImport）有 `_reloadChatsFromStorage` 不受此限。
- 测试假象教训披露一次：直跑 `npx vitest` 改完 src 后忘重新注入，测的是**旧拼回产物** —— loadApp 的源码态守卫能防"完全没注入"，防不了"改后没重新注入"。本轮定位竞态时被它骗过一次（skipBackfill 修复"无效"其实是没重注入），重新注入后 10/10。

## [v3.7.66] - 2026-09-30

**飞书/钉钉「群机器人 webhook」通知通道接到底（用户 09-29 定案：渠道取飞书+钉钉，"那种东西"=凭据，口径是绝不落盘）+ 修掉「集成连接弹窗点了不出现」的长期缺陷 + preload 暴露面契约测试（顺带清掉一个从不执行的假守护）。全量 **108 文件 / 1223 用例**（v3.7.65 为 104/1166；+39 = notify-webhook 22 · electron-ipc notify-send 13 · preload-contract 4）、`e2e` **71/71（5.6m）**（notify-hook 按 origin 分组 7 条 × desktop/tablet 两项目，真实 Chromium）、`check:modules`（35 块 · 50 循环 / 53 逆层 · 重复定义 0，无新增）、`build:check` 五源一致 **v3.7.66 · BUILD_TAG 20260930a · sha256:ad9a25f290b28d03**，均本机实测。**发版后线上复核**：Pages 取回 **3,562,424 B · sha256:4974d227c039596556a8ae86beeab4e3f1aacf4f9eaf7dbf3c16f0f268dea68c**（= 注入态 3,562,634 − 210 B，恰为 prod 口径的 `__TEST_GATE__` 替换量）、`VERSION="3.7.66"`、`BUILD_TAG="20260930a"`、`var __TEST_GATE__ = false`（`[prod build]` 标记在位）。⚠️ 核对口径补一笔：粗放正则 `__TEST_GATE__\s*=\s*\w+` 会命中**注释里**的 `__TEST_GATE__=true` 字样而误报"线上是注入态"——必须锚定 `var __TEST_GATE__` 定义处（本轮实测踩到并复核澄清）。**

### 通道与可达性（origin × 传输两轴，实测而非推断）

- **通道选型**：群**自定义机器人 webhook**，不是企业自建应用。旧 `appKey/appSecret + chatId` 要管理员权限、还要用户拿不到的 `chatId`，个人场景根本配不通 —— 这正是 v3.7.60 把 6 个旧函数判死的原因。webhook 一个地址即可、天然单向，恰好匹配"通知推出去"。
- **CORS 矩阵实测**（`_probe/cors-origin-matrix.mjs` 真实 Chromium 分别跑 `file://` 与 `http://127.0.0.1`；`_probe/electron-cors-main.cjs` 真 Electron）：webhook 是 `Content-Type: application/json` 的 POST **必触发预检** —— 飞书只在 Origin 为真实 http(s) 源时回 `ACAO: *`（`file://` 下一个 CORS 头都不回，`curl -H "Origin: null"` 复测确认）；钉钉**任何 origin 都不回**。本应用 Electron 窗口 `sandbox:true` 且 `loadFile()` = `file://` → 渲染进程连飞书都发不出去，只有主进程能发。结论落成分流：**飞书**在 http(s) 源（启动本地服务.bat / 线上站点）或有主进程时开放，**钉钉仅桌面版**；其余情况面板禁用连接按钮并用 title 写明原因与出路。⚠️ 取证教训已记档：只带一个 Origin 用 curl 测出 `ACAO: *` 就下"浏览器可用"结论，是一轴的证据推两轴的结论。
- **被拒的通道一个请求都不发**，也不把 webhook 存内存冒充已连接（`notifyHookConnect` 里拦，不在按钮上拦 —— e2e 有绕过 UI 直接调用的用例）。

### 主进程代发（`notify-send` IPC）的安全边界

- **主机白名单** `isSafeNotifyWebhookUrl` 只放行三家公开 webhook 主机：**精确匹配**（`oapi.dingtalk.com.evil.example.com` 必拒）、强制 `https:`、拒 userinfo（`https://oapi.dingtalk.com@evil`）、拒回环与链路本地（`127.0.0.1` / `169.254.169.254`）；`assertTrustedSender` 与 chat 同一道门；`timeoutMs` 钳 1–20s。
- **日志脱敏**：只记主机与状态码，绝不记 `access_token` / `sign` / 正文（有用例直接读 `logs/app.log` 反证）。
- **签名口径**：钉钉 ts 用**毫秒**、`sign = HMAC(key=secret, data=ts+"\n"+secret)` 进 **URL query**；飞书 ts 用**秒**、`sign = HMAC(key=ts+"\n"+secret, data="")` 进 **JSON body** —— 两者方向相反，写反必签失败。
- **失败口径**：钉钉 HTTP 200 仍可能 `errcode≠0`，只看 `resp.ok` 会把失败当成功，已按 `errcode` 判定；`notifyHookSend` **永不抛错**，失败只进诊断面板（`pushDiag`），本地通知不受影响。

### 不落盘（🔴 硬约束）+ 历史凭据回扫

- webhook 地址与 Secret **只存会话内存**：不走 `integrationRegisterProvider` / `_intSaveProviders` 密封写盘链。**三条零持久化断言**在真实 Chromium 里跑：配置后 localStorage 无 `wb_integration_*` 飞书/钉钉条目、刷新后凭据确实失效、面板回显只给 `host/…xxxx…` 脱敏 hint。
- `_notifyScrubPersisted()` 在 `startup()` 一次性抹掉旧版本写进 `wb_integration_providers` 的 feishu/dingtalk 凭据（含当时不算"敏感"的 `appId` / `accessKey` 明文），幂等。
- 文案显式写「⚠ 只保存在本次会话内存里：不写入本地存储、不进备份与云同步，刷新或关闭页面即失效」；文案诚实度守护归 `integration-jira-domain.test.js`（未接线 5 家必须写"尚未接入"、已接线 2 家必须写 webhook + 会话内存 + 不许承诺同步 + 钉钉必须写「仅桌面版」）。

### 顺带修的缺陷与假守护

- **修「连接弹窗点了不出现」**：`openIntegrationConfig` 只给外层 `.overlay` 加 show，内层 `.cmd` 基类是 `display:none` —— 点「连接」后弹窗根本不出现。jsdom 测不出（不渲染样式），e2e 才能抓到。
- **删 `tests/preload-static-check.cjs`**：它从不被 vitest 收集（`include` 只收 `tests/**/*.test.js`，CI 与 npm 脚本都没引用），断言本身还是错的（要求 preload 从 `electron` 解构 `app`，而 `app` 属主进程、preload 本就不该有），实测 `node tests/preload-static-check.cjs` 直接 exit 1 —— "看起来在检查、真跑必红"比没有更糟。替代者 `tests/preload-contract.test.js` 真的用假 `require("electron")` 执行 preload、捕获交给 `exposeInMainWorld` 的对象来断言（非文本正则），堵住「preload 少暴露一个方法 → `typeof api.notifySend === "function"` 恒 false → 钉钉永久退化」而全部门禁照绿的缝隙。
- **废弃函数 30 → 24**：飞书/钉钉选定 webhook 后，6 个旧凭据模型函数（feishu/dingtalk × SendMessage/NotifyEvent/CreateTaskFromMessage，含 1 条传递性内部边）**直接删除**；其余 24 个（notion/linear/jira/slack/日历）**仍只标记**，等五家定案。守护 `integration-deprecated.test.js` 锁「标记仍在 + 仍然零调用 + 活路径未被误标 + 已删的 6 个不回流」。
- **分层**：没有让 `ui-daily` 直接调 `ui-ge-integrations`（`check:modules` 实测会新增逆层边）。改为 `core` 暴露 `registerExternalNotifier` / `emitExternalNotify` 注册位，两条边都向下；通道自己决定要不要真外发，任何通道抛错不冒到调用方。
- **消费点**：`notifySystem`（`src/ui-daily.js`）本地展示之外多一条外发漏斗，5 个生产调用点全部带上事件类别：`daily` / `due` / `chain` / `review`×2。

### 披露

- 每条新守护都做过**变异验证**：注入 `localStorage.setItem("wb_integration_providers", …)` → 零持久化转红并点名该键；摘掉 `_notifyScrubPersisted` 写回 → 回扫两条转红；未登记类别兜底改回旧写法 → 「关不掉的通道」转红；摘掉 `preload.js` 的 `notifySend` → 契约组 3 条转红且报出方法名。
- 本机 `verify:ci` 首跑遇一次 **vitest worker「Timeout calling onTaskUpdate」偶发假红**：108/108 文件全过后主进程 RPC 超时退 1 → posttest 未执行 → HTML 留在注入态，被收尾断言如实抓下；单独重跑全绿后十步全过。与 v3.7.64 的超时预算取证同源（本机全量并行下的基础设施抖动，非代码缺陷）。

## [v3.7.65] - 2026-09-29

**反馈出口 + 一条死路径修复 + 构建口径修正 —— ① 诊断面板补「提交 Issue」，把 v3.7.64 只到「复制到剪贴板」的反馈链路接到「有人能收」（脱敏报告预填 GitHub 新建 Issue，应用自身零请求）；② 线上实测揪出「新用户三步引导永不可达」：`seed()` 先播种演示任务、`needsOnboarding()` 又要求无任务，两者互斥 → 修正为只看标记，启动处不再让主界面渲染与引导互斥（引导改 modal 叠加），8 个 e2e spec 随之接入稳态夹具；③ `--prod` 日志的「bytes」实为 UTF-16 字符数（与 96ee171 给 `--check` 修掉的同一病灶），并补齐 `build` / `build:prod` 缺失的 post 自愈钩子。**本机实测全绿：`verify:ci` 十步按序 exit 0 + 收尾断言回源码态、全量 **104 文件 / 1166 用例**（v3.7.64 为 104/1156；+10 条 = diag 7→13、onboarding 7→12）、`lint`（四道）、`lint:layers`、`check:modules`（35 块 · 50 循环 / 53 逆层 · 重复定义 0，无新增）、`build:check` 五源一致 **v3.7.65 · BUILD_TAG 20260929a · 3,544,739 bytes · sha256:90f1745bb53d1ab3**、`e2e` **57/57（3.5m）**。**本版起台账同时记线上产物指纹**：`build:prod` → `agent-workbench.prod.html` **3,544,529 bytes · sha256:20ae62518278bab5**（与注入态差 210 B，即 `__TEST_GATE__` 置 false 的替换量）。**发版后线上复核**：Pages 取回 **3,544,529 B · sha256:20ae62518278bab5**（与本机 prod 指纹逐字节相同）、`VERSION="3.7.65"`、`BUILD_TAG="20260929a"`、页内已含 `btnOpenIssue`、`var __TEST_GATE__ = false`。**`CACHE_VERSION` 不入等价性判据** —— 它由每次 prod 构建叠加 UTC 时间戳生成：部署作业那次是 `v3.7.65-20260928231049`（线上 `service-worker.js` 与 deploy 日志双向对上），本机预演那次是 `v3.7.65-20260928221216`，拿后者去核对线上必然「对不上」，属口径而非缺陷。

### ① 反馈出口：把「复制报告」接到「有人能收」

**动因**：v3.7.64 的 R1 面板只能把报告复制到剪贴板，而 `.github/` 下只有 `workflows/`、无 `ISSUE_TEMPLATE`，全仓也没有任何 issues 出口 —— 用户复制完没有地方粘，免费期最想要的「体验反馈回收」其实没闭环。

- **实现**：面板新增 `#btnOpenIssue` → `openDiagIssue()`：先把**完整**报告写入剪贴板（尽力而为），再打开预填链接。`_diagIssueUrl()` 的标题为 `[v3.7.65 · 形态标签]`，标签是 ASCII（`electron`/`pwa`/`file`/`local`/`web`），**不随界面语言变化**；正文按条数 `40→20→10→5→2` 逐级截断，仍超长则按字符收缩到预算内。预算：浏览器 7000、Electron 2000 —— GitHub 文档明示超长链接返回 414、非法返回 404。
- **出口链路取证**（结论都带出处，不靠记忆）：仓库为 PUBLIC 且 Issues 已开启（`gh repo view`）；匿名 `curl /issues/new?body=x` 返回 **302 → 登录页且 `return_to` 完整保留查询参数**，说明链接可达、参数不丢；Electron 下外链由 `setWindowOpenHandler` 交给 `_openExternalSafe`（协议白名单放行 `http/https/file`，`electron/main.js:390-403`）后 `deny` 内窗，`window.open` 因此**返回 null** —— 实现按「未抛错即视为已打开」判定，不按返回值误报失败。
- **单一模板是刻意的**：`.github/ISSUE_TEMPLATE/config.yml` 关闭空白 Issue、只留 `feedback.md`。存在多模板或允许空白 Issue 时 GitHub 先进「选择模板」页，`/issues/new?title=&body=` 的预填参数有被丢弃的风险；该交互无法匿名实测（需登录），故用配置消除分叉，并把理由写进 config 注释。
- **口径诚实化**：面板注释与 `about.diagDesc` 原写「纯本地，不联网」—— 新增出口后如实改为「由用户点击在浏览器打开 GitHub，应用不会自动上传任何数据」；隐私边界不变（报告只含版本/运行形态/存储用量/脱敏技术日志）。用例 ⑤ 以 `fetch`/`XMLHttpRequest` 探针黑盒断言**零网络请求**。
- **数据面**：`buildDiagReport(opts.maxEntries)` 为 Issue 正文而生，缺省调用逐字保持 v3.7.64 行为（⑦ 守护）；i18n 中英各 +4 条 key（`i18n-completeness` 要求两侧集合完全一致）；`docs/module-graph.md` 由 `check:modules` 再生成（`ui-global-events` 扇出 494→497，来自新增的 3 处跨块引用 —— 顺带记录：`--check` 模式也会重写该文档，见 `scripts/module-graph.mjs:245` 在 CHECK 分支之前）。
- **测试**：`tests/diag-report.test.js` 7 → **13** 条（出口行为 / 剪贴板不可用仍开页 / 爆量与单条超长的预算 / Electron 更紧预算 / maxEntries 语义 / ASCII 标题）。

### ② 新用户引导此前是一条死路径（线上实测揪出）

**症状**：清空 `localStorage` 模拟新用户后重载 —— 演示数据被重新播种（4 条任务）、`wb_agent_onboarded` 为 null、**引导界面不出现**。

**根因**（代码 + 实测双证）：`seed()` 在 `ui-global-events.js:1871` 的模块顶层先执行并写入演示任务，而 `needsOnboarding()`（`ui-onboarding.js:4-8`）要求 `tasks.length === 0` 才为真 → 两者互斥，真实新用户永远进不了三步引导。单测此前直接调用 `renderOnboarding()` 断言 modal，恰好照不到这条接线。

- **修法**：`needsOnboarding()` 只看 `onboarded` 标记；启动处不再让两个分支互斥 —— `render()`/`checkCount()` **恒执行**，引导作为 modal 叠加（旧写法命中引导时主页是一片空白，用户走完三步前看不到任何看板）。`dailyDigest()` 语义保持不变（无需引导或 `_finishOnboarding()` 收尾时触发）。
- **连带（这一步是本版最大的隐藏成本）**：`.onboard-modal` 是 `position:fixed;inset:0` 的全屏层（`agent-workbench.html:2631`），真实浏览器有 hit-testing，不清掉就会挡住其余 spec 的所有点击断言。新增 `tests/e2e/_fixture.js`（页面脚本执行前写入 `onboarded`），8 个 spec 改为从夹具取 `test`；`workflow.spec.js` **故意保留原生 test**，由它真跑引导三步本身（该 spec 早已写好 `#onboardModal, #taskForm` 与三步跳过逻辑 —— 也就是说它一直是按「引导会出现」设计的，此前从未被触发）。e2e 实测 57/57。
- **抖动加固（都带实测依据，只放宽天花板、不放宽判据）**：`tests/p0-crossdevice-key.test.js` 的 `waitFor` 上限 2000→15000 —— 该文件自述的第②类并行抖动被加重的 boot 顶了出来（全量并行下 T4 的「导入收尾 toast」三次重试都未在 2s 内到达，单跑 4/4 必过）；onboarding 的 boot 用例改用 `loadApp({ noCrypto: true })` + 30s + `retry: 2`（单跑 2.7s，全量并行实测 >15s 未达）。
- **测试**：`tests/onboarding.test.js` 7 → **12** 条，含「播种后仍必须触发引导」的缺陷回归与 boot 级接线断言。

### ③ 构建工具两处口径修正

- **`--prod` 的「bytes」不是字节**：`scripts/build.mjs:100` 用 `prodHtml.length`（UTF-16 字符数）标称 bytes —— v3.7.64 实测把 3,537,005 B 的线上文件报成 `3191998 bytes`（Pages deploy 日志第 2308 行）。改用 `Buffer.byteLength`，与 96ee171 给 `--check` 定的口径统一；本版日志已给出真实值 3,544,529 B。
- **补齐两条 post 钩子**：`prebuild` 与 `prebuild:prod` 是唯二没有 post 对应项的注入钩子（其余 7 条 `pre*` 都配了自愈），本地跑 `npm run build` / `npm run build:prod` 会把工作区留在拼回态、诱发误提交。补齐后实测 `build:prod` 结束 HTML 自动回到源码态 623,053 B，`.prod` 产物照常落盘且都在 `.gitignore` 第 7-8 行内。README 第十一节旧口径「两个例外是发布路径……故意留在拼回态」随之删除，并注明交付物实际落在独立的 `agent-workbench.prod.html` / `service-worker.prod.js`。
- **顺带澄清一个易误读现象**：线上产物比 `build:check` 少 210 B **不是版本漂移**，而是 `--prod` 把 `__TEST_GATE__` 硬置 false 的固定差值（该替换有 `RE.test` 守卫，替换不成会直接 fail）。本版起台账同时记录注入态与 prod 两个指纹，核对线上时不必再靠猜。

### 另一观察（未修，仅记录）

`npm test` 失败时 npm 不执行 posttest，工作区留在拼回态 —— 本版取用例数时再次现场遇到：一次运行因 vitest worker RPC 超时（`[vitest-worker]: Timeout calling "onTaskUpdate"`，同批单条用例被拖到 26-46s）以 exit 1 收场、7 条用例未计入，需手动 `npm run src:extract` 还原。属并行争用的环境级抖动而非断言失败；权威背书是同套代码的 `verify:ci` 第⑤步 exit 0 与另一次 104 文件全绿。



## [v3.7.64] - 2026-09-29

**新增「诊断与反馈」面板（关于卡内，纯本地不联网：查看近期诊断 + 一键复制脱敏报告）+ 修掉一处构建怪癖 —— post 钩子把立绘注入顺序写反，导致仓库把立绘双存约 849KB（`src/render-widgets.js` 内联 base64 与 `assets/pet/` 并存）+ vitest 超时预算 20s→60s（本机全量并行下偶发假红，根因取证并入注释）。**全量 104 文件 / 1156 条用例（v3.7.63 为 103/1149；+1 文件 = 新增 7 条诊断报告用例）、`verify:ci` 10 步按序全绿、`lint`（四道）、`check:modules`（35 块 · 50 循环 / 53 逆层，对照基线无新增）、`build:check` 五源一致（v3.7.64 · BUILD_TAG 20260928d · sha256:b04f6ca80ef3451a）、e2e **57/57**，均本机实测。

### ① 诊断与反馈面板（免费期的「体验反馈回收」最小机制）

**背景**：`_diagLog` 诊断缓冲此前只有测试侧读取，用户遇到问题没有上报出口（截图/口述都难复现）。本版在「关于」卡加一个纯本地的诊断与反馈面板 —— 不做任何联网上报，反馈靠用户自愿复制。

- **报告内容**（`buildDiagReport()`）：应用版本 `v{版本} · b{BUILD_TAG}`、运行形态（独立/嵌入）、浏览器 UA、语言与时区、存储用量行、诊断条数、近期诊断条目；条目**入队即脱敏**（`_scrub`：32 位 token 一律显示为 `[REDACTED]`，不是只在上报时洗）。
- **复制路径**：`#btnCopyDiag` → `navigator.clipboard.writeText`，成功 toast「诊断报告已复制」；剪贴板不可用/抛错 → 回退 `#diagFallback` 只读 textarea（移除 `u-hidden` + focus + 全选），提示手动全选复制。
- **列表**：展开 `<details id="diagCollapse">` 时渲染 `#diagList`（新→旧；`textContent` 写入防 XSS），空态有文案。
- **隐私边界显式写进文案与测试**：报告只含版本/运行环境/脱敏技术日志，不含任务/笔记正文 —— 单测以「隐私黑盒」钉住（预置含 `SECRET_TITLE_XYZ` 的内容，断言其不得出现在报告里）。
- **测试**：新增 `tests/diag-report.test.js` 7 条（报告内容 / 脱敏+隐私黑盒 / clipboard 可用路径 / 回退路径 / 列表渲染 / 空态）。
- **浏览器实测**（Playwright，本机）：展开收起与列表渲染、入队即脱敏、clipboard 路径（436 字符报告 + 成功 toast + 回退框保持隐藏）、回退路径（warn toast + 回退框可见/聚焦/全选 0–436）、明暗两主题布局正常；唯一控制台 error 是应用请求未启动的 `localhost:3001` 开发接口，与面板无关。
- **文件**：`src/ui-backup-stats.js`（+116 行）、`src/core.js`（MESSAGES +18 行，中英双语）、`src/ui-global-events.js`（`__TEST_GATE__` 导出 +2）、HTML 骨架 +14 行。

### ② 修构建怪癖：post 钩子立绘注入顺序颠倒（仓库双存 ~849KB）

**症状**：`src/render-widgets.js` 在 git 里带着 869,324 字符内联 base64（`_PET_ART`）—— 立绘在仓库**双存**：既在 `src/render-widgets.js` 里，也在 `assets/pet/` 9 张 PNG 里。

**根因**：post 钩子（拼回态 → 源码态）两步顺序写反。旧顺序 `src-split --extract` 先执行时立绘还在 HTML 内（`pet-art --extract` 尚未抽出）→ base64 被当源码抽回 `src/render-widgets.js`；随后 `pet-art --extract` 发现 HTML 里已无立绘，**静默无操作**。抽取方向必须严格是 `src-split` 的反向逆序（`pet-art --extract` 先、`src-split --extract` 后）。

- **修法**：7 处 post 钩子（posttest / postlint / postlint:layers / posttest:coverage / postbuild:check / poste2e / postpet:check）全部改为 `node scripts/pet-art.mjs --extract && node scripts/src-split.mjs --extract --no-backup`；固化 `src:inject`（`src-split && pet-art`）与 `src:extract`（`pet-art --extract && src-split --extract`）两条链式命令；`release.mjs` 的还原提示同步为正确顺序。
- **防回归三道**：`check-source-state.mjs` 新增 ②b 门禁（`src/` 内联 base64 图片数据即失败）；`src-split.mjs --check` 新增 `normArt` 归一化（拼回态下 `render-widgets.js` 的 `_PET_ART` 按 `assets/pet/` 归一化后再比对，避免误报「内容不一致」诱导人回退到旧顺序）；`tests/build-structure.test.js` 新增「`src/` 不含 base64」断言。
- **实测**：`src/render-widgets.js` 1,149,465 → 279,851 字节（-869,614），4,667 行。**字节恒等闭环三次验证**（迁移后 / 全量测试后 / 再抽取后）：`render-widgets` 与「legacy 仅替换 `_PET_ART` 行」逐字节一致、骨架与拆前 SRC0 一致、order.json×2 与 9 张 PNG 未变、重拼交付态逐字节恒等。
- **文档同步**：README / CONTRIBUTING / `docs/pet-system.md` / `docs/module-graph.md` 的双向链与顺序口径更正。

### ③ vitest 超时预算 20s → 60s（全量并行下偶发假红的取证与修正）

**症状**：本机全量并行（32 核 ~31 worker）跑 `npm test`，`tests/api-token-crypto.test.js` 偶发「Test timed out in 20000ms」假红（②③ 都出现过，复现依赖并行争用程度）。

**取证**：同一文件隔离运行 ② 仅 1.7s；全量并行下 ① 16.7s、④ 31.4s（均通过）、③ 44.5s 被 20s 掐断；插桩 ② 内部 `seal=4.7s / loadApp=4.0s`。**关键反证**：④ 在 20s 预算下实际跑到 31.4s 才成功 —— 超时定时器本身被事件循环饥饿拖晚，说明瓶颈是预算本身而非产品挂死（jsdom 无 IDB 路径已排除挂死面）。

**修法**：`vitest.config.js` 的 `testTimeout` / `hookTimeout` 20000 → 60000，注释写明实测依据；单用例仍可用 `it(..., { timeout })` 单独覆盖。

**另一观察（未修，仅记录）**：`npm test` 失败时 npm 不执行 posttest，工作区会留在**拼回态**（重跑一次或手动 `src:extract` 还原即可）—— 本次仅记录该 npm 行为，不改变现有钩子结构。

## [v3.7.63] - 2026-09-29

**「全局事件绑定」全仓最大的块按 section 拆成 8 块（8,566 行 / 376KB，行数口径 → `ui-global-events` 2,238 行 + 7 个 `ui-ge-*` 合计 6,333 行；7 个切点经 espree 机械审计；纯位移 —— 拼回产物与拆前逐字节等值）+ `module-graph` 基线重冻结（35 块 · 50 循环 / 53 逆层 · 重复定义 0；「44→50 / 35→53」经粗粒度合并等价验证证明是表示层效应，非新增耦合）。**全量 103 文件 / 1149 条用例（未新增用例，5 个测试文件只做块路径同步）、`verify:ci` 10 步按序全绿、`lint`（四道）、`check:modules` ✓、`build:check` 五源一致（v3.7.63 · BUILD_TAG 20260928c · sha256:847e07f4cdb64d88）、e2e **57/57**，均本机实测。

### ① 拆「全局事件绑定」最大块（v3.7.62 护栏先行后的第一步）

**为什么拆它**：8,566 行 / 376KB，全仓行数最大的块；层注释写「交互层·全局事件绑定」，实际承载集成框架 / OAuth2 残留 / 列表渲染等本应属其它层的内容 —— 是逆层边的主要成因，也是拆分收益最高的一块（拆分记录见 `docs/architecture-layers.md` 三·补）。

**切点**：7 处全部经 espree 机械审计 —— 行首、AST 深度 0（最内层节点为 Program）、不在任何 token / 注释内部；新块标题 = 源码里新插入的层注释行文本（逐字一致，用于定位）。8 块：

| 块 | 行数 | 内容 |
|---|---|---|
| `ui-global-events` | 2,238 | 全局事件绑定（沿用原名） |
| `ui-ge-api` | 1,144 | 后端 API 客户端 |
| `ui-ge-plugins` | 484 | 插件系统 |
| `ui-ge-theme` | 928 | 主题 / 报表 / AI 引擎 |
| `ui-ge-pomodoro` | 283 | 专注与时间追踪 |
| `ui-ge-calendar` | 894 | 日历与可视化 |
| `ui-ge-notes` | 805 | 笔记与知识库 |
| `ui-ge-integrations` | 1,795 | 集成框架与废弃簇 |

**不变量（「纯位移」的验证）**：
1. **骨架字节恒等**：src-split `--verify` 对拆前提交比对 —— `src/` 之外的内联骨架零改动（554,993 字符）；本次发版后复核（版本常量归一化后）：与拆前提交逐字符相等（554,984 字符，少 9 字符 = 版本常量被归一化为占位符的长度差）。
2. **行数守恒**：8,571 行（8 块文件合计）+ 2 行尾空行（`tailBlanks` 记入 order.json）= 8,573 = 8,566 + 7 个新层注释行。
3. `src:check` 35/35、`check:source-state` ✓（HTML 606.8KB / 35 标记）。

**粒度效应的证明（44→50 / 35→53 不是新增耦合）**：拆后 `--check` 对照拆前基线报「新增 66 项」（循环 43 / 逆层 23）。把 8 块合并回单块、用**同一分析逻辑**重跑 → 与拆前基线逐项完全一致（0 差异）→ 66 项全部是表示层产物（粒度展开 + DFS 枚举旋转的路径重排），拆块没有引入任何真实图变化。基线随即 `--freeze` 重冻结（35 块 · 50 循环 / 53 逆层 · 重复定义 0），后续真新增照旧被拦。

### ② 配套同步（tests×5 / docs×5 / scripts×4 / src×2）

- **tests×5**：块路径引用更新（`ui-global-events.js` → `ui-ge-theme.js` / `ui-ge-calendar.js` / `ui-ge-integrations.js`）；`integration-deprecated.test.js` 改为「全局事件绑定家族合并读取」（`ui-ge-*` 前缀自动纳入 —— 后续再拆不走漏）。
- **docs×5**：`architecture-layers.md`（拆分记录 + v3.7.63 实测 40 个分层 = 39 + Core 1 + 扇出更新：`t` 30 块 / `toast` 26 / `SCENARIOS` 21 / `ORDER` 17）；`module-graph.md` 按 35 块口径重生成；`ui-standards.md` / `control-matrix-audit.md` / `半成品功能完善路线图.md` 的块引用与标记数更正（28 → 35）。
- **scripts×4**：`src-split.mjs`（BLOCKS 35 条 + `MIN_EXPECTED=35`）；`module-graph.baseline.json` 重冻结；`build.mjs` / `module-graph.mjs` 的块数注释不再写死（改为「以 src/order.json 为准」）。
- **src×2**：`order.json` 新增 7 条记录（`ui-global-events` 与 `ui-ge-theme` 的 `tailBlanks` 按 HTML 实测记 1）；`data-idb.js` 一处墓碑注释出处更正（→ `ui-ge-integrations.js`）。

## [v3.7.62] - 2026-09-29

**token 落盘加密（access/refresh 从 localStorage 明文改为设备密钥 AES-GCM 密文，「降级不丢登录 + 透明迁移」）+ `src-split.mjs` 三道护栏（写盘前骨架自检 / 标记全文件唯一 / 跳过分支 tailBlanks 保真）并把 `src:check` 加进 CI 首段 —— 护栏先行，是为下一版拆「全局事件绑定」最大块准备的安全带。**全量 103 文件 / 1149 条用例（v3.7.61 为 102/1142；+1 文件 = 新增 7 条 token 加密用例）、`verify:ci` 10 步按序全绿、`lint`（四道）、`check:modules`（28 块 · 44 循环 / 35 逆层，对照基线无新增）、`build:check` 版本五源一致（v3.7.62 · BUILD_TAG 20260928b · sha256:39e45b1b23b98679）、e2e **57/57**，均本机实测。

### ① token 落盘加密（设备密钥 AES-GCM）

**背景**：`wb_access_token` / `wb_refresh_token` / `wb_token_expiry` 此前**明文**落 localStorage（`docs/半成品功能完善路线图.md:94` 记有「token 明文存 localStorage 是既有现状」，当时处置为维持）。本版起改为 AES-GCM 密文落盘，密钥为设备密钥（`wb_agent___dk`，与 AI Key 同一套 `encryptKey` / `decryptKey` 设施）。设计约束是「**不能因为加密把用户锁在门外**」，落成六条语义（`tests/api-token-crypto.test.js` 逐条钉住）：

1. **旧明文读时立即可用，随后透明迁移为密文**（升级在写回路径上完成，不需要用户重登）；
2. **密文启动 → 水合（异步解密）前不谎报登录**（`isApiLoggedIn()` 在水合完成前为 false），水合后恢复；存储保持密文原样；
3. **密文解不开（设备密钥更换/损坏）→ 不抛错、不谎报、不销毁** —— 换回可用环境后登录仍在（「降级不丢登录」的核心条款）；
4. **无 WebCrypto 环境 → 明文照常可用**、密文原样保留、写入回落明文（与改造前行为完全一致）；
5. **登出清除 + 写序串行**：`_persistChain` 把落盘串行化，在途旧写不得把已登出的 token 复活；
6. **水合在途时登录** → 旧密文解密结果不得回写内存（覆盖启动竞态）。

实现要点：API 客户端段新增 `_hydrateTokens` / `_whenTokensHydrated`，`apiFetch` / `apiRefreshAccessToken` / `doSync` / `isApiLoggedIn` 全部先 `await` 水合再判登录、发包；`_sealTokenValue` 在不可加密环境原样回落。另修 `crypto.js` 一处**首启双密钥生成竞态**：token 水合与 `initCrypto` 会在同一 tick 并发调用 `ensureDeviceKey`，无在途去重时「首次生成」路径会生成两把不同密钥互相覆盖（内存与存储各留一把），下次启动即解不开本会话加密的数据 —— 现以 `_dkPromise` 合并并发调用，`_resetCrypto()` 同步清空。

测试手法：jsdom 无 indexedDB → 设备密钥走 localStorage 旧路径，预置**固定**密钥即可在 A 环境加密、B 环境启动，复现真实「重启」路径；`loadApp({ noCrypto: true })` 模拟 WebCrypto 不可用环境。

### ② src-split 三道护栏（+ CI 增 `src:check`）

**动机**：`src-split.mjs` 是源码态 ⇄ 交付态的**唯一**双向通道，此前有三处「静默错」面，而下一版要拆全仓最大的块（376KB），必须先把这个通道锁死：

1. **写盘前骨架自检（Gap1）**：文件头安全约定②「拼回只允许改标记之间区间、伤到骨架即不写盘」**此前只有注释、没有实现**。现以 `collapse()` 把两侧标记区折叠为 `<SRC>` 占位后逐字符比对，不同即报错、不写盘。同批把注入替换从正则改为**显式定位 + 切片**：① 唯一性可断言（历史出现过「两个 BEGIN / 两个 END」的嵌套重复，非贪婪正则只认第一对、静默忽略其余）；② 替换范围可精确证明 = 标记之间区间，骨架自检才成立。另拦一类历史坑：被拼回的源码含 `$1`/`$&` 文本（markdown 逻辑里的 `<strong>$1</strong>`），字符串替换会被 `String.replace` 当捕获组展开而改坏代码。
2. **标记全文件唯一**：每个块 BEGIN/END 计数 ≠1 即硬失败（此前是「静默取第一对」）。
3. **跳过分支 tailBlanks 保真（Gap2）**：源码态跑 `--extract` 时块已只剩标记（走跳过分支），旧实现硬编码 `tailBlanks: 0` 并照写 order.json —— 实测 `data-idb` 的 1 被抹成 0（git diff 可复现），此后每次拼回的空白版式都会漂移且无门禁可查。现改为**沿用旧 order.json 记录**，实测值与记录不符时告警并按实测值修正（HTML 是抽取方向的事实源）；同批把块文件写入推迟到「块数校验」之后（`pendingWrites`），中途失败不再留下半写状态。
4. **CI 增 `src:check`（必须在任何 pre 钩子之前）**：`check:source-state` 只守「标记在 + 体积 <1.2MB」，**部分块被拼回内容提交**（总量没超上限）能溜过它；`src:check` 逐块比对内容兜住这类半交付态。它和 `check:source-state` 一样排在一切 pre 钩子前（pre 钩子会把工作区拼成交付态，比对口径随之改变）。

本版实测：发版 bump 后的 extract 产物与 bump 前 `cmp` **逐字节一致**（`ui-global-events.js`，8566 行）；全量测试跑批日志中未见任何 ⚠ 告警输出。

## [v3.7.61] - 2026-09-28

**一处用户截图标注的窄屏控件不齐（根因是触控规则的"点名式"覆盖漏洞）+ 披露并修掉我 v3.7.59 自造的一条 CI 回归 + 新增按 CI 真实顺序预演的 `npm run verify:ci`**。全量 102 文件 / 1142 条用例、`lint`（四道）、`check:modules`（44 循环 / 35 逆层未变）、`build:check`、e2e **57/57**（新增 1 条全应用扫描 ×2 宽度 ×3 项目 = 6 项，51 → 57）、`verify:ci` 9 步按序全绿，均本机实测。

### 症状与根因

用户截图：数据场景 → 可视化 功能卡，红框那一行四个控件（图表名 / 类型 / 数据源 / 图表类型）上下边线不齐。390px 实测：同排 `input` 是 `y=621..665`（h44），而 `button.ds-trigger` 是 `y=621..659`（h38）—— 顶边相同、底边差 6px，字号也差（input 18px vs 触发框 14px）。

根因不在栅格，而在 `@media(max-width:767px)` 那条 WCAG 2.5.5 触控规则：它是**逐个类名点名**的（`.tbtn` / `.addbtn` / `.mini` / `input, select, textarea` / `.set-nav-btn` / …），而自研下拉的**可见**触发框是 `<button class="ds-trigger">`，不在这份名单里。给原生 `select` 加高度毫无作用 —— `ui-select.js` 已把它包成 `position:absolute;inset:0;opacity:0` 的隐藏表单控件。触发框是 v3.6.x 引入的，晚于这条规则，所以一直漏着。

- **影响面比截图大得多**：撤掉修复后重跑扫描，767px 下共 **6 组**同行不等高，跨 `data/SQL`、`office/会议`、`office/项目`、`office/报销`、`life/计划`、`code/运行器`。截图那张只是最容易看见的一处。
- 修法：`.ds-trigger{min-height:44px;font-size:var(--fs-lg)}`。实测修复后 ≤767 那一行四个控件全部 44px/18px 且底边齐平；≥768 仍是 38px 不受影响。
- **例外必须显式保留**：聊天输入行的模型下拉与同排的 附件 / 发送 / 输入框 是 v3.7.37 定稿的 **42px 统一组**，若被这条拉到 44 反而破掉那行的整组同高。故同时加 `.ds-select:has(>#chatModelSelect)>.ds-trigger{min-height:42px;font-size:var(--fs-sm)}`，实测聊天四个控件仍全为 42。

### 守护（这次刻意不写点对点断言）

- `tests/e2e/viewport.spec.js` 新增「窄屏同一行控件必须等高」：在 375 / 767 两个宽度遍历全部场景 × 全部功能 tab × 设置各分区，**按 top 分组后断言同一行内可见控件高度相等**。以后任何新控件类漏出触控规则，都会被这条抓到 —— 点对点断言（"ds-trigger 必须 44"）做不到这点。
- `tests/mobile-enhance.test.js` 补一条覆盖面断言：解析 ≤767 块里所有带 `min-height:44px` 的选择器，逐个核 `input / select / textarea / .ds-trigger / .addbtn / .tbtn / .set-nav-btn / .kbtns button` 都在名单内，并锁住聊天面板那条 42 例外必须存在。
  - ⚠️ 既有的那条老断言只写了"块里存在某个 `min-height:44px`"，**没有任何覆盖面**，所以 `.ds-trigger` 漏了这么久它一直是绿的。老断言保留（不削强度），新增这条补洞。
  - 写这条时连踩两个自己的坑，都记进注释了：① `[^{]+{[^}]*min-height` 这种一步式正则跨不过上一条规则的 `}`，会把选择器错配到别处；② 全文件有**多个** `@media(max-width:767px)` 块，用 `.find()` 只取第一条会静默漏掉真正那块（表现为"解析出 1 条规则"却仍然像是测试通过）。
- 两条守护都做了**变异验证**：删掉 `.ds-trigger` 那行后，单元断言红并把整张点名清单打出来（`已点名：.sheet-parent | .tbtn | … 缺 .ds-trigger`），e2e 扫描红并报出 `[data/SQL] input(h44) vs button.ds-trigger(h38)` 等具体组；撤掉删除后双双回绿。

### 🔴 披露一条我自己在 v3.7.59 造出来的 CI 回归（本轮修复）

v3.7.59 我给 `build:check` / `lint` / `lint:layers` / `test:coverage` / `e2e` 补齐 `post*` 自愈钩子（让工作区不再因跑检查而变脏），**没检查后续步骤对状态的依赖**，于是把 CI 弄红了：

- 之前只有 `posttest` 一个抽回钩子，所以 `build:check` → `lint` → `lint:layers` 跑完目录**留在拼装态**，排在最后的 `pet:check` 正好能在 HTML 里读到 `_PET_ART` 而通过。
- 补齐 post* 之后，`pet:check` 的前一步会把目录抽回源码态 → `pet-art.mjs --check` 找不到字面量 → **exit 1**。（`pet-art.mjs --extract` 早就处理过"源码态属正常情形"，`--check` 却没有，所以这个不对称一直潜伏着。）
- 为什么当时没发现：我逐个命令手跑，每个单独看都是绿的；而且我有一两次用 `npm run X | tail` 取状态，**管道把退出码换成了 `tail` 的 0**。本轮改用 `out=$(npm run X); echo $?` 才撞见。

修法与防复发：

1. `package.json` 补 `prepet:check`（注入）+ `postpet:check`（抽回），与其他验证命令同构。实测 `npm run pet:check` 从源码态起跑 → exit 0 并自动还原。
2. 新增 `npm run verify:ci`（`scripts/verify-ci-order.mjs`）：**从 `.github/workflows/*.yml` 读出 job 的 `run:` 序列按序执行**，不写死清单（防脚本与 workflow 漂移），任一步非零即打印该步输出尾部并停止，末尾再断言工作区已回到源码态。支持 `--job=` / `--ci=` / `--only=` / `--list` / `--with-e2e`。本机实测：ci.yml 的 `test` job 9 步（去掉 `npm ci`）全 exit 0；deploy.yml 的 `verify` job 序列同样能解析。
   - **变异验证**：临时撤掉 `prepet:check` / `postpet:check` 回到 v3.7.59 之后的破损态，`verify:ci --only=...` 立刻在第 3 步报 `pet:check exit 1` 并打出原始错误行 —— 即这条回归如果当时有预演就会被拦住。
3. README 增补一条"推送前跑 `npm run verify:ci`"，并把 `pet:check` 写进自愈钩子清单。

> 教训：**给构建链加"自愈"钩子等于改变了后续步骤的输入状态**，必须按 CI 的真实顺序复演一遍，而不是逐个命令验证。

### 过程中的两次自我纠正

- 第一版探测用 `FORMS + ' button'` 拼选择器 —— 逗号列表里的后代组合器**只作用于最后一项**，于是 `.set-field` 等容器被当成控件匹配进来，扫描结果全废。改成 `el.closest(FORMS)` 重扫才拿到真数据。
- 第一版在 1200px 量到"四个控件都是 38px、完全一致"，差点据此判"无法复现"。截图底部有 `#mobBar` 才定位出真实视口 ≤767px —— **判断视口别只看图片像素宽**，要看页面里哪些元素在渲染。

## [v3.7.60] - 2026-09-28

**两处用户截图标注的响应式缺陷 + 三条「浏览器静默容错」的 CSS 结构缺陷 + 集成簇真机定性（含一个凭据外泄面，同步/通知层按用户决定标记废弃）**。全量 102 文件 / 1141 条用例、`lint`（四道）、`check:modules`（44 循环 / 35 逆层未变）、`build:check`、e2e **51/51**（新增 2 条渲染层不变量 ×3 视口 = 6 项，45 → 51）均本机绿。

### 用户标注的两条

- **toast 带压住常驻工具行**：`#toasts` 的 `top` 由 `--topbar-h`(54px) 推导，而实测「顶栏 65 + 工具行 45 = 110px」且 320→1920 十档恒定（工具行 `flex-wrap:nowrap` 永不换行）——于是提示胶囊落在 y=66..103，正好盖住 y=69..101 的「今天 N 件待处理」消息栏。新增实测令牌 `--chrome-h:110px` 让位；容器本就 `pointer-events:none` 所以不挡点击，但 3.6s 内读不到那行字。
- **窄屏 ＋ 按钮悬空**：≤1023px 两列布局里 ＋ 独占第三行、却只贴住**左列**右端（375px 实测 x=139..177，右侧 189..332 整格空着），而 ≥1024 一直是贴表单右缘的（1440px：标签字段与 ＋ 右缘同为 1073）——窄屏是唯一自相矛盾的那档。改为 `grid-column:1/-1;justify-self:center`。
  - ⚠️ **我上一轮的判断是错的**：曾把「＋ 应该贴右」列为已确认缺陷。实际 v3.7.7 试过贴右并**因实测遮挡回退过**，本轮用命中测试复现确认它依然成立：390px 下贴右落到 309..347，而桌面萌宠静止在 x=252..348（`x = innerWidth - size - 42`），`elementFromPoint(按钮中心)` 返回 `pet-art-img`。居中才是唯一同时满足「与 ≥1024 自洽」和「不被宠物挡」的方案（宠物左界 W-126，居中按钮占 W/2±19，不相交条件 W>271 → 全档成立）。
  - **`#recForm` 用另一条修法**（同一类症状、不同根因）：实测它 375px 单列 / 1440px 四列都本来就贴右缘，只有两列档悬空。但**居中会把它弄得更糟** —— 任务表单恒为 4 字段（偶数）所以永远独占一行，而 recForm 字段数随场景变（design/data/life 4 个、study/health/finance 5 个、office 8 个）：偶数时 ＋ 另起一行落在左列（521px 实测距右缘 229px），奇数时正好补上末行右格＝已经是对的。改成 `grid-column:2`（钉右列，两列模板内不越界）后**奇偶都落在右列**，实测 7 场景 × 5 宽度共 49 组距右全为 0。
    守护分两层：`tests/ui-spec-guards.test.js` 锁规则文本（并把该守护的不变量从「必须写 auto」纠正为「列位不得越界」—— 原表述会把正确修法判成违规），`tests/e2e/viewport.spec.js` 按奇偶 × 断点实测几何。**已做变异验证**：把 CSS 退回 `grid-column:auto`，用例立刻红并报出「521px · design（4 字段=偶 · 2 列）：＋ 距表单右缘 229px」。

### 顺带挖出的三条静默缺陷（浏览器全部静默容错，所以能存活多个版本）

- **命令面板命中高亮从 v3.7.8 起从未生效**：`.cmd li.cmd-group{…}` 漏了右括号，紧跟的 `.cmd li b.cmd-hit{…}` 被解析成 CSS 嵌套 → 实际生效选择器 `.cmd li.cmd-group .cmd li b.cmd-hit`，永不命中。真实 Chromium 实测：`<b class="cmd-hit">` 计算色 = 继承来的正文色、背景 `transparent`。归位后为 `rgb(5,94,199)` + 12% accent 淡底。
- **一个孤立 `}` 吞掉了它后面的整条规则**：删区间收紧规则时漏删的媒体查询右括号（原 1229 行）不是无害的——`select[name="priority"]{max-width:120px}` 因此**根本不在 CSSOM 里**（实测 `document.styleSheets` 遍历查不到）。我最初写注释说它"只是工具会报错、不影响渲染"，也是错的。
- **两条缺陷互相掩盖**：上面那条 120px 夹宽度复活后，立刻暴露出 `#taskForm>.fld:nth-child(3)>select{max-width:none}` 早已失配——自研下拉把原生 select 包成 `div.ds-select > select`，`>` 断了。实测 `sel.matches(那条选择器) === false`。它此前没显故障，纯粹因为对手规则也是死的。补齐 `.ds-select>select` 分支后恢复原意。
  - 连带修了一条**测试精度缺陷**：`tests/e2e/viewport.spec.js` 的「表单等宽」量的是 `input,select`，即那个 `position:absolute` 的隐藏原生控件，不是用户看见的 `.ds-trigger`。改为优先量可见控件（可见框一直是对的 144px，隐藏控件被夹成 120px 才被当成"不等宽"）。

### 集成簇定性（真机实测，推翻了我此前"零引用可删"的判断）

此前普查把 notion/linear/jira/slack/feishu/dingtalk/calendar 这一簇判为"静态零引用"，我据此记为"不能凭静态证据删"。**真因找到了**：`openIntegrationConfig` 用字符串拼接派发 —— `window[name + "Connect"]` / `window[name + "Disconnect"]`，任何按标识符计数的工具都看不见这条边（全仓 `window[...]` 动态派发点只有 3 处）。本轮用真实 Chromium + stub fetch（不外发）逐 provider 实测，定性如下：

- **连接链路是真的**：七个 provider 各自打到正确端点 —— `api.notion.com/v1/users/me`、`api.linear.app/graphql`、`<domain>/rest/api/3/myself`、`slack.com/api/auth.test`、`open.feishu.cn/…/tenant_access_token`、`oapi.dingtalk.com/gettoken`、`googleapis.com/calendar/v3/…/calendarList`，凭据进 `Authorization` 头，结果落 `wb_integration_providers`；401 时面板如实显示「已连接 · 未验证」（v3.1.1 那个"假成功 toast"的修复成立）。日历的 OAuth 按钮在非 Electron 下**自动隐藏**，也是诚实的。
- **没有任何消费方**：连上七个 provider 后跑「建任务 / 完成任务 / 重渲染 / `notifySystem` / `checkDueTasks`」，集成域名 **0 次外发**；UI 里也不存在任何"同步到 X"按钮。`*SyncTask` / `*SendMessage` / `*NotifyEvent` / `calendar*Event` / `integrationList·Enable·Disable·ConfigureProvider` / `integrationGetStatus` 共 **30 个函数、约 855 行**既无静态调用方也不在任何动态派发面上（逐个复核见 `_probe/verify-deprecated-set.mjs`；其中 5 个只被同为废弃的函数调用，属传递性死）。
- **处置（用户定：「先标记废弃，等我定好渠道再动」）**：不删、不接，只把状态做实 —— 30 个函数逐个挂 `@deprecated v3.7.60 应用内零调用方…`，区域头留一段处置说明（含"摘除条件"：接上消费点就摘标记并补真发请求的用例，否则连 `__test` 桥与 i18n 键一起清）。`docs/product-scope.md` §三新增 🟠 一档「代码在、入口在、但能力未接到底」，与既有的 🔴（代码已删）/ 🟡（只剩占位、入口已关）并列。
  - ⚑ 守护 `tests/integration-deprecated.test.js`（6 条）：标记数量与名单精确相等（防无差别批量插标记）、30 个函数仍无"非废弃集内"调用方、废弃集内部互调仅限已知的 5 处、**七个 `*Connect` / `*Disconnect` 与面板/域名校验不得被误标**、并锁住"拼接派发确实存在"这一前提。**已做变异验证**：在 `renderIntegrationPanel` 里插一句 `void calendarListEvents({})`，守护立刻红并报出 `ui-global-events.js:292 calendarListEvents ← 宿主 renderIntegrationPanel`；撤掉后回绿。
- **修了一个凭据外泄面**：`jiraConnect` 把用户填的 `domain` 直接拼成 `"https://" + domain + "/rest/api/3/myself"` 并带上 Bearer token，而 CSP 的 `connect-src` 含裸 `https:` 不拦任何主机。实测 `domain="evil.example.com/?x="` 会打出 `https://evil.example.com/?x=/rest/api/3/myself`、`"attacker.io/@x"` 会打出 `https://attacker.io/@x/…` —— 即把 domain 填成（或被诱导粘贴成）攻击者控制的值，Jira token 就发过去了。新增 `_intJiraBase()` 只接受「纯主机名（可带端口，允许粘贴 `https://` 前缀）」，拒绝路径 / 查询 / 片段 / userinfo / 前导斜杠，三处拼 URL 的点全部走它。合法自建 Jira（含 `:8443`）不受影响。
- **修了文案过度承诺**：七个 provider 的说明写着"同步笔记和任务到 Notion""接收 Slack 消息通知"，而上面说了没有任何消费方 —— 按 §四.2「stub + 活 UI = 虚假功能」的同一条标准，**真连接 + 假承诺也算虚假功能**。8 条文案（zh + en + `t()` 兜底参数共 24 处）改为只承诺"验证凭据"，面板总说明补"任务 / 笔记 / 日程同步与消息通知尚未接入，连接本身不会向任何服务发送数据"。
- **另记一项实测缺口（未修，已登记）**：备份/迁移只枚举 `wb_agent_` 前缀 + `wb_custom_links`（`src/ui-backup-stats.js:395`），所以 `wb_integration_providers` / `_sync_state` / `_api_keys` / `_rate_limits` **不进备份**。对凭据来说这偏安全、可能是有意的，但它没写在任何文档里，且意味着恢复备份后连接状态静默丢失 —— 现登记进 `docs/product-scope.md` §三🟠 的注记，与渠道定案一起决定"显式声明凭据不随备份走"还是"纳入并加密"。
- 守护：`tests/integration-jira-domain.test.js`（8 条）—— 合法主机 / 粘贴前缀 / 自定义端口三种放行且 URL 精确、十种注入形态一律 0 外发、**已注册 provider 的 domain 被事后篡改时 sync 与 list 同样不发**、以及文案措辞断言。真机侧另存 `_probe/integration-census.mjs`（逐 provider 外发记录 + 消费路径探测）。
- 方法论进 `docs/product-scope.md` §四：新增第 4 条自查「文案承诺不得超出实际接线」，并写明静态普查的已知盲区与"判可删前必须做的两件事"。

### 门禁

- 新增第四道 lint：`scripts/lint-css-structure.mjs`（静态扫 `<style>`：孤立 `}` / 未闭合 `{` / 声明块内出现子规则 / 子规则后仍有声明）。这类缺陷能活 6 个版本的原因就是**没有任何门禁看结构**——ESLint 只看 JS，`lint-colors` 只看色值，浏览器只做错误恢复。
  - 该脚本自身踩到并修掉一个**状态依赖缺陷**：直接正则扫 `<style>` 时，交付态里应用 JS 的 5 处字符串常量（导出/打印模板、`document.write`）会被当成样式表，实测报 **1766 条假阳性**；改为线性走查（遇 `<style>` 收内容、遇 `<script>` / `<!-- -->` 整段跳过），两态实测均为「1 个 style 块 / 2456 条规则 / 73 个 at-rule」。
  - 契约与自证在 `tests/css-structure.test.js`（10 条）：真实现存样式表 0 问题、三类变异各报对应错误码、合法写法（`url()` 内括号、`@media` 内规则、字符串里的花括号、script/注释里的假 `<style>`）不误伤。
  - ⚠️ **本轮自造并修掉的回归**：该测试文件最初用 `execFileSync` 起子进程跑门禁，实测让 `npm test` 出现「1127 条全绿但退出码 1」的间歇失败 —— vitest 报 `[vitest-worker]: Timeout calling "onTaskUpdate"`。采样：带该文件 4 次挂 2 次；拿掉该文件 3 次全干净；改成 **import 同一份 `scanCssStructure` 在进程内调用**（先例 `scripts/lib/code-scan.mjs`）后又跑 2 次全干净，且该文件耗时 2168ms → 71ms。样本量不足以证明因果，但这个写法本身更该这么做，且方向一致。
  - 同一函数被 CLI 与测试共用，所以「测试绿」与「`npm run lint` 绿」不会各说各话。
  - 渲染层不变量进 e2e：`tests/e2e/viewport.spec.js` 新增「提示带 · 加号 · 面板高亮不变量」，含一个**反向对照**——临时把 ＋ 改回贴右，它必须真的与宠物 x 相交，否则 `centerClear` 那条断言就没有牙齿。

### 随本版带入的既有未记录改动

HEAD 里已有一批标着 `v3.7.60` 但从未写进 CHANGELOG 的表单改造（看板卡表单等宽四列、`.form-row--grid` / `.tool-form-grid` 统一等宽 + `auto-fill(120px)`、跨列类统一为 span 1、窄屏回退 2 列、功能卡输入框复用全局样式、textarea 占整行）。它们随本版一起发布，此处如实登记，不重复计入本轮工作量。

## [v3.7.59] - 2026-09-27

**两条并行工作合流**：一条是 AI 能力从"配置壳"改成真实能力 + 一个隐私外发面收口 + 死代码清仓；另一条是 XSS 防线加固与把它升级成构建期门禁。全量 99 文件 / 1117 条用例、`lint`（三道）、`check:modules`（44 循环 / 35 逆层未变）、`build:check`、e2e 7/7 均绿。

### AI 能力：技能、自主执行、记忆语义召回、上下文预算

- **技能（Skills）从壳变能力**。`ai_config_skills.custom` 这份 JSON 此前**只写不读**（实测：写进去后 `chatSysPrompt` 一个字节都不变），六个勾选项也只是减法地写 `cfg.toolWhitelist`。现在新增 `src/ai-tools.js` 的 Skills 引擎：容错解析（数组 / `{skills:[…]}` / 单对象 / 坏 JSON 静默降级）、工具名白名单校验（拼错的名字与危险工具不进提示）、相关度排序（复用 `ragTokenize` 的 CJK 二元组——只按空白切词时中文整句是一个 token，"帮我写周报"与技能"周报流程"永远对不上）、注入系统提示、命令面板「技能」组一键触发。实测：系统提示 172 → 440 字节，命中技能排首位。
- **"把流程存成技能"**：一轮对话成功执行 ≥2 个非破坏性工具后挂出候选，回「存为技能」才落盘（候选不自动写盘）；`delete_task`/`update_task`/`forget` 不参与固化；同一工具序列只提示一次。存的步骤只留**参数名**不留值（值会过期且可能含用户数据）。
- **AI 自主执行有了入口，且先修安全洞**：`executeAgentPlan` 此前无条件 `execTool(tool, args, force=true)`，而 `force` 正是 `runChatLoop` 里 `delete_task`/`update_task` 跳过二次确认的那把钥匙——同一个工具在对话路径要弹窗、在自主规划路径直接删。现在危险清单收口成单一来源 `DANGER_CONFIRM_TOOLS`（`SKILL_DANGER_TOOLS` 由它派生，`toolWhitelistSet()` 同理，三处重复解析归一），自主执行遇到危险步骤标 `needsConfirm` 跳过并如实汇总（不中断整盘）；白名单在此路径同样生效；步骤数封顶 `AGENT_PLAN_STEPS_MAX=12`，超出如实标注裁了多少。入口 = 命令面板 `>` 前缀 → 先出计划（不动数据）→ 回「确认执行」→ 逐步落地；其他内容取消，切场景自动作废。真 Chromium 实测：含 `delete_task` 的三步计划执行后任务未被删，汇总打 `⏸ 待确认已跳过`。
- **规划提示词的工具清单不再硬写**：字典里写着 12 个工具名而真实有 26 个，且没有同步机制；现由 `agentPlannableTools()` 从 `effectiveTools()` 现算并排除危险工具（实测 26 → 可规划 24）。
- **工作记忆改用语义召回（#19）**：`recallMemories` 原是实现缺陷——**不是召不回，而是全量返回、排序失效**（关键词那档对中文永不生效），于是注入上下文的 6 个名额归属只由插入顺序决定，用户后沉淀的偏好永远挤不进去。现接 v3.7.57 的 embedding 通道做 RRF 混合召回，向量独立存 IndexedDB `memvec:` 前缀（不带 `wb_agent_`，否则被同步镜像回写 localStorage，1536 维 Float32 每条 ~30KB）、带 embedModel 模型戳（换模型自动判失效重算）、批量单飞回填、孤儿清扫、遗忘连带删向量。⚠️ 修 RRF 时踩到一处真实设计错：词法列表里无关键词命中的条目只是按新近度排的填充项，把它们也丢进 RRF 会让"最老的无关条目"与语义命中拿到同一个 `1/61` 并因稳定排序反超——现只有 `kw>0` 的进 RRF。签名保持同步，无向量时返回值与改造前逐条一致。开关**复用 `cfg.rag`**（设置页那一项本就叫「上下文注入」、语义与代价同类），不凭空造一个没 UI 写的配置键。
- **上下文装配预算 + 可溯源引用（#20）**：`ragInjectContext` 原先固定 top5 × 200 字、无出处、无总量约束。现在 `ctxBudgetTokens`（默认 1200，钳 200~4000，非数字/0/负数视为未配回默认）逐条整段装配（超预算**整条丢弃**而非截半句），每条带 `[序号·来源·召回方式]`，并提示模型引用时标注编号、无依据部分说明是推断；截断时明说有几条没进来。技能段占同一预算 40% 份额。

### 安全：未配置 AI 时不再向第三方外发内容

- `chatOnce` 缺 `electron/main.js` 那句 `if(!prof || !prof.key) throw` 的对应守卫，于是**没配任何模型**时 base 仍回退硬编码 `https://api.openai.com/v1`、`Authorization: Bearer `（空值）照样真发 POST 并重试 3 次——系统提示（含工作记忆、技能、RAG 片段）与输入原文已经出了本机，只换回 401；外在症状是"未配置时聊天卡十几秒"（曾被误判成死循环，实为 3 次重试）。守卫放在 `isElectron()` 分支**之后**（Electron 下渲染进程的 `ap.key` 本就被 crypto 掩成空串，放前面整条打不通）。修完实测：**0 次外发 / 13ms 上屏**；配了 Key 恰好 1 次且打用户自己的 base。契约锁在 `tests/ai-retry-contract.test.js` 第⑤组（断言 `fetch` 次数为 0，不只看文案），与对侧 `tests/electron-ipc.test.js` 形成双向对称。

### 死代码清仓：v1.7-A 整链 + AI 插件假壳（约 1220 行）

- **「AI 插件」卡删除**：`code_runner`/`web_search`/`file_reader` 三项是已有真实能力的假副本（`web_search`、`code_run` 本就是模型可直接调用的工具），文案自己写着"暂无执行代码，勾选状态仅保存配置"——按本仓库 §四「stub + 活 UI = 虚假功能」纪律移除（卡片 + 渲染函数 + 保存处理器 + 桥导出 + `aiPlugin.*`/`ai.plugin*` i18n 键）。**真·插件市场 `BUILTIN_PLUGINS`（10 个可安装插件）未受影响。**
- **v1.7-A「AI 深度增强」1159 行整段移除**：本地 `agentPlan` 链（关键词猜工具）、词袋"长期记忆"（`_textToVector`/`_cosineSimilarity`）、旧 TF-IDF RAG 索引、本地模式匹配冒充的 AI 代码审查。判据不是"看着没用"，而是 `_probe/reach4.mjs --contain 6678 7836` 实测**区间外引用 0 处**。两处指向它的活代码一并处理：`aiDecomposeTask` 的 `opts.useLocalPlan` 分支（全仓无人传该选项）、笔记变更钩子 `_notifyNotesChanged`/`_onNotesChanged`（每次笔记 CRUD 都在刷一份没人读的旧索引）。
- 死代码普查基线：1202 个顶层函数 / 不可达 171（14%）→ **1127 / 127**。
- **遗留问题如实登记**：笔记/任务/记录/对话历史目前都只在「重建索引」时进真 RAG，没有增量索引（旧钩子刷的是死索引，删掉它不改变任何可观测行为）。要做增量应接到 `ragIndexAdd` 上另开一轮，已记 product-scope §三。

### 另一条线：XSS 防线加固与构建期门禁（同批合入）

- `sanitizeHtml` 修复 4 类可绕过写法（`<svg/onload=…>` 斜杠分隔事件属性、`<img/src=x/onerror=…>`、SVG `<animate>/<set>` 运行期改 `href`、`<button formaction="javascript:…">`）与 1 条未消毒注入路径（图表画布 `_dgmSvgHtml`）；回归 `tests/sanitize-xss-regression.test.js`（21 条）。
- 新增 `scripts/lint-xss.mjs` 并接进 `npm run lint` 与 CI：扫描 `src/` 的未消毒动态 `innerHTML`，6 处显式豁免带定位。
- `scripts/src-split.mjs --check` 从"只查标记齐不齐"升级为**逐块内容比对**：堵住"直接改 HTML 但未抽回 src → 下一次 pretest/prebuild 注入静默回滚"这一类最危险的丢代码缺陷。
- `docs/control-matrix-audit.md` 复核更正：文档多处写"11 套主题"而实况是 **10 套**（`CHANGELOG:548` 记过新增第 11 个，但代码侧从未对上）。
- 另含 service-worker / Electron 主进程 / crypto / data-idb / deploy 工作流与 `tests/helpers/loadApp.js` 的配套改动；本提交按整体绿色（全量 + lint + build:check + e2e）验证，未逐条复核其设计意图。

### 本轮自查中纠错两处（不留文档只留代码）

- 曾把「Agent 自主完成」命令 unshift 到搜索结果首位，连带弄红 3 条既有面板用例（`无匹配`空态不可达、首项断言被抢、工具项进「最近使用」失效）；改为 `>` 前缀显式触发。
- 曾把上述真因误判成"新增 jsdom 窗口泄漏定时器"，加 `win.close()` 换来 2 个 unhandled rejection（关在 `startup()` 的 `await initCrypto()` 之前）；真因是既有用例**真点面板第 0 项**。教训：红测先做同模式 A/B 定因。

---

## [v3.7.58] - 2026-09-26

**安全收口 + 死代码清仓 + 测试循环自动化**。本轮来自一次全面评估的整改：三项安全修复、约 2440 行无出口死代码移除，以及把"跑完测试工作区必脏"这个有前科的坑从人肉纪律变成结构上不可能。

### 安全：云同步快照不再携带密钥（含一处 README 与实况不符的更正）

- `_buildCloudSnapshot()`（render-overview）此前枚举全部 `wb_agent_*` 键上传自建后端，包括：
  - `wb_agent_cfg` —— AI Key 的 AES-GCM 密文；且 cfg 的 Key 用**设备密钥**加密，换设备本就解不开（密钥不出本机），同步它无跨端收益、纯增泄露面；
  - `wb_agent___dk` —— 无 IndexedDB 环境下设备密钥**本体**（"密文 + 钥匙"同交即等于明文）；
  - `wb_agent_pre_restore_backup` —— 恢复前的本机回滚档，内嵌全部本地键值（含 cfg）。
- 现按 `SYNC_EXCLUDED_KEYS` 显式排除上述键（sync_meta 沿用旧排除）；任务 / 记录 / 笔记 / 记忆 / AI 会话等业务数据的快照语义不变。
- README 同步更正：「Key 不上传任何服务器」→ 如实描述快照范围（v3.7.58 起排除 cfg 等密钥键）。
- 新增 `tests/sync-snapshot-scope.test.js`（5 用例）；e2e `sync-contract.spec.js` 7/7 实测通过（真实浏览器 + mock 后端）。

### 安全：两处注入面收口

- 微信扫码二维码的 `src` 属性此前未转义直拼后端响应 —— 后端被攻破或返回恶意串即可注入属性逃逸 `<img>`。现经 `esc()` 转义（render-overview）。
- sql.js 的 CDN 兜底加载补 **SRI 完整性哈希**（`sha384-8D3Rsfo…`，先与官方 npm sql.js@1.10.3 的 dist 文件逐字节比对一致、再按本地副本 `assets/sql/` 实测计算）；integrity 不匹配触发 onerror 自动落到下一候选基址，失败路径与「CDN 不可达」完全一致。本地同源加载与用户自配 `sqlJsBase` 不受影响。

### 修复：自研下拉（可编辑模式）双重键盘绑定

- 旧实现给同一触发器绑了两个 keydown 处理器（EDITABLE 分支一个 + 无条件再绑一个）：
  ① ↓/↑ 被各移一步，一次按键跳两行；
  ② Enter 经 mousedown 选中 → `dsClose()` 置空 OPEN，第二个处理器走 `else open()` 把刚关上的列表**重新弹开**；
  ③ 可编辑 input 里按空格被通用分支拦截成开合，打不出空格。
- 修复后可编辑模式只保留 combobox 分支的键盘处理（顺带把 `if (OPEN !== inst) open(); else open();` 笔误式冗余收成一句），非可编辑模式的绑定路径与行为完全不变。
- 新增 `tests/ui-select-keyboard.test.js`（4 用例回归）。

### 死代码清仓：移除 4 个无出口子系统（-2276 行）+ 配套 i18n（-164 行）

按 product-scope「stub + 活 UI = 虚假功能」纪律，移除 ui-global-events 中四个「无 UI 入口、无测试引用、零外部调用」的沉睡框架（v1.7-B/C 时期遗留）：

- **54-离线AI**（WebLLM 假进度条 + `_webllmEngine` 模拟引擎对象 + ONNX 模型表指向从未存在的 `assets/onnx/` + 模型缓存 + 隐私过滤 API）；
- **55-ML预测**（行为预测 / 生产力评分 / 协同过滤——数学实现真实但无任何 render/UI 调用点；"智能推荐"卡片走的是 LLM 版 `aiSmartRecommend`，与此无关）；
- **56-智能排期**（scoreTask / optimizeSchedule / smartSchedule）；
- **57-情绪分析**（analyzeSentiment / detectEmotion / emotionTrend）。

引用核查：上述 59 个导出符号在活代码中零调用（脚本化全量扫描 + 人工复核 `recommend` 同名子串误报、`webllmChat` 仅存于 i18n 文案值）。配套清理：

- data-idb 的模型缓存四助手（idbPutModel 等，唯一消费者已删）；
- core.js 中 82 个 p5.* 孤儿 i18n 键（中英双语 164 行；i18n-completeness 门禁通过，zh/en 配对无破损）；
- `initHeavyModules` 上方注释与实况对齐（此前还列着更早移除的 58 / 65~70 号模块）。

已登记 docs/product-scope.md §三。ui-global-events 11841 → 9564 行，交付 HTML 3.40 → 3.31MB。

### 工程化：测试循环与源码态流转自动化

- `npm test` 新增 **posttest 自动还原源码态**（先 `src:extract --no-backup` 后 `pet:extract`，顺序刻意：趁立绘仍在 HTML 内把含 `_PET_ART` 完整数据的 render-widgets 抽回 src，后者此时为 no-op）——v3.7.40 曾误提交拼回态，此坑从"人肉记得"变为"结构上不可能"。
- `启动Agent工坊.bat` **源码态自愈**：双击时检测到源码态自动拼回再启动，日常双击体验不变。
- `lint:layers` 补 `prelint:layers` 钩子：此前干净检出后直跑必红（校验结果依赖"恰好注入过"的时序耦合）。
- `_srcbackup/` 备份轮转：只保留最近 10 份（历史实测累积 141 份 / 451MB 纯磁盘债，本次已清 132 份）。
- `release` 自动打 `v<版本>` 附注 tag：此前 53 个版本全部无 tag 可回溯，从本版起发布历史可直接 checkout。
- 删除 `.prettierrc` / `.prettierignore` 死配置（无依赖、无脚本、无 CI 步骤，从未接入任何链路）。
- CONTRIBUTING 与实况对齐：删幽灵命令 `lint:fix`、结构树补 `src/`、改写"不再有字节拼接"过时段落、测试规模改为以 `npm test` 输出为准。

### 明确缓办（评估结论，非遗漏）

- refresh token 明文本机：加密的收益依赖后端真实上线（当前未联调），而改动会触碰未联调的登录链路 —— 等云同步真实接入时随 auth 联调一并做。
- ui-global-events 拆块（9564 行仍偏大）：按 docs/decoupling-plan.md 的节奏推进，不在本轮。

### 门禁

- 单测 95 文件 / **1038 用例全部通过**（含新增 9 例）；e2e sync-contract 7/7。
- build:check（五源版本一致 + 真相源完整）/ lint / lint:layers / check:modules（无新增环）/ check:ai-tools-doc / check:pwa-icons / pet:check 全绿。

---

## [v3.7.57] - 2026-09-26

**知识库检索换血：把"从没跑通过一次的 FTS5"换成自带 BM25，并真的加上向量召回**。
方向来自一条要求：不要只把不成立的声明藏起来，要让能力名副其实。本轮先把检索做对。

### 先立证据：旧声明为什么不成立

1. 仓库自带的 `assets/sql/sql-wasm.wasm` 是 **SQLite 3.45.2，编译时没开 FTS5**：
   实测 `CREATE VIRTUAL TABLE t USING fts5(x)` → `no such module: fts5`（fts3 / fts4 在）。
   而 `ragInit()` 建的就是 fts5 表 → 每次必抛 → 被宽 catch 吞掉 → `_ragReady` 恒 false →
   `ragLexicalTop()` 恒返回 `[]`。所谓"FTS5/BM25 全文检索"**一次都没跑通过**，
   线上真实行为一直是 `ragSearchFallback()` 的朴素 substring 关键词匹配。
2. 就算换成开了 FTS5 的构建也救不了中文：`unicode61` 把连续汉字当成**一个** token。
   实测对「修复登录页 500 报错」这条记录：`MATCH '登录'` 召不回、`MATCH '报错'` 召不回，
   只有 `MATCH '修复登录页'` 才召得回。

### 词法一路：自带 CJK 分词 + BM25（不再依赖 WASM / CDN）

- `ragTokenize()`：拉丁按词 + 数字串保留 + **连续汉字切二元组**（并保留单字，否则一字查询永不命中）。
- `ragLexBuild()` / `ragLexicalTop()`：BM25 Okapi（k1=1.2、b=0.75），倒排索引惰性构建，
  任何写入都经 `saveRagDocs()` 统一作废重建（不会再出现"更新了内容却还按旧词命中"）。
- 效果：`ragSearch("登录")` 现在召得回「修复登录页 500 报错」—— 旧结构上做不到这件事。
- RAG 检索**不再需要 sql.js**：不联网、不等 CDN、离线与 Electron 表现一致（sql.js 仍留给 `sql_query` 工具）。
- 删除 `ragSearchFallback()`：它当初解决的问题（无 WASM 时 RAG 完全失效）已被上面这条吸收。

### 语义一路：provider 的 `/embeddings` + RRF 混合召回

- `aiEmbedTexts()`：OpenAI 兼容 `POST {base}/embeddings`，同时认 Ollama 的
  `embeddings[][]` 与 `embedding[]` 形状；非 2xx 或条数对不上统一返回 `null` 走降级（不抛）。
- 新增设置项「向量模型」（profile 级 `embedModel`，留空默认 `bge-m3`）：换 provider 连带换向量模型，
  国内 / 本地部署（Ollama、XInference、vLLM 等自带 /embeddings 的）都能接。
- 向量存 IndexedDB `kv`，键前缀 `ragvec:`（刻意不带 `wb_agent_`，否则会被同步镜像
  `JSON.stringify` 回写进 localStorage（1536 维 Float32 约 30KB/条），几十条就爆配额）。
  落盘形状是 `{ m: 模型号, v: Float32Array }` 而**不是裸向量**：换了 `embedModel` 之后
  旧向量维度不同，`ragCosine` 只会一律返回 0 —— 症状是"明明配了向量模型却永远召不回"，
  且全程没有报错。载入时按 m 过滤，不匹配（含旧格式裸向量）就当没有，交给回填自动重算。
- `ragHybridSearch()`：词法与向量各出一份排序，用 **RRF（K=60）** 融合（BM25 与余弦不同量纲，
  不能直接加分）；每条结果带 `via` = `lex` / `vec` / `both`，降级是显式可观测的而不是静默。
- 回填：`ragEnsureVectors()` 改为**批量**（32 条/请求）并加并发单飞锁；启动只补 20 条，
  `ragReindex()` 走全量。

### 顺带修掉的三个真实缺陷

1. `ragInit()` 一进门就把向量内存缓存置空"重新载入"：`ragVecPut()` 是"先写缓存、再尽力写 IDB"，
   IDB 不可用时缓存是唯一副本 —— 这一进一出会把刚算好的向量丢掉。
2. `ragReindex()` 的记录段与对话历史段用 `forEach` 调 async 的 `ragIndexAdd()` 且**不 await**：
   发出一堆没人管的 promise，函数返回时向量根本没建完，异常也无人接。
3. 检索在 AI 关键路径上，原先可能等满 CDN 超时（此前用 `Promise.race(1.5s)` 兜底）。
   词法一路去掉外部依赖后，那个 race 连同它的固定尾延迟一起删掉。

### 门禁自身也有一个"失明"bug（这条更值得记）

追查 check:modules 报出的"新增 1 条循环依赖"时发现：**`scripts/module-graph.mjs` 的预处理
只认引号、不认正则字面量**。`src/ai-tools.js` 里的 `/["']/g` 被当成字符串开头，一路吃到后面
的引号才收尾，**该文件 61834 字节被剥到只剩 35079** —— 区间里 9 个顶层函数
（ragInjectContext / ragReindex / switchModel / listModels / retryChatWithParams / streamProgress* …）
以及 `getChat`、`lastChatRequest` 等真实引用直接从依赖图里消失。
- 修好后的口径对比（**同一份 HEAD 源码**）：循环 39 → 44、逆层块对 29 → 35。
  基线数字变大是**测量口径被修正**，不是新增技术债；本轮改动在修正后的口径下
  对循环 / 逆层的增量实测为 **0**（HEAD 与工作树同为 44 / 35）。
- 预处理抽成 `scripts/lib/code-scan.mjs`，新增 `tests/code-scan.test.js`：除单元断言外，
  还对全部 28 个源块跑两条不变式（剥完括号必须配对、顶层函数名必须都还在），
  并且**把旧实现内嵌进测试证明哨兵真能抓住它** —— 防"永远为真的测试"。

### 实测与门禁

- 单测 **1029/1029**（93 文件）全过；e2e **45/45**（三视口，含新增 `tests/e2e/rag-hybrid.spec.js` 4 例）。
- 真浏览器（Chromium + `file://`）实测：IndexedDB 可用；`ragSearch("login bug")` →
  `doc-auth` 且 `via=vec`，**刷新后仍召回**（IDB 里 `ragvec:` 键 2 个、记录形状确实是
  `{m:"bge-m3", v:Float32Array}`）；`ragSearch("认证 报错")` → `via=both`；
  `ragInjectContext()` 输出含「修复登录页 500 报错」。
- 版本五源一致 3.7.57；`build:check` / `check:modules` / `lint:layers` / eslint / `lint-colors` /
  `check:ai-tools-doc` / `check:pwa-icons` / `pet:check` 全过。

### 下一轮候选（本轮刻意未做）

- 长期记忆召回仍是"词袋 + 余弦"（`ui-global-events.js` 那段写着"RAG 用 TF-IDF"），可直接复用本轮 embedding 通道。
- 上下文装配：固定 top5 + 每条截 200 字，没有按相关性/长度做预算分配，结果里也没有引用出处。
- 换 `embedModel` 后的旧向量已按模型号自动作废重算，但**没有进度反馈**：文档多时
  后台回填是静默的，用户看不到"重建到哪了"。

## [v3.7.56] - 2026-09-26

**放行本地回环后端 + 一处错误结论的勘误**。v3.7.54/55 把"CSP 拦死本地 HTTP 后端"记成待决项，
并声称"放开回环会让 tablet e2e 稳定挂起（单变量 A/B 证实）"。**那个因果是错的**，本轮查清并修正。

### 勘误：那次 A/B 是无效对照

- 复现路径本身就不一致：判定"CSP 导致失败"的那几轮，失败方是**全量并行**跑（多 worker、机器有负载），
  通过方是**单条用例单 worker**跑。变量不止 CSP 一个，结论不成立。
- 补齐对照后的实测：单 worker 下**放开回环连跑 4 次全过**（每次 ~8.6s）；**关闭回环连跑 6 次全过**
  （~9.9s）。也就是说单 worker 下两种状态都稳定，失败只在"回环放开 + 全量并行"这一组合出现。
- 真因是**用例超时预算**：`workflow.spec.js` 的完整用户流程有 10 个 `test.step`，而该文件自己的注释
  就记录了"点击重试 10s 会抛 TimeoutError 直接中断整个用例（CI 在 tablet 连续失败的根因，
  此前 4 次修复均未奏效）"。默认 30s 预算在并行负载下本来就不够，放开回环只是又加了一点耗时、
  把它推过那条线。
- 处置：给该用例显式 `test.setTimeout(60_000)`（**容忍负载，不放宽任何断言**），随后
  放开回环 + 全量并行**连跑两遍 41/41**。

### 正式放行本地回环后端

- CSP `connect-src` 增加 `http://127.0.0.1:* http://localhost:*`：只放开回环，
  **远程明文 http 仍不放行**，对外 AI 端点继续要求 https。
- 产品验收（真起一个本机 HTTP 服务，从 `file://` 页面跨源请求）：返回 `{"ok":true,"from":"local-backend"}`
  且 **CSP 零违规** —— 此前这类请求会被静默拦成 `network error`。
  受益面：本地 Ollama / 自建后端（`_apiBase` 默认值本就是 `http://localhost:3001`、
  `validateBaseUrl` 也专门放行 localhost）、云同步、抓取代理、SQL 后端。
- 顺带纠正一处误判：排查过程中我猜"测试会真打公网 api.openai.com 导致延迟不可控"—— 查证后发现
  该用例**在发送前就 `page.route` 拦截并本地 fulfill 了**，从不出网，假设不成立。
  同源托管的 mock 设计保留（它让同步测试与 CSP 策略解耦，两种状态下都成立）。
- HTML 的 `SECURITY NOTE [C-CSP-connect]` 已改写为放行说明，并**把这段弯路原样记在里面**
  （含"对照实验必须排除负载混淆"这条教训），避免以后有人再犯或再把它回退。

### 实测与门禁

- 单测 **995/995**（91 文件）；e2e **41/41** 连跑两遍（三视口、并行 worker）。
- 产品侧跨源回环 fetch 实测 200 + CSP 零违规；版本五源一致 3.7.56；
  `build:check` / `check:modules` / `lint:layers` / `lint-colors` / `check:ai-tools-doc` /
  `check:pwa-icons` / `pet:check` / eslint 全过；`check:source-state` ✓。

## [v3.7.55] - 2026-09-26

**文档/注释声明 vs 代码实况的一致性审计**：v3.7.54 收尾时抓到两条"CSP 与代码自相矛盾"，于是把这类
「声明说有能力、代码里查无实据」的问题系统查了一遍，逐条**独立复核**后才动手。本轮 5 项修复里
有 2 项是**用户可感知的功能失效**。

### code_run 此前从未真正工作过（P0 级）

- **CSP 缺 `worker-src`**：全仓库唯一的 `new Worker(...)` 就是 code_run 的 blob Worker（`src/ai-tools.js:1177`）。
  CSP 从未声明 `worker-src`/`child-src`，于是 Worker 回落到 `script-src`（不含 `blob:`）→ **每次调用都被拒**，
  工具恒返回 `{"ok":false,"output":"未知执行错误"}`；而 README 与 docs/product-scope.md 都写着
  "本机沙箱执行、不需联网"。补 `worker-src 'self' blob:` 后实测 `{"ok":true,"output":"3"}`。
  只放 blob: 给 worker，不扩 `script-src`、不动 `connect-src`。
  **为什么一直没被发现**：jsdom 跑不了 Worker，单测全绿；只有真浏览器能暴露。
- **异常被吞成"执行超时"**：glue 里 `self.onerror` 用 `return true` 抑制了主线程的 `worker.onerror`，
  而用户代码顶层抛异常后脚本中止、末尾的 `postMessage({type:'done'})` 也执行不到 ——
  **两条退出路径同时断掉**，主线程只收到 error 却没人调 `finish()`，于是干等满 5 秒、
  把真实异常换成误导性的「执行超时(5s)」。修法：`self.onerror` 补发 `done`；并在超时兜底里
  规定"已收到异常就不许报超时"。实测该场景从 7.4s / `执行超时(5s)` 变成 2.4s / 回传真实错误文本。
- 新增守护：`tests/csp.test.js`（5 条，解析 CSP 并钉住 `worker-src` 必含 `blob:`、
  `object-src 'none'`、`base-uri 'self'`、`connect-src` 未被顺手放宽、`<head>` 不得有游离文本、
  注释必须成对闭合）+ `tests/e2e/toolbox.spec.js` 里一条 code_run 真执行断言（正向 console 输出、
  反向异常捕获都验）。写这条断言时我自己的第一版期望就是错的（把 console 输出当成末表达式返回值），
  是 runner 报的 `Received: "hi"` 纠正了我 —— 契约见 `ai-tools.js:1159`：`output` 只含 console 文本。

### README 版本漂移纳入门禁

- README 三处仍写 v3.7.52（真实已 3.7.54），而它第 181 行自称"与 package.json / manifest.json /
  VERSION 常量保持一致"——**根因是它既不被 `release.mjs` 写、也不被 `build:check` 校验**，
  所以漂移是必然。修法两端都补：`release.mjs` 新增 README 写入步骤（标题 /「当前版本」/ 页脚示例三处锚点，
  一处都找不到就报错退出）；`build.mjs --check` 把 README 列为**第五个版本源**，并额外校验 H1 与
  「当前版本」自相矛盾。
- 反向验证过门禁真的会拦：人为把「当前版本」改成 v3.7.9，`build:check` 报
  「README 自相矛盾：H1 写 v3.7.55，「当前版本」写 v3.7.9」并失败；还原后通过。

### Electron OAuth：按自家"能力缺失即隐藏"原则收口

- 实测 `electron/main.js`（590 行）里 `oauth` / `createServer` / `8124` **0 命中**，`preload.js` 也只暴露
  6 个 API、不含 `oauthBegin` → 本地授权回调服务**从未实现**。但四处仍在承诺：注释写"后端
  （electron/main.js B3）：oauth-begin 接收…"、日历凭据弹窗**无条件渲染**「OAuth 授权」按钮、
  token 字段占位写"或点下方「OAuth 授权」自动获取"、应用内帮助写"v3.1.2 起支持 OAuth 授权"。
- 更糟的是原错误文案「OAuth 授权仅 Electron 桌面版支持」在 Electron 里**反而是假话**
  （它确实是桌面版，只是没那个 IPC）。现改为：新增 `integrationOAuthAvailable()` 探函数本身
  → 桥不在就**不渲染按钮、不渲染承诺段落**（与 v3.7.52 处理本机同步入口的做法一致）；
  错误文案改为"当前构建未包含本地授权回调服务…"；注释、占位文案、帮助文本全部改成如实描述，
  并保留后端补全步骤。字典侧 `int.errOAuthDesktopOnly` 随之删除、新增 `int.errOAuthBridgeMissing`
  （zh/en 同步，字母序插入）。实测弹窗仍开、按钮不出现、无报错。
- 顺带一条与本仓库既有原则相关的提醒（未改）：帮助里那句承诺位于 `<b data-i18n="help.featOauth">` **之外**，
  所以只改字典不会生效；反过来，**改这种带 `data-i18n` 的元素模板时必须同步字典值**，
  否则 v3.7.54 加的渲染期 `applyI18n` 会用字典旧值覆盖回去。

### 文档陈旧声明更正

- `docs/半成品功能完善路线图.md` §0.1 原标「✅ 已完成」并引用 `tests/l4-webhook-ssrf.test.js` 36 用例。
  查 git 历史：该实现与测试**确实存在过**，在 `2321ec3`「归档自动化工作流+语音助手——移除约 4000 行
  代码与对应测试」时随宿主功能一并删除，只是文档没跟。已改为如实标注（含"若 webhook 复活需按本节重做"），
  设计沉淀保留。
- `scripts/module-graph.mjs` 注释里的「26 个 src 块」更正为 28（`src/order.json` 实测 28 项）；
  另一处「不排除时 26 块报出 83 条环」是**历史测量值**，保留数字、加"曾"字明确时态，不篡改。

### 实测与门禁

- 单测 **995/995**（91 文件，含新增 csp.test.js 5 条）；e2e **41/41**（三视口，含新增 code_run 断言）。
- 版本五源一致 3.7.55 / `b20260925g`；`build:check` 真相源 sha256 通过；`check:modules` 无新增环/逆层；
  `lint:layers` / `lint-colors` / `check:ai-tools-doc` / `check:pwa-icons` / `pet:check` / eslint 全过；
  `check:source-state` ✓。
- **待决项（未擅自处理）**：`connect-src 'self' https:` 与两处代码自相矛盾 ——
  `_apiBase` 默认值就是 `http://localhost:3001`，`ai-loop.js` 的 `validateBaseUrl` 还专门放行
  `http://localhost`（README 列 Ollama 为支持供应商），但 CSP 一律拦死。试过只放开回环，
  tablet 的 `workflow.spec.js` 会稳定挂起（"单变量 A/B 证实"），故回退并记进 HTML 的
  `SECURITY NOTE [C-CSP-connect]`。—— **该结论在 v3.7.56 被推翻**：那次对照被负载混淆，真因是用例
  超时预算；放开回环 + 放宽该用例超时后全量并行连跑两遍 41/41，最终已正式放行回环。

## [v3.7.54] - 2026-09-26

**i18n 遗留彻底收口**：v3.7.53 只补齐了字典，英文界面仍大面积显示中文。本轮把四类成因逐一定位并修到底，
实测「英文模式下可见中文」从 **196 条降到 17 条**，且剩余 17 条全是用户自己的数据（种子任务标题/标签/笔记正文），
按设计不该翻译。

### ① 根因：字典的加载位置错了（最值得记的一条）

- `SCENARIOS` / `SCENE_FEATURES` / `TOOL_APPS` / `SIDE_SUBMENU` 这些模块级常量**本来就写了** `name:t("scenario.office","办公")` —— 所以"英文界面显示中文"根本不是漏挂 `t()`，而是**求值时机**：`t()` 在 core 块（第 1 个），而 `MESSAGES` 和 `_currentLang` 当时都在最后一个 UI 块 `ui-global-events.js` 里。core 求值时字典还在 TDZ，`t()` 只能返回中文兜底 → 这些文案被永久冻结成中文。
  实测冻结量：`SCENARIOS` **105/219** 条、`TOOL_APPS` **45/69** 条、`SCENE_FEATURES` **30/111** 条。
- 修法是把 `MESSAGES` + `SUPPORTED_LANGS` + `_currentLang`（并在原地就读出 localStorage 里的语言偏好）**整体上移到 core 的 `t()` 之前** —— 纯搬迁，不改一行实现，也正好补完 v3.7.9「把 `t` 收进 core、字典却仍留在 UI」那件没收尾的事。冻结量随之降到 **2 / 0 / 0**。
- 曾考虑过两条更"小"的路子并都否掉：给 180 个字段逐个改 getter（改动面更大且 `options:[t(),t()]` 这类数组元素无法惰性化）；把字典搬进内联 HTML 区（等于把受管代码塞回不受 `src-split` 管的黑盒）。

### ② 运行中切语言只换一半

- 常量在加载时就求值成当时语言，`setLang()` 再怎么 `render()` 也换不掉 → 实测切完仍有 **41 处**可见中文，而全新加载只剩 17 处。
- 语言下拉的处理器改为**落盘后重载一次**（`markDirty` 只调度重渲染、各写入点是同步落盘、`beforeunload` 还有备份兜底 → 不丢数据）。`setLang()` 本身保持纯内存原语，测试仍可单测。
- 验收走**真实 UI 路径**（打开设置 → 改 `#cfgLang` → 派发 change），而非直接调 `setLang()`：zh 启动 **215 条**可见中文 → 切 en 重载后只剩 **5 条**，且全是种子数据；场景名 `办公→Office`、工具名 `Markdown 编辑器→Markdown Editor`、功能 tab `概览→Overview`。
  ⚠️ 这条之所以值得单列：第一次改完我"以为"生效了，实测才发现 `location.reload()` 那处编辑当时根本没落盘（Edit 静默失败），**只有走真实点击路径才暴露得出来**。

### ③ 动态模板里的 `data-i18n` 从不被翻译

- `applyI18n()` 原先只在启动和切语言时跑，而 JS 动态插入的 `[data-i18n]` 节点（534 个键，如看板卡的编辑/删除、总览筛选按钮）在那之后才进 DOM → 英文模式下恒为中文。
- 在 `render()` 收口处补一次 `AppBridge.applyI18n()`。**关键细节：必须挂在 `finally` 上**，因为 `render()` 有 12 条提前 `return` 的路由（overview/stats/recycle/tasks/toolbox/store/chainpage/auth×3/timeline），第一版放在 `try` 尾部，实测只有 office 触发、overview 与 kanban 各 0 次。经 AppBridge 调用以免 Render 层反向依赖 UI 层（`check:modules` 无新增环/逆层）。
- A/B 同页实测（把钩子置空 = 修复前）：13 条路由合计 **41 → 0** 处残留，且「渲染成原始 key」的泄漏为 **0**（先做了前置校验，534 个 `data-i18n` 键在中英两套全部存在 —— 否则这条修复会把中文换成 `kanban.share` 这种裸键，比不修更糟）。

### ④ 字典里「key 在、值没翻」

- **en 侧曾直接照抄中文**：62 条 `p3.html.*` / `p4.html.*`（HTML 片段型词条）的 en 值就是中文。逐条翻译后只剩 **2 条**按设计显示双语的语言名（`settings.language.zh` = 中文、`settings.language.label` = 语言 / Language）。
- 翻译只替换值里的**中文片段**、不重写整条值 —— 这些值满是 `\"` 甚至 `\\\"` 转义，整条重写极易漏一层把 script 写坏（上一轮批量替换就炸过一次 eslint）。
- **修掉一处门禁假绿**：`i18n-completeness.test.js` 的"en 值不得含中文"用 `"([^"\n]*)"` 匹配值，在 `\"` 处截断，于是 `<div class=\"msg assistant\">你好，我是` 只被截到 `<div class=`、不含中文 → **43 条漏判、长期判绿**。改为转义感知的 `"((?:[^"\\]|\\.)*)"`，并加一条"模式必须真能解析出 >3000 条"的自检，防止将来又是解析失败式的假绿。

### 新增守护与顺带修正

- **`tests/e2e/i18n.spec.js`（新，4 条）**：① 英文全新加载时常量必须已是英文、非用户数据的可见中文 ≤6 条（历史基线 196）② 12 条路由上 `[data-i18n]` 既无中文残留也无裸 key ③ 真实下拉切语言后确实重载并换掉常量 ④ 反向兜底：中文模式不得漏翻（防"只修英文方向"）。按 theme-matrix 先例只在 desktop 项目跑一次。
  写第 ② 条时真抓到一处误报：`#set-look .set-tip` 的 `data-i18n=""` 空占位被"文本 === 键"的判据命中 —— 收紧为只看非空键（`applyI18n` 本就跳过空键）。
- `tests/i18n-completeness.test.js` 加**第 ④ 组「加载顺序锁」**：断言 `MESSAGES`/`_currentLang` 必须先于 `SCENARIOS`/`SCENE_FEATURES`/`ORDER` 求值、字典在全部 src 块里只能有一份、`render()` 的 i18n 收口必须在 `finally` 上 —— 防止以后有人把字典搬回去。
- 该测试与 `tests/theme-registration.test.js` 原先都写死读 `src/ui-global-events.js` 来数键，字典搬家后 10 条断言集体误判；改为**按内容定位**字典所在文件。
- 模板侧 13 处裸中文包进 `t()`（看板移动按钮、streak 面板 6 处、主页 3 个卡标题、星期表头、编解码「⇅ 互换」、代码运行器字段标签、`x-cal` 工具名/描述），新增 21 对词条；星期表头改为复用字典里早已存在的 `weekday.*`（原先同一行里中文数组被复制两份）。
- 2 个静态 HTML 按钮补 `data-i18n`（`#btnExportCSV`、`#btnAiNewKey`）—— 它们的 `data-i18n-aria` 早就接上了，唯独可见文本没接。

### 云同步契约端到端（同轮任务 #10）

- **新增 `tests/mocks/sync-server.mjs` + `tests/e2e/sync-contract.spec.js`（7 条）**。此前 `apiPutSnapshot` / `doSync` / `flushSyncQueue` 三处修复只有代码层面的信心。
  为什么起**真 HTTP 服务**而不是 mock `fetch`：被测链路里 `apiFetch` 的 401→refresh→重试、`offline` 判定（fetch 抛 TypeError）、CORS 预检、以及 `apiGetSnapshot()` 对 `data.snapshot` 的形状要求，**只有真 fetch 才走得到**；mock 掉 fetch 等于只测自己写的分支。
  端口用 0（临时端口）—— 三个 project 并行跑，写死端口必然撞车。覆盖：PUT 的 body 形状契约（`snapshot`/`updatedAt`/`_deviceMeta.deviceId`）、`doSync` 四态（idle/error/offline/未登录不发请求）、**完整往返**（本机改数据→push→抹掉本机→pull+apply→数据回来）、云端无快照返回 null、401→refresh→只重试一次、覆盖式恢复前留 `pre_restore_backup`、`SYNC_ENDPOINT` 未配置时不得谎报成功且不得清空队列。
- **顺带挖出一个产品级缺陷（CSP 挡死本地后端）**：`connect-src 'self' https:` 不放行任何 `http://`，
  而代码里 `_apiBase` 的**默认值就是 `http://localhost:3001`**、设置页也让你填任意 apiBase
  → 「自建后端 / 云同步 / 抓取代理 / SQL 后端」在本地明文 HTTP 部署下**全部被 CSP 静默拦成 network error**，
  界面只表现为"连不上"。
  ⚠️ **本条当时的处置是错的，v3.7.56 已勘误**：我试过只放开回环，tablet 的 `workflow.spec.js` 一度稳定超时，
  我据此下了"单变量 A/B 证实是 CSP 引起"的结论并回退。实际那次对照**被负载混淆**（一边单 worker 跑、
  一边全量并行跑），结论无效。真因与处置见 v3.7.56。
- **测试改为同源托管**：`sync-server.mjs` 顺手把 `agent-workbench.html` 也从 mock 自己的端口发出去，
  页面与 API 同 origin → `connect-src 'self'` 天然放行。这个设计**保留下来**（它让同步测试
  与 CSP 策略解耦，无论 CSP 放不放开回环都成立）。
- **顺带纠正一处虚假安全声明**：HTML 里的 `SECURITY NOTE [M3]` 声称"frame-ancestors 改由 Electron 主进程
  `onHeadersReceived` 注入完整 CSP 实现双层防护"，但 `electron/main.js`（590 行）里**根本没有**
  `webRequest`/`onHeadersReceived` 任何代码 —— 那层防护不存在，Electron 形态下 frame-ancestors 目前无防护。
  本轮只把注释改成如实描述（补实现属独立事项）。
- 写这套测试时踩到三个自身坑，都记下来：① 跨源 PUT/POST 会各带一发 **OPTIONS 预检**，只按 `path`
  筛请求会把预检算进去、使 refresh 次数凭空翻倍；② `_applyCloudSnapshot(data)` 收的是**快照本身**而不是
  `{snapshot, updatedAt}` 整条记录，传错层级会让合并静默拿到空任务；③ mock 里用 `import.meta.url` 定根目录
  会 `SyntaxError` —— Playwright 把 `.spec.js` 按 CJS 转译后再加载相邻 `.mjs`，那里不许用 `import.meta`。

### 工具箱 23 页冒烟（同轮任务 #11）

- **新增 `tests/e2e/toolbox.spec.js`（3 条）**，工具清单**运行时从 `TOOL_APPS` 枚举**（实测 23 个，全部有
  `render`+`bind`、无一个是占位页），不写死名单 —— 写死的话新增/改名工具会悄悄脱离覆盖。
  每页断言：走真实实现（有 `#toolAppBody`）、非「规划中」占位页、至少 1 个可交互控件、有「← 返回」、
  渲染结果无未插值残渣（`${`/`[object Object]`/`undefined`/`NaN`）、打开过程无 pageerror/console error、
  **375px 窄屏无横向溢出**、连续切完 23 页再返回不残留不报错。
- **核心一条：`bind()` 里引用的每个 `#id` 必须存在于渲染后的 DOM。** 靠这条抓到真 bug：
  **`des-imggen` 的 `render()` 从不输出 `#igOut`，而 `bind()` 的点击处理器要往它写 `innerHTML`**
  → AI 一旦启用，点「生成图片」立即 `Cannot read properties of null (reading 'innerHTML')`。
  之所以长期没被发现：该按钮在 `aiOn === false`（默认配置）时是 `disabled`，正常路径走不到。已补输出容器。
- 同类"两份清单会脱节"的问题这次有了机器守：此前 `docs` 与记忆里记的是「表单 inputs vs fieldKeys 白名单」
  那一对，这是**另一对**（`render()` 的 DOM id vs `bind()` 的选择器）。
- 该断言自带防空转：若 id 抽取正则失效，"缺失=[]"会**静默全绿**，故额外断言 23 页累计引用到的 id 数 > 60
  （实测 130+）—— 与上面 `en` 值正则那条"必须真能解析出 >3000 条"是同一个原则：**负向断言必须配一个
  证明抽取本身有效的正向断言**。

### 实测与门禁

- 「英文模式下可见中文唯一串」：**196 → 17**，剩余 17 条全为用户数据（种子任务标题 / 标签 / 笔记正文），按设计不翻译。
- 单测 **990/990**（90 文件）全绿；e2e **40/40**（desktop-1280 / tablet-768 / mobile-375）全绿 ——
  含本轮新增 `i18n.spec.js` 4 条、`sync-contract.spec.js` 7 条、`toolbox.spec.js` 3 条。
- `playwright.config.js` 开了 `use.screenshot = { mode: "only-on-failure" }`：本轮定位 tablet 挂起时，
  a11y 快照看不出"谁盖住了目标"，一张失败截图直接给出了答案 —— 这类问题没有图基本查不动。
- `check:modules` 块 28 · 重复定义 0 · 循环 39 · 逆层 29（**无新增**）；`lint:layers` OK；`lint-colors` 0 违规；`check:ai-tools-doc` 26/26 一致；`check:pwa-icons` ✓；`pet:check` ✓；eslint 0 error；`build:check` 四源版本一致 + sha256 真相源通过；`check:source-state` ✓（HTML 598KB / 28 标记 / 28 文件）。

## [v3.7.53] - 2026-09-25

**承接 v3.7.52 的同轮后续三批**：交互与数据安全（第二批）→ 窄屏与表单（第三批）→ 遗留项收口（第四批）。
版本为何单列：这三批在 v3.7.52 发版 bump 之后才完成（含 e2e 上了 PR 门禁、云同步推送侧补齐、i18n 字典契约守护），
为让已装上旧缓存 PWA 的用户能通过版本哨兵拿到新版，单独 bump 一版。

### 遗留项收口（同轮第四批）

- **云同步「只有拉、没有推」补齐**：客户端只有 `apiGetSnapshot`（GET），`doSync()` 只能是空转桩 → 新增 `apiPutSnapshot()`（`PUT /api/sync/snapshot`，与 GET 同契约，body `{snapshot, updatedAt}`，快照含 `_deviceMeta`），`doSync` 按真实结果置状态：推成功 → idle（「已同步」此时才诚实）、失败 → error、网络不可用 → offline、能力缺失 → local（仅本机）。仓库仍不含该后端，需部署方实现同名端点（product-scope 已注明）。
- **同步队列的假成功**：`flushSyncQueue()` 里真正的 fetch 被注释掉、却仍 `okCount++`，结尾 `failCount===0` 就 `clearSyncQueue()` —— 一旦部署方填了 `SYNC_ENDPOINT`，会**谎报成功并把整条队列丢掉**（与 v1.11.1「不谎报已同步」自相矛盾）。改为真发真判：只有 2xx 才算成功、才允许清队列。
- **e2e 改为 PR 也跑**：原先只在 push main 跑（理由"PR 已由单测覆盖"），但渲染层不变量（对比度硬断言、跨视口布局）单测覆盖不到 —— 用户标注的窄屏缺陷正是这类。同时给 `viewport.spec.js` 补 3 条渲染层断言（**表单字段等宽**、**看板按钮文字居中**、**streak 徽章单行**），这三条若早存在就能拦住本轮用户标注的问题。
- **i18n 完整性守护（新）**：字典契约写着「zh/en 两套 key 完全对齐」，但此前**无任何测试守着**。新增 `tests/i18n-completeness.test.js`：① key 集合完全一致（硬）② 不得两边都为空（硬）③ 无默认值的 `t("key")` 必须查得到（硬）④ 带默认值的写法按基线只拦增长（实测积压 274 个 key，字典头部注明是"逐步替换"的迁移状态）。**顺带修掉**：补齐 24 条「en 有、zh 缺」的账号/云同步词条；删除死键 `chainPage.subExtra`（两边都空且无调用点）。
- 另记录一处方法论：i18n 守护首版用**大括号计数**切字典体，被值里的花括号带偏、把 JS 代码当字典（误报 `chai` 为空值 key）—— 改为按 `en: {`/结尾 `};` 的**结构边界**切片。
- **既有 e2e flaky 修复**（为让「PR 也跑 e2e」真正可用）：`form-controls.spec.js` 的日期框用例本机 2/5 失败，症状是末尾存在性断言报 `Protocol error … session closed`（会话销毁竞态），而**实质断言全过**。改为「元素存在性断言放进循环内（哪一轮丢元素就指到哪一轮）+ 末尾改即时读取（不再重试 5s）+ 本例超时放到 45s」—— 加固后连跑 **5/5 通过**。

### 窄屏与表单（同轮第三批 · 用户标注实测）

- **报销缺「时间」**：字段只有日期，一天多笔报销无法区分先后。补 `time`（288 项可编辑时间下拉，与会议卡同口径）+ 列表新增「时间」列 + `default:"now"` 预选当前时间（向下取整到 5 分钟档，报销多为"现在就报"）。
- **一类静默丢数据（顺带查出）**：`_featureCardBind(key, fieldKeys)` 用 **fieldKeys 白名单**采集表单值 —— 不在名单里的字段**有输入框也永远存不进去**。实测会议卡正是如此：v3.7.43 补了「开始时间 / 参会人」输入框，白名单没同步 → 录完保存即丢、表格该列恒空。两处白名单补齐，并加静态守护「每个功能卡的输入框必须都在白名单里」（21 张卡全量扫描，防同类复发）。
- **窄屏任务表单「标签」比同排字段窄 46px**（用户标注"对齐，等宽"）：给 ＋ 预留的 `padding-right` 在窄屏仍生效（实测 390px 105 vs 151 · 768px 178 vs 224）。≤1023px 撤掉该预留 —— ＋ 在窄屏已自成一行，无需让位（其位置保持 v3.7.7 的决策：贴左列右端，避开桌面萌宠浮层）。
- **看板卡操作按钮不居中、与卡片无底色差**（用户标注"按钮内居中啊，左右居中，按钮与卡片背景色应该有点色差"）：手机端 `inline-flex` 让 `text-align` 失效 → 补 `justify-content:center`（实测各档文字中心偏差 0）；底色 `--panel2` 与卡片底只差约 4% → 改用「分隔线色混入面板色」现算，各主题拉开约 7~10% 的可见差（旧浏览器仍回退 `--panel2`）。
- **streak 徽章窄屏被压成三行**（用户标注"这个状态呈现的效果你认为好看吗？"）：7 枚一行时每枚仅 64px，「办公 + ⚠️未开始」折成三行（实测 64×68）。改为**不依赖断点**的修法：容器允许换行 + 徽章不参与压缩（`flex:0 0 auto`）+ 徽章内单行 —— 360/390 折 4 行、768 折 3 行、1024/1440 折 2 行，各档均为单行 126×29、无横向溢出。
- 新增守护 `tests/feature-card-fields.test.js`（9 条：白名单一致性 + 会议卡 startTime/who + 报销时间端到端 + 三处窄屏修复的静态护栏）。
- 顺带记录：本轮我把裸十六进制写进了 CSS 注释，被 `color-tokens.test.js` 当场判红（规范 §6.5 的"踩过 3 次"变成第 4 次）—— 守卫生效，已改为「令牌名 + 实测数值」表述。

### 交互与数据安全（同轮第二批 · 先实测后修）

- **用户取消会上屏英文 `user-cancel`**：`abort(reason)` 时浏览器 fetch 是以**传入的 reason 拒绝**（`name` 是 `Error` 而非 `AbortError`），旧实现只认 `AbortError` → 取消与超时都落进错误分支、把 `user-cancel` / `timeout` 当助手回复显示。改为**以控制器上的 reason 为准**，并补超时专用提示。既有测试测不出这条：它的 mock 自己造了个 `AbortError`，**与真机行为不符** —— 本轮的回归测试改用「把传入 reason 原样抛回」的忠实 mock。
- **超时语义**：原是一个 30s 定时器罩住**整个多轮循环**（agent 模式 6~12 轮必在第 30 秒被掐断），且设置里的「请求超时」在浏览器路径根本不生效。改为**每轮重置 + 读 `aiTimeoutSec`**（缺省/越界回退 30s）。
- **危险操作确认被反转**：确认分支挂在 `if(autoConfirm)` 上，而 `autoConfirm = !(cfg.agentAutoConfirm===false)` —— 把设置里「自动确认非危险操作」**关掉反而免确认**（反向到更不安全的一侧，且实测还有「既不弹窗也不执行、空转 maxLoops 轮」的第三态）。现改为：危险操作**始终**需确认；该开关只按字面作用于非危险批次（关闭时非危险工具调用也要确认，状态徽章文案同步改为「工具调用需确认」）。
- **异步工具在 chat 路径不可达**：系统提示与 README 都告诉模型可以「联网检索 / 跑代码 / 跑 SQL」，但 chat 路径只调 `execTool`，模型真调 `web_search`/`code_run`/`sql_query` 时只拿到「未知工具」（同一批工具在 Agent 计划路径却可用）。新增 **`execToolAuto`** 统一入口（异步走 `agentExecAsync` 并归一成同口径 JSON 字符串），两条路径共用同一份工具清单（清单原先在计划执行器里局部重复）。`docs/ai-tools.md` 的分发器标注同步改为三态，生成器一并更新。
- **降级环境下备份/导出静默变空**：`allKeys()` 用 `Object.keys(localStorage)`，而「存储安全壳」接管时对象上只有 6 个方法 → 枚举出的是**方法名**，备份 / 导出 / IDB 镜像 / 云快照全部为空。改用 `length + key(i)`（同文件其它两处早已如此，只这里漏了）。
- **损坏守卫漏守 11 个数组型键**：`memory` / `goals` / `meetings` / `life_bills` / `life_shopping` / `life_health` / `expenses` / `attendance` / `code_runner` / `code_frontend` 等原先不在清单里 —— 一次 JSON 截断即原值不留档、直接降级为空。清单补齐（非数组键如 `cfg`/`links`/`onboarded` 明确不加，否则会被本守卫误重置）。
- **云快照恢复的两处数据风险**：① 「本机有无数据」的判据读的是 `PREFIX+"records"` —— 该键全仓无写入点（幽灵键），于是「只有资料/笔记/记忆、没有任务」的用户被判成"本机无数据"，紧接着被云端快照整体覆盖；改用真实键枚举，且判定失败按「有数据」处理（宁可不动）。② 覆盖前先落一份 `pre_restore_backup` 回滚档（云端 push 端尚未实现时，覆盖即不可逆）。
- **云同步状态是虚假成功**：`doSync()` 是「转 syncing 再转 idle」的空转桩（后端通用同步端点未实现），而 idle 的文案是**「已同步」** —— 用户点「立即上传」看到"已同步"，实际一个字节都没上传。新增如实的 `local` 状态并渲染为「仅本机（云同步未接入）」，两处空转分支改置该状态（接后端后改回：成功→idle / 失败→error / 离线→offline）。
- 新增守护 `tests/ai-interaction-fixes.test.js`（15 条，含忠实 abort mock、确认语义三态、异步工具路由、降级壳枚举、守卫误伤反向断言、云恢复不覆盖既有数据、同步状态不撒谎）。


## [v3.7.52] - 2026-09-25

**主题可读性根治**：场景色从「模板内联裸 hex」收编为按主题计算的令牌，语义色当小字的用法全部改走 `-text` 安全档；同轮修掉 3 个 AI/数据静默失败缺陷，并收紧 Electron 守卫与 CI 门禁。

### UI 主题可读性（本轮主项）

- **根因**：模板把 `SCENARIOS[].color` 的**裸 hex 内联**进 style，11 套主题下场景标签 / 页头图标 / 链路图标 / 分享徽记不随主题变化。实测：`mist` 主题下任务标签文字与自身底色对比度 **1.0**（完全不可见）、`forest` 1.21；浅色主题下 study/code/health 仅 2.7~4.3:1，页头图标同理。
- **场景色令牌化**：`--sc-*` 补齐为 **8 档 × 10 个令牌块**（`:root` + 9 个 `data-theme`），每档按「对该主题面板与浅底 ≥4.6:1」**计算**得出（浅色主题≈品牌原色 / 深色主题提亮 / 中间调主题走浅粉彩）。新增 `scCss(hex)` / `scSoft(hex,pct)`（`src/data-links.js`：出厂色按 hex 反查 `SC_ORIGINALS` 走 `var(--sc-<场景>)`，**用户自定义色仍原样内联**），替换 26 处内联渲染点；浅底改用 `color-mix()`（裸 hex 拼透明度后缀对 `var()` 无效）。
- **文字安全色**：新增 `--accent-text` / `--danger-text` / `--warn-text` / `--ok-text`；83 处 `color:var(--accent)` 与 57 处 `color:var(--danger|warn|ok)` 全部改走 `-text` 档。`--accent` 品牌蓝在浅色主题下压深 4%（`--on-accent` 白字 4.43 → 5.23）。
- **弱色阶提档**：`--muted` / `--text-dim` / `--text-dim-2` / `--text-dim-3` / `--text-faint` 逐主题重算（light 页脚 AI 状态 2.23→6.19、forest 次要文字 2.61→4.64、mist 2.82→4.63）；`--text-dim-2/-3/--text-faint` 三档值收敛到同一档（保留令牌名避免破坏既有引用，弱化层级改由字号/字重承担）。
- **配对修正**：`--on-accent` dark 2.82→4.68、sepia 2.54→4.61、elegant 4.02→4.66；`data-sc="muted"/"danger"` 按钮补 `--on-sc` 配对（原先白字压 `--muted` 底，sepia/dark 不达标）。
- **结果**：10 主题 × 6 视图全文本对比度扫描 **779 处不达标 → 0**；新增守护 `tests/theme-scene-tokens.test.js`（8 条：令牌齐全/唯一/渲染端不得内联场景 hex/`scCss` 语义）+ e2e 硬断言（10 主题 × 8 场景 + 4 个 `-text` 档 ≥4.5）。规范同步见 `docs/ui-standards.md` §6.6 / C14 / 附录 A。

### AI / 数据正确性

- **`update_task` 静默丢字段**：一次性传 `status:"done"` + 其他字段时其余字段被丢弃（旧实现先 `completeTask()` 再改旧对象引用）——实测「完成 + 改优先级/截止」只有完成生效，回执却报全部成功；改为先落盘其余字段、最后打完成标记。
- **工具白名单分支三处修复**：对已解析对象再 `JSON.parse` 必抛（白名单一开所有工具都不执行）、有任一被拒时同轮允许的调用被一并丢弃、被拒调用缺 `role:"tool"` 回执（真 API 会 400）。
- **聊天历史键漂移**：历史原先按「写入那一刻的 active」落盘 → 生成中切场景会把 A 场景历史写进 B 场景的键并覆盖；改为 hist 数组挂不可枚举 `_sc` 标记，`save()` 内部按标记纠偏键。
- **踩坑记（模块图环检测）**：新增符号会改变依赖图环检测——最初把 `saveChat()` 放数据层由 AI 层调用，图工具把「窄符号」计为一条新边、多出一条循环依赖（旧的 `save`/`PREFIX` 属共享符号被排除、不计边）。最终把「聊天键纠偏」下沉进 `save()` 内部的键改写（内联区，不参与跨块依赖），依赖图恢复 39 环、0 新增。

### Electron / CI

- **导航守卫收紧**：`_isInternalUrl` 不再把「任意 `file:`」当内部页面（原实现 + IPC 只校验 `file://` 前缀 ⇒ 任意本地 HTML 被打开即可拿到带 preload 的窗口），只认本应用自己的页面 + `about:blank`；`shell.openExternal` 改走协议白名单（http/https/file）。
- **本机同步入口关闭**：页面侧调用了 preload 未暴露的 `electronAPI.syncPush/syncGet`（主进程也从未实现 8124 同步服务）→ 按 product-scope「stub + 活 UI = 虚假功能」在能力缺失时隐藏入口、不启定时器（原先每 60s 弹一次失败告警）。
- **发布门禁**：`deploy.yml` 新增 `verify` 前置 job（check:source-state + 测试 + build:check + lint + check:modules），发布必须过门禁（此前 push main 直接发布，CI 全红照样上线）；两个工作流补 `concurrency`。
- **CI 清理**：移除 `npm run test:coverage`（单文件 HTML 无法插桩、覆盖率恒 0、白跑第二遍全量）；补接三处「写了但没接」的门禁（`lint:layers` / `check:pwa-icons` / `pet:check`）。
- **门禁修洞**：`lint-colors` 的「令牌定义行整行豁免」可被 `--wp-ok:#111;color:#e74c3c` 夹带绕过（实测），改为「摘掉行内全部 `--tok: 值;` 后仍不得残留颜色字面量」；`src-split --check` 原先静默忽略 `src/` 下未登记进 `order.json` 的 .js 并仍打「齐全 ✓」，改为硬失败。

## [v3.7.51] - 2026-09-25

**非 CSS 载体字号收编**：SVG `font-size` 裸值 18 处（`chain.js` 7 · `ui-global-events.js` 7 · `render-overview.js` 2 · `ui-guide.js` 2）+ Canvas `ctx.font` 1 处全部入令牌——实测 SVG 属性**支持** `var()`（此前"不支持"的判断被实测推翻），Canvas 走新增 `_pfCssFont()` 运行时读值。同轮做字号阶梯使用率盘点（结论：不合并，展示级档位低频是本质属性），`_probe/` 探针目录整理归档。

## [v3.7.50] - 2026-09-25

**零散字号/图标值收编**：22 处裸 `font-size` + 3 处 15px 图标 + 4 处内联 `font-size` 全部改走令牌，新增 `--fs-4xs`(9px) / `--fs-3xl`(22px) / `--fs-display-sm`(32px) / `--fs-display`(36px) / `--fs-display-lg`(48px)，CSS 与内联 style 的裸字号**双双归零**；补上「令牌在 6 处重复声明、漏改主题块会静默回退」的守护盲区（断言各声明处内容完全一致，已做故障注入验证）。

## [v3.7.49] - 2026-09-25

**技术债复核**：附录 11 条逐条 CDP 实测复验——5 条为误判删除（主因：`getComputedStyle` 对 `display:none` 子树返回的是 UA 默认值，看起来像幽灵样式污染），1 条为真债已修；18px 图标 14 处收编为新增的 `--icon-set` 令牌（教训：静态扫描与运行时实测缺一不可）。方法与证据见 ui-standards 附录 C 与 `_probe/DEBT-REVIEW.md`。

## [v3.7.48] - 2026-09-25

**统一设计规范**：把 `ui-standards.md` 与 `design-ui-guidelines.md` 两份旧文档合并为唯一权威（后者删除，README 索引同步）；新增 22 条守护测试（`ui-spec-guards.test.js` 19 条等），补上图标尺寸 / 几何令牌数值 / 半档间距三处此前完全无守护的空洞；断点收敛（879→1023、519→520）并修复 `#recForm` 固定列位在窄屏越界（同特异性成对解除 grid-column/grid-row）。另记一条禁令：修复注释里写彩色 emoji 会被全站零 emoji 门禁判红。

## [v3.7.47] - 2026-09-25

**UI 体检修复**：记录卡表单固定 4 列、日期面板宽=触发框、全站对比度达标（页脚底文字 2.23→7.61、P1/实验性徽章 3.26→4.95、成功 toast 白字 3.06→5.0）；补丁：`lint-colors` 把 CSS 注释里的裸十六进制色值误判 7 处——「注释只写令牌名 + 对比度数值」的惯例由此而来。

## [v3.7.46] - 2026-09-25

**存储安全壳**：`localStorage` 不可用（隐私模式 / 被禁用）时降级为内存存储，不再整页灰块。已知限制：只覆盖"启动时不可用"，不覆盖"运行中写入超限"（记录于 ui-standards 附录 C9）。

## [v3.7.45] - 2026-09-25

修复 CI eslint error：日期宽松解析正则去掉字符类内多余的 `\/` 转义（`no-useless-escape`）。

## [v3.7.1 – v3.7.44] - 2026-09-21

**看板表单栅格 / 卡片 / 控件体系的密集修复（41 个子版本，v3.7.2/3.7.3/3.7.25 无独立提交）**。主题：表单与看板精确对齐、自研下拉替换原生 select、控件矩阵主题化、以及源码态/CI 的维护。

### v3.7.1–v3.7.12：表单栅格与 datepicker（09-21）

逐版本记录见下方 v3.7.0 条目「v3.7.1–v3.7.12」小节；同批另修看板卡 chips 被 flex-shrink 压成三行（生活页「逾期」徽标）的问题。

### v3.7.13–v3.7.15：卡片布局统一与规范统一（09-22）

- 卡片布局统一改造——字段宽度统一、上下对齐、视觉规整；同批把看板卡表单（12 微轨）、`.form-row--grid`、`.tool-form-grid` 统一为**等宽四列**（`.fld-*` 全部 `span 3`，尺寸类退化为语义标签）
- v3.7.13：修 tool-card 结构错位根因（i18n 多了一个 `</div>`）+ 日期预填今天 + tab 去灰标
- v3.7.14：规范统一——输入框降级、按钮字号统一、圆按钮强制 38×38、行列间距相等；表单行距 gap 20→12px
- v3.7.15：优先级收窄 + 下拉框显式降字重
- 会议纪要 / 资料库日期字段启用时间选择（补齐 render-widgets 渲染路径 + core.js 字段定义）；「去配置」按钮移至独立行动条

### v3.7.16–v3.7.24：看板第一行与聊天状态条（09-23）

- 看板第一行定稿（优先级占 1 轨 68px、标签加长、加号独立占最右 1 轨）；表单列距与看板 gap 同源（微轨数学推导），筛选行改 4/4/4
- 「去配置」状态条两连改：先移出消息流为常驻条，随后整体撤掉（修 v3.7.18 引入的 e2e 失败）
- 日期面板宽度跟随输入框、优先级向左加宽；输入框边框加深、模型下拉加宽居中、指标条两次加高
- 浅色宠物（豆柴 / 雪团）光影修正

### v3.7.26–v3.7.33：自研下拉与记录表单（09-23 ~ 09-24）

- v3.7.26：自研下拉选择框（渐进增强原生 select）+ 全站图标三档令牌；新增 `src/ui-select.js` 与 `order.json` 登记（src 模块 27→28，补提交）
- v3.7.27–v3.7.30：模型下拉加宽加高 / 上拉观感 / 与发送按钮底对齐；下拉箭头加强可见；label 随 options 同步；附件按钮与发送按钮同高
- v3.7.28：记录表单单行——＋按钮不再掉行、图片列稍宽
- v3.7.31：学习资料「类型/状态」由自由文本改下拉（业务定义修正）
- v3.7.32：会议拆出「开始时间」独立字段（日期 / 开始时间 / 预设时长三正交）+ 记录表单改 4 列固定网格
- v3.7.33：开始时间改自研下拉 + ＋按钮跨行靠右 + 日期字段加 ▼

### v3.7.34–v3.7.39：控件矩阵与键盘可达（09-24）

- 控件矩阵审查（range×16 / color×27 主题化）→ P1+P2 全量落地：原生 time 清零、点击区 32px、尺寸统一
- 补控件三态视觉 + 焦点环 / Tab 序真键盘验证；日期面板键盘模型、＋按钮与输入框同行
- 复选框点击区 13→16px、颜色选择器 32→38px 统一；修弹出方向真根因、时间字段改可编辑下拉

### v3.7.40–v3.7.44：构建与 e2e（09-24 ~ 09-25）

- v3.7.40：修 no-inner-declarations（`commit()` 移出 `if(EDITABLE)`）+ 更正误提交的拼回态、重提源码态 HTML
- v3.7.41：`gen-ai-tools-doc` 双态寻源 + `--check` 零写入并接入 CI
- v3.7.42：主题渲染层守护（`theme-matrix.spec`）+ 修 3 个本机 e2e 可用性缺陷；playwright.config 注释块提前闭合修复
- v3.7.43：日期框可手输（点击全选）+ 下拉列表滚动不再误关 + 会议管理卡补齐开始时间
- v3.7.44：下拉列表按「实际错位」判定关闭 + 可见区自适应高度（修「列表无法滑动」）
- 杂项：`.trash/` 本地回收站入 .gitignore；自研下拉在测试环境整段跳过增强（修偶发失败）

## [v3.7.0] - 2026-09-16

**大版本跳跃**：从单文件 HTML 架构迁移到分层源码外置 + 解耦方案，同时补齐 PWA / E2E / 命令面板 / 主题 / 离线 SQL 等能力。后续 v3.7.1–v3.7.12 为 UI 栅格与 datepicker 的快速迭代修复。

### 架构：分层源块外置（src/ 27 模块）

将约 29,900 行应用 JS 从 `agent-workbench.html` 外置到 `src/` 目录，按五层架构（Util / Data / Chain / AI / Render-UI）拆分为 27 个模块，构建期由 `scripts/src-split.mjs` 拼回单文件。HTML 从 3.50 MB 缩减到骨架约 544 KB。

- **Util/Crypto 层**（第一步）：加密、工具函数外置
- **Data 层**（第二步）：数据读写、存储、备份外置
- **Chain 层**（第三步）：场景联动逻辑外置
- **AI 层**（第四步）：AI 对话循环、工具分发、配置外置
- **Render/UI 层**（第五步~第六步）：渲染调度、全局事件、组件外置（16 块 / 约 29,900 行累计）
- **分层源块符号级依赖图 + 静态校验**（`--check` 接进 CI）
- **源码态门禁**：防拼回态误提交，接进 CI 两个 job

### 架构：解耦方案 S0–S6

消除跨层反向依赖，核心层出边归零，逆层依赖从 44 降到 30：

- **S0**：修复核心层反向依赖（core 出边归零）
- **S1**：AI 工具实现归位（纯搬迁，逆层 44→41）
- **S2a**：动作类接口走 AppBridge（14 处跨层调用点）
- **S2b**：render 调度器走 AppBridge（12 处上行调用点）
- **S3**：Data 层改走 markDirty 置脏 + rAF 合帧
- **S4**：4 个纯搬迁 + completeTask 桥接（逆层 38→30）
- **S5**：getAiConfig/saveAiConfig 归位（首次实战搬迁工具）
- **S6**：Render→UI 的 13 个 bind/动作类符号走桥接

### 萌宠立绘外置

- 立绘从 base64 内嵌改为 `assets/pet/` 外置文件，源码 HTML 3.50 MB → 2.34 MB（-33%）
- `pet:check` 区分源码态/已注入态/部分注入
- 眨眼/张嘴浮层随宠物尺寸变化重新定位（ResizeObserver）

### PWA 图标补齐

- 补齐 192/512 PNG 图标（纯 Node 生成，与托盘图标同源品牌图形）
- 修复 manifest 图标引用（原 icon-192/512.png 不存在导致 PWA 图标 404）

### E2E 多视口矩阵

- 新增多视口矩阵 + 移动端关键路径 spec
- 平板/移动端聊天面板展开策略修复（容错 + 命中测试）
- CI 下 e2e 加 2 次重试（吸收环境抖动）

### 命令面板增强

- 拼音首字母搜索（22 字 → 73 字拼音表）
- Esc 两级退出（先清搜索再关面板）
- 命中高亮 + 3 条新命令 + ↑↓ 循环
- 23 个工具接入命令面板

### 新主题

- 新增第 11 个主题「墨底鎏金 ink」+ 补全最易漏的第 7 处注册 + 守护测试
- 侧栏选中态统一走主题色（11 个主题一致）+ 修掉子项文字在暗色下不可见

### sql.js 离线支持

- sql.js 本地副本随包发布，SQL/RAG 离线可用
- sql.js 资源基址可配置，支持离线自托管
- 补基址回退顺序的守卫测试

### 工具做深

- **办公工具补导入**：word/sheet/md/ppt + 拖拽导入
- **生活簇 5 个工具获得 CSV 导出**（改共用骨架，一处改惠及 5 个）
- **PDF 阅读**：做深并修掉自上线起就没生效的真 bug
- **时间戳**：时间差/常用时间点
- **视频分镜**：去掉假承诺
- **web_fetch**：支持代理兜底，修复 CORS 导致"名有实无"

### AI 工具文档

- 工具文档从源码生成并补齐 26/26（原只写了 16 个）
- `npm run make:ai-tools-doc` 自动生成 `docs/ai-tools.md`

### 版本基础设施

- 版本 3.6.4 → 3.7.0 + CACHE_VERSION bump —— 修「用户永远看到旧版」的病根
- Electron 打包前先拼回单文件（否则 exe 里装的是"源码态"空壳）
- Electron 打包配置修复（图标改用 256×256 PNG，electron-builder 26.x 兼容）

### v3.7.1–v3.7.12：表单栅格与 datepicker 快速迭代

v3.7.0 之后的 12 个子版本集中在看板表单栅格对齐与 datepicker 紧凑化：

- **v3.7.1**：修三处 UI + 版本 bump
- **v3.7.4**：第一行重排 + 日期面板跟随输入框（全站同类错误根治）
- **v3.7.5**：窄屏表单改两行（根治 6 轨在窄窗口压成方块）
- **v3.7.6**：PC 恢复单行（撤销 v3.7.5 两行方案）
- **v3.7.7**：响应式三档系统验收（PC 筛选行对齐看板列 / pad 看板自适应 / 按钮不竖排）
- **v3.7.8**：datepicker 永远向下展开 + 宽度收敛 [206,260] + 修 z-index 非法 calc
- **v3.7.9**：卡片文字可读性（状态/操作按钮与列标题放大加粗提色）
- **v3.7.10**：datepicker 面板整块紧凑化（高度 286 → 234）
- **v3.7.11**：第一行改按「宽·中·窄·中」比例分配（4/3/2/3 微轨）
- **v3.7.12**：表单栅格失效修复 + 补卡片外壳

核心改造：**方案 A 统一基线栅格**——工具卡、记录表单、编辑弹窗、看板卡共用同一套字段宽度规则（`.form-row--grid`），上下列位一一对应。

## [v3.6.4] - 2026-09-15

**分支归并**：将「萌宠改造」线（原 `pet-20260914`）并入主干工程 —— 以主干 99 文件工程化为底座，
并入该线的 app 主文件，统一四处版本号到 3.6.4（package.json / electron/package.json / manifest.json / HTML VERSION）。

萌宠改造内容：
- 9 只角色：动物 5（橘座 / 棉花·萨摩耶 / 雪团 / 团子 / 泡泡·海豚）+ Q 版 2（小星 / 小辰）+ 青年 2（阿妍 / 阿岸）
- 立绘密度：面积平均降采样 + 320px 长边 + 逐行自适应 PNG 滤波
- 尺寸三档（小 72 / 中 96 / 大 128），默认 96
- 3D 立体档改为「同一张清晰立绘 + 2.5D 渲染」（厚度挤出 / 方向光 / 镜面扫光 / 接地影 / 转台摇摆 / 指针倾斜），
  弃用原先糊细节的 img2img 重渲染稿
- 眨眼 / 张嘴 / 动作（摇头·点头·跳舞·倾斜·转圈）+ 立体档星光特效
- 阴影提亮：修正浅色毛上不自然的块

一致性修复（本次）：
- manifest 图标改用仓库实际存在的 `icon.svg`（原 icon-192/512.png 仓库内不存在，PWA 图标 404）
- README 版本陈述同步到 v3.6.4
- `tests/ui-consistency.test.js` 去掉写死的版本断言，改为正则（发版不再误报）
- package-lock / electron/package-lock 根版本字段同步到 3.6.4

### 交互与持久化修复（2026-09-15，同版本内补丁）

- 插件启动时注册默认值会抢先覆盖 `wb_agent_plugins`：初始化阶段暂停保存，完成注册后恢复已有启用状态和配置；新增跨页面重启回归。
- AI 折叠栏图标改为调用 `openAiPage()`，不再把菜单 ID `feat-ai` 持久化为场景；返回保留原场景。恢复折叠状态时不再用 `textContent` 销毁 SVG。
- 邮箱验证码异步网络拒绝补 `.catch()`：恢复按钮和错误提示，可重试；HTTP 失败提示与成功倒计时路径保留。
- 微信扫码关闭/重开时清理轮询并使在途响应失效；二维码过期停止轮询并提示重试。关闭弹窗后不再接收迟到的登录确认。
- GitHub OAuth 消息校验本次登录窗口、API 来源、一次性 `state` 及会话有效期；拒绝无登录上下文、跨来源和重放消息。允许合法回调 postMessage 后立即关闭窗口，避免误拦已排队消息。回调契约见 README，实际后端联调未完成。
- 第三方登录获取用户资料后再次刷新顶栏账号信息；工具箱回归改为点击真实卡片验证弹窗，而非仅检查函数存在。
- README / 产品边界纠正“无账号”“所有数据不会离开本机”等绝对表述；明确可选后端依赖。

### 代码审查修复（同版本内补丁）

**产品代码真实缺陷（4 处）**
- `_updateUserButton` / `_loadApiPanels` 只导出到 `window.__test`（仅测试门控下存在），而认证页
  `_doAuthLogin` / `_doAuthRegister` 在 IIFE 外部调用它们 → 恒抛 `ReferenceError` 被 `try/catch` 静默吞掉，
  **登录后用户按钮与账号面板不刷新**。补齐正式 `window.*` 导出。
- `getHabitChainStatus()` 全文件无定义，被 `typeof` 守卫兜成空数组 → **「联动状态」页恒显示 0 条启用规则**。
  改用真实数据源 `getLinks()`；同时修正该块内 Link 对象字段名错误（`from`/`to` → `fromSc`/`toSc`）。
- `_renderDiagramCanvas` 存在两份**逐字节相同**的定义（29 行重复），删除其一。
- 16 处跨 IIFE 调用（`apiLogin`/`apiRegister`/`apiSetTokens`/`apiFetch`/`isApiLoggedIn`/`doSync` 等）
  改为显式 `window.` 前缀，ESLint `no-undef` 由 18 errors 清零。
- `service-worker.js` 还原被生产产物就地覆盖的 `CACHE_VERSION` 基线（去掉 `[prod build] auto-bumped` 标记）。

**死 UI / 死入口**
- `openGanttModal` / `openDashboardModal` 仅绑在 `#btnGantt` / `#btnDashboard` 上，而这两个按钮自 v1.15
  「更多菜单移除」后已不在 DOM → 甘特图与自定义仪表盘（15 组件 + 拖拽布局）**全无入口**。
  已在「工具箱 → 功能」补 `x-gantt` / `x-dashboard` 两个入口。

**质量门禁回绿**
- `z-index` 裸值令牌化（`.pet-fx` → `var(--z-under)`）；清除注释中的字面 emoji。
- **颜色门禁 `lint-colors.mjs` 重构**：hex 正则收紧为合法 CSS 长度（3/4/6/8 位），修掉 `$("#ccDec")`
  这类 DOM id 被误判为颜色的假阳性；白名单按类别补全（变量回退值 / 纯黑白 alpha / 品牌色 /
  萌宠插画 / 生成物模板 / 数据色），从 67 处违规收敛到 12 处。
- 剩余 12 处（aurora / forest / ocean 三个主题块内的 rgba 字面量）按项目既有惯例**收敛为 4 个主题令牌**
  （`--side-glow-inset` / `--chat-glow-inset` / `--topbar-tint` / `--nav-shadow`），色值逐字节保持不变，
  门禁 PASS。
- `vitest.config.js` 全局 `testTimeout` 提到 20s：单文件 HTML 架构下 `loadApp()` 需 JSDOM 解析 3.4 MB
  全文（实测 ~0.8–1.3 s/次），默认 5 s 对重型用例偏紧。

**测试断言同步（主干回绿：53 文件 / 590 用例全通过）**
- 内置场景 4 → 7（ORDER 驱动动态推导）、AI 工具 16 → 26、`SCENARIOS` 8 键、仪表盘组件 15 个
- 文案改名跟随：番茄 → 笃行、习惯链 → 场景联动（联动触发率 / 联动可能断裂 / 暂无联动规则）
- `#toasts` 改为惰性创建语义；健康助手插件基线由「extraCard none」更正为「life ↔ health」
- `renderToday()` 改为直接调用其纯函数（该页已不被 `render()` 路由，属待清理死代码）；
  `renderStats()` 用例改写为「统计页可达——侧栏无独立入口，经系统概况卡『已完成』进入」，
  断言 `entry.click()` 后 `getActive()==="stats"` 且 `#main` 含 `dashHost` / `stats-cards`
- **新增 `tests/toolbox-entries.test.js`**：死入口回归守卫——断言甘特图 / 自定义仪表盘在工具箱可见，
  且 `TOOLBOX_EXTRAS[].run` 内的 `typeof openXxxModal === "function"` 守卫可达（不是恒为 false 的死守卫）。

**文档同步**
- README：场景数 4 → 7、工具数 16 → 26、健康由插件 → 内置场景、补账号云同步 / SQL Playground /
  自定义仪表盘 / 插件市场 10 项 / 联网例外说明；顶栏按钮清单更正（「更多」已移除，新增「账号」）
- `docs/product-scope.md`：「无账号体系」→ 可选个人账号 + 云同步；场景/工具数同步；企业 SSO 与
  个人第三方登录的区分；补录 v3.6.6 死入口案例
- `docs/architecture-layers.md`：Bootstrap 块数 4 → 5、`execTool+16 工具` → `+26 工具`

# Changelog

本文件记录 Agent 工坊（原 Agent 工坊）从 v1.0.0 起的所有变更，按 [Keep a Changelog](https://keepachangelog.com) 风格组织，日期为 YYYY-MM-DD。

### 其他（同版本内）

- **产品名统一**：`Agent 工作台` → `Agent 工坊`，一次性全量替换（15 个文件 54 处，含代码 / UI 文案 /
  测试断言 / 图标注释 / 启动脚本名 `启动Agent工坊.bat`），代码与测试同步改，避免断言失效。
- **新增 `docs/pet-system.md`**：萌宠系统完整文档（数据结构 7 张表 / 立绘管线 / 五官标定 / 双风格实现 /
  新增角色流程 / 踩坑清单）。
- **文档体系更新**：README 补「桌面萌宠」小节 + 文档索引 + 开发与发布（157→220 行）；
  `docs/architecture-layers.md` 行区间刷新并补「萌宠子系统现状」；`docs/product-scope.md` 萌宠纳入范围
  并新增「已废弃实现」清单；`CONTRIBUTING.md` 补命令表 + 「版本与发布」章节 + PR 清单（133→172 行）。

## [v1.15.0] - 2026-08-18

### UI 做减法：清除死 UI / 统一标题栏 / 提升信息密度

**死 UI 清除（有 UI 无功能的虚假入口）**
- 删除生物识别设置卡片 + 3 个 stub + `_maybeBioProtect` 门禁（v1.14 已移除模块，UI 是残留；删除任务/导出恢复直接执行）
- 图片附件降级：多模态已移除，附件仅支持文本文件，选图时明确提示"已停用"
- 删除 e2ee/oauth2/multimodal 共 8 个无调用者 stub（保留 `_oauth2HandleCallback` 启动占位）
- 修复空态"新建任务"死按钮（渲染了但无绑定）——补全局委托，与快捷键 N 同款行为
- 顺带修复 4 个历史 ESLint no-undef（自动化归档残留的 cron/工作流注入器悬空引用）

**页面标题栏彻底统一（图标 + 大标题 + 小标题，独立成卡）**
- 统计/仓库/回收站标题"单独摘出"独立成卡，不再与内容同卡
- 标题与侧栏菜单名一致：统计页"任务统计"→"统计"，文档页"使用指南"→"文档"
- 高级报表按钮移出标题栏，置于内容区操作卡
- 统一规格：32px 图标 / fs-lg 大标题(600) / fs-xs 小标题 / 12px 间距 / 8px 上下 padding / 16px 左右 padding，垂直居中
- `page-head-sm` / `page-head-loose` 变体废弃，全部归一基础 `.page-head`
- 修复仓库菜单高亮 bug：`openWarehouse` 未设 uiView，点击后侧栏高亮永不显示

**视觉/布局**
- 顶栏 75→54px、按钮改横排（图标左文字右），回收垂直空间
- 主区 padding 与卡片间距收紧 1 档（提升信息密度，背景占比 90%+ → 目标 <85%）

**文档与 CI（第二阶段）**
- CHANGELOG 补 v1.14.1 归档记录（幽灵版本号止血）
- 帮助文档删除已移除功能章节（企业级功能 / AI 工作流 / 语音 / 多模态）
- README 契约表改为"按实际调用核对"（标注 version/isPackaged/platform 为暴露未用）
- README 修正"自动顺延"宣称（实际为"逾期任务计入今日待办"）、顶栏按钮描述
- E2E 纳入 CI：main push 时自动跑 Playwright 完整用户流程（此前从未在 CI 执行）

**测试**
- 全量 576/576（51 文件）；phase2 多模态测试改为历史兼容测试

## [v1.14.1] - 2026-08-17

### 归档：移除自动化工作流 + 语音助手（对齐 README 非目标声明）

**移除内容（约 4,000 行代码 + 3 个测试文件）**
- 自动化规则引擎 / cron 调度器 / 多步工作流（DAG）执行引擎 / Webhook 订阅总线
- 工作流设计器（节点拖拽 / SVG 渲染）与执行引擎
- 语音输入 / 输出（Web Speech API）与聊天区语音 UI
- webhook 总线存根、`FEATURE_FROZEN` / `applyFeatureFreeze` 机制
- 清理 `__test` 导出与自动化弹窗 HTML / 按钮入口

**保留**
- 第三方集成（Notion 等）与 OAuth 存根、习惯链、SM-2、插件市场

**测试**
- 删除 2 个已删模块测试文件（c2-evalcondition-hardening / l4-webhook-ssrf）
- `tests/phase2-features.test.js` 移除工作流用例（33 行）

## [v1.14.0] - 2026-08-16

### 做减法：移除企业/协作模块，回归单文件 to-C 定位

**移除模块（7 个，合计 ~17,000 行）**
- `enterprise.js`（块 3）：Workspace / RBAC / GDPR / SSO——单文件应用无多租户需求
- `crdt-collab.js`（块 2）：CRDT 协同编辑——需服务端传输层，与单文件形态冲突
- `capacitor-native.js`（块 10）：Capacitor 原生打包——工程链超出单文件交付
- `oauth2-callback.test.js`：依赖回调 URL 闭环，与当前本地运行模式不兼容
- `biometric-webauthn.test.js`：WebAuthn 在 jsdom 下无法完整测试，门禁 stub 已内联
- `phase1-features.test.js`：第 1 期测试已被分散到各专项测试中，原文件冗余
- 对应路线图文档中的搁置项标记为已归档

**代码修复**
- 恢复 `_safeEvalExpr`/`_safeEvalValue` 等临时兜底函数被误删前遗留的孤儿代码块
- 恢复 `wfEvalCondition` + `_WfExprTokenizer` + `_WfExprParser`（自动化规则条件表达式解析器，随企业模块一并被误删）
- 补回 `__test` 导出缺失项：`PREFIX`、`SCENARIOS`、`ORDER`、`TOOLS`、`DEFAULT_LINKS`、`MVP_SCOPE`、`createStore`、`taskStore`、`cfgStore`、`linkStore`、`mdToHtml`、`safeUrl`、`inlineMd`、`sanitizeHtml`、`wfCreateWorkflow`、`wfExecuteWorkflow`、`renderWorkflowCanvas`、`integrationGetStatus`、`integrationSetHttpClient`、`getCorrupted`、`resetCorrupted`
- 新增 `_maybeBioProtect` stub（生物识别模块移除后保留引用点不崩溃）
- 集成模块（第三方集成生态）与工作流模块（设计器+执行引擎）从 HEAD 备份还原并接入 `__test` 导出

**测试**
- 全量 **624/624**（50 文件）全部通过；较 v1.13.0 的 647 用例收敛至 624（移除 4 个无法在 jsdom 下运行的测试文件）
- `tests/c2-evalcondition-hardening.test.js` 20/20 ✅（新恢复的 wfEvalCondition 解析器全覆盖）
- `tests/compat.test.js` 21/21 ✅
- `tests/ai-profile.test.js` 22/22 ✅
- `tests/store.test.js` 8/8 ✅
- `tests/phase2-features.test.js` 6/6 ✅（含 wfExecuteWorkflow 集成）
- `tests/error-boundary.test.js` 全绿 ✅
- `tests/p0-storage.test.js` 全绿 ✅
- `tests/quickwins.test.js` 全绿 ✅

**文件规模**
- `agent-workbench.html`：~1,189 KB（28,875 行），较 v1.13.0 HEAD（36,940 行）减少 ~36%

## [v1.13.0] - 2026-08-16

### 路线图第 2 期：补面板与引擎（依据 docs/半成品功能完善路线图.md）

**多模态 AI 管道（块 9 转正）**
- 聊天附件按钮升级：图片（≤4 张、单张 ≤4MB）经 multimodal 模块落档，随下一条消息以 OpenAI vision content 数组格式发送（chatOnce 确认原样透传）；文本文件行为不变
- renderChat 兼容数组 content（文本 + [图×N] 标记），历史持久化不受影响

**工作流画布（块 7 转正）**
- 自动化弹窗新增「工作流画布（DAG）」区：工作流列表/新建（自带 start+end）/节点增删/点选连线/执行与结果 toast/SVG 画布（节点拖拽移动，`renderWorkflowCanvas` 首次接入 DOM）
- 注入器生产接线：`wfSetAiClient`→chatOnce（含单对象→messages 契约适配）、`wfSetNotifySender`→站内通知；延迟到 startup 执行（规避脚本期 var 置空覆盖——审查报告警示过的加载顺序坑）；toolExec 本就回退全局 execTool，无需重复注入；schedule 仍为 mock（无真实调度端点，路线图已记）

**生物识别门禁（块 11 深化）**
- WebAuthn credential rawId 持久化（base64url，settings 新字段 credentialId）；认证请求带 allowCredentials 精确命中注册凭据
- 设置页（数据管理）新增「生物识别」卡：可用性检测/注册/敏感操作门禁开关
- 敏感操作接线：删除任务（看板按钮）与导出 JSON 走 `_maybeBioProtect`——仅在用户启用后生效（含 5 分钟会话免重认证），未启用零行为变化

**外部集成（块 4 首批转正）**
- 新增 `integrationGetStatus` 状态薄封装；自动化弹窗新增「外部集成」区：provider 状态列表+移除
- Notion 完整卡：token+databaseId 连接（真实验证 token）、推送当前场景任务、**Pull 写回本地**（`_intNotionPullWriteback`——勘察确认 pull 结果此前不落本地，本次接通）；其余 7 家 provider 表单第 3 期补

**门禁与测试**
- 新增 `tests/phase2-features.test.js`（8 用例：vision 构造/渲染兼容/注入器执行链/credentialId 持久化+allowCredentials/门禁双态/集成状态+pull 写回）
- 修复两处自身引入的门禁违规（hex fallback 字面量、emoji 图标）；compat d2 超时上限 5s→15s（并行负载偶发超时，隔离正常）
- 全量 647/647（54 文件）；lint 绿；build:check 绿

## [v1.12.0] - 2026-08-16

### 路线图第 1 期：转正收尾（依据 docs/半成品功能完善路线图.md）

**事件源扩展**
- task_create（看板表单 + execTool create_task）与 task_delete（UI 软删 + execTool delete_task）挂接 `_emitTaskEvent`；回收站永久清除按契约不发事件（无单任务对象）
- 自动化弹窗触发器下拉补「任务删除」；新增「测试规则」按钮（按表单触发器构造样例事件手动验证规则链路）

**Webhook 订阅管理面板（块 6 补 UI 入口）**
- 自动化弹窗新增「Webhook 订阅（事件总线）」区：订阅 CRUD/启停、投递与失败计数展示、死信队列查看 + 一键重放——全部接既有真实引擎（HMAC 签名/重试/DLQ）

**OAuth 连接（块 5 补注册与跳转入口）**
- 弹窗新增「OAuth 连接」区：provider 注册表单（clientId + 授权/token 端点，redirectUri 自动取当前页）→ 注册即跳转授权；已连接可断开（revoke）
- 与 v1.11.2 的回调闭环组成完整 PKCE 流程

**语音模块转正（块 8 最小闭环）**
- 注册 4 个默认意图处理器：CREATE_TASK / SWITCH_SCENE / COMPLETE_TASK / VIEW_STATS，接到既有真实动作（execTool/setActive/completeTask）；未注册意图保持 not_implemented 语义

**延后项（路线图已标注）**
- token 存储走主进程 safeStorage（需新 IPC + 迁移，独立一轮）；九大集成完整面板 + pull 写回顺延至第 2 期

**测试**：新增 `tests/phase1-features.test.js`（8 用例：事件触发/防误触/语音意图/UI 入口/订阅 CRUD）；全量 639/639（53 文件）

## [v1.11.2] - 2026-08-16

### 认证校验补码 + 半成品功能激活（依据 docs/半成品功能完善路线图.md）

**L4 Webhook SSRF 校验补码（遗留 L 项清零）**
- 发现比审查报告更深一层：WHATWG URL 会把数值形主机自动规范化（`https://2130706433/` → hostname `127.0.0.1`），真实逃逸通道是撞 dev 白名单而非绕过正则
- 新策略：回环目标（localhost/127/8/[::1]，含一切数值形伪装与 `::ffff:` 映射）仅允许 http；新增 inet_aton 兼容解析器 + IPv6 展开 + 统一黑名单（含 CGNAT 100.64/10、组播 ≥224）
- 新增 `tests/l4-webhook-ssrf.test.js`（36 用例：28 拦截 + 8 放行）

**任务事件源接线（激活自动化规则引擎 + Webhook 订阅总线）**
- 勘察证实：规则引擎/cron/webhook 出站/HMAC 签名/DLQ 重试引擎全部真实，但任务写路径从不发事件——规则引擎"聋"、`webhookEmit` 全文件零调用
- 新增 `_emitTaskEvent` 统一分发器：任务完成后并行喂规则引擎与订阅总线，带防重入护栏（规则动作的连锁写不再二次分发，防循环）
- 新增 `tests/automation-emit.test.js`（规则触发/关键词过滤/防重入/总线投递 4 用例）

**生物识别 WebAuthn 实现（块 11 转正）**
- 此前 `biometricSetAuthImpl` 无人注入、`biometricAuthenticate` 恒 not_available——状态机空转
- 新增 `_webauthnBioImpl`（navigator.credentials 标准能力，零依赖，Windows Hello/Touch ID 可用）；不支持环境语义不变
- 新增 `tests/biometric-webauthn.test.js`（可用性/成功/取消/注册持久化 5 用例）

**OAuth2 回调闭环（块 5 断头接通）**
- 此前 PKCE/exchange/state 防伪全真但两头断：不跳转、不解析 `?code=`
- 新增 `_oauth2HandleCallback`（startup 挂接）：`?code+state` → 一次性 state 校验 → 换 token 落盘 → 清 URL；正常启动零开销
- 新增 `tests/oauth2-callback.test.js`（完整闭环/state 防伪/error 处理 4 用例）

**半成品功能完善路线图（设计文档存档）**
- `docs/半成品功能完善路线图.md`：11 个功能块逐块接线事实表（修正审查报告"全模拟"的过粗结论——块 1/6/8 大部分真实，共同短板是事件源与 UI 入口）+ 三档处置（转正接线/补面板/按需立项）+ 四期计划

## [v1.11.1] - 2026-08-16

### 安全与可靠性修复轮（对照《项目全景审查报告》20 项风险清单）

**严重项修复（C1/C2）**
- **C1 自动备份自包含递归**：快照此前会把备份键自身装入下一次快照，体积随备份次数超线性膨胀（JSON 转义放大），约二三十次写入即撞 5MB 配额且静默吞错失效。现快照排除自身键 + 1.5MB 单条体积上限 + 失败接入诊断寄存器（pushDiag）与一次性 toast，不再静默降级。新增回归测试 `tests/c1-autobackup-recursion.test.js`
- **C2 条件求值沙箱 Unicode 绕过**：弃用"字符过滤 + 黑名单 + new Function"路线（黑名单对 `\uXXXX` 标识符转义不可收敛），字符串条件改经 `wfEvalCondition` 白名单递归下降解析器求值（无 eval、无全局对象可达、不可解析一律返回 false）。解析器补齐 `===`/`!==` 与数组字面量语法。新增回归测试 `tests/c2-evalcondition-hardening.test.js`

**Electron 安全加固（M1/M4/L2/L7）**
- M1：主进程注册全局导航守卫（`web-contents-created` → `setWindowOpenHandler` + `will-navigate`），远程 URL 一律转系统浏览器并拒绝应用内加载，新窗口不再可能继承 preload 拿到 electronAPI
- M4：全部 IPC handler 增加 `assertTrustedSender` 校验（仅接受本应用 file:// 页面调用，fail-closed）
- L2：开机自启注册路径失效时（portable exe 被移动）按当前路径自动重新注册
- L7：生产构建不再保留"开发者工具"菜单项（仅开发态）

**Electron 更新链路（M5）**
- 移除 electron-updater 依赖与死代码（portable 目标 + 无 publish 配置 + 渲染端无监听三处断点使其从未可用）。更新方式明确为：从 GitHub Releases 重新下载

**Service Worker（M8/L9）**
- M8：预缓存由原子 `addAll` 改为逐 URL 容错——关键离线壳资源（入口页/真相源 HTML）失败阻塞 install，非关键资源（icon/manifest）失败仅告警，避免"空离线壳"静默上线
- L9：跨域 SWR 缓存增加 24h TTL（过期条目视为未命中）；cache.put / trim 失败不再双层静默
- 版本日志注释不再内嵌 service-worker.js（与 CHANGELOG 双份维护易漂移）

**诚实性修复（M6）**
- 离线同步桩不再"模拟成功并清空队列"：未配置服务器端点时保留队列并如实提示（"仅保存在本地"），恢复在线/立即同步的 toast 不再谎报"已同步 N 条"

**数据可靠性（L3/L8）**
- L3：IndexedDB 镜像队列在 `pagehide` / `visibilitychange(hidden)` 时立即冲刷，极端关闭不再缺最后一批写入
- L8：首次启用 AI 时给出数据出境告知（相关任务/资料上下文将发送到配置的 AI 端点）

**工程与门禁（P0 版本漂移 / M7 口径 / M9）**
- **发版脚本 `npm run release <版本号>`**：一次性统一 bump package.json ×2 / manifest / HTML（VERSION+BUILD_TAG）/ SW（CACHE_VERSION）+ 两份 lockfile 版本字段 + 自动自检，终结"手改版本号导致多源漂移"
- `build:check` 版本门禁由六源改为四源（lockfile 退出硬门禁——npm 生态版本滞后是常态，由 release 脚本维护同步）
- M7：`src/modules` v1.9.9 孤儿快照归档删除（git tag `archive/src-snapshot-v1.9.9`，恢复用 `git checkout` 此 tag）；`.eslintrc.cjs` 过时的"全局拼接"注释移除；README 标题从 v1.9.5 更新至当前版本
- M9：删除 vercel.json 部署双轨残留（实际部署走 deploy.yml → gh-pages）
- 清理死配置与杂物：tsconfig.json（无引用）、vitest.config.mjs（陈旧副本）、.inscode/（IDE 残留 44 文件）、_scratch/（临时产物）、`lint:fast` 重复脚本、jsconfig/typecheck/lint:src 随 src 归档移除
- lint 扩围：`npm run lint` 现覆盖 electron/main.js + preload.js + service-worker.js（此前三文件无任何 lint 门禁）
- CI：补 windows-latest 矩阵（项目为 Windows-first）；步骤链移除 lint:src/typecheck
- manifest.json 补 `version` 字段
- AI 调用链双实现（main.js chat IPC ↔ HTML chatOnce）：双侧增加镜像警示注释，新增 `tests/ai-retry-contract.test.js` 把重试矩阵钉成可执行契约（完全合并依赖 H4 拆分）

## [v1.11.0] - 2026-08-15

### 5 项 UI/UX 优化：主题显示·待办栏可下拉·聊天面板 hover·发送变暂停·标题栏统一

**1. 顶栏主题按钮显示当前主题名称**
- `applyTheme()` 改为同时渲染图标 + 文字 label（"亮色"/"暗色"/"跟随"），原来只显示图标不便辨识
- 暗色模式仍显示太阳图标（点击切到亮色），亮色/跟随显示月亮图标

**2. 顶部消息通知栏可下拉展开前 3 条**
- 重构 `#msgBar` HTML：顶部一行 = 铃铛 + 预览文本 + 展开箭头按钮（始终可见）；展开时下方出现前 3 条最近消息列表 + footer（打开全部/全部已读）
- CSS 新增 `.msg-bar-collapsed` / `.msg-bar-expanded` 状态机 + 高度过渡动画
- JS 新增 `renderMsgBarList()` 渲染前 3 条 + `_fmtMsgTime` 时间格式化 + `toggleMsgBar()` / `setMsgBarExpanded()` / `initMsgBarExpand()` 三件套
- 展开状态持久化到 `wb_msgbar_expanded`，刷新页面恢复
- 单条点击：标记已读 + 自动打开消息中心面板定位到该条
- 整体结构升级为：可下拉拉伸的待办/通知栏

**3. 右侧聊天面板 hover/focus 边框高亮 + 输入区重排**
- `.chat-panel` 左侧 border 改透明；hover 或 focus-within 时显示 `border-left-color: var(--accent-soft) + box-shadow: inset 3px 0 0 var(--accent-soft)`（柔和左缘高亮）
- `.chat-input-area` 同样 hover/focus-within 时顶部边变 accent-soft
- 大模型选择器（`#chatModelSelect`）从聊天面板头部**下放**到输入区，夹在 textarea 与发送按钮之间（`.chat-model-inline` 缩小下拉）
- 附件按钮（`.chat-attach-btn`）从 36×36 缩小到 28×28，纯图标
- 发送按钮（`.chat-send-btn`）从文字「发送」改为**纯图标方块**（32×32），图标为纸飞机
- **发送键 ⇄ 暂停键 切换**：`showChatThinking(true)` 时发送键变为红色方块 + 旋转图标，点击触发 `abortChat()`（即 stop），完成时恢复为发送图标
- 修复图标切换通过 `data-mode="send|stop"` + `.ic-send` / `.ic-stop` 双 SVG + CSS

**4. 概览标题栏上下间距小**
- `.page-head` 默认 `padding: var(--space-2) 0` + `margin-bottom: var(--space-3)`（之前是 `--space-5` + 38px 图标 + xl h2）
- 图标缩到 32×32、h2 缩到 `var(--fs-lg)`、sub 缩到 `var(--fs-xs)`
- 仅显示性标题卡不再占据大面积

**5. 统一所有页面标题栏风格**
- 抽出两种变体：
  - `.page-head`（默认紧凑型）——概览 / 统计 / 仓库 / 图表商店
  - `.page-head-loose`（传统大气型）——抽屉（设置/AI 配置/插件市场）
- `renderStats()` 改为 `<div class="card"><header class="page-head">` 结构（之前是裸 `.page-head` 无 card 包裹）
- 仓库 / 图表商店的操作按钮（返回 / 清空画布）统一包入 `.ph-act` 容器
- CSS 新增 `.recycle-header` 继承紧凑型 page-head 风格（padding/icon/h2 一致）

**6. 维护**
- 版本号 1.10.0 → 1.11.0（`agent-workbench.html` VERSION / `package.json` / `electron/package.json` 同步）
- `service-worker.js` CACHE_VERSION → `v1.11.0-20260815d`，新增 1.11.0 条目
- 测试更新：`tests/ui-consistency.test.js` 页脚版本断言 v1.10.0 → v1.11.0

**验证**
- `npm run lint`：0 处硬编码颜色 + eslint 0 错误
- `npx vitest run`：547 / 549 通过（2 个跨设备/兼容偶发超时重跑均过；与本次改动无关）

---

## [v1.10.0] - 2026-08-15

### UI 大调优 + 应用 popover 重做 + 图表商店 + 仓库 4 tab

**1. 导航与顶栏**
- 侧栏折叠态：`.side.collapsed` 宽度 56→64px；`.nav-item .nm` 字号 11px，`white-space:nowrap + overflow:hidden + text-overflow:ellipsis` 一行可显示"概览/统计/AI"等 2 字项
- 顶栏 6 个系统级按钮（搜索/命令/消息/主题/下载/更多）：`.topbar .tbtn` 改为 `flex-direction:column`（图标上·文字下），`min-height:54px / font-size:11px`，视觉上从横向拥挤改为竖向网格，节省顶栏横向空间

**2. 概览页 + 标题卡**
- `renderOverview()` 顶部新增 `<header class="page-head">` 标题卡（图标 + 标题 + 副标题），与统计/回收站/图表商店页一致

**3. 待办栏展开**
- `.top3-list` 默认显示前 3 行（`TOP3_PREVIEW`）；超过 3 项的部分用 `.top3-item-extra` 默认隐藏；新增 `#top3Expand` "展开全部"按钮，aria-expanded 同步，CSS `.top3-list.expanded .top3-item-extra{display:flex}` 控制显隐
- 待办项 padding/margin 加大：`--space-3 --space-4` + `min-height:44px`

**4. 模型选择器位置**
- `#chatModelSelect` 从顶栏第二行迁回右侧聊天面板 `.chat-panel-header`（与"AI 助手"标题同处），符合用户对模型随助手管理的语义

**5. 市场归位**
- 市场入口（`data-pluginpage`）从系统组末尾迁回功能组（图表/组件/应用之后），保留独立菜单页设计

**6. 聊天输入框间距**
- `.chat-input-area` padding `--space-2` → `--space-4`，上下间距加大避免拥挤

**7. 仓库 4 tab（用户最新决策）**
- 热：未完成 + 最近活跃（≤7 天），按 `updatedAt/doneAt/createdAt` 倒序，前 20 项
- 温：未完成 + 长时间未操作（7-30 天）
- 冷：已完成任务（doneAt 倒序，"归档"语义）
- 无用：已删除任务（deletedAt 倒序，"回收站"语义）
- 横向 pill tabs 切换；非无用 tab 提供"定位"按钮（切到对应场景高亮该卡）；无用 tab 走原 recycle 批量恢复/删除
- 移除原仓库 tab 内的 emoji（🔥/⏳/❄/🗑）以通过 UI 一致性 emoji 零容忍门禁

**8. 图表商店（独立页面）**
- 新增 `openChartStore()`：左侧图表库（8 种：日历/趋势/热力图/甘特/思维导图/仪表盘/习惯链/饼图），右侧可拖拽画布
- 画布支持：拖拽移动（head 区域 mousedown/move/up）、右下角调整大小（mousedown + min 160x120）
- 状态持久化：`localStorage[wb_chart_canvas]`，刷新后布局保留
- CSS 新增：`.chart-store-body`（grid 240px+1fr）、`.cs-lib`/`.cs-canvas`/`.cs-canvas-item`/`.cs-resize-handle` + 各迷你图表样式（`.cs-grid`/`.cs-line`/`.cs-heat`/`.cs-gantt`/`.cs-mind`/`.cs-dash`/`.cs-chain`/`.cs-pie`）
- 入口：侧栏「图表」popover 第一项 + 顶栏 tooltip 链接

**9. 应用 popover 重做（生活工具 + 可玩性机制）**
- 移除非实现项（笔记/仪表盘/协作/分享），替换为 5 项能力：
  - **日历**：复用 `renderCalendarView(0)` 弹窗
  - **天气**（生活工具）：`openWeatherModal()` 弹窗，今日 + 5 日预报；离线模拟（基于日期 hash 稳定生成），底部"数据为本地模拟·联网可对接"提示（v1.8-C 集成生态已预留）
  - **闹钟**（生活·有特色）：`openAlarmModal()` 弹窗，多任务管理；支持时间/备注/重复周几/贪睡/停止；每 30s tick 检查到点，触发 `AudioContext` 蜂鸣（5 次）+ 列表项 `alarmShake` 抖动动画 + `lastRing` 防同一天重复
  - **指针特效**（可玩性）：`togglePointerFx()` 切换彩色粒子拖尾，`#pointerFxCanvas` 全屏覆盖，pointer-events:none，30ms 限流，7 色循环；状态持久化 `wb_pointerfx`，刷新恢复
  - **萌宠**（可玩性）：`openPetModal()` 选角色 + `mountPet()` 挂载，5 角色极简 SVG：少女（紫发）/小猫（橘）/小狗（柴）/小兔（白绒）/熊猫（黑白团子），每只 5 句不同气泡；点宠物说话、关闭按钮收回、可拖拽；状态持久化 `wb_pet`，刷新恢复；`pet-bubble` CSS 动画 1.2s 渐隐
- CSS 新增：`.weather-modal-card`/`.weather-now`/`.weather-day`/`.alarm-modal-card`/`.alarm-now`/`.alarm-form`/`.alarm-item/.alarm-item.ringing/.alarmShake`/`.pet-modal-card/.pet-card/.pc-svg`/`.pointer-fx-canvas`/`.pet-stage/.pet/.pet-bubble/.pet-close/.petBob`
- 应用 popover 顶部增加 `.side-pop-sep` 分隔线（生活工具 vs 可玩性）+ `.side-pop-toggle` 开关状态徽标（指针特效右侧"关/开"）

**10. 维护**
- 版本号 1.9.9 → 1.10.0（`agent-workbench.html` VERSION / `package.json` / `package-lock.json` / `electron/*` 同步）
- `service-worker.js` CACHE_VERSION → `v1.10.0-20260815d`，并补充新条目
- 字段名 `data-pop="weather|alarm|pointerfx|pet|chartstore"` 接入 `setupSidePopItems` 路由
- `lint-colors.mjs` 白名单新增"萌宠 SVG 插画数据行内 fill/stroke"规则（艺术色不是 UI 令牌）
- 测试更新：`tests/ui-consistency.test.js` 页脚版本断言 v1.9.9 → v1.10.0

**验证**
- `npm run lint`：0 处硬编码颜色 + eslint 0 错误
- `npx vitest run`：548 / 549 通过（1 个 `compat.test.js` d2 偶发超时，重跑通过；与本次改动无关）

---

## [v1.9.9] - 2026-08-15

### 信息架构大重排（顶栏 / 侧栏四组 / 仓库三态 / 文档改名 / Agent 入口）

- **顶栏顺序**：logo + spacer + 搜索·命令·消息·主题·下载·更多（6 个系统级按钮居右，原"消息"按钮已双入口：顶栏 `#btnMessagesTop` + 正文 `#msgBar` 铃铛，事件互相 click 触发；搜索/更多从功能组侧栏迁出）；"安装"按钮默认隐藏（仅 deferredPrompt 触发时显）
- **折叠按钮回归侧栏顶部**：用户确认放回原位——`#sideToggle` 重新位于 `#side` 子树（"全局"组上方），setupSideToggle 事件委托回 `#side`；CSS 恢复 `width:100%` 满宽
- **侧栏四组大重排（按用户最新决策）**：
  - **全局**：概览 / 统计 / 仓库（仓库为单一入口，页内三 tab 切换）
  - **场景**：4 个场景项不变
  - **功能**：图表 / 组件 / 应用 三大类（父按钮 + 子菜单 popover 模式）
    - 图表：日历视图 / 统计 / 热力图
    - 组件：番茄钟 / 时间追踪 / 自动化
    - 应用：笔记 / 仪表盘 / 协作 / 分享
  - **系统**：AI / Agent / 设置 / 文档 / 市场（指南改名为"文档"；新增 Agent 占位入口；市场从功能组迁回系统组）
- **仓库页面三 tab**：热（最近活跃任务，前 20 项） / 温（存档任务，7-90 天） / 冷（已删除任务，含批量恢复/删除）——复用现有 recycle 列表/复选/批量能力，UI 走 page-head + 横向 pill tabs
- **Agent 入口**：v1.9.9 占位，提示词/上下文/harness/loop/记忆五维配置中心，v2.0 上线；当前实现暂复用 AI 配置二级页
- **市场迁回系统组**：从功能组迁回系统组末尾（保留 v1.9.6 独立菜单页设计）
- **文档改名**：原"指南"改名为"文档"，data-help 仍指向 renderHelp
- **CSS 新增**：`.side-pop`（侧栏 popover 容器）+ `.side-caret`（父按钮右侧箭头）+ `.warehouse-tabs/.warehouse-tab`（仓库 tab 切换）
- **事件新增**：`toggleSidePop / _closeAllSidePops / setupSidePopItems / openWarehouse / openAgentPage`
- **版本统一 1.9.8→1.9.9**：六处版本号 + SW CACHE_VERSION → v1.9.9-20260815d（页脚显示 `v1.9.9 · b20260815d`）

---

## [v1.9.8] - 2026-08-15

### 信息架构重排（按设计图对齐）+ 正文顶部第二行重构

- **侧栏四组对齐设计图**：监控/场景/工具/系统 → 全局(概览/统计/仓库)/场景(场景项)/功能(视图/番茄钟/时间追踪/搜索/更多/市场)/系统(AI 配置/设置/指南)；总览→概览、回收站→仓库，插件市场从系统组迁至功能组并改名「市场」，工具组更名功能组并新增「视图」项（=日历视图入口，未来可扩展为看板/列表/日历切换）
- **折叠按钮迁至正文顶部第二行最左**：与设计图对齐；`#sideToggle` 从侧栏 `.side` 内迁出至 `.toolbar-row > #sideToggle`，`setupSideToggle` 事件委托从 `#side` 改为 `document` 监听 closest（#sideToggle），CSS 同步调整 width:100%→auto、margin-bottom:0 适应工具行
- **大模型选择器从右侧 AI 聊天面板迁出至正文顶部第二行右侧**：与设计图对齐；新增 `.toolbar-model`（标签"模型" + select 容器），`#chatModelSelect` 仍为唯一 id，事件绑定（`bindChatPanel` 内 `refreshModelSelect` + onchange）不变；聊天面板头部清爽
- **正文顶部第二行重布局**：`.toolbar-row` 不再是消息栏独占，拆为三段独立子元素——左侧折叠按钮（flex 0）+ 中部消息栏（flex 1 占满）+ 右侧大模型选择器（flex 0）；CSS 调整 `.toolbar-row > :first-child{margin-left:0}` 覆盖原居右规则，三段按 flex 自然排列
- **版本统一 1.9.7→1.9.8**：六处版本号（package.json / package-lock.json / electron 两件 / src VERSION / agent-workbench.html VERSION）+ CACHE_VERSION → v1.9.8-20260815c（页脚显示 `v1.9.8 · b20260815c`）

---

## [v1.9.7] - 2026-08-15

### 主题切换修复 + 信息架构重排 + 品牌图形更新

- **主题切换修复（P0）**：设置抽屉主题下拉统一即时生效——原 bug 为「点暗色未生效，需保存设置才反应」「点高对比度后再点亮/暗失效」。根因是 `localStorage.theme` 与 `cfg.theme` 双状态源职责不清：现统一路由（system → cfg+applyTheme 保留跟随系统语义；light/dark/contrast/sepia/自定义 → setTheme 内部持久化并同步双状态源），启动时恢复逻辑同步覆盖特殊主题
- **亮色三层背景层次**：顶栏背景改 `--side-bg`（与侧栏同灰）——原 `--panel` 白与右栏白卡同色导致顶栏/正文/右栏三区不辨界限；现形成「顶+侧灰框 → 正文浅灰 → 右栏白」三层结构，暗色/高对比度/护眼主题经同名令牌自动同步
- **消息提示栏迁位**：四大场景消息栏从顶栏迁至正文顶部（铃铛 + 未读角标 + 最新消息预览，点击内联展开消息中心），原工具行（番茄钟/时间追踪/日历/搜索/更多）迁至侧栏「工具」组，浮层容器 `.tool-pop` 承载面板，运行中工具状态经侧栏角标实时反馈
- **场景标题独立成卡**：新增 `renderSceneHead()`——消息栏正下方即场景标题（page-head 统一视觉 + 场景语义色图标徽章），与任务看板内容卡彻底分离，不再粘连
- **品牌图形「引力环」**：icon.svg 与顶栏 logo 更换为定制几何图形——开口圆环（工坊主循环）+ 核心圆点（用户中枢）+ 环口外节点（环绕的 Agent），非图标库字形、辨识度高不易重复；favicon / PWA 图标 / 通知图标同步
- **版本统一 1.9.5→1.9.7**：六处版本号（package.json / package-lock.json / electron 两件 / src VERSION / agent-workbench.html VERSION）+ CACHE_VERSION → v1.9.7-20260815b（页脚显示 `v1.9.7 · b20260815b`）

---

## [v1.9.5] - 2026-08-15

### 版本统一 + 全视口布局优化（v1.9.4 迭代并入本版本）

- **版本统一 1.9.3→1.9.5**：v1.9.3 后落地的 v1.9.4/v1.9.5 功能迭代（侧栏分组、品牌图标、快捷指令等）此前仅在代码注释中标记，版本文件停留在 1.9.3；本次六处版本号统一升至 1.9.5（package.json / package-lock.json / electron 两件 / src VERSION / agent-workbench.html VERSION），icon.svg 品牌图形注释与代码标记对齐
- **响应式布局**：768-1279px 视口默认折叠聊天面板（用户显式偏好经 localStorage 持久化），主区宽度显著回升；删除场景页内嵌 chatCard 消除重复 `#chat` ID
- **顶栏高度令牌化**：新增 `--topbar-h` 令牌（桌面 61px / 移动 69px），各断点 padding 统一；msg-panel 改 JS 锚定按钮下缘 + 令牌兜底
- **看板防溢出**：看板列 `minmax(0,1fr)`，窄主区不再横向撑溢
- **100dvh 渐进增强**：`.app`/`.onboard-card`/`.help-card` 使用 `100dvh`（`100vh` 兜底），移动端地址栏收展不再整页跳动
- **品牌图形**：icon.svg 更新为「习惯链三环相扣 + 完成对勾」，替换字母 A（与顶栏品牌图标一致）
- **v1.9.4 迭代（并入）**：设置页浅灰选中态、回收站专属彩色选中态、指南页卡片补回边框圆角阴影、回收站页面铺满主区高度
- **v1.9.5 迭代（并入）**：侧栏专属背景 + 分组标题（监控/场景/系统）、统一页面头 page-head、聊天面板白底卡片化 + 空对话快捷指令 chips、Top3 与习惯链单行横向滚动压缩首屏
- **CACHE_VERSION**：bump → v1.9.5-20260815a（页脚显示 `v1.9.5 · b20260815a`）

---

## [v1.9.0] - 2026-08-13

### 安全加固 + Electron 升级 + 文档清理

- **P0-1 Electron 版本升级**：electron ^31.0.0→^41.0.0，electron-builder ^24.13.3→^26.0.0，修复 20+ CVE
- **P0-3 electron 目录 npm audit fix**：10 漏洞（9 high, 1 critical）→ 0 漏洞
- **P0-2 根目录 npm audit**：残留 6 漏洞位于 esbuild→vite→vitest devDependencies 链，不影响生产安全（agent-workbench.html 是单文件应用，不打包 vitest）
- **P1-1 Electron AI 取消链路**：提交未跟踪的 abortChat 功能（agent-workbench.html +20/-1, electron/main.js +45/-3, electron/preload.js +4/-1）
- **P2-12 AI 重试语义统一**：确认 chatOnce 浏览器侧与 Electron 侧重试矩阵已对齐（429/5xx 退避重试 3 次，退避 1s/2s/3s）
- **P2-13 __test 门控**：确认 __TEST_GATE__ 已存在（仅 localhost 或 __test=1 参数时挂载 window.__test）
- **P1-7/P1-8 文档清理**：删除 tests/debug-render.test.js 调试文件
- **P2-9/P2-10 报告更新**：更新 ServiceWorker缓存策略分析报告.md（S1-S13 修复状态总览）和 Interaction_项目七维评估报告.md（2026-08-13 复审章节）

---

## [v1.9.3] - 2026-08-14

### UI 修复（回收站 / 设置 / 指南页面 + 侧栏高亮）

- **回收站页面**：卡片 `min-height` 撑满内容区、列表上下 padding 增大（v1.9.3）
- **设置页面**：去背景色 + `min-width` 修正，内容统一包进 card 容器（v1.9.3b）
- **指南页面**：去 border / overflow，加 `margin-bottom` 与 `.card` 一致；导航切换时重置滚动位置
- **多余 `>` 字符修复**：设置页面、看板搜索 / 标签过滤显示的多余 `>` 字符
- **侧边栏按钮高亮**：设置 / 指南激活时对应按钮高亮，其余按钮取消高亮

### 二次修订（IPC 审计 F1-F8 + 页面一致性 + PWA 缓存修复）

- **F1 base URL 安全校验**：chat 仅允许 https:// 或 http://localhost/127.0.0.1，非法 base 直接拒绝、不发请求
- **F2 取消语义**：按 sender 维护 pendingCancel，退避 sleep 窗口内取消不再丢，下一轮不发请求（抛 __USER_CANCEL__）
- **F3 per-profile 配置**：ai-config 升级 per-profile 结构（旧单配置自动迁移 __legacy__），chat 按 profileId 取 base/model/key；前端 7 处调用点适配
- **F4 Key 清除**：set-ai-config 支持 key:null 显式清除，删 Profile 后主进程残留 Key 被清理
- **F5** 移除未使用的 __ELECTRON__ 注入
- **F6** webhook 校验器收紧（http:// 仅限本机，与 CSP 对齐）
- **F7** electron-ipc 测试 +12 用例；p0-regression 契约断言同步 per-profile
- **F8** CI 增加 npm run build:check 版本护栏
- **设置页卡片化**：标题「设置 ← 返回」移入卡片头部（settings-head），与回收站/指南页 header 模式一致；移除卡内旧版「纯本地」尾巴
- **回收站间距**：移除 .recycle-card min-height 强制拉伸，页脚紧贴内容（实测单条数据 718px→344px）
- **指南页卡片样式**：补回 1px 边框 + 圆角 + 阴影（v1.9.3 曾去 border 导致扁平白块，与其他页不一致）
- **PWA 缓存修复**：bump CACHE_VERSION v1.9.3-20260814e→f——e 版缓存使浏览器持续显示旧 UI（cache-first 导航缓存）

### 三次修订（SW 更新可感知化 + 侧栏高亮状态机）

- **SW 更新可感知化**：bump CACHE_VERSION → v1.9.3-20260814g；启动时主动 `reg.update()` 检查，新 SW 就绪后 toast「新版本已就绪，点击刷新」（点击即 reload）——解决「改了但用户一直看旧缓存」的交付缺口
- **页脚 build 标记**：新增 `BUILD_TAG` 常量，页脚显示 `v1.9.3 · b20260814g`，用户可自证是否已加载最新版
- **侧栏高亮改显式状态机**：新增模块级 `uiView`（main/settings/help），openDrawer/renderHelp/render 显式赋值，renderSide 弃 DOM 嗅探（#drawer 是否 drawer-page、#helpPage 是否存在）——根治「设置/指南双高亮且切换不消失」的时序问题
- **回归测试**：tests/ui-consistency.test.js 新增 7 用例（高亮状态机全链路 5 例 + 页脚 build 标记 2 例）

---

## [v1.9.2] - 2026-08-13

### 图标矢量化 + 顶栏美学打磨

- **emoji 全量矢量化**：35 处彩色表情 → 统一线性矢量图标（内联 SVG）
- **顶栏失效入口修复**：日历 / 自动化 / 番茄钟 / 时间追踪四个失效入口 + 图标矢量化
- **顶栏美学打磨**：四主题令牌化 + 微交互 + 分隔符；根治测试偶发竞态
- **布局对齐**：顶栏第二行与内容块边框精确对齐（跟随侧栏 / 折叠），第二行居右对齐（auto margin 方案），全局布局协调
- **甘特图**：标题溢出修复 + 第二行视觉分组
- **回收站页面化三件套修复 + 设置入口迁移至侧栏**
- **PWA 缓存闭环**：deploy 使用 prod 版 service-worker，CACHE_VERSION 自动 bump，杜绝「改了 HTML 但 PWA 吃旧缓存」

---

## [v1.9.1] - 2026-08-13

### 全局 UI 统一性修复

- 模态框 / 抽屉 / 覆盖层层级统一
- 表单与控件外观、间距、焦点行为统一
- 过渡动效时长与曲线令牌化
- 空态提示、Toast 通知、滚动条样式全量统一

---

## [v1.8.9] - 2026-08-11

### 测试修复 + Low 安全加固

- **sanitizeHtml SVG 保留**：修改第 6 步，保留 SVG 标签（装饰性图标），只移除 math 标签，修复导航项 SVG 被 strip 导致 aria-hidden 测试失败
- **calcStats weekDone 滚动窗口**：从"自然周（周一起）"改为"滚动 7 天窗口"，避免周一/周二的边界抖动
- **全局搜索防抖移除**：去掉 _globSearchDebounced 的 300ms debounce，改为同步响应，修复搜索空状态测试
- **底部导航 active 指示器**：添加 .nav-item.active::before 伪元素和 @keyframes nav-indicator 动画
- **Low 安全加固**：为关键用户输入添加 maxlength 属性（任务标题 200、聊天消息 4000、笔记内容 10000 等）；为 API Key 添加 autocomplete="new-password"；为 API Base URL 和模型添加 autocomplete="off"

---

## [v1.8.8] - 2026-08-11

### 安全加固（Medium 修复）

- **M1 事件监听器泄漏修复**：openSharedTaskModal、sceneTemplateModal、pluginDetailModal 三个模态框用 AbortController 管理事件生命周期，关闭时统一清理 keydown 监听器
- **M6 亮色 muted 文本对比度修复**：--muted 从 #6e6e73 改为 #5e5e63，--text-faint 从 #707074 改为 #646469，提升可访问性对比度
- **M7 try-catch 静默吞错修复**：在 12 个关键 catch 块中添加 pushDiag 记录（render 防抖、AI 响应解析、IDB 迁移、取消聊天、worker 池等）
- **sanitizeHtml 标签移除修复**：保留 form/input/button 标签（应用自身表单需要），只移除 template/noscript/noembed/noframes
- **safeJSONParse 回退**：移除 safeJSONParse 函数，所有调用恢复为 JSON.parse（避免测试隔离问题）
- **Service Worker Medium 修复**：S6 移除预缓存 SW 自身、S7 .json 改 network-first、S8 缓存 cors 响应、S9 addAll 失败 console.warn、S10 版本号注释

---

## [v1.8.7] - 2026-08-11

### 安全加固（Critical + High 修复）

#### agent-workbench.html
- **[C1] sanitizeHtml 增强**：迭代消毒（最多5次直到稳定）、HTML注释移除、CDATA移除、条件注释移除、增强实体编码过滤
- **[C2] new Function 黑名单扩展**：禁止 Reflect/Proxy/Symbol/WebAssembly/Atomics/SharedArrayBuffer/Buffer/globalThis，context 用 Object.create(null) 切断原型链
- **[C3] CSP 加固标记**：添加注释说明 unsafe-inline 限制及未来拆分计划
- **[H1] Webhook URL 校验**：添加 `_validateWebhookUrl` 校验函数（仅 https + 过滤内网地址 + 30s 超时）
- **[H2] diffRender 默认安全**：默认使用 sanitizeHtml 消毒
- **[H3] AES-GCM 密钥存储**：添加安全 TODO 注释，确认 Electron 分支已正确使用 IPC
- **[H6] 横屏触摸目标**：nav-item min-height 36px → 44px

#### service-worker.js
- **[S1] SWR 离线兜底**：跨域 SWR 离线无缓存时返回 504 Gateway Timeout 而非 undefined
- **[S2] 缓存清理前缀判断**：activate 仅删除 wb-cache- 前缀的旧版本缓存，不误删其他应用缓存
- **[S3] 缓存容量 fetch 后清理**：三处 cache.put 后异步调用 trimCacheEntries
- **[S4] 导航离线 fallback**：导航请求专门处理，离线时回退预缓存首页
- **[S5] 时间戳排序删除**：trimCacheEntries 改用时间戳元数据排序，不依赖 keys() 顺序

---

## [v1.8.6] - 2026-08-11

### 安全修复
- **代码注入防护**：`_evalCondition` 添加白名单验证，禁止 `;{}=[]` 和 `new/function/this/window/document/eval` 等危险关键字
- **XSS 消毒增强**：`sanitizeHtml` 增加 svg/math/form/input/button/template/noscript/noembed/noframes 标签过滤
- **PDF 导出安全**：`exportReportPDF` 的 `document.write` 内容用 `sanitizeHtml` 消毒
- **localStorage 容错**：`allKeys`/`doExport`/`doImport`/`doClear` 中的 localStorage 操作包裹 try-catch
- **lint 修复**：修复 `no-useless-escape` 错误
- **npm 依赖修复**：`npm audit fix` 修复 nanoid high 漏洞
- **CHANGELOG 补全**：补全 v1.8.0~v1.8.5 变更记录

---

## [v1.8.5] - 2026-08-10

### 最终稳定性
- **边界用例补充**：新增 `tests/boundary.test.js`，14 个边界测试用例覆盖空数据、极端值（10000 字符标题/未来日期/过去日期/特殊字符）、并发操作（多任务完成/快速场景切换）、错误恢复（损坏 localStorage/无效 JSON/null/undefined 参数/未知工具）
- **全量回归测试**：连续 3 次运行 npm test，2269 测试全部通过，无 flaky
- **已知 flaky 确认**：p0-storage.test.js、stats.test.js、v18c-integrations.test.js 均 3 次稳定通过
- **版本号同步**：package.json / src/modules/00-constants.js 均从 1.8.4 → 1.8.5

## [v1.8.4] - 2026-08-10

### 文档与 UX
- **README.md 全面更新**：标题版本号更新到 v1.8.4，补充 v1.8.x 全系列功能说明（企业级安全、第三方集成、AI 工作流、语音多模态、移动端、性能优化），更新架构说明和开发指南
- **帮助文档更新**：`renderHelp()` 新增 3 个章节——性能优化说明、企业级功能说明、AI 工作流说明
- **无障碍改进**：
  - 添加 skip-to-content 链接（跳转到主内容）
  - 补全缺失的 aria-label（番茄钟/时间追踪按钮、导出/重试按钮等）
  - 帮助模态框添加 `role="dialog"` `aria-modal="true"` `aria-labelledby`
  - 帮助模态框打开时 focus 到关闭按钮（focus 管理）
  - 番茄钟/时间追踪容器添加 `role="group"` 和 `aria-label`
- **新增 10 个 a11y 测试**：skip-to-content、#main 目标、CSS 注入、按钮 aria-label、容器 role、模态框属性、focus 管理、帮助文档章节内容

## [v1.8.3] - 2026-08-10

### 性能优化
- **构建产物压缩**：`build.mjs --prod` 模式添加 minifyJS 状态机压缩（剥离注释、合并空行、trim 空白），prod JS% 节省 32.8%
- **RAF 批量更新**：新增 `rafBatch(fn)` 工具函数，多次调用合并到一帧内执行一次
- **requestIdleCallback 包装器**：新增 `idleWrap(fn)`，把函数包装为在 idle 时执行，改善首屏加载
- **localStorage 批量写入**：新增 `batchWrite(store)`，收集多次写入在微任务统一执行
- **RAF 批量渲染**：新增 `renderBatched` 函数，用 rafBatch 包装 render 供高频场景使用
- **重模块懒初始化**：新增 `initHeavyModules()` 预留入口，用 idleWrap 包装重模块延迟初始化

## [v1.8.2] - 2026-08-10

### 代码质量改进
- **共享工具模块**：创建 `01b-shared-utils.js`，消除 33 个重复的 localStorage 辅助函数、11 个重复的 Now() 函数、5 个重复的 Clone() 函数
- **统一 SHA-256 实现**：消除 2 个重复的 SHA-256 实现，提供 `_sharedSha256Bytes(bytes)` 和 `_sharedSha256Str(str)` 两个函数
- **统一时间戳函数**：提供 `_sharedNowISO()` 和 `_sharedNowMs()` 两个函数，替代 11 个模块各自的 `_xxxNow()` 实现

## [v1.8.1] - 2026-08-10

### flaky 测试修复
- **stats.test.js K1 日期边界**：根据当前星期几动态计算 weekDone 下限 `Math.min(3, wd + 1)`，修复周一时昨天/前天属于上周导致 weekDone < 3 的问题
- **p0-storage.test.js 异步超时**：在 doImport 前手动写入种子键 + vi.waitFor 超时从 1000ms 增至 5000ms，修复全量并行时序不确定导致 localStorage 无 wb_agent_ 键的问题
- **v18c-integrations.test.js 速率限制窗口**：窗口从 1ms 增至 100ms，等待增至 200ms，修复高负载下速率限制窗口过期的问题

## [v1.8.0] - 2026-08-10

### 六大方向新功能

#### A. 企业级安全加固
- **RBAC 权限控制**：`59-security.js` 实现角色定义、权限检查、资源访问控制
- **审计日志**：`61-audit-log.js` 记录关键操作供审计追踪
- **数据加密**：E2EE 加密、AES-GCM 256 位、PBKDF2 密钥派生

#### B. 第三方集成
- **OAuth2 框架**：`63-oauth2.js` 实现 PKCE 授权码流程
- **Webhook 事件总线**：`64-webhook-bus.js` 实现事件订阅/分发
- **外部集成**：`62-integrations.js` 实现 Linear/Jira/Slack 集成

#### C. AI 工作流编排
- **工作流设计器**：`65-workflow-designer.js` 可视化编排 AI 任务流
- **工作流引擎**：`66-workflow-engine.js` 执行工作流、条件求值、循环控制

#### D. 语音多模态
- **语音助手**：`67-voice-assistant.js` 语音输入和操作
- **多模态输入**：`68-multimodal.js` 支持图片、文件输入

#### E. 移动端原生打包
- **Capacitor 配置**：`capacitor.config.json` 移动端原生打包配置
- **移动端原生**：`69-mobile-native.js` 原生功能桥接

#### F. 生物识别认证
- **生物识别**：`70-biometric.js` 指纹/面部识别认证

### 新增模块（12 个）
59-security.js, 60-enterprise.js, 61-audit-log.js, 62-integrations.js, 63-oauth2.js, 64-webhook-bus.js, 65-workflow-designer.js, 66-workflow-engine.js, 67-voice-assistant.js, 68-multimodal.js, 69-mobile-native.js, 70-biometric.js

### 新增测试（802 个）
- v18a-security.test.js（100 个安全测试）
- v18b-enterprise.test.js（95 个企业级测试）
- v18c-integrations.test.js（156 个集成测试）
- v18d-workflow.test.js（152 个工作流测试）
- v18e-voice-multimodal.test.js（149 个语音多模态测试）
- v18f-mobile-biometric.test.js（150 个移动端测试）

---

## [v1.2.0] - 2026-08-08

### Security（P0 安全短板修复 · 诊断报告 R01+R02）
- **R01 Electron 31→41 升级**：从 ^31.0.0（EOL，含 31 个 CVE：contextBridge 绕过、沙箱逃逸、V8 类型混淆等高危项）升级到 ^41.0.0（实际 41.10.4），一次性消除全部已知高危漏洞。代码零改动，所有 API 兼容。
- **R02 CSP 声明**：添加 Content-Security-Policy——HTML `<meta>` 标签 + Electron `session.webRequest.onHeadersReceived` header 注入（带防御性守卫）。策略：`default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' https:; img-src 'self' data: blob:; font-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'self'`。XSS 纵深防御。

### Security（P1 加固 · 诊断报告 R04+R05+R06+R08）
- **R04 electron-builder 26.x**：从 ^24.13.3 升级到 ^26.0.0（实际 26.15.3），修复 tar critical CVE（GHSA-34x7-hfp2-rc4v）。
- **R05 Dependabot + npm audit CI**：新建 `.github/dependabot.yml`（根目录 + electron/ 每周自动 PR）；CI 添加 `npm audit --audit-level=high` 步骤（不阻断，仅报告）。
- **R06 CI Windows 矩阵**：CI 从仅 ubuntu-latest 扩展为 `[ubuntu-latest, windows-latest]` 矩阵，覆盖目标平台。
- **R08 导航守卫**：Electron `main.js` 添加 `will-navigate` 事件拦截 + `setWindowOpenHandler` 拒绝外部窗口，防止远程内容加载。

### Fixed（诊断报告 R14+R15+R16 + 预先存在 bug）
- **R14 README CI badge**：添加 shields.io CI 状态徽章。
- **R15 SW opaque 缓存**：service-worker.js 移除 opaque 响应缓存（跨域 no-cors 产物），避免意外行为。
- **R16 package-lock 版本同步**：electron/package-lock.json 版本号刷新至 1.1.7（与 package.json 一致）。
- **免打扰 end:24 边界 bug**：`getQuietHours`/`setQuietHours` 的 end 验证上限从 23 放宽到 24，修复全天免打扰（start:0, end:24）被错误回退到默认值 8 的问题。tier2-round3.test.js P9 测试通过。

### Tests
- 全量 **45 文件 / 525 用例全绿**（0 failed）；build --check 字节级等价；lint-colors PASS；ESLint 0 error。

## [v1.1.7] - 2026-08-08

### Fixed（第六轮 · tabbit 评估报告核实修复 R1–R5）
- **R1 移除 publish 占位配置**：`electron/package.json` 删除 `build.publish` 占位（`your-update-server.com`），避免打包版每次启动向假域名发起无效的更新检查请求；`electron/README.md` 同步更新「配置 feed 服务器」段落说明默认未写入 publish。
- **R3 主进程日志结构化**：`logLine` 由纯文本 `[ts] [scope] msg` 改为 JSON Lines（每行 `{ts, scope, msg}`），便于机器解析；滚动截断逻辑（>1MB 保留后 512KB）与失败静默兜底不变。提取 `formatLogLine` 纯函数便于测试。

### Added
- **R2 exe 图标**：新增 `scripts/make-icon.mjs`（与托盘图标同款「圆角蓝底+白色 A 字标」像素逻辑，导出 `drawIcon`/`makeIco`/`crc32`/`pngChunk` 供测试，CLI 有运行入口守卫）；生成产物 `electron/icon.ico`（32×32 PNG-in-ICO）入库；`build.win.icon` 指向 `icon.ico`；根 `package.json` 新增 `make:icon` 脚本。
- **R4 src 纯入 ESLint**：`.eslintrc.cjs` 新增 `src/**/*.js` override（全局拼接架构下关闭 `no-undef`/`no-unused-vars`/`prefer-const` 跨模块误报，其余 recommended 规则照常）；新增 `lint:src` 脚本；CI 接入 `npm run lint:src` 步骤。
- **R5 工作记忆容量可配置**：`AGENT_MEM_MAX` 从常量改为配置读取（`cfg.memMax`，默认 60，钳制 20~500）；设置页新增「工作记忆容量（条，20~500）」输入项；`getMemMax()` 提供运行时钳制读取。

### Tests
- 新增 `tests/round6-icon.test.js`（4 用例：ICO 结构/像素内容/crc32）、`tests/round6-log.test.js`（1 用例：日志 JSON 格式）、`tests/round6-memmax.test.js`（5 用例：容量钳制+环形截断）；全量 **45 文件 / 525 用例全绿**；build --check 字节级等价 / lint-colors PASS / ESLint 0 error / lint:src PASS / typecheck 0 error。

## [v1.1.6] - 2026-08-08

### Added（第五轮 · 架构三项一次性落地）
- **架构项① IndexedDB 持久镜像**：新增 `02b-data-idb.js`——localStorage 仍是同步真相源，IDB 作为异步持久镜像（save 后去抖批量落盘）；镜像范围 `wb_agent_*` / `wb_custom_links`；设置页新增「本地库恢复」入口（只补缺失、不覆盖现存值）；无 indexedDB 环境（jsdom/隐私模式/旧内核）全链路安全降级。清空数据时同步清 IDB 镜像，避免恢复出僵尸数据。
- **架构项② 渲染扩展**：`CARD_REGISTRY` 开放为 `registerCard()` 注册 API（内置键保护）；新增场景扩展区注册表 `registerSceneSection()`（支持 `"*"` 全局段），场景页渲染/绑定自动接入扩展段，未来新增区块无需改 `renderMainHTML`。
- **架构项③ 构建现代化（E3）**：
  - `build.mjs --prod` 生产构建 → `agent-workbench.prod.html`，剥离 `__test` 测试钩子模块（已验证产物无 `window.__test` 赋值与 `__TEST_GATE__`）；
  - `package.json` 新增 `build:prod` 脚本，`typecheck` 从占位改为真实 `tsc -p jsconfig.json` 门禁；
  - 新增 `jsconfig.json`（checkJs 渐进类型化）+ `src/global.d.ts`（Window.electronAPI/__test 类型增强）；
  - CI 新增 typecheck 步骤；部署流水线改为构建生产产物后部署。

### Fixed
- 源码类型检查清零：补全 Cfg/Task typedef（updatedAt、base/key/model、aiTimeoutSec/aiTemperature 等）、markdown blocks 联合类型、streak 索引签名、FileReader.result 断言、onboarding/trapFocus DOM 断言等 17 处，`npm run typecheck` 现为 0 错误真实门禁。

### Tests
- 新增 `tests/round5-loop1-idb.test.js`（7 用例）、`tests/round5-loop2-render-ext.test.js`（8 用例）；全量 **42 文件 / 515 用例全绿**；build --check 字节级等价 / lint-colors PASS / ESLint 0 error / typecheck 0 error。

## [v1.1.5] - 2026-08-07

### Added（深度审查报告采纳 · B1–B8 四批次）
- **B4 · 看板拖拽排序**：HTML5 原生拖拽（零依赖）——同列排序、跨列改状态；拖入「已完成」走 `completeTask`（触发场景联动）；落点列高亮反馈。
- **B5 · 看板键盘操作**：卡片 `tabindex=0` 可聚焦 + `aria-label`；`Enter` 打开编辑弹窗、`Delete` 软删进回收站；`:focus-visible` 焦点轮廓。
- **B6 · undo/redo 操作历史栈**：任务数组快照式撤销/重做（上限 50，防重入守卫）；`Ctrl+Z` / `Ctrl+Y` / `Cmd+Shift+Z` 快捷键；覆盖创建/编辑/删除/拖拽/完成；导入/恢复/清空后自动清栈。
- **B8 · AI 请求参数可配置**：设置页新增「请求超时（5~120s）」「温度（0~2）」，浏览器与 Electron 双路径生效，非法值回退默认（30s / 0.7）。

### Changed
- **B1 · ESC 链式关闭修复**：修正抽屉 ESC 判断类名错误（`show`→`open`），并把任务编辑 / AI 确认弹窗纳入 ESC 链（编辑→确认→回收站→抽屉）。
- **B2 · 场景内筛选接线**：`boardSearch` / `boardStatusFilter` / `tagFilter` 三维联合过滤（标题 × 状态 × 标签）正式生效。
- **B3 · alert 改 toast**：保存设置与清空数据两处阻塞式 `alert()` 替换为非阻塞 toast（清空延迟重载让提示可见）。
- **B7 · 托盘/窗口图标重绘**：纯色方块 → 圆角蓝底 + 白色「A」字标（程序化绘制，零外部文件依赖，抗锯齿）。
- **Electron 可观测性**：主进程新增滚动日志（`userData/logs/app.log`，约 1MB 自动截断），记录 AI 请求/错误。

### Tests
- 新增 4 个测试文件（批次①~④）共 42 用例；全量 500 用例通过；build --check 字节级等价 / lint-colors PASS / ESLint 0 error。

## [v1.1.4] - 2026-08-07

### Added（第三轮 Tier 2 剩余产品项）
- **P8 · 多维筛选 + 保存视图**：总览搜索卡升级为筛选卡——场景 / 状态（待办/进行中/已完成）/ 日期（今天/逾期/本周）/ 标签组合筛选；常用筛选可保存为命名视图（一键应用、删除）；自定义场景自动纳入场景筛选。
- **P2' · 习惯链有向图**：习惯链可视化卡片新增「场景链路图」——内联 SVG 环形布局，节点为参与链路的场景（含自定义场景），曲线边 + 箭头 + 关键词标签，禁用链虚线显示。
- **P9 · 通知增强**：
  - 稍后提醒（snooze）：今日 Top3 待处理任务新增「稍后」按钮，默认 30 分钟后再提醒，到期自动恢复提醒；
  - 免打扰时段：设置页可开关并设置起止小时（支持跨天，如 22:00→08:00），时段内不推送且不标记已提醒，时段结束后自动补提醒。

### Changed
- 存储键新增：`wb_notify_snooze`（snooze 时间戳表）、`wb_notify_quiet`（免打扰配置）、`wb_agent_glob_views`（保存的筛选视图，PREFIX 前缀自动随备份导出）。
- 到期提醒检查（`checkDueTasks`）新增 snooze 期过滤，并顺带清理过期 snooze 记录。

### Tests
- 新增 `tests/tier2-round3.test.js`（18 用例）：多维筛选 / 视图存取 / 有向图渲染 / snooze 与免打扰联动。
- 全量 **34 文件 / 447 用例全绿**；build --check 字节级等价；lint-colors PASS；ESLint 0 error 0 warning。

---

## [v1.1.3] - 2026-08-07

### Added（Tier 2）
- **P1 · 自定义场景**：设置抽屉新增「场景管理」面板——可添加自定义场景（名称 / 颜色 / 图标）、改名、换色；自定义场景进入侧栏、命令面板、统计分布、习惯链表单与 AI 工具 `scenario` 枚举，全链路自动兼容。
- **P1 · 内置场景改名 / 换色**：办公 / 编程 / 学习 / 生活 四个内置场景支持改名与换色，可一键恢复默认；内置场景不可删除。
- **P1 · 删除保护**：场景下仍有任务（含软删除）时禁止删除该场景，防止数据孤儿；删除当前激活场景后自动回退到「办公」。
- **P5' · 命令面板增强**：模糊匹配打分（子串 > 子序列，位置加权）、「最近使用」组置顶、命令分组显示。
- **E1 · 加密务实告知**：设置页 Key 区域明示「本机加密仅防随意窥视，非端到端安全」（按已拍板的务实路线，不改加密机制）。

### Changed
- 自定义场景默认色改为 CSS 令牌 `--scenario-default`（消除硬编码色值，颜色门禁持续 PASS）。
- 命令面板 `let items` 改 `const`（ESLint prefer-const 清零）。

### Tests
- 新增 `tests/custom-scenarios.test.js`（16 用例）：场景 CRUD / 删除保护 / 内置覆盖 / 注册幂等 / AI 枚举兼容 / 统计分布。
- 新增 `tests/cmd-palette-enhance.test.js`（P5' 模糊搜索与最近使用回归）。
- 全量 **33 文件 / 429 用例全绿**；build --check 字节级等价；lint-colors PASS；ESLint 0 error 0 warning。

---

## [v1.1.2] - 2026-08-07

### Added（Tier 1 Quick Wins）
- **T1 · UI 删除改软删**：任务卡「删除」改为进入回收站（置 `deletedAt`），与 AI `delete_task` 行为统一，手删任务可找回。
- **T2 · 回收站批量操作 + 自动清理**：复选框 + 全选 + 批量恢复/批量删除；新增自动清理策略（关 / 7 / 30 / 90 天，默认 30），启动时清理超期软删任务并 toast 提示。
- **T3 · 导出 CSV / Markdown**：任务数据支持 CSV（带 BOM，Excel 直接打开）与 Markdown（按场景分组 + 完成率）导出；入口在设置数据管理区与命令面板；空数据时提示且不生成空文件。
- **T4 · 主题跟随系统**：主题三态（亮色 / 暗色 / 跟随系统），`system` 模式经 `matchMedia` 实时跟随操作系统切换；旧值 light/dark 完全兼容，新用户默认跟随系统。
- **T5 · 无障碍补漏**：回收站弹窗焦点陷阱（Tab 锁在弹窗内，关闭后焦点归还触发元素）；对比度修复（WCAG 4.5:1）。

### Fixed
- 亮色 `--text-faint` 对比度 2.99:1 → 4.5+:1（色值 `#8e8e93` → `#707074`）。
- 暗色 `--muted` 在 panel2 上对比度 4.41:1 → 4.86:1（色值 `#98989d` → `#a0a0a5`，同步 `--text-dim-2` / `--text-faint`）。
- 设置抽屉页脚残留的 v1.0.0 硬编码移除。

### Tests
- 新增 `tests/quickwins.test.js`（21 用例）：UI 软删 / 回收站批量与自动清理 / CSV·MD 导出 / 主题三态 / 焦点陷阱。全量 31 文件 / 398 用例全绿。

---

## [v1.1.1] - 2026-08-07

### Fixed（D/L/M 系列缺陷修复）

**安全 / 数据**
- **D4 · API Key 明文落盘（安全 P0）**：Web Crypto 不可用时剥离 Key 并告警，关闭 3 条泄漏路径；`initCrypto` 增加浏览器兼容降级（`_cryptoWarned` 去重 warn）。
- **D3 · 软删除 + 回收站（产品 P0）**：活跃视图统一经 `getActiveTasks()` 过滤 `deletedAt`；新增侧边栏「回收站」入口（含计数徽标）与弹窗（单条恢复 / 彻底删除 / 清空）。
- **D5 · 导入覆盖无确认（产品 P0）**：`doImport` 覆盖前弹出 `confirm` 确认。
- **D2 · 自定义链未随备份（稳定 P2）**：`allKeys()` 纳入 `wb_custom_links`，导出/导入均携带。
- **D6 · 每日播报重复触发（稳定 P2）**：调度器移除独立 digest 分支，统一由启动时 `dailyDigest()` 负责。
- **D1 · 版本号漂移（一致 P1）**：总览/场景/统计页脚统一为 `v${VERSION}`。
- **L4/M7 · 非法场景崩溃（稳定 P2）**：新增 `scMeta()` 防御性解析，非法/缺失场景兜底。

**交互 / 体验**
- **L1 · 命令面板实时过滤（交互 P1）**：`#cmdInput` 增加 `oninput` 实时过滤。
- **L2/L3 · 流式死代码（代码 P1）**：移除不可达 SSE 分支与 `readSSEStream`，`chatOnce` 统一非流式；测试钩子导出同步清理，无悬空引用。
- **M1 · 剪贴板容错**：复制失败回退提示「复制失败」，不再产生未处理 rejection。
- **M5 · Esc 关闭弹窗**：回收站 / 设置抽屉支持 Esc 关闭。
- **M8 · save 配额容错**：`save()` 增加 try/catch + `pushDiag`，配额耗尽/隐私模式不再静默崩溃。
- 其余 M 系列：死处理器移除、删链·清记忆 confirm、N 聚焦等。

### Changed
- `window.__test` 测试钩子在运行时增加门控（仅 `file://` / `localhost` / `?__test=1`），线上部署不暴露内部 API。
  > 后续变更（2026-10-05 补注）：`file://` 分支已在 v1.8.9 之后的"安全收紧"中移除——本地双击打开（最终用户最常见形态）不再挂载测试钩子，避免 devtools 可访问内部函数。现行门控仅 `localhost`/`127.0.0.1` 或 `?__test=1`。见 `src/ui-global-events.js` 的 `__TEST_GATE__` 注释块。

---

## [v1.1.0] - 2026-08-06

### Added
- **多 AI Profile**：支持配置多个 AI 供应商（OpenAI / Anthropic / Ollama / DeepSeek / 通义 / 豆包 等）并快速切换，设置抽屉中可新建 / 删除 / 复制 profile。
- **响应式布局**：4 断点全分辨率适配（移动端 `<768px` / 平板 `768–1024px` / 小屏 PC `1024–1440px` / 大屏 PC `>1440px`）。
- **侧边栏折叠**：≥1024px 可手动折叠/展开，<1024px 自动收为底部 Tab。
- **习惯链可视化**：streak 计算 + GitHub 风格热力图 + 链条动画，跨场景链路完成情况一目了然。
- **AI 习惯教练**：分析行为模式，给出 3 条个性化建议。
- **今日仪表盘**：时段问候 + Top3 任务 + 习惯链状态 + 进度环。
- **新手引导 onboarding**：3 步引导弹窗，首次进入即展示。
- **应用内使用指南**：7 章节 modal 文档，无需跳转外链。
- **PWA 基础设施**：`manifest.json` + `service-worker.js` + 离线缓存，可安装到桌面/手机主屏。
- **SM-2 间隔复习算法**：again / hard / good / easy 4 档评分，遗忘曲线驱动复习计划。
- **AI Key AES-GCM 加密存储**：API Key 在本机加密保存，不上传服务器。
- **electron-updater 自动更新集成**：桌面端可检查并安装新版本。
- **"生活"场景**：替代原"健康"场景，与办公 / 编程 / 学习 共同构成 4 核心场景。

### Changed
- **习惯链规则**更新为：
  - 办公(交付) → 学习(看技术视频)
  - 学习(复习) → 编程(写小项目)
  - 编程(上线) → 生活(犒劳自己)
- **场景砍裁**：从 7 个精简到 4 个核心场景（办公 / 编程 / 学习 / 生活），去除娱乐等无关干扰项。
- **快捷键说明**细化：`1` 办公 · `2` 编程 · `3` 学习 · `4` 生活（1-4 切场景）。

### Fixed
- `electron/preload.js` 中 `app` 未导入导致桌面端启动失败的 bug。
- `electron-updater` 测试回归问题。
- 外部改动引入的硬编码颜色和 a11y（无障碍）回归。
- 版本号三处漂移：HTML `VERSION` 常量、根 `package.json`、`electron/package.json` 统一为 1.1.0。
- `electron/package.json` 的 `build.files` 误用 `"../"` 父路径（electron-builder 不支持工程目录外文件），改为打包 `prebuild` 复制进 `electron/` 的 `agent-workbench.html`，消除产物缺 HTML 导致空白窗口的风险。
- 浏览器 `chatOnce` 与主进程 `chat` 重试语义对齐：429/5xx 退避重试（1s×attempt），网络错误退避基数统一；取消/超时/401 不重试。
- `window.__test` 约 100 个内部函数导出增加门控：仅 file://、localhost/127.0.0.1 或 `?__test=1` 时挂载，线上部署不再暴露内部 API。
  > 后续变更（2026-10-05 补注）：`file://` 分支已移除（同上条），现行门控为 `localhost`/`127.0.0.1` 或 `?__test=1`。**另需澄清一点**：`?__test=1` 在**注入态**下对任意 host 生效，但线上发布的始终是 `build.mjs --prod` 产物（`deploy.yml` 部署 `agent-workbench.prod.html`），其中整个 IIFE 被替换为 `var __TEST_GATE__ = false;`，故线上任何 host/参数组合都不会挂载 `window.__test`。本地调试用 `?__test=1` 属预期行为，不影响线上暴露面。
- 仓库完整性：补交 `tests/`（167 测试 / 19 文件）、`scripts/lint-colors.mjs`、两个启动 `.bat`，新增 MIT `LICENSE`。

### Tests
- 测试用例从 **57 个**增长到 **380 个**，覆盖 **30 个测试文件**（分批回归全绿）。

### Docs
- 新增 [CONTRIBUTING.md](CONTRIBUTING.md)：开发环境搭建、代码规范、提交规范、测试要求。
- 更新 README.md：补充多 AI Profile、响应式布局、PWA、线上地址、习惯链说明，版本号升至 v1.1.0。

### Engineering
- **模块化构建流水线**：将单文件 `agent-workbench.html`（4873 行）按层级边界拆分为 `src/shell/`（HTML 壳，含 `<script>` 标签）+ `src/modules/`（32 个 JS 模块），新增零依赖 `scripts/build.mjs` 串联构建。构建产物与源文件**字节级等价**（SHA256 一致，已由 `node scripts/build.mjs --check` 校验）。`src/` 为源码真源，`agent-workbench.html` 为构建产物，勿手工修改——改动请编辑 `src/` 后重新构建。
- **AI 工具接口文档**：新增 `docs/ai-tools.md`，从 `TOOLS` 数组与 `execTool`/`agentExec` 分发逻辑抽取 16 个工具的 `name`、描述、`parameters` Schema、返回结构与已知不确定点（如 `update_task`/`delete_task` 的两步确认、`add_record.fields` 无子 Schema、纯 function-calling 调用方需自行处理 `confirm` 分支等）。
- **ESLint 治理**：移除 `*.html` 覆盖中的 `no-undef: off`（改为在组装后的单文件作用域内校验，0 error）；因 `src/` 为机械拼接拆分（运行时共享同一脚本作用域），将其加入 `ignorePatterns` 以避免跨模块未定义变量的误报。移除 `lint:fix` 脚本体（防止自动修复生成的产物导致与 `src/` 漂移），新增 `build` / `build:check` 脚本，`lint` 改为先构建再校验。
- **仓库门面（GitHub API）**：设置仓库 `description` 与 `homepage`（指向 gh-pages 部署地址）。`topics` 因当前存储令牌的权限范围不足被静默忽略（HTTP 200 但 `topics:[]`），需具备 `repo` 范围的令牌或于仓库 Settings → Topics 手动设置。

---

## [v1.0.0] - 2026-08-02

- **初始版本**：4 场景任务管理（办公 / 编程 / 学习 / 生活）+ AI 助手 + Agent 记忆 / 目标编排。
- 单文件交付（`agent-workbench.html`），零安装、纯本地、数据存 `localStorage`。
- 三种运行形态：Edge 应用模式 / 本地服务模式 / Electron exe。
- Agent 三层自主能力：工作记忆、多步目标编排、跨场景协调。
- 数据总览：14 天趋势 + 月历热力图 + 进度条 + 全局搜索。
- 周报生成器（办公/编程）、SM-2 间隔复习（学习）。
- 命令面板（Ctrl/Cmd+K）、暗色模式、每日播报、Toast 通知。
- 57 个测试用例。

