import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

describe("T4.2 骨架屏 + 空状态", () => {
  let win;
  let __test;

  beforeEach(() => {
    win = loadApp();
    __test = win.__test;
  });

  // ===== renderSkeleton：骨架屏 HTML 结构 =====
  describe("renderSkeleton - 骨架屏生成", () => {
    it("renderSkeleton 是函数且返回字符串", () => {
      expect(typeof __test.renderSkeleton).toBe("function");
      const out = __test.renderSkeleton("board");
      expect(typeof out).toBe("string");
      expect(out.length).toBeGreaterThan(0);
    });

    it('renderSkeleton("board") 返回含 .skeleton 类的看板骨架（3 列灰块占位）', () => {
      const out = __test.renderSkeleton("board");
      expect(out).toContain("skeleton");
      expect(out).toContain("skeleton-wrap");
      expect(out).toContain("kanban");
      expect(out).toContain("skeleton-kcol");
      expect(out).toContain("skeleton-block");
      // 3 列：待办 / 进行中 / 已完成
      expect(out).toContain("待办");
      expect(out).toContain("进行中");
      expect(out).toContain("已完成");
    });

    it('renderSkeleton("list") 返回含 .skeleton-line 类的列表骨架（5-6 个灰条）', () => {
      const out = __test.renderSkeleton("list");
      expect(out).toContain("skeleton-line");
      expect(out).toContain("skeleton-wrap");
      // 宽度变体类
      expect(out).toMatch(/w-(60|80|100)/);
      // 统计 skeleton-line 数量在 5-6 之间
      const lineCount = (out.match(/skeleton-line/g) || []).length;
      expect(lineCount).toBeGreaterThanOrEqual(5);
      expect(lineCount).toBeLessThanOrEqual(6);
    });

    it('renderSkeleton("chat") 返回消息气泡骨架（3-4 条交替 assistant/user）', () => {
      const out = __test.renderSkeleton("chat");
      expect(out).toContain("skeleton-msg");
      expect(out).toContain("assistant");
      expect(out).toContain("user");
      expect(out).toContain("skeleton-line");
      // 消息气泡数量在 3-4 之间
      const msgCount = (out.match(/skeleton-msg/g) || []).length;
      expect(msgCount).toBeGreaterThanOrEqual(3);
      expect(msgCount).toBeLessThanOrEqual(4);
    });

    it('renderSkeleton("stats") 返回图表区域骨架 + 指标卡片骨架', () => {
      const out = __test.renderSkeleton("stats");
      expect(out).toContain("skeleton-wrap");
      // 指标卡片骨架
      expect(out).toContain("skeleton-stat-card");
      // 图表区域骨架（大灰块）
      expect(out).toContain("skeleton-block");
      // 行容器（卡片排成一行）
      expect(out).toContain("skeleton-row");
    });

    it("renderSkeleton 未知类型返回空字符串（防御性）", () => {
      expect(__test.renderSkeleton("unknown")).toBe("");
      expect(__test.renderSkeleton("")).toBe("");
    });
  });

  // ===== renderEmpty：空状态 HTML 结构 =====
  describe("renderEmpty - 空状态生成", () => {
    it("renderEmpty 是函数且返回字符串", () => {
      expect(typeof __test.renderEmpty).toBe("function");
      const out = __test.renderEmpty("no-tasks");
      expect(typeof out).toBe("string");
      expect(out.length).toBeGreaterThan(0);
    });

    it('renderEmpty("no-tasks") 返回含 .empty-state 类和「还没有任务」文字 + 创建按钮引导', () => {
      const out = __test.renderEmpty("no-tasks");
      expect(out).toContain("empty-state");
      expect(out).toContain("empty-icon");
      expect(out).toContain("empty-text");
      expect(out).toContain("还没有任务");
      // 操作引导：按 N 或点 + 创建
      expect(out).toContain("N");
      expect(out).toContain("创建");
      // 操作按钮
      expect(out).toContain("empty-action");
      expect(out).toContain("btn-primary");
      expect(out).toContain("新建任务");
    });

    it('renderEmpty("no-records") 返回含「还没有记录」+ 开始第一个引导', () => {
      const out = __test.renderEmpty("no-records");
      expect(out).toContain("empty-state");
      expect(out).toContain("empty-icon");
      expect(out).toContain("还没有记录");
      expect(out).toContain("开始第一个");
    });

    it('renderEmpty("no-search") 返回含「未找到」匹配结果', () => {
      const out = __test.renderEmpty("no-search");
      expect(out).toContain("empty-state");
      expect(out).toContain("empty-icon");
      expect(out).toContain("未找到");
      expect(out).toContain("匹配结果");
    });

    it('renderEmpty("no-stats") 返回含「暂无数据」+ 完成任务后查看统计引导', () => {
      const out = __test.renderEmpty("no-stats");
      expect(out).toContain("empty-state");
      expect(out).toContain("empty-icon");
      expect(out).toContain("暂无数据");
      expect(out).toContain("完成任务后查看统计");
    });

    it("renderEmpty 未知类型返回空字符串（防御性）", () => {
      expect(__test.renderEmpty("unknown")).toBe("");
      expect(__test.renderEmpty("")).toBe("");
    });

    it("所有空状态都包含 SVG 图标（empty-icon 内有 <svg>）", () => {
      const types = ["no-tasks", "no-records", "no-search", "no-stats"];
      for (const t of types) {
        const out = __test.renderEmpty(t);
        expect(out, `${t} 应含 svg 图标`).toContain("<svg");
        expect(out, `${t} 应含 empty-icon 容器`).toContain("empty-icon");
      }
    });
  });

  // ===== withSkeleton：异步加载包装器 =====
  describe("withSkeleton - 异步加载包装", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("withSkeleton 是函数", () => {
      vi.useRealTimers();
      expect(typeof __test.withSkeleton).toBe("function");
    });

    it("withSkeleton 先渲染骨架屏到 #main，300ms 后执行真实渲染函数", () => {
      const doc = win.document;
      const mainEl = doc.getElementById("main");
      expect(mainEl).toBeTruthy();
      // 真实渲染回调：把 main 内容替换为标记
      let called = false;
      const realRender = () => {
        called = true;
        const m = doc.getElementById("main");
        if (m) m.innerHTML = '<div id="real-content">真实内容</div>';
      };
      // 执行 withSkeleton：立即应看到骨架屏
      __test.withSkeleton(realRender, "board");
      expect(called).toBe(false);
      const afterSkeleton = doc.getElementById("main").innerHTML;
      expect(afterSkeleton).toContain("skeleton");
      // 推进 300ms：真实渲染应被执行
      vi.advanceTimersByTime(300);
      expect(called).toBe(true);
      const afterReal = doc.getElementById("main").innerHTML;
      expect(afterReal).toContain("真实内容");
    });

    it("withSkeleton 默认使用 board 骨架屏类型", () => {
      const doc = win.document;
      const mainEl = doc.getElementById("main");
      expect(mainEl).toBeTruthy();
      __test.withSkeleton(() => {}, undefined);
      const html = doc.getElementById("main").innerHTML;
      expect(html).toContain("kanban");
      expect(html).toContain("skeleton-kcol");
    });

    it("withSkeleton 支持指定骨架屏类型（如 stats）", () => {
      const doc = win.document;
      const mainEl = doc.getElementById("main");
      expect(mainEl).toBeTruthy();
      __test.withSkeleton(() => {}, "stats");
      const html = doc.getElementById("main").innerHTML;
      expect(html).toContain("skeleton-stat-card");
    });
  });

  // ===== 集成：各视图空状态已接入 =====
  describe("集成 - 各视图空状态接入", () => {
    it("搜索无结果时 renderGlob 使用 no-search 空状态", () => {
      const doc = win.document;
      // 清空任务和记录确保无匹配
      __test.setTasks([]);
      __test.ORDER.forEach(sc => __test.setRec(sc, []));
      // 切到 overview 并渲染（renderGlob 依赖 #globRes 元素）
      __test.setActive("overview");
      __test.render();
      const globRes = doc.getElementById("globRes");
      expect(globRes).toBeTruthy();
      // 触发搜索一个不存在的关键词
      const globSearch = doc.getElementById("globSearch");
      expect(globSearch).toBeTruthy();
      globSearch.value = "zzz不存在的关键词zzz";
      globSearch.dispatchEvent(new win.Event("input"));
      // 应含 no-search 空状态
      expect(globRes.innerHTML).toContain("empty-state");
      expect(globRes.innerHTML).toContain("未找到");
    });

    it("v2.5 仪表盘合并至主页——stats 视图重定向到 overview（不再渲染 no-stats 空状态）", () => {
      const doc = win.document;
      __test.setTasks([]);
      __test.setActive("stats");
      __test.render();
      // v2.5：stats 重定向到 overview，active 变为 overview
      expect(__test.getActive()).toBe("overview");
    });

    it("场景无任务时 renderMainHTML 使用 no-tasks 空状态", () => {
      const doc = win.document;
      __test.setTasks([]);
      __test.setActive("office");
      __test.render();
      const main = doc.getElementById("main");
      expect(main.innerHTML).toContain("empty-state");
      expect(main.innerHTML).toContain("还没有任务");
    });

    it("场景无记录时 renderMainHTML 使用 no-records 空状态", () => {
      const doc = win.document;
      // 有任务但无记录（避免看板 no-tasks 覆盖整个视图）
      __test.setTasks([{ id:"t1", sc:"office", title:"测试任务", status:"todo", due:"", priority:"", tags:[], doneAt:null, created:Date.now() }]);
      __test.setRec("office", []);
      __test.setActive("office");
      __test.render();
      const main = doc.getElementById("main");
      expect(main.innerHTML).toContain("empty-state");
      expect(main.innerHTML).toContain("还没有记录");
    });
  });
});
