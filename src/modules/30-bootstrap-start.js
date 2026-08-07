// ===== Bootstrap (启动) =====
/* ---------- 启动 ---------- */
// PWA Service Worker 注册（失败静默；jsdom/Electron 无 serviceWorker 时自动跳过）
if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
  navigator.serviceWorker.register("./service-worker.js").catch(function () { /* 静默失败 */ });
}
migrate();
seed();

(async function startup(){
  try{ await initCrypto(); }catch(e){ /* 降级明文，不阻塞启动 */ }
  // 架构项①：IndexedDB 持久镜像——启动时把 localStorage 用户数据镜像到 IDB（异步，不阻塞；仅镜像不自动恢复，恢复入口在设置页）
  initIdb().catch(() => {});
  cleanupRecycle(); // T2：启动时按策略清理回收站超期任务（off 时不动作）
  applyTheme();
  setupSideToggle(); // 侧边栏折叠按钮事件委托 + 恢复持久化折叠状态
  setupRipple(); // T4.3 底部导航点击涟漪效果（事件委托）
  setupMobileGestures(); // T4.3 移动端手势：左滑下一个/右滑上一个/右滑左边缘打开侧边栏（仅移动端启用）
  applyLandscapeFold(); // T4.3 移动端横屏自动折叠侧边栏
  // T4.3 横屏/竖屏切换时重新检测折叠状态
  if(typeof window !== "undefined"){
    window.addEventListener("resize", applyLandscapeFold);
    window.addEventListener("orientationchange", applyLandscapeFold);
  }
  // B4：首次启动引导（不阻塞主题；引导完成或不需要时走正常流程）
  if(needsOnboarding()){
    renderOnboarding();
  }else{
    render();
    checkCount();
    dailyDigest();
  }
  scheduleAutoBackup(); // 启动即留一份基线快照，确保 recover 始终有可还原点
  // T3.4 启动通知调度器：仅生产环境启动（jsdom 测试环境跳过，避免 setInterval 阻塞测试进程）
  if(getNotifyEnabled() && typeof navigator !== "undefined" && !/jsdom/i.test(navigator.userAgent)){
    startNotifyScheduler();
  }
})();
// P1-e 全局异常捕获：未捕获错误 / 未处理 Promise 拒绝统一入诊断缓冲（Key 已被 _scrub 脱敏）+ toast 提示
if (typeof window !== "undefined") {
  window.addEventListener("error", function(ev){
    const m = (ev && ev.error && ev.error.message) || (ev && ev.message) || "unknown";
    pushDiag("error", m, { where: "global", src: ev && ev.filename });
    try{ toast("发生错误："+m, "error"); }catch(e2){ /* toast 不可用时静默降级 */ }
    // 不阻止默认行为，让错误也出现在控制台
  });
  window.addEventListener("unhandledrejection", function(ev){
    const m = (ev && ev.reason && (ev.reason.message || ev.reason)) || "unknown";
    pushDiag("error", m, { where: "unhandledrejection" });
    try{ toast("异步错误："+m, "error"); }catch(e2){ /* toast 不可用时静默降级 */ }
  });
}
// 页面关闭/刷新前再补一份快照，覆盖启动后未触发写操作的场景
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", snapshotAutoBackup);
}

