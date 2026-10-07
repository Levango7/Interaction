// ===== Render Layer (渲染层·入口) =====
/* ---------- 渲染入口 ---------- */
/**
 * 渲染入口：侧边栏 + 主区（overview 或 今日仪表盘+场景主区）+ 绑定 + chat
 * @returns {void}
 */
/**
 * 统一尾栏：在 #main 末尾追加页脚（所有页面统一）
 * 幂等：重复调用不会重复追加（先移除已有 foot 再追加）
 * @returns {void}
 */
/* 尾栏「资料 N 条」统计失败的一次性标记（尾栏每次切页都渲染，重复报没有增量信息）。
   ⚠️ 与 ui-drawer.js 的 _recCountWarnedDrawer 各用各的 —— 两个 src 块拼回后共享全局作用域，
   同名 let 会直接 SyntaxError。 */
let _recCountWarnedFoot = false;
function appendFoot(){
  const main = $("#main"); if(!main) return;
  const existing = main.querySelector(":scope > .foot");
  if(existing) existing.remove();
  const footEl = document.createElement("div");
  footEl.className = "foot";
  const cfg = getCfg();
  const ap = getActiveProfile();
  const model = (ap && ap.model) ? ap.model : "";
  const tasks = getTasks().filter(function(t){ return !t.deletedAt; });
  const openN = tasks.filter(function(t){ return t.status!=="done"; }).length;
  /* v3.7.102：统计失败时 recN 停在 0，页脚于是显示「资料 0 条」—— 数据其实还在，
     这是**谎报**而不是单纯的静默，比一般「没保存」更该留痕。
     先补诊断；改显示文案（如显「-」）要动 i18n 与 e2e 断言，本片不动，只把问题暴露出来。 */
  let recN = 0; try{ Object.keys(SCENARIOS).forEach(function(sc){ recN += getRec(sc).length; }); }catch(e){
    try{ if(!_recCountWarnedFoot && typeof pushDiag === "function"){ _recCountWarnedFoot = true; pushDiag("warn", "recN count failed: "+((e&&e.message)||e), {where:"appendFoot"}); } }catch(_e2){}
  }
  const aiOn = !!(cfg && cfg.enabled);
  const aiTxt = aiOn ? (model ? (t("status.aiConnectedDot","AI 已连接 · ") + esc(model)) : t("status.aiConnected","AI 已连接")) : t("status.aiDisabled","AI 未启用"); // v3.1.2：model 为用户输入，esc 防注入（appendFoot 与 _appendDrawerFoot 两处同步）
  footEl.innerHTML = '<div class="foot-bar">' +
    '<span class="foot-id">' + esc(t("app.name")) + ' · v' + VERSION + ' · b' + BUILD_TAG + '</span>' +
    t("p3.html.footTodo","<span class=\"foot-stat\">待办 ") + openN + t("stat.recordsMid"," · 资料 ") + recN + t("stat.footStatSuffix"," 条</span>") +
    '<span class="foot-ai ' + (aiOn ? 'on' : 'off') + '">' + (aiOn ? '\u25CF' : '\u25CB') + ' ' + aiTxt + '</span>' +
    '</div>';
  main.appendChild(footEl);
}

function renderMetricsStrip(){
  const tasks = getActiveTasks().filter(function(t){ return t.sc===active; });
  const todo = tasks.filter(function(t){ return t.status==="todo"; }).length;
  const doing = tasks.filter(function(t){ return t.status==="doing"; }).length;
  const done = tasks.filter(function(t){ return t.status==="done"; }).length;
  let recN = 0; try{ recN = getRec(active).length; }catch(e){}
  const item = function(n,label){ return '<div class="ms-item"><span class="ms-n">'+n+'</span><span class="ms-l">'+label+'</span></div>'; };
  return '<div class="card ms-strip">'+item(todo,t("kanban.todo","待办"))+item(doing,t("kanban.doing","进行中"))+item(done,t("kanban.done","已完成"))+item(recN,t("tool.webSearch.records","资料"))+'</div>';
}

/* v3.7.15（解耦 S2b）：把渲染调度器注册到桥接，供低层受控调用（见 docs/decoupling-plan.md） */
AppBridge.render = render;

function render(){
  try{
    // v1.9.4：切出回收站页面时移除铺满类（openRecycle 会重新添加）
    const _rc = $("#main"); if(_rc) _rc.classList.remove("page-recycle");
    // v1.9：设置改为正常页面后，若 #drawer 在 .main-wrap 里（设置页面正在显示），
    // 切换场景/其他视图时需先把 #drawer 移回原位置并恢复 #main 显示
    const _drawer = $("#drawer");
    if(_drawer && _drawer.classList.contains("drawer-page")){
      try{ AppBridge._moveDrawerHome(); }catch(e){ /* 桥异常不影响渲染 */ }
      _drawer.classList.remove("open");
      delete _drawer.dataset.page; // v1.9.6：清掉子页标记（settings/ai/plugin）
    }
    const _help = $("#helpPage"); if(_help) _help.remove();
    uiView = "main"; // v1.9.3g：回到主视图，侧栏高亮据此渲染（场景/总览/统计/回收站）
    AppBridge.renderSide();
    if(active==="overview"){ renderOverview(); appendFoot(); return; }
    /* v3.6.6 修复：此前这里写的是 `setActive("overview"); renderOverview();`——把 stats 重定向回主页，
       导致统计页（15 个仪表盘组件 + 周/月/年筛选 + Grafana 式编辑态）**完全不可达**：
       系统概况卡「已完成」项（data-act="stats"）与 KPI 卡（data-kpi-act="stats"）的处理器都是
       `setActive("stats"); render();`，点击后被本行弹回主页 → 死点击。
       （该重定向由分支归并提交 c93da3c 引入；「v2.5 仪表盘合并至主页」的本意是**撤掉侧栏独立入口**
         ——见 _buildSideMenu 的总览组注释——而非废弃页面本身，主页模板里也从未出现 #dashHost。）
       现改为进入统计页；renderStats() 自含尾栏（见其函数末尾 appendFoot），故此处不重复补。 */
    if(active==="stats"){ renderStats(); return; }
    if(active==="recycle"){ AppBridge.openRecycle(); appendFoot(); return; }
    /* v2.4.0 四大新页面路由（v3.2 补全：除 tasks/chainpage 外 toolbox/store/recycle 之前漏掉 appendFoot，导致切到这些页看不到版本号+待办统计+AI 状态三列底栏） */
    if(active==="tasks"){ renderTasksPage(); appendFoot(); return; }
    if(active==="toolbox"){ renderToolboxPage(); appendFoot(); return; }
    if(active==="store"){ renderStorePage(); appendFoot(); return; }
    if(active==="chainpage"){ renderChainPage(); appendFoot(); return; }
    if(active==="authwelcome"){ renderAuthWelcome(); appendFoot(); return; }
    if(active==="authlogin"){ renderAuthLogin(); appendFoot(); return; }
    if(active==="authregister"){ renderAuthRegister(); appendFoot(); return; }
    if(active==="timeline"){ renderTimelinePage(); appendFoot(); return; } // v3.4.7 批次五：任务时间轴页
    const cfg=getCfg();
    // v1.9.7：标题块（renderSceneHead）独立成卡置于最前——消息栏正下方即场景标题，与后续内容块分离
    // v3.0：功能菜单（renderSceneFeatNav）独立于标题栏，置于标题卡与主内容之间
    $("#main").innerHTML = sanitizeHtml(renderSceneHead() + renderSceneFeatNav() + renderMetricsStrip() + renderMainHTML());
    appendFoot();
    AppBridge.bindScenario();
    _hydrateRecImgs(); // v3.2 C-档：记录缩略图异步填充（IDB blob → objectURL）
    // v3.0：场景内功能 tab 点击切换（SCENE_FEATURES；按钮复用 .set-nav-btn，限定在 .scene-feat-nav 内）
    $$("#main .scene-feat-nav .set-nav-btn").forEach(function(b){
      b.onclick = function(){ setSceneFeature(b.getAttribute("data-feat")); };
    });
    // v3.0：办公文档中心工具入口点击（打开对应 TOOL_APPS 工具）
    $$("#main [data-tool]").forEach(function(b){
      b.onclick = function(){ AppBridge.openToolStub(b.getAttribute("data-tool"), ""); };
    });
    // v3.0：场景功能卡事件绑定（非 overview tab 时绑定添加/删除/完成）
    if(sceneFeatureMode !== "overview"){
      const bcfg = (SCENE_FEATURE_BIND[active] || {})[sceneFeatureMode];
      // v3.2 任务四：第三参数 onSave 钩子（如练习错题自动入 SM-2）——查找 bcfg.onSave 透传
      if(bcfg) _featureCardBind(bcfg.key, bcfg.fieldKeys, bcfg.onSave);
      // v3.0.1 B-3：代码运行器「▶ 运行」按钮绑定（通用 CRUD 绑定之外的特化扩展）
      if(active === "code" && sceneFeatureMode === "runner") bindCodeRunnerCard();
      // v3.1：SQL Playground「▶ 运行」按钮绑定（sql.js WASM 沙箱）
      // v3.1.2 A-档：data 场景的 SQL 查数 tab 复用同一绑定（存储键经 bcfg.key 查找）
      if((active === "code" || active === "data") && sceneFeatureMode === "sql") bindCodeSqlCard(bcfg ? bcfg.key : "code_sql");
      // v3.1.2 A-档：frontend「▶ 预览」按钮绑定（sandbox iframe 实时渲染 html/css/js）
      if(active === "code" && sceneFeatureMode === "frontend") bindCodeFrontendCard();
      // v3.1.2 B-档：会议管理「→ 生成任务」按钮绑定（行动项识别 → office 任务）
      if(active === "office" && sceneFeatureMode === "meeting") bindMeetingActionCard();
    }
    AppBridge.setupKanbanDnD();      // B4：看板拖拽（委托绑定，幂等）
    AppBridge.setupKanbanKeyboard(); // B5：看板卡片键盘操作（委托绑定，幂等）
    // P9：「稍后提醒」按钮绑定（Top3 待处理任务）
    $$("#main [data-snooze]").forEach(b=> b.onclick=()=>{
      snoozeTask(b.getAttribute("data-snooze"), 30);
      toast(t("msg.remindLater","已设置 30 分钟后再提醒"),"ok");
      render();
    });
    // v1.10.0：Top3 待办「展开全部」按钮——点击展开/折叠 #top3List 内 .top3-item-extra 行
    const _top3Ex = $("#top3Expand");
    if(_top3Ex){ _top3Ex.onclick = function(){
      const _list = $("#top3List");
      if(!_list) return;
      const expanded = _list.classList.toggle("expanded");
      _top3Ex.setAttribute("aria-expanded", expanded ? "true" : "false");
      const _txt = _top3Ex.querySelector(".ex-txt");
      const _icon = _top3Ex.querySelector(".ex-icon");
      if(_txt) _txt.textContent = expanded ? t("common.collapse","收起") : (_top3Ex.dataset.fullText || _txt.textContent);
      if(_icon) _icon.textContent = expanded ? "▴" : "▾";
      // 首次展开记录原始文本
      if(!_top3Ex.dataset.fullText) _top3Ex.dataset.fullText = _txt ? _txt.textContent : "";
    }; }
    if(cfg.enabled) renderChat();
    else renderChatDisabled(); // 右侧面板显示「尚未启用 AI」提示（替代原主内容区 chatCard 的未启用态）
  }catch(e){
    // 渲染异常：诊断 + fallback UI（提示导出备份后清空），不让白屏
    pushDiag("error", "render error: "+(e&&e.message||e), {where:"render"});
    const main = document.getElementById("main");
    if(main){
      main.innerHTML = sanitizeHtml('<div class="card u-text-center"style="padding:40px">'+
        t("p3.html.dataError","<h2>⚠️ 数据异常</h2>")+
        t("p3.html.dataErrorSub","<p style=\"color:var(--muted);margin:var(--space-4) 0\">渲染时发生错误，建议导出备份后清空数据。</p>")+
        t("p3.html.fallbackExport","<button type=\"button\" class=\"mini\" id=\"fallbackBtnExport\" style=\"margin:var(--space-2)\">导出备份</button>")+
        t("p3.html.fallbackClear","<button type=\"button\" class=\"mini\" id=\"fallbackBtnClear\" style=\"margin:var(--space-2);background:var(--danger)\">清空数据</button>")+
        '</div>');
      // P0 修复：sanitizeHtml 会移除内联 on* 事件属性，改为渲染后用 addEventListener 绑定
      const _fbExportBtn = document.getElementById("fallbackBtnExport");
      if(_fbExportBtn) _fbExportBtn.addEventListener("click", function(){ try{ doExport(); }catch(e2){ /* 静默降级 */ } });
      const _fbClearBtn = document.getElementById("fallbackBtnClear");
      if(_fbClearBtn) _fbClearBtn.addEventListener("click", function(){ if(confirm(t("confirm.clear","确定清空？"))){ try{ localStorage.clear(); }catch(e2){ /* 静默降级 */ } location.reload(); } });
    }
    try{ toast(t("err.renderException","渲染异常：")+(e&&e.message||t("tool.unknownErrorMsg", t("common.unknownError","未知错误"))), "error"); }catch(e2){ /* toast 不可用时静默降级 */ }
  }finally{
    /* 放 finally 而非 try 尾部：本函数有 12 条提前 return 的路由，放尾部只有 office 会触发 */
    try{ if(AppBridge.applyI18n) AppBridge.applyI18n(); }catch(_ie){ /* i18n 缺失不阻断渲染 */ }
  }
}

/* v3.7.78 解耦：自别处下沉（同层序逆层消除） */
const SIDE_MENU_ICONS = {
  dash:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 14l4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/></svg>',
  tasks:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
  /* v2.5.1：工具箱用扳手图标，与商店拼图图标差异化（原 plugin=puzzle 与商店雷同） */
  toolbox:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>',
  plugin: UI_ICONS.puzzle,
  ai: UI_ICONS.robot,
  chain: UI_ICONS.chain,
  look: UI_ICONS.theme,
  doc: UI_ICONS.file
};

/* v3.7.78 解耦：自别处下沉（同层序逆层消除） */
function _priWeight(p){ return p==="P0"?0 : p==="P1"?1 : p==="P2"?2 : 3; }

/* v3.7.78 解耦：自别处下沉（同层序逆层消除） */
function lineChartSVG(vals, color){
  if(!vals.length) return "";
  const arr = vals.length===1? [vals[0],vals[0]] : vals;
  const W=300,H=90,max=Math.max(1,...arr),n=arr.length;
  const pts=arr.map((v,i)=> [ (i/(n-1))*W, H-8-(v/max)*(H-20) ]);
  const line=pts.map(p=>p[0].toFixed(1)+","+p[1].toFixed(1)).join(" ");
  const area="0,"+(H-8)+" "+line+" "+W+","+(H-8);
  return `<svg class="line-chart-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
    <polygon points="${area}" style="fill:${color}" fill-opacity="0.08"/>
    <polyline points="${line}" fill="none" style="stroke:${color}" stroke-width="2" stroke-linejoin="round"/>
    ${pts.map(p=>`<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="2.5" style="fill:${color}"/>`).join("")}
  </svg>`;
}

/* v3.7.78 解耦：自别处下沉（同层序逆层消除） */
function renderEmpty(type){
  const icon = EMPTY_ICONS[type] || "";
  if(type === "no-tasks"){
    return '<div class="empty-state">' +
      '<div class="empty-icon">'+icon+'</div>' +
      '<p class="empty-text"><strong>' + t("empty.noTasksTitle", "还没有任务") + '</strong></p>' +
      '<p class="empty-text">' + t("empty.noTasksHint", "按 <span class=\"kbd\">N</span> 或点 <span class=\"kbd\">+</span> 创建第一个任务") + '</p>' +
      '<div class="empty-action"><button class="btn-primary" type="button" data-empty-action="new-task">' + t("empty.noTasksAction", "+ 新建任务") + '</button></div>' +
      '</div>';
  }
  if(type === "no-records"){
    return '<div class="empty-state">' +
      '<div class="empty-icon">'+icon+'</div>' +
      '<p class="empty-text"><strong>' + t("empty.noRecordsTitle", "还没有记录") + '</strong></p>' +
      '<p class="empty-text">' + t("empty.noRecordsHint", "在上方表单填写后点「添加」开始第一个吧") + '</p>' +
      '</div>';
  }
  if(type === "no-search"){
    return '<div class="empty-state">' +
      '<div class="empty-icon">'+icon+'</div>' +
      '<p class="empty-text"><strong>' + t("empty.noSearchTitle", "未找到匹配结果") + '</strong></p>' +
      '<p class="empty-text">' + t("empty.noSearchHint", "换个关键词试试") + '</p>' +
      '</div>';
  }
  if(type === "no-stats"){
    return '<div class="empty-state">' +
      '<div class="empty-icon">'+icon+'</div>' +
      '<p class="empty-text"><strong>' + t("empty.noStatsTitle", "暂无数据") + '</strong></p>' +
      '<p class="empty-text">' + t("empty.noStatsHint", "完成任务后查看统计") + '</p>' +
      '</div>';
  }
  // v3.2 阶段二：新增空态类型
  if(type === "no-links"){
    return '<div class="empty-state">' +
      '<div class="empty-icon">'+icon+'</div>' +
      '<p class="empty-text"><strong>还没有联动关系</strong></p>' +
      '<p class="empty-text">在联动页配置场景间联动规则</p>' +
      '</div>';
  }
  if(type === "no-search-result"){
    return '<div class="empty-state">' +
      '<div class="empty-icon">'+icon+'</div>' +
      '<p class="empty-text"><strong>未找到匹配结果</strong></p>' +
      '<p class="empty-text">换个关键词或筛选条件试试</p>' +
      '</div>';
  }
  if(type === "no-notes"){
    return '<div class="empty-state">' +
      '<div class="empty-icon">'+icon+'</div>' +
      '<p class="empty-text"><strong>还没有笔记</strong></p>' +
      '<p class="empty-text">点击「新建笔记」开始记录</p>' +
      '</div>';
  }
  if(type === "no-backup"){
    return '<div class="empty-state">' +
      '<div class="empty-icon">'+icon+'</div>' +
      '<p class="empty-text"><strong>还没有备份</strong></p>' +
      '<p class="empty-text">在设置页手动导出或开启自动备份</p>' +
      '</div>';
  }
  if(type === "no-history"){
    return '<div class="empty-state">' +
      '<div class="empty-icon">'+icon+'</div>' +
      '<p class="empty-text"><strong>还没有历史记录</strong></p>' +
      '<p class="empty-text">操作后会在此显示历史</p>' +
      '</div>';
  }
  return "";
}

/* v3.7.78 解耦：自别处下沉（同层序逆层消除） */
function renderMiniChart(chartType, dataArr){
  if(!Array.isArray(dataArr) || !dataArr.length){
    return t("p3.html.chartEmpty","<div class=\"mini-chart-empty\">暂无可视化数据 · 在「数据点」中填入 JSON 数组，如 [{\"label\":\"Q1\",\"value\":30}]</div>");
  }
  const ct = String(chartType || "bar").toLowerCase();
  let inner;
  if(ct === "pie") inner = _miniPieSVG(dataArr);
  else if(ct === "line") inner = _miniLineSVG(dataArr);
  else inner = _miniBarSVG(dataArr);
  // line 类型自带布局容器，不再包 .mini-chart-wrap 的固定高度（避免双重滚动裁切）
  if(ct === "line") return '<div class="mini-chart-line-box u-h-120 u-bg-panel2 u-radius-sm u-overflow-hidden">' + inner + "</div>";
  return '<div class="mini-chart-wrap">' + inner + "</div>";
}

/* v3.7.78 解耦：自别处下沉 */
const TOOL_APPS = {
  /* ================= 文档簇 ================= */
  "off-md": {
    name:t("tool.md.name", "Markdown 编辑器"), icon:UI_ICONS.md, desc:t("tool.md.desc", "分栏编辑 · 实时预览 · 导出 .md/.html"),
    render: function(){
      const saved = _toolDoc("off-md");
      return '<div class="md-ed-wrap u-gap-3"class="u-grid-2col">'
        + '<div><label>Markdown 源码</label><textarea id="mdSrc" class="u-fs-2xs u-min-h-360"style="font-family:\'SF Mono\',Consolas,monospace">' + esc(saved) + '</textarea>'
        + '<div class="tool-actions"><button type="button" class="addbtn sm" id="mdImport">' + t("tool.md.import", "导入 .md") + '</button>'
        + '<button type="button" class="addbtn sm" id="mdExportMd">导出 .md</button>'
        + '<button type="button" class="addbtn sm" id="mdExportHtml">导出 .html</button>'
        + '<button type="button" class="addbtn sm" data-sc="muted" id="mdClear">清空</button></div></div>'
        + '<div><label>预览</label><div class="md-body card u-min-h-360 u-p-3 u-overflow-auto" id="mdPrev"></div></div></div>';
    },
    bind: function(){
      const src = $("#mdSrc"), prev = $("#mdPrev");
      if(!src) return;
      /* v3.0.2 批次1（审计 A-11：Markdown 输入无防抖）改造说明：
         1) 输入即时保存：_toolSaveDoc 仅做一次 localStorage 字符串写入（轻量、无解析/重绘），
            与 Word 工具 ed.oninput 即时保存同模式——先保住稿子不丢；
         2) 预览渲染走 150ms 防抖：合并连续击键后再做 mdToHtml 全量解析，
            大文档（万字符级）不再逐字符卡顿；
         3) 预览区更新改用现成 diffRender（增量渲染来源，原 v1.6-G 闲置基建）：
            内部默认 sanitizeHtml 消毒 + 新旧 innerHTML 相同时跳过重绘。 */
      const renderPrev = function(){
        try{ diffRender(prev, '<div class="md-body">' + mdToHtml(src.value) + "</div>"); }
        catch(e){ prev.textContent = src.value; }
      };
      const sync = function(){ renderPrev(); _toolSaveDoc("off-md", src.value); };
      /* v3.7.24：导入回调抽成具名函数，按钮与"拖拽到源码框"共用 */
      const _mdApply = function(text, f){
        src.value = text; sync();
        toast(t("tool.md.imported", "已导入 {name}").replace("{name}", (f && f.name) || ""), "ok");
      };
      _bindDropImport(src, ".md,.markdown,.txt,text/*", _mdApply);
      const imp = $("#mdImport");
      if(imp) imp.onclick = function(){
        _toolImportFile(".md,.markdown,.txt,text/*", _mdApply);
      };
      let _mdDebT = null; /* 防抖句柄：150ms 内连续输入只保留最后一次渲染 */
      src.oninput = function(){
        _toolSaveDoc("off-md", src.value); /* 即时保存（轻量），不走解析/重绘 */
        clearTimeout(_mdDebT);
        _mdDebT = setTimeout(renderPrev, 150); /* 预览 150ms 防抖 */
      };
      $("#mdExportMd").onclick = function(){ _toolDownload("note.md", src.value, "text/markdown;charset=utf-8"); };
      $("#mdExportHtml").onclick = function(){
        _toolDownload("note.html", '<!DOCTYPE html><meta charset="utf-8"><title>note</title>' + mdToHtml(src.value), "text/html;charset=utf-8");
      };
      $("#mdClear").onclick = function(){ if(confirm(t("tool.md.clearConfirm", "清空当前文档？"))){ src.value = ""; clearTimeout(_mdDebT); sync(); } };
      sync();
    }
  },
  "off-word": {
    name:t("tool.word.name", "Word 富文本"), icon:UI_ICONS.word, desc:t("tool.word.desc", "所见即所得编辑 · 导出 .html/.doc"),
    render: function(){
      const saved = _toolDoc("off-word");
      const btns = [["bold","B",t("tool.word.bold", "加粗")],["italic","I",t("tool.word.italic", "斜体")],["underline","U",t("tool.word.underline", "下划线")],["insertUnorderedList","≡",t("tool.word.ul", "无序列表")],["insertOrderedList","1.",t("tool.word.ol", "有序列表")],["removeFormat","✕格式",t("tool.word.clearFmt", "清除格式")]];
      return '<div class="word-toolbar u-flex u-mb-2 u-flex-wrap u-gap-1">'
        + btns.map(function(b){ return '<button type="button" class="addbtn xs" data-wcmd="' + b[0] + '" title="' + esc(b[2]) + '"><b>' + esc(b[1]) + "</b></button>"; }).join("")
        + '<select id="wFont" aria-label="标题级别" data-i18n-aria="a11y.titleLevel"><option value="">正文</option><option value="H1">标题 1</option><option value="H2">标题 2</option><option value="H3">标题 3</option></select></div>'
        + '<div contenteditable="true" id="wordEd" class="card u-min-h-360 u-outline-none u-lh-17"class="u-p-4">' + saved + "</div>"
        + '<div class="tool-actions"><button type="button" class="addbtn sm" id="wordImport">' + t("tool.word.import", "导入 HTML/TXT") + '</button>'
       + '<div class="tool-actions"><button type="button" class="addbtn sm" id="wordExportHtml">导出 .html</button>'
        + '<button type="button" class="addbtn sm" id="wordExportDoc">导出 .doc</button></div>';
    },
    bind: function(){
      const ed = $("#wordEd"); if(!ed) return;
      $$(".word-toolbar [data-wcmd]").forEach(function(b){
        b.onclick = function(){ ed.focus(); document.execCommand(b.getAttribute("data-wcmd"), false, null); };
      });
      const font = $("#wFont");
      if(font) font.onchange = function(){ ed.focus(); if(font.value) document.execCommand("formatBlock", false, font.value); font.value = ""; };
      ed.oninput = function(){ _toolSaveDoc("off-word", ed.innerHTML); };
      /* v3.7.24：导入回调抽成具名函数，按钮与"拖拽到编辑区"共用 */
      const _wordApply = function(text, f){
        const looksHtml = /<\w+[\s>/]/.test(text);
        ed.innerHTML = sanitizeHtml(looksHtml ? text : _txtToHtmlParagraphs(text));
        _toolSaveDoc("off-word", ed.innerHTML);
        toast(t("tool.word.imported", "已导入 {name}").replace("{name}", (f && f.name) || ""), "ok");
      };
      _bindDropImport(ed, ".html,.htm,.txt,text/*", _wordApply);
      const wimp = $("#wordImport");
      if(wimp) wimp.onclick = function(){
        _toolImportFile(".html,.htm,.txt,text/*", _wordApply);
      };
      // A-4 纵深防御：contenteditable 可能含用户从网页粘贴的富文本，导出文件会被再次打开/分发，
      // 拼接前必须过 sanitizeHtml（渲染路径 openToolStub 已统一消毒，此处堵住「导出物再分发」缺口）
      $("#wordExportHtml").onclick = function(){
        _toolDownload("doc.html", '<!DOCTYPE html><meta charset="utf-8"><title>doc</title><body>' + sanitizeHtml(ed.innerHTML) + "</body>", "text/html;charset=utf-8");
      };
      $("#wordExportDoc").onclick = function(){
        _toolDownload("doc.doc", '<!DOCTYPE html><meta charset="utf-8"><body>' + sanitizeHtml(ed.innerHTML) + "</body>", "application/msword");
      };
    }
  },
  "off-sheet": {
    name:t("tool.sheet.name", "表格编辑器"), icon:UI_ICONS.sheet, desc:t("tool.sheet.desc", "可编辑表格 · 行列增删 · 导出 CSV"),
    render: function(){
      let data = load(PREFIX+"tool_off-sheet", null);
      if(!data){ data = { rows: [["", "", ""], ["", "", ""], ["", "", ""]] }; }
      const rows = data.rows || [];
      let html = '<table class="tool-table sheet-tbl" id="sheetTbl">';
      for(let r = 0; r < rows.length; r++){
        html += "<tr>";
        html += '<td class="u-text-muted u-fs-2xs u-bg-panel2 u-text-center">' + (r+1) + "</td>";
        for(let c = 0; c < rows[r].length; c++){
          html += '<td><input type="text" data-sc-r="' + r + '" data-sc-c="' + c + '" value="' + esc(rows[r][c]) + '" class="u-w-full u-bg-transparent u-border-none"style="padding:2px"></td>';
        }
        html += "</tr>";
      }
      html += "</table>";
      return '<p class="sub">' + t("tool.sheet.hint", "点击单元格直接编辑；按钮增删行列，数据自动保存") + '</p>' + html
        + '<div class="tool-actions">'
        + '<span class="add-wrap"><span class="add-label">' + t("tool.sheet.addRow", "添加行") + '</span><button type="button" class="addbtn sm add-round" id="shAddRow" aria-label="' + t("tool.sheet.addRow", "添加行") + '">＋</button></span>'
        + '<span class="add-wrap"><span class="add-label">' + t("tool.sheet.addCol", "添加列") + '</span><button type="button" class="addbtn sm add-round" id="shAddCol" aria-label="' + t("tool.sheet.addCol", "添加列") + '">＋</button></span>'
        + '<button type="button" class="addbtn sm" data-sc="danger" id="shDelRow">' + t("tool.sheet.delLastRow", "－ 删除末行") + '</button>'
        + '<button type="button" class="addbtn sm" data-sc="danger" id="shDelCol">' + t("tool.sheet.delLastCol", "－ 删除末列") + '</button>'
        + '<button type="button" class="addbtn sm" id="shImportCsv">' + t("tool.sheet.importCsv", "导入 CSV") + '</button>'
        + '<button type="button" class="addbtn sm" id="shExportCsv">' + t("tool.sheet.exportCsvBtn", "导出 CSV") + '</button></div>';
    },
    bind: function(){
      const getRows = function(){
        const rows = [];
        $$("#sheetTbl input[data-sc-r]").forEach(function(inp){
          const r = Number(inp.getAttribute("data-sc-r")), c = Number(inp.getAttribute("data-sc-c"));
          while(rows.length <= r) rows.push([]);
          rows[r][c] = inp.value;
        });
        return rows;
      };
      const persist = function(){ _toolSave("off-sheet", { rows: getRows() }); };
      $$("#sheetTbl input").forEach(function(inp){ inp.onchange = persist; });
      const rerender = function(){ openToolStub("off-sheet", t("tool.sheet.title","表格")); };
      $("#shAddRow").onclick = function(){ persist(); const d = load(PREFIX+"tool_off-sheet", {rows:[[""]]}); d.rows.push(new Array((d.rows[0]||[""]).length).fill("")); _toolSave("off-sheet", d); rerender(); };
      $("#shAddCol").onclick = function(){ persist(); const d = load(PREFIX+"tool_off-sheet", {rows:[[""]]}); d.rows.forEach(function(r){ r.push(""); }); _toolSave("off-sheet", d); rerender(); };
      $("#shDelRow").onclick = function(){ persist(); const d = load(PREFIX+"tool_off-sheet", {rows:[[]]}); if(d.rows.length > 1){ d.rows.pop(); _toolSave("off-sheet", d); rerender(); } else toast(t("tool.sheet.minRow", "至少保留一行"), "warn"); };
      $("#shDelCol").onclick = function(){ persist(); const d = load(PREFIX+"tool_off-sheet", {rows:[[]]}); if(d.rows[0].length > 1){ d.rows.forEach(function(r){ r.pop(); }); _toolSave("off-sheet", d); rerender(); } else toast(t("tool.sheet.minCol", "至少保留一列"), "warn"); };
      /* v3.7.24：拖到表格区也能导入（与按钮同一套解析） */
      _bindDropImport($("#sheetTbl"), ".csv,text/csv,text/plain", function(text){
        const rows = _csvParse(text);
        if(!rows){ toast(t("tool.sheet.importBad", "导入失败：没有解析到有效行"), "warn"); return; }
        save(PREFIX + "tool_off-sheet", { rows: rows });
        openToolStub("off-sheet");
        toast(t("tool.sheet.imported", "已导入 {n} 行").replace("{n}", String(rows.length)), "ok");
      });
      $("#shImportCsv").onclick = function(){
        _toolImportFile(".csv,text/csv,text/plain", function(text, f){
          const rows = _csvParse(text);
          if(!rows){ toast(t("tool.sheet.importBad", "导入失败：没有解析到有效行"), "warn"); return; }
          save(PREFIX + "tool_off-sheet", { rows: rows });
          openToolStub("off-sheet");
          toast(t("tool.sheet.imported", "已导入 {n} 行").replace("{n}", String(rows.length)), "ok");
        });
      };
      $("#shExportCsv").onclick = function(){
        const csv = getRows().map(function(row){ return row.map(function(v){ return '"' + String(v).replace(/"/g, '""') + '"'; }).join(","); }).join("\r\n");
        _toolDownload("sheet.csv", "\uFEFF" + csv, "text/csv;charset=utf-8");
      };
    }
  },
  "off-ppt": {
    name:t("tool.ppt.name", "幻灯片"), icon:UI_ICONS.ppt, desc:t("tool.ppt.desc", "卡片式编辑 · 全屏放映 · 导出 JSON"),
    render: function(){
      let slides = _toolData("off-ppt");
      if(!slides.length){ slides = [{ id:_toolUid(), title:t("tool.ppt.firstPage", "第一页"), body:t("tool.ppt.firstBody", "在这里输入内容…") }]; _toolSave("off-ppt", slides); }
      const list = slides.map(function(s, i){
        return '<button type="button" class="ppt-thumb card u-pointer u-text-left u-p-2" data-ppt-sel="' + i + '">'
          + '<b class="u-fs-2xs">' + (i+1) + ". " + esc(s.title) + "</b>"
          + '<div class="u-fs-2xs u-text-muted u-nowrap u-overflow-hidden u-ellipsis">' + esc(s.body || "").slice(0, 30) + "</div></button>";
      }).join("");
      return '<div class="u-gap-3"class="u-grid-180-1fr">'
        + '<div class="u-flex u-gap-2 u-flex-col u-overflow-auto u-max-h-420">' + list
        + '<button type="button" class="addbtn sm" id="pptAdd">＋ 新页</button></div>'
        + '<div><label>标题</label><input type="text" id="pptTitle" class="u-w-full">'
        + '<label class="u-mt-2">内容</label><textarea id="pptBody" class="u-w-full u-min-h-220"></textarea>'
        + '<div class="tool-actions"><button type="button" class="addbtn sm" id="pptPlay">▶ 放映</button>'
        + '<button type="button" class="addbtn sm" data-sc="danger" id="pptDel">删除本页</button>'
        + '<button type="button" class="addbtn sm" id="pptImportJson">' + t("tool.ppt.importJson", "导入 JSON") + '</button>' + '<button type="button" class="addbtn sm" id="pptExportJson">导出 JSON</button></div></div></div>'
        + '<div id="pptStage" hidden class="u-flex u-flex-col u-ai-center u-jc-center u-pos-fixed u-inset-0 u-z-modal u-p-6 u-bg-bg">'
        + '<h1 id="stageTitle" class="u-mb-4"style="font-size:var(--fs-display-sm)"></h1>'
        + '<p id="stageBody" class="u-text-center u-lh-18 u-max-w-720"style="font-size:var(--fs-lg)"></p>'
        + '<div class="u-flex u-gap-3 u-pos-absolute"style="bottom:24px"><button type="button" class="addbtn sm" id="stagePrev">← 上一页</button>'
        + '<button type="button" class="addbtn sm" id="stageNext">下一页 →</button>'
        + '<button type="button" class="addbtn sm" data-sc="danger" id="stageExit">退出放映</button></div></div>';
    },
    bind: function(){
      const slides = _toolData("off-ppt");
      let cur = 0;
      let stageIdx = 0;
      const loadCur = function(){
        const s = slides[cur]; if(!s) return;
        $("#pptTitle").value = s.title; $("#pptBody").value = s.body || "";
      };
      $$("#main [data-ppt-sel]").forEach(function(b){
        b.onclick = function(){ cur = Number(b.getAttribute("data-ppt-sel")); loadCur(); };
      });
      const saveAll = function(){
        const s = slides[cur];
        if(s){ s.title = $("#pptTitle").value; s.body = $("#pptBody").value; }
        _toolSave("off-ppt", slides);
      };
      $("#pptTitle").oninput = saveAll;
      $("#pptBody").oninput = saveAll;
      $("#pptAdd").onclick = function(){ saveAll(); slides.push({ id:_toolUid(), title:t("tool.ppt.newPageTitle", "新页面"), body:"" }); _toolSave("off-ppt", slides); openToolStub("off-ppt", "幻灯片"); };
      $("#pptDel").onclick = function(){ if(slides.length <= 1){ toast(t("tool.ppt.minPage", "至少保留一页"), "warn"); return; } saveAll(); slides.splice(cur, 1); _toolSave("off-ppt", slides); openToolStub("off-ppt", t("tool.ppt.slidesName", "幻灯片")); };
      $("#pptImportJson").onclick = function(){
        _toolImportFile(".json,application/json", function(text, f){
          const arr = _pptFromJson(text);
          if(!arr){ toast(t("tool.ppt.importBad", "导入失败：不是有效的 slides JSON"), "warn"); return; }
          _toolSave("off-ppt", arr);
          openToolStub("off-ppt");
          toast(t("tool.ppt.imported", "已导入 {n} 页").replace("{n}", String(arr.length)), "ok");
        });
      };
      $("#pptExportJson").onclick = function(){ saveAll(); _toolDownload("slides.json", JSON.stringify(slides, null, 2), "application/json"); };
      const showStage = function(i){
        stageIdx = Math.max(0, Math.min(i, slides.length - 1));
        const s = slides[stageIdx];
        $("#stageTitle").textContent = s.title;
        $("#stageBody").textContent = s.body || "";
      };
      $("#pptPlay").onclick = function(){ saveAll(); $("#pptStage").hidden = false; showStage(0); };
      $("#stageExit").onclick = function(){ $("#pptStage").hidden = true; openToolStub("off-ppt", t("tool.ppt.slidesName","幻灯片")); };
      $("#stagePrev").onclick = function(){ showStage(stageIdx - 1); };
      $("#stageNext").onclick = function(){ showStage(stageIdx + 1); };
      loadCur();
    }
  },
  "off-pdf": {
    name:t("tool.pdf.name", "PDF 阅读"), icon:UI_ICONS.pdf, desc:t("tool.pdf.desc2", "导入本地 PDF · 页码/缩放控制 · 支持拖拽"),
    render: function(){
      /* 只产出稳定锚点：控制条与空态由 _pdfRefresh() 原地填充（避免为一次翻页重渲染整个视图） */
      return '<label>' + t("tool.pdf.importLabel", "导入 PDF 文件") + '</label>'
        + '<input type="file" id="pdfFile" accept=".pdf,application/pdf" class="u-mt-2">'
        + '<div id="pdfDrop" class="pdf-drop u-mt-3" tabindex="0" role="button" aria-label="' + esc(t("tool.pdf.dropAria", "拖拽 PDF 到此处，或点击选择文件")) + '">'
        +   '<div id="pdfBar"></div>'
        +   '<div id="pdfEmpty"></div>'
        + '</div>'
        + '<div id="pdfViewWrap" class="u-mt-3"></div>'
        + '<p class="sub u-mt-3">' + t("tool.pdf.note", "说明：PDF 在本地浏览器内嵌预览；部分环境（file:// 协议）可能受限，此时建议用系统阅读器打开。页码/缩放通过 PDF 打开参数交给内置阅读器，各浏览器支持程度略有差异。") + '</p>';
    },
    bind: function(){
      const inp = $("#pdfFile"), drop = $("#pdfDrop");
      if(!inp) return;
      const open = function(f){
        if(!f) return;
        const isPdf = (f.type === "application/pdf") || /\.pdf$/i.test(f.name || "");
        if(!isPdf){ toast(t("tool.pdf.needPdf", "请选择 PDF 文件"), "warn"); return; }
        if(f.size > 50*1024*1024){ toast(t("tool.pdf.tooBig", "文件过大（建议 <50MB）"), "warn"); return; }
        let url = "";
        try{ url = URL.createObjectURL(f); }catch(e){ toast(t("tool.pdf.openFail", "无法打开该文件：") + (e && e.message || e), "warn"); return; }
        _pdfOpen(f.name, url);
        toast(t("tool.pdf.openedToast", "已打开 {name}").replace("{name}", f.name), "ok");
      };
      inp.onchange = function(){ open(inp.files && inp.files[0]); };
      if(drop){
        ["dragenter","dragover"].forEach(function(ev){
          drop.addEventListener(ev, function(e){ e.preventDefault(); e.stopPropagation(); drop.classList.add("pdf-drop-hot"); });
        });
        ["dragleave","drop"].forEach(function(ev){
          drop.addEventListener(ev, function(e){ e.preventDefault(); e.stopPropagation(); drop.classList.remove("pdf-drop-hot"); });
        });
        drop.addEventListener("drop", function(e){
          const dt = e.dataTransfer; open(dt && dt.files && dt.files[0]);
        });
        drop.addEventListener("click", function(e){
          if(e.target && e.target.closest && e.target.closest("#pdfBar")) return;   /* 点控制条 ≠ 重新选文件 */
          inp.click();
        });
        drop.addEventListener("keydown", function(e){ if(e.key === "Enter" || e.key === " "){ e.preventDefault(); inp.click(); } });
      }
      _pdfRefresh();      /* 首次进入：按当前状态填充控制条 / 空态 / iframe */
    }
  },
  "off-ocr": {
    name:t("tool.ocr.name", "截图 OCR"), icon:UI_ICONS.ocr, desc:t("tool.ocr.desc", "上传截图 · AI 多模态识别文字"),
    render: function(){
      const aiOn = (typeof getCfg === "function") && getCfg().enabled;
      return '<label>' + t("tool.ocr.uploadLabel", "上传截图（PNG/JPG）") + '</label><input type="file" id="ocrFile" accept="image/*" class="u-mt-2">'
        + '<img id="ocrPreview" hidden class="u-mt-3 u-max-w-100 u-max-h-300 u-radius-md u-border-line" alt="' + t("tool.ocr.preview", t("tool.md.preview", "预览")) + '">'
        + '<div class="tool-actions"><button type="button" class="addbtn sm" id="ocrRun"' + (aiOn ? "" : " disabled") + ">" + t("tool.ocr.runBtn", "开始识别") + "</button></div>"
        + '<label class="u-mt-3">' + t("tool.ocr.resultLabel", "识别结果") + '</label>'
        + '<textarea id="ocrResult" readonly placeholder="' + (aiOn ? t("tool.ocr.resultPlaceholder", "识别结果将显示在这里") : t("tool.ocr.noAiPlaceholder", "需先在 设置→AI 配置 API Key 才能使用 OCR")) + '" class="u-min-h-160"></textarea>'
        + (aiOn ? "" : '<p class="sub">' + t("tool.ocr.noAiHint", "未配置 AI——OCR 依赖 AI 多模态能力。请到 设置→AI 填入 API Key 后重试。") + '</p>');
    },
    bind: async function(){
      const inp = $("#ocrFile"); if(!inp) return;
      let dataUrl = "";
      inp.onchange = function(){
        const f = inp.files && inp.files[0]; if(!f) return;
        const reader = new FileReader();
        reader.onload = function(){
          dataUrl = reader.result;
          const img = $("#ocrPreview");
          img.src = dataUrl; img.hidden = false;
        };
        reader.readAsDataURL(f);
      };
      $("#ocrRun").onclick = async function(){
        if(!dataUrl){ toast(t("tool.ocr.uploadFirst", "请先上传截图"), "warn"); return; }
        $("#ocrResult").value = t("tool.ocr.recognizing", "识别中…");
        const text = await AppBridge._aiChatText([
          { role:"user", content:[
            { type:"text", text:t("tool.ocr.extractPrompt", "请提取这张图片中的所有文字，按原始排版输出，不要添加说明。") },
            { type:"image_url", image_url:{ url:dataUrl } }
          ]}
        ]);
        $("#ocrResult").value = text || t("tool.ocr.failResult", "识别失败：请检查 AI 配置或网络后重试");
      };
    }
  },

  /* ================= 设计簇 ================= */
  "des-cad": {
    name:t("tool.cad.name", "CAD 画布"), icon:UI_ICONS.cad, desc:t("tool.cad.desc", "矢量绘制 · 导出 SVG/PNG"),
    render: function(){
      return '<div class="tool-filter-bar">'
        + ["line|"+t("tool.line","线条"),"rect|"+t("tool.rect","矩形"),"circle|"+t("tool.circle","圆"),"poly|"+t("tool.poly","多边形")].map(function(t){ const p=t.split("|");
            return '<button type="button" class="addbtn sm cad-tool" data-cad-tool="' + p[0] + '">' + p[1] + "</button>"; }).join("")
        + '<button type="button" class="addbtn sm" data-sc="danger" id="cadUndo">撤销</button>'
        + '<button type="button" class="addbtn sm" data-sc="danger" id="cadClear">清空</button>'
        + '<label class="u-m-0 u-flex u-ai-center u-gap-1">颜色<input type="color" id="cadColor" class="u-radius-sm u-w-36 u-h-28 u-p-0 u-border-line u-bg-none"></label>'
        + '<button type="button" class="addbtn sm" id="cadSvg">导出 SVG</button>'
        + '<button type="button" class="addbtn sm" id="cadPng">导出 PNG</button></div>'
        + '<canvas id="cadCv" width="800" height="480" class="u-touch-none u-cursor-crosshair"></canvas>'
        + '<p class="sub u-mt-2">操作：线条=按下拖动；矩形/圆=拖对角；多边形=连续点击，双击闭合</p>';
    },
    bind: function(){
      const cv = $("#cadCv"); if(!cv) return;
      const ctx = cv.getContext("2d");
      let shapes = [];
      let mode = "line", drawing = null, polyPts = [];
      $$(".cad-tool").forEach(function(b){
        b.onclick = function(){
          mode = b.getAttribute("data-cad-tool");
          $$(".cad-tool").forEach(function(x){ x.classList.remove("btn-primary"); x.classList.add("addbtn"); });
          b.classList.add("btn-primary"); b.classList.remove("addbtn");
        };
      });
      const firstTool = $(".cad-tool"); if(firstTool){ firstTool.click(); }
      function redraw(){
        ctx.clearRect(0, 0, cv.width, cv.height);
        ctx.fillStyle = _pfCssColor("--panel", "white"); ctx.fillRect(0, 0, cv.width, cv.height);
        shapes.forEach(function(s){
          ctx.strokeStyle = s.color; ctx.fillStyle = s.color; ctx.lineWidth = 2;
          ctx.beginPath();
          if(s.t === "line"){ ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); }
          else if(s.t === "rect"){ ctx.rect(Math.min(s.x1,s.x2), Math.min(s.y1,s.y2), Math.abs(s.x2-s.x1), Math.abs(s.y2-s.y1)); }
          else if(s.t === "circle"){ ctx.arc((s.x1+s.x2)/2, (s.y1+s.y2)/2, Math.max(2, Math.hypot(s.x2-s.x1, s.y2-s.y1)/2), 0, Math.PI*2); }
          else if(s.t === "poly"){ s.pts.forEach(function(p,i){ i ? ctx.lineTo(p.x,p.y) : ctx.moveTo(p.x,p.y); }); ctx.closePath(); }
          ctx.stroke();
        });
        if(polyPts.length){
          ctx.strokeStyle = _pfCssColor("--line", "gray"); ctx.setLineDash([4,4]); ctx.beginPath();
          polyPts.forEach(function(p,i){ i ? ctx.lineTo(p.x,p.y) : ctx.moveTo(p.x,p.y); }); ctx.stroke(); ctx.setLineDash([]);
        }
      }
      function pos(e){ const r = cv.getBoundingClientRect(); return { x:(e.clientX-r.left)*(cv.width/r.width), y:(e.clientY-r.top)*(cv.height/r.height) }; }
      const colorEl = $("#cadColor");
      if(colorEl && !colorEl.value) colorEl.value = _pfCssColor("--accent", "blue");
      cv.addEventListener("mousedown", function(e){
        if(mode === "poly") return;
        const p = pos(e); drawing = { t:mode, x1:p.x, y1:p.y, x2:p.x, y2:p.y, color:colorEl.value };
      });
      cv.addEventListener("mousemove", function(e){
        if(!drawing) return;
        const p = pos(e); drawing.x2 = p.x; drawing.y2 = p.y; redraw();
        ctx.strokeStyle = drawing.color; ctx.lineWidth = 2; ctx.beginPath();
        if(drawing.t === "line"){ ctx.moveTo(drawing.x1,drawing.y1); ctx.lineTo(p.x,p.y); }
        else if(drawing.t === "rect"){ ctx.rect(Math.min(drawing.x1,p.x), Math.min(drawing.y1,p.y), Math.abs(p.x-drawing.x1), Math.abs(p.y-drawing.y1)); }
        else { ctx.arc((drawing.x1+p.x)/2,(drawing.y1+p.y)/2, Math.max(2, Math.hypot(p.x-drawing.x1, p.y-drawing.y1)/2),0,Math.PI*2); }
        ctx.stroke();
      });
      /* v2.3.1：window mouseup 全局只挂一次（此前每次打开工具页新增一个监听器，
         长会话反复开关会累积）；当前画布会话存 _cadSession，bind 时整体替换 */
      _cadSession = {
        commit: function(){ if(drawing){ shapes.push(drawing); drawing = null; redraw(); } }
      };
      if(!window._cadMouseUpBound){
        window._cadMouseUpBound = true;
        window.addEventListener("mouseup", function(){ if(_cadSession) _cadSession.commit(); });
      }
      cv.addEventListener("click", function(e){
        if(mode !== "poly") return;
        const p = pos(e);
        polyPts.push(p); redraw();
      });
      cv.addEventListener("dblclick", function(){
        if(mode !== "poly" || polyPts.length < 3){ polyPts = []; redraw(); return; }
        shapes.push({ t:"poly", pts:polyPts.slice(), color:colorEl.value });
        polyPts = []; redraw();
      });
      $("#cadUndo").onclick = function(){ shapes.pop(); polyPts = []; redraw(); };
      $("#cadClear").onclick = function(){ if(confirm(t("tool.cad.clearConfirm", "清空画布？"))){ shapes = []; polyPts = []; redraw(); } };
      $("#cadSvg").onclick = function(){
        const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 480" width="800" height="480"><rect width="800" height="480" fill="#fff"/>' +
          shapes.map(function(s){
            const st = ' stroke="' + s.color + '" fill="none" stroke-width="2"';
            if(s.t === "line") return '<line x1="'+s.x1+'" y1="'+s.y1+'" x2="'+s.x2+'" y2="'+s.y2+'"'+st+"/>";
            if(s.t === "rect") return '<rect x="'+Math.min(s.x1,s.x2)+'" y="'+Math.min(s.y1,s.y2)+'" width="'+Math.abs(s.x2-s.x1)+'" height="'+Math.abs(s.y2-s.y1)+'"'+st+"/>";
            if(s.t === "circle"){ const r = Math.max(2, Math.hypot(s.x2-s.x1, s.y2-s.y1)/2); return '<circle cx="'+((s.x1+s.x2)/2)+'" cy="'+((s.y1+s.y2)/2)+'" r="'+r+'"'+st+"/>"; }
            if(s.t === "poly") return '<polygon points="'+s.pts.map(function(p){return p.x+","+p.y;}).join(" ")+'"'+st+"/>";
            return "";
          }).join("") + "</svg>";
        _toolDownload("canvas.svg", svg, "image/svg+xml");
      };
      $("#cadPng").onclick = function(){ cv.toBlob(function(b){
        const url = URL.createObjectURL(b); const a = document.createElement("a");
        a.href = url; a.download = "canvas.png"; document.body.appendChild(a); a.click();
        setTimeout(function(){ document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
        toast(t("tool.exportedCanvas", "已导出 canvas.png"), "ok");
      }); };
      redraw();
    }
  },
  "des-ps": {
    name:"PS lite", icon:UI_ICONS.filter, desc:t("tool.ps.desc", "裁剪/旋转/翻转/滤镜/颜色调整/文字/画笔 · 导出 PNG"),
    render: function(){
      /* v3.6.5：布局重构 —— 分组卡片 + 响应式网格（PC 3列滑块/平板2列/移动单列），
         替代原先 4 条 filter-bar 平铺（旋转按钮与文件选择混行、滑块宽度不齐、文字区垂直不居中）。 */
      const G = function(title, inner, extra){
        return '<div class="ps-group"><div class="ps-group-t">' + title + '</div><div class="ps-group-b' + (extra ? ' ' + extra : '') + '">' + inner + '</div></div>';
      };
      return G(t("tool.ps.gFile", "文件与变换"),
        '<label class="addbtn sm ps-file-btn">'+t("tool.ps.pick", "选择图片")+'<input type="file" id="psFile" accept="image/*" class="u-hidden"></label>'
        + '<button type="button" class="addbtn sm" id="psRotate">'+t("tool.ps.rotate", "旋转 90°")+'</button>'
        + '<button type="button" class="addbtn sm" id="psFlipH">'+t("tool.ps.flipH", "水平翻转")+'</button>'
        + '<button type="button" class="addbtn sm" id="psFlipV">'+t("tool.ps.flipV", "垂直翻转")+'</button>'
        + '<button type="button" class="addbtn sm" id="psCrop">'+t("tool.ps.crop", "裁剪")+'</button>'
        + '<button type="button" class="addbtn sm" id="psReset">'+t("tool.ps.reset", "还原")+'</button>'
        + '<button type="button" class="addbtn sm ps-primary" id="psSave">'+t("tool.ps.export", "导出 PNG")+'</button>')
      + G(t("tool.ps.gFilter", "滤镜"),
        '<button type="button" class="addbtn sm ps-fx" data-fx="gray">灰度</button>'
        + '<button type="button" class="addbtn sm ps-fx" data-fx="invert">反色</button>'
        + '<button type="button" class="addbtn sm ps-fx" data-fx="sepia">怀旧</button>'
        + '<button type="button" class="addbtn sm ps-fx" data-fx="blur">模糊</button>'
        + '<button type="button" class="addbtn sm ps-fx" data-fx="sharpen">锐化</button>'
        + '<button type="button" class="addbtn sm ps-fx" data-fx="saturate">饱和度</button>')
      + G(t("tool.ps.gColor", "颜色调整"),
        '<div class="ps-slider"><label>'+t("tool.ps.bright", "亮度")+'</label><input type="range" id="psBright" min="-100" max="100" value="0"></div>'
        + '<div class="ps-slider"><label>'+t("tool.ps.contrast", "对比度")+'</label><input type="range" id="psContrast" min="-100" max="100" value="0"></div>'
        + '<div class="ps-slider"><label>'+t("tool.ps.saturate", "饱和度")+'</label><input type="range" id="psSat" min="-100" max="100" value="0"></div>', 'ps-sliders')
      + G(t("tool.ps.gText", "文字与画笔"),
        '<input type="text" id="psText" placeholder="' + t("tool.ps.watermark", "水印文字") + '" class="u-flex-1 u-min-w-0" maxlength="40">'
        + '<span class="add-wrap"><span class="add-label">'+t("tool.ps.addTextLabel","添加文字")+'</span><button type="button" class="addbtn sm add-round" id="psAddText" aria-label="' + t("tool.ps.addText", "添加文字") + '">＋</button></span>'
        + '<button type="button" class="addbtn sm" id="psBrush">'+t("tool.ps.brush", "画笔")+'</button>', 'ps-flex-end')
      + '<canvas id="psCv" width="640" height="400" class="u-max-w-100 u-cursor-crosshair"></canvas>'
      + '<p class="sub u-mt-2">PS lite：裁剪 / 旋转 / 翻转 / 滤镜 / 颜色调整 / 文字 / 画笔（纯前端 canvas，导出前可叠加多个效果）</p>';
    },
    bind: function(){
      const cv = $("#psCv"); if(!cv) return;
      const ctx = cv.getContext("2d");
      let orig = null;                 // 原始图像（还原用）
      let cropMode = false, brushMode = false, drawing = false;
      let sel = null;                  // 裁剪选区 {x,y,w,h}

      function needImg(){ if(!orig){ toast(t("tool.ps.loadFirst", "请先加载图片"), "warn"); return false; } return true; }
      function saveState(){ orig = ctx.getImageData(0, 0, cv.width, cv.height); }

      // 加载图片
      $("#psFile").onchange = function(){
        const f = this.files && this.files[0]; if(!f) return;
        const img = new Image();
        img.onload = function(){
          const w = Math.min(img.naturalWidth, 900);
          const ratio = img.naturalHeight / img.naturalWidth;
          cv.width = w; cv.height = Math.round(w * ratio);
          ctx.drawImage(img, 0, 0, w, cv.height);
          orig = ctx.getImageData(0, 0, cv.width, cv.height);
          toast(t("tool.ps.loaded", "图片已加载"), "ok");
        };
        img.src = URL.createObjectURL(f);
      };

      // 滤镜（灰度/反色/怀旧/模糊/锐化/饱和度）
      $$(".ps-fx").forEach(function(b){
        b.onclick = function(){
          if(!needImg()) return;
          const im = ctx.getImageData(0, 0, cv.width, cv.height);
          const d = im.data, fx = b.getAttribute("data-fx");
          const w = cv.width, h = cv.height;
          if(fx === "sharpen"){
            // 简单锐化：中心像素 + (中心 - 邻域均值) * 强度
            const src = ctx.getImageData(0, 0, w, h).data;
            for(let y = 1; y < h-1; y++) for(let x = 1; x < w-1; x++){
              const i = (y*w+x)*4;
              for(let c = 0; c < 3; c++){
                const avg = (src[((y-1)*w+x)*4+c] + src[((y+1)*w+x)*4+c] + src[(y*w+x-1)*4+c] + src[(y*w+x+1)*4+c]) / 4;
                d[i+c] = Math.max(0, Math.min(255, src[i+c] + (src[i+c]-avg)*1.2));
              }
            }
          } else {
            for(let i = 0; i < d.length; i += 4){
              const r = d[i], g = d[i+1], bl = d[i+2];
              if(fx === "gray"){ const gy = 0.299*r + 0.587*g + 0.114*bl; d[i]=d[i+1]=d[i+2]=gy; }
              else if(fx === "invert"){ d[i]=255-r; d[i+1]=255-g; d[i+2]=255-bl; }
              else if(fx === "sepia"){ d[i]=Math.min(255, r*0.393+g*0.769+bl*0.189); d[i+1]=Math.min(255, r*0.349+g*0.686+bl*0.168); d[i+2]=Math.min(255, r*0.272+g*0.534+bl*0.131); }
              else if(fx === "saturate"){
                const gy = 0.299*r + 0.587*g + 0.114*bl, s = 1.5;
                d[i]=Math.max(0,Math.min(255, gy+(r-gy)*s)); d[i+1]=Math.max(0,Math.min(255, gy+(g-gy)*s)); d[i+2]=Math.max(0,Math.min(255, gy+(bl-gy)*s));
              }
            }
          }
          ctx.putImageData(im, 0, 0);
          if(fx === "blur"){ ctx.filter = "blur(2px)"; ctx.drawImage(cv, 0, 0); ctx.filter = "none"; }
        };
      });

      // 颜色调整（亮度/对比度/饱和度滑块）
      function adjustColors(){
        if(!needImg()) return;
        const bright = Number($("#psBright").value || 0);
        const contrast = Number($("#psContrast").value || 0);
        const sat = Number($("#psSat").value || 0);
        const im = ctx.getImageData(0, 0, cv.width, cv.height);
        const d = im.data;
        const cf = (259*(contrast+255)) / (255*(259-contrast)); // 对比度因子
        for(let i = 0; i < d.length; i += 4){
          for(let c = 0; c < 3; c++){
            let v = d[i+c];
            v = cf*(v-128)+128 + bright; // 对比度 + 亮度
            d[i+c] = Math.max(0, Math.min(255, v));
          }
          if(sat !== 0){
            const r=d[i], g=d[i+1], bl=d[i+2];
            const gy = 0.299*r + 0.587*g + 0.114*bl, s = 1 + sat/100;
            d[i]=Math.max(0,Math.min(255, gy+(r-gy)*s)); d[i+1]=Math.max(0,Math.min(255, gy+(g-gy)*s)); d[i+2]=Math.max(0,Math.min(255, gy+(bl-gy)*s));
          }
        }
        ctx.putImageData(im, 0, 0);
      }
      ["psBright","psContrast","psSat"].forEach(function(id){
        const el = $("#"+id); if(el) el.oninput = adjustColors;
      });

      // 旋转 90°
      $("#psRotate").onclick = function(){
        if(!needImg()) return;
        const tmp = document.createElement("canvas");
        tmp.width = cv.height; tmp.height = cv.width;
        const tctx = tmp.getContext("2d");
        tctx.translate(tmp.width, 0); tctx.rotate(Math.PI/2);
        tctx.drawImage(cv, 0, 0);
        cv.width = tmp.width; cv.height = tmp.height;
        ctx.drawImage(tmp, 0, 0);
        saveState();
        toast(t("tool.ps.rotated", "已旋转 90°"), "ok");
      };

      // 水平/垂直翻转
      function flip(horiz){
        if(!needImg()) return;
        const tmp = document.createElement("canvas");
        tmp.width = cv.width; tmp.height = cv.height;
        const tctx = tmp.getContext("2d");
        tctx.translate(horiz ? cv.width : 0, horiz ? 0 : cv.height);
        tctx.scale(horiz ? -1 : 1, horiz ? 1 : -1);
        tctx.drawImage(cv, 0, 0);
        ctx.clearRect(0, 0, cv.width, cv.height);
        ctx.drawImage(tmp, 0, 0);
        saveState();
        toast(horiz ? t("tool.ps.flippedH", "已水平翻转") : t("tool.ps.flippedV", "已垂直翻转"), "ok");
      }
      $("#psFlipH").onclick = function(){ flip(true); };
      $("#psFlipV").onclick = function(){ flip(false); };

      // 裁剪（选区拖拽）
      $("#psCrop").onclick = function(){
        if(!needImg()) return;
        cropMode = !cropMode; brushMode = false;
        $("#psCrop").classList.toggle("active", cropMode);
        cv.style.cursor = cropMode ? "crosshair" : "default";
        toast(cropMode ? t("tool.ps.cropModeOn", "裁剪模式：在画布上拖拽选区，松手即应用") : t("tool.ps.cropModeOff", "已退出裁剪模式"), cropMode ? "ok" : "warn");
      };
      let startX = 0, startY = 0;
      cv.onmousedown = function(e){
        const r = cv.getBoundingClientRect();
        if(cropMode){
          startX = e.clientX - r.left; startY = e.clientY - r.top;
          sel = {x:startX, y:startY, w:0, h:0};
          drawing = true;
        } else if(brushMode){
          drawing = true;
          ctx.beginPath();
          ctx.moveTo(e.clientX - r.left, e.clientY - r.top);
        }
      };
      cv.onmousemove = function(e){
        if(!drawing) return;
        const r = cv.getBoundingClientRect();
        const mx = e.clientX - r.left, my = e.clientY - r.top;
        if(cropMode && sel){
          sel.w = mx - sel.x; sel.h = my - sel.y;
          ctx.putImageData(orig, 0, 0);
          ctx.strokeStyle = _pfCssColor("--accent", ""); ctx.lineWidth = 1.5; ctx.setLineDash([4,3]);
          ctx.strokeRect(sel.x, sel.y, sel.w, sel.h);
          ctx.setLineDash([]);
        } else if(brushMode){
          ctx.lineTo(mx, my); ctx.stroke();
        }
      };
      cv.onmouseup = function(){
        if(cropMode && sel && Math.abs(sel.w) > 4 && Math.abs(sel.h) > 4){
          const sx = Math.max(0, sel.x), sy = Math.max(0, sel.y);
          const sw = Math.min(Math.abs(sel.w), cv.width - sx), sh = Math.min(Math.abs(sel.h), cv.height - sy);
          if(sw > 4 && sh > 4){
            const tmp = document.createElement("canvas");
            tmp.width = Math.round(sw); tmp.height = Math.round(sh);
            const tctx = tmp.getContext("2d");
            tctx.drawImage(cv, sx, sy, sw, sh, 0, 0, sw, sh);
            cv.width = Math.round(sw); cv.height = Math.round(sh);
            ctx.drawImage(tmp, 0, 0);
            saveState();
            toast(t("tool.ps.cropped", "已裁剪"), "ok");
          }
        }
        cropMode = false; $("#psCrop").classList.remove("active");
        cv.style.cursor = brushMode ? "crosshair" : "default";
        drawing = false; sel = null;
      };

      // 文字水印
      $("#psAddText").onclick = function(){
        if(!needImg()) return;
        const txt = $("#psText").value.trim();
        if(!txt){ toast(t("tool.ps.watermarkFirst", "请输入水印文字"), "warn"); return; }
        ctx.font = "bold " + _pfCssFont("--fs-display-sm", "32px") + " sans-serif";
        ctx.fillStyle = _pfCssColor("--ps-wm-fill", "");
        ctx.shadowColor = _pfCssColor("--ps-wm-shadow", ""); ctx.shadowBlur = 4;
        ctx.fillText(txt, 20, cv.height - 30);
        ctx.shadowBlur = 0;
        saveState();
        toast(t("tool.ps.textAdded", "已添加文字"), "ok");
      };

      // 画笔
      $("#psBrush").onclick = function(){
        if(!needImg()) return;
        brushMode = !brushMode; cropMode = false;
        $("#psBrush").classList.toggle("active", brushMode);
        cv.style.cursor = brushMode ? "crosshair" : "default";
        if(brushMode){ ctx.strokeStyle = _pfCssColor("--accent", ""); ctx.lineWidth = 4; ctx.lineCap = "round"; }
        toast(brushMode ? t("tool.ps.brushModeOn", "画笔模式：在画布上拖拽绘制") : t("tool.ps.brushModeOff", "已退出画笔模式"), brushMode ? "ok" : "warn");
      };

      // 还原
      $("#psReset").onclick = function(){ if(orig){ ctx.putImageData(orig, 0, 0); toast(t("tool.ps.resetDone", "已还原原图"), "ok"); } else toast(t("tool.ps.loadFirst", "请先加载图片"), "warn"); };

      // 导出
      $("#psSave").onclick = function(){
        if(!needImg()) return;
        cv.toBlob(function(bl){
          const url = URL.createObjectURL(bl); const a = document.createElement("a");
          a.href = url; a.download = "pslite.png"; a.click();
          setTimeout(function(){ URL.revokeObjectURL(url); }, 100);
          toast(t("tool.exportedPslite", t("tool.ps.exported", "已导出 pslite.png")), "ok");
        });
      };
    }
  },
  "des-imggen": {
    name:t("tool.imgGen.name", "AI 文生图"), icon:UI_ICONS.imggen, desc:t("tool.imgGen.desc", "输入描述 → AI 生成图片"),
    render: function(){
      const aiOn = (typeof getCfg === "function") && getCfg().enabled;
      return '<label>' + t("tool.imgGen.descLabel", "图片描述") + '</label><textarea id="igPrompt" placeholder="' + t("tool.imgGen.descPlaceholder", "例如：一只橘猫坐在窗台上看雨，水彩风格") + '" class="u-min-h-80"></textarea>'
        + '<div class="tool-form-grid"><div class="tool-field"><label>' + t("tool.imgGen.size", "尺寸") + '</label><select id="igSize"><option value="512x512">512×512</option><option value="768x768">768×768</option><option value="1024x1024">1024×1024</option></select></div></div>'
        + '<div class="tool-actions"><button type="button" class="addbtn sm btn-primary" id="igGo"' + (aiOn ? "" : " disabled") + ">" + t("tool.imgGen.generate", "生成图片") + "</button></div>"
        + (aiOn ? "" : '<p class="sub u-mt-2">' + t("tool.imgGen.noAiTip", "未配置 AI——文生图需要 AI API。到 设置→AI 配置后即可使用。") + '</p>')
        /* v3.7.54：补输出容器。bind() 里点「生成图片」要往 #igOut 写 innerHTML，
           而 render() 此前从没输出这个节点 → AI 一旦启用，点下去就是
           `Cannot read properties of null (reading 'innerHTML')`。按钮在 aiOn=false 时
           被 disabled，所以这个洞在默认配置下一直没人踩到。 */
        + '<div id="igOut" class="u-mt-2"></div>';
    },
    bind: function(){
      const go = $("#igGo"); if(!go) return;
      go.onclick = async function(){
        const p = $("#igPrompt").value.trim();
        if(!p){ toast(t("tool.imgGen.enterDesc", "请输入图片描述"), "warn"); return; }
        $("#igOut").innerHTML = sanitizeHtml('<div class="coach-hint">' + t("tool.imgGen.generating", "生成中…（约 10–30 秒）") + '</div>');
        const text = await AppBridge._aiChatText([{ role:"user", content:t("tool.imgGen.svgPrompt", "为以下描述生成一张图片的 SVG 简笔示意（仅返回 SVG 代码）：\n{desc}").replace("{desc}", p) }]);
        const out = $("#igOut");
        if(text && text.indexOf("<svg") >= 0){
          let svgPart = text.slice(text.indexOf("<svg"));
          svgPart = svgPart.slice(0, svgPart.indexOf("</svg>") + 6);
          out.innerHTML = sanitizeHtml(svgPart);
        } else {
          out.innerHTML = sanitizeHtml('<div class="empty">' + t("tool.imgGen.failResult", "生成失败：当前 AI 接口未支持图片输出。<br><small>可在设置中切换支持的模型，或稍后再试。</small>") + '</div>');
        }
      };
    }
  },
  "des-vidgen": {
    /* v3.7.21：原 desc 声称"文本描述 → AI 视频生成"，但按钮只弹"通道暂未开放" —— 承诺了不存在的能力。
       现如实说明，并把这一步做成**当下真能用**的能力：用已配置的文本 AI 产出分镜脚本 + 视频提示词
       （可直接粘贴到任何视频模型）。视频模型真接入后可在同处扩展。 */
    name:t("tool.vidGen.name", "AI 视频生成"), icon:UI_ICONS.vidgen, desc:t("tool.vidGen.desc2", "分镜脚本 + 视频提示词（视频模型尚未接入）"),
    render: function(){
      const aiOn = (typeof getCfg === "function") && getCfg().enabled;
      return '<label>' + t("tool.vidGen.descLabel", "视频描述") + '</label><textarea id="vgPrompt" placeholder="' + t("tool.vidGen.descPlaceholder", "描述想要的视频画面与镜头运动…") + '" class="u-min-h-100"></textarea>'
        + '<div class="tool-form-grid"><div class="tool-field"><label>' + t("tool.vidGen.duration", "时长") + '</label><select id="vgLen"><option value="3">' + t("tool.vidGen.duration.3", "3 秒") + '</option><option value="5">' + t("tool.vidGen.duration.5", "5 秒") + '</option><option value="10">' + t("tool.vidGen.duration.10", "10 秒") + '</option></select></div>'
        + '<div class="tool-field"><label>' + t("tool.vidGen.style", "风格") + '</label><select id="vgStyle">'
        +   '<option value="real">' + t("tool.vidGen.style.real", "写实") + '</option>'
        +   '<option value="anime">' + t("tool.vidGen.style.anime", "动画") + '</option>'
        +   '<option value="cg">' + t("tool.vidGen.style.cg", "3D/CG") + '</option></select></div></div>'
        + '<div class="tool-actions"><button type="button" class="addbtn sm btn-primary" id="vgGo"' + (aiOn ? "" : " disabled") + ">" + t("tool.vidGen.go", "生成分镜与提示词") + "</button>"
        + '<button type="button" class="addbtn sm" id="vgCopy">' + t("tool.json.copy", "复制") + '</button></div>'
        + '<div id="vgOut" class="u-mt-3"></div>'
        + (aiOn
          ? '<p class="sub u-mt-2">' + t("tool.vidGen.noteAi2", "说明：本工具产出**分镜脚本 + 视频提示词**，可直接粘贴到任意视频生成模型使用；工坊尚未接入视频模型，不代生成视频。") + '</p>'
          : '<p class="sub u-mt-2">' + t("tool.vidGen.noAiTip", "未配置 AI——本工具需要文本 AI 生成分镜与提示词。到 设置→AI 配置 API Key 后启用。") + '</p>');
    },
    bind: function(){
      const go = $("#vgGo"), out = $("#vgOut"), copy = $("#vgCopy");
      if(copy) copy.onclick = function(){
        const t2 = out && out.querySelector("textarea");
        try{ if(t2 && t2.value){ navigator.clipboard.writeText(t2.value); toast(t("tool.copied", "已复制"), "ok"); } }catch(_e){}
      };
      if(!go) return;
      go.onclick = async function(){
        const desc = ($("#vgPrompt") || {}).value || "";
        if(!desc.trim()){ toast(t("tool.vidGen.enterDesc", "请输入视频描述"), "warn"); return; }
        const secs = ($("#vgLen") || {}).value || "5";
        const style = ($("#vgStyle") || {}).value || "real";
        out.innerHTML = sanitizeHtml('<div class="coach-hint">' + t("tool.vidGen.generating", "生成中…（约 10–30 秒）") + '</div>');
        const text = await AppBridge._aiChatText([{ role:"user", content:_vgBuildPrompt(desc, secs, style) }]);
        if(!text){ out.innerHTML = sanitizeHtml('<div class="empty">' + t("tool.vidGen.failed", "生成失败或未返回内容（请检查 AI 配置与网络）") + '</div>'); return; }
        /* 结果放到只读 textarea：便于整段复制粘贴（而不是塞进 HTML —— 也顺手避免注入面） */
        out.innerHTML = "";
        const ta = document.createElement("textarea");
        ta.className = "u-min-h-240 u-font-mono u-fs-2xs";
        ta.readOnly = true;
        ta.value = String(text).trim();
        out.appendChild(ta);
      };
    }
  },

  /* ================= 检索簇 ================= */
  "stu-web": {
    name:t("tool.webSearch.name", "在线检索"), icon:UI_ICONS.searchWeb, desc:t("tool.webSearch.desc", "跨任务 / 笔记 / 资料 / 场景 全文检索"),
    render: function(){
      return '<div class="tool-filter-bar"><input type="text" id="swQ" placeholder="' + t("tool.webSearch.placeholder", "输入关键词，回车或点搜索") + '" class="u-flex-1">'
        + '<button type="button" class="addbtn sm btn-primary" id="swGo">' + t("tool.webSearch.search", "搜索") + '</button></div>'
        + '<div id="swRes"></div>';
    },
    bind: function(){
      const q = $("#swQ"); if(!q) return;
      const run = function(){
        const kw = q.value.trim().toLowerCase();
        const box = $("#swRes");
        if(!kw){ box.innerHTML = sanitizeHtml(""); return; }
        const hits = { tasks:[], notes:[], recs:[], scenes:[] };
        getActiveTasks().forEach(function(t){
          if((t.title||"").toLowerCase().indexOf(kw) >= 0) hits.tasks.push(t);
        });
        ORDER.forEach(function(sc){
          if(SCENARIOS[sc].name.toLowerCase().indexOf(kw) >= 0) hits.scenes.push(sc);
          getRec(sc).forEach(function(r){
            if(String(r.title||"").toLowerCase().indexOf(kw) >= 0) hits.recs.push({ sc:sc, title:r.title });
          });
        });
        let html = "";
        if(hits.tasks.length) html += '<h3>' + t("tool.webSearch.tasks", "任务") + ' (' + hits.tasks.length + ')</h3><ul class="list">' + hits.tasks.slice(0,20).map(function(t){
          return '<li><div class="body"><div class="t">' + esc(t.title) + '</div><div class="m">' + esc(scMeta(t.sc).name) + " · " + t.status + (t.due ? " · " + t.due : "") + "</div></div></li>"; }).join("") + "</ul>";
        if(hits.scenes.length) html += '<h3>' + t("tool.webSearch.scenes", "场景") + '</h3><div class="u-flex u-gap-2 u-flex-wrap">' + hits.scenes.map(function(sc){
          return '<span class="tag">' + esc(SCENARIOS[sc].name) + "</span>"; }).join("") + "</div>";
        if(hits.recs.length) html += '<h3>' + t("tool.webSearch.records", "资料") + ' (' + hits.recs.length + ')</h3><ul class="list">' + hits.recs.slice(0,20).map(function(r){
          return '<li><div class="body"><div class="t">' + esc(r.title) + '</div><div class="m">' + esc(SCENARIOS[r.sc].name) + "</div></div></li>"; }).join("") + "</ul>";
        box.innerHTML = sanitizeHtml(html || renderEmpty("no-search"));
      };
      $("#swGo").onclick = run;
      q.onkeydown = function(e){ if(e.key === "Enter") run(); };
    }
  },

  /* ================= 编程簇 ================= */
  "cod-compile": {
    name:t("tool.runner.name", "代码运行器"), icon:UI_ICONS.compile, desc:t("tool.runner.desc", "浏览器沙箱执行 JS · 输出捕获"),
    render: function(){
      const hist = _toolData("cod-compile-hist");
      return '<label>' + t("tool.runner.codeLabel", "JavaScript 代码") + '</label><textarea id="ccCode" class="code-input u-min-h-200" placeholder="' + t("tool.runner.codePlaceholder", "// 在这里编写 JavaScript 代码...") + '"></textarea>'
        + '<div class="tool-actions"><button type="button" class="addbtn sm btn-primary" id="ccRun">' + t("tool.runner.run", "▶ 运行") + '</button>'
        + '<button type="button" class="addbtn sm" data-sc="muted" id="ccClrOut">' + t("tool.runner.clearOut", "清空输出") + '</button></div>'
        + '<label class="u-mt-3">' + t("tool.runner.output", "输出") + '</label><pre id="ccOut" class="snip u-min-h-120">' + t("tool.runner.outputPlaceholder", "// console 输出显示在这里") + '</pre>'
        + (hist.length ? '<details class="u-mt-3"><summary class="u-pointer u-fs-xs">' + t("tool.runner.history", "历史代码") + ' (' + hist.length + ")</summary>"
          + '<ul class="list">' + hist.slice(0,10).map(function(h,i){ return '<li class="u-pad-1h-2h"><div class="body"><a href="#" data-cc-hist="' + i + '">' + esc((h.code||"").slice(0,60)) + "…</a></div></li>" }).join("") + "</ul></details>" : "")
        + '<p class="sub u-mt-2">' + t("tool.runner.safetyTip", "安全提示：代码在 Web Worker 沙箱中运行，无法访问应用数据、DOM 或 localStorage；最长 10 秒，用 console.log/warn/error 输出。") + '</p>';
    },
    bind: function(){
      const codeEl = $("#ccCode"); if(!codeEl) return;
      const out = $("#ccOut");
      $("#ccRun").onclick = function(){
        out.textContent = "";
        const code = codeEl.value;
        /* 存历史（v3.1.1：去重逻辑与原实现一致） */
        const hist = _toolData("cod-compile-hist");
        if(!(hist[0] && hist[0].code === code)){ hist.unshift({ code:code, at:Date.now() }); _toolSave("cod-compile-hist", hist.slice(0, 10)); }
        /* v3.1.1 [S2]：原用 new Function（全局作用域，可读写 localStorage/window，
         * 与「无法访问应用数据」的 UI 声明矛盾）；现复用 runJsSnippet 的 Worker 沙箱，声明变为事实。 */
        runJsSnippet(code, { timeout: 10000 }).then(function(r){
          out.textContent = (r.ok ? "" : "❌ ") + r.output + "\n(" + r.ms + "ms)";
        });
      };
      $("#ccClrOut").onclick = function(){ out.textContent = t("tool.runner.outputPlaceholder", "// console 输出显示在这里"); };
      $$("#main [data-cc-hist]").forEach(function(a){
        a.onclick = function(e){ e.preventDefault();
          const hist = _toolData("cod-compile-hist");
          codeEl.value = hist[Number(a.getAttribute("data-cc-hist"))].code || "";
        };
      });
    }
  },
  /* ================= v3.6.5 开发工具集（轻量 IDE 常用场景，用户反馈"编程能力要真能提效"） ================= */
  "cod-json": {
    name:t("tool.json.name","JSON 工具"), icon:UI_ICONS.sheet, desc:t("tool.json.desc","格式化 · 校验 · 压缩 · 复制"),
    render: function(){
      return '<div class="tool-filter-bar">'
        + '<button type="button" class="addbtn sm" id="jwFmt">'+t("tool.json.fmt","格式化")+'</button>'
        + '<button type="button" class="addbtn sm" id="jwCmp">'+t("tool.json.min","压缩")+'</button>'
        + '<button type="button" class="addbtn sm" id="jwCopy">'+t("tool.json.copy","复制结果")+'</button>'
        + '<select id="jwIndent" class="u-flex-0-1-120"><option value="2">2 空格</option><option value="4">4 空格</option></select>'
        + '</div>'
        + '<div class="u-grid-2col u-gap-3">'
        + '<div><label>'+t("tool.json.in","输入 JSON")+'</label><textarea id="jwIn" class="u-min-h-260 u-font-mono u-fs-2xs" placeholder=\'{"name":"demo","ok":true}\'></textarea></div>'
        + '<div><label>'+t("tool.json.outLabel","结果")+' <span id="jwStatus" class="u-fs-2xs"></span></label><textarea id="jwOut" class="u-min-h-260 u-font-mono u-fs-2xs" readonly></textarea></div>'
        + '</div>';
    },
    bind: function(){
      const $i=$("#jwIn"), $o=$("#jwOut"), $st=$("#jwStatus");
      const run=function(minify){
        if(!$i||!$o) return;
        const raw=$i.value; if(!raw.trim()){ if($st)$st.textContent=""; $o.value=""; return; }
        try{
          const obj=JSON.parse(raw);
          const n=parseInt(($("#jwIndent")||{}).value||"2",10)||2;
          $o.value=minify?JSON.stringify(obj):JSON.stringify(obj,null,n);
          if($st){ $st.textContent="✓ "+t("tool.json.valid","合法 JSON")+"（"+raw.length+" → "+$o.value.length+"）"; $st.style.color="var(--ok)"; }
        }catch(e){
          $o.value="";
          if($st){ $st.textContent="✗ "+(e.message||""); $st.style.color="var(--danger)"; }
        }
      };
      const b1=$("#jwFmt"); if(b1) b1.onclick=function(){ run(false); };
      const b2=$("#jwCmp"); if(b2) b2.onclick=function(){ run(true); };
      const b3=$("#jwCopy"); if(b3) b3.onclick=function(){ try{ if($o&&$o.value){ navigator.clipboard.writeText($o.value); toast(t("tool.copied","已复制"),"ok"); } }catch(_){} };
      if($i) $i.oninput=function(){ run(false); };
    }
  },
  "cod-time": {
    name:t("tool.time.name","时间戳"), icon:UI_ICONS.stopwatch, desc:t("tool.time.desc2","Unix ↔ 日期 双向转换 · 时间差 · 常用时间点"),
    render: function(){
      return '<div class="tool-filter-bar">'
        + '<button type="button" class="addbtn sm" id="tsNow">'+t("tool.time.now","当前时间")+'</button>'
        + '<span class="sub u-m-0">'+t("tool.time.tip","毫秒(13位)/秒(10位) 自动识别；右侧输入日期实时回写")+'</span>'
        + '</div>'
        + '<div class="u-grid-2col u-gap-3">'
        + '<div><label>'+t("tool.time.unix","Unix 时间戳")+'</label><input type="text" id="tsUnix" class="u-font-mono" placeholder="1789250411553 或 1789250411"></div>'
        + '<div><label>'+t("tool.time.local","本地日期时间")+'</label><input type="text" id="tsDate" class="u-font-mono" placeholder="2026-09-13 12:00:00"></div>'
        + '</div>'
        + '<div id="tsInfo" class="u-fs-2xs u-text-muted u-mt-1"></div>'
        /* v3.7.21：常用时间点（一键填入；做日报/周报、算"距今天数"最常用） */
        + '<label class="u-mt-3">'+t("tool.time.common","常用时间点")+'</label>'
        + '<div class="tool-actions" id="tsCommon"></div>'
        /* v3.7.21：时间差计算（时间戳工具最高频的真实用途之一） */
        + '<label class="u-mt-3">'+t("tool.time.diffTitle","时间差计算")+'</label>'
        + '<div class="u-grid-2col u-gap-3">'
        + '<div><label class="u-fs-2xs">'+t("tool.time.diffA","A（早）")+'</label><input type="text" id="tsA" class="u-font-mono" placeholder="2026-09-01 或 时间戳"></div>'
        + '<div><label class="u-fs-2xs">'+t("tool.time.diffB","B（晚）")+'</label><input type="text" id="tsB" class="u-font-mono" placeholder="留空 = 现在"></div>'
        + '</div>'
        + '<div id="tsDiffOut" class="u-fs-2xs u-text-muted u-mt-1"></div>';
    },
    bind: function(){
      const $u=$("#tsUnix"), $d=$("#tsDate"), $f=$("#tsInfo");
      const pad=function(n){ return (n<10?"0":"")+n; };
      const fmt=function(d){ return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate())+" "+pad(d.getHours())+":"+pad(d.getMinutes())+":"+pad(d.getSeconds()); };
      const fromUnix=function(){
        if(!$u||!$d) return;
        const raw=$u.value.trim(); if(!raw||isNaN(+raw)) return;
        let n=+raw; if(String(Math.trunc(Math.abs(n))).length<=10) n*=1000;
        const d=new Date(n); if(isNaN(d.getTime())) return;
        $d.value=fmt(d);
        if($f) $f.textContent="ISO: "+d.toISOString()+"   ·   UTC: "+d.toUTCString();
      };
      const fromDate=function(){
        if(!$d||!$u) return;
        const raw=$d.value.trim(); if(!raw) return;
        const d=new Date(raw.replace(" ","T")); if(isNaN(d.getTime())) return;
        $u.value=String(d.getTime());
        if($f) $f.textContent=_tsDualLine(d);
      };
      const b1=$("#tsNow"); if(b1) b1.onclick=function(){ const d=new Date(); if($u)$u.value=String(d.getTime()); if($d)$d.value=fmt(d); if($f)$f.textContent=_tsDualLine(d); };
      if($u) $u.oninput=fromUnix;
      if($d) $d.oninput=fromDate;
      /* 常用时间点：一键填入（同时写 unix 与本地日期，保持两侧一致） */
      const host=$("#tsCommon");
      if(host){
        host.innerHTML = sanitizeHtml(_tsCommonPoints(new Date()).map(function(p){
          return '<button type="button" class="addbtn sm" data-ts-pt="' + p.ts + '">' + esc(p.label) + '</button>';
        }).join(""));
        $$("#tsCommon [data-ts-pt]").forEach(function(b){
          b.onclick=function(){
            const ts=parseInt(b.getAttribute("data-ts-pt"),10);
            const dt=new Date(ts);
            if($u) $u.value=String(ts);
            if($d) $d.value=fmt(dt);
            if($f) $f.textContent=_tsDualLine(dt);
          };
        });
      }
      /* 时间差：A/B 任一变动即重算（B 留空 = 现在，实时用途最多） */
      const calcDiff=function(){
        const out=$("#tsDiffOut"); if(!out) return;
        const a=_tsParsePoint(($("#tsA")||{}).value, new Date());
        const bRaw=($("#tsB")||{}).value;
        const b=bRaw && String(bRaw).trim() ? _tsParsePoint(bRaw, new Date()) : new Date();
        if(!a || !b){ out.textContent = ""; return; }
        const ms=b.getTime()-a.getTime();
        out.textContent = _tsHumanDiff(ms) + "（" + (ms<0?"B 早于 A":"A → B") + "，" + Math.abs(ms) + " ms）";
      };
      ["#tsA","#tsB"].forEach(function(sel){ const el=$(sel); if(el) el.oninput=calcDiff; });
      calcDiff();
    }
  },
  "cod-codec": {
    name:t("tool.codec.name","编解码"), icon:UI_ICONS.md2code, desc:t("tool.codec.desc","Base64 · URL 编解码（UTF-8 安全）"),
    render: function(){
      return '<div class="tool-filter-bar">'
        + '<select id="ccMode" class="u-flex-0-1-160"><option value="b64">Base64</option><option value="url">URL</option></select>'
        + '<button type="button" class="addbtn sm" id="ccEnc">'+t("tool.codec.enc","编码 →")+'</button>'
        + '<button type="button" class="addbtn sm" id="ccDec">'+t("tool.codec.dec","← 解码")+'</button>'
        + '<button type="button" class="addbtn sm" id="ccSwap">'+t("codec.swap","⇅ 互换")+'</button>'
        + '</div>'
        + '<div class="u-grid-2col u-gap-3">'
        + '<div><label>'+t("tool.codec.in","输入")+'</label><textarea id="ccIn" class="u-min-h-200 u-font-mono u-fs-2xs"></textarea></div>'
        + '<div><label>'+t("tool.codec.out","输出")+'</label><textarea id="ccOut" class="u-min-h-200 u-font-mono u-fs-2xs" readonly></textarea></div>'
        + '</div>';
    },
    bind: function(){
      const $i=$("#ccIn"), $o=$("#ccOut"), $m=$("#ccMode");
      const b64enc=function(s){ try{ return btoa(unescape(encodeURIComponent(s))); }catch(_){ return ""; } };
      const b64dec=function(s){ try{ return decodeURIComponent(escape(atob(s))); }catch(_){ return ""; } };
      const run=function(enc){
        if(!$i||!$o||!$m) return;
        const mode=$m.value, v=$i.value;
        try{
          if(mode==="b64"){ $o.value=enc?b64enc(v):b64dec(v); }
          else{ $o.value=enc?encodeURIComponent(v):decodeURIComponent(v); }
        }catch(e){ $o.value="✗ "+e.message; }
      };
      const b1=$("#ccEnc"); if(b1) b1.onclick=function(){ run(true); };
      const b2=$("#ccDec"); if(b2) b2.onclick=function(){ run(false); };
      const b3=$("#ccSwap"); if(b3) b3.onclick=function(){ if($i&&$o){ const t=$i.value; $i.value=$o.value; $o.value=t; } };
    }
  },
  "cod-uuid": {
    name:t("tool.uuid.name","UUID / 随机串"), icon:UI_ICONS.plus, desc:t("tool.uuid.desc","v4 UUID · 批量生成 · 复制"),
    render: function(){
      return '<div class="tool-filter-bar">'
        + '<select id="uuN" class="u-flex-0-1-120"><option value="1">1 个</option><option value="5">5 个</option><option value="10">10 个</option><option value="20">20 个</option></select>'
        + '<select id="uuFmt" class="u-flex-0-1-160"><option value="std">'+t("tool.uuid.std","标准（含连字符）")+'</option><option value="raw">'+t("tool.uuid.raw","纯十六进制")+'</option></select>'
        + '<button type="button" class="addbtn sm" id="uuGo">'+t("tool.uuid.gen","生成")+'</button>'
        + '<button type="button" class="addbtn sm" id="uuCopy">'+t("tool.json.copy","复制")+'</button>'
        + '</div>'
        + '<textarea id="uuOut" class="u-min-h-200 u-font-mono u-fs-2xs" readonly placeholder="'+t("tool.uuid.ph","点击「生成」输出…")+'"></textarea>';
    },
    bind: function(){
      const $o=$("#uuOut");
      const gen=function(){
        const n=parseInt(($("#uuN")||{}).value||"1",10)||1;
        const f=($("#uuFmt")||{}).value||"std";
        const lines=[];
        for(let i=0;i<n;i++){
          let s;
          if(typeof crypto!=="undefined" && crypto.getRandomValues){
            const b=crypto.getRandomValues(new Uint8Array(16));
            b[6]=(b[6]&0x0f)|0x40; b[8]=(b[8]&0x3f)|0x80;
            const hx=Array.from(b,function(x){ return (x<16?"0":"")+x.toString(16); }).join("");
            s=(f==="raw")?hx:hx.slice(0,8)+"-"+hx.slice(8,12)+"-"+hx.slice(12,16)+"-"+hx.slice(16,20)+"-"+hx.slice(20);
          } else { s=String(Math.random()).slice(2); }
          lines.push(s);
        }
        if($o) $o.value=lines.join("\n");
      };
      const b1=$("#uuGo"); if(b1) b1.onclick=gen;
      const b2=$("#uuCopy"); if(b2) b2.onclick=function(){ try{ if($o&&$o.value){ navigator.clipboard.writeText($o.value); toast(t("tool.copied","已复制"),"ok"); } }catch(_){} };
      gen();
    }
  },
  "cod-regex": {
    name:t("tool.regex.name", "正则测试器"), icon:UI_ICONS.regex, desc:t("tool.regex.desc", "实时匹配 · 捕获组 · 高亮"),
    render: function(){
      const presets = [[t("tool.regex.preset.email", "邮箱"),"[\\w.-]+@[\\w.-]+\\.\\w+"],[t("tool.regex.preset.phone", "手机号"),"1[3-9]\\d{9}"],[t("tool.regex.preset.url", "URL"),"https?://[^\\s]+"],[t("tool.regex.preset.date", "日期"),"\\d{4}-\\d{2}-\\d{2}"],[t("tool.regex.preset.idCard", "身份证"),"\\d{17}[\\dXx]"]];
      return '<div class="tool-filter-bar">'
        + '<input type="text" id="rePat" placeholder="' + t("tool.regex.patternPlaceholder", "正则表达式，如 \\d+") + '" class="u-flex-1 u-font-mono">'
        + '<label class="u-m-0 u-fs-2xs"><input type="checkbox" id="reG" checked> g</label>'
        + '<label class="u-m-0 u-fs-2xs"><input type="checkbox" id="reI"> i</label>'
        + '<label class="u-m-0 u-fs-2xs"><input type="checkbox" id="reM"> m</label>'
        + '<select id="rePreset"><option value="">' + t("tool.regex.presetsLabel", "常用模式…") + '</option>' + presets.map(function(p){ return '<option value="' + esc(p[1]) + '">' + esc(p[0]) + "</option>"; }).join("") + "</select></div>"
        + '<label>' + t("tool.regex.testText", "测试文本") + '</label><textarea id="reTxt" class="u-min-h-120" placeholder="' + t("tool.regex.testPlaceholder", "粘贴要测试的文本…") + '"></textarea>'
        + '<div id="reErr" class="u-text-danger u-fs-2xs u-mt-1h"></div>'
        + '<div id="reMatches" class="u-mt-2"></div>'
        + '<label class="u-mt-3">' + t("tool.regex.highlight", "高亮预览") + '</label><div id="reHi" class="card u-fs-2xs u-pre-wrap u-p-3 u-font-mono u-lh-17"class="u-min-h-60"></div>';
    },
    bind: function(){
      const patEl = $("#rePat"); if(!patEl) return;
      const run = function(){
        const src = patEl.value;
        const flags = ($("#reG").checked?"g":"") + ($("#reI").checked?"i":"") + ($("#reM").checked?"m":"");
        const txt = $("#reTxt").value;
        $("#reErr").textContent = "";
        $("#reMatches").innerHTML = sanitizeHtml("");
        $("#reHi").innerHTML = sanitizeHtml(esc(txt));
        if(!src){ return; }
        let re;
        try{ re = new RegExp(src, flags); }
        catch(e){ $("#reErr").textContent = t("tool.regex.syntaxErr", "正则语法错误：{err}").replace("{err}", e.message); return; }
        const matches = []; let m, guard = 0;
        if(flags.indexOf("g") >= 0){
          while((m = re.exec(txt)) !== null && guard++ < 500){
            matches.push({ idx:m.index, len:m[0].length, groups:Array.prototype.slice.call(m, 1) });
            if(m[0].length === 0) re.lastIndex++;
          }
        } else {
          m = re.exec(txt);
          if(m) matches.push({ idx:m.index, len:m[0].length, groups:Array.prototype.slice.call(m, 1) });
        }
        if(!matches.length){ $("#reMatches").innerHTML = sanitizeHtml('<span class="sub u-m-0">' + t("tool.regex.noMatch", "无匹配") + '</span>'); return; }
        $("#reMatches").innerHTML = sanitizeHtml("<b>" + t("tool.regex.matchCount", "{count} 处匹配").replace("{count}", matches.length) + "</b><ul class=\"list\">" + matches.slice(0, 50).map(function(mt, i){
          return "<li style='padding:var(--space-1) var(--space-2h)'><div class=\"body\"><b>#" + (i+1) + "</b> " + t("tool.regex.matchInfo", "位置 {idx} · 长度 {len}").replace("{idx}", mt.idx).replace("{len}", mt.len) + (mt.groups.length ? " · " + t("tool.regex.groups", "组:") + " [" + mt.groups.map(function(g){return JSON.stringify(g);}).join(", ") + "]" : "") + "</div></li>";
        }).join("") + "</ul>");
        /* 高亮 */
        let hi = "", last = 0;
        matches.forEach(function(mt){
          hi += esc(txt.slice(last, mt.idx));
          const hit = txt.substr(mt.idx, mt.len);
          hi += '<mark class="u-text-accent u-bg-accent-soft"style="border-radius:2px;padding:0 1px">' + esc(hit) + "</mark>";
          last = mt.idx + mt.len;
        });
        hi += esc(txt.slice(last));
        $("#reHi").innerHTML = sanitizeHtml(hi);
      };
      ["#rePat","#reTxt","#reG","#reI","#reM"].forEach(function(sel){
        const el = $(sel); if(!el) return;
        el.addEventListener(el.tagName === "TEXTAREA" || el.type === "text" ? "input" : "change", run);
      });
      $("#rePreset").onchange = function(){
        if(this.value){ patEl.value = this.value; run(); }
      };
    }
  },
  "cod-md2code": {
    name:t("tool.md2code.name", "Markdown 转代码"), icon:UI_ICONS.md2code, desc:t("tool.md2code.desc", "MD → HTML / JSON 大纲 / 纯文本"),
    render: function(){
      return '<div class="u-gap-3"class="u-grid-2col">'
        + '<div><label>' + t("tool.md2code.input", "Markdown 输入") + '</label><textarea id="mcIn" class="u-min-h-280" placeholder="' + t("tool.md2code.inputPlaceholder", "# 标题&#10;- 列表项&#10;**加粗** …") + '"></textarea></div>'
        + '<div><div class="tool-filter-bar u-mb-2">'
        + '<select id="mcFmt"><option value="html">' + t("tool.md2code.fmt.html", "HTML") + '</option><option value="json">' + t("tool.md2code.fmt.json", "JSON 大纲") + '</option><option value="text">' + t("tool.md2code.fmt.text", "纯文本") + '</option></select>'
        + '<button type="button" class="addbtn sm btn-primary" id="mcGo">' + t("tool.md2code.convert", "转换") + '</button>'
        + '<button type="button" class="addbtn sm" id="mcCopy">' + t("tool.md2code.copy", "复制结果") + '</button></div>'
        + '<pre id="mcOut" class="snip u-min-h-240 u-max-h-320 u-overflow-auto">' + t("tool.md2code.outputPlaceholder", "转换结果显示在这里") + '</pre></div></div>';
    },
    bind: function(){
      const go = $("#mcGo"); if(!go) return;
      let lastOut = "";
      go.onclick = function(){
        const md = $("#mcIn").value;
        const fmt = $("#mcFmt").value;
        let res;
        if(fmt === "html"){ res = mdToHtml(md); }
        else if(fmt === "json"){
          const outline = [];
          md.split(/\r?\n/).forEach(function(line){
            const h = line.match(/^(#{1,6})\s+(.*)/);
            if(h) outline.push({ level:h[1].length, text:h[2] });
            else if(/^\s*[-*]\s+/.test(line)) outline.push({ level:99, text:line.replace(/^\s*[-*]\s+/, ""), bullet:true });
          });
          res = JSON.stringify(outline, null, 2);
        }
        else { res = md.replace(/[#*_`>\-[\]()]/g, "").split(/\r?\n/).map(function(l){ return l.trim(); }).filter(Boolean).join("\n"); }
        lastOut = res;
        $("#mcOut").textContent = res;
      };
      $("#mcCopy").onclick = function(){
        if(!lastOut){ toast(t("tool.md2code.convertFirst", "请先转换"), "warn"); return; }
        navigator.clipboard.writeText(lastOut).then(function(){ toast(t("tool.md2code.copied", "已复制"), "ok"); }, function(){ toast(t("tool.md2code.copyFail", "复制失败"), "warn"); });
      };
    }
  },

  /* ================= 生活簇（公共骨架 _recordToolHtml/_bindRecordTool） ================= */
  "lif-sport": {
    name:t("tool.sport.name", "运动记录"), icon:UI_ICONS.sport, desc:t("tool.sport.desc", "类型 / 时长 · 周月统计 · 数据源：生活场景「健康」功能卡"),
    render: function(){
      /* v3.2 C-档双轨收敛：运动三套存储（tool_lif-sport / life_health / rec_life 运动记录）收敛——
       * 以 getHealthRecs() 双源聚合为准（B-档已做 rec_life+life_health 统一），工具箱改只读代理 */
      const recs = (getHealthRecs() || []).filter(function(r){ return r.type === "运动记录"; }).map(function(r){
        return { id:r.id, type:(r.title||t("rec.exercise","运动")), date:(r._date || (r.created ? new Date(r.created).toISOString().slice(0,10) : "")), mins:parseNum(r.value), note:r.note||"", done:true };
      }).concat(_toolData("lif-sport").filter(function(r){ return r && r.type; }));
      return _recordToolHtml({
        fields:[
          { k:"type", label:t("tool.sport.type", "运动类型"), type:"select", options:[t("tool.sport.type.run", "跑步"),t("tool.sport.type.swim", "游泳"),t("tool.sport.type.bike", "骑行"),t("tool.sport.type.gym", "健身"),t("tool.sport.type.yoga", "瑜伽"),t("tool.sport.type.ball", "球类"),t("option.other", "其他")] },
          { k:"date", label:t("tool.regex.preset.date", "日期"), type:"date" },
          { k:"mins", label:t("tool.sport.mins", "时长(分钟)"), type:"number" },
          { k:"note", label:t("field.note", "备注"), type:"text" }
        ],
        cols:[
          { label:t("field.type", "类型"), k:"type" }, { label:t("tool.regex.preset.date", "日期"), k:"date" }, { label:t("tool.sport.mins", "时长(分钟)"), k:"mins" }, { label:t("field.note", "备注"), k:"note" }
        ],
        sum: function(rs){
          const today = todayStr();
          const weekStart = _addDaysStr(today, -((new Date().getDay() + 6) % 7));
          const weekCnt = rs.filter(function(r){ return r.date >= weekStart && r.date <= today; }).length;
          const monthCnt = rs.filter(function(r){ return r.date && r.date.slice(0,7) === today.slice(0,7); }).length;
          const totalMins = rs.reduce(function(s,r){ return s + (Number(r.mins)||0); }, 0);
          return [
            { v:weekCnt + t("common.unitTimes", " 次"), l:t("tool.sport.weekCnt", "本周运动") },
            { v:monthCnt + t("common.unitTimes", " 次"), l:t("tool.sport.monthCnt", "本月运动") },
            { v:Math.round(totalMins/60*10)/10 + t("common.unitHours", " 小时"), l:t("tool.sport.totalHours", "累计时长") }
          ];
        },
        emptyTip:t("tool.sport.emptyTip", "还没有运动记录，添加第一条吧")
      }, recs);
    },
    bind: function(){
      /* v3.2 C-档双轨收敛：写入引导跳转生活场景健康功能卡（getHealthRecs 双源已统一） */
      _bindRecordToolRedirect("lif-sport", t("tool.redirectHealth", "生活场景 · 健康功能卡"), "life", "health");
    }
  },
  "lif-bill": {
    name:t("tool.bill.name", "缴费提醒"), icon:UI_ICONS.bill, desc:t("tool.bill.desc", "项目 / 到期日 · 逾期标红 · 已缴勾选 · 数据源：生活场景「缴费」功能卡"),
    render: function(){
      /* v3.2 C-档双轨收敛：缴费此前两套存储（tool_lif-bill 工具箱 / life_bills 功能卡）互不相通。
       * 收敛决策：功能卡为真相源（字段更全，含周期/状态），工具箱改为只读代理 + 引导跳转。
       * 旧 tool_lif-bill 数据保留读取（兼容老用户），新数据一律走功能卡。 */
      const feats = load(PREFIX+"life_bills", []) || [];
      const recs = feats.map(function(r){
        return { id:r.id||_toolUid(), item:r.name||r.title||"", amount:r.amount, due:r.due||"", done:(r.status==="已缴"||r.done), paidAt:r.paidAt||"", note:r.note||"" };
      }).concat(_toolData("lif-bill").filter(function(r){ return r && r.item; })); // 旧工具数据兼容追加
      return _recordToolHtml({
        fields:[
          { k:"item", label:t("tool.bill.item", "缴费项目"), type:"select", options:[t("tool.bill.item.water", "水费"),t("tool.bill.item.electric", "电费"),t("tool.bill.item.gas", "燃气费"),t("tool.bill.item.net", "网费"),t("tool.bill.item.property", "物业费"),t("tool.bill.item.rent", "房租"),t("option.other", "其他")] },
          { k:"amount", label:t("tool.bill.amount", "金额(元)"), type:"number" },
          { k:"due", label:t("tool.bill.due", "到期日"), type:"date" }
        ],
        cols:[
          { label:t("tool.bill.paid", "已缴"), type:"check" },
          { label:t("tab.project", "项目"), k:"item" },
          { label:t("field.amount", "金额"), fmt:function(r){ return "¥" + (Number(r.amount)||0).toFixed(2); } },
          { label:t("tool.bill.due", "到期日"), fmt:function(r){
              const today = todayStr();
              let tag = "";
              if(!r.done && r.due < today) tag = ' <span class="pri P0 u-fs-3xs">' + t("tool.bill.overdue", "逾期") + '</span>';
              else if(!r.done && r.due <= _addDaysStr(today,3)) tag = ' <span class="pri P1 u-fs-3xs">' + t("tool.bill.dueSoon", "即将到期") + '</span>';
              return esc(r.due||"") + tag; } }
        ],
        sum: function(rs){
          const today = todayStr();
          const pending = rs.filter(function(r){ return !r.done; });
          const pendSum = pending.reduce(function(s,r){ return s + (Number(r.amount)||0); }, 0);
          const paidMonth = rs.filter(function(r){ return r.done && r.paidAt && r.paidAt.slice(0,7) === today.slice(0,7); })
            .reduce(function(s,r){ return s + (Number(r.amount)||0); }, 0);
          const overdueCnt = rs.filter(function(r){ return !r.done && r.due && r.due < today; }).length;
          return [
            { v:"¥" + pendSum.toFixed(2), l:t("tool.bill.pendTotal", "待缴总额") },
            { v:"¥" + paidMonth.toFixed(2), l:t("tool.bill.paidMonth", "本月已缴") },
            { v:overdueCnt, l:t("tool.bill.overdueCnt", "逾期数") }
          ];
        },
        overdueKey:"due",
        emptyTip:t("tool.bill.emptyTip", "没有待办缴费，很清爽")
      }, recs);
    },
    bind: function(){
      /* v3.2 C-档双轨收敛：写入改跳转功能卡（生活场景 → 缴费 tab），工具箱不再独立存数据 */
      _bindRecordToolRedirect("lif-bill", t("tool.redirectBill", "生活场景 · 缴费功能卡"), "life", "bill");
    }
  },
  "lif-shop": {
    name:t("tool.shop.name", "采购清单"), icon:UI_ICONS.shop, desc:t("tool.shop.desc", "待购/已购分组 · 数量金额 · 数据源：生活场景「采购」功能卡"),
    render: function(){
      /* v3.2 C-档双轨收敛：采购两套存储（tool_lif-shop / life_shopping）收敛到功能卡为真相源 */
      const feats = load(PREFIX+"life_shopping", []) || [];
      const recs = feats.map(function(r){
        return { id:r.id||_toolUid(), item:r.name||"", qty:r.qty, price:(Number(r.amount)||0)/(Number(r.qty)||1), done:(r.status==="已购"||r.done), note:r.note||"" };
      }).concat(_toolData("lif-shop").filter(function(r){ return r && r.item; }));
      return _recordToolHtml({
        fields:[
          { k:"item", label:t("tool.shop.item", "物品名称"), type:"text" },
          { k:"qty", label:t("tool.shop.qty", "数量"), type:"number" },
          { k:"price", label:t("tool.shop.price", "单价(元)"), type:"number" }
        ],
        cols:[
          { label:t("tool.shop.bought", "已购"), type:"check" },
          { label:t("tool.shop.itemShort", "物品"), k:"item" },
          { label:t("tool.shop.qty", "数量"), k:"qty" },
          { label:t("tool.shop.subtotal", "小计"), fmt:function(r){ return "¥" + ((Number(r.qty)||0) * (Number(r.price)||0)).toFixed(2); } }
        ],
        sum: function(rs){
          const todo = rs.filter(function(r){ return !r.done; });
          const budget = rs.filter(function(r){ return !r.done; }).reduce(function(s,r){ return s + (Number(r.qty)||0) * (Number(r.price)||0); }, 0);
          return [
            { v:todo.length, l:t("tool.shop.toBuy", "待购买") },
            { v:"¥" + budget.toFixed(2), l:t("tool.shop.budget", "待购预算") }
          ];
        },
        emptyTip:t("tool.shop.emptyTip", "采购清单是空的，添加要买的物品")
      }, recs);
    },
    bind: function(){
      /* v3.2 C-档双轨收敛：写入引导跳转功能卡 */
      _bindRecordToolRedirect("lif-shop", t("tool.redirectShop", "生活场景 · 采购功能卡"), "life", "shop");
    }
  },
  "lif-takeout": {
    name:t("tool.takeout.name", "外卖记录"), icon:UI_ICONS.takeout, desc:t("tool.takeout.desc", "店铺 / 评分 · 月度统计"),
    render: function(){
      const recs = _toolData("lif-takeout");
      return _recordToolHtml({
        fields:[
          { k:"shop", label:t("tool.takeout.shop", "店铺"), type:"text" },
          { k:"dish", label:t("tool.takeout.dish", "菜品"), type:"text" },
          { k:"amount", label:t("tool.bill.amount", "金额(元)"), type:"number" },
          { k:"rating", label:t("tool.takeout.rating", "评分(1-5)"), type:"number" },
          { k:"date", label:t("tool.regex.preset.date", "日期"), type:"date" }
        ],
        cols:[
          { label:t("tool.regex.preset.date", "日期"), k:"date" },
          { label:t("tool.takeout.shop", "店铺"), k:"shop" },
          { label:t("tool.takeout.dish", "菜品"), k:"dish" },
          { label:t("field.amount", "金额"), fmt:function(r){ return "¥" + (Number(r.amount)||0).toFixed(2); } },
          { label:t("field.rating", "评分"), fmt:function(r){ return "★".repeat(Math.min(5, Math.max(0, Number(r.rating)||0))) || "-"; } }
        ],
        sum: function(rs){
          const today = todayStr().slice(0,7);
          const month = rs.filter(function(r){ return r.date && r.date.slice(0,7) === today; });
          const msum = month.reduce(function(s,r){ return s + (Number(r.amount)||0); }, 0);
          const shopCnt = {};
          rs.forEach(function(r){ if(r.shop) shopCnt[r.shop] = (shopCnt[r.shop]||0) + 1; });
          const top = Object.keys(shopCnt).sort(function(a,b){ return shopCnt[b]-shopCnt[a]; }).slice(0,3);
          return [
            { v:"¥" + msum.toFixed(2), l:t("tool.takeout.monthSum", "本月消费") },
            { v:month.length, l:t("tool.takeout.monthCnt", "本月次数") },
            { v:top.join("、") || "-", l:t("tool.takeout.top3", "常点店铺 TOP3") }
          ];
        },
        emptyTip:t("tool.takeout.emptyTip", "还没有外卖记录")
      }, recs);
    },
    bind: function(){
      _bindRecordTool("toolAppBody", "lif-takeout", ["shop","dish","amount","rating","date"]);
    }
  },
  "lif-transit": {
    name:t("tool.transit.name", "出行记录"), icon:UI_ICONS.transit, desc:t("tool.transit.desc", "起终点 / 方式 / 费用统计"),
    render: function(){
      const recs = _toolData("lif-transit");
      return _recordToolHtml({
        fields:[
          { k:"from", label:t("tool.transit.from", "出发点"), type:"text" },
          { k:"to", label:t("tool.transit.to", "目的地"), type:"text" },
          { k:"mode", label:t("tool.transit.mode", "交通方式"), type:"select", options:[t("tool.transit.mode.walk", "步行"),t("tool.transit.mode.bus", "公交"),t("tool.transit.mode.subway", "地铁"),t("tool.transit.mode.taxi", "打车"),t("tool.transit.mode.drive", "自驾"),t("tool.transit.mode.bike", "骑行"),t("tool.transit.mode.train", "高铁"),t("tool.transit.mode.flight", "飞机")] },
          { k:"cost", label:t("tool.transit.cost", "费用(元)"), type:"number" },
          { k:"date", label:t("tool.regex.preset.date", "日期"), type:"date" }
        ],
        cols:[
          { label:t("tool.regex.preset.date", "日期"), k:"date" },
          { label:t("tool.transit.route", "路线"), fmt:function(r){ return esc(r.from||"?") + " → " + esc(r.to||"?"); } },
          { label:t("tool.transit.modeShort", "方式"), k:"mode" },
          { label:t("tool.transit.costShort", "费用"), fmt:function(r){ return "¥" + (Number(r.cost)||0).toFixed(2); } }
        ],
        sum: function(rs){
          const today = todayStr().slice(0,7);
          const month = rs.filter(function(r){ return r.date && r.date.slice(0,7) === today; });
          const msum = month.reduce(function(s,r){ return s + (Number(r.cost)||0); }, 0);
          const modeCnt = {};
          rs.forEach(function(r){ if(r.mode) modeCnt[r.mode] = (modeCnt[r.mode]||0) + 1; });
          const topMode = Object.keys(modeCnt).sort(function(a,b){ return modeCnt[b]-modeCnt[a]; })[0] || "-";
          return [
            { v:"¥" + msum.toFixed(2), l:t("tool.transit.monthSum", "本月出行费") },
            { v:month.length, l:t("tool.transit.monthCnt", "本月次数") },
            { v:topMode, l:t("tool.transit.topMode", "最常用方式") }
          ];
        },
        emptyTip:t("tool.transit.emptyTip", "还没有出行记录")
      }, recs);
    },
    bind: function(){
      _bindRecordTool("toolAppBody", "lif-transit", ["from","to","mode","cost","date"]);
    }
  }
};

/* v3.7.78 解耦：自别处下沉 */
const EMPTY_ICONS = {
  "no-tasks":'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11h6M9 15h4M5 4h14a2 2 0 0 1 2 2v14l-3-2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/></svg>',
  "no-records":'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16v4H4zM4 12h16v8H4z"/><path d="M8 16h8"/></svg>',
  "no-search": UI_ICONS.search,
  "no-stats": UI_ICONS.stats,
  // v3.2 阶段二：新增空态类型（图标统一引用 UI_ICONS 单一真相源）
  "no-links": UI_ICONS.chain,
  "no-search-result": UI_ICONS.search,
  "no-notes": UI_ICONS.book,
  "no-backup": UI_ICONS.download,
  "no-history": UI_ICONS.stats
};
