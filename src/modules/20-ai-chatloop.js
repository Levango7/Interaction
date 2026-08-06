// ===== AI Layer (AI 层·对话循环) =====
/* ---------- AI 对话（带工具调用） ---------- */
/**
 * 单次 AI 对话调用（OpenAI 兼容协议）。Electron 模式经主进程代理；浏览器直连兜底
 * T3.1 增强：支持外部 signal（取消）、自动重试
 * 重试矩阵（与主进程 chat 对齐）：网络错误 / 429 / 5xx 退避重试；取消 / 超时 / 401 / 其他 4xx 不重试
 * @param {Array<{role:string,content:string,tool_calls?:Object[],tool_call_id?:string}>} messages
 * @param {{signal?:AbortSignal, retry?:number}} [opts] - signal 取消；retry 自动重试次数（默认 3）
 * @returns {Promise<Object>} OpenAI 风格的响应 JSON
 */
async function chatOnce(messages, opts){
  opts = opts || {};
  const maxRetry = (typeof opts.retry === "number") ? opts.retry : 3;
  try{
    const cfg=getCfg();
    const ap=getActiveProfile();
    const model=(ap && ap.model) || "gpt-4o-mini";
    const body={ model, messages, temperature:0.7 };
    if(cfg.enabled){ body.tools=TOOLS; body.tool_choice="auto"; }

    // Electron 模式：经主进程代理（Key 不进渲染进程/localStorage），一并规避 CORS（P0-3）
    if(isElectron()){
      return await window.electronAPI.chat(body);
    }

    // 浏览器 / Edge / 本地服务：直连兜底（P0-10：超时 + 错误分级）
    const base=((ap && ap.base) || "https://api.openai.com/v1").replace(/\/+$/,"");
    // 重试矩阵（与 electron/main.js 主进程 chat 对齐）：网络错误(TypeError)/429/5xx 退避重试，
    // 间隔 1s*(attempt+1)；AbortError/TimeoutError/401/其他 4xx 不重试
    let lastErr=null;
    for(let attempt=0; attempt<maxRetry; attempt++){
      try{
        const fetchOpts={
          method:"POST", headers:{"Content-Type":"application/json","Authorization":"Bearer "+(ap?ap.key:"")},
          body:JSON.stringify(body)
        };
        // 外部 signal 优先（取消）；否则用 30s 超时
        // T5.3 浏览器兼容：AbortSignal.timeout 在旧浏览器无之，try/catch 守卫；signal 不可用时不挂 signal（fetch 无超时但不崩）
        if(opts.signal){ fetchOpts.signal=opts.signal; }
        else {
          try{
            if(typeof AbortSignal !== "undefined" && AbortSignal && typeof AbortSignal.timeout === "function"){
              fetchOpts.signal=AbortSignal.timeout(30000);
            }
          }catch(e){ /* AbortSignal.timeout 不可用：不挂 signal，fetch 走默认无超时 */ }
        }
        const r=await fetch(base+"/chat/completions", fetchOpts);
        if(!r.ok){
          if(r.status===401) throw new Error("API Key 无效，请检查设置中的 Key");
          // 429/5xx：与主进程 chat 一致的可恢复错误，退避重试；最后一次仍失败则抛分级错误
          if(r.status===429 || r.status>=500){
            if(attempt < maxRetry-1){
              await new Promise(function(res){ setTimeout(res, 1000*(attempt+1)); });
              continue;
            }
            if(r.status===429) throw new Error("请求过于频繁，稍后重试");
            throw new Error("服务异常，请稍后重试");
          }
          throw new Error("API 返回错误："+r.status);
        }
        // fallback：一次性 JSON（chatOnce 未请求 stream，服务端按非流式返回；
        // 历史 SSE 流式分支因服务端未返回 text/event-stream 而不可达，按 L2/L3 清理移除）
        return await r.json();
      }catch(err){
        // 取消 / 超时：不重试，直接抛出
        if(err && (err.name==="AbortError" || err.name==="TimeoutError")){
          if(err.name==="TimeoutError") throw new Error("请求超时（30 秒），请检查网络或上游服务");
          throw err;
        }
        // 网络错误（TypeError）：退避重试，间隔 1s*(attempt+1)（用 name 检查避免跨 realm instanceof 失效）
        if(err && (err.name === "TypeError" || err instanceof TypeError)){
          lastErr=err;
          if(attempt < maxRetry-1){
            await new Promise(function(res){ setTimeout(res, 1000*(attempt+1)); });
            continue;
          }
          throw new Error("无法连接 API（可能被跨域拦截）。请用本地服务模式启动（见 README 第四节），或在 Electron 版中使用内置代理");
        }
        // 其他错误（401/403/500 等已转 Error）：不重试，直接抛出
        throw err;
      }
    }
    throw lastErr || new Error("chatOnce: 重试耗尽");
  }catch(e){
    // 用户主动取消：静默传播（不 toast 噪声），由 runChatLoop 显示「已取消」
    if(e && e.name==="AbortError") throw e;
    // 对话异常：诊断 + 提示，重新抛出由上层（runChatLoop/fetchCoachAdvice）处理，保持原有错误传播契约
    pushDiag("error", "chatOnce error: "+(e&&e.message||e), {where:"chatOnce"});
    try{ toast("对话异常："+(e&&e.message||"未知错误"), "error"); }catch(e2){ /* toast 不可用时静默降级 */ }
    throw e;
  }
}
