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
  let recN = 0; try{ Object.keys(SCENARIOS).forEach(function(sc){ recN += getRec(sc).length; }); }catch(e){}
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
      _moveDrawerHome();
      _drawer.classList.remove("open");
      delete _drawer.dataset.page; // v1.9.6：清掉子页标记（settings/ai/plugin）
    }
    const _help = $("#helpPage"); if(_help) _help.remove();
    uiView = "main"; // v1.9.3g：回到主视图，侧栏高亮据此渲染（场景/总览/统计/回收站）
    renderSide();
    if(active==="overview"){ renderOverview(); appendFoot(); return; }
    /* v3.6.6 修复：此前这里写的是 `setActive("overview"); renderOverview();`——把 stats 重定向回主页，
       导致统计页（15 个仪表盘组件 + 周/月/年筛选 + Grafana 式编辑态）**完全不可达**：
       系统概况卡「已完成」项（data-act="stats"）与 KPI 卡（data-kpi-act="stats"）的处理器都是
       `setActive("stats"); render();`，点击后被本行弹回主页 → 死点击。
       （该重定向由分支归并提交 c93da3c 引入；「v2.5 仪表盘合并至主页」的本意是**撤掉侧栏独立入口**
         ——见 _buildSideMenu 的总览组注释——而非废弃页面本身，主页模板里也从未出现 #dashHost。）
       现改为进入统计页；renderStats() 自含尾栏（见其函数末尾 appendFoot），故此处不重复补。 */
    if(active==="stats"){ renderStats(); return; }
    if(active==="recycle"){ openRecycle(); appendFoot(); return; }
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
    bindScenario();
    _hydrateRecImgs(); // v3.2 C-档：记录缩略图异步填充（IDB blob → objectURL）
    // v3.0：场景内功能 tab 点击切换（SCENE_FEATURES；按钮复用 .set-nav-btn，限定在 .scene-feat-nav 内）
    $$("#main .scene-feat-nav .set-nav-btn").forEach(function(b){
      b.onclick = function(){ setSceneFeature(b.getAttribute("data-feat")); };
    });
    // v3.0：办公文档中心工具入口点击（打开对应 TOOL_APPS 工具）
    $$("#main [data-tool]").forEach(function(b){
      b.onclick = function(){ openToolStub(b.getAttribute("data-tool"), ""); };
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
    setupKanbanDnD();      // B4：看板拖拽（委托绑定，幂等）
    setupKanbanKeyboard(); // B5：看板卡片键盘操作（委托绑定，幂等）
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
  }
}
