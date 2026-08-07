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
    if(patch.status==="done"){ setTasks(tasks); return completeTask(id); }
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
  if(targetStatus==="done" && t.status!=="done") return completeTask(id); // 完成态 + 联动
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

