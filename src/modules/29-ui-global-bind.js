// ===== UI Layer (交互层·全局事件绑定) =====
/* ---------- 绑定 ---------- */
/* Agent 状态条：记忆条数 + 进行中目标进度 */
function updateAgentStatus(){
  const el=$("#agentStatus"); if(!el) return;
  const m=getMemories().length;
  const g=activeGoal();
  const done = g? g.steps.filter(s=>s.done).length : 0;
  el.textContent = "工作记忆 "+m+" 条"+(g? " · 进行中目标「"+g.title+"」("+done+"/"+g.steps.length+")" : " · 无进行中目标");
}
/* 查看工作记忆：在当前场景对话里以助手消息列出 */
function showMemories(){
  const hist=getChat(active);
  const mems=getMemories();
  const lines = mems.length ? mems.map(m=>"- ["+(m.scope==="global"?"全局":(SCENARIOS[m.scope]?SCENARIOS[m.scope].name:m.scope))+"] "+m.text+"（id:"+m.id+"）").join("\n") : "（暂无记忆。对我说「记住：xxx」或在对话中让我用 remember 工具记住即可）";
  hist.push({role:"assistant", content:"🧠 工作记忆（"+mems.length+" 条）：\n"+lines});
  if(hist.length>50) hist.splice(0, hist.length-50);
  save(PREFIX+"chat_"+active, hist); renderChat(); scrollChat();
}
$("#btnExport").onclick = doExport;
$("#btnImport").onclick = ()=> $("#fileInput").click();
$("#fileInput").onchange = e=>{ if(e.target.files[0]) doImport(e.target.files[0]); e.target.value=""; };
$("#btnClear").onclick = doClear;
$("#bannerExport").onclick = doExport;
$("#btnGear").onclick = openDrawer;
$("#drawerClose").onclick = closeDrawer;
$("#overlay").onclick = closeDrawer;
$("#cfgSave").onclick = saveCfg;
$("#cfgProfileSelect").onchange = e => switchProfile(e.target.value);
$("#cfgProfileNew").onclick = newProfile;
$("#cfgProfileDup").onclick = dupProfile;
$("#cfgProfileDel").onclick = delProfile;
$("#btnTheme").onclick = toggleTheme;
$("#btnCmd").onclick = openCmd;
$("#btnHelp").onclick = renderHelp;
$("#btnRecover").onclick = recoverAutoBackup;
$("#btnClearMem").onclick = ()=>{ if(!confirm("确定清空全部工作记忆？此操作不可恢复。")) return; save(PREFIX+"memory",[]); updateAgentStatus(); toast("已清空工作记忆","ok"); };
$("#btnCancelGoal").onclick = ()=>{ const g=cancelGoal(); updateAgentStatus(); toast(g?("已取消目标「"+g.title+"」"):"当前无进行中目标","ok"); };

/* ---------- T3.4 通知提醒开关绑定 ---------- */
$("#cfgNotify").onchange = ()=>{
  const on = $("#cfgNotify").checked;
  setNotifyEnabled(on);
  if(on){
    toast("已开启通知提醒", "ok");
    startNotifyScheduler();
    try{ runNotifyCheck(); }catch(e){ /* noop */ }
  }else{
    toast("已关闭通知提醒", "ok");
  }
};

/* ---------- T3.2 习惯链管理事件绑定 ---------- */
/* 把指定 id 的链行替换为编辑行 */
function _enterChainEdit(id){
  const box = $("#linksBox"); if(!box) return;
  const links = getLinks();
  const l = links.find(x=>x.id===id); if(!l) return;
  const row = box.querySelector('.chain-row[data-id="'+id+'"]');
  if(!row) return;
  const tmp = document.createElement("div");
  tmp.innerHTML = _renderChainEditRow(l);
  row.replaceWith(tmp.firstChild);
  const kwInput = box.querySelector('.chain-edit-row[data-edit-id="'+id+'"] .chain-edit-kw');
  if(kwInput){ kwInput.focus(); kwInput.select(); }
}
/* 退出编辑行，恢复为普通链行 */
function _exitChainEdit(id){
  const box = $("#linksBox"); if(!box) return;
  const editRow = box.querySelector('.chain-edit-row[data-edit-id="'+id+'"]');
  if(!editRow) return;
  const links = getLinks();
  const l = links.find(x=>x.id===id); if(!l) return;
  const tmp = document.createElement("div");
  tmp.innerHTML = _renderChainRow(l);
  editRow.replaceWith(tmp.firstChild);
}
/* 添加新链按钮 */
$("#chainAddBtn").onclick = ()=>{
  const src = $("#chainAddSrc").value, kw = $("#chainAddKw").value, dst = $("#chainAddDst").value;
  const r = addCustomLink(src, kw, dst);
  if(!r.ok){ toast("添加失败："+r.err, "warn"); return; }
  $("#chainAddKw").value = "";
  renderLinksBox();
  toast("已添加链："+(SCENARIOS[src]&&SCENARIOS[src].name||src)+"→"+(SCENARIOS[dst]&&SCENARIOS[dst].name||dst), "ok");
};
/* 重置为默认按钮 */
$("#chainResetBtn").onclick = ()=>{
  if(!confirm("确定重置为默认习惯链？自定义链将被清除。")) return;
  resetCustomLinks();
  renderLinksBox();
  toast("已重置为默认习惯链", "ok");
};
/* linksBox 事件委托：删除 / 编辑关键词 / 编辑目标场景 / 启用切换 */
$("#linksBox").addEventListener("click", e=>{
  const t = e.target;
  const delBtn = t.closest("[data-del]");
  if(delBtn){ const id = delBtn.getAttribute("data-del"); if(!confirm("确定删除这条习惯链？")) return; removeCustomLink(id); renderLinksBox(); return; }
  const saveBtn = t.closest("[data-save]");
  if(saveBtn){
    const id = saveBtn.getAttribute("data-save");
    const editRow = saveBtn.closest(".chain-edit-row");
    const kw = editRow ? editRow.querySelector(".chain-edit-kw").value : "";
    const dst = editRow ? editRow.querySelector(".chain-edit-dst").value : "";
    const r = updateCustomLink(id, {kw, toSc: dst});
    if(!r.ok){ toast("保存失败："+r.err, "warn"); return; }
    renderLinksBox();
    return;
  }
  const cancelBtn = t.closest("[data-cancel]");
  if(cancelBtn){ _exitChainEdit(cancelBtn.getAttribute("data-cancel")); return; }
  const editKw = t.closest("[data-edit-kw]");
  if(editKw){ _enterChainEdit(editKw.getAttribute("data-edit-kw")); return; }
  const editDst = t.closest("[data-edit-dst]");
  if(editDst){ _enterChainEdit(editDst.getAttribute("data-edit-dst")); return; }
});
$("#linksBox").addEventListener("change", e=>{
  const t = e.target;
  if(t.classList && t.classList.contains("chain-toggle")){
    const id = t.getAttribute("data-id");
    toggleCustomLink(id, t.checked);
    const row = t.closest(".chain-row");
    if(row){ row.classList.toggle("disabled", !t.checked); }
  }
});
$("#cmdOverlay").onclick = closeCmd;
$("#cmdInput").onkeydown = e=>{
  if(e.key==="ArrowDown"){ e.preventDefault(); cmdSel=Math.min(cmdSel+1, cmdItems.length-1); updateCmdSel(); }
  else if(e.key==="ArrowUp"){ e.preventDefault(); cmdSel=Math.max(cmdSel-1,0); updateCmdSel(); }
  else if(e.key==="Enter"){ e.preventDefault(); runCmd(cmdSel); }
  else if(e.key==="Escape"){ closeCmd(); }
};
// L1：输入时实时过滤命令（openCmd 仅初次渲染空列表，此前打字不刷新）
$("#cmdInput").oninput = e=> renderCmd(e.target.value);

