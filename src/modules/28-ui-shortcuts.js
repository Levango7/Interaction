// ===== UI Layer (交互层·快捷键) =====
/* ---------- 快捷键 ---------- */
document.addEventListener("keydown", e=>{
  // M5：Esc 关闭回收站弹窗 / 设置抽屉（命令面板有自身 Esc 处理，互不冲突）
  if(e.key==="Escape"){
    if($("#recycleModal")){ const m=$("#recycleModal"); if(m) m.remove(); return; }
    if($("#drawer") && $("#drawer").classList.contains("show")){ closeDrawer(); return; }
    return;
  }
  if((e.ctrlKey||e.metaKey) && (e.key==="k"||e.key==="K")){ e.preventDefault(); openCmd(); return; }
  const t=e.target;
  if(t && (t.tagName==="INPUT"||t.tagName==="TEXTAREA"||t.tagName==="SELECT")) return;
  if(e.key>="1" && e.key<="4"){ const sc=ORDER[+e.key-1]; if(sc){ setActive(sc); render(); } }
  else if(e.key==="g"||e.key==="G"){ active="overview"; render(); } // 总览为瞬态视图，不持久化（契约已知例外）
  // M6：N 在总览/统计等无表单视图也能跳到场景并聚焦新建任务
  else if(e.key==="n"||e.key==="N"){
    if(active==="overview"||active==="stats"){ setActive("office"); }
    render(); const f=$("#taskForm"); if(f) f.title.focus();
  }
});

