/**
 * mcp-live.spec.js —— MCP「真连接」：真浏览器 + 真 HTTP 服务（2026-10-23）
 * ----------------------------------------------------------------------------
 * 单测用的是替身 fetch，证明不了 CORS/CSP/真实 HTTP 这一层；这里起一台真的
 * Streamable HTTP MCP 服务（127.0.0.1 + ACAO:*），在 file:// 页面里跑完
 * 发现 → 勾选 → 注入 schema → 命名空间路由执行 → 未勾选拒绝 的整条链。
 * 这也是「CSP 放行 127.0.0.1、卡点只在 CORS」这句话的可执行证据。
 */
const { test, expect } = require("./_fixture");
const http = require("node:http");
const { waitMainRendered } = require("./helpers/wait-settled.cjs");

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type, mcp-session-id",
  "access-control-allow-methods": "POST, OPTIONS"
};

function startMcpServer() {
  const calls = [];
  const server = http.createServer((req, res) => {
    if (req.method === "OPTIONS") { res.writeHead(204, CORS); res.end(); return; }
    let raw = "";
    req.on("data", (c) => { raw += c; });
    req.on("end", () => {
      let msg = null;
      try { msg = JSON.parse(raw); } catch (_e) { /* 非 JSON 请求 */ }
      const send = (obj, code) => { res.writeHead(code || 200, Object.assign({ "content-type": "application/json" }, CORS)); res.end(JSON.stringify(obj)); };
      if (!msg) { res.writeHead(400, CORS); res.end(""); return; }
      calls.push(msg);
      if (msg.method === "initialize") {
        return send({ jsonrpc: "2.0", id: msg.id, result: { protocolVersion: "2025-03-26", capabilities: { tools: {} }, serverInfo: { name: "e2e", version: "1" } } });
      }
      if (msg.method === "notifications/initialized") { res.writeHead(202, CORS); res.end(); return; }
      if (msg.method === "tools/list") {
        return send({ jsonrpc: "2.0", id: msg.id, result: { tools: [
          { name: "echo", description: "回显文本", inputSchema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] } },
          { name: "wipe", description: "危险写操作", inputSchema: { type: "object", properties: {} }, annotations: { destructiveHint: true } }
        ] } });
      }
      if (msg.method === "tools/call") {
        return send({ jsonrpc: "2.0", id: msg.id, result: { content: [{ type: "text", text: "echo:" + String((msg.params && msg.params.arguments && msg.params.arguments.text) || "") }] } });
      }
      send({ jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: "method not found" } });
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve({ server: server, calls: calls, port: server.address().port }));
  });
}

test.describe("MCP 真连接（真浏览器 + 真 HTTP 服务）", () => {
  test("发现 → 勾选 → 注入 schema → 命名空间路由执行；未勾选的拒绝", async ({ page }) => {
    test.setTimeout(90_000);
    const { server, calls, port } = await startMcpServer();
    try {
      const url = "http://127.0.0.1:" + port + "/mcp";
      await page.addInitScript((mcpUrl) => {
        try {
          localStorage.setItem("wb_agent_onboarded", "true");
          localStorage.setItem("wb_agent_ai_config_mcp", JSON.stringify({ servers: [{ name: "e2e", url: mcpUrl, enabled: true, allow: [] }] }));
        } catch (_e) { /* 存储不可用时用例会自然失败 */ }
      }, url);
      await page.goto("./agent-workbench.html");
      await waitMainRendered(page);

      const refreshed = await page.evaluate(() => mcpRefreshServer("e2e"));
      expect(refreshed.ok, refreshed.err).toBe(true);
      expect(refreshed.tools.map((t) => t.name)).toEqual(["echo", "wipe"]);
      expect(calls.map((c) => c.method)).toEqual(["initialize", "notifications/initialized", "tools/list"]);

      expect(await page.evaluate(() => mcpToolDefs().length), "默认不注入").toBe(0);

      const defs = await page.evaluate(() => {
        const cfg = getAiConfig("mcp");
        cfg.servers[0].allow = ["echo"];
        saveAiConfig("mcp", cfg);
        return effectiveTools().filter((t) => t.function.name.indexOf("mcp__") === 0).map((t) => t.function.name);
      });
      expect(defs).toEqual(["mcp__e2e__echo"]);

      const out = JSON.parse(await page.evaluate(() => execToolAuto("mcp__e2e__echo", { text: "hi" })));
      expect(out.ok, JSON.stringify(out)).toBe(true);
      expect(out.output).toBe("echo:hi");
      const callMsg = calls.filter((c) => c.method === "tools/call").pop();
      expect(callMsg.params).toEqual({ name: "echo", arguments: { text: "hi" } });

      const before = calls.filter((c) => c.method === "tools/call").length;
      const denied = JSON.parse(await page.evaluate(() => execToolAuto("mcp__e2e__wipe", {})));
      expect(denied.ok).toBe(false);
      expect(calls.filter((c) => c.method === "tools/call").length, "未勾选不该发出 tools/call").toBe(before);

      expect(await page.evaluate(() => isDangerTool("mcp__e2e__wipe"))).toBe(true);
      expect(await page.evaluate(() => isDangerTool("mcp__e2e__echo")), "没标只读 ⇒ 要确认").toBe(true);
    } finally {
      server.close();
    }
  });
});
