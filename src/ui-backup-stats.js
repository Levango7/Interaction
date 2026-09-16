// ===== UI Layer (交互层·备份与统计) =====
/* ---------- 备份 / 统计 ---------- */
function allKeys(){ try{ return Object.keys(localStorage).filter(k=>k.startsWith(PREFIX) || k===CUSTOM_LINKS_KEY); }catch(e){ return []; } }
async function doExport(){
  // Helper: base64 encode Uint8Array
  const toBase64 = (buf)=>{
    let binary = '';
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  };

  // Helper: encrypt data with password using PBKDF2 + AES-GCM
  const encryptData = async (plainObj, password)=>{
    const enc = new TextEncoder();
    const dataStr = JSON.stringify(plainObj);
    const pwKey = await crypto.subtle.importKey('raw', enc.encode(password), {name:'PBKDF2'}, false, ['deriveKey']);
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const aesKey = await crypto.subtle.deriveKey({name:'PBKDF2', salt, iterations:210000, hash:'SHA-256'}, pwKey, {name:'AES-GCM', length:256}, false, ['encrypt','decrypt']);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const cipherBuf = await crypto.subtle.encrypt({name:'AES-GCM', iv}, aesKey, enc.encode(dataStr));
    return {encrypted:true, iv:toBase64(iv), ciphertext:toBase64(cipherBuf), salt:toBase64(salt)};
  };

  const data = {}; allKeys().forEach(k=>{ try{ data[k]=localStorage.getItem(k); }catch(e){ /* 静默降级 */ } });
  // v1.4-C 多设备同步：写入设备标识 + 导出时间戳 + 版本
  data["_deviceMeta"] = {
    deviceId: getDeviceId(),
    exportedAt: Date.now(),
    version: VERSION
  };
  // P0-5：跨设备导出显式告警（不静默丢 Key）。安全默认：浏览器态不勾选不出明文。
  // 多 Profile：profiles 数组已随 cfg 一起导出（key 为加密对象，换机无法解密）。
  //   用户勾选「导出明文」时，额外写 _portableKeys（每个 profile 的明文 key 数组）。
  const cfg = getCfg();
  const ap = getActiveProfile();
  if(cfg && cfg.enabled){
    if(isElectron()){
      data["_meta"] = { keyExcluded:true, reason:"electron-os-store" };
      toast(t("msg.aiKeyNotExported","AI Key 由本机安全存储保管，未随备份导出；换机后请在「设置」重新填写。"), "warn");
    } else if(ap && ap.key){
      const includeKey = !!($("#exportKeyOpt") && $("#exportKeyOpt").checked);
      if(includeKey){
        // 写所有 profile 的明文 key（兼容旧导入：同时写 _portableKey = active key）
        data["_portableKeys"] = (cfg.profiles || []).map(p => p.key || "");
        data["_portableKey"] = ap.key;
        data["_meta"] = { keyExcluded:false };
      } else {
        data["_meta"] = { keyExcluded:true, reason:"device-encrypted" };
        toast(t("msg.aiKeyEncrypted","AI Key 已加密绑定本机，换机后无法解密。如需携带，请勾选「导出时包含 AI Key（明文）」后重试。"), "warn");
      }
    }
  }
  // Export handling: optional encryption
  if (document.getElementById("exportEncryptOpt")?.checked) {
    const pwd = prompt(t("msg.exportPassword","请输入导出密码（用于加密）"));
    if (!pwd) {
      toast(t("msg.exportCancelled","加密导出需要密码，已取消导出。"), "error");
      return;
    }
    const encryptedObj = await encryptData(data, pwd);
    const encBlob = new Blob([JSON.stringify(encryptedObj,null,2)], {type:"application/json"});
    const aEnc = document.createElement("a");
    aEnc.href = URL.createObjectURL(encBlob);
    aEnc.download = "agent-workbench-backup-" + todayStr() + ".json";
    aEnc.click(); URL.revokeObjectURL(aEnc.href);
  } else {
    const blob = new Blob([JSON.stringify(data,null,2)], {type:"application/json"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "agent-workbench-backup-" + todayStr() + ".json";
    a.click(); URL.revokeObjectURL(a.href);
  }
}
function doImport(file){
  const reader = new FileReader();
  reader.onload = async ()=>{
    try{
      const data = JSON.parse(/** @type {string} */(reader.result));
      // v1.4-C 多设备同步：检测 _deviceMeta，若有则对 tasks 按 updatedAt 合并（其他键仍覆盖）
      const isMultiDeviceSync = !!(data && data._deviceMeta && data._deviceMeta.deviceId);
      if(isMultiDeviceSync){
        // 合并 tasks：相同 ID 取 updatedAt 更新者；不同 ID 直接合并
        const remoteTasksRaw = data[PREFIX + "tasks"];
        let remoteTasks = [];
        try { remoteTasks = typeof remoteTasksRaw === "string" ? JSON.parse(remoteTasksRaw) : (Array.isArray(remoteTasksRaw) ? remoteTasksRaw : []); }
        catch(e){ remoteTasks = []; }
        const localTasks = getTasks();
        const localMap = new Map(localTasks.map(t => [t.id, t]));
        let mergedCount = 0, conflictsResolved = 0, addedCount = 0;
        remoteTasks.forEach(rt => {
          if(!rt || !rt.id) return;
          const lt = localMap.get(rt.id);
          if(lt){
            const ltTs = lt.updatedAt || lt.created || 0;
            const rtTs = rt.updatedAt || rt.created || 0;
            if(rtTs > ltTs){ localMap.set(rt.id, rt); conflictsResolved++; }
            mergedCount++;
          } else {
            localMap.set(rt.id, rt);
            addedCount++;
            mergedCount++;
          }
        });
        // 把合并后的 tasks 写入 data，后续按统一覆盖逻辑处理（其他键仍覆盖）
        data[PREFIX + "tasks"] = JSON.stringify(Array.from(localMap.values()));
        // 记入迁移日志
        try {
          const log = load(PREFIX + "migrationLog", []);
          log.push({ ts: Date.now(), type: "multi-device-merge", from: data._deviceMeta.deviceId, to: getDeviceId(), added: addedCount, conflictsResolved, merged: mergedCount });
          if(log.length > 50) log.splice(0, log.length - 50);
          save(PREFIX + "migrationLog", log);
        } catch(e){ /* 静默 */ }
      }

      // 导入校验：必需字段 + 数据类型（兼容旧格式无 _deviceMeta 的数据）
      const meta = data && data._deviceMeta;
      if (meta) {
        if (typeof meta.version !== "string" || typeof meta.exportedAt !== "number") {
          toast(t("msg.importMissingFields","导入文件缺少必要字段 version 或 exportedAt"), "error");
          return;
        }
      }
      let hasValidData = false;
      const checkArr = (v) => { if(v===undefined) return false; try{ return Array.isArray(typeof v==="string"?JSON.parse(v):v); }catch(_){return false;} };
      if (checkArr(data[PREFIX+"tasks"]) || checkArr(data[PREFIX+"records"])) hasValidData = true;
      if (meta && !hasValidData) { toast(t("msg.importMissingData","导入文件缺少 tasks 或 records 数据"), "error"); return; }

      if(!confirm(t("confirm.importOverwrite","导入将覆盖当前同名数据（含自定义联动规则）。确定继续？"))) return;
      Object.keys(data).forEach(k=>{ if(k.startsWith(PREFIX) || k===CUSTOM_LINKS_KEY){ try{ localStorage.setItem(k, data[k]); }catch(e){ /* 静默降级 */ } } });
      _cfgCache = null; _deviceKey = null;
      // v2.0.1：导入不 reload 页面，须复位会话层与场景聊天内存缓存，否则 UI 显示导入前旧数据
      try{ _resetSessions(); _reloadChatsFromStorage(); }catch(_){ /* noop */ }
      clearUndoStack(); // B6：导入后清空撤销栈，避免跨数据状态误撤销
      try{ await initCrypto(); }catch(e){ /* 忽略，降级明文 */ }

      // P0-5：解析「有效 Key」——跨设备后原密文/OS 存储可能已失效
      // 多 Profile：优先用 _portableKeys 数组恢复每个 profile 的明文 key
      let effectiveKey = "";
      const cfg = getCfg();
      const hasProfiles = cfg && Array.isArray(cfg.profiles) && cfg.profiles.length;
      if(isElectron()){
        // F3：按激活 profile 查主进程 keySet（不再用旧顶层 c.keySet）
        try{
          const c = await window.electronAPI.getAiConfig();
          const ap = getActiveProfile();
          const list = (c && Array.isArray(c.profiles)) ? c.profiles : [];
          const mine = ap && list.find(x => x.id === ap.id);
          effectiveKey = (mine && mine.keySet) ? "__set__" : "";
        }catch(e){ effectiveKey = ""; }
      } else {
        effectiveKey = (getActiveProfile() && getActiveProfile().key) || "";
      }
      // opt-in 明文携带：_portableKeys 数组优先，回退到旧 _portableKey 单值
      if(!effectiveKey){
        if(Array.isArray(data._portableKeys) && data._portableKeys.length && hasProfiles){
          if(isElectron()){
            try{
              // F3：_portableKeys 按 profile 逐项写入主进程（一次性全量同步）
              const profilesOut = cfg.profiles.map((p, i) => ({ id: p.id, base: p.base || "", model: p.model || "", key: data._portableKeys[i] || undefined }));
              await window.electronAPI.setAiConfig({ enabled: !!cfg.enabled, profiles: profilesOut });
              const idx = cfg.profiles.findIndex(p => p.id === cfg.activeId);
              const k = (idx >= 0 && data._portableKeys[idx]) || data._portableKeys[0] || "";
              effectiveKey = k ? "__set__" : "";
            }catch(e){ effectiveKey = ""; }
          } else {
            try{
              const newProfiles = cfg.profiles.map((p, i) => Object.assign({}, p, { key: data._portableKeys[i] || "" }));
              await persistCfg(Object.assign({}, cfg, { profiles: newProfiles }));
              await initCrypto();
              effectiveKey = (getActiveProfile() && getActiveProfile().key) || "";
            }catch(e){ effectiveKey = ""; }
          }
        } else if(typeof data._portableKey === "string" && data._portableKey){
          if(isElectron()){
            try{
              const ap = getActiveProfile();
              await window.electronAPI.setAiConfig({ enabled: !!cfg.enabled, profiles: [{ id: (ap && ap.id) || cfg.activeId || "__legacy__", base: (ap && ap.base) || "", model: (ap && ap.model) || "", key: data._portableKey }] });
              effectiveKey = "__set__";
            }catch(e){ effectiveKey = ""; }
          } else {
            try{
              if(hasProfiles){
                // 把 _portableKey 写入 active profile
                const newProfiles = cfg.profiles.map(p => p.id === cfg.activeId ? Object.assign({}, p, { key: data._portableKey }) : p);
                await persistCfg(Object.assign({}, cfg, { profiles: newProfiles }));
              } else {
                await persistCfg(Object.assign({}, cfg, { key: data._portableKey }));
              }
              await initCrypto();
              effectiveKey = data._portableKey;
            }catch(e){ effectiveKey = ""; }
          }
        }
      }

      // 收尾提示（替换原单一 toast）：把「静默 401」变为「显式告警 / 就绪确认」
      if(getCfg().enabled && !effectiveKey){
        toast(t("msg.importSuccessNoKey","导入成功，但本机无 AI Key（安全存储绑定，未随备份迁移）。AI 暂不可用，请打开「设置」重新填写 Key。"), "warn");
      } else if(effectiveKey){
        toast(t("msg.importSuccessWithKey","导入成功，数据已恢复，AI Key 已就绪"), "ok");
      } else {
        toast(t("msg.importSuccess","导入成功，数据已恢复"), "ok");
      }

      render();
    }catch(e){
      // 导入文件损坏：告警并中止，不让异常冒泡导致崩溃
      toast(t("msg.importFormatError","导入文件格式错误，无法解析。"), "error");
      return;
    }
  };
  reader.readAsText(file);
}
/* v1.4-C 多设备同步合并统计：返回最近一次合并日志条目（供测试/UI 查看） */
function getLastMergeLog(){
  try {
    const log = load(PREFIX + "migrationLog", []);
    return log.filter(e => e.type === "multi-device-merge").slice(-1)[0] || null;
  } catch(e){ return null; }
}
function doClear(){
  if(!confirm(t("confirm.clearAll","确定清空全部数据？此操作不可恢复！"))) return;
  allKeys().forEach(k=>{ try{ localStorage.removeItem(k); }catch(e){ /* 静默降级 */ } });
  idbClearAll().catch(() => {}); // 架构项①：同步清 IDB 镜像，避免恢复出僵尸数据
  toast(t("msg.clearedReload","已清空，页面将重新载入示例"), "ok"); // B3：alert 改 toast；延迟重载让提示可见
  setTimeout(()=> location.reload(), 900);
}
/**
 * 架构项①：从 IndexedDB 镜像恢复 localStorage 中缺失的键（只补缺失，不覆盖现存值）
 */
function doIdbRestore(){
  idbRestoreAll().then(restored => {
    if(!restored.length){ toast(t("msg.idbNoData","本地库没有可恢复的数据"), "warn"); return; }
    toast(t("msg.restored","已恢复 ")+restored.length+t("unit.itemsData"," 项数据"), "ok");
    setTimeout(()=> location.reload(), 900);
  }).catch(()=> toast(t("msg.idbUnavailable","本地库不可用"), "error"));
}

/**
 * IDB 全量导出：把 localStorage 镜像键 + IDB v2 存储全部打包为 JSON 文件
 * 格式：{ _type: "idb-backup", _version: "1.0", _exportedAt, localStorage, idbV2 }
 */
function doIdbExport(){
  return Promise.all([
    // localStorage 镜像数据
    new Promise(resolve => {
      const ls = {};
      try {
        for(let i = 0; i < localStorage.length; i++){
          const k = localStorage.key(i);
          if(k && idbShouldMirror(k)) ls[k] = localStorage.getItem(k);
        }
      } catch(e){}
      resolve(ls);
    }),
    // IDB v2 全量读取
    new Promise(resolve => {
      if(!_idbV2Available){ resolve({}); return; }
      idbV2Open().then(db => {
        if(!db){ resolve({}); return; }
        const result = {};
        try {
          const tx = db.transaction(IDB_V2_STORE, "readonly");
          const st = tx.objectStore(IDB_V2_STORE);
          const req = st.getAll();
          req.onsuccess = () => {
            const all = req.result || [];
            for(const v of all){
              if(v && v.__store){
                const key = v.__store + ":" + (_idbV2Key(v.__store, String(v.id || "default")).replace(/[^a-zA-Z0-9_:]/g,'_'));
                result[key] = Object.assign({}, v);
                delete result[key].__store;
              }
            }
            resolve(result);
          };
          req.onerror = () => resolve(result);
        } catch(e){ resolve(result); }
      }).catch(() => resolve({}));
    })
  ]).then(([lsData, idbV2Data]) => {
    const backup = {
      _type: "idb-backup",
      _version: "1.0",
      _exportedAt: Date.now(),
      _versionApp: VERSION,
      localStorage: lsData,
      idbV2: idbV2Data
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], {type: "application/json"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "agent-workbench-idb-backup-"+todayStr()+".json";
    a.click();
    URL.revokeObjectURL(a.href);
    toast(t("msg.idbExported","IDB 全量备份已导出"), "ok");
    return backup;
  }).catch(err => {
    toast(t("err.backupFail","备份失败：")+(err&&err.message||t("tool.unknownErrorMsg", t("common.unknownError","未知错误"))), "error");
    throw err;
  });
}

/**
 * IDB 全量导入：从备份文件恢复 localStorage 镜像 + IDB v2 存储
 * 需要用户通过文件选择器选择导出的 .json 文件
 */
function doIdbImport(file){
  const reader = new FileReader();
  reader.onload = async () => {
    try{
      const backup = JSON.parse(/** @type {string} */(reader.result));
      if(!backup || backup._type !== "idb-backup"){
        toast(t("msg.invalidIdbBackup","文件格式不正确，不是有效的 IDB 备份"), "error");
        return;
      }
      // 恢复 localStorage 镜像键
      let restoredCount = 0;
      if(backup.localStorage && typeof backup.localStorage === "object"){
        for(const [k, v] of Object.entries(backup.localStorage)){
          if(idbShouldMirror(k) && v !== undefined){
            try{ localStorage.setItem(k, v); restoredCount++; }catch(e){}
          }
        }
      }
      // 恢复 IDB v2 存储
      if(backup.idbV2 && typeof backup.idbV2 === "object" && _idbV2Available){
        for(const [key, value] of Object.entries(backup.idbV2)){
          try {
            // 解析复合键 "store:id" → 恢复原始结构
            const parts = key.split(":");
            const store = parts[0];
            const val = Object.assign({}, value, { __store: store });
            await idbPut(store, val);
            restoredCount++;
          } catch(e){}
        }
      }
      if(!restoredCount){
        toast(t("msg.backupNoData","备份中没有可恢复的数据"), "warn");
        return;
      }
      toast(t("msg.restored","已恢复 ")+restoredCount+t("msg.restoredRefresh"," 项数据，请刷新页面"), "ok");
      setTimeout(()=> location.reload(), 900);
    }catch(e){
      toast(t("err.importFail","导入失败：")+(e&&e.message||t("err.jsonParse","JSON 解析错误")), "error");
    }
  };
  reader.readAsText(file);
}

// IDB 备份/恢复按钮事件绑定
(function bindIdbBackupButtons(){
  const btnExport = $("#btnIdbExport");
  const btnImport = $("#btnIdbImport");
  const fileInput = $("#idbFileInput");
  if(btnExport) btnExport.onclick = doIdbExport;
  if(btnImport){
    btnImport.onclick = () => { if(fileInput) fileInput.click(); };
    if(fileInput) fileInput.onchange = e => {
      if(e.target.files[0]){ doIdbImport(e.target.files[0]); e.target.value = ""; }
    };
  }
})();

// v3.1.2 B-档：关于卡渲染版本号 + 快捷键帮助按钮绑定（此前版本只在抽屉尾栏、快捷键只能按 ? 唤起，用户找不到）
(function bindAboutCard(){
  const ver = $("#aboutVersion");
  if(ver){ ver.textContent = t("app.name","Agent 工坊") + " · v" + VERSION + " · b" + BUILD_TAG; }
  const btn = $("#btnOpenShortcutHelp");
  if(btn && typeof openShortcutHelp === "function"){ btn.onclick = function(){ openShortcutHelp(); }; }
})();

/* ---------- P0-8：局域网同步（仅 Electron 环境） ---------- */
(function bindSyncButtons(){
  if(!isElectron()) return;
  const btnSync = $("#btnSyncLocal");
  if(!btnSync) return;
  // v3.1.2：syncPush 渲染侧接线（修复断链——此前主进程 syncSnapshot 恒为 {}，
  // 「本机同步下载」导出空数据）。启动时 + 每次点击同步按钮时推送一次本机快照；
  // 快照键集合与 doExport 一致（allKeys 的 wb_agent_ 前缀 + wb_custom_links）。
  const pushSnapshot = async () => {
    try{
      const snap = {};
      const keys = (typeof allKeys === "function" ? allKeys() : Object.keys(localStorage).filter(function(k){ return k.indexOf(PREFIX) === 0 || k === "wb_custom_links"; }));
      keys.forEach(function(k){
        const v = localStorage.getItem(k);
        if(typeof v === "string") snap[k] = v;
      });
      const r = await window.electronAPI.syncPush(snap);
      if(r && r.ok === false) toast(t("err.snapshotPushFail","本机快照推送失败：") + (r.error || ""), "warn");
      return !!(r && r.ok);
    }catch(e){
      toast(t("err.snapshotPushFail","本机快照推送失败：") + ((e && e.message) || e), "warn");
      return false;
    }
  };
  pushSnapshot(); // 启动即推送一次（后续点击时再推，保证下载到的总是最新数据）
  const _pushTimer = setInterval(pushSnapshot, 60000); // 周期推送（与 main.js 注释承诺一致：60s 一次）
  if(_pushTimer && _pushTimer.unref){ try{ _pushTimer.unref(); }catch(_e){} } // jsdom 环境无 unref，静默容错
  btnSync.style.display = ""; // 显示按钮
  btnSync.onclick = async () => {
    // 0. 先推送最新快照（下载入口读的是主进程内存快照，必须先推再下载）
    await pushSnapshot();
    // 1. 获取本机数据（A-1 修复：syncGet IPC 包裹 try-catch，异常时给出针对性提示并终止，
    //    避免 unhandled rejection + 后续「运行中」成功语气提示自相矛盾）
    let localData;
    try{
      localData = await window.electronAPI.syncGet();
    }catch(err){
      toast(t("err.syncServiceStartFail","本机同步服务启动失败：") + (err && err.message ? err.message : err), "error");
      return;
    }
    if(localData && localData.error){ toast(t("err.getLocalDataFail","获取本机数据失败：") + localData.error, "error"); return; }
    // 2. 通过 HTTP 提供下载入口（A-1 修复：Electron 以 file:// 加载页面，相对路径 fetch("/sync/download")
    //    会解析为 file:///sync/download 必然失败，必须拼接 main.js 同步端点的绝对地址）。
    //    安全边界（与 electron/main.js startSyncServer 注释一致）：同步服务仅绑定 127.0.0.1 回环且
    //    拒绝非本机来源，不做跨设备局域网访问；跨设备数据迁移走「设置 → 数据管理」的导出/导入 JSON。
    const syncBase = "http://127.0.0.1:8124";
    toast(t("msg.syncServiceRunning","本机同步服务运行中（仅本机回环 127.0.0.1:8124）；跨设备迁移请用「设置 → 数据管理 → 导出/导入」"), "ok");
    // 3. 打开本机快照下载（本机可访问）
    try {
      const resp = await fetch(syncBase + "/sync/download");
      if(resp.ok){
        const blob = await resp.blob();
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "agent-workbench-sync-"+todayStr()+".json";
        a.click(); URL.revokeObjectURL(a.href);
      } else {
        toast(t("err.snapshotDownloadFail","本机快照下载失败（HTTP ") + resp.status + "）", "warn");
      }
    } catch(e) {
      toast(t("err.snapshotRequestFail","本机快照请求失败，请确认本机同步服务已启动"), "warn");
    }
  };
})();

/* ---------- 系统级消息中心 ----------
 * 替代 v1.4 banner 横幅：消息存储于 localStorage（key = PREFIX + "messages"）
 * 结构：[{id, type, title, body, action:{label, fn}, time, read}]
 * - addMessage(type, title, body, action)：去重（同 type+title 仅保留最新一条），最多 50 条
 * - renderMsgPanel()：使用 DOM API 创建元素（避免 sanitizeHtml 丢失 data 属性与事件）
 * - updateMsgBadge()：刷新顶栏角标未读数
 * 消息类型：backup / system / offline（对应 MSG_ICONS 图标）
 */
const MSG_KEY = PREFIX + "messages";
const MSG_ICONS = {
  backup: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>',
  system: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>',
  offline: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 1l22 22M16.72 11.78A5 5 0 0 1 19 13M5 12.55a11 11 0 0 1 5-2.36M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01M2 8.82a15 15 0 0 1 4.17-2.65M19.83 5.35A15 15 0 0 1 22 8.82"/></svg>'
};
function getMessages(){
  try{ return JSON.parse(localStorage.getItem(MSG_KEY)) || []; }catch(e){ return []; }
}
function saveMessages(list){
  try{ localStorage.setItem(MSG_KEY, JSON.stringify(list)); }catch(e){ /* noop */ }
}
function addMessage(type, title, body, action){
  let list = getMessages();
  // 去重：同 type+title 只保留最新一条
  list = list.filter(function(m){ return !(m.type === type && m.title === title); });
  list.unshift({
    id: Date.now() + "-" + Math.random().toString(36).slice(2, 8),
    type: type || "system",
    title: title || "",
    body: body || "",
    action: action || null,  // {label, fn} fn 是全局函数名字符串
    time: new Date().toISOString(),
    read: false
  });
  // 最多保留 50 条
  if(list.length > 50) list = list.slice(0, 50);
  saveMessages(list);
  updateMsgBadge();
}
function markMessageRead(id){
  const list = getMessages();
  list.forEach(function(m){ if(m.id === id) m.read = true; });
  saveMessages(list);
  updateMsgBadge();
}
function markAllMessagesRead(){
  const list = getMessages();
  list.forEach(function(m){ m.read = true; });
  saveMessages(list);
  updateMsgBadge();
}
function clearMessages(){
  saveMessages([]);
  updateMsgBadge();
  renderMsgPanel();
}
function getUnreadCount(){
  return getMessages().filter(function(m){ return !m.read; }).length;
}
/* v1.9.7：正文消息提示栏预览文本（最新一条 + 未读数前缀；超长由 CSS ellipsis 截断，title 供悬停看全文） */
/* v1.15：待办栏（原消息栏替换）——今日摘要 + Top3 待办展开；消息中心收进顶栏按钮 */
function renderTodoBarPreview(){
  const el = $("#todoPreview");
  if(!el) return;
  const tasks = getActiveTasks();
  const today = todayStr();
  const done = tasks.filter(function(x){ return x.status === "done"; }).length;
  const pendingToday = tasks.filter(function(x){ return x.status !== "done" && x.due && x.due <= today; });
  const links = getLinks();
  const chainsActive = links.filter(function(l){
    if(l.enabled === false) return false;
    return calcStreak(l.fromSc).current > 0;
  }).length;
  el.textContent = t("weather.today","今天 ") + pendingToday.length + t("msg.dashPending"," 件待处理 · 已完成 ") + done + t("msg.dashChain"," 件 · 联动 ") + chainsActive + t("msg.dashChainActive"," 条进行中");
}
/* 待办栏展开态：渲染 Top3 今日待办 */
function renderTodoBarList(){
  const list = $("#todoBarList"); if(!list) return;
  while(list.firstChild) list.removeChild(list.firstChild);
  const today = todayStr();
  const pendingToday = getActiveTasks().filter(function(x){ return x.status !== "done" && x.due && x.due <= today; })
    .sort(function(a,b){
      const pa = _priWeight(a.priority), pb = _priWeight(b.priority);
      if(pa !== pb) return pa - pb;
      return a.due < b.due ? -1 : 1;
    }).slice(0, 3);
  if(!pendingToday.length){
    const e = document.createElement("div");
    e.className = "todo-bar-empty";
    e.textContent = t("msg.noTodayTasks","今天没有待处理事项");
    list.appendChild(e);
    return;
  }
  pendingToday.forEach(function(x){
    const item = document.createElement("button");
    item.type = "button";
    item.className = "todo-bar-item";
    const sm = scMeta(x.sc);
    const dot = document.createElement("span");
    dot.className = "tb-dot"; dot.style.background = sm.color;
    const titleEl = document.createElement("span");
    titleEl.className = "tb-title"; titleEl.textContent = x.title;
    const scEl = document.createElement("span");
    scEl.className = "tb-sc"; scEl.textContent = sm.name;
    item.appendChild(dot); item.appendChild(titleEl); item.appendChild(scEl);
    item.title = t("action.goScenario","前往场景查看");
    item.onclick = function(){
      setActive(x.sc); render();
      try{ const card = document.querySelector('[data-task-id="'+x.id+'"]'); if(card) card.scrollIntoView({behavior:"smooth", block:"center"}); }catch(_){}
    };
    list.appendChild(item);
  });
}
function setTodoBarExpanded(expanded){
  const bar = $("#todoBar"); if(!bar) return;
  bar.classList.toggle("todo-bar-collapsed", !expanded);
  bar.classList.toggle("todo-bar-expanded", expanded);
  const el = $("#todoBarToggle"); if(el) el.setAttribute("aria-expanded", expanded ? "true" : "false");
  if(expanded) renderTodoBarList();
  try{ localStorage.setItem(PREFIX+"todobar_expanded", expanded ? "1" : "0"); }catch(_){}
}
function toggleTodoBar(){
  const bar = $("#todoBar"); if(!bar) return;
  setTodoBarExpanded(bar.classList.contains("todo-bar-collapsed"));
}
function initTodoBar(){
  const bar = $("#todoBar"); if(!bar) return;
  let exp = false;
  try{ exp = localStorage.getItem(PREFIX+"todobar_expanded") === "1"; }catch(_){}
  setTodoBarExpanded(exp);
  const el = $("#todoBarToggle"); if(el) el.onclick = function(e){ e.stopPropagation(); toggleTodoBar(); };
  const p = $("#todoPreview"); if(p) p.onclick = function(e){ e.stopPropagation(); toggleTodoBar(); };
  renderTodoBarPreview();
}
function updateTodoBar(){ renderTodoBarPreview(); }
function updateMsgBadge(){
  const n = getUnreadCount();
  // v1.15：消息入口收敛为顶栏 #btnMessages 单角标
  const badges = [$("#msgBadge")];
  badges.forEach(function(badge){
    if(!badge) return;
    if(n > 0){
      badge.textContent = n > 99 ? "99+" : String(n);
      badge.style.display = "";
    } else {
      badge.style.display = "none";
    }
  });
  updateTodoBar();
  // v1.15：待办栏展开时同步刷新列表
  const bar = $("#todoBar"); if(bar && bar.classList.contains("todo-bar-expanded")) renderTodoBarList();
}
function renderMsgPanel(){
  const list = getMessages();
  const container = $("#msgList");
  if(!container) return;
  // 清空列表（DOM API，避免 innerHTML 残留）
  while(container.firstChild){ container.removeChild(container.firstChild); }
  if(!list.length){
    const empty = document.createElement("div");
    empty.className = "msg-empty";
    empty.textContent = t("empty.noMessages","暂无消息");
    container.appendChild(empty);
    return;
  }
  list.forEach(function(m){
    const item = document.createElement("div");
    item.className = "msg-item" + (m.read ? "" : " unread");
    item.setAttribute("data-msg-id", m.id);

    // 图标
    const iconWrap = document.createElement("span");
    iconWrap.className = "msg-item-icon";
    iconWrap.setAttribute("aria-hidden", "true");
    const iconSvg = MSG_ICONS[m.type] || MSG_ICONS.system;
    iconWrap.innerHTML = iconSvg; // 静态可信 SVG 字符串
    item.appendChild(iconWrap);

    // 主体
    const body = document.createElement("div");
    body.className = "msg-item-body";

    const titleEl = document.createElement("div");
    titleEl.className = "msg-item-title";
    titleEl.textContent = m.title; // 用户输入走 textContent，防 XSS
    body.appendChild(titleEl);

    if(m.body){
      const textEl = document.createElement("div");
      textEl.className = "msg-item-text";
      textEl.textContent = m.body;
      body.appendChild(textEl);
    }

    const timeEl = document.createElement("div");
    timeEl.className = "msg-item-time";
    try{
      const d = new Date(m.time);
      timeEl.textContent = (d.getMonth()+1)+t("unit.month","月")+d.getDate()+t("unit.daySuffix","日 ")+String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0");
    }catch(e){ timeEl.textContent = ""; }
    body.appendChild(timeEl);
    item.appendChild(body);

    // 操作按钮
    if(m.action && m.action.label){
      const btn = document.createElement("button");
      btn.className = "msg-item-action";
      btn.type = "button";
      btn.textContent = m.action.label;
      btn.setAttribute("data-msg-id", m.id);
      btn.setAttribute("data-msg-fn", m.action.fn || "");
      item.appendChild(btn);
    }
    container.appendChild(item);
  });
}

function checkCount(){
  const n = allKeys().reduce((s,k)=>{
    try{ return s + (JSON.parse(localStorage.getItem(k))?.length||0); }catch(e){ return s; }
  }, 0);
  // v1.4 banner 已移除：改为消息中心推送（去重，同 title 仅保留最新一条）
  if(n>=30){
    addMessage("backup", t("notify.dataBackup","数据备份提醒"), t("msg.dataAccumulated","数据已积累 ")+n+t("msg.dataAccumulatedSuffix"," 条，建议导出备份防止丢失"), {label:t("action.goExport","去导出"), fn:"doExport"});
  }
}

/* ---------- T3：CSV / Markdown 导出（任务数据多格式） ---------- */
const TASK_STATUS_TEXT = { todo:t("kanban.todo","待办"), doing:t("kanban.doing","进行中"), done:t("kanban.done","已完成") };
/* 状态文本（未知状态原样返回） */
function statusText(st){ return TASK_STATUS_TEXT[st] || (st||""); }
/* CSV 字段转义：含逗号/引号/换行时用双引号包裹并转义内部引号 */
function csvField(v){
  const s = String(v===null||v===undefined?"":v);
  return /[",\r\n]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s;
}
/* v1.4-C 任务 CSV 字段元数据（id/title/scenario/status/dueDate/doneAt/tags/createdAt + priority 兼容旧默认）
 * key 为字段标识（用于字段选择），label 为表头文案，get 为取值函数。
 * 默认导出沿用旧字段集（不含 id），用户在导出预览可勾选扩展字段。 */
const CSV_TASK_FIELDS = [
  { key:"id",        label:"ID",     get:t=>t.id||"" },
  { key:"title",     label:t("field.title", t("field.title","标题")),   get:t=>t.title||"" },
  { key:"scenario",  label:t("cmd.scenario","场景"),   get:t=>scMeta(t.sc).name },
  { key:"status",    label:t("field.status", t("field.status","状态")),   get:t=>statusText(t.status) },
  { key:"priority",  label:t("task.priority","优先级"), get:t=>t.priority||"" },
  { key:"dueDate",   label:t("field.dueDate","截止日期"), get:t=>t.due||"" },
  { key:"tags",      label:t("task.tags","标签"),   get:t=>(t.tags||[]).join(" ") },
  { key:"createdAt", label:t("field.createdAt","创建日期"), get:t=>t.created ? new Date(t.created).toISOString().slice(0,10) : "" },
  { key:"doneAt",    label:t("field.doneAt","完成日期"), get:t=>t.doneAt ? new Date(t.doneAt).toISOString().slice(0,10) : "" }
];
/* 默认字段集（保持向后兼容：旧测试断言 8 列表头 "场景,标题,状态,优先级,截止日期,标签,创建日期,完成日期"） */
const CSV_DEFAULT_FIELDS = ["scenario","title","status","priority","dueDate","tags","createdAt","doneAt"];
/**
 * 构建任务 CSV 文本（纯函数；BOM 由下载包装层添加）
 * @param {Task[]} tasks - 任务数组（默认取活跃任务）
 * @param {string[]} [fieldKeys] - 字段 key 数组（默认 CSV_DEFAULT_FIELDS，向后兼容）
 * @returns {string} CSV 文本
 */
function buildTasksCSV(tasks, fieldKeys){
  const list = Array.isArray(tasks) ? tasks : getActiveTasks();
  const keys = Array.isArray(fieldKeys) && fieldKeys.length
    ? fieldKeys.filter(k => CSV_TASK_FIELDS.some(f => f.key === k))
    : CSV_DEFAULT_FIELDS;
  const cols = keys.map(k => CSV_TASK_FIELDS.find(f => f.key === k));
  const header = cols.map(c => c.label);
  const rows = list.map(t => cols.map(c => c.get(t)));
  return [header].concat(rows).map(r => r.map(csvField).join(",")).join("\r\n");
}
/* v1.4-C 记算全部记录数（rec_* 各场景记录合计） */
function countAllRecs(){
  return ORDER.reduce((sum, sc) => {
    try { return sum + (getRec(sc) || []).length; } catch(e){ return sum; }
  }, 0);
}
/* v1.4-C 构建记录 CSV 文本（按场景遍历 rec_*，输出 id/title/scenario/note/created） */
function buildRecsCSV(){
  const header = ["ID",t("field.title", t("field.title","标题")),t("cmd.scenario","场景"),t("field.note","备注"),t("field.createdAt","创建日期")];
  const rows = [];
  ORDER.forEach(sc => {
    let recs = [];
    try { recs = getRec(sc) || []; } catch(e){ recs = []; }
    recs.forEach(r => {
      rows.push([
        r.id || "",
        r.title || "",
        scMeta(sc).name,
        r.note || "",
        r.created ? new Date(r.created).toISOString().slice(0,10) : ""
      ]);
    });
  });
  return [header].concat(rows).map(r => r.map(csvField).join(",")).join("\r\n");
}
/**
 * 构建任务 Markdown 文本（纯函数；按场景分组表格）
 * @param {Task[]} tasks - 任务数组（默认取活跃任务）
 * @returns {string} Markdown 文本
 */
function buildTasksMD(tasks){
  const list = Array.isArray(tasks) ? tasks : getActiveTasks();
  const lines = ["# " + t("app.name") + t("export.taskListMid"," · 任务清单（")+todayStr()+"）", ""];
  if(!list.length){ lines.push(t("export.noTasks","> 暂无任务。")); return lines.join("\n"); }
  const total = list.length, done = list.filter(t=>t.status==="done").length;
  lines.push(t("stat.totalPrefix","共 ")+total+t("stat.completedMid"," 条，已完成 ")+done+t("stat.completionRate"," 条，完成率 ")+(total?Math.round(done/total*100):0)+"%。", "");
  ORDER.forEach(sc=>{
    const ts = list.filter(t=>t.sc===sc);
    if(!ts.length) return;
    lines.push("## "+scMeta(sc).name, "");
    lines.push(t("export.csvHeader","| 标题 | 状态 | 优先级 | 截止日期 | 标签 |"), "| --- | --- | --- | --- | --- |");
    ts.forEach(t=>{
      lines.push("| "+String(t.title||"").replace(/\|/g,"\\|")
        +" | "+statusText(t.status)
        +" | "+(t.priority||"-")
        +" | "+(t.due||"-")
        +" | "+((t.tags||[]).join(" ")||"-")+" |");
    });
    lines.push("");
  });
  return lines.join("\n");
}
/* 通用文本下载（BOM 可选；CSV 带 BOM 保证 Excel 直接打开不乱码） */
function downloadTextFile(content, filename, mime, withBOM){
  const blob = new Blob([withBOM ? "\uFEFF"+content : content], {type:mime});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click(); URL.revokeObjectURL(a.href);
}
function doExportCSV(){
  const list = getActiveTasks();
  if(!list.length){ toast(t("msg.noExportableTasks","当前没有可导出的任务"),"warn"); return; }
  // v1.4-C：若导出预览中勾选了字段，则用所选字段；否则用默认字段（向后兼容）
  const fieldCbs = document.querySelectorAll("#csvExportFields input.csv-field-cb:checked");
  const fieldKeys = fieldCbs.length ? Array.from(fieldCbs).map(cb => cb.value) : null;
  downloadTextFile(buildTasksCSV(list, fieldKeys), "agent-workbench-tasks-"+todayStr()+".csv", "text/csv;charset=utf-8", true);
  toast(t("msg.exportedCsv","已导出 CSV（")+list.length+t("unit.tasksSuffix"," 条任务）"),"ok");
  closeExportPreview();
}
function doExportMD(){
  const list = getActiveTasks();
  if(!list.length){ toast(t("msg.noExportableTasks","当前没有可导出的任务"),"warn"); return; }
  downloadTextFile(buildTasksMD(list), "agent-workbench-tasks-"+todayStr()+".md", "text/markdown;charset=utf-8", false);
  toast(t("msg.exportedMd","已导出 Markdown（")+list.length+t("unit.tasksSuffix"," 条任务）"),"ok");
}
/* v1.4-C 导出记录 CSV（资料库 rec_* 全场景合并导出） */
function doExportRecsCSV(){
  const n = countAllRecs();
  if(!n){ toast(t("msg.noExportableRecords","当前没有可导出的记录"),"warn"); return; }
  downloadTextFile(buildRecsCSV(), "agent-workbench-recs-"+todayStr()+".csv", "text/csv;charset=utf-8", true);
  toast(t("msg.exportedRecCsv","已导出记录 CSV（")+n+t("unit.recordsSuffix"," 条记录）"),"ok");
}
/* ---------- v1.4-C 导出预览（数据概览 + 字段选择） ---------- */
/* 生成或复用设备标识（持久化到 localStorage，跨会话稳定） */
function getDeviceId(){
  let id = "";
  try { id = localStorage.getItem(PREFIX + "deviceId") || ""; } catch(e){ id = ""; }
  if(!id){
    id = "dev-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    try { localStorage.setItem(PREFIX + "deviceId", id); } catch(e){ /* 静默降级 */ }
  }
  return id;
}
/* 打开导出预览弹窗：显示任务数/记录数/配置是否包含 + 字段勾选 */
function openExportPreview(){
  const modal = $("#exportPreviewModal");
  if(!modal) return;
  const taskCount = getActiveTasks().length;
  const recCount = countAllRecs();
  const cfg = getCfg();
  const cfgIncluded = !!(cfg && Object.keys(cfg).length);
  const summary = $("#exportPreviewSummary");
  if(summary){
    summary.innerHTML = sanitizeHtml(
      t("p3.html.epRow1","<div class=\"ep-row\" class=\"u-ep-row\"><span>任务数</span><b>")+taskCount+'</b></div>'+
      t("p3.html.epRow2","<div class=\"ep-row\" class=\"u-ep-row\"><span>记录数</span><b>")+recCount+'</b></div>'+
      t("p3.html.epRow3","<div class=\"ep-row\" class=\"u-ep-row\"><span>配置</span><b>")+(cfgIncluded?t("op.include","包含"):t("op.empty","空"))+'</b></div>'
    );
  }
  // 字段勾选（默认勾选默认字段集）
  const fieldsBox = $("#csvExportFields");
  if(fieldsBox){
    fieldsBox.innerHTML = sanitizeHtml(CSV_TASK_FIELDS.map(f =>
      '<label class="u-fs-2xs u-text u-ai-center u-gap-1 u-inline-flex u-m-1-2">'+
      '<input type="checkbox" class="csv-field-cb" value="'+esc(f.key)+'"'+(CSV_DEFAULT_FIELDS.includes(f.key)?" checked":"")+'>'+
      '<span>'+esc(f.label)+'</span></label>'
    ).join(""));
  }
  modal.classList.add("show");
  const ov = $("#exportPreviewOverlay"); if(ov) ov.classList.add("show");
}
/* 关闭导出预览弹窗 */
function closeExportPreview(){
  const modal = $("#exportPreviewModal");
  if(modal) modal.classList.remove("show");
  const ov = $("#exportPreviewOverlay"); if(ov) ov.classList.remove("show");
}
/* ---------- v1.4-C CSV 导入（解析 + 预览 + 批量创建 + 统计） ---------- */
/* CSV 行解析：处理引号内逗号/换行/转义双引号；返回字段数组。
 * 算法：状态机（inField 跟踪是否在引号内）；支持 \r\n / \n / \r 行尾。 */
function parseCSVRows(text){
  const rows = [];
  let row = [], field = "", inQuotes = false;
  const s = String(text || "");
  for(let i = 0; i < s.length; i++){
    const c = s[i];
    if(inQuotes){
      if(c === '"'){
        if(s[i+1] === '"'){ field += '"'; i++; }
        else { inQuotes = false; }
      } else { field += c; }
    } else {
      if(c === '"'){ inQuotes = true; }
      else if(c === ','){ row.push(field); field = ""; }
      else if(c === '\r'){
        // \r\n 或单独 \r 行尾
        row.push(field); field = "";
        rows.push(row); row = [];
        if(s[i+1] === '\n') i++;
      }
      else if(c === '\n'){ row.push(field); field = ""; rows.push(row); row = []; }
      else { field += c; }
    }
  }
  // 末行（无行尾换行时残留）
  if(field !== "" || row.length){
    row.push(field);
    rows.push(row);
  }
  return rows;
}
/* 跳过 BOM（\uFEFF）并解析 CSV：首行表头，其余数据行；返回 { headers, rows } */
function parseCSV(text){
  let s = String(text || "");
  if(s.charCodeAt(0) === 0xFEFF) s = s.slice(1);
  const all = parseCSVRows(s);
  if(!all.length) return { headers: [], rows: [] };
  return { headers: all[0], rows: all.slice(1).filter(r => r.some(v => v !== "")) };
}
/* 把 CSV 行按表头映射为任务对象（兼容中英文表头） */
function csvRowToTask(row, headers){
  const HEADER_MAP = {
    "ID":"id","id":"id",
    "标题":"title","title":"title","Title":"title",
    "场景":"scenario","scenario":"scenario","Scenario":"scenario",
    "状态":"status","status":"status","Status":"status",
    "优先级":"priority","priority":"priority","Priority":"priority",
    "截止日期":"dueDate","dueDate":"dueDate","due":"dueDate",
    "标签":"tags","tags":"tags","Tags":"tags",
    "创建日期":"createdAt","createdAt":"createdAt","created":"createdAt",
    "完成日期":"doneAt","doneAt":"doneAt"
  };
  const obj = {};
  headers.forEach((h, i) => { obj[HEADER_MAP[h] || h] = row[i]; });
  // 状态文本回转 code
  const STATUS_MAP = { "待办":"todo", "进行中":"doing", "已完成":"done", "todo":"todo", "doing":"doing", "done":"done" };
  const scName = obj.scenario || "";
  // 场景名回转 key（按 name 匹配，回退 office）
  let scKey = "office";
  for(const k of ORDER){ if(SCENARIOS[k] && SCENARIOS[k].name === scName){ scKey = k; break; } }
  if(!ORDER.includes(scKey)) scKey = "office";
  const status = STATUS_MAP[obj.status] || "todo";
  const tags = obj.tags ? String(obj.tags).split(/[\s,]+/).filter(Boolean) : [];
  const task = {
    id: obj.id || uid(),
    sc: scKey,
    title: String(obj.title || "").trim() || t("label.unnamed","(未命名)"),
    status,
    due: obj.dueDate || "",
    priority: ["", "P0", "P1", "P2"].includes(obj.priority) ? (obj.priority || "") : "",
    doneAt: status === "done" ? (obj.doneAt ? new Date(obj.doneAt).getTime() || Date.now() : Date.now()) : null,
    tags,
    note: "",
    created: obj.createdAt ? new Date(obj.createdAt).getTime() || Date.now() : Date.now(),
    updatedAt: Date.now()
  };
  return task;
}
/* CSV 导入预览：解析后显示前 5 条 + 总条数，用户确认后批量创建 */
function previewImportCSV(file){
  const reader = new FileReader();
  reader.onload = () => {
    try{
      const parsed = parseCSV(String(reader.result));
      if(!parsed.rows.length){ toast(t("msg.csvNoData","CSV 文件无数据行"),"warn"); return; }
      const preview = parsed.rows.slice(0, 5).map(r => csvRowToTask(r, parsed.headers));
      const modal = $("#csvImportModal");
      if(!modal){
        // 无预览弹窗：直接导入（向后兼容兜底）
        doImportCSVFile(file);
        return;
      }
      const summary = $("#csvImportSummary");
      if(summary){
        summary.innerHTML = sanitizeHtml(
          t("p3.html.epTotalCount","<div class=\"ep-row\"><span>总条数</span><b>")+parsed.rows.length+'</b></div>'+
          t("p3.html.epHeader","<div class=\"ep-row\"><span>表头</span><b>")+esc(parsed.headers.join(", "))+'</b></div>'
        );
      }
      const list = $("#csvImportPreviewList");
      if(list){
        const rowsHtml = preview.map(t =>
          '<div class="csv-preview-row u-flex u-fs-2xs u-gap-2 u-pad-1-0 u-border-bottom-line">'+
          '<span class="u-flex-1">'+esc(t.title)+'</span>'+
          '<span class="u-text-muted">'+esc(scMeta(t.sc).name)+'</span>'+
          '<span class="u-text-muted">'+esc(statusText(t.status))+'</span></div>'
        ).join("");
        list.innerHTML = sanitizeHtml(rowsHtml);
      }
      // 暂存待导入的解析结果，确认按钮读取
      _pendingCSVImport = { headers: parsed.headers, rows: parsed.rows, file };
      modal.classList.add("show");
      const ov = $("#csvImportOverlay"); if(ov) ov.classList.add("show");
    }catch(e){
      toast(t("msg.csvParseFailed","CSV 解析失败：")+(e && e.message || t("tool.unknownErrorMsg", t("common.unknownError","未知错误"))), "error");
    }
  };
  reader.onerror = () => { toast(t("msg.csvReadFailed","CSV 文件读取失败"), "error"); };
  reader.readAsText(file, "utf-8");
}
let _pendingCSVImport = null;
/* v1.4-C 测试访问器：读取/设置待导入 CSV 数据（模块内变量访问） */
function getPendingCSVImport(){ return _pendingCSVImport; }
function setPendingCSVImport(v){ _pendingCSVImport = v; }
/* 执行 CSV 导入：批量创建任务，返回 {ok, added, skipped, total} */
function doImportCSV(){
  if(!_pendingCSVImport){ toast(t("msg.csvNoImportable","无可导入的 CSV 数据"),"warn"); return { ok:false, added:0, skipped:0, total:0 }; }
  const { headers, rows } = _pendingCSVImport;
  const existing = getTasks();
  const existingIds = new Set(existing.map(t => t.id));
  let added = 0, skipped = 0;
  const newTasks = [];
  rows.forEach(r => {
    try{
      const task = csvRowToTask(r, headers);
      if(existingIds.has(task.id)){ skipped++; return; }
      newTasks.push(task);
      existingIds.add(task.id);
      added++;
    }catch(e){ skipped++; }
  });
  if(added){
    setTasks(existing.concat(newTasks));
    clearUndoStack();
  }
  _pendingCSVImport = null;
  const modal = $("#csvImportModal");
  if(modal) modal.classList.remove("show");
  const ov = $("#csvImportOverlay"); if(ov) ov.classList.remove("show");
  toast(t("msg.csvImportDone","CSV 导入完成：成功 ")+added+t("unit.csvSkipped"," 条，跳过 ")+skipped+t("unit.csvTotal"," 条（共 ")+rows.length+t("unit.csvRows"," 行）"), added ? "ok" : "warn");
  render();
  return { ok: added > 0, added, skipped, total: rows.length };
}
/* 取消 CSV 导入预览 */
function cancelImportCSV(){
  _pendingCSVImport = null;
  const modal = $("#csvImportModal");
  if(modal) modal.classList.remove("show");
  const ov = $("#csvImportOverlay"); if(ov) ov.classList.remove("show");
}
/* 兜底：直接导入 CSV 文件（无预览弹窗时） */
function doImportCSVFile(file){
  const reader = new FileReader();
  reader.onload = () => {
    try{
      const parsed = parseCSV(String(reader.result));
      if(!parsed.rows.length){ toast(t("msg.csvNoData","CSV 文件无数据行"),"warn"); return; }
      _pendingCSVImport = { headers: parsed.headers, rows: parsed.rows, file };
      doImportCSV();
    }catch(e){
      toast(t("msg.csvParseFailed","CSV 解析失败：")+(e && e.message || t("tool.unknownErrorMsg", t("common.unknownError","未知错误"))), "error");
    }
  };
  reader.onerror = () => { toast(t("msg.csvReadFailed","CSV 文件读取失败"), "error"); };
  reader.readAsText(file, "utf-8");
}
