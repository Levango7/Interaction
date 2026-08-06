// ===== UI Layer (交互层·每日播报) =====
/* ---------- 每日播报 ---------- */
// PWA 通知：优先用系统 Notification API（已授权时），否则 fallback 到 toast
function notifySystem(title, body){
  if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
    try { new Notification(title, { body: body || "", icon: "./icon.svg" }); return; } catch (e) { /* fallback 至 toast */ }
  }
  toast(title + (body ? "：" + body : ""), "warn");
}
function dailyDigest(){
  const last=localStorage.getItem(PREFIX+"last_open"); const today=todayStr();
  if(last===today) return;
  localStorage.setItem(PREFIX+"last_open", today);
  // 首次进入：请求通知权限（浏览器策略：仅用户手势后允许，这里静默尝试，失败无碍）
  if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
    try { Notification.requestPermission(); } catch (e) { /* 旧 API 回调式或拒绝，忽略 */ }
  }
  const items=getActiveTasks().filter(x=>x.status!=="done"&&x.due).sort((a,b)=>a.due<b.due?-1:1);
  const pending=items.filter(x=> x.due===today || x.due<today);
  if(!pending.length) return;
  const top=pending.slice(0,3).map(x=>"· "+x.title+(x.due<today?"（逾期）":"（今天）")).join("\n");
  notifySystem("每日播报：今日待处理 "+pending.length+" 项", top);
}

