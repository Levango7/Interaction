// ===== Bootstrap (测试导出·__test) =====
// 门控：仅本地/测试上下文挂载约 100 个内部函数，线上（https 正式域名）不暴露内部 API。
// 命中条件：file://（Edge/Electron 本地形态）、localhost/127.0.0.1（本地服务 + jsdom 测试）、URL 显式带 __test=1。
var __TEST_GATE__ = (function(){
  try{
    if(typeof location === "undefined") return false;
    if(location.protocol === "file:") return true;
    if(location.hostname === "localhost" || location.hostname === "127.0.0.1") return true;
    return /[?&]__test=1/.test(location.search || "");
  }catch(e){ return false; }
})();
if (typeof window !== "undefined" && __TEST_GATE__) {
  window.__test = {
    execTool, migrate, runLinks, completeTask,
    getTasks, setTasks, getRec, setRec, getLinks,
    SCENARIOS, ORDER, TOOLS, DEFAULT_LINKS, PREFIX, MVP_SCOPE,
    todayStr, shiftDay, esc, uid, lineChartSVG, seed, sm2,
    encryptKey, decryptKey, initCrypto, getDeviceKey,
    base64Encode, base64Decode, persistCfg, getCfg, saveCfg, _resetCrypto,
    // P1-b 自动备份访问器（供测试驱动与断言）
    snapshotAutoBackup, scheduleAutoBackup, getAutoBackup, recoverAutoBackup,
    // P1-e 可观测性访问器（诊断缓冲 + 注入；scrub 保证 Key 不落诊断）
    pushDiag, getDiag,
    // P0-4 诊断寄存器访问器（只读快照 + 测试间复位）
    getCorrupted: () => _corrupted,
    resetCorrupted: () => { _corrupted = {}; _corruptWarned = false; },
    // A 习惯链可视化（streak / 热力图 / 行为分析 / 渲染）
    calcStreak, heatmapData, analyzeBehavior, renderHeatmap,
    fetchCoachAdvice, renderHabitChainStatus,
    // A 今日仪表盘 + B Onboarding 引导
    greeting, needsOnboarding, renderOnboarding,
    // 使用指南 modal
    renderHelp, helpSection,
    // 测试用场景切换访问器
    setActive, getActive, render,
    // 多 AI Profile 访问器（供测试驱动与断言）
    genProfileId, getActiveProfile, migrateProfiles,
    switchProfile, newProfile, dupProfile, delProfile,
    renderProfileSelect, fillProfileForm, openDrawer, closeDrawer,
    // T2.4 错误边界访问器（供测试驱动与断言）
    _backupBroken, _validateAndMigrateTasks, _validateCfg, _validateLinks,
    chatOnce, doExport,
    // T3.1 AI 增强（取消/重试/流式）访问器（供测试驱动与断言）
    abortChat, retryChat, createChatController, showChatThinking, runChatLoop,
    getChat, appendChat,
    // T1-T5 Quick Wins 增强（UI 软删 / 回收站批量与自动清理 / CSV·MD 导出 / 主题跟随系统 / 焦点陷阱）访问器
    restoreRecycleBatch, purgeRecycleBatch, getRecyclePolicy, setRecyclePolicy, cleanupRecycle,
    buildTasksCSV, buildTasksMD, doExportCSV, doExportMD, trapFocus, closeRecycleModal,
    // P5' 命令面板增强（模糊搜索 / 最近使用）访问器
    fuzzyScore, getCmdRecent, pushCmdRecent,
    // P1 自定义场景访问器（供测试驱动与断言）
    addCustomScenario, updateCustomScenario, removeCustomScenario,
    setBuiltinOverride, resetBuiltinOverride, loadCustomScenarios, registerCustomScenarios,
    // 第三轮：P8 多维筛选+保存视图 / P2' 习惯链有向图 / P9 稍后提醒+免打扰 访问器
    renderChainGraph, getGlobViews, saveGlobView, removeGlobView, _applyGlobFilters,
    snoozeTask, getQuietHours, setQuietHours, isQuietTime,
    // 第四轮 A1：任务编辑（UI 编辑与 AI update_task 共用的存储入口 + 编辑弹窗）
    updateTask, openTaskEdit, closeTaskEditModal,
    // 第四轮批次①：场景内联合筛选 + AI 确认弹窗关闭（ESC 链）
    applyBoardFilter, closeConfirmModal, doClear,
    // 第四轮批次②：看板拖拽排序 + 键盘操作（B4/B5）
    reorderTask, setupKanbanDnD, setupKanbanKeyboard,
    // 第四轮批次③：undo/redo 操作历史栈（B6）
    undoTasks, redoTasks, canUndo, canRedo, clearUndoStack,
    // 第四轮批次④：AI 请求参数（超时/温度）可配置（B8）
    getAiParams,
    // T2.3 轻量 store 访问器（供测试驱动与断言）
    createStore, taskStore, cfgStore, linkStore,
    // T3.5 Markdown 解析器（供测试驱动与断言）
    mdToHtml, escapeHtml: esc, safeUrl, inlineMd,
    // T3.2 习惯链 UI 编辑（自定义链 CRUD + 渲染辅助）
    getCustomLinks, saveCustomLinks, addCustomLink, removeCustomLink,
    updateCustomLink, toggleCustomLink, resetCustomLinks,
    renderLinksBox, _renderChainRow, _renderChainEditRow,
    // T3.3 数据统计（趋势/分布/链成功率/汇总指标 + 渲染）
    calcTrend, calcSceneDist, calcChainSuccess, calcStats,
    renderTrendChart, renderPieChart, renderStats,
    // T3.4 提醒通知（权限/到期检测/断链检测/每日 digest/调度器）
    getNotifyEnabled, setNotifyEnabled,
    checkDueTasks, markNotifiedIds,
    checkChainBreak, markChainBreakNotified,
    dailyDigestNotify, markDigestSent,
    runNotifyCheck, startNotifyScheduler, stopNotifyScheduler,
    // T4.2 骨架屏 + 空状态（纯 HTML 生成函数 + 加载包装器，供测试驱动与断言）
    renderSkeleton, renderEmpty, withSkeleton,
    // T4.3 移动端增强（手势方向计算 + 场景切换 + 移动端/横屏检测 + 横屏折叠）
    handleSwipe, swipeToScene, isMobile, isMobileLandscape, applyLandscapeFold,
    // T5.3 浏览器兼容（fallback 守卫函数 / 兼容性自检 / crypto warn 标记）
    notifySystem, dailyDigest,
    isAbortSupported: function(){ return (typeof AbortController !== "undefined" && typeof AbortSignal !== "undefined"); },
    isReadableStreamSupported: function(){ return (typeof ReadableStream !== "undefined"); },
    isCryptoReady: function(){ return _cryptoReady; },
    resetCryptoWarn: function(){ _cryptoWarned = false; },
    // 架构项① IndexedDB 持久镜像
    idbShouldMirror, idbOpen, idbMirrorKey, idbReadKey, idbDeleteKey,
    idbQueueMirror, idbFlushQueue, idbKeys, idbRestoreAll, idbMirrorAll,
    idbClearAll, initIdb, doIdbRestore,
    // 架构项② 渲染扩展（卡片注册 + 场景扩展区注册）
    registerCard, registerSceneSection, getSceneSections,
    renderSceneSections, bindSceneSections,
    // 第六轮 R5：工作记忆容量可配置
    getMemMax
  };
}
