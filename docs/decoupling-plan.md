# 设计级解耦方案（v1 · 2026-09-17）

> 面向 `agent-workbench.html` 单文件应用：在不改变交付形态（**经典 `<script>` 单文件**）的前提下，
> 把「低层块调用高层块」的耦合从**直接引用**改为**受控的桥接/调度**，并用依赖图门禁量化推进。
>
> 数据来源：`docs/module-graph.md`（由 `scripts/module-graph.mjs` 从 27 个 src 块的符号级引用算出）

---

## 一、现状（实测数据，非估计）

**97 条符号级逆层边**（低层块引用了更靠后块定义的符号），按「层对」归类：

| 层对 | 边数 | 代表符号 | 性质 |
|---|---|---|---|
| **Core → UI / Data** | **3** | `TOAST_ICONS`、`getRec`、`setRec` | ⚠️ **我方引入的违约**（见下） |
| AI → Render | 7 | `runSql`、`runJsSnippet`、`loadSqlJs`、`renderMiniChart`、`trapFocus` | **放错层**（AI 工具的实现写在 Render 块里） |
| AI → AI | 5 | `abortChat`、`pendingConfirm`、`renderChat`、`scrollChat`、`trimChatHist` | 同层互调（可接受，优先级低） |
| Data → Render | 5 | `render`、`addToRecycleBin`、`SCENE_FEATURE_RENDER`、`_sideActive` | **副作用调用**（改完数据直接喊渲染） |
| Data → UI | 3 | `SCENE_FEATURES`、`allKeys` | 放错层 + 副作用 |
| Crypto / Util / Data → 其它 | 5 | `render`、`idbMirrorKey`、`completeTask`、`_chatContentToText` | 混合 |
| 其余（AI→UI、Render→…） | ~69 | — | 多为「低层触发高层动作」 |

**热点符号**（被最多不同块逆层引用）：`render`(4) · `openAiPage`(4) · `openDrawer`(4) · `rec`/`arr`(3，已确认是函数内变量误判，已修) …

### 需要先承认的自身违约（Core 层）

`src/core.js` 目前**依赖了 UI 与 Data**，违反本项目文档里刚写下的「核心层零外部依赖」：

1. `toast()`（已搬入 core）的体里用了 `TOAST_ICONS`（定义在 **ui-theme**）
2. `SCENE_FEATURE_BIND.exercise.onSave`（已搬入 core）的回调里调了 `getRec/setRec`（定义在 **data-rw**）

根因是两个**看起来像纯数据、实际带行为**的东西：
`TOAST_ICONS` 是图标表（纯数据）但被漏搬；`SCENE_FEATURE_BIND` 的表项里嵌了**回调**（`onSave`），
搬表就一起把回调搬下来了 —— **教训：含回调的"数据表"不是纯数据，不能简单下移。**

---

## 二、目标与原则

**目标**：让依赖方向回归「上层依赖下层」，并把它变成**可持续守住**的约束，而不是一次性大重构。

| # | 原则 | 说明 |
|---|---|---|
| P1 | 交付形态不变 | 仍是经典 `<script>` 单文件；不引入打包器、不用 ESM `import` |
| P2 | 兼容优先 | `file://` 直开、PWA 离线、Electron 打包三条路径都不受影响 |
| P3 | 小步可回滚 | 每个阶段独立可提交、可用 `git revert` 单独回退 |
| P4 | 量化推进 | 进度 = **依赖图基线里 upward 条数**（当前 97，目标 < 20） |
| P5 | 不为解耦而解耦 | 必要的反向调用（回调、事件）保留，只是**改成受控通道**，不删功能 |
| P6 | 每步都要验 | 纯搬迁 → 定义全集不变量；改行为 → 现有 59 个测试 + CDP 冒烟 + e2e |

---

## 三、方案：三件工具，按侵入度递增

### 工具 A · 归位（纯搬迁，零运行时风险）

把「实现写错了层」的符号搬到它该在的层。**不改一行实现**，可用现有 `--verify`/纯搬迁不变量验证。

| 目标 | 从 | 到 | 预期收益 |
|---|---|---|---|
| `TOAST_ICONS` | ui-theme（UI） | **core** | 消除 Core→UI 违约 |
| AI 工具实现：`runSql` / `runJsSnippet` / `loadSqlJs` | render-scene-main（Render） | **ai-tools（AI）** | 消除 AI→Render 的 3~4 条 |
| `renderMiniChart` / `addTokensUsage` / `trapFocus` | render-*（Render） | 视用途：AI 用的小工具 → AI 层；通用 DOM 工具 → core/util | 各 1 条 |
| `SCENE_FEATURES` / `allKeys` | render/ui 块 | 视用途定层 | 各 1~2 条 |

> 判据：**谁是主要调用者**，就搬到谁的层（若调用者跨多层且语义通用 → 进 core）。

### 工具 B · 桥接注册（bridge / registry）

**适用**：真正的"低层触发高层动作"，例如 `openAiPage` / `openDrawer` / `addToRecycleBin` / `render`。
**做法**（三层合计约 30 行）：

```js
// ① core：只声明能力接口，不实现（core 因此保持零依赖）
const AppBridge = { render: () => {}, openAiPage: () => {}, openDrawer: () => {},
                    addToRecycleBin: () => {}, notify: () => {} };

// ② 上层（UI/Render 块）在自身加载时注册实现
AppBridge.render = render;
AppBridge.openDrawer = openDrawer;
AppBridge.openAiPage = openAiPage;

// ③ 低层只调接口
AppBridge.render();          // 而不是直接调 render()
```

**为什么选它**（而不是 EventBus / DI 容器）：
- 本仓库**已有同款先例**：侧栏菜单的动作注册表 `_findSideMenuItem(...)`、命令面板里每条命令的 `run` 闭包
  —— 桥接是本项目**已有且被验证过的**风格，不是引入新范式
- 调用是**同步、可断点、可读栈**的（EventBus 的异步解耦会牺牲可调试性）
- 未注册时是**安全空操作**（`() => {}`），不会像 EventBus 漏订阅那样静默丢事件
- 每接一个符号只改 3 处，可单个符号独立提交

### 工具 C · 数据变更 → 渲染调度（dirty flag + 合帧）

**适用**：`Data → Render` 的 `render()` 直调（当前 5 条，且实际调用点更多，因为函数体内多次调用不被计入符号级统计）。
**做法**：

```js
// core
let _dirty = false;
function markDirty(){ if(_dirty) return; _dirty = true; requestAnimationFrame(() => { _dirty = false; AppBridge.render(); }); }
// 低层：改完数据
setTasks(next); markDirty();     // 而不是 render();
```

**收益**（不只解耦）：
- Data 层不再认识"渲染"这个概念 ✓
- 同一帧内多次数据变更只渲染一次 → **顺带提升性能**（批量导入、迁移、AI 连续写数据时最明显）
- 与工具 B 天然配套：`markDirty` 内部走 `AppBridge.render`

---

## 四、实施顺序（4 阶段，每阶段独立验收）

| 阶段 | 内容 | 验收标准 | 预期 upward |
|---|---|---|---|
| **S0** | 修我方违约：`TOAST_ICONS` → core；`SCENE_FEATURE_BIND` 的 `onSave` 回调改由上层注册（**工具 A + B 的首次实战**） | core **零外部依赖**（依赖图里 Core→* 归零）· 纯搬迁不变量 · 59 单测 + CI | 97 → ~94 |
| **S1** | 工具 A 全量归位（AI 工具 → AI 层等） | 纯搬迁不变量 + CDP 冒烟 + 单测 | ~94 → ~80 |
| **S2** | 工具 B 接 `render` / `openDrawer` / `openAiPage` / `addToRecycleBin` | 单测 + CDP 冒烟（面板/抽屉/回收站/AI 页四个入口实测）+ e2e | ~80 → ~40 |
| **S3** | 工具 C 铺开 Data→Render（`markDirty()` 替代直调） | 单测 + **性能对照**（批量导入耗时）+ e2e | ~40 → <20 |

每阶段结束：`npm run module:graph --freeze` 收缩基线 → 门禁自动守住成果（新引入的逆层边会让 CI 变红）。

---

## 五、度量与守门

- **主指标**：`docs/module-graph.md` 的「逆层依赖」条数（基线内既有项只报告，**新增**项 CI 失败）
- **辅助**：Core 层的出边数必须恒为 **0**（可作为一条显式断言加进 `check:modules`）
- **不作弊**：不通过调大 `--fanout` 阈值或往基线里塞新条目来"变绿"；每次 `--freeze` 必须在提交信息里说明原因

---

## 六、不做的事（明确边界）

1. **不引入打包器 / ESM**：交付物必须保持单文件、`file://` 可直开（PWA 离线与 Electron 依赖这一点）
2. **不做大规模重写**：每个阶段都是"搬 + 接"，不重写业务逻辑
3. **不删必要回调**：例如 `SCENE_FEATURE_BIND` 的 `onSave` 是有意设计（错题自动入复习队列），
   只把它**移到正确的层**，不取消功能
4. **不追求 0 逆层**：同层内互调（AI→AI 等）与真实的事件回调是合理的，目标是**消除跨层倒挂**

---

## 七、S0 改造清单（最具体、可立即动手）

1. `src/core.js`：删除 `SCENE_FEATURE_BIND` 的 `onSave` 实现（保留表结构与字段定义），改为
   `if (AppBridge.onExerciseSave) AppBridge.onExerciseSave(rec);`
2. `src/core.js` 新增 `AppBridge` 声明（工具 B 的最小版本）
3. 把 `TOAST_ICONS` 从 `ui-theme` 移入 `core`
4. 在 data/rw 或 chain 块（`onExerciseSave` 的真实归属方）注册实现，实现体与现状逐字一致
5. 验证：`module:graph`（Core→* 应为 0）· 纯搬迁/等行为不变量 · 59 单测 · CDP 冒烟 · e2e · `--freeze`

---

**附**：本方案与 `docs/architecture-layers.md` 的分层契约、`docs/module-graph.md` 的依赖数据配套使用。
