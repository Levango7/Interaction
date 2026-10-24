/**
 * ai-artifacts.test.js —— AI 产物落盘清单（2026-10-24）
 * ----------------------------------------------------------------------------
 * 右栏「文件」页原来只列导入的知识库文件；用户要的是"AI 生成的东西"。
 * 这里钉四件事：① AI 新建任务/记录/笔记各落一条（只存引用 id，不复制内容）；
 * ② 撤销回执时产物条目一起消失（不留幽灵）；③ 上限 100；④ 真的渲染进右栏、点一条能到落点。
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

describe("AI 产物账", () => {
  it("AI 新建任务 / 记录 / 笔记 → 各落一条，只存引用 id + 展示快照", () => {
    const win = boot();
    const r1 = JSON.parse(win.execTool("create_task", { scenario: "office", title: "写周报" }));
    JSON.parse(win.execTool("add_record", { scenario: "office", fields: { title: "会议记录" } }));
    const r3 = JSON.parse(win.execTool("note_add", { title: "灵感", content: "x" }));
    const arts = win.__test.aiArtifacts();
    expect(arts.length, "三种写入各一条").toBe(3);
    expect(arts.map((a) => a.kind).sort()).toEqual(["note", "record", "task"]);
    expect(arts.find((a) => a.kind === "task").refId, "指向真实任务 id，不复制内容").toBe(r1.id);
    expect(arts.find((a) => a.kind === "note").refId).toBe(r3.id);
    expect(arts.every((a) => a.id && a.at && a.tool)).toBe(true);
    /* 账里不该出现正文/字段副本 */
    const raw = JSON.stringify(arts);
    expect(raw, "不复制内容").not.toContain("很久以后的正文");
  });

  it("撤销回执 → 对应产物一起消失（清单里不留幽灵条目）", () => {
    const win = boot();
    win.execTool("create_task", { scenario: "office", title: "临时任务" });
    expect(win.__test.aiArtifacts().length).toBe(1);
    const undo = JSON.parse(win.localStorage.getItem(PREFIX + "ai_undo"));
    const res = win.undoAiAction(undo[0].id);
    expect(res.ok).toBe(true);
    expect(win.__test.aiArtifacts().length, "撤销后不留幽灵").toBe(0);
  });

  it("上限 100：第 101 条挤掉最旧的", () => {
    const win = boot();
    for (let i = 0; i < 101; i++) win.execTool("create_task", { scenario: "office", title: "t" + i });
    const arts = win.__test.aiArtifacts();
    expect(arts.length).toBe(100);
    expect(arts[0].title, "最新的在最前").toBe("t100");
    expect(arts.some((a) => a.title === "t0"), "最旧的被挤掉").toBe(false);
  });

  it("右栏「文件」页真的列出 AI 产出；点一条任务产物 → 切到任务页", () => {
    const win = boot();
    win.execTool("create_task", { scenario: "office", title: "周报要交" });
    win.renderTaskRail();
    const items = win.document.querySelectorAll("[data-rail-art]");
    expect(items.length, "右栏出现一条 AI 产出").toBe(1);
    expect(items[0].textContent).toContain("周报要交");
    expect(items[0].textContent, "标出类型").toContain("任务");
    items[0].click();
    expect(win.getActive(), "点了就带你去任务页").toBe("tasks");
  });
});

describe("AI 产物账 · 运行与远端写", () => {
  it("code_run 成功 → 落一条 run（账里有有界预览）；失败不落", async () => {
    const win = boot();
    win.toolCodeRun = async () => ({ ok: true, output: "计算结果 42" });
    JSON.parse(await win.execToolAuto("code_run", { code: "1+1" }));
    const arts = win.__test.aiArtifacts();
    expect(arts.length).toBe(1);
    expect(arts[0].kind).toBe("run");
    expect(arts[0].tool).toBe("code_run");
    expect(arts[0].preview).toContain("42");

    win.toolCodeRun = async () => ({ ok: false, error: "boom" });
    JSON.parse(await win.execToolAuto("code_run", { code: "x" }));
    expect(win.__test.aiArtifacts().length, "失败不记账").toBe(1);
  });

  it("远端写工具 → 落一条 mcp；只读工具不记（否则清单被查询刷屏）", async () => {
    const win = boot();
    win.__test.saveAiConfig("mcp", { servers: [{ name: "srv", url: "https://mcp.example.test/mcp", enabled: true, allow: ["wipe", "peek"] }] });
    win.fetch = async (_u, init) => {
      const m = init && init.body ? JSON.parse(init.body) : {};
      const ok = (result) => ({ ok: true, status: 200, headers: { get: (k) => (String(k).toLowerCase() === "content-type" ? "application/json" : null) }, text: async () => JSON.stringify({ jsonrpc: "2.0", id: 1, result }) });
      if (m.method === "notifications/initialized") return { ok: true, status: 202, headers: { get: () => null }, text: async () => "" };
      if (m.method === "tools/list") return ok({ tools: [
        { name: "wipe", description: "写", inputSchema: { type: "object", properties: {} }, annotations: { destructiveHint: true } },
        { name: "peek", description: "只读", inputSchema: { type: "object", properties: {} }, annotations: { readOnlyHint: true } }
      ] });
      if (m.method === "tools/call") return ok({ content: [{ type: "text", text: "远端结果：" + m.params.name }] });
      return ok({ protocolVersion: "2025-03-26" });
    };
    await win.__test.mcpRefreshServer("srv");

    await win.execToolAuto("mcp__srv__wipe", {});
    const a1 = win.__test.aiArtifacts();
    expect(a1.length).toBe(1);
    expect(a1[0].kind).toBe("mcp");
    expect(a1[0].title).toBe("srv / wipe");
    expect(a1[0].preview).toContain("远端结果");

    await win.execToolAuto("mcp__srv__peek", {});
    expect(win.__test.aiArtifacts().length, "只读不记账").toBe(1);
  });

  it("右栏把 run/mcp 标成「运行 / 远端」；点一条 run 复制预览并留在原页", async () => {
    const win = boot();
    win.toolCodeRun = async () => ({ ok: true, output: "输出 A" });
    JSON.parse(await win.execToolAuto("code_run", { code: "console.log(1)" }));
    let copied = "";
    win.navigator.clipboard = { writeText: (v) => { copied = v; } };
    const before = win.getActive();
    win.renderTaskRail();
    const items = Array.from(win.document.querySelectorAll("[data-rail-art]"));
    expect(items.length).toBe(1);
    expect(items[0].textContent).toContain("运行");
    items[0].click();
    expect(copied).toContain("输出 A");
    expect(win.getActive(), "这类没有本地落点，不跳页").toBe(before);
  });

  it("剪贴板被浏览器拒绝时报「没复制成功」，不许报「已复制」", async () => {
    const win = boot();
    win.toolCodeRun = async () => ({ ok: true, output: "输出 B" });
    JSON.parse(await win.execToolAuto("code_run", { code: "x" }));
    /* 真浏览器（含线上 https 与本机 file://）会以 Promise rejection 的形式拒绝写入剪贴板；
       旧实现用同步 try/catch 包 writeText ⇒ rejection 逃出去，用户照样看到「已复制这次产出」。 */
    let unhandled = null;
    win.addEventListener("unhandledrejection", (e) => { unhandled = e.reason || "rejection"; });
    win.navigator.clipboard = { writeText: () => Promise.reject(new win.Error("NotAllowedError")) };
    win.renderTaskRail();
    win.document.querySelector("[data-rail-art]").click();
    await new Promise((r) => setTimeout(r, 60));
    const texts = Array.from(win.document.querySelectorAll(".toast")).map((x) => x.textContent);
    expect(texts.some((s) => /没复制成功/.test(s)), "被拒时须给出「没复制成功」：" + JSON.stringify(texts)).toBe(true);
    expect(texts.some((s) => /已复制/.test(s)), "同一屏不许出现「已复制」").toBe(false);
    expect(unhandled, "rejection 必须被接住，不许冒到全局").toBe(null);
  });
});
