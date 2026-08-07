"use strict";

/* ============================================================
 * JSDoc 类型定义（仅用于类型标注/IDE 提示，不影响运行时）
 * 用 `/** *\/` 格式；tsc --noEmit 在 checkJs:false 下不强制检查
 * ============================================================ */
/**
 * @typedef {Object} Task
 * @property {string} id
 * @property {string} sc - 场景: office|code|study|life
 * @property {string} title
 * @property {string} status - todo|doing|done
 * @property {number|null} doneAt
 * @property {string[]} tags
 * @property {number} created
 * @property {number} [updatedAt]
 * @property {string} [due]
 * @property {string} [priority] - ""|P0|P1|P2
 * @property {boolean} [linked]
 * @property {number} [deletedAt]
 * @property {string} [note]
 */

/**
 * @typedef {Object} AIProfile
 * @property {string} id
 * @property {string} name
 * @property {string} base
 * @property {string} key
 * @property {string} model
 */

/**
 * @typedef {Object} Cfg
 * @property {AIProfile[]} [profiles]
 * @property {string} [activeId]
 * @property {boolean} [enabled]
 * @property {string} [theme]
 * @property {boolean} [agent]
 * @property {string} [base]
 * @property {string} [key]
 * @property {string} [model]
 * @property {number} [aiTimeoutSec]
 * @property {number} [aiTemperature]
 */

/**
 * @typedef {Object} Link
 * @property {string} id
 * @property {string} name
 * @property {string} fromSc
 * @property {string} kw
 * @property {string} toSc
 * @property {string} taskTitle
 * @property {string} priority
 * @property {boolean} enabled
 */

/**
 * @typedef {Object} StreakInfo
 * @property {number} current
 * @property {number} best
 * @property {number} thisWeek
 */

/* ===== Bootstrap (启动与全局常量) ===== */
const PREFIX = "wb_agent_";
const VERSION = "1.1.6";

/* ---------- P1-a MVP 范围边界（收敛声明，防范围蔓延） ----------
 * 本常量不是运行时配置，而是「契约护栏」：任何新增能力若落入 OUT_OF_SCOPE，
 * 必须先回到需求侧确认并升级版本，而非直接塞进 MVP。请勿删除 pendingConfirm 等
 * 既有危险操作确认逻辑——它是 delete/update 的实时闸门（活跃代码，非死代码）。
 */
const MVP_SCOPE = {
  version: VERSION,
  IN_SCOPE: [
    "多场景任务看板（office/code/study/life/overview）",
    "任务 CRUD + 完成/软删（pendingConfirm 二次确认闸门）",
    "场景联动规则（源场景完成 → 跨场景生成奖励/后续任务）",
    "AI 助手（工具调用：search/complete/update/delete + 场景记忆注入）",
    "Agent 工作记忆（remember/recall/forget，按场景隔离 + 近期/命中加权召回，自动注入对话上下文）",
    "Agent 多步目标编排（plan/complete_step/complete_goal，单目标聚焦，跨场景拆步，循环上限放宽）",
    "AI Key 本地加密存储（AES-GCM + 设备密钥，不落明文/不传网络）",
    "办公会议纪要/编程代码片段/学习资料/生活备忘等多类记录（rec_*）",
    "本地自动备份快照（P1-b，独立于手动导出）",
    "SM2 间隔重复记忆（study 场景）",
    "桌面端 Electron 壳（开机自启/Key 交主进程保管）",
  ],
  OUT_OF_SCOPE: [
    "多端实时同步 / 云端账户体系（v2 评估）",
    "团队协作 / 多人在线编辑（v2 评估）",
    "后端服务 / 远程 API（当前为纯前端 + 本地存储）",
    "细粒度权限 RBAC（单用户本地应用，不需要）",
    "国际化 i18n（当前仅 zh-CN）",
  ],
  KNOWN_CONTRACT_EXCEPTIONS: [
    "overview 为瞬态视图，不持久化（按 g 切换，不写入存储）",
    "execTool 的 force 为内部确认触发参数，不进入 TOOLS schema（AI 只发 task_id）",
    "Electron 下 AI Key 由主进程保管，渲染进程 cfg 中 key 为空占位（P0-3）",
  ],
};
/**
 * DOM 查询辅助：渐进式类型化阶段返回 any（DOM 元素属性异构：value/checked/自定义标志位），
 * 后续随 JSDoc 细化逐步收紧。
 * @type {(s:string, r?:ParentNode)=>any}
 */
const $ = (s, r=document) => r.querySelector(s);
/** @type {(s:string, r?:ParentNode)=>any[]} */
const $$ = (s, r=document) => [...r.querySelectorAll(s)];

/**
 * 安全获取场景元数据（D3/L4/M7 防护）：任务或链引用了非法/损坏的 sc 时，
 * 返回带降级 name/color/icon 的对象，避免 SCENARIOS[sc].name 抛错导致整页渲染崩溃。
 * @param {string} sc - 场景键
 * @returns {{name:string,color:string,icon:string}}
 */
function scMeta(sc){
  const s = SCENARIOS[sc];
  return s ? { name: s.name, color: s.color, icon: s.icon || "" }
           : { name: "?", color: "var(--muted)", icon: "" };
}

