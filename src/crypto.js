// ===== Crypto Layer (加密层) =====
/* ---------- AI Key 加密存储（AES-GCM + 设备密钥）---------- */
let _deviceKey = null;        // CryptoKey 实例
let _cryptoReady = false;     // Web Crypto subtle 是否可用
let _cryptoWarned = false;    // Web Crypto 不可用 warn 去重标记（T5.3 兼容）
let _cfgCache = null;         // 解密后的内存明文 cfg
const DK_KEY = PREFIX + "__dk"; // 设备密钥存储键（旧路径，仅迁移期间存在）
const DK_IDB_KEY = "__dk_v2";   // 设备密钥 IDB 键（不参与 idbQueueMirror 镜像命名空间）
let _dkIdbGet = () => Promise.resolve(null);  // 生产接线由 data-idb 块加载时 registerDkIdbHelpers 注册
let _dkIdbPut = () => Promise.resolve(false);
let _dkPromise = null;  // v3.7.62：ensureDeviceKey 在途去重（token 水合与 initCrypto 会并发调用）
/** 设备密钥的 IDB 存取接缝。
 *  v3.7.75 解耦：本块此前直接引用 idbReadKey/idbMirrorKey（data-idb 块的符号），
 *  构成一条 crypto→data-idb 逆层边；改为由 data-idb 加载时调用本函数反向注册
 *  （data-idb 在层序上晚于 crypto，data-idb→crypto 是正向边），注册未发生时
 *  保持默认禁用态（无 IDB 环境本就该禁用；jsdom 单测可照旧覆盖 _dkIdbGet/_dkIdbPut）。 */
function registerDkIdbHelpers(getFn, putFn){
  if(typeof getFn === "function") _dkIdbGet = (k)=>Promise.resolve(getFn(k)).then(v=>(v===null?null:v));
  if(typeof putFn === "function") _dkIdbPut = (k,v)=>Promise.resolve(putFn(k,v)).then(()=>true).catch(()=>false);
}
/* v3.7.95 修复（P0 · 设备密钥从不持久化）：
   上面 v3.7.75 的注释写着「data-idb 在层序上晚于 crypto，data-idb→crypto 是正向边」——
   **与实际相反**。SRC 块序实测：`data-idb` 是第 2 块、`crypto` 是第 10 块，即 data-idb 先加载。
   于是 data-idb 里那句 `if(typeof registerDkIdbHelpers === "function")` 必然为 false
   → 接线从未发生 → `_dkIdbGet`/`_dkIdbPut` 恒为默认实现（返回 null / false）
   → 设备密钥**既不写库也不读库**，每次页面加载重新生成一把新密钥
   → 用旧密钥加密的密文（AI Key 等）永久解不开。
   实测（真 Chromium，同 context 连续两次加载）：`ensureDeviceKey()` 导出的 raw 密钥两次不同。
   修法：本块加载时 data-idb 已就绪，按相反方向补接一次。这里**刻意用 globalThis 动态取符号**
   而非静态写 `idbReadKey`/`idbMirrorKey` —— 后者会重新引入 v3.7.75 刚消除的
   crypto→data-idb 静态逆层边（module-graph 会红）。函数声明会挂到 globalThis，运行时取得到。 */
try{
  const _g = (typeof globalThis !== "undefined") ? globalThis : (typeof window !== "undefined" ? window : null);
  /* 只看函数存在是不够的：jsdom 里 idbReadKey/idbMirrorKey 有定义（函数声明会挂到 window），
     但 indexedDB 不存在 —— 若此时接线，_dkIdbPut 会走进 idbTxn → idbOpen 的等待路径，
     在无 IDB 环境挂起（CI 实测：backup-export-exclusion 用例 5 waitFor 超时 17s × 3 次重试）。
     故必须同时确认 IDB **真的可用**；不可用则保持默认禁用态 —— 这正是上面 :16 注释
     「无 IDB 环境本就该禁用」的原意，此前漏判了这一半条件。 */
  const _idbOk = !!_g && (typeof _g.isIDBAvailable !== "function" || _g.isIDBAvailable() === true);
  if(_idbOk && typeof _g.idbReadKey === "function" && typeof _g.idbMirrorKey === "function"){
    registerDkIdbHelpers(_g.idbReadKey, _g.idbMirrorKey);
  }
}catch(e){ /* 接线失败不阻塞启动；_dkIdbGet/_dkIdbPut 保持默认（无 IDB 环境的既有行为） */ }

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
function _resetCrypto(){ _deviceKey = null; _cfgCache = null; _cryptoReady = false; _dkPromise = null; }
async function ensureDeviceKey(){
  if(_deviceKey) return _deviceKey;
  if(!_cryptoReady) return null;
  /* v3.7.62：在途去重。token 水合（_hydrateTokens）与 startup 的 initCrypto 会在同一 tick 内
     都触发设备密钥读取/生成；无去重时「首次生成」路径会生成两把不同的密钥并互相覆盖
     （内存与存储可能各留一把），下次启动即解不开本会话加密的数据。 */
  if(!_dkPromise) _dkPromise = _ensureDeviceKeyImpl().finally(() => { _dkPromise = null; });
  return _dkPromise;
}
async function _ensureDeviceKeyImpl(){
  /* SECURITY [H3 已清偿]：设备密钥优先存 IndexedDB（浏览器扩展注入脚本通常无 IDB 访问权，
   * 缩小 XSS 泄露面）。jsdom/无 IDB 环境回退旧 localStorage 路径。
   * 迁移顺序：读 IDB → 读旧键并迁移（写入成功且回读一致后才删旧键）→ 全新生成。
   * _dkIdbGet/_dkIdbPut 为可注入接缝（生产接 idbReadKey/idbMirrorKey；测试可覆盖）。 */
  const useIdb = (typeof indexedDB !== "undefined");
  try{
    if(useIdb){
      const idbRaw = await _dkIdbGet(DK_IDB_KEY);
      if(typeof idbRaw === "string" && idbRaw){
        try{
          _deviceKey = await crypto.subtle.importKey("raw", base64Decode(idbRaw), {name:"AES-GCM"}, false, ["encrypt","decrypt"]);
          return _deviceKey;
        }catch(e){
          /* 损坏则走重建 —— 但**必须上报**：重建意味着换新设备密钥，
             此前用旧密钥加密的 AI Key 等一切密文都再也解不开（用户侧表现为"配置莫名其妙没了"）。
             静默换键就是把数据损坏藏起来。 */
          try{ if(typeof pushDiag==="function") pushDiag("warn", "device key in IDB unreadable, regenerating (previously encrypted data becomes undecryptable): "+(e&&e.message||e), {where:"getDeviceKey:idb"}); }catch(_){}
        }
      }
    }
    const raw = localStorage.getItem(DK_KEY); // 旧路径迁移源
    if(raw){
      try{
        _deviceKey = await crypto.subtle.importKey("raw", base64Decode(raw), {name:"AES-GCM"}, false, ["encrypt","decrypt"]);
        if(useIdb){
          const ok = await _dkIdbPut(DK_IDB_KEY, raw);           // 先写新家
          if(ok && (await _dkIdbGet(DK_IDB_KEY)) === raw){       // 回读一致才删旧键
            try{ localStorage.removeItem(DK_KEY); }catch(e){
              /* 旧键没删掉不影响正确性（新家已验证），但残留会让下次启动再走一遍迁移，值得记一笔 */
              try{ if(typeof pushDiag==="function") pushDiag("warn", "legacy device key not cleared: "+(e&&e.message||e), {where:"getDeviceKey:clearLegacy"}); }catch(_){}
            }
          }
        }
        return _deviceKey;
      }catch(e){
        /* 损坏则重建 —— 同 IDB 分支：换新键即旧密文永久解不开，不许静默 */
        try{ if(typeof pushDiag==="function") pushDiag("warn", "legacy device key unreadable, regenerating (previously encrypted data becomes undecryptable): "+(e&&e.message||e), {where:"getDeviceKey:legacy"}); }catch(_){}
      }
    }
    _deviceKey = await crypto.subtle.generateKey({name:"AES-GCM", length:256}, true, ["encrypt","decrypt"]);
    const exported = await crypto.subtle.exportKey("raw", _deviceKey);
    const b64 = base64Encode(new Uint8Array(exported));
    if(useIdb) await _dkIdbPut(DK_IDB_KEY, b64);
    else localStorage.setItem(DK_KEY, b64); // 无 IDB 环境维持旧行为
    return _deviceKey;
  }catch(e){
    _deviceKey = null;
    return null;
  }
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
 * cfg 落盘结果的统一出口：save() 返回 false（配额满 / 隐私模式 / 存储被禁用）时**必须留痕**。
 * 此前 persistCfg 把 save() 的返回值丢掉，于是"配置没写进去"这件事在日志里完全不存在，
 * 而调用方一律以为成功。
 * @param {boolean} ok save() 的返回
 * @param {string} where 分支标记（electron / no-crypto / encrypt）
 * @returns {boolean} 原样回传，便于 persistCfg 直接 return
 */
function _cfgWrite(ok, where){
  if(ok === true) return true;
  try{ if(typeof pushDiag === "function") pushDiag("error", "cfg write to localStorage FAILED (settings are not persisted; AI Key may still sit in plaintext): where=" + where, { where: "persistCfg:" + where }); }catch(_){}
  return false;
}
/**
 * 持久化 cfg：浏览器模式加密每个 profile 的 key 后写 localStorage；Electron 模式 Key 交主进程
 * @param {Cfg} cfg
 * @returns {Promise<boolean>} 配置是否真的落盘成功（写失败必须让调用方知道：
 *   旧明文迁移那一支，写失败意味着 **AI Key 继续以明文躺在 localStorage**，属隐私面，不能静默）
 */
async function persistCfg(cfg){
  // Electron 模式：Key 由主进程保管，渲染进程只持久化非敏感配置（P0-3）
  if(isElectron()){
    const rest = Object.assign({}, cfg);
    if(Array.isArray(rest.profiles)){
      rest.profiles = rest.profiles.map(p => Object.assign({}, p, { key: "" }));
    }
    return _cfgWrite(save(PREFIX+"cfg", rest), "electron");
  }
  // D4 安全护栏：Web Crypto 不可用时，绝不写入明文 Key。
  // 仅持久化非敏感配置（profiles 元数据/启用状态等），丢弃 Key 并提示用户重新在安全上下文录入。
  if(!_cryptoReady){
    const safe = Object.assign({}, cfg);
    if(Array.isArray(safe.profiles)){
      safe.profiles = safe.profiles.map(p => Object.assign({}, p, { key: "" }));
    }
    if(typeof safe.key === "string"){ delete safe.key; }
    const okD4 = save(PREFIX+"cfg", safe);
    try{ if(typeof toast === "function") toast(t("crypto.unsupportedToast", "⚠️ 当前环境不支持加密存储，AI Key 出于安全未保存（已丢弃）。请在 https:// 或本机应用中重新录入。"), "warn"); }catch(e){ /* noop */ }
    return _cfgWrite(okD4, "no-crypto");
  }
  const mem = Object.assign({}, cfg);
  // 多 Profile：遍历加密每个 profile 的 key
  if(Array.isArray(mem.profiles)){
    mem.profiles = await Promise.all(mem.profiles.map(async p => {
      const np = Object.assign({}, p);
      if(typeof np.key === "string" && np.key){
        try{ np.key = await encryptKey(np.key); }
        catch(e){
          /* D4：加密失败则丢弃，不落明文。v3.7.59：补诊断——静默丢 Key 会让用户
             「填了 Key、当时能用、重启后失效」，且日志里毫无线索（本项目 732 个 catch 中
             仅 52 处上报 pushDiag，密钥路径此前不在其中）。 */
          np.key = "";
          try{ pushDiag("error", "encryptKey failed, key dropped: "+(e&&e.message||e), {where:"persistCfg", profile:p && p.id}); }catch(_){}
        }
      }
      return np;
    }));
  }
  // 兼容：若仍存在顶层 key（旧数据未迁移），也加密
  if(typeof mem.key === "string" && mem.key){
    try{ mem.key = await encryptKey(mem.key); }
    catch(e){ delete mem.key; } // D4：加密失败则丢弃
  }
  return _cfgWrite(save(PREFIX+"cfg", mem), "encrypt");
}
/**
 * 初始化加密：检测 Web Crypto 可用性、生成/导入设备密钥、解密 cfg 中所有 profile 的 key 到内存
 * @returns {Promise<Cfg>} 解密后的内存明文 cfg
 */
async function initCrypto(){
  /* IDB 接线已在 data-idb 块加载时经 registerDkIdbHelpers 注册（v3.7.75 解耦），此处无需再接 */
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
    try{ console.warn("[Agent Workshop] " + t("debug.cryptoUnavailable","Web Crypto API 不可用，AI Key 将明文存储于 localStorage")); }catch(e){ /* noop */ }
  }
  const raw = load(PREFIX+"cfg", {});

  // Electron 模式：Key 由主进程保管。渲染进程不解密、不持有明文 Key（P0-3）
  if(isElectron()){
    // F3：一次性把 profiles 结构上报主进程（消除「多 profile 循环 setAiConfig 后者覆盖前者」）
    const profilesOut = [];
    if(raw && Array.isArray(raw.profiles)){
      for(const p of raw.profiles){
        let legacy = "";
        if(p.key && isEncKey(p.key)){ try{ legacy = await decryptKey(p.key); }catch(e){ legacy = ""; } }
        else if(typeof p.key === "string" && p.key){ legacy = p.key; }
        profilesOut.push({ id: p.id || "__legacy__", base: p.base||"", model: p.model||"", key: legacy || undefined });
      }
      raw.profiles = raw.profiles.map(p => Object.assign({}, p, { key: "" }));
      save(PREFIX+"cfg", raw);
    } else if(raw && raw.key){
      // 旧版单 cfg 迁移
      let legacy = "";
      if(isEncKey(raw.key)){ try{ legacy = await decryptKey(raw.key); }catch(e){ legacy = ""; } }
      else if(typeof raw.key === "string" && raw.key){ legacy = raw.key; }
      profilesOut.push({ id: raw.activeId || "__legacy__", base: raw.base||"", model: raw.model||"", key: legacy || undefined });
      const rest = Object.assign({}, raw); delete rest.key;
      save(PREFIX+"cfg", rest);
    }
    if(profilesOut.length){
      try{ await window.electronAPI.setAiConfig({ enabled: !!raw.enabled, profiles: profilesOut }); }catch(e){
        /* 镜像到主进程失败 = 桌面版的 chat 走的仍是主进程里的旧配置（或干脆没 Key）。
           此前这里只有一句"忽略"，用户看到的是"改完配置不生效"且无从查证。 */
        try{ if(typeof pushDiag==="function") pushDiag("error", "AI config mirror to main process failed (desktop chat may still use stale key): "+(e&&e.message||e), {where:"initCrypto:mirrorMain", profiles:profilesOut.length}); }catch(_){}
      }
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
        try{ np.key = await decryptKey(np.key); needRepersist = true; }
        catch(e){
          /* v3.7.59：解密失败 = 设备密钥换了/密文损坏，Key 实际已丢失。
             此前只把 np.key 置空，界面上表现为「AI 未配置」，用户无从判断是"没填过"
             还是"填过但解不开"。补诊断以便定位（含是否 IDB 可用等上下文）。 */
          np.key = "";
          try{ pushDiag("error", "decryptKey failed, key unusable: "+(e&&e.message||e), {where:"initCrypto", profile:p && p.id}); }catch(_){}
        }
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
    /* persistCfg 不 reject —— 写失败是它的**返回值**，只看 try/catch 就是装饰（第一版我就踩了）。
       失败 = AI Key 继续以明文留在 localStorage，属隐私外泄面，必须点名。 */
    try{
      const okRepersist = await persistCfg(_cfgCache);
      if(okRepersist === false) _repersistFailed(new Error("save() returned false"), "returned-false");
    }catch(e){ _repersistFailed(e, "threw"); }
  }
  return _cfgCache;
}
/** 明文迁移没落盘的上报出口（与 persistCfg 内部的写失败分开记，便于定位是哪一层没写成） */
function _repersistFailed(e, how){
  try{ if(typeof pushDiag==="function") pushDiag("error", "plaintext AI key re-persist failed (" + how + "), key stays unencrypted in storage: "+(e&&e.message||e), {where:"initCrypto:repersist"}); }catch(_){}
}
function isElectron(){ return typeof window.electronAPI !== "undefined"; }
