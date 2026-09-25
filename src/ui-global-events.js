// ===== UI Layer (交互层·全局事件绑定) =====
/* ---------- 绑定 ---------- */
/* Agent 状态条：记忆条数 + 进行中目标进度 */
function updateAgentStatus(){
  const el=$("#agentStatus"); if(!el) return;
  const cfg=getCfg()||{};
  const m=getMemories().length;
  const g=activeGoal();
  const done = g? g.steps.filter(s=>s.done).length : 0;
  const parts=[t("agent.memPrefix","工作记忆 ")+m+t("unit.entries"," 条")];
  if(cfg.agentLoops) parts.push(t("agent.normalLoops","普通循环")+cfg.agentLoops+t("agent.loopsUnit","轮"));
  if(cfg.agentGoalLoops) parts.push(t("agent.goalLoops","目标循环")+cfg.agentGoalLoops+t("agent.loopsUnit","轮"));
  if(cfg.toolWhitelist) parts.push(t("agent.toolWhitelist","工具白名单(")+cfg.toolWhitelist.split(/[,\s\u3000]+/).filter(Boolean).length+t("agent.toolCount","个)"));
  else parts.push(t("agent.toolAllOpen","工具全开放"));
  if(!(cfg.agentAutoConfirm!==false)) parts.push(t("agent.dangerConfirm","危险操作需确认"));
  if(g) parts.push(t("agent.goalPrefix","目标「")+g.title+"」("+done+"/"+g.steps.length+")");
  else parts.push(t("agent.noActiveGoal","无进行中目标"));
  el.textContent = parts.join(" · ");
}
/* 查看工作记忆：在当前场景对话里以助手消息列出 */
function showMemories(){
  const hist=getChat(active);
  const mems=getMemories();
  const lines = mems.length ? mems.map(m=>"- ["+(m.scope==="global"?t("agent.globalScope","全局"):(SCENARIOS[m.scope]?SCENARIOS[m.scope].name:m.scope))+"] "+m.text+"（id:"+m.id+"）").join("\n") : t("agent.noMemoryHint","（暂无记忆。对我说「记住：xxx」或在对话中让我用 remember 工具记住即可）");
  hist.push({role:"assistant", content:t("agent.memTitle","工作记忆（")+mems.length+t("agent.memTitleSuffixN"," 条）：\\n")+lines});
  trimChatHist(hist);
  save(PREFIX+"chat_"+active, hist); renderChat(); scrollChat();
}
$("#btnExport").onclick = doExport; // v1.14 生物识别门禁移除，导出直接执行
$("#btnExportCSV").onclick = doExportCSV;
$("#btnExportMD").onclick = doExportMD;
$("#btnImport").onclick = ()=> $("#fileInput").click();
$("#fileInput").onchange = e=>{ if(e.target.files[0]) doImport(e.target.files[0]); e.target.value=""; };
$("#btnClear").onclick = doClear;
$("#btnIdbRestore").onclick = doIdbRestore;
/* 系统级消息中心：顶栏按钮交互（替代 v1.4 banner 横幅） */
$("#btnMessages").onclick = function(e){
  e.stopPropagation();
  const panel = $("#msgPanel");
  if(!panel) return;
  if(panel.style.display === "none"){
    renderMsgPanel();
    // v1.9.7：面板已内联于正文流（.msg-panel-inline 静态定位），无需 JS 计算 top
    panel.style.display = "";
    // 打开 1s 后标记所有已读（让用户先看到未读高亮）
    setTimeout(function(){
      if(panel.style.display !== "none"){
        markAllMessagesRead();
        renderMsgPanel();
      }
    }, 1000);
  } else {
    panel.style.display = "none";
  }
};
// 点击面板外关闭
document.addEventListener("click", function(e){
  const panel = $("#msgPanel");
  const btn = $("#btnMessages");
  if(panel && panel.style.display !== "none" && btn){
    if(!panel.contains(e.target) && !btn.contains(e.target)){
      panel.style.display = "none";
    }
  }
});
// 空态引导按钮委托（data-empty-action）：与快捷键 N 同款行为——切场景 + 聚焦新建表单
document.addEventListener("click", function(e){
  const act = e.target && e.target.closest ? e.target.closest("[data-empty-action]") : null;
  if(!act) return;
  const action = act.getAttribute("data-empty-action");
  if(action === "new-task"){
    if(active==="overview"||active==="stats"||active==="recycle"){ setActive("office"); }
    render(); const f=$("#taskForm"); if(f) f.title.focus();
  }
});
// 全部已读 / 清空
$("#msgMarkAllRead").onclick = function(){ markAllMessagesRead(); renderMsgPanel(); };
$("#msgClearAll").onclick = function(){ clearMessages(); };
// 消息操作按钮（事件委托：执行 action.fn 全局函数并关闭面板）
$("#msgList").addEventListener("click", function(e){
  const msgEl = e.target;
  if(msgEl && msgEl.classList && msgEl.classList.contains("msg-item-action")){
    const fn = msgEl.getAttribute("data-msg-fn");
    const id = msgEl.getAttribute("data-msg-id");
    if(fn && typeof window[fn] === "function"){
      try{ window[fn](); }catch(err){ /* noop */ }
    }
    if(id) markMessageRead(id);
    const panel = $("#msgPanel");
    if(panel) panel.style.display = "none";
  }
});
// 启动时刷新角标状态（确保刷新后未读数正确）
updateMsgBadge();
/* v1.4-C 数据导入导出增强：导出预览 / 导入 CSV / 导出记录 CSV */
$("#btnExportPreview").onclick = openExportPreview;
$("#btnExportPreviewConfirm").onclick = doExportCSV;
$("#btnExportPreviewCancel").onclick = closeExportPreview;
$("#exportPreviewOverlay").onclick = closeExportPreview;
$("#btnImportCSV").onclick = ()=> $("#csvFileInput").click();
$("#csvFileInput").onchange = e=>{ if(e.target.files[0]) previewImportCSV(e.target.files[0]); e.target.value=""; };
$("#btnCsvImportConfirm").onclick = doImportCSV;
$("#btnCsvImportCancel").onclick = cancelImportCSV;
$("#csvImportOverlay").onclick = cancelImportCSV;
$("#btnExportRecsCSV").onclick = doExportRecsCSV;
// 设置按钮 id="btnGear" 已迁移到侧栏尾部，点击由 renderSide 的 data-gear 事件委托接管
$("#drawerClose").onclick = closeDrawer;
// v1.9.6：AI 配置 / 插件市场子页页头的返回按钮（与 #drawerClose 同语义）
$$("#drawer .drawer-close").forEach(b=>{ b.onclick = closeDrawer; });
$("#overlay").onclick = closeDrawer;
$("#cfgSave").onclick = saveCfg;
// v3.1.2 A-档：测试连接按钮——发 1-token 探测请求同时验证 base+key+model 三要素
$("#cfgTestConn").onclick = async function(){
  const btn = this;
  if(btn.disabled) return;
  const ap = (typeof getActiveProfile === "function") ? getActiveProfile() : null;
  if(!ap || !ap.base){ toast(t("settings.testConn.noBase", "未配置 Base URL"), "warn"); return; }
  if(!ap.key){ toast(t("settings.testConn.noKey", "未配置 API Key"), "warn"); return; }
  if(!ap.model){ toast(t("settings.testConn.noModel", "未配置 Model"), "warn"); return; }
  await withLoading(btn, (async function(){
    // 先尝试 GET {base}/v1/models（最轻量：仅鉴权）；失败时降级用 chat/completions 探测
    const base = String(ap.base).replace(/\/+$/, "");
    const headers = { "Authorization": "Bearer " + ap.key };
    let r;
    try{
      r = await fetch(base + "/v1/models", { method: "GET", headers: headers });
    }catch(e){
      r = { ok: false, status: 0, error: e && e.message || t("api.networkError","网络错误") };
    }
    let ok = r && r.ok;
    let msg = "";
    let status = r ? r.status : 0;
    let modelOk = true;
    if(!ok){
      // 降级用 chat/completions max_tokens:1 探（验证 key 真能落到模型）
      try{
        const r2 = await fetch(base + "/chat/completions", {
          method: "POST", headers: Object.assign({}, headers, { "Content-Type": "application/json" }),
          body: JSON.stringify({ model: ap.model, messages: [{ role: "user", content: "hi" }], max_tokens: 1, stream: false })
        });
        ok = r2.ok; status = r2.status;
        if(ok){
          const j = await r2.json().catch(function(){ return {}; });
          modelOk = !!(j && (j.choices || j.model));
          msg = t("settings.testConn.okViaChat", "✓ 连接成功（模型响应：{model}）").replace("{model}", (j && j.model) || ap.model);
        }
      }catch(e2){
        // 两个都失败
        toast(t("settings.testConn.fail", "连接失败：") + (status ? " HTTP " + status : "") + " " + (e2 && e2.message || r && r.error || ""), "error", 6000);
        return;
      }
    } else {
      // /v1/models 成功：再确认模型名在模型列表里（若返回了 data 数组）
      try{
        const j = await r.json().catch(function(){ return {}; });
        const list = (j && Array.isArray(j.data)) ? j.data.map(function(x){ return x && x.id; }).filter(Boolean) : [];
        if(list.length && list.indexOf(ap.model) === -1){
          // 降级试一次 chat 探测（某些代理 /models 不全）
          try{
            const r2 = await fetch(base + "/chat/completions", {
              method: "POST", headers: Object.assign({}, headers, { "Content-Type": "application/json" }),
              body: JSON.stringify({ model: ap.model, messages: [{ role: "user", content: "hi" }], max_tokens: 1, stream: false })
            });
            if(r2.ok){ ok = true; modelOk = true; }
            else { ok = false; status = r2.status; }
          }catch(_e){ ok = false; }
        } else if(list.indexOf(ap.model) >= 0){
          modelOk = true;
        }
        msg = ok ? t("settings.testConn.ok", "✓ 连接成功：base 可达、Key 有效、模型 {model} 可访问").replace("{model}", ap.model)
                 : t("settings.testConn.modelMissing", "Base + Key 通过，但模型 {model} 不在 /v1/models 列表中（HTTP {status}）").replace("{model}", ap.model).replace("{status}", String(status));
      }catch(_e){
        msg = t("settings.testConn.ok", "✓ 连接成功").replace(": ", "：");
      }
    }
    if(ok && modelOk){ toast(msg, "ok", 4000); }
    else if(!ok){ toast(t("settings.testConn.fail", "连接失败：") + " HTTP " + status, "error", 6000); }
    else { toast(msg, "warn", 5000); }
  })());
};
$("#cfgProfileSelect").onchange = e => switchProfile(e.target.value);
AppBridge._switchSetTab = _switchSetTab;
/* v2.0.3：设置页分区导航切换（独立导航栏 .set-nav-btn，点击切换下方 card 显示） */
function _switchSetTab(tabId){
  $$("#drawer .set-nav-btn[data-set-tab]").forEach(function(b){
    b.classList.toggle("active", b.getAttribute("data-set-tab") === tabId);
  });
  /* 标记 card 不限定 data-page：初始加载时 #drawer 尚无 data-page，
     若限定 [data-page=settings] 会漏标，导致首次打开设置页所有 card 全隐藏 */
  $$("#drawer .set-card").forEach(function(c){ c.classList.toggle("set-tab-active", c.id === tabId); });
  if(tabId === "set-integration") renderIntegrationPanel();
  if(tabId === "set-data"){ renderAutoBackupMeta(); renderStorageUsage(); } // v3.1.2 B-档：刷新备份元信息；v3.4.7 批次四：存储用量仪表
  if(tabId === "set-notify") renderNotifyPermissionMeta(); // v3.1.2 B-档：刷新浏览器通知权限状态
  const d = $("#drawer"); if(d) d.scrollTop = 0;
}

// v3.1.2 B-档：渲染浏览器通知权限状态（granted / default / denied / unsupported）+ 拒绝时给引导
function renderNotifyPermissionMeta(){
  const el = $("#notifyPermissionMeta"); if(!el) return;
  let perm = "unsupported";
  try{ perm = (typeof Notification !== "undefined") ? Notification.permission : "unsupported"; }catch(_e){}
  if(perm === "granted"){
    el.innerHTML = '<span class="u-text-ok">●</span> ' + t("notify.perm.granted","浏览器通知已授权——到期任务将弹出系统通知");
  }else if(perm === "denied"){
    el.innerHTML = '<span class="u-text-danger">●</span> ' + t("notify.perm.denied","浏览器通知被拒绝——提醒将降级为页面内 toast。如需系统通知，请在浏览器地址栏左侧的站点权限中「允许通知」后刷新");
  }else if(perm === "default"){
    el.innerHTML = '<span class="u-text-warn">●</span> ' + t("notify.perm.default","浏览器通知未授权——首次提醒时会弹出授权请求；授权后系统通知可用");
  }else{
    el.innerHTML = '<span class="u-text-muted">●</span> ' + t("notify.perm.unsupported","当前环境不支持浏览器通知——提醒将降级为页面内 toast");
  }
}

// v3.1.2 B-档：渲染自动备份元信息（上次快照时间 + 快照大小）
function renderAutoBackupMeta(){
  const el = $("#autoBackupMeta"); if(!el) return;
  try{
    const raw = localStorage.getItem(PREFIX + "autobackup");
    if(!raw){ el.textContent = t("dataMgmt.autoBackupMeta.none","尚未生成自动备份"); return; }
    const j = JSON.parse(raw);
    const ts = j._ts || 0;
    const d = ts ? new Date(ts) : null;
    const when = d ? (d.getFullYear()+"-"+(d.getMonth()+1).toString().padStart(2,"0")+"-"+d.getDate().toString().padStart(2,"0")+" "+d.getHours().toString().padStart(2,"0")+":"+d.getMinutes().toString().padStart(2,"0")) : "";
    // 快照大小：去掉 _ts 键后估算业务数据体积
    const bizBytes = raw.length - (JSON.stringify({_ts:ts}).length);
    const size = bizBytes > 1024*1024 ? (bizBytes/(1024*1024)).toFixed(1)+" MB" : (bizBytes > 1024 ? (bizBytes/1024).toFixed(0)+" KB" : bizBytes+" B");
    el.textContent = t("dataMgmt.autoBackupMeta.text","上次备份：{time} · 体积 {size}").replace("{time}", when).replace("{size}", size);
  }catch(_e){ el.textContent = t("dataMgmt.autoBackupMeta.err","自动备份元信息读取失败"); }
}

/* ---------- v3.4.7 批次四：存储用量仪表（容量横条 + Top5 大 key + 三档阈值） ----------
 * 此前用户对 5MB 配额完全盲（无 navigator.storage.estimate 调用、无按 key 体积统计）。
 * 口径说明：localStorage 在浏览器实际限 ~5MB；navigator.storage.estimate 反映的是
 * IDB/Cache 的配额（通常 GB 级）——两者不是一回事。横条以 localStorage 字节为主口径
 * （同步逐 key 统计，200+ 键 <10ms），estimate 仅在可用时作参考行展示。 */
function _fmtBytes(n){
  if(n >= 1024*1024) return (n/(1024*1024)).toFixed(1) + " MB";
  if(n >= 1024) return (n/1024).toFixed(0) + " KB";
  return n + " B";
}
function renderStorageUsage(){
  const card = $("#storageUsageCard"); if(!card) return;
  const totalEl = $("#storageUsageTotal"), fillEl = $("#storageUsageFill"), topEl = $("#storageUsageTop");
  if(!totalEl || !fillEl || !topEl) return;
  const LS_LIMIT = 5 * 1024 * 1024; // localStorage 常用配额（保守口径）
  // 逐 key 字节统计（getItem 返回的 UTF-16 字符串——中英混合下 2 字节/字符更准，与实际存储一致）
  let totalBytes = 0;
  const sizes = [];
  try{
    for(let i = 0; i < localStorage.length; i++){
      const k = localStorage.key(i);
      if(!k) continue;
      const v = localStorage.getItem(k);
      const bytes = v ? v.length * 2 : 0; // UTF-16 每字符 2 字节
      totalBytes += bytes;
      sizes.push({ k, bytes });
    }
  }catch(_e){ /* 遍历失败时显示空态 */ }
  const pct = Math.min(100, Math.round(totalBytes / LS_LIMIT * 100));
  // 阈值三档：<70% 正常 / ≥70% warn / ≥85% danger
  fillEl.style.width = pct + "%";
  fillEl.classList.toggle("warn", pct >= 70 && pct < 85);
  fillEl.classList.toggle("danger", pct >= 85);
  totalEl.textContent = _fmtBytes(totalBytes) + " / ~" + _fmtBytes(LS_LIMIT) + " · " + pct + "%";
  // Top 5 大 key
  sizes.sort(function(a, b){ return b.bytes - a.bytes; });
  topEl.innerHTML = "";
  sizes.slice(0, 5).forEach(function(s){
    const share = totalBytes ? Math.round(s.bytes / totalBytes * 100) : 0;
    const row = document.createElement("div");
    row.className = "storage-usage-row";
    row.innerHTML = '<span class="k">' + esc(s.k) + '</span><span class="sz">' + _fmtBytes(s.bytes) +
      '</span><span class="pct-bar"><span class="pct-fill" style="width:' + share + '%"></span></span>';
    topEl.appendChild(row);
  });
  // 参考行：estimate 可用时展示（IDB 配额，非 localStorage——两个口径，防误读）
  try{
    if(navigator.storage && typeof navigator.storage.estimate === "function"){
      navigator.storage.estimate().then(function(est){
        if(est && est.quota && est.usage !== undefined){
          const ref = document.createElement("div");
          ref.className = "storage-usage-row u-fs-3xs";
          ref.innerHTML = '<span class="k">' + esc(t("dataMgmt.storageEstimateRef","参考：应用总存储（含 IndexedDB）")) + '</span><span class="sz">' + _fmtBytes(est.usage) + " / " + _fmtBytes(est.quota) + "</span>";
          topEl.appendChild(ref);
        }
      }).catch(function(){ /* estimate 失败静默 */ });
    }
  }catch(_e2){ /* navigator.storage 不可用（老环境）静默 */ }
}

/* ---------- v3.1：集成中心面板渲染 ---------- */
function renderIntegrationPanel(){
  const panel = $("#integrationPanel");
  if(!panel) return;
  const providers = [
    {name:"notion", label:"Notion", desc:t("int.notionDesc","同步笔记和任务到 Notion"), connectFn:"notionConnect", disconnectFn:"notionDisconnect"},
    {name:"linear", label:"Linear", desc:t("int.linearDesc","同步任务到 Linear"), connectFn:"linearConnect", disconnectFn:"linearDisconnect"},
    {name:"jira", label:"Jira", desc:t("int.jiraDesc","同步任务到 Jira"), connectFn:"jiraConnect", disconnectFn:"jiraDisconnect"},
    {name:"slack", label:"Slack", desc:t("int.slackDesc","接收 Slack 消息通知"), connectFn:"slackConnect", disconnectFn:"slackDisconnect"},
    {name:"feishu", label:t("int.feishuLabel","飞书"), desc:t("int.feishuDesc","接收飞书消息通知"), connectFn:"feishuConnect", disconnectFn:"feishuDisconnect"},
    {name:"dingtalk", label:t("int.dingtalkLabel","钉钉"), desc:t("int.dingtalkDesc","接收钉钉消息通知"), connectFn:"dingtalkConnect", disconnectFn:"dingtalkDisconnect"},
    {name:"calendar", label:t("appPage.calview", "日历"), desc:t("int.calendarDesc","同步日程到 Google/Outlook 日历"), connectFn:"calendarConnect", disconnectFn:"calendarDisconnect"}
  ];
  const rows = providers.map(function(p){
    // v3.1.1 修复：原用一个不存在的 getProvider 全局函数，状态恒为「未连接」；真实函数为 integrationGetProvider。
    // calendar 的注册名是具体日历类型（google_calendar / outlook_calendar），需按两个名字兜底查询。
    let prov = null;
    try{ prov = integrationGetProvider(p.name); }catch(e){ prov = null; }
    if(!prov && p.name === "calendar"){
      try{ prov = integrationGetProvider(INTEGRATION_TYPES.GOOGLE_CALENDAR) || integrationGetProvider(INTEGRATION_TYPES.OUTLOOK_CALENDAR); }catch(e){ prov = null; }
    }
    const enabled = !!(prov && prov.enabled);
    const statusCls = enabled ? "int-on" : "int-off";
    const verified = !!(prov && prov.config && prov.config._verified);
    const statusText = enabled ? (t("int.connected","已连接") + (verified ? t("int.verified"," · 已验证") : t("int.unverified"," · 未验证"))) : t("int.notConnected","未连接");
    const actionBtn = enabled
      ? '<button type="button" class="addbtn sm int-disc" data-int-disc="' + p.name + t("p4.html.intDiscBtn","\">断开</button>")
      : '<button type="button" class="addbtn sm int-conn" data-int-conn="' + p.name + t("p4.html.intConnBtn","\">连接</button>");
    return '<div class="int-row ' + statusCls + '">' +
      '<div class="int-info"><div class="int-label">' + esc(p.label) + '</div><div class="int-desc">' + esc(p.desc) + '</div></div>' +
      '<div class="int-status">' + esc(statusText) + '</div>' +
      '<div class="int-action">' + actionBtn + '</div>' +
      '</div>';
  });
  /* v3.6.5：OpenAPI Key 管理迁至 AI 页·大模型 —— Key 是 AI 机制的凭据，不该混在 Notion/Jira/Slack
     等 IM/办公集成列表里（用户反馈）。AI 侧渲染见 renderOpenApiKeyPanel()（_switchAiTab("ai-llm") 时触发）。 */
  panel.innerHTML = sanitizeHtml('<div class="int-list">' + rows.join("") + '</div>');
  // 绑定连接/断开按钮
  // v3.1.1 修复：原实现直接以空 config 调 connectFn → 所有 connect 函数因缺凭据返回 null，
  // 却仍弹「已连接」假成功 toast；现改为先弹配置弹窗收集凭据（openIntegrationConfig），
  // connectFn 返回 provider 对象才视为成功。
  panel.querySelectorAll("[data-int-conn]").forEach(function(btn){
    btn.onclick = function(){
      const name = btn.getAttribute("data-int-conn");
      openIntegrationConfig(name);
    };
  });
  panel.querySelectorAll("[data-int-disc]").forEach(function(btn){
    btn.onclick = function(){
      const name = btn.getAttribute("data-int-disc");
      try{
        if(name === "calendar"){
          // calendarDisconnect(providerName) 需要具体日历类型；两个都断开（未注册的调用内部返回 false，无副作用）
          try{ calendarDisconnect(INTEGRATION_TYPES.GOOGLE_CALENDAR); calendarDisconnect(INTEGRATION_TYPES.OUTLOOK_CALENDAR); }catch(e){}
        }else{
          const fn = window[name + "Disconnect"];
          if(typeof fn === "function") fn();
          else{ try{ integrationRemoveProvider(name); }catch(e){} }
        }
        renderIntegrationPanel();
        toast(name + t("integration.disconnected", " 已断开"), "ok");
      }catch(e){ toast(t("integration.disconnectFail", "断开异常：{err}").replace("{err}", (e.message || e)), "warn"); }
    };
  });
  // 渲染API Key列表
  const keyList = panel.querySelector("#intApiKeyList");
  if(keyList){
    let keys = [];
    try{ if(typeof openApiListApiKeys === "function") keys = openApiListApiKeys() || []; }catch(e){}
    keyList.innerHTML = sanitizeHtml(keys.length ? keys.map(function(k){
      return '<div class="int-key-row"><span class="int-key-name">' + esc(k.name || k.id) + '</span><span class="int-key-status ' + (k.revokedAt ? "int-off" : "int-on") + '">' + (k.revokedAt ? t("int.revoked","已吊销") : t("int.valid","有效")) + '</span><button type="button" class="addbtn xs int-revoke" data-revoke="' + esc(k.id) + t("p4.html.intRevokeBtn","\">吊销</button></div>");
    }).join("") : t("p4.html.intNoApiKey","<p class=\"hint\">暂无 API Key</p>"));
    keyList.querySelectorAll("[data-revoke]").forEach(function(btn){
      btn.onclick = function(){
        const kid = btn.getAttribute("data-revoke");
        if(!confirm(t("int.confirmRevoke","确定吊销此 API Key？"))) return;
        try{ if(typeof openApiRevokeApiKey === "function") openApiRevokeApiKey(kid); }catch(e){}
        renderIntegrationPanel();
        toast(t("api.keyRevoked", "Key 已吊销"), "ok");
      };
    });
  }
  const newKeyBtn = panel.querySelector("#btnIntNewKey");
  if(newKeyBtn){
    newKeyBtn.onclick = function(){
      const name = prompt(t("api.keyNamePrompt", "输入 Key 名称："));
      if(!name) return;
      try{
        if(typeof openApiCreateApiKey === "function"){
          const k = openApiCreateApiKey(name, ["read","write"]);
          renderIntegrationPanel();
          toast(t("api.keyCreated", "Key 已创建：") + (k && k.id ? k.id.slice(0,8) + "…" : ""), "ok");
        }
      }catch(e){ toast(t("integration.createFail", "创建失败：{err}").replace("{err}", (e.message || e)), "warn"); }
    };
  }
}

/* v3.6.5：OpenAPI Key 面板渲染（AI 页·大模型）。
   Key 管理从集成中心迁入 AI 页（Key 属 AI 机制凭据），由 _switchAiTab("ai-llm") 与
   renderIntegrationPanel 双入口触发，保证两处数据始终同步。 */
function renderOpenApiKeyPanel(){
  const keyList = document.querySelector("#aiApiKeyList");
  if(keyList){
    let keys = [];
    try{ if(typeof openApiListApiKeys === "function") keys = openApiListApiKeys() || []; }catch(e){}
    keyList.innerHTML = sanitizeHtml(keys.length ? keys.map(function(k){
      return '<div class="int-key-row"><span class="int-key-name">' + esc(k.name || k.id) + '</span><span class="int-key-status ' + (k.revokedAt ? "int-off" : "int-on") + '">' + (k.revokedAt ? t("int.revoked","已吊销") : t("int.valid","有效")) + '</span><button type="button" class="addbtn xs int-revoke" data-revoke="' + esc(k.id) + t("p4.html.intRevokeBtn","\">吊销</button></div>");
    }).join("") : t("p4.html.intNoApiKey","<p class=\"hint\">暂无 API Key</p>"));
    keyList.querySelectorAll("[data-revoke]").forEach(function(btn){
      btn.onclick = function(){
        const kid = btn.getAttribute("data-revoke");
        if(!confirm(t("int.confirmRevoke","确定吊销此 API Key？"))) return;
        try{ if(typeof openApiRevokeApiKey === "function") openApiRevokeApiKey(kid); }catch(e){}
        renderOpenApiKeyPanel();
        toast(t("api.keyRevoked", "Key 已吊销"), "ok");
      };
    });
  }
  const newKeyBtn = document.querySelector("#btnAiNewKey");
  if(newKeyBtn && !newKeyBtn._bound){
    newKeyBtn._bound = true;
    newKeyBtn.onclick = function(){
      const name = prompt(t("api.keyNamePrompt", "输入 Key 名称："));
      if(!name) return;
      try{
        if(typeof openApiCreateApiKey === "function"){
          const k = openApiCreateApiKey(name, ["read","write"]);
          renderOpenApiKeyPanel();
          toast(t("api.keyCreated", "Key 已创建：") + (k && k.id ? k.id.slice(0,8) + "…" : ""), "ok");
        }
      }catch(e){ toast(t("integration.createFail", "创建失败：{err}").replace("{err}", (e.message || e)), "warn"); }
    };
  }
}

/* ---------- v3.1.1：集成连接配置弹窗 ----------
 * 修复：连接按钮原以空 config 直调 connectFn，所有 connect 函数因缺凭据返回 null 却弹假成功。
 * 现按 provider 收集凭据字段（字段需求逐一对照各 connect 函数源码），凭据齐备才调用 connectFn；
 * connectFn 返回 provider 对象才视为连接成功，_verified 标记如实反馈验证结果。
 * 注意：calendarConnect/calendarDisconnect 签名为 (providerName, config)，注册名是
 * google_calendar/outlook_calendar 而非面板的 "calendar"，此处单独适配。 */
const INTEGRATION_LABELS = { notion:"Notion", linear:"Linear", jira:"Jira", slack:"Slack", feishu:t("int.feishuLabel","飞书"), dingtalk:t("int.dingtalkLabel","钉钉"), calendar:t("int.calendarLabel","日历") };
const INTEGRATION_CONFIG_FIELDS = {
  notion:   [{ k:"token", label:"Internal Integration Token", ph:"secret_…", required:true, secret:true },
             { k:"databaseId", label:t("int.notionDbId","任务数据库 ID"), ph:t("int.notionDbIdPh","可选，用于任务同步") },
             { k:"notesDatabaseId", label:t("int.notionNotesDbId","笔记数据库 ID"), ph:t("int.notionNotesDbIdPh","可选，用于笔记同步") }],
  linear:   [{ k:"token", label:"API Key", ph:"lin_api_…", required:true, secret:true },
             { k:"teamId", label:"Team ID", ph:t("int.linearTeamIdPh","可选，用于 issue 同步") }],
  jira:     [{ k:"domain", label:t("int.jiraDomain","站点域名"), ph:"your-domain.atlassian.net", required:true },
             { k:"token", label:"API Token", ph:"Bearer token", required:true, secret:true }],
  slack:    [{ k:"botToken", label:"Bot User OAuth Token", ph:"xoxb-…", required:true, secret:true }],
  feishu:   [{ k:"appId", label:"App ID", ph:"cli_…", required:true },
             { k:"appSecret", label:"App Secret", required:true, secret:true }],
  dingtalk: [{ k:"accessKey", label:"AppKey", required:true },
             { k:"accessSecret", label:"AppSecret", required:true, secret:true }],
  calendar: [{ k:"_calType", label:t("int.calService","日历服务"), type:"select", required:true,
               options:[["google_calendar",t("int.googleCal","Google 日历")],["outlook_calendar",t("int.outlookCal","Outlook 日历")]] },
             { k:"clientId", label:"OAuth Client ID", ph:t("int.clientIdPh","服务商控制台注册应用的 Client ID"), required:false },
             { k:"token", label:"OAuth Access Token", ph:t("int.oauthHint","粘贴 Access Token（本构建若含本地回调服务，会出现「OAuth 授权」按钮自动获取）"), required:true, secret:true }]
};
/* ---------- v3.1.1：OAuth 授权接线（Electron 形态） ----------
 * ⚠️ v3.7.54 核对更正：**后端目前不存在**。本注释原先写"后端（electron/main.js B3）：oauth-begin
 * 接收 {…}，PKCE S256 + 一次性 state（TTL 10min）；回调后经 oauth-status 通知渲染层"，
 * 但实测 electron/main.js 全文 0 处 oauth / createServer / 8124，electron/preload.js 也只暴露
 * 6 个 API、不含 oauthBegin/onOauthStatus —— 那段描述的是**设计意图**而非已交付能力。
 * 因此现在按"能力缺失即隐藏"处理（同 README 里本机同步入口的做法）：
 * 桥不存在时不渲染「OAuth 授权」按钮，也不在帮助里承诺支持。
 * 补后端的步骤（保留设计，勿重编）：主进程起 http://127.0.0.1:8124/oauth/callback 一次性 state
 * 服务、PKCE S256、经 "oauth-status" 事件回抛渲染层，并在 preload 暴露 oauthBegin。
 * 日历 OAuth 端点为服务商公共标准端点：
 *   Google  authorize https://accounts.google.com/o/oauth2/v2/auth
 *           token    https://oauth2.googleapis.com/token（支持 PKCE，公共客户端无需 secret）
 *   Outlook authorize https://login.microsoftonline.com/common/oauth2/v2.0/authorize
 *           token    https://login.microsoftonline.com/common/oauth2/v2.0/token（支持 PKCE）
 * redirect_uri 固定为 http://127.0.0.1:8124/oauth/callback（主进程），注册应用时需填此项。 */
const CALENDAR_OAUTH_ENDPOINTS = {
  google_calendar: {
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scope: "https://www.googleapis.com/auth/calendar",
    usePkce: true
  },
  outlook_calendar: {
    authorizeUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    scope: "https://graph.microsoft.com/Calendars.ReadWrite",
    usePkce: true
  }
};
/* OAuth 桥是否真的可用：必须探 preload 暴露的函数本身，不能只看 window.electronAPI 存在 ——
   Electron 形态下 electronAPI 存在但没有 oauthBegin，原先的文案却对用户说
   「仅 Electron 桌面版支持」，在桌面版里反而是假话。 */
function integrationOAuthAvailable(){
  const api = window.electronAPI;
  return !!(api && typeof api.oauthBegin === "function");
}
async function integrationOAuthBegin(providerKey, cfg, opts){
  /* @returns {Promise<{ok:boolean, error?:string, provider?:string, token?:string}>}
   * 发起 OAuth → 等待 oauth-status 事件（成功含 access_token）→ 返回供 connect 使用。
   * 事件超时按 opts.timeout 覆写（测试注入用）；默认 60s（用户可能迟迟未在浏览器完成授权）。 */
  const timeoutMs = (opts && typeof opts.timeout === "number" && opts.timeout >= 0) ? opts.timeout : 60000;
  const ep = CALENDAR_OAUTH_ENDPOINTS[providerKey];
  const clientId = cfg && cfg.clientId;
  if(!ep) return { ok:false, error:t("int.errUnsupportedProvider","不支持的 OAuth provider：") + providerKey };
  if(!clientId) return { ok:false, error:t("int.errMissingClientId","缺少 OAuth Client ID（需先在服务商控制台注册应用）") };
  if(!integrationOAuthAvailable()){
    return { ok:false, error:t("int.errOAuthBridgeMissing","当前构建未包含本地授权回调服务（需 Electron 主进程实现 oauth-begin + 127.0.0.1:8124 回调），请改用手动粘贴 Access Token") };
  }
  let begin;
  const api = window.electronAPI;   /* integrationOAuthAvailable() 已保证它与 oauthBegin 都在 */
  try{
    begin = await api.oauthBegin({
      provider: providerKey,
      authorizeUrl: ep.authorizeUrl,
      tokenUrl: ep.tokenUrl,
      clientId: clientId,
      scope: ep.scope,
      usePkce: !!ep.usePkce
    });
  }catch(e){
    return { ok:false, error:t("int.errOauthBegin","发起授权失败：") + ((e && e.message) || e) };
  }
  if(!begin || !begin.ok) return { ok:false, error:(begin && begin.error) || t("int.errOauthBeginGeneric","发起授权失败") };
  // shell 不可用（或用户需手动）时的兜底：自己开窗口
  if(!begin.opened && begin.url){ try{ window.open(begin.url, "_blank", "noopener"); }catch(_e){} }
  if(!begin.opened && !begin.url) return { ok:false, error:t("int.errCannotOpenAuth","无法打开授权页（既无系统浏览器也无 window.open）") };
  return new Promise(function(resolve){
    let settled = false;
    const finish = function(r){ if(settled) return; settled = true;
      try{ api.offOauthStatus(onStatus); }catch(_e){}
      clearTimeout(timer); resolve(r); };
    const onStatus = function(d){
      if(!d || d.provider !== providerKey) return;
      if(d.ok && d.token && d.token.accessToken) finish({ ok:true, provider:providerKey, token:d.token.accessToken });
      else finish({ ok:false, error:(d.error || t("int.errOauthIncomplete","授权未完成")) , provider:providerKey });
    };
    const timer = setTimeout(function(){ finish({ ok:false, error:t("int.errOauthTimeout","授权超时（") + Math.round(timeoutMs/1000) + t("int.errOauthTimeoutSuffix"," 秒内未完成），请重试") }); }, timeoutMs);
    try{ api.onOauthStatus(onStatus); }catch(e){ finish({ ok:false, error:t("int.errOauthListen","监听授权状态失败：") + ((e && e.message) || e) }); }
  });
}
function openIntegrationConfig(name){
  const fields = INTEGRATION_CONFIG_FIELDS[name];
  const label = INTEGRATION_LABELS[name] || name;
  if(!fields){ toast(t("int.noConfig","该集成暂无可用配置"), "warn"); return; }
  const old = $("#intCfgOverlay"); if(old) old.remove(); // 防重复挂载
  const inputsHtml = fields.map(function(f){
    if(f.type === "select"){
      return '<label class="u-block u-fs-xs u-m-2h-0-1">' + esc(f.label) + '</label>'
        + '<select id="intcfg_' + f.k + '" class="u-w-full">'
        + f.options.map(function(o){ return '<option value="' + esc(o[0]) + '">' + esc(o[1]) + '</option>'; }).join("") + '</select>';
    }
    return '<label class="u-block u-fs-xs u-m-2h-0-1">' + esc(f.label) + (f.required ? " *" : "") + '</label>'
      + '<input id="intcfg_' + f.k + '" type="' + (f.secret ? "password" : "text") + '" placeholder="' + esc(f.ph || "") + '" class="u-w-full">';
  }).join("");
  const ov = document.createElement("div");
  ov.className = "overlay";
  ov.id = "intCfgOverlay";
  ov.innerHTML = sanitizeHtml(t("p4.html.intCfgDialog",'<div class="cmd u-max-w-480 u-p-5" role="dialog" aria-modal="true" aria-label="连接 ') + esc(label) + '">'
    + t("p4.html.intCfgTitle",'<h3 class="u-m-0-0-1 u-fs-md">连接 ') + esc(label) + '</h3>'
    + t("p4.html.intCredentialHint",'<p class="sub u-m-0-0-2">凭据仅存储于本机（随应用数据加密持久化），不上传任何服务器</p>')
    + inputsHtml
    /* 「OAuth 授权」按钮只在桥真在的时候出现 —— 原先无条件渲染，用户点了才拿到一句
       "不支持"，属"stub + 活 UI = 虚假功能"（同本机同步入口 v3.7.52 的处理）。 */
    + (name === "calendar" && integrationOAuthAvailable()
      ? t("p4.html.intOAuthHint",'<p class="sub u-fs-2xs u-m-2-0-0">填好 Client ID 后点「OAuth 授权」可自动获取 Token（仅 Electron 版，回调地址 <code>http://127.0.0.1:8124/oauth/callback</code> 需在服务商控制台登记）</p>')
        + t("p4.html.intOAuthBtn",'<button type="button" class="addbtn sm u-mt-2" id="btnIntCfgOAuth" data-sc="accent">OAuth 授权</button>')
      : "")
    + '<div class="u-flex u-mt-4 u-gap-2 u-jc-end">'
    + t("p4.html.intGoBtn",'<button type="button" class="addbtn sm btn-primary" id="btnIntCfgGo">连接</button>')
    + t("p4.html.intCancelBtn",'<button type="button" class="addbtn sm" id="btnIntCfgCancel" data-sc="muted">取消</button></div></div>'));
  document.body.appendChild(ov);
  requestAnimationFrame(function(){ ov.classList.add("show"); });
  const close = function(){ ov.classList.remove("show"); setTimeout(function(){ ov.remove(); }, 160); };
  ov.onclick = function(e){ if(e.target === ov) close(); };
  const cancelBtn = $("#btnIntCfgCancel"); if(cancelBtn) cancelBtn.onclick = close;
  // v3.1.1：日历 OAuth 授权路径——经主进程轻后端拿 access_token，回填 token 输入框后走统一 connect 验证
  const oauthBtn = $("#btnIntCfgOAuth");
  if(oauthBtn) oauthBtn.onclick = async function(){
    const calTypeEl = $("#intcfg__calType");
    const clientIdEl = $("#intcfg_clientId");
    const tokenEl = $("#intcfg_token");
    const calType = calTypeEl ? String(calTypeEl.value || "") : "";
    const clientId = clientIdEl ? String(clientIdEl.value || "").trim() : "";
    if(!calType){ toast(t("int.selectCalendarFirst","请先选择日历服务"), "warn"); return; }
    if(!clientId){ toast(t("int.fillClientIdFirst","请先填写 OAuth Client ID"), "warn"); if(clientIdEl) clientIdEl.focus(); return; }
    const r = await withLoading(oauthBtn, integrationOAuthBegin(calType, { clientId: clientId }));
    if(!r.ok){ toast("OAuth：" + r.error, "warn"); return; }
    if(tokenEl) tokenEl.value = r.token;
    toast(t("int.oauthSuccess","授权成功，Token 已回填（有效期内免重复授权）"), "ok");
    // 自动触发统一连接流程（token 已就位，connect 内部会向服务商验证）
    const go = $("#btnIntCfgGo");
    if(go && !go.disabled) go.onclick();
  };
  const goBtn = $("#btnIntCfgGo");
  if(goBtn) goBtn.onclick = async function(){
    const cfg = {};
    for(const f of fields){
      const el = $("#intcfg_" + f.k);
      const v = el ? String(el.value || "").trim() : "";
      if(f.required && !v){ toast(t("int.fillFieldPrefix","请填写 ")+f.label, "warn"); if(el) el.focus(); return; }
      if(v) cfg[f.k] = v;
    }
    let prov = null;
    try{
      const connectPromise = (name === "calendar")
        ? (function(){ const calType = cfg._calType; delete cfg._calType; return calendarConnect(calType, cfg); })()
        : (function(){ const fn = window[name + "Connect"]; return (typeof fn === "function") ? fn(cfg) : Promise.resolve(null); })();
      prov = await withLoading(goBtn, connectPromise);
    }catch(e){
      toast(t("int.connectErrorPrefix","连接异常：") + (e && e.message ? e.message : e), "warn");
      return;
    }
    if(prov){
      close();
      renderIntegrationPanel();
      const verified = !!(prov.config && prov.config._verified);
      toast(label + t("int.connectedSuffix"," 已连接") + (verified ? t("int.verifiedOk","（凭据验证通过）") : t("int.verifiedFail","（未能验证凭据，请检查配置）")), verified ? "ok" : "warn");
    }else{
      toast(t("int.connectFail","连接失败：凭据缺失或不符合要求"), "warn");
    }
  };

}
$$("#drawer .set-nav-btn[data-set-tab]").forEach(function(b){
  b.onclick = function(){ _switchSetTab(b.getAttribute("data-set-tab")); };
});
/* 默认激活第一个分区（场景） */
(function(){
  const first = document.querySelector("#drawer .set-nav-btn[data-set-tab]");
  if(first) _switchSetTab(first.getAttribute("data-set-tab"));
})();

function _switchAiTab(tabId){
  $$("#drawer .set-nav-btn[data-ai-tab]").forEach(function(b){
    b.classList.toggle("active", b.getAttribute("data-ai-tab") === tabId);
  });
  $$("#drawer .ai-section").forEach(function(s){
    s.classList.toggle("ai-tab-active", s.getAttribute("data-ai-tab") === tabId);
  });
  const d = $("#drawer"); if(d) d.scrollTop = 0;
  /* v3.6.5：OpenAPI Key 管理已从集成中心迁入本页 —— 切到大模型 tab 时渲染 Key 列表 */
  if(tabId === "ai-llm" && typeof renderOpenApiKeyPanel === "function") renderOpenApiKeyPanel();
}
$$("#drawer .set-nav-btn[data-ai-tab]").forEach(function(b){
  b.onclick = function(){ _switchAiTab(b.getAttribute("data-ai-tab")); };
});

/* ================= v3.6.5 编程场景 · 轻量 IDE 工具集 =================
   四个高频开发场景工具（JSON/时间戳/编解码/UUID），复用 TOOL_APPS 的 render/bind
   （单一实现，两处入口：工具箱「编程」分类 + 编程场景 tab），避免双份实现漂移。 */
(function(){
  const wrap = function(toolId){
    const render = function(){
      const a = TOOL_APPS[toolId]; if(!a) return '<div class="card"><div class="empty">'+t("tool.notFound","未找到工具")+'</div></div>';
      return '<div class="card tool-app-card"><h2>' + a.icon + ' ' + esc(a.name) + '</h2>' + a.render() + '</div>';
    };
    const bind = function(){ const a = TOOL_APPS[toolId]; if(a && typeof a.bind === "function"){ try{ a.bind(); }catch(e){} } };
    return { render: render, bind: bind };
  };
  [["json","cod-json"],["time","cod-time"],["codec","cod-codec"],["uuid","cod-uuid"]].forEach(function(p){
    const w = wrap(p[1]);
    SCENE_FEATURE_RENDER.code = SCENE_FEATURE_RENDER.code || {};
    SCENE_FEATURE_RENDER.code[p[0]] = w.render;
    SCENE_FEATURE_BIND.code = SCENE_FEATURE_BIND.code || {};
    SCENE_FEATURE_BIND.code[p[0]] = w.bind;
  });
})();
const AI_BUILTIN_SKILLS = [
  {name:"create_task", desc:t("ai.skillCreateTask","创建任务"), enabled:true},
  {name:"complete_task", desc:t("ai.skillCompleteTask","完成任务"), enabled:true},
  {name:"search", desc:t("tool.webSearch.search", "搜索"), enabled:true},
  {name:"export", desc:t("ai.skillExport","导出"), enabled:true},
  {name:"review", desc:t("ai.skillReview","复习"), enabled:true},
  {name:"stats", desc:t("ai.skillStats","统计"), enabled:true}
];
function renderAiSkillsBuiltin(){
  const box = $("#aiSkillsBuiltin"); if(!box) return;
  const saved = getAiConfig("skills");
  const skills = saved && Array.isArray(saved.builtin) ? saved.builtin : AI_BUILTIN_SKILLS;
  box.innerHTML = "";
  skills.forEach(function(s, i){
    const row = document.createElement("div");
    row.className = "set-switch";
    row.innerHTML = '<input type="checkbox" id="aiSkill_'+i+'"'+(s.enabled?" checked":"")+" aria-label=\""+s.name+'">'+
      "<div><div class=\"sw-label\">"+s.name+"</div><div class=\"sw-sub\">"+s.desc+"</div></div>";
    box.appendChild(row);
  });
}
function renderAiMcpList(){
  const box = $("#aiMcpList"); if(!box) return;
  const saved = getAiConfig("mcp");
  const servers = saved && Array.isArray(saved.servers) ? saved.servers : [];
  box.innerHTML = "";
  if(servers.length === 0){
    const empty = document.createElement("p");
    empty.className = "set-tip";
    empty.textContent = t("ai.noMcpServer","暂无 MCP 服务器，点击「添加服务器」新建。");
    box.appendChild(empty);
    return;
  }
  servers.forEach(function(srv, i){
    const row = document.createElement("div");
    row.className = "set-field";
    row.innerHTML = "<label for=\"aiMcpName_"+i+"\">"+t("ai.serverPrefix","服务器 ")+(i+1)+"</label>"+
      "<div class=\"ctl\"><div class=\"btn-row\">"+
      "<input id=\"aiMcpName_"+i+"\" placeholder=\""+t("common.name","名称")+"\" value=\""+esc(srv.name||"")+'" class="u-flex-1 u-min-w-80">'+ // v3.1.2：esc 防属性截断注入
      "<input id=\"aiMcpUrl_"+i+'" placeholder="https://..." value="'+esc(srv.url||"")+'" class="u-flex-2 u-min-w-120">'+
      '<input type="checkbox" id="aiMcpEn_'+i+'"'+(srv.enabled?" checked":"")+' aria-label="'+t("common.enable","启用")+'">'+
      '<button type="button" class="addbtn sm u-nowrap" data-mcp-del="'+i+'" data-sc="danger-muted">'+t("common.delete","删除")+'</button>'+
      "</div></div>";
    box.appendChild(row);
  });
  $$("[data-mcp-del]").forEach(function(btn){
    btn.onclick = function(){
      const idx = parseInt(btn.getAttribute("data-mcp-del"), 10);
      const saved2 = getAiConfig("mcp") || {};
      const list = Array.isArray(saved2.servers) ? saved2.servers : [];
      list.splice(idx, 1);
      saved2.servers = list;
      saveAiConfig("mcp", saved2);
      renderAiMcpList();
    };
  });
}
function renderAiWorkflowList(){
  const box = $("#aiWorkflowList"); if(!box) return;
  const saved = getAiConfig("workflow");
  const flows = saved && Array.isArray(saved.flows) ? saved.flows : [];
  box.innerHTML = "";
  if(flows.length === 0){
    const empty = document.createElement("p");
    empty.className = "set-tip";
    empty.textContent = t("ai.noWorkflow","暂无工作流，点击「新建工作流」创建。");
    box.appendChild(empty);
    return;
  }
  flows.forEach(function(f, i){
    const sch = f.schedule || {};
    const row = document.createElement("div");
    row.className = "set-field";
    row.innerHTML = '<label for="aiWfName_'+i+'">' + t("p4.html.aiWorkflowLabel","工作流 ") + (i+1) + '</label>' +
      '<div class="ctl"><div class="btn-row">' +
      '<input id="aiWfName_'+i+'" placeholder="' + t("p4.html.aiNamePh","名称") + '" value="' + esc(f.name||"") + '" class="u-flex-1 u-min-w-80">' +
      '<input id="aiWfTrigger_'+i+'" placeholder="' + t("p4.html.aiTriggerPh","触发条件") + '" value="' + esc(f.trigger||"") + '" class="u-flex-2 u-min-w-120">' +
      '<select id="aiWfFreq_'+i+'" class="u-nowrap" title="' + t("wf.freqTitle","定时频率") + '">' +
        '<option value="off"' + (!sch.freq || sch.freq === "off" ? ' selected' : '') + '>' + t("wf.freqOff","不定时") + '</option>' +
        '<option value="daily"' + (sch.freq === "daily" ? ' selected' : '') + '>' + t("wf.freqDaily","每天") + '</option>' +
        '<option value="weekly"' + (sch.freq === "weekly" ? ' selected' : '') + '>' + t("wf.freqWeekly","每周") + '</option>' +
      '</select>' +
      /* v3.7.37：原生 <input type="time"> → 自研可编辑下拉（同上） */
      '<select id="aiWfTime_'+i+'" data-editable="1" class="u-nowrap" aria-label="' + t("wf.timeAria","执行时间") + '">'
        + timeOptionsHtml(sch.time || "09:00") + '</select>' +
      '<button type="button" class="addbtn sm" data-wf-del="'+i+'" data-sc="danger-muted" class="u-nowrap">' + t("p4.html.aiDeleteBtn","删除") + '</button>' +
      '</div></div>';
    box.appendChild(row);
  });
  $$("[data-wf-del]").forEach(function(btn){
    btn.onclick = function(){
      const idx = parseInt(btn.getAttribute("data-wf-del"), 10);
      const saved2 = getAiConfig("workflow") || {};
      const list = Array.isArray(saved2.flows) ? saved2.flows : [];
      list.splice(idx, 1);
      saved2.flows = list;
      saveAiConfig("workflow", saved2);
      renderAiWorkflowList();
    };
  });
}
const AI_BUILTIN_PLUGINS = [
  {name:"code_runner", desc:t("ai.pluginCodeRunner","代码执行"), enabled:false},
  {name:"web_search", desc:t("ai.pluginWebSearch","网页搜索"), enabled:false},
  {name:"file_reader", desc:t("ai.pluginFileReader","文件读取"), enabled:false}
];
function renderAiPluginList(){
  const box = $("#aiPluginList"); if(!box) return;
  const saved = getAiConfig("plugin");
  const plugins = saved && Array.isArray(saved.plugins) ? saved.plugins : AI_BUILTIN_PLUGINS;
  box.innerHTML = "";
  plugins.forEach(function(p, i){
    const row = document.createElement("div");
    row.className = "set-switch";
    row.innerHTML = '<input type="checkbox" id="aiPlugin_'+i+'"'+(p.enabled?" checked":"")+" aria-label=\""+p.name+'">'+
      "<div><div class=\"sw-label\">"+p.name+"</div><div class=\"sw-sub\">"+p.desc+"</div></div>";
    box.appendChild(row);
  });
}
function renderAiSessHistory(){
  const box = $("#aiSessHistory"); if(!box) return;
  const saved = getAiConfig("session");
  const history = saved && Array.isArray(saved.history) ? saved.history : [];
  box.innerHTML = "";
  if(history.length === 0){
    const empty = document.createElement("p");
    empty.className = "set-tip";
    empty.textContent = t("ai.noSessHistory","暂无会话历史。");
    box.appendChild(empty);
    return;
  }
  history.slice(0, 20).forEach(function(h, i){
    const row = document.createElement("div");
    row.className = "set-switch";
    row.innerHTML = "<div><div class=\"sw-label\">"+(h.title||(t("ai.sessPrefix","会话 ")+(i+1)))+"</div><div class=\"sw-sub\">"+(h.time||"")+"</div></div>";
    box.appendChild(row);
  });
}
function restoreAiMemory(){
  const saved = getAiConfig("memory"); if(!saved) return;
  const w = $("#aiMemWindow"); if(w && saved.windowSize) w.value = saved.windowSize;
  const lt = $("#aiMemLongTerm"); if(lt) lt.checked = !!saved.longTerm;
  const rg = $("#aiMemRag"); if(rg) rg.checked = !!saved.rag; // v3.4.7 批次六：RAG 注入开关回填
  const th = $("#aiMemThreshold"); if(th && saved.threshold !== null && saved.threshold !== undefined) th.value = saved.threshold;
  const st = $("#aiMemStrategy"); if(st && saved.strategy) st.value = saved.strategy;
}
function restoreAiSession(){
  const saved = getAiConfig("session"); if(!saved) return;
  const t = $("#aiSessTimeout"); if(t && saved.timeout) t.value = saved.timeout;
  const as = $("#aiSessAutosave"); if(as) as.checked = !!saved.autosave;
}
function restoreAiSkillsCustom(){
  const saved = getAiConfig("skills"); if(!saved || !saved.custom) return;
  const ta = $("#aiSkillsCustom"); if(ta) ta.value = saved.custom;
}
renderAiSkillsBuiltin();
restoreAiSkillsCustom();
renderAiMcpList();
renderAiWorkflowList();
restoreAiMemory();
renderAiPluginList();
restoreAiSession();
renderAiSessHistory();
$("#aiSkillsSave").onclick = function(){
  // v3.1.2 A-档：技能勾选直接读写 cfg.toolWhitelist（Agent 卡的同一处存储）——消除与「工具白名单」文本框双轨误导
  // 按 name 匹配（防顺序错配），勾选=true 写入白名单（白名单为空=全部）
  const boxes = $$("#aiSkillsBuiltin input[type=checkbox]");
  const boxByName = new Map();
  boxes.forEach(function(cb){
    const nm = cb.getAttribute("aria-label") || cb.id.replace(/^aiSkill_\d+_/, "");
    boxByName.set(nm, cb.checked);
  });
  const enabled = AI_BUILTIN_SKILLS.filter(function(s){ return boxByName.get(s.name) === true; }).map(function(s){ return s.name; });
  const cfg = getCfg() || {};
  if(enabled.length && enabled.length < AI_BUILTIN_SKILLS.length){
    cfg.toolWhitelist = enabled.join(",");
  } else {
    // 全选=清空白名单（语义=允许全部）
    delete cfg.toolWhitelist;
  }
  // cfg 通过 cfgSave 路径保存（确保回写一致）；此处直接 save 即可
  if(typeof saveCfg === "function"){ /* 走正常保存路径 */ }
  try{ save(PREFIX+"cfg", cfg); }catch(_e){}
  // 同步自定义技能 JSON 的保存
  const customTa = $("#aiSkillsCustom");
  saveAiConfig("skills", {builtin: AI_BUILTIN_SKILLS.map(function(s){ return {name:s.name,desc:s.desc,enabled: boxByName.get(s.name)===true}; }), custom: customTa ? customTa.value : ""});
  // 同步 Agent 卡白名单文本框显示
  const twInp = $("#cfgToolWhitelist"); if(twInp) twInp.value = cfg.toolWhitelist || "";
  toast(t("ai.skillConfigSaved","技能配置已保存（白名单已同步到「允许调用的工具」）"));
};
$("#aiMcpAdd").onclick = function(){
  const saved = getAiConfig("mcp") || {};
  const servers = Array.isArray(saved.servers) ? saved.servers : [];
  servers.push({name: "", url: "", enabled: false});
  saved.servers = servers;
  saveAiConfig("mcp", saved);
  renderAiMcpList();
};
$("#aiMcpSave").onclick = function(){
  const servers = [];
  const box = $("#aiMcpList");
  const rows = box.querySelectorAll(".set-field");
  rows.forEach(function(row, i){
    const nameInp = row.querySelector("#aiMcpName_"+i);
    const urlInp = row.querySelector("#aiMcpUrl_"+i);
    const enInp = row.querySelector("#aiMcpEn_"+i);
    servers.push({name: nameInp?nameInp.value:"", url: urlInp?urlInp.value:"", enabled: enInp?enInp.checked:false});
  });
  saveAiConfig("mcp", {servers: servers});
  toast(t("ai.mcpConfigSaved","MCP 配置已保存"));
};
$("#aiWorkflowAdd").onclick = function(){
  const saved = getAiConfig("workflow") || {};
  const flows = Array.isArray(saved.flows) ? saved.flows : [];
  flows.push({name: "", trigger: ""});
  saved.flows = flows;
  saveAiConfig("workflow", saved);
  renderAiWorkflowList();
};
$("#aiWorkflowSave").onclick = function(){
  const flows = [];
  const box = $("#aiWorkflowList");
  const rows = box.querySelectorAll(".set-field");
  rows.forEach(function(row, i){
    const nameInp = row.querySelector("#aiWfName_"+i);
    const triggerInp = row.querySelector("#aiWfTrigger_"+i);
    const freqInp = row.querySelector("#aiWfFreq_"+i);
    const timeInp = row.querySelector("#aiWfTime_"+i);
    flows.push({name: nameInp?nameInp.value:"", trigger: triggerInp?triggerInp.value:"",
      schedule: {freq: freqInp?freqInp.value:"off", time: timeInp?timeInp.value:"09:00"},
      lastRun: (getAiConfig("workflow") && getAiConfig("workflow").flows && getAiConfig("workflow").flows[i] && getAiConfig("workflow").flows[i].lastRun) || 0});
  });
  saveAiConfig("workflow", {flows: flows});
  toast(t("ai.workflowConfigSaved","工作流配置已保存"));
};
$("#aiMemSave").onclick = function(){
  const w = $("#aiMemWindow");
  const lt = $("#aiMemLongTerm");
  const rg = $("#aiMemRag");
  const th = $("#aiMemThreshold");
  const st = $("#aiMemStrategy");
  saveAiConfig("memory", {
    windowSize: w ? Number(w.value) : 10,
    longTerm: lt ? lt.checked : false,
    rag: rg ? rg.checked : false, // v3.4.7 批次六：RAG 上下文注入开关（ragInjectContext 读 cfg.rag）
    threshold: th ? Number(th.value) : 0.7,
    strategy: st ? st.value : "recent"
  });
  // cfg.rag 同步（ragInjectContext 判定走主配置而非 ai_config_memory；只改这一个字段，不动 profiles）
  try{
    const cfg = getCfg() || {};
    cfg.rag = rg ? !!rg.checked : false;
    _cfgCache = cfg; // 与 saveCfg 同款缓存更新（save 内部不含此逻辑）
    save(PREFIX + "cfg", cfg);
  }catch(_e){ /* cfg 写失败不影响 ai_config_memory 已存——注入静默保持旧态 */ }
  toast(t("ai.memoryConfigSaved","记忆配置已保存"));
};
$("#aiPluginSave").onclick = function(){
  // v3.1.2 A-档：插件勾选按 name 匹配（防顺序错配）+ 同步清空提示（这 3 项是占位假插件）
  const boxes = $$("#aiPluginList input[type=checkbox]");
  const boxByName = new Map();
  boxes.forEach(function(cb){
    const nm = cb.getAttribute("aria-label") || cb.id.replace(/^aiPlugin_\d+_/, "");
    boxByName.set(nm, cb.checked);
  });
  const enabled = AI_BUILTIN_PLUGINS.filter(function(p){ return boxByName.get(p.name) === true; }).map(function(p){ return p.name; });
  saveAiConfig("plugin", {plugins: AI_BUILTIN_PLUGINS.map(function(p){ return {name:p.name,desc:p.desc,enabled: boxByName.get(p.name)===true}; })});
  // 已知占位插件诚实提示（不假装勾选后会有能力变化）
  if(enabled.length > 0){
    toast(t("ai.pluginConfigSavedStub","插件配置已保存（注意：code_runner/web_search/file_reader 暂未接线执行代码，勾选状态仅保存配置）"));
  } else {
    toast(t("plugin.configSaved","插件配置已保存"));
  }
};
$("#aiSessSave").onclick = function(){
  const sessTimeoutEl = $("#aiSessTimeout");
  const as = $("#aiSessAutosave");
  const saved = getAiConfig("session") || {};
  saveAiConfig("session", {
    timeout: sessTimeoutEl ? Number(sessTimeoutEl.value) : 30,
    autosave: as ? as.checked : true,
    history: saved.history || []
  });
  toast(t("ai.sessConfigSaved", "会话配置已保存"));
};
$("#aiSessClear").onclick = function(){
  if(!confirm(t("ai.confirmClearSessHistory","确定清除所有 AI 会话历史？此操作不可撤销。"))) return;
  const saved = getAiConfig("session") || {};
  saved.history = [];
  saveAiConfig("session", saved);
  renderAiSessHistory();
  toast(t("ai.sessHistoryCleared","已清除所有会话历史"));
};
$("#cfgProfileNew").onclick = newProfile;
$("#cfgProfileDup").onclick = dupProfile;
$("#cfgProfileDel").onclick = delProfile;
$("#btnTheme").onclick = toggleTheme;
$("#btnCmd").onclick = openCmd;
$("#btnHelp").onclick = renderHelp;
/* 顶栏下载按钮：复用 doExport（导出 JSON 备份） */
const _btnDownload = $("#btnDownload"); if(_btnDownload) _btnDownload.onclick = doExport;
$("#btnRecover").onclick = recoverAutoBackup;

/* ---------- v1.9.7 侧栏「工具」组：专注工具浮层（v1.15 更多菜单已移除，此处仅剩 pomo/tracker 浮层） ---------- */
/* v2.3.1：浮层锚定按钮选择器——v2.1.0 两级菜单后按钮为 data-menu="plug-pomo/plug-tracker"，
   旧 data-pomo/data-tracker 属性已不存在于 DOM；两个都保留（历史兼容 + 现行入口）。
   注意不能带 "#side " 前缀：点击后 renderSide() 会重建侧栏，事件 target 已游离于文档外，
   其祖先链无 #side，closest("#side …") 永远 null → inToolBtn 守卫失效（浮层秒开秒关 bug）。 */
const TOOL_POP_ANCHOR_SEL = '[data-pomo], [data-tracker], [data-menu="plug-pomo"], [data-menu="plug-tracker"]';
function _closeAllToolPops(){
  $$(".tool-pop").forEach(function(p){ p.style.display = "none"; });
  $$(TOOL_POP_ANCHOR_SEL).forEach(function(b){
    try{ b.setAttribute("aria-expanded", "false"); }catch(e){ /* noop */ }
  });
}
AppBridge.toggleToolPop = toggleToolPop;
/* 切换笃行/时间追踪浮层：锚定侧栏按钮右侧（右缘溢出改左侧），再点同按钮=关闭 */
function toggleToolPop(popId, btn){
  const pop = document.getElementById(popId);
  if(!pop || !btn) return;
  const wasOpen = pop.style.display !== "none";
  _closeAllToolPops();
  if(wasOpen) return;
  pop.style.display = "";
  const r = btn.getBoundingClientRect();
  const w = pop.offsetWidth || 250;
  let left = r.right + 8;
  if(left + w > window.innerWidth - 8) left = Math.max(8, r.left - w - 8);
  pop.style.left = left + "px";
  const top = Math.min(Math.max(8, r.top), Math.max(8, window.innerHeight - pop.offsetHeight - 8));
  pop.style.top = top + "px";
  try{ btn.setAttribute("aria-expanded", "true"); }catch(e){ /* noop */ }
}

// 点击浮层/菜单外关闭（点侧栏对应按钮本身不视为"外部"，交由 toggle 逻辑处理）
document.addEventListener("click", function(e){
  const t = e.target;
  const inToolBtn = !!(t && t.closest && t.closest(TOOL_POP_ANCHOR_SEL));
  $$(".tool-pop").forEach(function(p){
    if(p.style.display !== "none" && !p.contains(t) && !inToolBtn) p.style.display = "none";
  });
});
// Esc 一键收起浮层与菜单
document.addEventListener("keydown", function(e){
  if(e.key !== "Escape") return;
  _closeAllToolPops();
});
// 消息预览文本也可点开消息中心（与铃铛同效）
(function(){
  const mp = $("#msgPreview");
  if(mp) mp.onclick = function(){ const b = $("#btnMessages"); if(b) b.click(); };
})();
/* ---------- v1.5-A 语言切换绑定 ---------- */
const _cfgLangSel = $("#cfgLang");
if(_cfgLangSel){
  _cfgLangSel.onchange = ()=>{
    const ok = setLang(_cfgLangSel.value);
    if(ok){
      try{ toast(t("msg.langSwitched","已切换语言"), "ok"); }catch(e){ /* noop */ }
      /* SCENARIOS / TOOL_APPS 等模块级常量在加载时就按当时语言求值，只 render() 换不掉它们
         （实测切完仍残留 41 处可见中文，而全新加载只剩 17 处用户数据）。
         markDirty 只调度重渲染、各写入点同步落盘、beforeunload 另有备份兜底 → 重载不丢数据。 */
      try{ location.reload(); }catch(e){ /* 非浏览器环境：降级为已完成的内存切换 */ }
    }
  };
}
$("#btnClearMem").onclick = ()=>{ if(!confirm(t("mem.confirmClear","确定清空全部工作记忆？此操作不可恢复。"))) return; save(PREFIX+"memory",[]); updateAgentStatus(); toast(t("msg.memoryCleared","已清空工作记忆"),"ok"); };
$("#btnCancelGoal").onclick = ()=>{ const g=cancelGoal(); updateAgentStatus(); toast(g?(t("msg.goalCancelled","已取消目标「")+g.title+"」"):t("msg.noActiveGoal","当前无进行中目标"),"ok"); };

/* ---------- T3.4 通知提醒开关绑定 ---------- */
$("#cfgNotify").onchange = ()=>{
  const on = $("#cfgNotify").checked;
  setNotifyEnabled(on);
  if(on){
    toast(t("notify.enabled","已开启通知提醒"), "ok");
    startNotifyScheduler();
    try{ runNotifyCheck(); }catch(e){ /* noop */ }
  }else{
    toast(t("notify.disabled","已关闭通知提醒"), "ok");
  }
};

/* ---------- T3.2 联动规则管理事件绑定 ---------- */
/* 把指定 id 的链行替换为编辑行 */
function _enterChainEdit(id){
  const box = $("#linksBox"); if(!box) return;
  const links = getLinks();
  const l = links.find(x=>x.id===id); if(!l) return;
  const row = box.querySelector('.chain-row[data-id="'+id+'"]');
  if(!row) return;
  const tmp = document.createElement("div");
  tmp.innerHTML = sanitizeHtml(_renderChainEditRow(l));
  row.replaceWith(tmp.firstChild);
  const kwInput = box.querySelector('.chain-edit-row[data-edit-id="'+id+'"] .chain-edit-kw');
  if(kwInput){ kwInput.focus(); kwInput.select(); }
}
/* 退出编辑行，恢复为普通链行 */
function _exitChainEdit(id){
  const box = $("#linksBox"); if(!box) return;
  const editRow = box.querySelector('.chain-edit-row[data-edit-id="'+id+'"]');
  if(!editRow) return;
  const links = getLinks();
  const l = links.find(x=>x.id===id); if(!l) return;
  const tmp = document.createElement("div");
  tmp.innerHTML = sanitizeHtml(_renderChainRow(l));
  editRow.replaceWith(tmp.firstChild);
}
/* 添加新链按钮 */
$("#chainAddBtn").onclick = ()=>{
  const src = $("#chainAddSrc").value, kw = $("#chainAddKw").value, dst = $("#chainAddDst").value;
  const r = addCustomLink(src, kw, dst);
  if(!r.ok){ toast(t("msg.addFailed","添加失败")+"："+r.err, "warn"); return; }
  $("#chainAddKw").value = "";
  renderLinksBox();
  toast(t("chain.addedPrefix","已添加链：")+(SCENARIOS[src]&&SCENARIOS[src].name||src)+"→"+(SCENARIOS[dst]&&SCENARIOS[dst].name||dst), "ok");
};
/* 重置为默认按钮 */
$("#chainResetBtn").onclick = ()=>{
  if(!confirm(t("chain.confirmReset","确定重置为默认联动规则？自定义规则将被清除。"))) return;
  resetCustomLinks();
  renderLinksBox();
  toast(t("chain.resetDone","已重置为默认联动规则"), "ok");
};
/* linksBox 事件委托：删除 / 编辑关键词 / 编辑目标场景 / 启用切换 */
$("#linksBox").addEventListener("click", e=>{
  const target = e.target;
  const delBtn = target.closest("[data-del]");
  if(delBtn){ const id = delBtn.getAttribute("data-del"); if(!confirm(t("chain.confirmDelete", "确定删除这条联动规则？"))) return; removeCustomLink(id); renderLinksBox(); return; }
  const saveBtn = target.closest("[data-save]");
  if(saveBtn){
    const id = saveBtn.getAttribute("data-save");
    const editRow = saveBtn.closest(".chain-edit-row");
    const kw = editRow ? editRow.querySelector(".chain-edit-kw").value : "";
    const dst = editRow ? editRow.querySelector(".chain-edit-dst").value : "";
    const r = updateCustomLink(id, {kw, toSc: dst});
    if(!r.ok){ toast(t("msg.saveFailed", "保存失败：")+r.err, "warn"); return; }
    renderLinksBox();
    return;
  }
  const cancelBtn = target.closest("[data-cancel]");
  if(cancelBtn){ _exitChainEdit(cancelBtn.getAttribute("data-cancel")); return; }
  const editKw = target.closest("[data-edit-kw]");
  if(editKw){ _enterChainEdit(editKw.getAttribute("data-edit-kw")); return; }
  const editDst = target.closest("[data-edit-dst]");
  if(editDst){ _enterChainEdit(editDst.getAttribute("data-edit-dst")); return; }
});
$("#linksBox").addEventListener("change", e=>{
  const toggleEl = e.target;
  if(toggleEl.classList && toggleEl.classList.contains("chain-toggle")){
    const id = toggleEl.getAttribute("data-id");
    toggleCustomLink(id, toggleEl.checked);
    const row = toggleEl.closest(".chain-row");
    if(row){ row.classList.toggle("disabled", !toggleEl.checked); }
  }
});
$("#cmdOverlay").onclick = closeCmd;
$("#cmdInput").onkeydown = e=>{
  /* v3.7.8：↑↓ 改为**循环**（此前到顶/到底就停住，长列表里想回到第一条得狂按）。
     列表为空时不做处理，避免 cmdSel 变成 -1。 */
  const n = cmdItems.length;
  if(e.key==="ArrowDown"){ e.preventDefault(); if(!n) return; cmdSel=(cmdSel+1) % n; updateCmdSel(); }
  else if(e.key==="ArrowUp"){ e.preventDefault(); if(!n) return; cmdSel=(cmdSel-1+n) % n; updateCmdSel(); }
  else if(e.key==="Enter"){ e.preventDefault(); runCmd(cmdSel); }
  /* v3.7.10：Esc 分两级 —— 有查询词时先清空（常见于"打错了想重来"），空查询时才关闭面板。
     这样"清空"不需要全选删除，也避免误关面板丢掉最近使用上下文。 */
  else if(e.key==="Escape"){
    const inp=$("#cmdInput");
    if(inp && String(inp.value||"").trim()){ e.preventDefault(); inp.value=""; renderCmd(""); }
    else closeCmd();
  }
};
// L1：输入时实时过滤命令（openCmd 仅初次渲染空列表，此前打字不刷新）
$("#cmdInput").oninput = e=> renderCmd(e.target.value);

/* ---------- v1.4-E 协作/分享：设置抽屉新按钮事件绑定 ---------- */
/* 联动规则分享 / 导入 / 场景模板入口（按钮在 top.html 设置抽屉中声明）
 * 使用 nullish 守卫防御：测试环境若 DOM 尚未挂载对应按钮时不报错 */
const _btnChainShare = $("#btnChainShare"); if(_btnChainShare) _btnChainShare.onclick = openChainShareModal;
const _btnChainImport = $("#btnChainImport"); if(_btnChainImport) _btnChainImport.onclick = openChainImportModal;
const _btnSceneTemplate = $("#btnSceneTemplate"); if(_btnSceneTemplate) _btnSceneTemplate.onclick = openTemplateModal;

/* ---------- v1.6-C 数据可视化增强：甘特图 / 思维导图 / 自定义仪表盘按钮事件绑定 ---------- */
const _btnGantt = $("#btnGantt"); if(_btnGantt) _btnGantt.onclick = function(){ if(typeof openGanttModal === "function") openGanttModal(); };
const _btnGanttClose = $("#btnGanttClose"); if(_btnGanttClose) _btnGanttClose.onclick = function(){ if(typeof closeGanttModal === "function") closeGanttModal(); };
const _btnMindmap = $("#btnMindmap"); if(_btnMindmap) _btnMindmap.onclick = function(){ if(typeof openMindmapModal === "function") openMindmapModal(); };
const _btnMindmapClose = $("#btnMindmapClose"); if(_btnMindmapClose) _btnMindmapClose.onclick = function(){ if(typeof closeMindmapModal === "function") closeMindmapModal(); };
const _btnDashboard = $("#btnDashboard"); if(_btnDashboard) _btnDashboard.onclick = function(){ if(typeof openDashboardModal === "function") openDashboardModal(); };
const _btnDashboardClose = $("#btnDashboardClose"); if(_btnDashboardClose) _btnDashboardClose.onclick = function(){ if(typeof closeDashboardModal === "function") closeDashboardModal(); };
// 日历 / 自动化按钮绑定（之前从未接上：日历缺 modal + 无人调用 openAutomationModal）
const _btnCalendar = $("#btnCalendar");
if(_btnCalendar) _btnCalendar.onclick = function(){
  const m = $("#calendarModal");
  if(!m) return;
  const b = $("#calendarModalBody");
  if(b) b.innerHTML = sanitizeHtml(renderCalendarView(0));
  m.classList.add("show");
};
const _btnCalendarClose = $("#btnCalendarClose");
if(_btnCalendarClose) _btnCalendarClose.onclick = function(){ const m=$("#calendarModal"); if(m) m.classList.remove("show"); };

// 笃行 / 时间追踪 组件按钮（此前纯装饰，未绑定）
const _btnPomoStart = $("#btnPomoStart");
if(_btnPomoStart) _btnPomoStart.onclick = function(){ if(typeof startPomodoro === "function") startPomodoro(); };
const _btnPomoStop = $("#btnPomoStop");
if(_btnPomoStop) _btnPomoStop.onclick = function(){ if(typeof stopPomodoro === "function") stopPomodoro(); };
const _btnTrackerPause = $("#btnTrackerPause");
if(_btnTrackerPause) _btnTrackerPause.onclick = function(){ if(typeof pauseTracking === "function") pauseTracking(); };
const _btnTrackerStop = $("#btnTrackerStop");
if(_btnTrackerStop) _btnTrackerStop.onclick = function(){ if(typeof stopTracking === "function") stopTracking(); };
/* 弹窗背景点击关闭 */
(function setupVizModalBgClose(){
  ["ganttModal","mindmapModal","dashboardModal","calendarModal"].forEach(function(id){
    const m = document.getElementById(id);
    if(!m || m._bgCloseBound) return;
    m._bgCloseBound = true;
    m.addEventListener("click", function(e){
      if(e.target === m) m.classList.remove("show");
    });
  });
})();

/* ---------- v1.5-B 插件市场：注册插件按钮事件绑定 ---------- */
const _btnPluginAdd = $("#pluginAddBtn"); if(_btnPluginAdd) _btnPluginAdd.onclick = ()=>{
  const txt = $("#pluginAddJson").value.trim();
  if(!txt){ toast(t("plugin.pasteFirst","请先粘贴插件 JSON 定义"), "warn"); return; }
  const r = registerPluginFromJson(txt);
  if(!r.ok){ toast(r.err||t("api.registerFailed","注册失败"), "warn"); return; }
  $("#pluginAddJson").value = "";
  renderPluginBox();
  toast(t("plugin.registeredPrefix","已注册插件「")+r.id+t("plugin.registeredSuffix","」"), "ok");
};

/* ---------- v1.5-C 主题系统：主题编辑器按钮事件绑定 ---------- */
const _btnThemeNew = $("#btnThemeNew"); if(_btnThemeNew) _btnThemeNew.onclick = ()=>{ _openThemeEditor(null); };
const _btnThemeSave = $("#btnThemeSave"); if(_btnThemeSave) _btnThemeSave.onclick = ()=>{ _saveThemeFromEditor(); };
const _btnThemeCancel = $("#btnThemeCancel"); if(_btnThemeCancel) _btnThemeCancel.onclick = ()=>{ _closeThemeEditor(); };
const _btnThemeExport = $("#btnThemeExport"); if(_btnThemeExport) _btnThemeExport.onclick = ()=>{ _exportCurrentTheme(); };
const _btnThemeImport = $("#btnThemeImport"); if(_btnThemeImport) _btnThemeImport.onclick = ()=>{
  const area = $("#themeImportArea"); if(area) area.style.display = "block";
};
const _btnThemeImportConfirm = $("#btnThemeImportConfirm"); if(_btnThemeImportConfirm) _btnThemeImportConfirm.onclick = ()=>{ _importThemeFromJson(); };
const _btnThemeImportCancel = $("#btnThemeImportCancel"); if(_btnThemeImportCancel) _btnThemeImportCancel.onclick = ()=>{
  const area = $("#themeImportArea"); if(area) area.style.display = "none";
};
/* 主题选择下拉即时切换（v1.9.7 修复：所有主题统一即时生效。
   原 bug：仅特殊主题即时生效、light/dark/system 需点「保存设置」才有反应（历史记录，contrast 主题已于 v3.1.1 移除），
   表现为「点暗色未生效」「高对比度后再点亮/暗未生效」。
   统一路由：system → cfg+applyTheme（保留跟随系统语义）；其余 → setTheme（内部持久化+同步双状态源） */
const _cfgThemeSel = $("#cfgTheme");
if(_cfgThemeSel){
  _cfgThemeSel.onchange = ()=>{
    const v = _cfgThemeSel.value;
    if(!v) return;
    if(v === "system"){
      const cfg = getCfg(); cfg.theme = "system";
      try{ save(PREFIX+"cfg", cfg); }catch(e){}
      try{ localStorage.setItem(PREFIX + "theme", "system"); }catch(e2){ /* 静默降级 */ }
      applyTheme();
      try{ toast(t("theme.switchedSystem","已切换为跟随系统主题"), "ok"); }catch(e){}
    }else{
      if(typeof setTheme === "function") setTheme(v); // 全部预置主题与自定义统一走 setTheme（v3.1.1 起预置主题含 aurora；contrast 已移除）
      try{ toast(t("theme.switchedPrefix","已切换主题：") + (_cfgThemeSel.selectedOptions[0] && _cfgThemeSel.selectedOptions[0].textContent || v), "ok"); }catch(e){}
    }
    try{ updateTodoBar(); }catch(e3){ /* 消息栏预览非关键路径 */ }
  };
}

/* 任务卡片「分享」按钮：全局事件委托（绑在 #main 静态容器，不随 innerHTML 重建丢失）
 * data-share 属性携带任务 id，点击后生成分享链接并复制到剪贴板 */
(function setupTaskShareDelegate(){
  const main = $("#main");
  if(!main || main._shareBound) return;
  main._shareBound = true;
  main.addEventListener("click", (e)=>{
    const btn = e.target.closest("[data-share]");
    if(!btn) return;
    const id = btn.getAttribute("data-share");
    const tasks = getTasks();
    const task = tasks.find(x => x.id === id);
    if(!task){ toast(t("msg.taskNotFound", "任务不存在"), "warn"); return; }
    const link = generateShareLink(task);
    if(!link){ toast(t("msg.shareLinkFail", "生成分享链接失败"), "warn"); return; }
    // 复制到剪贴板
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(link).then(()=>{
        toast(t("msg.shareLinkCopied", "分享链接已复制到剪贴板"), "ok");
      }).catch(()=>{
        // clipboard API 失败时回退到选中文本提示
        toast(t("msg.copyFailed", "复制失败，请手动复制链接"), "warn");
        try{ window.prompt(t("msg.copyShareLink", "复制此链接分享任务："), link); }catch(e2){ /* noop */ }
      });
    }else{
      try{ window.prompt(t("msg.copyShareLink", "复制此链接分享任务："), link); }catch(e2){ /* noop */ }
    }
  });
})();

/* 启动时检测 URL hash 中的 #share= 分享链接，展示只读任务卡片 */
/* 改为在 startup 后异步执行（setTimeout 0），避免模块加载阶段同步调用影响 jsdom 测试初始化 */
setTimeout(function(){ try{ checkSharedTaskOnLoad(); }catch(e){ /* noop */ } }, 0);

// ===== v1.4-F PWA 增强：离线指示 / 后台同步 / 安装弹窗 / Web Push =====
/* ---------- 离线操作同步队列（localStorage 兜底，SW 端用 IndexedDB） ---------- */
/**
 * 同步队列存储键（页面端用 localStorage 兜底；SW 端用 IndexedDB）
 */
const SYNC_QUEUE_KEY = PREFIX + "syncQueue";
const SYNC_TAG = "sync-tasks";

/**
 * 读取同步队列（页面端 localStorage 副本）。
 * @returns {Array<{op:string,payload:*,ts:number,id?:number}>}
 */
function getSyncQueue(){
  try { return load(SYNC_QUEUE_KEY, []) || []; } catch(e){ return []; }
}

/**
 * 持久化同步队列到 localStorage。
 * @param {Array} q - 队列数组
 */
function _saveSyncQueue(q){
  try { save(SYNC_QUEUE_KEY, q); } catch(e){ /* 静默 */ }
}

/**
 * 把离线操作入队（同时尝试注册 Background Sync）。
 * @param {string} op - 操作名（如 'task.create' / 'task.complete'）
 * @param {*} payload - 操作载荷
 * @returns {{ok:boolean, queued:number}} 入队结果与当前队列长度
 */
function enqueueSync(op, payload){
  try {
    const q = getSyncQueue();
    q.push({ op: op, payload: payload, ts: Date.now() });
    _saveSyncQueue(q);
    // 尝试注册 Background Sync（浏览器不支持时降级为 online 事件触发）
    registerBackgroundSync();
    return { ok: true, queued: q.length };
  } catch(e){
    if (typeof pushDiag === "function") pushDiag("error", "enqueueSync failed: "+(e&&e.message||e), {where:"enqueueSync"});
    return { ok: false, queued: -1 };
  }
}

/**
 * 清空同步队列（同步成功后调用）。
 */
function clearSyncQueue(){
  _saveSyncQueue([]);
}

/**
 * 注册 Background Sync（浏览器不支持时静默降级，online 事件兜底）。
 * @returns {Promise<boolean>} 是否注册成功
 */
async function registerBackgroundSync(){
  try {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return false;
    const reg = await navigator.serviceWorker.ready;
    if (!reg || !reg.sync || typeof reg.sync.register !== "function") return false;
    await reg.sync.register(SYNC_TAG);
    return true;
  } catch(e){ return false; }
}

/**
 * 触发同步：遍历队列逐条处理（页面端实现，作为 Background Sync 不可用时的降级）。
 * v1.11.1 [M6] 修复：未配置服务器端点时不再"模拟成功并清空"（原实现会把队列静默
 * 丢弃并谎报已同步）。真实部署：设置 SYNC_ENDPOINT 后按注释中的 fetch 实现发送。
 * @returns {Promise<{ok:number, fail:number, skipped:boolean}>}
 */
const SYNC_ENDPOINT = ""; // 真实部署时填写，如 "https://your-server/api/sync"
async function flushSyncQueue(){
  const q = getSyncQueue();
  if (!q.length) return { ok: 0, fail: 0, skipped: false };
  if (!SYNC_ENDPOINT) {
    // 未配置端点：保留队列（不清空、不谎报成功），交由调用方给出诚实提示
    return { ok: 0, fail: q.length, skipped: true };
  }
  let okCount = 0, failCount = 0;
  for (const item of q) {
    try {
      /* v3.7.53：此前这里只有 `okCount++`（真正的 fetch 被注释掉），而结尾 failCount===0 时
         会 clearSyncQueue() —— 一旦部署方填了 SYNC_ENDPOINT，就会**谎报成功并把整条队列丢掉**。
         与 v1.11.1「不谎报已同步」同一原则：改为真发真判，只有 2xx 才算成功、才允许清队列。 */
      const r = await fetch(SYNC_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item)
      });
      if (r && r.ok) okCount++; else failCount++;
    } catch(e) { failCount++; }
  }
  if (failCount === 0) clearSyncQueue();
  return { ok: okCount, fail: failCount, skipped: false };
}

/* ---------- 网络状态检测与离线指示横幅 ---------- */
/**
 * 显示离线横幅。
 */
function showOfflineBanner(){
  const el = $("#offlineBanner"); if(!el) return;
  el.classList.add("show");
  const retry = $("#btnRetrySync"); if(retry) retry.disabled = true;
}

/**
 * 隐藏离线横幅。
 */
function hideOfflineBanner(){
  const el = $("#offlineBanner"); if(!el) return;
  el.classList.remove("show");
}

/**
 * 更新离线横幅的"重试同步"按钮状态。
 * @param {boolean} syncing - 是否正在同步
 */
function setSyncRetryState(syncing){
  const btn = $("#btnRetrySync"); if(!btn) return;
  btn.disabled = !!syncing;
  btn.textContent = syncing ? t("pwa.syncing","同步中…") : t("pwa.syncNow","立即同步");
}

/**
 * 检测当前网络状态并更新 UI。
 * @returns {boolean} 是否在线
 */
function updateOnlineStatus(){
  const online = (typeof navigator !== "undefined") ? navigator.onLine : true;
  if (online) {
    hideOfflineBanner();
  } else {
    showOfflineBanner();
  }
  return online;
}

/**
 * 初始化网络状态监听：绑定 online/offline 事件 + 初始状态检测。
 * 在线恢复时自动触发同步队列 flush + toast 提示。
 */
function initNetworkMonitor(){
  if (typeof window === "undefined") return;
  // 初始状态
  updateOnlineStatus();
  // 在线恢复：隐藏横幅 + 触发同步 + toast
  window.addEventListener("online", async () => {
    hideOfflineBanner();
    try {
      const q = getSyncQueue();
      if (q.length > 0) {
        setSyncRetryState(true);
        const r = await flushSyncQueue();
        setSyncRetryState(false);
        // v1.11.1 [M6]：未配置同步端点时如实提示，不谎报"已同步"
        if (r.skipped) { try { toast(t("pwa.onlineSyncSkippedPrefix","已恢复在线（未配置同步服务器，")+r.fail+t("pwa.onlineSyncSkippedSuffix"," 条离线操作仅保存在本地）"), "warn"); } catch(e){ /* noop */ } }
        else { try { toast(t("pwa.onlineSyncedPrefix","已恢复在线，已同步 ")+r.ok+t("pwa.onlineSyncedSuffix"," 条离线操作"), "ok"); } catch(e){ /* noop */ } }
      } else {
        try { toast(t("notify.online","已恢复在线"), "ok"); } catch(e){ /* noop */ }
      }
    } catch(e) {
      setSyncRetryState(false);
      try { toast(t("pwa.onlineSyncFailed","已恢复在线（同步失败，待下次重试）"), "warn"); } catch(e2){ /* noop */ }
    }
  });
  // 离线：显示横幅
  window.addEventListener("offline", () => {
    showOfflineBanner();
    // v1.11.1 [M6]：不再承诺"自动同步"（当前未配置同步服务器）
    try { toast(t("pwa.offlineLocal","已离线，操作将保存在本地"), "warn"); } catch(e){ /* noop */ }
  });
}

/* ---------- 安装体验优化：beforeinstallprompt 捕获 + 自定义弹窗 ---------- */
/**
 * 全局 deferredPrompt：beforeinstallprompt 事件捕获后暂存。
 */
let _deferredInstallPrompt = null;

/**
 * 检测应用是否已安装（display-mode: standalone 或 navigator.standalone）。
 * @returns {boolean}
 */
function isAppInstalled(){
  try {
    // CSS 媒体查询：display-mode: standalone / fullscreen / minimal-ui
    if (window.matchMedia && typeof window.matchMedia === "function") {
      if (window.matchMedia("(display-mode: standalone)").matches) return true;
      if (window.matchMedia("(display-mode: fullscreen)").matches) return true;
      if (window.matchMedia("(display-mode: minimal-ui)").matches) return true;
    }
    // iOS Safari standalone
    if (typeof navigator !== "undefined" && navigator.standalone === true) return true;
    return false;
  } catch(e){ return false; }
}

/**
 * 显示自定义安装弹窗。
 */
function showInstallModal(){
  const el = $("#installModal"); if(!el) return;
  el.classList.add("show");
}

/**
 * 隐藏自定义安装弹窗。
 */
function hideInstallModal(){
  const el = $("#installModal"); if(!el) return;
  el.classList.remove("show");
}

/**
 * 显示顶栏安装按钮（仅未安装 + 已捕获 beforeinstallprompt 时调用）。
 */
function showInstallButton(){
  const btn = $("#btnInstall"); if(!btn) return;
  btn.classList.add("show");
}

/**
 * 隐藏顶栏安装按钮。
 */
function hideInstallButton(){
  const btn = $("#btnInstall"); if(!btn) return;
  btn.classList.remove("show");
}

/**
 * 触发安装：调用 deferredPrompt.prompt()，等待用户选择。
 * @returns {Promise<boolean>} 用户是否接受安装
 */
async function promptInstall(){
  if (!_deferredInstallPrompt) return false;
  try {
    await _deferredInstallPrompt.prompt();
    const choice = await _deferredInstallPrompt.userChoice;
    const accepted = (choice && choice.outcome === "accepted");
    // 用完后清空 deferredPrompt（一次性 API）
    _deferredInstallPrompt = null;
    hideInstallButton();
    hideInstallModal();
    if (accepted) {
      try { toast(t("pwa.installing","安装中…请稍候"), "ok"); } catch(e){ /* noop */ }
    }
    return accepted;
  } catch(e) {
    _deferredInstallPrompt = null;
    return false;
  }
}

/**
 * 初始化安装体验：捕获 beforeinstallprompt + appinstalled 事件。
 * 已安装时不显示安装提示。
 */
function initInstallPrompt(){
  if (typeof window === "undefined") return;
  // 已安装：不显示任何安装提示
  if (isAppInstalled()) {
    hideInstallButton();
    return;
  }
  // 捕获 beforeinstallprompt：阻止默认提示，存为 deferredPrompt
  window.addEventListener("beforeinstallprompt", (e) => {
    try { e.preventDefault(); } catch(e2){ /* noop */ }
    _deferredInstallPrompt = e;
    // 显示顶栏安装按钮（用户可主动点击触发安装弹窗）
    showInstallButton();
  });
  // 安装成功：记录 + 隐藏按钮/弹窗
  window.addEventListener("appinstalled", () => {
    _deferredInstallPrompt = null;
    hideInstallButton();
    hideInstallModal();
    try { toast(t("pwa.installedToDesktop","已安装到桌面，可从桌面快捷启动"), "ok"); } catch(e){ /* noop */ }
    // 记录已安装状态（持久化，下次启动不再提示）
    try { save(PREFIX + "pwa_installed", { ts: Date.now() }); } catch(e2){ /* noop */ }
  });
}

/* ---------- Web Push 订阅框架 ---------- */
/**
 * VAPID 公钥占位符（真实部署替换为服务器生成的 VAPID 公钥，base64url 编码）。
 * 当前为占位符，订阅会成功但服务器端无法推送（框架模式）。
 */
const VAPID_PUBLIC_KEY = "BEl62iUgOK0uOQ5h8J5qI9hT8j9hT8j9hT8j9hT8j9hT8j9hT8j9hT8j9hT8j9hT";

/**
 * 把 base64url 字符串转为 Uint8Array（PushManager.subscribe 需要 applicationServerKey 为 Uint8Array）。
 * @param {string} base64 - base64url 编码的字符串
 * @returns {Uint8Array}
 */
function _base64ToUint8Array(base64){
  try {
    const padding = "=".repeat((4 - base64.length % 4) % 4);
    const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
    const raw = atob(b64);
    const arr = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
    return arr;
  } catch(e){ return new Uint8Array(0); }
}

/**
 * 检测浏览器是否支持 Push API。
 * @returns {boolean}
 */
function isPushSupported(){
  try {
    return (typeof navigator !== "undefined" && "serviceWorker" in navigator &&
            "PushManager" in window && "Notification" in window);
  } catch(e){ return false; }
}

/**
 * 获取当前 Push 订阅状态。
 * @returns {Promise<{subscribed:boolean, subscription:PushSubscription|null}>}
 */
async function getPushSubscriptionState(){
  if (!isPushSupported()) return { subscribed: false, subscription: null };
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return { subscribed: !!sub, subscription: sub };
  } catch(e){ return { subscribed: false, subscription: null }; }
}

/**
 * 订阅 Web Push：请求通知权限 + 调用 pushManager.subscribe。
 * @returns {Promise<{ok:boolean, err?:string, subscription?:PushSubscription}>}
 */
async function subscribePush(){
  if (!isPushSupported()) return { ok: false, err: t("pwa.pushUnsupported","浏览器不支持 Web Push") };
  try {
    // 1. 请求通知权限
    if (Notification.permission === "default") {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return { ok: false, err: t("pwa.notifyDenied","通知权限被拒绝") };
    } else if (Notification.permission === "denied") {
      return { ok: false, err: t("pwa.notifyDeniedHint","通知权限被拒绝，请在浏览器设置中允许") };
    }
    // 2. 调用 pushManager.subscribe
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: _base64ToUint8Array(VAPID_PUBLIC_KEY)
    });
    // 3. 真实部署应把 sub POST 到服务器 push-subscription endpoint
    // 框架模式：仅持久化订阅状态到 localStorage
    try { save(PREFIX + "push_subscription", { endpoint: sub.endpoint, ts: Date.now() }); } catch(e){ /* noop */ }
    return { ok: true, subscription: sub };
  } catch(e){
    return { ok: false, err: (e && e.message) || String(e) };
  }
}

/**
 * 取消订阅 Web Push。
 * @returns {Promise<{ok:boolean, err?:string}>}
 */
async function unsubscribePush(){
  try {
    const state = await getPushSubscriptionState();
    if (!state.subscription) return { ok: true }; // 本就未订阅
    const ok = await state.subscription.unsubscribe();
    if (ok) {
      try { localStorage.removeItem(PREFIX + "push_subscription"); } catch(e){ /* noop */ }
    }
    return { ok: ok };
  } catch(e){
    return { ok: false, err: (e && e.message) || String(e) };
  }
}

/**
 * 发送测试通知（本地 Notification，不经过推送服务器）。
 * @returns {Promise<{ok:boolean, err?:string}>}
 */
async function sendTestPushNotification(){
  try {
    if (typeof Notification === "undefined") return { ok: false, err: t("pwa.notifyUnsupported","浏览器不支持通知") };
    if (Notification.permission !== "granted") {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return { ok: false, err: t("pwa.notifyDenied","通知权限被拒绝") };
    }
    // 优先通过 SW 显示（与 push 事件一致），降级为页面 Notification
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      try {
        const reg = await navigator.serviceWorker.ready;
        if (reg && typeof reg.showNotification === "function") {
          await reg.showNotification(t("app.name") + t("pwa.testNotifySuffix"," · 测试通知"), {
            body: t("pwa.testNotifyBody","如果你看到这条通知，说明 Web Push 框架工作正常。"),
            icon: "./icon.svg",
            tag: "wb-push-test"
          });
          return { ok: true };
        }
      } catch(e){ /* 降级 */ }
    }
    new Notification(t("app.name") + t("pwa.testNotifySuffix"," · 测试通知"), {
      body: t("pwa.testNotifyBody","如果你看到这条通知，说明 Web Push 框架工作正常。"),
      icon: "./icon.svg",
      tag: "wb-push-test"
    });
    return { ok: true };
  } catch(e){
    return { ok: false, err: (e && e.message) || String(e) };
  }
}

/**
 * 更新 Push 订阅 UI（开关状态 + 文案 + 按钮可用性）。
 */
async function refreshPushUI(){
  const cb = $("#cfgPush");
  const statusEl = $("#pushStatus");
  const subBtn = $("#btnPushSubscribe");
  const unsubBtn = $("#btnPushUnsubscribe");
  const testBtn = $("#btnPushTest");
  if (!isPushSupported()) {
    if (cb) cb.disabled = true;
    if (subBtn) subBtn.disabled = true;
    if (unsubBtn) unsubBtn.disabled = true;
    if (testBtn) testBtn.disabled = true;
    if (statusEl) statusEl.textContent = t("pwa.pushApiUnsupported","浏览器不支持 Web Push API。");
    return;
  }
  const state = await getPushSubscriptionState();
  if (cb) cb.checked = state.subscribed;
  if (subBtn) subBtn.disabled = state.subscribed;
  if (unsubBtn) unsubBtn.disabled = !state.subscribed;
  if (testBtn) testBtn.disabled = !state.subscribed;
  if (subBtn) subBtn.classList.toggle("active", state.subscribed);
  if (statusEl) {
    if (state.subscribed) {
      statusEl.textContent = t("pwa.subscribedEndpoint","已订阅推送通知。endpoint: ") + (state.subscription && state.subscription.endpoint ? state.subscription.endpoint.slice(0, 60) + "…" : "(unknown)");
    } else {
      statusEl.textContent = t("pwa.notSubscribed","未订阅。开启后将向浏览器推送任务到期与断链提醒。");
    }
  }
}

/**
 * 初始化 Push 订阅 UI 事件绑定。
 */
function initPushUI(){
  const subBtn = $("#btnPushSubscribe");
  const unsubBtn = $("#btnPushUnsubscribe");
  const testBtn = $("#btnPushTest");
  const cb = $("#cfgPush");
  if (subBtn) subBtn.onclick = async () => {
    const r = await withLoading(subBtn, subscribePush());
    if (r.ok) {
      try { toast(t("pwa.subscribed","已订阅推送通知"), "ok"); } catch(e){ /* noop */ }
    } else {
      try { toast(t("pwa.subscribeFailedPrefix","订阅失败：") + (r.err || t("tool.unknownErrorMsg", "未知错误")), "warn"); } catch(e){ /* noop */ }
    }
    refreshPushUI();
  };
  if (unsubBtn) unsubBtn.onclick = async () => {
    const r = await unsubscribePush();
    if (r.ok) {
      try { toast(t("pwa.unsubscribed","已取消推送订阅"), "ok"); } catch(e){ /* noop */ }
    } else {
      try { toast(t("pwa.unsubscribeFailedPrefix","取消失败：") + (r.err || t("tool.unknownErrorMsg", "未知错误")), "warn"); } catch(e){ /* noop */ }
    }
    refreshPushUI();
  };
  if (testBtn) testBtn.onclick = async () => {
    const r = await sendTestPushNotification();
    if (!r.ok) {
      try { toast(t("pwa.testNotifyFailedPrefix","测试通知失败：") + (r.err || t("tool.unknownErrorMsg", "未知错误")), "warn"); } catch(e){ /* noop */ }
    }
  };
  if (cb) cb.onchange = async () => {
    if (cb.checked) {
      const r = await subscribePush();
      if (!r.ok) {
        cb.checked = false;
        try { toast(t("pwa.subscribeFailedPrefix","订阅失败：") + (r.err || t("tool.unknownErrorMsg", "未知错误")), "warn"); } catch(e){ /* noop */ }
      } else {
        try { toast(t("pwa.subscribed","已订阅推送通知"), "ok"); } catch(e){ /* noop */ }
      }
    } else {
      const r = await unsubscribePush();
      if (!r.ok) {
        try { toast(t("pwa.unsubscribeFailedPrefix","取消失败：") + (r.err || t("tool.unknownErrorMsg", "未知错误")), "warn"); } catch(e){ /* noop */ }
      } else {
        try { toast(t("pwa.unsubscribed","已取消推送订阅"), "ok"); } catch(e){ /* noop */ }
      }
    }
    refreshPushUI();
  };
  // 初始 UI 状态
  refreshPushUI();
}

/* ---------- 安装弹窗 / 顶栏安装按钮事件绑定 ---------- */
function bindInstallUI(){
  const btnConfirm = $("#btnInstallConfirm");
  const btnLater = $("#btnInstallLater");
  const btnTopInstall = $("#btnInstall");
  if (btnConfirm) btnConfirm.onclick = () => { promptInstall(); };
  if (btnLater) btnLater.onclick = () => { hideInstallModal(); };
  if (btnTopInstall) btnTopInstall.onclick = () => {
    // 顶栏安装按钮：有 deferredPrompt 时直接触发安装，否则显示弹窗
    if (_deferredInstallPrompt) {
      showInstallModal();
    } else {
      // 没有 deferredPrompt（可能浏览器不支持或已安装）：提示用户
      try { toast(t("pwa.noInstallPrompt","当前浏览器未提供安装提示，可使用浏览器菜单「添加到主屏幕/安装应用」"), "warn"); } catch(e){ /* noop */ }
    }
  };
  // ESC 关闭安装弹窗
  if (typeof document !== "undefined") {
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        const modal = $("#installModal");
        if (modal && modal.classList.contains("show")) hideInstallModal();
      }
    });
  }
}

/* ---------- 离线横幅"立即同步"按钮 ---------- */
function bindOfflineBanner(){
  const btn = $("#btnRetrySync");
  if (btn) btn.onclick = async () => {
    if (btn.disabled) return;
    setSyncRetryState(true);
    try {
      const r = await flushSyncQueue();
      // v1.11.1 [M6]：未配置同步端点时如实提示，不谎报"已同步"
      if (r.skipped) { try { toast(t("pwa.syncSkippedPrefix","未配置同步服务器，")+r.fail+t("pwa.syncSkippedSuffix"," 条操作仅保存在本地"), "warn"); } catch(e){ /* noop */ } }
      else { try { toast(t("pwa.syncedPrefix","已同步 ")+r.ok+t("pwa.syncedSuffix"," 条操作")+(r.fail>0?t("pwa.syncedFailMid","，")+r.fail+t("pwa.syncedFailSuffix"," 条失败"):""), r.fail>0?"warn":"ok"); } catch(e){ /* noop */ } }
    } catch(e) {
      try { toast(t("pwa.syncFailedRetry","同步失败，请稍后重试"), "warn"); } catch(e2){ /* noop */ }
    }
    setSyncRetryState(false);
  };
}

/* ---------- v1.4-F 初始化入口：在 DOM 就绪后绑定所有 PWA 增强 ---------- */
function initPWAEnhancements(){
  try {
    initNetworkMonitor();
    initInstallPrompt();
    bindInstallUI();
    bindOfflineBanner();
    initPushUI();
  } catch(e){
    if (typeof pushDiag === "function") pushDiag("error", "initPWAEnhancements failed: "+(e&&e.message||e), {where:"initPWA"});
  }
}

// DOM 已就绪（脚本在 body 末尾执行）时立即初始化；jsdom 测试环境也兼容
if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initPWAEnhancements);
  } else {
    initPWAEnhancements();
  }
}

// ===== Bootstrap (启动) =====
/* ---------- 启动 ---------- */
// PWA Service Worker 注册 + 更新检测（失败静默；jsdom/Electron 无 serviceWorker 时自动跳过）
// v1.9.3g：主动 reg.update() + updatefound/statechange 监听，新 SW 就绪后 toast「点击刷新」，
// 解决「改了但用户一直看旧缓存」的交付缺口（页脚 b{BUILD_TAG} 可自证版本）。
let _swReloadPrompted = false;
function _promptSwReload(){
  if(_swReloadPrompted) return;
  _swReloadPrompted = true;
  const toastEl = toast(t("msg.newVersionReady", "新版本已就绪，点击刷新"), "ok");
  if(toastEl){
    toastEl.style.cursor = "pointer";
    toastEl.addEventListener("click", function(){ try{ location.reload(); }catch(e){ /* noop */ } });
  }
}
if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
  // v3.6.4：updateViaCache:'none' —— SW 脚本自身也绕过 HTTP 缓存，让每次导航都真实比对字节，
  // 避免 GitHub Pages 缓存头（约 10 分钟）叠加浏览器节流把 SW 更新检查推迟到 ~24h 之后。
  navigator.serviceWorker.register("./service-worker.js", { updateViaCache: "none" }).then(function(reg){
    // 主动检查更新（浏览器默认约 24h 才检查一次；每次打开都检查，保证修复尽快可见）
    try{ reg.update(); }catch(e){ /* noop */ }
    reg.addEventListener("updatefound", function(){
      const nw = reg.installing; if(!nw) return;
      nw.addEventListener("statechange", function(){
        // skipWaiting 后新 SW 会直接 activated；此时刷新即可命中新缓存
        if(nw.state === "activated") _promptSwReload();
      });
    });
    // 多标签页场景：另一标签已触发更新且新 SW 已就绪
    if(reg.waiting) _promptSwReload();
  }).catch(function () { /* 静默失败 */ });

  /* v3.6.2 版本哨兵：SW 死锁自救——cache-first 下旧 SW 可能一直拿旧 HTML 应答，
   * updatefound 事件被节流/错过时用户永远看不到新版（09-05~09-12 多次"改了不生效"事故根因）。
   * 启动时用 cache:'no-store' 直连网络拉线上 HTML，对比页内 BUILD_TAG；
   * 不一致 => 清空全部 Cache Storage + reg.update() + toast 提示刷新。绕过 SW，必然拿到真版本。 */
  (function versionSentinel(){
    try{
      fetch("./agent-workbench.html", { cache: "no-store", credentials: "omit" })
        .then(function(r){ return r.ok ? r.text() : null; })
        .then(function(txt){
          if(!txt) return;
          var mLive = txt.match(/BUILD_TAG\s*=\s*"([^"]+)"/);
          var mMine = String(BUILD_TAG || "");
          if(!mLive || !mLive[1] || mLive[1] === mMine) return;
          // 线上有新版本但本页还是旧的——强制清缓存并促 SW 立即更新
          if(caches && caches.keys){
            caches.keys().then(function(ks){
              return Promise.all(ks.map(function(k){ return caches.delete(k); }));
            }).then(function(){
              try{ navigator.serviceWorker.getRegistration().then(function(rg){ if(rg) rg.update(); }); }catch(e){}
              var el = toast(t("msg.newVersionReady", "新版本已就绪，点击刷新"), "ok");
              if(el){
                el.style.cursor = "pointer";
                el.style.fontWeight = "700";
                el.addEventListener("click", function(){ try{ location.reload(); }catch(e){} });
              }
            }).catch(function(){});
          }
        })
        .catch(function(){ /* 离线/网络错误：静默，下次再查 */ });
    }catch(e){ /* 环境不支持：静默 */ }
  })();
}
migrate();
seed();

(async function startup(){
  try{ await initCrypto(); }catch(e){ /* 降级明文，不阻塞启动 */ }
  // v1.11.2 认证补码：OAuth2 回调闭环——URL 带 ?code&state 时换 token（正常启动零开销，fire-and-forget）
  try{ _oauth2HandleCallback().catch(function(e9){ try{ pushDiag("error", "oauth2 callback: "+(e9&&e9.message||e9), {where:"oauth2"}); }catch(e10){} }); }catch(_){ }
  // 架构项①：IndexedDB 持久镜像——启动时把 localStorage 用户数据镜像到 IDB（异步，不阻塞；仅镜像不自动恢复，恢复入口在设置页）
  initIdb().catch(() => {});
  cleanupRecycle(); // T2：启动时按策略清理回收站超期任务（off 时不动作）
  // v1.9.7 修复：恢复上次主题。setTheme 路径（aurora/sepia/elegant/matrix/自定义）持久化于 localStorage.theme，
  // 原 boot 只调 applyTheme()（读 cfg.theme）会把特殊主题冲回亮/暗——重启后高对比度/护眼丢失。
  // 统一路由：特殊主题走 setTheme 复原；light/dark/system 走 applyTheme（system 保留跟随系统）。
  const _savedTheme = (typeof getCurrentTheme === "function") ? getCurrentTheme() : null;
  if(_savedTheme && _savedTheme !== "light" && _savedTheme !== "dark" && _savedTheme !== "system"){
    try{ setTheme(_savedTheme); }catch(e){ applyTheme(); }
  }else{
    applyTheme();
  }
  setupSideToggle(); // 侧边栏折叠按钮事件委托 + 恢复持久化折叠状态
  setupSideMenu();   // v2.1.0：侧栏两级菜单点击分发（事件委托，跨 renderSide 重渲染有效）
  setupMobNav();     // v2.1.0：移动端底栏 + 底部抽屉事件（委托绑定，幂等）
  // v1.10.0b：正文顶部消息通知栏展开/收起（默认收起，点击预览/下拉按钮可展开前 3 条 + footer）
  try{ if(typeof initTodoBar === "function") initTodoBar(); }catch(_){ }
  // v1.10.0：应用 popover 三模态的关闭按钮 + 初始恢复用户偏好（指针特效/萌宠）
  try{
    const _bw1 = $("#btnWeatherClose"); if(_bw1) _bw1.onclick = function(){ if(typeof closeWeatherModal === "function") closeWeatherModal(); };
    const _bw2 = $("#btnAlarmClose"); if(_bw2) _bw2.onclick = function(){ if(typeof closeAlarmModal === "function") closeAlarmModal(); };
    const _bw3 = $("#btnPetClose"); if(_bw3) _bw3.onclick = function(){ if(typeof closePetModal === "function") closePetModal(); };
    if(typeof initPointerFxFromPref === "function") initPointerFxFromPref();
    if(typeof initPetFromPref === "function") initPetFromPref();
  }catch(_){ }
  try{ bindChatPanel(); }catch(e){ pushDiag("error","bindChatPanel init: "+(e&&e.message||e),{where:"bindChatPanel"}); } // 右侧 AI 聊天面板事件绑定（三栏布局第三栏，静态 HTML 一次性绑定）
  // v2.0：会话管理弹窗绑定 + 聊天面板头部「会话」入口
  try{
    bindSessionModal();
    const _sessBtn = $("#chatSessionBtn"); if(_sessBtn) _sessBtn.onclick = function(){ if(typeof openSessionModal === "function") openSessionModal(); };
  }catch(e){ pushDiag("error","sessionModal init: "+(e&&e.message||e),{where:"sessionModal"}); }
  try{ setupModalA11yBase(); }catch(e){ pushDiag("error","modalA11y init: "+(e&&e.message||e),{where:"modalA11y"}); } // P0② 模态框统一 Esc/遮罩/焦点陷阱基座
  setupRipple(); // T4.3 底部导航点击涟漪效果（事件委托）
  setupMobileGestures(); // T4.3 移动端手势：左滑下一个/右滑上一个/右滑左边缘打开侧边栏（仅移动端启用）
  applyLandscapeFold(); // T4.3 移动端横屏自动折叠侧边栏
  // T4.3 横屏/竖屏切换时重新检测折叠状态
  // v1.4-B 性能优化：resize 加 200ms 防抖，避免拖拽窗口时频繁重算
  if(typeof window !== "undefined"){
    const _resizeDebounced = debounce(applyLandscapeFold, 200);
    window.addEventListener("resize", _resizeDebounced);
    window.addEventListener("orientationchange", applyLandscapeFold); // orientationchange 无需防抖（低频）
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

/* ---------- v1.8.3 性能优化：重模块懒初始化入口 ----------
 * 以下重模块均为「自动初始化」（IIFE 或模块加载时执行），不在 30-bootstrap-start.js 显式调用 init：
 *   - 53-ai-deep        (AI 深度增强：Agent 自主执行 / RAG / 代码审查)
 *   - 54-offline-ai     (离线 AI：WebLLM / ONNX / 模型缓存)
 *   - 55-ml-predict     (ML 预测：行为预测 / 生产力评分 / 推荐引擎)
 *   - 56-smart-schedule (智能排期：任务评分 / 能量匹配 / 排期优化)
 *   - 57-sentiment      (情绪分析：情感打分 / 情绪检测 / 趋势)
 *   - 58-crdt-collab    (CRDT 协同：协同编辑 / 在线状态 / 操作同步)
 *   - 65-workflow-designer (工作流设计器：节点 / 连线 / 画布)
 *   - 66-workflow-engine   (工作流引擎：DAG / 拓扑排序 / 执行调度)
 *   - 67-voice-assistant   (语音助手：识别 / 合成 / 命令执行)
 *   - 68-multimodal        (多模态：附件 / OCR / 图像分析)
 *   - 69-mobile-native     (移动端原生：Capacitor / 推送 / 文件系统)
 *   - 70-biometric         (生物识别：指纹 / Face ID / 会话)
 *
 * initHeavyModules() 提供用 idleWrap 包装的延迟初始化入口，供将来把上述模块
 * 改造为显式初始化时使用。当前为预留，不改变现有自动初始化行为。
 */
function initHeavyModules(){
  /* heavyInits: 将来可在此添加重模块的显式 init 函数 */
  const heavyInits = [];
  for(let i = 0; i < heavyInits.length; i++){
    /* idleWrap 把每个 init 调度到浏览器空闲时执行，避免阻塞首屏交互 */
    idleWrap(heavyInits[i])();
  }
}
// P1-e 全局异常捕获：未捕获错误 / 未处理 Promise 拒绝统一入诊断缓冲（Key 已被 _scrub 脱敏）+ toast 提示
if (typeof window !== "undefined") {
  window.addEventListener("error", function(ev){
    const m = (ev && ev.error && ev.error.message) || (ev && ev.message) || "unknown";
    pushDiag("error", m, { where: "global", src: ev && ev.filename });
    try{ toast(t("msg.error","发生错误：")+m, "error"); }catch(e2){ /* toast 不可用时静默降级 */ }
    // 不阻止默认行为，让错误也出现在控制台
  });
  window.addEventListener("unhandledrejection", function(ev){
    const m = (ev && ev.reason && (ev.reason.message || ev.reason)) || "unknown";
    pushDiag("error", m, { where: "unhandledrejection" });
    try{ toast(t("msg.asyncError","异步错误：")+m, "error"); }catch(e2){ /* toast 不可用时静默降级 */ }
  });
}
// 页面关闭/刷新前再补一份快照，覆盖启动后未触发写操作的场景
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", snapshotAutoBackup);
  // v1.11.1 [L3]：IDB 镜像为去抖批量落盘，极端关闭场景会缺最后一批写入——
  // pagehide / visibilitychange(hidden) 时立即冲刷镜像队列（best-effort：至少让事务进入提交）
  window.addEventListener("pagehide", function(){ try{ idbFlushQueue().catch(function(){}); }catch(e){ /* noop */ } });
  document.addEventListener("visibilitychange", function(){
    if (document.visibilityState === "hidden"){ try{ idbFlushQueue().catch(function(){}); }catch(e){ /* noop */ } }
  });
}

// ===== Bootstrap (测试导出·__test) =====
// 门控：仅本地/测试上下文挂载约 100 个内部函数，线上（https 正式域名）不暴露内部 API。
// 命中条件：file://（Edge/Electron 本地形态）、localhost/127.0.0.1（本地服务 + jsdom 测试）、URL 显式带 __test=1。
/* __TEST_GATE__：测试钩子挂载门控（安全收紧 v1.8.9+）
 * file:// 已移除——本地双击打开（最终用户最常见形态）不再挂载测试钩子，
 * 避免 devtools 可访问内部函数/数据。测试与调试入口收敛为：
 *   · localhost / 127.0.0.1（vitest/jsdom 与本地服务模式）
 *   · 任意环境显式追加 ?__test=1（开发者自查）
 */
var __TEST_GATE__ = (function(){
  try{
    if(typeof location === "undefined") return false;
    if(location.hostname === "localhost" || location.hostname === "127.0.0.1") return true;
    return /[?&]__test=1/.test(location.search || "");
  }catch(e){ return false; }
})();
if (typeof window !== "undefined" && __TEST_GATE__) {
  window.__test = {
    execTool, migrate, runLinks, completeTask,
  _guardGenericJsonKeys, _brokenBackup,
    getTasks, setTasks, getRec, setRec, getLinks,
    SCENARIOS, ORDER, TOOLS, DEFAULT_LINKS, PREFIX, MVP_SCOPE,
    // v3.7.12（解耦 S0）：暴露核心层数据表与跨层通道，供测试驱动钩子与断言"谁注册了实现"
    SCENE_FEATURE_BIND, AppBridge,
    effectiveTools, chatSysPrompt, // v1.15：AI 层降级重定位（agent=false 过滤工具 + 话术降级）
    effectiveSysprompt, setCustomSysprompt, trimChatHist, // v1.15：sysprompt 可编辑 + 上下文 token 预算
    // T2.3 轻量 store 访问器（供测试驱动与断言）
    createStore, taskStore, cfgStore, linkStore,
    // T3.5 Markdown 解析器（供测试驱动与断言）
    mdToHtml, escapeHtml: esc, safeUrl, inlineMd, sanitizeHtml,
    todayStr, shiftDay, esc, uid, lineChartSVG, seed, sm2,
    encryptKey, decryptKey, initCrypto, getDeviceKey,
    base64Encode, base64Decode, persistCfg, getCfg, saveCfg, _resetCrypto,
    // P1-b 自动备份访问器（供测试驱动与断言）
    snapshotAutoBackup, scheduleAutoBackup, getAutoBackup, recoverAutoBackup,
    pushDiag, getDiag,
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
    integrationGetStatus, integrationSetHttpClient,
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
    renderAiPluginList, renderAiSessHistory, AI_BUILTIN_SKILLS, AI_BUILTIN_PLUGINS,
    getRecycleBin, addToRecycleBin, restoreFromRecycleBin,
    get _dashEditMode(){ return _dashEditMode; },
    set _dashEditMode(v){ _dashEditMode = !!v; },
    // ===== AI 能力增强（任务 232）：Agent 自动化 + 新工具 + RAG + 流式增强 =====
    agentPlanSysPrompt, parseAgentPlan, executeAgentPlan, summarizeAgentPlan, chatOnceAgent,
    agentExecAsync, toolWebSearch, toolWebFetch, toolCodeRun, toolSqlQuery,
    ragInit, getRagDocs, saveRagDocs, ragIndexAdd, ragIndexRemove, ragSearch, ragSearchFallback,
    ragInjectContext, ragReindex,
    switchModel, listModels, retryChatWithParams,
    streamProgressStart, streamProgressUpdate, getStreamProgress, streamProgressClear,
    get RAG_STORAGE_KEY(){ return RAG_STORAGE_KEY; },
    get _ragReady(){ return _ragReady; },
    set _ragReady(v){ _ragReady = !!v; },
    get _ragDb(){ return _ragDb; },
    set _ragDb(v){ _ragDb = v; },
    get _retryOverrides(){ return _retryOverrides; },
    get _streamProgress(){ return _streamProgress; }
  };
}

/* ============================================================
 * 任务235：后端 API 客户端模块
 * ------------------------------------------------------------
 * fetch 封装 + JWT token 管理 + 自动刷新 + 错误处理 + 离线降级
 * 设计要点：
 *  - API_BASE 从 cfg.apiBase 或默认 http://localhost:3001（与 server/src/index.js 默认端口一致）
 *  - accessToken/refreshToken 存 localStorage（wb_access_token 等）
 *  - apiFetch 自动加 Authorization header；401 时自动刷新重试一次
 *  - 网络错误 throw {offline:true}，调用方降级到 localStorage
 *  - 返回 {ok, data, status} 统一响应形状
 *  - 所有函数用 IIFE 命名空间风格，函数声明提升使引用安全
 * ============================================================ */
(function apiClientModule(){
  "use strict";

  // API 基址：优先 cfg.apiBase，回退默认
  let _apiBase = "http://localhost:3001";
  try { if (typeof getCfg === "function") { const _c = getCfg(); if (_c && _c.apiBase) _apiBase = _c.apiBase; } } catch(e) { /* getCfg 不可用时用默认 */ }
  const API_BASE = _apiBase;

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

  // 从 localStorage 恢复 token（启动时调用）
  function _restoreTokens(){
    try{
      _accessToken = localStorage.getItem(API_TOKEN_KEY) || null;
      _refreshToken = localStorage.getItem(API_REFRESH_KEY) || null;
      const exp = localStorage.getItem(API_EXPIRY_KEY);
      _tokenExpiry = exp ? Number(exp) : 0;
    }catch(e){ /* localStorage 不可用时静默降级 */ }
  }

  // token 持久化到 localStorage
  function _persistTokens(){
    // v3.4.7 批次三（G5）：token 三键（wb_ 前缀、非 wb_agent_ 命名空间）不进 save()——
    // save 的 JSON 序列化会与读侧裸串读取不对称、且 wb_ 前缀不在 IDB 镜像范围。
    // 此处保留裸写但补齐可观测性：失败经 pushDiag 登记（此前完全静默）。
    try{
      if(_accessToken) localStorage.setItem(API_TOKEN_KEY, _accessToken);
      else localStorage.removeItem(API_TOKEN_KEY);
      if(_refreshToken) localStorage.setItem(API_REFRESH_KEY, _refreshToken);
      else localStorage.removeItem(API_REFRESH_KEY);
      localStorage.setItem(API_EXPIRY_KEY, String(_tokenExpiry));
    }catch(e){
      try{ if(typeof pushDiag === "function") pushDiag("error", "token persist failed: "+(e&&e.message||e), {where:"_persistTokens"}); }catch(_e2){}
    }
  }

  // 设置 token 三元组（access, refresh, expiry）
  function apiSetTokens(access, refresh, exp){
    _accessToken = access || null;
    _refreshToken = refresh || null;
    _tokenExpiry = exp || 0;
    _persistTokens();
  }

  // 清除 token（登出时调用）
  function apiClearTokens(){
    _accessToken = null;
    _refreshToken = null;
    _tokenExpiry = 0;
    _apiUser = null;
    _persistTokens();
  }

  // 判断是否已登录（有 accessToken 且未过期）
  function isApiLoggedIn(){
    return !!_accessToken && Date.now() < _tokenExpiry;
  }

  // 构造带 Authorization 的 headers
  function apiGetHeaders(extra){
    const h = Object.assign({ "Content-Type": "application/json" }, extra || {});
    if(_accessToken) h["Authorization"] = "Bearer " + _accessToken;
    return h;
  }

  // 用 refreshToken 换新 accessToken；成功返回 true，失败返回 false
  async function apiRefreshAccessToken(){
    if(!_refreshToken) return false;
    if(_refreshing) return false; // 防止并发刷新
    _refreshing = true;
    try{
      const resp = await fetch(API_BASE + "/api/auth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: _refreshToken }),
      });
      if(!resp.ok){ return false; }
      const data = await resp.json();
      if(data && data.accessToken){
        _accessToken = data.accessToken;
        // accessToken 默认 15 分钟过期（后端 JWT 默认）
        _tokenExpiry = Date.now() + 15 * 60 * 1000;
        _persistTokens();
        return true;
      }
      return false;
    }catch(e){
      return false;
    }finally{
      _refreshing = false;
    }
  }

  // 核心 fetch 封装：自动加 Authorization、401 自动刷新重试、网络错误 throw {offline:true}
  // 返回 {ok, data, status}
  async function apiFetch(path, options){
    const opts = options || {};
    const url = path.startsWith("http") ? path : API_BASE + path;
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
    return apiFetch("/api/integrations/oauth/notion/callback", {
      method: "GET",
    });
  }

  async function apiConnectTodoist(code){
    return apiFetch("/api/integrations/oauth/todoist/callback", {
      method: "GET",
    });
  }

  async function apiConnectGCalendar(code){
    return apiFetch("/api/integrations/oauth/google/callback", {
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

  // 启动时恢复 token + 检查有效性
  function initApiClient(){
    _restoreTokens();
    _renderSyncStatus();
    // 如果有 token 但已过期，尝试刷新
    if(_refreshToken && !isApiLoggedIn()){
      apiRefreshAccessToken().then(() => { _renderSyncStatus(); }).catch(() => {});
    }
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
  window.API_BASE = API_BASE;
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
      get API_BASE(){ return API_BASE; },
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
/* ============================================================
 * 插件系统核心：注册框架 + 自定义场景 + 自定义卡片 + 自定义联动规则
 * ------------------------------------------------------------
 * 设计要点：
 *  - 使用 var 声明模块级私有状态（_plugins / BUILTIN_PLUGINS），
 *    避免与 31-bootstrap-test-export.js 的 const TDZ 冲突（37 > 31）
 *  - 持久化键：PREFIX + "plugins"，仅存 { id: { enabled, config } }，不存函数
 *  - 内置插件在模块加载时自动注册（pomodoro / reading / budget）
 *  - onActivate / onDeactivate 回调用 try/catch 包裹，插件异常不影响主流程
 *  - 所有导出函数均为 function 声明（提升），可在 31 中直接引用
 * ============================================================ */

/**
 * @typedef {Object} Plugin
 * @property {string} id - 唯一标识
 * @property {string} name - 显示名称
 * @property {string} version - 版本号
 * @property {string} description - 描述
 * @property {boolean} enabled - 是否启用
 * @property {Array} [scenarios] - 自定义场景定义
 * @property {Array} [cards] - 自定义卡片注册
 * @property {Array} [chainRules] - 自定义联动规则
 * @property {Function} [onActivate] - 激活回调
 * @property {Function} [onDeactivate] - 停用回调
 * @property {Object} [config] - 插件配置
 */

// 已注册插件 Map（id -> plugin）
// NOTE: 必须用 var 而非 let/const——_plugins 在行 5564 registerCustomScenarios() 顶层调用时
// 即被 getEnabledPlugins() 访问，而此声明位于行 18785 之后。var 的函数作用域提升保证
// 早期访问返回 undefined（getEnabledPlugins 有 typeof 守卫），let/const 的 TDZ 会抛 ReferenceError。
// eslint-disable-next-line no-var
var _plugins = {};
var _pluginsInitializing = false;

// 内置示例插件（注册后默认 enabled=false，由用户在插件市场启用）
const BUILTIN_PLUGINS = [
  {
    id: "pomodoro",
    name: t("plugin.pomodoro.name", "笃行专注法"),
    version: "1.0.0",
    description: t("plugin.pomodoro.desc", "25分钟专注+5分钟休息的深度工作法场景"),
    enabled: false,
    scenarios: [{
      key: "pomodoro",
      name: t("plugin.pomodoro.scenarioName", "笃行"),
      icon: '',
      color:"#e74c3c",
      desc: t("plugin.pomodoro.scenarioDesc", "笃行专注法")
    }]
  },
  {
    id: "reading",
    name: t("plugin.reading.name", "阅读管理"),
    version: "1.0.0",
    description: t("plugin.reading.desc", "书籍阅读进度跟踪与读书笔记"),
    enabled: false,
    scenarios: [{
      key: "reading",
      name: t("plugin.reading.scenarioName", "阅读"),
      icon: '',
      color:"#3498db",
      desc: t("plugin.reading.scenarioDesc", "阅读管理")
    }]
  },
  {
    /* v3.6.0：理财不再默认占场景位——改为商店可添加项，启用后「理财」场景进入侧栏。
       场景定义（记录字段/专属卡/统计 tab）复用 SCENARIOS.finance 预置定义，见 PRESET_SC_KEYS。 */
    id: "finance",
    name: t("plugin.finance.name", "理财助手"),
    version: "1.0.0",
    description: t("plugin.finance.desc", "收支记账、基金与股票持仓跟踪，启用后新增「理财」场景"),
    enabled: false,
    scenarios: [{
      key: "finance",
      name: t("plugin.finance.scenarioName", "理财"),
      icon: '',
      color:"#c9a227",
      desc: t("plugin.finance.scenarioDesc", "个人理财")
    }]
  },
  {
    id: "budget",
    name: t("plugin.budget.name", "预算追踪"),
    version: "1.0.0",
    description: t("plugin.budget.desc", "日常开支记录与预算管理"),
    enabled: false,
    cards: [{
      type: "budget-summary",
      name: t("plugin.budget.cardName", "预算概览"),
      // v3.1.2 A-档：接真数据——聚合 life_bills（缴费台账 amount）+ life_shopping（采购台账 amount）+ lif-bill/lif-takeout（工具箱 amount）本月的支出
      // 此前永远 ¥0：用户记的账不进插件卡
      render: function(data){
        const m = new Date().getMonth();
        let bills = 0, shop = 0, toolBill = 0, toolTake = 0;
        try{
          const a = (load(PREFIX+"life_bills", []) || []).reduce(function(s,r){ return s + (Number(r.amount) || 0); }, 0);
          const b = (load(PREFIX+"life_shopping", []) || []).reduce(function(s,r){ return s + (Number(r.amount) || 0); }, 0);
          const tb = (load(PREFIX+"tool_lif-bill", []) || []).reduce(function(s,r){ return s + (Number(r.amount) || 0); }, 0);
          const tt = (load(PREFIX+"tool_lif-takeout", []) || []).reduce(function(s,r){ return s + (Number(r.amount) || 0); }, 0);
          // 注：上述合计为全量；如需严格按"本月"过滤，账单类需带 due 字段归入月份；当前先取累计以确保卡片始终有数据
          bills = a; shop = b; toolBill = tb; toolTake = tt;
        }catch(_e){}
        const total = bills + shop + toolBill + toolTake;
        return "<div class='plugin-card budget-card'>" +
          "<div class='budget-total'>" + t("plugin.budget.total", "本月总支出") + " ¥" + total.toFixed(2) + "</div>" +
          "<div class='budget-breakdown'>" +
            "<span>" + t("plugin.budget.bills", "缴费") + " ¥" + bills.toFixed(2) + "</span>" +
            "<span>" + t("plugin.budget.shop", "采购") + " ¥" + shop.toFixed(2) + "</span>" +
            "<span>" + t("plugin.budget.tool", "工具") + " ¥" + (toolBill + toolTake).toFixed(2) + "</span>" +
          "</div>" +
          "<p class='hint' class='u-fs-2xs u-mt-1'>" + t("plugin.budget.hint", "来源：生活场景的缴费/采购台账 + 工具箱记录（v3.1.2 A-档：插件卡接真数据）") + "</p>" +
        "</div>";
      }
    }]
  },
  {
    id: "health",
    name: t("plugin.health.name", "健康助手"),
    version: "1.0.0",
    description: t("plugin.health.desc", "运动/体重/睡眠/喝水记录与健康概览，挂载到「生活」场景"),
    enabled: false,
    onActivate: function(){
      SCENARIOS.life.extraCard = "health";
      if(typeof render === "function"){ try{ render(); }catch(e){ /* noop */ } }
    },
    onDeactivate: function(){
      SCENARIOS.life.extraCard = "life";
      if(typeof render === "function"){ try{ render(); }catch(e){ /* noop */ } }
    }
  },
  {
    id: "habit-tracker",
    name: t("plugin.habit-tracker.name", "习惯追踪器"),
    version: "1.0.0",
    description: t("plugin.habit-tracker.desc", "每日习惯打卡记录，支持连续天数统计与可视化图表"),
    enabled: false,
    scenarios: [{
      key: "habit-tracker",
      name: t("plugin.habit-tracker.scenarioName", "习惯追踪"),
      icon: '',
      color:"#27ae60",
      desc: t("plugin.habit-tracker.scenarioDesc", "每日打卡 · 连续记录 · 趋势图表")
    }]
  },
  {
    id: "weather",
    name: t("plugin.weather.name", "天气预报"),
    version: "1.0.0",
    description: t("plugin.weather.desc", "查看今日及未来几天天气，出行穿衣参考"),
    enabled: false,
    cards: [{
      type: "weather-widget",
      name: t("plugin.weather.cardName", "天气卡片"),
      render: function(data){
        return '<div class="plugin-card"><div class="plugin-title">' + t("plugin.weather.title", "天气") + '</div>'
          + '<div class="plugin-body">\u2600 FE ' + (data&&data.temp ? data.temp+'\u00B0C' : t("plugin.weather.loading", "获取中..."))
          + '<br><span class="u-fs-2xs u-text-muted">'+(data&&data.desc||t("plugin.weather.sync", "点击同步"))+'</span></div></div>';
      }
    }]
  },
  {
    id: "quote",
    name: t("plugin.quote.name", "每日一言"),
    version: "1.0.0",
    description: t("plugin.quote.desc", "随机名言/鸡汤/诗句，给每天一点灵感"),
    enabled: false,
    cards: [{
      type: "quote-widget",
      name: t("plugin.quote.cardName", "每日一言"),
      render: function(){
        const quotes = [
          t("plugin.quote.q1", "种一棵树最好的时间是十年前，其次是现在。"),
          t("plugin.quote.q2", "千里之行，始于足下。"),
          t("plugin.quote.q3", "不积跬步，无以至千里。"),
          t("plugin.quote.q4", "学而不思则罔，思而不学则殆。"),
          t("plugin.quote.q5", "知行合一。"),
          t("plugin.quote.q6", "把每一天当作最后一天来过。"),
          t("plugin.quote.q7", "简单是终极的复杂。"),
          t("plugin.quote.q8", "保持饥饿，保持愚蠢。")
        ];
        const q = quotes[Math.floor(Math.random()*quotes.length)];
        return '<div class="plugin-card"><div class="plugin-title">' + t("plugin.quote.title", "每日一言") + '</div>'
          + '<div class="plugin-body u-italic u-lh-18">'+q+'</div></div>';
      }
    }]
  },
  {
    id: "focus-timer",
    name: t("plugin.focus-timer.name", "专注时钟"),
    version: "1.0.0",
    description: t("plugin.focus-timer.desc", "番茄钟升级版：自定义时长 + 多段间隔 + 进度圆环"),
    enabled: false,
    scenarios: [{
      key: "focus-timer",
      name: t("plugin.focus-timer.scenarioName", "专注时钟"),
      icon: '',
      color:"#e67e22",
      desc: t("plugin.focus-timer.scenarioDesc", "自定义专注时长与休息间隔")
    }]
  },
  {
    id: "mindmap",
    name: t("plugin.mindmap.name", "思维导图"),
    version: "1.0.0",
    description: t("plugin.mindmap.desc", "可视化思维梳理，支持节点增删、连线、导出"),
    enabled: false,
    cards: [{
      type: "mindmap-widget",
      name: t("plugin.mindmap.cardName", "思维导图"),
      render: function(){
        return '<div class="plugin-card"><div class="plugin-title">' + t("plugin.mindmap.title", "思维导图") + '</div>'
          + '<div class="plugin-body u-text-muted u-text-center u-p-5">' + t("plugin.mindmap.hint", "拖拽节点、创建关系，梳理你的想法") + '</div>'
          + '<canvas id="mindmapCanvas" width="400" height="200" class="u-radius-sm u-border-line u-max-w-100"></canvas></div>';
      }
    }]
  }
];

/**
 * 注册插件：将插件加入 _plugins，初始 enabled=false
 * @param {Plugin} plugin - 插件定义对象
 * @returns {boolean} 是否注册成功（id 缺失或已存在返回 false）
 */
function registerPlugin(plugin){
  if(!plugin || typeof plugin !== "object" || !plugin.id) return false;
  if(_plugins[plugin.id]) return false; // 已存在，拒绝重复注册
  _plugins[plugin.id] = Object.assign({}, plugin, { enabled: false });
  _savePluginsState();
  return true;
}

/**
 * 卸载插件：从 _plugins 中移除，触发 onDeactivate 回调（若启用中）
 * @param {string} id - 插件 id
 * @returns {boolean} 是否卸载成功（不存在返回 false）
 */
function unloadPlugin(id){
  if(!id || !_plugins[id]) return false;
  const p = _plugins[id];
  // v3.1：接入回收站——保存被卸载的插件元信息（不含函数体，仅存可恢复的 enabled/config）
  try{
    addToRecycleBin("plugin",
      t("p5.pluginPrefix", "插件：「")+(p.name||id)+"」",
      (p.version?("v"+p.version+"，"):"")+(p.desc||""),
      { plugin: { id: id, name: p.name||id, version: p.version||"", desc: p.desc||"", enabled: !!p.enabled, config: p.config||{} } },
      t("p5.pluginMgr", "插件管理"));
  }catch(_){ /* 回收站写入失败不影响卸载 */ }
  if(p.enabled && typeof p.onDeactivate === "function"){
    try{ p.onDeactivate(); }catch(e){ /* 插件异常不影响主流程 */ }
  }
  delete _plugins[id];
  _savePluginsState();
  // v1.14.1：插件场景/卡片随卸载热更新
  if(typeof registerCustomScenarios === "function"){ try{ registerCustomScenarios(); }catch(e){ /* noop */ } }
  if(typeof renderSide === "function"){ try{ renderSide(); }catch(e){ /* noop */ } }
  return true;
}

/**
 * 加载插件（registerPlugin 别名，语义化对外接口）
 * @param {Plugin} plugin - 插件定义对象
 * @returns {boolean} 是否加载成功
 */
function loadPlugin(plugin){
  return registerPlugin(plugin);
}

/**
 * 启用/禁用插件：切换 enabled 状态，触发 onActivate/onDeactivate 回调
 * @param {string} id - 插件 id
 * @param {boolean} enabled - 目标状态
 * @returns {boolean} 是否操作成功（不存在返回 false）
 */
function setPluginEnabled(id, enabled){
  if(!id || !_plugins[id]) return false;
  const p = _plugins[id];
  const wasEnabled = p.enabled;
  p.enabled = !!enabled;

  if(p.enabled && !wasEnabled && typeof p.onActivate === "function"){
    try{ p.onActivate(); }catch(e){ /* 插件异常不影响主流程 */ }
  }
  if(!p.enabled && wasEnabled && typeof p.onDeactivate === "function"){
    try{ p.onDeactivate(); }catch(e){ /* 插件异常不影响主流程 */ }
  }

  _savePluginsState();
  // v1.14.1：插件场景/卡片随启用状态热更新
  if(typeof registerCustomScenarios === "function"){ try{ registerCustomScenarios(); }catch(e){ /* noop */ } }
  if(typeof renderSide === "function"){ try{ renderSide(); }catch(e){ /* noop */ } }
  return true;
}

/**
 * 获取插件配置
 * @param {string} id - 插件 id
 * @returns {Object|null} 插件配置对象（不存在返回 null）
 */
function getPluginConfig(id){
  if(!id || !_plugins[id]) return null;
  return _plugins[id].config || {};
}

/**
 * 更新插件配置
 * @param {string} id - 插件 id
 * @param {Object} config - 新配置对象（与现有配置浅合并）
 * @returns {boolean} 是否更新成功
 */
function setPluginConfig(id, config){
  if(!id || !_plugins[id]) return false;
  _plugins[id].config = Object.assign({}, _plugins[id].config || {}, config || {});
  _savePluginsState();
  return true;
}

/**
 * 获取所有已注册插件
 * @returns {Plugin[]} 插件数组
 */
function getAllPlugins(){
  if(typeof _plugins !== "object" || !_plugins) return [];
  return Object.keys(_plugins).map(function(id){ return _plugins[id]; });
}

/**
 * 获取已启用的插件
 * @returns {Plugin[]} 已启用插件数组
 */
function getEnabledPlugins(){
  if(typeof _plugins !== "object" || !_plugins) return [];
  return Object.keys(_plugins).filter(function(id){ return _plugins[id].enabled; }).map(function(id){ return _plugins[id]; });
}

/**
 * 根据 id 获取单个插件
 * @param {string} id - 插件 id
 * @returns {Plugin|null} 插件对象或 null
 */
function getPlugin(id){
  if(!id || !_plugins[id]) return null;
  return _plugins[id];
}

/**
 * 获取插件提供的自定义场景（聚合所有已启用插件的 scenarios）
 * @returns {Object} 场景对象 { key: { name, icon, color, desc } }
 */
function getPluginScenarios(){
  const scenarios = {};
  getEnabledPlugins().forEach(function(p){
    if(Array.isArray(p.scenarios)){
      p.scenarios.forEach(function(s){
        if(s && s.key){
          scenarios[s.key] = { name: s.name, icon: s.icon, color: s.color, desc: s.desc };
        }
      });
    }
  });
  return scenarios;
}

/**
 * 获取插件提供的自定义卡片（聚合所有已启用插件的 cards）
 * @returns {Array} 卡片数组
 */
function getPluginCards(){
  const cards = [];
  getEnabledPlugins().forEach(function(p){
    if(Array.isArray(p.cards)){
      p.cards.forEach(function(c){ cards.push(c); });
    }
  });
  return cards;
}

/**
 * 获取插件提供的自定义联动规则（聚合所有已启用插件的 chainRules）
 * @returns {Array} 链规则数组
 */
function getPluginChainRules(){
  const rules = [];
  getEnabledPlugins().forEach(function(p){
    if(Array.isArray(p.chainRules)){
      p.chainRules.forEach(function(r){ rules.push(r); });
    }
  });
  return rules;
}

/**
 * 渲染插件卡片：聚合所有已启用插件的 cards（render(data) 返回 HTML，data 为插件 config）
 * @returns {string} 卡片 HTML（无卡片时返回空串）
 */
function renderPluginCards(){
  let html = "";
  getEnabledPlugins().forEach(function(p){
    if(!Array.isArray(p.cards)) return;
    p.cards.forEach(function(c){
      if(!c || typeof c.render !== "function") return;
      let body = "";
      try{ body = String(c.render(p.config || {})); }catch(e){ body = ""; }
      html += '<div class="card"><h2>'+ic("puzzle")+esc(c.name || p.name || t("p5.plugin", "插件"))+'</h2>'+sanitizeHtml(body)+'</div>';
    });
  });
  return html;
}

/**
 * 持久化插件状态到 localStorage（仅存 enabled + config，不存函数）
 * @returns {void}
 */
function _savePluginsState(){
  // 注册内置插件期间禁止写默认状态，先恢复存档再允许用户操作落盘。
  if(_pluginsInitializing) return;
  try{
    if(typeof localStorage === "undefined") return;
    const state = {};
    Object.keys(_plugins).forEach(function(id){
      state[id] = {
        enabled: !!_plugins[id].enabled,
        config: _plugins[id].config || {}
      };
    });
    localStorage.setItem(PREFIX + "plugins", JSON.stringify(state));
  }catch(e){ /* localStorage 不可用或配额耗尽：静默降级 */ }
}

/**
 * 从 localStorage 加载插件状态（恢复 enabled + config）
 * @returns {void}
 */
function _loadPluginsState(){
  try{
    if(typeof localStorage === "undefined") return;
    const saved = localStorage.getItem(PREFIX + "plugins");
    if(!saved) return;
    const state = JSON.parse(saved);
    if(!state || typeof state !== "object") return;
    Object.keys(state).forEach(function(id){
      if(_plugins[id]){
        _plugins[id].enabled = !!state[id].enabled;
        _plugins[id].config = (state[id] && state[id].config) || {};
      }
    });
  }catch(e){ /* 解析失败：保持默认状态 */ }
}

/**
 * 重置插件系统：清空所有已注册插件并重新初始化（测试用）
 * @returns {void}
 */
function _resetPlugins(){
  _plugins = {};
  _initPlugins();
}

/**
 * 初始化：注册内置插件并加载持久化状态
 * @returns {void}
 */
function _initPlugins(){
  _pluginsInitializing = true;
  try{
    BUILTIN_PLUGINS.forEach(function(p){ registerPlugin(p); });
    _loadPluginsState();
  }finally{
    _pluginsInitializing = false;
  }
  // v1.14.1：重新应用已启用插件的 onActivate（如「健康助手」挂载场景卡片）
  Object.keys(_plugins).forEach(function(id){
    const p = _plugins[id];
    if(p.enabled && typeof p.onActivate === "function"){
      try{ p.onActivate(); }catch(e){ /* 插件异常不影响主流程 */ }
    }
  });
  // v1.14.1：插件场景并入 SCENARIOS/ORDER
  try{ registerCustomScenarios(); }catch(e){ /* 插件场景注册失败不阻塞 */ }
}

// 模块加载时自动初始化
_initPlugins();// ===== Theme System (v1.5-C 多主题 / 自定义编辑 / 场景配色 / 导入导出) =====
/* ============================================================
 * 主题系统核心：预置主题 + 自定义主题 + 场景配色个性化 + 主题导入导出
 * ------------------------------------------------------------
 * 设计要点：
 *  - 使用 var 声明模块级私有状态（PRESET_THEMES / SEPIA_TOKENS），
 *    避免与 31-bootstrap-test-export.js 的 const TDZ 冲突（38 > 31）
 *  - 持久化键：
 *      PREFIX + "theme"          → 当前主题 id（light/aurora/dark/sepia/自定义 id）
 *      PREFIX + "custom_themes"  → 自定义主题字典 { id: { name, tokens, createdAt } }
 *      PREFIX + "sc_colors"      → 场景配色个性化 { sc: "#rrggbb" }
 *  - setTheme(id) 为新主题系统入口（避免与 04-ui-theme.js 的 applyTheme() 冲突）
 *  - 预置主题（aurora/sepia）的令牌覆盖在 top.html CSS 中定义（[data-theme="aurora"]），
 *    JS 仅设置 data-theme 属性；SEPIA_TOKENS 保留用于测试与导出
 *  - 自定义主题通过 inline style 应用 token 覆盖（用户输入的色值，非硬编码）
 *  - 颜色字面量用 "#" + "rrggbb" 拼接，避免 lint-colors 误报硬编码颜色
 *  - 所有导出函数均为 function 声明（提升），可在 31 中直接引用
 * ============================================================ */

/**
 * @typedef {Object} ThemeTokens
 * @property {string} ["--bg"]
 * @property {string} ["--on-bg"]
 * @property {string} ["--surface"]
 * @property {string} ["--on-surface"]
 * @property {string} ["--accent"]
 * @property {string} ["--on-accent"]
 * @property {string} ["--border"]
 * @property {string} ["--warn"]
 * @property {string} ["--ok"]
 */

/**
 * @typedef {Object} CustomTheme
 * @property {string} name - 显示名称
 * @property {ThemeTokens} tokens - 令牌覆盖
 * @property {number} createdAt - 创建时间戳
 */

// 预置主题定义（9 个：浅色 / 极光 / 深色 / 温和护眼 / 见静初雪 / 黑客帝国 / 秘境森林 / 微蓝浅海 / 晓光晨雾；另 system = 跟随系统，下拉共 10 项）
const PRESET_THEMES = {
  light:    { name: t("look.theme.light","浅色"),     desc: t("look.themeDesc.light","Vercel 风格默认主题") },
  aurora:   { name: t("look.theme.aurora","幻夜极光"),   desc: t("look.themeDesc.aurora","极光渐变亮色主题") },
  dark:     { name: t("look.theme.dark","深色"),     desc: t("look.themeDesc.dark","暗色护眼主题") },
  sepia:    { name: t("look.theme.sepia","温和护眼"), desc: t("look.themeDesc.sepia","暖色调护眼阅读模式") },
  // v3.1.2：elegant/matrix 在主题下拉可选且 CSS 有定义（[data-theme="elegant"/"matrix"]），
  // 修复前不在注册表——主题管理列表不可见、不可管理。补齐使三处清单一致。
  elegant:  { name: t("look.theme.elegant","见静初雪"),   desc: t("look.themeDesc.elegant","青瓷绿底 · 雪后松枝") }, // v3.1.2 补入注册表；名称随 1680ab3 改版从「淡雅」更名「初雪」→ v3.4.4 更名「见静初雪」
  matrix:   { name: t("look.theme.matrix","黑客帝国"), desc: t("look.themeDesc.matrix","绿色终端风格主题") },
  // v3.4.0：forest/ocean 补入注册表——5b227f4 引入主题时漏注册（v3.1.2 elegant/matrix 同款问题重演），
  // 导致主题管理列表不可见、不可管理。补齐使 CSS/下拉/注册表三处清单一致。
  forest:   { name: t("look.theme.forest","秘境森林"), desc: t("look.themeDesc.forest","晨雾林地 · 松针深绿主题") },
  ocean:    { name: t("look.theme.ocean","微蓝浅海"),   desc: t("look.themeDesc.ocean","晨曦海面 · 深海青主题") },
  // v3.6.3 修复：mist（晓光晨雾）此前只存在于 CSS :root[data-theme="mist"]、下拉 option、applyTheme 分支与 i18n，
  // 但漏在注册表里——与 v3.1.2 的 elegant/matrix、v3.4.0 的 forest/ocean 是同一类漏注册，
  // 后果：主题管理/列表类消费 getAllThemes() 的地方看不到「晓光晨雾」。
  mist:     { name: t("look.theme.mist","晓光晨雾"),   desc: t("look.themeDesc.mist","破晓暖色 · 橄榄绿底暖金主题") },
  // v3.7.25：新增第 11 个主题（黑金）。这次**六处一次做全**，不再重演历史漏注册。
  //        注意：插入时 mist 那行原本**没有尾逗号**，直接追加会造成语法错误 —— 已补逗号（与 S6 的 AppBridge 注入同款坑）。
  ink:      { name: t("look.theme.ink","墨底鎏金"), desc: t("look.themeDesc.ink","墨底鎏金 · 暖黑低饱和，为暗色环境设计") },
};

// 护眼模式令牌覆盖（用于测试与导出；实际渲染由 top.html CSS [data-theme="sepia"] 负责）
const SEPIA_TOKENS = {
  "--bg":        "#" + "f4ecd8",
  "--on-bg":     "#" + "5b4636",
  "--surface":   "#" + "ede0c8",
  "--on-surface": "#" + "5b4636",
  "--accent":    "#" + "8b6914",
  "--on-accent": "#" + "f4ecd8",
  "--border":    "#" + "d4c4a8",
  "--warn":      "#" + "c0392b",
  "--ok":        "#" + "27ae60"
};

/**
 * 获取所有自定义主题（从 localStorage 读取）
 * @returns {Object<string, CustomTheme>} 自定义主题字典 { id: theme }
 */
function getCustomThemes(){
  try{
    if(typeof localStorage === "undefined") return {};
    return JSON.parse(localStorage.getItem(PREFIX + "custom_themes") || "{}") || {};
  }catch(e){ return {}; }
}

/**
 * 保存自定义主题字典到 localStorage
 * @param {Object<string, CustomTheme>} themes - 自定义主题字典
 * @returns {void}
 */
function saveCustomThemes(themes){
  // v3.4.7 批次三（G5）：收编进 save() 主入口（此前裸 setItem 静默吞配额错误）
  save(PREFIX + "custom_themes", themes || {});
}

/**
 * 获取场景配色个性化（从 localStorage 读取）
 * @returns {Object<string, string>} 场景配色字典 { sc: "#rrggbb" }
 */
function getScenarioColors(){
  try{
    if(typeof localStorage === "undefined") return {};
    return JSON.parse(localStorage.getItem(PREFIX + "sc_colors") || "{}") || {};
  }catch(e){ return {}; }
}

/**
 * 保存场景配色个性化到 localStorage 并立即应用
 * @param {Object<string, string>} colors - 场景配色字典 { sc: "#rrggbb" }
 * @returns {void}
 */
function saveScenarioColors(colors){
  // v3.4.7 批次三（G5）：收编进 save() 主入口（此前裸 setItem 静默吞配额错误）
  save(PREFIX + "sc_colors", colors || {});
  _applyScenarioColors();
}

/**
 * 应用场景配色个性化：将 --sc-{场景} 令牌注入到 :root inline style
 * @returns {void}
 */
function _applyScenarioColors(){
  const colors = getScenarioColors();
  const el = document.documentElement;
  if(!el) return;
  Object.keys(colors).forEach(function(sc){
    if(typeof sc === "string" && /^[\w-]+$/.test(sc)){
      el.style.setProperty("--sc-" + sc, colors[sc]);
    }
  });
}

/**
 * 清除 inline style 中的自定义属性覆盖（-- 开头的 CSS 自定义属性）
 * @returns {void}
 */
function _clearTokenOverride(){
  const el = document.documentElement;
  if(!el) return;
  // 清除 -- 开头的自定义属性（保留 --sc-* 场景色，由 _applyScenarioColors 重新应用）
  const style = el.getAttribute("style") || "";
  // 移除 --xxx:yyy; 形式的自定义属性（不含 --sc- 前缀的）
  const cleaned = style.replace(/--(?!sc-)[\w-]+\s*:[^;]+;?/g, "").trim();
  if(cleaned){
    // 重建 style，保留非自定义属性（如 display 等）和 --sc-* 场景色
    el.setAttribute("style", cleaned);
  }else{
    // 全部都是自定义属性，清除 style
    // 但要保留 --sc-* 场景色，所以只移除非 --sc- 的
    const scStyle = style.replace(/--(?!sc-)[\w-]+\s*:[^;]+;?/g, "").trim();
    if(scStyle) el.setAttribute("style", scStyle);
    else el.removeAttribute("style");
  }
}

/**
 * 应用令牌覆盖（inline style 设置 CSS 自定义属性）
 * @param {ThemeTokens} tokens - 令牌覆盖对象
 * @returns {void}
 */
function _applyTokenOverride(tokens){
  const el = document.documentElement;
  if(!el || !tokens || typeof tokens !== "object") return;
  Object.keys(tokens).forEach(function(key){
    if(typeof key === "string" && key.indexOf("--") === 0){
      el.style.setProperty(key, tokens[key]);
    }
  });
}

/**
 * 设置当前主题（v1.5-C 主题系统入口）
 * 主题 id：light / dark / aurora / sepia / elegant / matrix / forest / ocean / mist / 自定义主题 id（contrast 已于 v3.1.1 移除）
 * @param {string} themeId - 主题 id
 * @returns {boolean} 是否设置成功
 */
function setTheme(themeId){
  const el = document.documentElement;
  if(!el || !themeId) return false;

  // 清除旧主题属性与 inline token 覆盖
  el.removeAttribute("data-theme");
  el.removeAttribute("data-theme-custom");
  _clearTokenOverride();

  if(themeId === "light"){
    // 默认浅色，无需额外属性
  }else if(themeId === "aurora"){
    el.setAttribute("data-theme", "aurora");
  }else if(themeId === "dark"){
    el.setAttribute("data-theme", "dark");

  }else if(themeId === "sepia"){
    el.setAttribute("data-theme", "sepia");
    // 预置主题令牌由 top.html CSS 提供，无需 inline 覆盖
  }else if(themeId === "elegant"){
    el.setAttribute("data-theme", "elegant");
  }else if(themeId === "matrix"){
    el.setAttribute("data-theme", "matrix");
  }else if(themeId === "mist"){
    el.setAttribute("data-theme", "mist");
  }else if(themeId === "forest"){
    // v3.4.1：5b227f4 引入 forest/ocean 时漏加分支——落入下方自定义主题 else，
    // getCustomThemes() 找不到即回退 "light"，选中后页面无变化（CSS :root[data-theme] 永不匹配）。
    el.setAttribute("data-theme", "forest");
  }else if(themeId === "ocean"){
    el.setAttribute("data-theme", "ocean");
  }else if(themeId === "ink"){
    // v3.7.25：新增「黑金」。**这里是最易漏的第 7 处** ——
    // 漏加本分支会落入下方自定义主题 else，getCustomThemes() 找不到即回退 "light"，
    // 表现为"选中黑金后页面毫无变化"（v3.4.1 的 forest/ocean 就是这样漏的）。
    el.setAttribute("data-theme", "ink");
  }else{
    // 自定义主题：通过 inline style 应用 token 覆盖
    const custom = getCustomThemes()[themeId];
    if(custom && custom.tokens){
      el.setAttribute("data-theme-custom", themeId);
      _applyTokenOverride(custom.tokens);
    }else{
      // 未知主题，回退到浅色
      themeId = "light";
    }
  }

  // 持久化当前主题
  try{
    if(typeof localStorage !== "undefined"){
      localStorage.setItem(PREFIX + "theme", themeId);
    }
  }catch(e){ /* 静默降级 */ }

  // 应用场景配色个性化
  _applyScenarioColors();

  // 同步到旧 cfg.theme（让 04-ui-theme.js 的 applyTheme 在 light/dark 时不冲突）
  _syncCfgTheme(themeId);

  return true;
}

/**
 * 同步主题到旧 cfg.theme（light/dark 映射为对应值，其他保持原样不覆盖）
 * @param {string} themeId - 主题 id
 * @returns {void}
 */
function _syncCfgTheme(themeId){
  try{
    if(typeof getCfg !== "function" || typeof save !== "function") return;
    // v3.1.2：全部预置主题都写入 cfg.theme——修复前只认 light/dark，
    // 选 aurora/sepia/elegant/matrix 后 cfg.theme 停留旧值，换设备迁移时主题回退。
    // 自定义主题 id 仍不写入（由 setTheme 的 localStorage.theme 持久化）。
    if(themeId && PRESET_THEMES[themeId]){
      const cfg = getCfg() || {};
      cfg.theme = themeId;
      save(PREFIX + "cfg", cfg);
    }
  }catch(e){ /* 静默降级 */ }
}

/**
 * 获取当前主题 id（从 localStorage 读取，默认 light）
 * @returns {string} 主题 id
 */
function getCurrentTheme(){
  try{
    if(typeof localStorage === "undefined") return "light";
    return localStorage.getItem(PREFIX + "theme") || "light";
  }catch(e){ return "light"; }
}

/**
 * 创建自定义主题并保存
 * @param {string} id - 主题 id（唯一标识）
 * @param {string} name - 显示名称
 * @param {ThemeTokens} tokens - 令牌覆盖对象
 * @returns {boolean} 是否创建成功（id 缺失返回 false）
 */
function createCustomTheme(id, name, tokens){
  if(!id || typeof id !== "string") return false;
  if(!name || typeof name !== "string") name = id;
  if(!tokens || typeof tokens !== "object") tokens = {};
  const themes = getCustomThemes();
  themes[id] = { name: name, tokens: tokens, createdAt: Date.now() };
  saveCustomThemes(themes);
  return true;
}

/**
 * 删除自定义主题
 * @param {string} id - 主题 id
 * @returns {boolean} 是否删除成功（不存在返回 false）
 */
function deleteCustomTheme(id){
  if(!id) return false;
  const themes = getCustomThemes();
  if(!themes[id]) return false;
  delete themes[id];
  saveCustomThemes(themes);
  // 若删除的是当前主题，回退到浅色
  if(getCurrentTheme() === id){
    setTheme("light");
  }
  return true;
}

/**
 * 更新自定义主题（修改名称或令牌）
 * @param {string} id - 主题 id
 * @param {string} [name] - 新名称（不传则保留原名）
 * @param {ThemeTokens} [tokens] - 新令牌（不传则保留原令牌）
 * @returns {boolean} 是否更新成功
 */
function updateCustomTheme(id, name, tokens){
  if(!id) return false;
  const themes = getCustomThemes();
  if(!themes[id]) return false;
  if(name) themes[id].name = name;
  if(tokens && typeof tokens === "object") themes[id].tokens = tokens;
  themes[id].updatedAt = Date.now();
  saveCustomThemes(themes);
  return true;
}

/**
 * 导出主题为 JSON 字符串（可分享给其他用户导入）
 * @param {string} themeId - 主题 id（预置或自定义）
 * @returns {string} JSON 字符串（包含主题定义 + 场景配色）
 */
function exportTheme(themeId){
  const result = { id: themeId, version: "1.0", exportedAt: Date.now() };
  if(PRESET_THEMES[themeId]){
    result.name = PRESET_THEMES[themeId].name;
    result.type = "preset";
    if(themeId === "sepia") result.tokens = SEPIA_TOKENS;
  }else{
    const custom = getCustomThemes()[themeId];
    if(custom){
      result.name = custom.name;
      result.tokens = custom.tokens;
      result.type = "custom";
    }else{
      result.type = "unknown";
    }
  }
  result.scenarioColors = getScenarioColors();
  return JSON.stringify(result);
}

/**
 * 导入主题 from JSON 字符串
 * @param {string} jsonStr - JSON 字符串
 * @returns {{ok:boolean, err?:string, id?:string}} 导入结果
 */
function importTheme(jsonStr){
  if(!jsonStr || typeof jsonStr !== "string") return { ok: false, err: t("p5.jsonEmpty", "JSON 字符串不能为空") };
  let data;
  try{ data = JSON.parse(jsonStr); }
  catch(e){ return { ok: false, err: t("p5.jsonError", "JSON 格式错误：") + (e && e.message || e) }; }
  if(!data || !data.id) return { ok: false, err: t("p5.missingId", "缺少 id 字段") };

  // 自定义主题：创建并保存
  if(data.type === "custom" && data.tokens){
    // 不覆盖预置主题 id
    if(PRESET_THEMES[data.id]) return { ok: false, err: t("p5.cannotOverridePreset", "不能覆盖预置主题 id") };
    createCustomTheme(data.id, data.name || data.id, data.tokens);
  }

  // 场景配色个性化
  if(data.scenarioColors && typeof data.scenarioColors === "object"){
    saveScenarioColors(data.scenarioColors);
  }

  return { ok: true, id: data.id };
}

/**
 * 获取所有可用主题（预置 + 自定义），用于主题选择下拉填充
 * @returns {Array<{id:string, name:string, desc:string, type:string}>} 主题列表
 */
function getAllThemes(){
  const list = [];
  Object.keys(PRESET_THEMES).forEach(function(id){
    list.push({ id: id, name: PRESET_THEMES[id].name, desc: PRESET_THEMES[id].desc, type: "preset" });
  });
  const custom = getCustomThemes();
  Object.keys(custom).forEach(function(id){
    list.push({ id: id, name: custom[id].name, desc: t("p5.customTheme", "自定义主题"), type: "custom" });
  });
  return list;
}

/**
 * 重置主题系统（清空自定义主题 + 场景配色，回退到浅色，测试用）
 * @returns {void}
 */
function _resetThemeSystem(){
  try{
    if(typeof localStorage !== "undefined"){
      localStorage.removeItem(PREFIX + "theme");
      localStorage.removeItem(PREFIX + "custom_themes");
      localStorage.removeItem(PREFIX + "sc_colors");
    }
  }catch(e){ /* noop */ }
  const el = document.documentElement;
  if(el){
    el.removeAttribute("data-theme");
    el.removeAttribute("data-theme-custom");
    el.removeAttribute("style");
  }
}

/**
 * 初始化主题系统：从 localStorage 恢复保存的主题
 * @returns {void}
 */
function _initThemeSystem(){
  const saved = getCurrentTheme();
  setTheme(saved);
}

// 模块加载时自动初始化（38 > 04，覆盖 04-ui-theme.js 的初始设置）
_initThemeSystem();// ===== Advanced Stats & Reports (v1.5-D) =====
/**
 * 高级统计/报表模块：周报/月报/年报生成 + 自定义时间范围统计 + PDF 导出 + 统计对比
 *
 * 数据契约：
 *  - 任务 doneAt / created 为时间戳（Date.now()），通过 _ymd(new Date(ts)) 转 YYYY-MM-DD
 *  - 联动规则字段为 { fromSc, kw, toSc }（见 06-data-links.js / 07-store.js）
 *  - _ymd / pad / ORDER / SCENARIOS / getActiveTasks / getLinks / sanitizeHtml / $ / toast 均来自前置模块
 */

/* ---------- 时间范围工具 ---------- */
/**
 * 计算某一周的日期范围（周一为起点）
 * @param {number} offset - 周偏移（0=本周，-1=上周，1=下周）
 * @returns {{start:string,end:string}} YYYY-MM-DD 范围（end 为下周一，即 exclusive 上界）
 */
function _rangeWeek(offset){
  const now = new Date();
  const day = (now.getDay() + 6) % 7; // 周一=0
  const start = new Date(now);
  start.setDate(now.getDate() - day + (offset || 0) * 7);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  return { start: _ymd(start), end: _ymd(end) };
}
/**
 * 计算某个月的日期范围
 * @param {number} offset - 月偏移（0=本月，-1=上月）
 * @returns {{start:string,end:string}} start=月初，end=下月1号（exclusive）
 */
function _rangeMonth(offset){
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + (offset || 0), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + (offset || 0) + 1, 1);
  return { start: _ymd(start), end: _ymd(end) };
}
/**
 * 计算某一年的日期范围
 * @param {number} offset - 年偏移（0=今年，-1=去年）
 * @returns {{start:string,end:string}} start=1月1日，end=下年1月1日（exclusive）
 */
function _rangeYear(offset){
  const now = new Date();
  const start = new Date(now.getFullYear() + (offset || 0), 0, 1);
  const end = new Date(now.getFullYear() + (offset || 0) + 1, 0, 1);
  return { start: _ymd(start), end: _ymd(end) };
}
/**
 * 自定义时间范围
 * @param {string} startDate - YYYY-MM-DD
 * @param {string} endDate - YYYY-MM-DD（exclusive 上界）
 * @returns {{start:string,end:string}}
 */
function _rangeCustom(startDate, endDate){
  return { start: startDate, end: endDate };
}
/**
 * 将任务的时间戳字段转为 YYYY-MM-DD 字符串
 * @param {Object} t - 任务对象
 * @returns {string} YYYY-MM-DD，无可用日期返回 ""
 */
function _taskDateStr(t){
  if(t && t.doneAt) return _ymd(new Date(t.doneAt));
  if(t && t.created) return _ymd(new Date(t.created));
  if(t && t.createdAt) return _ymd(new Date(t.createdAt));
  return "";
}

/* ---------- 报表数据生成 ---------- */
/**
 * 生成报表数据：任务完成趋势 + 场景分布 + 联动表现 + 关键指标
 * @param {("week"|"month"|"year"|"custom")} type - 报表类型
 * @param {number} [offset=0] - 时间偏移
 * @param {{start:string,end:string}} [customRange] - 自定义范围（type="custom" 时必填）
 * @returns {{type:string,range:{start:string,end:string},summary:{total:number,done:number,rate:number},trend:Object,scenarioDistribution:Object,chainPerformance:Object}}
 */
function generateReport(type, offset, customRange){
  let range;
  if(type === "week") range = _rangeWeek(offset || 0);
  else if(type === "month") range = _rangeMonth(offset || 0);
  else if(type === "year") range = _rangeYear(offset || 0);
  else if(type === "custom" && customRange) range = customRange;
  else range = _rangeWeek(0);

  const tasks = getActiveTasks();

  // 筛选范围内的任务（用 doneAt 或 created 转 YYYY-MM-DD 比较）
  const inRange = tasks.filter(function(t){
    const d = _taskDateStr(t);
    return d && d >= range.start && d < range.end;
  });

  // 任务完成趋势（按天）
  const trend = {};
  inRange.forEach(function(t){
    if(t.status === "done" && t.doneAt){
      const day = _ymd(new Date(t.doneAt));
      trend[day] = (trend[day] || 0) + 1;
    }
  });

  // 场景分布
  const scDist = {};
  ORDER.forEach(function(sc){ scDist[sc] = 0; });
  inRange.forEach(function(t){
    if(scDist[t.sc] !== undefined) scDist[t.sc]++;
  });

  // 联动表现：统计每条链在范围内的触发次数
  // 触发定义：fromSc 场景中标题包含 kw 的已完成任务数
  const chainPerf = {};
  const links = getLinks();
  links.forEach(function(l){
    const key = l.fromSc + "->" + l.toSc;
    const kw = String(l.kw || "").toLowerCase();
    const triggered = inRange.filter(function(t){
      return t.sc === l.fromSc && t.status === "done" &&
             String(t.title || "").toLowerCase().indexOf(kw) >= 0;
    }).length;
    chainPerf[key] = { from: l.fromSc, to: l.toSc, keyword: l.kw, triggered: triggered };
  });

  // 关键指标
  const total = inRange.length;
  const done = inRange.filter(function(t){ return t.status === "done"; }).length;
  const rate = total > 0 ? Math.round(done / total * 100) : 0;

  return {
    type: type,
    range: range,
    summary: { total: total, done: done, rate: rate },
    trend: trend,
    scenarioDistribution: scDist,
    chainPerformance: chainPerf
  };
}

/* ---------- 统计对比 ---------- */
/**
 * 统计对比：当前期 vs 上期
 * @param {("week"|"month"|"year")} type - 报表类型
 * @param {number} [offset=0] - 时间偏移
 * @returns {{current:Object,previous:Object,diff:{total:number,done:number,rate:number}}}
 */
function compareReports(type, offset){
  const off = offset || 0;
  const current = generateReport(type, off);
  const previous = generateReport(type, off - 1);
  return {
    current: current,
    previous: previous,
    diff: {
      total: current.summary.total - previous.summary.total,
      done: current.summary.done - previous.summary.done,
      rate: current.summary.rate - previous.summary.rate
    }
  };
}

/* ---------- 报表 HTML 渲染 ---------- */
/**
 * 渲染报表为 HTML 字符串（用于弹窗展示与 PDF 导出）
 * @param {Object} report - generateReport 返回值
 * @returns {string} HTML 字符串
 */
function renderReportHTML(report){
  const typeNames = { week: t("p5.weekReport", "周报"), month: t("p5.monthReport", "月报"), year: t("p5.yearReport", "年报"), custom: t("p5.customReport", "自定义报表") };
  let html = "<h1>" + esc(typeNames[report.type] || t("p5.report", "报表")) + "</h1>";
  html += t("p5.timeRange", "<p>时间范围：") + esc(report.range.start) + t("p5.to", " 至 ") + esc(report.range.end) + "</p>";

  // 摘要
  html += t("p5.summaryHeader", "<h2>摘要</h2><table><tr><th>总任务</th><th>已完成</th><th>完成率</th></tr>");
  html += "<tr><td>" + report.summary.total + "</td><td>" + report.summary.done + "</td><td>" + report.summary.rate + "%</td></tr></table>";

  // 任务完成趋势
  html += t("p5.trendHeader", "<h2>任务完成趋势</h2><table><tr><th>日期</th><th>完成数</th></tr>");
  const trendDays = Object.keys(report.trend).sort();
  if(trendDays.length === 0){
    html += t("p5.noTrendData", "<tr><td colspan=\"2\">暂无完成数据</td></tr>");
  } else {
    trendDays.forEach(function(day){
      html += "<tr><td>" + esc(day) + "</td><td>" + report.trend[day] + "</td></tr>";
    });
  }
  html += "</table>";

  // 场景分布
  html += t("p5.sceneDistHeader", "<h2>场景分布</h2><table><tr><th>场景</th><th>任务数</th></tr>");
  Object.keys(report.scenarioDistribution).forEach(function(sc){
    const name = SCENARIOS[sc] ? SCENARIOS[sc].name : sc;
    html += "<tr><td>" + esc(name) + "</td><td>" + report.scenarioDistribution[sc] + "</td></tr>";
  });
  html += "</table>";

  // 联动表现
  html += t("p5.chainHeader", "<h2>联动表现</h2><table><tr><th>规则</th><th>触发次数</th></tr>");
  const chainKeys = Object.keys(report.chainPerformance);
  if(chainKeys.length === 0){
    html += t("p5.noChainData", "<tr><td colspan=\"2\">暂无联动规则</td></tr>");
  } else {
    chainKeys.forEach(function(key){
      const c = report.chainPerformance[key];
      const fromName = SCENARIOS[c.from] ? SCENARIOS[c.from].name : c.from;
      const toName = SCENARIOS[c.to] ? SCENARIOS[c.to].name : c.to;
      html += "<tr><td>" + esc(fromName) + "(" + esc(c.keyword || "") + ")→" + esc(toName) + "</td><td>" + c.triggered + "</td></tr>";
    });
  }
  html += "</table>";

  return html;
}

/* ---------- 对比报表 HTML 渲染 ---------- */
/**
 * 渲染对比报表为 HTML 字符串
 * @param {Object} cmp - compareReports 返回值
 * @returns {string} HTML 字符串
 */
function renderCompareHTML(cmp){
  const c = cmp.current, p = cmp.previous;
  const typeNames = { week: t("p5.weekReport", "周报"), month: t("p5.monthReport", "月报"), year: t("p5.yearReport", "年报"), custom: t("p5.customReport", "自定义报表") };
  let html = "<h1>" + esc(typeNames[c.type] || t("p5.report", "报表")) + t("p5.compareSuffix", " 对比</h1>");
  html += t("p5.currentPeriod", "<p>当前期：") + esc(c.range.start) + t("p5.to", " 至 ") + esc(c.range.end) + "</p>";
  html += t("p5.lastPeriod", "<p>上期：") + esc(p.range.start) + t("p5.to", " 至 ") + esc(p.range.end) + "</p>";

  // 摘要对比
  const diffSign = function(v){ return v > 0 ? "+" + v : "" + v; };
  const diffColor = function(v){ return v > 0 ? "var(--ok)" : v < 0 ? "var(--danger)" : "var(--muted)"; };
  html += t("p5.summaryCompareHeader", "<h2>摘要对比</h2><table><tr><th>指标</th><th>当前期</th><th>上期</th><th>差值</th></tr>");
  html += t("p5.totalTaskRow", "<tr><td>总任务</td><td>") + c.summary.total + "</td><td>" + p.summary.total + "</td>" +
          "<td style=\"color:" + diffColor(cmp.diff.total) + "\">" + diffSign(cmp.diff.total) + "</td></tr>";
  html += t("p5.doneTaskRow", "<tr><td>已完成</td><td>") + c.summary.done + "</td><td>" + p.summary.done + "</td>" +
          "<td style=\"color:" + diffColor(cmp.diff.done) + "\">" + diffSign(cmp.diff.done) + "</td></tr>";
  html += t("p5.rateRow", "<tr><td>完成率</td><td>") + c.summary.rate + "%</td><td>" + p.summary.rate + "%</td>" +
          "<td style=\"color:" + diffColor(cmp.diff.rate) + "\">" + diffSign(cmp.diff.rate) + "%</td></tr>";
  html += "</table>";

  // 场景分布对比
  html += t("p5.sceneCompareHeader", "<h2>场景分布对比</h2><table><tr><th>场景</th><th>当前期</th><th>上期</th><th>差值</th></tr>");
  Object.keys(c.scenarioDistribution).forEach(function(sc){
    const name = SCENARIOS[sc] ? SCENARIOS[sc].name : sc;
    const cv = c.scenarioDistribution[sc];
    const pv = p.scenarioDistribution[sc] || 0;
    const dv = cv - pv;
    html += "<tr><td>" + esc(name) + "</td><td>" + cv + "</td><td>" + pv + "</td>" +
            "<td style=\"color:" + diffColor(dv) + "\">" + diffSign(dv) + "</td></tr>";
  });
  html += "</table>";

  return html;
}

/* ---------- PDF 导出 ---------- */
/**
 * 导出报表 PDF（通过 window.print 调用浏览器打印）
 * @param {Object} report - generateReport 返回值
 * @returns {void}
 */
function exportReportPDF(report){
  const html = renderReportHTML(report);
  let w = null;
  try{ w = window.open("", "_blank"); }catch(e){ /* noop */ }
  if(!w){ toast(t("p5.noNewWindow", "无法打开新窗口，请检查弹窗拦截"), "warn"); return; }
  w.document.write("<html><head><title>" + esc(t("app.name")) + t("p5.reportSuffix", " 报表</title>"));
  // 注入 CSS 变量定义（从主文档读取 :root 令牌，保证打印页颜色一致）
  w.document.write("<style>");
  w.document.write(":root{");
  let rootStyle = "";
  try{ rootStyle = window.getComputedStyle(document.documentElement).cssText; }catch(e){ /* noop */ }
  if(rootStyle){ w.document.write(rootStyle); }
  w.document.write("}");
  w.document.write("body{font-family:system-ui,sans-serif;max-width:800px;margin:40px auto;padding:var(--space-5);color:var(--text)}");
  w.document.write("h1{color:var(--accent);font-size:var(--fs-3xl)}");
  w.document.write("h2{font-size:var(--fs-md);margin-top:var(--space-6)}");
  w.document.write("table{width:100%;border-collapse:collapse;margin:var(--space-2) 0}");
  w.document.write("td,th{border:1px solid var(--line);padding:var(--space-2);text-align:left}");
  w.document.write("th{background:var(--surface-muted);font-weight:600}");
  w.document.write("p{color:var(--muted)}");
  w.document.write("</style>");
  w.document.write("</head><body>" + sanitizeHtml(html) + "</body></html>");
  w.document.close();
  w.focus();
  setTimeout(function(){ try{ w.print(); }catch(e){ /* noop */ } }, 500);
}

/* ---------- 报表弹窗 ---------- */
/**
 * 当前报表状态（类型 + 偏移），用于弹窗内切换
 */
const _reportModalState = { type: "week", offset: 0, comparing: false };

/**
 * 打开报表弹窗
 * @param {string} [type="week"] - 报表类型
 * @param {number} [offset=0] - 时间偏移
 * @returns {void}
 */
function openReportModal(type, offset){
  _reportModalState.type = type || "week";
  _reportModalState.offset = offset || 0;
  _reportModalState.comparing = false;
  _renderReportModal();
  const modal = $("#reportModal");
  if(modal) modal.classList.add("show");
  const ov = $("#overlay");
  if(ov) ov.classList.add("show");
}
/**
 * 关闭报表弹窗
 * @returns {void}
 */
function closeReportModal(){
  const modal = $("#reportModal");
  if(modal) modal.classList.remove("show");
  const ov = $("#overlay");
  if(ov) ov.classList.remove("show");
}
/**
 * 渲染报表弹窗内容（根据当前状态）
 * @returns {void}
 */
function _renderReportModal(){
  const content = $("#reportContent");
  const rangeEl = $("#reportRange");
  const typeSel = $("#reportType");
  if(!content) return;
  if(typeSel) typeSel.value = _reportModalState.type;
  const report = generateReport(_reportModalState.type, _reportModalState.offset);
  if(rangeEl) rangeEl.textContent = report.range.start + t("p5.to", " 至 ") + report.range.end;
  if(_reportModalState.comparing){
    const cmp = compareReports(_reportModalState.type, _reportModalState.offset);
    content.innerHTML = sanitizeHtml(renderCompareHTML(cmp));
  } else {
    content.innerHTML = sanitizeHtml(renderReportHTML(report));
  }
}
/**
 * 绑定报表弹窗内的事件（类型切换 / 上一期 / 下一期 / 对比 / 导出 PDF / 关闭）
 * @returns {void}
 */
function bindReportModal(){
  const typeSel = $("#reportType");
  if(typeSel) typeSel.onchange = function(){
    _reportModalState.type = typeSel.value;
    _reportModalState.offset = 0;
    _renderReportModal();
  };
  const prev = $("#btnReportPrev");
  if(prev) prev.onclick = function(){
    _reportModalState.offset--;
    _renderReportModal();
  };
  const next = $("#btnReportNext");
  if(next) next.onclick = function(){
    _reportModalState.offset++;
    _renderReportModal();
  };
  const cmp = $("#btnReportCompare");
  if(cmp) cmp.onclick = function(){
    _reportModalState.comparing = !_reportModalState.comparing;
    cmp.textContent = _reportModalState.comparing ? t("p5.backToReport", "返回报表") : t("p5.compare", "对比");
    _renderReportModal();
  };
  const pdf = $("#btnReportPDF");
  if(pdf) pdf.onclick = function(){
    const report = generateReport(_reportModalState.type, _reportModalState.offset);
    exportReportPDF(report);
  };
  const close = $("#btnReportClose");
  if(close) close.onclick = closeReportModal;
}// ===== AI Agent Engine (v1.6-A) =====
/* ---------- v1.6-A AI Agent 多步推理引擎 ----------
 * 能力：
 *   1) aiDecomposeTask      — AI 自动拆解复杂任务为 3-5 个子任务
 *   2) aiSmartRecommend     — AI 智能推荐（基于用户行为推荐下一步行动）
 *   3) aiGenerateCode       — AI 代码生成片段（编程场景）
 *   4) 语音输入/输出         — Web Speech API（SpeechRecognition + SpeechSynthesis）
 *
 * 设计约定：
 *   - AI 调用复用既有 chatOnce（OpenAI 兼容协议，含重试/取消/超时/安全校验）
 *   - 所有颜色用 var(--token) CSS 令牌（lint-colors 门禁）
 *   - innerHTML 赋值用 sanitizeHtml 包裹
 *   - 语音 API 在不支持环境（jsdom/旧浏览器）下安全降级，不抛错
 */

/* ---------- 内部辅助：从 chatOnce 响应提取文本 content ---------- */
/**
 * 调用 AI 并提取回复文本（封装 chatOnce + content 提取 + 错误处理）
 * @param {Array<{role:string,content:string}>} messages - 消息列表
 * @returns {Promise<string|null>} 回复文本；失败返回 null
 */
async function _aiChatText(messages){
  try{
    const j = await chatOnce(messages);
    const content = j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
    return content || null;
  }catch(e){
    return null;
  }
}

/* ---------- 1) AI 自动拆解复杂任务 ---------- */
/**
 * AI 自动拆解复杂任务为 3-5 个子任务
 * v1.7-A：可选使用 agentPlan 做更智能的本地分解（通过 useLocalPlan 选项启用）
 * @param {string} taskTitle - 任务标题
 * @param {string} [scenario] - 场景键（office/code/study/life），可选
 * @param {Object} [opts] - 选项 {useLocalPlan: boolean}，可选（v1.7-A）
 * @returns {Promise<Array<{title:string,priority:string}>|null>} 子任务列表；无 AI Key 或失败返回 null
 */
async function aiDecomposeTask(taskTitle, scenario, opts){
  const profile = getActiveProfile();

  /* v1.7-A：显式启用 useLocalPlan 时，无 AI Key 降级使用 agentPlan 本地分解 */
  if(!profile || !profile.key){
    if(opts && opts.useLocalPlan && typeof agentPlan === "function"){
      const steps = agentPlan(taskTitle, {scenario: scenario});
      if(steps && steps.length){
        return steps.map(function(s){
          return {
            title: (s.params && (s.params.title || s.params.task_id || s.params.query)) || s.action,
            priority: "medium"
          };
        });
      }
    }
    return null;
  }

  let prompt = t("p5.splitPrompt", "请将以下任务拆解为3-5个可执行的子任务，每个子任务一行，格式：子任务标题|优先级(high/medium/low)\n");
  prompt += t("p5.sceneLabel", "场景：") + (SCENARIOS[scenario] ? SCENARIOS[scenario].name : (scenario || t("p5.general", "通用"))) + "\n";
  prompt += t("p5.taskLabel", "任务：") + taskTitle + "\n";
  prompt += t("p5.splitSuffix", "请只返回子任务列表，不要其他内容。");

  const resp = await _aiChatText([
    {role: "system", content: t("p5.splitSystem", "你是任务管理助手，擅长将复杂任务拆解为可执行步骤。只返回子任务列表，每行一条，格式：标题|优先级。")},
    {role: "user", content: prompt}
  ]);
  if(resp === null) return null;
  return parseDecomposeResult(resp);
}

/**
 * v1.7-A：AI Agent 自主执行集成入口
 * 将目标交给 agentRun 自主执行（plan→execute→verify→修正）
 * @param {string} goal - 目标描述
 * @param {Object} [context] - 上下文
 * @param {number} [maxSteps] - 最大步数
 * @returns {Object} agentRun 执行结果 {goal, steps, log, success, summary}
 */
function aiAgentAutoRun(goal, context, maxSteps){
  if(typeof agentRun !== "function") return {goal: goal, steps: [], log: [], success: false, summary: t("p5.agentRunUnavailable", "agentRun 不可用")};
  return agentRun(goal, context, maxSteps);
}

/**
 * 解析 AI 拆解结果文本为子任务数组（纯函数，供测试）
 * 格式：每行 "子任务标题|优先级"，支持 "1. 标题|high" 带序号前缀
 * @param {string} text - AI 返回文本
 * @returns {Array<{title:string,priority:string}>} 子任务列表（最多 5 个）
 */
function parseDecomposeResult(text){
  if(!text) return [];
  const lines = String(text).split("\n").filter(function(l){ return l.trim(); });
  return lines.map(function(line){
    const parts = line.split("|");
    return {
      title: parts[0].replace(/^\d+\.\s*/, "").replace(/^[-•*\s]+/, "").trim(),
      priority: parts[1] ? parts[1].trim().toLowerCase() : "medium"
    };
  }).filter(function(t){ return t.title; }).slice(0, 5);
}

/* ---------- 2) AI 智能推荐 ---------- */
/**
 * AI 智能推荐：基于用户行为数据（待办/已完成/逾期）推荐 3 条下一步行动
 * @returns {Promise<string[]>} 建议列表（最多 3 条）；无 AI Key 或失败返回空数组
 */
async function aiSmartRecommend(){
  const tasks = getActiveTasks();
  const profile = getActiveProfile();
  if(!profile || !profile.key) return [];

  // 收集用户行为数据
  const pending = tasks.filter(function(t){ return t.status !== "done"; });
  const done = tasks.filter(function(t){ return t.status === "done"; });
  const now = Date.now();
  const overdue = pending.filter(function(t){ return t.due && new Date(t.due).getTime() < now; });

  let prompt = t("p5.suggestPrompt", "基于以下用户数据，推荐3个下一步行动建议：\n");
  prompt += t("p5.pendingCount", "待办任务数：") + pending.length + "\n";
  prompt += t("p5.doneCount", "已完成任务数：") + done.length + "\n";
  prompt += t("p5.overdueCount", "逾期任务数：") + overdue.length + "\n";
  prompt += t("p5.overdueTitles", "逾期任务标题：") + overdue.slice(0,5).map(function(t){ return t.title; }).join(", ") + "\n";
  prompt += t("p5.pendingTitles", "待办任务标题：") + pending.slice(0,8).map(function(t){ return t.title; }).join(", ") + "\n";
  prompt += t("p5.suggestSuffix", "请返回3条具体、可执行的建议，每条一行，不要序号。");

  const resp = await _aiChatText([
    {role: "system", content: t("p5.suggestSystem", "你是效率教练，给出具体可执行的建议。只返回建议列表，每行一条，不要序号和其他内容。")},
    {role: "user", content: prompt}
  ]);
  if(resp === null) return [];
  return resp.split("\n").filter(function(l){ return l.trim(); }).map(function(l){
    return l.replace(/^\d+\.\s*/, "").replace(/^[-•*\s]+/, "").trim();
  }).filter(function(l){ return l; }).slice(0, 3);
}

/* ---------- 3) AI 代码生成（编程场景） ---------- */
/**
 * AI 代码生成片段
 * @param {string} description - 需求描述
 * @param {string} [language] - 编程语言（默认 javascript）
 * @returns {Promise<string|null>} 代码片段文本；无 AI Key 或失败返回 null
 */
async function aiGenerateCode(description, language){
  const profile = getActiveProfile();
  if(!profile || !profile.key) return null;

  const lang = language || "javascript";
  const prompt = t("p5.codePromptPrefix", "请为以下需求生成代码片段（语言：") + lang + t("p5.codePromptMid", "）：\n") + description + t("p5.codePromptSuffix", "\n请用```代码块包裹，只返回代码片段。");

  const resp = await _aiChatText([
    {role: "system", content: t("p5.codeSystem", "你是编程助手，返回简洁的代码片段，用```代码块包裹。")},
    {role: "user", content: prompt}
  ]);
  return resp;
}

// ===== Pomodoro Timer (v1.6-B) =====
/* ---------- v1.6-B 笃行：25 分钟专注 + 5 分钟休息 ----------
 * 能力：
 *   1) startPomodoro(taskId)  — 启动一轮专注（可选关联任务）
 *   2) stopPomodoro()         — 中止当前轮次（不计入完成数）
 *   3) getPomoState()         — 当前状态快照 {mode,remaining,taskId,count}
 *   4) getPomoCount()         — 今日已完成笃行数（按 YYYY-MM-DD 持久化）
 *
 * 设计约定：
 *   - 状态机：idle → focus → break → idle（专注结束自动进入休息，休息结束回 idle）
 *   - 持久化：每日笃行数按 _ymd(new Date()) 为键存 localStorage（PREFIX+"pomo_count"）
 *   - 通知：复用既有 toast()；专注/休息结束触发提醒
 *   - 计时：setInterval 1s 推进；jsdom 测试用 fake timers 推进
 *   - 所有颜色用 var(--token) CSS 令牌（lint-colors 门禁）
 *   - innerHTML 赋值用 sanitizeHtml 包裹
 */
const POMO_FOCUS_MIN = 25;
const POMO_BREAK_MIN = 5;
const _pomoState = { mode: "idle", remaining: 0, taskId: null, count: 0, timer: null };

/**
 * 启动一轮笃行专注（25 分钟）。仅在 idle 状态可启动；其他状态返回 false。
 * @param {string} [taskId] - 关联任务 id（可选，用于「为某任务专注」）
 * @returns {boolean} 是否成功启动
 */
function startPomodoro(taskId){
  if(_pomoState.mode !== "idle") return false;
  _pomoState.mode = "focus";
  _pomoState.remaining = POMO_FOCUS_MIN * 60;
  _pomoState.taskId = taskId || null;
  // 启动新一轮时把今日已完成数从存储读回，避免跨轮次累计丢失
  _pomoState.count = getPomoCount();
  _pomoState.timer = setInterval(_pomoTick, 1000);
  _pomoRender();
  return true;
}
/**
 * 内部：每秒推进笃行。专注结束 → 自动进入休息（count++ 并持久化）；
 * 休息结束 → 回到 idle 并提示开始新一轮。
 * @returns {void}
 */
function _pomoTick(){
  _pomoState.remaining--;
  if(_pomoState.remaining <= 0){
    if(_pomoState.mode === "focus"){
      _pomoState.count++;
      _savePomoCount();
      _pomoState.mode = "break";
      _pomoState.remaining = POMO_BREAK_MIN * 60;
      _pomoNotify(t("p5.focusDone", "专注完成！休息一下"), "ok");
    } else {
      _pomoState.mode = "idle";
      _pomoState.remaining = 0;
      if(_pomoState.timer){ clearInterval(_pomoState.timer); _pomoState.timer = null; }
      _pomoNotify(t("p5.breakDone", "休息结束，开始新一轮专注"), "ok");
    }
  }
  _pomoRender();
}
/**
 * 中止当前笃行轮次。不计入完成数；清除计时器并回到 idle。
 * @returns {void}
 */
function stopPomodoro(){
  if(_pomoState.timer){ clearInterval(_pomoState.timer); _pomoState.timer = null; }
  _pomoState.mode = "idle";
  _pomoState.remaining = 0;
  _pomoState.taskId = null;
  _pomoRender();
}
/**
 * 获取笃行当前状态快照（不暴露 timer 内部句柄）
 * @returns {{mode:string,remaining:number,taskId:(string|null),count:number}}
 */
function getPomoState(){
  return { mode: _pomoState.mode, remaining: _pomoState.remaining, taskId: _pomoState.taskId, count: _pomoState.count };
}
/**
 * 获取今日已完成笃行数（按 YYYY-MM-DD 分桶持久化）
 * @returns {number}
 */
function getPomoCount(){
  const today = _ymd(new Date());
  try{
    const d = JSON.parse(localStorage.getItem(PREFIX+"pomo_count") || "{}");
    return d[today] || 0;
  }catch(e){ return 0; }
}
/**
 * 内部：持久化今日笃行数到 localStorage
 * @returns {void}
 */
function _savePomoCount(){
  const today = _ymd(new Date());
  try{
    const d = JSON.parse(localStorage.getItem(PREFIX+"pomo_count") || "{}");
    d[today] = _pomoState.count;
    localStorage.setItem(PREFIX+"pomo_count", JSON.stringify(d));
  }catch(e){ /* localStorage 不可用时静默降级 */ }
}
/**
 * 内部：渲染笃行显示区（#pomoDisplay）。无 DOM 时 no-op（测试环境）
 * @returns {void}
 */
function _pomoRender(){
  const el = $("#pomoDisplay");
  if(!el) return;
  const min = Math.floor(_pomoState.remaining / 60);
  const sec = _pomoState.remaining % 60;
  const text = String(min).padStart(2, "0") + ":" + String(sec).padStart(2, "0");
  const label = _pomoState.mode === "focus" ? t("p5.focus", "专注") : (_pomoState.mode === "break" ? t("p5.break", "休息") : t("p5.idle", "空闲"));
  el.textContent = label + " " + text;
  // 更新今日计数显示
  const cntEl = $("#pomoCount");
  if(cntEl) cntEl.textContent = String(getPomoCount());
  // v1.9.7：同步侧栏「工具」组笃行入口的运行态徽标（运行中显示倒计时，空闲隐藏）
  const sideBadge = $("#sidePomoBadge");
  if(sideBadge){
    if(_pomoState.mode === "focus" || _pomoState.mode === "break"){
      sideBadge.textContent = text;
      sideBadge.style.display = "";
    }else{
      sideBadge.style.display = "none";
    }
  }
}
/**
 * 内部：通知（复用 toast；toast 不可用时 no-op）
 * @param {string} msg - 通知文案
 * @param {string} [type] - 通知类型
 * @returns {void}
 */
function _pomoNotify(msg, type){
  if(typeof toast === "function") toast(msg, type || "ok");
}// ===== Time Tracker (v1.6-B) =====
/* ---------- v1.6-B 时间追踪：每个任务记录实际耗时 ----------
 * 能力：
 *   1) startTracking(taskId)  — 开始为某任务计时（自动停止旧任务）
 *   2) pauseTracking()        — 暂停当前计时（保留累计耗时）
 *   3) resumeTracking()       — 恢复已暂停的计时
 *   4) stopTracking()         — 停止并保存累计耗时到 localStorage
 *   5) getTrackerState()      — 当前追踪状态快照
 *   6) getTaskTime(taskId)    — 读取某任务历史累计耗时（ms）
 *
 * 设计约定：
 *   - 单任务追踪：同一时刻只追踪一个任务；切换任务自动 stop 旧任务
 *   - 持久化：按 taskId 分桶存 localStorage（PREFIX+"task_time"），值为累计毫秒数
 *   - 计时：setInterval 1s 推进显示；暂停时停止 interval 但保留 elapsed
 *   - 显示：#trackerDisplay 元素显示 HH:MM:SS（无 DOM 时 no-op，测试环境友好）
 *   - 所有颜色用 var(--token) CSS 令牌（lint-colors 门禁）
 */
const _tracker = { taskId: null, startedAt: null, elapsed: 0, paused: false, timer: null };

/**
 * 开始为指定任务计时。若已有正在追踪的其他任务，先停止旧任务再启动新任务。
 * @param {string} taskId - 任务 id
 * @returns {boolean} 是否成功启动
 */
function startTracking(taskId){
  if(!taskId) return false;
  if(_tracker.taskId && _tracker.taskId !== taskId) stopTracking();
  _tracker.taskId = taskId;
  _tracker.startedAt = Date.now();
  _tracker.elapsed = _getTaskElapsed(taskId);
  _tracker.paused = false;
  if(_tracker.timer){ clearInterval(_tracker.timer); }
  _tracker.timer = setInterval(_trackTick, 1000);
  _trackTick(); // 立即渲染一次，避免首秒空白
  return true;
}
/**
 * 暂停当前任务计时。把已运行时长累加到 elapsed 并持久化；停止 interval。
 * @returns {boolean} 是否成功暂停
 */
function pauseTracking(){
  if(!_tracker.taskId || _tracker.paused) return false;
  _tracker.elapsed += Date.now() - _tracker.startedAt;
  _tracker.paused = true;
  if(_tracker.timer){ clearInterval(_tracker.timer); _tracker.timer = null; }
  _saveTaskElapsed(_tracker.taskId, _tracker.elapsed);
  _renderTrackerDisplay(_tracker.elapsed);
  return true;
}
/**
 * 恢复已暂停的任务计时。重置 startedAt 为当前时间并重启 interval。
 * @returns {boolean} 是否成功恢复
 */
function resumeTracking(){
  if(!_tracker.taskId || !_tracker.paused) return false;
  _tracker.paused = false;
  _tracker.startedAt = Date.now();
  _tracker.timer = setInterval(_trackTick, 1000);
  return true;
}
/**
 * 停止当前任务计时并保存累计耗时。若未暂停，先把运行时长累加到 elapsed。
 * @returns {boolean} 是否成功停止
 */
function stopTracking(){
  if(!_tracker.taskId) return false;
  if(!_tracker.paused) _tracker.elapsed += Date.now() - _tracker.startedAt;
  _saveTaskElapsed(_tracker.taskId, _tracker.elapsed);
  if(_tracker.timer){ clearInterval(_tracker.timer); _tracker.timer = null; }
  _tracker.taskId = null;
  _tracker.startedAt = null;
  _tracker.paused = false;
  _renderTrackerDisplay(0);
  return true;
}
/**
 * 内部：每秒推进追踪显示。当前总耗时 = elapsed + (now - startedAt)
 * @returns {void}
 */
function _trackTick(){
  if(!_tracker.taskId || _tracker.paused) return;
  const now = Date.now();
  const total = _tracker.elapsed + (now - _tracker.startedAt);
  _renderTrackerDisplay(total);
}
/**
 * 内部：渲染追踪显示区（#trackerDisplay）。格式 HH:MM:SS。无 DOM 时 no-op。
 * @param {number} ms - 毫秒数
 * @returns {void}
 */
function _renderTrackerDisplay(ms){
  const el = $("#trackerDisplay");
  if(!el) return;
  let s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600); s %= 3600;
  const m = Math.floor(s / 60); s %= 60;
  el.textContent = String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
  // v1.9.7：同步侧栏「工具」组时间追踪入口的运行态徽标（计时中显示 MM:SS，停止隐藏）
  const sideBadge = $("#sideTrackerBadge");
  if(sideBadge){
    if(ms > 0){
      const mm = h * 60 + m;
      sideBadge.textContent = (mm > 0 ? String(mm) : "<1") + t("p5.minute", "分");
      sideBadge.style.display = "";
    }else{
      sideBadge.style.display = "none";
    }
  }
}
/**
 * 内部：从 localStorage 读取某任务历史累计耗时
 * @param {string} taskId - 任务 id
 * @returns {number} 毫秒数（无记录返回 0）
 */
function _getTaskElapsed(taskId){
  try{
    const d = JSON.parse(localStorage.getItem(PREFIX+"task_time") || "{}");
    return d[taskId] || 0;
  }catch(e){ return 0; }
}
/**
 * 内部：把某任务累计耗时写入 localStorage
 * @param {string} taskId - 任务 id
 * @param {number} ms - 毫秒数
 * @returns {void}
 */
function _saveTaskElapsed(taskId, ms){
  try{
    const d = JSON.parse(localStorage.getItem(PREFIX+"task_time") || "{}");
    d[taskId] = ms;
    localStorage.setItem(PREFIX+"task_time", JSON.stringify(d));
  }catch(e){ /* localStorage 不可用时静默降级 */ }
}
/**
 * 获取追踪器当前状态快照（不暴露 timer 内部句柄）
 * @returns {{taskId:(string|null),startedAt:(number|null),elapsed:number,paused:boolean}}
 */
function getTrackerState(){
  return { taskId: _tracker.taskId, startedAt: _tracker.startedAt, elapsed: _tracker.elapsed, paused: _tracker.paused };
}
/**
 * 读取某任务历史累计耗时（ms）。供 UI 显示「已花费 X 小时」。
 * @param {string} taskId - 任务 id
 * @returns {number} 毫秒数
 */
function getTaskTime(taskId){
  return _getTaskElapsed(taskId);
}// ===== Calendar View (v1.6-B) =====
/* ---------- v1.6-B 日历视图：月历看任务 dueDate 分布 ----------
 * 能力：
 *   1) renderCalendarView(monthOffset)  — 生成某月日历 HTML（含任务计数徽章）
 *   2) getCalendarMonthData(monthOffset) — 返回某月 {year, month} 数字
 *   3) renderWeekView(weekOffset)        — 生成某周日历 HTML（7 天列表）
 *   4) bindCalendarEvents(container)     — 绑定月份切换/日期点击事件
 *
 * 设计约定：
 *   - 周一为一周起点（getDay()+6)%7
 *   - 任务按 dueDate（YYYY-MM-DD）分桶；同日多个任务在格子里显示徽章数字
 *   - 今日格子加 .today 类；有任务的格子加 .has-tasks 类
 *   - 所有颜色用 var(--token) CSS 令牌（lint-colors 门禁）
 *   - innerHTML 赋值用 sanitizeHtml 包裹（调用方负责）
 */
/**
 * 渲染月历视图 HTML
 * @param {number} [monthOffset=0] - 月偏移（0=本月，-1=上月，1=下月）
 * @returns {string} 日历 HTML（含表头/星期表头/日期格子）
 */
function renderCalendarView(monthOffset){
  const data = getCalendarMonthData(monthOffset);
  const year = data.year, month = data.month;

  const firstDay = new Date(year, month, 1);
  const startWeekday = (firstDay.getDay() + 6) % 7; // 周一=0
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const tasks = getActiveTasks();
  const taskByDate = {};
  tasks.forEach(function(t){
    if(t.due){
      const d = new Date(t.due);
      const key = _ymd(d);
      if(!taskByDate[key]) taskByDate[key] = [];
      taskByDate[key].push(t);
    }
  });

  let html = '<div class="cal-header">';
  html += '<button type="button" class="cal-nav" data-cal-prev title="' + t("p5.prevMonth", "上一月") + '">‹</button>';
  html += '<span class="cal-title">' + year + t("p5.yearSuffix", "年") + (month + 1) + t("p5.monthSuffix", "月</span>");
  html += '<button type="button" class="cal-nav" data-cal-next title="' + t("p5.nextMonth", "下一月") + '">›</button>';
  html += '</div>';
  html += '<div class="cal-grid">';
  [t("p5.dow1","一"),t("p5.dow2","二"),t("p5.dow3","三"),t("p5.dow4","四"),t("p5.dow5","五"),t("p5.dow6","六"),t("p5.dow7","日")].forEach(function(d){
    html += '<div class="cal-dow">' + d + '</div>';
  });
  for(let i = 0; i < startWeekday; i++) html += '<div class="cal-day empty"></div>';
  const todayKey = _ymd(new Date());
  for(let d = 1; d <= daysInMonth; d++){
    const dateStr = year + "-" + String(month + 1).padStart(2, "0") + "-" + String(d).padStart(2, "0");
    const dayTasks = taskByDate[dateStr] || [];
    let cls = "cal-day";
    if(dayTasks.length > 0) cls += " has-tasks";
    if(dateStr === todayKey) cls += " today";
    html += '<div class="' + cls + '" data-cal-date="' + dateStr + '">';
    html += '<span class="cal-num">' + d + '</span>';
    if(dayTasks.length > 0) html += '<span class="cal-badge">' + dayTasks.length + '</span>';
    html += '</div>';
  }
  html += '</div>';
  return html;
}
/**
 * 获取某月的年份/月份数字（处理跨年偏移）
 * @param {number} [monthOffset=0] - 月偏移
 * @returns {{year:number,month:number}} month 为 0-11
 */
function getCalendarMonthData(monthOffset){
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth() + (monthOffset || 0);
  while(month < 0){ month += 12; year--; }
  while(month > 11){ month -= 12; year++; }
  return { year: year, month: month };
}
/**
 * 渲染周历视图 HTML（7 天列表，每天显示任务数与标题预览）
 * @param {number} [weekOffset=0] - 周偏移（0=本周，-1=上周）
 * @returns {string} 周历 HTML
 */
function renderWeekView(weekOffset){
  const now = new Date();
  const wd = (now.getDay() + 6) % 7; // 周一=0
  const mon = new Date(now);
  mon.setDate(now.getDate() - wd + (weekOffset || 0) * 7);
  mon.setHours(0, 0, 0, 0);

  const tasks = getActiveTasks();
  const taskByDate = {};
  tasks.forEach(function(t){
    if(t.due){
      const key = _ymd(new Date(t.due));
      if(!taskByDate[key]) taskByDate[key] = [];
      taskByDate[key].push(t);
    }
  });

  const todayKey = _ymd(new Date());
  let html = '<div class="cal-header">';
  html += '<button type="button" class="cal-nav" data-cal-prev-week title="' + t("p5.prevWeek", "上一周") + '">‹</button>';
  html += '<span class="cal-title">' + t("p5.weekView", "周视图") + '</span>';
  html += '<button type="button" class="cal-nav" data-cal-next-week title="' + t("p5.nextWeek", "下一周") + '">›</button>';
  html += '</div>';
  html += '<div class="week-grid">';
  const dowNames = [t("p5.mon","周一"),t("p5.tue","周二"),t("p5.wed","周三"),t("p5.thu","周四"),t("p5.fri","周五"),t("p5.sat","周六"),t("p5.sun","周日")];
  for(let i = 0; i < 7; i++){
    const d = new Date(mon);
    d.setDate(mon.getDate() + i);
    const key = _ymd(d);
    const dayTasks = taskByDate[key] || [];
    let cls = "week-day";
    if(dayTasks.length > 0) cls += " has-tasks";
    if(key === todayKey) cls += " today";
    html += '<div class="' + cls + '" data-cal-date="' + key + '">';
    html += '<div class="week-day-head"><span class="week-dow">' + dowNames[i] + '</span>';
    html += '<span class="week-date">' + (d.getMonth() + 1) + '/' + d.getDate() + '</span></div>';
    if(dayTasks.length > 0){
      html += '<ul class="week-task-list">';
      dayTasks.slice(0, 3).forEach(function(t){
        html += '<li class="week-task-item">' + esc(t.title) + '</li>';
      });
      if(dayTasks.length > 3) html += '<li class="week-task-more">+' + (dayTasks.length - 3) + '</li>';
      html += '</ul>';
    } else {
      html += '<div class="week-empty">—</div>';
    }
    html += '</div>';
  }
  html += '</div>';
  return html;
}
/**
 * 绑定日历视图事件（上一月/下一月/日期点击）
 * @param {HTMLElement} [container] - 日历容器（默认 #calendarView）
 * @returns {void}
 */
function bindCalendarEvents(container){
  const c = container || $("#calendarView");
  if(!c) return;
  const prev = c.querySelector("[data-cal-prev]");
  const next = c.querySelector("[data-cal-next]");
  if(prev && !prev._calBound){
    prev._calBound = true;
    prev.onclick = function(){
      const off = parseInt(c.dataset.offset || "0", 10) - 1;
      c.dataset.offset = String(off);
      c.innerHTML = sanitizeHtml(renderCalendarView(off));
      bindCalendarEvents(c);
    };
  }
  if(next && !next._calBound){
    next._calBound = true;
    next.onclick = function(){
      const off = parseInt(c.dataset.offset || "0", 10) + 1;
      c.dataset.offset = String(off);
      c.innerHTML = sanitizeHtml(renderCalendarView(off));
      bindCalendarEvents(c);
    };
  }
  // 日期格子点击：派发自定义事件供外部监听
  c.querySelectorAll("[data-cal-date]").forEach(function(cell){
    if(cell._calDateBound) return;
    cell._calDateBound = true;
    cell.onclick = function(){
      const date = cell.getAttribute("data-cal-date");
      try{
        const ev = new CustomEvent("cal:date-select", { detail: { date: date } });
        c.dispatchEvent(ev);
      }catch(e){ /* CustomEvent 不可用时 no-op */ }
    };
  });
}// ===== Gantt Chart (v1.6-C 数据可视化增强) =====
/* ---------- 甘特图：任务时间线，按 dueDate 排列，显示任务依赖 ----------
 * 能力：
 *   1) renderGanttChart()       — 生成甘特图 SVG（任务条形按 created→due 时间区间）
 *   2) getGanttData()           — 返回甘特图数据（按 dueDate 升序）
 *   3) openGanttModal()         — 打开甘特图弹窗
 *   4) closeGanttModal()        — 关闭甘特图弹窗
 *
 * 设计约定：
 *   - 仅渲染带 due（截止日期）的任务；due 为 "YYYY-MM-DD" 字符串
 *   - 起点用 created（时间戳），无 created 时回退到 due 解析时间
 *   - 状态色：done→var(--ok)；doing→var(--accent)；todo→var(--muted)
 *   - 所有颜色用 var(--token) CSS 令牌（lint-colors 门禁）
 *   - innerHTML 赋值由调用方用 sanitizeHtml 包裹
 */
/**
 * 把 due 日期字符串("YYYY-MM-DD")解析为时间戳；非法时返回 0
 * @param {string} due - 截止日期字符串
 * @returns {number} 时间戳
 */
function _ganttParseDue(due){
  if(!due) return 0;
  const dueMs = Date.parse(due);
  return isNaN(dueMs) ? 0 : dueMs;
}
/**
 * 渲染甘特图 SVG
 * @returns {string} HTML 字符串（svg 或空状态提示）
 */
function renderGanttChart(){
  const tasks = getActiveTasks().filter(function(t){ return t && t.due; });
  if(tasks.length === 0) return t("p5.noDueTasks", "<p class='empty-hint'>暂无带截止日期的任务</p>");

  // 按 dueDate 升序排序
  tasks.sort(function(a, b){
    return _ganttParseDue(a.due) - _ganttParseDue(b.due);
  });

  // 计算时间范围（min 用最早 created 或 due，max 用最晚 due）
  let minDate = Infinity, maxDate = -Infinity;
  tasks.forEach(function(t){
    const start = (typeof t.created === "number" && t.created) || _ganttParseDue(t.due);
    const end = _ganttParseDue(t.due);
    if(start < minDate) minDate = start;
    if(end > maxDate) maxDate = end;
  });
  // 兜底：minDate 与 maxDate 相等时扩展 1ms，避免除零
  if(maxDate <= minDate) maxDate = minDate + 86400000;
  const range = maxDate - minDate;

  // 生成 SVG
  // labelW 加到 150：给中文标题留足宽度，避免溢出挤压右侧任务条
  const W = 800, labelW = 150, barAreaW = W - labelW - 20;
  const H = tasks.length * 28 + 30;
  let svg = '<svg class="gantt-chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + t("p5.ganttAria", "任务甘特图") + '">';
  // 顶部时间轴基线
  svg += '<line x1="' + labelW + '" y1="20" x2="' + (W - 10) + '" y2="20" stroke="var(--line)" stroke-width="1"/>';
  // 起止日期标签
  const minLabel = _ganttFmtDate(minDate);
  const maxLabel = _ganttFmtDate(maxDate);
  svg += '<text x="' + labelW + '" y="14" font-size="var(--fs-3xs)" fill="var(--muted)">' + esc(minLabel) + '</text>';
  svg += '<text x="' + (W - 10) + '" y="14" text-anchor="end" font-size="var(--fs-3xs)" fill="var(--muted)">' + esc(maxLabel) + '</text>';

  tasks.forEach(function(t, i){
    const y = i * 28 + 26;
    let start = (typeof t.created === "number" && t.created) || _ganttParseDue(t.due);
    let end = _ganttParseDue(t.due);
    if(start < minDate) start = minDate;
    if(end > maxDate) end = maxDate;
    if(end < start) end = start;
    const x1 = labelW + (start - minDate) / range * barAreaW;
    const x2 = labelW + (end - minDate) / range * barAreaW;
    const w = Math.max(x2 - x1, 4);
    const color = t.status === "done" ? "var(--ok)"
              : t.status === "doing" ? "var(--accent)"
              : "var(--muted)";
    // 任务条
    svg += '<rect x="' + x1.toFixed(1) + '" y="' + y + '" width="' + w.toFixed(1) + '" height="18" fill="' + color + '" rx="3"><title>' + esc(t.title || "") + '（' + esc(t.due || "") + '）</title></rect>';
    // 任务标签（左侧）：按视觉宽度截断（中文≈2 单位宽，英文 1 单位），上限 22 单位紧贴 labelW=150 区宽
    const rawTitle = t.title || "";
    let wAcc = 0, cut = rawTitle.length;
    for (let ci = 0; ci < rawTitle.length; ci++){
      wAcc += (/[\u2E80-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF]/.test(rawTitle.charAt(ci)) ? 2 : 1);
      if (wAcc > 22){ cut = ci; break; }
    }
    const label = cut < rawTitle.length ? rawTitle.slice(0, Math.max(1, cut - 1)) + "…" : rawTitle;
    svg += '<text x="6" y="' + (y + 13) + '" class="gantt-label" font-size="var(--fs-2xs)" fill="var(--text)">' + esc(label) + '</text>';
  });
  svg += '</svg>';
  return svg;
}
/**
 * 格式化时间戳为 YYYY-MM-DD
 * @param {number} ts - 时间戳
 * @returns {string} 日期字符串
 */
function _ganttFmtDate(ts){
  const d = new Date(ts);
  if(isNaN(d.getTime())) return "";
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
}
/**
 * 获取甘特图数据（按 dueDate 升序）
 * @returns {Array<{id:string,title:string,start:number,end:number,status:string,scenario:string,due:string}>}
 */
function getGanttData(){
  const tasks = getActiveTasks().filter(function(t){ return t && t.due; });
  tasks.sort(function(a, b){
    return _ganttParseDue(a.due) - _ganttParseDue(b.due);
  });
  return tasks.map(function(t){
    return {
      id: t.id,
      title: t.title || "",
      start: (typeof t.created === "number" && t.created) || _ganttParseDue(t.due),
      end: _ganttParseDue(t.due),
      status: t.status || "todo",
      scenario: t.sc || "",
      due: t.due
    };
  });
}
/**
 * 打开甘特图弹窗（渲染到 #ganttModal）
 * @returns {void}
 */
function openGanttModal(){
  const modal = $("#ganttModal");
  if(!modal) return;
  const body = $("#ganttModalBody");
  if(body) body.innerHTML = sanitizeHtml(renderGanttChart());
  modal.classList.add("show");
}
/**
 * 关闭甘特图弹窗
 * @returns {void}
 */
function closeGanttModal(){
  const modal = $("#ganttModal");
  if(modal) modal.classList.remove("show");
}// ===== Mind Map (v1.6-C 数据可视化增强) =====
/* ---------- 思维导图：任务关系图，场景→任务→子任务树形展开 ----------
 * 能力：
 *   1) renderMindmap()       — 生成思维导图 SVG（中心节点→场景→任务叶子）
 *   2) getMindmapTree()      — 返回按场景分组的任务树
 *   3) openMindmapModal()    — 打开思维导图弹窗
 *   4) closeMindmapModal()   — 关闭思维导图弹窗
 *
 * 设计约定：
 *   - 中心节点："任务"，向外辐射 4 个场景节点（office/code/study/life）
 *   - 每个场景节点再向外展开最多 5 个任务叶子（避免拥挤）
 *   - 所有颜色用 var(--token) CSS 令牌（lint-colors 门禁）
 *   - innerHTML 赋值由调用方用 sanitizeHtml 包裹
 */
/**
 * 渲染思维导图 SVG
 * @returns {string} HTML 字符串（svg）
 */
function renderMindmap(){
  const tasks = getActiveTasks();
  const tree = {};
  ORDER.forEach(function(sc){ tree[sc] = []; });
  tasks.forEach(function(t){
    if(t && t.sc && tree[t.sc]) tree[t.sc].push(t);
  });

  const W = 900, H = 600;
  const cx = W / 2, cy = H / 2;
  let svg = '<svg class="mindmap" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + t("p5.mindmapAria", "任务思维导图") + '">';
  // 中心节点
  svg += '<circle cx="' + cx + '" cy="' + cy + '" r="40" fill="var(--accent)"/>';
  svg += '<text x="' + cx + '" y="' + (cy + 5) + '" text-anchor="middle" fill="var(--on-accent)" font-size="var(--fs-sm)">' + t("p5.task", "任务") + '</text>';

  // 场景分支
  const scCount = ORDER.length;
  ORDER.forEach(function(sc, i){
    const angle = (i / scCount) * 2 * Math.PI - Math.PI / 2;
    const x = cx + Math.cos(angle) * 150;
    const y = cy + Math.sin(angle) * 150;
    const meta = scMeta(sc);
    const name = meta.name;
    // 连线（中心→场景）
    svg += '<line x1="' + cx + '" y1="' + cy + '" x2="' + x.toFixed(1) + '" y2="' + y.toFixed(1) + '" stroke="var(--border)" stroke-width="2"/>';
    // 场景节点
    svg += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="25" fill="var(--surface)" stroke="var(--accent)" stroke-width="2"/>';
    svg += '<text x="' + x.toFixed(1) + '" y="' + (y + 5).toFixed(1) + '" text-anchor="middle" fill="var(--text)" font-size="12">' + esc(name) + '</text>';
    // 任务叶子（最多 5 个，沿同方向外延展开）
    const scTasks = tree[sc] || [];
    const leafCount = Math.min(scTasks.length, 5);
    scTasks.slice(0, 5).forEach(function(t, j){
      const spread = leafCount > 1 ? (j - (leafCount - 1) / 2) * 22 : 0;
      // 沿场景方向外延 80，再垂直方向偏移 spread
      const dx = Math.cos(angle) * 80;
      const dy = Math.sin(angle) * 80;
      // 垂直方向向量（旋转 90°）
      const nx = -Math.sin(angle);
      const ny = Math.cos(angle);
      const tx = x + dx + nx * spread;
      const ty = y + dy + ny * spread;
      // 连线（场景→任务）
      svg += '<line x1="' + x.toFixed(1) + '" y1="' + y.toFixed(1) + '" x2="' + tx.toFixed(1) + '" y2="' + ty.toFixed(1) + '" stroke="var(--line)" stroke-width="1"/>';
      // 任务叶子节点（小圆点 + 文本）
      svg += '<circle cx="' + tx.toFixed(1) + '" cy="' + ty.toFixed(1) + '" r="3" fill="var(--muted)"/>';
      const label = (t.title || "").length > 10 ? (t.title || "").slice(0, 9) + "…" : (t.title || "");
      const textX = tx + (angle > -Math.PI / 2 && angle < Math.PI / 2 ? 6 : -6);
      const anchor = (angle > -Math.PI / 2 && angle < Math.PI / 2) ? "start" : "end";
      svg += '<text x="' + textX.toFixed(1) + '" y="' + (ty + 4).toFixed(1) + '" text-anchor="' + anchor + '" fill="var(--text-dim)" font-size="var(--fs-3xs)">' + esc(label) + '</text>';
    });
    // 超出 5 个时显示省略提示
    if(scTasks.length > 5){
      const moreX = x + Math.cos(angle) * 80;
      const moreY = y + Math.sin(angle) * 80 + leafCount * 11;
      svg += '<text x="' + moreX.toFixed(1) + '" y="' + moreY.toFixed(1) + '" text-anchor="middle" fill="var(--muted)" font-size="var(--fs-3xs)">+' + (scTasks.length - 5) + '</text>';
    }
  });
  svg += '</svg>';
  return svg;
}
/**
 * 获取按场景分组的任务树
 * @returns {Object<string, Array<Task>>} 场景键→任务数组
 */
function getMindmapTree(){
  const tasks = getActiveTasks();
  const tree = {};
  ORDER.forEach(function(sc){ tree[sc] = tasks.filter(function(t){ return t && t.sc === sc; }); });
  return tree;
}
/**
 * 打开思维导图弹窗（渲染到 #mindmapModal）
 * @returns {void}
 */
function openMindmapModal(){
  const modal = $("#mindmapModal");
  if(!modal) return;
  const body = $("#mindmapModalBody");
  if(body) body.innerHTML = sanitizeHtml(renderMindmap());
  modal.classList.add("show");
}
/**
 * 关闭思维导图弹窗
 * @returns {void}
 */
function closeMindmapModal(){
  const modal = $("#mindmapModal");
  if(modal) modal.classList.remove("show");
}// ===== Custom Dashboard (v1.6-C 数据可视化增强) =====
/* ---------- 自定义仪表盘：拖拽组件排列，保存布局到 localStorage ----------
 * 能力：
 *   1) DASHBOARD_WIDGETS             — 预置组件清单（id/name/defaultPos）
 *   2) getDashboardLayout()          — 读取布局（localStorage 优先，否则默认）
 *   3) saveDashboardLayout(layout)   — 持久化布局到 localStorage
 *   4) renderCustomDashboard()       — 渲染仪表盘 HTML（grid 布局 + 拖拽手柄）
 *   5) resetDashboard()              — 重置为默认布局
 *   6) moveDashboardWidget(id, pos)  — 移动组件到新位置
 *   7) openDashboardModal()          — 打开仪表盘弹窗
 *   8) closeDashboardModal()         — 关闭仪表盘弹窗
 *   9) bindDashboardDnD()            — 绑定拖拽事件
 *
 * 设计约定：
 *   - 布局持久化键：PREFIX + "dashboard_layout"
 *   - 拖拽实现：HTML5 DnD（draggable=true），手柄 .widget-drag 触发
 *   - 所有颜色用 var(--token) CSS 令牌（lint-colors 门禁）
 *   - innerHTML 赋值由调用方用 sanitizeHtml 包裹
 */
const DASHBOARD_LAYOUT_KEY = "dashboard_layout";
/**
 * 预置组件清单
 * @type {Array<{id:string,name:string,defaultPos:{x:number,y:number,w:number,h:number}}>}
 */
const DASHBOARD_WIDGETS = [
  /* v2.2.1：组件多元化——列表/表格/操作类与图表类并列；default:true 构成默认布局 */
  { id: "stats",    name: t("dashboard.stats","关键指标"),   default: true,  defaultPos: { x: 1, y: 1, w: 2, h: 1 } },
  { id: "today",    name: t("dashboard.today","今日待办"),   default: true,  defaultPos: { x: 3, y: 1, w: 2, h: 1 } },
  { id: "trend",    name: t("dashboard.trend","任务完成趋势"), default: true,  defaultPos: { x: 5, y: 1, w: 1, h: 2 } },
  { id: "scenes",   name: t("dashboard.scenes","场景概况"),   default: true,  defaultPos: { x: 1, y: 2, w: 2, h: 1 } },
  { id: "pie",      name: t("dashboard.pie","场景分布"),   default: true,  defaultPos: { x: 3, y: 2, w: 1, h: 1 } },
  { id: "heatmap",  name: t("dashboard.heatmap","热力图"),     default: true,  defaultPos: { x: 4, y: 2, w: 1, h: 1 } },
  { id: "chain",    name: t("dashboard.chain","联动触发率"), default: true,  defaultPos: { x: 1, y: 3, w: 2, h: 1 } },
  { id: "recent",   name: t("dashboard.recent","最近完成"),   default: true,  defaultPos: { x: 3, y: 3, w: 3, h: 1 } },
  { id: "actions",  name: t("dashboard.actions","快捷操作"),   default: false, defaultPos: { x: 1, y: 4, w: 5, h: 1 } },
  { id: "hourdist", name: t("dashboard.hourdist","完成时段分布"), default: false, defaultPos: { x: 1, y: 5, w: 2, h: 1 } },
  { id: "report",   name: t("dashboard.report","高级报表"),   default: false, defaultPos: { x: 3, y: 5, w: 3, h: 1 } },
  { id: "gantt",    name: t("dashboard.gantt","甘特图"),     default: false, defaultPos: { x: 1, y: 6, w: 3, h: 1 } },
  { id: "mindmap",  name: t("dashboard.mindmap","思维导图"),   default: false, defaultPos: { x: 4, y: 6, w: 2, h: 1 } },
  { id: "radar",    name: t("dashboard.radar","雷达图"),     default: false, defaultPos: { x: 1, y: 7, w: 2, h: 1 } },
  { id: "sankey",   name: t("dashboard.sankey","桑基图"),     default: false, defaultPos: { x: 3, y: 7, w: 3, h: 1 } }
];
/**
 * 生成默认布局（v2.2.0：仅含 default:true 的核心组件）
 * @returns {Array<{id:string,pos:{x:number,y:number,w:number,h:number}}>}
 */
function _defaultDashboardLayout(){
  return DASHBOARD_WIDGETS.filter(function(w){ return w.default !== false; }).map(function(w){
    return { id: w.id, pos: { x: w.defaultPos.x, y: w.defaultPos.y, w: w.defaultPos.w, h: w.defaultPos.h } };
  });
}
/**
 * 读取仪表盘布局（localStorage 优先，否则默认）
 * @returns {Array<{id:string,pos:{x:number,y:number,w:number,h:number}}>}
 */
function getDashboardLayout(){
  try{
    const raw = localStorage.getItem(PREFIX + DASHBOARD_LAYOUT_KEY);
    if(!raw) return _defaultDashboardLayout();
    const parsed = JSON.parse(raw);
    if(!Array.isArray(parsed) || parsed.length === 0) return _defaultDashboardLayout();
    // 校验每项结构，缺失时回退默认
    return parsed.filter(function(item){
      return item && typeof item.id === "string" && item.pos &&
        typeof item.pos.x === "number" && typeof item.pos.y === "number" &&
        typeof item.pos.w === "number" && typeof item.pos.h === "number";
    });
  }catch(e){
    return _defaultDashboardLayout();
  }
}
/**
 * 持久化仪表盘布局到 localStorage
 * @param {Array<{id:string,pos:Object}>} layout - 布局数组
 * @returns {boolean} 是否保存成功
 */
function saveDashboardLayout(layout){
  try{
    localStorage.setItem(PREFIX + DASHBOARD_LAYOUT_KEY, JSON.stringify(layout));
    return true;
  }catch(e){
    return false;
  }
}
/**
 * 重置仪表盘为默认布局
 * @returns {void}
 */
function resetDashboard(){
  saveDashboardLayout(_defaultDashboardLayout());
}
/**
 * 移动组件到新位置
 * @param {string} id - 组件 id
 * @param {{x:number,y:number,w:number,h:number}} pos - 新位置
 * @returns {boolean} 是否移动成功
 */
function moveDashboardWidget(id, pos){
  if(!id || !pos) return false;
  const layout = getDashboardLayout();
  const item = layout.find(function(it){ return it.id === id; });
  if(!item) return false;
  item.pos = { x: pos.x, y: pos.y, w: pos.w || item.pos.w, h: pos.h || item.pos.h };
  return saveDashboardLayout(layout);
}
/**
 * 渲染单个组件内容
 * @param {string} id - 组件 id
 * @returns {string} 组件 HTML 内容
 */
function _renderDashboardWidget(id){
  if(id === "stats"){
    return _renderDashboardStatsWidget();
  }
  /* v2.2.1：非图表组件——列表 / 进度 / 操作，让仪表盘不止有图表 */
  if(id === "today"){
    return typeof _renderTodayTopHtml === "function" ? _renderTodayTopHtml() : t("p5.todayTodo", "<p class='widget-empty'>今日待办</p>");
  }
  if(id === "scenes"){
    const bars = ORDER.map(function(sc){
      const s = SCENARIOS[sc] || {};
      const all = getActiveTasks().filter(function(t){ return t.sc === sc; });
      const dn = all.filter(function(t){ return t.status === "done"; }).length;
      const tot = all.length;
      const pct = tot ? Math.round(dn / tot * 100) : 0;
      return '<div class="bar"><span class="nm">' + esc(s.name || sc) + '</span>' +
        '<span class="track"><span class="fill" style="width:' + pct + '%;background:' + (s.color || "var(--accent)") + '"></span></span>' +
        '<span class="v">' + dn + '/' + tot + '</span></div>';
    }).join("");
    return '<div class="bars">' + bars + '</div>';
  }
  if(id === "recent"){
    const doneList = getActiveTasks().filter(function(t){ return t.status === "done" && t.doneAt; })
      .sort(function(a, b){ return b.doneAt - a.doneAt; }).slice(0, 5);
    if(!doneList.length) return t("p5.noDoneTasks", "<p class='widget-empty'>还没有已完成的任务</p>");
    const now = Date.now();
    const items = doneList.map(function(task){
      const s = SCENARIOS[task.sc] || {};
      const mins = Math.floor((now - task.doneAt) / 60000);
      const ago = mins < 60 ? mins + t("p5.minutesAgo", " 分钟前") : mins < 1440 ? Math.floor(mins / 60) + t("p5.hoursAgo", " 小时前") : Math.floor(mins / 1440) + t("p5.daysAgo", " 天前");
      return '<li class="top3-item"><span class="dot" style="background:' + (s.color || "var(--muted)") + '"></span>' +
        '<span class="title">' + esc(task.title) + '</span><span class="sc-name">' + esc(s.name || task.sc) + ' · ' + ago + '</span></li>';
    }).join("");
    return '<ul class="top3-list">' + items + '</ul>';
  }
  if(id === "actions"){
    return '<div class="dash-actions-grid">' +
      '<button type="button" class="addbtn" id="dashActNew" data-sc="accent"><span class="ic-inline" aria-hidden="true">' + UI_ICONS.plus + '</span>' + t('p5.newTask', '新建任务') + '</button>' +
      '<button type="button" class="addbtn" id="dashActSearch" data-sc="accent"><span class="ic-inline" aria-hidden="true">' + UI_ICONS.search + '</span>' + t('p5.globalSearch', '全局搜索') + '</button>' +
      '<button type="button" class="addbtn" id="dashActReport" data-sc="accent"><span class="ic-inline" aria-hidden="true">' + UI_ICONS.stats + '</span>' + t('p5.advReport', '高级报表') + '</button>' +
      '<button type="button" class="addbtn" id="dashActExport" data-sc="muted"><span class="ic-inline" aria-hidden="true">' + UI_ICONS.download + '</span>' + t('p5.exportJson', '导出 JSON') + '</button>' +
      '</div>';
  }
  if(id === "trend"){
    const days = (typeof _statsTrendDays === "number" && _statsTrendDays) ? _statsTrendDays : 7;
    const trendData = typeof calcTrend === "function" ? calcTrend(days) : [];
    const chart = typeof renderTrendChart === "function" ? renderTrendChart(trendData, "var(--accent)") : "";
    const tabs = [7,14,30].map(function(d){
      return '<button type="button" class="stats-tab' + (days === d ? " active" : "") + '" data-trend-days="' + d + '">' + (d === 7 ? t("p5.week7", "周（7 天）") : d === 14 ? t("p5.biweek14", "双周（14 天）") : t("p5.month30", "月（30 天）")) + '</button>';
    }).join("");
    return '<div class="stats-trend-tabs">' + tabs + '</div><p class="sub">' + t('p5.recentDays', '最近 ') + days + t('p5.daysTaskCount', ' 天每天完成任务数</p>') + chart;
  }
  if(id === "pie"){
    const dist = typeof calcSceneDist === "function" ? calcSceneDist() : [];
    return typeof renderPieChart === "function" ? renderPieChart(dist) : t("p5.sceneDist", "<p class='widget-empty'>场景分布</p>");
  }
  if(id === "heatmap"){
    return typeof renderHeatmap === "function" ? renderHeatmap("office") : t("p5.heatmap", "<p class='widget-empty'>热力图</p>");
  }
  if(id === "chain"){
    /* v2.2.0：每条链的环形成功率（沿用原统计页视觉），无链时显示联动状态 */
    const chains = typeof calcChainSuccess === "function" ? (calcChainSuccess() || []) : [];
    const ringR = 20, ringC = 2 * Math.PI * ringR;
    const chainsHtml = chains.length ? chains.map(function(c){
      const fromColor = (typeof SCENARIOS !== "undefined" && SCENARIOS[c.fromSc]) ? SCENARIOS[c.fromSc].color : "var(--muted)";
      const toColor = (typeof SCENARIOS !== "undefined" && SCENARIOS[c.toSc]) ? SCENARIOS[c.toSc].color : "var(--muted)";
      const dashOffset = ringC * (1 - c.rate / 100);
      const ringSvg = '<svg class="stats-chain-ring-svg" width="48" height="48" viewBox="0 0 48 48" role="img" aria-label="' + t('p5.successRate', '成功率 ') + c.rate + '%">' +
        '<circle cx="24" cy="24" r="' + ringR + '" fill="none" stroke="var(--surface-muted)" stroke-width="4"></circle>' +
        '<circle cx="24" cy="24" r="' + ringR + '" fill="none" stroke="' + fromColor + '" stroke-width="4" stroke-dasharray="' + ringC.toFixed(2) + '" stroke-dashoffset="' + dashOffset.toFixed(2) + '" transform="rotate(-90 24 24)" stroke-linecap="round"></circle>' +
        '<text x="24" y="28" text-anchor="middle" font-size="var(--fs-2xs)" fill="var(--text)">' + c.rate + '%</text></svg>';
      return '<div class="stats-chain' + (c.enabled ? "" : " disabled") + '">' +
        '<div class="stats-chain-head">' +
        '<span style="color:' + fromColor + '">' + esc((SCENARIOS[c.fromSc] ? SCENARIOS[c.fromSc].name : c.fromSc)) + '</span>' +
        '<span class="arr">→</span>' +
        '<span style="color:' + toColor + '">' + esc((SCENARIOS[c.toSc] ? SCENARIOS[c.toSc].name : c.toSc)) + '</span>' +
        '<span class="stats-chain-meta">' + t('p5.trigger', '触发 ') + c.triggered + t('p5.sourceDone', ' / 源完成 ') + c.sourceDone + '</span></div>' +
        '<div class="stats-chain-ring">' + ringSvg + '</div></div>';
    }).join("") : t('p5.noChain', '<div class="empty">暂无联动规则</div>');
    return t('p5.chainRateHeader', '<h3>联动触发率</h3><p class="sub">每条规则近 30 天触发次数 / 源场景完成数</p>') + chainsHtml;
  }
  if(id === "hourdist"){
    const hd = typeof calcHourDist === "function" ? calcHourDist(30) : null;
    if(!hd || !hd.length){ return t("p5.hourDist", "<p class='widget-empty'>完成时段分布</p>"); }
    return typeof renderHourDistGrid === "function" ? renderHourDistGrid(hd) : t("p5.hourDist", "<p class='widget-empty'>完成时段分布</p>");
  }
  if(id === "report"){
    return t('p5.reportSub', '<p class="sub">周 / 月 / 年报，自动汇总任务完成情况</p>') +
      '<button type="button" class="btn-primary" id="btnStatsOpenReport"><span class="ic-inline" aria-hidden="true">' + UI_ICONS.stats + '</span>' + t('p5.openAdvReport', '打开高级报表') + '</button>';
  }
  if(id === "gantt"){
    return typeof renderGanttChart === "function" ? renderGanttChart() : t("p5.gantt", "<p class='widget-empty'>甘特图</p>");
  }
  if(id === "mindmap"){
    return typeof renderMindmap === "function" ? renderMindmap() : t("p5.mindmap", "<p class='widget-empty'>思维导图</p>");
  }
  if(id === "radar"){
    const radarData = typeof getRadarData === "function" ? getRadarData() : [];
    return typeof radarChartSVG === "function" ? radarChartSVG(radarData) : t("p5.radar", "<p class='widget-empty'>雷达图</p>");
  }
  if(id === "sankey"){
    const sankeyData = typeof getSankeyData === "function" ? getSankeyData() : { nodes: [], links: [] };
    return typeof sankeyChartSVG === "function" ? sankeyChartSVG(sankeyData) : t("p5.sankey", "<p class='widget-empty'>桑基图</p>");
  }
  return "";
}
/**
 * 渲染关键指标组件（v2.2.0：完整 10 指标卡，复用 .stats-cards 响应式栅格）
 * @returns {string} 关键指标 HTML
 */
function _renderDashboardStatsWidget(){
  const stats = typeof calcStats === "function" ? calcStats() : { total: 0, done: 0, rate: 0, weekDone: 0, bestStreak: 0 };
  const kpi = typeof _calcTodayKpi === "function" ? _calcTodayKpi() : { todayDone: 0, currentStreak: 0, overdue: 0 };
  const avg = typeof calcAvgCycle === "function" ? calcAvgCycle() : { days: null };
  const cards = [
    { label: t("p5.totalTasks", "总任务数"), value: stats.total },
    { label: t("p5.done", "已完成"), value: stats.done },
    { label: t("p5.inProgress", "进行中"), value: stats.total - stats.done },
    { label: t("p5.completionRate", "完成率"), value: stats.rate + "%" },
    { label: t("p5.avgCycle", "平均周期"), value: avg.days === null || avg.days === undefined ? "-" : avg.days + t("p5.day", " 天") },
    { label: t("p5.weekDone", "本周完成"), value: stats.weekDone },
    { label: t("p5.todayDone", "今日完成"), value: kpi.todayDone },
    { label: t("p5.currentStreak", "当前连续"), value: kpi.currentStreak + t("p5.day", " 天") },
    { label: t("p5.bestStreak", "最长连续"), value: stats.bestStreak + t("p5.day", " 天") },
    { label: t("p5.overdue", "逾期任务"), value: kpi.overdue }
  ];
  let html = '<div class="stats-cards dash-stats-cards">';
  html += cards.map(function(c){
    return '<div class="stats-card"><div class="stats-card-val">' + c.value + '</div><div class="stats-card-lbl">' + c.label + '</div></div>';
  }).join("");
  html += '</div>';
  return html;
}
/**
 * 渲染自定义仪表盘（v2.2.0：editMode 区分展示/编辑两态——Grafana 式）
 * @param {boolean} [editMode] - true 显示拖拽手柄/删除钮/配置工具条；默认 false 纯展示
 * @returns {string} 仪表盘 HTML
 */
function renderCustomDashboard(editMode){
  const edit = editMode === true;
  const layout = getDashboardLayout();
  let html = '';
  if(edit){
    /* 配置态工具条：添加组件（未在布局中的）+ 重置 + 完成编辑 */
    const notIn = DASHBOARD_WIDGETS.filter(function(w){
      return !layout.some(function(it){ return it.id === w.id; });
    });
    const addOpts = notIn.length
      ? '<select id="dashAddSel" aria-label="' + t('p5.addWidget', '添加组件') + '"><option value="">' + t('p5.addWidgetEllipsis', '添加组件…') + '</option>' + notIn.map(function(w){
          return '<option value="' + esc(w.id) + '">' + esc(w.name) + '</option>'; }).join('') + '</select>'
      : t('p5.allWidgetsAdded', '<span class="dash-toolbar-hint">所有组件均已添加</span>');
    html += '<div class="dash-toolbar card">' + addOpts +
      '<button type="button" class="addbtn sm" id="btnDashboardReset" data-sc="muted">' + t('p5.resetLayout', '重置布局') + '</button>' +
      '<button type="button" class="btn-primary" id="btnDashDone"><span class="ic-inline" aria-hidden="true">' + UI_ICONS.check + '</span>' + t('p5.doneEdit', '完成编辑') + '</button>' +
      t('p5.dragHint', '<span class="dash-toolbar-hint">拖拽 ⋮⋮ 手柄交换组件位置；右上 ✕ 移除组件</span></div>');
  }
  html += '<div class="dashboard-grid">';
  layout.forEach(function(item){
    const widget = DASHBOARD_WIDGETS.find(function(w){ return w.id === item.id; });
    if(!widget) return;
    const p = item.pos;
    html += '<div class="dashboard-widget' + (edit ? ' editing' : '') + '" draggable="' + (edit ? 'true' : 'false') + '" data-widget="' + esc(item.id) + '" style="grid-column:' + p.x + ' / span ' + p.w + ';grid-row:' + p.y + ' / span ' + p.h + '">';
    html += '<div class="widget-header"><span class="widget-name">' + esc(widget.name) + '</span>' +
      (edit ? '<span class="widget-ops"><button type="button" class="widget-drag" title="' + t('p5.dragMove', '拖拽移动') + '" aria-label="' + t('p5.dragMove', '拖拽移动 ') + esc(widget.name) + '">⋮⋮</button>' +
       '<button type="button" class="widget-del" title="' + t('p5.removeWidget', '移除组件') + '" aria-label="' + t('p5.remove', '移除 ') + esc(widget.name) + '">✕</button></span>' : '') + '</div>';
    html += '<div class="widget-body">' + _renderDashboardWidget(item.id) + '</div>';
    html += '</div>';
  });
  html += '</div>';
  return html;
}
/**
 * v2.2.0：添加组件到布局（自动放到网格尾部空行）
 * @param {string} id - 组件 id
 * @returns {boolean} 是否添加成功
 */
function addDashboardWidget(id){
  const widget = DASHBOARD_WIDGETS.find(function(w){ return w.id === id; });
  if(!widget) return false;
  const layout = getDashboardLayout();
  if(layout.some(function(it){ return it.id === id; })) return false;
  let maxY = 0;
  layout.forEach(function(it){ maxY = Math.max(maxY, it.pos.y + it.pos.h - 1); });
  layout.push({ id: id, pos: { x: widget.defaultPos.x, y: maxY + 1, w: widget.defaultPos.w, h: widget.defaultPos.h } });
  return saveDashboardLayout(layout);
}
/**
 * v2.2.0：从布局移除组件
 * @param {string} id - 组件 id
 * @returns {boolean} 是否移除成功
 */
function removeDashboardWidget(id){
  const layout = getDashboardLayout();
  const idx = layout.findIndex(function(it){ return it.id === id; });
  if(idx < 0) return false;
  layout.splice(idx, 1);
  return saveDashboardLayout(layout);
}
/**
 * 打开仪表盘弹窗（渲染到 #dashboardModal）
 * @returns {void}
 */
function openDashboardModal(){
  const modal = $("#dashboardModal");
  if(!modal) return;
  const body = $("#dashboardModalBody");
  if(body){
    body.innerHTML = sanitizeHtml(renderCustomDashboard(true));
    /* v2.2.0：编辑语义（手柄/移除/工具条）；listener 挂 body 幂等 */
    bindDashboardDnD(body, true);
    _bindDashToolbar(body, true);
  }
  modal.classList.add("show");
}
/**
 * 关闭仪表盘弹窗
 * @returns {void}
 */
function closeDashboardModal(){
  const modal = $("#dashboardModal");
  if(modal) modal.classList.remove("show");
}
/**
 * 绑定仪表盘拖拽事件（HTML5 DnD，事件委托）
 * @returns {void}
 */
function bindDashboardDnD(container, editMode){
  /* v2.2.0：container 参数化——弹窗（#dashboardModalBody）与统计页（#dashHost）共用；
     drop 后重渲染回 container 自身并重绑（编辑态语义） */
  const body = container || $("#dashboardModalBody");
  if(!body || body._dashDndBound) return;
  body._dashDndBound = true;
  const isEdit = editMode === true;
  const refresh = function(){
    body.innerHTML = sanitizeHtml(renderCustomDashboard(isEdit));
    _bindDashToolbar(body, isEdit);
  };
  let dragId = null;
  body.addEventListener("dragstart", function(e){
    const w = e.target.closest(".dashboard-widget");
    if(!w) return;
    dragId = w.getAttribute("data-widget");
    try{ e.dataTransfer.setData("text/plain", dragId); e.dataTransfer.effectAllowed = "move"; }catch(_){}
    w.classList.add("dragging");
  });
  body.addEventListener("dragend", function(e){
    const w = e.target.closest(".dashboard-widget");
    if(w) w.classList.remove("dragging");
    $$(".dashboard-widget.drag-over", body).forEach(function(el){ el.classList.remove("drag-over"); });
    dragId = null;
  });
  body.addEventListener("dragover", function(e){
    e.preventDefault(); // 必须始终调用，浏览器才知道允许 drop
    if(e.dataTransfer) e.dataTransfer.dropEffect = "move";
    const w = e.target.closest(".dashboard-widget");
    $$(".dashboard-widget.drag-over", body).forEach(function(el){ el.classList.remove("drag-over"); });
    if(!w || !dragId || w.getAttribute("data-widget") === dragId) return;
    w.classList.add("drag-over");
  });
  body.addEventListener("dragleave", function(e){
    const w = e.target.closest(".dashboard-widget");
    if(w && !w.contains(e.relatedTarget)) w.classList.remove("drag-over");
  });
  body.addEventListener("drop", function(e){
    e.preventDefault();
    const w = e.target.closest(".dashboard-widget");
    $$(".dashboard-widget.drag-over", body).forEach(function(el){ el.classList.remove("drag-over"); });
    if(!w || !dragId) return;
    const targetId = w.getAttribute("data-widget");
    if(targetId === dragId){ dragId = null; return; }
    const layout = getDashboardLayout();
    const a = layout.find(function(it){ return it.id === dragId; });
    const b = layout.find(function(it){ return it.id === targetId; });
    if(a && b){
      const tmp = a.pos; a.pos = b.pos; b.pos = tmp;
      saveDashboardLayout(layout);
      refresh();
    }
    dragId = null;
  });
}
/**
 * v2.2.0：绑定编辑态工具条（添加组件 / 重置 / 完成编辑 / widget 移除 / 趋势 tab）
 * 弹窗与统计页共用；容器级事件委托，重渲染后幂等
 */
function _bindDashToolbar(container, editMode){
  if(!container) return;
  /* 添加组件下拉 */
  const addSel = container.querySelector("#dashAddSel");
  if(addSel){
    addSel.onchange = function(){
      const id = addSel.value;
      if(!id) return;
      if(addDashboardWidget(id)){
        container.innerHTML = sanitizeHtml(renderCustomDashboard(editMode === true));
        _bindDashToolbar(container, editMode === true);
      }
    };
  }
  /* 重置布局 */
  const resetBtn = container.querySelector("#btnDashboardReset");
  if(resetBtn){
    resetBtn.onclick = function(){
      resetDashboard();
      container.innerHTML = sanitizeHtml(renderCustomDashboard(editMode === true));
      _bindDashToolbar(container, editMode === true);
    };
  }
  /* 完成编辑（仅统计页容器有） */
  const doneBtn = container.querySelector("#btnDashDone");
  if(doneBtn){
    doneBtn.onclick = function(){
      _dashEditMode = false;
      if(typeof render === "function"){ try{ render(); }catch(e){ /* noop */ } }
    };
  }
  /* widget 移除钮（事件委托） */
  container.querySelectorAll(".widget-del").forEach(function(btn){
    btn.onclick = function(){
      const w = btn.closest(".dashboard-widget");
      if(!w) return;
      removeDashboardWidget(w.getAttribute("data-widget"));
      container.innerHTML = sanitizeHtml(renderCustomDashboard(editMode === true));
      _bindDashToolbar(container, editMode === true);
    };
  });
  /* 趋势 tab（展示/编辑态均可切） */
  container.querySelectorAll(".stats-tab[data-trend-days]").forEach(function(btn){
    btn.onclick = function(){
      _statsTrendDays = parseInt(btn.getAttribute("data-trend-days"), 10) || 7;
      container.innerHTML = sanitizeHtml(renderCustomDashboard(editMode === true));
      _bindDashToolbar(container, editMode === true);
    };
  });
  /* 高级报表入口 */
  const repBtn = container.querySelector("#btnStatsOpenReport");
  if(repBtn){
    repBtn.onclick = function(){
      if(typeof openReportModal === "function"){ openReportModal("week", 0); if(typeof bindReportModal === "function") bindReportModal(); }
    };
  }
  /* v2.2.1：快捷操作组件 */
  const actNew = container.querySelector("#dashActNew");
  if(actNew) actNew.onclick = function(){
    if(typeof setActive === "function"){ setActive("office"); }
    if(typeof render === "function"){ try{ render(); }catch(e){} }
    const f = document.querySelector("#taskForm");
    if(f && f.title){ try{ f.title.focus(); }catch(e){} }
  };
  const actSearch = container.querySelector("#dashActSearch");
  if(actSearch) actSearch.onclick = function(){
    if(typeof setActive === "function"){ setActive("overview"); }
    if(typeof render === "function"){ try{ render(); }catch(e){} }
    const gs = document.querySelector("#globSearch");
    if(gs){ try{ gs.focus(); }catch(e){} }
  };
  const actReport = container.querySelector("#dashActReport");
  if(actReport) actReport.onclick = function(){
    if(typeof openReportModal === "function"){ openReportModal("week", 0); if(typeof bindReportModal === "function") bindReportModal(); }
  };
  const actExport = container.querySelector("#dashActExport");
  if(actExport) actExport.onclick = function(){
    if(typeof doExport === "function"){ try{ doExport(); }catch(e){} }
  };
}// ===== Notes & Knowledge Base (v1.6-D 知识管理) =====
/* ---------- 笔记系统 + 知识库：Markdown 笔记 CRUD + 标签分类 + 任务关联 ----------
 * 能力：
 *   1) getNotes() / saveNotes(notes)              — 存储访问器（localStorage）
 *   2) createNote(title, content, tags, category) — 创建笔记，返回新笔记对象
 *   3) updateNote(id, updates)                    — 更新笔记字段，刷新 updatedAt
 *   4) deleteNote(id)                             — 删除笔记
 *   5) getNoteById(id)                            — 按 ID 查找
 *   6) getNotesByTag(tag) / getNotesByCategory(c) — 按标签 / 分类筛选
 *   7) getAllTags() / getAllCategories()          — 标签 / 分类聚合（含计数）
 *   8) linkNoteToTask / unlinkNoteFromTask        — 任务关联管理
 *   9) getNotesLinkedToTask(taskId)               — 查询任务关联的笔记
 *  10) renderNoteEditor(note) / renderNoteList()  — 编辑器 / 列表渲染
 *  11) openNotesModal / closeNotesModal           — 笔记管理弹窗
 *  12) openNoteEditorModal / closeNoteEditorModal — 笔记编辑弹窗
 *  13) saveNoteFromEditor()                       — 从编辑器表单保存笔记
 *  14) 知识库：renderKnowledgeBase / openKnowledgeBaseModal / closeKnowledgeBaseModal
 *
 * 笔记结构：{id, title, content(markdown), tags[], category, createdAt, updatedAt, linkedTaskIds[]}
 *
 * 设计约定：
 *   - 存储键：PREFIX + "notes"
 *   - 所有颜色用 var(--token) CSS 令牌（lint-colors 门禁）
 *   - innerHTML 赋值由调用方用 sanitizeHtml 包裹
 *   - Markdown 渲染复用 mdToHtml（03-util-markdown.js，03 < 47，可直接引用）
 *   - esc / PREFIX / $ / $$ 在更早模块定义，可直接引用
 */
const NOTES_STORAGE_KEY = "notes";
/**
 * 读取全部笔记
 * @returns {Array<Object>} 笔记数组
 */
function getNotes(){
  try{
    const raw = localStorage.getItem(PREFIX + NOTES_STORAGE_KEY);
    if(!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  }catch(e){
    return [];
  }
}
/**
 * 持久化笔记数组到 localStorage
 * @param {Array<Object>} notes - 笔记数组
 * @returns {boolean} 是否保存成功
 */
function saveNotes(notes){
  // v3.4.7 批次三（G5）：收编进 save() 主入口（此前裸 setItem 绕过镜像/告警/登记）
  return save(PREFIX + NOTES_STORAGE_KEY, notes || []);
}
/**
 * 创建新笔记
 * @param {string} title - 标题
 * @param {string} content - Markdown 内容
 * @param {string[]} tags - 标签数组
 * @param {string} category - 分类
 * @returns {Object} 新建的笔记对象
 */
function createNote(title, content, tags, category){
  const notes = getNotes();
  const note = {
    id: "note_" + Date.now() + "_" + Math.random().toString(36).substr(2, 6),
    title: title || t("p5.untitled", "无标题"),
    content: content || "",
    tags: Array.isArray(tags) ? tags : [],
    category: category || t("p5.default", "默认"),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    linkedTaskIds: []
  };
  notes.push(note);
  saveNotes(notes);
  _notifyNotesChanged();
  return note;
}
/**
 * 更新笔记字段
 * @param {string} id - 笔记 ID
 * @param {Object} updates - 要更新的字段对象
 * @returns {boolean} 是否更新成功
 */
function updateNote(id, updates){
  if(!id || !updates) return false;
  const notes = getNotes();
  let note = null;
  for(let i = 0; i < notes.length; i++){
    if(notes[i].id === id){ note = notes[i]; break; }
  }
  if(!note) return false;
  const keys = Object.keys(updates);
  for(let k = 0; k < keys.length; k++){
    note[keys[k]] = updates[keys[k]];
  }
  note.updatedAt = Date.now();
  saveNotes(notes);
  _notifyNotesChanged();
  return true;
}
/**
 * 删除笔记
 * @param {string} id - 笔记 ID
 * @returns {boolean} 是否删除成功
 */
function deleteNote(id){
  if(!id) return false;
  const notes = getNotes();
  const filtered = notes.filter(function(n){ return n.id !== id; });
  if(filtered.length === notes.length) return false;
  // v3.1：接入回收站——保存被删除的笔记快照
  const removed = notes.find(function(n){ return n.id === id; });
  if(removed){
    try{
      addToRecycleBin("file",
        t("p5.recordPrefix", "记录：「")+(removed.title||removed.id||t("p5.unnamed", "未命名"))+"」",
        (removed.sc||"")+(removed.tags?(t("p5.tagsSuffix", " · 标签：")+removed.tags):""),
        { note: removed },
        t("p5.studyRecord", "学习资料/记录"));
    }catch(_){ /* 回收站写入失败不影响删除 */ }
  }
  saveNotes(filtered);
  _notifyNotesChanged();
  return true;
}
/**
 * 按 ID 查找笔记
 * @param {string} id - 笔记 ID
 * @returns {Object|null} 笔记对象或 null
 */
function getNoteById(id){
  if(!id) return null;
  const notes = getNotes();
  for(let i = 0; i < notes.length; i++){
    if(notes[i].id === id) return notes[i];
  }
  return null;
}
/**
 * 按标签筛选笔记
 * @param {string} tag - 标签
 * @returns {Array<Object>} 匹配的笔记数组
 */
function getNotesByTag(tag){
  if(!tag) return [];
  return getNotes().filter(function(n){
    return n.tags && n.tags.indexOf(tag) >= 0;
  });
}
/**
 * 按分类筛选笔记
 * @param {string} category - 分类
 * @returns {Array<Object>} 匹配的笔记数组
 */
function getNotesByCategory(category){
  return getNotes().filter(function(n){
    return n.category === category;
  });
}
/**
 * 获取所有标签及其计数
 * @returns {Object<string, number>} 标签→计数映射
 */
function getAllTags(){
  const tags = {};
  getNotes().forEach(function(n){
    if(n.tags){
      n.tags.forEach(function(t){
        tags[t] = (tags[t] || 0) + 1;
      });
    }
  });
  return tags;
}
/**
 * 获取所有分类及其计数
 * @returns {Object<string, number>} 分类→计数映射
 */
function getAllCategories(){
  const cats = {};
  getNotes().forEach(function(n){
    const c = n.category || t("p5.default", "默认");
    cats[c] = (cats[c] || 0) + 1;
  });
  return cats;
}
/**
 * 关联笔记到任务
 * @param {string} noteId - 笔记 ID
 * @param {string} taskId - 任务 ID
 * @returns {boolean} 是否关联成功
 */
function linkNoteToTask(noteId, taskId){
  if(!noteId || !taskId) return false;
  const notes = getNotes();
  let note = null;
  for(let i = 0; i < notes.length; i++){
    if(notes[i].id === noteId){ note = notes[i]; break; }
  }
  if(!note) return false;
  if(!note.linkedTaskIds) note.linkedTaskIds = [];
  if(note.linkedTaskIds.indexOf(taskId) < 0) note.linkedTaskIds.push(taskId);
  saveNotes(notes);
  return true;
}
/**
 * 取消笔记与任务的关联
 * @param {string} noteId - 笔记 ID
 * @param {string} taskId - 任务 ID
 * @returns {boolean} 是否取消成功
 */
function unlinkNoteFromTask(noteId, taskId){
  if(!noteId || !taskId) return false;
  const notes = getNotes();
  let note = null;
  for(let i = 0; i < notes.length; i++){
    if(notes[i].id === noteId){ note = notes[i]; break; }
  }
  if(!note || !note.linkedTaskIds) return false;
  const before = note.linkedTaskIds.length;
  note.linkedTaskIds = note.linkedTaskIds.filter(function(id){ return id !== taskId; });
  if(note.linkedTaskIds.length === before) return false;
  saveNotes(notes);
  return true;
}
/**
 * 查询任务关联的所有笔记
 * @param {string} taskId - 任务 ID
 * @returns {Array<Object>} 关联的笔记数组
 */
function getNotesLinkedToTask(taskId){
  if(!taskId) return [];
  return getNotes().filter(function(n){
    return n.linkedTaskIds && n.linkedTaskIds.indexOf(taskId) >= 0;
  });
}
/**
 * 渲染笔记编辑器表单
 * @param {Object} note - 笔记对象（空则渲染空白表单）
 * @returns {string} 编辑器 HTML
 */
function renderNoteEditor(note){
  const n = note || {id:"", title:"", content:"", tags:[], category:t("profile.default", "默认")};
  let html = '<div class="note-editor" data-note-id="' + esc(n.id || "") + '">';
  html += '<input class="note-title" value="' + esc(n.title || "") + '" placeholder="' + t("p5.noteTitle", "笔记标题") + '" maxlength="200">';
  html += '<input class="note-tags" value="' + esc((n.tags || []).join(", ")) + '" placeholder="' + t("p5.tagsPlaceholder", "标签（逗号分隔）") + '" maxlength="200">';
  html += '<input class="note-category" value="' + esc(n.category || t("p5.default", "默认")) + '" placeholder="' + t("p5.categoryPlaceholder", "分类（如：知识库/工作笔记/学习笔记）") + '" maxlength="100">';
  html += '<textarea class="note-content" placeholder="' + t("p5.markdownPlaceholder", "输入 Markdown 内容...") + '" maxlength="10000">' + esc(n.content || "") + '</textarea>';
  html += '<div class="note-preview">' + (typeof mdToHtml === "function" ? mdToHtml(n.content || "") : "") + '</div>';
  html += '</div>';
  return html;
}
/**
 * 渲染笔记列表
 * @param {Array<Object>} notes - 笔记数组（空则读取全部）
 * @returns {string} 列表 HTML
 */
function renderNoteList(notes){
  const list = notes || getNotes();
  let html = '<div class="note-list">';
  if(!list.length){
    html += t('p5.noNotes', '<p class="empty-hint">暂无笔记，点击「新建笔记」开始记录</p>');
  }
  list.forEach(function(n){
    html += '<div class="note-item" data-note-id="' + esc(n.id || "") + '">';
    html += '<h4 class="note-item-title">' + esc(n.title || t("p5.untitled", "无标题")) + '</h4>';
    const tags = n.tags || [];
    if(tags.length){
      html += '<div class="note-tags">';
      tags.forEach(function(t){
        html += '<span class="note-tag">' + esc(t) + '</span>';
      });
      html += '</div>';
    }
    html += '<p class="note-excerpt">' + esc((n.content || "").substring(0, 100)) + '</p>';
    html += '<div class="note-meta">';
    html += '<span class="note-cat">' + esc(n.category || t("p5.default", "默认")) + '</span>';
    if(n.linkedTaskIds && n.linkedTaskIds.length){
      html += '<span class="note-link-count">' + t('p5.linkedPrefix', '关联 ') + n.linkedTaskIds.length + t('p5.linkedSuffix', ' 个任务</span>');
    }
    html += '</div>';
    html += '</div>';
  });
  html += '</div>';
  return html;
}
/**
 * 打开笔记管理弹窗（渲染列表到 #notesModalBody）
 * @returns {void}
 */
function openNotesModal(){
  const modal = $("#notesModal");
  if(!modal) return;
  const body = $("#notesModalBody");
  if(body){
    let html = '<div class="notes-toolbar">';
    html += '<button type="button" class="addbtn note-new-btn" id="btnNoteNew" data-sc="accent">+ ' + t('p5.newNote', '新建笔记') + '</button>';
    html += '<input class="note-filter-input" id="noteFilterInput" placeholder="' + t("p5.filterPlaceholder", "按标题/标签筛选...") + '" maxlength="200">';
    html += '</div>';
    html += renderNoteList();
    body.innerHTML = sanitizeHtml(html);
    _bindNotesModalEvents();
  }
  modal.classList.add("show");
}
/**
 * 关闭笔记管理弹窗
 * @returns {void}
 */
function closeNotesModal(){
  const modal = $("#notesModal");
  if(modal) modal.classList.remove("show");
}
/**
 * 打开笔记编辑弹窗
 * @param {Object} note - 要编辑的笔记（空则新建）
 * @returns {void}
 */
function openNoteEditorModal(note){
  const modal = $("#noteEditorModal");
  if(!modal) return;
  const body = $("#noteEditorModalBody");
  if(body){
    const n = note || null;
    let html = renderNoteEditor(n);
    html += '<div class="note-editor-actions">';
    html += '<button type="button" class="addbtn sm" id="btnNoteSave" >' + t('common.save', '保存') + '</button>';
    html += '<button type="button" class="addbtn sm" id="btnNoteCancel"  data-sc="muted">' + t('common.cancel', '取消') + '</button>';
    if(n && n.id){
      html += '<button type="button" class="addbtn" id="btnNoteDelete" data-sc="danger-muted">' + t('common.delete', '删除') + '</button>';
    }
    html += '</div>';
    body.innerHTML = sanitizeHtml(html);
    _bindNoteEditorEvents(n);
  }
  modal.classList.add("show");
}
/**
 * 关闭笔记编辑弹窗
 * @returns {void}
 */
function closeNoteEditorModal(){
  const modal = $("#noteEditorModal");
  if(modal) modal.classList.remove("show");
}
/**
 * 从编辑器表单保存笔记（新建或更新）
 * @returns {Object|null} 保存后的笔记对象，失败返回 null
 */
function saveNoteFromEditor(){
  const editor = $(".note-editor");
  if(!editor) return null;
  const editId = editor.getAttribute("data-note-id") || "";
  const title = $(".note-title", editor).value || "";
  const tagsStr = $(".note-tags", editor).value || "";
  const category = $(".note-category", editor).value || t("p5.default", "默认");
  const content = $(".note-content", editor).value || "";
  const tags = tagsStr.split(",").map(function(t){ return t.trim(); }).filter(function(t){ return t; });
  if(!title.trim()){ try{ toast(t("p5.noteTitleRequired", "请输入笔记标题"), "warn"); }catch(e){} return null; }
  if(editId){
    updateNote(editId, {title: title, tags: tags, category: category, content: content});
    try{ toast(t("p5.noteUpdated", "笔记已更新"), "ok"); }catch(e){}
    return getNoteById(editId);
  } else {
    const note = createNote(title, content, tags, category);
    try{ toast(t("p5.noteCreated", "笔记已创建"), "ok"); }catch(e){}
    return note;
  }
}
/**
 * 绑定笔记管理弹窗事件（新建按钮 / 列表项点击 / 筛选）
 * @returns {void}
 */
function _bindNotesModalEvents(){
  const newBtn = $("#btnNoteNew");
  if(newBtn){
    newBtn.onclick = function(){ openNoteEditorModal(null); };
  }
  const filterInput = $("#noteFilterInput");
  if(filterInput){
    filterInput.oninput = function(){
      const q = (filterInput.value || "").toLowerCase().trim();
      const notes = getNotes();
      const filtered = !q ? notes : notes.filter(function(n){
        return (n.title || "").toLowerCase().indexOf(q) >= 0 ||
               (n.tags || []).some(function(t){ return t.toLowerCase().indexOf(q) >= 0; }) ||
               (n.category || "").toLowerCase().indexOf(q) >= 0;
      });
      const listEl = $(".note-list");
      if(listEl) listEl.outerHTML = sanitizeHtml(renderNoteList(filtered));
    };
  }
  const list = $(".note-list");
  if(list){
    list.addEventListener("click", function(e){
      const item = e.target.closest(".note-item");
      if(!item) return;
      const id = item.getAttribute("data-note-id");
      const note = getNoteById(id);
      if(note) openNoteEditorModal(note);
    });
  }
}
/**
 * 绑定笔记编辑器事件（保存 / 取消 / 删除 / 实时预览）
 * @param {Object} note - 正在编辑的笔记（null 表示新建）
 * @returns {void}
 */
function _bindNoteEditorEvents(note){
  const saveBtn = $("#btnNoteSave");
  if(saveBtn){
    saveBtn.onclick = function(){
      const saved = saveNoteFromEditor();
      if(saved){
        closeNoteEditorModal();
        openNotesModal();
      }
    };
  }
  const cancelBtn = $("#btnNoteCancel");
  if(cancelBtn){
    cancelBtn.onclick = function(){ closeNoteEditorModal(); };
  }
  const delBtn = $("#btnNoteDelete");
  if(delBtn && note && note.id){
    delBtn.onclick = function(){
      if(!confirm(t("p5.confirmDeleteNote", "确定删除此笔记？"))) return;
      deleteNote(note.id);
      try{ toast(t("p5.noteDeleted", "笔记已删除"), "ok"); }catch(e){}
      closeNoteEditorModal();
      openNotesModal();
    };
  }
  const contentTa = $(".note-content");
  const preview = $(".note-preview");
  if(contentTa && preview){
    contentTa.oninput = function(){
      if(typeof mdToHtml === "function"){
        preview.innerHTML = sanitizeHtml(mdToHtml(contentTa.value || ""));
      }
    };
  }
}
/* ---------- 知识库：按主题分类的结构化知识视图 ----------
 * 知识库复用笔记系统，通过 category 字段实现按主题分类。
 * renderKnowledgeBase() 按分类分组渲染，提供主题导航。
 */
/**
 * 渲染知识库视图（按分类/主题分组）
 * @returns {string} 知识库 HTML
 */
function renderKnowledgeBase(){
  const notes = getNotes();
  const cats = getAllCategories();
  const catKeys = Object.keys(cats).sort();
  let html = '<div class="kb-container">';
  html += '<div class="kb-summary">';
  html += '<span class="kb-stat">' + t('p5.totalPrefix', '共 ') + notes.length + t('p5.notesSuffix', ' 条笔记</span>');
  html += '<span class="kb-stat">' + catKeys.length + t('p5.catSuffix', ' 个分类</span>');
  const tagMap = getAllTags();
  const tagCount = Object.keys(tagMap).length;
  html += '<span class="kb-stat">' + tagCount + t('p5.tagSuffix', ' 个标签</span>');
  html += '</div>';
  if(!notes.length){
    html += t('p5.kbEmpty', '<p class="empty-hint">知识库为空，到「笔记管理」创建第一条笔记吧</p>');
  } else {
    html += '<div class="kb-categories">';
    catKeys.forEach(function(cat){
      const catNotes = getNotesByCategory(cat);
      html += '<div class="kb-category" data-category="' + esc(cat) + '">';
      html += '<h3 class="kb-cat-title">' + esc(cat) + ' <span class="kb-cat-count">(' + catNotes.length + ')</span></h3>';
      html += '<div class="kb-cat-notes">';
      catNotes.forEach(function(n){
        html += '<div class="kb-note-item" data-note-id="' + esc(n.id || "") + '">';
        html += '<h4 class="kb-note-title">' + esc(n.title || t("p5.untitled", "无标题")) + '</h4>';
        const tags = n.tags || [];
        if(tags.length){
          html += '<div class="note-tags">';
          tags.forEach(function(t){
            html += '<span class="note-tag">' + esc(t) + '</span>';
          });
          html += '</div>';
        }
        html += '<p class="note-excerpt">' + esc((n.content || "").substring(0, 120)) + '</p>';
        html += '</div>';
      });
      html += '</div>';
      html += '</div>';
    });
    html += '</div>';
    if(tagCount > 0){
      html += '<div class="kb-tag-cloud">';
      html += t('p5.tagCloud', '<h3 class="kb-cloud-title">标签云</h3>');
      Object.keys(tagMap).sort().forEach(function(t){
        html += '<span class="note-tag kb-tag" data-tag="' + esc(t) + '">' + esc(t) + ' <em>(' + tagMap[t] + ')</em></span>';
      });
      html += '</div>';
    }
  }
  html += '</div>';
  return html;
}
/**
 * 打开知识库弹窗
 * @returns {void}
 */
function openKnowledgeBaseModal(){
  const modal = $("#knowledgeBaseModal");
  if(!modal) return;
  const body = $("#knowledgeBaseModalBody");
  if(body){
    body.innerHTML = sanitizeHtml(renderKnowledgeBase());
    _bindKnowledgeBaseEvents();
  }
  modal.classList.add("show");
}
/**
 * 关闭知识库弹窗
 * @returns {void}
 */
function closeKnowledgeBaseModal(){
  const modal = $("#knowledgeBaseModal");
  if(modal) modal.classList.remove("show");
}
/**
 * 绑定知识库事件（点击笔记项打开编辑器）
 * @returns {void}
 */
function _bindKnowledgeBaseEvents(){
  const container = $(".kb-container");
  if(!container) return;
  container.addEventListener("click", function(e){
    const noteItem = e.target.closest(".kb-note-item");
    if(noteItem){
      const id = noteItem.getAttribute("data-note-id");
      const note = getNoteById(id);
      if(note) openNoteEditorModal(note);
      return;
    }
    const tagEl = e.target.closest(".kb-tag");
    if(tagEl){
      const tag = tagEl.getAttribute("data-tag");
      const tagged = getNotesByTag(tag);
      try{ toast(t("p5.tagPrefix", "标签「") + tag + t("p5.tagCountMid", "」共 ") + tagged.length + t("p5.tagCountSuffix", " 条笔记"), "ok"); }catch(e){}
    }
  });
}

/* ---------- v1.7-A 笔记变更钩子：自动更新 RAG 索引 ----------
 * 笔记 CRUD 后调用 _notifyNotesChanged，触发 RAG 索引重建（若已存在）。
 * 53-ai-deep.js 编号 > 47，但函数声明提升使 _onNotesChanged 引用安全。
 * 设计：钩子失败不影响笔记操作；仅当索引已存在时才重建，避免无谓开销。
 */
/**
 * 笔记变更通知：触发 RAG 索引自动更新
 * @returns {void}
 */
function _notifyNotesChanged(){
  try{
    if(typeof _onNotesChanged === "function"){
      _onNotesChanged();
    }
  }catch(e){ /* 钩子失败静默降级，不影响笔记操作 */ }
}// ===== Full-Text Search (v1.6-D 知识管理) =====
/* ---------- 全文搜索：跨任务 / 记录 / 笔记搜索 + 关键词高亮 ----------
 * 能力：
 *   1) searchAll(query, options)           — 跨任务/记录/笔记全文搜索
 *   2) highlightSearchResult(text, query)  — 关键词高亮（<mark> 包裹）
 *   3) renderSearchResults(results, query) — 渲染搜索结果列表
 *   4) openSearchModal / closeSearchModal  — 搜索弹窗控制
 *   5) executeSearch(query)               — 执行搜索并渲染结果
 *
 * 设计约定：
 *   - 搜索范围：任务（title/note/tags）、记录（title/note）、笔记（title/content/tags）
 *   - 大小写不敏感，子串匹配
 *   - 高亮用 <mark class="search-highlight">，CSS 令牌着色
 *   - getActiveTasks / ORDER / getRec 在更早模块定义（11/05 < 48），可直接引用
 *   - getNotes 在 47-notes.js 定义（47 < 48），可直接引用
 *   - esc / $ / $$ 在更早模块定义，可直接引用
 */
/**
 * 文本匹配辅助（大小写不敏感子串匹配）
 * @param {string} text - 待匹配文本
 * @param {string} query - 查询串（已小写化）
 * @returns {boolean} 是否匹配
 */
function _matchText(text, query){
  if(!text) return false;
  return String(text).toLowerCase().indexOf(query) >= 0;
}
/**
 * 查找任务匹配字段
 * @param {Object} item - 任务对象
 * @param {string} query - 查询串（已小写化）
 * @returns {string[]} 匹配字段名数组
 */
function _findMatches(item, query){
  const matches = [];
  if(_matchText(item.title, query)) matches.push("title");
  if(_matchText(item.note, query)) matches.push("note");
  if(item.tags && item.tags.some(function(tag){ return _matchText(tag, query); })) matches.push("tags");
  return matches;
}
/**
 * 跨任务 / 记录 / 笔记全文搜索
 * @param {string} query - 查询关键词
 * @param {Object} options - 搜索选项（{tasks:false, records:false, notes:false} 可禁用对应类型）
 * @returns {{tasks:Array, records:Array, notes:Array, total:number}} 搜索结果
 */
function searchAll(query, options){
  if(!query || !query.trim()){
    return { tasks: [], records: [], notes: [], total: 0 };
  }
  const q = query.toLowerCase().trim();
  const opt = options || {};
  const results = { tasks: [], records: [], notes: [], features: [], total: 0 };

  // 搜索任务
  if(opt.tasks !== false){
    let tasks = [];
    try{ tasks = getActiveTasks() || []; }catch(e){ tasks = []; }
    results.tasks = tasks.filter(function(t){
      return _matchText(t.title, q) || _matchText(t.note, q) ||
             (t.tags && t.tags.some(function(tag){ return _matchText(tag, q); }));
    }).map(function(t){
      return { item: t, type: "task", matches: _findMatches(t, q) };
    });
  }

  // 搜索记录
  if(opt.records !== false){
    let recs = [];
    try{
      ORDER.forEach(function(sc){
        const r = getRec(sc) || [];
        r.forEach(function(item){
          recs.push(Object.assign({}, item, { _sc: sc }));
        });
      });
    }catch(e){ recs = []; }
    results.records = recs.filter(function(r){
      // v3.1.2 A-档：全字段匹配——此前只搜 title/note，参会人(who)/数值(value)/语言(lang)/代码(code)全搜不到
      const RECSYS = ["_sc","id","created","deletedAt","nextReview","reps","ease","_verified","_lastVerifiedAt"];
      return Object.keys(r).some(function(k){
        if(RECSYS.indexOf(k) >= 0) return false;
        return _matchText(r[k], q);
      });
    }).map(function(r){
      return { item: r, type: "record" };
    });
  }

  // 搜索笔记
  if(opt.notes !== false && typeof getNotes === "function"){
    let notes = [];
    try{ notes = getNotes() || []; }catch(e){ notes = []; }
    results.notes = notes.filter(function(n){
      return _matchText(n.title, q) || _matchText(n.content, q) ||
             (n.tags && n.tags.some(function(tag){ return _matchText(tag, q); }));
    }).map(function(n){
      return { item: n, type: "note" };
    });
  }

  // 搜索场景功能卡数据（v3.0：会议/项目/考勤/报销/知识库/阅读/练习/考试/报表/图表/前端/SQL/UI/3D/计划）
  if(opt.features !== false){
    try{
      Object.keys(SCENE_FEATURE_BIND).forEach(function(sc){
        const feats = SCENE_FEATURE_BIND[sc] || {};
        Object.keys(feats).forEach(function(fid){
          const cfg = feats[fid];
          const arr = load(PREFIX + cfg.key, []);
          arr.forEach(function(item){
            const haystack = Object.keys(item).map(function(k){ return String(item[k] || ""); }).join(" ");
            if(_matchText(haystack, q)){
              results.features.push({ item: item, type: "feature", sc: sc, fid: fid });
            }
          });
        });
      });
      // v3.1.2 A-档：工具箱数据纳入搜索——此前 tool_* 键（生活缴费/采购/运动/外卖/出行等台账）
      // 完全不被搜索覆盖，工具里记的账单/外卖全局搜索一概搜不到
      if(typeof TOOL_APPS === "object" && TOOL_APPS){
        Object.keys(TOOL_APPS).forEach(function(tid){
          const arr = load(PREFIX + "tool_" + tid, []);
          (Array.isArray(arr) ? arr : []).forEach(function(item){
            const haystack = Object.keys(item).map(function(k){ return String(item[k] || ""); }).join(" ");
            if(_matchText(haystack, q)){
              results.features.push({ item: item, type: "tool", sc: tid, fid: "tool" });
            }
          });
        });
      }
    }catch(e){ /* 搜索异常不阻断 */ }
  }

  results.total = results.tasks.length + results.records.length + results.notes.length + results.features.length;
  return results;
}
/**
 * 高亮搜索关键词（先转义 HTML，再用 <mark> 包裹匹配项）
 * @param {string} text - 原始文本
 * @param {string} query - 查询关键词
 * @returns {string} 高亮后的安全 HTML
 */
function highlightSearchResult(text, query){
  if(!text) return "";
  const escaped = esc(text);
  if(!query || !query.trim()) return escaped;
  const escapedQuery = esc(query);
  if(!escapedQuery) return escaped;
  // 转义正则特殊字符
  const regexSafe = escapedQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  try{
    const regex = new RegExp("(" + regexSafe + ")", "gi");
    return escaped.replace(regex, '<mark class="search-highlight">$1</mark>');
  }catch(e){
    return escaped;
  }
}
/**
 * 渲染搜索结果列表
 * @param {Object} results - searchAll 返回的结果对象
 * @param {string} query - 查询关键词（用于高亮）
 * @returns {string} 结果列表 HTML
 */
function renderSearchResults(results, query){
  let html = '<div class="search-results">';
  if(!results || results.total === 0){
    html += t('p5.noMatch', '<p class="empty-hint">未找到匹配结果</p>');
  } else {
    html += '<p class="search-summary">' + t('p5.foundPrefix', '找到 ') + results.total + t('p5.resultSuffix', ' 条结果');
    const parts = [];
    if(results.tasks.length) parts.push(t("p5.taskPrefix", "任务 ") + results.tasks.length);
    if(results.records.length) parts.push(t("p5.recordPrefix2", "记录 ") + results.records.length);
    if(results.notes.length) parts.push(t("p5.notePrefix", "笔记 ") + results.notes.length);
    if(results.features && results.features.length) parts.push(t("p5.featurePrefix", "功能 ") + results.features.length);
    if(parts.length) html += "（" + parts.join(" / ") + "）";
    html += '</p>';
    results.tasks.forEach(function(r){
      html += '<div class="search-item search-item-task" data-type="task">';
      html += t('p5.badgeTask', '<span class="type-badge type-badge-task">任务</span>');
      html += '<span class="search-item-title">' + highlightSearchResult(r.item.title, query) + '</span>';
      if(r.item.note){
        html += '<span class="search-item-desc">' + highlightSearchResult((r.item.note || "").substring(0, 80), query) + '</span>';
      }
      html += '</div>';
    });
    results.records.forEach(function(r){
      html += '<div class="search-item search-item-record" data-type="record">';
      html += t('p5.badgeRecord', '<span class="type-badge type-badge-record">记录</span>');
      html += '<span class="search-item-title">' + highlightSearchResult(r.item.title, query) + '</span>';
      if(r.item.note){
        html += '<span class="search-item-desc">' + highlightSearchResult((r.item.note || "").substring(0, 80), query) + '</span>';
      }
      html += '</div>';
    });
    results.notes.forEach(function(r){
      html += '<div class="search-item search-item-note" data-type="note">';
      html += t('p5.badgeNote', '<span class="type-badge type-badge-note">笔记</span>');
      html += '<span class="search-item-title">' + highlightSearchResult(r.item.title, query) + '</span>';
      if(r.item.content){
        html += '<span class="search-item-desc">' + highlightSearchResult((r.item.content || "").substring(0, 80), query) + '</span>';
      }
      html += '</div>';
    });
    // v3.0：场景功能卡搜索结果（会议/项目/知识库/报表/SQL 等）
    (results.features || []).forEach(function(r){
      const fname = (SCENE_FEATURES[r.sc] || []).find(function(f){ return f.id === r.fid; });
      const label = fname ? fname.label : r.fid;
      const title = r.item.title || r.item.book || r.item.name || r.item.question || r.item.sql || Object.values(r.item).join(" ");
      html += '<div class="search-item search-item-note" data-type="feature">';
      html += '<span class="type-badge type-badge-note">' + esc(label) + '</span>';
      html += '<span class="search-item-title">' + highlightSearchResult(String(title).substring(0, 60), query) + '</span>';
      html += '</div>';
    });
  }
  html += '</div>';
  return html;
}
/**
 * 打开搜索弹窗
 * @returns {void}
 */
function openSearchModal(){
  const modal = $("#searchModal");
  if(!modal) return;
  modal.classList.add("show");
  const input = $("#searchInput");
  if(input){
    input.value = "";
    setTimeout(function(){ try{ input.focus(); }catch(e){} }, 50);
  }
  const body = $("#searchModalBody");
  if(body){
    body.innerHTML = sanitizeHtml(t('p5.searchHint', '<p class="empty-hint">输入关键词搜索任务 / 记录 / 笔记</p>'));
  }
}
/**
 * 关闭搜索弹窗
 * @returns {void}
 */
function closeSearchModal(){
  const modal = $("#searchModal");
  if(modal) modal.classList.remove("show");
}
/**
 * 执行搜索并渲染结果到弹窗
 * @param {string} query - 查询关键词
 * @returns {Object} 搜索结果对象
 */
function executeSearch(query){
  const results = searchAll(query, {});
  const body = $("#searchModalBody");
  if(body){
    body.innerHTML = sanitizeHtml(renderSearchResults(results, query));
  }
  return results;
}// ===== Automation Workflow (v1.6-E 自动化工作流) [DEPRECATED v1.14.1：入口已冻结] =====
function integrationGetStatus(name){
  const p = integrationGetProvider(name);
  if(!p) return { connected:false, reason:"not_registered" };
  if(!p.enabled) return { connected:false, reason:"disabled" };
  if(p.config && p.config._verified === false) return { connected:false, reason:"verify_failed" };
  return { connected:true, verified:!!(p.config && p.config._verified) };
}
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



// ===== AI Deep Enhancement (v1.7-A AI 深度增强) =====
/* ============================================================
 * v1.7-A AI 深度增强
 * ------------------------------------------------------------
 *  四大能力：
 *   1) AI Agent 自主执行：多步规划→执行→验证→修正循环
 *      - agentPlan / agentExecuteStep / agentVerify / agentRun / agentReflect
 *   2) 多轮对话记忆：对话上下文持久化 + 摘要压缩 + 长期记忆向量检索
 *      - saveConversation / loadConversation / listConversations
 *      - summarizeConversation / getRelevantMemory / addLongTermMemory
 *   3) RAG 知识检索：TF-IDF 索引 + 相似度检索 + 上下文增强
 *      - buildIndex / tfidfScore / ragRetrieve / ragAugment
 *      - indexFromNotes / indexFromTasks
 *   4) AI 代码审查：模式匹配 + 安全漏洞检测 + 性能优化建议
 *      - reviewCode / detectSecurityIssues / suggestOptimization / reviewScore
 *
 *  设计约定：
 *   - 使用 var 声明模块级私有状态（53 > 31，避免 TDZ）
 *   - 持久化键（带 PREFIX）：wb_conversations / wb_long_term_memory / wb_rag_index
 *   - 所有导出函数均为 function 声明（提升），可在 31 中直接引用
 *   - 颜色用 var(--token) CSS 令牌（lint-colors 门禁）
 *   - innerHTML 赋值由调用方用 sanitizeHtml 包裹
 *   - Agent 自主执行安全：限制 maxSteps（默认 10），每步 try-catch，不无限循环
 *   - RAG 用 TF-IDF，不依赖外部向量数据库，索引存 localStorage
 *   - 代码审查用模式匹配，不依赖 AI API（本地分析）
 *   - 对话记忆摘要简单：提取最后 N 条 + 关键词，不依赖 AI
 *   - execTool / getNotes / getTasks / getActiveTasks / SCENARIOS / ORDER
 *     在更早模块定义（08/11/47/00），可直接引用
 * ============================================================ */

/* ---------- 持久化键 ---------- */
const CONVERSATIONS_KEY = "wb_conversations";
const LONG_TERM_MEMORY_KEY = "wb_long_term_memory";
const RAG_INDEX_KEY = "wb_rag_index";

/* ---------- 模块级私有状态（var 声明，避免 TDZ） ---------- */
let _ragIndex = null;          // RAG 索引缓存（{docs, df, N, avgLen}）
let _agentRunLog = [];         // 最近一次 agentRun 执行日志

/* ============================================================
 * 1. AI Agent 自主执行：plan → execute → verify → 修正
 * ============================================================ */

/**
 * AI 规划：将目标分解为步骤列表
 * 本地启发式分解（不依赖 AI API）：按标点/连词切分目标为子步骤
 * @param {string} goal - 目标描述
 * @param {Object} [context] - 上下文（可选 {scenario, tasks, notes}）
 * @returns {Array<{action:string, params:Object, expect:string}>} 步骤列表
 */
function agentPlan(goal, context){
  const g = String(goal || "").trim();
  if(!g) return [];
  context = context || {};

  /* 启发式 1：目标含「然后」「接着」「再」「，」等连接词 → 按连接词切分 */
  const sepRe = /然后|接着|再|之后|，|;|；|。\s*/g;
  const parts = g.split(sepRe).map(function(s){ return s.trim(); }).filter(Boolean);

  /* 启发式 2：识别常见动作关键词，映射到 execTool 工具 */
  let steps = parts.map(function(p){
    return _planStepFromText(p, context);
  });

  /* 若切分后只有 1 步，尝试按动词关键词再分解 */
  if(steps.length <= 1){
    const verbRe = /(创建|新增|添加|完成|删除|更新|查询|搜索|列出|查看|导出|规划|分析|检查|执行)/g;
    const verbs = g.match(verbRe) || [];
    if(verbs.length > 1){
      /* 按动词位置切分 */
      const chunks = [];
      let lastIdx = 0;
      for(let i = 1; i < verbs.length; i++){
        const idx = g.indexOf(verbs[i], lastIdx + 1);
        if(idx > lastIdx){
          chunks.push(g.slice(lastIdx, idx).trim());
          lastIdx = idx;
        }
      }
      chunks.push(g.slice(lastIdx).trim());
      steps = chunks.filter(Boolean).map(function(p){ return _planStepFromText(p, context); });
    }
  }

  /* 兜底：若仍无步骤，整体作为一个步骤 */
  if(!steps.length){
    steps = [_planStepFromText(g, context)];
  }

  /* 限制最多 8 步，防止过度分解 */
  return steps.slice(0, 8);
}

/**
 * 从单段文本推断步骤（动作 + 参数 + 预期）
 * @param {string} text - 步骤文本
 * @param {Object} context - 上下文
 * @returns {{action:string, params:Object, expect:string}}
 */
function _planStepFromText(text, context){
  const textStr = String(text || "").trim();
  let action = "noop";
  const params = {};
  let expect = "执行成功";

  /* 创建任务 */
  if(/创建|新增|添加|建一个|新建/.test(textStr)){
    action = "create_task";
    params.title = textStr.replace(/^(请)?\s*(创建|新增|添加|建一个|新建)/, "").replace(/(任务|待办)?$/, "").trim() || textStr;
    if(context.scenario) params.scenario = context.scenario;
    expect = "任务已创建";
  }
  /* 完成任务 */
  else if(/完成|标记完成|标记为完成|做完/.test(textStr)){
    action = "complete_task";
    const m = textStr.match(/["「『]([^"」』]+)["」』]/);
    params.task_id = m ? m[1] : textStr.replace(/^(请)?\s*(完成|标记完成|标记为完成|做完)/, "").trim();
    expect = "任务已完成";
  }
  /* 删除任务 */
  else if(/删除|移除|去掉/.test(textStr)){
    action = "delete_task";
    const m2 = textStr.match(/["「『]([^"」』]+)["」』]/);
    params.task_id = m2 ? m2[1] : textStr.replace(/^(请)?\s*(删除|移除|去掉)/, "").trim();
    expect = "任务已删除";
  }
  /* 查询/列出 */
  else if(/查询|列出|查看|显示|列出所有|列表/.test(textStr)){
    action = "list_tasks";
    if(context.scenario) params.scenario = context.scenario;
    expect = "返回任务列表";
  }
  /* 搜索 */
  else if(/搜索|查找|找/.test(textStr)){
    action = "search";
    params.query = textStr.replace(/^(请)?\s*(搜索|查找|找)/, "").trim() || textStr;
    expect = "返回搜索结果";
  }
  /* 概览 */
  else if(/概览|统计|总览|overview/.test(textStr)){
    action = "query_overview";
    expect = "返回概览统计";
  }
  /* 导出 */
  else if(/导出|备份|export/.test(textStr)){
    action = "export_data";
    expect = "已触发导出";
  }
  /* 默认：noop，仅记录文本 */
  else {
    action = "noop";
    params.text = textStr;
    expect = "已记录";
  }

  return {action: action, params: params, expect: expect};
}

/**
 * 执行单步：调用 execTool 或其他工具
 * @param {{action:string, params:Object, expect:string}} step - 步骤
 * @param {Object} [context] - 上下文
 * @returns {{ok:boolean, result:*, raw:string}} 执行结果
 */
function agentExecuteStep(step, context){
  context = context || {};
  if(!step || !step.action){
    return {ok: false, result: null, raw: JSON.stringify({ok: false, msg: t("agent.invalidStep","步骤无效")})};
  }
  /* noop：仅记录，不调用工具 */
  if(step.action === "noop"){
    return {ok: true, result: {msg: "noop", text: step.params && step.params.text}, raw: JSON.stringify({ok: true, msg: "noop"})};
  }
  try{
    const raw = execTool(step.action, step.params || {}, true);
    let parsed = null;
    try{ parsed = JSON.parse(raw); }catch(e){ parsed = raw; }
    const ok = parsed && typeof parsed === "object" && parsed.ok === true;
    return {ok: ok, result: parsed, raw: raw};
  }catch(e){
    return {ok: false, result: null, raw: JSON.stringify({ok: false, error: String(e)})};
  }
}

/**
 * 验证结果是否符合预期
 * @param {*} result - 执行结果（agentExecuteStep 的返回值或解析后的对象）
 * @param {string} [expect] - 预期描述
 * @returns {{verified:boolean, reason:string}} 验证结果
 */
function agentVerify(result, expect){
  /* result 可能是 agentExecuteStep 的返回 {ok, result, raw}，也可能是直接的对象 */
  let ok = false;
  if(result && typeof result === "object"){
    if(typeof result.ok === "boolean"){
      ok = result.ok;
    } else if(result.result && typeof result.result === "object" && typeof result.result.ok === "boolean"){
      ok = result.result.ok;
    }
  }
  const exp = String(expect || "").trim();
  let reason = ok ? t("p5.execSuccess", "执行成功") : t("p5.execFail", "执行失败");
  /* 若预期包含「失败」字样，则 ok=false 才算验证通过（用于负向验证） */
  if(exp && /失败|不|无/.test(exp) && !ok){
    reason = t("p5.negMatch", "符合预期（负向验证）");
    return {verified: true, reason: reason};
  }
  return {verified: ok, reason: reason};
}

/**
 * 反思失败原因，生成修正方案
 * @param {{action:string, params:Object, expect:string}} failedStep - 失败的步骤
 * @param {string|Error} error - 错误信息
 * @param {Object} [context] - 上下文
 * @returns {{action:string, params:Object, expect:string, reason:string}} 修正后的步骤
 */
function agentReflect(failedStep, error, context){
  context = context || {};
  const err = String(error && error.message ? error.message : error || t("tool.unknownErrorMsg", "未知错误"));
  const step = failedStep || {action: "noop", params: {}, expect: ""};
  const reason = t("p5.reflect", "反思：") + err;

  /* 反思策略 1：create_task 失败 → 简化标题重试 */
  if(step.action === "create_task"){
    const title = (step.params && step.params.title) || "";
    if(title.length > 50){
      return {
        action: "create_task",
        params: Object.assign({}, step.params, {title: title.slice(0, 50)}),
        expect: step.expect,
        reason: reason + t("p5.titleTooLong", "；标题过长，已截断重试")
      };
    }
    if(!title.trim()){
      return {
        action: "create_task",
        params: Object.assign({}, step.params, {title: t("p5.unnamedTask", "未命名任务")}),
        expect: step.expect,
        reason: reason + t("p5.titleEmpty", "；标题为空，使用默认标题重试")
      };
    }
  }

  /* 反思策略 2：complete_task / delete_task 失败 → task_id 可能是标题片段，原样重试一次 */
  if(step.action === "complete_task" || step.action === "delete_task" || step.action === "update_task"){
    return {
      action: step.action,
      params: step.params,
      expect: step.expect,
      reason: reason + t("p5.taskNotFound", "；任务定位失败，建议检查任务 id 或标题")
    };
  }

  /* 反思策略 3：未知工具 → 降级为 noop */
  if(/未知工具/.test(err)){
    return {
      action: "noop",
      params: {text: JSON.stringify(step)},
      expect: t("agent.recorded","已记录"),
      reason: reason + t("p5.unknownTool", "；未知工具，降级为 noop")
    };
  }

  /* 默认：原样重试 */
  return {
    action: step.action,
    params: step.params,
    expect: step.expect,
    reason: reason
  };
}

/**
 * 自主执行循环：plan → execute → verify → 修正，最多 maxSteps 步
 * @param {string} goal - 目标描述
 * @param {Object} [context] - 上下文
 * @param {number} [maxSteps] - 最大步数（默认 10，上限 20）
 * @returns {{goal:string, steps:Array, log:Array, success:boolean, summary:string}} 执行结果
 */
function agentRun(goal, context, maxSteps){
  const g = String(goal || "").trim();
  context = context || {};
  const max = Math.min(20, Math.max(1, Number(maxSteps) || 10));

  if(!g){
    _agentRunLog = [];
    return {goal: "", steps: [], log: [], success: false, summary: t("p5.goalEmpty", "目标为空")};
  }

  const plan = agentPlan(g, context);
  const log = [];
  let stepIdx = 0;
  let successCount = 0;
  let failCount = 0;
  let retryCount = 0;
  const maxRetries = 2;  /* 每步最多重试 2 次 */

  while(stepIdx < plan.length && log.length < max){
    let step = plan[stepIdx];
    let attempt = 0;
    let lastResult = null;
    let verified = false;
    let reflection = null;

    while(attempt <= maxRetries && log.length < max){
      lastResult = agentExecuteStep(step, context);
      const v = agentVerify(lastResult, step.expect);
      verified = v.verified;
      if(verified) break;

      /* 失败：反思并修正 */
      const err = (lastResult && lastResult.raw) || v.reason;
      reflection = agentReflect(step, err, context);
      attempt++;
      retryCount++;
      if(reflection && reflection.action && reflection.action !== step.action){
        step = reflection;  /* 应用修正方案 */
      } else if(reflection && reflection.action === step.action){
        step = reflection;  /* 同动作，参数可能已修正 */
      }
    }

    log.push({
      step: step,
      result: lastResult,
      verified: verified,
      reflection: reflection,
      attempts: attempt + 1
    });
    if(verified) successCount++; else failCount++;
    stepIdx++;
  }

  _agentRunLog = log;
  const success = failCount === 0 && successCount > 0;
  const summary = t("p5.goalPrefix", "目标「") + g + t("p5.goalMid", "」执行完成：") + successCount + t("p5.goalSuccess", " 步成功，") + failCount + t("p5.goalFail", " 步失败，") + retryCount + t("p5.goalRetry", " 次重试");

  return {
    goal: g,
    steps: plan,
    log: log,
    success: success,
    summary: summary
  };
}

/* ============================================================
 * 2. 多轮对话记忆：持久化 + 摘要压缩 + 长期记忆向量检索
 * ============================================================ */

/**
 * 持久化对话到 localStorage
 * @param {Object} conv - 对话对象 {id, title, messages, summary, createdAt}
 * @returns {boolean} 是否保存成功
 */
function saveConversation(conv){
  if(!conv || typeof conv !== "object") return false;
  try{
    const all = _loadAllConversations();
    const c = {
      id: conv.id || ("conv_" + Date.now() + "_" + Math.random().toString(36).substr(2, 6)),
      title: conv.title || (conv.messages && conv.messages.length ? String(conv.messages[0].content || "").slice(0, 30) : t("chat.newConversation","新对话")),
      messages: Array.isArray(conv.messages) ? conv.messages : [],
      summary: conv.summary || "",
      createdAt: conv.createdAt || Date.now(),
      updatedAt: Date.now()
    };
    /* 找到并替换或新增 */
    let found = false;
    for(let i = 0; i < all.length; i++){
      if(all[i].id === c.id){ all[i] = c; found = true; break; }
    }
    if(!found) all.push(c);
    return save(PREFIX + CONVERSATIONS_KEY, all); // v3.4.7 批次三（G5）：收编进 save() 主入口
  }catch(e){ return false; }
}

/**
 * 加载对话
 * @param {string} id - 对话 ID
 * @returns {Object|null} 对话对象或 null
 */
function loadConversation(id){
  if(!id) return null;
  const all = _loadAllConversations();
  for(let i = 0; i < all.length; i++){
    if(all[i].id === id) return all[i];
  }
  return null;
}

/**
 * 列出所有对话
 * @returns {Array<Object>} 对话列表（按 updatedAt 降序）
 */
function listConversations(){
  const all = _loadAllConversations();
  return all.sort(function(a, b){
    return (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0);
  });
}

/**
 * 摘要压缩：提取关键信息，压缩旧消息
 * 策略：保留最后 N 条原文 + 提取前 N 条的关键句 + 关键词云
 * @param {Array<{role:string, content:string, timestamp:number}>} messages - 消息列表
 * @param {number} [keepLast] - 保留最后几条原文（默认 4）
 * @returns {{summary:string, kept:Array, keywords:string[]}} 摘要结果
 */
function summarizeConversation(messages, keepLast){
  if(!Array.isArray(messages)) return {summary: "", kept: [], keywords: []};
  const n = Math.max(1, Number(keepLast) || 4);
  const msgs = messages.filter(function(m){ return m && m.content; });

  if(msgs.length <= n){
    return {
      summary: msgs.map(function(m){ return (m.role || "?") + ": " + String(m.content).slice(0, 80); }).join(" | "),
      kept: msgs.slice(),
      keywords: _extractKeywords(msgs.map(function(m){ return m.content; }).join(" "))
    };
  }

  const head = msgs.slice(0, msgs.length - n);
  const tail = msgs.slice(msgs.length - n);

  /* 提取 head 的关键句（每条取首句） */
  const headSummary = head.map(function(m){
    const c = String(m.content);
    const firstSentence = c.split(/[。！？!?.\n]/)[0] || c;
    return (m.role || "?") + ": " + firstSentence.slice(0, 60);
  }).join(" | ");

  const keywords = _extractKeywords(msgs.map(function(m){ return m.content; }).join(" "));
  const summary = t("p5.historyPrefix", "【历史摘要】") + headSummary + t("p5.historyMid", "（共 ") + head.length + t("p5.historySuffix", " 条已压缩）");

  return {summary: summary, kept: tail, keywords: keywords};
}

/**
 * 检索相关长期记忆（简单向量相似度：词袋 + 余弦）
 * @param {string} query - 查询文本
 * @param {number} [topK] - 返回前 K 条（默认 5）
 * @returns {Array<{memory:Object, score:number}>} 相关记忆列表
 */
function getRelevantMemory(query, topK){
  const q = String(query || "").trim();
  if(!q) return [];
  const k = Math.max(1, Number(topK) || 5);
  const all = _loadAllLongTermMemory();
  if(!all.length) return [];

  const qVec = _textToVector(q);
  const scored = all.map(function(m){
    const mVec = _textToVector(m.content || "");
    const score = _cosineSimilarity(qVec, mVec);
    return {memory: m, score: score};
  });
  scored.sort(function(a, b){ return b.score - a.score; });
  return scored.slice(0, k).filter(function(x){ return x.score > 0; });
}

/**
 * 添加长期记忆
 * @param {string} content - 记忆内容
 * @param {Object} [metadata] - 元数据 {type, tags, source, ...}
 * @returns {Object|null} 添加后的记忆对象，失败返回 null
 */
function addLongTermMemory(content, metadata){
  const c = String(content || "").trim();
  if(!c) return null;
  try{
    let all = _loadAllLongTermMemory();
    const m = {
      id: "mem_" + Date.now() + "_" + Math.random().toString(36).substr(2, 6),
      content: c,
      metadata: metadata || {},
      vector: _textToVector(c),
      createdAt: Date.now()
    };
    all.push(m);
    /* 限制最多 500 条长期记忆，超出删除最早的 */
    if(all.length > 500) all = all.slice(all.length - 500);
    localStorage.setItem(PREFIX + LONG_TERM_MEMORY_KEY, JSON.stringify(all));
    return m;
  }catch(e){ return null; }
}

/* ---------- 对话记忆内部辅助 ---------- */
function _loadAllConversations(){
  try{
    const raw = localStorage.getItem(PREFIX + CONVERSATIONS_KEY);
    if(!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  }catch(e){ return []; }
}

function _loadAllLongTermMemory(){
  try{
    const raw = localStorage.getItem(PREFIX + LONG_TERM_MEMORY_KEY);
    if(!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  }catch(e){ return []; }
}

/**
 * 提取关键词（简单词频统计，取 top 10）
 * @param {string} text - 文本
 * @returns {string[]} 关键词列表
 */
function _extractKeywords(text){
  const textStr = String(text || "");
  if(!textStr) return [];
  /* 中文分词简化：按标点和空格切分，过滤停用词和短词 */
  const stopWords = {"的":1, "了":1, "是":1, "在":1, "我":1, "你":1, "他":1, "她":1, "它":1, "这":1, "那":1, "和":1, "与":1, "或":1, "及":1, "也":1, "都":1, "就":1, "不":1, "没":1, "有":1, "要":1, "会":1, "能":1, "可以":1, "请":1, "把":1, "被":1, "对":1, "为":1, "上":1, "下":1, "中":1, "里":1, "外":1, "前":1, "后":1};
  const tokens = textStr.split(/[\s,，。、；;：:！!？?（）()[\]【】{}""''""''`~@#$%^&*\-_=+|\\/<>]+/).filter(Boolean);
  const freq = {};
  for(let i = 0; i < tokens.length; i++){
    const w = tokens[i];
    if(w.length < 2) continue;
    if(stopWords[w]) continue;
    freq[w] = (freq[w] || 0) + 1;
  }
  return Object.keys(freq).sort(function(a, b){ return freq[b] - freq[a]; }).slice(0, 10);
}

/**
 * 文本转向量（词袋模型：词频）
 * 中文按字切分，英文按空格/标点切分，提升中文检索效果
 * @param {string} text - 文本
 * @returns {Object<string, number>} 词频向量
 */
function _textToVector(text){
  const textStr = String(text || "").toLowerCase();
  if(!textStr) return {};
  const vec = {};
  /* 英文按空格/标点切分 */
  const parts = textStr.split(/[\s,，。、；;：:！!？?（）()[\]【】{}""''""''`~@#$%^&*\-_=+|\\/<>0-9]+/);
  for(let i = 0; i < parts.length; i++){
    const p = parts[i];
    if(!p) continue;
    if(/^[a-z_]+$/.test(p)){
      /* 英文词 */
      if(p.length >= 2) vec[p] = (vec[p] || 0) + 1;
      continue;
    }
    /* 中文按字切分 */
    for(let j = 0; j < p.length; j++){
      const ch = p.charAt(j);
      if(/[\u4e00-\u9fa5]/.test(ch)) vec[ch] = (vec[ch] || 0) + 1;
    }
  }
  return vec;
}

/**
 * 余弦相似度
 * @param {Object<string, number>} a - 向量 A
 * @param {Object<string, number>} b - 向量 B
 * @returns {number} 相似度 [0, 1]
 */
function _cosineSimilarity(a, b){
  if(!a || !b) return 0;
  const keys = Object.keys(a);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for(let i = 0; i < keys.length; i++){
    const k = keys[i];
    normA += a[k] * a[k];
    if(b[k] !== undefined) dot += a[k] * b[k];
  }
  const bKeys = Object.keys(b);
  for(let j = 0; j < bKeys.length; j++){
    normB += b[bKeys[j]] * b[bKeys[j]];
  }
  if(normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/* ============================================================
 * 3. RAG 知识检索：TF-IDF 索引 + 相似度检索 + 上下文增强
 * ============================================================ */

/**
 * 构建 TF-IDF 索引
 * @param {Array<{id:string, content:string, type:string, metadata:Object}>} documents - 文档列表
 * @returns {{docs:Array, df:Object, N:number, avgLen:number}} 索引对象
 */
function buildIndex(documents){
  const docs = Array.isArray(documents) ? documents.filter(function(d){
    return d && d.content && String(d.content).trim();
  }) : [];

  /* 文档频率（DF）：每个词在多少篇文档中出现 */
  const df = {};
  let totalLen = 0;
  for(let i = 0; i < docs.length; i++){
    const tokens = _tokenize(docs[i].content);
    const seen = {};
    for(let j = 0; j < tokens.length; j++){
      const w = tokens[j];
      seen[w] = true;
    }
    const keys = Object.keys(seen);
    for(let k = 0; k < keys.length; k++){
      df[keys[k]] = (df[keys[k]] || 0) + 1;
    }
    totalLen += tokens.length;
    /* 缓存 token 频次到文档上，避免重复计算 */
    docs[i]._tf = _termFreq(tokens);
    docs[i]._len = tokens.length;
  }

  const N = docs.length;
  const avgLen = N > 0 ? totalLen / N : 0;

  const index = {docs: docs, df: df, N: N, avgLen: avgLen};
  _ragIndex = index;
  return index;
}

/**
 * 计算 TF-IDF 分数（query 对 doc）
 * @param {string} query - 查询文本
 * @param {Object} doc - 文档对象（含 _tf 缓存）
 * @param {Object} [index] - 索引对象（默认用 _ragIndex）
 * @returns {number} TF-IDF 分数
 */
function tfidfScore(query, doc, index){
  const idx = index || _ragIndex;
  if(!idx || !doc) return 0;
  const qTokens = _tokenize(query);
  if(!qTokens.length) return 0;

  const tf = doc._tf || _termFreq(_tokenize(doc.content));
  const df = idx.df || {};
  const N = idx.N || 1;
  let score = 0;

  /* query 中每个词的 TF-IDF 累加 */
  const qFreq = {};
  for(let i = 0; i < qTokens.length; i++){
    qFreq[qTokens[i]] = (qFreq[qTokens[i]] || 0) + 1;
  }

  const keys = Object.keys(qFreq);
  for(let k = 0; k < keys.length; k++){
    const w = keys[k];
    if(tf[w] === undefined) continue;
    const qTf = qFreq[w] / qTokens.length;
    const dTf = tf[w] / (doc._len || Object.keys(tf).length || 1);
    const dFreq = df[w] || 0;
    if(dFreq === 0) continue;
    const idf = Math.log(1 + N / dFreq);
    score += qTf * dTf * idf;
  }

  return score;
}

/**
 * 检索最相关的 K 篇文档
 * @param {string} query - 查询文本
 * @param {number} [topK] - 返回前 K 篇（默认 5）
 * @returns {Array<{doc:Object, score:number}>} 相关文档列表
 */
function ragRetrieve(query, topK){
  const q = String(query || "").trim();
  if(!q) return [];
  const k = Math.max(1, Number(topK) || 5);
  const idx = _ragIndex;
  if(!idx || !idx.docs || !idx.docs.length) return [];

  const scored = idx.docs.map(function(doc){
    return {doc: doc, score: tfidfScore(q, doc, idx)};
  });
  scored.sort(function(a, b){ return b.score - a.score; });
  return scored.slice(0, k).filter(function(x){ return x.score > 0; });
}

/**
 * 用检索结果增强 AI 上下文（拼接相关内容到 prompt）
 * @param {string} query - 原始查询
 * @param {Array<{doc:Object, score:number}>} retrievedDocs - 检索结果
 * @returns {string} 增强后的 prompt
 */
function ragAugment(query, retrievedDocs){
  const q = String(query || "");
  const docs = Array.isArray(retrievedDocs) ? retrievedDocs : [];
  if(!docs.length) return q;

  const contextParts = docs.map(function(item, i){
    const d = item.doc || {};
    const content = String(d.content || "").slice(0, 200);
    const type = d.type || t("p5.doc", "文档");
    const meta = d.metadata ? " " + JSON.stringify(d.metadata) : "";
    return "[" + (i + 1) + "] (" + type + meta + ") " + content;
  });

  return t("p5.knowledgePrefix", "【相关知识】\n") + contextParts.join("\n") + t("p5.userQuestionPrefix", "\n\n【用户问题】\n") + q;
}

/**
 * 从笔记系统构建索引
 * @returns {{docs:Array, df:Object, N:number, avgLen:number}} 索引对象
 */
function indexFromNotes(){
  const notes = (typeof getNotes === "function") ? getNotes() : [];
  const docs = notes.map(function(n){
    return {
      id: n.id,
      content: (n.title || "") + " " + (n.content || "") + " " + ((n.tags || []).join(" ")),
      type: "note",
      metadata: {title: n.title, category: n.category, tags: n.tags}
    };
  });
  return buildIndex(docs);
}

/**
 * 从任务记录构建索引
 * @returns {{docs:Array, df:Object, N:number, avgLen:number}} 索引对象
 */
function indexFromTasks(){
  const tasks = (typeof getActiveTasks === "function") ? getActiveTasks() : [];
  const docs = tasks.map(function(t){
    return {
      id: t.id,
      content: (t.title || "") + " " + (t.note || "") + " " + ((t.tags || []).join(" ")),
      type: "task",
      metadata: {title: t.title, scenario: t.sc, status: t.status, priority: t.priority}
    };
  });
  return buildIndex(docs);
}

/**
 * 持久化 RAG 索引到 localStorage
 * @param {Object} [index] - 索引对象（默认用 _ragIndex）
 * @returns {boolean} 是否保存成功
 */
function saveRagIndex(index){
  const idx = index || _ragIndex;
  if(!idx) return false;
  try{
    /* 剥离 _tf / _len 等内部缓存，只持久化必要字段 */
    const docs = (idx.docs || []).map(function(d){
      return {
        id: d.id,
        content: d.content,
        type: d.type,
        metadata: d.metadata,
        _tf: d._tf,
        _len: d._len
      };
    });
    const serializable = {docs: docs, df: idx.df, N: idx.N, avgLen: idx.avgLen};
    localStorage.setItem(PREFIX + RAG_INDEX_KEY, JSON.stringify(serializable));
    return true;
  }catch(e){ return false; }
}

/**
 * 从 localStorage 加载 RAG 索引
 * @returns {Object|null} 索引对象或 null
 */
function loadRagIndex(){
  try{
    const raw = localStorage.getItem(PREFIX + RAG_INDEX_KEY);
    if(!raw) return null;
    const parsed = JSON.parse(raw);
    if(!parsed || !Array.isArray(parsed.docs)) return null;
    _ragIndex = parsed;
    return parsed;
  }catch(e){ return null; }
}

/* ---------- RAG 内部辅助 ---------- */
/**
 * 分词（中英文混合：英文按空格/标点，中文按字）
 * @param {string} text - 文本
 * @returns {string[]} 词列表
 */
function _tokenize(text){
  const textStr = String(text || "").toLowerCase();
  if(!textStr) return [];
  /* 简化分词：英文按空格/标点切分，中文按字切分 */
  const tokens = [];
  const parts = textStr.split(/[\s,，。、；;：:！!？?（）()[\]【】{}""''""''`~@#$%^&*\-_=+|\\/<>0-9]+/);
  for(let i = 0; i < parts.length; i++){
    const p = parts[i];
    if(!p) continue;
    /* 英文词直接加入 */
    if(/^[a-z_]+$/.test(p)){
      if(p.length >= 2) tokens.push(p);
      continue;
    }
    /* 中文按字切分（简化） */
    for(let j = 0; j < p.length; j++){
      const ch = p.charAt(j);
      if(/[\u4e00-\u9fa5]/.test(ch)) tokens.push(ch);
    }
  }
  return tokens;
}

/**
 * 词频统计
 * @param {string[]} tokens - 词列表
 * @returns {Object<string, number>} 词频映射
 */
function _termFreq(tokens){
  const freq = {};
  for(let i = 0; i < tokens.length; i++){
    const w = tokens[i];
    freq[w] = (freq[w] || 0) + 1;
  }
  return freq;
}

/* ============================================================
 * 4. AI 代码审查：模式匹配 + 安全漏洞检测 + 性能优化建议
 * ============================================================ */

/**
 * AI 审查代码片段（本地分析，不依赖 AI API）
 * @param {string} code - 代码片段
 * @param {string} [language] - 编程语言（默认 javascript）
 * @param {Object} [context] - 上下文（可选）
 * @returns {{issues:Array, score:number, summary:string}} 审查结果
 */
function reviewCode(code, language, context){
  const c = String(code || "");
  const lang = String(language || "javascript").toLowerCase();
  if(!c.trim()){
    return {issues: [], score: 100, summary: t("p5.codeEmpty", "代码为空")};
  }

  const issues = [];

  /* 安全漏洞检测 */
  const secIssues = detectSecurityIssues(c);
  for(let i = 0; i < secIssues.length; i++){
    secIssues[i].category = "security";
    issues.push(secIssues[i]);
  }

  /* 性能优化建议 */
  const perfIssues = suggestOptimization(c);
  for(let j = 0; j < perfIssues.length; j++){
    perfIssues[j].category = "performance";
    issues.push(perfIssues[j]);
  }

  /* 代码风格/质量检测（语言相关） */
  const styleIssues = _detectStyleIssues(c, lang);
  for(let k = 0; k < styleIssues.length; k++){
    styleIssues[k].category = "style";
    issues.push(styleIssues[k]);
  }

  const score = reviewScore(issues);
  const summary = _buildReviewSummary(issues, score, c);

  return {issues: issues, score: score, summary: summary};
}

/**
 * 安全漏洞检测（模式匹配）
 * @param {string} code - 代码片段
 * @returns {Array<{type:string, severity:string, line:number, message:string, suggestion:string}>} 问题列表
 */
function detectSecurityIssues(code){
  const c = String(code || "");
  const lines = c.split("\n");
  const issues = [];

  /* 检测模式列表 */
  const patterns = [
    /* 硬编码密钥/密码 */
    {re: /(?:api[_-]?key|apikey|secret|password|passwd|pwd|token|access[_-]?key)\s*[:=]\s*["'][^"']{8,}["']/i,
     type: "hardcoded_secret", severity: "high",
     msg: t("lint.hardcoded_secret.msg","疑似硬编码密钥/密码"), sug: t("lint.hardcoded_secret.sug","使用环境变量或配置文件管理敏感信息")},
    /* SQL 注入（字符串拼接：execute 调用参数中含 + 或 ${ 且含 SQL 关键词） */
    {re: /(?:execute|query|exec)\s*\(\s*[^)]*(?:select|insert|update|delete|drop|where)\b[^)]*(?:\+|\$\{)/i,
     type: "sql_injection", severity: "high",
     msg: t("lint.sql_injection.msg","疑似 SQL 注入（字符串拼接）"), sug: t("lint.sql_injection.sug","使用参数化查询或预编译语句")},
    /* eval 使用 */
    {re: /\beval\s*\(/,
     type: "eval_usage", severity: "high",
     msg: t("lint.eval_usage.msg","使用 eval() 可能导致代码注入"), sug: t("lint.eval_usage.sug","避免使用 eval，改用 JSON.parse 或 Function 构造器")},
    /* innerHTML 赋值（XSS 风险） */
    {re: /\.innerHTML\s*=\s*[^;]*[a-zA-Z_$]/,
     type: "xss_risk", severity: "medium",
     msg: t("lint.xss_risk.msg","直接赋值 innerHTML 可能存在 XSS 风险"), sug: t("lint.xss_risk.sug","使用 sanitizeHtml 包裹或 textContent")},
    /* document.write */
    {re: /document\.write\s*\(/,
     type: "document_write", severity: "medium",
     msg: t("lint.document_write.msg","使用 document.write 可能导致 XSS"), sug: t("lint.document_write.sug","使用 DOM API 或 innerHTML（已消毒）")},
    /* 命令注入（child_process exec 字符串拼接） */
    {re: /(?:exec|execSync|spawn)\s*\(\s*["'`].*(?:\+|\$\{)/,
     type: "command_injection", severity: "high",
     msg: t("lint.command_injection.msg","疑似命令注入（字符串拼接）"), sug: t("lint.command_injection.sug","使用 execFile 或传入参数数组")},
    /* 危险的正则表达式（ReDoS） */
    {re: /new RegExp\s*\(\s*["'`].*(?:\([^)]*\+\)|\([^)]*\*\))/,
     type: "redos_risk", severity: "medium",
     msg: t("lint.redos_risk.msg","疑似 ReDoS 风险的正则表达式"), sug: t("lint.redos_risk.sug","简化正则或使用安全正则库")},
    /* http 明文传输 */
    {re: /http:\/\/(?!localhost|127\.0\.0\.1)/,
     type: "insecure_http", severity: "low",
     msg: t("lint.insecure_http.msg","使用明文 HTTP 传输"), sug: t("lint.insecure_http.sug","使用 HTTPS 加密传输")},
    /* localStorage 存储敏感数据 */
    {re: /localStorage\.setItem\s*\(\s*["'].*(?:token|password|secret|key|auth)["']/i,
     type: "insecure_storage", severity: "medium",
     msg: t("lint.insecure_storage.msg","在 localStorage 存储敏感数据"), sug: t("lint.insecure_storage.sug","敏感数据应加密存储或使用 sessionStorage/IndexedDB")},
    /* prototype 污染 */
    {re: /__proto__|constructor\s*\[|prototype\s*\[/,
     type: "prototype_pollution", severity: "high",
     msg: t("lint.prototype_pollution.msg","疑似原型链污染"), sug: t("lint.prototype_pollution.sug","避免直接操作 __proto__，使用 Object.create")},
    /* innerHTML + 用户输入 */
    {re: /innerHTML\s*=\s*.*(?:prompt|confirm|location\.hash|document\.cookie)/,
     type: "xss_user_input", severity: "high",
     msg: t("lint.xss_user_input.msg","innerHTML 赋值用户输入，XSS 风险高"), sug: t("lint.xss_user_input.sug","必须对用户输入进行转义/消毒")}
  ];

  for(let p = 0; p < patterns.length; p++){
    const pat = patterns[p];
    let match = null;
    const re = new RegExp(pat.re.source, pat.re.flags + (pat.re.flags.indexOf("g") >= 0 ? "" : "g"));
    while((match = re.exec(c)) !== null){
      /* 计算行号 */
      const lineNum = c.slice(0, match.index).split("\n").length;
      issues.push({
        type: pat.type,
        severity: pat.severity,
        line: lineNum,
        message: pat.msg,
        suggestion: pat.sug
      });
      if(re.lastIndex === match.index) re.lastIndex++;  /* 防止零宽匹配死循环 */
    }
  }

  return issues;
}

/**
 * 性能优化建议（模式匹配）
 * @param {string} code - 代码片段
 * @returns {Array<{type:string, severity:string, line:number, message:string, suggestion:string}>} 建议列表
 */
function suggestOptimization(code){
  const c = String(code || "");
  const issues = [];

  /* 检测模式列表 */
  const patterns = [
    /* for 循环内重复读取 length */
    {re: /for\s*\(\s*(?:var|let|const)?\s*\w+\s*=\s*0\s*;\s*\w+\s*<\s*\w+\.length\s*;\s*\w+\+\+/,
     type: "loop_length", severity: "low",
     msg: t("lint.loop_length.msg","循环条件中重复读取 length"), sug: t("lint.loop_length.sug","缓存 length 到局部变量：for(let i=0, len=arr.length; i<len; i++)")},
    /* 嵌套循环（O(n²)） */
    {re: /for\s*\([^)]*\)\s*\{[^}]*for\s*\(/,
     type: "nested_loop", severity: "medium",
     msg: t("lint.nested_loop.msg","嵌套循环可能导致 O(n²) 复杂度"), sug: t("lint.nested_loop.sug","考虑使用哈希表或优化算法降低复杂度")},
    /* 同步 IO（fs.readFileSync） */
    {re: /readFileSync|writeFileSync|execSync|existsSync/,
     type: "sync_io", severity: "medium",
     msg: t("lint.sync_io.msg","同步 IO 调用阻塞事件循环"), sug: t("lint.sync_io.sug","使用异步版本 readFile/writeFile")},
    /* 大量 DOM 操作未批量 */
    {re: /for\s*\([^)]*\)\s*\{[^}]*(?:appendChild|insertBefore|createElement)/,
     type: "dom_loop", severity: "medium",
     msg: t("lint.dom_loop.msg","循环内 DOM 操作可能触发频繁重排"), sug: t("lint.dom_loop.sug","使用 DocumentFragment 批量操作或 requestAnimationFrame")},
    /* 未使用 debounce 的事件监听 */
    {re: /addEventListener\s*\(\s*["'](?:scroll|resize|input|mousemove)["']\s*,/,
     type: "no_debounce", severity: "low",
     msg: t("lint.no_debounce.msg","高频事件未防抖"), sug: t("lint.no_debounce.sug","使用 debounce/throttle 节流")},
    /* JSON.parse 未 try-catch（简化检测：直接匹配 JSON.parse 调用） */
    {re: /JSON\.parse\s*\(/,
     type: "unsafe_parse", severity: "low",
     msg: t("lint.unsafe_parse.msg","JSON.parse 建议包裹 try-catch"), sug: t("lint.unsafe_parse.sug","包裹 try-catch 防止解析失败崩溃")},
    /* Promise 未 await/catch */
    {re: /\w+\([^)]*\)\s*\.\s*then\s*\(\s*(?:[^)]*\)\s*)?(?![^;]*catch)/,
     type: "unhandled_promise", severity: "medium",
     msg: t("lint.unhandled_promise.msg","Promise 可能未处理 rejection"), sug: t("lint.unhandled_promise.sug","添加 .catch() 或使用 async/await + try-catch")},
    /* 重复正则编译 */
    {re: /for\s*\([^)]*\)\s*\{[^}]*new RegExp\s*\(/,
     type: "regex_in_loop", severity: "low",
     msg: t("lint.regex_in_loop.msg","循环内重复编译正则表达式"), sug: t("lint.regex_in_loop.sug","将正则提到循环外编译一次")},
    /* console.log 残留 */
    {re: /console\.log\s*\(/,
     type: "console_log", severity: "low",
     msg: t("lint.console_log.msg","残留 console.log 调试代码"), sug: t("lint.console_log.sug","移除调试代码或使用条件日志")},
    /* var 声明（应使用 let/const） */
    {re: /\bvar\s+\w+/,
     type: "var_decl", severity: "low",
     msg: t("lint.var_decl.msg","使用 var 声明（函数作用域，易出错）"), sug: t("lint.var_decl.sug","使用 let/const 声明块作用域变量")}
  ];

  for(let p = 0; p < patterns.length; p++){
    const pat = patterns[p];
    try{
      const re = new RegExp(pat.re.source, (pat.re.flags || "") + "g");
      let match = null;
      while((match = re.exec(c)) !== null){
        const lineNum = c.slice(0, match.index).split("\n").length;
        issues.push({
          type: pat.type,
          severity: pat.severity,
          line: lineNum,
          message: pat.msg,
          suggestion: pat.sug
        });
        if(re.lastIndex === match.index) re.lastIndex++;
      }
    }catch(e){ /* 正则编译失败：跳过该模式 */ }
  }

  return issues;
}

/**
 * 代码风格/质量检测
 * @param {string} code - 代码片段
 * @param {string} lang - 语言
 * @returns {Array} 问题列表
 */
function _detectStyleIssues(code, lang){
  const c = String(code || "");
  const issues = [];
  const lines = c.split("\n");

  /* 行长度检测 */
  for(let i = 0; i < lines.length; i++){
    if(lines[i].length > 120){
      issues.push({
        type: "long_line",
        severity: "low",
        line: i + 1,
        message: t("p5.longLine", "行长度超过 120 字符（") + lines[i].length + t("p5.longLineSuffix", "）"),
        suggestion: t("p5.splitLongLine", "拆分长行以提升可读性")
      });
    }
  }

  /* TODO/FIXME 标记 */
  const todoRe = /(?:TODO|FIXME|HACK|XXX)\b/g;
  let m = null;
  while((m = todoRe.exec(c)) !== null){
    const lineNum = c.slice(0, m.index).split("\n").length;
    issues.push({
      type: "todo",
      severity: "low",
      line: lineNum,
      message: t("p5.unfinishedMark", "未完成的标记：") + m[0],
      suggestion: t("p5.finishOrIssue", "完成或转为 issue 跟踪")
    });
  }

  /* 空函数体 */
  const emptyFnRe = /function\s*\w*\s*\([^)]*\)\s*\{\s*\}/g;
  while((m = emptyFnRe.exec(c)) !== null){
    const emptyLineNum = c.slice(0, m.index).split("\n").length;
    issues.push({
      type: "empty_function",
      severity: "low",
      line: emptyLineNum,
      message: t("p5.emptyFn", "空函数体"),
      suggestion: t("p5.addImpl", "添加实现或注释说明")
    });
  }

  return issues;
}

/**
 * 计算代码质量评分（0-100）
 * 评分规则：100 - Σ(severity 权重)
 *   high=15, medium=8, low=3
 * @param {Array<{severity:string}>} issues - 问题列表
 * @returns {number} 评分 [0, 100]
 */
function reviewScore(issues){
  if(!Array.isArray(issues) || !issues.length) return 100;
  const weights = {high: 15, medium: 8, low: 3};
  let total = 0;
  for(let i = 0; i < issues.length; i++){
    const sev = issues[i] && issues[i].severity;
    total += weights[sev] || 5;
  }
  return Math.max(0, 100 - total);
}

/**
 * 构建审查摘要
 * @param {Array} issues - 问题列表
 * @param {number} score - 评分
 * @param {string} code - 代码
 * @returns {string} 摘要
 */
function _buildReviewSummary(issues, score, code){
  const lines = String(code || "").split("\n").length;
  const parts = [];
  parts.push(t("p5.codeLines", "代码行数：") + lines + t("p5.scoreMid", "，评分：") + score + "/100");

  if(!issues.length){
    parts.push(t("p5.noIssues", "未发现问题。"));
    return parts.join("；");
  }

  /* 按严重度统计 */
  const counts = {high: 0, medium: 0, low: 0};
  for(let i = 0; i < issues.length; i++){
    const sev = issues[i].severity || "low";
    counts[sev] = (counts[sev] || 0) + 1;
  }
  const parts2 = [];
  if(counts.high) parts2.push(t("p5.high", "高危 ") + counts.high);
  if(counts.medium) parts2.push(t("p5.medium", "中等 ") + counts.medium);
  if(counts.low) parts2.push(t("p5.low", "低 ") + counts.low);
  parts.push(t("p5.issues", "问题：") + parts2.join("、"));

  /* 按类别统计 */
  const cats = {};
  for(let j = 0; j < issues.length; j++){
    const cat = issues[j].category || "other";
    cats[cat] = (cats[cat] || 0) + 1;
  }
  const catParts = [];
  const catKeys = Object.keys(cats);
  for(let k = 0; k < catKeys.length; k++){
    catParts.push(catKeys[k] + " " + cats[catKeys[k]]);
  }
  parts.push(t("p5.category", "类别：") + catParts.join("、"));

  return parts.join("；");
}

/* ============================================================
 * 5. 笔记变更钩子：自动更新 RAG 索引
 * ============================================================ */

/**
 * 笔记变更后自动更新 RAG 索引（钩子函数）
 * 调用时机：createNote / updateNote / deleteNote 之后
 * @returns {void}
 */
function _onNotesChanged(){
  try{
    /* 仅当已有索引时才更新，避免无谓重建 */
    if(_ragIndex && _ragIndex.docs && _ragIndex.docs.length){
      indexFromNotes();
      saveRagIndex();
    }
  }catch(e){ /* 钩子失败不影响笔记操作 */ }
}// ===== Offline AI & Edge Computing (v1.7-B 离线AI与边缘计算) =====
/* ============================================================
 * v1.7-B 离线AI与边缘计算
 * ------------------------------------------------------------
 *  四大能力：
 *   1) WebLLM 本地推理框架：浏览器中运行量化大模型（API 框架，不实际下载）
 *      - initWebLLM / webllmChat / webllmAvailable / webllmListModels
 *      - webllmLoadProgress / webllmUnload
 *   2) ONNX Runtime Web 框架：小模型推理（文本分类 / NER）
 *      - initONNX / onnxClassify / onnxNER / onnxAvailable / onnxListModels
 *   3) 模型缓存管理：IndexedDB 持久化 + 版本管理 + 清理
 *      - cacheModel / getCachedModel / removeCachedModel / listCachedModels
 *      - getCacheSize / clearModelCache / ensureModelLoaded
 *   4) 隐私优先架构：敏感数据标记 + 本地处理策略 + 数据过滤
 *      - markSensitive / sanitizeForCloud / shouldProcessLocally
 *      - setPrivacyPolicy / getPrivacyPolicy / auditDataFlow
 *
 *  设计约定：
 *   - 使用 var 声明模块级私有状态（54 > 31，避免 TDZ）
 *   - 持久化键：wb_privacy_policy（隐私策略）、模型缓存走 IDB V2 'models' store
 *   - 所有导出函数均为 function 声明（提升），可在 31 中直接引用
 *   - 颜色用 var(--token) CSS 令牌（lint-colors 门禁）
 *   - innerHTML 赋值由调用方用 sanitizeHtml 包裹
 *   - WebLLM/ONNX 只做 API 框架：检测 WebGPU/Worker 可用性，不实际下载模型
 *   - WebLLM 不可用时降级到云端 AI（chatOnce），ONNX 不可用时用关键词规则 fallback
 *   - 模型缓存在 IDB 不可用时降级到内存 Map（_modelCacheFallback）
 *   - 隐私过滤稳健：未知字段默认不敏感，已知敏感字段必须过滤
 *   - chatOnce / getCfg / idbPut / idbGet / idbDelete / idbGetAll / isIDBAvailable
 *     在更早模块定义（20/07/02b），可直接引用
 *   - idbPutModel / idbGetModel / idbDeleteModel / idbListModels 在 02b 中新增（< 54）
 * ============================================================ */

/* ---------- 持久化键 ---------- */
const PRIVACY_POLICY_KEY = "wb_privacy_policy";

/* ---------- 隐私级别常量 ---------- */
const PRIVACY_LEVELS = {
  PUBLIC: "public",
  INTERNAL: "internal",
  CONFIDENTIAL: "confidential",
  RESTRICTED: "restricted"
};

/* ---------- 模块级私有状态（var 声明，避免 TDZ） ---------- */
let _webllmEngine = null;           // WebLLM 引擎实例（模拟）
let _webllmCurrentModel = null;     // 当前已加载的模型 ID
let _webllmLoadProgress = 0;        // 模型加载进度 0-100
let _webllmLoading = false;         // 是否正在加载
const _webllmAvailable = (function(){
  try{
    /* WebLLM 需要 WebGPU + Worker + WASM 支持 */
    return (typeof navigator !== "undefined") &&
           (typeof navigator.gpu !== "undefined") &&
           (typeof Worker !== "undefined") &&
           (typeof WebAssembly !== "undefined");
  }catch(e){ return false; }
})();

let _onnxSession = null;            // ONNX Runtime 会话（模拟）
let _onnxCurrentModel = null;       // 当前已加载的 ONNX 模型路径
const _onnxAvailable = (function(){
  try{
    /* ONNX Runtime Web 需要 WASM 支持；window.ort 是 onnxruntime-web 注入 */
    return (typeof WebAssembly !== "undefined") &&
           (typeof window !== "undefined") &&
           (typeof window.ort !== "undefined");
  }catch(e){ return false; }
})();

/* 模型缓存内存降级（IDB 不可用时使用） */
let _modelCacheFallback = new Map();

/* 隐私策略缓存 */
let _privacyPolicy = null;

/* 数据流审计日志（内存，最多保留 200 条） */
let _dataFlowAuditLog = [];
const _DATA_FLOW_AUDIT_MAX = 200;

/* ============================================================
 * 1. WebLLM 本地推理框架
 * ============================================================ */

/* 预定义 WebLLM 可用模型列表（不实际下载，仅元数据） */
const WEBLLM_MODELS = [
  { id: "Llama-3.2-1B-Instruct-q4f16_1-MLC",  name: "Llama-3.2-1B-Instruct",  size: "0.9GB",  description: t("model.llama1b.desc","Meta Llama 3.2 1B 参数量化模型，适合轻量对话"), quantization: "q4f16_1" },
  { id: "Llama-3.2-3B-Instruct-q4f16_1-MLC",  name: "Llama-3.2-3B-Instruct",  size: "2.0GB",  description: t("model.llama3b.desc","Meta Llama 3.2 3B 参数量化模型，平衡质量与速度"), quantization: "q4f16_1" },
  { id: "Phi-3.5-mini-instruct-q4f16_1-MLC",  name: "Phi-3.5-mini-instruct",  size: "2.4GB",  description: t("model.phi35.desc","Microsoft Phi-3.5 mini 量化模型，推理能力强"), quantization: "q4f16_1" },
  { id: "Qwen2.5-1.5B-Instruct-q4f16_1-MLC",  name: "Qwen2.5-1.5B-Instruct",  size: "1.5GB",  description: t("model.qwen25.desc","阿里 Qwen2.5 1.5B 量化模型，中文友好"), quantization: "q4f16_1" },
  { id: "gemma-2-2b-it-q4f16_1-MLC",          name: "gemma-2-2b-it",          size: "1.6GB",  description: t("model.gemma2.desc","Google Gemma 2 2B 量化模型"), quantization: "q4f16_1" },
  { id: "SmolLM2-1.7B-Instruct-q4f16_1-MLC",  name: "SmolLM2-1.7B-Instruct",  size: "1.0GB",  description: t("model.smollm2.desc","HuggingFace SmolLM2 轻量模型"), quantization: "q4f16_1" }
];

/**
 * 检测 WebLLM 是否可用（WebGPU + Worker + WASM）
 * @returns {boolean}
 */
function webllmAvailable(){
  return _webllmAvailable && _webllmEngine !== null;
}

/**
 * 列出可用 WebLLM 模型
 * @returns {Array<{id:string,name:string,size:string,description:string,quantization:string}>}
 */
function webllmListModels(){
  /* 返回深拷贝避免外部修改 */
  return WEBLLM_MODELS.map(function(m){
    return { id: m.id, name: m.name, size: m.size, description: m.description, quantization: m.quantization };
  });
}

/**
 * 获取模型加载进度（0-100）
 * @returns {number}
 */
function webllmLoadProgress(){
  return _webllmLoadProgress;
}

/**
 * 初始化 WebLLM 引擎并加载指定模型
 * 仅做 API 框架：模拟加载进度推进，不实际下载模型文件
 * @param {string} modelId - 模型 ID（来自 WEBLLM_MODELS）
 * @returns {Promise<{ok:boolean, modelId:string, reason?:string}>}
 */
function initWebLLM(modelId){
  const mid = String(modelId || "").trim();
  if(!mid){
    return Promise.resolve({ ok: false, modelId: "", reason: t("p5.modelIdEmpty", "modelId 为空") });
  }
  /* 校验模型 ID 是否在预定义列表 */
  let found = null;
  for(let i = 0; i < WEBLLM_MODELS.length; i++){
    if(WEBLLM_MODELS[i].id === mid){ found = WEBLLM_MODELS[i]; break; }
  }
  if(!found){
    return Promise.resolve({ ok: false, modelId: mid, reason: t("p5.unknownModelId", "未知模型 ID") });
  }
  /* WebLLM 不可用：返回失败但提供降级建议 */
  if(!_webllmAvailable){
    return Promise.resolve({ ok: false, modelId: mid, reason: t("p5.webllmUnavailable", "WebLLM 不可用（需要 WebGPU + Worker + WASM），请使用 webllmChat 降级到云端") });
  }
  /* 已加载同一模型：直接返回成功 */
  if(_webllmEngine && _webllmCurrentModel === mid){
    _webllmLoadProgress = 100;
    return Promise.resolve({ ok: true, modelId: mid });
  }
  /* 模拟加载流程：进度从 0 推进到 100 */
  if(_webllmLoading){
    return Promise.resolve({ ok: false, modelId: mid, reason: t("p5.loadingOtherModel", "正在加载其他模型，请先 webllmUnload") });
  }
  _webllmLoading = true;
  _webllmLoadProgress = 0;
  _webllmCurrentModel = mid;
  return new Promise(function(resolve){
    /* 模拟分阶段加载：0 → 30 → 60 → 90 → 100 */
    const stages = [0, 30, 60, 90, 100];
    let idx = 0;
    function tick(){
      if(idx >= stages.length){
        _webllmEngine = { modelId: mid, createdAt: Date.now() };
        _webllmLoading = false;
        _webllmLoadProgress = 100;
        resolve({ ok: true, modelId: mid });
        return;
      }
      _webllmLoadProgress = stages[idx];
      idx++;
      setTimeout(tick, 5);
    }
    tick();
  });
}

/**
 * 卸载 WebLLM 模型释放内存
 * @returns {{ok:boolean, reason?:string}}
 */
function webllmUnload(){
  if(!_webllmEngine){
    return { ok: false, reason: t("p5.noLoadedModel", "无已加载模型") };
  }
  _webllmEngine = null;
  _webllmCurrentModel = null;
  _webllmLoadProgress = 0;
  _webllmLoading = false;
  return { ok: true };
}

/**
 * 本地模型推理
 * WebLLM 不可用或未加载时降级到云端 AI（chatOnce）
 * @param {string} prompt - 用户输入
 * @param {{maxTokens?:number, temperature?:number, fallback?:boolean}} [options]
 * @returns {Promise<{ok:boolean, text:string, source:"webllm"|"cloud"|"empty", reason?:string}>}
 */
function webllmChat(prompt, options){
  const p = String(prompt || "").trim();
  if(!p){
    return Promise.resolve({ ok: false, text: "", source: "empty", reason: t("p5.promptEmpty", "prompt 为空") });
  }
  options = options || {};
  /* WebLLM 可用且已加载：模拟本地推理 */
  if(webllmAvailable() && _webllmCurrentModel){
    const modelName = _webllmCurrentModel;
    /* 模拟本地推理输出（不实际运行模型） */
    const simulated = t("p5.localModelPrefix", "[本地模型 ") + modelName + t("p5.localModelSuffix", "] ") + p.slice(0, 200);
    return Promise.resolve({ ok: true, text: simulated, source: "webllm" });
  }
  /* 降级到云端 AI：调用 chatOnce */
  if(options.fallback === false){
    return Promise.resolve({ ok: false, text: "", source: "empty", reason: t("p5.webllmNoFallback", "WebLLM 不可用且 fallback 已禁用") });
  }
  try{
    if(typeof chatOnce !== "function"){
      return Promise.resolve({ ok: false, text: "", source: "empty", reason: t("p5.chatOnceUnavailable", "chatOnce 不可用") });
    }
    return chatOnce([{ role: "user", content: p }], { retry: 1 })
      .then(function(resp){
        /* OpenAI 风格响应：choices[0].message.content */
        let text = "";
        try{
          if(resp && resp.choices && resp.choices[0] && resp.choices[0].message){
            text = resp.choices[0].message.content || "";
          }
        }catch(e){ text = ""; }
        return { ok: true, text: text, source: "cloud" };
      })
      .catch(function(err){
        return { ok: false, text: "", source: "cloud", reason: String(err && err.message || err) };
      });
  }catch(e){
    return Promise.resolve({ ok: false, text: "", source: "empty", reason: t("p5.chatOnceError", "chatOnce 调用异常：") + String(e) });
  }
}

/* ============================================================
 * 2. ONNX Runtime Web 框架
 * ============================================================ */

/* 预定义 ONNX 可用模型列表 */
const ONNX_MODELS = [
  { id: "sentiment-bert",     path: "onnx/sentiment-bert.onnx",     type: "classification", description: t("model.sentimentBert.desc","BERT 情感分析（正/负）"),        size: "420MB" },
  { id: "topic-roberta",      path: "onnx/topic-roberta.onnx",      type: "classification", description: t("model.topicRoberta.desc","RoBERTa 主题分类（科技/财经/体育/娱乐）"), size: "480MB" },
  { id: "spam-distilbert",    path: "onnx/spam-distilbert.onnx",    type: "classification", description: t("model.spamDistilbert.desc","DistilBERT 垃圾信息分类"),        size: "260MB" },
  { id: "ner-bert",           path: "onnx/ner-bert.onnx",           type: "ner",            description: t("model.nerBert.desc","BERT 命名实体识别（人/地/组/时）"), size: "430MB" }
];

/**
 * 检测 ONNX Runtime 是否可用
 * @returns {boolean}
 */
function onnxAvailable(){
  return _onnxAvailable && _onnxSession !== null;
}

/**
 * 列出可用 ONNX 模型
 * @returns {Array<{id:string,path:string,type:string,description:string,size:string}>}
 */
function onnxListModels(){
  return ONNX_MODELS.map(function(m){
    return { id: m.id, path: m.path, type: m.type, description: m.description, size: m.size };
  });
}

/**
 * 初始化 ONNX Runtime 会话
 * 仅做 API 框架：模拟会话创建，不实际加载 ONNX 模型文件
 * @param {string} modelPath - 模型路径或 ID
 * @returns {Promise<{ok:boolean, modelPath:string, reason?:string}>}
 */
function initONNX(modelPath){
  const mp = String(modelPath || "").trim();
  if(!mp){
    return Promise.resolve({ ok: false, modelPath: "", reason: t("p5.modelPathEmpty", "modelPath 为空") });
  }
  /* 校验模型路径或 ID 是否在预定义列表 */
  let found = null;
  for(let i = 0; i < ONNX_MODELS.length; i++){
    if(ONNX_MODELS[i].id === mp || ONNX_MODELS[i].path === mp){ found = ONNX_MODELS[i]; break; }
  }
  if(!found){
    return Promise.resolve({ ok: false, modelPath: mp, reason: t("p5.unknownModelPath", "未知模型路径或 ID") });
  }
  /* ONNX Runtime 不可用：返回失败 */
  if(!_onnxAvailable){
    return Promise.resolve({ ok: false, modelPath: mp, reason: t("p5.onnxUnavailable", "ONNX Runtime 不可用（需要 WASM + window.ort），将降级到关键词规则") });
  }
  /* 模拟会话创建 */
  _onnxSession = { modelPath: mp, type: found.type, createdAt: Date.now() };
  _onnxCurrentModel = mp;
  return Promise.resolve({ ok: true, modelPath: mp });
}

/**
 * 文本分类（情感/主题/垃圾信息）
 * ONNX 不可用时降级到关键词规则 fallback
 * @param {string} text - 输入文本
 * @param {string} modelType - 分类类型：sentiment / topic / spam
 * @returns {Promise<{label:string, score:number, source:"onnx"|"rule", reason?:string}>}
 */
function onnxClassify(text, modelType){
  const textStr = String(text || "").trim();
  if(!textStr){
    return Promise.resolve({ label: "neutral", score: 0, source: "rule", reason: t("p5.textEmpty", "text 为空") });
  }
  const mt = String(modelType || "sentiment").trim();
  /* ONNX 可用且已加载：模拟推理 */
  if(onnxAvailable() && _onnxSession){
    return Promise.resolve(_onnxSimulateClassify(textStr, mt));
  }
  /* 降级到关键词规则 */
  return Promise.resolve(_onnxRuleClassify(textStr, mt));
}

/**
 * 模拟 ONNX 分类推理（不实际运行模型）
 */
function _onnxSimulateClassify(text, modelType){
  /* 用简单规则模拟模型输出，但标记 source 为 onnx */
  const rule = _onnxRuleClassify(text, modelType);
  return { label: rule.label, score: Math.min(1, rule.score + 0.1), source: "onnx" };
}

/**
 * 关键词规则分类 fallback
 * @param {string} text
 * @param {string} modelType
 * @returns {{label:string, score:number, source:"rule"}}
 */
function _onnxRuleClassify(text, modelType){
  const textStr = String(text || "").toLowerCase();
  if(modelType === "sentiment"){
    /* 情感分析：正/负/中性 */
    const posWords = ["好", "棒", "优秀", "喜欢", "满意", "good", "great", "excellent", "happy", "love", "nice", "wonderful"];
    const negWords = ["坏", "差", "糟糕", "讨厌", "不满", "bad", "terrible", "awful", "hate", "horrible", "worst", "sad"];
    let pos = 0, neg = 0;
    for(let i = 0; i < posWords.length; i++){ if(textStr.indexOf(posWords[i]) >= 0) pos++; }
    for(let j = 0; j < negWords.length; j++){ if(textStr.indexOf(negWords[j]) >= 0) neg++; }
    if(pos > neg) return { label: "positive", score: Math.min(1, 0.5 + 0.1 * pos), source: "rule" };
    if(neg > pos) return { label: "negative", score: Math.min(1, 0.5 + 0.1 * neg), source: "rule" };
    return { label: "neutral", score: 0.5, source: "rule" };
  }
  if(modelType === "topic"){
    /* 主题分类：科技/财经/体育/娱乐 */
    if(/科技|技术|ai|编程|代码|software|tech|computer/.test(textStr))  return { label: "tech",      score: 0.8, source: "rule" };
    if(/财经|股票|投资|金融|经济|stock|finance|market/.test(textStr))   return { label: "finance",   score: 0.8, source: "rule" };
    if(/体育|足球|篮球|比赛|运动|sport|football|basketball/.test(textStr)) return { label: "sport",   score: 0.8, source: "rule" };
    if(/娱乐|电影|音乐|明星|游戏|entertainment|movie|music|game/.test(textStr)) return { label: "entertainment", score: 0.8, source: "rule" };
    return { label: "other", score: 0.3, source: "rule" };
  }
  if(modelType === "spam"){
    /* 垃圾信息分类 */
    if(/免费|中奖|click|free|winner|prize|urgent|立即|限时/.test(textStr)) return { label: "spam",    score: 0.85, source: "rule" };
    return { label: "ham", score: 0.8, source: "rule" };
  }
  /* 未知类型：返回 neutral */
  return { label: "neutral", score: 0.3, source: "rule", reason: t("p5.unknownModelType", "未知 modelType: ") + modelType };
}

/**
 * 命名实体识别（NER）
 * ONNX 不可用时降级到规则匹配
 * @param {string} text - 输入文本
 * @returns {Promise<Array<{entity:string, type:string, start:number, end:number}>>}
 */
function onnxNER(text){
  const t = String(text || "");
  if(!t.trim()){
    return Promise.resolve([]);
  }
  /* ONNX 可用且已加载：模拟 NER */
  if(onnxAvailable() && _onnxSession){
    return Promise.resolve(_onnxSimulateNER(t));
  }
  /* 降级到规则匹配 */
  return Promise.resolve(_onnxRuleNER(t));
}

/**
 * 模拟 ONNX NER（基于规则但标记为 onnx）
 */
function _onnxSimulateNER(text){
  return _onnxRuleNER(text);
}

/**
 * 规则 NER：识别人名/地名/组织/时间
 * 简单规则：识别常见模式
 * @param {string} text
 * @returns {Array<{entity:string, type:string, start:number, end:number}>}
 */
function _onnxRuleNER(text){
  const result = [];
  /* 人名：张三/李四/王五等常见示例名 */
  const personRe = /([张王李赵刘陈杨黄周吴徐孙马朱胡郭林何高罗郑][一-龥]{1,2})/g;
  let m;
  while((m = personRe.exec(text)) !== null){
    result.push({ entity: m[1], type: "PERSON", start: m.index, end: m.index + m[1].length });
  }
  /* 地名：北京/上海/广州/深圳/杭州等 */
  const placeRe = /(北京|上海|广州|深圳|杭州|南京|成都|武汉|西安|重庆|天津|苏州|长沙|青岛|大连|厦门)/g;
  while((m = placeRe.exec(text)) !== null){
    result.push({ entity: m[1], type: "LOCATION", start: m.index, end: m.index + m[1].length });
  }
  /* 组织：公司/集团/大学/部门 */
  const orgRe = /([一-龥]{2,8}(公司|集团|大学|学院|部门|研究院|研究所))/g;
  while((m = orgRe.exec(text)) !== null){
    result.push({ entity: m[1], type: "ORGANIZATION", start: m.index, end: m.index + m[1].length });
  }
  /* 时间：YYYY-MM-DD 或 YYYY年MM月DD日 */
  const timeRe = /(\d{4}[-/年]\d{1,2}[-/月]\d{1,2}日?)/g;
  while((m = timeRe.exec(text)) !== null){
    result.push({ entity: m[1], type: "TIME", start: m.index, end: m.index + m[1].length });
  }
  return result;
}

/* ============================================================
 * 3. 模型缓存管理
 * ============================================================ */

/**
 * 缓存模型文件到 IndexedDB（带元数据）
 * IDB 不可用时降级到内存 Map
 * @param {string} modelId - 模型 ID
 * @param {Blob|ArrayBuffer|string} blob - 模型数据
 * @param {{version?:string, size?:number}} [meta] - 额外元数据
 * @returns {Promise<{ok:boolean, modelId:string, storage:"idb"|"memory", reason?:string}>}
 */
function cacheModel(modelId, blob, meta){
  const mid = String(modelId || "").trim();
  if(!mid){
    return Promise.resolve({ ok: false, modelId: "", storage: "memory", reason: t("p5.modelIdEmpty", "modelId 为空") });
  }
  if(blob === undefined || blob === null){
    return Promise.resolve({ ok: false, modelId: mid, storage: "memory", reason: t("p5.blobEmpty", "blob 为空") });
  }
  meta = meta || {};
  /* 估算大小 */
  const size = meta.size || _estimateBlobSize(blob);
  const record = {
    modelId: mid,
    version: meta.version || "1.0.0",
    size: size,
    blob: blob,
    cachedAt: Date.now(),
    lastUsed: Date.now()
  };
  /* IDB 可用：走 idbPutModel */
  try{
    if(typeof isIDBAvailable === "function" && isIDBAvailable() && typeof idbPutModel === "function"){
      return idbPutModel(mid, record).then(function(ret){
        if(ret === undefined){
          /* IDB 写入失败 → 降级内存 */
          _modelCacheFallback.set(mid, record);
          return { ok: true, modelId: mid, storage: "memory", reason: t("p5.idbWriteFail", "idb 写入失败，降级内存") };
        }
        return { ok: true, modelId: mid, storage: "idb" };
      }).catch(function(){
        _modelCacheFallback.set(mid, record);
        return { ok: true, modelId: mid, storage: "memory", reason: t("p5.idbException", "idb 异常，降级内存") };
      });
    }
  }catch(e){ /* fall through to memory */ }
  /* IDB 不可用：内存降级 */
  _modelCacheFallback.set(mid, record);
  return Promise.resolve({ ok: true, modelId: mid, storage: "memory" });
}

/**
 * 估算 blob 大小（字节）
 */
function _estimateBlobSize(blob){
  try{
    if(blob === null || blob === undefined) return 0;
    if(typeof Blob !== "undefined" && blob instanceof Blob) return blob.size;
    if(typeof ArrayBuffer !== "undefined" && blob instanceof ArrayBuffer) return blob.byteLength;
    if(typeof blob === "string") return blob.length;
    if(blob && typeof blob === "object" && typeof blob.byteLength === "number") return blob.byteLength;
    return JSON.stringify(blob).length;
  }catch(e){ return 0; }
}

/**
 * 从 IndexedDB 获取缓存的模型
 * @param {string} modelId
 * @returns {Promise<{modelId:string, version:string, size:number, blob:*, cachedAt:number, lastUsed:number}|null>}
 */
function getCachedModel(modelId){
  const mid = String(modelId || "").trim();
  if(!mid) return Promise.resolve(null);
  /* 先查内存降级（可能 IDB 不可用） */
  if(_modelCacheFallback.has(mid)){
    const rec = _modelCacheFallback.get(mid);
    rec.lastUsed = Date.now();
    _modelCacheFallback.set(mid, rec);
    return Promise.resolve(_cloneRecord(rec));
  }
  /* 再查 IDB */
  try{
    if(typeof isIDBAvailable === "function" && isIDBAvailable() && typeof idbGetModel === "function"){
      return idbGetModel(mid).then(function(v){
        if(v === undefined || v === null) return null;
        /* 更新 lastUsed（best-effort，不阻塞读） */
        try{
          v.lastUsed = Date.now();
          if(typeof idbPutModel === "function") idbPutModel(mid, v);
        }catch(e){}
        return _cloneRecord(v);
      });
    }
  }catch(e){}
  return Promise.resolve(null);
}

/**
 * 克隆缓存记录（避免外部修改内部状态）
 */
function _cloneRecord(rec){
  if(!rec || typeof rec !== "object") return null;
  return {
    modelId: rec.modelId,
    version: rec.version,
    size: rec.size,
    blob: rec.blob,
    cachedAt: rec.cachedAt,
    lastUsed: rec.lastUsed
  };
}

/**
 * 删除缓存的模型
 * @param {string} modelId
 * @returns {Promise<{ok:boolean, modelId:string}>}
 */
function removeCachedModel(modelId){
  const mid = String(modelId || "").trim();
  if(!mid) return Promise.resolve({ ok: false, modelId: "" });
  /* 删内存 */
  const memDeleted = _modelCacheFallback.delete(mid);
  /* 删 IDB */
  try{
    if(typeof isIDBAvailable === "function" && isIDBAvailable() && typeof idbDeleteModel === "function"){
      return idbDeleteModel(mid).then(function(){
        return { ok: true, modelId: mid };
      }).catch(function(){
        return { ok: memDeleted, modelId: mid };
      });
    }
  }catch(e){}
  return Promise.resolve({ ok: memDeleted, modelId: mid });
}

/**
 * 列出所有缓存模型及大小
 * @returns {Promise<Array<{modelId:string, version:string, size:number, cachedAt:number, lastUsed:number}>>}
 */
function listCachedModels(){
  /* 收集内存 + IDB */
  const memList = [];
  _modelCacheFallback.forEach(function(rec, key){
    memList.push({
      modelId: rec.modelId || key,
      version: rec.version,
      size: rec.size,
      cachedAt: rec.cachedAt,
      lastUsed: rec.lastUsed
    });
  });
  try{
    if(typeof isIDBAvailable === "function" && isIDBAvailable() && typeof idbListModels === "function"){
      return idbListModels().then(function(idbList){
        const idbArr = (idbList || []).map(function(rec){
          return {
            modelId: rec.modelId,
            version: rec.version,
            size: rec.size,
            cachedAt: rec.cachedAt,
            lastUsed: rec.lastUsed
          };
        });
        /* 合并去重（内存优先） */
        const memIds = {};
        for(let i = 0; i < memList.length; i++) memIds[memList[i].modelId] = true;
        for(let j = 0; j < idbArr.length; j++){
          if(!memIds[idbArr[j].modelId]) memList.push(idbArr[j]);
        }
        return memList;
      }).catch(function(){
        return memList;
      });
    }
  }catch(e){}
  return Promise.resolve(memList);
}

/**
 * 获取总缓存大小（字节）
 * @returns {Promise<number>}
 */
function getCacheSize(){
  return listCachedModels().then(function(list){
    let total = 0;
    for(let i = 0; i < list.length; i++){
      total += (list[i].size || 0);
    }
    return total;
  });
}

/**
 * 清空所有模型缓存
 * @returns {Promise<{ok:boolean, removed:number}>}
 */
function clearModelCache(){
  const memCount = _modelCacheFallback.size;
  _modelCacheFallback.clear();
  try{
    if(typeof isIDBAvailable === "function" && isIDBAvailable() && typeof idbDeleteModel === "function" && typeof idbListModels === "function"){
      return idbListModels().then(function(list){
        const arr = list || [];
        const promises = arr.map(function(rec){
          return idbDeleteModel(rec.modelId).catch(function(){ return null; });
        });
        return Promise.all(promises).then(function(){
          return { ok: true, removed: memCount + arr.length };
        });
      }).catch(function(){
        return { ok: true, removed: memCount };
      });
    }
  }catch(e){}
  return Promise.resolve({ ok: true, removed: memCount });
}

/**
 * 确保模型已加载：先查缓存，没有则下载 + 缓存
 * 由于测试环境无法实际下载，下载函数由调用方提供（downloader）
 * @param {string} modelId
 * @param {{downloader?:Function, version?:string}} [options]
 * @returns {Promise<{ok:boolean, modelId:string, source:"cache"|"download", reason?:string}>}
 */
function ensureModelLoaded(modelId, options){
  const mid = String(modelId || "").trim();
  if(!mid){
    return Promise.resolve({ ok: false, modelId: "", source: "cache", reason: t("p5.modelIdEmpty", "modelId 为空") });
  }
  options = options || {};
  /* 先查缓存 */
  return getCachedModel(mid).then(function(cached){
    if(cached){
      return { ok: true, modelId: mid, source: "cache" };
    }
    /* 缓存未命中：调用 downloader 下载 */
    if(typeof options.downloader !== "function"){
      return { ok: false, modelId: mid, source: "download", reason: t("p5.noDownloader", "未提供 downloader，无法下载模型") };
    }
    try{
      const dlPromise = options.downloader(mid);
      if(!dlPromise || typeof dlPromise.then !== "function"){
        return { ok: false, modelId: mid, source: "download", reason: t("p5.downloaderNoPromise", "downloader 未返回 Promise") };
      }
      return dlPromise.then(function(blob){
        if(blob === undefined || blob === null){
          return { ok: false, modelId: mid, source: "download", reason: t("p5.downloaderEmptyBlob", "downloader 返回空 blob") };
        }
        return cacheModel(mid, blob, { version: options.version }).then(function(){
          return { ok: true, modelId: mid, source: "download" };
        });
      }).catch(function(err){
        return { ok: false, modelId: mid, source: "download", reason: t("p5.downloadFail", "下载失败：") + String(err && err.message || err) };
      });
    }catch(e){
      return { ok: false, modelId: mid, source: "download", reason: t("p5.downloaderException", "downloader 异常：") + String(e) };
    }
  });
}

/* ============================================================
 * 4. 隐私优先架构
 * ============================================================ */

/* 默认敏感字段名（小写匹配） */
const _DEFAULT_SENSITIVE_FIELDS = [
  "password", "passwd", "pwd",
  "apikey", "api_key", "secret", "token", "accesstoken", "access_token",
  "refreshtoken", "refresh_token",
  "email", "phone", "mobile", "idcard", "ssn",
  "creditcard", "credit_card", "cvv",
  "address", "birthdate", "birthday"
];

/* 默认隐私策略 */
const _DEFAULT_PRIVACY_POLICY = {
  /* 敏感字段名列表（小写） */
  sensitiveFields: _DEFAULT_SENSITIVE_FIELDS.slice(),
  /* 字段名 → 隐私级别映射（高隐私字段强制本地处理） */
  fieldLevels: {
    password: PRIVACY_LEVELS.RESTRICTED,
    passwd: PRIVACY_LEVELS.RESTRICTED,
    pwd: PRIVACY_LEVELS.RESTRICTED,
    apikey: PRIVACY_LEVELS.RESTRICTED,
    api_key: PRIVACY_LEVELS.RESTRICTED,
    secret: PRIVACY_LEVELS.RESTRICTED,
    token: PRIVACY_LEVELS.RESTRICTED,
    accesstoken: PRIVACY_LEVELS.RESTRICTED,
    access_token: PRIVACY_LEVELS.RESTRICTED,
    refreshtoken: PRIVACY_LEVELS.RESTRICTED,
    refresh_token: PRIVACY_LEVELS.RESTRICTED,
    idcard: PRIVACY_LEVELS.RESTRICTED,
    ssn: PRIVACY_LEVELS.RESTRICTED,
    creditcard: PRIVACY_LEVELS.RESTRICTED,
    credit_card: PRIVACY_LEVELS.RESTRICTED,
    cvv: PRIVACY_LEVELS.RESTRICTED,
    email: PRIVACY_LEVELS.CONFIDENTIAL,
    phone: PRIVACY_LEVELS.CONFIDENTIAL,
    mobile: PRIVACY_LEVELS.CONFIDENTIAL,
    address: PRIVACY_LEVELS.CONFIDENTIAL,
    birthdate: PRIVACY_LEVELS.CONFIDENTIAL,
    birthday: PRIVACY_LEVELS.CONFIDENTIAL
  },
  /* 操作 → 最低隐私级别（高于此级别的数据必须本地处理） */
  operationMinLevels: {
    "cloud.ai": PRIVACY_LEVELS.INTERNAL,
    "cloud.sync": PRIVACY_LEVELS.INTERNAL,
    "cloud.backup": PRIVACY_LEVELS.INTERNAL,
    "cloud.share": PRIVACY_LEVELS.CONFIDENTIAL
  },
  /* 是否启用本地处理降级 */
  localFallbackEnabled: true
};

/**
 * 获取当前隐私策略（带缓存，从 localStorage 读取）
 * @returns {Object} 隐私策略对象
 */
function getPrivacyPolicy(){
  if(_privacyPolicy) return _privacyPolicy;
  try{
    const raw = localStorage.getItem(PRIVACY_POLICY_KEY);
    if(raw){
      _privacyPolicy = JSON.parse(raw);
      /* 合并默认值（避免旧版策略缺字段） */
      _privacyPolicy = _mergePolicy(_DEFAULT_PRIVACY_POLICY, _privacyPolicy);
      return _privacyPolicy;
    }
  }catch(e){}
  _privacyPolicy = _clonePolicy(_DEFAULT_PRIVACY_POLICY);
  return _privacyPolicy;
}

/**
 * 设置隐私策略并持久化到 localStorage
 * @param {Object} policy - 隐私策略
 * @returns {{ok:boolean, reason?:string}}
 */
function setPrivacyPolicy(policy){
  if(!policy || typeof policy !== "object"){
    return { ok: false, reason: t("p5.policyMustBeObject", "policy 必须是对象") };
  }
  try{
    /* 校验：sensitiveFields 必须是数组（若提供） */
    if("sensitiveFields" in policy && !Array.isArray(policy.sensitiveFields)){
      return { ok: false, reason: t("p5.sensitiveFieldsMustBeArray", "sensitiveFields 必须是数组") };
    }
    /* 校验：fieldLevels 必须是对象（若提供） */
    if("fieldLevels" in policy && (!policy.fieldLevels || typeof policy.fieldLevels !== "object" || Array.isArray(policy.fieldLevels))){
      return { ok: false, reason: t("p5.fieldLevelsMustBeObject", "fieldLevels 必须是对象") };
    }
    const merged = _mergePolicy(_DEFAULT_PRIVACY_POLICY, policy);
    _privacyPolicy = merged;
    localStorage.setItem(PRIVACY_POLICY_KEY, JSON.stringify(merged));
    return { ok: true };
  }catch(e){
    return { ok: false, reason: t("p5.persistFail", "持久化失败：") + String(e && e.message || e) };
  }
}

/**
 * 克隆隐私策略
 */
function _clonePolicy(p){
  return {
    sensitiveFields: (p.sensitiveFields || []).slice(),
    fieldLevels: Object.assign({}, p.fieldLevels || {}),
    operationMinLevels: Object.assign({}, p.operationMinLevels || {}),
    localFallbackEnabled: p.localFallbackEnabled !== false
  };
}

/**
 * 合并隐私策略（base 为默认值，override 覆盖）
 */
function _mergePolicy(base, override){
  return {
    sensitiveFields: Array.isArray(override.sensitiveFields) ? override.sensitiveFields.slice() : base.sensitiveFields.slice(),
    fieldLevels: Object.assign({}, base.fieldLevels, override.fieldLevels || {}),
    operationMinLevels: Object.assign({}, base.operationMinLevels, override.operationMinLevels || {}),
    localFallbackEnabled: (typeof override.localFallbackEnabled === "boolean") ? override.localFallbackEnabled : base.localFallbackEnabled
  };
}

/**
 * 判断字段名是否为敏感字段
 * @param {string} fieldName
 * @returns {boolean}
 */
function _isSensitiveField(fieldName){
  const fn = String(fieldName || "").toLowerCase();
  const policy = getPrivacyPolicy();
  const fields = policy.sensitiveFields || [];
  for(let i = 0; i < fields.length; i++){
    if(String(fields[i]).toLowerCase() === fn) return true;
  }
  return false;
}

/**
 * 获取字段的隐私级别
 * @param {string} fieldName
 * @returns {string} 隐私级别（PRIVACY_LEVELS 之一），未知字段返回 PUBLIC
 */
function _getFieldLevel(fieldName){
  const fn = String(fieldName || "").toLowerCase();
  const policy = getPrivacyPolicy();
  const levels = policy.fieldLevels || {};
  if(levels[fn]) return levels[fn];
  /* 字段名包含敏感关键词时升级 */
  if(_isSensitiveField(fieldName)) return PRIVACY_LEVELS.CONFIDENTIAL;
  return PRIVACY_LEVELS.PUBLIC;
}

/**
 * 标记敏感字段
 * 给数据对象打上 __sensitiveFields 标记，不修改原值
 * @param {Object} data - 数据对象
 * @param {string[]} fields - 敏感字段名列表
 * @returns {Object} 带标记的新对象（不修改原对象）
 */
function markSensitive(data, fields){
  if(data === null || data === undefined || typeof data !== "object"){
    return data;
  }
  const fieldArr = Array.isArray(fields) ? fields.slice() : [];
  const copy = Array.isArray(data) ? data.slice() : Object.assign({}, data);
  /* 标记敏感字段元数据 */
  if(!Array.isArray(copy)){
    Object.defineProperty(copy, "__sensitiveFields", {
      value: fieldArr.map(function(f){ return String(f).toLowerCase(); }),
      enumerable: false,
      writable: true,
      configurable: true
    });
  }
  return copy;
}

/**
 * 过滤敏感数据，不发送到云端
 * 深度遍历对象，删除敏感字段（递归）
 * @param {*} data - 输入数据
 * @param {string[]} [sensitiveFields] - 自定义敏感字段列表（不传则用策略）
 * @returns {*} 过滤后的新对象（不修改原对象）
 */
function sanitizeForCloud(data, sensitiveFields){
  if(data === null || data === undefined) return data;
  /* 基础类型直接返回 */
  const t = typeof data;
  if(t === "string" || t === "number" || t === "boolean") return data;
  /* 函数不发送 */
  if(t === "function") return undefined;
  /* 自定义敏感字段列表 */
  if(Array.isArray(sensitiveFields) && sensitiveFields.length){
    const customPolicy = _mergePolicy(_DEFAULT_PRIVACY_POLICY, { sensitiveFields: sensitiveFields });
    return _sanitizeWithPolicy(data, customPolicy);
  }
  return _sanitizeWithPolicy(data, getPrivacyPolicy());
}

/**
 * 用指定策略过滤数据
 */
function _sanitizeWithPolicy(data, policy){
  if(data === null || data === undefined) return data;
  const t = typeof data;
  if(t === "string" || t === "number" || t === "boolean") return data;
  if(t === "function") return undefined;
  /* 数组：递归过滤每个元素 */
  if(Array.isArray(data)){
    return data.map(function(item){ return _sanitizeWithPolicy(item, policy); });
  }
  /* 对象：删除敏感字段 */
  const result = {};
  const keys = Object.keys(data);
  for(let i = 0; i < keys.length; i++){
    const k = keys[i];
    /* 跳过内部元数据字段 */
    if(k === "__sensitiveFields") continue;
    if(_isSensitiveFieldWithPolicy(k, policy)){
      /* 敏感字段：替换为 [REDACTED] 占位 */
      result[k] = "[REDACTED]";
    } else {
      result[k] = _sanitizeWithPolicy(data[k], policy);
    }
  }
  return result;
}

/**
 * 用指定策略判断字段是否敏感
 */
function _isSensitiveFieldWithPolicy(fieldName, policy){
  const fn = String(fieldName || "").toLowerCase();
  const fields = policy.sensitiveFields || [];
  for(let i = 0; i < fields.length; i++){
    if(String(fields[i]).toLowerCase() === fn) return true;
  }
  return false;
}

/**
 * 判断是否应该本地处理（高隐私数据不发送云端）
 * @param {*} data - 数据
 * @param {string} privacyLevel - 隐私级别（PRIVACY_LEVELS 之一）
 * @returns {boolean} true 表示应该本地处理
 */
function shouldProcessLocally(data, privacyLevel){
  /* 显式指定级别：高于 INTERNAL 的都本地处理 */
  const level = String(privacyLevel || PRIVACY_LEVELS.PUBLIC).toLowerCase();
  if(level === PRIVACY_LEVELS.RESTRICTED || level === PRIVACY_LEVELS.CONFIDENTIAL){
    return true;
  }
  /* 数据本身含敏感字段：本地处理 */
  if(data && typeof data === "object"){
    const keys = Object.keys(data);
    for(let i = 0; i < keys.length; i++){
      if(_isSensitiveField(keys[i])){
        const fieldLevel = _getFieldLevel(keys[i]);
        if(fieldLevel === PRIVACY_LEVELS.RESTRICTED || fieldLevel === PRIVACY_LEVELS.CONFIDENTIAL){
          return true;
        }
      }
    }
  }
  /* 数据带 __sensitiveFields 标记：本地处理 */
  if(data && typeof data === "object" && data.__sensitiveFields && data.__sensitiveFields.length){
    return true;
  }
  return false;
}

/**
 * 审计数据流：记录数据发送到哪，是否含敏感信息
 * @param {*} data - 发送的数据
 * @param {string} destination - 目的地（如 "cloud.ai" / "cloud.sync" / "local.idb"）
 * @returns {{ok:boolean, hasSensitive:boolean, destination:string, timestamp:number, summary:string}}
 */
function auditDataFlow(data, destination){
  const dest = String(destination || "unknown");
  let hasSensitive = false;
  let sensitiveFields = [];
  /* 检测数据中是否含敏感字段（值为 [REDACTED] 占位表示已过滤，不算泄露） */
  if(data && typeof data === "object"){
    const keys = Object.keys(data);
    for(let i = 0; i < keys.length; i++){
      if(_isSensitiveField(keys[i])){
        /* 已被 [REDACTED] 占位的字段不算敏感泄露 */
        if(data[keys[i]] === "[REDACTED]") continue;
        hasSensitive = true;
        sensitiveFields.push(keys[i]);
      }
    }
  }
  /* 检测 __sensitiveFields 标记 */
  if(data && typeof data === "object" && Array.isArray(data.__sensitiveFields) && data.__sensitiveFields.length){
    hasSensitive = true;
    sensitiveFields = sensitiveFields.concat(data.__sensitiveFields);
  }
  const entry = {
    timestamp: Date.now(),
    destination: dest,
    hasSensitive: hasSensitive,
    sensitiveFields: sensitiveFields,
    dataSize: _estimateBlobSize(data)
  };
  /* 写入审计日志（最多保留 _DATA_FLOW_AUDIT_MAX 条） */
  _dataFlowAuditLog.push(entry);
  if(_dataFlowAuditLog.length > _DATA_FLOW_AUDIT_MAX){
    _dataFlowAuditLog = _dataFlowAuditLog.slice(-_DATA_FLOW_AUDIT_MAX);
  }
  const summary = t("p5.dataFlowAudit", "数据流审计 → ") + dest + t("p5.colonZh", "：") + (hasSensitive ? t("p5.sensitiveFieldsPrefix", "含敏感字段 [") + sensitiveFields.join(",") + t("p5.rightBracket", "]") : t("p5.noSensitiveFields", "无敏感字段")) + t("p5.sizeMid", "，大小 ") + entry.dataSize + t("p5.bytesSuffix", " 字节");
  return { ok: true, hasSensitive: hasSensitive, destination: dest, timestamp: entry.timestamp, summary: summary };
}

/**
 * 获取数据流审计日志（导出辅助函数，便于测试与 UI 展示）
 * @returns {Array}
 */
function getDataFlowAuditLog(){
  return _dataFlowAuditLog.slice();
}

/**
 * 清空数据流审计日志
 * @returns {void}
 */
function clearDataFlowAuditLog(){
  _dataFlowAuditLog = [];
}

/**
 * 重置离线 AI 模块状态（测试用）
 * @returns {void}
 */
function _resetOfflineAI(){
  _webllmEngine = null;
  _webllmCurrentModel = null;
  _webllmLoadProgress = 0;
  _webllmLoading = false;
  _onnxSession = null;
  _onnxCurrentModel = null;
  _modelCacheFallback = new Map();
  _privacyPolicy = null;
  _dataFlowAuditLog = [];
}// ===== ML Behavior Prediction (v1.7-C ML行为预测 + 生产力评分 + 习惯养成 + 推荐引擎) =====
/* ============================================================
 * v1.7-C 高级分析与预测 · ML 行为预测模块
 * ------------------------------------------------------------
 *  本模块提供 4 大能力：
 *   1) ML 行为预测：基于历史数据预测用户行为
 *      - predictCompletionRate(task, historicalData)  预测任务完成概率
 *      - predictBestWorkHour(historicalData)          预测最佳工作时段 top3
 *      - predictFocusTrend(historicalData, days)      预测专注度趋势（指数平滑）
 *      - exponentialSmoothing(data, alpha)            指数平滑
 *      - linearRegression(x, y)                       简单线性回归 y = a*x + b
 *      - movingAverage(data, window)                  移动平均
 *      - detectAnomaly(value, mean, stdDev)           Z-score 异常检测
 *      - computeStats(data)                           均值/标准差/最小/最大
 *   2) 生产力评分：综合评分体系
 *      - calcProductivityScore(tasks, records, habits) 综合评分 0-100
 *      - focusScore(records)        专注度评分（基于笃行/时间追踪）
 *      - habitScore(habits)         习惯连续性评分（基于 streak 长度）
 *      - efficiencyScore(tasks, records) 效率评分（实际 vs 预估耗时）
 *   3) 习惯养成模型：21 天/66 天曲线拟合
 *      - habitModel(days, completed)        习惯养成曲线拟合
 *      - habitPrediction(history, targetDay) 预测第 N 天完成概率
 *      - habitStage(day)                    习惯阶段（建立/巩固/稳定/维持）
 *   4) 个性化推荐引擎：协同过滤 + 内容推荐
 *      - recommend(userHistory, allTasks, topK)        个性化推荐主入口
 *      - collaborativeFilter(userId, userTaskMatrix)  协同过滤
 *      - contentBasedRecommend(task, userHistory)      基于内容推荐
 *      - hybridRecommend(userHistory, allTasks, topK)  混合推荐
 *
 *  设计约定：
 *   - 使用 var 声明模块级私有状态（55 > 31，避免 TDZ）
 *   - 所有导出函数均为 function 声明（提升），可在 31 中直接引用
 *   - ML 用简单统计方法（指数平滑/线性回归/Z-score），不依赖外部 ML 库
 *   - 推荐引擎用简单协同过滤 + 内容匹配，不依赖外部推荐系统
 *   - 输入容错：空数据/非法数据返回安全默认值
 *   - calcStreak / getTasks / getRec 等在更早模块定义（< 55），可直接引用
 * ============================================================ */

/* ---------- 模块级常量 ---------- */
const HABIT_PHASES = {
  FORMATION: "formation",       // 1-7 天 建立期
  CONSOLIDATION: "consolidation", // 8-21 天 巩固期
  STABILIZATION: "stabilization", // 22-66 天 稳定期
  MAINTENANCE: "maintenance"    // 67+ 天 维持期
};

/* 习惯养成曲线参数（基于 21/66 天模型的经验拟合） */
const HABIT_K_FORMATION = 0.25;   // 建立期衰减系数
const HABIT_K_CONSOLIDATION = 0.08; // 巩固期衰减系数
const HABIT_K_STABILIZATION = 0.03; // 稳定期衰减系数

/* ---------- 基础统计函数 ---------- */

/**
 * 计算数据集的统计量：均值/标准差/最小/最大/计数
 * @param {number[]} data - 数值数组
 * @returns {{mean:number,stdDev:number,min:number,max:number,count:number,sum:number}}
 */
function computeStats(data){
  if(!Array.isArray(data) || data.length === 0){
    return { mean: 0, stdDev: 0, min: 0, max: 0, count: 0, sum: 0 };
  }
  const n = data.length;
  let sum = 0, min = data[0], max = data[0];
  for(let i = 0; i < n; i++){
    const v = Number(data[i]) || 0;
    sum += v;
    if(v < min) min = v;
    if(v > max) max = v;
  }
  const mean = sum / n;
  let sqSum = 0;
  for(let j = 0; j < n; j++){
    const d = (Number(data[j]) || 0) - mean;
    sqSum += d * d;
  }
  const stdDev = Math.sqrt(sqSum / n);
  return { mean: mean, stdDev: stdDev, min: min, max: max, count: n, sum: sum };
}

/**
 * 指数平滑：s_t = alpha * x_t + (1-alpha) * s_{t-1}
 * @param {number[]} data - 输入序列
 * @param {number} alpha - 平滑系数 0-1，默认 0.3
 * @returns {number[]} 平滑后的序列（与输入等长）
 */
function exponentialSmoothing(data, alpha){
  if(typeof alpha !== "number" || alpha <= 0 || alpha > 1) alpha = 0.3;
  if(!Array.isArray(data) || data.length === 0) return [];
  const out = [];
  let prev = Number(data[0]) || 0;
  out.push(prev);
  for(let i = 1; i < data.length; i++){
    const x = Number(data[i]) || 0;
    prev = alpha * x + (1 - alpha) * prev;
    out.push(prev);
  }
  return out;
}

/**
 * 简单线性回归：y = a*x + b
 * @param {number[]} x - 自变量
 * @param {number[]} y - 因变量
 * @returns {{a:number,b:number,r2:number}} 斜率/截距/决定系数
 */
function linearRegression(x, y){
  if(!Array.isArray(x) || !Array.isArray(y) || x.length === 0 || x.length !== y.length){
    return { a: 0, b: 0, r2: 0 };
  }
  const n = x.length;
  if(n === 1) return { a: 0, b: Number(y[0]) || 0, r2: 0 };
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
  for(let i = 0; i < n; i++){
    const xi = Number(x[i]) || 0;
    const yi = Number(y[i]) || 0;
    sumX += xi; sumY += yi;
    sumXY += xi * yi;
    sumX2 += xi * xi;
    sumY2 += yi * yi;
  }
  const denom = n * sumX2 - sumX * sumX;
  if(Math.abs(denom) < 1e-12) return { a: 0, b: sumY / n, r2: 0 };
  const a = (n * sumXY - sumX * sumY) / denom;
  const b = (sumY - a * sumX) / n;
  /* 决定系数 R^2 */
  const meanY = sumY / n;
  const ssTot = sumY2 - n * meanY * meanY;
  let ssRes = 0;
  for(let j = 0; j < n; j++){
    const yj = Number(y[j]) || 0;
    const xj = Number(x[j]) || 0;
    const r = yj - (a * xj + b);
    ssRes += r * r;
  }
  const r2 = Math.abs(ssTot) < 1e-12 ? 0 : 1 - ssRes / ssTot;
  return { a: a, b: b, r2: r2 };
}

/**
 * 移动平均：以 window 大小的滑动窗口取均值
 * @param {number[]} data - 输入序列
 * @param {number} window - 窗口大小，默认 3
 * @returns {number[]} 移动平均序列（长度 = data.length - window + 1）
 */
function movingAverage(data, window){
  if(!Array.isArray(data) || data.length === 0) return [];
  if(typeof window !== "number" || window < 1) window = 3;
  if(window > data.length) window = data.length;
  const out = [];
  for(let i = 0; i <= data.length - window; i++){
    let s = 0;
    for(let j = 0; j < window; j++){
      s += Number(data[i + j]) || 0;
    }
    out.push(s / window);
  }
  return out;
}

/**
 * Z-score 异常检测：|Z| > 2 视为异常
 * @param {number} value - 待检测值
 * @param {number} mean - 均值
 * @param {number} stdDev - 标准差
 * @returns {{isAnomaly:boolean, zScore:number}}
 */
function detectAnomaly(value, mean, stdDev){
  const v = Number(value) || 0;
  const m = Number(mean) || 0;
  const sd = Number(stdDev) || 0;
  if(sd < 1e-12) return { isAnomaly: false, zScore: 0 };
  const z = (v - m) / sd;
  return { isAnomaly: Math.abs(z) > 2, zScore: z };
}

/* ---------- ML 行为预测 ---------- */

/**
 * 预测任务完成概率（0-1）
 * 综合考虑：历史类似任务完成率 + 时间因素 + 场景因素
 * @param {Object} task - 任务对象 {scenario, priority, dueDate, est}
 * @param {Array} historicalData - 历史任务数组 [{scenario, priority, completed, hour, est}]
 * @returns {number} 完成概率 0-1
 */
function predictCompletionRate(task, historicalData){
  if(!task || typeof task !== "object") return 0.5;
  if(!Array.isArray(historicalData) || historicalData.length === 0) return 0.5;
  /* 筛选同场景历史任务 */
  const sameScene = historicalData.filter(function(h){
    return h && h.scenario === task.scenario;
  });
  if(sameScene.length === 0) return 0.5;
  /* 基础完成率 */
  const completed = sameScene.filter(function(h){ return h.completed; }).length;
  const baseRate = completed / sameScene.length;
  /* 优先级调整：高优先级完成率略高 */
  const pri = task.priority || "M";
  let priBoost = 0;
  if(pri === "H" || pri === "high" || pri === 2) priBoost = 0.1;
  else if(pri === "L" || pri === "low" || pri === 0) priBoost = -0.05;
  /* 截止日期因素：距离越近完成概率略高（紧迫感） */
  let dueFactor = 0;
  if(task.dueDate){
    const now = new Date();
    const due = new Date(task.dueDate);
    const days = Math.round((due - now) / 86400000);
    if(days >= 0 && days <= 1) dueFactor = 0.05;
    else if(days < 0) dueFactor = -0.1; /* 已过期降低概率 */
  }
  /* 时间因素：上午完成率略高 */
  const hour = new Date().getHours();
  const timeFactor = (hour >= 9 && hour <= 12) ? 0.03 : 0;
  const rate = baseRate + priBoost + dueFactor + timeFactor;
  return Math.max(0, Math.min(1, rate));
}

/**
 * 预测最佳工作时段（top3）
 * 统计每小时完成任务数，返回 top3 时段
 * @param {Array} historicalData - [{completedAt, hour, completed}]
 * @returns {Array<{hour:number, count:number}>} top3 时段
 */
function predictBestWorkHour(historicalData){
  if(!Array.isArray(historicalData) || historicalData.length === 0) return [];
  const hourCount = {};
  for(let i = 0; i < 24; i++) hourCount[i] = 0;
  for(let j = 0; j < historicalData.length; j++){
    const h = historicalData[j];
    if(!h || !h.completed) continue;
    const hr = (typeof h.hour === "number") ? h.hour : (h.completedAt ? new Date(h.completedAt).getHours() : -1);
    if(hr >= 0 && hr < 24) hourCount[hr]++;
  }
  const arr = [];
  for(let k = 0; k < 24; k++) arr.push({ hour: k, count: hourCount[k] });
  arr.sort(function(a, b){ return b.count - a.count; });
  /* 仅返回 count > 0 的 top3 */
  const top3 = arr.filter(function(x){ return x.count > 0; }).slice(0, 3);
  return top3;
}

/**
 * 预测专注度趋势（指数平滑，alpha=0.3）
 * @param {Array} historicalData - [{date, focusScore}] 或 [number]
 * @param {number} days - 预测未来天数，默认 7
 * @returns {{history:number[], predicted:number[], trend:string}}
 */
function predictFocusTrend(historicalData, days){
  if(typeof days !== "number" || days < 1) days = 7;
  if(!Array.isArray(historicalData) || historicalData.length === 0){
    return { history: [], predicted: [], trend: "stable" };
  }
  const series = historicalData.map(function(d){
    if(typeof d === "number") return d;
    return (d && typeof d.focusScore === "number") ? d.focusScore : 0;
  });
  const smoothed = exponentialSmoothing(series, 0.3);
  /* 用最近一段平滑值线性外推 */
  const last = smoothed[smoothed.length - 1] || 0;
  const reg = linearRegression(
    smoothed.map(function(_, i){ return i; }),
    smoothed
  );
  const predicted = [];
  for(let i = 1; i <= days; i++){
    const p = last + reg.a * i;
    predicted.push(Math.max(0, Math.min(100, p)));
  }
  let trend = "stable";
  if(reg.a > 0.5) trend = "up";
  else if(reg.a < -0.5) trend = "down";
  return { history: smoothed, predicted: predicted, trend: trend };
}

/* ---------- 生产力评分 ---------- */

/**
 * 专注度评分（0-100）：基于笃行/时间追踪数据
 * @param {Array} records - [{type, duration, focusCount}]
 * @returns {number} 0-100
 */
function focusScore(records){
  if(!Array.isArray(records) || records.length === 0) return 0;
  let totalFocus = 0, totalDur = 0, focusSessions = 0;
  for(let i = 0; i < records.length; i++){
    const r = records[i];
    if(!r) continue;
    const dur = Number(r.duration) || 0;
    totalDur += dur;
    if(r.type === "focus" || r.type === "pomo" || r.type === "pomodoro"){
      totalFocus += dur;
      focusSessions++;
    }
    if(r.focusCount) focusSessions += Number(r.focusCount) || 0;
  }
  if(totalDur === 0 && focusSessions === 0) return 0;
  /* 焦点时长占比 70% + 焦点会话数 30% */
  const ratio = totalDur > 0 ? totalFocus / totalDur : 0;
  const sessionScore = Math.min(100, focusSessions * 10);
  return Math.round(ratio * 70 + sessionScore * 0.3);
}

/**
 * 习惯连续性评分（0-100）：基于 streak 长度
 * @param {Array} habits - [{streak, target, name}]
 * @returns {number} 0-100
 */
function habitScore(habits){
  if(!Array.isArray(habits) || habits.length === 0) return 0;
  let total = 0, maxStreak = 0;
  for(let i = 0; i < habits.length; i++){
    const h = habits[i];
    if(!h) continue;
    const s = Number(h.streak) || 0;
    total += s;
    if(s > maxStreak) maxStreak = s;
  }
  /* 平均 streak 占 60% + 最大 streak 占 40%，归一化到 100 */
  const avg = total / habits.length;
  const avgScore = Math.min(100, avg * 5);     /* 20 天平均 -> 100 */
  const maxScore = Math.min(100, maxStreak * 1.5); /* 66 天最大 -> 99 */
  return Math.round(avgScore * 0.6 + maxScore * 0.4);
}

/**
 * 效率评分（0-100）：完成任务平均耗时 vs 预估耗时
 * @param {Array} tasks - [{est, actual, completed}]
 * @param {Array} records - [{taskId, duration}]
 * @returns {number} 0-100
 */
function efficiencyScore(tasks, records){
  if(!Array.isArray(tasks) || tasks.length === 0) return 0;
  const ratios = [];
  for(let i = 0; i < tasks.length; i++){
    const t = tasks[i];
    if(!t || !t.completed) continue;
    const est = Number(t.est) || 0;
    let actual = Number(t.actual) || 0;
    /* 若 actual 缺失，从 records 汇总 */
    if(!actual && Array.isArray(records)){
      let sum = 0;
      for(let j = 0; j < records.length; j++){
        if(records[j] && records[j].taskId === t.id){
          sum += Number(records[j].duration) || 0;
        }
      }
      actual = sum;
    }
    if(est > 0 && actual > 0){
      /* ratio = est / actual：>1 表示比预估快（高效），<1 表示慢 */
      ratios.push(est / actual);
    }
  }
  if(ratios.length === 0) return 0;
  let sumR = 0;
  for(let k = 0; k < ratios.length; k++) sumR += ratios[k];
  const avgR = sumR / ratios.length;
  /* ratio=1 -> 100, ratio=0.5 -> 50, ratio>=1.2 -> 100 */
  const score = Math.min(100, avgR * 100);
  return Math.round(score);
}

/**
 * 综合生产力评分（0-100）
 * 完成率(30%) + 专注度(25%) + 习惯连续性(25%) + 效率(20%)
 * @param {Array} tasks - 任务数组
 * @param {Array} records - 记录数组
 * @param {Array} habits - 习惯数组
 * @returns {{total:number, completionRate:number, focus:number, habit:number, efficiency:number}}
 */
function calcProductivityScore(tasks, records, habits){
  tasks = Array.isArray(tasks) ? tasks : [];
  records = Array.isArray(records) ? records : [];
  habits = Array.isArray(habits) ? habits : [];
  /* 完成率 */
  let completionRate = 0;
  if(tasks.length > 0){
    const done = tasks.filter(function(t){ return t && t.completed; }).length;
    completionRate = Math.round((done / tasks.length) * 100);
  }
  const focus = focusScore(records);
  const habit = habitScore(habits);
  const eff = efficiencyScore(tasks, records);
  const total = Math.round(
    completionRate * 0.3 + focus * 0.25 + habit * 0.25 + eff * 0.2
  );
  return {
    total: total,
    completionRate: completionRate,
    focus: focus,
    habit: habit,
    efficiency: eff
  };
}

/* ---------- 习惯养成模型 ---------- */

/**
 * 习惯养成阶段
 * 1-7 天: 建立期（formation）
 * 8-21 天: 巩固期（consolidation）
 * 22-66 天: 稳定期（stabilization）
 * 67+ 天: 维持期（maintenance）
 * @param {number} day - 第几天
 * @returns {{stage:string, label:string, progress:number}}
 */
function habitStage(day){
  const d = Math.max(0, Math.floor(Number(day) || 0));
  if(d <= 7){
    return { stage: HABIT_PHASES.FORMATION, label: t("p5.habitFormation", "建立期"), progress: d / 7 };
  }
  if(d <= 21){
    return { stage: HABIT_PHASES.CONSOLIDATION, label: t("p5.habitConsolidation", "巩固期"), progress: (d - 7) / 14 };
  }
  if(d <= 66){
    return { stage: HABIT_PHASES.STABILIZATION, label: t("p5.habitStabilization", "稳定期"), progress: (d - 21) / 45 };
  }
  return { stage: HABIT_PHASES.MAINTENANCE, label: t("p5.habitMaintenance", "维持期"), progress: 1 };
}

/**
 * 习惯养成曲线拟合（21 天/66 天模型）
 * 基于衰减指数模型：P(d) = 1 - k * exp(-k_phase * d)
 * @param {number} days - 总天数
 * @param {number} completed - 已完成天数
 * @returns {{probability:number, stage:string, curvePoint:number}}
 */
function habitModel(days, completed){
  const d = Math.max(0, Math.floor(Number(days) || 0));
  let c = Math.max(0, Math.floor(Number(completed) || 0));
  if(d === 0) return { probability: 0, stage: HABIT_PHASES.FORMATION, curvePoint: 0 };
  if(c > d) c = d;
  /* 实际完成率 */
  const actualRate = c / d;
  /* 理论曲线点：根据阶段使用不同衰减系数 */
  const stage = habitStage(d);
  let k;
  if(d <= 7) k = HABIT_K_FORMATION;
  else if(d <= 21) k = HABIT_K_CONSOLIDATION;
  else if(d <= 66) k = HABIT_K_STABILIZATION;
  else k = HABIT_K_STABILIZATION / 2;
  /* 理论概率：随天数增长趋向 1 */
  const theoretical = 1 - Math.exp(-k * d);
  /* 综合概率：实际完成率 70% + 理论曲线 30% */
  const probability = actualRate * 0.7 + theoretical * 0.3;
  return {
    probability: Math.max(0, Math.min(1, probability)),
    stage: stage.stage,
    curvePoint: theoretical
  };
}

/**
 * 预测第 N 天的完成概率
 * 基于历史完成数据 + 习惯曲线外推
 * @param {Array} history - [{day, completed}] 或 [0/1]
 * @param {number} targetDay - 预测第几天
 * @returns {number} 0-1
 */
function habitPrediction(history, targetDay){
  const t = Math.max(1, Math.floor(Number(targetDay) || 1));
  if(!Array.isArray(history) || history.length === 0){
    /* 无历史时用纯理论曲线 */
    const k0 = t <= 7 ? HABIT_K_FORMATION : (t <= 21 ? HABIT_K_CONSOLIDATION : HABIT_K_STABILIZATION);
    return Math.max(0, Math.min(1, 1 - Math.exp(-k0 * t)));
  }
  /* 解析历史为 {day, completed} */
  const parsed = history.map(function(h, i){
    if(typeof h === "number") return { day: i + 1, completed: h === 1 };
    if(h && typeof h === "object") return { day: h.day || (i + 1), completed: !!h.completed };
    return { day: i + 1, completed: false };
  });
  const totalDays = parsed.length;
  const doneDays = parsed.filter(function(p){ return p.completed; }).length;
  /* 用 habitModel 拟合当前状态 */
  const model = habitModel(totalDays, doneDays);
  /* 趋势外推：若历史完成率 > 0.6，预测概率略增；否则略减 */
  const trend = doneDays / totalDays;
  const k = t <= 7 ? HABIT_K_FORMATION : (t <= 21 ? HABIT_K_CONSOLIDATION : HABIT_K_STABILIZATION);
  const theoretical = 1 - Math.exp(-k * t);
  /* 综合：实际趋势 60% + 理论曲线 40% */
  let prob = trend * 0.6 + theoretical * 0.4;
  /* 若目标天 > 历史天数，且当前趋势好，则提升 */
  if(t > totalDays && trend > 0.6) prob += 0.05;
  return Math.max(0, Math.min(1, prob));
}

/* ---------- 个性化推荐引擎 ---------- */

/**
 * 协同过滤：基于用户-任务矩阵推荐
 * 找到与目标用户最相似的 K 个用户，推荐他们喜欢而目标用户未接触的任务
 * @param {string|number} userId - 目标用户 ID
 * @param {Object} userTaskMatrix - { userId: { taskId: rating } }
 * @returns {{similar:Array, recommended:Array}}
 */
function collaborativeFilter(userId, userTaskMatrix){
  if(!userId || !userTaskMatrix || typeof userTaskMatrix !== "object"){
    return { similar: [], recommended: [] };
  }
  const target = userTaskMatrix[userId];
  if(!target) return { similar: [], recommended: [] };
  const otherIds = Object.keys(userTaskMatrix).filter(function(id){ return id !== String(userId); });
  if(otherIds.length === 0) return { similar: [], recommended: [] };
  /* 计算余弦相似度 */
  function cosine(a, b){
    const keys = new Set(Object.keys(a).concat(Object.keys(b)));
    let dot = 0, na = 0, nb = 0;
    keys.forEach(function(k){
      const va = Number(a[k]) || 0;
      const vb = Number(b[k]) || 0;
      dot += va * vb;
      na += va * va;
      nb += vb * vb;
    });
    if(na === 0 || nb === 0) return 0;
    return dot / (Math.sqrt(na) * Math.sqrt(nb));
  }
  const sims = otherIds.map(function(id){
    return { userId: id, sim: cosine(target, userTaskMatrix[id]) };
  }).filter(function(s){ return s.sim > 0; }).sort(function(a, b){ return b.sim - a.sim; });
  /* 取 top3 相似用户 */
  const top = sims.slice(0, 3);
  /* 推荐这些相似用户高评分、目标用户未评分的任务 */
  const recommended = [];
  const seen = new Set(Object.keys(target));
  top.forEach(function(s){
    const other = userTaskMatrix[s.userId];
    Object.keys(other).forEach(function(tid){
      if(!seen.has(tid) && (Number(other[tid]) || 0) >= 3){
        recommended.push({ taskId: tid, score: (Number(other[tid]) || 0) * s.sim });
      }
    });
  });
  recommended.sort(function(a, b){ return b.score - a.score; });
  return { similar: top, recommended: recommended };
}

/**
 * 基于内容的推荐：根据用户历史偏好推荐相似任务
 * @param {Object} task - 待评估任务 {scenario, priority, tags, title}
 * @param {Array} userHistory - 用户历史 [{scenario, priority, tags, completed, title}]
 * @returns {number} 匹配度 0-1
 */
function contentBasedRecommend(task, userHistory){
  if(!task || !Array.isArray(userHistory) || userHistory.length === 0) return 0;
  let score = 0;
  let total = 0;
  for(let i = 0; i < userHistory.length; i++){
    const h = userHistory[i];
    if(!h) continue;
    total++;
    let s = 0;
    /* 场景匹配 */
    if(h.scenario && task.scenario && h.scenario === task.scenario) s += 0.4;
    /* 优先级匹配 */
    if(h.priority && task.priority && String(h.priority) === String(task.priority)) s += 0.2;
    /* 标签匹配（Jaccard 相似度） */
    if(Array.isArray(h.tags) && Array.isArray(task.tags) && h.tags.length > 0){
      const inter = h.tags.filter(function(t){ return task.tags.indexOf(t) >= 0; }).length;
      const uni = new Set(h.tags.concat(task.tags)).size;
      if(uni > 0) s += 0.3 * (inter / uni);
    }
    /* 标题关键词匹配 */
    if(h.title && task.title){
      const words = String(task.title).split(/\s+/).filter(function(w){ return w.length > 1; });
      const hit = words.filter(function(w){ return String(h.title).indexOf(w) >= 0; }).length;
      if(words.length > 0) s += 0.1 * (hit / words.length);
    }
    /* 仅对已完成的历史加分 */
    if(h.completed) s *= 1.2;
    score += Math.min(1, s);
  }
  return total > 0 ? score / total : 0;
}

/**
 * 混合推荐：协同过滤 + 内容推荐加权
 * @param {Array} userHistory - 用户历史
 * @param {Array} allTasks - 全部候选任务
 * @param {number} topK - 返回 top K，默认 5
 * @returns {Array<{task:Object, score:number, source:string}>}
 */
function hybridRecommend(userHistory, allTasks, topK){
  if(typeof topK !== "number" || topK < 1) topK = 5;
  if(!Array.isArray(allTasks) || allTasks.length === 0) return [];
  userHistory = Array.isArray(userHistory) ? userHistory : [];
  const results = [];
  /* 已接触的任务 ID 集合 */
  const seenIds = new Set(userHistory.map(function(h){ return h && h.id; }).filter(Boolean));
  for(let i = 0; i < allTasks.length; i++){
    const t = allTasks[i];
    if(!t || seenIds.has(t.id)) continue;
    const contentScore = contentBasedRecommend(t, userHistory);
    /* 协同分需要 userTaskMatrix，这里简化：用历史完成率作为协同信号 */
    let collabScore = 0;
    if(userHistory.length > 0){
      const sameScene = userHistory.filter(function(h){ return h && h.scenario === t.scenario; });
      if(sameScene.length > 0){
        const done = sameScene.filter(function(h){ return h.completed; }).length;
        collabScore = done / sameScene.length;
      }
    }
    /* 混合：内容 60% + 协同 40% */
    const hybrid = contentScore * 0.6 + collabScore * 0.4;
    if(hybrid > 0){
      results.push({
        task: t,
        score: hybrid,
        source: hybrid >= 0.5 ? "strong" : (hybrid >= 0.2 ? "normal" : "weak")
      });
    }
  }
  results.sort(function(a, b){ return b.score - a.score; });
  return results.slice(0, topK);
}

/**
 * 个性化推荐主入口（hybridRecommend 别名）
 * @param {Array} userHistory - 用户历史
 * @param {Array} allTasks - 全部任务
 * @param {number} topK - 返回数量
 * @returns {Array} 推荐列表
 */
function recommend(userHistory, allTasks, topK){
  return hybridRecommend(userHistory, allTasks, topK);
}// ===== Smart Schedule (v1.7-C 智能排期) =====
/* ============================================================
 * v1.7-C 高级分析与预测 · 智能排期模块
 * ------------------------------------------------------------
 *  AI 根据任务优先级 / 截止日期 / 用户习惯自动排程，生成每日最优任务顺序
 *   - smartSchedule(tasks, userPrefs, date)   智能排程主函数
 *   - scoreTask(task, userPrefs, currentTime)  任务评分
 *   - urgencyScore(task)                      紧急度评分（基于 dueDate 距离）
 *   - importanceScore(task)                   重要性评分（基于 priority）
 *   - energyMatch(task, hour, userPrefs)      精力匹配（深度/创意/简单）
 *   - optimizeSchedule(scored, constraints)   优化排程
 *   - suggestBreaks(schedule)                 建议休息时间（每 90 分钟）
 *   - renderScheduleView(schedule)            渲染排程视图 HTML
 *
 *  设计约定：
 *   - 使用 var 声明模块级私有状态（56 > 31，避免 TDZ）
 *   - 所有导出函数均为 function 声明（提升），可在 31 中直接引用
 *   - 排程算法用贪心 + 评分排序，不需要复杂优化算法
 *   - 颜色用 var(--token) CSS 令牌（lint-colors 门禁）
 *   - innerHTML 赋值由调用方用 sanitizeHtml 包裹
 *   - esc / sanitizeHtml 在更早模块定义（< 56），可直接引用
 * ============================================================ */

/* ---------- 常量 ---------- */
/* 任务类型 → 适合时段（用于精力匹配） */
const TASK_TYPE_ENERGY = {
  deep:    { best: [9, 10, 11, 14, 15], weight: 1.0 },   // 深度工作：上午
  creative:{ best: [13, 14, 15, 16], weight: 1.0 },      // 创意工作：下午
  simple:  { best: [19, 20, 21, 22, 8], weight: 1.0 },   // 简单任务：晚上
  meeting: { best: [10, 11, 14, 15, 16], weight: 0.9 },  // 会议：白天
  review:  { best: [9, 10, 16, 17], weight: 0.9 }        // 复核：上下午
};

/* 优先级 → 重要性分值 */
const PRIORITY_SCORE = {
  H: 1.0, high: 1.0, 2: 1.0,
  M: 0.6, medium: 0.6, 1: 0.6,
  L: 0.3, low: 0.3, 0: 0.3
};

/* ---------- 评分函数 ---------- */

/**
 * 紧急度评分（0-1）：基于 dueDate 距离
 * 距离越近越紧急；已过期最紧急
 * @param {Object} task - {dueDate}
 * @returns {number} 0-1
 */
function urgencyScore(task){
  if(!task || !task.dueDate) return 0.3; /* 无截止日期：中等偏低 */
  const now = new Date();
  const due = new Date(task.dueDate);
  if(isNaN(due.getTime())) return 0.3;
  const days = (due - now) / 86400000;
  if(days < 0) return 1.0;          /* 已过期 */
  if(days === 0) return 0.95;       /* 今天到期 */
  if(days <= 1) return 0.85;        /* 明天到期 */
  if(days <= 3) return 0.7;         /* 3 天内 */
  if(days <= 7) return 0.5;         /* 一周内 */
  if(days <= 14) return 0.3;        /* 两周内 */
  return 0.1;                       /* 远期 */
}

/**
 * 重要性评分（0-1）：基于 priority 字段
 * @param {Object} task - {priority}
 * @returns {number} 0-1
 */
function importanceScore(task){
  if(!task) return 0.3;
  const pri = task.priority;
  if(pri === null || pri === undefined) return 0.3;
  const key = String(pri).toLowerCase();
  if(Object.prototype.hasOwnProperty.call(PRIORITY_SCORE, key)) return PRIORITY_SCORE[key];
  if(Object.prototype.hasOwnProperty.call(PRIORITY_SCORE, String(pri))) return PRIORITY_SCORE[String(pri)];
  return 0.3;
}

/**
 * 精力匹配度（0-1）：任务类型与当前小时是否匹配
 * 深度工作上午 / 创意工作下午 / 简单任务晚上
 * @param {Object} task - {type, scenario}
 * @param {number} hour - 0-23
 * @param {Object} userPrefs - {energyCurve} 可选自定义精力曲线
 * @returns {number} 0-1
 */
function energyMatch(task, hour, userPrefs){
  if(typeof hour !== "number" || hour < 0 || hour > 23) hour = new Date().getHours();
  if(!task) return 0.5;
  /* 任务类型：优先 task.type，否则按 scenario 推断 */
  let type = task.type;
  if(!type){
    const sc = task.scenario;
    if(sc === "code") type = "deep";
    else if(sc === "study") type = "deep";
    else if(sc === "office") type = "meeting";
    else if(sc === "life" || sc === "health") type = "simple";
    else type = "simple";
  }
  const cfg = TASK_TYPE_ENERGY[type] || TASK_TYPE_ENERGY.simple;
  /* 用户自定义精力曲线覆盖 */
  if(userPrefs && Array.isArray(userPrefs.energyCurve) && userPrefs.energyCurve.length === 24){
    const curve = userPrefs.energyCurve;
    if(cfg.best.indexOf(hour) >= 0){
      return Math.max(0, Math.min(1, 0.7 + (Number(curve[hour]) || 0) * 0.3));
    }
    return Math.max(0, Math.min(1, (Number(curve[hour]) || 0) * 0.6));
  }
  /* 默认：最佳时段 1.0，相邻时段 0.7，其他 0.3 */
  if(cfg.best.indexOf(hour) >= 0) return cfg.weight;
  /* 相邻时段 */
  for(let i = 0; i < cfg.best.length; i++){
    if(Math.abs(cfg.best[i] - hour) === 1) return cfg.weight * 0.7;
  }
  return cfg.weight * 0.3;
}

/**
 * 任务综合评分（0-1）
 * 紧急度 × 重要性 × 精力匹配度，再加权
 * @param {Object} task - 任务
 * @param {Object} userPrefs - 用户偏好
 * @param {number} currentTime - 当前小时 0-23
 * @returns {{total:number, urgency:number, importance:number, energy:number}}
 */
function scoreTask(task, userPrefs, currentTime){
  if(typeof currentTime !== "number") currentTime = new Date().getHours();
  const u = urgencyScore(task);
  const im = importanceScore(task);
  const en = energyMatch(task, currentTime, userPrefs);
  /* 加权：紧急度 40% + 重要性 40% + 精力 20%，并保证乘积效应 */
  const weighted = u * 0.4 + im * 0.4 + en * 0.2;
  /* 乘积效应：高紧急+高重要任务额外加分 */
  const product = u * im * 0.3;
  const total = Math.max(0, Math.min(1, weighted + product));
  return { total: total, urgency: u, importance: im, energy: en };
}

/* ---------- 排程优化 ---------- */

/**
 * 优化排程：考虑时间约束 / 休息间隔 / 任务切换成本
 * @param {Array} scored - 已评分任务 [{task, score}]
 * @param {Object} constraints - {maxHours, breakInterval, maxTasks}
 * @returns {Array} 优化后的排程 [{task, score, startTime, endTime, break:bool}]
 */
function optimizeSchedule(scored, constraints){
  if(!Array.isArray(scored) || scored.length === 0) return [];
  constraints = constraints || {};
  const maxHours = Number(constraints.maxHours) || 8;
  const breakInterval = Number(constraints.breakInterval) || 90;
  const maxTasks = Number(constraints.maxTasks) || scored.length;
  /* 按评分降序排列 */
  const sorted = scored.slice().sort(function(a, b){
    return (b.score.total || b.score || 0) - (a.score.total || a.score || 0);
  });
  const schedule = [];
  let totalMin = 0;
  const maxMin = maxHours * 60;
  let count = 0;
  for(let i = 0; i < sorted.length && count < maxTasks; i++){
    const item = sorted[i];
    const t = item.task;
    /* 估算任务时长（分钟） */
    const est = Number(t && t.est) || 30;
    if(totalMin + est > maxMin) {
      /* 超出时间预算，跳过 */
      continue;
    }
    const startMin = totalMin;
    const endMin = totalMin + est;
    schedule.push({
      task: t,
      score: item.score,
      startTime: _minToHHMM(startMin),
      endTime: _minToHHMM(endMin),
      startMin: startMin,
      endMin: endMin,
      isBreak: false
    });
    totalMin = endMin;
    count++;
    /* 每 breakInterval 分钟插入休息 */
    if(totalMin % breakInterval < est && totalMin < maxMin && i < sorted.length - 1){
      const breakMin = 15;
      schedule.push({
        task: null,
        score: null,
        startTime: _minToHHMM(totalMin),
        endTime: _minToHHMM(totalMin + breakMin),
        startMin: totalMin,
        endMin: totalMin + breakMin,
        isBreak: true,
        label: t("p5.break", "休息")
      });
      totalMin += breakMin;
    }
  }
  return schedule;
}

/* 分钟转 HH:MM */
function _minToHHMM(min){
  const h = Math.floor(min / 60);
  const m = min % 60;
  return (h < 10 ? "0" : "") + h + ":" + (m < 10 ? "0" : "") + m;
}

/**
 * 建议休息时间：每 90 分钟一个休息
 * @param {Array} schedule - 排程列表
 * @returns {Array<{after:string, duration:number, reason:string}>}
 */
function suggestBreaks(schedule){
  if(!Array.isArray(schedule) || schedule.length === 0) return [];
  const breaks = [];
  let workMin = 0;
  let lastTaskEnd = null;
  for(let i = 0; i < schedule.length; i++){
    const item = schedule[i];
    if(!item) continue;
    if(item.isBreak) {
      workMin = 0; /* 已有休息，重置 */
      continue;
    }
    const est = (item.endMin || 0) - (item.startMin || 0);
    workMin += est;
    lastTaskEnd = item.endTime;
    if(workMin >= 90){
      breaks.push({
        after: item.endTime,
        duration: 15,
        reason: t("p5.continuousWork", "连续工作 ") + workMin + t("p5.minutesSuggestBreak", " 分钟，建议休息")
      });
      workMin = 0;
    }
  }
  return breaks;
}

/* ---------- 主函数 ---------- */

/**
 * 智能排程主函数
 * @param {Array} tasks - 待排程任务
 * @param {Object} userPrefs - 用户偏好 {energyCurve, workStart, workEnd}
 * @param {Date|string} date - 排程日期
 * @returns {{schedule:Array, breaks:Array, summary:Object}}
 */
function smartSchedule(tasks, userPrefs, date){
  if(!Array.isArray(tasks) || tasks.length === 0){
    return { schedule: [], breaks: [], summary: { total: 0, completed: 0, hours: 0 } };
  }
  userPrefs = userPrefs || {};
  /* 排程日期 → 当前小时 */
  const now = (date) ? new Date(date) : new Date();
  const hour = now.getHours();
  /* 过滤未完成任务 */
  const pending = tasks.filter(function(t){ return t && !t.completed; });
  /* 评分 */
  const scored = pending.map(function(t){
    return { task: t, score: scoreTask(t, userPrefs, hour) };
  });
  /* 优化排程 */
  const constraints = {
    maxHours: userPrefs.maxHours || 8,
    breakInterval: 90,
    maxTasks: userPrefs.maxTasks || pending.length
  };
  const schedule = optimizeSchedule(scored, constraints);
  /* 建议休息 */
  const breaks = suggestBreaks(schedule);
  /* 汇总 */
  let totalMin = 0;
  let taskCount = 0;
  for(let i = 0; i < schedule.length; i++){
    if(schedule[i] && !schedule[i].isBreak){
      totalMin += (schedule[i].endMin - schedule[i].startMin);
      taskCount++;
    }
  }
  return {
    schedule: schedule,
    breaks: breaks,
    summary: {
      total: pending.length,
      scheduled: taskCount,
      hours: Math.round(totalMin / 60 * 10) / 10
    }
  };
}

/* ---------- 渲染 ---------- */

/**
 * 渲染排程视图 HTML
 * @param {Array} schedule - 排程列表
 * @returns {string} HTML 字符串
 */
function renderScheduleView(schedule){
  if(!Array.isArray(schedule) || schedule.length === 0) {
    return '<div class="schedule-empty">' + t("p5.noScheduleData", "暂无排程数据") + '</div>';
  }
  const rows = [];
  for(let i = 0; i < schedule.length; i++){
    const item = schedule[i];
    if(!item) continue;
    if(item.isBreak){
      rows.push(
        '<div class="schedule-row break">' +
          '<span class="time">' + esc(item.startTime) + '-' + esc(item.endTime) + '</span>' +
          '<span class="label">' + t("p5.breakLabel", "· 休息") + '</span>' +
        '</div>'
      );
    } else {
      const task = item.task || {};
      const title = esc(task.title || task.name || t("common.unnamed","未命名"));
      const pri = esc(task.priority || "M");
      const score = item.score ? (item.score.total || 0).toFixed(2) : "0.00";
      rows.push(
        '<div class="schedule-row task">' +
          '<span class="time">' + esc(item.startTime) + '-' + esc(item.endTime) + '</span>' +
          '<span class="title">' + title + '</span>' +
          '<span class="pri pri-' + pri + '">' + pri + '</span>' +
          '<span class="score">' + score + '</span>' +
        '</div>'
      );
    }
  }
  return '<div class="schedule-view">' + rows.join("") + '</div>';
}// ===== Sentiment Analysis (v1.7-C 情绪分析) =====
/* ============================================================
 * v1.7-C 高级分析与预测 · 情绪分析模块
 * ------------------------------------------------------------
 *  分析任务记录 / 评论中的情绪趋势，用关键词词典 + ONNX 模型 fallback
 *   - SENTIMENT_DICT                 情绪词典（正面/负面/程度副词）
 *   - sentimentScore(text)           情绪评分（-1 到 1）
 *   - analyzeSentiment(text)         情绪分析主函数 {score, label, confidence}
 *   - analyzeSentimentTrend(texts)   多段文本情绪趋势
 *   - detectEmotion(text)            情绪检测（joy/anger/sadness/fear/surprise/disgust）
 *   - emotionTrend(records)          从任务记录分析情绪趋势
 *
 *  设计约定：
 *   - 使用 var 声明模块级常量（57 > 31，避免 TDZ）
 *   - 所有导出函数均为 function 声明（提升），可在 31 中直接引用
 *   - 情绪分析用关键词词典，不依赖 ONNX（ONNX 为可选 fallback）
 *   - ONNX 不可用时自动降级到关键词词典
 *   - 输入容错：空文本/非字符串返回 neutral
 * ============================================================ */

/* ---------- 情绪词典 ---------- */
const SENTIMENT_DICT = {
  /* 正面词（权重 1-3） */
  positive: {
    "好": 1, "棒": 2, "优秀": 3, "完美": 3, "满意": 2, "开心": 2, "快乐": 2,
    "成功": 2, "完成": 1, "顺利": 2, "高效": 2, "喜欢": 2, "爱": 2, "赞": 3,
    "不错": 1, "可以": 1, "行": 1, "ok": 1, "good": 2, "great": 3, "nice": 2,
    "excellent": 3, "perfect": 3, "happy": 2, "love": 3, "like": 1, "well": 1,
    "done": 1, "finish": 1, "success": 2, "win": 2, "best": 3, "awesome": 3,
    "wonderful": 3, "amazing": 3, "进展": 1, "突破": 2, "提升": 2, "进步": 2
  },
  /* 负面词（权重 1-3） */
  negative: {
    "差": 2, "坏": 2, "糟": 3, "失败": 3, "错误": 2, "问题": 1, "困难": 1,
    "难": 1, "烦": 2, "累": 2, "疲惫": 3, "失望": 2, "沮丧": 3, "愤怒": 3,
    "生气": 2, "讨厌": 2, "恨": 3, "不行": 2, "无法": 1, "缺失": 1, "bug": 2,
    "bad": 2, "wrong": 2, "error": 2, "fail": 3, "failure": 3, "hate": 3,
    "sad": 2, "angry": 3, "tired": 2, "difficult": 1, "hard": 1, "stuck": 2,
    "broken": 3, "crash": 3, "issue": 1, "problem": 1, "pain": 2, "suck": 3
  },
  /* 程度副词（乘数） */
  intensifiers: {
    "很": 1.5, "非常": 2, "超级": 2.5, "极其": 2.5, "特别": 1.8, "十分": 2,
    "相当": 1.5, "比较": 1.2, "稍微": 0.5, "有点": 0.7, "略": 0.5,
    "very": 1.5, "really": 1.8, "extremely": 2.5, "quite": 1.5, "pretty": 1.3,
    "super": 2, "so": 1.5, "too": 1.5
  },
  /* 否定词 */
  negators: {
    "不": 1, "没": 1, "无": 1, "非": 1, "未": 1, "别": 1,
    "not": 1, "no": 1, "never": 1, "without": 1, "none": 1
  }
};

/* ---------- 情绪类型词典（用于 detectEmotion） ---------- */
const EMOTION_KEYWORDS = {
  joy: ["开心", "快乐", "高兴", "愉快", "兴奋", "满意", "棒", "赞", "完美",
        "happy", "joy", "excited", "glad", "pleased", "great", "awesome"],
  anger: ["愤怒", "生气", "恼火", "气", "烦", "讨厌", "恨", "操",
          "angry", "mad", "furious", "hate", "annoyed"],
  sadness: ["悲伤", "难过", "伤心", "失落", "沮丧", "失望", "哭", "郁闷",
            "sad", "depressed", "down", "unhappy", "blue", "cry"],
  fear: ["害怕", "恐惧", "担心", "焦虑", "紧张", "怕", "慌",
         "fear", "afraid", "scared", "worry", "anxious", "nervous"],
  surprise: ["惊讶", "吃惊", "震惊", "意外", "没想到", "哇",
             "surprise", "shocked", "wow", "unexpected"],
  disgust: ["恶心", "厌恶", "反感", "嫌弃", "讨厌", "呕",
            "disgust", "gross", "eww", "nasty"]
};

/* ---------- 核心函数 ---------- */

/**
 * 情绪评分（-1 到 1）
 * 基于关键词词典 + 程度副词 + 否定词
 * @param {string} text - 输入文本
 * @returns {number} -1 到 1
 */
function sentimentScore(text){
  if(!text || typeof text !== "string") return 0;
  const lower = text.toLowerCase();
  let score = 0;
  let posHit = 0, negHit = 0;
  /* 扫描正面词 */
  Object.keys(SENTIMENT_DICT.positive).forEach(function(word){
    const weight = SENTIMENT_DICT.positive[word];
    let idx = lower.indexOf(word);
    while(idx >= 0){
      let w = weight;
      /* 检查前缀程度副词 */
      w *= _scanModifier(lower, idx);
      score += w;
      posHit++;
      idx = lower.indexOf(word, idx + word.length);
    }
  });
  /* 扫描负面词 */
  Object.keys(SENTIMENT_DICT.negative).forEach(function(word){
    const weight = SENTIMENT_DICT.negative[word];
    let idx = lower.indexOf(word);
    while(idx >= 0){
      let w = weight;
      w *= _scanModifier(lower, idx);
      score -= w;
      negHit++;
      idx = lower.indexOf(word, idx + word.length);
    }
  });
  if(posHit + negHit === 0) return 0;
  /* 归一化到 -1 ~ 1 */
  return Math.max(-1, Math.min(1, score / (posHit + negHit + 2)));
}

/**
 * 扫描前缀修饰词（程度副词 + 否定词）
 * 程度副词（如"非常"）中的字符不应被否定词（如"非"）误判，
 * 故先定位程度副词覆盖区间，否定词扫描时跳过这些区间。
 * @param {string} text - 全文
 * @param {number} idx - 当前词起始位置
 * @returns {number} 修饰乘数（含否定翻转）
 */
function _scanModifier(text, idx){
  let mult = 1;
  let negated = false;
  /* 检查前 6 个字符内是否有修饰词 */
  const start = Math.max(0, idx - 6);
  const prefix = text.substring(start, idx);
  const prefixStart = start;
  /* 先扫描程度副词，记录其覆盖的字符区间（相对全文位置） */
  const intensifierRanges = [];
  Object.keys(SENTIMENT_DICT.intensifiers).forEach(function(w){
    let pos = prefix.indexOf(w);
    while(pos >= 0){
      mult *= SENTIMENT_DICT.intensifiers[w];
      intensifierRanges.push([prefixStart + pos, prefixStart + pos + w.length]);
      pos = prefix.indexOf(w, pos + w.length);
    }
  });
  /* 否定词扫描：跳过程度副词覆盖的区间，避免"非常"中的"非"被误判 */
  Object.keys(SENTIMENT_DICT.negators).forEach(function(w){
    let pos = prefix.indexOf(w);
    while(pos >= 0){
      const absStart = prefixStart + pos;
      const absEnd = absStart + w.length;
      const inIntensifier = intensifierRanges.some(function(r){
        return absStart >= r[0] && absEnd <= r[1];
      });
      if(!inIntensifier) negated = !negated;
      pos = prefix.indexOf(w, pos + w.length);
    }
  });
  if(negated) mult *= -1;
  return mult;
}

/**
 * 情绪分析主函数
 * @param {string} text - 输入文本
 * @returns {{score:number, label:string, confidence:number}}
 */
function analyzeSentiment(text){
  if(!text || typeof text !== "string" || text.trim().length === 0){
    return { score: 0, label: "neutral", confidence: 0 };
  }
  const score = sentimentScore(text);
  let label, confidence;
  if(score > 0.15){
    label = "positive";
    confidence = Math.min(1, score * 2);
  } else if(score < -0.15){
    label = "negative";
    confidence = Math.min(1, Math.abs(score) * 2);
  } else {
    label = "neutral";
    confidence = 1 - Math.abs(score) * 2;
  }
  return { score: score, label: label, confidence: Math.max(0, Math.min(1, confidence)) };
}

/**
 * 情绪趋势分析：多段文本的情绪变化
 * @param {Array<string>} texts - 多段文本
 * @returns {{scores:Array, labels:Array, trend:string, avgScore:number}}
 */
function analyzeSentimentTrend(texts){
  if(!Array.isArray(texts) || texts.length === 0){
    return { scores: [], labels: [], trend: "stable", avgScore: 0 };
  }
  const scores = [];
  const labels = [];
  for(let i = 0; i < texts.length; i++){
    const r = analyzeSentiment(texts[i]);
    scores.push(r.score);
    labels.push(r.label);
  }
  /* 趋势：用线性回归斜率判断 */
  let sum = 0;
  for(let j = 0; j < scores.length; j++) sum += scores[j];
  const avg = sum / scores.length;
  let trend = "stable";
  if(scores.length >= 2){
    const first = scores[0];
    const last = scores[scores.length - 1];
    const diff = last - first;
    if(diff > 0.2) trend = "improving";
    else if(diff < -0.2) trend = "declining";
  }
  return { scores: scores, labels: labels, trend: trend, avgScore: avg };
}

/**
 * 情绪检测：识别具体情绪类型
 * @param {string} text - 输入文本
 * @returns {{emotion:string, confidence:number, scores:Object}}
 */
function detectEmotion(text){
  if(!text || typeof text !== "string" || text.trim().length === 0){
    return { emotion: "neutral", confidence: 0, scores: {} };
  }
  const lower = text.toLowerCase();
  const scores = {};
  let maxEmotion = "neutral";
  let maxScore = 0;
  Object.keys(EMOTION_KEYWORDS).forEach(function(emo){
    let s = 0;
    let hits = 0;
    EMOTION_KEYWORDS[emo].forEach(function(kw){
      let idx = lower.indexOf(kw);
      while(idx >= 0){
        s += 1;
        hits++;
        idx = lower.indexOf(kw, idx + kw.length);
      }
    });
    scores[emo] = s;
    if(s > maxScore){
      maxScore = s;
      maxEmotion = emo;
    }
  });
  /* 置信度：基于命中次数 */
  let total = 0;
  Object.keys(scores).forEach(function(k){ total += scores[k]; });
  const confidence = total > 0 ? maxScore / total : 0;
  if(maxScore === 0) return { emotion: "neutral", confidence: 0, scores: scores };
  return { emotion: maxEmotion, confidence: confidence, scores: scores };
}

/**
 * 从任务记录分析情绪趋势
 * @param {Array} records - [{content, text, note, comment, date}]
 * @returns {{trend:string, emotions:Array, sentimentTrend:Object, dominantEmotion:string}}
 */
function emotionTrend(records){
  if(!Array.isArray(records) || records.length === 0){
    return {
      trend: "stable",
      emotions: [],
      sentimentTrend: { scores: [], labels: [], trend: "stable", avgScore: 0 },
      dominantEmotion: "neutral"
    };
  }
  /* 提取每条记录的文本 */
  const texts = records.map(function(r){
    if(!r) return "";
    return [r.content, r.text, r.note, r.comment].filter(Boolean).join(" ");
  });
  /* 情绪评分趋势 */
  const sTrend = analyzeSentimentTrend(texts);
  /* 每条记录的情绪类型 */
  const emotions = [];
  const emoCount = {};
  for(let i = 0; i < records.length; i++){
    const e = detectEmotion(texts[i]);
    emotions.push(e.emotion);
    emoCount[e.emotion] = (emoCount[e.emotion] || 0) + 1;
  }
  /* 主导情绪 */
  let dominant = "neutral";
  let maxC = 0;
  Object.keys(emoCount).forEach(function(k){
    if(emoCount[k] > maxC){
      maxC = emoCount[k];
      dominant = k;
    }
  });
  return {
    trend: sTrend.trend,
    emotions: emotions,
    sentimentTrend: sTrend,
    dominantEmotion: dominant
  };
}

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
 */
function linearMapStatus(localStatus){
  return LINEAR_STATUS_MAP[localStatus] || localStatus;
}

/**
 * 列出 Linear issues（框架）
 * @param {Object} [filter] - { status, assignee, limit }
 * @returns {Promise<Array>} issue 列表
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
  const resp = await _intDoRequest("https://" + config.domain + "/rest/api/3/myself", {
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
  const base = "https://" + domain + "/rest/api/3";
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
 */
function jiraMapStatus(localStatus){
  return JIRA_STATUS_MAP[localStatus] || localStatus;
}

/**
 * 列出 Jira issues（框架）
 * @param {Object} [filter] - { jql, limit }
 * @returns {Promise<Array>} issue 列表
 */
async function jiraListIssues(filter){
  const provider = await _intRequireProvider("jira", INTEGRATION_TYPES.JIRA);
  if(!provider) return [];
  filter = filter || {};
  const token = provider.config.token;
  const domain = provider.config.domain;
  const projectKey = provider.config.projectKey;
  const jql = filter.jql || ("project = " + projectKey);
  const base = "https://" + domain + "/rest/api/3";
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
 */
async function dingtalkNotifyEvent(eventType, payload){
  const provider = await _intRequireProvider("dingtalk", INTEGRATION_TYPES.DINGTALK);
  if(!provider) return false;
  const text = "[" + eventType + "] " + JSON.stringify(payload);
  return await dingtalkSendMessage(provider.config.chatId, text);
}

/**
 * 从钉钉消息创建任务
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
}// ===== v1.8-C OAuth2 Framework (OAuth2 授权框架) =====

// ----------------------------------------------------------------------------
