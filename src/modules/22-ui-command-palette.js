// ===== UI Layer (交互层·命令面板) =====
/* ---------- 命令面板 ---------- */
let cmdItems=[], cmdSel=0;
function buildCmds(q){
  q=(q||"").toLowerCase();
  const acts=[
    {label:"新建任务", icon:UI_ICONS.plus, sub:"N", run:()=>{ if(getActive()==="overview"){setActive("office");render();} const f=$("#taskForm"); if(f) f.title.focus(); }},
    {label:"切换明暗主题", icon:UI_ICONS.theme, run:toggleTheme},
    {label:"导出 JSON 备份", icon:UI_ICONS.download, run:doExport},
    {label:"导入恢复", icon:UI_ICONS.upload, run:()=> $("#fileInput").click()},
    {label:"清空全部数据", icon:UI_ICONS.trash, run:doClear},
    {label:"打开设置", icon:UI_ICONS.gear, run:openDrawer},
    {label:"查看工作记忆", icon:UI_ICONS.chat, run:showMemories},
    {label:"清空工作记忆", icon:UI_ICONS.trash, run:()=>{ save(PREFIX+"memory",[]); toast("已清空工作记忆","ok"); }},
    {label:"取消当前目标", icon:UI_ICONS.trash, run:()=>{ const g=cancelGoal(); toast(g?("已取消目标「"+g.title+"」"):"当前无进行中目标","ok"); }},
    {label:"查看总览", icon:UI_ICONS.overview, run:()=>{active="overview";render();}}
  ];
  const scs=ORDER.map(sc=>({label:"切到 "+SCENARIOS[sc].name, icon:SCENARIOS[sc].icon || "", run:()=>{setActive(sc);render();}}));
  const tasks=getTasks().filter(t=>t.status!=="done").slice(0,12)
    .map(t=>({label:t.title, icon:SCENARIOS[t.sc].icon || "", sub:SCENARIOS[t.sc].name, run:()=>{setActive(t.sc);render();}}));
  let items=acts.concat(scs, tasks);
  if(q) items=items.filter(it=> (it.label||"").toLowerCase().includes(q) || (it.sub&&it.sub.toLowerCase().includes(q)));
  return items;
}
function renderCmd(q){
  cmdItems=buildCmds(q); cmdSel=0;
  const ul=$("#cmdList"); if(!ul) return;
  if(!cmdItems.length){ ul.innerHTML=`<li style="color:var(--muted);cursor:default;justify-content:center">无匹配</li>`; return; }
  ul.innerHTML=cmdItems.map((it,i)=>`<li class="${i===cmdSel?"sel":""}" data-i="${i}">
    <span class="ci">${it.icon}</span><span>${esc(it.label)}</span>${it.sub?`<span class="sub">${esc(it.sub)}</span>`:""}</li>`).join("");
  [...ul.querySelectorAll("li")].forEach(li=>{
    li.onmouseenter=()=>{ cmdSel=+li.dataset.i; updateCmdSel(); };
    li.onclick=()=> runCmd(+li.dataset.i);
  });
}
function updateCmdSel(){ const ul=$("#cmdList"); if(!ul) return;
  [...ul.querySelectorAll("li")].forEach((li,i)=> li.classList.toggle("sel", i===cmdSel)); }
function runCmd(i){ const it=cmdItems[i]; if(!it||!it.run) return; closeCmd(); it.run(); }
/**
 * 打开命令面板（清空输入、渲染全部命令、聚焦输入框）
 * @returns {void}
 */
function openCmd(){ const c=$("#cmd"); if(!c) return; c.classList.add("show"); $("#cmdOverlay").classList.add("show");
  const i=$("#cmdInput"); i.value=""; renderCmd(""); i.focus(); }
function closeCmd(){ $("#cmd").classList.remove("show"); $("#cmdOverlay").classList.remove("show"); }

