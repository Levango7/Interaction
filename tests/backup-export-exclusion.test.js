/**
 * 批次② 数据连续性 · P2-1 导出排除集 + 云快照嵌套副本排除 · 回归验证
 * ----------------------------------------------------------------------------
 * 闭环目标：
 *  ① 导出文件不再内嵌「本机控制类」键（__dk / autobackup 三代 / pre_restore_backup）——
 *     它们要么是设备密钥本体，要么是**内嵌全部键值**的嵌套副本（嵌套副本会整体绕过顶层排除：
 *     autobackup 快照内容 = 除备份键自家外的全部键，降级环境里含 __dk 明文；pre_restore_backup
 *     内嵌全部键值的回滚档）。Top-level 排除对它们无效，必须整键排除。
 *  ② 云快照（_buildCloudSnapshot）同步排除 autobackup 三代 —— 否则 v3.7.58「密文+钥匙不同交」
 *     被嵌套副本绕过（自动备份内嵌 __dk），且每次上传 payload 平白多出 ≤4MB × 嵌套重复。
 *  ③ 导入保持宽容（对偶不对称，有意为之）：旧版导出文件（含 __dk/autobackup）回灌仍接受 ——
 *     同机恢复场景必须能取回 __dk 才能解密既有 cfg 密文；宽容导入不引入新风险（文件来自用户本地）。
 *
 * 设计原则（test-discipline / anti-gaming）：
 *  - 黑盒：经 jsdom 全局直调 doExport / doImport / snapshotAutoBackup / _buildCloudSnapshot。
 *  - 机制自证：用例 3 先断言「autobackup 确实内嵌 __dk」（证明排除的必要性成立），
 *    再断言云快照排除生效（证明修的是真问题，而非测试自说自话）。
 *  - 精确匹配探针：用例 4 播种近名键（autobackup.3 / probe 前缀）验证排除是**精确名单**
 *    而非粗暴前缀族过滤（防「一竿子打翻」式回归）。
 *  - 本文件在修复前运行会失败（用例 1/3 红）——这正是取证：泄漏真实存在，修复即转绿。
 *
 * 运行：npm test -- backup-export-exclusion
 */

import { describe, it, expect, vi } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

const PREFIX = "wb_agent_";
const AUTO_BACKUP = PREFIX + "autobackup";
const AUTO_BACKUP_GENS = [PREFIX + "autobackup.1", PREFIX + "autobackup.2"];
const PRE_RESTORE = PREFIX + "pre_restore_backup";
const DK = PREFIX + "__dk";

function freshWin() {
  const win = loadApp();
  win.localStorage.clear();
  return win;
}

// stub doExport 的 Blob/URL/anchor，捕获导出 data 对象（内存内，无临时文件；同 p0-crossdevice-key.test.js 手法）
function stubExport(win) {
  let captured = null;
  win.Blob = class {
    constructor(parts) {
      captured = JSON.parse(parts[0]);
    }
  };
  win.URL.createObjectURL = () => "blob:fake";
  win.URL.revokeObjectURL = () => {};
  win.HTMLAnchorElement.prototype.click = function () {};
  return () => captured;
}

// stub FileReader：readAsText 后用给定内容触发 onload
function stubImport(win, content) {
  class FakeFileReader {
    constructor() {
      this.result = "";
    }
    readAsText() {
      this.result = content;
      setTimeout(() => {
        if (typeof this.onload === "function") this.onload({ target: this });
      }, 0);
    }
  }
  win.FileReader = FakeFileReader;
}

function waitFor(predicate, timeout = 5000, interval = 20) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      let ok = false;
      try { ok = predicate(); } catch (e) { ok = false; }
      if (ok) return resolve(true);
      if (Date.now() - start > timeout) return reject(new Error("waitFor timeout"));
      setTimeout(tick, interval);
    };
    tick();
  });
}

// 播种「本机控制类」五键（导出必须排除的对象）
function seedLocalControlKeys(win) {
  win.localStorage.setItem(DK, "DEVKEY-material");
  win.localStorage.setItem(AUTO_BACKUP, JSON.stringify({ [PREFIX + "tasks"]: "[]", _ts: 1 }));
  win.localStorage.setItem(AUTO_BACKUP_GENS[0], JSON.stringify({ _ts: 2 }));
  win.localStorage.setItem(AUTO_BACKUP_GENS[1], JSON.stringify({ _ts: 3 }));
  win.localStorage.setItem(PRE_RESTORE, JSON.stringify({ at: 4, keys: { [DK]: "DEVKEY-material" } }));
}

describe("批次② P2-1 · 导出排除集（本机控制类五键）", { retry: 2 }, () => {
  it("1: 导出不含 __dk / autobackup 三代 / pre_restore_backup；业务键与 cfg 保留", () => {
    const win = freshWin();
    win.localStorage.setItem(PREFIX + "tasks", JSON.stringify([{ id: "t1" }]));
    win.localStorage.setItem(PREFIX + "cfg", JSON.stringify({ enabled: false }));
    seedLocalControlKeys(win);
    const getExported = stubExport(win);

    win.doExport();
    const data = getExported();

    expect(data[DK], "设备密钥本体不得进导出文件").toBeUndefined();
    expect(data[AUTO_BACKUP], "最新代自动备份不得进导出文件（嵌套副本）").toBeUndefined();
    expect(data[AUTO_BACKUP_GENS[0]], "上一代自动备份不得进导出文件").toBeUndefined();
    expect(data[AUTO_BACKUP_GENS[1]], "上上代自动备份不得进导出文件").toBeUndefined();
    expect(data[PRE_RESTORE], "本机回滚档不得进导出文件（内嵌全部键值）").toBeUndefined();

    expect(data[PREFIX + "tasks"], "业务数据保持导出").toBe(JSON.stringify([{ id: "t1" }]));
    expect(data[PREFIX + "cfg"], "cfg 保持导出（P0-5 语义：密文随行 + 可选明文）").toBeDefined();
    expect(data._deviceMeta, "_deviceMeta 元数据保持").toBeTruthy();
  });

  it("2: 导出仍携带旁路裸键（P1-2 并集与 P2-1 排除互不干扰）", () => {
    const win = freshWin();
    win.localStorage.setItem("wb_notify_enabled", "1");
    win.localStorage.setItem("wb_access_token", "tok-x");
    seedLocalControlKeys(win);
    const getExported = stubExport(win);

    win.doExport();
    const data = getExported();

    expect(data["wb_notify_enabled"]).toBe("1");
    expect(data["wb_access_token"]).toBe("tok-x");
    expect(data[DK]).toBeUndefined();
  });

  it("3: 排除是精确名单——近名键（autobackup.3 / 探针键）不被误伤", () => {
    const win = freshWin();
    win.localStorage.setItem(PREFIX + "autobackup.3", "gen3-should-stay");
    win.localStorage.setItem(PREFIX + "probe_export_2026", "probe-should-stay");
    seedLocalControlKeys(win);
    const getExported = stubExport(win);

    win.doExport();
    const data = getExported();

    expect(data[PREFIX + "autobackup.3"], "autobackup.3 不在排除名单，不应被吃").toBe("gen3-should-stay");
    expect(data[PREFIX + "probe_export_2026"], "合成探针键必须出现在导出里（证明枚举未空转）").toBe("probe-should-stay");
    expect(data[AUTO_BACKUP]).toBeUndefined();
  });
});

describe("批次② P2-1 对偶 · 云快照排除 autobackup 三代（嵌套副本堵漏）", { retry: 2 }, () => {
  it("4: 机制自证——autobackup 内嵌 __dk（顶层排除被绕过）；云快照整键排除后不可达", () => {
    const win = freshWin();
    win.localStorage.setItem(PREFIX + "tasks", JSON.stringify([{ id: "t1" }]));
    win.localStorage.setItem(DK, "DEVKEY-material");

    // 机制自证①：自动备份快照确实内嵌 __dk（顶层排除无法覆盖嵌套副本）
    win.__test.snapshotAutoBackup();
    const ab = JSON.parse(win.localStorage.getItem(AUTO_BACKUP) || "{}");
    expect(ab[DK], "前提成立：autobackup 内容含除备份键自身外的全部键（含 __dk）").toBe("DEVKEY-material");

    // 机制自证②：云快照排除后，__dk 经任何路径都不可达
    const snap = win.__test._buildCloudSnapshot();
    expect(snap[DK], "设备密钥仍被顶层排除").toBeUndefined();
    expect(snap[AUTO_BACKUP], "autobackup 最新代不得上云").toBeUndefined();
    expect(snap[AUTO_BACKUP_GENS[0]], "autobackup 上一代不得上云").toBeUndefined();
    expect(snap[AUTO_BACKUP_GENS[1]], "autobackup 上上代不得上云").toBeUndefined();
    expect(snap[PREFIX + "tasks"], "业务数据保持上云").toBe(JSON.stringify([{ id: "t1" }]));
    expect(snap._deviceMeta).toBeTruthy();
  });
});

describe("批次② P2-1 对偶 · 导入保持宽容（有意不对称）", { retry: 2 }, () => {
  it("5: 旧版导出文件（含 __dk/autobackup）回灌仍被接受——同机恢复需取回 __dk 解既有密文", async () => {
    const win = freshWin();
    const fileData = {
      _deviceMeta: { deviceId: "dev-old", exportedAt: 1, version: "test-1" },
      [PREFIX + "tasks"]: JSON.stringify([{ id: "t-legacy" }]),
      [DK]: "DEVKEY-material",
      [AUTO_BACKUP]: JSON.stringify({ _ts: 9 }),
    };
    stubImport(win, JSON.stringify(fileData));
    win.doImport({ name: "legacy.json" });

    await waitFor(() => win.localStorage.getItem(DK) === "DEVKEY-material");
    expect(win.localStorage.getItem(AUTO_BACKUP)).toBe(JSON.stringify({ _ts: 9 }));
    expect(win.getTasks().some((t) => t.id === "t-legacy")).toBe(true);
  });
});
