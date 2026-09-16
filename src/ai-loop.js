// ===== AI Layer (AI 层·对话循环) =====
/* ---------- v1.4-D AI 能力增强：自然语言解析 ---------- */
/**
 * 中文数字转阿拉伯数字（一→1，二→2，…，十→10，十一→11，二十→20）
 * @param {string} s
 * @returns {number}
 */
function _cn2num(s){
  const map = {"一":1,"二":2,"三":3,"四":4,"五":5,"六":6,"七":7,"八":8,"九":9,"十":10};
  if(/^\d+$/.test(s)) return parseInt(s,10);
  if(s==="十") return 10;
  if(s.startsWith("十")) return 10 + (map[s[1]]||0);
  if(s.endsWith("十")) return (map[s[0]]||0) * 10;
  if(s.length===3 && s[1]==="十") return (map[s[0]]||0)*10 + (map[s[2]]||0);
  return map[s] || 0;
}
/**
 * v1.4-D：自然语言建任务解析
 * 从用户文本中解析出任务字段（title/scenario/due/priority）
 * 支持格式：
 *   - "帮我建个任务：明天下午3点复习数学"
 *   - "建任务 下周一开会"
 *   - "创建任务 紧急 写代码"
 *   - "添加任务 跑步"
 * @param {string} text - 用户输入文本
 * @returns {{hit:boolean, title?:string, scenario?:string, due?:string, priority?:string, raw?:string}}
 */
function parseNaturalLanguageTask(text){
  const raw = String(text===null||text===undefined?"":text).trim();
  if(!raw) return {hit:false};
  // 检测建任务意图：帮我建个任务 / 建任务 / 创建任务 / 添加任务 / 新建任务 / 新增任务
  // 命中后取冒号或空格后的内容作为 body
  const intentRegex = /(?:帮我|请|给我|要)?\s*(?:建|创建|新建|添加|新增|做)\s*(?:个|一个)?\s*(?:任务|待办|todo)?\s*[:：]?\s*(.*)/i;
  const m = raw.match(intentRegex);
  if(!m || !m[1] || !m[1].trim()) return {hit:false};
  let body = m[1].trim();
  // 去掉结尾的"任务/待办"
  body = body.replace(/(?:任务|待办)$/,"").trim();
  if(!body) return {hit:false};

  // 解析场景（按优先级匹配，先匹配更具体的）
  let scenario = "office"; // 默认办公
  if(/数学|复习|学习|读书|背单词|做作业|听课|预习|考试|课程|笔记|英语|物理|化学|历史|地理|生物|政治|考研|作业/.test(body)){
    scenario = "study";
  } else if(/跑步|健身|运动|锻炼|游泳|瑜伽|散步|骑车|打球|减肥|早睡|喝水|体检|做饭|购物|买菜|洗衣服|打扫|理发|看病|吃药/.test(body)){
    scenario = "life";
  } else if(/写代码|编程|算法|开发|调试|重构|测试代码|实现|提交代码|code|bug|接口|前端|后端|数据库|部署|上线|优化性能/.test(body)){
    scenario = "code";
  } else if(/开会|报告|交付|周报|月报|汇报|邮件|文档|合同|审批|预约|出差|面试|培训|演示|演讲|总结|计划|安排/.test(body)){
    scenario = "office";
  }

  // 解析日期
  let due = "";
  const dayMap = {"一":1,"二":2,"三":3,"四":4,"五":5,"六":6,"日":0,"天":0};
  if(/今天|今日/.test(body)){
    due = shiftDay(0);
  } else if(/大后天/.test(body)){
    due = shiftDay(3);
  } else if(/后天/.test(body)){
    due = shiftDay(2);
  } else if(/明天|明日/.test(body)){
    due = shiftDay(1);
  } else if(/下周[一二三四五六日天]/.test(body)){
    const mm = body.match(/下周([一二三四五六日天])/);
    if(mm){
      const target = dayMap[mm[1]];
      const now = new Date(); const cur = (now.getDay()+6)%7;
      let diff = target - cur + 7;
      if(diff <= 0) diff += 7;
      due = shiftDay(diff);
    }
  } else if(/这周|本周/.test(body) && /周[一二三四五六日天]/.test(body)){
    const mm = body.match(/周([一二三四五六日天])/);
    if(mm){
      const target = dayMap[mm[1]];
      const now = new Date(); const cur = (now.getDay()+6)%7;
      let diff = target - cur;
      if(diff < 0) diff += 7;
      due = shiftDay(diff);
    }
  } else if(/周[一二三四五六日天]/.test(body) && !/下周|这周|本周/.test(body)){
    const mm = body.match(/周([一二三四五六日天])/);
    if(mm){
      const target = dayMap[mm[1]];
      const now = new Date(); const cur = (now.getDay()+6)%7;
      let diff = target - cur;
      if(diff < 0) diff += 7;
      due = shiftDay(diff);
    }
  }

  // 解析优先级
  let priority = ""; // 默认低（空字符串）
  if(/紧急|急|立刻|马上|asap|p0/i.test(body)){
    priority = "P0";
  } else if(/重要|优先|p1/i.test(body)){
    priority = "P1";
  } else if(/一般|普通|不急|p2/i.test(body)){
    priority = "P2";
  }

  // 清理 title：移除时间词、优先级词、场景通用词
  let title = body;
  // 移除日期相关词
  title = title.replace(/大后天|后天|明天|明日|今天|今日/g, "");
  title = title.replace(/下周([一二三四五六日天])/g, "");
  title = title.replace(/(?:这周|本周)?周([一二三四五六日天])/g, "");
  // 移除具体时间（上午/下午/晚上 + 点/分）
  title = title.replace(/(?:上午|下午|晚上|中午|早上|凌晨|傍晚|夜间)\s*\d{1,2}\s*(?:点|:|：)\s*\d{0,2}\s*(?:分)?/g, "");
  title = title.replace(/(?:上午|下午|晚上|中午|早上|凌晨|傍晚|夜间)\s*\d{1,2}\s*(?:点|:|：)/g, "");
  title = title.replace(/(?:上午|下午|晚上|中午|早上|凌晨|傍晚|夜间)/g, "");
  title = title.replace(/\d{1,2}\s*(?:点|:|：)\s*\d{0,2}\s*(?:分|半)?/g, "");
  // 移除优先级词
  title = title.replace(/紧急|急|立刻|马上|重要|优先|一般|普通|不急/g, "");
  // 移除残留的"任务/待办"
  title = title.replace(/(?:任务|待办)/g, "");
  // 清理多余空格和标点
  title = title.replace(/[\s,，、;；:：]+/g, " ").trim();
  title = title.replace(/^[:：、,，\s]+|[:：、,，\s]+$/g, "").trim();

  // 如果 title 为空，用原始 body
  if(!title) title = body;

  return {hit:true, title, scenario, due, priority, raw};
}

/**
 * v1.4-D：自然语言操作解析
 * 从用户文本中解析出对任务的操作（完成/删除）
 * 支持格式：
 *   - "完成第一个任务" / "完成第二个任务"
 *   - "把数学任务标记为已完成" / "标记数学任务为已完成"
 *   - "完成数学" / "完成数学任务"
 *   - "删除数学" / "把数学任务删除"
 * @param {string} text - 用户输入文本
 * @returns {{hit:boolean, action?:string, target?:string, n?:number, raw?:string}|{hit:false}}
 */
function parseNaturalLanguageAction(text){
  const raw = String(text===null||text===undefined?"":text).trim();
  if(!raw) return {hit:false};

  // 完成第 N 个任务（"完成第一个任务" / "完成第2个任务"）
  const nthMatch = raw.match(/^完成第([一二三四五六七八九十\d]+)个(?:任务|待办)?$/);
  if(nthMatch){
    const n = _cn2num(nthMatch[1]);
    if(n > 0) return {hit:true, action:"complete_nth", n, raw};
  }

  // 把 XX 标记为已完成 / 标记 XX 为已完成 / 将 XX 标记为已完成
  let m = raw.match(/^(?:把|将)\s*(.+?)\s*标记为已完成$/);
  if(m) return {hit:true, action:"complete", target:m[1].trim().replace(/(?:任务|待办)$/,"").trim(), raw};
  m = raw.match(/^标记\s*(.+?)\s*为已完成$/);
  if(m) return {hit:true, action:"complete", target:m[1].trim().replace(/(?:任务|待办)$/,"").trim(), raw};

  // 完成 XX (任务/待办) — 但排除"完成第N个"已处理
  m = raw.match(/^完成\s*(.+?)(?:任务|待办)?$/);
  if(m && m[1]){
    const text = m[1].trim();
    // 排除"第N个"形式（已上面处理）
    if(!/^第/.test(text) && text && text !== "任务" && text !== "待办"){
      return {hit:true, action:"complete", target:text, raw};
    }
  }

  // 删除 XX / 把 XX 删除 / 将 XX 删除
  m = raw.match(/^删除\s*(.+)$/);
  if(m){
    const text = m[1].trim().replace(/(?:任务|待办)$/,"").trim();
    if(text) return {hit:true, action:"delete", target:text, raw};
  }
  m = raw.match(/^(?:把|将)\s*(.+?)\s*删除$/);
  if(m){
    const text = m[1].trim().replace(/(?:任务|待办)$/,"").trim();
    if(text) return {hit:true, action:"delete", target:text, raw};
  }

  return {hit:false};
}

/**
 * v1.4-D：执行自然语言操作（完成/删除任务）
 * @param {{action:string, target?:string, n?:number}} parsed - parseNaturalLanguageAction 返回值
 * @returns {{ok:boolean, msg:string, task?:{id:string,title:string}}}
 */
function executeNaturalLanguageAction(parsed){
  if(!parsed || !parsed.action) return {ok:false, msg:t("msg.invalidCommand","无效的操作指令")};
  const tasks = getActiveTasks();
  if(parsed.action === "complete_nth"){
    // 第 N 个未完成任务（按创建顺序）
    const undone = tasks.filter(task => task.status !== "done").sort((a,b) => (a.created||0) - (b.created||0));
    const idx = (parsed.n || 1) - 1;
    if(idx >= undone.length){
      return {ok:false, msg:t("msg.noNth","没有第 ") + parsed.n + t("msg.noNthMid"," 个未完成任务（当前共 ") + undone.length + t("msg.noNthSuffix"," 个未完成）")};
    }
    const task = undone[idx];
    completeTask(task.id);
    return {ok:true, msg:t("msg.completedNth","已完成第 ") + parsed.n + t("msg.completedNthSuffix"," 个任务：") + task.title, task:{id:task.id, title:task.title}};
  }
  if(parsed.action === "complete"){
    const target = String(parsed.target || "").toLowerCase();
    // 查找标题包含 target 的未完成任务
    const matches = tasks.filter(task => task.status !== "done" && (task.title||"").toLowerCase().includes(target));
    if(!matches.length){
      return {ok:false, msg:t("msg.notFoundTitle","未找到标题包含「") + parsed.target + t("msg.notFoundTitleSuffix","」的未完成任务")};
    }
    // 取第一个匹配
    const task = matches[0];
    completeTask(task.id);
    return {ok:true, msg:t("msg.completed","已完成：") + task.title, task:{id:task.id, title:task.title}};
  }
  if(parsed.action === "delete"){
    const target = String(parsed.target || "").toLowerCase();
    const matches = tasks.filter(task => (task.title||"").toLowerCase().includes(target));
    if(!matches.length){
      return {ok:false, msg:t("msg.notFoundTitle","未找到标题包含「") + parsed.target + t("msg.notFoundTitleSuffix2","」的任务")};
    }
    const task = matches[0];
    // 软删除
    const all = getTasks();
    const i = all.findIndex(x => x.id === task.id);
    if(i >= 0){
      all[i].deletedAt = Date.now();
      setTasks(all);
    }
    return {ok:true, msg:t("msg.deletedRecoverable","已删除（进入回收站，可恢复）：") + task.title, task:{id:task.id, title:task.title}};
  }
  return {ok:false, msg:t("msg.unsupportedOp","不支持的操作：") + parsed.action};
}

/* ---------- v1.4-D AI 每日报告 ---------- */
/**
 * 收集每日报告所需数据（纯函数，供测试）
 * @returns {{date:string, yesterdayDone:Array, todayTodo:Array, todayOverdue:Array, streaks:Object}}
 */
function collectDailyReportData(){
  const tasks = getActiveTasks();
  const today = todayStr();
  const yesterday = shiftDay(-1);
  // 昨日完成任务
  const yesterdayDone = tasks.filter(t => {
    if(t.status !== "done" || !t.doneAt) return false;
    const d = new Date(t.doneAt);
    const ds = d.getFullYear() + "-" + pad(d.getMonth()+1) + "-" + pad(d.getDate());
    return ds === yesterday;
  }).map(t => ({ title: t.title, sc: SCENARIOS[t.sc] ? SCENARIOS[t.sc].name : t.sc }));
  // 今日待办
  const todayTodo = tasks.filter(t => t.status !== "done" && t.due === today)
    .map(t => ({ title: t.title, sc: SCENARIOS[t.sc] ? SCENARIOS[t.sc].name : t.sc, priority: t.priority || "" }));
  // 逾期未完成
  const todayOverdue = tasks.filter(t => t.status !== "done" && t.due && t.due < today)
    .map(t => ({ title: t.title, sc: SCENARIOS[t.sc] ? SCENARIOS[t.sc].name : t.sc, due: t.due }));
  // 联动打卡记录
  const streaks = {};
  ORDER.forEach(sc => {
    const s = calcStreak(sc);
    streaks[sc] = { name: SCENARIOS[sc].name, current: s.current, best: s.best, thisWeek: s.thisWeek };
  });
  return { date: today, yesterdayDone, todayTodo, todayOverdue, streaks };
}
/**
 * v1.4-D：AI 每日报告
 * 收集昨日完成任务、今日待办任务、联动打卡记录，构造 prompt 发送给 AI
 * @returns {Promise<{ok:boolean, report?:string, reason?:string, data?:Object}>}
 */
async function generateDailyReport(){
  const cfg = getCfg();
  const ap = getActiveProfile();
  if(!cfg.enabled || !(ap && ap.key)){
    return {ok:false, reason:"no-ai"};
  }
  try{
    const data = collectDailyReportData();
    const prompt = t("ai.reportPrompt1","你是工坊助手。根据以下用户数据，生成「每日报告」：\\n") +
      t("ai.reportPrompt2","1. 昨日总结：完成了哪些任务（列出标题，无则说明「昨日无完成任务」）\\n") +
      t("ai.reportPrompt3","2. 今日待办：今日到期的任务 + 逾期未完成的任务（按优先级排序）\\n") +
      t("ai.reportPrompt4","3. 打卡状态：各场景的连续打卡天数，给出保持/打破建议\\n") +
      t("ai.reportPrompt5","4. 今日建议：基于数据给出 2-3 条具体可执行的建议\\n\\n") +
      t("ai.reportPrompt6","用 Markdown 格式返回，使用 ##/### 标题分节。数据：\\n") + JSON.stringify(data, null, 2);
    const messages = [
      { role: "system", content: t("ai.reportShortPrompt","你是工坊助手，生成简洁实用的每日报告。用 Markdown 格式返回，包含昨日总结、今日待办、打卡记录、今日建议四个部分。") },
      { role: "user", content: prompt }
    ];
    const j = await chatOnce(messages);
    const content = j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
    if(!content) return {ok:false, reason:"empty"};
    return {ok:true, report:content, data};
  }catch(err){
    return {ok:false, reason:(err && err.message) || "error"};
  }
}

/* ---------- AI 对话（带工具调用） ---------- */
/**
 * R07：base URL 安全校验——只允许 https://（允许 http://localhost / http://127.0.0.1 供开发）。
 * 防止配置错误或恶意配置导致 Key 明文发往 http:// 公网。
 * @param {string} base
 * @returns {boolean}
 */
function validateBaseUrl(base){
  if (!base || typeof base !== "string") return false;
  try {
    const u = new URL(base);
    if (u.protocol === "https:") return true;
    if (u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1")) return true;
    return false;
  } catch (e){ return false; }
}
/**
 * B8：读取 AI 请求参数（超时秒数 / 温度），带默认值与范围校验。
 * 存储于 cfg 顶层（非 profile 字段），浏览器与 Electron 双路径共用。
 * @returns {{timeoutSec:number, temperature:number}}
 */
function getAiParams(){
  const cfg = getCfg() || {};
  let timeoutSec = Number(cfg.aiTimeoutSec);
  if(!isFinite(timeoutSec)) timeoutSec = 30;
  timeoutSec = Math.min(120, Math.max(5, Math.round(timeoutSec))); // 5~120s
  let temperature = Number(cfg.aiTemperature);
  if(!isFinite(temperature)) temperature = 0.7;
  temperature = Math.min(2, Math.max(0, temperature)); // 0~2
  return { timeoutSec, temperature };
}
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
    const aiParams=getAiParams(); // B8：超时/温度可配置（默认 30s / 0.7）
    const body={ model, messages, temperature:aiParams.temperature };
    if(cfg.enabled){ body.tools=effectiveTools(); body.tool_choice="auto"; }
    // v3.2 C-档：流式请求标记（仅浏览器直连 + 调用方传 onChunk 时开启；Electron 主进程代理不支持透传，保持整包）
    if(opts.onChunk && !isElectron()) body.stream = true;

    // Electron 模式：经主进程代理（Key 不进渲染进程/localStorage），一并规避 CORS（P0-3）
    // B8：超时参数随请求传给主进程（主进程读取后应用，非法值回退默认）
    // P1-1：订阅外部 signal 用户取消 → 通知主进程中断 fetch，让"取消按钮"在 Electron 下生效
    if(isElectron()){
      body.timeoutSec = aiParams.timeoutSec;

      // F3：带上当前激活 profile id，主进程按 id 取 base/model/key

      if(ap && ap.id) body.profileId = ap.id;
      let _userAborted = false;
      if(opts.signal && typeof opts.signal.addEventListener === "function"){
        const onAbort = () => {
          _userAborted = true;
          try{ if(window.electronAPI && typeof window.electronAPI.abortChat === "function") window.electronAPI.abortChat(); }catch(e){ /* noop */ }
        };
        if(opts.signal.aborted) onAbort();
        else opts.signal.addEventListener("abort", onAbort, { once: true });
      }
      try{
        return await window.electronAPI.chat(body);
      }catch(err){
        // 主进程用户取消：AbortError（signal 已 abort）或 __USER_CANCEL__ 标记 → 转 AbortError 供上游显示"已取消"
        if(_userAborted || (err && String(err && err.message || err).indexOf("__USER_CANCEL__") >= 0)){
          const e2 = new Error("user-cancel"); e2.name = "AbortError"; throw e2;
        }
        throw err;
      }
    }

    // 浏览器 / Edge / 本地服务：直连兜底（P0-10：超时 + 错误分级）
    const base=((ap && ap.base) || "https://api.openai.com/v1").replace(/\/+$/,"");
    // R07：base URL 安全校验——只允许 https://（允许 http://localhost 供开发），非法 URL 直接报错不发送请求
    if (!validateBaseUrl(base)) {
      throw new Error(t("err.aiBaseUrlUnsafe","AI base URL 不安全：必须使用 https:// 协议（开发环境可用 http://localhost）"));
    }
    // 重试矩阵（与 electron/main.js 主进程 chat 对齐）：网络错误(TypeError)/429/5xx 退避重试，
    // 间隔 1s*(attempt+1)；AbortError/TimeoutError/401/其他 4xx 不重试
    // v1.11.1 [镜像警示]：本矩阵与 electron/main.js chat IPC 为跨进程双实现（无共享构建管线），
    // 修改任何一侧前必读：① 先更新 tests/ai-retry-contract.test.js 与 tests/electron-ipc.test.js F2
    // 契约用例；② 同步修改对侧重试/钳制/错误文案；③ 完全合并依赖 H4 拆分（构建期共享源码）。
    let lastErr=null;
    for(let attempt=0; attempt<maxRetry; attempt++){
      try{
        const fetchOpts={
          method:"POST", headers:{"Content-Type":"application/json","Authorization":"Bearer "+(ap?ap.key:"")},
          body:JSON.stringify(body)
        };
        // 外部 signal 优先（取消）；否则用配置的超时（B8，默认 30s）
        // T5.3 浏览器兼容：AbortSignal.timeout 在旧浏览器无之，try/catch 守卫；signal 不可用时不挂 signal（fetch 无超时但不崩）
        if(opts.signal){ fetchOpts.signal=opts.signal; }
        else {
          try{
            if(typeof AbortSignal !== "undefined" && AbortSignal && typeof AbortSignal.timeout === "function"){
              fetchOpts.signal=AbortSignal.timeout(aiParams.timeoutSec*1000);
            }
          }catch(e){ /* AbortSignal.timeout 不可用：不挂 signal，fetch 走默认无超时 */ }
        }
        const r=await fetch(base+"/chat/completions", fetchOpts);
        if(!r.ok){
          if(r.status===401) throw new Error(t("err.apiKeyInvalid","API Key 无效，请检查设置中的 Key"));
          // 429/5xx：与主进程 chat 一致的可恢复错误，退避重试；最后一次仍失败则抛分级错误
          if(r.status===429 || r.status>=500){
            if(attempt < maxRetry-1){
              await new Promise(function(res){ setTimeout(res, 1000*(attempt+1)); });
              continue;
            }
            if(r.status===429) throw new Error(t("err.tooManyRequests","请求过于频繁，稍后重试"));
            throw new Error(t("err.serverError","服务异常，请稍后重试"));
          }
          throw new Error(t("err.apiError","API 返回错误：")+r.status);
        }
        // v3.2 C-档：流式输出优先（stream:true + SSE 逐行解析）——此前整包返回，长回复 10-30s 干等。
        // 通过 opts.onChunk 增量回吐（每收到一段 delta 调一次）；服务端不支持 SSE（返回 JSON content-type）
        // 时自动回退整包路径（兼容性兜底，与历史行为一致）。Electron 主进程代理不支持流式透传，仍走整包。
        if(opts.onChunk && opts.stream !== false){
          try{
            const ct = r.headers.get("content-type") || "";
            if(ct.indexOf("text/event-stream") >= 0){
              const reader = r.body.getReader();
              const decoder = new TextDecoder();
              let buf = "";
              let final = null; const toolCalls = []; let finishReason = "stop"; let usage = null;
              for(;;){
                const { done, value } = await reader.read();
                if(done) break;
                buf += decoder.decode(value, { stream: true });
                const lines = buf.split("\n"); buf = lines.pop() || "";
                for(const line of lines){
                  const s = line.trim();
                  if(!s || !s.startsWith("data:")) continue;
                  const payload = s.slice(5).trim();
                  if(payload === "[DONE]") continue;
                  let d = null;
                  try{ d = JSON.parse(payload); }catch(_e){ continue; }
                  if(!d || !d.choices || !d.choices[0]) continue;
                  const c = d.choices[0];
                  if(c.delta && typeof c.delta.content === "string" && c.delta.content){
                    try{ opts.onChunk(c.delta.content); }catch(_e2){ /* 回调异常不阻断流 */ }
                  }
                  if(c.delta && c.delta.tool_calls){
                    for(const tc of c.delta.tool_calls){
                      const idx = tc.index || 0;
                      toolCalls[idx] = toolCalls[idx] || { id:"", function:{ name:"", arguments:"" } };
                      if(tc.id) toolCalls[idx].id = tc.id;
                      if(tc.function && tc.function.name) toolCalls[idx].function.name += tc.function.name;
                      if(tc.function && tc.function.arguments) toolCalls[idx].function.arguments += tc.function.arguments;
                    }
                  }
                  if(c.finish_reason) finishReason = c.finish_reason;
                  if(d.usage) usage = d.usage;
                }
              }
              final = { choices: [{ message: { role: "assistant", content: "" }, finish_reason: finishReason }], usage: usage || undefined };
              if(toolCalls.length) final.choices[0].message.tool_calls = toolCalls.filter(Boolean);
              // 流式无文字内容时回吐空串占位（上游空响应检查兜底）
              addTokensUsage(final);
              return final;
            }
          }catch(_streamErr){
            // 流式解析中途异常：回退整包重发一次（stream:false）
            const r2 = await fetch(base+"/chat/completions", {
              method:"POST", headers:{"Content-Type":"application/json","Authorization":"Bearer "+(ap?ap.key:"")},
              body: JSON.stringify(Object.assign({}, body, { stream: false }))
            });
            if(r2.ok){ const _j2 = await r2.json(); addTokensUsage(_j2); return _j2; }
            throw _streamErr;
          }
        }
        // fallback：一次性 JSON（chatOnce 未请求 stream，服务端按非流式返回；
        // 历史 SSE 流式分支因服务端未返回 text/event-stream 而不可达，按 L2/L3 清理移除）
        const _jr = await r.json(); addTokensUsage(_jr); return _jr;
      }catch(err){
        // 取消 / 超时：不重试，直接抛出
        if(err && (err.name==="AbortError" || err.name==="TimeoutError")){
          if(err.name==="TimeoutError") throw new Error(t("err.requestTimeout","请求超时（")+aiParams.timeoutSec+t("err.requestTimeoutSuffix"," 秒），请检查网络或上游服务"));
          throw err;
        }
        // 网络错误（TypeError）：退避重试，间隔 1s*(attempt+1)（用 name 检查避免跨 realm instanceof 失效）
        if(err && (err.name === "TypeError" || err instanceof TypeError)){
          lastErr=err;
          if(attempt < maxRetry-1){
            await new Promise(function(res){ setTimeout(res, 1000*(attempt+1)); });
            continue;
          }
          throw new Error(t("err.apiConnectFail","无法连接 API（可能被跨域拦截）。请用本地服务模式启动（见 README 第四节），或在 Electron 版中使用内置代理"));
        }
        // 其他错误（401/403/500 等已转 Error）：不重试，直接抛出
        throw err;
      }
    }
    throw lastErr || new Error(t("err.chatRetryExhausted","chatOnce: 重试耗尽"));
  }catch(e){
    // 用户主动取消：静默传播（不 toast 噪声），由 runChatLoop 显示「已取消」
    if(e && e.name==="AbortError") throw e;
    // 对话异常：诊断 + 提示，重新抛出由上层（runChatLoop/fetchCoachAdvice）处理，保持原有错误传播契约
    pushDiag("error", "chatOnce error: "+(e&&e.message||e), {where:"chatOnce"});
    try{ toast(t("err.chatException","对话异常：")+(e&&e.message||t("tool.unknownErrorMsg", t("common.unknownError","未知错误"))), "error"); }catch(e2){ /* toast 不可用时静默降级 */ }
    throw e;
  }
}

/* ---------- v1.6-A AI Agent 多步推理：指令拦截 ---------- */
/**
 * v1.6-A：解析"拆解任务"指令
 * 支持格式：
 *   - "拆解任务 XXX" / "拆解 XXX" / "分解任务 XXX"
 *   - "帮我拆解 XXX" / "请拆解任务 XXX"
 * @param {string} text - 用户输入
 * @returns {{hit:boolean, taskTitle?:string, scenario?:string, raw?:string}|{hit:false}}
 */
function parseDecomposeIntent(text){
  const raw = String(text===null||text===undefined?"":text).trim();
  if(!raw) return {hit:false};
  // 拆解任务 XXX / 拆解 XXX / 分解任务 XXX / 帮我拆解 XXX
  const m = raw.match(/^(?:帮我|请|给我)?\s*(?:拆解|分解|拆分)\s*(?:任务|待办)?\s*[:：]?\s*(.+)$/s);
  if(m && m[1]){
    const taskTitle = m[1].trim().replace(/(?:任务|待办)$/,"").trim();
    if(taskTitle) return {hit:true, taskTitle, scenario:active, raw};
  }
  return {hit:false};
}

/**
 * v1.6-A：解析"生成代码"指令
 * 支持格式：
 *   - "生成代码 XXX" / "生成 XXX 代码" / "写代码 XXX"
 *   - "帮我生成 XXX 的代码" / "用 python 生成 XXX"
 * @param {string} text - 用户输入
 * @returns {{hit:boolean, description?:string, language?:string, raw?:string}|{hit:false}}
 */
function parseCodeGenIntent(text){
  const raw = String(text===null||text===undefined?"":text).trim();
  if(!raw) return {hit:false};
  // 检测语言关键词
  let language = "javascript";
  if(/python|py\b/i.test(raw)) language = "python";
  else if(/java\b/i.test(raw) && !/javascript/i.test(raw)) language = "java";
  else if(/typescript|ts\b/i.test(raw)) language = "typescript";
  else if(/go\b|golang/i.test(raw)) language = "go";
  else if(/rust|rs\b/i.test(raw)) language = "rust";
  else if(/c\+\+|cpp/i.test(raw)) language = "cpp";
  else if(/\bc\s*语言|\blang c\b/i.test(raw)) language = "c";
  else if(/html|css|sql|shell|bash/i.test(raw)){
    const lm = raw.match(/(html|css|sql|shell|bash)/i);
    if(lm) language = lm[1].toLowerCase();
  }
  // 去掉开头的"用/以 + 语言词 + (语言)"前缀，统一为"生成/写 XXX"
  let cleaned = raw.replace(/^(?:帮我|请|给我)?\s*(?:用|以)\s*(?:python|java|javascript|typescript|go|golang|rust|c\+\+|cpp|html|css|sql|shell|bash|ts|py|rs|c)\s*(?:语言)?\s*/i, "");
  if(cleaned === raw){
    cleaned = raw.replace(/^(?:帮我|请|给我)?\s*/, "");
  }
  // 匹配 生成/写/编写/实现 + (代码/函数) + 描述
  const m = cleaned.match(/^(?:生成|写|编写|实现)\s*(?:代码|代码片段|一段代码|函数)?\s*[:：]?\s*(.+)$/s);
  if(m && m[1]){
    let desc = m[1].trim();
    desc = desc.replace(/(?:的)?代码$/,"").trim();
    if(desc) return {hit:true, description:desc, language, raw};
  }
  return {hit:false};
}

/**
 * v1.6-A：处理"拆解任务"指令 — 调用 aiDecomposeTask 并渲染结果到聊天
 * @param {{taskTitle:string, scenario:string}} parsed - parseDecomposeIntent 返回值
 * @param {Array} hist - 聊天历史
 * @returns {Promise<boolean>} 是否已处理（true 表示拦截成功）
 */
async function handleAiDecompose(parsed, hist){
  const taskTitle = parsed.taskTitle;
  const scenario = parsed.scenario || active;
  hist.push({role:"user", content:parsed.raw});
  hist.push({role:"assistant", content:t("ai.splittingTask","正在拆解任务「")+taskTitle+t("ai.splittingTaskSuffix","」为子任务…")});
  trimChatHist(hist);
  save(PREFIX+"chat_"+active, hist); renderChat(); scrollChat();
  // 移除"正在拆解"占位
  hist.pop();
  const subtasks = await aiDecomposeTask(taskTitle, scenario);
  if(subtasks === null){
    hist.push({role:"assistant", content:t("ai.splitNoKey","⚠️ 无法拆解任务，请先在设置中配置 AI API Key。")});
  }else if(subtasks.length === 0){
    hist.push({role:"assistant", content:t("ai.splitInvalid","AI 未返回有效的子任务，请换个任务描述试试。")});
  }else{
    // 渲染子任务卡片
    let content = t("ai.splitDone","已将「")+taskTitle+t("ai.splitDoneMid","」拆解为 ")+subtasks.length+t("ai.splitDoneSuffix"," 个子任务：\\n\\n");
    subtasks.forEach(function(t, i){
      content += (i+1) + ". " + t.title + t("ai.splitPriority","（优先级：") + t.priority + "）\n";
    });
    content += t("ai.splitAddHint","\\n发送「添加子任务」可将它们加入任务列表。");
    hist.push({role:"assistant", content, _decompose:subtasks});
  }
  trimChatHist(hist);
  save(PREFIX+"chat_"+active, hist); renderChat(); scrollChat();
  return true;
}

/**
 * v1.6-A：处理"生成代码"指令 — 调用 aiGenerateCode 并渲染结果到聊天
 * @param {{description:string, language:string}} parsed - parseCodeGenIntent 返回值
 * @param {Array} hist - 聊天历史
 * @returns {Promise<boolean>} 是否已处理
 */
async function handleAiCodeGen(parsed, hist){
  hist.push({role:"user", content:parsed.raw});
  hist.push({role:"assistant", content:t("ai.generatingCode","正在生成代码（")+parsed.language+"）…"});
  trimChatHist(hist);
  save(PREFIX+"chat_"+active, hist); renderChat(); scrollChat();
  hist.pop();
  const code = await aiGenerateCode(parsed.description, parsed.language);
  if(code === null){
    hist.push({role:"assistant", content:t("ai.genCodeNoKey","⚠️ 无法生成代码，请先在设置中配置 AI API Key。")});
  }else{
    hist.push({role:"assistant", content:code});
  }
  trimChatHist(hist);
  save(PREFIX+"chat_"+active, hist); renderChat(); scrollChat();
  return true;
}

/* ---------- v1.6-A 语音 UI 增强 ---------- */
/**
 * v1.6-A：增强聊天区语音 UI
 *  - 在 chat-toolbar 注入语音输入按钮（麦克风，支持时才显示）
 *  - 给每条 assistant 消息注入朗读按钮
 *  - 绑定拆解结果"添加子任务"按钮
 * 在 renderChat 之后调用，幂等注入
 * @returns {void}
 */
