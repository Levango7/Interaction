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
 * @param {boolean} [force] - 确认触发参数（true 跳过二次确认）；v1.14.1 起 AI 可经 args.force 传入
 * @returns {string} JSON 字符串形式的结果
 */
function execTool(name, args, force){
  try{
    // v1.14.1：force 支持经 schema 由 AI 传入（args.force），与第三参等价；默认 false 仍走二次确认
    force = !!(force || (args && args.force === true));
    if(name==="create_task"){
      const sc = ORDER.includes(args.scenario)? args.scenario : active;
      const tags = Array.isArray(args.tags)? args.tags.map(String).filter(Boolean) : [];
      const tasks = getTasks();
      const nt = {id:uid(), sc, title:String(args.title||t("tool.unnamed", "未命名")), due:args.due||"",
        priority:["","P0","P1","P2"].includes(args.priority)?args.priority:"", status:"todo", doneAt:null, note:"", tags, created:Date.now()};
      tasks.push(nt);
      setTasks(tasks);
      _emitTaskEvent("task_create", nt); // v1.12 [1a]：AI/Agent 创建任务也发事件
      return JSON.stringify({ok:true, id:nt.id, msg:t("tool.createdPrefix", "已在")+SCENARIOS[sc].name+t("tool.createdInfix", "创建任务：")+args.title});
    }
    if(name==="list_tasks"){
      const sc = ORDER.includes(args.scenario)? args.scenario : active;
      const st = ["","todo","doing","done"].includes(args.status)? args.status : "";
      let t = getActiveTasks().filter(x=>x.sc===sc); if(st) t=t.filter(x=>x.status===st);
      return JSON.stringify({count:t.length, items:t.slice(0,20).map(x=>({title:x.title,status:x.status,due:x.due}))});
    }
    if(name==="complete_task"){
      const ft = findTask(args.task_id);
      if(!ft) return JSON.stringify({ok:false,msg:t("tool.notFoundPrefix", "未找到匹配任务：")+args.task_id});
      completeTask(ft.task.id);
      return JSON.stringify({ok:true, msg:t("tool.completedPrefix", "已完成：")+ft.task.title});
    }
    if(name==="update_task"){
      const ft = findTask(args.task_id);
      if(!ft) return JSON.stringify({ok:false,msg:t("tool.notFoundPrefix", "未找到匹配任务：")+args.task_id});
      if(!force){
        pendingConfirm={op:"update_task", task_id:ft.task.id, title:ft.task.title};
        return JSON.stringify({ok:false, confirm:t("tool.updateConfirmPrefix", "将修改：「")+ft.task.title+t("tool.updateConfirmInfix", "」（id ")+ft.task.id+t("tool.updateConfirmSuffix", "）。发送「确认」以继续，其他内容取消。"), op:"update_task", task_id:ft.task.id, title:ft.task.title});
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
      return JSON.stringify({ok:true, msg:t("tool.updatedPrefix", "已更新「")+ft.task.title+t("tool.updatedInfix", "」：")+JSON.stringify(ch)});
    }
    if(name==="delete_task"){
      const ft = findTask(args.task_id);
      if(!ft) return JSON.stringify({ok:false,msg:t("tool.notFoundPrefix", "未找到匹配任务：")+args.task_id});
      if(!force){
        pendingConfirm={op:"delete_task", task_id:ft.task.id, title:ft.task.title};
        return JSON.stringify({ok:false, confirm:t("tool.deleteConfirmPrefix", "将删除：「")+ft.task.title+t("tool.deleteConfirmInfix", "」（id ")+ft.task.id+t("tool.deleteConfirmSuffix", "）。发送「确认」以继续，其他内容取消。"), op:"delete_task", task_id:ft.task.id, title:ft.task.title});
      }
      ft.task.deletedAt=Date.now(); setTasks(ft.tasks); // ③ 软删除：进回收站，可恢复
      _emitTaskEvent("task_delete", ft.task); // v1.12 [1a]：AI 删除任务发事件
      return JSON.stringify({ok:true, msg:t("tool.deletedPrefix", "已删除（进入左侧「回收站」，可恢复）：")+ft.task.title});
    }
    if(name==="add_record"){
      const sc = ORDER.includes(args.scenario)? args.scenario : active;
      const obj = {id:uid(), created:Date.now()};
      const flds = (SCENARIOS[sc]&&SCENARIOS[sc].record.fields)||[];
      flds.forEach(f=> obj[f.k] = (args.fields&&args.fields[f.k]!==null&&args.fields[f.k]!==undefined)? String(args.fields[f.k]) : "");
      const arr = getRec(sc); arr.unshift(obj); setRec(sc, arr);
      return JSON.stringify({ok:true, msg:t("tool.recordAddedPrefix", "已向")+SCENARIOS[sc].name+t("tool.recordAddedInfix", "资料库添加记录")});
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
      return JSON.stringify({ok:true,msg:t("tool.exportTriggeredMsg", "已触发 JSON 备份导出")});
    }
    if(name==="add_feature_record"){
      const fid = String(args.feature || "");
      const bcfg = (SCENE_FEATURE_BIND[active] || {})[fid];
      if(!bcfg) return JSON.stringify({ok:false, msg:t("tool.unknownFeaturePrefix", "未知功能：")+fid+t("tool.unknownFeatureSuffix", "（可用：meeting/project/attendance/expense/knowledge/reading/exercise/exam/report/chart/frontend/sql/ui/model3d/plan）")});
      const rec = { id: uid(), createdAt: Date.now() };
      const fields = (args && args.fields) || {};
      bcfg.fieldKeys.forEach(function(k){
        if(fields[k] !== undefined && fields[k] !== null) rec[k] = String(fields[k]);
      });
      if(!bcfg.fieldKeys.some(function(k){ return rec[k]; })) return JSON.stringify({ok:false, msg:t("tool.fieldRequiredMsg", "请提供至少一个字段值")});
      const arr = load(PREFIX + bcfg.key, []);
      arr.unshift(rec);
      save(PREFIX + bcfg.key, arr);
      return JSON.stringify({ok:true, msg:t("tool.featureAddedPrefix", "已添加到")+fid+t("tool.featureAddedInfix", "功能")});
    }
    // ===== AI 能力增强：新工具分发（同步工具直接执行；异步工具经 agentExecAsync 分发） =====
    if(name==="note_add"){
      const r=createNote(args.title||"", args.content||"", Array.isArray(args.tags)?args.tags:[], args.category||"");
      return JSON.stringify({ok:true, id:r.id, msg:t("agent.noteAdded","已添加笔记：")+(r.title||"")});
    }
    if(name==="note_search"){
      const q=String(args.query||"").toLowerCase();
      const notes=getNotes();
      const hits=notes.filter(n=> (n.title||"").toLowerCase().includes(q) || (n.content||"").toLowerCase().includes(q)).slice(0,10)
        .map(n=>({id:n.id,title:n.title,tags:n.tags,category:n.category}));
      return JSON.stringify({count:hits.length, items:hits});
    }
    /* ---------- v3.5.2 新增工具 ---------- */
    if(name==="generate_report"){
      const period = ["day","week","month"].includes(args.period) ? args.period : "week";
      const sc = (args.scope && SCENARIOS[args.scope]) ? args.scope : "";
      const days = period==="day" ? 1 : (period==="week" ? 7 : 30);
      const since = new Date(); since.setDate(since.getDate() - days + 1);
      const sinceStr = since.toISOString().slice(0,10);
      const allTasks = getActiveTasks().filter(function(x){ return !sc || x.sc===sc; });
      const done = allTasks.filter(function(x){ return x.status==="done" && (x.doneAt||0) >= since.getTime(); });
      const open = allTasks.filter(function(x){ return x.status!=="done"; });
      const overdue = open.filter(function(x){ return x.due && x.due < todayStr(); });
      const bySc = {}; allTasks.forEach(function(x){ bySc[x.sc]=(bySc[x.sc]||0)+1; });
      const recLines = [];
      (sc ? [sc] : ORDER).forEach(function(k){
        const recs = getRec(k) || [];
        const inP = recs.filter(function(r){ const d = r.date || (r.created ? new Date(r.created).toISOString().slice(0,10) : ""); return d >= sinceStr; });
        if(inP.length) recLines.push("- " + ((SCENARIOS[k]&&SCENARIOS[k].name)||k) + "：" + inP.length + " " + t("report.unitRec","条记录"));
      });
      const md = "# " + (sc&&SCENARIOS[sc] ? SCENARIOS[sc].name+" " : "") + t("report.title","工作报表") + "（" + t("report.period."+period, period==="day"?"今日":(period==="week"?"本周":"本月")) + "）" + "\n" + "\n"
        + "## " + t("report.summary","概览") + "\n"
        + "- " + t("report.done","已完成") + "：" + done.length + "\n"
        + "- " + t("report.open","待办/进行中") + "：" + open.length + "\n"
        + "- " + t("report.overdue","逾期") + "：" + overdue.length + "\n" + "\n"
        + "## " + t("report.byScenario","场景分布") + "\n"
        + (Object.keys(bySc).map(function(k){ return "- " + ((SCENARIOS[k]&&SCENARIOS[k].name)||k) + "：" + bySc[k]; }).join("\n") || "- " + t("report.none","无")) + "\n" + "\n"
        + "## " + t("report.records","周期内记录") + "\n"
        + (recLines.join("\n") || "- " + t("report.none","无"));
      return JSON.stringify({ok:true, markdown: md, msg: t("report.generated","报表已生成")});
    }
    if(name==="render_chart"){
      const arr = Array.isArray(args.data) ? args.data.filter(function(d){ return d && d.label!==undefined && isFinite(Number(d.value)); }).map(function(d){ return {label:String(d.label), value:Number(d.value)}; }) : [];
      if(!arr.length) return JSON.stringify({ok:false, msg:t("tool.chartNoData","无有效数据点")});
      const ct = ["bar","line","pie"].includes(args.type) ? args.type : "bar";
      return "__CHART__" + JSON.stringify({type:ct, title:String(args.title||""), data:arr});
    }
    if(name==="generate_doc"){
      const ttl = String(args.title||t("tool.unnamed","未命名"));
      const r = createNote(ttl, String(args.content||""), [], String(args.category||t("doc.categoryDefault","AI 文档")));
      return JSON.stringify({ok:true, id:r.id, msg:t("tool.docSaved","文档已保存到笔记：")+ttl});
    }
    return agentExec(name, args); // A-P3：记忆/目标等 Agent 工具由此分发
  }catch(e){
    // 工具执行异常：诊断 + 提示，仍返回结构化错误（保持 execTool 调用方契约）
    pushDiag("error", "execTool error: "+(e&&e.message||e), {where:"execTool", tool:name});
    try{ toast(t("tool.execErrorPrefix", "工具执行异常：")+(e&&e.message||t("tool.unknownErrorMsg", "未知错误")), "error"); }catch(e2){ /* toast 不可用时静默降级 */ }
    return JSON.stringify({ok:false, error:String(e)});
  }
}

/* v1.14.1：从 SCENARIOS 派生 add_record.fields 的场景子 schema（单一真相源，避免 fields 契约漂移） */
function _recordFieldsSchema(){
  const anyOf = ORDER.map(function(sc){
    const entry = SCENARIOS[sc];
    const props = {};
    (entry && entry.record && entry.record.fields || []).forEach(function(f){
      props[f.k] = { type:"string", description:(f.label || f.k) + (f.placeholder ? t("tool.fieldDescInfix", "，如 ") + f.placeholder : "") };
    });
    return { type:"object", description:(entry ? entry.name : sc) + t("tool.scenarioRecordSuffix", "场景资料库字段"), properties: props };
  });
  return { type:"object", description:t("tool.recordFieldsDesc", "资料库字段，键随 scenario 而定（不同场景字段不同，见 anyOf）"), anyOf: anyOf };
}

const TOOLS = [
  {type:"function", function:{name:"create_task", description:t("aitool.create_task.desc","在指定场景创建一条任务（标题必填），可带标签"), parameters:{type:"object", properties:{
    scenario:{type:"string", enum:ORDER, description:t("aitool.create_task.scenario.desc","场景键，如 office/code/study")},
    title:{type:"string", description:t("aitool.create_task.title.desc","任务标题")}, due:{type:"string", description:t("aitool.create_task.due.desc","截止日期 YYYY-MM-DD，可空")},
    priority:{type:"string", enum:["","P0","P1","P2"]}, tags:{type:"array", items:{type:"string"}, description:t("aitool.create_task.tags.desc","标签列表")}}, required:["title"]}}},
  {type:"function", function:{name:"list_tasks", description:t("aitool.list_tasks.desc","查询某场景的任务，可按状态过滤"), parameters:{type:"object", properties:{
    scenario:{type:"string", enum:ORDER}, status:{type:"string", enum:["","todo","doing","done"]}}, required:[]}}},
  {type:"function", function:{name:"complete_task", description:t("aitool.complete_task.desc","按任务 id 或标题关键词标记任务完成"), parameters:{type:"object", properties:{
    task_id:{type:"string", description:t("aitool.complete_task.task_id.desc","任务 id，或任务标题中的关键词（用于定位任务）")}}, required:["task_id"]}}},
  {type:"function", function:{name:"update_task", description:t("aitool.update_task.desc","修改任务的状态/优先级/截止日期/标签（按 id 或标题关键词定位）"), parameters:{type:"object", properties:{
    task_id:{type:"string", description:t("aitool.update_task.task_id.desc","任务 id，或任务标题中的关键词")}, status:{type:"string", enum:["todo","doing","done"]},
    priority:{type:"string", enum:["","P0","P1","P2"]}, due:{type:"string", description:t("aitool.update_task.due.desc","新截止日期 YYYY-MM-DD")},
    tags:{type:"array", items:{type:"string"}, description:t("aitool.update_task.tags.desc","覆盖该任务的标签")},
    force:{type:"boolean", description:t("aitool.update_task.force.desc","设为 true 直接执行修改；默认 false 会先返回确认提示（需二次确认）")}}, required:["task_id"]}}},
  {type:"function", function:{name:"delete_task", description:t("aitool.delete_task.desc","按 id 或标题关键词删除一条任务（进入回收站，可恢复）"), parameters:{type:"object", properties:{
    task_id:{type:"string", description:t("aitool.delete_task.task_id.desc","任务 id，或任务标题中的关键词")},
    force:{type:"boolean", description:t("aitool.delete_task.force.desc","设为 true 直接软删除（进回收站）；默认 false 会先返回确认提示（需二次确认）")}}, required:["task_id"]}}},
  {type:"function", function:{name:"add_record", description:t("aitool.add_record.desc","向某场景的资料库添加一条记录"), parameters:{type:"object", properties:{
    scenario:{type:"string", enum:ORDER}, fields:_recordFieldsSchema()}, required:["scenario","fields"]}}},
  {type:"function", function:{name:"search", description:t("aitool.search.desc","全局搜索任务与资料库中的条目"), parameters:{type:"object", properties:{
    query:{type:"string", description:t("aitool.search.query.desc","搜索关键词")}}, required:["query"]}}},
  {type:"function", function:{name:"query_overview", description:t("aitool.query_overview.desc","返回各场景任务统计与今日/逾期待处理数量"), parameters:{type:"object", properties:{}}}},
  {type:"function", function:{name:"export_data", description:t("aitool.export_data.desc","导出当前全部数据为 JSON 备份"), parameters:{type:"object", properties:{}}}},
  {type:"function", function:{name:"remember", description:t("aitool.remember.desc","把用户的事实/偏好/决定写入工作记忆，供后续对话自动召回（如“我喜欢简洁回复”“本周重点是 v2 上线”）"), parameters:{type:"object", properties:{
    scope:{type:"string", enum:["global"].concat(ORDER), description:t("aitool.remember.scope.desc","global=全场景通用，否则按场景键隔离")}, text:{type:"string", description:t("aitool.remember.text.desc","要记住的内容，一句话")}}, required:["text"]}}},
  {type:"function", function:{name:"recall", description:t("aitool.recall.desc","按关键词检索工作记忆，回答涉及用户偏好/历史决定前先查"), parameters:{type:"object", properties:{
    query:{type:"string", description:t("aitool.recall.query.desc","检索关键词")}}, required:["query"]}}},
  {type:"function", function:{name:"forget", description:t("aitool.forget.desc","按 id 或内容关键词删除一条工作记忆"), parameters:{type:"object", properties:{
    id:{type:"string", description:t("aitool.forget.id.desc","记忆 id 或内容关键词")}}, required:["id"]}}},
  {type:"function", function:{name:"plan", description:t("aitool.plan.desc","为多步任务建立目标与步骤清单（跨场景可拆步）。建立后按步骤调用工具执行，每步完成用 complete_step 标记，全部完成用 complete_goal 收尾"), parameters:{type:"object", properties:{
    goal:{type:"string", description:t("aitool.plan.goal.desc","目标标题")}, scenario:{type:"string", enum:ORDER, description:t("aitool.plan.scenario.desc","主场景")}, steps:{type:"array", items:{type:"string"}, description:t("aitool.plan.steps.desc","步骤清单，按执行顺序")}}, required:["goal","steps"]}}},
  {type:"function", function:{name:"complete_step", description:t("aitool.complete_step.desc","标记当前目标的某一步已完成"), parameters:{type:"object", properties:{
    index:{type:"integer", description:t("aitool.complete_step.index.desc","步骤序号（从 0 开始）")}, note:{type:"string", description:t("aitool.complete_step.note.desc","该步结果说明，可空")}}, required:["index"]}}},
  {type:"function", function:{name:"complete_goal", description:t("aitool.complete_goal.desc","目标全部步骤完成后调用，收尾并总结"), parameters:{type:"object", properties:{
    summary:{type:"string", description:t("aitool.complete_goal.summary.desc","完成总结")}}, required:[]}}},
  {type:"function", function:{name:"list_records", description:t("aitool.list_records.desc","查询某场景资料库的最近记录（会议纪要/代码片段/学习资料/生活备忘等）"), parameters:{type:"object", properties:{
    scenario:{type:"string", enum:ORDER}}, required:["scenario"]}}},
  {type:"function", function:{name:"add_feature_record", description:t("aitool.add_feature_record.desc","向当前场景的功能卡添加一条记录（如会议/项目/考勤/报销/知识库/阅读/练习/考试/报表/图表/前端/SQL/UI/3D/计划）"), parameters:{type:"object", properties:{
    feature:{type:"string", description:t("aitool.add_feature_record.feature.desc","功能 id：meeting/project/attendance/expense/knowledge/reading/exercise/exam/report/chart/frontend/sql/ui/model3d/plan")},
    fields:{type:"object", description:t("aitool.add_feature_record.fields.desc","字段键值对（各功能表单字段，如会议 title/date/who/note）")}}, required:["feature","fields"]}}},
  // ===== AI 能力增强：新工具 schema（web_search/web_fetch/code_run/sql_query/note_add/note_search） =====
  {type:"function", function:{name:"web_search", description:t("aitool.web_search.desc","联网搜索（可配置搜索引擎，返回标题/摘要/链接）"), parameters:{type:"object", properties:{
    query:{type:"string", description:t("aitool.web_search.query.desc","搜索关键词")}, engine:{type:"string", description:t("aitool.web_search.engine.desc","搜索引擎 id（可空，默认用配置）")}, limit:{type:"integer", description:t("aitool.web_search.limit.desc","返回条数（默认 5）")}}, required:["query"]}}},
  {type:"function", function:{name:"web_fetch", description:t("aitool.web_fetch.desc","抓取指定 URL 的网页内容（纯文本，去标签）"), parameters:{type:"object", properties:{
    url:{type:"string", description:t("aitool.web_fetch.url.desc","要抓取的 URL（http/https）")}, selector:{type:"string", description:t("aitool.web_fetch.selector.desc","可选 CSS 选择器（提取局部）")}}, required:["url"]}}},
  {type:"function", function:{name:"code_run", description:t("aitool.code_run.desc","在 Web Worker 沙箱中运行 JS 代码（5s 超时，收集 console 输出）"), parameters:{type:"object", properties:{
    code:{type:"string", description:t("aitool.code_run.code.desc","要执行的 JS 代码片段")}, timeout:{type:"integer", description:t("aitool.code_run.timeout.desc","超时毫秒（默认 5000）")}}, required:["code"]}}},
  {type:"function", function:{name:"sql_query", description:t("aitool.sql_query.desc","在内存 SQLite（sql.js WASM）中运行 SQL，返回列名与行数据"), parameters:{type:"object", properties:{
    sql:{type:"string", description:t("aitool.sql_query.sql.desc","SQL 语句（支持多语句，以分号分隔）")}, schema:{type:"string", description:t("aitool.sql_query.schema.desc","建表 DDL（可选，执行前先运行）")}}, required:["sql"]}}},
  {type:"function", function:{name:"note_add", description:t("aitool.note_add.desc","新增一条笔记（标题/内容/标签/分类），存 localStorage"), parameters:{type:"object", properties:{
    title:{type:"string", description:t("aitool.note_add.title.desc","笔记标题")}, content:{type:"string", description:t("aitool.note_add.content.desc","Markdown 内容")},
    tags:{type:"array", items:{type:"string"}, description:t("aitool.note_add.tags.desc","标签列表")}, category:{type:"string", description:t("aitool.note_add.category.desc","分类（如知识库/工作笔记）")}}, required:["title","content"]}}},
  {type:"function", function:{name:"note_search", description:t("aitool.note_search.desc","按关键词搜索笔记（标题+内容匹配）"), parameters:{type:"object", properties:{
    query:{type:"string", description:t("aitool.note_search.query.desc","搜索关键词")}}, required:["query"]}}},
  /* v3.5.2 新增：报表生成 / 数据可视化 / 文档生成 */
  {type:"function", function:{name:"generate_report", description:t("aitool.generate_report.desc","生成指定周期的工作报表（Markdown 文本）：完成/逾期任务、各场景分布、周期内记录统计"), parameters:{type:"object", properties:{
    period:{type:"string", enum:["day","week","month"], description:t("aitool.generate_report.period.desc","统计周期，默认 week")},
    scope:{type:"string", description:t("aitool.generate_report.scope.desc","场景键（office/health/finance 等），留空为全部场景")}}, required:[]}}},
  {type:"function", function:{name:"render_chart", description:t("aitool.render_chart.desc","在对话里渲染一张数据图表（bar/line/pie），数据由你根据已查到的数据整理"), parameters:{type:"object", properties:{
    type:{type:"string", enum:["bar","line","pie"], description:t("aitool.render_chart.type.desc","图表类型，默认 bar")},
    title:{type:"string", description:t("aitool.render_chart.title.desc","图表标题")},
    data:{type:"array", items:{type:"object", properties:{label:{type:"string"},value:{type:"number"}}, required:["label","value"]}, description:t("aitool.render_chart.data.desc","数据点数组，如 [{label:'周一',value:3}]")}}, required:["data"]}}},
  {type:"function", function:{name:"generate_doc", description:t("aitool.generate_doc.desc","生成一份文档（Markdown）并保存到笔记库"), parameters:{type:"object", properties:{
    title:{type:"string", description:t("aitool.generate_doc.title.desc","文档标题")},
    content:{type:"string", description:t("aitool.generate_doc.content.desc","Markdown 正文")},
    category:{type:"string", description:t("aitool.generate_doc.category.desc","分类，如 方案/复盘/工作文档")}}, required:["title","content"]}}}
];

/* ---------- AI 层降级重定位（v1.15）：cfg.agent=false 时关闭 Agent 工具与话术 ----------
 * 背景：此前 cfg.agent=false 仅关闭记忆/目标上下文注入（agentContextPrompt 返回空），
 * 但 TOOLS 仍无条件暴露 remember/plan 等 7 个 agent 工具，chatSysPrompt 也无条件引导使用——
 * 话术与能力不一致（AI 会被引导调用已"关闭"的能力）。
 * 修复：effectiveTools() 按 cfg.agent 过滤；chatSysPrompt 同步降级话术。
 */
const AGENT_TOOL_NAMES = ["remember","recall","forget","plan","complete_step","complete_goal","list_records"];
/** 计算实际暴露给模型的工具集（cfg.agent=false 时剔除 Agent 工具） */
function effectiveTools(){
  const cfg = getCfg();
  if(cfg && cfg.agent === false){
    return TOOLS.filter(function(t){
      const n = t && t.function && t.function.name;
      return n && AGENT_TOOL_NAMES.indexOf(n) === -1;
    });
  }
  return TOOLS;
}

/* ---------- Agent 引擎：记忆 / 目标 / 多步编排（A-P3：在既有 chatOnce + TOOLS 契约上扩展，不另起链路） ---------- */
const AGENT_MEM_MAX = 60;        // 工作记忆容量默认值（R5：可在设置页配置，见 getMemMax）
const AGENT_GOAL_LOOP_MAX = 12;  // 目标激活时 runChatLoop 循环上限（无目标时仍用默认 6）

/**
 * R5：读取工作记忆容量（cfg.memMax，默认 60，钳制到 20~500）
 * @returns {number}
 */
function getMemMax(){
  const cfg = getCfg() || {};
  let n = Number(cfg.memMax);
  if(!isFinite(n)) n = AGENT_MEM_MAX;
  return Math.min(500, Math.max(20, Math.round(n)));
}

/* 记忆：中短期工作记忆。scope=global 全场景通用；否则按场景键隔离。 */
function getMemories(){ return load(PREFIX+"memory", []); }
function saveMemories(a){ save(PREFIX+"memory", a.slice(-getMemMax())); }
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
  const g={ id:uid(), title:String(title||t("agent.unnamedGoal", "未命名目标")), sc:sc||active,
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
    return r? JSON.stringify({ok:true, id:r.id, msg:t("agent.rememberPrefix", "已记住[")+(scope==="global"?t("agent.scope.global", "全局"):SCENARIOS[scope].name)+t("agent.rememberInfix", "]：")+r.text})
            : JSON.stringify({ok:false,msg:t("agent.memEmptyMsg", "记忆内容为空")});
  }
  if(name==="recall"){
    const hits=recallMemories(args.query||"", active, 8);
    return JSON.stringify({count:hits.length, items:hits.map(m=>({id:m.id,scope:m.scope,text:m.text}))});
  }
  if(name==="forget"){
    const r=forgetMemory(args.id);
    return r? JSON.stringify({ok:true,msg:t("agent.forgetPrefix", "已遗忘：")+r.text}) : JSON.stringify({ok:false,msg:t("agent.memNotFoundMsg", "未找到该记忆")});
  }
  if(name==="plan"){
    const g=createGoal(args.goal, args.steps, ORDER.includes(args.scenario)?args.scenario:active);
    return JSON.stringify({ok:true,id:g.id,msg:t("agent.planMsgPrefix", "已建立目标「")+g.title+t("agent.planMsgInfix", "」，共")+g.steps.length+t("agent.planMsgSuffix", "步。请按步骤调用工具执行，每完成一步用 complete_step 标记，全部完成后用 complete_goal 收尾。")});
  }
  if(name==="complete_step"){
    const g=markStep(args.index, args.note);
    if(!g) return JSON.stringify({ok:false,msg:t("agent.noActiveGoalMsg", "无进行中的目标或步骤序号无效")});
    const rest=g.steps.filter(s=>!s.done).length;
    return JSON.stringify({ok:true,msg:t("agent.stepDonePrefix", "步骤")+(+args.index+1)+t("agent.stepDoneInfix", "已完成，剩余")+rest+t("agent.stepDoneSuffix", "步"), remaining:rest});
  }
  if(name==="complete_goal"){
    const g=completeGoal(args.summary);
    return g? JSON.stringify({ok:true,msg:t("agent.goalDonePrefix", "目标完成：")+g.title}) : JSON.stringify({ok:false,msg:t("agent.noGoalMsg", "当前无进行中的目标")});
  }
  if(name==="list_records"){
    const sc=ORDER.includes(args.scenario)?args.scenario:active;
    const all=getRec(sc);
    return JSON.stringify({count:all.length, items:all.slice(-10).map(r=>{const c=Object.assign({},r);delete c.id;delete c.created;return c;})});
  }
  return JSON.stringify({ok:false, msg:t("agent.unknownToolPrefix", "未知工具：")+name});
}

/* Agent 上下文：工作记忆 + 进行中目标，注入系统提示（cfg.agent=false 时整体关闭） */
function agentContextPrompt(userText){
  const cfg=getCfg();
  if(cfg.agent===false) return "";
  const parts=[];
  const mems=recallMemories(userText||"", active, 6);
  if(mems.length){
    touchMemories(mems);
    parts.push(t("agent.ctx.memHeader", "【工作记忆】（你与用户此前沉淀的事实/偏好，回答与操作时请保持一致；过时内容可用 forget 清理）：\n")+
      mems.map(m=>"- ["+(m.scope==="global"?t("agent.scope.global", "全局"):(SCENARIOS[m.scope]?SCENARIOS[m.scope].name:m.scope))+"] "+m.text).join("\n"));
  }
  const g=activeGoal();
  if(g){
    const lines=g.steps.map((s,i)=> (i+1)+". "+(s.done?"[x] ":"[ ] ")+s.text).join("\n");
    const nextIdx=g.steps.findIndex(s=>!s.done);
    parts.push(t("agent.ctx.goalHeaderPrefix", "【进行中目标】「")+g.title+t("agent.ctx.goalHeaderInfix", "」（场景：")+(SCENARIOS[g.sc]?SCENARIOS[g.sc].name:g.sc)+t("agent.ctx.goalHeaderSuffix", "）：\n")+lines+
      (nextIdx>=0? t("agent.ctx.goalContinuePrefix", "\n请继续执行第")+(nextIdx+1)+t("agent.ctx.goalContinueSuffix", "步；完成后用 complete_step 标记，全部完成用 complete_goal 收尾。")
                 : t("agent.ctx.goalAllDone", "\n所有步骤已完成，请调用 complete_goal 收尾并总结。")));
  }
  return parts.length? "\n\n"+parts.join("\n\n") : "";
}


/* ============================================================
 * AI 能力增强（任务 232）—— 在既有 chatOnce / execTool / agentExec 契约上扩展
 * ------------------------------------------------------------
 *   1. AI Agent 自动化：多步骤任务规划 + 自动执行 + 结果汇总
 *   2. 新工具调用：web_search / web_fetch / code_run / sql_query / note_add / note_search
 *   3. RAG（检索增强生成）：SQLite FTS5 全文索引 + 自动注入相关上下文
 *   4. 流式输出增强：多模型切换 / 重试改参数 / 流式进度指示
 *
 * 设计原则：
 *   - 不修改既有 chatOnce / execTool / runChatLoop 主体，仅新增函数并在 execTool 末尾分发
 *   - 异步工具(web_search/web_fetch/code_run/sql_query)经 agentExecAsync 分发，execTool 同步路径只处理 note_*
 *   - RAG 索引持久化到 localStorage（FTS5 内存表 + 倒排记录），避免引入 IndexedDB 二级存储
 *   - 所有颜色用 var(--token) 令牌；i18n 键值新增 aiagent.* / rag.* / aistream.* 命名空间
 * ============================================================ */

/* ---------- 1. AI Agent 自动化：多步骤规划 + 自动执行 + 结果汇总 ---------- */
/**
 * Agent 模式系统提示：引导 AI 输出 JSON 格式的步骤计划
 * @param {string} userText - 用户请求
 * @returns {string} 系统提示
 */
function agentPlanSysPrompt(userText){
  return t("aiagent.sysPrompt",
    "你是任务规划助手。收到用户请求后，请先拆解为可执行步骤，输出 JSON 格式的计划：\n"+
    '```json\n{"goal":"目标标题","steps":[{"tool":"工具名","args":{},"desc":"步骤说明"}]}\n```\n'+
    "可用工具：create_task/list_tasks/complete_task/update_task/search/query_overview/note_add/note_search/web_search/web_fetch/code_run/sql_query。\n"+
    "只输出 JSON，不要额外解释。");
}

/**
 * 从 AI 回复中解析步骤计划（兼容 ```json 代码块与纯 JSON）
 * @param {string} text - AI 回复文本
 * @returns {{goal:string, steps:Array<{tool:string, args:Object, desc:string}>}|null}
 */
function parseAgentPlan(text){
  const s = String(text||"").trim();
  if(!s) return null;
  // 优先匹配 ```json ... ``` 代码块
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fence ? fence[1].trim() : s;
  // 找到第一个 { 到最后一个 } 的子串
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if(start < 0 || end <= start) return null;
  const jsonStr = candidate.slice(start, end+1);
  let plan = null;
  try{ plan = JSON.parse(jsonStr); }catch(e){ return null; }
  if(!plan || typeof plan !== "object") return null;
  if(!Array.isArray(plan.steps)) return null;
  // 规范化：每步必须有 tool 字段
  plan.steps = plan.steps.filter(st => st && typeof st.tool === "string");
  if(!plan.steps.length) return null;
  plan.goal = String(plan.goal || t("aiagent.unnamedGoal","未命名目标"));
  plan.steps = plan.steps.map(st => ({
    tool: String(st.tool),
    args: (st.args && typeof st.args === "object") ? st.args : {},
    desc: String(st.desc || st.tool)
  }));
  return plan;
}

/**
 * 逐步执行 Agent 计划：每步调用 execTool（同步工具）或 agentExecAsync（异步工具）
 * @param {{goal:string, steps:Array}} plan - parseAgentPlan 返回值
 * @param {{onProgress?:Function, signal?:AbortSignal}} [opts]
 * @returns {Promise<{ok:boolean, results:Array<{step:object, result:string, ok:boolean}>, summary:string, ms:number}>}
 */
async function executeAgentPlan(plan, opts){
  const o = opts || {};
  const t0 = Date.now();
  const results = [];
  const ASYNC_TOOLS = new Set(["web_search","web_fetch","code_run","sql_query"]);
  for(let i=0; i<plan.steps.length; i++){
    if(o.signal && o.signal.aborted){
      return { ok:false, results, summary:t("aiagent.cancelled","已取消"), ms:Date.now()-t0 };
    }
    const step = plan.steps[i];
    let resultStr = "";
    let stepOk = false;
    try{
      if(ASYNC_TOOLS.has(step.tool)){
        const r = await agentExecAsync(step.tool, step.args);
        resultStr = JSON.stringify(r);
        stepOk = !!(r && r.ok);
      } else {
        resultStr = execTool(step.tool, step.args, true); // 强制执行（Agent 自动模式）
        let rj = null; try{ rj = JSON.parse(resultStr); }catch(_){}
        stepOk = !!(rj && rj.ok !== false);
      }
    }catch(e){
      resultStr = JSON.stringify({ok:false, error:String(e&&e.message||e)});
      stepOk = false;
    }
    results.push({ step, result: resultStr, ok: stepOk });
    if(typeof o.onProgress === "function"){
      try{ o.onProgress(i+1, plan.steps.length, step, resultStr); }catch(_){}
    }
  }
  const summary = summarizeAgentPlan(plan, results);
  return { ok:true, results, summary, ms:Date.now()-t0 };
}

/**
 * 汇总 Agent 计划执行结果
 * @param {{goal:string, steps:Array}} plan
 * @param {Array<{step:object, result:string, ok:boolean}>} results
 * @returns {string} 汇总文本
 */
function summarizeAgentPlan(plan, results){
  const lines = [t("aiagent.summaryHeader","【任务汇总】目标：")+plan.goal];
  results.forEach((r, i) => {
    const mark = r.ok ? "✓" : "✗";
    lines.push((i+1)+". "+mark+" "+r.step.desc+" → "+(r.ok?t("aiagent.done","完成"):t("aiagent.failed","失败")));
  });
  const okCount = results.filter(r=>r.ok).length;
  lines.push(t("aiagent.summaryFooter","共 ")+results.length+t("aiagent.summaryStepUnit"," 步，")+okCount+t("aiagent.summaryOkUnit"," 步成功"));
  return lines.join("\n");
}

/**
 * Agent 模式 chatOnce：先规划再执行再汇总
 * @param {Array<{role:string,content:string}>} messages - 对话历史
 * @param {{signal?:AbortSignal, onProgress?:Function, onChunk?:Function}} [opts]
 * @returns {Promise<{ok:boolean, plan?:object, summary?:string, results?:Array, raw?:string}>}
 */
async function chatOnceAgent(messages, opts){
  const o = opts || {};
  try{
    // ① 规划阶段：用 agentPlanSysPrompt 替换/追加 system 消息
    const planMessages = messages.map(m => ({...m}));
    const sysIdx = planMessages.findIndex(m => m.role === "system");
    const planSys = agentPlanSysPrompt("");
    if(sysIdx >= 0) planMessages[sysIdx].content = planSys + "\n" + planMessages[sysIdx].content;
    else planMessages.unshift({ role:"system", content:planSys });

    const planResp = await chatOnce(planMessages, { signal:o.signal, onChunk:o.onChunk });
    const raw = (planResp.choices && planResp.choices[0] && planResp.choices[0].message && planResp.choices[0].message.content) || "";
    const plan = parseAgentPlan(raw);
    if(!plan){
      // AI 未返回有效计划 → 直接返回原始回复（降级为普通对话）
      return { ok:true, raw, summary:raw };
    }
    // ② 执行阶段
    const execResult = await executeAgentPlan(plan, { signal:o.signal, onProgress:o.onProgress });
    // ③ 汇总阶段：让 AI 基于执行结果生成自然语言总结
    let summary = execResult.summary;
    try{
      const sumMessages = [
        {role:"system", content:t("aiagent.sumSysPrompt","你是任务助手，请基于执行结果用简洁的自然语言总结完成情况。")},
        {role:"user", content:plan.goal},
        {role:"assistant", content:raw},
        {role:"user", content:t("aiagent.sumUserPrompt","执行结果：\n")+execResult.results.map((r,i)=>(i+1)+". "+r.step.desc+" → "+r.result).join("\n")}
      ];
      const sumResp = await chatOnce(sumMessages, { signal:o.signal });
      const sumText = (sumResp.choices && sumResp.choices[0] && sumResp.choices[0].message && sumResp.choices[0].message.content);
      if(sumText) summary = sumText;
    }catch(_){ /* 汇总失败用结构化 summary 兜底 */ }
    return { ok:true, plan, results:execResult.results, summary, raw, ms:execResult.ms };
  }catch(e){
    if(e && e.name === "AbortError") throw e;
    pushDiag("error", "chatOnceAgent error: "+(e&&e.message||e), {where:"chatOnceAgent"});
    return { ok:false, error:String(e&&e.message||e) };
  }
}

/* ---------- 2. 新工具调用：web_search / web_fetch / code_run / sql_query ---------- */
/**
 * 异步工具分发器（web_search/web_fetch/code_run/sql_query）
 * @param {string} name - 工具名
 * @param {Object} args - 工具参数
 * @returns {Promise<{ok:boolean, output?:string, error?:string, [k:string]:any}>}
 */
async function agentExecAsync(name, args){
  args = args || {};
  if(name === "web_search"){
    return await toolWebSearch(args.query || "", args);
  }
  if(name === "web_fetch"){
    return await toolWebFetch(args.url || "", args);
  }
  if(name === "code_run"){
    return await toolCodeRun(args.code || "", args);
  }
  if(name === "sql_query"){
    return await toolSqlQuery(args.sql || "", args.schema || "");
  }
  return { ok:false, error:t("aiagent.unknownAsyncTool","未知异步工具：")+name };
}

/**
 * web_search：联网搜索（可配置搜索引擎，默认 DuckDuckGo Instant Answer API）
 * @param {string} query - 搜索关键词
 * @param {{engine?:string, limit?:number}} [opts]
 * @returns {Promise<{ok:boolean, results:Array, error?:string}>}
 */
async function toolWebSearch(query, opts){
  const o = opts || {};
  const q = String(query||"").trim();
  if(!q) return { ok:false, error:t("aiagent.emptyQuery","搜索关键词为空") };
  const limit = (typeof o.limit === "number" && o.limit > 0) ? Math.min(o.limit, 20) : 5;
  const cfg = getCfg() || {};
  // 搜索引擎配置：cfg.searchEngine = {endpoint, parseFn} 或默认 DuckDuckGo
  const engine = o.engine || cfg.searchEngine || "duckduckgo";
  try{
    if(typeof fetch === "undefined"){
      return { ok:false, error:t("aiagent.noFetch","当前环境不支持 fetch") };
    }
    let url = "";
    if(engine === "duckduckgo" || engine === "ddg"){
      url = "https://api.duckduckgo.com/?q=" + encodeURIComponent(q) + "&format=json&no_html=1&skip_disambig=1";
    } else if(typeof engine === "string" && engine.indexOf("http") === 0){
      // 自定义 endpoint：{q} 占位符替换
      url = engine.replace("{q}", encodeURIComponent(q));
    } else {
      url = "https://api.duckduckgo.com/?q=" + encodeURIComponent(q) + "&format=json&no_html=1&skip_disambig=1";
    }
    const r = await fetch(url, { method:"GET" });
    if(!r.ok) return { ok:false, error:t("aiagent.searchFail","搜索请求失败：HTTP ")+r.status };
    const data = await r.json();
    // DuckDuckGo 响应解析：AbstractText + RelatedTopics
    const results = [];
    if(data.AbstractText){
      results.push({ title:data.Heading || q, snippet:data.AbstractText, url:data.AbstractURL || "" });
    }
    if(Array.isArray(data.RelatedTopics)){
      for(const t of data.RelatedTopics){
        if(results.length >= limit) break;
        if(t && t.Text && t.FirstURL){
          results.push({ title:t.Text.split(" - ")[0] || t.Text, snippet:t.Text, url:t.FirstURL });
        }
      }
    }
    return { ok:true, results:results.slice(0, limit), count:results.length };
  }catch(e){
    return { ok:false, error:String(e&&e.message||e) };
  }
}

/**
 * web_fetch：抓取网页内容（fetch + 去标签纯文本）
 * @param {string} url - 要抓取的 URL
 * @param {{selector?:string}} [opts]
 * @returns {Promise<{ok:boolean, text:string, title?:string, error?:string}>}
 */
async function toolWebFetch(url, opts){
  const o = opts || {};
  const u = String(url||"").trim();
  if(!u) return { ok:false, error:t("aiagent.emptyUrl","URL 为空") };
  if(!/^https?:\/\//i.test(u)) return { ok:false, error:t("aiagent.invalidUrl","URL 必须以 http:// 或 https:// 开头") };
  try{
    if(typeof fetch === "undefined"){
      return { ok:false, error:t("aiagent.noFetch","当前环境不支持 fetch") };
    }
    const r = await fetch(u, { method:"GET" });
    if(!r.ok) return { ok:false, error:t("aiagent.fetchFail","抓取失败：HTTP ")+r.status };
    const html = await r.text();
    // 去标签：提取 <title> + body 纯文本（DOMParser 不可用时用正则兜底）
    let title = "";
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if(titleMatch) title = titleMatch[1].trim();
    let text = html;
    // 去 script/style
    text = text.replace(/<script[\s\S]*?<\/script>/gi, "")
               .replace(/<style[\s\S]*?<\/style>/gi, "")
               .replace(/<[^>]+>/g, " ")
               .replace(/&nbsp;/g, " ")
               .replace(/&amp;/g, "&")
               .replace(/&lt;/g, "<")
               .replace(/&gt;/g, ">")
               .replace(/&quot;/g, '"')
               .replace(/&#39;/g, "'")
               .replace(/\s+/g, " ")
               .trim();
    // 限制长度（避免超长内容爆 token）
    if(text.length > 8000) text = text.slice(0, 8000) + "...[truncated]";
    return { ok:true, text, title, length:text.length };
  }catch(e){
    return { ok:false, error:String(e&&e.message||e) };
  }
}

/**
 * code_run：在 Web Worker 沙箱中运行 JS 代码（复用 runJsSnippet）
 * @param {string} code - JS 代码
 * @param {{timeout?:number}} [opts]
 * @returns {Promise<{ok:boolean, output:string, ms:number}>}
 */
async function toolCodeRun(code, opts){
  const o = opts || {};
  return await runJsSnippet(code, { timeout:o.timeout });
}

/**
 * sql_query：在内存 SQLite（sql.js WASM）中运行 SQL（复用 runSql）
 * @param {string} sql - SQL 语句
 * @param {string} [schema] - 建表 DDL
 * @returns {Promise<{ok:boolean, cols?:string[], rows?:Array, error?:string}>}
 */
async function toolSqlQuery(sql, schema){
  return await runSql(sql, schema);
}

/* ---------- 3. RAG（检索增强生成）：SQLite FTS5 全文索引 ---------- */
/**
 * RAG 索引模块：用 SQLite FTS5（sql.js WASM）做全文索引
 *   - 索引内容：任务标题/描述/记录内容/AI 对话历史/笔记
 *   - 增量索引：新增/修改内容时自动更新（ragIndexAdd/ragIndexUpdate/ragIndexRemove）
 *   - 检索：ragSearch(query, limit) 返回 topK 相关上下文
 *   - 注入：ragInjectContext(userText) 拼接相关上下文到 system prompt
 *
 * 存储策略：
 *   - FTS5 索引表保存在内存 SQLite（每次 ragInit 重建）
 *   - 文档元数据（docId/source/content）持久化到 localStorage（增量更新）
 *   - 避免引入 IndexedDB 二级存储，保持单文件架构
 */
const RAG_STORAGE_KEY = "rag_docs";
let _ragDb = null;        // sql.js Database 实例（内存）
let _ragReady = false;    // 是否已初始化
let _ragDocs = null;      // 文档列表缓存（从 localStorage 加载）

/**
 * 获取 RAG 文档列表（从 localStorage）
 * @returns {Array<{docId:string, source:string, content:string, ts:number}>}
 */
function getRagDocs(){
  if(_ragDocs) return _ragDocs;
  try{
    const raw = localStorage.getItem(PREFIX + RAG_STORAGE_KEY);
    _ragDocs = raw ? JSON.parse(raw) : [];
    if(!Array.isArray(_ragDocs)) _ragDocs = [];
  }catch(e){ _ragDocs = []; }
  return _ragDocs;
}

/**
 * 持久化 RAG 文档列表
 * @param {Array} docs
 */
function saveRagDocs(docs){
  _ragDocs = docs || [];
  save(PREFIX + RAG_STORAGE_KEY, _ragDocs); // v3.4.7 批次三（G5）：收编进 save() 主入口（配额耗尽有告警，不再静默）
}

/**
 * 初始化 RAG 索引：加载 sql.js + 建 FTS5 表 + 索引所有文档
 * @returns {Promise<boolean>} 是否成功
 */
async function ragInit(){
  if(_ragReady) return true;
  try{
    const SQL = await loadSqlJs();
    _ragDb = new SQL.Database();
    // 建 FTS5 虚拟表（content 列做全文索引，source/docId 作为 unindexed 元数据）
    _ragDb.exec("CREATE VIRTUAL TABLE IF NOT EXISTS rag_fts USING fts5(content, source UNINDEXED, docId UNINDEXED);");
    // 索引所有已存储文档
    const docs = getRagDocs();
    for(const d of docs){
      try{
        _ragDb.run("INSERT INTO rag_fts(content, source, docId) VALUES(?, ?, ?);", [d.content, d.source, d.docId]);
      }catch(_){ /* 单条索引失败跳过 */ }
    }
    _ragReady = true;
    return true;
  }catch(e){
    pushDiag("error", "ragInit error: "+(e&&e.message||e), {where:"ragInit"});
    _ragReady = false;
    return false;
  }
}

/**
 * 向 RAG 索引添加文档（增量索引）
 * @param {string} docId - 文档唯一 id
 * @param {string} content - 文档内容
 * @param {string} source - 来源（task/record/chat/note）
 * @returns {Promise<boolean>}
 */
async function ragIndexAdd(docId, content, source){
  const id = String(docId||"");
  const text = String(content||"").trim();
  if(!id || !text) return false;
  // 先删除同 id 旧文档（幂等更新）
  await ragIndexRemove(id);
  const docs = getRagDocs();
  docs.push({ docId:id, source:String(source||""), content:text, ts:Date.now() });
  saveRagDocs(docs);
  if(_ragReady && _ragDb){
    try{ _ragDb.run("INSERT INTO rag_fts(content, source, docId) VALUES(?, ?, ?);", [text, String(source||""), id]); }catch(_){}
  }
  return true;
}

/**
 * 从 RAG 索引删除文档
 * @param {string} docId
 * @returns {Promise<boolean>}
 */
async function ragIndexRemove(docId){
  const id = String(docId||"");
  if(!id) return false;
  const docs = getRagDocs();
  const filtered = docs.filter(d => d.docId !== id);
  if(filtered.length === docs.length) return false;
  saveRagDocs(filtered);
  if(_ragReady && _ragDb){
    try{ _ragDb.run("DELETE FROM rag_fts WHERE docId = ?;", [id]); }catch(_){}
  }
  return true;
}

/**
 * RAG 检索：用 FTS5 match 查询相关文档
 * @param {string} query - 查询文本
 * @param {number} [limit=5] - 返回条数
 * @returns {Promise<Array<{docId:string, source:string, content:string, rank:number}>>}
 */
async function ragSearch(query, limit){
  const q = String(query||"").trim();
  const topK = (typeof limit === "number" && limit > 0) ? limit : 5;
  if(!q) return [];
  if(!_ragReady){
    const ok = await ragInit();
    if(!ok) return ragSearchFallback(q, topK); // v3.4.7 批次六：sql.js/FTS5 不可用时降级关键词匹配（此前直接空——RAG 在无 WASM 环境完全失效）
  }
  try{
    // FTS5 match 查询：转义特殊字符，用 BM25 排序
    const safeQ = q.replace(/["']/g, " ").replace(/[^\w\u4e00-\u9fff\s]/g, " ").trim();
    if(!safeQ) return [];
    const stmt = _ragDb.prepare("SELECT docId, source, content, rank FROM rag_fts WHERE rag_fts MATCH ? ORDER BY rank LIMIT ?;");
    stmt.bind([safeQ, topK]);
    const results = [];
    while(stmt.step()){
      const row = stmt.getAsObject();
      results.push({ docId:row.docId, source:row.source, content:row.content, rank:row.rank });
    }
    stmt.free();
    return results;
  }catch(e){
    // FTS5 查询失败（如语法错误）→ 降级到关键词匹配
    return ragSearchFallback(q, topK);
  }
}

/**
 * RAG 检索降级：关键词匹配（FTS5 不可用时）
 * @param {string} query
 * @param {number} limit
 * @returns {Array}
 */
function ragSearchFallback(query, limit){
  const q = String(query||"").toLowerCase();
  const kws = q.split(/[\s,，。、;；]+/).filter(w => w.length >= 2);
  if(!kws.length) return [];
  const docs = getRagDocs();
  return docs.map(d => {
    const text = (d.content || "").toLowerCase();
    let score = 0;
    for(const w of kws){ if(text.indexOf(w) >= 0) score += 1; }
    return { docId:d.docId, source:d.source, content:d.content, rank:-score };
  })
  .filter(d => d.rank < 0)
  .sort((a, b) => a.rank - b.rank)
  .slice(0, limit);
}

/**
 * RAG 注入上下文：检索相关文档并拼接成 system prompt 片段
 * @param {string} userText - 用户输入
 * @returns {Promise<string>} 注入的上下文文本（空串表示无相关内容）
 */
async function ragInjectContext(userText){
  const cfg = getCfg() || {};
  if(cfg.rag !== true) return ""; // v3.4.7 批次六：显式开启才注入（设置页 AI→记忆「上下文注入」开关，默认关——防 token 意外膨胀；此前 ===false 判定在无 UI 写入下等效永远开）
  const hits = await ragSearch(userText, 5);
  if(!hits.length) return "";
  const lines = [t("rag.ctxHeader","【相关上下文】（来自任务/记录、笔记、对话历史的检索增强）：")];
  hits.forEach((h, i) => {
    const preview = (h.content || "").slice(0, 200);
    lines.push((i+1)+". ["+h.source+"] "+preview+((h.content||"").length > 200 ? "..." : ""));
  });
  return "\n\n" + lines.join("\n");
}

/**
 * RAG 增量索引：从任务/记录/笔记/对话历史构建索引
 * @returns {Promise<number>} 索引文档数
 */
async function ragReindex(){
  // ragInit 失败（如 sql.js 不可用）时仍继续索引到 localStorage（FTS5 表跳过，ragIndexAdd 内部守卫）
  await ragInit();
  let count = 0;
  // 索引任务
  try{
    const tasks = getTasks();
    for(const t of tasks){
      if(t.deletedAt) continue;
      const content = [t.title, t.note || "", (t.tags || []).join(" ")].join(" ").trim();
      if(content){
        await ragIndexAdd("task:"+t.id, content, "task");
        count++;
      }
    }
  }catch(_){}
  // 索引记录
  try{
    ORDER.forEach(sc => {
      getRec(sc).forEach(r => {
        const content = Object.values(r).filter(v => typeof v === "string").join(" ").trim();
        if(content){
          ragIndexAdd("rec:"+sc+":"+r.id, content, "record:"+sc);
          count++;
        }
      });
    });
  }catch(_){}
  // 索引笔记
  try{
    const notes = getNotes();
    for(const n of notes){
      const content = [n.title, n.content, (n.tags || []).join(" ")].join(" ").trim();
      if(content){
        await ragIndexAdd("note:"+n.id, content, "note");
        count++;
      }
    }
  }catch(_){}
  // 索引对话历史
  try{
    ORDER.forEach(sc => {
      const hist = getChat(sc);
      hist.forEach((m, i) => {
        if(m.role === "user" || m.role === "assistant"){
          const content = String(m.content || "").trim();
          if(content){
            ragIndexAdd("chat:"+sc+":"+i, content, "chat:"+sc);
            count++;
          }
        }
      });
    });
  }catch(_){}
  return count;
}

/* ---------- 4. 流式输出增强：多模型切换 / 重试改参数 / 进度指示 ---------- */
/**
 * 多模型切换：切换当前激活的 AI Profile（即时生效）
 * @param {string} profileId - Profile id
 * @returns {boolean} 是否切换成功
 */
function switchModel(profileId){
  const cfg = getCfg();
  if(!cfg || !Array.isArray(cfg.profiles)) return false;
  const p = cfg.profiles.find(x => x.id === profileId);
  if(!p) return false;
  cfg.activeId = profileId;
  persistCfg(cfg);
  try{ toast(t("aistream.modelSwitched","已切换模型：")+(p.name||p.model||profileId), "info"); }catch(_){}
  return true;
}

/**
 * 获取可用模型列表（供 UI 渲染下拉选择）
 * @returns {Array<{id:string, name:string, model:string}>}
 */
function listModels(){
  const cfg = getCfg();
  if(!cfg || !Array.isArray(cfg.profiles)) return [];
  return cfg.profiles.map(p => ({ id:p.id, name:p.name || p.model || p.id, model:p.model || "" }));
}

/**
 * 重试时修改参数：基于上次请求重新发送，可覆盖 model/temperature/retry
 * @param {{model?:string, temperature?:number, retry?:number}} [params]
 * @returns {Promise<boolean>}
 */
async function retryChatWithParams(params){
  if(!lastChatRequest) return false;
  const p = params || {};
  const req = lastChatRequest;
  const hist = req.hist;
  // 移除上次失败的 assistant 消息
  if(hist.length && hist[hist.length-1].role === "assistant" && hist[hist.length-1]._failed){
    hist.pop();
  }
  const rb = $("#chatRetry"); if(rb) rb.style.display = "none";
  // 临时覆盖参数：通过 _retryOverrides 传给 runChatLoop → chatOnce
  _retryOverrides = {};
  if(typeof p.model === "string") _retryOverrides.model = p.model;
  if(typeof p.temperature === "number") _retryOverrides.temperature = Math.min(2, Math.max(0, p.temperature));
  if(typeof p.retry === "number") _retryOverrides.retry = Math.max(0, Math.round(p.retry));
  await runChatLoop(req.messages, hist);
  _retryOverrides = null;
  return true;
}
let _retryOverrides = null;

/**
 * 流式输出进度跟踪：记录已接收字数 / 预估总字数 / 起始时间
 *   - onChunk 回调中调用 streamProgressUpdate 累加 received
 *   - UI 通过 getStreamProgress() 读取进度渲染进度条
 */
let _streamProgress = null;
/**
 * 初始化流式进度跟踪
 * @param {number} estimated - 预估总字数
 */
function streamProgressStart(estimated){
  _streamProgress = {
    received: 0,
    estimated: (typeof estimated === "number" && estimated > 0) ? estimated : 0,
    startTime: Date.now(),
    elapsed: 0
  };
}
/**
 * 更新流式进度（onChunk 回调中调用）
 * @param {string} chunk - 新收到的文本块
 */
function streamProgressUpdate(chunk){
  if(!_streamProgress) return;
  _streamProgress.received += String(chunk || "").length;
  _streamProgress.elapsed = Date.now() - _streamProgress.startTime;
}
/**
 * 获取流式进度
 * @returns {{received:number, estimated:number, elapsed:number, percent:number}|null}
 */
function getStreamProgress(){
  if(!_streamProgress) return null;
  const p = _streamProgress;
  const percent = p.estimated > 0 ? Math.min(100, Math.round(p.received / p.estimated * 100)) : 0;
  return { received:p.received, estimated:p.estimated, elapsed:p.elapsed, percent };
}
/**
 * 清除流式进度
 */
function streamProgressClear(){
  _streamProgress = null;
}
