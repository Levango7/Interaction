# 前端控件矩阵审查报告

> 生成于 2026-09-24 · 基于 v3.7.36 · 扫描脚本 `_diag/inventory.mjs` + `_diag/audit-ui.cjs`
> 方法：静态扫源码（找"写了什么"）+ 运行时扫 DOM（看"渲染成什么"）
>
> **维护状态（2026-09-24 复核，v3.7.41）**：P0 / P1 / P2 已全部清空。
> 本文档的「矩阵」与「分级」两节保留 v3.7.36 当时的实测数据作为**基线快照**；
> 后续补齐情况见文末「v3.7.38 / 3.7.39 二次补齐」一节。**其余 P3 仅剩主题截图矩阵一项。**

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

### 📋 仍剩（P3，非阻断）

- **`audit-ui.cjs` 主题截图矩阵未做**：当前只验默认主题，未遍历 11 套主题逐控件截图比对。
  这是**唯一**实质遗留项。
- `check:pwa-icons` / `lint-tokens` 未接入 CI（前者手动跑 ✓；后者自我声明"CI 不强制阻断"，属有意为之）。
  `check:ai-tools-doc` 已于 v3.7.41 修复并接入 CI。


---

## 四、可复用工具

```bash
# 控件清单（静态 + 运行时）
node _diag/inventory.mjs

# 全站 UI 扫描（11 场景 × 5 维度）
node _diag/audit-ui.cjs

# 逐控件行为验证（示例：可编辑时间下拉）
node _diag/v3735-time.cjs
```

**扩展 `audit-ui.cjs` 的建议维度**：
1. 遍历 11 套主题，对每个控件截图比对（当前只验默认主题）
2. 键盘走查：Tab 序是否合理、焦点环是否可见、Esc 是否关闭
3. 状态覆盖：disabled / readonly / 校验失败的视觉是否存在
