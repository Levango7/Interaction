// ===== Render Layer (渲染层·场景主区) =====
/* ---------- 渲染：场景主区 ---------- */
/**
 * 渲染单张看板卡片 HTML（v1.4-B 抽出供虚拟滚动复用）
 * @param {Object} x - 任务对象
 * @param {string} st - 列状态 todo/doing/done
 * @param {Object} colName - 状态名映射
 * @returns {string} 卡片 HTML
 */
function _renderKanbanCard(x, st, colName){
  const od = x.due && x.due < todayStr();
  const pri = x.priority? `<span class="pri ${x.priority}">${x.priority}</span>`:"";
  const due = x.due? `<span class="due ${od?"od":""}">${od?t("label.overduePrefix","逾期 "):""}${x.due}</span>`:"";
  const tags=(x.tags&&x.tags.length)?` <span class="tag">${x.tags.map(t=>esc(t)).join('</span> <span class="tag">')}</span>`:"";
  let btns="";
  if(st==="todo") btns=`<button type="button" data-move="${x.id}:doing">→ 进行中</button>`;
  if(st==="doing") btns=`<button type="button" data-move="${x.id}:todo">← 待办</button><button type="button" data-move="${x.id}:done">→ 完成</button>`;
  if(st==="done") btns=`<button type="button" data-move="${x.id}:doing">← 进行中</button>`;
  return `<div class="kcard" draggable="true" tabindex="0" data-drag="${x.id}" data-tags="${(x.tags||[]).join(" ")}" data-title="${esc(x.title)}" data-status="${st}" aria-label="${esc(x.title)}（${colName[st]}）"><div class="t">${esc(x.title)}</div><div class="kstate">${btns}</div>
    <div class="m">${pri} ${due}${tags}</div><div class="kbtns">
    <button type="button" data-edit="${x.id}" data-i18n="task.editBtn">编辑</button>
    <button type="button" data-share="${x.id}" data-i18n="task.shareBtnText" title="${t("action.shareLink", "生成分享链接")}">分享</button>
    <button type="button" data-del="${x.id}" class="u-text-danger" data-i18n="task.delBtn">删除</button></div></div>`;
}
/**
 * v1.4-B 虚拟滚动：渲染看板单列（超阈值时只渲染可见区域 + 缓冲区）
 * @param {string} st - 列状态
 * @param {Object[]} list - 该列任务数组
 * @param {Object} colName - 状态名映射
 * @returns {string} 列 HTML
 */
function _renderKanbanCol(st, list, colName){
  const head = `<div class="kcol" data-drop="${st}"><h4>${colName[st]} <span class="n">${list.length}</span></h4>`;
  if(list.length === 0) return head + `<div class="empty">${t("kanban.emptyCol", "暂无任务")}</div></div>`;
  // 超阈值启用虚拟滚动
  if(list.length > VIRTUAL_SCROLL_THRESHOLD){
    const range = virtualScrollRange({
      total: list.length,
      itemHeight: VIRTUAL_ITEM_HEIGHT_CARD,
      viewportHeight: VIRTUAL_VIEWPORT_MAX,
      scrollTop: 0,
      buffer: VIRTUAL_SCROLL_BUFFER
    });
    const cards = list.slice(range.start, range.end).map(x => _renderKanbanCard(x, st, colName)).join("");
    return head + `<div class="vscroll-viewport u-overflow-y-auto" data-vscroll="${st}" data-vcount="${list.length}" style="max-height:${VIRTUAL_VIEWPORT_MAX}px">` +
      `<div class="vscroll-spacer u-pos-relative" style="height:${range.totalHeight}px">` +
      `<div class="vscroll-items u-pos-absolute" style="top:${range.offsetY}px">${cards}</div>` +
      `</div></div></div>`;
  }
  // 未超阈值：全量渲染（保持原行为）
  return head + list.map(x => _renderKanbanCard(x, st, colName)).join("") + `</div>`;
}
/**
 * v1.4-B 虚拟滚动：滚动时更新看板列可见项（只更新 DOM 子树，不全量重渲染）
 * @param {Element} viewport - 滚动视口元素
 * @param {string} sc - 场景键
 * @param {string} st - 列状态
 * @returns {void}
 */
function _updateKanbanVScroll(viewport, sc, st){
  const total = parseInt(viewport.getAttribute("data-vcount") || "0", 10);
  if(total <= VIRTUAL_SCROLL_THRESHOLD) return;
  const scrollTop = viewport.scrollTop || 0;
  const range = virtualScrollRange({
    total,
    itemHeight: VIRTUAL_ITEM_HEIGHT_CARD,
    viewportHeight: VIRTUAL_VIEWPORT_MAX,
    scrollTop,
    buffer: VIRTUAL_SCROLL_BUFFER
  });
  const tasks = getActiveTasks().filter(x => x.sc === sc && x.status === st && !x.deletedAt);
  const colName = { todo:t("kanban.todo","待办"), doing:t("kanban.doing","进行中"), done:t("kanban.done","已完成") };
  const items = viewport.querySelector(".vscroll-items");
  if(!items) return;
  const cards = tasks.slice(range.start, range.end).map(x => _renderKanbanCard(x, st, colName)).join("");
  items.innerHTML = sanitizeHtml(cards);
  items.style.top = range.offsetY + "px";
}
/**
 * v1.9.7 场景页标题块：独立内容卡（消息提示栏正下方），不再与任务看板内容粘连。
 * 复用统一页面头 page-head 视觉语言（与设置/统计/回收站一致），图标徽章取场景语义色。
 * @returns {string} HTML 字符串
 */
function renderSceneHead(){
  const s = SCENARIOS[active];
  if(!s) return "";
  /* v3.2 IA：标题栏右端加"问 AI 助手"入口——让 AI 真正服务于整套平台。
     点击聚焦右侧 AI 聊天面板，并预填一条与当前场景相关的提示。 */
  const aiBtn = `<button type="button" class="ph-ai-btn" id="phAiAskBtn" data-ai-scene="${active}" aria-label="${t("aria.askAi","问 AI 助手")}">
    <span class="ic-inline" aria-hidden="true">${UI_ICONS.robot}</span>
    <span>${t("page.ai.askBtn","问 AI 助手")}</span>
  </button>`;
  return `<div class="card page-head-card"><header class="page-head sc-page-head">
    <span class="ph-ic" style="background:${s.color}1f;color:${s.color}" aria-hidden="true">${s.icon || ""}</span>
    <div class="ph-tx"><h2>${esc(s.name)}</h2>
      <p class="sub">${t("scene.headSub","带截止日期的任务会汇总到下方「今天要处理」")}</p></div>
    ${aiBtn}
  </header></div>`;
}
/**
 * v3.0：场景功能菜单（独立于标题栏，置于标题卡下方）
 * @returns {string} HTML
 */
function renderSceneFeatNav(){
  const feats = SCENE_FEATURES[active] || [];
  if(!feats.length) return "";
  /* v3.2 IA：type 决定样式——core 概览（强调色）/ tool 真实工具（正常）/ record 记录型（弱化） */
  return `<nav class="set-nav scene-feat-nav" aria-label="${t("aria.sceneFeature","场景功能")}">` +
    feats.map(f=>{
      const ft = f.type || "record";
      const act = f.id===sceneFeatureMode?" active":"";
      /* v3.7.13：**去掉 tab 上的「工具 / 记录」灰色小标签**。
         用户 2026-09-22 截图质问："这个 记录的标注的小字 是干什么的？什么意思？？有必要留吗？？"
         → 确认没有必要：这个徽标只是把内部的 type（core/tool/record）暴露给了用户，
           对用户没有信息价值，反而让 tab 行显得杂乱。`type` 仍保留用于按钮样式（scene-feat-*）。 */
      const typeBadge = "";
      return `<button type="button" class="set-nav-btn scene-feat-btn scene-feat-${ft}${act}" data-feat="${f.id}">${esc(f.label)}${typeBadge}</button>`;
    }).join("") +
  `</nav>`;
}
/**
 * v2.1.0：待办视图（todo 模式）——当前场景任务平铺清单，勾选完成 / 状态流转 / 编辑删除。
 * 复用看板卡的 data-move / data-edit / data-share / data-del 属性，绑定走全局选择器。
 * @param {Object[]} tasks - 当前场景任务数组
 * @param {Object} s - 场景配置
 * @returns {string} 待办清单 HTML
 */
function renderTodoListView(tasks, s){
  if(!tasks.length) return renderEmpty("no-tasks");
  const order = {todo:0, doing:1, done:2};
  const sorted = tasks.slice().sort((a,b)=>{
    if(order[a.status]!==order[b.status]) return order[a.status]-order[b.status];
    const pa = a.priority||"P9", pb = b.priority||"P9";
    if(pa!==pb) return pa<pb?-1:1;
    return (a.due||"9999")<(b.due||"9999")?-1:1;
  });
  const stName = {todo:t("kanban.todo","待办"), doing:t("kanban.doing","进行中"), done:t("kanban.done","已完成")};
  const rows = sorted.map(x=>{
    const od = x.due && x.due < todayStr() && x.status!=="done";
    const pri = x.priority? `<span class="pri ${x.priority}">${x.priority}</span>`:"";
    const due = x.due? `<span class="due ${od?"od":""}">${od?t("label.overduePrefix","逾期 "):""}${x.due}</span>`:"";
    const checked = x.status==="done" ? " checked" : "";
    const doneCls = x.status==="done" ? " done" : "";
    const nextSt = x.status==="done" ? "doing" : "done";
    return `<div class="todo-row${doneCls}" data-id="${x.id}" data-status="${x.status}">
      <input type="checkbox" class="todo-chk" data-move="${x.id}:${nextSt}" aria-label="${t("aria.toggleComplete","切换完成状态")}"${checked}>
      <span class="todo-title">${esc(x.title)}</span>
      <span class="todo-meta">${pri}${due}<span class="todo-st">${stName[x.status]||""}</span></span>
      <span class="todo-ops">
        ${x.status==="todo"?`<button type="button" data-move="${x.id}:doing">${t("common.start","开始")}</button>`:""}
        <button type="button" data-edit="${x.id}">${t("common.edit","编辑")}</button>
        <button type="button" data-del="${x.id}" class="u-text-danger">${t("common.delete","删除")}</button>
      </span>
    </div>`;
  }).join("");
  return `<div class="todo-list">${rows}</div>`;
}
function renderMainHTML(){
  const s = SCENARIOS[active];
  const tasksAll = getActiveTasks().filter(x=>x.sc===active);
  const tasks = tasksAll;
  const open = tasks.filter(x=>x.status!=="done");
  const recs = getRec(active);
  const rec = s.record;
  const cfg = getCfg();

  const taskForm = `<form class="form-row form-row--board" id="taskForm">
    <div class="fld fld-lg"><label>${t("field.taskTitle","任务标题")}</label><input name="title" placeholder="${t("placeholder.taskTitle","要做什么？")}" maxlength="200" required></div>
    <div class="fld fld-md"><label>${t("field.dueDate","截止日期")}</label><div class="date-pick"><input name="due" type="text" inputmode="none" data-date-picker="1" placeholder="${t("placeholder.dueDate","选日期")}" aria-label="${t("field.dueDate","截止日期")}"><svg class="date-pick-caret" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10l5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></div></div>
    <div class="fld fld-sm"><label>${t("task.priority","优先级")}</label>
      <select name="priority"><option value="">${t("common.none","无")}</option><option value="P0">${t("task.priority.p0","P0 紧急")}</option><option value="P1">${t("task.priority.p1","P1 重要")}</option><option value="P2">${t("task.priority.p2","P2 一般")}</option></select></div>
    <div class="fld fld-md"><label>${t("task.tags","标签")}</label><input name="tags" placeholder="${t("placeholder.commaSep","逗号分隔")}" maxlength="200"></div>
    <span class="add-wrap"><span class="add-label">${t("tool.addLabel", t("common.add","添加"))}</span><button type="submit" class="addbtn add-round" style="--sc:${s.color}" aria-label="${t("tool.ariaAdd", "添加")}">＋</button></span>
  </form>`;

  const tagFilterHTML = `<div class="form-row form-row--board" id="taskFilterRow">
    <div class="fld fld-xl"><label for="boardSearch">${t("field.searchTaskA3","搜索任务（A3）")}</label><input id="boardSearch" placeholder="${t("placeholder.searchTitle","输入标题关键词")}" maxlength="200"></div>
    <div class="fld fld-lg"><label>${t("field.linkedRecord","联动记录")}</label>
      <select id="boardStatusFilter"><option value="">${t("common.all","全部")}</option><option value="todo">${t("kanban.todo","待办")}</option><option value="doing">${t("kanban.doing","进行中")}</option><option value="done">${t("kanban.done","已完成")}</option></select></div>
    <div class="fld fld-lg fld-fill"><label for="tagFilter">${t("field.tagFilterAll","标签（留空=全部）")}</label><input id="tagFilter" placeholder="${t("placeholder.tagExample","如 周报 / 紧急")}" maxlength="200"></div>
  </div>`;

  // T4.2：看板无任务时显示 no-tasks 空状态（替代每列「空」提示），保留表单引导创建
  // v2.1.0：任务区按 sceneViewMode 分支——kanban（看板）/ calendar（日历）/ todo（待办列表）
  let taskArea, filterHtml;
  if(sceneViewMode === "calendar"){
    taskArea = `<div class="cal-inline" id="calInlineView" data-offset="0">${renderCalendarView(0)}</div>`;
    filterHtml = "";
  } else if(sceneViewMode === "todo"){
    taskArea = renderTodoListView(tasks, s);
    filterHtml = tasks.length ? `<div class="form-row">
      <div class="fld fld-lg"><label>${t("field.linkedRecord","联动记录")}</label>
        <select id="todoStatusFilter"><option value="">${t("common.all","全部")}</option><option value="todo">${t("kanban.todo","待办")}</option><option value="doing">${t("kanban.doing","进行中")}</option><option value="done">${t("kanban.done","已完成")}</option></select></div>
    </div>` : "";
  } else if(tasksAll.length === 0){
    taskArea = renderEmpty("no-tasks");
    filterHtml = "";
  }else{
    const cols=["todo","doing","done"];
    const colName={todo:t("kanban.todo","待办"),doing:t("kanban.doing","进行中"),done:t("kanban.done","已完成")};
    // v1.4-B：超阈值时每列启用虚拟滚动，否则全量渲染
    taskArea = `<div class="kanban">` + cols.map(st => {
      const list = tasks.filter(x => x.status === st);
      return _renderKanbanCol(st, list, colName);
    }).join("") + `</div>`;
    filterHtml = tagFilterHTML;
  }

  const recFields = rec.fields.map(f=>{
    let inp;
    if(f.type==="textarea"){
      inp = `<textarea name="${f.k}" placeholder="${f.label}" maxlength="10000"></textarea>`;
    } else if(f.type==="select"){
      const opts = (f.options||[]).map(o=>`<option value="${esc(o)}">${esc(o)}</option>`).join("");
      inp = `<select name="${f.k}">${opts}</select>`;
    } else if(f.type === "date"){
      /* v3.7.33：日期字段加 ▼ 指示符 —— 用户："日期是下拉框，点击有日期卡片"。
         原先它就是个普通文本框外观，用户不知道可以点开日期面板。
         结构：.date-pick 包一层，右侧绝对定位一个 caret（用真实 svg 以继承 currentColor，
         避免为了图标色值而硬编码颜色）。点击仍由 data-date-picker 委托处理，包一层不影响。 */
      inp = `<div class="date-pick"><input name="${f.k}" type="text" inputmode="none" data-date-picker="1"`
        + (f.timePicker ? ' data-time-picker="1"' : '')
        + ` placeholder="${t("placeholder.dueDate","选日期")}" aria-label="${esc(f.label)}">`
        + '<svg class="date-pick-caret" viewBox="0 0 24 24" aria-hidden="true">'
        + '<path d="M7 10l5 5 5-5" fill="none" stroke="currentColor" stroke-width="2"'
        + ' stroke-linecap="round" stroke-linejoin="round"/></svg></div>';
    } else if(f.type === "time"){
      /* v3.7.33：时间字段改用**单个自研下拉**，不用原生 <input type="time">。
         原生时间控件的弹出选择器是浏览器原生样式：方角、宽度不跟随控件、无法主题化 ——
         用户实测后明确要求"下拉框和上面的框宽度要一致，而且要是圆角矩形"。
         现在：选项 00:00 ~ 23:55 每 5 分钟一档（288 项，自研列表可滚动），
         值即 "HH:MM"，保存逻辑无需特殊处理。 */
      let _tOpts = '<option value="">' + t("field.pickTime","选时间") + '</option>';
      for(let _h = 0; _h < 24; _h++){
        for(let _m = 0; _m < 60; _m += 5){
          const v = String(_h).padStart(2,"0") + ":" + String(_m).padStart(2,"0");
          _tOpts += '<option value="' + v + '">' + v + '</option>';
        }
      }
      /* v3.7.35：data-editable="1" —— 用户："不但可以选择也可以输入"。
         时间值的常见输入习惯是直接敲 "09:30"，288 项列表里翻找太慢；
         可编辑下拉同时支持"敲"和"选"。 */
      inp = `<select name="${f.k}" data-editable="1" aria-label="${esc(f.label)}">${_tOpts}</select>`;
    } else if(f.type==="image"){
      // v3.6.0：图片字段——隐藏原生 input，用按钮触发 + 文件名 + 缩略图预览（对齐主流做法）
      inp = `<div class="img-pick"><label class="img-pick-btn">${ic("upload")}<input name="${f.k}" type="file" accept="image/*" data-rec-img="1" class="img-pick-input"><span>${t("field.pickImage","选择图片")}</span></label><span class="img-pick-name" data-img-name="1">${t("field.noImage","未选择")}</span></div>`;
    } else {
      const ph = f.placeholder || f.label;
      inp = `<input name="${f.k}" type="${f.type==="number"?"number":"text"}" placeholder="${esc(ph)}" maxlength="500">`;
    }
    // v3.7.60：textarea 字段占整行（u-col-span-all），其他字段等宽（不再区分 fld-lg/fld-sm）
    const spanCls = f.type === "textarea" ? " u-col-span-all" : "";
    return `<div class="fld${spanCls}"><label>${f.label}</label>${inp}</div>`;
  }).join("");
  const recForm = `<form class="form-row form-row--grid" id="recForm">${recFields}
    <span class="add-wrap"><span class="add-label">${t("tool.addLabel", t("common.add","添加"))}</span><button type="submit" class="addbtn add-round" style="--sc:${s.color}" aria-label="${t("tool.ariaAdd", "添加")}">＋</button></span></form>`;
  const recList = recs.length? _renderRecList(recs, rec) : renderEmpty("no-records");

  // 右侧 AI 聊天面板已把 #chat/#chatForm/#chatThinking/#chatCancel 移出主内容区（静态 HTML，三栏布局第三栏）
  // 主内容区不再渲染 chatCard（避免重复 DOM id）；renderChat() 直接渲染到右侧面板的 #chat
  const chatCard = "";

  // v1.9.7：场景标题已抽为独立内容卡 renderSceneHead()（render() 中置于 renderToday 之前），看板卡不再带头部
  // v1.15 P2：每个 card 左上角要有标题——看板卡补"任务看板"
  // v2.1.0：任务卡标题随视图模式变化（任务看板 / 任务日历 / 待办清单）
  const taskCardTitle = sceneViewMode==="calendar" ? t("view.taskCalendar","任务日历") : sceneViewMode==="todo" ? t("view.todoList","待办清单") : t("view.taskBoard","任务看板");
  // v3.0：场景内功能 tab 分支——overview 显示现有内容（任务+资料库+专属卡），其他 tab 显示功能卡
  if(sceneFeatureMode !== "overview"){
    return renderSceneFeature(sceneFeatureMode);
  }
  return `<div class="card"><h2>${UI_ICONS.check}${taskCardTitle}</h2>${taskForm}${filterHtml}${taskArea}</div>
     <div class="card"><h2>${ic("book")} ${s.name} · ${rec.label}</h2>
      <p class="sub">${active === "life" ? t("scene.lifeRecSub","日常事务速记 · 运动/体重/睡眠/喝水请用上方「健康」功能卡（结构化记录，健康摘要自动汇总）") : t("scene.recSub","场景专属资料库，本地保存、随时检索")}</p>${recForm}${recList}</div>
      ${renderSceneSections(active)}
      ${renderExtra(active)}
       ${chatCard}`;
}

/* v3.0：场景内功能渲染注册表（active → { featureId: renderFn }）。
   P2-P5 逐个填充各场景功能实现；未实现时走占位卡。 */
const SCENE_FEATURE_RENDER = {
  office: {},
  study: {},
  data: {},
  design: { canvas: function(){ return _renderDiagramCanvas(); } },
  code: {},
  life: {},
  /* v3.5.2：新场景功能 tab 渲染器（函数声明提升，_renderHealthTrend/_renderFinanceStats 定义在下方） */
  health: { trend: function(){ return _renderHealthTrend(); } },
  finance: { stats: function(){ return _renderFinanceStats(); } }
};
/**
 * v3.0：渲染场景内功能卡（按 SCENE_FEATURE_RENDER 查表）
 * @param {string} fid - SCENE_FEATURES[active] 中的 tab id
 * @returns {string} HTML
 */
function renderSceneFeature(fid){
  const feats = SCENE_FEATURES[active] || [];
  const f = feats.find(function(x){ return x.id === fid; });
  const label = f ? f.label : fid;
  const fn = (SCENE_FEATURE_RENDER[active] || {})[fid];
  if(typeof fn === "function"){
    try{ return fn(); }catch(e){ return `<div class="card"><h2>${ic("alert")} ${esc(label)}</h2><div class="empty">${t("scene.renderErrorPrefix","功能渲染出错：")}${esc(e && e.message || e)}</div></div>`; }
  }
  // v3.0：占位 tab（CAD/图片/运行器/正则/健康/缴费/采购）统一空状态引导，风格与其他空状态一致
  return `<div class="card"><h2>${ic("puzzle")} ${esc(label)}</h2><div class="empty">${ic("tool")} ${t("scene.featureBuilding","该功能正在建设中，即将上线 · 敬请期待")}</div></div>`;
}

/* ================= v3.0 场景功能卡（求同存异：统一骨架 + 各功能配置） =================
 * 通用「记录型功能卡」：表单（tool-form-grid）+ 统计（tool-summary）+ 列表（tool-table）。
 * 各功能仅需配置 fields/cols/sum/emptyTip，骨架与交互完全一致（求同），字段与统计对症下药（存异）。 */

/** 通用功能卡 HTML：cfg = {key, title, icon, fields, cols, sum, emptyTip} */
/* ---------- v3.0.1 B-5：数据可视化真图表 ----------
 * parseChartData(str)：把记录里的 data 字段（JSON 数组字符串）解析为 [{label,value}]；
 *   容错：非 JSON / 非数组 / 空数组 / 全部条目非法 → 返回 null（由调用方渲染占位）。
 * renderMiniChart(chartType, dataArr)：返回 SVG 字符串（bar 横向条形图 / pie 扇形图 / line 折线图）。
 *   颜色一律 var(--token)；label 为用户输入，进 SVG <text> 前必须 esc() 转义。
 */
function parseChartData(str){
  if(str === null || str === undefined) return null;
  let raw;
  try{ raw = JSON.parse(String(str)); }catch(_){ return null; }
  if(!Array.isArray(raw)) return null;
  const out = [];
  for(let i = 0; i < raw.length; i++){
    const it = raw[i];
    if(!it || typeof it !== "object" || Array.isArray(it)) continue;
    if(it.label === undefined || it.label === null || String(it.label).trim() === "") continue;
    // 注意：Number(null)/Number("") 均为 0，必须先显式剔除 null/undefined/空白串，再走数值转换
    const rawV = it.value;
    if(rawV === null || rawV === undefined) continue;
    if(typeof rawV === "string" && rawV.trim() === "") continue;
    const v = Number(rawV);
    // 非有限数值或负值剔除（负值对占比类图表无意义）
    if(!isFinite(v) || v < 0) continue;
    out.push({ label: String(it.label), value: v });
  }
  return out.length ? out : null;
}

/* 迷你图表配色令牌轮换（pie 多色；全部为 CSS 变量，满足 lint-colors 门禁） */
const MINI_CHART_COLORS = ["var(--accent)", "var(--ok)", "var(--warn)", "var(--danger)", "var(--muted)"];

/* 横向条形图：label 左侧 · 条形按 value 占比 · 数值右侧 */
function _miniBarSVG(data){
  const W = 300, LBL_W = 78, VAL_W = 40, BAR_X = LBL_W + 4;
  const BAR_MAXW = W - BAR_X - VAL_W - 6;
  const rowH = 20, H = Math.max(60, data.length * rowH + 8);
  const maxV = Math.max.apply(null, data.map(function(d){ return d.value; }).concat([1e-9]));
  let svg = '<svg viewBox="0 0 ' + W + ' ' + H + t("p3.html.svgHbar","\" preserveAspectRatio=\"xMidYMid meet\" role=\"img\" aria-label=\"横向条形图\">");
  data.forEach(function(d, i){
    const y = i * rowH + 4;
    const w = Math.max(1, Math.round(d.value / maxV * BAR_MAXW));
    svg += '<text class="mini-chart-lbl" x="' + LBL_W + '" y="' + (y + 12) + '" text-anchor="end">' +
      esc(d.label.length > 8 ? d.label.slice(0, 7) + "…" : d.label) + '</text>';
    // 条形轨道（--line）+ 数据条（--accent），行间交替微调透明度增强可读性
    svg += '<rect x="' + BAR_X + '" y="' + (y + 2) + '" width="' + BAR_MAXW + '" height="12" rx="3" fill="var(--line)" fill-opacity="0.45"/>';
    svg += '<rect x="' + BAR_X + '" y="' + (y + 2) + '" width="' + w + '" height="12" rx="3" fill="var(--accent)" fill-opacity="' + (i % 2 ? 0.75 : 1) + '"/>';
    svg += '<text class="mini-chart-val" x="' + (W - 2) + '" y="' + (y + 12) + '" text-anchor="end">' + esc(String(d.value)) + '</text>';
  });
  return svg + "</svg>";
}

/* 饼图：SVG 扇形（极坐标→path 弧线），多色令牌轮换 + 右侧图例 */
function _miniPieSlicePath(cx, cy, r, a0, a1){
  const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
  const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
  const large = (a1 - a0) > Math.PI ? 1 : 0;
  return "M" + cx + "," + cy + " L" + x0.toFixed(2) + "," + y0.toFixed(2) +
    " A" + r + "," + r + " 0 " + large + ",1 " + x1.toFixed(2) + "," + y1.toFixed(2) + " Z";
}
function _miniPieSVG(data){
  const W = 300, H = 130, cx = 62, cy = H / 2, r = 52;
  const total = data.reduce(function(s, d){ return s + d.value; }, 0);
  let svg = '<svg viewBox="0 0 ' + W + ' ' + H + t("p3.html.svgPie","\" preserveAspectRatio=\"xMidYMid meet\" role=\"img\" aria-label=\"饼图\">");
  if(total <= 0){
    // 全部 value 为 0：画灰色整圆占位
    svg += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" class="u-fill-panel2" stroke="var(--line)"/>';
  }else{
    let angle = -Math.PI / 2; // 从正上方开始顺时针
    data.forEach(function(d, i){
      const sweep = d.value / total * Math.PI * 2;
      const a0 = angle, a1 = angle + sweep;
      angle = a1;
      const color = MINI_CHART_COLORS[i % MINI_CHART_COLORS.length];
      // 单项占满（或仅剩浮点误差）：直接画整圆，避免弧线路径退化
      if(sweep >= Math.PI * 2 - 1e-9){
        svg += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" style="fill:' + color + '"/>';
      }else{
        svg += '<path d="' + _miniPieSlicePath(cx, cy, r, a0, a1) + '" style="fill:' + color + '" stroke="var(--panel)" stroke-width="1"/>';
      }
    });
  }
  // 右侧图例：色块 + label + 百分比
  let ly = 18;
  data.slice(0, 6).forEach(function(d, i){
    const color = MINI_CHART_COLORS[i % MINI_CHART_COLORS.length];
    const pct = total > 0 ? Math.round(d.value / total * 100) : 0;
    svg += '<rect x="132" y="' + (ly - 8) + '" width="10" height="10" rx="2" style="fill:' + color + '"/>';
    svg += '<text class="mini-chart-legend" x="148" y="' + ly + '">' +
      esc((d.label.length > 10 ? d.label.slice(0, 9) + "…" : d.label) + " " + pct + "%") + '</text>';
    ly += 19;
  });
  return svg + "</svg>";
}

/* 折线图：复用统计页 lineChartSVG（接收数值数组 + 颜色），外包一层容器说明维度标签 */
function _miniLineSVG(data){
  const vals = data.map(function(d){ return d.value; });
  const labels = data.slice(0, 6).map(function(d){ return esc(d.label); }).join(" · ");
  return '<div class="u-flex u-h-full u-flex-col">' +
    '<div class="u-flex-1 u-min-h-0">' + lineChartSVG(vals, "var(--accent)") + "</div>" +
    '<div class="mini-chart-legend u-text-center u-pb-1">' + labels + "</div></div>"
}

/**
 * 渲染迷你图表入口。
 * @param {string} chartType - bar / pie / line（未知类型回退 bar）
 * @param {Array<{label:string,value:number}>} dataArr - 已校验的数据点数组
 * @returns {string} SVG 字符串；空数据/非法输入返回友好占位文案
 */
/* v3.7.14（解耦 S2a）：注册迷你图表实现（AI 经桥接调用，消除 AI→Render 逆层依赖） */
AppBridge.miniChart = renderMiniChart;

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

/* ---------- v3.1：SQL Playground（sql.js WASM 沙箱） ---------- */
/**
 * 绑定 SQL 卡的「▶ 运行」按钮（render 后调用，幂等）。
 * @param {string} [storeKey] - 存储键（v3.1.2 A-档：data 场景 data_sql 与 code 场景 code_sql 双键支持）
 */
function bindCodeSqlCard(storeKey){
  const KEY = storeKey || "code_sql";
  $$("[data-f-sqlrun]").forEach(function(b){
    b.onclick = async function(){
      const id = b.getAttribute("data-f-sqlrun");
      const rec = load(PREFIX + KEY, []).find(function(r){ return r.id === id; });
      if(!rec){ toast(t("msg.recordNotFound","记录不存在"), "warn"); return; }
      if(b.disabled) return;
      b.disabled = true;
      const origText = b.textContent;
      b.textContent = t("msg.running","运行中…");
      const statusEl = $('[data-f-sqlstatus="' + id + '"]');
      const resultEl = $('[data-f-sqlresult="' + id + '"]');
      if(statusEl) statusEl.textContent = t("sql.loadingWasm","正在加载 WASM 沙箱…");
      try{
        const result = await runSql(rec.sql || "", rec.schema || "");
        if(statusEl) statusEl.textContent = result.ok ? "✓ " + result.rows.length + t("sql.rowPrefix"," 行 (") + result.ms + "ms)" : t("sql.execFail","✗ 失败");
        if(resultEl){
          if(result.ok && result.cols.length){
            let html = '<table class="sql-result-table"><thead><tr>';
            result.cols.forEach(function(c){ html += '<th>' + esc(c) + '</th>'; });
            html += '</tr></thead><tbody>';
            result.rows.forEach(function(row){
              html += '<tr>';
              row.forEach(function(cell){ html += '<td>' + esc(String(cell === null ? 'NULL' : cell)) + '</td>'; });
              html += '</tr>';
            });
            html += '</tbody></table>';
            resultEl.innerHTML = sanitizeHtml(html);
          }else if(result.ok){
            resultEl.innerHTML = sanitizeHtml(t("p3.html.sqlNoRows","<p class=\"hint\">执行成功（无返回行）</p>"));
          }else{
            resultEl.innerHTML = sanitizeHtml('<p class="hint sql-error">' + esc(result.error || t("tool.unknownErrorMsg", t("common.unknownError","未知错误"))) + '</p>');
          }
        }
        toast(result.ok ? t("sql.execDone","SQL 执行完成") : t("sql.execFailed","SQL 执行失败"), result.ok ? "ok" : "warn");
      }catch(e){
        if(statusEl) statusEl.textContent = t("sql.execException","✗ 异常");
        if(resultEl) resultEl.innerHTML = sanitizeHtml('<p class="hint sql-error">' + esc(e.message || String(e)) + '</p>');
        toast(t("sql.execError","SQL 执行异常"), "warn");
      }finally{
        b.disabled = false;
        b.textContent = origText;
      }
    };
  });
}

/**
 * 绑定代码运行器功能卡的「▶ 运行」按钮（render 后调用，幂等）。
 * 点击 → 按钮进入「运行中…」→ runJsSnippet 执行 → output 写回记录 result 字段 → toast → render 刷新。
 */
function bindCodeRunnerCard(){
  $$("[data-f-run]").forEach(function(b){
    b.onclick = async function(){
      const id = b.getAttribute("data-f-run");
      const rec = load(PREFIX + "code_runner", []).find(function(r){ return r.id === id; });
      if(!rec){ toast(t("msg.recordNotFound","记录不存在"), "warn"); return; }
      if(b.disabled) return; // 防重复点击
      b.disabled = true;
      b.textContent = t("msg.running","运行中…");
      const res = await runJsSnippet(rec.code || "");
      // v3.2 任务四：维护最近 5 次运行历史（result + resultHistory 双字段——老 result 兼容，新历史限制 5 条）
      const arr = load(PREFIX + "code_runner", []);
      save(PREFIX + "code_runner", arr.map(function(r){
        if(r.id !== id) return r;
        const history = Array.isArray(r.resultHistory) ? r.resultHistory.slice(0, 4) : [];
        history.unshift({ output: res.output, ok: res.ok, ms: res.ms, at: Date.now() });
        return Object.assign({}, r, { result: res.output, resultHistory: history });
      }));
      toast(res.ok ? t("sql.runComplete","运行完成（") + res.ms + "ms）" : t("sql.runFail","运行失败：") + String(res.output).slice(0, 60), res.ok ? "ok" : "error");
      render();
    };
  });
  // v3.2 任务四：运行历史折叠/展开
  $$("[data-f-runhist]").forEach(function(btn){
    btn.onclick = function(){
      const id = btn.getAttribute("data-f-runhist");
      const body = $('[data-f-runhist-body="' + id + '"]');
      if(!body) return;
      const showing = body.style.display !== "none";
      body.style.display = showing ? "none" : "";
      const rec = load(PREFIX + "code_runner", []).find(function(r){ return r.id === id; });
      const n = rec && Array.isArray(rec.resultHistory) ? rec.resultHistory.length : 0;
      btn.textContent = showing ? t("tool.codeRun.showHistory", "查看历史（{n} 次）").replace("{n}", String(n)) : t("tool.codeRun.hideHistory", "收起历史（{n} 次）").replace("{n}", String(n));
    };
  });
}

/**
 * v3.1.2 A-档：绑定 frontend 功能卡的「▶ 预览」按钮（render 后调用，幂等）。
 * 点击 → 把记录的 html/css/js 拼成完整文档 → sandbox iframe 实时渲染（jsdom 无 iframe 执行环境时降级提示）。
 */
function bindCodeFrontendCard(){
  $$("[data-f-preview]").forEach(function(b){
    b.onclick = function(){
      const id = b.getAttribute("data-f-preview");
      const rec = load(PREFIX + "code_frontend", []).find(function(r){ return r.id === id; });
      if(!rec){ toast(t("msg.recordNotFound","记录不存在"), "warn"); return; }
      const box = $('[data-f-previewbox="' + id + '"]');
      const statusEl = $('[data-f-previewstatus="' + id + '"]');
      if(!box) return;
      const showing = box.style.display !== "none";
      if(showing){ box.style.display = "none"; if(statusEl) statusEl.textContent = ""; return; } // 再点一次收起
      const doc = '<!doctype html><html><head><meta charset="utf-8"><style>' +
        String(rec.css || "") + '</style></head><body>' + String(rec.html || "") +
        // eslint-disable-next-line no-useless-escape -- <\/script> 的反斜杠是必需的：防止宿主 <script> 标签被内嵌文本提前闭合
        '<script>try{' + String(rec.js || "") + '}catch(e){document.body.insertAdjacentHTML("beforeend","<pre class=\"u-p-2\" style=\\"color:#d83b3b;font:12px monospace\\">JS Error: "+(e&&e.message||e)+"</pre>")}<\/script></body></html>';
      box.innerHTML = "";
      const frame = document.createElement("iframe");
      frame.setAttribute("sandbox", "allow-scripts");
      frame.setAttribute("title", t("frontend.previewTitle","页面预览"));
      frame.style.cssText = "width:100%;height:260px;border:1px solid var(--line);border-radius:var(--radius-sm);background:#fff";
      box.appendChild(frame);
      box.style.display = "";
      if(statusEl) statusEl.textContent = t("frontend.previewLive","✓ 实时预览中（再点一次收起）");
      try{
        frame.srcdoc = doc;
      }catch(e){
        // 环境不支持 srcdoc（旧浏览器/jsdom）：显示源码降级
        box.innerHTML = sanitizeHtml('<pre class="code-input u-fs-2xs u-pre-wrap">' + esc(doc) + '</pre>');
        if(statusEl) statusEl.textContent = t("frontend.previewSrcOnly","当前环境不支持 iframe 预览，已显示拼接后的源码");
      }
    };
  });
}

/**
 * v3.1.2 B-档：绑定会议管理卡的「→ 生成任务」按钮。
 * 识别 note 中的行动项（行首含数字序号 / →/@/+/-/* / 行动/跟进/待办/Action 关键词），逐条创建 office 场景任务。
 */
function bindMeetingActionCard(){
  $$("[data-meeting-action]").forEach(function(b){
    b.onclick = function(){
      const id = b.getAttribute("data-meeting-action");
      const rec = load(PREFIX + "meetings", []).find(function(r){ return r.id === id; });
      if(!rec){ toast(t("msg.recordNotFound","记录不存在"), "warn"); return; }
      const statusEl = $('[data-meeting-action-status="' + id + '"]');
      const items = String(rec.note || "").split(/[\n\r]+/).filter(function(line){
        // eslint-disable-next-line no-useless-escape -- 字符类 [\-\*] 内 \* 与 * 等价，但保留转义可读性（星号=列表项）
        return /^\s*[\d一二三四五六七八九十]+[.、)\uff09]/.test(line) || /^\s*[\u2192@\uff0b+\-\*]/.test(line) || /(行动|跟进|待办|Action|TODO|FIXME)/i.test(line);
      });
      if(!items.length){ toast(t("meeting.noActionItems","未识别到行动项"), "warn"); return; }
      // 写入 office 任务（关联会议标题 + 会议日期作为 due）
      const tasks = getTasks();
      const created = [];
      items.forEach(function(line, i){
        // eslint-disable-next-line no-useless-escape -- 字符类 [\-\*] 内保留 \* 转义（可读性）
        const title = line.replace(/^\s*[\d一二三四五六七八九十]+[.、)\uff09\s]*/, "").replace(/^\s*[\u2192@\uff0b+\-\*\s]*/, "").trim();
        if(!title) return;
        const t = { id: uid(), sc: "office", title: (rec.title ? rec.title + " · " : "") + title, due: rec.date || todayStr(), priority: "", status: "todo", doneAt: null, note: "", tags: ["meeting-action"], created: Date.now() };
        tasks.push(t);
        created.push(title);
      });
      if(!created.length){ toast(t("meeting.noActionItems","未识别到行动项"), "warn"); return; }
      setTasks(tasks);
      if(statusEl) statusEl.textContent = t("meeting.tasksGenerated","已生成 N 项任务").replace("N", created.length);
      toast(t("meeting.tasksGeneratedToast","已生成 N 项任务到「办公」场景").replace("N", created.length), "ok");
    };
  });
}

/**
 * v3.7.60：表单字段跨列类 —— 统一返回空字符串（所有字段等宽 span 1）。
 * 原来按类型区分（文字3/数字2/日期2/下拉2）导致字段宽度参差不齐，
 * 改为固定4列栅格后所有字段默认 span 1，等宽对齐。
 */
function _fieldSpanCls(f){
  return "";
}

function _featureCardHtml(cfg){
  const records = load(PREFIX + cfg.key, []);
  const form = '<div class="tool-form-grid">' + cfg.fields.map(function(f){
    if(f.type === "select"){
      return '<div class="tool-field' + _fieldSpanCls(f) + '"><label>' + esc(f.label) + '</label><select data-f-field="' + esc(f.k) + '">' +
        f.options.map(function(o){ return '<option value="' + esc(o) + '">' + esc(o) + '</option>'; }).join("") + '</select></div>';
    }
    // v3.0.1 B-5：支持 textarea（多行 JSON 数据输入）
    if(f.type === "textarea"){
      return '<div class="tool-field u-col-span-all"><label>' + esc(f.label) + '</label><textarea data-f-field="' + esc(f.k) + '" rows="3" placeholder="' + esc(f.placeholder || f.label) + '" class="u-fs-2xs u-min-h-0"style="font-family:\'SF Mono\',\'SFMono-Regular\',Consolas,monospace"></textarea></div>';
    }
    const inputType = f.type === "number" ? ' type="number" step="any"' : f.type === "date" ? ' type="text" inputmode="none" data-date-picker="1"' + (f.timePicker ? ' data-time-picker="1"' : '') : ' type="text"';
    /* v3.7.13：日期字段**预填今天**（用户 2026-09-22 截图质问："这个要手动录入吗？不是系统自动记录吗？"）。
       记录型场景里日期几乎总是"当下"，预填今天省一步操作；带时间选择器的字段不预填。 */
    const prefill = (f.type === "date" && !f.timePicker) ? ' value="' + todayStr() + '"' : '';
    const core = '<input' + inputType + prefill + ' data-f-field="' + esc(f.k) + '" placeholder="' + esc(f.placeholder || f.label) + '" aria-label="' + esc(f.label) + '">';
    /* v3.7.33：日期字段加 ▼ 指示符（与会议记录卡口径一致）——否则用户不知道可点开日期面板 */
    const wrapped = f.type === "date"
      ? '<div class="date-pick">' + core + '<svg class="date-pick-caret" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10l5 5 5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></div>'
      : core;
    return '<div class="tool-field' + _fieldSpanCls(f) + '"><label>' + esc(f.label) + '</label>' + wrapped + '</div>';
  }).join("") + '</div>';
  const sums = (typeof cfg.sum === "function") ? cfg.sum(records) : [];
  const summary = sums.length
    ? '<div class="tool-summary">' + sums.map(function(s){
        return '<div class="tool-summary-item"><span class="v">' + esc(String(s.v)) + '</span><span class="l">' + esc(s.l) + '</span></div>';
      }).join("") + '</div>'
    : '';
  // v3.0.1 B-3/B-5：可选 hint 说明行（如「JS 片段在沙箱 Worker 中执行」）
  const hint = cfg.hint ? '<div class="tool-hint">' + esc(cfg.hint) + '</div>' : "";
  // v3.0.1 B-5：可选行后附加钩子 rowAfter(r)——返回 HTML 追加在该数据行下方（colspan 全宽），
  // 用于渲染迷你图表 / 运行输出等富内容；返回空串则不追加（旧记录兼容）
  const colSpan = cfg.cols.length + 1;
  const rows = records.map(function(r){
    const tds = cfg.cols.map(function(c){
      if(c.type === "check"){ return '<td><input type="checkbox" data-f-check="' + r.id + '"' + (r.done ? " checked" : "") + ' aria-label="' + esc(c.label) + '"></td>'; }
      const v = (typeof c.fmt === "function") ? c.fmt(r) : esc(r[c.k] || "");
      return '<td>' + v + '</td>';
    }).join("");
    let extra = "";
    if(typeof cfg.rowAfter === "function"){
      const extraInner = cfg.rowAfter(r);
      if(extraInner) extra = '<tr class="f-row-extra"><td colspan="' + colSpan + '">' + extraInner + '</td></tr>';
    }
    return '<tr data-f-row="' + r.id + '"><td><button type="button" class="addbtn xs danger" data-f-del="' + r.id + '" aria-label="'+t("a11y.del", "删除")+'">✕</button></td>' + tds + '</tr>' + extra;
  }).join("");
  const list = records.length
    ? '<table class="tool-table"><thead><tr><th></th>' + cfg.cols.map(function(c){ return '<th>' + esc(c.label) + '</th>'; }).join("") + '</tr></thead><tbody>' + rows + '</tbody></table>'
    : '<div class="tool-empty">' + esc(cfg.emptyTip || t("empty.noRecords","暂无记录")) + '</div>';
  // v3.3.0 B-档：每卡一次钩子 afterList(recs)——rowAfter(r) 是每行钩子（入参为单条记录），
  // 卡片级聚合视图（项目进度速览 / 近 7 天到期）需要全量记录，渲染在列表/空态之后
  const afterListHtml = (typeof cfg.afterList === "function") ? cfg.afterList(records) : "";
  // v3.0：card 复用 .tool-app-card 类——表单网格/统计/表格/工具栏样式均限定在 .tool-app-card 内，
  // 若不挂该类，场景功能卡在 PC 上会退化为垂直堆叠（排版差劲）
  return '<div class="card tool-app-card"><h2>' + cfg.icon + ' ' + esc(cfg.title) + '</h2>' +
    /* v3.2 IA：每个记录型 tab 加「让 AI 帮记」按钮——AI 不再是空架子，它能调工具真正写入数据。
       点击聚焦 AI 聊天面板并预填「在 {场景} 场景记一笔 {tab 名}」上下文。 */
    '<div class="tool-filter-bar"><span class="add-wrap"><span class="add-label">'+t("tool.addLabel", t("common.add","添加"))+'</span><button type="button" class="addbtn sm add-round" data-f-add data-sc="accent" aria-label="'+t("tool.ariaAdd", "添加")+'">＋</button></span>' +
    /* v3.6.2：让AI帮记 改为「上方小标签 + 下方机器人图标按钮」，与左侧「添加」形制一致、图标同基线 */
    '<span class="add-wrap ai-wrap"><span class="add-label">'+t("tool.aiHint.btn","让 AI 帮记")+'</span><button type="button" class="addbtn sm add-round ai-round" data-ai-hint-for="'+esc(cfg.key)+'" data-sc="accent" aria-label="'+t("tool.aiHint.aria","让 AI 帮记")+'"><span class="ic-inline" aria-hidden="true">'+UI_ICONS.robot+'</span></button></span>' +
    /* v3.6.5：统计徽章并入工具栏右侧（margin-left:auto），不再单独占一大行——
       原排布「工具栏一行 + 统计三大块一行」上下割裂、右侧空旷，观感零散。
       countSuffix 的 </div> 随之后移：filter-bar 保持打开直到 summary 并入后才闭合。 */
    t("p3.html.countPrefix","<span class=\"sub\" class=\"u-m-0\">共 ") + records.length + t("p3.html.countSuffix"," 条</span>") +
    summary + '</div><div class="tool-form-box">' + form + '</div>' + hint + list + afterListHtml + '</div>';
}

/* ===== v3.6.2 自定义日期选择器（替代浏览器原生白底方角弹层） =====
 * 用法：<input type="text" inputmode="none" data-date-picker="1">。
 * 点击/聚焦该输入框时弹出主题化圆角面板；选定后把 YYYY-MM-DD 写入 input.value。
 * 全局单例（_dpPanel/_dpOverlay），ESC / 点面板外 / 选完即关闭。 */
var _dpPanel = null, _dpOverlay = null, _dpInput = null, _dpViewY = null, _dpViewM = null;
var _dpTimeH = null, _dpTimeM = null; // 小时(0-23) 和 分钟(0-59)
var _dpReFocusing = false;            // v3.7.39：关闭面板归还焦点期间，抑制 focus 委托重新打开
function _dpClose(){
  /* v3.7.39：关闭时把焦点**归还触发输入框**。
     此前没有这一步 —— 之所以看起来"焦点归位"，只是因为那时焦点本来就在输入框上；
     一旦面板内部获得过焦点（roving tabindex / 方向键导航），关闭后焦点就会掉到 BODY，
     键盘用户丢失当前位置。归还焦点是无障碍对话框类浮层的标准收尾动作。 */
  const back = _dpInput;
  if(_dpOverlay){ try{ _dpOverlay.remove(); }catch(_e){} _dpOverlay = null; }
  if(_dpPanel){ try{ _dpPanel.remove(); }catch(_e){} _dpPanel = null; }
  _dpInput = null;
  if(back && document.contains(back)){
    /* 防循环：归还焦点会再次触发下方那个 focus 委托 → 面板又打开。
       用一个一次性标志把这次程序化聚焦排除掉。 */
    _dpReFocusing = true;
    try { back.focus(); } catch(_e){}
    setTimeout(function(){ _dpReFocusing = false; }, 0);
  }
}
function _dpMonthDays(y, m){ return new Date(y, m + 1, 0).getDate(); }
function _dpFirstWeekday(y, m){ return new Date(y, m, 1).getDay(); } // 0=Sun
function _dpParseVal(v){ const m = /^(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{2}):(\d{2}))?$/.exec(String(v || "").trim()); return m ? { y: +m[1], m: +m[2] - 1, d: +m[3], h: m[4] ? +m[4] : null, min: m[5] ? +m[5] : null } : null; }
function _dpFmt(y, m, d, h, min){ var s = y + "-" + String(m + 1).padStart(2, "0") + "-" + String(d).padStart(2, "0"); if(h !== null && h !== undefined) s += " " + String(h).padStart(2, "0") + ":" + String(min || 0).padStart(2, "0"); return s; }
function _dpRender(){
  if(!_dpPanel) return;
  const today = new Date();
  const y = _dpViewY, m = _dpViewM;
  const weekNames = ["日","一","二","三","四","五","六"];
  const first = _dpFirstWeekday(y, m);
  const dim = _dpMonthDays(y, m);
  const prevDim = _dpMonthDays(y, m - 1);
  const cur = _dpInput ? _dpParseVal(_dpInput.value) : null;
  let html = '<div class="dp-head"><span class="dp-title">' + y + ' ' + t("datepicker.yearSuffix","年") + ' ' + (m + 1) + ' ' + t("datepicker.monthSuffix","月") + '</span>' +
    '<span class="dp-nav">' +
    '<button type="button" class="dp-nav-btn" data-dp-nav="-1" aria-label="' + t("datepicker.monthPrev","上一月") + '">‹</button>' +
    '<button type="button" class="dp-nav-btn" data-dp-nav="1" aria-label="' + t("datepicker.monthNext","下一月") + '">›</button>' +
    '</span></div>' +
    '<div class="dp-week">' + weekNames.map(function(wd){ return '<span>' + wd + '</span>'; }).join("") + '</div>' +
    '<div class="dp-grid">';
  /* v3.7.39：日格采用 **roving tabindex**（ARIA datepicker 的标准模式）——
     只有「当前焦点日」tabindex=0，其余 -1。
     否则一个月 35 个 button 全在 Tab 序里，键盘用户要按 35 次才走得出去（实测）。
     焦点日的选择：优先当前选中值，其次今天，最后 1 号；跨月由键盘导航自动接管。 */
  const _focusDay = (cur && cur.m === m && cur.y === y) ? cur.d
                  : (m === today.getMonth() && y === today.getFullYear()) ? today.getDate()
                  : 1;
  for(let i = 0; i < first; i++){
    const dd = prevDim - first + 1 + i;
    html += '<button type="button" class="dp-day other" data-dp-day="-1:' + dd + '" tabindex="-1">' + dd + '</button>';
  }
  for(let d = 1; d <= dim; d++){
    const isToday = (d === today.getDate() && m === today.getMonth() && y === today.getFullYear());
    const isSel = cur && cur.d === d && cur.m === m && cur.y === y;
    html += '<button type="button" class="dp-day' + (isToday ? " today" : "") + (isSel ? " selected" : "")
      + '" data-dp-day="0:' + d + '" tabindex="' + (d === _focusDay ? "0" : "-1") + '">' + d + '</button>';
  }
  const totalCells = first + dim;
  const tail = (7 - (totalCells % 7)) % 7;
  for(let i = 1; i <= tail; i++){
    html += '<button type="button" class="dp-day other" data-dp-day="1:' + i + '" tabindex="-1">' + i + '</button>';
  }
  html += '</div>';
  // 时间选择行（仅当 input 有 data-time-picker 属性时显示）
  if(_dpInput && _dpInput.hasAttribute("data-time-picker")){
    var defH = _dpTimeH !== null ? _dpTimeH : 9;
    var defM = _dpTimeM !== null ? _dpTimeM : 0;
    var hOpts = "";
    for(var hh = 0; hh < 24; hh++){
      hOpts += '<option value="' + hh + '"' + (hh === defH ? " selected" : "") + '>' + String(hh).padStart(2, "0") + '</option>';
    }
    var mOpts = "";
    for(var mm = 0; mm < 60; mm += 5){
      mOpts += '<option value="' + mm + '"' + (mm === defM ? " selected" : "") + '>' + String(mm).padStart(2, "0") + '</option>';
    }
    /* v3.7.29：加「时间」标签 —— 用户看截图问"会议只有日期，没时分吗？"，
       说明 [时]:[分] 两个下拉无标签时根本无法识别。 */
    html += '<div class="dp-time">' +
      '<span class="dp-time-lbl">' + t("datepicker.time","时间") + '</span>' +
      '<select class="dp-time-h" data-dp-time="h" aria-label="' + t("datepicker.hour","时") + '">' + hOpts + '</select>' +
      '<span>:</span>' +
      '<select class="dp-time-m" data-dp-time="m" aria-label="' + t("datepicker.minute","分") + '">' + mOpts + '</select>' +
      '</div>';
  }
  html += '<div class="dp-foot">' +
    '<button type="button" class="btn-ghost btn-sm" data-dp-clear="1">' + t("datepicker.clear","清除") + '</button>' +
    '<button type="button" class="btn-ghost btn-sm" data-dp-today="1">' + t("datepicker.today","今天") + '</button>';
  if(_dpInput && _dpInput.hasAttribute("data-time-picker")){
    html += '<button type="button" class="dp-confirm-btn" data-dp-confirm="1">' + t("datepicker.confirm","确定") + '</button>';
  }
  html += '</div>';
  _dpPanel.innerHTML = html;
}
function _dpPick(y, m, d){
  if(!_dpInput) return;
  // 如果之前没有时间，默认设为 09:00
  if(_dpTimeH === null) _dpTimeH = 9;
  if(_dpTimeM === null) _dpTimeM = 0;
  // 有 data-time-picker 属性时输出带时间格式，否则纯日期（向后兼容）
  if(_dpInput.hasAttribute("data-time-picker")){
    _dpInput.value = _dpFmt(y, m, d, _dpTimeH, _dpTimeM);
  } else {
    _dpInput.value = _dpFmt(y, m, d);
  }
  try{ _dpInput.dispatchEvent(new Event("change", { bubbles: true })); }catch(_e){}
  // 纯日期场景：选完即关闭；带时间场景：保持打开让用户调整时间
  if(!_dpInput.hasAttribute("data-time-picker")){
    _dpClose();
  }
}
function _dpOpen(input){
  _dpClose();
  if(!input) return;
  _dpInput = input;
  const cur = _dpParseVal(input.value) || (function(){ const n = new Date(); return { y: n.getFullYear(), m: n.getMonth(), d: n.getDate() }; })();
  _dpViewY = cur.y; _dpViewM = cur.m;
  _dpTimeH = cur && cur.h !== null ? cur.h : null;
  _dpTimeM = cur && cur.min !== null ? cur.min : null;
  const overlay = document.createElement("div");
  overlay.className = "dp-overlay";
  overlay.addEventListener("mousedown", function(){ _dpClose(); });
  const panel = document.createElement("div");
  panel.className = "dp-panel";
  panel.addEventListener("mousedown", function(e){ e.stopPropagation(); });
  document.body.appendChild(overlay);
  document.body.appendChild(panel);
  _dpOverlay = overlay; _dpPanel = panel;
  _dpRender();
  /* v3.7.39：打开后**把焦点移入当前日格** —— 否则焦点仍停在输入框上，
     下面那段方向键监听（要求 activeElement 是 .dp-day）永远不成立，
     用户在面板打开状态下按 ←→↑↓ 毫无反应。这是 roving tabindex 的标准配套动作。 */
  setTimeout(function(){
    try {
      const el = panel.querySelector('.dp-day[tabindex="0"]');
      if (el) el.focus();
    } catch (_) {}
  }, 0);
  /* v3.7.21：面板宽度**跟随触发输入框**（用户 2026-09-23 截图标注：
     "下拉框和日期卡片的宽度应该一致，和右侧的优先级下拉框间距不变"）。
     此前 v3.7.61 固定 240px，实测输入框 222px、面板 240px —— 面板比输入框宽 18px，
     右缘多出的一截正好压向右侧的优先级下拉框，视觉上"日期卡片和输入框不齐"。
     下限 200px 兜底：日历 7 列 + 表头在该宽度下仍可容纳；上限 300px 防止超宽屏失真。 */
  const _iw = (input && input.getBoundingClientRect) ? input.getBoundingClientRect().width : 240;
  panel.style.width = Math.min(300, Math.max(200, Math.round(_iw))) + "px";
  _dpLayout(true);
}
/* v3.7.8：面板定位（**打开时**与**滚动跟随**共用）。
   allowScroll=true 才允许"把输入框滚到视口中央"来腾出下方空间（只有打开时需要；
   滚动跟随里再滚一次会造成自我循环）。
   ⚠️ 本函数**永不把面板放到输入框上方**（用户："下拉框，不是上拉框"）。 */
function _dpLayout(allowScroll){
  if(!_dpPanel || !_dpInput) return;
  const panel = _dpPanel, input = _dpInput;
  /* 每次重算前先复位高度限制 —— 否则上一轮压扁的高度会锁死后续计算 */
  if(panel.style.maxHeight){ panel.style.maxHeight = ""; panel.style.overflowY = ""; }
  let r = input.getBoundingClientRect();
  const pw = panel.offsetWidth;
  let left = r.left;
  if(left + pw > window.innerWidth - 8) left = Math.max(8, window.innerWidth - pw - 8);
  const GAP = 6;
  let top = r.bottom + GAP;
  let availDown = window.innerHeight - top - 8;
  if(availDown < panel.offsetHeight){
    if(allowScroll){
      /* 下方放不下 → 把输入框**上移**，使面板底部刚好落在视口内（面板方向保持不变）。
         比 `block:"center"` 精准：center 在 560px 高的窗口里往往仍留不够空间，
         结果面板被 maxHeight 压扁、底部「清除/今天」按钮要滚动才看得到（实测过）。 */
      const wantBottom = Math.max(80, window.innerHeight - (panel.offsetHeight + GAP + 16));
      const delta = r.bottom - wantBottom;
      if(delta > 0){
        const sc = _dpScroller(input);
        if(sc) sc.scrollTop += delta;
        else { try{ input.scrollIntoView({ block: "center" }); }catch(_e){} }
      }
      r = input.getBoundingClientRect();
      top = r.bottom + GAP;
      availDown = window.innerHeight - top - 8;
    }
    if(availDown > 60 && panel.offsetHeight > availDown){
      panel.style.maxHeight = availDown + "px";
      panel.style.overflowY = "auto";
    }else if(availDown <= 60){
      /* 视口极矮（连 60px 都腾不出来）：保证不溢出视口底，但仍留在输入框下方 */
      const maxTop = window.innerHeight - panel.offsetHeight - 8;
      if(top > maxTop) top = Math.max(r.bottom + GAP, maxTop);
    }
  }
  panel.style.left = left + "px";
  panel.style.top = top + "px";
}
/* 从输入框往上找第一个"可滚动且真的在滚"的祖先容器（面板要滚的是它，不是 window） */
function _dpScroller(el){
  let n = el && el.parentElement;
  while(n && n !== document.body && n !== document.documentElement){
    const oy = getComputedStyle(n).overflowY;
    if((oy === "auto" || oy === "scroll") && n.scrollHeight > n.clientHeight + 4) return n;
    n = n.parentElement;
  }
  return document.scrollingElement || document.documentElement;
}
// 事件委托：点击带 data-date-picker 的输入框弹出自定义面板
document.addEventListener("focus", function(e){
  const t2 = e && e.target;
  if(_dpReFocusing) return;   /* v3.7.39：关闭时归还焦点的那次聚焦，不应重新打开面板 */
  if(t2 && t2.matches && t2.matches('input[data-date-picker="1"]')) _dpOpen(t2);
}, true);
document.addEventListener("click", function(e){
  const t2 = e && e.target;
  if(t2 && t2.matches && t2.matches('input[data-date-picker="1"]')){ if(!_dpPanel) _dpOpen(t2); return; }
  if(!_dpPanel) return;
  // 面板内按钮
  const nav = t2 && t2.closest && t2.closest("[data-dp-nav]");
  if(nav){ const step = Number(nav.getAttribute("data-dp-nav")) || 0; const d = new Date(_dpViewY, _dpViewM + step, 1); _dpViewY = d.getFullYear(); _dpViewM = d.getMonth(); _dpRender(); _dpLayout(false); return; }
  const day = t2 && t2.closest && t2.closest("[data-dp-day]");
  if(day){ const seg = (day.getAttribute("data-dp-day") || "").split(":"); const monShift = Number(seg[0]) || 0; const dd = Number(seg[1]); const base = new Date(_dpViewY, _dpViewM + monShift, 1); _dpPick(base.getFullYear(), base.getMonth(), dd); return; }
  const clear = t2 && t2.closest && t2.closest("[data-dp-clear]");
  if(clear){ if(_dpInput){ _dpInput.value = ""; try{ _dpInput.dispatchEvent(new Event("change", { bubbles: true })); }catch(_e){} } _dpTimeH = null; _dpTimeM = null; _dpClose(); return; }
  const todayBtn = t2 && t2.closest && t2.closest("[data-dp-today]");
  if(todayBtn){ const n = new Date(); if(_dpTimeH === null) _dpTimeH = 9; if(_dpTimeM === null) _dpTimeM = 0; _dpPick(n.getFullYear(), n.getMonth(), n.getDate()); return; }
  const confirmBtn = t2 && t2.closest && t2.closest("[data-dp-confirm]");
  if(confirmBtn){ _dpClose(); return; }
}, true);
// 时间选择变更
document.addEventListener("change", function(e){
  if(!_dpPanel) return;
  var sel = e.target && e.target.closest ? e.target.closest("[data-dp-time]") : null;
  if(!sel) return;
  if(sel.getAttribute("data-dp-time") === "h") _dpTimeH = parseInt(sel.value, 10);
  if(sel.getAttribute("data-dp-time") === "m") _dpTimeM = parseInt(sel.value, 10);
  // 更新 input 值
  if(_dpInput){
    var cur = _dpParseVal(_dpInput.value);
    if(cur){
      if(_dpInput.hasAttribute("data-time-picker")){
        _dpInput.value = _dpFmt(cur.y, cur.m, cur.d, _dpTimeH, _dpTimeM);
      } else {
        _dpInput.value = _dpFmt(cur.y, cur.m, cur.d);
      }
      try{ _dpInput.dispatchEvent(new Event("change", { bubbles: true })); }catch(_e){}
    }
  }
});
document.addEventListener("keydown", function(e){ if(e.key === "Escape" && _dpPanel) _dpClose(); });
/* v3.7.39：日期面板的**方向键导航**（ARIA datepicker 标准交互）。
   此前只有 Esc，方向键/Home/End/PageUp/PageDown 全无响应 —— 键盘用户只能用
   Tab 逐个走（一个月 35 格）或直接放弃。配合上面的 roving tabindex，
   现在是一套完整的键盘模型：←→ 日、↑↓ 周、Home/End 月首末、PgUp/PgDn 换月、Enter 选中。 */
document.addEventListener("keydown", function(e){
  if(!_dpPanel) return;
  const cur = document.activeElement;
  if(!cur || !cur.classList || !cur.classList.contains("dp-day")) return;
  const seg = String(cur.getAttribute("data-dp-day") || "").split(":");
  const shift = Number(seg[0]) || 0;
  const dayNo = Number(seg[1]) || 1;
  let delta = 0, mode = "";
  if(e.key === "ArrowLeft")       delta = -1;
  else if(e.key === "ArrowRight") delta = 1;
  else if(e.key === "ArrowUp")    delta = -7;
  else if(e.key === "ArrowDown")  delta = 7;
  else if(e.key === "Home")       mode = "home";
  else if(e.key === "End")        mode = "end";
  else if(e.key === "PageUp")     mode = "prevMonth";
  else if(e.key === "PageDown")   mode = "nextMonth";
  else if(e.key === "Enter" || e.key === " "){ e.preventDefault(); cur.click(); return; }
  else return;
  e.preventDefault();
  const base = new Date(_dpViewY, _dpViewM + shift, dayNo);
  let target;
  if(mode === "home")            target = new Date(base.getFullYear(), base.getMonth(), 1);
  else if(mode === "end")        target = new Date(base.getFullYear(), base.getMonth() + 1, 0);
  else if(mode === "prevMonth")  target = new Date(base.getFullYear(), base.getMonth() - 1, 1);
  else if(mode === "nextMonth")  target = new Date(base.getFullYear(), base.getMonth() + 1, 1);
  else { target = new Date(base); target.setDate(base.getDate() + delta); }
  /* 跨月则重渲染视图，再把焦点落到目标日格（roving tabindex 需同步改写） */
  if(target.getFullYear() !== _dpViewY || target.getMonth() !== _dpViewM){
    _dpViewY = target.getFullYear(); _dpViewM = target.getMonth();
    _dpRender();
  }
  if(mode !== "prevMonth" && mode !== "nextMonth"){
    const el = _dpPanel && _dpPanel.querySelector('.dp-day[data-dp-day="0:' + target.getDate() + '"]');
    if(el){
      Array.prototype.forEach.call(_dpPanel.querySelectorAll(".dp-day"), function(b){ b.setAttribute("tabindex", "-1"); });
      el.setAttribute("tabindex", "0");
      el.focus();
    }
  }
});
window.addEventListener("resize", function(){ _dpClose(); });
window.addEventListener("scroll", function(){ _dpLayout(false); }, true);
/* v3.7.8：由 `_dpClose()` 改为 `_dpLayout(false)` —— **滚动时跟随重定位，而不是关闭面板**。
   原因（实测踩坑）：_dpLayout 在"下方放不下"时会 scrollIntoView 把输入框滚到视口中央，
   而旧的 scroll handler 是"一滚动就关面板" → 滚动把面板自己关掉了（1080x560 等矮窗口下
   表现为"点了日期框什么都不出现"）。跟随重定位同时也是更好的交互（原生 select 亦如此）。 */

/** 通用功能卡事件绑定（委托到 #main，幂等）
 * @param {string} key - 存储键（PREFIX + key）
 * @param {string[]} fieldKeys - 表单字段名数组（用于读取输入值）
 */
function _featureCardBind(key, fieldKeys, onSave){
const root = $("#main"); if(!root) return;
// 添加
$$("[data-f-add]").forEach(function(b){
b.onclick = function(){
const rec = { id: Date.now().toString(36) + Math.random().toString(36).slice(2,6), createdAt: Date.now() };
fieldKeys.forEach(function(k){
const el = root.querySelector('[data-f-field="' + k + '"]');
if(el) rec[k] = (el.type === "number") ? Number(el.value || 0) : el.value.trim();
});
if(!fieldKeys.some(function(k){ return rec[k]; })){ toast(t("msg.fillContentFirst","请先填写内容"), "warn"); return; }
const arr = load(PREFIX + key, []);
arr.unshift(rec);
save(PREFIX + key, arr);
// v3.2 任务四：保存后钩子（onSave 形式 — 错题自动入 SM-2 等场景级联动）
try{ if(typeof onSave === "function"){ onSave(rec); } }catch(_e){ /* 钩子异常不阻断保存 */ }
toast(t("msg.added","已添加"), "ok");
render();
};
});
  // 删除
  $$("[data-f-del]").forEach(function(b){
    b.onclick = function(){
      const id = b.getAttribute("data-f-del");
      const arr = load(PREFIX + key, []);
      const target = arr.find(function(r){ return r.id === id; });
      // v3.4.5 G1 修复：功能卡记录删除同步清理 IDB 图片 blob（与场景记录删除同因——防孤儿累积）
      if(target && target.img){
        try{ idbDeleteKey(target.img).catch(()=>{}); }catch(_e){ /* IDB 不可用静默 */ }
      }
      save(PREFIX + key, arr.filter(function(r){ return r.id !== id; }));
      toast(t("msg.deleted","已删除"), "ok");
      render();
    };
  });
  // 完成勾选
  $$("[data-f-check]").forEach(function(b){
    b.onchange = function(){
      const id = b.getAttribute("data-f-check");
      save(PREFIX + key, load(PREFIX + key, []).map(function(r){
        return r.id === id ? Object.assign({}, r, { done: b.checked }) : r;
      }));
      render();
    };
  });
  /* v3.2 IA：「让 AI 帮记」点击 → 聚焦聊天面板 + 预填场景+功能上下文 */
  $$("[data-ai-hint-for]").forEach(function(b){
    b.onclick = function(){
      if(typeof askAiAboutScene === "function"){
        const k = b.getAttribute("data-ai-hint-for") || "";
        askAiAboutScene(active, k);
      }
    };
  });
  /* v3.3.0 B 3/8：知识库标签 chips 点击过滤（toggle；render 重绑幂等） */
  $$("[data-ktag]").forEach(function(b){
    b.onclick = function(){
      const tg = b.getAttribute("data-ktag") || "";
      _kbTagFilter = (_kbTagFilter === tg) ? "" : tg;
      render();
    };
  });
}

/* ---------- 办公场景功能卡（P2） ---------- */
SCENE_FEATURE_RENDER.office = {
  meeting: function(){
    return _featureCardHtml({
      key:"meetings", title:t("tool.meeting.name","会议管理"), icon:ic("chat"),
      fields:[
        {k:"title", label:t("field.meetingTitle", t("field.meetingTitle","会议主题")), type:"text"},
        {k:"type", label:t("field.meetingType","会议类型"), type:"select", options:[t("type.weeklyMeeting","周会"),t("type.review","评审"),t("type.client","客户"),t("type.team","团队"),t("option.other","其他")]},
        {k:"date", label:t("tool.regex.preset.date", t("field.date","日期")), type:"date", timePicker:true},
        {k:"host", label:t("field.host","主持人"), type:"text"},
        {k:"who", label:t("field.attendees","参会人"), type:"text"},
        {k:"duration", label:t("field.durationHours","时长(小时)"), type:"number"},
        {k:"note", label:t("field.conclusion", t("field.conclusion","结论 / 跟进")), type:"text"}
      ],
      cols:[
        {label:t("field.meetingTitle", t("field.meetingTitle","会议主题")), k:"title"},
        {label:t("field.type", t("field.type","类型")), k:"type"},
        {label:t("tool.regex.preset.date", t("field.date","日期")), k:"date"},
        /* v3.7.32：开始时间独立成列（与字段拆分保持一致） */
        {label:t("field.startTime","开始时间"), k:"startTime"},
        {label:t("field.attendees","参会人"), k:"who"},
        {label:t("field.status", t("field.status","状态")), fmt:function(r){ return r.done ? t("p3.html.meetingOpened","<span class=\"u-text-ok\">已开</span>") : t("p3.html.meetingPending","<span class=\"u-text-warn\">待开</span>"); }}
      ],
      sum:function(recs){
        const open = recs.filter(function(r){ return !r.done; }).length;
        const now = new Date(); const _wd = (now.getDay()+6)%7;
        const mon = new Date(now); mon.setDate(now.getDate()-_wd); mon.setHours(0,0,0,0);
        const week = recs.filter(function(r){ return r.date && new Date(r.date) >= mon; }).length;
        return [{ v:open, l:t("status.pending","待开") }, { v:recs.length - open, l:t("status.opened","已开") }, { v:week, l:t("time.thisWeek","本周") }];
      },
      // v3.1.2 B-档：会议结论识别行动项 → 一键生成 office 任务（此前会议结论无法一键落地为任务）
      rowAfter:function(r){
        if(!r.note) return "";
        // 识别行动项：行首含「行动/跟进/待办/Action/→/@」或数字序号 1./(1) 等
        const items = String(r.note).split(/[\n\r]+/).filter(function(line){
          // eslint-disable-next-line no-useless-escape -- 字符类 [\-\*] 内保留 \* 转义（可读性）
          return /^\s*[\d一二三四五六七八九十]+[.、)\uff09]/.test(line) || /^\s*[\u2192@\uff0b+\-\*]/.test(line) || /(行动|跟进|待办|Action|TODO|FIXME)/i.test(line);
        });
        if(!items.length) return "";
        return '<div class="meeting-action-bar">' +
          '<span class="sub u-mr-2">' + t("meeting.actionItemsFound","发现 N 项行动项").replace("N", items.length) + '</span>' +
          '<button type="button" class="addbtn xs" data-meeting-action="' + r.id + '">' + t("meeting.genTasks","→ 生成任务") + '</button>' +
          '<span class="meeting-action-status" data-meeting-action-status="' + r.id + '"></span></div>';
      },
      emptyTip:t("empty.noMeeting","暂无会议 · 点击「添加」记录第一场会议")
    });
  },
  project: function(){
    return _featureCardHtml({
      key:"projects", title:t("tool.project.name","项目管理"), icon:ic("target"),
      fields:[
        {k:"name", label:t("field.projectName","项目名"), type:"text"},
        {k:"owner", label:t("field.owner","负责人"), type:"text"},
        {k:"milestone", label:t("field.milestone","里程碑"), type:"text"},
        {k:"status", label:t("field.status", t("field.status","状态")), type:"select", options:[t("status.planning","规划中"),t("kanban.doing","进行中"),t("kanban.done","已完成"),t("status.paused","已暂停")]},
        {k:"progress", label:t("field.progressPercent","进度 %"), type:"number"},
        {k:"due", label:t("field.dueDate","截止日期"), type:"date"}
      ],
      cols:[
        {label:t("field.projectName","项目名"), k:"name"},
        {label:t("field.owner","负责人"), k:"owner"},
        {label:t("field.status", t("field.status","状态")), k:"status"},
        {label:t("field.progress","进度"), fmt:function(r){ return '<div class="bar u-min-w-80"><span class="track"><span class="fill" style="width:' + Math.min(Number(r.progress)||0,100) + '%"></span></span></div>' + (r.progress||0) + '%'; }}
      ],
      sum:function(recs){
        const today = todayStr();
        const overdue = recs.filter(function(r){ return r.due && r.due < today && r.status!==t("kanban.done","已完成"); }).length;
        return [
          { v:recs.filter(function(r){ return r.status===t("kanban.doing","进行中"); }).length, l:t("kanban.doing","进行中") },
          { v:recs.filter(function(r){ return r.status===t("kanban.done","已完成"); }).length, l:t("kanban.done","已完成") },
          { v:overdue, l:t("tool.bill.overdue", t("tool.bill.overdue","逾期")) }
        ];
      },
      // v3.3.0 B 1/8：项目视图——按任务 project: 标签聚合各项目任务进度（只读速览，最多 6 行）
      afterList:function(recs){
        const tasks = (typeof getTasks === "function") ? getTasks() : [];
        const byProject = {};
        (tasks || []).forEach(function(task){
          if(task.deletedAt) return;
          const tag = (task.tags || []).find(function(x){ return String(x).indexOf("project:") === 0; });
          if(!tag) return;
          const name = tag.slice(8) || "—";
          if(!byProject[name]) byProject[name] = { done:0, total:0 };
          byProject[name].total++;
          if(task.status === "done") byProject[name].done++;
        });
        (recs || []).forEach(function(r){
          if(r.name && !byProject[r.name]) byProject[r.name] = { done:0, total:0 };
        });
        const names = Object.keys(byProject);
        if(!names.length) return "";
        names.sort(function(a,b){ return (byProject[b].total - byProject[b].done) - (byProject[a].total - byProject[a].done); });
        const rows = names.slice(0, 6).map(function(n){
          const p = byProject[n];
          const pct = p.total ? Math.round(p.done * 100 / p.total) : 0;
          const remain = p.total - p.done;
          return '<div class="proj-view-row"><span class="proj-view-name">' + esc(n) + '</span>' +
            '<span class="proj-view-pct">' + (p.total ? pct + "%" : "·") + '</span>' +
            '<span class="bar proj-view-bar"><span class="track"><span class="fill" style="width:' + (p.total ? pct : 0) + '%"></span></span></span>' +
            '<span class="proj-view-remain">' + (p.total ? (remain > 0 ? t("proj.view.open","{n} 项未完成").replace("{n}", remain) : t("proj.view.done","已完成")) : t("proj.view.noTasks","暂无关联任务")) + '</span></div>';
        }).join("");
        return '<div class="proj-view"><div class="proj-view-head">' + t("proj.view.head","任务进度（按 project: 标签聚合）") + '</div>' + rows + '</div>';
      },
      emptyTip:t("empty.noProject","暂无项目 · 点击「添加」记录第一个项目")
    });
  },
  attendance: function(){
    return _featureCardHtml({
      key:"attendance", title:t("tool.attendance.name","考勤打卡"), icon:ic("check"),
      fields:[
        {k:"date", label:t("tool.regex.preset.date", t("field.date","日期")), type:"date"},
        {k:"type", label:t("field.attendanceType","考勤类型"), type:"select", options:[t("status.normal","正常"),t("status.late","迟到"),t("status.earlyLeave","早退"),t("status.leave","请假"),t("status.overtime","加班")]},
        {k:"checkIn", label:t("field.clockInTime","上班时间"), type:"text", placeholder:t("placeholder.time09","如 09:00")},
        {k:"checkOut", label:t("field.clockOutTime","下班时间"), type:"text", placeholder:t("placeholder.time1830","如 18:30")},
        {k:"note", label:t("field.note", t("field.note","备注")), type:"text"}
      ],
      cols:[
        {label:t("tool.regex.preset.date", t("field.date","日期")), k:"date"},
        {label:t("field.type", t("field.type","类型")), k:"type"},
        {label:t("time.clockIn","上班"), k:"checkIn"},
        {label:t("time.clockOut","下班"), k:"checkOut"},
        {label:t("time.workHours","工时"), fmt:function(r){
          if(!r.checkIn || !r.checkOut) return "-";
          const p = function(s){ const m = /^(\d{1,2}):(\d{2})$/.exec(String(s)); return m ? Number(m[1])*60+Number(m[2]) : NaN; };
          const a = p(r.checkIn), b = p(r.checkOut);
          if(isNaN(a)||isNaN(b)||b<a) return "-";
          return ((b-a)/60).toFixed(1) + "h";
        }}
      ],
      sum:function(recs){
        const late = recs.filter(function(r){ return r.type===t("status.late","迟到"); }).length;
        const leave = recs.filter(function(r){ return r.type===t("status.leave","请假"); }).length;
        // v3.2 A 2/3：当月出勤天数（type==正常 + 当月有日期）+ 总工时（按 checkIn/checkOut 解析）
        const now = new Date(); const ym = now.getFullYear() + "-" + String(now.getMonth()+1).padStart(2,"0");
        const monthDays = recs.filter(function(r){ return r.date && String(r.date).slice(0,7)===ym && r.type===t("status.normal","正常"); }).length;
        const monthHours = recs.filter(function(r){ return r.date && String(r.date).slice(0,7)===ym && r.checkIn && r.checkOut; }).reduce(function(s,r){
          const m1 = /^(\d{1,2}):(\d{2})$/.exec(String(r.checkIn||"")); const m2 = /^(\d{1,2}):(\d{2})$/.exec(String(r.checkOut||""));
          if(!m1 || !m2) return s;
          const a = Number(m1[1])*60+Number(m1[2]); const b = Number(m2[1])*60+Number(m2[2]);
          return b>a ? s + (b-a)/60 : s;
        }, 0);
        return [
          { v:recs.length, l:t("stat.total","累计") },
          { v:monthDays, l:t("time.thisMonthWork","本月出勤") },
          { v:late, l:t("status.late","迟到") },
          { v:leave, l:t("status.leave","请假") },
          { v:monthHours.toFixed(1) + "h", l:t("time.thisMonthHours","本月工时") }
        ];
      },
      emptyTip:t("empty.noAttendance","暂无打卡记录 · 点击「添加」记录上下班")
    });
  },
  expense: function(){
    return _featureCardHtml({
      key:"expenses", title:t("tool.reimburse.name","报销管理"), icon:ic("bill"),
      fields:[
        {k:"title", label:t("field.reimburseReason","报销事由"), type:"text"},
        {k:"who", label:t("field.reimburser","报销人"), type:"text"},
        {k:"amount", label:t("field.amount","金额"), type:"number"},
        {k:"category", label:t("field.category2","类别"), type:"select", options:[t("category.travel","差旅"),t("category.meal","餐饮"),t("category.office","办公"),t("category.transport","交通"),t("option.other","其他")]},
        {k:"date", label:t("tool.regex.preset.date", t("field.date","日期")), type:"date"},
        {k:"status", label:t("field.status", t("field.status","状态")), type:"select", options:[t("status.pendingReview","待审"),t("status.approved","已批"),t("status.reported","已报")]}
      ],
      cols:[
        {label:t("field.reason","事由"), k:"title"},
        {label:t("field.reimburser","报销人"), k:"who"},
        {label:t("field.amount","金额"), fmt:function(r){ return "¥" + (Number(r.amount)||0).toFixed(2); }},
        {label:t("field.category2","类别"), k:"category"},
        {label:t("field.status", t("field.status","状态")), k:"status"}
      ],
      sum:function(recs){
        const total = recs.reduce(function(s,r){ return s + (Number(r.amount)||0); }, 0);
        const now = new Date(); const ym = now.getFullYear() + "-" + String(now.getMonth()+1).padStart(2,"0");
        const monthTotal = recs.filter(function(r){ return r.date && String(r.date).slice(0,7)===ym; }).reduce(function(s,r){ return s + (Number(r.amount)||0); }, 0);
        // v3.2 A 1/3：按分类聚合本月（白领最常问"本月餐饮花了多少"——按类别分账）
        const byCat = {}; recs.filter(function(r){ return r.date && String(r.date).slice(0,7)===ym; }).forEach(function(r){ const c = r.category || t("category.other","其他"); byCat[c] = (Number(byCat[c])||0) + (Number(r.amount)||0); });
        const catEntries = Object.keys(byCat).sort(function(a,b){ return byCat[b]-byCat[a]; }).slice(0, 2).map(function(c){ return { v: "¥" + byCat[c].toFixed(0), l: c }; });
        return [
          { v:"¥" + total.toFixed(0), l:t("stat.total","累计") },
          { v:"¥" + monthTotal.toFixed(0), l:t("time.thisMonth","本月") },
          { v:recs.filter(function(r){ return r.status===t("status.pendingReview","待审"); }).length, l:t("status.pendingReview","待审") }
        ].concat(catEntries);
      },
      emptyTip:t("empty.noReimburse","暂无报销单 · 点击「添加」录入第一笔")
    });
  },
  doc: function(){
    const tools = [
      { id:"off-md",    name:t("tool.mdEditor.name","Markdown 编辑器"), desc:t("tool.mdEditor.desc","分栏编辑 · 实时预览 · 导出") },
      { id:"off-word",  name:t("tool.wordEditor.name","Word 富文本"),     desc:t("tool.wordEditor.desc","所见即所得 · 导出 .doc") },
      { id:"off-sheet", name:t("tool.tableEditor.name","表格编辑器"),      desc:t("tool.tableEditor.desc","可编辑表格 · 导出 CSV") },
      { id:"off-ppt",   name:t("tool.slides.name","幻灯片"),          desc:t("tool.slides.desc","卡片式编辑 · 全屏放映") },
      { id:"off-pdf",   name:t("tool.pdfReader.name","PDF 阅读"),        desc:t("tool.pdfReader.desc","导入本地 PDF · 预览") },
      { id:"off-ocr",   name:t("tool.ocr.name","截图 OCR"),        desc:t("tool.ocr.desc","上传截图 · AI 识别文字") }
    ];
    const items = tools.map(function(t){
      const app = TOOL_APPS[t.id];
      return '<button type="button" class="doc-tool-item" data-tool="' + t.id + '">' +
        '<span class="doc-tool-ic">' + (app && app.icon ? app.icon : "") + '</span>' +
        '<span class="doc-tool-tx"><b>' + esc(t.name) + '</b><small>' + esc(t.desc) + '</small></span>' +
        t("p3.html.docToolGo","<span class=\"doc-tool-go\">打开 →</span></button>");
    }).join("");
    return '<div class="card"><h2>' + ic("file") + t("p3.html.docCenterTitle"," 文档中心</h2>") +
      t("p3.html.docCenterSub","<p class=\"sub\">办公文档工具集：表格 / PPT / PDF / Word / Markdown / OCR</p>") +
      '<div class="doc-tool-grid">' + items + '</div></div>';
  }
};

/* ---------- 生活场景功能卡（P2） ---------- */
SCENE_FEATURE_RENDER.life = {
  plan: function(){
    return _featureCardHtml({
      key:"life_plans", title:t("tool.plan.name","计划管理"), icon:ic("mindmap"),
      fields:[
        {k:"title", label:t("field.planContent","计划内容"), type:"text"},
        {k:"type", label:t("field.type", t("field.type","类型")), type:"select", options:[t("type.schedule","日程"),t("type.habit","习惯"),t("type.goal","目标"),t("type.memo","备忘")]},
        {k:"priority", label:t("task.priority","优先级"), type:"select", options:[t("task.priority.high","高"),t("task.priority.medium","中"),t("task.priority.low","低")]},
        {k:"date", label:t("tool.regex.preset.date", t("field.date","日期")), type:"date"},
        {k:"note", label:t("field.note", t("field.note","备注")), type:"text"}
      ],
      cols:[
        {label:t("field.planContent","计划内容"), k:"title"},
        {label:t("field.type", t("field.type","类型")), k:"type"},
        {label:t("tool.regex.preset.date", t("field.date","日期")), k:"date"},
        {label:t("field.status", t("field.status","状态")), type:"check", fmt:function(r){ return r.done ? t("kanban.done","已完成") : t("kanban.doing","进行中"); }}
      ],
      sum:function(recs){
        const high = recs.filter(function(r){ return r.priority===t("task.priority.high","高") && !r.done; }).length;
        return [
          { v:recs.filter(function(r){ return !r.done; }).length, l:t("kanban.doing","进行中") },
          { v:recs.filter(function(r){ return r.done; }).length, l:t("kanban.done","已完成") },
          { v:high, l:t("status.highPriorityTodo","高优待办") }
        ];
      },
      emptyTip:t("empty.noPlan","暂无计划 · 点击「添加」制定第一个计划")
    });
  },
  health: function(){
    return _featureCardHtml({
      key:"life_health", title:t("tool.health.name","健康记录"), icon:ic("sport"),
      fields:[
        {k:"date", label:t("tool.regex.preset.date", t("field.date","日期")), type:"date"},
        {k:"weight", label:t("field.weightKg","体重(kg)"), type:"number"},
        {k:"exercise", label:t("field.exerciseMin","运动(分钟)"), type:"number"},
        {k:"sleep", label:t("field.sleepHours","睡眠(小时)"), type:"number"},
        {k:"note", label:t("field.note", t("field.note","备注")), type:"text"}
      ],
      cols:[
        {label:t("tool.regex.preset.date", t("field.date","日期")), k:"date"},
        {label:t("field.weight","体重"), fmt:function(r){ return r.weight ? r.weight + "kg" : "-"; }},
        {label:t("side.sub.sport", t("field.exercise","运动")), fmt:function(r){ return r.exercise ? r.exercise + t("unit.minute","分") : "-"; }},
        {label:t("field.sleep","睡眠"), fmt:function(r){ return r.sleep ? r.sleep + "h" : "-"; }}
      ],
      sum:function(recs){
        return [{ v:recs.length, l:t("common.record","记录") }];
      },
      emptyTip:t("empty.noHealth","暂无健康记录 · 点击「添加」记录第一条")
    });
  },
  bill: function(){
    return _featureCardHtml({
      key:"life_bills", title:t("tool.bill.name","缴费提醒"), icon:ic("bill"),
      fields:[
        {k:"name", label:t("tool.bill.item", t("field.billItem","缴费项目")), type:"text"},
        {k:"amount", label:t("field.amount","金额"), type:"number"},
        {k:"cycle", label:t("field.cycle","周期"), type:"select", options:[t("cycle.monthly","月缴"),t("cycle.quarterly","季缴"),t("cycle.yearly","年缴"),t("cycle.oneTime","一次性")]},
        {k:"due", label:t("tool.bill.due", t("field.dueDate","到期日")), type:"date"},
        {k:"status", label:t("field.status", t("field.status","状态")), type:"select", options:[t("status.unpaid","未缴"),t("status.paid","已缴")]}
      ],
      cols:[
        {label:t("tab.project", t("field.project","项目")), k:"name"},
        {label:t("field.amount","金额"), fmt:function(r){ return "¥" + (Number(r.amount)||0).toFixed(2); }},
        {label:t("field.cycle","周期"), k:"cycle"},
        {label:t("field.status", t("field.status","状态")), k:"status"}
      ],
      sum:function(recs){
        const unpaid = recs.filter(function(r){ return r.status!==t("status.paid","已缴"); }).length;
        const total = recs.reduce(function(s,r){ return s + (Number(r.amount)||0); }, 0);
        return [{ v:unpaid, l:t("status.toPay","待缴") }, { v:"¥" + total.toFixed(0), l:t("stat.totalAmount","总额") }];
      },
      // v3.2 A 3/3：近 7 天到期列表（白领下午杂事场景——一眼看到"这周要交什么"，按 due 升序，已缴折叠）
      // v3.3.0 修复：原挂在 rowAfter（每行钩子，入参为单条记录、无 .length，守卫直接空返回）导致该功能从未渲染——改挂每卡钩子 afterList
      afterList:function(recs){
        if(!recs || !recs.length) return "";
        const now = new Date();
        const _dayMs = 86400000;
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
        const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7, 23, 59, 59); // 含第 7 天全天（type=date 值按 UTC 零点解析，原实现会漏掉恰好 +7 天的账单）
        const items = recs.filter(function(r){
          if(!r.due || r.status === t("status.paid","已缴")) return false;
          const d = new Date(r.due);
          return d >= start && d <= end;
        }).sort(function(a, b){ return String(a.due).localeCompare(String(b.due)); });
        if(!items.length) return "";
        const rows = items.map(function(r){
          const dueDate = new Date(r.due);
          // 按自然日差计算（原实现用时刻差四舍五入，晚间看今天到期的账单会显示"已过 1 天"）
          const days = Math.round((new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate()) - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / _dayMs);
          const dayLabel = days === 0 ? t("life.bills.today","今天") : (days < 0 ? t("life.bills.overdueDays","已过 {n} 天").replace("{n}", Math.abs(days)) : t("life.bills.inDays","还有 {n} 天").replace("{n}", days));
          const isClose = days >= 0 && days <= 3;
          return '<div class="upcoming-bill-row' + (isClose ? ' is-close' : '') + '">' +
            '<span class="upcoming-bill-name">' + (r.name || r.title || "—") + '</span>' +
            '<span class="upcoming-bill-amount">¥' + (Number(r.amount)||0).toFixed(0) + '</span>' +
            '<span class="upcoming-bill-when">' + dayLabel + '</span>' +
            '</div>';
        }).join("");
        return '<div class="upcoming-bills"><div class="upcoming-bills-head">' + t("life.bills.upcomingHead","近 7 天到期") + '</div>' + rows + '</div>';
      },
      emptyTip:t("empty.noBill","暂无缴费项目 · 点击「添加」记录第一笔缴费")
    });
  },
  shop: function(){
    return _featureCardHtml({
      key:"life_shopping", title:t("tool.shop.name","采购清单"), icon:ic("shop"),
      fields:[
        {k:"name", label:t("tool.shop.itemShort", t("field.item","物品")), type:"text"},
        {k:"qty", label:t("tool.shop.qty", t("field.quantity","数量")), type:"number"},
        {k:"amount", label:t("field.amount","金额"), type:"number"},
        {k:"status", label:t("field.status", t("field.status","状态")), type:"select", options:[t("status.toBuy","待买"),t("status.bought","已买")]}
      ],
      cols:[
        {label:t("tool.shop.itemShort", t("field.item","物品")), k:"name"},
        {label:t("tool.shop.qty", t("field.quantity","数量")), fmt:function(r){ return (Number(r.qty)||0); }},
        {label:t("field.amount","金额"), fmt:function(r){ return "¥" + (Number(r.amount)||0).toFixed(2); }},
        {label:t("field.status", t("field.status","状态")), k:"status"}
      ],
      sum:function(recs){
        const todo = recs.filter(function(r){ return r.status!==t("status.bought","已买"); }).length;
        const total = recs.reduce(function(s,r){ return s + (Number(r.amount)||0); }, 0);
        return [{ v:todo, l:t("status.toBuy","待买") }, { v:"¥" + total.toFixed(0), l:t("field.budget","预算") }];
      },
      emptyTip:t("empty.noShop","暂无采购物品 · 点击「添加」记录要买的东西")
    });
  }
};

/* ---------- 学习场景功能卡（P3） ---------- */
/* v3.3.0 B 3/8：知识库标签筛选状态——"" 为不过滤；点击 chip 切换（再点取消），render 重绑幂等 */
let _kbTagFilter = "";
SCENE_FEATURE_RENDER.study = {
  knowledge: function(){
    return _featureCardHtml({
      key:"knowledge", title:t("tool.kb.name","知识库"), icon:ic("kb"),
      fields:[
        {k:"title", label:t("field.title", t("field.title","标题")), type:"text"},
        {k:"category", label:t("field.category","分类"), type:"text"},
        {k:"source", label:t("field.source","来源"), type:"text"},
        {k:"importance", label:t("field.importance","重要度"), type:"select", options:[t("task.priority.high","高"),t("task.priority.medium","中"),t("task.priority.low","低")]},
        {k:"tags", label:t("task.tags","标签"), type:"text"},
        {k:"content", label:t("tool.ppt.content", t("field.content","内容")), type:"text"}
      ],
      cols:[
        {label:t("field.title", t("field.title","标题")), k:"title"},
        {label:t("field.category","分类"), k:"category"},
        {label:t("field.source","来源"), k:"source"},
        {label:t("common.create","创建"), fmt:function(r){ return r.createdAt ? new Date(r.createdAt).toLocaleDateString() : "-"; }}
      ],
      sum:function(recs){
        const cats = new Set(recs.map(function(r){ return r.category; }).filter(Boolean));
        const high = recs.filter(function(r){ return r.importance===t("task.priority.high","高"); }).length;
        return [{ v:recs.length, l:t("field.entry","条目") }, { v:cats.size, l:t("field.category","分类") }, { v:high, l:t("field.important","重要") }];
      },
      // v3.3.0 B 3/8：知识库标签筛选——chips 显示全部标签（按出现次数降序，最多 12 个），点击过滤条目（再点取消）
      afterList:function(recs){
        const counts = {};
        (recs || []).forEach(function(r){
          String(r.tags || "").split(/[,\uFF0C\s\u3000]+/).forEach(function(tg){
            tg = tg.trim(); if(!tg) return;
            counts[tg] = (counts[tg] || 0) + 1;
          });
        });
        const tags = Object.keys(counts).sort(function(a,b){ return counts[b] - counts[a]; });
        if(!tags.length) return "";
        const chips = tags.slice(0, 12).map(function(tg){
          return '<button type="button" class="ktag-chip' + (_kbTagFilter === tg ? ' active' : '') + '" data-ktag="' + esc(tg) + '">' + esc(tg) + ' <span class="ktag-count">' + counts[tg] + '</span></button>';
        }).join("");
        let listHtml = "";
        if(_kbTagFilter){
          const hits = (recs || []).filter(function(r){ return String(r.tags || "").split(/[,\uFF0C\s\u3000]+/).indexOf(_kbTagFilter) > -1; }).slice(0, 8);
          listHtml = '<div class="ktag-list">' +
            (hits.length
              ? hits.map(function(r){
                  const meta = [r.category, r.source].filter(Boolean).join(" · ");
                  return '<div class="ktag-hit"><span class="ktag-hit-title">' + esc(r.title || "—") + '</span>' +
                    (meta ? '<span class="ktag-hit-meta">' + esc(meta) + '</span>' : '') + '</div>';
                }).join("")
              : '<div class="ktag-empty">' + t("kb.tagNoMatch","无匹配条目") + '</div>') +
            '</div>';
        }
        return '<div class="ktag-bar"><div class="ktag-head">' + t("kb.tagHead","标签筛选") + '</div><div class="ktag-chips">' + chips + '</div>' + listHtml + '</div>';
      },
      emptyTip:t("empty.noKb","暂无知识条目 · 点击「添加」沉淀第一条知识")
    });
  },
  reading: function(){
    /* v3.5.3 阅读场景完善：状态/评分/起止日期/摘录与笔记分离 + 四维统计 */
    return _featureCardHtml({
      key:"reading", title:t("tool.reading.name","阅读笔记"), icon:ic("book"),
      fields:[
        {k:"book", label:t("field.bookName","书名"), type:"text"},
        {k:"author", label:t("field.author","作者"), type:"text"},
        {k:"status", label:t("field.status","状态"), type:"select", options:[t("read.want","想读"),t("read.doing","在读"),t("read.done","已读")]},
        {k:"progress", label:t("field.progressPercent","进度 %"), type:"number"},
        {k:"rating", label:t("field.rating","评分(1-5)"), type:"number"},
        {k:"startDate", label:t("field.startDate","开始日期"), type:"date"},
        {k:"finishDate", label:t("field.finishDate","完成日期"), type:"date"},
        {k:"excerpt", label:t("field.excerpt","摘录"), type:"textarea"},
        {k:"note", label:t("field.note","笔记"), type:"textarea"}
      ],
      cols:[
        {label:t("field.bookName","书名"), k:"book"},
        {label:t("field.author","作者"), k:"author"},
        {label:t("field.status","状态"), fmt:function(r){ return r.status || (r.done ? t("read.done","已读") : t("read.doing","在读")); }},
        {label:t("field.progress","进度"), fmt:function(r){ return (Number(r.progress)||0) + "%"; }},
        {label:t("field.rating","评分"), fmt:function(r){ var n = Number(r.rating)||0; return n > 0 ? ("★" + n) : "—"; }}
      ],
      sum:function(recs){
        var want = recs.filter(function(r){ return r.status === t("read.want","想读"); }).length;
        var doing = recs.filter(function(r){ return r.status ? r.status === t("read.doing","在读") : !r.done; }).length;
        var done = recs.filter(function(r){ return r.status ? r.status === t("read.done","已读") : !!r.done; }).length;
        var rated = recs.filter(function(r){ return Number(r.rating) > 0; });
        var avg = rated.length ? (rated.reduce(function(a,r){ return a + Number(r.rating); }, 0) / rated.length).toFixed(1) : "—";
        return [
          { v: want, l: t("read.want","想读") },
          { v: doing, l: t("read.doing","在读") },
          { v: done, l: t("read.done","已读") },
          { v: avg, l: t("read.avgRating","平均评分") }
        ];
      },
      emptyTip:t("empty.noReading","暂无阅读记录 · 点击「添加」记录第一本书")
    });
  },
  exercise: function(){
    return _featureCardHtml({
      key:"exercises", title:t("tool.exercise.name","练习题库"), icon:ic("brain"),
      fields:[
        {k:"subject", label:t("field.subject","科目"), type:"text"},
        {k:"question", label:t("field.question","题目"), type:"text"},
        {k:"answer", label:t("field.answer","答案"), type:"text"},
        {k:"correct", label:t("field.accuracyPercent","正确率 %"), type:"number"},
        {k:"explain", label:t("field.analysis","解析"), type:"text"}
      ],
      // v3.2 任务四阶段二：错题自动入 SM-2 复习——正确率 < 70 视作错题，提交时入 rec_study 标 nextReview=明天
      onSave:function(rec){
        if(Number(rec.correct) < 70 && rec.question){
          const study = (typeof getRec === "function" ? getRec("study") : []) || [];
          study.unshift({
            id: "sm2_" + (rec.id || uid()),
            title: t("study.errorReviewPrefix","错题复习：") + (rec.title || (rec.subject||"") + " " + (rec.question||"").slice(0,12)),
            type: t("study.materialType","学习资料"), status: t("study.statusNotReviewed","未复习"), nextReview: todayStr() + "+1d" ? (() => { const d = new Date(); d.setDate(d.getDate()+1); return d.toISOString().slice(0,10); })() : todayStr(),
            note: t("study.sourceExercisePrefix","来源练习题（正确率 ") + rec.correct + "%）：" + (rec.explain || rec.answer || ""),
            created: Date.now()
          });
          setRec("study", study);
        }
      },
      cols:[
        {label:t("field.subject","科目"), k:"subject"},
        {label:t("field.question","题目"), fmt:function(r){ return (r.question||"").slice(0,24) + ((r.question||"").length>24?"…":""); }},
        {label:t("field.accuracy","正确率"), fmt:function(r){ return (Number(r.correct)||0) + "%"; }}
      ],
      sum:function(recs){
        const subs = new Set(recs.map(function(r){ return r.subject; }).filter(Boolean));
        const n = recs.length;
        const avg = n ? Math.round(recs.reduce(function(s,r){ return s + (Number(r.correct)||0); }, 0) / n) : 0;
        return [{ v:recs.length, l:t("field.question","题目") }, { v:subs.size, l:t("field.subject","科目") }, { v:avg, l:t("stat.avgAccuracy","平均正确率") }];
      },
      emptyTip:t("empty.noExercise","暂无题目 · 点击「添加」录入第一道题")
    });
  },
  exam: function(){
    return _featureCardHtml({
      key:"exams", title:t("tool.exam.name","模拟考试"), icon:ic("grid"),
      fields:[
        {k:"title", label:t("field.examName","考试名"), type:"text"},
        {k:"subject", label:t("field.subject","科目"), type:"text"},
        {k:"date", label:t("tool.regex.preset.date", t("field.date","日期")), type:"date"},
        {k:"score", label:t("field.score","得分"), type:"number"},
        {k:"total", label:t("field.totalScore","总分"), type:"number"}
      ],
      cols:[
        {label:t("field.examName","考试名"), k:"title"},
        {label:t("field.subject","科目"), k:"subject"},
        {label:t("tool.regex.preset.date", t("field.date","日期")), k:"date"},
        {label:t("field.grade","成绩"), fmt:function(r){ return (r.score||0) + " / " + (r.total||0); }}
      ],
      sum:function(recs){
        const total = recs.reduce(function(s,r){ return s + (Number(r.score)||0); }, 0);
        const n = recs.length;
        return [{ v:n, l:t("field.exam","考试") }, { v:n ? Math.round(total/n) : 0, l:t("stat.avgScore","平均分") }];
      },
      emptyTip:t("empty.noExam","暂无考试记录 · 点击「添加」记录第一次考试")
    });
  }
};

/* ---------- 数据场景功能卡（P4） ---------- */
SCENE_FEATURE_RENDER.data = {
  report: function(){
    return _featureCardHtml({
      key:"data_reports", title:t("tool.report.name","数据分析报表"), icon:ic("stats"),
      fields:[
        {k:"title", label:t("field.reportName","报表名"), type:"text"},
        {k:"source", label:t("option.dataSource", t("field.dataSource","数据源")), type:"text"},
        {k:"dims", label:t("field.analysisDim","分析维度"), type:"text"},
        {k:"metrics", label:t("field.metric","指标"), type:"text"},
        {k:"note", label:t("field.conclusion","结论"), type:"text"}
      ],
      cols:[
        {label:t("field.reportName","报表名"), k:"title"},
        {label:t("option.dataSource", t("field.dataSource","数据源")), k:"source"},
        {label:t("field.dimension","维度"), k:"dims"},
        {label:t("field.metric","指标"), k:"metrics"}
      ],
      sum:function(recs){
        return [
          { v:recs.length, l:t("tab.report", t("field.report","报表")) },
          { v:new Set(recs.map(function(r){ return r.metrics; }).filter(Boolean)).size, l:t("field.metric","指标") }
        ];
      },
      emptyTip:t("empty.noReport","暂无报表 · 点击「添加」生成第一份分析报表")
    });
  },
  chart: function(){
    /* v3.0.1 B-5：数据可视化真图表——记录可携带 data（JSON 数据点）+ chartType，
     * 有合法 data 的记录在行下方渲染真实 SVG 图表；无 data 的旧记录仍显示为普通台账行 */
    return _featureCardHtml({
      key:"data_charts", title:t("tool.viz.name","数据可视化"), icon:ic("filter"),
      hint:t("tool.viz.hint","提示：填写「数据点」JSON 后，记录行下方将渲染真实图表（bar 柱状 / pie 饼图 / line 折线）"),
      fields:[
        {k:"title", label:t("field.chartName","图表名"), type:"text"},
        {k:"type", label:t("field.type", t("field.type","类型")), type:"select", options:[t("chartType.line","折线图"),t("icon.barChart","柱状图"),t("chartType.pie","饼图"),t("chartType.gauge","仪表盘")]},
        {k:"source", label:t("option.dataSource", t("field.dataSource","数据源")), type:"text"},
        {k:"chartType", label:t("field.chartType","图表类型"), type:"select", options:["bar","pie","line"]},
        {k:"data", label:t("field.dataPoints","数据点(JSON数组)"), type:"textarea", placeholder:'[{"label":"Q1","value":30},{"label":"Q2","value":52}]'},
        {k:"note", label:t("side.menu.help", t("field.description","说明")), type:"text"}
      ],
      cols:[
        {label:t("field.chartName","图表名"), k:"title"},
        {label:t("field.type", t("field.type","类型")), k:"type"},
        {label:t("field.chartType","图表类型"), fmt:function(r){ return r.data && parseChartData(r.data) ? esc(r.chartType || "bar") : '<span class="u-text-muted">—</span>'; }},
        {label:t("side.menu.help", t("field.description","说明")), fmt:function(r){ return (r.note||"").slice(0,20); }}
      ],
      rowAfter:function(r){
        const arr = parseChartData(r.data);
        if(!arr) return ""; // 无 data 或非法 JSON：保持普通台账行（旧记录兼容）
        return renderMiniChart(String(r.chartType || "bar"), arr);
      },
      sum:function(recs){
        const charted = recs.filter(function(r){ return r.data && parseChartData(r.data); }).length;
        return [
          { v:recs.length, l:t("chartStore.title", t("field.chart","图表")) },
          { v:charted, l:t("status.charted","已出图") }
        ];
      },
      emptyTip:t("empty.noChart","暂无图表 · 点击「添加」创建第一个可视化")
    });
  },
  /* v3.1.2 A-档：SQL 查数卡（复用 code.sql 的形态；key=data_sql 独立存储） */
  sql: function(){
    return _featureCardHtml({
      key:"data_sql", title:t("tool.sql.name","SQL 查数"), icon:ic("sheet"),
      hint:t("tool.sql.hint","输入 SQL 语句，点击「▶ 运行」在本地 SQLite WASM 沙箱中执行（首次需联网加载 WASM）"),
      fields:[
        {k:"title", label:t("field.title", t("field.title","标题")), type:"text"},
        {k:"db", label:t("field.database","数据库"), type:"select", options:["SQLite","MySQL","PostgreSQL","SQL Server",t("option.other","其他")]},
        {k:"schema", label:t("field.tableSchema","表结构"), type:"text"},
        {k:"sql", label:"SQL", type:"textarea", hint:"SELECT * FROM … / CREATE TABLE … / INSERT …"},
        {k:"note", label:t("field.note", t("field.note","备注")), type:"text"}
      ],
      cols:[
        {label:t("field.title", t("field.title","标题")), k:"title"},
        {label:t("field.database","数据库"), k:"db"},
        {label:"SQL", fmt:function(r){ return esc((r.sql||"").slice(0,20)) + ((r.sql||"").length>20?"…":""); }}
      ],
      sum:function(recs){
        return [{ v:recs.length, l:"SQL" }];
      },
      emptyTip:t("empty.noSql","暂无 SQL · 点击「添加」记录第一条查询"),
      rowAfter:function(r){
        return '<div class="sql-run-bar">' +
          '<button type="button" class="addbtn sm" data-f-sqlrun="' + r.id + t("p3.html.runBtn","\">▶ 运行</button>") +
          '<span class="sql-run-status" data-f-sqlstatus="' + r.id + '"></span>' +
          '</div>' +
          '<div class="sql-result" data-f-sqlresult="' + r.id + '"></div>';
      }
    });
  }
};

/* ---------- 编程场景功能卡（P4） ---------- */
SCENE_FEATURE_RENDER.code = {
  frontend: function(){
    return _featureCardHtml({
      key:"code_frontend", title:t("tool.frontend.name","前端页面设计"), icon:ic("compile"),
      fields:[
        {k:"title", label:t("field.pageName","页面名"), type:"text"},
        {k:"framework", label:t("field.framework","框架"), type:"select", options:[t("option.native","原生"),"React","Vue","Angular",t("option.other","其他")]},
        {k:"html", label:"HTML", type:"text"},
        {k:"css", label:"CSS", type:"text"},
        {k:"js", label:"JS", type:"text"}
      ],
      cols:[
        {label:t("field.pageName","页面名"), k:"title"},
        {label:t("field.framework","框架"), k:"framework"},
        {label:"HTML", fmt:function(r){ return (r.html||"").slice(0,16) + ((r.html||"").length>16?"…":""); }},
        {label:"CSS", fmt:function(r){ return (r.css||"").slice(0,16) + ((r.css||"").length>16?"…":""); }}
      ],
      sum:function(recs){
        return [{ v:recs.length, l:t("field.page","页面") }];
      },
      emptyTip:t("empty.noPage","暂无页面 · 点击「添加」记录第一个前端页面"),
      // v3.1.2 A-档：frontend 补「▶ 预览」——html/css/js 三字段此前只能看台账无运行入口（对比 sql/runner 都有）
      rowAfter:function(r){
        return '<div class="sql-run-bar">' +
          '<button type="button" class="addbtn sm" data-f-preview="' + r.id + '">' + t("frontend.previewBtn","▶ 预览") + '</button>' +
          '<span class="sql-run-status" data-f-previewstatus="' + r.id + '"></span>' +
          '</div>' +
          '<div class="frontend-preview-box u-hidden" data-f-previewbox="' + r.id + '"></div>';
      }
    });
  },
  sql: function(){
    return _featureCardHtml({
      key:"code_sql", title:t("tool.sql.name","SQL 生成"), icon:ic("sheet"),
      fields:[
        {k:"title", label:t("field.title", t("field.title","标题")), type:"text"},
        {k:"db", label:t("field.database","数据库"), type:"select", options:["MySQL","PostgreSQL","SQLite","SQL Server",t("option.other","其他")]},
        {k:"schema", label:t("field.tableSchema","表结构"), type:"text"},
        {k:"sql", label:"SQL", type:"textarea", hint:t("tool.sql.hint","输入 SQL 语句，点击「▶ 运行」在本地 SQLite WASM 沙箱中执行（首次需联网加载 WASM）")},
        {k:"note", label:t("field.note", t("field.note","备注")), type:"text"}
      ],
      cols:[
        {label:t("field.title", t("field.title","标题")), k:"title"},
        {label:t("field.database","数据库"), k:"db"},
        {label:t("field.tableSchema","表结构"), fmt:function(r){ return (r.schema||"").slice(0,16) + ((r.schema||"").length>16?"…":""); }},
        {label:"SQL", fmt:function(r){ return (r.sql||"").slice(0,20) + ((r.sql||"").length>20?"…":""); }}
      ],
      sum:function(recs){
        return [{ v:recs.length, l:"SQL" }];
      },
      emptyTip:t("empty.noSql","暂无 SQL · 点击「添加」生成第一条 SQL"),
      rowAfter:function(r){
        return '<div class="sql-run-bar">' +
          '<button type="button" class="addbtn sm" data-f-sqlrun="' + r.id + t("p3.html.runBtn","\">▶ 运行</button>") +
          '<span class="sql-run-status" data-f-sqlstatus="' + r.id + '"></span>' +
          '</div>' +
          '<div class="sql-result" data-f-sqlresult="' + r.id + '"></div>';
      }
    });
  },
  runner: function(){
    /* v3.0.1 B-3：真·JS 运行器——JavaScript 片段可在沙箱 Worker 中一键执行，
     * output 回填记录 result 字段并在行下方以等宽字体展示；其他语言仍为普通台账 */
    return _featureCardHtml({
      key:"code_runner", title:t("tool.codeRun.name","代码运行记录"), icon:ic("compile"),
      hint:t("tool.codeRun.hint","JS 片段在沙箱 Worker 中执行：点击「▶ 运行」立即运行 JavaScript 代码，输出回填至结果列；其他语言仅作记录"),
      fields:[
        {k:"title", label:t("field.title", t("field.title","标题")), type:"text"},
        {k:"language", label:t("field.lang", t("settings.language","语言")), type:"select", options:["JavaScript","Python","Java","Go",t("option.other","其他")]},
        {k:"code", label:"代码", type:"textarea", placeholder:'// 在此编写 JavaScript 代码...'},
        {k:"result", label:t("field.runResult","运行结果"), type:"text"}
      ],
      cols:[
        {label:t("field.title", t("field.title","标题")), k:"title"},
        {label:t("field.lang", t("settings.language","语言")), k:"language"},
        {label:t("field.code", t("field.code","代码")), fmt:function(r){ return (r.code||"").slice(0,20) + ((r.code||"").length>20?"…":""); }},
        {label:t("field.action","操作"), fmt:function(r){
          // 仅 JS/JavaScript 记录提供沙箱运行入口
          if(!/^\s*(javascript|js)\s*$/i.test(String(r.language || ""))) return "";
          return '<button type="button" class="addbtn xs" data-f-run="' + r.id + t("p3.html.runJsBtn","\" title=\"在沙箱 Worker 中运行此 JS 片段\" data-sc=\"accent\">▶ 运行</button>");
        }},
        {label:t("field.result","结果"), fmt:function(r){ return (r.result||"").slice(0,16); }}
      ],
      rowAfter:function(r){
        // 行下方展示最近一次运行输出（等宽字体 · --panel2 背景）
        if(!/^\s*(javascript|js)\s*$/i.test(String(r.language || ""))) return "";
        if(!r.result) return "";
        // v3.2 任务四：运行历史——resultHistory 数组（非空时显示切换按钮，点开折叠所有历史）
        const hist = Array.isArray(r.resultHistory) ? r.resultHistory : [];
        const histHtml = hist.length > 1 ? `<div class="run-history-toggle u-mt-1">
          <button type="button" class="chat-retry" data-f-runhist="${r.id}">${t("tool.codeRun.showHistory", "查看历史（{n} 次）").replace("{n}", hist.length)}</button>
        </div>
        <div class="run-history-body u-hidden u-mt-1" data-f-runhist-body="${r.id}">
          ${hist.map((h, i) => {
            const d = h.at ? new Date(h.at) : null;
            const when = d ? (d.toLocaleString ? d.toLocaleString() : "") : "";
            const okTag = h.ok ? '<span class="u-text-ok">✓</span>' : '<span class="u-text-danger">✗</span>';
            return `<div class="u-mt-1 u-pt-1"style="border-top:1px dashed var(--line)">
              <div class="u-fs-2xs u-text-muted">${when} ${okTag} (${h.ms||0}ms)</div>
              <pre class="u-fs-2xs u-pre-wrap u-break-all"style="font-family:ui-monospace,SFMono-Regular,Consolas,monospace;margin:2px 0 0">${esc(String(h.output||"").slice(0, 800))}${String(h.output||"").length>800 ? "…" : ""}</pre>
            </div>`;
          }).join("")}
        </div>` : "";
        return t("p3.html.runOutputTitle","<div class=\"run-output-title\">最近一次运行输出</div><div class=\"run-output\">") + esc(String(r.result)) + "</div>" + histHtml;
      },
      sum:function(recs){
        return [{ v:recs.length, l:t("field.runLog","运行记录") }];
      },
      emptyTip:t("empty.noCodeRun","暂无运行记录 · 点击「添加」记录第一次运行（语言选 JavaScript 即可沙箱执行）")
    });
  },
  regex: function(){
    return _featureCardHtml({
      key:"code_regex", title:t("tool.regex.name","正则测试"), icon:ic("regex"),
      fields:[
        {k:"title", label:t("field.title", t("field.title","标题")), type:"text"},
        {k:"pattern", label:t("field.expression","表达式"), type:"text"},
        {k:"text", label:t("tool.regex.testText", t("tool.regex.testText","测试文本")), type:"text"},
        {k:"result", label:t("field.matchResult","匹配结果"), type:"text"}
      ],
      cols:[
        {label:t("field.title", t("field.title","标题")), k:"title"},
        {label:t("field.expression","表达式"), fmt:function(r){ return (r.pattern||"").slice(0,20) + ((r.pattern||"").length>20?"…":""); }},
        {label:t("tool.regex.testText", t("tool.regex.testText","测试文本")), fmt:function(r){ return (r.text||"").slice(0,16); }},
        {label:t("field.result","结果"), fmt:function(r){ return (r.result||"").slice(0,16); }}
      ],
      sum:function(recs){
        return [{ v:recs.length, l:t("field.regex","正则") }];
      },
      emptyTip:t("empty.noRegex","暂无正则测试 · 点击「添加」记录第一条正则")
    });
  }
};

/* ---------- 设计场景功能卡（P4） ---------- */
SCENE_FEATURE_RENDER.design = {
  /* v3.5.3：图表画布（思维导图/流程图/架构图/拓扑图） */
  canvas: function(){ return _renderDiagramCanvas(); },
  ui: function(){
    return _featureCardHtml({
      key:"design_ui", title:t("tool.uiDesign.name","UI 设计"), icon:ic("puzzle"),
      fields:[
        {k:"title", label:t("field.designName","设计名"), type:"text"},
        {k:"type", label:t("field.type", t("field.type","类型")), type:"select", options:[t("type.prototype","界面原型"),t("type.palette","配色方案"),t("type.componentLib","组件库"),t("type.animation","动效")]},
        {k:"tool", label:t("toolStub.title", t("field.tool","工具")), type:"text"},
        {k:"palette", label:t("field.palette","配色"), type:"text"},
        {k:"note", label:t("field.note", t("field.note","备注")), type:"text"}
      ],
      cols:[
        {label:t("field.designName","设计名"), k:"title"},
        {label:t("field.type", t("field.type","类型")), k:"type"},
        {label:t("toolStub.title", t("field.tool","工具")), k:"tool"},
        {label:t("field.palette","配色"), fmt:function(r){ return (r.palette||"").slice(0,16) + ((r.palette||"").length>16?"…":""); }}
      ],
      sum:function(recs){
        return [
          { v:recs.length, l:t("field.design","设计") },
          { v:new Set(recs.map(function(r){ return r.type; }).filter(Boolean)).size, l:t("field.type","类型") }
        ];
      },
      emptyTip:t("empty.noUiDesign","暂无 UI 设计 · 点击「添加」记录第一个设计")
    });
  },
  model3d: function(){
    return _featureCardHtml({
      key:"design_3d", title:t("tool.render3d.name","3D 渲染"), icon:ic("cad"),
      fields:[
        {k:"title", label:t("field.modelName","模型名"), type:"text"},
        {k:"format", label:t("field.format","格式"), type:"select", options:["OBJ","STL","GLTF","FBX",t("option.other","其他")]},
        {k:"usage", label:t("field.purpose","用途"), type:"text"},
        {k:"note", label:t("field.note", t("field.note","备注")), type:"text"}
      ],
      cols:[
        {label:t("field.modelName","模型名"), k:"title"},
        {label:t("field.format","格式"), k:"format"},
        {label:t("field.purpose","用途"), k:"usage"},
        {label:t("common.create","创建"), fmt:function(r){ return r.createdAt ? new Date(r.createdAt).toLocaleDateString() : "-"; }}
      ],
      sum:function(recs){
        return [{ v:recs.length, l:t("field.model","模型") }];
      },
      emptyTip:t("empty.noModel3d","暂无 3D 模型 · 点击「添加」记录第一个模型")
    });
  },
  cad: function(){
    return _featureCardHtml({
      key:"design_cad", title:t("tool.cad.name","CAD 图纸"), icon:ic("cad"),
      fields:[
        {k:"title", label:t("field.blueprintName","图纸名"), type:"text"},
        {k:"type", label:t("field.type", t("field.type","类型")), type:"select", options:[t("type.mechanical","机械"),t("type.architecture","建筑"),t("type.electrical","电气"),t("option.other","其他")]},
        {k:"version", label:t("field.version","版本"), type:"text"},
        {k:"note", label:t("field.note", t("field.note","备注")), type:"text"}
      ],
      cols:[
        {label:t("field.blueprintName","图纸名"), k:"title"},
        {label:t("field.type", t("field.type","类型")), k:"type"},
        {label:t("field.version","版本"), k:"version"},
        {label:t("common.create","创建"), fmt:function(r){ return r.createdAt ? new Date(r.createdAt).toLocaleDateString() : "-"; }}
      ],
      sum:function(recs){
        return [{ v:recs.length, l:t("field.blueprint","图纸") }];
      },
      emptyTip:t("empty.noCad","暂无 CAD 图纸 · 点击「添加」记录第一张图纸")
    });
  },
  image: function(){
    return _featureCardHtml({
      key:"design_image", title:t("tool.imageAsset.name","图片素材"), icon:ic("imggen"),
      fields:[
        {k:"title", label:t("field.imageName","图片名"), type:"text"},
        {k:"type", label:t("field.type", t("field.type","类型")), type:"select", options:[t("option.illustration","插画"),t("option.photo","摄影"),t("field.icon","图标"),t("option.poster","海报"),t("option.other","其他")]},
        {k:"size", label:t("tool.imgGen.size", t("field.size","尺寸")), type:"text"},
        {k:"note", label:t("field.note", t("field.note","备注")), type:"text"}
      ],
      cols:[
        {label:t("field.imageName","图片名"), k:"title"},
        {label:t("field.type", t("field.type","类型")), k:"type"},
        {label:t("tool.imgGen.size", t("field.size","尺寸")), k:"size"},
        {label:t("common.create","创建"), fmt:function(r){ return r.createdAt ? new Date(r.createdAt).toLocaleDateString() : "-"; }}
      ],
      sum:function(recs){
        return [{ v:recs.length, l:t("field.asset","素材") }];
      },
      emptyTip:t("empty.noImageAsset","暂无图片素材 · 点击「添加」记录第一张图片")
    });
  }
};

/**
 * v1.4-B 渲染单条记录项 HTML（抽出供虚拟滚动复用）
 * @param {Object} r - 记录对象
 * @param {Object} rec - 场景 record 配置（含 fields）
 * @returns {string} li HTML
 */
function _renderRecItem(r, rec){
  const metaParts = [];
  const mdParts = [];
  rec.fields.forEach(f=>{
    if(f.k==="title"||f.k==="code"||f.k==="img") return;
    const v=r[f.k]; if(v===null||v===undefined||v==="") return;
    if(f.type==="textarea"){
      mdParts.push('<div class="md md-body">'+mdToHtml(v)+'</div>');
    } else {
      metaParts.push('<span class="tag">'+esc(f.label)+": "+esc(v)+'</span>');
    }
  });
  const meta = metaParts.join("");
  const mdContent = mdParts.join("");
  const codeF = rec.fields.find(f=>f.k==="code");
  const codeBlock = (codeF && r.code)? `<code class="snip">${esc(r.code)}</code>
    <button type="button" class="copy" data-val="${esc(r.code)}">${UI_ICONS.copy} ${t("common.copy","复制")}</button>` : "";
  // v3.2 C-档：图片引用渲染——img 字段存 IDB 键（img_<recId>），占位 span 由 _hydrateRecImgs 异步填 objectURL
  const imgF = rec.fields.find(f=>f.k==="img");
  const _imgPhIcon = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>';
  const imgPh = (imgF && r.img && String(r.img).indexOf("img_") === 0)
    ? `<span class="rec-img-thumb" data-recimg="${esc(r.img)}" role="img" aria-label="${t("field.image","作品图")}">${_imgPhIcon}</span>` : "";
  const titleF = rec.fields.find(f=>f.k==="title") || {k:"title"};
  return `<li><div class="body"><div class="t">${esc(r[titleF.k])}${imgPh}</div>
    <div class="m">${meta}</div>${mdContent}${codeBlock}</div>
    <button type="button" class="del" data-rdel="${r.id}" title="${t("a11y.del", "删除")}" aria-label="${t("a11y.del", "删除")}">${UI_ICONS.trash}</button></li>`;
}
/**
 * v3.2 C-档：异步填充记录缩略图——查 [data-recimg] 占位 → IDB 取 blob → objectURL 替换为 <img>
 * 逐个填（互不阻塞）；IDB 不可用/键丢失时占位保持图标态（不破版）
 * @returns {void}
 */
function _hydrateRecImgs(){
  $$("[data-recimg]").forEach(function(ph){
    const key = ph.getAttribute("data-recimg");
    if(!key || ph._imgHydrated) return;
    ph._imgHydrated = true;
    idbTxn("readonly", st => st.get(key)).then(function(blob){
      if(!blob){ return; } // 键丢失：保持占位图标
      try{
        const url = URL.createObjectURL(blob);
        const img = document.createElement("img");
        img.src = url;
        img.alt = t("field.image","作品图");
        img.className = "rec-img-thumb";
        img.style.cssText = "max-width:72px;max-height:54px;object-fit:cover;border-radius:var(--radius-sm);margin-left:var(--space-2);vertical-align:middle;border:1px solid var(--line)";
        ph.replaceWith(img);
      }catch(_e){ /* 替换失败保持占位 */ }
    });
  });
}
/**
 * v1.4-B 虚拟滚动：渲染记录列表（超阈值时只渲染可见区域 + 缓冲区）
 * @param {Object[]} recs - 记录数组
 * @param {Object} rec - 场景 record 配置
 * @returns {string} ul HTML（含虚拟滚动容器）
 */
function _renderRecList(recs, rec){
  if(recs.length > VIRTUAL_SCROLL_THRESHOLD){
    const range = virtualScrollRange({
      total: recs.length,
      itemHeight: VIRTUAL_ITEM_HEIGHT_RECORD,
      viewportHeight: VIRTUAL_VIEWPORT_MAX,
      scrollTop: 0,
      buffer: VIRTUAL_SCROLL_BUFFER
    });
    const items = recs.slice(range.start, range.end).map(r => _renderRecItem(r, rec)).join("");
    return `<ul class="list vscroll-viewport u-overflow-y-auto u-block" data-vscroll="rec" data-vcount="${recs.length}" style="max-height:${VIRTUAL_VIEWPORT_MAX}px">` +
      `<div class="vscroll-spacer u-pos-relative" style="height:${range.totalHeight}px">` +
      `<div class="vscroll-items u-pos-absolute" style="top:${range.offsetY}px">${items}</div>` +
      `</div></ul>`;
  }
  return `<ul class="list">` + recs.map(r => _renderRecItem(r, rec)).join("") + `</ul>`;
}
/**
 * v1.4-B 虚拟滚动：滚动时更新记录列表可见项
 * @param {Element} viewport - 滚动视口元素
 * @param {string} sc - 场景键
 * @returns {void}
 */
function _updateRecVScroll(viewport, sc){
  const total = parseInt(viewport.getAttribute("data-vcount") || "0", 10);
  if(total <= VIRTUAL_SCROLL_THRESHOLD) return;
  const scrollTop = viewport.scrollTop || 0;
  const range = virtualScrollRange({
    total,
    itemHeight: VIRTUAL_ITEM_HEIGHT_RECORD,
    viewportHeight: VIRTUAL_VIEWPORT_MAX,
    scrollTop,
    buffer: VIRTUAL_SCROLL_BUFFER
  });
  const recs = getRec(sc);
  const rec = SCENARIOS[sc].record;
  const items = viewport.querySelector(".vscroll-items");
  if(!items) return;
  const html = recs.slice(range.start, range.end).map(r => _renderRecItem(r, rec)).join("");
  items.innerHTML = sanitizeHtml(html);
  items.style.top = range.offsetY + "px";
}
