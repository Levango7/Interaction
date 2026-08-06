/* ---------- Agent 引擎：记忆 / 目标 / 多步编排（A-P3：在既有 chatOnce + TOOLS 契约上扩展，不另起链路） ---------- */
const AGENT_MEM_MAX = 60;        // 工作记忆容量（环形截断，防无限增长）
const AGENT_GOAL_LOOP_MAX = 12;  // 目标激活时 runChatLoop 循环上限（无目标时仍用默认 6）

/* 记忆：中短期工作记忆。scope=global 全场景通用；否则按场景键隔离。 */
function getMemories(){ return load(PREFIX+"memory", []); }
function saveMemories(a){ save(PREFIX+"memory", a.slice(-AGENT_MEM_MAX)); }
function addMemory(scope, text){
  const rec = { id: uid(), scope: scope||"global", text: String(text||"").trim(), ts: Date.now(), hits: 0 };
  if(!rec.text) return null;
  const mem = getMemories(); mem.push(rec); saveMemories(mem); return rec;
}
function forgetMemory(id){
  const mem = getMemories();
  const i = mem.findIndex(m=>m.id===id || (m.text||"").includes(String(id||"")));
  if(i<0) return null;
  const r = mem.splice(i,1)[0]; saveMemories(mem); return r;
}
/* 召回：场景匹配 + 关键词命中 + 近期加权 + 命中次数，返回 topN */
function recallMemories(query, sc, limit){
  const q = String(query||"").toLowerCase();
  const kws = q.split(/[\s,，。、;；]+/).filter(w=>w.length>=2);
  const now = Date.now();
  return getMemories()
    .filter(m=> m.scope==="global" || m.scope===sc)
    .map(m=>{
      let score = (m.scope==="global"?1:2) + (m.hits||0)*0.1;
      score += Math.max(0, 3 - ((now-(m.ts||now))/86400000)*0.05); // 约 2 个月内线性衰减
      const text=(m.text||"").toLowerCase();
      for(const w of kws){ if(text.includes(w)) score+=2; }
      return {m, score};
    })
    .sort((a,b)=>b.score-a.score)
    .slice(0, limit||8)
    .map(x=>x.m);
}
function touchMemories(list){
  const ids=new Set(list.map(m=>m.id)); const mem=getMemories();
  mem.forEach(m=>{ if(ids.has(m.id)) m.hits=(m.hits||0)+1; });
  saveMemories(mem);
}

/* 目标：单目标聚焦（新目标顶替旧的进行中目标），步骤可跨场景调用既有工具 */
function getGoals(){ return load(PREFIX+"goals", []); }
function saveGoals(a){ save(PREFIX+"goals", a); }
function activeGoal(){ return getGoals().find(g=>g.status==="active") || null; }
function _updateGoal(g){ saveGoals(getGoals().map(x=>x.id===g.id?g:x)); }
function createGoal(title, steps, sc){
  const gs=getGoals();
  gs.forEach(g=>{ if(g.status==="active") g.status="done"; });
  const g={ id:uid(), title:String(title||"未命名目标"), sc:sc||active,
    steps:(Array.isArray(steps)?steps:[]).map(s=>({text:String(s),done:false})),
    status:"active", ts:Date.now() };
  gs.push(g); saveGoals(gs); return g;
}
function completeGoal(summary){
  const g=activeGoal(); if(!g) return null;
  g.status="done"; g.summary=String(summary||""); g.doneAt=Date.now(); _updateGoal(g); return g;
}
function cancelGoal(){
  const g=activeGoal(); if(!g) return null;
  g.status="cancelled"; _updateGoal(g); return g;
}
function markStep(idx, note){
  const g=activeGoal(); if(!g) return null;
  const i=+idx; if(!(i>=0 && i<g.steps.length)) return null;
  g.steps[i].done=true; if(note) g.steps[i].note=String(note);
  _updateGoal(g); return g;
}

/* Agent 工具分发：execTool 未识别的名字落到此处（不回调 execTool，无递归） */
function agentExec(name, args){
  args = args||{};
  if(name==="remember"){
    const scope = (args.scope && (args.scope==="global" || ORDER.includes(args.scope)))? args.scope : active;
    const r=addMemory(scope, args.text);
    return r? JSON.stringify({ok:true, id:r.id, msg:"已记住["+(scope==="global"?"全局":SCENARIOS[scope].name)+"]："+r.text})
            : JSON.stringify({ok:false,msg:"记忆内容为空"});
  }
  if(name==="recall"){
    const hits=recallMemories(args.query||"", active, 8);
    return JSON.stringify({count:hits.length, items:hits.map(m=>({id:m.id,scope:m.scope,text:m.text}))});
  }
  if(name==="forget"){
    const r=forgetMemory(args.id);
    return r? JSON.stringify({ok:true,msg:"已遗忘："+r.text}) : JSON.stringify({ok:false,msg:"未找到该记忆"});
  }
  if(name==="plan"){
    const g=createGoal(args.goal, args.steps, ORDER.includes(args.scenario)?args.scenario:active);
    return JSON.stringify({ok:true,id:g.id,msg:"已建立目标「"+g.title+"」，共"+g.steps.length+"步。请按步骤调用工具执行，每完成一步用 complete_step 标记，全部完成后用 complete_goal 收尾。"});
  }
  if(name==="complete_step"){
    const g=markStep(args.index, args.note);
    if(!g) return JSON.stringify({ok:false,msg:"无进行中的目标或步骤序号无效"});
    const rest=g.steps.filter(s=>!s.done).length;
    return JSON.stringify({ok:true,msg:"步骤"+(+args.index+1)+"已完成，剩余"+rest+"步", remaining:rest});
  }
  if(name==="complete_goal"){
    const g=completeGoal(args.summary);
    return g? JSON.stringify({ok:true,msg:"目标完成："+g.title}) : JSON.stringify({ok:false,msg:"当前无进行中的目标"});
  }
  if(name==="list_records"){
    const sc=ORDER.includes(args.scenario)?args.scenario:active;
    const all=getRec(sc);
    return JSON.stringify({count:all.length, items:all.slice(-10).map(r=>{const c=Object.assign({},r);delete c.id;delete c.created;return c;})});
  }
  return JSON.stringify({ok:false, msg:"未知工具："+name});
}

/* Agent 上下文：工作记忆 + 进行中目标，注入系统提示（cfg.agent=false 时整体关闭） */
function agentContextPrompt(userText){
  const cfg=getCfg();
  if(cfg.agent===false) return "";
  const parts=[];
  const mems=recallMemories(userText||"", active, 6);
  if(mems.length){
    touchMemories(mems);
    parts.push("【工作记忆】（你与用户此前沉淀的事实/偏好，回答与操作时请保持一致；过时内容可用 forget 清理）：\n"+
      mems.map(m=>"- ["+(m.scope==="global"?"全局":(SCENARIOS[m.scope]?SCENARIOS[m.scope].name:m.scope))+"] "+m.text).join("\n"));
  }
  const g=activeGoal();
  if(g){
    const lines=g.steps.map((s,i)=> (i+1)+". "+(s.done?"[x] ":"[ ] ")+s.text).join("\n");
    const nextIdx=g.steps.findIndex(s=>!s.done);
    parts.push("【进行中目标】「"+g.title+"」（场景："+(SCENARIOS[g.sc]?SCENARIOS[g.sc].name:g.sc)+"）：\n"+lines+
      (nextIdx>=0? "\n请继续执行第"+(nextIdx+1)+"步；完成后用 complete_step 标记，全部完成用 complete_goal 收尾。"
                 : "\n所有步骤已完成，请调用 complete_goal 收尾并总结。"));
  }
  return parts.length? "\n\n"+parts.join("\n\n") : "";
}


