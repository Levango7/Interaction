// ===== UI Layer (交互层·快捷键) =====
/* ---------- 快捷键 ---------- */
document.addEventListener("keydown", e=>{
  if((e.ctrlKey||e.metaKey) && (e.key==="k"||e.key==="K")){ e.preventDefault(); openCmd(); return; }
  const t=e.target;
  if(t && (t.tagName==="INPUT"||t.tagName==="TEXTAREA"||t.tagName==="SELECT")) return;
  if(e.key>="1" && e.key<="4"){ const sc=ORDER[+e.key-1]; if(sc){ setActive(sc); render(); } }
  else if(e.key==="g"||e.key==="G"){ active="overview"; render(); } // 总览为瞬态视图，不持久化（契约已知例外）
  else if(e.key==="n"||e.key==="N"){ if(active==="overview"){setActive("office");render();} const f=$("#taskForm"); if(f) f.title.focus(); }
});

