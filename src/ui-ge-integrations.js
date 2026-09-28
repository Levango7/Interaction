// ===== UI Layer (交互层·全局事件绑定·集成框架与废弃簇) =====
/* ===== v3.7.60 集成同步 / 通知层：标记废弃，等渠道定案（不删、不接）=====
   真实 Chromium 逐 provider 实测（_probe/integration-census.mjs）的定性结论：
   · **活着的**：`*Connect` / `*Disconnect` 七个 + 面板渲染 + 凭据落盘 —— 由
     openIntegrationConfig 用 `window[name + "Connect"]` 字符串拼接派发（静态普查看不见这条边，
     所以本簇曾被误判为零引用死码）。连接确实打到各服务商的验证端点。
   · **零调用方的**：下面标了 @deprecated 的 30 个函数（约 855 行）—— 同步任务 / 笔记 / 日程、
     发消息、从消息建任务、状态映射等。连上七个 provider 后跑「建任务 / 完成任务 / 通知 /
     到期检查」，集成域名 0 次外发；UI 里也没有任何"同步到 X"入口。
   处置：**只标记，不动代码**。删掉还是把渠道接下去，是产品决策（用户 2026-09-28 定：
   「先标记废弃，等我定好渠道再动」）。渠道定案后：
     - 若要接：给这些函数找/建一个消费点（任务变更钩子、通知分发、日程同步），
       逐个摘掉 @deprecated 并补真发请求的用例；
     - 若要删：连同 `__test` 桥条目、i18n 键一起清，并登记进 docs/product-scope.md §三。
   守护：tests/integration-deprecated.test.js 锁住「这些函数仍然零调用 + 标记仍在」。 */
/* @deprecated v3.7.60 应用内零调用方（同步 / 通知尚未接线）· 渠道定案前勿新增调用点或在其上加 UI · 见 docs/product-scope.md §三 */
function integrationGetStatus(name){
  const p = integrationGetProvider(name);
  if(!p) return { connected:false, reason:"not_registered" };
  if(!p.enabled) return { connected:false, reason:"disabled" };
  if(p.config && p.config._verified === false) return { connected:false, reason:"verify_failed" };
  return { connected:true, verified:!!(p.config && p.config._verified) };
}
/* @deprecated v3.7.60 应用内零调用方（同步 / 通知尚未接线）· 渠道定案前勿新增调用点或在其上加 UI · 见 docs/product-scope.md §三 */
async function _intNotionPullWriteback(){
  let synced = [];
  try{ synced = notionListSynced() || []; }catch(e0){ return 0; }
  const tasks = getTasks(); let n = 0;
  for(let i = 0; i < synced.length; i++){
    const it = synced[i];
    if(it.type && it.type !== "task") continue;
    let idx = -1;
    for(let j = 0; j < tasks.length; j++){ if(tasks[j].id === it.localId){ idx = j; break; } }
    if(idx < 0) continue;
    let r = null;
    try{ r = await notionSyncTask(tasks[idx], "pull"); }catch(e1){ r = null; }
    if(r && r.success && r.updatedTask){
      tasks[idx] = Object.assign({}, tasks[idx], r.updatedTask);
      n++;
    }
  }
  if(n > 0) setTasks(tasks);
  return n;
}



// ===== v1.7-A AI 深度增强：已于 v3.7.59 整段移除（死代码清仓） =====
/* 被删掉的是四大能力共 34 个顶层函数 + 2 个模块级状态 + 3 个持久化键：
 *   1) agentPlan / agentExecuteStep / agentVerify / agentReflect / agentRun（关键词猜工具的本地规划）
 *   2) saveConversation / loadConversation / listConversations / summarizeConversation
 *      / getRelevantMemory / addLongTermMemory（含 _textToVector/_cosineSimilarity 这套词袋假向量）
 *   3) buildIndex / tfidfScore / ragRetrieve / ragAugment / indexFromNotes / indexFromTasks
 *      / saveRagIndex / loadRagIndex（v1.7-A 自己的 TF-IDF 索引，v3.7.57 起已无任何读取方）
 *   4) reviewCode / detectSecurityIssues / suggestOptimization / reviewScore（本地模式匹配冒充 AI 审查）
 * 判据不是看着没用，而是 reach4 --contain 实测「区间外引用 0 处」：
 * 无 UI 入口、无测试引用、也没上 __test 导出桥。曾指向它们的两处活代码一并处理：
 *   - aiDecomposeTask 的 opts.useLocalPlan 分支（全仓没有任何调用方传该选项）
 *   - 笔记变更钩子 _notifyNotesChanged / _onNotesChanged（在刷一份没人读的旧索引）
 * 替代关系：AI 自主执行 = 命令面板 > 前缀 → proposeAgentPlan 先出计划 → 用户回「确认执行」
 *   → executeAgentPlan（破坏性步骤被 DANGER_CONFIRM_TOOLS 拦下）；
 *   语义检索 = ai-tools.js 的 ragSearch / getRagDocs（CJK 二元组 BM25 + provider 向量 + RRF）。
 * 要考古就从 git 历史取回（本提交的上一版）。孤儿 i18n 键保留：按仓库口径未使用不判红。
 */

/* ---------- v3.7.58（诚实性收口）：移除 54-离线AI / 55-ML预测 / 56-智能排期 / 57-情绪分析 ----------
 * 四个子系统均为「无 UI 入口、无测试引用、零外部调用」的沉睡框架：假进度条 + 模拟引擎对象 +
 * 指向不存在文件的 ONNX 模型表（assets/onnx/ 从未存在）。按 product-scope 的
 * 「stub + 活 UI = 虚假功能」纪律自本版起整段移除（2276 行），已登记 docs/product-scope.md §三。
 * 需要时可从 git 历史恢复（本提交的上一版）。配套清理：data-idb 的模型缓存四助手、p5.* 孤儿 i18n 键。
 * ------------------------------------------------------------------------ */
// ----------------------------------------------------------------------------
// 七大集成能力：
//   (1) 集成 Provider 注册管理（注册/启用/禁用/配置各 provider）
//   (2) Notion 集成（双向同步任务/笔记，OAuth2 授权）
//   (3) Linear/Jira 集成（issue 双向同步，状态映射）
//   (4) Slack/飞书/钉钉 集成（消息通知 + 任务创建/更新事件推送）
//   (5) 日历同步（Google Calendar/Outlook 日历事件双向同步框架）
//   (6) 开放 API 框架（API Key 管理 + 速率限制）
//   (7) 集成 Provider 注册管理
//
// 命名说明（避免与现有模块冲突）：
//   - 所有公开函数以 integration / notion / linear / jira / slack / feishu / dingtalk /
//     calendar / openApi 前缀命名
//   - 持久化键：wb_integration_*（不加 PREFIX，与 59/60/61/63/64 一致）
//   - 不与 49-automation.js 的 webhook 冲突（49 是自动化规则触发，本模块的事件推送
//     通过 64-webhook-bus.js 的 webhookEmit 进行）
//   - 不与 63-oauth2.js 冲突（本模块通过 oauth2* 接口调用 OAuth2 框架）
//
// 注意：
//   - 所有外部 HTTP 请求通过可注入的 _integrationHttpClient 进行（默认 fetch）
//   - 集成框架仅提供接口，不实际发送请求（测试中 mock）
// ----------------------------------------------------------------------------

/* ---------- 持久化键 ---------- */
const INTEGRATION_PROVIDERS_KEY = "wb_integration_providers";
const INTEGRATION_SYNC_STATE_KEY = "wb_integration_sync_state";
const INTEGRATION_API_KEYS_KEY = "wb_integration_api_keys";
const INTEGRATION_RATE_LIMITS_KEY = "wb_integration_rate_limits";

/* ---------- 集成类型常量 ---------- */
const INTEGRATION_TYPES = {
  NOTION: "notion",
  LINEAR: "linear",
  JIRA: "jira",
  SLACK: "slack",
  FEISHU: "feishu",
  DINGTALK: "dingtalk",
  GOOGLE_CALENDAR: "google_calendar",
  OUTLOOK_CALENDAR: "outlook_calendar"
};

/* ---------- 状态映射表（Linear/Jira 状态 ↔ 本地任务状态） ---------- */
const LINEAR_STATUS_MAP = {
  "todo": "Backlog",
  "in_progress": "In Progress",
  "done": "Done",
  "canceled": "Canceled"
};
const JIRA_STATUS_MAP = {
  "todo": "To Do",
  "in_progress": "In Progress",
  "done": "Done",
  "canceled": "Won't Do"
};

/* ---------- 模块级私有状态（var 声明，避免 TDZ） ---------- */
let _integrationProviders = {};  // { name: { name, type, config, enabled, createdAt } }
let _integrationSyncState = {};  // { providerName: { lastSyncAt, syncedItems: { localId: remoteId } } }
let _integrationApiKeys = {};    // { keyId: { id, name, key, scopes, createdAt, revokedAt } }
let _integrationRateLimits = {}; // { keyId: { limit, windowMs, windowStart, count } }
let _integrationHttpClient = null; // 可注入的 HTTP 客户端

/* ---------- 工具函数（v1.8.2：localStorage / 时间戳改为引用共享实现） ---------- */
const _intSafeLSGet = _sharedSafeLSGet;
const _intSafeLSSet = _sharedSafeLSSet;
const _intSafeLSRemove = _sharedSafeLSRemove;
function _intUid(prefix){
  return (prefix || "int_") + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10);
}
const _intNow = _sharedNowISO;

/* ---------- 敏感字段加密持久化（P0 存储层专项） ----------
 * 密封/解封为纯函数：状态进、Promise 出，enc/dec 由注入决定，便于单测。
 * D4 原则对齐 persistCfg()：crypto 不可用时**丢弃**敏感值而不落明文。
 * 已是 {__enc:true,...} 的值幂等跳过；旧明文数据读时原样使用、下次保存自动升级为密文。 */
function _intIsSensitiveField(name){
  const n = String(name || "").toLowerCase();
  if(n === "key" || n === "password") return true;
  const parts = n.split(/[^a-z0-9]+/);
  return parts.some(p => p === "secret" || p === "token" || p === "key" || p === "password" || p === "apikey");
}
function _intIsSealed(v){ return v && typeof v === "object" && v.__enc === true && typeof v.iv === "string" && typeof v.data === "string"; }
/**
 * 深度密封：敏感字段的明文值经 encFn 变 {__enc,iv,data}；disabled 时删除该字段
 * @param {*} node - 任意嵌套对象/数组/原始值
 * @param {{enc:(plain:string)=>Promise<object>, enabled:boolean}} io
 * @returns {Promise<*>} 新结构（不改入参）
 */
async function _intSealState(node, io){
  if(Array.isArray(node)){
    const out = [];
    for(const item of node) out.push(await _intSealState(item, io));
    return out;
  }
  if(node && typeof node === "object"){
    const out = {};
    for(const k of Object.keys(node)){
      const v = node[k];
      if(_intIsSensitiveField(k)){
        if(_intIsSealed(v)){ out[k] = v; continue; }          // 已密封，幂等
        if(typeof v === "string" && v){                        // 明文字符串才处理
          if(!io.enabled) continue;                            // D4：不可加密→丢弃不落盘
          try{ out[k] = await io.enc(v); }catch(e){ continue; }// 加密失败→丢弃
          continue;
        }
        // 非字符串敏感位（如空串/null）：disabled 同样不留痕；enabled 且为普通对象则深走
        if(!io.enabled){ continue; }
        out[k] = await _intSealState(v, io);
        continue;
      }
      out[k] = (v && typeof v === "object") ? await _intSealState(v, io) : v;
    }
    return out;
  }
  return node;
}
/**
 * 深度解封：{__enc,iv,data} 经 decFn 还原明文（仅内存，触发落盘不回写）
 * @param {*} node
 * @param {{dec:(sealed:object)=>Promise<string>, enabled:boolean}} io
 * @returns {Promise<*>}
 */
async function _intUnsealState(node, io){
  if(Array.isArray(node)){
    const out = [];
    for(const item of node) out.push(await _intUnsealState(item, io));
    return out;
  }
  if(node && typeof node === "object"){
    const out = {};
    for(const k of Object.keys(node)){
      const v = node[k];
      if(_intIsSensitiveField(k) && _intIsSealed(v)){
        if(!io.enabled){ continue; }                            // crypto 失效环境不解出也不保留密文于内存明文路径
        try{ out[k] = String(await io.dec(v)); }
        catch(e){ delete out[k]; }                              // 解不开（换设备等）→ 字段置缺
        continue;
      }
      out[k] = (v && typeof v === "object") ? await _intUnsealState(v, io) : v;
    }
    return out;
  }
  return node;
}
/* 保存链：序列化写盘请求，防止并发快照乱序覆盖 */
let _intPersistChain = Promise.resolve();
function _intQueuePersist(key, snapshot, cacheObj){
  _intPersistChain = _intPersistChain.then(async () => {
    try{
      const sealed = await _intSealState(snapshot, {
        enabled: (typeof _cryptoReady !== "undefined" && _cryptoReady),
        enc: (p)=>encryptKey(p),
      });
      _intSafeLSSet(key, JSON.stringify(sealed));
      /* 读时升级完成后内存仍是明文真相源；无额外回写需要 */
    }catch(e){
      try{ pushDiag("error", "integration persist seal: "+(e&&e.message||e), {op:"persist_seal"}); }catch(e2){}
    }
  }).catch(()=>{});
}
/** 注水：把磁盘读入的密封态在内存中解开成明文真相源（异步，fire-and-forget） */
let _intHydrating = null;
function _intKickHydrate(storeKey, target, keysWhitelist){
  const keys = keysWhitelist || Object.keys(target);
  if(!keys.length) return;
  const io = { enabled: (typeof _cryptoReady !== "undefined" && _cryptoReady), dec: (s)=>decryptKey(s) };
  _intHydrating = Promise.all(keys.map(async k => {
    try{ target[k] = await _intUnsealState(target[k], io); }
    catch(e){ try{ delete target[k]; }catch(e2){} }
  })).catch(function(){});
}
function _intAwaitHydrated(){
  return (_intHydrating || Promise.resolve()).catch(function(){});
}

let _apiKeysLoaded = false; let _syncStateLoaded = false;
let _providersLoaded = false;
function _intResetIntegrationCache(){ _providersLoaded=false; _apiKeysLoaded=false; _syncStateLoaded=false; } // 首载守卫：内存是明文真相源，重复读盘会用密封态覆盖内存
function _intLoadProviders(){
  if(_providersLoaded) return;
  const raw = _intSafeLSGet(INTEGRATION_PROVIDERS_KEY);
  if(!raw){ _integrationProviders = {}; _providersLoaded = true; return; }
  try{
    const parsed = JSON.parse(raw);
    _integrationProviders = (parsed && typeof parsed === "object") ? parsed : {};
    _intKickHydrate(INTEGRATION_PROVIDERS_KEY, _integrationProviders);   // 密文态会被就地解开
  }catch(e){ _integrationProviders = {}; }
  _providersLoaded = true;
}
function _intSaveProviders(){
  /* 快照后异步密封落盘；调用方零改动（12 处），写序由 _intPersistChain 保证 */
  _intQueuePersist(INTEGRATION_PROVIDERS_KEY, JSON.parse(JSON.stringify(_integrationProviders)));
}
function _intLoadSyncState(){
  if(_syncStateLoaded) return;
  const raw = _intSafeLSGet(INTEGRATION_SYNC_STATE_KEY);
  if(!raw){ _integrationSyncState = {}; _syncStateLoaded = true; return; }
  try{
    const parsed = JSON.parse(raw);
    _integrationSyncState = (parsed && typeof parsed === "object") ? parsed : {};
  }catch(e){ _integrationSyncState = {}; }
  _syncStateLoaded = true;
}
function _intSaveSyncState(){
  _intSafeLSSet(INTEGRATION_SYNC_STATE_KEY, JSON.stringify(_integrationSyncState));
}
function _intLoadApiKeys(){
  if(_apiKeysLoaded) return;
  const raw = _intSafeLSGet(INTEGRATION_API_KEYS_KEY);
  if(!raw){ _integrationApiKeys = {}; _apiKeysLoaded = true; return; }
  try{
    const parsed = JSON.parse(raw);
    _integrationApiKeys = (parsed && typeof parsed === "object") ? parsed : {};
    _intKickHydrate(INTEGRATION_API_KEYS_KEY, _integrationApiKeys);
  }catch(e){ _integrationApiKeys = {}; }
  _apiKeysLoaded = true;
}
function _intSaveApiKeys(){
  _intQueuePersist(INTEGRATION_API_KEYS_KEY, JSON.parse(JSON.stringify(_integrationApiKeys)));
}
function _intLoadRateLimits(){
  const raw = _intSafeLSGet(INTEGRATION_RATE_LIMITS_KEY);
  if(!raw){ _integrationRateLimits = {}; return; }
  try{
    const parsed = JSON.parse(raw);
    _integrationRateLimits = (parsed && typeof parsed === "object") ? parsed : {};
  }catch(e){ _integrationRateLimits = {}; }
}
function _intSaveRateLimits(){
  _intSafeLSSet(INTEGRATION_RATE_LIMITS_KEY, JSON.stringify(_integrationRateLimits));
}

/* ---------- 内部：Jira 站点域名 → 安全 base ----------
   Jira 的域名是用户填的自由文本，且会被拼成**请求主机位**并带上 API Token。
   不校验就等于把凭据发往任意主机 —— 实测（v3.7.60，_probe/integration-census.mjs）：
     domain="evil.example.com/?x="  →  https://evil.example.com/?x=/rest/api/3/myself
     domain="attacker.io/@x"        →  https://attacker.io/@x/rest/api/3/myself
   两者都带着 `Authorization: Bearer <token>`，而 CSP 的 `connect-src https:` 不拦任何 https 主机。
   规则：只接受「纯主机名（可带端口）」。允许用户直接粘贴 https:// 前缀；
   拒绝路径 / 查询 / 片段 / 账号信息 —— 这些正是拼 URL 注入的载体。
   不限制成 *.atlassian.net：Jira Server / Data Center 用自建域名是正常部署形态。
   返回 null 表示域名不合法，调用方**必须**放弃请求（不要退回裸拼）。 */
function _intJiraBase(domain){
  const raw = String(domain || "").trim();
  /* 前导 `/` 显式拒掉：`new URL("https:////a.com")` 会被 Chromium 归一成 host=a.com（结果无害），
     但「站点域名」字段本就不该以斜杠开头，靠解析器怪癖放行不如直接判死。
     可见 ASCII 判据同时挡掉空白与控制字符 —— 这条是**有牙齿的**：Chromium 会剥掉 URL 里的
     tab/换行，`a.com\tevil.io` 若不挡会被拼成 `a.comevil.io`（两个主机粘连）。
     （写成"必须全在 ! 到 ~ 之间"而不是 /[\s\x00-\x1f]/，是为了不触发 eslint no-control-regex。） */
  if(!raw || raw.startsWith("/") || !/^[\x21-\x7e]+$/.test(raw)) return null;
  let u;
  try{ u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : "https://" + raw); }
  catch(e){ return null; }
  if(u.protocol !== "https:") return null;
  if(u.username || u.password) return null;
  if(u.search || u.hash) return null;
  if(u.pathname !== "/" && u.pathname !== "") return null;
  if(!/^[a-z0-9]([a-z0-9.\-_]*[a-z0-9])?$/i.test(u.hostname)) return null;
  return "https://" + u.hostname + (u.port ? ":" + u.port : "");
}

/* ---------- 内部：HTTP 请求 ---------- */
async function _intDoRequest(url, opts){
  const client = _integrationHttpClient || (typeof fetch !== "undefined" ? fetch : null);
  if(!client) return { ok: false, status: 0, error: "no_http_client" };
  try{
    const resp = await client(url, opts || {});
    if(!resp) return { ok: false, status: 0, error: "no_response" };
    let body = null;
    try{ body = await resp.json(); }catch(e){ /* 非 JSON */ }
    return { ok: !!resp.ok, status: resp.status, body: body };
  }catch(e){
    return { ok: false, status: 0, error: e && e.message ? e.message : String(e) };
  }
}

/* ============================================================
 * 1. 集成 Provider 注册管理
 * ============================================================ */

/**
 * 注册集成 provider
 * @param {string} name - provider 名称（唯一标识）
 * @param {string} type - provider 类型（INTEGRATION_TYPES 之一）
 * @param {Object} config - 配置（如 { token, workspaceId, ... }）
 * @returns {Object|null} provider 对象或 null（参数无效）
 */
function integrationRegisterProvider(name, type, config){
  if(!name || typeof name !== "string") return null;
  if(!type || typeof type !== "string") return null;
  const validTypes = Object.keys(INTEGRATION_TYPES).map(function(k){ return INTEGRATION_TYPES[k]; });
  if(validTypes.indexOf(type) === -1) return null;
  config = config || {};
  _intLoadProviders();
  const provider = {
    name: name,
    type: type,
    config: config,
    enabled: true,
    createdAt: _intNow(),
    updatedAt: _intNow()
  };
  _integrationProviders[name] = provider;
  _intSaveProviders();
  return provider;
}

/**
 * 获取 provider
 * @param {string} name - provider 名称
 * @returns {Object|null} provider 对象
 */
function integrationGetProvider(name){
  if(!name) return null;
  _intLoadProviders();
  return _integrationProviders[name] || null;
}

/**
 * 列出所有 provider（可按类型过滤）
 * @param {string} [type] - 类型过滤
 * @returns {Array} provider 列表
 * @deprecated v3.7.60 应用内零调用方（同步 / 通知尚未接线）· 渠道定案前勿新增调用点或在其上加 UI · 见 docs/product-scope.md §三
 */
function integrationListProviders(type){
  _intLoadProviders();
  const result = [];
  for(const name in _integrationProviders){
    const p = _integrationProviders[name];
    if(type && p.type !== type) continue;
    result.push(p);
  }
  return result;
}

/**
 * 启用 provider
 * @param {string} name - provider 名称
 * @returns {boolean} 是否成功
 * @deprecated v3.7.60 应用内零调用方（同步 / 通知尚未接线）· 渠道定案前勿新增调用点或在其上加 UI · 见 docs/product-scope.md §三
 */
function integrationEnableProvider(name){
  if(!name) return false;
  _intLoadProviders();
  if(!_integrationProviders[name]) return false;
  _integrationProviders[name].enabled = true;
  _integrationProviders[name].updatedAt = _intNow();
  _intSaveProviders();
  return true;
}

/**
 * 禁用 provider
 * @param {string} name - provider 名称
 * @returns {boolean} 是否成功
 * @deprecated v3.7.60 应用内零调用方（同步 / 通知尚未接线）· 渠道定案前勿新增调用点或在其上加 UI · 见 docs/product-scope.md §三
 */
function integrationDisableProvider(name){
  if(!name) return false;
  _intLoadProviders();
  if(!_integrationProviders[name]) return false;
  _integrationProviders[name].enabled = false;
  _integrationProviders[name].updatedAt = _intNow();
  _intSaveProviders();
  return true;
}

/**
 * 移除 provider
 * @param {string} name - provider 名称
 * @returns {boolean} 是否成功
 */
function integrationRemoveProvider(name){
  if(!name) return false;
  _intLoadProviders();
  if(!_integrationProviders[name]) return false;
  delete _integrationProviders[name];
  _intSaveProviders();
  // 同时移除同步状态
  _intLoadSyncState();
  if(_integrationSyncState[name]){
    delete _integrationSyncState[name];
    _intSaveSyncState();
  }
  return true;
}

/**
 * 更新 provider 配置
 * @param {string} name - provider 名称
 * @param {Object} config - 新配置（合并到现有配置）
 * @returns {boolean} 是否成功
 * @deprecated v3.7.60 应用内零调用方（同步 / 通知尚未接线）· 渠道定案前勿新增调用点或在其上加 UI · 见 docs/product-scope.md §三
 */
function integrationConfigureProvider(name, config){
  if(!name || !config || typeof config !== "object") return false;
  _intLoadProviders();
  if(!_integrationProviders[name]) return false;
  for(const k in config){
    _integrationProviders[name].config[k] = config[k];
  }
  _integrationProviders[name].updatedAt = _intNow();
  _intSaveProviders();
  return true;
}

/* ---------- 内部：检查 provider 是否可用 ---------- */
async function _intRequireProvider(name, expectedType){
  if(!name) return null;
  _intLoadProviders();
  await _intAwaitHydrated();   // 注水完成后再取用（密文→明文真相源）
  const p = _integrationProviders[name];
  if(!p || !p.enabled) return null;
  if(expectedType && p.type !== expectedType) return null;
  return p;
}

/* ---------- 内部：同步状态管理 ---------- */
function _intGetSyncState(providerName){
  _intLoadSyncState();
  if(!_integrationSyncState[providerName]){
    _integrationSyncState[providerName] = {
      lastSyncAt: null,
      syncedItems: {} // { localId: { remoteId, remoteUpdatedAt, type } }
    };
  }
  return _integrationSyncState[providerName];
}
function _intRecordSync(providerName, localId, remoteId, type){
  const state = _intGetSyncState(providerName);
  state.syncedItems[localId] = {
    remoteId: remoteId,
    type: type,
    syncedAt: _intNow()
  };
  state.lastSyncAt = _intNow();
  _intSaveSyncState();
}
/* @deprecated v3.7.60 应用内零调用方（同步 / 通知尚未接线）· 渠道定案前勿新增调用点或在其上加 UI · 见 docs/product-scope.md §三 */
function _intFindLocalId(providerName, remoteId){
  const state = _intGetSyncState(providerName);
  for(const localId in state.syncedItems){
    if(state.syncedItems[localId].remoteId === remoteId) return localId;
  }
  return null;
}

/* ============================================================
 * 2. Notion 集成（双向同步任务/笔记）
 * ============================================================ */

/**
 * 连接 Notion（注册 provider + 验证 token）
 * @param {Object} config - { token, databaseId, notesDatabaseId }
 * @returns {Object|null} provider 对象或 null
 */
async function notionConnect(config){
  if(!config || !config.token) return null;
  const provider = integrationRegisterProvider("notion", INTEGRATION_TYPES.NOTION, config);
  if(!provider) return null;
  // 验证 token（调用 Notion API /v1/users/me）
  const resp = await _intDoRequest("https://api.notion.com/v1/users/me", {
    method: "GET",
    headers: {
      "Authorization": "Bearer " + config.token,
      "Notion-Version": "2022-06-28"
    }
  });
  provider.config._verified = !!resp.ok;
  provider.config._lastVerifiedAt = _intNow();
  _intSaveProviders();
  return provider;
}

/**
 * 同步任务到 Notion（双向）
 * @param {Object} task - 本地任务 { id, title, status, ... }
 * @param {string} direction - 'push' | 'pull' | 'sync'（默认 sync）
 * @returns {Promise<Object>} 同步结果 { success, action, remoteId, localId }
 * @deprecated v3.7.60 应用内零调用方（同步 / 通知尚未接线）· 渠道定案前勿新增调用点或在其上加 UI · 见 docs/product-scope.md §三
 */
async function notionSyncTask(task, direction){
  if(!task || !task.id) return { success: false, error: "invalid_task" };
  direction = direction || "sync";
  const provider = await _intRequireProvider("notion", INTEGRATION_TYPES.NOTION);
  if(!provider) return { success: false, error: "provider_not_available" };

  const state = _intGetSyncState("notion");
  const syncInfo = state.syncedItems[task.id];
  const databaseId = provider.config.databaseId;
  const token = provider.config.token;
  const headers = {
    "Authorization": "Bearer " + token,
    "Notion-Version": "2022-06-28",
    "Content-Type": "application/json"
  };

  // push：本地 → Notion
  if(direction === "push" || direction === "sync"){
    let resp;
    if(syncInfo){
      // 更新已有页面
      resp = await _intDoRequest("https://api.notion.com/v1/pages/" + syncInfo.remoteId, {
        method: "PATCH",
        headers: headers,
        body: JSON.stringify(_intNotionBuildPageProperties(task, databaseId))
      });
      if(resp.ok){
        _intRecordSync("notion", task.id, syncInfo.remoteId, "task");
        if(direction === "push") return { success: true, action: "updated", remoteId: syncInfo.remoteId, localId: task.id };
      }
    }else{
      // 创建新页面
      resp = await _intDoRequest("https://api.notion.com/v1/pages", {
        method: "POST",
        headers: headers,
        body: JSON.stringify(_intNotionBuildPageProperties(task, databaseId))
      });
      if(resp.ok && resp.body && resp.body.id){
        _intRecordSync("notion", task.id, resp.body.id, "task");
        if(direction === "push") return { success: true, action: "created", remoteId: resp.body.id, localId: task.id };
      }
    }
  }

  // pull：Notion → 本地（这里仅返回框架结果，实际应更新本地任务）
  if(direction === "pull" || direction === "sync"){
    let resp;
    if(syncInfo){
      resp = await _intDoRequest("https://api.notion.com/v1/pages/" + syncInfo.remoteId, {
        method: "GET",
        headers: headers
      });
      if(resp.ok && resp.body){
        const updatedTask = _intNotionParsePage(resp.body);
        _intRecordSync("notion", task.id, syncInfo.remoteId, "task");
        return { success: true, action: "pulled", remoteId: syncInfo.remoteId, localId: task.id, updatedTask: updatedTask };
      }
    }
  }

  return { success: false, error: "sync_failed" };
}

/**
 * 同步笔记到 Notion（双向）
 * @param {Object} note - 本地笔记 { id, title, content, ... }
 * @param {string} direction - 'push' | 'pull' | 'sync'
 * @returns {Promise<Object>} 同步结果
 * @deprecated v3.7.60 应用内零调用方（同步 / 通知尚未接线）· 渠道定案前勿新增调用点或在其上加 UI · 见 docs/product-scope.md §三
 */
async function notionSyncNote(note, direction){
  if(!note || !note.id) return { success: false, error: "invalid_note" };
  direction = direction || "sync";
  const provider = await _intRequireProvider("notion", INTEGRATION_TYPES.NOTION);
  if(!provider) return { success: false, error: "provider_not_available" };

  const state = _intGetSyncState("notion");
  const syncInfo = state.syncedItems[note.id];
  const databaseId = provider.config.notesDatabaseId || provider.config.databaseId;
  const token = provider.config.token;
  const headers = {
    "Authorization": "Bearer " + token,
    "Notion-Version": "2022-06-28",
    "Content-Type": "application/json"
  };

  if(direction === "push" || direction === "sync"){
    let resp;
    if(syncInfo){
      resp = await _intDoRequest("https://api.notion.com/v1/pages/" + syncInfo.remoteId, {
        method: "PATCH",
        headers: headers,
        body: JSON.stringify(_intNotionBuildPageProperties(note, databaseId))
      });
      if(resp.ok){
        _intRecordSync("notion", note.id, syncInfo.remoteId, "note");
        if(direction === "push") return { success: true, action: "updated", remoteId: syncInfo.remoteId, localId: note.id };
      }
    }else{
      resp = await _intDoRequest("https://api.notion.com/v1/pages", {
        method: "POST",
        headers: headers,
        body: JSON.stringify(_intNotionBuildPageProperties(note, databaseId))
      });
      if(resp.ok && resp.body && resp.body.id){
        _intRecordSync("notion", note.id, resp.body.id, "note");
        if(direction === "push") return { success: true, action: "created", remoteId: resp.body.id, localId: note.id };
      }
    }
  }

  return { success: false, error: "sync_failed" };
}

/**
 * 列出已同步的 Notion 项
 * @returns {Array} 已同步项列表
 * @deprecated v3.7.60 应用内零调用方（同步 / 通知尚未接线）· 渠道定案前勿新增调用点或在其上加 UI · 见 docs/product-scope.md §三
 */
function notionListSynced(){
  const state = _intGetSyncState("notion");
  const result = [];
  for(const localId in state.syncedItems){
    const info = state.syncedItems[localId];
    result.push({ localId: localId, remoteId: info.remoteId, type: info.type, syncedAt: info.syncedAt });
  }
  return result;
}

/**
 * 断开 Notion 连接
 * @returns {boolean} 是否成功
 */
function notionDisconnect(){
  return integrationRemoveProvider("notion");
}

/* ---------- 内部：Notion 页面属性构建/解析 ---------- */
function _intNotionBuildPageProperties(item, databaseId){
  return {
    parent: { database_id: databaseId },
    properties: {
      "Title": { title: [{ text: { content: item.title || item.name || "Untitled" } }] },
      "Status": { select: { name: item.status || "todo" } }
    }
  };
}
function _intNotionParsePage(page){
  if(!page) return null;
  let title = "";
  try{
    const titleProp = page.properties && page.properties.Title;
    if(titleProp && titleProp.title && titleProp.title[0]){
      title = titleProp.title[0].plain_text || "";
    }
  }catch(e){ /* noop */ }
  let status = "todo";
  try{
    const statusProp = page.properties && page.properties.Status;
    if(statusProp && statusProp.select){
      status = statusProp.select.name || "todo";
    }
  }catch(e){ /* noop */ }
  return {
    id: page.id,
    title: title,
    status: status,
    updatedAt: page.last_edited_time || null
  };
}

/* ============================================================
 * 3. Linear 集成（issue 双向同步，状态映射）
 * ============================================================ */

/**
 * 连接 Linear
 * @param {Object} config - { token, teamId }
 * @returns {Promise<Object|null>} provider 或 null
 */
async function linearConnect(config){
  if(!config || !config.token) return null;
  const provider = integrationRegisterProvider("linear", INTEGRATION_TYPES.LINEAR, config);
  if(!provider) return null;
  // 验证 token（Linear GraphQL API）
  const resp = await _intDoRequest("https://api.linear.app/graphql", {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + config.token,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ query: "{ viewer { id email } }" })
  });
  provider.config._verified = !!resp.ok;
  provider.config._lastVerifiedAt = _intNow();
  _intSaveProviders();
  return provider;
}

/**
 * 同步 Linear issue（双向）
 * @param {Object} issue - 本地 issue { id, title, description, status, ... }
 * @param {string} direction - 'push' | 'pull' | 'sync'
 * @returns {Promise<Object>} 同步结果
 * @deprecated v3.7.60 应用内零调用方（同步 / 通知尚未接线）· 渠道定案前勿新增调用点或在其上加 UI · 见 docs/product-scope.md §三
 */
async function linearSyncIssue(issue, direction){
  if(!issue || !issue.id) return { success: false, error: "invalid_issue" };
  direction = direction || "sync";
  const provider = await _intRequireProvider("linear", INTEGRATION_TYPES.LINEAR);
  if(!provider) return { success: false, error: "provider_not_available" };

  const state = _intGetSyncState("linear");
  const syncInfo = state.syncedItems[issue.id];
  const token = provider.config.token;
  const teamId = provider.config.teamId;
  const headers = {
    "Authorization": "Bearer " + token,
    "Content-Type": "application/json"
  };
  // Linear 状态映射
  const mappedStatus = LINEAR_STATUS_MAP[issue.status] || issue.status || "Backlog";

  if(direction === "push" || direction === "sync"){
    let resp, mutation;
    if(syncInfo){
      // 更新 issue
      mutation = "mutation($id: String!, $input: IssueUpdateInput!) { issueUpdate(id: $id, input: $input) { success issue { id } } }";
      resp = await _intDoRequest("https://api.linear.app/graphql", {
        method: "POST",
        headers: headers,
        body: JSON.stringify({
          query: mutation,
          variables: { id: syncInfo.remoteId, input: { title: issue.title, description: issue.description, state: mappedStatus } }
        })
      });
      if(resp.ok){
        _intRecordSync("linear", issue.id, syncInfo.remoteId, "issue");
        if(direction === "push") return { success: true, action: "updated", remoteId: syncInfo.remoteId, localId: issue.id };
      }
    }else{
      // 创建 issue
      mutation = "mutation($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { id } } }";
      resp = await _intDoRequest("https://api.linear.app/graphql", {
        method: "POST",
        headers: headers,
        body: JSON.stringify({
          query: mutation,
          variables: { input: { teamId: teamId, title: issue.title, description: issue.description, state: mappedStatus } }
        })
      });
      if(resp.ok && resp.body && resp.body.data && resp.body.data.issueCreate && resp.body.data.issueCreate.issue){
        const newId = resp.body.data.issueCreate.issue.id;
        _intRecordSync("linear", issue.id, newId, "issue");
        if(direction === "push") return { success: true, action: "created", remoteId: newId, localId: issue.id };
      }
    }
  }

  return { success: false, error: "sync_failed" };
}

/**
 * Linear 状态映射（本地状态 → Linear 状态）
 * @param {string} localStatus - 本地状态
 * @returns {string} Linear 状态
 * @deprecated v3.7.60 应用内零调用方（同步 / 通知尚未接线）· 渠道定案前勿新增调用点或在其上加 UI · 见 docs/product-scope.md §三
 */
function linearMapStatus(localStatus){
  return LINEAR_STATUS_MAP[localStatus] || localStatus;
}

/**
 * 列出 Linear issues（框架）
 * @param {Object} [filter] - { status, assignee, limit }
 * @returns {Promise<Array>} issue 列表
 * @deprecated v3.7.60 应用内零调用方（同步 / 通知尚未接线）· 渠道定案前勿新增调用点或在其上加 UI · 见 docs/product-scope.md §三
 */
async function linearListIssues(filter){
  const provider = await _intRequireProvider("linear", INTEGRATION_TYPES.LINEAR);
  if(!provider) return [];
  filter = filter || {};
  const token = provider.config.token;
  const teamId = provider.config.teamId;
  const query = "query($teamId: String!) { team(id: $teamId) { issues { nodes { id title description state { name } } } } }";
  const resp = await _intDoRequest("https://api.linear.app/graphql", {
    method: "POST",
    headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ query: query, variables: { teamId: teamId } })
  });
  if(!resp.ok || !resp.body || !resp.body.data) return [];
  try{
    let issues = resp.body.data.team.issues.nodes || [];
    if(filter.status){
      issues = issues.filter(function(i){ return i.state && i.state.name === filter.status; });
    }
    if(filter.limit && filter.limit > 0) issues = issues.slice(0, filter.limit);
    return issues;
  }catch(e){ return []; }
}

/**
 * 断开 Linear 连接
 */
function linearDisconnect(){
  return integrationRemoveProvider("linear");
}

/* ============================================================
 * 4. Jira 集成（issue 双向同步，状态映射）
 * ============================================================ */

/**
 * 连接 Jira
 * @param {Object} config - { token, domain, projectKey }（token 为 API token，domain 如 xxx.atlassian.net）
 * @returns {Promise<Object|null>} provider 或 null
 */
async function jiraConnect(config){
  if(!config || !config.token || !config.domain) return null;
  const provider = integrationRegisterProvider("jira", INTEGRATION_TYPES.JIRA, config);
  if(!provider) return null;
  // 验证 token
  const base = _intJiraBase(config.domain);   // 域名必须是纯主机名，否则不拼 URL（见 _intJiraBase）
  if(!base) return null;
  const resp = await _intDoRequest(base + "/rest/api/3/myself", {
    method: "GET",
    headers: { "Authorization": "Bearer " + config.token }
  });
  provider.config._verified = !!resp.ok;
  provider.config._lastVerifiedAt = _intNow();
  _intSaveProviders();
  return provider;
}

/**
 * 同步 Jira issue（双向）
 * @param {Object} issue - 本地 issue { id, title, description, status, ... }
 * @param {string} direction - 'push' | 'pull' | 'sync'
 * @returns {Promise<Object>} 同步结果
 * @deprecated v3.7.60 应用内零调用方（同步 / 通知尚未接线）· 渠道定案前勿新增调用点或在其上加 UI · 见 docs/product-scope.md §三
 */
async function jiraSyncIssue(issue, direction){
  if(!issue || !issue.id) return { success: false, error: "invalid_issue" };
  direction = direction || "sync";
  const provider = await _intRequireProvider("jira", INTEGRATION_TYPES.JIRA);
  if(!provider) return { success: false, error: "provider_not_available" };

  const state = _intGetSyncState("jira");
  const syncInfo = state.syncedItems[issue.id];
  const token = provider.config.token;
  const domain = provider.config.domain;
  const projectKey = provider.config.projectKey;
  const jiraHost = _intJiraBase(domain);
  if(!jiraHost) return { success: false, error: "invalid_domain" };
  const base = jiraHost + "/rest/api/3";
  const headers = { "Authorization": "Bearer " + token, "Content-Type": "application/json" };
  const mappedStatus = JIRA_STATUS_MAP[issue.status] || issue.status || "To Do";

  if(direction === "push" || direction === "sync"){
    let resp;
    if(syncInfo){
      // 更新 issue
      resp = await _intDoRequest(base + "/issue/" + syncInfo.remoteId, {
        method: "PUT",
        headers: headers,
        body: JSON.stringify({
          fields: { summary: issue.title, description: issue.description }
        })
      });
      if(resp.ok){
        _intRecordSync("jira", issue.id, syncInfo.remoteId, "issue");
        if(direction === "push") return { success: true, action: "updated", remoteId: syncInfo.remoteId, localId: issue.id };
      }
    }else{
      // 创建 issue
      resp = await _intDoRequest(base + "/issue", {
        method: "POST",
        headers: headers,
        body: JSON.stringify({
          fields: {
            project: { key: projectKey },
            summary: issue.title,
            description: issue.description || "",
            status: { name: mappedStatus }
          }
        })
      });
      if(resp.ok && resp.body && resp.body.key){
        _intRecordSync("jira", issue.id, resp.body.key, "issue");
        if(direction === "push") return { success: true, action: "created", remoteId: resp.body.key, localId: issue.id };
      }
    }
  }

  return { success: false, error: "sync_failed" };
}

/**
 * Jira 状态映射
 * @param {string} localStatus - 本地状态
 * @returns {string} Jira 状态
 * @deprecated v3.7.60 应用内零调用方（同步 / 通知尚未接线）· 渠道定案前勿新增调用点或在其上加 UI · 见 docs/product-scope.md §三
 */
function jiraMapStatus(localStatus){
  return JIRA_STATUS_MAP[localStatus] || localStatus;
}

/**
 * 列出 Jira issues（框架）
 * @param {Object} [filter] - { jql, limit }
 * @returns {Promise<Array>} issue 列表
 * @deprecated v3.7.60 应用内零调用方（同步 / 通知尚未接线）· 渠道定案前勿新增调用点或在其上加 UI · 见 docs/product-scope.md §三
 */
async function jiraListIssues(filter){
  const provider = await _intRequireProvider("jira", INTEGRATION_TYPES.JIRA);
  if(!provider) return [];
  filter = filter || {};
  const token = provider.config.token;
  const domain = provider.config.domain;
  const projectKey = provider.config.projectKey;
  const jql = filter.jql || ("project = " + projectKey);
  const jiraHost = _intJiraBase(domain);
  if(!jiraHost) return [];
  const base = jiraHost + "/rest/api/3";
  const resp = await _intDoRequest(base + "/search?jql=" + encodeURIComponent(jql) + "&maxResults=" + (filter.limit || 50), {
    method: "GET",
    headers: { "Authorization": "Bearer " + token }
  });
  if(!resp.ok || !resp.body || !resp.body.issues) return [];
  return resp.body.issues;
}

/**
 * 断开 Jira 连接
 */
function jiraDisconnect(){
  return integrationRemoveProvider("jira");
}

/* ============================================================
 * 5. Slack 集成（消息通知 + 任务事件推送）
 * ============================================================ */

/**
 * 连接 Slack
 * @param {Object} config - { botToken, channel }
 * @returns {Promise<Object|null>} provider 或 null
 */
async function slackConnect(config){
  if(!config || !config.botToken) return null;
  const provider = integrationRegisterProvider("slack", INTEGRATION_TYPES.SLACK, config);
  if(!provider) return null;
  // 验证 token
  const resp = await _intDoRequest("https://slack.com/api/auth.test", {
    method: "POST",
    headers: { "Authorization": "Bearer " + config.botToken }
  });
  provider.config._verified = !!(resp.ok && resp.body && resp.body.ok);
  provider.config._lastVerifiedAt = _intNow();
  _intSaveProviders();
  return provider;
}

/**
 * 发送 Slack 消息
 * @param {string} channel - 频道（不传则用配置中的默认频道）
 * @param {string} text - 消息文本
 * @param {Object} [extra] - 额外参数（如 blocks, attachments）
 * @returns {Promise<boolean>} 是否发送成功
 * @deprecated v3.7.60 应用内零调用方（同步 / 通知尚未接线）· 渠道定案前勿新增调用点或在其上加 UI · 见 docs/product-scope.md §三
 */
async function slackSendMessage(channel, text, extra){
  const provider = await _intRequireProvider("slack", INTEGRATION_TYPES.SLACK);
  if(!provider) return false;
  const token = provider.config.botToken;
  const ch = channel || provider.config.channel;
  if(!ch || !text) return false;
  const body = { channel: ch, text: text };
  if(extra){
    for(const k in extra) body[k] = extra[k];
  }
  const resp = await _intDoRequest("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return !!(resp.ok && resp.body && resp.body.ok);
}

/**
 * Slack 事件通知（任务创建/更新等）
 * @param {string} eventType - 事件类型
 * @param {Object} payload - 事件负载
 * @returns {Promise<boolean>} 是否通知成功
 * @deprecated v3.7.60 应用内零调用方（同步 / 通知尚未接线）· 渠道定案前勿新增调用点或在其上加 UI · 见 docs/product-scope.md §三
 */
async function slackNotifyEvent(eventType, payload){
  const provider = await _intRequireProvider("slack", INTEGRATION_TYPES.SLACK);
  if(!provider) return false;
  const text = "[" + eventType + "] " + JSON.stringify(payload);
  return await slackSendMessage(provider.config.channel, text);
}

/**
 * 从 Slack 消息创建任务（解析消息文本为任务）
 * @param {Object} message - Slack 消息 { text, user, ts, channel }
 * @returns {Object|null} 任务对象或 null
 * @deprecated v3.7.60 应用内零调用方（同步 / 通知尚未接线）· 渠道定案前勿新增调用点或在其上加 UI · 见 docs/product-scope.md §三
 */
function slackCreateTaskFromMessage(message){
  if(!message || !message.text) return null;
  // 简单解析：第一行作为标题，其余作为描述
  const lines = message.text.split("\n");
  const title = lines[0].trim();
  const description = lines.slice(1).join("\n").trim();
  if(!title) return null;
  return {
    id: _intUid("task_"),
    title: title,
    description: description,
    status: "todo",
    source: "slack",
    sourceMessageTs: message.ts || null,
    sourceChannel: message.channel || null,
    sourceUser: message.user || null,
    createdAt: _intNow()
  };
}

/**
 * 断开 Slack 连接
 */
function slackDisconnect(){
  return integrationRemoveProvider("slack");
}

/* ============================================================
 * 6. 飞书集成
 * ============================================================ */

/**
 * 连接飞书
 * @param {Object} config - { appId, appSecret, chatId }
 * @returns {Promise<Object|null>} provider 或 null
 */
async function feishuConnect(config){
  if(!config || !config.appId || !config.appSecret) return null;
  const provider = integrationRegisterProvider("feishu", INTEGRATION_TYPES.FEISHU, config);
  if(!provider) return null;
  // 获取 tenant_access_token 验证
  const resp = await _intDoRequest("https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ app_id: config.appId, app_secret: config.appSecret })
  });
  provider.config._verified = !!(resp.ok && resp.body && resp.body.tenant_access_token);
  provider.config._lastVerifiedAt = _intNow();
  _intSaveProviders();
  return provider;
}

/**
 * 发送飞书消息
 * @param {string} chatId - 群聊 ID（不传则用配置中的默认 chatId）
 * @param {string} text - 消息文本
 * @returns {Promise<boolean>} 是否成功
 * @deprecated v3.7.60 应用内零调用方（同步 / 通知尚未接线）· 渠道定案前勿新增调用点或在其上加 UI · 见 docs/product-scope.md §三
 */
async function feishuSendMessage(chatId, text){
  const provider = await _intRequireProvider("feishu", INTEGRATION_TYPES.FEISHU);
  if(!provider) return false;
  const ch = chatId || provider.config.chatId;
  if(!ch || !text) return false;
  // 先获取 tenant_access_token
  const tokenResp = await _intDoRequest("https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ app_id: provider.config.appId, app_secret: provider.config.appSecret })
  });
  if(!tokenResp.ok || !tokenResp.body || !tokenResp.body.tenant_access_token) return false;
  const accessToken = tokenResp.body.tenant_access_token;
  const resp = await _intDoRequest("https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id", {
    method: "POST",
    headers: { "Authorization": "Bearer " + accessToken, "Content-Type": "application/json" },
    body: JSON.stringify({
      receive_id: ch,
      msg_type: "text",
      content: JSON.stringify({ text: text })
    })
  });
  return !!resp.ok;
}

/**
 * 飞书事件通知
 * @param {string} eventType - 事件类型
 * @param {Object} payload - 事件负载
 * @returns {Promise<boolean>}
 * @deprecated v3.7.60 应用内零调用方（同步 / 通知尚未接线）· 渠道定案前勿新增调用点或在其上加 UI · 见 docs/product-scope.md §三
 */
async function feishuNotifyEvent(eventType, payload){
  const provider = await _intRequireProvider("feishu", INTEGRATION_TYPES.FEISHU);
  if(!provider) return false;
  const text = "[" + eventType + "] " + JSON.stringify(payload);
  return await feishuSendMessage(provider.config.chatId, text);
}

/**
 * 从飞书消息创建任务
 * @param {Object} message - { text, senderId, chatId }
 * @returns {Object|null} 任务对象
 * @deprecated v3.7.60 应用内零调用方（同步 / 通知尚未接线）· 渠道定案前勿新增调用点或在其上加 UI · 见 docs/product-scope.md §三
 */
function feishuCreateTaskFromMessage(message){
  if(!message || !message.text) return null;
  const lines = message.text.split("\n");
  const title = lines[0].trim();
  const description = lines.slice(1).join("\n").trim();
  if(!title) return null;
  return {
    id: _intUid("task_"),
    title: title,
    description: description,
    status: "todo",
    source: "feishu",
    sourceSenderId: message.senderId || null,
    sourceChatId: message.chatId || null,
    createdAt: _intNow()
  };
}

/**
 * 断开飞书连接
 */
function feishuDisconnect(){
  return integrationRemoveProvider("feishu");
}

/* ============================================================
 * 7. 钉钉集成
 * ============================================================ */

/**
 * 连接钉钉
 * @param {Object} config - { accessKey, accessSecret, chatId }
 * @returns {Promise<Object|null>} provider 或 null
 */
async function dingtalkConnect(config){
  if(!config || !config.accessKey || !config.accessSecret) return null;
  const provider = integrationRegisterProvider("dingtalk", INTEGRATION_TYPES.DINGTALK, config);
  if(!provider) return null;
  // 获取 access_token 验证
  const resp = await _intDoRequest("https://oapi.dingtalk.com/gettoken?appkey=" + encodeURIComponent(config.accessKey) + "&appsecret=" + encodeURIComponent(config.accessSecret), {
    method: "GET"
  });
  provider.config._verified = !!(resp.ok && resp.body && resp.body.errcode === 0);
  provider.config._lastVerifiedAt = _intNow();
  _intSaveProviders();
  return provider;
}

/**
 * 发送钉钉消息
 * @param {string} chatId - 群聊 ID（不传则用配置默认）
 * @param {string} text - 消息文本
 * @returns {Promise<boolean>}
 * @deprecated v3.7.60 应用内零调用方（同步 / 通知尚未接线）· 渠道定案前勿新增调用点或在其上加 UI · 见 docs/product-scope.md §三
 */
async function dingtalkSendMessage(chatId, text){
  const provider = await _intRequireProvider("dingtalk", INTEGRATION_TYPES.DINGTALK);
  if(!provider) return false;
  const ch = chatId || provider.config.chatId;
  if(!ch || !text) return false;
  // 获取 access_token
  const tokenResp = await _intDoRequest("https://oapi.dingtalk.com/gettoken?appkey=" + encodeURIComponent(provider.config.accessKey) + "&appsecret=" + encodeURIComponent(provider.config.accessSecret), {
    method: "GET"
  });
  if(!tokenResp.ok || !tokenResp.body || !tokenResp.body.access_token) return false;
  const accessToken = tokenResp.body.access_token;
  const resp = await _intDoRequest("https://oapi.dingtalk.com/chat/send?access_token=" + accessToken, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chatid: ch,
      msg: { msgtype: "text", text: { content: text } }
    })
  });
  return !!(resp.ok && resp.body && resp.body.errcode === 0);
}

/**
 * 钉钉事件通知
 * @deprecated v3.7.60 应用内零调用方（同步 / 通知尚未接线）· 渠道定案前勿新增调用点或在其上加 UI · 见 docs/product-scope.md §三
 */
async function dingtalkNotifyEvent(eventType, payload){
  const provider = await _intRequireProvider("dingtalk", INTEGRATION_TYPES.DINGTALK);
  if(!provider) return false;
  const text = "[" + eventType + "] " + JSON.stringify(payload);
  return await dingtalkSendMessage(provider.config.chatId, text);
}

/**
 * 从钉钉消息创建任务
 * @deprecated v3.7.60 应用内零调用方（同步 / 通知尚未接线）· 渠道定案前勿新增调用点或在其上加 UI · 见 docs/product-scope.md §三
 */
function dingtalkCreateTaskFromMessage(message){
  if(!message || !message.text) return null;
  const lines = message.text.split("\n");
  const title = lines[0].trim();
  const description = lines.slice(1).join("\n").trim();
  if(!title) return null;
  return {
    id: _intUid("task_"),
    title: title,
    description: description,
    status: "todo",
    source: "dingtalk",
    sourceSenderId: message.senderId || null,
    sourceChatId: message.chatId || null,
    createdAt: _intNow()
  };
}

/**
 * 断开钉钉连接
 */
function dingtalkDisconnect(){
  return integrationRemoveProvider("dingtalk");
}

/* ============================================================
 * 8. 日历同步（Google Calendar / Outlook）
 * ============================================================ */

/**
 * 连接日历 provider
 * @param {string} providerName - 'google_calendar' | 'outlook_calendar'
 * @param {Object} config - { token, calendarId }
 * @returns {Promise<Object|null>} provider 或 null
 */
async function calendarConnect(providerName, config){
  if(!providerName || !config || !config.token) return null;
  const validTypes = [INTEGRATION_TYPES.GOOGLE_CALENDAR, INTEGRATION_TYPES.OUTLOOK_CALENDAR];
  if(validTypes.indexOf(providerName) === -1) return null;
  const provider = integrationRegisterProvider(providerName, providerName, config);
  if(!provider) return null;
  // 验证 token（列出日历列表）
  let url, headers;
  if(providerName === INTEGRATION_TYPES.GOOGLE_CALENDAR){
    url = "https://www.googleapis.com/calendar/v3/users/me/calendarList";
    headers = { "Authorization": "Bearer " + config.token };
  }else{
    url = "https://graph.microsoft.com/v1.0/me/calendars";
    headers = { "Authorization": "Bearer " + config.token };
  }
  const resp = await _intDoRequest(url, { method: "GET", headers: headers });
  provider.config._verified = !!resp.ok;
  provider.config._lastVerifiedAt = _intNow();
  _intSaveProviders();
  return provider;
}

/* ---------- 内部：日历 API 端点 ---------- */
function _intCalendarEndpoint(providerName){
  if(providerName === INTEGRATION_TYPES.GOOGLE_CALENDAR){
    return {
      base: "https://www.googleapis.com/calendar/v3",
      eventsPath: function(calendarId){ return "/calendars/" + calendarId + "/events"; },
      eventPath: function(calendarId, eventId){ return "/calendars/" + calendarId + "/events/" + eventId; }
    };
  }else{
    return {
      base: "https://graph.microsoft.com/v1.0",
      eventsPath: function(calendarId){ return "/me/calendars/" + calendarId + "/events"; },
      eventPath: function(calendarId, eventId){ return "/me/calendars/" + calendarId + "/events/" + eventId; }
    };
  }
}

/* ---------- 内部：日历事件格式转换 ---------- */
function _intCalendarBuildEvent(providerName, event){
  const ev = {
    summary: event.title || event.summary || "Untitled",
    description: event.description || "",
    start: event.start,
    end: event.end
  };
  if(providerName === INTEGRATION_TYPES.GOOGLE_CALENDAR){
    // Google Calendar 格式
    return {
      summary: ev.summary,
      description: ev.description,
      start: typeof ev.start === "string" ? { dateTime: ev.start } : ev.start,
      end: typeof ev.end === "string" ? { dateTime: ev.end } : ev.end
    };
  }else{
    // Outlook 格式
    return {
      subject: ev.summary,
      body: { contentType: "Text", content: ev.description },
      start: typeof ev.start === "string" ? { dateTime: ev.start, timeZone: "UTC" } : ev.start,
      end: typeof ev.end === "string" ? { dateTime: ev.end, timeZone: "UTC" } : ev.end
    };
  }
}
function _intCalendarParseEvent(providerName, remoteEvent){
  if(!remoteEvent) return null;
  const title = remoteEvent.summary || remoteEvent.subject || "";
  let description = "";
  if(remoteEvent.description) description = remoteEvent.description;
  else if(remoteEvent.body) description = remoteEvent.body.content || "";
  let start = remoteEvent.start;
  let end = remoteEvent.end;
  if(start && typeof start === "object") start = start.dateTime || start.date;
  if(end && typeof end === "object") end = end.dateTime || end.date;
  return {
    id: remoteEvent.id,
    title: title,
    description: description,
    start: start,
    end: end,
    updatedAt: remoteEvent.updated || null
  };
}

/**
 * 同步日历事件（双向）
 * @param {string} providerName - 'google_calendar' | 'outlook_calendar'
 * @param {Object} event - 本地事件 { id, title, start, end, description }
 * @param {string} direction - 'push' | 'pull' | 'sync'
 * @returns {Promise<Object>} 同步结果
 * @deprecated v3.7.60 应用内零调用方（同步 / 通知尚未接线）· 渠道定案前勿新增调用点或在其上加 UI · 见 docs/product-scope.md §三
 */
async function calendarSyncEvent(providerName, event, direction){
  if(!providerName || !event || !event.id) return { success: false, error: "invalid_params" };
  direction = direction || "sync";
  const provider = await _intRequireProvider(providerName);
  if(!provider) return { success: false, error: "provider_not_available" };

  const state = _intGetSyncState(providerName);
  const syncInfo = state.syncedItems[event.id];
  const token = provider.config.token;
  const calendarId = provider.config.calendarId || "primary";
  const endpoints = _intCalendarEndpoint(providerName);
  const headers = { "Authorization": "Bearer " + token, "Content-Type": "application/json" };

  if(direction === "push" || direction === "sync"){
    let resp;
    if(syncInfo){
      // 更新事件
      resp = await _intDoRequest(endpoints.base + endpoints.eventPath(calendarId, syncInfo.remoteId), {
        method: "PUT",
        headers: headers,
        body: JSON.stringify(_intCalendarBuildEvent(providerName, event))
      });
      if(resp.ok){
        _intRecordSync(providerName, event.id, syncInfo.remoteId, "event");
        if(direction === "push") return { success: true, action: "updated", remoteId: syncInfo.remoteId, localId: event.id };
      }
    }else{
      // 创建事件
      resp = await _intDoRequest(endpoints.base + endpoints.eventsPath(calendarId), {
        method: "POST",
        headers: headers,
        body: JSON.stringify(_intCalendarBuildEvent(providerName, event))
      });
      if(resp.ok && resp.body && resp.body.id){
        _intRecordSync(providerName, event.id, resp.body.id, "event");
        if(direction === "push") return { success: true, action: "created", remoteId: resp.body.id, localId: event.id };
      }
    }
  }

  if(direction === "pull" || direction === "sync"){
    let resp;
    if(syncInfo){
      resp = await _intDoRequest(endpoints.base + endpoints.eventPath(calendarId, syncInfo.remoteId), {
        method: "GET",
        headers: headers
      });
      if(resp.ok && resp.body){
        const updatedEvent = _intCalendarParseEvent(providerName, resp.body);
        _intRecordSync(providerName, event.id, syncInfo.remoteId, "event");
        return { success: true, action: "pulled", remoteId: syncInfo.remoteId, localId: event.id, updatedEvent: updatedEvent };
      }
    }
  }

  return { success: false, error: "sync_failed" };
}

/**
 * 列出日历事件
 * @param {string} providerName - 'google_calendar' | 'outlook_calendar'
 * @param {Object} [range] - { start, end, limit }
 * @returns {Promise<Array>} 事件列表
 * @deprecated v3.7.60 应用内零调用方（同步 / 通知尚未接线）· 渠道定案前勿新增调用点或在其上加 UI · 见 docs/product-scope.md §三
 */
async function calendarListEvents(providerName, range){
  const provider = await _intRequireProvider(providerName);
  if(!provider) return [];
  range = range || {};
  const token = provider.config.token;
  const calendarId = provider.config.calendarId || "primary";
  const endpoints = _intCalendarEndpoint(providerName);
  let url = endpoints.base + endpoints.eventsPath(calendarId);
  if(providerName === INTEGRATION_TYPES.GOOGLE_CALENDAR){
    const params = [];
    if(range.start) params.push("timeMin=" + encodeURIComponent(range.start));
    if(range.end) params.push("timeMax=" + encodeURIComponent(range.end));
    if(range.limit) params.push("maxResults=" + range.limit);
    if(params.length) url += "?" + params.join("&");
  }else{
    const params = [];
    if(range.start) params.push("startDateTime=" + encodeURIComponent(range.start));
    if(range.end) params.push("endDateTime=" + encodeURIComponent(range.end));
    if(params.length) url += "?" + params.join("&");
  }
  const resp = await _intDoRequest(url, {
    method: "GET",
    headers: { "Authorization": "Bearer " + token }
  });
  if(!resp.ok || !resp.body) return [];
  const events = resp.body.items || resp.body.value || [];
  return events.map(function(e){ return _intCalendarParseEvent(providerName, e); });
}

/**
 * 创建日历事件
 * @param {string} providerName
 * @param {Object} event
 * @returns {Promise<Object|null>} 创建的事件或 null
 * @deprecated v3.7.60 应用内零调用方（同步 / 通知尚未接线）· 渠道定案前勿新增调用点或在其上加 UI · 见 docs/product-scope.md §三
 */
async function calendarCreateEvent(providerName, event){
  const provider = await _intRequireProvider(providerName);
  if(!provider) return null;
  const token = provider.config.token;
  const calendarId = provider.config.calendarId || "primary";
  const endpoints = _intCalendarEndpoint(providerName);
  const resp = await _intDoRequest(endpoints.base + endpoints.eventsPath(calendarId), {
    method: "POST",
    headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify(_intCalendarBuildEvent(providerName, event))
  });
  if(!resp.ok || !resp.body) return null;
  return _intCalendarParseEvent(providerName, resp.body);
}

/**
 * 更新日历事件
 * @param {string} providerName
 * @param {string} eventId
 * @param {Object} event
 * @returns {Promise<Object|null>} 更新后的事件或 null
 * @deprecated v3.7.60 应用内零调用方（同步 / 通知尚未接线）· 渠道定案前勿新增调用点或在其上加 UI · 见 docs/product-scope.md §三
 */
async function calendarUpdateEvent(providerName, eventId, event){
  const provider = await _intRequireProvider(providerName);
  if(!provider) return null;
  const token = provider.config.token;
  const calendarId = provider.config.calendarId || "primary";
  const endpoints = _intCalendarEndpoint(providerName);
  const resp = await _intDoRequest(endpoints.base + endpoints.eventPath(calendarId, eventId), {
    method: "PUT",
    headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify(_intCalendarBuildEvent(providerName, event))
  });
  if(!resp.ok || !resp.body) return null;
  return _intCalendarParseEvent(providerName, resp.body);
}

/**
 * 删除日历事件
 * @param {string} providerName
 * @param {string} eventId
 * @returns {Promise<boolean>}
 * @deprecated v3.7.60 应用内零调用方（同步 / 通知尚未接线）· 渠道定案前勿新增调用点或在其上加 UI · 见 docs/product-scope.md §三
 */
async function calendarDeleteEvent(providerName, eventId){
  const provider = await _intRequireProvider(providerName);
  if(!provider) return false;
  const token = provider.config.token;
  const calendarId = provider.config.calendarId || "primary";
  const endpoints = _intCalendarEndpoint(providerName);
  const resp = await _intDoRequest(endpoints.base + endpoints.eventPath(calendarId, eventId), {
    method: "DELETE",
    headers: { "Authorization": "Bearer " + token }
  });
  return !!resp.ok;
}

/**
 * 断开日历连接
 * @param {string} providerName
 * @returns {boolean}
 */
function calendarDisconnect(providerName){
  return integrationRemoveProvider(providerName);
}

/* ============================================================
 * 9. 开放 API 框架（API Key 管理 + 速率限制）
 * ============================================================ */

/**
 * 创建 API Key
 * @param {string} name - API Key 名称
 * @param {Array} scopes - 权限范围（如 ['read', 'write']）
 * @returns {Object|null} API Key 对象 { id, name, key, scopes, createdAt }
 */
function openApiCreateApiKey(name, scopes){
  if(!name || typeof name !== "string") return null;
  if(!Array.isArray(scopes)) scopes = [];
  _intLoadApiKeys();
  const keyId = _intUid("key_");
  // 生成随机 API Key（32 字节 hex）
  const keyBytes = new Uint8Array(32);
  try{
    if(typeof crypto !== "undefined" && crypto.getRandomValues){
      crypto.getRandomValues(keyBytes);
    }else{
      for(let i = 0; i < 32; i++) keyBytes[i] = Math.floor(Math.random() * 256);
    }
  }catch(e){
    for(let i = 0; i < 32; i++) keyBytes[i] = Math.floor(Math.random() * 256);
  }
  let key = "";
  for(let i = 0; i < keyBytes.length; i++){
    key += (keyBytes[i] < 16 ? "0" : "") + keyBytes[i].toString(16);
  }
  const apiKey = {
    id: keyId,
    name: name,
    key: key,
    scopes: scopes.slice(),
    createdAt: _intNow(),
    revokedAt: null,
    lastUsedAt: null
  };
  _integrationApiKeys[keyId] = apiKey;
  _intSaveApiKeys();
  return apiKey;
}

/**
 * 撤销 API Key
 * @param {string} keyId - API Key ID
 * @returns {boolean} 是否撤销成功
 */
function openApiRevokeApiKey(keyId){
  if(!keyId) return false;
  _intLoadApiKeys();
  if(!_integrationApiKeys[keyId]) return false;
  if(_integrationApiKeys[keyId].revokedAt) return false; // 已撤销
  _integrationApiKeys[keyId].revokedAt = _intNow();
  _intSaveApiKeys();
  return true;
}

/**
 * 列出所有 API Key（不返回 key 本身，仅元数据）
 * @returns {Array} API Key 列表
 */
function openApiListApiKeys(){
  _intLoadApiKeys();
  const result = [];
  for(const id in _integrationApiKeys){
    const k = _integrationApiKeys[id];
    result.push({
      id: k.id,
      name: k.name,
      scopes: k.scopes.slice(),
      createdAt: k.createdAt,
      revokedAt: k.revokedAt,
      lastUsedAt: k.lastUsedAt,
      keyPrefix: k.key.slice(0, 8) + "..." // 仅返回前缀
    });
  }
  return result;
}

/**
 * 验证 API Key
 * @param {string} key - API Key
 * @returns {Object|null} 验证结果 { keyId, name, scopes } 或 null
 */
function openApiValidateApiKey(key){
  if(!key || typeof key !== "string") return null;
  _intLoadApiKeys();
  for(const id in _integrationApiKeys){
    const k = _integrationApiKeys[id];
    if(k.revokedAt) continue; // 已撤销
    if(k.key === key){
      // 更新 lastUsedAt
      k.lastUsedAt = _intNow();
      _intSaveApiKeys();
      return { keyId: k.id, name: k.name, scopes: k.scopes.slice() };
    }
  }
  return null;
}

/**
 * 设置速率限制
 * @param {string} keyId - API Key ID
 * @param {number} limit - 请求上限
 * @param {number} windowMs - 时间窗口（毫秒，默认 60000 = 1 分钟）
 * @returns {boolean} 是否设置成功
 */
function openApiSetRateLimit(keyId, limit, windowMs){
  if(!keyId || typeof limit !== "number" || limit <= 0) return false;
  windowMs = windowMs || 60000;
  _intLoadRateLimits();
  _integrationRateLimits[keyId] = {
    limit: limit,
    windowMs: windowMs,
    windowStart: Date.now(),
    count: 0
  };
  _intSaveRateLimits();
  return true;
}

/**
 * 检查速率限制
 * @param {string} keyId - API Key ID
 * @returns {Object} { allowed, remaining, resetAt }
 */
function openApiCheckRateLimit(keyId){
  if(!keyId) return { allowed: false, remaining: 0, resetAt: null };
  _intLoadRateLimits();
  const rl = _integrationRateLimits[keyId];
  if(!rl) return { allowed: true, remaining: Infinity, resetAt: null }; // 无限制
  const now = Date.now();
  // 检查窗口是否过期
  if(now - rl.windowStart >= rl.windowMs){
    rl.windowStart = now;
    rl.count = 0;
  }
  if(rl.count < rl.limit){
    rl.count++;
    _intSaveRateLimits();
    return {
      allowed: true,
      remaining: rl.limit - rl.count,
      resetAt: new Date(rl.windowStart + rl.windowMs).toISOString()
    };
  }
  return {
    allowed: false,
    remaining: 0,
    resetAt: new Date(rl.windowStart + rl.windowMs).toISOString()
  };
}

/**
 * 获取速率限制统计
 * @param {string} keyId - API Key ID
 * @returns {Object|null} { limit, windowMs, currentCount, windowStart, resetAt }
 */
function openApiGetRateLimitStats(keyId){
  if(!keyId) return null;
  _intLoadRateLimits();
  const rl = _integrationRateLimits[keyId];
  if(!rl) return null;
  const now = Date.now();
  if(now - rl.windowStart >= rl.windowMs){
    rl.windowStart = now;
    rl.count = 0;
  }
  return {
    limit: rl.limit,
    windowMs: rl.windowMs,
    currentCount: rl.count,
    windowStart: new Date(rl.windowStart).toISOString(),
    resetAt: new Date(rl.windowStart + rl.windowMs).toISOString()
  };
}

/**
 * 移除速率限制
 * @param {string} keyId
 * @returns {boolean}
 */
function openApiRemoveRateLimit(keyId){
  if(!keyId) return false;
  _intLoadRateLimits();
  if(!_integrationRateLimits[keyId]) return false;
  delete _integrationRateLimits[keyId];
  _intSaveRateLimits();
  return true;
}

/* ============================================================
 * 10. HTTP 客户端注入（测试用）
 * ============================================================ */

/**
 * 注入 HTTP 客户端
 * @param {Function} fn - async (url, opts) => Response
 */
function integrationSetHttpClient(fn){
  _integrationHttpClient = fn;
}

/* ============================================================
 * 11. 重置函数（测试用）
 * ============================================================ */
function _resetIntegrations(){
  _integrationProviders = {};
  _integrationSyncState = {};
  _integrationApiKeys = {};
  _integrationRateLimits = {};
  _integrationHttpClient = null;
  _intSafeLSRemove(INTEGRATION_PROVIDERS_KEY);
  _intSafeLSRemove(INTEGRATION_SYNC_STATE_KEY);
  _intSafeLSRemove(INTEGRATION_API_KEYS_KEY);
  _intSafeLSRemove(INTEGRATION_RATE_LIMITS_KEY);
}
function _resetIntegrationProviders(){
  _integrationProviders = {};
  _intSafeLSRemove(INTEGRATION_PROVIDERS_KEY);
}
function _resetIntegrationSyncState(){
  _integrationSyncState = {};
  _intSafeLSRemove(INTEGRATION_SYNC_STATE_KEY);
}
function _resetIntegrationApiKeys(){
  _integrationApiKeys = {};
  _intSafeLSRemove(INTEGRATION_API_KEYS_KEY);
}
function _resetIntegrationRateLimits(){
  _integrationRateLimits = {};
  _intSafeLSRemove(INTEGRATION_RATE_LIMITS_KEY);
}
/* v3.7.59 清理：此处原有一段悬空的注释头 ——
     // ===== v1.8-C OAuth2 Framework (OAuth2 授权框架) =====
     // ----------------------------------------------------------------------------
   OAuth2 模块已在 v1.14.0「做减法」中整体移除，只剩注释头与分隔线（全仓 oauth2BuildAuthUrl 0 处，
   实际接线点在 src/data-idb.js 的 _oauth2HandleCallback stub）。留着会误导读者以为该模块仍存在 ——
   2026-09-27 审计时我自己就先被它误导了一次（在源码态 grep 应用代码得到 0 处，一度误判为「被抽取破坏」）。
   纯注释残留，删除无功能影响。 */
