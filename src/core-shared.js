// ===== Core Layer (核心层·跨层共享设施（toast 钩子 场景配置）) =====
/* ---------- v3.7.66 外发通知通道注册表 ----------
 * 为什么放 core：通知的产生点在 ui-daily，而通道实现（飞书 / 钉钉 webhook）在
 * ui-ge-integrations。让 ui-daily 直接调它会新增一条 **逆层依赖**
 * （check:modules 实测报 `ui-daily>ui-ge-integrations`）。改成「低层留钩子位、
 * 高层来注册」后两条边都是向下的：ui-daily→core、ui-ge-integrations→core。
 * 通道自己决定要不要真外发（未配置 / 该类事件被关掉 → 直接 return），
 * 所以这里只做无脑分发 + 隔离异常：任何一个通道抛错都不能影响本地通知。 */
const _externalNotifiers = [];
function registerExternalNotifier(fn){
  if(typeof fn !== "function") return false;
  if(_externalNotifiers.indexOf(fn) < 0) _externalNotifiers.push(fn);
  return true;
}
function emitExternalNotify(title, body, kind){
  for(let i = 0; i < _externalNotifiers.length; i++){
    try{ _externalNotifiers[i](title, body, kind); }
    catch(e){ /* 外发通道的任何故障都不该冒到调用方 */ }
  }
}

/* ---------- v3.7.67 数据变更广播（RAG 增量索引的挂接位） ----------
 * 为什么放 core：数据写入口在 Data 层（setTasks/setRec/appendChat），而增量索引
 * 实现在 AI 层（ai-tools 的 ragSyncIncremental）。让 Data 直接调 ai-tools 会新增
 * 逆层依赖（data-rw>ai-tools）。与上方 registerExternalNotifier 同款解法：
 * 低层只 emit，高层注册实现，两条边都向下。domain 是触发源提示（task/rec/note/
 * chat/import/restore），监听方目前只有 RAG 同步，但接口按通用事件留。 */
const _dataMutateListeners = [];
function registerDataMutateListener(fn){
  if(typeof fn !== "function") return false;
  if(_dataMutateListeners.indexOf(fn) < 0) _dataMutateListeners.push(fn);
  return true;
}
function emitDataMutate(domain){
  for(let i = 0; i < _dataMutateListeners.length; i++){
    try{ _dataMutateListeners[i](String(domain || "")); }
    catch(e){ /* 索引同步的任何故障都不该冒回数据写路径 */ }
  }
}

function toast(msg, type){
  let c=$("#toasts"); if(!c){ c=document.createElement("div"); c.id="toasts"; c.setAttribute("role","status"); c.setAttribute("aria-live","polite"); document.body.appendChild(c); }
  const d=document.createElement("div"); d.className="toast"+(type?" "+type:"");
  // 图标 DOM 插入（非 textContent）：保住 XSS 防线，纯视觉增强
  const key = (type && TOAST_ICONS[type]) ? type : null;
  if(key){
    const icEl=document.createElement("span"); icEl.className="ic-inline"; icEl.style.margin="0 6px 0 0";
    // 可信的静态 SVG 字符串（无用户输入），直接用 innerHTML
    icEl.innerHTML = TOAST_ICONS[key]; // lint-xss-ok: TOAST_ICONS 是内部常量表，且 key 已在上一行用 TOAST_ICONS[type] 校验过
    d.appendChild(icEl);
  }
  d.appendChild(document.createTextNode(msg)); // 用户输入走 textNode，不怕 XSS
  // 危险/错误提示：改为 assertive alert，确保读屏立即播报（a11y）
  if(type==="error"||type==="danger"){ d.setAttribute("role","alert"); d.setAttribute("aria-live","assertive"); }
  c.appendChild(d); requestAnimationFrame(()=> d.style.opacity="1");
  setTimeout(()=>{ d.style.opacity="0"; setTimeout(()=> d.remove(), 250); }, 3600);
  return d; // v1.9.3g：返回元素，供调用方挂点击（如 SW 更新提示「点击刷新」）
}

/* ---------- 场景配置（单一真相源：A-P2-7 收编 icon / sysprompt / extraCard） ---------- */
const SCENARIOS = {
  office:{ name:t("scenario.office", "办公"), color:"#0a6cbd",
    icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 4h4a2 2 0 0 1 2 2v1h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h3V6a2 2 0 0 1 2-2zm0 2v1h4V6h-4z"/></svg>',
    sysprompt:t("sysprompt.office", "你是一个专业的办公效率助手，帮用户梳理任务、写会议纪要、润色邮件与文档。回答简洁、可执行。"),
    extraCard:"report",
    record:{ label:t("record.office.label", "会议纪要"),
      // v3.1.2 B-档：资料库会议纪要此前只有主题/参会人/结论 3 字段，会议管理有 6 字段（含日期/主持人/时长）——同一场会议要录两遍且互不引用。
      // 补齐 date/host/duration 三字段对齐会议管理，数据可互通。
      fields:[
        {k:"title",label:t("field.meetingTitle", "会议主题"),type:"text"},
        {k:"type",label:t("field.meetingType","会议类型"),type:"select",options:[t("type.weeklyMeeting","周会"),t("type.review","评审"),t("type.client","客户"),t("type.team","团队"),t("option.other","其他")]},
        /* v3.7.32：日期与开始时间**拆成两个字段** —— 用户："有些业务场景日期是需要跟开始时间的，
           比如会议的日期是？开始时间是？预设时长是？"
           原先 {k:"date", timePicker:true} 把两者塞在一起：日期选择器底部挂时/分，
           概念混淆（日期本身没有时分；开始时间也不该藏在日期组件里）。
           现在：日期 / 开始时间 / 时长(小时) 三个正交字段。 */
        {k:"date",label:t("field.date","日期"),type:"date"},
        {k:"startTime",label:t("field.startTime","开始时间"),type:"time"},
        {k:"host",label:t("field.host","主持人"),type:"text"},
        {k:"who",label:t("field.attendees", "参会人"),type:"text"},
        {k:"duration",label:t("field.durationHours","预设时长(小时)"),type:"number"},
        {k:"note",label:t("field.conclusion", "结论 / 跟进"),type:"textarea"}
      ] } },

  design:{ name:t("scenario.design", "设计"), color:"#d6409f",
    icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/></svg>',
    sysprompt:t("sysprompt.design", "你是一个设计创意助手，擅长视觉设计建议、配色方案、版式构图与创意灵感激发。回答有画面感、可落地。"),
    extraCard:"design",
    record:{ label:t("record.design.label", "作品记录"),
      fields:[
        {k:"type",label:t("field.type", "类型"),type:"select",options:[t("option.poster", "海报"),t("option.logo", "Logo"),t("option.illustration", "插画"),t("option.ui", "UI 界面"),t("option.photo", "摄影"),t("option.other", "其他")]},
        {k:"title",label:t("field.workName", "作品名"),type:"text"},
        {k:"img",label:t("field.image", "图片"),type:"image"}, // v3.2 C-档：作品图（IDB blob 存储，不占 localStorage 配额）
        {k:"note",label:t("field.inspiration", "灵感 / 备注"),type:"textarea"}
      ] } },

  study:{ name:t("scenario.study", "学习"), color:"#d97706",
    icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5a2 2 0 0 1 2-2h6v16H6a2 2 0 0 0-2 2V5zm16 0a2 2 0 0 0-2-2h-6v16h6a2 2 0 0 1 2 2V5z"/></svg>',
    sysprompt:t("sysprompt.study", "你是一个学习方法教练，擅长制定学习计划、拆解知识点、记忆与复习策略。"),
    extraCard:"review",
    record:{ label:t("record.study.label", "学习资料"),
      // v3.1.2 B-档：学习资料此前无来源字段——SM-2 到期复习时看到主题却点不开任何原始材料。补 source/url + 关联任务。
      // v3.7.31：类型/状态由 text 改 select —— 用户："这里为什么不是下拉框、选择框"。
      // 这两个字段语义是**枚举**，用自由文本会导致同义不同词（"在读"/"学习中"/"已读完"…）无法聚合。
      // 选项取值必须兼容既有数据：错题自动入库时写入 type="学习资料"、status="未复习"（见 render-scene-main.js 的错题 → SM-2 逻辑），
      // 故两者都作为首项保留。
      fields:[
        {k:"title",label:t("field.topic", "主题"),type:"text"},
        {k:"type",label:t("field.type", "类型"),type:"select",options:[
          t("study.type.material","学习资料"),t("study.type.book","书籍"),t("study.type.course","课程"),
          t("study.type.article","文章"),t("study.type.video","视频"),t("option.other","其他")]},
        {k:"source",label:t("field.source","来源链接"),type:"text",placeholder:"https://... / 书名 / 课程名"},
        {k:"status",label:t("field.status", "状态"),type:"select",options:[
          t("study.status.notReviewed","未复习"),t("study.status.todo","待读"),t("study.status.reading","在读"),
          t("study.status.done","已读完"),t("study.status.shelved","已搁置")]},
        {k:"note",label:t("side.sub.notes", "笔记"),type:"textarea"}
      ] } },

  data:{ name:t("scenario.data", "数据"), color:"#0d9488",
    icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/></svg>',
    sysprompt:t("sysprompt.data", "你是一个数据分析助手，擅长数据清洗、指标拆解、图表选型与洞察提炼。回答用数据说话、结论明确。"),
    extraCard:"data",
    record:{ label:t("record.data.label", "数据记录"),
      fields:[
        {k:"type",label:t("field.type", "类型"),type:"select",options:[t("option.metricSnapshot", "指标快照"),t("option.analysisConclusion", "分析结论"),t("option.dataSource", "数据源"),t("option.report", "报表")]},
        {k:"title",label:t("field.title", "标题"),type:"text"},
        {k:"value",label:t("field.metricValue", "指标数值"),type:"text",placeholder:"65.2 / 128 / 12.5%"}, // v3.1.2 A-档：指标快照此前无数值字段，「记了体重 65.2」无处填
        {k:"note",label:t("field.note", "备注"),type:"textarea"}
      ] } },

  code:{ name:t("scenario.code", "编程"), color:"#34a853",
    icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.4 16.6 4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0L19.2 12l-4.6-4.6L16 6l6 6-6 6-1.4-1.4z"/></svg>',
    sysprompt:t("sysprompt.code", "你是一个资深全栈工程师，擅长代码实现、调试与架构建议。给出可直接运行的代码并解释关键点。"),
    extraCard:"code",
    record:{ label:t("record.code.label", "代码片段"),
      // v3.1.2 A-档：lang 由自由文本改 select（"js/JS/JavaScript"被统计成 3 种语言的分裂源）+ 补 project 归属字段
      fields:[{k:"lang",label:t("field.lang", "语言"),type:"select",options:["JavaScript","TypeScript","Python","Java","Go","Rust","C/C++","SQL","HTML/CSS","Shell",t("option.other","其他")]},
        {k:"project",label:t("field.project", "项目"),type:"text",placeholder:"如 工坊重构 / 个人的小站"},
        {k:"title",label:t("field.title", "标题"),type:"text"},{k:"code",label:t("field.code", "代码"),type:"textarea"}] } },

  life:{ name:t("scenario.life", "生活"), color:"#7c5cbf",
    icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>',
    sysprompt:t("sysprompt.life", "你是一个生活与健康管家，帮用户管理日常事务、运动记录、体重追踪、睡眠记录和喝水提醒。回答实用、贴心、有条理。"),
    extraCard:"life",
    record:{ label:t("record.life.label", "生活记录"),
      // v3.2 C-档拆分：type 健康五类（运动/体重/身高/睡眠/喝水）收敛到「健康」功能 tab（结构化真相源），
      // 资料库只留日常事务——旧健康类记录仍被 getHealthRecs 双源聚合读取（B-档），数据不丢。
      fields:[
        {k:"type",label:t("field.type", "类型"),type:"select",options:[t("option.daily", "日常事务")]},
        {k:"title",label:t("field.title", "标题"),type:"text"},
        {k:"value",label:t("field.value", "数值"),type:"text",placeholder:t("field.valuePlaceholder", "如：5km / 65.2kg / 7.5h / 8杯")},
        {k:"note",label:t("field.note", "备注"),type:"textarea"}
      ] } },

  /* v3.5.2 新增场景：健康（运动/体重/睡眠/饮水/饮食） */
  health:{ name:t("scenario.health", "健康"), color:"#10b981",
    icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>',
    sysprompt:t("sysprompt.health", "你是一个健康管理助手，帮用户记录运动、体重、睡眠、饮水和饮食，分析趋势并给出科学建议。回答专业、温和、有数据支撑，不替代医疗诊断。"),
    extraCard:"health",
    record:{ label:t("record.health.label", "健康记录"),
      fields:[
        {k:"type",label:t("field.type", "类型"),type:"select",options:[t("health.sport","运动"),t("health.weight","体重"),t("health.sleep","睡眠"),t("health.water","饮水"),t("health.diet","饮食")]},
        {k:"date",label:t("field.date", "日期"),type:"date"},
        {k:"value",label:t("field.value", "数值"),type:"text",placeholder:t("health.valuePh", "如：5km / 65.2kg / 7.5h / 8杯")},
        {k:"duration",label:t("field.durationHours", "时长(小时)"),type:"number"},
        {k:"note",label:t("field.note", "备注"),type:"textarea"}
      ] } },

  /* v3.5.2 新增场景：理财（收支 / 基金 / 股票） */
  finance:{ name:t("scenario.finance", "理财"), color:"#c9a227",
    icon:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v10M9.5 9.5h4a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3h4"/></svg>',
    sysprompt:t("sysprompt.finance", "你是一个个人理财助手，帮用户记录收支、跟踪基金与股票持仓、分析资产配置与风险。回答理性、合规，明确不构成投资建议。"),
    extraCard:"finance",
    record:{ label:t("record.finance.label", "理财记录"),
      fields:[
        {k:"type",label:t("field.type", "类型"),type:"select",options:[t("fin.expense","支出"),t("fin.income","收入"),t("fin.fund","基金"),t("fin.stock","股票"),t("fin.other","其他投资")]},
        {k:"category",label:t("field.category", "类别"),type:"text",placeholder:t("fin.categoryPh", "如：餐饮 / 工资 / 沪深300")},
        {k:"amount",label:t("field.amount", "金额"),type:"number"},
        {k:"date",label:t("field.date", "日期"),type:"date"},
        {k:"note",label:t("field.note", "备注"),type:"textarea"}
      ] } }
};

/* v2.1.0：内置场景——新增 设计(design)/数据(data)；顺序即侧栏场景组显示序与滑动手势序。
   v3.5.2 后为 7 个（补 health）；v3.7.70 修：此处旧写「6 内置场景」与下方数组长度不符。 */
const ORDER = ["office","data","design","study","code","life","health"];

/* v3.7.11：场景→特性绑定表（纯数据）。原先放在 render-scene-main（Render 层），
   但被 3 个更靠前的块引用 → 逆层依赖。移到核心层：它是"数据"，与 UI 渲染无关。 */
/* v3.0：功能卡绑定配置（key + 表单字段名；与 SCENE_FEATURE_RENDER 的渲染配置一一对应） */
const SCENE_FEATURE_BIND = {
  office: {
    /* v3.7.53：fieldKeys 是「表单采集白名单」——不在其中的字段**有输入框也永远存不进去**。
       两处历史缺口本次补齐：
       · meeting：v3.7.43 补了 date + startTime 两个输入框，但白名单没同步 →
         「开始时间」「参会人」录了保存后即丢（表格该列恒空）。
       · expense：本轮新增「时间」字段，同步登记。 */
    meeting:    { key:"meetings",    fieldKeys:["title","type","date","startTime","host","who","duration","note"] },
    project:    { key:"projects",    fieldKeys:["name","owner","milestone","status","progress","due"] },
    attendance: { key:"attendance",  fieldKeys:["date","type","checkIn","checkOut","note"] },
    expense:    { key:"expenses",    fieldKeys:["title","who","amount","category","date","time","status"] }
  },
  study: {
    knowledge: { key:"knowledge", fieldKeys:["title","category","source","importance","tags","content"] },
    reading:   { key:"reading",   fieldKeys:["book","author","status","progress","rating","startDate","finishDate","excerpt","note"] },
exercise:  { key:"exercises", fieldKeys:["subject","question","answer","correct","explain"],
  /* v3.2 任务四阶段二：错题自动入 SM-2 复习（正确率 < 70 视为错题 → 写入 rec_study 复习队列）。
     v3.7.12（解耦 S0）：实现**移出核心层** —— 它要调 getRec/setRec（Data 层），留在 core 会让
     core 反向依赖 Data。核心层只保留"钩子调用"，具体实现由 Data 层通过 AppBridge 注册。
     行为完全不变（实现逐字搬迁，含 typeof 守卫与字段顺序）。 */
  onSave:function(rec){
    if(typeof AppBridge.onExerciseSave === "function") AppBridge.onExerciseSave(rec);
  }
},
    exam:      { key:"exams",     fieldKeys:["title","subject","date","score","total"] }
  },
  data: {
    report: { key:"data_reports", fieldKeys:["title","source","dims","metrics","note"] },
    /* v3.0.1 B-5：chart 卡扩展 data（JSON 数据点）+ chartType（图表类型），旧记录无新字段仍按台账行显示 */
    chart:  { key:"data_charts",  fieldKeys:["title","type","source","data","chartType","note"] },
    /* v3.1.2 A-档：SQL 查数能力复用给 data 场景（独立存储键 data_sql，与 code_sql 不互串；
       运行按钮 data-f-sqlrun 是全局事件委托，同一实现天然兼容双场景） */
    sql:    { key:"data_sql",     fieldKeys:["title","db","schema","sql","note"] }
  },
  design: {
    ui:      { key:"design_ui", fieldKeys:["title","type","tool","palette","note"] },
    model3d: { key:"design_3d", fieldKeys:["title","format","usage","note"] },
    cad:     { key:"design_cad", fieldKeys:["title","type","version","note"] },
    image:   { key:"design_image", fieldKeys:["title","type","size","note"] }
  },
  code: {
    frontend: { key:"code_frontend", fieldKeys:["title","framework","html","css","js"] },
    sql:      { key:"code_sql",      fieldKeys:["title","db","schema","sql","note"] },
    runner:   { key:"code_runner",   fieldKeys:["title","language","code","result"] },
    regex:    { key:"code_regex",    fieldKeys:["title","pattern","text","result"] }
  },
  life: {
    plan:   { key:"life_plans",    fieldKeys:["title","type","priority","date","note"] },
    health: { key:"life_health",   fieldKeys:["date","weight","exercise","sleep","note"] },
    bill:   { key:"life_bills",    fieldKeys:["name","amount","cycle","due","status"] },
    shop:   { key:"life_shopping", fieldKeys:["name","qty","amount","status"] }
  }
};

/* v3.7.13（解耦 S1）：通用 DOM 助手归位。
   原先在 render-widgets（Render 层），但被 Data / AI / UI 多层调用 → 多层逆层依赖。
   它不依赖任何应用符号（只用 document/window）→ 归入核心层，符合"核心层零外部依赖"。 */

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

/* v3.7.17（解耦 S4）：场景特性表下移核心层。原先在 ui-theme（UI），却被 data-links / render-scene-main 引用 → 逆层依赖。
   它是纯数据表（仅依赖 core 的 t）→ 归入核心层。纯搬迁，不改一行实现。 */
/* v3.0：场景内功能 tab 注册表——标题栏导航条 + 场景内视图切换。
   每场景「求同存异」：骨架统一（概览=任务+资料库+专属卡），功能 tab 对症下药。 */
const SCENE_FEATURES = {
  office: [
    { id:"overview", type:"core",   label:t("tab.overview", "概览") },
    { id:"meeting", type:"tool",    label:t("tab.meeting", "会议") },
    { id:"project", type:"tool",    label:t("tab.project", "项目") },
    { id:"attendance", type:"record", label:t("tab.attendance", "考勤") },
    { id:"expense", type:"record",    label:t("tab.expense", "报销") },
  ],
  study: [
    { id:"overview", type:"core",  label:t("tab.overview", "概览") },
    { id:"knowledge", type:"record", label:t("tab.knowledge", "知识库") },
    /* v3.5.8：阅读改为商店可添加项（用户需求），渲染器与绑定保留，启用后自动出现 */
    { id:"exercise", type:"record",  label:t("tab.exercise", "练习") },
    { id:"exam", type:"record",      label:t("tab.exam", "考试") }
  ],
  data: [
    { id:"overview", type:"core", label:t("tab.overview", "概览") },
    { id:"report", type:"tool",   label:t("option.report", "报表") },
    { id:"chart", type:"tool",    label:t("tab.chart", "可视化") },
    { id:"sql", type:"tool",      label:"SQL" } // v3.1.2 A-档：SQL 查数能力复用给 data 场景（此前只在 code，data 用户被迫切场景查数）
  ],
  design: [
    { id:"overview", type:"core", label:t("tab.overview", "概览") },
    { id:"canvas", type:"tool",     label:t("tab.canvas", "画布") },
    { id:"cad", type:"record",      label:"CAD" },
    { id:"image", type:"record",    label:t("tab.image", "图片") },
    { id:"ui", type:"record",       label:"UI" },
    { id:"model3d", type:"record",  label:"3D" }
  ],
  code: [
    { id:"overview", type:"core", label:t("tab.overview", "概览") },
    { id:"runner", type:"tool",   label:t("tab.runner", "运行器") },
    { id:"regex", type:"record",    label:t("tab.regex", "正则") },
    { id:"json", type:"tool",     label:t("tool.json.name", "JSON") },
    { id:"time", type:"tool",     label:t("tool.time.name", "时间戳") },
    { id:"codec", type:"tool",    label:t("tool.codec.name", "编解码") },
    { id:"uuid", type:"tool",     label:t("tool.uuid.name", "UUID") },
    { id:"frontend", type:"record", label:t("tab.frontend", "前端") },
    { id:"sql", type:"tool",      label:"SQL" }
  ],
  life: [
    { id:"overview", type:"core", label:t("tab.overview", "概览") },
    { id:"plan", type:"record",     label:t("tab.plan", "计划") },
    { id:"health", type:"record",   label:t("tab.health", "健康") },
    { id:"bill", type:"record",     label:t("tab.bill", "缴费") },
    { id:"shop", type:"record",     label:t("tab.shop", "采购") }
  ],
  health: [
    { id:"overview", type:"core",   label:t("tab.overview", "概览") },
    { id:"trend", type:"record",    label:t("tab.trend", "趋势") }
  ],
  finance: [
    { id:"overview", type:"core",   label:t("tab.overview", "概览") },
    { id:"stats", type:"record",    label:t("tab.stats", "收支统计") }
  ]
};

/* v3.7.17（解耦 S4）：对话内容转文本助手下移核心层（原在 ai-retry，被 data-links 引用 → 逆层依赖；仅依赖 t）。纯搬迁。 */
/* ---------- 历史消息 content 兼容（v1.14 前多模态可能遗留数组格式，渲染时兜底转文本） ---------- */
function _chatContentToText(c){
  if(Array.isArray(c)){
    const txt = c.filter(function(p){ return p && p.type === "text"; }).map(function(p){ return p.text; }).join("\n");
    const imgs = c.filter(function(p){ return p && p.type === "image_url"; }).length;
    return txt + (imgs ? t("ai.imageCount"," [图×") + imgs + "]" : "");
  }
  return c;
}

/* v3.7.78 解耦：自别处下沉（同层序逆层消除） */
function thisWeekDone(sc){
  const d=new Date(); const day=(d.getDay()+6)%7;
  const mon=new Date(d); mon.setDate(d.getDate()-day); mon.setHours(0,0,0,0);
  return getActiveTasks().filter(t=>t.sc===sc&&t.status==="done"&&t.doneAt&&t.doneAt>=mon.getTime());
}

/* v3.7.78 解耦：自别处下沉（同层序逆层消除） */
function weekRange(){
  const d=new Date(); const day=(d.getDay()+6)%7;
  const mon=new Date(d); mon.setDate(d.getDate()-day);
  const sun=new Date(mon); sun.setDate(mon.getDate()+6);
  return (mon.getMonth()+1)+"/"+mon.getDate()+" - "+(sun.getMonth()+1)+"/"+sun.getDate();
}
