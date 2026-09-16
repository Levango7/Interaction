// ===== Render Layer (渲染层·小工具) =====
/* ---------- 小工具 ---------- */
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
function weekRange(){
  const d=new Date(); const day=(d.getDay()+6)%7;
  const mon=new Date(d); mon.setDate(d.getDate()-day);
  const sun=new Date(mon); sun.setDate(mon.getDate()+6);
  return (mon.getMonth()+1)+"/"+mon.getDate()+" - "+(sun.getMonth()+1)+"/"+sun.getDate();
}
function thisWeekDone(sc){
  const d=new Date(); const day=(d.getDay()+6)%7;
  const mon=new Date(d); mon.setDate(d.getDate()-day); mon.setHours(0,0,0,0);
  return getActiveTasks().filter(t=>t.sc===sc&&t.status==="done"&&t.doneAt&&t.doneAt>=mon.getTime());
}

/* ---------- 渲染：侧边导航（v2.1.0 两级菜单） ---------- */
// v1.9.9：折叠按钮回归侧栏顶部（"全局"组上方），用户确认放回原位
const SIDE_TOGGLE_HTML = `<button type="button" class="side-toggle" id="sideToggle" aria-label="${t("side.toggleAria", "折叠或展开侧边栏")}" title="${t("side.toggleTitle", "折叠/展开")}">
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg><span class="lbl" data-i18n="chat.collapseLbl">折叠</span></button>`;

/* v2.1.0：两级菜单图标集（顶级项用；子项用 CSS 圆点标记，不配图标） */
/* v2.1.1 去重：与 UI_ICONS 同形的图标按 key 引用单一真相源；dash 改仪表盘（gauge）与统计柱状图区分 */
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
    {id:"stu-mindmap", label:t("side.sub.mindmap", "思维导图"), run:()=>{ if(typeof openMindmapModal==="function") openMindmapModal(); }},
    {id:"stu-kb", label:"知识库", run:()=>{ if(typeof openKnowledgeBaseModal==="function") openKnowledgeBaseModal(); }},
    {id:"stu-web", label:t("side.sub.webSearch", "在线检索")},
    {id:"stu-notes", label:t("side.sub.notes", "笔记"), run:()=>{ if(typeof openNotesModal==="function") openNotesModal(); }},
    {id:"stu-tpl", label:t("side.sub.template", "场景模板"), run:()=>{ if(typeof openTemplateModal==="function") openTemplateModal(); }}
  ],
  data:[
    {id:"dat-stats", label:t("side.sub.dataAnalysis", "数据分析"), run:()=>{ setActive("stats"); render(); }},
    {id:"dat-chart", label:t("side.sub.edit", "编辑"), run:()=>{ _sideActive=null; setActive("stats"); _dashEditMode=true; render(); }},
    {id:"dat-report", label:t("side.sub.report", "报告"), run:()=>{ if(typeof openReportModal==="function") openReportModal(); }}
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

/* v2.1.0：菜单展开状态（持久化）+ 当前激活子项（会话内）。
   高亮不变量：任一时刻至多 1 个 .nav-item.active——
   _sideActive 非空时仅该子项 active；为空时按 uiView/active 命中唯一顶级项。 */
let _sideActive = null;
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
    return `<button type="button" class="nav-item nav-parent${act}${hasAct}"${dataAttr}${o.children?` aria-expanded="${isExp}"`:""}${extra} style="--sc:${o.color||"var(--muted)"}" title="${esc(o.label)}" aria-label="${esc(o.label)}">
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
    if(btn.dataset.gear){ _sideActive = null; openDrawer(); return; }
    if(btn.dataset.help){ _sideActive = null; if(typeof renderHelp==="function") renderHelp(); return; }
    if(btn.dataset.aipage){ _sideActive = null; if(typeof openAiPage==="function") openAiPage(); return; }
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
    "feat-ai":{run:()=>{ if(typeof openAiPage==="function") openAiPage(); }}
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
      if(btn.dataset.gear){ _sideActive = null; closeSideSheet(); openDrawer(); return; }
      if(btn.dataset.help){ _sideActive = null; closeSideSheet(); if(typeof renderHelp==="function") renderHelp(); return; }
      if(btn.dataset.aipage){ _sideActive = null; closeSideSheet(); if(typeof openAiPage==="function") openAiPage(); return; }
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
      <span class="recycle-dot" style="background:${v.color}"></span>
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
  if(typeof closeDrawer === "function") closeDrawer();
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
        if(item.data && item.data.note){ notes.push(item.data.note); saveNotes(notes); _notifyNotesChanged(); }
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
 * 在容器内启用 Tab 焦点循环；返回 release() 用于解除并归还焦点
 * @param {Element} container - 模态容器
 * @returns {Function|null} release 函数；容器无效时返回 null
 */
function trapFocus(container){
  if(!container || typeof container.querySelectorAll!=="function") return null;
  const SEL='a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
  const prev=document.activeElement;
  function onKey(e){
    if(e.key!=="Tab") return;
    const items=[].slice.call(container.querySelectorAll(SEL));
    if(!items.length) return;
    const first=items[0], last=items[items.length-1];
    if(e.shiftKey && document.activeElement===first){ e.preventDefault(); last.focus(); }
    else if(!e.shiftKey && document.activeElement===last){ e.preventDefault(); first.focus(); }
  }
  container.addEventListener("keydown", onKey);
  const first=/** @type {HTMLElement} */(container.querySelector(SEL));
  if(first && typeof first.focus==="function"){ try{ first.focus(); }catch(e){ /* noop */ } }
  return function release(){
    container.removeEventListener("keydown", onKey);
    if(prev && typeof /** @type {HTMLElement} */(prev).focus==="function" && document.contains(prev)){ try{ /** @type {HTMLElement} */(prev).focus(); }catch(e){ /* noop */ } }
  };
}
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
  if(typeof closeDrawer === "function") closeDrawer();
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
      if(id==="calview"){ const m=$("#calendarModal"); if(m){ const b=$("#calendarModalBody"); if(b) b.innerHTML=sanitizeHtml(renderCalendarView(0)); m.classList.add("show"); } }
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
function _recordToolHtml(cfg, records){
  const form = '<div class="tool-form-grid">' + cfg.fields.map(function(f){
    if(f.type === "select"){
      return '<div class="tool-field"><label>' + esc(f.label) + '</label><select data-rec-field="' + esc(f.k) + '">' +
        f.options.map(function(o){ return '<option value="' + esc(o) + '">' + esc(o) + '</option>'; }).join("") + '</select></div>';
    }
    const t = f.type === "number" ? ' type="number" step="any"' : f.type === "date" ? ' type="text" inputmode="none" data-date-picker="1"' : ' type="text"';
    return '<div class="tool-field"><label>' + esc(f.label) + '</label><input' + t + ' data-rec-field="' + esc(f.k) + '" placeholder="' + esc(f.label) + '"></div>';
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
  return '<div class="tool-filter-bar"><span class="add-wrap"><span class="add-label">'+t("tool.addLabel", "添加")+'</span><button type="button" class="addbtn sm add-round" id="recAddBtn" data-sc="accent" aria-label="'+t("tool.ariaAdd", "添加")+'">＋</button></span>' +
    '<span class="sub u-m-0">共 ' + records.length + ' 条</span>' + summary + '</div>' +
    '<div class="tool-form-box">' + form + "</div>" +
    (records.length
      ? '<table class="tool-table"><thead><tr><th></th>' + cfg.cols.map(function(c){ return '<th>' + esc(c.label) + "</th>"; }).join("") + "</tr></thead><tbody>" + rows + "</tbody></table>"
      : '<div class="tool-empty">' + esc(cfg.emptyTip || t("tool.emptyDefault", "暂无记录")) + "</div>");
}
/* v3.2 C-档双轨收敛：双轨工具的写入入口改为引导跳转功能卡（数据以功能卡为真相源）。
 * 提示条替代表单提交——点「去功能卡添加」切到对应场景功能 tab。 */
function _bindRecordToolRedirect(toolId, targetName, sceneKey, featId){
  const root = $("#toolAppBody"); if(!root) return;
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

const TOOL_APPS = {
  /* ================= 文档簇 ================= */
  "off-md": {
    name:t("tool.md.name", "Markdown 编辑器"), icon:UI_ICONS.md, desc:t("tool.md.desc", "分栏编辑 · 实时预览 · 导出 .md/.html"),
    render: function(){
      const saved = _toolDoc("off-md");
      return '<div class="md-ed-wrap u-gap-3"class="u-grid-2col">'
        + '<div><label>Markdown 源码</label><textarea id="mdSrc" class="u-fs-2xs u-min-h-360"style="font-family:\'SF Mono\',Consolas,monospace">' + esc(saved) + '</textarea>'
        + '<div class="tool-actions"><button type="button" class="addbtn sm" id="mdExportMd">导出 .md</button>'
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
        + '<button type="button" class="addbtn sm" id="pptExportJson">导出 JSON</button></div></div></div>'
        + '<div id="pptStage" hidden class="u-flex u-flex-col u-ai-center u-jc-center u-pos-fixed u-inset-0 u-z-modal u-p-6 u-bg-bg">'
        + '<h1 id="stageTitle" class="u-mb-4"style="font-size:32px"></h1>'
        + '<p id="stageBody" class="u-text-center u-lh-18 u-max-w-720"style="font-size:18px"></p>'
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
    name:t("tool.pdf.name", "PDF 阅读"), icon:UI_ICONS.pdf, desc:t("tool.pdf.desc", "导入本地 PDF · iframe 预览"),
    render: function(){
      return '<label>' + t("tool.pdf.importLabel", "导入 PDF 文件") + '</label><input type="file" id="pdfFile" accept=".pdf,application/pdf" class="u-mt-2">'
        + '<div id="pdfViewWrap" class="u-mt-3"></div>'
        + '<p class="sub u-mt-3">' + t("tool.pdf.note", "说明：PDF 在本地浏览器内嵌预览；部分环境（file:// 协议）可能受限，此时建议用系统阅读器打开。") + '</p>';
    },
    bind: function(){
      const inp = $("#pdfFile"); if(!inp) return;
      inp.onchange = function(){
        const f = inp.files && inp.files[0]; if(!f) return;
        const url = URL.createObjectURL(f);
        $("#pdfViewWrap").innerHTML = sanitizeHtml(
          '<iframe src="' + url + '" class="u-w-full u-h-560 u-border-line u-radius-md" title="' + esc(f.name) + '"></iframe>');
        toast(t("tool.pdf.openedToast", "已打开 {name}").replace("{name}", f.name), "ok");
      };
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
        const text = await _aiChatText([
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
        ctx.font = "bold 32px sans-serif";
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
        + (aiOn ? "" : '<p class="sub u-mt-2">' + t("tool.imgGen.noAiTip", "未配置 AI——文生图需要 AI API。到 设置→AI 配置后即可使用。") + '</p>');
    },
    bind: function(){
      const go = $("#igGo"); if(!go) return;
      go.onclick = async function(){
        const p = $("#igPrompt").value.trim();
        if(!p){ toast(t("tool.imgGen.enterDesc", "请输入图片描述"), "warn"); return; }
        $("#igOut").innerHTML = sanitizeHtml('<div class="coach-hint">' + t("tool.imgGen.generating", "生成中…（约 10–30 秒）") + '</div>');
        const text = await _aiChatText([{ role:"user", content:t("tool.imgGen.svgPrompt", "为以下描述生成一张图片的 SVG 简笔示意（仅返回 SVG 代码）：\n{desc}").replace("{desc}", p) }]);
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
    name:t("tool.vidGen.name", "AI 视频生成"), icon:UI_ICONS.vidgen, desc:t("tool.vidGen.desc", "文本描述 → AI 视频生成"),
    render: function(){
      const aiOn = (typeof getCfg === "function") && getCfg().enabled;
      return '<label>' + t("tool.vidGen.descLabel", "视频描述") + '</label><textarea id="vgPrompt" placeholder="' + t("tool.vidGen.descPlaceholder", "描述想要的视频画面与镜头运动…") + '" class="u-min-h-100"></textarea>'
        + '<div class="tool-form-grid"><div class="tool-field"><label>' + t("tool.vidGen.duration", "时长") + '</label><select id="vgLen"><option value="3">' + t("tool.vidGen.duration.3", "3 秒") + '</option><option value="5">' + t("tool.vidGen.duration.5", "5 秒") + '</option><option value="10">' + t("tool.vidGen.duration.10", "10 秒") + '</option></select></div></div>'
        + '<div class="tool-actions"><button type="button" class="addbtn sm btn-primary" id="vgGo"' + (aiOn ? "" : " disabled") + ">" + t("tool.vidGen.generate", "生成视频") + "</button></div>"
        + (aiOn
          ? '<p class="sub u-mt-2">' + t("tool.vidGen.noteAi", "注意：视频生成为 AI 高级能力，取决于所用模型是否支持；不支持时将提示降级方案。") + '</p>'
          : '<p class="sub u-mt-2">' + t("tool.vidGen.noAiTip", "未配置 AI——视频生成依赖 AI 服务。到 设置→AI 配置 API Key 后启用。") + '</p>');
    },
    bind: function(){
      const go = $("#vgGo"); if(!go) return;
      go.onclick = async function(){
        if(!$("#vgPrompt").value.trim()){ toast(t("tool.vidGen.enterDesc", "请输入视频描述"), "warn"); return; }
        $("#vgOut").innerHTML = sanitizeHtml('<div class="empty">' + t("tool.vidGen.emptyResult", "视频生成通道暂未开放。<br><small>当前接入的 AI 模型以文本为主；视频模型上线后会在此自动启用。</small>") + '</div>');
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
    name:t("tool.time.name","时间戳"), icon:UI_ICONS.stopwatch, desc:t("tool.time.desc","Unix ↔ 日期 双向转换"),
    render: function(){
      return '<div class="tool-filter-bar">'
        + '<button type="button" class="addbtn sm" id="tsNow">'+t("tool.time.now","当前时间")+'</button>'
        + '<span class="sub u-m-0">'+t("tool.time.tip","毫秒(13位)/秒(10位) 自动识别；右侧输入日期实时回写")+'</span>'
        + '</div>'
        + '<div class="u-grid-2col u-gap-3">'
        + '<div><label>'+t("tool.time.unix","Unix 时间戳")+'</label><input type="text" id="tsUnix" class="u-font-mono" placeholder="1789250411553 或 1789250411"></div>'
        + '<div><label>'+t("tool.time.local","本地日期时间")+'</label><input type="text" id="tsDate" class="u-font-mono" placeholder="2026-09-13 12:00:00"></div>'
        + '</div>'
        + '<div id="tsInfo" class="u-fs-2xs u-text-muted u-mt-1"></div>';
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
        if($f) $f.textContent="ISO: "+d.toISOString();
      };
      const b1=$("#tsNow"); if(b1) b1.onclick=function(){ const d=new Date(); if($u)$u.value=String(d.getTime()); if($d)$d.value=fmt(d); if($f)$f.textContent="ISO: "+d.toISOString(); };
      if($u) $u.oninput=fromUnix;
      if($d) $d.oninput=fromDate;
    }
  },
  "cod-codec": {
    name:t("tool.codec.name","编解码"), icon:UI_ICONS.md2code, desc:t("tool.codec.desc","Base64 · URL 编解码（UTF-8 安全）"),
    render: function(){
      return '<div class="tool-filter-bar">'
        + '<select id="ccMode" class="u-flex-0-1-160"><option value="b64">Base64</option><option value="url">URL</option></select>'
        + '<button type="button" class="addbtn sm" id="ccEnc">'+t("tool.codec.enc","编码 →")+'</button>'
        + '<button type="button" class="addbtn sm" id="ccDec">'+t("tool.codec.dec","← 解码")+'</button>'
        + '<button type="button" class="addbtn sm" id="ccSwap">⇅ 互换</button>'
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

/**
 * 打开工具：按 toolId 查 TOOL_APPS，命中且有 render 则打开真实工具，否则走占位页
 * @param {string} toolId - 工具 ID（如 "off-md"）
 * @param {string} label - 工具名称（用于占位页标题）
 * @returns {void}
 */
function openToolStub(toolId, label){
  if(typeof closeDrawer === "function") closeDrawer();
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
      '<input type="time" id="alarmTime" value="'+_nowHHMM()+'" required aria-label="' + t("alarm.timeAria", "闹钟时间") + '">' +
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
    if(k){ el.style.setProperty("--pet-art-scale", _petArtScale(k)); el.innerHTML = _petSvgFor(k); }
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
  if(petSvgBox) petSvgBox.innerHTML = _petSvgFor(kind);
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
function _priWeight(p){ return p==="P0"?0 : p==="P1"?1 : p==="P2"?2 : 3; }
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
        <span class="dot" style="background:${s.color}"></span>
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
      <span style="color:${fs.color}">${fs.name}</span>
      <span class="arr">→</span>
      <span style="color:${ts.color}">${ts.name}</span>
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
