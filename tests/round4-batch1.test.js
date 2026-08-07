import { describe, it, expect, beforeEach, vi } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

/**
 * 第四轮 批次① · B1 ESC 修复 / B2 场景内筛选 / B3 alert 改 toast
 * -------------------------------------------------------------
 */
describe("B1 · ESC 链式关闭", () => {
  let win;
  beforeEach(async () => { win = await loadApp(); });

  function pressEsc() {
    win.document.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  }

  it("设置抽屉打开后按 ESC 可关闭（修复 show/open 类名 bug）", () => {
    win.__test.openDrawer();
    expect(win.document.getElementById("drawer").classList.contains("open")).toBe(true);
    pressEsc();
    expect(win.document.getElementById("drawer").classList.contains("open")).toBe(false);
  });

  it("任务编辑弹窗打开后按 ESC 可关闭", () => {
    const res = JSON.parse(win.__test.execTool("create_task", { scenario: "office", title: "ESC 测试任务" }, true));
    win.__test.openTaskEdit(res.id);
    expect(win.document.getElementById("taskEditModal")).not.toBeNull();
    pressEsc();
    expect(win.document.getElementById("taskEditModal")).toBeNull();
  });

  it("无浮层时按 ESC 不报错", () => {
    expect(() => pressEsc()).not.toThrow();
  });
});

describe("B2 · 场景内联合筛选 applyBoardFilter", () => {
  let win, __test;
  beforeEach(async () => {
    win = await loadApp();
    __test = win.__test;
    __test.setTasks([]); // 清空种子数据，保证断言稳定
    __test.execTool("create_task", { scenario: "office", title: "季度预算盘点", tags: ["urgent"] }, true);
    __test.execTool("create_task", { scenario: "office", title: "整理会议纪要", tags: ["meeting"] }, true);
    __test.execTool("create_task", { scenario: "office", title: "预算盘点复核", tags: ["urgent"] }, true);
    __test.setActive("office");
    __test.render();
  });

  const visible = () => [...win.document.querySelectorAll(".kcard")].filter(c => c.style.display !== "none");
  const setVal = (id, v) => { const el = win.document.getElementById(id); if (el) el.value = v; };

  it("标题搜索过滤（预算盘点 → 命中 2 张卡片）", () => {
    setVal("boardSearch", "预算盘点");
    __test.applyBoardFilter();
    expect(visible().length).toBe(2);
  });

  it("状态筛选（默认全部为待办，筛已完成 → 0 张）", () => {
    setVal("boardStatusFilter", "done");
    __test.applyBoardFilter();
    expect(visible().length).toBe(0);
    setVal("boardStatusFilter", "todo");
    __test.applyBoardFilter();
    expect(visible().length).toBe(3);
  });

  it("标签筛选（urgent → 命中 2 张卡片）", () => {
    setVal("tagFilter", "urgent");
    __test.applyBoardFilter();
    expect(visible().length).toBe(2);
  });

  it("三维联合：标题'预算盘点' + 标签'urgent' → 2 张；标题'预算盘点' + 标签'meeting' → 0 张", () => {
    setVal("boardSearch", "预算盘点");
    setVal("tagFilter", "urgent");
    __test.applyBoardFilter();
    expect(visible().length).toBe(2);
    setVal("tagFilter", "meeting");
    __test.applyBoardFilter();
    expect(visible().length).toBe(0);
  });

  it("清空所有筛选条件 → 全部可见", () => {
    setVal("boardSearch", "不存在的任务xyz");
    __test.applyBoardFilter();
    expect(visible().length).toBe(0);
    setVal("boardSearch", "");
    __test.applyBoardFilter();
    expect(visible().length).toBe(3);
  });
});

describe("B3 · alert 替换为 toast", () => {
  let win, __test;
  beforeEach(async () => {
    win = await loadApp();
    __test = win.__test;
  });

  it("saveCfg 不再调用 alert（改用 toast）", async () => {
    const alertSpy = vi.spyOn(win, "alert").mockImplementation(() => {});
    const cfg = __test.getCfg();
    await __test.saveCfg(cfg);
    expect(alertSpy).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it("doClear 不再调用 alert（改用 toast + 延迟重载）", () => {
    vi.useFakeTimers();
    try {
      const alertSpy = vi.spyOn(win, "alert").mockImplementation(() => {});
      // fake timers 下 setTimeout 不触发，location.reload 不会执行
      __test.doClear();
      expect(alertSpy).not.toHaveBeenCalled();
      alertSpy.mockRestore();
    } finally {
      vi.useRealTimers();
    }
  });
});
