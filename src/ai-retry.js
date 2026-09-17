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
  try{ chatController.ac.abort(new Error("user-cancel")); }catch(e){ try{ pushDiag("error", "cancelChat abort error: "+(e&&e.message||e), {where:"cancelChat"}); }catch(_){} }
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
  const el =$("#chatThinking"); if(el) el.style.display = on ? "" : "none";
  const c=$("#chatCancel"); if(c){
    const canCancel = (typeof AbortController !== "undefined" && typeof AbortSignal !== "undefined");
    c.style.display = (on && canCancel) ? "" : "none";
  }
  // v1.10.0b：发送键 ⇄ 暂停键 切换；生成中：图标变方块 + 红色 + 点击触发 abortChat
  const sendBtn = $("#chatSendBtn");
  if(sendBtn){
    if(on){
      sendBtn.dataset.mode = "stop";
      sendBtn.title = t("ai.stopGenerate","停止生成");
      sendBtn.setAttribute("aria-label", t("ai.stopGenerate","停止生成"));
      const sIcon = sendBtn.querySelector(".ic-send"); if(sIcon) sIcon.style.display = "none";
      const tIcon = sendBtn.querySelector(".ic-stop"); if(tIcon) tIcon.style.display = "";
      // 点击 = 取消正在生成的请求（不触发 form submit）
      sendBtn.type = "button";
      sendBtn.onclick = function(e){
        e.preventDefault();
        try{ if(typeof abortChat === "function") abortChat(); }catch(_){ }
      };
    }else{
      sendBtn.dataset.mode = "send";
      sendBtn.title = t("ai.send","发送");
      sendBtn.setAttribute("aria-label", t("ai.sendMsg","发送消息"));
      const sIcon = sendBtn.querySelector(".ic-send"); if(sIcon) sIcon.style.display = "";
      const tIcon = sendBtn.querySelector(".ic-stop"); if(tIcon) tIcon.style.display = "none";
      sendBtn.type = "submit";
      sendBtn.onclick = null;
    }
  }
}
let pendingConfirm = null; // ② 待确认的危险操作（delete/update）：{toolCalls:[{name,id,args}], title, assistantMsg, sc}
/**
 * A2：执行已确认的危险操作（Modal 确认与打字确认共用入口）
 * @returns {Promise<void>}
 */
async function confirmPendingDanger(){
  if(!pendingConfirm || pendingConfirm.sc!==active){ pendingConfirm=null; closeConfirmModal(); return; }
  const hist=getChat(active);
  hist.push({role:"user", content:t("common.confirm","确认")});
  // 补全上一轮被延后的 assistant(tool_calls) + 工具回执，B1 安全
  hist.push(pendingConfirm.assistantMsg);
  const messages=[{role:"system", content:chatSysPrompt(t("common.confirm","确认"))}].concat(hist.map(m=>({...m})));
  for(const c of pendingConfirm.toolCalls){
    const res=execTool(c.name, c.args, true); // 强制（已确认）
    let rj=null; try{ rj=JSON.parse(res); }catch(e){ try{ pushDiag("error", "confirm tool result parse error: "+(e&&e.message||e), {where:"confirmExecTool"}); }catch(_){} }
    const tm={role:"tool", tool_call_id:c.id, content:res, _disp:(rj&&rj.msg)||(t("ai.toolPrefix","工具 ")+c.name)};
    messages.push(tm); hist.push(tm);
  }
  pendingConfirm=null;
  closeConfirmModal();
  await runChatLoop(messages, hist);
}
/* ---------- 上下文 token 预算管理（v1.15：从"条数截断"升级为"token 估算裁剪"） ----------
 * 粗估算：中文≈1 token/字，英文≈4 字符/token（足够保守，不调用模型即可控制长度）。
 * 策略：保留最近的对话，超预算时从最旧开始裁剪；至少保留 12 条（避免完全失去上下文）。
 */
function _estTokens(text){
  const s = String(text || "");
  let zh = 0, other = 0;
  for(let i=0;i<s.length;i++){
    const c = s.charCodeAt(i);
    if(c >= 0x2E80 && c <= 0x9FFF) zh++;
    else other++;
  }
  return zh + Math.ceil(other / 4);
}
function _msgTokens(m){
  if(typeof m.content === "string") return _estTokens(m.content);
  if(Array.isArray(m.content)) return m.content.reduce((n,p)=> n + _estTokens(p && p.text), 0);
  return _estTokens(m.title || "");
}
/** 裁剪历史到 token 预算内（默认 ~6k）。预算约束下至少保留 2 条（保住最近对话）；
 *  条数上限 50 时至少保留 12 条（避免上下文过碎）。 */
function trimChatHist(hist, budget){
  budget = budget || 6000;
  if(!Array.isArray(hist)) return;
  let total = 0;
  for(let i=hist.length-1;i>=0;i--) total += _msgTokens(hist[i]);
  if(total <= budget && hist.length <= 50) return;
  let cut = 0;
  // ① 预算约束：从最旧开始丢，至少留 2 条
  while(cut < hist.length - 2 && total > budget){
    total -= _msgTokens(hist[cut]);
    cut++;
  }
  // ② 条数约束：超 50 条时裁到 ≤50，至少留 12 条
  while(cut < hist.length - 12 && hist.length - cut > 50){
    total -= _msgTokens(hist[cut]);
    cut++;
  }
  if(cut > 0) hist.splice(0, cut);
}
/**
 * A2：取消待确认的危险操作（Modal 取消与打字取消共用入口）
 * @param {string} userText - 用户输入文本（打字取消路径）
 */
function cancelPendingDanger(userText){
  const title = pendingConfirm ? pendingConfirm.title : t("ai.dangerAction","危险操作");
  const hist=getChat(active);
  if(hist.length && hist[hist.length-1].role==="assistant" && !hist[hist.length-1].tool_calls) hist.pop(); // 移除待确认提示
  hist.push({role:"user", content:userText});
  hist.push({role:"assistant", content:t("ai.cancelledOp","已取消操作：「")+title+t("ai.cancelledOpSuffix","」。")});
  pendingConfirm=null;
  closeConfirmModal();
  trimChatHist(hist);
  save(PREFIX+"chat_"+active, hist); renderChat(); scrollChat(); AppBridge.render();
}
/**
 * A2：关闭危险操作确认模态框（若存在）
 * @returns {boolean} 是否关闭了模态框（供 ESC 链式关闭判断）
 */
function closeConfirmModal(){
  const m=$("#aiConfirmModal"); if(!m) return false;
  if(m._releaseTrap) m._releaseTrap();
  m.remove();
  return true;
}
/**
 * A2：打开危险操作确认模态框（替代纯打字确认；打字确认保留一个版本兼容）
 */
function openConfirmModal(){
  if(!pendingConfirm) return;
  closeConfirmModal();
  const ops = pendingConfirm.toolCalls.map(c=> c.name==="delete_task"?t("ai.deleteTask","删除任务"):t("ai.editTask","修改任务"));
  const uniq = [...new Set(ops)];
  const html = `<div class="recycle-modal" id="aiConfirmModal">
    <div class="recycle-card u-max-w-440">
      <div class="recycle-header"><h2>${t("ai.confirmDangerTitle","危险操作确认")}</h2></div>
      <div class="u-pad-5-6">
        <p class="u-m-0-0-2">${t("ai.confirmDangerPrefix","AI 助手请求执行")}<strong>${uniq.join(t("ai.confirmJoinSep","、"))}</strong>${t("ai.confirmDangerColon","：")}</p>
        <p class="u-fw-600 u-m-0-0-4">${esc(pendingConfirm.title)}</p>
        <p class="sub u-m-0-0-4">${t("ai.confirmDangerHint","确认后不可撤销（删除会进入回收站）。也可以在聊天框发送「确认」继续。")}</p>
        <div class="u-flex u-gap-2 u-jc-end">
          <button type="button" class="btn-ghost" id="aiConfirmNo">${t("common.cancel","取消")}</button>
          <button type="button" class="btn-danger" id="aiConfirmYes">${t("ai.confirmExecute","确认执行")}</button>
        </div>
      </div>
    </div></div>`;
  document.body.insertAdjacentHTML("beforeend", html);
  const modal=$("#aiConfirmModal");
  modal._releaseTrap = trapFocus(modal.querySelector(".recycle-card"));
  $("#aiConfirmYes").onclick = ()=> confirmPendingDanger();
  $("#aiConfirmNo").onclick = ()=> cancelPendingDanger(t("common.cancel","取消"));
  modal.onclick = e=>{ if(e.target===modal) cancelPendingDanger(t("common.cancel","取消")); };
}
/* ---------- 场景 sysprompt 可编辑（v1.15：默认取 SCENARIOS 常量，可被用户覆盖） ----------
 * 存储：localStorage 键 wb_agent_sysprompts = { sc: "自定义提示词" }，空值回退 SCENARIOS 默认。
 */
function getCustomSysprompts(){
  const v = load("wb_agent_sysprompts", null);
  return (v && typeof v === "object" && !Array.isArray(v)) ? v : {};
}
function setCustomSysprompt(sc, text){
  const map = getCustomSysprompts();
  const txt = String(text || "").trim();
  if(txt) map[sc] = txt;
  else delete map[sc];
  save("wb_agent_sysprompts", map);
}
/** 取某场景生效的 sysprompt（用户覆盖优先，空则回退 SCENARIOS 默认） */
function effectiveSysprompt(sc){
  const c = getCustomSysprompts();
  if(c[sc] && c[sc].trim()) return c[sc].trim();
  return SCENARIOS[sc]?.sysprompt || "";
}
function chatSysPrompt(userText){
  const cfg = getCfg();
  // v1.15：话术与能力对齐——cfg.agent=false 时不引导记忆/编排（对应工具也已被 effectiveTools 剔除）
  const base = effectiveSysprompt(active) || t("ai.sysPrompt","你是一个全能 AI 助手，可调用工具管理任务与工坊数据。");
  if(cfg && cfg.agent === false){
    return base
      +t("ai.sysPromptTool","\\n你可以调用工具来创建、修改、删除任务，查询与搜索工坊数据，需要时直接调用。")
      +agentContextPrompt(userText);
  }
  return base
    +t("ai.sysPromptTool","\\n你可以调用工具来创建、修改、删除任务，查询与搜索工坊数据，需要时直接调用。")
    +t("ai.sysPromptRemember","用户的事实/偏好/决定用 remember 存入工作记忆；多步任务先用 plan 建立目标与步骤，再逐步执行并用 complete_step/complete_goal 收尾。")
    +agentContextPrompt(userText);
}
async function onChatSubmit(e){
 try{
  e.preventDefault();
  const f=e.target; const text=f.msg.value.trim(); if(!text) return;
  f.msg.value="";
  const hist=getChat(active);
  // ② 拦截待确认的危险操作（不与模型交互）；A2：打字确认保留一个版本兼容
  if(pendingConfirm){
    if(pendingConfirm.sc!==active){ pendingConfirm=null; closeConfirmModal(); }
    else {
      const yes=/^(确认|确定|执行|yes|confirm|y|ok)$/i.test(text.trim());
      if(yes){ await confirmPendingDanger(); } else { cancelPendingDanger(text); }
      return;
    }
  }
  // Agent：显式记忆指令「记住：xxx」直接落工作记忆（不走模型，确定可靠）
  const memHit = /^(记住|请记住|帮我记住)[:：\s]+(.+)$/s.exec(text);
  if(memHit && memHit[2]){
    const r=addMemory(active, memHit[2].trim());
    hist.push({role:"user", content:text});
    hist.push({role:"assistant", content: r? t("ai.remembered","好的，已记住：「")+r.text+t("ai.rememberedScene","」（场景：")+SCENARIOS[active].name+t("ai.rememberedSuffix","，后续对话会自动带上）") : t("ai.nothingToRemember","没有可记住的内容")});
    trimChatHist(hist);
    save(PREFIX+"chat_"+active, hist); renderChat(); scrollChat();
    return;
  }
  // v1.4-D：自然语言建任务拦截（"帮我建个任务：明天下午3点复习数学"）
  const taskHit = parseNaturalLanguageTask(text);
  if(taskHit && taskHit.hit){
    const args = { title: taskHit.title, scenario: taskHit.scenario };
    if(taskHit.due) args.due = taskHit.due;
    if(taskHit.priority) args.priority = taskHit.priority;
    const res = execTool("create_task", args);
    let rj = null; try{ rj = JSON.parse(res); }catch(e){ try{ pushDiag("error", "NL task result parse error: "+(e&&e.message||e), {where:"nlCreateTask"}); }catch(_){} }
    hist.push({role:"user", content:text});
    const okMsg = rj && rj.ok;
    const reply = okMsg
      ? t("ai.taskCreated","已为你创建任务：「")+taskHit.title+t("ai.rememberedScene","」（场景：")+(SCENARIOS[taskHit.scenario]?SCENARIOS[taskHit.scenario].name:taskHit.scenario)
        +(taskHit.due?t("ai.taskCreatedDue","，截止：")+taskHit.due:"")+(taskHit.priority?t("ai.taskCreatedPri","，优先级 ")+taskHit.priority:"")+t("ai.taskCreatedSuffix","）")
      : t("ai.taskCreateFail","创建任务失败：")+(rj && rj.msg ? rj.msg : t("common.unknownError","未知错误"));
    hist.push({role:"assistant", content:reply});
    trimChatHist(hist);
    save(PREFIX+"chat_"+active, hist); renderChat(); scrollChat(); AppBridge.render();
    return;
  }
  // v1.4-D：自然语言操作拦截（"完成第一个任务" / "把数学任务标记为已完成" / "删除数学"）
  const actionHit = parseNaturalLanguageAction(text);
  if(actionHit && actionHit.hit){
    const r = executeNaturalLanguageAction(actionHit);
    hist.push({role:"user", content:text});
    hist.push({role:"assistant", content: r.ok ? r.msg : t("ai.opFail","操作失败：")+r.msg});
    trimChatHist(hist);
    save(PREFIX+"chat_"+active, hist); renderChat(); scrollChat(); AppBridge.render();
    return;
  }
  // v1.6-A：AI 任务拆解拦截（"拆解任务 XXX" / "分解 XXX"）
  const decomposeHit = parseDecomposeIntent(text);
  if(decomposeHit && decomposeHit.hit){
    await handleAiDecompose(decomposeHit, hist);
    return;
  }
  // v1.6-A：AI 代码生成拦截（"生成代码 XXX" / "写代码 XXX"）
  const codeGenHit = parseCodeGenIntent(text);
  if(codeGenHit && codeGenHit.hit){
    await handleAiCodeGen(codeGenHit, hist);
    return;
  }
  // 正常路径（v1.14 多模态已移除，user 消息始终为纯文本）
  hist.push({role:"user",content:text});
  renderChat(); scrollChat();
  // v3.4.7 批次六：RAG 上下文注入（激活闲置索引资产）——检索任务/记录/笔记/对话历史，
  // 相关片段拼进 system prompt。开关：cfg.rag（设置页 AI→记忆），默认关（防 token 意外膨胀）；
  // ragInjectContext 内部已判 cfg.rag === false 返回空串，检索失败/无索引同样安全降级为空。
  const ragCtx = await ragInjectContext(text).catch(()=> "");
  const messages=[{role:"system", content:chatSysPrompt(text) + ragCtx}]
    // B1 修复：保留完整结构（含 tool_calls / tool_call_id），否则含工具调用的会话第二轮会缺 id 触发 400
    .concat(hist.map(m=>({...m})));
  await runChatLoop(messages, hist);
  }catch(err){ const m=(err&&err.message)?err.message:String(err); pushDiag("error", m, {where:"onChatSubmit"}); try{ toast(t("ai.chatError","对话出错：")+m, "error"); }catch(e2){} }
}
async function runChatLoop(messages, hist){
  // T3.1：创建控制器 + 记录上次请求（重试用）+ 显示思考中
  chatController=createChatController();
  lastChatRequest={ messages:messages, hist:hist };
  showChatThinking(true);
  try{
    let guard=0;
    let maxLoops = activeGoal()? AGENT_GOAL_LOOP_MAX : 6; // 目标激活时放宽循环，支撑多步自主执行
    const acfg = getCfg()||{};
    if(!activeGoal()){ const n=Number(acfg.agentLoops); if(isFinite(n)&&n>=6&&n<=30) maxLoops=Math.round(n); }
    else { const n=Number(acfg.agentGoalLoops); if(isFinite(n)&&n>=12&&n<=50) maxLoops=Math.round(n); }
    const wl = String(acfg.toolWhitelist||"").trim();
    const toolWhitelist = wl ? new Set(wl.split(/[,\s\u3000]+/).filter(Boolean)) : null;
    const autoConfirm = !(acfg.agentAutoConfirm===false);
    while(guard++<maxLoops){
      // T5.3 浏览器兼容：chatController.ac 可为 null（AbortController 不可用），此时不传 signal
      const chatSignal = (chatController && chatController.ac) ? chatController.ac.signal : undefined;
      // v3.2 C-档：流式打字机——纯文本轮（无工具调用压力）边收边渲染：流式中先挂一条 _streaming 消息增量更新，
      // 完成后用真实结果替换。工具调用轮不启用（避免半截 tool_calls 状态污染 hist）。
      let streamMsg = null;
      const canStream = !acfg.enabled; // 工具模式（tools 数组在）下走流式需拼 tool_calls delta，先保守关（v3.2 C-档）
      const j = await chatOnce(messages, {
        signal: chatSignal,
        onChunk: canStream ? function(chunkText){
          try{
            if(!streamMsg){
              streamMsg = { role: "assistant", content: "", _streaming: true };
              hist.push(streamMsg);
            }
            streamMsg.content += chunkText;
            AppBridge.render();
          }catch(_e){ /* 渲染异常不阻断流 */ }
        } : undefined
      });
      if(streamMsg){
        // 流式占位消息移除，由下方真实 hist.push 接管
        const idx = hist.indexOf(streamMsg);
        if(idx >= 0) hist.splice(idx, 1);
      }
      const msg = j.choices && j.choices[0] && j.choices[0].message;
      if(!msg) throw new Error(t("ai.emptyResponse","空响应"));
      if(msg.tool_calls && msg.tool_calls.length){
        const DANGER=new Set(["delete_task","update_task"]);
        const calls = msg.tool_calls.map(tc=>({name:tc.function.name, id:tc.id, args:JSON.parse(tc.function.arguments||"{}")}));
        if(calls.some(c=>DANGER.has(c.name))){
          // ② 危险操作：整体延后到用户确认后执行，避免半截工具回执引发下一轮 400
          const titles = calls.map(c=>{ const ft=findTask(c.args.task_id); return ft? ft.task.title : c.args.task_id; }).filter(Boolean);
          if(autoConfirm){
            pendingConfirm={ toolCalls:calls, title:titles.join(t("ai.confirmJoinSep","、"))||t("ai.unknownTask","未知任务"), assistantMsg:msg, sc:active };
            hist.push({role:"assistant", content:t("ai.pendingConfirm","（待确认）将执行删除/修改操作：「")+(titles.join(t("ai.confirmJoinSep","、"))||t("ai.unknown","未知"))+t("ai.pendingConfirmSuffix","」。发送「确认」以继续，其他内容取消。")});
            AppBridge.render(); openConfirmModal(); break; // A2：同时弹出确认模态框
          }
        }
        // 工具白名单过滤
        if(toolWhitelist){
          const allowed = calls.filter(c=>toolWhitelist.has(c.name));
          const denied = calls.filter(c=>!toolWhitelist.has(c.name));
          if(denied.length>0){
            messages.push(msg); hist.push(msg);
            denied.forEach(c=>{
              const tm={role:"assistant", content:t("ai.toolDeniedPrefix","工具 ")+c.name+t("ai.toolDeniedSuffix"," 不在当前允许列表中，已跳过。"), _tool_denied:true};
              messages.push(tm); hist.push(tm);
            });
            AppBridge.render(); continue;
          }
          calls.forEach(c=>{
            const args=JSON.parse(c.args||"{}");
            const res=execTool(c.name, args);
            const tm={role:"tool", tool_call_id:c.id, content:res, _disp:t("ai.toolPrefix","工具 ")+c.name+"("+JSON.stringify(args)+") → "+res};
            messages.push(tm); hist.push(tm);
          });
          AppBridge.render(); continue;
        }
        // 无危险：完整 assistant + tool（含 tool_calls / tool_call_id）入 hist，B1 安全
        messages.push(msg); hist.push(msg);
        for(const tc of msg.tool_calls){
          const args=JSON.parse(tc.function.arguments||"{}");
          const res=execTool(tc.function.name, args);
          const tm={role:"tool", tool_call_id:tc.id, content:res, _disp:t("ai.toolPrefix","工具 ")+tc.function.name+"("+JSON.stringify(args)+") → "+res};
          messages.push(tm); hist.push(tm);
        }
        AppBridge.render(); continue;
      }
      hist.push({role:"assistant", content:msg.content||t("label.noContent","(无内容)")});
      break;
    }
  }catch(err){
    const isAbort = err && err.name==="AbortError";
    if(isAbort && chatController && chatController.reason==="user"){
      // T3.1 用户主动取消：显示「已取消」提示（灰色斜体），不报错
      hist.push({role:"assistant", content:t("ai.cancelled","已取消"), _canceled:true});
    } else {
      const m=(err&&err.message)?err.message:String(err);
      hist.push({role:"assistant", content:m, _failed:true});
      pushDiag("error", m, {where:"runChatLoop"});
    }
  } finally {
    // v3.2 C-档：流式占位消息兜底清理——取消/失败路径也走这里，防 _streaming 残留
    const si = hist.findIndex(function(x){ return x && x._streaming; });
    if(si >= 0){
      // 已有取消/失败标记消息则只删占位；否则保留其已收到的部分内容（转普通消息）
      if(hist[si].content) hist[si]._streaming = false;
      else hist.splice(si, 1);
    }
    // T3.1 清理控制器 + 隐藏思考中指示
    if(chatController && chatController.timer){ clearTimeout(chatController.timer); }
    chatController=null;
    showChatThinking(false);
  }
  trimChatHist(hist);
  save(PREFIX+"chat_"+active, hist);
  renderChat(); scrollChat();
}
/* ---------- 右侧 AI 聊天面板（三栏布局第三栏）·渲染 ---------- */
// 快捷指令（v1.9.5：空对话时展示，点击填入输入框）
const CHAT_SUGGEST = [
  t("cmd.quick1","建个任务：写周报，明天截止"),
  t("cmd.quick2","查总览"),
  t("cmd.quick3","统计本周完成了什么"),
  t("cmd.quick4","搜索 周报")
];
const CHAT_SUGGEST_HTML = `<div class="chat-suggest" aria-label="${t("cmd.shortcuts","快捷指令")}">` +
  CHAT_SUGGEST.map(p => `<button type="button" class="chip" data-prompt="${esc(p)}">${esc(p)}</button>`).join("") +
  `</div>`;
function renderChat(){
  const el=$("#chat"); if(!el) return;
  const hist=getChat(active);
  el.innerHTML = sanitizeHtml(hist.length? hist.map(m=>{
    if(m.role==="tool"){
      var _disp = m._disp || _chatContentToText(m.content);
      if(typeof _disp === "string" && _disp.indexOf("__CHART__") === 0){
        try{
          var _spec = JSON.parse(_disp.slice(9));
          return '<div class="msg tool chart-msg">' + (_spec.title ? '<div class="chart-msg-title">' + esc(_spec.title) + '</div>' : '') + AppBridge.miniChart(_spec.type, _spec.data) + '</div>';
        }catch(_e){ /* 解析失败回退文本 */ }
      }
      return '<div class="msg tool">' + esc(_disp) + '</div>';
    }
    if(m.role==="assistant" && m.tool_calls && m.tool_calls.length){
      const s=m.tool_calls.map(tc=>t("cmd.callTool","调用工具 ")+esc(tc.function.name)+"("+esc(JSON.stringify(tc.function.arguments||"{}"))+")").join("；");
      return `<div class="msg assistant toolcall">${s}</div>`;
    }
    if(m.role==="assistant" && !m.content) return `<div class="msg assistant">${t("ai.toolCalling","（工具调用中…）")}</div>`;
    // T3.1 已取消提示（灰色斜体）
    if(m.role==="assistant" && m._canceled) return `<div class="msg assistant canceled">${t("ai.cancelled","已取消")}</div>`;
    // T3.1 失败消息 + 重试按钮
    if(m.role==="assistant" && m._failed) return `<div class="msg assistant failed md-body">${mdToHtml(m.content||"")}<button class="chat-retry" id="chatRetry" type="button">${t("ai.retry","重试")}</button></div>`;
    // v3.2 C-档：流式打字机态（_streaming 标记的消息加 streaming class——半透明+光标动画）
    if(m.role==="assistant" && m._streaming) return `<div class="msg assistant md-body streaming">${mdToHtml(m.content||"")}</div>`;
    if(m.role==="assistant") return `<div class="msg assistant md-body">${mdToHtml(m.content||"")}</div>`;
    // v1.13 [2b]：user 消息 content 可能为 vision 数组——取文本部分 + 图片计数标记
    return `<div class="msg ${m.role}">${esc(_chatContentToText(m.content)||"")}</div>`;
  }).join("") : `<div class="msg assistant">${t("ai.greetingPrefix","你好，我是")}${SCENARIOS[active].name}${t("ai.greetingSuffix","助手，可以直接让我「建个任务」「查总览」「搜索」。")}</div>` + CHAT_SUGGEST_HTML);
  // T3.1 绑定重试按钮
  const rb=$("#chatRetry"); if(rb) rb.onclick=retryChat;
  // v1.15：点击消息区任意位置 → 聚焦输入框（聊天面板本身即卡片，不另设输入框卡片）
  if(!el._chatFocusBound){
    el._chatFocusBound = true;
    el.addEventListener("click", function(){
      const ta = $("#chatTextInput"); if(ta) ta.focus();
    });
  }
  scrollChat();

}
function scrollChat(){ const el=$("#chat"); if(el) el.scrollTop=el.scrollHeight; }

/**
 * 右侧 AI 聊天面板未启用态：在 #chat 显示「尚未启用 AI」提示（替代原主内容区 chatCard 的未启用文案）
 * @returns {void}
 */
function renderChatDisabled(){
  const el=$("#chat"); if(!el) return;
  const s = SCENARIOS[active] || {name:""};
  el.innerHTML = sanitizeHtml(t("p3.html.aiGreetingPrefix","<div class=\"msg assistant\">你好，我是")+esc(s.name)+t("p3.html.aiGreetingSuffix","助手。尚未启用 AI：点击右上角「设置」填入 API Key，即可对话并调用工具修改数据。</div>"));
}

/* ---------- 右侧 AI 聊天面板（三栏布局第三栏）·事件绑定 ----------
 * 面板内 #chatForm / #chatCancel / #chatThinking / #chatTextInput / #chatAttachBtn / #chatPanelCollapse / #chatPanelRail
 * 均为静态 HTML（不随 render() 重建），故此函数在启动时调用一次即可。
 * 复用现有 onChatSubmit / abortChat / retryChat，不引入新数据源（保留 getChat(active) 兼容测试契约）。
 */
/**
 * 绑定右侧 AI 聊天面板事件：表单提交、取消、附件按钮、折叠/展开、textarea 自适应高度
 * 幂等：重复调用不会重复绑定（用 _bound 标记）
 * @returns {boolean} 是否成功绑定（面板不存在返回 false）
 */
function bindChatPanel(){
  const panel=$("#chatPanel"); if(!panel || panel._bound) return false;
  panel._bound=true;
  // v1.9.5：快捷指令 chips——点击填入输入框并聚焦（事件委托，chips 随 renderChat 重建）
  document.addEventListener("click", function(e){
    const chip = e.target && e.target.closest ? e.target.closest(".chat-suggest .chip") : null;
    if(!chip) return;
    const el = $("#chatTextInput");
    if(el){ el.value = chip.getAttribute("data-prompt") || ""; el.focus(); el.dispatchEvent(new Event("input")); }
  });
  // 模型选择器：复用 cfg.profiles / getActiveProfile()，切换后即时生效（落盘 + 提示）
  const modelSelect=$("#chatModelSelect");
  if(modelSelect){
    const refreshModelSelect=()=>{
      const c=getCfg();
      const profiles = (c && Array.isArray(c.profiles)) ? c.profiles : [];
      if(profiles.length === 0){
        // v1.15 修复：未配置时不 disabled（disabled 的 select 不触发 onclick，
        // 导致"未配置模型→点击跳设置"永远无效），改为保持可点击 + 显式样式提示
        modelSelect.innerHTML = sanitizeHtml(`<option value="">${t("msg.notConfigured","未配置")} ⚠</option>`);
        modelSelect.classList.add("chat-model-empty");
        modelSelect.title = t("msg.noAiProfile","未配置 AI Profile，点击打开设置");
        return;
      }
      modelSelect.classList.remove("chat-model-empty");
      modelSelect.title = t("msg.switchProfile","切换大模型 Profile");
      const cur = c.activeId || profiles[0].id;
      modelSelect.innerHTML = sanitizeHtml(profiles.map(p =>
        `<option value="${esc(p.id)}"${p.id===cur?" selected":""}>${esc(p.name)} · ${esc(p.model || "")}</option>`
      ).join(""));
    };
    refreshModelSelect();
    modelSelect.onchange=()=>{
      const v = modelSelect.value;
      if(!v) return;
      const c = getCfg();
      if(!c || !Array.isArray(c.profiles)) return;
      const p = c.profiles.find(x => x.id === v);
      if(!p) return;
      c.activeId = v;
      saveCfg(c);
      try{ toast(t("ai.switchedProfile","已切换到「") + (p.name || t("common.notNamed","未命名")) + t("ai.switchedProfileMid"," · ") + (p.model || "") + t("ai.switchedProfileSuffix","」"), "ok"); }catch(e){ /* noop */ }
      // 切换后立即重新渲染聊天（让后续请求使用新 profile）
      try{ if(typeof renderChat === "function") renderChat(); }catch(e){ /* noop */ }
    };
    // 点击「未配置模型」时跳转到 AI 配置页（v1.15：改走 openAiPage，直达 AI 配置而非设置首页）
    modelSelect.onclick=()=>{
      const c = getCfg();
      const profiles = (c && Array.isArray(c.profiles)) ? c.profiles : [];
      if(profiles.length === 0 && typeof AppBridge.openAiPage === "function"){
        AppBridge.openAiPage();
      }
    };
    // 暴露刷新方法供外部（如设置保存后）调用
    panel._refreshModelSelect = refreshModelSelect;
  }
  // 表单提交：复用 onChatSubmit（其内部通过 f.msg.value 取值，兼容 textarea）
  const cf=$("#chatForm"); if(cf) cf.onsubmit = onChatSubmit;
  // 取消按钮：复用 abortChat
  const cc=$("#chatCancel"); if(cc) cc.onclick=abortChat;
  // 附件按钮：文本文件追加到输入框（v1.14 多模态已移除，不再支持图片附件）
  const attachBtn=$("#chatAttachBtn");
  if(attachBtn){
    const fileInput=document.createElement("input");
    fileInput.type="file";
    fileInput.accept=".txt,.md,.json,.js,.ts,.css,.html,.xml,.yml,.yaml,.csv,.log,text/*";
    fileInput.style.display="none";
    document.body.appendChild(fileInput);
    attachBtn.onclick=()=> fileInput.click();
    attachBtn.title=t("msg.addTextAttachment","添加文本附件（内容追加进输入框）");
    fileInput.onchange=()=>{
      const f=fileInput.files && fileInput.files[0];
      if(!f) return;
      // 图片附件已随 v1.14 多模态模块移除，此处给出明确提示（防"点了没反应"）
      if(f.type && f.type.indexOf("image/") === 0){
        try{ toast(t("msg.imageAttachmentDisabled","图片附件已停用（v1.14 移除多模态），仅支持文本文件"),"warn"); }catch(e){ /* noop */ }
        fileInput.value="";
        return;
      }
      // 限制 1MB 以内（避免大文件撑爆输入框）
      if(f.size > 1024*1024){
        try{ toast(t("msg.fileTooLarge","文件过大（>1MB），请选择更小的文本文件"),"warn"); }catch(e){ /* noop */ }
        return;
      }
      const reader=new FileReader();
      reader.onload=()=>{
        const ta=$("#chatTextInput"); if(!ta) return;
        const content=String(reader.result || "");
        const header=t("ai.attachmentStart","\\n\\n--- 附件：")+f.name+t("ai.attachmentMid"," ---\n");
        const tail=t("ai.attachmentEnd","\\n--- /附件 ---\\n");
        // 追加到输入框末尾（保留已有内容）
        ta.value=(ta.value? ta.value+"\n":"")+header+content+tail;
        // 触发 input 事件以自适应高度
        ta.dispatchEvent(new Event("input",{bubbles:true}));
        ta.focus();
      };
      reader.onerror=()=>{
        try{ toast(t("msg.readFileFailed","读取文件失败"),"error"); }catch(e){ /* noop */ }
      };
      reader.readAsText(f);
      // 重置 value 允许重复选同一文件
      fileInput.value="";
    };
  }
  // textarea 自适应高度：输入时根据内容调整高度（min 36px / max 120px）
  const ta=$("#chatTextInput");
  if(ta){
    const autoResize=()=>{
      ta.style.height="auto";
      ta.style.height=Math.min(120, Math.max(36, ta.scrollHeight))+"px";
    };
    ta.addEventListener("input", autoResize);
    // Ctrl+Enter / Cmd+Enter 提交
    ta.addEventListener("keydown", e=>{
      if((e.ctrlKey || e.metaKey) && e.key==="Enter"){
        e.preventDefault();
        const form=$("#chatForm"); if(form) form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event("submit",{cancelable:true}));
      }
    });
  }
  // 折叠/展开按钮：切换 .collapsed 类，同步显示侧边条
  const collapseBtn=$("#chatPanelCollapse");
  const rail=$("#chatPanelRail");
  const toggleCollapse=()=>{
    panel.classList.toggle("collapsed");
    const collapsed=panel.classList.contains("collapsed");
    /* v3.5.1：不再替换 textContent（会摧毁 SVG）；箭头方向由 CSS 固定为指右 */
    if(rail) rail.classList.toggle("show", collapsed);
    // 持久化折叠状态
    try{ save(PREFIX+"chat_panel_collapsed", collapsed ? "1" : "0"); }catch(e){ /* noop */ }
  };
  if(collapseBtn) collapseBtn.onclick=toggleCollapse;
  /* v3.2.1 修复：暴露强制展开函数——给 #phAiAskBtn / data-ai-hint-for 等外部入口调用。
     AI 入口不应受聊天面板折叠态阻挡（用户在窄屏默认折叠时也要能用 AI）。 */
  window.__aiPanelExpand = function(){
    if(panel.classList.contains("collapsed")){ toggleCollapse(); }
  };
  /* v3.5.4：箭头=展开面板；AI 图标=展开并跳转 AI 页面 */
  const railExpand = $("#chatRailExpand");
  if(railExpand) railExpand.onclick = function(e){ e.stopPropagation(); if(panel.classList.contains("collapsed")) toggleCollapse(); };
  const railAi = $("#chatRailAi");
  if(railAi) railAi.onclick = function(e){
    e.stopPropagation();
    if(panel.classList.contains("collapsed")) toggleCollapse();
    // AI 配置使用独立 drawer 页面，不是场景 key；保留当前场景供返回时恢复。
    AppBridge.openAiPage();
  };
  if(rail){
    rail.onclick=toggleCollapse;
    rail.addEventListener("keydown", e=>{
      if(e.key==="Enter" || e.key===" "){ e.preventDefault(); toggleCollapse(); }
    });
  }
  // 恢复持久化折叠状态 + 中屏默认折叠（布局修复：平板/小笔记本三栏挤压）
  // 策略：用户点过折叠/展开（存储键存在）→ 恢复其显式选择；
  //       从未表达偏好且视口 <1280px → 默认折叠为侧边条，把空间还给主内容区
  //       （768px 下不折叠时主区仅 288px，看板会被挤溢出）
  try{
    const hasPref = localStorage.getItem(PREFIX+"chat_panel_collapsed") !== null;
    const collapseByDefault = !hasPref && (window.innerWidth||1024) < 1280;
    if(load(PREFIX+"chat_panel_collapsed","0")==="1" || collapseByDefault){
      panel.classList.add("collapsed");
      // 保留按钮 SVG；恢复折叠态不替换按钮内容。
      if(rail) rail.classList.add("show");
    }
  }catch(e){ /* noop */ }
  // 窄屏默认隐藏：监听窗口宽度，<768px 时加 .show 才显示（与 .collapsed 区分）
  if(typeof window !== "undefined"){
    const applyResponsive=()=>{
      const w=window.innerWidth || 0;
      if(w<768){
        // 窄屏：默认隐藏（除非已 .show）
        panel.classList.add("narrow");
      }else{
        panel.classList.remove("narrow");
        panel.classList.remove("show");
      }
    };
    applyResponsive();
    const debouncedResize=(typeof debounce==="function") ? debounce(applyResponsive,200) : applyResponsive;
    window.addEventListener("resize", debouncedResize);
  }
  return true;
}
/* v3.2 IA：场景内"问 AI 助手"入口
 * 点击 #phAiAskBtn → 聚焦右侧聊天面板 + 预填场景上下文提示。
 * AI 不再只是聊天面板里的机器人，而是与每个场景并列的一等入口。 */
function askAiAboutScene(sc, hintKey){
  /* v3.2.1 修复：sc 可空（系统概况卡 / 命令面板等入口）——"无场景"模式只展开面板 + 焦点，不预填场景提示
     v3.2.1 兼容：sc 传非法 key（不在 SCENARIOS 中）也走"无场景"模式，不直接 return，避免静默无响应 */
  const s = sc ? SCENARIOS[sc] : null;
  const cfg = (typeof getCfg === "function") ? getCfg() : null;
  if(!cfg || !cfg.enabled || !cfg.base || !cfg.key){
    /* v3.2.1 修复 UX 闭环：未启用 AI 时记下意图，配置完成保存后自动续上 */
    try{
      save(PREFIX + "__pendingAiAsk", JSON.stringify({ sc: sc, hintKey: hintKey || "", ts: Date.now() }));
    }catch(e){ /* noop */ }
    toast(t("ai.notEnabled","请先在设置 → AI 中启用并填写 API Key"), "warn");
    if(typeof AppBridge.openAiPage==="function") AppBridge.openAiPage();
    return;
  }
  /* v3.2.1 修复：展开 AI 聊天面板（折叠态时）。bindChatPanel 暴露了 window.__aiPanelExpand()
     统一处理 class 切换 + 按钮文案 + 侧边条可见性 + 持久化——和用户手点折叠按钮完全一致。 */
  if(typeof window.__aiPanelExpand === "function"){ window.__aiPanelExpand(); }
  /* 预填场景上下文提示：场景级 vs 记录型 tab 级（带 hintKey 时更具体）
     v3.2.1 修复：s 为空时（无场景入口）跳过预填，只聚焦让用户自填 */
  const ta = document.getElementById("chatTextInput");
  if(!ta) return;
  if(s){
    let promptTpl = "ai.sceneAskPrompt";
    let promptFallback = t("ai.sceneAskFallback","在【{sc}】场景中，帮我…");
    if(hintKey){
      /* 根据 key 反查 tab 标题：key → SCENARIOS[*].record.label 或 featureCard title；这里用 key 名给 AI 一个具体线索 */
      promptTpl = "ai.recordAskPrompt";
      promptFallback = t("ai.recordAskFallback","在【{sc}】场景记一笔【{kind}】…（AI 会调工具写入，无需手填）");
      ta.value = promptFallback.replace("{sc}", s.name).replace("{kind}", hintKey);
    } else {
      ta.value = t(promptTpl, promptFallback).replace("{sc}", s.name);
    }
    if(typeof ta.setSelectionRange==="function"){ ta.setSelectionRange(ta.value.length, ta.value.length); }
  }
  ta.focus();
}
/* 全局委托：点击 phAiAskBtn 触发（renderSceneHead 重渲染后依然有效，幂等） */
/* v3.2.1：AI Hub 三卡片（教练/每日报告/智能推荐）的"在 AI 助手中讨论"出口
 * 内容存 _aiHubContent（按 type 索引：coach/daily/recommend）。
 * 走 askAiAboutScene 同一条路径——AI 启用时直接展开 + 预填；未启用时写 __pendingAiAsk + 跳设置，配置完自动续上。 */
const _aiHubContent = { coach: "", daily: "", recommend: "" };
function discussInAi(type){
  /* 构建给 AI 的提示（带上下文引用） */
  let prompt = "";
  if(type === "coach"){
    const adv = _aiHubContent.coach || "";
    prompt = adv ? t("ai.hubCoachWithAdv","刚才 AI 教练根据我的行为数据给了 3 条建议：\n") + adv + t("ai.hubCoachSuffix","\n请基于这些建议帮我…")
            : t("ai.hubCoachNoAdv","请根据我最近 2 周的行为数据，给我一些具体可执行的建议。");
  } else if(type === "daily"){
    const rep = _aiHubContent.daily || "";
    prompt = rep ? t("ai.hubDailyWithRep","刚才 AI 生成的今日报告：\n\n") + rep + t("ai.hubDailySuffix","\n\n请基于这份报告帮我…")
            : t("ai.hubDailyNoRep","请基于我的任务和打卡记录，帮我梳理今天最该做的 3 件事。");
  } else if(type === "recommend"){
    const rec = _aiHubContent.recommend || "";
    prompt = rec ? t("ai.hubRecWithRec","刚才 AI 推荐的 3 条行动：\n") + rec + t("ai.hubRecSuffix","\n请基于这些推荐帮我…")
            : t("ai.hubRecNoRec","请基于我的任务数据，推荐 3 条下一步行动建议。");
  } else {
    return;
  }
  /* AI 启用状态检查 + pending 闭环 */
  const cfg = (typeof getCfg === "function") ? getCfg() : null;
  if(!cfg || !cfg.enabled || !cfg.base || !cfg.key){
    try{
      save(PREFIX + "__pendingAiAsk", JSON.stringify({ sc: "", hintKey: "discuss." + type, prompt: prompt, ts: Date.now() }));
    }catch(e){ /* noop */ }
    toast(t("ai.notEnabled","请先在设置 → AI 中启用并填写 API Key"), "warn");
    if(typeof AppBridge.openAiPage==="function") AppBridge.openAiPage();
    return;
  }
  if(typeof window.__aiPanelExpand === "function"){ window.__aiPanelExpand(); }
  const ta = document.getElementById("chatTextInput");
  if(ta){
    ta.value = prompt;
    ta.focus();
    if(typeof ta.setSelectionRange==="function"){ ta.setSelectionRange(ta.value.length, ta.value.length); }
  }
}
/* 全局委托：AI Hub 讨论按钮（renderOverview 重新渲染后依然有效） */
document.addEventListener("click", function(e){
  const btn = e.target && e.target.closest ? e.target.closest(".ai-discuss-btn") : null;
  if(!btn) return;
  e.preventDefault();
  const type = btn.getAttribute("data-discuss-type");
  if(type) discussInAi(type);
});

document.addEventListener("click", function(e){
  const btn = e.target && e.target.closest ? e.target.closest("#phAiAskBtn") : null;
  if(btn){
    e.preventDefault();
    const sc = btn.getAttribute("data-ai-scene") || active;
    askAiAboutScene(sc);
  }
});
