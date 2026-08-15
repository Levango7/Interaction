/**
 * C1 自动备份自包含递归 · 回归验证（v1.11.1 修复）
 * ----------------------------------------------------------------------------
 * 审查报告 C1（严重）：快照函数 allKeys() 含备份键自身，第二次起的快照会把上一份
 * 完整快照原样嵌入（JSON 转义使膨胀超线性），最终撞 5MB 配额且 catch 静默吞错。
 * 既有 p1b-autobackup.test.js 只在全新 localStorage 上拍一次快照，从未覆盖该路径。
 *
 * 本文件专测"第二次及以后的快照"：
 *   ① 第二次快照不包含备份键自身；
 *   ② 连续多次快照体积稳定（不随次数膨胀）；
 *   ③ 多次快照后 recover 仍可用。
 */

import { describe, it, expect, beforeEach } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

function freshWin() {
  const win = loadApp();
  win.localStorage.clear();
  return win;
}

const BASE = { sc: "code", status: "todo", doneAt: null, priority: "P0", note: "", tags: [], created: Date.now(), due: "" };

describe("C1 自动备份自包含递归（v1.11.1 修复回归）", () => {
  let win;
  beforeEach(() => { win = freshWin(); });

  function autobackupKey() { return win.__test.PREFIX + "autobackup"; }

  it("第二次快照不包含备份键自身（自包含递归已断根）", () => {
    win.__test.setTasks([{ id: "t1", ...BASE, title: "任务一" }]);
    win.__test.snapshotAutoBackup(); // 第一次：建立备份键
    expect(win.localStorage.getItem(autobackupKey())).toBeTruthy();
    win.__test.setTasks([{ id: "t2", ...BASE, title: "任务二" }]);
    win.__test.snapshotAutoBackup(); // 第二次：旧实现会在此把备份键装进快照
    const snap = win.__test.getAutoBackup();
    expect(snap, "第二次快照应存在").toBeTruthy();
    expect(snap[autobackupKey()], "第二次快照不得包含备份键自身").toBeUndefined();
    expect(snap[win.__test.PREFIX + "tasks"], "快照应含最新业务数据").toContain("任务二");
  });

  it("连续 5 次快照体积稳定（不随次数膨胀）", () => {
    win.__test.setTasks([{ id: "s1", ...BASE, title: "稳定体积任务" }]);
    win.__test.snapshotAutoBackup();
    const first = win.localStorage.getItem(autobackupKey()).length;
    for (let i = 0; i < 5; i++) {
      win.__test.setTasks([{ id: "s" + i, ...BASE, title: "稳定体积任务" + i }]);
      win.__test.snapshotAutoBackup();
    }
    const last = win.localStorage.getItem(autobackupKey()).length;
    // 修复后快照只含业务数据 + _ts：多次快照体积应基本持平（业务数据同量级）。
    // 旧实现此处约为 first 的数倍（每次嵌套上一份完整快照 + 转义膨胀）。
    expect(last, "快照体积不应随次数显著膨胀").toBeLessThan(first * 1.5);
  });

  it("多次快照后 recoverAutoBackup 仍可用", () => {
    win.__test.setTasks([{ id: "r1", ...BASE, title: "第一态任务" }]);
    win.__test.snapshotAutoBackup();
    win.__test.setTasks([{ id: "r2", ...BASE, title: "第二态任务" }]);
    win.__test.snapshotAutoBackup();
    // 破坏业务数据后恢复：应还原到最后一份快照（第二态）
    win.localStorage.setItem(win.__test.PREFIX + "tasks", JSON.stringify([{ id: "bad", title: "损坏" }]));
    const ok = win.__test.recoverAutoBackup();
    expect(ok, "recover 应成功").toBe(true);
    const restored = win.__test.getTasks();
    expect(restored.some((t) => t.title === "第二态任务"), "应还原到最后一份快照").toBe(true);
  });
});
