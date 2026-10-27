/**
 * mcp-latency-card.test.js —— B8：MCP 延迟读数上统计页（B6 当时主动推迟的那半）
 * ----------------------------------------------------------------------------
 * B6 只把延迟落到了「设置 → 关于 → 诊断与反馈」那一行，统计页那张卡被明确推迟。
 * 本文件钉三件事：
 *   ① 有样本 ⇒ 每台服务器一行，数值必须与 `mcpLatencyStats` **同源同值**（不是另算一套）；
 *   ② 没样本 ⇒ 如实说"还没有样本"，**不得**渲染成 `0ms` —— 0ms 会被读成"很快"，
 *      而真相是"还没调用过"，这是同一类"没数据装成有数据"的谎报；
 *   ③ 零任务态（renderStats 走 no-stats 分支）也要渲染该卡 —— AI 数据不该因为没任务而看不见
 *      （与 v2.x「AI 行动」卡同一条理由）。
 * 用替身 fetch 驱动真 `mcpRefreshServer`，不联网；`mcpRetryBaseMs=0` 让退避不真等。
 */
import { afterEach, describe, expect, it } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

const PREFIX = "wb_agent_";
const windows = [];
afterEach(() => windows.splice(0).forEach((w) => w.close()));

function boot(extra) {
  const win = loadApp({ storage: Object.assign({
    [PREFIX + "onboarded"]: "true",
    [PREFIX + "cfg"]: JSON.stringify({ mcpRetryBaseMs: 0 })
  }, extra || {}) });
  windows.push(win);
  return win;
}
function mkTask(id) {
  return { id, sc: "office", title: "x", status: "done", doneAt: Date.now(), created: Date.now(), tags: [] };
}
function onServer(win, name) {
  win.__test.saveAiConfig("mcp", { servers: [{ name, url: "http://127.0.0.1:31337/mcp", enabled: true, allow: [] }] });
}
function defaultResult(method) {
  if (method === "initialize") return { protocolVersion: "2025-03-26", capabilities: {} };
  if (method === "tools/list") return { tools: [{ name: "echo", description: "回显", inputSchema: { type: "object", properties: {} } }] };
  return {};
}
/** 每条 RPC 都成功（只为造样本；重试语义由 mcp-resilience.test.js 守） */
function stubOkFetch(win) {
  win.fetch = async (url, init) => {
    const body = init && init.body ? JSON.parse(init.body) : null;
    const method = body && body.method;
    const payload = method === "notifications/initialized" ? ""
      : JSON.stringify({ jsonrpc: "2.0", id: body && body.id, result: defaultResult(method) });
    return { ok: true, status: 200,
      headers: { get: (k) => (String(k).toLowerCase() === "content-type" ? "application/json" : null) },
      text: async () => payload };
  };
}
function mainText(win) {
  return win.document.getElementById("main").textContent;
}

describe("① 有样本：统计页出现每台的延迟读数，且与 mcpLatencyStats 同值", () => {
  it("卡片含服务器名 + 中位 + p95 + 次数 + 实发请求数", async () => {
    const win = boot();
    win.__test.setTasks([mkTask("t1")]);
    onServer(win, "srv");
    stubOkFetch(win);
    const r = await win.__test.mcpRefreshServer("srv");
    expect(r.ok, "样本制造失败，err=" + r.err).toBe(true);
    const st = win.__test.mcpLatencyStats("srv");
    expect(st.n, "三条腿应有三条样本").toBe(3);

    win.__test.renderStats();
    const txt = mainText(win);
    expect(txt).toContain("MCP 延迟");
    expect(txt).toContain("srv");
    expect(txt).toContain("中位 " + st.median + "ms");
    expect(txt).toContain("p95 " + st.p95 + "ms");
    expect(txt).toContain("近 " + st.n + " 次调用");
    expect(txt).toContain("实发 " + st.attempts + " 个请求");
  });

  it("两台服务器各一行，不串台", async () => {
    const win = boot();
    win.__test.setTasks([mkTask("t1")]);
    win.__test.saveAiConfig("mcp", { servers: [
      { name: "alpha", url: "http://127.0.0.1:31337/mcp", enabled: true, allow: [] },
      { name: "beta", url: "http://127.0.0.1:31338/mcp", enabled: true, allow: [] }
    ] });
    stubOkFetch(win);
    await win.__test.mcpRefreshServer("alpha");
    await win.__test.mcpRefreshServer("beta");
    win.__test.renderStats();
    const txt = mainText(win);
    expect(txt).toContain("alpha");
    expect(txt).toContain("beta");
    const rows = txt.split("—").filter((s) => s.indexOf("中位") >= 0);
    expect(rows, "两台 ⇒ 两行读数").toHaveLength(2);
  });
});

describe("② 没样本：如实说没有，不装成 0ms", () => {
  it("卡片存在但文案是「还没有样本」，且不出现任何中位读数", () => {
    const win = boot();
    win.__test.setTasks([mkTask("t1")]);
    win.__test.renderStats();
    const txt = mainText(win);
    expect(txt).toContain("MCP 延迟");
    expect(txt).toContain("还没有远端工具调用样本");
    expect(txt, "没样本时冒出 0ms 就是谎报").not.toContain("中位 ");
    expect(txt).not.toContain("p95 ");
  });
});

describe("③ 零任务态也渲染该卡", () => {
  it("任务总数为 0（no-stats 分支）时 MCP 延迟卡仍在", () => {
    const win = boot();
    win.localStorage.clear();
    win.__test.renderStats();
    const txt = mainText(win);
    expect(txt).toContain("还没有远端工具调用样本");
  });
});
