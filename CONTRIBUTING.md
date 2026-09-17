# 贡献指南

欢迎参与 Agent 工坊的开发。本文件描述开发环境搭建、代码规范、提交规范与测试要求。

## 开发环境

### 前置要求
- Node.js >= 18
- npm >= 9
- （可选）Python 3 — 用于本地预览服务 `npm run serve`

### 安装

```bash
npm install
```

### 常用命令

| 命令 | 作用 |
|---|---|
| `npm test` | 运行全部测试（vitest） |
| `npm run test:watch` | 监听模式，文件改动自动重跑 |
| `npm run lint` | ESLint + 颜色令牌检查 |
| `npm run lint:fix` | 自动修复 ESLint 可修问题 |
| `npm run serve` | 本地预览（<http://localhost:8123>） |
| `npm run build:check` | **提交前必跑**：版本四处一致性 + 真相源完整性门禁 |
| `npm run lint:layers` | 单文件分层契约校验（缺层 / 顺序错即失败） |
| `npm run build:prod` | 生产构建（`agent-workbench.prod.html` + `service-worker.prod.js`） |
| `npm run release <版本号>` | 发版：自动同步四处版本号 + 锁文件根字段 + CHANGELOG |
| `npm run pet:inject` | 把 `assets/pet/*.png` 回注进 HTML（改了立绘或抽出后必跑） |
| `npm run pet:extract` | 从 HTML 抽出立绘到 `assets/pet/`（把仓库置回源码态） |
| `npm run pet:check` | 校验立绘 assets 与 HTML 注入一致 |
| `npm run make:pwa-icons` | 生成 PWA 图标 `icon-192.png` / `icon-512.png`（纯 Node，与托盘图标同源） |
| `npm run check:pwa-icons` | 校验两个 PWA 图标与重绘结果一致 |
| `npm run make:ai-tools-doc` | 从源码 TOOLS 重新生成 `docs/ai-tools.md`（改过 AI 工具后必跑） |
| `npm run check:ai-tools-doc` | 校验工具文档与源码工具集完全一致（缺/多都报错） |
| `npm run src:verify` | 与基准提交比对，证明分层拼回是**代码零改动** |
| `npm run e2e` | Playwright：桌面/平板/手机三视口矩阵（需 `E2E=1`） |
| `npm run module:graph` | 生成 `docs/module-graph.md`（符号级依赖矩阵 + 共享符号 + 逆层清单） |
| `npm run check:modules` | 对照基线校验：新增环/逆层/重复定义即失败 |
| `npm run module:freeze` | 人工确认后把当前依赖状态冻为新基线 |
| `npm run src:move -- --jobs=<jobs.json>` | **分层块安全搬迁/调用点改写**（默认预演，`--apply` 才落盘） |

### Electron 桌面端（可选）

```bash
cd electron
npm install      # 下载 Electron + electron-builder（~100MB+）
npm start        # 开发预览
npm run dist     # 打包 Windows NSIS 安装包
```

---

## 代码规范

### 颜色令牌（强制）
所有颜色**必须**使用 CSS 变量（`var(--token)`），**禁止**硬编码颜色字面量（如 `#fff`、`rgb(...)`）。

颜色 lint 会自动检查：

```bash
npm run lint
```

新增颜色应先在 `:root` 中定义令牌，再在样式中引用。

### JavaScript
- ESLint 配置见 `.eslintrc.cjs`。
- 使用 `const` 优先（`prefer-const`）。
- 使用严格等号 `===`（`eqeqeq`）。
- 不允许未使用变量（`no-unused-vars`）。
- 单文件应用 `agent-workbench.html` 内联 JS 同样需通过 lint。

### HTML / CSS
- 单文件交付：UI + 逻辑 + 数据全部内联在 `agent-workbench.html`。
- CSS 全内联，使用 CSS 变量做主题（暗色模式通过切换 `:root` 令牌）。
- 图标使用内联 SVG，不引入外部图标库。

---

## 测试

### 要求
- 每个新功能需配套测试。
- Bug 修复应附回归测试。
- 测试文件放在 `tests/` 目录，命名 `*.test.js`。
- 用 `tests/helpers/loadApp.js` 加载应用（统一入口，避免重复样板）。
- 测试命名规范：`描述 > 具体用例`，例如 `'习惯链 > 交付完成应触发学习充电'`。

### 运行
```bash
npm test              # 全量
npm run test:watch    # 监听
```

当前测试规模：**167 个测试 / 19 个测试文件**（v1.1.0）。新增功能不应使既有测试回归。

---

## 提交规范

使用 [Conventional Commits](https://www.conventionalcommits.org/) 风格：

| 前缀 | 含义 |
|---|---|
| `feat:` | 新功能 |
| `fix:` | 修复 bug |
| `refactor:` | 重构（不改行为） |
| `docs:` | 文档变更 |
| `test:` | 新增/修改测试 |
| `chore:` | 构建/工具/杂项 |
| `style:` | 格式调整（不改逻辑） |
| `perf:` | 性能优化 |

示例：
```
feat(习惯链): 增加 streak 热力图可视化
fix(electron): preload.js 导入 app 模块
docs: 更新 README 至 v1.1.0
```

---

## 项目结构

```
agent-workbench.html   # 核心单文件应用（UI + 逻辑 + 数据）
tests/                 # 测试文件
  helpers/loadApp.js   # 应用加载辅助
electron/              # Electron 桌面壳（main.js + preload.js）
scripts/               # 工具脚本（build.mjs / lint-colors.mjs / lint-layers.mjs / release.mjs）
docs/                  # 设计文档（架构分层 / 萌宠系统 / UI 标准 / AI 工具 / 产品边界）
assets/pet/            # 萌宠立绘 PNG + order.json（源码态 HTML 不含 base64，构建回注）
dist/                  # 部署文件
manifest.json          # PWA manifest
service-worker.js      # PWA service worker
package.json           # 工程化入口（test / lint / serve）
.eslintrc.cjs          # ESLint 配置
vitest.config.js       # 测试配置
```

---

## 版本与发布

**唯一真相源是 `agent-workbench.html`**：所有功能直接演进于这个 HTML，不再有 `src/` → HTML 的字节拼接。

**版本号四处必须一致**（`npm run build:check` 会校验，不一致直接失败）：

| 位置 | 字段 |
|---|---|
| `agent-workbench.html` | `const VERSION` |
| `package.json` | `version` |
| `electron/package.json` | `version` |
| `manifest.json` | `version` |

- 发版用 `npm run release <版本号>`，**不要手工改四处**（易漂移；锁文件根字段也会被同步）。
- 构建标记 `BUILD_TAG` 与 SW 的 `CACHE_VERSION` 每次改主文件都要 bump，否则 PWA 吃旧缓存。
- 部署：push 到 `main` 后 `.github/workflows/deploy.yml` 自动 `build:prod` 并发布 GitHub Pages；`ci.yml` 跑测试 / 门禁 / lint。

### 改主文件的自检清单

1. `npm run build:check` 通过；
2. 页面无控制台报错；
3. PWA 资源（manifest 图标等）无 404；
4. 若动了萌宠：**两档风格都要看**（`精致二次元` / `3D 立体渲染`），见 [docs/pet-system.md](docs/pet-system.md)。

### 立绘（萌宠素材）的改动流程

立绘**数据**已外置到 `assets/pet/*.png`，**代码**仍以 `agent-workbench.html` 为唯一真相源
（构建期回注，交付物始终是单个 HTML）。约定：

- 只改立绘：替换 `assets/pet/<kind>.png` → `npm run pet:inject`（幂等；顺序看 `order.json`）。
- 只改代码：正常编辑 HTML；**提交前跑 `npm run pet:extract`**，让仓库保持源码态（不含 base64），
  否则每次提交都带上 1MB 级 base64 diff。
- `npm test` / `npm run build:check` / `npm run build:prod` 都有 `pre` 钩子自动回注，CI 不需要额外步骤。
- 直接打开**未回注**的源码 HTML 时立绘为空（控制台有告警、5 个原始角色退化为 SVG 兜底），属预期行为。

### 分层块搬迁工具（scripts/src-move.mjs）

搬迁 src 里的符号时用它，别手写脚本 —— 它把踩过的三类坑做成了默认行为：

1. **依赖闭包**：自动把同块内被引用且同块定义的符号一并搬（人工清单必然漏 —— 实测漏过 3 个，搬到一半失败）
2. **定义不变量**：落盘后自动核对"顶层定义全集不变"，不一致直接报错（保证是**纯搬迁**、没改行为）
3. **按行粒度改写**：`rewrite` 任务只在**含真实调用的行**上替换（剥离文本仅用于判定；注释/字符串里的同名文本不会被动），
   并要求逐行替换生效、总数符合预期（曾因"按偏移回写依赖剥离等长"把 app 改坏）

```
# jobs.json: {"move":[{"roots":["某符号"],"from":"ui-theme","to":"core","note":"..."}],
#             "rewrite":[{"block":"data-rw","symbol":"completeTask","to":"AppBridge.completeTask(","expect":2}]}
npm run src:move -- --jobs=jobs.json          # 预演（打印闭包、行数、跨块依赖、改写计数）
npm run src:move -- --jobs=jobs.json --apply  # 执行 + 自动校验不变量
```

> 预演里会列出**跨块依赖**：若闭包里的符号引用了排在目标块之后的块，搬过去等于把倒挂换个方向，需先调整目标层。

### 结构守护测试

`tests/build-structure.test.js` 是「分层外置 + 立绘外置」的防复发测试，断言结构不变量：
标记成对且不重复、所有标记都在 `<script>` 内（防块边界越过 `</script>`）、7 大层注释齐全、
src 文件与 `order.json` 一一对应、注入的立绘与 `assets/pet/*.png` 字节一致。

`tests/e2e/viewport.spec.js` 断言三视口的**布局不变量**（无横向溢出、断点分流正确、顶栏高度合理、
主区未被压扁、移动端触控目标尺寸）—— 不做像素基线，避免基线噪声。

### 两条硬性写法约定

- **改 JSON 配置（manifest / package.json）一律"解析 → 修改 → 序列化"**，不要用正则替换 —— 曾因正则吃掉 `"screenshots":` 键导致 JSON 非法。
- **`git add -A` 会把本地会话产物（如 `.playwright-mcp/`）带进提交**，提交前用精确 `git add <文件>`。

---

## PR 检查清单

提交 PR 前请确认：
- [ ] `npm run lint` 通过（无硬编码颜色、无 ESLint 错误）
- [ ] `npm run build:check` 通过（版本号四处一致）
- [ ] `npm test` 全部通过
- [ ] 新功能已附测试
- [ ] 文档（README / CHANGELOG）已同步更新
- [ ] 若改动 UI：响应式四个断点都看过
- [ ] 若改动萌宠：两档风格 + 三档尺寸都看过（见 [docs/pet-system.md](docs/pet-system.md)）
- [ ] 提交信息符合 Conventional Commits 规范