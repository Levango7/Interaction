// ===== AI Layer (AI 层·工具调用) =====
/* ---------- 工具（AI 可调用） ---------- */
function findTask(key){
  const tasks=getTasks();
  const k=String(key||"").trim();
  if(!k) return null;
  let i=tasks.findIndex(x=>x.id===k && !x.deletedAt);          // ① id 精确匹配优先
  if(i<0) i=tasks.findIndex(x=>!x.deletedAt && (x.title||"").includes(k)); // 回退到标题包含
  return i<0? null : {task:tasks[i], i, tasks};
}
/**
 * AI 工具调用分发：create_task/list_tasks/complete_task/update_task/delete_task/add_record/search/query_overview/export_data
 * @param {string} name - 工具名
 * @param {Object} args - 工具参数
 * @param {boolean} [force] - 内部确认触发参数（true 时跳过危险操作二次确认）
 * @returns {string} JSON 字符串形式的结果
 */
function execTool(name, args, force){
  try{
    if(name==="create_task"){
      const sc = ORDER.includes(args.scenario)? args.scenario : active;
      const tags = Array.isArray(args.tags)? args.tags.map(String).filter(Boolean) : [];
      const tasks = getTasks();
      tasks.push({id:uid(), sc, title:String(args.title||"未命名"), due:args.due||"",
        priority:["","P0","P1","P2"].includes(args.priority)?args.priority:"", status:"todo", doneAt:null, note:"", tags, created:Date.now()});
      setTasks(tasks);
      return JSON.stringify({ok:true, id:tasks[tasks.length-1].id, msg:"已在"+SCENARIOS[sc].name+"创建任务："+args.title});
    }
    if(name==="list_tasks"){
      const sc = ORDER.includes(args.scenario)? args.scenario : active;
      const st = ["","todo","doing","done"].includes(args.status)? args.status : "";
      let t = getActiveTasks().filter(x=>x.sc===sc); if(st) t=t.filter(x=>x.status===st);
      return JSON.stringify({count:t.length, items:t.slice(0,20).map(x=>({title:x.title,status:x.status,due:x.due}))});
    }
    if(name==="complete_task"){
      const ft = findTask(args.task_id);
      if(!ft) return JSON.stringify({ok:false,msg:"未找到匹配任务："+args.task_id});
      completeTask(ft.task.id);
      return JSON.stringify({ok:true, msg:"已完成："+ft.task.title});
    }
    if(name==="update_task"){
      const ft = findTask(args.task_id);
      if(!ft) return JSON.stringify({ok:false,msg:"未找到匹配任务："+args.task_id});
      if(!force){
        pendingConfirm={op:"update_task", task_id:ft.task.id, title:ft.task.title};
        return JSON.stringify({ok:false, confirm:"将修改：「"+ft.task.title+"」（id "+ft.task.id+"）。发送「确认」以继续，其他内容取消。", op:"update_task", task_id:ft.task.id, title:ft.task.title});
      }
      const ch={};
      if(args.status && ["todo","doing","done"].includes(args.status)){
        if(args.status==="done"){ completeTask(ft.task.id); ft.tasks=getTasks(); ch.status="done"; }
        else { ft.task.status=args.status; ft.task.doneAt=null; ch.status=args.status; }
      }
      if(args.priority!==undefined && ["","P0","P1","P2"].includes(args.priority)){ ft.task.priority=args.priority; ch.priority=args.priority; }
      if(args.due!==undefined){ ft.task.due=args.due; ch.due=args.due; }
      if(Array.isArray(args.tags)){ ft.task.tags=args.tags.map(String).filter(Boolean); ch.tags=ft.task.tags; }
      setTasks(ft.tasks);
      return JSON.stringify({ok:true, msg:"已更新「"+ft.task.title+"」："+JSON.stringify(ch)});
    }
    if(name==="delete_task"){
      const ft = findTask(args.task_id);
      if(!ft) return JSON.stringify({ok:false,msg:"未找到匹配任务："+args.task_id});
      if(!force){
        pendingConfirm={op:"delete_task", task_id:ft.task.id, title:ft.task.title};
        return JSON.stringify({ok:false, confirm:"将删除：「"+ft.task.title+"」（id "+ft.task.id+"）。发送「确认」以继续，其他内容取消。", op:"delete_task", task_id:ft.task.id, title:ft.task.title});
      }
      ft.task.deletedAt=Date.now(); setTasks(ft.tasks); // ③ 软删除：进回收站，可恢复
      return JSON.stringify({ok:true, msg:"已删除（进入左侧「回收站」，可恢复）："+ft.task.title});
    }
    if(name==="add_record"){
      const sc = ORDER.includes(args.scenario)? args.scenario : active;
      const obj = {id:uid(), created:Date.now()};
      const flds = (SCENARIOS[sc]&&SCENARIOS[sc].record.fields)||[];
      flds.forEach(f=> obj[f.k] = (args.fields&&args.fields[f.k]!==null&&args.fields[f.k]!==undefined)? String(args.fields[f.k]) : "");
      const arr = getRec(sc); arr.unshift(obj); setRec(sc, arr);
      return JSON.stringify({ok:true, msg:"已向"+SCENARIOS[sc].name+"资料库添加记录"});
    }
    if(name==="search"){
      const q=String(args.query||"").toLowerCase(); const tasks=getTasks();
      const tMatch=tasks.filter(x=>!x.deletedAt && x.title.toLowerCase().includes(q)).slice(0,10)
        .map(x=>({sc:SCENARIOS[x.sc].name,title:x.title,status:x.status,due:x.due}));
      const rMatch=[]; ORDER.forEach(sc=> getRec(sc).forEach(r=>{
        const t=String(r.title||""); if(t.toLowerCase().includes(q)) rMatch.push({sc:SCENARIOS[sc].name,title:t}); }));
      return JSON.stringify({tasks:tMatch, records:rMatch.slice(0,10), count:tMatch.length+rMatch.length});
    }
    if(name==="query_overview"){
      const t = getTasks(); const bySc = {};
      ORDER.forEach(s=> bySc[s] = {name:SCENARIOS[s].name, open:t.filter(x=>x.sc===s&&x.status!=="done"&&!x.deletedAt).length, done:t.filter(x=>x.sc===s&&x.status==="done"&&!x.deletedAt).length});
      const today = t.filter(x=>x.status!=="done"&&!x.deletedAt&&x.due===todayStr()).length;
      const overdue = t.filter(x=>x.status!=="done"&&!x.deletedAt&&x.due&&x.due<todayStr()).length;
      return JSON.stringify({byScenario:bySc, today, overdue});
    }
    if(name==="export_data"){
      doExport();
      return JSON.stringify({ok:true,msg:"已触发 JSON 备份导出"});
    }
    return agentExec(name, args); // A-P3：记忆/目标等 Agent 工具由此分发
  }catch(e){
    // 工具执行异常：诊断 + 提示，仍返回结构化错误（保持 execTool 调用方契约）
    pushDiag("error", "execTool error: "+(e&&e.message||e), {where:"execTool", tool:name});
    try{ toast("工具执行异常："+(e&&e.message||"未知错误"), "error"); }catch(e2){ /* toast 不可用时静默降级 */ }
    return JSON.stringify({ok:false, error:String(e)});
  }
}
const TOOLS = [
  {type:"function", function:{name:"create_task", description:"在指定场景创建一条任务（标题必填），可带标签", parameters:{type:"object", properties:{
    scenario:{type:"string", enum:ORDER, description:"场景键，如 office/code/study"},
    title:{type:"string", description:"任务标题"}, due:{type:"string", description:"截止日期 YYYY-MM-DD，可空"},
    priority:{type:"string", enum:["","P0","P1","P2"]}, tags:{type:"array", items:{type:"string"}, description:"标签列表"}}, required:["title"]}}},
  {type:"function", function:{name:"list_tasks", description:"查询某场景的任务，可按状态过滤", parameters:{type:"object", properties:{
    scenario:{type:"string", enum:ORDER}, status:{type:"string", enum:["","todo","doing","done"]}}, required:[]}}},
  {type:"function", function:{name:"complete_task", description:"按任务 id 或标题关键词标记任务完成", parameters:{type:"object", properties:{
    task_id:{type:"string", description:"任务 id，或任务标题中的关键词（用于定位任务）"}}, required:["task_id"]}}},
  {type:"function", function:{name:"update_task", description:"修改任务的状态/优先级/截止日期/标签（按 id 或标题关键词定位）", parameters:{type:"object", properties:{
    task_id:{type:"string", description:"任务 id，或任务标题中的关键词"}, status:{type:"string", enum:["todo","doing","done"]},
    priority:{type:"string", enum:["","P0","P1","P2"]}, due:{type:"string", description:"新截止日期 YYYY-MM-DD"},
    tags:{type:"array", items:{type:"string"}, description:"覆盖该任务的标签"}}, required:["task_id"]}}},
  {type:"function", function:{name:"delete_task", description:"按 id 或标题关键词删除一条任务（进入回收站，可恢复）", parameters:{type:"object", properties:{
    task_id:{type:"string", description:"任务 id，或任务标题中的关键词"}}, required:["task_id"]}}},
  {type:"function", function:{name:"add_record", description:"向某场景的资料库添加一条记录", parameters:{type:"object", properties:{
    scenario:{type:"string", enum:ORDER}, fields:{type:"object", description:"该场景资料库的字段键值对，例如 {title:'xxx', hours:'10'}"}}, required:["scenario","fields"]}}},
  {type:"function", function:{name:"search", description:"全局搜索任务与资料库中的条目", parameters:{type:"object", properties:{
    query:{type:"string", description:"搜索关键词"}}, required:["query"]}}},
  {type:"function", function:{name:"query_overview", description:"返回各场景任务统计与今日/逾期待处理数量", parameters:{type:"object", properties:{}}}},
  {type:"function", function:{name:"export_data", description:"导出当前全部数据为 JSON 备份", parameters:{type:"object", properties:{}}}},
  {type:"function", function:{name:"remember", description:"把用户的事实/偏好/决定写入工作记忆，供后续对话自动召回（如“我喜欢简洁回复”“本周重点是 v2 上线”）", parameters:{type:"object", properties:{
    scope:{type:"string", enum:["global"].concat(ORDER), description:"global=全场景通用，否则按场景键隔离"}, text:{type:"string", description:"要记住的内容，一句话"}}, required:["text"]}}},
  {type:"function", function:{name:"recall", description:"按关键词检索工作记忆，回答涉及用户偏好/历史决定前先查", parameters:{type:"object", properties:{
    query:{type:"string", description:"检索关键词"}}, required:[]}}},
  {type:"function", function:{name:"forget", description:"按 id 或内容关键词删除一条工作记忆", parameters:{type:"object", properties:{
    id:{type:"string", description:"记忆 id 或内容关键词"}}, required:["id"]}}},
  {type:"function", function:{name:"plan", description:"为多步任务建立目标与步骤清单（跨场景可拆步）。建立后按步骤调用工具执行，每步完成用 complete_step 标记，全部完成用 complete_goal 收尾", parameters:{type:"object", properties:{
    goal:{type:"string", description:"目标标题"}, scenario:{type:"string", enum:ORDER, description:"主场景"}, steps:{type:"array", items:{type:"string"}, description:"步骤清单，按执行顺序"}}, required:["goal","steps"]}}},
  {type:"function", function:{name:"complete_step", description:"标记当前目标的某一步已完成", parameters:{type:"object", properties:{
    index:{type:"integer", description:"步骤序号（从 0 开始）"}, note:{type:"string", description:"该步结果说明，可空"}}, required:["index"]}}},
  {type:"function", function:{name:"complete_goal", description:"目标全部步骤完成后调用，收尾并总结", parameters:{type:"object", properties:{
    summary:{type:"string", description:"完成总结"}}, required:[]}}},
  {type:"function", function:{name:"list_records", description:"查询某场景资料库的最近记录（会议纪要/代码片段/学习资料/生活备忘等）", parameters:{type:"object", properties:{
    scenario:{type:"string", enum:ORDER}}, required:[]}}}
];

