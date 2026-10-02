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

/* v3.7.75 解耦：插件**注册表**（_plugins / BUILTIN_PLUGINS / register·load·unload·set·get 系列 /
 * 状态持久化与 _initPlugins）已整体下沉 data-links —— 它们是纯数据与存取，被 data/render/AI
 * 多层引用，留在 UI 层就是 5 条逆层边。本块只留 renderPluginCards（DOM 渲染属 UI）。
 * 若要删或改注册表符号，去 data-links；守护见 docs/module-graph.md。 */

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

// ===== Theme System (v1.5-C 多主题 / 自定义编辑 / 场景配色 / 导入导出) =====
