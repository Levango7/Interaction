// ===== Render Layer (渲染层·小工具) =====
/* ---------- 小工具 ---------- */




/* ---------- 渲染：侧边导航（v2.1.0 两级菜单） ---------- */
// v1.9.9：折叠按钮回归侧栏顶部（"全局"组上方），用户确认放回原位
const SIDE_TOGGLE_HTML = `<button type="button" class="side-toggle" id="sideToggle" aria-label="${t("side.toggleAria", "折叠或展开侧边栏")}" title="${t("side.toggleTitle", "折叠/展开")}">
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg><span class="lbl" data-i18n="chat.collapseLbl">折叠</span></button>`;

/* v2.1.0：两级菜单图标集（顶级项用；子项用 CSS 圆点标记，不配图标） */
/* v2.1.1 去重：与 UI_ICONS 同形的图标按 key 引用单一真相源；dash 改仪表盘（gauge）与统计柱状图区分 */


/* v2.1.0：场景二级工具菜单（历史遗留：当前菜单树由 _buildSideMenu 构建，本表暂未被消费）。
   自定义/插件场景不在此表内，渲染为无子项的叶子节点。 */
const SC_SUBMENU = {
  office:[
    {id:"off-word", label:t("side.sub.wordDoc", "Word 文档")},
    {id:"off-sheet", label:t("side.sub.sheet", "表格")},
    {id:"off-ppt", label:"PPT"},
    {id:"off-pdf", label:"PDF"},
    {id:"off-md", label:"Markdown"},
    {id:"off-ocr", label:t("side.sub.ocr", "截图 OCR")}
  ],
  design:[
    {id:"des-cad", label:"CAD"},
    {id:"des-imggen", label:t("side.sub.imgGen", "图片生成")},
    {id:"des-vidgen", label:t("side.sub.vidGen", "视频生成")},
    {id:"des-ps", label:"PS lite"}
  ],
  study:[
    {id:"stu-mindmap", label:t("side.sub.mindmap", "思维导图"), run:()=>{ AppBridge.openMindmapModal(); }},
    {id:"stu-kb", label:"知识库", run:()=>{ AppBridge.openKnowledgeBaseModal(); }},
    {id:"stu-web", label:t("side.sub.webSearch", "在线检索")},
    {id:"stu-notes", label:t("side.sub.notes", "笔记"), run:()=>{ AppBridge.openNotesModal(); }},
    {id:"stu-tpl", label:t("side.sub.template", "场景模板"), run:()=>{ AppBridge.openTemplateModal(); }}
  ],
  data:[
    {id:"dat-stats", label:t("side.sub.dataAnalysis", "数据分析"), run:()=>{ setActive("stats"); render(); }},
    {id:"dat-chart", label:t("side.sub.edit", "编辑"), run:()=>{ _sideActive=null; setActive("stats"); _dashEditMode=true; render(); }},
    {id:"dat-report", label:t("side.sub.report", "报告"), run:()=>{ AppBridge.openReportModal(); }}
  ],
  code:[
    {id:"cod-compile", label:t("side.sub.compile", "脚本编译")},
    {id:"cod-regex", label:t("side.sub.regex", "正则工具")},
    {id:"cod-md2code", label:t("side.sub.md2code", "Markdown 转代码")}
  ],
  life:[
    {id:"lif-sport", label:t("side.sub.sport", "运动")},
    {id:"lif-health", label:t("tab.health", "健康"), run:()=>{ setActive("life"); render(); }},
    {id:"lif-bill", label:t("tab.bill", "缴费")},
    {id:"lif-shop", label:t("tab.shop", "采购")},
    {id:"lif-takeout", label:t("side.sub.takeout", "外卖")},
    {id:"lif-transit", label:t("side.sub.transit", "交通")}
  ]
};

function _loadSideExpanded(){
  try{ const v = JSON.parse(localStorage.getItem(PREFIX+"sideExpanded") || "{}"); return (v && typeof v==="object") ? v : {}; }catch(e){ return {}; }
}
function _saveSideExpanded(map){ try{ localStorage.setItem(PREFIX+"sideExpanded", JSON.stringify(map)); }catch(e){ /* noop */ } }
function _toggleSideNode(nodeId){
  const map = _loadSideExpanded();
  map[nodeId] = !map[nodeId];
  _saveSideExpanded(map);
  renderSide();
}

/**
 * 构建侧边菜单节点树（v2.1.0：桌面两级菜单与移动端底部抽屉共用同一份数据）。
 * 返回 [{name, nodes:[{id,label,icon,color,cnt,sc,active,hasActive,children,extraAttrs}]}] 四组。
 * @returns {Array<{name:string, nodes:Array}>}
 */
function _buildSideMenu(){
  const tasks = getActiveTasks();
  const totalOpen = tasks.filter(t=>t.status!=="done").length;
  const recycleCount = (load(PREFIX+"tasks",[])).filter(t=>t.deletedAt).length;
  const _effActive = (uiView==="main") ? active : "";

  /* ---- 总览组：主页 / 任务 / 联动（v2.5 仪表盘合并至主页） ---- */
  const overviewNode = {
    id:"home", label:t("side.menu.home", "主页"), icon:UI_ICONS.overview.replace("<svg","<svg aria-hidden=\"true\""),
    color:"#4a3c8e", cnt:totalOpen>0?totalOpen:"", sc:"overview",
    active: !_sideActive && _effActive==="overview"
  };
  const tasksNode = {
    id:"tasks", label:t("side.menu.tasks", "任务"), icon:(SIDE_MENU_ICONS.tasks||"").replace("<svg","<svg aria-hidden=\"true\""), color:"#4a3c8e",
    cnt:totalOpen>0?totalOpen:"", sc:"tasks",
    active: !_sideActive && _effActive==="tasks"
  };
  const chainPageNode = {
    id:"feat-chain", label:t("side.menu.chain", "场景联动"), icon:(SIDE_MENU_ICONS.chain||"").replace("<svg","<svg aria-hidden=\"true\""), color:"#0d9488", // M7 NOTE: 与 --sc-data 场景色一致
    cnt:"", sc:"chainpage",
    active: !_sideActive && _effActive==="chainpage"
  };
  // v3.4.7 批次五：任务时间机器——14 天 × 场景泳道回放（读 wb_agent_task_events 事件流）
  const timelineNode = {
    id:"feat-timeline", label:t("side.menu.timeline", "时间轴"), icon:(SIDE_MENU_ICONS.dash||SIDE_MENU_ICONS.chain||"").replace("<svg","<svg aria-hidden=\"true\""), color:"#b87840",
    cnt:"", sc:"timeline",
    active: !_sideActive && _effActive==="timeline"
  };

  /* ---- 场景组（ORDER 驱动，全部叶子节点；v2.4.0「数据」归位办公之后——数据分析入口） ---- */
  const sceneNodes = ORDER.map(sc=>{
    const s = SCENARIOS[sc];
    if(!s) return null;
    const open = tasks.filter(t=>t.sc===sc && t.status!=="done").length;
    return {
      id:"sc-"+sc, sc:sc, label:s.name, icon:(s.icon||"").replace("<svg","<svg aria-hidden=\"true\""),
      color:s.color, cnt:open>0?open:"",
      active: !_sideActive && sc===_effActive,
      children: null
    };
  }).filter(Boolean);

  /* ---- 应用组：AI（大模型/agent） / 工具箱 / 商店（v2.4.0） ---- */
  const aiNode = {
    id:"feat-ai", label:t("page.ai.title", "AI"), icon:(SIDE_MENU_ICONS.ai||"").replace("<svg","<svg aria-hidden=\"true\""), color:"var(--accent)",
    cnt:"", menuId:"feat-ai",
    extraAttrs:' id="sideBtnAi" data-aipage="1"',
    active: !_sideActive && uiView==="ai"
  };
  const toolboxNode = {
    id:"feat-toolbox", label:t("side.menu.toolbox", "工具箱"), icon:(SIDE_MENU_ICONS.toolbox||"").replace("<svg","<svg aria-hidden=\"true\""), color:"#8b5cf6",
    cnt:"", sc:"toolbox",
    active: !_sideActive && _effActive==="toolbox"
  };
  const storeNode = {
    id:"feat-store", label:t("side.menu.store", "商店"), icon:UI_ICONS.shop.replace("<svg","<svg aria-hidden=\"true\""), color:"#f59e0b",
    cnt:"", sc:"store",
    active: !_sideActive && (_effActive==="store" || uiView==="plugin")
  };

  /* ---- 系统组（v2.5：外观合并至设置，不再独立一级菜单） ---- */
  const recycleNode = {
    id:"sys-recycle", label:t("side.menu.recycle", t("recycle.title", "回收站")), icon:UI_ICONS.trash.replace("<svg","<svg aria-hidden=\"true\""),
    color:"var(--danger)", cnt:recycleCount>0?recycleCount:"", sc:"recycle",
    active: !_sideActive && _effActive==="recycle"
  };
  const gearNode = {
    id:"sys-gear", label:t("side.menu.settings", "设置"), icon:UI_ICONS.gear.replace("<svg","<svg aria-hidden=\"true\""),
    color:"var(--muted)", cnt:"", extraAttrs:' id="btnGear" data-gear="1"',
    active: !_sideActive && uiView==="settings"
  };
  const helpNode = {
    id:"sys-help", label:t("side.menu.help", "说明"), icon:(SIDE_MENU_ICONS.doc||"").replace("<svg","<svg aria-hidden=\"true\""), color:"var(--muted)", cnt:"", extraAttrs:' id="sideBtnHelp" data-help="1"',
    active: !_sideActive && uiView==="help"
  };

  return [
    {gid:"overview", name:t("side.group.overview", "总览"), nodes:[overviewNode, tasksNode, chainPageNode, timelineNode]},
    {gid:"scenario", name:t("side.group.scenario", "场景"), nodes:sceneNodes},
    {gid:"ai", name:t("side.group.ai", "AI"), nodes:[aiNode]},  /* v3.2 IA: AI 提级为独立组 */
    {gid:"tools", name:t("side.group.tools", "工具"), nodes:[toolboxNode, storeNode]},
    {gid:"system", name:t("side.group.system", "系统"), nodes:[recycleNode, gearNode, helpNode]}
  ];
}
/**
 * 渲染侧边导航栏（v3.2：总览/场景/AI/工具/系统 五组两级菜单）
 * 顶级项：纯父项点击=展开收起；场景父项点击=切场景（caret 点击=展开收起）。
 * 子项：点击执行 run 或打开占位页；激活态由 _sideActive 驱动。
 * 移动端（≤767px）：同一份 innerHTML 经 CSS 重组为底部 4 组按钮 + 抽屉数据源。
 * @returns {void}
 */
function renderSide(){
  const expanded = _loadSideExpanded();

  /* 子项渲染：圆点标记 + 标签（v3.0.2：stub:「新」角标机制已随 stub:true 清理移除） */
  const subBtn = (nodeId, it)=>{
    const act = (_sideActive===it.id) ? " active" : "";
    return `<button type="button" class="nav-item nav-subitem${act}" data-menu="${it.id}" data-node="${nodeId}" title="${esc(it.label)}">
      <span class="sub-dot" aria-hidden="true"></span><span class="nm">${esc(it.label)}</span></button>`;
  };
  /* 父项渲染：icon + 名称 + 计数 + caret（有子项时；v2.4.0 caret 改 SVG——字符 ▸ 在部分字体渲染成小点） */
  const parentBtn = (o)=>{
    const isExp = !!expanded[o.id];
    const act = o.active ? " active" : "";
    const hasAct = o.hasActive ? " has-active" : "";
    const caret = o.children ? `<span class="side-caret" data-caret="1" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg></span>` : "";
    const cnt = (o.cnt!==null && o.cnt!=="") ? `<span class="cnt">${o.cnt}</span>` : "";
    const dataAttr = o.sc ? ` data-sc="${o.sc}"` : ` data-menu="${o.id}"`;
    const extra = o.extraAttrs || "";
    return `<button type="button" class="nav-item nav-parent${act}${hasAct}"${dataAttr}${o.children?` aria-expanded="${isExp}"`:""}${extra} style="--sc:${o.color ? scCss(o.color) : "var(--muted)"}" title="${esc(o.label)}" aria-label="${esc(o.label)}">
      ${o.icon}<span class="nm">${esc(o.label)}</span>${cnt}${caret}</button>`;
  };
  const nodeHtml = (o)=>{
    const kids = o.children ? `<div class="nav-sub"${expanded[o.id]?"":" hidden"}>${o.children.map(c=>subBtn(o.id,c)).join("")}</div>` : "";
    return `<div class="nav-node">${parentBtn(o)}${kids}</div>`;
  };

  const groups = _buildSideMenu();
  const groupHtml = (g)=> '<div class="nav-group">'+g.name+'</div>' + g.nodes.map(nodeHtml).join("");
  $("#side").innerHTML = sanitizeHtml(SIDE_TOGGLE_HTML + groups.map(groupHtml).join(""));

  /* 激活子项的父分支自动展开（一次性同步，不触发额外存储写） */
  if(_sideActive){
    const actEl = document.querySelector('#side [data-menu="'+_sideActive+'"]');
    if(actEl){
      const nodeId = actEl.getAttribute("data-node");
      const sub = actEl.closest(".nav-sub");
      if(sub && sub.hasAttribute("hidden") && nodeId){
        sub.removeAttribute("hidden");
        const p = sub.previousElementSibling;
        if(p) p.setAttribute("aria-expanded","true");
        const map = _loadSideExpanded(); map[nodeId] = true; _saveSideExpanded(map);
      }
    }
  }
  /* v2.1.0：同步移动端底栏高亮（桌面端 #mobBar 为 display:none，渲染开销可忽略） */
  if(typeof renderMobBar==="function") renderMobBar();
  /* v2.1.0：点击委托随渲染同步绑定（幂等）——保证 jsdom 同步测试与首屏点击均可用，
     不依赖异步 startup() 时序 */
  setupSideMenu();
  setupMobNav();
}
/* v2.1.0：侧栏两级菜单点击分发（事件委托，renderSide 重渲染后依然有效）。
   caret → 展开/收起；场景父项 → 切场景；纯父项 → 展开/收起；子项 → 执行动作。 */
function setupSideMenu(){
  const side = $("#side");
  if(!side || side._menuBound) return;
  side._menuBound = true;
  side.addEventListener("click", (e)=>{
    const btn = e.target && e.target.closest ? e.target.closest(".nav-item") : null;
    if(!btn) return;
    const _m = $("#main"); if(_m) _m.scrollTop = 0; const _mw = document.querySelector(".main-wrap"); if(_mw) _mw.scrollTop = 0;
    /* caret 点击：只切换展开态 */
    if(e.target && e.target.closest && e.target.closest("[data-caret]")){
      const nodeId = btn.getAttribute("data-menu") || (btn.getAttribute("data-sc") ? "sc-"+btn.getAttribute("data-sc") : null);
      if(nodeId) _toggleSideNode(nodeId);
      return;
    }
    /* 场景父项：切场景（子菜单是工具，与场景切换解耦） */
    if(btn.hasAttribute("data-sc")){
      _sideActive = null;
      setActive(btn.getAttribute("data-sc")); render();
      return;
    }
    /* 顶级固定入口（保留旧 data 属性语义） */
    if(btn.dataset.gear){ _sideActive = null; AppBridge.openDrawer(); return; }
    if(btn.dataset.help){ _sideActive = null; AppBridge.renderHelp(); return; }
    if(btn.dataset.aipage){ _sideActive = null; if(typeof AppBridge.openAiPage==="function") AppBridge.openAiPage(); return; }
    /* 子项：执行注册动作 */
    const menuId = btn.getAttribute("data-menu");
    if(menuId){
      const item = _findSideMenuItem(menuId);
      if(item){
        if(item.run){
          /* 默认点亮该子项（弹窗类动作保持高亮）；页面跳转型 run 会自行清空 _sideActive */
          _sideActive = menuId;
          item.run();
          if(typeof renderSide==="function") renderSide();
          return;
        }
        return;
      }
      /* 纯父项（无注册动作）：切换展开 */
      _toggleSideNode(menuId);
    }
  });
}
/* 在侧栏菜单中查找子项/叶子项动作（v2.4.0：菜单全叶子化，仅保留无 sc 路由的固定项；v2.5：外观合并至设置，移除 sys-look） */
function _findSideMenuItem(menuId){
  const fixed = {
    "feat-ai":{run:()=>{ if(typeof AppBridge.openAiPage==="function") AppBridge.openAiPage(); }}
  };
  return fixed[menuId] || null;
}
/* ---------- v2.1.0 移动端导航：底部 4 组按钮（#mobBar）+ 底部抽屉（#sideSheet） ----------
   桌面端两者 display:none；≤767px 时 #side 隐藏、#mobBar 显示。
   抽屉内容复用 _buildSideMenu() 节点树；子项点击复用 _findSideMenuItem 动作注册表。 */
/* v3.2 IA 重构：4 → 5 组，"应用" → "AI" + "工具"
   v3.4.5 i18n 修复：键从中文组名改为稳定 gid——中文组名经 t() 翻译后（英文模式）
   MOB_GROUP_ICONS 查不到图标、_mobCurrentGroup 高亮兜底失配。gid 与语言无关。 */
const MOB_GROUP_ICONS = {
  overview: UI_ICONS.overview,
  scenario: UI_ICONS.grid,
  ai: UI_ICONS.robot,
  tools: UI_ICONS.puzzle,
  system: UI_ICONS.gear
};
/**
 * 渲染移动端底部 5 组按钮（总览/场景/AI/工具/系统）。
 * 当前组高亮：抽屉打开时按 _mobSheetGroup；否则按当前视图归属组。
 * @returns {void}
 */
function renderMobBar(){
  const bar = $("#mobBar");
  if(!bar) return;
  const groups = _buildSideMenu();
  const cur = _mobCurrentGroup(groups);
  bar.innerHTML = sanitizeHtml(groups.map(g=>{
    const act = (g.gid===cur) ? " active" : ""; // v3.4.5：gid 比较（语言无关），此前 g.name===cur 在英文模式失配
    const icon = (MOB_GROUP_ICONS[g.gid]||"").replace("<svg","<svg aria-hidden=\"true\"");
    return `<button type="button" class="mob-bar-btn${act}" data-mob-group="${esc(g.gid)}" aria-label="${esc(g.name)}">${icon}<span class="nm">${esc(g.name)}</span></button>`;
  }).join(""));
}
/* 当前视图归属组名（用于底栏高亮兜底；v3.2 五组结构） */
function _mobCurrentGroup(groups){
  if(_mobSheetGroup) return _mobSheetGroup;
  for(const g of groups){
    for(const n of g.nodes){
      const hit = (n.sc && n.active) || (!n.sc && n.active) || n.hasActive;
      if(hit) return g.gid; // v3.4.5：返回 gid（语言无关），此前返回中文组名英文模式失配
    }
  }
  return "overview"; // v3.4.5：兜底 gid（与组 gid 对齐，语言无关）
}
let _mobSheetGroup = null;
/**
 * 打开移动端底部抽屉，展示指定组的完整节点列表（父项为分组标题，子项平铺）。
 * @param {string} groupName - 组名（总览/场景/功能/系统）
 * @returns {void}
 */
function openSideSheet(groupGid){
  const sheet = $("#sideSheet"), body = $("#sideSheetBody"), title = $("#sideSheetTitle"), mask = $("#sideSheetBackdrop");
  if(!sheet || !body) return;
  const groups = _buildSideMenu();
  const g = groups.find(x=>x.gid===groupGid); // v3.4.5：按 gid 查找（语言无关）；调用方 data-mob-group 现传 gid
  if(!g) return;
  _mobSheetGroup = g.gid; // v3.4.5：存 gid 与 _mobCurrentGroup 对齐
  if(title) title.textContent = g.name;
  const rows = [];
  g.nodes.forEach(n=>{
    const pAct = n.active ? " active" : "";
    const pHas = n.hasActive ? " has-active" : "";
    const dataAttr = n.sc ? ` data-sc="${n.sc}"` : ` data-menu="${n.id}"`;
    const extra = n.extraAttrs || "";
    const cnt = (n.cnt!==null && n.cnt!=="") ? `<span class="cnt">${n.cnt}</span>` : "";
    rows.push(`<button type="button" class="sheet-parent${pAct}${pHas}"${dataAttr}${extra} style="--sc:${n.color||"var(--muted)"}">${n.icon}<span class="nm">${esc(n.label)}</span>${cnt}</button>`);
    (n.children||[]).forEach(c=>{
      const cAct = (_sideActive===c.id) ? " active" : "";
      rows.push(`<button type="button" class="sheet-sub${cAct}" data-menu="${c.id}" data-node="${n.id}"><span class="sub-dot" aria-hidden="true"></span><span class="nm">${esc(c.label)}</span></button>`);
    });
  });
  body.innerHTML = sanitizeHtml(rows.join(""));
  sheet.classList.add("open");
  if(mask) mask.classList.add("open");
  renderMobBar();
}
/** 关闭移动端底部抽屉 @returns {void} */
function closeSideSheet(){
  const sheet = $("#sideSheet"), mask = $("#sideSheetBackdrop");
  if(sheet) sheet.classList.remove("open");
  if(mask) mask.classList.remove("open");
  _mobSheetGroup = null;
  renderMobBar();
}
/* 移动端导航事件：一次性绑定（委托），跨 renderSide/renderMobBar 重渲染有效 */
function setupMobNav(){
  const bar = $("#mobBar");
  if(bar && !bar._mobBound){
    bar._mobBound = true;
    bar.addEventListener("click", e=>{
      const btn = e.target && e.target.closest ? e.target.closest("[data-mob-group]") : null;
      if(btn) openSideSheet(btn.getAttribute("data-mob-group"));
    });
  }
  const mask = $("#sideSheetBackdrop");
  if(mask && !mask._mobBound){ mask._mobBound = true; mask.addEventListener("click", closeSideSheet); }
  const close = $("#sideSheetClose");
  if(close && !close._mobBound){ close._mobBound = true; close.addEventListener("click", closeSideSheet); }
  const sheet = $("#sideSheet");
  if(sheet && !sheet._mobBound){
    sheet._mobBound = true;
    sheet.addEventListener("click", e=>{
      const btn = e.target && e.target.closest ? e.target.closest("button") : null;
      if(!btn) return;
      /* 场景父项：切场景并收起抽屉 */
      if(btn.hasAttribute("data-sc")){
        _sideActive = null;
        setActive(btn.getAttribute("data-sc")); render();
        closeSideSheet();
        return;
      }
      if(btn.dataset.gear){ _sideActive = null; closeSideSheet(); AppBridge.openDrawer(); return; }
      if(btn.dataset.help){ _sideActive = null; closeSideSheet(); AppBridge.renderHelp(); return; }
      if(btn.dataset.aipage){ _sideActive = null; closeSideSheet(); if(typeof AppBridge.openAiPage==="function") AppBridge.openAiPage(); return; }
      const menuId = btn.getAttribute("data-menu");
      if(!menuId) return;
      const item = _findSideMenuItem(menuId);
      if(!item) return;
      if(item.run){ _sideActive = menuId; closeSideSheet(); item.run(); }
    });
  }
}
/* ---------- 回收站（D3：软删除任务的恢复 / 永久删除入口；T2：批量操作 + 自动清理策略） ----------
   v1.3.4-B：改为全屏页面视图（渲染到 #main，与 renderStats 一致），不再创建 modal overlay。
   保留 id=recycleModal 与 .recycle-card 以兼容 closeRecycleModal 与焦点陷阱。 */
let _recycleCat = "全部"; // v3.1：回收站分类筛选：全部/任务/配置/文件/插件
function openRecycle(){
  const all = load(PREFIX+"tasks", []);
  const del = all.filter(t=>t.deletedAt).slice().sort((a,b)=>b.deletedAt-a.deletedAt);
  // v3.1：多类型回收站——任务走软删除，配置/文件/插件走 wb_recycle_bin
  const binItems = getRecycleBin();
  // 统一构造回收项视图模型：{id, type, title, desc, when, whenStr, source, color, scName, isTask}
  const _typeTaskLabel = t("rec.typeTask", "任务");
  const taskVms = del.map(t=>{
    const sm = scMeta(t.sc);
    const w = new Date(t.deletedAt);
    const whenStr = (w.getMonth()+1)+"/"+w.getDate()+" "+pad(w.getHours())+":"+pad(w.getMinutes());
    return { id: t.id, type: _typeTaskLabel, title: t.title||"", desc: "", when: t.deletedAt, whenStr: whenStr, source: sm.name, color: sm.color, scName: sm.name, isTask: true };
  });
  const binVms = binItems.map(it=>{
    const w = new Date(it.deletedAt||0);
    const whenStr = (w.getMonth()+1)+"/"+w.getDate()+" "+pad(w.getHours())+":"+pad(w.getMinutes());
    const typeLabel = it.type==="config" ? "配置" : (it.type==="file" ? "文件" : (it.type==="plugin" ? "插件" : it.type));
    return { id: it.id, type: typeLabel, title: it.title||"", desc: it.desc||"", when: it.deletedAt||0, whenStr: whenStr, source: it.source||"", color: "var(--muted)", scName: typeLabel, isTask: false };
  });
  // 合并后按删除时间倒序
  const allVms = taskVms.concat(binVms).sort((a,b)=>(b.when||0)-(a.when||0));
  // 按分类筛选
  const filteredVms = _recycleCat==="全部" ? allVms : allVms.filter(v => v.type===_recycleCat);
  const items = filteredVms.length ? filteredVms.map(v=>{
    const restoreAttr = v.isTask ? `data-restore="${esc(v.id)}"` : `data-restore-bin="${esc(v.id)}"`;
    const purgeAttr = v.isTask ? `data-purge="${esc(v.id)}"` : `data-purge-bin="${esc(v.id)}"`;
    const descHtml = v.desc ? `<span class="recycle-desc">${esc(v.desc)}</span>` : "";
    return `<div class="recycle-item" data-id="${esc(v.id)}">
      <input type="checkbox" class="recycle-chk" data-chk="${esc(v.id)}" data-is-task="${v.isTask?1:0}" aria-label="选择 ${esc(v.title)}">
      <span class="recycle-dot" style="background:${scCss(v.color)}"></span>
      <span class="recycle-title">${esc(v.title)}</span>
      ${descHtml}
      <span class="recycle-sc">${esc(v.scName)}</span>
      <span class="recycle-when">${v.whenStr}</span>
      <button type="button" class="recycle-restore" ${restoreAttr}>${t("recycle.restoreBtn", "恢复")}</button>
      <button type="button" class="recycle-purge" ${purgeAttr}>${t("recycle.purgeBtn", "彻底删除")}</button>
    </div>`;
  }).join("") : `<div class="recycle-empty">${_recycleCat==="全部" ? t("recycle.empty", "回收站为空") : t("recycle.catEmpty", "该分类下无内容")}</div>`;
  const policy = getRecyclePolicy();
  const policyLabel = policy==="off" ? t("recycle.policyOff", "自动清理：关闭") : t("recycle.policyLabel", "自动清理：")+policy+t("recycle.policySuffix", " 天后");
  const countLabel = filteredVms.length ? filteredVms.length+t("recycle.unit", " 条") : "";
  // v3.1：回收站分类菜单
  const recycleCats = ["全部","任务","配置","文件","插件"];
  const recycleCatKey = {"全部":"recycle.cat.all","任务":"recycle.cat.task","配置":"recycle.cat.config","文件":"recycle.cat.file","插件":"recycle.cat.plugin"};
  const recycleNav = `<nav class="set-nav recycle-cat-nav" aria-label="${t("a11y.recycleFilter", "回收站分类筛选")}">` +
    recycleCats.map(c=>`<button type="button" class="set-nav-btn${_recycleCat===c?" active":""}" data-recycle-cat="${c}">${t(recycleCatKey[c], c)}</button>`).join("") + `</nav>`;
  // 页面视图：渲染到 #main（与 renderStats 一致），保留 id=recycleModal / .recycle-card 以兼容关闭逻辑与焦点陷阱
  // v1.15：标题栏独立成卡（与统计/概览/回收站页统一），recycle-card 仅承载列表
  const html = `<div class="recycle-modal" id="recycleModal">
    <div class="card page-head-card"><header class="page-head sc-page-head">
      <span class="ph-ic" aria-hidden="true">${UI_ICONS.trash}</span>
      <div class="ph-tx"><h2>${t("recycle.title","回收站")}</h2><p class="sub">${t("recycle.sub","已删除的任务/配置/文件/插件可在此恢复或彻底删除")}</p></div>
      <span class="ph-act"><span class="recycle-count">${countLabel}</span><button type="button" class="page-back recycle-back" id="recycleBack" aria-label="${t("a11y.returnPrev","返回上一视图")}">${t("recycle.back","← 返回")}</button></span>
    </header></div>
    ${recycleNav}
    <div class="recycle-card">
      <div class="recycle-list">${items}</div>
      ${filteredVms.length ? `<div class="recycle-footer">
        <label class="recycle-selall"><input type="checkbox" id="recycleSelAll"> ${t("recycle.selectAll","全选")}</label>
        <button type="button" class="recycle-batch" id="recycleBatchRestore">${t("recycle.batchRestore","批量恢复")}</button>
        <button type="button" class="recycle-batch" id="recycleBatchPurge">${t("recycle.batchPurge","批量删除")}</button>
        <span class="recycle-policy">${policyLabel}</span>
        <button type="button" class="recycle-clear" id="recycleClear">${t("recycle.clear","清空回收站")}</button>
      </div>` : ""}
    </div>

  </div>`;
  $("#main").innerHTML = sanitizeHtml(html);
  $("#main").classList.add("page-recycle"); // v1.9.4：回收站页面铺满主区高度（尾栏被顶到主区底部）
  const modal=$("#recycleModal");
  modal._releaseTrap = trapFocus(modal.querySelector(".recycle-card")); // T5：焦点锁在页面内
  const close = ()=> closeRecycleModal();
  const backBtn = $("#recycleBack"); if(backBtn) backBtn.onclick = close;
  // restore/purge/clear 内部已调用 render()，会自动覆盖 #main 返回原视图，无需手动 close
  $$("#recycleModal [data-restore]").forEach(b=> b.onclick=()=>{ restoreRecycle(b.dataset.restore); });
  $$("#recycleModal [data-purge]").forEach(b=> b.onclick=()=>{ purgeRecycle(b.dataset.purge); });
  // v3.1：回收站数据项（配置/文件/插件）的恢复与彻底删除
  $$("#recycleModal [data-restore-bin]").forEach(b=> b.onclick=()=>{ restoreRecycleBin(b.dataset.restoreBin); });
  $$("#recycleModal [data-purge-bin]").forEach(b=> b.onclick=()=>{ purgeRecycleBin(b.dataset.purgeBin); });
  const clr=$("#recycleClear"); if(clr) clr.onclick=()=>{ if(confirm(t("recycle.clearConfirm", "确定清空回收站？其中的内容将永久删除，不可恢复。"))){ clearRecycle(); } };
  const selAll=$("#recycleSelAll"); if(selAll) selAll.onchange=()=> $$("#recycleModal .recycle-chk").forEach(c=>{ c.checked=selAll.checked; });
  const bRestore=$("#recycleBatchRestore"); if(bRestore) bRestore.onclick=()=>{
    const checked=$$("#recycleModal .recycle-chk:checked");
    if(!checked.length){ toast(t("recycle.selectRestore", "请先勾选要恢复的项"),"warn"); return; }
    restoreRecycleBatchMixed(checked);
  };
  const bPurge=$("#recycleBatchPurge"); if(bPurge) bPurge.onclick=()=>{
    const checked=$$("#recycleModal .recycle-chk:checked");
    if(!checked.length){ toast(t("recycle.selectPurge", "请先勾选要删除的项"),"warn"); return; }
    if(confirm(t("recycle.batchPurgeConfirm", "确定彻底删除选中的 {count} 项？不可恢复。").replace("{count}", checked.length))){ purgeRecycleBatchMixed(checked); }
  };
  // v3.1：回收站分类菜单切换
  $$("#recycleModal .recycle-cat-nav .set-nav-btn").forEach(b=>{
    b.onclick = ()=>{ _recycleCat = b.getAttribute("data-recycle-cat")||"全部"; openRecycle(); };
  });
  appendFoot();
}
/* v1.10.0：图表商店（独立页面：图表库 + 画布 + 拖拽）
   - 左侧：图表库（卡片：日历/统计/热力图/趋势/甘特/导图/仪表盘/联动），点击=添加到画布
   - 右侧：画布（可拖拽位置 + 调整大小；数据存 localStorage.wb_chart_canvas）
   - 简化实现：拖动用 mousedown/move/up；大小用 8 个控制点
*/
function openChartStore(){
  // v1.15 修复：从市场(抽屉)切到图表页时先关闭抽屉，避免新页面被覆盖层挡住
  AppBridge.closeDrawer();
  // 图表库（静态）——不用 emoji，用纯文字 + 矢量图标
  // v1.15：移除"日历"（用户要求；日历功能在应用页）
  const chartLibs = [
    { id: "trend", name: t("chartStore.trend", "趋势"), icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 17 9 11 13 15 21 7"/><polyline points="14 7 21 7 21 14"/></svg>', render: function(){ return '<div class="cs-card-mini"><div class="cs-title">完成趋势</div><div class="cs-sub">近 14 天</div><svg viewBox="0 0 100 40" class="cs-line"><polyline points="0,30 10,28 20,32 30,20 40,22 50,18 60,15 70,12 80,8 90,5 100,3" fill="none" stroke="var(--accent)" stroke-width="2"/></svg></div>'; } },
    { id: "heatmap", name: "热力图", icon: UI_ICONS.heat, render: function(){ return '<div class="cs-card-mini"><div class="cs-title">完成热力图</div><div class="cs-sub">最近 12 周</div><div class="cs-heat">'+Array.from({length:84},function(){return '<span class="cs-hcell"></span>'}).join("")+'</div></div>'; } },
    { id: "gantt", name: "甘特图", icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/><rect x="5" y="4" width="8" height="4" rx="1"/></svg>', render: function(){ return '<div class="cs-card-mini"><div class="cs-title">甘特图</div><div class="cs-sub">任务时间线</div><div class="cs-gantt">'+[1,2,3,4].map(function(i){return '<div class="cs-gantt-bar" style="width:'+(20+i*15)+'%"></div>'}).join("")+'</div></div>'; } },
    { id: "mindmap", name: "思维导图", icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><circle cx="5" cy="5" r="2"/><circle cx="19" cy="5" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="19" r="2"/></svg>', render: function(){ return '<div class="cs-card-mini"><div class="cs-title">思维导图</div><div class="cs-sub">中心 + 4 节点</div><svg viewBox="0 0 100 100" class="cs-mind"><line x1="50" y1="50" x2="20" y2="20" stroke="var(--line)"/><line x1="50" y1="50" x2="80" y2="20" stroke="var(--line)"/><line x1="50" y1="50" x2="20" y2="80" stroke="var(--line)"/><line x1="50" y1="50" x2="80" y2="80" stroke="var(--line)"/><circle cx="50" cy="50" r="10" fill="var(--accent)"/><circle cx="20" cy="20" r="6" fill="var(--surface-muted)"/><circle cx="80" cy="20" r="6" fill="var(--surface-muted)"/><circle cx="20" cy="80" r="6" fill="var(--surface-muted)"/><circle cx="80" cy="80" r="6" fill="var(--surface-muted)"/></svg></div>'; } },
    { id: "dashboard", name: "仪表盘", icon: UI_ICONS.gauge, render: function(){ return '<div class="cs-card-mini"><div class="cs-title">仪表盘</div><div class="cs-sub">4 卡片布局</div><div class="cs-dash">'+Array.from({length:4},function(){return '<div class="cs-dash-cell"></div>'}).join("")+'</div></div>'; } },
    { id: "chain", name: "联动", icon: UI_ICONS.chain, render: function(){ return '<div class="cs-card-mini"><div class="cs-title">联动</div><div class="cs-sub">场景连环</div><div class="cs-chain"><span class="cs-cnode">办公</span><span class="cs-carr">→</span><span class="cs-cnode">编程</span><span class="cs-carr">→</span><span class="cs-cnode">学习</span></div></div>'; } },
    { id: "pie", name: "饼图", icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/></svg>', render: function(){ return '<div class="cs-card-mini"><div class="cs-title">饼图</div><div class="cs-sub">分布占比</div><svg viewBox="0 0 100 100" class="cs-pie"><circle cx="50" cy="50" r="40" fill="none" stroke="var(--accent)" stroke-width="20" stroke-dasharray="80 251" transform="rotate(-90 50 50)"/><circle cx="50" cy="50" r="40" fill="none" stroke="var(--ok)" stroke-width="20" stroke-dasharray="60 251" stroke-dashoffset="-80" transform="rotate(-90 50 50)"/><circle cx="50" cy="50" r="40" fill="none" stroke="var(--warn)" stroke-width="20" stroke-dasharray="40 251" stroke-dashoffset="-140" transform="rotate(-90 50 50)"/></svg></div>'; } }
  ];
  // 从 localStorage 恢复画布状态
  let savedCanvas = [];
  try{ savedCanvas = JSON.parse(localStorage.getItem(PREFIX+"chart_canvas") || "[]"); }catch(_){ savedCanvas = []; }
  // 当前画布内容（用闭包跟踪）
  let canvasItems = savedCanvas.length ? savedCanvas : [];
  let nextId = canvasItems.reduce(function(m, x){ return Math.max(m, x.id||0); }, 0) + 1;

  function renderShell(){
    const libHtml = chartLibs.map(function(c){
      return `<button type="button" class="cs-lib-item" data-cs-add="${esc(c.id)}" title="${t("chartStore.addToCanvas", "添加到画布")}">
        <span class="cs-lib-ic" aria-hidden="true">${c.icon}</span>
        <span class="cs-lib-nm">${esc(c.name)}</span>
        <span class="cs-lib-add" aria-hidden="true">+</span>
      </button>`;
    }).join("");
    const canvasHtml = canvasItems.length
      ? canvasItems.map(function(it){
          const lib = chartLibs.find(function(x){ return x.id === it.lib; }) || chartLibs[0];
          return `<div class="cs-canvas-item" data-cs-item="${it.id}" style="left:${it.x}px;top:${it.y}px;width:${it.w}px;height:${it.h}px">
            <div class="cs-canvas-head"><span>${esc(lib.name)}</span><button type="button" class="cs-canvas-del" data-cs-del="${it.id}" title="${t("a11y.del", "删除")}" aria-label="${t("a11y.deleteChart", "删除图表")}">✕</button></div>
            <div class="cs-canvas-body">${lib.render()}</div>
            <div class="cs-resize-handle" data-cs-resize="${it.id}"></div>
          </div>`;
        }).join("")
      : `<div class="cs-canvas-empty">${t("chartStore.canvasEmpty2", "点击左侧图表库的 + 按钮，把图表添加到画布<br><small>在画布上可拖拽位置 · 拖右下角调整大小</small>")}</div>`;
    const html = `<div class="card page-head-card"><header class="page-head sc-page-head">
      <span class="ph-ic" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg></span>
      <div class="ph-tx"><h2>${t("chartStore.title2", "图表")}</h2><p class="sub">${t("chartStore.sub2", "从左侧图表库挑选，放到画布自由布局（可拖拽位置 / 调整大小）")}</p></div>
      <div class="ph-actions"><button type="button" class="cs-clear" id="csClear" title="${t("chartStore.clearCanvas", "清空画布")}">${t("chartStore.clearBtn", "清空画布")}</button></div>
    </header></div>
    <div class="card chart-store-card">
      <div class="chart-store-body">
        <aside class="cs-lib" role="region" aria-label="${t("a11y.chartLib", "图表库")}">
          <h3 data-i18n="chartStore.libTitle">图表库</h3>
          ${libHtml}
        </aside>
        <div class="cs-canvas" id="csCanvas" role="region" aria-label="${t("a11y.canvas", "画布")}" class="u-h-560 u-pos-relative">
          ${canvasHtml}
        </div>
      </div>
    </div>`;
    $("#main").innerHTML = sanitizeHtml(html);
    $("#main").classList.add("page-chart-store");
    bindEvents();
    appendFoot();
  }

  function persistCanvas(){
    try{ localStorage.setItem(PREFIX+"chart_canvas", JSON.stringify(canvasItems)); }catch(_){}
  }

  function bindEvents(){
    // 库 → 添加到画布
    $$("[data-cs-add]").forEach(function(btn){
      btn.onclick = function(){
        const libId = btn.dataset.csAdd;
        canvasItems.push({ id: nextId++, lib: libId, x: 20 + (canvasItems.length % 3) * 40, y: 20 + (canvasItems.length % 3) * 40, w: 240, h: 160 });
        persistCanvas();
        renderShell();
      };
    });
    // 删除单个
    $$("[data-cs-del]").forEach(function(btn){
      btn.onclick = function(e){
        e.stopPropagation();
        const id = +btn.dataset.csDel;
        canvasItems = canvasItems.filter(function(x){ return x.id !== id; });
        persistCanvas();
        renderShell();
      };
    });
    // 清空
    const clr = $("#csClear"); if(clr) clr.onclick = function(){
      if(canvasItems.length && !confirm(t("chartStore.clearConfirm", "清空画布上所有图表？"))) return;
      canvasItems = [];
      persistCanvas();
      renderShell();
    };
    // 拖拽（mousedown 在 .cs-canvas-item 上，非 head/del/handle）
    $$(".cs-canvas-item").forEach(function(item){
      const id = +item.dataset.csItem;
      const head = item.querySelector(".cs-canvas-head");
      if(head){
        head.addEventListener("mousedown", function(e){
          if(e.target.closest(".cs-canvas-del")) return;
          e.preventDefault();
          const startX = e.clientX, startY = e.clientY;
          const it = canvasItems.find(function(x){ return x.id === id; });
          if(!it) return;
          const ox = it.x, oy = it.y;
          function onMove(ev){
            it.x = Math.max(0, ox + (ev.clientX - startX));
            it.y = Math.max(0, oy + (ev.clientY - startY));
            item.style.left = it.x + "px";
            item.style.top = it.y + "px";
          }
          function onUp(){
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", onUp);
            persistCanvas();
          }
          document.addEventListener("mousemove", onMove);
          document.addEventListener("mouseup", onUp);
        });
      }
      // 调整大小（右下角）
      const handle = item.querySelector(".cs-resize-handle");
      if(handle){
        handle.addEventListener("mousedown", function(e){
          e.preventDefault(); e.stopPropagation();
          const startX = e.clientX, startY = e.clientY;
          const it = canvasItems.find(function(x){ return x.id === id; });
          if(!it) return;
          const ow = it.w, oh = it.h;
          function onMove(ev){
            it.w = Math.max(160, ow + (ev.clientX - startX));
            it.h = Math.max(120, oh + (ev.clientY - startY));
            item.style.width = it.w + "px";
            item.style.height = it.h + "px";
          }
          function onUp(){
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", onUp);
            persistCanvas();
          }
          document.addEventListener("mousemove", onMove);
          document.addEventListener("mouseup", onUp);
        });
      }
    });
  }

  renderShell();
}
function restoreRecycle(id){
  const all = load(PREFIX+"tasks", []);
  const next = all.map(t=> t.id===id ? Object.assign({}, t, { deletedAt: undefined }) : t);
  save(PREFIX+"tasks", next); scheduleAutoBackup();
  toast(t("recycle.restoredTask", "已恢复任务"), "ok"); render();
}
function restoreRecycleBatch(ids){
  const set = new Set(ids);
  const all = load(PREFIX+"tasks", []);
  const next = all.map(t=> set.has(t.id) ? Object.assign({}, t, { deletedAt: undefined }) : t);
  save(PREFIX+"tasks", next); scheduleAutoBackup();
  toast(t("recycle.restoredTasks", "已恢复 {count} 条任务").replace("{count}", ids.length), "ok"); render();
}
function purgeRecycle(id){
  const all = load(PREFIX+"tasks", []);
  const next = all.filter(t=>t.id!==id);
  save(PREFIX+"tasks", next); scheduleAutoBackup();
  toast(t("recycle.purged", "已永久删除"), "ok"); render();
}
function purgeRecycleBatch(ids){
  const set = new Set(ids);
  const all = load(PREFIX+"tasks", []);
  const next = all.filter(t=>!set.has(t.id));
  save(PREFIX+"tasks", next); scheduleAutoBackup();
  toast(t("recycle.purgedTasks", "已永久删除 {count} 条任务").replace("{count}", ids.length), "ok"); render();
}
function clearRecycle(){
  const all = load(PREFIX+"tasks", []);
  const next = all.filter(t=>!t.deletedAt);
  save(PREFIX+"tasks", next); scheduleAutoBackup();
  // v3.1：同时清空回收站数据项（配置/文件/插件）
  saveRecycleBin([]);
  toast(t("recycle.cleared", "回收站已清空"), "ok"); render();
}
/* v3.1：回收站数据项（配置/文件/插件）的恢复与彻底删除 */
/** 恢复回收站数据项 */
function restoreRecycleBin(id){
  const r = restoreFromRecycleBin(id);
  if(!r.ok){ toast(r.err || t("recycle.restoreFail", "恢复失败"), "warn"); return; }
  toast(t("recycle.restored", "已恢复"), "ok"); render();
}
/** 彻底删除回收站数据项（仅移除记录，不恢复） */
function purgeRecycleBin(id){
  const ok = removeFromRecycleBin(id);
  if(!ok){ toast(t("recycle.purgeFail", "删除失败"), "warn"); return; }
  toast(t("recycle.purged", "已永久删除"), "ok"); render();
}
/** 批量恢复（混合任务 + 回收站数据项）
 *  @param {Array<HTMLElement>} checked - 勾选的 checkbox 元素数组 */
function restoreRecycleBatchMixed(checked){
  let taskCount = 0, binCount = 0, failCount = 0;
  const taskIds = [];
  checked.forEach(c=>{
    const isTask = c.getAttribute("data-is-task")==="1";
    const id = c.dataset.chk;
    if(isTask){ taskIds.push(id); taskCount++; }
    else{
      const r = restoreFromRecycleBin(id);
      if(r.ok){ binCount++; }else{ failCount++; }
    }
  });
  if(taskIds.length){
    const set = new Set(taskIds);
    const all = load(PREFIX+"tasks", []);
    const next = all.map(t=> set.has(t.id) ? Object.assign({}, t, { deletedAt: undefined }) : t);
    save(PREFIX+"tasks", next); scheduleAutoBackup();
  }
  const total = taskCount + binCount;
  if(failCount){ toast(t("recycle.batchRestoredSome", "已恢复 {total} 项，{fail} 项失败").replace("{total}", total).replace("{fail}", failCount), "warn"); }
  else{ toast(t("recycle.batchRestoredAll", "已恢复 {total} 项").replace("{total}", total), "ok"); }
  render();
}
/** 批量彻底删除（混合任务 + 回收站数据项）
 *  @param {Array<HTMLElement>} checked - 勾选的 checkbox 元素数组 */
function purgeRecycleBatchMixed(checked){
  let taskCount = 0, binCount = 0;
  const taskIds = [];
  checked.forEach(c=>{
    const isTask = c.getAttribute("data-is-task")==="1";
    const id = c.dataset.chk;
    if(isTask){ taskIds.push(id); taskCount++; }
    else{
      if(removeFromRecycleBin(id)){ binCount++; }
    }
  });
  if(taskIds.length){
    const set = new Set(taskIds);
    const all = load(PREFIX+"tasks", []);
    const next = all.filter(t=>!set.has(t.id));
    save(PREFIX+"tasks", next); scheduleAutoBackup();
  }
  const total = taskCount + binCount;
  toast(t("recycle.batchPurgedAll", "已永久删除 {total} 项").replace("{total}", total), "ok"); render();
}
/* ---------- v3.1 回收站扩展：多类型（任务/配置/文件/插件）统一回收站 ----------
   任务类型沿用软删除（tasks[].deletedAt），不进入 wb_recycle_bin；
   配置/文件/插件类型存入 wb_recycle_bin，按 type 字段区分。
   数据结构：{id,type,title,desc,data,deletedAt,source} */
const RECYCLE_BIN_KEY = PREFIX+"recycle_bin";
/** 读取回收站所有项（仅含 config/file/plugin，任务走 tasks 软删除）
 *  @returns {Array<Object>} 回收站项数组（按 deletedAt 倒序） */
function getRecycleBin(){
  const items = load(RECYCLE_BIN_KEY, []);
  return Array.isArray(items) ? items.slice().sort((a,b)=>(b.deletedAt||0)-(a.deletedAt||0)) : [];
}
/** 保存回收站（全量覆盖）
 *  @param {Array<Object>} items - 回收站项数组
 *  @returns {void} */
function saveRecycleBin(items){
  save(RECYCLE_BIN_KEY, Array.isArray(items) ? items : []);
}
/** 添加项到回收站
 *  @param {"config"|"file"|"plugin"} type - 类型（task 不走此通道）
 *  @param {string} title - 标题
 *  @param {string} desc - 描述
 *  @param {Object} data - 原始数据快照（用于恢复）
 *  @param {string} source - 来源标识
 *  @returns {string|null} 新增项 id（失败返回 null） */
/* v3.7.14（解耦 S2a）：注册入回收站实现（整体赋值，保留签名与返回值） */
AppBridge.addToRecycleBin = addToRecycleBin;

function addToRecycleBin(type, title, desc, data, source){
  if(type!=="config" && type!=="file" && type!=="plugin") return null;
  const items = load(RECYCLE_BIN_KEY, []);
  const arr = Array.isArray(items) ? items : [];
  const id = "recycle_" + uid();
  arr.push({
    id: id,
    type: type,
    title: String(title||"").slice(0, 200),
    desc: String(desc||"").slice(0, 500),
    data: data || {},
    deletedAt: Date.now(),
    source: String(source||"").slice(0, 100)
  });
  saveRecycleBin(arr);
  return id;
}
/** 从回收站彻底删除指定 id 的项（不恢复，仅移除记录）
 *  @param {string} id - 回收站项 id
 *  @returns {boolean} 是否删除成功 */
function removeFromRecycleBin(id){
  if(!id) return false;
  const items = load(RECYCLE_BIN_KEY, []);
  const arr = Array.isArray(items) ? items : [];
  const next = arr.filter(it => it.id !== id);
  if(next.length === arr.length) return false;
  saveRecycleBin(next);
  return true;
}
/** 从回收站恢复指定 id 的项：根据 type 把 data 写回对应存储，并从回收站移除
 *  @param {string} id - 回收站项 id
 *  @returns {{ok:boolean, err?:string}} 恢复结果 */
function restoreFromRecycleBin(id){
  if(!id) return {ok:false, err:t("recycle.invalidId", "无效 id")};
  const items = load(RECYCLE_BIN_KEY, []);
  const arr = Array.isArray(items) ? items : [];
  const item = arr.find(it => it.id === id);
  if(!item) return {ok:false, err:t("recycle.itemNotFound", "回收站项不存在")};
  try{
    if(item.type === "config"){
      // 配置回收：根据 data.kind 区分 profile / link
      const d = item.data || {};
      if(d.kind === "profile"){
        // 恢复 AI Profile：追加到 cfg.profiles
        const cfg = getCfg() || {};
        const profiles = Array.isArray(cfg.profiles) ? cfg.profiles.slice() : [];
        if(profiles.some(p => p.id === (d.profile && d.profile.id))){
          return {ok:false, err:t("recycle.profileDup", "同名 Profile 已存在")};
        }
        if(d.profile){ profiles.push(d.profile); }
        cfg.profiles = profiles;
        if(!cfg.activeId && profiles.length) cfg.activeId = profiles[0].id;
        _cfgCache = cfg;
        // 异步落盘（不阻塞恢复流程）
        if(typeof persistCfg === "function"){ persistCfg(cfg).catch(()=>{}); }
      }else if(d.kind === "link"){
        // 恢复联动规则：追加到自定义链
        const links = getLinks().slice();
        if(d.link && !links.some(l => l.id === d.link.id)){
          links.push(d.link);
          saveCustomLinks(links);
        }
      }
    }else if(item.type === "file"){
      // 文件回收：恢复到 notes
      const notes = getNotes();
      if(d_noteMissing(notes, item.data)){
        if(item.data && item.data.note){ notes.push(item.data.note); saveNotes(notes); }
      }
    }else if(item.type === "plugin"){
      // 插件回收：仅恢复 enabled/config 状态（无法恢复代码，需用户重新安装）
      // v3.1.2：插件本体未重新注册时诚实提示，不再静默成功误导用户
      const d = item.data || {};
      if(d.plugin && typeof setPluginEnabled === "function" && _plugins[d.plugin.id]){
        setPluginEnabled(d.plugin.id, !!d.plugin.enabled);
        if(d.plugin.config){ setPluginConfig(d.plugin.id, d.plugin.config); }
      }else if(d.plugin && d.plugin.name){
        toast(t("recycle.pluginReinstall", "插件「{name}」本体需重新安装（当前仅保留其启用状态记录）").replace("{name}", d.plugin.name), "warn");
      }
    }
  }catch(e){
    return {ok:false, err:t("recycle.restoreFailErr", "恢复失败：{err}").replace("{err}", (e&&e.message||e))};
  }
  // 从回收站移除
  const next = arr.filter(it => it.id !== id);
  saveRecycleBin(next);
  return {ok:true};
}
/** 内部辅助：判断 notes 中是否缺少指定 note（避免重复恢复） */
function d_noteMissing(notes, data){
  if(!data || !data.note || !data.note.id) return false;
  return !notes.some(n => n.id === data.note.id);
}
/* ---------- 回收站自动清理策略（T2） ---------- */
const RECYCLE_POLICY_KEY = PREFIX+"recycle_policy"; // "off" | "7" | "30" | "90"，默认 "30"
function getRecyclePolicy(){
  const v = load(RECYCLE_POLICY_KEY, "30");
  return (v==="off"||v==="7"||v==="30"||v==="90") ? v : "30";
}
function setRecyclePolicy(v){
  save(RECYCLE_POLICY_KEY, (v==="off"||v==="7"||v==="30"||v==="90") ? v : "30");
}
/** 启动时清理超期软删任务；返回清理条数（0 表示无动作） */
function cleanupRecycle(){
  const policy = getRecyclePolicy();
  if(policy==="off") return 0;
  const days = parseInt(policy,10);
  const cutoff = Date.now() - days*86400000;
  let count = 0;
  // v3.1.2：任务软删项与 wb_recycle_bin（配置/文件/插件）两路都清理——
  // 修复前只清任务，bin 类型永不自动清理，与 UI「自动清理：N 天后」承诺不符
  const all = load(PREFIX+"tasks", []);
  const expired = all.filter(t=>t.deletedAt && t.deletedAt < cutoff);
  if(expired.length){
    const next = all.filter(t=>!(t.deletedAt && t.deletedAt < cutoff));
    save(PREFIX+"tasks", next); count += expired.length;
  }
  const bin = load(RECYCLE_BIN_KEY, []);
  if(Array.isArray(bin) && bin.length){
    const kept = bin.filter(it=>!(it.deletedAt && it.deletedAt < cutoff));
    if(kept.length !== bin.length){ count += (bin.length - kept.length); saveRecycleBin(kept); }
  }
  if(count){
    scheduleAutoBackup();
    toast(t("recycle.autoCleaned", "回收站已自动清理 {count} 条超过 {days} 天的内容").replace("{count}", count).replace("{days}", days), "ok");
  }
  return count;
}
/* ---------- 焦点陷阱（T5 无障碍：Tab 循环锁在容器内，关闭后焦点归还触发元素） ---------- */
/**
 * 关闭回收站页面（含焦点陷阱解除），并 render() 返回之前的视图；返回是否关闭了页面
 * @returns {boolean}
 */
function closeRecycleModal(){
  const m=$("#recycleModal"); if(!m) return false;
  if(typeof m._releaseTrap==="function"){ try{ m._releaseTrap(); }catch(e){ /* noop */ } }
  m.remove();
  // 关闭后若 active 仍是 recycle，会循环回到回收站页 → 重置为 overview
  if(getActive()==="recycle") setActive("overview");
  render(); // 返回之前的视图（与"返回按钮"语义一致）
  return true;
}
/* 侧边栏折叠：事件委托绑定在 #side 上（v1.9.9 折叠按钮回归侧栏顶部 #sideToggle 重新位于 #side 子树）。
   启动时恢复持久化状态。 */
function setupSideToggle(){
  const side = $("#side");
  if(!side) return;
  side.addEventListener("click", (e)=>{
    if(!e.target || !e.target.closest || !e.target.closest("#sideToggle")) return;
    side.classList.toggle("collapsed");
    try{ localStorage.setItem(PREFIX+"sideCollapsed", side.classList.contains("collapsed")?"1":"0"); }catch(_){}
  });
  try{ if(localStorage.getItem(PREFIX+"sideCollapsed")==="1") side.classList.add("collapsed"); }catch(_){}
}

/* v1.15：应用独立页面——日历/天气/闹钟/萌宠/指针特效 五个应用卡片入口
   渲染到 #main（与图表商店/回收站页同模式），点击各卡片打开对应 modal */
function openAppPage(){
  // v1.15 修复：从市场(抽屉)切到应用页时先关闭抽屉，避免新页面被覆盖层挡住
  AppBridge.closeDrawer();
  uiView = "app";
  renderSide();
  const apps = [
    { id:"calview", name:"日历", desc:t("appPage.calviewDesc", "按月/周查看任务分布"), icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>' },
    { id:"weather", name:t("appPage.weather", "天气"), desc:"今日 + 未来几日预报", icon: UI_ICONS.sun },
    { id:"alarm", name:t("appPage.alarm", "闹钟"), desc:"多任务 · 循环 · 贪睡", icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5"/><path d="M5 3L2 6M19 3l3 3M9 2h6"/></svg>' },
    { id:"pet", name:t("appPage.pet", "萌宠"), desc:t("appPage.petDesc", "桌面陪伴小宠物"), icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="9" cy="10" r="1"/><circle cx="15" cy="10" r="1"/><path d="M8 15c1.5 1.5 6.5 1.5 8 0"/></svg>' },
  ];
  const cards = apps.map(function(a){
    return '<div class="card app-card" data-app="'+esc(a.id)+'" role="button" tabindex="0" aria-label="'+esc(a.name)+'">'
      + '<span class="app-card-ic" aria-hidden="true">'+a.icon+'</span>'
      + '<div class="app-card-tx"><div class="app-card-name">'+esc(a.name)+'</div><div class="app-card-desc">'+esc(a.desc)+'</div></div>'
      + '</div>';
  }).join("");
  $("#main").innerHTML = sanitizeHtml(
    '<div class="card page-head-card"><header class="page-head sc-page-head">'
    + '<span class="ph-ic" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg></span>'
    + '<div class="ph-tx"><h2>应用</h2><p class="sub">日历 · 天气 · 闹钟 · 萌宠 · 指针特效</p></div>'
    + '</header></div>'
    + '<div class="app-grid">' + cards + '</div>');
  // 事件绑定（委托）
  $$("#main [data-app]").forEach(function(c){
    c.onclick = function(){
      const id = c.getAttribute("data-app");
      if(id==="calview"){ const m=$("#calendarModal"); if(m){ const b=$("#calendarModalBody"); if(b) b.innerHTML=sanitizeHtml(AppBridge.renderCalendarView(0)); m.classList.add("show"); } }
      else if(id==="weather"){ if(typeof openWeatherModal === "function") openWeatherModal(); }
      else if(id==="alarm"){ if(typeof openAlarmModal === "function") openAlarmModal(); }
      else if(id==="pet"){ if(typeof openPetModal === "function") openPetModal(); }
      else if(id==="pointerfx"){ if(typeof togglePointerFx === "function") togglePointerFx(); }
    };
    c.onkeydown = function(e){ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); c.click(); } };
  });
  appendFoot();
}

/* v2.1.0：工具占位页（「即将上线」）——侧栏两级菜单中尚未实现的子工具统一落到这里。
   结构与其他独立页一致：page-head 卡 + 说明卡 + 返回按钮；uiView="tool" 驱动侧栏子项高亮。 */
/* v2.3.0：TOOL_APPS 工具注册表——19 个子工具全部落地最小可用版（纯前端离线）。
   数据键：PREFIX+"tool_"+id；render() 返回 HTML，bind() 绑事件。 */

/* ---------- 工具公共 helpers ---------- */
function _toolData(id){ return load(PREFIX+"tool_"+id, []); }
function _toolSave(id, arr){ save(PREFIX+"tool_"+id, arr); }
function _toolDoc(id){ return load(PREFIX+"tool_"+id, ""); }
function _toolSaveDoc(id, text){ save(PREFIX+"tool_"+id, String(text===null||text===undefined?"":text)); }
function _toolUid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }
function _toolDownload(name, content, mime){
  try{
    const blob = new Blob([content], {type: mime||"text/plain;charset=utf-8"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function(){ document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
    toast(t("tool.exportedToast", "已导出 {name}").replace("{name}", name), "ok");
  }catch(e){ toast(t("tool.exportFailToast", "导出失败：{err}").replace("{err}", (e && e.message || e)), "warn"); }
}
/* 生活簇通用记录工具骨架：config = {fields:[{k,label,type,options}], cols:[{k,label}], sum(fn), emptyTip} */
/* ---------- v3.7.22：生活簇记录工具的 CSV 导出（纯函数，可单测） ---------- */
/** CSV 单元格转义：含 逗号/引号/换行 时加引号，内部引号翻倍 */
function _csvCell(v){
  const s = String(v === null || v === undefined ? "" : v);
  return /[",\r\n]/.test(s) ? '"' + s.split('"').join('""') + '"' : s;
}
/** 从渲染后的表格导出 CSV 文本（列名直接取 <th>，天然是本地化文案，不用再传 cfg）
 *  跳过首尾两列：首列是勾选框、末列是删除按钮（都是操作列，不该进导出） */
function _toolCsvFromTable(root){
  if(!root) return "";
  const ths = Array.prototype.slice.call(root.querySelectorAll("table.tool-table thead th"));
  if(!ths.length) return "";
  const labels = ths.map(function(th){ return th.textContent.trim(); });
  const first = labels.length ? labels[0] : "";
  const skipHead = !first;                       /* 首列为"空 th"= 勾选列 */
  const cut = skipHead ? labels.length - 1 : labels.length;   /* 末列 = 删除按钮 */
  const out = [labels.slice(skipHead ? 1 : 0, cut).map(_csvCell).join(",")];
  Array.prototype.slice.call(root.querySelectorAll("table.tool-table tbody tr")).forEach(function(tr){
    const tds = Array.prototype.slice.call(tr.querySelectorAll("td"));
    const cells = tds.slice(skipHead ? 1 : 0, cut).map(function(td){
      const cb = td.querySelector('input[type="checkbox"]');
      return cb ? (cb.checked ? t("tool.csv.yes","是") : t("tool.csv.no","否")) : td.textContent.trim();
    });
    out.push(cells.map(_csvCell).join(","));
  });
  return out.join("\r\n");
}
/** 绑定导出按钮（骨架已渲染 #recExportBtn）→ 导出当前表格为 CSV */
function _bindRecordExport(rootId, toolId, fileName){
  const root = document.getElementById(rootId);
  if(!root) return;
  const btn = root.querySelector("#recExportBtn");
  if(!btn) return;
  btn.onclick = function(){
    const csv = _toolCsvFromTable(root);
    if(!csv){ toast(t("tool.csv.emptyTip","没有可导出的记录"), "warn"); return; }
    _toolDownload((fileName || toolId || "records") + ".csv", "\uFEFF" + csv, "text/csv;charset=utf-8");
  };
}

function _recordToolHtml(cfg, records){
  const form = '<div class="tool-form-grid">' + cfg.fields.map(function(f){
    if(f.type === "select"){
      return '<div class="tool-field"><label>' + esc(f.label) + '</label><select data-rec-field="' + esc(f.k) + '">' +
        f.options.map(function(o){ return '<option value="' + esc(o) + '">' + esc(o) + '</option>'; }).join("") + '</select></div>';
    }
    /* v3.7.43：日期字段移除 inputmode="none"（与 render-scene-main.js 口径一致，支持手输） */
    const t = f.type === "number" ? ' type="number" step="any"' : f.type === "date" ? ' type="text" data-date-picker="1" autocomplete="off"' + (f.timePicker ? ' data-time-picker="1"' : '') : ' type="text"';
    /* v3.7.38：按类型跨列 —— 文字宽、日期中、数字（金额/评分）窄 */
    /* v3.7.42：改用与工具卡（_featureCardHtml）共用的 _fieldSpanCls —— 原来这里自己写了一套，
       且**漏了下拉框**（select 落进 else 分支拿了 --wide，而实际上它的判断链里没有 select 分支）。
       两族共用一套后，文字/下拉/数字/日期的宽度才真正一致。 */
    const wcls = _fieldSpanCls(f);
    return '<div class="tool-field' + wcls + '"><label>' + esc(f.label) + '</label><input' + t + ' data-rec-field="' + esc(f.k) + '" placeholder="' + esc(f.label) + '"></div>';
  }).join("") + '</div>';
  const today = todayStr();
  const rows = records.map(function(r){
    const overdue = cfg.overdueKey && r[cfg.overdueKey] && r[cfg.overdueKey] < today && !r.done;
    const soon = cfg.overdueKey && r[cfg.overdueKey] && r[cfg.overdueKey] >= today && r[cfg.overdueKey] <= _addDaysStr(today, 3) && !r.done;
    const tds = cfg.cols.map(function(c){
      if(c.type === "check"){ return '<td><input type="checkbox" data-rec-check="' + r.id + '"' + (r.done ? " checked" : "") + ' aria-label="' + esc(c.label) + '"></td>'; }
      const v = typeof c.fmt === "function" ? c.fmt(r) : esc(r[c.k]);
      return "<td>" + v + "</td>";
    }).join("");
    return '<tr data-rec-row="' + r.id + '"' + (overdue ? ' style="color:var(--danger)"' : "") + ">" +
      '<td><button type="button" class="addbtn xs danger" data-rec-del="' + r.id + '" aria-label="'+t("a11y.del", "删除")+'">✕</button></td>' + tds + "</tr>";
  }).join("");
  let summary = "";
  if(typeof cfg.sum === "function"){
    const sums = cfg.sum(records);
    if(sums && sums.length){
      summary = '<div class="tool-summary">' + sums.map(function(s){
        return '<div class="tool-summary-item"><span class="v">' + esc(String(s.v)) + '</span><span class="l">' + esc(s.l) + '</span></div>';
      }).join("") + "</div>";
    }
  }
  /* v3.7.12：**补上 .card.tool-app-card 外壳**（用户："做成 card"）。
     这一族此前直接返回裸的 filter-bar + form-box + table，没有卡片类 ——
     而 CSS 里有一大批 `.tool-app-card …` 限定的规则（栅格/统计/表格/工具栏样式）全都不生效，
     放大看就是"字段独占一行 + 没有卡片外观"。`_featureCardHtml` 那一族本来就带该类。 */
  return '<div class="card tool-app-card">' +
    '<div class="tool-filter-bar"><span class="add-wrap"><span class="add-label">'+t("tool.addLabel", "添加")+'</span><button type="button" class="addbtn sm add-round" id="recAddBtn" data-sc="accent" aria-label="'+t("tool.ariaAdd", "添加")+'">＋</button></span>' +
    '<span class="sub u-m-0">共 ' + records.length + ' 条</span>' + summary
      + '<button type="button" class="addbtn sm" id="recExportBtn">' + t("tool.exportCsv", "导出 CSV") + '</button></div>' +
    '<div class="tool-form-box">' + form + "</div>" +
    (records.length
      ? '<div class="tool-table-wrap"><table class="tool-table"><thead><tr><th></th>' + cfg.cols.map(function(c){ return '<th>' + esc(c.label) + "</th>"; }).join("") + "</tr></thead><tbody>" + rows + "</tbody></table></div>"
      : '<div class="tool-empty">' + esc(cfg.emptyTip || t("tool.emptyDefault", "暂无记录")) + "</div>") +
    "</div>";
}
/* v3.2 C-档双轨收敛：双轨工具的写入入口改为引导跳转功能卡（数据以功能卡为真相源）。
 * 提示条替代表单提交——点「去功能卡添加」切到对应场景功能 tab。 */
function _bindRecordToolRedirect(toolId, targetName, sceneKey, featId){
    const root = $("#toolAppBody"); if(!root) return;
    _bindRecordExport("toolAppBody", toolId);   /* v3.7.22：导出 CSV（双轨工具的表格仍可导出） */
  const add = root.querySelector("#recAddBtn");
  if(add){
    add.onclick = function(){
      toast(toolId + t("tool.convergedTo", " 已收敛到") + targetName + t("tool.jumpingSoon", "——即将跳转"), "info");
      setActive(sceneKey);
      sceneFeatureMode = featId;
      render();
    };
  }
  // 已有的表单/表格交互（勾选已缴等）不再绑定独立写入——数据变更请去功能卡
}
function _bindRecordTool(rootId, toolId, fields, afterChange){
    const root = $("#" + rootId); if(!root) return;
    _bindRecordExport(rootId, toolId);      /* v3.7.22：导出 CSV（生活簇共用） */
  const add = root.querySelector("#recAddBtn");
  if(add) add.onclick = function(){
    const rec = { id: _toolUid(), createdAt: Date.now() };
    const ok = true;
    fields.forEach(function(k){
      const el = root.querySelector('[data-rec-field="' + k + '"]');
      if(el) rec[k] = (el.type === "number") ? Number(el.value || 0) : el.value.trim();
    });
    /* 至少一个非空字段才入库 */
    if(!fields.some(function(k){ return rec[k]; })){ toast(t("tool.fillRequired", "请先填写内容"), "warn"); return; }
    const arr = _toolData(toolId);
    arr.unshift(rec);
    _toolSave(toolId, arr);
    toast(t("tool.addedToast", "已添加"), "ok");
    openToolStub(toolId, (TOOL_APPS[toolId] && TOOL_APPS[toolId].name) || "");
    if(afterChange) afterChange();
  };
  $$("#" + rootId + " [data-rec-del]").forEach(function(b){
    b.onclick = function(){
      const id2 = b.getAttribute("data-rec-del");
      _toolSave(toolId, _toolData(toolId).filter(function(r){ return r.id !== id2; }));
      openToolStub(toolId, (TOOL_APPS[toolId] && TOOL_APPS[toolId].name) || "");
      if(afterChange) afterChange();
    };
  });
  $$("#" + rootId + " [data-rec-check]").forEach(function(b){
    b.onchange = function(){
      const id2 = b.getAttribute("data-rec-check");
      let arr = _toolData(toolId);
      /* 勾选时记录完成时间 paidAt（lif-bill「本月已缴」统计依赖）；取消勾选清除 */
      arr = arr.map(function(r){ return r.id === id2 ? Object.assign({}, r, { done: b.checked, paidAt: b.checked ? todayStr() : undefined }) : r; });
      _toolSave(toolId, arr);
      openToolStub(toolId, (TOOL_APPS[toolId] && TOOL_APPS[toolId].name) || "");
      if(afterChange) afterChange();
    };
  });
}
function _addDaysStr(ymd, n){
  const p = ymd.split("-");
  const d = new Date(Number(p[0]), Number(p[1])-1, Number(p[2]));
  d.setDate(d.getDate() + n);
  return d.getFullYear() + "-" + pad(d.getMonth()+1) + "-" + pad(d.getDate());
}
/* v2.3.1：CAD 画布当前会话（des-cad bind 时替换；window mouseup 单例监听器读取） */
let _cadSession = null;

/* ---------- v3.7.21：视频分镜/提示词工具的纯函数（可单测） ---------- */
/** 纯函数：把用户描述 + 时长 + 风格 拼成给文本 AI 的提示词（产出"分镜 + 视频提示词"，不产出视频本身） */
function _vgBuildPrompt(desc, seconds, style){
  const d = String(desc === null || desc === undefined ? "" : desc).trim();
  const secs = String(seconds || "5");
  const styles = { real: "写实", anime: "动画", cg: "3D/CG" };
  const st = styles[style] || "写实";
  return "你是分镜师。请根据下面的视频描述，输出两部分（用 Markdown 小标题分隔，语言与描述一致）：\n"
    + "## 分镜\n按时间轴给出分镜（每个镜头一行：时间区间 / 画面内容 / 镜头运动 / 景别），总时长 " + secs + " 秒，风格：" + st + "。\n"
    + "## 视频提示词\n给出一段可直接粘贴到视频生成模型的提示词（单段、具体、含主体+动作+环境+光线+镜头语言+风格），并额外给出 3 条负面词。\n"
    + "要求：只输出这两部分，不要解释、不要客套。\n\n视频描述：\n" + d;
}

/* ---------- v3.7.21：时间戳工具的纯函数（可单测） ---------- */
/** 纯函数：ISO 双行显示（本地 + UTC），供多处复用 */
function _tsDualLine(d){
  try{ return "ISO: " + d.toISOString() + "   ·   UTC: " + d.toUTCString(); }catch(_e){ return ""; }
}
/** 纯函数：解析"时间点"文本 —— 支持 10/13 位时间戳、2026-09-13、2026-09-13 12:00(:ss)、12:00(:ss)（今天）
 *  返回 Date 或 null（无法解析时给出 null，调用方决定如何提示） */
function _tsParsePoint(text, now){
  const s = String(text === null || text === undefined ? "" : text).trim();
  if(!s) return null;
  const base = (now instanceof Date) ? now : new Date();
  if(/^-?\d{9,15}$/.test(s)){                     /* 纯数字 → 时间戳（10 位当秒，其余当毫秒） */
    let n = Number(s);
    if(String(Math.trunc(Math.abs(n))).length <= 10) n *= 1000;
    const d = new Date(n);
    return isNaN(d.getTime()) ? null : d;
  }
  const hm = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);   /* 只有时间 → 落在今天 */
  if(hm){
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate(), Number(hm[1]), Number(hm[2]), Number(hm[3] || 0));
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s.replace(" ", "T"));          /* 其余交给 Date 解析（yyyy-mm-dd / yyyy/mm/dd 等） */
  return isNaN(d.getTime()) ? null : d;
}
/** 纯函数：人类可读的时间差（固定单位换算，不用日历月；负值表示 b 早于 a） */
function _tsHumanDiff(ms){
  const neg = ms < 0, v = Math.abs(ms);
  if(v < 1000) return (neg ? "-" : "") + v + " 毫秒";
  const s = Math.floor(v/1000), m = Math.floor(s/60), h = Math.floor(m/60), day = Math.floor(h/24);
  const parts = [];
  if(day) parts.push(day + " 天");
  if(h % 24) parts.push((h % 24) + " 小时");
  if(m % 60) parts.push((m % 60) + " 分");
  if(!day && !(h % 24) && !(m % 60)) parts.push((s % 60) + " 秒");
  return (neg ? "-" : "") + parts.join(" ") + "（共 " + s + " 秒）";
}
/** 纯函数：常用时间点（今天零点 / 本周一 / 本月 1 日 / 今年元旦；周一为一周起点） */
function _tsCommonPoints(now){
  const n = (now instanceof Date) ? now : new Date();
  const mk = function(y, mo, d){ return new Date(y, mo, d, 0, 0, 0, 0); };
  const dow = (n.getDay() + 6) % 7;                 /* 0 = 周一 */
  return [
    { label: t("tool.time.pt.today","今天 00:00"), ts: mk(n.getFullYear(), n.getMonth(), n.getDate()).getTime() },
    { label: t("tool.time.pt.week","本周一 00:00"), ts: mk(n.getFullYear(), n.getMonth(), n.getDate() - dow).getTime() },
    { label: t("tool.time.pt.month","本月 1 日"), ts: mk(n.getFullYear(), n.getMonth(), 1).getTime() },
    { label: t("tool.time.pt.year","今年元旦"), ts: mk(n.getFullYear(), 0, 1).getTime() }
  ];
}

/* ---------- v3.7.20：PDF 阅读工具（做深）的状态 / 纯函数 / 原地刷新 ---------- */
/* 设计要点：
   ① iframe 无法被脚本控制（内置阅读器是独立进程）→ 页码/缩放只能通过 **PDF 打开参数** 重建 src，
      所以把"拼 URL"抽成纯函数 _pdfUrl()（可单测）。
   ② 只做各浏览器确实支持的参数：page / zoom / view=FitH。刻意不做 rotate / toolbar=0
      （Chromium 内置阅读器不认，做了就是假功能）。
   ③ **不调全局 render()**：它会把当前视图重置 → 表现为"选完 PDF 页面没了"（由测试先发现）。
      改为 _pdfRefresh() 原地更新控制条 + 重挂 iframe。
   ④ blob URL 只在本次会话有效：localStorage 只存文件名/页码/缩放（url 不落盘，否则刷新后是死链）。 */
const _PDF_KEY = "pdf_reader";
let _pdfBlobUrl = "";
function _pdfState(){
  const s = load(PREFIX + _PDF_KEY, {}) || {};
  return {
    name: String(s.name || ""),
    page: Math.max(1, parseInt(s.page, 10) || 1),
    zoom: (typeof s.zoom === "number" && s.zoom > 0) ? s.zoom : 1,
    fit: !!s.fit,
    url: _pdfBlobUrl
  };
}
function _pdfWrite(patch){
  const s = Object.assign(_pdfState(), patch || {});
  save(PREFIX + _PDF_KEY, { name: s.name, page: s.page, zoom: s.zoom, fit: s.fit });
  if(patch && patch.url) _pdfBlobUrl = patch.url;
  return s;
}
/** 纯函数：按状态拼 PDF 打开 URL（page / zoom / view=FitH 均为内置阅读器支持的参数） */
function _pdfUrl(base, st){
  if(!base) return "";
  const s = st || {};
  const parts = ["page=" + Math.max(1, parseInt(s.page, 10) || 1)];
  if(s.fit) parts.push("view=FitH"); else parts.push("zoom=" + Number(s.zoom || 1).toFixed(2));
  return base.split("#")[0] + "#" + parts.join("&");
}
/** 控制条 HTML（独立函数，便于原地替换） */
function _pdfBarHtml(S){
  const opt = function(v, label){ return '<option value="' + v + '"' + (Math.abs(v - S.zoom) < 0.001 ? ' selected' : '') + '>' + label + '</option>'; };
  return '<div class="pdf-bar">'
    + '<button type="button" class="addbtn sm" id="pdfPrev" title="' + esc(t("tool.pdf.prev", "上一页")) + '">‹</button>'
    + '<input id="pdfPage" class="pdf-page-inp" type="number" min="1" step="1" value="' + S.page + '" aria-label="' + esc(t("tool.pdf.pageAria", "页码")) + '">'
    + '<button type="button" class="addbtn sm" id="pdfNext" title="' + esc(t("tool.pdf.next", "下一页")) + '">›</button>'
    + '<span class="pdf-sep"></span>'
    + '<select id="pdfZoom" aria-label="' + esc(t("tool.pdf.zoom", "缩放")) + '">' + opt(0.5,"50%") + opt(0.75,"75%") + opt(1,"100%") + opt(1.25,"125%") + opt(1.5,"150%") + opt(2,"200%") + '</select>'
    + '<button type="button" class="addbtn sm' + (S.fit ? ' btn-primary' : '') + '" id="pdfFit">' + t("tool.pdf.fitWidth", "适应宽度") + '</button>'
    + '<button type="button" class="addbtn sm" id="pdfOpen">' + t("tool.pdf.openNew", "新窗口打开") + '</button>'
    + '</div>'
    + '<div class="pdf-meta sub">' + esc(S.name) + ' · ' + t("tool.pdf.atPage", "第 {page} 页").replace("{page}", String(S.page)) + '</div>';
}
/** 原地刷新：控制条 + 空态 + iframe（**不触发全局 render()**） */
function _pdfRefresh(){
  const bar = $("#pdfBar"), empty = $("#pdfEmpty"), wrap = $("#pdfViewWrap");
  if(!bar) return;
  const S = _pdfState();
  if(!S.url){
    bar.innerHTML = "";
    if(empty) empty.innerHTML = sanitizeHtml('<div class="pdf-empty">' + (S.name
      ? esc(t("tool.pdf.reselectHint", "上次读到《{name}》第 {page} 页 —— 请重新选择该文件（浏览器安全限制，无法自动恢复文件访问）").replace("{name}", S.name).replace("{page}", String(S.page)))
      : t("tool.pdf.dropHint", "把 PDF 拖到这里，或点上方按钮选择文件")) + '</div>');
    if(wrap) wrap.innerHTML = "";
    return;
  }
  if(empty) empty.innerHTML = "";
  bar.innerHTML = sanitizeHtml(_pdfBarHtml(S));
  /* 控制条事件（原地重建后需重新绑定） */
  const go = function(p){ _pdfGo(p); };
  if($("#pdfPrev")) $("#pdfPrev").onclick = function(){ go(_pdfState().page - 1); };
  if($("#pdfNext")) $("#pdfNext").onclick = function(){ go(_pdfState().page + 1); };
  if($("#pdfPage")) $("#pdfPage").onchange = function(e){ go(parseInt(e.target.value, 10) || 1); };
  if($("#pdfZoom")) $("#pdfZoom").onchange = function(e){ _pdfSet({ zoom: parseFloat(e.target.value) || 1, fit: false }); };
  if($("#pdfFit")) $("#pdfFit").onclick = function(){ _pdfSet({ fit: !_pdfState().fit }); };
  if($("#pdfOpen")) $("#pdfOpen").onclick = function(){
    const st = _pdfState();
    if(!st.url) return;
    try{ window.open(_pdfUrl(st.url, st), "_blank", "noopener"); }
    catch(_e){ toast(t("tool.pdf.openFail2", "新窗口打开被拦截，请允许弹窗后重试"), "warn"); }
  };
  /* 关键：iframe 必须用 DOM API 创建 —— 本项目的 sanitizeHtml 会**主动剥离 iframe/object/embed**
     （见其规则 2），用 innerHTML 注入的话啥都渲染不出来。
     实测教训：本工具此前正是用 sanitizeHtml 注入 iframe，所以"选了文件、弹了提示，但预览区始终空白" ——
     即该工具自上线起就没真正工作过（由 tests/pdf-reader.test.js 发现）。
     用 createElement 同时更安全：属性逐个 setAttribute，没有 HTML 注入面。 */
  if(wrap){
    wrap.innerHTML = "";
    const frame = document.createElement("iframe");
    frame.className = "u-w-full u-h-560 u-border-line u-radius-md";
    frame.setAttribute("src", _pdfUrl(S.url, S));
    frame.setAttribute("title", S.name);
    frame.setAttribute("referrerpolicy", "no-referrer");
    wrap.appendChild(frame);
  }
}
function _pdfOpen(name, url){
  _pdfWrite({ name: name, url: url, page: 1, zoom: 1, fit: false });     /* 换文件 → 页码回到 1（不沿用旧文件页码） */
  _pdfRefresh();
}
function _pdfGo(page){
  if(!_pdfState().url) return;
  _pdfWrite({ page: Math.max(1, page || 1) });
  _pdfRefresh();
}
function _pdfSet(patch){
  if(!_pdfState().url) return;
  _pdfWrite(patch);
  _pdfRefresh();
}

/* ---------- v3.7.23：工具「导入文件」共用助手 + PPT JSON 归一化（纯函数，可单测） ---------- */
/** 动态创建隐藏 file input 并读取文本（无需改各工具 HTML 结构 —— 按钮直接调用即可） */
function _toolImportFile(accept, cb){
  const inp = document.createElement("input");
  inp.type = "file";
  inp.accept = accept;
  inp.style.display = "none";
  document.body.appendChild(inp);
  inp.onchange = function(){
    const f = inp.files && inp.files[0];
    const cleanup = function(){ setTimeout(function(){ try{ inp.remove(); }catch(_e){ /* ignore */ } }, 0); };
    if(!f){ cleanup(); return; }
    try{
      const fr = new FileReader();
      fr.onload = function(){ try{ cb(String(fr.result || ""), f); }catch(_e){ /* 回调异常不影响清理 */ } cleanup(); };
      fr.onerror = function(){ toast(t("tool.importReadFail", "文件读取失败"), "warn"); cleanup(); };
      fr.readAsText(f);
    }catch(e){ toast(t("tool.importReadFail", "文件读取失败") + "：" + (e && e.message || e), "warn"); cleanup(); }
  };
  inp.click();
}
/** 纯函数：把导入的 JSON 归一化为 slides 数组；不合法返回 null（调用方提示，不抛错）
 *  规则：必须是数组；元素可为对象或字符串；title/body 统一成字符串；缺 id 的补一个 */
function _pptFromJson(text){
  let arr;
  try{ arr = JSON.parse(String(text === null || text === undefined ? "" : text)); }catch(_e){ return null; }
  if(!Array.isArray(arr) || !arr.length) return null;
  const out = [];
  for(const it of arr){
    if(it === null || it === undefined) continue;
    if(typeof it === "string"){ out.push({ id:_toolUid(), title:it, body:"" }); continue; }
    if(typeof it !== "object") continue;
    out.push({
      id: String(it.id || _toolUid()),
      title: String(it.title === null || it.title === undefined ? "" : it.title),
      body: String(it.body === null || it.body === undefined ? "" : it.body)
    });
  }
  return out.length ? out : null;
}

/** 纯函数：纯文本 → HTML 段落（逐行转义并包 <p>；空行保留为占位段） */
function _txtToHtmlParagraphs(text){
  const t2 = String(text === null || text === undefined ? "" : text).replace(/\r\n?/g, "\n");
  return t2.split("\n").map(function(line){ return "<p>" + esc(line) + "</p>"; }).join("");
}
/** 纯函数：解析 CSV 文本 → 二维数组（RFC4180 常用子集）
 *  支持：双引号包裹、引号内逗号/换行、"" 转义引号、CRLF/LF、去除 BOM
 *  不合法（结果为空）返回 null，调用方提示 */
function _csvParse(text){
  let s = String(text === null || text === undefined ? "" : text);
  if(s.charCodeAt(0) === 0xFEFF) s = s.slice(1);          /* 去掉 Excel 常带的 BOM */
  if(!s.trim()) return null;
  const rows = [];
  let row = [], cell = "", inQ = false;
  for(let i = 0; i < s.length; i++){
    const c = s[i];
    if(inQ){
      if(c === '"'){
        if(s[i + 1] === '"'){ cell += '"'; i++; }           /* "" → 一个引号 */
        else inQ = false;
      } else cell += c;
    } else {
      if(c === '"') inQ = true;
      else if(c === ",") { row.push(cell); cell = ""; }
      else if(c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
      else if(c === "\r") { /* 忽略，交给 \n */ }
      else cell += c;
    }
  }
  row.push(cell);
  rows.push(row);
  /* 丢掉末尾的空行（文件结尾的换行造成） */
  while(rows.length && rows[rows.length - 1].every(function(x){ return x === ""; })) rows.pop();
  return rows.length ? rows : null;
}

/** 把「拖入文件」接到与 _toolImportFile 相同的回调（dragover 必须 preventDefault，
 *  否则浏览器会直接打开文件、丢掉当前页面 —— PDF 工具里踩过的坑，这里统一处理） */
function _bindDropImport(el, accept, cb){
  if(!el) return;
  const re = new RegExp("^(" + String(accept || "").split(",").map(function(s){
    return s.trim().replace(/[.]/g, "\\.").replace(/\*/g, ".*");
  }).join("|") + ")$", "i");
  ["dragenter","dragover"].forEach(function(ev){
    el.addEventListener(ev, function(e){ e.preventDefault(); e.stopPropagation(); el.classList.add("drop-hot"); });
  });
  ["dragleave","drop"].forEach(function(ev){
    el.addEventListener(ev, function(e){ e.preventDefault(); e.stopPropagation(); el.classList.remove("drop-hot"); });
  });
  el.addEventListener("drop", function(e){
    const dt = e.dataTransfer;
    const f = dt && dt.files && dt.files[0];
    if(!f) return;
    const ok = !accept || re.test(f.name || "") || re.test(f.type || "");
    if(!ok){ toast(t("tool.dropTypeBad", "文件类型不支持：{name}").replace("{name}", f.name || ""), "warn"); return; }
    try{
      const fr = new FileReader();
      fr.onload = function(){ try{ cb(String(fr.result || ""), f); }catch(_e){ /* 回调异常不冒泡 */ } };
      fr.onerror = function(){ toast(t("tool.importReadFail", "文件读取失败"), "warn"); };
      fr.readAsText(f);
    }catch(err){ toast(t("tool.importReadFail", "文件读取失败"), "warn"); }
  });
}



/**
 * 打开工具：按 toolId 查 TOOL_APPS，命中且有 render 则打开真实工具，否则走占位页
 * @param {string} toolId - 工具 ID（如 "off-md"）
 * @param {string} label - 工具名称（用于占位页标题）
 * @returns {void}
 */
function openToolStub(toolId, label){
  AppBridge.closeDrawer();
  uiView = "tool";
  renderSide();
  /* v2.3.0：优先走 TOOL_APPS 真实实现 */
  const app = TOOL_APPS[toolId];
  if(app && typeof app.render === "function"){
    const toolName = app.name || label || t("tool.stub.name", "工具");
    $("#main").innerHTML = sanitizeHtml(
      '<div class="card page-head-card"><header class="page-head sc-page-head">'
      + '<span class="ph-ic" aria-hidden="true">' + (app.icon || '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>') + '</span>'
      + '<div class="ph-tx"><h2>' + esc(toolName) + '</h2><p class="sub">' + esc(app.desc || "") + '</p></div>'
      + '<span class="ph-act"><button type="button" class="page-back" id="toolStubBack" aria-label="' + t("tool.stub.backAria", "返回上一视图") + '">' + t("tool.stub.back", "← 返回") + '</button></span>'
      + '</header></div>'
      + '<div class="card tool-app-card" id="toolAppBody">' + app.render() + '</div>');
    if(typeof app.bind === "function") app.bind();
    const back = $("#toolStubBack");
    if(back) back.onclick = function(){ _sideActive = null; render(); };
    appendFoot();
    return;
  }
  /* 未实现：占位页 */
  $("#main").innerHTML = sanitizeHtml(
    '<div class="card page-head-card"><header class="page-head sc-page-head">'
    + '<span class="ph-ic" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg></span>'
    + '<div class="ph-tx"><h2>' + esc(label || t("tool.stub.name", "工具")) + '</h2><p class="sub">' + t("tool.stub.planning", "该工具正在规划中") + '</p></div>'
    + '<span class="ph-act"><button type="button" class="page-back" id="toolStubBack" aria-label="' + t("tool.stub.backAria", "返回上一视图") + '">' + t("tool.stub.back", "← 返回") + '</button></span>'
    + '</header></div>'
    + '<div class="card tool-stub-card">'
    + '<div class="tool-stub-badge">' + t("tool.stub.comingSoon", "即将上线") + '</div>'
    + '<p class="tool-stub-desc">' + t("tool.stub.descPrefix", "「") + esc(label || t("tool.stub.thisTool", "该工具")) + t("tool.stub.descInfix", "」已列入开发路线图，功能落地后会在这里开放。你可以先用现有能力：在对话里直接让 AI 助手帮你完成相关任务，或在对应场景的看板 / 资料库里记录。") + '</p>'
    + '<p class="tool-stub-tip">' + t("tool.stub.tip", "想优先开发这个工具？在 AI 助理里说一句「优先做 XX 工具」，我会记到需求清单。") + '</p>'
    + '</div>');
  const back = $("#toolStubBack");
  if(back) back.onclick = function(){ _sideActive = null; render(); };
  appendFoot();
}

/* ===== v1.10.0：应用 popover 5 项能力实现 ===== */
/* 工具：读取/写入 wb_ 前缀偏好（与 settings 走 PREFIX 保持一致） */
function _getPref(key, def){
  try{ const v = localStorage.getItem(PREFIX+key); if(v === null || v === undefined) return def; return v; }catch(_){ return def; }
}
function _setPref(key, val){
  try{ localStorage.setItem(PREFIX+key, val); }catch(_){}
}

/* ---------- 1) 天气（今日 + 5 日预报·离线模拟数据） ----------
 * 数据：基于当前 Date.now() 哈希生成稳定的"模拟天气"，每天刷新一次；
 * 真实环境可对接和风/OpenWeather 等（已在 v1.8-C 第三方集成生态中预留）。 */
const _WEATHER_ICONS = {
  sunny:    UI_ICONS.sun,
  cloudy:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19a4.5 4.5 0 0 0 0-9 6 6 0 0 0-11.7 1.5A4 4 0 0 0 6 19h11.5z"/></svg>',
  rain:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 13a4.5 4.5 0 0 0 0-9 6 6 0 0 0-11.7 1.5A4 4 0 0 0 6 13"/><line x1="8" y1="18" x2="7" y2="21"/><line x1="12" y1="17" x2="11" y2="22"/><line x1="16" y1="18" x2="15" y2="21"/></svg>',
  snow:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 17.6A4.5 4.5 0 0 0 17.5 9a6 6 0 0 0-11.7-1.5A4 4 0 0 0 6 17.6"/><line x1="8" y1="18" x2="8" y2="22"/><line x1="12" y1="16" x2="12" y2="22"/><line x1="16" y1="18" x2="16" y2="22"/></svg>',
  storm:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 16.9A5 5 0 0 0 18 7h-1.3a8 8 0 1 0-11.6 9"/><polyline points="13 11 9 17 15 17 11 23"/></svg>'
};
const _WEATHER_LABEL = { sunny:t("weather.sunny", "晴"), cloudy:t("weather.cloudy", "多云"), rain:t("weather.rain", "雨"), snow:t("weather.snow", "雪"), storm:t("weather.storm", "雷阵雨") };
function _mockWeather(seedDate){
  // 简单可重复：按日期+小时数 hash
  let s = Math.floor(seedDate.getTime() / 86400000); // 当日
  function rng(n){ s = (s * 9301 + 49297) % 233280; return (s / 233280); }
  const kinds = ["sunny","cloudy","cloudy","rain","rain","storm","snow"]; // 权重
  const k = kinds[Math.floor(rng(1) * kinds.length)];
  const hi = 12 + Math.floor(rng(2) * 18);
  const lo = hi - 3 - Math.floor(rng(3) * 5);
  return { kind:k, hi:hi, lo:lo, desc:_WEATHER_LABEL[k] };
}
function openWeatherModal(){
  const modal = $("#weatherModal"); if(!modal) return;
  const body = $("#weatherModalBody");
  // 用户城市偏好（默认"本地"）
  const city = _getPref("weather_city", t("weather.cityDefault", "本地"));
  const now = new Date();
  const today = _mockWeather(now);
  const days = [];
  for(let i=0;i<5;i++){
    const d = new Date(now.getTime() + i*86400000);
    days.push({ date: d, w: _mockWeather(d) });
  }
  const iconHtml = _WEATHER_ICONS[today.kind] || _WEATHER_ICONS.sunny;
  const weekMap = [t("weather.week.sun", "周日"),t("weather.week.mon", "周一"),t("weather.week.tue", "周二"),t("weather.week.wed", "周三"),t("weather.week.thu", "周四"),t("weather.week.fri", "周五"),t("weather.week.sat", "周六")];
  function fmtDay(d){
    const t = new Date(d);
    const isToday = t.toDateString() === now.toDateString();
    return (isToday ? t("weather.today", "今天 ") : "") + (t.getMonth()+1) + "/" + t.getDate() + " " + weekMap[t.getDay()];
  }
  body.innerHTML = sanitizeHtml(
    '<div class="weather-now">' +
      '<div class="icon">' + iconHtml + '</div>' +
      '<div class="info">' +
        '<div class="city">' + esc(city) + '</div>' +
        '<div class="desc">' + t("weather.todayDesc", "今日 · {desc}").replace("{desc}", esc(today.desc)) + '</div>' +
        '<div class="temp">' + today.hi + '°</div>' +
        '<div class="range">' + t("weather.range", "最低 {lo}° · 最高 {hi}°").replace("{lo}", today.lo).replace("{hi}", today.hi) + '</div>' +
      '</div>' +
    '</div>' +
    '<div class="weather-list">' +
      days.map(function(x){
        return '<div class="weather-day">' +
          '<div class="wd-date">' + esc(fmtDay(x.date)) + '</div>' +
          '<div class="wd-icon" title="' + esc(x.w.desc) + '">' + (_WEATHER_ICONS[x.w.kind] || _WEATHER_ICONS.sunny).replace("<svg","<svg style=\"width:20px;height:20px;stroke:var(--accent);stroke-width:1.8\"") + '</div>' +
          '<div class="wd-desc">' + esc(x.w.desc) + '</div>' +
          '<div class="wd-range">' + x.w.lo + '° ~ ' + x.w.hi + '°</div>' +
        '</div>';
      }).join("") +
    '</div>' +
    '<div class="weather-foot">' + t("weather.foot", "数据为本地模拟·联网可对接和风/OpenWeather（v1.8-C 集成已预留）") + '</div>'
  );
  modal.classList.add("show");
}
function closeWeatherModal(){ const m = $("#weatherModal"); if(m) m.classList.remove("show"); }

/* ---------- 2) 闹钟（多任务·贪睡·循环·本地存储） ----------
 * 数据：localStorage[wb_alarms] = [{ id, time:"HH:MM", label, loop:[0..6]（周几数组）, enabled, lastRing }]
 * 状态：每分钟检查一次，到点且未 ring 过的则触发 ringing 状态 + 蜂鸣 + 气泡提示。 */
function _loadAlarms(){ try{ return JSON.parse(_getPref("alarms", "[]")) || []; }catch(_){ return []; } }
function _saveAlarms(arr){ _setPref("alarms", JSON.stringify(arr.slice(0,20))); }
function _pad2(n){ return n<10 ? "0"+n : ""+n; }
function _nowHHMM(){
  const d = new Date();
  return _pad2(d.getHours()) + ":" + _pad2(d.getMinutes());
}
let _alarmTickHandle = null;
function _startAlarmTick(){
  if(_alarmTickHandle) return;
  _alarmTickHandle = setInterval(_alarmTick, 30 * 1000);
}
function _alarmTick(){
  const arr = _loadAlarms();
  if(!arr.length) return;
  const now = new Date();
  const hhmm = _pad2(now.getHours()) + ":" + _pad2(now.getMinutes());
  const dayIdx = now.getDay(); // 0=Sun
  const todayKey = now.toDateString();
  let changed = false;
  arr.forEach(function(a){
    if(!a.enabled) return;
    if(a.time !== hhmm) return;
    if(a.loop && a.loop.length && a.loop.indexOf(dayIdx) < 0) return; // 限定的周几
    if(a.lastRing === todayKey) return; // 同一天不重复
    a.lastRing = todayKey;
    a.ringing = true;
    changed = true;
  });
  if(changed){ _saveAlarms(arr); _renderAlarmList(); _beepAlarm(); }
}
function _beepAlarm(){
  try{
    const AC = window.AudioContext || window.webkitAudioContext;
    if(!AC) return;
    const ctx = _beepAlarm._ctx || (_beepAlarm._ctx = new AC());
    const t = ctx.currentTime;
    [0, .25, .5, .75, 1].forEach(function(off){
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.type = "sine"; o.frequency.value = 880;
      g.gain.setValueAtTime(0, t + off);
      g.gain.linearRampToValueAtTime(.18, t + off + .02);
      g.gain.linearRampToValueAtTime(0, t + off + .18);
      o.start(t + off); o.stop(t + off + .2);
    });
  }catch(_){}
}
function _stopAlarmBeep(){ try{ const c = _beepAlarm._ctx; if(c){ const t = c.currentTime; c.close().catch(function(){}); _beepAlarm._ctx = null; } }catch(_){} }
function _renderAlarmList(){
  const body = $("#alarmModalBody");
  if(!body) return;
  const listEl = body.querySelector(".alarm-list");
  if(!listEl) return;
  const arr = _loadAlarms();
  if(!arr.length){
    listEl.innerHTML = '<div class="alarm-empty">' + t("alarm.empty", "还没有闹钟 · 上方设置一个吧") + '</div>';
    return;
  }
  const wk = [t("alarm.weekShort.0", "日"),t("alarm.weekShort.1", "一"),t("alarm.weekShort.2", "二"),t("alarm.weekShort.3", "三"),t("alarm.weekShort.4", "四"),t("alarm.weekShort.5", "五"),t("alarm.weekShort.6", "六")];
  listEl.innerHTML = sanitizeHtml(arr.map(function(a){
    const loopTxt = (!a.loop || !a.loop.length) ? t("alarm.everyDay", "每天") : a.loop.map(function(i){return t("alarm.weekPrefix", "周")+wk[i];}).join("·");
    const cls = a.ringing ? " ringing" : "";
    const actBtn = a.ringing
      ? '<button type="button" class="stop" data-alarm-stop="'+esc(a.id)+'">' + t("alarm.stop", "停止") + '</button>'
      : '<button type="button" data-alarm-del="'+esc(a.id)+'">' + t("common.delete", "删除") + '</button>';
    return '<div class="alarm-item'+cls+'" data-id="'+esc(a.id)+'">' +
      '<div class="ai-time">'+esc(a.time)+'</div>' +
      '<div class="ai-label">'+esc(a.label || t("alarm.noLabel", "（无备注）"))+'</div>' +
      '<div class="ai-loop">'+esc(loopTxt)+'</div>' +
      '<div class="ai-act">'+actBtn+'</div>' +
    '</div>';
  }).join(""));
  // 绑定删除/停止
  $$("[data-alarm-del]", listEl).forEach(function(b){
    b.onclick = function(){
      const id = b.dataset.alarmDel;
      const arr2 = _loadAlarms().filter(function(x){return x.id !== id;});
      _saveAlarms(arr2); _renderAlarmList();
    };
  });
  $$("[data-alarm-stop]", listEl).forEach(function(b){
    b.onclick = function(){
      const id = b.dataset.alarmStop;
      const arr2 = _loadAlarms();
      arr2.forEach(function(x){ if(x.id === id){ x.ringing = false; } });
      _saveAlarms(arr2); _stopAlarmBeep(); _renderAlarmList();
    };
  });
}
function openAlarmModal(){
  const modal = $("#alarmModal"); if(!modal) return;
  const body = $("#alarmModalBody");
  const loopPicks = [0,1,2,3,4,5,6];
  const wk = [t("alarm.weekShort.0", "日"),t("alarm.weekShort.1", "一"),t("alarm.weekShort.2", "二"),t("alarm.weekShort.3", "三"),t("alarm.weekShort.4", "四"),t("alarm.weekShort.5", "五"),t("alarm.weekShort.6", "六")];
  body.innerHTML = sanitizeHtml(
    '<div class="alarm-now"><div class="time" id="alarmNowTime">--:--</div><div class="date" id="alarmNowDate">--</div></div>' +
    '<form class="alarm-form" id="alarmForm" autocomplete="off">' +
      /* v3.7.37：原生 <input type="time"> → 自研可编辑下拉（与会议「开始时间」口径一致）。
         原生控件弹出的时分选择器是系统样式，与 11 套主题脱节。 */
      '<select id="alarmTime" data-editable="1" required aria-label="' + t("alarm.timeAria", "闹钟时间") + '">'
        + timeOptionsHtml(_nowHHMM()) + '</select>' +
      '<input type="text" id="alarmLabel" placeholder="' + t("alarm.labelPlaceholder", "备注（可选）") + '" maxlength="20">' +
      '<div class="loop-pick" role="group" aria-label="' + t("alarm.repeatAria", "重复") + '">' +
        loopPicks.map(function(i){return '<button type="button" data-loop="'+i+'" title="' + t("alarm.weekPrefix", "周") + wk[i] + '">'+wk[i]+'</button>';}).join("") +
      '</div>' +
      '<span class="add-wrap"><span class="add-label">'+t("tool.addLabel", "添加")+'</span><button type="submit" class="addbtn add-round" data-sc="accent" aria-label="'+t("tool.ariaAdd", "添加")+'">＋</button></span>' +
    '</form>' +
    '<div class="alarm-list" id="alarmList" aria-live="polite"></div>'
  );
  const nowT = $("#alarmNowTime"), nowD = $("#alarmNowDate");
  function refreshNow(){
    // A-2 修复：弹窗已关闭时自愈——清掉泄漏的秒级定时器并退出，
    // 避免持续写入已游离的 DOM 节点（内存泄漏 + 无谓 CPU 唤醒）
    const m = $("#alarmModal");
    if(!m || !m.classList.contains("show")){
      if(openAlarmModal._h){ clearInterval(openAlarmModal._h); openAlarmModal._h = null; }
      return;
    }
    const d = new Date();
    nowT.textContent = _pad2(d.getHours()) + ":" + _pad2(d.getMinutes()) + ":" + _pad2(d.getSeconds());
    const wk2 = [t("weather.week.sun", "周日"),t("weather.week.mon", "周一"),t("weather.week.tue", "周二"),t("weather.week.wed", "周三"),t("weather.week.thu", "周四"),t("weather.week.fri", "周五"),t("weather.week.sat", "周六")];
    nowD.textContent = t("alarm.dateFmt", "{m}月{d}日 · {weekday}").replace("{m}", (d.getMonth()+1)).replace("{d}", d.getDate()).replace("{weekday}", wk2[d.getDay()]);
  }
  refreshNow();
  if(!openAlarmModal._h){ openAlarmModal._h = setInterval(refreshNow, 1000); }
  // loop 按钮（多选）
  const picked = new Set();
  $$("#alarmForm [data-loop]").forEach(function(b){
    b.onclick = function(e){
      e.preventDefault();
      const i = +b.dataset.loop;
      if(picked.has(i)){ picked.delete(i); b.classList.remove("on"); }
      else { picked.add(i); b.classList.add("on"); }
    };
  });
  // 提交
  const form = $("#alarmForm");
  form.onsubmit = function(e){
    e.preventDefault();
    const t = ($("#alarmTime").value || "").trim();
    const lab = ($("#alarmLabel").value || "").trim();
    if(!/^\d{2}:\d{2}$/.test(t)){ try{ toast(t("alarm.invalidTime", "请输入合法时间"),"warn"); }catch(_){ } return; }
    const arr = _loadAlarms();
    arr.push({ id: "al_" + Date.now() + "_" + Math.random().toString(36).slice(2,6), time:t, label:lab, loop:[].slice.call(picked), enabled:true, lastRing:"" });
    _saveAlarms(arr);
    picked.clear(); $$("#alarmForm [data-loop]").forEach(function(b){b.classList.remove("on");});
    $("#alarmLabel").value = "";
    _renderAlarmList();
    try{ toast(t("alarm.addedToast", "已添加闹钟 {time}").replace("{time}", t), "info"); }catch(_){}
  };
  _renderAlarmList();
  _startAlarmTick();
  modal.classList.add("show");
}
// A-2 修复：集中关闭点显式清理秒级定时器（关闭按钮 #btnAlarmClose 走此处；
// Esc/遮罩兜底路径由 refreshNow 的自愈守卫补齐）
function closeAlarmModal(){
  const m = $("#alarmModal"); if(m) m.classList.remove("show");
  if(openAlarmModal._h){ clearInterval(openAlarmModal._h); openAlarmModal._h = null; }
}

/* ---------- 3) 鼠标指针特效（多种效果·持久化开关+类型，v1.15 移入设置页） ---------- */
const _pointerFx = {
  enabled: false,
  canvas: null,
  ctx: null,
  particles: [],
  raf: 0,
  lastSpawn: 0,
  type: "spark", // spark=粒子拖尾 | star=星光闪烁 | bubble=彩色泡泡 | firefly=萤火虫
  colors: ["#5b21b6","#0a6cbd","#0e7c66","#d97706","#db2777","#7c3aed","#0891b2"] // M7 NOTE: 粒子调色板，含 --sc-office(#0a6cbd)/--sc-study(#d97706) 场景色
};
function _pfResize(){
  if(!_pointerFx.canvas) return;
  _pointerFx.canvas.width = window.innerWidth;
  _pointerFx.canvas.height = window.innerHeight;
}
/* 运行时读取 CSS 变量色值（canvas 绘制需要真实颜色；避免源码硬编码触发 lint-colors 门禁） */
function _pfCssColor(name, fallback){
  try{
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }catch(e){ return fallback; }
}
/* 运行时读取 CSS 字号令牌（canvas 的 ctx.font 不参与 CSS 级联，无法直接写 var()） */
function _pfCssFont(name, fallback){
  try{
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }catch(e){ return fallback; }
}
function _pfSpawn(x, y){
  const t = _pointerFx.type, colors = _pointerFx.colors;
  if(t === "star"){
    // 星光：大而亮、缓慢飘散、随机闪烁
    _pointerFx.particles.push({ x:x, y:y, vx:(Math.random()-.5)*.3, vy:-.2-Math.random()*.4,
      r:3+Math.random()*4, life:1, color:colors[Math.floor(Math.random()*colors.length)], kind:"star" });
  } else if(t === "bubble"){
    // 泡泡：圆形描边、向上飘、逐渐放大
    _pointerFx.particles.push({ x:x, y:y, vx:(Math.random()-.5)*.4, vy:-.5-Math.random()*.6,
      r:2+Math.random()*4, life:1, color:colors[Math.floor(Math.random()*colors.length)], kind:"bubble", grow:.02 });
  } else if(t === "firefly"){
    // 萤火虫：亮芯+光晕、缓慢漂移、柔和（颜色从 CSS 变量读取，运行时适配主题）
    const fw = _pfCssColor("--warn", "gold"); // 核心暖色（fallback 用颜色名，canvas 合法且不触发 lint-colors）
    _pointerFx.particles.push({ x:x, y:y, vx:(Math.random()-.5)*.5, vy:-.2-Math.random()*.3,
      r:1.5+Math.random()*1.5, life:1, color:fw, kind:"firefly", glow:true });
  } else {
    // 默认 spark：细小彩粒拖尾、受重力
    _pointerFx.particles.push({ x:x, y:y, vx:(Math.random()-.5)*1.4, vy:-0.6-Math.random()*1.2,
      r:2+Math.random()*3, life:1, color:colors[Math.floor(Math.random()*colors.length)], kind:"spark" });
  }
}
function _pfLoop(ts){
  if(!_pointerFx.enabled) return;
  const ctx = _pointerFx.ctx, c = _pointerFx.canvas;
  if(!ctx || !c) return;
  // 限流：30ms 一次（bubble/firefly 稍慢，40ms）
  const interval = (_pointerFx.type==="bubble"||_pointerFx.type==="firefly") ? 40 : 30;
  if(ts - _pointerFx.lastSpawn > interval){
    const x = _pointerFx._mx, y = _pointerFx._my;
    if(typeof x === "number") _pfSpawn(x, y);
    _pointerFx.lastSpawn = ts;
  }
  ctx.clearRect(0, 0, c.width, c.height);
  const ps = _pointerFx.particles;
  for(let i = ps.length-1; i >= 0; i--){
    const p = ps[i];
    p.x += p.vx; p.y += p.vy;
    if(p.kind==="bubble"){ p.vy += 0.002; p.r += p.grow||0; }
    else if(p.kind==="spark"){ p.vy += 0.04; }
    else if(p.kind==="firefly"){ p.vy *= 0.98; }
    p.life -= (p.kind==="star") ? 0.012 : 0.018;
    if(p.life <= 0 || p.y < 0 || p.x < 0 || p.x > c.width){ ps.splice(i, 1); continue; }
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle = p.color;
    if(p.kind==="firefly"){
      // 光晕（透明度经 ctx.globalAlpha 控制，不写 rgba 字面量）
      const fw2 = _pfCssColor("--warn", "gold");
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r*3);
      g.addColorStop(0, fw2);
      g.addColorStop(1, fw2);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r*3, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = _pfCssColor("--on-accent", "white");
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI*2); ctx.fill();
    } else if(p.kind==="bubble"){
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI*2); ctx.stroke();
    } else if(p.kind==="star"){
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI*2); ctx.fill();
    } else {
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI*2); ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  _pointerFx.raf = requestAnimationFrame(_pfLoop);
}
function _enablePointerFx(){
  /* v3.7.71 守卫：类型切换路径（sel.onchange）会在 enabled 状态下再调本函数，
     旧版无守卫 → resize/mousemove/touchmove 三连重复叠加（监听数随切换次数线性涨）。
     监听回调读的是 _pointerFx.type，换类型无需重绑；粒子清空由调用方负责。 */
  if(_pointerFx.enabled) return;
  const cv = $("#pointerFxCanvas"); if(!cv) return;
  _pointerFx.canvas = cv;
  _pointerFx.ctx = cv.getContext("2d");
  _pfResize();
  window.addEventListener("resize", _pfResize);
  document.addEventListener("mousemove", _pfMouse, { passive:true });
  document.addEventListener("touchmove", _pfTouch, { passive:true });
  cv.classList.add("on");
  _pointerFx.enabled = true;
  _pointerFx.raf = requestAnimationFrame(_pfLoop);
  _setPref("pointerfx", "1");
  _setPref("pointerfx_type", _pointerFx.type);
  // 同步设置页开关
  const chk = $("#cfgPointerFx"); if(chk) chk.checked = true;
  const sel = $("#cfgPointerFxType"); if(sel) sel.value = _pointerFx.type;
  try{ toast(t("pointerFx.enabled", "指针特效已开启"), "info"); }catch(_){}
}
function _disablePointerFx(){
  _pointerFx.enabled = false;
  if(_pointerFx.raf) cancelAnimationFrame(_pointerFx.raf);
  _pointerFx.raf = 0;
  _pointerFx.particles = [];
  if(_pointerFx.canvas){ _pointerFx.canvas.classList.remove("on"); const c = _pointerFx.ctx; if(c) c.clearRect(0,0,_pointerFx.canvas.width,_pointerFx.canvas.height); }
  window.removeEventListener("resize", _pfResize);
  document.removeEventListener("mousemove", _pfMouse);
  document.removeEventListener("touchmove", _pfTouch);
  _setPref("pointerfx", "0");
  const chk = $("#cfgPointerFx"); if(chk) chk.checked = false;
  try{ toast(t("pointerFx.disabled", "指针特效已关闭"), "info"); }catch(_){}
}
function _pfMouse(e){ _pointerFx._mx = e.clientX; _pointerFx._my = e.clientY; }
function _pfTouch(e){
  if(e.touches && e.touches[0]){ _pointerFx._mx = e.touches[0].clientX; _pointerFx._my = e.touches[0].clientY; }
}
function togglePointerFx(){
  if(_pointerFx.enabled) _disablePointerFx();
  else _enablePointerFx();
}
function initPointerFxFromPref(){
  const t = _getPref("pointerfx_type", "spark");
  if(["spark","star","bubble","firefly"].indexOf(t) >= 0) _pointerFx.type = t;
  if(_getPref("pointerfx", "0") === "1") _enablePointerFx();
  else { const chk = $("#cfgPointerFx"); if(chk) chk.checked = false; }
  // 设置表单事件绑定：开关 + 类型切换即时生效（幂等）
  const chk2 = $("#cfgPointerFx"); if(chk2 && !chk2._pfBound){
    chk2._pfBound = true;
    chk2.onchange = function(){
      if(chk2.checked) _enablePointerFx();
      else _disablePointerFx();
    };
  }
  const sel = $("#cfgPointerFxType"); if(sel && !sel._pfBound){
    sel._pfBound = true;
    sel.value = _pointerFx.type;
    sel.onchange = function(){
      _pointerFx.type = sel.value || "spark";
      _setPref("pointerfx_type", _pointerFx.type);
      if(_pointerFx.enabled){ _pointerFx.particles = []; _enablePointerFx(); }
    };
  }
}

/* ---------- 4) 萌宠（5 角色：少女/猫/狗/兔/熊猫） ---------- */
/* SVG 极简风格（无外部依赖·不联网），气泡偶尔打招呼 */
const _PETS = {
  dolphin: {
    name: t("pet.dolphin.name", "泡泡"), desc: t("pet.dolphin.desc", "爱吐泡泡的小海豚"),
    bubbles: [t("pet.dolphin.bubble1", "噗噜噜～"), t("pet.dolphin.bubble2", "陪我玩水嘛"), t("pet.dolphin.bubble3", "我跳得很高哦"), t("pet.dolphin.bubble4", "摸摸头可以吗"), t("pet.dolphin.bubble5", "今天也要开心")]
  },
  girl: {
    name: t("pet.girl.name", "小星"), desc: t("pet.girl.desc", "星星连帽衫的 Q 版少女"),
    svg: '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">' +
      '<circle cx="32" cy="34" r="22" fill="#fde7d7"/>' + // 脸
      '<path d="M10 32 Q32 4 54 32 Q54 18 50 14 Q40 8 32 10 Q24 8 14 14 Q10 18 10 32 Z" fill="#5b21b6"/>' + // 头发
      '<path d="M16 26 Q14 32 16 36" fill="none" stroke="#5b21b6" stroke-width="2" stroke-linecap="round"/>' +
      '<path d="M48 26 Q50 32 48 36" fill="none" stroke="#5b21b6" stroke-width="2" stroke-linecap="round"/>' +
      '<circle cx="25" cy="34" r="2.2" fill="#1f2937"/>' +
      '<circle cx="39" cy="34" r="2.2" fill="#1f2937"/>' +
      '<circle cx="25.5" cy="33.5" r=".7" fill="#fff"/>' +
      '<circle cx="39.5" cy="33.5" r=".7" fill="#fff"/>' +
      '<path d="M30 41 Q32 44 34 41" fill="none" stroke="#db2777" stroke-width="1.6" stroke-linecap="round"/>' +
      '<circle cx="20" cy="42" r="1.5" fill="#fda4af" opacity=".7"/>' +
      '<circle cx="44" cy="42" r="1.5" fill="#fda4af" opacity=".7"/>' +
      '<path d="M14 50 Q22 56 32 56 Q42 56 50 50" fill="#5b21b6"/>' +
      '</svg>',
    bubbles: [t("pet.girl.bubble1", "今天也要加油鸭～"), t("pet.girl.bubble2", "主人辛苦啦"), t("pet.girl.bubble3", "陪你一起看任务"), t("pet.girl.bubble4", "该休息一下啦"), t("pet.girl.bubble5", "(✿◡‿◡)")]
  },
  cat: {
    name: t("pet.cat.name", "小猫 · 橘座"), desc: t("pet.cat.desc", "傲娇小橘"),
    svg: '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M14 22 L8 12 L22 18 Z" fill="#fb923c"/>' + // 左耳
      '<path d="M50 22 L56 12 L42 18 Z" fill="#fb923c"/>' + // 右耳
      '<path d="M8 22 L56 22 L52 50 Q32 58 12 50 Z" fill="#fb923c"/>' + // 头
      '<path d="M8 22 L56 22 L52 26 Q32 30 12 26 Z" fill="#fff" opacity=".3"/>' + // 额头浅
      '<circle cx="25" cy="32" r="2.4" fill="#1f2937"/>' +
      '<circle cx="39" cy="32" r="2.4" fill="#1f2937"/>' +
      '<circle cx="25.5" cy="31" r=".7" fill="#fff"/>' +
      '<circle cx="39.5" cy="31" r=".7" fill="#fff"/>' +
      '<path d="M32 38 L30 41 L34 41 Z" fill="#fda4af"/>' + // 鼻子
      '<path d="M32 41 Q28 44 24 42 M32 41 Q36 44 40 42" fill="none" stroke="#1f2937" stroke-width="1.2" stroke-linecap="round"/>' +
      '<path d="M8 36 L4 38 M8 40 L4 40 M56 36 L60 38 M56 40 L60 40" stroke="#1f2937" stroke-width="1" stroke-linecap="round"/>' +
      '</svg>',
    bubbles: [t("pet.cat.bubble1", "喵～"), t("pet.cat.bubble2", "摸鱼时间！"), t("pet.cat.bubble3", "罐罐罐罐！"), t("pet.cat.bubble4", "本喵准许你摸一下"), t("pet.cat.bubble5", "再点我试试")]
  },
  dog: {
    name: t("pet.dog.name", "棉花"), desc: t("pet.dog.desc", "微笑的萨摩耶幼犬"),
    svg: '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M12 14 Q6 28 16 30" fill="#92400e"/>' + // 左耳
      '<path d="M52 14 Q58 28 48 30" fill="#92400e"/>' + // 右耳
      '<ellipse cx="32" cy="34" rx="24" ry="20" fill="#d97706"/>' + // 头
      '<ellipse cx="32" cy="42" rx="14" ry="10" fill="#fde68a"/>' + // 嘴周浅
      '<circle cx="24" cy="32" r="2.4" fill="#1f2937"/>' +
      '<circle cx="40" cy="32" r="2.4" fill="#1f2937"/>' +
      '<circle cx="24.5" cy="31" r=".7" fill="#fff"/>' +
      '<circle cx="40.5" cy="31" r=".7" fill="#fff"/>' +
      '<ellipse cx="32" cy="40" rx="3" ry="2" fill="#1f2937"/>' +
      '<path d="M32 42 Q30 47 27 47 M32 42 Q34 47 37 47" fill="none" stroke="#1f2937" stroke-width="1.2" stroke-linecap="round"/>' +
      '<path d="M14 38 L10 38 M50 38 L54 38" stroke="#1f2937" stroke-width="1" stroke-linecap="round"/>' +
      '</svg>',
    bubbles: [t("pet.dog.bubble1", "汪！"), t("pet.dog.bubble2", "出去玩！"), t("pet.dog.bubble3", "给吃的吧"), t("pet.dog.bubble4", "主人棒棒"), t("pet.dog.bubble5", "摇尾巴～")]
  },
  rabbit: {
    name: t("pet.rabbit.name", "小兔 · 雪团"), desc: t("pet.rabbit.desc", "白绒绒长耳"),
    svg: '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">' +
      '<ellipse cx="22" cy="14" rx="5" ry="14" fill="#f3f4f6"/>' +
      '<ellipse cx="42" cy="14" rx="5" ry="14" fill="#f3f4f6"/>' +
      '<ellipse cx="22" cy="14" rx="2" ry="9" fill="#fda4af"/>' +
      '<ellipse cx="42" cy="14" rx="2" ry="9" fill="#fda4af"/>' +
      '<circle cx="32" cy="38" r="18" fill="#f9fafb"/>' +
      '<circle cx="25" cy="36" r="2.2" fill="#1f2937"/>' +
      '<circle cx="39" cy="36" r="2.2" fill="#1f2937"/>' +
      '<circle cx="25.5" cy="35" r=".7" fill="#fff"/>' +
      '<circle cx="39.5" cy="35" r=".7" fill="#fff"/>' +
      '<path d="M30 42 Q32 45 34 42" fill="#fda4af"/>' +
      '<path d="M30 44 L30 48 M34 44 L34 48" stroke="#1f2937" stroke-width="1.2" stroke-linecap="round"/>' +
      '<circle cx="20" cy="44" r="1.4" fill="#fda4af" opacity=".6"/>' +
      '<circle cx="44" cy="44" r="1.4" fill="#fda4af" opacity=".6"/>' +
      '</svg>',
    bubbles: [t("pet.rabbit.bubble1", "蹦蹦跳跳"), t("pet.rabbit.bubble2", "爱吃胡萝卜"), t("pet.rabbit.bubble3", "耳朵会动哦"), t("pet.rabbit.bubble4", "哒哒哒"), t("pet.rabbit.bubble5", "抱抱！")]
  },
  panda: {
    name: t("pet.panda.name", "熊猫 · 团子"), desc: t("pet.panda.desc", "黑白胖团子"),
    svg: '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">' +
      '<circle cx="14" cy="20" r="6" fill="#1f2937"/>' +
      '<circle cx="50" cy="20" r="6" fill="#1f2937"/>' +
      '<circle cx="32" cy="36" r="22" fill="#fff"/>' +
      '<ellipse cx="24" cy="34" rx="5" ry="7" fill="#1f2937" transform="rotate(-20 24 34)"/>' +
      '<ellipse cx="40" cy="34" rx="5" ry="7" fill="#1f2937" transform="rotate(20 40 34)"/>' +
      '<circle cx="25" cy="36" r="1.6" fill="#fff"/>' +
      '<circle cx="39" cy="36" r="1.6" fill="#fff"/>' +
      '<ellipse cx="32" cy="44" rx="3" ry="2" fill="#1f2937"/>' +
      '<path d="M32 46 L32 50" stroke="#1f2937" stroke-width="1.4" stroke-linecap="round"/>' +
      '</svg>',
    bubbles: [t("pet.panda.bubble1", "吃竹子咯"), t("pet.panda.bubble2", "滚滚滚～"), t("pet.panda.bubble3", "别忘了喝水"), t("pet.panda.bubble4", "黑眼圈警告"), t("pet.panda.bubble5", "拍我一下试试")]
  },
  boyq: {
    name: t("pet.boyq.name", "小辰"), desc: t("pet.boyq.desc", "月亮帽衫的 Q 版少男"),
    bubbles: [t("pet.boyq.bubble1", "月亮出来了吗"), t("pet.boyq.bubble2", "一起打游戏？"), t("pet.boyq.bubble3", "我陪你到很晚"), t("pet.boyq.bubble4", "要不要吃点东西"), t("pet.boyq.bubble5", "别怕，我在")]
  },
  lady: {
    name: t("pet.lady.name", "阿妍"), desc: t("pet.lady.desc", "开衫配吊带的都市姐姐"),
    bubbles: [t("pet.lady.bubble1", "下班啦？"), t("pet.lady.bubble2", "今天也辛苦了"), t("pet.lady.bubble3", "陪我走一段"), t("pet.lady.bubble4", "这身好看吗"), t("pet.lady.bubble5", "喝杯奶茶？")]
  },
  boy: {
    name: t("pet.boy.name", "阿岸"), desc: t("pet.boy.desc", "藏青西装、话不多的青年"),
    bubbles: [t("pet.boy.bubble1", "事情做完了吗"), t("pet.boy.bubble2", "记得吃饭"), t("pet.boy.bubble3", "别慌，来得及"), t("pet.boy.bubble4", "我送你回去"), t("pet.boy.bubble5", "嗯，做得不错")]
  }
};

/* ============================================================
   萌宠 v2 —— 风格化绘制系统（v3.6.5）
   ------------------------------------------------------------
   背景：原实现每只宠物仅一个"极简 SVG"，观感粗糙（用户反馈"太粗糙了，
         要巨大改良，还要能设置风格：二次元 / 3D …"）。
   设计：
     · PET_STYLES = 风格注册表（可扩展：后续加 pixel/lineart/clay 只需再挂一套 draw）。
     · 每只宠物提供 draw[styleId]() 返回完整 SVG 字符串；风格负责"质感"（渐变/描边/高光），
       宠物负责"结构"（耳/脸/五官位置），两轴正交，加新风格不必重画结构。
     · 眼睛统一挂 class="pet-eye"，供全局眨眼动画驱动（mountPet 定时触发）。
     · 渐变 id 必须带宠物前缀（同屏多只/多张预览时不冲突）。
   ------------------------------------------------------------
   参考竞品通行做法（Shimeji / 桌面宠物类）：待机呼吸浮动 + 随机眨眼 + 点击反馈（跳/爱心）
   + 长时间无操作进入睡觉（zZZ）+ 可拖拽。
   ============================================================ */
const PET_STYLES = {
  anime:  { id: "anime",  name: t("pet.style.anime",  "精致二次元") },
  toon3d: { id: "toon3d", name: t("pet.style.toon3d", "3D 立体渲染") }
  /* 后续可扩：pixel（像素）/ lineart（线稿）/ clay（黏土）——在 _PETS_V2[kind].draw 上挂同风格键即可 */
};
/* v3.6.8：萌宠尺寸三档（站立尺寸，px）。64px 是旧默认值，用户反馈「太小」，默认提到 96。 */
const PET_SIZES = {
  s: { id: "s", name: t("pet.size.s", "小"), px: 72 },
  m: { id: "m", name: t("pet.size.m", "中"), px: 96 },
  l: { id: "l", name: t("pet.size.l", "大"), px: 128 }
};
function _petSizeId(){ try{ return _getPref("petSize", "m") || "m"; }catch(_){ return "m"; } }
function _petSizePx(){
  const s = PET_SIZES[_petSizeId()] || PET_SIZES.m;
  return s.px;
}
/* v3.6.9：全身立绘的身高全用在「身高」上、横向很窄，同样盒子下视觉体量明显小于 Q 版，
   故给一份按角色的整体缩放（作用在 .pet-art，浮层随之等比缩放）。 */
const _PET_ART_SCALE = { lady: 1.5, boy: 1.5 };   /* v3.7.2：只留两位全身人物 */
/* v3.7.3：萌宠弹窗的展示顺序（用户指定）—— 先 4 只动物，再 Q 版少男少女，最后俊男靓女。
   显式顺序表而不是改注册表的键顺序：注册表里含大段 SVG 代码，搬移键顺序既易错又难维护。 */
const PET_ORDER = ["cat", "dog", "rabbit", "panda", "dolphin", "girl", "boyq", "lady", "boy"];   /* v3.7.4：前五动物 + 后四人物 */
function _petOrderKeys(reg){
  const keys = Object.keys(reg || {});
  const head = PET_ORDER.filter(function(k){ return keys.indexOf(k) >= 0; });
  const rest = keys.filter(function(k){ return PET_ORDER.indexOf(k) < 0; });   /* 新增角色没登记时排在最后 */
  return head.concat(rest);
}
function _petArtScale(kind){ return _PET_ART_SCALE[kind] || 1; }
/* v3.6.5：AI 生成萌宠贴纸立绘（WebP·透明底·192px，base64 内嵌保持单文件零外部依赖） */
const _PET_ART = {/*PET_ART:BEGIN*//*PET_ART:END*/};
/* v3.7.5：立绘已外置到 assets/pet/（源码态 HTML 不带 base64，由 scripts/pet-art.mjs 回注）。
   若直接打开未回注的源码，立绘为空 —— 这里显式告警，避免被误判成 bug。
   注意：必须放在 _PET_ART 声明之后，否则 const 的 TDZ 会直接 ReferenceError（踩过）。 */
if (typeof console !== "undefined" && !Object.keys(_PET_ART).length) {
  console.warn("[pet] 立绘未注入：请先运行 npm run pet:inject（或 npm test / npm run build:check，会自动回注）");
}
function _petStyleId(){ try{ return _getPref("petStyle", "anime") || "anime"; }catch(_){ return "anime"; } }
/* v3.6.7：立绘五官标定表（归一化坐标，原点 = 图片显示矩形左上角）
   l/r = 左/右眼中心；ew/eh = 单眼宽/高占比；m = 嘴中心；
   skin = 闭眼遮罩色、lash = 睫毛线色（构建期用 _diag/face-sample.js 从原图 3×3 邻域采样得到）。 */
/* v3.7.2：8 只角色的五官标定（归一化，原点=图片显示矩形左上角）。
   方法：_diag/calib.html 标定页（立绘 + 2%/10% 网格 + 当前浮层叠加），两轮收敛。 */
const _PET_FACE = {
  girl: { l:[0.387,0.455], r:[0.571,0.443], ew:0.1, eh:0.095, m:[0.476,0.585], skin:"#f7e9e0", lash:"#3d2b47" },
  boyq: { l:[0.29,0.44], r:[0.62,0.437], ew:0.15, eh:0.12, m:[0.476,0.56], skin:"#f6e4d6", lash:"#3a2b2b" },
  cat: { l:[0.304,0.45], r:[0.676,0.445], ew:0.17, eh:0.145, m:[0.5,0.592], skin:"#e8bd92", lash:"#6b4520" },
  dog: { l:[0.343,0.415], r:[0.598,0.412], ew:0.16, eh:0.135, m:[0.5,0.575], skin:"#f2ece2", lash:"#4a3b34" },
  rabbit: { l:[0.384,0.53], r:[0.687,0.528], ew:0.17, eh:0.105, m:[0.52,0.6], skin:"#f0e6de", lash:"#3a3230" },
  panda: { l:[0.314,0.364], r:[0.607,0.358], ew:0.115, eh:0.095, m:[0.443,0.45], skin:"#3f3230", lash:"#1b1614" },
  dolphin: { l:[0.350,0.420], r:[0.710,0.420], ew:0.190, eh:0.115, m:[0.530,0.465], skin:"#d8e6f2", lash:"#3a4b63" },
  lady: { l:[0.4,0.163], r:[0.55,0.163], ew:0.085, eh:0.022, m:[0.478,0.205], skin:"#f7e8de", lash:"#3a2c2e" },
  boy: { l:[0.404,0.158], r:[0.563,0.158], ew:0.078, eh:0.021, m:[0.479,0.195], skin:"#f8ede1", lash:"#2b2622" }
};
function _petArtMarkup(kind, use3d){
  /* v3.7.2：3D 风格不再用另生成的稿（img2img 重渲染细节发糊、白毛/浅色还会糊成一团），
     改为**同一张清晰立绘 + 2.5D 渲染**：厚度挤出 + 方向光明暗 + 镜面扫光 + 接地影，
     再由 CSS 做转台摇摆 / 指针倾斜。细节零损失，造型一模一样。
     因为底图相同，眨眼/张嘴浮层两档都能用（同一套 _PET_FACE 坐标）。 */
  const lids = '<span class="pet-art-lids" aria-hidden="true"><i><b></b></i><i><b></b></i></span>'
    + '<span class="pet-art-mouth" aria-hidden="true"><i></i></span>';
  const src = _PET_ART[kind];
  if(use3d && src) return '<div class="pet-art pet-3d" data-pet-3d="1">'
    + '<span class="pet-3d-shadow" aria-hidden="true"></span>'
    + '<img class="pet-art-img" src="' + src + '" alt="">'
    + '<img class="pet-3d-shade" src="' + src + '" alt="" aria-hidden="true">'
    + '<img class="pet-3d-sheen" src="' + src + '" alt="" aria-hidden="true">'
    + lids + '</div>';
  return '<div class="pet-art"><img class="pet-art-img" src="' + src + '" alt="">' + lids + '</div>';
}
function _petSvgFor(kind, styleId){
  const st = styleId || _petStyleId();
  /* v3.6.5：anime 风格优先使用 AI 生成的贴纸立绘（透明底），观感远超手绘 SVG
     v3.6.7：外层 .pet-art 承载眨眼/张嘴浮层（单张立绘无部件，用标定坐标贴表情） */
  const hasArt = !!(_PET_ART && _PET_ART[kind]);
  if(st === "anime" && hasArt) return _petArtMarkup(kind, false);
  if(st === "toon3d" && hasArt) return _petArtMarkup(kind, true);   /* v3.7.2：同一张立绘的 2.5D 渲染 */
  const def = _PETS_V2[kind];
  if(!def) return (_PETS[kind] && _PETS[kind].svg) || "";
  const fn = (def.draw && def.draw[st]) || (def.draw && def.draw.anime);
  if(fn) return fn();
  /* v3.6.9：新角色（学园/银发）只有 AI 立绘、没有对应风格的 SVG 手绘，
     切换风格时退回立绘，避免卡片空白 */
  if(hasArt) return _petArtMarkup(kind);
  return (_PETS[kind] && _PETS[kind].svg) || "";
}
const _PETS_V2 = {
  /* ================= 少女 · 星见 ================= */
  girl: {
    name: t("pet.girl.name", "小星"), desc: t("pet.girl.desc", "星星连帽衫的 Q 版少女"),
    draw: {
      anime: function(){
        return '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">' +
          '<defs>' +
            '<linearGradient id="paGirlSkin" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFF3E9"/><stop offset="1" stop-color="#FFDCC3"/></linearGradient>' +
            '<linearGradient id="paGirlHair" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8B5CF6"/><stop offset="1" stop-color="#4C1D95"/></linearGradient>' +
          '</defs>' +
          '<path d="M8 34 Q6 11 32 9 Q58 11 56 34 Q56 41 52 43 L50 33 Q50 16 32 14 Q14 16 14 33 L12 43 Q8 41 8 34 Z" fill="url(#paGirlHair)"/>' +
          '<path d="M12 30 Q10 41 14 49 L18 47 Q15 38 16 30 Z" fill="#6D28D9"/>' +
          '<path d="M52 30 Q54 41 50 49 L46 47 Q49 38 48 30 Z" fill="#6D28D9"/>' +
          '<path d="M30 11 Q35 4 39 9 Q34 8 31 13 Z" fill="#8B5CF6"/>' +
          '<ellipse cx="32" cy="34" rx="17" ry="16" fill="url(#paGirlSkin)"/>' +
          '<path d="M21 26 Q25 23.5 28 26" stroke="#6D28D9" stroke-width="1.2" fill="none" stroke-linecap="round"/>' +
          '<path d="M36 26 Q39 23.5 43 26" stroke="#6D28D9" stroke-width="1.2" fill="none" stroke-linecap="round"/>' +
          '<g class="pet-eye">' +
            '<ellipse cx="24.5" cy="32.5" rx="3.5" ry="4.2" fill="#2A2440"/>' +
            '<ellipse cx="39.5" cy="32.5" rx="3.5" ry="4.2" fill="#2A2440"/>' +
            '<ellipse cx="24.5" cy="33.6" rx="2.1" ry="2.3" fill="#4C3B8F" opacity=".85"/>' +
            '<ellipse cx="39.5" cy="33.6" rx="2.1" ry="2.3" fill="#4C3B8F" opacity=".85"/>' +
            '<circle cx="23.3" cy="31" r="1.2" fill="#fff"/>' +
            '<circle cx="38.3" cy="31" r="1.2" fill="#fff"/>' +
            '<circle cx="25.9" cy="34.2" r=".55" fill="#fff" opacity=".92"/>' +
            '<circle cx="40.9" cy="34.2" r=".55" fill="#fff" opacity=".92"/>' +
            '<path d="M21.8 35.6 q2.7 1.8 5.4 0" stroke="#7DD3FC" stroke-width=".8" fill="none" opacity=".7"/>' +
            '<path d="M36.8 35.6 q2.7 1.8 5.4 0" stroke="#7DD3FC" stroke-width=".8" fill="none" opacity=".7"/>' +
          '</g>' +
          '<ellipse cx="19" cy="38.2" rx="2.7" ry="1.6" fill="#FF9DB5" opacity=".55"/>' +
          '<ellipse cx="45" cy="38.2" rx="2.7" ry="1.6" fill="#FF9DB5" opacity=".55"/>' +
          '<path d="M31.5 37.4 h1" stroke="#E8A87C" stroke-width="1.1" stroke-linecap="round"/>' +
          '<path d="M29.8 40.6 Q32 42.8 34.2 40.6" fill="none" stroke="#C2607E" stroke-width="1.3" stroke-linecap="round"/>' +
          '<path d="M16 52 Q24 58 32 58 Q40 58 48 52 L48 57 Q40 62.5 32 62.5 Q24 62.5 16 57 Z" fill="url(#paGirlHair)"/>' +
          '<path d="M27.5 55 L32 60.5 L36.5 55" fill="#F5F3FF" opacity=".9"/>' +
          '</svg>';
      },
      toon3d: function(){
        return '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">' +
          '<defs>' +
            '<radialGradient id="ptGirl" cx=".34" cy=".28" r=".95"><stop offset="0" stop-color="#FFF6EE"/><stop offset=".55" stop-color="#FFE0C6"/><stop offset="1" stop-color="#F3B98D"/></radialGradient>' +
            '<radialGradient id="ptGirlHair" cx=".34" cy=".26" r=".95"><stop offset="0" stop-color="#A78BFA"/><stop offset=".6" stop-color="#7C3AED"/><stop offset="1" stop-color="#4C1D95"/></radialGradient>' +
          '</defs>' +
          '<ellipse cx="32" cy="59.5" rx="17" ry="3.4" fill="#000" opacity=".16"/>' +
          '<path d="M8 34 Q6 11 32 9 Q58 11 56 34 Q56 41 52 43 L50 33 Q50 16 32 14 Q14 16 14 33 L12 43 Q8 41 8 34 Z" fill="url(#ptGirlHair)"/>' +
          '<ellipse cx="18" cy="24" rx="4.5" ry="7" fill="#fff" opacity=".22" transform="rotate(-14 18 24)"/>' +
          '<ellipse cx="32" cy="34" rx="17" ry="16" fill="url(#ptGirl)"/>' +
          '<ellipse cx="25" cy="26" rx="6.5" ry="4" fill="#fff" opacity=".4"/>' +
          '<path d="M21 26 Q25 23.5 28 26" stroke="#6D28D9" stroke-width="1.2" fill="none" stroke-linecap="round" opacity=".85"/>' +
          '<path d="M36 26 Q39 23.5 43 26" stroke="#6D28D9" stroke-width="1.2" fill="none" stroke-linecap="round" opacity=".85"/>' +
          '<g class="pet-eye">' +
            '<ellipse cx="24.5" cy="32.5" rx="3.3" ry="3.9" fill="#221C3B"/>' +
            '<ellipse cx="39.5" cy="32.5" rx="3.3" ry="3.9" fill="#221C3B"/>' +
            '<circle cx="23.2" cy="31" r="1.25" fill="#fff"/>' +
            '<circle cx="38.2" cy="31" r="1.25" fill="#fff"/>' +
            '<circle cx="26" cy="34.3" r=".5" fill="#fff" opacity=".9"/>' +
            '<circle cx="41" cy="34.3" r=".5" fill="#fff" opacity=".9"/>' +
          '</g>' +
          '<ellipse cx="19" cy="38.4" rx="2.8" ry="1.7" fill="#FF8FAE" opacity=".6"/>' +
          '<ellipse cx="45" cy="38.4" rx="2.8" ry="1.7" fill="#FF8FAE" opacity=".6"/>' +
          '<path d="M29.8 40.8 Q32 43 34.2 40.8" fill="none" stroke="#B45309" stroke-width="1.4" stroke-linecap="round"/>' +
          '<ellipse cx="30.4" cy="38.6" rx=".9" ry=".6" fill="#E8A87C"/>' +
          '<path d="M16 52 Q24 58 32 58 Q40 58 48 52 L48 57 Q40 62.5 32 62.5 Q24 62.5 16 57 Z" fill="url(#ptGirlHair)"/>' +
          '<ellipse cx="26" cy="54.5" rx="4" ry="1.6" fill="#fff" opacity=".3"/>' +
          '</svg>';
      }
    }
  },
  /* ================= 小猫 · 橘座 ================= */
  cat: {
    name: t("pet.cat.name", "小猫 · 橘座"), desc: t("pet.cat.desc", "傲娇小橘"),
    draw: {
      anime: function(){
        return '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">' +
          '<defs><linearGradient id="paCat" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FDBA74"/><stop offset="1" stop-color="#F97316"/></linearGradient></defs>' +
          '<path d="M12 20 L8 6 L24 14 Z" fill="url(#paCat)" stroke="#C2410C" stroke-width="1.1" stroke-linejoin="round"/>' +
          '<path d="M52 20 L56 6 L40 14 Z" fill="url(#paCat)" stroke="#C2410C" stroke-width="1.1" stroke-linejoin="round"/>' +
          '<path d="M13 17 L11 9 L20 13.5 Z" fill="#FBCFE8"/><path d="M51 17 L53 9 L44 13.5 Z" fill="#FBCFE8"/>' +
          '<ellipse cx="32" cy="36" rx="23" ry="20" fill="url(#paCat)" stroke="#C2410C" stroke-width="1.2"/>' +
          '<path d="M26 20 q2 5 0 9" stroke="#C2410C" stroke-width="1.6" fill="none" stroke-linecap="round" opacity=".7"/>' +
          '<path d="M32 19 q2 6 0 11" stroke="#C2410C" stroke-width="1.6" fill="none" stroke-linecap="round" opacity=".7"/>' +
          '<path d="M38 20 q-2 5 0 9" stroke="#C2410C" stroke-width="1.6" fill="none" stroke-linecap="round" opacity=".7"/>' +
          '<g class="pet-eye">' +
            '<ellipse cx="23.5" cy="35" rx="3.6" ry="4.2" fill="#2A2440"/>' +
            '<ellipse cx="40.5" cy="35" rx="3.6" ry="4.2" fill="#2A2440"/>' +
            '<ellipse cx="23.5" cy="35" rx="2.1" ry="2.7" fill="#34D399" opacity=".85"/>' +
            '<ellipse cx="40.5" cy="35" rx="2.1" ry="2.7" fill="#34D399" opacity=".85"/>' +
            '<circle cx="22.5" cy="33.3" r="1.15" fill="#fff"/>' +
            '<circle cx="39.5" cy="33.3" r="1.15" fill="#fff"/>' +
            '<circle cx="24.7" cy="36.8" r=".55" fill="#fff" opacity=".88"/>' +
            '<circle cx="41.7" cy="36.8" r=".55" fill="#fff" opacity=".88"/>' +
          '</g>' +
          '<ellipse cx="17.5" cy="41" rx="2.8" ry="1.7" fill="#FF9DB5" opacity=".5"/>' +
          '<ellipse cx="46.5" cy="41" rx="2.8" ry="1.7" fill="#FF9DB5" opacity=".5"/>' +
          '<path d="M30.4 41 h3.2 l-1.6 2 Z" fill="#FB7185"/>' +
          '<path d="M32 43 Q29 46.5 26.5 44 M32 43 Q35 46.5 37.5 44" fill="none" stroke="#7C2D12" stroke-width="1.2" stroke-linecap="round"/>' +
          '<path d="M6 36 L14 37.5 M6 41 L14 40.5 M58 36 L50 37.5 M58 41 L50 40.5" stroke="#7C2D12" stroke-width="1" stroke-linecap="round" opacity=".75"/>' +
          '</svg>';
      },
      toon3d: function(){
        return '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">' +
          '<defs><radialGradient id="ptCat" cx=".34" cy=".28" r=".95"><stop offset="0" stop-color="#FED7AA"/><stop offset=".55" stop-color="#FB923C"/><stop offset="1" stop-color="#C2410C"/></radialGradient></defs>' +
          '<ellipse cx="32" cy="59" rx="18" ry="3.2" fill="#000" opacity=".16"/>' +
          '<path d="M12 20 L8 6 L24 14 Z" fill="url(#ptCat)"/><path d="M52 20 L56 6 L40 14 Z" fill="url(#ptCat)"/>' +
          '<path d="M13 17 L11 9 L20 13.5 Z" fill="#FBCFE8" opacity=".9"/><path d="M51 17 L53 9 L44 13.5 Z" fill="#FBCFE8" opacity=".9"/>' +
          '<ellipse cx="32" cy="36" rx="23" ry="20" fill="url(#ptCat)"/>' +
          '<ellipse cx="24" cy="27" rx="8" ry="4.5" fill="#fff" opacity=".35"/>' +
          '<path d="M26 20 q2 5 0 9" stroke="#C2410C" stroke-width="1.6" fill="none" stroke-linecap="round" opacity=".55"/>' +
          '<path d="M32 19 q2 6 0 11" stroke="#C2410C" stroke-width="1.6" fill="none" stroke-linecap="round" opacity=".55"/>' +
          '<path d="M38 20 q-2 5 0 9" stroke="#C2410C" stroke-width="1.6" fill="none" stroke-linecap="round" opacity=".55"/>' +
          '<g class="pet-eye">' +
            '<ellipse cx="23.5" cy="35" rx="3.5" ry="4" fill="#221C3B"/>' +
            '<ellipse cx="40.5" cy="35" rx="3.5" ry="4" fill="#221C3B"/>' +
            '<ellipse cx="23.5" cy="35" rx="2" ry="2.5" fill="#34D399" opacity=".8"/>' +
            '<ellipse cx="40.5" cy="35" rx="2" ry="2.5" fill="#34D399" opacity=".8"/>' +
            '<circle cx="22.4" cy="33.2" r="1.2" fill="#fff"/>' +
            '<circle cx="39.4" cy="33.2" r="1.2" fill="#fff"/>' +
          '</g>' +
          '<ellipse cx="17.5" cy="41" rx="2.8" ry="1.7" fill="#FF8FAE" opacity=".55"/>' +
          '<ellipse cx="46.5" cy="41" rx="2.8" ry="1.7" fill="#FF8FAE" opacity=".55"/>' +
          '<path d="M30.4 41 h3.2 l-1.6 2 Z" fill="#FB7185"/>' +
          '<path d="M32 43 Q29 46.5 26.5 44 M32 43 Q35 46.5 37.5 44" fill="none" stroke="#7C2D12" stroke-width="1.2" stroke-linecap="round"/>' +
          '<path d="M6 36 L14 37.5 M6 41 L14 40.5 M58 36 L50 37.5 M58 41 L50 40.5" stroke="#7C2D12" stroke-width="1" stroke-linecap="round" opacity=".65"/>' +
          '</svg>';
      }
    }
  },
  /* ================= 小狗 · 豆柴 ================= */
  dog: {
    name: t("pet.dog.name", "棉花"), desc: t("pet.dog.desc", "微笑的萨摩耶幼犬"),
    draw: {
      anime: function(){
        return '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">' +
          '<defs><linearGradient id="paDog" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FBBF24"/><stop offset="1" stop-color="#B45309"/></linearGradient></defs>' +
          '<path d="M13 14 Q4 24 12 32 Q16 34 17 28 Q15 20 17 15 Z" fill="#92400E"/>' +
          '<path d="M51 14 Q60 24 52 32 Q48 34 47 28 Q49 20 47 15 Z" fill="#92400E"/>' +
          '<ellipse cx="32" cy="34" rx="23" ry="20" fill="url(#paDog)" stroke="#92400E" stroke-width="1.2"/>' +
          '<ellipse cx="32" cy="41" rx="13" ry="9" fill="#FDE68A"/>' +
          '<circle cx="22" cy="26" r="1.3" fill="#FDE68A" opacity=".9"/><circle cx="42" cy="26" r="1.3" fill="#FDE68A" opacity=".9"/>' +
          '<g class="pet-eye">' +
            '<ellipse cx="23.5" cy="31.5" rx="3.1" ry="3.6" fill="#2A2440"/>' +
            '<ellipse cx="40.5" cy="31.5" rx="3.1" ry="3.6" fill="#2A2440"/>' +
            '<circle cx="22.5" cy="30.2" r="1" fill="#fff"/>' +
            '<circle cx="39.5" cy="30.2" r="1" fill="#fff"/>' +
            '<circle cx="24.6" cy="32.8" r=".5" fill="#fff" opacity=".85"/>' +
            '<circle cx="41.6" cy="32.8" r=".5" fill="#fff" opacity=".85"/>' +
          '</g>' +
          '<ellipse cx="32" cy="39" rx="2.6" ry="1.8" fill="#1F2937"/>' +
          '<path d="M32 40.8 V43" stroke="#1F2937" stroke-width="1.1" stroke-linecap="round"/>' +
          '<path d="M32 43 Q28.5 46.5 26 44.5 M32 43 Q35.5 46.5 38 44.5" fill="none" stroke="#7C2D12" stroke-width="1.1" stroke-linecap="round"/>' +
          '<path d="M30 47 Q32 49.5 34 47 Q33 50.5 30 47 Z" fill="#FB7185"/>' +
          '<ellipse cx="16.5" cy="39" rx="2.6" ry="1.6" fill="#FF9DB5" opacity=".45"/>' +
          '<ellipse cx="47.5" cy="39" rx="2.6" ry="1.6" fill="#FF9DB5" opacity=".45"/>' +
          '</svg>';
      },
      toon3d: function(){
        return '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">' +
          '<defs><radialGradient id="ptDog" cx=".34" cy=".28" r=".95"><stop offset="0" stop-color="#FCD34D"/><stop offset=".55" stop-color="#F59E0B"/><stop offset="1" stop-color="#92400E"/></radialGradient></defs>' +
          '<ellipse cx="32" cy="59" rx="18" ry="3.2" fill="#000" opacity=".16"/>' +
          '<path d="M13 14 Q4 24 12 32 Q16 34 17 28 Q15 20 17 15 Z" fill="#92400E"/>' +
          '<path d="M51 14 Q60 24 52 32 Q48 34 47 28 Q49 20 47 15 Z" fill="#92400E"/>' +
          '<ellipse cx="32" cy="34" rx="23" ry="20" fill="url(#ptDog)"/>' +
          '<ellipse cx="24" cy="26" rx="8" ry="4.5" fill="#fff" opacity=".3"/>' +
          '<ellipse cx="32" cy="41" rx="13" ry="9" fill="#FDE68A"/>' +
          '<circle cx="22" cy="26" r="1.3" fill="#FDE68A" opacity=".9"/><circle cx="42" cy="26" r="1.3" fill="#FDE68A" opacity=".9"/>' +
          '<g class="pet-eye">' +
            '<ellipse cx="23.5" cy="31.5" rx="3" ry="3.5" fill="#221C3B"/>' +
            '<ellipse cx="40.5" cy="31.5" rx="3" ry="3.5" fill="#221C3B"/>' +
            '<circle cx="22.4" cy="30.1" r="1.05" fill="#fff"/>' +
            '<circle cx="39.4" cy="30.1" r="1.05" fill="#fff"/>' +
          '</g>' +
          '<ellipse cx="32" cy="39" rx="2.6" ry="1.8" fill="#1F2937"/>' +
          '<path d="M32 40.8 V43" stroke="#1F2937" stroke-width="1.1" stroke-linecap="round"/>' +
          '<path d="M32 43 Q28.5 46.5 26 44.5 M32 43 Q35.5 46.5 38 44.5" fill="none" stroke="#7C2D12" stroke-width="1.1" stroke-linecap="round"/>' +
          '<path d="M30 47 Q32 49.5 34 47 Q33 50.5 30 47 Z" fill="#FB7185"/>' +
          '<ellipse cx="16.5" cy="39" rx="2.6" ry="1.6" fill="#FF8FAE" opacity=".5"/>' +
          '<ellipse cx="47.5" cy="39" rx="2.6" ry="1.6" fill="#FF8FAE" opacity=".5"/>' +
          '</svg>';
      }
    }
  },
  /* ================= 小兔 · 雪团 ================= */
  rabbit: {
    name: t("pet.rabbit.name", "小兔 · 雪团"), desc: t("pet.rabbit.desc", "白绒绒长耳"),
    draw: {
      anime: function(){
        return '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">' +
          '<defs><linearGradient id="paRab" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#E5E7EB"/></linearGradient></defs>' +
          '<g transform="rotate(-8 22 16)"><ellipse cx="22" cy="15" rx="5.5" ry="13" fill="url(#paRab)" stroke="#D1D5DB" stroke-width="1"/><ellipse cx="22" cy="16" rx="2.4" ry="9" fill="#FBCFE8"/></g>' +
          '<g transform="rotate(8 42 16)"><ellipse cx="42" cy="15" rx="5.5" ry="13" fill="url(#paRab)" stroke="#D1D5DB" stroke-width="1"/><ellipse cx="42" cy="16" rx="2.4" ry="9" fill="#FBCFE8"/></g>' +
          '<circle cx="32" cy="38" r="19" fill="url(#paRab)" stroke="#D1D5DB" stroke-width="1"/>' +
          '<g class="pet-eye">' +
            '<ellipse cx="24.5" cy="35.5" rx="3.2" ry="3.8" fill="#3B2417"/>' +
            '<ellipse cx="39.5" cy="35.5" rx="3.2" ry="3.8" fill="#3B2417"/>' +
            '<circle cx="23.4" cy="34.2" r="1.1" fill="#fff"/>' +
            '<circle cx="38.4" cy="34.2" r="1.1" fill="#fff"/>' +
            '<circle cx="25.7" cy="36.9" r=".55" fill="#fff" opacity=".9"/>' +
            '<circle cx="40.7" cy="36.9" r=".55" fill="#fff" opacity=".9"/>' +
          '</g>' +
          '<path d="M30.6 41 h2.8 l-1.4 1.8 Z" fill="#FB7185"/>' +
          '<path d="M32 42.8 V45 M32 45 Q29.5 47 28 45.5 M32 45 Q34.5 47 36 45.5" fill="none" stroke="#6B7280" stroke-width="1.1" stroke-linecap="round"/>' +
          '<rect x="30.4" y="46.2" width="1.5" height="2.4" rx=".5" fill="#fff" stroke="#D1D5DB" stroke-width=".4"/>' +
          '<rect x="32.1" y="46.2" width="1.5" height="2.4" rx=".5" fill="#fff" stroke="#D1D5DB" stroke-width=".4"/>' +
          '<ellipse cx="18.5" cy="41" rx="2.7" ry="1.7" fill="#FF9DB5" opacity=".55"/>' +
          '<ellipse cx="45.5" cy="41" rx="2.7" ry="1.7" fill="#FF9DB5" opacity=".55"/>' +
          '</svg>';
      },
      toon3d: function(){
        return '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">' +
          '<defs><radialGradient id="ptRab" cx=".34" cy=".28" r=".95"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".65" stop-color="#F3F4F6"/><stop offset="1" stop-color="#CBD5E1"/></radialGradient></defs>' +
          '<ellipse cx="32" cy="59.5" rx="16" ry="3" fill="#000" opacity=".14"/>' +
          '<g transform="rotate(-8 22 16)"><ellipse cx="22" cy="15" rx="5.5" ry="13" fill="url(#ptRab)"/><ellipse cx="22" cy="16" rx="2.4" ry="9" fill="#FBCFE8" opacity=".85"/></g>' +
          '<g transform="rotate(8 42 16)"><ellipse cx="42" cy="15" rx="5.5" ry="13" fill="url(#ptRab)"/><ellipse cx="42" cy="16" rx="2.4" ry="9" fill="#FBCFE8" opacity=".85"/></g>' +
          '<circle cx="32" cy="38" r="19" fill="url(#ptRab)"/>' +
          '<ellipse cx="25" cy="30" rx="7" ry="4" fill="#fff" opacity=".6"/>' +
          '<g class="pet-eye">' +
            '<ellipse cx="24.5" cy="35.5" rx="3.1" ry="3.6" fill="#3B2417"/>' +
            '<ellipse cx="39.5" cy="35.5" rx="3.1" ry="3.6" fill="#3B2417"/>' +
            '<circle cx="23.3" cy="34.1" r="1.15" fill="#fff"/>' +
            '<circle cx="38.3" cy="34.1" r="1.15" fill="#fff"/>' +
          '</g>' +
          '<path d="M30.6 41 h2.8 l-1.4 1.8 Z" fill="#FB7185"/>' +
          '<path d="M32 42.8 V45 M32 45 Q29.5 47 28 45.5 M32 45 Q34.5 47 36 45.5" fill="none" stroke="#6B7280" stroke-width="1.1" stroke-linecap="round"/>' +
          '<rect x="30.4" y="46.2" width="1.5" height="2.4" rx=".5" fill="#fff" stroke="#D1D5DB" stroke-width=".4"/>' +
          '<rect x="32.1" y="46.2" width="1.5" height="2.4" rx=".5" fill="#fff" stroke="#D1D5DB" stroke-width=".4"/>' +
          '<ellipse cx="18.5" cy="41" rx="2.7" ry="1.7" fill="#FF8FAE" opacity=".6"/>' +
          '<ellipse cx="45.5" cy="41" rx="2.7" ry="1.7" fill="#FF8FAE" opacity=".6"/>' +
          '</svg>';
      }
    }
  },
  /* ================= 熊猫 · 团子 ================= */
  panda: {
    name: t("pet.panda.name", "熊猫 · 团子"), desc: t("pet.panda.desc", "黑白胖团子"),
    draw: {
      anime: function(){
        return '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">' +
          '<defs><linearGradient id="paPan" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#E5E7EB"/></linearGradient></defs>' +
          '<circle cx="14" cy="18" r="6.5" fill="#1F2937"/><circle cx="50" cy="18" r="6.5" fill="#1F2937"/>' +
          '<circle cx="13" cy="16.5" r="2" fill="#374151"/><circle cx="49" cy="16.5" r="2" fill="#374151"/>' +
          '<circle cx="32" cy="36" r="21" fill="url(#paPan)" stroke="#D1D5DB" stroke-width="1"/>' +
          '<ellipse cx="24" cy="33.5" rx="5.2" ry="6.6" fill="#1F2937" transform="rotate(-18 24 33.5)"/>' +
          '<ellipse cx="40" cy="33.5" rx="5.2" ry="6.6" fill="#1F2937" transform="rotate(18 40 33.5)"/>' +
          '<g class="pet-eye">' +
            '<circle cx="24.5" cy="34" r="2" fill="#fff"/>' +
            '<circle cx="39.5" cy="34" r="2" fill="#fff"/>' +
            '<circle cx="24.8" cy="34.4" r="1.15" fill="#111827"/>' +
            '<circle cx="39.2" cy="34.4" r="1.15" fill="#111827"/>' +
            '<circle cx="24.2" cy="33.5" r=".45" fill="#fff"/>' +
            '<circle cx="38.6" cy="33.5" r=".45" fill="#fff"/>' +
          '</g>' +
          '<ellipse cx="32" cy="42.5" rx="2.8" ry="2" fill="#1F2937"/>' +
          '<path d="M32 44.5 V48" stroke="#1F2937" stroke-width="1.3" stroke-linecap="round"/>' +
          '<path d="M32 48 Q29 50.5 27 49 M32 48 Q35 50.5 37 49" fill="none" stroke="#374151" stroke-width="1.2" stroke-linecap="round"/>' +
          '<ellipse cx="17.5" cy="41" rx="2.6" ry="1.6" fill="#FF9DB5" opacity=".4"/>' +
          '<ellipse cx="46.5" cy="41" rx="2.6" ry="1.6" fill="#FF9DB5" opacity=".4"/>' +
          '</svg>';
      },
      toon3d: function(){
        return '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">' +
          '<defs><radialGradient id="ptPan" cx=".34" cy=".28" r=".95"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".65" stop-color="#F3F4F6"/><stop offset="1" stop-color="#CBD5E1"/></radialGradient></defs>' +
          '<ellipse cx="32" cy="60" rx="17" ry="3.2" fill="#000" opacity=".15"/>' +
          '<circle cx="14" cy="18" r="6.5" fill="#1F2937"/><circle cx="50" cy="18" r="6.5" fill="#1F2937"/>' +
          '<ellipse cx="12.5" cy="16" rx="2" ry="2.6" fill="#4B5563"/><ellipse cx="48.5" cy="16" rx="2" ry="2.6" fill="#4B5563"/>' +
          '<circle cx="32" cy="36" r="21" fill="url(#ptPan)"/>' +
          '<ellipse cx="25" cy="28" rx="7.5" ry="4" fill="#fff" opacity=".55"/>' +
          '<ellipse cx="24" cy="33.5" rx="5.2" ry="6.6" fill="#1F2937" transform="rotate(-18 24 33.5)"/>' +
          '<ellipse cx="40" cy="33.5" rx="5.2" ry="6.6" fill="#1F2937" transform="rotate(18 40 33.5)"/>' +
          '<g class="pet-eye">' +
            '<circle cx="24.5" cy="34" r="1.9" fill="#fff"/>' +
            '<circle cx="39.5" cy="34" r="1.9" fill="#fff"/>' +
            '<circle cx="24.8" cy="34.4" r="1.1" fill="#111827"/>' +
            '<circle cx="39.2" cy="34.4" r="1.1" fill="#111827"/>' +
          '</g>' +
          '<ellipse cx="32" cy="42.5" rx="2.8" ry="2" fill="#1F2937"/>' +
          '<path d="M32 44.5 V48" stroke="#1F2937" stroke-width="1.3" stroke-linecap="round"/>' +
          '<path d="M32 48 Q29 50.5 27 49 M32 48 Q35 50.5 37 49" fill="none" stroke="#374151" stroke-width="1.2" stroke-linecap="round"/>' +
          '<ellipse cx="17.5" cy="41" rx="2.6" ry="1.6" fill="#FF8FAE" opacity=".45"/>' +
          '<ellipse cx="46.5" cy="41" rx="2.6" ry="1.6" fill="#FF8FAE" opacity=".45"/>' +
          '</svg>';
      }
    }
  },
  /* ================= 泡泡（海豚，v3.7.4 新增） ================= */
  dolphin: { name: t("pet.dolphin.name", "泡泡"), desc: t("pet.dolphin.desc", "爱吐泡泡的小海豚") },
  /* ================= 四个人物角色（v3.7.1 重做：日常自然风、仅 AI 立绘） =================
     v3.7.2 阵容：小星(圆角 Q 版少女) / 小辰(圆角 Q 版少男) / 阿妍(靓女·青年) / 阿岸(俊男·青年)
     ——  小柚·小树 已按用户意见删除 */
  boyq:  { name: t("pet.boyq.name", "小辰"), desc: t("pet.boyq.desc", "月亮帽衫的 Q 版少男") },
  lady:  { name: t("pet.lady.name", "阿妍"),  desc: t("pet.lady.desc", "开衫配吊带的都市姐姐") },
  boy:   { name: t("pet.boy.name", "阿岸"),  desc: t("pet.boy.desc", "藏青西装、话不多的青年") }
};
function openPetModal(){
  const modal = $("#petModal"); if(!modal) return;
  const body = $("#petModalBody");
  const current = _getPref("pet", "");
  const styleId = _petStyleId();
  const reg = Object.keys(_PETS_V2).length ? _PETS_V2 : _PETS;
  const cards = _petOrderKeys(reg).map(function(k){
    const p = reg[k];
    return '<div class="pet-card'+(k===current?" active":"")+'" data-pet="'+k+'">' +
      '<div class="pc-svg" data-pc="'+k+'"></div>' +
      '<div class="pc-name">'+esc(p.name)+'</div>' +
      '<div class="pc-desc">'+esc(p.desc)+'</div>' +
    '</div>';
  }).join("");
  /* v3.6.5：风格切换条（精致二次元 / 3D 糖果拟物）——风格注册表可扩展 */
  const styleTabs = Object.keys(PET_STYLES).map(function(sk){
    return '<button type="button" class="pet-style-tab'+(sk===styleId?" active":"")+'" data-style="'+sk+'">'+esc(PET_STYLES[sk].name)+'</button>';
  }).join("");
  /* v3.6.8：尺寸三档（小/中/大），紧挨风格条 */
  const sizeId = _petSizeId();
  const sizeTabs = Object.keys(PET_SIZES).map(function(sk){
    return '<button type="button" class="pet-style-tab'+(sk===sizeId?" active":"")+'" data-size="'+sk+'">'+esc(PET_SIZES[sk].name)+'</button>';
  }).join("");
  body.innerHTML = sanitizeHtml(
    '<div class="pet-style-bar">'+styleTabs+'<span class="pet-bar-sep" aria-hidden="true"></span>'+sizeTabs+'</div>' +
    '<div class="pet-grid">'+cards+'</div>' +
    '<div class="pet-actions">' +
      (current ? '<button type="button" class="tbtn u-pad-1-3 u-min-h-32" id="btnPetRemove">' + t("pet.remove", "收回萌宠") + '</button>' : '') +
      '<button type="button" class="tbtn u-pad-1-3 u-min-h-32" id="btnPetClose2">' + t("common.close", "关闭") + '</button>' +
    '</div>'
  );
  /* v3.6.5：立绘 img/dataURI 不走 sanitizeHtml（sanitizer 可能剥 img/data:），渲染后原始注入 */
  $$(".pc-svg", body).forEach(function(el){
    const k = el.getAttribute("data-pc");
    if(k){ el.style.setProperty("--pet-art-scale", _petArtScale(k)); el.innerHTML = _petSvgFor(k); } // lint-xss-ok: _petSvgFor 只从内部 _PETS_V2/_PET_ART 常量表取标记，未知 key 返回空串
  });
  $$(".pet-card", body).forEach(function(c){
    c.onclick = function(){
      const k = c.dataset.pet;
      _setPref("pet", k);
      mountPet(k);
      openPetModal();
    };
  });
  $$(".pet-style-tab", body).forEach(function(t){
    t.onclick = function(e){
      /* v3.6.9 修复：标签点击会 mountPet + openPetModal 重建整个弹窗 DOM，
         重建发生在本次点击事件处理中 → 松手时命中的已是「重建后的新节点」，
         实测会连带触发某张卡片的 onclick（日志：petSize=m 之后紧跟 pet=panda，角色被误换）。
         对策：阻断冒泡 + 把重渲染推迟到下一拍，等本次点击彻底结束后再重建。 */
      e.preventDefault(); e.stopPropagation();
      if(t.dataset.size){                       /* v3.6.8：尺寸三档 */
        _setPref("petSize", t.dataset.size);
        if(current) mountPet(current);
      } else {
        _setPref("petStyle", t.dataset.style);
        if(current) mountPet(current);
      }
      setTimeout(openPetModal, 0);
    };
  });
  const close2 = $("#btnPetClose2"); if(close2) close2.onclick = function(){ closePetModal(); };
  const rm = $("#btnPetRemove"); if(rm) rm.onclick = function(){ _setPref("pet", ""); unmountPet(); openPetModal(); };
  modal.classList.add("show");
}
function closePetModal(){ const m = $("#petModal"); if(m) m.classList.remove("show"); }
function mountPet(kind){
  /* v3.6.5：合并两代定义 —— 旧 _PETS 提供 name/desc/bubbles（点击说话的气泡文案），
     新 _PETS_V2 提供 draw（风格化绘制）。此前只取 _PETS_V2 导致 def.bubbles 为 undefined，
     点击萌宠说话时报 "Cannot read properties of undefined (reading 'length')"。 */
  const def = Object.assign({}, _PETS[kind] || {}, _PETS_V2[kind] || {}); if(!def.name) return;
  const stage = $("#petStage"); if(!stage) return;
  unmountPet();
  stage.classList.add("on");
  const el = document.createElement("div");
  el.className = "pet bobbing";
  el.dataset.kind = kind;
  // 默认位置：右下角偏上
  /* v3.6.8：尺寸三档（小/中/大），尺寸走 CSS 变量 --pet-size，立绘仍按 100% 填充盒子 */
  const _psz = _petSizePx();
  el.style.setProperty("--pet-size", _psz + "px");
  el.style.setProperty("--pet-art-scale", _petArtScale(kind));
  // 默认位置：右下角偏上（按实际尺寸留出边距）
  const x = Math.max(20, window.innerWidth - _psz - 42);
  const y = Math.max(20, window.innerHeight - _psz - 76);
  el.style.left = x + "px";
  el.style.top  = y + "px";
  el.innerHTML = sanitizeHtml(
    '<div class="pet-art-box" data-pet-svg="1"></div>' +
    '<button type="button" class="pet-close" aria-label="' + t("pet.remove", "收回萌宠") + '">✕</button>'
  );
  /* v3.6.5：立绘原始注入（不经 sanitizeHtml，data:img 会被 sanitizer 剥除） */
  const petSvgBox = el.querySelector("[data-pet-svg]");
  petSvgBox.innerHTML = _petSvgFor(kind); // lint-xss-ok: 同上，只取内部常量表
  /* ---------- v3.6.5 特效增强 ----------
     原 2 项：petBob 待机浮动、petBubble 气泡。新增 6 项：
       眨眼（随机 scaleY 闭合）· 点击跳跃 · 点击爱心 · 随机星光 · 久置打盹(zZZ) · 拖拽（已有）
     实现要点：眨眼作用于 .pet-eye（SVG 内 class，transform-box:fill-box）；
     心跳 tick 检测元素是否仍在文档中，被收回即自清，杜绝定时器泄漏。
     v3.6.7：立绘（anime 风格）没有 .pet-eye，改由标定浮层实现眨眼/张嘴。 */
  const eyes = el.querySelectorAll(".pet-eye");
  const fx = function(cls, txt){
    const f = document.createElement("div");
    f.className = "pet-fx " + cls;
    if(txt) f.textContent = txt;
    f.style.left = (10 + Math.random() * 34) + "px";
    el.appendChild(f);
    setTimeout(function(){ try{ f.remove(); }catch(_){} }, 2400);
  };
  /* v3.7.2：立体档专属星光 —— 随机方向飞散（--sx/--sy 控制轨迹），比普通星光更亮带十字晕 */
  const sparkFx = function(){
    const f = document.createElement("div");
    f.className = "pet-fx pet-fx-spark";
    f.textContent = "✦";
    f.style.left = (14 + Math.random() * 60) + "px";
    f.style.top = (30 + Math.random() * 50) + "px";
    f.style.setProperty("--sx", (Math.random() * 22 - 11).toFixed(1) + "px");
    f.style.setProperty("--sy", (-10 - Math.random() * 16).toFixed(1) + "px");
    el.appendChild(f);
    setTimeout(function(){ try{ f.remove(); }catch(_){} }, 2400);
  };
  const blink = function(){
    eyes.forEach(function(e){
      e.style.transformOrigin = "center";
      e.style.transform = "scaleY(.06)";
      setTimeout(function(){ e.style.transform = "scaleY(1)"; }, 110);
    });
  };
  let idleTicks = 0;
  el.addEventListener("click", function(e){
    if(e.target.closest(".pet-close")) return;
    el.classList.remove("pet-jumping");
    void el.offsetWidth; /* 重置动画 */
    el.classList.add("pet-jumping");
    fx("pet-fx-heart", "♥");
    if(Math.random() < .55) fx("pet-fx-star");
    idleTicks = 0;
  });
  /* v3.6.6 立绘动作：整图骨骼变换（摇头 / 点头 / 手舞足蹈 / 歪头），由心跳 tick 随机播放。
     手绘 SVG 兜底风格仍走 blink()（.pet-eye 缩放）；立绘没有可分部件，故用整图变换表达动作。 */
  const artImg = el.querySelector(".pet-art-img");
  /* v3.7.2：是否立体档（同一张立绘 + 2.5D 渲染）——决定要不要撒星光特效 */
  const is3dArt = !!(artImg && el.querySelector(".pet-3d"));
  const ACTS = ["act-shake", "act-nod", "act-dance", "act-tilt", "act-spin"];
  /* ---------- v3.6.7 立绘眨眼 / 张嘴：按标定坐标贴浮层 ----------
     .pet-art-img 是 object-fit:contain，四周可能留白，所以坐标必须基于「图片实际显示矩形」：
     由 naturalWidth/Height 与容器盒子算出缩放与偏移，再换算成容器内 px。 */
  const artLids  = el.querySelector(".pet-art-lids");
  const artMouth = el.querySelector(".pet-art-mouth");
  const lidEls   = artLids ? artLids.querySelectorAll("i") : [];
  const mouthEl  = artMouth ? artMouth.querySelector("i") : null;
  const _face = _PET_FACE[kind];
  const placeFace = function(){
    if(!artImg || !_face || !lidEls.length) return true;      /* 无需定位，视为完成 */
    const box = el.querySelector(".pet-art"); if(!box) return false;
    const iw = artImg.naturalWidth, ih = artImg.naturalHeight;
    const bw = box.clientWidth, bh = box.clientHeight;
    if(!iw || !ih || !bw || !bh) return false;                /* 立绘未解码 / 元素未进入布局，交给重试 */
    const s  = Math.min(bw / iw, bh / ih);
    const dw = iw * s, dh = ih * s, ox = (bw - dw) / 2, oy = (bh - dh) / 2;
    const PX = u => ox + u * dw, PY = v => oy + v * dh;
    /* 闭眼遮罩椭圆：略小于眼睛外框，好让原图的睫毛轮廓留在外面，观感更自然 */
    const lidW = Math.max(3, _face.ew * dw * 0.94), lidH = Math.max(2, _face.eh * dh * 0.88);
    [[lidEls[0], _face.l], [lidEls[1], _face.r]].forEach(function(pair){
      const n = pair[0], c = pair[1]; if(!n) return;
      n.style.left = PX(c[0]) + "px"; n.style.top = PY(c[1]) + "px";
      n.style.width = lidW + "px";    n.style.height = lidH + "px";
      n.style.background = _face.skin;
      n.style.setProperty("--pet-lash", _face.lash);
    });
    if(mouthEl){
      mouthEl.style.left = PX(_face.m[0]) + "px"; mouthEl.style.top = PY(_face.m[1]) + "px";
      mouthEl.style.width = Math.max(2, 0.046 * dw) + "px";
      mouthEl.style.height = Math.max(2, 0.042 * dh) + "px";
    }
    return true;
  };
  /* 挂载发生在 stage.appendChild(el) 之前 —— 此刻元素还没进入布局，clientWidth 为 0，
     故用 rAF 重试到定位成功；立绘是 data URI，首次解码也可能晚一帧，load 事件一并兜底。 */
  let _faceTries = 0;
  const placeFaceRetry = function(){
    if(!artImg) return;
    if(placeFace()) return;
    if(_faceTries++ < 60 && document.body.contains(el)) requestAnimationFrame(placeFaceRetry);
  };
  if(artImg){
    placeFaceRetry();
    artImg.addEventListener("load", placeFaceRetry, { once:true });
  }
  /* v3.7.49：眨眼/张嘴浮层必须**随宠物尺寸变化重新定位**。
     原实现只在"挂载时"和"图片 load"各定位一次 —— 而宠物尺寸由 CSS 变量 --pet-size 控制，
     换档（大/中/小）时盒子尺寸变了、浮层却还留在旧像素位置 → 表现就是"尺寸一变、眼睛还在远处"。
     这里用 ResizeObserver 覆盖一切尺寸变化（换档 / 窗口缩放 / 面板展开收起 / 布局变化）。 */
  const faceBox = el.querySelector(".pet-art");
  if(faceBox && typeof ResizeObserver === "function"){
    try{
      if(el._faceRO) el._faceRO.disconnect();
      el._faceRO = new ResizeObserver(function(){
        if(!document.body.contains(el)){ try{ el._faceRO.disconnect(); }catch(_){} return; }
        placeFace();
      });
      el._faceRO.observe(faceBox);
    }catch(_){ /* 不支持时忽略：至少原有的首次定位仍生效 */ }
  }
  let blinkTimer = null;
  const blinkArt = function(){
    if(!artLids || !lidEls.length) return false;
    artLids.classList.add("on");
    clearTimeout(blinkTimer);
    blinkTimer = setTimeout(function(){ artLids.classList.remove("on"); }, 130);
    /* 30% 概率连眨两下，更自然 */
    if(Math.random() < .3) setTimeout(function(){
      if(!document.body.contains(el)) return;
      artLids.classList.add("on");
      setTimeout(function(){ artLids.classList.remove("on"); }, 110);
    }, 250);
    return true;
  };
  const talkArt = function(){
    if(!artMouth) return;
    let n = 0;
    if(artImg){ artImg.classList.remove("talking"); void artImg.offsetWidth; artImg.classList.add("talking");
      setTimeout(function(){ artImg.classList.remove("talking"); }, 1400); }
    const beat = function(){
      if(!document.body.contains(el)){ artMouth.classList.remove("on"); return; }
      artMouth.classList.toggle("on");
      if(++n < 7) setTimeout(beat, 170);
      else artMouth.classList.remove("on");
    };
    beat();
  };
  const playAct = function(){
    if(!artImg) return;
    const a = ACTS[Math.floor(Math.random() * ACTS.length)];
    ACTS.forEach(function(x){ artImg.classList.remove(x); });
    void artImg.offsetWidth;                     /* 重置动画进度 */
    artImg.classList.add(a);
    setTimeout(function(){ artImg.classList.remove(a); }, 1500);
  };
  const tick = setInterval(function(){
    if(!document.body.contains(el)){ clearInterval(tick); return; }
    if(artImg){
      /* 动作与眨眼互斥，避免同时触发导致表情浮层与骨骼变换打架；
         3D 风格没有眨眼浮层（见 _petArtMarkup 注释）→ 把那份概率让给动作 */
      const canBlink = !!(artLids && lidEls.length);
      const r = Math.random();
      if(r < (canBlink ? .40 : .72)) playAct();
      else if(canBlink && r < .82) blinkArt();
    } else if(Math.random() < .5) blink();
    if(Math.random() < .35) fx("pet-fx-star");
    /* 立体档：额外撒 1~2 点星光（用户要的「带点特效」） */
    if(is3dArt && Math.random() < .55){ sparkFx(); if(Math.random() < .45) setTimeout(sparkFx, 260); }
    idleTicks++;
    if(idleTicks >= 3) fx("pet-fx-zzz", "z Z");
  }, 3400);
  el._petTimer = tick;
  el.querySelector(".pet-close").onclick = function(e){
    e.stopPropagation();
    _setPref("pet", "");
    unmountPet();
    try{ toast(t("pet.removedToast", "萌宠已收回"), "info"); }catch(_){}
  };
  // 拖拽（A-3 修复：document 级 mousemove/mouseup 挂在 AbortController signal 上，
  // unmountPet 时 abort 一次性解绑，杜绝反复切换萌宠导致的监听器累积泄漏；
  // 项目内同模式先例：L11103/L17761）
  let drag = null;
  el.addEventListener("mousedown", function(e){
    if(e.target.closest(".pet-close")) return;
    drag = { dx: e.clientX - el.offsetLeft, dy: e.clientY - el.offsetTop };
    el.style.animation = "none";
    e.preventDefault();
  });
  const onPetMove = function(e){
    if(!drag) return;
    const nx = Math.max(0, Math.min(window.innerWidth - 80, e.clientX - drag.dx));
    const ny = Math.max(0, Math.min(window.innerHeight - 80, e.clientY - drag.dy));
    el.style.left = nx + "px";
    el.style.top  = ny + "px";
  };
  const onPetUp = function(){ if(drag){ drag = null; el.style.animation = ""; } };
  if(el._petAC){ try{ el._petAC.abort(); }catch(_){ } } // 防重复挂载兜底
  el._petAC = new AbortController();
  document.addEventListener("mousemove", onPetMove, { signal: el._petAC.signal });
  document.addEventListener("mouseup", onPetUp, { signal: el._petAC.signal });
  /* v3.6.7：视口尺寸变化 → 重算立绘表情浮层坐标（容器像素尺寸变了，百分比要重新落到 px 上） */
  window.addEventListener("resize", placeFace, { signal: el._petAC.signal });
  window.addEventListener("orientationchange", placeFace, { signal: el._petAC.signal });
  /* v3.7.0：3D 立体风格 —— 指针倾斜（鼠标在萌宠上移动时按位置给 rotateX/rotateY，
     离开回正）。配合 CSS 里的转台摇摆，让它真像个小手办。
     注意：3D 风格稿没有可标定的五官浮层（造型是重渲染的、头身比也小），
     所以这一档不做眨眼浮层，活力由「摇摆 + 动作 + 倾斜」承担。 */
  const petArt = el.querySelector(".pet-art");
  if(petArt && petArt.hasAttribute("data-pet-3d")){
    const clamp1 = v => v < -1 ? -1 : v > 1 ? 1 : v;
    const onTilt = function(e){
      const r = el.getBoundingClientRect();
      const nx = clamp1((e.clientX - (r.left + r.width / 2)) / ((r.width / 2) || 1));
      const ny = clamp1((e.clientY - (r.top + r.height / 2)) / ((r.height / 2) || 1));
      el.style.setProperty("--pty", (nx * 16).toFixed(1) + "deg");
      el.style.setProperty("--ptx", (-ny * 12).toFixed(1) + "deg");
    };
    const resetTilt = function(){
      el.style.setProperty("--pty", "0deg");
      el.style.setProperty("--ptx", "0deg");
    };
    el.addEventListener("mousemove", onTilt, { signal: el._petAC.signal });
    el.addEventListener("mouseleave", resetTilt, { signal: el._petAC.signal });
  }
  // 点击说话
  el.addEventListener("click", function(e){
    if(e.target.closest(".pet-close")) return;
    const b = document.createElement("div");
    b.className = "pet-bubble";
    b.textContent = def.bubbles[Math.floor(Math.random()*def.bubbles.length)];
    el.appendChild(b);
    talkArt();                     /* v3.6.7：说气泡时同步张嘴 */
    setTimeout(function(){ if(b && b.parentNode) b.parentNode.removeChild(b); }, 1300);
  });
  stage.appendChild(el);
}
function unmountPet(){
  const stage = $("#petStage"); if(!stage) return;
  // A-3 修复：清 DOM 前先 abort 各萌宠节点的 AbortController，成对解绑 document 级监听器
  Array.prototype.forEach.call(stage.children, function(child){
    if(child && child._petAC){ try{ child._petAC.abort(); }catch(_){ } child._petAC = null; }
  });
  stage.classList.remove("on");
  while(stage.firstChild) stage.removeChild(stage.firstChild);
}
function initPetFromPref(){
  const k = _getPref("pet", "");
  if(k && _PETS[k]) mountPet(k);
}

/* ---------- P0② 模态框统一 a11y 基座（延迟绑定，不依赖各弹窗的调用点） ----------
 * 设计：不改 23 个弹窗各自的 open/close 逻辑，全局委托接管三件事：
 *   1) Esc → 关闭"最上层"可见弹窗（优先点其关闭按钮以复用清理逻辑，否则兜底 remove show）
 *   2) 遮罩点击（点击弹窗自身空白处 = backdrop）→ 关闭
 *   3) 弹窗打开时挂焦点陷阱（trapFocus），关闭时释放
 * 新弹窗只要带 role="dialog" 即自动获得全部能力。
 */
function _visibleModals(){
  return $$("[role='dialog']").filter(function(m){
    return m.classList.contains("show") ||
           (m.style && m.style.display !== "none" && m.style.display !== "") ||
           (m.offsetParent !== null && getComputedStyle(m).display !== "none");
  });
}
/* 焦点陷阱随弹窗显隐自动挂/卸（MutationObserver 监听 class/style 变化） */
function setupModalFocusAutoTrap(){
  if(typeof MutationObserver === "undefined") return;
  const seen = new WeakMap(); // modal -> releaseFn
  function sync(){
    $$("[role='dialog']").forEach(function(m){
      const visible = m.classList.contains("show") ||
                      (m.style && m.style.display !== "none" && m.style.display !== "") ||
                      (m.offsetParent !== null && getComputedStyle(m).display !== "none");
      const has = seen.has(m);
      if(visible && !has){
        const card = m.querySelector(".viz-modal-card,.recycle-card,.onboard-card,.help-card,.chain-card,.modal-card") || m;
        const rel = typeof trapFocus === "function" ? trapFocus(card) : null;
        if(rel) seen.set(m, rel);
      }else if(!visible && has){
        try{ seen.get(m)(); }catch(e){}
        seen.delete(m);
      }
    });
  }
  try{
    const mo = new MutationObserver(function(muts){
      for(const mu of muts){
        if(mu.type === "attributes" && (mu.attributeName === "class" || mu.attributeName === "style")){ sync(); return; }
      }
    });
    mo.observe(document.body, { subtree:true, attributes:true, attributeFilter:["class","style"] });
  }catch(e){ /* noop */ }
  sync();
}
function setupModalA11yBase(){
  // Esc：关最上层可见弹窗
  document.addEventListener("keydown", function(e){
    if(e.key !== "Escape") return;
    const mods = _visibleModals();
    if(!mods.length) return;
    const top = mods[mods.length - 1];
    // 优先点它自己的关闭按钮（复用各弹窗的清理逻辑）
    const closeBtn = top.querySelector("[id$='Close'],[aria-label^='关闭'],.viz-modal-close,.recycle-back,.help-close");
    if(closeBtn){ try{ closeBtn.click(); }catch(_){ top.classList.remove("show"); top.style.display="none"; } }
    else{ top.classList.remove("show"); if(top.style) top.style.display="none"; }
  });
  // 遮罩点击关闭（点到弹窗背景自身而非内容卡片）
  document.addEventListener("click", function(e){
    const m = e.target && e.target.closest && e.target.closest("[role='dialog']");
    if(m && e.target === m){
      const closeBtn = m.querySelector("[id$='Close'],[aria-label^='关闭'],.viz-modal-close,.recycle-back,.help-close");
      if(closeBtn){ try{ closeBtn.click(); }catch(_){} }
      else{ m.classList.remove("show"); if(m.style) m.style.display="none"; }
    }
  });
  setupModalFocusAutoTrap();
}

/* ---------- v3.1：快捷键帮助面板 ---------- */
function openShortcutHelp(){
  const body = $("#shortcutHelpBody");
  if(!body) return;
  const rows = [
    ["1-6", t("shortcut.switchSc", "切换场景（办公/数据/设计/学习/编程/生活）")],
    ["G", t("shortcut.overview", "跳转总览")],
    ["N", t("shortcut.newTask", "新建任务并聚焦标题输入")],
    ["Ctrl+K", t("shortcut.cmdPalette", "命令面板（搜索任务、切换场景）")],
    ["Ctrl+Z", t("shortcut.undo", "撤销任务操作")],
    ["Ctrl+Y / Ctrl+Shift+Z", t("shortcut.redo", "重做任务操作")],
    ["?", t("shortcut.help", "打开本快捷键帮助面板")],
    ["Esc", t("shortcut.close", "关闭弹窗/抽屉")]
  ];
  const html = '<table class="help-keys">' + rows.map(function(r){
    return '<tr><td><kbd>' + esc(r[0]) + '</kbd></td><td>' + esc(r[1]) + '</td></tr>';
  }).join("") + '</table>';
  body.innerHTML = sanitizeHtml(html);
  const m = $("#shortcutHelpModal");
  if(!m) return;
  m.classList.add("show");
  const closeBtn = $("#btnShortcutHelpClose");
  if(closeBtn) closeBtn.onclick = function(){ m.classList.remove("show"); };
}

/* ---------- T4.3 移动端增强：手势支持 + 触摸优化 + 横屏适配 ---------- */
/**
 * 计算滑动方向和距离（纯函数，方便测试）
 * @param {{clientX:number, clientY:number}} touchStart - 起始触摸点坐标
 * @param {{clientX:number, clientY:number}} touchEnd - 结束触摸点坐标
 * @returns {{direction:"left"|"right"|"up"|"down", distance:number}|null} - 方向+距离，距离<50px 返回 null
 */
function handleSwipe(touchStart, touchEnd){
  if(!touchStart || !touchEnd) return null;
  const sx = touchStart.clientX || 0;
  const sy = touchStart.clientY || 0;
  const ex = touchEnd.clientX || 0;
  const ey = touchEnd.clientY || 0;
  const dx = ex - sx;
  const dy = ey - sy;
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  // 阈值 50px：小于阈值视为点击而非滑动
  if(absX < 50 && absY < 50) return null;
  // 取主要方向（水平距离>垂直距离→水平方向；相等时取水平）
  if(absX >= absY){
    return { direction: dx > 0 ? "right" : "left", distance: absX };
  }
  return { direction: dy > 0 ? "down" : "up", distance: absY };
}

/**
 * 根据滑动方向计算目标场景（纯函数，不调用 setActive）
 * @param {"left"|"right"|"up"|"down"} direction - 滑动方向
 * @param {string} currentSc - 当前场景键
 * @returns {string} 目标场景键（越界时保持当前；非 ORDER 场景保持当前）
 */
function swipeToScene(direction, currentSc){
  const idx = ORDER.indexOf(currentSc);
  if(idx < 0) return currentSc;
  if(direction === "left"){
    // 左滑切换下一个场景（最后一个不越界，保持当前）
    return idx < ORDER.length - 1 ? ORDER[idx + 1] : ORDER[idx];
  }
  if(direction === "right"){
    // 右滑切换上一个场景（第一个不越界，保持当前）
    return idx > 0 ? ORDER[idx - 1] : ORDER[idx];
  }
  // 上下滑动不切换场景
  return currentSc;
}

/**
 * 判断是否为移动端（innerWidth < 768）
 * @returns {boolean}
 */
function isMobile(){
  return typeof window !== "undefined" && window.innerWidth < 768;
}

/**
 * 判断是否为横屏移动端（innerWidth < 768 且 innerHeight < innerWidth）
 * @returns {boolean}
 */
function isMobileLandscape(){
  if(!isMobile()) return false;
  return typeof window !== "undefined" && window.innerHeight < window.innerWidth;
}

/**
 * 移动端横屏自动折叠侧边栏：横屏时折叠，竖屏时恢复（用户手动折叠的保留）
 * @returns {void}
 */
function applyLandscapeFold(){
  const side = $("#side");
  if(!side) return;
  if(isMobileLandscape()){
    side.classList.add("collapsed");
  } else if(isMobile()){
    // 竖屏移动端：仅当不是用户主动折叠时才恢复
    let userFolded = false;
    try{ userFolded = localStorage.getItem(PREFIX+"sideCollapsed") === "1"; }catch(_){}
    if(!userFolded) side.classList.remove("collapsed");
  }
}

/**
 * 绑定移动端手势：左滑切换下一个场景、右滑切换上一个场景、右滑从左边缘打开侧边栏
 * 只在移动端（innerWidth < 768）启用，测试环境（jsdom 默认 1024x768）不绑定
 * @returns {void}
 */
function setupMobileGestures(){
  if(!isMobile()) return;
  const main = $("#main");
  if(!main || main._swipeBound) return;
  main._swipeBound = true;
  let touchStart = null;
  main.addEventListener("touchstart", function(e){
    if(!e || !e.touches || !e.touches[0]) return;
    touchStart = { clientX: e.touches[0].clientX, clientY: e.touches[0].clientY };
  }, { passive: true });
  main.addEventListener("touchmove", function(){
    /* passive move，不阻止默认滚动 */
  }, { passive: true });
  main.addEventListener("touchend", function(e){
    if(!touchStart) return;
    const t = e && e.changedTouches && e.changedTouches[0];
    const startX = touchStart.clientX;
    if(!t){ touchStart = null; return; }
    const touchEnd = { clientX: t.clientX, clientY: t.clientY };
    const swipe = handleSwipe(touchStart, touchEnd);
    touchStart = null;
    if(!swipe) return;
    // 右滑从左边缘（startX < 20px）打开侧边栏
    if(swipe.direction === "right" && startX < 20){
      const side = $("#side");
      if(side) side.classList.remove("collapsed");
      return;
    }
    // 左滑/右滑切换场景（仅对 ORDER 中的场景生效，overview/stats 不切换）
    if(swipe.direction === "left" || swipe.direction === "right"){
      const cur = getActive();
      if(!ORDER.includes(cur)) return;
      const next = swipeToScene(swipe.direction, cur);
      if(next !== cur){
        setActive(next);
        render();
      }
    }
  }, { passive: true });
}

/**
 * 绑定底部导航项点击涟漪效果：点击时添加 .ripple 类，动画结束后移除
 * 事件委托绑定在 #side 上（不随 innerHTML 重建丢失）
 * v3.2 阶段二：扩展为全局按钮涟漪委托——document 上监听 pointerdown，
 * 对命中 button:not([disabled]) 的元素从点击点动态注入 .ripple-fx 涟漪
 * @returns {void}
 */
function setupRipple(){
  const side = $("#side");
  if(side && !side._rippleBound){
    side._rippleBound = true;
    side.addEventListener("click", function(e){
      const item = e.target.closest && e.target.closest(".nav-item");
      if(!item) return;
      item.classList.add("ripple");
      // 动画结束后移除 .ripple（transition-base = .25s，预留 350ms 兜底）
      setTimeout(function(){
        item.classList.remove("ripple");
      }, 350);
    });
  }
  // v3.2 阶段二：全局按钮涟漪委托（pointerdown 从点击点扩散）
  if(typeof document === "undefined" || document._rippleFxBound) return;
  document._rippleFxBound = true;
  document.addEventListener("pointerdown", function(e){
    const btn = e.target && e.target.closest ? e.target.closest("button:not([disabled])") : null;
    if(!btn) return;
    // 加载中按钮不显示涟漪（避免与 spinner 冲突）
    if(btn.classList.contains("is-loading")) return;
    const rect = btn.getBoundingClientRect();
    if(rect.width === 0 || rect.height === 0) return;
    const size = Math.max(rect.width, rect.height);
    const span = document.createElement("span");
    span.className = "ripple-fx";
    span.style.left = (e.clientX - rect.left - size / 2) + "px";
    span.style.top = (e.clientY - rect.top - size / 2) + "px";
    span.style.width = size + "px";
    span.style.height = size + "px";
    // 确保按钮相对定位以容纳涟漪（relative 不影响布局流）
    if(getComputedStyle(btn).position === "static"){
      btn.style.position = "relative";
    }
    btn.appendChild(span);
    // 300ms 后移除涟漪（动画时长 300ms，预留 20ms 兜底）
    setTimeout(function(){ if(span.parentNode) span.remove(); }, 320);
  });
}

/**
 * withLoading：按钮加载态包装器（v3.2 阶段二）
 * - 自动添加 is-loading 类 + aria-busy="true"，promise 完成后移除
 * - 保留原 textContent，完成后恢复（不依赖调用方手动恢复）
 * - 兼容 thenable 和真 Promise；异常也会恢复按钮状态
 * @param {HTMLButtonElement} btn - 要包装的按钮元素
 * @param {Promise} promise - 要等待的 promise
 * @returns {Promise} 与传入 promise 同结果的 promise（可链式调用）
 */
function withLoading(btn, promise){
  if(!btn || !promise || typeof promise.then !== "function") return promise;
  const origText = btn.textContent;
  const origDisabled = btn.disabled;
  btn.classList.add("is-loading");
  btn.setAttribute("aria-busy", "true");
  btn.disabled = true;
  const restore = function(){
    btn.classList.remove("is-loading");
    btn.removeAttribute("aria-busy");
    btn.disabled = origDisabled;
    btn.textContent = origText;
  };
  // then/catch/finally 链：无论成功失败都恢复
  promise.then(restore, restore);
  return promise;
}

/**
 * removeWithLeave：列表项退场动画包装器（v3.2 阶段二）
 * - 加 .is-leaving 类触发 fade-slide-out 动画，animationend 后移除 DOM
 * - 兜底 250ms 后强制移除（防止 animationend 不触发）
 * - 动画期间 pointer-events:none（CSS 已设置），避免重复点击
 * @param {HTMLElement} el - 要移除的元素
 * @returns {void}
 */
function removeWithLeave(el){
  if(!el || !el.parentNode) return;
  el.classList.add("is-leaving");
  let done = false;
  const cleanup = function(){
    if(done) return; done = true;
    if(el.parentNode) el.remove();
  };
  el.addEventListener("animationend", cleanup, { once: true });
  setTimeout(cleanup, 250);
}

/**
 * validateField：表单字段校验工具（v3.2 阶段二）
 * - 按 rules 顺序校验，首个失败规则的消息显示为 .field-error
 * - 设置 aria-invalid、加 .is-invalid 类、渲染错误文字
 * - 校验通过则清除错误状态
 * @param {HTMLInputElement} input - 要校验的输入框
 * @param {Array} [rules] - 校验规则数组，每项 {required, minLen, maxLen, pattern, custom, message}
 * @returns {boolean} 校验是否通过
 */
function validateField(input, rules){
  if(!input) return true;
  rules = rules || [];
  const value = input.value ? String(input.value).trim() : "";
  let error = "";
  for(let i = 0; i < rules.length; i++){
    const rule = rules[i];
    if(rule.required && !value){ error = rule.message || t("validate.required", "此项必填"); break; }
    if(rule.minLen && value.length < rule.minLen){ error = rule.message || t("validate.minLen", "长度不足"); break; }
    if(rule.maxLen && value.length > rule.maxLen){ error = rule.message || t("validate.maxLen", "长度超限"); break; }
    if(rule.pattern && !rule.pattern.test(value)){ error = rule.message || t("validate.pattern", "格式不正确"); break; }
    if(rule.custom && typeof rule.custom === "function"){
      const r = rule.custom(value);
      if(r){ error = r; break; }
    }
  }
  if(error){
    input.setAttribute("aria-invalid", "true");
    input.classList.add("is-invalid");
    // 渲染错误文字（在 input 之后插入 .field-error）
    let errEl = input.nextElementSibling;
    if(!errEl || !errEl.classList || !errEl.classList.contains("field-error")){
      errEl = document.createElement("span");
      errEl.className = "field-error";
      if(input.insertAdjacentElement){
        input.insertAdjacentElement("afterend", errEl);
      } else if(input.parentNode){
        input.parentNode.appendChild(errEl);
      }
    }
    errEl.textContent = error;
    return false;
  } else {
    input.removeAttribute("aria-invalid");
    input.classList.remove("is-invalid");
    const errEl = input.nextElementSibling;
    if(errEl && errEl.classList && errEl.classList.contains("field-error")){
      errEl.remove();
    }
    return true;
  }
}

/* ---------- T4.2 骨架屏 + 空状态（纯 HTML 生成函数，不依赖 DOM，方便测试） ---------- */
// 空状态图标（内联 SVG，currentColor，无硬编码颜色；颜色由 .empty-icon 的 color 令牌控制）
// v2.1.1 去重：与 UI_ICONS 同形的按 key 引用单一真相源

/**
 * 渲染骨架屏（灰块占位 + 闪烁动画 wb-shimmer）
 * @param {"board"|"list"|"chat"|"stats"} type - 骨架屏类型
 * @returns {string} HTML 字符串（含 .skeleton / .skeleton-line / .skeleton-block 类）
 */
function renderSkeleton(type){
  if(type === "board"){
    const cols = [{name:t("kanban.todo", "待办"),n:3},{name:t("kanban.doing", "进行中"),n:2},{name:t("kanban.done", "已完成"),n:3}];
    const colsHtml = cols.map(function(c){
      return '<div class="skeleton-kcol"><h4>'+c.name+'</h4>' +
        Array.from({length:c.n}, function(){ return '<div class="skeleton-block"></div>'; }).join("") +
        '</div>';
    }).join("");
    return '<div class="skeleton-wrap"><div class="kanban">'+colsHtml+'</div></div>';
  }
  if(type === "list"){
    const widths = ["w-100","w-80","w-100","w-60","w-100","w-80"];
    return '<div class="skeleton-wrap">' +
      widths.map(function(w){ return '<div class="skeleton-line '+w+'"></div>'; }).join("") +
      '</div>';
  }
  if(type === "chat"){
    const msgs = [
      {role:"assistant",lines:["w-100","w-80"]},
      {role:"user",lines:["w-100","w-60"]},
      {role:"assistant",lines:["w-100","w-80"]},
      {role:"user",lines:["w-100"]}
    ];
    const msgsHtml = msgs.map(function(m){
      return '<div class="skeleton-msg '+m.role+'">' +
        m.lines.map(function(w){ return '<div class="skeleton-line '+w+'"></div>'; }).join("") +
        '</div>';
    }).join("");
    return '<div class="skeleton-wrap">'+msgsHtml+'</div>';
  }
  if(type === "stats"){
    const cards = Array.from({length:3}, function(){
      return '<div class="skeleton-stat-card"><div class="skeleton-line w-60"></div><div class="skeleton-line w-100"></div></div>';
    }).join("");
    return '<div class="skeleton-wrap">' +
      '<div class="skeleton-row">'+cards+'</div>' +
      '<div class="skeleton-block h-120"></div>' +
      '<div class="skeleton-block h-180"></div>' +
      '</div>';
  }
  return "";
}
/**
 * 渲染空状态（图标 + 文字 + 操作按钮引导）
 * @param {"no-tasks"|"no-records"|"no-search"|"no-stats"} type - 空状态类型
 * @returns {string} HTML 字符串（含 .empty-state / .empty-icon / .empty-text / .empty-action 类）
 */

/**
 * 渲染错误状态（v3.2 阶段二）——图标 + 标题 + 描述 + 可选重试按钮
 * @param {Object} [opts] - 选项
 * @param {string} [opts.title="加载失败"] - 错误标题
 * @param {string} [opts.message="请稍后重试"] - 错误描述
 * @param {string} [opts.retryLabel="重试"] - 重试按钮文字
 * @param {boolean} [opts.onRetry=false] - 是否显示重试按钮（点击事件由调用方通过 data-error-retry 委托绑定）
 * @returns {string} HTML 字符串（含 .error-state / .error-icon / .error-title / .error-desc / .error-action 类）
 */
function renderErrorState(opts){
  opts = opts || {};
  const title = opts.title || t("errorState.defaultTitle", "加载失败");
  const message = opts.message || t("errorState.defaultMsg", "请稍后重试");
  const retryLabel = opts.retryLabel || t("errorState.retry", "重试");
  const icon = UI_ICONS.error;
  return '<div class="error-state">' +
    '<div class="error-icon">' + icon + '</div>' +
    '<p class="error-title"><strong>' + esc(title) + '</strong></p>' +
    '<p class="error-desc">' + esc(message) + '</p>' +
    (opts.onRetry ? '<div class="error-action"><button class="btn-primary" type="button" data-error-retry="1">' + esc(retryLabel) + '</button></div>' : '') +
    '</div>';
}
/**
 * 渲染网络断开状态（v3.2 阶段二）——专用错误态，含"重试连接"按钮
 * @returns {string} HTML 字符串
 */
function renderOfflineState(){
  return renderErrorState({
    title: t("errorState.offlineTitle", "网络已断开"),
    message: t("errorState.offlineMsg", "请检查网络连接后重试"),
    retryLabel: t("errorState.retryConn", "重试连接"),
    onRetry: true
  });
}
/**
 * withSkeleton：包装渲染函数，先显示骨架屏，300ms 后执行真实渲染
 * 用于模拟数据加载延迟，提升感知性能（避免白屏 / 突然弹出内容）
 * @param {() => void} fn - 真实渲染函数（无参，操作 DOM）
 * @param {"chat"|"stats"|"board"|"list"} [skeletonType="board"] - 骨架屏类型，传给 renderSkeleton
 * @returns {void}
 */
function withSkeleton(fn, skeletonType){
  const main = document.getElementById("main");
  if(main){
    main.innerHTML = sanitizeHtml(renderSkeleton(skeletonType || "board"));
  }
  setTimeout(function(){
    if(typeof fn === "function") fn();
  }, 300);
}

/* ---------- 渲染：今天要处理（A：今日仪表盘） ---------- */
// 按时间段返回问候语（A1）
function greeting(){
  const h = new Date().getHours();
  if(h < 6) return t("greeting.lateNight", "夜深了");
  if(h < 12) return t("greeting.morning", "早安");
  if(h < 14) return t("greeting.noon", "午安");
  if(h < 18) return t("greeting.afternoon", "下午好");
  if(h < 22) return t("greeting.evening", "晚上好");
  return t("greeting.lateNight", "夜深了");
}
// 优先级权重：P0 最优先，无优先级最后

function renderToday(){
  const tasks = getActiveTasks();
  const today = todayStr();
  const total = tasks.length, done = tasks.filter(x=>x.status==="done").length;
  // 今日到期 + 逾期待办（due <= 今天）
  const pendingToday = tasks.filter(x=>x.status!=="done" && x.due && x.due<=today);
  const pct = total? Math.round(done/total*100):0;
  const R=24, C=2*Math.PI*R, off=C*(1-pct/100);
  const ring = `<svg class="ring" viewBox="0 0 60 60">
    <circle cx="30" cy="30" r="${R}" fill="none" stroke-width="7" class="u-stroke-surface-muted"/>
    <circle cx="30" cy="30" r="${R}" fill="none" stroke-width="7" class="u-stroke-accent"
      stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${off}" transform="rotate(-90 30 30)"/>
    <text x="30" y="34" text-anchor="middle" class="pct u-fill-text">${pct}%</text></svg>`;

  // 联动进行中数量（from 场景 streak > 0 且链启用）
  const links = getLinks();
  const chainsActive = links.filter(l => {
    if(l.enabled === false) return false;
    return calcStreak(l.fromSc).current > 0;
  }).length;

  // A2：今日待办 Top 5 任务（按 priority + due 排序）——v1.10.0 扩展：默认显示前 3 行 + "展开"按钮
  const TOP3_PREVIEW = 3; // 默认预览行数（v1.10.0：3 行 → 5 行的折中——先紧凑 3 行展示，需要时一键展开看全部）
  const top5 = pendingToday.slice().sort((a,b)=>{
    const pa = _priWeight(a.priority), pb = _priWeight(b.priority);
    if(pa !== pb) return pa - pb;
    return a.due < b.due ? -1 : 1;
  }).slice(0, 5);
  let top3Html;
  if(top5.length === 0){
    top3Html = `<div class="empty today-empty">${t("overview.today.empty", "今天没有待处理的事项，去各场景添加任务吧")}</div>`;
  }else{
    const itemsHtml = top5.map((x,i)=>{
      const s = scMeta(x.sc);
      // 默认前 3 项展开，超出 3 项的折叠隐藏（.top3-item-extra class + CSS max-height 控制）
      const extraCls = i >= TOP3_PREVIEW ? " top3-item-extra" : "";
      return `<li class="top3-item${extraCls}">
        <span class="dot" style="background:${scCss(s.color)}"></span>
        <span class="title">${esc(x.title)}</span>
        <span class="sc-name">${s.name}</span>
        <button type="button" class="mini snooze-btn" data-snooze="${esc(x.id)}" title="30 分钟后再提醒" data-i18n-title="ui.snooze30MinTitle" data-i18n="task.snoozeBtnText">稍后</button>
      </li>`;
    }).join("");
    const needExpand = top5.length > TOP3_PREVIEW;
    const expandBtn = needExpand ? `<button type="button" class="top3-expand" id="top3Expand" aria-expanded="false">
      <span class="ex-icon" aria-hidden="true">▾</span><span class="ex-txt">展开全部 ${top5.length} 项</span>
    </button>` : "";
    top3Html = `<ul class="top3-list" id="top3List">${itemsHtml}</ul>${expandBtn}`;
  }

  // A3：联动状态条（每条链：from → to + streak + 状态图标，点击跳 from 场景）
  const chainBar = `<div class="chain-bar">` + links.map(l=>{
    const s = calcStreak(l.fromSc);
    const enabled = l.enabled !== false;
    const triggered = tasks.some(t =>
      t.sc === l.fromSc && t.linked &&
      String(t.title||"").toLowerCase().includes(String(l.kw||"").toLowerCase())
    );
    let icon, label;
    if(!enabled){ icon = "‖"; label = "已暂停"; }
    else if(s.current > 0){ icon = "●"; label = s.current + "天"; }
    else if(triggered){ icon = "✓"; label = "已触发"; }
    else { icon = "○"; label = "未开始"; }
    const fs = scMeta(l.fromSc), ts = scMeta(l.toSc);
    return `<button type="button" class="chain-pill" data-chain-sc="${l.fromSc}"${enabled?"":" disabled"}>
      <span style="color:${scCss(fs.color)}">${fs.name}</span>
      <span class="arr">→</span>
      <span style="color:${scCss(ts.color)}">${ts.name}</span>
      <span class="fire">${icon}</span>
      <span class="chain-label">${label}</span>
    </button>`;
  }).join("") + `</div>`;

  return `<div class="card">
    <div class="dashboard-hero">
      <div>
        <div class="hero-greeting">${greeting()}</div>
        <div class="hero-sub">今天有 ${pendingToday.length} 件事待处理 · 已完成 ${done} 件 · 联动 ${chainsActive} 条进行中</div>
      </div>
      <div class="hero-right">${ring}</div>
    </div>
    ${top3Html}
    ${chainBar}
  </div>`;
}
/* v3.7.75 解耦：向 core 桥注册侧栏局部重绘 —— data-links（插件注册/启停）等低层只调桥，
   不再直接引用本块符号（AppBridge.renderSide 槽位见 core.js）。 */
try{ AppBridge.renderSide = renderSide; }catch(e){ /* 桥未就绪时静默，下一轮渲染自然补上 */ }

/* v3.7.78 解耦：render 簇槽注册 —— render-entry 路由与 render-overview 工具卡经桥调用。 */
try{
  AppBridge.openRecycle = openRecycle;
  AppBridge.openToolStub = openToolStub;
  AppBridge.openAlarmModal = openAlarmModal;
  AppBridge.openChartStore = openChartStore;
  AppBridge.openWeatherModal = openWeatherModal;
  AppBridge.openPetModal = openPetModal;
}catch(e){}
