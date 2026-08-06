import { describe, it, expect } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

/**
 * execTool 单元测试 · 阶段二
 *
 * 关键模式：
 * - 每个 it 用 loadApp() 取全新 window（会执行 seed() 写入示例数据）。
 * - 需要干净状态时，loadApp 后 win.localStorage.clear() 清空所有键，再调 execTool。
 *   注意：清空 localStorage 不会重置已闭包捕获的 `active` 变量，其值仍为默认 "office"。
 * - execTool 返回 JSON 字符串，统一用 tool() 辅助解析后断言。
 */

/** 取全新 window 并清空 storage，获得干净状态（active 仍为默认 "office"） */
function freshWin() {
  const win = loadApp();
  win.localStorage.clear();
  return win;
}

/** 调用 execTool 并解析 JSON 结果 */
function tool(win, name, args) {
  return JSON.parse(win.__test.execTool(name, args || {}));
}

/* ============================================================
 * 1. create_task
 * ============================================================ */
describe("execTool - create_task", () => {
  it("正常创建任务到指定场景，并追加到 getTasks() 末尾", () => {
    const win = freshWin();
    const res = tool(win, "create_task", {
      scenario: "office",
      title: "测试任务",
      due: "2026-01-01",
      priority: "P1",
      tags: ["a"],
    });
    expect(res.ok).toBe(true);
    expect(res.id).toBeTruthy();
    expect(res.msg).toContain("测试任务");

    const tasks = win.__test.getTasks();
    expect(tasks.length).toBe(1);
    const last = tasks[tasks.length - 1];
    expect(last.id).toBe(res.id);
    expect(last.sc).toBe("office");
    expect(last.title).toBe("测试任务");
    expect(last.due).toBe("2026-01-01");
    expect(last.priority).toBe("P1");
    expect(last.tags).toEqual(["a"]);
    expect(last.status).toBe("todo");
    expect(last.doneAt).toBeNull();
  });

  it("非法 scenario 回退到 active(默认 office)", () => {
    const win = freshWin();
    const res = tool(win, "create_task", { scenario: "xxx", title: "回退任务" });
    expect(res.ok).toBe(true);
    const tasks = win.__test.getTasks();
    expect(tasks[tasks.length - 1].sc).toBe("office");
  });
});

/* ============================================================
 * 2. list_tasks
 * ============================================================ */
describe("execTool - list_tasks", () => {
  it("列出指定场景的全部任务", () => {
    const win = freshWin();
    tool(win, "create_task", { scenario: "office", title: "任务A" });
    tool(win, "create_task", { scenario: "code", title: "任务B" });
    const res = tool(win, "list_tasks", { scenario: "office" });
    expect(res.count).toBe(1);
    expect(res.items.length).toBe(1);
    expect(res.items[0].title).toBe("任务A");
    expect(res.items[0].status).toBe("todo");
  });

  it("按 status 过滤任务", () => {
    const win = freshWin();
    tool(win, "create_task", { scenario: "office", title: "待办1" });
    const done = tool(win, "create_task", { scenario: "office", title: "待办2" });
    tool(win, "complete_task", { task_id: done.id });

    const resTodo = tool(win, "list_tasks", { scenario: "office", status: "todo" });
    expect(resTodo.count).toBe(1);
    expect(resTodo.items[0].title).toBe("待办1");

    const resDone = tool(win, "list_tasks", { scenario: "office", status: "done" });
    expect(resDone.count).toBe(1);
    expect(resDone.items[0].title).toBe("待办2");
  });

  it("空 scenario 使用 active(office)", () => {
    const win = freshWin();
    tool(win, "create_task", { scenario: "office", title: "默认场景任务" });
    tool(win, "create_task", { scenario: "code", title: "其他场景任务" });
    const res = tool(win, "list_tasks", {});
    expect(res.count).toBe(1);
    expect(res.items[0].title).toBe("默认场景任务");
  });
});

/* ============================================================
 * 3. complete_task
 * ============================================================ */
describe("execTool - complete_task", () => {
  it("正常按关键词完成任务，status 变 done", () => {
    const win = freshWin();
    const t = tool(win, "create_task", { scenario: "office", title: "测试任务" });
    const res = tool(win, "complete_task", { task_id: t.id });
    expect(res.ok).toBe(true);
    expect(res.msg).toContain("测试任务");

    const tasks = win.__test.getTasks();
    expect(tasks[0].status).toBe("done");
    expect(tasks[0].doneAt).toBeTruthy();
  });

  it("找不到匹配任务返回 ok:false", () => {
    const win = freshWin();
    const res = tool(win, "complete_task", { keyword: "不存在的任务" });
    expect(res.ok).toBe(false);
    expect(res.msg).toContain("未找到");
  });
});

/* ============================================================
 * 4. update_task
 * ============================================================ */
describe("execTool - update_task", () => {
  it("更新 status 为 doing", () => {
    const win = freshWin();
    const t = tool(win, "create_task", { scenario: "office", title: "更新任务" });
    const res = JSON.parse(win.__test.execTool("update_task", { task_id: t.id, status: "doing" }, true));
    expect(res.ok).toBe(true);
    expect(win.__test.getTasks()[0].status).toBe("doing");
    expect(win.__test.getTasks()[0].doneAt).toBeNull();
  });

  it("更新 priority", () => {
    const win = freshWin();
    const t = tool(win, "create_task", { scenario: "office", title: "更新任务", priority: "P2" });
    const res = JSON.parse(win.__test.execTool("update_task", { task_id: t.id, priority: "P0" }, true));
    expect(res.ok).toBe(true);
    expect(win.__test.getTasks()[0].priority).toBe("P0");
  });

  it("更新 due", () => {
    const win = freshWin();
    const t = tool(win, "create_task", { scenario: "office", title: "更新任务" });
    const res = JSON.parse(win.__test.execTool("update_task", { task_id: t.id, due: "2026-12-31" }, true));
    expect(res.ok).toBe(true);
    expect(win.__test.getTasks()[0].due).toBe("2026-12-31");
  });

  it("更新 tags（覆盖）", () => {
    const win = freshWin();
    const t = tool(win, "create_task", { scenario: "office", title: "更新任务", tags: ["old"] });
    const res = JSON.parse(win.__test.execTool("update_task", { task_id: t.id, tags: ["x", "y"] }, true));
    expect(res.ok).toBe(true);
    expect(win.__test.getTasks()[0].tags).toEqual(["x", "y"]);
  });

  it("status:done 走 completeTask 分支（通过返回值 ch.status 验证）", () => {
    const win = freshWin();
    const t = tool(win, "create_task", { scenario: "office", title: "更新任务" });
    const res = JSON.parse(win.__test.execTool("update_task", { task_id: t.id, status: "done" }, true));
    expect(res.ok).toBe(true);
    // 返回 msg 中 ch.status 为 "done"，证明走了 completeTask 分支
    expect(res.msg).toContain('"status":"done"');
    // update_task status:done 分支曾存在 bug：completeTask 内部 setTasks 写入 done
    // 态后，update_task 末尾又用开头读取的旧 tasks 引用 setTasks 覆盖回去，导致最终
    // 持久化状态仍为 todo。已在 update_task 分支改为 let tasks 并在 completeTask 后
    // 重新 tasks = getTasks() 取最新引用修复。此处断言最终持久化 status 为 done。
    expect(win.__test.getTasks().find(t=>t.title.includes("更新")).status).toBe("done");
  });

  it("找不到任务返回 ok:false", () => {
    const win = freshWin();
    const res = tool(win, "update_task", { keyword: "不存在", status: "doing" });
    expect(res.ok).toBe(false);
    expect(res.msg).toContain("未找到");
  });
});

/* ============================================================
 * 5. delete_task
 * ============================================================ */
describe("execTool - delete_task", () => {
  it("正常按 task_id 软删除任务（进回收站，列表长度不变但 findTask 过滤）", () => {
    const win = freshWin();
    const t = tool(win, "create_task", { scenario: "office", title: "删除任务" });
    expect(win.__test.getTasks().length).toBe(1);

    const res = JSON.parse(win.__test.execTool("delete_task", { task_id: t.id }, true));
    expect(res.ok).toBe(true);
    expect(res.msg).toContain("回收站");
    // 软删除：列表长度不变（非硬删 splice），但任务被标记 deletedAt
    const tasks = win.__test.getTasks();
    expect(tasks.length).toBe(1);
    expect(tasks[0].deletedAt).toBeTruthy();
    // findTask 按 id 不再命中已删任务（被 !deletedAt 过滤）
    expect(win.findTask(t.id)).toBeNull();
  });

  it("找不到任务返回 ok:false", () => {
    const win = freshWin();
    const res = tool(win, "delete_task", { keyword: "不存在" });
    expect(res.ok).toBe(false);
    expect(res.msg).toContain("未找到");
  });
});

/* ============================================================
 * 6. add_record
 * ============================================================ */
describe("execTool - add_record", () => {
  it("正常添加记录到 code 场景，字段被写入", () => {
    const win = freshWin();
    const res = tool(win, "add_record", {
      scenario: "code",
      fields: { lang: "JS", title: "防抖", code: "function debounce(){}" },
    });
    expect(res.ok).toBe(true);
    expect(res.msg).toContain("编程");

    const rec = win.__test.getRec("code");
    expect(rec.length).toBe(1);
    expect(rec[0].title).toBe("防抖");
    expect(rec[0].lang).toBe("JS");
    expect(rec[0].code).toContain("debounce");
    expect(rec[0].id).toBeTruthy();
  });

  it("新记录插入到首条(unshift)", () => {
    const win = freshWin();
    tool(win, "add_record", { scenario: "code", fields: { title: "第一条" } });
    tool(win, "add_record", { scenario: "code", fields: { title: "第二条" } });
    const rec = win.__test.getRec("code");
    expect(rec.length).toBe(2);
    expect(rec[0].title).toBe("第二条");
    expect(rec[1].title).toBe("第一条");
  });

  it("非法 scenario 回退到 active(office)", () => {
    const win = freshWin();
    const res = tool(win, "add_record", { scenario: "xxx", fields: { title: "回退记录" } });
    expect(res.ok).toBe(true);
    // office 是默认 active，其记录字段含 title
    const rec = win.__test.getRec("office");
    expect(rec.length).toBe(1);
    expect(rec[0].title).toBe("回退记录");
  });
});

/* ============================================================
 * 7. search
 * ============================================================ */
describe("execTool - search", () => {
  it("搜索匹配任务", () => {
    const win = freshWin();
    tool(win, "create_task", { scenario: "office", title: "周报总结" });
    tool(win, "create_task", { scenario: "code", title: "其他任务" });
    const res = tool(win, "search", { query: "周报" });
    expect(res.tasks.length).toBe(1);
    expect(res.tasks[0].title).toBe("周报总结");
    expect(res.count).toBeGreaterThanOrEqual(1);
  });

  it("搜索匹配记录", () => {
    const win = freshWin();
    tool(win, "add_record", { scenario: "code", fields: { title: "节流函数" } });
    const res = tool(win, "search", { query: "节流" });
    expect(res.records.length).toBe(1);
    expect(res.records[0].title).toBe("节流函数");
  });

  it("无匹配返回空结果", () => {
    const win = freshWin();
    tool(win, "create_task", { scenario: "office", title: "任务A" });
    tool(win, "add_record", { scenario: "code", fields: { title: "片段B" } });
    const res = tool(win, "search", { query: "完全不存在的关键词" });
    expect(res.tasks.length).toBe(0);
    expect(res.records.length).toBe(0);
    expect(res.count).toBe(0);
  });
});

/* ============================================================
 * 8. query_overview
 * ============================================================ */
describe("execTool - query_overview", () => {
  it("返回 4 场景的 open/done 计数与 today/overdue", () => {
    const win = freshWin();
    const today = win.__test.todayStr();
    tool(win, "create_task", { scenario: "office", title: "今日任务", due: today });
    tool(win, "create_task", { scenario: "office", title: "逾期任务", due: "2020-01-01" });
    tool(win, "create_task", { scenario: "code", title: "代码任务" });

    const res = tool(win, "query_overview", {});
    expect(res.byScenario).toBeDefined();
    expect(Object.keys(res.byScenario).length).toBe(4);
    // 4 个场景键齐全
    win.__test.ORDER.forEach((sc) => {
      expect(res.byScenario[sc]).toBeDefined();
      expect(res.byScenario[sc]).toHaveProperty("open");
      expect(res.byScenario[sc]).toHaveProperty("done");
      expect(res.byScenario[sc]).toHaveProperty("name");
    });
    expect(res.byScenario.office.open).toBe(2);
    expect(res.byScenario.code.open).toBe(1);
    expect(res.today).toBe(1);
    expect(res.overdue).toBe(1);
  });

  it("done 任务计入 done 计数而非 open", () => {
    const win = freshWin();
    const t = tool(win, "create_task", { scenario: "office", title: "完成测试" });
    tool(win, "complete_task", { task_id: t.id });
    const res = tool(win, "query_overview", {});
    expect(res.byScenario.office.done).toBe(1);
    expect(res.byScenario.office.open).toBe(0);
  });
});

/* ============================================================
 * 9. export_data
 * ============================================================ */
describe("execTool - export_data", () => {
  it("触发导出返回 ok:true（jsdom 无下载不报错）", () => {
    const win = freshWin();
    // jsdom 不提供 URL.createObjectURL/revokeObjectURL，stub 之以保证 doExport 不抛错
    win.URL.createObjectURL = () => "blob:fake";
    win.URL.revokeObjectURL = () => {};
    const res = tool(win, "export_data", {});
    expect(res.ok).toBe(true);
    expect(res.msg).toContain("导出");
  });
});

/* ============================================================
 * 异常路径
 * ============================================================ */
describe("execTool - 异常路径", () => {
  it("未知工具名返回 ok:false 与提示", () => {
    const win = freshWin();
    const res = tool(win, "not_exist", {});
    expect(res.ok).toBe(false);
    expect(res.msg).toBe("未知工具：not_exist");
  });

  it("内部异常被捕获返回 ok:false 与 error 字段", () => {
    const win = freshWin();
    // 传 null 作为 args，访问 args.scenario 会抛 TypeError，被 execTool 的 try/catch 捕获
    const raw = win.__test.execTool("create_task", null);
    const res = JSON.parse(raw);
    expect(res.ok).toBe(false);
    expect(res.error).toBeDefined();
    expect(typeof res.error).toBe("string");
  });
});