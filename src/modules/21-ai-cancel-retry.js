// ===== AI Layer (AI 层·取消/重试控制器) =====
let chatController=null;       // { ac, timer, aborted, reason }
let lastChatRequest=null;      // { messages, hist } 用于重试

/**
 * 创建聊天控制器（AbortController + 30s 超时定时器）
 * T5.3 浏览器兼容：AbortController / AbortSignal.timeout 不可用时降级为「无取消、无超时」，
 *                  仍返回结构体（ac=null）保证调用方解构不崩；取消按钮由 showChatThinking 守卫隐藏
 * @returns {{ac:AbortController|null, timer:number|null, aborted:boolean, reason:string|null}}
 */
function createChatController(){
  // AbortController 不存在 → 返回空骨架，chatOnce 不传 signal、abortChat 静默 false
  if(typeof AbortController === "undefined" || typeof AbortSignal === "undefined"){
    return { ac:null, timer:null, aborted:false, reason:null };
  }
  let ac=null;
  try{ ac=new AbortController(); }catch(e){ return { ac:null, timer:null, aborted:false, reason:null }; }
  let timer=null;
  try{ timer=setTimeout(function(){ try{ ac.abort(new Error("timeout")); }catch(e){} }, 30000); }catch(e){ timer=null; }
  return { ac:ac, timer:timer, aborted:false, reason:null };
}

/**
 * 取消当前聊天请求（用户点击「取消」按钮）
 * @returns {boolean} 是否成功取消（无进行中请求或 AbortController 不可用返回 false）
 */
function abortChat(){
  if(!chatController) return false;
  if(!chatController.ac) return false; // T5.3 AbortController 不可用：静默返回 false
  chatController.aborted=true;
  chatController.reason="user";
  try{ chatController.ac.abort(new Error("user-cancel")); }catch(e){}
  if(chatController.timer){ clearTimeout(chatController.timer); }
  return true;
}

/**
 * 重试上次失败的聊天请求：移除失败消息后重新走 runChatLoop
 * @returns {Promise<boolean>} 是否触发了重试
 */
async function retryChat(){
  if(!lastChatRequest) return false;
  const req=lastChatRequest;
  const hist=req.hist;
  // 移除上次失败的 assistant 消息（带 _failed 标记）
  if(hist.length && hist[hist.length-1].role==="assistant" && hist[hist.length-1]._failed){
    hist.pop();
  }
  // 隐藏重试按钮（若存在）
  const rb=$("#chatRetry"); if(rb) rb.style.display="none";
  await runChatLoop(req.messages, hist);
  return true;
}

/**
 * 显示/隐藏「思考中…」加载指示器与取消按钮
 * T5.3 浏览器兼容：AbortController 不可用时取消按钮始终隐藏（无取消能力，仅显示思考中）
 * @param {boolean} on - true 显示，false 隐藏
 */
function showChatThinking(on){
  const t=$("#chatThinking"); if(t) t.style.display = on ? "" : "none";
  const c=$("#chatCancel"); if(c){
    const canCancel = (typeof AbortController !== "undefined" && typeof AbortSignal !== "undefined");
    c.style.display = (on && canCancel) ? "" : "none";
  }
}
let pendingConfirm = null; // ② 待确认的危险操作（delete/update）：{toolCalls:[{name,id,args}], title, assistantMsg, sc}
function chatSysPrompt(userText){
  return (SCENARIOS[active]?.sysprompt || "你是一个全能 AI 助手，可调用工具管理任务与工作台数据。")
    +"\n你可以调用工具来创建、修改、删除任务，查询与搜索工作台数据，需要时直接调用。"
    +"用户的事实/偏好/决定用 remember 存入工作记忆；多步任务先用 plan 建立目标与步骤，再逐步执行并用 complete_step/complete_goal 收尾。"
    +agentContextPrompt(userText);
}
async function onChatSubmit(e){
 try{
  e.preventDefault();
  const f=e.target; const text=f.msg.value.trim(); if(!text) return;
  f.msg.value="";
  const hist=getChat(active);
  // ② 拦截待确认的危险操作（不与模型交互）
  if(pendingConfirm){
    if(pendingConfirm.sc!==active){ pendingConfirm=null; }
    else {
      const yes=/^(确认|确定|执行|yes|confirm|y|ok)$/i.test(text.trim());
      if(yes){
        hist.push({role:"user", content:text});
        // 补全上一轮被延后的 assistant(tool_calls) + 工具回执，B1 安全
        hist.push(pendingConfirm.assistantMsg);
        const messages=[{role:"system", content:chatSysPrompt(text)}].concat(hist.map(m=>({...m})));
        for(const c of pendingConfirm.toolCalls){
          const res=execTool(c.name, c.args, true); // 强制（已确认）
          let rj=null; try{ rj=JSON.parse(res); }catch(e){}
          const tm={role:"tool", tool_call_id:c.id, content:res, _disp:(rj&&rj.msg)||("工具 "+c.name)};
          messages.push(tm); hist.push(tm);
        }
        pendingConfirm=null;
        await runChatLoop(messages, hist);
      } else {
        if(hist.length && hist[hist.length-1].role==="assistant" && !hist[hist.length-1].tool_calls) hist.pop(); // 移除待确认提示
        hist.push({role:"user", content:text});
        hist.push({role:"assistant", content:"已取消操作：「"+(pendingConfirm.title||"危险操作")+"」。"});
        pendingConfirm=null;
        if(hist.length>50) hist.splice(0, hist.length-50);
        save(PREFIX+"chat_"+active, hist); renderChat(); scrollChat(); render();
      }
      return;
    }
  }
  // Agent：显式记忆指令「记住：xxx」直接落工作记忆（不走模型，确定可靠）
  const memHit = /^(记住|请记住|帮我记住)[:：\s]+(.+)$/s.exec(text);
  if(memHit && memHit[2]){
    const r=addMemory(active, memHit[2].trim());
    hist.push({role:"user", content:text});
    hist.push({role:"assistant", content: r? "好的，已记住：「"+r.text+"」（场景："+SCENARIOS[active].name+"，后续对话会自动带上）" : "没有可记住的内容"});
    if(hist.length>50) hist.splice(0, hist.length-50);
    save(PREFIX+"chat_"+active, hist); renderChat(); scrollChat();
    return;
  }
  // 正常路径
  hist.push({role:"user",content:text});
  renderChat(); scrollChat();
  const messages=[{role:"system", content:chatSysPrompt(text)}]
    // B1 修复：保留完整结构（含 tool_calls / tool_call_id），否则含工具调用的会话第二轮会缺 id 触发 400
    .concat(hist.map(m=>({...m})));
  await runChatLoop(messages, hist);
  }catch(err){ const m=(err&&err.message)?err.message:String(err); pushDiag("error", m, {where:"onChatSubmit"}); try{ toast("对话出错："+m, "error"); }catch(e2){} }
}
async function runChatLoop(messages, hist){
  // T3.1：创建控制器 + 记录上次请求（重试用）+ 显示思考中
  chatController=createChatController();
  lastChatRequest={ messages:messages, hist:hist };
  showChatThinking(true);
  try{
    let guard=0;
    const maxLoops = activeGoal()? AGENT_GOAL_LOOP_MAX : 6; // 目标激活时放宽循环，支撑多步自主执行
    while(guard++<maxLoops){
      // T5.3 浏览器兼容：chatController.ac 可为 null（AbortController 不可用），此时不传 signal
      const chatSignal = (chatController && chatController.ac) ? chatController.ac.signal : undefined;
      const j=await chatOnce(messages, { signal: chatSignal });
      const msg = j.choices && j.choices[0] && j.choices[0].message;
      if(!msg) throw new Error("空响应");
      if(msg.tool_calls && msg.tool_calls.length){
        const DANGER=new Set(["delete_task","update_task"]);
        const calls = msg.tool_calls.map(tc=>({name:tc.function.name, id:tc.id, args:JSON.parse(tc.function.arguments||"{}")}));
        if(calls.some(c=>DANGER.has(c.name))){
          // ② 危险操作：整体延后到用户确认后执行，避免半截工具回执引发下一轮 400
          const titles = calls.map(c=>{ const ft=findTask(c.args.task_id); return ft? ft.task.title : c.args.task_id; }).filter(Boolean);
          pendingConfirm={ toolCalls:calls, title:titles.join("、")||"未知任务", assistantMsg:msg, sc:active };
          hist.push({role:"assistant", content:"（待确认）将执行删除/修改操作：「"+(titles.join("、")||"未知")+"」。发送「确认」以继续，其他内容取消。"});
          render(); break;
        }
        // 无危险：完整 assistant + tool（含 tool_calls / tool_call_id）入 hist，B1 安全
        messages.push(msg); hist.push(msg);
        for(const tc of msg.tool_calls){
          const args=JSON.parse(tc.function.arguments||"{}");
          const res=execTool(tc.function.name, args);
          const tm={role:"tool", tool_call_id:tc.id, content:res, _disp:"工具 "+tc.function.name+"("+JSON.stringify(args)+") → "+res};
          messages.push(tm); hist.push(tm);
        }
        render(); continue;
      }
      hist.push({role:"assistant", content:msg.content||"(无内容)"});
      break;
    }
  }catch(err){
    const isAbort = err && err.name==="AbortError";
    if(isAbort && chatController && chatController.reason==="user"){
      // T3.1 用户主动取消：显示「已取消」提示（灰色斜体），不报错
      hist.push({role:"assistant", content:"已取消", _canceled:true});
    } else {
      const m=(err&&err.message)?err.message:String(err);
      hist.push({role:"assistant", content:m, _failed:true});
      pushDiag("error", m, {where:"runChatLoop"});
    }
  } finally {
    // T3.1 清理控制器 + 隐藏思考中指示
    if(chatController && chatController.timer){ clearTimeout(chatController.timer); }
    chatController=null;
    showChatThinking(false);
  }
  if(hist.length>50) hist.splice(0, hist.length-50);
  save(PREFIX+"chat_"+active, hist);
  renderChat(); scrollChat();
}
function renderChat(){
  const el=$("#chat"); if(!el) return;
  const hist=getChat(active);
  el.innerHTML = hist.length? hist.map(m=>{
    if(m.role==="tool") return `<div class="msg tool">${esc(m._disp || m.content)}</div>`;
    if(m.role==="assistant" && m.tool_calls && m.tool_calls.length){
      const s=m.tool_calls.map(tc=>"调用工具 "+esc(tc.function.name)+"("+esc(JSON.stringify(tc.function.arguments||"{}"))+")").join("；");
      return `<div class="msg assistant toolcall">${s}</div>`;
    }
    if(m.role==="assistant" && !m.content) return `<div class="msg assistant">（工具调用中…）</div>`;
    // T3.1 已取消提示（灰色斜体）
    if(m.role==="assistant" && m._canceled) return `<div class="msg assistant canceled">已取消</div>`;
    // T3.1 失败消息 + 重试按钮
    if(m.role==="assistant" && m._failed) return `<div class="msg assistant failed md-body">${mdToHtml(m.content||"")}<button class="chat-retry" id="chatRetry" type="button">重试</button></div>`;
    if(m.role==="assistant") return `<div class="msg assistant md-body">${mdToHtml(m.content||"")}</div>`;
    return `<div class="msg ${m.role}">${esc(m.content||"")}</div>`;
  }).join("") : `<div class="msg assistant">你好，我是${SCENARIOS[active].name}助手，可以直接让我「建个任务」「查总览」「搜索」。</div>`;
  // T3.1 绑定重试按钮
  const rb=$("#chatRetry"); if(rb) rb.onclick=retryChat;
  scrollChat();
}
function scrollChat(){ const el=$("#chat"); if(el) el.scrollTop=el.scrollHeight; }

