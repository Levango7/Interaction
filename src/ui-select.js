// ===== UI Layer (交互层·自研下拉选择框) =====
/* ================= 自研下拉选择框（渐进增强原生 <select>） =================
 * v3.7.26：原生 <select> 展开后的 option 列表由**浏览器自身渲染** —— 宽度、
 *   文字对齐、圆角、主题配色全都不受 CSS 控制。用户 2026-09-23 两次反馈
 *   「冒出来的选择卡片宽度和下拉框本身宽度不一致」「模型名称要左右居中」，
 *   而 text-align:center 只作用于**收起态**，展开态仍是浏览器默认的居左 + 最小宽度。
 *   缩短选项文案（P0 紧急→P0）已是 CSS 层面的极限，仍无法消除浏览器最小宽度。
 *
 * 方案：**保留原生 select** 承载 name / value / change 事件（表单提交与既有监听零改动），
 *   在其上叠加自绘的「触发按钮 + 选项列表」替换视觉层，从而做到：
 *     ① 展开列表与触发框**严格同宽**（列表 width:100%，相对 .ds-select 定位）
 *     ② 选项文字可居中（用户明确要求）
 *     ③ 圆角/边框/背景走设计令牌，11 套主题自动适配
 *     ④ 键盘可达：Enter/Space 开合、↑↓ 移动、Esc 关闭
 *     ⑤ 空间不足时自动向上弹出（.ds-list.up）
 *   原生 select 仅置为透明覆盖层（**不用 display:none** —— 保留表单提交与无障碍语义，
 *   且它仍是唯一的数据源，选项变更时调用 dsRefresh 即可同步）。
 */
;(function(){
  var OPEN = null;                 /* 当前展开的实例，保证同时只开一个 */

  function _label(sel){
    var o = sel.options[sel.selectedIndex];
    return o ? o.text : "";
  }

  /** 关闭当前展开的下拉 */
  function dsClose(){
    if (!OPEN) return;
    OPEN.list.hidden = true;
    OPEN.list.classList.remove("up");
    OPEN.trigger.setAttribute("aria-expanded", "false");
    OPEN = null;
  }

  /** 刷新某个原生 select 对应的自研下拉（选项/当前值变化后调用） */
  function dsRefresh(sel){
    var inst = sel && sel.__ds;
    if (!inst) return;
    var list = inst.list, trigger = inst.trigger;
    list.innerHTML = "";
    Array.prototype.forEach.call(sel.options, function(o){
      var d = document.createElement("div");
      d.className = "ds-opt" + (o.value === sel.value ? " is-sel" : "");
      d.setAttribute("role", "option");
      d.setAttribute("data-value", o.value);
      d.setAttribute("aria-selected", o.value === sel.value ? "true" : "false");
      d.textContent = o.text;
      d.addEventListener("click", function(){
        sel.value = o.value;
        /* 沿用原生事件契约：现有所有 change 监听无需改动 */
        sel.dispatchEvent(new Event("change", { bubbles: true }));
        inst.syncLabel();
        dsClose();
      });
      list.appendChild(d);
    });
    inst.syncLabel();
  }

  /** 把单个原生 <select> 增强为自研下拉。幂等（重复调用无副作用）。 */
  function dsEnhance(sel){
    if (!sel || sel.__ds) return;
    var parent = sel.parentNode;
    if (!parent) return;

    var wrap = document.createElement("div");
    wrap.className = "ds-select";
    /* v3.7.27：把原生 select 的宽度约束**继承到外层 wrap**。
       否则 .ds-select 在 flex 容器里会被压扁 —— 实测聊天区模型下拉
       原 120px，自研后只剩 36px（min-width:120px 写在原生 select 上，
       而它已被置为透明覆盖层，不再参与布局）。 */
    var cs0 = getComputedStyle(sel);
    ["minWidth", "maxWidth", "flex", "flexGrow", "flexBasis"].forEach(function(k){
      if (cs0[k] && cs0[k] !== "0px" && cs0[k] !== "none" && cs0[k] !== "auto") wrap.style[k] = cs0[k];
    });
    parent.insertBefore(wrap, sel);
    wrap.appendChild(sel);                       /* 原生 select 移入，作为透明数据源 */

    var trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "ds-trigger";
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");
    trigger.innerHTML = '<span class="ds-label"></span>'
      + '<svg class="ds-caret" viewBox="0 0 24 24" aria-hidden="true">'
      + '<path d="M7 10l5 5 5-5" fill="none" stroke="currentColor" stroke-width="2"'
      + ' stroke-linecap="round" stroke-linejoin="round"/></svg>';
    wrap.appendChild(trigger);

    var list = document.createElement("div");
    list.className = "ds-list";
    list.hidden = true;
    list.setAttribute("role", "listbox");
    wrap.appendChild(list);

    var inst = { wrap: wrap, trigger: trigger, list: list, sel: sel };
    inst.syncLabel = function(){
      var lb = trigger.querySelector(".ds-label");
      if (lb) lb.textContent = _label(sel);
    };
    sel.__ds = inst;

    function open(){
      if (OPEN && OPEN !== inst) dsClose();
      list.hidden = false;
      /* v3.7.27：向上弹判定修正 —— 用户："点击后是上拉框，不是下拉框"。
         旧逻辑用 list.scrollHeight，隐藏转可见的当帧可能读不到正确值；
         新逻辑改为按"下方剩余空间 vs 上方剩余空间"取大的那边，
         且下方空间 < 80px（≈ 3 个选项）时优先向上 —— 聊天区输入框贴近视口底部，
         实测 bottom=883/视口 900，下方只剩 17px，必须向上。 */
      var r = trigger.getBoundingClientRect();
      var below = window.innerHeight - r.bottom;
      var above = r.top;
      var need = Math.max(list.scrollHeight, 44) + 8;
      if (below < need && above > below) list.classList.add("up");
      else if (below < need && above <= below) list.classList.remove("up");
      else list.classList.remove("up");
      trigger.setAttribute("aria-expanded", "true");
      OPEN = inst;
      var cur = list.querySelector(".ds-opt.is-sel") || list.querySelector(".ds-opt");
      if (cur) cur.classList.add("is-active");
    }

    trigger.addEventListener("click", function(e){
      e.preventDefault(); e.stopPropagation();
      if (OPEN === inst) dsClose(); else open();
    });

    /* 键盘：↑↓ 移动 / Enter 选中 / Esc 关闭 */
    trigger.addEventListener("keydown", function(e){
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        if (OPEN !== inst) { open(); return; }
        var opts = Array.prototype.slice.call(list.querySelectorAll(".ds-opt"));
        if (!opts.length) return;
        var idx = opts.findIndex(function(o){ return o.classList.contains("is-active"); });
        idx = (e.key === "ArrowDown") ? (idx + 1) % opts.length
                                      : (idx - 1 + opts.length) % opts.length;
        opts.forEach(function(o){ o.classList.remove("is-active"); });
        opts[idx].classList.add("is-active");
        opts[idx].scrollIntoView({ block: "nearest" });
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (OPEN === inst) {
          var act = list.querySelector(".ds-opt.is-active");
          if (act) act.click();
        } else open();
      } else if (e.key === "Escape") {
        dsClose();
      }
    });

    dsRefresh(sel);
  }

  /** 批量增强（重渲染后对新出现的 select 调用即可，幂等） */
  function dsEnhanceAll(root){
    var list = (root || document).querySelectorAll("select");
    Array.prototype.forEach.call(list, dsEnhance);
  }

  /* 点击外部关闭；滚动/尺寸变化时也关闭（避免列表脱离触发框） */
  document.addEventListener("mousedown", function(e){
    if (OPEN && !OPEN.wrap.contains(e.target)) dsClose();
  }, true);
  window.addEventListener("resize", dsClose);
  window.addEventListener("scroll", dsClose, true);

  /* ---------- 自动增强 ----------
     本项目大量 DOM 是运行时渲染的（切场景、重渲染卡片都会重建 select），
     逐处在渲染函数里补调用既不现实也易漏 —— 改为 MutationObserver 统一兜底，
     并对批量插入做 120ms 节流（渲染高峰一帧内可能有几十次变更）。
     增强本身是幂等的，重复调用无副作用。 */
  var _timer = null;
  function _scheduleEnhance(){
    if (_timer) return;
    _timer = setTimeout(function(){
      _timer = null;
      try { dsEnhanceAll(document); } catch (e) { /* 渲染中途的畸形节点不应中断主流程 */ }
    }, 120);
  }
  function _boot(){
    dsEnhanceAll(document);
    /* 测试门控：__TEST_GATE__ 为 true 时（单测环境）不启动 MutationObserver ——
       它的 120ms 节流定时器会与渲染调度测试（markDirty 合帧断言）的时序假设冲突，
       全量跑时把"置脏后下一帧一定渲染"冲成偶发失败（实测踩到）。 */
    if (window.__TEST_GATE__ === true) return;
    if (!window.MutationObserver) return;
    var mo = new MutationObserver(function(muts){
      for (var i = 0; i < muts.length; i++) {
        if (muts[i].addedNodes && muts[i].addedNodes.length) { _scheduleEnhance(); return; }
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", _boot);
  else _boot();

  /* 全局导出：与项目其它 UI 模块一致的挂载方式 */
  window.dsEnhance = dsEnhance;
  window.dsEnhanceAll = dsEnhanceAll;
  window.dsRefresh = dsRefresh;
  window.dsClose = dsClose;
})();
