import { describe, it, expect, beforeEach } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

/**
 * P5' 命令面板增强回归测试
 * ----------------------------------------------------------------------------
 * 模糊搜索（子串 > 子序列打分）/ 分组渲染（最近/命令/场景/任务）/ 最近使用置顶
 */

const PREFIX = "wb_agent_";

describe("P5' 命令面板增强", () => {
  let win;
  let __test;

  beforeEach(() => {
    win = loadApp();
    __test = win.__test;
    win.localStorage.clear();
  });

  // ===== fuzzyScore 打分 =====
  describe("fuzzyScore - 模糊匹配打分", () => {
    it("空查询返回基础分（全部可见）", () => {
      expect(__test.fuzzyScore("任意文本", "")).toBeGreaterThan(0);
    });

    it("子串命中得分显著高于子序列命中", () => {
      const substr = __test.fuzzyScore("切换明暗主题", "明暗"); // 子串
      const subseq = __test.fuzzyScore("切换明暗主题", "切主"); // 子序列（切…主）
      expect(substr).toBeGreaterThan(0);
      expect(subseq).toBeGreaterThan(0);
      expect(substr).toBeGreaterThan(subseq);
    });

    it("子序列命中：字符乱序不匹配返回 -1", () => {
      expect(__test.fuzzyScore("新建任务", "务任")).toBe(-1);
      expect(__test.fuzzyScore("abc", "ba")).toBe(-1);
    });

    it("不匹配返回 -1", () => {
      expect(__test.fuzzyScore("打开设置", "zzz")).toBe(-1);
    });

    it("开头命中比中间命中得分高", () => {
      const head = __test.fuzzyScore("导出数据", "导出");
      const mid = __test.fuzzyScore("任务导出备份", "导出");
      expect(head).toBeGreaterThan(mid);
    });
  });

  // ===== 最近使用 =====
  describe("最近使用命令", () => {
    it("getCmdRecent 初始为空数组", () => {
      expect(__test.getCmdRecent()).toEqual([]);
    });

    it("pushCmdRecent 置顶、去重、最多保留 5 条", () => {
      __test.pushCmdRecent("A");
      __test.pushCmdRecent("B");
      __test.pushCmdRecent("A"); // 去重并置顶
      expect(__test.getCmdRecent()).toEqual(["A", "B"]);
      for (let i = 0; i < 8; i++) __test.pushCmdRecent("X" + i);
      const list = __test.getCmdRecent();
      expect(list.length).toBeLessThanOrEqual(5);
      expect(list[0]).toBe("X7");
    });

    it("runCmd 执行后标签进入最近使用", () => {
      win.openCmd();
      const li = [...win.document.querySelectorAll("#cmdList li[data-i]")]
        .find((el) => el.textContent.includes("切换明暗主题"));
      expect(li).toBeTruthy();
      li.click();
      expect(__test.getCmdRecent()).toContain("切换明暗主题");
    });

    it("无查询时「最近使用」组置顶渲染", () => {
      win.localStorage.setItem(PREFIX + "cmd_recent", JSON.stringify(["打开设置"]));
      win.openCmd();
      const firstGroup = win.document.querySelector("#cmdList .cmd-group");
      expect(firstGroup).toBeTruthy();
      expect(firstGroup.textContent).toBe("最近");
      const firstItem = win.document.querySelector('#cmdList li[data-i="0"]');
      expect(firstItem.textContent).toContain("打开设置");
    });
  });

  // ===== 分组渲染 =====
  describe("分组渲染", () => {
    it("无查询时含 命令/场景 分组头", () => {
      win.openCmd();
      const groups = [...win.document.querySelectorAll("#cmdList .cmd-group")].map((g) => g.textContent);
      expect(groups).toContain("命令");
      expect(groups).toContain("场景");
    });

    it("有任务时含 任务 分组", () => {
      __test.setTasks([{ id: "t1", sc: "office", title: "写周报", status: "todo", tags: [], created: Date.now() }]);
      win.openCmd();
      const groups = [...win.document.querySelectorAll("#cmdList .cmd-group")].map((g) => g.textContent);
      expect(groups).toContain("任务");
    });
  });

  // ===== 模糊搜索渲染 =====
  describe("模糊搜索渲染", () => {
    it("子序列查询可命中命令（如「切暗」命中 切换明暗主题）", () => {
      win.openCmd();
      const input = win.document.getElementById("cmdInput");
      input.value = "切暗";
      input.dispatchEvent(new win.Event("input"));
      const items = [...win.document.querySelectorAll("#cmdList li[data-i]")];
      expect(items.length).toBeGreaterThan(0);
      expect(items.some((li) => li.textContent.includes("切换明暗主题"))).toBe(true);
    });

    it("无匹配时显示「无匹配」空态", () => {
      win.openCmd();
      const input = win.document.getElementById("cmdInput");
      input.value = "zzzzz不存在";
      input.dispatchEvent(new win.Event("input"));
      expect(win.document.getElementById("cmdList").textContent).toContain("无匹配");
    });

    it("搜索时不渲染「最近」分组（避免重复）", () => {
      win.localStorage.setItem(PREFIX + "cmd_recent", JSON.stringify(["打开设置"]));
      win.openCmd();
      const input = win.document.getElementById("cmdInput");
      input.value = "设置";
      input.dispatchEvent(new win.Event("input"));
      const groups = [...win.document.querySelectorAll("#cmdList .cmd-group")].map((g) => g.textContent);
      expect(groups).not.toContain("最近");
    });
  });

  // ===== 键盘导航兼容 =====
  describe("键盘导航兼容", () => {
    it("ArrowDown 跨分组头移动选择（分组头不可选中）", () => {
      win.openCmd();
      const input = win.document.getElementById("cmdInput");
      const sel0 = win.document.querySelector("#cmdList li.sel");
      expect(sel0, "初始应选中第 0 项").toBeTruthy();
      expect(sel0.dataset.i).toBe("0");
      input.dispatchEvent(new win.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
      const sel = win.document.querySelector("#cmdList li.sel");
      expect(sel).toBeTruthy();
      expect(sel.dataset.i).toBe("1");
      expect(sel.classList.contains("cmd-group")).toBe(false);
    });
  });
});
