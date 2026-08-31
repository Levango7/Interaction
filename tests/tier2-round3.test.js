import { describe, it, expect, beforeEach } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

/**
 * 第三轮 Tier 2 回归测试
 * ----------------------------------------------------------------------------
 * P8  多维筛选（场景/状态/日期/标签）+ 保存视图
 * P2' 跨场景习惯链有向图（renderChainGraph 纯渲染）
 * P9  稍后提醒（snooze）+ 免打扰时段（isQuietTime / runNotifyCheck 联动）
 */

const PREFIX = "wb_agent_";

function mkTask(id, sc, title, extra = {}) {
  return Object.assign(
    { id, sc, title, status: "todo", due: "", priority: "", tags: [], doneAt: null, created: Date.now() },
    extra
  );
}
function ymd(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const p = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}

describe("第三轮 Tier 2（P8 / P2' / P9）", () => {
  let win;
  let __test;

  beforeEach(() => {
    win = loadApp();
    __test = win.__test;
    win.localStorage.clear();
  });

  // ===== P8 · 多维筛选 + 保存视图 =====
  describe("P8 · 多维筛选与保存视图", () => {
    it("_applyGlobFilters 按场景/状态/标签组合过滤", () => {
      __test.setTasks([
        mkTask("a", "office", "写周报", { tags: ["周报"] }),
        mkTask("b", "code", "修 bug", { status: "done", doneAt: Date.now(), tags: ["urgent"] }),
        mkTask("c", "office", "整理会议纪要"),
      ]);
      // 场景 office
      let out = __test._applyGlobFilters({ q: "", sc: "office", status: "", date: "", tag: "" });
      expect(out.map((t) => t.id).sort()).toEqual(["a", "c"]);
      // 状态 done
      out = __test._applyGlobFilters({ q: "", sc: "", status: "done", date: "", tag: "" });
      expect(out.map((t) => t.id)).toEqual(["b"]);
      // 标签 urgent
      out = __test._applyGlobFilters({ q: "", sc: "", status: "", date: "", tag: "urgent" });
      expect(out.map((t) => t.id)).toEqual(["b"]);
      // 组合：office + 关键词 周报
      out = __test._applyGlobFilters({ q: "周报", sc: "office", status: "", date: "", tag: "" });
      expect(out.map((t) => t.id)).toEqual(["a"]);
    });

    it("_applyGlobFilters 日期过滤：今天 / 逾期 / 本周", () => {
      __test.setTasks([
        mkTask("today", "office", "今天到期", { due: ymd(0) }),
        mkTask("overdue", "office", "逾期", { due: ymd(-3) }),
        mkTask("future", "office", "远期", { due: ymd(60) }),
        mkTask("nodate", "office", "无日期"),
      ]);
      const f = (date) => __test._applyGlobFilters({ q: "", sc: "", status: "", date, tag: "" }).map((t) => t.id).sort();
      expect(f("today")).toEqual(["today"]);
      expect(f("overdue")).toEqual(["overdue"]);
      const week = f("week");
      expect(week).toContain("today");
      expect(week).not.toContain("future");
      expect(week).not.toContain("nodate");
    });

    it("自定义场景任务可被场景筛选命中", () => {
      const r = __test.addCustomScenario("健身", "#ff6600", "check");
      __test.setTasks([mkTask("g1", r.key, "跑步")]);
      const out = __test._applyGlobFilters({ q: "", sc: r.key, status: "", date: "", tag: "" });
      expect(out.map((t) => t.id)).toEqual(["g1"]);
    });

    it("saveGlobView 保存/覆盖/删除；非法名称拒绝", () => {
      expect(__test.saveGlobView("").ok).toBe(false);
      expect(__test.saveGlobView("这个视图的名字实在是太长了超过限制了").ok).toBe(false);
      expect(__test.saveGlobView("办公未完成").ok).toBe(true);
      expect(__test.getGlobViews().length).toBe(1);
      // 同名覆盖（不新增）
      expect(__test.saveGlobView("办公未完成").ok).toBe(true);
      expect(__test.getGlobViews().length).toBe(1);
      __test.removeGlobView("办公未完成");
      expect(__test.getGlobViews().length).toBe(0);
    });

    it("视图持久化键带 PREFIX 前缀（随备份导出）", () => {
      __test.saveGlobView("测试视图");
      const key = Object.keys(win.localStorage).find((k) => k.includes("glob_views"));
      expect(key).toBeTruthy();
      expect(key.startsWith(PREFIX)).toBe(true);
    });

    it("总览页渲染筛选控件（场景/状态/日期/标签下拉）", () => {
      __test.setActive("overview");
      __test.render();
      const doc = win.document;
      expect(doc.getElementById("globFSc")).toBeTruthy();
      expect(doc.getElementById("globFStatus")).toBeTruthy();
      expect(doc.getElementById("globFDate")).toBeTruthy();
      expect(doc.getElementById("globFTag")).toBeTruthy();
      // 场景下拉含内置 + 自定义场景
      const r = __test.addCustomScenario("健身", "#ff6600", "check");
      __test.render();
      expect(doc.getElementById("globFSc").innerHTML).toContain(r.key);
    });

    it("renderGlob 多维筛选结果渲染（含日期与标签元信息）", () => {
      __test.setTasks([mkTask("a", "office", "写周报", { due: ymd(0), tags: ["周报"] })]);
      __test.setActive("overview");
      __test.render();
      const doc = win.document;
      doc.getElementById("globSearch").value = "周报";
      doc.getElementById("globFSc").value = "office";
      win.renderGlob("周报");
      const res = doc.getElementById("globRes").innerHTML;
      expect(res).toContain("写周报");
      expect(res).toContain(ymd(0));
      expect(res).toContain("周报");
    });
  });

  // ===== P2' · 习惯链有向图 =====
  describe("P2' · 跨场景习惯链有向图", () => {
    it("renderChainGraph 输出 SVG：节点含参与链路的场景，边数与启用链一致", () => {
      const html = __test.renderChainGraph();
      expect(html).toContain("<svg");
      // 默认 3 条链：office→study / study→code / code→life，4 个节点
      expect(html).toContain("办公");
      expect(html).toContain("编程");
      expect(html).toContain("学习");
      expect(html).toContain("生活");
      expect((html.match(/<circle/g) || []).length).toBe(4);
      // 边路径带 fill="none"（排除箭头 marker 内的 path）
      expect((html.match(/<path[^>]*fill="none"/g) || []).length).toBe(3);
    });

    it("禁用链以虚线渲染；自定义场景节点自动纳入", () => {
      const r = __test.addCustomScenario("健身", "#ff6600", "check");
      __test.addCustomLink("life", "犒劳", r.key);
      // 禁用一条内置链
      const links = __test.getLinks().map((l) => l.id === "l1" ? Object.assign({}, l, { enabled: false }) : l);
      win.localStorage.setItem("wb_custom_links", JSON.stringify(links));
      const html = __test.renderChainGraph();
      expect(html).toContain('stroke-dasharray="4 3"', "禁用链虚线");
      expect(html).toContain("健身", "自定义场景节点");
      expect((html.match(/<circle/g) || []).length).toBe(5);
    });

    it("无链时返回空提示，不崩溃", () => {
      win.localStorage.setItem("wb_custom_links", JSON.stringify([]));
      const html = __test.renderChainGraph();
      expect(html).toContain("暂无联动规则"); // v3.2.2 改名
      expect(html).not.toContain("<svg");
    });

    it("习惯链卡片集成有向图区块", () => {
      __test.setActive("overview");
      __test.render();
      const main = win.document.getElementById("main").innerHTML;
      expect(main).toContain("场景链路图");
      expect(main).toContain("chain-graph");
    });
  });

  // ===== P9 · 稍后提醒 + 免打扰 =====
  describe("P9 · 稍后提醒（snooze）", () => {
    it("snoozeTask 后 checkDueTasks 立即不再返回该任务", () => {
      __test.setTasks([mkTask("t1", "office", "到期任务", { due: ymd(0) })]);
      expect(__test.checkDueTasks(Date.now()).length).toBe(1);
      expect(__test.snoozeTask("t1", 30)).toBe(true);
      expect(__test.checkDueTasks(Date.now()).length, "snooze 期内不提醒").toBe(0);
    });

    it("snooze 到期后恢复提醒", () => {
      __test.setTasks([mkTask("t1", "office", "到期任务", { due: ymd(0) })]);
      __test.snoozeTask("t1", 30);
      // 快进 31 分钟
      expect(__test.checkDueTasks(Date.now() + 31 * 60000).length).toBe(1);
    });

    it("snooze 分钟数非法时回退 30 分钟；空 id 返回 false", () => {
      __test.setTasks([mkTask("t1", "office", "到期任务", { due: ymd(0) })]);
      expect(__test.snoozeTask("", 30)).toBe(false);
      expect(__test.snoozeTask("t1", -5)).toBe(true);
      expect(__test.checkDueTasks(Date.now() + 29 * 60000).length, "回退 30 分钟仍生效").toBe(0);
      expect(__test.checkDueTasks(Date.now() + 31 * 60000).length).toBe(1);
    });

    it("已完成任务 snooze 后仍不提醒（状态过滤优先）", () => {
      __test.setTasks([mkTask("t1", "office", "已完成", { due: ymd(0), status: "done", doneAt: Date.now() })]);
      __test.snoozeTask("t1", 1);
      expect(__test.checkDueTasks(Date.now() + 2 * 60000).length).toBe(0);
    });
  });

  describe("P9 · 免打扰时段", () => {
    function at(hour) {
      const d = new Date();
      d.setHours(hour, 0, 0, 0);
      return d.getTime();
    }

    it("isQuietTime：普通时段（9-12）与跨天时段（22-8）", () => {
      const q1 = { enabled: true, start: 9, end: 12 };
      expect(__test.isQuietTime(at(10), q1)).toBe(true);
      expect(__test.isQuietTime(at(12), q1), "end 为开区间").toBe(false);
      expect(__test.isQuietTime(at(8), q1)).toBe(false);
      const q2 = { enabled: true, start: 22, end: 8 };
      expect(__test.isQuietTime(at(23), q2)).toBe(true);
      expect(__test.isQuietTime(at(3), q2), "跨天后半段").toBe(true);
      expect(__test.isQuietTime(at(12), q2)).toBe(false);
      // 未启用
      expect(__test.isQuietTime(at(23), Object.assign({}, q2, { enabled: false }))).toBe(false);
    });

    it("get/setQuietHours：持久化与非法值回退", () => {
      const q = __test.setQuietHours({ enabled: true, start: 23, end: 7 });
      expect(q.enabled).toBe(true);
      expect(q.start).toBe(23);
      expect(__test.getQuietHours().start).toBe(23);
      // 非法值回退默认
      const bad = __test.setQuietHours({ start: 99, end: -1 });
      expect(bad.start).toBe(22);
      expect(bad.end).toBe(8);
    });

    it("免打扰期间 runNotifyCheck 不触发提醒且不标记（时段后补提醒）", () => {
      __test.setTasks([mkTask("t1", "office", "到期任务", { due: ymd(0) })]);
      __test.setNotifyEnabled(true);
      __test.setQuietHours({ enabled: true, start: 0, end: 24 }); // 全天免打扰
      const stats = __test.runNotifyCheck();
      expect(stats.due).toBe(0);
      // 未标记已提醒：关闭免打扰后仍会提醒
      __test.setQuietHours({ enabled: false });
      const stats2 = __test.runNotifyCheck();
      expect(stats2.due).toBe(1);
    });
  });
});
