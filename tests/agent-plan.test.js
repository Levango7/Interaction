/**
 * Agent 自主执行（v3.7.59 · 任务 #23）· 用例验证
 * ----------------------------------------------------------------------------
 * 这条链（agentPlanSysPrompt / parseAgentPlan / executeAgentPlan / summarizeAgentPlan /
 * chatOnceAgent）此前**写全了但零生产调用方、零测试**，而且 executeAgentPlan 用
 * execTool(...,force=true) 绕开危险操作二次确认 —— 同一个 delete_task 在对话路径要弹窗、
 * 在它这里直接删。本轮先堵洞、再给入口，所以用例分两组：
 *   ① 安全边界：破坏性步骤绝不落地、白名单在这条路径同样生效、步数封顶、
 *      规划提示词的可用工具清单与真实 TOOLS 同步（不再硬写 12 个）
 *   ② 真实入口：命令面板「让 AI 自主完成」→ 只出计划不动数据 → 回「确认执行」才执行 →
 *      其他内容取消；场景切换后陈旧的待确认计划自动作废
 *
 * 顶层 function 声明挂到 window，直接 win.xxx 调用；pendingAgentPlan 是 `let`（词法绑定），
 * 用可观测副作用（聊天历史 / 任务表）来断言。
 *
 * 运行：npx vitest run tests/agent-plan.test.js
 */
import { describe, it, expect } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

const PREFIX = "wb_agent_";

async function boot(cfg) {
  const win = loadApp({ storage: cfg ? { [PREFIX + "cfg"]: JSON.stringify(cfg) } : {} });
  win.localStorage.clear();
  await new Promise((r) => setTimeout(r, 60));
  win.__test._resetCrypto();
  if (cfg) win.localStorage.setItem(PREFIX + "cfg", JSON.stringify(cfg));
  win.__test.setActive("office");
  return win;
}

/** 让 chatOnce 固定返回一份 JSON 计划 */
function mockPlan(win, plan) {
  const calls = [];
  win.chatOnce = async (messages) => {
    calls.push(messages);
    return { choices: [{ message: { role: "assistant", content: "```json\n" + JSON.stringify(plan) + "\n```" } }] };
  };
  return calls;
}

const PLAN_MIXED = {
  goal: "整理本周并归档",
  steps: [
    { tool: "note_add", args: { title: "周记", content: "x" }, desc: "写一条周记" },
    { tool: "delete_task", args: { task_id: "del1" }, desc: "删掉旧任务" },
    { tool: "add_record", args: { scenario: "office", text: "已归档" }, desc: "记一笔" },
  ],
};

function seedTask(win, id, title) {
  win.__test.setTasks([
    { id, sc: "office", title, due: "", priority: "", status: "todo", doneAt: null, note: "", tags: [], created: Date.now() },
  ]);
}

/* =========================================================================
 * ① 安全边界
 * ========================================================================= */
describe("① Agent 自主执行 · 安全边界", () => {
  it("破坏性步骤绝不落地：delete_task 被拦成 needsConfirm，任务仍在，其余步骤照常跑完", async () => {
    const win = await boot();
    seedTask(win, "del1", "旧任务");
    const r = await win.executeAgentPlan(win.parseAgentPlan(JSON.stringify(PLAN_MIXED)), {});
    expect(win.findTask("del1"), "delete_task 绝不能被自主执行").not.toBeNull();
    expect(win.__test.getTasks().find((t) => t.id === "del1").deletedAt).toBeFalsy();
    expect(r.needsConfirm.map((s) => s.tool)).toEqual(["delete_task"]);
    expect(r.results.map((x) => x.ok)).toEqual([true, false, true]); // 不被一步卡死整盘
    expect(r.results[1].blocked).toBe(true);
    expect(r.summary).toContain("待确认已跳过");
    expect(r.summary).toContain("未自主执行");
  });

  it("白名单在自主执行路径同样生效（此前只有对话路径读它 → 换个入口就绕过开关）", async () => {
    const win = await boot({ toolWhitelist: "note_add" });
    const r = await win.executeAgentPlan(win.parseAgentPlan(JSON.stringify(PLAN_MIXED)), {});
    expect(r.results[0].ok, "note_add 在白名单内 → 允许").toBe(true);
    expect(r.results[2].ok, "add_record 不在白名单 → 跳过").toBe(false);
    expect(r.results[2].blocked).toBe(true);
    expect(r.results[2].result).toContain("不在允许列表");
  });

  it("步数封顶 12 且如实标注裁了多少（不静默丢弃）", async () => {
    const win = await boot();
    const big = { goal: "长计划", steps: [] };
    for (let i = 0; i < 30; i++) big.steps.push({ tool: "note_add", args: { title: "n" + i, content: "" }, desc: "第" + i + "步" });
    const plan = win.parseAgentPlan(JSON.stringify(big));
    expect(plan.steps.length).toBe(12);
    expect(plan.truncatedFrom).toBe(30);
    const txt = win.agentPlanReviewText(plan);
    expect(txt).toContain("原计划 30 步");
    expect(txt).toContain("已裁到 12 步");
  });

  it("规划提示词的可用工具清单来自真实 TOOLS，且排除需确认的工具", async () => {
    const win = await boot();
    const sys = win.agentPlanSysPrompt("随便");
    expect(sys, "真实工具应被列出（此前字典里硬写 12 个，add_record 等都不在）").toContain("add_record");
    expect(sys).toContain("generate_report");
    expect(sys, "破坏性工具不该出现在自主执行清单里").not.toContain("delete_task/");
    expect(sys).not.toMatch(/\/update_task\b/);
    expect(sys).toContain("需要用户在对话中逐项确认");
  });

  it("白名单收窄时，规划提示词里可点的工具跟着收窄", async () => {
    const win = await boot({ toolWhitelist: "note_add, create_task" });
    const names = win.agentPlannableTools();
    expect(names.sort()).toEqual(["create_task", "note_add"]);
    expect(win.agentPlanSysPrompt("x")).toContain("create_task/note_add");
  });

  it("cfg.agent=false 时即使用 > 显式触发也不给入口", async () => {
    const win = await boot({ agent: false });
    expect(win.buildCmds(">整理本周工作并归档").some((it) => String(it.label).startsWith(win.t("cmd.agentRun", "让 AI 自主完成：")))).toBe(false);
    const ok = await win.proposeAgentPlan("随便做点什么");
    expect(ok).toBe(false);
  });
});

/* =========================================================================
 * ② 真实入口：规划 → 评审 → 确认 → 执行
 * ========================================================================= */
describe("② Agent 自主执行 · 命令面板入口与确认闭环", () => {
  it("> 前缀出「让 AI 自主完成」，带原文（不被小写化）并剥掉前缀", async () => {
    const win = await boot();
    const items = win.buildCmds(">整理本周工作并归档");
    const hit = items[0];
    expect(hit.label).toBe(win.t("cmd.agentRun", "让 AI 自主完成：") + "整理本周工作并归档");
    expect(hit.label, "任务原文必须保留大小写与原始字符").toContain("整理本周工作并归档");
    expect(hit.label).not.toContain(">");
    expect(typeof hit.run).toBe("function");
    expect(hit.trackRecent, "不该污染「最近使用」").toBe(false);
  });

  it("普通查询不插这条（守住「无匹配」空态与结果首位不被抢占）", async () => {
    const win = await boot();
    const run = (q) => win.buildCmds(q).some((it) => String(it.label).startsWith(win.t("cmd.agentRun", "让 AI 自主完成：")));
    expect(run("整理本周工作并归档")).toBe(false);
    expect(win.buildCmds("zzzzz不存在").length, "无匹配时必须还是空态").toBe(0);
    expect(run(">x")).toBe(false);          // 前缀后面不足 2 字不给
    expect(run(">整理本周工作并归档")).toBe(true);
    const xjrw = win.buildCmds("xjrw");
    expect(xjrw[0].label, "拼音首字母仍应正常命中「新建任务」").toBe(win.t("cmd.newTask", "新建任务"));
  });

  it("点入口 = 只出计划，一个数据都不改；聊天里能看到步骤与「确认执行」引导", async () => {
    const win = await boot();
    seedTask(win, "del1", "旧任务");
    const calls = mockPlan(win, PLAN_MIXED);
    const ok = await win.proposeAgentPlan("整理本周并归档");
    expect(ok).toBe(true);
    expect(calls.length, "规划阶段只问模型一次").toBe(1);
    expect(win.__test.getTasks().find((t) => t.id === "del1").deletedAt, "规划阶段绝不落地").toBeFalsy();
    const last = win.getChat("office").slice(-1)[0];
    expect(last.role).toBe("assistant");
    expect(last.content).toContain("【执行计划】整理本周并归档");
    expect(last.content).toContain("⚠️ 需确认，不会自主执行");
    expect(last.content).toContain("确认执行");
  });

  it("回「确认执行」才真跑：非破坏步骤落地、破坏步骤仍不落地、汇总上屏、待确认清空", async () => {
    const win = await boot();
    seedTask(win, "del1", "旧任务");
    mockPlan(win, PLAN_MIXED);
    await win.proposeAgentPlan("整理本周并归档");
    const before = win.getChat("office").length;

    await win.onChatSubmit({ preventDefault() {}, target: { msg: { value: "确认执行" } } });

    const added = win.getChat("office").slice(before);
    expect(added.some((m) => /写一条周记/.test(String(m.content))), "应有执行汇总").toBe(true);
    expect(win.__test.getTasks().find((t) => t.id === "del1").deletedAt, "确认后也依旧不自主删除").toBeFalsy();
    // 待确认已清空：再发一条普通消息应走正常对话链路而不是「取消计划」
    win.chatOnce = async () => { throw new Error("SENTINEL"); };
    await win.onChatSubmit({ preventDefault() {}, target: { msg: { value: "接下来做什么" } } });
    const tail = String(win.getChat("office").slice(-1)[0].content || "");
    expect(tail, "不该被当成取消计划").not.toContain("已取消该执行计划");
  });

  it("发别的内容 = 取消计划，并把那句话照常记进历史（与危险操作取消同形）", async () => {
    const win = await boot();
    mockPlan(win, PLAN_MIXED);
    await win.proposeAgentPlan("整理本周并归档");
    await win.onChatSubmit({ preventDefault() {}, target: { msg: { value: "算了先不弄" } } });
    const h = win.getChat("office");
    expect(h.slice(-2).map((m) => m.content).join("\n")).toContain("算了先不弄");
    expect(h.slice(-1)[0].content).toContain("已取消该执行计划");
    // 取消后计划不再挂账：下一条正常消息不会被误当成"取消"
    win.chatOnce = async () => ({ choices: [{ message: { role: "assistant", content: "好的" } }] });
    await win.onChatSubmit({ preventDefault() {}, target: { msg: { value: "今天有什么安排" } } });
    expect(win.getChat("office").slice(-1)[0].content).toBe("好的");
  });

  it("模型没给出有效计划 → 如实报错，不留待确认状态", async () => {
    const win = await boot();
    win.chatOnce = async () => ({ choices: [{ message: { role: "assistant", content: "我想先问你几个问题" } }] });
    const ok = await win.proposeAgentPlan("帮我随便弄一下");
    expect(ok).toBe(false);
    const last = win.getChat("office").slice(-1)[0];
    expect(last.content).toContain("没有返回可执行的计划");
    expect(last._failed).toBe(true);
    win.chatOnce = async () => ({ choices: [{ message: { role: "assistant", content: "正常回复" } }] });
    await win.onChatSubmit({ preventDefault() {}, target: { msg: { value: "那正常聊" } } });
    expect(win.getChat("office").slice(-1)[0].content, "不该被计划待确认吞掉").toBe("正常回复");
  });

  it("切场景后陈旧的待确认计划自动作废（不会在新场景里被确认执行）", async () => {
    const win = await boot();
    mockPlan(win, { goal: "g", steps: [{ tool: "note_add", args: { title: "t", content: "" }, desc: "写笔记" }] });
    await win.proposeAgentPlan("写条笔记");
    win.__test.setActive("study");
    win.chatOnce = async () => ({ choices: [{ message: { role: "assistant", content: "换场景后正常回复" } }] });
    await win.onChatSubmit({ preventDefault() {}, target: { msg: { value: "确认执行" } } });
    const last = win.getChat("study").slice(-1)[0];
    expect(last.content, "应走正常对话而不是执行旧场景的计划").toBe("换场景后正常回复");
  });
});
