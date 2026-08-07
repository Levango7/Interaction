// ===== UI Layer (交互层·快捷键) =====
/* ---------- 快捷键 ---------- */
document.addEventListener("keydown", e=>{
  // M5：Esc 链式关闭弹窗（按层级：编辑/确认 → 回收站 → 设置抽屉）
  // B1 修复：抽屉打开类是 open 不是 show，原判断永不生效；同时纳入任务编辑与 AI 确认弹窗
  if(e.key==="Escape"){
    if(closeTaskEditModal()) return;
    if(closeConfirmModal()) return;
    if(closeRecycleModal()) return;
    if($("#drawer") && $("#drawer").classList.contains("open")){ closeDrawer(); return; }
    return;
  }
  if((e.ctrlKey||e.metaKey) && (e.key==="k"||e.key==="K")){ e.preventDefault(); openCmd(); return; }
  // B6：撤销/重做任务操作（Ctrl+Z / Ctrl+Y；macOS 的 Cmd+Shift+Z 重做）
  if((e.ctrlKey||e.metaKey) && !e.altKey && (e.key==="z"||e.key==="Z")){
    e.preventDefault();
    if(e.shiftKey){ if(redoTasks()){ render(); toast("已重做","ok"); } }
    else { if(undoTasks()){ render(); toast("已撤销","ok"); } }
    return;
  }
  if((e.ctrlKey||e.metaKey) && (e.key==="y"||e.key==="Y")){
    e.preventDefault(); if(redoTasks()){ render(); toast("已重做","ok"); } return;
  }
  const t=/** @type {HTMLElement} */(e.target);
  if(t && (t.tagName==="INPUT"||t.tagName==="TEXTAREA"||t.tagName==="SELECT")) return;
  if(e.key>="1" && e.key<="4"){ const sc=ORDER[+e.key-1]; if(sc){ setActive(sc); render(); } }
  else if(e.key==="g"||e.key==="G"){ active="overview"; render(); } // 总览为瞬态视图，不持久化（契约已知例外）
  // M6：N 在总览/统计等无表单视图也能跳到场景并聚焦新建任务
  else if(e.key==="n"||e.key==="N"){
    if(active==="overview"||active==="stats"){ setActive("office"); }
    render(); const f=$("#taskForm"); if(f) f.title.focus();
  }
});

