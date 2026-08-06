// ===== Chain Layer (习惯链层·任务完成与联动) =====
/**
 * 统一的"完成任务"入口：集中设置完成态并触发场景联动
 * @param {string} id - 任务 id
 * @returns {boolean} 是否成功标记完成（任务不存在或已完成返回 false）
 */
function completeTask(id){
  const tasks = getTasks(); const i = tasks.findIndex(t=>t.id===id);
  if(i < 0) return false;
  const t = tasks[i];
  if(t.status === "done") return false;
  t.status = "done"; t.doneAt = Date.now();
  setTasks(tasks);
  runLinks(t);
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
        priority:l.priority||"", status:"todo", doneAt:null, note:"由场景联动自动生成", tags:["联动"], created:Date.now()});
      setTasks(tasks);
      added++; names.push(SCENARIOS[l.toSc].name);
    }
  });
  if(added){
    const tasks = getTasks(); const i = tasks.findIndex(t=>t.id===src.id);
    if(i >= 0){ tasks[i].linked = true; setTasks(tasks); } // 标记防重复
    toast("场景联动：自动生成 "+added+" 条任务 → "+names.join("/"), "ok");
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
 * 习惯链成功率：每条链近 30 天触发次数 / 源场景已完成任务数 × 100%
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
  // 本周完成数：周一 00:00 起所有场景已完成任务数
  const now = new Date(); const wd = (now.getDay() + 6) % 7;
  const mon = new Date(now); mon.setDate(now.getDate() - wd); mon.setHours(0, 0, 0, 0);
  const weekDone = tasks.filter(t => t.status === "done" && t.doneAt && t.doneAt >= mon.getTime()).length;
  return { total, done, rate, bestStreak, weekDone };
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
  const cell = 12, gap = 3, labelW = 16;
  const colW = cell + gap;
  const W = labelW + weeks * colW + gap;
  const H = 7 * colW + gap;
  const weekdays = ["一","二","三","四","五","六","日"];
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
    `<text x="2" y="${gap + i * colW + cell - 2}" font-size="9" fill="var(--muted)">${wd}</text>`
  ).join("");
  const legend = `<div class="heatmap-legend">少 <span class="sw l0"></span><span class="sw l1"></span><span class="sw l2"></span><span class="sw l3"></span><span class="sw l4"></span> 多</div>`;
  return `<div class="heatmap-wrap"><svg class="heatmap-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-label="${SCENARIOS[sc] ? SCENARIOS[sc].name : sc} 热力图">${labels}${cells}</svg></div>${legend}`;
}

/* ---------- A3 行为分析（最近 14 天） ---------- */
/**
 * 行为分析：最近 14 天完成统计 + 各场景 streak + 习惯链触发次数 + 模式洞察
 * @returns {{totalDone:number,byScenario:Object<string,number>,streaks:Object<string,{current:number,best:number}>,links:Array<{id:string,name:string,fromSc:string,toSc:string,enabled:boolean,triggered:number}>,patterns:string[]}}
 */
function analyzeBehavior(){
  const now = Date.now();
  const since = now - 14 * 86400000;
  const tasks = getTasks();
  const recentDone = tasks.filter(t => t.status === "done" && t.doneAt && t.doneAt >= since);
  const totalDone = recentDone.length;
  const byScenario = {};
  ORDER.forEach(sc => { byScenario[sc] = recentDone.filter(t => t.sc === sc).length; });
  const streaks = {};
  ORDER.forEach(sc => { const s = calcStreak(sc); streaks[sc] = { current: s.current, best: s.best }; });
  // links：最近 14 天内每条习惯链的触发次数
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
      patterns.push("习惯链「" + l.name + "」最近触发 " + l.triggered + " 次，效果不错");
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
    const prompt = "你是习惯教练。根据以下用户最近 2 周的行为数据，给出 3 条具体、可执行的个性化建议（每条不超过 30 字）。只返回 JSON 字符串数组，如 [\"建议1\",\"建议2\",\"建议3\"]。\n\n行为数据：\n" + JSON.stringify(analysis);
    const messages = [
      { role: "system", content: "你是习惯教练，给出简洁、可执行的建议。只返回 JSON 字符串数组，不要任何其他内容。" },
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
/* A4 渲染：AI 教练建议卡片（同步渲染缓存/loading，异步填充） */
function renderCoachCard(){
  const cfg = getCfg();
  if(!cfg.enabled){
    return `<div class="card coach-card"><h2>🎯 AI 习惯教练</h2><p class="sub">基于最近 2 周行为数据给出 3 条个性化建议</p>` +
      `<div class="coach-hint">尚未启用 AI。点击右上角「设置」配置 API Key 后，AI 教练将分析你的习惯模式并给出建议。</div></div>`;
  }
  const cache = load(COACH_CACHE_KEY, null);
  let adviceHtml;
  if(cache && cache.ts && (Date.now() - cache.ts < COACH_CACHE_TTL) && Array.isArray(cache.advice) && cache.advice.length){
    adviceHtml = cache.advice.map((a, i) => `<div class="coach-item"><span class="idx">${i+1}</span><span>${esc(a)}</span></div>`).join("");
  } else {
    adviceHtml = `<div class="coach-hint" id="coachLoading">正在分析你的行为数据…</div>`;
  }
  return `<div class="card coach-card"><h2>🎯 AI 习惯教练</h2>` +
    `<p class="sub">基于最近 2 周行为数据给出 3 条个性化建议（4 小时缓存）<button class="coach-refresh" id="coachRefresh" type="button">刷新</button></p>${adviceHtml}</div>`;
}

/* ---------- A5 习惯链状态区域（总览页用） ---------- */
function renderHabitChainStatus(){
  const links = getLinks();
  const tasks = getTasks();
  const items = links.map(l => {
    const triggered = tasks.filter(t =>
      t.sc === l.fromSc && t.linked &&
      String(t.title||"").toLowerCase().includes(String(l.kw||"").toLowerCase())
    ).length;
    const enabled = l.enabled !== false;
    const fromColor = SCENARIOS[l.fromSc] ? SCENARIOS[l.fromSc].color : "var(--muted)";
    const toColor = SCENARIOS[l.toSc] ? SCENARIOS[l.toSc].color : "var(--muted)";
    return `<div class="lk${enabled ? "" : " disabled"}">` +
      `<span style="color:${fromColor}">${SCENARIOS[l.fromSc].name}</span>` +
      `<span class="arr">→</span>` +
      `<span style="color:${toColor}">${SCENARIOS[l.toSc].name}</span>` +
      `<span class="cnt">触发 ${triggered} 次</span></div>`;
  }).join("");
  return `<div class="link-status">${items}</div>`;
}
/* A5 渲染：习惯链可视化卡片（streak + 热力图折叠 + 链状态） */
function renderHabitChainCard(){
  // streak 行
  const streakBadges = ORDER.map(sc => {
    const s = calcStreak(sc);
    const cls = s.current >= 3 ? "hot" : (s.current === 0 ? "cold" : "");
    const fire = s.current > 0 ? `🔥<b>${s.current}</b>天` : "未开始";
    return `<span class="streak-badge ${cls}"><span class="sc-name">${SCENARIOS[sc].name}</span><span class="fire">${fire}</span></span>`;
  }).join("");
  // 每个场景的热力图（折叠）
  const heatmaps = ORDER.map(sc =>
    `<details class="heat-fold"><summary>${SCENARIOS[sc].name} 完成热力图（最近 12 周）</summary>${renderHeatmap(sc)}</details>`
  ).join("");
  return `<div class="card"><h2>🔗 习惯链可视化</h2>` +
    `<p class="sub">每个场景的连续天数与完成密度</p>` +
    `<h3>当前 Streak</h3><div class="streak-row">${streakBadges}</div>` +
    `<h3>热力图</h3>${heatmaps}` +
    `<h3>习惯链状态</h3>${renderHabitChainStatus()}` +
    `</div>`;
}

