/**
 * v3.4.7 批次二（存储评估 G3）：自动备份三代滚动回归
 * 此前单代覆盖写——数据先损坏后，下一次写入把"最后一份好快照"覆盖成损坏快照。
 * 现行为：autobackup.2 ← autobackup.1 ← autobackup ← 新快照；4MB 护栏降 2 代；
 * recover 最新代损坏自动回退上一代。
 */
import { describe, it, expect, beforeAll, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadApp } from "./helpers/loadApp.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HTML = path.resolve(__dirname, "..", "agent-workbench.html");
const PREFIX = "wb_agent_";
const K0 = PREFIX + "autobackup";
const K1 = PREFIX + "autobackup.1";
const K2 = PREFIX + "autobackup.2";

function freshWinWithTask(id, title) {
  const w = loadApp();
  w.localStorage.setItem(PREFIX + "tasks", JSON.stringify([{ id, title, sc: "office", status: "todo", created: Date.now() }]));
  return w;
}

describe("G3 备份三代滚动", () => {
  beforeAll(() => {
    // 静音 toast 干扰（jsdom 环境 toast 可用）
  });

  it("源码契约：滚动三键 + 护栏常量 + 代际回退存在", () => {
    const src = fs.readFileSync(HTML, "utf8");
    expect(src).toMatch(/AUTO_BACKUP_GENS = \[PREFIX \+ "autobackup\.1", PREFIX \+ "autobackup\.2"\]/);
    expect(src).toMatch(/AUTO_BACKUP_TOTAL_CEIL = 4 \* 1024 \* 1024/);
    expect(src).toMatch(/function getAutoBackupGen/);
    expect(src).toMatch(/backup\.fallbackGenToast/);
  });

  it("运行时：连续 3 次快照后三代键各不相同（滚动生效）", () => {
    const w = loadApp();
    w.localStorage.setItem(PREFIX + "tasks", JSON.stringify([{ id: "t1", title: "A" }]));
    w.snapshotAutoBackup();
    w.localStorage.setItem(PREFIX + "tasks", JSON.stringify([{ id: "t2", title: "B" }]));
    w.snapshotAutoBackup();
    w.localStorage.setItem(PREFIX + "tasks", JSON.stringify([{ id: "t3", title: "C" }]));
    w.snapshotAutoBackup();
    const g0 = w.localStorage.getItem(K0);
    const g1 = w.localStorage.getItem(K1);
    const g2 = w.localStorage.getItem(K2);
    expect(g0).toBeTruthy(); expect(g1).toBeTruthy(); expect(g2).toBeTruthy();
    expect(g0).not.toBe(g1);
    expect(g1).not.toBe(g2);
    expect(g0).not.toBe(g2);
    // 最新代含最新任务；最老一代含最早的
    expect(g0).toContain("t3");
    expect(g2).toContain("t1");
  });

  it("运行时：最新代损坏时 recover 回退上一代（拿到 t2 而非失败）", () => {
    const w = loadApp();
    // 造两代：t1（会滚到 .1 代）、t2（最新代）
    w.localStorage.setItem(PREFIX + "tasks", JSON.stringify([{ id: "t1", title: "A" }]));
    w.snapshotAutoBackup();
    w.localStorage.setItem(PREFIX + "tasks", JSON.stringify([{ id: "t2", title: "B" }]));
    w.snapshotAutoBackup();
    // 损坏最新代（半截 JSON）
    w.localStorage.setItem(K0, '{"tasks":"broken');
    const toastSpy = vi.spyOn(w, "toast").mockImplementation(() => {});
    const ok = w.recoverAutoBackup();
    expect(ok).toBe(true);
    // 恢复的是上一代（t1）
    const tasks = JSON.parse(w.localStorage.getItem(PREFIX + "tasks"));
    expect(tasks.some((t) => t.id === "t1")).toBe(true);
    toastSpy.mockRestore();
  });

  it("运行时：4MB 护栏——三代合计超限时丢弃最老一代", () => {
    const w = loadApp();
    // 2.2MB × 2 代 + 新快照 > 4MB → 触发护栏降 2 代
    const big1 = JSON.stringify({ _ts: 1, pad: "x".repeat(2.2 * 1024 * 1024) });
    const big2 = JSON.stringify({ _ts: 2, pad: "y".repeat(2.2 * 1024 * 1024) });
    w.localStorage.setItem(K0, big2);   // 现最新
    w.localStorage.setItem(K1, big1);   // 现上一代
    w.localStorage.setItem(PREFIX + "tasks", JSON.stringify([{ id: "t9", title: "Z" }]));
    w.snapshotAutoBackup();
    // 护栏触发：最老一代被清（.2 不存在），上一代保留 big2，最新代是新快照
    expect(w.localStorage.getItem(K2)).toBe(null);
    expect(w.localStorage.getItem(K1)).toBe(big2);
    expect(w.localStorage.getItem(K0)).toContain("t9");
  });
});
