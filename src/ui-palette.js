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
 * 拼音首字母表（v3.7.10）
 * 只收录「命令标签里实际出现的汉字」——64 个，约 1KB，避免引入完整拼音库（那是几百 KB）。
 * 新增命令后若标签出现新字，补进这张表即可（未收录的字不参与首字母匹配，不影响原有功能）。
 */
const PY_INIT = {
  "主":"z","习":"x","令":"l","任":"r","份":"f","作":"z","健":"j","入":"r","全":"q","公":"g",
  "出":"c","切":"q","到":"d","前":"q","办":"b","务":"w","取":"q","命":"m","回":"h","场":"c",
  "备":"b","复":"f","学":"x","导":"d","工":"g","康":"k","建":"j","开":"k","当":"d","忆":"y",
  "总":"z","恢":"h","打":"d","换":"h","据":"j","收":"s","数":"s","新":"x","明":"m","景":"j",
  "暗":"a","最":"z","查":"c","标":"b","活":"h","消":"x","清":"q","生":"s","目":"m","看":"k",
  "程":"c","空":"k","站":"z","统":"t","编":"b","置":"z","览":"l","计":"j","记":"j","设":"s",
  "近":"j","部":"b","配":"p","题":"t",
  /* v3.7.22：接入工具面板后补齐 —— 工具名用到的字（原先 64 字只覆盖命令标签） */
  "辑":"j","器":"q","富":"f","文":"w","本":"b","表":"b","格":"g","幻":"h","灯":"d","片":"p",
  "阅":"y","读":"d","截":"j","图":"t","画":"h","布":"b","视":"s","频":"p","成":"c","在":"z",
  "线":"x","检":"j","索":"s","代":"d","码":"m","运":"y","行":"x","具":"j","时":"s","间":"j",
  "戳":"c","解":"j","随":"s","机":"j","串":"c","正":"z","则":"z","测":"c","试":"s","转":"z",
  "动":"d","录":"l","缴":"j","费":"f","提":"t","醒":"x","采":"c","购":"g","单":"d","外":"w",
  "卖":"m",
  /* v3.7.59：「技能」组固定标签用到的字（技能 = j n，把上一轮固化为技能 = b s y l g h w j n） */
  "技":"j","能":"n","把":"b","上":"s","一":"y","轮":"l","固":"g","化":"h","为":"w",
};
/**
 * 取文本的「拼音首字母串」：汉字取首字母、ASCII 字母数字原样保留，其余字符忽略
 * @param {string} text - 原文
 * @returns {{text:string, idx:number[]}} text 为字母串，idx 为每个字母对应的**原文下标**（用于把命中的字母映射回高亮位置）
 */
function pinyinInitials(text){
  const s = String(text||"");
  let out = "";
  const idx = [];
  for(let i=0;i<s.length;i++){
    const ch = s[i];
    if(PY_INIT[ch]) { out += PY_INIT[ch]; idx.push(i); }
    else if(/[A-Za-z0-9]/.test(ch)) { out += ch.toLowerCase(); idx.push(i); }
  }
  return { text: out, idx: idx };
}
/**
 * 打分核心（输入需已小写）：子串命中 > 子序列命中；连续匹配与首字符命中加分
 * @param {string} ls - 已小写的候选文本
 * @param {string} q - 已小写的查询词（非空）
 * @returns {{score:number, positions:number[]}}
 */
function fuzzyScoreCore(ls, q){
  const i0 = ls.indexOf(q);
  if(i0 >= 0){
    const positions = [];
    for(let i=0;i<q.length;i++) positions.push(i0+i);
    return { score: 200 - Math.min(i0, 100) + (i0===0 ? 20 : 0), positions };
  }
  let pos = 0, score = 0, prev = -2;
  const positions = [];
  for(let qi=0; qi<q.length; qi++){
    const f = ls.indexOf(q[qi], pos);
    if(f < 0) return { score: -1, positions: [] };
    score += 1;
    if(f === prev + 1) score += 4; // 连续匹配加分
    if(f === 0) score += 6;        // 首字符加分
    positions.push(f); prev = f; pos = f + 1;
  }
  return { score, positions };
}
/**
 * 模糊匹配（带命中位置）：先按原文匹配；纯 ASCII 查询再尝试**拼音首字母**（如 xjrw → 新建任务）
 * @param {string} text - 候选文本
 * @param {string} q - 查询词
 * @returns {{score:number, positions:number[]}} score>0 匹配，-1 不匹配；positions 为 text 中命中的下标
 */
function fuzzyMatch(text, q){
  q = String(q||"").toLowerCase();
  const s = String(text||"");
  const ls = s.toLowerCase();
  if(!q) return { score: 10, positions: [] };
  const direct = fuzzyScoreCore(ls, q);
  if(direct.score > 0) return direct;
  /* 拼音首字母：仅当查询是纯 ASCII 时尝试（中文查询不做二次尝试，避免语义混乱）。
     分值乘 0.8 —— 让"直接匹配"排在同分首字母匹配之前。 */
  if(/^[a-z0-9]+$/.test(q)){
    const py = pinyinInitials(s);
    if(py.text){
      const m = fuzzyScoreCore(py.text, q);
      if(m.score > 0) return { score: Math.round(m.score * 0.8), positions: m.positions.map(i => py.idx[i]) };
    }
  }
  return { score: -1, positions: [] };
}
/**
 * 模糊匹配打分（fuzzyMatch 的轻量包装，保持既有调用方与测试不变）
 * @param {string} text - 候选文本
 * @param {string} q - 查询词
 * @returns {number} >0 匹配（分值），-1 不匹配
 */
function fuzzyScore(text, q){ return fuzzyMatch(text, q).score; }
/**
 * 按命中位置给文本加高亮标签（逐字符转义，避免下标错位与注入）
 * @param {string} text - 原始文本
 * @param {number[]} positions - 需要高亮的字符下标
 * @returns {string} 可直接插入 innerHTML 的片段（内部已转义）
 */
function highlightHits(text, positions){
  const set = new Set(positions || []);
  return String(text||"").split("").map((ch,i)=> set.has(i) ? `<b class="cmd-hit">${esc(ch)}</b>` : esc(ch)).join("");
}
/**
 * 构建命令列表（命令/场景/任务三组；无查询时「最近使用」置顶；有查询时模糊匹配按分值排序）
 * @param {string} [q] - 查询词
 * @returns {Array<{label:string,group?:string,icon?:string,sub?:string,run:Function}>}
 */
/* P0-4：命令注册（幂等）。放这里而不是 cmd-registry.js 的原因：这些命令的 run 与 icon
   依赖 UI 层符号（toggleTheme / doExport / UI_ICONS…），而注册表本身留在 Core 层只提供机制。
   ⚠️ label 用 labelKey 惰性求值，**不能**在注册时 t() 立即取值 —— 否则用户切成英文后命令名还是中文。 */
let _appCmdsRegistered = false;
function registerAppCmds(){
  if(_appCmdsRegistered) return;
  _appCmdsRegistered = true;
  const G = { groupKey: "cmd.command", groupFallback: "命令" };
  [
    /* v3.7.132（P0-4 第二步）：`keys` 现在是**键位定义的唯一真相源** ——
       面板的快捷键提示（sub）由它生成，`ui-hotkeys.js` 也按它分发，两处不再各写一份。
       因此只填**确有其键**的：`n` = 新建任务、`g` = 总览（后者原先只写在 hotkeys 里，
       面板上看不到 ⇒ 用户无从发现，属"功能存在但不可见"）。 */
    { id:"task.new", labelKey:"cmd.newTask", labelFallback:"新建任务", icon:UI_ICONS.plus, keys:["n"], run:()=>{ if(getActive()==="overview" || getActive()==="stats"){ setActive("office"); } render(); focusTaskTitleInput(); } },
    { id:"theme.toggle", labelKey:"cmd.toggleTheme", labelFallback:"切换明暗主题", icon:UI_ICONS.theme, run:toggleTheme },
    { id:"data.exportJson", labelKey:"cmd.exportJson", labelFallback:"导出 JSON 备份", icon:UI_ICONS.download, run:doExport },
    { id:"data.exportCsv", labelKey:"cmd.exportCsv", labelFallback:"导出任务 CSV", icon:UI_ICONS.download, run:doExportCSV },
    { id:"data.exportMd", labelKey:"cmd.exportMd", labelFallback:"导出任务 Markdown", icon:UI_ICONS.download, run:doExportMD },
    { id:"data.importRestore", labelKey:"cmd.importRestore", labelFallback:"导入恢复", icon:UI_ICONS.upload, run:()=> $("#fileInput").click() },
    { id:"data.clear", labelKey:"cmd.clearAll", labelFallback:"清空全部数据", icon:UI_ICONS.trash, keys:[], run:doClear },
    { id:"ui.openSettings", labelKey:"cmd.openSettings", labelFallback:"打开设置", icon:UI_ICONS.gear, run:()=>{ AppBridge.openDrawer(); } },
    { id:"memory.view", labelKey:"cmd.viewMemory", labelFallback:"查看工作记忆", icon:UI_ICONS.chat, run:showMemories },
    { id:"memory.clear", labelKey:"cmd.clearMemory", labelFallback:"清空工作记忆", icon:UI_ICONS.trash, run:()=>{ save(PREFIX+"memory",[]); toast(t("msg.memoryCleared","已清空工作记忆"),"ok"); } },
    { id:"goal.cancel", labelKey:"cmd.cancelGoal", labelFallback:"取消当前目标", icon:UI_ICONS.trash, run:()=>{ const g=cancelGoal(); toast(g?(t("msg.goalCancelled","已取消目标「")+g.title+"」"):t("msg.noActiveGoal","当前无进行中目标"),"ok"); } },
    { id:"view.overview", labelKey:"cmd.viewOverview", labelFallback:"查看总览", icon:UI_ICONS.overview, keys:["g"], run:()=>{active="overview";render();} },
    { id:"view.stats", labelKey:"cmd.viewStats", labelFallback:"查看统计", icon:UI_ICONS.grid, run:()=>{ setActive("stats"); render(); } },
    { id:"ui.openAi", labelKey:"cmd.openAi", labelFallback:"打开 AI 配置", icon:UI_ICONS.robot, run:()=>{ AppBridge.openAiPage(); } },
    { id:"ui.openRecycle", labelKey:"cmd.openRecycle", labelFallback:"打开回收站", icon:UI_ICONS.trash, run:()=>{ if(typeof openRecycle==="function") openRecycle(); } }
  ].forEach(function(c){ registerCmd(Object.assign({}, G, c)); });
}

/** 从注册表生成面板条目：label/group **实时求值**（跟随语言切换），sub 由 keys 生成（与 hotkeys 同源） */
function registeredActs(){
  registerAppCmds();
  return CMD.all().map(function(c){
    return {
      label: c.labelKey ? t(c.labelKey, c.labelFallback) : c.label,
      icon: c.icon,
      sub: (typeof keyHint === "function") ? keyHint(c.keys) : "",
      group: (c.groupKey !== undefined && c.groupKey !== null) ? t(c.groupKey, c.groupFallback) : c.group,
      run: c.run,
      trackRecent: c.trackRecent,
      __id: c.id
    };
  });
}

function buildCmds(q){
  const qRaw = String(q||"").trim();   // 原文：喂给 Agent 的诉求不能是小写化之后的
  q=(q||"").toLowerCase();
  const acts = registeredActs();
  const scs=ORDER.map(sc=>({label:t("cmd.switchTo","切到 ")+SCENARIOS[sc].name, icon:SCENARIOS[sc].icon || "", group:t("cmd.scenario","场景"), run:()=>{setActive(sc);render();}}));
  const tasks=getActiveTasks().filter(t=>t.status!=="done").slice(0,12)
    .map(task=>({label:task.title, icon:SCENARIOS[task.sc].icon || "", sub:SCENARIOS[task.sc].name, group:t("cmd.task","任务"), trackRecent:false, run:()=>{setActive(task.sc);render();}}));
  /* v3.7.22：把工具面板的 22 个工具接入命令面板 ——
     此前它们只能从侧栏二级菜单进，而"快速入口"搜不到；
     接入后自动获得模糊搜索 / 拼音首字母（sjc → 时间戳）/ 最近使用。 */
  const tools=(typeof TOOL_APPS === "object" && TOOL_APPS) ? Object.keys(TOOL_APPS).map(function(id){
    const a=TOOL_APPS[id] || {};
    return { label:a.name || id, icon:a.icon || "", sub:a.desc || "", group:t("cmd.tool","工具"), run:function(){ if(typeof openToolStub === "function") openToolStub(id); } };
  }) : [];
  /* v3.7.59：「扩展 → 技能配置」里定义的自定义技能接进命令面板 ——
     此前那份 JSON 只写不读，勾选项也只是减法地写工具白名单，技能开关点了没反应。
     接线后两条真实通路：① 每条已启用技能一键发进 AI 聊天面板执行；
     ② 上一轮对话成功跑了 ≥2 个工具时，这里出现「把上一轮固化为技能」。
     发出的文本（技能：X / 存为技能）要能被 ai-retry 的拦截正则认出，故用固定字面量并中英各一。 */
  const skills=[];
  if(typeof listEnabledSkills === "function"){
    try{
      if(typeof getPendingSkillOffer === "function" && getPendingSkillOffer()){
        const offer = getPendingSkillOffer();
        skills.push({ label:t("cmd.skillSaveOffer","把上一轮固化为技能"), icon:UI_ICONS.plus,
          sub: offer.steps.map(function(s){ return s.tool; }).join(" → "), group:t("cmd.skill","技能"),
          run:function(){ if(typeof sendChatText === "function") sendChatText(t("cmd.skillSaveText","存为技能")); } });
      }
      listEnabledSkills().slice(0,12).forEach(function(s){
        skills.push({ label:s.name, icon:UI_ICONS.brain,
          sub: s.desc || s.prompt.slice(0,40), group:t("cmd.skill","技能"),
          run:function(){ if(typeof sendChatText === "function") sendChatText(t("cmd.skillInvoke","技能：")+s.name); } });
      });
    }catch(_e){ /* 技能数据异常时命令面板照常工作，不连带拖垮 */ }
  }
  const items=acts.concat(scs, tasks, tools, skills);
  if(q){
    // 模糊匹配：标签+副标题联合打分，按分值降序；命中位置取「标签」上的（高亮给用户看的就是标签）
    const matched = items
      .map(it=>{
        const m = fuzzyMatch((it.label||"")+(it.sub?" "+it.sub:""), q);
        const inLabel = fuzzyMatch(it.label||"", q);
        return Object.assign({}, it, { _score: m.score, _pos: inLabel.score > 0 ? inLabel.positions : [] });
      })
      .filter(it=> it._score > 0)
      .sort((a,b)=> b._score - a._score);
    /* v3.7.59：把「让 AI 自主完成」接进命令面板 —— chatOnceAgent 这条链早就写全但零入口，
       用户根本走不到它。⚠️ 只在查询以 > 开头时出现，且不去抢普通查询的结果首位：
       早先做成"任何 ≥4 字查询都 unshift 一条"，实测连带弄红三条既有面板用例
       （「无匹配」空态变得不可达、li[data-i] 首项被抢、工具项进「最近使用」按下标取也失效）。
       风险由三段兜住：先出计划要用户回「确认执行」、破坏性步骤被 executeAgentPlan 拦掉、步数有上限。 */
    if(qRaw.charAt(0) === ">" && typeof proposeAgentPlan === "function" && getCfg().agent !== false){
      const task = qRaw.slice(1).trim();
      /* v3.7.116：有未完成的执行时，`>` 的副标题先说明现状（点下去也会被 proposeAgentPlan
         拦住并提示）—— 用户在该看见的地方先看见，而不是点了才被告知。 */
      const runSub = (typeof agentRunPending === "function" && agentRunPending())
        ? agentRunNotice()
        : t("cmd.agentRunSub","先出计划，回「确认执行」才落地；删除/修改类步骤不会自主执行");
      if(task.length >= 2){
        matched.unshift({ label: t("cmd.agentRun","让 AI 自主完成：")+task, icon: UI_ICONS.brain,
          sub: runSub,
          group: t("cmd.command","命令"), trackRecent: false,
          run: function(){ proposeAgentPlan(task); } });
      }
    }
    return matched;
  }
  // 无查询：「最近使用」组置顶（去重复制，执行幂等）
  const recentLabels = getCmdRecent();
  if(!recentLabels.length) return items;
  const recent = [];
  recentLabels.forEach(lb=>{
    const src = items.find(it=> it.label===lb);
    if(src) recent.push(Object.assign({}, src, { group:t("cmd.recent","最近"), recent:true }));
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
  if(!cmdItems.length){ ul.innerHTML=sanitizeHtml(`<li class="cmd-empty u-text-muted u-jc-center u-cursor-default">${t("cmd.noMatch","无匹配")}</li>`); return; }
  let html="", lastGroup=null;
  cmdItems.forEach((it,i)=>{
    const g = it.group || "";
    if(g && g!==lastGroup){ html += `<li class="cmd-group">${esc(g)}</li>`; lastGroup=g; }
    /* 有命中位置时逐字符高亮（highlightHits 内部已转义）；否则走 esc */
    const labelHtml = (it._pos && it._pos.length) ? highlightHits(it.label, it._pos) : esc(it.label);
    html += `<li class="${i===cmdSel?"sel":""}" data-i="${i}">
    <span class="ci">${it.icon}</span><span>${labelHtml}</span>${it.sub?`<span class="sub">${esc(it.sub)}</span>`:""}</li>`;
  });
  ul.innerHTML=sanitizeHtml(html);
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
