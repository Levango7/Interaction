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
/* ---------- v3.7.71 会议进日历：办公场景 record 的会议（date/startTime 字段）按日期分桶 ----------
 * 此前日历只看任务 dueDate，办公场景「会议纪要」里明明录了会议日期/开始时间，
 * 「今天的会」却在日历上看不到（数据在、链路断）。会议与任务分色展示，不混计数。 */
function _meetingsByDate(){
  const byDate = {};
  let recs = [];
  try{ recs = (typeof getRec === "function") ? getRec("office") : []; }catch(e){ recs = []; }
  recs.forEach(function(r){
    if(!r || !r.date) return;
    if(!byDate[r.date]) byDate[r.date] = [];
    byDate[r.date].push(r);
  });
  return byDate;
}

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
  const meetingByDate = _meetingsByDate();
  /* v3.7.84：外部日历事件（ICS 源）第三种分色，与任务徽章、会议标记三者分开计数 */
  const extByDate = (typeof _icsEventsByDate === "function") ? _icsEventsByDate() : {};

  let html = '<div class="cal-header">';
  html += '<button type="button" class="cal-nav" data-ics-open title="' + esc(t("p5.icsTitle", "订阅日历源")) + '">☰</button>';
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
    /* v3.7.71：当日有会议 → 格子底部「会」标记（hover 看场次），与任务徽章分开计数 */
    const dayMeetings = meetingByDate[dateStr] || [];
    if(dayMeetings.length > 0){
      const first = dayMeetings[0];
      const tip = dayMeetings.map(function(m){ return (m.startTime ? m.startTime + " " : "") + (m.title || ""); }).join("\n");
      html += '<span class="cal-meeting" title="' + esc(tip) + '">' + esc(t("p5.meetingMark","会")) + (dayMeetings.length > 1 ? "×" + dayMeetings.length : "") + '</span>';
      if(first && first.startTime) html += '<!-- mt:' + esc(first.startTime) + ' -->';
    }
    /* v3.7.84：外部事件徽章（绿系，与任务/会议分色；点击看当日首条详情） */
    const dayExt = extByDate[dateStr] || [];
    if(dayExt.length > 0){
      const tip2 = dayExt.slice(0, 4).map(function(e){ return ((e.start && (e.start.getHours() + ":" + String(e.start.getMinutes()).padStart(2, "0")) || "") + " " + (e.title || "")) + (e.subName ? "（" + e.subName + "）" : ""); }).join("\n");
      const badgeColor = (typeof _icsColorOf === "function") ? _icsColorOf(dayExt[0]) : "var(--ok-text)";
      html += '<span class="cal-ics" data-ics-day="' + esc(dateStr) + '" title="' + esc(tip2) + '" style="color:' + badgeColor + ';border-color:' + badgeColor + '">' + esc(t("p5.icsMark", "历")) + (dayExt.length > 1 ? "×" + dayExt.length : "") + '</span>';
    }
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
  const meetingByDate = _meetingsByDate();

  const todayKey = _ymd(new Date());
  const extByDate2 = (typeof _icsEventsByDate === "function") ? _icsEventsByDate() : {};
  let html = '<div class="cal-header">';
  html += '<button type="button" class="cal-nav" data-ics-open title="' + esc(t("p5.icsTitle", "订阅日历源")) + '">☰</button>';
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
    const dayMeetings = (meetingByDate[key] || []).slice().sort(function(a,b){ return (a.startTime||"") < (b.startTime||"") ? -1 : 1; });
    const dayExt2 = (extByDate2[key] || []).sort(function(a, b){ return (a.start ? a.start.getTime() : 0) - (b.start ? b.start.getTime() : 0); });
    if(dayMeetings.length > 0 || dayTasks.length > 0 || dayExt2.length > 0){
      html += '<ul class="week-task-list">';
      /* v3.7.71：会议行在前（有 startTime 的按时间序），任务随后 */
      dayMeetings.forEach(function(m){
        html += '<li class="week-meeting-item">' + (m.startTime ? '<span class="week-meeting-time">' + esc(m.startTime) + '</span>' : "") + esc(m.title || "") + '</li>';
      });
      /* v3.7.84：外部日历事件行（绿系，按开始时间序，最多 3 条） */
      dayExt2.slice(0, 3).forEach(function(e, ei){
        const tm = e.start ? (e.start.getHours() + ":" + String(e.start.getMinutes()).padStart(2, "0")) : "";
        /* v3.7.86 B1：行可点 → 详情浮层（data 携带日期与序号） */
        html += '<li class="week-ics-item" data-ev-open="' + esc(key) + '|' + ei + '" style="cursor:pointer">' + (tm ? '<span class="week-ics-time">' + esc(tm) + '</span>' : "") + esc(e.title || "") + '</li>';
      });
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
  const c = container || $("#tasksCalView") || $("#calendarModalBody");   /* v3.7.86 B2：#calendarView 随旧弹窗化石删除 */
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
  /* v3.7.84：订阅日历源面板入口 + 外部事件徽章点击（当日首条详情 toast） */
  const icsOpen = c.querySelector("[data-ics-open]");
  if(icsOpen && !icsOpen._icsBound){
    icsOpen._icsBound = true;
    icsOpen.onclick = function(){ openIcsPanel(c); };
  }
  /* v3.7.86 B1：周视图外部事件行 → 详情浮层 */
  c.querySelectorAll("[data-ev-open]").forEach(function(row){
    if(row._evBound) return;
    row._evBound = true;
    row.onclick = function(ev){
      ev.stopPropagation();
      const parts = String(row.getAttribute("data-ev-open") || "").split("|");
      openEventDetail(parts[0], parseInt(parts[1], 10) || 0);
    };
  });
  c.querySelectorAll("[data-ics-day]").forEach(function(badge){
    if(badge._icsBound) return;
    badge._icsBound = true;
    badge.onclick = function(ev){
      ev.stopPropagation();
      openEventDetail(badge.getAttribute("data-ics-day"), 0);   /* v3.7.86 B1：完整详情浮层 */
    };
  });
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
    /* v3.7.70：旧写 var(--border) / var(--panel2) 全仓零定义 → 浏览器静默回退
       （连线取初始描边色、圆填充变透明）。项目实际令牌是 --line（线）/ --panel（主表面）。 */
    svg += '<line x1="' + cx + '" y1="' + cy + '" x2="' + x.toFixed(1) + '" y2="' + y.toFixed(1) + '" stroke="var(--line)" stroke-width="2"/>';
    // 场景节点
    svg += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="25" fill="var(--panel)" stroke="var(--accent)" stroke-width="2"/>';
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

/* v3.7.77 解耦：注册 AppBridge 槽（日历/看板/甘特/思维导图）—— render 块经桥调用，
   不再直接引用本块符号（逆层边消除）。注册在加载时执行，晚于 core 定义、早于任何用户交互。 */
try{ AppBridge.openMindmapModal = openMindmapModal; }catch(e){}
try{ AppBridge.openGanttModal = openGanttModal; }catch(e){}
try{ AppBridge.openDashboardModal = openDashboardModal; }catch(e){}
try{ AppBridge.bindCalendarEvents = bindCalendarEvents; }catch(e){}
try{ AppBridge.bindDashboardDnD = bindDashboardDnD; }catch(e){}
try{ AppBridge._bindDashToolbar = _bindDashToolbar; }catch(e){}
try{ AppBridge.renderCalendarView = renderCalendarView; }catch(e){}


/* ============================================================
 * ICS 日历源（v3.7.84）
 * 定位：日历内核（月/周视图）本就自研，缺的是"外部事件入口"。两条零凭据数据路：
 *   ① 本地导入 .ics 文件（纯本地，零风险）；
 *   ② 公开只读 ICS 订阅链接（QQ日历/网易日历等，**国内直连可达**）——
 *      多数日历服务不回 CORS 头，桌面版经主进程只读中继抓取（安全面同 jira-fetch：
 *      仅 GET、https、拒 userinfo、拒回环/私网/链路本地、**拒重定向**、≤2MB、URL 由
 *      用户自己填且不携带任何认证头，日志只记主机）。
 * 解析：**自写 RFC5545 子集**（VEVENT/SUMMARY/DTSTART/DTEND/LOCATION/DESCRIPTION/UID +
 * 行折叠 + 转义还原 + FREQ=DAILY/WEEKLY/MONTHLY/YEARLY × COUNT/INTERVAL/UNTIL 的有限
 * 展开）——本仓铁律是经典 <script> 单文件、零运行时依赖、无打包器，引 npm 解析库即破链
 * （ical.js / node-ical 等开源实现只作边界情形对照）。
 * 已知取舍（诚实登记）：BYDAY/BYMONTHDAY 等复杂 RRULE 不展开，只取 VEVENT 本体；
 * 事件详情浮层本期只出 toast（完整浮层列为后续）；日历视图不随数据自动重拉（手动刷新）。
 * ============================================================ */
const ICS_SUBS_KEY = "cal_ics_subs";
const ICS_MAX_EVENTS = 2000;          // 单源事件上限（防恶意/超大订阅打爆 localStorage）
const ICS_TITLE_MAX = 300;            // 标题截断
/* v3.7.90：本地 .ics 导入的体积上限，与网络订阅同口径
   （electron/main.js 的 ics-fetch 用 2MB 封顶；此处此前无限制，两条入口不对称） */
const ICS_LOCAL_MAX_BYTES = 2 * 1024 * 1024;
/** 读取全部日历源 */
function getIcsSubs(){
  try{
    const raw = localStorage.getItem(PREFIX + ICS_SUBS_KEY);
    const a = raw ? JSON.parse(raw) : [];
    if(!Array.isArray(a)) return [];
    /* v3.7.90：**读入口负责把日期还原成 Date**。
       落盘走 JSON，Date 会变成 ISO 字符串；而解析器产出的是 Date，消费方（月视图徽章提示
       `e.start.getHours()`、周视图排序 `a.start.getTime()` 与事件行）都按 Date 用 ——
       于是「导入 .ics 后日历页直接抛 TypeError: e.start.getHours is not a function」
       （实测：导入成功、紧接着渲染即崩）。单测没照到，是因为夹具里的 start 一直是内存中的
       Date，从未过一遍存储。在此集中还原，比在每个消费点各来一次可靠。 */
    return a.map(function(s){
      if(!s || !Array.isArray(s.evs)) return s;
      s.evs = s.evs.map(function(ev){
        if(!ev) return ev;
        const o = Object.assign({}, ev);
        if(o.start != null && !(o.start instanceof Date)) o.start = new Date(o.start);
        if(o.end != null && !(o.end instanceof Date)) o.end = new Date(o.end);
        return o;
      });
      return s;
    });
  }catch(e){ return []; }
}
/** 持久化日历源列表（走 save() 主入口：镜像/配额告警齐备） */
function saveIcsSubs(subs){ return save(PREFIX + ICS_SUBS_KEY, subs || []); }
/** 桌面版是否有 ICS 主进程中继（浏览器形态多数日历站不回 CORS 头） */
function icsHasRelay(){
  const api = (typeof window !== "undefined" && window.electronAPI) ? window.electronAPI : null;
  return !!(api && typeof api.icsFetch === "function");
}
/** RFC5545 转义还原：\\n \\ ; \\ , \\n */
function _icsUnescape(s){ return String(s).replace(/\\([\\;,nN])/g, function(m, c){ return (c === "n" || c === "N") ? "\n" : c; }); }
/**
 * 解析 iCalendar 日期值：20260115 / 20260115T090000[Z|+0800]
 * @returns {Date|null}
 */
function _icsDate(v){
  const s = String(v || "").trim();
  let m = /^(\d{4})(\d{2})(\d{2})$/.exec(s);
  if(m) return new Date(+m[1], +m[2] - 1, +m[3]);
  m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z|[+-]\d{2}:?\d{2})?$/.exec(s);
  if(m){
    /* v3.7.89：三种口径分开 —— ① 无偏移（floating）= 本地时区解释（RFC5545 floating 语义）；
       ② Z = UTC；③ 显式 ±HHMM = Date.UTC - offset（时区无关）。
       此前两个 bug 都在这一行上：floating 被加偏移（UTC+8 机器双重套用错 8 小时）、
       修复版又把 floating 一起塞进 UTC（导出往返 getHours 错 8 小时）——测试双双抓出。 */
    if(!m[7]) return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
    if(m[7] === "Z") return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]));
    const z = /^([+-])(\d{2}):?(\d{2})$/.exec(m[7]);
    const offMin = z ? ((z[1] === "-" ? -1 : 1) * (Number(z[2]) * 60 + Number(z[3]))) : 0;
    return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) - offMin * 60000);
  }
  return null;
}
/** RRULE 有限展开（FREQ=DAILY/WEEKLY/MONTHLY/YEARLY × INTERVAL/COUNT/UNTIL，≤100 条） */
function _icsExpandRule(start, rruleText, cap){
  const out = [];
  if(!rruleText || !start) return [start];
  const parts = {};
  String(rruleText).replace(/^RRULE:/i, "").split(";").forEach(function(kv){
    const i = kv.indexOf("=");
    if(i > 0) parts[kv.slice(0, i).toUpperCase()] = kv.slice(i + 1);
  });
  const freq = String(parts.FREQ || "").toUpperCase();
  if(["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].indexOf(freq) < 0) return [start];   /* 复杂规则只取本体 */
  if(parts.BYDAY || parts.BYMONTHDAY || parts.BYMONTH) return [start];              /* 同上，如实受限 */
  const step = Math.max(1, parseInt(parts.INTERVAL || "1", 10) || 1);
  const count = parts.COUNT ? Math.max(1, parseInt(parts.COUNT, 10) || 1) : (cap || 100);
  const until = parts.UNTIL ? _icsDate(parts.UNTIL) : null;
  const limit = Math.min(count, cap || 100);
  for(let i = 0; i < limit; i++){
    const d = new Date(start.getTime());
    if(freq === "DAILY") d.setDate(d.getDate() + i * step);
    else if(freq === "WEEKLY") d.setDate(d.getDate() + i * step * 7);
    else if(freq === "MONTHLY") d.setMonth(d.getMonth() + i * step);
    else d.setFullYear(d.getFullYear() + i * step);
    if(until && d > until) break;
    out.push(d);
  }
  return out.length ? out : [start];
}
/** VALARM TRIGGER → 提前分钟数（-PT15M → 15；-P1D → 1440；正数/无 → 0） */
function _icsTriggerMin(v){
  const m = /^([+-])P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?/i.exec(String(v || "").trim());
  if(!m) return 0;
  const mins = (+(m[2] || 0)) * 1440 + (+(m[3] || 0)) * 60 + (+(m[4] || 0));
  return m[1] === "-" ? mins : 0;   /* 负数=提前提醒；正数=事后，不提醒 */
}
/**
 * 解析 iCalendar 文本 → 事件数组。格式容忍度按主流日历导出（QQ/网易/Outlook/Google）。
 * @param {string} text
 * @returns {Array<{uid:string,title:string,start:Date,end:Date|null,allDay:boolean,location:string,desc:string}>}
 */
function icsParseEvents(text){
  const raw = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = [];
  raw.split("\n").forEach(function(l){
    if(/^[ \t]/.test(l) && lines.length) lines[lines.length - 1] += l.slice(1);   /* 行折叠 */
    else lines.push(l);
  });
  const events = [];
  let cur = null;
  for(const line of lines){
    const b = /^BEGIN:VEVENT$/i.test(line.trim());
    const e = /^END:VEVENT$/i.test(line.trim());
    if(b){ cur = { }; continue; }
    if(e){
      if(cur && !cur.cancelled && cur.start && cur.title){
        const base = { uid: cur.uid || ("ics_" + events.length), title: cur.title.slice(0, ICS_TITLE_MAX),
          allDay: !!cur.allDay, location: cur.location || "", desc: (cur.desc || "").slice(0, 500),
          categories: cur.categories || "", reminderMin: (typeof cur.reminderMin === "number") ? cur.reminderMin : 0 };
        const end = cur.end || (cur.allDay ? null : new Date(cur.start.getTime() + 3600e3));
        for(const st of _icsExpandRule(cur.start, cur.rrule, 100)){
          const ev = Object.assign({}, base, { start: st, end: end ? new Date(end.getTime() + (st - cur.start)) : null });
          events.push(ev);
          if(events.length >= ICS_MAX_EVENTS) return events;   /* 真正截断：后续 VEVENT 一律不再收 */
        }
      }
      cur = null;
      continue;
    }
    if(!cur) continue;
    const i = line.indexOf(":");
    if(i < 0) continue;
    const name = line.slice(0, i).split(";")[0].trim().toUpperCase();
    const val = line.slice(i + 1);
    if(name === "SUMMARY") cur.title = _icsUnescape(val);
    else if(name === "LOCATION") cur.location = _icsUnescape(val);
    else if(name === "DESCRIPTION") cur.desc = _icsUnescape(val);
    else if(name === "UID") cur.uid = val.trim();
    else if(name === "RRULE") cur.rrule = val;
    else if(name === "DTSTART"){ cur.start = _icsDate(val); cur.allDay = /VALUE=DATE/i.test(line.slice(0, i)) || /^\d{8}$/.test(val.trim()); }
    else if(name === "DTEND") cur.end = _icsDate(val);
    else if(name === "TRIGGER") cur.reminderMin = _icsTriggerMin(val);
    else if(name === "CATEGORIES") cur.categories = _icsUnescape(val);
    else if(name === "STATUS" && /CANCELLED/i.test(val)) cur.cancelled = true;
  }
  return events.filter(function(ev){ return ev.start && ev.title; });
}
/** 全部源的外部事件按日期分桶（YYYY-MM-DD → events[]） */
function _icsEventsByDate(){
  const byDate = {};
  for(const sub of getIcsSubs()){
    if(sub.enabled === false) continue;   /* v3.7.89：per-source 启用开关（停用的源不进日历也不提醒） */
    const evs = Array.isArray(sub.evs) ? sub.evs : [];
    for(const raw of evs){
      const st = raw.start ? new Date(raw.start) : null;
      if(!st) continue;
      const key = st.getFullYear() + "-" + String(st.getMonth() + 1).padStart(2, "0") + "-" + String(st.getDate()).padStart(2, "0");
      (byDate[key] = byDate[key] || []).push(Object.assign({ subName: sub.name || "" }, raw));
    }
  }
  return byDate;
}
/**
 * 拉取/刷新一个订阅源。桌面走主进程只读中继，浏览器直连（多数站 CORS 会拦 → 如实失败）。
 * 304（If-None-Match）保留原事件只更新时间戳。永不抛错。
 */
async function icsRefreshSub(sub){
  if(!sub || !sub.url) return { ok: false, error: "no_url" };
  const api = (typeof window !== "undefined" && window.electronAPI) ? window.electronAPI : null;
  try{
    let r;
    if(api && typeof api.icsFetch === "function"){
      r = await api.icsFetch({ url: sub.url, etag: sub.etag || "", lastModified: sub.lastModified || "", timeoutMs: 15000 });
    } else {
      const headers = {};
      if(sub.etag) headers["If-None-Match"] = sub.etag;
      if(sub.lastModified) headers["If-Modified-Since"] = sub.lastModified;
      const resp = await fetch(sub.url, { headers: headers, redirect: "error" });
      const et = resp.headers && resp.headers.get ? resp.headers.get("etag") : "";
      const lm = resp.headers && resp.headers.get ? resp.headers.get("last-modified") : "";
      r = resp.status === 304
        ? { ok: true, status: 304, notModified: true, etag: et, lastModified: lm }
        : { ok: resp.ok, status: resp.status, etag: et, lastModified: lm, text: resp.ok ? await resp.text() : "" };
    }
    if(!r || !r.ok) return { ok: false, error: "HTTP " + ((r && r.status) || 0) };
    sub.ts = Date.now();
    if(r.status === 304 || r.notModified){ sub.lastCheckedAt = Date.now(); _icsPersistSub(sub); return { ok: true, notModified: true }; }
    _icsParseIntoSub(sub, r.text);
    sub.etag = (r.etag || "").toString();
    sub.lastModified = (r.lastModified || "").toString();
    sub.lastCheckedAt = Date.now();
    _icsPersistSub(sub);
    return { ok: true, count: sub.evs.length };
  }catch(e){
    return { ok: false, error: (e && e.message) ? e.message : String(e) };
  }
}
/** 把刷新后的 sub 对象回写到存储（getIcsSubs 每次直读 localStorage，不持有同一引用） */
function _icsPersistSub(sub){
  const all = getIcsSubs().map(function(s){ return s.id === sub.id ? sub : s; });
  saveIcsSubs(all);
}
/** 刷新全部订阅源（本地导入源跳过） */
async function icsRefreshAll(){
  const subs = getIcsSubs().filter(function(s){ return !!s.url && s.enabled !== false; });   /* v3.7.89：停用的源不刷新 */
  let okN = 0, failN = 0;
  for(const sub of subs){
    const r = await icsRefreshSub(sub);
    if(r.ok) okN++; else failN++;
  }
  saveIcsSubs(getIcsSubs().map(function(s){
    const src = subs.find(function(x){ return x.id === s.id; });
    return src ? src : s;
  }));
  return { ok: okN, fail: failN, total: subs.length };
}
/** 添加订阅源（仅 https） */
function icsAddSub(name, url){
  const u = String(url || "").trim();
  if(!/^https:\/\//i.test(u)) return null;
  const subs = getIcsSubs();
  subs.push({ id: "ics_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    name: String(name || u).trim().slice(0, 60), url: u, evs: [], ts: Date.now() });
  saveIcsSubs(subs);
  return subs[subs.length - 1];
}
/** 导入本地 .ics（纯本地，无网络） */
function icsImportLocal(name, text){
  const probe = { evs: [], id: "probe", url: "", name: "" };
  _icsParseIntoSub(probe, text);
  if(!probe.evs.length) return null;
  const subs = getIcsSubs();
  subs.push({ id: "ics_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    name: String(name || "导入日历").trim().slice(0, 60), url: "", local: true, evs: probe.evs, diag: probe.diag, parsedAt: Date.now(), ts: Date.now() });
  saveIcsSubs(subs);
  return { count: probe.evs.length, diag: probe.diag };
}
/** 删除日历源（其事件随之从日历视图移除） */
function icsRemoveSub(id){
  const kept = getIcsSubs().filter(function(s){ return s.id !== id; });
  saveIcsSubs(kept);
}
/** 订阅面板（在日历容器内渲染，不新增静态弹窗） */
function renderIcsPanel(){
  const subs = getIcsSubs();
  let html = '<div class="ics-panel">';
  html += '<div class="cal-header"><span class="cal-title">' + esc(t("p5.icsTitle", "订阅日历源")) + '</span>'
    + '<button type="button" class="cal-nav" data-ics-back title="' + esc(t("p5.back", "返回")) + '">‹</button></div>';
  html += '<div class="ics-add"><label class="u-block u-fs-xs u-m-2h-0-1">' + esc(t("p5.icsName", "名称")) + '</label>'
    + '<input id="icsName" class="u-w-full" placeholder="' + esc(t("p5.icsNamePh", "我的订阅")) + '">'
    + '<label class="u-block u-fs-xs u-m-2h-0-1">' + esc(t("p5.icsUrl", "ICS 订阅链接（https）")) + '</label>'
    + '<input id="icsUrl" class="u-w-full" placeholder="https://…/basic.ics">'
    + '<div class="u-flex u-mt-2 u-gap-2"><label class="addbtn sm" for="icsFile" style="cursor:pointer">' + esc(t("p5.icsImport", "导入 .ics 文件")) + '</label>'
    + '<input type="file" id="icsFile" accept=".ics,text/calendar" style="display:none">'
    + '<button type="button" class="addbtn sm btn-primary" id="icsAdd">' + esc(t("p5.icsAdd", "添加订阅")) + '</button>'
    + '<button type="button" class="addbtn sm" id="icsRefreshAll">' + esc(t("p5.icsRefreshAll", "刷新全部")) + '</button>'
    + '<button type="button" class="addbtn sm" id="icsExport">' + esc(t("p5.icsExport", "导出本地日程 .ics")) + '</button></div></div>';
  if(!subs.length){
    html += '<p class="empty-hint">' + esc(t("p5.icsEmpty", "尚未添加日历源：支持公开只读 ICS 订阅链接（QQ日历 / 网易日历 等，无需账号授权）或本地 .ics 文件导入。")) + '</p>';
  } else {
    html += '<div class="ics-list">';
    subs.forEach(function(s){
      const evN = (Array.isArray(s.evs) ? s.evs.length : 0);
      const when = s.lastCheckedAt ? new Date(s.lastCheckedAt).toLocaleString() : t("p5.icsNever", "未刷新");
      html += '<div class="ics-item' + (s.enabled === false ? " ics-off" : "") + '" data-ics-id="' + esc(s.id) + '">'
        + '<div class="ics-info"><div class="ics-item-name">' + esc(s.name) + (s.local ? " (" + esc(t("p5.icsLocalTag", "本地")) + ")" : "") + (s.enabled === false ? " <span class='ics-off-tag'>" + esc(t("p5.icsDisabledTag", "已停用")) + "</span>" : "") + '</div>'
        + '<div class="ics-item-meta">' + evN + " " + esc(t("p5.icsEventUnit", "个事件")) + " · " + esc(when) + (s.url ? " · " + esc(s.url.slice(0, 48)) : "")
        + ((s.diag && s.diag.count > 0) ? " · " + esc(t("p5.icsDiagWarn", "解析异常 {n} 条（缺标题或开始时间）").replace("{n}", String(s.diag.count))) : "") + '</div></div>'
        + '<div class="ics-actions">'
        + (s.url ? '<button type="button" class="addbtn sm" data-ics-refresh="' + esc(s.id) + '">' + esc(t("p5.icsRefresh", "刷新")) + '</button>' : "")
        + '<button type="button" class="addbtn sm" data-ics-rename="' + esc(s.id) + '">' + esc(t("p5.icsRename", "重命名")) + '</button>'
        + '<button type="button" class="addbtn sm" data-ics-toggle="' + esc(s.id) + '">' + esc(s.enabled === false ? t("p5.icsEnable", "启用") : t("p5.icsDisable", "停用")) + '</button>'
        + '<button type="button" class="addbtn sm" data-ics-del="' + esc(s.id) + '">' + esc(t("p5.icsDelete", "删除")) + '</button>'
        + '</div></div>';
    });
    html += '</div>';
  }
  if(!icsHasRelay()) html += '<p class="sub u-fs-2xs u-m-2-0-0">' + esc(t("p5.icsRelayHint", "提示：多数日历站不返回 CORS 头，浏览器形态直接拉取会被拦——订阅拉取建议用桌面版。")) + '</p>';
  html += '</div>';
  return html;
}
/** 打开订阅面板（替换日历容器内容；容器由调用方传入 —— 日历可能在场景内嵌视图或弹窗体内） */
function openIcsPanel(container){
  const c = container || $("#tasksCalView") || $("#calendarModalBody");
  if(!c) return;
  c.innerHTML = sanitizeHtml(renderIcsPanel());
  bindIcsPanel(c);
}
/** 订阅面板事件绑定 */
function bindIcsPanel(c){
  const back = c.querySelector("[data-ics-back]");
  if(back && !back._icsBound){
    back._icsBound = true;
    back.onclick = function(){   /* 回到月历：按当前偏移重渲染并重新绑定 */
      const off = parseInt(c.dataset.offset || "0", 10) || 0;
      c.innerHTML = sanitizeHtml(renderCalendarView(off));
      bindCalendarEvents(c);
    };
  }
  const add = c.querySelector("#icsAdd");
  if(add && !add._icsBound){
    add._icsBound = true;
    add.onclick = async function(){
      const name = (c.querySelector("#icsName") || {}).value || "";
      const url = (c.querySelector("#icsUrl") || {}).value || "";
      const sub = icsAddSub(name, url);
      if(!sub){ toast(t("p5.icsUrlRequired", "请填写 https:// 开头的 ICS 订阅链接"), "warn"); return; }
      const r = await icsRefreshSub(getIcsSubs().find(function(s){ return s.id === sub.id; }));
      const subs = getIcsSubs();
      saveIcsSubs(subs);
      toast(r.ok ? t("p5.icsAdded", "已添加，载入 {n} 个事件").replace("{n}", String((r.count || 0))) : t("p5.icsAddFail", "已添加但拉取失败（稍后可刷新重试）"), r.ok ? "ok" : "warn");
      openIcsPanel(c);
    };
  }
  const file = c.querySelector("#icsFile");
  if(file && !file._icsBound){
    file._icsBound = true;
    file.onchange = async function(){
      const f = file.files && file.files[0];
      file.value = "";
      if(!f) return;
      /* v3.7.90：本地导入补体积上限 —— 此前 readAsText 无任何限制，
         而**订阅路径**（网络）在 ics-fetch 主进程中已有 2MB 封顶（见 electron/main.js）。
         两条入口限额不对称：一个几百 MB 的 .ics 会被整串读进内存再跑正则，
         表现为页面长时间卡死且没有任何提示。现按订阅同口径 2MB 前置拦截。 */
      if(f.size > ICS_LOCAL_MAX_BYTES){
        toast(t("p5.icsTooLarge", "文件过大（上限 {n}MB），未导入").replace("{n}", String(Math.round(ICS_LOCAL_MAX_BYTES / 1024 / 1024))), "warn");
        return;
      }
      const text = await new Promise(function(res){
        try{ const fr = new FileReader(); fr.onload = function(){ res(String(fr.result || "")); }; fr.onerror = function(){ res(""); }; fr.readAsText(f); }
        catch(e){ res(""); }
      });
      const r = icsImportLocal(f.name, text);
      toast(r ? t("p5.icsImported", "已导入 {n} 个事件").replace("{n}", String(r.count)) : t("p5.icsImportFail", "未在该文件里找到事件"), r ? "ok" : "warn");
      openIcsPanel(c);
    };
  }
  const refreshAll = c.querySelector("#icsRefreshAll");
  if(refreshAll && !refreshAll._icsBound){
    refreshAll._icsBound = true;
    refreshAll.onclick = async function(){
      const r = await icsRefreshAll();
      toast(t("p5.icsRefreshed", "刷新完成：{ok} 成功 / {fail} 失败").replace("{ok}", String(r.ok)).replace("{fail}", String(r.fail)), r.fail ? "warn" : "ok");
      openIcsPanel(c);
    };
  }
  const exp = c.querySelector("#icsExport");
  if(exp && !exp._icsBound){
    exp._icsBound = true;
    exp.onclick = function(){ icsExportLocal(); };   /* 零凭据双向的另一半：本地 → 对方 */
  }
  /* v3.7.87 D：重命名（id 不变 → chunk docId 稳定 → 零重嵌） */
  c.querySelectorAll("[data-ics-rename]").forEach(function(b){
    if(b._icsBound) return; b._icsBound = true;
    b.onclick = function(){
      const id = b.getAttribute("data-ics-rename");
      const cur = getIcsSubs().find(function(x){ return x.id === id; });
      if(!cur) return;
      const nn = (typeof window !== "undefined" && typeof window.prompt === "function") ? window.prompt(t("p5.icsRenamePrompt", "新的日历源名称"), cur.name) : null;
      if(nn === null || nn === undefined) return;
      if(!icsRenameSub(id, nn)){ try{ toast(t("p5.icsRenameFail", "重命名失败"), "warn"); }catch(e){} return; }
      openIcsPanel(c);
    };
  });
  /* v3.7.89：启用/停用切换（停用不删，源可随时恢复） */
  c.querySelectorAll("[data-ics-toggle]").forEach(function(b){
    if(b._icsBound) return; b._icsBound = true;
    b.onclick = function(){
      const id = b.getAttribute("data-ics-toggle");
      const cur = getIcsSubs().find(function(x2){ return x2.id === id; });
      if(!cur) return;
      icsSetSubEnabled(id, cur.enabled === false);
      openIcsPanel(c);
    };
  });
  c.querySelectorAll("[data-ics-refresh]").forEach(function(b){
    if(b._icsBound) return; b._icsBound = true;
    b.onclick = async function(){
      const id = b.getAttribute("data-ics-refresh");
      const sub = getIcsSubs().find(function(s){ return s.id === id; });
      if(!sub) return;
      const r = await icsRefreshSub(sub);
      const subs = getIcsSubs();
      saveIcsSubs(subs);
      toast(r.ok ? (r.notModified ? t("p5.icsUnchanged", "内容未变化") : t("p5.icsRefreshedOne", "已刷新：{n} 个事件").replace("{n}", String(r.count || 0))) : t("p5.icsRefreshFail", "刷新失败"), r.ok ? "ok" : "warn");
      openIcsPanel(c);
    };
  });
  c.querySelectorAll("[data-ics-del]").forEach(function(b){
    if(b._icsBound) return; b._icsBound = true;
    b.onclick = function(){
      if(!confirm(t("p5.icsDeleteConfirm", "删除该日历源？其事件将不再出现在日历里（不会改动任何本地任务）。"))) return;
      icsRemoveSub(b.getAttribute("data-ics-del"));
      openIcsPanel(c);
    };
  });
}

/* ============================================================
 * ICS 导出（v3.7.85 批次2）：把本地任务（截止日）与会议（办公记录日期/开始时间）
 * 导出成 .ics 文件 —— 用户丢进任意日历 App 即可「订阅」，这是**零凭据双向**的另一半：
 * 本地→对方不需要任何厂商授权（对比 Google/Outlook OAuth 双向：需要企业应用+梯子）。
 * 全天事件用 VALUE=DATE；会议带开始时间则用 DATE-TIME（本地时区）。
 * ============================================================ */
/** ICS 文本转义：\\ \\n ; , 换行 */
function _icsEscapeText(v){
  return String(v == null ? "" : v).replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/;/g, "\\;").replace(/,/g, "\\,");
}
/** Date → YYYYMMDD */
function _icsYmd(d){
  return d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0");
}
/** Date → YYYYMMDDTHHMMSS（本地浮动时间） */
function _icsYmdhm(d){
  return _icsYmd(d) + "T" + String(d.getHours()).padStart(2, "0") + String(d.getMinutes()).padStart(2, "0") + String(d.getSeconds()).padStart(2, "0");
}
/**
 * 构建本地日程的 .ics 文本（任务截止日 + 会议记录）
 * @param {Array} [tasks] - 任务（默认取未完成+已完成全部带 due 的）
 * @param {Array} [meetings] - 会议记录（默认取办公场景带 date 的）
 * @returns {string} VCALENDAR 文本
 */
function icsBuildExport(tasks, meetings){
  const ts = _icsYmdhm(new Date());
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Agent Workshop//ICS Export//ZH", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
  const tsk = Array.isArray(tasks) ? tasks : (typeof getTasks === "function" ? getTasks() : []);
  const mts = Array.isArray(meetings) ? meetings : _icsExportDefaultMeetings();
  tsk.forEach(function(t){
    if(!t || !t.due) return;
    const d = new Date(t.due);
    if(isNaN(d.getTime())) return;
    lines.push("BEGIN:VEVENT");
    lines.push("UID:task-" + t.id + "@agent-workshop");
    lines.push("DTSTAMP:" + ts);
    lines.push("DTSTART;VALUE=DATE:" + _icsYmd(d));
    lines.push("DTEND;VALUE=DATE:" + _icsYmd(new Date(d.getTime() + 24 * 3600e3)));
    lines.push("SUMMARY:" + _icsEscapeText((t.title || "") + (t.status === "done" ? "（已完成）" : "")));
    if(t.note) lines.push("DESCRIPTION:" + _icsEscapeText(t.note));
    lines.push("END:VEVENT");
  });
  mts.forEach(function(m0, idx){
    if(!m0 || !m0.date) return;
    const d = new Date(String(m0.date).length <= 10 ? m0.date + "T00:00:00" : m0.date);
    if(isNaN(d.getTime())) return;
    const hasTime = /\d{1,2}:\d{2}/.test(String(m0.startTime || ""));
    if(hasTime){
      const hm = /^(\d{1,2}):(\d{2})/.exec(String(m0.startTime));
      d.setHours(+hm[1], +hm[2], 0, 0);
    }
    lines.push("BEGIN:VEVENT");
    lines.push("UID:meeting-" + (m0.id || (idx + 1)) + "@agent-workshop");
    lines.push("DTSTAMP:" + ts);
    if(hasTime){ lines.push("DTSTART:" + _icsYmdhm(d)); lines.push("DTEND:" + _icsYmdhm(new Date(d.getTime() + 3600e3))); }
    else { lines.push("DTSTART;VALUE=DATE:" + _icsYmd(d)); lines.push("DTEND;VALUE=DATE:" + _icsYmd(new Date(d.getTime() + 24 * 3600e3))); }
    lines.push("SUMMARY:" + _icsEscapeText(m0.title || ""));
    if(m0.note) lines.push("DESCRIPTION:" + _icsEscapeText(m0.note));
    if(m0.place || m0.location) lines.push("LOCATION:" + _icsEscapeText(m0.place || m0.location));
    lines.push("END:VEVENT");
  });
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
/** 默认会议集合（办公场景记录，与日历视图同源） */
function _icsExportDefaultMeetings(){
  try{ return (typeof getRec === "function") ? (getRec("office") || []) : []; }catch(e){ return []; }
}
/** 触发下载（浏览器与桌面通用；不可用环境如实返回 false 由调用方 toast） */
function icsDownload(text, filename){
  try{
    if(typeof URL === "undefined" || typeof URL.createObjectURL !== "function") return false;
    const blob = new Blob([text], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename || "agent-workshop.ics";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function(){ try{ URL.revokeObjectURL(url); }catch(e){} }, 2000);
    return true;
  }catch(e){ return false; }
}
/** 导出入口：构建 + 下载 + 如实回报 */
function icsExportLocal(filename){
  const text = icsBuildExport();
  const okDl = icsDownload(text, filename || ("agent-workshop-" + _icsYmd(new Date()) + ".ics"));
  try{ toast(okDl ? t("p5.icsExported", "已导出 .ics（可导入/订阅到任意日历 App）") : t("p5.icsExportFail", "当前环境不支持文件下载，请用桌面版"), okDl ? "ok" : "warn"); }catch(e){}
  return okDl;
}

/* ============================================================
 * 事件详情浮层（v3.7.86 B1）：月格徽章 / 周视图事件行点击 → 完整详情（标题、时间、
 * 类型、地点、描述）。此前只有一句 toast —— 外部事件点开看不到地点与描述，订阅日历就
 * 只剩个标题。浮层动态挂载（.overlay + .cmd 模式，同 openIcsPanel），不新增静态标记。
 * ============================================================ */
/** 拼一行详情（label: value），值空则跳过 */
function _evDetailRow(label, value){
  if(value === undefined || value === null || value === "") return "";
  return '<div class="evd-row"><span class="evd-label">' + esc(label) + '</span><span class="evd-value">' + esc(value) + '</span></div>';
}
/** 外部事件的格式化时间行（全天 / 起止时刻） */
function _evTimeText(ev){
  if(!ev || !ev.start) return "";
  const d = new Date(ev.start);
  const ymd = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  if(ev.allDay) return ymd + t("p5.evAllDaySuffix", "（全天）");
  const hm = String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  if(ev.end){ const e2 = new Date(ev.end); return ymd + " " + hm + " – " + String(e2.getHours()).padStart(2, "0") + ":" + String(e2.getMinutes()).padStart(2, "0"); }
  return ymd + " " + hm;
}
/** 收集某日的全部日历条目：本地会议 + 本地任务（截止日）+ 外部 ICS 事件 */
function _evCollectDay(dateKey){
  const list = [];
  try{
    (_meetingsByDate()[dateKey] || []).forEach(function(m0){
      list.push({ title: m0.title || "", time: (m0.startTime || "") + (m0.endTime ? "–" + m0.endTime : ""),
        place: m0.place || m0.location || "", desc: m0.note || "", kind: t("p5.evKindMeeting", "会议（本地记录）") });
    });
  }catch(e){ /* 无办公记录则跳过 */ }
  try{
    (typeof getActiveTasks === "function" ? getActiveTasks() : []).forEach(function(tk){
      /* v3.7.86：参数名不用 t —— t 是本项目的 i18n 函数，遮蔽后 t("…") 会当对象调用并抛错 */
      if(!tk.due) return;
      const d = new Date(tk.due);
      const k = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
      if(k !== dateKey) return;
      list.push({ title: tk.title || "", time: tk.due, place: "", desc: tk.note || "",
        kind: tk.status === "done" ? t("p5.evKindTaskDone", "任务（已完成）") : t("p5.evKindTask", "任务（未完成）") });
    });
  }catch(e){ /* 任务读取失败则跳过 */ }
  const exts = (typeof _icsEventsByDate === "function") ? (_icsEventsByDate()[dateKey] || []) : [];
  exts.forEach(function(e0){
    list.push({ title: e0.title || "", time: _evTimeText(e0), place: e0.location || "", desc: e0.desc || "",
      categories: e0.categories || "", reminderMin: (typeof e0.reminderMin === "number") ? e0.reminderMin : 0,
      kind: t("p5.evKindExternal", "外部日历") + (e0.subName ? "（" + e0.subName + "）" : "") });
  });
  return list;
}
/**
 * 打开某日的日历事件详情浮层
 * @param {string} dateKey - YYYY-MM-DD
 * @param {number} [focusIdx] - 聚焦第几条（周视图点击传入）
 */
function openEventDetail(dateKey, focusIdx){
  const old = document.getElementById("evDetailOverlay");
  if(old) old.remove();
  const list = _evCollectDay(dateKey);
  if(!list.length){
    try{ toast(t("p5.evDetailEmpty", "当日没有日程事件"), "info"); }catch(e){}
    return;
  }
  const idx = (typeof focusIdx === "number" && focusIdx >= 0 && focusIdx < list.length) ? focusIdx : 0;
  const cur = list[idx];
  let html = '<div class="cmd u-max-w-520 u-p-5" role="dialog" aria-modal="true" aria-label="' + esc(t("p5.evDetailTitle", "日程详情")) + '">';
  html += '<div class="u-flex u-jc-between u-ai-center u-m-0-0-3"><h3 class="u-m-0 u-fs-md">' + esc(cur.title) + '</h3>';
  html += '<button type="button" class="addbtn sm" data-ev-close title="' + esc(t("p5.evClose", "关闭")) + '">✕</button></div>';
  html += _evDetailRow(t("p5.evKind", "类型"), cur.kind);
  html += _evDetailRow(t("p5.evTime", "时间"), (dateKey ? dateKey + " " : "") + cur.time);
  html += _evDetailRow(t("p5.evPlace", "地点"), cur.place);
  html += _evDetailRow(t("p5.evDesc", "详情"), cur.desc);
  if(cur.categories) html += _evDetailRow(t("p5.evCategories", "类别"), cur.categories);
  html += _evDetailRow(t("p5.evReminder", "提醒"), (typeof cur.reminderMin === "number" && cur.reminderMin > 0) ? t("p5.evReminderEarly", "提前 {n} 分钟").replace("{n}", String(cur.reminderMin)) : t("p5.evReminderNone", "无"));
  if(list.length > 1){
    html += '<div class="u-mt-2">' + t("p5.evMore", "当日共 {n} 条").replace("{n}", String(list.length)) + '</div>';
    html += '<div class="u-mt-2 u-flex u-gap-2">'
      + '<button type="button" class="addbtn sm" data-ev-step="-1">‹ ' + esc(t("p5.evPrev", "上一条")) + '</button>'
      + '<button type="button" class="addbtn sm" data-ev-step="1">' + esc(t("p5.evNext", "下一条")) + '</button></div>';
  }
  html += '</div>';
  const ov = document.createElement("div");
  ov.className = "overlay show";
  ov.id = "evDetailOverlay";
  ov.innerHTML = sanitizeHtml(html);
  document.body.appendChild(ov);
  /* 与 v3.7.66 集成弹窗同型的缺陷：`.cmd` 基类 display:none，靠自身 `.show` 才现身，
     而这里只给外层 .overlay 加了 show → 点日历徽章后详情浮层建进了 DOM 却完全不渲染。
     jsdom 不应用样式表、且 v3.7.86 那轮没有 e2e 覆盖这条路，所以一直没人看见。
     ⚠️ 必须同步加（塞进 rAF 在无合成帧的环境里永不触发）。 */
  const _evCmdEl = ov.querySelector(".cmd");
  if(_evCmdEl) _evCmdEl.classList.add("show");
  ov.addEventListener("click", function(e){
    if(e.target === ov){ closeEventDetail(); return; }
    if(e.target.closest("[data-ev-close]")){ closeEventDetail(); return; }
    const step = e.target.closest("[data-ev-step]");
    if(step){
      const n2 = (idx + (parseInt(step.getAttribute("data-ev-step"), 10) || 0) + list.length) % list.length;
      closeEventDetail();
      openEventDetail(dateKey, n2);
    }
  });
}
/** 关闭事件详情浮层 */
function closeEventDetail(){
  const old = document.getElementById("evDetailOverlay");
  if(old) old.remove();
}

/* ============================================================
 * ICS 增强（v3.7.87 D）
 * ① 重命名订阅源（此前只能删了重加，id/chunk docId 会全变）。
 * ② 解析行级诊断：订阅源文件里坏掉的 VEVENT（缺 DTSTART/SUMMARY 等）此前静默丢弃，
 *    用户只见"事件变少了"却不知原因；现在按源记录异常计数与首条原因，面板直接显示。
 * ============================================================ */
/** 重命名订阅源（id 不变 → chunk docId 稳定 → 零重嵌） */
function icsRenameSub(id, name){
  const nm = String(name || "").trim().slice(0, 60);
  if(!id || !nm) return false;
  const subs = getIcsSubs();
  const hit = subs.find(function(s){ return s.id === id; });
  if(!hit) return false;
  hit.name = nm;
  return saveIcsSubs(subs);
}
/**
 * 带诊断的解析（v3.7.87）：与 icsParseEvents 同语义，另给每源异常计数
 * @returns {{events:Array, diag:{count:number, first:string}}}
 */
function icsParseWithDiag(text){
  const events = icsParseEvents(text);
  /* 粗粒度诊断：总 VEVENT 数 vs 成功解析数 —— 差额即被丢弃的坏事件 */
  const src = String(text || "");
  const total = (src.match(/BEGIN:VEVENT/gi) || []).length;
  const bad = Math.max(0, total - events.length);
  let first = "";
  if(!src.trim()) first = "empty";
  else if(total === 0) first = "no_vevent";
  else if(bad > 0) first = "missing_title_or_start";
  return { events: events, diag: { count: bad, first: first } };
}
/** 解析源文本并把诊断写回源记录（导入与刷新共用） */
function _icsParseIntoSub(sub, text){
  const r = icsParseWithDiag(text);
  sub.evs = r.events.slice(0, ICS_MAX_EVENTS);
  sub.diag = r.diag;
  sub.parsedAt = Date.now();
  return sub;
}


/* ============================================================
 * ICS 增强（v3.7.89 B3 收尾）
 * ① per-source 启用开关：停用的源不进日历、不刷新、不提醒（不必删了重加）。
 * ② CATEGORIES → 颜色：按类别/标题关键字映射到场景色令牌（var(--sc-*)，lint-colors 安全）。
 * ③ VALARM 提醒：TRIGGER 解析提前分钟数；提醒窗口 = (开始 - 提前) ≤ now < 开始；
 *    去重键 "uid|yyyymmdd"（wb_ics_notified，只留 7 天）；经 core 的 AppBridge 槽
 *    接进 ui-daily 的 runNotifyCheck（避免 ui-daily→ui-ge-calendar 逆层边）。
 * ============================================================ */
const ICS_NOTIFIED_KEY = "wb_ics_notified";
/* v3.7.89：本会话内存去重表。持久化标记是主路径，但它**可能失败**（配额满 / 隐私模式），
   而失败意味着下一轮 poll 又命中同一提醒窗口 → 同一条日程被反复通知。
   内存表是兜底：至少同一会话内不重复打扰；跨会话的重复由 pushDiag 那条告警暴露出来。 */
const _icsNotifiedMem = new Set();
/** 设置源的启用开关 */
function icsSetSubEnabled(id, on){
  const subs = getIcsSubs();
  const hit = subs.find(function(s){ return s.id === id; });
  if(!hit) return false;
  hit.enabled = !!on;
  return saveIcsSubs(subs);
}
/** 事件 → 场景色令牌（类别/标题关键字映射；默认绿系 ok） */
function _icsColorOf(ev){
  const c = String((ev && ev.categories) || "") + " " + String((ev && ev.title) || "");
  if(/会议|meeting|评审|review/i.test(c)) return "var(--sc-office)";
  if(/健康|健身|health|锻炼|运动|fitness/i.test(c)) return "var(--sc-health)";
  if(/学习|study|课程/i.test(c)) return "var(--sc-study)";
  if(/开发|code|dev/i.test(c)) return "var(--sc-code)";
  if(/设计|design/i.test(c)) return "var(--sc-design)";
  if(/财务|finance|报销/i.test(c)) return "var(--sc-finance)";
  if(/生活|life|私人/i.test(c)) return "var(--sc-life)";
  return "var(--ok-text)";
}
/** 清理过期去重键（只留 7 天） */
function _purgeIcsNotified(now){
  try{
    const cur = load(PREFIX + ICS_NOTIFIED_KEY, []);
    const keep = cur.filter(function(k){ const d = new Date(String(k).split("|")[1] || ""); return !isNaN(d.getTime()) && (now - d.getTime()) < 8 * 24 * 3600e3; });
    if(keep.length !== cur.length) save(PREFIX + ICS_NOTIFIED_KEY, keep);
  }catch(e){
    /* 清不掉不影响本次提醒，但**不能静默**：这是持久化路径，写失败（配额满/隐私模式）
       会让过期去重键一直留着。lint:empty-catch 把它标为 P0 就是这个理由。 */
    try{ if(typeof pushDiag === "function") pushDiag("warn", "ICS 去重键清理失败：" + ((e && e.message) || e), { where: "ics-notify" }); }catch(_e){}
  }
}
/**
 * 到期 ICS 事件提醒（VALARM 窗口命中 → 通知一次；core 槽，由 ui-daily 的提醒循环消费）
 * @param {number} [now]
 * @returns {Array<{key:string,title:string,subName:string,color:string,msg:string}>}
 */
function getDueIcsReminders(now){
  const ts = (now === undefined) ? Date.now() : now;
  _purgeIcsNotified(ts);
  const out = [];
  for(const sub of getIcsSubs()){
    if(sub.enabled === false) continue;
    for(const raw of (Array.isArray(sub.evs) ? sub.evs : [])){
      if(!raw.start || !raw.title) continue;
      const st = new Date(raw.start);
      const rem = (typeof raw.reminderMin === "number") ? raw.reminderMin : 0;
      if(rem <= 0) continue;                       /* 无 VALARM（或非提前型）的事件不提醒 */
      const due = st.getTime() - rem * 60000;
      if(ts < due || ts >= st.getTime()) continue; /* 提醒窗口外 */
      const key = String(raw.uid || st.getTime()) + "|" + st.toISOString().slice(0, 10);
      if(_icsNotifiedMem.has(key)) continue;       /* 本会话内存去重（持久化失败时的兜底） */
      const notified = load(PREFIX + ICS_NOTIFIED_KEY, []);
      if(notified.indexOf(key) >= 0) continue;     /* 已提醒过（同日一次） */
      out.push({ key: key, title: raw.title, subName: sub.name || "", color: _icsColorOf(raw),
        msg: t("notify.icsDue", "日程即将开始：") + raw.title + (sub.name ? "（" + sub.name + "）" : "") + t("notify.icsIn", "（{n} 分钟后）").replace("{n}", String(rem)) });
    }
  }
  if(out.length){
    try{
      const cur = load(PREFIX + ICS_NOTIFIED_KEY, []);
      out.forEach(function(r){ if(cur.indexOf(r.key) < 0) cur.push(r.key); });
      save(PREFIX + ICS_NOTIFIED_KEY, cur);
    }catch(e){
      /* 标记写失败必须浮出来：写不进去 ⇒ 下一轮还命中同一窗口 ⇒ 同一条日程被反复通知。
         光报错不够，同时落进本会话内存表，至少这一会话内不再重复打扰。 */
      try{ if(typeof pushDiag === "function") pushDiag("warn", "ICS 提醒去重标记写入失败（本会话内改由内存去重）：" + ((e && e.message) || e), { where: "ics-notify" }); }catch(_e){}
    }
    out.forEach(function(r){ _icsNotifiedMem.add(r.key); });
  }
  return out;
}
try{ if(typeof AppBridge !== "undefined") AppBridge.getDueIcsReminders = getDueIcsReminders; }catch(e){ /* 桥未就绪：提醒不可用，日历不受影响 */ }
