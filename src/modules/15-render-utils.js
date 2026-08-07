// ===== Render Layer (渲染层·小工具) =====
/* ---------- 小工具 ---------- */
function lineChartSVG(vals, color){
  if(!vals.length) return "";
  const arr = vals.length===1? [vals[0],vals[0]] : vals;
  const W=300,H=90,max=Math.max(1,...arr),n=arr.length;
  const pts=arr.map((v,i)=> [ (i/(n-1))*W, H-8-(v/max)*(H-20) ]);
  const line=pts.map(p=>p[0].toFixed(1)+","+p[1].toFixed(1)).join(" ");
  const area="0,"+(H-8)+" "+line+" "+W+","+(H-8);
  return `<svg viewBox="0 0 ${W} ${H}" style="display:block;width:100%;max-width:560px;height:90px" preserveAspectRatio="none">
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

/* ---------- 渲染：侧边导航 ---------- */
// 侧边栏折叠按钮（>=1024px 显示，由 CSS 控制；点击切换 .side.collapsed，状态存 localStorage）
const SIDE_TOGGLE_HTML = `<button class="side-toggle" id="sideToggle" aria-label="折叠或展开侧边栏" title="折叠/展开">
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg><span class="lbl">折叠</span></button>`;
/**
 * 渲染侧边导航栏（总览 + 4 场景按钮，含未完成计数）
 * @returns {void}
 */
function renderSide(){
  const tasks = getActiveTasks();
  const totalOpen = tasks.filter(t=>t.status!=="done").length;
  const overview = `<button class="nav-item ${active==="overview"?"active":""}" data-sc="overview" style="--sc:var(--text-dim)">
    ${UI_ICONS.overview.replace("<svg","<svg aria-hidden=\"true\"")}<span class="nm">总览</span><span class="cnt">${totalOpen}</span></button>`;
  const statsBtn = `<button class="nav-item ${active==="stats"?"active":""}" data-sc="stats" style="--sc:var(--text-dim)">
    ${UI_ICONS.stats.replace("<svg","<svg aria-hidden=\"true\"")}<span class="nm">统计</span><span class="cnt">${tasks.length}</span></button>`;
  const recycleCount = (load(PREFIX+"tasks",[])).filter(t=>t.deletedAt).length;
  const recycleBtn = `<button class="nav-item" data-recycle="1" style="--sc:var(--muted)" title="回收站（已删除任务）">
    ${UI_ICONS.trash.replace("<svg","<svg aria-hidden=\"true\"")}<span class="nm">回收站</span>${recycleCount?`<span class="cnt">${recycleCount}</span>`:""}</button>`;
  const items = ORDER.map(sc=>{
    const s = SCENARIOS[sc];
    const open = tasks.filter(t=>t.sc===sc && t.status!=="done").length;
    return `<button class="nav-item ${sc===active?"active":""}" data-sc="${sc}" style="--sc:${s.color}">
      ${(SCENARIOS[sc].icon || "").replace("<svg","<svg aria-hidden=\"true\"")}<span class="nm">${s.name}</span><span class="cnt">${open}</span></button>`;
  }).join("");
  $("#side").innerHTML = SIDE_TOGGLE_HTML + overview + statsBtn + recycleBtn + items;
  $$("#side .nav-item").forEach(b=> b.onclick = ()=>{
    if(b.dataset.recycle){ openRecycle(); return; }
    setActive(b.dataset.sc); render();
  });
}
/* ---------- 回收站（D3：软删除任务的恢复 / 永久删除入口；T2：批量操作 + 自动清理策略） ---------- */
function openRecycle(){
  const all = load(PREFIX+"tasks", []);
  const del = all.filter(t=>t.deletedAt).slice().sort((a,b)=>b.deletedAt-a.deletedAt);
  const items = del.length ? del.map(t=>{
    const sm = scMeta(t.sc);
    const w = new Date(t.deletedAt);
    const whenStr = (w.getMonth()+1)+"/"+w.getDate()+" "+pad(w.getHours())+":"+pad(w.getMinutes());
    return `<div class="recycle-item" data-id="${esc(t.id)}">
      <input type="checkbox" class="recycle-chk" data-chk="${esc(t.id)}" aria-label="选择 ${esc(t.title)}">
      <span class="recycle-dot" style="background:${sm.color}"></span>
      <span class="recycle-title">${esc(t.title)}</span>
      <span class="recycle-sc">${sm.name}</span>
      <span class="recycle-when">${whenStr}</span>
      <button type="button" class="recycle-restore" data-restore="${esc(t.id)}">恢复</button>
      <button type="button" class="recycle-purge" data-purge="${esc(t.id)}">彻底删除</button>
    </div>`;
  }).join("") : `<div class="recycle-empty">回收站为空</div>`;
  const policy = getRecyclePolicy();
  const policyLabel = policy==="off" ? "自动清理：关闭" : "自动清理："+policy+" 天后";
  const html = `<div class="recycle-modal" id="recycleModal">
    <div class="recycle-card">
      <div class="recycle-header"><h2>回收站</h2><button type="button" class="recycle-close" id="recycleClose">✕</button></div>
      <div class="recycle-list">${items}</div>
      ${del.length ? `<div class="recycle-footer">
        <label class="recycle-selall"><input type="checkbox" id="recycleSelAll"> 全选</label>
        <button type="button" class="recycle-batch" id="recycleBatchRestore">批量恢复</button>
        <button type="button" class="recycle-batch" id="recycleBatchPurge">批量删除</button>
        <span class="recycle-policy">${policyLabel}</span>
        <button type="button" class="recycle-clear" id="recycleClear">清空回收站</button>
      </div>` : ""}
    </div></div>`;
  document.body.insertAdjacentHTML("beforeend", html);
  const modal=$("#recycleModal");
  modal._releaseTrap = trapFocus(modal.querySelector(".recycle-card")); // T5：焦点锁在弹窗内
  const close = ()=> closeRecycleModal();
  const closeBtn = $("#recycleClose"); if(closeBtn) closeBtn.onclick = close;
  if(modal) modal.onclick = e=>{ if(e.target===modal) close(); };
  $$("#recycleModal [data-restore]").forEach(b=> b.onclick=()=>{ restoreRecycle(b.dataset.restore); close(); });
  $$("#recycleModal [data-purge]").forEach(b=> b.onclick=()=>{ purgeRecycle(b.dataset.purge); close(); });
  const clr=$("#recycleClear"); if(clr) clr.onclick=()=>{ if(confirm("确定清空回收站？其中的任务将永久删除，不可恢复。")){ clearRecycle(); close(); } };
  const selAll=$("#recycleSelAll"); if(selAll) selAll.onchange=()=> $$("#recycleModal .recycle-chk").forEach(c=>{ c.checked=selAll.checked; });
  const bRestore=$("#recycleBatchRestore"); if(bRestore) bRestore.onclick=()=>{
    const ids=$$("#recycleModal .recycle-chk:checked").map(c=>c.dataset.chk);
    if(!ids.length){ toast("请先勾选要恢复的任务","warn"); return; }
    restoreRecycleBatch(ids); close();
  };
  const bPurge=$("#recycleBatchPurge"); if(bPurge) bPurge.onclick=()=>{
    const ids=$$("#recycleModal .recycle-chk:checked").map(c=>c.dataset.chk);
    if(!ids.length){ toast("请先勾选要删除的任务","warn"); return; }
    if(confirm("确定彻底删除选中的 "+ids.length+" 条任务？不可恢复。")){ purgeRecycleBatch(ids); close(); }
  };
}
function restoreRecycle(id){
  const all = load(PREFIX+"tasks", []);
  const next = all.map(t=> t.id===id ? Object.assign({}, t, { deletedAt: undefined }) : t);
  save(PREFIX+"tasks", next); scheduleAutoBackup();
  toast("已恢复任务", "ok"); render();
}
function restoreRecycleBatch(ids){
  const set = new Set(ids);
  const all = load(PREFIX+"tasks", []);
  const next = all.map(t=> set.has(t.id) ? Object.assign({}, t, { deletedAt: undefined }) : t);
  save(PREFIX+"tasks", next); scheduleAutoBackup();
  toast("已恢复 "+ids.length+" 条任务", "ok"); render();
}
function purgeRecycle(id){
  const all = load(PREFIX+"tasks", []);
  const next = all.filter(t=>t.id!==id);
  save(PREFIX+"tasks", next); scheduleAutoBackup();
  toast("已永久删除", "ok"); render();
}
function purgeRecycleBatch(ids){
  const set = new Set(ids);
  const all = load(PREFIX+"tasks", []);
  const next = all.filter(t=>!set.has(t.id));
  save(PREFIX+"tasks", next); scheduleAutoBackup();
  toast("已永久删除 "+ids.length+" 条任务", "ok"); render();
}
function clearRecycle(){
  const all = load(PREFIX+"tasks", []);
  const next = all.filter(t=>!t.deletedAt);
  save(PREFIX+"tasks", next); scheduleAutoBackup();
  toast("回收站已清空", "ok"); render();
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
  const all = load(PREFIX+"tasks", []);
  const expired = all.filter(t=>t.deletedAt && t.deletedAt < cutoff);
  if(!expired.length) return 0;
  const next = all.filter(t=>!(t.deletedAt && t.deletedAt < cutoff));
  save(PREFIX+"tasks", next); scheduleAutoBackup();
  toast("回收站已自动清理 "+expired.length+" 条超过 "+days+" 天的任务","ok");
  return expired.length;
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
 * 关闭回收站弹窗（含焦点陷阱解除）；返回是否关闭了弹窗
 * @returns {boolean}
 */
function closeRecycleModal(){
  const m=$("#recycleModal"); if(!m) return false;
  if(typeof m._releaseTrap==="function"){ try{ m._releaseTrap(); }catch(e){ /* noop */ } }
  m.remove();
  return true;
}
/* 侧边栏折叠：事件委托绑定在 #side 上（不随 innerHTML 重建丢失），启动时恢复持久化状态 */
function setupSideToggle(){
  const side = $("#side");
  if(!side) return;
  side.addEventListener("click", (e)=>{
    if(!e.target.closest("#sideToggle")) return;
    side.classList.toggle("collapsed");
    try{ localStorage.setItem(PREFIX+"sideCollapsed", side.classList.contains("collapsed")?"1":"0"); }catch(_){}
  });
  try{ if(localStorage.getItem(PREFIX+"sideCollapsed")==="1") side.classList.add("collapsed"); }catch(_){}
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
  var sx = touchStart.clientX || 0;
  var sy = touchStart.clientY || 0;
  var ex = touchEnd.clientX || 0;
  var ey = touchEnd.clientY || 0;
  var dx = ex - sx;
  var dy = ey - sy;
  var absX = Math.abs(dx);
  var absY = Math.abs(dy);
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
  var idx = ORDER.indexOf(currentSc);
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
  var side = $("#side");
  if(!side) return;
  if(isMobileLandscape()){
    side.classList.add("collapsed");
  } else if(isMobile()){
    // 竖屏移动端：仅当不是用户主动折叠时才恢复
    var userFolded = false;
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
  var main = $("#main");
  if(!main || main._swipeBound) return;
  main._swipeBound = true;
  var touchStart = null;
  main.addEventListener("touchstart", function(e){
    if(!e || !e.touches || !e.touches[0]) return;
    touchStart = { clientX: e.touches[0].clientX, clientY: e.touches[0].clientY };
  }, { passive: true });
  main.addEventListener("touchmove", function(){
    /* passive move，不阻止默认滚动 */
  }, { passive: true });
  main.addEventListener("touchend", function(e){
    if(!touchStart) return;
    var t = e && e.changedTouches && e.changedTouches[0];
    var startX = touchStart.clientX;
    if(!t){ touchStart = null; return; }
    var touchEnd = { clientX: t.clientX, clientY: t.clientY };
    var swipe = handleSwipe(touchStart, touchEnd);
    touchStart = null;
    if(!swipe) return;
    // 右滑从左边缘（startX < 20px）打开侧边栏
    if(swipe.direction === "right" && startX < 20){
      var side = $("#side");
      if(side) side.classList.remove("collapsed");
      return;
    }
    // 左滑/右滑切换场景（仅对 ORDER 中的场景生效，overview/stats 不切换）
    if(swipe.direction === "left" || swipe.direction === "right"){
      var cur = getActive();
      if(!ORDER.includes(cur)) return;
      var next = swipeToScene(swipe.direction, cur);
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
 * @returns {void}
 */
function setupRipple(){
  var side = $("#side");
  if(!side || side._rippleBound) return;
  side._rippleBound = true;
  side.addEventListener("click", function(e){
    var item = e.target.closest && e.target.closest(".nav-item");
    if(!item) return;
    item.classList.add("ripple");
    // 动画结束后移除 .ripple（transition-base = .25s，预留 350ms 兜底）
    setTimeout(function(){
      item.classList.remove("ripple");
    }, 350);
  });
}

/* ---------- T4.2 骨架屏 + 空状态（纯 HTML 生成函数，不依赖 DOM，方便测试） ---------- */
// 空状态图标（内联 SVG，currentColor，无硬编码颜色；颜色由 .empty-icon 的 color 令牌控制）
const EMPTY_ICONS = {
  "no-tasks":'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11h6M9 15h4M5 4h14a2 2 0 0 1 2 2v14l-3-2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/></svg>',
  "no-records":'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16v4H4zM4 12h16v8H4z"/><path d="M8 16h8"/></svg>',
  "no-search":'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>',
  "no-stats":'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V10m6 10V4m6 16v-7m6 7V8"/></svg>'
};
/**
 * 渲染骨架屏（灰块占位 + 闪烁动画 wb-shimmer）
 * @param {"board"|"list"|"chat"|"stats"} type - 骨架屏类型
 * @returns {string} HTML 字符串（含 .skeleton / .skeleton-line / .skeleton-block 类）
 */
function renderSkeleton(type){
  if(type === "board"){
    const cols = [{name:"待办",n:3},{name:"进行中",n:2},{name:"已完成",n:3}];
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
      '<p class="empty-text"><strong>还没有任务</strong></p>' +
      '<p class="empty-text">按 <span class="kbd">N</span> 或点 <span class="kbd">+</span> 创建第一个任务</p>' +
      '<div class="empty-action"><button class="btn-primary" type="button" data-empty-action="new-task">+ 新建任务</button></div>' +
      '</div>';
  }
  if(type === "no-records"){
    return '<div class="empty-state">' +
      '<div class="empty-icon">'+icon+'</div>' +
      '<p class="empty-text"><strong>还没有记录</strong></p>' +
      '<p class="empty-text">在上方表单填写后点「添加」开始第一个吧</p>' +
      '</div>';
  }
  if(type === "no-search"){
    return '<div class="empty-state">' +
      '<div class="empty-icon">'+icon+'</div>' +
      '<p class="empty-text"><strong>未找到匹配结果</strong></p>' +
      '<p class="empty-text">换个关键词试试</p>' +
      '</div>';
  }
  if(type === "no-stats"){
    return '<div class="empty-state">' +
      '<div class="empty-icon">'+icon+'</div>' +
      '<p class="empty-text"><strong>暂无数据</strong></p>' +
      '<p class="empty-text">完成任务后查看统计</p>' +
      '</div>';
  }
  return "";
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
    main.innerHTML = renderSkeleton(skeletonType || "board");
  }
  setTimeout(function(){
    if(typeof fn === "function") fn();
  }, 300);
}

/* ---------- 渲染：今天要处理（A：今日仪表盘） ---------- */
// 按时间段返回问候语（A1）
function greeting(){
  const h = new Date().getHours();
  if(h < 6) return "夜深了";
  if(h < 12) return "早安";
  if(h < 14) return "午安";
  if(h < 18) return "下午好";
  if(h < 22) return "晚上好";
  return "夜深了";
}
// 优先级权重：P0 最优先，无优先级最后
function _priWeight(p){ return p==="P0"?0 : p==="P1"?1 : p==="P2"?2 : 3; }
function renderToday(){
  const tasks = getActiveTasks();
  const t = todayStr();
  const total = tasks.length, done = tasks.filter(x=>x.status==="done").length;
  // 今日到期 + 逾期待办（due <= 今天）
  const pendingToday = tasks.filter(x=>x.status!=="done" && x.due && x.due<=t);
  const pct = total? Math.round(done/total*100):0;
  const R=24, C=2*Math.PI*R, off=C*(1-pct/100);
  const ring = `<svg class="ring" viewBox="0 0 60 60">
    <circle cx="30" cy="30" r="${R}" fill="none" stroke-width="7" style="stroke:var(--surface-muted)"/>
    <circle cx="30" cy="30" r="${R}" fill="none" stroke-width="7" style="stroke:var(--accent)"
      stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${off}" transform="rotate(-90 30 30)"/>
    <text x="30" y="34" text-anchor="middle" class="pct" style="fill:var(--text)">${pct}%</text></svg>`;

  // 习惯链进行中数量（from 场景 streak > 0 且链启用）
  const links = getLinks();
  const chainsActive = links.filter(l => {
    if(l.enabled === false) return false;
    return calcStreak(l.fromSc).current > 0;
  }).length;

  // A2：今日 Top 3 任务（按 priority + due 排序）
  const top3 = pendingToday.slice().sort((a,b)=>{
    const pa = _priWeight(a.priority), pb = _priWeight(b.priority);
    if(pa !== pb) return pa - pb;
    return a.due < b.due ? -1 : 1;
  }).slice(0, 3);
  let top3Html;
  if(top3.length === 0){
    top3Html = `<div class="empty">今天没有待处理的事项，去各场景添加任务吧</div>`;
  }else{
    top3Html = `<ul class="top3-list">` + top3.map(x=>{
      const s = scMeta(x.sc);
      return `<li class="top3-item">
        <span class="dot" style="background:${s.color}"></span>
        <span class="title">${esc(x.title)}</span>
        <span class="sc-name">${s.name}</span>
        <button type="button" class="mini snooze-btn" data-snooze="${esc(x.id)}" title="30 分钟后再提醒">稍后</button>
      </li>`;
    }).join("") + `</ul>`;
  }

  // A3：习惯链状态条（每条链：from → to + streak + 状态图标，点击跳 from 场景）
  const chainBar = `<div class="chain-bar">` + links.map(l=>{
    const s = calcStreak(l.fromSc);
    const enabled = l.enabled !== false;
    const triggered = tasks.some(t =>
      t.sc === l.fromSc && t.linked &&
      String(t.title||"").toLowerCase().includes(String(l.kw||"").toLowerCase())
    );
    let icon, label;
    if(!enabled){ icon = "⏸"; label = "已暂停"; }
    else if(s.current > 0){ icon = "🔥"; label = s.current + "天"; }
    else if(triggered){ icon = "✓"; label = "已触发"; }
    else { icon = "○"; label = "未开始"; }
    const fs = scMeta(l.fromSc), ts = scMeta(l.toSc);
    return `<button class="chain-pill" data-chain-sc="${l.fromSc}"${enabled?"":" disabled"}>
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
        <div class="hero-greeting">${greeting()} 👋</div>
        <div class="hero-sub">今天有 ${pendingToday.length} 件事待处理 · 已完成 ${done} 件 · 习惯链 ${chainsActive} 条进行中</div>
      </div>
      <div class="hero-right">${ring}</div>
    </div>
    ${top3Html}
    ${chainBar}
  </div>`;
}

// ===== UI Layer (交互层·Onboarding 引导) =====
/* ---------- B：Onboarding 首次启动引导 ---------- */
// B1：首次启动检测（未标记 onboarded 且无任务）
function needsOnboarding(){
  if(load(PREFIX+"onboarded", false)) return false;
  const tasks = getTasks();
  return tasks.length === 0;
}
// B2：引导 modal 内部状态（当前步 + step1 选中的场景）
let _onboardStepNo = 1;
let _onboardSelectedSc = "office";
// 渲染指定步的 modal
function _onboardRenderStep(step){
  // 移除已有 modal
  const old = document.querySelector(".onboard-modal");
  if(old) old.remove();
  let html;
  if(step === 1){
    html = `<div class="onboard-modal" id="onboardModal">
      <div class="onboard-card">
        <div class="onboard-step">第 ${step} / 3 步</div>
        <div class="onboard-title">欢迎使用 Agent 工作台 👋</div>
        <div class="onboard-desc">这是一个帮你管理任务、养成习惯的工具。先创建你的第一个任务吧！</div>
        <div class="onboard-scenarios" id="onboardSc">
          ${ORDER.map(sc=>`<button type="button" class="onboard-sc-btn${sc===_onboardSelectedSc?" selected":""}" data-sc="${sc}">${SCENARIOS[sc].name}</button>`).join("")}
        </div>
        <input class="onboard-input" id="onboardTaskInput" placeholder="任务标题，如 写周报 / 修复报错 / 缴水电费">
        <div class="onboard-actions">
          <button type="button" class="onboard-btn-secondary" id="onboardSkip">跳过</button>
          <button type="button" class="onboard-btn-primary" id="onboardCreate">创建</button>
        </div>
      </div>
    </div>`;
  }else if(step === 2){
    html = `<div class="onboard-modal" id="onboardModal">
      <div class="onboard-card">
        <div class="onboard-step">第 ${step} / 3 步</div>
        <div class="onboard-title">习惯链 — 让正反馈转起来 🔗</div>
        <div class="onboard-desc">完成任务可以触发习惯链。比如交付任务完成后自动提醒你学习充电。</div>
        <div class="onboard-chain-demo">
          <span style="color:${SCENARIOS.office.color};font-size:18px;font-weight:600">${SCENARIOS.office.name}</span>
          <span class="arr">→</span>
          <span style="color:${SCENARIOS.study.color};font-size:18px;font-weight:600">${SCENARIOS.study.name}</span>
        </div>
        <div class="onboard-actions">
          <button type="button" class="onboard-btn-secondary" id="onboardSkip">跳过</button>
          <button type="button" class="onboard-btn-secondary" id="onboardTrigger">模拟触发</button>
          <button type="button" class="onboard-btn-primary" id="onboardNext">下一步</button>
        </div>
      </div>
    </div>`;
  }else if(step === 3){
    html = `<div class="onboard-modal" id="onboardModal">
      <div class="onboard-card">
        <div class="onboard-step">第 ${step} / 3 步</div>
        <div class="onboard-title">配置 AI 助手 🤖（可选）</div>
        <div class="onboard-desc">配置 AI 后，每个场景都有专属 AI 助手帮你建任务、查总览、搜索。</div>
        <div class="onboard-actions">
          <button type="button" class="onboard-btn-secondary" id="onboardSkip">稍后再说</button>
          <button type="button" class="onboard-btn-primary" id="onboardConfig">去设置</button>
        </div>
      </div>
    </div>`;
  }else{
    return;
  }
  document.body.insertAdjacentHTML("beforeend", html);
  _onboardBindStep(step);
}
// 绑定每步按钮
function _onboardBindStep(step){
  const modal = document.getElementById("onboardModal");
  const close = ()=>{ if(modal) modal.remove(); };
  if(step === 1){
    document.querySelectorAll("#onboardSc .onboard-sc-btn").forEach(b=> /** @type {HTMLElement} */(b).onclick=()=>{
      _onboardSelectedSc = /** @type {HTMLElement} */(b).dataset.sc;
      document.querySelectorAll("#onboardSc .onboard-sc-btn").forEach(x=> x.classList.remove("selected"));
      b.classList.add("selected");
    });
    const skip = document.getElementById("onboardSkip");
    if(skip) skip.onclick = ()=>{ close(); _onboardRenderStep(2); };
    const create = document.getElementById("onboardCreate");
    if(create) create.onclick = ()=>{
      const input = /** @type {HTMLInputElement} */(document.getElementById("onboardTaskInput"));
      const title = input ? input.value.trim() : "";
      if(!title){ toast("请输入任务标题", "warn"); return; }
      const tasks = getTasks();
      tasks.push({id:uid(), sc:_onboardSelectedSc, title, due:todayStr(), priority:"", status:"todo", doneAt:null, note:"", tags:[], created:Date.now()});
      setTasks(tasks);
      toast("已创建第一个任务，去「" + SCENARIOS[_onboardSelectedSc].name + "」场景查看", "ok");
      close(); _onboardRenderStep(2);
    };
  }else if(step === 2){
    const skip = document.getElementById("onboardSkip");
    if(skip) skip.onclick = ()=>{ close(); _onboardRenderStep(3); };
    const trigger = document.getElementById("onboardTrigger");
    if(trigger) trigger.onclick = ()=>{
      // 创建一个 office 交付任务并完成，触发联动
      const tasks = getTasks();
      const t = {id:uid(), sc:"office", title:"交付上线 v2.3", due:todayStr(), priority:"P1", status:"todo", doneAt:null, note:"onboarding 模拟触发", tags:["onboarding"], created:Date.now()};
      tasks.push(t);
      setTasks(tasks);
      completeTask(t.id);
      toast("已模拟触发：交付完成 → 自动生成学习充电任务", "ok");
      /** @type {HTMLButtonElement} */(trigger).disabled = true; trigger.textContent = "已触发";
    };
    const next = document.getElementById("onboardNext");
    if(next) next.onclick = ()=>{ close(); _onboardRenderStep(3); };
  }else if(step === 3){
    const skip = document.getElementById("onboardSkip");
    if(skip) skip.onclick = ()=>{ close(); _finishOnboarding(); };
    const config = document.getElementById("onboardConfig");
    if(config) config.onclick = ()=>{ close(); _finishOnboarding(); try{ openDrawer(); }catch(e){ /* noop */ } };
  }
}
// 引导完成：标记 onboarded 并渲染主界面
function _finishOnboarding(){
  save(PREFIX+"onboarded", true);
  try{ render(); checkCount(); dailyDigest(); }catch(e){ /* noop */ }
}
// B2：渲染引导 modal（入口）
function renderOnboarding(){
  _onboardStepNo = 1;
  _onboardSelectedSc = "office";
  _onboardRenderStep(_onboardStepNo);
}

// ===== UI Layer (交互层·使用指南) =====
/* ---------- 渲染：使用指南 modal ---------- */
// helpSection(id, title, content) — 生成一个可折叠章节；id==="快速上手" 时默认展开
function helpSection(id, title, content){
  return `<details class="help-section"${id==="快速上手"?" open":""}><summary>${title}</summary><div class="help-content">${content}</div></details>`;
}

// renderHelp() — 渲染使用指南 modal（7 章节，内联内容，details 原生折叠）
function renderHelp(){
  const old = document.querySelector(".help-modal");
  if(old) old.remove();
  const html = `<div class="help-modal" id="helpModal">
    <div class="help-card">
      <div class="help-header">
        <h2>📖 使用指南</h2>
        <button class="help-close" id="helpClose">✕</button>
      </div>
      <div class="help-body">
        ${helpSection("快速上手", "快速上手", `
          <p>3 步开始使用：</p>
          <ol>
            <li><b>建任务</b>：点左侧场景（办公/编程/学习），在任务看板点「+」添加任务</li>
            <li><b>完成任务</b>：点任务卡片的「完成」按钮，可能触发习惯链自动生成奖励任务</li>
            <li><b>用 AI</b>：在场景底部的聊天框输入「建个任务：明天写周报」「查总览」「搜索 跑步」</li>
          </ol>
        `)}
        ${helpSection("场景说明", "场景说明", `
          <p><b>办公</b>（蓝色）：会议纪要、工作任务、周报。AI 帮你梳理任务、润色邮件。</p>
          <p><b>编程</b>（绿色）：代码片段、工程任务。AI 给可运行代码和架构建议。</p>
          <p><b>学习</b>（橙色）：学习资料 + SM-2 间隔复习。AI 帮制定学习计划。</p>
          <p><b>生活</b>（紫色）：日常待办、购物清单、缴费提醒与生活备忘。AI 帮打理琐事、有条理。</p>
        `)}
        ${helpSection("习惯链", "习惯链", `
          <p>完成任务可以自动触发跨场景的奖励/后续任务，形成正反馈闭环：</p>
          <div class="help-chain-demo">
            <span style="color:var(--accent)">办公</span> 交付 → <span style="color:var(--warn)">学习</span> 看技术视频<br>
            <span style="color:var(--warn)">学习</span> 复习 → <span style="color:var(--accent)">编程</span> 写小项目<br>
            <span style="color:var(--accent)">编程</span> 上线 → <span style="color:var(--sc-life)">生活</span> 犒劳自己
          </div>
          <p>在设置抽屉可以编辑习惯链规则（关键词、奖励任务、启用/禁用）。</p>
        `)}
        ${helpSection("AI 使用技巧", "AI 使用技巧", `
          <p>每个场景有专属 AI 助手（不同 system prompt）。在聊天框输入：</p>
          <ul>
            <li>「建个任务：明天写周报」→ AI 调用 create_task 工具</li>
            <li>「查总览」→ AI 调用 query_overview 工具</li>
            <li>「搜索 跑步」→ AI 调用 search 工具</li>
            <li>「完成任务 xxx」→ AI 调用 complete_task 工具</li>
            <li>开启 Agent 模式后还可「记住：我喜欢简洁回复」「帮我规划：本周清理办公待办」等多步任务</li>
          </ul>
          <p>AI 可以调用多种工具管理你的工作台数据（含 Agent 记忆/目标工具）。在设置中配置 API Key 后启用。</p>
        `)}
        ${helpSection("SM-2 间隔复习", "SM-2 间隔复习", `
          <p>学习场景的资料支持间隔复习（SM-2 算法）。复习时选 4 个评分：</p>
          <ul>
            <li><b>Again</b>（重试）：忘了，明天再复习</li>
            <li><b>Hard</b>（困难）：勉强记得，缩短间隔</li>
            <li><b>Good</b>（良好）：正常记住，按计划推进</li>
            <li><b>Easy</b>（简单）：轻松记住，拉长间隔</li>
          </ul>
          <p>系统自动计算下次复习日期和 ease factor，今日待复习的会在学习场景高亮。</p>
        `)}
        ${helpSection("快捷键", "快捷键", `
          <table class="help-keys">
            <tr><td><kbd>1</kbd>-<kbd>4</kbd></td><td>切换场景（办公/编程/学习/生活）</td></tr>
            <tr><td><kbd>Ctrl</kbd>+<kbd>K</kbd></td><td>命令面板（搜索任务、切换场景）</td></tr>
            <tr><td><kbd>Esc</kbd></td><td>关闭弹窗/抽屉</td></tr>
          </table>
        `)}
        ${helpSection("数据安全", "数据安全", `
          <p><b>AI Key 加密</b>：API Key 用 AES-GCM 加密存储，设备密钥首次随机生成。明文仅在内存中。</p>
          <p><b>导出备份</b>：在设置抽屉「数据管理」点「导出 JSON」下载备份。可选是否包含 AI Key 明文。</p>
          <p><b>导入恢复</b>：在「数据管理」点「导入恢复」上传备份文件恢复数据。</p>
          <p><b>自动备份</b>：每次修改数据后自动快照到 localStorage，数据损坏时可恢复。</p>
          <p><b>注意</b>：数据存于浏览器 localStorage，清浏览器数据会丢失！请定期导出备份。</p>
        `)}
      </div>
    </div>
  </div>`;
  document.body.insertAdjacentHTML("beforeend", html);
  const closeBtn = $("#helpClose");
  if(closeBtn) closeBtn.onclick = ()=>{ const m = $("#helpModal"); if(m) m.remove(); };
  // 点击遮罩关闭
  const modal = $("#helpModal");
  if(modal) modal.onclick = (e)=>{ if(e.target === modal) modal.remove(); };
}

