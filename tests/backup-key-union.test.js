/**
 * 数据连续性批次 ②（P1-2）· 备份/云同步旁路键并集 — 回归验证
 * ----------------------------------------------------------------------------
 * 背景：allKeys() 此前只认 wb_agent_ 前缀 + wb_custom_links，13 个裸键
 * （token×3 / 集成×4 / 通知×6，键清单与出处见 src/data-links.js STORAGE_BYPASS_KEYS）
 * 在「导出 / 自动备份 / 云快照」三通道整体缺席：换机迁移丢通知设置与去重集、
 * 降级环境的登录态。本批改 isAppStorageKey（前缀 ∪ 显式旁路清单），导入过滤同口径。
 *
 * 结构守护（防未来再漏）：扫描 src/*.js 全部裸 wb_ 字符串字面量，
 * 凡不在「并集登记表 ∪ 例外白名单」中即红；并集登记表直接从 src/data-links.js 解析，
 * 与实现同源（改实现不改登记/不更新白名单都会红）。含合成探针变异自测证明守护非空跑。
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadApp } from "./helpers/loadApp.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const PREFIX = "wb_agent_";

// 本批补入并集的 13 个旁路键（与 STORAGE_BYPASS_KEYS 解析结果做一致性断言，防两处漂移）
const BARE_KEYS = [
  "wb_access_token", "wb_refresh_token", "wb_token_expiry",
  "wb_integration_providers", "wb_integration_sync_state",
  "wb_integration_api_keys", "wb_integration_rate_limits",
  "wb_notify_enabled", "wb_notify_quiet",
  "wb_notified_ids", "wb_notify_snooze",
  "wb_chain_break_notified", "wb_digest_date",
];

/* 结构守护例外白名单：非存储键、或已由其它机制覆盖的裸字面量（逐条注明原因） */
const BARE_SCAN_ALLOWLIST = new Map([
  ["wb_custom_links", "已在 isAppStorageKey 显式纳入（前缀族之外的第一批旁路键）"],
  ["wb_conversations", "data-migrate.js:165 守卫清单项，实际键为 PREFIX+\"wb_conversations\"（前缀族已覆盖）"],
  ["wb_long_term_memory", "同上（data-migrate.js:165）"],
  ["wb_hybrid_", "data-idb.js:364 遗留只读前缀，全仓无写点，非现存键"],
  ["wb_ics_notified", "ui-ge-calendar.js:1636 常量值再拼 PREFIX → 实际键 wb_agent_wb_ics_notified（前缀族已覆盖）"],
]);

/** 从给定文本提取裸 wb_ 字面量（非 wb_agent 前缀） */
function scanBareIn(text) {
  const found = new Set();
  for (const m of text.matchAll(/"([^"]*)"/g)) {
    const v = m[1];
    if (v.startsWith("wb_") && !v.startsWith("wb_agent")) found.add(v);
  }
  return [...found].sort();
}
function scanBareInDir(dir) {
  const found = new Set();
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".js"))) {
    for (const k of scanBareIn(readFileSync(join(dir, f), "utf8"))) found.add(k);
  }
  return [...found].sort();
}
/** 从实现源解析并集登记表（与实现同源，防两处漂移） */
function readBypassFromSource() {
  const s = readFileSync(join(root, "src/data-links.js"), "utf8");
  const m = s.match(/const STORAGE_BYPASS_KEYS = \[([\s\S]*?)\];/);
  expect(m, "src/data-links.js 里应存在 STORAGE_BYPASS_KEYS 数组定义").toBeTruthy();
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]).sort();
}

function freshWin() {
  const win = loadApp();
  win.localStorage.clear();
  return win;
}
function waitFor(predicate, timeout = 5000, interval = 10) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      let ok = false;
      try { ok = !!predicate(); } catch (_e) { ok = false; }
      if (ok) return resolve(true);
      if (Date.now() - start > timeout) return reject(new Error("waitFor timeout"));
      setTimeout(tick, interval);
    };
    tick();
  });
}
/* stub FileReader：readAsText 后触发 onload（与 p0-crossdevice-key.test.js 同法） */
function stubImport(win, content) {
  class FakeFileReader {
    constructor() { this.result = ""; }
    readAsText() {
      this.result = content;
      setTimeout(() => { if (typeof this.onload === "function") this.onload({ target: this }); }, 0);
    }
  }
  win.FileReader = FakeFileReader;
}

describe("P1-2 · allKeys/isAppStorageKey 并集（jsdom 行为）", () => {
  it("1: 13 个旁路裸键 + wb_custom_links + 前缀键全部被枚举；无关键不被卷进", () => {
    const win = freshWin();
    for (const k of BARE_KEYS) win.localStorage.setItem(k, "v");
    win.localStorage.setItem("wb_custom_links", "[]");
    win.localStorage.setItem(PREFIX + "tasks", "[]");
    win.localStorage.setItem("unrelated_key", "x");
    win.localStorage.setItem("wb_notify_enabled_copy", "x"); // 前缀撞名但非清单键，不应被收录

    const got = win.allKeys();
    expect(got).toEqual(expect.arrayContaining([...BARE_KEYS, "wb_custom_links", PREFIX + "tasks"]));
    expect(got).not.toContain("unrelated_key");
    expect(got).not.toContain("wb_notify_enabled_copy");
  });

  it("2: 自动备份快照含旁路裸键，且仍排除备份键自身（防递归）", () => {
    const win = freshWin();
    win.localStorage.setItem("wb_access_token", JSON.stringify({ __enc: true, iv: "i", data: "d" }));
    win.localStorage.setItem("wb_notified_ids", JSON.stringify(["t1"]));
    win.__test.snapshotAutoBackup();

    const snap = JSON.parse(win.localStorage.getItem(PREFIX + "autobackup"));
    expect(snap["wb_access_token"]).toBeTruthy();
    expect(snap["wb_notified_ids"]).toBeTruthy();
    expect(snap[PREFIX + "autobackup"]).toBeUndefined();
  });

  it("3: 云快照含通知/状态裸键，排除密封凭据裸键与既有排除项", () => {
    const win = freshWin();
    win.localStorage.setItem("wb_notify_enabled", "true");
    win.localStorage.setItem("wb_digest_date", "2026-10-06");
    win.localStorage.setItem("wb_integration_sync_state", "{}");
    win.localStorage.setItem("wb_access_token", "sealed");
    win.localStorage.setItem("wb_refresh_token", "sealed");
    win.localStorage.setItem("wb_token_expiry", "123");
    win.localStorage.setItem("wb_integration_api_keys", "sealed");
    win.localStorage.setItem("wb_integration_providers", "sealed");
    win.localStorage.setItem(PREFIX + "cfg", "{}");
    win.localStorage.setItem(PREFIX + "__dk", "k");
    win.localStorage.setItem(PREFIX + "pre_restore_backup", "{}");
    win.localStorage.setItem(PREFIX + "sync_meta", "{}");

    const snap = win.__test._buildCloudSnapshot();
    expect(snap["wb_notify_enabled"]).toBe("true");
    expect(snap["wb_digest_date"]).toBe("2026-10-06");
    expect(snap["wb_integration_sync_state"]).toBe("{}");
    for (const k of ["wb_access_token", "wb_refresh_token", "wb_token_expiry", "wb_integration_api_keys", "wb_integration_providers"]) {
      expect(snap[k], k + " 不应上云").toBeUndefined();
    }
    for (const k of [PREFIX + "cfg", PREFIX + "__dk", PREFIX + "pre_restore_backup", PREFIX + "sync_meta"]) {
      expect(snap[k], k + " 不应上云").toBeUndefined();
    }
  });

  it("4: 导入过滤与导出口径对称——旁路裸键可被导入而不被丢回", async () => {
    const win = freshWin();
    const payload = {
      [PREFIX + "tasks"]: JSON.stringify([{ id: "t1", title: "x" }]),
      "wb_notify_enabled": "true",
      "wb_notified_ids": JSON.stringify(["a"]),
      "unrelated_key": "should-be-ignored",
    };
    stubImport(win, JSON.stringify(payload));
    win.doImport({ name: "b.json" });
    await waitFor(() => win.localStorage.getItem("wb_notify_enabled") !== null);

    expect(win.localStorage.getItem("wb_notify_enabled")).toBe("true");
    expect(win.localStorage.getItem("wb_notified_ids")).toBe(JSON.stringify(["a"]));
    expect(win.localStorage.getItem("unrelated_key")).toBeNull();
  });
});

describe("P1-2 · 结构守护：src 裸 wb_ 字面量必须在册", () => {
  it("5: 扫描结果 = 并集登记表 ∪ 例外白名单（双向：不许未注册新键，也不许登记表挂空名）", () => {
    const bypass = readBypassFromSource();
    expect(bypass).toEqual([...BARE_KEYS].sort()); // 实现登记表与本文件清单一致（防两处漂移）
    const found = scanBareInDir(join(root, "src"));
    const allowed = new Set([...bypass, ...BARE_SCAN_ALLOWLIST.keys()]);

    const unknown = found.filter((k) => !allowed.has(k));
    expect(unknown, "发现未注册的裸 wb_ 字面量 → 请登记进 STORAGE_BYPASS_KEYS 或白名单并注明原因").toEqual([]);
    const stale = [...allowed].filter((k) => !found.includes(k));
    expect(stale, "登记表/白名单里有 src 中已不存在的键 → 请清理").toEqual([]);
  });

  it("6: 变异自测——合成探针键必须被扫描器抓到，且未注册时会被判红", () => {
    const probe = 'const a = "wb_probe_fake_2026"; const b = "wb_agent_ok";';
    const found = scanBareIn(probe);
    expect(found).toContain("wb_probe_fake_2026");
    expect(found).not.toContain("wb_agent_ok");
    const allowed = new Set([...BARE_KEYS, ...BARE_SCAN_ALLOWLIST.keys()]);
    expect(found.filter((k) => !allowed.has(k))).toEqual(["wb_probe_fake_2026"]);
  });
});
