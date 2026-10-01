/**
 * executeAgentPlanReactive（v3.7.72 执行反馈回路）· 用例验证
 * ----------------------------------------------------------------------------
 * 架构：Plan-Confirm-Execute-Adapt（单 agent 分段校准）。executeAgentPlan（盲跑）
 * 保留作降级，本文件只测 Reactive 版的三条行为分支：
 *   ① 校准返回 continue → 剩余步骤按原计划跑完（replans=0）
 *   ② 校准返回 replan   → 剩余步骤被替换（原剩余不执行、新步骤落地、replans=1）
 *   ③ 校准调用抛错      → 静默按原计划继续（校准失败 ≠ 计划失败）
 * 另测：replan 次数封顶（MAX_REPLANS=2，第 3 次 replan 不再生效）。
 *
 * mock 方式同 agent-plan.test.js：win.chatOnce 覆盖；副作用用 getRec 断言。
 * 运行：npx vitest run tests/agent-reactive.test.js
 */
import { describe, it, expect } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

const PREFIX = "wb_agent_";

async function boot() {
  const win = loadApp({});
  win.localStorage.clear();
  await new Promise((r) => setTimeout(r, 60));
  win.__test._resetCrypto();
  win.__test.setActive("office");
  return win;
}

/** 5 步计划：段1 = 3 条 add_record(A1..A3)，段2 = 2 条 add_record(B1..B2) */
function makePlan() {
  const mk = (t) => ({ tool: "add_record", args: { scenario: "office", fields: { title: t } }, desc: t });
  return {
    goal: "深评测试目标",
    steps: [mk("A1"), mk("A2"), mk("A3"), mk("B1"), mk("B2"), mk("C1"), mk("C2"), mk("C3")],
  };
}

/** 记录文本列表 */
function recTexts(win) {
  return win.__test.getRec("office").map((r) => r.title || "");
}

describe("executeAgentPlanReactive（执行反馈回路）", () => {
  it("① 校准 continue：5 步按原计划全跑，replans=0", async () => {
    const win = await boot();
    const calls = [];
    win.chatOnce = async (messages) => {
      calls.push(messages);
      return { choices: [{ message: { role: "assistant", content: '{"action":"continue"}' } }] };
    };
    const r = await win.executeAgentPlanReactive(makePlan(), { goal: "深评测试目标" });
    expect(r.ok).toBe(true);
    expect(r.results.length).toBe(8);
    expect(r.results.every((x) => x.ok)).toBe(true);
    expect(r.replans).toBe(0);
    const texts = recTexts(win);
    ["A1", "A2", "A3", "B1", "B2", "C1", "C2", "C3"].forEach((t) => expect(texts).toContain(t));
    // 8 步 = 3 段 → 段间校准 2 次
    expect(calls.length).toBe(2);
    // 校准消息不进用户聊天 hist
    const chat = win.localStorage.getItem(PREFIX + "chat_office") || "[]";
    expect(chat).not.toContain("校准");
  });

  it("② 校准 replan：剩余步骤被替换（B1/B2 不执行，NEW 执行）", async () => {
    const win = await boot();
    let n = 0;
    win.chatOnce = async () => {
      n++;
      if (n === 1) {
        // 段1 后的校准：A1 失败了，B1/B2 没意义，换成 NEW
        return { choices: [{ message: { role: "assistant", content: JSON.stringify({
          action: "replan",
          steps: [{ tool: "add_record", args: { scenario: "office", fields: { title: "NEW" } } }],
        }) } }] };
      }
      return { choices: [{ message: { role: "assistant", content: '{"action":"continue"}' } }] };
    };
    const r = await win.executeAgentPlanReactive(makePlan(), { goal: "g" });
    expect(r.ok).toBe(true);
    expect(r.replans).toBe(1);
    const texts = recTexts(win);
    ["A1", "A2", "A3", "NEW"].forEach((t) => expect(texts).toContain(t));
    expect(texts).not.toContain("B1");
    expect(texts).not.toContain("B2");
  });

  it("③ 校准抛错：静默按原计划继续，不炸执行", async () => {
    const win = await boot();
    let n = 0;
    win.chatOnce = async () => {
      n++;
      if (n >= 2) throw new Error("calibration down");
      return { choices: [{ message: { role: "assistant", content: '{"action":"continue"}' } }] };
    };
    const r = await win.executeAgentPlanReactive(makePlan(), { goal: "g" });
    expect(r.ok).toBe(true);
    expect(r.results.length).toBe(8);
    expect(r.results.every((x) => x.ok)).toBe(true);
  });

  it("④ replans 封顶：连续 4 次都要求 replan，实际只生效 2 次", async () => {
    const win = await boot();
    let n = 0;
    win.chatOnce = async () => {
      n++;
      return { choices: [{ message: { role: "assistant", content: JSON.stringify({
        action: "replan",
        // replan 给 4 步（> SEG=3）：一段跑不完，才会留下尾巴触发下一次校准
        steps: ["Ra","Rb","Rc","Rd"].map(sfx => ({ tool: "add_record", args: { scenario: "office", fields: { title: "R" + n + sfx } } })),
      }) } }] };
    };
    const r = await win.executeAgentPlanReactive(makePlan(), { goal: "g" });
    expect(r.replans).toBe(2); // MAX_REPLANS = 2
    // 段1 执行 3 条（A1..A3），随后两次 replan 各替换剩余并各跑一段（3 步/段）
    const texts = recTexts(win);
    expect(texts).toContain("R1Ra");
    expect(texts).toContain("R2Ra");
    expect(texts).not.toContain("R3Ra"); // 第 3 次 replan 不生效
  });

  it("⑤ 危险工具在 Reactive 路径同样被拦成 needsConfirm", async () => {
    const win = await boot();
    win.chatOnce = async () => ({ choices: [{ message: { role: "assistant", content: '{"action":"continue"}' } }] });
    const plan = {
      goal: "g",
      steps: [
        { tool: "delete_task", args: { task_id: "x" }, desc: "删" },
        { tool: "add_record", args: { scenario: "office", fields: { title: "after" } }, desc: "记" },
      ],
    };
    win.__test.setTasks([
      { id: "x", sc: "office", title: "旧任务", due: "", priority: "", status: "todo", doneAt: null, note: "", tags: [], created: Date.now() },
    ]);
    const before = win.__test.getTasks().length;
    const r = await win.executeAgentPlanReactive(plan, { goal: "g" });
    expect(r.needsConfirm.length).toBe(1);
    expect(r.needsConfirm[0].tool).toBe("delete_task");
    expect(win.__test.getTasks().length).toBe(before); // 未被删
    expect(recTexts(win)).toContain("after");          // 后续非破坏步骤照常
  });
});
