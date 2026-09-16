// ===== UI Layer (交互层·设置抽屉) =====
/* ---------- 设置抽屉 ---------- */
/* 渲染单个链行（含启用 toggle、源图标、关键词、→、目标图标、目标名、删除按钮） */
function _renderChainRow(l){
  const sc = SCENARIOS[l.fromSc] || {name:"?", icon:""};
  const dc = SCENARIOS[l.toSc] || {name:"?", icon:""};
  const disabled = l.enabled === false;
  return `<div class="chain-row${disabled?" disabled":""}" data-id="${esc(l.id)}">
    <input type="checkbox" class="chain-toggle" data-id="${esc(l.id)}" ${disabled?"":"checked"} aria-label="${t("op.toggleEnable","启用/禁用")}">
    <span class="chain-ic" style="color:var(--sc-${esc(l.fromSc)},var(--accent))">${sc.icon||""}</span>
    <span class="chain-kw" data-edit-kw="${esc(l.id)}" title="${t("aria.editKeyword","点击编辑关键词")}">${esc(l.kw||"")}</span>
    <span class="chain-arr">→</span>
    <span class="chain-ic" style="color:var(--sc-${esc(l.toSc)},var(--accent))" data-edit-dst="${esc(l.id)}" title="${t("aria.editTargetScene","点击编辑目标场景")}">${dc.icon||""}</span>
    <span class="chain-dst">${esc(dc.name)}</span>
    <button type="button" class="chain-del" data-del="${esc(l.id)}" aria-label="${t("action.deleteChain","删除链")}">✕</button>
  </div>`;
}
/* 渲染链编辑行（inline edit：关键词 input + 目标场景 select + 保存/取消） */
function _renderChainEditRow(l){
  const opts = ORDER.map(sc=>`<option value="${sc}"${sc===l.toSc?" selected":""}>${esc(SCENARIOS[sc].name)}</option>`).join("");
  return `<div class="chain-edit-row" data-edit-id="${esc(l.id)}">
    <span class="chain-ic" style="color:var(--sc-${esc(l.fromSc)},var(--accent))">${(SCENARIOS[l.fromSc]||{}).icon||""}</span>
    <input class="chain-edit-kw" value="${esc(l.kw||"")}" placeholder="${t("field.keyword","关键词")}">
    <span class="chain-arr">→</span>
    <select class="chain-edit-dst">${opts}</select>
    <button type="button" class="chain-save" data-save="${esc(l.id)}" aria-label="${t("common.save","保存")}">✓</button>
    <button type="button" class="chain-cancel" data-cancel="${esc(l.id)}" aria-label="${t("common.cancel","取消")}">✕</button>
  </div>`;
}
/**
 * 渲染联动规则面板：规则列表 + 添加表单下拉填充
 * @returns {void}
 */
function renderLinksBox(){
  const box=$("#linksBox"); if(!box) return;
  const links=getLinks();
  box.innerHTML = sanitizeHtml(links.map(l=>_renderChainRow(l)).join(""));
  // 填充添加表单的下拉（仅首次填充，避免覆盖用户选择）
  const selSrc = $("#chainAddSrc"), selDst = $("#chainAddDst");
  if(selSrc && !selSrc.options.length) selSrc.innerHTML = sanitizeHtml(ORDER.map(sc=>`<option value="${sc}">${esc(SCENARIOS[sc].name)}</option>`).join(""));
  if(selDst && !selDst.options.length) selDst.innerHTML = sanitizeHtml(ORDER.map(sc=>`<option value="${sc}">${esc(SCENARIOS[sc].name)}</option>`).join(""));
}
/* P1：场景变更后强制刷新联动规则表单的场景下拉（含自定义场景） */
function refreshChainScSelects(){
  const opts = ORDER.map(sc=>`<option value="${sc}">${esc(SCENARIOS[sc].name)}</option>`).join("");
  const selSrc = $("#chainAddSrc"), selDst = $("#chainAddDst");
  if(selSrc) selSrc.innerHTML = sanitizeHtml(opts);
  if(selDst) selDst.innerHTML = sanitizeHtml(opts);
}
/* ---------- P1：场景管理面板（设置抽屉） ---------- */
const ICON_LABELS = { tag:t("task.tags","标签"), overview:t("icon.overview","总览"), plus:t("icon.plus","加号"), check:t("icon.check","对勾"), chat:t("icon.chat","对话"), download:t("icon.download","下载"), upload:t("icon.upload","上传"), gear:t("icon.gear","齿轮"), theme:t("icon.moon","月亮"), stats:t("icon.barChart","柱状图"), copy:t("icon.copy","复制"), trash:t("icon.trash","垃圾桶") };
function renderScBox(){
  const box=$("#scBox"); if(!box) return;
  const ov = loadScOverrides();
  const builtinRows = BUILTIN_SC_KEYS.map(k=>{
    const s = SCENARIOS[k], o = ov[k]||{};
    const overridden = o.name || o.color;
    return `<div class="chain-row" data-sc="${esc(k)}">
      <span class="chain-ic" style="color:${s.color}">${s.icon||""}</span>
      <input class="sc-edit-name" value="${esc(s.name)}" maxlength="12" aria-label="${t("field.scenarioName","场景名称")}" class="u-max-w-90">
      <input class="sc-edit-color" type="color" value="${esc(/^#[0-9a-fA-F]{6}$/.test(s.color)?s.color:scenarioDefaultColor())}" aria-label="${t("field.scenarioColor","场景颜色")}">
      <button type="button" class="chain-save sc-save" data-scsave="${esc(k)}" aria-label="${t("action.saveRenameColor","保存改名换色")}">✓</button>
      ${overridden?`<button type="button" class="chain-cancel sc-reset" data-screset="${esc(k)}" aria-label="${t("action.restoreDefault","恢复默认")}">${t("common.restore","恢复")}</button>`:""}
    </div>`;
  }).join("");
  const customRows = loadCustomScenarios().map(cs=>{
    const s = SCENARIOS[cs.key]||{};
    return `<div class="chain-row" data-sc="${esc(cs.key)}">
      <span class="chain-ic" style="color:${s.color||"var(--muted)"}">${s.icon||""}</span>
      <input class="sc-edit-name" value="${esc(cs.name)}" maxlength="12" aria-label="${t("field.scenarioName","场景名称")}" class="u-max-w-90">
      <input class="sc-edit-color" type="color" value="${esc(/^#[0-9a-fA-F]{6}$/.test(cs.color)?cs.color:scenarioDefaultColor())}" aria-label="${t("field.scenarioColor","场景颜色")}">
      <span class="chain-arr u-fs-2xs u-text-muted">${t("scene.customLabel","自定义")}</span>
      <button type="button" class="chain-save sc-save" data-scsave="${esc(cs.key)}" aria-label="${t("common.save","保存")}">✓</button>
      <button type="button" class="chain-del sc-del" data-scdel="${esc(cs.key)}" aria-label="${t("action.deleteScenario","删除场景")}">✕</button>
    </div>`;
  }).join("");
  /* v2.0.3：插件场景行——与侧栏 ORDER 对齐（此前只渲染内置+自定义，启用笃行/阅读等
     插件场景后侧栏 6 个、设置卡仍 4 个）。插件场景随插件启停，不提供改名/换色/删除 */
  const pluginRows = Object.keys(getPluginScenarios()).map(key=>{
    const s = SCENARIOS[key]||{};
    return `<div class="chain-row" data-sc="${esc(key)}">
      <span class="chain-ic" style="color:${s.color||"var(--muted)"}">${s.icon||""}</span>
      <input class="sc-edit-name" value="${esc(s.name||key)}" maxlength="12" aria-label="${t("field.scenarioName","场景名称")}" disabled class="u-max-w-90">
      <span class="chain-arr u-fs-2xs u-text-muted">${t("scene.pluginLabel","插件")}</span>
    </div>`;
  }).join("");
  box.innerHTML = sanitizeHtml(builtinRows + customRows + pluginRows);
  // 图标下拉填充（仅首次）
  const iconSel = $("#scAddIcon");
  if(iconSel && !iconSel.options.length) iconSel.innerHTML = sanitizeHtml(CUSTOM_ICON_KEYS.map(k=>`<option value="${k}">${esc(ICON_LABELS[k]||k)}</option>`).join(""));
  // 颜色选择器默认值从令牌填充（仅首次）
  const addColor = $("#scAddColor");
  if(addColor && !addColor.value) addColor.value = scenarioDefaultColor();
  // 事件绑定
  box.querySelectorAll(".sc-save").forEach(b=> b.onclick=()=>{
    const row = b.closest(".chain-row"), key = row.getAttribute("data-sc");
    const nameEl = row.querySelector(".sc-edit-name"), colorEl = row.querySelector(".sc-edit-color");
    if(!nameEl || !colorEl) return; // 防御：DOM 结构与模板不一致时静默跳过
    const name = nameEl.value;
    const color = colorEl.value;
    const r = BUILTIN_SC_KEYS.includes(key)
      ? setBuiltinOverride(key, {name, color})
      : updateCustomScenario(key, {name, color});
    if(!r.ok){ toast(r.err||t("msg.saveFailed","保存失败"),"warn"); return; }
    toast(t("msg.scenarioUpdated","场景已更新"),"ok"); openDrawerRefresh();
  });
  box.querySelectorAll(".sc-reset").forEach(b=> b.onclick=()=>{
    const key = b.closest(".chain-row").getAttribute("data-sc");
    resetBuiltinOverride(key); toast(t("msg.restoredDefault","已恢复默认"),"ok"); openDrawerRefresh();
  });
  box.querySelectorAll(".sc-del").forEach(b=> b.onclick=()=>{
    const key = b.closest(".chain-row").getAttribute("data-sc");
    if(!confirm(t("confirm.deleteScenario","确定删除该场景？（场景下有任务时不可删除）"))) return;
    const r = removeCustomScenario(key);
    if(!r.ok){ toast(r.err||t("msg.deleteFailed","删除失败"),"warn"); return; }
    toast(t("msg.scenarioDeleted","场景已删除"),"ok"); openDrawerRefresh();
  });
  const addBtn=$("#scAddBtn"); if(addBtn) addBtn.onclick=()=>{
    const name = $("#scAddName").value, color = $("#scAddColor").value, iconKey = $("#scAddIcon").value;
    const r = addCustomScenario(name, color, iconKey);
    if(!r.ok){ toast(r.err||t("msg.addFailed","添加失败"),"warn"); return; }
    $("#scAddName").value = "";
    toast(t("msg.scenarioAdded","已添加场景"),"ok"); openDrawerRefresh();
  };
}
/* 设置页面打开中的自刷新：重填场景面板 + 链下拉，保留设置页面打开状态
 * v1.9：设置改为正常页面后，不能调用 render()（会把 #drawer 移回原位置关闭设置页面），
 * 只刷新侧栏（场景列表）即可，设置面板内的 scBox/linksBox 已由 renderScBox/refreshChainScSelects 重填 */
function openDrawerRefresh(){
  renderScBox(); refreshChainScSelects();
  try{ renderSide(); }catch(e){ /* noop */ }
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
  sel.innerHTML = sanitizeHtml(profiles.length
    ? profiles.map(p=>`<option value="${esc(p.id)}">${esc(p.name || t("common.notNamed","未命名"))}</option>`).join("")
    : `<option value="">（无 Profile）</option>`);
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
  // P9：免打扰时段控件回填（小时下拉 0-23，仅首次填充）
  const qStart=$("#cfgQuietStart"), qEnd=$("#cfgQuietEnd");
  if(qStart && !qStart.options.length) qStart.innerHTML = sanitizeHtml(Array.from({length:24},(_,h)=>`<option value="${h}">${pad(h)}:00</option>`).join(""));
  if(qEnd && !qEnd.options.length) qEnd.innerHTML = sanitizeHtml(Array.from({length:24},(_,h)=>`<option value="${h}">${pad(h)}:00</option>`).join(""));
  const q=getQuietHours();
  if($("#cfgQuiet")) $("#cfgQuiet").checked=!!q.enabled;
  if(qStart) qStart.value=String(q.start);
  if(qEnd) qEnd.value=String(q.end);
  const thSel=$("#cfgTheme"); if(thSel){
    // v1.5-C：主题选择支持 light/dark/system/aurora/sepia/elegant/matrix + 自定义主题（contrast 已于 v3.1.1 移除）
    const curTheme = (typeof getCurrentTheme === "function") ? getCurrentTheme() : (cfg.theme || "system");
    thSel.value = curTheme;
  }
  const rpSel=$("#cfgRecyclePolicy"); if(rpSel) rpSel.value = getRecyclePolicy();
  // v1.5-A：语言切换回填（从 i18n 模块读取当前语言）
  const langSel=$("#cfgLang"); if(langSel) langSel.value = getLang();
  // B8：AI 请求参数回填（空 = 使用默认值 30s / 0.7）
  const toInp=$("#cfgAiTimeout"); if(toInp) toInp.value = (cfg.aiTimeoutSec!==undefined && isFinite(Number(cfg.aiTimeoutSec))) ? String(cfg.aiTimeoutSec) : "";
  const teInp=$("#cfgAiTemperature"); if(teInp) teInp.value = (cfg.aiTemperature!==undefined && isFinite(Number(cfg.aiTemperature))) ? String(cfg.aiTemperature) : "";
  // R5：工作记忆容量回填（空 = 默认 60）
  const mmInp=$("#cfgMemMax"); if(mmInp) mmInp.value = (cfg.memMax!==undefined && isFinite(Number(cfg.memMax))) ? String(cfg.memMax) : "";
  const agLoopsInp=$("#cfgAgentLoops"); if(agLoopsInp) agLoopsInp.value = (cfg.agentLoops!==undefined && isFinite(Number(cfg.agentLoops))) ? String(cfg.agentLoops) : "";
  const agGoalLoopsInp=$("#cfgAgentGoalLoops"); if(agGoalLoopsInp) agGoalLoopsInp.value = (cfg.agentGoalLoops!==undefined && isFinite(Number(cfg.agentGoalLoops))) ? String(cfg.agentGoalLoops) : "";
  const twInp=$("#cfgToolWhitelist"); if(twInp) twInp.value = cfg.toolWhitelist||"";
  const acInp=$("#cfgAgentAutoConfirm"); if(acInp) acInp.checked = cfg.agentAutoConfirm!==false;
  // v1.15：场景 sysprompt 编辑器回填（选择器填充 + 当前场景文本加载）
  const spSel=$("#cfgSyspromptScene");
  if(spSel){
    spSel.innerHTML = sanitizeHtml(ORDER.map(sc=>
      `<option value="${esc(sc)}">${esc(SCENARIOS[sc]?.name || sc)}</option>`
    ).join(""));
    spSel.value = active;
    const spTa=$("#cfgSysprompt"); if(spTa) spTa.value = getCustomSysprompts()[active] || "";
    spSel.onchange = function(){
      const sc = spSel.value;
      const ta=$("#cfgSysprompt"); if(ta) ta.value = getCustomSysprompts()[sc] || "";
    };
  }
  const spReset=$("#btnSyspromptReset");
  if(spReset) spReset.onclick = function(){
    const sc = (spSel && spSel.value) || active;
    setCustomSysprompt(sc, "");
    const ta=$("#cfgSysprompt"); if(ta) ta.value = "";
    try{ toast(t("sysprompt.restoredPrefix","已恢复「")+(SCENARIOS[sc]?.name||sc)+t("sysprompt.restoredSuffix","」默认提示词"), "ok"); }catch(e){}
  };
  renderScBox();
  renderProfileSelect();
  fillProfileForm(getActiveProfile());
  const hint=$("#cfgKeyHint"); if(hint) hint.style.display="none";
  renderLinksBox();
  // v1.5-B 渲染插件市场面板
  try{ renderPluginBox(); }catch(e){ /* noop */ }
  // v1.5-C 渲染主题编辑器面板（自定义主题列表 + 场景配色）
  try{ renderThemeEditor(); }catch(e){ /* noop */ }
  updateAgentStatus();
  const ar=$("#autoLaunchRow");
  if(isElectron() && ar){
    ar.style.display="flex";
    window.electronAPI.getAutoLaunch().then(on=>{ const cb=$("#cfgAutoLaunch"); if(cb) cb.checked=!!on; })
      .catch(()=>{ ar.style.display="none"; });
    // 主进程保管 Key：显示已保存提示，输入留空（空值保存=保留既有）
    window.electronAPI.getAiConfig().then(c=>{
      // F3：按激活 profile 查 keySet（主进程返回 profiles 数组）
      const list = (c && Array.isArray(c.profiles)) ? c.profiles : [];
      const ap = getActiveProfile();
      const mine = ap && list.find(x => x.id === ap.id);
      if(mine && mine.keySet && hint){ hint.style.display="block"; $("#cfgKey").placeholder=t("cfg.keySavedInMain","已保存（主进程保管）"); }
    }).catch(()=>{});
  }
  /* v1.9：设置从侧边栏抽屉改为正常页面——把 #drawer 移到 .main-wrap 里，加 .drawer-page class
     覆盖原 fixed 抽屉样式，铺满 main-wrap；隐藏 #main（避免并排显示）。
     保留 #drawer.classList.add("open") 以兼容现有测试（round4-batch1 断言 .open 类）。 */
  uiView = "settings"; // v1.9.3g：显式视图状态，侧栏高亮据此渲染（弃 DOM 嗅探）
  _showDrawerPage("settings");
}
/* v1.9.6：drawer 三页共用视图切换（settings / ai / plugin）——
   移入 main-wrap + data-page 控制页头与分区卡显示 + 重置滚动 + 尾栏 + 侧栏高亮 */
function _showDrawerPage(page){
  _moveDrawerToMainWrap();
  const d = $("#drawer");
  if(!d) return;
  d.dataset.page = page;
  d.classList.add("open");
  d.scrollTop = 0; // 滚动容器是 .drawer-page 自身，切页重置避免残留
  /* v1.9.1：设置页面底部追加尾栏（与 #main 各页面保持一致）。
     appendFoot() 默认往 #main 追加，但设置页面 #main 已隐藏，需往 #drawer 追加。
     幂等：先移除已有 .foot 再追加。 */
  _appendDrawerFoot();
  const _help = $("#helpPage"); if(_help) _help.remove();
  renderSide(); // 更新侧边栏高亮（uiView 状态驱动）
}
/* v1.9.6：AI 配置独立菜单页——表单回填与设置页共用（saveCfg 按 ID 读值，display 不影响） */
function openAiPage(){
  openDrawer();      // 复用表单回填（profile 表单 / Key hint / Electron 状态）
  uiView = "ai";
  _showDrawerPage("ai");
}
/* v1.9.6：插件市场独立菜单页——renderPluginBox 重渲染插件列表后切页 */
function openPluginPage(){
  try{ renderPluginBox(); }catch(e){ /* noop */ }
  uiView = "plugin";
  _showDrawerPage("plugin");
}
/* v1.15：知识独立菜单页——内容与知识从设置页抽离（场景模板 + 笔记 + 知识库 + 全文搜索） */
function openKnowledgePage(){
  uiView = "knowledge";
  _showDrawerPage("knowledge");
  renderSide(); // 同步侧栏高亮（uiView 已更新）
}
/* 往 #drawer 末尾追加尾栏（设置页面专用，与 appendFoot 结构一致——3列：应用信息+待办统计+AI状态） */
function _appendDrawerFoot(){
  const drawer = $("#drawer"); if(!drawer) return;
  const existing = drawer.querySelector(":scope > .foot");
  if(existing) existing.remove();
  const footEl = document.createElement("div");
  footEl.className = "foot";
  const cfg = getCfg();
  const ap = getActiveProfile();
  const model = (ap && ap.model) ? ap.model : "";
  const tasks = getTasks().filter(function(t){ return !t.deletedAt; });
  const openN = tasks.filter(function(t){ return t.status!=="done"; }).length;
  let recN = 0; try{ Object.keys(SCENARIOS).forEach(function(sc){ recN += getRec(sc).length; }); }catch(e){}
  const aiOn = !!(cfg && cfg.enabled);
  const aiTxt = aiOn ? (model ? (t("status.aiConnectedDot","AI 已连接 · ") + esc(model)) : t("status.aiConnected","AI 已连接")) : t("status.aiDisabled","AI 未启用"); // v3.1.2：model 为用户输入，esc 防注入（与 appendFoot 同步）
  footEl.innerHTML = '<div class="foot-bar">' +
    '<span class="foot-id">' + esc(t("app.name")) + ' · v' + VERSION + ' · b' + BUILD_TAG + '</span>' +
    t("p4.html.footStatTodo","<span class=\"foot-stat\">待办 ") + openN + t("stat.recordsMid"," · 资料 ") + recN + t("p4.html.footStatSuffix"," 条</span>") +
    '<span class="foot-ai ' + (aiOn ? 'on' : 'off') + '">' + (aiOn ? '\u25CF' : '\u25CB') + ' ' + aiTxt + '</span>' +
    '</div>';
  drawer.appendChild(footEl);
}
/* 把 #drawer 移到 .main-wrap 里（设置页面铺满 main-wrap），隐藏 #main */
function _moveDrawerToMainWrap(){
  const drawer = $("#drawer");
  const mainWrap = document.querySelector(".main-wrap");
  const main = $("#main");
  if(!drawer || !mainWrap || !main) return;
  if(drawer.parentNode !== mainWrap){
    mainWrap.appendChild(drawer);
  }
  drawer.classList.add("drawer-page");
  main.style.display = "none";
  _enforceDrawerWidth();
}
/* 把 #drawer 移回原位置（#overlay 之后），恢复 #main 显示 */
/**
 * v3.6.0：清理 drawer 页（AI/设置/插件/知识）上的旧内联宽度/边距。
 * 宽度统一已回归 CSS（.drawer-page 铺满 + 子级 max-width:var(--content-max)，与 .main > * 同规则）；
 * 本函数只负责抹掉 v3.5.7~v3.5.8 期间写入的内联样式，避免与 CSS 打架。
 * @returns {void}
 */
/* ---------- v3.6.0 图片输入：选图后显示文件名与缩略图 ---------- */
document.addEventListener("change", function (e) {
  var inp = e.target;
  if (!inp || !inp.matches || !inp.matches("[data-rec-img]")) return;
  var box = inp.closest ? inp.closest(".img-pick") : null;
  if (!box) return;
  var nameEl = box.querySelector("[data-img-name]");
  var prev = box.querySelector(".img-preview");
  if (prev) prev.remove();
  var f = inp.files && inp.files[0];
  if (!f) { if (nameEl) nameEl.textContent = t("field.noImage", "未选择"); return; }
  if (nameEl) nameEl.textContent = f.name + " · " + Math.max(1, Math.round(f.size / 1024)) + " KB";
  var img = document.createElement("img");
  img.className = "img-preview";
  img.alt = "";
  var _put = function (url, revoke) {
    img.onload = function () { if (revoke) setTimeout(function () { try { URL.revokeObjectURL(url); } catch (_) {} }, 8000); };
    img.src = url;
    box.appendChild(img);
  };
  var url = null;
  try { url = URL.createObjectURL(f); } catch (_) { url = null; }
  if (url) { _put(url, true); return; }
  // createObjectURL 不可用时退回 FileReader（老内核 / 受限环境）
  try {
    var fr = new FileReader();
    fr.onload = function () { _put(String(fr.result), false); };
    fr.readAsDataURL(f);
  } catch (_) {}
});

/* ---------- v3.5.7 自建下拉：拦截 select 点击，渲染统一风格面板 ---------- */
var _selPanel = null, _selTarget = null;
function _closeSelPanel(){ if(_selPanel){ try{ _selPanel.remove(); }catch(_){} _selPanel = null; _selTarget = null; } }
function _openSelPanel(sel){
  _closeSelPanel();
  var rect = sel.getBoundingClientRect();
  var panel = document.createElement("div");
  panel.className = "sel-panel";
  Array.prototype.forEach.call(sel.options, function(opt){
    var it = document.createElement("button");
    it.type = "button";
    it.className = "sel-item" + (opt.selected ? " is-sel" : "");
    it.textContent = opt.textContent;
    it.onclick = function(){
      sel.value = opt.value;
      try{ sel.dispatchEvent(new Event("change", { bubbles: true })); }catch(_){}
      _closeSelPanel();
    };
    panel.appendChild(it);
  });
  document.body.appendChild(panel);
  /* v3.6.4：面板自身不可滚动时吞掉滚轮。否则滚轮会穿透到页面并触发页面 scroll，
     而下面的 scroll 监听会把面板关掉——用户感受同样是"一滚就收起"。
     面板可滚动时不动它，让它正常滚动（面板自身的 scroll 已被上面的监听排除）。 */
  panel.addEventListener("wheel", function(e){
    var canScroll = panel.scrollHeight > panel.clientHeight + 1;
    if(!canScroll){ e.preventDefault(); }
  }, { passive: false });
  var w = Math.max(rect.width, 140);
  panel.style.minWidth = w + "px";
  panel.style.maxWidth = "min(360px, 92vw)";
  var left = Math.min(rect.left, Math.max(8, window.innerWidth - panel.offsetWidth - 8));
  panel.style.left = left + "px";
  var top = rect.bottom + 4;
  if(top + panel.offsetHeight > window.innerHeight - 8){
    top = Math.max(8, rect.top - panel.offsetHeight - 4);
  }
  panel.style.top = top + "px";
  _selPanel = panel; _selTarget = sel;
}
document.addEventListener("mousedown", function(e){
  var el = e.target;
  if(el && el.tagName === "SELECT"){ e.preventDefault(); _openSelPanel(el); return; }
  if(_selPanel && !_selPanel.contains(el)) _closeSelPanel();
}, true);
document.addEventListener("keydown", function(e){ if(e.key === "Escape") _closeSelPanel(); });
try{
  window.addEventListener("resize", _closeSelPanel);
  /* v3.6.4 修复：滚动时关闭面板，但必须排除「面板自身内部滚动」。
     此前直接把 _closeSelPanel 挂成 scroll 的捕获监听（capture:true）——捕获阶段从 window 向下传播，
     连 .sel-panel 自己 overflow-y:auto 的内部滚动也会经过 window，于是选项超过 max-height:280px、
     面板一出现滚动条就会"一滚就把自己关掉"（用户表现为「鼠标滚轮滚动时下拉框会收起来」）。
     这里改为：滚动源在面板内部（或就是面板本身）时直接放行，其余滚动才关闭。 */
  window.addEventListener("scroll", function(e){
    if(_selPanel && (e.target === _selPanel || (_selPanel.contains && _selPanel.contains(e.target)))) return;
    _closeSelPanel();
  }, true);
}catch(_){}

function _enforceDrawerWidth(){
  try{
    const dr = document.getElementById("drawer");
    if(!dr || !dr.classList.contains("drawer-page")) return;
    /* v3.6.0：宽度统一改由 CSS 负责（.drawer-page 铺满 .main-wrap + 子级 max-width:var(--content-max)，
       与 .main > * 同规则）。此处只清理旧版本写下的内联宽度/边距，避免残留内联样式与 CSS 打架。 */
    ["width","maxWidth","marginLeft","marginRight","alignSelf","boxSizing","display","flexDirection","alignItems","overflow","overflowY"].forEach(function(p){ dr.style[p] = ""; });
    Array.prototype.forEach.call(dr.children, function(c){
      c.style.width = ""; c.style.maxWidth = ""; c.style.boxSizing = ""; c.style.flexShrink = "";
    });
  }catch(_){}
}
function _moveDrawerHome(){
  const drawer = $("#drawer");
  const overlay = $("#overlay");
  const main = $("#main");
  if(!drawer) return;
  drawer.classList.remove("drawer-page");
  if(main) main.style.display = "";
  if(overlay && drawer.parentNode !== overlay.parentNode){
    overlay.parentNode.insertBefore(drawer, overlay.nextSibling);
  }
}
function closeDrawer(){
  $("#drawer").classList.remove("open");
  delete $("#drawer").dataset.page; // v1.9.6：清掉子页标记，下次打开回到默认 settings 页头
  $("#overlay").classList.remove("show");
  _moveDrawerHome();
  render();
}
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
  const p = { id, name: t("profile.newName","新 Profile"), base: "https://api.openai.com/v1", key: "", model: "gpt-4o-mini" };
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
  const p = { id, name: (ap.name || t("profile.copyName","副本")) + t("profile.copySuffix"," 副本"), base: ap.base || "", key: ap.key || "", model: ap.model || "" };
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
  if(!confirm(t("profile.confirmDelete","确定删除 Profile「")+(ap.name||t("common.unnamed","未命名"))+t("profile.confirmDeleteSuffix","」？此操作点「保存设置」后生效。"))) return;
  // v3.1：接入回收站——保存被删除的 profile 快照
  try{
    addToRecycleBin("config",
      t("profile.recycleTitlePrefix","AI Profile：「")+(ap.name||t("common.unnamed","未命名"))+t("profile.recycleTitleSuffix","」"),
      t("profile.modelPrefix","模型 ")+(ap.model||t("common.unknown","未知"))+t("profile.basePrefix","，base ")+(ap.base||t("common.notSet","未设置")),
      { kind: "profile", profile: { id: ap.id, name: ap.name||t("common.unnamed","未命名"), base: ap.base||"", model: ap.model||"", key: "" } },
      t("profile.management","AI Profile 管理"));
  }catch(_){ /* 回收站写入失败不影响删除 */ }
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
      name: $("#cfgName").value.trim() || t("common.unnamed","未命名"),
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
    // T4：主题三态持久化（light/dark/system）。
    // v1.9.7：特殊主题（aurora/sepia/elegant/matrix/自定义）不写入 cfg.theme——它们由 setTheme 持久化到
    // localStorage.theme（boot 按此复原）；写入 cfg 会被 applyTheme 误读导致重启后被冲掉
    // v3.6.3 修复：白名单补 mist——此前漏项，选中「晓光晨雾」时 cfg.theme 不被写入（静默丢弃），
    // 表现为"选了又没了/重开复原"。
    const thSel=$("#cfgTheme");
    if(thSel && /^(light|dark|system|sepia|elegant|aurora|matrix|forest|ocean|mist)$/.test(thSel.value)) cfg.theme = thSel.value;
    // B8：AI 请求参数（超时秒数 / 温度）持久化；留空 = 用默认值（30s / 0.7），范围校验在 getAiParams 与主进程
    const toInp=$("#cfgAiTimeout"); if(toInp){ const v=toInp.value.trim(); if(v!=="" && isFinite(Number(v))) cfg.aiTimeoutSec=Number(v); else delete cfg.aiTimeoutSec; }
    const teInp=$("#cfgAiTemperature"); if(teInp){ const v=teInp.value.trim(); if(v!=="" && isFinite(Number(v))) cfg.aiTemperature=Number(v); else delete cfg.aiTemperature; }
    // R5：工作记忆容量持久化；留空 = 默认 60，范围校验在 getMemMax（20~500）
    const mmInp=$("#cfgMemMax"); if(mmInp){ const v=mmInp.value.trim(); if(v!=="" && isFinite(Number(v))) cfg.memMax=Number(v); else delete cfg.memMax; }
    // v2.4.0：Agent 循环上限、工具白名单、自动确认持久化
    const agLoopsInp=$("#cfgAgentLoops"); if(agLoopsInp){ const v=agLoopsInp.value.trim(); if(v!=="" && isFinite(Number(v))) cfg.agentLoops=Number(v); else delete cfg.agentLoops; }
    const agGoalLoopsInp=$("#cfgAgentGoalLoops"); if(agGoalLoopsInp){ const v=agGoalLoopsInp.value.trim(); if(v!=="" && isFinite(Number(v))) cfg.agentGoalLoops=Number(v); else delete cfg.agentGoalLoops; }
    const twInp=$("#cfgToolWhitelist"); if(twInp){ const v=twInp.value.trim(); cfg.toolWhitelist=v||undefined; if(!v) delete cfg.toolWhitelist; }
    const acInp=$("#cfgAgentAutoConfirm"); if(acInp) cfg.agentAutoConfirm=!!acInp.checked;
    // v1.15：保存当前场景自定义 sysprompt（空则恢复默认）
    const spTa=$("#cfgSysprompt");
    if(spTa){ setCustomSysprompt(active, spTa.value); }
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
        try{ toast(t("msg.encryptFailed","⚠️ 加密持久化失败，AI Key 未保存（安全起见已丢弃）。"), "warn"); }catch(e2){ /* noop */ }
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
    // P9：免打扰时段即时生效（独立于 cfg，单独键存储）
    setQuietHours({
      enabled: !!($("#cfgQuiet") && $("#cfgQuiet").checked),
      start: parseInt(($("#cfgQuietStart")&&$("#cfgQuietStart").value)||"22",10),
      end: parseInt(($("#cfgQuietEnd")&&$("#cfgQuietEnd").value)||"8",10)
    });
    if(isElectron()){
      const al=$("#cfgAutoLaunch");
      if(al) window.electronAPI.setAutoLaunch(al.checked);
      // F3：全量同步 profiles 到主进程（Key 空值=保留既有，base/model 随配置更新）
      // F4：对已删除的 profile 显式传 key:null，清除主进程残留 Key
      const profilesOut = cfg.profiles.map(p => ({ id: p.id, base: p.base || "", model: p.model || "", key: (p.id === activeId) ? (p.key || undefined) : undefined }));
      const removedIds = new Set((old.profiles || []).map(p => p.id));
      cfg.profiles.forEach(p => removedIds.delete(p.id));
      removedIds.forEach(id => profilesOut.push({ id, key: null }));
      try{ await window.electronAPI.setAiConfig({ enabled: !!cfg.enabled, profiles: profilesOut }); }catch(e){ /* 忽略 */ }
    }
    // v1.11.1 [L8]：首次启用 AI 时给出数据出境告知——AI 请求会把相关任务/资料上下文
    // 发送到用户配置的端点（默认 api.openai.com），此前无任何提示。
    if(cfg.enabled && !load(PREFIX+"ai_privacy_ack", null)){
      save(PREFIX+"ai_privacy_ack", Date.now());
      try{ toast(t("msg.aiPrivacyNotice","提示：启用 AI 后，相关任务/资料上下文将发送到你配置的 AI 端点（默认 api.openai.com）"), "warn"); }catch(e2){ /* noop */ }
    }
    toast(t("msg.saved","已保存")+(cfg.enabled?t("msg.savedAiEnabled","，AI 助手已启用（可调用工具）"):t("msg.savedAiDisabled","（AI 未启用）")), "ok"); // B3：alert 改 toast，不阻塞交互
    /* v3.2.1 修复 UX 闭环：检查是否有待续的「问 AI」意图，配置成功后自动展开 + 重试 */
    if(cfg.enabled && cfg.base && cfg.key){
      try{
        const raw = load(PREFIX + "__pendingAiAsk", null);
        if(raw){
          const pending = JSON.parse(raw);
          /* 5 分钟内有效——避免陈旧意图被误触发 */
          if(pending && pending.sc && Date.now() - (pending.ts || 0) < 5 * 60 * 1000){
            try{ localStorage.removeItem(PREFIX + "__pendingAiAsk"); }catch(e){ /* noop */ }
            /* 延后执行——让 closeDrawer 先跑完（面板可见性更新需要帧） */
            setTimeout(function(){
              try{ if(typeof window.__aiPanelExpand === "function"){ window.__aiPanelExpand(); } }catch(e){ /* noop */ }
              /* v3.2.1：pending.prompt 优先（AI Hub 卡片"在 AI 助手中讨论"会预填完整提示） */
              const ta = document.getElementById("chatTextInput");
              if(pending.prompt && ta){
                ta.value = pending.prompt;
                ta.focus();
                if(typeof ta.setSelectionRange==="function"){ ta.setSelectionRange(ta.value.length, ta.value.length); }
              } else {
                try{ askAiAboutScene(pending.sc, pending.hintKey); }catch(e){ /* noop */ }
              }
            }, 50);
          } else {
            try{ localStorage.removeItem(PREFIX + "__pendingAiAsk"); }catch(e){ /* noop */ }
          }
        }
      }catch(e){ /* JSON 解析失败 / 读取失败都吞掉，不影响主保存流程 */ }
    } else {
      try{ localStorage.removeItem(PREFIX + "__pendingAiAsk"); }catch(e){ /* noop */ }
    }
    applyTheme(); // T4：主题变更（含跟随系统）立即生效
    // v1.5-C：新主题系统（特殊主题/自定义）即时生效（contrast 主题已于 v3.1.1 移除）
    try{
      const thSel2 = $("#cfgTheme");
      if(thSel2 && typeof setTheme === "function"){
        const v = thSel2.value;
        if(v === "sepia" || (v !== "light" && v !== "dark" && v !== "system")){
          setTheme(v);
        }
      }
    }catch(e){ /* noop */ }
    closeDrawer(); /* v1.9：closeDrawer 已内置 render()，无需再调用 */
  }catch(e){
    // 保存异常：诊断 + 提示，不让设置面板卡死
    pushDiag("error", "saveCfg error: "+(e&&e.message||e), {where:"saveCfg"});
    try{ toast(t("msg.saveFailedPrefix","保存失败：")+(e&&e.message||t("tool.unknownErrorMsg", "未知错误")), "error"); }catch(e2){ /* toast 不可用时静默降级 */ }
  }
}

// ===== v1.4-E 协作/分享：联动规则分享导入 + 场景模板一键导入 =====
/* ---------- 联动规则分享码生成与导入 ---------- */
/**
 * 生成联动规则分享码：将链数组 JSON 编码为 base64 字符串
 * @param {Link[]} links - 联动规则数组
 * @returns {string} 分享码字符串（base64 编码的 JSON）
 */
function generateChainShareCode(links){
  if(!Array.isArray(links)) return "";
  // 仅保留可分享字段，剥离内部 id 重新生成
  const clean = links.map(l => ({
    fromSc: l.fromSc || "",
    kw: l.kw || "",
    toSc: l.toSc || "",
    taskTitle: l.taskTitle || "",
    priority: l.priority || "P2",
    enabled: l.enabled !== false
  }));
  return _strToB64(JSON.stringify(clean));
}
/**
 * 解析联动规则分享码并导入（验证格式后保存到自定义链）
 * @param {string} code - 分享码字符串
 * @returns {{ok:boolean, err?:string, count?:number, links?:Link[]}} 导入结果
 */
function importChainShareCode(code){
  if(!code || typeof code !== "string") return {ok:false, err:t("chainShare.errEmpty","分享码不能为空")};
  let arr;
  try{
    const json = _b64ToStr(code.trim());
    arr = JSON.parse(json);
  }catch(e){ return {ok:false, err:t("chainShare.errFormat","分享码格式错误，无法解码")}; }
  if(!Array.isArray(arr) || arr.length === 0) return {ok:false, err:t("chainShare.errEmptyArray","分享码内容为空或非数组")};
  // 验证并重建每条链
  const validLinks = [];
  for(let i = 0; i < arr.length; i++){
    const l = arr[i];
    if(!l || typeof l !== "object") continue;
    if(!l.fromSc || !ORDER.includes(l.fromSc)) return {ok:false, err:t("common.ordinalPrefix","第")+(i+1)+t("chainShare.errInvalidFromSc","条链：无效的源场景「")+(l.fromSc||"")+t("chainShare.errScSuffix","」")};
    if(!l.toSc || !ORDER.includes(l.toSc)) return {ok:false, err:t("common.ordinalPrefix","第")+(i+1)+t("chainShare.errInvalidToSc","条链：无效的目标场景「")+(l.toSc||"")+t("chainShare.errScSuffix","」")};
    if(l.fromSc === l.toSc) return {ok:false, err:t("common.ordinalPrefix","第")+(i+1)+t("chainShare.errSameSc","条链：源场景与目标场景不能相同")};
    const kw = String(l.kw===null||l.kw===undefined?"":l.kw).trim();
    if(!kw) return {ok:false, err:t("common.ordinalPrefix","第")+(i+1)+t("chainShare.errEmptyKw","条链：关键词不能为空")};
    validLinks.push({
      id: uid(),
      name: (SCENARIOS[l.fromSc]&&SCENARIOS[l.fromSc].name||l.fromSc) + "→" + (SCENARIOS[l.toSc]&&SCENARIOS[l.toSc].name||l.toSc),
      fromSc: l.fromSc,
      kw: kw,
      toSc: l.toSc,
      taskTitle: l.taskTitle || (t("chain.defaultTaskTitle","奖励：") + kw),
      priority: ["P0","P1","P2"].includes(l.priority) ? l.priority : "P2",
      enabled: l.enabled !== false
    });
  }
  if(validLinks.length === 0) return {ok:false, err:t("chainShare.errNoValid","分享码中没有有效的联动规则")};
  saveCustomLinks(validLinks);
  return {ok:true, count: validLinks.length, links: validLinks};
}
/**
 * 打开联动规则分享弹窗（显示分享码文本框，可复制）
 * @returns {void}
 */
function openChainShareModal(){
  const links = getLinks();
  if(!links.length){ toast(t("chainShare.noLinks","暂无联动规则可分享"), "warn"); return; }
  const code = generateChainShareCode(links);
  const old = document.querySelector(".chain-share-modal");
  if(old) old.remove();
  const html = `<div class="chain-share-modal" id="chainShareModal">
    <div class="chain-share-dialog">
      <div class="chain-share-header">
        <h2><span class="ic-inline" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg></span>${t("chainShare.title","分享我的联动规则")}</h2>
        <button type="button" class="chain-share-close" id="chainShareClose" aria-label="${t("common.close","关闭")}">✕</button>
      </div>
      <div class="chain-share-body">
        <p class="hint">${t("chainShare.hintPrefix","将下方分享码发给他人，对方在设置中点「导入链」粘贴即可导入你的 ")}${links.length}${t("chainShare.hintSuffix"," 条联动规则。")}</p>
        <textarea id="chainShareCode" readonly rows="6" class="code-input u-break-all">${esc(code)}</textarea>
        <div class="u-flex u-mt-2 u-gap-2">
          <button type="button" class="addbtn u-flex-1" id="chainShareCopy" data-sc="accent">${t("chainShare.copyBtn","复制分享码")}</button>
        </div>
      </div>
    </div>
  </div>`;
  document.body.insertAdjacentHTML("beforeend", html);
  const close = ()=>{ const m = $("#chainShareModal"); if(m) m.remove(); };
  $("#chainShareClose").onclick = close;
  $("#chainShareModal").onclick = (e)=>{ if(e.target === $("#chainShareModal")) close(); };
  $("#chainShareCopy").onclick = ()=>{
    const ta = $("#chainShareCode");
    ta.select();
    navigator.clipboard.writeText(ta.value).then(()=> toast(t("chainShare.copied","分享码已复制到剪贴板"), "ok")).catch(()=> toast(t("chainShare.copyFailed","复制失败，请手动选择文本复制"), "warn"));
  };
}
/**
 * 打开联动规则导入弹窗（输入分享码，预览后确认导入）
 * @returns {void}
 */
function openChainImportModal(){
  const old = document.querySelector(".chain-import-modal");
  if(old) old.remove();
  const html = `<div class="chain-import-modal" id="chainImportModal">
    <div class="chain-share-dialog">
      <div class="chain-share-header">
        <h2><span class="ic-inline" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v10m0 0 4-4m-4 4-4-4M5 19h14"/></svg></span>${t("chainShare.importTitle","导入联动规则")}</h2>
        <button type="button" class="chain-share-close" id="chainImportClose" aria-label="${t("common.close","关闭")}">✕</button>
      </div>
      <div class="chain-share-body">
        <p class="hint">${t("chainShare.importHint","粘贴他人分享的联动规则分享码，点「预览」查看将导入的链，确认后点「导入」。")}</p>
        <textarea id="chainImportCode" rows="6" class="code-input" placeholder="${t("chainShare.pasteHint","粘贴分享码...")}" class="u-break-all"></textarea>
        <div id="chainImportPreview" class="u-mt-2"></div>
        <div class="u-flex u-mt-2 u-gap-2">
          <button type="button" class="addbtn u-flex-1" id="chainImportPreviewBtn" data-sc="muted">${t("chainShare.previewBtn","预览")}</button>
          <button type="button" class="addbtn u-flex-1" id="chainImportConfirmBtn" data-sc="accent" disabled>${t("chainShare.confirmImportBtn","确认导入")}</button>
        </div>
      </div>
    </div>
  </div>`;
  document.body.insertAdjacentHTML("beforeend", html);
  const close = ()=>{ const m = $("#chainImportModal"); if(m) m.remove(); };
  $("#chainImportClose").onclick = close;
  $("#chainImportModal").onclick = (e)=>{ if(e.target === $("#chainImportModal")) close(); };
  let pendingLinks = null;
  $("#chainImportPreviewBtn").onclick = ()=>{
    const code = $("#chainImportCode").value.trim();
    if(!code){ toast(t("chainShare.pasteFirst","请先粘贴分享码"), "warn"); return; }
    const r = importChainShareCode(code);
    const previewEl = $("#chainImportPreview");
    if(!r.ok){
      previewEl.innerHTML = sanitizeHtml(`<div class="u-text-danger u-p-1h">✕ ${esc(r.err||t("chainShare.parseFailed","解析失败"))}</div>`);
      $("#chainImportConfirmBtn").disabled = true;
      pendingLinks = null;
      return;
    }
    pendingLinks = r.links;
    const rows = r.links.map(l => {
      const fs = scMeta(l.fromSc), ts = scMeta(l.toSc);
      return `<div class="chain-preview-row"><span style="color:${fs.color}">${esc(fs.name)}</span> <b>${esc(l.kw)}</b> → <span style="color:${ts.color}">${esc(ts.name)}</span></div>`;
    }).join("");
    previewEl.innerHTML = sanitizeHtml(`<div class="u-p-1h u-radius-sm u-border-line"><b>${t("chainShare.willImportPrefix","将导入 ")}${r.count}${t("chainShare.willImportSuffix"," 条链：")}</b>${rows}</div>`);
    $("#chainImportConfirmBtn").disabled = false;
  };
  $("#chainImportConfirmBtn").onclick = ()=>{
    if(!pendingLinks){ toast(t("chainShare.previewFirst","请先点「预览」确认"), "warn"); return; }
    saveCustomLinks(pendingLinks);
    renderLinksBox();
    close();
    toast(t("chainShare.importedPrefix","已导入 ")+pendingLinks.length+t("chainShare.importedSuffix"," 条联动规则"), "ok");
  };
}

/* ---------- 场景模板一键导入 ---------- */
/**
 * 预置场景模板集合（考研复习/健身30天/编程学习/项目管理/每日习惯养成）
 * 每个模板含 {name, description, tasks: [{title, scenario, priority, dueOffset, note}]}
 */
const SCENE_TEMPLATES = [
  {
    name: t("template.kaoyan","考研复习计划"),
    description: t("template.kaoyan.desc","政治/英语/数学/专业课 每日复习 + 周测，按周排期推进"),
    tasks: [
      { title: t("template.kaoyan.t1","政治：马原复习 + 选择题练习"), scenario: "study", priority: "P1", dueOffset: 0, note: t("template.kaoyan.n1","重点：唯物史观 + 认识论") },
      { title: t("template.kaoyan.t2","英语：阅读理解 2 篇 + 单词背诵"), scenario: "study", priority: "P1", dueOffset: 0, note: t("template.kaoyan.n2","精读 + 长难句分析") },
      { title: t("template.kaoyan.t3","数学：高数章节复习 + 习题"), scenario: "study", priority: "P0", dueOffset: 1, note: t("template.kaoyan.n3","极限与连续") },
      { title: t("template.kaoyan.t4","专业课：指定教材章节精读"), scenario: "study", priority: "P1", dueOffset: 1, note: t("template.kaoyan.n4","整理笔记 + 思维导图") },
      { title: t("template.kaoyan.t5","周测：全科模拟测试"), scenario: "study", priority: "P0", dueOffset: 6, note: t("template.kaoyan.n5","计时完成 + 错题复盘") },
      { title: t("template.kaoyan.t6","错题整理 + 薄弱环节强化"), scenario: "study", priority: "P2", dueOffset: 7, note: t("template.kaoyan.n6","针对错题重做") }
    ]
  },
  {
    name: t("template.fitness","健身30天计划"),
    description: t("template.fitness.desc","跑步/力量/拉伸 隔天轮换，30 天渐进式训练"),
    tasks: [
      { title: t("template.fitness.t1","跑步 3km + 热身"), scenario: "life", priority: "P1", dueOffset: 0, note: t("template.fitness.n1","配速 6:00，注意呼吸节奏") },
      { title: t("template.fitness.t2","力量训练：上肢（俯卧撑/哑铃）"), scenario: "life", priority: "P1", dueOffset: 1, note: t("template.fitness.n2","3 组 × 12 次") },
      { title: t("template.fitness.t3","拉伸恢复 + 泡沫轴放松"), scenario: "life", priority: "P2", dueOffset: 2, note: t("template.fitness.n3","全身拉伸 20 分钟") },
      { title: t("template.fitness.t4","跑步 5km 节奏跑"), scenario: "life", priority: "P1", dueOffset: 3, note: t("template.fitness.n4","配速 5:30") },
      { title: t("template.fitness.t5","力量训练：下肢（深蹲/硬拉）"), scenario: "life", priority: "P1", dueOffset: 4, note: t("template.fitness.n5","3 组 × 10 次") },
      { title: t("template.fitness.t6","休息日：散步 + 充足睡眠"), scenario: "life", priority: "P2", dueOffset: 5, note: t("template.fitness.n6","主动恢复") },
      { title: t("template.fitness.t7","周总结：记录体重/体感/进步"), scenario: "life", priority: "P2", dueOffset: 6, note: t("template.fitness.n7","拍照对比") }
    ]
  },
  {
    name: t("template.coding","编程学习路线"),
    description: t("template.coding.desc","算法/项目/刷题 每日推进，理论与实战结合"),
    tasks: [
      { title: t("template.coding.t1","算法：数据结构复习（链表/栈/队列）"), scenario: "code", priority: "P0", dueOffset: 0, note: t("template.coding.n1","手写实现 + 复杂度分析") },
      { title: t("template.coding.t2","刷题：LeetCode 每日 2 题"), scenario: "code", priority: "P1", dueOffset: 0, note: t("template.coding.n2","先易后难，总结套路") },
      { title: t("template.coding.t3","项目：搭建项目骨架 + 核心模块"), scenario: "code", priority: "P1", dueOffset: 1, note: t("template.coding.n3","技术选型 + 目录结构") },
      { title: t("template.coding.t4","算法：动态规划专题"), scenario: "code", priority: "P0", dueOffset: 2, note: t("template.coding.n4","经典 DP 题目 5 道") },
      { title: t("template.coding.t5","项目：实现业务逻辑 + 单元测试"), scenario: "code", priority: "P1", dueOffset: 3, note: t("template.coding.n5","覆盖率 > 80%") },
      { title: t("template.coding.t6","复盘：本周学习总结 + 下周计划"), scenario: "code", priority: "P2", dueOffset: 6, note: t("template.coding.n6","整理博客素材") }
    ]
  },
  {
    name: t("template.project","项目管理模板"),
    description: t("template.project.desc","需求/设计/开发/测试 按周排期，完整项目生命周期"),
    tasks: [
      { title: t("template.project.t1","需求评审 + 范围确认"), scenario: "office", priority: "P0", dueOffset: 0, note: t("template.project.n1","PRD 评审 + 验收标准") },
      { title: t("template.project.t2","技术方案设计 + 评审"), scenario: "code", priority: "P0", dueOffset: 2, note: t("template.project.n2","架构图 + 接口定义") },
      { title: t("template.project.t3","开发：核心功能实现"), scenario: "code", priority: "P1", dueOffset: 4, note: t("template.project.n3","每日站会同步进度") },
      { title: t("template.project.t4","开发：联调 + Bug 修复"), scenario: "code", priority: "P1", dueOffset: 8, note: t("template.project.n4","前后端联调") },
      { title: t("template.project.t5","测试：用例编写 + 执行"), scenario: "office", priority: "P1", dueOffset: 10, note: t("template.project.n5","回归 + 边界用例") },
      { title: t("template.project.t6","上线：部署 + 验收 + 复盘"), scenario: "office", priority: "P0", dueOffset: 13, note: t("template.project.n6","灰度发布 + 监控") }
    ]
  },
  {
    name: t("template.habit","每日习惯养成"),
    description: t("template.habit.desc","早起/运动/阅读/冥想 每日重复，养成健康生活习惯"),
    tasks: [
      { title: t("template.habit.t1","早起 6:30 + 晨间日记"), scenario: "life", priority: "P1", dueOffset: 0, note: t("template.habit.n1","记录三件感恩事") },
      { title: t("template.habit.t2","运动 30 分钟"), scenario: "life", priority: "P1", dueOffset: 0, note: t("template.habit.n2","跑步/瑜伽/力量任选") },
      { title: t("template.habit.t3","阅读 30 分钟"), scenario: "study", priority: "P2", dueOffset: 0, note: t("template.habit.n3","记录金句 + 思考") },
      { title: t("template.habit.t4","冥想 10 分钟"), scenario: "life", priority: "P2", dueOffset: 0, note: t("template.habit.n4","专注呼吸 + 放空") },
      { title: t("template.habit.t5","周复盘：习惯打卡统计"), scenario: "life", priority: "P2", dueOffset: 6, note: t("template.habit.n5","完成率 + 调整下周") }
    ]
  }
];
/**
 * 应用场景模板：批量创建任务（dueDate = today + dueOffset）
 * @param {Object} template - SCENE_TEMPLATES 中的模板对象
 * @returns {{ok:boolean, err?:string, count?:number, ids?:string[]}} 创建结果
 */
function applyTemplate(template){
  if(!template || typeof template !== "object") return {ok:false, err:t("tpl.errEmpty", "模板不能为空")};
  if(!Array.isArray(template.tasks) || template.tasks.length === 0) return {ok:false, err:t("tpl.errEmptyTaskList", "模板任务列表为空")};
  const tasks = getTasks();
  const now = Date.now();
  const createdIds = [];
  for(let i = 0; i < template.tasks.length; i++){
    const tplTask = template.tasks[i];
    if(!tplTask || typeof tplTask.title !== "string" || !tplTask.title.trim()) continue;
    const sc = ORDER.includes(tplTask.scenario) ? tplTask.scenario : "office";
    const offset = (typeof tplTask.dueOffset === "number" && isFinite(tplTask.dueOffset)) ? Math.max(0, Math.min(365, tplTask.dueOffset)) : 0;
    const id = uid();
    tasks.push({
      id: id,
      sc: sc,
      title: tplTask.title.trim(),
      due: offset > 0 ? shiftDay(offset) : todayStr(),
      priority: ["P0","P1","P2"].includes(tplTask.priority) ? tplTask.priority : "",
      status: "todo",
      doneAt: null,
      note: tplTask.note || "",
      tags: [t("tpl.tagTemplate", "模板")],
      created: now + i,
      updatedAt: now + i
    });
    createdIds.push(id);
  }
  if(createdIds.length === 0) return {ok:false, err:t("tpl.errNoValidTask", "模板中没有有效任务")};
  setTasks(tasks);
  return {ok:true, count: createdIds.length, ids: createdIds};
}
/**
 * 打开场景模板选择弹窗
 * @returns {void}
 */
function openTemplateModal(){
  const old = document.querySelector(".scene-template-modal");
  if(old) old.remove();
  const cards = SCENE_TEMPLATES.map((tpl, i) => {
    const scSet = [...new Set(tpl.tasks.map(x => x.scenario))];
    const scBadges = scSet.map(sc => { const s = scMeta(sc); return `<span class="tpl-sc-badge" style="background:${s.color};color:var(--on-accent)">${esc(s.name)}</span>`; }).join(" ");
    return `<div class="tpl-card" data-tpl="${i}">
      <div class="tpl-card-head">
        <h3>${esc(tpl.name)}</h3>
        <span class="tpl-task-count">${tpl.tasks.length}${t("unit.tasks", " 个任务")}</span>
      </div>
      <p class="tpl-desc">${esc(tpl.description)}</p>
      <div class="tpl-sc-row">${scBadges}</div>
      <button type="button" class="addbtn tpl-import-btn u-w-full u-mt-2" data-tpl-import="${i}" data-sc="accent">${t("tpl.btnImport", "一键导入")}</button>
    </div>`;
  }).join("");
  const html = `<div class="scene-template-modal" id="sceneTemplateModal">
    <div class="scene-template-dialog">
      <div class="scene-template-header">
        <h2><span class="ic-inline" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2M9 9h6M9 13h6M9 17h4"/></svg></span>${t("tpl.title", "场景模板")}</h2>
        <button type="button" class="scene-template-close" id="sceneTemplateClose" aria-label="${t("common.close", "关闭")}">✕</button>
      </div>
      <div class="scene-template-body">
        <p class="hint u-m-0-0-3">${t("tpl.hint", "选择一个模板一键导入对应任务集，到期日按 today + offset 自动计算。")}</p>
        ${cards}
      </div>
    </div>
  </div>`;
  document.body.insertAdjacentHTML("beforeend", html);
  // M1：用 AbortController 管理模态框事件生命周期，任意方式关闭均统一清理 keydown 监听器
  const _ac = new AbortController();
  const close = ()=>{ _ac.abort(); const m = $("#sceneTemplateModal"); if(m) m.remove(); };
  $("#sceneTemplateClose").onclick = close;
  $("#sceneTemplateModal").onclick = (e)=>{ if(e.target === $("#sceneTemplateModal")) close(); };
  document.addEventListener("keydown", (e)=>{ if(e.key === "Escape") close(); }, { signal: _ac.signal });
  $$("#sceneTemplateModal [data-tpl-import]").forEach(btn => {
    btn.onclick = ()=>{
      const idx = parseInt(btn.getAttribute("data-tpl-import"), 10);
      const tpl = SCENE_TEMPLATES[idx];
      if(!tpl) return;
      if(!confirm(t("tpl.confirmImport", "确定导入模板「")+tpl.name+t("tpl.confirmImportMid", "」？将创建 ")+tpl.tasks.length+t("tpl.confirmImportSuffix", " 个任务。"))) return;
      const r = applyTemplate(tpl);
      if(!r.ok){ toast(r.err||t("tpl.importFailed", "导入失败"), "warn"); return; }
      close();
      try{ closeDrawer(); }catch(e){ /* noop */ } /* v1.9：closeDrawer 已内置 render() */
      toast(t("tpl.imported", "已导入「")+tpl.name+"」"+r.count+t("unit.tasks", " 个任务"), "ok");
    };
  });
}

/* ---------- v1.5-B 插件/扩展体系：插件市场面板 ---------- */
/**
 * 渲染插件市场面板：列出所有已注册插件，含启用/禁用开关、详情、卸载按钮
 * 每个插件行：图标 + 名称 + 版本 + 描述 + 启用 toggle + 详情按钮 + 卸载按钮
 * @returns {void}
 */
function renderPluginBox(){
  const box = $("#pluginBox"); if(!box) return;
  const plugins = getAllPlugins();
  if(!plugins.length){
    box.innerHTML = sanitizeHtml(t("p4.html.pluginNone","<div class=\"hint\" class=\"u-p2-text-muted\">暂无已注册插件</div>"));
    return;
  }
  const rows = plugins.map(p => {
    const enabled = !!p.enabled;
    const scCount = Array.isArray(p.scenarios) ? p.scenarios.length : 0;
    const cardCount = Array.isArray(p.cards) ? p.cards.length : 0;
    const ruleCount = Array.isArray(p.chainRules) ? p.chainRules.length : 0;
    const badges = [];
    if(scCount) badges.push(t("p4.html.pluginBadgeSc","<span class=\"plugin-badge\">场景×")+scCount+'</span>');
    if(cardCount) badges.push(t("p4.html.pluginBadgeCard","<span class=\"plugin-badge\">卡片×")+cardCount+'</span>');
    if(ruleCount) badges.push(t("p4.html.pluginBadgeRule","<span class=\"plugin-badge\">链规则×")+ruleCount+'</span>');
    const badgeHtml = badges.length ? '<div class="plugin-badges">'+badges.join("")+'</div>' : "";
    return '<div class="plugin-row" data-plugin-id="'+esc(p.id)+'">'
      + '<div class="plugin-row-head">'
        + '<input type="checkbox" class="plugin-toggle" data-plugin-toggle="'+esc(p.id)+'" '+(enabled?"checked":"")+t("p4.html.pluginToggleAria",' aria-label="启用/禁用插件">')
        + '<span class="plugin-name">'+esc(p.name)+'</span>'
        + '<span class="plugin-version">v'+esc(p.version||"0.0.0")+'</span>'
        + '<button type="button" class="addbtn xs plugin-detail-btn" data-plugin-detail="'+esc(p.id)+t("p4.html.pluginDetailBtn","\" data-sc=\"muted\">详情</button>")
        + '<button type="button" class="addbtn xs plugin-unload-btn" data-plugin-unload="'+esc(p.id)+t("p4.html.pluginUnloadBtn","\" data-sc=\"danger-muted\">卸载</button>")
      + '</div>'
      + '<div class="plugin-desc">'+esc(p.description||"")+'</div>'
      + badgeHtml
    + '</div>';
  }).join("");
  box.innerHTML = sanitizeHtml('<div class="plugin-list">'+rows+'</div>');
  // 事件绑定：启用/禁用 toggle
  box.querySelectorAll(".plugin-toggle").forEach(cb => {
    cb.onchange = () => {
      const id = cb.getAttribute("data-plugin-toggle");
      const ok = setPluginEnabled(id, cb.checked);
      if(!ok){ toast(t("plugin.opFailed","操作失败"), "warn"); return; }
      toast(cb.checked ? t("plugin.enabled","插件已启用") : t("plugin.disabled","插件已禁用"), "ok");
      renderPluginBox();
    };
  });
  // 详情按钮
  box.querySelectorAll(".plugin-detail-btn").forEach(btn => {
    btn.onclick = () => {
      const id = btn.getAttribute("data-plugin-detail");
      openPluginDetailModal(id);
    };
  });
  // 卸载按钮
  box.querySelectorAll(".plugin-unload-btn").forEach(btn => {
    btn.onclick = () => {
      const id = btn.getAttribute("data-plugin-unload");
      const p = getPlugin(id);
      if(!p) return;
      if(!confirm(t("plugin.confirmUnload","确定卸载插件「")+p.name+t("plugin.confirmUnloadSuffix","」？"))) return;
      const ok = unloadPlugin(id);
      if(!ok){ toast(t("plugin.unloadFailed","卸载失败"), "warn"); return; }
      toast(t("plugin.unloadedPrefix","已卸载插件「")+p.name+t("plugin.unloadedSuffix","」"), "ok");
      renderPluginBox();
    };
  });
}

/**
 * 打开插件详情弹窗：显示插件元信息、提供的场景/卡片/链规则、配置编辑
 * @param {string} id - 插件 id
 * @returns {void}
 */
function openPluginDetailModal(id){
  const p = getPlugin(id);
  if(!p){ toast(t("plugin.notFound","插件不存在"), "warn"); return; }
  const old = document.querySelector(".plugin-detail-modal");
  if(old) old.remove();
  const scList = (Array.isArray(p.scenarios) && p.scenarios.length)
    ? p.scenarios.map(s => '<li>'+esc(s.name||s.key)+'（key: '+esc(s.key)+'）<span style="color:'+esc(s.color||"var(--muted)")+'">●</span></li>').join("")
    : t("p4.html.liNone","<li class=\"hint\">无</li>");
  const cardList = (Array.isArray(p.cards) && p.cards.length)
    ? p.cards.map(c => '<li>'+esc(c.name||c.type)+'（type: '+esc(c.type)+'）</li>').join("")
    : t("p4.html.liNone","<li class=\"hint\">无</li>");
  const ruleList = (Array.isArray(p.chainRules) && p.chainRules.length)
    ? p.chainRules.map(r => '<li>'+esc(r.name||r.id||t("plugin.rule","规则"))+'</li>').join("")
    : t("p4.html.liNone","<li class=\"hint\">无</li>");
  const configJson = JSON.stringify(p.config || {}, null, 2);
  const html = '<div class="plugin-detail-modal" id="pluginDetailModal">'
    + '<div class="chain-share-dialog u-max-w-520">'
      + '<div class="chain-share-header">'
        + '<h2>'+ic("puzzle")+esc(p.name)+'</h2>'
        + t("p4.html.pluginDetailClose",'<button type="button" class="chain-share-close" id="pluginDetailClose" aria-label="关闭">✕</button>')
      + '</div>'
      + '<div class="chain-share-body">'
        + '<div class="plugin-meta">'
          + '<div><b>ID：</b>'+esc(p.id)+'</div>'
          + t("p4.html.pluginVersionRow","<div><b>版本：</b>v")+esc(p.version||"0.0.0")+'</div>'
          + t("p4.html.pluginStatusRow","<div><b>状态：</b>")+(p.enabled?t("p4.html.enabledSpan","<span class=\"u-text-accent\">已启用</span>"):t("p4.html.disabledSpan","<span class=\"u-text-muted\">已禁用</span>"))+'</div>'
        + '</div>'
        + '<p class="plugin-desc-full">'+esc(p.description||"")+'</p>'
        + t("p4.html.pluginScSection","<div class=\"plugin-section\"><b>提供的场景：</b><ul>")+scList+'</ul></div>'
        + t("p4.html.pluginCardSection","<div class=\"plugin-section\"><b>提供的卡片：</b><ul>")+cardList+'</ul></div>'
        + t("p4.html.pluginRuleSection","<div class=\"plugin-section\"><b>提供的链规则：</b><ul>")+ruleList+'</ul></div>'
        + t("p4.html.pluginConfigSection","<div class=\"plugin-section\"><b>配置（JSON）：</b>")
          + '<textarea id="pluginConfigEditor" rows="5" class="code-input u-resize-v">'+esc(configJson)+'</textarea>'
          + t("p4.html.pluginSaveConfigBtn","<button type=\"button\" class=\"addbtn sm\" id=\"pluginConfigSave\" data-sc=\"accent\" class=\"u-mt-1\">保存配置</button>")
        + '</div>'
      + '</div>'
    + '</div>'
  + '</div>';
  document.body.insertAdjacentHTML("beforeend", html);
  // M1：用 AbortController 管理模态框事件生命周期，任意方式关闭均统一清理 keydown 监听器
  const _ac = new AbortController();
  const close = () => { _ac.abort(); const m = $("#pluginDetailModal"); if(m) m.remove(); };
  $("#pluginDetailClose").onclick = close;
  $("#pluginDetailModal").onclick = (e) => { if(e.target === $("#pluginDetailModal")) close(); };
  document.addEventListener("keydown", (e) => { if(e.key === "Escape") close(); }, { signal: _ac.signal });
  $("#pluginConfigSave").onclick = () => {
    const txt = $("#pluginConfigEditor").value;
    let cfg;
    try{ cfg = JSON.parse(txt); }
    catch(e){ toast(t("plugin.configJsonError","配置 JSON 格式错误"), "warn"); return; }
    const ok = setPluginConfig(id, cfg);
    if(!ok){ toast(t("plugin.saveConfigFailed","保存配置失败"), "warn"); return; }
    toast(t("plugin.configSaved","插件配置已保存"), "ok");
    close();
    renderPluginBox();
  };
}

/**
 * 打开插件市场面板（renderPluginBox 别名，供外部调用）
 * @returns {void}
 */
function openPluginPanel(){
  renderPluginBox();
}

/**
 * 从 JSON 字符串注册新插件（设置抽屉「注册插件」按钮入口）
 * @param {string} jsonStr - 插件 JSON 定义字符串
 * @returns {{ok:boolean, err?:string, id?:string}} 注册结果
 */
function registerPluginFromJson(jsonStr){
  if(!jsonStr || typeof jsonStr !== "string") return { ok:false, err:t("plugin.errEmptyDef","插件定义不能为空") };
  let plugin;
  try{ plugin = JSON.parse(jsonStr); }
  catch(e){ return { ok:false, err:t("plugin.jsonFormatError","JSON 格式错误：") + (e && e.message || e) }; }
  if(!plugin || typeof plugin !== "object") return { ok:false, err:t("plugin.errNotObject","插件定义必须是 JSON 对象") };
  if(!plugin.id) return { ok:false, err:t("plugin.errMissingId","插件缺少 id 字段") };
  if(!plugin.name) plugin.name = plugin.id;
  if(!plugin.version) plugin.version = "0.0.1";
  if(!plugin.description) plugin.description = "";
  const ok = registerPlugin(plugin);
  if(!ok) return { ok:false, err:t("plugin.errIdExists","插件 id「")+plugin.id+t("plugin.errIdExistsSuffix","」已存在") };
  return { ok:true, id:plugin.id };
}

/* ---------- v1.5-C 主题系统：自定义主题编辑器 + 场景配色 + 导入导出 ---------- */
/**
 * 可编辑的令牌列表（用户可调整的 CSS 自定义属性）
 * 仅暴露核心色彩令牌，避免全部令牌导致编辑器过于复杂
 */
const THEME_EDITABLE_TOKENS = [
  { key: "--bg",         label: t("theme.tokenBg","背景色") },
  { key: "--panel",      label: t("theme.tokenPanel","面板色") },
  { key: "--text",       label: t("theme.tokenText","文字色") },
  { key: "--accent",     label: t("theme.tokenAccent","强调色") },
  { key: "--on-accent",  label: t("theme.tokenOnAccent","强调色上的文字") },
  { key: "--line",       label: t("theme.tokenLine","边框色") },
  { key: "--muted",      label: t("theme.tokenMuted","次要文字色") },
  { key: "--danger",     label: t("theme.tokenDanger","危险色") },
  { key: "--warn",       label: t("theme.tokenWarn","警告色") },
  { key: "--ok",         label: t("theme.tokenOk","成功色") }
];

/**
 * 渲染主题编辑器面板：自定义主题列表 + 场景配色编辑器
 * @returns {void}
 */
function renderThemeEditor(){
  // 渲染自定义主题列表
  const listEl = $("#themeCustomList");
  if(listEl){
    const customs = (typeof getCustomThemes === "function") ? getCustomThemes() : {};
    const ids = Object.keys(customs);
    if(ids.length === 0){
      listEl.innerHTML = sanitizeHtml(t("p4.html.themeNoneCustom","<div class=\"hint\" class=\"u-p1-text-muted-fs2xs\">暂无自定义主题</div>"));
    }else{
      const curTheme = (typeof getCurrentTheme === "function") ? getCurrentTheme() : "light";
      const rows = ids.map(id => {
        const theme = customs[id];
        const isCurrent = id === curTheme;
        return '<div class="theme-custom-row">'
          + '<span class="theme-custom-name">'+esc(theme.name||id)+(isCurrent?' <span class="u-text-accent u-fs-3xs">'+t("theme.current", "●当前")+'</span>':'')+'</span>'
          + '<button type="button" class="addbtn xs" data-theme-apply="'+esc(id)+'" data-sc="accent">'+t("common.apply", "应用")+'</button>'
          + '<button type="button" class="addbtn xs" data-theme-edit="'+esc(id)+'" data-sc="muted">'+t("common.edit", "编辑")+'</button>'
          + '<button type="button" class="addbtn xs" data-theme-delete="'+esc(id)+'" data-sc="danger-muted">'+t("common.delete", "删除")+'</button>'
        + '</div>';
      }).join("");
      listEl.innerHTML = sanitizeHtml(rows);
      // 绑定事件
      listEl.querySelectorAll("[data-theme-apply]").forEach(btn => {
        btn.onclick = () => {
          const id = btn.getAttribute("data-theme-apply");
          if(typeof setTheme === "function") setTheme(id);
          const thSel = $("#cfgTheme"); if(thSel) thSel.value = id;
          renderThemeEditor();
          try{ toast(t("theme.applied", "已应用主题「")+(customs[id]&&customs[id].name||id)+t("theme.nameSuffix", "」"), "ok"); }catch(e){}
        };
      });
      listEl.querySelectorAll("[data-theme-edit]").forEach(btn => {
        btn.onclick = () => {
          const id = btn.getAttribute("data-theme-edit");
          _openThemeEditor(id);
        };
      });
      listEl.querySelectorAll("[data-theme-delete]").forEach(btn => {
        btn.onclick = () => {
          const id = btn.getAttribute("data-theme-delete");
          const theme = customs[id];
          if(!confirm(t("theme.confirmDelete", "确定删除自定义主题「")+(theme&&theme.name||id)+t("theme.confirmDeleteSuffix", "」？"))) return;
          if(typeof deleteCustomTheme === "function") deleteCustomTheme(id);
          renderThemeEditor();
          try{ toast(t("theme.deleted", "已删除主题"), "ok"); }catch(e){}
        };
      });
    }
  }

  // 渲染场景配色编辑器
  const scEl = $("#themeScColorEditor");
  if(scEl){
    const scColors = (typeof getScenarioColors === "function") ? getScenarioColors() : {};
    const scenarios = (typeof SCENARIOS !== "undefined") ? SCENARIOS : {};
    const order = (typeof ORDER !== "undefined") ? ORDER : Object.keys(scenarios);
    const rows = order.map(sc => {
      const meta = scenarios[sc] || { name: sc };
      const cur = scColors[sc] || (meta.color ? meta.color : "");
      return '<div class="theme-sc-color-row">'
        + '<span class="sc-name">'+esc(meta.name||sc)+'</span>'
        + '<input type="color" data-sc-color="'+esc(sc)+'" value="'+esc(cur||("#"+"7c5cbf"))+'" aria-label="'+esc(meta.name||sc)+t("theme.colorSuffix","配色")+'">'
        + '<button type="button" class="addbtn xs" data-sc-reset="'+esc(sc)+t("p4.html.scResetBtn",'" data-sc="muted">重置</button>')
      + '</div>';
    }).join("");
    scEl.innerHTML = sanitizeHtml(rows);
    scEl.querySelectorAll("[data-sc-color]").forEach(inp => {
      inp.onchange = () => {
        const sc = inp.getAttribute("data-sc-color");
        const colors = (typeof getScenarioColors === "function") ? getScenarioColors() : {};
        colors[sc] = inp.value;
        if(typeof saveScenarioColors === "function") saveScenarioColors(colors);
        try{ toast(t("theme.sceneColorUpdated", "已更新场景配色"), "ok"); }catch(e){}
      };
    });
    scEl.querySelectorAll("[data-sc-reset]").forEach(btn => {
      btn.onclick = () => {
        const sc = btn.getAttribute("data-sc-reset");
        const colors = (typeof getScenarioColors === "function") ? getScenarioColors() : {};
        delete colors[sc];
        if(typeof saveScenarioColors === "function") saveScenarioColors(colors);
        renderThemeEditor();
        try{ toast(t("theme.sceneColorReset", "已重置场景配色"), "ok"); }catch(e){}
      };
    });
  }
}

/**
 * 打开主题编辑器（新建或编辑现有自定义主题）
 * @param {string} [editId] - 编辑现有主题 id（不传为新建）
 * @returns {void}
 */
function _openThemeEditor(editId){
  const area = $("#themeEditorArea");
  if(!area) return;
  area.style.display = "block";
  const nameInp = $("#themeCustomName");
  const tokenArea = $("#themeTokenEditor");

  // 收集当前令牌值（从 :root computed style 或现有自定义主题）
  let existingTokens = {};
  let existingName = "";
  if(editId){
    const customs = (typeof getCustomThemes === "function") ? getCustomThemes() : {};
    if(customs[editId]){
      existingTokens = customs[editId].tokens || {};
      existingName = customs[editId].name || editId;
    }
  }

  if(nameInp) nameInp.value = existingName;
  area._editId = editId || null;

  // 渲染令牌编辑行
  if(tokenArea){
    const rows = THEME_EDITABLE_TOKENS.map(token => {
      let val = existingTokens[token.key];
      if(!val){
        // 从 computed style 读取当前值
        try{ val = getComputedStyle(document.documentElement).getPropertyValue(token.key).trim(); }catch(e){ val = ""; }
      }
      // 确保是 hex 格式供 color input 使用
      let hexVal = val;
      if(val && val.indexOf("#") !== 0){
        // 非 hex 格式，用占位色值作为 color input 默认
        hexVal = "#" + "000000";
      }
      hexVal = hexVal || ("#" + "000000");
      return '<div class="theme-token-row">'
        + '<label>'+esc(token.key)+'</label>'
        + '<input type="color" data-token-key="'+esc(token.key)+'" value="'+esc(hexVal)+'" aria-label="'+esc(token.label)+'">'
        + '<input type="text" data-token-text="'+esc(token.key)+'" value="'+esc(val||"")+'" placeholder="'+t("theme.tokenPlaceholder", "var(--token) 或 #rrggbb")+'">'
      + '</div>';
    }).join("");
    tokenArea.innerHTML = sanitizeHtml(rows);
    // color input 与 text input 联动
    tokenArea.querySelectorAll("[data-token-key]").forEach(colorInp => {
      colorInp.oninput = () => {
        const key = colorInp.getAttribute("data-token-key");
        const textInp = tokenArea.querySelector('[data-token-text="'+key+'"]');
        if(textInp) textInp.value = colorInp.value;
      };
    });
    tokenArea.querySelectorAll("[data-token-text]").forEach(textInp => {
      textInp.oninput = () => {
        const key = textInp.getAttribute("data-token-text");
        const colorInp = tokenArea.querySelector('[data-token-key="'+key+'"]');
        if(colorInp && /^#[0-9a-fA-F]{6}$/.test(textInp.value)) colorInp.value = textInp.value;
      };
    });
  }
}

/**
 * 关闭主题编辑器
 * @returns {void}
 */
function _closeThemeEditor(){
  const area = $("#themeEditorArea");
  if(area){ area.style.display = "none"; area._editId = null; }
}

/**
 * 保存当前编辑的自定义主题
 * @returns {void}
 */
function _saveThemeFromEditor(){
  const area = $("#themeEditorArea");
  if(!area) return;
  const nameInp = $("#themeCustomName");
  const name = (nameInp && nameInp.value.trim()) || (t("theme.defaultName","主题") + Date.now().toString(36));
  const editId = area._editId;
  const id = editId || ("custom_" + Date.now().toString(36));

  // 收集令牌
  const tokens = {};
  const tokenArea = $("#themeTokenEditor");
  if(tokenArea){
    tokenArea.querySelectorAll("[data-token-text]").forEach(textInp => {
      const key = textInp.getAttribute("data-token-text");
      const val = textInp.value.trim();
      if(val) tokens[key] = val;
    });
  }

  if(typeof createCustomTheme === "function"){
    createCustomTheme(id, name, tokens);
    _closeThemeEditor();
    renderThemeEditor();
    try{ toast(t("theme.customSaved", "已保存自定义主题「{name}」").replace("{name}", name), "ok"); }catch(e){}
  }
}

/**
 * 导出当前主题为 JSON 并显示在导入区供复制
 * @returns {void}
 */
function _exportCurrentTheme(){
  if(typeof exportTheme !== "function" || typeof getCurrentTheme !== "function") return;
  const curId = getCurrentTheme();
  const jsonStr = exportTheme(curId);
  const importArea = $("#themeImportArea");
  if(!importArea) return;
  importArea.style.display = "block";
  const jsonInp = $("#themeImportJson");
  if(jsonInp) jsonInp.value = jsonStr;
  try{ toast(t("theme.jsonGenerated", "当前主题 JSON 已生成，可复制分享"), "ok"); }catch(e){}
}

/**
 * 从导入区 JSON 字符串导入主题
 * @returns {void}
 */
function _importThemeFromJson(){
  const jsonInp = $("#themeImportJson");
  if(!jsonInp) return;
  const txt = jsonInp.value.trim();
  if(!txt){ try{ toast(t("theme.pasteJsonFirst", "请先粘贴主题 JSON"), "warn"); }catch(e){} return; }
  if(typeof importTheme !== "function") return;
  const r = importTheme(txt);
  if(!r.ok){ try{ toast(r.err || t("import.failed", "导入失败"), "warn"); }catch(e){} return; }
  const importArea = $("#themeImportArea");
  if(importArea) importArea.style.display = "none";
  if(jsonInp) jsonInp.value = "";
  renderThemeEditor();
  try{ toast(t("theme.imported", "已导入主题「{id}」").replace("{id}", r.id), "ok"); }catch(e){}
}

/* ---------- v1.6-D 知识管理：笔记 / 知识库 / 全文搜索按钮事件绑定 ---------- */
/* 设置抽屉入口 + 顶栏快捷按钮 + 弹窗关闭按钮
 * 使用 nullish 守卫防御：测试环境若 DOM 尚未挂载对应按钮时不报错 */
const _btnNotes = $("#btnNotes"); if(_btnNotes) _btnNotes.onclick = function(){ if(typeof openNotesModal === "function") openNotesModal(); };
const _btnKnowledgeBase = $("#btnKnowledgeBase"); if(_btnKnowledgeBase) _btnKnowledgeBase.onclick = function(){ if(typeof openKnowledgeBaseModal === "function") openKnowledgeBaseModal(); };
const _btnSearch = $("#btnSearch"); if(_btnSearch) _btnSearch.onclick = function(){ if(typeof openSearchModal === "function") openSearchModal(); };
const _btnNotesTop = $("#btnNotesTop"); if(_btnNotesTop) _btnNotesTop.onclick = function(){ if(typeof openNotesModal === "function") openNotesModal(); };
const _btnSearchTop = $("#btnSearchTop"); if(_btnSearchTop) _btnSearchTop.onclick = function(){ if(typeof openSearchModal === "function") openSearchModal(); };
// v1.9.9：顶栏右侧更多按钮（从侧栏功能组迁出）——点击展开次常用工具下拉
/* v1.15：顶栏消息按钮已收敛为唯一入口（#btnMessages），绑定见系统级消息中心区 */
/* 弹窗关闭按钮 */
const _btnNotesClose = $("#btnNotesClose"); if(_btnNotesClose) _btnNotesClose.onclick = function(){ if(typeof closeNotesModal === "function") closeNotesModal(); };
const _btnNoteEditorClose = $("#btnNoteEditorClose"); if(_btnNoteEditorClose) _btnNoteEditorClose.onclick = function(){ if(typeof closeNoteEditorModal === "function") closeNoteEditorModal(); };
const _btnKnowledgeBaseClose = $("#btnKnowledgeBaseClose"); if(_btnKnowledgeBaseClose) _btnKnowledgeBaseClose.onclick = function(){ if(typeof closeKnowledgeBaseModal === "function") closeKnowledgeBaseModal(); };
const _btnSearchClose = $("#btnSearchClose"); if(_btnSearchClose) _btnSearchClose.onclick = function(){ if(typeof closeSearchModal === "function") closeSearchModal(); };
/* 搜索输入框实时搜索 */
const _searchInput = $("#searchInput");
if(_searchInput && !_searchInput._v16dBound){
  _searchInput._v16dBound = true;
  _searchInput.oninput = function(e){
    if(typeof executeSearch === "function") executeSearch(e.target.value);
  };
  _searchInput.onkeydown = function(e){
    if(e.key === "Escape"){ if(typeof closeSearchModal === "function") closeSearchModal(); }
  };
}
/* 弹窗背景点击关闭 */
(function setupV16dModalBgClose(){
  ["notesModal","noteEditorModal","knowledgeBaseModal","searchModal"].forEach(function(id){
    const m = document.getElementById(id);
    if(!m || m._v16dBgCloseBound) return;
    m._v16dBgCloseBound = true;
    m.addEventListener("click", function(e){
      if(e.target === m) m.classList.remove("show");
    });
  });
})();
/* 全局快捷键 Ctrl+Shift+F 打开搜索 */
if(!window._v16dSearchHotkeyBound){
  window._v16dSearchHotkeyBound = true;
  window.addEventListener("keydown", function(e){
    if(e.ctrlKey && e.shiftKey && (e.key === "F" || e.key === "f")){
      e.preventDefault();
      if(typeof openSearchModal === "function") openSearchModal();
    }
  });
}
