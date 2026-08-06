/* ---------- T3.4 提醒通知（纯函数 + 调度器） ----------
 * 设计：checkDueTasks / checkChainBreak / dailyDigestNotify 为纯函数（读存储、不写存储、不调 Notification），
 *       返回需提醒列表；由 runNotifyCheck（调度器回调）决定如何展示（Notification 或 toast）并标记已提醒。
 * 存储键（不带 PREFIX，按任务契约）：
 *   wb_notify_enabled          boolean       通知总开关
 *   wb_notified_ids            string[]      已提醒到期任务 id（去重，每条只提醒一次）
 *   wb_chain_break_notified    string[]      断链已提醒标记，格式 "linkId|YYYY-MM-DD"（每条链每天只提醒一次）
 *   wb_digest_date             string        上次 digest 日期 YYYY-MM-DD（同一天不重复）
 */
const NOTIFY_KEY = "wb_notify_enabled";
const NOTIFY_IDS_KEY = "wb_notified_ids";
const CHAIN_BREAK_KEY = "wb_chain_break_notified";
const DIGEST_DATE_KEY = "wb_digest_date";
const NOTIFY_INTERVAL_MS = 60000; // 60s 检查一次

/**
 * 读取通知开关状态
 * @returns {boolean}
 */
function getNotifyEnabled(){
  return load(NOTIFY_KEY, false) === true;
}
/**
 * 设置通知开关；开启时请求 Notification 权限（浏览器策略：需用户手势，此处静默尝试）
 * @param {boolean} on
 * @returns {boolean} 实际写入的值
 */
function setNotifyEnabled(on){
  const v = !!on;
  save(NOTIFY_KEY, v);
  if(v && typeof window !== "undefined" && "Notification" in window){
    try{
      const p = Notification.requestPermission();
      if(p && typeof p.catch === "function") p.catch(function(){ /* 拒绝时静默降级到 toast */ });
    }catch(e){ /* 旧 API 回调式或无 Notification，忽略 */ }
  }
  return v;
}
/**
 * 把 due 日期字符串（YYYY-MM-DD）转成当天 00:00 的时间戳
 * @param {string} due
 * @returns {number}
 */
function _dueStartMs(due){
  const parts = String(due || "").split("-");
  if(parts.length !== 3) return NaN;
  return new Date(+parts[0], +parts[1] - 1, +parts[2], 0, 0, 0, 0).getTime();
}
/**
 * 检查到期任务：返回需提醒的任务列表（未完成、due <= 当前日期、未提醒过）
 * 纯函数：只读 wb_notified_ids 去重，不写存储、不调 Notification
 * @param {number} [now] - 当前时间戳（默认 Date.now()）
 * @returns {Array<{id:string,title:string,sc:string,due:string,msg:string}>}
 */
function checkDueTasks(now){
  const today = _ymd(new Date(now === undefined ? Date.now() : now));
  const tasks = getTasks();
  const notifiedIds = load(NOTIFY_IDS_KEY, []);
  return tasks.filter(t =>
    t && t.id && t.status !== "done" && !t.deletedAt && t.due &&
    !notifiedIds.includes(t.id) &&
    String(t.due) <= today
  ).map(t => ({
    id: t.id,
    title: t.title || "",
    sc: t.sc || "",
    due: t.due,
    msg: "任务到期：" + (t.title || "")
  }));
}
/**
 * 标记任务 id 为已提醒（写入 wb_notified_ids，去重）
 * @param {string[]} ids
 * @returns {string[]} 更新后的已提醒 id 数组
 */
function markNotifiedIds(ids){
  const cur = load(NOTIFY_IDS_KEY, []);
  let changed = false;
  (ids || []).forEach(function(id){
    if(id && !cur.includes(id)){ cur.push(id); changed = true; }
  });
  if(changed) save(NOTIFY_IDS_KEY, cur);
  return cur;
}
/**
 * 检查习惯链断链：源场景最近 3 天（含今天）无完成任务则视为断裂
 * 纯函数：只读 wb_chain_break_notified 去重，不写存储、不调 Notification
 * @param {number} [now] - 当前时间戳（默认 Date.now()）
 * @returns {Array<{id:string,fromSc:string,toSc:string,msg:string}>}
 */
function checkChainBreak(now){
  const d = new Date(now === undefined ? Date.now() : now);
  const today = _ymd(d);
  // 3 天窗口：今天 + 昨天 + 前天，阈值取前天 00:00
  const winStart = new Date(d);
  winStart.setHours(0, 0, 0, 0);
  winStart.setDate(winStart.getDate() - 2);
  const thresholdMs = winStart.getTime();
  const notified = load(CHAIN_BREAK_KEY, []);
  const links = getLinks().filter(l => l && l.id && l.enabled !== false);
  const tasks = getTasks();
  return links.map(l => {
    const recentDone = tasks.filter(t =>
      t && t.sc === l.fromSc && t.status === "done" && t.doneAt && t.doneAt >= thresholdMs
    );
    if(recentDone.length > 0) return null; // 最近 3 天有完成，不断链
    const key = l.id + "|" + today;
    if(notified.includes(key)) return null; // 今天已提醒过该链
    const fromName = (SCENARIOS[l.fromSc] && SCENARIOS[l.fromSc].name) || l.fromSc;
    const toName = (SCENARIOS[l.toSc] && SCENARIOS[l.toSc].name) || l.toSc;
    return {
      id: l.id,
      fromSc: l.fromSc,
      toSc: l.toSc,
      msg: "习惯链可能断裂：" + fromName + "→" + toName + " 已 3 天未触发"
    };
  }).filter(Boolean);
}
/**
 * 标记断链已提醒（写入 wb_chain_break_notified，含日期标记，每条链每天只提醒一次）
 * @param {string[]} ids - 链 id 数组
 * @param {string} [today] - 当前日期 YYYY-MM-DD（默认 todayStr()）
 * @returns {string[]} 更新后的标记数组
 */
function markChainBreakNotified(ids, today){
  const day = today || todayStr();
  const cur = load(CHAIN_BREAK_KEY, []);
  let changed = false;
  (ids || []).forEach(function(id){
    const key = id + "|" + day;
    if(!cur.includes(key)){ cur.push(key); changed = true; }
  });
  if(changed) save(CHAIN_BREAK_KEY, cur);
  return cur;
}
/**
 * 每日 digest：今日有到期任务时返回汇总消息
 * 纯函数：只读 wb_digest_date 判断同一天是否已发，不写存储、不调 Notification
 * @param {number} [now] - 当前时间戳（默认 Date.now()）
 * @returns {{count:number,msg:string,ids:string[]}|null} null 表示不触发（同一天已发或无到期任务）
 */
function dailyDigestNotify(now){
  const today = _ymd(new Date(now === undefined ? Date.now() : now));
  const lastDate = load(DIGEST_DATE_KEY, "");
  if(lastDate === today) return null; // 同一天不重复
  const tasks = getTasks();
  const dueToday = tasks.filter(t =>
    t && t.id && t.status !== "done" && !t.deletedAt && t.due === today
  );
  if(dueToday.length === 0) return null; // 今日无到期任务
  return {
    count: dueToday.length,
    msg: "今日 " + dueToday.length + " 件事待办",
    ids: dueToday.map(t => t.id)
  };
}
/**
 * 标记 digest 已发送（写入 wb_digest_date）
 * @param {string} [today] - 当前日期 YYYY-MM-DD（默认 todayStr()）
 * @returns {void}
 */
function markDigestSent(today){
  save(DIGEST_DATE_KEY, today || todayStr());
}
/**
 * 执行一次通知检查：到期任务 + 断链 + 每日 digest。
 * 副作用函数：调用 notifySystem 展示，并标记已提醒。未开启通知时直接返回。
 * @returns {{due:number,breaks:number,digest:boolean}} 触发计数
 */
function runNotifyCheck(){
  const stats = { due: 0, breaks: 0, digest: false };
  if(!getNotifyEnabled()) return stats;
  const now = Date.now();
  // 1. 到期任务
  const due = checkDueTasks(now);
  if(due.length){
    due.forEach(d => { try{ notifySystem(d.msg, ""); }catch(e){ pushDiag("error", "notify due: "+(e&&e.message||e), {where:"notify"}); } });
    markNotifiedIds(due.map(d => d.id));
    stats.due = due.length;
  }
  // 2. 断链
  const breaks = checkChainBreak(now);
  if(breaks.length){
    breaks.forEach(b => { try{ notifySystem(b.msg, ""); }catch(e){ pushDiag("error", "notify chain: "+(e&&e.message||e), {where:"notify"}); } });
    markChainBreakNotified(breaks.map(b => b.id), todayStr());
    stats.breaks = breaks.length;
  }
  // 3. 每日 digest
  const dig = dailyDigestNotify(now);
  if(dig){
    try{ notifySystem(dig.msg, ""); }catch(e){ pushDiag("error", "notify digest: "+(e&&e.message||e), {where:"notify"}); }
    markDigestSent(todayStr());
    stats.digest = true;
  }
  return stats;
}
/**
 * 启动通知调度器（setInterval 每 60s 检查一次）。重复调用幂等。
 * @returns {number|null} timer id
 */
let _notifyTimer = null;
function startNotifyScheduler(){
  if(_notifyTimer) return _notifyTimer;
  _notifyTimer = setInterval(function(){
    try{ runNotifyCheck(); }catch(e){ pushDiag("error", "notify tick: "+(e&&e.message||e), {where:"notify"}); }
  }, NOTIFY_INTERVAL_MS);
  return _notifyTimer;
}
/**
 * 停止通知调度器
 * @returns {void}
 */
function stopNotifyScheduler(){
  if(_notifyTimer){ clearInterval(_notifyTimer); _notifyTimer = null; }
}

