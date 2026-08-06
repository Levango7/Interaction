// ===== Render Layer (渲染层·入口) =====
/* ---------- 渲染入口 ---------- */
/**
 * 渲染入口：侧边栏 + 主区（overview 或 今日仪表盘+场景主区）+ 绑定 + chat
 * @returns {void}
 */
function render(){
  try{
    renderSide();
    if(active==="overview"){ renderOverview(); return; }
    if(active==="stats"){ renderStats(); return; }
    const cfg=getCfg();
    $("#main").innerHTML = renderToday() + renderMainHTML();
    bindScenario();
    if(cfg.enabled) renderChat();
  }catch(e){
    // 渲染异常：诊断 + fallback UI（提示导出备份后清空），不让白屏
    pushDiag("error", "render error: "+(e&&e.message||e), {where:"render"});
    const main = document.getElementById("main");
    if(main){
      main.innerHTML = '<div class="card" style="text-align:center;padding:40px">'+
        '<h2>⚠️ 数据异常</h2>'+
        '<p style="color:var(--muted);margin:16px 0">渲染时发生错误，建议导出备份后清空数据。</p>'+
        '<button class="mini" onclick="doExport()" style="margin:8px">导出备份</button>'+
        '<button class="mini" onclick="if(confirm(\'确定清空？\')){localStorage.clear();location.reload();}" style="margin:8px;background:var(--danger)">清空数据</button>'+
        '</div>';
    }
    try{ toast("渲染异常："+(e&&e.message||"未知错误"), "error"); }catch(e2){ /* toast 不可用时静默降级 */ }
  }
}

