# 前端页面大规模测试 —— 覆盖审计报告

- **审计对象**：`F:\Nexus\Interaction`「Agent 工坊」（单文件 HTML + PWA + Electron 双形态）
- **审计人**：测试工程师（严过关）
- **审计性质**：只读审计（未改动任何 `src/`、`tests/` 文件；未执行带 post 钩子的 npm 脚本）
- **回答的问题**：> 前端页面的大规模测试，有解决吗？有规划吗？

---

## 0. 执行摘要（结论先行）

**结论：有明显缺口，但远未到「严重不足」。当前测试质量高、深度够；缺的是「按页面逐一覆盖」这一维度。**

| 维度 | 实测数据 |
|------|----------|
| jsdom 单测 | 147 文件 / 1707 用例（静态 `it()/test()`）/ 4496 条 `expect()` |
| Playwright e2e | 14 spec / 72 个 `test()` 块 / 3 个 project（desktop·tablet·mobile）/ 296 条 `expect()` |
| 视觉回归快照 | `toHaveScreenshot`/`toMatchSnapshot` 命中 **0** —— 无像素基线 |
| 边栏页面（17 个） | **8 个有专属业务断言（深）**，**9 个仅渲染+通用不变量（薄）**，**0 个零渲染** |
| 最薄页面 | 商店 / 场景联动 / 时间轴 / 说明（2 个只有 e2e i18n 路由渲染、1 个只渲染+高亮、1 个无任何 e2e） |

**对用户问题的直接回答**：
- 「有没有解决」→ **部分解决**。测试是**按功能主题切片**的，不是按页面切片的。9/17 页面没有一条「打开这个页面、断言它内容对」的用例。
- 「有没有规划」→ **没有面向页面级的规划**（现有 spec 与页面不是 1:1）。本报告第 8 节给出可落地的分阶段方案。

**质量侧的重要正面结论（用数据说话）**：
- e2e 断言强度 **高**：逐条读过 14 个 spec，未发现「只断言元素存在」「只断言不报错」的弱用例；全部做了真实业务结果/契约断言（如 Notion 真发 POST 并校验 body、Linear 的 HTTP 200+errors[] 判失败、云同步 PUT 形状契约、对比度数值下限）。
- 历史「假守护」（把守卫整段删掉用例照样绿的弱断言）**已被修复并被注释留痕**（见 §6.1），扫描未发现同类现存问题。
- 无 `.only`、无不带条件的 `skip/xfail`、无快照篡改（§6.3）。

---

## 1. 方法与取证命令（可复现）

> 所有数字均由命令实测得出，非推断。执行目录 `F:\Nexus\Interaction`。

```bash
# 规模
wc -l src/*.js | tail -1                 # 42625 行 / 35 模块
wc -l tests/*.test.js | tail -1          # 24922 行 / 147 文件
ls tests/e2e/*.spec.js | wc -l           # 14
# 页面导航取证（e2e 实际到达哪些页面）
grep -rn 'setActive("' tests/e2e/*.spec.js
grep -rn 'data-sc="\|data-menu="' tests/e2e/*.spec.js
# jsdom 层页面渲染取证
grep -rl "renderOverview\|renderTasksPage\|renderStorePage\|renderChainPage\|renderTimelinePage\|renderHelp" tests/*.test.js
# 边栏 17 项清单来源
grep -n "const ORDER" src/core.js                 # src/core.js:8223
sed -n '76,159p' src/render-widgets.js            # _buildSideMenu()
# 用例数（脚本）
node _probe/qaaudit/count-e2e.cjs
node _probe/qaaudit/count-unit.cjs
node _probe/qaaudit/mod-coverage.cjs              # 模块函数名 reach
# 视觉回归
grep -rl "toHaveScreenshot\|toMatchSnapshot" tests/ | wc -l   # 0
```

---

## 2. 边栏 17 项 × 覆盖层级 矩阵

**层级定义**
- **A（深）**：有测试渲染该页面 + 对其**专属业务内容/交互/契约**断言。
- **B（薄）**：页面被渲染过，但只断言**通用不变量**（无横向溢出 / i18n 节点已翻译 / 主题令牌 / 布局几何），无专属业务断言。
- **C（零）**：任何测试都未渲染过该页面。

| # | 边栏选项 | 类型 | e2e 真点导航 | e2e 业务断言 | jsdom 渲染 | jsdom 业务断言 | 层级 |
|---|----------|------|:---:|:---:|:---:|:---:|:---:|
| 1 | 主页（overview） | 功能页 | ✅ | ✅ 系统概况卡→统计页 | ✅ | ✅ renderOverview/stats | **A** |
| 2 | 任务（tasks） | 功能页 | ✅（ics 导入路径） | ⚠️ 仅日历子视图 | ❌ | ❌ | **A⁻（部分）** |
| 3 | 场景联动（chainpage） | 功能页 | ⚠️ 仅 i18n 路由 | ❌ | ❌ | ❌ | **B** |
| 4 | 时间轴（timeline） | 功能页 | ⚠️ 仅 i18n 路由 | ❌ | ❌ | ❌ | **B** |
| 5 | 办公（office） | 场景 | ✅ | ✅ 建/完成任务的看板断言 | ✅ | ✅ 26× setActive | **A** |
| 6 | 数据（data） | 场景 | ⚠️ 仅布局 setActive | ❌ | ⚠️ 卡片逻辑 | ⚠️ | **B** |
| 7 | 设计（design） | 场景 | ⚠️ 仅布局 setActive | ❌ | ⚠️ | ⚠️ | **B** |
| 8 | 学习（study） | 场景 | ⚠️ 布局 + smoke 可见 | ❌ | ⚠️ 2× setActive | ⚠️ | **B** |
| 9 | 编程（code） | 场景 | ✅ | ✅ 建编程任务 + code_run | ⚠️ | ⚠️ | **A** |
| 10 | 生活（life） | 场景 | ⚠️ 仅布局 setActive | ❌ | ⚠️ | ⚠️ | **B** |
| 11 | 健康（health） | 场景 | ⚠️ 仅布局 setActive | ❌ | ⚠️ health-plugin | ⚠️ | **B** |
| 12 | AI | 功能区 | ✅ | ✅ 填配置 + mock 对话 | ✅ | ✅ #cfgEnabled | **A** |
| 13 | 工具箱（toolbox） | 功能区 | ✅ | ✅ 23 个工具页冒烟 | ✅ | ✅ toolbox-entries | **A** |
| 14 | 商店（store） | 功能区 | ⚠️ 仅 i18n 路由 | ❌ | ❌ | ❌ | **B（最薄）** |
| 15 | 回收站（recycle） | 功能区 | ⚠️ 仅 i18n 路由 | ❌ | ✅ | ✅ openRecycle 批量操作 | **A** |
| 16 | 设置（settings） | 系统区 | ✅（#btnGear 抽屉） | ✅ 加习惯链 + 导出 | ✅ | ✅ openDrawer | **A** |
| 17 | 说明（help） | 系统区 | ❌ 无 | ❌ | ⚠️ renderHelp 仅高亮 | ❌ | **B（最薄）** |

**计数**：A = 8（含 1 个部分），B = 9，**C = 0**。

> 边栏 17 项来源：`src/core.js:8223`（ORDER 7 场景）+ `src/render-widgets.js:76 _buildSideMenu()`（总览 4 + AI 1 + 工具 2 + 系统 3）= 4+7+1+2+3 = **17**。
> ⚠️ 注意：`SCENARIOS` 里还有一个 `finance`（`src/core.js:8207`，v3.5.2 预置场景）。它的**定义常驻**，但不在**内置** `ORDER`（`src/core.js:8223` 只有 7 项）中 —— 只有理财插件启用后，`registerCustomScenarios()`（`src/data-links.js:152-153`）才把它 `push` 进运行时 `ORDER` 并出现在侧栏。`tests/e2e/theme-matrix.spec.js:188` 与 `tests/e2e/viewport.spec.js:314,365` 把 `finance` 硬编码进 `SCENES`：二者走 `evaluate(setActive)` / 读令牌（**非**点侧栏），故 `SCENARIOS.finance` 在、可渲染，**不会假红也不会静默跳过**；真实问题是**场景清单存在三处来源未收敛**（见 §6.5）。

---

## 3. 零覆盖 / 薄覆盖清单

### 3.1 真正零渲染的页面：**0 个**
每个边栏选项都能在某个测试里被渲染过一次（最少的「说明」也有一条 renderHelp 高亮用例）。所以「有页面完全没人碰过」这个最坏情形**不存在**。

### 3.2 无任何专属业务断言的页面：**9 个**（这才是真正的缺口）
| 页面 | 现有唯一覆盖 | 风险 |
|------|--------------|------|
| **商店（store）** | `tests/e2e/i18n.spec.js:79` 路由里含 `store`，仅做「[data-i18n] 节点已翻译」断言 | 安装/禁用/导入插件按钮、插件列表渲染断裂无测试可抓 |
| **场景联动（chainpage）** | 同上（i18n 路由）| 联动规则列表、可视化管理页渲染断裂无测试可抓 |
| **时间轴（timeline）** | 同上（i18n 路由）| 14 天泳道回放页渲染断裂无测试可抓 |
| **说明（help）** | `tests/ui-consistency.test.js:141` 的 `renderHelp()` 仅断言**侧栏高亮**，未断言说明页内容 | 说明页内容/分享链接生成断裂无测试可抓 |
| 数据 / 设计 / 学习 / 生活 / 健康（5 场景） | `tests/e2e/viewport.spec.js` 仅 setActive + **布局几何**不变量 | 场景专属表单/卡片的**渲染与提交**无页面级断言（卡片逻辑有零散单测） |

> 关键区分：**「逻辑被覆盖」≠「页面被覆盖」**。例如场景联动：`chain.test.js`/`habit-chain.test.js`/`chain-edit.test.js` 把联动**逻辑**测得很透，但没有一条用例去**渲染 chainpage 并断言它的界面** —— 逻辑对、页面接线断（入口实死/id 改名）仍会静默漏网。这正是本仓历史教训的类型（见 §6.1）。

---

## 4. 源模块级覆盖（35 模块）

> 指标口径：模块的**顶层 `function` 名**是否在任一 `tests/*.test.js` 中出现（函数名 reach，非行覆盖率——见说明）。脚本：`_probe/qaaudit/mod-coverage.cjs`。

| 模块 | 顶层函数 | 被测试引用 | reach |
|------|:---:|:---:|:---:|
| ui-ge-pomodoro | 18 | 0 | 0% |
| ui-hotkeys | 0* | 0 | 0% |
| ui-ge-notes | 34 | 1 | 3% |
| ui-ge-theme | 33 | 2 | 6% |
| ui-guide | 13 | 1 | 8% |
| ui-global-events | 47 | 4 | 9% |
| ui-scene-bind | 23 | 3 | 13% |
| util-perf | 13 | 2 | 15% |
| render-scene-sub | 28 | 6 | 21% |
| render-scene-main | 35 | 8 | 23% |
| render-overview | 83 | 20 | 24% |
| ai-loop | 8 | 2 | 25% |
| …（中段略）… | | | 30%~70% |
| data-rw | 35 | 25 | 71% |
| ui-daily | 17 | 16 | 94% |
| ui-ge-plugins | 1 | 1 | 100% |

\* ui-hotkeys 的 0 是**解析假象**：它把逻辑挂在 `document.addEventListener("keydown", …)` 里，没有顶层函数声明，故 reach 指标不适用（其快捷键行为由 `openCmd`/`undoTasks` 等被调用函数间接覆盖）。

**解读（重要）**：reach 是「函数名是否被测试提到」的**代理指标**，不等于真实覆盖率；单文件 HTML 架构下 vitest v8 **无法插桩**（`vitest.config.js` 已注明覆盖恒为 0%），所以行覆盖率拿不到。但 reach 能有效暴露**「整块逻辑无人提及」**：
- **零提及 / 近零提及且确无功能的**：`util-perf` 的 `virtualScrollRange`、`createDiffRenderer`、`computeDOMDiff`（虚拟滚动/差分渲染整套 **0 引用**）；`ai-loop` 的 `parseNaturalLanguageAction` / `executeNaturalLanguageAction` / `parseDecomposeIntent` / `parseCodeGenIntent`（自然语言**动作执行**分支 0 引用）。
- **大量函数无人提及但功能有间接覆盖的**：`ui-global-events`（47 个函数仅 4 个被点名，但它是巨型事件绑定聚合块，很多行为由集成测试经公开函数覆盖）、`render-overview`（83→20）、`render-widgets`（140→51）。

**方法学坦白**：本仓测试经 `loadApp()` 加载**整份 HTML**，不按模块 import，所以「模块级覆盖率」在工程上并不是本仓的组织单位；我用的是**文件名 + 顶层函数名**双指标。真正可靠的模块级结论应由**运行时插桩**给出——建议在 `src` 拆分完成后补 coverage 阈值（CI 注释里已列为待办，见 `.github/workflows/ci.yml:44-46`）。

---

## 5. 测试规模与结构

| 层 | 文件 | 用例 | 断言 | 说明 |
|----|:---:|:---:|:---:|------|
| Unit/Integration（jsdom） | 147 | 1707 | 4496 | 断言密度 2.63/例 |
| E2E（Playwright） | 14 spec | 72 `test()` 块 | 296 | 断言密度 4.1/例；3 project 展开后 CI 实跑约 82~90 例 |
| 静态门禁（构建期） | — | — | — | CI 见 §5.1 |

**e2e 主题切片（14 个 spec）**：corrupt-data-boot / form-controls / i18n / ics-import-render / idb-image-backup / integration-push / mobile / notify-hook / rag-hybrid / sync-contract / theme-matrix / toolbox / viewport / workflow。
→ 都是**按功能主题**切，**不是按页面**切；唯一例外是 **`toolbox.spec.js`（对 23 个工具页做逐页冒烟）** —— 它是本仓「页面级批量测试」的**现成范式**，可直接复用到边栏 17 项（见 §8）。

### 5.1 CI 门禁清单（`.github/workflows/ci.yml`）
- `test` job：`check:source-state` → `src:check` → `check:modules`（循环/逆层依赖）→ `check:ai-tools-doc` → `npm test`（vitest + posttest 抽回）→ `build:check` → `lint`（eslint + lint-colors + lint-xss + lint-css-structure）→ `lint:layers` → `lint:tokens`（悬空令牌）→ `lint:empty-catch`（静默失败）→ `check:pwa-icons` → `pet:check`。
- `server-verify` job：7 个真实 HTTP 验证脚本（认证绕过 / 越权 / 契约 / 增量协议）。
- `e2e` job：`npm run e2e`（timeout 10 min）。

> **门禁缺口**：CI 里**没有任何**针对「emoji 作图标 / 紫粉渐变 / AI 模板味」的自动化门禁（见 §7）。

---

## 6. 测试质量审计（不只数量）

### 6.1 「假守护」弱断言：历史有、现已修 / 未见现存同类
本仓著名教训是「只查 `status===404`，把守卫删掉用例照样绿」。逐文件读过 14 个 e2e spec，**未发现现存弱断言**，且历史假守护均已在注释里留痕并修复：

- `tests/e2e/workflow.spec.js:132-142`：第 6 步「查看统计」曾长期空转 —— 旧写法查询 `#side .nav-item[data-sc="stats"]`（该入口 v3.6.6 已下线）**恒为 null → 每轮静默跳过断言**；v3.7.91 改为点主页系统概况卡的 `.sys-ov-item[data-act="stats"]` 并断言 `.stats-cards`。**这是本仓「假守护」的真实标本，已修复。**
- `tests/e2e/integration-push.spec.js:84-88`：作者主动记录「第一版用 `toBeVisible` 判断可见可点」，但设置抽屉是 `transform` 平移到屏外，`toBeVisible` 仍算可见 → 改成 `toBeInViewport`。**已修复且注释警示后来人。**
- `tests/e2e/workflow.spec.js:27-37`：切场景从「等 `#taskForm`」（每场景都有、无区分力）改成「等 nav 拿到 active 令牌」+ 重试块自愈。**已修复。**

**剩余轻微弱断言（advisory，非阻断）**：
- `tests/e2e/workflow.spec.js:313`：`expect(navCount).toBeGreaterThanOrEqual(6)` —— 实际有 17 个 nav 项，下限 6 偏松，漏掉「侧栏少渲染若干项」的一半情形。
- `tests/e2e/theme-matrix.spec.js:251`：`if (await nav.count()) { …断言… }` —— 若侧栏项缺失则静默跳过这几条断言，属轻微空转绿风险（但同用例前面已断言 `#side` 可见，风险低）。

### 6.2 jsdom「空转绿」风险：低
本仓已知教训是「mock localStorage 必须打 `Storage.prototype`，直接给 `win.localStorage.setItem` 赋值会**静默失效**」。扫描结果：**该反模式未被误用**，且被显式记为规范：
- `tests/empty-catch-slice4.test.js:28-31` 明文记录坑并给出正解（打 prototype）；`cloud-sync-stage1/5/10`、`empty-catch-slice1/4/5/9` 均用 `Storage.prototype` 打桩。
- `tests/ai-interaction-fixes.test.js:188`、`tests/webdav-sync.test.js:57` 用的是 `Object.defineProperty(win, "localStorage", …)`（重定义 window 上的属性），随后**有一句断言验证生效**（如 `:189 expect(win.allKeys())…`），非空转。

### 6.3 反作弊门（P0 级）—— 通过
| 检测项 | 结果 | 证据 |
|--------|:---:|------|
| 测试文件被删 | ✅ 无 | `git status` 仅 2 个未跟踪 lint 脚本，无 `tests/` 删除 |
| 保留测试断言数下降 | ✅ 无 | 审计为只读，无开发前后 diff |
| 新增 skip / xfail / .only | ✅ 无 | `grep -rn "\.only(" tests/` = 0；jsdom 无带条件外 skip/xfail |
| 硬编码实现输出做断言 | ✅ 未见 | 抽查断言值均来自 Spec/契约（如 Notion body、云同步 `_deviceMeta.deviceId`、对比度数值） |
| 测试框架/阈值篡改 | ✅ 无 | `vitest.config.js`/`playwright.config.js` 未被本次触碰；CI 未降阈值 |

> 说明：常规反作弊门对比「开发前 vs 开发后」，本次为**只读审计（无代码改动）**，故该项以「当前完整性事实核查」替代 diff 对比。

### 6.4 flaky 风险：**固定 sleep 是主要共性**
- **固定 `waitForTimeout` 共 47 处**（e2e）：form-controls 11、integration-push 9、notify-hook 7、i18n 6、toolbox 5、viewport 4、workflow 4、sync-contract 1。
  - 本仓已知根因：`nav-item` 由 `renderSide()` **异步注入**，`loadApp` 后 0 个、约 30ms 后才 17 个；固定 sleep 等待会随机器负载抖动 → flaky。
  - 多数 sleep 前有 `waitForSelector/waitForFunction` 兜底（如 `form-controls` 每轮后 sleep 是为「面板关闭 settle」），风险中等；但 `i18n.spec.js` 大量 `waitForTimeout(1200/1500)` 属典型固定等待，**建议改为 `waitForFunction` 判别式等待**。
- `sync-contract.spec.js` 曾有「声明默认跳过但未接 `test.skip`」的口径不一致，已修复（`:21-23`）。
- `playwright.config.js:30`：CI 下 `retries: 2`、本地 0 —— CI 吸收抖动属合理；但要警惕 retries 掩盖真实 flaky。

### 6.5 场景清单三处来源未收敛（数据一致性，advisory）
- 本仓「场景清单」实际有三处来源：
  1. **内置** `ORDER`：`src/core.js:8223`（7 项 `office/data/design/study/code/life/health`）；
  2. **运行时可变** `ORDER`：`src/data-links.js:142` 先剔除上一轮非内置项，`:147`（自定义场景）、`:152-153`（预置插件场景，如 `finance`）再 `push` 回 `ORDER`；
  3. **`SCENARIOS`**：`src/core.js:8098` 起定义，含**常驻**的预置场景 `finance`（`:8207`，v3.5.2）—— 定义一直在 `SCENARIOS` 里，只是默认不进内置 `ORDER`。
- 影响：`tests/e2e/theme-matrix.spec.js:188`、`tests/e2e/viewport.spec.js:314,365` 把 `finance` 硬编码进 `SCENES`。二者均走 `page.evaluate(setActive)` / 读 `--sc-*` 令牌（**不点侧栏**），因此 `SCENARIOS.finance` 存在、能正常渲染，**既不假红也不静默跳过**。真实风险是**清单漂移**：一旦场景增删，硬编码列表会与内置 `ORDER` 失同步（viewport 第一组即漏了 `code`）。
- 建议：e2e 场景键统一从**单一事实来源**读取（导出「内置 `ORDER` + 运行时 `ORDER`」的只读快照），不要各 spec 各自硬编码（advisory）。
- **口径更正**：本报告初稿曾写「`finance` 是默认不存在的场景 / 测试引用了不存在的场景」——**不准确**。据 `src/core.js:8207`、`src/data-links.js:130-158` 逐行核对后已按上述修正（感谢架构侧指正）。

---

## 7. P0 视觉规则扫描（团队级硬规则）

> 规则：禁止 emoji 作功能图标 / 禁止紫粉渐变 / 禁止 AI 模板味空话。
> 扫描命令见下；**注意：CI 无任何自动化门禁守这三条**（§5.1）。

### 7.1 紫→粉渐变：**通过**
```
grep -rniP 'purple.*pink|7C3AED.*(A855F7|EC4899)|from-purple.*to-pink' src/*.js   → 0
grep -niP 'linear-gradient[^;]*(purple|pink)|7C3AED.*EC4899' agent-workbench.html  → 0
```

### 7.2 emoji / 符号字形：**存在，需前端裁决（见 blocking）**
全量命中分布（`src/*.js`）：`⚠`51、`✓`24、`✕`21、`✗`12、`☰`5、`❌`4、`✅`4、`✿`3、`⚙`3、`♥`2、`★`2、`✦`1。

**必须区分两类**：
- **作为「功能控件图标」的字形（落在 P0 规则字面范围内，需打回前端）**：
  - `src/ui-ge-calendar.js:59` 与 `:138`：`<button class="cal-nav" data-ics-open …>☰</button>` —— **真实按钮的图标用 `☰` 字形**，非项目图标库 SVG。
  - `src/render-overview.js:585`：`⚙ 编辑布局` / `✓ 完成编辑` —— 按钮**以字形充当图标/标签前缀**。
  （对照：侧栏 17 项图标走 `UI_ICONS.*` 的 **SVG**，是合规的正面样板；问题只在个别控件。）
- **作为「状态/装饰文本」的字形（不属功能图标，判定为 advisory）**：`⚠️ 未开始`、`✓/✗/✕` 输出状态前缀、`★` 评分、`♥/✦/✿` 宠物特效/气泡（kaomoji）等，均为文案内标记，非导航/按钮图标。

### 7.3 AI 模板味空话：**1 处 borderline**
- `src/core.js:4145`：`"onboard.welcome": "Welcome to Agent Workshop"` —— 命中「Welcome to」模式，但它是**引导页对应用自身名称的欢迎语**（EN 词典），非「Welcome to our amazing platform」式空洞占位。判定 **advisory**（建议文案更具产品指向），不阻断。
- `Lorem ipsum` / `Sign up today`：**0 命中**。

---

## 8. 规划：给「前端页面大规模测试」的可落地方案

### 8.1 时长基线
- 现状：14 spec / 72 `test()` 块 / 3 project，**本机全量约 4.1 min**，CI `e2e` job 约 3 min（timeout 10 min）。CI 日志实测「82 passed」。
- 单例成本估算：246s ÷ ~90 例 ≈ **2.7 s/例**（含每例新起 chromium 加载单文件的开销）。

### 8.2 新增量级估算
| 阶段 | 新增 spec | 新增用例（3 project 展开估计） | 增量时长 | 新 e2e 总量 |
|------|:---:|:---:|:---:|:---:|
| 阶段 1：边栏 17 项冒烟 | 1 | ~4（desktop 单跑） | +约 20–30 s | ~4.5 min |
| 阶段 2：4 薄页 + 任务页业务 | 5 | ~20（desktop） | +约 55 s | ~5.5 min |
| 阶段 3：5 场景业务 | 5 | ~15–20（desktop + 2·tablet） | +约 60–90 s | ~7 min |

**结论：三阶段全做完，e2e 从 ~4.1 min 涨到 ~7 min 量级，仍在 10 min CI timeout 内。** 关键前提是**新页面 spec 只在 desktop 项目跑**（页面业务与视口无关，无需三视口倍增）。

### 8.3 不拖垮 CI 的分层 / 分片策略
1. **视口隔离**：新增页面 spec 全部 desktop-only（复用 `theme-matrix`/`toolbox` 的 `testIgnore` 先例），避免 ×3 倍时长。
2. **两层门禁**：
   - **PR 层次级门禁（keep fast）**：`workflow + mobile + 阶段 1 冒烟` → 目标 < 3 min。
   - **main / nightly 全量层**：其余深度 spec。
   - 实现方式：给深度 spec 打 `@full` 标签，`grep-invert` 或 `testIgnore` 分流；或在 `ci.yml` 与 `deploy.yml` 各跑不同 `-g`。
3. **分片**：`playwright.config.js` 现为 `workers:1`（串行、可预测）。可用 `--shard=1/2`（CI job matrix）并行两片，**保持每片 workers:1**，既不加并发抖动又能缩短墙钟。
4. **慢用例标注**：`toolbox/viewport` 已是耗时大头，新增页面 spec 若超过 20s 单例就 `test.setTimeout` 显式标注并在注释说明依据（沿用本仓习惯）。
5. **禁新增固定 sleep**：新 spec 一律用 `waitForSelector/waitForFunction/expect.poll`（本仓 `switchScene` 已有判别式等待范式），不再引入 `waitForTimeout`。

### 8.4 分阶段方案（第 1 阶段补最大缺口）

**阶段 1（最高性价比，先做）——「边栏 17 项冒烟」spec**
- 新增 `tests/e2e/nav-pages-smoke.spec.js`，**照搬 `toolbox.spec.js` 的范式**：运行时从边栏清单（或硬编码 17 项键）遍历。
- 每项断言：
  1. 点击对应 nav 项 → 该项拿到 `active`；
  2. 主区渲染出**该页专属根容器**（见下表）且非空；
  3. 页面至少有 1 个可交互控件（挡「空壳」）；
  4. 打开过程 `pageerror` / `console.error` = 0；
  5. 渲染 HTML 无模板残渣（`${` / `[object Object]` / `undefined` / `NaN`）；
  6. 375px 窄屏无横向溢出。
- **验收标准**：17/17 页面渲染成功、0 pageerror、每页 ≥1 控件；至少抓出 §3.2 里任一新断裂则为有效。成本 ~20–30 s。

**阶段 2（补齐最薄的 4 页 + 任务页）**
| 新 spec | 测什么 |
|---------|--------|
| `store-page.spec.js` | 商店页插件列表渲染、安装/禁用/导入按钮可达且变更列表 |
| `chainpage.spec.js` | 场景联动页规则列表渲染、增/删规则反映到 UI |
| `timeline.spec.js` | 时间轴页泳道渲染、有事件时非空、空态正确 |
| `help-page.spec.js` | 说明页内容渲染、分享链接生成、锚点可达 |
| `tasks-page.spec.js` | 任务页各视图 tab 切换（列表/看板/日历）、空态/加载态 |

**阶段 3（5 个薄场景加深）**
| 新 spec | 测什么 |
|---------|--------|
| `scene-data.spec.js` / `scene-design.spec.js` / `scene-study.spec.js` / `scene-life.spec.js` / `scene-health.spec.js` | 每场景：专属表单渲染 → 填一条记录 → 提交 → 卡片/表格出现该条（与 `workflow.spec.js` 对 office/code 的做法对齐） |

### 8.5 顺带补齐（低成本、高价值）
- **视觉回归基线**：当前 `toHaveScreenshot` = 0，属真实缺口，但**像素基线需与 CI 同环境**生成（Linux+同版本 chromium），本机无法出基线。建议：在 CI 上首跑生成基线（`--update-snapshots`），只对**少数稳定页面**（侧栏、设置抽屉、看板卡）做基线，避免字体噪点导致 flaky。
- **P0 视觉规则门禁**：把「emoji 作图标 / 紫粉渐变 / AI 模板味」写成 `scripts/lint-visual-rules.mjs` 接入 `npm run lint`（当前 CI 无此门禁，三条规则全靠人肉）。
- **场景清单单一来源**：让 e2e 从统一来源（内置 `ORDER` + 运行时 `ORDER` 快照）取场景键，消除 `finance` 这类「硬编码清单与 `ORDER` 漂移」的不一致（`finance` 定义本身存在，见 §6.5）。

---

## 9. 生产就绪评级（审计视角，7 维 × 3 档）

| 维度 | 档位 | 证据 |
|------|:---:|------|
| 测试 + 回归 | **Silver** | 单测深、e2e 强、有回归留痕；但 9/17 页面无业务断言、无视觉基线，未达 Gold |
| 契约 | **Gold** | Notion/Linear Jira/云同步/ICS/IDB 均有真实契约 e2e；server 侧 7 脚本进 CI |
| 安全 | **Silver** | XSS/空 catch/越权/SSRF 有 lint 与 server 脚本；缺前端 emoji/视觉规则门禁 |
| 无障碍 | **Silver** | e2e 有 44px 触控、对比度、focus trap 断言；无系统化 a11y 扫描 |
| 性能 | **Bronze** | 无性能门禁（无 k6/Lighthouse），仅 `util-perf` 代码存在但零测试 |
| 可观测 | **Silver** | 有诊断缓冲 `getDiag`/diag 断言；无 SLO 门禁 |
| 发布安全 | **Gold** | CI 源态/一致性/模块图/文档漂移门禁齐全，e2e 门禁强制 |
| **总档（取最低）** | **Bronze** | 由「性能」维度拉低（无任何性能测试） |

---

## 10. RoleVerdict（结构化判定）

```
verdict: fail   # 针对「前端页面级大规模测试」这一明确验收目标：未达成，缺 9/17 页面业务覆盖
blocking:
  - 违反项: 边栏 17 项中 9 项无任何「页面级业务断言」（仅渲染/仅通用不变量）
    证据: 见本报告 §2 矩阵与 §3.2 清单
      · 商店  tests/e2e/i18n.spec.js:79（仅路由渲染） + 无 jsdom 页面测试
      · 场景联动 tests/e2e/i18n.spec.js:79 + renderChainPage 在 tests/ 0 引用
      · 时间轴 tests/e2e/i18n.spec.js:79 + renderTimelinePage 在 tests/ 0 引用
      · 说明  tests/ui-consistency.test.js:141（仅高亮断言）
    期望: 按 §8.4 阶段 1/2 补页面级 spec，做到「打开页面→断言专属内容/交互」
  - 违反项: 【团队 P0 视觉规则】emoji/符号字形被用作功能控件图标
    证据:
      · src/ui-ge-calendar.js:59  按钮图标 = "☰" 字形（非图标库 SVG）
      · src/ui-ge-calendar.js:138 同上
      · src/render-overview.js:585 按钮以 "⚙"/"✓" 字形作图标/标签前缀
    期望: 替换为项目锁定图标库的 SVG（对照侧栏 UI_ICONS.* 的合规样板）
advisory:
  - 视觉回归快照为 0（tests/ 命中 0），建议在 CI 生成少量稳定页面基线
  - 固定 waitForTimeout 47 处（i18n.spec.js 6 处最典型），建议改判别式等待以消 flaky
  - e2e 场景清单三处来源未收敛：硬编码 finance（theme-matrix.spec.js:188 / viewport.spec.js:314,365）与内置 ORDER(core.js:8223) 漂移；finance 定义存在(core.js:8207)但仅插件启用时进 ORDER(data-links.js:152-153)。建议统一只读快照
  - workflow.spec.js:313 navCount 下限 6 偏松（实际 17）；theme-matrix.spec.js:251 条件守卫可能静默跳过断言
  - util-perf 虚拟滚动/差分渲染整套函数名 0 引用；ai-loop 自然语言「动作执行」分支 0 引用
  - 无 emoji/紫粉/AI 模板的自动化门禁（CI 未守三条 P0 规则），建议加 scripts/lint-visual-rules.mjs
  - src/core.js:4145 "Welcome to Agent Workshop" 文案 borderline（引导页欢迎语）
  - 性能维度无任何测试（k6/Lighthouse 均缺）
evidence:
  - 命令: node _probe/qaaudit/count-e2e.cjs → 14 spec / 72 test() 块
  - 命令: node _probe/qaaudit/count-unit.cjs → 147 文件 / 1707 用例
  - 命令: node _probe/qaaudit/mod-coverage.cjs → 模块函数名 reach 表（§4）
  - 命令: grep -rl "toHaveScreenshot\|toMatchSnapshot" tests/ | wc -l → 0
  - 文件: src/core.js:8223（ORDER 7 场景）、src/render-widgets.js:76（_buildSideMenu 17 项）
  - 文件: .github/workflows/ci.yml:14-71 / :104-121（门禁与 e2e 接线）
  - 文件: tests/e2e/toolbox.spec.js:26-84（页面批量冒烟范式，可直接复用）
  - 文件: tests/e2e/workflow.spec.js:132-142（历史「假守护」标本，已修复）
```

---

## 附录 A：改动影响分析（本次为只读审计，无代码改动，模板留档）

```markdown
### 本次改动范围
- 修改文件：无（仅新增 docs/evaluation-test-coverage.md 与 _probe/qaaudit/*.cjs 分析脚本）
- 改动类型：只读审计

### 下游影响面
- 直接调用方：无（未触碰 src/ 或 tests/）
- 共享状态影响：无
- 旧行为风险面：无

### 回归测试优先级
- 不适用（未改产品代码）
```

## 附录 B：本报告使用的一次性脚本（均在 _probe/qaaudit，属 .gitignore）

- `count-e2e.cjs` —— 精确统计 e2e `test()` 块（排除 `test.describe/beforeAll/step` 误计）
- `count-unit.cjs` —— 统计 jsdom 文件数/用例数/describe 数
- `mod-coverage.cjs` —— 每个 src 模块顶层函数名在 jsdom 测试中的 reach

> 说明：脚本位于 `_probe/`（已在 `.gitignore`），不污染仓库；本次**未运行** `npm test`/`npm run lint`（其 pre/post 钩子会改写工作区 src/，会覆盖并行会话改动）。
