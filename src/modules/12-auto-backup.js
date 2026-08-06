/* ---------- P1-b 自动备份（防抖快照，独立于手动导出） ---------- */
const AUTO_BACKUP_KEY = PREFIX + "autobackup";
let _autoBackupTimer = null;
function snapshotAutoBackup(){
  try{
    const data = {}; allKeys().forEach(k=> data[k] = localStorage.getItem(k));
    data._ts = Date.now();
    localStorage.setItem(AUTO_BACKUP_KEY, JSON.stringify(data));
  }catch(e){ /* 存储异常时静默降级，不阻塞业务写入 */ }
}
function scheduleAutoBackup(){
  if(_autoBackupTimer) return; // 防抖：合并同一事件循环内的多次写入
  _autoBackupTimer = setTimeout(()=>{ _autoBackupTimer = null; snapshotAutoBackup(); }, 400);
}
function getAutoBackup(){ try{ return JSON.parse(localStorage.getItem(AUTO_BACKUP_KEY)||"null"); }catch(e){ return null; } }
function recoverAutoBackup(){
  const snap = getAutoBackup();
  if(!snap){ toast("没有可用的自动备份", "warn"); return false; }
  Object.keys(snap).forEach(k=>{ if(k==="_ts") return; localStorage.setItem(k, snap[k]); });
  _cfgCache = null; _deviceKey = null;
  try{ initCrypto(); }catch(e){ /* 降级明文 */ }

  toast("已从自动备份恢复（"+new Date(snap._ts||Date.now()).toLocaleString()+"）", "ok");
  render();
  return true;
}
