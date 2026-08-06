// ===== UI Layer (交互层·主题与通知) =====
/* ---------- 主题 / 通知 ---------- */
function applyTheme(){
  const cfg=getCfg(); const th = cfg.theme==="dark"?"dark":(cfg.theme==="light"?"light":null);
  if(th) document.documentElement.setAttribute("data-theme", th);
  else document.documentElement.removeAttribute("data-theme");
}
async function toggleTheme(){
  const cfg=getCfg(); const cur=document.documentElement.getAttribute("data-theme");
  const next = cur==="dark"?"light":"dark";
  cfg.theme=next; try{ await persistCfg(cfg); }catch(e){ save(PREFIX+"cfg", cfg); } applyTheme();
  toast("已切换为"+(next==="dark"?"暗色":"亮色")+"主题", "ok");
}
/**
 * 显示 toast 通知（自动消失）；error/danger 用 assertive alert 供读屏立即播报
 * @param {string} msg - 通知文案
 * @param {("ok"|"warn"|"error"|"danger"|string)} [type] - 通知类型
 * @returns {void}
 */
function toast(msg, type){
  let c=$("#toasts"); if(!c){ c=document.createElement("div"); c.id="toasts"; c.setAttribute("role","status"); c.setAttribute("aria-live","polite"); document.body.appendChild(c); }
  const d=document.createElement("div"); d.className="toast"+(type?" "+type:""); d.textContent=msg;
  // 危险/错误提示：改为 assertive alert，确保读屏立即播报（a11y）
  if(type==="error"||type==="danger"){ d.setAttribute("role","alert"); d.setAttribute("aria-live","assertive"); }
  c.appendChild(d); requestAnimationFrame(()=> d.style.opacity="1");
  setTimeout(()=>{ d.style.opacity="0"; setTimeout(()=> d.remove(), 250); }, 3600);
}

// UI_ICONS：仅承载 chrome 图标（A-P2-7，FB-1）。场景图标已收编进 SCENARIOS[sc].icon。
const UI_ICONS = {
  overview:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V4m0 16h16M8 16l3-4 3 3 4-6"/></svg>',
  plus:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>',
  check:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>',
  trash:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 7h12M9 7V5h6v2m-7 0 1 12h6l1-12"/></svg>',
  copy:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 9h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2zM5 15H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1"/></svg>',
  chat:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-11.5 7.2L4 20l1-4.5A8 8 0 1 1 21 12z"/></svg>',
  download:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v10m0 0 4-4m-4 4-4-4M5 19h14"/></svg>',
  upload:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21V11m0 0 4 4m-4-4-4 4M5 5h14"/></svg>',
  gear:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/><path d="M19.4 13.5a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  theme:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/></svg>',
  stats:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V10m6 10V4m6 16v-7m6 7V8"/></svg>'
};

