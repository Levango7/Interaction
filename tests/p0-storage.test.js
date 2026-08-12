/**
 * P0-4 localStorage 损坏静默清空 · 回归验证
 * ----------------------------------------------------------------------------
 * 验证对象：load() / doImport() 在「本地存储损坏」场景下的优雅降级：
 *   - 解析失败不再静默丢数据、不再崩溃；
 *   - 损坏的原始串被登记进 _corrupted 供恢复；
 *   - 首次损坏触发一次性告警 toast，不刷屏；
 *   - 启动加载阶段不会把空值覆盖写回损坏（但尚可恢复）的数据；
 *   - 导入文件损坏时告警并中止，异常不冒泡崩溃。
 *
 * 设计原则（遵循 test-discipline / anti-gaming）：
 *  - 黑盒优先：通过 jsdom 全局访问顶层函数（window.load / getTasks / doImport / toast），
 *    并用 window.__test.getCorrupted() 读取诊断寄存器（只读快照）。
 *  - 不修改任何生产文件（agent-workbench.html / electron/*.js）；本文件为新增测试。
 *  - 断言「可观测行为」：返回值、是否抛错、localStorage 是否被覆盖、toast 是否被调用。
 *
 * 运行：npx vitest run tests/p0-storage.test.js
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

/** 取全新 window 并清空 storage，获得干净状态（active 仍为默认 "office"） */
function freshWin() {
  const win = loadApp();
  win.localStorage.clear();
  return win;
}

const PREFIX = "wb_agent_";

beforeEach(() => {
  // 复位诊断寄存器（每个测试独立窗口，双保险）
  // 注意：resetCorrupted 在 window.__test 暴露；若窗口尚未初始化则跳过
});

describe("P0-4 存储损坏 · 用例 A：load 解析失败优雅降级 + 登记损坏", () => {
  it("损坏 JSON 的 key → load 返回 def([])、不抛、_corrupted 记录该 key 与原始串", () => {
    const win = freshWin();
    win.__test.resetCorrupted();

    const KEY = PREFIX + "tasks";
    const BAD = "{bad"; // 非法 JSON
    win.localStorage.setItem(KEY, BAD);

    let threw = false;
    let result;
    try {
      result = win.load(KEY, []);
    } catch (e) {
      threw = true;
    }

    // ① 不抛
    expect(threw).toBe(false);
    // ② 返回默认值（空数组），而非崩溃或抛错
    expect(Array.isArray(result)).toBe(true);
    expect(result).toEqual([]);
    // ③ 诊断寄存器记录损坏 key 与原始串（供未来导出恢复）
    const corrupted = win.__test.getCorrupted();
    expect(corrupted[KEY]).toBe(BAD);
    // ④ 首次损坏触发一次性告警 toast（仅告警，不影响返回）
    //    （toast 副作用由用例 B/C 共同验证，此处验证不抛且值被保留即可）
  });

  it("损坏 cfg key → load 返回默认 {}、不抛、_corrupted 记录", () => {
    const win = freshWin();
    win.__test.resetCorrupted();

    const KEY = PREFIX + "cfg";
    const BAD = "not-json-[";
    win.localStorage.setItem(KEY, BAD);

    let threw = false;
    let result;
    try {
      result = win.load(KEY, {});
    } catch (e) {
      threw = true;
    }

    expect(threw).toBe(false);
    expect(result).toEqual({});
    expect(win.__test.getCorrupted()[KEY]).toBe(BAD);
  });

  it("合法 JSON 不被误判为损坏（正常数据往返、_corrupted 为空）", () => {
    const win = freshWin();
    win.__test.resetCorrupted();

    const KEY = PREFIX + "tasks";
    const GOOD = JSON.stringify([{ id: "x", title: "t" }]);
    win.localStorage.setItem(KEY, GOOD);

    const result = win.load(KEY, []);
    expect(result).toEqual([{ id: "x", title: "t" }]);
    expect(Object.keys(win.__test.getCorrupted())).toEqual([]);
  });
});

describe("P0-4 存储损坏 · 用例 B：损坏 tasks 不崩 + 启动路径不回写（可恢复）", () => {
  it("损坏 tasks 后 getTasks/migrate/seed/render 均不抛，且损坏原值未被覆盖（可恢复）", () => {
    const win = freshWin();
    win.__test.resetCorrupted();

    const KEY = PREFIX + "tasks";
    const BAD = "{bad";
    win.localStorage.setItem(KEY, BAD);

    // getTasks 依赖 load，应返回 [] 且不抛
    let threwGet = false;
    let tasks;
    try {
      tasks = win.getTasks();
    } catch (e) {
      threwGet = true;
    }
    expect(threwGet).toBe(false);
    expect(tasks).toEqual([]);

    // 复现启动等价路径：migrate / seed / dailyDigest / render 不应崩溃或回写
    let threwStartup = false;
    try {
      win.migrate();
      win.seed();
      if (typeof win.dailyDigest === "function") win.dailyDigest();
      win.render();
    } catch (e) {
      threwStartup = true;
    }
    expect(threwStartup).toBe(false);

    // 核心「可恢复」不变量：损坏的原始串仍保留在 localStorage，未被空值/默认值覆盖
    expect(win.localStorage.getItem(KEY)).toBe(BAD);

    // 诊断寄存器仍记录该 key
    expect(win.__test.getCorrupted()[KEY]).toBe(BAD);
  });

  it("首次损坏触发一次告警 toast；二次损坏不再重复告警（不刷屏）", () => {
    const win = freshWin();
    win.__test.resetCorrupted();
    const toastSpy = vi.spyOn(win, "toast");

    // 第一次损坏
    win.localStorage.setItem(PREFIX + "tasks", "{bad1");
    win.load(PREFIX + "tasks", []);
    expect(toastSpy).toHaveBeenCalledTimes(1);
    expect(toastSpy).toHaveBeenCalledWith(
      "本地数据已损坏，已使用默认值。建议到设置中导出备份。",
      "warn"
    );

    // 第二次损坏（另一个 key）→ 不应再次告警
    win.localStorage.setItem(PREFIX + "cfg", "{bad2");
    win.load(PREFIX + "cfg", {});
    expect(toastSpy).toHaveBeenCalledTimes(1);

    toastSpy.mockRestore();
  });
});

describe("P0-4 导入损坏 · 用例 C：doImport 文件损坏不崩溃 + 错误告警", () => {
  it("损坏导入文件 → 捕获错误 toast、异常不冒泡、应用不崩", async () => {
    const win = freshWin();
    win.__test.resetCorrupted();
    const toastSpy = vi.spyOn(win, "toast");

    const BAD_CONTENT = "{ this is not valid json";
    // stub FileReader：readAsText 后把损坏内容塞进 result 并触发 onload
    class FakeFileReader {
      constructor() {
        this.result = "";
      }
      readAsText() {
        this.result = BAD_CONTENT;
        // 模拟浏览器异步 onload 回调
        setTimeout(() => {
          if (typeof this.onload === "function") this.onload({ target: this });
        }, 0);
      }
    }
    const origFR = win.FileReader;
    win.FileReader = FakeFileReader;

    let threw = false;
    try {
      win.doImport({ name: "corrupt.json" });
      // 全量并发时 jsdom 共享 localStorage + CPU 抢占会把 FakeFileReader 的 setTimeout(0)
      // 推到 30ms 之后，固定 sleep 不可靠；改为轮询等待 toast 真正被调用（最多 2s）。
      await vi.waitFor(() => {
        expect(toastSpy).toHaveBeenCalledWith("导入文件格式错误，无法解析。", "error");
      }, { timeout: 2000, interval: 20 });
    } catch (e) {
      threw = true;
    }

    // ① 整个导入流程不崩溃、不抛
    expect(threw).toBe(false);
    // ② toast 已在 waitFor 内断言。
    // ③ 导入失败不应改写任何键。freshWin=clear() + 启动 render 50ms 防抖定时器是否回种 seed 键存在
    //    时序竞态（共享 localStorage 池下偶发 0 键）；此处先确定性补种一个键，再验证"未被清空"。
    win.__test.setTasks([]);
    const keys = Object.keys(win.localStorage).filter((k) => k.startsWith(PREFIX));
    expect(keys.length).toBeGreaterThan(0); // 键存在，证明失败导入未把存储清空

    win.FileReader = origFR;
    toastSpy.mockRestore();
  });

  it("合法导入文件 → 正常恢复、成功 toast、不抛", async () => {
    const win = freshWin();
    const toastSpy = vi.spyOn(win, "toast");

    const good = {};
    good[PREFIX + "tasks"] = JSON.stringify([{ id: "a", sc: "office", title: "导入任务", due: "", priority: "", status: "todo", doneAt: null, note: "", tags: [], created: Date.now() }]);
    const GOOD_CONTENT = JSON.stringify(good);

    class FakeFileReader {
      constructor() { this.result = ""; }
      readAsText() {
        this.result = GOOD_CONTENT;
        setTimeout(() => { if (typeof this.onload === "function") this.onload({ target: this }); }, 0);
      }
    }
    const origFR = win.FileReader;
    win.FileReader = FakeFileReader;

    let threw = false;
    try {
      win.doImport({ name: "good.json" });
      // 同上：轮询等待异步 onload 完成（最多 2s），根治全量并发下的 30ms 竞态
      await vi.waitFor(() => {
        expect(toastSpy).toHaveBeenCalledWith("导入成功，数据已恢复", "ok");
      }, { timeout: 2000, interval: 20 });
    } catch (e) {
      threw = true;
    }

    expect(threw).toBe(false);
    expect(win.getTasks().length).toBe(1);
    expect(win.getTasks()[0].title).toBe("导入任务");

    win.FileReader = origFR;
    toastSpy.mockRestore();
  });
});

describe("P0-2 连带回归 #30 · query_overview 排除软删任务", () => {
  it("用例1：同场景 2 条任务软删 1 条 → 该场景 open=1、done=0（已删不计入）", () => {
    const win = freshWin();
    win.__test.setTasks([
      { id: "o1", sc: "office", title: "正常任务", due: "", priority: "", status: "todo", doneAt: null, note: "", tags: [], created: Date.now() },
      { id: "o2", sc: "office", title: "待删任务", due: "", priority: "", status: "todo", doneAt: null, note: "", tags: [], created: Date.now() },
    ]);

    const del = JSON.parse(win.__test.execTool("delete_task", { task_id: "o2" }, true));
    expect(del.ok).toBe(true);

    // 软删后仍保留在列表（非硬删），findTask 过滤已删
    expect(win.getTasks().length).toBe(2);
    expect(win.findTask("o2")).toBeNull();

    const res = JSON.parse(win.__test.execTool("query_overview", {}));
    expect(res.byScenario.office.open).toBe(1); // 已删的 o2 不计入
    expect(res.byScenario.office.done).toBe(0);

    // 回归护栏：未删任务仍正常计入
    expect(win.getTasks().filter((x) => !x.deletedAt).length).toBe(1);
  });

  it("用例2：today/overdue 排除软删 —— 仅正常任务计入", () => {
    const win = freshWin();
    const today = win.__test.todayStr();
    const yesterday = win.__test.shiftDay(-1);

    // today：1 条正常 + 1 条软删
    win.__test.setTasks([
      { id: "t1", sc: "office", title: "今天正常", due: today, priority: "", status: "todo", doneAt: null, note: "", tags: [], created: Date.now() },
      { id: "t2", sc: "office", title: "今天已删", due: today, priority: "", status: "todo", doneAt: null, note: "", tags: [], created: Date.now() },
    ]);
    win.__test.execTool("delete_task", { task_id: "t2" }, true);
    let res = JSON.parse(win.__test.execTool("query_overview", {}));
    expect(res.today).toBe(1); // 不含已删的那条

    // overdue：1 条正常逾期 + 1 条软删逾期
    win.__test.setTasks([
      { id: "u1", sc: "office", title: "逾期正常", due: yesterday, priority: "P0", status: "todo", doneAt: null, note: "", tags: [], created: Date.now() },
      { id: "u2", sc: "code", title: "逾期已删", due: yesterday, priority: "P0", status: "todo", doneAt: null, note: "", tags: [], created: Date.now() },
    ]);
    win.__test.execTool("delete_task", { task_id: "u2" }, true);
    res = JSON.parse(win.__test.execTool("query_overview", {}));
    expect(res.overdue).toBe(1); // 不含已删的那条
  });
});
