// ===== Data Layer (数据层·迁移与初始化) =====
/* ---------- 初始化 + 迁移 ---------- */
/* v1.4-C 迁移日志：记录每次迁移操作（最多 50 条，溢出裁剪旧条目） */
function _pushMigrationLog(entry){
  try{
    const log = load(PREFIX + "migrationLog", []);
    log.push(Object.assign({ ts: Date.now() }, entry));
    if(log.length > 50) log.splice(0, log.length - 50);
    save(PREFIX + "migrationLog", log);
  }catch(e){ /* 静默，不阻塞迁移 */ }
}
/* v1.4-C 读取迁移日志（只读快照，供 UI/测试查看） */
function getMigrationLog(){
  try { return load(PREFIX + "migrationLog", []); } catch(e){ return []; }
}
/* 损坏数据备份：把不可识别的原始串存到独立键，便于事后恢复（不丢用户数据） */
function _backupBroken(kind, raw){
  try{
    const k = PREFIX + kind + "_broken_" + Date.now();
    localStorage.setItem(k, String(raw));
  }catch(e){ /* 备份失败不阻塞重置 */ }
}
/* v1.4-C 检测旧版本任务：缺少 updatedAt 字段、缺少 due/priority/note 等较新字段
 * 返回需要补全的字段列表（空数组表示已是新格式） */
function _detectLegacyTask(t){
  const missing = [];
  if(t.updatedAt === undefined) missing.push("updatedAt");
  if(t.due === undefined) missing.push("due");
  if(t.priority === undefined) missing.push("priority");
  if(t.note === undefined) missing.push("note");
  return missing;
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
    try{ toast(t("migrate.tasksAbnormal", "任务数据格式异常，已备份原值并重置为空。"), "warn"); }catch(e2){}
    return;
  }
  // 数组：字段补全（id/sc/title/status/doneAt/tags）
  let changed=false;
  let legacyCount=0;
  const legacyFieldsSeen = new Set();
  const _t = t; // 保存 i18n t() 引用，避免被 forEach 参数遮蔽
  tasks.forEach(t=>{
    if(!t || typeof t !== "object") return; // 跳过非对象项，不强制重构（避免破坏未知结构）
    if(t.id===undefined){ t.id=uid(); changed=true; }
    if(t.sc===undefined || !ORDER.includes(t.sc)){ t.sc="office"; changed=true; }
    if(t.title===undefined){ t.title=_t("task.untitled", "(无标题)"); changed=true; }
    if(t.status===undefined){ t.status = t.done?"done":"todo"; changed=true; }
    if(t.doneAt===undefined){ t.doneAt = t.status==="done"? (t.created||Date.now()) : null; changed=true; }
    if(t.tags===undefined){ t.tags = []; changed=true; }
    // v1.4-C 旧版本字段检测（due/priority/note/updatedAt）：仅记录日志，不强制补全
    // （非关键字段缺失不会导致渲染崩溃，代码有 || "" 兜底；保持向后兼容，不破坏现有测试）
    const missing = _detectLegacyTask(t);
    if(missing.length){
      legacyCount++;
      missing.forEach(f => legacyFieldsSeen.add(f));
    }
  });
  if(changed) save(PREFIX+"tasks", tasks);
  // v1.4-C 迁移日志：仅在确有旧数据时记录
  if(legacyCount > 0){
    _pushMigrationLog({
      type: "tasks-legacy-detected",
      count: legacyCount,
      fields: Array.from(legacyFieldsSeen)
    });
  }
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
    try{ toast(t("migrate.cfgAbnormal", "配置数据格式异常，已备份原值并重置。"), "warn"); }catch(e2){}
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
    try{ toast(t("migrate.linksAbnormal", "联动规则数据格式异常，已备份原值并重置为默认。"), "warn"); }catch(e2){}
  }
}
/* v1.4-C 检测旧版本数据：扫描全部 PREFIX 键，统计缺少 updatedAt 的任务数 / 缺字段的记录数
 * 返回 { legacyTasks, legacyRecs, totalKeys, details } */
function detectLegacyData(){
  const result = { legacyTasks: 0, legacyRecs: 0, totalKeys: 0, details: [] };
  try {
    const tasksRaw = localStorage.getItem(PREFIX + "tasks");
    if(tasksRaw){
      const tasks = JSON.parse(tasksRaw);
      if(Array.isArray(tasks)){
        tasks.forEach(t => {
          if(t && typeof t === "object" && _detectLegacyTask(t).length) result.legacyTasks++;
        });
      }
    }
  } catch(e){ /* 损坏由 _validateAndMigrateTasks 处理 */ }
  // 记录键扫描
  ORDER.forEach(sc => {
    try {
      const recsRaw = localStorage.getItem(PREFIX + "rec_" + sc);
      if(recsRaw){
        const recs = JSON.parse(recsRaw);
        if(Array.isArray(recs)){
          recs.forEach(r => {
            if(r && typeof r === "object" && (r.id === undefined || r.created === undefined)) result.legacyRecs++;
          });
        }
      }
    } catch(e){ /* 跳过损坏键 */ }
  });
  result.totalKeys = allKeys().length;
  if(result.legacyTasks > 0) result.details.push(t("migrate.tasksDetail", "tasks: {count} 条缺少新字段").replace("{count}", result.legacyTasks));
  if(result.legacyRecs > 0) result.details.push(t("migrate.recsDetail", "recs: {count} 条缺少 id/created").replace("{count}", result.legacyRecs));
  return result;
}
/**
 * v3.4.7 批次一（存储评估 G4）：通用业务 key 损坏防护
 * 此前 migrate() 只覆盖 tasks/cfg/links 三个 key；其余业务 key（rec_*、chat_*、
 * ai_sessions、notes、rag_docs、wb_conversations、回收站等）在各自 load 处 catch
 * 后直接返回空数组——一次 JSON 截断（配额边缘写半截）即静默丢整场景数据且不可恢复。
 * 本守卫：逐 key 校验，语法错或非数组 → 备份原值到 wb_agent_broken_<key>_<ts>
 * （与 _backupBroken 同模式）+ 诊断登记，然后重置为空数组（下游 load 兜底即安全）。
 * @returns {void}
 */
function _guardGenericJsonKeys(){
  const keys = [];
  ORDER.forEach(function(sc){ keys.push(PREFIX+"rec_"+sc, PREFIX+"chat_"+sc); }); // 场景记录/聊天（动态生成）
  [ "ai_sessions", "notes", "rag_docs", "wb_conversations", "wb_long_term_memory", "recycle_bin", "migrationLog" ]
    .forEach(function(k){ keys.push(PREFIX + k); });
  keys.forEach(function(k){
    if(k.indexOf("_broken_") >= 0) return; // 备份键自身不二次守卫（残值已存档）
    let raw;
    try{ raw = localStorage.getItem(k); }catch(_e){ return; }
    if(raw === null || raw === undefined) return; // 无数据不处理
    let parsed;
    try{ parsed = JSON.parse(raw); }
    catch(_e){
      _brokenBackup(k, raw, "syntax");
      return;
    }
    if(!Array.isArray(parsed)) _brokenBackup(k, raw, "shape"); // 合法 JSON 但非数组（键值对型对象除外——排除非数组语义键）
  });
}
/** 损坏原值备份 + 重置 + 诊断登记（_guardGenericJsonKeys 专用，与 _backupBroken 同模式） */
function _brokenBackup(key, raw, kind){
  const ts = Date.now();
  try{
    localStorage.setItem(key + "_broken_" + ts, raw);
    localStorage.setItem(key, "[]");
  }catch(_e){ /* 备份写失败时不重置（宁可保持损坏原值待人工恢复，也不无备份清除） */ return; }
  try{ pushDiag("error", "corrupted key backed up: " + key + " (" + kind + ")", { where: "_guardGenericJsonKeys" }); }catch(_e2){}
}
function migrate(){
  try{
    const before = detectLegacyData();
    _validateAndMigrateTasks();
    _validateCfg();
    _validateLinks();
    _guardGenericJsonKeys(); // v3.4.7 批次一（G4）：其余业务 key 损坏防护——语法错/非数组先备份原值再重置，防静默丢数据
    // 多 AI Profile 迁移：旧 cfg {base,key,model,...} → cfg {profiles:[{...}], activeId}
    migrateProfiles();
    // v1.4-C 迁移日志：整体迁移摘要（仅在确有旧数据时记录）
    if(before.legacyTasks > 0 || before.legacyRecs > 0){
      _pushMigrationLog({
        type: "migrate-summary",
        before: { legacyTasks: before.legacyTasks, legacyRecs: before.legacyRecs, totalKeys: before.totalKeys }
      });
    }
  }catch(e){
    pushDiag("error", "migrate error: "+(e&&e.message||e), {where:"migrate"});
    try{ toast(t("migrate.errorToast", "数据迁移异常：{err}").replace("{err}", (e&&e.message||t("tool.unknownErrorMsg", "未知错误"))), "error"); }catch(e2){ /* toast 不可用时静默降级 */ }
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
  const profile = { id, name: t("profile.default", "默认"), base: raw.base || "", key: raw.key || "", model: raw.model || "" };
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
    return { id: "__legacy__", name: t("profile.default", "默认"), base: cfg.base || "", key: cfg.key || "", model: cfg.model || "" };
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
    {id:uid(), sc:"office", title:t("seed.task1", "提交本周周报"), due:shiftDay(0), priority:"P1", status:"todo", doneAt:null, note:"", tags:["周报"], created:Date.now()},
    {id:uid(), sc:"code",   title:t("seed.task2", "修复登录页 500 报错"), due:shiftDay(-2), priority:"P0", status:"todo", doneAt:null, note:"", tags:[], created:Date.now()},
    {id:uid(), sc:"study",  title:t("seed.task3", "复习分布式事务"), due:shiftDay(3), priority:"P1", status:"done", doneAt:Date.now()-86400000*2, note:"", tags:[], created:Date.now()},
    {id:uid(), sc:"life",   title:t("seed.task4", "缴水电费"), due:shiftDay(2), priority:"P2", status:"todo", doneAt:null, note:"", tags:["缴费"], created:Date.now()}
  ];
  save(PREFIX+"tasks", tasks);
  save(PREFIX+"rec_office", [{id:uid(),title:t("seed.rec1.title", "需求评审会"),who:t("seed.rec1.who", "产品/研发/测试"),note:t("seed.rec1.note", "确认 v2.3 范围，周三前出排期"),created:Date.now()}]);
  save(PREFIX+"rec_code", [{id:uid(),title:t("seed.rec2.title", "防抖函数"),lang:"JS",code:t("seed.rec2.code", "function debounce(fn,d){let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>fn(...a),d);};}"),created:Date.now()}]);
  save(PREFIX+"rec_study", [{id:uid(),title:t("seed.rec3.title", "Raft 共识算法"),type:t("seed.rec3.type", "论文"),status:"在读",note:t("seed.rec3.note", "重点看 leader 选举与日志复制"),created:Date.now()}]);
  save(PREFIX+"rec_life", [{id:uid(),title:t("seed.rec4.title", "周末采买清单"),cat:t("seed.rec4.cat", "购物"),note:t("seed.rec4.note", "牛奶、鸡蛋、水果、洗衣液"),created:Date.now()}]);
  save(PREFIX+"init", true);
}
