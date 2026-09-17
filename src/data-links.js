// ===== Data Layer (数据层·联动规则与全局状态) =====
/* ---------- 场景联动规则（任务完成时触发，跨场景生成任务） ---------- */
const DEFAULT_LINKS = [
  {id:"l1", name:t("chain.default.l1.name", "交付完成 → 学习充电"), fromSc:"office", kw:t("chain.kw.deliver", "交付"), toSc:"study",  taskTitle:t("chain.default.l1.taskTitle", "奖励：看一集技术分享视频"), priority:"P2", enabled:true},
  {id:"l2", name:t("chain.default.l2.name", "复习完成 → 编程实践"), fromSc:"study",  kw:t("chain.kw.review", "复习"), toSc:"code",  taskTitle:t("chain.default.l2.taskTitle", "奖励：写个有趣的小项目 30 分钟"), priority:"P2", enabled:true},
  {id:"l3", name:t("chain.default.l3.name", "项目上线 → 生活犒劳"), fromSc:"code",   kw:t("chain.kw.launch", "上线"), toSc:"life",  taskTitle:t("chain.default.l3.taskTitle", "犒劳：吃顿好的 / 看部想看的片"),     priority:"P2", enabled:true}
];

/* ---------- P1：自定义场景（用户增删场景 + 内置场景改名/换色） ----------
 * 设计：SCENARIOS/ORDER 虽为 const，但指向可变对象/数组——在 07-store 初始化 chats
 * 之前完成注册，即可让侧栏/命令面板/统计/链路/AI 工具 enum 全链路自动兼容。
 * 存储键均以 PREFIX 开头 → 自动纳入导出备份（allKeys）。 */
const CUSTOM_SC_KEY = PREFIX + "scenarios_custom";      // 自定义场景列表
const SC_OVERRIDE_KEY = PREFIX + "scenarios_overrides"; // 内置场景改名/换色覆盖
const BUILTIN_SC_KEYS = ["office","design","study","data","code","life","health"];
/* v3.6.0：预置但默认隐藏的场景——定义保留在 SCENARIOS 里，由商店插件启用后进入 ORDER。
   理财即此类：默认不出现在侧栏，用户到「商店 → 场景」安装并启用「理财助手」才出现。 */
const PRESET_SC_KEYS = ["finance"];
const CUSTOM_ICON_KEYS = ["tag","overview","plus","check","chat","download","upload","gear","theme","stats","copy","trash"];
/* 内置场景原始 name/color 快照（覆盖前保存，供重置与幂等重注册） */
const SC_ORIGINALS = {};
BUILTIN_SC_KEYS.forEach(k => { SC_ORIGINALS[k] = { name: SCENARIOS[k].name, color: SCENARIOS[k].color }; });

function loadCustomScenarios(){
  const arr = load(CUSTOM_SC_KEY, []);
  return Array.isArray(arr) ? arr.filter(s => s && typeof s.key === "string" && typeof s.name === "string") : [];
}
/**
 * 读取自定义场景默认色令牌（var(--scenario-default)）；读取失败回退生活场景色
 * @returns {string} 十六进制色值
 */
function scenarioDefaultColor(){
  try{
    const v = getComputedStyle(document.documentElement).getPropertyValue("--scenario-default").trim();
    return /^#[0-9a-fA-F]{6}$/.test(v) ? v : SC_ORIGINALS.life.color;
  }catch(e){ return SC_ORIGINALS.life.color; }
}
function saveCustomScenarios(arr){ save(CUSTOM_SC_KEY, arr); }
function loadScOverrides(){
  const o = load(SC_OVERRIDE_KEY, {});
  return (o && typeof o === "object" && !Array.isArray(o)) ? o : {};
}
function saveScOverrides(o){ save(SC_OVERRIDE_KEY, o); }
/* 自定义场景图标解析：UI_ICONS[key]，未知键回退「标签」图标（v2.1.1：不再与主页 overview 混用） */
function resolveScIcon(iconKey){
  const i = UI_ICONS[iconKey];
  return (typeof i === "string" && i) ? i : UI_ICONS.tag;
}
/* 自定义场景存储对象 → SCENARIOS 注册条目（通用资料库字段 + none 专属卡片） */
function toScenarioEntry(s){
  return {
    name: s.name,
    color: (/^#[0-9a-fA-F]{6}$/.test(s.color||"")) ? s.color : scenarioDefaultColor(),
    icon: resolveScIcon(s.iconKey),
    sysprompt: s.sysprompt || (t("scenario.customSysPromptPrefix", "你是「")+s.name+t("scenario.customSysPromptSuffix", "」场景助手，帮用户梳理该场景的任务与资料。回答简洁、可执行。")),
    extraCard: "none",
    record: { label: (s.name||"")+t("scenario.customRecordSuffix", "资料"),
      fields: [ {k:"title",label:t("field.title", "标题"),type:"text"}, {k:"note",label:t("field.note", "备注"),type:"textarea"} ] },
    custom: true,
    _iconKey: s.iconKey || "tag"
  };
}
/* 插件场景 → SCENARIOS 条目（icon 为 SVG 字符串或空；desc 作为 sysprompt） */
function pluginScenarioToEntry(key, s){
  return {
    name: s.name || key,
    color: (/^#[0-9a-fA-F]{6}$/.test(s.color||"")) ? s.color : scenarioDefaultColor(),
    icon: (typeof s.icon === "string" && s.icon) ? s.icon : resolveScIcon("tag"),
    sysprompt: s.desc || (t("scenario.pluginSysPromptPrefix", "你是「")+(s.name||key)+t("scenario.pluginSysPromptSuffix", "」场景助手，帮用户梳理该场景的任务与资料。")),
    extraCard: "none",
    record: { label: (s.name||key)+t("scenario.customRecordSuffix", "资料"),
      fields: [ {k:"title",label:t("field.title", "标题"),type:"text"}, {k:"note",label:t("field.note", "备注"),type:"textarea"} ] },
    custom: true,
    plugin: true,
    _iconKey: "tag"
  };
}
/**
 * 把自定义场景与内置覆盖注册进 SCENARIOS/ORDER（幂等，可重复调用）。
 * 启动时在 07-store 初始化 chats 前执行一次；CRUD 后再执行以热更新。
 * @returns {void}
 */
function registerCustomScenarios(){
  // ① 内置场景：先还原原始值，再应用改名/换色覆盖
  const ov = loadScOverrides();
  BUILTIN_SC_KEYS.forEach(k => {
    const base = SCENARIOS[k]; if(!base || !SC_ORIGINALS[k]) return;
    base.name = SC_ORIGINALS[k].name; base.color = SC_ORIGINALS[k].color;
    const o = ov[k];
    if(o && typeof o.name === "string" && o.name.trim()) base.name = o.name.trim();
    if(o && typeof o.color === "string" && /^#[0-9a-fA-F]{6}$/.test(o.color)) base.color = o.color;
  });
  // ② 移除上一轮注册的自定义场景（幂等重注册）；预置场景（PRESET_SC_KEYS）保留定义但退出 ORDER
  Object.keys(SCENARIOS).forEach(k => { if(!BUILTIN_SC_KEYS.includes(k) && !PRESET_SC_KEYS.includes(k)) delete SCENARIOS[k]; });
  for(let i = ORDER.length - 1; i >= 0; i--){ if(!BUILTIN_SC_KEYS.includes(ORDER[i])) ORDER.splice(i, 1); }
  // ③ 注册当前自定义场景
  loadCustomScenarios().forEach(s => {
    if(SCENARIOS[s.key]) return; // 键冲突防御
    SCENARIOS[s.key] = toScenarioEntry(s);
    ORDER.push(s.key);
  });
  // ④ 注册插件场景（随启用插件动态，非持久化）
  const ps = (typeof getPluginScenarios === "function") ? getPluginScenarios() : {};
  Object.keys(ps).forEach(key => {
    if(SCENARIOS[key]){ // 预置场景（如 finance）：定义已在，只补进 ORDER（不覆盖专属字段/卡片）
      if(ORDER.indexOf(key) < 0) ORDER.push(key);
      return;
    }
    SCENARIOS[key] = pluginScenarioToEntry(key, ps[key]);
    ORDER.push(key);
  });
  // ⑤ 插件场景专属增强：插件只给骨架（标题/备注），这里按场景补上专属 tab 与记录字段
  _applyPluginScenarioPresets();
}

/**
 * v3.6.0：给商店插件场景补专属能力（幂等，registerCustomScenarios 每次调用后重放）。
 * 阅读插件启用后：侧栏出现「阅读」场景，并挂上阅读 tab（复用 study 里保留的渲染器/字段绑定），
 * 记录字段从通用「标题/备注」升级为书籍字段。停用后 SCENE_FEATURES.reading 留着也无副作用。
 * @returns {void}
 */
function _applyPluginScenarioPresets(){
  try{
    if(!SCENARIOS.reading) return;
    const sc = SCENARIOS.reading;
    // 插件骨架只给「标题/备注」资料库——概览记录沿用通用骨架（与 study 场景一致），
    // 真正的书籍跟踪放在专属「阅读」tab 里（字段/统计/筛选都是现成的）
    sc.color = "#3498db";
    sc.sysprompt = t("sysprompt.reading", "你是一个阅读助手，帮用户管理书籍、跟踪阅读进度、整理读书笔记与摘录，并给出选书与精读建议。");
    if(!SCENE_FEATURES.reading){
      SCENE_FEATURES.reading = [
        { id:"overview", type:"core",   label:t("tab.overview", "概览") },
        { id:"reading",  type:"record", label:t("tab.reading", "阅读") }
      ];
    }
    const rf = SCENE_FEATURE_RENDER.study && SCENE_FEATURE_RENDER.study.reading;
    if(rf && !(SCENE_FEATURE_RENDER.reading && SCENE_FEATURE_RENDER.reading.reading)){
      SCENE_FEATURE_RENDER.reading = { reading: rf };
    }
    const rb = SCENE_FEATURE_BIND.study && SCENE_FEATURE_BIND.study.reading;
    if(rb && !(SCENE_FEATURE_BIND.reading && SCENE_FEATURE_BIND.reading.reading)){
      SCENE_FEATURE_BIND.reading = { reading: rb };
    }
  }catch(_){ /* 插件增强失败不影响主流程 */ }
}
registerCustomScenarios(); // 模块顶层：先于 07-store 的 chats/active 初始化

/**
 * 添加自定义场景
 * @param {string} name - 场景名（≤12 字，不与现有场景重名）
 * @param {string} color - 十六进制色值（非法时回退默认紫）
 * @param {string} iconKey - CUSTOM_ICON_KEYS 之一（非法时回退 tag）
 * @returns {{ok:boolean, err?:string, key?:string}}
 */
function addCustomScenario(name, color, iconKey){
  name = String(name===null||name===undefined?"":name).trim();
  if(!name) return {ok:false, err:t("err.sceneNameEmpty", "场景名称不能为空")};
  if(name.length > 12) return {ok:false, err:t("err.sceneNameTooLong", "场景名称过长（最多 12 字）")};
  const dup = ORDER.some(k => SCENARIOS[k] && (SCENARIOS[k].name||"").toLowerCase() === name.toLowerCase());
  if(dup) return {ok:false, err:t("err.sceneDup", "已存在同名场景")};
  const key = "sc_" + uid();
  const arr = loadCustomScenarios();
  arr.push({ key, name,
    color: (/^#[0-9a-fA-F]{6}$/.test(color||"")) ? color : scenarioDefaultColor(),
    iconKey: CUSTOM_ICON_KEYS.includes(iconKey) ? iconKey : "tag",
    created: Date.now() });
  saveCustomScenarios(arr);
  registerCustomScenarios();
  return {ok:true, key};
}
/**
 * 修改自定义场景（名称/颜色/图标）
 * @param {string} key - 场景键
 * @param {{name?:string,color?:string,iconKey?:string}} patch
 * @returns {{ok:boolean, err?:string}}
 */
function updateCustomScenario(key, patch){
  patch = patch || {};
  const arr = loadCustomScenarios();
  const i = arr.findIndex(s => s.key === key);
  if(i < 0) return {ok:false, err:t("err.sceneNotFound", "场景不存在")};
  const s = arr[i];
  if(typeof patch.name === "string"){
    const nm = patch.name.trim();
    if(!nm) return {ok:false, err:t("err.sceneNameEmpty", "场景名称不能为空")};
    if(nm.length > 12) return {ok:false, err:t("err.sceneNameTooLong", "场景名称过长（最多 12 字）")};
    s.name = nm;
  }
  if(typeof patch.color === "string" && /^#[0-9a-fA-F]{6}$/.test(patch.color)) s.color = patch.color;
  if(typeof patch.iconKey === "string" && CUSTOM_ICON_KEYS.includes(patch.iconKey)) s.iconKey = patch.iconKey;
  arr[i] = s; saveCustomScenarios(arr);
  registerCustomScenarios();
  return {ok:true};
}
/**
 * 删除自定义场景（内置场景禁删；场景下仍有任务时禁删，防数据孤儿）
 * @param {string} key - 场景键
 * @returns {{ok:boolean, err?:string}}
 */
function removeCustomScenario(key){
  if(BUILTIN_SC_KEYS.includes(key)) return {ok:false, err:t("err.builtinNoDelete", "内置场景不可删除")};
  if(!SCENARIOS[key]) return {ok:false, err:t("err.sceneNotFound", "场景不存在")};
  const hasTasks = getTasks().some(t => t.sc === key); // 含软删任务：数据契约从严
  if(hasTasks) return {ok:false, err:t("err.sceneHasTasks", "该场景下还有任务，请先处理后再删除")};
  saveCustomScenarios(loadCustomScenarios().filter(s => s.key !== key));
  if(getActive() === key) setActive("office"); // 当前场景被删 → 回退办公
  if(typeof chats === "object" && chats) delete chats[key];
  try{ localStorage.removeItem(PREFIX+"rec_"+key); }catch(e){ /* 资料键清理失败不阻塞 */ }
  registerCustomScenarios();
  return {ok:true};
}
/**
 * 内置场景改名/换色（覆盖持久化；传 name 或 color 其一即可）
 * @param {string} key - 内置场景键（office/code/study/life）
 * @param {{name?:string,color?:string}} patch
 * @returns {{ok:boolean, err?:string}}
 */
function setBuiltinOverride(key, patch){
  if(!BUILTIN_SC_KEYS.includes(key)) return {ok:false, err:t("err.builtinOnly", "仅内置场景支持改名/换色")};
  patch = patch || {};
  const ov = loadScOverrides();
  const cur = ov[key] || {};
  if(typeof patch.name === "string"){
    const nm = patch.name.trim();
    if(!nm) return {ok:false, err:t("err.sceneNameEmpty", "场景名称不能为空")};
    if(nm.length > 12) return {ok:false, err:t("err.sceneNameTooLong", "场景名称过长（最多 12 字）")};
    cur.name = nm;
  }
  if(typeof patch.color === "string" && /^#[0-9a-fA-F]{6}$/.test(patch.color)) cur.color = patch.color;
  ov[key] = cur; saveScOverrides(ov);
  registerCustomScenarios();
  return {ok:true};
}
/**
 * 重置内置场景覆盖（恢复原始名称/颜色）
 * @param {string} key - 内置场景键
 * @returns {void}
 */
function resetBuiltinOverride(key){
  const ov = loadScOverrides();
  delete ov[key]; saveScOverrides(ov);
  registerCustomScenarios();
}

// ===== Store 实例（T2.3 状态管理） =====
// taskStore：任务列表；linkStore：场景联动规则；cfgStore：配置（只读快照，crypto 层管理 _cfgCache，store 不介入 cfg 写入）
// get 采用 live-get（始终读 localStorage）以兼容测试 localStorage.clear() 与 doImport/recoverAutoBackup 直接写 localStorage 的场景；
// set 更新内部 state 并通知订阅者（用于触发 render），持久化由 setTasks/getLinks 配合 save 完成。
const taskStore = createStore(load(PREFIX+"tasks", []));
taskStore.get = () => load(PREFIX+"tasks", []);
const cfgStore  = createStore(load(PREFIX+"cfg", {}));
const linkStore = createStore(load(PREFIX+"links", null) || DEFAULT_LINKS.slice());
linkStore.get = () => load(PREFIX+"links", null) || DEFAULT_LINKS.slice();

// store 变更自动触发 render（防抖冗余保护，不替代现有手动 render() 调用）
let _renderTimer = null;
taskStore.subscribe(() => {
  if(_renderTimer) clearTimeout(_renderTimer);
  _renderTimer = setTimeout(() => { try{ markDirty(); }catch(e){ try{ pushDiag("error", "render schedule error: "+(e&&e.message||e), {where:"renderSchedule"}); }catch(_){} } }, 50);
});

/**
 * 读取场景联动规则；优先读自定义链（T3.2 wb_custom_links），fallback 到 linkStore（wb_agent_links），再 fallback 到 DEFAULT_LINKS
 * @returns {Link[]}
 */
function getLinks(){
  let l = load("wb_custom_links", null);
  if(!l) l = linkStore.get();
  if(!l){ l = DEFAULT_LINKS.slice(); linkStore.set(l); save(PREFIX+"links", l); }
  return l;
}

/* ---------- T3.2 联动规则 UI 编辑（自定义链 CRUD） ---------- */
/** 自定义链 localStorage key（任务契约：固定为 wb_custom_links） */
const CUSTOM_LINKS_KEY = "wb_custom_links";
/**
 * 读取自定义联动规则
 * @returns {Link[]|null} 自定义链数组，无则 null
 */
function getCustomLinks(){
  return load(CUSTOM_LINKS_KEY, null);
}
/**
 * 保存自定义联动规则到 localStorage（JSON.stringify）
 * @param {Link[]} links
 * @returns {void}
 */
function saveCustomLinks(links){
  save(CUSTOM_LINKS_KEY, links);
}
/**
 * 添加自定义联动规则（验证 fromSc≠toSc，kw 非空，场景合法）
 * @param {string} fromSc - 源场景 key
 * @param {string} kw - 关键词
 * @param {string} toSc - 目标场景 key
 * @param {Object} [extra] - 额外字段（taskTitle/priority/name/enabled）
 * @returns {{ok:boolean, err?:string, link?:Link}} 结果
 */
function addCustomLink(fromSc, kw, toSc, extra){
  const _kw = String(kw===null||kw===undefined?"":kw).trim();
  if(!fromSc || !ORDER.includes(fromSc)) return {ok:false, err:t("err.invalidSrcSc", "无效的源场景")};
  if(!toSc || !ORDER.includes(toSc)) return {ok:false, err:t("err.invalidDstSc", "无效的目标场景")};
  if(fromSc === toSc) return {ok:false, err:t("err.sameSc", "源场景与目标场景不能相同")};
  if(!_kw) return {ok:false, err:t("err.kwEmpty", "关键词不能为空")};
  const link = Object.assign({
    id: uid(),
    name: (SCENARIOS[fromSc]&&SCENARIOS[fromSc].name||fromSc) + "→" + (SCENARIOS[toSc]&&SCENARIOS[toSc].name||toSc),
    fromSc, kw: _kw, toSc,
    taskTitle: t("chain.taskTitlePrefix", "奖励：") + _kw,
    priority: "P2",
    enabled: true
  }, extra || {});
  const links = getLinks().slice();
  links.push(link);
  saveCustomLinks(links);
  return {ok:true, link};
}
/**
 * 删除指定 id 的自定义联动规则
 * @param {string} id
 * @returns {boolean} 是否删除成功
 */
function removeCustomLink(id){
  const links = getLinks().slice();
  const i = links.findIndex(l => l.id === id);
  if(i < 0) return false;
  // v3.1：接入回收站——保存被删除的联动规则快照
  const removed = links[i];
  try{
    AppBridge.addToRecycleBin("config",
      t("chain.linkRecycleTitlePrefix", "联动规则：「")+(removed.name||removed.id||t("tool.unnamed", "未命名"))+t("chain.linkRecycleTitleSuffix", "」"),
      (removed.fromSc||"?")+" → "+(removed.toSc||"?")+t("chain.linkRecycleDescKwPrefix", "，关键词：「")+(removed.kw||"")+t("chain.linkRecycleDescKwSuffix", "」"),
      { kind: "link", link: removed },
      t("chain.linkRecycleCategory", "联动规则"));
  }catch(_){ /* 回收站写入失败不影响删除 */ }
  links.splice(i, 1);
  saveCustomLinks(links);
  return true;
}
/**
 * 修改指定 id 的自定义联动规则（关键词、目标场景、启用状态等）
 * @param {string} id
 * @param {Partial<Link>} patch
 * @returns {{ok:boolean, err?:string, link?:Link}} 结果
 */
function updateCustomLink(id, patch){
  const links = getLinks().slice();
  const i = links.findIndex(l => l.id === id);
  if(i < 0) return {ok:false, err:t("err.linkNotFound", "链不存在")};
  const merged = Object.assign({}, links[i], patch);
  if(merged.fromSc && merged.toSc && merged.fromSc === merged.toSc) return {ok:false, err:t("err.sameSc", "源场景与目标场景不能相同")};
  if("kw" in patch && !String(merged.kw===null||merged.kw===undefined?"":merged.kw).trim()) return {ok:false, err:t("err.kwEmpty", "关键词不能为空")};
  if("fromSc" in patch && !ORDER.includes(merged.fromSc)) return {ok:false, err:t("err.invalidSrcSc", "无效的源场景")};
  if("toSc" in patch && !ORDER.includes(merged.toSc)) return {ok:false, err:t("err.invalidDstSc", "无效的目标场景")};
  links[i] = merged;
  saveCustomLinks(links);
  return {ok:true, link: merged};
}
/**
 * 切换指定 id 的链的启用/禁用状态
 * @param {string} id
 * @param {boolean} enabled
 * @returns {boolean} 是否切换成功
 */
function toggleCustomLink(id, enabled){
  const links = getLinks().slice();
  const i = links.findIndex(l => l.id === id);
  if(i < 0) return false;
  links[i].enabled = !!enabled;
  saveCustomLinks(links);
  return true;
}
/**
 * 重置为默认链：清除 wb_custom_links，恢复 DEFAULT_LINKS
 * @returns {void}
 */
function resetCustomLinks(){
  localStorage.removeItem(CUSTOM_LINKS_KEY);
}

let active = load(PREFIX+"active","office");
// v1.9.3g：当前视图状态机——"main"（场景/总览/统计/回收站）| "settings"（设置页）| "help"（指南页）。
// 侧栏高亮据此渲染（renderSide 弃 DOM 嗅探），由 openDrawer / renderHelp / render 显式赋值。
let uiView = "main";
/* v2.1.0：场景任务视图模式——kanban（看板，默认）/ calendar（日历）/ todo（待办列表）。
   侧栏「总览 ▸ 任务」三项切换；持久化到 localStorage。 */
let sceneViewMode = load(PREFIX+"sceneViewMode","kanban");
/**
 * 切换场景任务视图模式并跳转：当前在概览/统计/回收站等非场景视图时回办公场景。
 * @param {string} mode - "kanban" | "calendar" | "todo"
 * @returns {void}
 */
function setSceneViewMode(mode){
  if(mode!=="kanban" && mode!=="calendar" && mode!=="todo") mode = "kanban";
  sceneViewMode = mode;
  save(PREFIX+"sceneViewMode", mode);
  _sideActive = "view-"+mode;
  const nonScene = ["overview","stats","recycle"];
  if(nonScene.indexOf(active)>=0){ setActive("office"); }
  markDirty();
}
/* v3.0：场景内功能 tab 状态（SCENE_FEATURES 中某场景的 tab id，默认 overview）。
   切换后重渲染主区；切场景时由 render() 复位为 overview。 */
let sceneFeatureMode = "overview";
/**
 * 切换场景内功能 tab 并重渲染
 * @param {string} mode - SCENE_FEATURES[sc] 中的 tab id
 * @returns {void}
 */
function setSceneFeature(mode){
  const feats = SCENE_FEATURES[active] || [];
  if(!feats.some(function(f){ return f.id === mode; })) mode = "overview";
  sceneFeatureMode = mode;
  markDirty();
}
const chats = {};
ORDER.forEach(sc=> chats[sc] = load(PREFIX+"chat_"+sc, []).slice(-50) );

/* ---------- 全局状态契约（A-P2-7：状态层唯一出入口；render 层经此读写，禁止直读 active/chats/_cfgCache） ---------- */
/**
 * 读取当前激活场景键
 * @returns {string}
 */
function getActive(){ return active; }
/**
 * 切换激活场景并持久化
 * @param {string} sc - 场景键
 * @returns {void}
 */
function setActive(sc){ active = sc; save(PREFIX+"active", sc); } // 内含持久化；render 由调用方触发
function getChat(sc){ return chats[sc] || []; }
/* v3.4.5 G2 修复：写路径补 slice(-50) 裁剪——与读路径（启动/导入 slice(-50)，L6765/6950）对齐。
 * 此前 appendChat 直接 concat 全量写回：读时裁过的数组一经追加即恢复超长并持续增长，
 * 7 个 chat_<sc> 键是 5MB 配额的持续膨胀源。镜像层 _mirrorChatToSession 已有同款裁剪（L6931）。 */
function appendChat(sc, msg){ chats[sc] = (chats[sc]||[]).concat(msg).slice(-50); save(PREFIX+"chat_"+sc, chats[sc]); }

/* ---------- v2.0 多 Session 聊天存储层（自 .bak2 回填，适配当前版 load/save 封装） ----------
 * 会话模型 Session：{ id, title, sc, createdAt, updatedAt, msgs: [...] }
 * - 所有 Session 集中存 ai_sessions（LocalStorage，单一真相源）
 * - 首次启动检测到无 ai_sessions 时，从旧 chats[sc] 各场景迁出一个默认 Session（保留历史）
 * - 旧 chats[sc] 仍是聊天面板的实时数据源（兼容现有 getChat/appendChat/renderChat 测试契约）；
 *   save() 写穿镜像（_mirrorChatToSession）把场景聊天同步进对应 Session，二者保持一致。
 */
const SESSIONS_KEY = PREFIX+"ai_sessions";
const ACTIVE_SESS_KEY = PREFIX+"ai_active_session";
let _sessions = null;   // 懒加载；getSessions() 才从 LS 读 + 迁移
let _activeSid = null;  // 当前激活的 session id
function _nowIso(){ return new Date().toISOString(); }
function _genSid(){ return "s_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8); }
function _saveSessions(){ try{ save(SESSIONS_KEY, _sessions); }catch(_){ /* noop */ } }
function _saveActiveSid(){ try{ save(ACTIVE_SESS_KEY, _activeSid || ""); }catch(_){ /* noop */ } }
/**
 * 从 LocalStorage 读取 Session 列表；首次启动从旧 chats[sc] 迁移
 * @returns {Array<{id:string,title:string,sc:string,createdAt:string,updatedAt:string,msgs:Array}>}
 */
function getSessions(){
  if(_sessions) return _sessions;
  _sessions = load(SESSIONS_KEY, null);
  if(!_sessions || !Array.isArray(_sessions) || _sessions.length === 0){
    // 迁移：从旧 chats[sc] 为每个有消息的场景建一个默认 Session
    _sessions = [];
    ORDER.forEach(function(sc){
      const arr = (chats[sc] || []);
      if(arr.length > 0){
        const id = _genSid();
        const first = (arr[0] && arr[0].createdAt) || _nowIso();
        const last  = (arr[arr.length-1] && arr[arr.length-1].createdAt) || first;
        _sessions.push({
          id: id, sc: sc,
          title: (SCENARIOS[sc] ? (SCENARIOS[sc].name + t("sess.defaultSuffix", " 默认会话")) : (sc + t("sess.defaultSuffix", " 默认会话"))),
          createdAt: first, updatedAt: last,
          msgs: arr.slice()
        });
      }
    });
    if(_sessions.length === 0){
      // 完全冷启动：建一个默认 office 会话
      const id = _genSid();
      _sessions.push({ id: id, sc: "office", title: t("sess.new", "新会话"), createdAt: _nowIso(), updatedAt: _nowIso(), msgs: [] });
    }
    _activeSid = _sessions[0].id;
    _saveSessions();
    _saveActiveSid();
  }
  // 加载 active sid（若已删则重选第一个）
  _activeSid = load(ACTIVE_SESS_KEY, null);
  if(!_sessions.find(function(s){ return s.id === _activeSid; })) _activeSid = _sessions[0].id;
  return _sessions;
}
function setActiveSession(sid){
  getSessions();
  if(!_sessions.find(function(s){ return s.id === sid; })) return;
  _activeSid = sid;
  _saveActiveSid();
}
function getActiveSession(){ getSessions(); return _activeSid; }
function getActiveSessionObj(){
  getSessions();
  return _sessions.find(function(s){ return s.id === _activeSid; }) || _sessions[0] || null;
}
/**
 * 新建会话（可指定场景；不传则用当前 active 场景；默认标题「新会话」）
 * @param {string} [sc] - 场景键
 * @param {string} [title] - 自定义标题
 * @returns {{id:string,title:string,sc:string,createdAt:string,updatedAt:string,msgs:Array}}
 */
function createSession(sc, title){
  getSessions();
  const target = sc || (typeof active !== "undefined" ? active : "office");
  const id = _genSid();
  const item = { id: id, sc: target, title: title || t("sess.new", "新会话"), createdAt: _nowIso(), updatedAt: _nowIso(), msgs: [] };
  _sessions.unshift(item);
  _activeSid = id;
  _saveSessions();
  _saveActiveSid();
  return item;
}
/** 重命名会话（防御：仅改 title，不改其他字段） */
function renameSession(sid, title){
  getSessions();
  const it = _sessions.find(function(s){ return s.id === sid; });
  if(!it) return;
  it.title = (title || "").trim() || it.title;
  _saveSessions();
}
/** 删除会话（剩最后 1 个时只清空消息，不删记录） */
function deleteSession(sid){
  getSessions();
  if(_sessions.length <= 1){
    const it = _sessions[0];
    it.msgs = []; it.title = t("sess.new", "新会话"); it.updatedAt = _nowIso();
    _saveSessions();
    return;
  }
  const idx = _sessions.findIndex(function(s){ return s.id === sid; });
  if(idx < 0) return;
  _sessions.splice(idx, 1);
  if(_activeSid === sid) _activeSid = _sessions[0].id;
  _saveSessions();
  _saveActiveSid();
}
/** 往指定 Session 追加消息并自动更新 updatedAt（以首条用户消息自动命名） */
function appendSessionMsg(sid, msg){
  getSessions();
  const it = _sessions.find(function(s){ return s.id === sid; });
  if(!it) return;
  const m = Object.assign({ createdAt: _nowIso() }, msg);
  it.msgs = (it.msgs || []).concat(m);
  it.updatedAt = m.createdAt;
  if(it.title === t("sess.new", "新会话") && m.role === "user" && (m.content || "").trim()){
    it.title = (m.content || "").trim().slice(0, 20);
  }
  _saveSessions();
}
function getSessionMsgs(sid){
  getSessions();
  const it = _sessions.find(function(s){ return s.id === sid; });
  return it ? (it.msgs || []) : [];
}
function clearSessionMsgs(sid){
  getSessions();
  const it = _sessions.find(function(s){ return s.id === sid; });
  if(!it) return;
  it.msgs = [];
  it.updatedAt = _nowIso();
  _saveSessions();
}
/**
 * save() 写穿镜像：场景聊天键（PREFIX+"chat_"+sc）落盘时，把内容同步进「该场景的激活 Session」。
 * 仅当激活 Session 的 sc 与写入场景一致时镜像，避免跨场景串数据；不匹配则跳过（不自动建会话）。
 * 由 save() 内部 try/catch 包裹，会话层不可用时静默降级，不影响主存储。
 * @param {string} k - 存储键
 * @param {*} v - 要存储的值
 */
function _mirrorChatToSession(k, v){
  const chatPrefix = PREFIX+"chat_";
  if(typeof k !== "string" || k.indexOf(chatPrefix) !== 0) return;
  if(!Array.isArray(v)) return;
  const sc = k.slice(chatPrefix.length);
  if(!sc) return;
  getSessions();
  const sess = getActiveSessionObj();
  if(sess && sess.sc === sc){
    sess.msgs = v.slice(-50);
    sess.updatedAt = _nowIso();
    // 以首条用户消息自动命名（仅当还是默认名）
    if(sess.title === t("sess.new", "新会话")){
      const firstUser = sess.msgs.find(function(m){ return m.role === "user" && (m.content || "").trim(); });
      if(firstUser) sess.title = (firstUser.content || "").trim().slice(0, 20);
    }
    _saveSessions();
  }
}
/** 测试间复位会话层内存态（供 __test 使用，避免跨用例污染） */
function _resetSessions(){ _sessions = null; _activeSid = null; }
/**
 * v2.0.1：从 localStorage 重载场景聊天内存缓存（chats）。
 * doImport 不 reload 页面，导入新数据后内存 chats 仍是旧值，聊天面板会显示导入前的消息；
 * 导入/恢复后调用本函数 + _resetSessions() 使内存态与存储一致。
 */
function _reloadChatsFromStorage(){
  try{
    ORDER.forEach(function(sc){ chats[sc] = load(PREFIX+"chat_"+sc, []).slice(-50); });
  }catch(_){ /* noop */ }
}

/* ---------- v2.0 会话管理 UI（sessionModal：左列表 + 右预览） ---------- */
/** 打开会话管理弹窗并渲染列表 */
function openSessionModal(){
  const modal = $("#sessionModal"); if(!modal) return;
  renderSessionList();
  const act = getActiveSessionObj();
  renderSessionPreview(act ? act.id : null);
  modal.classList.add("show");
}
function closeSessionModal(){ const m = $("#sessionModal"); if(m) m.classList.remove("show"); }
/** 渲染会话列表（激活态高亮；含重命名/删除行内操作） */
function renderSessionList(filter){
  const box = $("#sessList"); if(!box) return;
  const list = getSessions();
  const activeSid = _activeSid || (list[0] && list[0].id);
  const q = String(filter || "").trim().toLowerCase();
  const items = list.filter(function(s){
    if(!q) return true;
    return String(s.title || "").toLowerCase().indexOf(q) >= 0;
  });
  box.innerHTML = sanitizeHtml(items.length ? items.map(function(s){
    const sc = s.sc || "office";
    const sm = scMeta(sc);
    const dt = new Date(s.updatedAt || s.createdAt || _nowIso());
    const time = (dt.getMonth()+1) + "/" + dt.getDate() + " " + pad(dt.getHours()) + ":" + pad(dt.getMinutes());
    const isActive = s.id === activeSid;
    return '<div class="sess-item' + (isActive ? " active" : "") + '" data-sid="' + esc(s.id) + '" role="option" tabindex="0" aria-selected="' + (isActive ? "true" : "false") + '">'
      + '<span class="sess-title"><span class="sc-dot" style="background:' + sm.color + '"></span>'
      + '<span class="tx" title="' + esc(s.title || "") + '">' + esc(s.title || t("sess.new", "新会话")) + '</span></span>'
      + '<span class="sess-meta">' + esc(sm.name) + ' · ' + (s.msgs || []).length + ' ' + t("common.unit", "条") + ' · ' + time + '</span>'
      + '<span class="sess-acts">'
      + '<button type="button" data-act="rename" data-sid="' + esc(s.id) + '">' + t("sess.renameBtn", "重命名") + '</button>'
      + '<button type="button" class="danger" data-act="delete" data-sid="' + esc(s.id) + '">' + t("common.delete", "删除") + '</button>'
      + '</span></div>';
  }).join("") : '<div class="sess-preview-empty">' + t("sess.noMatch", "没有匹配的会话") + '</div>');
  // 点击会话项 → 激活 + 预览（行内操作按钮除外）
  $$("#sessList .sess-item").forEach(function(el){
    el.onclick = function(e){
      const actBtn = e.target && e.target.closest ? e.target.closest("[data-act]") : null;
      if(actBtn){
        const sid = actBtn.getAttribute("data-sid");
        if(actBtn.getAttribute("data-act") === "rename"){
          const cur = (getSessions().find(function(s){ return s.id === sid; }) || {}).title || "";
          const nv = window.prompt(t("sess.renamePrompt", "重命名会话"), cur);
          if(nv !== null && nv.trim()){ renameSession(sid, nv.trim()); renderSessionList($("#sessSearch") ? $("#sessSearch").value : ""); renderSessionPreview(getActiveSession()); }
        } else if(actBtn.getAttribute("data-act") === "delete"){
          if(window.confirm(t("sess.deleteConfirm", "删除该会话及其全部消息？此操作不可撤销。"))){
            deleteSession(sid);
            renderSessionList($("#sessSearch") ? $("#sessSearch").value : "");
            renderSessionPreview(getActiveSession());
            try{ toast(t("sess.deletedToast", "已删除会话"), "ok"); }catch(_){ /* noop */ }
          }
        }
        return;
      }
      const sid = el.getAttribute("data-sid");
      if(sid){ setActiveSession(sid); renderSessionList($("#sessSearch") ? $("#sessSearch").value : ""); renderSessionPreview(sid); }
    };
    el.onkeydown = function(e){ if(e.key === "Enter" || e.key === " "){ e.preventDefault(); el.click(); } };
  });
}
/** 渲染指定会话的消息预览（复用聊天气泡语义：user 右 / assistant 左 / tool 弱化） */
function renderSessionPreview(sid){
  const box = $("#sessPreview"); if(!box) return;
  if(!sid){ box.innerHTML = sanitizeHtml('<div class="sess-preview-empty">' + t("sess.previewEmpty", "选择左侧会话查看消息") + '</div>'); return; }
  const msgs = getSessionMsgs(sid);
  if(!msgs.length){ box.innerHTML = sanitizeHtml('<div class="sess-preview-empty">' + t("sess.noMessages", "该会话暂无消息") + '</div>'); return; }
  box.innerHTML = sanitizeHtml(msgs.map(function(m){
    const role = m.role === "user" ? "user" : (m.role === "tool" ? "tool" : "assistant");
    const text = _chatContentToText(m.content) || "";
    const ts = m.createdAt ? new Date(m.createdAt) : null;
    const time = ts ? (pad(ts.getHours()) + ":" + pad(ts.getMinutes())) : "";
    return '<div class="sess-msg ' + role + '">' + esc(text)
      + (time ? '<span class="sess-msg-time">' + time + '</span>' : "") + '</div>';
  }).join(""));
  box.scrollTop = box.scrollHeight;
}
/** 绑定会话弹窗事件（幂等；启动时调用一次） */
function bindSessionModal(){
  const modal = $("#sessionModal"); if(!modal || modal._bound) return;
  modal._bound = true;
  const closeBtn = $("#btnSessionClose"); if(closeBtn) closeBtn.onclick = closeSessionModal;
  modal.addEventListener("click", function(e){ if(e.target === modal) closeSessionModal(); });
  const newBtn = $("#sessNewBtn");
  if(newBtn) newBtn.onclick = function(){
    createSession(); // 用当前 active 场景
    renderSessionList($("#sessSearch") ? $("#sessSearch").value : "");
    renderSessionPreview(getActiveSession());
    try{ toast(t("sess.createdToast", "已新建会话"), "ok"); }catch(_){ /* noop */ }
  };
  const search = $("#sessSearch");
  if(search) search.oninput = function(){ renderSessionList(search.value); };
}
/**
 * 读取当前配置（含解密后的内存明文 cfg）
 * @returns {Cfg}
 */
function getCfg(){ return _cfgCache || load(PREFIX+"cfg", {}); }
