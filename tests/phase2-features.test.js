/**
 * 第 2 期 · 回归验证（v1.13）
 * ① 多模态：vision content 构造/回显、renderChat 数组兼容
 * ② 画布：注入器接线后 aiReasoning 节点真调 chatOnce；CRUD+SVG 渲染
 * ④ 集成：状态薄封装、Notion 连接验证、pull 写回
 */
import { describe, it, expect, beforeEach } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

function freshWin() {
  const win = loadApp();
  win.localStorage.clear();
  return win;
}
const BASE = { sc: "code", status: "todo", doneAt: null, priority: "P0", note: "", tags: [], created: Date.now(), due: "" };

describe("第 2 期 · 多模态（2b）", () => {
  let win;
  beforeEach(() => { win = freshWin(); });

  it("_visionContent 构造 OpenAI vision content 数组；_chatContentToText 可回解", () => {
    const c = win._visionContent("看这张图", ["data:image/png;base64,AAA"]);
    expect(c[0]).toEqual({ type: "text", text: "看这张图" });
    expect(c[1].type).toBe("image_url");
    expect(c[1].image_url.url).toContain("data:image");
    const t = win._chatContentToText(c);
    expect(t).toContain("看这张图");
    expect(t).toContain("[图×1]");
  });

  it("renderChat 兼容数组 content（文本 + 图片计数标记，不崩溃）", () => {
    // chats 为脚本内 let 绑定（非 window 属性），经 eval 注入确保 getChat(active) 命中
    win.eval('chats.office = [{ role: "user", content: [{ type: "text", text: "看这张架构图" }, { type: "image_url", image_url: { url: "data:image/png;base64,AA" } }] }];');
    win.renderChat();
    const html = win.document.querySelector("#chat").innerHTML;
    expect(html).toContain("看这张架构图");
    expect(html).toContain("[图×1]");
  });
});

describe("第 2 期 · 工作流画布（2a）", () => {
  let win;
  beforeEach(() => { win = freshWin(); });

  it("注入器接线：aiReasoning 节点执行真调 chatOnce 并写入上下文", async () => {
    await new Promise((r) => setTimeout(r, 150)); // 等 startup 完成注入器接线（_wfWireInjectors 在 startup 期执行）
    const calls = [];
    win.chatOnce = async (msgs) => { calls.push(msgs); return { choices: [{ message: { content: "AI 推理结果" } }] }; };
    const wf = win.__test.wfCreateWorkflow("测试流", {});
    expect(wf).toBeTruthy();
    const s = win.__test.wfAddNode(wf.id, "start", { x: 20, y: 40 }, { input: {} });
    const a = win.__test.wfAddNode(wf.id, "aiReasoning", { x: 200, y: 40 }, { prompt: "总结一下", model: "default", temperature: 0.7 });
    const e = win.__test.wfAddNode(wf.id, "end", { x: 500, y: 40 }, { outputKey: "result" });
    expect(s && a && e).toBeTruthy();
    expect(win.__test.wfConnectNodes(wf.id, s.id, a.id)).toBeTruthy();
    expect(win.__test.wfConnectNodes(wf.id, a.id, e.id)).toBeTruthy();
    const r = await win.__test.wfExecuteWorkflow(wf.id, {});
    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(calls[0][0].content).toContain("总结一下");
    expect(r.status).toBe("completed");
    expect(r.ctx.variables.aiResult).toBe("AI 推理结果");
  }, 20000);

  it("renderWorkflowCanvas 产出含节点标识的 SVG", () => {
    const wf = win.__test.wfCreateWorkflow("画布流", {});
    win.__test.wfAddNode(wf.id, "start", { x: 20, y: 40 });
    const svg = win.__test.renderWorkflowCanvas(wf.id, { width: 400, height: 200 });
    expect(svg).toContain("<svg");
    expect(svg).toContain("data-node-id");
  });
});


describe("第 2 期 · 外部集成（2d）", () => {
  let win;
  beforeEach(() => { win = freshWin(); });

  it("integrationGetStatus 三态：未注册/已连接", () => {
    expect(win.integrationGetStatus("notion")).toEqual({ connected: false, reason: "not_registered" });
    win.integrationSetHttpClient(async () => ({ ok: true, status: 200, body: { object: "user", id: "u1", name: "Bot" } }));
    return Promise.resolve(win.notionConnect({ token: "secret-x", databaseId: "db1" })).then((p) => {
      expect(p).toBeTruthy();
      const st = win.integrationGetStatus("notion");
      expect(st.connected).toBe(true);
      expect(st.verified).toBe(true);
    });
  });

  it("_intNotionPullWriteback：按 synced 映射 pull 并合并写回任务", async () => {
    win.__test.setTasks([{ id: "t1", ...BASE, title: "本地旧标题" }]);
    win.localStorage.setItem("wb_integration_sync_state", JSON.stringify({
      notion: { lastSyncAt: 1, syncedItems: { t1: { remoteId: "r1", type: "task", syncedAt: 1 } } },
    }));
    win.notionSyncTask = async (t, dir) => (dir === "pull" ? { success: true, action: "pulled", updatedTask: { title: "远程新标题" } } : { success: false });
    const n = await win._intNotionPullWriteback();
    expect(n).toBe(1);
    expect(win.__test.getTasks().find((t) => t.id === "t1").title).toBe("远程新标题");
  });
});
