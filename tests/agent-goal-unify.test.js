/**
 * agent-goal-unify.test.js —— 两套拆解机制合一（v3.7.117，迭代计划该批）
 * ----------------------------------------------------------------------------
 * 背景（架构评估点名的第二块天花板）：产品里有**两套互不相认**的多步机制 ——
 *   ① 对话内 `plan/complete_step/complete_goal` 工具链（目标落 wb_agent_goals）；
 *   ② 命令面板 `>` 自主计划（评审态与执行进度此前在内存，v3.7.116 起落
 *      wb_agent_agent_run）。
 * 两套各存各的 → 「进行中目标 / 请继续执行第 N 步」的上下文注入（agentContextPrompt）
 * 只覆盖①，`>` 跑起来的计划在对话里**看不见**；用户也说不清"现在到底有几个任务在进行"。
 *
 * 本批把②并入①的存储：`>` 确认执行时写入同一个 goals（步骤带 src:"palette" 标记），
 * 执行进度同步勾选 steps，完成走 completeGoal。**入口保留**（评审体验更好），状态只有一份。
 * 不做：不改 `plan` 工具 schema（客户端与模型侧契约不动）。
 *
 * 验收（对应迭代计划）：
 *   ① 旧 goals 数据（无 src 字段）兼容读取，不崩、注入正常；
 *   ② `>` 确认后 goals 里有一条 active 记录（src=palette，text 来自步骤 desc）；
 *   ③ **刷新后**下一轮对话注入同样的「进行中目标 + 请继续执行第 N 步」—— 这才是合一的意义；
 *   ④ 两套入口共用单目标存储：`>` 之后再用对话 plan 工具建目标，active 只有一个（不并行两份）；
 *   ⑤ 执行进度同步勾选 goals 的 steps（runProgress 不再只写 agent_run）。
 */
import { describe, it, expect } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

const PREFIX = "wb_agent_";
const GOALS_KEY = PREFIX + "goals";

async function boot(cfg) {
  const win = loadApp({ storage: cfg ? { [PREFIX + "cfg"]: JSON.stringify(cfg) } : {} });
  win.localStorage.clear();
  await new Promise((r) => setTimeout(r, 60));
  win.__test._resetCrypto();
  if (cfg) win.localStorage.setItem(PREFIX + "cfg", JSON.stringify(cfg));
  win.__test.setActive("office");
  return win;
}
function mockPlan(win, plan) {
  win.chatOnce = async () => ({ choices: [{ message: { role: "assistant", content: "```json\n" + JSON.stringify(plan) + "\n```" } }] });
}
const goalsOf = (win) => JSON.parse(win.localStorage.getItem(GOALS_KEY) || "[]");
const activeGoals = (win) => goalsOf(win).filter((g) => g.status === "active");

describe("① 旧数据兼容（升级前写入的 goals 没有 src 字段）", () => {
  it("无 src 字段的旧记录照常读出、注入不崩", () => {
    const win = loadApp();
    win.localStorage.setItem(GOALS_KEY, JSON.stringify([
      { id: "g_old", title: "旧目标", sc: "office", steps: [{ text: "第一步", done: true }, { text: "第二步", done: false }], status: "active", ts: 1 },
    ]));
    expect(() => win.agentContextPrompt("随便")).not.toThrow();
    const ctx = win.agentContextPrompt("随便");
    expect(ctx).toContain("旧目标");
    expect(ctx).toContain("请继续执行第");
  });
});

describe("② `>` 计划确认后写入同一 goals 存储", () => {
  it("确认即写入 goals（src=palette、text 取步骤 desc）", async () => {
    const win = await boot();
    mockPlan(win, {
      goal: "整理本周",
      steps: [
        { tool: "note_add", args: { title: "A", content: "a" }, desc: "写周记" },
        { tool: "note_add", args: { title: "B", content: "b" }, desc: "记一笔" },
      ],
    });
    await win.proposeAgentPlan("整理本周");
    expect(goalsOf(win), "确认前不建目标（只出计划）").toHaveLength(0);
    await win.confirmAgentPlan();
    /* ⚠️ 两步都跑完 → completeGoal 收尾，此时记录是 done 而不是 active
       （"跑完即 done"由⑤ 专门守；这里验的是**写入的形状**）。 */
    const gs = goalsOf(win);
    expect(gs).toHaveLength(1);
    expect(gs[0].src).toBe("palette");
    expect(gs[0].title).toBe("整理本周");
    expect(gs[0].steps.map((s) => s.text)).toEqual(["写周记", "记一笔"]);
  });
});

describe("③ 刷新后注入同一目标（合一的核心意义）", () => {
  it("中途中止后刷新，下一轮对话仍注入「进行中目标 + 请继续第 N 步」", async () => {
    const a = await boot();
    mockPlan(a, {
      goal: "整理本周",
      steps: [
        { tool: "note_add", args: { title: "A", content: "a" }, desc: "写周记" },
        { tool: "note_add", args: { title: "B", content: "b" }, desc: "记一笔" },
        { tool: "note_add", args: { title: "C", content: "c" }, desc: "写总结" },
      ],
    });
    await a.proposeAgentPlan("整理本周");
    /* 中止：signal 已 abort → 执行立即返回 cancelled → 目标保持 active（未 completeGoal） */
    const ac = new AbortController();
    ac.abort();
    a.createChatController = () => ({ ac, timer: null });
    await a.confirmAgentPlan();

    /* 模拟刷新：同 storage 新 window */
    const storage = {};
    for (let i = 0; i < a.localStorage.length; i++) {
      const k = a.localStorage.key(i);
      storage[k] = a.localStorage.getItem(k);
    }
    const b = await boot();
    for (const k of Object.keys(storage)) b.localStorage.setItem(k, storage[k]);

    const ctx = b.agentContextPrompt("继续整理");
    expect(ctx, "刷新后目标必须还在同一个存储里").toContain("整理本周");
    expect(ctx).toContain("进行中目标");
    expect(ctx, "续跑话术对 > 机制也生效").toContain("请继续执行第");
    /* v3.7.116 的断点续跑记录也还在：两条链路指向同一件事 */
    expect(b.agentRunPending(), "agent_run 与 goals 是同一目标的两个视角").toBeTruthy();
  });
});

describe("④ 两套入口共用单目标存储", () => {
  it("`>` 之后再用对话 plan 工具建目标 → active 只有一个（不并行两份）", async () => {
    const win = await boot();
    mockPlan(win, {
      goal: "计划一",
      steps: [{ tool: "note_add", args: { title: "A", content: "a" }, desc: "写周记" }],
    });
    await win.proposeAgentPlan("计划一");
    const ac = new AbortController();
    ac.abort();
    win.createChatController = () => ({ ac, timer: null });
    await win.confirmAgentPlan();
    expect(activeGoals(win)).toHaveLength(1);

    /* 对话内 plan 工具（模型侧入口）—— 建新目标应顶替旧的，而不是并行第二份 */
    const r = win.execTool("plan", { goal: "计划二", steps: ["步骤X"] });
    expect(JSON.parse(r).ok).not.toBe(false);
    const gs = goalsOf(win);
    expect(gs.filter((g) => g.status === "active"), "同一存储、单目标聚焦").toHaveLength(1);
    expect(gs.find((g) => g.status === "active").title).toBe("计划二");
    expect(gs.some((g) => g.status === "done" && g.title === "计划一"), "旧目标被置 done 而不是并行").toBe(true);
  });
});

describe("⑤ 执行进度同步勾选 goals 步骤", () => {
  it("跑完的步骤在 goals 里标 done；全部完成 → completeGoal 收尾", async () => {
    const win = await boot();
    mockPlan(win, {
      goal: "写两条",
      steps: [
        { tool: "note_add", args: { title: "A", content: "a" }, desc: "写周记" },
        { tool: "note_add", args: { title: "B", content: "b" }, desc: "记一笔" },
      ],
    });
    await win.proposeAgentPlan("写两条");
    await win.confirmAgentPlan();
    const done = goalsOf(win).find((g) => g.title === "写两条");
    expect(done.status, "全部完成 → completeGoal").toBe("done");
    expect(done.steps.every((s) => s.done), "跑完的步骤都勾上了").toBe(true);
    expect(typeof done.summary).toBe("string");
  });
});
