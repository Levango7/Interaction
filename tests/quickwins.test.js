import { describe, it, expect, beforeEach } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

/**
 * v1.1.2 Quick Wins 回归测试
 * ----------------------------------------------------------------------------
 * T1 UI 删除改软删（进回收站，与 AI delete_task 行为统一）
 * T2 回收站批量恢复 / 批量删除 + 自动清理策略（off/7/30/90）
 * T3 CSV / Markdown 导出（纯函数 + 下载包装）
 * T4 主题跟随系统（light/dark/system 三态，旧值兼容）
 * T5 焦点陷阱 + 回收站统一关闭（trapFocus / closeRecycleModal）
 */

const PREFIX = "wb_agent_";

function mkTask(id, sc, title, extra = {}) {
  return Object.assign(
    { id, sc, title, status: "todo", due: "", priority: "", tags: [], doneAt: null, created: Date.now() },
    extra
  );
}

describe("v1.1.2 Quick Wins", () => {
  let win;
  let __test;

  beforeEach(() => {
    win = loadApp();
    __test = win.__test;
    win.localStorage.clear();
  });

  // ===== T1 · UI 删除改软删 =====
  describe("T1 · UI 删除进入回收站（软删除）", () => {
    it("点击任务卡「删除」后任务置 deletedAt（软删），且从看板消失", () => {
      __test.setTasks([mkTask("t1", "office", "待删除的任务")]);
      __test.setActive("office");
      __test.render();
      const btn = win.document.querySelector('[data-del="t1"]');
      expect(btn, "看板应渲染删除按钮").toBeTruthy();
      btn.click(); // confirm 在 jsdom 中已 stub 为 true
      const all = win.getTasks();
      expect(all.length).toBe(1); // 未硬删：长度不变
      expect(all[0].deletedAt, "应置软删标记").toBeTruthy();
      // 重渲染后看板不再包含该任务（getActiveTasks 过滤）
      const main = win.document.getElementById("main");
      expect(main.innerHTML).not.toContain("待删除的任务");
    });

    it("软删任务出现在回收站，恢复后回到看板", () => {
      __test.setTasks([mkTask("t1", "office", "误删的任务", { deletedAt: Date.now() })]);
      __test.setActive("office");
      __test.render();
      win.openRecycle();
      const modal = win.document.getElementById("recycleModal");
      expect(modal).toBeTruthy();
      expect(modal.innerHTML).toContain("误删的任务");
      // 单条恢复
      win.restoreRecycle("t1");
      const t = win.getTasks().find((x) => x.id === "t1");
      expect(t.deletedAt, "恢复后应清除软删标记").toBeFalsy();
    });
  });

  // ===== T2 · 回收站批量操作 + 自动清理 =====
  describe("T2 · 回收站批量操作与自动清理策略", () => {
    it("restoreRecycleBatch 批量恢复选中任务", () => {
      __test.setTasks([
        mkTask("a", "office", "A", { deletedAt: Date.now() }),
        mkTask("b", "code", "B", { deletedAt: Date.now() }),
        mkTask("c", "study", "C", { deletedAt: Date.now() }),
      ]);
      win.restoreRecycleBatch(["a", "c"]);
      const all = win.getTasks();
      expect(all.find((t) => t.id === "a").deletedAt).toBeFalsy();
      expect(all.find((t) => t.id === "b").deletedAt, "未选中的不受影响").toBeTruthy();
      expect(all.find((t) => t.id === "c").deletedAt).toBeFalsy();
    });

    it("purgeRecycleBatch 批量彻底删除选中任务", () => {
      __test.setTasks([
        mkTask("a", "office", "A", { deletedAt: Date.now() }),
        mkTask("b", "code", "B", { deletedAt: Date.now() }),
      ]);
      win.purgeRecycleBatch(["a"]);
      const all = win.getTasks();
      expect(all.length).toBe(1);
      expect(all[0].id).toBe("b");
    });

    it("getRecyclePolicy 默认 30；非法值回退 30；setRecyclePolicy 持久化有效值", () => {
      expect(win.getRecyclePolicy()).toBe("30");
      win.setRecyclePolicy("7");
      expect(win.getRecyclePolicy()).toBe("7");
      win.setRecyclePolicy("off");
      expect(win.getRecyclePolicy()).toBe("off");
      win.setRecyclePolicy("bogus");
      expect(win.getRecyclePolicy(), "非法值回退默认 30").toBe("30");
    });

    it("cleanupRecycle 清理超过策略天数的软删任务，返回清理条数", () => {
      const now = Date.now();
      __test.setTasks([
        mkTask("old", "office", "过期", { deletedAt: now - 40 * 86400000 }),
        mkTask("new", "office", "未过期", { deletedAt: now - 1 * 86400000 }),
        mkTask("alive", "office", "活跃任务"),
      ]);
      win.setRecyclePolicy("30");
      const removed = win.cleanupRecycle();
      expect(removed).toBe(1);
      const ids = win.getTasks().map((t) => t.id);
      expect(ids).toContain("new");
      expect(ids).toContain("alive");
      expect(ids).not.toContain("old");
    });

    it("cleanupRecycle 策略为 off 时不动作（返回 0）", () => {
      __test.setTasks([mkTask("old", "office", "过期", { deletedAt: Date.now() - 400 * 86400000 })]);
      win.setRecyclePolicy("off");
      expect(win.cleanupRecycle()).toBe(0);
      expect(win.getTasks().length).toBe(1);
    });

    it("回收站弹窗渲染批量控件（全选 / 批量恢复 / 批量删除）", () => {
      __test.setTasks([mkTask("a", "office", "A", { deletedAt: Date.now() })]);
      win.openRecycle();
      const modal = win.document.getElementById("recycleModal");
      expect(modal.querySelector("#recycleSelAll")).toBeTruthy();
      expect(modal.querySelector("#recycleBatchRestore")).toBeTruthy();
      expect(modal.querySelector("#recycleBatchPurge")).toBeTruthy();
      expect(modal.querySelector(".recycle-chk")).toBeTruthy();
    });
  });

  // ===== T3 · CSV / Markdown 导出 =====
  describe("T3 · 导出 CSV / Markdown", () => {
    it("buildTasksCSV 含表头与任务行，字段正确", () => {
      const csv = win.buildTasksCSV([
        mkTask("t1", "office", "写周报", { priority: "P1", due: "2026-08-08", tags: ["周报"] }),
      ]);
      const lines = csv.split("\r\n");
      expect(lines[0]).toBe("场景,标题,状态,优先级,截止日期,标签,创建日期,完成日期");
      expect(lines[1]).toContain("办公");
      expect(lines[1]).toContain("写周报");
      expect(lines[1]).toContain("P1");
      expect(lines[1]).toContain("2026-08-08");
    });

    it("buildTasksCSV 转义含逗号/引号的字段", () => {
      const csv = win.buildTasksCSV([mkTask("t1", "office", '含,逗号"引号')]);
      expect(csv).toContain('"含,逗号""引号"');
    });

    it("buildTasksMD 按场景分组输出表格与完成率", () => {
      const md = win.buildTasksMD([
        mkTask("t1", "office", "任务A", { status: "done", doneAt: Date.now() }),
        mkTask("t2", "office", "任务B"),
      ]);
      expect(md).toContain("# Agent 工坊 · 任务清单");
      expect(md).toContain("完成率 50%");
      expect(md).toContain("## 办公");
      expect(md).toContain("| 任务A | 已完成 |");
      expect(md).toContain("| 任务B | 待办 |");
    });

    it("buildTasksMD 空列表给出提示", () => {
      expect(win.buildTasksMD([])).toContain("暂无任务");
    });

    it("doExportCSV 空任务时 toast 警告且不下载", () => {
      __test.setTasks([]);
      let downloaded = false;
      win.URL.createObjectURL = () => { downloaded = true; return "blob:x"; };
      win.doExportCSV();
      expect(downloaded).toBe(false);
    });

    it("doExportCSV / doExportMD 有任务时触发下载", () => {
      __test.setTasks([mkTask("t1", "office", "写周报")]);
      let captured = null;
      win.Blob = class { constructor(parts) { captured = parts[0]; } };
      win.URL.createObjectURL = () => "blob:fake";
      win.URL.revokeObjectURL = () => {};
      win.HTMLAnchorElement.prototype.click = function () {};
      win.doExportCSV();
      expect(captured).toContain("写周报");
      expect(captured.startsWith("\uFEFF"), "CSV 应带 BOM").toBe(true);
      win.doExportMD();
      expect(captured).toContain("写周报");
    });
  });

  // ===== T4 · 主题跟随系统 =====
  describe("T4 · 主题三态（light / dark / system）", () => {
    function mockMatchMedia(prefersDark) {
      win.matchMedia = function (q) {
        return {
          media: q,
          matches: prefersDark,
          addEventListener() {},
          removeEventListener() {},
          addListener() {},
          removeListener() {},
        };
      };
    }

    it("theme=dark / light 行为与旧版一致", () => {
      win.localStorage.setItem(PREFIX + "cfg", JSON.stringify({ theme: "dark" }));
      return win.initCrypto().then(() => {
        win.applyTheme();
        expect(win.document.documentElement.getAttribute("data-theme")).toBe("dark");
        win.localStorage.setItem(PREFIX + "cfg", JSON.stringify({ theme: "light" }));
        return win.initCrypto();
      }).then(() => {
        win.applyTheme();
        expect(win.document.documentElement.getAttribute("data-theme")).toBe(null);
      });
    });

    it("theme=system 跟随系统暗色偏好", () => {
      win.localStorage.setItem(PREFIX + "cfg", JSON.stringify({ theme: "system" }));
      return win.initCrypto().then(() => {
        mockMatchMedia(true);
        win.applyTheme();
        expect(win.document.documentElement.getAttribute("data-theme")).toBe("dark");
        // 系统切回亮色：监听器触发重应用
        mockMatchMedia(false);
        win.applyTheme();
        expect(win.document.documentElement.getAttribute("data-theme")).toBe(null);
      });
    });

    it("theme 未定义时默认跟随系统（matchMedia 不可用回退亮色）", () => {
      win.localStorage.setItem(PREFIX + "cfg", JSON.stringify({}));
      return win.initCrypto().then(() => {
        win.applyTheme();
        expect(win.document.documentElement.getAttribute("data-theme")).toBe(null);
      });
    });

    // v3.4.1 回归：setTheme 需支持 forest/ocean——5b227f4 引入主题时漏加分支，
    // 选中后落入自定义主题 else 分支回退 "light"，页面无变化
    it("setTheme forest/ocean 设置 data-theme 且持久化（不回退 light）", () => {
      return win.initCrypto().then(() => {
        expect(win.setTheme("forest")).toBe(true);
        expect(win.document.documentElement.getAttribute("data-theme")).toBe("forest");
        expect(win.getCurrentTheme()).toBe("forest");
        expect(win.setTheme("ocean")).toBe(true);
        expect(win.document.documentElement.getAttribute("data-theme")).toBe("ocean");
        expect(win.getCurrentTheme()).toBe("ocean");
        // 回归：切回 light 应清除属性并持久化
        win.setTheme("light");
        expect(win.document.documentElement.getAttribute("data-theme")).toBe(null);
        expect(win.getCurrentTheme()).toBe("light");
      });
    });
  });

  // ===== T5 · 焦点陷阱与回收站统一关闭 =====
  describe("T5 · 焦点陷阱与统一关闭", () => {
    it("trapFocus 返回 release 函数且聚焦首个可聚焦元素", () => {
      const div = win.document.createElement("div");
      div.innerHTML = '<button id="b1">一</button><input id="i1"><button id="b2">二</button>';
      win.document.body.appendChild(div);
      const release = win.trapFocus(div);
      expect(typeof release).toBe("function");
      expect(win.document.activeElement.id).toBe("b1");
      release();
      div.remove();
    });

    it("trapFocus 对无效容器返回 null", () => {
      expect(win.trapFocus(null)).toBe(null);
    });

    it("closeRecycleModal 关闭弹窗并返回 true；无弹窗返回 false", () => {
      __test.setTasks([mkTask("a", "office", "A", { deletedAt: Date.now() })]);
      win.openRecycle();
      expect(win.document.getElementById("recycleModal")).toBeTruthy();
      expect(win.closeRecycleModal()).toBe(true);
      expect(win.document.getElementById("recycleModal")).toBe(null);
      expect(win.closeRecycleModal(), "再次调用返回 false").toBe(false);
    });

    it("openRecycle 弹窗带焦点陷阱（首个控件获得焦点）", () => {
      __test.setTasks([mkTask("a", "office", "A", { deletedAt: Date.now() })]);
      win.openRecycle();
      const modal = win.document.getElementById("recycleModal");
      expect(modal).toBeTruthy();
      const card = modal.querySelector(".recycle-card");
      expect(card.contains(win.document.activeElement), "焦点应在弹窗内").toBe(true);
      win.closeRecycleModal();
    });
  });
});
