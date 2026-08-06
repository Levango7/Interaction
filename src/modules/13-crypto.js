// ===== Crypto Layer (加密层) =====
/* ---------- AI Key 加密存储（AES-GCM + 设备密钥）---------- */
let _deviceKey = null;        // CryptoKey 实例
let _cryptoReady = false;     // Web Crypto subtle 是否可用
let _cryptoWarned = false;    // Web Crypto 不可用 warn 去重标记（T5.3 兼容）
let _cfgCache = null;         // 解密后的内存明文 cfg
const DK_KEY = PREFIX + "__dk"; // 设备密钥存储键

function base64Encode(bytes){
  let s = "";
  for(let i=0;i<bytes.length;i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
function base64Decode(str){
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++) out[i] = bin.charCodeAt(i);
  return out;
}
function getDeviceKey(){ return _deviceKey; }
function isEncKey(v){ return v && typeof v === "object" && v.__enc === true; }
function _resetCrypto(){ _deviceKey = null; _cfgCache = null; _cryptoReady = false; }
async function ensureDeviceKey(){
  if(_deviceKey) return _deviceKey;
  if(!_cryptoReady) return null;
  const raw = localStorage.getItem(DK_KEY);
  if(raw){
    try{
      const bytes = base64Decode(raw);
      _deviceKey = await crypto.subtle.importKey("raw", bytes, {name:"AES-GCM"}, false, ["encrypt","decrypt"]);
      return _deviceKey;
    }catch(e){ /* 损坏则重建 */ }
  }
  _deviceKey = await crypto.subtle.generateKey({name:"AES-GCM", length:256}, true, ["encrypt","decrypt"]);
  const exported = await crypto.subtle.exportKey("raw", _deviceKey);
  localStorage.setItem(DK_KEY, base64Encode(new Uint8Array(exported)));
  return _deviceKey;
}
/**
 * 用设备密钥 AES-GCM 加密明文 Key
 * @param {string} plaintext - 明文 API Key
 * @returns {Promise<Object|string>} 加密对象 {__enc,iv,data}；Web Crypto 不可用时回退原值
 */
async function encryptKey(plaintext){
  if(!_cryptoReady) return plaintext;
  const key = await ensureDeviceKey();
  if(!key) return plaintext;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder().encode(String(plaintext));
  const cipher = await crypto.subtle.encrypt({name:"AES-GCM", iv}, key, enc);
  return { __enc: true, iv: base64Encode(iv), data: base64Encode(new Uint8Array(cipher)) };
}
/**
 * 用设备密钥 AES-GCM 解密 Key
 * @param {Object|string} encrypted - 加密对象 {__enc,iv,data}；非加密对象原样返回
 * @returns {Promise<string>} 明文 Key；Web Crypto 不可用时回退原值
 */
async function decryptKey(encrypted){
  if(!_cryptoReady) return encrypted;
  if(!isEncKey(encrypted)) return encrypted;
  const key = await ensureDeviceKey();
  if(!key) return "";
  const iv = base64Decode(encrypted.iv);
  const data = base64Decode(encrypted.data);
  const plain = await crypto.subtle.decrypt({name:"AES-GCM", iv}, key, data);
  return new TextDecoder().decode(plain);
}
/**
 * 持久化 cfg：浏览器模式加密每个 profile 的 key 后写 localStorage；Electron 模式 Key 交主进程
 * @param {Cfg} cfg
 * @returns {Promise<void>}
 */
async function persistCfg(cfg){
  // Electron 模式：Key 由主进程保管，渲染进程只持久化非敏感配置（P0-3）
  if(isElectron()){
    const rest = Object.assign({}, cfg);
    if(Array.isArray(rest.profiles)){
      rest.profiles = rest.profiles.map(p => Object.assign({}, p, { key: "" }));
    }
    save(PREFIX+"cfg", rest);
    return;
  }
  if(!_cryptoReady){ save(PREFIX+"cfg", cfg); return; }
  const mem = Object.assign({}, cfg);
  // 多 Profile：遍历加密每个 profile 的 key
  if(Array.isArray(mem.profiles)){
    mem.profiles = await Promise.all(mem.profiles.map(async p => {
      const np = Object.assign({}, p);
      if(typeof np.key === "string" && np.key){
        try{ np.key = await encryptKey(np.key); }catch(e){ /* 保留原值 */ }
      }
      return np;
    }));
  }
  // 兼容：若仍存在顶层 key（旧数据未迁移），也加密
  if(typeof mem.key === "string" && mem.key){
    try{ mem.key = await encryptKey(mem.key); }catch(e){ /* 保留原值 */ }
  }
  save(PREFIX+"cfg", mem);
}
/**
 * 初始化加密：检测 Web Crypto 可用性、生成/导入设备密钥、解密 cfg 中所有 profile 的 key 到内存
 * @returns {Promise<Cfg>} 解密后的内存明文 cfg
 */
async function initCrypto(){
  try{
    _cryptoReady = !!(typeof crypto !== "undefined" && crypto.subtle && typeof crypto.subtle.generateKey === "function");
  }catch(e){ _cryptoReady = false; }
  if(_cryptoReady){
    try{ await ensureDeviceKey(); }
    catch(e){ _cryptoReady = false; _deviceKey = null; }
  }
  // T5.3 浏览器兼容：Web Crypto 不可用（file:// 降级 / 旧浏览器 / 不安全上下文）时 warn 一次，Key 将明文存储
  if(!_cryptoReady && typeof console !== "undefined" && console.warn && !_cryptoWarned){
    _cryptoWarned = true;
    try{ console.warn("[Agent Workbench] Web Crypto API 不可用，AI Key 将明文存储于 localStorage"); }catch(e){ /* noop */ }
  }
  const raw = load(PREFIX+"cfg", {});

  // Electron 模式：Key 由主进程保管。渲染进程不解密、不持有明文 Key（P0-3）
  if(isElectron()){
    if(raw && Array.isArray(raw.profiles)){
      // 旧版迁移：把每个 profile 的本地残留 Key 上报主进程后清除
      for(const p of raw.profiles){
        if(!p.key) continue;
        let legacy = "";
        if(isEncKey(p.key)){ try{ legacy = await decryptKey(p.key); }catch(e){ legacy = ""; } }
        else if(typeof p.key === "string" && p.key){ legacy = p.key; }
        if(legacy){ try{ await window.electronAPI.setAiConfig({ base: p.base||"", model: p.model||"", enabled: !!raw.enabled, key: legacy }); }catch(e){ /* 忽略 */ } }
      }
      raw.profiles = raw.profiles.map(p => Object.assign({}, p, { key: "" }));
      save(PREFIX+"cfg", raw);
    } else if(raw && raw.key){
      // 旧版单 cfg 迁移
      let legacy = "";
      if(isEncKey(raw.key)){ try{ legacy = await decryptKey(raw.key); }catch(e){ legacy = ""; } }
      else if(typeof raw.key === "string" && raw.key){ legacy = raw.key; }
      if(legacy){ try{ await window.electronAPI.setAiConfig({ base: raw.base||"", model: raw.model||"", enabled: !!raw.enabled, key: legacy }); }catch(e){ /* 忽略 */ } }
      const rest = Object.assign({}, raw); delete rest.key;
      save(PREFIX+"cfg", rest);
    }
    _cfgCache = Object.assign({}, raw, { key: "" });
    return _cfgCache;
  }

  // 浏览器模式：解密每个 profile 的 key
  let needRepersist = false;
  if(raw && Array.isArray(raw.profiles)){
    raw.profiles = await Promise.all(raw.profiles.map(async p => {
      const np = Object.assign({}, p);
      if(isEncKey(np.key)){
        try{ np.key = await decryptKey(np.key); needRepersist = true; }catch(e){ np.key = ""; }
      }else if(typeof np.key === "string" && np.key){
        needRepersist = true; // 旧明文，待重新加密持久化
      }
      return np;
    }));
  }
  // 兼容：解密顶层 key（旧数据未迁移）
  let plainKey = raw.key;
  if(isEncKey(raw.key)){
    try{ plainKey = await decryptKey(raw.key); needRepersist = true; }catch(e){ plainKey = ""; }
  }else if(typeof raw.key === "string" && raw.key){
    needRepersist = true; // 旧明文，待迁移
  }
  _cfgCache = Object.assign({}, raw, { key: plainKey });
  // 旧明文迁移：重新持久化为加密结构
  if(_cryptoReady && needRepersist){
    try{ await persistCfg(_cfgCache); }catch(e){ /* 忽略 */ }
  }
  return _cfgCache;
}
function isElectron(){ return typeof window.electronAPI !== "undefined"; }

