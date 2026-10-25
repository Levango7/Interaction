/**
 * mcp-resilience.test.js —— B6：MCP 调用的韧性与延迟可见（2026-10-26）
 * ----------------------------------------------------------------------------
 * 钉的是**取舍**，不只是"重试能用"：
 *   ① 幂等腿（initialize / notifications/initialized / tools/list）瞬态失败**会**重试并如实记账；
 *   ② `tools/call` **一次都不重放** —— 远端写工具重放＝可能重复执行，客户端没资格猜幂等性。
 *      这是整批里唯一"不能放宽"的边界，所以既有行为断言（恰好 1 个请求）也有名单级反向对照。
 *   ③ 只有瞬态类重试：网络抛错 / 429 / 5xx 重试；4xx 鉴权与 JSON-RPC 语义错**不重试**
 *      （把一次失败拖成三次不叫韧性，叫噪音）。
 *   ④ 延迟与重试次数真的有读数、真的进诊断报告 —— 没样本时如实说没有，不编数。
 * 用替身 fetch 驱动，不联网；`cfg.mcpRetryBaseMs=0` 让退避不真等（该配置项只为可测性存在，不进设置页）。
 */
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadApp } from "./helpers/loadApp.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const AI_TOOLS = readFileSync(join(ROOT, "src/ai-tools.js"), "utf8");
const PREFIX = "wb_agent_";
const windows = [];
afterEach(() => windows.splice(0).forEach((w) => w.close()));

/** 每台服务器退避置 0（真实时长另有 ④ 的边界用例守），其余按默认 */
function boot(extraCfg) {
  const win = loadApp({ storage: { [PREFIX + "onboarded"]: "true",
    [PREFIX + "cfg"]: JSON.stringify(Object.assign({ mcpRetryBaseMs: 0 }, extraCfg || {})) } });
  windows.push(win);
  if (typeof win.__test._resetCrypto === "function") win.__test._resetCrypto();
  return win;
}
function srv(win, name, allow) {
  win.__test.saveAiConfig("mcp", { servers: [{ name: name || "srv", url: "http://127.0.0.1:31337/mcp",
    enabled: true, allow: allow || [] }] });
}
const ok = (result) => ({ kind: "res", result });
const boom = (status) => ({ kind: "status", status });
const reject = () => ({ kind: "reject" });
const rpcErr = (msg) => ({ kind: "rpcError", msg });
const DEFAULT_TOOLS = [{ name: "echo", description: "回显", inputSchema: { type: "object", properties: {} } }];

function jsonRes(payload, status) {
  const body = JSON.stringify(payload);
  return { ok: status >= 200 && status < 300, status,
    headers: { get: (k) => (String(k).toLowerCase() === "content-type" ? "application/json" : null) },
    text: async () => body };
}
/**
 * 替身 fetch：按 method 给"逐次判定"脚本（数组按第 N 次调用取，末项重复生效；没写的腿一律成功）。
 * calls 里带 JSON-RPC id —— 重放语义要看 id 是否复用。
 */
function scripted(win, script) {
  const calls = [];
  const seen = {};
  win.fetch = async (url, init) => {
    const body = init && init.body ? JSON.parse(init.body) : null;
    const method = body && body.method;
    seen[method] = (seen[method] || 0) + 1;
    calls.push({ method, id: body && body.id, n: seen[method] });
    const plan = script[method];
    const verdict = plan ? plan[Math.min(plan.length - 1, seen[method] - 1)] : null;
    if (method === "notifications/initialized" && (!verdict || verdict.kind === "res")) {
      return { ok: true, status: 202, headers: { get: () => null }, text: async () => "" };
    }
    if (!verdict) return jsonRes({ jsonrpc: "2.0", id: body && body.id, result: defaultResult(method) }, 200);
    if (verdict.kind === "res") return jsonRes({ jsonrpc: "2.0", id: body && body.id, result: verdict.result }, 200);
    if (verdict.kind === "reject") throw new TypeError("Failed to fetch");
    if (verdict.kind === "status") return jsonRes({ jsonrpc: "2.0", id: body && body.id, error: { code: 1, message: "不该被解析到" } }, verdict.status);
    if (verdict.kind === "rpcError") return jsonRes({ jsonrpc: "2.0", id: body && body.id, error: { code: -32000, message: verdict.msg } }, 200);
    throw new Error("未知判定");
  };
  return { calls };
}
function defaultResult(method) {
  if (method === "initialize") return { protocolVersion: "2025-03-26", capabilities: {} };
  if (method === "tools/list") return { tools: DEFAULT_TOOLS };
  if (method === "tools/call") return { content: [{ type: "text", text: "远端回答" }] };
  return {};
}
const countOf = (calls, method) => calls.filter((c) => c.method === method).length;

describe("① 幂等腿：瞬态失败会重试，并如实记次数", () => {
  it("initialize 首次网络抛错 → 第二次成功；用户看到成功，账上 3 条样本 / 4 个请求", async () => {
    const win = boot();
    srv(win, "srv");
    const { calls } = scripted(win, { initialize: [reject(), ok({ protocolVersion: "2025-03-26" })] });
    const r = await win.__test.mcpRefreshServer("srv");
    expect(r.ok, "重试后应当成功，实际 err=" + r.err).toBe(true);
    expect(countOf(calls, "initialize"), "首发 + 1 次重试").toBe(2);
    const st = win.__test.mcpLatencyStats("srv");
    expect(st.n, "三条腿各记一条").toBe(3);
    expect(st.attempts, "initialize 多发了一个请求").toBe(4);
    expect(st.fail, "最终成功 ⇒ 不计失败").toBe(0);
  });

  it("tools/list 连续 500 → 重试到上限（共 3 次）后如实失败", async () => {
    const win = boot();
    srv(win, "srv");
    const { calls } = scripted(win, { "tools/list": [boom(500)] });
    const r = await win.__test.mcpRefreshServer("srv");
    expect(r.ok).toBe(false);
    expect(countOf(calls, "tools/list"), "1 首发 + MCP_RETRY_MAX(2) 次重试").toBe(3);
    const st = win.__test.mcpLatencyStats("srv");
    expect(st.last.method).toBe("tools/list");
    expect(st.last.ok).toBe(false);
    expect(st.last.attempts).toBe(3);
    expect(st.fail, "失败的调用要计入 fail，不能只报延迟").toBe(1);
  });

  it("重试沿用同一个 JSON-RPC id（服务端按 id 去重时这才是幂等重放）", async () => {
    const win = boot();
    srv(win, "srv");
    const { calls } = scripted(win, { "tools/list": [reject(), ok({ tools: [] })] });
    await win.__test.mcpRefreshServer("srv");
    const list = calls.filter((c) => c.method === "tools/list");
    expect(list.length).toBe(2);
    expect(list[1].id, "重放的 id 必须与首发相同").toBe(list[0].id);
  });

  it("429 算瞬态（退避后可恢复），403 不算", async () => {
    const win = boot();
    srv(win, "a");
    const c1 = scripted(win, { "tools/list": [boom(429), ok({ tools: DEFAULT_TOOLS })] });
    expect((await win.__test.mcpRefreshServer("a")).ok).toBe(true);
    expect(countOf(c1.calls, "tools/list")).toBe(2);

    const win2 = boot();
    srv(win2, "b");
    const c2 = scripted(win2, { "tools/list": [boom(403)] });
    const r2 = await win2.__test.mcpRefreshServer("b");
    expect(r2.ok).toBe(false);
    expect(r2.err).toMatch(/HTTP 403/);
    expect(countOf(c2.calls, "tools/list"), "鉴权类 4xx 重试只是噪音").toBe(1);
  });

  it("JSON-RPC 语义错（服务端明确报错）不重试", async () => {
    const win = boot();
    srv(win, "srv");
    const { calls } = scripted(win, { "tools/list": [rpcErr("no such method")] });
    const r = await win.__test.mcpRefreshServer("srv");
    expect(r.ok).toBe(false);
    expect(r.err).toMatch(/no such method/);
    expect(countOf(calls, "tools/list"), "语义错重发还是语义错").toBe(1);
  });
});

describe("② 幂等边界：写腿一次都不重放（安全边界，不是省事空间）", () => {
  it("tools/call 网络失败 → 恰好 1 个请求，且如实返回失败话术", async () => {
    const win = boot();
    srv(win, "srv", ["echo"]);
    const { calls } = scripted(win, { "tools/call": [reject()] });
    expect((await win.__test.mcpRefreshServer("srv")).ok).toBe(true);
    const r = await win.__test.mcpCallTool("mcp__srv__echo", { text: "hi" });
    expect(r.ok).toBe(false);
    expect(r.msg, "话术要点名 CORS/本地网络权限那两道").toMatch(/连不上/);
    expect(countOf(calls, "tools/call"), "写腿失败后不得重放：只该有 1 个请求").toBe(1);
  });

  it("tools/call 成功也只发 1 个请求（重试外壳没把成功路径改成两次）", async () => {
    const win = boot();
    srv(win, "srv", ["echo"]);
    const { calls } = scripted(win, {});
    await win.__test.mcpRefreshServer("srv");
    const r = await win.__test.mcpCallTool("mcp__srv__echo", { text: "hi" });
    expect(r.ok).toBe(true);
    expect(countOf(calls, "tools/call")).toBe(1);
  });

  it("反向对照：幂等名单里没有 tools/call（谁把写腿塞进名单，这条先红）", () => {
    const m = AI_TOOLS.match(/MCP_IDEMPOTENT_METHODS\s*=\s*\{([^}]*)\}/);
    expect(m, "幂等名单必须还是那个对象字面量（改名=改判据，得同时改这里）").toBeTruthy();
    expect(m[1]).toMatch(/initialize/);
    expect(m[1]).toMatch(/tools\/list/);
    expect(/tools\/call/.test(m[1]), "tools/call 绝不能进幂等名单").toBe(false);
  });

  it("反向对照：重试上限只挂在幂等判定上，不是无条件重试", () => {
    const wrap = AI_TOOLS.slice(AI_TOOLS.indexOf("async function _mcpRpc("), AI_TOOLS.indexOf("async function _mcpRpcAttempt("));
    expect(wrap).toMatch(/MCP_IDEMPOTENT_METHODS\[method\]\s*\?\s*MCP_RETRY_MAX\s*:\s*0/);
    expect(wrap, "先看标记再决定重试，不能让所有异常都进循环").toMatch(/e\.mcpRetriable/);
  });
});

describe("③ 延迟读数与诊断报告展示口", () => {
  it("无调用时：统计归零、报告如实说没有（不编数）", () => {
    const win = boot();
    expect(win.__test.mcpLatencyStats("ghost")).toEqual({ n: 0, median: 0, p95: 0, fail: 0, attempts: 0, last: null });
    expect(win.__test.mcpLatencyAll()).toEqual([]);
    expect(win.buildDiagReport()).toMatch(/MCP 延迟: 本页还没调用过远端工具/);
  });

  it("有调用后：报告里真有「MCP 延迟」行，带中位/p95/实发请求数", async () => {
    const win = boot();
    srv(win, "slowcat", ["echo"]);
    scripted(win, { initialize: [reject(), ok({ protocolVersion: "2025-03-26" })] });
    await win.__test.mcpRefreshServer("slowcat");
    const rep = win.buildDiagReport();
    expect(rep, "删掉展示行就是退回黑盒，这条会红")
      .toMatch(/MCP 延迟: slowcat 中位 \d+ms \/ p95 \d+ms（近 3 次调用，失败 0，实发 4 个请求）/);
    const st = win.__test.mcpLatencyStats("slowcat");
    expect(st.median, "延迟是实测毫秒数").toBeGreaterThanOrEqual(0);
    expect(st.p95 >= st.median, "取整位不外推 ⇒ p95 不应小于中位").toBe(true);
  });

  it("多台服务器分开记账（不把 slowcat 的延迟算到别头上）", async () => {
    const win = boot();
    win.__test.saveAiConfig("mcp", { servers: [
      { name: "one", url: "http://127.0.0.1:31337/mcp", enabled: true },
      { name: "two", url: "http://127.0.0.1:31338/mcp", enabled: true }] });
    scripted(win, {});
    await win.__test.mcpRefreshServer("one");
    const names = win.__test.mcpLatencyAll().map((x) => x.name);
    expect(names).toEqual(["one"]);
    await win.__test.mcpRefreshServer("two");
    expect(win.__test.mcpLatencyAll().map((x) => x.name).sort()).toEqual(["one", "two"]);
    expect(win.__test.mcpLatencyStats("two").n).toBe(3);
  });

  it("样本环有上限：长跑只留最近 20 条（内存不随会话涨）", async () => {
    const win = boot();
    srv(win, "srv");
    scripted(win, {});
    for (let i = 0; i < 8; i++) await win.__test.mcpRefreshServer("srv");  /* 8×3=24 条 > 20 */
    expect(win.__test.mcpLatencyStats("srv").n).toBe(20);
  });
});

describe("④ 退避时长函数自身（可配、有界、指数）", () => {
  it("cfg.mcpRetryBaseMs 钳在 0..5000，非法值回默认 400", () => {
    expect(boot({ mcpRetryBaseMs: 120 }).__test._mcpRetryBaseMs()).toBe(120);
    expect(boot({ mcpRetryBaseMs: 0 }).__test._mcpRetryBaseMs()).toBe(0);
    expect(boot({ mcpRetryBaseMs: 99999 }).__test._mcpRetryBaseMs()).toBe(400);
    expect(boot({ mcpRetryBaseMs: -5 }).__test._mcpRetryBaseMs()).toBe(400);
    expect(boot({ mcpRetryBaseMs: "abc" }).__test._mcpRetryBaseMs()).toBe(400);
    /* 真·没这个键：JSON.stringify 会丢掉 undefined（写成 boot({}) 会被上面的默认 0 兜住，测不到回退） */
    expect(boot({ mcpRetryBaseMs: undefined }).__test._mcpRetryBaseMs()).toBe(400);
  });

  it("第 N 次退避落在 [span/2, span]，span=base·2^(N-1) 且封顶 4000ms", () => {
    const b = boot({ mcpRetryBaseMs: 400 }).__test._mcpBackoffMs;
    const draw = (n, k) => Array.from({ length: k }, () => b(n));
    const s1 = draw(1, 60), s2 = draw(2, 60), s6 = draw(6, 60);
    s1.concat(s2, s6).forEach((d) => {
      expect(Number.isInteger(d), "毫秒要取整").toBe(true);
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThanOrEqual(4000);
    });
    /* 抖动是半宽：期望区间随 N 翻倍（400→800），这是"指数"的可测形式，不是单调性 */
    s1.forEach((d) => { expect(d).toBeGreaterThanOrEqual(200); expect(d).toBeLessThanOrEqual(400); });
    s2.forEach((d) => { expect(d).toBeGreaterThanOrEqual(400); expect(d).toBeLessThanOrEqual(800); });
    expect(Math.max(...s6), "第 6 次的期望跨度已被 4000 封顶").toBeLessThanOrEqual(4000);
  });
});
