// ===== Render Layer (渲染层·概览) =====
/* ---------- 渲染：概览 ---------- */
/**
 * 渲染概览页：全局搜索 + 完成趋势 + 日历热力图 + 各场景进度 + 习惯链 + AI 教练
 * @returns {void}
 */
function renderOverview(){
  const tasks = getActiveTasks();
  const days=[], counts=[];
  for(let i=13;i>=0;i--){ const d=new Date(); d.setDate(d.getDate()-i);
    days.push(pad(d.getMonth()+1)+"/"+pad(d.getDate()));
    counts.push(tasks.filter(t=>t.status==="done"&&t.doneAt&&sameDay(t.doneAt,d.getFullYear(),d.getMonth(),d.getDate())).length); }
  const lineChart = lineChartSVG(counts, "var(--accent)") +
    `<div style="font-size:11px;color:var(--muted);margin-top:4px">${days[0]} — ${days[days.length-1]} · 每日完成任务数</div>`;

  const now=new Date(), y=now.getFullYear(), m=now.getMonth();
  const first=new Date(y,m,1).getDay(), dim=new Date(y,m+1,0).getDate();
  const cells=[]; for(let i=0;i<first;i++) cells.push(null);
  for(let d=1;d<=dim;d++) cells.push(d);
  const lvl=c=> c===0?"l0": c<=2?"l1": c<=4?"l2": c<=9?"l3":"l4";
  const heat=`<div class="heat">`+
    ["日","一","二","三","四","五","六"].map(w=>`<div class="dow">${w}</div>`).join("")+
    cells.map(d=> d? `<div class="hcell ${lvl(tasks.filter(t=>t.status==="done"&&t.doneAt&&sameDay(t.doneAt,y,m,d)).length)}">${d}</div>`
                   : `<div class="hcell" style="background:transparent"></div>`).join("")+
    `</div><div style="font-size:11px;color:var(--muted);margin-top:6px">本月每日完成密度（颜色越深越多）</div>`;

  const bars = ORDER.map(sc=>{
    const s=SCENARIOS[sc]; const all=tasks.filter(t=>t.sc===sc);
    const dn=all.filter(t=>t.status==="done").length; const tot=all.length;
    const pct= tot? Math.round(dn/tot*100):0;
    return `<div class="bar"><span class="nm">${s.name}</span>
      <span class="track"><span class="fill" style="width:${pct}%;background:${s.color}"></span></span>
      <span class="v">${dn}/${tot}</span></div>`;
  }).join("");

  $("#main").innerHTML =
    `<div class="card"><h2>全局搜索</h2><p class="sub">跨场景检索任务与资料库（输入即筛选，支持场景 / 状态 / 日期 / 标签组合）</p>
      <div class="glob-filters">
        <input id="globSearch" placeholder="关键词，如 周报 / 跑步…">
        <select id="globFSc" aria-label="按场景筛选"><option value="">全部场景</option>${ORDER.map(sc=>`<option value="${esc(sc)}">${esc(SCENARIOS[sc].name)}</option>`).join("")}</select>
        <select id="globFStatus" aria-label="按状态筛选"><option value="">全部状态</option><option value="todo">待办</option><option value="doing">进行中</option><option value="done">已完成</option></select>
        <select id="globFDate" aria-label="按日期筛选"><option value="">不限日期</option><option value="today">今天到期</option><option value="overdue">已逾期</option><option value="week">本周到期</option></select>
        <input id="globFTag" placeholder="标签，如 urgent">
      </div>
      <div class="glob-views" id="globViews"></div>
      <div id="globRes" style="margin-top:10px"></div></div>
     <div class="card"><h2>${UI_ICONS.overview} 数据总览</h2>
       <p class="sub">跨场景的任务完成趋势与密度</p>
       <h3>${UI_ICONS.overview} 完成趋势（近 14 天）</h3>${lineChart}
       <h3>日历热力图（本月）</h3>${heat}
       <h3>各场景进度</h3><div class="bars">${bars}</div>
     </div>
     ${renderHabitChainCard()}
     ${renderCoachCard()}
     <div class="foot">Agent 工作台 · 数据存于本机浏览器 · 记得定期导出备份 · v${VERSION}</div>`;

  const gs=$("#globSearch"); if(gs) gs.oninput=()=> renderGlob(gs.value.trim().toLowerCase());
  ["globFSc","globFStatus","globFDate","globFTag"].forEach(id=>{
    const el=$("#"+id); if(!el) return;
    if(id==="globFTag"){ el.oninput=()=> renderGlob(($("#globSearch").value||"").trim().toLowerCase()); }
    else { el.onchange=()=> renderGlob(($("#globSearch").value||"").trim().toLowerCase()); }
  });
  renderGlobViews();
  // A4 AI 教练：异步加载建议 + 绑定刷新按钮
  const cr=$("#coachRefresh");
  if(cr) cr.onclick=()=>{ try{ localStorage.removeItem(COACH_CACHE_KEY); }catch(e){ /* noop */ } renderOverview(); };
  const cl=$("#coachLoading");
  if(cl){
    fetchCoachAdvice().then(r => {
      if(r.ok && r.advice.length){
        cl.outerHTML = r.advice.map((a, i) => `<div class="coach-item"><span class="idx">${i+1}</span><span>${esc(a)}</span></div>`).join("");
      } else if(!r.ok && r.reason !== "no-ai"){
        cl.textContent = "暂无法获取建议（" + r.reason + "），请稍后重试";
      }
    }).catch(()=>{ /* 静默失败，保留 loading 文案 */ });
  }
}

/* ---------- T3.3 数据统计（渲染层·内联 SVG） ---------- */
// 统计视图当前趋势图范围（7 或 30 天），默认 7
let _statsTrendDays = 7;
/**
 * 渲染趋势折线图（内联 SVG，含网格线 + 折线 + 数据点）
 * @param {Array<{date:string,count:number}>} data - calcTrend 返回值
 * @param {string} [color] - 折线色（默认 var(--accent)）
 * @returns {string} HTML 字符串（svg）
 */
function renderTrendChart(data, color){
  const c = color || "var(--accent)";
  const W = 320, H = 120, padL = 28, padR = 8, padT = 10, padB = 24;
  const n = data.length;
  if(n === 0) return "";
  const max = Math.max(1, ...data.map(d => d.count));
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const x = i => padL + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = v => padT + innerH - (v / max) * innerH;
  // 网格线（4 条横线 + 刻度）
  let grid = "";
  const ticks = 4;
  for(let i = 0; i <= ticks; i++){
    const v = Math.round(max * i / ticks);
    const yy = y(v);
    grid += `<line x1="${padL}" y1="${yy}" x2="${W - padR}" y2="${yy}" stroke="var(--line)" stroke-width="1"/>` +
      `<text x="${padL - 4}" y="${yy + 3}" text-anchor="end" font-size="9" fill="var(--muted)">${v}</text>`;
  }
  // X 轴标签：7 天全标，30 天每 5 天标一个
  let xLabels = "";
  const labelStep = n <= 7 ? 1 : Math.ceil(n / 7);
  data.forEach((d, i) => {
    if(i % labelStep !== 0 && i !== n - 1) return;
    const mm = d.date.slice(5); // MM-DD
    xLabels += `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" font-size="9" fill="var(--muted)">${mm}</text>`;
  });
  // 折线 + 数据点
  const pts = data.map((d, i) => [x(i), y(d.count)]);
  const line = pts.map(p => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ");
  const area = padL + "," + (padT + innerH) + " " + line + " " + (W - padR) + "," + (padT + innerH);
  const dots = pts.map(p =>
    `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="2.5" fill="${c}"><title>${data[pts.indexOf(p)].date}：${data[pts.indexOf(p)].count} 个</title></circle>`
  ).join("");
  return `<svg class="stats-trend-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="任务完成趋势图">` +
    grid + xLabels +
    `<polygon points="${area}" fill="${c}" fill-opacity="0.08"/>` +
    `<polyline points="${line}" fill="none" stroke="${c}" stroke-width="2" stroke-linejoin="round"/>` +
    dots + `</svg>`;
}
/**
 * 渲染场景分布饼图（内联 SVG + 图例）
 * @param {Array<{sc:string,name:string,count:number,pct:number,color:string}>} dist - calcSceneDist 返回值
 * @returns {string} HTML 字符串（svg + legend）
 */
function renderPieChart(dist){
  const total = dist.reduce((s, d) => s + d.count, 0);
  const R = 60, CX = 70, CY = 70;
  if(total === 0){
    return `<div class="stats-pie-empty">暂无任务数据</div>`;
  }
  let svg = `<svg class="stats-pie-svg" viewBox="0 0 140 140" width="140" height="140" role="img" aria-label="场景分布饼图">`;
  let acc = 0;
  dist.forEach(d => {
    if(d.count === 0) return;
    const start = acc / total * 2 * Math.PI - Math.PI / 2;
    acc += d.count;
    const end = acc / total * 2 * Math.PI - Math.PI / 2;
    const large = (end - start) > Math.PI ? 1 : 0;
    const x1 = CX + R * Math.cos(start), y1 = CY + R * Math.sin(start);
    const x2 = CX + R * Math.cos(end), y2 = CY + R * Math.sin(end);
    svg += `<path d="M${CX},${CY} L${x1.toFixed(2)},${y1.toFixed(2)} A${R},${R} 0 ${large} 1 ${x2.toFixed(2)},${y2.toFixed(2)} Z" fill="${d.color}"><title>${esc(d.name)}：${d.count} 个（${d.pct}%）</title></path>`;
  });
  svg += `</svg>`;
  const legend = dist.map(d =>
    `<div class="stats-pie-legend-item">` +
      `<span class="sw" style="background:${d.color}"></span>` +
      `<span class="nm">${esc(d.name)}</span>` +
      `<span class="v">${d.count} · ${d.pct}%</span>` +
    `</div>`
  ).join("");
  return `<div class="stats-pie-wrap"><div class="stats-pie-chart">${svg}</div><div class="stats-pie-legend">${legend}</div></div>`;
}
/**
 * 渲染完成时段分布网格（7 行周几 × 3 列时段，色块用 var(--heat-0..4)）
 * @param {Array<Array<{dow:number,period:number,count:number}>>} grid - calcHourDist 返回值
 * @returns {string} HTML 字符串
 */
function renderHourDistGrid(grid){
  const max = Math.max(1, ...grid.flat().map(c => c.count));
  const lvl = c => c === 0 ? 0 : c / max <= 0.25 ? 1 : c / max <= 0.5 ? 2 : c / max <= 0.75 ? 3 : 4;
  const dows = ["一","二","三","四","五","六","日"];
  const periods = ["早（5-12）","午（12-18）","晚（18-5）"];
  let html = `<div class="hourdist"><div class="hourdist-head"></div>` +
    periods.map(p => `<div class="hourdist-head">${p}</div>`).join("");
  grid.forEach((row, dow) => {
    html += `<div class="hourdist-dow">周${dows[dow]}</div>`;
    row.forEach(cell => {
      html += `<div class="hourdist-cell hd-l${lvl(cell.count)}" title="周${dows[dow]} · ${periods[cell.period]}：${cell.count} 个完成"></div>`;
    });
  });
  return html + `</div>`;
}
/**
 * 渲染统计视图（关键指标卡片 + 趋势图 + 饼图 + 时段分布 + 习惯链成功率）
 * @returns {void}
 */
function renderStats(){
  const stats = calcStats();
  // T4.2：无任何任务数据时显示 no-stats 空状态（替代空图表/空饼图）
  if(stats.total === 0){
    $("#main").innerHTML = `<div class="card">` + renderEmpty("no-stats") + `</div>` +
      `<div class="foot">Agent 工作台 · 数据统计 · v${VERSION}</div>`;
    return;
  }
  // 关键指标卡片（P3：新增平均周期；本周完成带周环比角标）
  const avg = calcAvgCycle();
  const wow = calcWeekOverWeek();
  const wowBadge = wow.delta === null ? `<span class="stats-wow muted">环比 -</span>`
    : `<span class="stats-wow ${wow.delta >= 0 ? "up" : "down"}">${wow.delta >= 0 ? "↑" : "↓"} ${Math.abs(wow.delta)}%</span>`;
  const cards = [
    { label: "总任务数", value: stats.total },
    { label: "已完成", value: stats.done },
    { label: "完成率", value: stats.rate + "%" },
    { label: "平均周期", value: avg.days === null ? "-" : avg.days + " 天" },
    { label: "最长 streak", value: stats.bestStreak + " 天" },
    { label: "本周完成", value: stats.weekDone, badge: wowBadge }
  ];
  const cardsHtml = `<div class="stats-cards">` + cards.map(c =>
    `<div class="stats-card"><div class="stats-card-val">${c.value}${c.badge || ""}</div><div class="stats-card-lbl">${c.label}</div></div>`
  ).join("") + `</div>`;
  // 趋势图（周/双周/月切换）
  const trendData = calcTrend(_statsTrendDays);
  const trendChart = renderTrendChart(trendData, "var(--accent)");
  const trendHtml = `<div class="card"><h2>${UI_ICONS.stats} 任务完成趋势</h2>` +
    `<p class="sub">最近 ${_statsTrendDays} 天每天完成任务数</p>` +
    `<div class="stats-trend-tabs">` +
      `<button type="button" class="stats-tab${_statsTrendDays === 7 ? " active" : ""}" data-trend-days="7">周（7 天）</button>` +
      `<button type="button" class="stats-tab${_statsTrendDays === 14 ? " active" : ""}" data-trend-days="14">双周（14 天）</button>` +
      `<button type="button" class="stats-tab${_statsTrendDays === 30 ? " active" : ""}" data-trend-days="30">月（30 天）</button>` +
    `</div>` +
    `<div class="stats-trend-chart">${trendChart}</div></div>`;
  // 场景分布饼图
  const dist = calcSceneDist();
  const pieHtml = `<div class="card"><h2>${UI_ICONS.stats} 场景分布</h2>` +
    `<p class="sub">各场景任务总数占比</p>${renderPieChart(dist)}</div>`;
  // 完成时段分布（最近 30 天）
  const hourHtml = `<div class="card"><h2>${UI_ICONS.stats} 完成时段分布</h2>` +
    `<p class="sub">最近 30 天：周几 × 时段完成任务数（颜色越深越多）</p>${renderHourDistGrid(calcHourDist(30))}</div>`;
  // 习惯链成功率
  const chains = calcChainSuccess();
  const chainsHtml = chains.length ? chains.map(c => {
    const fromColor = SCENARIOS[c.fromSc] ? SCENARIOS[c.fromSc].color : "var(--muted)";
    const toColor = SCENARIOS[c.toSc] ? SCENARIOS[c.toSc].color : "var(--muted)";
    const enabledCls = c.enabled ? "" : " disabled";
    return `<div class="stats-chain${enabledCls}">` +
      `<div class="stats-chain-head">` +
        `<span style="color:${fromColor}">${esc(SCENARIOS[c.fromSc] ? SCENARIOS[c.fromSc].name : c.fromSc)}</span>` +
        `<span class="arr">→</span>` +
        `<span style="color:${toColor}">${esc(SCENARIOS[c.toSc] ? SCENARIOS[c.toSc].name : c.toSc)}</span>` +
        `<span class="stats-chain-meta">触发 ${c.triggered} / 源完成 ${c.sourceDone}</span>` +
      `</div>` +
      `<div class="stats-chain-bar">` +
        `<div class="stats-chain-fill" style="width:${c.rate}%"></div>` +
        `<span class="stats-chain-rate">${c.rate}%</span>` +
      `</div>` +
    `</div>`;
  }).join("") : `<div class="empty">暂无习惯链</div>`;
  const chainCard = `<div class="card"><h2>${UI_ICONS.stats} 习惯链成功率</h2>` +
    `<p class="sub">每条链近 30 天触发次数 / 源场景完成数</p>${chainsHtml}</div>`;

  $("#main").innerHTML = cardsHtml + trendHtml + pieHtml + hourHtml + chainCard +
    `<div class="foot">Agent 工作台 · 数据统计 · v${VERSION}</div>`;

  // 绑定周/双周/月切换
  $$(".stats-tab").forEach(b => b.onclick = () => {
    const d = parseInt(b.dataset.trendDays, 10);
    if(d === 7 || d === 14 || d === 30){ _statsTrendDays = d; renderStats(); }
  });
}
/* ---------- P8：保存的筛选视图（localStorage，PREFIX 前缀自动随备份） ---------- */
const GLOB_VIEWS_KEY = PREFIX+"glob_views";
function getGlobViews(){
  const arr = load(GLOB_VIEWS_KEY, []);
  return Array.isArray(arr) ? arr.filter(v=>v && v.name) : [];
}
function saveGlobView(name){
  name = String(name===null||name===undefined?"":name).trim();
  if(!name) return {ok:false, err:"请输入视图名称"};
  if(name.length > 16) return {ok:false, err:"视图名称过长（最多 16 字）"};
  const views = getGlobViews();
  const f = _readGlobFilters();
  const exists = views.findIndex(v=>v.name===name);
  const entry = { name, q:f.q, sc:f.sc, status:f.status, date:f.date, tag:f.tag };
  if(exists>=0) views[exists]=entry; else views.push(entry);
  save(GLOB_VIEWS_KEY, views);
  return {ok:true};
}
function removeGlobView(name){
  save(GLOB_VIEWS_KEY, getGlobViews().filter(v=>v.name!==name));
}
function _readGlobFilters(){
  const v = id=>{ const el=$("#"+id); return el ? (el.value||"") : ""; };
  return { q:v("globSearch").trim().toLowerCase(), sc:v("globFSc"), status:v("globFStatus"), date:v("globFDate"), tag:v("globFTag").trim().toLowerCase() };
}
function _applyGlobFilters(f){
  const today = todayStr();
  // 本周一（周一为一周起点，与 weekRange 对齐）
  const d=new Date(); const day=(d.getDay()+6)%7;
  const mon=new Date(d); mon.setDate(d.getDate()-day); mon.setHours(0,0,0,0);
  const monStr = mon.getFullYear()+"-"+pad(mon.getMonth()+1)+"-"+pad(mon.getDate());
  const sun=new Date(mon); sun.setDate(mon.getDate()+6);
  const sunStr = sun.getFullYear()+"-"+pad(sun.getMonth()+1)+"-"+pad(sun.getDate());
  return getActiveTasks().filter(x=>{
    if(!x || x.deletedAt) return false;
    if(f.q && !(x.title||"").toLowerCase().includes(f.q)) return false;
    if(f.sc && x.sc!==f.sc) return false;
    if(f.status && x.status!==f.status) return false;
    if(f.tag){
      const tags=(x.tags||[]).map(t=>String(t).toLowerCase());
      if(!tags.some(t=>t.includes(f.tag))) return false;
    }
    if(f.date==="today"){ if(x.due!==today) return false; }
    else if(f.date==="overdue"){ if(!(x.due && x.due<today && x.status!=="done")) return false; }
    else if(f.date==="week"){ if(!(x.due && x.due>=monStr && x.due<=sunStr)) return false; }
    return true;
  });
}
function renderGlobViews(){
  const box=$("#globViews"); if(!box) return;
  const views=getGlobViews();
  box.innerHTML = (views.length
    ? views.map(v=>`<span class="glob-view-chip" data-view="${esc(v.name)}" title="应用视图">${esc(v.name)}<button type="button" class="gv-del" data-view-del="${esc(v.name)}" aria-label="删除视图">×</button></span>`).join("")
    : "") + `<button type="button" class="glob-view-save" id="globViewSave" title="保存当前筛选为视图">＋ 保存视图</button>`;
  $$("#globViews [data-view]").forEach(ch=>{
    ch.onclick = e=>{
      if(e.target.closest(".gv-del")) return; // 删除按钮单独处理
      const v=getGlobViews().find(x=>x.name===ch.getAttribute("data-view"));
      if(!v) return;
      $("#globSearch").value=v.q||""; $("#globFSc").value=v.sc||""; $("#globFStatus").value=v.status||""; $("#globFDate").value=v.date||""; $("#globFTag").value=v.tag||"";
      renderGlob((v.q||"").toLowerCase());
    };
  });
  $$("#globViews [data-view-del]").forEach(b=>{
    b.onclick=()=>{ removeGlobView(b.getAttribute("data-view-del")); renderGlobViews(); };
  });
  const sv=$("#globViewSave"); if(sv) sv.onclick=()=>{
    const name = (typeof prompt==="function") ? prompt("视图名称：") : null;
    if(name===null) return;
    const r=saveGlobView(name);
    if(!r.ok){ toast(r.err||"保存失败","warn"); return; }
    toast("已保存视图","ok"); renderGlobViews();
  };
}
function renderGlob(q){
  const res=$("#globRes"); if(!res) return;
  const f=_readGlobFilters();
  // 兼容：renderGlob(q) 直传关键词时同步输入框语义（q 优先）
  if(typeof q==="string") f.q=q.trim().toLowerCase();
  const hasFilter = f.q||f.sc||f.status||f.date||f.tag;
  if(!hasFilter){ res.innerHTML=""; return; }
  const tasks=_applyGlobFilters(f);
  const recs=[];
  if(f.q && !f.sc && !f.status && !f.date && !f.tag){
    // 仅关键词时保留资料库检索（与原行为一致）
    ORDER.forEach(sc=> getRec(sc).forEach(r=>{
      const t=String(r.title||""); if(t.toLowerCase().includes(f.q)) recs.push({sc,title:t}); }));
  }
  let html="";
  if(tasks.length) html+=`<div style="font-size:13px;color:var(--muted);margin:6px 0">任务 (${tasks.length})</div><ul class="list">`+
    tasks.map(t=>`<li><div class="body"><div class="t">${esc(t.title)}</div><div class="m">${scMeta(t.sc).name} · ${t.status}${t.due?" · "+t.due:""}${(t.tags&&t.tags.length)?" · "+t.tags.map(esc).join("/"):""}</div></div></li>`).join("")+`</ul>`;
  if(recs.length) html+=`<div style="font-size:13px;color:var(--muted);margin:6px 0">资料 (${recs.length})</div><ul class="list">`+
    recs.map(r=>`<li><div class="body"><div class="t">${esc(r.title)}</div><div class="m">${SCENARIOS[r.sc].name}</div></div></li>`).join("")+`</ul>`;
  res.innerHTML=html||renderEmpty("no-search");
}

