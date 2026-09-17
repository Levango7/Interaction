// ===== Data Layer (数据层·读写) =====
/* ---------- 数据读写 ---------- */
/**
 * 读取全部任务（T2.3：经 taskStore 读取，保持向后兼容）
 * @returns {Task[]}
 */
function getTasks(){ return taskStore.get(); }
/**
 * 读取未删除（活跃）任务列表：在 getTasks() 基础上过滤软删除标记 deletedAt。
 * 仅用于「读取 / 渲染」场景；写入路径（create/complete/update 等）仍须使用原始 getTasks()，
 * 否则 setTasks 回写会丢失软删除任务（D3 防护）。
 * @returns {Task[]}
 */
function getActiveTasks(){ return taskStore.get().filter(t=>!t.deletedAt); }
/**
 * 写入全部任务并触发自动备份（T2.3：先更新 taskStore 再持久化，store 变更会防抖触发 render）
 * @param {Task[]} a
 */
function setTasks(a){
  _pushUndo(taskStore.get()); // B6：写入前记录变更前快照（undo/redo 恢复时 _undoGuard 跳过）
  taskStore.set(a); save(PREFIX+"tasks", a); scheduleAutoBackup();
}

/* ---------- B6：undo/redo 操作历史栈（任务数组快照式，上限 50） ---------- */
/* v3.7.12（解耦 S0）：注册「错题自动入 SM-2 复习」实现到 AppBridge。
   这段原先在 core 的 SCENE_FEATURE_BIND.exercise.onSave 里，但它要调 getRec/setRec（本块），
   导致核心层反向依赖 Data。现改为：core 只保留钩子调用，实现由本层在加载时注册。
   **实现逐字搬迁，行为不变**（含 typeof 守卫、字段顺序、截断长度）。 */
AppBridge.onExerciseSave = function(rec){
  if(Number(rec.correct) < 70 && rec.question){
    const tomorrow = (function(){ const d = new Date(); d.setDate(d.getDate()+1); return d.toISOString().slice(0,10); })();
    const study = (typeof getRec === "function" ? getRec("study") : []) || [];
    study.unshift({
      id: "sm2_" + (rec.id || uid()),
      title: t("study.errorReviewPrefix","错题复习：") + ((rec.subject ? rec.subject + " · " : "") + (rec.question || "")).slice(0, 40),
      type: t("study.materialType","学习资料"),
      status: t("study.statusNotReviewed","未复习"),
      nextReview: tomorrow,
      note: t("study.sourceExercisePrefix","来源练习题（正确率 ") + rec.correct + "%）：" + ((rec.explain || rec.answer || "")).slice(0, 200),
      created: Date.now()
    });
    setRec("study", study);
  }
};

let _undoStack = [];   // 历史快照（变更前的任务数组深拷贝）
let _redoStack = [];   // 重做栈
let _undoGuard = false; // 防重入：undo/redo 恢复时不再记录历史
const UNDO_LIMIT = 50;
/**
 * 记录一次任务变更前的快照（setTasks 调用方在写入前调用；内部自动防重入）
 * @param {Task[]} prev - 变更前的任务数组
 */
function _pushUndo(prev){
  if(_undoGuard) return;
  try{ _undoStack.push(JSON.stringify(prev)); }catch(e){ return; } // 序列化失败不阻塞业务
  if(_undoStack.length > UNDO_LIMIT) _undoStack.shift();
  _redoStack = []; // 新操作清空重做栈
}
/** 清空撤销/重做栈（导入/恢复/清空数据后调用，避免跨数据状态误撤销） */
function clearUndoStack(){ _undoStack = []; _redoStack = []; }
/** @returns {boolean} 是否可撤销 */
function canUndo(){ return _undoStack.length > 0; }
/** @returns {boolean} 是否可重做 */
function canRedo(){ return _redoStack.length > 0; }
/**
 * 撤销上一步任务操作：恢复最近的快照，当前状态入重做栈
 * @returns {boolean} 是否执行了撤销
 */
function undoTasks(){
  if(!_undoStack.length) return false;
  const snap = _undoStack.pop();
  let prev = null;
  try{ prev = JSON.parse(snap); }catch(e){ return false; }
  _undoGuard = true;
  try{
    _redoStack.push(JSON.stringify(getTasks()));
    setTasks(prev);
  }finally{ _undoGuard = false; }
  return true;
}
/**
 * 重做被撤销的任务操作
 * @returns {boolean} 是否执行了重做
 */
function redoTasks(){
  if(!_redoStack.length) return false;
  const snap = _redoStack.pop();
  let next = null;
  try{ next = JSON.parse(snap); }catch(e){ return false; }
  _undoGuard = true;
  try{
    _undoStack.push(JSON.stringify(getTasks()));
    setTasks(next);
  }finally{ _undoGuard = false; }
  return true;
}
/**
 * 更新指定任务的字段（A1：UI 编辑与 AI update_task 共用的存储入口）。
 * 仅允许白名单字段；title 为空串视为无效；status 走 completeTask 语义。
 * @param {string} id - 任务 id
 * @param {Object} patch - 待更新字段 {title?, due?, priority?, tags?, status?, note?}
 * @returns {boolean} 是否更新成功
 */
function updateTask(id, patch){
  if(!id || !patch) return false;
  const tasks = getTasks();
  const i = tasks.findIndex(t=>t.id===id && !t.deletedAt);
  if(i<0) return false;
  const t = tasks[i];
  if(patch.title!==undefined){
    const title = String(patch.title).trim();
    if(!title) return false;
    t.title = title;
  }
  if(patch.due!==undefined) t.due = patch.due;
  if(patch.priority!==undefined && ["","P0","P1","P2"].includes(patch.priority)) t.priority = patch.priority;
  if(Array.isArray(patch.tags)) t.tags = patch.tags.map(String).filter(Boolean);
  if(patch.note!==undefined) t.note = String(patch.note);
  if(patch.status && patch.status!==t.status){
    if(patch.status==="done"){ setTasks(tasks); return AppBridge.completeTask(id); }
    if(["todo","doing"].includes(patch.status)){ t.status=patch.status; t.doneAt=null; }
  }
  t.updatedAt = Date.now();
  setTasks(tasks);
  return true;
}
/**
 * 拖拽重排任务（B4）：把任务移动到 beforeId 之前；beforeId 为 null 时移到所在列末尾。
 * targetStatus 与当前状态不同时变更状态；拖入 done 列走 completeTask（触发场景联动）。
 * @param {string} id - 被拖任务 id
 * @param {string|null} beforeId - 目标位置前一张卡片 id（null=列末尾）
 * @param {string} [targetStatus] - 目标列状态 todo/doing/done
 * @returns {boolean} 是否重排成功
 */
function reorderTask(id, beforeId, targetStatus){
  if(!id) return false;
  const tasks = getTasks();
  const i = tasks.findIndex(t=>t.id===id && !t.deletedAt);
  if(i<0) return false;
  const t = tasks.splice(i,1)[0];
  if(targetStatus && targetStatus!==t.status && ["todo","doing"].includes(targetStatus)){
    t.status = targetStatus; t.doneAt = null;
  }
  let j = beforeId ? tasks.findIndex(x=>x.id===beforeId && !x.deletedAt) : -1;
  if(j<0) j = tasks.length;
  tasks.splice(j, 0, t);
  setTasks(tasks);
  if(targetStatus==="done" && t.status!=="done") return AppBridge.completeTask(id); // 完成态 + 联动
  return true;
}
/**
 * 读取指定场景的资料库记录
 * @param {string} sc - 场景键
 * @returns {Object[]}
 */
function getRec(sc){ return load(PREFIX+"rec_"+sc, []); }
/**
 * 写入指定场景的资料库记录并触发自动备份
 * @param {string} sc - 场景键
 * @param {Object[]} a - 记录数组
 * @returns {void}
 */
function setRec(sc, a){ save(PREFIX+"rec_"+sc, a); scheduleAutoBackup(); }

/* ---------- P1-b 自动备份（防抖快照，独立于手动导出） ---------- */
const AUTO_BACKUP_KEY = PREFIX + "autobackup";
const AUTO_BACKUP_GENS = [PREFIX + "autobackup.1", PREFIX + "autobackup.2"]; // v3.4.7 批次二（G3）：三代滚动——上一代/上上代
const AUTO_BACKUP_MAX_BYTES = 1.5 * 1024 * 1024; // 单条快照体积上限：业务数据异常膨胀时拒绝写入，防写爆配额
const AUTO_BACKUP_TOTAL_CEIL = 4 * 1024 * 1024;  // v3.4.7：三代总占用护栏（>4MB 时只保留 2 代，防逼近 5MB 配额）
let _autoBackupTimer = null;
let _autoBackupFailWarned = false; // 失败告警去重：同会话只提醒一次
function snapshotAutoBackup(){
  try{
    // v1.11.1 [C1] 修复：快照必须排除备份键自身——此前 allKeys() 含备份键本身，
    // 每次快照把上一份完整快照原样嵌入（JSON 转义使膨胀超线性），约二三十次写入
    // 即撞 5MB 配额，且 catch 静默吞错导致备份失效无感知、反噬主存储写入。
    const data = {};
    allKeys().forEach(k=>{ if(k === AUTO_BACKUP_KEY || AUTO_BACKUP_GENS.indexOf(k) >= 0) return; data[k] = localStorage.getItem(k); });
    data._ts = Date.now();
    const serialized = JSON.stringify(data);
    if(serialized.length > AUTO_BACKUP_MAX_BYTES){
      if(!_autoBackupFailWarned){
        _autoBackupFailWarned = true;
        if (typeof pushDiag === "function") pushDiag("error", t("backup.oversizeDiag", "自动备份快照超体积上限已跳过（业务数据可能异常膨胀）"), {where:"snapshotAutoBackup"});
        try{ toast(t("backup.pausedToast", "自动备份已暂停：数据体积异常增大，请检查或导出清理"), "warn"); }catch(e2){ /* toast 不可用时静默 */ }
      }
      return;
    }
    // v3.4.7 批次二（G3）：三代环形滚动——autobackup.2 ← autobackup.1 ← autobackup ← 新快照。
    // 此前单代覆盖写：数据先损坏后，下一次任何写入都会把"最后一份好快照"覆盖成损坏数据的
    // 快照，恢复入口只能回到最近一次（已损坏）。滚动后至少保留两代历史可回退。
    // 滚动只在快照序列化成功后发生（单代超限/异常不动旧代）。
    const prev = localStorage.getItem(AUTO_BACKUP_KEY);
    const prev2 = localStorage.getItem(AUTO_BACKUP_GENS[0]);
    // 4MB 护栏：三代合计逼近 5MB 配额时降级只保留 2 代（新 + 上一代），防备份反噬主存储
    const totalIf3 = serialized.length + (prev ? prev.length : 0) + (prev2 ? prev2.length : 0);
    if(totalIf3 <= AUTO_BACKUP_TOTAL_CEIL){
      if(prev2 !== null) localStorage.setItem(AUTO_BACKUP_GENS[1], prev2);
      if(prev !== null) localStorage.setItem(AUTO_BACKUP_GENS[0], prev);
    }else{
      if(prev !== null) localStorage.setItem(AUTO_BACKUP_GENS[0], prev);
      localStorage.removeItem(AUTO_BACKUP_GENS[1]); // 腾代：丢弃最老一代
    }
    localStorage.setItem(AUTO_BACKUP_KEY, serialized);
  }catch(e){
    // v1.11.1 [C1] 修复第 3 项：存储异常不再静默——接入诊断寄存器 + 一次性 toast，
    // 避免"备份机制已失效但用户无感知"（原有静默降级注释即审查报告 C1 的直接病灶）。
    if(!_autoBackupFailWarned){
      _autoBackupFailWarned = true;
      if (typeof pushDiag === "function") pushDiag("error", t("backup.failDiagPrefix", "自动备份写入失败: ")+(e&&e.message||e), {where:"snapshotAutoBackup"});
      try{ toast(t("backup.failToast", "自动备份写入失败：{err}").replace("{err}", (e&&e.message||t("backup.storageErr", "存储异常"))), "error"); }catch(e2){ /* toast 不可用时静默 */ }
    }
  }
}
function scheduleAutoBackup(){
  if(_autoBackupTimer) return; // 防抖：合并同一事件循环内的多次写入
  _autoBackupTimer = setTimeout(()=>{ _autoBackupTimer = null; snapshotAutoBackup(); }, 400);
}
function getAutoBackup(){ try{ return JSON.parse(localStorage.getItem(AUTO_BACKUP_KEY)||"null"); }catch(e){ return null; } }
/** v3.4.7 批次二（G3）：按代际取快照——gen 0=最新 / 1=上一代 / 2=上上代；损坏或缺失返回 null */
function getAutoBackupGen(gen){
  if(gen === 0) return getAutoBackup();
  try{ return JSON.parse(localStorage.getItem(AUTO_BACKUP_GENS[gen-1])||"null"); }catch(e){ return null; }
}
function recoverAutoBackup(){
  // v3.4.7 批次二（G3）：最新代损坏时自动回退上一代（此前只能拿到"最近一次（可能已损坏）"）
  let snap = getAutoBackupGen(0), usedGen = 0;
  if(!snap || typeof snap !== "object" || !snap._ts){
    snap = getAutoBackupGen(1);
    usedGen = 1;
    if(!snap || typeof snap !== "object" || !snap._ts){
      snap = getAutoBackupGen(2);
      usedGen = 2;
    }
  }
  if(!snap || typeof snap !== "object" || !snap._ts){ toast(t("backup.noneToast", "没有可用的自动备份"), "warn"); return false; }
  if(usedGen > 0){ try{ toast(t("backup.fallbackGenToast", "最新备份已损坏，已回退到第 {n} 上一代").replace("{n}", usedGen), "warn"); }catch(_e){ /* noop */ } }
  Object.keys(snap).forEach(k=>{ if(k==="_ts") return; localStorage.setItem(k, snap[k]); });
  _cfgCache = null; _deviceKey = null;
  clearUndoStack(); // B6：恢复备份后清空撤销栈，避免跨数据状态误撤销
  try{ initCrypto(); }catch(e){ /* 降级明文 */ }

  toast(t("backup.recoveredToast", "已从自动备份恢复（{time}）").replace("{time}", new Date(snap._ts||Date.now()).toLocaleString()), "ok");
  markDirty();
  return true;
}

/* ---------- v3.7.18（解耦 S5）：AI 配置读写归位到 Data 层 ----------
   原先在 ui-global-events（UI），被 render-overview 引用 → 逆层依赖。它本质是**配置读写**，
   与 save() 主入口同层。纯搬迁，不改一行实现。

   ✅ 已修复（v3.7.19）：saveAiConfig 走 save() 主入口，而 getAiConfig 此前直接读 localStorage，
      读路径绕过了写路径已收敛的那套机制（IDB 镜像/配额告警/损坏登记）→ 已统一走同一 store 的 load() 读入口。*/

/* ===== v3.2：AI 页面 8 子模块导航切换 + 独立配置保存 ===== */
function getAiConfig(module){
  /* v3.7.19（修复）：读路径与写路径统一。
     背景：saveAiConfig 走 save() 主入口（v3.4.7 收敛，注释称此前 setItem 会「绕过 IDB 镜像/配额告警/损坏登记」），
     而本函数此前**直接读 localStorage** → 读路径绕过了写路径已收敛的那套机制，
     可能出现「写进去了却读不到」（值经 IDB 镜像/降级路径写入时）。
     现改为走同一 store 的读入口 load()；缺失/损坏时仍返回 null（与旧行为对齐，防御性 try 保留）。 */
  try { return load(PREFIX + "ai_config_" + module, null); } catch(_e){ return null; }
}

function saveAiConfig(module, data){
  // v3.4.7 批次三（G5）：收编进 save() 主入口——此前裸 setItem 绕过 IDB 镜像/配额告警/损坏登记
  return save(PREFIX + "ai_config_" + module, data);
}
