// ===== Render Layer (渲染层·概览) =====
/* ---------- 渲染：概览 ---------- */
/**
 * 渲染概览页：全局搜索 + 完成趋势 + 日历热力图 + 各场景进度 + 联动 + AI 教练
 * @returns {void}
 */
let _overviewView = "today"; // 概览页视图切换：today（今日待办）| all（全部待办）
function renderOverview(){
  const tasks = getActiveTasks();
  // v3.3.0 B 4/8：主页速览 4 卡——今日待办(含逾期) / 本周会议 / 本月缴费 / 本周运动
  // 注意：会议/缴费记录存于功能卡存储（PREFIX+key），与场景记录（rec_ 前缀）不同键
  const _t4Today = todayStr();
  const _t4WeekAgo = (function(){ const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString().slice(0,10); })();
  const _t4Month = _t4Today.slice(0, 7);
  const todayOpen = tasks.filter(function(tk){ return tk.status !== "done" && tk.due && tk.due <= _t4Today; }).length;
  const todayOverdue = tasks.filter(function(tk){ return tk.status !== "done" && tk.due && tk.due < _t4Today; }).length;
  const weekMeetings = (load(PREFIX + "meetings", []) || []).filter(function(r){ return r.date && r.date >= _t4WeekAgo; }).length;
  const monthBills = (load(PREFIX + "life_bills", []) || []).filter(function(r){ return r.due && r.due.slice(0, 7) === _t4Month; }).length;
  const weekSport = getHealthRecs().filter(function(r){
    if(r.type !== "运动记录") return false;
    const d = r._date || r.date || (r.created ? new Date(r.created).toISOString().slice(0,10) : "");
    return d && d >= _t4WeekAgo;
  }).length;
  const overview4 = '<div class="overview-4cards">' +
    '<div class="overview-card ov4-clickable' + (todayOverdue > 0 ? ' ov4-alert' : '') + '" data-ov4-goto="office" role="button" tabindex="0" aria-label="' + t("ov4.today","今日待办") + (todayOverdue > 0 ? '，' + todayOverdue + ' ' + t("ov4.overdue","项已逾期") : '') + '"><div class="v">' + todayOpen + (todayOverdue > 0 ? '<span class="ov4-badge">' + todayOverdue + '</span>' : '') + '</div><div class="l">' + t("ov4.today","今日待办") + '</div></div>' +
    '<div class="overview-card ov4-clickable" data-ov4-goto="office" role="button" tabindex="0" aria-label="' + t("ov4.meetings","本周会议") + '"><div class="v">' + weekMeetings + '</div><div class="l">' + t("ov4.meetings","本周会议") + '</div></div>' +
    '<div class="overview-card ov4-clickable" data-ov4-goto="life" role="button" tabindex="0" aria-label="' + t("ov4.bills","本月缴费") + '"><div class="v">' + monthBills + '</div><div class="l">' + t("ov4.bills","本月缴费") + '</div></div>' +
    '<div class="overview-card ov4-clickable" data-ov4-goto="life" role="button" tabindex="0" aria-label="' + t("ov4.sport","本周运动") + '"><div class="v">' + weekSport + '</div><div class="l">' + t("ov4.sport","本周运动") + '</div></div>' +
    '</div>';
  const days=[], counts=[];
  for(let i=13;i>=0;i--){ const d=new Date(); d.setDate(d.getDate()-i);
    days.push(pad(d.getMonth()+1)+"/"+pad(d.getDate()));
    counts.push(tasks.filter(t=>t.status==="done"&&t.doneAt&&sameDay(t.doneAt,d.getFullYear(),d.getMonth(),d.getDate())).length); }
  const lineChart = lineChartSVG(counts, "var(--accent)") +
    `<div class="u-fs-2xs u-text-muted u-mt-1">${days[0]} — ${days[days.length-1]} · ${t("overview.trend.axisLabel", "每日完成任务数")}</div>`;

  const now=new Date(), y=now.getFullYear(), m=now.getMonth();
  const first=new Date(y,m,1).getDay(), dim=new Date(y,m+1,0).getDate();
  const cells=[]; for(let i=0;i<first;i++) cells.push(null);
  for(let d=1;d<=dim;d++) cells.push(d);
  const lvl=c=> c===0?"l0": c<=2?"l1": c<=4?"l2": c<=9?"l3":"l4";
  const heat=`<div class="heat">`+
    ["日","一","二","三","四","五","六"].map(w=>`<div class="dow">${w}</div>`).join("")+
    cells.map(d=> d? `<div class="hcell ${lvl(tasks.filter(t=>t.status==="done"&&t.doneAt&&sameDay(t.doneAt,y,m,d)).length)}">${d}</div>`
                   : `<div class="hcell u-bg-transparent"></div>`).join("")+
    `</div><div class="u-fs-2xs u-text-muted u-mt-1h">${t("overview.heatmap.legend", "本月每日完成密度（颜色越深越多）")}</div>`;

  const bars = ORDER.map(sc=>{
    const s=SCENARIOS[sc]; const all=tasks.filter(t=>t.sc===sc);
    const dn=all.filter(t=>t.status==="done").length; const tot=all.length;
    const pct= tot? Math.round(dn/tot*100):0;
    return `<div class="bar"><span class="nm">${s.name}</span>
      <span class="track"><span class="fill" style="width:${pct}%;background:${s.color}"></span></span>
      <span class="v">${dn}/${tot}</span></div>`;
  }).join("");

  const todayTitle = _overviewView === "all" ? "全部待办" : "今日待办";
  const todaySub = _overviewView === "all" ? "所有未完成的任务（按优先级排序，点击跳转场景）" : "今天到期与逾期的任务（按优先级排序，点击跳转场景）";
  const todayHtml = _overviewView === "all" ? _renderAllTopHtml() : _renderTodayTopHtml();
  const overviewNav = `<nav class="set-nav overview-view-nav" aria-label="概览视图切换" data-i18n-aria="a11y.overviewViewSwitch">
    <button type="button" class="set-nav-btn${_overviewView==="today"?" active":""}" data-overview-view="today" data-i18n="overview.today">今日</button>
    <button type="button" class="set-nav-btn${_overviewView==="all"?" active":""}" data-overview-view="all" data-i18n="overview.all">全部</button>
  </nav>`;

  $("#main").innerHTML = sanitizeHtml(
    `<div class="card page-head-card"><header class="page-head sc-page-head">
      <span class="ph-ic" aria-hidden="true">${UI_ICONS.overview}</span>
      <div class="ph-tx"><h2 data-i18n="overview.homeTitle">主页</h2><p class="sub" data-i18n="overview.homeSub">系统概况 · 全局搜索 · 数据速览</p></div>
      <div class="ph-actions"><button type="button" class="addbtn sm" id="btnOpenReport" data-sc="accent" data-i18n="overview.advReport">高级报表</button></div>
    </header></div>
    ${overviewNav}
    ${overview4}
    ${renderSystemOverviewCard()}
    <div class="overview-grid">
      <div class="ov-sec-h" data-i18n="overview.sysData">系统数据</div>
     <div class="card ov-span2"><h2>${ic("search")} 全局搜索</h2>
        <div class="glob-filters">
          <input id="globSearch" class="glob-search-main" placeholder="关键词，如 周报 / 跑步…" data-i18n-placeholder="field.globSearchPh">
          <select id="globFSc" aria-label="按场景筛选" data-i18n-aria="a11y.filterByScene"><option value="">全部场景</option>${ORDER.map(sc=>`<option value="${esc(sc)}">${esc(SCENARIOS[sc].name)}</option>`).join("")}</select>
          <select id="globFStatus" aria-label="按状态筛选" data-i18n-aria="a11y.filterByStatus"><option value="">全部状态</option><option value="todo">待办</option><option value="doing">进行中</option><option value="done">已完成</option></select>
          <button type="button" id="globAdvToggle" class="addbtn sm glob-adv-toggle" aria-expanded="false" data-i18n="overview.filter">筛选 ▸</button>
        </div>
        <div class="glob-filters-adv" id="globAdv" hidden>
          <select id="globFDate" aria-label="按日期筛选" data-i18n-aria="a11y.filterByDate"><option value="">不限日期</option><option value="today">今天到期</option><option value="overdue">已逾期</option><option value="week">本周到期</option></select>
          <input id="globFTag" placeholder="标签，如 紧急" data-i18n-placeholder="field.globFTagPh">
          <button type="button" id="globAdvClear" class="addbtn sm u-flex-auto" data-sc="muted" data-i18n="overview.clearFilter">清除筛选</button>
        </div>
        <div class="glob-views" id="globViews"></div>
        <div id="globRes" class="u-mt-2h"></div></div>
     <div class="ov-sec-h" data-i18n="overview.bizData">业务数据</div>
     <div class="card"><h2>${ic("check")} ${todayTitle}</h2>
       <p class="sub">${todaySub}</p>
       ${todayHtml}
       <h3 data-i18n="overview.sceneProgress">各场景进度</h3><div class="bars">${bars}</div>
     </div>
	     <div class="card"><h2>${ic("grid")} 数据速览</h2>
	       <p class="sub" data-i18n="overview.trendSub">完成趋势与本月密度</p>
	       <h3 data-i18n="overview.trendTitle">完成趋势（近 14 天）</h3>${lineChart}
	       <h3 data-i18n="overview.heatTitle">日历热力图（本月）</h3>${heat}
	     </div>
	     <div class="ov-span2">${renderHabitChainCard()}</div>
	     <div class="ov-span2">${renderAiHubCard()}</div>
     <div class="ov-sec-h" data-i18n="overview.vizSection">数据可视化制作</div>
     <div class="ov-span2"><div class="card ov-viz-card"><h2>${ic("grid")} 数据可视化制作</h2><p class="sub" data-i18n="overview.vizSub">用画布自由编排图表，展示业务与系统数据</p><button type="button" class="addbtn" id="btnOpenChartStore" data-sc="accent" data-i18n="overview.openViz">打开图表制作器</button></div></div>
     </div>`);

  // 全局搜索 oninput 同步响应（保证空状态即时渲染；搜索范围小，无需防抖）
  const _globSearchDebounced = () => {
    const v = ($("#globSearch").value || "").trim().toLowerCase();
    renderGlob(v);
  };
  const gs=$("#globSearch"); if(gs) gs.oninput=_globSearchDebounced;
  ["globFSc","globFStatus","globFDate","globFTag"].forEach(id=>{
    const el=$("#"+id); if(!el) return;
    if(id==="globFTag"){ el.oninput=_globSearchDebounced; } // 标签输入同样防抖
    else { el.onchange=()=> renderGlob(($("#globSearch").value||"").trim().toLowerCase()); }
  });
  // v2.2.0：高级筛选折叠区（日期/标签默认收起）
  const advT=$("#globAdvToggle");
  if(advT) advT.onclick=()=>{
    const adv=$("#globAdv"); if(!adv) return;
    const willShow=adv.hasAttribute("hidden");
    if(willShow) adv.removeAttribute("hidden"); else adv.setAttribute("hidden","");
    advT.setAttribute("aria-expanded", willShow?"true":"false");
    advT.textContent=willShow?t("filter.collapse","筛选 ▾"):t("filter.expand","筛选 ▸");
    if(!willShow){ /* 收起时若有残留筛选值则清空，避免不可见的过滤条件 */ }
  };
  const advC=$("#globAdvClear");
  if(advC) advC.onclick=()=>{
    const d=$("#globFDate"), g=$("#globFTag");
    if(d) d.value=""; if(g) g.value="";
    renderGlob(($("#globSearch").value||"").trim().toLowerCase());
  };
  renderGlobViews();
  // v3.1：概览页视图切换（今日/全部）
  $$("#main .overview-view-nav .set-nav-btn").forEach(b=>{
    b.onclick = ()=>{ _overviewView = b.getAttribute("data-overview-view")||"today"; renderOverview(); };
  });
  // P7：数据可视化制作入口（修复 openChartStore 死入口）
  const csv=$("#btnOpenChartStore"); if(csv) csv.onclick = (typeof openChartStore==="function") ? openChartStore : function(){};
  // v2.2.0：KPI 卡点击跳转
  $$(".ov-kpi-item[data-kpi-act]").forEach(b=>{
    b.onclick=()=>{
      const act = b.getAttribute("data-kpi-act");
      if(act==="office"){ setActive("office"); render(); }
      else if(act==="stats"){ setActive("stats"); render(); }
      else if(act==="chain"){ if(typeof openDrawer==="function"){ openDrawer(); _switchSetTab("set-chain"); } }
    };
  });
  // A4 AI 教练：异步加载建议 + 绑定刷新按钮
  const cr=$("#coachRefresh");
  if(cr) cr.onclick=()=>{ try{ localStorage.removeItem(COACH_CACHE_KEY); }catch(e){ /* noop */ } renderOverview(); };
  const cl=$("#coachLoading");
  if(cl){
    fetchCoachAdvice().then(r => {
      if(r.ok && r.advice.length){
        _aiHubContent.coach = r.advice.join("\n"); // v3.2.1：缓存供"在 AI 助手中讨论"使用
    cl.outerHTML = r.advice.map((a, i) => `<div class="coach-item"><span class="idx">${i+1}</span><span>${esc(a)}</span></div>`).join("") +
      `<div class="ai-hub-actions"><button type="button" class="ai-discuss-btn" data-discuss-type="coach"><span class="ic-inline" aria-hidden="true">${UI_ICONS.robot}</span><span>在 AI 助手中讨论</span></button></div>`;
      } else if(!r.ok && r.reason !== "no-ai"){
        cl.textContent = t("coach.adviceUnavailable", "暂无法获取建议（{reason}），请稍后重试").replace("{reason}", r.reason);
      }
    }).catch(()=>{ /* 静默失败，保留 loading 文案 */ });
  }
  // v2.2.0：AI Hub tab 切换（会话级状态，重渲染保留）
  $$(".ai-hub-tab").forEach(b=>{
    b.onclick=()=>{
      _aiHubTab = b.getAttribute("data-ai-tab") || "coach";
      renderOverview();
    };
  });
  // v2.3.0：系统概况卡数字项点击跳转
  $$(".sys-ov-item[data-act]").forEach(b=>{
    b.onclick=()=>{
      const act = b.getAttribute("data-act");
      if(act==="overview"){ setActive("overview"); render(); }
      else if(act==="office"){ setActive("office"); render(); }
      else if(act==="stats"){ setActive("stats"); render(); }
      else if(act==="chain"){ if(typeof openDrawer==="function"){ openDrawer(); _switchSetTab("set-chain"); } }
    };
  });
  // v2.3.0：系统概况卡 AI 设置链接（v3.1.2 修复：原 _switchSetTab("set-ai") 指向不存在的分区，
  // 点击后设置页所有 nav 失活+所有 card 隐藏 → 整页空白；AI 配置自 v1.15 起是独立页，改走 openAiPage）
  // v3.2.1 修复：写 pending 标志，配置完成后 saveCfg 会自动展开聊天面板 + 聚焦（无场景模式：sc 留空）
  $$(".sys-ov-ai a[data-act='ai-setup']").forEach(a=>{
    a.onclick=(e)=>{
      e.preventDefault();
      try{
        save(PREFIX + "__pendingAiAsk", JSON.stringify({ sc: "", hintKey: "overview-setup", ts: Date.now() }));
      }catch(_){ /* noop */ }
      if(typeof openAiPage==="function"){ openAiPage(); }
    };
  });
  // v2.2.1：主页今日待办点击跳场景 / 「还有 N 项」跳办公场景看板
  $$("#ovTodayList .ov-today-item").forEach(li=>{
    li.onclick=()=>{
      const sc = li.getAttribute("data-goto-sc");
      if(sc){ setActive(sc); render(); }
    };
  });
  const moreBtn=$("#ovTodayMore");
  if(moreBtn) moreBtn.onclick=()=>{ setActive("office"); render(); };
  // v1.4-D AI 每日报告：绑定按钮
  const drBtn=$("#dailyReportBtn");
  if(drBtn) drBtn.onclick=()=> handleDailyReport();
  // v1.6-A AI 智能推荐：绑定按钮
  const arBtn=$("#aiRecommendBtn");
  if(arBtn) arBtn.onclick=()=> handleAiRecommend();
  // v1.5-D 高级报表：绑定入口按钮 + 弹窗内事件
  const rBtn=$("#btnOpenReport");
  if(rBtn) rBtn.onclick=()=>{ openReportModal("week", 0); bindReportModal(); };
}

/* ---------- v1.4-D AI 每日报告卡片 ---------- */
/**
 * 渲染 AI 日报卡片（含按钮 + 结果展示区）
 * @returns {string} HTML 字符串
 */
function renderDailyReportCard(){
  const cfg = getCfg();
  if(!cfg.enabled){
    return `<div class="coach-hint">${t("dailyReport.noAi", "尚未启用 AI。配置 API Key 后可生成每日报告。")}</div>`;
  }
  return `<p class="sub">${t("dailyReport.sub", "基于昨日完成任务、今日待办与联动状态，AI 生成每日报告")}</p>` +
    `<button type="button" class="daily-report-btn" id="dailyReportBtn">${t("dailyReport.btn", "生成今日报告")}</button>` +
    `<div id="dailyReportResult"></div>`;
}
/**
 * 处理 AI 日报按钮点击：调用 generateDailyReport 并渲染结果
 * @returns {Promise<void>}
 */
async function handleDailyReport(){
  const resultEl=$("#dailyReportResult");
  const btn=$("#dailyReportBtn");
  if(btn) btn.disabled=true;
  if(resultEl) resultEl.innerHTML=sanitizeHtml(`<div class="coach-hint">${t("dailyReport.loading", "正在生成每日报告…")}</div>`);
  try{
    const r = await generateDailyReport();
    if(r.ok && r.report){
      _aiHubContent.daily = r.report; // v3.2.1：缓存供讨论按钮使用
      if(resultEl) resultEl.innerHTML=sanitizeHtml(`<div class="md-body">${mdToHtml(r.report)}</div><div class="ai-hub-actions"><button type="button" class="ai-discuss-btn" data-discuss-type="daily"><span class="ic-inline" aria-hidden="true">${UI_ICONS.robot}</span><span>在 AI 助手中讨论</span></button></div>`);
    } else {
      const hint = r.reason==="no-ai" ? t("dailyReport.noAiHint", "尚未启用 AI，请先配置 API Key") : (t("dailyReport.fail", "生成失败：") + (r.reason || t("tool.unknownErrorMsg", "未知错误")));
      if(resultEl) resultEl.innerHTML=sanitizeHtml(`<div class="coach-hint">${esc(hint)}</div>`);
    }
  }catch(err){
    if(resultEl) resultEl.innerHTML=sanitizeHtml(`<div class="coach-hint">${t("dailyReport.fail", "生成失败：")}${esc(err && err.message || t("tool.unknownErrorMsg", "未知错误"))}</div>`);
  }finally{
    if(btn) btn.disabled=false;
  }
}

/* ---------- v1.6-A AI 智能推荐卡片 ---------- */
/**
 * 渲染 AI 智能推荐卡片（含按钮 + 结果展示区）
 * @returns {string} HTML 字符串
 */
function renderAiRecommendCard(){
  const cfg = getCfg();
  if(!cfg.enabled){
    return `<div class="coach-hint">${t("aiRecommend.noAi", "尚未启用 AI。配置 API Key 后可获得个性化行动建议。")}</div>`;
  }
  return `<p class="sub">${t("aiRecommend.sub", "基于你的任务数据，AI 推荐 3 条下一步行动")}</p>` +
    `<button type="button" class="ai-recommend-btn" id="aiRecommendBtn">${t("aiRecommend.btn", "获取智能推荐")}</button>` +
    `<div id="aiRecommendResult"></div>`;
}
/**
 * v1.6-A：处理 AI 智能推荐按钮点击：调用 aiSmartRecommend 并渲染 3 条建议
 * @returns {Promise<void>}
 */
async function handleAiRecommend(){
  const resultEl=$("#aiRecommendResult");
  const btn=$("#aiRecommendBtn");
  if(btn) btn.disabled=true;
  if(resultEl) resultEl.innerHTML=sanitizeHtml(`<div class="coach-hint">${t("aiRecommend.loading", "正在分析你的任务数据…")}</div>`);
  try{
    const advice = await aiSmartRecommend();
    if(advice && advice.length){
      _aiHubContent.recommend = advice.join("\n"); // v3.2.1：缓存供讨论按钮使用
      const html = `<div class="ai-recommend-list">` +
        advice.map((a, i) => `<div class="ai-recommend-item"><span class="idx">${i+1}</span><span>${esc(a)}</span></div>`).join("") +
        `</div>` +
        `<div class="ai-hub-actions"><button type="button" class="ai-discuss-btn" data-discuss-type="recommend"><span class="ic-inline" aria-hidden="true">${UI_ICONS.robot}</span><span>在 AI 助手中讨论</span></button></div>`;
      if(resultEl) resultEl.innerHTML=sanitizeHtml(html);
    }else{
      if(resultEl) resultEl.innerHTML=sanitizeHtml(`<div class="coach-hint">${t("aiRecommend.empty", "暂无推荐建议，请先配置 AI API Key 或添加一些任务。")}</div>`);
    }
  }catch(err){
    if(resultEl) resultEl.innerHTML=sanitizeHtml(`<div class="coach-hint">${t("aiRecommend.fail", "获取推荐失败：")}${esc(err && err.message || t("tool.unknownErrorMsg", "未知错误"))}</div>`);
  }finally{
    if(btn) btn.disabled=false;
  }
}

/* ---------- v2.3.0 系统概况卡（新手可读的业务/系统全貌） ---------- */
/**
 * 渲染系统概况卡：简洁数字清单（icon + 数字 + 标签，可点击跳转）+ AI 助手状态行 + 新手提示
 * @returns {string} HTML 字符串
 */
function renderSystemOverviewCard(){
  const tasks = getTasks().filter(t => !t.deletedAt);
  const notes = getNotes().filter(n => !n.deletedAt);
  const links = getLinks();
  const plugins = getEnabledPlugins();
  const chains = links.filter(l => l.enabled !== false);
  let recCount = 0;
  ORDER.forEach(sc => { recCount += getRec(sc).length; });
  const scenarios = ORDER.length;
  const done = tasks.filter(t => t.status === "done").length;
  const cfg = getCfg();
  const aiEnabled = cfg && cfg.enabled;

  const items = [
    { label: t("stats.scene","场景"), value: scenarios, act: "overview", ic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v4m0 14v4M4.22 4.22l2.83 2.83m9.9 9.9 2.83 2.83M1 12h4m14 0h4M4.22 19.78l2.83-2.83m9.9-9.9 2.83-2.83"/></svg>' },
    { label: t("stats.tasks","任务"), value: tasks.length, act: "office", ic: UI_ICONS.check },
    { label: t("stats.done","已完成"), value: done, act: "stats", ic: UI_ICONS.stats },
    { label: t("stats.material","资料"), value: recCount, act: "overview", ic: UI_ICONS.file },
    { label: t("stats.notes","笔记"), value: notes.length, act: "overview", ic: UI_ICONS.book },
    { label: t("nav.chain", "场景联动"), value: chains.length, act: "chain", ic: UI_ICONS.chain },
    { label: t("nav.apps", "插件"), value: plugins.length, act: "overview", ic: UI_ICONS.puzzle }
  ];

  const listHtml = items.map(it => `
    <button type="button" class="sys-ov-item clickable" data-act="${it.act}" title="${t("sysOv.item.title", "点击进入 {label}")}".replace("{label}", it.label)}">
      <span class="sys-ov-ic" aria-hidden="true">${it.ic}</span>
      <span class="sys-ov-val">${it.value}</span>
      <span class="sys-ov-lbl">${it.label}</span>
    </button>`).join("");

  const aiStatusHtml = aiEnabled
    ? `<span class="sys-ov-ai-ok" aria-hidden="true">${ic("check")}</span><span>${t("sysOv.ai.enabled", "AI 助手：已启用")}</span>`
    : `<span class="sys-ov-ai-warn" aria-hidden="true">${ic("alert")}</span><span>${t("sysOv.ai.disabled", "AI 助手：未启用")} · <a href="#" data-act="ai-setup">${t("sysOv.ai.goSetup", "去设置")}</a></span>`;

  return `
    <div class="card sys-overview-card">
      <header class="card-head">
        <h2><span class="ic-inline" aria-hidden="true">${UI_ICONS.stats}</span>${t("sysOv.title", "系统概况")}</h2>
        <p class="sub">${t("sysOv.sub", "新手快速了解：点击数字直达对应功能 · 侧栏「说明」查看使用指南")}</p>
      </header>
      <div class="sys-ov-grid">${listHtml}</div>
      <div class="sys-ov-ai">${aiStatusHtml}</div>
      <div class="sys-ov-tip">${t("sysOv.tip", "提示：点击任意数字跳转对应页面 · 侧栏「说明」查看使用指南")}</div>
    </div>`;
}

/* ---------- v2.2.0 AI 助手 Hub 卡（教练/日报/推荐三卡合一，tab 切换） ---------- */
let _aiHubTab = "coach"; // 会话级 tab 状态（coach / daily / recommend），跨 renderOverview 保留
function renderAiHubCard(){
  const cfg = getCfg();
  const tabs = [
    { id: "coach",     label: t("aiHub.tab.coach", "习惯教练") },
    { id: "daily",     label: t("aiHub.tab.daily", "每日报告") },
    { id: "recommend", label: t("aiHub.tab.recommend", "智能推荐") }
  ];
  const cur = tabs.some(x=>x.id===_aiHubTab) ? _aiHubTab : "coach";
  const tabBtns = tabs.map(x=>`<button type="button" class="set-nav-btn ai-hub-tab${x.id===cur?" active":""}" data-ai-tab="${x.id}">${x.label}</button>`).join("");
  let body;
  if(cur === "coach") body = renderCoachCard();
  else if(cur === "daily") body = renderDailyReportCard();
  else body = renderAiRecommendCard();
  return `<div class="card ai-hub-card"><h2>${ic("robot")}${t("chat.aiAssistant", "AI 助手")}</h2>` +
    `<nav class="set-nav ai-hub-tabs" aria-label="${t("aiHub.ariaLabel", "AI 助手分区")}">${tabBtns}</nav>` +
    `<div class="ai-hub-body" data-ai-panel="${cur}">${body}</div>` +
    (cfg.enabled ? "" : `<p class="sub u-mt-2">${t("aiHub.noAiSub", "三个能力共用一份 AI 配置（设置 → AI）")}</p>`) +
    `</div>`;
}
/* ---------- v2.2.0 主页 KPI：今日待办 / 总任务 / 完成率 / 本周完成 / 当前连续 ---------- */
function _calcTodayKpi(){
  const tasks = getTasks().filter(t=>!t.deletedAt);
  const stats = calcStats();
  const today0 = new Date(); today0.setHours(0,0,0,0);
  const todayDone = tasks.filter(t => t.status==="done" && t.doneAt && t.doneAt >= today0.getTime()).length;
  const daySet = new Set();
  tasks.filter(t=>t.status==="done" && t.doneAt).forEach(t=>daySet.add(_ymd(new Date(t.doneAt))));
  const curD = new Date(today0);
  if(!daySet.has(_ymd(curD))) curD.setDate(curD.getDate()-1);
  let currentStreak = 0;
  while(daySet.has(_ymd(curD))){ currentStreak++; curD.setDate(curD.getDate()-1); }
  const todayYmd = todayStr();
  const todayTodo = tasks.filter(t => t.status!=="done" && t.due && t.due <= todayYmd).length;
  const overdue = tasks.filter(t => t.status!=="done" && t.due && t.due < todayYmd).length;
  return { todayTodo, overdue, total: stats.total, rate: stats.rate, weekDone: stats.weekDone, todayDone, currentStreak };
}
function _renderOvKpi(){
  const k = _calcTodayKpi();
  const items = [
    { label: t("ovKpi.todayTodo", "今日待办"), value: k.todayTodo, extra: k.overdue ? `<span class="stats-wow down">${k.overdue} ${t("ovKpi.overdue", "逾期")}</span>` : "", act: "office" },
    { label: t("ovKpi.total", "总任务"), value: k.total, act: "stats" },
    { label: t("ovKpi.rate", "完成率"), value: k.rate + "%", act: "stats" },
    { label: t("ovKpi.weekDone", "本周完成"), value: k.weekDone, act: "stats" },
    { label: t("ovKpi.currentStreak", "当前连续"), value: k.currentStreak + t("ovKpi.streakUnit", " 天"), act: "chain" }
  ];
  return `<div class="card ov-kpi-card"><div class="stats-cards">` + items.map(c =>
    `<button type="button" class="stats-card ov-kpi-item${c.act?" clickable":""}" data-kpi-act="${c.act||""}" title="${c.act==="office"?t("ovKpi.todayTodo.title", "查看今天要处理"):c.act==="stats"?t("ovKpi.stats.title", "打开统计"):c.act==="chain"?t("ovKpi.chain.title", "打开场景联动"):""}">` +
    `<div class="stats-card-val">${c.value}${c.extra||""}</div><div class="stats-card-lbl">${c.label}</div></button>`
  ).join("") + `</div></div>`;
}

/* ---------- v2.2.1 主页今日待办列表（复用 renderToday 的排序逻辑，点击跳场景） ---------- */
function _renderTodayTopHtml(){
  const tasks = getActiveTasks();
  const today = todayStr();
  const pendingToday = tasks.filter(x=>x.status!=="done" && x.due && x.due<=today);
  const top5 = pendingToday.slice().sort((a,b)=>{
    const pa = _priWeight(a.priority), pb = _priWeight(b.priority);
    if(pa !== pb) return pa - pb;
    return a.due < b.due ? -1 : 1;
  }).slice(0, 5);
  if(top5.length === 0){
    return `<div class="empty today-empty">${t("overview.today.empty", "今天没有待处理的事项，去各场景添加任务吧")}</div>`;
  }
  const items = top5.map(x=>{
    const s = scMeta(x.sc);
    const overdue = x.due < today;
    return `<li class="top3-item ov-today-item" data-goto-sc="${esc(x.sc)}" title="${t("overview.today.itemTitle", "点击进入「{name}」场景")}".replace("{name}", esc(s.name))}">
      <span class="dot" style="background:${s.color}"></span>
      <span class="title">${esc(x.title)}${overdue ? `<span class="ov-overdue-tag">${t("overview.overdue.tag", "逾期")}</span>` : ""}</span>
      <span class="sc-name">${s.name}</span>
    </li>`;
  }).join("");
  const more = pendingToday.length > 5 ? `<button type="button" class="top3-expand" id="ovTodayMore">${t("overview.today.more", "还有 {n} 项待处理 ▸").replace("{n}", pendingToday.length - 5)}</button>` : "";
  return `<ul class="top3-list" id="ovTodayList">${items}</ul>${more}`;
}

/* ---------- v3.1 概览页「全部待办」列表（所有未完成任务，按优先级排序） ---------- */
function _renderAllTopHtml(){
  const tasks = getActiveTasks();
  const today = todayStr();
  const pending = tasks.filter(x=>x.status!=="done").slice().sort((a,b)=>{
    const pa = _priWeight(a.priority), pb = _priWeight(b.priority);
    if(pa !== pb) return pa - pb;
    if(a.due && b.due && a.due!==b.due) return a.due < b.due ? -1 : 1;
    if(a.due && !b.due) return -1;
    if(!a.due && b.due) return 1;
    return 0;
  });
  const top5 = pending.slice(0, 5);
  if(top5.length === 0){
    return `<div class="empty today-empty">${t("overview.all.empty", "没有待处理的事项，去各场景添加任务吧")}</div>`;
  }
  const items = top5.map(x=>{
    const s = scMeta(x.sc);
    const overdue = x.due && x.due < today;
    return `<li class="top3-item ov-today-item" data-goto-sc="${esc(x.sc)}" title="${t("overview.today.itemTitle", "点击进入「{name}」场景")}".replace("{name}", esc(s.name))}">
      <span class="dot" style="background:${s.color}"></span>
      <span class="title">${esc(x.title)}${overdue ? `<span class="ov-overdue-tag">${t("overview.overdue.tag", "逾期")}</span>` : ""}</span>
      <span class="sc-name">${s.name}</span>
    </li>`;
  }).join("");
  const more = pending.length > 5 ? `<button type="button" class="top3-expand" id="ovTodayMore">${t("overview.today.more", "还有 {n} 项待处理 ▸").replace("{n}", pending.length - 5)}</button>` : "";
  return `<ul class="top3-list" id="ovTodayList">${items}</ul>${more}`;
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
  const W = 560, H = 180, padL = 36, padR = 12, padT = 14, padB = 28;
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
    `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="2.5" fill="${c}"><title>${t("statsChart.dot.title", "{date}：{count} 个").replace("{date}", data[pts.indexOf(p)].date).replace("{count}", data[pts.indexOf(p)].count)}</title></circle>`
  ).join("");
  return `<svg class="stats-trend-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${t("statsChart.trend.aria", "任务完成趋势图")}">` +
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
  const R = 80, CX = 90, CY = 90;
  if(total === 0){
    return `<div class="stats-pie-empty">${t("statsChart.pie.empty", "暂无任务数据")}</div>`;
  }
  let svg = `<svg class="stats-pie-svg" viewBox="0 0 180 180" role="img" aria-label="${t("statsChart.pie.aria", "场景分布饼图")}">`;
  let acc = 0;
  dist.forEach(d => {
    if(d.count === 0) return;
    const start = acc / total * 2 * Math.PI - Math.PI / 2;
    acc += d.count;
    const end = acc / total * 2 * Math.PI - Math.PI / 2;
    const large = (end - start) > Math.PI ? 1 : 0;
    const x1 = CX + R * Math.cos(start), y1 = CY + R * Math.sin(start);
    const x2 = CX + R * Math.cos(end), y2 = CY + R * Math.sin(end);
    svg += `<path d="M${CX},${CY} L${x1.toFixed(2)},${y1.toFixed(2)} A${R},${R} 0 ${large} 1 ${x2.toFixed(2)},${y2.toFixed(2)} Z" fill="${d.color}"><title>${t("statsChart.pie.title", "{name}：{count} 个（{pct}%）").replace("{name}", esc(d.name)).replace("{count}", d.count).replace("{pct}", d.pct)}</title></path>`;
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
  const dows = [t("weekday.mon","一"),t("weekday.tue","二"),t("weekday.wed","三"),t("weekday.thu","四"),t("weekday.fri","五"),t("weekday.sat","六"),t("weekday.sun","日")];
  const periods = [t("period.morning","早（5-12）"),t("period.afternoon","午（12-18）"),t("period.evening","晚（18-5）")];
  let html = `<div class="hourdist"><div class="hourdist-head"></div>` +
    periods.map(p => `<div class="hourdist-head">${p}</div>`).join("");
  grid.forEach((row, dow) => {
    html += `<div class="hourdist-dow">${t("hourDist.dowPrefix", "周")}${dows[dow]}</div>`;
    row.forEach(cell => {
      html += `<div class="hourdist-cell hd-l${lvl(cell.count)}" title="${t("hourDist.cell.title", "周{dow} · {period}：{count} 个完成")}".replace("{dow}", dows[dow]).replace("{period}", periods[cell.period]).replace("{count}", cell.count)}"></div>`;
    });
  });
  return html + `</div>`;
}
/**
 * 渲染统计视图（关键指标卡片 + 趋势图 + 饼图 + 时段分布 + 联动触发率）
 * @returns {void}
 */
/* v2.2.0：统计页仪表盘编辑态（会话级；Grafana 式展示/配置两态） */
let _dashEditMode = false;
let _statsRange = "week"; // v3.1：统计页时间筛选：week | month | year
function renderStats(){
  // v3.1：根据时间筛选设置趋势图天数
  if(_statsRange === "month"){ _statsTrendDays = 30; }
  else if(_statsRange === "year"){ _statsTrendDays = 365; }
  else { _statsTrendDays = 7; }
  const stats = calcStats();
  // T4.2：无任何任务数据时显示 no-stats 空状态（替代空图表/空饼图）
  if(stats.total === 0){
    _dashEditMode = false;
    $("#main").innerHTML = sanitizeHtml(`<div class="card">` + renderEmpty("no-stats") + `</div>`);
    appendFoot(); // v3.4.5：空数据分支补尾栏（此前直接 return 漏掉——与其他页面统一）
    return;
  }
  const statsNav = `<nav class="set-nav stats-range-nav" aria-label="${t("statsPage.aria", "统计时间筛选")}">
    <button type="button" class="set-nav-btn${_statsRange==="week"?" active":""}" data-stats-range="week">${t("statsPage.week", "周")}</button>
    <button type="button" class="set-nav-btn${_statsRange==="month"?" active":""}" data-stats-range="month">${t("statsPage.month", "月")}</button>
    <button type="button" class="set-nav-btn${_statsRange==="year"?" active":""}" data-stats-range="year">${t("statsPage.year", "年")}</button>
  </nav>`;
  const headHtml = `<div class="card page-head-card"><header class="page-head sc-page-head">
    <span class="ph-ic" aria-hidden="true">${SIDE_MENU_ICONS.dash}</span>
    <div class="ph-tx"><h2>${_dashEditMode ? t("statsPage.editTitle", "编辑仪表盘") : t("nav.dash", "仪表盘")}</h2><p class="sub">${_dashEditMode ? t("statsPage.editSub", "拖拽排列组件、增删调整，完成后点击「完成编辑」") : t("statsPage.sub", "可自定义仪表盘——拖拽排列组件，布局自动保存")}</p></div>
    <div class="ph-actions">
      <button type="button" class="${_dashEditMode ? "btn-primary" : "addbtn sm"}" id="btnDashToggleEdit" data-sc="accent">
        ${_dashEditMode ? t("statsPage.doneEdit", "✓ 完成编辑") : t("statsPage.editLayout", "⚙ 编辑布局")}
      </button>
    </div>
  </header></div>
  ${statsNav}
  <div id="dashHost">${renderCustomDashboard(_dashEditMode)}</div>`;

  $("#main").innerHTML = sanitizeHtml(headHtml);

  const host = $("#dashHost");
  if(host){
    /* 编辑/完成切换（Grafana 式两态） */
    const tg = $("#btnDashToggleEdit");
    if(tg) tg.onclick = ()=>{
      _dashEditMode = !_dashEditMode;
      renderStats();
    };
    /* 工具条 + tab + 报表入口（容器级委托）；DnD 仅编辑态有意义但绑定无副作用 */
    _bindDashToolbar(host, _dashEditMode);
    if(typeof bindDashboardDnD === "function") bindDashboardDnD(host, _dashEditMode);
  }
  // v3.1：统计页时间筛选切换
  $$("#main .stats-range-nav .set-nav-btn").forEach(b=>{
    b.onclick = ()=>{ _statsRange = b.getAttribute("data-stats-range")||"week"; renderStats(); };
  });
  appendFoot(); // v3.4.5：renderStats 自含尾栏——编辑布局/时间筛选重渲染后不再依赖调用方补（此前 tab 点击后尾栏消失）
}
/* ============================================================
 * v2.4.0 四大新页面：任务中心 / 工具箱 / 商店 / 场景联动
 * 路由键：active = "tasks" / "toolbox" / "store" / "chainpage"
 * ============================================================ */

/* ---------- 任务中心（跨场景三视图） ---------- */
let _tasksView = "kanban"; // 会话级：kanban | calendar | todo
function renderTasksPage(){
  const tasks = getActiveTasks();
  const today = todayStr();
  let body;
  if(_tasksView === "calendar"){
    body = `<div class="card"><h2>${ic("overview")}${t("appPage.calview", "日历")}</h2><div class="cal-inline">${renderCalendarView(0)}</div></div>`;
    $("#main").innerHTML = sanitizeHtml(_tasksHeadHtml() + body);
    bindCalendarEvents();
    _bindTasksTabs();
    appendFoot();
    return;
  }
  if(_tasksView === "todo"){
    const pending = tasks.filter(x=>x.status!=="done").sort((a,b)=>{
      const pa=_priWeight(a.priority), pb=_priWeight(b.priority);
      if(pa!==pb) return pa-pb;
      if(a.due && b.due && a.due!==b.due) return a.due<b.due?-1:1;
      if(a.due && !b.due) return -1;
      if(!a.due && b.due) return 1;
      return 0;
    });
    const rows = pending.map(x=>{
      const s = scMeta(x.sc);
      const overdue = x.due && x.due < today;
      return `<li class="todo-row" data-task-id="${esc(x.id)}">
        <input type="checkbox" class="todo-chk" data-tasks-done="${esc(x.id)}" aria-label="完成" data-i18n-aria="a11y.complete">
        <span class="dot" style="background:${s.color};width:8px;height:8px;border-radius:50%;flex-shrink:0" title="${esc(s.name)}"></span>
        <span class="todo-title">${esc(x.title)}</span>
        <span class="todo-meta">
          <span class="pri ${x.priority||"none"}">${esc(x.priority||"-")}</span>
          ${x.due?`<span class="due${overdue?" od":""}">${esc(x.due)}</span>`:""}
          <span class="todo-st">${esc(s.name)}</span>
        </span>
      </li>`;
    }).join("");
    body = `<div class="card"><h2>${ic("target")}${t("tasksPage.todo", "待办清单")} <span class="cnt-pill">${pending.length}</span></h2>` +
      (pending.length ? `<ul class="todo-list">${rows}</ul>` : renderEmpty("no-today")) + `</div>`;
    $("#main").innerHTML = sanitizeHtml(_tasksHeadHtml() + body);
    $$("#main [data-tasks-done]").forEach(chk=>{
      chk.onchange = ()=>{
        const id = chk.getAttribute("data-tasks-done");
        if(chk.checked && typeof completeTask==="function"){ completeTask(id); }
      };
    });
    $$("#main .todo-row .todo-title").forEach(el=>{
      el.onclick = ()=>{ const id = el.closest(".todo-row").getAttribute("data-task-id"); if(typeof openTaskEdit==="function") openTaskEdit(id); };
    });
    _bindTasksTabs();
    appendFoot();
    return;
  }
  /* kanban（默认）：跨场景三状态列 */
  const cols = [
    { key:"todo",  label:t("status.todo","待办") },
    { key:"doing", label:t("status.doing","进行中") },
    { key:"done",  label:t("status.done","已完成") }
  ];
  const colHtml = cols.map(c=>{
    const list = tasks.filter(x=>(x.status||"todo")===c.key).sort((a,b)=>{
      const pa=_priWeight(a.priority), pb=_priWeight(b.priority);
      if(pa!==pb) return pa-pb;
      if(a.due && b.due) return a.due<b.due?-1:1;
      return 0;
    });
    const cards = list.map(x=>{
      const s = scMeta(x.sc);
      const overdue = x.due && x.due<t && x.status!=="done";
      return `<div class="kcard" data-tasks-card="${esc(x.id)}" tabindex="0" role="button" aria-label="${esc(x.title)}">
        <div class="t">${esc(x.title)}</div>
        <div class="m">
          <span class="tag" style="background:${s.color}22;color:${s.color}">${esc(s.name)}</span>
          ${x.priority&&x.priority!=="none"?`<span class="pri ${x.priority}">${esc(x.priority)}</span>`:""}
          ${x.due?`<span class="due${overdue?" od":""}">${esc(x.due)}</span>`:""}
        </div>
      </div>`;
    }).join("");
    return `<div class="kcol"><h4>${c.label}<span class="n">${list.length}</span></h4>${cards || ""}</div>`;
  }).join("");
  body = `<div class="card"><h2>${ic("grid")}${t("tasksPage.kanban", "任务看板")} <span class="sub u-m-0">${t("tasksPage.kanban.sub", "点击卡片编辑 · 全场景")}</span></h2><div class="kanban">${colHtml}</div></div>`;
  $("#main").innerHTML = sanitizeHtml(_tasksHeadHtml() + body);
  $$("#main [data-tasks-card]").forEach(card=>{
    card.onclick = ()=>{ const id = card.getAttribute("data-tasks-card"); if(typeof openTaskEdit==="function") openTaskEdit(id); };
  });
  _bindTasksTabs();
  appendFoot();
}
function _tasksHeadHtml(){
  const tabs = [["kanban",t("tasksPage.tab.kanban", "看板")],["calendar",t("appPage.calview", "日历")],["todo",t("kanban.todo", "待办")]];
  // v3.0：视图切换移出标题栏（标题栏高度与其他页面统一），置于标题卡下方独立菜单栏
  return `<div class="card page-head-card"><header class="page-head sc-page-head">
    <span class="ph-ic" aria-hidden="true">${SIDE_MENU_ICONS.tasks||""}</span>
    <div class="ph-tx"><h2>${t("tasksPage.title", "任务")}</h2><p class="sub">${t("tasksPage.sub", "跨场景任务中心——所有场景的任务在这里统一管理")}</p></div>
    <div class="ph-actions"><button type="button" class="addbtn sm" id="btnBackHome" data-sc="muted">${t("tasksPage.backHome", "← 主页")}</button></div>
  </header></div>
  <nav class="set-nav tasks-view-tabs" aria-label="${t("tasksPage.aria", "任务视图切换")}">${tabs.map(([k,l])=>
    `<button type="button" class="set-nav-btn tasks-tab${_tasksView===k?" active":""}" data-tasks-view="${k}">${l}</button>`).join("")}</nav>`;
}
function _bindTasksTabs(){
  $$("#main .tasks-tab").forEach(b=>{
    b.onclick = ()=>{ _tasksView = b.getAttribute("data-tasks-view")||"kanban"; renderTasksPage(); };
  });
  const backHome = $("#btnBackHome");
  if(backHome) backHome.onclick = function(){ setActive("overview"); render(); }; // v3.1.2：内联 onclick 被 sanitizeHtml 剥离导致死按钮，改 id+绑定
}

/* ---------- 工具箱（19 工具 + 插件小件 + 功能入口，分类 + 搜索） ---------- */
const TOOLBOX_EXTRAS = [
  { id:"x-cal",     name:"日历",     desc:"按月查看任务分布", cat:"效率工具", icon:UI_ICONS.calendar, run:()=>{ const m=$("#calendarModal"); if(m){ const b=$("#calendarModalBody"); if(b && typeof renderCalendarView==="function") b.innerHTML=sanitizeHtml(renderCalendarView(0)); m.classList.add("show"); } } },
  { id:"x-weather", name:t("tool.weather.name","天气"),     desc:t("tool.weather.desc","今日 + 未来几日预报"), cat:"效率工具", icon:UI_ICONS.sun, run:()=>{ if(typeof openWeatherModal==="function") openWeatherModal(); } },
  { id:"x-alarm",   name:t("tool.alarm.name","闹钟"),     desc:t("tool.alarm.desc","多任务 · 循环 · 贪睡"), cat:"效率工具", icon:UI_ICONS.bell, run:()=>{ if(typeof openAlarmModal==="function") openAlarmModal(); } },
  { id:"x-pomo",    name:t("tool.pomo.name","笃行"),     desc:t("tool.pomo.desc","25 分钟专注 + 5 分钟休息"), cat:"效率工具", icon:UI_ICONS.flame, pop:"pomoPop", menuAttr:"plug-pomo" },
  { id:"x-tracker", name:t("tool.tracker.name","时间追踪"), desc:t("tool.tracker.desc","任务计时秒表"), cat:"效率工具", icon:UI_ICONS.stopwatch, pop:"trackerPop", menuAttr:"plug-tracker" },
  { id:"x-pet",     name:t("tool.pet.name","萌宠"),     desc:t("tool.pet.desc","桌面陪伴小伙伴"), cat:"效率工具", icon:UI_ICONS.paw, run:()=>{ if(typeof openPetModal==="function") openPetModal(); } },
  { id:"x-mindmap", name:t("tool.mindmap.name","思维导图"), desc:t("tool.mindmap.desc","任务关系树状图"), cat:"功能", icon:UI_ICONS.mindmap, run:()=>{ if(typeof openMindmapModal==="function") openMindmapModal(); } },
  /* v3.6.6 死入口修复：openGanttModal / openDashboardModal 此前只绑在 #btnGantt / #btnDashboard 上，
     而这两个按钮自 v1.15「更多菜单移除」后已不存在于 DOM → 两个弹窗（甘特图 / 自定义仪表盘 15 组件）
     全无 UI 入口。按既有惯例（思维导图 / 知识库 / 笔记 / 高级报表同在此处）补工具箱入口。 */
  { id:"x-gantt",   name:t("tool.gantt.name","甘特图"),   desc:t("tool.gantt.desc","任务时间线视图"), cat:"功能", icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/><rect x="5" y="4" width="8" height="4" rx="1"/></svg>', run:()=>{ if(typeof openGanttModal==="function") openGanttModal(); } },
  { id:"x-dashboard", name:t("tool.dashboard.name","自定义仪表盘"), desc:t("tool.dashboard.desc","拖拽编排 15 个组件"), cat:"功能", icon:UI_ICONS.gauge, run:()=>{ if(typeof openDashboardModal==="function") openDashboardModal(); } },
  { id:"x-kb",      name:t("tool.kb.name","知识库"),   desc:t("tool.kb.desc","资料卡片与全文检索"), cat:"功能", icon:UI_ICONS.kb, run:()=>{ if(typeof openKnowledgeBaseModal==="function") openKnowledgeBaseModal(); } },
  { id:"x-notes",   name:t("tool.notes.name","笔记"),     desc:t("tool.notes.desc","标签 / 分类 / 任务关联"), cat:"功能", icon:UI_ICONS.book, run:()=>{ if(typeof openNotesModal==="function") openNotesModal(); } },
  { id:"x-report",  name:t("tool.report.toolboxName","高级报表"), desc:t("tool.report.desc","周 / 月 / 年报与对比"), cat:"功能", icon:UI_ICONS.stats, run:()=>{ if(typeof openReportModal==="function") openReportModal(); } },
  { id:"x-tpl",     name:t("tool.tpl.name","场景模板"), desc:t("tool.tpl.desc","一键导入预设任务集"), cat:"功能", icon:UI_ICONS.puzzle, run:()=>{ if(typeof openTemplateModal==="function") openTemplateModal(); } }
];
let _toolboxCat = "全部";
let _toolboxQ = "";
function renderToolboxPage(){
  const cats = ["全部","文档","设计","编程","生活","检索","功能","效率工具"];
  const catKeyMap = {"全部":"all","文档":"doc","设计":"design","编程":"coding","生活":"life","检索":"search","功能":"func","效率工具":"efficiency"};
  const apps = [];
  Object.keys(TOOL_APPS).forEach(id=>{
    const a = TOOL_APPS[id];
    const catMap = { "off":"文档", "des":"设计", "cod":"编程", "lif":"生活", "stu":"检索" };
    apps.push({ id:id, toolId:id, name:a.name, desc:a.desc||"", icon:a.icon, cat:catMap[id.slice(0,3)]||"功能" });
  });
  TOOLBOX_EXTRAS.forEach(x=>apps.push(x));
  const q = _toolboxQ.trim().toLowerCase();
  const list = apps.filter(a=>(_toolboxCat==="全部"||a.cat===_toolboxCat) &&
    (!q || (a.name+" "+a.desc).toLowerCase().includes(q)));
  // v3.0：工具箱分类菜单复用设置页菜单栏样式（.set-nav + .set-nav-btn），求同：与设置页一致
  const chips = `<nav class="set-nav" aria-label="${t("toolbox.aria", "工具箱分类")}">` + cats.map(c=>`<button type="button" class="set-nav-btn${_toolboxCat===c?" active":""}" data-toolbox-cat="${c}">${t("tool.cat."+catKeyMap[c], c)}</button>`).join("") + `</nav>`;
  const cards = list.map(a=>{
    const attrs = a.pop ? ` data-menu="${a.menuAttr}"` : "";
    return `<button type="button" class="card app-card toolbox-card"${attrs} data-toolbox="${esc(a.toolId||a.id)}" role="button" tabindex="0" aria-label="${esc(a.name)}">
      <span class="app-card-ic" aria-hidden="true">${a.icon||""}</span>
      <span class="toolbox-cat-tag">${esc(t("tool.cat."+catKeyMap[a.cat], a.cat))}</span>
      <div class="app-card-tx"><div class="app-card-name">${esc(a.name)}</div><div class="app-card-desc">${esc(a.desc)}</div></div>
    </button>`;
  }).join("");
  $("#main").innerHTML = sanitizeHtml(
    `<div class="card page-head-card"><header class="page-head sc-page-head">
      <span class="ph-ic" aria-hidden="true">${SIDE_MENU_ICONS.toolbox||""}</span>
      <div class="ph-tx"><h2>${t("toolbox.title", "工具箱")}</h2><p class="sub">${t("toolbox.sub", "文档 · 设计 · 编程 · 生活 · 检索 · 效率工具——所有工具与应用的统一入口（Ctrl+K 可直达）")}</p></div>
      <span class="ph-act"><button type="button" class="page-back" id="btnBackHome" aria-label="${t("toolbox.backHome", "← 主页")}">${t("toolbox.backHome", "← 主页")}</button></span>
    </header></div>
    ${chips}
    <div class="tool-filter-bar u-mb-2"><input type="text" id="toolboxQ" placeholder="${t("toolbox.searchPlaceholder", "搜索工具…")}" value="${esc(_toolboxQ)}" class="u-flex-1" aria-label="${t("toolbox.searchAria", "搜索工具")}"></div>
    <div class="app-grid">${cards || ""}</div>`);
  const backHome = $("#btnBackHome");
  if(backHome) backHome.onclick = function(){ setActive("overview"); render(); }; // v3.1.2：内联 onclick 被 sanitizeHtml 剥离导致死按钮，改 id+绑定
  const qi = $("#toolboxQ");
  if(qi){
    qi.oninput = ()=>{ _toolboxQ = qi.value; renderToolboxPage(); const nq=$("#toolboxQ"); if(nq){ nq.focus(); nq.setSelectionRange(nq.value.length,nq.value.length); } };
  }
  $$("#main [data-toolbox-cat]").forEach(b=>{
    b.onclick = ()=>{ _toolboxCat = b.getAttribute("data-toolbox-cat"); renderToolboxPage(); };
  });
  $$("#main .toolbox-card").forEach(card=>{
    card.onclick = function(){
      const id = card.getAttribute("data-toolbox");
      if(TOOL_APPS[id]){ openToolStub(id); return; }
      const extra = TOOLBOX_EXTRAS.find(x=>x.id===id);
      if(!extra) return;
      if(extra.pop){ if(typeof toggleToolPop==="function") toggleToolPop(extra.pop, card); return; }
      if(extra.run){ extra.run(); }
    };
  });
  appendFoot();
}

/* ---------- 商店（插件市场） ----------
   v2.4.0：内置插件随启动自动注册（enabled=false），商店按「未注册/已装未启用/启用中」
   三态渲染统一卡片列表；自定义导入插件走同一列表。 */
let _storeCat = "全部"; // v3.1：商店页分类筛选：全部/效率/功能/场景/其他
const PLUGIN_CATEGORIES = { // v3.1：内置插件分类映射
  "pomodoro":"效率", "habit-tracker":"效率", "focus-timer":"效率",
  "reading":"场景", "finance":"场景",
  "budget":"功能", "health":"功能", "weather":"功能", "quote":"功能", "mindmap":"功能"
};
function _pluginCategory(p){
  if(p && p.category) return p.category;
  if(p && p.id && PLUGIN_CATEGORIES[p.id]) return PLUGIN_CATEGORIES[p.id];
  if(p && Array.isArray(p.scenarios) && p.scenarios.length) return "场景";
  return "其他";
}
function renderStorePage(){
  const seen = {};
  const rows = [];
  BUILTIN_PLUGINS.forEach(b=>{ rows.push({ def:b, inst:getPlugin(b.id) }); seen[b.id]=1; });
  getAllPlugins().forEach(p=>{ if(!seen[p.id]) rows.push({ def:p, inst:p }); });
  // v3.1：按分类筛选
  const filteredRows = _storeCat==="全部" ? rows : rows.filter(row=> _pluginCategory(row.inst||row.def)===_storeCat);
  const pCard = (row)=>{
    const p = row.inst || row.def;
    const installed = !!row.inst;
    const enabled = !!(p && p.enabled);
    const scen = Array.isArray(p.scenarios) ? p.scenarios.map(s=>s.name).join("、") : "";
    let ops;
    if(!installed){
      ops = `<button type="button" class="addbtn sm" data-sc="accent" data-store-install="${esc(p.id)}">${t("storePage.install", "安装")}</button>`;
    } else if(enabled){
      ops = `<span class="store-on" aria-label="${t("storePage.enabledAria", "启用中")}">${t("storePage.enabled", "● 启用中")}</span>
             <button type="button" class="addbtn sm" data-sc="muted" data-store-toggle="${esc(p.id)}" data-on="1">${t("storePage.disable", "禁用")}</button>
             <button type="button" class="addbtn sm danger" data-store-uninstall="${esc(p.id)}">${t("storePage.uninstall", "卸载")}</button>`;
    } else {
      ops = `<button type="button" class="addbtn sm" data-sc="accent" data-store-toggle="${esc(p.id)}" data-on="0">${t("storePage.enable", "启用")}</button>
             <button type="button" class="addbtn sm danger" data-store-uninstall="${esc(p.id)}">${t("storePage.uninstall", "卸载")}</button>`;
    }
    return `<div class="card app-card store-card" role="group" aria-label="${esc(p.name)}">
      <div class="app-card-tx u-flex-1 u-min-w-0">
        <div class="app-card-name">${esc(p.name)} <span class="sub u-m-0 u-inline">v${esc(p.version||"1.0.0")}</span></div>
        <div class="app-card-desc">${esc(p.description||"")}</div>
        ${scen?`<div class="app-card-desc u-text-faint">${t("storePage.scenarios", "提供场景：")}${esc(scen)}</div>`:""}
      </div>
      <div class="store-ops">${ops}</div>
    </div>`;
  };
  const storeCats = ["全部","效率","功能","场景","其他"];
  const storeCatKeyMap = {"全部":"all","效率":"efficiency","功能":"func","场景":"scene","其他":"other"};
  const storeNav = `<nav class="set-nav store-cat-nav" aria-label="${t("storePage.aria", "商店分类筛选")}">` +
    storeCats.map(c=>`<button type="button" class="set-nav-btn${_storeCat===c?" active":""}" data-store-cat="${c}">${t("store.cat."+storeCatKeyMap[c], c)}</button>`).join("") + `</nav>`;
  $("#main").innerHTML = sanitizeHtml(
    `<div class="card page-head-card"><header class="page-head sc-page-head">
      <span class="ph-ic" aria-hidden="true">${UI_ICONS.shop}</span>
      <div class="ph-tx"><h2>${t("storePage.title", "商店")}</h2><p class="sub">${t("storePage.sub", "插件与应用市场——安装后按类型自动挂载到对应位置")}</p></div>
      <button type="button" class="addbtn sm" id="storeImportBtn" data-sc="accent">${t("storePage.importBtn", "导入插件 JSON")}</button>
      <button type="button" class="addbtn sm" id="btnBackHome" data-sc="muted">${t("storePage.backHome", "← 主页")}</button>
    </header></div>
    ${storeNav}
    <div class="store-list">${filteredRows.map(pCard).join("") || '<div class="empty">' + t("storePage.empty", "暂无可用的插件") + '</div>'}</div>`);
  const backHome = $("#btnBackHome");
  if(backHome) backHome.onclick = function(){ setActive("overview"); render(); }; // v3.1.2：内联 onclick 被 sanitizeHtml 剥离导致死按钮，改 id+绑定
  $$("#main [data-store-install]").forEach(b=>{
    b.onclick = ()=>{
      const def = BUILTIN_PLUGINS.find(x=>x.id===b.getAttribute("data-store-install"));
      if(def && loadPlugin(def)){ toast(t("storePage.installToast", "已安装「{name}」").replace("{name}", def.name),"ok"); renderStorePage(); }
    };
  });
  $$("#main [data-store-toggle]").forEach(b=>{
    b.onclick = ()=>{
      const id = b.getAttribute("data-store-toggle");
      const on = b.getAttribute("data-on")==="1";
      if(setPluginEnabled(id, !on)){ toast(on?t("storePage.disableToast", "已禁用"):t("storePage.enableToast", "已启用"),"ok"); renderStorePage(); }
    };
  });
  $$("#main [data-store-uninstall]").forEach(b=>{
    b.onclick = ()=>{
      const id = b.getAttribute("data-store-uninstall");
      if(confirm(t("storePage.uninstallConfirm", "卸载该插件？其数据将保留但功能移除。"))){ unloadPlugin(id); toast(t("storePage.uninstalledToast", "已卸载"),"ok"); renderStorePage(); }
    };
  });
  const imp = $("#storeImportBtn");
  if(imp) imp.onclick = ()=>{ if(typeof prompt!=="function") return;
    const json = prompt(t("storePage.importPrompt", "粘贴插件 JSON 定义："));
    if(json===null) return;
    const r = registerPluginFromJson(json);
    if(r && r.ok){ toast(t("storePage.importOkToast", "插件导入成功"),"ok"); renderStorePage(); }
    else toast((r&&r.err)||t("storePage.importFailToast", "导入失败"),"warn");
  };
  // v3.1：商店分类菜单切换
  $$("#main .store-cat-nav .set-nav-btn").forEach(b=>{
    b.onclick = ()=>{ _storeCat = b.getAttribute("data-store-cat")||"全部"; renderStorePage(); };
  });
  appendFoot();
}

/* ---------- 场景联动页（打卡记录 + 联动关系图 + 联动记录 + 触发统计 + 配置入口） ---------- */
var _chainTab = "streak"; // 顶层声明：当前 tab（streak|graph|status|rate）
function renderChainPage(){
  const tabs = [
    {id:"streak",label:t("chainPage.tab.streak","打卡记录"),icon:"flame"},
    {id:"graph",label:t("chainPage.tab.graph","联动关系"),icon:"mindmap"},
    {id:"status",label:t("chainPage.tab.status","联动状态"),icon:"chain"},
    {id:"rate",label:t("chainPage.tab.rate","触发统计"),icon:"target"}
  ];
  const tabBar = '<div class="chain-tab-bar">' + tabs.map(function(tb){
    return '<button type="button" class="chain-tab' + (_chainTab===tb.id ? " active" : "") + '" data-chain-tab="' + tb.id + '">' + ic(tb.icon) + " " + tb.label + '</button>';
  }).join("") + '</div>';

  var page = "";
  if(_chainTab === "streak"){
    const badges = ORDER.filter(function(sc){return SCENARIOS[sc];}).map(function(sc){
      const st = calcStreak(sc); const days = st.current || 0;
      /* v3.6.5：原先用 emoji 表示连续打卡状态，已统一改为全站矢量图标（UI_ICONS.flame / UI_ICONS.theme）；
         按连续天数分级（lv0 未开始 / lv1 起步 / lv2 坚持 / lv3 习惯养成），
         卡片加顶部彩条 + 渐变底 + 数字带"天"单位，与全站徽章/KPI 形制统一。 */
      const lvl = days >= 7 ? 3 : days >= 3 ? 2 : days >= 1 ? 1 : 0;
      const ic = lvl === 0 ? UI_ICONS.theme : UI_ICONS.flame;
      return '<div class="streak-card lv' + lvl + '"><div class="sc-ic">' + ic + '</div>' +
        '<div class="sc-days">' + days + '<span>天</span></div>' +
        '<div class="sc-label">' + SCENARIOS[sc].name + '</div></div>';
    }).join("");
    const activeCount = ORDER.filter(function(sc){return SCENARIOS[sc] && (calcStreak(sc).current||0) > 0;}).length;
    const bestStreak = Math.max.apply(null, [0].concat(ORDER.filter(function(sc){return SCENARIOS[sc];}).map(function(sc){return calcStreak(sc).current||0;})));
    page = '<div class="chain-page active"><div class="card"><h2>' + ic("flame") + " Streak 总览</h2>" +
      '<div class="kpi-grid"><div class="kpi"><div class="v">' + activeCount + '</div><div class="l">活跃场景</div></div>' +
      '<div class="kpi"><div class="v">' + bestStreak + '</div><div class="l">最长连续(天)</div></div>' +
      '<div class="kpi"><div class="v">' + ORDER.filter(function(sc){return SCENARIOS[sc];}).length + '</div><div class="l">场景总数</div></div></div></div>' +
      '<div class="card"><h3>各场景连续打卡</h3><div class="streak-grid">' + badges + '</div></div></div>';
  }
  else if(_chainTab === "graph"){
    /* v3.6.5：说明卡与图合并 —— 此前"场景联动关系图"单独一个 card 只有标题+一句话说明，
       纯占位无信息量，图又画在 card 外面（无卡片容器、观感突兀）。合并后说明即图的引言。 */
    page = '<div class="chain-page active"><div class="card"><h2>' + ic("mindmap") + " 场景联动关系图</h2>" +
      '<p class="sub">可视化展示场景之间的触发链路</p>' +
      '<div class="graph-wrap">' + renderChainGraph() + '</div></div></div>';
  }
  else if(_chainTab === "status"){
    /* 修复：此前调用不存在的 getHabitChainStatus()，被 typeof 守卫兜成空数组 →
       「联动状态」页恒显示 0 启用规则 / 暂无联动规则（静默错渲染）。真实数据源是 getLinks()。 */
    const chainStatus = getLinks() || [];
    const active = chainStatus.filter(function(c){return c.enabled;}).length;
    const total = chainStatus.length;
    page = '<div class="chain-page active"><div class="card"><h2>' + ic("chain") + " 联动状态</h2>" +
      '<div class="kpi-grid"><div class="kpi"><div class="v">' + active + '</div><div class="l">启用规则</div></div>' +
      '<div class="kpi"><div class="v">' + total + '</div><div class="l">总规则</div></div>' +
      '<div class="kpi"><div class="v">' + (total > 0 ? Math.round(active*100/total) : 0) + '%</div><div class="l">启用率</div></div></div></div>' +
      '<div class="card"><h3>规则列表</h3>' + (chainStatus.length > 0 ? chainStatus.map(function(c){
        return '<div class="bar-row"><span class="label" style="min-width:120px">' + esc(c.name || ((c.fromSc||"")+"→"+(c.toSc||""))) + '</span><span style="flex:1;font-size:var(--fs-sm);color:' + (c.enabled ? "var(--ok)" : "var(--muted)") + '">' + (c.enabled ? "启用" : "停用") + '</span></div>';
      }).join("") : '<div class="empty">暂无联动规则</div>') + '</div></div>';
  }
  else if(_chainTab === "rate"){
    const rates = calcChainSuccess();
    const rows = (rates&&rates.length?rates:[]).map(function(r){
      const from = SCENARIOS[r.fromSc] ? SCENARIOS[r.fromSc].name : r.fromSc;
      const to = SCENARIOS[r.toSc] ? SCENARIOS[r.toSc].name : r.toSc;
      const pct = Math.round(r.rate||0);
      return '<div class="bar-row"><span class="label" style="min-width:140px">' + esc(from+" → " + to) + '</span><span class="track"><span class="fill" style="width:' + pct + '%;background:var(--brand-grad)"></span></span><span class="v">' + pct + '%</span></div>';
    }).join("");
    const avg = rates&&rates.length>0 ? Math.round(rates.reduce(function(a,b){return a+(b.rate||0);},0)/rates.length) : 0;
    page = '<div class="chain-page active"><div class="card"><h2>' + ic("target") + " 触发统计</h2>" +
      '<div class="kpi-grid"><div class="kpi"><div class="v">' + avg + '%</div><div class="l">平均成功率</div></div>' +
      '<div class="kpi"><div class="v">' + (rates?rates.length:0) + '</div><div class="l">联动数</div></div></div></div>' +
      '<div class="card"><h3>各链路成功率</h3>' + (rows||'<div class="empty">暂无触发记录</div>') + '</div></div>';
  }

  $("#main").innerHTML = sanitizeHtml(
    '<div class="card page-head-card"><header class="page-head sc-page-head">' +
    '<span class="ph-ic" aria-hidden="true">' + (SIDE_MENU_ICONS.chain||"") + '</span>' +
    '<div class="ph-tx"><h2>' + t("chainPage.title","场景联动") + '</h2><p class="sub">' + t("chainPage.sub","打卡记录与跨场景自动化规则") + '</p></div>' +
    '<div class="ph-actions"><button type="button" class="addbtn sm" id="btnBackHome" data-sc="muted">' + t("chainPage.backHome","← 主页") + '</button></div>' +
    '</header></div>' + tabBar + page
  );

  $$("#main .chain-tab").forEach(function(btn){
    btn.onclick = function(){ _chainTab = btn.getAttribute("data-chain-tab"); renderChainPage(); };
  });
  var bh = $("#btnBackHome");
  if(bh) bh.onclick = function(){ setActive("overview"); render(); };
  appendFoot();
}

/* ---------- 三个独立 auth 页面（欢迎/登录/注册）---------- */
function _authPageHeader(title, showBack){
  var header = '<div class="card page-head-card"><header class="page-head sc-page-head">';
  if(showBack){
    header += '<button type="button" class="addbtn sm u-fw-600" id="authPageBack" data-sc="muted" style="margin-right:var(--space-2)">← ' + t("auth.back","返回") + '</button>';
  }
  header += '<div class="ph-tx u-flex-1"><h2>' + esc(title) + '</h2></div></header></div>';
  return header;
}

/* ===== v3.5.1 整合：独立页面 auth 提交（模块级）+ 云同步核心 ===== */

/* ---------- auth 提交（供 authlogin/authregister 独立页面调用）---------- */
var _authBusy = false;
function _authErrTo(elId, msg) {
  var el = document.getElementById(elId);
  if (el) el.textContent = msg || "";
}
function _authValidEmail(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s); }

async function _doAuthLogin(email, password) {
  if (_authBusy) return;
  _authErrTo("authPageLoginError", "");
  if (!_authValidEmail(email)) { _authErrTo("authPageLoginError", t("api.emailInvalid", "邮箱格式不正确")); return; }
  if ((password || "").length < 8) { _authErrTo("authPageLoginError", t("api.passwordTooShort", "密码长度至少 8 位")); return; }
  var btn = document.getElementById("authPageLoginSubmit");
  if (btn) { btn.classList.add("loading"); btn.disabled = true; }
  _authBusy = true;
  try {
    var r = await window.apiLogin(email, password);
    if (r.ok) {
      try { toast(t("api.loginSuccess", "登录成功"), "ok"); } catch (_) {}
      try { window._updateUserButton(); } catch (_) {}
      try { window._loadApiPanels(); } catch (_) {}
      try { if (typeof cloudCheckOnLogin === "function") cloudCheckOnLogin(); } catch (_) {}
      setActive("overview"); render();
    } else {
      _authErrTo("authPageLoginError", (r.data && r.data.error) || t("api.loginFailed", "登录失败"));
    }
  } catch (err) {
    _authErrTo("authPageLoginError", (err && err.offline) ? t("api.syncOffline", "离线模式") : t("api.loginFailed", "登录失败"));
  } finally {
    _authBusy = false;
    if (btn) { btn.classList.remove("loading"); btn.disabled = false; }
  }
}

async function _doAuthRegister(name, email, password, confirm, code) {
  if (_authBusy) return;
  _authErrTo("authPageRegisterError", "");
  if (!name) { _authErrTo("authPageRegisterError", t("api.nameRequired", "用户名不能为空")); return; }
  if (!_authValidEmail(email)) { _authErrTo("authPageRegisterError", t("api.emailInvalid", "邮箱格式不正确")); return; }
  if ((password || "").length < 8) { _authErrTo("authPageRegisterError", t("api.passwordTooShort", "密码长度至少 8 位")); return; }
  if (password !== confirm) { _authErrTo("authPageRegisterError", t("api.passwordMismatch", "两次密码不一致")); return; }
  // v3.6.0：邮箱验证码——注册前先点「发送验证码」收码，非空校验
  if (!code || !/^\d{6}$/.test(code)) { _authErrTo("authPageRegisterError", t("api.codeRequired", "请输入邮箱验证码")); return; }
  var btn = document.getElementById("authPageRegisterSubmit");
  if (btn) { btn.classList.add("loading"); btn.disabled = true; }
  _authBusy = true;
  try {
    var r = await window.apiRegister(email, password, name, code);
    if (r.ok) {
      var lr = await window.apiLogin(email, password);
      if (lr.ok) {
        try { toast(t("api.registerSuccess", "注册成功"), "ok"); } catch (_) {}
        try { window._updateUserButton(); } catch (_) {}
        try { window._loadApiPanels(); } catch (_) {}
        try { if (typeof cloudCheckOnLogin === "function") cloudCheckOnLogin(); } catch (_) {}
        setActive("overview"); render();
      } else {
        _authErrTo("authPageRegisterError", (lr.data && lr.data.error) || t("api.loginFailed", "登录失败"));
      }
    } else {
      _authErrTo("authPageRegisterError", (r.data && r.data.error) || t("api.registerFailed", "注册失败"));
    }
  } catch (err) {
    _authErrTo("authPageRegisterError", (err && err.offline) ? t("api.syncOffline", "离线模式") : t("api.registerFailed", "注册失败"));
  } finally {
    _authBusy = false;
    if (btn) { btn.classList.remove("loading"); btn.disabled = false; }
  }
}

/* ---------- 第三方登录 / 邮箱验证码辅助（v3.6.0）----------
 * 微信扫码 + GitHub 快捷登录：都是 OAuth 授权流程。
 * 后端（Electron 版 / 自建服务）提供对应端点；浏览器纯静态形态后端不存在时降级为 toast 提示。
 * 邮箱验证码：注册页「发送验证码」按钮，成功后 60s 倒计时。 */
var _authCodeCountdown = null;
function _authCodeCountdownStop(){
  if(_authCodeCountdown){ clearInterval(_authCodeCountdown); _authCodeCountdown = null; }
  var b = document.getElementById("authPageSendCode");
  if(b){ b.disabled = false; b.textContent = t("api.sendCode", "发送验证码"); }
}
function _sendEmailCode(){
  var email = $("#authPageRegEmail");
  var err = $("#authPageRegisterError");
  if(!email || !email.value){ if(err) err.textContent = t("api.emailRequired", "请先填写邮箱"); return; }
  if(!_authValidEmail(email.value)){ if(err) err.textContent = t("api.emailInvalid", "邮箱格式不正确"); return; }
  var b = document.getElementById("authPageSendCode");
  if(b){ b.disabled = true; b.textContent = t("api.sendingCode", "发送中…"); }
  var promise;
  try{
    if(typeof window.apiSendEmailCode === "function"){
      promise = window.apiSendEmailCode(email.value).then(function(r){
        if(r && r.ok){ if(err) err.textContent = ""; if(b){ b.textContent = t("api.codeSent", "已发送"); } _authCodeCountdownStart(60, b); }
        else{ _authCodeCountdownStop(); if(err) err.textContent = (r && r.data && r.data.error) || t("api.sendCodeFail", "发送失败"); }
      }).catch(function(){
        // try/catch 捕获不到异步拒绝；断网后必须恢复按钮，允许重试。
        _authCodeCountdownStop();
        if(err) err.textContent = t("api.sendCodeFail", "发送失败");
      });
    }else{
      throw new Error("no-api");
    }
  }catch(_e){
    _authCodeCountdownStop();
    if(err) err.textContent = t("api.ssoNoBackend", "当前环境无后端，无法发送验证码");
  }
  return promise;
}
function _authCodeCountdownStart(sec, btn){
  _authCodeCountdownStop();
  var left = sec;
  btn.disabled = true;
  _authCodeCountdown = setInterval(function(){
    left--;
    if(left <= 0){ _authCodeCountdownStop(); return; }
    btn.textContent = t("api.resendCode", "重新发送") + " (" + left + "s)";
  }, 1000);
}

// 第三方登录按钮组（欢迎页 + 登录页复用）
function _authSsoButtons(){
  return '<div class="auth-sso-grid">' +
    '<button type="button" class="auth-sso-btn auth-sso-wechat" id="authSsoWechat">' +
      '<span class="auth-sso-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg></span>' +
      '<span>' + t("auth.wechatLogin", "微信扫码登录") + '</span>' +
    '</button>' +
    '<button type="button" class="auth-sso-btn auth-sso-github" id="authSsoGithub">' +
      '<span class="auth-sso-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/><path d="M9 18c-4.51 2-5-2-7-2"/></svg></span>' +
      '<span>' + t("auth.githubLogin", "GitHub 快捷登录") + '</span>' +
    '</button>' +
  '</div>';
}
// 弹窗打开微信二维码（OAuth 授权页），或后端轮询；纯静态环境无后端则提示
function _openWechatModal(){
  // 用顶部 modal 容器（沿用现有 closeAuthModal 之外的通用 modal 机制不可靠，
  // 这里直接复用 drawer-close 无关的自建浮层，避免依赖具体 modal 结构）
  try{
    _wechatPollStop();
    var previous = document.getElementById("authSsoOverlay");
    if(previous) previous.remove();
    var wrap = document.createElement("div");
    wrap.className = "auth-sso-overlay";
    wrap.id = "authSsoOverlay";
    wrap.innerHTML =
      '<div class="auth-sso-modal">' +
        '<div class="auth-sso-modal-head"><span>' + t("auth.wechatLogin", "微信扫码登录") + '</span><button type="button" class="auth-sso-close" data-close="1" aria-label="' + t("common.close", "关闭") + '">\u00D7</button></div>' +
        '<div class="auth-sso-modal-body" id="authSsoWechatBody">' +
          '<p class="sub u-text-center">' + t("auth.wechatLoading", "正在获取二维码…") + '</p>' +
        '</div>' +
      '</div>';
    document.body.appendChild(wrap);
    wrap.addEventListener("click", function(e){
      if(e.target.closest("[data-close=\"1\"]") || e.target === wrap) {
        _wechatPollStop();
        wrap.remove();
      }
    });
    _wechatPollStart();
  }catch(_e){ /* noop */ }
}
var _wechatTimer = null;
var _wechatGeneration = 0;
function _wechatPollStop(){
  _wechatGeneration++; // 关闭或重开时，使在途二维码/确认响应失效。
  if(_wechatTimer){ clearInterval(_wechatTimer); _wechatTimer = null; }
}
function _wechatPollStart(){
  _wechatPollStop();
  var generation = _wechatGeneration;
  var body = document.getElementById("authSsoWechatBody");
  function current(){ return generation === _wechatGeneration && body && body.isConnected; }
  if(typeof window.apiWechatQrcode !== "function"){ if(body) body.innerHTML = '<div class="empty">' + t("api.ssoNoBackend", "当前环境无后端，无法扫码登录") + '</div>'; return; }
  window.apiWechatQrcode().then(function(r){
    if(!current()) return;
    if(!r || !r.ok || !r.data){ if(body) body.innerHTML = '<div class="empty">' + t("api.ssoNoBackend", "当前环境无后端，无法扫码登录") + '</div>'; return; }
    var d = r.data;
    var qr = d.qr || "";
    var scene = d.scene || "";
    if(body){
      if(qr){
        body.innerHTML = '<div class="auth-wechat-qr"><img src="' + qr + '" alt="' + t("auth.wechatLogin", "微信扫码登录") + '"></div><p class="sub u-text-center">' + t("auth.wechatTip", "打开微信「扫一扫」完成登录") + '</p>';
      }else{
        body.innerHTML = '<div class="empty">' + t("api.ssoNoBackend", "当前环境无后端，无法扫码登录") + '</div>';
      }
    }
    if(scene && typeof window.apiWechatStatus === "function"){
      _wechatTimer = setInterval(function(){
        if(!current()) return;
        window.apiWechatStatus(scene).then(function(sr){
          if(!current() || !sr || !sr.ok || !sr.data) return;
          if(sr.data.status === "expired"){
            _wechatPollStop();
            body.textContent = t("api.wechatExpired", "二维码已过期，请关闭后重新扫码");
            return;
          }
          if(sr.data.status === "confirmed" && sr.data.accessToken){
            _wechatPollStop();
            try{ window.apiSetTokens(sr.data.accessToken, sr.data.refreshToken, Date.now() + 15*60*1000); }catch(_e){}
            var ov = document.getElementById("authSsoOverlay"); if(ov) ov.remove();
            try{ toast(t("api.loginSuccess", "登录成功"), "ok"); }catch(_e){}
            try{ window._loadApiPanels(); }catch(_e){}
            setActive("overview"); render();
          }
        }).catch(function(){});
      }, 2500);
    }
  }).catch(function(){ if(body) body.innerHTML = '<div class="empty">' + t("api.ssoNoBackend", "当前环境无后端，无法扫码登录") + '</div>'; });
}
var _githubAuthRequest = 0;
var _githubAuthSession = null;
function _doGithubLogin(){
  var request = ++_githubAuthRequest;
  _githubAuthSession = null;
  if(typeof window.apiGithubOauthUrl !== "function"){
    try{ toast(t("api.ssoNoBackend", "当前环境无后端，无法 GitHub 登录"), "warn"); }catch(_e){}
    return;
  }
  window.apiGithubOauthUrl().then(function(r){
    if(request !== _githubAuthRequest) return;
    if(!r || !r.ok || !r.data || !r.data.authorizeUrl || typeof r.data.state !== "string" || !r.data.state){
      try{ toast(t("api.ssoNoBackend", "当前环境无后端，无法 GitHub 登录"), "warn"); }catch(_e){}
      return;
    }
    var authorize = new URL(r.data.authorizeUrl, location.href);
    var callback = new URL(window.API_BASE, location.href);
    if(!/^https?:$/.test(authorize.protocol) || !/^https?:$/.test(callback.protocol)) throw new Error("invalid oauth URL");
    var w = window.open(authorize.href, "_blank", "width=520,height=680");
    if(w){
      // 回调必须来自本次登录窗口及配置的 API 来源，不能仅凭消息 type 接收 token。
      _githubAuthSession = { source: w, origin: callback.origin, state: r.data.state, expires: Date.now() + 10*60*1000 };
    }else{ location.href = authorize.href; }
  }).catch(function(){ try{ toast(t("api.ssoNoBackend", "当前环境无后端，无法 GitHub 登录"), "warn"); }catch(_e){} });
}
// GitHub OAuth 回调：后端完成授权后向本窗口 postMessage「agent-github-oauth」回传 token
function _bindAuthSso(){
  var w = document.getElementById("authSsoWechat");
  if(w) w.onclick = function(){ _openWechatModal(); };
  var g = document.getElementById("authSsoGithub");
  if(g) g.onclick = function(){ _doGithubLogin(); };
}
try{
  window.addEventListener("message", function(e){
    var d = e && e.data;
    if(!d || d.type !== "agent-github-oauth") return;
    var session = _githubAuthSession;
    // 回调页可能在 postMessage 后立即关闭；已排队消息仍须按来源/窗口/state 验证。
    if(!session || session.expires < Date.now()) return;
    if(e.source !== session.source || e.origin !== session.origin || d.state !== session.state) return;
    if(typeof d.accessToken !== "string" || !d.accessToken) return;
    _githubAuthSession = null; // 一次性消费，重复消息不得再次切换账号。
    try{ window.apiSetTokens(d.accessToken, d.refreshToken, Date.now() + 15*60*1000); }catch(_e){}
    try{ toast(t("api.loginSuccess", "登录成功"), "ok"); }catch(_e){}
    try{ window._loadApiPanels(); }catch(_e){}
    setActive("overview"); render();
  });
}catch(_e){ /* noop */ }

/* ---------- 云同步快照（来自 v3.5.0 包，含 async 修正 + 调用点接线）---------- */
const SYNC_META_KEY = PREFIX + "sync_meta";
let _cloudConflictNotified = false;

function _getSyncMeta() {
  try { return JSON.parse(localStorage.getItem(SYNC_META_KEY) || "{}") || {}; } catch (e) { return {}; }
}
function _setSyncMeta(patch) {
  try { localStorage.setItem(SYNC_META_KEY, JSON.stringify(Object.assign(_getSyncMeta(), patch))); } catch (e) { /* 配额等：静默 */ }
  _renderLastSync();
}
function _buildCloudSnapshot() {
  const data = {};
  allKeys().forEach(k => {
    if (k === SYNC_META_KEY) return;
    try { const v = localStorage.getItem(k); if (v !== null) data[k] = v; } catch (e) { /* 静默降级 */ }
  });
  data["_deviceMeta"] = { deviceId: getDeviceId(), exportedAt: Date.now(), version: VERSION };
  return data;
}
async function apiGetSnapshot() {
  const r = await window.apiFetch("/api/sync/snapshot", { method: "GET" });
  if (r.ok && r.data && r.data.snapshot) return r.data;
  return null;
}
function _applyCloudSnapshot(data) {
  try {
    const remoteRaw = data[PREFIX + "tasks"];
    let remoteTasks = [];
    try { remoteTasks = typeof remoteRaw === "string" ? JSON.parse(remoteRaw) : (Array.isArray(remoteRaw) ? remoteRaw : []); } catch (e) { remoteTasks = []; }
    if (remoteTasks.length) {
      const localTasks = (typeof getTasks === "function") ? getTasks() : [];
      const map = new Map(localTasks.filter(x => x && x.id).map(x => [x.id, x]));
      remoteTasks.forEach(rt => {
        if (!rt || !rt.id) return;
        const lt = map.get(rt.id);
        if (!lt || (rt.updatedAt || rt.created || 0) > (lt.updatedAt || lt.created || 0)) map.set(rt.id, rt);
      });
      data[PREFIX + "tasks"] = JSON.stringify(Array.from(map.values()));
    }
  } catch (e) { /* 合并失败时按覆盖处理 */ }
  Object.keys(data).forEach(k => {
    if (k === SYNC_META_KEY || k === "_deviceMeta" || k === "_meta") return;
    if (k.startsWith(PREFIX) || k === CUSTOM_LINKS_KEY) {
      try { localStorage.setItem(k, data[k]); } catch (e) { /* 静默降级 */ }
    }
  });
  _setSyncMeta({ lastPullAt: Date.now() });
}
async function cloudCheckOnLogin() {
  if (!window.isApiLoggedIn()) return;
  try {
    const rec = await apiGetSnapshot();
    _renderCloudState(rec);
    if (!rec) { window.doSync(); return; }
    const meta = _getSyncMeta();
    const remoteDevice = (rec.snapshot._deviceMeta && rec.snapshot._deviceMeta.deviceId) || "";
    const fromOther = remoteDevice && remoteDevice !== getDeviceId();
    let hasLocal = false;
    try { hasLocal = !!((typeof getTasks === "function" && getTasks().length) || (load(PREFIX + "records", []) || []).length); } catch (e) { hasLocal = false; }
    if (!hasLocal && fromOther) {
      _applyCloudSnapshot(rec.snapshot);
      try { toast(t("api.cloudRestored", "已从云端恢复数据，页面即将刷新"), "ok"); } catch (_) {}
      setTimeout(() => location.reload(), 1200);
      return;
    }
    if (fromOther && rec.updatedAt > (meta.lastPushAt || 0)) {
      if (!_cloudConflictNotified) {
        _cloudConflictNotified = true;
        try { toast(t("api.cloudNewerToast", "云端有来自其他设备的更新数据，可到「设置 → 账号设置 → 云同步」查看并恢复"), "warn"); } catch (_) {}
      }
      return;
    }
    window.doSync();
  } catch (e) { /* 离线时静默，等下次数据变动再同步 */ }
}
function _renderLastSync() {
  if (typeof document === "undefined") return;
  const el = document.getElementById("apiLastSync");
  if (!el) return;
  const meta = _getSyncMeta();
  const ts = meta.lastPushAt || meta.lastPullAt;
  el.textContent = ts ? new Date(ts).toLocaleString() : t("api.neverSynced", "尚未同步");
}
function _renderCloudState(rec) {
  if (typeof document === "undefined") return;
  const el = document.getElementById("apiCloudState");
  if (!el) return;
  if (rec && rec.updatedAt) {
    const dev = (rec.snapshot && rec.snapshot._deviceMeta && rec.snapshot._deviceMeta.deviceId) || "";
    const suffix = (dev && dev === getDeviceId()) ? t("api.cloudFromThis", "（本机）") : t("api.cloudFromOther", "（其他设备）");
    el.textContent = new Date(rec.updatedAt).toLocaleString() + suffix;
  } else {
    el.textContent = t("api.cloudEmptyShort", "暂无快照");
  }
}

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

/* ---------- ov4 速览卡点击直达场景（补接线，包内缺失）---------- */
function _bindOv4Cards() {
  if (typeof document === "undefined" || document._ov4Bound) return;
  document._ov4Bound = true;
  document.addEventListener("click", function (e) {
    const card = e.target && e.target.closest ? e.target.closest("[data-ov4-goto]") : null;
    if (!card) return;
    const sc = card.getAttribute("data-ov4-goto");
    if (sc && typeof SCENARIOS !== "undefined" && SCENARIOS[sc]) { setActive(sc); render(); }
  });
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Enter" && e.key !== " ") return;
    const card = e.target && e.target.closest ? e.target.closest("[data-ov4-goto]") : null;
    if (!card) return;
    e.preventDefault();
    const sc = card.getAttribute("data-ov4-goto");
    if (sc && typeof SCENARIOS !== "undefined" && SCENARIOS[sc]) { setActive(sc); render(); }
  });
}

/* ---------- 云端快照恢复（设置面板「恢复云端」按钮）---------- */
async function _restoreFromCloud() {
  try {
    const rec = await apiGetSnapshot();
    if (!rec || !rec.snapshot) { try { toast(t("api.cloudEmptyShort", "暂无快照"), "warn"); } catch (_) {} return; }
    if (!confirm(t("api.cloudRestoreConfirm", "将用云端数据覆盖本机数据，确定继续？"))) return;
    _applyCloudSnapshot(rec.snapshot);
    try { toast(t("api.cloudRestored", "已从云端恢复数据，页面即将刷新"), "ok"); } catch (_) {}
    setTimeout(() => location.reload(), 1200);
  } catch (e) { try { toast(t("api.syncError", "同步失败"), "warn"); } catch (_) {} }
}

/* ---------- 云同步按钮委托（面板动态渲染，用 document 级委托）---------- */
document.addEventListener("click", function (e) {
  const el = e.target;
  if (!el || !el.id) return;
  if (el.id === "btnApiSyncNow") { try { window.doSync(); } catch (_) {} }
  if (el.id === "btnApiCloudRestore") { _restoreFromCloud(); }
});

/* ---------- 启动时初始化 ov4 委托 ---------- */
try { _bindOv4Cards(); } catch (_) {}

/* ---------- v3.5.3 图表画布（思维导图 / 流程图 / 架构图 / 拓扑图） ---------- */
const DIAGRAM_KEY = PREFIX + "diagram";
var _dgmSel = null;          // 当前选中节点 id
var _dgmLinkFrom = null;     // 连线模式起点
var _dgmLinkMode = false;

function _dgmLoad() {
  try { return JSON.parse(localStorage.getItem(DIAGRAM_KEY) || "null"); } catch (_) { return null; }
}
function _dgmSave(d) {
  try { localStorage.setItem(DIAGRAM_KEY, JSON.stringify(d)); } catch (_) {}
}
function _dgmUid() { return "n" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

/** 预设模板：返回 {nodes, edges} */
function _dgmPreset(kind) {
  const nodes = [], edges = [];
  const N = function (x, y, text, shape, color) {
    const n = { id: _dgmUid(), x: x, y: y, w: 130, h: 46, text: text, shape: shape || "rect", color: color || "" };
    nodes.push(n); return n;
  };
  const E = function (a, b, label) { edges.push({ from: a.id, to: b.id, label: label || "" }); };
  if (kind === "mind") {
    const root = N(360, 230, t("dgm.center","中心主题"), "ellipse", "var(--accent)");
    const kids = [["分支 1", 90, 70], ["分支 2", 90, 230], ["分支 3", 90, 390], ["分支 4", 640, 70], ["分支 5", 640, 230], ["分支 6", 640, 390]];
    kids.forEach(function (k) { const n = N(k[1], k[2], t("dgm.branch","分支") + " " + (nodes.length), "round"); E(root, n); });
  } else if (kind === "flow") {
    const a = N(360, 40, t("dgm.start","开始"), "round");
    const b = N(360, 150, t("dgm.step","步骤一"));
    const c = N(360, 260, t("dgm.step","步骤二"));
    const d = N(360, 370, t("dgm.decision","判断"), "diamond");
    const e = N(620, 370, t("dgm.end","结束"), "round");
    E(a, b); E(b, c); E(c, d, t("dgm.yes","是")); E(d, e, t("dgm.no","否"));
  } else if (kind === "arch") {
    const ui = N(80, 60, t("dgm.layerUi","前端层"), "round", "var(--accent-2)");
    const api = N(80, 190, t("dgm.layerApi","接口层"));
    const svc = N(80, 320, t("dgm.layerSvc","服务层"));
    const db = N(560, 190, t("dgm.layerDb","数据层"), "round");
    E(ui, api); E(api, svc); E(api, db);
  } else if (kind === "topo") {
    const hub = N(360, 230, t("dgm.hub","核心节点"), "ellipse", "var(--accent)");
    [[80, 80], [360, 60], [640, 80], [80, 380], [360, 400], [640, 380]].forEach(function (p) {
      const n = N(p[0], p[1], t("dgm.node","节点") + " " + (nodes.length), "round"); E(hub, n);
    });
  } else {
    N(360, 220, t("dgm.newNode","新节点"));
  }
  return { nodes: nodes, edges: edges };
}

function _dgmSvgHtml(d) {
  const nodes = d.nodes || [], edges = d.edges || [];
  const byId = {}; nodes.forEach(function (n) { byId[n.id] = n; });
  let out = "";
  // 连线
  edges.forEach(function (e) {
    const a = byId[e.from], b = byId[e.to];
    if (!a || !b) return;
    const ax = a.x + a.w / 2, ay = a.y + a.h / 2, bx = b.x + b.w / 2, by = b.y + b.h / 2;
    const mx = (ax + bx) / 2, my = (ay + by) / 2;
    out += '<line class="dgm-edge" x1="' + ax + '" y1="' + ay + '" x2="' + bx + '" y2="' + by + '" marker-end="url(#dgmArrow)"></line>';
    if (e.label) out += '<text class="dgm-edge-label" x="' + mx + '" y="' + (my - 6) + '">' + esc(e.label) + '</text>';
  });
  // 节点
  nodes.forEach(function (n) {
    const sel = (_dgmSel === n.id) ? " dgm-selected" : "";
    const cx = n.x + n.w / 2, cy = n.y + n.h / 2;
    const fill = n.color ? ' style="fill:' + n.color + ';fill-opacity:.18;stroke:' + n.color + '"' : '';
    let shape;
    if (n.shape === "ellipse") shape = '<ellipse class="dgm-node-shape' + sel + '" data-dgm="' + n.id + '" cx="' + cx + '" cy="' + cy + '" rx="' + (n.w / 2) + '" ry="' + (n.h / 2) + '"' + fill + '></ellipse>';
    else if (n.shape === "round") shape = '<rect class="dgm-node-shape' + sel + '" data-dgm="' + n.id + '" x="' + n.x + '" y="' + n.y + '" width="' + n.w + '" height="' + n.h + '" rx="' + (n.h / 2) + '"' + fill + '></rect>';
    else if (n.shape === "diamond") shape = '<polygon class="dgm-node-shape' + sel + '" data-dgm="' + n.id + '" points="' + cx + ',' + n.y + ' ' + (n.x + n.w) + ',' + cy + ' ' + cx + ',' + (n.y + n.h) + ' ' + n.x + ',' + cy + '"' + fill + '></polygon>';
    else shape = '<rect class="dgm-node-shape' + sel + '" data-dgm="' + n.id + '" x="' + n.x + '" y="' + n.y + '" width="' + n.w + '" height="' + n.h + '" rx="6"' + fill + '></rect>';
    out += shape + '<text class="dgm-node-text" data-dgm="' + n.id + '" x="' + cx + '" y="' + (cy + 4) + '">' + esc(n.text || "") + '</text>';
  });
  return out;
}

function _renderDiagramCanvas() {
  var d = _dgmLoad() || _dgmPreset("free");
  _dgmSave(d);
  var html = '<div class="card"><h2>' + ic("stats") + ' ' + t("dgm.title","图表画布") + '</h2>'
    + '<div class="dgm-toolbar">'
    + '<select id="dgmPresetSel" class="dgm-sel">'
    + '<option value="free">' + t("dgm.preset.free","自由布局") + '</option>'
    + '<option value="mind">' + t("dgm.preset.mind","思维导图") + '</option>'
    + '<option value="flow">' + t("dgm.preset.flow","流程图") + '</option>'
    + '<option value="arch">' + t("dgm.preset.arch","架构图") + '</option>'
    + '<option value="topo">' + t("dgm.preset.topo","拓扑图") + '</option>'
    + '</select>'
    + '<button type="button" class="addbtn sm" id="dgmAdd" data-sc="accent">' + t("dgm.addNode","+ 节点") + '</button>'
    + '<button type="button" class="addbtn sm" id="dgmLink" data-sc="muted">' + t("dgm.link","连线") + '</button>'
    + '<button type="button" class="addbtn sm" id="dgmDel" data-sc="danger-muted">' + t("dgm.del","删除选中") + '</button>'
    + '<button type="button" class="addbtn sm" id="dgmExportSvg" data-sc="muted">' + t("dgm.exportSvg","导出 SVG") + '</button>'
    + '<button type="button" class="addbtn sm" id="dgmExportPng" data-sc="muted">' + t("dgm.exportPng","导出 PNG") + '</button>'
    + '<button type="button" class="addbtn sm" id="dgmClearAll" data-sc="danger-muted">' + t("dgm.clear","清空") + '</button>'
    + '</div>'
    + '<p class="sub">' + t("dgm.hint","拖拽移动节点 · 双击改文字 · 点「连线」后依次点两个节点建立连线") + '</p>'
    + '<div class="dgm-wrap"><svg id="dgmCanvas" class="dgm-svg" viewBox="0 0 860 520" xmlns="http://www.w3.org/2000/svg">'
    + '<defs><marker id="dgmArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"></path></marker></defs>'
    + _dgmSvgHtml(d)
    + '</svg></div></div>';
  /* 功能卡渲染器必须「返回 HTML」（由场景渲染器插入），插入后再绑定交互 */
  setTimeout(function () { try { _dgmBind(); } catch (_) {} }, 0);
  return html;
}

function _dgmBind() {
  var svg = $("#dgmCanvas"); if (!svg) return;
  function redraw() {
    var d = _dgmLoad() || { nodes: [], edges: [] };
    var defs = svg.querySelector("defs");
    svg.innerHTML = "";
    if (defs) svg.appendChild(defs);
    var tmp = document.createElementNS("http://www.w3.org/2000/svg", "g");
    tmp.innerHTML = _dgmSvgHtml(d);
    while (tmp.firstChild) svg.appendChild(tmp.firstChild);
    _dgmBind();
  }
  // 拖拽
  var drag = null;
  svg.addEventListener("mousedown", function (e) {
    var t2 = e.target.closest ? e.target.closest("[data-dgm]") : null;
    if (!t2) return;
    var id = t2.getAttribute("data-dgm");
    if (_dgmLinkMode) return; // 连线模式走 click
    var d = _dgmLoad(); var n = (d.nodes || []).find(function (x) { return x.id === id; });
    if (!n) return;
    _dgmSel = id;
    var pt = svg.getBoundingClientRect();
    drag = { id: id, ox: e.clientX - pt.left * (860 / pt.width) - n.x, oy: e.clientY - pt.top * (520 / pt.height) - n.y };
    e.preventDefault();
  });
  svg.addEventListener("mousemove", function (e) {
    if (!drag) return;
    var d = _dgmLoad(); var n = (d.nodes || []).find(function (x) { return x.id === drag.id; });
    if (!n) return;
    var pt = svg.getBoundingClientRect();
    n.x = Math.max(0, Math.min(860 - n.w, e.clientX - pt.left * (860 / pt.width) - drag.ox));
    n.y = Math.max(0, Math.min(520 - n.h, e.clientY - pt.top * (520 / pt.height) - drag.oy));
    _dgmSave(d);
    // 轻量重绘（拖拽中只更新该节点位置）
    var shape = svg.querySelector('[data-dgm="' + n.id + '"]');
    var txt = svg.querySelectorAll('[data-dgm="' + n.id + '"]');
    redraw();
  });
  svg.addEventListener("mouseup", function () { if (drag) { drag = null; redraw(); } });
  svg.addEventListener("mouseleave", function () { if (drag) { drag = null; redraw(); } });
  // 选中 / 连线 / 改文字
  svg.addEventListener("click", function (e) {
    var t2 = e.target.closest ? e.target.closest("[data-dgm]") : null;
    if (!t2) return;
    var id = t2.getAttribute("data-dgm");
    if (_dgmLinkMode) {
      if (!_dgmLinkFrom) { _dgmLinkFrom = id; try { toast(t("dgm.pickSecond","已选起点，请点第二个节点"), "info"); } catch (_) {} }
      else if (_dgmLinkFrom !== id) {
        var d = _dgmLoad();
        d.edges = d.edges || [];
        d.edges.push({ from: _dgmLinkFrom, to: id, label: "" });
        _dgmSave(d);
        _dgmLinkFrom = null; _dgmLinkMode = false;
        redraw();
      }
      return;
    }
    _dgmSel = id; redraw();
  });
  svg.addEventListener("dblclick", function (e) {
    var t2 = e.target.closest ? e.target.closest("[data-dgm]") : null;
    if (!t2) return;
    var id = t2.getAttribute("data-dgm");
    var d = _dgmLoad(); var n = (d.nodes || []).find(function (x) { return x.id === id; });
    if (!n) return;
    var v = prompt(t("dgm.editText","修改节点文字"), n.text || "");
    if (v !== null) { n.text = v; _dgmSave(d); redraw(); }
  });
  // 工具栏
  var sel = $("#dgmPresetSel");
  if (sel) sel.onchange = function () {
    if (!confirm(t("dgm.presetConfirm","切换模板会替换当前画布内容，确定？"))) { sel.value = ""; return; }
    _dgmSave(_dgmPreset(sel.value));
    _dgmSel = null; _dgmLinkFrom = null;
    render();
  };
  var add = $("#dgmAdd");
  if (add) add.onclick = function () {
    var d = _dgmLoad(); d.nodes = d.nodes || [];
    d.nodes.push({ id: _dgmUid(), x: 320 + Math.random() * 120, y: 200 + Math.random() * 100, w: 130, h: 46, text: t("dgm.newNode","新节点"), shape: "rect", color: "" });
    _dgmSave(d); render();
  };
  var link = $("#dgmLink");
  if (link) link.onclick = function () {
    _dgmLinkMode = !_dgmLinkMode; _dgmLinkFrom = null;
    try { toast(_dgmLinkMode ? t("dgm.linkOn","连线模式：依次点两个节点") : t("dgm.linkOff","已退出连线模式"), "info"); } catch (_) {}
  };
  var del = $("#dgmDel");
  if (del) del.onclick = function () {
    if (!_dgmSel) { try { toast(t("dgm.noneSel","请先点选一个节点"), "warn"); } catch (_) {} return; }
    var d = _dgmLoad();
    d.nodes = (d.nodes || []).filter(function (x) { return x.id !== _dgmSel; });
    d.edges = (d.edges || []).filter(function (e) { return e.from !== _dgmSel && e.to !== _dgmSel; });
    _dgmSel = null; _dgmSave(d); render();
  };
  var svgBtn = $("#dgmExportSvg");
  if (svgBtn) svgBtn.onclick = function () {
    var el = $("#dgmCanvas"); if (!el) return;
    var src = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 860 520" width="860" height="520" style="background:#fff;color:#333">'
      + '<style>.dgm-node-shape{fill:#fff;stroke:#333;stroke-width:1.5}.dgm-node-text{font:14px sans-serif;text-anchor:middle;fill:#222}.dgm-edge{stroke:#666;stroke-width:1.5}.dgm-edge-label{font:12px sans-serif;text-anchor:middle;fill:#666}</style>'
      + el.innerHTML.replace(/<defs>[\s\S]*?<\/defs>/, '<defs><marker id="dgmArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#666"></path></marker></defs>')
      + '</svg>';
    var blob = new Blob([src], { type: "image/svg+xml" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "diagram.svg"; a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 3000);
  };
  var pngBtn = $("#dgmExportPng");
  if (pngBtn) pngBtn.onclick = function () {
    var el = $("#dgmCanvas"); if (!el) return;
    var src = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 860 520" width="860" height="520" style="background:#fff;color:#333">'
      + '<style>.dgm-node-shape{fill:#fff;stroke:#333;stroke-width:1.5}.dgm-node-text{font:14px sans-serif;text-anchor:middle;fill:#222}.dgm-edge{stroke:#666;stroke-width:1.5}.dgm-edge-label{font:12px sans-serif;text-anchor:middle;fill:#666}</style>'
      + el.innerHTML
      + '</svg>';
    var img = new Image();
    img.onload = function () {
      var cv = document.createElement("canvas"); cv.width = 860; cv.height = 520;
      var cx = cv.getContext("2d"); cx.fillStyle = "#fff"; cx.fillRect(0, 0, 860, 520); cx.drawImage(img, 0, 0);
      cv.toBlob(function (b) {
        var a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "diagram.png"; a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 3000);
      });
    };
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(src);
  };
  var clr = $("#dgmClearAll");
  if (clr) clr.onclick = function () {
    if (!confirm(t("dgm.clearConfirm","清空画布？"))) return;
    _dgmSave({ nodes: [], edges: [] }); _dgmSel = null; _dgmLinkFrom = null; render();
  };
}
/* ---------- v3.5.2 定时工作流调度器 ---------- */
function _wfParseTime(v){ const m = /^(\d{1,2}):(\d{2})$/.exec(String(v||"")); return m ? {h:+m[1], m:+m[2]} : {h:9,m:0}; }
function _wfDueAt(f, now){
  const sch = f && f.schedule;
  if(!sch || !sch.freq || sch.freq === "off") return 0;
  const tt = _wfParseTime(sch.time);
  const d = new Date(now); d.setHours(tt.h, tt.m, 0, 0);
  if(now < d.getTime()) return 0;
  if(sch.freq === "weekly" && new Date(now).getDay() !== Number((sch.weekday ?? null) === null ? 1 : sch.weekday)) return 0;
  return Number(f.lastRun || 0) < d.getTime() ? d.getTime() : 0;
}
async function _wfRunFlow(idx, f){
  const prompt = ((f.trigger || "") + (f.name ? "\n\n" + f.name : "")) || t("wf.defaultPrompt","生成一份本周工作总结");
  let savedAsNote = false;
  try{
    if(typeof chatOnce === "function"){
      const resp = await chatOnce([
        { role:"system", content: t("wf.sys","你是自动化工作流执行器：按用户指令产出简洁、可直接使用的结果。") },
        { role:"user", content: prompt }
      ], {});
      const txt = (resp && resp.choices && resp.choices[0] && resp.choices[0].message && resp.choices[0].message.content) || "";
      if(txt){ createNote(t("wf.notePrefix","[定时] ") + (f.name || t("wf.unnamed","工作流")), txt, ["定时工作流"], t("wf.noteCategory","自动化")); savedAsNote = true; }
    }
  }catch(e){ /* AI 未配置或失败 → 降级为待办提醒 */ }
  if(!savedAsNote){
    const tasks = getTasks();
    tasks.push({ id: uid(), sc: active, title: t("wf.taskPrefix","⏰ 执行工作流：") + (f.name || ""), due: todayStr(),
      priority: "", status: "todo", doneAt: null, note: prompt, tags: ["workflow"], created: Date.now() });
    setTasks(tasks);
  }
  try{
    const saved = getAiConfig("workflow") || {};
    const flows = Array.isArray(saved.flows) ? saved.flows : [];
    if(flows[idx]){ flows[idx].lastRun = Date.now(); saved.flows = flows; saveAiConfig("workflow", saved); }
  }catch(_){}
  try{ toast((savedAsNote ? t("wf.doneNote","定时工作流已完成并存入笔记：") : t("wf.doneTask","定时工作流已生成待办：")) + (f.name || ""), "ok"); }catch(_){}
}
function _wfCheckDue(){
  try{
    const saved = getAiConfig("workflow") || {};
    const flows = Array.isArray(saved.flows) ? saved.flows : [];
    const now = Date.now();
    flows.forEach(function(f, i){ if(_wfDueAt(f, now)) _wfRunFlow(i, f); });
  }catch(_){}
}
try{ setTimeout(_wfCheckDue, 3000); setInterval(_wfCheckDue, 60000); }catch(_){}

/* ---------- v3.5.2 新场景功能渲染：健康趋势 / 理财收支统计 ---------- */
function _renderHealthTrend(){
  var recs = (typeof getRec === "function") ? getRec("health") : [];
  var byType = {};
  recs.forEach(function(r){
    var k = r.type || t("health.other", "其他");
    byType[k] = (byType[k] || 0) + 1;
  });
  var names = Object.keys(byType);
  var data = names.map(function(n){ return { label: n, value: byType[n] }; });
  var total = recs.length;
  var latest = recs.slice().sort(function(a,b){ return (b.created||0) - (a.created||0); })[0];
  return '<div class="card"><h2>' + ic("stats") + ' ' + t("health.trendTitle", "健康趋势") + '</h2>'
    + '<div class="tool-summary"><span>' + t("health.total", "累计记录") + '：' + total + '</span>'
    + (latest ? '<span>' + t("health.latest", "最近一条") + '：' + esc(latest.type || "") + ' ' + esc(latest.value || "") + '</span>' : '')
    + '</div>'
    + renderMiniChart("bar", data)
    + '</div>';
}

function _renderFinanceStats(){
  var recs = (typeof getRec === "function") ? getRec("finance") : [];
  var income = 0, expense = 0, invest = 0;
  var byCat = {};
  recs.forEach(function(r){
    var amt = parseFloat(r.amount) || 0;
    var ty = r.type || "";
    if(ty === t("fin.income", "收入")) income += amt;
    else if(ty === t("fin.expense", "支出")) { expense += amt; var c = r.category || t("fin.uncategorized", "未分类"); byCat[c] = (byCat[c] || 0) + amt; }
    else invest += amt;
  });
  var cats = Object.keys(byCat).sort(function(a,b){ return byCat[b] - byCat[a]; }).slice(0, 6);
  var data = cats.map(function(c){ return { label: c, value: Math.round(byCat[c] * 100) / 100 }; });
  return '<div class="card"><h2>' + ic("stats") + ' ' + t("fin.statsTitle", "收支统计") + '</h2>'
    + '<div class="tool-summary"><span>' + t("fin.income", "收入") + '：' + income.toFixed(2) + '</span>'
    + '<span>' + t("fin.expense", "支出") + '：' + expense.toFixed(2) + '</span>'
    + '<span>' + t("fin.invest", "投资") + '：' + invest.toFixed(2) + '</span>'
    + '<span>' + t("fin.net", "结余") + '：' + (income - expense).toFixed(2) + '</span></div>'
    + (data.length ? '<p class="sub">' + t("fin.topCats", "支出分类 Top") + '</p>' + renderMiniChart("bar", data) : '<div class="empty">' + t("fin.noExpense", "暂无支出记录") + '</div>')
    + '</div>';
}

/* ---------- 表单 textarea 自动向下延伸（备注等长文本）---------- */
document.addEventListener("input", function (e) {
  var el = e.target;
  if (!el || el.tagName !== "TEXTAREA") return;
  if (!el.closest || !el.closest(".form-row,.set-field,.field-group,.tool-field")) return;
  try {
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight + 2, 320) + "px";
  } catch (_) {}
});

function renderAuthWelcome(){
  const html = _authPageHeader(t("auth.welcomeTitle","登录或注册以使用云端同步与 AI 集成"), false) +
    '<div class="card auth-welcome-card">' +
      '<p class="sub u-text-center">' + t("auth.welcomeIntro","选择以下任一方式继续") + '</p>' +
      '<div class="auth-choice-grid" style="margin-top:var(--space-4)">' +
        '<button type="button" class="auth-choice" id="authPageGoLogin">' +
          '<span class="auth-choice-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg></span>' +
          '<span class="auth-choice-label">' + t("api.login","登录") + '</span>' +
          '<span class="auth-choice-sub">' + t("auth.loginSub","已有账号，直接登录") + '</span>' +
        '</button>' +
        '<button type="button" class="auth-choice" id="authPageGoRegister">' +
          '<span class="auth-choice-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg></span>' +
          '<span class="auth-choice-label">' + t("api.register","注册") + '</span>' +
          '<span class="auth-choice-sub">' + t("auth.registerSub","没有账号，立即注册") + '</span>' +
        '</button>' +
      '</div>' +
      '<div class="auth-sso-sep"><span>' + t("auth.ssoOr","或") + '</span></div>' +
      _authSsoButtons() +
    '</div>';
  $("#main").innerHTML = sanitizeHtml(html);
  const goLogin = $("#authPageGoLogin");
  const goRegister = $("#authPageGoRegister");
  if(goLogin) goLogin.onclick = function(){ setActive("authlogin"); render(); };
  if(goRegister) goRegister.onclick = function(){ setActive("authregister"); render(); };
  _bindAuthSso();
}

function renderAuthLogin(){
  const html = _authPageHeader(t("api.login","登录"), true) +
    '<div class="card auth-form-card">' +
      '<form id="authPageLoginForm" class="u-flex u-flex-col u-gap-3" novalidate>' +
        '<div class="auth-field"><label for="authPageLoginEmail">' + t("api.email","邮箱") + '</label><input type="email" id="authPageLoginEmail" autocomplete="email" required></div>' +
        '<div class="auth-field"><label for="authPageLoginPassword">' + t("api.password","密码") + '</label><input type="password" id="authPageLoginPassword" autocomplete="current-password" required></div>' +
        '<p class="auth-error" id="authPageLoginError"></p>' +
        '<button type="submit" class="auth-submit" id="authPageLoginSubmit">' + t("api.login","登录") + '</button>' +
        '<p class="sub u-text-center" style="margin-top:var(--space-3)">' +
          t("auth.noAccount","还没有账号？") +
          ' <a href="#" id="authPageToRegister">' + t("auth.goRegister","立即注册") + '</a>' +
        '</p>' +
      '</form>' +
      '<div class="auth-sso-sep"><span>' + t("auth.ssoOr","或") + '</span></div>' +
      _authSsoButtons() +
    '</div>';
  $("#main").innerHTML = sanitizeHtml(html);
  const back = $("#authPageBack");
  if(back) back.onclick = function(){ setActive("authwelcome"); render(); };
  const toReg = $("#authPageToRegister");
  if(toReg) toReg.onclick = function(e){ e.preventDefault(); setActive("authregister"); render(); };
  const form = $("#authPageLoginForm");
  if(form) form.onsubmit = function(e){
    e.preventDefault();
    if(typeof _doAuthLogin === "function") _doAuthLogin($("#authPageLoginEmail").value, $("#authPageLoginPassword").value);
  };
  _bindAuthSso();
}

function renderAuthRegister(){
  const html = _authPageHeader(t("api.register","注册"), true) +
    '<div class="card auth-form-card">' +
      '<form id="authPageRegisterForm" class="u-flex u-flex-col u-gap-3" novalidate>' +
        '<div class="auth-field"><label for="authPageRegName">' + t("api.name","用户名") + '</label><input type="text" id="authPageRegName" autocomplete="username" required></div>' +
        '<div class="auth-field"><label for="authPageRegEmail">' + t("api.email","邮箱") + '</label><input type="email" id="authPageRegEmail" autocomplete="email" required></div>' +
        '<div class="auth-field auth-code-field"><label for="authPageRegCode">' + t("api.code","邮箱验证码") + '</label><div class="auth-code-row"><input type="text" id="authPageRegCode" autocomplete="one-time-code" inputmode="numeric" maxlength="6" placeholder="' + t("api.codePh","6 位数字") + '"><button type="button" class="auth-code-btn" id="authPageSendCode">' + t("api.sendCode","发送验证码") + '</button></div></div>' +
        '<div class="auth-field"><label for="authPageRegPassword">' + t("api.password","密码") + '</label><input type="password" id="authPageRegPassword" autocomplete="new-password" required></div>' +
        '<div class="auth-field"><label for="authPageRegPassword2">' + t("api.passwordConfirm","确认密码") + '</label><input type="password" id="authPageRegPassword2" autocomplete="new-password" required></div>' +
        '<p class="auth-error" id="authPageRegisterError"></p>' +
        '<button type="submit" class="auth-submit" id="authPageRegisterSubmit">' + t("api.register","注册") + '</button>' +
        '<p class="sub u-text-center" style="margin-top:var(--space-3)">' +
          t("auth.haveAccount","已有账号？") +
          ' <a href="#" id="authPageToLogin">' + t("auth.goLogin","直接登录") + '</a>' +
        '</p>' +
      '</form>' +
    '</div>';
  $("#main").innerHTML = sanitizeHtml(html);
  const back = $("#authPageBack");
  if(back) back.onclick = function(){ setActive("authwelcome"); render(); };
  const toLog = $("#authPageToLogin");
  if(toLog) toLog.onclick = function(e){ e.preventDefault(); setActive("authlogin"); render(); };
  const form = $("#authPageRegisterForm");
  if(form) form.onsubmit = function(e){
    e.preventDefault();
    if(typeof _doAuthRegister === "function") _doAuthRegister($("#authPageRegName").value, $("#authPageRegEmail").value, $("#authPageRegPassword").value, $("#authPageRegPassword2").value, $("#authPageRegCode").value);
  };
  const sendBtn = $("#authPageSendCode");
  if(sendBtn) sendBtn.onclick = function(){ _sendEmailCode(); };
}


/* ---------- v3.4.7 批次五：任务时间机器——14 天 × 场景泳道回放（只读） ----------
 * 数据源：wb_agent_task_events（_emitTaskEvent 追加，500 上限滚动）。
 * v1 设计决策：只读回放——不做「回到第 N 步」（跨数据状态恢复有 G4 级风险）。 */
function renderTimelinePage(){
  const evs = getTaskEvents();
  const DAY_MS = 86400000;
  const now = new Date();
  const todayStr0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  // 14 天列（含今天，倒序显示：左=13 天前 右=今天）
  const days = [];
  for(let i = 13; i >= 0; i--) days.push(todayStr0 - i * DAY_MS);
  const evTypeLabel = { task_create: t("timeline.create", "新建"), task_complete: t("timeline.complete", "完成"), task_delete: t("timeline.delete", "删除") };
  const evTypeCls = { task_create: "tl-ev-create", task_complete: "tl-ev-done", task_delete: "tl-ev-del" };
  // 行 = 场景（ORDER），列 = 天
  const sceneRows = ORDER.map(function(sc){
    const s = SCENARIOS[sc]; if(!s) return "";
    const cells = days.map(function(dayStart){
      const dayEnd = dayStart + DAY_MS;
      const dayEvs = evs.filter(function(e){ return e.sc === sc && e.ts >= dayStart && e.ts < dayEnd; });
      if(!dayEvs.length) return '<div class="tl-cell"></div>';
      const dots = dayEvs.slice(0, 6).map(function(e){
        return '<span class="tl-dot ' + (evTypeCls[e.type] || "") + '" title="' + esc((evTypeLabel[e.type] || e.type) + " · " + (e.title || "")) + '"></span>';
      }).join("");
      return '<div class="tl-cell">' + dots + (dayEvs.length > 6 ? '<span class="tl-more">+' + (dayEvs.length - 6) + '</span>' : "") + '</div>';
    }).join("");
    return '<div class="tl-row"><div class="tl-sc" style="--sc:' + s.color + '">' + esc(s.name) + '</div>' + cells + '</div>';
  }).join("");
  const headCells = days.map(function(dayStart){
    const d = new Date(dayStart);
    const isToday = dayStart === todayStr0;
    return '<div class="tl-hcell' + (isToday ? " today" : "") + '">' + (d.getMonth()+1) + "/" + d.getDate() + '</div>';
  }).join("");
  const legend = '<div class="tl-legend">' +
    '<span class="tl-dot tl-ev-create"></span>' + t("timeline.create", "新建") +
    '<span class="tl-dot tl-ev-done"></span>' + t("timeline.complete", "完成") +
    '<span class="tl-dot tl-ev-del"></span>' + t("timeline.delete", "删除") +
    '<span class="tl-legend-hint">' + t("timeline.hint", "本次会话起记录（历史事件上限 500 条）") + '</span></div>';
  const totalEvs = evs.length;
  $("#main").innerHTML = sanitizeHtml(
    '<div class="card page-head-card"><header class="page-head sc-page-head">' +
    '<span class="ph-ic" aria-hidden="true">' + (SIDE_MENU_ICONS.dash || "") + '</span>' +
    '<div class="ph-tx"><h2>' + t("timeline.title", "任务时间轴") + '</h2><p class="sub">' +
    t("timeline.sub", "最近 14 天的任务活动回放 · 按场景分泳道") + ' · ' + totalEvs + t("timeline.eventCount", " 条事件") + '</p></div>' +
    '<span class="ph-act"><button type="button" class="page-back" id="tlBack">' + t("timeline.back", "← 返回") + '</button></span>' +
    '</header></div>' +
    '<div class="card tl-card"><div class="tl-grid"><div class="tl-row tl-head"><div class="tl-sc"></div>' + headCells + '</div>' + sceneRows + '</div>' + legend + '</div>');
  const back = $("#tlBack");
  if(back) back.onclick = function(){ setActive("overview"); render(); };
  appendFoot();
}

/* ---------- P8：保存的筛选视图（localStorage，PREFIX 前缀自动随备份） ---------- */
const GLOB_VIEWS_KEY = PREFIX+"glob_views";
function getGlobViews(){
  const arr = load(GLOB_VIEWS_KEY, []);
  return Array.isArray(arr) ? arr.filter(v=>v && v.name) : [];
}
function saveGlobView(name){
  name = String(name===null||name===undefined?"":name).trim();
  if(!name) return {ok:false, err:t("view.nameRequired","请输入视图名称")};
  if(name.length > 16) return {ok:false, err:t("view.nameTooLong","视图名称过长（最多 16 字）")};
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
  box.innerHTML = sanitizeHtml((views.length
    ? views.map(v=>`<span class="glob-view-chip" data-view="${esc(v.name)}" title="${t("globView.apply", "应用视图")}">${esc(v.name)}<button type="button" class="gv-del" data-view-del="${esc(v.name)}" aria-label="${t("globView.del", "删除视图")}">✕</button></span>`).join("")
    : "") + `<button type="button" class="glob-view-save" id="globViewSave" title="${t("globView.save", "保存当前筛选为视图")}">${t("globView.saveBtn", "＋ 保存视图")}</button>`);
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
    const name = (typeof prompt==="function") ? prompt(t("globView.namePrompt", "视图名称：")) : null;
    if(name===null) return;
    const r=saveGlobView(name);
    if(!r.ok){ toast(r.err||t("globView.saveFailToast", "保存失败"),"warn"); return; }
    toast(t("globView.savedToast", "已保存视图"),"ok"); renderGlobViews();
  };
}
function renderGlob(q){
  const res=$("#globRes"); if(!res) return;
  const f=_readGlobFilters();
  // 兼容：renderGlob(q) 直传关键词时同步输入框语义（q 优先）
  if(typeof q==="string") f.q=q.trim().toLowerCase();
  const hasFilter = f.q||f.sc||f.status||f.date||f.tag;
  if(!hasFilter){ res.innerHTML=sanitizeHtml(""); return; }
  const tasks=_applyGlobFilters(f);
  const recs=[];
  // v3.1.2 A-档：资料检索条件放宽——此前仅"纯关键词无任何筛选"才搜资料，一旦选了场景/状态/日期资料结果直接消失。
  // 现在：有关键词即搜资料；选了场景则聚焦该场景（与任务筛选语义一致）；匹配扩展到全字段（含 who/value/lang/code）。
  if(f.q){
    const scList = f.sc ? [f.sc] : ORDER;
    const RECSYS = ["_sc","id","created","deletedAt","nextReview","reps","ease","_verified","_lastVerifiedAt"];
    scList.forEach(sc=> getRec(sc).forEach(r=>{
      const hit = Object.keys(r).some(function(k){
        if(RECSYS.indexOf(k) >= 0) return false;
        return String(r[k]||"").toLowerCase().includes(f.q);
      });
      if(hit) recs.push({sc:sc, title:String(r.title||r.note||"")});
    }));
  }
  let html="";
  if(tasks.length) html+=`<div class="u-fs-xs u-text-muted u-m-1h-0">${t("nav.tasks", "任务")} (${tasks.length})</div><ul class="list">`+
    tasks.map(t=>`<li><div class="body"><div class="t">${esc(t.title)}</div><div class="m">${scMeta(t.sc).name} · ${t.status}${t.due?" · "+t.due:""}${(t.tags&&t.tags.length)?" · "+t.tags.map(esc).join("/"):""}</div></div></li>`).join("")+`</ul>`;
  if(recs.length) html+=`<div class="u-fs-xs u-text-muted u-m-1h-0">${t("tool.webSearch.records", "资料")} (${recs.length})</div><ul class="list">`+
    recs.map(r=>`<li><div class="body"><div class="t">${esc(r.title)}</div><div class="m">${SCENARIOS[r.sc].name}</div></div></li>`).join("")+`</ul>`;
  res.innerHTML=sanitizeHtml(html||renderEmpty("no-search"));
}
