// ===== AI Layer (AI 层·子代理运行时) =====
/* ---------- SubAgent 运行时（2026-10-26 · Multi-Agent Phase 1，设计见 docs/agent-multi-agent-design.md） ----------
 * 协调模型：主对话循环是唯一协调者（Coordinator）；「派生子代理」对它只是一个工具（spawn_agent）。
 * 子代理在**隔离上下文**里用受限工具白名单跑完子目标，把最终报告作为工具结果交回。
 * 护栏：深度 1（白名单不含 spawn_agent——防递归）、步数预算（默认 12 / 硬顶 24）、
 *       abort 传播、危险工具二次确认不豁免（分发不带 force）、全部入诊断。
 * 持久化：wb_agent_subagents 注册表（键注册表已登记）；Code 模式 dock「进程」段实时消费。
 * 顺序执行：P1 无并发（单事件循环无竞态）；并发只读侦查留给 Phase 3（见设计文档 §三）。 */
const SUBAGENTS_KEY = PREFIX + "subagents";
const SUBAGENT_STEPS_DEFAULT = 12;
const SUBAGENT_STEPS_MAX = 24;
/* 默认工具白名单：只读侦查集。写工具须 spawn 时显式授予（写 = coordinator 明确授权的语义）。 */
const SUBAGENT_TOOLS_READONLY = ["list_tasks", "list_records", "list_notes", "search", "get_overview", "list_goals"];
let _subagents = null;

function _loadSubAgents(){
  if(_subagents) return _subagents;
  try{
    const v = load(SUBAGENTS_KEY, null);
    _subagents = (Array.isArray(v)) ? v : [];
  }catch(e){ _subagents = []; }
  return _subagents;
}
function _saveSubAgents(){ try{ _saveSubAgentsTick(); }catch(e){ try{ pushDiag("warn", "subagents save failed: "+((e&&e.message)||e), {where:"subagent"}); }catch(_e2){} } }
function _saveSubAgentsTick(){ save(SUBAGENTS_KEY, _subagents); }
function listSubAgents(){ return _loadSubAgents().slice(); }
function getSubAgent(id){ return _loadSubAgents().find(function(s){ return s.id === id; }) || null; }
function _touchSubAgent(id, patch){
  const it = _loadSubAgents().find(function(s){ return s.id === id; });
  if(!it) return;
  Object.assign(it, patch, { updatedAt: _nowIso() });
  _saveSubAgents();
}
/** 测试间复位内存态（__test 桥） */
function _resetSubAgents(){ _subagents = null; }

/**
 * 子代理循环：隔离上下文 + 受限工具 + 步数预算。
 * 工具分发与主循环同款（execTool），但**不带 force**——危险工具确认在子代理同样生效；
 * 白名单默认只读，正常路径根本碰不到危险工具。
 * @param {{id:string, name:string, role:string, goal:string, tools:string[], maxSteps:number}} spec
 * @param {{signal?:AbortSignal}} [opts]
 * @returns {Promise<{ok:boolean, result:string, steps:number}>}
 */
async function runSubAgent(spec, opts){
  const o = opts || {};
  const t0 = Date.now();
  const tools = (Array.isArray(spec.tools) && spec.tools.length) ? spec.tools : SUBAGENT_TOOLS_READONLY;
  const maxSteps = Math.min(Math.max(Number(spec.maxSteps) || SUBAGENT_STEPS_DEFAULT, 1), SUBAGENT_STEPS_MAX);
  const defs = effectiveTools().filter(function(td){ return tools.indexOf(td.function.name) >= 0; });
  _touchSubAgent(spec.id, { status: "running", steps: 0 });
  /* 隔离上下文：系统提示（角色 + 工具说明 + 边界）+ 用户目标。coordinator 的历史不进来。 */
  const sys = [
    String(spec.role || t("subagent.defaultRole", "你是一个被主代理委派的子代理，专注完成单一子目标。")),
    t("subagent.sysTools", "你只能使用列出的工具；把精力全部用于完成目标，不要发散。"),
    t("subagent.sysReport", "完成研究/操作后，用一段简洁的最终报告收尾（不再调用工具）——报告会交回主代理。")
  ].join("\n");
  const msgs = [
    { role: "system", content: sys },
    { role: "user", content: String(spec.goal || "") }
  ];
  let steps = 0, lastErr = "";
  try{
    for(let i = 0; i < maxSteps; i++){
      if(o.signal && o.signal.aborted){
        _touchSubAgent(spec.id, { status: "cancelled", ms: Date.now() - t0 });
        return { ok: false, result: t("subagent.cancelled", "已取消"), steps };
      }
      let resp;
      try{
        resp = await chatOnce(msgs, { tools: defs, signal: o.signal });
      }catch(e){
        lastErr = (e && e.message) || String(e);
        _touchSubAgent(spec.id, { status: "failed", result: lastErr, ms: Date.now() - t0 });
        return { ok: false, result: lastErr, steps };
      }
      const msg = (resp && resp.choices && resp.choices[0] && resp.choices[0].message) || null;
      if(!msg){ lastErr = "empty response"; break; }
      msgs.push(msg);
      const calls = msg.tool_calls || [];
      if(!calls.length){
        const report = String(msg.content || "").trim() || t("subagent.noReport", "（子代理未产出报告）");
        _touchSubAgent(spec.id, { status: "done", result: report, steps: steps, ms: Date.now() - t0 });
        return { ok: true, result: report, steps: steps };
      }
      /* 工具分发：白名单外与 spawn_agent 一律拒绝（深度 1；白名单即授权边界） */
      for(const c of calls){
        const name = c && c.function && c.function.name;
        let resultStr;
        if(name === "spawn_agent" || tools.indexOf(name) < 0){
          resultStr = JSON.stringify({ ok: false, msg: t("subagent.toolDenied", "该工具不在本子代理的授权清单内") });
        }else{
          let parsed = {};
          try{ parsed = JSON.parse(c.function.arguments || "{}"); }catch(e){ parsed = {}; }
          try{ resultStr = execTool(name, parsed); }
          catch(e){ resultStr = JSON.stringify({ ok: false, msg: (e && e.message) || String(e) }); }
        }
        msgs.push({ role: "tool", tool_call_id: (c && c.id) || "", content: String(resultStr).slice(0, 2000) });
        steps++;
      }
      _touchSubAgent(spec.id, { steps: steps });
    }
    /* 步数预算耗尽：拿最后一次模型输出当部分报告（如实标注截断） */
    const partial = (msgs.filter(function(m){ return m.role === "assistant" && m.content; }).pop() || {}).content || "";
    _touchSubAgent(spec.id, { status: "failed", result: t("subagent.budgetExhausted", "步数预算耗尽：") + String(partial).slice(0, 400), ms: Date.now() - t0 });
    return { ok: false, result: t("subagent.budgetExhausted", "步数预算耗尽：") + String(partial).slice(0, 400), steps };
  }catch(e){
    lastErr = (e && e.message) || String(e);
    _touchSubAgent(spec.id, { status: "failed", result: lastErr, ms: Date.now() - t0 });
    return { ok: false, result: lastErr, steps };
  }
}
/**
 * spawn_agent 工具实现（execTool 经 AppBridge 槽位调用——避免 ai-tools → ai-subagent → ai-loop →
 * ai-tools 的静态环）。校验参数 → runSubAgent → 返回报告字符串（coordinator 的工具结果）。
 */
async function spawnAgentImpl(args){
  const a = args || {};
  const goal = String(a.goal || "").trim();
  if(!goal) return JSON.stringify({ ok: false, msg: t("subagent.needGoal", "缺少子目标 goal") });
  const _loadSubAgents2 = _loadSubAgents();
  const n = _loadSubAgents2.length + 1;
  const spec = {
    id: "sa_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 6),
    name: String(a.name || (t("subagent.defaultName", "子代理-") + n)),
    role: String(a.role || t("subagent.defaultRole", "你是一个被主代理委派的子代理，专注完成单一子目标。")),
    goal: goal,
    tools: (Array.isArray(a.tools) && a.tools.length) ? a.tools.filter(function(x){ return typeof x === "string" && x !== "spawn_agent"; }) : SUBAGENT_TOOLS_READONLY.slice(),
    maxSteps: a.maxSteps,
    status: "queued", steps: 0, msgs: [], result: "",
    createdAt: _nowIso(), updatedAt: _nowIso(), ms: 0
  };
  _loadSubAgents().unshift(spec);
  if(_loadSubAgents().length > 20) _loadSubAgents().length = 20;   // 注册表只留最近 20 条（配额卫生）
  _saveSubAgents();
  const r = await runSubAgent(spec, {});
  return { ok: r.ok, agent: spec.name, agentId: spec.id, steps: r.steps, report: r.result };
}
/* AppBridge 槽位：execTool/AI 工具层经此调用（避免 ai-tools → ai-subagent → ai-loop → ai-tools 静态环） */
try{ if(typeof AppBridge !== "undefined") AppBridge.spawnAgentImpl = spawnAgentImpl; }catch(e){ /* noop */ }
/**
 * Phase 3：并行只读侦查（2026-10-26）。多个子代理同时跑（Promise.all，上限 3），
 * 工具**强制与只读集取交集**（写工具静默剥离——并行写入无协调，P3 铁律），
 * 全部完成后合并报告交回 coordinator。
 */
async function spawnAgentsParallelImpl(args){
  const raw = (Array.isArray(args && args.agents) ? args.agents : []);
  if(!raw.length) return { ok: false, error: t("subagent.parallelNeed", "缺少 agents 数组（每个含 goal）") };
  /* 如实报错，不静默截断/丢弃：调用方是模型，它会以为"全都跑了"。
     超限与缺 goal 都必须让协调者看到真实原因，自己决定怎么拆批。 */
  if(raw.length > 3){
    return { ok: false, error: t("subagent.parallelTooMany", "一次最多 3 个并行子代理（收到 %N% 个）——请减少数量或拆成多批").replace("%N%", String(raw.length)) };
  }
  const badGoals = [];
  raw.forEach(function(a, i){ if(!a || !String(a.goal || "").trim()) badGoals.push(i + 1); });
  if(badGoals.length){
    return { ok: false, error: t("subagent.parallelBadGoal", "第 %N% 项缺少 goal（并行清单里每项都必须有目标）").replace("%N%", badGoals.join(",")) };
  }
  const list = raw;
  const specs = list.map(function(a, i){
    const granted = (Array.isArray(a.tools) && a.tools.length)
      ? a.tools.filter(function(x){ return SUBAGENT_TOOLS_READONLY.indexOf(x) >= 0; })
      : SUBAGENT_TOOLS_READONLY.slice();
    return {
      id: "sa_" + Date.now().toString(36) + "_" + i + "_" + Math.random().toString(36).slice(2, 6),
      name: String(a.name || t("subagent.defaultName", "子代理-") + (i + 1)),
      role: String(a.role || t("subagent.defaultRole", "你是一个被主代理委派的子代理，专注完成单一子目标。")),
      goal: String(a.goal).trim(),
      tools: granted, maxSteps: a.maxSteps,
      status: "queued", steps: 0, msgs: [], result: "",
      createdAt: _nowIso(), updatedAt: _nowIso(), ms: 0
    };
  });
  specs.slice().reverse().forEach(function(s2){ _loadSubAgents().unshift(s2); });
  if(_loadSubAgents().length > 20) _loadSubAgents().length = 20;
  _saveSubAgents();
  const results = await Promise.all(specs.map(function(s2){ return runSubAgent(s2, {}); }));
  return {
    ok: results.every(function(r){ return r.ok; }),
    agents: specs.map(function(s2, i){ return { name: s2.name, ok: results[i].ok, steps: results[i].steps, report: results[i].result }; })
  };
}
try{ if(typeof AppBridge !== "undefined") AppBridge.spawnAgentsParallelImpl = spawnAgentsParallelImpl; }catch(e){ /* noop */ }
