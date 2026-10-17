/**
 * pre-restore-rollback.test.js —— OD-003：云恢复前回滚档的消费入口
 * ----------------------------------------------------------------------------
 * 背景：v3.7.52 起 `_applyCloudSnapshot`（render-overview.js）在云端快照覆盖本机前，会把本机
 * 全部键值写进 `wb_agent_pre_restore_backup`；但它被同步/导出双双排除后，**全仓没有任何读取
 * 路径** —— 写了就永远躺在 localStorage 里，注释自述的「至少能人工比对/回滚」只对开 devtools
 * 的人成立（R-24 同型：保护语义必须可被消费，否则是假保护）。
 * 2026-10-17 批次补上消费四件套（ui-backup-stats.js）：
 *   · 元信息（at/keyCount/bytes，**不含任何键值**）
 *   · 键清单（键名 + 体积，**绝不返回值**）
 *   · 回滚（写回覆盖前的值；回滚档自身除外，可重复使用；会话层/缓存复位与 doImport 同序）
 *   · 删除 + 卡片渲染（textContent 写入，无 HTML 拼接）
 *
 * 设计原则（同 backup-export-exclusion.test.js）：
 *  - 黑盒：经 loadApp + 真实全局函数，不引内部实现；
 *  - 机制自证：先钉「覆盖前确实写了档、档里确实是覆盖前的值」，再钉「回滚确实把值写回去」；
 *  - 值绝不进展示面：info / keyList / 卡片 textContent 三层都不含键值（防「查看」变泄漏面）；
 *  - 本文件在 OD-003 修复前运行会全红（函数不存在）——这正是取证。
 *
 * 运行：npm test -- pre-restore-rollback
 */

import { describe, it, expect } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

const PREFIX = "wb_agent_";
const PRE = PREFIX + "pre_restore_backup";
const TASKS = PREFIX + "tasks";
const SECRET_VAL = "SECRET-VALUE-XYZ";

function fresh() {
  const win = loadApp();
  win.localStorage.clear();
  return win;
}

describe("OD-003 · 回滚档元信息与诚实降级", () => {
  it("1: 无档 → info/keyList 均为 null（不抛、不糊弄）", () => {
    const win = fresh();
    expect(win.preRestoreInfo()).toBeNull();
    expect(win.preRestoreKeyList()).toBeNull();
  });

  it("2: 损坏/形状不符的档按「没有」处理 —— info null、回滚 ok:false、不崩", () => {
    const win = fresh();
    win.localStorage.setItem(PRE, "{not-json");
    expect(win.preRestoreInfo()).toBeNull();
    expect(win.rollbackPreRestore().ok).toBe(false);
    win.localStorage.setItem(PRE, JSON.stringify({ at: 1 })); // 形状不符（缺 keys）
    expect(win.preRestoreInfo()).toBeNull();
  });

  it("3: 元信息正确且**不含任何键值**（仅 at/keyCount/bytes）", () => {
    const win = fresh();
    win.localStorage.setItem(
      PRE,
      JSON.stringify({ at: 1700000000000, keys: { [TASKS]: JSON.stringify([{ id: "t0" }]), [PREFIX + "cfg"]: SECRET_VAL } })
    );
    const info = win.preRestoreInfo();
    expect(info).not.toBeNull();
    expect(info.at).toBe(1700000000000);
    expect(info.keyCount).toBe(2);
    expect(info.bytes).toBeGreaterThan(0);
    const s = JSON.stringify(info);
    expect(s).not.toContain(SECRET_VAL);
    expect(s).not.toContain("t0");
  });

  it("4: 键清单只含键名与体积，绝不返回值", () => {
    const win = fresh();
    win.localStorage.setItem(PRE, JSON.stringify({ at: 1, keys: { [TASKS]: SECRET_VAL } }));
    const list = win.preRestoreKeyList();
    expect(list.length).toBe(1);
    expect(list[0].key).toBe(TASKS);
    expect(typeof list[0].bytes).toBe("number");
    expect("value" in list[0]).toBe(false);
    expect("v" in list[0]).toBe(false);
    expect(JSON.stringify(list)).not.toContain(SECRET_VAL);
  });
});

describe("OD-003 · 机制自证：覆盖前写档 → 回滚写回", () => {
  it("5: _applyCloudSnapshot 覆盖前落档（档里是覆盖前的值）；回滚把覆盖倒回，档自身不变、可重复使用", () => {
    const win = fresh();
    win.localStorage.setItem(TASKS, JSON.stringify([{ id: "t1", updatedAt: 1 }]));
    win.localStorage.setItem(PREFIX + "records", JSON.stringify([{ id: "r1", marker: "LOCAL" }]));
    win.localStorage.setItem(PREFIX + "cfg", JSON.stringify({ enabled: false, marker: "LOCAL" }));

    win._applyCloudSnapshot({
      [TASKS]: JSON.stringify([{ id: "t1", updatedAt: 2 }]),   // 同 id 更新者 → 远端赢（merge 语义）
      [PREFIX + "records"]: JSON.stringify([{ id: "r1", marker: "REMOTE" }]),
      [PREFIX + "cfg"]: JSON.stringify({ enabled: false, marker: "REMOTE" }),  // 入站排除（v3.7.58）：不得被覆盖
      _deviceMeta: { deviceId: "d1" }
    });

    // 覆盖生效（tasks/records）
    expect(JSON.parse(win.localStorage.getItem(TASKS))[0].updatedAt).toBe(2);
    expect(JSON.parse(win.localStorage.getItem(PREFIX + "records"))[0].marker).toBe("REMOTE");
    // 安全边界不变：cfg 入站仍被排除（「可读的回滚档」没有放宽任何入站口径）
    expect(JSON.parse(win.localStorage.getItem(PREFIX + "cfg")).marker).toBe("LOCAL");

    // 覆盖前已留档，且档里是**覆盖前**的本机值（含被排除的 cfg——档是恢复前的完整现场）
    const snap = JSON.parse(win.localStorage.getItem(PRE) || "null");
    expect(snap).not.toBeNull();
    expect(typeof snap.at).toBe("number");
    expect(snap.keys[TASKS]).toContain("updatedAt\":1");
    expect(snap.keys[PREFIX + "records"]).toContain("LOCAL");
    expect(snap.keys[PREFIX + "cfg"]).toContain("LOCAL");

    // 档仍被同步排除（既有安全口径不变）：不会因为它可读了就上云
    expect(win.__test._buildCloudSnapshot()[PRE]).toBeUndefined();

    // 回滚：值写回；回滚档自身不被覆盖、可再次使用
    const before = win.localStorage.getItem(PRE);
    const r1 = win.rollbackPreRestore();
    expect(r1.ok).toBe(true);
    expect(r1.failed).toEqual([]);
    expect(JSON.parse(win.localStorage.getItem(TASKS))[0].updatedAt).toBe(1);
    expect(JSON.parse(win.localStorage.getItem(PREFIX + "records"))[0].marker).toBe("LOCAL");
    expect(JSON.parse(win.localStorage.getItem(PREFIX + "cfg")).marker).toBe("LOCAL");
    expect(win.localStorage.getItem(PRE)).toBe(before);
    const r2 = win.rollbackPreRestore();
    expect(r2.ok).toBe(true);
    expect(JSON.parse(win.localStorage.getItem(TASKS))[0].updatedAt).toBe(1);
  });

  it("6: 回滚后 emitDataMutate(\"rollback\") 被触发（RAG/同步按 diff 收敛，不静默）", () => {
    const win = fresh();
    win.localStorage.setItem(TASKS, "[]");
    win.localStorage.setItem(PRE, JSON.stringify({ at: 1, keys: { [TASKS]: JSON.stringify([{ id: "x" }]) } }));
    let signal = null;
    win.emitDataMutate = (why) => { signal = why; };  // 全局函数声明 → window 属性，可覆盖（同 apiFetch 手法）
    win.rollbackPreRestore();
    expect(signal).toBe("rollback");
  });
});

describe("OD-003 · 卡片渲染（诚实显隐 + 值不上面板）", () => {
  it("7: 无档 → 标题与整块隐藏；有档 → 显形，且 textContent 不含键值、不含键名", () => {
    const win = fresh();
    const title = win.document.getElementById("preRestoreTitle");
    const box = win.document.getElementById("preRestoreBox");
    expect(title && box).toBeTruthy(); // 标记确实在 HTML 模板里（交付态可查）

    win.renderPreRestoreCard();
    expect(title.classList.contains("u-hidden")).toBe(true);
    expect(box.classList.contains("u-hidden")).toBe(true);

    win.localStorage.setItem(PRE, JSON.stringify({ at: 1700000000000, keys: { [TASKS]: SECRET_VAL } }));
    win.renderPreRestoreCard();
    expect(title.classList.contains("u-hidden")).toBe(false);
    expect(box.classList.contains("u-hidden")).toBe(false);

    const all = title.textContent + " " + box.textContent;
    expect(all).not.toContain(SECRET_VAL);
    expect(all).not.toContain("wb_agent_"); // 键名也不进卡片——清单要用户主动点开
  });

  it("8: 删除后 info=null、卡片回到隐藏", () => {
    const win = fresh();
    win.localStorage.setItem(PRE, JSON.stringify({ at: 1, keys: { [TASKS]: "[]" } }));
    win.deletePreRestoreBackup();
    expect(win.preRestoreInfo()).toBeNull();
    win.renderPreRestoreCard();
    expect(win.document.getElementById("preRestoreBox").classList.contains("u-hidden")).toBe(true);
  });
});
