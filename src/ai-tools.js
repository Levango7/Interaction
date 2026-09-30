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
      /* v3.7.52：写序修复。原实现先调 completeTask()（其内部会重新读数组并回写），之后仍在旧对象
         ft.task 上改优先级/截止，再 setTasks(ft.tasks) —— 实测「完成 + 改其他字段」时后者被静默丢弃，
         而工具回执却报全部成功（与手改不等价，违反 README 的等价承诺）。现改为先落盘非完成态字段、
         最后再打完成标记。 */
      if(args.status && ["todo","doing","done"].includes(args.status) && args.status!=="done"){
        ft.task.status=args.status; ft.task.doneAt=null; ch.status=args.status;
      }
      if(args.priority!==undefined && ["","P0","P1","P2"].includes(args.priority)){ ft.task.priority=args.priority; ch.priority=args.priority; }
      if(args.due!==undefined){ ft.task.due=args.due; ch.due=args.due; }
      if(Array.isArray(args.tags)){ ft.task.tags=args.tags.map(String).filter(Boolean); ch.tags=ft.task.tags; }
      if(Object.keys(ch).length) setTasks(ft.tasks);
      if(args.status==="done"){ completeTask(ft.task.id); ch.status="done"; }
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
/**
 * 「需要用户确认才允许落地」的工具 —— 唯一清单（v3.7.59 收口）。
 * 背景：runChatLoop 里写了一份 DANGER=["delete_task","update_task"]，而 executeAgentPlan 用
 * execTool(...,force=true) 绕过确认 —— 同一个工具在对话路径要弹窗、在 Agent 计划路径直接删。
 * 现在两条路径共用这份清单，Agent 计划路径见 executeAgentPlan。
 * ⚠️ 不要在这里加 forget：那属于「不该被固化成可反复触发的技能」那一类（SKILL_DANGER_TOOLS），
 *    把 forget 变成要确认会改变现有对话 UX，超出修 bug 的范围。
 */
const DANGER_CONFIRM_TOOLS = new Set(["delete_task","update_task"]);
/**
 * 工具白名单（cfg.toolWhitelist）→ Set；未配置/留空返回 null（=允许全部）。
 * v3.7.59 收口为单一来源：runChatLoop 与 executeAgentPlan 都按它过滤。
 * 此前只有 runChatLoop 读它 —— 于是「技能/白名单」在对话路径挡住了工具，
 * 换一条自主规划路径就绕开，同一个开关两种含义。
 * @param {Object} [cfgOverride]
 * @returns {Set<string>|null}
 */
function toolWhitelistSet(cfgOverride){
  const c = cfgOverride || getCfg() || {};
  const wl = String(c.toolWhitelist || "").trim();
  return wl ? new Set(wl.split(/[,\s\u3000]+/).filter(Boolean)) : null;
}
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
/* Agent 自主计划的步骤上限：模型一旦跑偏会连出几十步工具调用，每一步都是真实写操作，
   而这条路径没有对话那样的循环护栏。超出部分在 parseAgentPlan 就被裁掉，
   并在计划评审文案里明说"还有 N 步未纳入"，不静默丢弃。 */
const AGENT_PLAN_STEPS_MAX = 12;

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
  const mem = getMemories(); mem.push(rec); saveMemories(mem);
  memVecInvalidate([rec.id]);   // 新条目还没向量，下一轮 memEnsureVectors 补
  return rec;
}
function forgetMemory(id){
  const mem = getMemories();
  const i = mem.findIndex(m=>m.id===id || (m.text||"").includes(String(id||"")));
  if(i<0) return null;
  const r = mem.splice(i,1)[0]; saveMemories(mem);
  memVecInvalidate([r && r.id]);
  try{ if(r && r.id) idbDeleteKey(MEM_VEC_PREFIX + r.id); }catch(_){ /* 清不掉只是留个孤儿，下轮清扫 */ }
  return r;
}
/* v3.7.59 修正：此处原有一份**词法版** recallMemories（场景匹配 + 关键词命中 + 近期加权 +
   命中次数）。向量召回改造时只新增了下方的融合版、未删除这一份，于是 recallMemories 被定义了两次：
   函数声明提升下**后者生效**（功能正确、测试全绿），这一份成为死代码，同时触发 ESLint
   `no-redeclare` → CI 的 npm run lint 直接失败。
   词法打分已由 _memLexScored（下方）完整承接，recallMemoriesLex 是其薄封装，故此处直接删除。 */
function touchMemories(list){
  const ids=new Set(list.map(m=>m.id)); const mem=getMemories();
  mem.forEach(m=>{ if(ids.has(m.id)) m.hits=(m.hits||0)+1; });
  saveMemories(mem);
}

/* ============================================================
 * 工作记忆的向量召回（v3.7.59 · 任务 #19）—— 复用 #17/#18 建好的 embedding 通道
 * ------------------------------------------------------------
 * 原来的 recallMemories 是纯词法：按空白/标点切词 + substring。中文没有空格，
 * 「我喜欢简洁的回复」整句是一个 token，于是用户说「以后短点说」永远召不回那条偏好 ——
 * 工作记忆这块**写了但基本不生效**（v1.x 起就一直如此）。
 * RAG 那套（CJK 分词 / provider embeddings / 模型戳 / RRF / 显式降级）v3.7.57 已经建好，
 * 这里把它接到记忆上，而不是再造一套。
 *
 * 向量存放：IndexedDB kv，键前缀 **memvec:**（刻意不带 wb_agent_ —— 带该前缀会被
 * idbShouldMirror 当成用户数据镜像，启动时 JSON.stringify 回写 localStorage，
 * 1536 维 Float32 每条约 30KB，几十条就爆配额）。与 ragvec: 同一个理由。
 *
 * 同步链路上怎么拿到"查询向量"：agentContextPrompt → recallMemories 是**同步**调用
 * （chatSysPrompt 是同步的，改成 async 会让任何漏掉的调用点静默拼出 "[object Promise]"），
 * 而求查询向量必须走网络。做法是 onChatSubmit 在拼系统提示前 await memPrimeQueryVector(text)
 * 把结果放进 _memQueryVec；recallMemories 只在 key 与本次 query 完全相同时才用它。
 * 拿不到（没配 embedding / 请求失败 / 从 recall 工具直接进来）就退回纯词法，不报错、不卡。
 * ============================================================ */
const MEM_VEC_PREFIX = "memvec:";
const MEM_VEC_BATCH = 32;       // 一次 /embeddings 送几条（与 ragEnsureVectors 同口径）
const MEM_VEC_MAX = 60;         // 单轮回填上限；记忆本身就被 getMemMax 钳在 500 条内
let _memVecCache = null;        // {model:string, map:Map<memId, Float32Array>} | null（null=尚未加载）
let _memEnsuring = null;        // 进行中的回填 Promise（防并发重复 embedding）
let _memQueryVec = null;        // {key:string, vec:Float32Array|null} 本轮已算好的查询向量

/** 送去 embedding 的记忆文本：带上作用域标记，让"全局偏好"和"场景内事实"在向量空间里也分得开 */
function _memVecText(m){
  return (m.scope === "global" ? "[global] " : "[" + (m.scope || "") + "] ") + String(m.text || "");
}

/** 载入记忆向量（按当前 embedModel 校验；IDB 不可用 → 空 Map，静默退回纯词法） */
async function memVecLoadAll(){
  const wantModel = _ragVecModel();
  if(_memVecCache && _memVecCache.model === wantModel) return _memVecCache.map;
  const m = new Map();
  try{
    const keys = await idbKeys();
    for(const k of (keys || [])){
      if(typeof k !== "string" || k.indexOf(MEM_VEC_PREFIX) !== 0) continue;
      const rec = await idbReadKey(k);
      if(!rec || !rec.v || !rec.m) continue;                    // 旧格式/缺模型戳 → 当没有，重算
      if(String(rec.m) !== String(wantModel)) continue;         // 换过向量模型 → 重算
      m.set(k.slice(MEM_VEC_PREFIX.length), rec.v instanceof Float32Array ? rec.v : Float32Array.from(rec.v));
    }
  }catch(e){ pushDiag("warn", "memVecLoadAll error: "+((e&&e.message)||e), {where:"memVecLoadAll"}); }
  _memVecCache = { model: wantModel, map: m };
  return m;
}

/** 写入/删除单条记忆的向量（同步清内存缓存，避免陈旧命中） */
async function memVecPut(memId, vec){
  const cache = await memVecLoadAll();
  const id = String(memId || "");
  if(!id || !vec || !vec.length){ cache.delete(id); return false; }
  cache.set(id, vec);
  try{ await idbMirrorKey(MEM_VEC_PREFIX + id, { m: _ragVecModel(), v: vec }); return true; }
  catch(e){ return false; }
}

/** 给还没有向量的记忆补上（单飞 + 批量 + 有界；通道不可用就到此为止，下轮再试） */
async function memEnsureVectors(max){
  if(_memEnsuring) return _memEnsuring;
  _memEnsuring = (async () => {
    const cap = (typeof max === "number" && max > 0) ? Math.min(max, MEM_VEC_MAX) : MEM_VEC_MAX;
    const mems = getMemories();
    const cache = await memVecLoadAll();
    const live = new Set(mems.map(m => String(m.id)));
    /* 顺手清扫：清空工作记忆是从 UI 直接 save(PREFIX+"memory",[])，不经过本模块的钩子，
       于是 IDB 里会留下孤儿向量。它们永远匹配不上（已按 live 过滤），但占地方，删掉。 */
    for(const id of [...cache.keys()]){
      if(live.has(id)) continue;
      cache.delete(id);
      try{ await idbDeleteKey(MEM_VEC_PREFIX + id); }catch(_){ /* 删不掉也不影响召回 */ }
    }
    const missing = mems.filter(m => m && m.id && !cache.has(String(m.id)) && String(m.text||"").trim());
    if(!missing.length) return { done: 0, left: 0 };
    let done = 0;
    const todo = missing.slice(0, cap);
    for(let i = 0; i < todo.length; i += MEM_VEC_BATCH){
      const chunk = todo.slice(i, i + MEM_VEC_BATCH);
      const vecs = await aiEmbedTexts(chunk.map(_memVecText));
      if(!vecs || vecs.length !== chunk.length) break;   // 通道不可用：不逐批重试
      for(let j = 0; j < chunk.length; j++){ if(await memVecPut(chunk[j].id, vecs[j])) done++; }
    }
    return { done: done, left: Math.max(0, missing.length - done) };
  })().finally(() => { _memEnsuring = null; });
  return _memEnsuring;
}

/** 用查询向量给记忆打分排序（只看当前场景可见的记忆；向量缺失的条目不参与） */
function memVectorTop(qVec, sc, topK){
  if(!qVec || !qVec.length) return [];
  const cache = (_memVecCache && _memVecCache.map) || null;
  if(!cache || !cache.size) return [];
  const scored = [];
  getMemories().forEach(function(m){
    if(!m || !m.id) return;
    if(!(m.scope === "global" || m.scope === sc)) return;
    const v = cache.get(String(m.id));
    if(!v) return;
    const sim = ragCosine(qVec, v);
    if(sim > 0) scored.push({ m: m, sim: sim });
  });
  scored.sort((a, b) => b.sim - a.sim);
  return scored.slice(0, topK);
}

/** 词法打分明细：score 用于排序，kw>0 表示这条是**真的按字面匹配上的**（区分于纯新近度填充） */
function _memLexScored(query, sc){
  const q = String(query||"").toLowerCase();
  const kws = q.split(/[\s,，。、;；]+/).filter(w=>w.length>=2);
  const now = Date.now();
  return getMemories()
    .filter(m=> m.scope==="global" || m.scope===sc)
    .map(m=>{
      let score = (m.scope==="global"?1:2) + (m.hits||0)*0.1;
      score += Math.max(0, 3 - ((now-(m.ts||now))/86400000)*0.05); // 约 2 个月内线性衰减
      const text=(m.text||"").toLowerCase();
      let kw = 0;
      for(const w of kws){ if(text.includes(w)) kw++; }
      score += kw*2;
      return { m, score, kw };
    })
    .sort((a,b)=>b.score-a.score);
}

/** 词法召回（原 recallMemories 的实现，保留为向量不可用时的降级路径） */
function recallMemoriesLex(query, sc, limit){
  return _memLexScored(query, sc).slice(0, limit||8).map(x=>x.m);
}

/**
 * 召回：词法 + 向量 RRF 融合（v3.7.59 起）。
 * 保持**同步**签名不变 —— 调用方（agentContextPrompt / recall 工具 / 测试）都在同步链上。
 * 本轮没备好查询向量时，返回值与改造前逐条一致。
 * @returns {Array<object>} 命中项上带 _via:"lex"|"vec"|"both" 与 _score，供展示层标注来源
 */
function recallMemories(query, sc, limit){
  const topK = limit || 8;
  const lexical = _memLexScored(query, sc).slice(0, topK * 3);
  const primed = _memQueryVec && _memQueryVec.key === String(query || "") ? _memQueryVec.vec : null;
  const vecHits = primed ? memVectorTop(primed, sc, topK * 3) : [];
  if(!vecHits.length) return lexical.slice(0, topK).map(x => x.m);
  /* ⚠️ 只有 kw>0 的才当"词法命中"送进 RRF。词法列表其实是**全量返回再按分数排**：
     没有任何关键词命中的条目，只是按"新近度 + 全局加权"排下来的填充项。
     把它们也算进 RRF，第一条填充项的 1/(60+1) 会和第一条语义命中**完全同分**，
     稳定排序下语义命中反而被压到后面（实测：25 条记忆时向量捞到的那条排在 f0 之后）。 */
  const kwHits = lexical.filter(x => x.kw > 0);
  const filler = lexical.filter(x => x.kw === 0);
  // 与 ragHybridSearch 同一个理由：BM25 式打分与余弦不同量纲，直接相加会被一侧主导 → 用 RRF。
  const K = 60, byId = new Map();
  kwHits.forEach(function(x, i){ byId.set(x.m.id, { m: x.m, score: 1/(K+i+1), _via: "lex" }); });
  vecHits.forEach(function(v, i){
    const cur = byId.get(v.m.id) || { m: v.m, score: 0, _via: "" };
    cur.score += 1/(K+i+1);
    cur._via = cur._via ? "both" : "vec";
    byId.set(v.m.id, cur);
  });
  const merged = [...byId.values()].sort((a,b)=>b.score-a.score).map(function(x){
    return Object.assign({}, x.m, { _via: x._via, _score: x.score });
  });
  return merged.concat(filler.map(x => x.m)).slice(0, topK);
}

/**
 * 本轮对话前的一次性预备：补记忆向量 + 求查询向量，供同步的 recallMemories 使用。
 * 任何一步不可用都静默返回 false（词法路径照常），绝不抛。
 * ⚠️ 开关复用 cfg.rag：那一项在设置页就叫「上下文注入」，语义是"发消息前检索相关内容拼进
 *    AI 上下文、会多消耗 token"，与记忆语义召回同性质同代价 —— 与其再造一个没人写的配置键，
 *    不如把这一个的覆盖面在文案里说清楚。cfg.rag 关着时本函数直接返回，行为与改造前完全一致。
 * @param {string} text - 本轮用户输入
 * @returns {Promise<boolean>} 是否备好了可用的查询向量
 */
async function memPrimeQueryVector(text){
  const q = String(text || "").trim();
  _memQueryVec = null;
  const cfg = getCfg() || {};
  if(cfg.agent === false || cfg.rag !== true) return false;   // Agent 关 → 记忆段本来就不注入
  if(!_embedCfg()) return false;                              // 没配 embedding 通道 → 纯词法
  if(!getMemories().length) return false;
  try{
    await memEnsureVectors();
    const vecs = await aiEmbedTexts([q]);
    const v = (vecs && vecs.length) ? vecs[0] : null;
    _memQueryVec = { key: q, vec: v && v.length ? v : null };
    return !!_memQueryVec.vec;
  }catch(e){
    pushDiag("warn", "memPrimeQueryVector error: "+((e&&e.message)||e), {where:"memPrimeQueryVector"});
    return false;
  }
}

/** 记忆集变化后失效内存缓存（新增/遗忘的条目下一轮重算） */
function memVecInvalidate(ids){
  if(!_memVecCache) return;
  (Array.isArray(ids) ? ids : [ids]).forEach(function(id){ if(id) _memVecCache.map.delete(String(id)); });
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
    // via 一并回给模型：它需要知道"这条是语义召回的（换了说法也命中）还是仅字面命中"
    return JSON.stringify({count:hits.length, items:hits.map(m=>({id:m.id,scope:m.scope,text:m.text,via:m._via||"lex"}))});
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

/** 召回方式标注（词法 / 语义 / 两者都有）—— 让"这条为什么被想起来"对用户是可见的 */
function memViaLabel(via){
  if(via === "both") return t("agent.memViaBoth","·语义+词法");
  if(via === "vec") return t("agent.memViaVec","·语义");
  return "";
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
      mems.map(m=>"- ["+(m.scope==="global"?t("agent.scope.global", "全局"):(SCENARIOS[m.scope]?SCENARIOS[m.scope].name:m.scope))+"] "+m.text+memViaLabel(m._via)).join("\n"));
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
 * Skills 引擎（v3.7.59）—— 让「扩展 → 技能配置」里存下的自定义 JSON 真正生效
 * ------------------------------------------------------------
 * 此前 #aiSkillsCustom 的 JSON 只被写、从未被读（保存后无任何消费者），
 * 六个勾选项也只是减法地写 cfg.toolWhitelist —— 即"技能"是个配置壳。
 * 现在接上三条真实通路：
 *   ① skillsPromptBlock()          每轮把相关技能注入系统提示（chatSysPrompt 调用）
 *   ② findSkill() + sendChatText() 命令面板「技能」组一键触发（ui-palette.js 调用）
 *   ③ noteSkillOffer()/commitPendingSkill() 一轮成功执行 ≥2 个工具后可固化为新技能
 *
 * 依赖方向：只用 data-rw 的 getAiConfig/saveAiConfig（AI→Data 下行依赖，合规）。
 * 刻意**不**读 ui-global-events.js 里的 AI_BUILTIN_SKILLS：那是最末层，ai-* 引用它会
 * 新增一条上行依赖，撞 check:modules 的冻结基线；且内置技能本来只是工具名（没有流程可注入），
 * 其开关已经通过 cfg.toolWhitelist 真实生效。
 * ============================================================ */
const SKILL_INJECT_MAX = 6;     // 每轮最多注入的技能条数（防 token 膨胀）
const SKILL_PROMPT_MAX = 400;   // 单条技能「做法」截断长度
const SKILL_NAME_MAX = 32;
const SKILL_DESC_MAX = 120;
const SKILL_TOTAL_MAX = 40;     // 持久化技能条数上限（超出丢最旧）
const SKILL_STEPS_MAX = 8;      // 自动固化时保留的步骤数
/* 破坏性工具不参与"固化"：技能是可反复触发的，把删除/改写沉淀进去等于给未来的自己埋雷。
   = 要确认的那几个 + forget（遗忘记忆不该被自动化反复触发），派生自单一来源避免漂移。 */
const SKILL_DANGER_TOOLS = new Set([...DANGER_CONFIRM_TOOLS, "forget"]);
const SKILL_KNOWN_TOOLS = (function(){
  const s = new Set(AGENT_TOOL_NAMES);
  TOOLS.forEach(function(x){ if(x && x.function && x.function.name) s.add(x.function.name); });
  return s;
})();

let pendingSkillOffer = null;   // 上一轮可固化的工具流程：{steps, tools, userText, ts, signature}
let skillsJsonError = "";       // custom JSON 解析失败的原因（供设置页/toast 提示，空=正常）

/**
 * 读出「扩展 → 技能配置」里保存的自定义技能原始数组。
 * 容错：JSON 数组 / {skills:[…]} / 单对象 / 已经是数组（历史写法）都接受；
 * 解析失败不抛异常，只把原因记进 skillsJsonError 并返回空（对话不受影响）。
 * @returns {Array<object>}
 */
function _skillRawList(){
  skillsJsonError = "";
  let saved = null;
  try{ saved = getAiConfig("skills"); }catch(e){ return []; }
  const raw = saved && saved.custom;
  if(!raw) return [];
  if(Array.isArray(raw)) return raw;
  const s = String(raw).trim();
  if(!s) return [];
  try{
    const v = JSON.parse(s);
    if(Array.isArray(v)) return v;
    if(v && Array.isArray(v.skills)) return v.skills;
    if(v && typeof v === "object") return [v];
  }catch(e){
    skillsJsonError = String((e && e.message) || e);
    try{ if(typeof pushDiag === "function") pushDiag("error", "skills custom JSON parse error: "+skillsJsonError, {where:"_skillRawList"}); }catch(_){ /* 诊断不可用时静默 */ }
  }
  return [];
}

/** 工具名列表 → 只保留真实存在且非破坏性的（拼错的名字不进提示，避免引导模型幻觉调用） */
function _skillValidTools(v){
  if(!v) return [];
  const arr = Array.isArray(v) ? v : String(v).split(/[,\s\u3000]+/);
  const out = [];
  arr.forEach(function(n){
    n = String(n || "").trim();
    if(n && SKILL_KNOWN_TOOLS.has(n) && !SKILL_DANGER_TOOLS.has(n) && out.indexOf(n) === -1) out.push(n);
  });
  return out.slice(0, SKILL_STEPS_MAX);
}

/** 触发词：数组或分隔串 → 去空去重，最多 5 个、每个 ≤16 字 */
function _skillTriggerList(v){
  if(!v) return [];
  const arr = Array.isArray(v) ? v : String(v).split(/[,，、;；\s\u3000]+/);
  const out = [];
  arr.forEach(function(k){
    k = String(k || "").trim();
    if(k && k.length <= 16 && out.indexOf(k) === -1) out.push(k);
  });
  return out.slice(0, 5);
}

/** steps 数组 → 编号文本（自动固化的技能也把步骤存在这里，便于用户在设置页直接改） */
function _skillStepsText(steps){
  if(!Array.isArray(steps)) return "";
  const lines = [];
  steps.forEach(function(s){
    if(!s) return;
    const tool = String((typeof s === "object" ? s.tool : "") || "").trim();
    const keys = (typeof s === "object" && Array.isArray(s.args)) ? s.args.filter(Boolean) : [];
    const txt = (typeof s === "object") ? String(s.text || s.desc || "").trim() : String(s).trim();
    if(tool) lines.push(tool + (keys.length ? "("+keys.join(", ")+")" : ""));
    else if(txt) lines.push(txt);
  });
  return lines.slice(0, SKILL_STEPS_MAX).map(function(x, i){ return (i+1)+". "+x; }).join("\n");
}

/**
 * 归一化一条技能定义。名字为空 → null（丢弃）。
 * 「做法」按 prompt > instruction > steps(数组) > desc 的优先级取，缺全则退化成只有名字。
 * @param {object} o - 原始定义
 * @returns {{name:string,desc:string,prompt:string,tools:string[],trigger:string[],steps:Array,enabled:boolean}|null}
 */
function normalizeSkill(o){
  if(!o || typeof o !== "object") return null;
  const name = String(o.name || "").trim().slice(0, SKILL_NAME_MAX);
  if(!name) return null;
  const desc = String(o.desc || o.description || "").trim().slice(0, SKILL_DESC_MAX);
  let prompt = String(o.prompt || o.instruction || "").trim();
  if(!prompt) prompt = _skillStepsText(o.steps);
  if(!prompt) prompt = desc;
  prompt = prompt.slice(0, SKILL_PROMPT_MAX);
  return {
    name: name,
    desc: desc,
    prompt: prompt,
    tools: _skillValidTools(o.tools),
    trigger: _skillTriggerList(o.trigger || o.keywords),
    steps: Array.isArray(o.steps) ? o.steps.slice(0, SKILL_STEPS_MAX) : [],
    enabled: o.enabled !== false
  };
}

/** 全部技能（含停用），归一化后按定义顺序返回 */
function listSkills(){
  const out = [];
  _skillRawList().forEach(function(o){ const s = normalizeSkill(o); if(s) out.push(s); });
  return out.slice(0, SKILL_TOTAL_MAX);
}

/** 已启用的技能（注入提示与命令面板都用这个） */
function listEnabledSkills(){ return listSkills().filter(function(s){ return s.enabled; }); }

/**
 * 按名字找技能：精确 → 忽略大小写/首尾空白 → 触发词命中。
 * @param {string} name
 * @returns {object|null}
 */
function findSkill(name){
  const q = String(name || "").trim();
  if(!q) return null;
  const all = listEnabledSkills();
  const exact = all.find(function(s){ return s.name === q; });
  if(exact) return exact;
  const lower = q.toLowerCase();
  const ci = all.find(function(s){ return s.name.toLowerCase() === lower; });
  if(ci) return ci;
  return all.find(function(s){ return s.trigger.some(function(k){ return k.toLowerCase() === lower; }); }) || null;
}

/**
 * 相关度打分：整名命中 > 触发词命中 > 分词交集；无输入时全 0（保持定义顺序）。
 * ⚠️ 交集必须用 ragTokenize 的 CJK 二元组，不能只按空白切词：中文没有空格，
 * 整句会被切成一个 token，于是「帮我写周报」和技能「周报流程」永远对不上（实测），
 * 结果就是技能永远排不进前 6 条、等于没接线。
 */
function _skillRelevance(sk, text){
  const s = String(text || "").trim().toLowerCase();
  if(!s) return 0;
  let score = 0;
  const name = sk.name.toLowerCase();
  if(name && s.indexOf(name) >= 0) score += 10;
  sk.trigger.forEach(function(k){
    const kk = String(k || "").toLowerCase();
    if(kk && s.indexOf(kk) >= 0) score += 6;
  });
  const q = new Set(ragTokenize(s));
  const seen = new Set();
  ragTokenize(sk.name + " " + sk.desc + " " + sk.prompt + " " + sk.tools.join(" ")).forEach(function(w){
    if(seen.has(w) || !q.has(w)) return;
    seen.add(w);
    score += w.length >= 2 ? 2 : 1;   // 二元组比单字更说明问题
  });
  return score;
}

/**
 * 生成注入系统提示的技能段。无启用技能时返回空串（对话提示与今天完全一致）。
 * 相关度高的优先，最多 SKILL_INJECT_MAX 条。
 * @param {string} userText - 本轮用户输入
 * @returns {string} 以 "\n\n" 开头的提示片段，或 ""
 */
function skillsPromptBlock(userText){
  const skills = listEnabledSkills();
  if(!skills.length) return "";
  const ranked = skills
    .map(function(s, i){ return { s: s, i: i, r: _skillRelevance(s, userText) }; })
    .sort(function(a, b){ return (b.r - a.r) || (a.i - b.i); })
    .slice(0, SKILL_INJECT_MAX)
    .map(function(x){ return x.s; });
  const head = t("skills.ctxHeader", "【用户自定义技能】（用户沉淀的标准作业流程。请求与之相符时按「做法」执行、工具优先从「建议工具」里选；不相符时忽略本节且不要向用户提及它）：");
  /* v3.7.59 (#20)：技能段也进预算（占 ctxBudgetTokens 的一部分）。
     技能条数本身有 SKILL_TOTAL_MAX=40 的上限，全量注入会把每轮固定成本抬到几千 token ——
     相关性排序解决"先给谁"，预算解决"给多少"，两者都要有。 */
  const budget = ctxBudgetTokens() * CTX_SKILL_SHARE;
  const out = [];
  let used = _estTokens(head);
  for(const s of ranked){
    let line = "- " + s.name + (s.desc && s.desc !== s.prompt ? "（" + s.desc + "）" : "");
    if(s.prompt && s.prompt !== s.desc) line += "\n  " + t("skills.ctxHow", "做法：") + s.prompt.replace(/\n/g, "\n  ");
    if(s.tools.length) line += "\n  " + t("skills.ctxTools", "建议工具：") + s.tools.join(", ");
    const cost = _estTokens(line);
    if(used + cost > budget && out.length >= 1) break;   // 至少留 1 条（命中的那条最有用）
    used += cost; out.push(line);
  }
  return "\n\n" + head + "\n" + out.join("\n");
}

/** 工具序列签名（去重保序），用于判断"这条流程是否已经存过技能" */
function _skillSig(names){
  const seen = [];
  (names || []).forEach(function(n){ if(n && seen.indexOf(n) === -1) seen.push(n); });
  return seen.join(">");
}

/**
 * 记录一轮对话的工具执行结果，供结束后判断是否值得固化。
 * 由 runChatLoop 在每次工具执行后调用。
 * @param {Array} trace - 累加器
 * @param {string} name - 工具名
 * @param {object} args - 调用参数（只取 key，不存值：值会过期且可能含用户数据）
 * @param {string} res - execToolAuto 的返回串
 * @returns {void}
 */
function skillTracePush(trace, name, args, res){
  if(!Array.isArray(trace)) return;
  let ok = false;
  const s = String(res === null || res === undefined ? "" : res);
  if(s.indexOf("__CHART__") === 0){ ok = true; }
  else {
    try{ const j = JSON.parse(s); ok = !!(j && j.ok !== false && !j.error); }
    catch(e){ ok = s.length > 0; }
  }
  trace.push({
    name: String(name || ""),
    args: (args && typeof args === "object") ? Object.keys(args).slice(0, 8) : [],
    ok: ok
  });
}

/**
 * 一轮结束后调用：成功执行 ≥2 个非破坏性工具 → 挂出"可固化为技能"的候选。
 * 已存过同一工具序列的技能时不再打扰。
 * @param {Array} trace - skillTracePush 累加出来的执行记录
 * @param {string} userText - 本轮用户输入（用作默认技能名/描述）
 * @returns {object|null} 候选（同时也是 pendingSkillOffer）
 */
function noteSkillOffer(trace, userText){
  pendingSkillOffer = null;
  const good = (trace || []).filter(function(x){ return x && x.ok && x.name && !SKILL_DANGER_TOOLS.has(x.name); });
  if(good.length < 2) return null;
  const sig = _skillSig(good.map(function(x){ return x.name; }));
  const dup = listSkills().some(function(s){ return _skillSig(s.tools) === sig; });
  if(dup) return null;
  pendingSkillOffer = {
    steps: good.slice(0, SKILL_STEPS_MAX).map(function(x){ return { tool: x.name, args: x.args }; }),
    tools: _skillValidTools(good.map(function(x){ return x.name; })),
    userText: String(userText || "").replace(/\s+/g, " ").trim().slice(0, SKILL_DESC_MAX),
    ts: Date.now(),
    signature: sig
  };
  return pendingSkillOffer;
}

/** 当前待固化的候选（命令面板据此决定是否显示「把上一轮固化为技能」） */
function getPendingSkillOffer(){ return pendingSkillOffer; }

/**
 * 把候选流程写成一条技能定义。
 * @param {object} offer - noteSkillOffer 的产物
 * @param {string} [name] - 用户指定的技能名，缺省取本轮输入的开头
 * @returns {object|null} 归一化后的技能（未落盘）
 */
function buildSkillFromTrace(offer, name){
  if(!offer || !Array.isArray(offer.steps) || offer.steps.length < 2) return null;
  const nm = String(name || "").trim().slice(0, SKILL_NAME_MAX)
    || (offer.userText ? offer.userText.slice(0, 16) : "")
    || (t("skills.autoName", "流程技能") + "-" + offer.steps.length);
  return normalizeSkill({
    name: nm,
    desc: t("skills.autoDesc", "由一轮成功的多工具执行固化") + "：" + offer.steps.map(function(s){ return s.tool; }).join(" → "),
    steps: offer.steps,
    tools: offer.tools,
    enabled: true
  });
}

/**
 * 落盘一条技能（同名覆盖），写回 aiSkillsCustom —— 设置页的文本框下次打开即显示，可直接编辑/删除。
 * @param {object} sk - 技能定义（会先过 normalizeSkill）
 * @returns {object|null} 落盘后的归一化技能
 */
function saveSkill(sk){
  const norm = normalizeSkill(sk);
  if(!norm) return null;
  const all = listSkills();
  const i = all.findIndex(function(s){ return s.name === norm.name; });
  if(i >= 0) all[i] = norm; else all.push(norm);
  const list = all.slice(-SKILL_TOTAL_MAX).map(function(s){
    return { name: s.name, desc: s.desc, steps: s.steps, tools: s.tools, trigger: s.trigger, enabled: s.enabled };
  });
  let saved = null;
  try{ saved = getAiConfig("skills") || {}; }catch(e){ saved = {}; }
  try{ saveAiConfig("skills", Object.assign({}, saved, { custom: JSON.stringify(list, null, 2) })); }
  catch(e){
    try{ if(typeof pushDiag === "function") pushDiag("error", "saveSkill failed: "+((e && e.message) || e), {where:"saveSkill"}); }catch(_){ /* 诊断不可用时静默 */ }
    return null;
  }
  return norm;
}

/**
 * 消费候选：把上一轮流程固化为技能。无候选返回 null（调用方据此提示）。
 * @param {string} [name] - 技能名
 * @returns {object|null}
 */
function commitPendingSkill(name){
  const offer = pendingSkillOffer;
  if(!offer) return null;
  const sk = buildSkillFromTrace(offer, name);
  if(!sk) return null;
  const r = saveSkill(sk);
  pendingSkillOffer = null;
  return r;
}

/**
 * 删除一条技能（命令面板/设置页可用）。
 * @param {string} name
 * @returns {boolean} 是否删掉
 */
function deleteSkill(name){
  const q = String(name || "").trim();
  if(!q) return false;
  const all = listSkills();
  const rest = all.filter(function(s){ return s.name !== q; });
  if(rest.length === all.length) return false;
  let saved = null;
  try{ saved = getAiConfig("skills") || {}; }catch(e){ saved = {}; }
  try{
    saveAiConfig("skills", Object.assign({}, saved, {
      custom: JSON.stringify(rest.map(function(s){
        return { name: s.name, desc: s.desc, steps: s.steps, tools: s.tools, trigger: s.trigger, enabled: s.enabled };
      }), null, 2)
    }));
  }catch(e){ return false; }
  return true;
}


/* ============================================================
 * AI 能力增强（任务 232）—— 在既有 chatOnce / execTool / agentExec 契约上扩展
 * ------------------------------------------------------------
 *   1. AI Agent 自动化：多步骤任务规划 + 自动执行 + 结果汇总
 *   2. 新工具调用：web_search / web_fetch / code_run / sql_query / note_add / note_search
 *   3. RAG（检索增强生成）：CJK 分词 BM25 + 向量混合召回，自动注入相关上下文
 *   4. 流式输出增强：多模型切换 / 重试改参数 / 流式进度指示
 *
 * 设计原则：
 *   - 不修改既有 chatOnce / execTool / runChatLoop 主体，仅新增函数并在 execTool 末尾分发
 *   - 异步工具(web_search/web_fetch/code_run/sql_query)经 agentExecAsync 分发，execTool 同步路径只处理 note_*
 *   - RAG 正文索引持久化到 localStorage，向量持久化到 IndexedDB（ragvec: 前缀，不进同步镜像）
 *   - 所有颜色用 var(--token) 令牌；i18n 键值新增 aiagent.* / rag.* / aistream.* 命名空间
 * ============================================================ */

/* ---------- 1. AI Agent 自动化：多步骤规划 + 自动执行 + 结果汇总 ---------- */
/**
 * 本系统「可直接执行」的工具名清单（用于规划提示词）。
 * 剔除两类：需要用户确认的破坏性工具（executeAgentPlan 不会自主执行它），
 * 以及白名单外的工具（cfg.toolWhitelist 在对话路径生效，规划路径也必须一致）。
 * @returns {string[]}
 */
function agentPlannableTools(){
  const wl = toolWhitelistSet();
  const all = (typeof effectiveTools === "function" ? effectiveTools() : TOOLS);
  return all
    .map(x => x && x.function && x.function.name)
    .filter(n => n && !DANGER_CONFIRM_TOOLS.has(n) && (!wl || wl.has(n)));
}
/**
 * Agent 模式系统提示：引导 AI 输出 JSON 格式的步骤计划
 * v3.7.59：可用工具改成从 effectiveTools() 现算。此前字典里硬写了 12 个名字，
 * 而真实工具已 26 个 —— 模型被引导去用 add_record/generate_report/render_chart 之外的路子，
 * 规划质量白白掉一层，且清单与代码没有任何同步机制。
 * @param {string} userText - 用户请求
 * @returns {string} 系统提示
 */
function agentPlanSysPrompt(userText){
  const names = agentPlannableTools();
  return String(t("aiagent.sysPrompt",
    "你是任务规划助手。收到用户请求后，请先拆解为可执行步骤，输出 JSON 格式的计划：\n"+
    "```json\n{\"goal\":\"目标标题\",\"steps\":[{\"tool\":\"工具名\",\"args\":{},\"desc\":\"步骤说明\"}]}\n```\n"+
    "可用工具：{tools}。\n只输出 JSON，不要额外解释。")).replace("{tools}", names.join("/"));
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
  /* v3.7.59：步骤数封顶。这条链现在真的有用户入口了（命令面板「让 AI 自主完成」），
     于是一次失控的规划 = 几十次连续写库/联网调用。超限就截断并在计划里如实标注，
     而不是静默丢弃 —— 用户确认前必须看得见少了什么。 */
  if(plan.steps.length > AGENT_PLAN_STEPS_MAX){
    plan.truncatedFrom = plan.steps.length;
    plan.steps = plan.steps.slice(0, AGENT_PLAN_STEPS_MAX);
  }
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
 * @returns {Promise<{ok:boolean, results:Array<{step:object, result:string, ok:boolean, blocked?:boolean}>, needsConfirm:Array, summary:string, ms:number}>}
 */
async function executeAgentPlan(plan, opts){
  const o = opts || {};
  const t0 = Date.now();
  const results = [];
  const needsConfirm = [];
  const wl = (o.whitelist !== undefined) ? o.whitelist : toolWhitelistSet();
  for(let i=0; i<plan.steps.length; i++){
    if(o.signal && o.signal.aborted){
      return { ok:false, results, needsConfirm, summary:t("aiagent.cancelled","已取消"), ms:Date.now()-t0 };
    }
    const step = plan.steps[i];
    /* v3.7.59 P0（安全）：自主执行**不碰**需要用户确认的工具。
       此前这一步无条件 execTool(step.tool, step.args, true)，而 force=true 正是
       runChatLoop 里 delete_task/update_task 用来跳过二次确认的那把钥匙 ——
       于是"AI 自主规划"能在用户不知情的情况下删任务/改任务，同一个工具在对话路径却要弹窗。
       取向：自主执行只做可逆的写操作，破坏性那步标 needsConfirm 交回交互路径（那里正常确认）。
       不中断整个计划 —— 后面的非破坏步骤照常跑，避免"一步被拒全盘停摆"。 */
    if(DANGER_CONFIRM_TOOLS.has(step.tool)){
      const msg = t("aiagent.needConfirm","该步骤需用户确认，自主执行已跳过：请到对话里直接要求执行（会弹出确认）");
      needsConfirm.push(step);
      results.push({ step, result: JSON.stringify({ ok:false, confirm:true, msg }), ok:false, blocked:true });
      if(typeof o.onProgress === "function"){
        try{ o.onProgress(i+1, plan.steps.length, step, msg); }catch(_){}
      }
      continue;
    }
    /* v3.7.59：白名单在自主执行路径同样生效（此前只有对话路径读它 → 换个入口就绕过开关）。 */
    if(wl && !wl.has(step.tool)){
      const msg = t("aiagent.notWhitelisted","该工具不在允许列表中，已跳过：")+step.tool;
      results.push({ step, result: JSON.stringify({ ok:false, msg }), ok:false, blocked:true });
      if(typeof o.onProgress === "function"){
        try{ o.onProgress(i+1, plan.steps.length, step, msg); }catch(_){}
      }
      continue;
    }
    let resultStr = "";
    let stepOk = false;
    try{
      if(ASYNC_TOOL_NAMES.has(step.tool)){
        const r = await agentExecAsync(step.tool, step.args);
        resultStr = JSON.stringify(r);
        stepOk = !!(r && r.ok);
      } else {
        resultStr = execTool(step.tool, step.args); // 不传 force：需确认的工具已在上面拦掉
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
  return { ok:true, results, needsConfirm, summary, ms:Date.now()-t0 };
}

/**
 * 汇总 Agent 计划执行结果
 * @param {{goal:string, steps:Array}} plan
 * @param {Array<{step:object, result:string, ok:boolean, blocked?:boolean}>} results
 * @returns {string} 汇总文本
 */
function summarizeAgentPlan(plan, results){
  const lines = [t("aiagent.summaryHeader","【任务汇总】目标：")+plan.goal];
  results.forEach((r, i) => {
    const mark = r.ok ? "✓" : (r.blocked ? "⏸" : "✗");
    const state = r.ok ? t("aiagent.done","完成") : (r.blocked ? t("aiagent.blocked","待确认已跳过") : t("aiagent.failed","失败"));
    lines.push((i+1)+". "+mark+" "+r.step.desc+" → "+state);
  });
  const okCount = results.filter(r=>r.ok).length;
  lines.push(t("aiagent.summaryFooter","共 ")+results.length+t("aiagent.summaryStepUnit"," 步，")+okCount+t("aiagent.summaryOkUnit"," 步成功"));
  const blocked = results.filter(r=>r.blocked);
  if(blocked.length){
    lines.push(t("aiagent.summaryBlocked","其中 ")+blocked.length+t("aiagent.summaryBlockedSuffix"," 步涉及删除/修改等破坏性操作，未自主执行，请在对话里逐项确认。"));
  }
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
/** 需异步执行的工具名（单一来源：chat 路径与 Agent 计划路径共用，避免两处清单漂移） */
const ASYNC_TOOL_NAMES = new Set(["web_search", "web_fetch", "code_run", "sql_query"]);
/**
 * 同步/异步工具的统一执行入口。
 * v3.7.52：chat 路径原先只调 execTool —— 系统提示与 README 都告诉模型「可以联网检索 / 跑代码 / 跑 SQL」，
 * 但真调这些工具时只拿到「未知工具」，而同一批工具在 Agent 计划路径却可用（两条路径行为不一致）。
 * 现统一：异步工具走 agentExecAsync 并归一成与 execTool 同口径的 JSON 字符串。
 * @param {string} name
 * @param {Object} args
 * @returns {Promise<string>}
 */
async function execToolAuto(name, args){
  if(ASYNC_TOOL_NAMES.has(name)){
    try{ return JSON.stringify(await agentExecAsync(name, args)); }
    catch(e){ return JSON.stringify({ ok:false, msg:t("agent.toolRunFail","工具执行失败：")+((e&&e.message)||String(e)) }); }
  }
  return execTool(name, args);
}
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
 * 解析网页抓取代理基址（web_fetch 的 CORS 兜底）
 * 优先级：cfg.fetchProxy（独立代理）→ cfg.apiBase + /api/tools/fetch（复用自建后端）。
 * 两者都未配置时返回 "" —— 调用方回退为直连，行为与旧版一致。
 * @returns {string} 代理基址（不含 query），无代理时为空串
 */
function _webFetchProxyBase(){
  let cfg = {};
  try{ cfg = getCfg() || {}; }catch(_e){ cfg = {}; }
  const p = String(cfg.fetchProxy || "").trim();
  if(p) return p.replace(/\/+$/, "");
  const base = String(cfg.apiBase || "").trim();
  if(base) return base.replace(/\/+$/, "") + "/api/tools/fetch";
  return "";
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
    /* CORS：浏览器直连绝大多数站点会被跨域策略拦截（file:// 与本地服务形态下必然失败）。
       有代理则优先走代理（cfg.fetchProxy → cfg.apiBase + /api/tools/fetch），
       两者都未配置时保持直连，行为与旧版一致；失败时给可操作提示而非裸 TypeError。 */
    const proxy = _webFetchProxyBase();
    let r = null;
    if(proxy){
      try{ r = await fetch(proxy + "?url=" + encodeURIComponent(u), { method:"GET" }); }
      catch(_e){ r = null; } // 代理不可用 → 回退直连
    }
    if(!r){
      try{ r = await fetch(u, { method:"GET" }); }
      catch(e2){
        return { ok:false, error: proxy
          ? t("aiagent.fetchBothFail","代理与直连均失败：") + String(e2&&e2.message||e2)
          : t("aiagent.fetchCorsHint","直连被浏览器跨域策略（CORS）拦截。请在设置中配置「抓取代理」，或配置自建后端 apiBase 后重试。") };
      }
    }
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

/* ---------- 3. RAG（检索增强生成）：词法 BM25 + 向量混合召回 ---------- */
/**
 * RAG 索引模块
 *   - 索引内容：任务标题/描述/记录内容/AI 对话历史/笔记
 *   - 增量索引：新增/修改内容时自动更新（ragIndexAdd/ragIndexRemove）
 *   - 检索：ragSearch(query, limit) 返回 topK 相关上下文
 *   - 注入：ragInjectContext(userText) 拼接相关上下文到 system prompt
 *
 * 存储策略：
 *   - 文档正文（docId/source/content）持久化到 localStorage；向量持久化到 IndexedDB
 *   - 词法倒排索引在内存惰性构建（ragIndex 变更即失效重建），不落任何二级存储
 *
 * 为什么词法索引不再走 SQLite FTS5（v3.7.57）：
 *   ① 仓库自带的 assets/sql/sql-wasm.wasm（SQLite 3.45.2）编译时没开 FTS5 ——
 *      实测 `CREATE VIRTUAL TABLE … USING fts5(…)` 直接 "no such module: fts5"，
 *      于是 ragInit() 恒失败、_ragReady 恒 false、词法召回恒为空，整条 FTS5 链路
 *      从来没跑通过一次（此前对外却写着"FTS5/BM25 全文检索"）。
 *   ② 即便换成 FTS5 也救不了中文：unicode61 分词器把连续汉字当成**一个** token，
 *      实测「修复登录页 500 报错」这条记录，MATCH '登录' / '报错' 召不回、
 *      MATCH '修复登录页' 才召得回。要能切词得上 trigram/分词扩展。
 *   ③ 换成自带倒排索引后，RAG 不再依赖 sql.js（assets/sql 640KB WASM，未打包时还要
 *      回源 CDN），离线、Electron、以及 CDN 抖动的环境下检索都能正常工作。
 */
const RAG_STORAGE_KEY = "rag_docs";
let _ragReady = false;    // 是否已初始化（向量缓存 + 回填已发起）
let _ragDocs = null;      // 文档列表缓存（从 localStorage 加载）
let _ragLex = null;       // 词法倒排索引缓存（null = 待重建，见 ragLexBuild）

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
  _ragLex = null;   // v3.7.57：任何写路径都使词法倒排索引作废，下次检索惰性重建
  save(PREFIX + RAG_STORAGE_KEY, _ragDocs); // v3.4.7 批次三（G5）：收编进 save() 主入口（配额耗尽有告警，不再静默）
}

/**
 * 初始化 RAG：载入向量缓存 + 发起一次有界回填。
 * v3.7.57 起不再加载 sql.js / 不再建 FTS5 表（词法召回改由 ragLexBuild 提供），
 * 因此本函数与网络、WASM 都无关，毫秒级返回。
 * @param {{skipBackfill?:boolean}} [opts] - v3.7.67：ragSyncIncremental 传 true 跳过
 *   发射后不管的回填 —— 否则回填与同步循环并发，循环刚写入的文档会被回填当成"缺失"
 *   再嵌一遍（同一条文本两次网络往返；实测 4 文档同步打出 5 个请求）。同步路径的
 *   向量由循环自己确定性负责（直嵌或大批量回填二选一）。
 * @returns {Promise<boolean>} 是否成功
 */
async function ragInit(opts){
  if(_ragReady) return true;
  try{
    /* 缺失的向量做一次**有界**回填（上限 20 条），避免文档多时启动长时间占住主线程；
       剩下的在检索时按需再补。
       注意这里**不能**把 _ragVecCache 置空来"重新载入"：ragVecPut 是"先写内存缓存、
       再尽力写 IDB"，IDB 不可用（无 IDB 的环境 / 配额满）时缓存就是唯一副本，
       置空等于把已经算出来的向量丢了。 */
    if(!(opts && opts.skipBackfill)){
      ragEnsureVectors(20).catch(e => pushDiag("warn", "rag backfill failed: " + ((e && e.message) || e), { where: "ragInit" }));
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
 * @param {{skipEmbed?:boolean}} [opts] - skipEmbed：只入库不建向量，交给随后的 ragEnsureVectors 批量回填
 * @returns {Promise<boolean>}
 */
async function ragIndexAdd(docId, content, source, opts){
  const id = String(docId||"");
  const text = String(content||"").trim();
  if(!id || !text) return false;
  // 先删除同 id 旧文档（幂等更新）
  await ragIndexRemove(id);
  const docs = getRagDocs();
  docs.push({ docId:id, source:String(source||""), content:text, ts:Date.now() });
  saveRagDocs(docs);   // 内部会作废词法索引缓存（_ragLex）
  /* v3.7.57：入库即建向量，让刚存的资料马上能被语义召回。
     失败（未配 AI / 通道异常）不影响入库 —— 检索侧会自动退化为纯词法。
     全量重建走 skipEmbed：逐条发请求 = N 次往返，改为末尾一次批量回填。 */
  if(!(opts && opts.skipEmbed)) await ragEmbedDoc(id, text);
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
  saveRagDocs(filtered);   // 内部会作废词法索引缓存（_ragLex）
  await ragVecDelete(id);   // v3.7.57：向量必须同步删，否则已删文档仍会被语义召回
  return true;
}

/* ============================================================
 * v3.7.57 语义检索：embedding 通道 + 词法/向量混合召回（RRF）
 * ------------------------------------------------------------
 * 动机：知识基座原本只有"字面重合才算命中"的检索 —— 问「上次登录报 500 的事」
 * 匹配不到写着「修复登录页 500 报错」的条目（汉字没切开），
 * 换个说法、换种语言就直接召不回。agent 的 plan/记忆骨架都在，缺的就是喂进去的上下文质量。
 *
 * 向量存哪儿：IndexedDB 的 kv store，键前缀 **ragvec:**（刻意不带 wb_agent_）。
 *   带该前缀的键会被 idbShouldMirror/idbRestoreAll 认作用户数据镜像，
 *   启动时可能把值 JSON.stringify 回写进 localStorage —— 1536 维 Float32
 *   序列化后每条约 30KB，几十条就爆配额。用 ragvec: 前缀可确保它只待在 IDB。
 *
 * 降级策略（必须显式，不能静默）：结果里的 via 字段标明这条怎么召回的：
 *   lex  = 只有词法命中（未配 AI / embedding 请求失败 / IDB 不可用时就是这种）
 *   vec  = 只有向量命中（换了说法、换了语言仍能召回，正是本轮要新增的能力）
 *   both = 两路都命中（RRF 融合后排在前）
 * ============================================================ */
const RAG_VEC_PREFIX = "ragvec:";
let _ragVecCache = null;   // {model:string, map:Map<docId, Float32Array>} | null（null = 尚未加载）
let _ragEnsuring = null;   // 进行中的回填 Promise（防同一批缺失向量被并发重复 embedding）

/** embedding 通道配置；不可用时返回 null（调用方负责降级） */
function _embedCfg(){
  try{
    const ap = (typeof getActiveProfile === "function") ? getActiveProfile() : null;
    const base = String((ap && ap.base) || "").replace(/\/+$/, "");
    if(!base) return null;
    if(typeof validateBaseUrl === "function" && !validateBaseUrl(base)) return null;
    const cfg = (typeof getCfg === "function") ? (getCfg() || {}) : {};
    /* 优先取**当前 profile** 的 embedModel（换了 AI 配置就该连向量模型一起换），
       其次全局 cfg.embedModel，最后默认值。 */
    const model = String((ap && ap.embedModel) || cfg.embedModel || "").trim() || "bge-m3";
    return { base: base, key: (ap && ap.key) || "", model: model };
  }catch(e){ return null; }
}

/**
 * 批量取文本向量。走 OpenAI 兼容的 POST {base}/embeddings，
 * 同时容忍 Ollama 的两种返回形状（不同版本字段不一样）。
 * @param {string[]} texts
 * @returns {Promise<Float32Array[]|null>} null = 通道不可用（调用方降级，不要抛）
 */
async function aiEmbedTexts(texts){
  const list = (texts || []).map(x => String(x || "").slice(0, 8000)).filter(Boolean);
  if(!list.length) return [];
  const ec = _embedCfg();
  if(!ec) return null;
  try{
    const r = await fetch(ec.base + "/embeddings", {
      method: "POST",
      headers: Object.assign({ "Content-Type": "application/json" }, ec.key ? { "Authorization": "Bearer " + ec.key } : {}),
      body: JSON.stringify({ model: ec.model, input: list.length === 1 ? list[0] : list })
    });
    if(!r.ok) { pushDiag("warn", "embeddings HTTP " + r.status, { where: "aiEmbedTexts" }); return null; }
    const j = await r.json();
    // 三种已知形状：OpenAI data[].embedding / Ollama /api/embed embeddings[][] / 单条 embedding[]
    let raw = null;
    if(j && Array.isArray(j.data)) raw = j.data.map(d => d && d.embedding).filter(Boolean);
    else if(j && Array.isArray(j.embeddings)) raw = j.embeddings;
    else if(j && Array.isArray(j.embedding)) raw = [j.embedding];
    if(!raw || !raw.length) return null;
    const out = raw.map(v => Float32Array.from(v));
    // 单输入但服务返回多条（或反之）时不猜，直接判失败走降级
    if(out.length !== list.length) return null;
    return out;
  }catch(e){
    pushDiag("warn", "embeddings error: " + ((e && e.message) || e), { where: "aiEmbedTexts" });
    return null;
  }
}

/** 余弦相似度；维度不一致或零向量返回 0 */
function ragCosine(a, b){
  if(!a || !b || a.length !== b.length || !a.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for(let i = 0; i < a.length; i++){ const x = a[i], y = b[i]; dot += x * y; na += x * x; nb += y * y; }
  if(na <= 0 || nb <= 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * 向量在 IDB 里的落盘格式是 `{ m: 产生它的 embedModel, v: Float32Array }`，而不是裸向量。
 * 为什么要带 m：换了向量模型之后，旧向量的维度与语义空间都变了，`ragCosine` 只会因
 * 维度不符一律返回 0 —— 症状是"明明配了 embedModel，语义召回却一直不命中"，且全程无报错。
 * 载入时按 m 过滤，不匹配就当没有，交给 ragEnsureVectors 重算。
 */
function _ragVecModel(){
  const ec = _embedCfg();
  return ec ? ec.model : "";
}

/** 载入全部向量到内存缓存（按当前 embedModel 校验；IDB 不可用时返回空 Map 并降级到纯词法） */
async function ragVecLoadAll(){
  const wantModel = _ragVecModel();
  /* 缓存自带模型号：设置页改了 embedModel 之后无需任何显式通知，下一次用到就自动重载
     （不做成"保存时调一个失效函数"是因为那要新增一个跨块窄符号，模块图上会多一条真边）。 */
  if(_ragVecCache && _ragVecCache.model === wantModel) return _ragVecCache.map;
  const m = new Map();
  let skipped = 0;
  try{
    const keys = await idbKeys();
    for(const k of (keys || [])){
      if(typeof k !== "string" || k.indexOf(RAG_VEC_PREFIX) !== 0) continue;
      const rec = await idbReadKey(k);
      if(!rec || !rec.v || !rec.m){ if(rec) skipped++; continue; }   // 旧格式（裸向量/无模型标记）→ 重算
      if(String(rec.m) !== String(wantModel)){ skipped++; continue; }  // 换过模型 → 重算
      m.set(k.slice(RAG_VEC_PREFIX.length), rec.v instanceof Float32Array ? rec.v : Float32Array.from(rec.v));
    }
    if(skipped) pushDiag("info", "rag vectors stale=" + skipped + " (embedModel=" + wantModel + ")，待重算", { where: "ragVecLoadAll" });
  }catch(e){ pushDiag("warn", "ragVecLoadAll error: " + ((e && e.message) || e), { where: "ragVecLoadAll" }); }
  _ragVecCache = { model: wantModel, map: m };
  return m;
}

/** 写入/删除单篇文档的向量（删除时同时清内存缓存，避免陈旧命中） */
async function ragVecPut(docId, vec){
  const cache = await ragVecLoadAll();
  if(!docId || !vec || !vec.length){ cache.delete(String(docId)); return false; }
  cache.set(String(docId), vec);
  try{ await idbMirrorKey(RAG_VEC_PREFIX + docId, { m: _ragVecModel(), v: vec }); return true; }
  catch(e){ pushDiag("warn", "ragVecPut failed: " + ((e && e.message) || e), { where: "ragVecPut" }); return false; }
}
async function ragVecDelete(docId){
  const cache = await ragVecLoadAll();
  cache.delete(String(docId));
  try{ await idbDeleteKey(RAG_VEC_PREFIX + docId); }catch(e){ /* 删不掉下次重载仍会清 */ }
}

/** 给单篇文档建向量；embedding 通道不可用时静默返回 false（检索自会降级） */
async function ragEmbedDoc(docId, content){
  const vecs = await aiEmbedTexts([String(content || "")]);
  if(!vecs || !vecs.length) return false;
  return ragVecPut(docId, vecs[0]);
}

/**
 * 回填缺失的向量：**批量**送 /embeddings（一次 32 条），单次上限 max 条，
 * 避免启动时长时间占住主线程。max 传 Infinity 表示全量（ragReindex 用）。
 * @returns {Promise<{done:number, left:number}>}
 */
async function ragEnsureVectors(max){
  const cap = (typeof max === "number" && max > 0) ? max : 20;
  /* 同一时刻只跑一趟：ragInit 的后台回填与显式全量回填会挑同一批缺失文档，
     并发跑等于把同样的文本重复发给 provider 一遍。 */
  if(_ragEnsuring) return _ragEnsuring;
  _ragEnsuring = (async () => {
    const docs = getRagDocs();
    const cache = await ragVecLoadAll();
    const missing = docs.filter(d => d && d.docId && !cache.has(String(d.docId)));
    if(!missing.length) return { done: 0, left: 0 };
    const todo = missing.slice(0, cap);
    let done = 0;
    const BATCH = 32;
    for(let i = 0; i < todo.length; i += BATCH){
      const chunk = todo.slice(i, i + BATCH);
      const vecs = await aiEmbedTexts(chunk.map(d => d.content));
      if(!vecs || vecs.length !== chunk.length) break; // 通道不可用：别再逐批重试，本轮到此为止
      for(let j = 0; j < chunk.length; j++){
        if(await ragVecPut(chunk[j].docId, vecs[j])) done++;
      }
    }
    return { done: done, left: Math.max(0, missing.length - done) };
  })().finally(() => { _ragEnsuring = null; });
  return _ragEnsuring;
}

/**
 * 向量召回：对缓存里的全部文档算余弦并取 topK。
 * @returns {Promise<Array<{docId:string, sim:number}>>}
 */
async function ragVectorSearch(query, topK){
  const cache = await ragVecLoadAll();
  if(!cache.size) return [];
  const qv = await aiEmbedTexts([String(query || "")]);
  if(!qv || !qv.length) return [];
  const scored = [];
  for(const [docId, vec] of cache){
    const s = ragCosine(qv[0], vec);
    if(s > 0) scored.push({ docId: docId, sim: s });
  }
  scored.sort((a, b) => b.sim - a.sim);
  return scored.slice(0, topK);
}

/**
 * 混合召回：词法 BM25 与向量各出一份排序，用 RRF（Reciprocal Rank Fusion）融合。
 * 用 RRF 而非"分数相加"，因为 BM25 与余弦不同量纲，直接相加会被其中一侧主导。
 * @returns {Promise<Array<{docId,source,content,score,via}>>}
 */
async function ragHybridSearch(q, topK){
  const lexical = ragLexicalTop(q, topK * 3);
  const vectorial = await ragVectorSearch(q, topK * 3);
  if(!vectorial.length) {
    return lexical.slice(0, topK).map(r => Object.assign({}, r, { via: "lex" }));
  }
  const K = 60, byId = new Map();
  lexical.forEach((r, i) => {
    byId.set(r.docId, { docId: r.docId, source: r.source, content: r.content, bm25: r.score, score: 1 / (K + i + 1), via: "lex" });
  });
  vectorial.forEach((v, i) => {
    const d = byId.get(v.docId) || Object.assign({ score: 0, via: "", bm25: null }, _ragDocMeta(v.docId));
    d.score += 1 / (K + i + 1);
    d.via = d.via ? "both" : "vec";
    byId.set(v.docId, d);
  });
  return [...byId.values()].sort((a, b) => b.score - a.score).slice(0, topK);
}

/** 从持久化文档表里补元数据（向量命中但词法没命中时，标题/正文要靠它） */
function _ragDocMeta(docId){
  const d = getRagDocs().find(x => String(x.docId) === String(docId));
  return d ? { docId: d.docId, source: d.source, content: d.content } : { docId: docId, source: "", content: "" };
}

/**
 * RAG 检索：词法 BM25 + 向量召回，RRF 融合
 * @param {string} query - 查询文本
 * @param {number} [limit=5] - 返回条数
 * @returns {Promise<Array<{docId:string, source:string, content:string, score:number, via:string}>>}
 */
/* ---------- 词法召回：CJK 友好分词 + BM25（纯 JS，不依赖 SQLite / WASM / CDN） ---------- */

/** 汉字 + 日文假名 + 韩文音节；其余（含拉丁、数字）走按词切分 */
const CJK_CHAR = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]/;
const LATIN_WORD = /[a-z0-9][a-z0-9_.-]*/g;

/** 连续汉字 → 二元组 + 单字。单字也入表，否则「猫」这类一字查询永远召不回 */
function _cjkRunTokens(run, out){
  if(run.length === 1){ out.push(run); return; }
  for(let i = 0; i + 1 < run.length; i++) out.push(run.slice(i, i + 2));
  for(const ch of run) out.push(ch);
}

/**
 * 切词：拉丁按词、数字串整体保留，**连续汉字切成二元组**。
 * 为什么自己做：SQLite 的 unicode61 把「修复登录页」整段当成一个 token，
 * 查「登录」召不回（v3.7.57 实测）；二元组是无需词典、中英混排都成立的折中。
 * @param {string} text
 * @returns {string[]} 词频列表（未去重）
 */
function ragTokenize(text){
  const s = String(text || "").toLowerCase();
  const out = [];
  let m;
  LATIN_WORD.lastIndex = 0;
  while((m = LATIN_WORD.exec(s))) out.push(m[0]);
  let run = "";
  for(const ch of s){
    if(CJK_CHAR.test(ch)){ run += ch; continue; }
    if(run){ _cjkRunTokens(run, out); run = ""; }
  }
  if(run) _cjkRunTokens(run, out);
  return out;
}

const RAG_BM25_K1 = 1.2;
const RAG_BM25_B = 0.75;

/** 由当前文档表构建倒排索引（ragIndexAdd/Remove 后经 saveRagDocs 置空，下次检索惰性重建） */
function ragLexBuild(){
  const docs = getRagDocs();
  const metas = [];
  const postings = new Map();   // term -> Map<docIdx, tf>
  let total = 0;
  for(let i = 0; i < docs.length; i++){
    const d = docs[i] || {};
    const toks = ragTokenize(d.content);
    metas.push({ docId: String(d.docId || ""), source: String(d.source || ""), content: String(d.content || ""), len: toks.length });
    total += toks.length;
    const tf = new Map();
    for(const tk of toks) tf.set(tk, (tf.get(tk) || 0) + 1);
    for(const [tk, c] of tf){
      let p = postings.get(tk);
      if(!p){ p = new Map(); postings.set(tk, p); }
      p.set(i, c);
    }
  }
  _ragLex = { N: metas.length, metas, postings, avgdl: metas.length ? total / metas.length : 0 };
  return _ragLex;
}

/**
 * 词法召回（同步）：BM25 Okapi 打分取 topK。空表/无有效词返回 []
 * @param {string} q
 * @param {number} topK
 * @returns {Array<{docId:string, source:string, content:string, score:number}>}
 */
function ragLexicalTop(q, topK){
  const query = String(q || "").trim();
  if(!query) return [];
  if(!_ragLex) ragLexBuild();
  const ix = _ragLex;
  if(!ix || !ix.N) return [];
  const terms = [...new Set(ragTokenize(query))];
  if(!terms.length) return [];
  const avgdl = ix.avgdl || 1;
  const scores = new Float64Array(ix.N);
  for(const term of terms){
    const p = ix.postings.get(term);
    if(!p) continue;
    const idf = Math.log(1 + (ix.N - p.size + 0.5) / (p.size + 0.5));
    if(idf <= 0) continue;
    for(const [idx, tf] of p){
      const dl = ix.metas[idx].len || 1;
      scores[idx] += idf * (tf * (RAG_BM25_K1 + 1)) / (tf + RAG_BM25_K1 * (1 - RAG_BM25_B + RAG_BM25_B * dl / avgdl));
    }
  }
  const hits = [];
  for(let i = 0; i < ix.N; i++){
    if(scores[i] > 0) hits.push({ docId: ix.metas[i].docId, source: ix.metas[i].source, content: ix.metas[i].content, score: scores[i] });
  }
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, Math.max(1, topK | 0));
}

async function ragSearch(query, limit){
  const q = String(query||"").trim();
  const topK = (typeof limit === "number" && limit > 0) ? limit : 5;
  if(!q) return [];
  /* ragInit 只做"载入向量缓存 + 发起有界回填"，与网络/WASM 无关，毫秒级；
     它失败也不该拦检索 —— 词法一路本来就不依赖它。 */
  if(!_ragReady && typeof ragInit === "function") await ragInit().catch(() => false);
  return ragHybridSearch(q, topK);
}

/**
 * RAG 注入上下文：检索相关文档并拼接成 system prompt 片段
 * @param {string} userText - 用户输入
 * @returns {Promise<string>} 注入的上下文文本（空串表示无相关内容）
 */
/* ---------- 上下文装配预算（v3.7.59 · 任务 #20）----------
 * 此前每轮注入的系统提示由三段各自为政拼成：记忆/目标（agentContextPrompt）、技能
 * （skillsPromptBlock）、检索（ragInjectContext）。RAG 固定 top5 × 每条 200 字，
 * 既不按相关性收口，也没有总量约束 —— 索引一大，token 成本就是失控的，
 * 而且结果里没有出处，用户无法回溯"这条是依据哪条记录说的"。
 * 现在：一个可配置的总预算（cfg.ctxBudgetTokens），每段带来源与召回方式标注，
 * 超预算时**整条丢弃**而不是截半句（半句引用比没有引用更容易误导）。
 */
const CTX_BUDGET_DEFAULT = 1200;
const CTX_SKILL_SHARE = 0.4;   // 技能段最多占预算的四成，剩下的给检索
const CTX_RAG_HITS = 8;        // 多召几条，装配时按预算裁
const CTX_RAG_CHARS = 240;     // 单条正文上限

/** 每轮注入上下文的 token 预算（粗算口径同 _estTokens） */
function ctxBudgetTokens(){
  const cfg = getCfg() || {};
  let n = Number(cfg.ctxBudgetTokens);
  if(!isFinite(n) || n <= 0) n = CTX_BUDGET_DEFAULT;
  return Math.min(4000, Math.max(200, Math.round(n)));
}

/** 检索结果的引用标签：[序号·来源·召回方式] —— 用户能据此回查到原始条目 */
function ragCiteLabel(h, n){
  const via = h.via === "both" ? t("rag.viaBoth","词法+语义")
    : (h.via === "vec" ? t("rag.viaVec","语义") : t("rag.viaLex","词法"));
  return "["+n+"·"+(h.source || t("rag.srcUnknown","未知来源"))+"·"+via+"]";
}

/**
 * RAG 检索注入：按预算装配 + 带出处。
 * @param {string} userText
 * @param {{budget?:number}} [opts]
 * @returns {Promise<string>} 以 "\n\n" 开头的片段，或 ""
 */
async function ragInjectContext(userText, opts){
  const cfg = getCfg() || {};
  if(cfg.rag !== true) return ""; // v3.4.7 批次六：显式开启才注入（设置页 AI→记忆「上下文注入」开关，默认关——防 token 意外膨胀；此前 ===false 判定在无 UI 写入下等效永远开）
  const budget = (opts && typeof opts.budget === "number") ? opts.budget : ctxBudgetTokens();
  const hits = await ragSearch(userText, CTX_RAG_HITS);
  if(!hits.length) return "";
  const head = t("rag.ctxHeader","【相关上下文】（来自任务/记录、笔记、对话历史的检索增强）：");
  const cite = t("rag.ctxCite","引用时请标注来源编号（如「依据[2·笔记]」），没有依据的部分请说明是推断。");
  const lines = [head, cite];
  let used = _estTokens(head) + _estTokens(cite);
  let kept = 0;
  for(let i = 0; i < hits.length; i++){
    const h = hits[i];
    const full = String(h.content || "");
    const preview = full.slice(0, CTX_RAG_CHARS);
    const line = (kept+1)+". "+ragCiteLabel(h, kept+1)+" "+preview+(full.length > preview.length ? "…" : "");
    const cost = _estTokens(line);
    if(used + cost > budget && kept >= 1) break;   // 至少留 1 条：预算配得过小时也不该整段消失
    used += cost; kept++; lines.push(line);
  }
  if(hits.length > kept){
    const note = t("rag.ctxTrimmed","（受上下文预算限制，相关度较低的 ")+(hits.length-kept)+t("rag.ctxTrimmedSuffix"," 条未注入");
    lines.push(note + "）");
  }
  return "\n\n" + lines.join("\n");
}

/**
 * 收集当前应当入索引的全部文档（任务/记录/笔记/对话历史）
 * —— ragReindex（全量重建）与 ragSyncIncremental（增量同步）共用同一份构建器，
 * 保证两条路径的 docId 规则、内容拼法、过滤条件（如 deletedAt）永远一致。
 * @returns {Array<{docId:string, source:string, content:string}>}
 */
function _ragCurrentDocs(){
  const out = [];
  try{
    const tasks = getTasks();
    for(const t of tasks){
      if(t.deletedAt) continue;
      const content = [t.title, t.note || "", (t.tags || []).join(" ")].join(" ").trim();
      if(content) out.push({ docId: "task:"+t.id, source: "task", content });
    }
  }catch(_){}
  try{
    for(const sc of ORDER){
      for(const r of getRec(sc)){
        const content = Object.values(r).filter(v => typeof v === "string").join(" ").trim();
        if(content) out.push({ docId: "rec:"+sc+":"+r.id, source: "record:"+sc, content });
      }
    }
  }catch(_){}
  try{
    const notes = getNotes();
    for(const n of notes){
      const content = [n.title, n.content, (n.tags || []).join(" ")].join(" ").trim();
      if(content) out.push({ docId: "note:"+n.id, source: "note", content });
    }
  }catch(_){}
  try{
    for(const sc of ORDER){
      const hist = getChat(sc);
      for(let i = 0; i < hist.length; i++){
        const m = hist[i];
        if(m.role === "user" || m.role === "assistant"){
          const content = String(m.content || "").trim();
          if(content) out.push({ docId: "chat:"+sc+":"+i, source: "chat:"+sc, content });
        }
      }
    }
  }catch(_){}
  return out;
}

/** FNV-1a 32 位内容哈希（hex）。只用于"内容变没变"的比较，不承载安全语义。 */
function _ragDocHash(s){
  let h = 0x811c9dc5;
  for(let i = 0; i < s.length; i++){
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16);
}

/* v3.7.67 增量同步的节流/批量参数：
   - 防抖 4s：任务连续勾选、批量导入等风暴只触发一次同步；
   - 单轮直嵌上限 48：小改动即时建向量（入库即召回），大批量（导入/迁移）退回
     skipEmbed + 一次 ragEnsureVectors 批量回填，避免几十次单独网络往返。 */
const RAG_SYNC_DEBOUNCE_MS = 4000;
const RAG_SYNC_EMBED_CAP = 48;
let _ragSyncTimer = null;
let _ragSyncing = false;
let _ragSyncPending = false;

/**
 * RAG 增量同步（v3.7.67）：把当前数据与已索引文档做哈希 diff，
 * 只对新增/内容变化/已删除的 docId 落库——替代此前"只有手动重建索引才进 RAG"。
 * @returns {Promise<{added:number, updated:number, removed:number}>}
 */
async function ragSyncIncremental(){
  if(_ragSyncing){ _ragSyncPending = true; return { added:0, updated:0, removed:0 }; }
  _ragSyncing = true;
  try{
    /* skipBackfill：本函数对向量完全负责（≤CAP 直嵌 / >CAP 批量回填），
       不与 ragInit 的发射后不管回填并发 —— 否则刚写入的文档会被回填再嵌一遍 */
    await ragInit({ skipBackfill: true });
    const docs = getRagDocs();
    const indexed = new Map();
    for(const d of docs) indexed.set(d.docId, _ragDocHash(String(d.content || "")));
    const current = _ragCurrentDocs();
    const wanted = new Map();
    for(const c of current) wanted.set(c.docId, _ragDocHash(c.content));

    let removed = 0;
    for(const d of docs){
      if(!wanted.has(d.docId)){ await ragIndexRemove(d.docId); removed++; }
    }
    const changed = current.filter(c => indexed.get(c.docId) !== wanted.get(c.docId));
    let added = 0, updated = 0;
    if(changed.length){
      const bigBatch = changed.length > RAG_SYNC_EMBED_CAP;
      const OPT = bigBatch ? { skipEmbed: true } : undefined;
      for(const c of changed){
        const isNew = !indexed.has(c.docId);
        await ragIndexAdd(c.docId, c.content, c.source, OPT);
        if(isNew) added++; else updated++;
      }
      /* 大批量走批量回填而非逐条网络往返；本轮没补到的缺失向量由检索侧按需再补。 */
      if(bigBatch){ try{ await ragEnsureVectors(Math.min(64, changed.length)); }catch(_){} }
    }
    return { added, updated, removed };
  }finally{
    _ragSyncing = false;
    if(_ragSyncPending){
      _ragSyncPending = false;
      ragScheduleSync(500);
    }
  }
}

/**
 * 防抖触发增量同步：数据写路径（setTasks/setRec/saveNotes/appendChat）经
 * core 的 emitDataMutate 广播到这里。多次触发合并为最后一次。
 * @param {number} [delayMs] - 覆盖默认防抖（pending 重排与测试用）
 */
function ragScheduleSync(delayMs){
  try{
    if(_ragSyncTimer) clearTimeout(_ragSyncTimer);
    const wait = (typeof delayMs === "number" && delayMs >= 0) ? delayMs : RAG_SYNC_DEBOUNCE_MS;
    _ragSyncTimer = setTimeout(function(){
      _ragSyncTimer = null;
      ragSyncIncremental().catch(function(e){
        pushDiag("error", "rag sync failed: " + ((e && e.message) || e), { where: "ragSyncIncremental" });
      });
    }, wait);
  }catch(e){ /* 定时器不可用的极端环境下放弃本轮同步（手动重建索引仍在） */ }
}

/* v3.7.67：向 core 注册数据变更监听 —— Data 层写路径 emit，本层消费。
   typeof 守卫：个别 node 环境测试只加载 ai-tools 不加载 core 时不炸。 */
if(typeof registerDataMutateListener === "function"){
  registerDataMutateListener(function(){ ragScheduleSync(); });
}

/**
 * RAG 增量索引：从任务/记录/笔记/对话历史构建索引
 * @returns {Promise<number>} 索引文档数
 */
async function ragReindex(){
  await ragInit();
  let count = 0;
  /* 全量重建一律 skipEmbed：逐条 embed = N 次网络往返（几百条就是几百次），
     改成"先把正文全入库，末尾一次批量回填"（ragEnsureVectors 每 32 条一个请求）。 */
  const OPT = { skipEmbed: true };
  for(const c of _ragCurrentDocs()){
    await ragIndexAdd(c.docId, c.content, c.source, OPT);
    count++;
  }
  /* 一次批量补齐所有缺失向量（配了 embedding 通道才有；没配就直接返回）。
     上限传 Infinity：重建场景要覆盖全表，而不是像启动期那样只补 20 条。 */
  try{ await ragEnsureVectors(Infinity); }catch(_){}
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

/* ---------- v3.7.13（解耦 S1）：AI 工具实现归位 ----------
   原先散落在 Render 层（render-scene-main），但调用者是 AI 层（execTool 分发 code_run / sql_query）→ AI→Render 逆层依赖。
   按"谁是主要调用者就归谁的层"归位到本块。**纯搬迁，不改一行实现**。
   注：sql.js 加载器依赖 _sqlJsPromise / _sqlJsLoadedBase / _sqlJsBases（及其基址常量），
   本次按**依赖闭包**整组搬迁，避免"搬函数漏状态"导致运行期引用错误。 */

let _sqlJsPromise = null;

let _sqlJsLoadedBase = "";

const SQLJS_LOCAL_BASE = "assets/sql/";   // 仓库/部署自带副本（scripts/deploy 会随包发布）

/* sql.js 资源基址：默认 CDN，首次使用需联网（WASM 约 640KB，内联进单文件会增约 1MB，
   故不默认内联）。若需完全离线，把 cfg.sqlJsBase 指向自托管的同版本目录即可
   （该目录需含 sql-wasm.js 与 sql-wasm.wasm），无需改动本文件。 */
const SQLJS_DEFAULT_BASE = "https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/";

/* v3.7.58（安全）：CDN 兜底的 SRI 完整性哈希 —— sql-wasm.js（49,857 字节）已与官方
   npm sql.js@1.10.3 dist 文件逐字节比对一致，哈希按本地副本（assets/sql/）实测计算。
   只钉已知默认 CDN（用户自配 sqlJsBase 无法预知内容故不钉）；本地同源加载无需钉。
   若 CDN 内容被篡改/版本漂移，integrity 不匹配会触发 onerror → 自动落到下一候选基址，
   失败路径与「CDN 不可达」完全一致。注：SRI 只覆盖 sql-wasm.js 这条 <script> 注入链，
   wasm 本体走 fetch，由同版本绑定 + 自托管选项兜底。 */
const SQLJS_SRI = {};
SQLJS_SRI[SQLJS_DEFAULT_BASE] = "sha384-8D3Rsfo535FqoC1pHCCQMrNf75UgzyoG/HQm9zOzITRrz3QKzecc2E7JXKGCXoWu";

/**
 * 执行 SQL 语句（在 sql.js WASM 沙箱中）。
 * @param {string} sqlText - SQL 语句
 * @param {string} [schemaDdl] - 建表 DDL（可选，执行前先运行）
 * @returns {Promise<{ok:boolean, cols:string[], rows:array[], ms:number, error?:string}>}
 */
function runSql(sqlText, schemaDdl){
  const t0 = Date.now();
  return loadSqlJs().then(function(SQL){
    const db = new SQL.Database();
    try{
      if(schemaDdl){
        try{ db.exec(schemaDdl); }catch(_){ /* DDL 容错 */ }
      }
      const res = db.exec(sqlText);
      if(!res || !res.length){
        return { ok:true, cols:[], rows:[], ms: Date.now() - t0 };
      }
      const first = res[0];
      return { ok:true, cols: first.columns || [], rows: first.values || [], ms: Date.now() - t0 };
    }catch(e){
      return { ok:false, cols:[], rows:[], ms: Date.now() - t0, error: e && e.message ? e.message : String(e) };
    }finally{
      db.close();
    }
  }).catch(function(e){
    return { ok:false, cols:[], rows:[], ms: Date.now() - t0, error: e && e.message ? e.message : String(e) };
  });
}

/* ---------- v3.0.1 B-3：真·JS 运行器 ----------
 * runJsSnippet(code, opts)：在沙箱 Web Worker 中执行 JS 片段。
 *   - Worker 源码 = console 重写胶水（收集 log/error 经 postMessage 回传）+ 用户代码 + done 信号
 *   - 默认 5 秒超时 terminate；worker.onerror / 运行时异常统一捕获
 *   - opts.timeout：注入毫秒数（测试用）；opts.workerFactory：注入假 Worker（jsdom 测试环境无真实 Worker）
 * @returns {Promise<{ok:boolean, output:string, ms:number}>}
 */
function runJsSnippet(code, opts){
  const o = opts || {};
  const timeoutMs = (typeof o.timeout === "number" && o.timeout >= 0) ? o.timeout : 5000;
  return new Promise(function(resolve){
    const t0 = Date.now();
    // 默认工厂：Blob URL 创建 Worker；url 挂到 worker._blobUrl 供结束后 revoke 清理
    const makeWorker = o.workerFactory || function(src){
      if(typeof Worker === "undefined") throw new Error(t("msg.noWorkerSupport","当前环境不支持 Web Worker"));
      const url = URL.createObjectURL(new Blob([src], { type: "application/javascript" }));
      const w = new Worker(url);
      w._blobUrl = url;
      return w;
    };
    // 胶水代码：重写 console 收集输出；捕获运行时错误；同步代码结束后发 done 信号
    const glue =
      "self.console={log:function(){self.postMessage({type:'log',text:[].slice.call(arguments).map(function(x){try{return (x&&typeof x==='object')?JSON.stringify(x):String(x)}catch(_){return String(x)}}).join(' ')})}," +
      "warn:function(){self.console.log.apply(null,arguments)},error:function(){self.postMessage({type:'error',text:[].slice.call(arguments).map(String).join(' ')})},info:function(){self.console.log.apply(null,arguments)}};" +
      /* ⚠️ 必须自己补发 done：`return true` 会抑制浏览器默认的 error 处理，主线程的
         worker.onerror 因此**不会触发**；而用户代码在顶层抛异常时脚本直接中止，
         末尾那句 postMessage({type:'done'}) 也执行不到。两条退出路径同时断掉，
         主线程只收到 error 却没人调 finish() → 干等满 5 秒超时，
         还把真实异常换成误导性的「执行超时(5s)」（v3.7.54 实测）。 */
      "self.onerror=function(m){self.postMessage({type:'error',text:String(m)});self.postMessage({type:'done'});return true};";
    let worker;
    try{
      worker = makeWorker(glue + "\n" + String(code === null || code === undefined ? "" : code) + "\nself.postMessage({type:'done'});");
    }catch(err){
      resolve({ ok:false, output:t("sql.workerCreateFail","Worker 创建失败：") + err.message, ms: Date.now() - t0 });
      return;
    }
    const logs = [];
    let errText = "";
    let settled = false;
    function finish(ok, output){
      if(settled) return;
      settled = true;
      clearTimeout(timer);
      try{ worker.terminate(); }catch(_){ }
      if(worker._blobUrl){ try{ URL.revokeObjectURL(worker._blobUrl); }catch(_){ } }
      resolve({ ok: ok, output: output, ms: Date.now() - t0 });
    }
    const timer = setTimeout(function(){
      /* 兜底：已经收到过异常就不要报「执行超时」——那是误导性的诊断（真实原因被吞掉）。
         正常路径下上面的 self.onerror 已补发 done 走不到这里，留这层防其它退出路径。 */
      const tail = errText ? errText
        : t("sql.execTimeout","执行超时(") + Math.round(timeoutMs / 1000) + "s)";
      finish(false, (logs.length ? logs.join("\n") + "\n" : "") + tail);
    }, timeoutMs);
    worker.onmessage = function(e){
      const d = e && e.data;
      if(!d || !d.type) return;
      if(d.type === "log"){ logs.push(d.text); return; }
      if(d.type === "error"){ if(!errText) errText = d.text; return; }
      if(d.type === "done"){
        if(errText) finish(false, errText);
        else finish(true, logs.length ? logs.join("\n") : t("label.noOutput","(无输出)"));
      }
    };
    worker.onerror = function(e){
      // 语法错误等在脚本解析期触发主线程 error 事件（此时胶水未执行，收不到内部 postMessage）
      const msg = (e && (e.message || (e.error && e.error.message))) || t("sql.unknownExecError","未知执行错误");
      finish(false, msg);
    };
  });
}

function loadSqlJs(){
  if(_sqlJsPromise) return _sqlJsPromise;
  const bases = _sqlJsBases();
  const attempt = function(i){
    if(i >= bases.length){
      return Promise.reject(new Error(t("sql.cdnFail","sql.js 加载失败（需联网；或把 cfg.sqlJsBase 指向自托管副本以离线使用）")));
    }
    const base = bases[i];
    const init = function(){ _sqlJsLoadedBase = base; return window.initSqlJs({ locateFile: function(f){ return base + f; } }); };
    // 已加载过 initSqlJs：直接复用（locateFile 仍指向本次基址）
    if(typeof window !== "undefined" && window.initSqlJs){ return Promise.resolve(init()); }
    return new Promise(function(resolve, reject){
      const s = document.createElement("script");
      s.src = base + "sql-wasm.js";
      /* v3.7.58（安全）：已知 CDN 基址钉 SRI（见 SQLJS_SRI 注释），防 CDN 投毒注入 */
      if (SQLJS_SRI[base]) { s.integrity = SQLJS_SRI[base]; s.crossOrigin = "anonymous"; }
      s.onload = function(){
        if(!window.initSqlJs){ reject(new Error(t("sql.initFail","sql.js 加载失败：initSqlJs 未找到"))); return; }
        resolve(init());
      };
      s.onerror = function(){ reject(new Error("sql.js 资源不可达：" + s.src)); };
      document.head.appendChild(s);
    }).catch(function(){ return attempt(i + 1); });   // 本基址失败 → 尝试下一个
  };
  _sqlJsPromise = attempt(0).catch(function(e){ _sqlJsPromise = null; throw e; });
  return _sqlJsPromise;
}

/** 候选基址（按序尝试）：cfg.sqlJsBase → 项目自带 → CDN。显式配置时不再兜底 CDN，尊重用户选择。 */
function _sqlJsBases(){
  let cfg = {};
  try{ cfg = getCfg() || {}; }catch(_e){ cfg = {}; }
  const c = String(cfg.sqlJsBase || "").trim();
  if(c) return [c.replace(/\/+$/, "") + "/"];
  return [SQLJS_LOCAL_BASE, SQLJS_DEFAULT_BASE];
}

/* v3.7.13（解耦 S1）：AI 用量统计归位（原在 render-overview，调用者是 AI 层）。纯搬迁。 */

/* ---------- AI Token 用量统计（来自 v3.5.0 包）---------- */
function addTokensUsage(resp) {
  try {
    const u = resp && resp.usage;
    if (!u) return;
    const n = (u.total_tokens | 0) || ((u.prompt_tokens | 0) + (u.completion_tokens | 0));
    if (!(n > 0)) return;
    const d = JSON.parse(localStorage.getItem(PREFIX + "ai_tokens") || '{"total":0,"days":{}}');
    d.total = (d.total | 0) + n;
    const now = new Date();
    const k = now.getFullYear() + "-" + pad(now.getMonth() + 1) + "-" + pad(now.getDate());
    d.days = d.days || {};
    d.days[k] = (d.days[k] | 0) + n;
    const ks = Object.keys(d.days).sort();
    while (ks.length > 90) { delete d.days[ks.shift()]; }
    localStorage.setItem(PREFIX + "ai_tokens", JSON.stringify(d));
  } catch (e) { /* localStorage 不可用/解析失败：静默，不阻塞 AI 调用 */ }
}
