// ===== Data Layer (数据层·迁移与初始化) =====
/* ---------- 初始化 + 迁移 ---------- */
/* 损坏数据备份：把不可识别的原始串存到独立键，便于事后恢复（不丢用户数据） */
function _backupBroken(kind, raw){
  try{
    const k = PREFIX + kind + "_broken_" + Date.now();
    localStorage.setItem(k, String(raw));
  }catch(e){ /* 备份失败不阻塞重置 */ }
}
/* schema 校验 + 字段补全：tasks 必须是数组；每条 task 必须有 id/sc/title/status 等核心字段 */
function _validateAndMigrateTasks(){
  const raw = localStorage.getItem(PREFIX+"tasks");
  if(raw === null) return; // 无数据，跳过
  let tasks = null;
  try{ tasks = JSON.parse(raw); }catch(e){ tasks = null; }
  if(tasks === null){
    // JSON 语法错误：load 已登记到 _corrupted，这里仅登记不重置（保留原值供恢复，P0-4 契约）
    try{ _corrupted[PREFIX+"tasks"] = raw; }catch(e){}
    return;
  }
  if(!Array.isArray(tasks)){
    // 合法 JSON 但非数组（schema 不对）：备份 + 重置
    _backupBroken("tasks", raw);
    save(PREFIX+"tasks", []);
    try{ toast("任务数据格式异常，已备份原值并重置为空。", "warn"); }catch(e2){}
    return;
  }
  // 数组：字段补全（id/sc/title/status/doneAt/tags）
  let changed=false;
  tasks.forEach(t=>{
    if(!t || typeof t !== "object") return; // 跳过非对象项，不强制重构（避免破坏未知结构）
    if(t.id===undefined){ t.id=uid(); changed=true; }
    if(t.sc===undefined || !ORDER.includes(t.sc)){ t.sc="office"; changed=true; }
    if(t.title===undefined){ t.title="(无标题)"; changed=true; }
    if(t.status===undefined){ t.status = t.done?"done":"todo"; changed=true; }
    if(t.doneAt===undefined){ t.doneAt = t.status==="done"? (t.created||Date.now()) : null; changed=true; }
    if(t.tags===undefined){ t.tags = []; changed=true; }
  });
  if(changed) save(PREFIX+"tasks", tasks);
}
/* schema 校验：cfg 必须是对象（非数组） */
function _validateCfg(){
  const raw = localStorage.getItem(PREFIX+"cfg");
  if(raw === null) return;
  let cfg = null;
  try{ cfg = JSON.parse(raw); }catch(e){ cfg = null; }
  if(cfg === null){
    try{ _corrupted[PREFIX+"cfg"] = raw; }catch(e){}
    return;
  }
  if(typeof cfg !== "object" || Array.isArray(cfg)){
    _backupBroken("cfg", raw);
    save(PREFIX+"cfg", {});
    try{ toast("配置数据格式异常，已备份原值并重置。", "warn"); }catch(e2){}
  }
}
/* schema 校验：links 必须是数组 */
function _validateLinks(){
  const raw = localStorage.getItem(PREFIX+"links");
  if(raw === null) return;
  let links = null;
  try{ links = JSON.parse(raw); }catch(e){ links = null; }
  if(links === null){
    try{ _corrupted[PREFIX+"links"] = raw; }catch(e){}
    return;
  }
  if(!Array.isArray(links)){
    _backupBroken("links", raw);
    save(PREFIX+"links", DEFAULT_LINKS.slice());
    try{ toast("联动规则数据格式异常，已备份原值并重置为默认。", "warn"); }catch(e2){}
  }
}
/**
 * 数据迁移入口：tasks/cfg/links schema 校验 + 多 Profile 迁移
 * @returns {void}
 */
function migrate(){
  try{
    _validateAndMigrateTasks();
    _validateCfg();
    _validateLinks();
    // 多 AI Profile 迁移：旧 cfg {base,key,model,...} → cfg {profiles:[{...}], activeId}
    migrateProfiles();
  }catch(e){
    pushDiag("error", "migrate error: "+(e&&e.message||e), {where:"migrate"});
    try{ toast("数据迁移异常："+(e&&e.message||"未知错误"), "error"); }catch(e2){ /* toast 不可用时静默降级 */ }
  }
}
/* 生成 profile id（独立于 uid，避免与任务 id 混淆，且符合任务要求格式） */
function genProfileId(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,6); }
/* 多 Profile 迁移：把旧单 cfg 转为 profiles 数组。仅在 raw cfg 有 base/key/model 但无 profiles 时执行。
 * 读取 localStorage 原始 cfg（不经过 _cfgCache，避免污染内存明文 Key），写回 profiles + activeId。
 * 注意：迁移保留原 key 字段（可能是加密对象或明文），由 initCrypto 后续解密流程统一处理。 */
function migrateProfiles(){
  const raw = load(PREFIX+"cfg", null);
  if(!raw) return;
  if(Array.isArray(raw.profiles)) return; // 已是新格式
  if(raw.base===undefined && raw.key===undefined && raw.model===undefined) return; // 无旧字段
  const id = genProfileId();
  const profile = { id, name: "默认", base: raw.base || "", key: raw.key || "", model: raw.model || "" };
  const next = Object.assign({}, raw, { profiles: [profile], activeId: id });
  delete next.base; delete next.key; delete next.model;
  save(PREFIX+"cfg", next);
}
/* 返回当前激活的 AI Profile；无 profile 时返回 null。
 * 兼容性：若 cfg 仍是旧格式（理论已被 migrate 转换，但 initCrypto 前可能命中），按旧字段构造临时 profile。
 * @returns {AIProfile|null}
 */
function getActiveProfile(){
  const cfg = getCfg();
  if(cfg && Array.isArray(cfg.profiles) && cfg.profiles.length){
    return cfg.profiles.find(p => p.id === cfg.activeId) || cfg.profiles[0];
  }
  // 旧格式兼容（迁移前 / 损坏存储）：用旧字段构造临时 profile，不持久化
  if(cfg && (cfg.base || cfg.key || cfg.model)){
    return { id: "__legacy__", name: "默认", base: cfg.base || "", key: cfg.key || "", model: cfg.model || "" };
  }
  return null;
}
/**
 * 首次启动播种示例数据（仅在从未初始化且无既有 tasks 时执行）
 * @returns {void}
 */
function seed(){
  // 仅在「从未初始化且无既有 tasks」时播种：保护已存在（含损坏但尚可恢复）的 tasks 不被覆盖
  if(load(PREFIX+"init", false) || localStorage.getItem(PREFIX+"tasks") !== null) return;
  const tasks = [
    {id:uid(), sc:"office", title:"提交本周周报", due:shiftDay(0), priority:"P1", status:"todo", doneAt:null, note:"", tags:["周报"], created:Date.now()},
    {id:uid(), sc:"code",   title:"修复登录页 500 报错", due:shiftDay(-2), priority:"P0", status:"todo", doneAt:null, note:"", tags:[], created:Date.now()},
    {id:uid(), sc:"study",  title:"复习分布式事务", due:shiftDay(3), priority:"P1", status:"done", doneAt:Date.now()-86400000*2, note:"", tags:[], created:Date.now()},
    {id:uid(), sc:"life",   title:"缴水电费", due:shiftDay(2), priority:"P2", status:"todo", doneAt:null, note:"", tags:["缴费"], created:Date.now()}
  ];
  save(PREFIX+"tasks", tasks);
  save(PREFIX+"rec_office", [{id:uid(),title:"需求评审会",who:"产品/研发/测试",note:"确认 v2.3 范围，周三前出排期",created:Date.now()}]);
  save(PREFIX+"rec_code", [{id:uid(),title:"防抖函数",lang:"JS",code:"function debounce(fn,d){let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>fn(...a),d);};}",created:Date.now()}]);
  save(PREFIX+"rec_study", [{id:uid(),title:"Raft 共识算法",type:"论文",status:"在读",note:"重点看 leader 选举与日志复制",created:Date.now()}]);
  save(PREFIX+"rec_life", [{id:uid(),title:"周末采买清单",cat:"购物",note:"牛奶、鸡蛋、水果、洗衣液",created:Date.now()}]);
  save(PREFIX+"init", true);
}

