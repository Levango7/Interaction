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
  /* v3.7.122：关闭（✕ 的矢量化替代）。存量 18 处关闭按钮此前直接写字形 ✕（字符图标门禁
     lint-icons 的 P0 基线主体）—— 字形随字体走、跨平台渲染宽度不一致，且不可参与
     stroke-width / currentColor 描边与对齐规范（同 v3.7.120 list 的整改理由）。
     尺寸由各调用点的内联 span 按图标档位令牌给（var(--icon-sm/set/md/lg)），不写裸 px。 */
  close:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
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
  /* v3.7.120：清单/源列表（☰ 的矢量化替代）。此前日历「订阅日历源」按钮直接写字形 ☰ ——
     字符图标的字号随字体走、跨平台渲染宽度不一致，且不可参与描边/对齐规范。
     尺寸由 `.cal-nav svg` 规则统一给（图标档位 16px），不会裸 px。 */
  list:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/></svg>',
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
  onExerciseSave: null,
  /* v3.7.14（解耦 S2a）：动作类接口 —— 低层只调接口，实现由 UI/Render 层注册 */
  openDrawer: () => {},
  openAiPage: () => {},
  /* 入回收站：有返回值，注册时整体替换以保留签名与返回值 */
  addToRecycleBin: () => undefined,
  /* 任务完成动作（含跨场景联动副作用）：实现由 Chain 层注册 */
  completeTask: () => undefined,
  /* 迷你图表：返回 SVG 字符串（调用侧拼进 HTML），默认空串保证拼接安全 */
  miniChart: () => ""
,
  snoozeTask: () => undefined,
  /* v3.7.75：侧栏局部重绘（插件注册/启停后刷新场景列表）——实现由 render-widgets 注册 */
  renderSide: () => undefined,

  _moveDrawerHome: () => undefined,
  openTemplateModal: () => undefined,
  registerPluginFromJson: () => undefined,
  closeDrawer: () => undefined,

  bindScenario: () => undefined,
  setupKanbanDnD: () => undefined,
  setupKanbanKeyboard: () => undefined,
  openTaskEdit: () => undefined,
  bindReportCard: () => undefined,
  bindReviewCard: () => undefined,

  _switchSetTab: () => undefined,
  toggleToolPop: () => undefined,

  renderHelp: () => undefined,
  /* v3.7.78：render 簇槽（回收站/工具卡/四个工具弹窗） */
  openRecycle: () => undefined,
  openToolStub: () => undefined,
  openAlarmModal: () => undefined,
  openChartStore: () => undefined,
  openWeatherModal: () => undefined,
  openPetModal: () => undefined,
  /* v3.7.78：数据量巡检（onboarding/scene-bind 触发，实现带通知副作用属 backup-stats） */
  checkCount: () => undefined,
  /* v3.7.78：主题 API（ui-drawer 设置页与 ui-global-events 命令面板经桥调用） */
  setTheme: () => undefined,
  getCurrentTheme: () => "",
  getCustomThemes: () => [],
  saveCustomThemes: () => undefined,
  createCustomTheme: () => undefined,
  deleteCustomTheme: () => undefined,
  updateCustomTheme: () => undefined,
  exportTheme: () => undefined,
  importTheme: () => undefined,
  getScenarioColors: () => ({}),
  saveScenarioColors: () => undefined,
  /* v3.7.78：笔记/搜索弹窗关闭与搜索执行（ui-drawer 经桥调用） */
  closeKnowledgeBaseModal: () => undefined,
  closeNoteEditorModal: () => undefined,
  closeNotesModal: () => undefined,
  closeSearchModal: () => undefined,
  openSearchModal: () => undefined,
  executeSearch: () => undefined,

  /* v3.7.77（解耦 S2b 第二批）：知识库 / 日历 / 报表三簇 —— render 块经桥调用，
     实现由各自 UI 块加载时注册（ui-ge-notes / ui-ge-calendar / ui-ge-theme）。 */
  openKnowledgeBaseModal: () => undefined,
  openNotesModal: () => undefined,
  openReportModal: () => undefined,
  bindReportModal: () => undefined,
  openMindmapModal: () => undefined,
  openGanttModal: () => undefined,
  openDashboardModal: () => undefined,
  bindCalendarEvents: () => undefined,
  bindDashboardDnD: () => undefined,
  _bindDashToolbar: () => undefined,
  /* 返回 HTML 串（拼进模板）：默认空串保证拼接安全 */
  renderCalendarView: () => "",
  /* 异步返回：默认 null/空串让调用方的 if 兜底自然走降级分支 */
  aiSmartRecommend: () => Promise.resolve(null),
  _aiChatText: () => Promise.resolve(""),
  /* v3.7.77：插件场景复用内置场景特性的读写口（data-links 注册自定义场景时用，
     取代直接读写 render-scene-main 的 SCENE_FEATURE_RENDER 表 —— 最后一条真跨层逆层边） */
  getSceneFeature: () => undefined,
  setSceneFeature: () => undefined,
};
/* 通知/toast 用的图标表（TOAST_ICONS 依赖 UI_ICONS，故紧随其后声明）；从 ui-theme 下移而来 */
const TOAST_ICONS = { ok: UI_ICONS.check, warn: UI_ICONS.alert, error: UI_ICONS.error, danger: UI_ICONS.error };

/* v3.7.37：时间字段的选项生成器（供各处复用）。
   背景：原生 <input type="time"> 的弹出选择器是**系统样式**，在 11 套主题下都与
   设计系统脱节；而它又是全站仅剩的两处原生弹层控件（闹钟、AI 工作流时间）。
   统一改为「<select data-editable>」—— 既能从列表选，也能直接敲 "09:30"
   （combobox 逻辑见 src/ui-select.js）。
   5 分钟粒度共 288 档；selected 为要预选的值，emptyLabel 非空时插入一个空值项
   （会被可编辑模式当作 placeholder）。 */
function timeOptionsHtml(selected, emptyLabel){
  var out = emptyLabel ? '<option value="">' + emptyLabel + '</option>' : '';
  for (var h = 0; h < 24; h++) {
    for (var m = 0; m < 60; m += 5) {
      var v = String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
      out += '<option value="' + v + '"' + (v === selected ? " selected" : "") + '>' + v + '</option>';
    }
  }
  return out;
}


/* v3.7.16（解耦 S3）：渲染调度 —— 数据层改完数据只"置脏"，由本函数在下一帧统一请求重绘。
   两个收益：
     ① Data 层不再认识"渲染"这个概念，只依赖核心层的 markDirty（依赖方向回归向下）
     ② **同一帧内多次数据变更只触发一次渲染**（批量导入 / 迁移 / AI 连续写数据时最明显）
   为什么用 rAF 而不是同步调用：rAF 回调必然在本轮脚本执行完之后才跑，那时各层早已注册完毕 ——
   顺带保证"调用早于注册"也不会丢渲染（这一点在 S2 的桥接里是隐性风险，这里彻底消掉）。
   无 rAF 的环境（如 jsdom 默认）回退 setTimeout，保证行为一致、可测。 */
let _dirty = false;
function markDirty(){
  if (_dirty) return;
  _dirty = true;
  const run = function(){ _dirty = false; try { AppBridge.render(); } catch (_e) { /* 渲染异常不影响数据写入 */ } };
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(run);
  else setTimeout(run, 0);
}

// 支持的语言列表
/* v3.7.57：AI base URL 校验从 ai-loop 上移到核心层。
   原因：ai-tools 也要用它（embedding 通道复用同一口径），而 ai-loop 在 order.json 里排在
   ai-tools 之后 → 直接引用会新增 ai-tools>ai-loop 逆层边并闭合出循环依赖（check:modules 实测）。
   它是纯字符串逻辑、零依赖，放这里才是它本来的层级。 */
function validateBaseUrl(base){
  if (!base || typeof base !== "string") return false;
  try {
    const u = new URL(base);
    if (u.protocol === "https:") return true;
    if (u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1")) return true;
    return false;
  } catch (e){ return false; }
}
