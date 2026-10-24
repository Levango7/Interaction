// ===== AI Layer (AI 层·取消/重试控制器) =====
let chatController=null;       // { ac, timer, aborted, reason }
      // { messages, hist } 用于重试

/** 聊天请求超时毫秒数：与设置页「请求超时」同一来源（缺省/越界回退 30s，范围 5~120） */
function _chatTimeoutMs(){
  try{
    const n = Number((getCfg() || {}).aiTimeoutSec);
    if(isFinite(n) && n >= 5 && n <= 120) return Math.round(n * 1000);
  }catch(e){ /* 配置不可读时用默认值 */ }
  return 30000;
}
/**
 * 创建聊天控制器（AbortController + 超时定时器）
 * T5.3 浏览器兼容：AbortController / AbortSignal.timeout 不可用时降级为「无取消、无超时」，
 *                  仍返回结构体（ac=null）保证调用方解构不崩；取消按钮由 showChatThinking 守卫隐藏
 * v3.7.52：超时改为**每轮请求重置**并读取 `aiTimeoutSec`。此前是一个 30s 定时器罩住整个多轮循环，
 *          agent 模式（6~12 轮）必然在第 30 秒被掐断，而设置里的「请求超时」在浏览器路径根本不生效。
 * @returns {{ac:AbortController|null, timer:number|null, aborted:boolean, reason:string|null, resetTimeout?:Function}}
 */
function createChatController(){
  // AbortController 不存在 → 返回空骨架，chatOnce 不传 signal、abortChat 静默 false
  if(typeof AbortController === "undefined" || typeof AbortSignal === "undefined"){
    return { ac:null, timer:null, aborted:false, reason:null };
  }
  let ac=null;
  try{ ac=new AbortController(); }catch(e){ return { ac:null, timer:null, aborted:false, reason:null }; }
  const ctrl={ ac:ac, timer:null, aborted:false, reason:null };
  /** 重置超时计时（每轮调用；reason 置 timeout 供上层区分「超时」与「用户取消」） */
  ctrl.resetTimeout=function(ms){
    try{
      if(ctrl.timer) clearTimeout(ctrl.timer);
      ctrl.timer=setTimeout(function(){
        ctrl.reason="timeout";
        try{ ac.abort(new Error("timeout")); }catch(e){ /* 已 abort 过 */ }
      }, (ms>0) ? ms : _chatTimeoutMs());
    }catch(e){ ctrl.timer=null; }
  };
  ctrl.resetTimeout();
  return ctrl;
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
 * v3.7.59：当前聊天是否已被用户取消。
 * 取消语义此前只作用于 fetch：`execToolAuto` / `execTool` 都不接收 signal，工具批次的循环里
 * 也没有任何取消检查 —— 于是用户点「取消」后，同一批 tool_calls 里**尚未执行**的写操作
 * （删除任务 / 新增记录 / 改状态…）仍会照常落地，界面却显示「已取消」。
 * AbortController 不可用时 chatController.ac 为 null，abortChat 直接 return false，
 * aborted 恒为 false —— 与「无取消能力」的既有语义一致。
 * @returns {boolean}
 */
function _chatCancelled(){
  return !!(typeof chatController !== "undefined" && chatController && chatController.aborted);
}
/**
 * 为「因取消而未执行」的工具调用补一条 tool 回执。
 * 必须补：assistant 消息里的 tool_calls 与后续 tool 应答是**一一对应**的，
 * 少一条下一轮 API 调用会直接 400（本文件 v3.7.52 已因同类问题踩过坑）。
 * @param {Array} messages 送往 API 的消息数组
 * @param {Array} hist 界面历史数组
 * @param {string} id tool_call_id
 * @param {string} name 工具名
 */
function _pushSkippedToolReceipt(messages, hist, id, name){
  const msg = t("ai.toolSkipped","工具 {name} 因取消已跳过，未执行。").replace("{name}", name);
  const tm = { role:"tool", tool_call_id:id, content:JSON.stringify({ ok:false, msg:msg }), _disp:msg, _tool_skipped:true };
  messages.push(tm); hist.push(tm);
}

/**
 * 解析工具调用的 `arguments`。
 * 模型返回的 arguments 是**不可信的 JSON 文本**，现实里会出现截断（被 max_tokens 掐断）、
 * 尾随逗号、单引号、裸字符串等非法形态。
 * 原实现直接 `JSON.parse(tc.function.arguments||"{}")` —— 一旦非法就抛裸 SyntaxError 冒到用户
 * 面前（界面显示 "Unexpected token ..."），而且该 tool_call **没有任何回执**：
 * assistant 消息里的 tool_calls 与后续 tool 应答数量对不上，模型既拿不到反馈、也无法自我纠正，
 * 整个多步循环就此中断。
 * 现改为失败返回 null，由调用方按「参数非法」回执给模型并跳过执行。
 * @param {string|Object|undefined} raw
 * @returns {Object|null} 合法对象；非法返回 null
 */
function _parseToolArgs(raw){
  if(raw === undefined || raw === null || raw === "") return {};
  if(typeof raw === "object") return raw;
  try{
    const v = JSON.parse(String(raw));
    return (v && typeof v === "object" && !Array.isArray(v)) ? v : null;
  }catch(e){ return null; }
}
/** 为「arguments 非法」的工具调用补一条 tool 回执（理由同 _pushSkippedToolReceipt：必须一一对应） */
function _pushBadArgsToolReceipt(messages, hist, id, name){
  const msg = t("ai.badToolArgs","工具 {name} 的参数不是合法 JSON，已跳过执行；请重新给出合法参数。").replace("{name}", name);
  const tm = { role:"tool", tool_call_id:id, content:JSON.stringify({ ok:false, msg:msg }), _disp:msg, _tool_badargs:true };
  messages.push(tm); hist.push(tm);
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
  await runChatLoop(req.messages, hist, req.sc);
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
 // ② 待确认的危险操作（delete/update）：{toolCalls:[{name,id,args}], title, assistantMsg, sc}
/**
 * A2：执行已确认的危险操作（Modal 确认与打字确认共用入口）
 * @returns {Promise<void>}
 */
async function confirmPendingDanger(){
  if(!pendingConfirm || pendingConfirm.sc!==active){ pendingConfirm=null; closeConfirmModal(); return; }
  const psc = active; /* v3.7.71 竞态修复：入口定格场景，长 await 期间切场景不串写 */
  const hist=getChat(psc);
  hist.push({role:"user", content:t("common.confirm","确认")});
  // 补全上一轮被延后的 assistant(tool_calls) + 工具回执，B1 安全
  hist.push(pendingConfirm.assistantMsg);
  const messages=[{role:"system", content:chatSysPrompt(t("common.confirm","确认"))}].concat(hist.map(m=>({...m})));
  for(const c of pendingConfirm.toolCalls){
    /* v3.7.59：参数非法的调用即使被确认也不执行（execTool 收到 null args 会抛内部 TypeError） */
    if(c.args === null){ _pushBadArgsToolReceipt(messages, hist, c.id, c.name); continue; }
    const res=execTool(c.name, c.args, true); // 强制（已确认）
    let rj=null; try{ rj=JSON.parse(res); }catch(e){ try{ pushDiag("error", "confirm tool result parse error: "+(e&&e.message||e), {where:"confirmExecTool"}); }catch(_){} }
    /* v3.7.72 token 优化：超长工具结果截断 —— 整段 JSON 回填是 token 无底洞，模型只需关键字段 */
    let _res=res; if(typeof _res==="string" && _res.length>2400){ _res=_res.slice(0,2400)+"…(截断，共 "+res.length+" 字符)"; }
    const tm={role:"tool", tool_call_id:c.id, content:_res, _disp:(rj&&rj.msg)||(t("ai.toolPrefix","工具 ")+c.name)};
    messages.push(tm); hist.push(tm);
  }
  pendingConfirm=null;
  closeConfirmModal();
  await runChatLoop(messages, hist, psc);
}
/* ---------- 上下文 token 预算管理（v1.15：从"条数截断"升级为"token 估算裁剪"） ----------
 * 粗估算：中文≈1 token/字，英文≈4 字符/token（足够保守，不调用模型即可控制长度）。
 * 策略：保留最近的对话，超预算时从最旧开始裁剪；至少保留 12 条（避免完全失去上下文）。
 */

function _msgTokens(m){
  if(typeof m.content === "string") return _estTokens(m.content);
  if(Array.isArray(m.content)) return m.content.reduce((n,p)=> n + _estTokens(p && p.text), 0);
  return _estTokens(m.title || "");
}
/** 裁剪历史到 token 预算内（默认 ~6k）。预算约束下至少保留 2 条（保住最近对话）；
 *  条数上限 50 时至少保留 12 条（避免上下文过碎）。 */

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

/* ---------- Agent 自主执行：先规划 → 用户评审 → 确认后才落地（v3.7.59 给 chatOnceAgent 一个真入口） ----------
 * 为什么不让它一键跑完：chatOnceAgent / executeAgentPlan / parseAgentPlan 这条链早就写全了，
 * 但**零生产调用方、零测试**（v3.7.59 实测：只挂在 __test 桥上），而且旧实现用
 * execTool(...,force=true) 绕开了危险操作确认。直接给它一个"点了就跑完"的入口，
 * 等于把一条没人走过的自动改数据路径交给用户 —— 所以入口按「规划 → 评审 → 执行」两段式做。
 * 破坏性步骤（delete_task/update_task）在 executeAgentPlan 里被拦成 needsConfirm，
 * 白名单在这条路径同样生效，步数有 AGENT_PLAN_STEPS_MAX 封顶。
 */
let pendingAgentPlan = null; // { plan, text, sc }

/* ===== v3.7.116：自主执行断点续跑 =====
 * 此前 `>` 自主计划的评审态与执行进度**只在内存**（pendingAgentPlan 是 let），
 * 执行到一半刷新页面，进度就地丢失、从头再来（已跑过的步骤会不会重跑全凭运气）。
 * 现在把"未完成的执行"落成一份盘上记录（容量 1 份），刷新后可原地续跑：
 *   wb_agent_agent_run = { goal, text, sc, steps, done:[{i,tool,ok,resultStr}], at }
 * 三条口径（对应迭代计划的验收）：
 *   ① 全程落盘：确认即写、每步完成更新 done、全部完成/用户放弃清档；
 *      取消（abort）与异常**不清档** —— 那是续跑的前提；
 *   ② **done 权威**：done 里标记过的步骤不重跑（它记录的是"确实执行过"）；
 *      缓存的 resultStr 只用于展示，不据此推断或重建数据现状（与 mv 冲突同口径）；
 *   ③ 容量 1 份：有待续运行时 `>` 不静默开新计划（先提示），放弃后才能开新的。 */
const AGENT_RUN_KEY = PREFIX + "agent_run";
/* v3.7.116：写不进的后果只是"不能续跑"（当轮执行不受影响），但**不能不留下痕迹** ——
   配额满/隐私模式下用户会以为进度存住了，刷新后才发现没了。一次性 WARN（同 v3.7.102
   sideCollapsed 的做法）：不刷屏，但排查时有据可查。 */
let _agentRunWriteWarned = false;
function _agentRunWriteWarn(op, e){
  if(_agentRunWriteWarned) return;
  _agentRunWriteWarned = true;
  try{ pushDiag("warn", "agent_run " + op + " failed: " + ((e && e.message) || e), { where: "agentRun" }); }catch(_e2){}
}
function loadAgentRun(){
  try{ const r = load(AGENT_RUN_KEY, null); return (r && Array.isArray(r.steps)) ? r : null; }
  catch(e){ return null; }
}
function saveAgentRun(rec){ try{ save(AGENT_RUN_KEY, rec); }catch(e){ _agentRunWriteWarn("save", e); } }
function clearAgentRun(){ try{ save(AGENT_RUN_KEY, null); }catch(e){ _agentRunWriteWarn("clear", e); } }
/** 有未完成步骤时返回 {done,total,goal,sc}，否则 null（含记录损坏/已对齐两种） */
function agentRunPending(){
  const r = loadAgentRun();
  if(!r) return null;
  const done = Array.isArray(r.done) ? r.done.length : 0;
  if(done >= r.steps.length) return null;
  return { done: done, total: r.steps.length, goal: r.goal || "", sc: r.sc || "", rec: r };
}
/** 给人看的恢复提示（命令面板入口与启动提示共用同一份文案） */
function agentRunNotice(){
  const p = agentRunPending();
  if(!p) return "";
  return t("aiagent.runResumeHint","有一个未完成的执行（第 ")+ (p.done+1) + t("aiagent.runResumeHintMid","/共 ")+p.total
    + t("aiagent.runResumeHintEnd"," 步）—— 发送「继续执行」续跑，或「放弃执行」取消。");
}
/** 放弃：清档（与"取消"不同 —— 取消是中断当轮，放弃是连盘上记录也不要了） */
function discardAgentRun(){ clearAgentRun(); }
/**
 * 续跑：从 done 之后的下一步开始，不重跑已完成步骤。
 * @returns {Promise<{ok:boolean, executed:number, results:Array, summary?:string, cancelled?:boolean}>}
 */
async function continueAgentRun(){
  const p = agentRunPending();
  if(!p) return { ok:false, executed:0, results:[] };
  const rec = p.rec;
  const remaining = rec.steps.slice(p.done);
  chatController = createChatController();
  showChatThinking(true);
  const signal = (chatController && chatController.ac) ? chatController.ac.signal : undefined;
  try{
    const r = await executeAgentPlanReactive(
      { goal: rec.goal || "", steps: remaining },
      {
        signal: signal, goal: rec.goal || "",
        onProgress: function(finished, _total, step, resultStr, stepRes){
          /* 每步落一次盘：done 追加的是"刚跑完的那一步"（用原始 steps 的索引）。
             **被拦下的步骤不算完成**（needsConfirm/不在白名单 → blocked）：它没跑，
             标成 done 会让续跑永远跳过它 —— 那就把"需确认的步骤"悄悄吞掉了。 */
          if(stepRes && stepRes.blocked) return;
          const cur = loadAgentRun() || rec;
          const idx = rec.steps.indexOf(step);
          if(idx < 0) return;    // 重规划产生的新步骤不在原清单里 → 由 onReplan 重建
          if((cur.done || []).some(function(d){ return d.i === idx; })) return;
          saveAgentRun(Object.assign({}, cur, {
            done: (cur.done || []).concat([{ i: idx, tool: step.tool, ok: !!(stepRes && stepRes.stepOk), resultStr: String(resultStr || "").slice(0, 400) }])
          }));
          /* v3.7.117：续跑同样勾 goals（goals 的 steps 与 rec.steps 同序 —— 建目标时
             就是按计划步骤逐条写的；重规划进来的新步骤越界，markStep 自己返回 null）。 */
          try{ markStep(idx); }catch(_e){}
        },
        onReplan: function(newRemaining, executedSteps){
          /* 重规划后剩余步骤是新对象，与原 steps 对不上号 —— 按「已执行 + 新剩余」重建盘上记录，
             保证 done 的下标始终指向当前 steps（否则续跑会漏跑或重跑）。 */
          const cur = loadAgentRun() || rec;
          if(!Array.isArray(newRemaining)) return;
          const executed = Array.isArray(executedSteps) ? executedSteps : [];
          saveAgentRun(Object.assign({}, cur, {
            steps: executed.concat(newRemaining),
            done: executed.map(function(_s, i){ return { i: i, tool: (_s && _s.tool) || "", ok: true }; })
          }));
        }
      }
    );
    const executed = r.results ? r.results.length : 0;
    if(r.ok){
      clearAgentRun();     // 全部完成 → 清档
      try{ completeGoal(r.summary || ""); }catch(_e){}   // v3.7.117：goals 那份同步收尾
    }
    /* r.ok=false（取消）→ 保留盘上记录：用户随时可再次续跑 */
    return { ok: !!r.ok, executed: executed, results: r.results || [], summary: r.summary || "", cancelled: !r.ok };
  }catch(e){
    return { ok:false, executed:0, results:[], summary: String((e && e.message) || e) };
  }finally{
    showChatThinking(false);
    if(chatController && chatController.timer) clearTimeout(chatController.timer);
    chatController = null;
  }
}

/* ===== v3.7.118：上下文滚动摘要 =====
 * 问题：每轮把整段历史全量发送，token 成本随会话轮数**线性涨**（架构评估的第三块天花板）。
 * 解法：超过阈值时把最旧一段折成一次摘要（**一次额外请求**），摘要拼进 system 提示、
 * 只发「摘要 + 最近 KEEP 条」。三条纪律：
 *   ① 阈值内零额外请求 —— 短会话行为与改动前完全一致；
 *   ② 摘要请求失败/超时 → 保持原 covered（可能为 0）→ 回退既有全量路径，不报错不阻塞
 *      （降级路径优先于新功能）；
 *   ③ **不静默改历史**：chats[sc] 原样不动，摘要只是"发送时的投影"；按**会话**隔离
 *      （存进 session 对象 —— 切会话不串味，删会话随它一起消失，无需额外清理键）。
 * 配置：cfg.histSummary===false 关；cfg.histSummaryAt（默认 40 条触发）、
 *      cfg.histSummaryKeep（默认留最近 20 条）、cfg.histSummaryStep（默认每多 10 条重折一次
 *      —— 不是每条都重摘要，那会把节省的 token 又花回去）。 */
function _sumCfg(){
  const c = (typeof getCfg === "function") ? (getCfg() || {}) : {};
  return {
    on: c.histSummary !== false,
    at: Math.max(8, Number(c.histSummaryAt) || 40),
    keep: Math.max(4, Number(c.histSummaryKeep) || 20),
    step: Math.max(2, Number(c.histSummaryStep) || 10)
  };
}
function _sessSumGet(){
  try{
    if(typeof getActiveSessionObj !== "function") return null;
    const s = getActiveSessionObj();
    return (s && s.sum && typeof s.sum.text === "string" && Number(s.sum.covered) > 0) ? s.sum : null;
  }catch(e){ return null; }
}
function _sessSumPut(text, covered){
  try{
    if(typeof getActiveSessionObj !== "function") return;
    const s = getActiveSessionObj();
    if(!s) return;
    s.sum = { text: String(text || "").slice(0, 1200), covered: covered };
    if(typeof _saveSessions === "function") _saveSessions();
  }catch(e){ /* 写不进只是不能续用摘要，不影响当轮 */ }
}
/** 取「本会话已折叠条数」（无摘要返回 0）—— 诊断行与发送投影共用 */
function ctxSummaryState(){
  const s = _sessSumGet();
  return s ? { covered: s.covered, chars: (s.sum ? s.text.length : 0) } : { covered: 0, chars: 0 };
}
async function maybeSummarizeHistory(hist, sc){
  const cfg = _sumCfg();
  const st = _sessSumGet();
  const covered0 = st ? Number(st.covered) || 0 : 0;
  if(!cfg.on) return null;
  if(!Array.isArray(hist) || hist.length <= cfg.at) return null;
  const want = hist.length - cfg.keep;             // 想折叠到第 want 条
  if(want <= covered0) return null;                // 已在覆盖范围内（或更短）
  if(covered0 > 0 && want - covered0 < cfg.step) {
    /* 增长不足一步：沿用旧摘要（省一次摘要请求）。注意此时**已折叠的部分**用旧摘要、
       covered0..want 之间这些没折进去的消息仍要发 —— 所以返回 covered0 而非 want。 */
    return { covered: covered0, block: _sumBlock(st.text) };
  }
  /* 生成新摘要（覆盖前 want 条）*/
  const folded = hist.slice(0, want).map(function(m){
    return (m.role === "user" ? "用户" : (m.role === "assistant" ? "助手" : m.role)) + "：" + String(m.content || "").slice(0, 200);
  }).join("\n");
  let text = "";
  try{
    const resp = await chatOnce([
      { role: "system", content: "把下面的对话历史压缩成要点摘要（保留：已决定的事项、关键事实、未完成的问题；去掉寒暄与重复）。不超过 300 字，直接给摘要正文。" },
      { role: "user", content: folded }
    ], {});
    const c = (resp && resp.choices && resp.choices[0] && resp.choices[0].message && resp.choices[0].message.content) || "";
    text = String(c || "").trim();
  }catch(e){ return null; }     // 摘要失败 → 回退全量（covered=0 或旧值由调用方按 null 处理）
  if(!text) return null;
  _sessSumPut(text, want);
  return { covered: want, block: _sumBlock(text) };
}
function _sumBlock(text){
  return t("ctx.sumHeader", "【较早对话摘要】（更早的对话已折叠为摘要，以下为要点）：\n") + String(text || "");
}

/** 把计划渲染成人能读的评审文本（聊天里显示，也用作确认提示的正文） */
function agentPlanReviewText(plan){
  const lines = plan.steps.map(function(s, i){
    /* 2026-10-24：远端工具的名字是 mcp__<服务器>__<工具>，对人不友好 —— 评审卡里换成人话并点名服务器，
       否则用户看不出这一步是在动哪台远端服务（尤其危险步骤要确认时，这一点必须一眼可见）。 */
    const meta = (typeof mcpToolMeta === "function") ? mcpToolMeta(s.tool) : null;
    const shown = meta ? ("「" + meta.tool + "」（MCP：" + meta.server + "）") : s.tool;
    return (i+1)+". "+s.desc+"  →  "+shown+(isDangerTool(s.tool) ? t("aiagent.planDangerMark"," ⚠️ 需确认，不会自主执行") : "");
  });
  let out = t("aiagent.planHead","【执行计划】")+plan.goal+"\n"+lines.join("\n");
  if(plan.truncatedFrom) out += "\n"+t("aiagent.planTruncated","（原计划 ")+plan.truncatedFrom+t("aiagent.planTruncatedMid"," 步，已裁到 ")+plan.steps.length+t("aiagent.planTruncatedSuffix"," 步 —— 自主执行有步数上限）");
  return out + "\n" + t("aiagent.planAsk","发送「确认执行」开始逐步执行；发送其他内容取消该计划。");
}

/**
 * 只做规划并请用户评审，不执行任何变更。
 * @param {string} text - 用户诉求
 * @returns {Promise<boolean>} 是否产出了待确认的计划
 */
async function proposeAgentPlan(text){
  const raw = String(text || "").trim();
  if(!raw) return false;
  const sc = active; /* v3.7.71 竞态修复：规划发起时的场景定格 */
  const hist = getChat(sc);
  if(getCfg().agent === false){
    toast(t("aiagent.offWarn","Agent 模式已关闭（设置 → AI → Agent 模式），无法自主规划执行。"), "warn");
    return false;
  }
  /* v3.7.116：有未完成的执行时先提示再决定 —— 容量 1 份，静默开新计划会**无声吞掉**
     旧进度（用户以为旧任务还在跑）。提示里给两条明确出路。 */
  if(agentRunPending()){
    hist.push({ role:"user", content: raw });
    hist.push({ role:"assistant", content: agentRunNotice() });
    trimChatHist(hist);
    save(PREFIX+"chat_"+sc, hist); renderChat(); scrollChat();
    toast(agentRunNotice(), "warn");
    return false;
  }
  hist.push({ role:"user", content: raw });
  renderChat(); scrollChat();
  chatController = createChatController();
  showChatThinking(true);
  let plan = null, errText = "";
  try{
    /* 规划阶段也带上技能段：用户沉淀的标准作业流程正是"该怎么拆"的现成答案 */
    const msgs = [
      { role:"system", content: agentPlanSysPrompt(raw) + skillsPromptBlock(raw) },
      { role:"user", content: raw }
    ];
    const resp = await chatOnce(msgs, { signal: (chatController && chatController.ac) ? chatController.ac.signal : undefined });
    const content = (resp && resp.choices && resp.choices[0] && resp.choices[0].message && resp.choices[0].message.content) || "";
    plan = parseAgentPlan(content);
    if(!plan) errText = t("aiagent.noPlan","模型没有返回可执行的计划，请换个说法，或直接走普通对话。");
  }catch(e){
    errText = t("aiagent.planError","规划失败：")+String((e && e.message) || e);
  }finally{
    showChatThinking(false);
    if(chatController && chatController.timer) clearTimeout(chatController.timer);
    chatController = null;
  }
  if(plan){
    pendingAgentPlan = { plan: plan, text: raw, sc: active };
    hist.push({ role:"assistant", content: agentPlanReviewText(plan), _prompt: raw });
  }else{
    hist.push({ role:"assistant", content: errText, _failed: true });
  }
  trimChatHist(hist);
  save(PREFIX+"chat_"+sc, hist); renderChat(); scrollChat();
  return !!plan;
}

/** 执行已评审的计划（非破坏性步骤），并把流程交给"固化为技能"候选 */
async function confirmAgentPlan(){
  const p = pendingAgentPlan;
  if(!p || p.sc !== active){ pendingAgentPlan = null; return false; }
  pendingAgentPlan = null;
  /* v3.7.71 竞态修复：长执行期间用户可能切场景 → active 已变。
     键名必须用**入口时定格**的 p.sc（入口已校验 p.sc===active），否则会把
     A 场景的聊天整段写进 B 场景的键。读、写、trim 三处统一用 sc。 */
  const sc = p.sc;
  const hist = getChat(sc);
  hist.push({ role:"user", content: t("common.confirm","确认") });
  chatController = createChatController();
  showChatThinking(true);
  const signal = (chatController && chatController.ac) ? chatController.ac.signal : undefined;
  /* v3.7.116：确认即落盘（刷新/崩溃后可续跑）。done 由 onProgress 逐步追加；
     容量 1 份 —— 有待续运行时 proposeAgentPlan 会先提示，不会静默覆盖到这里。 */
  saveAgentRun({ goal: p.plan.goal || "", text: p.text || "", sc: sc, steps: p.plan.steps, done: [], at: Date.now() });
  /* v3.7.117：写入与 `plan` 工具链**同一个** goals 存储 —— 消灭"两套互不相认"。
     入口保留（`>` 的评审体验更好），状态只有一份：agentContextPrompt 的
     「进行中目标 / 请继续执行第 N 步」从此对两套机制同时生效。
     · steps 的 text 取 desc（人读的）；工具信息在 agent_run 里（执行用）。
     · src:"palette" 是来源标记（旧数据无此字段；读取方不依赖它，只作排查线索）。
     · createGoal 会把旧 active 置 done —— 单目标聚焦，与 plan 工具同一语义。 */
  const goalRec = createGoal(p.plan.goal, p.plan.steps.map(function(s){ return s.desc || s.tool; }), sc);
  if(goalRec){ goalRec.src = "palette"; _updateGoal(goalRec); }
  /* v3.7.116：进度回执两个 —— onProgress（每步完成）与 onReplan（重规划后重建下标）。
     done 的 i 始终指向**当前盘上 steps** 的下标；重规划时 steps 被替换，done 跟着重建。 */
  const runProgress = function(_finished, _total, step, resultStr, stepRes){
    chatProgressUpdate({ current: _finished, total: _total, label: t("chat.progress.step", "步骤：") + ((step && step.tool) || "") });
    if(stepRes && stepRes.blocked) return;    // 被拦下的步骤没跑，不算完成（续跑不能跳过它）
    const cur = loadAgentRun();
    if(!cur) return;
    /* ⚠️ 必须用**活的** p.plan.steps 找下标：cur 是盘上 JSON 解析出的副本，
       副本与 step 不是同一个对象，indexOf 恒为 -1（进度永远写不进去 —— 实测踩到）。 */
    const idx = p.plan.steps.indexOf(step);
    if(idx < 0) return;
    if((cur.done || []).some(function(d){ return d.i === idx; })) return;
    saveAgentRun(Object.assign({}, cur, {
      done: (cur.done || []).concat([{ i: idx, tool: step.tool, ok: !!(stepRes && stepRes.stepOk), resultStr: String(resultStr || "").slice(0, 400) }])
    }));
    /* v3.7.117：同步勾选 goals 的同一步（用户看得见的那份清单）。
       重规划产生的新步骤不在 goals 里（goals 是用户面检查清单，agent_run 是执行记录）——
       下标越界时 markStep 自己返回 null，不写坏数据。 */
    try{ markStep(idx); }catch(_e){}
  };
  const runReplan = function(newRemaining, executedSteps){
    const cur = loadAgentRun();
    if(!cur || !Array.isArray(newRemaining)) return;
    const executed = Array.isArray(executedSteps) ? executedSteps : [];
    /* 重建：steps = 已执行 + 新剩余；done = 已执行的那些下标（0..n-1）。
       只有这样续跑时才不会把「重规划后已经跑过的新步骤」再跑一遍。 */
    saveAgentRun(Object.assign({}, cur, {
      steps: executed.concat(newRemaining),
      done: executed.map(function(_s, i){ return { i: i, tool: (_s && _s.tool) || "", ok: true }; })
    }));
  };
  try{
    // v3.7.72：换自适应执行（分段 + 结果回喂校准），盲跑版 executeAgentPlan 保留作降级
    chatProgressStart("plan", t("chat.progress.plan", "执行计划…"), p.plan.steps.length);
    const r = await executeAgentPlanReactive(p.plan, { signal: signal, goal: p.goal || "", onProgress: runProgress, onReplan: runReplan });
    chatProgressEnd();
    hist.push({ role:"assistant", content: r.summary, _prompt: p.text || "" });
    if(r.ok){
      clearAgentRun();   // 全部完成 → 清档；取消/失败 → 留着（continueAgentRun 可续）
      /* v3.7.117：跑完就把 goals 里那份也收尾（complete_goal 的同一语义）——
         否则刷新后 agentContextPrompt 会永远显示"请继续执行"，而实际早已跑完。 */
      try{ completeGoal(r.summary || ""); }catch(_e){}
    }
    /* 自主执行跑通的流程 = 一条现成的可复用技能候选（与对话路径同一套机制、同一个门槛） */
    const trace = r.results.filter(function(x){ return !x.blocked; }).map(function(x){
      return { name: x.step.tool, args: Object.keys(x.step.args || {}).slice(0, 8), ok: x.ok };
    });
    try{
      const offer = noteSkillOffer(trace, p.text);
      if(offer) toast(t("skills.offerToast","本轮成功执行了 ")+offer.steps.length
        +t("skills.offerToastMid"," 个工具调用。发送「存为技能」即可把这条流程固化成可复用技能（命令面板 Ctrl+K 的「技能」组也能一键保存）。"),"ok");
    }catch(_e){ /* 候选提示失败不影响已完成的执行 */ }
    AppBridge.render();
  }catch(e){
    hist.push({ role:"assistant", content: String((e && e.message) || e), _failed: true });
  }finally{
    chatProgressEnd();
    showChatThinking(false);
    if(chatController && chatController.timer) clearTimeout(chatController.timer);
    chatController = null;
    trimChatHist(hist);
    save(PREFIX+"chat_"+sc, hist); renderChat(); scrollChat();
  }
  return true;
}

/** 取消待确认的计划（用户的其他输入照常记进历史，与 cancelPendingDanger 同形） */
function cancelAgentPlan(userText){
  const goal = pendingAgentPlan && pendingAgentPlan.plan ? pendingAgentPlan.plan.goal : "";
  const hist = getChat(active);
  if(hist.length && hist[hist.length-1].role === "assistant" && !hist[hist.length-1].tool_calls) hist.pop(); // 移除待确认的计划
  hist.push({ role:"user", content: userText });
  hist.push({ role:"assistant", content: t("aiagent.planCancelled","已取消该执行计划：")+goal });
  pendingAgentPlan = null;
  trimChatHist(hist);
  save(PREFIX+"chat_"+active, hist); renderChat(); scrollChat(); AppBridge.render();
}
/**
 * A2：关闭危险操作确认模态框（若存在）
 * @returns {boolean} 是否关闭了模态框（供 ESC 链式关闭判断）
 * 2026-10-20：确认框本体已交回通用组件 dangerConfirm（真浮层 .viz-modal），
 * 这里只剩转发 —— 调用方（ui-hotkeys 的 Esc 链、场景切换清理）语义不变。
 */
function closeConfirmModal(){
  return dismissDangerConfirm();
}
/**
 * A2：打开危险操作确认模态框（替代纯打字确认；打字确认保留一个版本兼容）
 */
function openConfirmModal(){
  if(!pendingConfirm) return;
  /* v3.7.52：op 标签覆盖非危险工具（关闭「自动确认非危险操作」时，批次里可能是任意工具） */
  const ops = pendingConfirm.toolCalls.map(c=> c.name==="delete_task"?t("ai.deleteTask","删除任务"):(c.name==="update_task"?t("ai.editTask","修改任务"):c.name));
  const uniq = [...new Set(ops)];
  const title = pendingConfirm.title;
  dangerConfirm({
    title: t("ai.confirmDangerTitle","危险操作确认"),
    message: t("ai.confirmDangerPrefix","AI 助手请求执行")
      + uniq.join(t("ai.confirmJoinSep","、")) + t("ai.confirmDangerColon","：") + title,
    detail: t("ai.confirmDangerHint","确认后不可撤销（删除会进入回收站）。也可以在聊天框发送「确认」继续。"),
    confirmText: t("ai.confirmExecute","确认执行"),
  }).then(ok=>{
    /* dismiss(false) 也会由「打字确认」路径的 closeConfirmModal() 触发 —— 那时 pendingConfirm
       已被消费，绝不能再补一条「已取消」，否则确认成功后又冒出取消回执。 */
    if(ok) return confirmPendingDanger();
    if(pendingConfirm) cancelPendingDanger(t("common.cancel","取消"));
  });
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
  /* v3.7.59：技能段与 Agent 模式正交（技能描述的是工具用法，cfg.agent=false 时工具仍在），
     故两条分支都追加；无启用技能时 skillsPromptBlock 返回空串，提示与改动前逐字节一致。 */
  const skillsCtx = skillsPromptBlock(userText);
  if(cfg && cfg.agent === false){
    return base
      +t("ai.sysPromptTool","\\n你可以调用工具来创建、修改、删除任务，查询与搜索工坊数据，需要时直接调用。")
      +agentContextPrompt(userText)
      +skillsCtx;
  }
  return base
    +t("ai.sysPromptTool","\\n你可以调用工具来创建、修改、删除任务，查询与搜索工坊数据，需要时直接调用。")
    +t("ai.sysPromptRemember","用户的事实/偏好/决定用 remember 存入工作记忆；多步任务先用 plan 建立目标与步骤，再逐步执行并用 complete_step/complete_goal 收尾。")
    +agentContextPrompt(userText)
    +skillsCtx;
}
/**
 * v3.7.59：把一段文本送进右侧聊天面板并提交（命令面板「技能」组一键触发用）。
 * 走真实表单提交路径，因此 onChatSubmit 的全部拦截（技能展开、待确认危险操作、RAG 注入）都照常生效。
 * @param {string} text - 要发送的用户消息
 * @returns {boolean} 是否成功提交
 */
function sendChatText(text){
  const s = String(text || "").trim();
  if(!s) return false;
  const el = $("#chatTextInput");
  const form = $("#chatForm");
  if(!el || !form) return false;
  el.value = s;
  el.dispatchEvent(new Event("input", {bubbles:true}));
  if(form.requestSubmit) form.requestSubmit();
  else form.dispatchEvent(new Event("submit", {cancelable:true}));
  return true;
}
async function onChatSubmit(e){
 try{
  e.preventDefault();
  const f=e.target; const text=f.msg.value.trim(); if(!text) return;
  f.msg.value="";
  const sc = active; /* v3.7.71 竞态修复：入口定格场景，长 await 期间切场景不串写 */
  const hist=getChat(sc);
  // ② 拦截待确认的危险操作（不与模型交互）；A2：打字确认保留一个版本兼容
  if(pendingConfirm){
    if(pendingConfirm.sc!==active){ pendingConfirm=null; closeConfirmModal(); }
    else {
      const yes=/^(确认|确定|执行|yes|confirm|y|ok)$/i.test(text.trim());
      if(yes){ await confirmPendingDanger(); } else { cancelPendingDanger(text); }
      return;
    }
  }
  /* v3.7.59：Agent 计划的评审态（命令面板「让 AI 自主完成」产出）——与上面同形，
     只有「确认执行」才落地，任何别的内容取消，绝不在用户没说确认时动数据。 */
  if(pendingAgentPlan){
    if(pendingAgentPlan.sc !== active){ pendingAgentPlan = null; }
    else {
      const yes = /^(确认执行|确认|确定|执行|yes|confirm|run|y)$/i.test(text.trim());
      if(yes){ await confirmAgentPlan(); } else { cancelAgentPlan(text); }
      return;
    }
  }
  /* v3.7.116：未完成执行的续跑指令（盘上有 agent_run 时才拦）。
     「继续执行」从下一步接着跑（done 里的不重跑）；「放弃执行」连盘上记录一起清。
     放在记忆指令之前：这两个指令与待续运行一一对应，不该被别的拦截抢走。 */
  if(agentRunPending()){
    const contHit = /^(继续执行|继续|接着执行|续跑|resume|continue)$/i.test(text.trim());
    const dropHit = /^(放弃执行|放弃|取消执行|discard|abort\s*run)$/i.test(text.trim());
    if(contHit || dropHit){
      hist.push({ role:"user", content:text });
      if(dropHit){
        const p = agentRunPending();
        discardAgentRun();
        /* v3.7.117：放弃执行 = goals 里那份也作废（cancel_goal 语义）——
           否则它会以 active 挂在存储里，每轮对话都注入"请继续执行第 N 步"，
           而用户早就放弃了。agent_run 与 goals 是同一目标的两个视角，放弃要两个一起清。 */
        try{ cancelGoal(); }catch(_e){}
        hist.push({ role:"assistant", content: t("aiagent.runDiscarded","已放弃未完成的执行（第 ")+(p.done+1)+t("aiagent.runDiscardedMid","/共 ")+p.total+t("aiagent.runDiscardedEnd"," 步）；已完成的步骤保留，随时可以用「>」重新开始。") });
      }else{
        showChatThinking(true);
        let r = null;
        try{ r = await continueAgentRun(); }catch(e){ r = { ok:false, executed:0, summary:String((e && e.message) || e) }; }
        showChatThinking(false);
        hist.push({ role:"assistant", content: r.cancelled
          ? t("aiagent.runCancelled","已暂停。")+agentRunNotice()
          : (r.summary || t("aiagent.runDone","续跑完成")) });
      }
      trimChatHist(hist);
      save(PREFIX+"chat_"+sc, hist); renderChat(); scrollChat(); AppBridge.render();
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
    save(PREFIX+"chat_"+sc, hist); renderChat(); scrollChat();
    return;
  }
  /* v3.7.59 Skills ①：「存为技能 [名字]」——把上一轮成功执行的工具流程固化成可复用技能（不走模型，确定可靠）。
     同时接受英文 save (as) skill，因为命令面板发出的文本随界面语言变化。
     ⚠️ 命令词后必须紧跟冒号、空白或到此为止（(?:[:：]\s*|\s+|$)），否则「保存技能说明文档」这类
     正常句子会被吞掉。 */
  const skillSaveHit = /^(?:存为技能|保存为技能|存成技能|保存技能|save(?:\s+as)?\s+skill)(?:\s*[:：]\s*|\s+|$)(.*)$/i.exec(text);
  if(skillSaveHit){
    const r = commitPendingSkill((skillSaveHit[1] || "").trim());
    hist.push({role:"user", content:text});
    hist.push({role:"assistant", content: r
      ? t("skills.savedPrefix","已把上一轮流程固化为技能「")+r.name
        +t("skills.savedSuffix","」。它会在每轮对话注入系统提示，也可在命令面板（Ctrl+K）「技能」组一键触发；到「扩展 → 技能配置」可直接编辑或删除。")
      : t("skills.noOffer","当前没有可固化的流程：需要上一轮对话成功执行 ≥2 个工具调用（删除/修改类工具不计入）。")});
    trimChatHist(hist);
    save(PREFIX+"chat_"+sc, hist); renderChat(); scrollChat();
    return;
  }
  /* v3.7.59 Skills ②：「技能：X」/「用技能 X」显式触发。
     只有 X 精确对上已启用技能的名字或触发词才拦截（findSkill 返回 null 就原样走正常路径），
     所以「技能树怎么加点」这类普通输入不会被吞。 */
  let outbound = text;
  const skillRunHit = /^(?:用|执行|运行|调用)?\s*(?:技能|skill)(?:[:：]\s*|\s+)(.+)$/is.exec(text);
  if(skillRunHit){
    const sk = findSkill((skillRunHit[1] || "").trim());
    if(sk){
      outbound = text + "\n\n" + t("skills.runWrapPrefix","（请立即按已定义技能「")+sk.name
        + t("skills.runWrapMid","」执行：")+sk.prompt
        + (sk.tools.length ? t("skills.runWrapTools","；优先使用工具：")+sk.tools.join(", ") : "")
        + t("skills.runWrapSuffix","。）");
    }
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
    save(PREFIX+"chat_"+sc, hist); renderChat(); scrollChat(); AppBridge.render();
    return;
  }
  // v1.4-D：自然语言操作拦截（"完成第一个任务" / "把数学任务标记为已完成" / "删除数学"）
  const actionHit = parseNaturalLanguageAction(text);
  if(actionHit && actionHit.hit){
    const r = executeNaturalLanguageAction(actionHit);
    hist.push({role:"user", content:text});
    hist.push({role:"assistant", content: r.ok ? r.msg : t("ai.opFail","操作失败：")+r.msg});
    trimChatHist(hist);
    save(PREFIX+"chat_"+sc, hist); renderChat(); scrollChat(); AppBridge.render();
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
  /* v3.7.59 (#19)：先把本轮查询向量备好 —— agentContextPrompt → recallMemories 是同步链，
     拿不到预置向量时它只会退回纯词法。传 outbound（与 chatSysPrompt 收的同一个串），
     否则「技能：X」触发时 key 对不上、语义召回静默失效。失败一律降级，绝不拦对话。 */
  await memPrimeQueryVector(outbound).catch(()=> false);
  const ragCtx = await ragInjectContext(text).catch(()=> "");
  /* v3.7.118：上下文滚动摘要 —— 超阈值时把最旧一段折成一次摘要（拼进 system），
     只发「摘要 + 最近 N 条」，token 成本从随轮数线性涨转为有界。
     失败/超时一律回退全量（降级路径优先于新功能）；本机历史不动（摘要只是发送投影）。 */
  const ctxSum = await maybeSummarizeHistory(hist, sc).catch(()=> null);
  /* v3.7.59：chatSysPrompt 收 outbound —— 「技能：X」时系统提示里的技能段会因整名命中把它排到第一条。
     未触发技能时 outbound === text，行为与改动前一致。 */
  const messages=[{role:"system", content:chatSysPrompt(outbound) + ragCtx + (ctxSum ? "\n\n" + ctxSum.block : "")}]
    // B1 修复：保留完整结构（含 tool_calls / tool_call_id），否则含工具调用的会话第二轮会缺 id 触发 400
    .concat(hist.slice(ctxSum ? ctxSum.covered : 0).map(m=>({...m})));
  /* v3.7.59：触发技能时，把**发出去**的最后一条 user 消息换成展开版（附上该技能的做法与建议工具）。
     hist 里仍存用户原话 —— 界面与历史记录不被一大段指令污染，模型也确实收到"按这个流程做"。 */
  if(outbound !== text){
    for(let mi=messages.length-1; mi>=0; mi--){
      if(messages[mi] && messages[mi].role === "user"){ messages[mi].content = outbound; break; }
    }
  }
  await runChatLoop(messages, hist, sc);
  }catch(err){ const m=(err&&err.message)?err.message:String(err); pushDiag("error", m, {where:"onChatSubmit"}); try{ toast(t("ai.chatError","对话出错：")+m, "error"); }catch(e2){} }
}
/* v3.7.72 token 优化：超长工具结果截断（>2400 字符取头 + 注明全长），模型只需关键字段 */
function _cutToolRes(r){ return (typeof r==="string" && r.length>2400) ? r.slice(0,2400)+"…(截断，共 "+r.length+" 字符)" : r; }
async function runChatLoop(messages, hist, sc){
  sc = sc || active; /* v3.7.71 竞态修复：长循环期间切场景不串写，数据键用定格场景 */
  // T3.1：创建控制器 + 记录上次请求（重试用）+ 显示思考中
  chatController=createChatController();
  lastChatRequest={ messages:messages, hist:hist, sc:sc };
  /* v3.7.132：发送前估算入账（估算/策略早已在，这里补「可观测」；向下调用 ai-tools，方向合法） */
  if(typeof recordSendEstimate === "function") recordSendEstimate(messages);
  showChatThinking(true);
  let turnUserText = ""; /* catch 分支也要写 _prompt，故声明在 try 外 */
  try{
    let guard=0;
    let maxLoops = activeGoal()? AGENT_GOAL_LOOP_MAX : 6; // 目标激活时放宽循环，支撑多步自主执行
    const acfg = getCfg()||{};
    if(!activeGoal()){ const n=Number(acfg.agentLoops); if(isFinite(n)&&n>=6&&n<=30) maxLoops=Math.round(n); }
    else { const n=Number(acfg.agentGoalLoops); if(isFinite(n)&&n>=12&&n<=50) maxLoops=Math.round(n); }
    const toolWhitelist = toolWhitelistSet(acfg); // v3.7.59：与 executeAgentPlan 同一来源，别再各写一份解析
    const autoConfirm = !(acfg.agentAutoConfirm===false);
    /* v3.7.59 Skills ③：采集本轮的工具执行结果，循环结束后判断是否值得固化成技能。
       turnUserText 取 messages 里最后一条 user —— 工具执行只追加 assistant/tool 角色，
       所以循环结束时它仍是本轮的用户输入（打字确认路径下会是「确认」，用户可自行命名）。 */
    const skillTrace = [];
    turnUserText = "";
    for(let mi=messages.length-1; mi>=0; mi--){
      if(messages[mi] && messages[mi].role === "user"){ turnUserText = String(messages[mi].content || ""); break; }
    }
    while(guard++<maxLoops){
      // v3.7.52：每轮重置超时——超时语义应是「单次请求超时」，而不是「整段循环总预算」
      if(chatController && chatController.resetTimeout) chatController.resetTimeout();
      // T5.3 浏览器兼容：chatController.ac 可为 null（AbortController 不可用），此时不传 signal
      const chatSignal = (chatController && chatController.ac) ? chatController.ac.signal : undefined;
      // v3.2 C-档：流式打字机——纯文本轮（无工具调用压力）边收边渲染：流式中先挂一条 _streaming 消息增量更新，
      // 完成后用真实结果替换。工具调用轮不启用（避免半截 tool_calls 状态污染 hist）。
      let streamMsg = null;
      let streamReceived = 0;
      const canStream = !acfg.enabled; // 工具模式（tools 数组在）下走流式需拼 tool_calls delta，先保守关（v3.2 C-档）
      if(canStream) chatProgressStart("stream", t("chat.progress.generating", "正在生成…"), 0);
      const j = await chatOnce(messages, {
        signal: chatSignal,
        onChunk: canStream ? function(chunkText){
          try{
            if(!streamMsg){
              streamMsg = { role: "assistant", content: "", _streaming: true, _prompt: turnUserText };
              hist.push(streamMsg);
            }
            streamMsg.content += chunkText;
            streamReceived += String(chunkText || "").length;
            chatProgressUpdate({ received: streamReceived });
            AppBridge.render();
          }catch(_e){ /* 渲染异常不阻断流 */ }
        } : undefined
      });
      if(canStream) chatProgressEnd();
      if(streamMsg){
        // 流式占位消息移除，由下方真实 hist.push 接管
        const idx = hist.indexOf(streamMsg);
        if(idx >= 0) hist.splice(idx, 1);
      }
      const msg = j.choices && j.choices[0] && j.choices[0].message;
      if(!msg) throw new Error(t("ai.emptyResponse","空响应"));
      if(msg.tool_calls && msg.tool_calls.length){
        // v3.7.59：清单收口到 ai-tools.js 的 DANGER_CONFIRM_TOOLS（此前这里各写一份，Agent 计划路径没走它）
        // v3.7.59：args 走 _parseToolArgs —— 模型给的 JSON 可能非法，返回 null 由下方按「参数非法」回执
        const calls = msg.tool_calls.map(tc=>({name:tc.function.name, id:tc.id, args:_parseToolArgs(tc.function.arguments)}));
        const hasDanger = calls.some(c=>isDangerTool(c.name));
        /* v3.7.52：危险操作**始终**需用户确认。原实现把这段挂在 `if(autoConfirm)` 上，而
           autoConfirm = !(cfg.agentAutoConfirm===false) —— 于是把设置里「自动确认非危险操作」
           关掉反而变成「危险操作免确认」（语义反向，且反向到**更不安全**的那侧；实测还有
           「既不弹窗也不执行、空转 maxLoops 轮」的第三态）。
           现在开关只按字面作用于非危险批次：关闭时非危险的工具调用也要先确认。 */
        if(hasDanger || !autoConfirm){
          // ② 危险操作：整体延后到用户确认后执行，避免半截工具回执引发下一轮 400
          // v3.7.59：args 可能为 null（模型给了非法 JSON）→ 用 {} 兜底取标题，执行环节会跳过并回执
          const titles = calls.map(c=>{ const a=c.args||{}; const ft=findTask(a.task_id); return ft? ft.task.title : a.task_id; }).filter(Boolean);
          const titleText = titles.join(t("ai.confirmJoinSep","、"));
          pendingConfirm={ toolCalls:calls, title:titleText||t("ai.unknownTask","未知任务"), assistantMsg:msg, sc:sc };
          hist.push({role:"assistant", content: hasDanger
            ? t("ai.pendingConfirm","（待确认）将执行删除/修改操作：「")+(titleText||t("ai.unknown","未知"))+t("ai.pendingConfirmSuffix","」。发送「确认」以继续，其他内容取消。")
            : t("ai.pendingConfirmTools","（待确认）将执行 ")+calls.length+t("ai.pendingConfirmToolsSuffix"," 个工具调用。发送「确认」以继续，其他内容取消。"), _prompt: turnUserText});
          AppBridge.render(); openConfirmModal(); break; // A2：同时弹出确认模态框
        }
        // 工具白名单过滤
        if(toolWhitelist){
          const allowed = calls.filter(c=>toolWhitelist.has(c.name));
          const denied = calls.filter(c=>!toolWhitelist.has(c.name));
          /* v3.7.52：本分支三处修复——
             ① calls 构造时 args 已 JSON.parse 成对象（见上方 map），原实现又 JSON.parse(c.args)，
                必然抛「"[object Object]" is not valid JSON」→ 白名单一开，所有工具都不执行；
             ② 原实现「有任一被拒」就 continue，把同一轮里**允许**的调用一并丢弃；
             ③ 被拒调用原以 assistant 文本充当回执，缺 role:"tool" 应答，真 API 会 400。
             现改为：允许与被拒都按 tool_call_id 正常回执，允许的照常执行。 */
          messages.push(msg); hist.push(msg);
          denied.forEach(c=>{
            const denyMsg=t("ai.toolDeniedPrefix","工具 ")+c.name+t("ai.toolDeniedSuffix"," 不在当前允许列表中，已跳过。");
            const tm={role:"tool", tool_call_id:c.id, content:JSON.stringify({ok:false, msg:denyMsg}), _disp:denyMsg, _tool_denied:true};
            messages.push(tm); hist.push(tm);
          });
          for(let ci=0; ci<allowed.length; ci++){
            const c = allowed[ci];
            /* v3.7.59：取消即刻生效——剩余调用不再执行，补「已跳过」回执后退出循环 */
            if(_chatCancelled()){
              for(let k=ci; k<allowed.length; k++) _pushSkippedToolReceipt(messages, hist, allowed[k].id, allowed[k].name);
              throw new Error("__USER_CANCEL__");
            }
            const args=c.args;
            /* v3.7.59：参数非法的调用不执行，只回执 —— 让模型下一轮自行修正 */
            if(args === null){
              _pushBadArgsToolReceipt(messages, hist, c.id, c.name);
              continue;
            }
            /* v3.7.52：走统一入口 execToolAuto —— 异步工具（联网/代码/SQL）在 chat 路径也能真正执行 */
            const res=await execToolAuto(c.name, args);
            skillTracePush(skillTrace, c.name, args, res); // v3.7.59 Skills：记录本轮流程
            const tm={role:"tool", tool_call_id:c.id, content:_cutToolRes(res), _disp:t("ai.toolPrefix","工具 ")+c.name+"("+JSON.stringify(args)+") → "+res};
            messages.push(tm); hist.push(tm);
          }
          AppBridge.render(); continue;
        }
        // 无危险：完整 assistant + tool（含 tool_calls / tool_call_id）入 hist，B1 安全
        messages.push(msg); hist.push(msg);
        chatProgressStart("tool", t("chat.progress.tool", "执行工具…"), msg.tool_calls.length);
        for(let ti=0; ti<msg.tool_calls.length; ti++){
          const tc = msg.tool_calls[ti];
          /* v3.7.59：取消即刻生效——剩余调用不再执行，补「已跳过」回执后退出循环 */
          if(_chatCancelled()){
            for(let k=ti; k<msg.tool_calls.length; k++)
              _pushSkippedToolReceipt(messages, hist, msg.tool_calls[k].id, msg.tool_calls[k].function.name);
            throw new Error("__USER_CANCEL__");
          }
          const args=_parseToolArgs(tc.function.arguments);
          /* v3.7.59：参数非法（截断/尾随逗号/单引号…）不执行、不抛裸 SyntaxError，
             改为回执给模型让它下一轮修正 —— 原实现会让整段多步循环直接中断。 */
          if(args === null){
            _pushBadArgsToolReceipt(messages, hist, tc.id, tc.function.name);
            continue;
          }
          /* v3.7.52：统一入口 —— 异步工具（web_search/web_fetch/code_run/sql_query）
             此前在 chat 路径只拿到「未知工具」，与 Agent 计划路径行为不一致 */
          const res=await execToolAuto(tc.function.name, args);
          skillTracePush(skillTrace, tc.function.name, args, res); // v3.7.59 Skills：记录本轮流程
          chatProgressUpdate({ current: ti + 1, label: t("chat.progress.toolName", "执行工具：") + tc.function.name });
          const tm={role:"tool", tool_call_id:tc.id, content:_cutToolRes(res), _disp:t("ai.toolPrefix","工具 ")+tc.function.name+"("+JSON.stringify(args)+") → "+res};
          messages.push(tm); hist.push(tm);
        }
        chatProgressEnd();
        AppBridge.render(); continue;
      }
      hist.push({role:"assistant", content:msg.content||t("label.noContent","(无内容)"), _prompt: turnUserText});
      break;
    }
    /* v3.7.59 Skills ③：本轮成功执行了 ≥2 个非破坏性工具 → 提示可把这条流程固化成技能。
       只是挂出候选（内存态）+ 一条 toast，不自动写盘：用户回「存为技能」或走命令面板才落库，
       避免把一次性偶发调用沉淀成噪声技能。 */
    try{
      const offer = noteSkillOffer(skillTrace, turnUserText);
      if(offer){
        toast(t("skills.offerToast","本轮成功执行了 ")+offer.steps.length
          +t("skills.offerToastMid"," 个工具调用。发送「存为技能」即可把这条流程固化成可复用技能（命令面板 Ctrl+K 的「技能」组也能一键保存）。"),"ok");
      }
    }catch(_e){ /* 固化提示失败不影响已完成的对话 */ }
  }catch(err){
    /* v3.7.52：取消/超时判定以**控制器上的 reason** 为准。
       原因：`ac.abort(reason)` 时浏览器 fetch 是以**传入的 reason 拒绝**的（name 是 "Error"，
       不是 "AbortError"）—— 原实现只认 `err.name==="AbortError"`，于是用户点「取消」会落进错误分支，
       把英文 "user-cancel" 当助手回复上屏（超时同理会显示 "timeout"）。 */
    const cReason = chatController ? chatController.reason : null;
    const isAbort = (err && err.name === "AbortError") || cReason === "user" || cReason === "timeout";
    if(isAbort && cReason !== "timeout"){
      // T3.1 用户主动取消：显示「已取消」提示（灰色斜体），不报错
      hist.push({role:"assistant", content:t("ai.cancelled","已取消"), _canceled:true, _prompt: turnUserText});
    } else if(isAbort){
      hist.push({role:"assistant", content:t("ai.timeout","请求超时（可在「设置 → AI」调大「请求超时」秒数）"), _failed:true, _prompt: turnUserText});
      try{ pushDiag("error", "chat timeout", {where:"runChatLoop"}); }catch(_e){}
    } else {
      const m=(err&&err.message)?err.message:String(err);
      hist.push({role:"assistant", content:m, _failed:true, _prompt: turnUserText});
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
    chatProgressEnd();
    if(chatController && chatController.timer){ clearTimeout(chatController.timer); }
    chatController=null;
    showChatThinking(false);
  }
  trimChatHist(hist);
  save(PREFIX+"chat_"+sc, hist);
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



/**
 * 右侧 AI 聊天面板未启用态：在 #chat 显示「尚未启用 AI」提示（替代原主内容区 chatCard 的未启用文案）
 * @returns {void}
 */
function renderChatDisabled(){
  const el=$("#chat"); if(!el) return;
  const s = SCENARIOS[active] || {name:""};
  el.innerHTML = sanitizeHtml(
    t("p3.html.aiGreetingPrefix","<div class=\"msg assistant\">你好，我是") + esc(s.name) +
    t("p3.html.aiGreetingSuffix","助手。尚未启用 AI：点击右上角「设置」填入 API Key，即可对话并调用工具修改数据。</div>")
  );
  /* v3.7.20：**移除「去配置」行动条**（用户 2026-09-23 截图标注"去掉"）。
     历史：v3.7.18 把按钮从消息流末位移到输入框上方做成常驻状态条，
     但那条 87px 高的条会挤压输入区 —— CI e2e 在 1280×800 下报
     "waiting for element to be visible, enabled and stable" 超时（发送按钮位置不稳）。
     且提示消息本身已写明"点击右上角「设置」填入 API Key"，按钮属重复引导。
     → 整条删除，只保留提示气泡。 */
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
        /* v3.7.29：去掉文案后的 "⚠"（用户："如果未配置大模型，就应该显示「未配置」"）。
           告警感由 .chat-model-empty 的虚线边框承担，文字保持干净。 */
        modelSelect.innerHTML = sanitizeHtml(`<option value="">${t("msg.notConfigured","未配置")}</option>`);
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
  /* 窄屏（≤767）面板是右抽屉：#chatPanelCollapse 与外部 AI 入口都走「打开/关闭抽屉」，不是折叠历史 */
  const setChatDrawer=(open)=>{
    panel.classList.toggle("show", open);
    if(open) panel.classList.remove("collapsed");
    const bd=$("#chatBackdrop");
    if(bd){ bd.hidden=!open; bd.classList.toggle("show", open); }
  };
  const toggleCollapse=()=>{
    if((window.innerWidth||0) < 768){ setChatDrawer(!panel.classList.contains("show")); return; }
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
    if((window.innerWidth||0) < 768){ setChatDrawer(true); return; }
    if(panel.classList.contains("collapsed")){ toggleCollapse(); }
  };
  /* 抽屉的关闭路径：点遮罩 / Esc（仅窄屏生效；桌面坞不受影响） */
  const _chatBd=$("#chatBackdrop");
  if(_chatBd) _chatBd.onclick=()=> setChatDrawer(false);
  document.addEventListener("keydown",(e)=>{
    if(e.key==="Escape" && (window.innerWidth||0) < 768 && panel.classList.contains("show")) setChatDrawer(false);
  });
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
  /* 布局 v2（2026-10-21）：默认收起由 HTML 的 .collapsed 兜底；仅当用户显式选过「展开」时移除。
     load() 自带损坏兜底不会抛，这里不需要 try/catch。 */
  if(load(PREFIX+"chat_panel_collapsed", null) === "0"){
    panel.classList.remove("collapsed");
    if(rail) rail.classList.remove("show");
  }
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
        const _bd=$("#chatBackdrop"); if(_bd){ _bd.hidden=true; _bd.classList.remove("show"); }
      }
    };
    applyResponsive();
    const debouncedResize=(typeof debounce==="function") ? debounce(applyResponsive,200) : applyResponsive;
    window.addEventListener("resize", debouncedResize);
  }
  renderAiReceipts();
  return true;
}
/* v3.2 IA：场景内"问 AI 助手"入口
 * 点击 #phAiAskBtn → 聚焦右侧聊天面板 + 预填场景上下文提示。
 * AI 不再只是聊天面板里的机器人，而是与每个场景并列的一等入口。 */
function askAiAboutScene(sc, hintKey){
  /* v3.2.1 修复：sc 可空（系统概况卡 / 命令面板等入口）——"无场景"模式只展开面板 + 焦点，不预填场景提示
     v3.2.1 兼容：sc 传非法 key（不在 SCENARIOS 中）也走"无场景"模式，不直接 return，避免静默无响应 */
  const s = sc ? SCENARIOS[sc] : null;
  /* 就绪判定走 profiles（R-32）：顶层 base/key 在迁移后已不存在 */
  if(!(typeof aiReadyProfile === "function" && aiReadyProfile())){
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
/* ---------- AI 改动回执条（PRODUCT §7.3：改动可见、可撤销） ----------
 * 动态挂载进 #chatPanel（不改 HTML 骨架），最多展示最近 3 条未撤销的 AI 写操作。 */
function renderAiReceipts(){
  const panel = document.getElementById("chatPanel");
  if(!panel) return;
  let box = document.getElementById("aiReceipts");
  const list = (typeof aiUndoList === "function") ? aiUndoList().filter(x=>!x.undone).slice(0,3) : [];
  if(!list.length){ if(box) box.remove(); return; }
  if(!box){
    box = document.createElement("div");
    box.id = "aiReceipts";
    box.setAttribute("role","status");
    box.style.cssText = "display:flex;flex-direction:column;gap:2px;padding:6px 12px;border-top:1px solid var(--line);background:color-mix(in srgb,var(--panel2) 70%,transparent)";
    const inputArea = panel.querySelector(".chat-input-area");
    panel.insertBefore(box, inputArea || null);
    box.addEventListener("click", (e)=>{
      const b = e.target.closest ? e.target.closest("[data-ai-undo]") : null;
      if(!b) return;
      const r = undoAiAction(b.getAttribute("data-ai-undo"));
      toast(r.ok ? t("ai.undo.ok", "已撤销") : (r.msg || t("ai.undo.fail", "撤销失败")), r.ok ? "ok" : "warn");
    });
  }
  const KIND = { create:t("ai.receipt.create", "创建"), update:t("ai.receipt.update", "更新"),
    complete:t("ai.receipt.complete", "完成"), delete:t("ai.receipt.delete", "删除"),
    record_add:t("ai.receipt.record", "资料"), note_add:t("ai.receipt.note", "笔记") };
  // lint-xss-ok: 插值全部经 esc()/t()；kind 走白名单字典，id 来自本地 uid()
  box.innerHTML = list.map(x=>{
    const label = KIND[x.kind] || t("ai.receipt.update", "更新");
    return '<span class="u-flex u-ai-center u-gap-1 u-fs-2xs">'
      + '<span class="u-text-muted">' + esc(t("ai.receipt.title", "AI 改动") + " · " + label) + '</span>'
      + '<b class="u-nowrap u-overflow-hidden u-ellipsis" style="max-width:160px">' + esc(x.title || "") + '</b>'
      + '<button type="button" class="btn-ghost u-fs-2xs" data-ai-undo="' + esc(x.id) + '">' + esc(t("ai.receipt.undo", "撤销")) + '</button>'
      + '</span>';
  }).join("");
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
  /* 就绪判定走 profiles（R-32） */
  if(!(typeof aiReadyProfile === "function" && aiReadyProfile())){
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
