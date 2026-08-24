# 单文件架构分层契约（v1.15 起）

> 本文件是"渐进拆模块"第一里程碑的产物：为 `agent-workbench.html`（~27,300 行单文件）
> 建立可校验的模块边界契约，后续拆分时以此为据，防止结构漂移。
>
> 校验入口：`node scripts/lint-layers.mjs`（已接入 `npm run build:check`，退出码非 0 即 fail）。
>
> **架构现状（v2.4.1）**：`agent-workbench.html` 是唯一交付真相源。早期 `src/modules` 模块化快照
> 已归档删除（git tag `archive/src-snapshot-v1.9.9`），不再参与构建，`scripts/build.mjs` 不做
> src→HTML 字节拼接。分层契约以单文件内的 `// ===== <Name> Layer` 注释边界为准。

---

## 一、文件总结构（4 大段）

| 段 | 行区间（当前） | 内容 |
|---|---|---|
| `<style>` 样式层 | ~22 – 2812 | 全部 CSS（令牌体系 / 布局 / 组件 / 主题 / 断点） |
| 静态 HTML 骨架 | ~2813 – 3644 | 顶栏 / 侧栏 popover / 抽屉 / 弹窗 / 模板 |
| `<script>` 脚本层 | ~3645 – 27311 | 全部 JS（分层见下） |
| 收尾 | 末尾 | `</script></body></html>` |

---

## 二、JS 分层（31 块，8 大层）

> 行号为当前快照，可能随迭代漂移——**以 `lint-layers.mjs` 输出为准**（`--json` 可程序化消费）。

| 层 | 子块数 | 职责 |
|---|---|---|
| **Bootstrap** | 5 | 全局常量 / 诊断基础设施 / 配置常量 / 启动序列 / __test 导出 |
| **Data Layer** | 4 | IDB 持久镜像 / 联动规则与全局状态 / 迁移与初始化 / 读写 |
| **Crypto Layer** | 1 | AI Key AES-GCM 加密 + Electron 主进程托管路径 |
| **Chain Layer** | 1 | 习惯链：任务完成联动 / streak / 热力图数据 |
| **AI Layer** | 3 | 工具调用（execTool+16 工具）/ 对话循环（chatOnce）/ 取消重试控制器 |
| **Render Layer** | 5 | 小工具 / 概览 / 场景细分 / 场景主区 / 入口 |
| **UI Layer** | 10 | 主题通知 / Onboarding / 指南 / 场景绑定 / 命令面板 / 每日播报 / 备份统计 / 设置抽屉 / 快捷键 / 全局事件 |
| **Util Layer** | 2 | Markdown 解析 / 性能优化 |

---

## 三、依赖方向（拆分顺序的依据）

```
Bootstrap (常量/工具)
  └→ Data Layer ──→ Crypto Layer
         └──→ Chain Layer ──→ AI Layer ──→ Render Layer
                    └──────────→ UI Layer
```

- **Bootstrap / Data / Crypto / Util**：无 DOM 强依赖（或仅 localStorage），是**最安全先拆**的候选
- **Chain / AI**：依赖 Data + 部分 UI（toast），中等
- **Render / UI**：强 DOM 耦合，最后拆

---

## 四、渐进拆分路线图（每步可独立交付）

| 步骤 | 目标 | 收益 | 风险 |
|---|---|---|---|
| ① 分层契约（已完成） | `lint-layers.mjs` 校验边界 | 防漂移基线 | 低（只读脚本） |
| ② 抽取 Util Layer | mdToHtml / 性能工具 → 独立文件，构建时拼接回 | 首个"真模块" | 中（需构建拼接） |
| ③ 抽取 Crypto/Data | 加密 + 存储层独立 | 数据层可单测 | 中 |
| ④ 抽取 Chain/AI | 习惯链 + AI 引擎独立 | 逻辑层解耦 | 中高 |
| ⑤ Render/UI 渐进 | 最后拆分（DOM 耦合最强） | 完全模块化 | 高 |

> ⚠️ 关键约束：交付物始终是单文件（file:// 直开 + 三种运行形态共用），
> 拆分必须通过"构建时拼接回单文件"实现，不能改为运行时多 `<script src>`（file:// 下会失败）。
>
> 📌 **现状注记**：步骤 ②~⑤ 曾以 `src/modules` 形式试验过一轮，后因 file:// 直开约束与
> 拼接复杂度回退归档（git tag `archive/src-snapshot-v1.9.9`）。当前以单文件 + 分层契约
> 为稳定形态，步骤 ②~⑤ 暂缓，待有强需求再重启。`scripts/build.mjs` 现仅做版本一致性
> 校验与 `--prod` 测试钩子置位，不做物理拼接。

---

## 五、新增分层规范

- 新增 JS 功能块时，用 `// ===== <Name> Layer (<说明>)` 注释开头（与现有格式一致），`lint-layers.mjs` 自动纳入校验。
- 删除模块时，同步删除注释标记；`lint-layers` 的"连续层间必须有内容"规则会兜住"删空"。
- 关键层（Bootstrap/Data/AI/Render/UI/Util/Crypto/Chain）缺失时校验 fail。
