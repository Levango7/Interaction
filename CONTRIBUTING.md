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
| `npm run lint:layers` | 分层契约检查（单文件架构边界） |
| `npm run serve` | 本地预览（<http://localhost:8123>） |

### Electron 桌面端（可选）

```bash
cd electron
npm install      # 下载 Electron + electron-builder（~100MB+）
npm start        # 开发预览
npm run dist     # 打包 Windows portable exe（免安装单文件，含自动拷贝最新 agent-workbench.html）
```

> 打包目标为 `portable`（见 `electron/package.json` 的 `build.win.target`），产物名 `Agent工坊-${version}-portable.exe`，输出到 `electron/dist/`。如需改为 NSIS 安装包，将 `target` 改为 `["nsis"]` 即可。

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

当前测试规模：**634 个测试 / 56 个测试文件**（v2.4.1）。新增功能不应使既有测试回归。

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
scripts/               # 工具脚本（lint-colors.mjs 等）
dist/                  # 部署文件
manifest.json          # PWA manifest
service-worker.js      # PWA service worker
package.json           # 工程化入口（test / lint / serve）
.eslintrc.cjs          # ESLint 配置
vitest.config.js       # 测试配置
```

---

## PR 检查清单

提交 PR 前请确认：
- [ ] `npm run lint` 通过（无硬编码颜色、无 ESLint 错误）
- [ ] `npm test` 全部通过
- [ ] 新功能已附测试
- [ ] 文档（README / CHANGELOG）已同步更新
- [ ] 提交信息符合 Conventional Commits 规范