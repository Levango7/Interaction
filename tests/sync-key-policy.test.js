/**
 * sync-key-policy.test.js —— 同步/备份的键策略（v3.7.148 B2c）
 * ----------------------------------------------------------------------------
 * 背景：云快照原来用**手写负名单**（SYNC_EXCLUDED_KEYS），新加的键默认上云。
 * 现在改为从 DATA_KEY_REGISTRY 派生（dataKeySyncAllowed：未登记 ⇒ 不上云）。
 * 本文件守三件事，缺一条这次改造就不算成立：
 *   ① **不发生隐私回退**：旧清单里每一个键，派生判据仍然判"不上云"（⊇ 旧集合）；
 *   ② 默认值真的翻了：未登记的键 = 不上云；
 *   ③ 业务数据仍然上云、备份排除仍覆盖三代快照载体（不能因为换了实现而少排除 / 多排除）。
 */
import { describe, it, expect } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

const PREFIX = "wb_agent_";

/* 冻结的旧清单（来自改造前的 SYNC_EXCLUDED_KEYS，逐条手抄；改动它必须先改回归意图） */
const LEGACY_EXCLUDED = [
  `${PREFIX}sync_meta`, `${PREFIX}cfg`, `${PREFIX}__dk`, `${PREFIX}pre_restore_backup`,
  "wb_access_token", "wb_refresh_token", "wb_token_expiry",
  "wb_integration_api_keys", "wb_integration_providers",
  `${PREFIX}autobackup`, `${PREFIX}autobackup.1`, `${PREFIX}autobackup.2`,
  `${PREFIX}sync_changelog`, `${PREFIX}sync_conflicts`,
  `${PREFIX}webdav_pass`, `${PREFIX}webdav_cfg`, `${PREFIX}webdav_meta`,
  `${PREFIX}schema`,
];

function boot(extra) {
  return loadApp({ storage: Object.assign({ [PREFIX + "onboarded"]: "true" }, extra || {}) });
}

describe("同步键策略：派生判据 vs 旧手写清单", () => {
  it("① 旧清单里每个键仍然判「不上云」（隐私不回退）", () => {
    const win = boot();
    const leaked = LEGACY_EXCLUDED.filter((k) => win.__test.dataKeySyncAllowed(k));
    expect(leaked, "这些键以前不上云，现在被放行了：\n" + leaked.join("\n")).toEqual([]);
  });

  it("② 未登记的键默认不上云（默认值已从「上云」翻成「不上云」）", () => {
    const win = boot();
    expect(win.__test.dataKeySyncAllowed(PREFIX + "totally_new_feature")).toBe(false);
    expect(win.__test.dataKeySyncAllowed("wb_some_unknown_bare")).toBe(false);
  });

  it("③ 业务数据仍上云；凭据/本机控制仍不上云（两条方向都要有阳性样本）", () => {
    const win = boot();
    for (const k of [`${PREFIX}tasks`, `${PREFIX}records`, `${PREFIX}notes`, `${PREFIX}chat_code`, `${PREFIX}rec_office`, "wb_custom_links"]) {
      expect(win.__test.dataKeySyncAllowed(k), k + " 应上云").toBe(true);
    }
    /* 注意：theme/lang/active 属**控制/元数据**，它们本来就靠云同步跨设备生效，不在不上云之列。 */
    for (const k of [`${PREFIX}cfg`, `${PREFIX}__dk`, `${PREFIX}webdav_pass`, `${PREFIX}sync_meta`]) {
      expect(win.__test.dataKeySyncAllowed(k), k + " 不该上云").toBe(false);
    }
  });

  it("④ 云快照实际产物：业务数据在内，凭据与本机控制键不在（行为面，不只看函数）", () => {
    const win = boot({
      [PREFIX + "tasks"]: JSON.stringify([{ id: "t1", sc: "office", title: "x", status: "todo", tags: [], created: 1 }]),
      [PREFIX + "cfg"]: JSON.stringify({ enabled: true, profiles: [] }),
      [PREFIX + "webdav_pass"]: JSON.stringify({ __enc: true, iv: "a", data: "b" }),
      [PREFIX + "theme"]: "dark",
    });
    const snap = win.__test._buildCloudSnapshot();
    expect(snap[PREFIX + "tasks"], "业务数据必须进快照").toBeTruthy();
    expect(snap[PREFIX + "cfg"], "AI 配置（含密文 Key）不许上云").toBeUndefined();
    expect(snap[PREFIX + "webdav_pass"], "WebDAV 凭据不许上云").toBeUndefined();
  });

  it("⑤ 自动备份排除仍覆盖 autobackup 三代（快照载体不得自我嵌套）", () => {
    const win = boot();
    const ex = win.__test.backupExcludedKeys();
    for (const k of [`${PREFIX}autobackup`, `${PREFIX}autobackup.1`, `${PREFIX}autobackup.2`]) {
      expect(ex, k + " 必须被排除").toContain(k);
    }
    /* 反向：业务键与普通元数据不在排除集里（否则备份会静默少东西） */
    expect(ex).not.toContain(PREFIX + "tasks");
    expect(ex).not.toContain(PREFIX + "sync_meta");
  });
});
