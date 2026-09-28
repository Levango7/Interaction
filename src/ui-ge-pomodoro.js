// ===== UI Layer (交互层·全局事件绑定·专注与时间追踪) =====
// ===== Pomodoro Timer (v1.6-B) =====
/* ---------- v1.6-B 笃行：25 分钟专注 + 5 分钟休息 ----------
 * 能力：
 *   1) startPomodoro(taskId)  — 启动一轮专注（可选关联任务）
 *   2) stopPomodoro()         — 中止当前轮次（不计入完成数）
 *   3) getPomoState()         — 当前状态快照 {mode,remaining,taskId,count}
 *   4) getPomoCount()         — 今日已完成笃行数（按 YYYY-MM-DD 持久化）
 *
 * 设计约定：
 *   - 状态机：idle → focus → break → idle（专注结束自动进入休息，休息结束回 idle）
 *   - 持久化：每日笃行数按 _ymd(new Date()) 为键存 localStorage（PREFIX+"pomo_count"）
 *   - 通知：复用既有 toast()；专注/休息结束触发提醒
 *   - 计时：setInterval 1s 推进；jsdom 测试用 fake timers 推进
 *   - 所有颜色用 var(--token) CSS 令牌（lint-colors 门禁）
 *   - innerHTML 赋值用 sanitizeHtml 包裹
 */
const POMO_FOCUS_MIN = 25;
const POMO_BREAK_MIN = 5;
const _pomoState = { mode: "idle", remaining: 0, taskId: null, count: 0, timer: null };

/**
 * 启动一轮笃行专注（25 分钟）。仅在 idle 状态可启动；其他状态返回 false。
 * @param {string} [taskId] - 关联任务 id（可选，用于「为某任务专注」）
 * @returns {boolean} 是否成功启动
 */
function startPomodoro(taskId){
  if(_pomoState.mode !== "idle") return false;
  _pomoState.mode = "focus";
  _pomoState.remaining = POMO_FOCUS_MIN * 60;
  _pomoState.taskId = taskId || null;
  // 启动新一轮时把今日已完成数从存储读回，避免跨轮次累计丢失
  _pomoState.count = getPomoCount();
  _pomoState.timer = setInterval(_pomoTick, 1000);
  _pomoRender();
  return true;
}
/**
 * 内部：每秒推进笃行。专注结束 → 自动进入休息（count++ 并持久化）；
 * 休息结束 → 回到 idle 并提示开始新一轮。
 * @returns {void}
 */
function _pomoTick(){
  _pomoState.remaining--;
  if(_pomoState.remaining <= 0){
    if(_pomoState.mode === "focus"){
      _pomoState.count++;
      _savePomoCount();
      _pomoState.mode = "break";
      _pomoState.remaining = POMO_BREAK_MIN * 60;
      _pomoNotify(t("p5.focusDone", "专注完成！休息一下"), "ok");
    } else {
      _pomoState.mode = "idle";
      _pomoState.remaining = 0;
      if(_pomoState.timer){ clearInterval(_pomoState.timer); _pomoState.timer = null; }
      _pomoNotify(t("p5.breakDone", "休息结束，开始新一轮专注"), "ok");
    }
  }
  _pomoRender();
}
/**
 * 中止当前笃行轮次。不计入完成数；清除计时器并回到 idle。
 * @returns {void}
 */
function stopPomodoro(){
  if(_pomoState.timer){ clearInterval(_pomoState.timer); _pomoState.timer = null; }
  _pomoState.mode = "idle";
  _pomoState.remaining = 0;
  _pomoState.taskId = null;
  _pomoRender();
}
/**
 * 获取笃行当前状态快照（不暴露 timer 内部句柄）
 * @returns {{mode:string,remaining:number,taskId:(string|null),count:number}}
 */
function getPomoState(){
  return { mode: _pomoState.mode, remaining: _pomoState.remaining, taskId: _pomoState.taskId, count: _pomoState.count };
}
/**
 * 获取今日已完成笃行数（按 YYYY-MM-DD 分桶持久化）
 * @returns {number}
 */
function getPomoCount(){
  const today = _ymd(new Date());
  try{
    const d = JSON.parse(localStorage.getItem(PREFIX+"pomo_count") || "{}");
    return d[today] || 0;
  }catch(e){ return 0; }
}
/**
 * 内部：持久化今日笃行数到 localStorage
 * @returns {void}
 */
function _savePomoCount(){
  const today = _ymd(new Date());
  try{
    const d = JSON.parse(localStorage.getItem(PREFIX+"pomo_count") || "{}");
    d[today] = _pomoState.count;
    localStorage.setItem(PREFIX+"pomo_count", JSON.stringify(d));
  }catch(e){ /* localStorage 不可用时静默降级 */ }
}
/**
 * 内部：渲染笃行显示区（#pomoDisplay）。无 DOM 时 no-op（测试环境）
 * @returns {void}
 */
function _pomoRender(){
  const el = $("#pomoDisplay");
  if(!el) return;
  const min = Math.floor(_pomoState.remaining / 60);
  const sec = _pomoState.remaining % 60;
  const text = String(min).padStart(2, "0") + ":" + String(sec).padStart(2, "0");
  const label = _pomoState.mode === "focus" ? t("p5.focus", "专注") : (_pomoState.mode === "break" ? t("p5.break", "休息") : t("p5.idle", "空闲"));
  el.textContent = label + " " + text;
  // 更新今日计数显示
  const cntEl = $("#pomoCount");
  if(cntEl) cntEl.textContent = String(getPomoCount());
  // v1.9.7：同步侧栏「工具」组笃行入口的运行态徽标（运行中显示倒计时，空闲隐藏）
  const sideBadge = $("#sidePomoBadge");
  if(sideBadge){
    if(_pomoState.mode === "focus" || _pomoState.mode === "break"){
      sideBadge.textContent = text;
      sideBadge.style.display = "";
    }else{
      sideBadge.style.display = "none";
    }
  }
}
/**
 * 内部：通知（复用 toast；toast 不可用时 no-op）
 * @param {string} msg - 通知文案
 * @param {string} [type] - 通知类型
 * @returns {void}
 */
function _pomoNotify(msg, type){
  if(typeof toast === "function") toast(msg, type || "ok");
}// ===== Time Tracker (v1.6-B) =====
/* ---------- v1.6-B 时间追踪：每个任务记录实际耗时 ----------
 * 能力：
 *   1) startTracking(taskId)  — 开始为某任务计时（自动停止旧任务）
 *   2) pauseTracking()        — 暂停当前计时（保留累计耗时）
 *   3) resumeTracking()       — 恢复已暂停的计时
 *   4) stopTracking()         — 停止并保存累计耗时到 localStorage
 *   5) getTrackerState()      — 当前追踪状态快照
 *   6) getTaskTime(taskId)    — 读取某任务历史累计耗时（ms）
 *
 * 设计约定：
 *   - 单任务追踪：同一时刻只追踪一个任务；切换任务自动 stop 旧任务
 *   - 持久化：按 taskId 分桶存 localStorage（PREFIX+"task_time"），值为累计毫秒数
 *   - 计时：setInterval 1s 推进显示；暂停时停止 interval 但保留 elapsed
 *   - 显示：#trackerDisplay 元素显示 HH:MM:SS（无 DOM 时 no-op，测试环境友好）
 *   - 所有颜色用 var(--token) CSS 令牌（lint-colors 门禁）
 */
const _tracker = { taskId: null, startedAt: null, elapsed: 0, paused: false, timer: null };

/**
 * 开始为指定任务计时。若已有正在追踪的其他任务，先停止旧任务再启动新任务。
 * @param {string} taskId - 任务 id
 * @returns {boolean} 是否成功启动
 */
function startTracking(taskId){
  if(!taskId) return false;
  if(_tracker.taskId && _tracker.taskId !== taskId) stopTracking();
  _tracker.taskId = taskId;
  _tracker.startedAt = Date.now();
  _tracker.elapsed = _getTaskElapsed(taskId);
  _tracker.paused = false;
  if(_tracker.timer){ clearInterval(_tracker.timer); }
  _tracker.timer = setInterval(_trackTick, 1000);
  _trackTick(); // 立即渲染一次，避免首秒空白
  return true;
}
/**
 * 暂停当前任务计时。把已运行时长累加到 elapsed 并持久化；停止 interval。
 * @returns {boolean} 是否成功暂停
 */
function pauseTracking(){
  if(!_tracker.taskId || _tracker.paused) return false;
  _tracker.elapsed += Date.now() - _tracker.startedAt;
  _tracker.paused = true;
  if(_tracker.timer){ clearInterval(_tracker.timer); _tracker.timer = null; }
  _saveTaskElapsed(_tracker.taskId, _tracker.elapsed);
  _renderTrackerDisplay(_tracker.elapsed);
  return true;
}
/**
 * 恢复已暂停的任务计时。重置 startedAt 为当前时间并重启 interval。
 * @returns {boolean} 是否成功恢复
 */
function resumeTracking(){
  if(!_tracker.taskId || !_tracker.paused) return false;
  _tracker.paused = false;
  _tracker.startedAt = Date.now();
  _tracker.timer = setInterval(_trackTick, 1000);
  return true;
}
/**
 * 停止当前任务计时并保存累计耗时。若未暂停，先把运行时长累加到 elapsed。
 * @returns {boolean} 是否成功停止
 */
function stopTracking(){
  if(!_tracker.taskId) return false;
  if(!_tracker.paused) _tracker.elapsed += Date.now() - _tracker.startedAt;
  _saveTaskElapsed(_tracker.taskId, _tracker.elapsed);
  if(_tracker.timer){ clearInterval(_tracker.timer); _tracker.timer = null; }
  _tracker.taskId = null;
  _tracker.startedAt = null;
  _tracker.paused = false;
  _renderTrackerDisplay(0);
  return true;
}
/**
 * 内部：每秒推进追踪显示。当前总耗时 = elapsed + (now - startedAt)
 * @returns {void}
 */
function _trackTick(){
  if(!_tracker.taskId || _tracker.paused) return;
  const now = Date.now();
  const total = _tracker.elapsed + (now - _tracker.startedAt);
  _renderTrackerDisplay(total);
}
/**
 * 内部：渲染追踪显示区（#trackerDisplay）。格式 HH:MM:SS。无 DOM 时 no-op。
 * @param {number} ms - 毫秒数
 * @returns {void}
 */
function _renderTrackerDisplay(ms){
  const el = $("#trackerDisplay");
  if(!el) return;
  let s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600); s %= 3600;
  const m = Math.floor(s / 60); s %= 60;
  el.textContent = String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
  // v1.9.7：同步侧栏「工具」组时间追踪入口的运行态徽标（计时中显示 MM:SS，停止隐藏）
  const sideBadge = $("#sideTrackerBadge");
  if(sideBadge){
    if(ms > 0){
      const mm = h * 60 + m;
      sideBadge.textContent = (mm > 0 ? String(mm) : "<1") + t("p5.minute", "分");
      sideBadge.style.display = "";
    }else{
      sideBadge.style.display = "none";
    }
  }
}
/**
 * 内部：从 localStorage 读取某任务历史累计耗时
 * @param {string} taskId - 任务 id
 * @returns {number} 毫秒数（无记录返回 0）
 */
function _getTaskElapsed(taskId){
  try{
    const d = JSON.parse(localStorage.getItem(PREFIX+"task_time") || "{}");
    return d[taskId] || 0;
  }catch(e){ return 0; }
}
/**
 * 内部：把某任务累计耗时写入 localStorage
 * @param {string} taskId - 任务 id
 * @param {number} ms - 毫秒数
 * @returns {void}
 */
function _saveTaskElapsed(taskId, ms){
  try{
    const d = JSON.parse(localStorage.getItem(PREFIX+"task_time") || "{}");
    d[taskId] = ms;
    localStorage.setItem(PREFIX+"task_time", JSON.stringify(d));
  }catch(e){ /* localStorage 不可用时静默降级 */ }
}
/**
 * 获取追踪器当前状态快照（不暴露 timer 内部句柄）
 * @returns {{taskId:(string|null),startedAt:(number|null),elapsed:number,paused:boolean}}
 */
function getTrackerState(){
  return { taskId: _tracker.taskId, startedAt: _tracker.startedAt, elapsed: _tracker.elapsed, paused: _tracker.paused };
}
/**
 * 读取某任务历史累计耗时（ms）。供 UI 显示「已花费 X 小时」。
 * @param {string} taskId - 任务 id
 * @returns {number} 毫秒数
 */
function getTaskTime(taskId){
  return _getTaskElapsed(taskId);
}// ===== Calendar View (v1.6-B) =====
