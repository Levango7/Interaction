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
    if(e.shiftKey){ if(redoTasks()){ render(); toast(t("msg.redo", "已重做"),"ok"); } }
    else { if(undoTasks()){ render(); toast(t("msg.undo", "已撤销"),"ok"); } }
    return;
  }
  if((e.ctrlKey||e.metaKey) && (e.key==="y"||e.key==="Y")){
    e.preventDefault(); if(redoTasks()){ render(); toast(t("msg.redo", "已重做"),"ok"); } return;
  }
  const target=/** @type {HTMLElement} */(e.target);
  if(target && (target.tagName==="INPUT"||target.tagName==="TEXTAREA"||target.tagName==="SELECT")) return;
  if(target && target.isContentEditable) return;
  if(e.key==="?" || (e.shiftKey && e.key==="/")){ e.preventDefault(); openShortcutHelp(); return; }
  if(e.key>="1" && e.key<="6"){ const sc=ORDER[+e.key-1]; if(sc){ setActive(sc); render(); } return; }
  /* v3.7.132（P0-4 第二步）：单键命令改由**命令注册表**分发 —— 键位定义只此一处。
     原先这里写 `e.key==="n"` / `e.key==="g"`，而面板里另有一份手写的 `sub:"N"`：
     两套东西改一处忘一处，用户看到的就是错的提示（这正是 P0-4 的立项理由）。
     现在键位住在 `ui-palette.js` 的命令定义里，`keys` 同时生成面板提示与这里的触发。
     **本文件仍手写**的只有两类：数字键 1-6（切场景，不作为命令出现在面板里）与带修饰键的组合
     （Ctrl+K / Ctrl+Z / Ctrl+Y / Esc / ?）—— 注册表目前只表达单键，扩展它属另一笔。 */
  const cmdId = CMD.findByKeys(e.key);
  if(cmdId){
    const c = CMD.get(cmdId);
    if(c && typeof c.run === "function") c.run();
  }
});
