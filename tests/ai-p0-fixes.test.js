/**
 * ai-p0-fixes.test.js —— v3.7.52 AI 层三处 P0 的回归护栏
 * ----------------------------------------------------------------------------
 * 三处都是"静默错"：不报错、不崩溃，但数据写错位置或写丢，且回执/UI 看起来是成功的。
 *   ① update_task 一次调用里带 status:"done" 时，同轮改的 priority/due/tags 会静默丢弃
 *      （旧实现先 completeTask() 再改旧对象引用，写完落的是一份脱管的数组）
 *   ② 工具白名单分支对**已解析成对象**的 args 再 JSON.parse → 必抛，白名单一开所有工具都不执行；
 *      且有任一被拒时，同轮"被允许"的调用也被一并丢弃
 *   ③ 聊天历史用「写入那一刻的 active」当键 → 生成过程中切场景会把 A 场景历史写进 B 场景并覆盖
 * 断言口径：一律看**真实落盘/真实副作用**，不看回执文案。
 */
import { describe, it, expect } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

function freshWin() {
  const win = loadApp();
  win.localStorage.clear();
  return win;
}
const tool = (win, name, args) => JSON.parse(win.__test.execTool(name, args || {}));

describe("① update_task 写序（v3.7.52）", () => {
  it("完成 + 优先级 + 截止 一次调用 → 三者全部落盘", () => {
    const win = freshWin();
    const T = win.__test;
    const c = tool(win, "create_task", { title: "写序回归", scenario: "office", due: "2026-10-01", priority: "P0", force: true });
    const r = tool(win, "update_task", { task_id: c.id, status: "done", priority: "P1", due: "2026-12-31", force: true });
    expect(r.ok).toBe(true);
    const after = T.getTasks().find((x) => x.id === c.id);
    expect(after.status).toBe("done");
    expect(after.priority).toBe("P1"); // 修复前：静默保持 P0
    expect(after.due).toBe("2026-12-31"); // 修复前：静默保持 2026-10-01
  });

  it("完成 + 标签 一次调用 → 标签一并落盘", () => {
    const win = freshWin();
    const T = win.__test;
    const c = tool(win, "create_task", { title: "写序回归2", scenario: "office", force: true });
    tool(win, "update_task", { task_id: c.id, status: "done", tags: ["紧急", "周报"], force: true });
    const after = T.getTasks().find((x) => x.id === c.id);
    expect(after.status).toBe("done");
    expect(after.tags).toEqual(["紧急", "周报"]);
  });

  it("非完成态 + 其他字段（原本就正常的路径不得回归）", () => {
    const win = freshWin();
    const T = win.__test;
    const c = tool(win, "create_task", { title: "写序回归3", scenario: "office", due: "2026-10-01", priority: "P0", force: true });
    tool(win, "update_task", { task_id: c.id, status: "doing", priority: "P2", due: "2026-11-11", force: true });
    const after = T.getTasks().find((x) => x.id === c.id);
    expect(after.status).toBe("doing");
    expect(after.priority).toBe("P2");
    expect(after.due).toBe("2026-11-11");
  });
});

describe("② 工具白名单分支（v3.7.52）", () => {
  it("允许的工具照常执行，被拒的以 role:tool 回执且不抛错", async () => {
    const win = freshWin();
    const T = win.__test;
    const cfg = T.getCfg();
    cfg.enabled = true;
    cfg.toolWhitelist = "create_task";
    await T.persistCfg(cfg);

    const execd = [];
    const origExec = win.execTool;
    win.execTool = function (name, args) { execd.push(name); return origExec.call(this, name, args); };
    let round = 0;
    win.chatOnce = async function () {
      round++;
      if (round > 1) return { choices: [{ message: { role: "assistant", content: "完成" } }] };
      return { choices: [{ message: { role: "assistant", content: "", tool_calls: [
        { id: "c_ok", type: "function", function: { name: "create_task", arguments: JSON.stringify({ title: "白名单放行", scenario: "office" }) } },
        { id: "c_no", type: "function", function: { name: "add_record", arguments: JSON.stringify({ sc: "office", text: "被拒记录" }) } },
      ] } }] };
    };
    const hist = win.getChat("office");
    await win.runChatLoop([{ role: "system", content: "s" }], hist);

    /* 修复前：JSON.parse(对象) 抛错 → execTool 一次都不被调用（白名单=全废） */
    expect(execd).toEqual(["create_task"]);
    expect(win.getTasks().some((x) => x.title === "白名单放行")).toBe(true);
    /* 被拒调用必须有 role:"tool" 回执（旧实现用 assistant 文本充当回执，真 API 会 400） */
    const denied = hist.filter((m) => m._tool_denied);
    expect(denied.length).toBe(1);
    expect(denied[0].role).toBe("tool");
    expect(denied[0].tool_call_id).toBe("c_no");
    /* 允许的调用也必须有配套 tool 回执 */
    expect(hist.some((m) => m.role === "tool" && m.tool_call_id === "c_ok")).toBe(true);
  });
});

describe("③ 聊天历史按「所属场景」落盘（v3.7.52）", () => {
  it("生成过程中切场景 → 历史仍写回原场景键，不覆盖新场景", () => {
    const win = freshWin();
    const T = win.__test;
    const officeHist = win.getChat("office");
    officeHist.push({ role: "user", content: "办公消息" });
    T.setActive("code"); // 模拟"生成中用户切到编程场景"
    /* 调用点仍是老的拼键写法（与全仓 10 处调用一致），纠偏由 save() 按 _sc 标记完成 */
    win.save("wb_agent_chat_code", officeHist);
    const office = JSON.parse(win.localStorage.getItem("wb_agent_chat_office") || "[]");
    const code = JSON.parse(win.localStorage.getItem("wb_agent_chat_code") || "[]");
    expect(office.some((m) => m.content === "办公消息")).toBe(true);
    expect(code.some((m) => m.content === "办公消息")).toBe(false);
  });

  it("场景标记不可枚举 —— 落盘 JSON 与既有格式完全一致", () => {
    const win = freshWin();
    const hist = win.getChat("office");
    hist.push({ role: "user", content: "x" });
    expect(hist._sc).toBe("office");
    expect(Object.keys(hist)).not.toContain("_sc");
    expect(JSON.stringify(hist)).not.toContain("_sc");
    win.save("wb_agent_chat_office", hist);
    expect(win.localStorage.getItem("wb_agent_chat_office")).not.toContain("_sc");
  });

  it("appendChat 后标记随新数组保留（concat 会换数组）", () => {
    const win = freshWin();
    const T = win.__test;
    T.setActive("code");
    win.appendChat("office", { role: "user", content: "追加" });
    expect(win.getChat("office")._sc).toBe("office");
    const office = JSON.parse(win.localStorage.getItem("wb_agent_chat_office") || "[]");
    expect(office.some((m) => m.content === "追加")).toBe(true);
  });
});
