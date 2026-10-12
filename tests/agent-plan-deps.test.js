/**
 * Agent 计划执行的两个 P0 修复（v3.7.120）
 * ----------------------------------------------------------------------------
 * 评估报告（docs/evaluation-agent-arch.md）点名的两个「真缺口」，本文件逐一钉住：
 *
 *   ① **步骤间数据依赖缺失** —— `_execPlanStep` 此前直接用规划时静态定死的 step.args，
 *      不把第 N 步的产出喂给第 N+1 步。于是「先 create_task 拿到 id、再用这个 id
 *      complete_task」这类**有依赖的多步任务**在自主计划链里根本做不了，只能退回对话链。
 *      修法：args 里支持 ${prev.字段名} 占位符，**执行时**解析（规划期模型不可能预知 id）。
 *
 *   ② **写操作无幂等键** —— create_task 是 tasks.push、add_record 是 unshift。
 *      重规划 / 断点续跑 / 读失败重试都会让同一步骤再跑一遍 → 写出重复数据，
 *      用户看到两条一模一样的任务。修法：同一计划内同 (tool, args) 的写步骤只真正执行一次。
 *
 * 为什么用**黑盒**（跑真实 executeAgentPlanReactive）而不是只测内部函数：
 *   这两个缺口的表现都在「多步之间的相互作用」上 —— 单测 _resolvePrevRefs 只能证明
 *   字符串替换对，证明不了「id 真的传到了下一步并被用上」。所以主用例走真实执行链，
 *   断言落在**用户能看到的后果**（任务真的被标记完成 / 库里真的只有一条）。
 *
 * 运行：npx vitest run tests/agent-plan-deps.test.js
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

/** 跑一个计划；whitelist 传 null = 不限工具（这两个用例不测白名单，那是既有测试的地盘） */
const run = (win, plan) => win.executeAgentPlanReactive(plan, { whitelist: null });

const tasksOf = (win, title) => win.getTasks().filter((t) => t.title === title);

describe("Agent 计划执行 · P0-1 步骤间数据依赖", () => {
  it("${prev.id} 把上一步的真实 id 交给了下一步，并被真正用上", async () => {
    const win = await boot();
    const TITLE = "依赖传递用例任务";

    const r = await run(win, {
      goal: "建任务然后把它标记完成",
      steps: [
        { tool: "create_task", args: { scenario: "office", title: TITLE }, desc: "建任务" },
        /* 关键：task_id 在规划期是**未知的**，只能写成占位符 */
        { tool: "complete_task", args: { task_id: "${prev.id}" }, desc: "用上一步的 id 标记完成" },
      ],
    });

    expect(r.ok).toBe(true);
    const created = JSON.parse(r.results[0].result);
    expect(created.id, "create_task 应返回 id").toBeTruthy();
    expect(r.results[1].ok, "第二步应成功（否则说明 id 没传过去）").toBe(true);

    /* 断言落在用户可见后果：那条任务真的变成了 done */
    const rows = tasksOf(win, TITLE);
    expect(rows).toHaveLength(1);
    expect(rows[0].status, "${prev.id} 没生效的话这里仍是 todo").toBe("done");
  });

  it("上一步失败时占位符替换为空串，不把字面量写进数据", async () => {
    const win = await boot();
    const r = await run(win, {
      goal: "上一步会失败",
      steps: [
        /* 故意让第一步失败：引用不存在的场景 → 工具如实报错 */
        { tool: "complete_task", args: { task_id: "__不存在的任务__" }, desc: "注定失败" },
        { tool: "create_task", args: { scenario: "office", title: "X-${prev.id}" }, desc: "引用失败结果" },
      ],
    });
    const created = JSON.parse(r.results[1].result);
    const task = win.getTasks().find((t) => t.id === created.id);
    /* 要么拿不到 id 而替换成空串，要么整步按工具自身规则失败 ——
       两种都可以，**不可以**的是把 "${prev.id}" 原样存进去 */
    if (task) expect(task.title).not.toContain("${prev");
  });

  it("没有占位符时 args 原样透传（不改变既有行为）", async () => {
    const win = await boot();
    const r = await run(win, {
      goal: "普通计划",
      steps: [{ tool: "create_task", args: { scenario: "office", title: "原样透传" }, desc: "建" }],
    });
    expect(r.results[0].ok).toBe(true);
    expect(tasksOf(win, "原样透传")).toHaveLength(1);
  });

  describe("_resolvePrevRefs 的边界", () => {
    it("嵌套路径 / 数组 / 非字符串原样保留", async () => {
      const win = await boot();
      const out = win._resolvePrevRefs(
        { a: "${prev.id}", b: ["${prev.deep.x}", 7], c: true, d: { e: "${prev.miss}" } },
        { id: "t1", deep: { x: "v" } }
      );
      expect(out).toEqual({ a: "t1", b: ["v", 7], c: true, d: { e: "" } });
    });

    it("未命中（字段不存在 / prev 为 null）→ 空串，不抛错", async () => {
      const win = await boot();
      expect(win._resolvePrevRefs({ a: "${prev.nope}" }, { id: "t1" })).toEqual({ a: "" });
      expect(win._resolvePrevRefs({ a: "${prev.id}" }, null)).toEqual({ a: "" });
    });

    it("句中出现的占位符也替换（不限于整串）", async () => {
      const win = await boot();
      expect(win._resolvePrevRefs("task-" + "${prev.id}" + "-suffix", { id: "t9" })).toBe("task-t9-suffix");
    });
  });
});

describe("Agent 计划执行 · P0-2 写操作幂等", () => {
  it("同一计划内重复的写步骤只真正写入一次", async () => {
    const win = await boot();
    const TITLE = "幂等测试：重复写步骤";

    /* 模拟「重规划/续跑把同一步骤又排了一遍」——两个 step 的 tool+args 完全相同 */
    const r = await run(win, {
      goal: "重复写同一条",
      steps: [
        { tool: "create_task", args: { scenario: "office", title: TITLE }, desc: "第一次" },
        { tool: "create_task", args: { scenario: "office", title: TITLE }, desc: "重规划后又来一次" },
      ],
    });

    expect(r.ok).toBe(true);
    expect(r.results[1].ok, "复用的那一步应记为成功（意图已达成）").toBe(true);
    /* 核心断言：库里只有一条 —— 修复前这里是 2 条 */
    expect(tasksOf(win, TITLE), "重复写步骤被真正执行了两次").toHaveLength(1);
  });

  it("args 不同的写步骤**不会**被误判为重复", async () => {
    const win = await boot();
    await run(win, {
      goal: "两条不同任务",
      steps: [
        { tool: "create_task", args: { scenario: "office", title: "幂等-甲" }, desc: "1" },
        { tool: "create_task", args: { scenario: "office", title: "幂等-乙" }, desc: "2" },
      ],
    });
    expect(tasksOf(win, "幂等-甲")).toHaveLength(1);
    expect(tasksOf(win, "幂等-乙"), "args 不同的写步骤被幂等逻辑误杀了").toHaveLength(1);
  });

  it("读操作重复执行**不**被去重（去重只针对写操作）", async () => {
    const win = await boot();
    /* 用调用计数而不是比对两次结果 —— 同一状态下 list_tasks 的结果本来就相同，
       靠结果差异证明不了"真的调了两次"。 */
    let calls = 0;
    const orig = win.execTool;
    win.execTool = function () {
      calls++;
      return orig.apply(this, arguments);
    };
    try {
      const r = await run(win, {
        goal: "查两次",
        steps: [
          { tool: "list_tasks", args: { scenario: "office" }, desc: "查" },
          { tool: "list_tasks", args: { scenario: "office" }, desc: "再查一次" },
        ],
      });
      expect(r.ok).toBe(true);
    } finally {
      win.execTool = orig;
    }
    /* 幂等表只对写操作生效。若读也被去重，会悄悄吞掉真实调用 —— 那是另一种静默。 */
    expect(calls, "读操作应被调用 2 次").toBe(2);
  });

  it("幂等键用规划时的原 args —— 占位符解析不会让它换键", async () => {
    const win = await boot();
    const TITLE = "幂等与依赖叠加";
    await run(win, {
      goal: "依赖 + 幂等",
      steps: [
        { tool: "create_task", args: { scenario: "office", title: TITLE }, desc: "建" },
        { tool: "complete_task", args: { task_id: "${prev.id}" }, desc: "完成" },
        /* 与第 2 步 tool+args 完全相同：第 2 步解析后 args 变成了真实 id，
           但幂等键必须仍按原 args（含占位符）算，所以这一步应被复用而非重复执行 */
        { tool: "complete_task", args: { task_id: "${prev.id}" }, desc: "重复的完成步骤" },
      ],
    });
    const rows = tasksOf(win, TITLE);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("done");
  });
});
