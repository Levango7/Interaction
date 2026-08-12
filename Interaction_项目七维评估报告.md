# Interaction（Agent 工作台）项目七维评估报告

- **评估对象**：https://github.com/Levango7/Interaction（公开仓库，17 次提交，24 个被跟踪文件）
- **评估日期**：2026-08-06
- **评估方法**：浅克隆仓库全量代码，逐文件审阅核心交付物（`agent-workbench.html` 4765 行、`electron/main.js` 342 行、`service-worker.js` 155 行及全部配置/文档），并对照 README/CHANGELOG/CONTRIBUTING 的声明做一致性核验。

## 项目概览

单文件 SPA「Agent 工作台」：办公/编程/学习/生活四场景任务管理 + AI 助手（function-calling）+ 习惯链联动，localStorage 本地持久化，无后端；三种运行形态（Edge 应用模式 / 本地静态服务 / Electron 套壳）+ PWA 离线能力。工程化配置（ESLint/Prettier/Vitest/Playwright/tsconfig/vercel）齐全。

**仓库完整性关键事实**（影响后文多个维度）：

| 声明来源 | 声明内容 | 仓库实际 |
|---|---|---|
| CHANGELOG v1.1.0 | 167 个测试 / 19 个测试文件 | `tests/` 目录未提交 |
| package.json `lint` | `node scripts/lint-colors.mjs` | `scripts/` 目录未提交 |
| README 第一节 | 双击 `启动Agent工作台.bat` / `启动本地服务.bat` | 两个 .bat 均未提交 |
| README 第八节 | 版本 v1.1.0「与代码内 VERSION 常量一致」 | HTML 内 `VERSION = "1.0.0"`，两个 package.json 均为 1.0.0 |
| CONTRIBUTING 项目结构 | `tests/`、`scripts/`、`dist/` | 三者均不存在 |

结论：这是一个**以本地工作区为主、GitHub 仓库为发布快照**的项目，仓库快照不完整，新克隆者无法运行 `npm test` / `npm run lint`，README 的两个主入口启动器也拿不到。

---

## 一、产品设计

### 现状分析
- 定位清晰：个人单用户、本地优先的效率工具，四场景收拢知识工作主线 + 生活兜底，代码内显式声明 `MVP_SCOPE` 范围边界（防需求蔓延）。
- 差异化机制明确：习惯链（办公交付→学习充电→编程练手→生活犒赏）形成行为闭环；SM-2 间隔复习、周报生成器为场景深耕工具。
- 交互路径完整：Onboarding 三步引导 → 今日仪表盘（问候/Top3/进度环）→ 场景看板 → 命令面板（Ctrl/Cmd+K）+ 快捷键（1-4/G/N），移动端底部 Tab，4 断点响应式。
- 数据安全设计诚实：导出/导入/清空二次确认、30 条累计提醒备份、自动防抖备份快照。

### 合理性评价
- **优点**：场景砍裁（7→4）体现了克制的产品判断；「AI 操作与手动操作等价」（AI 工具与 UI 改写同一份数据）是简洁且自洽的设计；README 对已知限制（换浏览器丢数据、无账号体系）的坦白程度高于同类个人项目。
- **不足**：
  1. **仓库名与产品名脱节**：仓库叫 `Interaction`，产品是「Agent 工作台」，GitHub 无 description/topics，外部可发现性几乎为零。
  2. **AI 工具定位任务靠标题关键词、重名取第一条**——对用户是不可预期的行为，属于产品层面的可靠性缺陷（README 已自述但未给出规避交互）。
  3. 无数据同步/多端方案，PWA 安装到手机后与桌面数据天然割裂，与「可安装到手机主屏」的宣传存在预期落差。

### 改进建议
1. 仓库更名或至少在 description/topics/README 首屏建立「Interaction = Agent 工作台」的等价关系。
2. AI 工具调用涉及删除/修改时，对「重名取第一条」增加二次确认或列表选择交互。
3. README 明确「PWA 移动端与桌面端数据不互通」的预期管理。

---

## 二、整体架构

### 现状分析
- **单文件单体架构是刻意约束而非失控**：UI/CSS/JS/数据全内联于 `agent-workbench.html`，换来零安装、三形态零漂移（三处加载同一份 HTML）。这是合理的架构 trade-off，且被执行得很彻底。
- 文件内部有**显式分层标注**：Bootstrap（诊断）→ Data → Util（Markdown）→ Crypto → AI → Chain（习惯链）→ Render → UI（交互），共 8 层 60+ 个分节横幅。
- Electron 壳（main/preload）与 PWA（SW/manifest）是物理分离的独立模块，边界干净。
- 状态管理为自研轻量 `createStore`（订阅 + 防抖触发 render），配有「全局状态契约」注释（禁止 render 层直读 `active/chats/_cfgCache`）。

### 合理性评价
- **优点**：分层意图在同类单文件项目中罕见地清晰；`resolveHtml()` 多候选路径解析、单实例锁、`window.__ELECTRON__` 环境探测等细节处理成熟；状态契约的注释即规约。
- **不足**：
  1. **分层靠注释自觉，无模块强制**：约 190 个函数全部挂在全局作用域（单个 3900 行 `<script>`），任何函数可跨层调用任何函数，契约不可强制执行。
  2. **Store 被 live-get 架空**：`taskStore.get = () => load(...)` 每次直读 localStorage，订阅/快照语义名存实亡——为兼容测试和导入场景做的妥协，但削弱了状态层的存在意义。
  3. **可扩展性天花板可见**：功能继续增长（CHANGELOG 显示一个版本加了 10+ 特性）会持续推高单文件复杂度；当前最长函数 103 行尚可控，但趋势需要对冲手段。

### 改进建议
1. 引入「源码模块化 + 构建时拼合单文件」的流水线（`src/*.js` → build 产出单 HTML），保住交付形态、获得真实模块边界。
2. 短期不动结构的话，至少用 ESLint `no-restricted-syntax` 或自定义规则把「render 层禁直读 localStorage」从注释升级为强制检查。

---

## 三、模块划分

### 现状分析
- 物理模块：应用本体 / Electron 壳 / Service Worker / 工程化配置，四类各司其职，无越界。
- 文件内逻辑模块与分层一致：场景配置（`SCENARIOS` 单一真相源，收编 icon/sysprompt/extraCard）、数据读写、习惯链 CRUD、AI 工具表（`TOOLS` + `execTool`）、统计纯函数与渲染分离（`calcTrend`/`renderTrendChart` 拆分）等。
- Electron 主进程内聚良好：窗口/托盘/菜单/自启/AI 配置保管/AI 代理/自动更新，职责均围绕「桌面能力托管」。

### 合理性评价
- **优点**：`SCENARIOS` 作为配置单一真相源、「统计纯函数不依赖 DOM 方便测试」的自觉拆分、AI 工具层与对话循环分离，都体现了正确的内聚/耦合判断。前后端（渲染/主进程）契约在 README 中以表格固化且经核对与代码一致。
- **不足**：
  1. **AI 调用链双实现**：`electron/main.js` 的 `chat` handler 与浏览器侧 `chatOnce` 是两份独立的 OpenAI 调用代码（各自实现超时/重试/错误分级，且重试策略不一致，见第六节），属于跨模块重复。
  2. 习惯链逻辑分散在三处：规则数据（`DEFAULT_LINKS`/`wb_custom_links`）、`runLinks` 触发、UI 编辑 CRUD——数据流经 `getLinks()` 的三级 fallback（自定义链→linkStore→默认值）较绕，且存在 `CUSTOM_LINKS_KEY` 与 `PREFIX+"links"` 双 key 并存的历史包袱。
  3. `window.__test` 导出约 100 个内部函数（含 `_backupBroken` 等私有约定），测试钩子与生产代码同体，模块私有性名存实亡。

### 改进建议
1. 把 OpenAI 调用的重试/超时/错误分级抽成一份语义定义（共享常量或文档契约），Electron 与浏览器两侧对齐。
2. 习惯链存储收敛为单 key + 迁移逻辑，消除双 key 并存。
3. `__test` 导出加环境门控（如仅 `location.search` 含 `__test=1` 时挂载）。

---

## 四、代码质量

### 现状分析（量化指标）
- 命名：统一 camelCase，函数动宾结构，布尔加 `is/has` 前缀，私有约定 `_` 前缀，一致性高。
- 注释：JSDoc 覆盖绝大多数导出函数（含 `@param/@returns`），关键算法（SM-2、streak、热力图）有原理说明；分节横幅带任务编号（T2.3/A-P2-7 等）可追溯到迭代任务。
- 结构：最长函数 103 行（`renderMainHTML`），无巨型函数；`console.*` 仅 2 处；`TODO/FIXME` 为零。
- 安全编码：`esc()` 全量转义 + `safeUrl()` 拒绝 `javascript:` 协议 + Markdown 解析「先转义再解析」的 XSS 防线完整。
- 异常：`catch` 共 90 处，其中**空 catch 14 处**（含 `taskStore.subscribe` 里 `try{render()}catch(e){}` 这种吞掉渲染异常的关键路径）。

### 合理性评价
- **优点**：以单文件原生 JS 的标准衡量，注释密度、命名纪律、XSS 防护、设计令牌体系（间距/字号/圆角/语义色全套 CSS 变量）均属上乘；`no-console off` 是刻意选择而非疏漏。
- **不足**：
  1. **ESLint 在最重要的地方自废武功**：`overrides` 中对 `*.html` 关闭了 `no-undef` 和 `no-unused-vars`——即 3900 行主逻辑实际不受未定义变量检查。
  2. 空 catch 中混有真正该上报的路径（渲染异常），与项目已有的 `pushDiag` 诊断设施没有打通。
  3. **版本号三处漂移**（HTML 常量/根 package.json/electron package.json 均为 1.0.0，文档宣称 1.1.0），说明发布流程缺少 checklist 或单一版本源。
  4. `SCENARIOS` 内 4 个硬编码 hex 色值——有注释自证是「单一真相源」，属可接受的例外，但与颜色 lint 门禁的关系值得写明。

### 改进建议
1. 对 `*.html` 恢复 `no-undef`（用 `globals` 声明替代一刀切关闭）。
2. 空 catch 分级：刻意静默的加 `/* intentional */` 标记，渲染等关键路径改接 `pushDiag`。
3. 建立版本单一来源（如构建脚本从根 package.json 注入 HTML 与 electron package.json）。

---

## 五、前端实现

### 现状分析
- 无框架原生实现：模板字符串生成 HTML → `innerHTML` 注入（22 处），事件以 `addEventListener`（13 处）+ 内联 `onclick` 混合绑定。
- 样式组织规范：710 行 CSS 全部走令牌（基础色/语义色/场景色/间距 4px 基线/字号/圆角/阴影/过渡），暗色模式切 `:root` 令牌，4 断点响应式 + iPhone 安全区适配。
- 图表为零依赖内联 SVG（折线/饼图/热力图），骨架屏与空状态做成「纯 HTML 生成函数」便于测试。
- 移动端有手势滑动切场景、横屏折叠等超预期的打磨。

### 合理性评价
- **优点**：设计令牌体系完整度接近设计系统水准；纯函数/渲染分离让无框架代码也可测；PWA 三件套（manifest 含 shortcuts/screenshots、SW 分层缓存、离线兜底 Response）实现标准。
- **不足**：
  1. **全量 `render()` 重渲染**：store 变更防抖 50ms 后整页重渲，数据量小无感，但输入框聚焦态、滚动位置等需手工保护，功能越重越脆弱。
  2. `innerHTML` 拼接 + 内联事件的风格使「组件」边界只能靠函数命名体现；无组件级生命周期，模态/抽屉状态靠 DOM class 切换管理。
  3. SW 对**跨域 GET 请求做 stale-while-revalidate 缓存**——若 AI 服务商的 GET 接口（模型列表等）返回敏感数据会被落盘缓存，策略注释未说明该取舍。

### 改进建议
1. 维持无框架路线的前提下，把最高频交互区（聊天面板、看板列）改为局部 diff 式更新（按场景 key 重渲子树）。
2. SW 跨域缓存增加主机白名单（仅缓存明确的静态 CDN），默认不缓存跨域响应。

---

## 六、前后端交互

### 现状分析
项目无自有后端，交互面有两条：
1. **渲染进程 ↔ Electron 主进程（IPC）**：README 契约表与代码逐条核对**一致**——preload 暴露 `getAutoLaunch/setAutoLaunch/version/isPackaged/getAiConfig/setAiConfig/chat`，主进程全部有对应 handle/on；`contextIsolation+sandbox+nodeIntegration:false` 符合 Electron 安全基线；AI Key 只存主进程（safeStorage/DPAPI 真实加密，渲染进程仅持 `keySet` 布尔）是正确且加分的安全设计，还含旧格式一次性迁移。
2. **应用 ↔ OpenAI 兼容 API**：统一的 `/chat/completions` + function-calling；错误分级（401/429/5xx/超时 30s）、SSE 流式解析（含 `[DONE]` 终止与不完整 chunk 拼接）、浏览器兼容降级（无 ReadableStream 时一次性 JSON）都做得规范。

### 合理性评价
- **优点**：IPC 面最小化且文档化；Electron 侧把 CORS 与 Key 暴露两个问题一并经主进程代理解决，思路正确；浏览器直连时给用户的错误提示（「可能被跨域拦截，请用本地服务模式」）是可操作的。
- **不足**：
  1. **两侧重试语义不一致**（同一功能的契约分裂）：主进程 `chat` 对 429/5xx 退避重试 3 次；浏览器 `chatOnce` 只对网络错误（TypeError）重试，429/5xx 直接抛错。同一供应商限流时两种形态表现不同。
  2. 浏览器模式 AES-GCM 加密的**设备密钥与密文同存 localStorage**，防护强度等同混淆——Electron 路径是真加密，浏览器路径的威胁模型应在 README 写清（当前「AES-GCM 加密存储」的表述偏乐观）。
  3. AI 工具错误回传模型的信息粒度粗（工具异常多数归并为文本错误），模型自纠空间有限。

### 改进建议
1. 对齐两侧重试矩阵（哪些状态码重试、退避基数、上限），写进 README 契约表。
2. README 补充浏览器模式加密的威胁模型一句话：「防随手翻 localStorage，不防本机恶意进程」。
3. `execTool` 错误返回结构化 `{ok:false, err, hint}`，提升模型自纠率。

---

## 七、文档完整性

### 现状分析
- README：含定位、三形态对照表、架构 ASCII 图、IPC 契约表、AI 接入与 CORS 说明、快捷键、Electron 构建、数据安全与已知限制——**对个人项目而言属于高水平**，「已知限制」一节尤其难得。
- CONTRIBUTING：环境/命令/颜色令牌强制/测试要求/Conventional Commits/PR checklist 完整。
- CHANGELOG：Keep a Changelog 风格，Added/Changed/Fixed/Tests/Docs 分类规范。
- electron/README：目录关系、托盘/自启、自动更新原理与发布流程详尽。

### 合理性评价
- **优点**：文档体系（README/CHANGELOG/CONTRIBUTING/子目录 README）种类齐全且互相链接；架构图与契约表是「文档即规约」的正确实践。
- **不足**：
  1. **文档与仓库内容多处失配**（本报告开篇表格）：测试规模、lint 脚本、.bat 启动器、版本号——文档描绘的仓储比实际仓库完整。
  2. electron/README 与 `electron/package.json` 自相矛盾：README 称 files 白名单含 `agent-workbench.html` 且产物为 NSIS 安装包；实际 package.json 白名单是 `"../agent-workbench.html"` 父路径（electron-builder 不支持包含工程目录外文件，而 prebuild 复制进来的 `electron/agent-workbench.html` 又不在白名单内，**打包产物大概率缺失 HTML → 窗口空白**），target 实为 `portable`。
  3. 缺 LICENSE 文件（electron/package.json 声明 MIT 但仓库无许可证文本）；AI 工具的 JSON Schema 只在代码里，无独立接口文档。

### 改进建议
1. 以「新克隆者按文档能跑通」为标准做一轮文档-仓库对齐（补交 tests/scripts/.bat，或修改文档）。
2. 修正 electron 打包配置与文档不一致，实跑一次 `npm run dist` 验证产物。
3. 补 LICENSE；将 `TOOLS` schema 导出为 `docs/ai-tools.md`。

---

## 八、优先改进建议（Top 8）

| # | 优先级 | 建议 | 预期影响 | 实施方向 |
|---|---|---|---|---|
| 1 | P0 | **补齐仓库完整性**：提交 `tests/`、`scripts/lint-colors.mjs`、两个 `.bat` 启动器（或从文档删除对应声明） | 恢复 `npm test`/`npm run lint` 可运行性；README 主入口不失效；CONTRIBUTING 的 PR checklist 才有执行基础 | 核对本地工作区与 `.gitignore`（确认非误忽略），一次性补交并打 tag |
| 2 | P0 | **修复 Electron 打包配置**：files 白名单改收 prebuild 复制的 `electron/agent-workbench.html`，移除 `"../"` 父路径引用 | 消除打包产物缺 HTML、窗口空白的重大风险；`npm run dist` 从「纸面可用」变为「验证可用」 | 改 `electron/package.json` 的 build.files，本机实跑一次 dist 并安装验证 |
| 3 | P0 | **版本号单一来源**：HTML `VERSION`、两个 package.json、README/CHANGELOG 统一为 1.1.0 | 杜绝「文档说一套、代码是另一套」；自动更新的版本比对才可信 | 发布 checklist 加版本项，或写脚本从根 package.json 注入其余两处 |
| 4 | P1 | **统一 AI 调用链语义**：主进程 `chat` 与浏览器 `chatOnce` 对齐重试矩阵（429/5xx 是否重试、退避策略、30s 超时） | 两种形态行为一致，限流场景用户体验可预期；消灭约 80 行跨模块重复 | 抽取共享重试常量为一份契约，双侧引用；差异写进 README 契约表 |
| 5 | P1 | **门控 `window.__test`**：约 100 个内部函数（含 `_backupBroken` 等私有接口）当前无条件挂载到生产环境 window | 收窄全局污染与内部 API 暴露面；保留 jsdom 黑盒测试能力 | 改为 `location.search` 含 `__test=1` 或 `localhost` 时才挂载，测试侧同步加参数 |
| 6 | P1 | **诚实化浏览器模式 Key 加密表述**：设备密钥与密文同存 localStorage，实为混淆级防护 | 用户威胁模型预期正确；与 Electron safeStorage 路径的安全差异清晰 | README 第四节补一句威胁模型说明；设置 UI 对浏览器模式加提示 |
| 7 | P2 | **引入「模块化源码 → 构建拼合单文件」流水线**，并恢复 `*.html` 的 ESLint `no-undef` | 分层从注释自觉升级为模块强制；全局函数污染、lint 盲区一并解决；保住单文件交付优势 | `src/{data,store,ai,chain,render,ui}/*.js` + 简单拼接脚本（无需 bundler）；eslint 改用 `globals` 白名单 |
| 8 | P2 | **仓库门面治理**：更名或 description/topics 关联「Agent 工作台」，补 LICENSE，TOOLS schema 导出为接口文档 | 外部可发现性与可贡献性；许可证合规（当前声明 MIT 但无文本） | GitHub 设置页 + 补 `LICENSE` + `docs/ai-tools.md` |

---

## 总体结论

这是一个**产品判断克制、工程素养高于平均水平**的个人项目：单文件架构是清醒且执行彻底的取舍，安全设计（IPC 最小面、Key 主进程托管、XSS 防线）与文档意识（契约表、已知限制）都有亮点。当前最大的风险不在代码内部，而在**「文档描绘的项目」与「仓库实际内容」之间的裂缝**——缺失的测试与脚本、漂移的版本号、未验证的打包配置，三者都是低成本高回报的修复项，建议按 P0 三条优先闭环。

---

## 2026-08-13 复审更新

本报告于 2026-08-06 评估后，项目经历了 v1.2.0~v1.8.9 共 30+ 个版本的迭代修复。以下为各问题的当前状态：

### 已修复的问题

1. **仓库完整性**（原 P0-1）：tests/、scripts/、.bat 均已提交，npm test 和 npm run lint 可正常运行
2. **版本号漂移**（原 P0-3）：VERSION 常量、package.json、electron/package.json 已统一为 1.8.9
3. **模块化拆分**（原 P2-7）：已实现 src/modules/ 33 个模块 + build.mjs 构建流水线
4. **XSS 消毒**：sanitizeHtml 已实现并应用到所有 innerHTML 赋值
5. **CSP 声明**：已添加 Content-Security-Policy（保留 unsafe-inline 为已知限制）
6. **Electron 安全**：contextIsolation + sandbox + nodeIntegration:false + IPC 白名单
7. **错误边界**：关键函数 try-catch + 全局 window.onerror + pushDiag 诊断
8. **测试覆盖**：从 167 个测试增长到 530 个，46 个测试文件
9. **设计令牌**：全套 CSS 变量令牌体系，0 硬编码颜色
10. **PWA 三件套**：manifest + SW + 离线兜底，分层缓存策略

### 仍存在的问题

1. CSP unsafe-inline（需模块化拆分外部 JS/CSS 后才能移除）
2. 浏览器模式加密为混淆级（设备密钥与密文同存 localStorage）
3. window.__test 无条件挂载（约 100 个内部函数暴露）
4. 全量 render() 重渲染（无局部 diff）
5. AI 调用链两侧重试语义不一致

### 结论

项目从 2026-08-06 的「文档与仓库内容失配」状态，已演进为测试完善（530 passed）、安全加固（CSP+XSS+IPC 白名单）、工程化闭环（构建+部署+CI）的成熟状态。剩余问题均为架构级优化项，不影响当前功能和安全。
