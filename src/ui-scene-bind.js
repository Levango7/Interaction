// ===== UI Layer (交互层·场景绑定) =====
/* ---------- 绑定 ---------- */
/**
 * 绑定场景主区事件：任务表单、记录表单、看板移动/删除、标签筛选、聊天提交、场景专属卡片
 * @returns {void}
 */
function bindScenario(){
  // v3.0：功能卡视图（非 overview）无任务表单/资料库表单，判空绑定避免抛错
  const _tf = $("#taskForm"); if(_tf) _tf.onsubmit = e=>{
    e.preventDefault(); const f=e.target; const tasks=getTasks();
    const tags = f.tags.value.trim()? f.tags.value.split(/[,，]/).map(x=>x.trim()).filter(Boolean) : [];
    const nt = {id:uid(), sc:active, title:f.title.value.trim(), due:f.due.value,
      priority:f.priority.value, status:"todo", doneAt:null, note:"", tags, created:Date.now()};
    tasks.push(nt);
    setTasks(tasks); checkCount(); render();
    _emitTaskEvent("task_create", nt); // v1.12 [1a]：表单创建任务发事件（自动化规则 + Webhook 总线）
  };
  const _rf = $("#recForm"); if(_rf) _rf.onsubmit = e=>{
    e.preventDefault(); const f=e.target; const obj={id:uid(), created:Date.now()};
    SCENARIOS[active].record.fields.forEach(fl=> obj[fl.k]=f.elements[fl.k].value.trim());
    // v3.2 C-档：图片字段——文件读为 Blob 存 IDB（键 img_<recId>），记录只存引用（不撑爆 localStorage 配额）
    const imgInp = f.querySelector('[data-rec-img="1"]');
    const saveRec = function(imgKey){
      if(imgKey) obj.img = imgKey;
      const arr=getRec(active); arr.unshift(obj); setRec(active, arr); render();
    };
    if(imgInp && imgInp.files && imgInp.files[0]){
      const file = imgInp.files[0];
      if(file.size > 4*1024*1024){ toast(t("field.imgTooLarge", "图片过大（上限 4MB）"), "warn"); return; }
      const key = "img_" + obj.id;
      // idbTxn 不可用时 resolve undefined——仍保存引用（渲染时回退文字占位，不丢记录）
      idbTxn("readwrite", st => st.put(file, key)).then(() => saveRec(key), () => saveRec(key));
    } else { saveRec(); }
  };
  $$("[data-move]").forEach(b=> b.onclick=()=>{
    const [id,st]=b.dataset.move.split(":"); const tasks=getTasks();
    const i=tasks.findIndex(t=>t.id===id); if(i<0) return;
    if(st==="done"){ completeTask(id); render(); return; }
    const fromSt = tasks[i].status;
    tasks[i].status=st; tasks[i].doneAt = null;
    setTasks(tasks);
    // v1.4-B DOM 复用：todo↔doing 局部移动卡片，不全量重渲染
    // 仅在两列都未启用虚拟滚动时优化；否则回退全量 render
    if(_tryMoveKanbanCardLocal(id, fromSt, st)) return;
    render();
  });
  $$("[data-del]").forEach(b=> b.onclick=()=>{
    if(!confirm(t("confirm.deleteTask","删除这条任务？（将进入回收站，可恢复）"))) return;
    const tasks=getTasks();
    const task =tasks.find(x=>x.id===b.dataset.del);
    if(task && !task.deletedAt){
      // v1.14 生物识别门禁移除，删除任务直接执行（进入回收站可恢复）
      task.deletedAt = Date.now(); setTasks(tasks); _emitTaskEvent("task_delete", task); render();
      return;
    }
    render();
  });
  $$("[data-edit]").forEach(b=> b.onclick=()=> openTaskEdit(b.dataset.edit)); // A1：任务编辑弹窗
  $$("[data-rdel]").forEach(b=> b.onclick=()=>{
    if(!confirm(t("confirm.deleteRecord","删除这条记录？"))) return;
    const recId = b.dataset.rdel;
    const target = getRec(active).find(r=>r.id===recId);
    // v3.4.5 G1 修复：记录删除时同步清理 IDB 中的图片 blob（img_<recId>）——
    // 此前仅回写记录数组，IDB 里的图片成为永久孤儿（单图上限 4MB，多删即泄漏累积）
    if(target && target.img){
      try{ idbDeleteKey(target.img).catch(()=>{}); }catch(_e){ /* IDB 不可用静默 */ }
    }
    setRec(active, getRec(active).filter(r=>r.id!==recId)); render();
  });
  // A3：联动状态条点击 → 跳转到对应场景
  $$("[data-chain-sc]").forEach(b=> b.onclick=()=>{
    const sc = b.dataset.chainSc;
    if(SCENARIOS[sc]){ setActive(sc); render(); }
  });
  $$("[data-copy]").forEach(b=> b.onclick=()=>{
    const o=b.innerHTML;
    navigator.clipboard.writeText(b.dataset.val).then(()=>{
      b.innerHTML=sanitizeHtml(t("msg.copied","已复制")); setTimeout(()=>b.innerHTML=sanitizeHtml(o),1200);
    }).catch(()=>{ b.innerHTML=sanitizeHtml(t("msg.copyFailed","复制失败")); setTimeout(()=>b.innerHTML=sanitizeHtml(o),1200); });
  });
  const tf=$("#tagFilter"); if(tf) tf.oninput=applyBoardFilter;
  const bs=$("#boardSearch"); if(bs) bs.oninput=applyBoardFilter;   // B2：标题搜索接线
  const sf=$("#boardStatusFilter"); if(sf) sf.onchange=applyBoardFilter; // B2：状态筛选接线
  // v2.1.0：日历内联视图——月份切换 + 点日期预填任务表单截止日期
  const calInline = $("#calInlineView");
  if(calInline){
    bindCalendarEvents(calInline);
    calInline.addEventListener("cal:date-select", function(e){
      const f = $("#taskForm");
      if(f && f.due){ f.due.value = e.detail.date; f.title.focus(); }
    });
  }
  // v2.1.0：待办视图状态筛选（按 data-status 显隐行）
  const tsf = $("#todoStatusFilter");
  if(tsf) tsf.onchange = function(){
    const v = tsf.value;
    $$("#main .todo-row").forEach(r=>{ r.style.display = (!v || r.dataset.status===v) ? "" : "none"; });
  };
  // v1.4-B 虚拟滚动：绑定看板列与记录列表的 scroll 事件（rAF 节流，只更新可见项 DOM 子树）
  _bindVirtualScrolls(active);
  bindExtra(active);
  bindSceneSections(active);
  // 右侧 AI 聊天面板的 #chatForm/#chatCancel 已移到静态 HTML（三栏布局第三栏），
  // 由 bindChatPanel() 在启动时一次性绑定，不再随 render() 重建，故此处移除原绑定。
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
  // v1.4-B 虚拟滚动：绑定复习列表 scroll 事件
  const vp = document.querySelector('.vscroll-viewport[data-vscroll="review"]');
  if(vp && !vp._vsBound){
    vp._vsBound = true;
    let rafId = null;
    vp.addEventListener("scroll", () => {
      if(rafId) return;
      rafId = (typeof requestAnimationFrame === "function" ? requestAnimationFrame : setTimeout)(() => {
        rafId = null;
        _updateReviewVScroll(vp);
      });
    });
  }
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
    const target = e.target;
    if(target !== card) return;
    const id = card.getAttribute("data-drag");
    if(e.key === "Enter"){ e.preventDefault(); openTaskEdit(id); }
    else if(e.key === "Delete"){
      e.preventDefault();
      if(!confirm(t("confirm.deleteTask","删除这条任务？（将进入回收站，可恢复）"))) return;
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
  const task = getActiveTasks().find(x=>x.id===id);
  if(!task){ toast(t("msg.taskNotFound","任务不存在或已删除"),"warn"); return; }
  const s = SCENARIOS[task.sc] || scMeta(task.sc);
  const statusSel = [["todo",t("kanban.todo","待办")],["doing",t("kanban.doing","进行中")],["done",t("kanban.done","已完成")]].map(([v,l])=>
    `<option value="${v}" ${task.status===v?"selected":""}>${l}</option>`).join("");
  const priSel = ["","P0","P1","P2"].map(v=>
    `<option value="${v}" ${task.priority===v?"selected":""}>${v||"-"}</option>`).join("");
  const html = `<div class="recycle-modal" id="taskEditModal">
    <div class="recycle-card u-max-w-560">
      <div class="recycle-header"><h2>${t("task.editTitle","编辑任务")}</h2><button type="button" class="recycle-close" id="taskEditClose">✕</button></div>
      <form id="taskEditForm" class="u-flex u-flex-col u-pad-5-6 u-gap-4">
        <div class="fld"><label>${t("field.taskTitle","任务标题")}</label><input name="title" value="${esc(task.title)}" maxlength="200" required></div>
        <div class="form-row u-mb-0">
          <div class="fld"><label>${t("field.dueDate","截止日期")}</label><input name="due" type="text" inputmode="none" data-date-picker="1" value="${esc(task.due||"")}" placeholder="${t("placeholder.dueDate","选日期")}"></div>
          <div class="fld"><label>${t("task.priority","优先级")}</label><select name="priority">${priSel}</select></div>
          <div class="fld"><label>${t("field.linkedRecord","联动记录")}</label><select name="status">${statusSel}</select></div>
        </div>
        <div class="fld"><label>${t("field.tagsCommaSep","标签（逗号分隔）")}</label><input name="tags" value="${esc((task.tags||[]).join(", "))}" maxlength="200"></div>
        <div class="fld"><label>${t("field.note","备注")}</label><textarea name="note" rows="3" maxlength="2000">${esc(task.note||"")}</textarea></div>
        <div class="u-flex u-gap-2 u-jc-end">
          <button type="button" class="btn-ghost" id="taskEditCancel">${t("common.cancel","取消")}</button>
          <button type="submit" class="btn-primary" style="--sc:${s.color}">${t("common.save","保存")}</button>
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
    if(ok){ toast(t("msg.taskSaved","已保存任务修改"),"ok"); close(); render(); }
    else toast(t("msg.saveFailedEmptyTitle","保存失败：标题不能为空"),"warn");
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

/* ---------- v1.4-B 虚拟滚动事件绑定 ---------- */
/**
 * v1.4-B DOM 复用：看板卡片状态切换时局部移动 DOM 节点，不全量重渲染
 * 仅在两列都未启用虚拟滚动时优化；返回 true 表示已处理，false 表示需回退全量 render
 * @param {string} id - 任务 id
 * @param {string} fromSt - 原状态
 * @param {string} toSt - 目标状态
 * @returns {boolean} 是否已局部处理
 */
function _tryMoveKanbanCardLocal(id, fromSt, toSt){
  if(fromSt === toSt) return true; // 无变化
  const main = $("#main");
  if(!main) return false;
  const card = main.querySelector(`.kcard[data-drag="${id}"]`);
  if(!card) return false;
  const fromCol = main.querySelector(`.kcol[data-drop="${fromSt}"]`);
  const toCol = main.querySelector(`.kcol[data-drop="${toSt}"]`);
  if(!fromCol || !toCol) return false;
  // 任一列启用虚拟滚动时回退（虚拟滚动有特殊 DOM 结构）
  if(fromCol.querySelector(".vscroll-viewport") || toCol.querySelector(".vscroll-viewport")) return false;
  // 重新生成卡片 HTML（更新按钮 + data-status）并替换旧节点
  const task = getActiveTasks().find(t => t.id === id);
  if(!task) return false;
  const colName = { todo:t("kanban.todo","待办"), doing:t("kanban.doing","进行中"), done:t("kanban.done","已完成") };
  const tmp = document.createElement("div");
  tmp.innerHTML = sanitizeHtml(_renderKanbanCard(task, toSt, colName));
  const newCard = tmp.firstElementChild;
  if(!newCard) return false;
  card.replaceWith(newCard);
  // 移到目标列（在 empty 提示之前插入，或追加到列末尾）
  const empty = toCol.querySelector(".empty");
  if(empty) empty.remove();
  toCol.appendChild(newCard);
  // 更新两列计数
  _updateKanbanColCount(fromCol);
  _updateKanbanColCount(toCol);
  // 重新绑定移动/编辑/删除按钮（局部更新后需绑定新节点事件）
  _bindCardButtons(newCard);
  return true;
}
/** 更新看板列标题中的计数 */
function _updateKanbanColCount(col){
  const n = col.querySelectorAll(".kcard").length;
  const span = col.querySelector("h4 .n");
  if(span) span.textContent = String(n);
}
/** 绑定单张卡片的移动/编辑/删除按钮事件 */
function _bindCardButtons(card){
  card.querySelectorAll("[data-move]").forEach(b => {
    if(b._bound) return; b._bound = true;
    b.onclick = () => {
      const [id, st] = b.dataset.move.split(":");
      const tasks = getTasks();
      const i = tasks.findIndex(t => t.id === id);
      if(i < 0) return;
      if(st === "done"){ completeTask(id); render(); return; }
      const fromSt = tasks[i].status;
      tasks[i].status = st; tasks[i].doneAt = null;
      setTasks(tasks);
      if(_tryMoveKanbanCardLocal(id, fromSt, st)) return;
      render();
    };
  });
  card.querySelectorAll("[data-del]").forEach(b => {
    if(b._bound) return; b._bound = true;
    b.onclick = () => {
      if(!confirm(t("confirm.deleteTask","删除这条任务？（将进入回收站，可恢复）"))) return;
      const tasks = getTasks();
      const task = tasks.find(x => x.id === b.dataset.del);
      if(task && !task.deletedAt){ task.deletedAt = Date.now(); setTasks(tasks); }
      render();
    };
  });
  card.querySelectorAll("[data-edit]").forEach(b => {
    if(b._bound) return; b._bound = true;
    b.onclick = () => openTaskEdit(b.dataset.edit);
  });
}
/**
 * 绑定当前场景主区所有虚拟滚动视口的 scroll 事件（rAF 节流）
 * 看板列用 _updateKanbanVScroll，记录列表用 _updateRecVScroll
 * @param {string} sc - 当前场景键
 * @returns {void}
 */
function _bindVirtualScrolls(sc){
  const main = $("#main");
  if(!main) return;
  $$(".vscroll-viewport[data-vscroll]", main).forEach(vp => {
    if(vp._vsBound) return; // 幂等：已绑定则跳过
    vp._vsBound = true;
    let rafId = null;
    vp.addEventListener("scroll", () => {
      if(rafId) return; // rAF 节流：一帧只更新一次
      rafId = (typeof requestAnimationFrame === "function" ? requestAnimationFrame : setTimeout)(() => {
        rafId = null;
        const type = vp.getAttribute("data-vscroll");
        if(type === "rec") _updateRecVScroll(vp, sc);
        else _updateKanbanVScroll(vp, sc, type);
      });
    });
  });
}

/* ---------- v1.6-B 批量操作（多选任务批量完成/删除/移动场景/改优先级） ---------- */
/**
 * 批量操作内部状态：当前选中的任务 id 集合 + 多选模式开关
 * @type {{mode:boolean,selected:Set<string>}}
 */
const _batchState = { mode: false, selected: new Set() };

/**
 * 进入/退出批量选择模式。进入时给所有看板卡片显示 checkbox；退出时清空选择。
 * @param {boolean} [enable] - true=进入，false=退出，undefined=切换
 * @returns {boolean} 当前是否在批量模式
 */
function toggleBatchMode(enable){
  if(typeof enable !== "boolean") enable = !_batchState.mode;
  _batchState.mode = enable;
  if(!enable) _batchState.selected.clear();
  _renderBatchUI();
  return _batchState.mode;
}
/**
 * 切换某任务的选中状态
 * @param {string} taskId - 任务 id
 * @param {boolean} [checked] - true=选中，false=取消，undefined=切换
 * @returns {boolean} 该任务当前是否被选中
 */
function toggleBatchSelect(taskId, checked){
  if(!taskId) return false;
  if(typeof checked !== "boolean"){
    if(_batchState.selected.has(taskId)) _batchState.selected.delete(taskId);
    else _batchState.selected.add(taskId);
  } else {
    if(checked) _batchState.selected.add(taskId);
    else _batchState.selected.delete(taskId);
  }
  _renderBatchUI();
  return _batchState.selected.has(taskId);
}
/**
 * 全选/取消全选当前场景的活跃任务
 * @param {boolean} [checked] - true=全选，false=取消全选，undefined=切换
 * @returns {number} 当前选中数量
 */
function toggleBatchSelectAll(checked){
  const tasks = getActiveTasks().filter(function(t){ return t.sc === active; });
  if(typeof checked !== "boolean"){
    // 切换：若已全选则取消，否则全选
    checked = !(_batchState.selected.size >= tasks.length);
  }
  if(checked){
    tasks.forEach(function(t){ _batchState.selected.add(t.id); });
  } else {
    tasks.forEach(function(t){ _batchState.selected.delete(t.id); });
  }
  _renderBatchUI();
  return _batchState.selected.size;
}
/**
 * 获取当前选中的任务 id 数组
 * @returns {string[]}
 */
function getBatchSelected(){
  return Array.from(_batchState.selected);
}
/**
 * 批量完成选中任务。返回成功完成数。
 * @returns {number}
 */
function batchComplete(){
  const ids = getBatchSelected();
  let n = 0;
  ids.forEach(function(id){
    if(completeTask(id)) n++;
  });
  _batchState.selected.clear();
  _batchState.mode = false;
  _renderBatchUI();
  if(n > 0) toast(t("msg.batchCompleted","已批量完成 ") + n + t("unit.tasks"," 个任务"), "ok");
  return n;
}
/**
 * 批量软删除选中任务。返回成功删除数。
 * @returns {number}
 */
function batchDelete(){
  const ids = getBatchSelected();
  if(ids.length === 0) return 0;
  if(!confirm(t("confirm.batchDelete","确认删除 ") + ids.length + t("confirm.batchDeleteSuffix"," 个任务？（将进入回收站，可恢复）"))) return 0;
  const tasks = getTasks();
  let n = 0;
  ids.forEach(function(id){
    const task = tasks.find(function(x){ return x.id === id; });
    if(task && !task.deletedAt){ task.deletedAt = Date.now(); n++; }
  });
  setTasks(tasks);
  _batchState.selected.clear();
  _batchState.mode = false;
  _renderBatchUI();
  if(n > 0) toast(t("msg.batchDeleted","已批量删除 ") + n + t("unit.tasks"," 个任务"), "ok");
  return n;
}
/**
 * 批量移动选中任务到指定场景。返回成功移动数。
 * @param {string} targetSc - 目标场景键
 * @returns {number}
 */
function batchMoveScenario(targetSc){
  if(!targetSc || !SCENARIOS[targetSc]) return 0;
  const ids = getBatchSelected();
  const tasks = getTasks();
  let n = 0;
  ids.forEach(function(id){
    const task = tasks.find(function(x){ return x.id === id && !x.deletedAt; });
    if(task){ task.sc = targetSc; task.updatedAt = Date.now(); n++; }
  });
  setTasks(tasks);
  _batchState.selected.clear();
  _batchState.mode = false;
  _renderBatchUI();
  if(n > 0) toast(t("msg.batchMoved","已批量移动 ") + n + t("msg.batchMovedMid"," 个任务到「") + SCENARIOS[targetSc].name + t("msg.batchMovedSuffix","」"), "ok");
  return n;
}
/**
 * 批量修改选中任务的优先级。返回成功修改数。
 * @param {string} priority - 新优先级（""|P0|P1|P2）
 * @returns {number}
 */
function batchSetPriority(priority){
  if(!["", "P0", "P1", "P2"].includes(priority)) return 0;
  const ids = getBatchSelected();
  const tasks = getTasks();
  let n = 0;
  ids.forEach(function(id){
    const task = tasks.find(function(x){ return x.id === id && !x.deletedAt; });
    if(task){ task.priority = priority; task.updatedAt = Date.now(); n++; }
  });
  setTasks(tasks);
  _batchState.selected.clear();
  _batchState.mode = false;
  _renderBatchUI();
  if(n > 0) toast(t("msg.batchPriority","已批量修改 ") + n + t("msg.batchPrioritySuffix"," 个任务的优先级"), "ok");
  return n;
}
/**
 * 内部：渲染批量操作 UI（工具栏显隐 + 卡片 checkbox 显隐 + 选中态高亮）
 * @returns {void}
 */
function _renderBatchUI(){
  const toolbar = $("#batchToolbar");
  if(toolbar) toolbar.style.display = _batchState.mode ? "flex" : "none";
  const selCount = $("#batchSelCount");
  if(selCount) selCount.textContent = String(_batchState.selected.size);
  // 卡片 checkbox 显隐 + 选中高亮
  $$(".kcard[data-drag]").forEach(function(card){
    const id = card.getAttribute("data-drag");
    let chk = card.querySelector(".batch-chk");
    if(_batchState.mode){
      if(!chk){
        // 注入 checkbox（仅一次）
        const span = document.createElement("span");
        span.className = "batch-chk-wrap";
        span.innerHTML = sanitizeHtml(t("p3.html.batchChk","<input type=\"checkbox\" class=\"batch-chk\" aria-label=\"选择此任务\">"));
        const input = span.firstChild;
        input.onclick = function(e){ e.stopPropagation(); };
        input.onchange = function(){ toggleBatchSelect(id, input.checked); };
        card.insertBefore(span, card.firstChild);
        chk = input;
      }
      chk.checked = _batchState.selected.has(id);
      card.classList.add("batch-mode");
      if(chk.checked) card.classList.add("batch-selected");
      else card.classList.remove("batch-selected");
    } else {
      if(chk){
        const wrap = card.querySelector(".batch-chk-wrap");
        if(wrap) wrap.remove();
      }
      card.classList.remove("batch-mode", "batch-selected");
    }
  });
}
/**
 * 绑定批量操作工具栏事件（在 bindScenario 末尾调用一次，幂等）
 * @returns {void}
 */
function bindBatchToolbar(){
  const toolbar = $("#batchToolbar");
  if(!toolbar || toolbar._bound) return;
  toolbar._bound = true;
  const btnComplete = $("#btnBatchComplete");
  const btnDelete = $("#btnBatchDelete");
  const btnMove = $("#btnBatchMove");
  const btnPriority = $("#btnBatchPriority");
  const btnCancel = $("#btnBatchCancel");
  const btnSelectAll = $("#btnBatchSelectAll");
  if(btnComplete) btnComplete.onclick = function(){ batchComplete(); render(); };
  if(btnDelete) btnDelete.onclick = function(){ batchDelete(); render(); };
  if(btnMove) btnMove.onclick = function(){
    const sel = $("#batchMoveTarget");
    if(sel && sel.value){ batchMoveScenario(sel.value); render(); }
    else toast(t("msg.selectTargetScenario","请选择目标场景"), "warn");
  };
  if(btnPriority) btnPriority.onclick = function(){
    const sel = $("#batchPriorityTarget");
    if(sel){ batchSetPriority(sel.value); render(); }
  };
  if(btnCancel) btnCancel.onclick = function(){ toggleBatchMode(false); render(); };
  if(btnSelectAll) btnSelectAll.onclick = function(){
    const input = btnSelectAll.querySelector("input") || btnSelectAll;
    toggleBatchSelectAll(input.checked !== true);
    render();
  };
}
