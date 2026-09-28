// ===== UI Layer (交互层·全局事件绑定·日历与可视化) =====
/* ---------- v1.6-B 日历视图：月历看任务 dueDate 分布 ----------
 * 能力：
 *   1) renderCalendarView(monthOffset)  — 生成某月日历 HTML（含任务计数徽章）
 *   2) getCalendarMonthData(monthOffset) — 返回某月 {year, month} 数字
 *   3) renderWeekView(weekOffset)        — 生成某周日历 HTML（7 天列表）
 *   4) bindCalendarEvents(container)     — 绑定月份切换/日期点击事件
 *
 * 设计约定：
 *   - 周一为一周起点（getDay()+6)%7
 *   - 任务按 dueDate（YYYY-MM-DD）分桶；同日多个任务在格子里显示徽章数字
 *   - 今日格子加 .today 类；有任务的格子加 .has-tasks 类
 *   - 所有颜色用 var(--token) CSS 令牌（lint-colors 门禁）
 *   - innerHTML 赋值用 sanitizeHtml 包裹（调用方负责）
 */
/**
 * 渲染月历视图 HTML
 * @param {number} [monthOffset=0] - 月偏移（0=本月，-1=上月，1=下月）
 * @returns {string} 日历 HTML（含表头/星期表头/日期格子）
 */
function renderCalendarView(monthOffset){
  const data = getCalendarMonthData(monthOffset);
  const year = data.year, month = data.month;

  const firstDay = new Date(year, month, 1);
  const startWeekday = (firstDay.getDay() + 6) % 7; // 周一=0
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const tasks = getActiveTasks();
  const taskByDate = {};
  tasks.forEach(function(t){
    if(t.due){
      const d = new Date(t.due);
      const key = _ymd(d);
      if(!taskByDate[key]) taskByDate[key] = [];
      taskByDate[key].push(t);
    }
  });

  let html = '<div class="cal-header">';
  html += '<button type="button" class="cal-nav" data-cal-prev title="' + t("p5.prevMonth", "上一月") + '">‹</button>';
  html += '<span class="cal-title">' + year + t("p5.yearSuffix", "年") + (month + 1) + t("p5.monthSuffix", "月</span>");
  html += '<button type="button" class="cal-nav" data-cal-next title="' + t("p5.nextMonth", "下一月") + '">›</button>';
  html += '</div>';
  html += '<div class="cal-grid">';
  [t("p5.dow1","一"),t("p5.dow2","二"),t("p5.dow3","三"),t("p5.dow4","四"),t("p5.dow5","五"),t("p5.dow6","六"),t("p5.dow7","日")].forEach(function(d){
    html += '<div class="cal-dow">' + d + '</div>';
  });
  for(let i = 0; i < startWeekday; i++) html += '<div class="cal-day empty"></div>';
  const todayKey = _ymd(new Date());
  for(let d = 1; d <= daysInMonth; d++){
    const dateStr = year + "-" + String(month + 1).padStart(2, "0") + "-" + String(d).padStart(2, "0");
    const dayTasks = taskByDate[dateStr] || [];
    let cls = "cal-day";
    if(dayTasks.length > 0) cls += " has-tasks";
    if(dateStr === todayKey) cls += " today";
    html += '<div class="' + cls + '" data-cal-date="' + dateStr + '">';
    html += '<span class="cal-num">' + d + '</span>';
    if(dayTasks.length > 0) html += '<span class="cal-badge">' + dayTasks.length + '</span>';
    html += '</div>';
  }
  html += '</div>';
  return html;
}
/**
 * 获取某月的年份/月份数字（处理跨年偏移）
 * @param {number} [monthOffset=0] - 月偏移
 * @returns {{year:number,month:number}} month 为 0-11
 */
function getCalendarMonthData(monthOffset){
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth() + (monthOffset || 0);
  while(month < 0){ month += 12; year--; }
  while(month > 11){ month -= 12; year++; }
  return { year: year, month: month };
}
/**
 * 渲染周历视图 HTML（7 天列表，每天显示任务数与标题预览）
 * @param {number} [weekOffset=0] - 周偏移（0=本周，-1=上周）
 * @returns {string} 周历 HTML
 */
function renderWeekView(weekOffset){
  const now = new Date();
  const wd = (now.getDay() + 6) % 7; // 周一=0
  const mon = new Date(now);
  mon.setDate(now.getDate() - wd + (weekOffset || 0) * 7);
  mon.setHours(0, 0, 0, 0);

  const tasks = getActiveTasks();
  const taskByDate = {};
  tasks.forEach(function(t){
    if(t.due){
      const key = _ymd(new Date(t.due));
      if(!taskByDate[key]) taskByDate[key] = [];
      taskByDate[key].push(t);
    }
  });

  const todayKey = _ymd(new Date());
  let html = '<div class="cal-header">';
  html += '<button type="button" class="cal-nav" data-cal-prev-week title="' + t("p5.prevWeek", "上一周") + '">‹</button>';
  html += '<span class="cal-title">' + t("p5.weekView", "周视图") + '</span>';
  html += '<button type="button" class="cal-nav" data-cal-next-week title="' + t("p5.nextWeek", "下一周") + '">›</button>';
  html += '</div>';
  html += '<div class="week-grid">';
  const dowNames = [t("p5.mon","周一"),t("p5.tue","周二"),t("p5.wed","周三"),t("p5.thu","周四"),t("p5.fri","周五"),t("p5.sat","周六"),t("p5.sun","周日")];
  for(let i = 0; i < 7; i++){
    const d = new Date(mon);
    d.setDate(mon.getDate() + i);
    const key = _ymd(d);
    const dayTasks = taskByDate[key] || [];
    let cls = "week-day";
    if(dayTasks.length > 0) cls += " has-tasks";
    if(key === todayKey) cls += " today";
    html += '<div class="' + cls + '" data-cal-date="' + key + '">';
    html += '<div class="week-day-head"><span class="week-dow">' + dowNames[i] + '</span>';
    html += '<span class="week-date">' + (d.getMonth() + 1) + '/' + d.getDate() + '</span></div>';
    if(dayTasks.length > 0){
      html += '<ul class="week-task-list">';
      dayTasks.slice(0, 3).forEach(function(t){
        html += '<li class="week-task-item">' + esc(t.title) + '</li>';
      });
      if(dayTasks.length > 3) html += '<li class="week-task-more">+' + (dayTasks.length - 3) + '</li>';
      html += '</ul>';
    } else {
      html += '<div class="week-empty">—</div>';
    }
    html += '</div>';
  }
  html += '</div>';
  return html;
}
/**
 * 绑定日历视图事件（上一月/下一月/日期点击）
 * @param {HTMLElement} [container] - 日历容器（默认 #calendarView）
 * @returns {void}
 */
function bindCalendarEvents(container){
  const c = container || $("#calendarView");
  if(!c) return;
  const prev = c.querySelector("[data-cal-prev]");
  const next = c.querySelector("[data-cal-next]");
  if(prev && !prev._calBound){
    prev._calBound = true;
    prev.onclick = function(){
      const off = parseInt(c.dataset.offset || "0", 10) - 1;
      c.dataset.offset = String(off);
      c.innerHTML = sanitizeHtml(renderCalendarView(off));
      bindCalendarEvents(c);
    };
  }
  if(next && !next._calBound){
    next._calBound = true;
    next.onclick = function(){
      const off = parseInt(c.dataset.offset || "0", 10) + 1;
      c.dataset.offset = String(off);
      c.innerHTML = sanitizeHtml(renderCalendarView(off));
      bindCalendarEvents(c);
    };
  }
  // 日期格子点击：派发自定义事件供外部监听
  c.querySelectorAll("[data-cal-date]").forEach(function(cell){
    if(cell._calDateBound) return;
    cell._calDateBound = true;
    cell.onclick = function(){
      const date = cell.getAttribute("data-cal-date");
      try{
        const ev = new CustomEvent("cal:date-select", { detail: { date: date } });
        c.dispatchEvent(ev);
      }catch(e){ /* CustomEvent 不可用时 no-op */ }
    };
  });
}// ===== Gantt Chart (v1.6-C 数据可视化增强) =====
/* ---------- 甘特图：任务时间线，按 dueDate 排列，显示任务依赖 ----------
 * 能力：
 *   1) renderGanttChart()       — 生成甘特图 SVG（任务条形按 created→due 时间区间）
 *   2) getGanttData()           — 返回甘特图数据（按 dueDate 升序）
 *   3) openGanttModal()         — 打开甘特图弹窗
 *   4) closeGanttModal()        — 关闭甘特图弹窗
 *
 * 设计约定：
 *   - 仅渲染带 due（截止日期）的任务；due 为 "YYYY-MM-DD" 字符串
 *   - 起点用 created（时间戳），无 created 时回退到 due 解析时间
 *   - 状态色：done→var(--ok)；doing→var(--accent)；todo→var(--muted)
 *   - 所有颜色用 var(--token) CSS 令牌（lint-colors 门禁）
 *   - innerHTML 赋值由调用方用 sanitizeHtml 包裹
 */
/**
 * 把 due 日期字符串("YYYY-MM-DD")解析为时间戳；非法时返回 0
 * @param {string} due - 截止日期字符串
 * @returns {number} 时间戳
 */
function _ganttParseDue(due){
  if(!due) return 0;
  const dueMs = Date.parse(due);
  return isNaN(dueMs) ? 0 : dueMs;
}
/**
 * 渲染甘特图 SVG
 * @returns {string} HTML 字符串（svg 或空状态提示）
 */
function renderGanttChart(){
  const tasks = getActiveTasks().filter(function(t){ return t && t.due; });
  if(tasks.length === 0) return t("p5.noDueTasks", "<p class='empty-hint'>暂无带截止日期的任务</p>");

  // 按 dueDate 升序排序
  tasks.sort(function(a, b){
    return _ganttParseDue(a.due) - _ganttParseDue(b.due);
  });

  // 计算时间范围（min 用最早 created 或 due，max 用最晚 due）
  let minDate = Infinity, maxDate = -Infinity;
  tasks.forEach(function(t){
    const start = (typeof t.created === "number" && t.created) || _ganttParseDue(t.due);
    const end = _ganttParseDue(t.due);
    if(start < minDate) minDate = start;
    if(end > maxDate) maxDate = end;
  });
  // 兜底：minDate 与 maxDate 相等时扩展 1ms，避免除零
  if(maxDate <= minDate) maxDate = minDate + 86400000;
  const range = maxDate - minDate;

  // 生成 SVG
  // labelW 加到 150：给中文标题留足宽度，避免溢出挤压右侧任务条
  const W = 800, labelW = 150, barAreaW = W - labelW - 20;
  const H = tasks.length * 28 + 30;
  let svg = '<svg class="gantt-chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + t("p5.ganttAria", "任务甘特图") + '">';
  // 顶部时间轴基线
  svg += '<line x1="' + labelW + '" y1="20" x2="' + (W - 10) + '" y2="20" stroke="var(--line)" stroke-width="1"/>';
  // 起止日期标签
  const minLabel = _ganttFmtDate(minDate);
  const maxLabel = _ganttFmtDate(maxDate);
  svg += '<text x="' + labelW + '" y="14" font-size="var(--fs-3xs)" fill="var(--muted)">' + esc(minLabel) + '</text>';
  svg += '<text x="' + (W - 10) + '" y="14" text-anchor="end" font-size="var(--fs-3xs)" fill="var(--muted)">' + esc(maxLabel) + '</text>';

  tasks.forEach(function(t, i){
    const y = i * 28 + 26;
    let start = (typeof t.created === "number" && t.created) || _ganttParseDue(t.due);
    let end = _ganttParseDue(t.due);
    if(start < minDate) start = minDate;
    if(end > maxDate) end = maxDate;
    if(end < start) end = start;
    const x1 = labelW + (start - minDate) / range * barAreaW;
    const x2 = labelW + (end - minDate) / range * barAreaW;
    const w = Math.max(x2 - x1, 4);
    const color = t.status === "done" ? "var(--ok)"
              : t.status === "doing" ? "var(--accent)"
              : "var(--muted)";
    // 任务条
    svg += '<rect x="' + x1.toFixed(1) + '" y="' + y + '" width="' + w.toFixed(1) + '" height="18" fill="' + color + '" rx="3"><title>' + esc(t.title || "") + '（' + esc(t.due || "") + '）</title></rect>';
    // 任务标签（左侧）：按视觉宽度截断（中文≈2 单位宽，英文 1 单位），上限 22 单位紧贴 labelW=150 区宽
    const rawTitle = t.title || "";
    let wAcc = 0, cut = rawTitle.length;
    for (let ci = 0; ci < rawTitle.length; ci++){
      wAcc += (/[\u2E80-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF]/.test(rawTitle.charAt(ci)) ? 2 : 1);
      if (wAcc > 22){ cut = ci; break; }
    }
    const label = cut < rawTitle.length ? rawTitle.slice(0, Math.max(1, cut - 1)) + "…" : rawTitle;
    svg += '<text x="6" y="' + (y + 13) + '" class="gantt-label" font-size="var(--fs-2xs)" fill="var(--text)">' + esc(label) + '</text>';
  });
  svg += '</svg>';
  return svg;
}
/**
 * 格式化时间戳为 YYYY-MM-DD
 * @param {number} ts - 时间戳
 * @returns {string} 日期字符串
 */
function _ganttFmtDate(ts){
  const d = new Date(ts);
  if(isNaN(d.getTime())) return "";
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
}
/**
 * 获取甘特图数据（按 dueDate 升序）
 * @returns {Array<{id:string,title:string,start:number,end:number,status:string,scenario:string,due:string}>}
 */
function getGanttData(){
  const tasks = getActiveTasks().filter(function(t){ return t && t.due; });
  tasks.sort(function(a, b){
    return _ganttParseDue(a.due) - _ganttParseDue(b.due);
  });
  return tasks.map(function(t){
    return {
      id: t.id,
      title: t.title || "",
      start: (typeof t.created === "number" && t.created) || _ganttParseDue(t.due),
      end: _ganttParseDue(t.due),
      status: t.status || "todo",
      scenario: t.sc || "",
      due: t.due
    };
  });
}
/**
 * 打开甘特图弹窗（渲染到 #ganttModal）
 * @returns {void}
 */
function openGanttModal(){
  const modal = $("#ganttModal");
  if(!modal) return;
  const body = $("#ganttModalBody");
  if(body) body.innerHTML = sanitizeHtml(renderGanttChart());
  modal.classList.add("show");
}
/**
 * 关闭甘特图弹窗
 * @returns {void}
 */
function closeGanttModal(){
  const modal = $("#ganttModal");
  if(modal) modal.classList.remove("show");
}// ===== Mind Map (v1.6-C 数据可视化增强) =====
/* ---------- 思维导图：任务关系图，场景→任务→子任务树形展开 ----------
 * 能力：
 *   1) renderMindmap()       — 生成思维导图 SVG（中心节点→场景→任务叶子）
 *   2) getMindmapTree()      — 返回按场景分组的任务树
 *   3) openMindmapModal()    — 打开思维导图弹窗
 *   4) closeMindmapModal()   — 关闭思维导图弹窗
 *
 * 设计约定：
 *   - 中心节点："任务"，向外辐射 4 个场景节点（office/code/study/life）
 *   - 每个场景节点再向外展开最多 5 个任务叶子（避免拥挤）
 *   - 所有颜色用 var(--token) CSS 令牌（lint-colors 门禁）
 *   - innerHTML 赋值由调用方用 sanitizeHtml 包裹
 */
/**
 * 渲染思维导图 SVG
 * @returns {string} HTML 字符串（svg）
 */
function renderMindmap(){
  const tasks = getActiveTasks();
  const tree = {};
  ORDER.forEach(function(sc){ tree[sc] = []; });
  tasks.forEach(function(t){
    if(t && t.sc && tree[t.sc]) tree[t.sc].push(t);
  });

  const W = 900, H = 600;
  const cx = W / 2, cy = H / 2;
  let svg = '<svg class="mindmap" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + t("p5.mindmapAria", "任务思维导图") + '">';
  // 中心节点
  svg += '<circle cx="' + cx + '" cy="' + cy + '" r="40" fill="var(--accent)"/>';
  svg += '<text x="' + cx + '" y="' + (cy + 5) + '" text-anchor="middle" fill="var(--on-accent)" font-size="var(--fs-sm)">' + t("p5.task", "任务") + '</text>';

  // 场景分支
  const scCount = ORDER.length;
  ORDER.forEach(function(sc, i){
    const angle = (i / scCount) * 2 * Math.PI - Math.PI / 2;
    const x = cx + Math.cos(angle) * 150;
    const y = cy + Math.sin(angle) * 150;
    const meta = scMeta(sc);
    const name = meta.name;
    // 连线（中心→场景）
    svg += '<line x1="' + cx + '" y1="' + cy + '" x2="' + x.toFixed(1) + '" y2="' + y.toFixed(1) + '" stroke="var(--border)" stroke-width="2"/>';
    // 场景节点
    svg += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="25" fill="var(--surface)" stroke="var(--accent)" stroke-width="2"/>';
    svg += '<text x="' + x.toFixed(1) + '" y="' + (y + 5).toFixed(1) + '" text-anchor="middle" fill="var(--text)" font-size="12">' + esc(name) + '</text>';
    // 任务叶子（最多 5 个，沿同方向外延展开）
    const scTasks = tree[sc] || [];
    const leafCount = Math.min(scTasks.length, 5);
    scTasks.slice(0, 5).forEach(function(t, j){
      const spread = leafCount > 1 ? (j - (leafCount - 1) / 2) * 22 : 0;
      // 沿场景方向外延 80，再垂直方向偏移 spread
      const dx = Math.cos(angle) * 80;
      const dy = Math.sin(angle) * 80;
      // 垂直方向向量（旋转 90°）
      const nx = -Math.sin(angle);
      const ny = Math.cos(angle);
      const tx = x + dx + nx * spread;
      const ty = y + dy + ny * spread;
      // 连线（场景→任务）
      svg += '<line x1="' + x.toFixed(1) + '" y1="' + y.toFixed(1) + '" x2="' + tx.toFixed(1) + '" y2="' + ty.toFixed(1) + '" stroke="var(--line)" stroke-width="1"/>';
      // 任务叶子节点（小圆点 + 文本）
      svg += '<circle cx="' + tx.toFixed(1) + '" cy="' + ty.toFixed(1) + '" r="3" fill="var(--muted)"/>';
      const label = (t.title || "").length > 10 ? (t.title || "").slice(0, 9) + "…" : (t.title || "");
      const textX = tx + (angle > -Math.PI / 2 && angle < Math.PI / 2 ? 6 : -6);
      const anchor = (angle > -Math.PI / 2 && angle < Math.PI / 2) ? "start" : "end";
      svg += '<text x="' + textX.toFixed(1) + '" y="' + (ty + 4).toFixed(1) + '" text-anchor="' + anchor + '" fill="var(--text-dim)" font-size="var(--fs-3xs)">' + esc(label) + '</text>';
    });
    // 超出 5 个时显示省略提示
    if(scTasks.length > 5){
      const moreX = x + Math.cos(angle) * 80;
      const moreY = y + Math.sin(angle) * 80 + leafCount * 11;
      svg += '<text x="' + moreX.toFixed(1) + '" y="' + moreY.toFixed(1) + '" text-anchor="middle" fill="var(--muted)" font-size="var(--fs-3xs)">+' + (scTasks.length - 5) + '</text>';
    }
  });
  svg += '</svg>';
  return svg;
}
/**
 * 获取按场景分组的任务树
 * @returns {Object<string, Array<Task>>} 场景键→任务数组
 */
function getMindmapTree(){
  const tasks = getActiveTasks();
  const tree = {};
  ORDER.forEach(function(sc){ tree[sc] = tasks.filter(function(t){ return t && t.sc === sc; }); });
  return tree;
}
/**
 * 打开思维导图弹窗（渲染到 #mindmapModal）
 * @returns {void}
 */
function openMindmapModal(){
  const modal = $("#mindmapModal");
  if(!modal) return;
  const body = $("#mindmapModalBody");
  if(body) body.innerHTML = sanitizeHtml(renderMindmap());
  modal.classList.add("show");
}
/**
 * 关闭思维导图弹窗
 * @returns {void}
 */
function closeMindmapModal(){
  const modal = $("#mindmapModal");
  if(modal) modal.classList.remove("show");
}// ===== Custom Dashboard (v1.6-C 数据可视化增强) =====
/* ---------- 自定义仪表盘：拖拽组件排列，保存布局到 localStorage ----------
 * 能力：
 *   1) DASHBOARD_WIDGETS             — 预置组件清单（id/name/defaultPos）
 *   2) getDashboardLayout()          — 读取布局（localStorage 优先，否则默认）
 *   3) saveDashboardLayout(layout)   — 持久化布局到 localStorage
 *   4) renderCustomDashboard()       — 渲染仪表盘 HTML（grid 布局 + 拖拽手柄）
 *   5) resetDashboard()              — 重置为默认布局
 *   6) moveDashboardWidget(id, pos)  — 移动组件到新位置
 *   7) openDashboardModal()          — 打开仪表盘弹窗
 *   8) closeDashboardModal()         — 关闭仪表盘弹窗
 *   9) bindDashboardDnD()            — 绑定拖拽事件
 *
 * 设计约定：
 *   - 布局持久化键：PREFIX + "dashboard_layout"
 *   - 拖拽实现：HTML5 DnD（draggable=true），手柄 .widget-drag 触发
 *   - 所有颜色用 var(--token) CSS 令牌（lint-colors 门禁）
 *   - innerHTML 赋值由调用方用 sanitizeHtml 包裹
 */
const DASHBOARD_LAYOUT_KEY = "dashboard_layout";
/**
 * 预置组件清单
 * @type {Array<{id:string,name:string,defaultPos:{x:number,y:number,w:number,h:number}}>}
 */
const DASHBOARD_WIDGETS = [
  /* v2.2.1：组件多元化——列表/表格/操作类与图表类并列；default:true 构成默认布局 */
  { id: "stats",    name: t("dashboard.stats","关键指标"),   default: true,  defaultPos: { x: 1, y: 1, w: 2, h: 1 } },
  { id: "today",    name: t("dashboard.today","今日待办"),   default: true,  defaultPos: { x: 3, y: 1, w: 2, h: 1 } },
  { id: "trend",    name: t("dashboard.trend","任务完成趋势"), default: true,  defaultPos: { x: 5, y: 1, w: 1, h: 2 } },
  { id: "scenes",   name: t("dashboard.scenes","场景概况"),   default: true,  defaultPos: { x: 1, y: 2, w: 2, h: 1 } },
  { id: "pie",      name: t("dashboard.pie","场景分布"),   default: true,  defaultPos: { x: 3, y: 2, w: 1, h: 1 } },
  { id: "heatmap",  name: t("dashboard.heatmap","热力图"),     default: true,  defaultPos: { x: 4, y: 2, w: 1, h: 1 } },
  { id: "chain",    name: t("dashboard.chain","联动触发率"), default: true,  defaultPos: { x: 1, y: 3, w: 2, h: 1 } },
  { id: "recent",   name: t("dashboard.recent","最近完成"),   default: true,  defaultPos: { x: 3, y: 3, w: 3, h: 1 } },
  { id: "actions",  name: t("dashboard.actions","快捷操作"),   default: false, defaultPos: { x: 1, y: 4, w: 5, h: 1 } },
  { id: "hourdist", name: t("dashboard.hourdist","完成时段分布"), default: false, defaultPos: { x: 1, y: 5, w: 2, h: 1 } },
  { id: "report",   name: t("dashboard.report","高级报表"),   default: false, defaultPos: { x: 3, y: 5, w: 3, h: 1 } },
  { id: "gantt",    name: t("dashboard.gantt","甘特图"),     default: false, defaultPos: { x: 1, y: 6, w: 3, h: 1 } },
  { id: "mindmap",  name: t("dashboard.mindmap","思维导图"),   default: false, defaultPos: { x: 4, y: 6, w: 2, h: 1 } },
  { id: "radar",    name: t("dashboard.radar","雷达图"),     default: false, defaultPos: { x: 1, y: 7, w: 2, h: 1 } },
  { id: "sankey",   name: t("dashboard.sankey","桑基图"),     default: false, defaultPos: { x: 3, y: 7, w: 3, h: 1 } }
];
/**
 * 生成默认布局（v2.2.0：仅含 default:true 的核心组件）
 * @returns {Array<{id:string,pos:{x:number,y:number,w:number,h:number}}>}
 */
function _defaultDashboardLayout(){
  return DASHBOARD_WIDGETS.filter(function(w){ return w.default !== false; }).map(function(w){
    return { id: w.id, pos: { x: w.defaultPos.x, y: w.defaultPos.y, w: w.defaultPos.w, h: w.defaultPos.h } };
  });
}
/**
 * 读取仪表盘布局（localStorage 优先，否则默认）
 * @returns {Array<{id:string,pos:{x:number,y:number,w:number,h:number}}>}
 */
function getDashboardLayout(){
  try{
    const raw = localStorage.getItem(PREFIX + DASHBOARD_LAYOUT_KEY);
    if(!raw) return _defaultDashboardLayout();
    const parsed = JSON.parse(raw);
    if(!Array.isArray(parsed) || parsed.length === 0) return _defaultDashboardLayout();
    // 校验每项结构，缺失时回退默认
    return parsed.filter(function(item){
      return item && typeof item.id === "string" && item.pos &&
        typeof item.pos.x === "number" && typeof item.pos.y === "number" &&
        typeof item.pos.w === "number" && typeof item.pos.h === "number";
    });
  }catch(e){
    return _defaultDashboardLayout();
  }
}
/**
 * 持久化仪表盘布局到 localStorage
 * @param {Array<{id:string,pos:Object}>} layout - 布局数组
 * @returns {boolean} 是否保存成功
 */
function saveDashboardLayout(layout){
  try{
    localStorage.setItem(PREFIX + DASHBOARD_LAYOUT_KEY, JSON.stringify(layout));
    return true;
  }catch(e){
    return false;
  }
}
/**
 * 重置仪表盘为默认布局
 * @returns {void}
 */
function resetDashboard(){
  saveDashboardLayout(_defaultDashboardLayout());
}
/**
 * 移动组件到新位置
 * @param {string} id - 组件 id
 * @param {{x:number,y:number,w:number,h:number}} pos - 新位置
 * @returns {boolean} 是否移动成功
 */
function moveDashboardWidget(id, pos){
  if(!id || !pos) return false;
  const layout = getDashboardLayout();
  const item = layout.find(function(it){ return it.id === id; });
  if(!item) return false;
  item.pos = { x: pos.x, y: pos.y, w: pos.w || item.pos.w, h: pos.h || item.pos.h };
  return saveDashboardLayout(layout);
}
/**
 * 渲染单个组件内容
 * @param {string} id - 组件 id
 * @returns {string} 组件 HTML 内容
 */
function _renderDashboardWidget(id){
  if(id === "stats"){
    return _renderDashboardStatsWidget();
  }
  /* v2.2.1：非图表组件——列表 / 进度 / 操作，让仪表盘不止有图表 */
  if(id === "today"){
    return typeof _renderTodayTopHtml === "function" ? _renderTodayTopHtml() : t("p5.todayTodo", "<p class='widget-empty'>今日待办</p>");
  }
  if(id === "scenes"){
    const bars = ORDER.map(function(sc){
      const s = SCENARIOS[sc] || {};
      const all = getActiveTasks().filter(function(t){ return t.sc === sc; });
      const dn = all.filter(function(t){ return t.status === "done"; }).length;
      const tot = all.length;
      const pct = tot ? Math.round(dn / tot * 100) : 0;
      return '<div class="bar"><span class="nm">' + esc(s.name || sc) + '</span>' +
        '<span class="track"><span class="fill" style="width:' + pct + '%;background:' + (s.color || "var(--accent)") + '"></span></span>' +
        '<span class="v">' + dn + '/' + tot + '</span></div>';
    }).join("");
    return '<div class="bars">' + bars + '</div>';
  }
  if(id === "recent"){
    const doneList = getActiveTasks().filter(function(t){ return t.status === "done" && t.doneAt; })
      .sort(function(a, b){ return b.doneAt - a.doneAt; }).slice(0, 5);
    if(!doneList.length) return t("p5.noDoneTasks", "<p class='widget-empty'>还没有已完成的任务</p>");
    const now = Date.now();
    const items = doneList.map(function(task){
      const s = SCENARIOS[task.sc] || {};
      const mins = Math.floor((now - task.doneAt) / 60000);
      const ago = mins < 60 ? mins + t("p5.minutesAgo", " 分钟前") : mins < 1440 ? Math.floor(mins / 60) + t("p5.hoursAgo", " 小时前") : Math.floor(mins / 1440) + t("p5.daysAgo", " 天前");
      return '<li class="top3-item"><span class="dot" style="background:' + (s.color || "var(--muted)") + '"></span>' +
        '<span class="title">' + esc(task.title) + '</span><span class="sc-name">' + esc(s.name || task.sc) + ' · ' + ago + '</span></li>';
    }).join("");
    return '<ul class="top3-list">' + items + '</ul>';
  }
  if(id === "actions"){
    return '<div class="dash-actions-grid">' +
      '<button type="button" class="addbtn" id="dashActNew" data-sc="accent"><span class="ic-inline" aria-hidden="true">' + UI_ICONS.plus + '</span>' + t('p5.newTask', '新建任务') + '</button>' +
      '<button type="button" class="addbtn" id="dashActSearch" data-sc="accent"><span class="ic-inline" aria-hidden="true">' + UI_ICONS.search + '</span>' + t('p5.globalSearch', '全局搜索') + '</button>' +
      '<button type="button" class="addbtn" id="dashActReport" data-sc="accent"><span class="ic-inline" aria-hidden="true">' + UI_ICONS.stats + '</span>' + t('p5.advReport', '高级报表') + '</button>' +
      '<button type="button" class="addbtn" id="dashActExport" data-sc="muted"><span class="ic-inline" aria-hidden="true">' + UI_ICONS.download + '</span>' + t('p5.exportJson', '导出 JSON') + '</button>' +
      '</div>';
  }
  if(id === "trend"){
    const days = (typeof _statsTrendDays === "number" && _statsTrendDays) ? _statsTrendDays : 7;
    const trendData = typeof calcTrend === "function" ? calcTrend(days) : [];
    const chart = typeof renderTrendChart === "function" ? renderTrendChart(trendData, "var(--accent)") : "";
    const tabs = [7,14,30].map(function(d){
      return '<button type="button" class="stats-tab' + (days === d ? " active" : "") + '" data-trend-days="' + d + '">' + (d === 7 ? t("p5.week7", "周（7 天）") : d === 14 ? t("p5.biweek14", "双周（14 天）") : t("p5.month30", "月（30 天）")) + '</button>';
    }).join("");
    return '<div class="stats-trend-tabs">' + tabs + '</div><p class="sub">' + t('p5.recentDays', '最近 ') + days + t('p5.daysTaskCount', ' 天每天完成任务数</p>') + chart;
  }
  if(id === "pie"){
    const dist = typeof calcSceneDist === "function" ? calcSceneDist() : [];
    return typeof renderPieChart === "function" ? renderPieChart(dist) : t("p5.sceneDist", "<p class='widget-empty'>场景分布</p>");
  }
  if(id === "heatmap"){
    return typeof renderHeatmap === "function" ? renderHeatmap("office") : t("p5.heatmap", "<p class='widget-empty'>热力图</p>");
  }
  if(id === "chain"){
    /* v2.2.0：每条链的环形成功率（沿用原统计页视觉），无链时显示联动状态 */
    const chains = typeof calcChainSuccess === "function" ? (calcChainSuccess() || []) : [];
    const ringR = 20, ringC = 2 * Math.PI * ringR;
    const chainsHtml = chains.length ? chains.map(function(c){
      const fromColor = (typeof SCENARIOS !== "undefined" && SCENARIOS[c.fromSc]) ? SCENARIOS[c.fromSc].color : "var(--muted)";
      const toColor = (typeof SCENARIOS !== "undefined" && SCENARIOS[c.toSc]) ? SCENARIOS[c.toSc].color : "var(--muted)";
      const dashOffset = ringC * (1 - c.rate / 100);
      const ringSvg = '<svg class="stats-chain-ring-svg" width="48" height="48" viewBox="0 0 48 48" role="img" aria-label="' + t('p5.successRate', '成功率 ') + c.rate + '%">' +
        '<circle cx="24" cy="24" r="' + ringR + '" fill="none" stroke="var(--surface-muted)" stroke-width="4"></circle>' +
        '<circle cx="24" cy="24" r="' + ringR + '" fill="none" stroke="' + fromColor + '" stroke-width="4" stroke-dasharray="' + ringC.toFixed(2) + '" stroke-dashoffset="' + dashOffset.toFixed(2) + '" transform="rotate(-90 24 24)" stroke-linecap="round"></circle>' +
        '<text x="24" y="28" text-anchor="middle" font-size="var(--fs-2xs)" fill="var(--text)">' + c.rate + '%</text></svg>';
      return '<div class="stats-chain' + (c.enabled ? "" : " disabled") + '">' +
        '<div class="stats-chain-head">' +
        '<span style="color:' + fromColor + '">' + esc((SCENARIOS[c.fromSc] ? SCENARIOS[c.fromSc].name : c.fromSc)) + '</span>' +
        '<span class="arr">→</span>' +
        '<span style="color:' + toColor + '">' + esc((SCENARIOS[c.toSc] ? SCENARIOS[c.toSc].name : c.toSc)) + '</span>' +
        '<span class="stats-chain-meta">' + t('p5.trigger', '触发 ') + c.triggered + t('p5.sourceDone', ' / 源完成 ') + c.sourceDone + '</span></div>' +
        '<div class="stats-chain-ring">' + ringSvg + '</div></div>';
    }).join("") : t('p5.noChain', '<div class="empty">暂无联动规则</div>');
    return t('p5.chainRateHeader', '<h3>联动触发率</h3><p class="sub">每条规则近 30 天触发次数 / 源场景完成数</p>') + chainsHtml;
  }
  if(id === "hourdist"){
    const hd = typeof calcHourDist === "function" ? calcHourDist(30) : null;
    if(!hd || !hd.length){ return t("p5.hourDist", "<p class='widget-empty'>完成时段分布</p>"); }
    return typeof renderHourDistGrid === "function" ? renderHourDistGrid(hd) : t("p5.hourDist", "<p class='widget-empty'>完成时段分布</p>");
  }
  if(id === "report"){
    return t('p5.reportSub', '<p class="sub">周 / 月 / 年报，自动汇总任务完成情况</p>') +
      '<button type="button" class="btn-primary" id="btnStatsOpenReport"><span class="ic-inline" aria-hidden="true">' + UI_ICONS.stats + '</span>' + t('p5.openAdvReport', '打开高级报表') + '</button>';
  }
  if(id === "gantt"){
    return typeof renderGanttChart === "function" ? renderGanttChart() : t("p5.gantt", "<p class='widget-empty'>甘特图</p>");
  }
  if(id === "mindmap"){
    return typeof renderMindmap === "function" ? renderMindmap() : t("p5.mindmap", "<p class='widget-empty'>思维导图</p>");
  }
  if(id === "radar"){
    const radarData = typeof getRadarData === "function" ? getRadarData() : [];
    return typeof radarChartSVG === "function" ? radarChartSVG(radarData) : t("p5.radar", "<p class='widget-empty'>雷达图</p>");
  }
  if(id === "sankey"){
    const sankeyData = typeof getSankeyData === "function" ? getSankeyData() : { nodes: [], links: [] };
    return typeof sankeyChartSVG === "function" ? sankeyChartSVG(sankeyData) : t("p5.sankey", "<p class='widget-empty'>桑基图</p>");
  }
  return "";
}
/**
 * 渲染关键指标组件（v2.2.0：完整 10 指标卡，复用 .stats-cards 响应式栅格）
 * @returns {string} 关键指标 HTML
 */
function _renderDashboardStatsWidget(){
  const stats = typeof calcStats === "function" ? calcStats() : { total: 0, done: 0, rate: 0, weekDone: 0, bestStreak: 0 };
  const kpi = typeof _calcTodayKpi === "function" ? _calcTodayKpi() : { todayDone: 0, currentStreak: 0, overdue: 0 };
  const avg = typeof calcAvgCycle === "function" ? calcAvgCycle() : { days: null };
  const cards = [
    { label: t("p5.totalTasks", "总任务数"), value: stats.total },
    { label: t("p5.done", "已完成"), value: stats.done },
    { label: t("p5.inProgress", "进行中"), value: stats.total - stats.done },
    { label: t("p5.completionRate", "完成率"), value: stats.rate + "%" },
    { label: t("p5.avgCycle", "平均周期"), value: avg.days === null || avg.days === undefined ? "-" : avg.days + t("p5.day", " 天") },
    { label: t("p5.weekDone", "本周完成"), value: stats.weekDone },
    { label: t("p5.todayDone", "今日完成"), value: kpi.todayDone },
    { label: t("p5.currentStreak", "当前连续"), value: kpi.currentStreak + t("p5.day", " 天") },
    { label: t("p5.bestStreak", "最长连续"), value: stats.bestStreak + t("p5.day", " 天") },
    { label: t("p5.overdue", "逾期任务"), value: kpi.overdue }
  ];
  let html = '<div class="stats-cards dash-stats-cards">';
  html += cards.map(function(c){
    return '<div class="stats-card"><div class="stats-card-val">' + c.value + '</div><div class="stats-card-lbl">' + c.label + '</div></div>';
  }).join("");
  html += '</div>';
  return html;
}
/**
 * 渲染自定义仪表盘（v2.2.0：editMode 区分展示/编辑两态——Grafana 式）
 * @param {boolean} [editMode] - true 显示拖拽手柄/删除钮/配置工具条；默认 false 纯展示
 * @returns {string} 仪表盘 HTML
 */
function renderCustomDashboard(editMode){
  const edit = editMode === true;
  const layout = getDashboardLayout();
  let html = '';
  if(edit){
    /* 配置态工具条：添加组件（未在布局中的）+ 重置 + 完成编辑 */
    const notIn = DASHBOARD_WIDGETS.filter(function(w){
      return !layout.some(function(it){ return it.id === w.id; });
    });
    const addOpts = notIn.length
      ? '<select id="dashAddSel" aria-label="' + t('p5.addWidget', '添加组件') + '"><option value="">' + t('p5.addWidgetEllipsis', '添加组件…') + '</option>' + notIn.map(function(w){
          return '<option value="' + esc(w.id) + '">' + esc(w.name) + '</option>'; }).join('') + '</select>'
      : t('p5.allWidgetsAdded', '<span class="dash-toolbar-hint">所有组件均已添加</span>');
    html += '<div class="dash-toolbar card">' + addOpts +
      '<button type="button" class="addbtn sm" id="btnDashboardReset" data-sc="muted">' + t('p5.resetLayout', '重置布局') + '</button>' +
      '<button type="button" class="btn-primary" id="btnDashDone"><span class="ic-inline" aria-hidden="true">' + UI_ICONS.check + '</span>' + t('p5.doneEdit', '完成编辑') + '</button>' +
      t('p5.dragHint', '<span class="dash-toolbar-hint">拖拽 ⋮⋮ 手柄交换组件位置；右上 ✕ 移除组件</span></div>');
  }
  html += '<div class="dashboard-grid">';
  layout.forEach(function(item){
    const widget = DASHBOARD_WIDGETS.find(function(w){ return w.id === item.id; });
    if(!widget) return;
    const p = item.pos;
    html += '<div class="dashboard-widget' + (edit ? ' editing' : '') + '" draggable="' + (edit ? 'true' : 'false') + '" data-widget="' + esc(item.id) + '" style="grid-column:' + p.x + ' / span ' + p.w + ';grid-row:' + p.y + ' / span ' + p.h + '">';
    html += '<div class="widget-header"><span class="widget-name">' + esc(widget.name) + '</span>' +
      (edit ? '<span class="widget-ops"><button type="button" class="widget-drag" title="' + t('p5.dragMove', '拖拽移动') + '" aria-label="' + t('p5.dragMove', '拖拽移动 ') + esc(widget.name) + '">⋮⋮</button>' +
       '<button type="button" class="widget-del" title="' + t('p5.removeWidget', '移除组件') + '" aria-label="' + t('p5.remove', '移除 ') + esc(widget.name) + '">✕</button></span>' : '') + '</div>';
    html += '<div class="widget-body">' + _renderDashboardWidget(item.id) + '</div>';
    html += '</div>';
  });
  html += '</div>';
  return html;
}
/**
 * v2.2.0：添加组件到布局（自动放到网格尾部空行）
 * @param {string} id - 组件 id
 * @returns {boolean} 是否添加成功
 */
function addDashboardWidget(id){
  const widget = DASHBOARD_WIDGETS.find(function(w){ return w.id === id; });
  if(!widget) return false;
  const layout = getDashboardLayout();
  if(layout.some(function(it){ return it.id === id; })) return false;
  let maxY = 0;
  layout.forEach(function(it){ maxY = Math.max(maxY, it.pos.y + it.pos.h - 1); });
  layout.push({ id: id, pos: { x: widget.defaultPos.x, y: maxY + 1, w: widget.defaultPos.w, h: widget.defaultPos.h } });
  return saveDashboardLayout(layout);
}
/**
 * v2.2.0：从布局移除组件
 * @param {string} id - 组件 id
 * @returns {boolean} 是否移除成功
 */
function removeDashboardWidget(id){
  const layout = getDashboardLayout();
  const idx = layout.findIndex(function(it){ return it.id === id; });
  if(idx < 0) return false;
  layout.splice(idx, 1);
  return saveDashboardLayout(layout);
}
/**
 * 打开仪表盘弹窗（渲染到 #dashboardModal）
 * @returns {void}
 */
function openDashboardModal(){
  const modal = $("#dashboardModal");
  if(!modal) return;
  const body = $("#dashboardModalBody");
  if(body){
    body.innerHTML = sanitizeHtml(renderCustomDashboard(true));
    /* v2.2.0：编辑语义（手柄/移除/工具条）；listener 挂 body 幂等 */
    bindDashboardDnD(body, true);
    _bindDashToolbar(body, true);
  }
  modal.classList.add("show");
}
/**
 * 关闭仪表盘弹窗
 * @returns {void}
 */
function closeDashboardModal(){
  const modal = $("#dashboardModal");
  if(modal) modal.classList.remove("show");
}
/**
 * 绑定仪表盘拖拽事件（HTML5 DnD，事件委托）
 * @returns {void}
 */
function bindDashboardDnD(container, editMode){
  /* v2.2.0：container 参数化——弹窗（#dashboardModalBody）与统计页（#dashHost）共用；
     drop 后重渲染回 container 自身并重绑（编辑态语义） */
  const body = container || $("#dashboardModalBody");
  if(!body || body._dashDndBound) return;
  body._dashDndBound = true;
  const isEdit = editMode === true;
  const refresh = function(){
    body.innerHTML = sanitizeHtml(renderCustomDashboard(isEdit));
    _bindDashToolbar(body, isEdit);
  };
  let dragId = null;
  body.addEventListener("dragstart", function(e){
    const w = e.target.closest(".dashboard-widget");
    if(!w) return;
    dragId = w.getAttribute("data-widget");
    try{ e.dataTransfer.setData("text/plain", dragId); e.dataTransfer.effectAllowed = "move"; }catch(_){}
    w.classList.add("dragging");
  });
  body.addEventListener("dragend", function(e){
    const w = e.target.closest(".dashboard-widget");
    if(w) w.classList.remove("dragging");
    $$(".dashboard-widget.drag-over", body).forEach(function(el){ el.classList.remove("drag-over"); });
    dragId = null;
  });
  body.addEventListener("dragover", function(e){
    e.preventDefault(); // 必须始终调用，浏览器才知道允许 drop
    if(e.dataTransfer) e.dataTransfer.dropEffect = "move";
    const w = e.target.closest(".dashboard-widget");
    $$(".dashboard-widget.drag-over", body).forEach(function(el){ el.classList.remove("drag-over"); });
    if(!w || !dragId || w.getAttribute("data-widget") === dragId) return;
    w.classList.add("drag-over");
  });
  body.addEventListener("dragleave", function(e){
    const w = e.target.closest(".dashboard-widget");
    if(w && !w.contains(e.relatedTarget)) w.classList.remove("drag-over");
  });
  body.addEventListener("drop", function(e){
    e.preventDefault();
    const w = e.target.closest(".dashboard-widget");
    $$(".dashboard-widget.drag-over", body).forEach(function(el){ el.classList.remove("drag-over"); });
    if(!w || !dragId) return;
    const targetId = w.getAttribute("data-widget");
    if(targetId === dragId){ dragId = null; return; }
    const layout = getDashboardLayout();
    const a = layout.find(function(it){ return it.id === dragId; });
    const b = layout.find(function(it){ return it.id === targetId; });
    if(a && b){
      const tmp = a.pos; a.pos = b.pos; b.pos = tmp;
      saveDashboardLayout(layout);
      refresh();
    }
    dragId = null;
  });
}
/**
 * v2.2.0：绑定编辑态工具条（添加组件 / 重置 / 完成编辑 / widget 移除 / 趋势 tab）
 * 弹窗与统计页共用；容器级事件委托，重渲染后幂等
 */
function _bindDashToolbar(container, editMode){
  if(!container) return;
  /* 添加组件下拉 */
  const addSel = container.querySelector("#dashAddSel");
  if(addSel){
    addSel.onchange = function(){
      const id = addSel.value;
      if(!id) return;
      if(addDashboardWidget(id)){
        container.innerHTML = sanitizeHtml(renderCustomDashboard(editMode === true));
        _bindDashToolbar(container, editMode === true);
      }
    };
  }
  /* 重置布局 */
  const resetBtn = container.querySelector("#btnDashboardReset");
  if(resetBtn){
    resetBtn.onclick = function(){
      resetDashboard();
      container.innerHTML = sanitizeHtml(renderCustomDashboard(editMode === true));
      _bindDashToolbar(container, editMode === true);
    };
  }
  /* 完成编辑（仅统计页容器有） */
  const doneBtn = container.querySelector("#btnDashDone");
  if(doneBtn){
    doneBtn.onclick = function(){
      _dashEditMode = false;
      if(typeof render === "function"){ try{ render(); }catch(e){ /* noop */ } }
    };
  }
  /* widget 移除钮（事件委托） */
  container.querySelectorAll(".widget-del").forEach(function(btn){
    btn.onclick = function(){
      const w = btn.closest(".dashboard-widget");
      if(!w) return;
      removeDashboardWidget(w.getAttribute("data-widget"));
      container.innerHTML = sanitizeHtml(renderCustomDashboard(editMode === true));
      _bindDashToolbar(container, editMode === true);
    };
  });
  /* 趋势 tab（展示/编辑态均可切） */
  container.querySelectorAll(".stats-tab[data-trend-days]").forEach(function(btn){
    btn.onclick = function(){
      _statsTrendDays = parseInt(btn.getAttribute("data-trend-days"), 10) || 7;
      container.innerHTML = sanitizeHtml(renderCustomDashboard(editMode === true));
      _bindDashToolbar(container, editMode === true);
    };
  });
  /* 高级报表入口 */
  const repBtn = container.querySelector("#btnStatsOpenReport");
  if(repBtn){
    repBtn.onclick = function(){
      if(typeof openReportModal === "function"){ openReportModal("week", 0); if(typeof bindReportModal === "function") bindReportModal(); }
    };
  }
  /* v2.2.1：快捷操作组件 */
  const actNew = container.querySelector("#dashActNew");
  if(actNew) actNew.onclick = function(){
    if(typeof setActive === "function"){ setActive("office"); }
    if(typeof render === "function"){ try{ render(); }catch(e){} }
    const f = document.querySelector("#taskForm");
    if(f && f.title){ try{ f.title.focus(); }catch(e){} }
  };
  const actSearch = container.querySelector("#dashActSearch");
  if(actSearch) actSearch.onclick = function(){
    if(typeof setActive === "function"){ setActive("overview"); }
    if(typeof render === "function"){ try{ render(); }catch(e){} }
    const gs = document.querySelector("#globSearch");
    if(gs){ try{ gs.focus(); }catch(e){} }
  };
  const actReport = container.querySelector("#dashActReport");
  if(actReport) actReport.onclick = function(){
    if(typeof openReportModal === "function"){ openReportModal("week", 0); if(typeof bindReportModal === "function") bindReportModal(); }
  };
  const actExport = container.querySelector("#dashActExport");
  if(actExport) actExport.onclick = function(){
    if(typeof doExport === "function"){ try{ doExport(); }catch(e){} }
  };
}// ===== Notes & Knowledge Base (v1.6-D 知识管理) =====
