/**
 * v2.0 多 Session 聊天存储层测试
 * 覆盖：懒加载迁移 / CRUD / 激活切换 / save() 写穿镜像 / 弹窗 UI 渲染
 * v2.0.1：doImport 后内存缓存复位回归（导入不 reload，须复位 _sessions + chats）
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

function freshWin() {
  const win = loadApp();
  return win;
}

describe("v2.0 多 Session 聊天存储层", () => {
  let win, __test;
  beforeEach(() => {
    win = freshWin();
    __test = win.__test;
  });

  it("冷启动：getSessions 返回至少 1 个默认会话", () => {
    const list = __test.getSessions();
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(list[0]).toHaveProperty("id");
    expect(list[0]).toHaveProperty("sc");
    expect(list[0]).toHaveProperty("msgs");
  });

  it("createSession 新建会话并自动激活", () => {
    const before = __test.getSessions().length;
    const item = __test.createSession("code", "测试会话");
    expect(item.sc).toBe("code");
    expect(item.title).toBe("测试会话");
    expect(__test.getSessions().length).toBe(before + 1);
    expect(__test.getActiveSession()).toBe(item.id);
  });

  it("setActiveSession 切换激活会话；非法 id 不生效", () => {
    const a = __test.createSession("office", "A");
    const b = __test.createSession("code", "B");
    __test.setActiveSession(a.id);
    expect(__test.getActiveSession()).toBe(a.id);
    __test.setActiveSession(b.id);
    expect(__test.getActiveSession()).toBe(b.id);
    __test.setActiveSession("not_exist");
    expect(__test.getActiveSession()).toBe(b.id); // 非法 id 保持原激活
  });

  it("appendSessionMsg 追加消息并自动命名（首条用户消息前 20 字）", () => {
    const s = __test.createSession("office");
    expect(s.title).toBe("新会话");
    __test.appendSessionMsg(s.id, { role: "user", content: "帮我建个任务写周报" });
    const msgs = __test.getSessionMsgs(s.id);
    expect(msgs.length).toBe(1);
    expect(msgs[0].role).toBe("user");
    const obj = __test.getSessions().find((x) => x.id === s.id);
    expect(obj.title).toBe("帮我建个任务写周报");
  });

  it("clearSessionMsgs 清空消息但保留会话", () => {
    const s = __test.createSession("office");
    __test.appendSessionMsg(s.id, { role: "user", content: "hi" });
    __test.clearSessionMsgs(s.id);
    expect(__test.getSessionMsgs(s.id).length).toBe(0);
    expect(__test.getSessions().find((x) => x.id === s.id)).toBeTruthy();
  });

  it("deleteSession 删除会话；剩最后 1 个时只清空不删记录", () => {
    const a = __test.createSession("office", "A");
    const b = __test.createSession("code", "B");
    __test.deleteSession(a.id);
    expect(__test.getSessions().find((x) => x.id === a.id)).toBeFalsy();
    // 删到只剩 1 个时，再删只清空消息
    __test.appendSessionMsg(b.id, { role: "user", content: "x" });
    __test.deleteSession(b.id);
    const rest = __test.getSessions();
    expect(rest.length).toBe(1);
    expect(rest[0].msgs.length).toBe(0);
  });

  it("renameSession 仅改标题", () => {
    const s = __test.createSession("office", "旧名");
    __test.renameSession(s.id, "新名字");
    const obj = __test.getSessions().find((x) => x.id === s.id);
    expect(obj.title).toBe("新名字");
  });

  it("save() 写穿镜像：场景聊天落盘同步进激活 Session", () => {
    // 建一个 office 会话并激活
    const s = __test.createSession("office", "镜像测试");
    __test.setActiveSession(s.id);
    // 走现有 appendChat 契约（场景存储路径），触发 save() 镜像
    __test.appendChat("office", { role: "user", content: "镜像消息" });
    const msgs = __test.getSessionMsgs(s.id);
    expect(msgs.some((m) => m.content === "镜像消息")).toBe(true);
  });

  it("写穿镜像不跨场景串数据：非激活场景的聊天不写入", () => {
    const s = __test.createSession("office", "仅office");
    __test.setActiveSession(s.id);
    __test.appendChat("code", { role: "user", content: "code场景消息" });
    const msgs = __test.getSessionMsgs(s.id);
    expect(msgs.some((m) => m.content === "code场景消息")).toBe(false);
  });

  it("旧 chats 迁移：有历史消息的场景迁出默认 Session", () => {
    // 先写场景聊天，再复位会话层强制重新迁移
    __test.appendChat("life", { role: "user", content: "历史消息" });
    __test._resetSessions();
    win.localStorage.removeItem("wb_agent_ai_sessions");
    win.localStorage.removeItem("wb_agent_ai_active_session");
    const list = __test.getSessions();
    const life = list.find((x) => x.sc === "life");
    expect(life).toBeTruthy();
    expect(life.msgs.some((m) => m.content === "历史消息")).toBe(true);
  });

  it("会话弹窗 UI：openSessionModal 渲染列表与预览", () => {
    const s = __test.createSession("office", "UI测试");
    __test.appendSessionMsg(s.id, { role: "user", content: "你好" });
    __test.openSessionModal();
    const modal = win.document.querySelector("#sessionModal");
    expect(modal.classList.contains("show")).toBe(true);
    const list = win.document.querySelector("#sessList");
    expect(list.innerHTML).toContain("UI测试");
    const preview = win.document.querySelector("#sessPreview");
    expect(preview.innerHTML).toContain("你好");
    __test.closeSessionModal();
    expect(modal.classList.contains("show")).toBe(false);
  });

  it("会话搜索过滤：renderSessionList(filter) 仅显示匹配项", () => {
    __test.createSession("office", "工作周报");
    __test.createSession("life", "健身计划");
    __test.renderSessionList("健身");
    const list = win.document.querySelector("#sessList");
    expect(list.innerHTML).toContain("健身计划");
    expect(list.innerHTML).not.toContain("工作周报");
  });
});

describe("v2.0.1 doImport 内存缓存复位回归", () => {
  const PREFIX = "wb_agent_";

  // stub FileReader：readAsText 后用给定内容触发 onload（模拟浏览器异步读取）
  function makeFakeReader(content) {
    return class FakeFileReader {
      constructor() { this.result = ""; }
      readAsText() {
        this.result = content;
        setTimeout(() => { if (typeof this.onload === "function") this.onload({ target: this }); }, 0);
      }
    };
  }

  it("导入后会话层复位：getSessions 反映导入数据而非旧内存缓存", async () => {
    const win = freshWin();
    const __test = win.__test;
    const toastSpy = vi.spyOn(win, "toast");

    // 本地先建一个会话并写入消息（填充内存缓存 _sessions）
    const local = __test.createSession("office", "本地旧会话");
    __test.appendSessionMsg(local.id, { role: "user", content: "本地消息" });
    expect(__test.getSessions().some((s) => s.title === "本地旧会话")).toBe(true);

    // 构造导入数据：一份不同的会话列表
    const imported = [{ id: "s_imported", title: "导入的新会话", sc: "code", createdAt: "2026-08-21T00:00:00.000Z", updatedAt: "2026-08-21T00:00:00.000Z", msgs: [{ role: "user", content: "导入消息" }] }];
    const payload = {};
    payload[PREFIX + "ai_sessions"] = JSON.stringify(imported);
    payload[PREFIX + "ai_active_session"] = JSON.stringify("s_imported");
    const CONTENT = JSON.stringify(payload);

    const origFR = win.FileReader;
    win.FileReader = makeFakeReader(CONTENT);
    try {
      win.doImport({ name: "backup.json" });
      await vi.waitFor(() => {
        expect(toastSpy).toHaveBeenCalledWith("导入成功，数据已恢复", "ok");
      }, { timeout: 2000, interval: 20 });
    } finally {
      win.FileReader = origFR;
      toastSpy.mockRestore();
    }

    // 导入后内存缓存已复位：getSessions 重新从存储读取，反映导入数据
    const list = __test.getSessions();
    expect(list.some((s) => s.id === "s_imported" && s.title === "导入的新会话")).toBe(true);
    expect(list.some((s) => s.title === "本地旧会话")).toBe(false);
  });

  it("导入后场景聊天复位：getChat 反映导入数据而非旧内存缓存", async () => {
    const win = freshWin();
    const __test = win.__test;
    const toastSpy = vi.spyOn(win, "toast");

    // 本地先写场景聊天（填充内存 chats）
    __test.appendChat("office", { role: "user", content: "本地聊天" });
    expect(__test.getChat("office").some((m) => m.content === "本地聊天")).toBe(true);

    // 导入一份不同的 office 聊天
    const payload = {};
    payload[PREFIX + "chat_office"] = JSON.stringify([{ role: "user", content: "导入的聊天" }]);
    const CONTENT = JSON.stringify(payload);

    const origFR = win.FileReader;
    win.FileReader = makeFakeReader(CONTENT);
    try {
      win.doImport({ name: "backup.json" });
      await vi.waitFor(() => {
        expect(toastSpy).toHaveBeenCalledWith("导入成功，数据已恢复", "ok");
      }, { timeout: 2000, interval: 20 });
    } finally {
      win.FileReader = origFR;
      toastSpy.mockRestore();
    }

    // 导入后 chats 已从存储重载：反映导入数据
    const chat = __test.getChat("office");
    expect(chat.some((m) => m.content === "导入的聊天")).toBe(true);
    expect(chat.some((m) => m.content === "本地聊天")).toBe(false);
  });
});
