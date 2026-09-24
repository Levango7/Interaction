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
(function(){
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
    var EDITABLE = sel.hasAttribute("data-editable");
    var kw = EDITABLE ? String(trigger.value || "").trim().toLowerCase() : "";
    list.innerHTML = "";
    Array.prototype.forEach.call(sel.options, function(o){
      /* 可编辑模式：按输入内容过滤（本地匹配，不区分大小写） */
      if (EDITABLE && kw && o.text.toLowerCase().indexOf(kw) === -1) return;
      var d = document.createElement("div");
      d.className = "ds-opt" + (o.value === sel.value ? " is-sel" : "");
      d.setAttribute("role", "option");
      d.setAttribute("data-value", o.value);
      d.setAttribute("aria-selected", o.value === sel.value ? "true" : "false");
      d.textContent = o.text;
      var pick = function(e){
        if (e) e.preventDefault();
        sel.value = o.value;
        /* 沿用原生事件契约：现有所有 change 监听无需改动 */
        sel.dispatchEvent(new Event("change", { bubbles: true }));
        inst.syncLabel();
        dsClose();
      };
      /* v3.7.35：可编辑模式必须用 mousedown —— input 失焦会先于 click 触发，
         用 click 会导致 blur 里的"还原/提交"把选择结果覆盖掉。 */
      d.addEventListener(EDITABLE ? "mousedown" : "click", pick);
      list.appendChild(d);
    });
    inst.syncLabel();
  }

  /** 把单个原生 <select> 增强为自研下拉。幂等（重复调用无副作用）。 */
  function dsEnhance(sel){
    if (!sel || sel.__ds) return;
    var parent = sel.parentNode;
    if (!parent) return;
    /* v3.7.35：data-editable="1" 的 select 走 combobox 模式（可敲可选的输入框） */
    var EDITABLE = sel.hasAttribute("data-editable");

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

    var trigger = document.createElement(EDITABLE ? "input" : "button");
    if (EDITABLE) {
      /* v3.7.35：可编辑下拉（combobox）—— 用户："不但可以选择也可以输入"。
         触发器用 input 而非 button，用户可直接敲 "09:30"，也可从列表选。 */
      trigger.type = "text";
      trigger.className = "ds-trigger ds-trigger--input";
      trigger.setAttribute("autocomplete", "off");
      trigger.setAttribute("spellcheck", "false");
    } else {
      trigger.type = "button";
      trigger.className = "ds-trigger";
    }
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("role", "combobox");
    trigger.setAttribute("aria-autocomplete", EDITABLE ? "list" : "none");
    var CARET = '<svg class="ds-caret" viewBox="0 0 24 24" aria-hidden="true">'
      + '<path d="M7 10l5 5 5-5" fill="none" stroke="currentColor" stroke-width="2"'
      + ' stroke-linecap="round" stroke-linejoin="round"/></svg>';
    if (EDITABLE) {
      /* input 不能有子元素 → caret 作为兄弟节点绝对定位（见 .ds-select--edit .ds-caret） */
      wrap.appendChild(trigger);
      wrap.insertAdjacentHTML("beforeend", CARET);
      wrap.classList.add("ds-select--edit");
    } else {
      trigger.innerHTML = '<span class="ds-label"></span>' + CARET;
      wrap.appendChild(trigger);
    }

    var list = document.createElement("div");
    list.className = "ds-list";
    list.hidden = true;
    list.setAttribute("role", "listbox");
    wrap.appendChild(list);

    var inst = { wrap: wrap, trigger: trigger, list: list, sel: sel };
    inst.syncLabel = function(){
      if (EDITABLE) {
        /* 空值选项（如「选时间」）在可编辑模式下应当作 **placeholder**，
           而不是让用户看到"值" —— 否则得先删掉这四个字才能输入。 */
        var o = sel.options[sel.selectedIndex];
        if (!o || !o.value) {
          trigger.value = "";
          trigger.placeholder = o ? o.text : "";
        } else {
          trigger.value = o.text;
        }
        return;
      }
      var lb = trigger.querySelector(".ds-label");
      if (lb) lb.textContent = _label(sel);
    };
    sel.__ds = inst;

    function open(){
      if (OPEN && OPEN !== inst) dsClose();
      list.hidden = false;
      /* v3.7.35：向上弹判定修正（第三次修这里，这次是**真根因**）。
         ✗ 旧逻辑：need = Math.max(list.scrollHeight, 44) + 8
           scrollHeight 是**内容全高**，不受 max-height:264px 约束 ——
           时间字段有 288 个选项，scrollHeight ≈ 8640px，
           于是 `below < need` **恒为真** → 任何位置都向上弹
           （用户："应该是下拉框，不是上拉框"）。
         ✓ 新逻辑：用 getBoundingClientRect().height —— 它是**渲染后的实际高度**
           （即 min(scrollHeight, max-height)），才是真正需要占用的空间。
         同时条件收紧为"下方确实放不下"才上翻。 */
      var r = trigger.getBoundingClientRect();
      var listH = list.getBoundingClientRect().height;   /* 已含 max-height 约束 */
      var below = window.innerHeight - r.bottom;
      var above = r.top;
      if (below < listH + 8 && above > below) list.classList.add("up");
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

    /* v3.7.40：把输入值提交回原生 select：能精确匹配就采纳，否则还原为当前选中项。
       ⚠️ 必须声明在 **函数体根部**，不能放在下面 `if (EDITABLE) { … }` 块里 ——
       块内 `function` 声明违反 eslint `no-inner-declarations`（CI 实测红：
       `26355:7 error Move function declaration to function body root`）。
       非可编辑模式下 `trigger` 是 button、没有 .value，本函数永不会被调用。 */
    function commit(){
      if (!EDITABLE) return;
      var v = String(trigger.value || "").trim();
      if (!v) {                                   /* 清空 → 回到空值选项 */
        sel.value = "";
        sel.dispatchEvent(new Event("change", { bubbles: true }));
        inst.syncLabel();
        return;
      }
      var hit = null;
      Array.prototype.forEach.call(sel.options, function(o){
        if (!hit && o.value && (o.value === v || o.text === v || o.text.toLowerCase() === v.toLowerCase())) hit = o;
      });
      if (hit) {
        if (sel.value !== hit.value) {
          sel.value = hit.value;
          sel.dispatchEvent(new Event("change", { bubbles: true }));
        }
        trigger.value = hit.text;
      } else {
        inst.syncLabel();     /* 输入无效 → 还原，避免留下脏值 */
      }
    }

    /* ---------- 可编辑模式（combobox）的交互 ---------- */
    if (EDITABLE) {
      trigger.addEventListener("focus", function(){ if (OPEN !== inst) open(); });
      trigger.addEventListener("input", function(){
        dsRefresh(sel);                  /* 按输入过滤选项 */
        if (OPEN !== inst) open(); else open();   /* 保持展开 */
      });
      trigger.addEventListener("blur", function(){
        /* 延迟到选项的 mousedown 之后再提交（mousedown 先于 blur） */
        setTimeout(function(){
          if (OPEN === inst) dsClose();
          commit();
        }, 120);
      });
      trigger.addEventListener("keydown", function(e){
        var opts, idx;
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          if (OPEN !== inst) { open(); return; }
          opts = Array.prototype.slice.call(list.querySelectorAll(".ds-opt"));
          if (!opts.length) return;
          idx = opts.findIndex(function(o){ return o.classList.contains("is-active"); });
          idx = (e.key === "ArrowDown") ? (idx + 1) % opts.length : (idx - 1 + opts.length) % opts.length;
          opts.forEach(function(o){ o.classList.remove("is-active"); });
          opts[idx].classList.add("is-active");
          opts[idx].scrollIntoView({ block: "nearest" });
        } else if (e.key === "Enter") {
          e.preventDefault();
          var act = list.querySelector(".ds-opt.is-active");
          if (OPEN === inst && act) act.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
          else commit();
        } else if (e.key === "Escape") {
          dsClose(); commit();
        }
      });
    }

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

    /* v3.7.30：监听 options 变化 → 自动同步自绘 label。
       本项目很多 select 的 options 是**异步填充**的（最典型：#chatModelSelect
       由 AI 配置逻辑在启动后写入），而增强发生在 DOMContentLoaded，
       此时 options 还是空的 → label 恒为空串（用户："未配置 字样呢？"）。
       监听自身 childList 即可覆盖这种"先建后填"模式。 */
    if (window.MutationObserver) {
      var mo = new MutationObserver(function(){ dsRefresh(sel); });
      mo.observe(sel, { childList: true });
      inst.mo = mo;
    }
  }

  /** 批量增强（重渲染后对新出现的 select 调用即可，幂等） */
  function dsEnhanceAll(root){
    var list = (root || document).querySelectorAll("select");
    Array.prototype.forEach.call(list, function(s){
      /* v3.7.29：跳过日期面板里的时/分选择器（.dp-time 内）——
         它们空间紧凑、样式由 `.dp-time select` 统一控制，
         若被替换成 42px 高的自研触发器会把日期面板撑变形。 */
      if (s.closest && s.closest(".dp-time")) return;
      dsEnhance(s);
    });
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
    /* 测试门控：单测环境（__TEST_GATE__=true）**整段跳过**，连首次增强也不做 ——
       dsEnhanceAll 会同步增强 44 个 select（约 20-50ms），与 startup render
       （renderSide 注入 nav-item）竞争主线程；p1c-a11y 测试固定等 120ms 后断言
       #btnGear 存在，CI 的 ubuntu+Node20 更慢，把断言冲成偶发 null（实测踩到）。
       单测不测视觉，增强跳过无副作用；真实浏览器不受影响。 */
    if (window.__TEST_GATE__ === true) return;
    dsEnhanceAll(document);
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
