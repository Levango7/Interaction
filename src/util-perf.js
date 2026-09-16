// ===== Util Layer (性能优化工具·v1.4-B) =====
/* ---------- 防抖（debounce） ----------
 * v1.4-B 性能优化：搜索输入 / 窗口 resize 等高频事件防抖
 * leading=false（尾部触发），适合输入筛选与 resize 重算场景
 */
/**
 * 创建防抖函数：延迟 delay ms 后执行，期间多次调用只执行最后一次
 * @param {Function} fn - 待防抖的函数
 * @param {number} delay - 延迟毫秒数
 * @returns {Function} 防抖后的函数（带 .cancel() 方法可取消待执行计时器）
 */
function debounce(fn, delay){
  let timer = null;
  const debounced = function(...args){
    if(timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = null; fn.apply(this, args); }, delay);
  };
  debounced.cancel = function(){ if(timer){ clearTimeout(timer); timer = null; } };
  return debounced;
}

/* ---------- 虚拟滚动范围计算（virtualScrollRange） ----------
 * v1.4-B 性能优化：任务/记录列表超 100 条时只渲染可见区域 + 上下缓冲区
 * 纯函数，不操作 DOM，方便测试
 */
/**
 * 计算虚拟滚动可见范围（起始索引、结束索引、偏移量、总高度）
 * @param {Object} opts
 * @param {number} opts.total - 总条目数
 * @param {number} opts.itemHeight - 每条高度（px）
 * @param {number} opts.viewportHeight - 视口高度（px）
 * @param {number} opts.scrollTop - 当前滚动位置（px）
 * @param {number} [opts.buffer=5] - 上下缓冲区条数
 * @returns {{start:number,end:number,offsetY:number,totalHeight:number}} 可见范围信息
 */
function virtualScrollRange(opts){
  const total = Math.max(0, opts.total | 0);
  const itemHeight = Math.max(1, opts.itemHeight);
  const viewportHeight = Math.max(0, opts.viewportHeight);
  const scrollTop = Math.max(0, opts.scrollTop | 0);
  const buffer = Math.max(0, opts.buffer || 5);
  if(total === 0) return { start:0, end:0, offsetY:0, totalHeight:0 };
  const start = Math.max(0, Math.floor(scrollTop / itemHeight) - buffer);
  const visibleCount = Math.ceil(viewportHeight / itemHeight) + buffer * 2;
  const end = Math.min(total, start + visibleCount);
  return {
    start,
    end,
    offsetY: start * itemHeight,
    totalHeight: total * itemHeight
  };
}

/* 虚拟滚动启用阈值：列表条数超过此值才启用虚拟滚动，<= 此值时全量渲染 */
const VIRTUAL_SCROLL_THRESHOLD = 100;
/* 虚拟滚动默认每项高度估算（看板卡片 / 记录项） */
const VIRTUAL_ITEM_HEIGHT_CARD = 88;
const VIRTUAL_ITEM_HEIGHT_RECORD = 64;
/* 虚拟滚动视口最大高度（px），超过此高度出现滚动条 */
const VIRTUAL_VIEWPORT_MAX = 480;
/* 虚拟滚动上下缓冲区条数 */
const VIRTUAL_SCROLL_BUFFER = 5;

/* ============================================================
 * v1.6-G 增量渲染 / 虚拟滚动增强 / 懒加载 / 性能监控
 * ============================================================ */

/* 内部性能记录表（var 声明提升，模块加载完成后即可用） */
const _perfMarks = {};
const _perfMeasures = {};
/* 懒加载模块注册表 */
const _lazyModuleRegistry = {};

/* ---------- 增量渲染：DOM diff 计算 + 补丁应用 ----------
 * 设计：简单稳健的 diff 算法（按索引对比 + 末尾增删），不追求最小 diff
 * 适合列表/表格等有序节点集合，避免全量 innerHTML 重绘
 */

/**
 * 创建增量渲染器：跟踪容器上次渲染的内容，下次只更新差异
 * @returns {{render:function, getSnapshot:function, reset:function}}
 */
function createDiffRenderer(){
  let snapshot = null; /* 上次渲染的节点签名数组 */
  return {
    /**
     * 增量渲染：对比新旧内容，只更新变化的节点
     * @param {HTMLElement} container - 容器元素
     * @param {string[]} newSigs - 新内容签名数组（每个元素代表一行/一项的签名）
     * @param {function(number):HTMLElement} createNode - 根据索引创建新节点
     * @returns {{added:number, removed:number, updated:number}} 统计
     */
    render(container, newSigs, createNode){
      const diffs = computeDOMDiff(snapshot || [], newSigs);
      const stats = patchDOM(container, diffs, createNode, snapshot || []);
      snapshot = newSigs.slice();
      return stats;
    },
    getSnapshot(){ return snapshot; },
    reset(){ snapshot = null; }
  };
}

/**
 * 计算 DOM 差异（按索引对比）
 * @param {Array} oldNodes - 旧节点签名数组
 * @param {Array} newNodes - 新节点签名数组
 * @returns {{type:'add'|'remove'|'update'|'keep', index:number, oldIndex?:number}[]}
 */
function computeDOMDiff(oldNodes, newNodes){
  const oldArr = Array.isArray(oldNodes) ? oldNodes : [];
  const newArr = Array.isArray(newNodes) ? newNodes : [];
  const diffs = [];
  const maxLen = Math.max(oldArr.length, newArr.length);
  for(let i = 0; i < maxLen; i++){
    if(i >= newArr.length){
      /* 旧节点多余 → 删除 */
      diffs.push({ type: "remove", index: i });
    }else if(i >= oldArr.length){
      /* 新节点新增 → 添加 */
      diffs.push({ type: "add", index: i });
    }else if(oldArr[i] === newArr[i]){
      /* 相同 → 保留 */
      diffs.push({ type: "keep", index: i });
    }else{
      /* 不同 → 更新 */
      diffs.push({ type: "update", index: i, oldIndex: i });
    }
  }
  return diffs;
}

/**
 * 应用 DOM 补丁
 * @param {HTMLElement} container - 容器
 * @param {Object[]} diffs - computeDOMDiff 返回的差异
 * @param {function(number):HTMLElement} createNode - 根据新索引创建节点
 * @param {Array} oldSigs - 旧签名（用于识别需要删除的节点）
 * @returns {{added:number, removed:number, updated:number}}
 */
function patchDOM(container, diffs, createNode, oldSigs){
  const stats = { added: 0, removed: 0, updated: 0 };
  if(!container) return stats;
  /* 先处理删除（从后往前删，避免索引偏移） */ 
  const removes = diffs.filter(d => d.type === "remove").sort((a, b) => b.index - a.index);
  for(const d of removes){
    if(container.childNodes[d.index]){
      container.removeChild(container.childNodes[d.index]);
      stats.removed++;
    }
  }
  /* 再处理更新和添加 */ 
  for(const d of diffs){
    if(d.type === "update"){
      const newNode = createNode ? createNode(d.index) : null;
      if(newNode && container.childNodes[d.index]){
        try{ container.replaceChild(newNode, container.childNodes[d.index]); stats.updated++; }catch(e){}
      }
    }else if(d.type === "add"){
      const newNode = createNode ? createNode(d.index) : null;
      if(newNode){
        try{ container.appendChild(newNode); stats.added++; }catch(e){}
      }
    }
  }
  return stats;
}

/**
 * 增量渲染：对比新旧 HTML，只更新变化的 DOM 节点
 * 简化版：如果新 HTML 与旧 HTML 不同，则全量替换；相同则跳过
 * 用于无法逐项对比的场景（如富文本容器）
 * @param {HTMLElement} container - 容器
 * @param {string} newHTML - 新 HTML
 * @param {Object} [options] - 选项 {sanitize:function}
 * @returns {{changed:boolean, reason:string}}
 */
function diffRender(container, newHTML, options){
  if(!container) return { changed: false, reason: "no container" };
  const opts = options || {};
  const html = (typeof newHTML === "string") ? newHTML : "";
  // 安全默认：即使调用者未传入 sanitize，也使用 sanitizeHtml 消毒，避免 XSS
  const safeHtml = (opts.sanitize || sanitizeHtml)(html);
  /* 对比当前 innerHTML 与新 innerHTML */ 
  const current = container.innerHTML;
  if(current === safeHtml){
    return { changed: false, reason: "identical" };
  }
  /* 不同 → 替换 */ 
  container.innerHTML = safeHtml;
  return { changed: true, reason: "updated" };
}

/* ---------- 代码分割 / 懒加载 ---------- */


/**
 * 懒加载模块（返回 Promise）
 * @param {string} name - 模块名
 * @returns {Promise<*>} 模块对象
 */
function lazyLoad(name){
  const entry = _lazyModuleRegistry[name];
  if(!entry) return Promise.reject(new Error("module not registered: " + name));
  /* 已加载 → 直接返回 */ 
  if(entry.module) return Promise.resolve(entry.module);
  /* 正在加载 → 复用同一个 Promise */ 
  if(entry.loading) return entry.loading;
  /* 开始加载 */ 
  try{
    const p = Promise.resolve(entry.loader());
    entry.loading = p.then(m => {
      entry.module = m;
      entry.loading = null;
      return m;
    }).catch(err => {
      entry.loading = null;
      throw err;
    });
    return entry.loading;
  }catch(e){
    return Promise.reject(e);
  }
}

/* ---------- 性能监控 ---------- */

/**
 * 获取当前高精度时间戳
 * @returns {number} 时间戳（ms）
 */
function perfNow(){
  try{
    if(typeof performance !== "undefined" && performance.now) return performance.now();
  }catch(e){}
  return Date.now();
}

/**
 * 获取性能指标汇总
 * @returns {{marks:Object, measures:Object, markCount:number, measureCount:number}}
 */
function getPerfMetrics(){
  return {
    marks: Object.assign({}, _perfMarks),
    measures: Object.assign({}, _perfMeasures),
    markCount: Object.keys(_perfMarks).length,
    measureCount: Object.keys(_perfMeasures).length
  };
}

/* ============================================================
 * v1.8.3 性能优化工具：RAF 批量更新 / requestIdleCallback 包装 / localStorage 批量写入
 * ============================================================ */

/* ---------- rafBatch：requestAnimationFrame 批量更新 ----------
 * v1.8.3 性能优化：高频更新合并到一帧内只执行一次
 * 多次调用返回的包装函数，参数会被收集到数组，下一帧统一传给 fn 执行
 * 如果 requestAnimationFrame 不存在（测试环境），fallback 到 setTimeout(0)
 * @param {Function} fn - 接收参数数组的批处理函数 fn(argsArray)
 * @returns {Function} 包装函数，调用它会收集参数并安排下一帧执行
 */
function rafBatch(fn){
  let scheduled = false;
  let batchedArgs = [];
  let schedule;
  if(typeof requestAnimationFrame === "function"){
    schedule = function(){ requestAnimationFrame(flush); };
  }else{
    /* 测试环境（无 RAF）回退到 setTimeout(0) */
    schedule = function(){ setTimeout(flush, 0); };
  }
  function flush(){
    scheduled = false;
    const args = batchedArgs;
    batchedArgs = [];
    try{ fn(args); }catch(e){ /* 静默：避免单次失败影响后续调度 */ }
  }
  return function(){
    /* 收集本次调用的所有参数到批量队列 */
    for(let i = 0; i < arguments.length; i++){
      batchedArgs.push(arguments[i]);
    }
    if(!scheduled){
      scheduled = true;
      schedule();
    }
  };
}

/* ---------- idleWrap：requestIdleCallback 包装器 ----------
 * v1.8.3 性能优化：把函数包装为在浏览器空闲时执行，避免阻塞主线程
 * 如果 requestIdleCallback 不存在，fallback 到 setTimeout(0)
 * 保留 this 上下文和参数传递
 * @param {Function} fn - 待包装的函数
 * @returns {Function} 包装后的函数（调用后会在 idle 时执行 fn）
 */
function idleWrap(fn){
  const hasRIC = typeof requestIdleCallback === "function";
  return function(){
    const ctx = this;
    const args = arguments;
    if(hasRIC){
      requestIdleCallback(function(){
        try{ fn.apply(ctx, args); }catch(e){ /* 静默 */ }
      });
    }else{
      /* 测试环境（无 RIC）回退到 setTimeout(0) */
      setTimeout(function(){
        try{ fn.apply(ctx, args); }catch(e){ /* 静默 */ }
      }, 0);
    }
  };
}

/* ---------- batchWrite：localStorage 批量写入 ----------
 * v1.8.3 性能优化：收集多次 setItem 调用，在下一个微任务统一执行
 * 避免高频场景下频繁 localStorage.setItem 触发同步 IO 与序列化
 * @param {Storage} store - localStorage 或类 Storage 对象（需有 setItem 方法）
 * @returns {Function} 批量写入函数 (key, value) => void
 */
function batchWrite(store){
  const pending = {};
  const hasKey = {};
  let scheduled = false;
  function flush(){
    scheduled = false;
    const keys = Object.keys(pending);
    for(let i = 0; i < keys.length; i++){
      const k = keys[i];
      try{ store.setItem(k, pending[k]); }catch(e){ /* 配额超限/不可用时静默 */ }
      delete pending[k];
      delete hasKey[k];
    }
  }
  return function(key, value){
    pending[key] = value;
    hasKey[key] = true;
    if(!scheduled){
      scheduled = true;
      /* 微任务调度：Promise.resolve().then() 在当前同步代码完成后立即执行 */
      Promise.resolve().then(flush);
    }
  };
}
/*SRC:util-perf:END*/
/*SRC:util-perf:END*/
/*SRC:util-perf:END*/
/*SRC:util-perf:END*/
/*SRC:util-perf:END*/
/*SRC:util-perf:END*/
/*SRC:util-perf:END*/
/*SRC:util-perf:END*/
/*SRC:util-perf:END*/
/*SRC:util-perf:END*/
/*SRC:util-perf:END*/
