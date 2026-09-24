# 前端控件矩阵审查报告

> 生成于 2026-09-24 · 基于 v3.7.36 · 扫描脚本 `_diag/inventory.mjs` + `_diag/audit-ui.cjs`
> 方法：静态扫源码（找"写了什么"）+ 运行时扫 DOM（看"渲染成什么"）
>
> **维护状态（2026-09-24 复核，v3.7.42）**：P0 / P1 / P2 / **P3 已全部清空**。
> 本文档的「矩阵」与「分级」两节保留 v3.7.36 当时的实测数据作为**基线快照**；
> 后续补齐情况见「v3.7.38 / 3.7.39 二次补齐」与「v3.7.42 主题渲染层守护」两节。

---

## 一、控件总量分布

| 类别 | 数量 | 弹层可控性 |
|---|---|---|
| `<button>` | 415 | ✅ 完全自绘 |
| `<input type=checkbox>` | 57 | ✅ 外观可自绘（已 16px） |
| `<select>` | 49 | ✅ 已被 ds-select 接管 |
| `<input type=file>` | 36 | ⚠️ **弹层必须原生**（安全限制），外观可完全自绘 |
| `<input type=color>` | 27 | ✅ 外观已自绘（v3.7.36），仅取色面板原生 |
| `<textarea>` | 26 | ✅ 完全自绘 |
| `data-date-picker`（自研日期面板） | 22 | ✅ 自研 |
| `<input type=range>` | 16 | ✅ 外观已自绘（v3.7.36） |
| `<input type=time>` | 2 | ❌ **弹层原生**（闹钟 / AI 工作流时间） |
| `data-editable`（自研可编辑下拉） | 1 | ✅ 自研 |

**原生弹层控件合计 98 处** —— 这是"感觉问题很多"的量化来源。

---

## 二、矩阵审查（控件类型 × 检查维度）

> 本表 **⚠️ 标记已在 v3.7.38/3.7.39 全部转为 ✅**（见文末「二次补齐」节）。
> 保留原标记是为了让后来者看到"当时的缺口在哪"，**不要当成现状**。

| 控件 | ①弹层可控 | ②尺寸统一 | ③键盘可达 | ④主题适配 | ⑤无障碍 | ⑥状态齐全 |
|---|---|---|---|---|---|---|
| 自研下拉 `ds-select` | ✅ 全自研 | ✅ `--control-h` | ✅ ↑↓/Enter/Esc | ✅ 令牌 | ✅ role/aria | ✅ hover/focus |
| 可编辑下拉 `data-editable` | ✅ 全自研 | ✅ 同上 | ✅ 含输入过滤 | ✅ 令牌 | ✅ combobox | ✅ +无效输入还原 |
| 原生 `<select>`（未增强项） | ✅ 已排除 `.dp-time` 子树 | ✅ | ✅ | ✅ | ✅ | ✅ |
| 日期字段 `data-date-picker` | ✅ 自研面板 | ✅ | ⚠️ 待验 → ✅ v3.7.39 roving tabindex | ✅ | ⚠️ 部分缺 aria-label → ✅ | ✅ |
| 复选框 | ✅ 无弹层 | ✅ **16px**（v3.7.34） | ✅ | ✅ `accent-color` | ✅ | ⚠️ disabled 待验 → ✅ v3.7.38 |
| 滑块 range | ✅ 无弹层 | ✅ | ✅ | ✅ **已主题化**（v3.7.36） | ⚠️ 缺 aria-label → ✅ v3.7.38 | ⚠️ disabled 待验 → ✅ v3.7.38 |
| 取色器 color | ⚠️ 面板原生 | ✅ **38px**（v3.7.36） | ✅ | ✅ **已主题化** | ✅ | ⚠️ 待验 → ✅ v3.7.38 |
| 文件 file | ❌ 弹层原生（不可改） | ✅ 已用自绘按钮 | ✅ | ✅ | ✅ | ✅ |
| **时间 time** | ❌ **弹层原生** | ✅ | ✅ | ❌ 系统样式 | ✅ | ✅ |
| `<button>` | ✅ | ✅ | ⚠️ 部分 31px（临界） → ✅ 全部 ≥32px | ✅ | ✅ | ✅ |

---

## 三、P0 / P1 / P2 分级

### ✅ 已全部修复（v3.7.34 ~ 3.7.37）

| 问题 | 影响面 | 处理 |
|---|---|---|
| 复选框仅 13px（点击区过小） | 57 处 | → 16px + `accent-color` |
| 取色器 32px、无圆角、默认描边 | 27 处 | → 38px、swatch 圆角、去描边 |
| **滑块完全未主题化**（11 套主题下都是系统蓝） | 16 处 | → track/thumb 全令牌化（含 Firefox） |
| 复选框/取色器规则被同特异性声明覆盖 | — | → 改规则本体 + 标注"唯一真相源" |
| 下拉列表弹出方向恒为"上"（`scrollHeight` 误用） | 49 处 | → 改用渲染后实际高度 |
| 时间字段无法输入 | 1 处 | → combobox（可敲可选） |
| **原生 `time` 控件**（闹钟 / AI 工作流时间） | 2 处 | → **自研可编辑下拉，全站原生 time 清零** |
| 侧栏项点击区 31px（低于 32px 下限） | 43 处 | → `min-height:32px` |
| 聊天输入 44 vs 下拉/按钮 42 | 1 处 | → 统一 42，整行同高 |
| `timeOptionsHtml()` 抽为公用生成器 | — | 放 `core.js`，供各处复用 |

### ✅ 验证结论（v3.7.37 实测）

| 检查 | 结果 |
|---|---|
| 11 套主题令牌完整性 | ✅ 全部有 `--panel`/`--line`/`--text`/`--accent`，色值各主题互异 |
| 滑块/取色器主题适配 | ✅ thumb 色随 `--accent` 变化（8 套主题抽样验证） |
| 原生 `input[type=time]` 残留 | ✅ **0 处** |
| `nav-item` / `chat-text-input` / 发送按钮 | ✅ 32 / 42 / 42 px |
| `:focus-visible` 规则注入 | ✅ 已注入 |
| 自研下拉键盘可达 | ✅ `tabIndex=0` + `role=combobox` + `aria-haspopup` |
| 横向溢出 | ✅ 无 |

### ✅ v3.7.38 / 3.7.39 二次补齐（P2 收敛）

> 本节为 2026-09-24 复核：下文原「剩余打磨项」中除主题截图矩阵外**均已实施**，此处如实回填。

| 问题 | 处理 | 验证方式 |
|---|---|---|
| `disabled` / `readonly` / 校验失败态视觉缺失 | ✅ v3.7.38 三态统一补齐（走令牌，11 主题自适应） | 源码实测：`input:disabled,select:disabled,textarea:disabled` 含 `.ds-select` 联动的透明层；`input:read-only:not(...)` 排除 checkbox/radio/range/color；校验态用 `[aria-invalid="true"],.is-invalid`，**刻意不用 `:invalid`**（避免空 required 字段初始即标红） |
| 滑块缺 `aria-label` | ✅ 已补（与 range 主题化同批） | 源码 u-drawer / render-widgets 抽样 |
| 日期面板 Tab 序完整性 | ✅ v3.7.39 **roving tabindex**（ARIA datepicker 标准） | 源码实测 `render-scene-main.js:727+`：仅当前焦点日 `tabindex="0"`，其余 `-1`；跨月重渲染后 `_focusDay` 优先选中值→今天→1 号 |
| 焦点环程序化验证局限（`focus()` 不触发 `:focus-visible`） | ✅ v3.7.39 改用**真键盘事件**走查 | `_diag/cdp.js` 加 `Emulation.setFocusEmulationEnabled` + `Input.dispatchKeyEvent`，实测 Tab 序：skip-link → 顶栏 7 钮 → sideToggle → 侧栏 4 项 |
| 日期面板 Esc 后焦点掉到 BODY | ✅ v3.7.39 `_dpClose` 主动归还焦点给触发输入框 | 配套 `_dpReFocusing` 一次性标志抑制"归还焦点→focus 委托→面板重开"的循环 |

### ✅ v3.7.42 主题渲染层守护（P3 收尾，唯一遗留项已补）

> 原「剩余 P3」只有一项：*`audit-ui.cjs` 主题截图矩阵未做*。本次以**更可靠的形式**补上。

**为什么不做截图基线**：像素 diff 需要与 CI 同环境（Linux + 同版本 chromium）生成的基线，
本机无法生成，且会因字体/抗锯齿产生噪声 —— 结论是"看着严格，实际不可用"。

**改做什么**：`tests/e2e/theme-matrix.spec.js` —— 断言**渲染层不变量**（不依赖像素基线，
故本机与 CI 结果一致，且能真正抓住回归）：

| # | 断言 | 抓住什么缺陷 |
|---|---|---|
| ① | 11 套主题都真正生效（`--panel` 随主题变化，且至少有 5 种互异） | `data-theme` 选择器写错 → 整个主题**静默退化**成默认色 |
| ② | 每套主题 6 组关键配对的对比度 ≥ **实测基线 × 0.9** | 改主题时把字改淡、把背景改亮 → 读不清 |
| ③ | 每套主题下核心 UI（顶栏/侧栏/主内容/侧栏项）真实可见且尺寸未塌陷 | 某主题下控件消失、被压成条 |
| ④ | 每套主题下无横向溢出、顶栏高度未漂移 | 主题相关的溢出回归 |

**阈值怎么定的（关键）**：不用 WCAG 的 4.5 直接卡 —— 实测发现若干主题**本就低于它**，
硬卡会造成"基线红"，反而掩盖真正的新回归。改为**用实测值当基线**：跑一次拿到 10 套主题
× 6 配对的真实值（60 项），写进 spec 作为 `BASELINE` 表，判定 `实测 ≥ 基线 × 0.9`
（允许 10% 抖动，退步超过一成就红）。实测数据同时落 `_probe/theme-contrast-actual.txt`。

**⭐ 顺带发现的真实问题（设计侧待决，未擅自改色）**：若干主题的关键配对低于 WCAG 正文 4.5:1：

| 主题 | 配对 | 实测 | 色值 |
|---|---|---|---|
| `sepia` | `on-accent/accent` | **2.54** | `#fff` / `#d49648` |
| `dark` | `on-accent/accent` | **2.82** | — |
| `mist` | `danger/panel` | **2.11** | `#f08a60` / `#6b7048` |
| `forest` | `danger/panel` | **2.19** | `#ef6b5e` / `#2d6840` |
| `mist` | `muted/panel` | 2.82 | `#c8c08a` / `#6b7048` |
| `forest` | `muted/panel` | 2.61 | — |

其中最值得注意的是 **`sepia` 的"主色按钮 + 白字"只有 2.54** —— 暖棕橙底配纯白字天然偏低。
这是**设计取舍**（要暖色基调就得接受对比度下降），故 spec 里只**列出清单不阻断**
（第 3 个用例"低对比度清单"），把决策权交回设计侧；要收紧时改 `--on-accent` 即可。

### 📋 仍剩（不阻断）

- `check:pwa-icons` / `lint-tokens` 未接入 CI（前者手动跑 ✓；后者自我声明"CI 不强制阻断"，属有意为之）。
- `check:ai-tools-doc` 已于 v3.7.41 修复并接入 CI。
- **控件矩阵层面已无遗留项**。

### 🔧 v3.7.42 顺带修好的「本机 e2e 跑不起来」

原先**本机无法自验 e2e**，三个独立缺陷叠加，且症状都容易被误读：

| # | 症状 | 真因 | 修法 |
|---|---|---|---|
| ① | `'E2E' is not recognized as an internal or external command` | `"e2e": "E2E=1 npx playwright test"` 是 **Unix shell 语法**，cmd.exe 不识别（CI 是 bash 才一直没暴露） | 新增 `scripts/run-e2e.mjs`（Node 里设 env 再 spawn，两端一致） |
| ② | `7 passed / 7 did not run / Timed out waiting 180s`，看着像"测试崩了" | `globalTimeout` 180s 太紧：单用例仅 2~9s，但 14 个用例各起一个 chromium 加载 3.3MB 单文件，累积 >3 分钟 | 放宽到 600s，支持 `E2E_GLOBAL_TIMEOUT` 覆盖 |
| ③ | 用例**全部 ok**，随后报 `worker-0 process did not exit within 300000ms`，最终 `EXIT=1` | **本机沙箱环境问题，与代码无关**（详见下） | 不改代码；立判据 + 写进 `playwright.config.js` 注释 |

**③ 的定位过程**（`_probe/probe-exit*.mjs`，纯只读对照实验）：

- 打开 `about:blank` → `ctx.close()` 2.4s 返回 **OK**；
- 紧接的 `await browser.close()` **永不 resolve**（15s 未返回；照此每轮白等 300s）；
- `browser.process()` 返回 **null**（拿不到底层句柄，无法自行 kill）；
- 逐层降级仍卡 → 证明**与本应用代码、长驻定时器、`beforeunload` 全都无关**，
  是本机沙箱里 **chromium 的关闭路径不通**（与既有的「沙箱拦 `spawnSync` 子进程→`EBUSY`」同源）。

::: tip 本机判 e2e 的口径
只要输出里 `ok N` 的数量 == 用例总数、且**无 failed 用例**，就视为**本机通过**；
退出码一律**以 CI 为准**（CI 为 ubuntu，无此环境限制，同版本代码全绿）。
:::

---

## 四、可复用工具

> ⚠️ 本文档早期引用的 `_diag/*.mjs` 是**会话期临时目录，从未纳入 git，现已不存在**。
> 凡值得留下的验证手段，都已按下面的形式固化进仓库（tests/ 与 scripts/），避免再次丢失。

```bash
# 11 套主题渲染层不变量（真实浏览器，含对比度实测）
E2E=1 npx playwright test tests/e2e/theme-matrix.spec.js --project=desktop-1280x800

# 跨视口布局不变量
E2E=1 npx playwright test tests/e2e/viewport.spec.js

# 全量 e2e（CI 跑的就是这条）
npm run e2e

# 主题令牌静态守护（不启浏览器，快到秒级）
npx vitest run tests/theme-registration.test.js tests/theme-token-pairing.test.js
```

**两层守护的分工（新增主题时都要过）**：

| 层 | 手段 | 能发现 | 发现不了 |
|---|---|---|---|
| 静态（vitest） | `theme-registration`（53 条）+ `theme-token-pairing`（14 条） | 令牌漏注册、配对缺失、7 处同步点漏改 | 渲染出来看不见、对比度过低、控件消失 |
| 渲染（e2e） | `theme-matrix.spec.js`（4 条） | 对比度退步、主题静默失效、控件不可见/塌陷、溢出 | 令牌漏注册（静态层更擅长） |
