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
      /* v3.7.44：触发框若不在视口内，先把它滚进来再定位 ——
         否则列表整块渲染在视口之外（实测 1080x555 视口、页面未滚到表单时打开：
         列表 top=695 > 视口高 555，可见高度为 0），用户感知就是"点开了却什么都没有/没法滑"。 */
      try{
        const r0 = trigger.getBoundingClientRect();
        if (r0.bottom < 0 || r0.top > window.innerHeight) trigger.scrollIntoView({ block: "center" });
      }catch(_e){}
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
      /* v3.7.44：空间判定必须用「**实际可见区**」而不是 window 视口 ——
         踩过（用户 2026-09-25 截图"无法滑动"的第二个真因）：
         列表的绝对定位祖先链上有滚动容器（.main-wrap，overflow-y:auto），
         它会**裁切**超出自身可见矩形的后代 —— 而列表是它内部的绝对定位元素。
         旧判定按 window.innerHeight 算出"上方放得下"→ 向上翻到 top=23，
         但 .main-wrap 的可见顶边在 y≈110，列表 23~110 那段被裁掉：
         上半截点不到、滚不动（elementFromPoint 命中的是顶栏按钮），
         下半截悬在窗口里 —— 用户看到的就是"被硬切一段、滑不动"。
         ✓ 现在：向上找最近的**裁切滚动容器**，用「视口 ∩ 容器可见矩形」当边界，
           上下各算可用空间，选空间大的一侧，并把 max-height 压到该侧放得下 ——
           列表从此完整可见，不会被裁，自然就能滚。 */
      var clip = null, p = trigger.parentElement;
      while (p && p !== document.body){
        /* overflow 非 visible 即建立裁切（auto/scroll/hidden/clip 都算），
           与容器当前是否真的在滚无关 */
        if (getComputedStyle(p).overflowY !== "visible"){ clip = p; break; }
        p = p.parentElement;
      }
      var topBound = 0, botBound = window.innerHeight;
      if (clip){
        var cr = clip.getBoundingClientRect();
        topBound = Math.max(topBound, cr.top);
        botBound = Math.min(botBound, cr.bottom);
      }
      var belowSpace = botBound - r.bottom - 6;
      var aboveSpace = r.top - topBound - 6;
      var useDown = belowSpace >= aboveSpace;
      var space = Math.max(120, useDown ? belowSpace : aboveSpace);
      if (useDown) list.classList.remove("up"); else list.classList.add("up");
      list.style.maxHeight = Math.min(264, Math.round(space)) + "px";
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
  /* v3.7.44 修复「列表滑着滑着就没了 / 完全滑不动」（用户 2026-09-25 截图再反馈）。
     ── v3.7.43 第一版修复为什么还不够 ──
       实现：列表内滚动记时间戳；外层滚动仅在"最近 250ms 内滚过列表"时豁免。
       实测（_probe/diag-555.mjs，1080x555 视口）仍会误关：滚轮一滚 → open:false。
       两个原因：
       ① 滚动链传播时**外层容器的 scroll 事件与列表的到达顺序不保证**，
          一旦外层那条落在 250ms 宽限窗之外，列表照样被关 —— 时间窗是在赌时序；
       ② 更根本的是，"页面滚动就关"这个前提在本项目**不成立**：
          .ds-list 是 position:absolute 定位于 .ds-select（与触发框同一包含块），
          .main-wrap 滚动时列表与触发框**一起位移**，根本不会错位。
          当初那条规则针对的是"列表不跟随滚动"的场景，在这里属于过度关闭。
     ── v3.7.44 新实现：只按「是否真的错位」判定，与滚动源无关 ──
       · 事件源在列表内 → 是用户在滚列表，直接放行；
       · 其它任何滚动 → 等一帧（rAF，让滚动布局生效）后量两者间距：
         列表仍紧贴触发框（间距 ≤24px）→ 没错位 → 保持打开；
         间距 >24px → 真错位（如列表被布局甩开）→ 关闭。
       判据不依赖事件到达顺序，也不再需要魔法时间窗。 */
  window.addEventListener("scroll", function(e){
    if (!OPEN) return;
    const t = e && e.target;
    const src = (t && t.nodeType === 1) ? t : document.documentElement;
    if (src === OPEN.list || (OPEN.list.contains && OPEN.list.contains(src))) return;
    requestAnimationFrame(function(){
      if (!OPEN) return;
      try{
        const tr = OPEN.trigger.getBoundingClientRect();
        const lr = OPEN.list.getBoundingClientRect();
        /* 间距取"列表在触发框下方/上方"两种几何里的实际缝隙；重叠视为 0 */
        const gap = (lr.top >= tr.bottom) ? (lr.top - tr.bottom)
                  : (lr.bottom <= tr.top) ? (tr.top - lr.bottom) : 0;
        if (gap > 24) dsClose();
      }catch(_e){ /* 量测失败不致崩溃，保持现状 */ }
    });
  }, true);

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
