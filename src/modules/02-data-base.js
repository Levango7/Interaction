// ===== Data Layer (数据层·基础工具) =====
/**
 * 读取 localStorage 中键为 k 的值，解析失败时返回 def 并登记损坏
 * @param {string} k - 存储键
 * @param {*} def - 默认值
 * @returns {*} 解析后的值或默认值
 */
function load(k, def){
  let raw = null;
  try{
    raw = localStorage.getItem(k);
    return raw ? JSON.parse(raw) : def;
  }catch(e){
    // 解析失败：保留「损坏的原始串」供恢复，不再静默丢数据；返回默认值，不抛。
    if(typeof raw === "string"){
      _corrupted[k] = raw;
      if(!_corruptWarned){
        _corruptWarned = true;
        try{ toast("本地数据已损坏，已使用默认值。建议到设置中导出备份。", "warn"); }
        catch(e2){ /* toast 不可用时（极早期）静默降级 */ }
      }
    }
    return def;
  }
}
/**
 * 把值 v 序列化后写入 localStorage 键 k
 * @param {string} k - 存储键
 * @param {*} v - 要存储的值
 */
function save(k, v){
  try{
    localStorage.setItem(k, JSON.stringify(v));
    idbQueueMirror(k, v); // 架构项①：异步镜像到 IndexedDB（去抖批量，不阻塞；jsdom/无 IDB 环境 no-op）
  }
  catch(e){
    // M8：配额耗尽 / 隐私模式禁用存储时不再静默崩溃，给出可观测告警
    if(typeof pushDiag === "function") pushDiag("error", "save failed: "+(e&&e.message||e), {where:"save", key:k});
    try{ toast("本地存储写入失败（可能空间已满），部分数据未保存。", "error"); }catch(e2){ /* toast 不可用静默降级 */ }
  }
}
/**
 * 轻量响应式 store（T2.3 状态管理）
 * @param {*} initial - 初始状态
 * @returns {{get:Function, set:Function, subscribe:Function}} store 对象
 */
function createStore(initial){
  let state = initial;
  const subs = [];
  return {
    get(){ return state; },
    set(next){
      const prev = state;
      state = (typeof next === "function") ? next(state) : next;
      subs.forEach(fn => { try{ fn(state, prev); }catch(e){ pushDiag("error", "store sub error: "+(e&&e.message||e), {where:"store"}); } });
    },
    subscribe(fn){ subs.push(fn); return () => { const i = subs.indexOf(fn); if(i>=0) subs.splice(i,1); }; }
  };
}
/**
 * 生成唯一 id（时间戳 36 进制 + 5 位随机）
 * @returns {string}
 */
function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,7); }
function pad(n){ return String(n).padStart(2,"0"); }
function todayStr(){ const d=new Date(); return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate()); }
function shiftDay(n){ const d=new Date(); d.setDate(d.getDate()+n); return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate()); }
function esc(s){ return String(s===null||s===undefined?"":s).replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function sameDay(ts,y,m,d){ const t=new Date(ts); return t.getFullYear()===y&&t.getMonth()===m&&t.getDate()===d; }

