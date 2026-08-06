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
    if(!confirm("删除这条任务？")) return;
    setTasks(getTasks().filter(t=>t.id!==b.dataset.del)); render();
  });
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
  const tf=$("#tagFilter"); if(tf) tf.oninput=()=>{
    const q=tf.value.trim().toLowerCase();
    $$(".kcard").forEach(card=>{
      const tg=(card.dataset.tags||"").split(" ").filter(Boolean);
      const ok = !q || tg.some(t=>t.toLowerCase().includes(q));
      card.style.display = ok? "" : "none";
    });
  };
  bindExtra(active);
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

