// ===== UI Layer (交互层·全局事件绑定·后端 API 客户端) =====
/* ============================================================
 * 任务235：后端 API 客户端模块
 * ------------------------------------------------------------
 * fetch 封装 + JWT token 管理 + 自动刷新 + 错误处理 + 离线降级
 * 设计要点：
 *  - apiBase() 动态读 cfg.apiBase 或默认 http://localhost:3001（与 server/src/index.js 默认端口一致）
 *  - accessToken/refreshToken 存 localStorage（wb_access_token 等）
 *  - 存储加密（v3.7.62）：access/refresh 落盘为设备密钥密文 {__enc,iv,data}；旧明文读时兼容、
 *    启动后透明升级为密文。WebCrypto/设备密钥不可用或密文解不开时**保留密文不销毁**
 *    （降级不丢登录：宁可暂时不可用，换回可用环境后登录仍在）
 *  - token 恢复是异步的：initApiClient() 调用后密文解密可能仍在途，isApiLoggedIn() 水合完成前为 false；
 *    apiFetch/apiRefreshAccessToken/doSync 会先 await 水合，保证发包与判登录看到的是最终状态
 *  - apiFetch 自动加 Authorization header；401 时自动刷新重试一次
 *  - 网络错误 throw {offline:true}，调用方降级到 localStorage
 *  - 返回 {ok, data, status} 统一响应形状
 *  - 所有函数用 IIFE 命名空间风格，函数声明提升使引用安全
 * ============================================================ */
(function apiClientModule(){
  "use strict";

  // API 基址：优先 cfg.apiBase，回退默认。
  // v3.7.71：改为每次调用时动态读取 —— 旧版在模块加载时定格，设置里改 apiBase 不刷新页面不生效。
  function apiBase(){
    try { if (typeof getCfg === "function") { const _c = getCfg(); if (_c && _c.apiBase) return _c.apiBase; } } catch(e) { /* getCfg 不可用时用默认 */ }
    return "http://localhost:3001";
  }

  // token 存储键（任务要求 wb_ 前缀，不带 wb_agent_ 前缀）
  const API_TOKEN_KEY = "wb_access_token";
  const API_REFRESH_KEY = "wb_refresh_token";
  const API_EXPIRY_KEY = "wb_token_expiry";

  // 模块级私有状态
  let _accessToken = null;
  let _refreshToken = null;
  let _tokenExpiry = 0;
  let _syncStatus = "idle"; // idle | syncing | offline | error
  let _apiUser = null; // 已登录用户信息缓存
  let _refreshing = false; // 防止并发刷新
  /* v3.7.62（token 落盘加密）——
     · _tokensHydrated：本次会话是否完成「恢复/解密」。密文解密完成前 isApiLoggedIn() 恒为 false。
     · _tokensLocked：存储里存在**解不开的密文**（本环境无 WebCrypto / 设备密钥更换）。true 时
       一切隐式落盘（刷新后的持久化、明文升级）都不改写 token 三键 —— 「降级不丢登录」的兜底：
       宁可暂时不可用，也绝不销毁密文，换回可用环境后登录仍在。
     · _tokenGen：代际计数。登录/登出后，过期的异步解密结果不得回写内存（防旧 token 复活）。
     · _persistChain：落盘串行链 —— set/clear/升级/刷新交错时，「先入队的旧写」不会覆盖「后入队的新写」。 */
  let _tokensHydrated = false;
  let _tokensLocked = false;
  let _tokenGen = 0;
  let _hydratePromise = null;
  let _persistChain = Promise.resolve();
  function _whenTokensHydrated(){ return _hydratePromise || Promise.resolve(); }

  // 存储值解析：兼容「旧明文裸串」与「密文 JSON {__enc,iv,data}」两种形态
  function _parseTokenRaw(raw){
    if(!raw) return { value: null, sealed: false, enc: null };
    try{
      const o = JSON.parse(raw);
      if(o && typeof o === "object" && o.__enc === true && typeof o.iv === "string" && typeof o.data === "string"){
        return { value: null, sealed: true, enc: o };
      }
    }catch(e){ /* 非 JSON → 旧明文 */ }
    return { value: raw, sealed: false, enc: null };
  }

  /* 加密单个 token：不可加密或加密失败 → 返回明文原值（与改造前落盘行为一致，绝不丢登录）。
     ⚠️ 与 cfg 的 D4「不可加密即丢弃」策略有意不同：AI Key 是长期凭据，token 是短时凭据（15 分钟
     access + refresh 轮换）；且改造前所有环境都落明文，回落明文不会比现状更差。 */
  async function _sealTokenValue(plain){
    try{
      const enc = await encryptKey(plain);
      if(enc && typeof enc === "object" && enc.__enc === true) return enc;
      return plain;
    }catch(e){
      try{ pushDiag("error", "token seal failed, plaintext kept: "+(e&&e.message||e), {where:"_sealTokenValue"}); }catch(_e2){}
      return plain;
    }
  }

  // 从 localStorage 恢复 token（启动时调用；返回水合 Promise —— 密文需异步解密）
  function _restoreTokens(){
    _tokensHydrated = false;
    _tokensLocked = false;
    let pa = { value: null, sealed: false, enc: null }, pr = { value: null, sealed: false, enc: null };
    try{
      const exp = localStorage.getItem(API_EXPIRY_KEY);
      _tokenExpiry = exp ? Number(exp) : 0;
      pa = _parseTokenRaw(localStorage.getItem(API_TOKEN_KEY));
      pr = _parseTokenRaw(localStorage.getItem(API_REFRESH_KEY));
    }catch(e){ /* localStorage 不可用时静默降级 */ }
    /* 明文（含旧数据）：立即可用（无缝迁移）；密文：内存先不持有，等解密 */
    _accessToken = pa.sealed ? null : (pa.value || null);
    _refreshToken = pr.sealed ? null : (pr.value || null);
    if(!pa.sealed && !pr.sealed){
      _tokensHydrated = true;
      _hydratePromise = Promise.resolve();
      /* 透明迁移：有明文就升级为密文（不可加密的环境由 _sealTokenValue 原样回落，无副作用） */
      if(pa.value || pr.value) _persistTokens();
      return _hydratePromise;
    }
    const gen = ++_tokenGen;
    _tokensLocked = true;
    _hydratePromise = (async () => {
      const dec = { access: null, refresh: null };
      let failed = false;
      for(const [k, p] of [["access", pa], ["refresh", pr]]){
        if(!p.sealed){ dec[k] = p.value || null; continue; }
        let plain = null;
        try{
          const out = await decryptKey(p.enc);
          if(typeof out === "string") plain = out;
        }catch(e){ /* 解不开：设备密钥换了 / 密文损坏 */ }
        if(plain === null) failed = true;
        dec[k] = plain;
      }
      if(gen !== _tokenGen) return;                 // 期间已登录/登出 → 丢弃过期结果
      _accessToken = dec.access;
      _refreshToken = dec.refresh;
      _tokensHydrated = true;                       // 水合尝试已完成（是否登录另由 token 判断）
      _tokensLocked = failed;                       // 任一密文解不开 → 存储保持只读
      if(failed){
        try{ pushDiag("error", "token decrypt failed; sealed values preserved (storage locked)", {where:"_restoreTokens"}); }catch(_e2){}
      }
    })();
    return _hydratePromise;
  }

  // token 持久化到 localStorage（同步签名保留，落盘为串行链上的异步任务）
  function _persistTokens(){
    // v3.4.7 批次三（G5）：token 三键（wb_ 前缀、非 wb_agent_ 命名空间）不进 save()——
    // save 的 JSON 序列化会与读侧裸串读取不对称、且 wb_ 前缀不在 IDB 镜像范围。
    // 此处保留裸写但补齐可观测性：失败经 pushDiag 登记（此前完全静默）。
    /* v3.7.62：① 快照当前内存状态 —— 任务执行时以快照为准，避免与后续 set/clear 交错；
       ② 串行链保证「登出」永远不会被先入队的旧写入（如启动时的明文升级）覆盖回来。 */
    const snap = { access: _accessToken, refresh: _refreshToken, expiry: _tokenExpiry, locked: _tokensLocked };
    _persistChain = _persistChain.then(() => _persistTokensTask(snap)).catch(() => {});
    return _persistChain;
  }
  async function _persistTokensTask(snap){
    if(snap.locked) return; // 存储中是解不开的密文 → 隐式写入一律不动它（降级不丢登录）
    try{
      if(snap.access){
        const v = await _sealTokenValue(snap.access);
        localStorage.setItem(API_TOKEN_KEY, typeof v === "string" ? v : JSON.stringify(v));
      } else localStorage.removeItem(API_TOKEN_KEY);
      if(snap.refresh){
        const v = await _sealTokenValue(snap.refresh);
        localStorage.setItem(API_REFRESH_KEY, typeof v === "string" ? v : JSON.stringify(v));
      } else localStorage.removeItem(API_REFRESH_KEY);
      localStorage.setItem(API_EXPIRY_KEY, String(snap.expiry));
    }catch(e){
      try{ if(typeof pushDiag === "function") pushDiag("error", "token persist failed: "+(e&&e.message||e), {where:"_persistTokens"}); }catch(_e2){}
    }
  }

  // 设置 token 三元组（access, refresh, expiry）
  function apiSetTokens(access, refresh, exp){
    _accessToken = access || null;
    _refreshToken = refresh || null;
    _tokenExpiry = exp || 0;
    _tokenGen++;                 // 显式登录：作废在途解密（旧密文结果不得回写）
    _tokensHydrated = true;
    _tokensLocked = false;       // 显式登录接管存储（此前解不开的密文允许被覆盖）
    _persistTokens();
  }

  // 清除 token（登出时调用）
  function apiClearTokens(){
    _accessToken = null;
    _refreshToken = null;
    _tokenExpiry = 0;
    _apiUser = null;
    _tokenGen++;                 // 显式登出：同 apiSetTokens
    _tokensHydrated = true;
    _tokensLocked = false;
    _persistTokens();
  }

  // 判断是否已登录（水合完成 + 有 accessToken + 未过期）
  function isApiLoggedIn(){
    return _tokensHydrated && !!_accessToken && Date.now() < _tokenExpiry;
  }

  // 构造带 Authorization 的 headers
  function apiGetHeaders(extra){
    const h = Object.assign({ "Content-Type": "application/json" }, extra || {});
    if(_accessToken) h["Authorization"] = "Bearer " + _accessToken;
    return h;
  }

  // 用 refreshToken 换新 accessToken；成功返回 true，失败返回 false
  // v3.7.71：并发刷新改为**共享在途 Promise** —— 旧版用 _refreshing 布尔，
  // 第二个并发 401 直接拿 false 放弃（请求白白失败）；现在后来者等待并复用同一结果。
  let _refreshPromise = null;
  async function apiRefreshAccessToken(){
    await _whenTokensHydrated(); // v3.7.62：密文未解密时 _refreshToken 暂为 null，先等水合再判
    if(!_refreshToken) return false;
    if(_refreshPromise) return _refreshPromise;
    _refreshPromise = (async () => {
      try{
        const resp = await fetch(apiBase() + "/api/auth/refresh", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken: _refreshToken }),
        });
        if(!resp.ok){ return false; }
        const data = await resp.json();
        if(data && data.accessToken){
          _accessToken = data.accessToken;
          // 优先服务端给的 expiresIn（秒）；缺省回退 15 分钟（后端 JWT 默认）。
          // v3.7.71：旧版写死 15 分钟、忽略服务端值 —— 后端改签发时长后客户端会提前/滞后误判。
          const ttlMs = (data.expiresIn && data.expiresIn > 0) ? data.expiresIn * 1000 : 15 * 60 * 1000;
          _tokenExpiry = Date.now() + ttlMs;
          _persistTokens();
          return true;
        }
        return false;
      }catch(e){
        return false;
      }
    })();
    try{
      return await _refreshPromise;
    }finally{
      _refreshPromise = null;
    }
  }

  // 核心 fetch 封装：自动加 Authorization、401 自动刷新重试、网络错误 throw {offline:true}
  // 返回 {ok, data, status}
  async function apiFetch(path, options){
    await _whenTokensHydrated(); // v3.7.62：水合完成前不带鉴权头发包（密文解密在途时 Authorization 尚不可得）
    const opts = options || {};
    const url = path.startsWith("http") ? path : apiBase() + path;
    const doFetch = async (withAuth) => {
      const headers = apiGetHeaders(opts.headers);
      if(!withAuth) delete headers["Authorization"];
      const fetchOpts = Object.assign({}, opts, { headers });
      return fetch(url, fetchOpts);
    };
    try{
      const resp = await doFetch(true);
      // 401 时自动刷新重试一次
      if(resp.status === 401 && _refreshToken && !opts._retried){
        const refreshed = await apiRefreshAccessToken();
        if(refreshed){
          opts._retried = true; // 防止无限重试
          return apiFetch(path, opts);
        }
      }
      let data = null;
      try{ data = await resp.json(); }catch(e){ data = null; }
      return { ok: resp.ok, data: data, status: resp.status };
    }catch(e){
      // 网络错误（fetch 抛 TypeError）：标记离线
      const err = new Error("network error");
      err.offline = true;
      err.cause = e;
      throw err;
    }
  }

  // ===== 认证 API =====

  async function apiLogin(email, password){
    const r = await apiFetch("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password, deviceName: _getDeviceLabel() }),
    });
    if(r.ok && r.data && r.data.accessToken){
      apiSetTokens(r.data.accessToken, r.data.refreshToken, Date.now() + 15 * 60 * 1000);
      _apiUser = r.data.user || null;
    }
    return r;
  }

  async function apiRegister(email, password, name, code){
    const payload = { email: email, password: password, name: name };
    // v3.6.0：邮箱验证码——后端未启用该字段时忽略，保持向后兼容
    if(code) payload.code = code;
    const r = await apiFetch("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return r;
  }

  // ===== 邮箱验证码 / 第三方登录 API（v3.6.0）=====

  // 发送邮箱验证码（后端：校验邮箱 + 生成 6 位码 → 发邮件；返回 {ok}）
  async function apiSendEmailCode(email){
    return apiFetch("/api/auth/email-code", {
      method: "POST",
      body: JSON.stringify({ email: email }),
    });
  }

  // GitHub OAuth：获取授权跳转 URL（后端拼接 client_id / redirect_uri / state，返回 {authorizeUrl, state}）。
  // 回调由后端完成 code→token 后，通过 postMessage「agent-github-oauth」把 token 回传渲染层，或经 /api/auth/github/status 轮询。
  async function apiGithubOauthUrl(){
    return apiFetch("/api/auth/github", { method: "GET" });
  }

  // 微信扫码登录：获取二维码（qr 为图片 data-URI / URL，scene 为轮询票据，expireIn 秒）
  async function apiWechatQrcode(){
    return apiFetch("/api/auth/wechat/qrcode", { method: "POST" });
  }

  // 微信扫码登录：轮询状态（status: pending | confirmed | expired；confirmed 时带 accessToken/refreshToken）
  async function apiWechatStatus(scene){
    return apiFetch("/api/auth/wechat/status?scene=" + encodeURIComponent(scene || ""), { method: "GET" });
  }

  async function apiGetProfile(){
    const r = await apiFetch("/api/auth/me", { method: "GET" });
    if(r.ok && r.data && r.data.user) _apiUser = r.data.user;
    return r;
  }

  async function apiUpdateProfile(data){
    const r = await apiFetch("/api/auth/me", {
      method: "PUT",
      body: JSON.stringify(data),
    });
    if(r.ok && r.data && r.data.user) _apiUser = r.data.user;
    return r;
  }

  async function apiGetDevices(){
    return apiFetch("/api/auth/devices", { method: "GET" });
  }

  async function apiDeleteDevice(id){
    return apiFetch("/api/auth/devices/" + encodeURIComponent(id), { method: "DELETE" });
  }

  async function apiLogout(){
    if(_refreshToken){
      try{
        await apiFetch("/api/auth/logout", {
          method: "POST",
          body: JSON.stringify({ refreshToken: _refreshToken }),
        });
      }catch(e){ /* 离线时静默 */ }
    }
    apiClearTokens();
  }

  // ===== 通知偏好 API =====

  async function apiGetNotifyPrefs(){
    return apiFetch("/api/notifications/preferences", { method: "GET" });
  }

  async function apiUpdateNotifyPrefs(prefs){
    return apiFetch("/api/notifications/preferences", {
      method: "PUT",
      body: JSON.stringify(prefs),
    });
  }

  // ===== Web Push API =====

  async function apiPushSubscribe(subscription){
    return apiFetch("/api/notifications/push/subscribe", {
      method: "POST",
      body: JSON.stringify(subscription),
    });
  }

  async function apiPushUnsubscribe(id){
    // 后端用 endpoint 取消订阅；id 可以是 endpoint 或订阅 id
    return apiFetch("/api/notifications/push/unsubscribe", {
      method: "POST",
      body: JSON.stringify({ endpoint: id }),
    });
  }

  // ===== 定时提醒 API =====

  async function apiGetSchedules(){
    return apiFetch("/api/notifications/schedules", { method: "GET" });
  }

  async function apiCreateSchedule(data){
    return apiFetch("/api/notifications/schedules", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async function apiUpdateSchedule(id, data){
    return apiFetch("/api/notifications/schedules/" + encodeURIComponent(id), {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async function apiDeleteSchedule(id){
    return apiFetch("/api/notifications/schedules/" + encodeURIComponent(id), { method: "DELETE" });
  }

  // ===== 第三方集成 API =====

  async function apiGetIntegrations(){
    return apiFetch("/api/integrations/status", { method: "GET" });
  }

  async function apiConnectNotion(code){
    // v3.7.71：code 此前收下即弃，后端回调端点没有它无法完成 OAuth 交换（空转）。
    if(!code) return { ok:false, data:null, status:0 };
    return apiFetch("/api/integrations/oauth/notion/callback?code=" + encodeURIComponent(code), {
      method: "GET",
    });
  }

  async function apiConnectTodoist(code){
    // v3.7.71：code 此前收下即弃，后端回调端点没有它无法完成 OAuth 交换（空转）。
    if(!code) return { ok:false, data:null, status:0 };
    return apiFetch("/api/integrations/oauth/todoist/callback?code=" + encodeURIComponent(code), {
      method: "GET",
    });
  }

  async function apiConnectGCalendar(code){
    // v3.7.71：code 此前收下即弃，后端回调端点没有它无法完成 OAuth 交换（空转）。
    if(!code) return { ok:false, data:null, status:0 };
    return apiFetch("/api/integrations/oauth/google/callback?code=" + encodeURIComponent(code), {
      method: "GET",
    });
  }

  async function apiDisconnectIntegration(provider){
    return apiFetch("/api/integrations/oauth/" + encodeURIComponent(provider), { method: "DELETE" });
  }

  // ===== 同步状态管理 =====

  function getSyncStatus(){ return _syncStatus; }
  function setSyncStatus(s){
    _syncStatus = s;
    _renderSyncStatus();
  }

  // 渲染同步状态指示器
  function _renderSyncStatus(){
    const el = (typeof document !== "undefined") ? document.getElementById("syncStatus") : null;
    if(!el) return;
    const textEl = el.querySelector(".sync-text");
    el.classList.remove("syncing", "synced", "offline", "error");
    if(_syncStatus === "syncing"){
      el.classList.add("syncing");
      if(textEl) textEl.textContent = t("api.syncing", "同步中…");
      el.classList.remove("u-hidden");
    }else if(_syncStatus === "offline"){
      el.classList.add("offline");
      if(textEl) textEl.textContent = t("api.syncOffline", "离线模式");
      el.classList.remove("u-hidden");
    }else if(_syncStatus === "error"){
      el.classList.add("error");
      if(textEl) textEl.textContent = t("api.syncError", "同步失败");
      el.classList.remove("u-hidden");
    }else if(_syncStatus === "local"){
      /* v3.7.52：后端通用同步端点未接入时的**如实**状态 —— 不能显示「已同步」（详见 doSync 注释） */
      el.classList.add("offline");
      if(textEl) textEl.textContent = t("api.syncLocal", "仅本机（云同步未接入）");
      if(isApiLoggedIn()) el.classList.remove("u-hidden");
      else el.classList.add("u-hidden");
    }else{
      el.classList.add("synced");
      if(textEl) textEl.textContent = t("api.syncIdle", "已同步");
      // 仅登录后显示
      if(isApiLoggedIn()) el.classList.remove("u-hidden");
      else el.classList.add("u-hidden");
    }
  }

  // ===== 数据同步（debounce + 增量 + 离线降级） =====

  let _syncTimer = null;
  let _lastSyncAt = 0;

  // debounce 同步：本地数据变更后 2 秒触发
  function scheduleSync(){
    if(_syncTimer) clearTimeout(_syncTimer);
    _syncTimer = setTimeout(() => { _syncTimer = null; doSync(); }, 2000);
  }

  // 执行同步：尝试推送到后端，离线时降级到 localStorage（已由现有存储保证）
  async function doSync(){
    await _whenTokensHydrated(); // v3.7.62：同 apiFetch —— 避免把「水合未完成」误判成「未登录」
    if(!isApiLoggedIn()) return; // 未登录不同步
    /* v3.7.53：本函数此前是「转 syncing 再转 idle」的空转桩，而 idle 的文案是「已同步」——
       点「立即上传」会看到"已同步"，实际一个字节都没上传（虚假成功，违反 product-scope §四.2）。
       现按真实链路实现：登录 + 推得上去 → idle（已同步）；端点缺失 → local（仅本机）；
       服务端拒绝/异常 → error；网络离线 → offline。 */
    if(typeof apiPutSnapshot !== "function"){ setSyncStatus("local"); return; }
    setSyncStatus("syncing");
    try{
      const ok = await apiPutSnapshot(_buildCloudSnapshot());
      if(ok){
        _lastSyncAt = Date.now();
        _setSyncMeta({ lastPushAt: Date.now() });
        setSyncStatus("idle");
      }else{
        setSyncStatus("error");
      }
    }catch(e){
      setSyncStatus((e && (e.offline || e.name === "TypeError")) ? "offline" : "error");
    }
  }



  // ===== 离线支持 =====

  // 检测后端可达性（健康检查）
  async function apiHealthCheck(){
    try{
      const r = await apiFetch("/api/health", { method: "GET" });
      return r.ok;
    }catch(e){
      return false;
    }
  }

  // ===== 辅助函数 =====

  function _getDeviceLabel(){
    try{
      const ua = (typeof navigator !== "undefined" && navigator.userAgent) ? navigator.userAgent : "unknown";
      if(/Electron/i.test(ua)) return t("api.deviceDesktop", "桌面应用");
      if(/Mobile/i.test(ua)) return t("api.deviceMobile", "移动浏览器");
      return t("api.deviceWeb", "Web 浏览器");
    }catch(e){ return t("api.unknownDevice", "未知设备"); }
  }

  // 获取已缓存用户信息
  function getApiUser(){ return _apiUser; }

  // 启动时恢复 token + 检查有效性（v3.7.62：恢复可能是异步的 —— 密文需解密）
  function initApiClient(){
    const hydration = _restoreTokens();
    _renderSyncStatus();
    /* 水合完成后：① 有 access 已过期但有 refresh → 自动刷新；
       ② 刷新登录态相关 UI（DOM 未就绪时这些函数自带守卫，稍后 _initApiUI 还会再跑一遍）；
       ③ 已登录则加载面板数据（与 _initApiUI 的尾部逻辑一致，只是时机改到水合之后）。 */
    hydration.then(() => {
      if(_refreshToken && !isApiLoggedIn()){
        apiRefreshAccessToken().then(() => { _renderSyncStatus(); }).catch(() => {});
      }
      try{ _updateUserButton(); }catch(e){}
      try{ _showApiPanels(); }catch(e){}
      try{ if(isApiLoggedIn()) _loadApiPanels(); }catch(e){}
    }).catch(() => {});
  }

  // 暴露到外层作用域（函数声明提升使 window.__test 可引用）
  // 注意：这些是 var 赋值，确保在 IIFE 外可见
  window.apiSetTokens = apiSetTokens;
  window.apiClearTokens = apiClearTokens;
  window.isApiLoggedIn = isApiLoggedIn;
  window.apiGetHeaders = apiGetHeaders;
  window.apiRefreshAccessToken = apiRefreshAccessToken;
  window.apiFetch = apiFetch;
  window.apiLogin = apiLogin;
  window.apiRegister = apiRegister;
  window.apiSendEmailCode = apiSendEmailCode;
  window.apiGithubOauthUrl = apiGithubOauthUrl;
  window.apiWechatQrcode = apiWechatQrcode;
  window.apiWechatStatus = apiWechatStatus;
  window.apiGetProfile = apiGetProfile;
  window.apiUpdateProfile = apiUpdateProfile;
  window.apiGetDevices = apiGetDevices;
  window.apiDeleteDevice = apiDeleteDevice;
  window.apiLogout = apiLogout;
  window.apiGetNotifyPrefs = apiGetNotifyPrefs;
  window.apiUpdateNotifyPrefs = apiUpdateNotifyPrefs;
  window.apiPushSubscribe = apiPushSubscribe;
  window.apiPushUnsubscribe = apiPushUnsubscribe;
  window.apiGetSchedules = apiGetSchedules;
  window.apiCreateSchedule = apiCreateSchedule;
  window.apiUpdateSchedule = apiUpdateSchedule;
  window.apiDeleteSchedule = apiDeleteSchedule;
  window.apiGetIntegrations = apiGetIntegrations;
  window.apiConnectNotion = apiConnectNotion;
  window.apiConnectTodoist = apiConnectTodoist;
  window.apiConnectGCalendar = apiConnectGCalendar;
  window.apiDisconnectIntegration = apiDisconnectIntegration;
  window.getSyncStatus = getSyncStatus;
  window.setSyncStatus = setSyncStatus;
  window.scheduleSync = scheduleSync;
  window.doSync = doSync;
  window.apiHealthCheck = apiHealthCheck;
  window.getApiUser = getApiUser;
  window.initApiClient = initApiClient;
  window.API_BASE = apiBase();
  // 修复：认证页（IIFE 外部的 _doAuthLogin/_doAuthRegister）登录成功后需刷新用户按钮与账号面板，
  // 这两个函数此前只导出到 window.__test（仅测试门控下存在），顶层调用恒抛 ReferenceError 且被
  // try/catch 静默吞掉 → 登录后账号面板不刷新。补齐正式 window 导出。
  window._updateUserButton = _updateUserButton;
  window._loadApiPanels = _loadApiPanels;

  // 启动时自动初始化（恢复 token + 渲染同步状态）
  initApiClient();

  // ===== 追加到 window.__test 导出（供测试驱动与断言） =====
  if(typeof window !== "undefined" && window.__test){
    Object.assign(window.__test, {
      apiFetch, apiLogin, apiRegister, apiSetTokens, apiClearTokens, apiRefreshAccessToken,
      apiGetProfile, apiUpdateProfile, apiGetDevices, apiDeleteDevice, apiLogout,
      apiGetNotifyPrefs, apiUpdateNotifyPrefs, apiPushSubscribe, apiPushUnsubscribe,
      apiGetSchedules, apiCreateSchedule, apiUpdateSchedule, apiDeleteSchedule,
      apiGetIntegrations, apiConnectNotion, apiConnectTodoist, apiConnectGCalendar,
      apiDisconnectIntegration, isApiLoggedIn, getSyncStatus, setSyncStatus,
      scheduleSync, doSync, apiHealthCheck, getApiUser, initApiClient, apiGetHeaders,
      /* v3.7.62：token 水合/落盘是异步的，测试用这两个取出在途 Promise 以确定性等待 */
      _whenTokensHydrated, _whenTokensPersisted: () => _persistChain,
      get API_BASE(){ return apiBase(); },
    });
  }

  // ===== 登录/注册模态弹窗 UI 绑定 =====
  function _bindAuthModal(){
    if(typeof document === "undefined") return;
    const modal = document.getElementById("authModal");
    if(!modal) return;
    const loginForm = document.getElementById("authLoginForm");
    const registerForm = document.getElementById("authRegisterForm");
    const closeBtn = document.getElementById("authClose");
    const title = document.getElementById("authModalTitle");
    const backBtn = document.getElementById("authBack");
    const welcome = document.getElementById("authWelcome");
    const choiceLogin = document.getElementById("authChoiceLogin");
    const choiceRegister = document.getElementById("authChoiceRegister");

    // 模块级函数（全局）：openAuthModal 需要调用，闭包版不可见
    function showAuthStep(form){
      const w = document.getElementById("authWelcome");
      const lf = document.getElementById("authLoginForm");
      const rf = document.getElementById("authRegisterForm");
      const bb = document.getElementById("authBack");
      const tt = document.getElementById("authModalTitle");
      if(w) w.classList.add("u-hidden");
      if(lf) lf.classList.add("u-hidden");
      if(rf) rf.classList.add("u-hidden");
      if(form){ form.classList.remove("u-hidden"); }
      if(bb) bb.classList.toggle("u-hidden", !form);
      if(tt) tt.textContent = (form === rf) ? t("api.register", "注册") : t("api.login", "登录");
    }
    function showAuthWelcome(){
      const w = document.getElementById("authWelcome");
      const lf = document.getElementById("authLoginForm");
      const rf = document.getElementById("authRegisterForm");
      const bb = document.getElementById("authBack");
      const tt = document.getElementById("authModalTitle");
      if(w) w.classList.remove("u-hidden");
      if(lf) lf.classList.add("u-hidden");
      if(rf) rf.classList.add("u-hidden");
      if(bb) bb.classList.add("u-hidden");
      if(tt) tt.textContent = t("auth.welcome", "欢迎");
    }
    if(choiceLogin) choiceLogin.onclick = function(){ showAuthStep(loginForm); };
    if(choiceRegister) choiceRegister.onclick = function(){ showAuthStep(registerForm); };
    if(backBtn) backBtn.onclick = showAuthWelcome;
    if(closeBtn) closeBtn.onclick = function(){ modal.classList.remove("show"); };

    // 表单校验
    function _validEmail(s){ return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s); }

    // 登录提交
    if(loginForm){
      loginForm.onsubmit = async function(e){
        e.preventDefault();
        const errEl = document.getElementById("authLoginError");
        const submitBtn = document.getElementById("authLoginSubmit");
        const email = document.getElementById("authLoginEmail").value.trim();
        const password = document.getElementById("authLoginPassword").value;
        if(errEl) errEl.textContent = "";
        if(!_validEmail(email)){ if(errEl) errEl.textContent = t("api.emailInvalid", "邮箱格式不正确"); return; }
        if(password.length < 8){ if(errEl) errEl.textContent = t("api.passwordTooShort", "密码长度至少 8 位"); return; }
        if(submitBtn){ submitBtn.classList.add("loading"); submitBtn.disabled = true; }
        try{
          const r = await apiLogin(email, password);
          if(r.ok){
            modal.classList.remove("show");
            try{ toast(t("api.loginSuccess", "登录成功"), "ok"); }catch(_){}
            _updateUserButton();
            _loadApiPanels();
          }else{
            if(errEl) errEl.textContent = (r.data && r.data.error) || t("api.loginFailed", "登录失败");
          }
        }catch(err){
          if(err && err.offline){
            if(errEl) errEl.textContent = t("api.syncOffline", "离线模式");
          }else{
            if(errEl) errEl.textContent = t("api.loginFailed", "登录失败");
          }
        }finally{
          if(submitBtn){ submitBtn.classList.remove("loading"); submitBtn.disabled = false; }
        }
      };
    }

    // 注册提交
    if(registerForm){
      registerForm.onsubmit = async function(e){
        e.preventDefault();
        const errEl = document.getElementById("authRegError");
        const submitBtn = document.getElementById("authRegSubmit");
        const name = document.getElementById("authRegName").value.trim();
        const email = document.getElementById("authRegEmail").value.trim();
        const password = document.getElementById("authRegPassword").value;
        const confirm = document.getElementById("authRegConfirm").value;
        if(errEl) errEl.textContent = "";
        if(!name){ if(errEl) errEl.textContent = t("api.nameRequired", "用户名不能为空"); return; }
        if(!_validEmail(email)){ if(errEl) errEl.textContent = t("api.emailInvalid", "邮箱格式不正确"); return; }
        if(password.length < 8){ if(errEl) errEl.textContent = t("api.passwordTooShort", "密码长度至少 8 位"); return; }
        if(password !== confirm){ if(errEl) errEl.textContent = t("api.passwordMismatch", "两次密码不一致"); return; }
        if(submitBtn){ submitBtn.classList.add("loading"); submitBtn.disabled = true; }
        try{
          const r = await apiRegister(email, password, name);
          if(r.ok){
            // 注册成功后自动登录
            const lr = await apiLogin(email, password);
            if(lr.ok){
              modal.classList.remove("show");
              try{ toast(t("api.registerSuccess", "注册成功"), "ok"); }catch(_){}
              _updateUserButton();
              _loadApiPanels();
            }else{
              if(errEl) errEl.textContent = (lr.data && lr.data.error) || t("api.loginFailed", "登录失败");
            }
          }else{
            if(errEl) errEl.textContent = (r.data && r.data.error) || t("api.registerFailed", "注册失败");
          }
        }catch(err){
          if(err && err.offline){
            if(errEl) errEl.textContent = t("api.syncOffline", "离线模式");
          }else{
            if(errEl) errEl.textContent = t("api.registerFailed", "注册失败");
          }
        }finally{
          if(submitBtn){ submitBtn.classList.remove("loading"); submitBtn.disabled = false; }
        }
      };
    }
  }

  // 关闭登录模态
  function closeAuthModal(){
    if(typeof document === "undefined") return;
    const modal = document.getElementById("authModal");
    if(modal) modal.classList.remove("show");
  }

  // 更新顶栏用户按钮（已登录显示首字母，未登录显示"登录"）
  function _updateUserButton(){
    if(typeof document === "undefined") return;
    const btn = document.getElementById("btnUser");
    if(!btn) return;
    const lbl = btn.querySelector(".lbl");
    const avatar = btn.querySelector(".user-avatar");
    if(isApiLoggedIn() && _apiUser){
      const name = _apiUser.name || _apiUser.email || "?";
      if(lbl) lbl.textContent = name.charAt(0).toUpperCase();
      if(avatar){
        avatar.innerHTML = "";
        avatar.textContent = name.charAt(0).toUpperCase();
      }
      btn.setAttribute("aria-label", name);
    }else{
      if(lbl) lbl.textContent = t("api.login", "登录");
      if(avatar){
        avatar.textContent = "";
        avatar.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
      }
      btn.setAttribute("aria-label", t("api.login", "登录"));
    }
    _renderSyncStatus();
  }

  // 加载 API 面板数据（登录后调用）
  async function _loadApiPanels(){
    if(!isApiLoggedIn()) return;
    _updateUserButton();
    _showApiPanels();
    // 加载用户信息
    try{
      const r = await apiGetProfile();
      if(r.ok && r.data && r.data.user){
        _apiUser = r.data.user;
        _updateUserButton(); // 第三方登录只有 token，获取资料后再刷新头像与账号名。
        const nameEl = document.getElementById("apiUserName");
        const emailEl = document.getElementById("apiUserEmail");
        if(nameEl) nameEl.textContent = r.data.user.name || "—";
        if(emailEl) emailEl.textContent = r.data.user.email || "—";
        const editName = document.getElementById("apiEditName");
        if(editName) editName.value = r.data.user.name || "";
      }
    }catch(e){ /* 离线时静默 */ }
    // 加载设备列表
    _loadDeviceList();
    // 加载通知偏好
    _loadNotifyPrefs();
    // 加载定时提醒
    _loadSchedules();
    // 加载集成状态
    _loadIntegrations();
  }

  // 显示/隐藏 API 面板（登录后显示，未登录隐藏）
  function _showApiPanels(){
    if(typeof document === "undefined") return;
    const loggedIn = isApiLoggedIn();
    const panels = ["apiAccountPanel", "apiNotifyPanel", "apiIntegrationsPanel"];
    const hints = ["apiAccountHint", "apiNotifyHint", "apiIntegrationsHint"];
    panels.forEach(id => {
      const el = document.getElementById(id);
      if(el){ if(loggedIn) el.classList.add("show"); else el.classList.remove("show"); }
    });
    hints.forEach(id => {
      const el = document.getElementById(id);
      if(el){ if(loggedIn) el.classList.add("u-hidden"); else el.classList.remove("u-hidden"); }
    });
  }

  // 加载设备列表
  async function _loadDeviceList(){
    try{
      const r = await apiGetDevices();
      const list = document.getElementById("apiDeviceList");
      if(!list) return;
      if(r.ok && r.data && r.data.devices){
        list.innerHTML = "";
        r.data.devices.forEach(d => {
          const row = document.createElement("div");
          row.className = "api-device-row";
          row.innerHTML = '<span><span class="api-device-name"></span><br><span class="api-device-meta"></span></span>';
          row.querySelector(".api-device-name").textContent = d.deviceName || t("api.unknownDevice", "未知设备");
          row.querySelector(".api-device-meta").textContent = (d.lastSeen || d.createdAt || "") + "";
          if(r.data.devices.length === 1) row.classList.add("current");
          const delBtn = document.createElement("button");
          delBtn.type = "button";
          delBtn.className = "api-btn danger";
          delBtn.textContent = t("api.logout", "登出");
          delBtn.onclick = async function(){
            try{ await apiDeleteDevice(d.id); }catch(e){}
            _loadDeviceList();
          };
          row.appendChild(delBtn);
          list.appendChild(row);
        });
      }
    }catch(e){ /* 离线时静默 */ }
  }

  // 加载通知偏好
  async function _loadNotifyPrefs(){
    try{
      const r = await apiGetNotifyPrefs();
      if(r.ok && r.data && r.data.preferences){
        const p = r.data.preferences;
        const set = (id, val) => { const el = document.getElementById(id); if(el) el.checked = !!val; };
        set("apiPrefTaskDueEmail", p.taskDue && p.taskDue.email);
        set("apiPrefTaskDuePush", p.taskDue && p.taskDue.push);
        set("apiPrefHabitEmail", p.habitBroken && p.habitBroken.email);
        set("apiPrefHabitPush", p.habitBroken && p.habitBroken.push);
        set("apiPrefDigestEmail", p.dailyDigest && p.dailyDigest.email);
        set("apiPrefDigestPush", p.dailyDigest && p.dailyDigest.push);
      }
    }catch(e){ /* 离线时静默 */ }
  }

  // 加载定时提醒列表
  async function _loadSchedules(){
    try{
      const r = await apiGetSchedules();
      const list = document.getElementById("apiScheduleList");
      if(!list) return;
      if(r.ok && r.data && r.data.schedules){
        list.innerHTML = "";
        r.data.schedules.forEach(s => {
          const row = document.createElement("div");
          row.className = "api-schedule-row";
          row.innerHTML = '<span><span class="api-device-name"></span><br><span class="api-device-meta"></span></span>';
          row.querySelector(".api-device-name").textContent = s.type || t("api.reminder", "提醒");
          row.querySelector(".api-device-meta").textContent = s.cron || "";
          const delBtn = document.createElement("button");
          delBtn.type = "button";
          delBtn.className = "api-btn danger";
          delBtn.textContent = t("common.delete", "删除");
          delBtn.onclick = async function(){
            try{ await apiDeleteSchedule(s.id); }catch(e){}
            _loadSchedules();
          };
          row.appendChild(delBtn);
          list.appendChild(row);
        });
      }
    }catch(e){ /* 离线时静默 */ }
  }

  // 加载集成状态
  async function _loadIntegrations(){
    try{
      const r = await apiGetIntegrations();
      if(r.ok && r.data && r.data.integrations){
        r.data.integrations.forEach(i => {
          const prov = i.provider;
          let statusEl, connectBtn, disconnectBtn;
          if(prov === "notion"){
            statusEl = document.getElementById("apiNotionStatus");
            connectBtn = document.getElementById("btnApiConnectNotion");
            disconnectBtn = document.getElementById("btnApiDisconnectNotion");
          }else if(prov === "todoist"){
            statusEl = document.getElementById("apiTodoistStatus");
            connectBtn = document.getElementById("btnApiConnectTodoist");
            disconnectBtn = document.getElementById("btnApiDisconnectTodoist");
          }else if(prov === "google"){
            statusEl = document.getElementById("apiGcalStatus");
            connectBtn = document.getElementById("btnApiConnectGcal");
            disconnectBtn = document.getElementById("btnApiDisconnectGcal");
          }
          if(statusEl){
            statusEl.classList.remove("connected", "disconnected");
            statusEl.classList.add(i.authorized ? "connected" : "disconnected");
            statusEl.innerHTML = "";
            statusEl.textContent = i.authorized ? t("api.connected", "已连接") : t("api.notConnected", "未连接");
          }
          if(connectBtn) connectBtn.classList.toggle("u-hidden", !!i.authorized);
          if(disconnectBtn) disconnectBtn.classList.toggle("u-hidden", !i.authorized);
        });
      }
    }catch(e){ /* 离线时静默 */ }
  }

  // 绑定设置面板按钮
  function _bindApiPanels(){
    if(typeof document === "undefined") return;
    // 保存用户名
    const saveNameBtn = document.getElementById("btnApiSaveName");
    if(saveNameBtn){
      saveNameBtn.onclick = async function(){
        const name = document.getElementById("apiEditName").value.trim();
        if(!name) return;
        try{
          const r = await apiUpdateProfile({ name });
          if(r.ok){ try{ toast(t("api.profileUpdated", "用户信息已更新"), "ok"); }catch(_){} _loadApiPanels(); }
        }catch(e){ /* 离线 */ }
      };
    }
    // 登出
    const logoutBtn = document.getElementById("btnApiLogout");
    if(logoutBtn){
      logoutBtn.onclick = async function(){
        await apiLogout();
        _updateUserButton();
        _showApiPanels();
      };
    }
    // 保存通知偏好
    const savePrefsBtn = document.getElementById("btnApiSavePrefs");
    if(savePrefsBtn){
      savePrefsBtn.onclick = async function(){
        const get = id => { const el = document.getElementById(id); return el ? el.checked : false; };
        const prefs = {
          taskDue: { email: get("apiPrefTaskDueEmail"), push: get("apiPrefTaskDuePush"), local: true },
          habitBroken: { email: get("apiPrefHabitEmail"), push: get("apiPrefHabitPush"), local: true },
          dailyDigest: { email: get("apiPrefDigestEmail"), push: get("apiPrefDigestPush"), local: false },
        };
        try{
          const r = await apiUpdateNotifyPrefs(prefs);
          if(r.ok){ try{ toast(t("api.prefsSaved", "通知偏好已保存"), "ok"); }catch(_){} }
        }catch(e){ /* 离线 */ }
      };
    }
    // 新增定时提醒
    const addSchedBtn = document.getElementById("btnApiAddSchedule");
    if(addSchedBtn){
      addSchedBtn.onclick = async function(){
        const type = document.getElementById("apiSchedType").value;
        const cron = document.getElementById("apiSchedCron").value.trim();
        if(!type || !cron) return;
        try{
          const r = await apiCreateSchedule({ type, cron, enabled: true });
          if(r.ok){ try{ toast(t("api.scheduleAdded", "提醒已添加"), "ok"); }catch(_){} _loadSchedules(); }
        }catch(e){ /* 离线 */ }
      };
    }
    // 集成连接/断开按钮
    const connectMap = [
      ["btnApiConnectNotion", "notion", apiConnectNotion],
      ["btnApiConnectTodoist", "todoist", apiConnectTodoist],
      ["btnApiConnectGcal", "google", apiConnectGCalendar],
    ];
    connectMap.forEach(([btnId, prov, fn]) => {
      const btn = document.getElementById(btnId);
      if(btn){
        btn.onclick = async function(){
          try{
            // OAuth：打开授权页（此处简化为直接调用回调端点）
            const r = await fn();
            if(r.ok){ try{ toast(t("api.integrationConnected", "集成已连接"), "ok"); }catch(_){} _loadIntegrations(); }
          }catch(e){ /* 离线 */ }
        };
      }
    });
    const disconnectMap = [
      ["btnApiDisconnectNotion", "notion"],
      ["btnApiDisconnectTodoist", "todoist"],
      ["btnApiDisconnectGcal", "google"],
    ];
    disconnectMap.forEach(([btnId, prov]) => {
      const btn = document.getElementById(btnId);
      if(btn){
        btn.onclick = async function(){
          try{
            const r = await apiDisconnectIntegration(prov);
            if(r.ok){ try{ toast(t("api.integrationDisconnected", "集成已断开"), "ok"); }catch(_){} _loadIntegrations(); }
          }catch(e){ /* 离线 */ }
        };
      }
    });
  }

  // 绑定顶栏用户按钮
  function _bindUserButton(){
    if(typeof document === "undefined") return;
    const btn = document.getElementById("btnUser");
    if(btn){
      btn.onclick = function(){
        if(isApiLoggedIn()){
          // 已登录：跳转到设置页账号面板
          try{ if(typeof openDrawer === "function") openDrawer(); }catch(e){}
        }else{
          setActive("authwelcome"); render();
        }
      };
    }
  }

  // 初始化所有 UI 绑定（DOM ready 后调用）
  function _initApiUI(){
    _bindAuthModal();
    _bindApiPanels();
    _bindUserButton();
    _updateUserButton();
    _showApiPanels();
    // 如果已登录，加载面板数据
    if(isApiLoggedIn()) _loadApiPanels();
  }

  // 暴露 UI 函数到 window
  window.closeAuthModal = closeAuthModal;
  window._initApiUI = _initApiUI;

  // 追加 UI 函数到 window.__test
  if(typeof window !== "undefined" && window.__test){
    Object.assign(window.__test, {
      closeAuthModal, _initApiUI,
      _updateUserButton: _updateUserButton,
      _loadApiPanels: _loadApiPanels,
      _showApiPanels: _showApiPanels,
    });
  }

  // DOM ready 后初始化 UI
  if(typeof document !== "undefined"){
    if(document.readyState === "loading"){
      document.addEventListener("DOMContentLoaded", _initApiUI);
    }else{
      _initApiUI();
    }
  }
})();



/**
 * 初始化 i18n：从 localStorage 读取语言偏好
 * 安全调用：localStorage 不可用时静默降级到默认 zh
 * @returns {void}
 */
function initI18n(){
  try{
    if(typeof localStorage === "undefined") return;
    const saved = localStorage.getItem(PREFIX + "lang");
    if(saved === "zh" || saved === "en") _currentLang = saved;
    // HTML lang 属性需 BCP 47 格式（zh-CN / en）
    document.documentElement.lang = _currentLang === "zh" ? "zh-CN" : _currentLang;
    applyI18n(document);
  }catch(e){ /* localStorage 不可用：保持默认 zh */ }
}

/**
 * 获取当前语言
 * @returns {("zh"|"en")} 当前语言代码
 */
function getLang(){ return _currentLang; }

/**
 * 设置当前语言并持久化
 * @param {string} lang - 语言代码（zh / en）
 * @returns {boolean} 是否切换成功（无效语言返回 false）
 */
function setLang(lang){
  if(lang !== "zh" && lang !== "en") return false;
  if(lang === _currentLang) return true; // 无变化，仅持久化
  _currentLang = lang;
  try{
    if(typeof localStorage !== "undefined") localStorage.setItem(PREFIX + "lang", lang);
  }catch(e){ /* 持久化失败不影响内存切换 */ }
  // v2.2.0：名称类文案即时生效（document.title + data-i18n 静态节点）
  try{
    document.title = t("app.name");
    document.documentElement.lang = lang === "zh" ? "zh-CN" : lang;
    applyI18n(document);
  }catch(e){ /* 静态节点替换失败不影响语言切换 */ }
  // 触发重新渲染（若 render 可用）
  try{
    if(typeof render === "function") render();
  }catch(e){ /* render 异常不影响语言切换 */ }
  return true;
}

// 模块加载时自动初始化（从 localStorage 恢复语言偏好）
initI18n();
/**
 * v2.2.0：扫描 [data-i18n] 节点替换 textContent（静态 HTML 名称类文案接线）
 * @param {ParentNode} [root] - 扫描根节点，默认 document
 * @returns {void}
 */
function applyI18n(root){
  try{
    const scope = root || document;
    scope.querySelectorAll("[data-i18n]").forEach(function(el){
      const key = el.getAttribute("data-i18n");
      if(key) el.textContent = t(key);
    });
    // v3.2 i18n：支持属性翻译（data-i18n-attr="key" 翻译 aria-label/title/placeholder 等）
    scope.querySelectorAll("[data-i18n-aria]").forEach(function(el){
      const key = el.getAttribute("data-i18n-aria");
      if(key) el.setAttribute("aria-label", t(key));
    });
    scope.querySelectorAll("[data-i18n-title]").forEach(function(el){
      const key = el.getAttribute("data-i18n-title");
      if(key) el.setAttribute("title", t(key));
    });
    scope.querySelectorAll("[data-i18n-placeholder]").forEach(function(el){
      const key = el.getAttribute("data-i18n-placeholder");
      if(key) el.setAttribute("placeholder", t(key));
    });
  }catch(e){ /* DOM 未就绪时静默跳过 */ }
}
/* v3.7.53：暴露给 Render 层，供 render() 收口处翻译动态插入的 [data-i18n] 节点。
   走 AppBridge 而非直接调用，是为了不新增 Render→UI 的逆向依赖（见 check:modules）。 */
AppBridge.applyI18n = applyI18n;
// 启动时同步标题与静态节点（initI18n 已恢复语言偏好）
try{ document.title = t("app.name"); applyI18n(document); }catch(e){ /* noop */ }// ===== Plugin System (v1.5-B 插件/扩展体系) =====
