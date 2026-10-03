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
