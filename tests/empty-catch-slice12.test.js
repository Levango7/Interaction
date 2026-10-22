/**
 * empty-catch-slice12.test.js —— R-2 切片二（同步面 + 导入/清空面）的可观测行为用例
 * ----------------------------------------------------------------------------
 * 对应 commit 的改动：`src/render-overview.js` 5 处 + `src/ui-backup-stats.js` 3 处
 * （P0 71 → 63；12 处审视后**只改 8 处**，另 4 处判定"静默不产生相反结论"，只补了说明理由的注释）。
 *
 * 本文件不许只是"把 catch 填上日志就算修完" —— 每条断言的都是**外部可见的结果**：
 *   ① 云快照读不到某个键 ⇒ 该键悄悄缺席，而上传照发、面板照显"同步成功"（谎报，且不可补救）
 *   ② 云端合并失败 ⇒ **算法被换成纯覆盖**（本机较新的任务被盖掉），界面却只写"已恢复"
 *   ③ 云端恢复写入失败 ⇒ 该键实际没恢复，而 `lastPullAt` 照写（谎报 + 覆盖计数偏小）
 *   ④ 「清空全部数据」删除失败 ⇒ 该键仍在本机，而用户刚读过"不可恢复"并点了确定
 *   ⑤ 工作流 AI 调用失败 ⇒ 降级为待办是对的，但不说为什么（没配置 / 挂了 / 空返回长得一样）
 *
 * 每条都**同时**钉住"控制流不变"（原静默继续的，改后依然继续）—— 防止把消解做成
 * 另一种坏：为了留痕而中断用户的导入/恢复/清空。
 *
 * 运行：npx vitest run tests/empty-catch-slice12.test.js
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { loadApp } from "./helpers/loadApp.js";
import { autoDangerConfirm } from "./helpers/autoDangerConfirm.js";

const PREFIX = "wb_agent_";

let win;
const orig = {};

beforeEach(async () => {
  win = loadApp();
  await new Promise((r) => setTimeout(r, 60)); // 等启动异步链（与 slice1 / crypto 同口径）
  win.localStorage.clear();
  orig.setItem = win.Storage.prototype.setItem;
  orig.getItem = win.Storage.prototype.getItem;
  orig.removeItem = win.Storage.prototype.removeItem;
});

afterEach(() => {
  win.Storage.prototype.setItem = orig.setItem;
  win.Storage.prototype.getItem = orig.getItem;
  win.Storage.prototype.removeItem = orig.removeItem;
  vi.restoreAllMocks();
});

/** 只让包含 `needle` 的键写入失败（模拟配额满 / 隐私模式），其余照常 */
function failWriteWhen(needle) {
  win.Storage.prototype.setItem = function (k, v) {
    if (String(k).includes(needle)) throw new win.DOMException("QuotaExceededError", "QuotaExceededError");
    return orig.setItem.call(this, k, v);
  };
}
function failReadWhen(needle) {
  win.Storage.prototype.getItem = function (k) {
    if (String(k).includes(needle)) throw new win.DOMException("SecurityError", "SecurityError");
    return orig.getItem.call(this, k);
  };
}
function failRemoveWhen(needle) {
  win.Storage.prototype.removeItem = function (k) {
    if (String(k).includes(needle)) throw new win.DOMException("SecurityError", "SecurityError");
    return orig.removeItem.call(this, k);
  };
}

const diag = (spy, level, re) =>
  spy.mock.calls.find((c) => (!level || c[0] === level) && re.test(String(c[1])));

/* -------------------------------------------------------------------------- */
describe("① 云快照：读不到的键不许悄悄缺席", () => {
  it("某键读抛错 → 诊断点名该键，且其余键照常进快照（控制流不变）", () => {
    win.localStorage.setItem(PREFIX + "notes", JSON.stringify([{ id: "n1" }]));
    win.localStorage.setItem(PREFIX + "records", JSON.stringify([{ id: "r1" }]));
    failReadWhen("records");
    const spy = vi.spyOn(win, "pushDiag");

    const snap = win.__test._buildCloudSnapshot();

    const hit = diag(spy, "warn", /snapshot read failed/i);
    expect(hit, "读失败必须进诊断：否则用户拿到一份不自知残缺的云快照").toBeTruthy();
    expect(hit[1], "必须点名是哪个键（'少一个键'和'根本没读到'不能长得一样）").toMatch(/records/);
    expect(hit[2] && hit[2].key, "诊断要带 key 元数据").toMatch(/records/);
    expect(snap[PREFIX + "notes"], "其余键照常进快照 —— 消解不得改变控制流").toBeTruthy();
    expect(snap[PREFIX + "records"], "读不到的这个键本就不在（不是被塞了个假值）").toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- */
describe("② 云端合并失败 ⇒ 退化成覆盖：必须留痕（最贵的一条）", () => {
  it("合并阶段抛错 → 报 error 并点明'退化为覆盖'，且行为不变（照旧写入）", () => {
    /* 让 `getTasks()` 抛错即可命中合并的 catch：它就在 try 体内。
       注意这不是伪造失败 —— 存储/取任务抛错在配额满、隐私模式下是真实形态。 */
    win.localStorage.setItem(PREFIX + "tasks", JSON.stringify([{ id: "local-only", sc: "office", title: "本机较新", updatedAt: 999 }]));
    const spy = vi.spyOn(win, "pushDiag");
    const realGetTasks = win.getTasks;
    win.getTasks = () => { throw new Error("tasks 读不出来"); };

    let threw = false;
    try {
      win._applyCloudSnapshot({ [PREFIX + "tasks"]: JSON.stringify([{ id: "remote", sc: "office", title: "云端旧值", updatedAt: 1 }]) });
    } catch (e) { threw = true; }
    win.getTasks = realGetTasks;

    expect(threw, "合并失败不许把恢复整个打断（控制流不变）").toBe(false);
    const hit = diag(spy, "error", /云端合并失败/i);
    expect(hit, "合并失败必须进诊断：它会把算法悄悄换成纯覆盖").toBeTruthy();
    expect(hit[1], "必须点明后果：本地较新的任务可能被盖掉").toMatch(/覆盖/);
    expect(win.localStorage.getItem(PREFIX + "tasks"), "行为不变：云端值照旧写入（覆盖语义保持）")
      .toContain("remote");
  });
});

/* -------------------------------------------------------------------------- */
describe("③ 云端恢复写入失败 ⇒ 界面却显示已恢复", () => {
  it("某键写不进去 → 报 error 点名该键，其余键照常恢复", () => {
    failWriteWhen("notes");
    const spy = vi.spyOn(win, "pushDiag");

    let threw = false;
    try {
      win._applyCloudSnapshot({
        [PREFIX + "notes"]: JSON.stringify([{ id: "n1" }]),
        [PREFIX + "records"]: JSON.stringify([{ id: "r1" }]),
      });
    } catch (e) { threw = true; }

    expect(threw, "单个键写失败不许中断整次恢复").toBe(false);
    const hit = diag(spy, "error", /云端恢复写入失败/i);
    expect(hit, "写失败必须进诊断：此时界面仍会显示'已从云端恢复'（谎报）").toBeTruthy();
    /* 键名必须在 **msg 正文**里：诊断面板 renderDiagList() 只渲染 e.msg，
       pushDiag 的元数据不显示 —— 只写元数据等于"对机器说了、没对用户说"。 */
    expect(hit[1], "必须点名是哪个键没恢复（且要写进 msg 正文，元数据不显示）").toMatch(/notes/);
    expect(hit[2] && hit[2].key, "元数据也带 key，供导出的诊断报告用").toMatch(/notes/);
    expect(win.localStorage.getItem(PREFIX + "records"), "其余键照常恢复（控制流不变）").toBeTruthy();
    expect(win.localStorage.getItem(PREFIX + "notes"), "这个键确实没恢复 —— 断言的是事实，不是日志").toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
describe("④ 「清空全部数据」删不掉 ⇒ 数据还在，而用户刚确认过不可恢复", () => {
  it("某键删除抛错 → 报 error 点名该键；其余键照删、流程不中断", async () => {
    win.localStorage.setItem(PREFIX + "notes", JSON.stringify([{ id: "n1" }]));
    win.localStorage.setItem(PREFIX + "records", JSON.stringify([{ id: "r1" }]));
    failRemoveWhen("notes");
    const spy = vi.spyOn(win, "pushDiag");

    // dangerConfirm 是 doClear 的第一个 await，浮层同步进 DOM ⇒ 可同步点掉再 await
    const p = win.__test.doClear();
    const yes = win.document.getElementById("dangerConfirmModalYes");
    expect(yes, "doClear 必须先弹确认浮层再动手").toBeTruthy();
    yes.click();
    let threw = false;
    try { await p; } catch (e) { threw = true; }

    expect(threw, "单个键删不掉不许让清空整个崩掉").toBe(false);
    const hit = diag(spy, "error", /清空删除失败/i);
    expect(hit, "删除失败必须进诊断：UI 会显示已清空，而该键仍在本机").toBeTruthy();
    expect(hit[1], "必须点名是哪个键还在（写进 msg 正文，元数据不显示）").toMatch(/notes/);
    expect(hit[2] && hit[2].key, "元数据也带 key").toMatch(/notes/);
    expect(win.localStorage.getItem(PREFIX + "notes"), "事实：这个键确实还在本机").toBeTruthy();
    expect(win.localStorage.getItem(PREFIX + "records"), "其余键照删（控制流不变）").toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
describe("⑥ 导入写入失败 ⇒ 界面却提示导入成功", () => {
  /** 造一个"读出来就是 content"的 FileReader，并给导入的确认浮层装自动接盘器 */
  function stubImport(content) {
    class FakeFileReader {
      constructor() { this.result = ""; }
      readAsText() {
        this.result = content;
        setTimeout(() => { if (typeof this.onload === "function") this.onload({ target: this }); }, 0);
      }
    }
    win.FileReader = FakeFileReader;
    return autoDangerConfirm(win);
  }
  const waitFor = (pred, timeout = 5000, interval = 20) =>
    new Promise((resolve, reject) => {
      const t0 = Date.now();
      (function tick() {
        let ok = false;
        try { ok = !!pred(); } catch (e) { /* 谓词抛错视为未满足 */ }
        if (ok) return resolve();
        if (Date.now() - t0 > timeout) return reject(new Error("waitFor 超时"));
        setTimeout(tick, interval);
      })();
    });

  it("某键写不进去 → 报 error 点名该键，其余键照常导入（控制流不变）", async () => {
    const payload = {
      _deviceMeta: { deviceId: "dev-x", exportedAt: Date.now(), version: "3.7.137" },
      [PREFIX + "tasks"]: JSON.stringify([{ id: "t1", sc: "office", title: "导入的任务" }]),
      [PREFIX + "notes"]: JSON.stringify([{ id: "n1", title: "导入的笔记" }]),
    };
    const stop = stubImport(JSON.stringify(payload));
    failWriteWhen("notes");
    const spy = vi.spyOn(win, "pushDiag");
    try {
      win.doImport({ name: "slice12.json" });
      await waitFor(() => spy.mock.calls.some((c) => /导入写入失败/.test(String(c[1]))
        || win.localStorage.getItem(PREFIX + "tasks") !== null), 8000);
    } finally {
      stop();
    }

    const hit = diag(spy, "error", /导入写入失败/i);
    expect(hit, "导入写失败必须进诊断：流程照常提示成功，而该键其实没进来").toBeTruthy();
    expect(hit[1], "必须点名是哪个键（写进 msg 正文）").toMatch(/notes/);
    expect(win.localStorage.getItem(PREFIX + "tasks"), "其余键照常导入（控制流不变）").toContain("t1");
    expect(win.localStorage.getItem(PREFIX + "notes"), "事实：这个键确实没导入").toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
describe("⑤ 工作流 AI 调用失败：降级可以，不说为什么不行", () => {
  it("chatOnce 抛错 → 报 warn，且照旧降级为一条待办提醒（控制流不变）", async () => {
    win.localStorage.setItem(PREFIX + "tasks", JSON.stringify([]));
    const spy = vi.spyOn(win, "pushDiag");
    win.chatOnce = () => { throw new Error("AI 未配置"); };

    let threw = false;
    try { await win._wfRunFlow(0, { name: "周报", trigger: "生成周报" }); } catch (e) { threw = true; }
    expect(threw, "_wfRunFlow 不许把异常抛给调用方（原本就是吞掉的）").toBe(false);

    const hit = diag(spy, "warn", /工作流 AI 调用失败/i);
    expect(hit, "降级本身是对的，但必须说清是 AI 没跑起来 —— 否则'没配置'与'挂了'长得一样").toBeTruthy();
    expect(hit[2] && hit[2].flow, "诊断要带 flow 名，否则多条工作流混成一条").toBe("周报");
    const tasks = win.__test.getTasks();
    expect(tasks.length, "降级路径照走：仍生成一条待办提醒（控制流不变）").toBe(1);
  });
});
