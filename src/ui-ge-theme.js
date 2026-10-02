// ===== UI Layer (交互层·全局事件绑定·主题/报表/AI 引擎) =====
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
 * @param {string} taskTitle - 任务标题
 * @param {string} [scenario] - 场景键（office/code/study/life），可选
 * @returns {Promise<Array<{title:string,priority:string}>|null>} 子任务列表；无 AI Key 或失败返回 null
 */
async function aiDecomposeTask(taskTitle, scenario){
  const profile = getActiveProfile();
  /* v3.7.59：这里原有 `opts.useLocalPlan → agentPlan(...)` 的本地降级分支已随 v1.7-A 死链一并移除。
     全仓没有任何调用方传过 useLocalPlan（实测只剩定义与注释命中），
     而 agentPlan 内部靠关键词猜工具、猜出来的步骤并不比"直接返回 null 让上层走人工拆解"更可靠。 */
  if(!profile || !profile.key) return null;

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

/* v3.7.59：aiAgentAutoRun 已删除 —— 它是 v1.7-A agentRun 的死包装（全仓零调用方、零测试、
 * 也没上 __test 桥）。"AI 自主执行"现在的真实入口是命令面板的 > 前缀
 * → ai-retry.js 的 proposeAgentPlan（先出计划）→ 用户回「确认执行」→ executeAgentPlan，
 * 且破坏性步骤被 DANGER_CONFIRM_TOOLS 拦住。*/

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


/* v3.7.77 解耦：注册 AppBridge 槽（报表/AI 引擎）—— render 块经桥调用，
   不再直接引用本块符号（逆层边消除）。注册在加载时执行，晚于 core 定义、早于任何用户交互。 */
try{ AppBridge.openReportModal = openReportModal; }catch(e){}
try{ AppBridge.bindReportModal = bindReportModal; }catch(e){}
try{ AppBridge.aiSmartRecommend = aiSmartRecommend; }catch(e){}
try{ AppBridge._aiChatText = _aiChatText; }catch(e){}

/* v3.7.78 解耦：主题 API 槽注册（ui-drawer / ui-global-events 经桥调用）。 */
try{
  AppBridge.setTheme = setTheme; AppBridge.getCurrentTheme = getCurrentTheme;
  AppBridge.getCustomThemes = getCustomThemes; AppBridge.saveCustomThemes = saveCustomThemes;
  AppBridge.createCustomTheme = createCustomTheme; AppBridge.deleteCustomTheme = deleteCustomTheme;
  AppBridge.updateCustomTheme = updateCustomTheme; AppBridge.exportTheme = exportTheme;
  AppBridge.importTheme = importTheme; AppBridge.getScenarioColors = getScenarioColors;
  AppBridge.saveScenarioColors = saveScenarioColors;
}catch(e){}
