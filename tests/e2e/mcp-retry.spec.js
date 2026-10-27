/**
 * mcp-retry.spec.js —— B6 的两条边界在**真浏览器 + 真 HTTP** 上再证一次（2026-10-26）
 * ----------------------------------------------------------------------------
 * 单测用替身 fetch 就能过，但「重试」这件事必须验到真实 HTTP 层：状态码要真回 500、
 * CORS 头要在（否则 Chromium 直接把响应吞成网络错误，测到的是另一回事）。
 *   ① 幂等腿：`tools/list` 首次 500 ⇒ 客户端自己补一次，用户看到的是**成功**，
 *      服务端实数收到 2 次该请求，账上 attempts 记 2；
 *   ② 写腿：`tools/call` 一直 500 ⇒ 服务端**只收到 1 次**（不重放）—— 这条是幂等边界，
 *      在真 HTTP 上钉住比在替身上钉住更贵，因为"重放一次远端写"的代价只有在真服务里才看得见。
 */
const { test, expect } = require("./_fixture");
const http = require("node:http");
const { waitMainRendered } = require("./helpers/wait-settled.cjs");

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type, mcp-session-id",
  "access-control-allow-methods": "POST, OPTIONS"
};
const TOOLS = [
  { name: "echo", description: "回显文本", inputSchema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] } }
];

/**
 * @param {{failListTimes?:number, failCallAlways?:boolean}} opt
 *   failListTimes：前 N 次 tools/list 回 500（默认 1）；failCallAlways：tools/call 一律 500。
 */
function startFlakyMcpServer(opt) {
  opt = opt || {};
  const failListTimes = opt.failListTimes === undefined ? 1 : opt.failListTimes;
  const calls = [];
  const server = http.createServer((req, res) => {
    if (req.method === "OPTIONS") { res.writeHead(204, CORS); res.end(); return; }
    let raw = "";
    req.on("data", (c) => { raw += c; });
    req.on("end", () => {
      let msg = null;
      try { msg = JSON.parse(raw); } catch (_e) { /* 非 JSON */ }
      const send = (obj, code) => {
        res.writeHead(code || 200, Object.assign({ "content-type": "application/json" }, CORS));
        res.end(JSON.stringify(obj));
      };
      if (!msg) { res.writeHead(400, CORS); res.end(""); return; }
      calls.push(msg);
      const n = calls.filter((c) => c.method === msg.method).length;   // 含本次
      if (msg.method === "initialize") {
        return send({ jsonrpc: "2.0", id: msg.id, result: { protocolVersion: "2025-03-26", capabilities: { tools: {} }, serverInfo: { name: "flaky", version: "1" } } });
      }
      if (msg.method === "notifications/initialized") { res.writeHead(202, CORS); res.end(); return; }
      if (msg.method === "tools/list") {
        if (n <= failListTimes) return send({ jsonrpc: "2.0", id: msg.id, error: { code: 1, message: "不该被解析" } }, 500);
        return send({ jsonrpc: "2.0", id: msg.id, result: { tools: TOOLS } });
      }
      if (msg.method === "tools/call") {
        if (opt.failCallAlways) return send({ jsonrpc: "2.0", id: msg.id, error: { code: 2, message: "服务端炸了" } }, 500);
        return send({ jsonrpc: "2.0", id: msg.id, result: { content: [{ type: "text", text: "echo:ok" }] } });
      }
      send({ jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: "method not found" } });
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve({ server, calls, port: server.address().port }));
  });
}
/**
 * 在页面脚本前把 MCP 配置与退避底数写好（cfg 必须是合法 JSON —— 裸串会被判损坏）。
 * ⚠️ addInitScript 只序列化函数源码，**闭包带不过去**：URL 必须经第二个参数传进来
 *    （首版把 url 写成外层参数 ⇒ 页面里拿到的是 "undefined"，报"未找到该服务器"，是探针错不是产品错）。
 */
function seedPage(url){
  try {
    localStorage.setItem("wb_agent_onboarded", "true");
    localStorage.setItem("wb_agent_cfg", JSON.stringify({ mcpRetryBaseMs: 100 }));
    localStorage.setItem("wb_agent_ai_config_mcp", JSON.stringify({ servers: [{ name: "flaky", url: url, enabled: true, allow: ["echo"] }] }));
  } catch (_e) { /* 存储不可用时用例自然失败 */ }
}
const countOf = (calls, method) => calls.filter((c) => c.method === method).length;

test.describe("MCP 重试的幂等边界（真机）", () => {
  test("① tools/list 首次 500：客户端自己补一次，用户看到成功，服务端实收 2 次", async ({ page }) => {
    test.setTimeout(90_000);
    const { server, calls, port } = await startFlakyMcpServer({ failListTimes: 1 });
    try {
      await page.addInitScript(seedPage, "http://127.0.0.1:" + port + "/mcp");
      await page.goto("./agent-workbench.html");
      await waitMainRendered(page);

      const r = await page.evaluate(() => mcpRefreshServer("flaky"));
      expect(r.ok, "重试后必须成功：" + r.err).toBe(true);
      expect(r.tools.map((t) => t.name)).toEqual(["echo"]);
      expect(countOf(calls, "tools/list"), "真 HTTP 层要看得见两次请求").toBe(2);
      expect(countOf(calls, "initialize"), "握手本身只成功过一次").toBe(1);

      const st = await page.evaluate(() => mcpLatencyStats("flaky"));
      expect(st.n, "三条腿各一条样本").toBe(3);
      expect(st.attempts, "tools/list 那条记 2 个请求 ⇒ 合计 4").toBe(4);
      expect(st.fail, "最终成功不计失败").toBe(0);
      const rep = await page.evaluate(() => buildDiagReport());
      expect(rep).toMatch(/MCP 延迟: flaky 中位 \d+ms \/ p95 \d+ms（近 3 次调用，失败 0，实发 4 个请求）/);
    } finally { server.close(); }
  });

  test("② tools/call 一直 500：如实失败，且服务端只收到 1 次（写腿绝不重放）", async ({ page }) => {
    test.setTimeout(90_000);
    const { server, calls, port } = await startFlakyMcpServer({ failListTimes: 0, failCallAlways: true });
    try {
      await page.addInitScript(seedPage, "http://127.0.0.1:" + port + "/mcp");
      await page.goto("./agent-workbench.html");
      await waitMainRendered(page);
      expect((await page.evaluate(() => mcpRefreshServer("flaky"))).ok).toBe(true);

      const out = JSON.parse(await page.evaluate(() => execToolAuto("mcp__flaky__echo", { text: "hi" })));
      expect(out.ok, "写腿失败必须如实报").toBe(false);
      expect(countOf(calls, "tools/call"), "写腿一次都不重放：服务端只该收到 1 次").toBe(1);

      const st = await page.evaluate(() => mcpLatencyStats("flaky"));
      const last = await page.evaluate(() => mcpLatencyStats("flaky").last);
      expect(st.fail, "失败要进 fail 计数").toBeGreaterThan(0);
      expect(last.method).toBe("tools/call");
      expect(last.attempts, "账上也得是 1 次").toBe(1);
    } finally { server.close(); }
  });

  /* B8：延迟读数在统计页那张卡上也要看得见 —— 诊断报告里有一行不等于用户找得到。
     这里验的是"真浏览器里可见且数值与账本同源"，不重复算一套。 */
  test("③ 统计页的 MCP 延迟卡：可见，且数值与账本同源", async ({ page }) => {
    test.setTimeout(90_000);
    const { server, port } = await startFlakyMcpServer({ failListTimes: 0 });
    try {
      await page.addInitScript(seedPage, "http://127.0.0.1:" + port + "/mcp");
      await page.goto("./agent-workbench.html");
      await waitMainRendered(page);
      expect((await page.evaluate(() => mcpRefreshServer("flaky"))).ok).toBe(true);

      await page.evaluate(() => { setActive("stats"); render(); });
      await expect(page.locator("#main h3", { hasText: "MCP 延迟" })).toBeVisible();
      const row = page.locator("#main .list li", { hasText: "flaky" });
      await expect(row).toBeVisible();
      const st = await page.evaluate(() => mcpLatencyStats("flaky"));
      await expect(row).toContainText("中位 " + st.median + "ms");
      await expect(row).toContainText("p95 " + st.p95 + "ms");
      await expect(row).toContainText("近 " + st.n + " 次调用");
    } finally { server.close(); }
  });
});
