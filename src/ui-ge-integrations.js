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
/* v3.7.70：`_intNotionPullWriteback` 随 pull 路径一并删除。它是"把 Notion 侧改动写回本地任务"
   的辅助，而本轮把 notionSyncTask 收窄成纯 push 后，它继续存在会变成**陷阱** ——
   再有人调它拿到的会是推送而不是拉取。拉取（连同冲突/删除语义）要做时按那时的设计重写。 */



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
/* @deprecated v3.7.60 应用内零调用方（同步 / 通知尚未接线）· 渠道定案前勿新增调用点或在其上加 UI · 见 docs/product-scope.md §三 */
function integrationGetStatus(name){
  const p = integrationGetProvider(name);
  if(!p) return { connected:false, reason:"not_registered" };
  if(!p.enabled) return { connected:false, reason:"disabled" };
  if(p.config && p.config._verified === false) return { connected:false, reason:"verify_failed" };
  return { connected:true, verified:!!(p.config && p.config._verified) };
}
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

/* ---------- v3.7.85：状态映射改为**运行时动态解析** ----------
 * 此前冻结的原因：「本地状态名 → 远端 ID」需要真实工作区才能验证（Linear 要 stateId、
 * Jira 要 transition id）。但**查工作流状态本身不需要我持有工作区** —— 连接/推送时用
 * 用户自己的 token 拉一次 states/transitions 建表，映射随各工作区实际配置走：
 *   Linear：connect 时 GraphQL 拉 team.states → {小写名: stateId}，推送带 stateId；
 *   Jira：更新后按 issue 拉 transitions → 本地状态名匹配 transition 名 → POST transitions。
 * 匹配不上就**不带状态**（同旧行为，落对方默认），不猜、不静默改错状态。
 * 候选名表只是"本地四态 → 常见远端名"的起点，最终以工作区实况为准。 */
const _STATUS_NAME_CANDIDATES = {
  todo: ["backlog", "todo", "to do", "open", "待办"],
  in_progress: ["in progress", "doing", "started", "进行中"],
  done: ["done", "completed", "closed", "已完成"],
  canceled: ["canceled", "cancelled", "won't do", "已取消"]
};
/** 本地状态 → 候选远端状态名列表（小写） */
function _statusCandidates(localStatus){
  const key = String(localStatus || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  return _STATUS_NAME_CANDIDATES[key] || [String(localStatus || "").trim().toLowerCase()].filter(Boolean);
}
/** 在 {小写名: id} 表里按候选顺序找命中；查不到返回空串（调用方据此不带状态） */
function _lookupStatusId(stateMap, localStatus){
  if(!stateMap || typeof stateMap !== "object") return "";
  const cands = _statusCandidates(localStatus);
  for(const nm of cands){ const hit = stateMap[nm]; if(hit) return hit; }
  return "";
}

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
/** v3.7.79：桌面版是否有 Jira 主进程中继（浏览器形态没有 → Jira 仅桌面版可用） */
function jiraHasRelay(){
  const api = (typeof window !== "undefined" && window.electronAPI) ? window.electronAPI : null;
  return !!(api && typeof api.jiraFetch === "function");
}
/**
 * Jira 统一请求：有中继走主进程（无 CORS 约束），否则回落渲染进程直连
 * （浏览器形态会被 Atlassian 的 CORS 拦下 —— 如实失败，不假装成功）。
 * 域名/路径校验在两侧都有：这里先过 _intJiraBase 把主机钉死，主进程是第二道门。
 * @returns {Promise<{ok:boolean, status:number, body:any, error?:string}>}
 */
async function _jiraRequest(domain, path, opts){
  opts = opts || {};
  const base = _intJiraBase(domain);
  if(!base) return { ok: false, status: 0, body: null, error: "invalid_domain" };
  const api = (typeof window !== "undefined" && window.electronAPI) ? window.electronAPI : null;
  if(api && typeof api.jiraFetch === "function"){
    try{
      const host = new URL(base).hostname;
      const r = await api.jiraFetch({ domain: host, path: String(path), method: opts.method || "GET", body: opts.body || "", token: opts.token || "", timeoutMs: opts.timeoutMs });
      return r ? { ok: !!r.ok, status: r.status || 0, body: r.body || null, error: r.error || "" } : { ok: false, status: 0, body: null, error: "no_response" };
    }catch(e){
      return { ok: false, status: 0, body: null, error: (e && e.message) ? e.message : String(e) };
    }
  }
  return await _intDoRequest(base + path, {
    method: opts.method || "GET",
    headers: Object.assign({ "Authorization": "Bearer " + (opts.token || ""), "Content-Type": "application/json" }, opts.headers || {}),
    body: opts.body
  });
}
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
 */
/**
 * 启用 provider
 * @param {string} name - provider 名称
 * @returns {boolean} 是否成功
 */
/**
 * 禁用 provider
 * @param {string} name - provider 名称
 * @returns {boolean} 是否成功
 */
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
 */
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
 * 把一条本地任务单向推到 Notion 数据库（v3.7.70 接到底）。
 * 只做 push：本地是唯一真相源，Notion 侧只创建/更新，**不拉回、不做冲突合并**。
 * 双向同步要处理删除语义、离线合并与冲突裁决，是另一个数量级的工程量；而本产品定位是
 * 「本地优先、不主动外发」，所以消费点设计成"用户点一下才推"的单向动作。
 * @param {Object} task - 本地任务 { id, title, status, ... }
 * @returns {Promise<Object>} { success, action:'created'|'updated', remoteId, localId } 或 { success:false, error }
 */
async function notionSyncTask(task){
  if(!task || !task.id) return { success: false, error: "invalid_task" };
  const provider = await _intRequireProvider("notion", INTEGRATION_TYPES.NOTION);
  if(!provider) return { success: false, error: "provider_not_available" };

  const state = _intGetSyncState("notion");
  const syncInfo = state.syncedItems[task.id];
  const databaseId = provider.config.databaseId;
  if(!databaseId) return { success: false, error: "missing_database_id" };
  const headers = {
    "Authorization": "Bearer " + provider.config.token,
    "Notion-Version": "2022-06-28",
    "Content-Type": "application/json"
  };
  const props = JSON.stringify(_intNotionBuildPageProperties(task, databaseId));

  let resp;
  if(syncInfo){
    resp = await _intDoRequest("https://api.notion.com/v1/pages/" + syncInfo.remoteId, { method: "PATCH", headers: headers, body: props });
    if(resp.ok){
      _intRecordSync("notion", task.id, syncInfo.remoteId, "task");
      return { success: true, action: "updated", remoteId: syncInfo.remoteId, localId: task.id };
    }
  }else{
    resp = await _intDoRequest("https://api.notion.com/v1/pages", { method: "POST", headers: headers, body: props });
    if(resp.ok && resp.body && resp.body.id){
      _intRecordSync("notion", task.id, resp.body.id, "task");
      return { success: true, action: "created", remoteId: resp.body.id, localId: task.id };
    }
  }
  /* 失败原因要带出来：只回一个 sync_failed 会让"哪些没推上去"变成一笔糊涂账 */
  const detail = (resp.body && (resp.body.message || resp.body.code)) || resp.error || ("HTTP " + resp.status);
  return { success: false, error: String(detail).slice(0, 200) };
}

/**
 * 单向推送的公共记账骨架（Notion / Linear 共用，Jira 接线时同样复用）。
 * 逐条 push、逐条记账，**永不抛错** —— 部分失败必须如实报出失败条数与原因，
 * 不能因为"大多数成功了"就整体报成功（那是假账）。
 * @param {string} providerName - provider 注册名
 * @param {string} type - INTEGRATION_TYPES 之一
 * @param {Function} pushOne - 单条推送函数 (item) => { success, action, error }
 * @param {Array} tasks - 待推送项
 * @returns {Promise<Object>} { ok, created, updated, failed:[{title, error}] }
 */
async function _intPushEach(providerName, type, pushOne, tasks){
  const list = Array.isArray(tasks) ? tasks : [];
  const out = { ok: false, created: 0, updated: 0, failed: [] };
  if(!list.length){ out.error = "no_tasks"; return out; }
  if(!(await _intRequireProvider(providerName, type))){
    out.error = "provider_not_available";
    return out;
  }
  for(const item of list){
    let r;
    try{ r = await pushOne(item); }
    catch(e){ r = { success: false, error: (e && e.message) || String(e) }; }
    if(r && r.success){ if(r.action === "created") out.created++; else out.updated++; }
    else out.failed.push({ title: (item && item.title) || "", error: (r && r.error) || "unknown" });
  }
  out.ok = out.failed.length === 0;
  return out;
}

/**
 * 消费点：把一批任务推送到 Notion（面板「推送任务」按钮调的就是它）。
 * @param {Array} tasks - 待推送任务列表
 * @returns {Promise<Object>} 见 _intPushEach
 */
async function notionPushTasks(tasks){
  return await _intPushEach("notion", INTEGRATION_TYPES.NOTION, notionSyncTask, tasks);
}

/**
 * 消费点：把一批任务推送到 Jira（面板「推送任务」按钮调的就是它，v3.7.79）。
 * 与 notion/linear 同款：只推不拉、未完成任务、逐条结果如实上屏。
 */
async function jiraPushTasks(tasks){
  return await _intPushEach("jira", INTEGRATION_TYPES.JIRA, jiraSyncIssue, tasks);
}

/**
 * 同步笔记到 Notion（双向）
 * @param {Object} note - 本地笔记 { id, title, content, ... }
 * @param {string} direction - 'push' | 'pull' | 'sync'
 * @returns {Promise<Object>} 同步结果
 *   笔记这条仍未接线 —— 待定，别在它上面加 UI，见 docs/product-scope.md §三
 */
/* @deprecated v3.7.60 应用内零调用方（同步 / 通知尚未接线）· 渠道定案前勿新增调用点或在其上加 UI · 见 docs/product-scope.md §三 */
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
 *   没有消费这个列表函数（面板上还没有"已同步 N 条"这类回显）—— 待定，见 docs/product-scope.md §三
 */
/* @deprecated v3.7.60 应用内零调用方（同步 / 通知尚未接线）· 渠道定案前勿新增调用点或在其上加 UI · 见 docs/product-scope.md §三 */
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
/* v3.7.70：`_intNotionParsePage`（Notion 页面 → 本地任务）随 pull 分支一并删除。
   单向推送消费点不需要它，留着就是一段没人调的解析器 —— 真要做双向同步时再按那时的
   字段映射重写，而不是把今天猜的形状冻在这里。 */

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
  /* v3.7.85：连接即拉该团队的工作流状态 → 名字→stateId 映射（各工作区配置不同，运行时查最准） */
  if(resp.ok && config.teamId){
    const st = await _linearFetchStates(config.token, config.teamId);
    if(st.map && Object.keys(st.map).length){ provider.config.stateMap = st.map; provider.config.statesFetchedAt = _intNow(); }
  }
  _intSaveProviders();
  return provider;
}

/**
 * 拉取 Linear 团队的工作流状态 → {小写状态名: stateId}（v3.7.85）
 * @returns {Promise<{ok:boolean, map:Object|null, error?:string}>}
 */
async function _linearFetchStates(token, teamId){
  try{
    const resp = await _intDoRequest("https://api.linear.app/graphql", {
      method: "POST",
      headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({
        query: "query($id: String!) { team(id: $id) { states { nodes { id name } } } }",
        variables: { id: teamId }
      })
    });
    const err0 = resp.body && resp.body.errors && resp.body.errors[0];
    const nodes = resp.body && resp.body.data && resp.body.data.team && resp.body.data.team.states && resp.body.data.team.states.nodes;
    if(err0 || !Array.isArray(nodes)) return { ok: false, map: null, error: (err0 && err0.message) || "no_states" };
    const map = {};
    nodes.forEach(function(st){ if(st && st.id && st.name) map[String(st.name).trim().toLowerCase()] = st.id; });
    return { ok: true, map: map };
  }catch(e){ return { ok: false, map: null, error: (e && e.message) || String(e) }; }
}

/**
 * 把一条本地任务单向推到 Linear（v3.7.70 接到底）。
 * 只做 push：本地是唯一真相源，Linear 侧只创建/更新，不拉回、不做冲突合并。
 *
 * **注意**：状态映射**故意不接**（这是本轮核对文档后改掉的一处静默错误）：
 * Linear 的 `IssueCreateInput` / `IssueUpdateInput` 要的是 **`stateId`（团队工作流状态的 ID）**，
 * 而旧实现对两个 mutation 都传了 `state: "In Progress"`（状态**名**）—— schema 里没有这个字段，
 * 真机必被拒。名字→ID 得先查该团队的工作流状态，我手边没有可验证的 Linear 工作区，
 * 所以不猜：**推送不带状态**，issue 落到团队默认状态，面板文案如实写明这一点。
 * v3.7.85：状态映射改为**运行时**解析（connect 拉 team.states 建 名字→stateId 表）——
 * "查工作流状态"不需要我持有工作区，用用户自己的 token 连接时查一次即可，映射随各团队
 * 实况走；查不到就不带状态（落团队默认），不猜。
 * @param {Object} issue - 本地任务 { id, title, note, ... }
 * @returns {Promise<Object>} { success, action:'created'|'updated', remoteId, localId } 或 { success:false, error }
 */
async function linearSyncIssue(issue){
  if(!issue || !issue.id) return { success: false, error: "invalid_issue" };
  const provider = await _intRequireProvider("linear", INTEGRATION_TYPES.LINEAR);
  if(!provider) return { success: false, error: "provider_not_available" };

  const state = _intGetSyncState("linear");
  const syncInfo = state.syncedItems[issue.id];
  const teamId = provider.config.teamId;
  /* teamId 只在**建** issue 时必需（更新走 issue id）；缺了别静默降级成"推送成功" */
  if(!syncInfo && !teamId) return { success: false, error: "missing_team_id" };

  const headers = {
    "Authorization": "Bearer " + provider.config.token,
    "Content-Type": "application/json"
  };
  const desc = issue.note || issue.description || "";
  /* v3.7.85：状态映射命中则带 stateId（查不到就不带 —— 落对方默认，不猜） */
  const stateId = _lookupStatusId(provider.config.stateMap, issue.status);
  const query = syncInfo
    ? "mutation($id: String!, $input: IssueUpdateInput!) { issueUpdate(id: $id, input: $input) { success issue { id } } }"
    : "mutation($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { id } } }";
  const inputBase = { title: issue.title, description: desc };
  if(stateId) inputBase.stateId = stateId;
  const variables = syncInfo
    ? { id: syncInfo.remoteId, input: inputBase }
    : { input: Object.assign({ teamId: teamId }, inputBase) };

  const resp = await _intDoRequest("https://api.linear.app/graphql", {
    method: "POST", headers: headers, body: JSON.stringify({ query: query, variables: variables })
  });

  const node = syncInfo
    ? (resp.body && resp.body.data && resp.body.data.issueUpdate)
    : (resp.body && resp.body.data && resp.body.data.issueCreate);
  const graphqlErr = resp.body && resp.body.errors && resp.body.errors[0] && resp.body.errors[0].message;
  if(resp.ok && !graphqlErr && node && node.success && node.issue && node.issue.id){
    const remoteId = syncInfo ? syncInfo.remoteId : node.issue.id;
    _intRecordSync("linear", issue.id, remoteId, "issue");
    return { success: true, action: syncInfo ? "updated" : "created", remoteId: remoteId, localId: issue.id };
  }
  /* GraphQL 的失败是 **HTTP 200 + errors[]**，只回一句 sync_failed 等于什么都没说 ——
     排查时拿不到 mutation 名字、拿不到字段错误。这里把平台给的原因带出去。 */
  const why = graphqlErr || (node && node.success === false ? "issue 创建/更新被拒（success=false）" : "")
    || resp.error || ("HTTP " + resp.status);
  return { success: false, error: String(why).slice(0, 200) };
}

/**
 * 消费点：把一批任务推送到 Linear（面板「推送任务」按钮调的就是它）。
 * @param {Array} tasks - 待推送任务列表
 * @returns {Promise<Object>} 见 _intPushEach
 */
async function linearPushTasks(tasks){
  return await _intPushEach("linear", INTEGRATION_TYPES.LINEAR, linearSyncIssue, tasks);
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
  /* v3.7.79：浏览器形态连验证请求都发不出去（Atlassian 不回 CORS 头，实测）——
     与其存下一个"连上了但每次请求都失败"的死配置，不如当场如实拒绝并给出路。 */
  if(!jiraHasRelay()){
    try{ pushDiag("warn", "Jira 仅桌面版可用：浏览器形态拿不到 Atlassian 的 CORS 头", { where: "jiraConnect" }); }catch(e){}
    return null;
  }
  const provider = integrationRegisterProvider("jira", INTEGRATION_TYPES.JIRA, config);
  if(!provider) return null;
  // 验证 token（经主进程中继）
  const resp = await _jiraRequest(config.domain, "/rest/api/3/myself", { method: "GET", token: config.token });
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
 * v3.7.79：已接线（jiraPushTasks 经主进程中继推送）。
 */
/**
 * 拉取某个 Jira issue 的可用流转 → [{id,name}]（v3.7.85，运行时解析，不预置映射表）
 * @returns {Promise<{ok:boolean, list:Array<{id:string,name:string}>}>}
 */
async function _jiraFetchTransitions(domain, token, issueKey){
  try{
    const r = await _jiraRequest(domain, "/rest/api/3/issue/" + issueKey + "/transitions", { method: "GET", token: token });
    const list = r && r.body && Array.isArray(r.body.transitions) ? r.body.transitions : [];
    return { ok: !!(r && r.ok), list: list };
  }catch(e){
    return { ok: false, list: [] };
  }
}
/** 本地状态名按候选表匹配 transitions → 命中返回 transition id，否则空串 */
function _matchTransitionName(list, localStatus){
  if(!Array.isArray(list)) return "";
  const cands = _statusCandidates(localStatus);
  for(const nm of cands){
    const hit = list.find(function(x){ return x && x.id && String(x.name || "").trim().toLowerCase() === nm; });
    if(hit) return hit.id;
  }
  return "";
}
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
  if(!_intJiraBase(domain)) return { success: false, error: "invalid_domain" };
  /* v3.7.85：状态变换改为**运行时**解析 —— 更新成功后按该 issue 拉 transitions
     （/rest/api/3/issue/{key}/transitions），本地状态名按候选表匹配 transition 名，
     命中则 POST transitions；拉不到或匹配不上就**不变换**（对方状态保持不动），不猜。 */

  if(direction === "push" || direction === "sync"){
    let resp;
    if(syncInfo){
      // 更新 issue
      resp = await _jiraRequest(domain, "/rest/api/3/issue/" + syncInfo.remoteId, {
        method: "PUT",
        token: token,
        body: JSON.stringify({
          fields: { summary: issue.title, description: issue.description }
        })
      });
      if(resp.ok){
        /* v3.7.85：状态变换 —— 拉该 issue 的 transitions，本地状态名按候选匹配，命中才 POST */
        let transitioned = false;
        if(issue.status){
          const tr = await _jiraFetchTransitions(domain, token, syncInfo.remoteId);
          const tName = _matchTransitionName(tr.list, issue.status);
          if(tName){
            const trr = await _jiraRequest(domain, "/rest/api/3/issue/" + syncInfo.remoteId + "/transitions", {
              method: "POST", token: token, body: JSON.stringify({ transition: { id: tName } })
            });
            transitioned = !!trr.ok;
          }
        }
        _intRecordSync("jira", issue.id, syncInfo.remoteId, "issue");
        if(direction === "push") return { success: true, action: "updated", transitioned: transitioned, remoteId: syncInfo.remoteId, localId: issue.id };
      }
    }else{
      /* 创建 issue —— **刻意不带 status**：Jira create 的 fields 不接受 status（要变换工作流需
         走 transitions API，且 transition id 因工作流而异），带上真机必 400。新 issue 落项目
         默认状态；状态变换见上（运行时 transitions 匹配）。 */
      resp = await _jiraRequest(domain, "/rest/api/3/issue", {
        method: "POST",
        token: token,
        body: JSON.stringify({
          fields: {
            project: { key: projectKey },
            summary: issue.title,
            description: issue.description || ""
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
 * 列出 Jira issues（框架）
 * @param {Object} [filter] - { jql, limit }
 * @returns {Promise<Array>} issue 列表
 * v3.7.79：已接线（经主进程中继拉取；JQL 默认按项目 Key）。
 */
async function jiraListIssues(filter){
  const provider = await _intRequireProvider("jira", INTEGRATION_TYPES.JIRA);
  if(!provider) return [];
  filter = filter || {};
  const token = provider.config.token;
  const domain = provider.config.domain;
  const projectKey = provider.config.projectKey;
  const jql = filter.jql || ("project = " + projectKey);
  if(!_intJiraBase(domain)) return [];
  const resp = await _jiraRequest(domain, "/rest/api/3/search?jql=" + encodeURIComponent(jql) + "&maxResults=" + (filter.limit || 50), {
    method: "GET",
    token: token
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
 * 5. Slack —— 群机器人 Incoming Webhook 通知通道（v3.7.69，与 §6 同一套会话内存基建）
 * ============================================================
 * 通道定案依据（`_probe/cors-matrix-providers.mjs` 真实 Chromium 实测）：hooks.slack.com
 * 在 file:// 与 http(s) 两个 origin 下都不回任何 CORS 头（双双 "Failed to fetch"），
 * 主进程 Node fetch 可达 —— 与钉钉同款「仅桌面版」分流。
 * 旧的 Bot Token 模型（slackConnect 落盘 botToken + slackSendMessage/slackNotifyEvent/
 * slackCreateTaskFromMessage，应用内零调用方）整体删除；历史落盘的 botToken 由
 * _notifyScrubPersisted 一并回扫抹掉。
 * Incoming Webhook 的 URL 本身即凭据、无加签；成功判定只用 HTTP 200（正文是纯文本 "ok"）。 */

/**
 * 连接 Slack（群机器人 Incoming Webhook · 会话内存态，仅桌面版）
 * @param {Object} config - { url }
 * @returns {Promise<Object|null>} provider 或 null
 */
async function slackConnect(config){
  return notifyHookConnect("slack", config);
}

/* v3.7.69：旧的 slackSendMessage / slackNotifyEvent / slackCreateTaskFromMessage
 * （Bot Token 模型，应用内零调用方，v3.7.60 起标废弃）随通道改型一并删除 ——
 * 留着就是给一个已被判定配不通的凭据模型留尸体。守护：integration-deprecated.test.js。 */

/**
 * 断开 Slack：清内存凭据 + 回扫历史落盘 + 移除 provider 记录
 */
function slackDisconnect(){
  notifyHookClear("slack");
  _notifyScrubPersisted();
  return integrationRemoveProvider("slack");
}

/* ============================================================
 * 6. 飞书 / 钉钉 —— 群机器人 webhook 通知通道（v3.7.66）
 * ============================================================
 * 为什么是 webhook 而不是企业应用：旧的 appKey/appSecret + chatId 那套要企业自建应用
 * 管理员权限、还要用户拿不到的 chatId，个人场景根本配不通 —— 实测旧实现 6 个函数
 * （feishu/dingtalk × SendMessage / NotifyEvent / CreateTaskFromMessage）应用内零调用方，
 * v3.7.60 已整批标废弃。群自定义机器人只要一个 webhook 地址就能收消息，且天然单向，
 * 正好匹配"通知推出去"这个真实需求。旧的 6 个函数随本次删除。
 *
 * 凭据策略（硬约束，用户 2026-09-29 定：「那种东西最好不要上远程，本地也不要」）：
 *   webhook 地址与加签 Secret **只存在本模块的内存对象里** —— 不走
 *   integrationRegisterProvider / _intSaveProviders 那条密封写盘链，不进 localStorage、
 *   不进备份、不进云同步。刷新或关闭页面即失效，需要重新粘贴。
 *   这是刻意的产品决定，不是实现遗漏；UI 必须同样写明，别让用户以为存下来了。
 *   历史版本可能已把 feishu / dingtalk 的 appSecret 落过盘（appId/accessKey 当时还
 *   不算"敏感字段"，是明文存的）—— 启动时由 _notifyScrubPersisted 一次性抹掉。
 */

/** 会话内存态：null = 未配置（v3.7.69 + slack：Incoming Webhook，仅桌面版可达） */
const _notifyHooks = { feishu: null, dingtalk: null, slack: null };
/** 推送开关同样只在内存里（刷新回到未启用，避免出现"开关开着但凭据没了"的假状态） */
const _notifyHookKinds = { daily: true, due: true, chain: true, review: true };

/** 统一消息前缀：机器人若配「自定义关键词」安全策略，用户可以把这个词填进去 */
const NOTIFY_PREFIX = "[Agent工坊]";

/**
 * HMAC-SHA256 → base64（WebCrypto）。两个平台的签名算法见各自调用处注释。
 * @returns {Promise<string>} 失败时抛错，由调用方兜住
 */
async function _notifyHmacB64(keyStr, msgStr){
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(keyStr), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const buf = await crypto.subtle.sign("HMAC", key, enc.encode(msgStr));
  let bin = "";
  const bytes = new Uint8Array(buf);
  for(let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

/** 配置一个通道（纯内存）。cfg = { url, secret }；不写任何持久层。 */
function notifyHookSet(kind, cfg){
  if(!Object.prototype.hasOwnProperty.call(_notifyHooks, kind)) return false;
  const url = String((cfg && cfg.url) || "").trim();
  if(!/^https:\/\//i.test(url)) return false;               /* webhook 必须是 https，且不放行任意协议 */
  _notifyHooks[kind] = { url: url, secret: String((cfg && cfg.secret) || "").trim() };
  return true;
}
function notifyHookGet(kind){
  const h = _notifyHooks[kind];
  return h ? { kind: kind, configured: true, hasSecret: !!h.secret, urlHint: _notifyUrlHint(h.url) } : { kind: kind, configured: false, hasSecret: false, urlHint: "" };
}
function notifyHookClear(kind){
  if(!Object.prototype.hasOwnProperty.call(_notifyHooks, kind)) return false;
  _notifyHooks[kind] = null;
  return true;
}
/** 给 UI 看的脱敏回显：只保留 host + 路径末段前 4 位，绝不回显完整 token */
function _notifyUrlHint(url){
  try{
    const u = new URL(url);
    const seg = u.pathname.split("/").filter(Boolean).pop() || "";
    return u.host + "/…" + (seg ? "/" + seg.slice(0, 4) + "…" : "");
  }catch(e){ return "（地址无效）"; }
}
/** webhook 地址的主机名（无效地址返回空串），供渠道侧做渲染端口径的主机校验 */
function _notifyUrlHost(url){
  try{ return new URL(String(url)).hostname.toLowerCase(); }catch(e){ return ""; }
}

/** 该类事件当前是否允许外推 */
function notifyHookKindOn(kind){
  return _notifyHookKinds[kind] !== false;
}
function notifyHookKindSet(kind, on){
  if(!Object.prototype.hasOwnProperty.call(_notifyHookKinds, kind)) return false;
  _notifyHookKinds[kind] = !!on;
  return true;
}
function notifyHookState(){
  return { kinds: Object.assign({}, _notifyHookKinds), feishu: notifyHookGet("feishu"), dingtalk: notifyHookGet("dingtalk"), slack: notifyHookGet("slack") };
}

/**
 * 主进程发送能力探测（桌面版专属）。
 * 为什么要有这一层：2026-09-29/30 用真实网络 + 真实 Chromium 量了一整套
 * 「origin × 渠道 × 传输」矩阵（`_probe/cors-origin-matrix.mjs`、`_probe/electron-cors-main.cjs`）。
 * webhook 是 `Content-Type: application/json` 的 POST，**必触发 CORS 预检**，于是"发得出去吗"
 * 由两个轴决定，不是渠道单轴：
 *   飞书  渲染进程 · file://  → ❌ 被拦     飞书  渲染进程 · http(s) → ✅ 放行   飞书 主进程 → ✅
 *   钉钉  渲染进程 · file://  → ❌ 被拦     钉钉  渲染进程 · http(s) → ❌ 被拦   钉钉 主进程 → ✅
 * 机制：钉钉/企业微信**任何 origin 都不回 ACAO**（企微预检直接 403）；飞书只在 Origin 是真实
 * http(s) 源时给 `ACAO: *`，而 `file://` 的 Origin 下**一个 CORS 头都不回**
 * （`curl -H "Origin: null"` 复测确认）。本应用 Electron 窗口 `sandbox:true` 且未关 `webSecurity`，
 * 加载方式又是 `loadFile()` = file:// → 渲染进程照样被拦，只有主进程 Node fetch 发得出去。
 * @returns {boolean}
 */
function notifyHasMainSender(){
  const api = (typeof window !== "undefined" && window.electronAPI) ? window.electronAPI : null;
  return !!(api && typeof api.notifySend === "function");
}

/** 页面是否跑在"真实 http(s) 源"上 —— file:// 与 data: 拿不到对端的 CORS 头 */
function notifyOriginIsHttpish(){
  try{
    const p = (typeof location !== "undefined" && location.protocol) || "";
    return p === "http:" || p === "https:";
  }catch(e){ return false; }
}

/** 该渠道在当前运行形态下**真发得出去**吗（UI 与「连接」都以它为准，不许承诺发不到的通道） */
function notifyChannelAvailable(kind){
  if(kind === "feishu") return notifyHasMainSender() || notifyOriginIsHttpish();
  if(kind === "dingtalk") return notifyHasMainSender();
  /* v3.7.69：Slack Incoming Webhook 与钉钉同款 —— hooks.slack.com 不回任何 CORS 头
     （`_probe/cors-matrix-providers.mjs` 实测 file:// 与 http(s) 双双 "Failed to fetch"，
     主进程 Node fetch 可达 404 no_team），只有桌面版发得出去。 */
  if(kind === "slack") return notifyHasMainSender();
  return false;
}

/** 不可用时的一句话标签键（进面板状态位）：钉钉/Slack 缺的是主进程，飞书缺的是一个正经 origin */
function notifyUnavailableKey(kind){
  return (kind === "dingtalk" || kind === "slack") ? "int.desktopOnly" : "int.needHttpOrigin";
}

/** 不可用时如实说明为什么 + 怎么办（进 title 与连接弹窗，不是报错文案） */
function notifyUnavailableHint(kind){
  if(kind === "dingtalk" || kind === "slack") return "仅桌面版（Electron）可用：该 webhook 不回 CORS 头，任何浏览器形态都发不出去";
  return "请用「启动本地服务.bat」以 http://localhost 打开，或用线上站点：file:// 的 Origin 拿不到飞书的 CORS 头";
}

/**
 * 外发传输：桌面版优先走主进程 IPC（无 CORS 约束），其余走渲染进程 fetch。
 * 返回 { ok, status, body, error }，**永不抛错**。
 * 两条路径返回结构一致，所以平台侧的成功/失败判定（errcode / code）只有一份。
 */
async function _notifyTransport(url, payload){
  const api = (typeof window !== "undefined" && window.electronAPI) ? window.electronAPI : null;
  if(api && typeof api.notifySend === "function"){
    try{
      const r = await api.notifySend({ url: url, payload: payload });
      if(!r) return { ok: false, status: 0, body: null, error: "no_response" };
      return { ok: !!r.ok, status: r.status || 0, body: r.body || null, error: r.error || "" };
    }catch(e){
      return { ok: false, status: 0, body: null, error: (e && e.message) ? e.message : String(e) };
    }
  }
  return await _intDoRequest(url, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

/**
 * 向单个通道发一条文本。返回 { ok, error }，**永不抛错**（通知失败不能影响本地体验）。
 * 签名口径（易错点，都核对过官方文档要求的形式）：
 *   钉钉：timestamp 用**毫秒**；sign = base64(HMAC-SHA256(key=secret, data=timestamp+"\n"+secret))，
 *         放在 **URL query** 上（timestamp & sign）。
 *   飞书：timestamp 用**秒**；sign = base64(HMAC-SHA256(key=timestamp+"\n"+secret, data=**空串**))，
 *         与 timestamp 一起放在 **JSON body** 里。方向与钉钉相反，别写反。
 */
async function notifyHookSend(kind, text){
  const h = _notifyHooks[kind];
  if(!h) return { ok: false, error: "not_configured" };
  const body = String(text || "");
  if(!body) return { ok: false, error: "empty_text" };
  try{
    if(kind === "dingtalk"){
      const ts = Date.now();
      let url = h.url;
      if(h.secret){
        const sign = await _notifyHmacB64(h.secret, ts + "\n" + h.secret);
        url += (url.indexOf("?") >= 0 ? "&" : "?") + "timestamp=" + ts + "&sign=" + encodeURIComponent(sign);
      }
      const resp = await _notifyTransport(url, { msgtype: "text", text: { content: body } });
      /* 钉钉即使 HTTP 200 也可能业务失败（errcode≠0），只看 resp.ok 会把失败当成功 */
      const errcode = resp.body && resp.body.errcode;
      if(resp.ok && (errcode === undefined || errcode === 0)) return { ok: true, error: "" };
      return { ok: false, error: "errcode=" + errcode + " " + ((resp.body && resp.body.errmsg) || resp.error || "") };
    }
    if(kind === "feishu"){
      const ts = Math.floor(Date.now() / 1000);
      const payload = { msg_type: "text", content: { text: body } };
      if(h.secret){
        payload.timestamp = String(ts);
        payload.sign = await _notifyHmacB64(ts + "\n" + h.secret, "");
      }
      const resp = await _notifyTransport(h.url, payload);
      const code = resp.body && (resp.body.code !== undefined ? resp.body.code : resp.body.StatusCode);
      if(resp.ok && (code === undefined || code === 0)) return { ok: true, error: "" };
      return { ok: false, error: "code=" + code + " " + ((resp.body && resp.body.msg) || resp.error || "") };
    }
    if(kind === "slack"){
      /* v3.7.69：Slack Incoming Webhook —— URL 本身即凭据，无加签；成功=HTTP 200 且正文
         是纯文本 "ok"（主进程对非 JSON 响应回 body=null，不能拿 body 判定）；
         失败一律 4xx（404 no_team / 403 / 410），resp.ok 判定即可。 */
      if(!/(^|\.)hooks\.slack\.com$/i.test(_notifyUrlHost(h.url))){
        return { ok: false, error: "invalid_slack_host" };   /* 渲染侧同口径把主机钉死，主进程白名单是第二道门 */
      }
      const resp = await _notifyTransport(h.url, { text: body });
      if(resp.ok) return { ok: true, error: "" };
      return { ok: false, error: "HTTP " + resp.status + " " + (resp.error || "") };
    }
    return { ok: false, error: "unknown_kind" };
  }catch(e){
    return { ok: false, error: (e && e.message) ? e.message : String(e) };
  }
}

/**
 * 通知漏斗：本地展示之外，向所有已配置且启用的通道推一份。
 * fire-and-forget —— 不 await、不抛错、失败只进诊断面板。
 * @param {string} title - 通知标题（已是成品文案）
 * @param {string} body - 正文（可空）
 * @param {string} kind - daily | due | chain | review
 */
function notifyHookBroadcast(title, body, kind){
  /* 未登记的类别落到 daily 的开关上 —— 否则 `notifyHookKindOn` 对未知键恒为真，
     这类事件就成了关不掉的通道。 */
  const k = Object.prototype.hasOwnProperty.call(_notifyHookKinds, String(kind)) ? String(kind) : "daily";
  if(!notifyHookKindOn(k)) return;
  const text = NOTIFY_PREFIX + " " + String(title || "") + (body ? "\n" + String(body) : "");
  /* v3.7.69：+ slack（桌面版专属通道，不可用形态下 _notifyHooks.slack 恒为 null，天然跳过） */
  ["feishu", "dingtalk", "slack"].forEach(function(ch){
    if(!_notifyHooks[ch]) return;
    Promise.resolve().then(function(){ return notifyHookSend(ch, text); }).then(function(r){
      if(!r.ok) pushDiag("warn", ch + " 通知推送失败：" + r.error, { where: "notify-hook", kind: k });
    }).catch(function(e){
      pushDiag("warn", ch + " 通知推送异常：" + ((e && e.message) || e), { where: "notify-hook", kind: k });
    });
  });
}

/**
 * 注册到 core 的外发漏斗（v3.7.66）。
 * 不在 ui-daily 里直接调本函数 —— 那会给 ui-daily 加一条逆层依赖，
 * check:modules 会报 `ui-daily>ui-ge-integrations`。
 */
try{ registerExternalNotifier(notifyHookBroadcast); }catch(e){ /* core 未就绪时静默跳过，本地通知不受影响 */ }

/**
 * 抹掉历史版本可能已落盘的飞书 / 钉钉凭据（一次性，幂等）。
 * 旧实现把整个 config（含 appSecret / accessSecret，甚至当时不算"敏感"的 appId / accessKey）
 * 写进了 wb_integration_providers；按新策略这些一律不许留在磁盘上。
 * @returns {number} 被清除的条目数
 */
function _notifyScrubPersisted(){
  let n = 0;
  try{
    _intLoadProviders();
    /* v3.7.69 + slack：旧 slackConnect 把 botToken 持久化在 providers 里，一并回扫 */
    ["feishu", "dingtalk", "slack"].forEach(function(k){
      if(_integrationProviders && Object.prototype.hasOwnProperty.call(_integrationProviders, k)){
        delete _integrationProviders[k];
        n++;
      }
    });
    if(n) _intSaveProviders();
  }catch(e){ /* 清不动也不能挡住启动 */ }
  return n;
}

/**
 * 「连接」= 校验 webhook 可用并把凭据留在内存里，随后发一条问候消息确认通路。
 * 返回一个 provider 形状的对象给面板复用（_verified 决定显示「已连接 · 已验证」）。
 * @param {string} kind - feishu | dingtalk
 * @param {Object} cfg - { url, secret }
 */
async function notifyHookConnect(kind, cfg){
  /* 先发不出去就别存：一个"已连接"的死配置比没配更糟，而且它会谎报通路存在。 */
  if(!notifyChannelAvailable(kind)){
    try{ pushDiag("warn", kind + " 渠道在当前形态不可用：" + notifyUnavailableHint(kind), { where: "notify-hook", op: "connect" }); }catch(e){}
    return null;
  }
  if(!notifyHookSet(kind, cfg)) return null;
  const prov = { name: kind, type: kind === "feishu" ? INTEGRATION_TYPES.FEISHU : INTEGRATION_TYPES.DINGTALK, config: { _lastVerifiedAt: _intNow() }, enabled: true, ephemeral: true };
  const r = await notifyHookSend(kind, NOTIFY_PREFIX + " 连接成功 —— 这条通知由本会话内存中的 webhook 发出，刷新页面后需重新配置。");
  if(!r.ok){
    /* 验证不过就退回未配置：留一个发不出去的死配置比"没配"更糟。
       失败原因进诊断面板（面板上的 toast 只有通用文案，装不下平台返回的 errmsg）。 */
    notifyHookClear(kind);
    try{ pushDiag("warn", kind + " webhook 验证失败：" + r.error, { where: "notify-hook", op: "connect" }); }catch(e){}
    return null;
  }
  return prov;
}

/**
 * 连接飞书（群机器人 webhook · 会话内存态）
 * @param {Object} config - { url, secret }
 */
async function feishuConnect(config){
  return notifyHookConnect("feishu", config);
}
/**
 * 连接钉钉（群机器人 webhook · 会话内存态）
 * @param {Object} config - { url, secret }
 */
async function dingtalkConnect(config){
  return notifyHookConnect("dingtalk", config);
}
/** 断开：清内存凭据，并顺手确认存储里没有残留 */
function feishuDisconnect(){
  notifyHookClear("feishu");
  _notifyScrubPersisted();
  return integrationRemoveProvider("feishu");
}
function dingtalkDisconnect(){
  notifyHookClear("dingtalk");
  _notifyScrubPersisted();
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
   data-idb.js 的 OAuth2 回调 stub 已随 v3.7.71 一并清掉）。留着会误导读者以为该模块仍存在 ——
   2026-09-27 审计时我自己就先被它误导了一次（在源码态 grep 应用代码得到 0 处，一度误判为「被抽取破坏」）。
   纯注释残留，删除无功能影响。 */

/* v3.7.78 解耦：测试导出桥自 ui-global-events 迁来（见彼处说明）。
   放最后一块后所有被引符号均已初始化，唯一行为差异是「桥在更晚的时刻构建」——
   对测试（加载完才读）与生产（仅 localhost/?__test=1 挂载）都无感。 */
if (typeof window !== "undefined" && __TEST_GATE__ && window.__test) {
  Object.assign(window.__test, {
    execTool, migrate, runLinks, completeTask,
  _guardGenericJsonKeys, _brokenBackup,
    getTasks, setTasks, getRec, setRec, getLinks,
    _buildCloudSnapshot, // v3.7.58：render-overview 的云快照构造（安全排除键的单测入口）
    /* v3.7.88：WebDAV 同步主流程（上传/下载/412 冲突 UX） */
    webdavSyncUpload, webdavSyncDownload,
    SCENARIOS, ORDER, TOOLS, DEFAULT_LINKS, PREFIX, MVP_SCOPE,
    // v3.7.12（解耦 S0）：暴露核心层数据表与跨层通道，供测试驱动钩子与断言"谁注册了实现"
    SCENE_FEATURE_BIND, AppBridge,
    effectiveTools, chatSysPrompt, // v1.15：AI 层降级重定位（agent=false 过滤工具 + 话术降级）
    effectiveSysprompt, setCustomSysprompt, trimChatHist, // v1.15：sysprompt 可编辑 + 上下文 token 预算
    // T2.3 轻量 store 访问器（供测试驱动与断言）
    createStore, taskStore, cfgStore, linkStore,
    // T3.5 Markdown 解析器（供测试驱动与断言）
    mdToHtml, escapeHtml: esc, safeUrl, inlineMd, sanitizeHtml,
    /* v3.7.59：图表画布 SVG 生成器（render-overview 的 _dgmSvgHtml）。与 _buildCloudSnapshot
       同理——安全相关的内部函数需要单测入口，否则「id/color 未转义」这类注入只能靠人眼守。
       回归用例见 tests/sanitize-xss-regression.test.js。 */
    _dgmSvgHtml, _dgmColor, _dgmNum,
    todayStr, shiftDay, esc, uid, lineChartSVG, seed, sm2,
    encryptKey, decryptKey, initCrypto, getDeviceKey,
    base64Encode, base64Decode, persistCfg, getCfg, saveCfg, _resetCrypto,
    // P1-b 自动备份访问器（供测试驱动与断言）
    snapshotAutoBackup, scheduleAutoBackup, getAutoBackup, recoverAutoBackup,
    pushDiag, getDiag,
    // v3.7.64：诊断与反馈面板（关于卡）—— 报告构造与列表渲染的单测入口
    buildDiagReport, renderDiagList,
    /* v3.7.65：反馈出口 —— Issue 预填 URL 构造 / 形态标签 / 提交动作（守卫用例见 tests/diag-report.test.js ⑤⑥⑦） */
    _diagIssueUrl, _diagEnvTag, openDiagIssue,
    // v3.7.66：manifest shortcuts 的 hash → 视图接线（用例见 tests/pwa-shortcuts.test.js）
    applyStartHash,
    // P0-4 诊断寄存器访问器（只读快照 + 测试间复位）
    calcStreak, heatmapData, analyzeBehavior, renderHeatmap,
    fetchCoachAdvice, renderHabitChainStatus,
    greeting, needsOnboarding, renderOnboarding,
    renderToday,
    renderHelp, helpSection,
    // 测试用场景切换访问器
    setActive, getActive, render,
    genProfileId, getActiveProfile, migrateProfiles,
    switchProfile, newProfile, dupProfile, delProfile,
    renderProfileSelect, fillProfileForm, openDrawer, closeDrawer,
    openAiPage, openPluginPage,
    // T2.4 错误边界访问器（供测试驱动与断言）
    _backupBroken, _validateAndMigrateTasks, _validateCfg, _validateLinks,
    getCorrupted: () => _corrupted,
    resetCorrupted: () => { _corrupted = {}; _corruptWarned = false; },
    chatOnce, doExport,
    // T3.1 AI 增强（取消/重试/流式）访问器（供测试驱动与断言）
    abortChat, retryChat, createChatController, showChatThinking, runChatLoop,
    getChat, appendChat,
    // v2.0 多 Session 聊天存储层访问器（供测试驱动与断言）
    getSessions, setActiveSession, getActiveSession, getActiveSessionObj,
    createSession, renameSession, deleteSession,
    appendSessionMsg, getSessionMsgs, clearSessionMsgs,
    openSessionModal, closeSessionModal, renderSessionList, renderSessionPreview, bindSessionModal,
    _resetSessions, _reloadChatsFromStorage,
    restoreRecycleBatch, purgeRecycleBatch, getRecyclePolicy, setRecyclePolicy, cleanupRecycle,
    buildTasksCSV, buildTasksMD, doExportCSV, doExportMD, trapFocus, closeRecycleModal,
    // v1.4-C 数据导入导出增强：CSV 字段选择 / 记录导出 / CSV 导入 / 导出预览 / 多设备同步 / 迁移日志
    parseCSV, parseCSVRows, csvRowToTask, previewImportCSV, doImportCSV, cancelImportCSV, doImportCSVFile,
    openExportPreview, closeExportPreview, getDeviceId,
    getLastMergeLog, detectLegacyData, getMigrationLog,
    getPendingCSVImport, setPendingCSVImport,
    // P5' 命令面板增强（模糊搜索 / 最近使用）访问器
    fuzzyScore, fuzzyMatch, highlightHits, pinyinInitials, getCmdRecent, pushCmdRecent,
    // P1 自定义场景访问器（供测试驱动与断言）
    addCustomScenario, updateCustomScenario, removeCustomScenario,
    setBuiltinOverride, resetBuiltinOverride, loadCustomScenarios, registerCustomScenarios,
    // 第三轮：P8 多维筛选+保存视图 / P2' 联动关系图 / P9 稍后提醒+免打扰 访问器
    renderChainGraph, getGlobViews, saveGlobView, removeGlobView, _applyGlobFilters,
    snoozeTask, getQuietHours, setQuietHours, isQuietTime,
    updateTask, openTaskEdit, closeTaskEditModal,
    // 第四轮批次①：场景内联合筛选 + AI 确认弹窗关闭（ESC 链）
    applyBoardFilter, closeConfirmModal, doClear,
    // 第四轮批次②：看板拖拽排序 + 键盘操作（B4/B5）
    reorderTask, setupKanbanDnD, setupKanbanKeyboard,
    undoTasks, redoTasks, canUndo, canRedo, clearUndoStack,
    // 第四轮批次④：AI 请求参数（超时/温度）可配置（B8）
    getAiParams,
    validateBaseUrl,
    getCustomLinks, saveCustomLinks, addCustomLink, removeCustomLink,
    updateCustomLink, toggleCustomLink, resetCustomLinks,
    renderLinksBox, _renderChainRow, _renderChainEditRow,
    // T3.3 数据统计（趋势/分布/链成功率/汇总指标 + 渲染）
    calcTrend, calcSceneDist, calcChainSuccess, calcStats,
    renderTrendChart, renderPieChart, renderStats,
    getNotifyEnabled, setNotifyEnabled,
    checkDueTasks, markNotifiedIds,
    checkChainBreak, markChainBreakNotified,
    dailyDigestNotify, markDigestSent,
    runNotifyCheck, startNotifyScheduler, stopNotifyScheduler,
    renderSkeleton, renderEmpty, withSkeleton,
    // v3.2 阶段二：交互反馈工具（供测试驱动与断言）
    withLoading, removeWithLeave, validateField,
    // v3.2 阶段二：错误态组件（供测试驱动与断言）
    renderErrorState, renderOfflineState,
    // T4.3 移动端增强（手势方向计算 + 场景切换 + 移动端/横屏检测 + 横屏折叠）
    handleSwipe, swipeToScene, isMobile, isMobileLandscape, applyLandscapeFold,
    notifySystem, dailyDigest,
    // T5.3 浏览器兼容（fallback 守卫函数 / 兼容性自检 / crypto warn 标记）
    isAbortSupported: function(){ return (typeof AbortController !== "undefined" && typeof AbortSignal !== "undefined"); },
    isReadableStreamSupported: function(){ return (typeof ReadableStream !== "undefined"); },
    isCryptoReady: function(){ return _cryptoReady; },
    resetCryptoWarn: function(){ _cryptoWarned = false; },
    idbShouldMirror, idbOpen, idbMirrorKey, idbReadKey, idbDeleteKey,
    idbQueueMirror, idbFlushQueue, idbKeys, idbRestoreAll, idbMirrorAll,
    idbClearAll, initIdb, doIdbRestore,
    // 架构项② 渲染扩展（卡片注册 + 场景扩展区注册）
    registerCard, registerSceneSection, getSceneSections,
    renderSceneSections, bindSceneSections,
    // v1.3.4-C 生活场景·健康概览卡片（供测试驱动与断言）
    healthCard, bindHealthCard, getHealthRecs, parseNum,
    // 第六轮 R5：工作记忆容量可配置
    getMemMax,
    // v1.4-B 性能优化工具（防抖 + 虚拟滚动 + DOM 复用）
    _renderKanbanCard, _renderKanbanCol, _updateKanbanVScroll,
    _renderRecItem, _renderRecList, _updateRecVScroll,
    _renderReviewItem, _updateReviewVScroll,
    _tryMoveKanbanCardLocal, _bindVirtualScrolls,
    // v1.4-E 协作/分享：任务分享链接 + 联动规则分享导入 + 场景模板一键导入
    generateShareLink, parseShareLink, renderSharedTaskCard, openSharedTaskModal, checkSharedTaskOnLoad,
    generateChainShareCode, importChainShareCode, openChainShareModal, openChainImportModal,
    // v1.4-D AI 能力增强：自然语言建任务/操作解析 + AI 每日报告
    parseNaturalLanguageTask, parseNaturalLanguageAction, executeNaturalLanguageAction,
    generateDailyReport, collectDailyReportData,
    renderDailyReportCard, handleDailyReport,
    _cn2num,
    getSyncQueue, enqueueSync, clearSyncQueue, registerBackgroundSync, flushSyncQueue,
    showOfflineBanner, hideOfflineBanner, setSyncRetryState, updateOnlineStatus, initNetworkMonitor,
    isAppInstalled, showInstallModal, hideInstallModal, showInstallButton, hideInstallButton,
    promptInstall, initInstallPrompt,
    subscribePush, unsubscribePush, sendTestPushNotification,
    refreshPushUI, initPushUI, bindInstallUI, bindOfflineBanner, initPWAEnhancements,
    // v1.4-D onChatSubmit（供集成测试调用）
    onChatSubmit,
    bindChatPanel, renderChatDisabled,
    // 函数声明会被提升，可直接引用；MESSAGES / SUPPORTED_LANGS 是 const，
    t, getLang, setLang, initI18n, applyI18n,
    get MESSAGES(){ return MESSAGES; },
    get SUPPORTED_LANGS(){ return SUPPORTED_LANGS; },
    // v1.5-B 插件/扩展体系（注册框架 + 自定义场景/卡片/链规则 + 插件市场 UI）
    // 函数声明会被提升，可直接引用；_plugins / BUILTIN_PLUGINS 用 var 声明
    registerPlugin, loadPlugin, unloadPlugin, setPluginEnabled,
    getPluginConfig, setPluginConfig, getAllPlugins, getEnabledPlugins,
    getPlugin, getPluginScenarios, getPluginCards, getPluginChainRules,
    _savePluginsState, _loadPluginsState, _resetPlugins,
    renderPluginBox, openPluginDetailModal, openPluginPanel,
    registerPluginFromJson, renderPluginCards,
    get _plugins(){ return _plugins; },
    get BUILTIN_PLUGINS(){ return BUILTIN_PLUGINS; },
    // v1.5-C 主题系统（多主题切换 / 自定义主题编辑 / 场景配色个性化 / 主题导入导出）
    // 函数声明会被提升，可直接引用；PRESET_THEMES / SEPIA_TOKENS 用 var 声明
    setTheme, getCurrentTheme, getCustomThemes, saveCustomThemes,
    createCustomTheme, deleteCustomTheme, updateCustomTheme,
    exportTheme, importTheme, getScenarioColors, saveScenarioColors,
    getAllThemes, _resetThemeSystem, _applyScenarioColors,
    get PRESET_THEMES(){ return PRESET_THEMES; },

    get SEPIA_TOKENS(){ return SEPIA_TOKENS; },
    // v1.5-D 高级统计/报表（周/月/年报 + 自定义范围 + 对比 + PDF 导出）
    // 函数声明会被提升，可直接引用；_reportModalState 用 var 声明
    _rangeWeek, _rangeMonth, _rangeYear, _rangeCustom, _taskDateStr,
    generateReport, compareReports, renderReportHTML, renderCompareHTML,
    exportReportPDF, openReportModal, closeReportModal, bindReportModal,
    _renderReportModal,
    get _reportModalState(){ return _reportModalState; },
    aiDecomposeTask, aiSmartRecommend, aiGenerateCode,
    parseDecomposeResult, parseDecomposeIntent, parseCodeGenIntent,
    handleAiDecompose, handleAiCodeGen,
    _aiChatText,
    renderAiRecommendCard, handleAiRecommend,
    // v1.6-B 生产力工具增强：笃行 / 时间追踪 / 日历视图 / 批量操作
    // 函数声明会被提升，可直接引用；_pomoState / _tracker / _batchState 用 var 声明
    // 在 41/42/43/19 中定义（加载顺序 31 < 41/42/43，19 已在 31 之前加载）
    // 使用 getter 延迟求值避免 TDZ；函数引用安全（函数声明提升）
    startPomodoro, stopPomodoro, getPomoState, getPomoCount,
    startTracking, pauseTracking, resumeTracking, stopTracking, getTrackerState, getTaskTime,
    renderCalendarView, getCalendarMonthData, renderWeekView, bindCalendarEvents,
    toggleBatchMode, toggleBatchSelect, toggleBatchSelectAll,
    getBatchSelected, batchComplete, batchDelete,
    batchMoveScenario, batchSetPriority, bindBatchToolbar,
    get _pomoState(){ return _pomoState; },
    get _tracker(){ return _tracker; },
    get _batchState(){ return _batchState; },
    get POMO_FOCUS_MIN(){ return POMO_FOCUS_MIN; },
    get POMO_BREAK_MIN(){ return POMO_BREAK_MIN; },
    // v1.6-C 数据可视化增强：甘特图 / 思维导图 / 自定义仪表盘 / 雷达图 / 桑基图
    // 函数声明会被提升，可直接引用；DASHBOARD_WIDGETS 用 var 声明
    renderGanttChart, getGanttData, openGanttModal, closeGanttModal,
    renderMindmap, getMindmapTree, openMindmapModal, closeMindmapModal,
    renderCustomDashboard, getDashboardLayout, saveDashboardLayout,
    resetDashboard, moveDashboardWidget, bindDashboardDnD,
    openDashboardModal, closeDashboardModal,
    radarChartSVG, sankeyChartSVG, getRadarData, getSankeyData,
    get DASHBOARD_WIDGETS(){ return DASHBOARD_WIDGETS; },
    // v1.6-D 知识管理：笔记系统 + 知识库 + 全文搜索
    // 函数声明会被提升，可直接引用；47/48 > 31，但函数声明提升使引用安全
    getNotes, saveNotes, createNote, updateNote, deleteNote, getNoteById,
    getNotesByTag, getNotesByCategory, getAllTags, getAllCategories,
    linkNoteToTask, unlinkNoteFromTask, getNotesLinkedToTask,
    renderNoteEditor, renderNoteList,
    openNotesModal, closeNotesModal,
    openNoteEditorModal, closeNoteEditorModal, saveNoteFromEditor,
    renderKnowledgeBase, openKnowledgeBaseModal, closeKnowledgeBaseModal,
    searchAll, highlightSearchResult, renderSearchResults,
    openSearchModal, closeSearchModal, executeSearch,
    get NOTES_STORAGE_KEY(){ return NOTES_STORAGE_KEY; },
    // v1.8-C 集成（供测试驱动）
    integrationSetHttpClient,
    // v1.8-C 集成内部件（async provider 取用 + 同步状态管理 + 存储 key，供注入式测试）
    _intRequireProvider, _intLoadProviders, _intResetIntegrationCache,
    _intGetSyncState, _intRecordSync, _intFindLocalId,
    get INTEGRATION_PROVIDERS_KEY(){ return INTEGRATION_PROVIDERS_KEY; },
    get INTEGRATION_SYNC_STATE_KEY(){ return INTEGRATION_SYNC_STATE_KEY; },
    get INTEGRATION_TYPES(){ return INTEGRATION_TYPES; },
    // 已移除模块的 getter（enterprise/collab/worker/security/e2ee/oauth2/webhook/voice/multimodal/capacitor/biometric）
    initHeavyModules,
    // 系统级消息中心访问器（供测试驱动与断言）
    getMessages, addMessage, markMessageRead, markAllMessagesRead,
    clearMessages, getUnreadCount, updateMsgBadge, renderMsgPanel,
    get MSG_KEY(){ return MSG_KEY; },
    // v2.3.0 工具应用注册表 + 系统概况卡（供测试驱动与断言）
    TOOL_APPS, openToolStub, renderSystemOverviewCard, renderOverview,
    // v2.4.0 四大新页面（供测试驱动与断言）
    renderTasksPage, renderToolboxPage, renderStorePage, renderChainPage,
    // v3.0.1 B-3/B-5：JS 沙箱运行器 + 数据可视化迷你图表（供测试驱动与断言）
    runJsSnippet, parseChartData, renderMiniChart,
    // v3.1：SQL Playground（sql.js WASM 沙箱，供测试驱动与断言）
    runSql, loadSqlJs, bindCodeSqlCard,
    // v3.1.2：AI 页 8 子模块配置存取 + 回收站多类型 bin 通道（供测试驱动与断言；此前结构性不可测）
    getAiConfig, saveAiConfig, renderAiSkillsBuiltin, renderAiMcpList, renderAiWorkflowList,
    renderAiSessHistory, AI_BUILTIN_SKILLS,
    getRecycleBin, addToRecycleBin, restoreFromRecycleBin,
    get _dashEditMode(){ return _dashEditMode; },
    set _dashEditMode(v){ _dashEditMode = !!v; },
    // ===== AI 能力增强（任务 232）：Agent 自动化 + 新工具 + RAG + 流式增强 =====
    agentPlanSysPrompt, parseAgentPlan, executeAgentPlan, summarizeAgentPlan, chatOnceAgent,
    agentExecAsync, toolWebSearch, toolWebFetch, toolCodeRun, toolSqlQuery,
    ragInit, getRagDocs, saveRagDocs, ragIndexAdd, ragIndexRemove, ragSearch,
    ragTokenize, ragLexicalTop, ragHybridSearch, ragVectorSearch, aiEmbedTexts, ragCosine,
    ragInjectContext, ragReindex,
    // v3.7.67：RAG 增量同步（哈希 diff + 防抖）——测试直接驱动 ragSyncIncremental 免等定时器
    ragSyncIncremental, ragScheduleSync, _ragCurrentDocs, _ragDocHash,
    get RAG_SYNC_DEBOUNCE_MS(){ return RAG_SYNC_DEBOUNCE_MS; },
    get RAG_SYNC_EMBED_CAP(){ return RAG_SYNC_EMBED_CAP; },
    switchModel, listModels, retryChatWithParams,
    streamProgressStart, streamProgressUpdate, getStreamProgress, streamProgressClear,
    get RAG_STORAGE_KEY(){ return RAG_STORAGE_KEY; },
    get _ragReady(){ return _ragReady; },
    set _ragReady(v){ _ragReady = !!v; },
    get _ragLex(){ return _ragLex; },
    get _retryOverrides(){ return _retryOverrides; },
    get _streamProgress(){ return _streamProgress; }
  });
}

/* ============================================================
 * GitHub 接入底座（v3.7.86 B4）
 * 为什么选 Device Flow：专为 CLI/桌面应用设计 —— **只需 client_id，不需要 client_secret、
 * 不需要回调服务器与备案域名**（本仓自建后端不存在，这是唯一零后端可用的官方流程）。
 * 传输：api.github.com 实测回 ACAO:*（预检 204），浏览器直连，无需主进程中继。
 * 凭据：device token 与 AI Key 同款走设备密钥 AES-GCM 加密落盘（复用 encryptKey/decryptKey）。
 * 载体：Gist（私有）存云同步快照 —— Gist 自带 revision 历史，与增量契约天然衔接。
 * 边界：未配置 client_id 时只有状态提示，无可点按钮；device 流程的端到端需真实 client_id 验收。
 * ============================================================ */
const GH_TOKEN_KEY = "github_device_token";
const GH_GIST_ID_KEY = "github_gist_id";
/** GitHub 授权页地址（用户点开后确认，轮询在本机继续） */
const GH_VERIFY_URL = "https://github.com/login/device";
async function _ghJson(url, method, headers, body){
  try{
    const resp = await fetch(url, {
      method: method || "GET",
      headers: Object.assign({ "Accept": "application/vnd.github+json", "Content-Type": "application/json" }, headers || {}),
      body: body ? JSON.stringify(body) : undefined
    });
    let j = null;
    try{ j = await resp.json(); }catch(e){ /* 非 JSON 响应按状态码判定 */ }
    return { ok: resp.ok, status: resp.status, data: j || {} };
  }catch(e){
    return { ok: false, status: 0, data: {}, error: (e && e.message) ? e.message : String(e) };
  }
}
/** 取解密后的 device token（无/坏值返回 ""） */
async function githubToken(){
  try{
    const raw = load(PREFIX + GH_TOKEN_KEY, "");
    if(!raw) return "";
    if(typeof isEncKey === "function" && isEncKey(raw)){
      const plain = await decryptKey(raw);
      return typeof plain === "string" ? plain : "";
    }
    return typeof raw === "string" ? raw : "";
  }catch(e){ return ""; }
}
/** 保存 device token（加密落盘；失败如实返回 false） */
async function githubTokenSet(token){
  try{
    if(!token) return githubTokenClear();
    const enc = (typeof encryptKey === "function") ? await encryptKey(token) : token;
    save(PREFIX + GH_TOKEN_KEY, enc);
    return true;
  }catch(e){ return false; }
}
/** 清除 device token 与 Gist 指针 */
function githubTokenClear(){
  try{
    try{ localStorage.removeItem(PREFIX + GH_TOKEN_KEY); }catch(e){}
    try{ localStorage.removeItem(PREFIX + GH_GIST_ID_KEY); }catch(e){}
  }catch(e){}
  return true;
}
/** 是否已授权（token 存在）；只查存储不解密，够 UI 用 */
function githubHasToken(){ try{ return !!load(PREFIX + GH_TOKEN_KEY, ""); }catch(e){ return false; } }
/** 已保存的 Gist 指针 */
function githubGistId(){ try{ return load(PREFIX + GH_GIST_ID_KEY, ""); }catch(e){ return ""; } }
/**
 * 第一步：申请设备码（POST device/code）
 * @param {string} clientId - GitHub OAuth App 的 client_id（公开值）
 * @returns {Promise<{ok:boolean, userCode?:string, verifyUrl?:string, interval?:number, expiresIn?:number, error?:string}>}
 */
async function githubDeviceStart(clientId){
  const cid = String(clientId || "").trim();
  if(!cid) return { ok: false, error: "no_client_id" };
  const r = await _ghJson("https://github.com/login/device/code", "POST", {}, { client_id: cid, scope: "gist" });
  const d = r.data || {};
  if(!r.ok || d.error || !d.device_code){
    return { ok: false, error: (d.error && ("incorrect_client_credentials" === d.error ? "bad_client_id" : d.error)) || ("HTTP " + r.status) };
  }
  return { ok: true, deviceCode: d.device_code, userCode: d.user_code, verifyUrl: d.verification_uri || GH_VERIFY_URL,
    interval: d.interval || 5, expiresIn: d.expires_in || 900 };
}
/**
 * 第二步：轮询 token（POST oauth/access_token）—— authorization_pending 表示用户还没确认
 * @returns {Promise<{ok:boolean, done?:boolean, pending?:boolean, slowDown?:boolean, error?:string}>}
 */
async function githubDevicePoll(clientId, deviceCode){
  const cid = String(clientId || "").trim();
  const dc = String(deviceCode || "").trim();
  if(!cid || !dc) return { ok: false, error: "bad_args" };
  const r = await _ghJson("https://github.com/login/oauth/access_token", "POST", {}, { client_id: cid, device_code: dc, grant_type: "urn:ietf:params:oauth:grant-type:device_code" });
  const d = r.data || {};
  if(d.access_token){
    const saved = await githubTokenSet(d.access_token);
    if(!saved) return { ok: false, error: "token_store_failed" };
    return { ok: true, done: true };
  }
  if(d.error === "authorization_pending") return { ok: true, pending: true };
  if(d.error === "slow_down") return { ok: true, slowDown: true };
  if(d.error === "expired_token" || d.error === "access_denied") return { ok: false, error: d.error };
  return { ok: false, error: d.error || ("HTTP " + r.status) };
}
/**
 * 快照上行 → 私有 Gist（已存在则更新，保留 revision 历史）
 * @param {string} text - 云快照 JSON
 * @param {string} [filename] - gist 内文件名
 * @returns {Promise<{ok:boolean, gistId?:string, url?:string, error?:string}>}
 */
async function gistSyncPut(text, filename){
  const token = await githubToken();
  if(!token) return { ok: false, error: "not_authorized" };
  const name = String(filename || "agent-workshop-snapshot.json");
  const body = { description: "Agent Workshop 云同步快照（设备自动维护）", public: false, files: {} };
  body.files[name] = { content: String(text || "") };
  const gid = githubGistId();
  const url = gid ? ("https://api.github.com/gists/" + encodeURIComponent(gid)) : "https://api.github.com/gists";
  const r = await _ghJson(url, gid ? "PATCH" : "POST", { Authorization: "Bearer " + token }, body);
  const d = r.data || {};
  if(!r.ok || d.message){ return { ok: false, error: d.message || ("HTTP " + r.status) }; }
  if(d.id) save(PREFIX + GH_GIST_ID_KEY, d.id);
  return { ok: true, gistId: d.id || gid, url: d.html_url || "" };
}
/**
 * 快照下行 → 从私有 Gist 读回
 * @returns {Promise<{ok:boolean, text?:string, error?:string}>}
 */
async function gistSyncGet(filename){
  const token = await githubToken();
  const gid = githubGistId();
  if(!token) return { ok: false, error: "not_authorized" };
  if(!gid) return { ok: false, error: "no_gist" };
  const r = await _ghJson("https://api.github.com/gists/" + encodeURIComponent(gid), "GET", { Authorization: "Bearer " + token });
  const d = r.data || {};
  if(!r.ok) return { ok: false, error: d.message || ("HTTP " + r.status) };
  const name = String(filename || "agent-workshop-snapshot.json");
  const file = d.files && d.files[name];
  if(!file || typeof file.content !== "string") return { ok: false, error: "file_missing" };
  /* 大文件 content 可能为空（>1MB 时 API 只给 truncated + raw_url）——如实失败，不假装成功 */
  if(file.truncated) return { ok: false, error: "file_truncated" };
  return { ok: true, text: file.content };
}

/* ============================================================
 * WebDAV 云同步载体（v3.7.87）
 * 为什么是它（用户 2026-10-03：「不出国、GitHub 不方便」）：坚果云等国内网盘提供
 * 标准 WebDAV + **应用密码** —— 凭据门槛最低（无 OAuth/企业资质），国内直连可达。
 * 实测无 ACAO → 桌面版经主进程 webdav-fetch 中转（与 ics-fetch 同一套防线）。
 * **ETag 冲突检测**：上传用 If-None-Match（首次）/ If-Match（续传）—— 云端被其他设备
 * 改过（412）就如实报"冲突"，不静默覆盖。这是云同步全量契约（见
 * docs/cloud-sync-incremental-contract.md）落地前的**第一个真冲突信号**。
 * 诚实边界：本版只做载体（存/取一个快照文件），**未接同步主流程**；无 WebDAV 配
 * 置时（app 无后端、云同步面板本就无入口）零影响。
 * ============================================================ */
const WD_CFG_KEY = "webdav_cfg";        /* { url, user } 公共部分 */
const WD_PASS_KEY = "webdav_pass";      /* 应用密码（设备密钥加密） */
const WD_META_KEY = "webdav_meta";      /* { etag, lastModified, path, ts } */
const WD_DEF_PATH = "/agent-workshop-snapshot.json";
/** WebDAV 中继是否可用（桌面版） */
function webdavHasRelay(){
  const api = (typeof window !== "undefined" && window.electronAPI) ? window.electronAPI : null;
  return !!(api && typeof api.webdavFetch === "function");
}
/** 公共配置（url/user/path），无则 null */
function webdavCfg(){
  try{
    const c = load(PREFIX + WD_CFG_KEY, null);
    if(!c || !c.url) return null;
    return { url: String(c.url || "").replace(/\/+$/, ""), user: String(c.user || ""), path: String(c.path || WD_DEF_PATH) };
  }catch(e){ return null; }
}
/** 是否已配置（含密码） */
function webdavConfigured(){
  if(!webdavCfg()) return false;
  try{ return !!load(PREFIX + WD_PASS_KEY, ""); }catch(e){ return false; }
}
/** 取解密后的应用密码 */
async function webdavPass(){
  try{
    const raw = load(PREFIX + WD_PASS_KEY, "");
    if(!raw) return "";
    if(typeof isEncKey === "function" && isEncKey(raw)) return String((await decryptKey(raw)) || "");
    return String(raw);
  }catch(e){ return ""; }
}
/** 保存配置（密码加密落盘；失败如实返回 false） */
async function webdavSaveCfg(cfg){
  try{
    if(!cfg || !cfg.url) return false;
    save(PREFIX + WD_CFG_KEY, { url: String(cfg.url).replace(/\/+$/, ""), user: String(cfg.user || ""), path: String(cfg.path || WD_DEF_PATH) });
    const pass = String(cfg.pass || "");
    if(pass){
      const enc = (typeof encryptKey === "function") ? await encryptKey(pass) : pass;
      save(PREFIX + WD_PASS_KEY, enc);
    }
    return true;
  }catch(e){ return false; }
}
/** 清除配置与元信息 */
function webdavClearCfg(){
  try{
    ["webdav_cfg", "webdav_pass", "webdav_meta"].forEach(function(k){ try{ localStorage.removeItem(PREFIX + k); }catch(e){} });
  }catch(e){}
  return true;
}
/** Basic 认证头（应用密码只在这里拼一次，不落日志） */
async function _wdAuth(c, pass){
  return "Basic " + btoa(c.user + ":" + pass);
}
/**
 * 探活：PROPFIND Depth:0（207=可达；401/403=凭据问题）
 * @returns {Promise<{ok:boolean, error?:string}>}
 */
async function webdavProbe(){
  const c = webdavCfg();
  if(!c) return { ok: false, error: "not_configured" };
  if(!webdavHasRelay()) return { ok: false, error: "no_relay" };
  const pass = await webdavPass();
  if(!pass) return { ok: false, error: "no_password" };
  const api = window.electronAPI;
  const r = await api.webdavFetch({ url: c.url + "/", method: "PROPFIND", depth: "0", auth: await _wdAuth(c, pass) });
  return r.ok ? { ok: true } : { ok: false, error: r.error || ("HTTP " + r.status) };
}
/**
 * 快照上行 → WebDAV（首次 If-None-Match:*；续传 If-Match:<上次 etag>）
 * 云端 412 → 如实报冲突（不覆盖）。
 * @param {string} text - 云快照 JSON
 * @returns {Promise<{ok:boolean, conflict?:boolean, error?:string}>}
 */
async function webdavPut(text){
  const c = webdavCfg();
  if(!c) return { ok: false, error: "not_configured" };
  if(!webdavHasRelay()) return { ok: false, error: "no_relay" };
  const pass = await webdavPass();
  if(!pass) return { ok: false, error: "no_password" };
  let meta = null;
  try{ meta = load(PREFIX + WD_META_KEY, null); }catch(e){}
  const arg = {
    url: c.url + (c.path.charAt(0) === "/" ? c.path : ("/" + c.path)),
    method: "PUT", body: String(text || ""), auth: await _wdAuth(c, pass),
  };
  if(meta && meta.etag) arg.ifMatch = meta.etag; else arg.ifNoneMatch = "*";
  const r = await window.electronAPI.webdavFetch(arg);
  if(r && r.conflict) return { ok: false, conflict: true, error: "etag_conflict" };
  if(!r || !r.ok) return { ok: false, error: (r && r.error) || "upload_failed" };
  try{ save(PREFIX + WD_META_KEY, { etag: r.etag || "", lastModified: r.lastModified || "", path: c.path, ts: Date.now() }); }catch(e){}
  return { ok: true, etag: r.etag || "" };
}
/**
 * 快照下行（取回云端快照；404 = 云端还没有 → ok:false, missing，不算错误）
 * @returns {Promise<{ok:boolean, text?:string, missing?:boolean, error?:string}>}
 */
async function webdavGet(){
  const c = webdavCfg();
  if(!c) return { ok: false, error: "not_configured" };
  if(!webdavHasRelay()) return { ok: false, error: "no_relay" };
  const pass = await webdavPass();
  if(!pass) return { ok: false, error: "no_password" };
  const r = await window.electronAPI.webdavFetch({
    url: c.url + (c.path.charAt(0) === "/" ? c.path : ("/" + c.path)),
    method: "GET", auth: await _wdAuth(c, pass),
  });
  if(r && r.status === 404) return { ok: false, missing: true };
  if(!r || !r.ok) return { ok: false, error: (r && r.error) || "download_failed" };
  return { ok: true, text: r.text || "", etag: r.etag || "" };
}

/* ============================================================
 * WebDAV 接入云快照主流程（v3.7.88）
 * v3.7.87 只做了载体（存/取一个文件）；本版把它接上真正的快照链路：
 *   上传 = _buildCloudSnapshot()（经 AppBridge 桥）→ webdavPut；下载反之。
 * 冲突 UX：412（云端已被其他设备改过）→ 弹确认让用户选「用云端覆盖本机」或「放弃」，
 * **不自动覆盖**（与 v3.7.87 的不静默覆盖一致）。无 WebDAV 配置/无中继 → 如实不可用。
 * ============================================================ */
/** 上传本机快照到 WebDAV（按钮入口） */
async function webdavSyncUpload(){
  if(!webdavConfigured()) return toast(t("wd.syncNoCfg", "未配置 WebDAV，无法上传"), "warn");
  if(!webdavHasRelay()) return toast(t("wd.syncDesktopOnly", "WebDAV 仅桌面版可用"), "warn");
  const build = AppBridge.buildCloudSnapshot;
  if(typeof build !== "function") return toast(t("wd.syncUnavailable", "快照构建不可用"), "warn");
  let snap;
  try{ snap = build(); }catch(e){ return toast(t("wd.syncBuildFail", "快照构建失败"), "warn"); }
  const r = await webdavPut(JSON.stringify(snap));
  if(r.conflict){
    const go = confirm(t("wd.syncConflict", "云端版本已被其他设备修改（上传被拒，避免覆盖）。要用云端版本覆盖本机吗？"));
    if(go) await webdavSyncDownload(true);
    return;
  }
  if(!r.ok) return toast(t("wd.syncUploadFail", "上传失败") + "（" + (r.error || "") + "）", "warn");
  const n = snap && typeof snap === "object" ? Object.keys(snap).length : 0;
  toast(t("wd.syncUploadOk", "已上传快照（{n} 键）").replace("{n}", String(n)), "ok");
}
/**
 * 下载云端快照并应用（覆盖本机同名键 —— 覆盖前 render-overview 侧的 pre_restore_backup 兜底仍在）
 * @param {boolean} [silent] - 冲突流里调用时不再二次确认
 */
async function webdavSyncDownload(silent){
  if(!webdavConfigured()) return toast(t("wd.syncNoCfg", "未配置 WebDAV，无法下载"), "warn");
  if(!webdavHasRelay()) return toast(t("wd.syncDesktopOnly", "WebDAV 仅桌面版可用"), "warn");
  const apply = AppBridge.applyCloudSnapshot;
  if(typeof apply !== "function") return toast(t("wd.syncUnavailable", "快照应用不可用"), "warn");
  const g = await webdavGet();
  if(g.missing) return toast(t("wd.syncNoCloudFile", "云端还没有快照文件"), "info");
  if(!g.ok) return toast(t("wd.syncDownloadFail", "下载失败") + "（" + (g.error || "") + "）", "warn");
  if(!silent && !confirm(t("wd.syncApplyConfirm", "用云端快照覆盖本机同名数据？只覆盖云端包含的键，本机独有键不动。"))) return;
  let data;
  try{ data = JSON.parse(g.text); }catch(e){ return toast(t("wd.syncBadJson", "云端快照不是合法 JSON，未应用"), "warn"); }
  try{ apply(data); }catch(e){ return toast(t("wd.syncApplyFail", "应用失败"), "warn"); }
  toast(t("wd.syncDownloadOk", "已应用云端快照"), "ok");
}
