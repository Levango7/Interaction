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
  for(let i=0; i<plan.steps.length; i++){
    if(o.signal && o.signal.aborted){
      return { ok:false, results, summary:t("aiagent.cancelled","已取消"), ms:Date.now()-t0 };
    }
    const step = plan.steps[i];
    let resultStr = "";
    let stepOk = false;
    try{
      if(ASYNC_TOOL_NAMES.has(step.tool)){
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
 * @returns {Promise<boolean>} 是否成功
 */
async function ragInit(){
  if(_ragReady) return true;
  try{
    /* 缺失的向量做一次**有界**回填（上限 20 条），避免文档多时启动长时间占住主线程；
       剩下的在检索时按需再补。
       注意这里**不能**把 _ragVecCache 置空来"重新载入"：ragVecPut 是"先写内存缓存、
       再尽力写 IDB"，IDB 不可用（无 IDB 的环境 / 配额满）时缓存就是唯一副本，
       置空等于把已经算出来的向量丢了。 */
    ragEnsureVectors(20).catch(e => pushDiag("warn", "rag backfill failed: " + ((e && e.message) || e), { where: "ragInit" }));
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
  await ragInit();
  let count = 0;
  /* 全量重建一律 skipEmbed：逐条 embed = N 次网络往返（几百条就是几百次），
     改成"先把正文全入库，末尾一次批量回填"（ragEnsureVectors 每 32 条一个请求）。 */
  const OPT = { skipEmbed: true };
  // 索引任务
  try{
    const tasks = getTasks();
    for(const t of tasks){
      if(t.deletedAt) continue;
      const content = [t.title, t.note || "", (t.tags || []).join(" ")].join(" ").trim();
      if(content){
        await ragIndexAdd("task:"+t.id, content, "task", OPT);
        count++;
      }
    }
  }catch(_){}
  // 索引记录
  try{
    for(const sc of ORDER){
      for(const r of getRec(sc)){
        const content = Object.values(r).filter(v => typeof v === "string").join(" ").trim();
        if(content){
          await ragIndexAdd("rec:"+sc+":"+r.id, content, "record:"+sc, OPT);
          count++;
        }
      }
    }
  }catch(_){}
  // 索引笔记
  try{
    const notes = getNotes();
    for(const n of notes){
      const content = [n.title, n.content, (n.tags || []).join(" ")].join(" ").trim();
      if(content){
        await ragIndexAdd("note:"+n.id, content, "note", OPT);
        count++;
      }
    }
  }catch(_){}
  // 索引对话历史
  try{
    for(const sc of ORDER){
      const hist = getChat(sc);
      for(let i = 0; i < hist.length; i++){
        const m = hist[i];
        if(m.role === "user" || m.role === "assistant"){
          const content = String(m.content || "").trim();
          if(content){
            await ragIndexAdd("chat:"+sc+":"+i, content, "chat:"+sc, OPT);
            count++;
          }
        }
      }
    }
  }catch(_){}
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
