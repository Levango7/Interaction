/**
 * empty-catch-slice10.test.js —— R-2 第十片（render-overview：3 处 P0-a）
 * ----------------------------------------------------------------------------
 * 本片三处都在概览页的**用户可见副作用**上，静默的共同代价是「界面照旧正常，实际已经不对了」：
 *   ① _dgmSave —— 图表画布每次改动都调（**高频**）。写不进去就悄悄没了：用户画半天，
 *      下次打开是空的，全程无提示。按分档③，留痕必须**节流**，否则诊断面板被同一条刷满。
 *   ② _wfRunFlow 的 lastRun 落盘失败 —— 下次检查时这条**仍在到期窗口内** → 工作流被**重复执行**
 *      （重复建待办 / 重复写笔记）。这不是"少一条日志"，是会真污染用户数据 → error 级 + toast。
 *   ③ _wfCheckDue —— 原为整体 try：第一条 flow 抛异常会让**后面全部静默跳过**（批量只做一半）。
 *      改为逐个处理，且**同步异常与 Promise 拒绝两条路都接**（见下）。
 *
 * 🔴 ③ 的关键细节（本条用例存在的理由）：`_wfRunFlow` 是 **async**。
 *    async 函数体内抛错**不会**同步抛出，只会让返回的 Promise 变 rejected；
 *    因此只写 `try{ _wfRunFlow(...) }catch(_){}` 等于没接 —— 真实失败会退化成
 *    **unhandled rejection，同样一声不吭**。所以用例同时钉两条路：
 *      (a) 同步抛错（_wfDueAt 或同步替代实现）→ 后面的 flow 仍须执行；
 *      (b) 返回 rejected Promise → 必须留痕（若实现漏接，本例会以 unhandled rejection 变红）。
 *
 * 反向守护同样重要：**全正常时零诊断** —— 可观测性不能反过来制造噪声。
 *
 * ⚠️ jsdom 要点：mock localStorage 必须打 `Storage.prototype`（jsdom 的 Storage 是 Proxy，
 *    实例层赋值静默失效 → 断言收到空数组的**空转绿**）。
 *
 * 运行：node_modules/.bin/vitest run tests/empty-catch-slice10.test.js   （需拼回态）
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { loadApp } from "./helpers/loadApp.js";
import fs from "node:fs";
import path from "node:path";
import { scanSource, keyOf } from "../scripts/lib/empty-catch.mjs";

const SRC = path.resolve(process.cwd(), "src", "render-overview.js");
const CORE = path.resolve(process.cwd(), "src", "core.js");
const BASE_PATH = path.resolve(process.cwd(), "scripts", "lint-empty-catch.baseline.json");

let win, toasts, diagCalls, DIAGRAM_KEY;
let savedSaveAiConfig, savedChatOnce, savedRunFlow, savedDueAt;

function installProbes() {
  toasts = [];
  diagCalls = [];
  Object.defineProperty(win, "toast", { configurable: true, value: (msg, kind) => toasts.push({ msg: String(msg), kind }) });
  Object.defineProperty(win, "pushDiag", { configurable: true, value: (level, msg, ctx) => diagCalls.push({ level, msg, ctx }) });
}

/** 让若干 key 的 setItem 抛错（模拟配额满写不进去） */
function failWriteOn(keys) {
  const proto = win.Storage.prototype;
  const orig = proto.setItem;
  proto.setItem = function (k, v) {
    if (keys.indexOf(k) !== -1) throw new Error("QuotaExceededError");
    return orig.call(this, k, v);
  };
  return () => { proto.setItem = orig; };
}

const diagOf = (where) => diagCalls.filter((d) => d.ctx && d.ctx.where === where);
const toastOf = (re) => toasts.filter((t) => re.test(t.msg));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** 把 _dgmSave 的一次性节流标记复位，好让"只报第一次"这条能被真正验证 */
function resetDgmWarned() {
  try { win.eval("_dgmSaveWarned = false"); } catch (_) { /* 不可达时靠用例顺序：首条即为首报 */ }
}

/** 复原被用例替换的全局实现（否则会串到后续用例与后台 60s 定时器上） */
function restoreStubs() {
  win.saveAiConfig = savedSaveAiConfig;
  win.chatOnce = savedChatOnce;
  win._wfRunFlow = savedRunFlow;
  win._wfDueAt = savedDueAt;
  installProbes();
}

beforeAll(async () => {
  win = loadApp({ storage: { wb_agent_onboarded: "true" } });
  win.fetch = async function () { throw new Error("no-net-in-test"); };
  await wait(250);
  DIAGRAM_KEY = win.eval("DIAGRAM_KEY");
  savedSaveAiConfig = win.saveAiConfig;
  savedChatOnce = win.chatOnce;
  savedRunFlow = win._wfRunFlow;
  savedDueAt = win._wfDueAt;
  installProbes();
});

beforeEach(() => {
  restoreStubs();
  /* 后台有 setTimeout(_wfCheckDue, 3000) / setInterval(..., 60000)：让它即便触发也无 flow 可跑，
     避免自动运行污染断言。 */
  win.saveAiConfig("workflow", { flows: [] });
  resetDgmWarned();
});

afterAll(() => {
  try { win && win.close && win.close(); } catch (_) { /* jsdom 关闭失败不影响断言 */ }
});

describe("① 图表保存：每次改动都调的高频写，失败必须说一次", () => {
  it("写失败 → warn 留痕 + 归因 _dgmSave，且三次只报一次（节流）", () => {
    expect(typeof win._dgmSave, "_dgmSave 应是可探测的全局函数").toBe("function");
    const restore = failWriteOn([DIAGRAM_KEY]);
    try {
      win._dgmSave({ n: 1 });
      win._dgmSave({ n: 2 });
      win._dgmSave({ n: 3 });
    } finally {
      restore();
    }
    const hits = diagOf("_dgmSave");
    expect(hits, "高频路径留痕必须节流：三次只应有一次").toHaveLength(1);
    expect(hits[0].level).toBe("warn");
    expect(hits[0].msg, "要能看出是「这次的改动没保住」这个后果").toMatch(/未保留|save failed/);
  });

  it("反向守护：写成功 → 零诊断（正常路径不许产生噪声）", () => {
    win._dgmSave({ ok: 1 });
    expect(diagCalls, "正常保存不该产生任何诊断").toHaveLength(0);
  });
});

describe("② 工作流 lastRun 落盘：写不进去 = 会被重复执行", () => {
  it("落盘失败 → error 级诊断 + warn toast（双通道，因它会污染数据）", async () => {
    /* 先真实写入一条 flow，使 _wfRunFlow 走到 lastRun 分支（flows[idx] 必须存在） */
    win.saveAiConfig("workflow", { flows: [{ name: "T" }] });
    /* AI 未配置 → 走「降级为待办提醒」分支，避免用例真去建笔记 */
    win.chatOnce = async function () { throw new Error("no-ai-in-test"); };
    win.saveAiConfig = function () { throw new Error("QuotaExceededError"); };

    await win._wfRunFlow(0, { name: "T" });

    const d = diagOf("_wfRunFlow");
    expect(d, "落盘失败必须留痕：否则这条工作流下次仍到期 → 重复执行").toHaveLength(1);
    expect(d[0].level).toBe("error");
    expect(d[0].ctx.flow).toBe("T");
    expect(toastOf(/重复执行/).length, "重复执行影响的是用户数据，必须当面告知").toBeGreaterThan(0);
  });

  it("反向守护：lastRun 正常落盘 → 零诊断", async () => {
    win.saveAiConfig("workflow", { flows: [{ name: "T" }] });
    win.chatOnce = async function () { throw new Error("no-ai-in-test"); };
    await win._wfRunFlow(0, { name: "T" });
    expect(diagOf("_wfRunFlow"), "正常路径不该留痕").toHaveLength(0);
  });
});

describe("③ _wfCheckDue：一条崩了不拖累其余", () => {
  function seedThreeFlows() {
    win.saveAiConfig("workflow", { flows: [{ name: "A" }, { name: "B" }, { name: "C" }] });
    win._wfDueAt = function () { return Date.now(); }; // 三条全部到期
  }

  it("同步抛错的那条不影响后续 flow 执行", () => {
    seedThreeFlows();
    const calls = [];
    win._wfRunFlow = function (i) {
      calls.push(i);
      if (i === 0) throw new Error("boom-sync");
      return Promise.resolve();
    };
    win._wfCheckDue();
    expect(calls, "第一条崩了，后两条仍须执行（原整体 try 会全部跳过）").toEqual([0, 1, 2]);
    const d = diagOf("_wfCheckDue");
    expect(d).toHaveLength(1);
    expect(d[0].level).toBe("error");
    expect(d[0].ctx.flow, "要归因到具体工作流，而不是一句通用的失败").toBe("A");
  });

  it("🔴 async 体抛错 → Promise 拒绝也要留痕（同步 try 抓不到，会退化成 unhandled rejection）", async () => {
    seedThreeFlows();
    const calls = [];
    win._wfRunFlow = function (i) {
      calls.push(i);
      return i === 1 ? Promise.reject(new Error("boom-async")) : Promise.resolve();
    };
    win._wfCheckDue();
    await wait(0); // 等拒绝处理器的微任务跑完
    expect(calls).toEqual([0, 1, 2]);
    const d = diagOf("_wfCheckDue");
    expect(d, "只接同步 try 等于没接：真实失败是 rejected promise").toHaveLength(1);
    expect(d[0].ctx.flow).toBe("B");
  });

  it("反向守护：无到期 flow → 零诊断", () => {
    win.saveAiConfig("workflow", { flows: [{ name: "A", schedule: { freq: "off" } }] });
    win._wfCheckDue();
    expect(diagCalls, "没有到期项时不该有任何留痕").toHaveLength(0);
  });
});

describe("④ 静态契约", () => {
  it("🔴 直接复用门禁逻辑：本文件不得被判出任何新增 P0", () => {
    const raw = fs.readFileSync(SRC, "utf8");
    const base = JSON.parse(fs.readFileSync(BASE_PATH, "utf8"));
    const baseKeys = new Set(base.items.map(keyOf));
    const newP0 = scanSource(raw, "render-overview.js", {}).filter((i) => i.level === "P0" && !baseKeys.has(keyOf(i)));
    expect(newP0.map((i) => i.line), "不该有新增 P0（内层改动会连坐外层 sig）").toEqual([]);
  });

  it("i18n：lastRun 失败文案中英双份齐备，且实现经 t() 取值", () => {
    const core = fs.readFileSync(CORE, "utf8");
    const n = (core.match(/"wf\.lastRunSaveFailed"/g) || []).length;
    expect(n, "zh / en 两份字典都要有").toBe(2);
    expect(fs.readFileSync(SRC, "utf8")).toMatch(/toast\(t\("wf\.lastRunSaveFailed"/);
  });
});
