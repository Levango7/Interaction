// ===== Core Layer (核心层·全局助手与基础数据) =====
/* v3.7.9：把被绝大多数块共用的「全局助手」从各自叶块收敛到这里，作为最底层。
   动机来自 docs/module-graph.md 的实测：t(i18n) 被 22 个块使用、toast 21 个、SCENARIOS 18 个、
   ORDER 14 个 —— 它们散落在 UI 层里，导致依赖图出现大量"低层用高层符号"的逆层边（54 条）。
   本块是**纯搬迁**（不改一行实现），只把定义位置前移，使依赖方向回归"下层被上层依赖"。

   摆放顺序即依赖顺序：UI_ICONS（纯字面量）→ t → toast → SCENARIOS（纯字面量）→ ORDER。
   注意：核心层必须零外部依赖 —— 例如 `active` 的初始化调用 load()（定义在更靠后的 data-rw），
   因此**不能**放进这里，否则加载即 TDZ 报错。 */

const UI_ICONS = {
  overview:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21V3m0 18h18M7 17l4-5 3 3 5-7"/></svg>',
  plus:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>',
  check:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>',
  trash:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1.2 13.5h8.6L17.5 7M10 11v6M14 11v6"/></svg>',
  copy:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 9h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2zM5 15H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1"/></svg>',
  chat:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-11.5 7.2L4 20l1-4.5A8 8 0 1 1 21 12z"/></svg>',
  download:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v10m0 0 4-4m-4 4-4-4M5 19h14"/></svg>',
  upload:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21V11m0 0 4 4m-4-4-4 4M5 5h14"/></svg>',
  gear:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/><path d="M19.4 13.5a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 2.9-1.2V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  theme:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/></svg>',
  sun:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41m11.32-11.32l1.41-1.41"/></svg>',
  stats:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V10m6 10V4m6 16v-7m6 7V8"/></svg>',
  grid:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>',
  /* emoji 矢量化补齐（单引号包裹，供模板字符串 / innerHTML 用） */
  flame:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3c1.5 3 5 5 5 9a5 5 0 0 1-10 0c0-1.5.6-2.6 1.2-3.6.7 1 1.3 1.6 2.3 1.6C10 8 11 5.5 12 3z"/></svg>',
  book:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/></svg>',
  target:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/></svg>',
  brain:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 3 3 3 0 0 0 1 4 3 3 0 0 0 3 3 3 3 0 0 0 4 2V4z"/><path d="M15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 3 3 3 0 0 1-1 4 3 3 0 0 1-3 3 3 3 0 0 1-4 2V4z"/></svg>',
  chain:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
  robot:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="8" width="16" height="12" rx="2"/><path d="M12 8V4M8 4h8"/><circle cx="9" cy="13" r="1"/><circle cx="15" cy="13" r="1"/><path d="M9 17h6"/></svg>',
  puzzle:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 7h-3a2 2 0 0 1-2-2V4H9v1a2 2 0 0 1-2 2H4v6h1a2 2 0 0 1 2 2v1h6v-1a2 2 0 0 1 2-2h1V7h4v4h-1"/><path d="M4 13v6h6v-1a2 2 0 0 1 2-2"/></svg>',
  alert:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4 3 19h18L12 4z"/><path d="M12 10v4M12 17.5h.01"/></svg>',
  error:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/></svg>',
  file:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 13h6M9 17h4"/></svg>',
  search:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  /* v2.1.1：自定义/插件场景未选图标时的兜底（与 overview 主页区分，避免语义过载） */
  tag:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>',
  /* v2.4.0：工具箱专用图标 */
  md:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="7 8 4 12 7 16"/><polyline points="17 8 20 12 17 16"/><line x1="14" y1="4" x2="10" y2="20"/></svg>',
  word:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>',
  sheet:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></svg>',
  ppt:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>',
  pdf:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M9 15l2 2 4-4"/></svg>',
  ocr:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><circle cx="9" cy="10" r="1.5"/><circle cx="15" cy="10" r="1.5"/><path d="M9 14c0 1.5 1.5 3 3 3s3-1.5 3-3"/></svg>',
  cad:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6l-12.8 12.8"/></svg>',
  filter:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 3c-2.5 2-4 5-4 9s1.5 7 4 9c2.5-2 4-5 4-9s-1.5-7-4-9z"/><path d="M3 12h18"/></svg>',
  imggen:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-5-5L5 21"/></svg>',
  vidgen:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>',
  searchWeb:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/><path d="M2 11h20"/><path d="M12 2v9"/></svg>',
  regex:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 7 4 4 8 4"/><polyline points="9 20 15 20"/><polyline points="12 4 15 12 18 4"/><line x1="6" y1="20" x2="6" y2="4"/></svg>',
  compile:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 19 22 12 16 5"/><polyline points="8 5 2 12 8 19"/><line x1="13.5" y1="4" x2="10.5" y2="20"/></svg>',
  md2code:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="8 10 6 12 8 14"/><polyline points="16 10 18 12 16 14"/><line x1="13" y1="8" x2="11" y2="16"/></svg>',
  sport:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
  bill:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M12 12h.01"/><path d="M17 12h.01"/><path d="M7 12h.01"/><path d="M12 16h.01"/><path d="M7 16h.01"/><path d="M17 16h.01"/></svg>',
  shop:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>',
  takeout:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>',
  transit:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 17H3a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h2"/><path d="M19 17h2a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2"/><rect x="5" y="5" width="14" height="12" rx="2"/><circle cx="9" cy="14" r="1"/><circle cx="15" cy="14" r="1"/></svg>',
  mindmap:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="4" r="2"/><circle cx="4" cy="14" r="2"/><circle cx="20" cy="14" r="2"/><circle cx="8" cy="20" r="2"/><circle cx="16" cy="20" r="2"/><path d="M12 6v4"/><path d="M12 10l-5 3"/><path d="M12 10l5 3"/><path d="M8 16v2"/><path d="M16 16v2"/></svg>',
  kb:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/><line x1="8" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="13" y2="14"/></svg>',
  /* ===== v3.6.5 图标去重：为原先"多工具共用同一图标"的场景补语义化图标 =====
     此前 flame 被「笃行」「萌宠」共用、sport 被「运动记录」「闹钟」共用、
     stats 被「时间追踪」「高级报表」共用、grid 被「热力图」「仪表盘」「日历」三处共用，
     导致工具箱里出现肉眼可见的重复图标（用户反馈"图标去重化"）。 */
  paw:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="16.5" rx="4.2" ry="3.6"/><ellipse cx="5.6" cy="11" rx="2.1" ry="2.6"/><ellipse cx="9.6" cy="6.8" rx="2.1" ry="2.6"/><ellipse cx="14.4" cy="6.8" rx="2.1" ry="2.6"/><ellipse cx="18.4" cy="11" rx="2.1" ry="2.6"/></svg>',
  bell:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>',
  stopwatch:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="14" r="7"/><path d="M12 14V10.5"/><path d="M9.5 2h5"/><path d="M12 2v3.2"/><path d="M18.4 7.6l1.6-1.6"/></svg>',
  heat:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="16" width="5" height="5" rx="1"/><rect x="9.5" y="11" width="5" height="10" rx="1"/><rect x="16" y="6" width="5" height="15" rx="1"/></svg>',
  gauge:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 14l3.5-3.5"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/></svg>',
  calendar:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
};

/**
 * 翻译函数：按 key 查找当前语言对应文案
 * 查找顺序：当前语言 → 中文（兜底）→ fallback → key 本身
 * @param {string} key - 消息 key（如 "common.save"）
 * @param {string} [fallback] - 找不到 key 时的兜底文案
 * @returns {string} 翻译后的文案
 */
/* ===== AppBridge：跨层调用的受控通道（v3.7.12 · 见 docs/decoupling-plan.md 工具 B）=====
   核心层**只声明接口、不实现** —— 这样 core 保持零外部依赖（这是硬约束，有门禁守着）。
   实现由上层在自己的块加载时注册；下层（Data/AI）只调接口。
   未注册时是**安全空操作**：这是刻意设计而非遗漏 —— 让"加载顺序"不至于变成隐性依赖，
   也避免 EventBus 那种"漏订阅就静默丢事件"的坑。 */
const AppBridge = {
  /* 渲染调度：Data/AI 改完数据后请求重绘（实现见 render-entry 块的注册段） */
  render: () => {},
  /* 题库保存后钩子（错题自动入 SM-2 复习）：实现由 Data 层注册 */
  onExerciseSave: null
};
/* 通知/toast 用的图标表（TOAST_ICONS 依赖 UI_ICONS，故紧随其后声明）；从 ui-theme 下移而来 */
const TOAST_ICONS = { ok: UI_ICONS.check, warn: UI_ICONS.alert, error: UI_ICONS.error, danger: UI_ICONS.error };

function t(key, fallback){
  /* v2.2.0：MESSAGES 为 const，模块加载早期（TDZ）或字典缺失时回退兜底，不抛错 */
  let msgs = null;
  try{ msgs = MESSAGES[_currentLang] || MESSAGES.zh; }catch(e){ msgs = null; }
  if(msgs){
    const val = msgs[key];
    if(val !== undefined) return val;
    // fallback 到中文（确保即使 en 缺 key 也有合理输出）
    const zhVal = MESSAGES.zh[key];
    if(zhVal !== undefined) return zhVal;
  }
  // fallback 到传入的 fallback 或 key 本身
  return fallback !== undefined ? fallback : key;
}

function toast(msg, type){
  let c=$("#toasts"); if(!c){ c=document.createElement("div"); c.id="toasts"; c.setAttribute("role","status"); c.setAttribute("aria-live","polite"); document.body.appendChild(c); }
  const d=document.createElement("div"); d.className="toast"+(type?" "+type:"");
  // 图标 DOM 插入（非 textContent）：保住 XSS 防线，纯视觉增强
  const key = (type && TOAST_ICONS[type]) ? type : null;
  if(key){
    const icEl=document.createElement("span"); icEl.className="ic-inline"; icEl.style.margin="0 6px 0 0";
    // 可信的静态 SVG 字符串（无用户输入），直接用 innerHTML
    icEl.innerHTML = TOAST_ICONS[key];
    d.appendChild(icEl);
  }
  d.appendChild(document.createTextNode(msg)); // 用户输入走 textNode，不怕 XSS
  // 危险/错误提示：改为 assertive alert，确保读屏立即播报（a11y）
  if(type==="error"||type==="danger"){ d.setAttribute("role","alert"); d.setAttribute("aria-live","assertive"); }
  c.appendChild(d); requestAnimationFrame(()=> d.style.opacity="1");
  setTimeout(()=>{ d.style.opacity="0"; setTimeout(()=> d.remove(), 250); }, 3600);
  return d; // v1.9.3g：返回元素，供调用方挂点击（如 SW 更新提示「点击刷新」）
}

/* ---------- 场景配置（单一真相源：A-P2-7 收编 icon / sysprompt / extraCard） ---------- */
const SCENARIOS = {
  office:{ name:t("scenario.office", "办公"), color:"#0a6cbd",
    icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 4h4a2 2 0 0 1 2 2v1h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h3V6a2 2 0 0 1 2-2zm0 2v1h4V6h-4z"/></svg>',
    sysprompt:t("sysprompt.office", "你是一个专业的办公效率助手，帮用户梳理任务、写会议纪要、润色邮件与文档。回答简洁、可执行。"),
    extraCard:"report",
    record:{ label:t("record.office.label", "会议纪要"),
      // v3.1.2 B-档：资料库会议纪要此前只有主题/参会人/结论 3 字段，会议管理有 6 字段（含日期/主持人/时长）——同一场会议要录两遍且互不引用。
      // 补齐 date/host/duration 三字段对齐会议管理，数据可互通。
      fields:[
        {k:"title",label:t("field.meetingTitle", "会议主题"),type:"text"},
        {k:"type",label:t("field.meetingType","会议类型"),type:"select",options:[t("type.weeklyMeeting","周会"),t("type.review","评审"),t("type.client","客户"),t("type.team","团队"),t("option.other","其他")]},
        {k:"date",label:t("field.date","日期"),type:"date"},
        {k:"host",label:t("field.host","主持人"),type:"text"},
        {k:"who",label:t("field.attendees", "参会人"),type:"text"},
        {k:"duration",label:t("field.durationHours","时长(小时)"),type:"number"},
        {k:"note",label:t("field.conclusion", "结论 / 跟进"),type:"textarea"}
      ] } },

  design:{ name:t("scenario.design", "设计"), color:"#d6409f",
    icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/></svg>',
    sysprompt:t("sysprompt.design", "你是一个设计创意助手，擅长视觉设计建议、配色方案、版式构图与创意灵感激发。回答有画面感、可落地。"),
    extraCard:"design",
    record:{ label:t("record.design.label", "作品记录"),
      fields:[
        {k:"type",label:t("field.type", "类型"),type:"select",options:[t("option.poster", "海报"),t("option.logo", "Logo"),t("option.illustration", "插画"),t("option.ui", "UI 界面"),t("option.photo", "摄影"),t("option.other", "其他")]},
        {k:"title",label:t("field.workName", "作品名"),type:"text"},
        {k:"img",label:t("field.image", "图片"),type:"image"}, // v3.2 C-档：作品图（IDB blob 存储，不占 localStorage 配额）
        {k:"note",label:t("field.inspiration", "灵感 / 备注"),type:"textarea"}
      ] } },

  study:{ name:t("scenario.study", "学习"), color:"#d97706",
    icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5a2 2 0 0 1 2-2h6v16H6a2 2 0 0 0-2 2V5zm16 0a2 2 0 0 0-2-2h-6v16h6a2 2 0 0 1 2 2V5z"/></svg>',
    sysprompt:t("sysprompt.study", "你是一个学习方法教练，擅长制定学习计划、拆解知识点、记忆与复习策略。"),
    extraCard:"review",
    record:{ label:t("record.study.label", "学习资料"),
      // v3.1.2 B-档：学习资料此前无来源字段——SM-2 到期复习时看到主题却点不开任何原始材料。补 source/url + 关联任务。
      fields:[
        {k:"title",label:t("field.topic", "主题"),type:"text"},
        {k:"type",label:t("field.type", "类型"),type:"text"},
        {k:"source",label:t("field.source","来源链接"),type:"text",placeholder:"https://... / 书名 / 课程名"},
        {k:"status",label:t("field.status", "状态"),type:"text"},
        {k:"note",label:t("side.sub.notes", "笔记"),type:"textarea"}
      ] } },

  data:{ name:t("scenario.data", "数据"), color:"#0d9488",
    icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/></svg>',
    sysprompt:t("sysprompt.data", "你是一个数据分析助手，擅长数据清洗、指标拆解、图表选型与洞察提炼。回答用数据说话、结论明确。"),
    extraCard:"data",
    record:{ label:t("record.data.label", "数据记录"),
      fields:[
        {k:"type",label:t("field.type", "类型"),type:"select",options:[t("option.metricSnapshot", "指标快照"),t("option.analysisConclusion", "分析结论"),t("option.dataSource", "数据源"),t("option.report", "报表")]},
        {k:"title",label:t("field.title", "标题"),type:"text"},
        {k:"value",label:t("field.metricValue", "指标数值"),type:"text",placeholder:"65.2 / 128 / 12.5%"}, // v3.1.2 A-档：指标快照此前无数值字段，「记了体重 65.2」无处填
        {k:"note",label:t("field.note", "备注"),type:"textarea"}
      ] } },

  code:{ name:t("scenario.code", "编程"), color:"#34a853",
    icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.4 16.6 4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0L19.2 12l-4.6-4.6L16 6l6 6-6 6-1.4-1.4z"/></svg>',
    sysprompt:t("sysprompt.code", "你是一个资深全栈工程师，擅长代码实现、调试与架构建议。给出可直接运行的代码并解释关键点。"),
    extraCard:"code",
    record:{ label:t("record.code.label", "代码片段"),
      // v3.1.2 A-档：lang 由自由文本改 select（"js/JS/JavaScript"被统计成 3 种语言的分裂源）+ 补 project 归属字段
      fields:[{k:"lang",label:t("field.lang", "语言"),type:"select",options:["JavaScript","TypeScript","Python","Java","Go","Rust","C/C++","SQL","HTML/CSS","Shell",t("option.other","其他")]},
        {k:"project",label:t("field.project", "项目"),type:"text",placeholder:"如 工坊重构 / 个人的小站"},
        {k:"title",label:t("field.title", "标题"),type:"text"},{k:"code",label:t("field.code", "代码"),type:"textarea"}] } },

  life:{ name:t("scenario.life", "生活"), color:"#7c5cbf",
    icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>',
    sysprompt:t("sysprompt.life", "你是一个生活与健康管家，帮用户管理日常事务、运动记录、体重追踪、睡眠记录和喝水提醒。回答实用、贴心、有条理。"),
    extraCard:"life",
    record:{ label:t("record.life.label", "生活记录"),
      // v3.2 C-档拆分：type 健康五类（运动/体重/身高/睡眠/喝水）收敛到「健康」功能 tab（结构化真相源），
      // 资料库只留日常事务——旧健康类记录仍被 getHealthRecs 双源聚合读取（B-档），数据不丢。
      fields:[
        {k:"type",label:t("field.type", "类型"),type:"select",options:[t("option.daily", "日常事务")]},
        {k:"title",label:t("field.title", "标题"),type:"text"},
        {k:"value",label:t("field.value", "数值"),type:"text",placeholder:t("field.valuePlaceholder", "如：5km / 65.2kg / 7.5h / 8杯")},
        {k:"note",label:t("field.note", "备注"),type:"textarea"}
      ] } },

  /* v3.5.2 新增场景：健康（运动/体重/睡眠/饮水/饮食） */
  health:{ name:t("scenario.health", "健康"), color:"#10b981",
    icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>',
    sysprompt:t("sysprompt.health", "你是一个健康管理助手，帮用户记录运动、体重、睡眠、饮水和饮食，分析趋势并给出科学建议。回答专业、温和、有数据支撑，不替代医疗诊断。"),
    extraCard:"health",
    record:{ label:t("record.health.label", "健康记录"),
      fields:[
        {k:"type",label:t("field.type", "类型"),type:"select",options:[t("health.sport","运动"),t("health.weight","体重"),t("health.sleep","睡眠"),t("health.water","饮水"),t("health.diet","饮食")]},
        {k:"date",label:t("field.date", "日期"),type:"date"},
        {k:"value",label:t("field.value", "数值"),type:"text",placeholder:t("health.valuePh", "如：5km / 65.2kg / 7.5h / 8杯")},
        {k:"duration",label:t("field.durationHours", "时长(小时)"),type:"number"},
        {k:"note",label:t("field.note", "备注"),type:"textarea"}
      ] } },

  /* v3.5.2 新增场景：理财（收支 / 基金 / 股票） */
  finance:{ name:t("scenario.finance", "理财"), color:"#c9a227",
    icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v10M9.5 9.5h4a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3h4"/></svg>',
    sysprompt:t("sysprompt.finance", "你是一个个人理财助手，帮用户记录收支、跟踪基金与股票持仓、分析资产配置与风险。回答理性、合规，明确不构成投资建议。"),
    extraCard:"finance",
    record:{ label:t("record.finance.label", "理财记录"),
      fields:[
        {k:"type",label:t("field.type", "类型"),type:"select",options:[t("fin.expense","支出"),t("fin.income","收入"),t("fin.fund","基金"),t("fin.stock","股票"),t("fin.other","其他投资")]},
        {k:"category",label:t("field.category", "类别"),type:"text",placeholder:t("fin.categoryPh", "如：餐饮 / 工资 / 沪深300")},
        {k:"amount",label:t("field.amount", "金额"),type:"number"},
        {k:"date",label:t("field.date", "日期"),type:"date"},
        {k:"note",label:t("field.note", "备注"),type:"textarea"}
      ] } }
};

/* v2.1.0：6 内置场景——新增 设计(design)/数据(data)；顺序即侧栏场景组显示序与滑动手势序 */
const ORDER = ["office","data","design","study","code","life","health"];

/* v3.7.11：场景→特性绑定表（纯数据）。原先放在 render-scene-main（Render 层），
   但被 3 个更靠前的块引用 → 逆层依赖。移到核心层：它是"数据"，与 UI 渲染无关。 */
/* v3.0：功能卡绑定配置（key + 表单字段名；与 SCENE_FEATURE_RENDER 的渲染配置一一对应） */
const SCENE_FEATURE_BIND = {
  office: {
    meeting:    { key:"meetings",    fieldKeys:["title","type","date","host","duration","note"] },
    project:    { key:"projects",    fieldKeys:["name","owner","milestone","status","progress","due"] },
    attendance: { key:"attendance",  fieldKeys:["date","type","checkIn","checkOut","note"] },
    expense:    { key:"expenses",    fieldKeys:["title","who","amount","category","date","status"] }
  },
  study: {
    knowledge: { key:"knowledge", fieldKeys:["title","category","source","importance","tags","content"] },
    reading:   { key:"reading",   fieldKeys:["book","author","status","progress","rating","startDate","finishDate","excerpt","note"] },
exercise:  { key:"exercises", fieldKeys:["subject","question","answer","correct","explain"],
  /* v3.2 任务四阶段二：错题自动入 SM-2 复习（正确率 < 70 视为错题 → 写入 rec_study 复习队列）。
     v3.7.12（解耦 S0）：实现**移出核心层** —— 它要调 getRec/setRec（Data 层），留在 core 会让
     core 反向依赖 Data。核心层只保留"钩子调用"，具体实现由 Data 层通过 AppBridge 注册。
     行为完全不变（实现逐字搬迁，含 typeof 守卫与字段顺序）。 */
  onSave:function(rec){
    if(typeof AppBridge.onExerciseSave === "function") AppBridge.onExerciseSave(rec);
  }
},
    exam:      { key:"exams",     fieldKeys:["title","subject","date","score","total"] }
  },
  data: {
    report: { key:"data_reports", fieldKeys:["title","source","dims","metrics","note"] },
    /* v3.0.1 B-5：chart 卡扩展 data（JSON 数据点）+ chartType（图表类型），旧记录无新字段仍按台账行显示 */
    chart:  { key:"data_charts",  fieldKeys:["title","type","source","data","chartType","note"] },
    /* v3.1.2 A-档：SQL 查数能力复用给 data 场景（独立存储键 data_sql，与 code_sql 不互串；
       运行按钮 data-f-sqlrun 是全局事件委托，同一实现天然兼容双场景） */
    sql:    { key:"data_sql",     fieldKeys:["title","db","schema","sql","note"] }
  },
  design: {
    ui:      { key:"design_ui", fieldKeys:["title","type","tool","palette","note"] },
    model3d: { key:"design_3d", fieldKeys:["title","format","usage","note"] },
    cad:     { key:"design_cad", fieldKeys:["title","type","version","note"] },
    image:   { key:"design_image", fieldKeys:["title","type","size","note"] }
  },
  code: {
    frontend: { key:"code_frontend", fieldKeys:["title","framework","html","css","js"] },
    sql:      { key:"code_sql",      fieldKeys:["title","db","schema","sql","note"] },
    runner:   { key:"code_runner",   fieldKeys:["title","language","code","result"] },
    regex:    { key:"code_regex",    fieldKeys:["title","pattern","text","result"] }
  },
  life: {
    plan:   { key:"life_plans",    fieldKeys:["title","type","priority","date","note"] },
    health: { key:"life_health",   fieldKeys:["date","weight","exercise","sleep","note"] },
    bill:   { key:"life_bills",    fieldKeys:["name","amount","cycle","due","status"] },
    shop:   { key:"life_shopping", fieldKeys:["name","qty","amount","status"] }
  }
};
