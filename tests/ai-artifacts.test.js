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
