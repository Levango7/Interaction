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
  // 撤销/重做（任务 / 资料库记录 / 笔记）：Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y
  // ⚠️ 焦点在输入控件里时**不拦**：那是原生文本撤销，抢了会让用户以为"撤销坏了"
  const _undoTgt = /** @type {HTMLElement} */(e.target);
  const _inField = !!(_undoTgt && (_undoTgt.tagName==="INPUT" || _undoTgt.tagName==="TEXTAREA" || _undoTgt.isContentEditable));
  if(!_inField && (e.ctrlKey||e.metaKey) && !e.altKey && (e.key==="z"||e.key==="Z")){
    e.preventDefault();
    if(e.shiftKey){ if(redoLast()){ render(); toast(t("msg.redo", "已重做"),"ok"); } }
    else { if(undoLast()){ render(); toast(t("msg.undo", "已撤销"),"ok"); } }
    return;
  }
  if(!_inField && (e.ctrlKey||e.metaKey) && (e.key==="y"||e.key==="Y")){
    e.preventDefault(); if(redoLast()){ render(); toast(t("msg.redo", "已重做"),"ok"); } return;
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


/* ---------- 通用撤销提示（2026-10-23） ----------
 * 写入成功后的 10 秒内给一次可见的撤销入口；400ms 合并期内的连续写**不重复弹**（由 data-rw 决定）。
 * 这是键盘 Ctrl+Z 之外的**可发现性**入口 —— 此前撤销只有快捷键，多数用户不知道它存在。 */
let _undoToastTimer = null;
function showUndoToast(domain){
  let host = document.getElementById("toasts");
  if(!host){
    host = document.createElement("div");
    host.id = "toasts";
    host.setAttribute("role", "status");
    host.setAttribute("aria-live", "polite");
    document.body.appendChild(host);
  }
  const old = document.getElementById("undoToast");
  if(old) old.remove();
  if(_undoToastTimer) clearTimeout(_undoToastTimer);
  const WHAT = { task:t("undo.what.task", "任务"), rec:t("undo.what.rec", "资料"), note:t("undo.what.note", "笔记") };
  const el = document.createElement("div");
  el.className = "toast info";
  el.id = "undoToast";
  el.setAttribute("role", "status");
  el.appendChild(document.createTextNode(t("undo.changed", "已修改：") + (WHAT[domain] || domain) + " "));
  const b = document.createElement("button");
  b.type = "button";
  b.className = "btn-ghost u-fs-2xs";
  b.textContent = t("undo.action", "撤销");
  b.onclick = function(){
    if(typeof undoLast === "function" && undoLast()){
      render();
      toast(t("msg.undo", "已撤销"), "ok");
    }
    el.remove();
  };
  el.appendChild(b);
  host.appendChild(el);
  requestAnimationFrame(function(){ el.style.opacity = "1"; });
  _undoToastTimer = setTimeout(function(){ el.remove(); }, 10000);
}
