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
  _renderTimer = setTimeout(() => { try{ render(); }catch(e){} }, 50);
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

/* ---------- T3.2 习惯链 UI 编辑（自定义链 CRUD） ---------- */
/** 自定义链 localStorage key（任务契约：固定为 wb_custom_links） */
const CUSTOM_LINKS_KEY = "wb_custom_links";
/**
 * 读取自定义习惯链
 * @returns {Link[]|null} 自定义链数组，无则 null
 */
function getCustomLinks(){
  return load(CUSTOM_LINKS_KEY, null);
}
/**
 * 保存自定义习惯链到 localStorage（JSON.stringify）
 * @param {Link[]} links
 * @returns {void}
 */
function saveCustomLinks(links){
  save(CUSTOM_LINKS_KEY, links);
}
/**
 * 添加自定义习惯链（验证 fromSc≠toSc，kw 非空，场景合法）
 * @param {string} fromSc - 源场景 key
 * @param {string} kw - 关键词
 * @param {string} toSc - 目标场景 key
 * @param {Object} [extra] - 额外字段（taskTitle/priority/name/enabled）
 * @returns {{ok:boolean, err?:string, link?:Link}} 结果
 */
function addCustomLink(fromSc, kw, toSc, extra){
  const _kw = String(kw===null||kw===undefined?"":kw).trim();
  if(!fromSc || !ORDER.includes(fromSc)) return {ok:false, err:"无效的源场景"};
  if(!toSc || !ORDER.includes(toSc)) return {ok:false, err:"无效的目标场景"};
  if(fromSc === toSc) return {ok:false, err:"源场景与目标场景不能相同"};
  if(!_kw) return {ok:false, err:"关键词不能为空"};
  const link = Object.assign({
    id: uid(),
    name: (SCENARIOS[fromSc]&&SCENARIOS[fromSc].name||fromSc) + "→" + (SCENARIOS[toSc]&&SCENARIOS[toSc].name||toSc),
    fromSc, kw: _kw, toSc,
    taskTitle: "奖励：" + _kw,
    priority: "P2",
    enabled: true
  }, extra || {});
  const links = getLinks().slice();
  links.push(link);
  saveCustomLinks(links);
  return {ok:true, link};
}
/**
 * 删除指定 id 的自定义习惯链
 * @param {string} id
 * @returns {boolean} 是否删除成功
 */
function removeCustomLink(id){
  const links = getLinks().slice();
  const i = links.findIndex(l => l.id === id);
  if(i < 0) return false;
  links.splice(i, 1);
  saveCustomLinks(links);
  return true;
}
/**
 * 修改指定 id 的自定义习惯链（关键词、目标场景、启用状态等）
 * @param {string} id
 * @param {Partial<Link>} patch
 * @returns {{ok:boolean, err?:string, link?:Link}} 结果
 */
function updateCustomLink(id, patch){
  const links = getLinks().slice();
  const i = links.findIndex(l => l.id === id);
  if(i < 0) return {ok:false, err:"链不存在"};
  const merged = Object.assign({}, links[i], patch);
  if(merged.fromSc && merged.toSc && merged.fromSc === merged.toSc) return {ok:false, err:"源场景与目标场景不能相同"};
  if("kw" in patch && !String(merged.kw===null||merged.kw===undefined?"":merged.kw).trim()) return {ok:false, err:"关键词不能为空"};
  if("fromSc" in patch && !ORDER.includes(merged.fromSc)) return {ok:false, err:"无效的源场景"};
  if("toSc" in patch && !ORDER.includes(merged.toSc)) return {ok:false, err:"无效的目标场景"};
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
function appendChat(sc, msg){ chats[sc] = (chats[sc]||[]).concat(msg); save(PREFIX+"chat_"+sc, chats[sc]); }
function clearChat(sc){ chats[sc] = []; save(PREFIX+"chat_"+sc, []); }
/**
 * 读取当前配置（含解密后的内存明文 cfg）
 * @returns {Cfg}
 */
function getCfg(){ return _cfgCache || load(PREFIX+"cfg", {}); }
/**
 * 浅合并 patch 到 _cfgCache（不落盘，待 persistCfg/saveCfg 持久化）
 * @param {Partial<Cfg>} patch
 */
function setCfg(patch){ _cfgCache = Object.assign({}, _cfgCache, patch); }

