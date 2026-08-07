// ===== UI Layer (交互层·命令面板) =====
/* ---------- 命令面板（P5' 增强：模糊搜索 / 分组 / 最近使用） ---------- */
let cmdItems=[], cmdSel=0;
const CMD_RECENT_KEY = PREFIX+"cmd_recent";
/**
 * 读取最近使用命令标签（最多 5 条，最新在前）
 * @returns {string[]}
 */
function getCmdRecent(){
  const v = load(CMD_RECENT_KEY, []);
  return Array.isArray(v) ? v.filter(x=>typeof x==="string" && x).slice(0,5) : [];
}
/**
 * 记录命令使用：去重并置顶，最多保留 5 条
 * @param {string} label - 命令标签
 * @returns {void}
 */
function pushCmdRecent(label){
  if(!label) return;
  const list = getCmdRecent().filter(x=>x!==label);
  list.unshift(label);
  save(CMD_RECENT_KEY, list.slice(0,5));
}
/**
 * 模糊匹配打分：子串命中 > 子序列命中；连续匹配与首字符命中加分
 * @param {string} text - 候选文本
 * @param {string} q - 查询词（内部转小写）
 * @returns {number} >0 匹配（分值），-1 不匹配
 */
function fuzzyScore(text, q){
  q = String(q||"").toLowerCase();
  if(!q) return 10;
  const s = String(text||"").toLowerCase();
  const i0 = s.indexOf(q);
  if(i0 >= 0) return 200 - Math.min(i0, 100) + (i0===0 ? 20 : 0); // 子串：基础高分，开头命中再加
  let pos = 0, score = 0, prev = -2;
  for(let qi=0; qi<q.length; qi++){
    const f = s.indexOf(q[qi], pos);
    if(f < 0) return -1;
    score += 1;
    if(f === prev + 1) score += 4; // 连续匹配加分
    if(f === 0) score += 6;        // 首字符加分
    prev = f; pos = f + 1;
  }
  return score;
}
/**
 * 构建命令列表（命令/场景/任务三组；无查询时「最近使用」置顶；有查询时模糊匹配按分值排序）
 * @param {string} [q] - 查询词
 * @returns {Array<{label:string,group?:string,icon?:string,sub?:string,run:Function}>}
 */
function buildCmds(q){
  q=(q||"").toLowerCase();
  const acts=[
    {label:"新建任务", icon:UI_ICONS.plus, sub:"N", group:"命令", run:()=>{ if(getActive()==="overview"){setActive("office");render();} const f=$("#taskForm"); if(f) f.title.focus(); }},
    {label:"切换明暗主题", icon:UI_ICONS.theme, group:"命令", run:toggleTheme},
    {label:"导出 JSON 备份", icon:UI_ICONS.download, group:"命令", run:doExport},
    {label:"导出任务 CSV", icon:UI_ICONS.download, group:"命令", run:doExportCSV},
    {label:"导出任务 Markdown", icon:UI_ICONS.download, group:"命令", run:doExportMD},
    {label:"导入恢复", icon:UI_ICONS.upload, group:"命令", run:()=> $("#fileInput").click()},
    {label:"清空全部数据", icon:UI_ICONS.trash, group:"命令", run:doClear},
    {label:"打开设置", icon:UI_ICONS.gear, group:"命令", run:openDrawer},
    {label:"查看工作记忆", icon:UI_ICONS.chat, group:"命令", run:showMemories},
    {label:"清空工作记忆", icon:UI_ICONS.trash, group:"命令", run:()=>{ save(PREFIX+"memory",[]); toast("已清空工作记忆","ok"); }},
    {label:"取消当前目标", icon:UI_ICONS.trash, group:"命令", run:()=>{ const g=cancelGoal(); toast(g?("已取消目标「"+g.title+"」"):"当前无进行中目标","ok"); }},
    {label:"查看总览", icon:UI_ICONS.overview, group:"命令", run:()=>{active="overview";render();}}
  ];
  const scs=ORDER.map(sc=>({label:"切到 "+SCENARIOS[sc].name, icon:SCENARIOS[sc].icon || "", group:"场景", run:()=>{setActive(sc);render();}}));
  const tasks=getActiveTasks().filter(t=>t.status!=="done").slice(0,12)
    .map(t=>({label:t.title, icon:SCENARIOS[t.sc].icon || "", sub:SCENARIOS[t.sc].name, group:"任务", trackRecent:false, run:()=>{setActive(t.sc);render();}}));
  const items=acts.concat(scs, tasks);
  if(q){
    // 模糊匹配：标签+副标题联合打分，按分值降序
    return items
      .map(it=>Object.assign({}, it, { _score: fuzzyScore((it.label||"")+(it.sub?" "+it.sub:""), q) }))
      .filter(it=> it._score > 0)
      .sort((a,b)=> b._score - a._score);
  }
  // 无查询：「最近使用」组置顶（去重复制，执行幂等）
  const recentLabels = getCmdRecent();
  if(!recentLabels.length) return items;
  const recent = [];
  recentLabels.forEach(lb=>{
    const src = items.find(it=> it.label===lb);
    if(src) recent.push(Object.assign({}, src, { group:"最近", recent:true }));
  });
  return recent.concat(items);
}
/**
 * 渲染命令列表（分组头 + 可选项；可选项带 data-i，分组头不参与选择）
 * @param {string} [q] - 查询词
 * @returns {void}
 */
function renderCmd(q){
  cmdItems=buildCmds(q); cmdSel=0;
  const ul=$("#cmdList"); if(!ul) return;
  if(!cmdItems.length){ ul.innerHTML=`<li class="cmd-empty" style="color:var(--muted);cursor:default;justify-content:center">无匹配</li>`; return; }
  let html="", lastGroup=null;
  cmdItems.forEach((it,i)=>{
    const g = it.group || "";
    if(g && g!==lastGroup){ html += `<li class="cmd-group">${esc(g)}</li>`; lastGroup=g; }
    html += `<li class="${i===cmdSel?"sel":""}" data-i="${i}">
    <span class="ci">${it.icon}</span><span>${esc(it.label)}</span>${it.sub?`<span class="sub">${esc(it.sub)}</span>`:""}</li>`;
  });
  ul.innerHTML=html;
  [...ul.querySelectorAll("li[data-i]")].forEach(li=>{
    li.onmouseenter=()=>{ cmdSel=+li.dataset.i; updateCmdSel(); };
    li.onclick=()=> runCmd(+li.dataset.i);
  });
}
function updateCmdSel(){ const ul=$("#cmdList"); if(!ul) return;
  [...ul.querySelectorAll("li[data-i]")].forEach(li=> li.classList.toggle("sel", +li.dataset.i===cmdSel)); }
/**
 * 执行命令（记录最近使用；task 跳转类不计入）
 * @param {number} i - cmdItems 下标
 * @returns {void}
 */
function runCmd(i){ const it=cmdItems[i]; if(!it||!it.run) return; if(it.trackRecent!==false) pushCmdRecent(it.label); closeCmd(); it.run(); }
/**
 * 打开命令面板（清空输入、渲染全部命令、聚焦输入框）
 * @returns {void}
 */
function openCmd(){ const c=$("#cmd"); if(!c) return; c.classList.add("show"); $("#cmdOverlay").classList.add("show");
  const i=$("#cmdInput"); i.value=""; renderCmd(""); i.focus(); }
function closeCmd(){ $("#cmd").classList.remove("show"); $("#cmdOverlay").classList.remove("show"); }
