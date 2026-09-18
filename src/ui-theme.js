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
  else if(pref==="ink") th="ink";   // v3.7.25 黑金
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
// 注：TOAST_ICONS 已于 v3.7.12 下移至 core（解耦 S0：它被 core 里的 toast() 使用，
//   留在 UI 层会让核心层反向依赖 UI）；UI_ICONS 亦早于本轮下移，现居 core。

// ===== Bootstrap (配置常量) =====
