// ===== UI Layer (交互层·主题与通知) =====
/* ---------- 主题 / 通知 ---------- */
/* T4：主题三态（light / dark / system）。system 跟随 prefers-color-scheme 实时切换；
   旧值 light/dark 行为不变；theme 未定义时默认 system（新用户首启即跟随系统）。 */
let _mqlListenerInstalled = false;
function _systemPrefersDark(){
  try{ return !!(typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches); }
  catch(e){ return false; } // matchMedia 不可用（jsdom/旧浏览器）：回退亮色
}
function applyTheme(){
  const cfg=getCfg();
  const pref = cfg.theme || "system";
  const el = document.documentElement;
  el.removeAttribute("data-theme");
  let th;
  if(pref==="dark") th="dark";
  else if(pref==="light") th="light";
  else if(pref==="sepia") th="sepia";
  else if(pref==="elegant") th="elegant";
  else if(pref==="aurora") th="aurora";
  else if(pref==="matrix") th="matrix";
  else if(pref==="forest") th="forest";
  else if(pref==="ocean") th="ocean";
  else if(pref==="mist") th="mist";
  else th = _systemPrefersDark() ? "dark" : "light";
  if(th!=="light") el.setAttribute("data-theme", th);
  // 更新主题按钮：图标 + 当前主题名（亮色/暗色/跟随）；暗色显示太阳（提示可切到亮色），亮色/跟随显示月亮
  const btnTheme = document.getElementById("btnTheme");
  if(btnTheme){
    const labelMap = { light:t("theme.label.light", "亮色"), dark:t("theme.label.dark", "暗色"), system:t("theme.label.system", "跟随") };
    const label = labelMap[pref] || t("theme.label.light", "亮色");
    const icon = (th === "dark" ? (UI_ICONS.sun || "") : (UI_ICONS.theme || "")).replace("<svg", "<svg aria-hidden=\"true\"");
    btnTheme.innerHTML = sanitizeHtml(icon + '<span class="lbl">'+ label +'</span>');
  }
  // system 模式：注册一次系统主题变化监听（幂等，多次 applyTheme 不重复注册）
  if(pref==="system" && !_mqlListenerInstalled){
    try{
      if(typeof window.matchMedia === "function"){
        const mql = window.matchMedia("(prefers-color-scheme: dark)");
        const onChange = ()=>{ const c=getCfg(); if((c.theme||"system")==="system") applyTheme(); };
        if(typeof mql.addEventListener === "function") mql.addEventListener("change", onChange);
        else if(typeof mql.addListener === "function") mql.addListener(onChange); // Safari <14 兼容
        _mqlListenerInstalled = true;
      }
    }catch(e){ /* matchMedia 异常：保持当前主题 */ }
  }
}
async function toggleTheme(){
  const cfg=getCfg(); const cur=document.documentElement.getAttribute("data-theme");
  const next = cur==="dark"?"light":"dark";
  cfg.theme=next; try{ await persistCfg(cfg); }catch(e){ save(PREFIX+"cfg", cfg); } applyTheme();
  const sel=$("#cfgTheme"); if(sel) sel.value=next;
  toast(next==="dark"?t("theme.switch.dark", "已切换为暗色主题"):t("theme.switch.light", "已切换为亮色主题"), "ok");
}
/**
 * 显示 toast 通知（自动消失）；error/danger 用 assertive alert 供读屏立即播报
 * @param {string} msg - 通知文案
 * @param {("ok"|"warn"|"error"|"danger"|string)} [type] - 通知类型
 * @returns {void}
 */
// UI_ICONS：全局图标单一真相源（A-P2-7，FB-1；v2.1.1 去重——所有字典引用此处）。
// 场景图标收编进 SCENARIOS[sc].icon；chrome/状态/空态图标一律在此定义，其他字典按 key 引用。
// toast 类型图标映射（toast 可访问的最小公共感知）——值引用 UI_ICONS 单一真相源
const TOAST_ICONS = {
  ok: UI_ICONS.check,
  warn: UI_ICONS.alert,
  error: UI_ICONS.error,
  danger: UI_ICONS.error
};
// UI_ICONS 已上移至 TOAST_ICONS 之前（v2.1.1 去重：单一真相源，供 toast/侧栏/空态字典引用）

// ===== Bootstrap (配置常量) =====
/* v3.0：场景内功能 tab 注册表——标题栏导航条 + 场景内视图切换。
   每场景「求同存异」：骨架统一（概览=任务+资料库+专属卡），功能 tab 对症下药。 */
const SCENE_FEATURES = {
  office: [
    { id:"overview", type:"core",   label:t("tab.overview", "概览") },
    { id:"meeting", type:"tool",    label:t("tab.meeting", "会议") },
    { id:"project", type:"tool",    label:t("tab.project", "项目") },
    { id:"attendance", type:"record", label:t("tab.attendance", "考勤") },
    { id:"expense", type:"record",    label:t("tab.expense", "报销") },
  ],
  study: [
    { id:"overview", type:"core",  label:t("tab.overview", "概览") },
    { id:"knowledge", type:"record", label:t("tab.knowledge", "知识库") },
    /* v3.5.8：阅读改为商店可添加项（用户需求），渲染器与绑定保留，启用后自动出现 */
    { id:"exercise", type:"record",  label:t("tab.exercise", "练习") },
    { id:"exam", type:"record",      label:t("tab.exam", "考试") }
  ],
  data: [
    { id:"overview", type:"core", label:t("tab.overview", "概览") },
    { id:"report", type:"tool",   label:t("option.report", "报表") },
    { id:"chart", type:"tool",    label:t("tab.chart", "可视化") },
    { id:"sql", type:"tool",      label:"SQL" } // v3.1.2 A-档：SQL 查数能力复用给 data 场景（此前只在 code，data 用户被迫切场景查数）
  ],
  design: [
    { id:"overview", type:"core", label:t("tab.overview", "概览") },
    { id:"canvas", type:"tool",     label:t("tab.canvas", "画布") },
    { id:"cad", type:"record",      label:"CAD" },
    { id:"image", type:"record",    label:t("tab.image", "图片") },
    { id:"ui", type:"record",       label:"UI" },
    { id:"model3d", type:"record",  label:"3D" }
  ],
  code: [
    { id:"overview", type:"core", label:t("tab.overview", "概览") },
    { id:"runner", type:"tool",   label:t("tab.runner", "运行器") },
    { id:"regex", type:"record",    label:t("tab.regex", "正则") },
    { id:"json", type:"tool",     label:t("tool.json.name", "JSON") },
    { id:"time", type:"tool",     label:t("tool.time.name", "时间戳") },
    { id:"codec", type:"tool",    label:t("tool.codec.name", "编解码") },
    { id:"uuid", type:"tool",     label:t("tool.uuid.name", "UUID") },
    { id:"frontend", type:"record", label:t("tab.frontend", "前端") },
    { id:"sql", type:"tool",      label:"SQL" }
  ],
  life: [
    { id:"overview", type:"core", label:t("tab.overview", "概览") },
    { id:"plan", type:"record",     label:t("tab.plan", "计划") },
    { id:"health", type:"record",   label:t("tab.health", "健康") },
    { id:"bill", type:"record",     label:t("tab.bill", "缴费") },
    { id:"shop", type:"record",     label:t("tab.shop", "采购") }
  ],
  health: [
    { id:"overview", type:"core",   label:t("tab.overview", "概览") },
    { id:"trend", type:"record",    label:t("tab.trend", "趋势") }
  ],
  finance: [
    { id:"overview", type:"core",   label:t("tab.overview", "概览") },
    { id:"stats", type:"record",    label:t("tab.stats", "收支统计") }
  ]
};
