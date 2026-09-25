// ===== Chain Layer (联动层·任务完成与跨场景触发) =====
/**
 * 统一的"完成任务"入口：集中设置完成态并触发场景联动
 * @param {string} id - 任务 id
 * @returns {boolean} 是否成功标记完成（任务不存在或已完成返回 false）
 */
/* ---------- 任务事件分发（v1.14.1 归档后为 noop 占位） ----------
 * 自动化规则引擎 + Webhook 订阅总线已于 v1.14.1 归档移除。
 * 本函数保留空实现仅避免改动既有调用点；联动由 runLinks 直接驱动，
 * 不依赖本分发器。 */
/* ---------- v3.4.7 批次五：任务时间机器（事件持久化） ----------
 * _emitTaskEvent 原是自动化规则/Webhook 总线的空壳（v1.14.1 归档后 noop）。
 * 现激活为追加型事件日志：wb_agent_task_events（上限 500 条滚动，与迁移日志同模式），
 * 供「时间轴」页做 14 天 × 场景泳道回放。只记类型/场景/标题摘要/ts——不存任务全量。 */
const TASK_EVENTS_KEY = PREFIX + "task_events";
const TASK_EVENTS_MAX = 500;
function getTaskEvents(){ try{ return load(TASK_EVENTS_KEY, []) || []; }catch(_e){ return []; } }
function _emitTaskEvent(type, task){
  try{
    if(!task || !task.id) return;
    const ev = { type: type, sc: task.sc || "", title: String(task.title || "").slice(0, 40), ts: Date.now() };
    const evs = getTaskEvents();
    evs.push(ev);
    if(evs.length > TASK_EVENTS_MAX) evs.splice(0, evs.length - TASK_EVENTS_MAX);
    save(TASK_EVENTS_KEY, evs);
  }catch(_e){ /* 事件日志写失败不阻塞业务 */ }
}
/* v3.7.17（解耦 S4）：任务完成动作注册到桥接（整体赋值，保留签名与返回值），供低层受控调用 */
AppBridge.completeTask = completeTask;

function completeTask(id){
  const tasks = getTasks(); const i = tasks.findIndex(t=>t.id===id);
  if(i < 0) return false;
  const t = tasks[i];
  if(t.status === "done") return false;
  t.status = "done"; t.doneAt = Date.now();
  setTasks(tasks);
  runLinks(t);
  _emitTaskEvent("task_complete", t); // v1.11.2：任务完成事件 → 自动化规则 + Webhook 总线
  return true;
}
/**
 * 场景联动：源任务完成时，按开启的规则跨场景生成奖励/后续任务
 * @param {Task} src - 刚完成的源任务
 * @returns {void}
 */
function runLinks(src){
  if(src.linked) return; // 已完成且触发过联动的任务不再重复触发
  const links = getLinks().filter(l => l.enabled !== false && l.fromSc === src.sc);
  if(!links.length) return;
  let added = 0; const names = [];
  links.forEach(l => {
    if(String(src.title||"").toLowerCase().includes(String(l.kw||"").toLowerCase())){
      const tasks = getTasks();
      tasks.push({id:uid(), sc:l.toSc, title:l.taskTitle, due:shiftDay(0),
        priority:l.priority||"", status:"todo", doneAt:null, note:t("link.autoNote", "由场景联动自动生成"), tags:[t("link.tag", "联动")], created:Date.now()});
      setTasks(tasks);
      added++; names.push(scMeta(l.toSc).name);
    }
  });
  if(added){
    const tasks = getTasks(); const i = tasks.findIndex(t=>t.id===src.id);
    if(i >= 0){ tasks[i].linked = true; setTasks(tasks); } // 标记防重复
    toast(t("link.triggeredToast", "场景联动：自动生成 {count} 条任务 → {names}").replace("{count}", added).replace("{names}", names.join("/")), "ok");
    // A6 链条动画：给最近一条 toast 加 chain class 触发 chainFlow 动画
    try{ const ts = $$("#toasts .toast"); if(ts.length) ts[ts.length-1].classList.add("chain"); }catch(e){ /* noop */ }
  }
}

/* ---------- A1 streak 计算（连续完成任务天数） ----------
 * 规则：今天没完成不算断（从昨天开始算连续）；返回当前/历史最长/本周完成数。
 */
function _ymd(d){
  return d.getFullYear() + "-" + pad(d.getMonth()+1) + "-" + pad(d.getDate());
}
/**
 * 计算指定场景的连续完成任务天数（streak）
 * @param {string} sc - 场景键
 * @returns {StreakInfo} {current:当前连续天数, best:历史最长, thisWeek:本周完成数}
 */
function calcStreak(sc){
  const tasks = getTasks().filter(t => t.sc === sc && t.status === "done" && t.doneAt);
  const daySet = new Set();
  tasks.forEach(t => { const d = new Date(t.doneAt); daySet.add(_ymd(d)); });
  // thisWeek：本周（周一→周日）完成数
  const now = new Date(); const wd = (now.getDay()+6)%7;
  const mon = new Date(now); mon.setDate(now.getDate()-wd); mon.setHours(0,0,0,0);
  const thisWeek = tasks.filter(t => t.doneAt >= mon.getTime()).length;
  // current：从今天往回数连续天数；今天没完成则从昨天起算
  const today = new Date(); today.setHours(0,0,0,0);
  let current = 0;
  const cur = new Date(today);
  if(!daySet.has(_ymd(cur))) cur.setDate(cur.getDate() - 1);
  while(daySet.has(_ymd(cur))){ current++; cur.setDate(cur.getDate() - 1); }
  // best：历史最长连续天数（遍历排序后的日期）
  let best = 0, run = 0, prev = null;
  [...daySet].sort().forEach(ds => {
    if(prev){
      const p = new Date(prev); p.setDate(p.getDate()+1);
      run = (_ymd(p) === ds) ? run + 1 : 1;
    } else { run = 1; }
    if(run > best) best = run;
    prev = ds;
  });
  return { current, best, thisWeek };
}

/* ---------- T3.3 数据统计（纯函数·不依赖 DOM） ---------- */
/**
 * 任务完成趋势：最近 days 天每天完成任务数
 * @param {number} [days=7] - 天数（默认 7，常用 7/30）
 * @returns {Array<{date:string,count:number}>} 按时间正序（最早→最近），date 为 YYYY-MM-DD
 */
function calcTrend(days){
  const n = Math.max(1, Math.min(365, Number(days) || 7));
  const tasks = getTasks().filter(t => t.status === "done" && t.doneAt);
  const cnt = {};
  tasks.forEach(t => { const ds = _ymd(new Date(t.doneAt)); cnt[ds] = (cnt[ds] || 0) + 1; });
  const out = [];
  const today = new Date(); today.setHours(0, 0, 0, 0);
  for(let i = n - 1; i >= 0; i--){
    const d = new Date(today); d.setDate(d.getDate() - i);
    const ds = _ymd(d);
    out.push({ date: ds, count: cnt[ds] || 0 });
  }
  return out;
}
/**
 * 场景分布：4 个场景各自任务总数占比（含已完成/未完成，排除已删除）
 * @returns {Array<{sc:string,name:string,count:number,pct:number,color:string}>} count=该场景任务总数，pct=百分比(0-100，四舍五入)
 */
function calcSceneDist(){
  const tasks = getTasks().filter(t => !t.deletedAt);
  const total = tasks.length;
  return ORDER.map(sc => {
    const s = SCENARIOS[sc];
    const count = tasks.filter(t => t.sc === sc).length;
    const pct = total ? Math.round(count / total * 100) : 0;
    return { sc, name: s.name, count, pct, color: s.color };
  });
}
/**
 * 联动触发率：每条规则近 30 天触发次数 / 源场景已完成任务数 × 100%
 *   - triggered：近 30 天内，fromSc 场景中标题含 kw 且 linked=true 的任务数
 *   - sourceDone：近 30 天内，fromSc 场景已完成任务数
 *   - rate：sourceDone>0 时 round(triggered/sourceDone*100)，否则 0
 * @returns {Array<{id:string,name:string,fromSc:string,toSc:string,kw:string,enabled:boolean,triggered:number,sourceDone:number,rate:number}>}
 */
function calcChainSuccess(){
  const now = Date.now();
  const since = now - 30 * 86400000;
  const tasks = getTasks();
  const recentDone = tasks.filter(t => t.status === "done" && t.doneAt && t.doneAt >= since);
  return getLinks().map(l => {
    const enabled = l.enabled !== false;
    const kw = String(l.kw || "").toLowerCase();
    const sourceDone = recentDone.filter(t => t.sc === l.fromSc).length;
    const triggered = recentDone.filter(t =>
      t.sc === l.fromSc && t.linked &&
      String(t.title || "").toLowerCase().includes(kw)
    ).length;
    const rate = sourceDone > 0 ? Math.round(triggered / sourceDone * 100) : 0;
    return {
      id: l.id, name: l.name || "", fromSc: l.fromSc, toSc: l.toSc, kw: l.kw,
      enabled, triggered, sourceDone, rate
    };
  });
}
/**
 * 关键指标汇总：总任务数 / 已完成数 / 完成率 / 最长 streak / 本周完成数
 * @returns {{total:number,done:number,rate:number,bestStreak:number,weekDone:number}}
 */
function calcStats(){
  const tasks = getTasks().filter(t => !t.deletedAt);
  const total = tasks.length;
  const done = tasks.filter(t => t.status === "done").length;
  const rate = total ? Math.round(done / total * 100) : 0;
  // 最长 streak：取所有场景中 best 的最大值
  let bestStreak = 0;
  ORDER.forEach(sc => { const s = calcStreak(sc); if(s.best > bestStreak) bestStreak = s.best; });
  // 本周完成数：最近 7 天内已完成任务数（滚动 7 天窗口，避免自然周边界抖动）
  const now = new Date();
  const weekStart = now.getTime() - 7 * 86400000;
  const weekDone = tasks.filter(t => t.status === "done" && t.doneAt && t.doneAt >= weekStart).length;
  return { total, done, rate, bestStreak, weekDone };
}

/* ---------- P3 统计深化：平均周期 / 周环比 / 完成时段分布 ---------- */
/**
 * 平均周期：已完成任务从创建到完成的平均耗时（天）
 * @returns {{days:number|null,count:number}} days 保留 1 位小数；无有效样本时为 null
 */
function calcAvgCycle(){
  const tasks = getTasks().filter(t => !t.deletedAt && t.status === "done" && t.doneAt && t.created);
  const valid = tasks.filter(t => t.doneAt >= t.created);
  if(!valid.length) return { days: null, count: 0 };
  const sum = valid.reduce((s, t) => s + (t.doneAt - t.created), 0);
  return { days: Math.round(sum / valid.length / 86400000 * 10) / 10, count: valid.length };
}
/**
 * 周环比：本周完成数 vs 上周完成数
 * @returns {{thisWeek:number,lastWeek:number,delta:number|null}} delta 为变化百分比（整数），上周为 0 时 null
 */
function calcWeekOverWeek(){
  const tasks = getTasks().filter(t => !t.deletedAt && t.status === "done" && t.doneAt);
  const now = new Date(); const wd = (now.getDay() + 6) % 7;
  const thisMon = new Date(now); thisMon.setDate(now.getDate() - wd); thisMon.setHours(0, 0, 0, 0);
  const lastMon = new Date(thisMon); lastMon.setDate(thisMon.getDate() - 7);
  const thisWeek = tasks.filter(t => t.doneAt >= thisMon.getTime()).length;
  const lastWeek = tasks.filter(t => t.doneAt >= lastMon.getTime() && t.doneAt < thisMon.getTime()).length;
  const delta = lastWeek > 0 ? Math.round((thisWeek - lastWeek) / lastWeek * 100) : null;
  return { thisWeek, lastWeek, delta };
}
/**
 * 完成时段分布：最近 days 天内，按周几（周一→周日）× 时段（早 5-12 / 午 12-18 / 晚 18-5）统计完成数
 * @param {number} [days=30] - 统计窗口天数
 * @returns {Array<Array<{dow:number,period:number,count:number}>>} 7×3 网格；period 0=早 1=午 2=晚
 */
function calcHourDist(days){
  days = Math.max(1, Math.min(365, Number(days) || 30));
  const since = Date.now() - days * 86400000;
  const grid = [];
  for(let d = 0; d < 7; d++){ grid.push([{dow:d,period:0,count:0},{dow:d,period:1,count:0},{dow:d,period:2,count:0}]); }
  getTasks().forEach(t => {
    if(t.deletedAt || t.status !== "done" || !t.doneAt || t.doneAt < since) return;
    const d = new Date(t.doneAt);
    const dow = (d.getDay() + 6) % 7;           // 周一=0 … 周日=6
    const h = d.getHours();
    const period = h >= 5 && h < 12 ? 0 : h >= 12 && h < 18 ? 1 : 2;
    grid[dow][period].count++;
  });
  return grid;
}

/* ---------- A2 热力图数据（最近 weeks×7 天，默认 12 周=84 天） ---------- */
/**
 * 热力图数据：最近 weeks×7 天每天的任务完成数与密度等级
 * @param {string} sc - 场景键
 * @param {number} [weeks=12] - 周数（1-52）
 * @returns {Array<{date:string,count:number,level:number}>}
 */
function heatmapData(sc, weeks){
  weeks = Math.max(1, Math.min(52, Number(weeks) || 12));
  const days = weeks * 7;
  const tasks = getTasks().filter(t => t.sc === sc && t.status === "done" && t.doneAt);
  const cnt = {};
  tasks.forEach(t => { const d = new Date(t.doneAt); const ds = _ymd(d); cnt[ds] = (cnt[ds] || 0) + 1; });
  const out = [];
  const today = new Date(); today.setHours(0,0,0,0);
  for(let i = days - 1; i >= 0; i--){
    const d = new Date(today); d.setDate(d.getDate() - i);
    const ds = _ymd(d);
    const c = cnt[ds] || 0;
    const level = c === 0 ? 0 : c <= 2 ? 1 : c <= 4 ? 2 : c <= 9 ? 3 : 4;
    out.push({ date: ds, count: c, level });
  }
  return out;
}
/**
 * 渲染 SVG 热力图（GitHub 风格，列=周，行=周一→周日），用 var(--heat-0..4)
 * @param {string} sc - 场景键
 * @returns {string} HTML 字符串（svg + legend）
 */
function renderHeatmap(sc){
  const weeks = 12;
  const data = heatmapData(sc, weeks);
  const cell = 16, gap = 4, labelW = 22;
  const colW = cell + gap;
  const W = labelW + weeks * colW + gap;
  const H = 7 * colW + gap;
  const weekdays = [t("weekday.mon","一"),t("weekday.tue","二"),t("weekday.wed","三"),t("weekday.thu","四"),t("weekday.fri","五"),t("weekday.sat","六"),t("weekday.sun","日")];
  let cells = "";
  for(let w = 0; w < weeks; w++){
    for(let dow = 0; dow < 7; dow++){
      const idx = w * 7 + dow;
      if(idx >= data.length) continue;
      const c = data[idx];
      const x = labelW + gap + w * colW;
      const y = gap + dow * colW;
      cells += `<rect class="cell l${c.level}" x="${x}" y="${y}" width="${cell}" height="${cell}" rx="2"><title>${c.date}：${c.count} 个完成</title></rect>`;
    }
  }
  const labels = weekdays.map((wd, i) =>
    `<text x="2" y="${gap + i * colW + cell - 2}" font-size="var(--fs-4xs)" fill="var(--muted)">${wd}</text>`
  ).join("");
  const legend = `<div class="heatmap-legend">${t("stats.heatLess", "少")} <span class="sw l0"></span><span class="sw l1"></span><span class="sw l2"></span><span class="sw l3"></span><span class="sw l4"></span> ${t("stats.heatMore", "多")}</div>`;
  return `<div class="heatmap-wrap"><svg class="heatmap-svg" viewBox="0 0 ${W} ${H}" aria-label="${SCENARIOS[sc] ? SCENARIOS[sc].name : sc} ${t("stats.heatmapAria", "热力图")}">${labels}${cells}</svg></div>${legend}`;
}

/* ---------- A3 行为分析（最近 14 天） ---------- */
/**
 * 行为分析：最近 14 天完成统计 + 各场景 streak + 联动触发次数 + 模式洞察
 * @returns {{totalDone:number,byScenario:Object<string,number>,streaks:Object<string,{current:number,best:number}>,links:Array<{id:string,name:string,fromSc:string,toSc:string,enabled:boolean,triggered:number}>,patterns:string[]}}
 */
function analyzeBehavior(){
  const now = Date.now();
  const since = now - 14 * 86400000;
  const tasks = getTasks();
  const recentDone = tasks.filter(t => t.status === "done" && t.doneAt && t.doneAt >= since);
  const totalDone = recentDone.length;
  /** @type {{ [sc:string]: number }} */
  const byScenario = {};
  ORDER.forEach(sc => { byScenario[sc] = recentDone.filter(t => t.sc === sc).length; });
  /** @type {{ [sc:string]: { current:number, best:number } }} */
  const streaks = {};
  ORDER.forEach(sc => { const s = calcStreak(sc); streaks[sc] = { current: s.current, best: s.best }; });
  // links：最近 14 天内每条联动规则的触发次数
  const links = getLinks().map(l => {
    const triggered = recentDone.filter(t =>
      t.sc === l.fromSc && t.linked &&
      String(t.title||"").toLowerCase().includes(String(l.kw||"").toLowerCase())
    ).length;
    return { id: l.id, name: l.name, fromSc: l.fromSc, toSc: l.toSc, enabled: l.enabled !== false, triggered };
  });
  // patterns：行为模式洞察
  const patterns = [];
  ORDER.forEach(sc => {
    if(streaks[sc].current >= 3){
      patterns.push("你已连续 " + streaks[sc].current + " 天完成" + SCENARIOS[sc].name + "任务，保持得很好");
    }
  });
  ORDER.forEach(sc => {
    if(byScenario[sc] === 0){
      patterns.push("最近 14 天没有完成" + SCENARIOS[sc].name + "任务，是否需要降低门槛？");
    }
  });
  links.forEach(l => {
    if(l.triggered >= 2){
      patterns.push("联动规则「" + l.name + "」最近触发 " + l.triggered + " 次，效果不错");
    }
  });
  return { totalDone, byScenario, streaks, links, patterns };
}

/* ---------- A4 AI 习惯教练 ---------- */
const COACH_CACHE_KEY = PREFIX + "coach_advice";
const COACH_CACHE_TTL = 4 * 3600 * 1000; // 4 小时
/**
 * 拉取 AI 习惯教练建议（4 小时缓存）：基于最近 2 周行为数据让 AI 给 3 条建议
 * @returns {Promise<{ok:boolean,reason?:string,advice:string[],cached?:boolean}>}
 */
async function fetchCoachAdvice(){
  const cfg = getCfg();
  const ap = getActiveProfile();
  if(!cfg.enabled || !(ap && ap.key)){ return { ok: false, reason: "no-ai", advice: [] }; }
  // 命中缓存
  try{
    const cached = load(COACH_CACHE_KEY, null);
    if(cached && cached.ts && (Date.now() - cached.ts < COACH_CACHE_TTL) && Array.isArray(cached.advice)){
      return { ok: true, advice: cached.advice, cached: true };
    }
  }catch(e){ /* 忽略损坏缓存 */ }
  // 调 AI
  try{
    const analysis = analyzeBehavior();
    // v1.4-D：注入更具体的用户数据，让 AI 基于具体数据给建议（而非泛泛而谈）
    // 每个场景最近 7 天完成数、最长 streak、断链天数
    const now = Date.now();
    const since7 = now - 7 * 86400000;
    const scenarioStats = ORDER.map(sc => {
      const tasks = getTasks().filter(t => t.sc === sc && t.status === "done" && t.doneAt);
      const done7 = tasks.filter(t => t.doneAt >= since7).length;
      const s = calcStreak(sc);
      // 断链天数：今天没完成时，从昨天往回数到最近一次完成的天数
      let breakDays = 0;
      const today = new Date(); today.setHours(0,0,0,0);
      const daySet = new Set();
      tasks.forEach(t => { const d = new Date(t.doneAt); daySet.add(d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate())); });
      const cur = new Date(today);
      if(!daySet.has(cur.getFullYear()+"-"+pad(cur.getMonth()+1)+"-"+pad(cur.getDate()))){
        // 今天没完成，从昨天起算断链天数
        cur.setDate(cur.getDate() - 1);
        while(!daySet.has(cur.getFullYear()+"-"+pad(cur.getMonth()+1)+"-"+pad(cur.getDate()))){
          breakDays++;
          cur.setDate(cur.getDate() - 1);
          if(breakDays > 30) break; // 上限 30 天
        }
      }
      return {
        scenario: SCENARIOS[sc].name,
        doneIn7Days: done7,
        currentStreak: s.current,
        bestStreak: s.best,
        breakDays
      };
    });
    const chainStats = getLinks().map(l => {
      const triggered = getTasks().filter(t =>
        t.sc === l.fromSc && t.linked && t.status === "done" && t.doneAt &&
        String(t.title||"").toLowerCase().includes(String(l.kw||"").toLowerCase())
      ).length;
      return { name: l.name, fromSc: SCENARIOS[l.fromSc].name, toSc: SCENARIOS[l.toSc].name, triggered, enabled: l.enabled !== false };
    });
    const specificData = { scenarioStats, chainStats };
    const prompt = "你是习惯教练。根据以下用户最近 2 周的行为数据，给出 3 条具体、可执行的个性化建议（每条不超过 30 字）。\n" +
      "要求：\n" +
      "1. 建议必须基于具体数据，不要泛泛而谈。例如：若某场景断链 N 天，明确指出「你已 N 天没做 XX，建议…」\n" +
      "2. 若某场景 streak 较长，给予鼓励；若断链，给出恢复建议\n" +
      "3. 若联动触发次数低，建议如何提高触发率\n" +
      "只返回 JSON 字符串数组，如 [\"建议1\",\"建议2\",\"建议3\"]。\n\n" +
      "行为分析：\n" + JSON.stringify(analysis) + "\n\n" +
      "具体数据（每场景近 7 天完成数 / 当前 streak / 最长 streak / 断链天数 / 联动触发次数）：\n" + JSON.stringify(specificData, null, 2);
    const messages = [
      { role: "system", content: t("coach.systemRole", "你是习惯教练，给出简洁、可执行、基于具体数据的建议。只返回 JSON 字符串数组，不要任何其他内容。") },
      { role: "user", content: prompt }
    ];
    const j = await chatOnce(messages);
    const content = j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
    if(!content) return { ok: false, reason: "empty", advice: [] };
    let advice = [];
    try{ advice = JSON.parse(content); }catch(e){
      const m = content.match(/\[[\s\S]*\]/);
      if(m){ try{ advice = JSON.parse(m[0]); }catch(e2){ advice = []; } }
    }
    if(!Array.isArray(advice)) advice = [];
    advice = advice.filter(s => typeof s === "string" && s.trim()).slice(0, 3).map(s => s.trim());
    if(advice.length){ save(COACH_CACHE_KEY, { ts: Date.now(), advice }); }
    return { ok: true, advice, cached: false };
  }catch(err){
    return { ok: false, reason: (err && err.message) || "error", advice: [] };
  }
}
/* A4 渲染：AI 教练建议正文片段（v2.2.0：并入 AI 助手 Hub 卡，同步渲染缓存/loading，异步填充） */
function renderCoachCard(){
  const cfg = getCfg();
  if(!cfg.enabled){
    return `<div class="coach-hint">${t("coach.noAiHint","尚未启用 AI。点击右上角「设置」配置 API Key 后，AI 教练将分析你的习惯模式并给出建议。")}</div>`;
  }
  const cache = load(COACH_CACHE_KEY, null);
  let adviceHtml;
  if(cache && cache.ts && (Date.now() - cache.ts < COACH_CACHE_TTL) && Array.isArray(cache.advice) && cache.advice.length){
    adviceHtml = cache.advice.map((a, i) => `<div class="coach-item"><span class="idx">${i+1}</span><span>${esc(a)}</span></div>`).join("");
  } else {
    adviceHtml = `<div class="coach-hint" id="coachLoading">${t("coach.loadingHint","正在分析你的行为数据…")}</div>`;
  }
  /* v3.2.1：有建议时附加讨论按钮——把 3 条建议作为上下文预填到聊天面板 */
  const discussBtn = (cache && cache.advice && cache.advice.length)
    ? `<div class="ai-hub-actions"><button type="button" class="ai-discuss-btn" data-discuss-type="coach"><span class="ic-inline" aria-hidden="true">${UI_ICONS.robot}</span><span>${t("coach.discuss","在 AI 助手中讨论")}</span></button></div>`
    : "";
  return `<p class="sub">${t("coach.subLabel","基于最近 2 周行为数据给出 3 条个性化建议（4 小时缓存）")}<button class="coach-refresh" id="coachRefresh" type="button">${t("coach.refresh","刷新")}</button></p>${adviceHtml}${discussBtn}`;
}

/* ---------- A5 联动状态区域（总览页用） ---------- */
function renderHabitChainStatus(){
  const links = getLinks();
  const tasks = getTasks();
  const now = Date.now();
  const items = links.map(l => {
    const triggeredTasks = tasks.filter(t =>
      t.sc === l.fromSc && t.linked &&
      String(t.title||"").toLowerCase().includes(String(l.kw||"").toLowerCase())
    );
    const triggered = triggeredTasks.length;
    const enabled = l.enabled !== false;
    const fm = scMeta(l.fromSc), tm = scMeta(l.toSc);
    // 最近触发时间
    let lastText = t("chainStatus.notTriggered", "尚未触发");
    if(triggered > 0){
      const lastDone = Math.max(...triggeredTasks.map(t => t.doneAt || 0));
      const daysAgo = Math.floor((now - lastDone) / 86400000);
      if(daysAgo <= 0) lastText = t("chainStatus.today", "上次触发：今天");
      else if(daysAgo === 1) lastText = t("chainStatus.days1", "上次触发：1 天前");
      else lastText = t("chain.lastTrigger", "上次触发：{n} 天前").replace("{n}", daysAgo);
    }
    return `<div class="lk${enabled ? "" : " disabled"}">` +
      `<span style="color:${fm.color}">${fm.name}</span>` +
      `<span class="arr">→</span>` +
      `<span style="color:${tm.color}">${tm.name}</span>` +
      `<span class="cnt">${t("chain.triggerCount", "触发 {n} 次").replace("{n}", triggered)}</span>` +
      `<span class="last">${lastText}</span></div>`;
  }).join("");
  return `<div class="link-status">${items}</div>`;
}

/* ---------- v2.4.2：联动视图增强辅助函数 ---------- */
/** 最近 N 天各场景完成数（用于迷你日历） */
function recentDoneByDay(sc, days){
  const tasks = getTasks().filter(t => t.sc === sc && t.status === "done" && t.doneAt);
  const cnt = {};
  tasks.forEach(t => { const d = new Date(t.doneAt); cnt[_ymd(d)] = (cnt[_ymd(d)]||0)+1; });
  const today = new Date(); today.setHours(0,0,0,0);
  const out = [];
  for(let i = days-1; i >= 0; i--){
    const d = new Date(today); d.setDate(d.getDate()-i);
    const ds = _ymd(d);
    const c = cnt[ds]||0;
    out.push({date:ds, count:c, level:c===0?0:c<=1?1:c<=2?2:c<=3?3:4});
  }
  return out;
}
/** 最近 N 天总完成数 */
function recentTotalByDay(days){
  const tasks = getTasks().filter(t => t.status === "done" && t.doneAt);
  const cnt = {};
  tasks.forEach(t => { const ds = _ymd(new Date(t.doneAt)); cnt[ds]=(cnt[ds]||0)+1; });
  const today = new Date(); today.setHours(0,0,0,0);
  const out = [];
  for(let i = days-1; i >= 0; i--){
    const d = new Date(today); d.setDate(d.getDate()-i);
    const ds = _ymd(d);
    out.push(cnt[ds]||0);
  }
  return out;
}
/** 渲染各场景完成率条 */
function renderScCompletionBars(){
  const tasks = getTasks();
  const rows = ORDER.map(sc => {
    const all = tasks.filter(t => t.sc === sc);
    const d = all.filter(t => t.status === "done").length;
    const pct = all.length === 0 ? 0 : Math.round(d/all.length*100);
    const color = SCENARIOS[sc] ? SCENARIOS[sc].color : "var(--muted)";
    return `<div class="hc-bar-row">
      <span class="hc-bar-sc" title="${SCENARIOS[sc]?.name||sc}">${SCENARIOS[sc]?.name||sc}</span>
      <div class="hc-bar-track"><div class="hc-bar-fill" style="width:${pct}%;background:${color}"></div></div>
      <span class="hc-bar-val">${pct}%</span>
    </div>`;
  }).join("");
  return `<div class="hc-bars">${rows}</div>`;
}
/** 渲染本周各场景任务进度柱状图（SVG） */
function renderWeekBars(){
  const tasks = getTasks();
  const now = new Date(); const wd = (now.getDay()+6)%7;
  const mon = new Date(now); mon.setDate(now.getDate()-wd); mon.setHours(0,0,0,0);
  const sun = new Date(mon); sun.setDate(mon.getDate()+6);
  const W = 480, H = 140, padL = 56, padB = 24, padT = 10;
  const barW = (W-padL-20)/ORDER.length;
  const maxVal = Math.max(1, ...ORDER.map(sc =>
    tasks.filter(t=>t.sc===sc && t.doneAt>=mon.getTime() && t.doneAt<=sun.getTime()).length
  ));
  const bars = ORDER.map((sc,i)=>{
    const done = tasks.filter(t=>t.sc===sc&&t.status==="done"&&t.doneAt>=mon.getTime()&&t.doneAt<=sun.getTime()).length;
    const total = tasks.filter(t=>t.sc===sc&&t.doneAt>=mon.getTime()&&t.doneAt<=sun.getTime()).length;
    const h = Math.max(0, (done/maxVal)*(H-padT-padB));
    const x = padL + i*barW + barW*0.15;
    const bw = barW*0.7;
    const y = H-padB-h;
    const color = SCENARIOS[sc]?SCENARIOS[sc].color:"var(--muted)";
    const name = SCENARIOS[sc]?SCENARIOS[sc].name:sc;
    return `<rect x="${x}" y="${y}" width="${bw}" height="${h}" rx="3" fill="${color}" fill-opacity="0.8"/>
      <text x="${x+bw/2}" y="${y-4}" text-anchor="middle" font-size="var(--fs-4xs)" fill="var(--muted)">${done}</text>
      <text x="${x+bw/2}" y="${H-4}" text-anchor="middle" font-size="var(--fs-4xs)" fill="var(--muted)">${name}</text>`;
  }).join("");
  // 零线
  const zeroY = H-padB;
  return `<div class="hc-bars-wrap">
    <div class="hc-bars-title">${t("stats.barsTitle","本周已完成任务（按场景）")}</div>
    <svg class="hc-bars-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">
      <line x1="${padL}" y1="${zeroY}" x2="${W-10}" y2="${zeroY}" stroke="var(--line)" stroke-width="1"/>
      ${bars}
    </svg>
  </div>`;
}

/* A5 渲染：联动状态卡片（v2.4.2：全模块自适应布局） */
function renderHabitChainCard(){
  // streak 行（streak ≥ 3 火焰动画；断链警告）
  const streakBadges = ORDER.map(sc => {
    const s = calcStreak(sc);
    const cls = s.current >= 3 ? "hot" : (s.current === 0 ? "cold" : "");
    let fire;
    if(s.current >= 3){
      fire = `<span class="streak-fire">${ic("flame")}</span><b>${s.current}</b>${t("stats.streakDays","天")}`;
    } else if(s.current === 0){
      fire = `<span class="u-text-danger">${t("stats.notStarted","⚠️ 未开始")}</span>`;
    } else {
      fire = `${ic("flame")}<b>${s.current}</b>${t("stats.streakDays","天")}`;
    }
    return `<span class="streak-badge ${cls}"><span class="sc-name">${SCENARIOS[sc].name}</span><span class="fire">${fire}</span></span>`;
  }).join("");
  // 热力图（全部展开，grid 自适应）
  const heatmaps = ORDER.map(sc =>
    `<div class="hc-heat-item">${SCENARIOS[sc].name}${t("stats.heatItemSuffix","（最近 12 周）")}${renderHeatmap(sc)}</div>`
  ).join("");
  // v3.0：核心指标——突出「跨场景联动」价值（最长坚持 / 启用链路 / 本周联动触发）
  const streaks = ORDER.map(sc => calcStreak(sc));
  const maxStreak = Math.max(0, ...streaks.map(s => s.current));
  const enabledLinks = getLinks().filter(l => l.enabled !== false);
  const allTasks = getTasks();
  const weekStart = new Date(); const _wd = (weekStart.getDay()+6)%7;
  weekStart.setDate(weekStart.getDate()-_wd); weekStart.setHours(0,0,0,0);
  const weekTriggers = allTasks.filter(t => t.status==="done" && t.linked && t.doneAt >= weekStart.getTime()).length;
  const kpis = `
    <div class="hc-kpi"><span class="v">${maxStreak}</span><span class="l">${t("stats.kpiMaxStreak","最长坚持（天）")}</span></div>
    <div class="hc-kpi"><span class="v">${enabledLinks.length}</span><span class="l">${t("stats.kpiEnabledLinks","启用联动")}</span></div>
    <div class="hc-kpi"><span class="v">${weekTriggers}</span><span class="l">${t("stats.kpiWeekTriggers","本周联动触发")}</span></div>`;
  return `<div class="card">
    <h2><span class="ic-inline" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg></span>${t("stats.chainGraphTitle","联动关系图")}</h2>
    <p class="sub">${t("stats.chainGraphSub","跨场景联动 · 坚持天数 · 完成密度")}</p>
    <!-- 核心指标：跨场景联动价值一眼可见 -->
    <div class="hc-kpi-row">${kpis}</div>
    <!-- 跨场景联动（核心，提到最前） -->
    <div class="hc-section-title">${t("stats.chainGraphSection","跨场景链路图")}</div>
    ${renderChainGraph()}
    ${renderHabitChainStatus()}
    <!-- 坚持天数 -->
    <div class="hc-section-title">${t("stats.currentStreak","当前 Streak")}</div>
    <div class="hc-streak-scroll"><div class="hc-streak-inner">${streakBadges}</div></div>
    <!-- 完成密度 -->
    <div class="hc-section-title">${t("stats.heatmapSection","完成热力图（最近 12 周）")}</div>
    <div class="hc-heat-all">${heatmaps}</div>
  </div>`;
}

/* ---------- P2'：跨场景联动关系图（内联 SVG，纯渲染函数） ----------
 * 节点 = 参与链路的场景（按 ORDER 顺序环形布局），边 = 启用的链（曲线 + 箭头 + 关键词标签）；
 * 禁用的链以虚线显示。自定义场景自动纳入。 */
/**
 * 场景名折行（≤5 字单行，否则对半折两行）
 * @param {string} nm
 * @returns {string[]}
 */
function _graphNameLines(nm){
  nm = String(nm||"");
  if(nm.length <= 5) return [nm];
  const mid = Math.ceil(nm.length/2);
  return [nm.slice(0, mid), nm.slice(mid)];
}
/**
 * 渲染跨场景联动关系图
 * @returns {string} HTML 字符串（.chain-graph-wrap > svg）
 */
function renderChainGraph(){
  const links = getLinks().filter(l => l && l.fromSc && l.toSc);
  if(!links.length) return `<div class="empty">${t("stats.noChainRules","暂无联动规则")}</div>`;
  // 节点：参与链路的场景，按 ORDER 顺序环形排布
  const scs = ORDER.filter(sc => links.some(l => l.fromSc===sc || l.toSc===sc));
  if(!scs.length) return `<div class="empty">${t("stats.noChainRules","暂无联动规则")}</div>`;
  const W=480, H=360, CX=W/2, CY=H/2, NR=26;
  const R = Math.min(W, H)/2 - NR - 30;
  const pos = {};
  scs.forEach((sc, i)=>{
    const ang = -Math.PI/2 + i*(2*Math.PI/scs.length);
    pos[sc] = { x: CX + R*Math.cos(ang), y: CY + R*Math.sin(ang) };
  });
  const defs = `<defs><marker id="wbChainArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="u-fill-muted"/></marker></defs>`;
  // 边：起点/终点缩进到节点圆周外，控制点向圆心偏转成曲线（双向边自然分离）
  const edges = links.map(l=>{
    const p1 = pos[l.fromSc], p2 = pos[l.toSc];
    if(!p1 || !p2 || l.fromSc === l.toSc) return "";
    const dx = p2.x-p1.x, dy = p2.y-p1.y, dist = Math.sqrt(dx*dx+dy*dy) || 1;
    const ux = dx/dist, uy = dy/dist;
    const sx = p1.x + ux*(NR+3), sy = p1.y + uy*(NR+3);
    const ex = p2.x - ux*(NR+7), ey = p2.y - uy*(NR+7);
    const mx = (sx+ex)/2, my = (sy+ey)/2, k = 0.18;
    const cxp = mx + (CX-mx)*k, cyp = my + (CY-my)*k;
    const lx = mx + (CX-mx)*0.34, ly = my + (CY-my)*0.34;
    const disabled = l.enabled === false;
    return `<path d="M${sx.toFixed(1)},${sy.toFixed(1)} Q${cxp.toFixed(1)},${cyp.toFixed(1)} ${ex.toFixed(1)},${ey.toFixed(1)}" fill="none" style="stroke:${disabled?"var(--line)":"var(--muted)"}" stroke-width="1.6"${disabled?' stroke-dasharray="4 3"':""} marker-end="url(#wbChainArrow)"/>` +
      (l.kw ? `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="middle" font-size="var(--fs-4xs)" class="u-fill-muted">${esc(l.kw)}</text>` : "");
  }).join("");
  // 节点：圆 + 场景名（超 5 字折两行）
  const nodes = scs.map(sc=>{
    const p = pos[sc], s = SCENARIOS[sc] || { name: sc, color: "var(--muted)" };
    const lines = _graphNameLines(s.name);
    const txt = lines.length === 1
      ? `<text x="${p.x.toFixed(1)}" y="${(p.y+3.5).toFixed(1)}" text-anchor="middle" font-size="var(--fs-3xs)" class="u-fill-text">${esc(lines[0])}</text>`
      : `<text x="${p.x.toFixed(1)}" y="${(p.y-1.5).toFixed(1)}" text-anchor="middle" font-size="var(--fs-3xs)" class="u-fill-text">${esc(lines[0])}</text>` +
        `<text x="${p.x.toFixed(1)}" y="${(p.y+10.5).toFixed(1)}" text-anchor="middle" font-size="var(--fs-3xs)" class="u-fill-text">${esc(lines[1])}</text>`;
    return `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${NR}" style="fill:var(--panel);stroke:${s.color}" stroke-width="2"/>${txt}`;
  }).join("");
  return `<div class="chain-graph-wrap"><svg class="chain-graph" viewBox="0 0 ${W} ${H}" role="img" aria-label="${t("hc.graphAriaLabel", "跨场景联动关系图")}">${defs}${edges}${nodes}</svg></div>`;
}
