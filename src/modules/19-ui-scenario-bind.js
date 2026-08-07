// ===== UI Layer (交互层·场景绑定) =====
/* ---------- 绑定 ---------- */
/**
 * 绑定场景主区事件：任务表单、记录表单、看板移动/删除、标签筛选、聊天提交、场景专属卡片
 * @returns {void}
 */
function bindScenario(){
  $("#taskForm").onsubmit = e=>{
    e.preventDefault(); const f=e.target; const tasks=getTasks();
    const tags = f.tags.value.trim()? f.tags.value.split(/[,，]/).map(x=>x.trim()).filter(Boolean) : [];
    tasks.push({id:uid(), sc:active, title:f.title.value.trim(), due:f.due.value,
      priority:f.priority.value, status:"todo", doneAt:null, note:"", tags, created:Date.now()});
    setTasks(tasks); checkCount(); render();
  };
  $("#recForm").onsubmit = e=>{
    e.preventDefault(); const f=e.target; const obj={id:uid(), created:Date.now()};
    SCENARIOS[active].record.fields.forEach(fl=> obj[fl.k]=f[fl.k].value.trim());
    const arr=getRec(active); arr.unshift(obj); setRec(active, arr); render();
  };
  $$("[data-move]").forEach(b=> b.onclick=()=>{
    const [id,st]=b.dataset.move.split(":"); const tasks=getTasks();
    const i=tasks.findIndex(t=>t.id===id); if(i<0) return;
    if(st==="done"){ completeTask(id); render(); return; }
    tasks[i].status=st; tasks[i].doneAt = null;
    setTasks(tasks); render();
  });
  $$("[data-del]").forEach(b=> b.onclick=()=>{
    if(!confirm("删除这条任务？（将进入回收站，可恢复）")) return;
    const tasks=getTasks();
    const t=tasks.find(x=>x.id===b.dataset.del);
    if(t && !t.deletedAt){ t.deletedAt=Date.now(); setTasks(tasks); } // T1：软删除，与 AI delete_task 行为统一
    render();
  });
  $$("[data-edit]").forEach(b=> b.onclick=()=> openTaskEdit(b.dataset.edit)); // A1：任务编辑弹窗
  $$("[data-rdel]").forEach(b=> b.onclick=()=>{
    if(!confirm("删除这条记录？")) return;
    setRec(active, getRec(active).filter(r=>r.id!==b.dataset.rdel)); render();
  });
  // A3：习惯链状态条点击 → 跳转到对应场景
  $$("[data-chain-sc]").forEach(b=> b.onclick=()=>{
    const sc = b.dataset.chainSc;
    if(SCENARIOS[sc]){ setActive(sc); render(); }
  });
  $$("[data-copy]").forEach(b=> b.onclick=()=>{
    const o=b.innerHTML;
    navigator.clipboard.writeText(b.dataset.val).then(()=>{
      b.innerHTML="已复制"; setTimeout(()=>b.innerHTML=o,1200);
    }).catch(()=>{ b.innerHTML="复制失败"; setTimeout(()=>b.innerHTML=o,1200); });
  });
  const tf=$("#tagFilter"); if(tf) tf.oninput=applyBoardFilter;
  const bs=$("#boardSearch"); if(bs) bs.oninput=applyBoardFilter;   // B2：标题搜索接线
  const sf=$("#boardStatusFilter"); if(sf) sf.onchange=applyBoardFilter; // B2：状态筛选接线
  bindExtra(active);
  bindSceneSections(active);
  const cf=$("#chatForm"); if(cf) cf.onsubmit = onChatSubmit;
  const cc=$("#chatCancel"); if(cc) cc.onclick=abortChat;
}
function bindReportCard(sc){
  if((sc==="office"||sc==="code") && $("#copyRep")) $("#copyRep").onclick=()=> navigator.clipboard.writeText($("#repTxt").value);
}
function bindReviewCard(sc){
  $$("[data-rev]").forEach(b=> b.onclick=()=>{
    const [id,q]=b.dataset.rev.split(":"); const arr=getRec("study"); const i=arr.findIndex(r=>r.id===id);
    if(i>=0){
      const res=sm2(arr[i].sm2, parseInt(q,10));
      arr[i].sm2={ ef:res.ef, interval:res.interval, reps:res.reps };
      arr[i].nextReview=Date.now()+res.nextReviewDays*86400000;
      setRec("study",arr); render();
    }
  });
}
function bindExtra(sc){
  const r = CARD_REGISTRY[SCENARIOS[sc].extraCard || "none"];
  if(r && r.bind) r.bind(sc);
}

/* ---------- B4：看板拖拽排序（HTML5 DnD，零依赖） ---------- */
/**
 * 看板拖拽初始化：事件委托绑在 #main（静态元素），不随 innerHTML 重建丢失。
 * 同列拖拽=改顺序；跨列拖拽=改状态（拖入已完成列走 completeTask 触发场景联动）。
 * @returns {void}
 */
function setupKanbanDnD(){
  const main = $("#main");
  if(!main || main._dndBound) return;
  main._dndBound = true;
  let dragId = null;
  main.addEventListener("dragstart", e=>{
    const card = e.target.closest(".kcard[data-drag]");
    if(!card) return;
    dragId = card.getAttribute("data-drag");
    try{ e.dataTransfer.setData("text/plain", dragId); e.dataTransfer.effectAllowed = "move"; }catch(_){}
    card.classList.add("dragging");
  });
  main.addEventListener("dragend", e=>{
    const card = e.target.closest(".kcard[data-drag]");
    if(card) card.classList.remove("dragging");
    $$(".kcol.drag-over", main).forEach(c=>c.classList.remove("drag-over"));
    dragId = null;
  });
  main.addEventListener("dragover", e=>{
    const col = e.target.closest(".kcol[data-drop]");
    if(!col || !dragId) return;
    e.preventDefault(); // 允许 drop
    if(e.dataTransfer) e.dataTransfer.dropEffect = "move"; // 测试环境无 DataTransfer 时跳过
    $$(".kcol.drag-over", main).forEach(c=>c.classList.remove("drag-over"));
    col.classList.add("drag-over");
  });
  main.addEventListener("dragleave", e=>{
    const col = e.target.closest(".kcol[data-drop]");
    if(col && !col.contains(e.relatedTarget)) col.classList.remove("drag-over");
  });
  main.addEventListener("drop", e=>{
    const col = e.target.closest(".kcol[data-drop]");
    if(!col || !dragId) return;
    e.preventDefault();
    col.classList.remove("drag-over");
    const st = col.getAttribute("data-drop");
    // 计算插入位置：落在某张卡片上半区 → 插到它前面；否则列末尾
    let beforeId = null;
    const target = e.target.closest(".kcard[data-drag]");
    if(target && target.getAttribute("data-drag") !== dragId){
      const r = target.getBoundingClientRect();
      if(e.clientY < r.top + r.height/2) beforeId = target.getAttribute("data-drag");
      else{
        const next = target.nextElementSibling;
        if(next && next.classList.contains("kcard")) beforeId = next.getAttribute("data-drag");
      }
    }
    const id = dragId; dragId = null;
    if(reorderTask(id, beforeId, st)){ render(); }
  });
}

/* ---------- B5：看板卡片键盘操作（Enter=编辑 / Delete=软删进回收站） ---------- */
/**
 * 看板键盘操作初始化：事件委托绑在 #main，卡片获焦时 Enter 打开编辑、Delete 软删。
 * @returns {void}
 */
function setupKanbanKeyboard(){
  const main = $("#main");
  if(!main || main._kbdBound) return;
  main._kbdBound = true;
  main.addEventListener("keydown", e=>{
    const card = e.target.closest(".kcard[data-drag]");
    if(!card) return;
    // 焦点在卡片内的按钮/输入上时不劫持（保留原生行为）
    const t = e.target;
    if(t !== card) return;
    const id = card.getAttribute("data-drag");
    if(e.key === "Enter"){ e.preventDefault(); openTaskEdit(id); }
    else if(e.key === "Delete"){
      e.preventDefault();
      if(!confirm("删除这条任务？（将进入回收站，可恢复）")) return;
      const tasks = getTasks();
      const tk = tasks.find(x=>x.id===id);
      if(tk && !tk.deletedAt){ tk.deletedAt = Date.now(); setTasks(tasks); } // 与 UI 删除按钮同语义
      render();
    }
  });
}

/* ---------- B2：场景内联合筛选（标题搜索 × 状态 × 标签） ---------- */
/**
 * 按当前筛选控件值过滤看板卡片：标题关键词 AND 状态 AND 标签（任一为空=不限）
 * @returns {void}
 */
function applyBoardFilter(){
  const q = $("#boardSearch") ? $("#boardSearch").value.trim().toLowerCase() : "";
  const st = $("#boardStatusFilter") ? $("#boardStatusFilter").value : "";
  const tg = $("#tagFilter") ? $("#tagFilter").value.trim().toLowerCase() : "";
  $$(".kcard").forEach(card=>{
    const titleOk = !q || (card.dataset.title||"").toLowerCase().includes(q);
    const statusOk = !st || card.dataset.status===st;
    const tags = (card.dataset.tags||"").split(" ").filter(Boolean);
    const tagOk = !tg || tags.some(t=>t.toLowerCase().includes(tg));
    card.style.display = (titleOk && statusOk && tagOk) ? "" : "none";
  });
}

/* ---------- A1：任务编辑弹窗 ---------- */
/**
 * 打开任务编辑弹窗（复用回收站弹窗的焦点陷阱与关闭交互）
 * @param {string} id - 任务 id
 * @returns {void}
 */
function openTaskEdit(id){
  const t = getActiveTasks().find(x=>x.id===id);
  if(!t){ toast("任务不存在或已删除","warn"); return; }
  const s = SCENARIOS[t.sc] || scMeta(t.sc);
  const statusSel = [["todo","待办"],["doing","进行中"],["done","已完成"]].map(([v,l])=>
    `<option value="${v}" ${t.status===v?"selected":""}>${l}</option>`).join("");
  const priSel = ["","P0","P1","P2"].map(v=>
    `<option value="${v}" ${t.priority===v?"selected":""}>${v||"-"}</option>`).join("");
  const html = `<div class="recycle-modal" id="taskEditModal">
    <div class="recycle-card" style="max-width:560px">
      <div class="recycle-header"><h2>编辑任务</h2><button type="button" class="recycle-close" id="taskEditClose">✕</button></div>
      <form id="taskEditForm" style="padding:var(--space-5) var(--space-6);display:flex;flex-direction:column;gap:var(--space-4)">
        <div class="fld"><label>任务标题</label><input name="title" value="${esc(t.title)}" required></div>
        <div class="form-row" style="margin-bottom:0">
          <div class="fld"><label>截止日期</label><input name="due" type="date" value="${esc(t.due||"")}"></div>
          <div class="fld"><label>优先级</label><select name="priority">${priSel}</select></div>
          <div class="fld"><label>状态</label><select name="status">${statusSel}</select></div>
        </div>
        <div class="fld"><label>标签（逗号分隔）</label><input name="tags" value="${esc((t.tags||[]).join(", "))}"></div>
        <div class="fld"><label>备注</label><textarea name="note" rows="3">${esc(t.note||"")}</textarea></div>
        <div style="display:flex;gap:var(--space-2);justify-content:flex-end">
          <button type="button" class="btn-ghost" id="taskEditCancel">取消</button>
          <button type="submit" class="addbtn" style="--sc:${s.color}">保存</button>
        </div>
      </form>
    </div></div>`;
  document.body.insertAdjacentHTML("beforeend", html);
  const modal = $("#taskEditModal");
  modal._releaseTrap = trapFocus(modal.querySelector(".recycle-card"));
  const close = ()=>{ if(modal._releaseTrap) modal._releaseTrap(); modal.remove(); };
  $("#taskEditClose").onclick = close;
  $("#taskEditCancel").onclick = close;
  modal.onclick = e=>{ if(e.target===modal) close(); };
  $("#taskEditForm").onsubmit = e=>{
    e.preventDefault();
    const f = e.target;
    const gv = n => { const el = f.querySelector('[name="'+n+'"]'); return el ? el.value : ""; };
    const tagsRaw = gv("tags");
    const tags = tagsRaw.trim()? tagsRaw.split(/[,，]/).map(x=>x.trim()).filter(Boolean) : [];
    const ok = updateTask(id, { title:gv("title"), due:gv("due"), priority:gv("priority"), status:gv("status"), tags, note:gv("note") });
    if(ok){ toast("已保存任务修改","ok"); close(); render(); }
    else toast("保存失败：标题不能为空","warn");
  };
  const first = modal.querySelector("input[name=title]"); if(first) first.focus();
}
/**
 * B1：关闭任务编辑弹窗（若存在）；供 ESC 链式关闭调用
 * @returns {boolean} 是否关闭了弹窗
 */
function closeTaskEditModal(){
  const m=$("#taskEditModal"); if(!m) return false;
  if(typeof m._releaseTrap==="function"){ try{ m._releaseTrap(); }catch(e){ /* noop */ } }
  m.remove();
  return true;
}

