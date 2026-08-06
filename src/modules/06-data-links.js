// ===== Data Layer (数据层·联动规则与全局状态) =====
/* ---------- 场景联动规则（任务完成时触发，跨场景生成任务） ---------- */
const DEFAULT_LINKS = [
  {id:"l1", name:"交付完成 → 学习充电", fromSc:"office", kw:"交付", toSc:"study",  taskTitle:"奖励：看一集技术分享视频", priority:"P2", enabled:true},
  {id:"l2", name:"复习完成 → 编程实践", fromSc:"study",  kw:"复习", toSc:"code",  taskTitle:"奖励：写个有趣的小项目 30 分钟", priority:"P2", enabled:true},
  {id:"l3", name:"项目上线 → 生活犒劳", fromSc:"code",   kw:"上线", toSc:"life",  taskTitle:"犒劳：吃顿好的 / 看部想看的片",     priority:"P2", enabled:true}
];

/* ---------- P1：自定义场景（用户增删场景 + 内置场景改名/换色） ----------
 * 设计：SCENARIOS/ORDER 虽为 const，但指向可变对象/数组——在 07-store 初始化 chats
 * 之前完成注册，即可让侧栏/命令面板/统计/链路/AI 工具 enum 全链路自动兼容。
 * 存储键均以 PREFIX 开头 → 自动纳入导出备份（allKeys）。 */
const CUSTOM_SC_KEY = PREFIX + "scenarios_custom";      // 自定义场景列表
const SC_OVERRIDE_KEY = PREFIX + "scenarios_overrides"; // 内置场景改名/换色覆盖
const BUILTIN_SC_KEYS = ["office","code","study","life"];
const CUSTOM_ICON_KEYS = ["overview","plus","check","chat","download","upload","gear","theme","stats","copy","trash"];
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
/* 自定义场景图标解析：UI_ICONS[key]，未知键回退总览图标 */
function resolveScIcon(iconKey){
  const i = UI_ICONS[iconKey];
  return (typeof i === "string" && i) ? i : UI_ICONS.overview;
}
/* 自定义场景存储对象 → SCENARIOS 注册条目（通用资料库字段 + none 专属卡片） */
function toScenarioEntry(s){
  return {
    name: s.name,
    color: (/^#[0-9a-fA-F]{6}$/.test(s.color||"")) ? s.color : scenarioDefaultColor(),
    icon: resolveScIcon(s.iconKey),
    sysprompt: s.sysprompt || ("你是「"+s.name+"」场景助手，帮用户梳理该场景的任务与资料。回答简洁、可执行。"),
    extraCard: "none",
    record: { label: (s.name||"")+"资料",
      fields: [ {k:"title",label:"标题",type:"text"}, {k:"note",label:"备注",type:"textarea"} ] },
    custom: true,
    _iconKey: s.iconKey || "overview"
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
  // ② 移除上一轮注册的自定义场景（幂等重注册）
  Object.keys(SCENARIOS).forEach(k => { if(!BUILTIN_SC_KEYS.includes(k)) delete SCENARIOS[k]; });
  for(let i = ORDER.length - 1; i >= 0; i--){ if(!BUILTIN_SC_KEYS.includes(ORDER[i])) ORDER.splice(i, 1); }
  // ③ 注册当前自定义场景
  loadCustomScenarios().forEach(s => {
    if(SCENARIOS[s.key]) return; // 键冲突防御
    SCENARIOS[s.key] = toScenarioEntry(s);
    ORDER.push(s.key);
  });
}
registerCustomScenarios(); // 模块顶层：先于 07-store 的 chats/active 初始化

/**
 * 添加自定义场景
 * @param {string} name - 场景名（≤12 字，不与现有场景重名）
 * @param {string} color - 十六进制色值（非法时回退默认紫）
 * @param {string} iconKey - CUSTOM_ICON_KEYS 之一（非法时回退 overview）
 * @returns {{ok:boolean, err?:string, key?:string}}
 */
function addCustomScenario(name, color, iconKey){
  name = String(name===null||name===undefined?"":name).trim();
  if(!name) return {ok:false, err:"场景名称不能为空"};
  if(name.length > 12) return {ok:false, err:"场景名称过长（最多 12 字）"};
  const dup = ORDER.some(k => SCENARIOS[k] && (SCENARIOS[k].name||"").toLowerCase() === name.toLowerCase());
  if(dup) return {ok:false, err:"已存在同名场景"};
  const key = "sc_" + uid();
  const arr = loadCustomScenarios();
  arr.push({ key, name,
    color: (/^#[0-9a-fA-F]{6}$/.test(color||"")) ? color : scenarioDefaultColor(),
    iconKey: CUSTOM_ICON_KEYS.includes(iconKey) ? iconKey : "overview",
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
  if(i < 0) return {ok:false, err:"场景不存在"};
  const s = arr[i];
  if(typeof patch.name === "string"){
    const nm = patch.name.trim();
    if(!nm) return {ok:false, err:"场景名称不能为空"};
    if(nm.length > 12) return {ok:false, err:"场景名称过长（最多 12 字）"};
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
  if(BUILTIN_SC_KEYS.includes(key)) return {ok:false, err:"内置场景不可删除"};
  if(!SCENARIOS[key]) return {ok:false, err:"场景不存在"};
  const hasTasks = getTasks().some(t => t.sc === key); // 含软删任务：数据契约从严
  if(hasTasks) return {ok:false, err:"该场景下还有任务，请先处理后再删除"};
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
  if(!BUILTIN_SC_KEYS.includes(key)) return {ok:false, err:"仅内置场景支持改名/换色"};
  patch = patch || {};
  const ov = loadScOverrides();
  const cur = ov[key] || {};
  if(typeof patch.name === "string"){
    const nm = patch.name.trim();
    if(!nm) return {ok:false, err:"场景名称不能为空"};
    if(nm.length > 12) return {ok:false, err:"场景名称过长（最多 12 字）"};
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

