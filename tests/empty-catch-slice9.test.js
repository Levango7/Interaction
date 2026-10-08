/**
 * empty-catch-slice9.test.js —— R-2 第九片（ui-backup-stats：备份面 7 处 P0-a + 台账挂账的 R-8）
 * ----------------------------------------------------------------------------
 * 本片处理的是**安全语义最重**的一簇：7 处 P0-a 全在同一个文件 —— 备份/恢复面。
 * 静默吞在这里的代价不是"少一条日志"，而是**用户数据真的回不来**（导出/恢复少东西却报成功）。
 *   ① doExport：某键读失败 → 导出照样成功，用户拿到不知情的残缺备份
 *   R-8：tasks 值非数组时读者侧刻意退化成 [] → 导出「合法地」不含任何任务（台账挂账项）
 *   ② doIdbExport：localStorage 枚举整体 try → 点不出哪些键没进备份
 *   ③④ doIdbImport：localStorage / IDB v2 写失败被吞 → 结尾仍报「已恢复 N 项」
 *   ⑤ _diagStorageLine：读不到的键不计入 → 占用显示偏低，用户据此误判余量
 *   ⑥ pushSnapshot：快照枚举失败 → 推给主进程的是残缺快照（每 60s 一次，留痕节流）
 *   ⑦ setTodoBarExpanded：展开偏好写失败 → 下次悄悄回退（高频，只报第一次）
 *   ⑧ initTodoBar：读失败回落默认折叠 —— 判据④预期降级，**只补注释不登记**（故本片无对应用例）
 *
 * 反向守护同样重要：**全正常时零诊断** —— 可观测性不能反过来制造噪声。
 *
 * ⚠️ jsdom 要点：
 *   ① mock localStorage 必须打 `Storage.prototype`（jsdom 的 Storage 是 Proxy，实例层赋值静默失效）；
 *   ② `<a download>.click()` 会被 jsdom 判为未实现的导航 → 拦掉 anchor click；
 *   ③ doIdbImport 成功后会 `location.reload()` → 拦掉，否则把共享的 jsdom 实例炸掉。
 *
 * 运行：node_modules/.bin/vitest run tests/empty-catch-slice9.test.js   （需拼回态）
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { loadApp } from "./helpers/loadApp.js";
import fs from "node:fs";
import path from "node:path";
import { scanSource, keyOf } from "../scripts/lib/empty-catch.mjs";

const SRC = path.resolve(process.cwd(), "src", "ui-backup-stats.js");
const BASE_PATH = path.resolve(process.cwd(), "scripts", "lint-empty-catch.baseline.json");

let win, toasts, diagCalls, PREFIX;

function installProbes() {
  toasts = [];
  diagCalls = [];
  Object.defineProperty(win, "toast", { configurable: true, value: (msg, kind) => toasts.push({ msg: String(msg), kind }) });
  Object.defineProperty(win, "pushDiag", { configurable: true, value: (level, msg, ctx) => diagCalls.push({ level, msg, ctx }) });
}

/** 让若干 key 的 getItem 抛错（模拟配额满 / 隐私模式下读失败） */
function failReadOn(keys) {
  const proto = win.Storage.prototype;
  const orig = proto.getItem;
  proto.getItem = function (k) {
    if (keys.indexOf(k) !== -1) throw new Error("SecurityError: read denied");
    return orig.call(this, k);
  };
  return () => { proto.getItem = orig; };
}

/** 让若干 key 的 setItem 抛错（模拟配额满写不进去） */
function failWriteOn(keys) {
  const proto = win.Storage.prototype;
  const orig = proto.setItem;
  proto.setItem = function (k, v) {
    if (keys.indexOf(k) !== -1) throw new Error("QuotaExceededError");
    return orig.call(this, k, v);
  };
  return () => { proto.setItem = orig; };
}

const toastOf = (re) => toasts.filter((t) => re.test(t.msg));
const diagOf = (where) => diagCalls.filter((d) => d.ctx && d.ctx.where === where);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

beforeAll(async () => {
  win = loadApp({ storage: { wb_agent_onboarded: "true" } });
  win.fetch = async function () { throw new Error("no-net-in-test"); };
  /* jsdom 未实现 `<a download>` 的导航；不拦会把每条用例炸成 "Not implemented: navigation"。 */
  win.HTMLAnchorElement.prototype.click = function () { /* 下载在测试里不必真发生 */ };
  /* jsdom 也没有 URL.createObjectURL：不 mock 的话导出会在下载前一步就抛，
     后面的「完整性告知」根本执行不到 —— 那才是本片要测的东西。 */
  win.URL.createObjectURL = function () { return "blob:mock-for-test"; };
  win.URL.revokeObjectURL = function () { /* 无需回收 */ };
  await wait(250);
  PREFIX = win.eval("PREFIX");
  installProbes();
});

beforeEach(() => {
  toasts.length = 0;
  diagCalls.length = 0;
});

afterAll(() => {
  try { win && win.close && win.close(); } catch (_) { /* jsdom 关闭失败不影响断言 */ }
});

describe("① 导出完整性：残缺不得被当成完整", () => {
  it("doExport：某个键读失败 → 点名告知 + 归因 doExport 并带键名", async () => {
    const target = PREFIX + "slice9_probe";
    win.localStorage.setItem(target, "v");
    const restore = failReadOn([target]);
    try {
      await win.doExport();
    } finally {
      restore();
    }
    const hit = toastOf(/个键读取失败/);
    expect(hit, "读失败却在导出后只字不提 = 用户把残缺备份当完整").toHaveLength(1);
    expect(hit[0].kind).toBe("warn");
    expect(diagOf("doExport").some((d) => d.ctx.key === target)).toBe(true);
  });

  it("🔴 R-8（台账挂账）：tasks 值非数组 → 点名「未包含任何任务」", async () => {
    /* 读者侧 `_tasksForRead()` 对非数组**刻意退化成 []**（启动链崩掉比少显示更糟），
       于是导出会「合法地」不含任何任务 —— 这是台账里挂了三个版本的那一条。 */
    win.localStorage.setItem(PREFIX + "tasks", JSON.stringify("i-am-not-an-array"));
    try {
      await win.doExport();
    } finally {
      win.localStorage.removeItem(PREFIX + "tasks");
    }
    const hit = toastOf(/tasks 数据损坏|未包含任何任务/);
    expect(hit, "残缺备份不能看起来像成功").toHaveLength(1);
  });

  it("doIdbExport：逐键失败 → 残缺**写进备份文件本身** + toast 标明不完整", async () => {
    const target = PREFIX + "slice9_idb_probe";
    win.localStorage.setItem(target, "v");
    const restore = failReadOn([target]);
    let backup;
    try {
      backup = await win.doIdbExport();
    } finally {
      restore();
    }
    /* 写进文件：用户下一次恢复时也能看出这份少数据（光靠 toast，事后已无从查证） */
    expect(backup._localStorageFailed, "残缺必须由文件自己说出来").toContain(target);
    expect(toastOf(/不完整/).length, "导出时必须告知").toBeGreaterThan(0);
  });

  it("反向守护：一切正常 → 零诊断、无残缺标记、不提任何问题", async () => {
    await win.doExport();
    const backup = await win.doIdbExport();
    expect(diagCalls, "正常路径不该产生任何诊断噪声").toHaveLength(0);
    expect(backup._localStorageFailed).toBeUndefined();
    expect(toastOf(/不完整|个键读取失败|未包含任何任务/)).toHaveLength(0);
  });
});

describe("② 恢复完整性：「已恢复 N 项」不许只讲成功的一半", () => {
  /** 构造一个最小 IDB 备份文件并喂给 doIdbImport；返回用于等待的 Promise */
  function importBackup(obj) {
    const blob = new win.Blob([JSON.stringify(obj)], { type: "application/json" });
    return win.doIdbImport(blob);
  }

  it("localStorage 写失败 → 另有 N 项未能恢复要点名 + 归因 doIdbImport", async () => {
    const key = PREFIX + "slice9_restore_ls";
    /* 两个键：一个成功保证走「已恢复 N 项」分支，一个失败触发点名 */
    const restore = failWriteOn([key]);
    try {
      importBackup({ _type: "idb-backup", localStorage: { [key]: "1", [PREFIX + "slice9_ok"]: "2" } });
      await wait(120);
    } finally {
      restore();
    }
    expect(toastOf(/项未能恢复/).length, "失败的一半必须说出来").toBeGreaterThan(0);
    expect(diagOf("doIdbImport").some((d) => d.ctx.key === key)).toBe(true);
  });

  /* 局限照实写：`_idbV2Available` 是 **const**（data-idb.js:249，由 IIFE 在加载时判定），
     jsdom 里没有 indexedDB → 恒为 false → 下面这条分支**在 jsdom 中根本进不去**。
     所以这里只做静态契约（验证接线），不做假的「行为验证」—— 假装它绿才是骗自己。 */
  it("IDB v2 写（await idbPut）失败：catch 已登记归因（静态契约，jsdom 进不去该分支）", () => {
    const s = fs.readFileSync(SRC, "utf8");
    expect(s, "await idbPut 的失败必须归因，不能是永远等到成功").toMatch(/idbV2 restore failed/);
    expect(s, "失败的键必须汇总进 _restoreFailed，好让结尾点名").toMatch(/_restoreFailed\.push\(key\)/);
  });
});

describe("③ 高频路径节流与静态契约", () => {
  it("🔴 待办条偏好写失败：每次点击都走 → 只报第一次（否则刷满诊断面板）", () => {
    const doc = win.document;
    let bar = doc.querySelector("#todoBar");
    if (!bar) {
      bar = doc.createElement("div");
      bar.id = "todoBar";
      doc.body.appendChild(bar);
    }
    const key = PREFIX + "todobar_expanded";
    const restore = failWriteOn([key]);
    try {
      win.setTodoBarExpanded(true);
      win.setTodoBarExpanded(false);
      win.setTodoBarExpanded(true);
    } finally {
      restore();
    }
    const hits = diagOf("setTodoBarExpanded");
    expect(hits, "高频路径留痕必须节流：三次只应有一次").toHaveLength(1);
  });

  it("诊断报告：有键读不到时标注「实际占用更高」（占用偏低比偏高危险）", () => {
    const probe = PREFIX + "slice9_diag_probe";
    win.localStorage.setItem(probe, "x".repeat(64));
    const restore = failReadOn([probe]);
    let line;
    try {
      line = win._diagStorageLine();
    } finally {
      restore();
    }
    expect(line).toMatch(/个键读取失败.*实际占用更高/);
    /* 向后兼容：既有的 /存储: \d+ 个键 · 约 [\d.]+ KB/ 断言不能被打破 */
    expect(line).toMatch(/^\d+ 个键 · 约 [\d.]+ KB/);
  });

  it("🔴 直接复用门禁逻辑：本文件不得被判出任何新增 P0", () => {
    const raw = fs.readFileSync(SRC, "utf8");
    const base = JSON.parse(fs.readFileSync(BASE_PATH, "utf8"));
    const baseKeys = new Set(base.items.map(keyOf));
    const newP0 = scanSource(raw, "ui-backup-stats.js", {}).filter((i) => i.level === "P0" && !baseKeys.has(keyOf(i)));
    expect(newP0.map((i) => i.line), "不该有新增 P0（内层改动会连坐外层 sig）").toEqual([]);
  });
});
