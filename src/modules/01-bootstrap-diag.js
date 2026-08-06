// ===== Bootstrap (诊断基础设施·跨层) =====
// 损坏数据诊断寄存器：键为 k，值为原始串（供未来「导出恢复」/ 诊断使用）
let _corrupted = {};
let _corruptWarned = false; // 一次性告警标志：多个 key 同时损坏时只提示一次，避免刷屏

// P1-e 全局诊断缓冲（内存环形缓冲，不落盘、不持久化 Key）：捕获全局异常与对话链路错误
const _diagLog = [];
const DIAG_MAX = 100;
function _scrub(s){
  if(typeof s !== "string") return s;
  // 去除疑似密钥的长令牌（>=24 位字母数字/+/=），保护 P0-3/P0-5（Key 不进日志/不传网络明文）
  return s.replace(/[A-Za-z0-9+/=]{24,}/g, "[REDACTED]");
}
function pushDiag(level, msg, ctx){
  try{
    _diagLog.push({ t: Date.now(), level, msg: _scrub(String(msg)), ctx: ctx || null });
    if(_diagLog.length > DIAG_MAX) _diagLog.shift(); // 环形缓冲，避免内存无限增长
  }catch(e){ /* 诊断自身失败绝不能影响业务 */ }
}
function getDiag(){ return _diagLog.slice(); }

