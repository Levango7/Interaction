// ===== Render Layer (渲染层·场景细分模块) =====
/* ---------- 场景细分模块 ---------- */
/* CARD_REGISTRY：场景专属卡片 render/bind 查表（A-P2-7，替代 renderExtra/bindExtra 硬编码分支；FB-2/6） */
const CARD_REGISTRY = {
  report:  { render: reportCard,  bind: bindReportCard },
  review:  { render: reviewCard,  bind: bindReviewCard },

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
  if(_CARD_BUILTIN.includes(key)) return {ok:false, err:"不能覆盖内置卡片："+key};
  if(CARD_REGISTRY[key]) return {ok:false, err:"卡片已注册："+key};
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
  const done=thisWeekDone(sc);
  const txt = done.length? done.map(t=>"- "+t.title+(t.due?"（"+t.due+"）":"")).join("\n") : "本周暂无已完成任务。";
  return `<div class="card"><h2>周报生成器</h2><p class="sub">自动汇总本周（${weekRange()}）已完成任务</p>
    <textarea readonly id="repTxt">${esc(txt)}</textarea>
    <button class="addbtn" id="copyRep" style="--sc:${SCENARIOS[sc].color};margin-top:8px">复制周报</button></div>`;
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
 * 渲染学习场景的间隔复习卡片（列出全部资料 + 4 档评分按钮）
 * @returns {string} HTML 字符串
 */
function reviewCard(){
  const recs=getRec("study"); const now=Date.now();
  const due=recs.filter(r=>r.nextReview&&r.nextReview<=now);
  const items = recs.length? recs.map(r=>{
    const sm = r.sm2 || { ef: 2.5, interval: 0, reps: 0 };
    const nr = r.nextReview ? new Date(r.nextReview).toLocaleDateString() : "未安排";
    const isDue = r.nextReview && r.nextReview <= now;
    return `<div style="border:1px solid var(--line);border-radius:8px;padding:8px;margin-bottom:7px${isDue?";border-color:var(--danger)":""}">
      <div style="font-size:14px">${esc(r.title)}</div>
      <div style="font-size:12px;color:var(--muted);margin-top:2px">下次复习：${nr} · EF ${sm.ef} · 间隔 ${sm.interval}天 · 第${sm.reps}次</div>
      <div class="kbtns">
        <button data-rev="${r.id}:2">再来</button>
        <button data-rev="${r.id}:3">困难</button>
        <button data-rev="${r.id}:4">良好</button>
        <button data-rev="${r.id}:5">简单</button>
      </div>
    </div>`;
  }).join("") : `<div class="empty">学习资料库为空</div>`;
  const dueHtml = due.length? `<p class="sub" style="color:var(--danger)">今日待复习：${due.length} 项</p>` : "";
  return `<div class="card"><h2>${SCENARIOS.study.icon || ""} 间隔复习</h2>${dueHtml}<div>${items}</div></div>`;
}


