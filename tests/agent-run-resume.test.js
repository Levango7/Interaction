/**
 * agent-run-resume.test.js —— 自主执行断点续跑（v3.7.116，迭代计划该批）
 * ----------------------------------------------------------------------------
 * 背景（架构评估点名的天花板之首）：`>` 自主计划的**评审态与执行进度此前只在内存** ——
 * 执行到一半刷新页面，进度就地丢失，用户只能从头再来（已完成的步骤会不会重跑全凭运气）。
 * 本批把「未完成的执行」落成一份盘上记录（wb_agent_agent_run，容量 1 份），
 * 刷新后可原地续跑。
 *
 * 本文件守的验收（对应迭代计划的验收标准）：
 *   ① 确认执行即落盘；全部完成即清档；
 *   ② 中途中止（取消/异常）**保留**盘上记录 —— 可续跑的前提；
 *   ③ 刷新恢复：新页面读到未完成记录与「第 N/共 M 步」提示；
 *   ④ 续跑只跑剩余步骤，done 里标记过的不重跑；
 *   ⑤ **done 权威**：done 说跑过就是跑过 —— 即使数据现状对不上（如笔记不存在），
 *      续跑也不重建那一步（摘要只用于提示，实际状态以存储为准；与 mv 冲突同口径）；
 *   ⑥ 放弃执行清档；无档时续跑入口返回 false。
 *
 * 手法：执行链路用真 execTool（note_add 副作用可观测：notes 键），
 * 「刷新」用「同一 storage 再 boot 一个 window」模拟。
 */
import { describe, it, expect } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

const PREFIX = "wb_agent_";
const RUN_KEY = PREFIX + "agent_run";

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
const plan3 = (n) => ({
  goal: "写三条笔记",
  steps: [1, 2, 3].map((i) => ({ tool: "note_add", args: { title: "N" + i, content: "c" + i }, desc: "写笔记 " + i })),
});
const notesOf = (win) => JSON.parse(win.localStorage.getItem(PREFIX + "notes") || "[]");
const runOf = (win) => JSON.parse(win.localStorage.getItem(RUN_KEY) || "null");

describe("① 落盘与清档", () => {
  it("全部执行完成即清档（且真的落了三步）", async () => {
    const win = await boot();
    mockPlan(win, plan3(3));
    await win.proposeAgentPlan("写三条笔记");
    await win.confirmAgentPlan();
    /* ⚠️ 这条**不能**用来证明"落盘"—— 不落盘时它也成立（假绿）。
       盘上记录的形态由②（中止保留）与③（续跑）钉死。 */
    expect(runOf(win), "全部完成后应清档").toBe(null);
    expect(notesOf(win)).toHaveLength(3);
  });

  it("执行中落盘：异常中止时记录还在（含已完成步骤）", async () => {
    const win = await boot();
    mockPlan(win, plan3(3));
    await win.proposeAgentPlan("写三条笔记");
    /* ⚠️ 不能靠"让 execTool 抛错"来中断：_execPlanStep 内部 catch 了单步异常
       （按失败步继续），执行整体不抛。这里 stub 执行器本身 —— 本用例要钉的是
       confirmAgentPlan 的**持久化契约**（确认即写、done 随 onProgress 追加、异常不清档），
       不是执行器的内部行为（那有 agent-reactive 的用例守）。 */
    const realExec = win.executeAgentPlanReactive;
    win.executeAgentPlanReactive = async (plan, opts) => {
      opts.onProgress(1, 3, plan.steps[0], "ok0", { stepOk: true });
      opts.onProgress(2, 3, plan.steps[1], "ok1", { stepOk: true });
      throw new Error("boom");          // 执行整体炸 → confirmAgentPlan 进 catch
    };
    await win.confirmAgentPlan();
    win.executeAgentPlanReactive = realExec;
    const rec = runOf(win);
    expect(rec, "异常中止必须留下可续跑的记录").toBeTruthy();
    expect(rec.done.length, "前两步的进度要在盘上").toBe(2);
    expect(rec.steps).toHaveLength(3);
    expect(win.agentRunPending(), "有未完成步骤 → pending 非空").toBeTruthy();
  });
});

describe("③ 刷新恢复与续跑", () => {
  /** 造一个「上一个页面跑到第 2 步」的盘上记录 */
  function seedRun(win, doneCount) {
    const steps = plan3(3).steps;
    win.localStorage.setItem(RUN_KEY, JSON.stringify({
      goal: "写三条笔记", text: "写三条笔记", sc: "office", steps,
      done: steps.slice(0, doneCount).map((s, i) => ({ i, tool: s.tool, ok: true })),
      at: Date.now(),
    }));
  }
  it("新页面读到未完成执行与「第 N/共 M 步」提示", async () => {
    const a = await boot();
    seedRun(a, 2);
    const storage = {};
    for (let i = 0; i < a.localStorage.length; i++) {
      const k = a.localStorage.key(i);
      storage[k] = a.localStorage.getItem(k);
    }
    const b = await boot();           // 模拟刷新：同 storage 新 window
    for (const k of Object.keys(storage)) b.localStorage.setItem(k, storage[k]);
    const p = b.agentRunPending();
    expect(p, "刷新后必须能读到未完成执行").toBeTruthy();
    expect(p.total).toBe(3);
    expect(p.done).toBe(2);
    const notice = b.agentRunNotice();
    /* 「第 N/共 M 步」的 N 是**当前所在步**（done+1=3），不是已完成数 —— 别写成 done，
       那会让用户以为只剩 0 步。M 是总步数。 */
    expect(notice).toContain("共 3");
    expect(notice).toContain("继续执行");
    expect(notice).toContain("放弃执行");
  });

  it("续跑只跑剩余步骤（done 里的不重跑）", async () => {
    const win = await boot();
    seedRun(win, 2);
    const before = notesOf(win).length;
    const r = await win.continueAgentRun();
    expect(r.ok).toBe(true);
    expect(r.executed, "只应执行剩下的 1 步").toBe(1);
    expect(notesOf(win)).toHaveLength(before + 1);
    expect(runOf(win), "全部完成后清档").toBe(null);
  });

  it("done 权威：done 标记过但数据不在 → 不重建那一步", async () => {
    const win = await boot();
    seedRun(win, 2);                  // 声称前两步已跑过，但 notes 其实是空的
    expect(notesOf(win)).toHaveLength(0);
    const r = await win.continueAgentRun();
    expect(r.executed).toBe(1);       // 只跑第 3 步
    expect(notesOf(win)).toHaveLength(1);   // 前两步不会被"补写"
  });

  it("放弃执行清档；无档时续跑返回 false", async () => {
    const win = await boot();
    seedRun(win, 1);
    expect(win.agentRunPending()).toBeTruthy();
    win.discardAgentRun();
    expect(runOf(win)).toBe(null);
    expect(win.agentRunPending()).toBe(null);
    const r = await win.continueAgentRun();
    expect(r.ok).toBe(false);
  });
});
