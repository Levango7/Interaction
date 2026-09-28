// ===== UI Layer (交互层·全局事件绑定·插件系统) =====
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
