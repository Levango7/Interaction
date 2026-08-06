// ===== UI Layer (交互层·设置抽屉) =====
/* ---------- 设置抽屉 ---------- */
/* 渲染单个链行（含启用 toggle、源图标、关键词、→、目标图标、目标名、删除按钮） */
function _renderChainRow(l){
  const sc = SCENARIOS[l.fromSc] || {name:"?", icon:""};
  const dc = SCENARIOS[l.toSc] || {name:"?", icon:""};
  const disabled = l.enabled === false;
  return `<div class="chain-row${disabled?" disabled":""}" data-id="${esc(l.id)}">
    <input type="checkbox" class="chain-toggle" data-id="${esc(l.id)}" style="width:auto" ${disabled?"":"checked"} aria-label="启用/禁用">
    <span class="chain-ic" style="color:var(--sc-${esc(l.fromSc)},var(--accent))">${sc.icon||""}</span>
    <span class="chain-kw" data-edit-kw="${esc(l.id)}" title="点击编辑关键词">${esc(l.kw||"")}</span>
    <span class="chain-arr">→</span>
    <span class="chain-ic" style="color:var(--sc-${esc(l.toSc)},var(--accent))" data-edit-dst="${esc(l.id)}" title="点击编辑目标场景">${dc.icon||""}</span>
    <span class="chain-dst">${esc(dc.name)}</span>
    <button type="button" class="chain-del" data-del="${esc(l.id)}" aria-label="删除链">×</button>
  </div>`;
}
/* 渲染链编辑行（inline edit：关键词 input + 目标场景 select + 保存/取消） */
function _renderChainEditRow(l){
  const opts = ORDER.map(sc=>`<option value="${sc}"${sc===l.toSc?" selected":""}>${esc(SCENARIOS[sc].name)}</option>`).join("");
  return `<div class="chain-edit-row" data-edit-id="${esc(l.id)}">
    <span class="chain-ic" style="color:var(--sc-${esc(l.fromSc)},var(--accent))">${(SCENARIOS[l.fromSc]||{}).icon||""}</span>
    <input class="chain-edit-kw" value="${esc(l.kw||"")}" placeholder="关键词">
    <span class="chain-arr">→</span>
    <select class="chain-edit-dst">${opts}</select>
    <button type="button" class="chain-save" data-save="${esc(l.id)}" aria-label="保存">✓</button>
    <button type="button" class="chain-cancel" data-cancel="${esc(l.id)}" aria-label="取消">✕</button>
  </div>`;
}
/**
 * 渲染习惯链管理面板：链列表 + 添加表单下拉填充
 * @returns {void}
 */
function renderLinksBox(){
  const box=$("#linksBox"); if(!box) return;
  const links=getLinks();
  box.innerHTML = links.map(l=>_renderChainRow(l)).join("");
  // 填充添加表单的下拉（仅首次填充，避免覆盖用户选择）
  const selSrc = $("#chainAddSrc"), selDst = $("#chainAddDst");
  if(selSrc && !selSrc.options.length) selSrc.innerHTML = ORDER.map(sc=>`<option value="${sc}">${esc(SCENARIOS[sc].name)}</option>`).join("");
  if(selDst && !selDst.options.length) selDst.innerHTML = ORDER.map(sc=>`<option value="${sc}">${esc(SCENARIOS[sc].name)}</option>`).join("");
}
/* 把当前 active profile 的字段填入表单（name/base/key/model） */
function fillProfileForm(p){
  $("#cfgName").value = (p && p.name) || "";
  $("#cfgBase").value = (p && p.base) || "https://api.openai.com/v1";
  $("#cfgKey").value = (p && p.key) || "";
  $("#cfgModel").value = (p && p.model) || "gpt-4o-mini";
}
/* 渲染 profile 下拉选择器（列出所有 profile，选中 activeId） */
function renderProfileSelect(){
  const cfg = getCfg();
  const sel = $("#cfgProfileSelect");
  const profiles = (cfg && Array.isArray(cfg.profiles)) ? cfg.profiles : [];
  sel.innerHTML = profiles.length
    ? profiles.map(p=>`<option value="${esc(p.id)}">${esc(p.name || "未命名")}</option>`).join("")
    : `<option value="">（无 Profile）</option>`;
  const ap = getActiveProfile();
  sel.value = ap ? ap.id : "";
  // 删除按钮：只剩 1 个时禁用
  const delBtn = $("#cfgProfileDel");
  if(delBtn) delBtn.disabled = profiles.length <= 1;
}
/**
 * 打开设置抽屉：填充表单、渲染 profile 选择器与联动规则、更新 Agent 状态
 * @returns {void}
 */
function openDrawer(){ const cfg=getCfg();
  $("#cfgEnabled").checked=!!cfg.enabled;
  $("#cfgAgent").checked = cfg.agent!==false; // 默认开启（cfg.agent 未定义时视为开）
  const notifyCb=$("#cfgNotify"); if(notifyCb) notifyCb.checked=getNotifyEnabled();
  const thSel=$("#cfgTheme"); if(thSel) thSel.value = (cfg.theme==="light"||cfg.theme==="dark") ? cfg.theme : "system";
  const rpSel=$("#cfgRecyclePolicy"); if(rpSel) rpSel.value = getRecyclePolicy();
  renderProfileSelect();
  fillProfileForm(getActiveProfile());
  const hint=$("#cfgKeyHint"); if(hint) hint.style.display="none";
  renderLinksBox();
  updateAgentStatus();
  const ar=$("#autoLaunchRow");
  if(isElectron() && ar){
    ar.style.display="flex";
    window.electronAPI.getAutoLaunch().then(on=>{ const cb=$("#cfgAutoLaunch"); if(cb) cb.checked=!!on; })
      .catch(()=>{ ar.style.display="none"; });
    // 主进程保管 Key：显示已保存提示，输入留空（空值保存=保留既有）
    window.electronAPI.getAiConfig().then(c=>{
      if(c && c.keySet && hint){ hint.style.display="block"; $("#cfgKey").placeholder="已保存（主进程保管）"; }
    }).catch(()=>{});
  }
  $("#drawer").classList.add("open"); $("#overlay").classList.add("show"); }
function closeDrawer(){ $("#drawer").classList.remove("open"); $("#overlay").classList.remove("show"); }
/* 切换 active profile：更新 cfg.activeId 并重新填表单（不保存，用户点「保存设置」才落盘） */
function switchProfile(id){
  const cfg = getCfg();
  if(!cfg || !Array.isArray(cfg.profiles)) return;
  const p = cfg.profiles.find(x => x.id === id);
  if(!p) return;
  cfg.activeId = id;
  _cfgCache = cfg;
  fillProfileForm(p);
  renderProfileSelect();
}
/* 新建空 profile 并切换到它（不落盘，待用户保存） */
function newProfile(){
  const cfg = getCfg();
  const profiles = (cfg && Array.isArray(cfg.profiles)) ? cfg.profiles : [];
  const id = genProfileId();
  const p = { id, name: "新 Profile", base: "https://api.openai.com/v1", key: "", model: "gpt-4o-mini" };
  profiles.push(p);
  cfg.profiles = profiles;
  cfg.activeId = id;
  _cfgCache = cfg;
  fillProfileForm(p);
  renderProfileSelect();
}
/* 复制当前 active profile 为新 profile（深拷贝，新 id） */
function dupProfile(){
  const cfg = getCfg();
  if(!cfg || !Array.isArray(cfg.profiles)) return;
  const ap = getActiveProfile();
  if(!ap) return;
  const id = genProfileId();
  const p = { id, name: (ap.name || "副本") + " 副本", base: ap.base || "", key: ap.key || "", model: ap.model || "" };
  cfg.profiles.push(p);
  cfg.activeId = id;
  _cfgCache = cfg;
  fillProfileForm(p);
  renderProfileSelect();
}
/* 删除当前 active profile（至少保留 1 个） */
function delProfile(){
  const cfg = getCfg();
  if(!cfg || !Array.isArray(cfg.profiles) || cfg.profiles.length <= 1) return;
  const ap = getActiveProfile();
  if(!ap) return;
  if(!confirm("确定删除 Profile「"+(ap.name||"未命名")+"」？此操作点「保存设置」后生效。")) return;
  cfg.profiles = cfg.profiles.filter(p => p.id !== ap.id);
  cfg.activeId = cfg.profiles[0].id;
  _cfgCache = cfg;
  fillProfileForm(cfg.profiles[0]);
  renderProfileSelect();
}
/**
 * 保存设置：从表单构造 cfg，加密持久化，同步 links/autoLaunch/Electron Key
 * @returns {Promise<void>}
 */
async function saveCfg(){
  try{
    // 从表单构造 cfg：保留旧 cfg 的非 AI 字段（theme/links 等），更新 profiles[activeId] 与 enabled
    const old = getCfg() || {};
    const profiles = Array.isArray(old.profiles) ? old.profiles.slice() : [];
    const activeId = old.activeId || (profiles[0] && profiles[0].id) || "";
    const idx = profiles.findIndex(p => p.id === activeId);
    const formProfile = {
      id: activeId,
      name: $("#cfgName").value.trim() || "未命名",
      base: $("#cfgBase").value.trim(),
      key: $("#cfgKey").value.trim(),
      model: $("#cfgModel").value.trim()
    };
    if(idx >= 0){ profiles[idx] = Object.assign({}, profiles[idx], formProfile); }
    else { profiles.push(formProfile); }
    const cfg = Object.assign({}, old, {
      enabled: $("#cfgEnabled").checked,
      agent: $("#cfgAgent").checked,
      profiles,
      activeId
    });
    // T4：主题三态持久化（light/dark/system）
    const thSel=$("#cfgTheme"); if(thSel) cfg.theme = thSel.value;
    // 清掉可能残留的旧单 cfg 字段（已迁入 profiles）
    delete cfg.base; delete cfg.key; delete cfg.model;
    _cfgCache = cfg;
    try{ await persistCfg(cfg); }
    catch(e){
      // D4：持久化失败兜底——浏览器态绝不写明文 Key，剥离后保存非敏感配置并告警
      if(isElectron()){ const rest = Object.assign({}, cfg); save(PREFIX+"cfg", rest); }
      else {
        const safe = Object.assign({}, cfg);
        if(Array.isArray(safe.profiles)) safe.profiles = safe.profiles.map(p=>Object.assign({},p,{key:""}));
        if(typeof safe.key === "string") delete safe.key;
        save(PREFIX+"cfg", safe);
        try{ toast("⚠ 加密持久化失败，AI Key 未保存（安全起见已丢弃）。", "warn"); }catch(e2){ /* noop */ }
      }
    }
    // T3.2：同步链启用状态（chain-toggle 实时已保存，此处兜底处理旧 lk_ id 与新 chain-toggle）
    const links=getLinks();
    links.forEach(l=>{
      const cb=$("#lk_"+l.id) || document.querySelector('.chain-toggle[data-id="'+l.id+'"]');
      if(cb) l.enabled=cb.checked;
    });
    save(PREFIX+"links", links);
    // T2：回收站自动清理策略即时生效（独立于 cfg，单独键存储）
    const rpSel=$("#cfgRecyclePolicy"); if(rpSel) setRecyclePolicy(rpSel.value);
    if(isElectron()){
      const al=$("#cfgAutoLaunch");
      if(al) window.electronAPI.setAutoLaunch(al.checked);
      // Key 交给主进程保管（空值=保留既有），base/model/enabled 同步过去（P0-3）
      const ap = getActiveProfile();
      try{ await window.electronAPI.setAiConfig({
        base: (ap && ap.base) || "", model: (ap && ap.model) || "", enabled: !!cfg.enabled,
        key: (ap && ap.key) || undefined }); }catch(e){ /* 忽略 */ }
    }
    alert("已保存"+(cfg.enabled?"，AI 助手已启用（可调用工具）":"（AI 未启用）"));
    applyTheme(); // T4：主题变更（含跟随系统）立即生效
    closeDrawer(); render();
  }catch(e){
    // 保存异常：诊断 + 提示，不让设置面板卡死
    pushDiag("error", "saveCfg error: "+(e&&e.message||e), {where:"saveCfg"});
    try{ toast("保存失败："+(e&&e.message||"未知错误"), "error"); }catch(e2){ /* toast 不可用时静默降级 */ }
  }
}

