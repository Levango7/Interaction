// ===== Core Layer (核心层·命令注册表) =====
/* ---------- 命令注册表（P0-4） ----------
 * 为什么要有它：命令面板（ui-palette）本身已经很成熟 —— 拼音首字母、模糊匹配、命中高亮、
 * 最近使用都有。缺的是**规则**：此前命令是散着注册的，于是
 *   ① 快捷键撞车静默发生（`ui-hotkeys.js` 里的 `e.key==="n"` 与 acts 里的 `sub:"N"`
 *     是两套东西，改了前者忘了后者，用户看到的就是错的提示）；
 *   ② 没人知道"到底有哪些命令"；
 *   ③ 新命令无约束地往里加。
 * 本文件把类规则变成机械：**注册即校验**（缺字段 / id 重复 / 键位撞车 → 不注册 + console.error），
 * 并且 `label/keys/run` 只有一份 —— 面板的快捷键提示（sub）从 keys 生成，不再手写第二遍。
 *
 * 设计取舍（本笔刻意收窄）：
 *   · 只迁 `buildCmds` 的 acts 入口；`ui-hotkeys.js` 的按键分发**本笔不迁**（它牵扯 Esc 链式关闭、
 *     1-6 场景切换、输入态豁免等另一套逻辑，风险自成一笔，板上已声明第二步）。
 *   · 因此 `keys` 字段本笔只填**确有其键**的那几条（与 hotkeys 现状对齐），不借机"补全"一批
 *     并不存在的快捷键 —— 填了就是假提示，比没有更贵。
 */
  /** 规范化键位串："Ctrl+Shift+Z" / " shift + ctrl + z " → "ctrl+shift+z" */
  function _cmdNormKey(k){
    return String(k || "").toLowerCase().split("+").map(s => s.trim()).filter(Boolean).sort().join("+");
  }

  /**
   * 建一个**独立**的注册表实例（产品用单例 `CMD`；测试/沙盒用 makeRegistry() 拿干净实例）
   * @returns {{register:Function, all:Function, get:Function, findByKeys:Function}}
   */
  function makeRegistry(){
    const items = [];
    const byId = new Map();
    const byKeys = new Map();   // 规范键位 → id

    function register(cmd){
      /* ① 形状校验：缺一不可 —— 面板里出现"有名字点了没反应"的死项是最坏的用户体验。
         label 接受两种形态：`label`（固定文本）或 `labelKey`（i18n 键）。
         **凡是要跟随语言切换的，必须用 labelKey** —— 注册时用 t() 立即求值的话，
         用户切成英文后命令名还是中文（这是把"把 label 抄进注册表"最容易踩的坑）。 */
      const hasLabel = !!(cmd && (cmd.label || cmd.labelKey));
      if(!cmd || !cmd.id || !hasLabel || typeof cmd.run !== "function"){
        console.error("[cmd-registry] 拒绝注册：必须同时有 id / (label|labelKey) / run", cmd && (cmd.id || "(无 id)"));
        return false;
      }
      /* ② id 唯一：重复 id 不得覆盖既有条目（覆盖会让同一命令指向两个行为） */
      if(byId.has(cmd.id)){
        console.error("[cmd-registry] 拒绝注册：id 重复 →", cmd.id, "（既有条目：" + (byId.get(cmd.id).label || byId.get(cmd.id).labelKey) + "）");
        return false;
      }
      /* ③ 键位查重：撞车即拒。**先检完全部键位再落表**，避免"注册了一半"的中间态 */
      const keys = Array.isArray(cmd.keys) ? cmd.keys.map(_cmdNormKey).filter(Boolean) : [];
      for(const k of keys){
        const owner = byKeys.get(k);
        if(owner){
          console.error("[cmd-registry] 拒绝注册：键位撞车「" + k + "」已被 " + owner + " 占用（本条 " + cmd.id + "）");
          return false;
        }
      }
      for(const k of keys) byKeys.set(k, cmd.id);
      const entry = Object.assign({}, cmd, { keys: Array.isArray(cmd.keys) ? cmd.keys.slice() : [] });
      byId.set(cmd.id, entry);
      items.push(entry);
      return true;
    }

    return {
      register: register,
      all: function(){ return items.slice(); },
      get: function(id){ return byId.get(id) || null; },
      /** 按键位找命令 id（找不到返回 null）—— 给 hotkeys 迁移后用 */
      findByKeys: function(k){ return byKeys.get(_cmdNormKey(k)) || null; },
      size: function(){ return items.length; }
    };
  }

/* 产品单例。用 var（不是 const）：内联脚本里 const 只在脚本作用域，**不挂 window**，
   而测试与其它块都要能通过 window 访问到它（`win.CMD`）。 */
var CMD = makeRegistry();
var registerCmd = CMD.register;

  /* 快捷键提示（sub）从 keys 生成 —— 与 hotkeys 同源，不再手写第二遍。
     只在确有键时生成，故不会给原本没有 sub 的命令凭空添一行。 */
  function keyHint(keys){
    const k = (keys && keys[0]) || "";
    return k ? k.toUpperCase() : "";
  }

  /* 测试桥：loadApp 的 window 上可直接拿（与项目其余测试同一风格，不另造 __test 通道） */
