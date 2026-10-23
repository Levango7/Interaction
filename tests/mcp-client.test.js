/**
 * mcp-client.test.js —— MCP 从「配置壳」接成真能力（2026-10-23）
 * ----------------------------------------------------------------------------
 * 钉的是**能力**不是形状：远端工具真的被发现、真的按勾选注入 schema、真的路由到
 * tools/call，以及「只有标了只读的才免确认」。用替身 fetch 驱动，不联网。
 * 诚实边界（同文件末条）：连不上时错误点名 CORS，且 ensureMcpTools 不阻断对话。
 */
import { afterEach, describe, expect, it } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

const PREFIX = "wb_agent_";
const windows = [];
afterEach(() => windows.splice(0).forEach((w) => w.close()));

function boot() {
  const win = loadApp({ storage: { [PREFIX + "onboarded"]: "true" } });
  windows.push(win);
  win.__test._resetCrypto();
  return win;
}
function saveMcp(win, servers) {
  win.__test.saveAiConfig("mcp", { servers: servers });
}
function rpcRes(result, ctype) {
  const body = JSON.stringify({ jsonrpc: "2.0", id: 1, result: result });
  return { ok: true, status: 200,
    headers: { get: (k) => (String(k).toLowerCase() === "content-type" ? (ctype || "application/json") : null) },
    text: async () => body };
}
/** 替身 fetch：按 method 分派，记录每次请求；返回 [calls, install] */
function installFetch(win, opts) {
  opts = opts || {};
  const calls = [];
  win.fetch = async (url, init) => {
    const body = init && init.body ? JSON.parse(init.body) : null;
    calls.push({ url: url, method: body && body.method, body: body });
    if (opts.reject) throw new TypeError("Failed to fetch");
    if (body && body.method === "initialize") return rpcRes({ protocolVersion: "2025-03-26", capabilities: {} }, opts.initCtype);
    if (body && body.method === "notifications/initialized") return { ok: true, status: 202, headers: { get: () => null }, text: async () => "" };
    if (body && body.method === "tools/list") return rpcRes({ tools: opts.tools || [] });
    if (body && body.method === "tools/call") return rpcRes({ content: [{ type: "text", text: "远端回答：" + JSON.stringify(body.params) }] });
    return rpcRes({});
  };
  return calls;
}
const TOOLS = [
  { name: "echo", description: "回显", inputSchema: { type: "object", properties: { text: { type: "string" } } } },
  { name: "wipe", description: "删除所有东西", inputSchema: { type: "object", properties: {} }, annotations: { destructiveHint: true } },
  { name: "peek", description: "只读查询", inputSchema: { type: "object", properties: {} }, annotations: { readOnlyHint: true } }
];

describe("MCP ① 发现与注入", () => {
  it("refresh 走 initialize → initialized → tools/list；未勾选则一个都不注入，勾选后带 mcp__ 前缀", async () => {
    const win = boot();
    saveMcp(win, [{ name: "srv", url: "http://127.0.0.1:31337/mcp", enabled: true }]);
    const calls = installFetch(win, { tools: TOOLS });

    const r = await win.__test.mcpRefreshServer("srv");
    expect(r.ok).toBe(true);
    expect(r.tools.map((x) => x.name)).toEqual(["echo", "wipe", "peek"]);
    expect(calls.map((c) => c.method)).toEqual(["initialize", "notifications/initialized", "tools/list"]);

    expect(win.__test.mcpToolDefs(), "默认一个都不注入").toEqual([]);
    expect(win.__test.effectiveTools().some((t) => t.function.name.indexOf("mcp__") === 0)).toBe(false);

    saveMcp(win, [{ name: "srv", url: "http://127.0.0.1:31337/mcp", enabled: true, allow: ["echo"] }]);
    const defs = win.__test.mcpToolDefs();
    expect(defs.length).toBe(1);
    expect(defs[0].function.name).toBe("mcp__srv__echo");
    expect(defs[0].function.parameters.properties.text.type).toBe("string");
    /* 真的进了送模型的工具列表（effectiveTools 是 chatOnce 唯一的 schema 出口） */
    expect(win.__test.effectiveTools().some((t) => t.function.name === "mcp__srv__echo")).toBe(true);
  });

  it("SSE 帧形式的初始化响应也能解析（Streamable HTTP 允许 text/event-stream）", async () => {
    const win = boot();
    saveMcp(win, [{ name: "sse", url: "https://example.test/mcp", enabled: true }]);
    const body = 'event: message\ndata: {"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2025-03-26"}}\n\n';
    const calls = [];
    win.fetch = async (url, init) => {
      const b = init && init.body ? JSON.parse(init.body) : null;
      calls.push(b && b.method);
      if (b && b.method === "initialize") return { ok: true, status: 200,
        headers: { get: (k) => (String(k).toLowerCase() === "content-type" ? "text/event-stream" : null) }, text: async () => body };
      if (b && b.method === "notifications/initialized") return { ok: true, status: 202, headers: { get: () => null }, text: async () => "" };
      return rpcRes({ tools: [TOOLS[0]] });
    };
    const r = await win.__test.mcpRefreshServer("sse");
    expect(r.ok, r.err).toBe(true);
    expect(r.tools[0].name).toBe("echo");
    expect(calls).toEqual(["initialize", "notifications/initialized", "tools/list"]);
  });

  it("上限 30 个：勾选更多也只注入 30 条（token 成本要可预期）", async () => {
    const win = boot();
    const many = Array.from({ length: 40 }, (_a, i) => ({ name: "t" + i, description: "d", inputSchema: { type: "object", properties: {} } }));
    saveMcp(win, [{ name: "big", url: "http://127.0.0.1:9/mcp", enabled: true, allow: many.map((t) => t.name) }]);
    installFetch(win, { tools: many });
    await win.__test.mcpRefreshServer("big");
    expect(win.__test.mcpToolDefs().length).toBe(30);
  });
});

describe("MCP ② 执行路由与危险分类", () => {
  it("execToolAuto 把 mcp__srv__echo 路由成 tools/call，并按本地异步工具的口径返回 {ok,output}", async () => {
    const win = boot();
    saveMcp(win, [{ name: "srv", url: "http://127.0.0.1:31337/mcp", enabled: true, allow: ["echo"] }]);
    const calls = installFetch(win, { tools: TOOLS });
    await win.__test.mcpRefreshServer("srv");
    calls.length = 0;

    const out = JSON.parse(await win.__test.execToolAuto("mcp__srv__echo", { text: "你好" }));
    expect(out.ok).toBe(true);
    expect(out.output).toContain("远端回答");
    const call = calls.filter((c) => c.method === "tools/call")[0];
    expect(call.body.params.name).toBe("echo");
    expect(call.body.params.arguments).toEqual({ text: "你好" });
  });

  it("危险分类：本地删改仍要确认；远端只有显式 readOnlyHint 才免确认", async () => {
    const win = boot();
    saveMcp(win, [{ name: "srv", url: "http://127.0.0.1:31337/mcp", enabled: true, allow: ["echo", "wipe", "peek"] }]);
    installFetch(win, { tools: TOOLS });
    await win.__test.mcpRefreshServer("srv");
    const d = win.__test.isDangerTool;
    expect(d("delete_task")).toBe(true);
    expect(d("update_task")).toBe(true);
    expect(d("create_task")).toBe(false);
    expect(d("mcp__srv__peek"), "标了只读 → 免确认").toBe(false);
    expect(d("mcp__srv__wipe"), "标了破坏性 → 要确认").toBe(true);
    expect(d("mcp__srv__echo"), "没标 → 默认要确认").toBe(true);
    expect(d("mcp__nosuch__x"), "没发现过的远端名不当危险处理").toBe(false);
  });
});

describe("MCP ⑤ Electron 主进程代发", () => {
  it("有 electronAPI.mcpFetch 时走主进程（浏览器 fetch 一次都不发）", async () => {
    const win = boot();
    saveMcp(win, [{ name: "local", url: "http://127.0.0.1:9/mcp", enabled: true }]);
    let proxied = 0;
    win.electronAPI = { mcpFetch: async () => {
      proxied++;
      return { ok: true, status: 200, contentType: "application/json", sessionId: "S1",
        text: JSON.stringify({ jsonrpc: "2.0", id: 1, result: { tools: [TOOLS[0]] } }) };
    } };
    win.fetch = async () => { throw new Error("浏览器 fetch 不该被调用"); };
    const r = await win.__test.mcpRefreshServer("local");
    expect(r.ok, r.err).toBe(true);
    expect(r.tools[0].name).toBe("echo");
    expect(proxied, "initialize + initialized + tools/list 都走代理").toBe(3);
  });

  it("主进程中转失败 → 错误点名「主进程中转失败」，不再说 CORS", async () => {
    const win = boot();
    saveMcp(win, [{ name: "local", url: "http://127.0.0.1:9/mcp", enabled: true }]);
    win.electronAPI = { mcpFetch: async () => ({ ok: false, error: "forbidden_host" }) };
    win.fetch = async () => ({ ok: false, status: 0 });
    const r = await win.__test.mcpRefreshServer("local");
    expect(r.ok).toBe(false);
    expect(r.err).toContain("主进程中转失败");
    expect(r.err).not.toContain("CORS");
  });
});

describe("MCP ④ 设置页接线", () => {
  it("刷新后列出工具复选框；勾选即时落盘 allow；点保存不会把勾选抹掉", async () => {
    const win = boot();
    saveMcp(win, [{ name: "srv", url: "http://127.0.0.1:31337/mcp", enabled: true }]);
    installFetch(win, { tools: TOOLS });
    await win.__test.mcpRefreshServer("srv");

    win.__test.renderAiMcpList();
    const boxes = Array.from(win.document.querySelectorAll("[data-mcp-tool]"));
    expect(boxes.length, "三台工具都要列出来").toBe(3);
    expect(boxes.every((b) => !b.checked), "默认全不选").toBe(true);

    const echo = boxes.filter((b) => b.getAttribute("data-mcp-tool").endsWith("|echo"))[0];
    echo.checked = true;
    echo.dispatchEvent(new win.Event("change"));
    expect((win.__test.getAiConfig("mcp").servers[0].allow || []), "勾选要即时落盘").toContain("echo");

    /* 走真实保存按钮：旧实现会重建 {name,url,enabled} 把 allow 抹掉 */
    win.document.getElementById("aiMcpSave").click();
    const saved = win.__test.getAiConfig("mcp").servers[0];
    expect(saved.allow).toContain("echo");
    expect(win.__test.mcpToolDefs().length, "保存后仍注入已勾选的工具").toBe(1);
  });
});

describe("MCP ③ 失败要如实", () => {
  it("连不上时 refresh 返回 ok:false 且错误点名 CORS；ensureMcpTools 不抛（不阻断对话）", async () => {
    const win = boot();
    saveMcp(win, [{ name: "dead", url: "http://127.0.0.1:9/mcp", enabled: true, allow: ["echo"] }]);
    installFetch(win, { reject: true });
    const r = await win.__test.mcpRefreshServer("dead");
    expect(r.ok).toBe(false);
    expect(r.err).toMatch(/CORS/);
    expect(win.__test.mcpRuntimeInfo("dead").err).toMatch(/CORS/);
    await expect(win.__test.ensureMcpTools()).resolves.toBeTruthy();
    expect(win.__test.mcpToolDefs()).toEqual([]);
  });

  it("没勾选的工具即使模型自己报出名字也拒绝执行（schema 不注入 ≠ 不能调）", async () => {
    const win = boot();
    saveMcp(win, [{ name: "srv", url: "http://127.0.0.1:31337/mcp", enabled: true, allow: ["echo"] }]);
    const calls = installFetch(win, { tools: TOOLS });
    await win.__test.mcpRefreshServer("srv");
    calls.length = 0;
    const out = JSON.parse(await win.__test.execToolAuto("mcp__srv__wipe", {}));
    expect(out.ok).toBe(false);
    expect(out.msg).toMatch(/勾选/);
    expect(calls.filter((c) => c.method === "tools/call").length, "根本不该发出 tools/call").toBe(0);
  });

  it("未启用的服务器即使配了 allow 也不请求、不注入", async () => {
    const win = boot();
    saveMcp(win, [{ name: "off", url: "http://127.0.0.1:31337/mcp", enabled: false, allow: ["echo"] }]);
    const calls = installFetch(win, { tools: TOOLS });
    await win.__test.ensureMcpTools();
    expect(calls.length).toBe(0);
    expect(win.__test.mcpToolDefs()).toEqual([]);
  });
});
