/**
 * subagent.test.js —— Multi-Agent Phase 1：子代理运行时（2026-10-26）
 * ----------------------------------------------------------------------------
 * 设计：docs/agent-multi-agent-design.md（协调模型=coordinator 唯一决策者，
 * 「派生子代理」对它只是一个工具 spawn_agent；子代理在隔离上下文里用受限工具跑完并交回报告）。
 *
 * 守五件事：
 *  ① 派生 → 隔离循环产出报告 → 注册表记录 done（name/status/result）；
 *  ② 子代理**真实调工具**（list_tasks 走真 execTool 分发）并把工具结果送回上下文（两轮 LLM）；
 *  ③ 深度 1——子代理再派生被拒（runSubAgent 名字拒绝 + 无第二层注册表增长）；
 *  ④ 白名单外工具被拒（隔离边界：tools 之外的名单一律不给）；
 *  ⑤ 步数预算（maxSteps=1：tool_call 后预算耗尽，如实标注而非静默丢弃）。
 *
 * 测试纪律（与 oauth-check/sms-check 同款）：**假 LLM 走真循环**——win.fetch 桩按脚本回放
 * OpenAI 形状响应，服务端/客户端实现零 mock（execTool 真分发、注册表真落盘）。
 * 运行：npm test -- subagent
 */
import { describe, it, expect } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

const PREFIX = "wb_agent_";

/** 假 LLM：按调用次序回放脚本；返回已消耗的调用数读取器 */
function fakeLLM(win, script) {
  let i = 0;
  win.fetch = async (url) => {
    if (!String(url).includes("/chat/completions")) {
      return { ok: true, status: 200, json: async () => ({}) };
    }
    const step = script[Math.min(i, script.length - 1)];
    i++;
    return {
      ok: true, status: 200,
      json: async () => Object.assign({ usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }, step),
    };
  };
  return () => i;
}
const msg = (content) => ({ choices: [{ message: { role: "assistant", content } }] });
const calls = (arr) => ({ choices: [{ message: { role: "assistant", content: "", tool_calls: arr } }] });
const tc = (id, name, args) => ({ id, type: "function", function: { name, arguments: JSON.stringify(args) } });

function boot(extra) {
  return loadApp({ storage: Object.assign({
    [PREFIX + "onboarded"]: "true",
    [PREFIX + "cfg"]: JSON.stringify({ enabled: true, agent: true, profiles: [{ id: "p1", base: "https://fake.local/v1", model: "test-model", key: "k" }], activeId: "p1" }),
  }, extra || {}) });
}

describe("Multi-Agent P1：子代理运行时", () => {
  it("1: 派生 → 隔离循环产出报告 → 注册表记录 done（name/status/result）", async () => {
    const win = boot();
    fakeLLM(win, [msg("子代理报告：共 3 条任务，其中 1 条逾期。")]);
    const r = await win.spawnAgentImpl({ name: "盘点员", goal: "盘点当前任务", tools: ["list_tasks"] });
    expect(r.ok).toBe(true);
    expect(r.report).toContain("3 条任务");
    expect(r.agent).toBe("盘点员");
    const reg = JSON.parse(win.localStorage.getItem(PREFIX + "subagents"));
    expect(reg.length).toBe(1);
    expect(reg[0].status).toBe("done");
    expect(reg[0].name).toBe("盘点员");
    expect(reg[0].result).toContain("3 条任务");
  });

  it("2: 子代理真实调工具（list_tasks 走真 execTool）并把工具结果送回上下文", async () => {
    const win = boot({ [PREFIX + "tasks"]: JSON.stringify([{ id: "t1", sc: "office", title: "写周报", status: "todo", tags: [], created: 1 }]) });
    const consumed = fakeLLM(win, [
      calls([tc("c1", "list_tasks", { scenario: "office" })]),   // 子代理第 1 轮：调工具
      msg("报告：有 1 条任务「写周报」。"),                        // 子代理第 2 轮：收尾
    ]);
    const r = await win.spawnAgentImpl({ name: "盘点员", goal: "盘点任务", tools: ["list_tasks"] });
    expect(r.ok).toBe(true);
    expect(consumed()).toBe(2);   // 两轮 LLM（工具轮 + 收尾轮）
    const reg = JSON.parse(win.localStorage.getItem(PREFIX + "subagents"));
    expect(reg[0].steps).toBe(1);
  });

  it("3: 深度 1——子代理再派生被拒，无第二层注册表增长", async () => {
    const win = boot();
    fakeLLM(win, [
      calls([tc("c1", "spawn_agent", { goal: "嵌套派生" })]),   // 子代理试图再派生
      msg("收到拒绝，改为直接汇报：无。"),
    ]);
    const r = await win.spawnAgentImpl({ name: "a", goal: "x", tools: ["list_tasks"] });
    expect(r.ok).toBe(true);
    const reg = JSON.parse(win.localStorage.getItem(PREFIX + "subagents"));
    expect(reg.filter((s2) => s2.status === "done").length).toBe(1);   // 只有 coordinator 这一层
  });

  it("4: 白名单外工具被拒（隔离边界：delete_task 不在 tools）", async () => {
    const win = boot({ [PREFIX + "tasks"]: JSON.stringify([{ id: "t1", sc: "office", title: "别删我", status: "todo", tags: [], created: 1 }]) });
    fakeLLM(win, [
      calls([tc("c1", "delete_task", { task_id: "t1" })]),   // 白名单外
      msg("被拒，改为汇报：任务仍在。"),
    ]);
    const r = await win.spawnAgentImpl({ name: "a", goal: "x", tools: ["list_tasks"] });
    expect(r.ok).toBe(true);
    /* 白名单外的删除从未真正执行：任务原样还在 */
    expect(JSON.parse(win.localStorage.getItem(PREFIX + "tasks"))[0].title).toBe("别删我");
  });

  it("5: 步数预算（maxSteps=1：tool_call 后预算耗尽，如实标注）", async () => {
    const win = boot();
    let n = 0;
    win.fetch = async () => ({ ok: true, status: 200, json: async () => Object.assign({ usage: { total_tokens: 2 } }, calls([tc("c" + (++n), "list_tasks", {})])) });
    const r = await win.spawnAgentImpl({ name: "a", goal: "x", tools: ["list_tasks"], maxSteps: 1 });
    expect(r.ok).toBe(false);
    expect(r.report).toContain("预算");
    const reg = JSON.parse(win.localStorage.getItem(PREFIX + "subagents"));
    expect(reg[0].status).toBe("failed");
  });

  it("6: 并行只读侦查（spawn_agents_parallel）——两个子代理同时跑、合并报告回 coordinator", async () => {
    const win = boot({ [PREFIX + "tasks"]: JSON.stringify([{ id: "t1", sc: "office", title: "写周报", status: "todo", tags: [], created: 1 }]) });
    /* 两个并行循环各消费一轮：回放顺序无所谓（内容同形、断言按集合） */
    fakeLLM(win, [msg("侦查A：任务表 1 条。"), msg("侦查B：无异常。")]);
    const r = await win.spawnAgentsParallelImpl({ agents: [
      { name: "侦查A", goal: "盘点任务", tools: ["list_tasks"] },
      { name: "侦查B", goal: "看看有没有异常", tools: ["list_tasks"] },
    ]});
    expect(r.ok).toBe(true);
    expect(r.agents.length).toBe(2);
    expect(r.agents.every((a) => a.ok)).toBe(true);
    const reg = JSON.parse(win.localStorage.getItem(PREFIX + "subagents"));
    expect(reg.filter((s2) => s2.status === "done").length).toBe(2);
  });

  it("7: 并行的写工具被强制剥离（只读交集铁律）——即使显式授予 delete_task 也不给", async () => {
    const win = boot();
    fakeLLM(win, [msg("ok"), msg("ok"), msg("ok")]);
    const r = await win.spawnAgentsParallelImpl({ agents: [
      { name: "a", goal: "试试写工具", tools: ["delete_task", "list_tasks"] },   // delete_task 被剥离
      { name: "b", goal: "x", tools: ["list_tasks"] },
      { name: "c", goal: "x", tools: ["list_tasks"] },
    ]});
    expect(r.ok).toBe(true);
    expect(r.agents.length).toBe(3);
    const reg = JSON.parse(win.localStorage.getItem(PREFIX + "subagents"));
    const writer = reg.find((s2) => s2.name === "a");
    expect(writer.tools).not.toContain("delete_task");   // 写工具被剥离（并行无协调，铁律）
    expect(writer.tools).toContain("list_tasks");
  });

  it("9: 超限/缺 goal 如实报错，不静默截断——模型不会以为「全都跑了」", async () => {
    const win = boot();
    fakeLLM(win, [msg("ok")]);
    const tooMany = await win.spawnAgentsParallelImpl({ agents: [
      { name: "a", goal: "x" }, { name: "b", goal: "x" },
      { name: "c", goal: "x" }, { name: "d", goal: "x" },
    ]});
    expect(tooMany.ok).toBe(false);
    expect(tooMany.error).toContain("3");
    expect(tooMany.agents).toBeUndefined();
    // 一个都不该跑起来（拒绝要发生在派发之前）
    const reg0 = JSON.parse(win.localStorage.getItem(PREFIX + "subagents") || "[]");
    expect(reg0.length).toBe(0);

    const badGoal = await win.spawnAgentsParallelImpl({ agents: [
      { name: "a", goal: "x" }, { name: "b", goal: "   " },
    ]});
    expect(badGoal.ok).toBe(false);
    expect(badGoal.error).toContain("2");   // 指明第 2 项缺 goal
    expect(JSON.parse(win.localStorage.getItem(PREFIX + "subagents") || "[]").length).toBe(0);
  });

  it("8: 会话内子代理卡片——spawn 流渲染为卡片（状态徽章 + 报告），非子代理结果不受影响", () => {
    const win = boot();
    win.toggleUIMode(); win.toggleUIMode();   // 回 Work（卡片与模式无关，验证纯渲染）
    const agentId = "sa_test1";
    win.localStorage.setItem(PREFIX + "subagents", JSON.stringify([
      { id: agentId, name: "盘点员", status: "done", steps: 2, result: "报告：3 条任务，1 条逾期。" },
    ]));
    win._resetSubAgents();   // 重置懒加载缓存，让 getSubAgent 从 localStorage 读到播种数据
    win.__test.setTasks([]);   // 不需要任务数据
    win.localStorage.setItem(PREFIX + "chat_office", JSON.stringify([
      { role: "user", content: "盘点一下任务", createdAt: "2026-10-27T10:00:00.000Z" },
      { role: "assistant", content: "", tool_calls: [{ id: "c1", type: "function", function: { name: "spawn_agent", arguments: JSON.stringify({ name: "盘点员", goal: "盘点" }) } }], createdAt: "2026-10-27T10:00:01.000Z" },
      { role: "tool", tool_call_id: "c1", content: JSON.stringify({ ok: true, agent: "盘点员", agentId: agentId, steps: 2, report: "报告：3 条任务，1 条逾期。" }), createdAt: "2026-10-27T10:00:02.000Z" },
      { role: "assistant", content: "盘点完成：3 条任务，1 条逾期。", createdAt: "2026-10-27T10:00:03.000Z" },
    ]));
    win._reloadChatsFromStorage();
    win.renderChat();
    const html = win.document.getElementById("chat").innerHTML;
    expect(html).toContain("subagent-card");
    expect(html).toContain("盘点员");
    expect(html).toContain("报告：3 条任务，1 条逾期。");
    expect(html).not.toContain("调用工具 spawn_agent");   // 卡片取代了通用工具行
  });
});
