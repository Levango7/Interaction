/**
 * 第 2 期 · 回归验证（v1.13 → v1.15 裁剪）
 * ① 多模态：v1.14 已移除（_visionContent 删除），保留 _chatContentToText 历史数组消息兼容
 * ② 画布：注入器接线后 aiReasoning 节点真调 chatOnce；CRUD+SVG 渲染
 * ④ 集成：状态薄封装、Notion 连接验证（pull 写回 v3.7.70 已随 pull 路径删除，见文件末尾注释）
 */
import { describe, it, expect, beforeEach } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

function freshWin() {
  const win = loadApp();
  win.localStorage.clear();
  return win;
}

describe("第 2 期 · 多模态历史兼容（2b）", () => {
  let win;
  beforeEach(() => { win = freshWin(); });

  it("_chatContentToText 可回解历史数组 content（v1.14 前多模态遗留消息）", () => {
    // v1.14 已移除多模态（_visionContent 等删除），但历史消息可能仍是数组格式，渲染层需兜底转文本
    const c = [{ type: "text", text: "看这张图" }, { type: "image_url", image_url: { url: "data:image/png;base64,AAA" } }];
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

  /* v3.7.70：原「_intNotionPullWriteback：按 synced 映射 pull 并合并写回任务」随 pull 路径一并删除 ——
     该函数与其依赖的 notionSyncTask(pull) 分支都已移除（Notion 只接**任务单向推送**）。
     推送这一侧的覆盖在 tests/notion-push.test.js（9 条，含逐条记账 / 部分失败如实报 / 幂等 PATCH / 面板接线），
     比原来这条只测"合并写回"的用例更贴近真实消费点。 */
});
