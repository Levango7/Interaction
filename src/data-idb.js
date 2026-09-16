// ===== Data Layer (数据层·IndexedDB 持久镜像) =====
/* ---------- IDB 持久存储镜像（架构项①：容量与可靠性） ----------
 * 设计契约：
 *   - localStorage 仍是同步真相源（load/save 热路径不变，live-get 语义保留）
 *   - IDB 为异步持久镜像：save 写入后异步入队、去抖批量落盘（不阻塞 UI）
 *   - 无 indexedDB 环境（jsdom/隐私模式/旧内核）全部函数安全 no-op
 *   - 镜像范围：仅 wb_agent_* / wb_custom_links（用户数据键）
 *   - 恢复入口：设置页「从本地库恢复」（idbRestoreAll），用于 localStorage 被清/配额丢失场景
 */
const IDB_NAME = "wb_agent_idb";
const IDB_STORE = "kv";
const IDB_VERSION = 1;
/** IDB 镜像覆盖的键前缀（用户数据键） */
const IDB_MIRROR_PREFIXES = ["wb_agent_", "wb_custom_links"];

/** 判断键是否属于 IDB 镜像范围 */
function idbShouldMirror(k){
  return IDB_MIRROR_PREFIXES.some(p => k === p || k.startsWith(p));
}

// v1.14 stub: OAuth2 callback handler (oauth2 module removed, startup wiring remains)
function _oauth2HandleCallback() { return Promise.resolve(); }

let _idbDbPromise = null;
/**
 * 打开 IDB 连接（单例 Promise 缓存）
 * @returns {Promise<IDBDatabase|null>} 不可用时 null
 */
function idbOpen(){
  if(_idbDbPromise) return _idbDbPromise;
  _idbDbPromise = new Promise(resolve => {
    try{
      if(typeof indexedDB === "undefined"){ resolve(null); return; }
      const req = indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onupgradeneeded = () => { try{ req.result.createObjectStore(IDB_STORE); }catch(e){ /* 已存在 */ } };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    }catch(e){ resolve(null); }
  });
  return _idbDbPromise;
}

/**
 * 单键事务包装
 * @param {IDBTransactionMode} mode - "readonly" | "readwrite"
 * @param {function(IDBObjectStore):IDBRequest} fn - 事务内操作
 * @returns {Promise<*>} 请求结果；不可用时 undefined
 */
function idbTxn(mode, fn){
  return idbOpen().then(db => new Promise(resolve => {
    if(!db){ resolve(undefined); return; }
    try{
      const tx = db.transaction(IDB_STORE, mode);
      const st = tx.objectStore(IDB_STORE);
      const req = fn(st);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(undefined);
    }catch(e){ resolve(undefined); }
  }));
}

/** 写单键到 IDB 镜像 */
function idbMirrorKey(k, v){ return idbTxn("readwrite", st => st.put(v, k)); }
/** 读单键 IDB 镜像 */
function idbReadKey(k){ return idbTxn("readonly", st => st.get(k)); }
/** 删除单键 IDB 镜像 */
function idbDeleteKey(k){ return idbTxn("readwrite", st => st.delete(k)); }

/* ---------- 去抖批量写入队列（save 钩子） ---------- */
let _idbQueue = {};
let _idbTimer = null;
const IDB_FLUSH_MS = 300;

/**
 * save 落盘后的 IDB 镜像入口：入队 + 去抖
 * 值为 undefined 表示删除该键镜像
 * @param {string} k
 * @param {*} v
 */
function idbQueueMirror(k, v){
  if(!idbShouldMirror(k)) return;
  _idbQueue[k] = v;
  if(_idbTimer) clearTimeout(_idbTimer);
  _idbTimer = setTimeout(() => { idbFlushQueue().catch(() => {}); }, IDB_FLUSH_MS);
}

/**
 * 立即冲刷镜像队列（导出，供测试与页面隐藏前手动刷新）
 * @returns {Promise<number>} 实际写入/删除的键数
 */
function idbFlushQueue(){
  const entries = Object.keys(_idbQueue);
  const q = _idbQueue; _idbQueue = {};
  if(_idbTimer){ clearTimeout(_idbTimer); _idbTimer = null; }
  if(!entries.length) return Promise.resolve(0);
  return idbOpen().then(db => new Promise(resolve => {
    if(!db){ resolve(0); return; }
    let n = 0;
    try{
      const tx = db.transaction(IDB_STORE, "readwrite");
      const st = tx.objectStore(IDB_STORE);
      entries.forEach(k => { const v = q[k]; if(v === undefined){ st.delete(k); } else { st.put(v, k); } n++; });
      tx.oncomplete = () => resolve(n);
      tx.onerror = () => resolve(n);
      tx.onabort = () => resolve(n);
    }catch(e){ resolve(0); }
  }));
}

/**
 * 列出 IDB 镜像中的全部键
 * @returns {Promise<string[]>}
 */
function idbKeys(){
  return idbOpen().then(db => new Promise(resolve => {
    if(!db){ resolve([]); return; }
    try{
      const tx = db.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).getAllKeys();
      req.onsuccess = () => resolve(/** @type {string[]} */(req.result) || []);
      req.onerror = () => resolve([]);
    }catch(e){ resolve([]); }
  }));
}

/**
 * 从 IDB 镜像恢复 localStorage 中缺失的键（只补缺失，不覆盖现存值）
 * @returns {Promise<string[]>} 实际恢复的键列表
 */
function idbRestoreAll(){
  return idbKeys().then(async keys => {
    const restored = [];
    for(const k of keys){
      if(!idbShouldMirror(k)) continue;
      let has = false;
      try{ has = localStorage.getItem(k) !== null; }catch(e){ has = false; }
      if(has) continue;
      const v = await idbReadKey(k);
      if(v === undefined || v === null) continue;
      try{ localStorage.setItem(k, JSON.stringify(v)); restored.push(k); }catch(e){ /* 配额不足等：跳过 */ }
    }
    return restored;
  });
}

/**
 * 全量重镜像：把 localStorage 中属于镜像范围的键写入 IDB（启动/恢复后调用）
 * @returns {Promise<number>} 镜像键数
 */
function idbMirrorAll(){
  let keys = [];
  try{
    for(let i = 0; i < localStorage.length; i++){
      const k = localStorage.key(i);
      if(k && idbShouldMirror(k)) keys.push(k);
    }
  }catch(e){ keys = []; }
  keys.forEach(k => {
    let v = null;
    try{ v = JSON.parse(localStorage.getItem(k)); }catch(e){ v = null; }
    if(v !== null) _idbQueue[k] = v;
  });
  return idbFlushQueue();
}

/**
 * 清空 IDB 镜像中的全部键（清空数据时调用，避免恢复出"僵尸数据"）
 * @returns {Promise<number>} 删除键数
 */
function idbClearAll(){
  return idbOpen().then(db => new Promise(resolve => {
    if(!db){ resolve(0); return; }
    try{
      const tx = db.transaction(IDB_STORE, "readwrite");
      const req = tx.objectStore(IDB_STORE).clear();
      req.onsuccess = () => resolve(1);
      req.onerror = () => resolve(0);
    }catch(e){ resolve(0); }
  }));
}

/**
 * IDB 持久层初始化（startup 调用）：仅做 localStorage → IDB 全量镜像。
 * 注意：不在启动时自动恢复缺失键——避免与「清空数据」意图冲突（恢复仅限用户手动触发）。
 * @returns {Promise<{mirrored:number}>}
 */
function initIdb(){
  return idbOpen().then(async db => {
    if(!db) return { mirrored: 0 };
    const mirrored = await idbMirrorAll();
    return { mirrored };
  });
}

/* ============================================================
 * v1.6-G 大数据存储增强（IDB V2）
 * ============================================================
 * 设计契约：
 *   - 独立数据库 wb_agent_idb_data（避免影响 V1 kv 镜像）
 *   - 单 object store 'data'，keyPath 由调用方提供（out-of-line keys）
 *   - store 名实际为 'data'，但 API 形参 store 接受 'tasks'/'records'/'generic' 等逻辑名
 *     内部统一映射到 'data' store，以 [store, key] 复合键存储（兼容性最简）
 *   - 不可用环境（jsdom/隐私模式）全部降级到 localStorage，不崩溃
 *   - 迁移阈值 IDB_THRESHOLD = 1000
 */
const IDB_V2_NAME = "wb_agent_idb_data";
const IDB_V2_STORE = "data";
const IDB_V2_VERSION = 1;
const IDB_THRESHOLD = 1000;
/* 混合存储：localStorage 容量阈值（字节），超过则迁移到 IDB */
const HYBRID_LS_LIMIT = 100 * 1024; /* 100KB */

let _idbV2DbPromise = null;
const _idbV2Available = (function(){
  try{ return (typeof indexedDB !== "undefined"); }catch(e){ return false; }
})();

/** 检测 IndexedDB 是否可用 */
function isIDBAvailable(){
  return _idbV2Available;
}

/**
 * 打开 V2 IDB 连接（单例 Promise 缓存）
 * @returns {Promise<IDBDatabase|null>}
 */
function idbV2Open(){
  if(_idbV2DbPromise) return _idbV2DbPromise;
  _idbV2DbPromise = new Promise(resolve => {
    try{
      if(!_idbV2Available){ resolve(null); return; }
      const req = indexedDB.open(IDB_V2_NAME, IDB_V2_VERSION);
      req.onupgradeneeded = () => {
        try{
          if(!req.result.objectStoreNames.contains(IDB_V2_STORE)){
            req.result.createObjectStore(IDB_V2_STORE);
          }
        }catch(e){ /* 已存在 */ }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    }catch(e){ resolve(null); }
  });
  return _idbV2DbPromise;
}

/** 复合键：[store, key] */
function _idbV2Key(store, key){ return JSON.stringify([store, key]); }

/**
 * V2 单键事务包装
 * @param {string} mode - "readonly" | "readwrite"
 * @param {function(IDBObjectStore):IDBRequest} fn
 * @returns {Promise<*>}
 */
function idbV2Txn(mode, fn){
  return idbV2Open().then(db => new Promise(resolve => {
    if(!db){ resolve(undefined); return; }
    try{
      const tx = db.transaction(IDB_V2_STORE, mode);
      const st = tx.objectStore(IDB_V2_STORE);
      const req = fn(st);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(undefined);
    }catch(e){ resolve(undefined); }
  }));
}

/** 估算数据大小（JSON.stringify 长度，单位字节近似） */
function getDataSize(data){
  try{
    if(data === undefined || data === null) return 0;
    return JSON.stringify(data).length;
  }catch(e){ return 0; }
}

/* ---------- V2 IDB CRUD ---------- */
/** 获取 store 中所有记录（扫描所有 [store, *] 键） */
function idbGetAll(store){
  return idbV2Open().then(db => new Promise(resolve => {
    if(!db){ resolve([]); return; }
    try{
      const tx = db.transaction(IDB_V2_STORE, "readonly");
      const st = tx.objectStore(IDB_V2_STORE);
      const req = st.getAll();
      req.onsuccess = () => {
        const all = req.result || [];
        /* 过滤出属于该 store 的记录（value 带 __store 标记） */
        const filtered = all.filter(v => v && v.__store === store).map(v => {
          const copy = Object.assign({}, v);
          delete copy.__store;
          return copy;
        });
        resolve(filtered);
      };
      req.onerror = () => resolve([]);
    }catch(e){ resolve([]); }
  }));
}

/** 获取单条记录 */
function idbGet(store, key){
  return idbV2Txn("readonly", st => st.get(_idbV2Key(store, key))).then(v => {
    if(v === undefined || v === null) return undefined;
    if(v && v.__store === store){
      const copy = Object.assign({}, v);
      delete copy.__store;
      return copy;
    }
    return v;
  });
}

/** 写入/更新记录（自动标记 __store） */
function idbPut(store, value){
  const val = (value && typeof value === "object") ? Object.assign({}, value, { __store: store }) : value;
  /* key 策略：value 带 id 时用 id，否则用 "default" */
  const k = (value && value.id !== null && value.id !== undefined) ? String(value.id) : "default";
  return idbV2Txn("readwrite", st => st.put(val, _idbV2Key(store, k)));
}

/** 删除单条 */
function idbDelete(store, key){
  return idbV2Txn("readwrite", st => st.delete(_idbV2Key(store, key)));
}

/* ---------- 混合存储策略 ---------- */
/* 混合存储键前缀 */
const HYBRID_PREFIX = "wb_hybrid_";

/**
 * 从混合存储读取数据：优先 IDB，降级 localStorage
 * @param {string} type - 数据类型（如 'tasks', 'records'）
 * @returns {Promise<*>}
 */
function getHybridData(type){
  /* 先尝试从 localStorage 读（小数据存这里） */
  try{
    const raw = localStorage.getItem(HYBRID_PREFIX + type);
    if(raw !== null) return Promise.resolve(JSON.parse(raw));
  }catch(e){ try{ pushDiag("error", "getHybridData ls read error: "+(e&&e.message||e), {where:"getHybridData"}); }catch(_){} }
  /* 再从 IDB 读 */
  return idbGet("hybrid", type).then(v => {
    if(v !== undefined && v !== null && v.data !== undefined) return v.data;
    return null;
  });
}

/* ============================================================
 * v1.7-B 模型缓存 store（IDB V2 'models' 逻辑 store）
 * ============================================================
 * 设计契约：
 *   - 复用 IDB V2 单 store 'data'，用复合键 ['models', modelId] 区分
 *   - 元数据字段：{modelId, version, size, blob, cachedAt, lastUsed, __store:'models'}
 *   - IDB 不可用时调用方负责降级到内存（54-offline-ai.js 中处理）
 *   - idbPutModel / idbGetModel / idbDeleteModel / idbListModels
 * ============================================================ */
const IDB_MODELS_STORE = "models";

/**
 * 写入/更新模型缓存记录
 * @param {string} modelId - 模型 ID
 * @param {Object} record - 缓存记录（{modelId, version, size, blob, cachedAt, lastUsed}）
 * @returns {Promise<*>} idbPut 返回值（undefined 表示 IDB 不可用）
 */
function idbPutModel(modelId, record){
  const mid = String(modelId || "").trim();
  if(!mid) return Promise.resolve(undefined);
  const rec = Object.assign({}, record || {}, { id: mid, modelId: mid });
  return idbPut(IDB_MODELS_STORE, rec);
}

/**
 * 读取模型缓存记录
 * @param {string} modelId
 * @returns {Promise<Object|undefined>} 缓存记录或 undefined
 */
function idbGetModel(modelId){
  const mid = String(modelId || "").trim();
  if(!mid) return Promise.resolve(undefined);
  return idbGet(IDB_MODELS_STORE, mid);
}

/**
 * 删除模型缓存记录
 * @param {string} modelId
 * @returns {Promise<*>}
 */
function idbDeleteModel(modelId){
  const mid = String(modelId || "").trim();
  if(!mid) return Promise.resolve(undefined);
  return idbDelete(IDB_MODELS_STORE, mid);
}

/**
 * 列出所有模型缓存记录
 * @returns {Promise<Array<Object>>}
 */
function idbListModels(){
  return idbGetAll(IDB_MODELS_STORE);
}
