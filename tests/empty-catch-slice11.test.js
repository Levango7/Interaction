/**
 * empty-catch-slice11.test.js —— R-2 第十一片（ai-tools：最后 2 处 bare P0）
 * ----------------------------------------------------------------------------
 * 本片与前九片**性质不同，先说清为什么不是"再填一处日志"**：
 *
 * 两处（`executeAgentPlan` 内联体 · `_execPlanStep` 公共体）都是同一行
 *     let rj = null; try{ rj = JSON.parse(resultStr); }catch(_){}
 * 门禁把它判成 P0，是因为 tryBody 只含 `rj = JSON.parse(resultStr)` —— 但**语义上这不是谎报**：
 *   解析失败 → rj 保持 null → 下一行 `stepOk = !!(rj && rj.ok !== false)` 得 **false**
 *   → 该步如实记为失败（`results.push({... ok:false})`）、读操作会重试、
 *   `consecFail` 照常累加并触发重规划，且 `resultStr` 原文会被 `_execLine` 回喂给模型。
 * 也就是说：**失败被如实上报，信息没丢**，属于判据④「回落默认 = 预期降级」。
 * 故本片的处置是「补上**说明理由**的注释 + 用行为用例把这条约定钉死」，而不是加诊断噪声
 * （该路径每步都走 = 判据③ 高频，报了只会刷满诊断面板）。
 *
 * 用例的价值在于**防复发**：这类"看起来无害"的一行，最容易被后人改成
 * `stepOk = true` 或把解析失败吞成成功 —— 那才会真的变成谎报。
 *
 * 运行：node_modules/.bin/vitest run tests/empty-catch-slice11.test.js   （需拼回态）
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { loadApp } from "./helpers/loadApp.js";
import fs from "node:fs";
import path from "node:path";
import { scanSource, keyOf } from "../scripts/lib/empty-catch.mjs";

const SRC = path.resolve(process.cwd(), "src", "ai-tools.js");
const BASE_PATH = path.resolve(process.cwd(), "scripts", "lint-empty-catch.baseline.json");

/* 三个工具名，用于精确落进三条不同的分支（都不在 DANGER_CONFIRM_TOOLS / ASYNC_TOOL_NAMES 里）：
   read = 读操作（失败自动重试）· write = 写操作（不重试） */
const READ_TOOL = "list_tasks";
const WRITE_TOOL = "create_task";

let win, toasts, diagCalls;

function installProbes() {
  toasts = [];
  diagCalls = [];
  Object.defineProperty(win, "toast", { configurable: true, value: (msg, kind) => toasts.push({ msg: String(msg), kind }) });
  Object.defineProperty(win, "pushDiag", { configurable: true, value: (level, msg, ctx) => diagCalls.push({ level, msg, ctx }) });
}

const NON_JSON = "这是一份纯文本报告，不是 JSON";

beforeAll(async () => {
  win = loadApp({ storage: { wb_agent_onboarded: "true" } });
  win.fetch = async function () { throw new Error("no-net-in-test"); };
  await new Promise((r) => setTimeout(r, 250));
  installProbes();
});

beforeEach(() => {
  installProbes();
  win.execTool = function () { return JSON.stringify({ ok: true, msg: "default" }); };
});

afterAll(() => {
  try { win && win.close && win.close(); } catch (_) { /* jsdom 关闭失败不影响断言 */ }
});

/** 造一个单步计划；执行前先按需把 execTool 换成受控实现 */
async function runPlan(execImpl, tool) {
  const used = tool || READ_TOOL;
  win.execTool = execImpl;
  return win.executeAgentPlan(
    { goal: "列举任务", steps: [{ tool: used, args: {}, desc: "列任务" }] },
    { whitelist: new Set([used]) }
  );
}

describe("① executeAgentPlan：非 JSON 必须按失败计，且原文不丢", () => {
  it("🔴 非 JSON → ok:false（不许把解析失败当成功），且原文原样保留", async () => {
    const r = await runPlan(function () { return NON_JSON; });
    expect(r.results, "单步计划应产生一条结果").toHaveLength(1);
    expect(r.results[0].ok, "解析不出来就拿不到 ok，故必须如实计为失败").toBe(false);
    expect(r.results[0].result, "原文必须保留并回喂模型，不许因解析失败被丢弃").toContain("纯文本报告");
    expect(r.summary, "汇总里应体现失败而不是成功").toMatch(/失败|0 步成功/);
  });

  it("反向守护：合法 JSON {ok:true} → ok:true（不得把成功也判成失败）", async () => {
    const r = await runPlan(function () { return JSON.stringify({ ok: true, msg: "done" }); });
    expect(r.results[0].ok).toBe(true);
  });

  it("既有语义不许被改坏：合法 JSON {ok:false} → ok:false", async () => {
    const r = await runPlan(function () { return JSON.stringify({ ok: false, msg: "nope" }); });
    expect(r.results[0].ok).toBe(false);
  });

  it("既有语义不许被改坏：工具**抛异常**（非解析问题）同样记失败", async () => {
    const r = await runPlan(function () { throw new Error("tool blew up"); });
    expect(r.results[0].ok).toBe(false);
    expect(r.results[0].result).toMatch(/tool blew up/);
  });
});

describe("② _execPlanStep：同一约定 + 只有读操作重试", () => {
  it("非 JSON → stepOk:false、原文保留，且**读操作恰好重试一次**（共 2 次调用）", async () => {
    let calls = 0;
    win.execTool = function () { calls++; return NON_JSON; };
    const res = await win._execPlanStep({ tool: READ_TOOL, args: {}, desc: "列任务" }, new Set([READ_TOOL]));
    expect(res.stepOk, "非 JSON 不等于成功").toBe(false);
    expect(res.resultStr, "原文要留给 _execLine 回喂模型").toContain("纯文本报告");
    expect(calls, "读操作失败自动重试一次：共 2 次").toBe(2);
  });

  it("写操作非 JSON → **不重试**（可能已生效，重试有副作用），只调用 1 次", async () => {
    let calls = 0;
    win.execTool = function () { calls++; return NON_JSON; };
    const res = await win._execPlanStep({ tool: WRITE_TOOL, args: {}, desc: "建任务" }, new Set([WRITE_TOOL]));
    expect(res.stepOk).toBe(false);
    expect(calls, "写操作不自动重试").toBe(1);
  });

  it("反向守护：合法 JSON 一次成功 → 不重试，且全程零诊断噪声", async () => {
    let calls = 0;
    win.execTool = function () { calls++; return JSON.stringify({ ok: true, msg: "ok" }); };
    const res = await win._execPlanStep({ tool: READ_TOOL, args: {}, desc: "列任务" }, new Set([READ_TOOL]));
    expect(res.stepOk).toBe(true);
    expect(calls, "成功就不该重试").toBe(1);
    expect(diagCalls, "这条约定是预期降级：正常路径与失败路径都不产生诊断噪声").toHaveLength(0);
  });
});

describe("③ 静态契约：这两处不得复辟成「无理由的裸 catch」", () => {
  it("🔴 两处 JSON.parse 回落点都必须带理由说明（bare=false）", () => {
    const raw = fs.readFileSync(SRC, "utf8");
    const items = scanSource(raw, "ai-tools.js", {});
    const sites = items.filter((i) => /JSON\.parse\(resultStr\)/.test(i.snippet));
    expect(sites.length, "两处 JSON.parse 回落都应被扫描到（少于 2 处说明有人把它改成非空 catch 或删了）").toBe(2);
    const bare = sites.filter((i) => i.bare).map((i) => i.line);
    expect(bare, "复辟成裸 catch = 作者没评估过；说明必须写在 catch 体内").toEqual([]);
    expect(sites.every((i) => i.level === "P0"), "分级的归属不变（P0 由 tryBody 决定，与本片的说明无关）").toBe(true);
    /* 🔴 门禁的 `bare` 只问「有没有注释」，不问「说明白了没有」—— 星号包里写个 noop 这种
       零信息标注也能骗过它（第七片发现）。故这里再钉一层：说明必须讲清为什么可以静默。 */
    for (const i of sites) {
      expect(i.note, `ai-tools.js:${i.line} 的说明要讲清理由，不能是零信息标注`).toMatch(/失败计/);
    }
  });

  it("🔴 直接复用门禁逻辑：本文件不得被判出任何新增 P0", () => {
    const raw = fs.readFileSync(SRC, "utf8");
    const base = JSON.parse(fs.readFileSync(BASE_PATH, "utf8"));
    const baseKeys = new Set((base.items || base).map(keyOf));
    const newP0 = scanSource(raw, "ai-tools.js", {}).filter((i) => i.level === "P0" && !baseKeys.has(keyOf(i)));
    expect(newP0.map((i) => i.line), "不该有新增 P0（注释落在 catch 体内不改 tryBody sig）").toEqual([]);
  });
});
