// ===== Render Layer (渲染层·场景细分模块) =====
/* ---------- 场景细分模块 ---------- */
/* CARD_REGISTRY：场景专属卡片 render/bind 查表（A-P2-7，替代 renderExtra/bindExtra 硬编码分支；FB-2/6） */
const CARD_REGISTRY = {
  report:  { render: reportCard,  bind: bindReportCard },
  review:  { render: reviewCard,  bind: bindReviewCard },
  health:  { render: healthCard,  bind: bindHealthCard },
  design:  { render: designCard,  bind: bindDesignCard },
  data:    { render: dataCard,    bind: bindDataCard },
  life:    { render: lifeCard,    bind: bindLifeCard },
  code:    { render: codeCard,    bind: bindCodeCard },
  none:    { render: () => "",    bind: () => {} },
};
/** 内置卡片键（禁止被 registerCard 覆盖） */
const _CARD_BUILTIN = Object.keys(CARD_REGISTRY);
/**
 * 架构项② 渲染扩展：注册自定义卡片类型到 CARD_REGISTRY
 * @param {string} key - 卡片类型键（场景 extraCard 引用）
 * @param {{render:function, bind:function}} def - 渲染/绑定函数
 * @returns {{ok:boolean, err?:string}}
 */
function registerCard(key, def){
  if(!key || typeof key !== "string") return {ok:false, err:"无效的卡片键"};
  if(!def || typeof def.render !== "function") return {ok:false, err:"render 必须是函数"};
  if(_CARD_BUILTIN.includes(key)) return {ok:false, err:t("card.cannotOverrideBuiltin", "不能覆盖内置卡片：{key}").replace("{key}", key)};
  if(CARD_REGISTRY[key]) return {ok:false, err:t("card.alreadyRegistered", "卡片已注册：{key}").replace("{key}", key)};
  CARD_REGISTRY[key] = { render: def.render, bind: typeof def.bind === "function" ? def.bind : () => {} };
  return {ok:true};
}
/* 架构项② 渲染扩展：场景扩展区注册表（sc → 扩展段数组），未来区块注入无需改 renderMainHTML */
const SCENE_SECTION_REGISTRY = {};
/**
 * 注册场景扩展区（渲染到场景页资料库之后、专属卡片之前）
 * @param {string} sc - 场景键；"*" 表示所有场景
 * @param {{render:function, bind?:function}} def
 * @returns {{ok:boolean, err?:string}}
 */
function registerSceneSection(sc, def){
  if(!sc || typeof sc !== "string") return {ok:false, err:"无效的场景键"};
  if(!def || typeof def.render !== "function") return {ok:false, err:"render 必须是函数"};
  (SCENE_SECTION_REGISTRY[sc] = SCENE_SECTION_REGISTRY[sc] || []).push(def);
  return {ok:true};
}
/** 读取场景生效的扩展区列表（"*" 全局 + 场景专属） */
function getSceneSections(sc){
  return (SCENE_SECTION_REGISTRY["*"] || []).concat(SCENE_SECTION_REGISTRY[sc] || []);
}
/** 渲染场景全部扩展区 HTML（空则 ""） */
function renderSceneSections(sc){
  return getSceneSections(sc).map(s => { try{ return s.render(sc) || ""; }catch(e){ return ""; } }).join("");
}
/** 绑定场景全部扩展区事件（异常隔离，不影响其他段） */
function bindSceneSections(sc){
  getSceneSections(sc).forEach(s => { try{ if(s.bind) s.bind(sc); }catch(e){ /* noop */ } });
}
function renderExtra(sc){
  const r = CARD_REGISTRY[SCENARIOS[sc].extraCard || "none"];
  return r ? r.render(sc) : "";
}
function reportCard(sc){
  const done = thisWeekDone(sc);
  const lines = [];
  // v3.1.2 B-档：周报纳入会议/报销/考勤统计——此前周报只汇总任务，本周开了几场会/报销多少/考勤异常都不进周报
  if(sc === "office"){
    let meetings = 0, expenses = 0, attendance = 0;
    try{
      const d = new Date(); const day = (d.getDay() + 6) % 7;
      const mon = new Date(d); mon.setDate(d.getDate() - day); mon.setHours(0, 0, 0, 0);
      meetings = (load(PREFIX + "meetings", []) || []).filter(function(r){ return r.date && new Date(r.date) >= mon.getTime(); }).length;
      expenses = (load(PREFIX + "expenses", []) || []).filter(function(r){ return r.date && new Date(r.date) >= mon.getTime(); }).length;
      attendance = (load(PREFIX + "attendance", []) || []).filter(function(r){ return r.date && new Date(r.date) >= mon.getTime(); }).length;
    }catch(_e){}
    if(meetings) lines.push(t("report.meetingStat", "本周会议 {n} 场").replace("{n}", meetings));
    if(expenses) lines.push(t("report.expenseStat", "本周报销 {n} 笔").replace("{n}", expenses));
    if(attendance) lines.push(t("report.attendanceStat", "本周考勤 {n} 条").replace("{n}", attendance));
  }
  if(done.length){ done.forEach(function(t){ lines.push("- " + t.title + (t.due ? "（" + t.due + "）" : "")); }); }
  else if(!lines.length){ lines.push(t("report.empty", "本周暂无已完成任务。")); }
  const txt = lines.join("\n");
  return `<div class="card"><h2>${ic("sheet")} ${t("report.generator.title", "周报生成器")}</h2><p class="sub">${t("report.sub", "自动汇总本周（{range}）已完成任务").replace("{range}", weekRange())}</p>
    <textarea readonly id="repTxt">${esc(txt)}</textarea>
    <button type="button" class="addbtn" id="copyRep" style="--sc:${SCENARIOS[sc].color};margin-top:var(--space-2)">${t("report.copy", "复制周报")}</button></div>`;
}

/* ---------- SM-2 间隔复习算法 ----------
 * state: 上一轮的 { ef, interval, reps }，可为 null/undefined（兼容旧记录）
 * q:     本次评分 0-5（2=再来 3=困难 4=良好 5=简单）
 * 返回:  { ef, interval, reps, nextReviewDays }
 */
/**
 * SM-2 间隔重复算法
 * @param {{ef:number,interval:number,reps:number}|null|undefined} state - 上一轮状态
 * @param {number} q - 本次评分 0-5（2=再来 3=困难 4=良好 5=简单）
 * @returns {{ef:number,interval:number,reps:number,nextReviewDays:number}}
 */
function sm2(state, q){
  let ef = (state && state.ef) ? state.ef : 2.5;
  let interval = (state && state.interval) ? state.interval : 0;
  let reps = (state && state.reps) ? state.reps : 0;
  if (q < 3){
    reps = 0;
    interval = 1;
  } else {
    if (reps === 0) interval = 1;
    else if (reps === 1) interval = 6;
    else interval = Math.round(interval * ef);
    reps++;
  }
  ef = ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  if (ef < 1.3) ef = 1.3;
  return { ef: Math.round(ef * 100) / 100, interval, reps, nextReviewDays: interval };
}
/**
 * v1.4-B 渲染单条复习项 HTML（抽出供虚拟滚动复用）
 * @param {Object} r - 学习记录
 * @param {number} now - 当前时间戳
 * @returns {string} div HTML
 */
function _renderReviewItem(r, now){
  const sm = r.sm2 || { ef: 2.5, interval: 0, reps: 0 };
  const nr = r.nextReview ? new Date(r.nextReview).toLocaleDateString() : t("review.unscheduled", "未安排");
  const isDue = r.nextReview && r.nextReview <= now;
  return `<div class="u-border-line u-radius-md u-p-2" style="margin-bottom:7px${isDue?";border-color:var(--danger)":""}">
    <div class="u-fs-sm">${esc(r.title)}</div>
    <div class="u-fs-2xs u-text-muted"style="margin-top:2px">${t("review.itemMeta", "下次复习：{nr} · EF {ef} · 间隔 {interval}天 · 第{reps}次").replace("{nr}", nr).replace("{ef}", sm.ef).replace("{interval}", sm.interval).replace("{reps}", sm.reps)}</div>
    <div class="kbtns">
      <button type="button" data-rev="${r.id}:2">${t("review.again", "再来")}</button>
      <button type="button" data-rev="${r.id}:3">${t("review.hard", "困难")}</button>
      <button type="button" data-rev="${r.id}:4">${t("review.good", "良好")}</button>
      <button type="button" data-rev="${r.id}:5">${t("review.easy", "简单")}</button>
    </div>
  </div>`;
}
/**
 * 渲染学习场景的间隔复习卡片（列出全部资料 + 4 档评分按钮）
 * v1.4-B：超 100 条时启用虚拟滚动，只渲染可见区域 + 缓冲区
 * @returns {string} HTML 字符串
 */
function reviewCard(){
  const recs=getRec("study"); const now=Date.now();
  const due=recs.filter(r=>r.nextReview&&r.nextReview<=now);
  let items;
  if(recs.length === 0){
    items = `<div class="empty">${t("review.empty", "学习资料库为空")}</div>`;
  } else if(recs.length > VIRTUAL_SCROLL_THRESHOLD){
    // v1.4-B 虚拟滚动
    const range = virtualScrollRange({
      total: recs.length,
      itemHeight: VIRTUAL_ITEM_HEIGHT_RECORD,
      viewportHeight: VIRTUAL_VIEWPORT_MAX,
      scrollTop: 0,
      buffer: VIRTUAL_SCROLL_BUFFER
    });
    const visible = recs.slice(range.start, range.end).map(r => _renderReviewItem(r, now)).join("");
    items = `<div class="vscroll-viewport u-overflow-y-auto" data-vscroll="review" data-vcount="${recs.length}" style="max-height:${VIRTUAL_VIEWPORT_MAX}px">` +
      `<div class="vscroll-spacer u-pos-relative" style="height:${range.totalHeight}px">` +
      `<div class="vscroll-items u-pos-absolute" style="top:${range.offsetY}px">${visible}</div>` +
      `</div></div>`;
  } else {
    items = recs.map(r => _renderReviewItem(r, now)).join("");
  }
  const dueHtml = due.length? `<p class="sub u-text-danger">${t("review.due", "今日待复习：{n} 项").replace("{n}", due.length)}</p>` : "";
  return `<div class="card"><h2>${SCENARIOS.study.icon || ""} ${t("review.title", "间隔复习")}</h2>${dueHtml}<div>${items}</div></div>`;
}
/**
 * v1.4-B 虚拟滚动：滚动时更新复习列表可见项
 * @param {Element} viewport - 滚动视口元素
 * @returns {void}
 */
function _updateReviewVScroll(viewport){
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
  const recs = getRec("study");
  const now = Date.now();
  const items = viewport.querySelector(".vscroll-items");
  if(!items) return;
  const html = recs.slice(range.start, range.end).map(r => _renderReviewItem(r, now)).join("");
  items.innerHTML = sanitizeHtml(html);
  items.style.top = range.offsetY + "px";
}

/* ---------- 生活场景·健康概览卡片 ----------
 * v1.3.4-C 生活场景增强：运动记录 / 体重追踪 / 睡眠记录 / 喝水提醒
 * 数据源：getRec("life")（生活场景资料库记录），按 record.type 字段分类筛选
 * 兼容：无 type 字段的旧记录默认归为"日常事务"，不参与健康统计
 * 渲染：内联 SVG 折线图 / 条形图 / 进度条，零外部依赖，颜色全部走 var(--token)
 */
/** 健康记录类型枚举（与 05-bootstrap-config.js life.record.fields.type.options 对齐） */
const HEALTH_TYPES = { EXERCISE:t("option.exercise", "运动记录"), WEIGHT:t("option.weight", "体重追踪"), HEIGHT:t("option.height", "身高记录"), SLEEP:t("option.sleep", "睡眠记录"), WATER:t("option.water", "喝水记录") };
/**
 * 取生活场景全部记录，补齐旧记录的 type 字段（兼容 v1.3.3 之前的生活备忘）
 * @returns {Object[]}
 */
function getHealthRecs(){
  // v3.1.2 B-档：健康数据双源统一——此前同名业务三个存储（rec_life / life_health / 工具台账），
  // 在运动工具里记的数据不会出现在健康摘要卡上（用户视角"记了但没反应"）。
  // 以 rec_life 为主、life_health 结构化记录归一化为同 type 标签合并（同天同 type rec_life 优先）。
  const life = (getRec("life") || []).map(function(r){ return Object.assign({}, r, { type: r.type || "日常事务", _src:"life" }); });
  const hh = (load(PREFIX + "life_health", []) || []).map(function(r){
    // life_health 结构化字段 → 多条 rec_life 风格记录（每条一个 type）
    const out = [];
    const base = { date: r.date || "", note: r.note || "", created: r.created || (r.date ? new Date(r.date).getTime() : Date.now()) };
    if(r.weight){ out.push({ id: (r.id || "hh") + "_w", type: "体重追踪", title: "体重", value: String(r.weight) + "kg", _src:"hh", _date: r.date, created: base.created }); }
    if(r.exercise){ out.push({ id: (r.id || "hh") + "_e", type: "运动记录", title: "运动", value: String(r.exercise) + "分钟", _src:"hh", _date: r.date, created: base.created }); }
    if(r.sleep){ out.push({ id: (r.id || "hh") + "_s", type: "睡眠记录", title: "睡眠", value: String(r.sleep) + "h", _src:"hh", _date: r.date, created: base.created }); }
    return out;
  }).reduce(function(a,b){ return a.concat(b); }, []);
  // 合并：rec_life 优先（同 date+type 去重）
  const seen = new Set();
  const merged = [];
  life.concat(hh).forEach(function(r){
    const d = r._date || r.date || (r.created ? new Date(r.created).toISOString().slice(0,10) : "");
    const k = d + "|" + r.type;
    if(r._src === "life"){ seen.add(k); merged.push(r); }
  });
  hh.forEach(function(r){
    const d = r._date || (r.created ? new Date(r.created).toISOString().slice(0,10) : "");
    const k = d + "|" + r.type;
    if(!seen.has(k)) merged.push(r);
  });
  return merged;
}
/**
 * 解析记录 value 字段中的首个数值（如 "5km"→5、"65.2kg"→65.2、"7.5h"→7.5、"8杯"→8）
 * @param {string} v
 * @returns {number}
 */
function parseNum(v){
  if(typeof v !== "string" && typeof v !== "number") return 0;
  const m = String(v).match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : 0;
}
/** 判断时间戳是否在今天 */
function isToday(ts){
  if(!ts) return false;
  const d = new Date(ts), n = new Date();
  return d.getFullYear()===n.getFullYear() && d.getMonth()===n.getMonth() && d.getDate()===n.getDate();
}
/** 本周一 00:00 的时间戳（周一为一周起点） */
function weekStartTs(){
  const d = new Date(); const day = (d.getDay()+6)%7;
  const mon = new Date(d); mon.setDate(d.getDate()-day); mon.setHours(0,0,0,0);
  return mon.getTime();
}
/**
 * 体重趋势内联 SVG 折线图（最近 5 次体重记录）
 * @param {Object[]} recs - 体重记录（按时间升序）
 * @returns {string} SVG 字符串
 */
function weightTrendSVG(recs){
  const vals = recs.map(r=>parseNum(r.value)).filter(v=>v>0);
  if(vals.length < 1) return `<div class="empty">${t("health.weight.empty", "暂无体重数据")}</div>`;
  const arr = vals.length===1 ? [vals[0], vals[0]] : vals;
  const W = 300, H = 90, pad = 8;
  const min = Math.min(...arr), max = Math.max(...arr);
  const span = (max - min) || 1; // 避免除 0
  const n = arr.length;
  const pts = arr.map((v,i)=>[
    (i/(n-1))*W,
    H - pad - ((v - min)/span)*(H - pad*2)
  ]);
  const line = pts.map(p=>p[0].toFixed(1)+","+p[1].toFixed(1)).join(" ");
  const area = "0,"+(H-pad)+" "+line+" "+W+","+(H-pad);
  return `<svg class="health-trend" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-label="${t("health.weight.aria", "体重趋势图")}">
    <polygon points="${area}" class="u-fill-accent" fill-opacity="0.08"/>
    <polyline points="${line}" fill="none" class="u-stroke-accent" stroke-width="2" stroke-linejoin="round"/>
    ${pts.map(p=>`<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="2.5" class="u-fill-accent"/>`).join("")}
  </svg><div class="health-trend-meta">${t("health.weight.meta", "{min} – {max} kg · 最近 {n} 次").replace("{min}", min.toFixed(1)).replace("{max}", max.toFixed(1)).replace("{n}", vals.length)}</div>`;
}
/**
 * 睡眠条形图（最近 7 条睡眠记录，每条高度按小时数映射）
 * @param {Object[]} recs - 睡眠记录（按时间升序）
 * @returns {string} HTML 字符串
 */
function sleepBarsHTML(recs){
  const recent = recs.slice(-7);
  if(recent.length < 1) return `<div class="empty">${t("health.sleep.empty", "暂无睡眠数据")}</div>`;
  const vals = recent.map(r=>parseNum(r.value));
  const max = Math.max(8, ...vals); // 默认 8h 为参考满刻度
  const bars = vals.map(v=>{
    const h = Math.max(4, (v/max)*56); // 最小 4px 高度，最大 56px
    const title = v ? v.toFixed(1)+"h" : "—";
    return `<div class="health-sleep-col" style="height:${h.toFixed(1)}px" title="${esc(title)}"></div>`;
  }).join("");
  const avg = vals.filter(v=>v>0).length ? (vals.reduce((a,b)=>a+b,0)/vals.filter(v=>v>0).length).toFixed(1) : "—";
  return `<div class="health-sleep-bar">${bars}</div><div class="health-trend-meta">${t("health.sleep.meta", "最近 {n} 天 · 平均 {avg} h").replace("{n}", vals.length).replace("{avg}", avg)}</div>`;
}
/**
 * 喝水进度条（今日喝水杯数 / 目标 8 杯）
 * @param {Object[]} recs - 今日喝水记录
 * @param {number} [goal=8] - 目标杯数
 * @returns {string} HTML 字符串
 */
function waterProgressHTML(recs, goal){
  const g = goal || 8;
  const cups = recs.reduce((sum,r)=>{
    const n = parseNum(r.value);
    return sum + (n > 0 ? n : 1); // 有数值用数值，否则计 1 杯
  }, 0);
  const pct = Math.min(100, Math.round((cups/g)*100));
  const done = cups >= g;
  return `<div class="health-water">
    <div class="health-water-bar"><div class="health-water-fill${done?" done":""}" style="width:${pct}%"></div></div>
    <div class="health-trend-meta">${t("health.water.meta", "{cups} / {g} 杯{done}").replace("{cups}", cups).replace("{g}", g).replace("{done}", done?t("health.water.goal", " · 已达成目标"):"")}</div>
  </div>`;
}
/**
 * 渲染生活场景的健康概览卡片：运动概览 + 体重趋势 + 睡眠概览 + 喝水进度
 * @returns {string} HTML 字符串
 */
function healthCard(){
  const all = getHealthRecs();
  const exerciseRecs = all.filter(r=>r.type===HEALTH_TYPES.EXERCISE);
  const weightRecs   = all.filter(r=>r.type===HEALTH_TYPES.WEIGHT).sort((a,b)=>(a.created||0)-(b.created||0));
  const heightRecs   = all.filter(r=>r.type===HEALTH_TYPES.HEIGHT).sort((a,b)=>(a.created||0)-(b.created||0));
  const sleepRecs    = all.filter(r=>r.type===HEALTH_TYPES.SLEEP).sort((a,b)=>(a.created||0)-(b.created||0));
  const waterRecs    = all.filter(r=>r.type===HEALTH_TYPES.WATER);

  // 本周运动
  const ws = weekStartTs();
  const weekExercise = exerciseRecs.filter(r=>(r.created||0) >= ws);
  const weekDistance = weekExercise.reduce((s,r)=>s + parseNum((r.value||"").match(/[\d.]+/)?.[0] || 0), 0);
  // BMI calculation
  let bmiHTML = "";
  if(weightRecs.length && heightRecs.length){
    const latestWeight = parseNum(weightRecs[weightRecs.length-1].value);
    const latestHeight = parseNum(heightRecs[heightRecs.length-1].value);
    if(latestWeight>0 && latestHeight>0){
      const hM = latestHeight/100;
      const bmi = latestWeight/(hM*hM);
      let category=""; let color="";
      if(bmi<18.5){category=t("health.bmi.under", "偏瘦");color="var(--ok)";}
      else if(bmi<24){category=t("health.bmi.normal", "正常");color="var(--accent)";}
      else if(bmi<28){category=t("health.bmi.over", "超重");color="var(--warn)";}
      else {category=t("health.bmi.obese", "肥胖");color="var(--danger)";}
      bmiHTML = `<div class="health-item"><div class="health-val" style="color:${color}">${bmi.toFixed(1)}</div><div class="health-lbl">${t("health.bmi.label", "BMI ({category})").replace("{category}", category)}</div></div>`;
    }
  }
  const todayWater = waterRecs.filter(r=>isToday(r.created));

  return `<div class="card"><h2><span class="ic-inline" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><rect x="7" y="12" width="3" height="6"/><rect x="12" y="8" width="3" height="10"/><rect x="17" y="5" width="3" height="13"/></svg></span>${t("health.title", "健康概览")}</h2>
    <p class="sub">${t("health.sub", "运动 · 体重 · 睡眠 · 喝水　本地记录，自动汇总")}</p>
    <div class="health-grid">
      <div class="health-item"><div class="health-val">${weekExercise.length}</div><div class="health-lbl">${t("health.weekExercise", "本周运动（次）")}</div></div>
      <div class="health-item"><div class="health-val">${weekDistance.toFixed(1)}</div><div class="health-lbl">${t("health.weekDistance", "本周距离（km）")}</div></div>
      <div class="health-item"><div class="health-val">${todayWater.reduce((s,r)=>{const n=parseNum(r.value);return s+(n>0?n:1);},0)}/8</div><div class="health-lbl">${t("health.todayWater", "今日喝水（杯）")}</div></div>
      <div class="health-item"><div class="health-val">${sleepRecs.length? (sleepRecs.slice(-7).map(r=>parseNum(r.value)).filter(v=>v>0).reduce((a,b)=>a+b,0)/Math.max(1,sleepRecs.slice(-7).map(r=>parseNum(r.value)).filter(v=>v>0).length)).toFixed(1):"—"}</div><div class="health-lbl">${t("health.weekSleep", "近 7 天均睡（h）")}</div></div>
        ${bmiHTML}
    </div>
    <div class="health-section"><h3>${t("health.weight.title", "体重趋势")}</h3>${weightTrendSVG(weightRecs.slice(-5))}
      <div class="health-quick u-flex u-mt-2 u-gap-2 u-ai-center">
        <input id="healthWeightInput" placeholder="${t("health.weight.ph", "快捷录入：65.2 或 65.2kg")}" class="u-flex-1 u-min-w-100" aria-label="${t("health.weight.aria", "体重快速录入")}">
        <button type="button" class="addbtn sm" id="healthWeightQuick" data-sc="accent">${t("health.weight.quickBtn", "记录")}</button>
      </div>
    </div>
    <div class="health-section"><h3>${t("health.sleep.title", "睡眠概览")}</h3>${sleepBarsHTML(sleepRecs)}</div>
    <div class="health-section"><h3>${t("health.water.title", "今日喝水")}</h3>${waterProgressHTML(todayWater, 8)}
      <button type="button" class="addbtn sm u-mt-2" id="healthWaterPlus" data-sc="accent">${t("health.water.plusBtn", "＋ 喝一杯（记 1 杯）")}</button>
    </div>
  </div>`;
}
/**
 * 绑定健康概览卡片交互（v3.1.2 A-档：预留 hook 兑现——喝水 +1 / 体重快捷录入）
 * @returns {void}
 */
function bindHealthCard(){
  const waterBtn = document.getElementById("healthWaterPlus");
  if(waterBtn){
    waterBtn.onclick = function(){
      try{
        const recs = getRec("life");
        recs.unshift({ id: uid(), type: t("rec.waterRecord","喝水记录"), title: t("rec.water","喝水"), value: t("rec.waterValue","1 杯"), note: "", created: Date.now() });
        save(PREFIX + "rec_life", recs); // v3.1.2 A-档修复：saveRec 不存在（getRec 的写入等价物是 save(PREFIX+"rec_"+sc)）
        toast(t("health.water.plusToast", "已记录 1 杯水"), "ok");
        if(typeof render === "function") render();
      }catch(e){ toast(t("health.recordFail", "记录失败：{err}").replace("{err}", (e && e.message || e)), "warn"); }
    };
  }
  const weightBtn = document.getElementById("healthWeightQuick");
  if(weightBtn){
    weightBtn.onclick = function(){
      const inp = document.getElementById("healthWeightInput");
      const v = inp ? String(inp.value || "").trim() : "";
      if(!v || !/^[\d.]+\s*(kg)?$/i.test(v)){ toast(t("health.weight.invalid", "请输入体重，如 65.2 或 65.2kg"), "warn"); if(inp) inp.focus(); return; }
      try{
        const recs = getRec("life");
        recs.unshift({ id: uid(), type: t("rec.weightTracking","体重追踪"), title: t("rec.weight","体重"), value: v, note: "", created: Date.now() });
        save(PREFIX + "rec_life", recs); // v3.1.2 A-档修复：saveRec 不存在（getRec 的写入等价物是 save(PREFIX+"rec_"+sc)）
        toast(t("health.weight.savedToast", "已记录体重 " + v), "ok");
        if(inp) inp.value = "";
        if(typeof render === "function") render();
      }catch(e){ toast(t("health.recordFail", "记录失败：{err}").replace("{err}", (e && e.message || e)), "warn"); }
    };
  }
}

/** 设计场景专属卡片：灵感板（按类型统计 + 最近作品速览） */
function designCard(sc){
  const recs = getRec(sc);
  if(!recs.length) return '<div class="card extra-card"><h3>'+t("sceneCard.design.title", "灵感板")+'</h3><p class="sub">'+t("sceneCard.design.emptySub", "记录作品后这里会按类型汇总")+'</p><div class="extra-empty">'+t("sceneCard.design.empty", "暂无作品记录 · 在上方资料库添加第一条")+'</div></div>';
  // 按类型统计数量
  const byType = {};
  recs.forEach(r=>{ const t = r.type || "作品"; byType[t] = (byType[t]||0)+1; });
  const statHtml = Object.entries(byType).map(([t,n])=>
    '<span class="extra-tag">'+esc(t)+' <b>'+n+'</b></span>').join("");
  const recent = recs.slice(0, 4);
  const items = recent.map(r=>{
    const type = r.type || t("rec.work","作品");
    const title = r.title || t("rec.unnamed","未命名");
    return '<div class="extra-item"><span class="extra-tag">'+esc(type)+'</span><span class="extra-title">'+esc(title)+'</span></div>';
  }).join("");
  return '<div class="card extra-card"><h3>'+t("sceneCard.design.title", "灵感板")+'</h3><p class="sub">'+t("sceneCard.design.sub", "各类型作品数 · 最近速览")+'</p><div class="extra-stats">'+statHtml+'</div><div class="extra-list">'+items+'</div></div>';
}
function bindDesignCard(sc){ /* 设计卡片无需额外绑定 */ }

/** 数据场景专属卡片：指标快照（按类型统计 + 最近数据记录摘要） */
function dataCard(sc){
  const recs = getRec(sc);
  if(!recs.length) return '<div class="card extra-card"><h3>'+t("sceneCard.data.title", "指标快照")+'</h3><p class="sub">'+t("sceneCard.data.emptySub", "记录数据后这里会汇总各类型指标")+'</p><div class="extra-empty">'+t("sceneCard.data.empty", "暂无数据记录 · 在上方资料库添加第一条")+'</div></div>';
  // 按类型统计数量
  const byType = {};
  recs.forEach(r=>{ const t = r.type || "数据"; byType[t] = (byType[t]||0)+1; });
  const statHtml = Object.entries(byType).map(([t,n])=>
    '<span class="extra-tag">'+esc(t)+' <b>'+n+'</b></span>').join("");
  const recent = recs.slice(0, 5);
  const items = recent.map(r=>{
    const type = r.type || t("rec.data","数据");
    const title = r.title || "";
    // v3.1.2 A-档：有 value 字段的记录在最近列表中显示数值（此前只有标题/备注，「记了 65.2」看不到数）
    const val = (r.value !== undefined && r.value !== null && String(r.value).trim() !== "")
      ? ' <b class="u-text-accent">'+esc(String(r.value))+'</b>' : "";
    const note = r.note ? " · "+esc(r.note).slice(0,30) : "";
    return '<div class="extra-item"><span class="extra-tag">'+esc(type)+'</span><span class="extra-title">'+esc(title)+val+'</span>'+note+'</div>';
  }).join("");
  // v3.1.2 A-档：同名指标聚合成数值序列，取最近 8 个点渲染迷你折线（基建 parseChartData/renderMiniChart 现成）
  const metricSeries = {};
  recs.forEach(r=>{
    const v = Number(r.value);
    if(!isFinite(v)) return;
    const k = String(r.title || "").trim(); if(!k) return;
    if(!metricSeries[k]) metricSeries[k] = [];
    metricSeries[k].push({ ts: r.created || r.id || 0, v: v });
  });
  let chartHtml = "";
  const seriesKeys = Object.keys(metricSeries).filter(k=>metricSeries[k].length >= 2);
  if(seriesKeys.length){
    // 取点数最多的一个指标画趋势
    const top = seriesKeys.map(k=>({k:k, n:metricSeries[k].length})).sort((a,b)=>b.n-a.n)[0];
    const pts = metricSeries[top.k].sort((a,b)=>a.ts-b.ts).slice(-8);
    const data = pts.map((p,i)=>({label:String(i+1), value:p.v}));
    chartHtml = '<div class="extra-metric-chart"><p class="sub" style="margin:6px 0 2px">'+t("sceneCard.data.trendOf", "趋势")+': '+esc(top.k)+'</p>'+renderMiniChart("line", data)+'</div>';
  }
  return '<div class="card extra-card"><h3>'+t("sceneCard.data.title", "指标快照")+'</h3><p class="sub">'+t("sceneCard.data.sub", "各类型记录数 · 最近数据")+'</p><div class="extra-stats">'+statHtml+'</div><div class="extra-list">'+items+'</div>'+chartHtml+'</div>';
}
function bindDataCard(sc){ /* 数据卡片无需额外绑定 */ }

/** 生活场景专属卡片：健康摘要（按类型统计 + 运动/体重/睡眠/喝水最近记录） */
function lifeCard(sc){
  const recs = getRec(sc);
  if(!recs.length) return '<div class="card extra-card"><h3>'+`<span class="ic-inline" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 5.6a5.2 5.2 0 0 0-7.4 0L12 7l-1.4-1.4a5.2 5.2 0 1 0-7.4 7.4L12 21.4l8.8-8.4a5.2 5.2 0 0 0 0-7.4z"/></svg></span>`+t("sceneCard.life.title", "健康摘要")+'</h3><p class="sub">'+t("sceneCard.life.emptySub", "记录生活数据后这里会汇总健康指标")+'</p><div class="extra-empty">'+t("sceneCard.life.empty", "暂无生活记录 · 在上方资料库添加第一条")+'</div></div>';
  const byType = {};
  recs.forEach(r=>{ const t = r.type || "日常事务"; if(!byType[t]) byType[t] = []; byType[t].push(r); });
  const types = ["运动记录","体重追踪","睡眠记录","喝水记录"];
  const typeLabelMap = {"运动记录":t("rec.exerciseRecord","运动记录"),"体重追踪":t("rec.weightTracking","体重追踪"),"睡眠记录":t("rec.sleepRecord","睡眠记录"),"喝水记录":t("rec.waterRecord","喝水记录")};
  // 类型统计（有记录的类型）
  const statHtml = types.map(t=>{
    const list = byType[t] || [];
    if(!list.length) return "";
    return '<span class="extra-tag">'+esc(typeLabelMap[t]||t)+' <b>'+list.length+'</b></span>';
  }).filter(Boolean).join("");
  const rows = types.map(t=>{
    const list = byType[t] || [];
    if(!list.length) return "";
    const latest = list[0];
    const val = latest.value || "";
    return '<div class="extra-item"><span class="extra-tag">'+esc(typeLabelMap[t]||t)+'</span><span class="extra-title">'+esc(latest.title||"")+'</span>'+(val?' <span class="extra-val">'+esc(val)+'</span>':"")+'</div>';
  }).filter(Boolean).join("");
  // 类型不在四大健康项内的记录也展示（如"日常事务"），避免有数据却无卡片
  const otherRows = Object.keys(byType).filter(t => !types.includes(t)).map(t=>{
    const list = byType[t] || [];
    const latest = list[0];
    const val = latest.value || "";
    return '<div class="extra-item"><span class="extra-tag">'+esc(typeLabelMap[t]||t)+'</span><span class="extra-title">'+esc(latest.title||"")+'</span>'+(val?' <span class="extra-val">'+esc(val)+'</span>':"")+'</div>';
  }).join("");
  const allRows = rows + otherRows;
  if(!allRows) return "";
  return '<div class="card extra-card"><h3>'+t("sceneCard.life.title", t("sceneCard.life.title","健康摘要"))+'</h3><p class="sub">'+t("sceneCard.life.sub", t("sceneCard.life.sub","各类型记录数 · 最近记录"))+'</p><div class="extra-stats">'+statHtml+'</div><div class="extra-list">'+allRows+'</div></div>';
}
function bindLifeCard(sc){ /* 生活卡片无需额外绑定 */ }

/** 编程场景专属卡片：代码片段速览（按语言统计 + 最近代码片段） */
function codeCard(sc){
  const recs = getRec(sc);
  if(!recs.length) return '<div class="card extra-card"><h3>'+t("sceneCard.code.title", t("record.code.label","代码片段"))+'</h3><p class="sub">'+t("sceneCard.code.emptySub", t("sceneCard.code.emptySub","记录代码后这里会按语言汇总"))+'</p><div class="extra-empty">'+t("sceneCard.code.empty", t("sceneCard.code.empty","暂无代码片段 · 在上方资料库添加第一条"))+'</div></div>';
  // 按语言统计数量
  const byLang = {};
  recs.forEach(r=>{ const l = r.lang || t("option.other","其他"); byLang[l] = (byLang[l]||0)+1; });
  const statHtml = Object.entries(byLang).map(([l,n])=>
    '<span class="extra-tag">'+esc(l)+' <b>'+n+'</b></span>').join("");
  const recent = recs.slice(0, 4);
  const items = recent.map(r=>{
    const lang = r.lang || t("option.other","其他");
    const title = r.title || t("common.notNamed","未命名");
    const code = r.code ? " · "+esc(r.code).replace(/\s+/g," ").slice(0,40) : "";
    return '<div class="extra-item"><span class="extra-tag">'+esc(lang)+'</span><span class="extra-title">'+esc(title)+'</span>'+code+'</div>';
  }).join("");
  return '<div class="card extra-card"><h3>'+t("sceneCard.code.title", t("record.code.label","代码片段"))+'</h3><p class="sub">'+t("sceneCard.code.sub", t("sceneCard.code.sub","各语言片段数 · 最近速览"))+'</p><div class="extra-stats">'+statHtml+'</div><div class="extra-list">'+items+'</div></div>';
}
function bindCodeCard(sc){ /* 编程卡片无需额外绑定 */ }
