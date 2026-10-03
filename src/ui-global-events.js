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
    {name:"notion", label:"Notion", desc:t("int.notionDesc","验证 Notion Integration Token（笔记 / 任务同步尚未接入）"), connectFn:"notionConnect", disconnectFn:"notionDisconnect", pushFn:"notionPushTasks"},
    {name:"linear", label:"Linear", desc:t("int.linearDesc","验证 Linear API Key（任务同步尚未接入）"), connectFn:"linearConnect", disconnectFn:"linearDisconnect", pushFn:"linearPushTasks"},
    {name:"jira", label:"Jira", desc:t("int.jiraDesc","验证 Token 并推送任务到项目（仅桌面版可用：Atlassian 不回 CORS 头，浏览器形态请求发不出去）；凭据随应用数据加密落盘"), connectFn:"jiraConnect", disconnectFn:"jiraDisconnect", pushFn:"jiraPushTasks"},
    {name:"slack", label:"Slack", desc:t("int.slackDesc","群机器人 Incoming Webhook · 推送通知（仅桌面版可用：Slack webhook 不回 CORS 头，浏览器形态发不出去）；凭据仅本次会话，刷新即失效"), connectFn:"slackConnect", disconnectFn:"slackDisconnect", ephemeral:true},
    {name:"feishu", label:t("int.feishuLabel","飞书"), desc:t("int.feishuDesc","群机器人 webhook · 推送通知（凭据仅本次会话，刷新即失效）"), connectFn:"feishuConnect", disconnectFn:"feishuDisconnect", ephemeral:true},
    {name:"dingtalk", label:t("int.dingtalkLabel","钉钉"), desc:t("int.dingtalkDesc","群机器人 webhook · 推送通知（凭据仅本次会话，刷新即失效）"), connectFn:"dingtalkConnect", disconnectFn:"dingtalkDisconnect", ephemeral:true},
    {name:"calendar", label:t("appPage.calview", "日历"), desc:t("int.calendarDesc","验证日历凭据（日程同步尚未接入）"), connectFn:"calendarConnect", disconnectFn:"calendarDisconnect"}
  ];
  const rows = providers.map(function(p){
    /* v3.7.66：飞书 / 钉钉是「会话内存态」通道，**不进取 provider 存储**（那里是加密落盘的
       持久凭据，与"绝不落盘"的决定冲突），状态改从 notifyHookGet 读。 */
    if(p.ephemeral){
      const hk = (typeof notifyHookGet === "function") ? notifyHookGet(p.name) : { configured:false };
      /* 钉钉的 webhook 不回 CORS 头（实测），浏览器里发不出去 → 只有主进程发送可用时才开放。
         不可用时按钮禁用并写清原因，别给一个"连上了但其实没连"的入口。 */
      const usable = (typeof notifyChannelAvailable === "function") ? notifyChannelAvailable(p.name) : true;
      const on = usable && !!hk.configured;
      const st = !usable ? t(notifyUnavailableKey(p.name), "当前形态不可用")
        : on ? (t("int.sessionOn","本会话已配置") + (hk.hasSecret ? t("int.signed"," · 加签") : "") + (hk.urlHint ? " · " + hk.urlHint : ""))
        : t("int.notConnected","未连接");
      const btn = !usable
        ? '<button type="button" class="addbtn sm" disabled title="' + esc(notifyUnavailableHint(p.name)) + '">' + t("p4.html.intConnDisabled",">连接（当前形态不可用）</button>")
        : on
        ? '<button type="button" class="addbtn sm int-disc" data-int-disc="' + p.name + t("p4.html.intDiscBtn","\">断开</button>")
        : '<button type="button" class="addbtn sm int-conn" data-int-conn="' + p.name + t("p4.html.intConnBtn","\">连接</button>");
      return '<div class="int-row ' + (on ? "int-on" : "int-off") + '">' +
        '<div class="int-info"><div class="int-label">' + esc(p.label) + '</div><div class="int-desc">' + esc(p.desc) + '</div></div>' +
        '<div class="int-status">' + esc(st) + '</div>' +
        '<div class="int-action">' + btn + '</div>' +
        '</div>';
    }
    // v3.1.1 修复：原用一个不存在的 getProvider 全局函数，状态恒为「未连接」；真实函数为 integrationGetProvider。
    // calendar 的注册名是具体日历类型（google_calendar / outlook_calendar），需按两个名字兜底查询。
    let prov = null;
    try{ prov = integrationGetProvider(p.name); }catch(e){ prov = null; }
    if(!prov && p.name === "calendar"){
      try{ prov = integrationGetProvider(INTEGRATION_TYPES.GOOGLE_CALENDAR) || integrationGetProvider(INTEGRATION_TYPES.OUTLOOK_CALENDAR); }catch(e){ prov = null; }
    }
    const enabled = !!(prov && prov.enabled);
    /* v3.7.79：Jira 仅桌面版可达（Atlassian 不回 CORS 头）——浏览器形态连接按钮禁用并写明原因，
       别给一个"连上了但每次请求都失败"的入口。 */
    const jiraLocked = (p.name === "jira") && (typeof jiraHasRelay === "function") && !jiraHasRelay();
    const statusCls = (enabled && !jiraLocked) ? "int-on" : "int-off";
    const verified = !!(prov && prov.config && prov.config._verified);
    const statusText = jiraLocked ? t("int.desktopOnly","仅桌面版可用")
      : enabled ? (t("int.connected","已连接") + (verified ? t("int.verified"," · 已验证") : t("int.unverified"," · 未验证"))) : t("int.notConnected","未连接");
    /* v3.7.70：已连接且有推送消费点的 provider 多给一个显式动作。
       「推送任务」是本地→远端的单向动作，用户点一下才发生（没有后台自动同步）。 */
    const pushBtn = (enabled && p.pushFn && !jiraLocked)
      ? '<button type="button" class="addbtn sm int-push" data-int-push="' + p.name + t("p4.html.intPushBtn",">推送任务</button>")
      : "";
    const actionBtn = pushBtn + (jiraLocked
      ? '<button type="button" class="addbtn sm" disabled title="' + esc("仅桌面版（Electron）可用：Atlassian 的 REST 端点不回 CORS 头，任何浏览器形态都发不出去") + '">' + t("p4.html.intConnDisabled",">连接（当前形态不可用）</button>")
      : enabled
      ? '<button type="button" class="addbtn sm int-disc" data-int-disc="' + p.name + t("p4.html.intDiscBtn","\">断开</button>")
      : '<button type="button" class="addbtn sm int-conn" data-int-conn="' + p.name + t("p4.html.intConnBtn","\">连接</button>"));
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
  /* v3.7.70：推送消费点。
     刻意**不用** `window[name + "PushTasks"]` 那种拼接派发 —— 本仓的静态可达性普查
     （docs/product-scope.md §四）就是被拼接派发坑过，且文档记着「全仓 window[...] 派发点仅 3 处」。
     这里用显式字面量表，普查看得见，那个计数也不会被无声改掉。 */
  const PUSH_FNS = { notion: notionPushTasks, linear: linearPushTasks, jira: jiraPushTasks };
  const LABELS = {};
  providers.forEach(function(p){ LABELS[p.name] = p.label; });
  panel.querySelectorAll("[data-int-push]").forEach(function(btn){
    btn.onclick = async function(){
      const name = btn.getAttribute("data-int-push");
      const fn = PUSH_FNS[name];
      const label = LABELS[name] || name;
      if(typeof fn !== "function"){ toast(t("integration.pushUnsupported", "该集成暂不支持推送"), "warn"); return; }
      /* 推送范围＝未完成任务。**不做全量**：把历史已完成任务一次性灌进对方工作区是噪音，
         而且是不可逆的（对方那边只增不删）。 */
      const tasks = getTasks().filter(function(x){ return x && x.status !== "done"; });
      if(!tasks.length){ toast(t("integration.pushNoTasks", "没有未完成的任务可推送"), "warn"); return; }
      if(!confirm(t("integration.pushConfirm", "把 {n} 条未完成任务推送到 {name}？只推不拉，不会改动本地数据。")
        .replace("{n}", String(tasks.length)).replace("{name}", label))) return;
      btn.disabled = true;
      const oldText = btn.textContent;
      btn.textContent = t("integration.pushing", "推送中…");
      let r = null;
      try{ r = await fn(tasks); }
      catch(e){ r = { ok: false, error: (e && e.message) || String(e) }; }
      btn.disabled = false;
      btn.textContent = oldText;
      if(r && r.ok){
        toast(t("integration.pushOk", "已推送到 {name}：新建 {c} 条、更新 {u} 条")
          .replace("{name}", label).replace("{c}", String(r.created)).replace("{u}", String(r.updated)), "ok");
      }else{
        /* 部分失败不得报成成功：失败条数与第一条原因都要说出来，明细进诊断面板 */
        const n = (r && r.failed && r.failed.length) || 0;
        const first = (r && r.failed && r.failed[0] && r.failed[0].error) || (r && r.error) || t("integration.pushUnknown", "未知原因");
        toast(t("integration.pushFail", "推送到 {name} 失败：{n} 条未成功（{why}）")
          .replace("{name}", label).replace("{n}", String(n || tasks.length)).replace("{why}", String(first).slice(0, 80)), "warn");
        try{ pushDiag("warn", name + " 推送失败", { where: "integration-push", failed: (r && r.failed) || [], error: (r && r.error) || "" }); }catch(e){}
      }
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
             { k:"token", label:"API Token", ph:"Bearer token", required:true, secret:true },
             { k:"projectKey", label:t("int.jiraProjectKey","项目 Key（推送任务用，如 PROJ）"), ph:"PROJ" }],
  /* v3.7.69：Slack 改成「群机器人 Incoming Webhook」—— URL 本身即凭据、无加签；
     hooks.slack.com 不回 CORS 头（实测），仅桌面版可发。填了**不会保存**（会话内存）。 */
  slack:    [{ k:"url", label:t("int.slackHook","Incoming Webhook 地址"), ph:"https://hooks.slack.com/services/…", required:true, secret:true }],
  /* v3.7.66：飞书 / 钉钉改成「群自定义机器人 webhook」—— 旧的 App ID/Secret + chatId
     那套要企业自建应用管理员权限，个人配不通（且那 6 个发送函数应用内零调用方）。
     ⚠️ 这两项填了**不会保存**：凭据只活在本次会话内存里，刷新即失效（用户 2026-09-29 定）。 */
  feishu:   [{ k:"url", label:t("int.feishuHook","群机器人 Webhook 地址"), ph:"https://open.feishu.cn/open-apis/bot/v2/hook/…", required:true, secret:true },
             { k:"secret", label:t("int.signSecret","加签密钥（机器人未开加签就留空）"), required:false, secret:true }],
  dingtalk: [{ k:"url", label:t("int.dingHook","群机器人 Webhook 地址"), ph:"https://oapi.dingtalk.com/robot/send?access_token=…", required:true, secret:true },
             { k:"secret", label:t("int.signSecret","加签密钥（机器人未开加签就留空）"), required:false, secret:true }],
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
    /* v3.7.66：飞书 / 钉钉的凭据**不落盘**，所以不能再用那句"随应用数据加密持久化"——
       那是别的 provider 的口径，用在这里就是一句假话。按通道分开给。 */
    + (name === "feishu" || name === "dingtalk" || name === "slack"
        ? t("p4.html.intEphemeralHint",'<p class="sub u-m-0-0-2 u-text-warn">⚠ 只保存在本次会话内存里：不写入本地存储、不进备份与云同步，<b>刷新或关闭页面即失效</b>，需要重新粘贴。</p>')
        : t("p4.html.intCredentialHint",'<p class="sub u-m-0-0-2">凭据仅存储于本机（随应用数据加密持久化），不上传任何服务器</p>'))
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
  /* v3.7.66 真机实测修掉的既有缺陷：`.cmd` 基类是 display:none，靠自身 `.show` 才显示；
     而这里只给外层 .overlay 加了 show → 弹窗面板一直是不渲染的（点「连接」后什么都没出现）。
     之所以长期没被发现：单测跑在 jsdom（不应用样式表）、e2e 没覆盖这个弹窗，
     而 v3.7.60 那轮我用 element.value= / .click() 直接驱动，隐藏元素照样能点。
     ⚠️ 必须同步加，不能塞进下面那个 rAF —— rAF 在无合成帧的环境里根本不触发
     （headless Chromium 实测：不强制出帧时回调永不执行，弹窗就永远不出现）。 */
  const _cmdEl = ov.querySelector(".cmd");
  if(_cmdEl) _cmdEl.classList.add("show");
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
    /* v3.7.59 安全修正：s.name / s.desc 原样拼进 innerHTML —— name 还落在 aria-label="…" 属性里，
       一个含引号的技能名即可截断属性并注入事件。数据源是 wb_agent_ai_cfg 的 skills.builtin，
       **导入 JSON 备份 / 云同步快照都能写入任意值**，故按不可信输入处理。
       同批核查：renderAiMcpList / renderAiWorkflowList 早已用 esc()，只有本函数与会话历史漏了。
       这里刻意把 esc() 内联（而非先赋给中间变量）——这样构建期门禁 scripts/lint-xss.mjs
       能直接看出该行已消毒，不必走豁免。 */
    row.innerHTML = '<input type="checkbox" id="aiSkill_'+i+'"'+(s.enabled?" checked":"")+' aria-label="'+esc(s.name || "")+'">'+
      "<div><div class=\"sw-label\">"+esc(s.name || "")+"</div><div class=\"sw-sub\">"+esc(s.desc || "")+"</div></div>";
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
/* v3.7.59：AI_BUILTIN_PLUGINS / renderAiPluginList 已删除。
   那 3 项（code_runner / web_search / file_reader）是"已有真实能力的假副本"——
   web_search 与 code_run 早就是 TOOLS 里的真工具（模型直接可调），勾选它们不改变任何东西；
   而本仓库 product-scope §四 的死 UI 规范明确写着「stub + 活 UI = 虚假功能」，
   连它自己的文案都写着"暂无执行代码，勾选状态仅保存配置"。
   真·插件市场是另一套（BUILTIN_PLUGINS / 概览页 store，10 个可安装插件），未受影响。 */
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
    /* v3.7.59 安全修正：h.title / h.time 原样拼进 innerHTML。会话标题取自首条用户消息或 AI 生成，
       经导入 JSON 备份 / 云同步快照可被写成含标签的串 → 持久化 XSS（读走整个 localStorage）。
       esc() 内联写法同上，便于构建期门禁直接识别。 */
    row.innerHTML = "<div><div class=\"sw-label\">"+esc(h.title || (t("ai.sessPrefix","会话 ")+(i+1)))+"</div><div class=\"sw-sub\">"+esc(h.time || "")+"</div></div>";
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
      AppBridge.setTheme(v); // 全部预置主题与自定义统一走 setTheme（v3.1.1 起预置主题含 aurora；contrast 已移除）
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
    /* v3.7.71 跨标签页数据守护（路线项②）：storage 事件只在**其它**标签页写入时触发。
       双开窗口此前=后写覆盖先写且互不感知（全仓 0 处 storage 监听）。
       最小正确实现：节流提示「数据已在其他窗口修改」，不自动刷新（防止打断用户输入）；
       用户点击后走既有刷新路径。节流 30s 防多键连改刷屏。 */
    let _xTabToastAt = 0;
    window.addEventListener("storage", function(e){
      if(!e.key || e.key.indexOf("wb_agent_") !== 0) return;
      if(e.key === "wb_agent_cfg") return; // 配置类写入（如主题）不提示
      const now = Date.now();
      if(now - _xTabToastAt < 30000) return;
      _xTabToastAt = now;
      try{
        toast(t("ai.xtabChanged","检测到其他窗口修改了数据，为避免互相覆盖请刷新本窗口"), "warn", 6000);
      }catch(_e){ /* toast 不可用时静默（如页面尚未就绪） */ }
    });
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

/* v3.7.66：把 manifest.json 的三个 shortcuts 落到真实视图。
   此前它们指向 ./#overview、./#stats、./#settings，但全仓只有 src/ui-guide.js:188（指南锚点）
   与 :256（#share= 只读分享）读 location.hash —— 也就是说从桌面图标 / 主屏快捷方式进来，
   只会落到上次退出时的视图，快捷方式形同虚设（按 product-scope 的纪律：入口存在但无接线＝虚假功能）。
   这里只认这三个已知片段并复用应用既有的切换入口（setActive / openDrawer），
   不自己拼 DOM；其余 hash 一律不碰，避免抢 ui-guide 的锚点语义。 */
function applyStartHash(){
  let hash = "";
  try{
    hash = String((typeof location !== "undefined" && location.hash) || "").replace(/^#/, "").trim().toLowerCase();
  }catch(e){ return ""; }
  if(hash === "overview" || hash === "stats"){
    try{ setActive(hash); render(); }catch(e){ return ""; }   // setActive 内含持久化；render 让目标视图真正上屏
    return hash;
  }
  if(hash === "settings"){
    try{ openDrawer(); }catch(e){ return ""; }
    return hash;
  }
  return "";
}

(async function startup(){
  try{ await initCrypto(); }catch(e){ /* 降级明文，不阻塞启动 */ }
  /* v3.7.66：飞书 / 钉钉凭据策略改为「仅会话内存、绝不落盘」——
     历史版本可能已把 appSecret / accessSecret（甚至当时不算敏感字段的 appId / accessKey）
     写进 wb_integration_providers，启动时一次性抹掉。放在 initCrypto 之后是因为
     _intSaveProviders 的密封链要用设备密钥。 */
  try{ if(typeof _notifyScrubPersisted === "function") _notifyScrubPersisted(); }catch(e){ /* 清不动也不能挡住启动 */ }
  /* v3.7.71：OAuth2 回调调用已随 v1.14 移除 oauth2 模块一并清掉 —— 此前每此启动调一个
     永远 resolve 的空 stub（data-idb.js），是「看起来在接线」的零开销死码。 */  // 架构项①：IndexedDB 持久镜像——启动时把 localStorage 用户数据镜像到 IDB（异步，不阻塞；仅镜像不自动恢复，恢复入口在设置页）
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
    if(typeof initPetRhythmFromPref === "function") initPetRhythmFromPref();   // v3.7.83 节奏档控件绑定+回填
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
  /* v3.7.65：主界面恒渲染，引导改为 modal 叠加。旧写法两个分支互斥 —— 命中引导时 render()/checkCount()
     根本不执行，用户在走完三步之前看到的是一片空白主页；关掉页面还不会写 onboarded，下次重来。
     dailyDigest 仍只在「无需引导」或引导结束时触发（_finishOnboarding 内会调用），行为与原意一致。 */
  render();
  checkCount();
  if(needsOnboarding()){
    renderOnboarding();
  }else{
    dailyDigest();
  }
  /* v3.7.66：manifest shortcuts（./#overview / ./#stats / ./#settings）的 hash → 视图接线。
     必须排在 render 之后 —— render() 会把设置抽屉收回主视图（src/render-entry.js:52-58 的
     _moveDrawerHome + classList.remove("open") + uiView="main"），先接线再 render 等于把
     #settings 的跳转当场抹掉（实测就是这样红了一条用例才看出来）。 */
  applyStartHash();
  scheduleAutoBackup(); // 启动即留一份基线快照，确保 recover 始终有可还原点
  // T3.4 启动通知调度器：仅生产环境启动（jsdom 测试环境跳过，避免 setInterval 阻塞测试进程）
  if(getNotifyEnabled() && typeof navigator !== "undefined" && !/jsdom/i.test(navigator.userAgent)){
    startNotifyScheduler();
  }
})();

/* ---------- v1.8.3 性能优化：重模块懒初始化入口 ----------
 * 历史上此处列出 53-ai-deep 与 54~58、65~70 等重模块。其中 58/65~70 已在更早版本
 * 按 product-scope 纪律移除；54-离线AI / 55-ML预测 / 56-智能排期 / 57-情绪分析
 * 四个无出口沉睡框架已于 v3.7.58 整体移除（见 ui-ge-integrations.js 的 v3.7.58 墓碑注释）。
 * 现存的自动初始化重模块仅剩：
 *   - 53-ai-deep        (AI 深度增强：Agent 自主执行 / RAG / 代码审查)
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
/* v3.7.78：桥对象在本块先行建空（真正的键由最后一个块的 Object.assign 汇入）——
   中间块（如 ui-ge-api）的守卫式 Object.assign(window.__test,…) 依赖它已存在。 */
if (typeof window !== "undefined" && __TEST_GATE__) { window.__test = {}; }
/* v3.7.78 解耦：测试导出桥（原 window.__test 巨型对象字面量）已迁至最后一个块
   ui-ge-integrations 的尾部 —— 桥里数百个裸标识符来自所有块，放在最后使全部引用变为
   正向（此前在中间块，是 UI 簇 7 条同层逆层对的主源）。__TEST_GATE__ 变量本体留在
   本块原位（dsEnhance 等启动期读 window.__TEST_GATE__ 的时序不能变）。 */
