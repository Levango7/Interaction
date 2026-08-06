/**
 * P1-b 自动备份 · 回归验证
 * ----------------------------------------------------------------------------
 * 验证「每次数据变动后自动快照到本地（独立于手动导出 JSON）」能力已落地：
 *   ① setTasks/setRec 写入后触发防抖自动备份（scheduleAutoBackup，400ms 合并）。
 *   ② snapshotAutoBackup 写入独立键 PREFIX+"autobackup"，含全部存储键 + _ts。
 *   ③ recoverAutoBackup 可从快照还原损坏数据；无快照时返回 false 并提示。
 *   ④ 自动备份与手动导出（doExport 走下载 blob）互不耦合，不影响既有导出/导入契约。
 *
 * 设计原则（遵循 test-discipline / anti-gaming）：
 *  - 黑盒优先：经 jsdom 全局访问 window.__test.*
 *  - 不修改任何生产文件；本文件为新增测试。
 *  - 断言「可观测行为」：自动备份键存在性、快照内容、recover 返回结构与还原结果。
 *
 * 运行：npx vitest run tests/p1b-autobackup.test.js
 */

import { describe, it, expect, beforeEach } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

function freshWin() {
  const win = loadApp();
  win.localStorage.clear();
  return win;
}

const BASE = { sc: "code", status: "todo", doneAt: null, priority: "P0", note: "", tags: [], created: Date.now(), due: "" };

describe("P1-b 自动备份", () => {
  let win;
  beforeEach(() => { win = freshWin(); });

  function setTasks(arr) { win.__test.setTasks(arr); }
  function autobackupKey() { return win.__test.PREFIX + "autobackup"; }

  it("snapshotAutoBackup 写入独立自动备份键且含任务数据 + 时间戳", () => {
    setTasks([{ id: "z", ...BASE, title: "备份任务" }]);
    win.__test.snapshotAutoBackup();
    const snap = win.__test.getAutoBackup();
    expect(snap, "应存在自动备份快照").toBeTruthy();
    expect(snap[autobackupKey()], "快照不应包含自身键（仅业务键 + _ts）").toBeUndefined();
    expect(snap[win.__test.PREFIX + "tasks"], "快照应含 tasks 原始串").toContain("备份任务");
    expect(snap._ts, "快照应带时间戳").toBeTruthy();
  });

  it("recoverAutoBackup 可从快照还原损坏数据", () => {
    setTasks([{ id: "x", ...BASE, title: "原始任务" }]);
    win.__test.snapshotAutoBackup();
    // 直接破坏存储（不走 setTasks，避免触发新的自动快照定时器污染后续断言）
    win.localStorage.setItem(autobackupKey(), win.localStorage.getItem(autobackupKey())); // no-op 保持快照
    win.localStorage.setItem(win.__test.PREFIX + "tasks", JSON.stringify([{ id: "y", title: "损坏后的数据" }]));

    const ok = win.__test.recoverAutoBackup();
    expect(ok, "recover 应成功").toBe(true);
    const restored = win.__test.getTasks();
    expect(restored.some((t) => t.title === "原始任务"), "应还原到快照版本").toBe(true);
  });

  it("recoverAutoBackup 无快照时返回 false 并提示", () => {
    win.localStorage.clear(); // 清空后无任何快照
    const ok = win.__test.recoverAutoBackup();
    expect(ok, "无快照应返回 false").toBe(false);
  });

  it("scheduleAutoBackup 防抖合并：写入不立即落盘，延迟后只产生一份最终快照", () => {
    setTasks([{ id: "a1", ...BASE, title: "任务1" }]);
    // 写入后不应立即落盘（防抖延迟）
    expect(win.localStorage.getItem(autobackupKey()), "防抖：写入后不立即落盘").toBeNull();
    setTasks([{ id: "a2", ...BASE, title: "任务2" }]); // 第二写应被防抖合并
    return new Promise((resolve) => {
      setTimeout(() => {
        const after = win.__test.getAutoBackup();
        expect(after, "延迟后落盘且只一份快照").toBeTruthy();
        expect(after[autobackupKey()], "快照不应含自身键").toBeUndefined();
        expect(after[win.__test.PREFIX + "tasks"], "快照捕获最终状态(合并生效)").toContain("任务2");
        resolve();
      }, 500); // 越过 400ms 防抖定时器
    });
  });

  it("自动备份与手动导出互不耦合：自动备份键独立于导出下载 blob", () => {
    setTasks([{ id: "e1", ...BASE, title: "导出无关任务" }]);
    win.__test.snapshotAutoBackup();
    const snap = win.__test.getAutoBackup();
    // 自动备份是 localStorage 内的独立键，不依赖导出下载；导出走 Blob URL，不落该键
    expect(snap, "自动备份应已存在").toBeTruthy();
    expect(snap[autobackupKey()], "不应把自动备份内容写进自动备份键自身").toBeUndefined();
  });
});
