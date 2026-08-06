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
function setTasks(a){ taskStore.set(a); save(PREFIX+"tasks", a); scheduleAutoBackup(); }
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

