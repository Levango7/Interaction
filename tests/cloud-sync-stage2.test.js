/**
 * cloud-sync-stage2.test.js —— 云同步增量契约 · 阶段2（客户端增量一轮）
 * ----------------------------------------------------------------------------
 * 依据 docs/cloud-sync-incremental-contract.md §二/§四；服务端一侧由
 * server/verify/incremental-check.cjs（38 项）真机钉死，本文件钉客户端一侧：
 *   · 开关关 → **逐位走全量**（零行为变化，与 C1/C2 同一纪律）；
 *   · 开关开 → POST /api/sync/changes（delta 折叠/范围过滤/游标 since/token 落盘/成功清日志）；
 *   · 404/405（旧部署）与 needsFull（水位太旧）→ **自动回退全量**；
 *   · 下行 changed 走快照同一应用路径、removed 裸删且跳过本机更晚变更；
 *   · C2 看板在增量轮记 delta 体积。
 */
import { describe, it, expect } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

const PREFIX = "wb_agent_";
const CFG = PREFIX + "cfg";
const META = PREFIX + "sync_meta";
const CHLOG = PREFIX + "sync_changelog";
const on = () => ({ [CFG]: JSON.stringify({ syncIncremental: true }) });
const seedLog = (win, entries) => win.localStorage.setItem(CHLOG, JSON.stringify(entries));

/** 装一个脚本化的 apiFetch：记录调用 + 按 responder 返回 */
function mockFetch(win, responder) {
  const calls = [];
  win.apiFetch = async (path, opts) => {
    const body = opts && opts.body ? JSON.parse(opts.body) : null;
    calls.push({ path, method: (opts && opts.method) || "GET", body });
    return responder(path, body, calls.length);
  };
  return calls;
}
const okChanges = (data) => () => ({ ok: true, status: 200, data: Object.assign({ token: 1, changed: [], removed: [], needsFull: false }, data || {}) });
const okSnapshot = () => ({ ok: true, status: 200, data: { snapshot: {}, updatedAt: null } });

describe("阶段2/C1 分流与增量上行", () => {
  it("开关关：doSync 逐位走全量（PUT /snapshot，无 /changes 调用）", async () => {
    const win = await loadApp({ storage: {} });
    /* 真实登录态用导出的 apiSetTokens 建（同 ai-interaction-fixes 的手法）——
       直接 stub win.isApiLoggedIn 不生效：它是模块内部函数，外部赋值只加了个无用的 window 属性。 */
    win.apiSetTokens("test-token", "test-refresh", Date.now() + 3600 * 1000);
    const calls = mockFetch(win, okSnapshot);
    await win.doSync();
    expect(calls.map((c) => c.method + " " + c.path)).toEqual(["PUT /api/sync/snapshot"]);
    expect(win.localStorage.getItem(CHLOG)).toBeNull();
  });

  it("开关开：发 POST /api/sync/changes，delta 值 = 当前 localStorage 值，成功后 token 落盘 + 日志清空", async () => {
    const win = await loadApp({ storage: on() });
    win.save(PREFIX + "tasks", [{ id: "t1" }]);           // 开关开 → save() 会记日志
    const calls = mockFetch(win, okChanges({ token: 7 }));
    const ok = await win.syncRound();
    expect(ok).toBe(true);
    expect(calls.length).toBe(1);
    expect(calls[0].method + " " + calls[0].path).toBe("POST /api/sync/changes");
    expect(calls[0].body.since).toBe(0);
    const mine = calls[0].body.changes.filter((c) => c.k === PREFIX + "tasks");
    expect(mine.length).toBe(1);
    expect(mine[0].v).toBe(JSON.stringify([{ id: "t1" }]));
    expect(mine[0].ts).toBeGreaterThan(0);
    const meta = JSON.parse(win.localStorage.getItem(META) || "{}");
    expect(meta.syncToken).toBe(7);
    expect(meta.lastPushAt).toBeGreaterThan(0);
    expect(win.localStorage.getItem(CHLOG), "成功即清日志（收敛后清空=最简游标）").toBeNull();
  });

  it("游标：第二轮 since = 上一轮落盘的 token（服务端权威水位）", async () => {
    const win = await loadApp({ storage: on() });
    win.localStorage.setItem(META, JSON.stringify({ syncToken: 42 }));
    const calls = mockFetch(win, okChanges({ token: 43 }));
    await win.syncRound();
    expect(calls[0].body.since).toBe(42);
  });

  it("范围过滤：非同步面键不上行（排除键 / 非 PREFIX / _ 前缀 / 队列自身），业务键与自定义链上行", async () => {
    const win = await loadApp({ storage: on() });
    const T = Date.now();
    seedLog(win, [
      { k: PREFIX + "tasks", op: "set", ts: T, h: "" },
      { k: "wb_custom_links", op: "set", ts: T, h: "" },
      { k: PREFIX + "cfg", op: "set", ts: T, h: "" },          // 排除键
      { k: PREFIX + "sync_meta", op: "set", ts: T, h: "" },    // 排除键
      { k: "wb_access_token", op: "set", ts: T, h: "" },       // 排除键
      { k: "other_prefix_key", op: "set", ts: T, h: "" },      // 非 PREFIX 家族
      { k: "_deviceMeta", op: "set", ts: T, h: "" },           // 协议元键
      { k: CHLOG, op: "set", ts: T, h: "" }                    // 队列自身
    ]);
    win.localStorage.setItem(PREFIX + "tasks", "[]");
    win.localStorage.setItem("wb_custom_links", "[]");
    const calls = mockFetch(win, okChanges());
    await win.syncRound();
    const sent = calls[0].body.changes.map((c) => c.k).concat(calls[0].body.removed.map((r) => r.k));
    expect(sent.sort()).toEqual([PREFIX + "tasks", "wb_custom_links"]);
  });

  it("折叠：逐键取最新一条 —— set→del 只发 removed；del→set 只发 changes；set 但键已不在 → removed", async () => {
    const win = await loadApp({ storage: on() });
    const T = Date.now();
    win.localStorage.setItem(PREFIX + "revive", "[\"v\"]");
    win.localStorage.setItem(PREFIX + "ghost", "x");
    seedLog(win, [
      { k: PREFIX + "a", op: "set", ts: T, h: "" },
      { k: PREFIX + "a", op: "del", ts: T + 1, h: "" },        // set→del ⇒ removed
      { k: PREFIX + "revive", op: "del", ts: T, h: "" },
      { k: PREFIX + "revive", op: "set", ts: T + 2, h: "" },   // del→set ⇒ changes
      { k: PREFIX + "ghost", op: "set", ts: T + 3, h: "" }     // set 但 storage 没这个键 ⇒ removed
    ]);
    win.localStorage.removeItem(PREFIX + "ghost");
    const calls = mockFetch(win, okChanges());
    await win.syncRound();
    const ch = calls[0].body.changes.map((c) => c.k).sort();
    const rm = calls[0].body.removed.map((r) => r.k).sort();
    expect(ch).toEqual([PREFIX + "revive"]);
    expect(rm).toEqual([PREFIX + "a", PREFIX + "ghost"]);
  });
});

describe("阶段2/C2 回退与下行应用", () => {
  it("404（旧部署无增量端点）→ 自动回退全量 PUT", async () => {
    const win = await loadApp({ storage: on() });
    const calls = mockFetch(win, (path, body, n) => (n === 1 ? { ok: false, status: 404, data: null } : okSnapshot()));
    const ok = await win.syncRound();
    expect(ok).toBe(true);
    expect(calls.map((c) => c.path)).toEqual(["/api/sync/changes", "/api/sync/snapshot"]);
  });

  it("needsFull（水位太旧已剪枝）→ 自动回退全量 PUT", async () => {
    const win = await loadApp({ storage: on() });
    const calls = mockFetch(win, (path, body, n) => (n === 1 ? { ok: true, status: 200, data: { token: 0, changed: [], removed: [], needsFull: true } } : okSnapshot()));
    const ok = await win.syncRound();
    expect(ok).toBe(true);
    expect(calls.map((c) => c.path)).toEqual(["/api/sync/changes", "/api/sync/snapshot"]);
  });

  it("网络/服务端错误（非 404/405）→ 如实失败，不回退（交给状态机）", async () => {
    const win = await loadApp({ storage: on() });
    const calls = mockFetch(win, () => ({ ok: false, status: 500, data: null, errKind: "server" }));
    const ok = await win.syncRound();
    expect(ok).toBe(false);
    expect(calls.length).toBe(1);
  });

  it("下行 changed：写进本机（走快照同一应用路径），且不会被记成本地变更（日志保持清空）", async () => {
    const win = await loadApp({ storage: on() });
    const calls = mockFetch(win, okChanges({ changed: [{ k: PREFIX + "notes", v: "[\"R\"]", ts: 5 }] }));
    await win.syncRound();
    expect(calls.length).toBe(1);
    expect(win.localStorage.getItem(PREFIX + "notes")).toBe("[\"R\"]");
    expect(win.localStorage.getItem(CHLOG)).toBeNull();
    expect(JSON.parse(win.localStorage.getItem(META) || "{}").lastPullAt).toBeGreaterThan(0);
  });

  it("下行 removed：本机键被删；但本机有更晚未上传变更的键不被删（下轮上行胜出）", async () => {
    const win = await loadApp({ storage: on() });
    const T = Date.now();
    win.localStorage.setItem(PREFIX + "old", "x");
    win.localStorage.setItem(PREFIX + "newer", "y");
    seedLog(win, [{ k: PREFIX + "newer", op: "set", ts: T + 10, h: "" }]);   // 本机更晚的变更
    mockFetch(win, okChanges({ removed: [{ k: PREFIX + "old", ts: T }, { k: PREFIX + "newer", ts: T }] }));
    await win.syncRound();
    expect(win.localStorage.getItem(PREFIX + "old")).toBeNull();
    expect(win.localStorage.getItem(PREFIX + "newer"), "本机更晚变更优先").toBe("y");
  });

  it("C2 看板在增量轮记 delta 体积（而非全量快照体积）", async () => {
    const win = await loadApp({ storage: on() });
    win.save(PREFIX + "tasks", [{ id: "t1" }]);
    const calls = mockFetch(win, okChanges({ token: 3 }));
    await win.syncRound();
    const meta = JSON.parse(win.localStorage.getItem(META) || "{}");
    const sent = calls[0].body.changes.length + calls[0].body.removed.length;
    expect(meta.lastPushKeys, "看板键数 = 本轮 delta 的条数（开关开时启动期写入也合法入日志，故不写死 1）").toBe(sent);
    expect(meta.lastPushKeys).toBeGreaterThanOrEqual(1);
    expect(meta.lastPushBytes).toBeGreaterThan(0);
  });
});

describe("C3 冲突计数（下行覆盖数可见）", () => {
  it("全量应用口径：只统计「本机有值且被远端改成不同值」——远端新增不计、值相同不计", async () => {
    const win = await loadApp({ storage: {} });
    win.localStorage.setItem(PREFIX + "c3a", "old-a");   // 会被覆盖 → 计 1
    win.localStorage.setItem(PREFIX + "c3b", "same");    // 值相同 → 不计
    const n = win._applyCloudSnapshot({ [PREFIX + "c3a"]: "new-a", [PREFIX + "c3b"]: "same", [PREFIX + "c3c"]: "brand-new", _deviceMeta: { deviceId: "d" } });
    expect(n).toBe(1);
    expect(JSON.parse(win.localStorage.getItem(META)).lastPullCover).toBe(1);
    expect(win.localStorage.getItem(PREFIX + "c3c"), "远端新增键要落地").toBe("brand-new");
    expect(win.document.getElementById("apiPullCover").textContent).toBe("1 键");
  });

  it("无覆盖 → 0，面板显示「无」而非留白（「没覆盖任何东西」也要说出来）", async () => {
    const win = await loadApp({ storage: {} });
    win._applyCloudSnapshot({ [PREFIX + "c3x"]: "v" });  // 远端新增 → 0
    expect(JSON.parse(win.localStorage.getItem(META)).lastPullCover).toBe(0);
    expect(win.document.getElementById("apiPullCover").textContent).toBe("无");
  });

  it("增量轮：changed 侧 + removed 侧相加（removed 只算本机原本有值的）", async () => {
    const win = await loadApp({ storage: on() });
    win.localStorage.setItem(PREFIX + "c3z1", "old");
    win.localStorage.setItem(PREFIX + "c3z2", "y");
    const calls = mockFetch(win, okChanges({
      changed: [{ k: PREFIX + "c3z1", v: "new", ts: 9 }],
      removed: [{ k: PREFIX + "c3z2", ts: 9 }, { k: PREFIX + "c3absent", ts: 9 }]   // 后者本机无值 → 不计
    }));
    await win.syncRound();
    expect(calls.length).toBe(1);
    expect(win.localStorage.getItem(PREFIX + "c3z2")).toBeNull();
    expect(JSON.parse(win.localStorage.getItem(META)).lastPullCover, "1（覆盖）+ 1（删了本机有值的键）= 2").toBe(2);
  });

  it("被「本机更晚变更」保护跳过的删除：不计入，也不删键", async () => {
    const win = await loadApp({ storage: on() });
    win.localStorage.setItem(PREFIX + "c3keep", "mine");
    seedLog(win, [{ k: PREFIX + "c3keep", op: "set", ts: Date.now() + 100000, h: "" }]);   // 本机更晚
    mockFetch(win, okChanges({ removed: [{ k: PREFIX + "c3keep", ts: 5 }] }));
    await win.syncRound();
    expect(win.localStorage.getItem(PREFIX + "c3keep")).toBe("mine");
    expect(JSON.parse(win.localStorage.getItem(META)).lastPullCover).toBe(0);
  });

  it("诊断报告含覆盖行（0 也写出来，与面板同源）", async () => {
    const win = await loadApp({ storage: {} });
    win._applyCloudSnapshot({ [PREFIX + "c3n"]: "a" });   // 新增 → 0
    expect(win.buildDiagReport()).toContain("云同步: 上次云端覆盖 0 键");
    win.localStorage.setItem(PREFIX + "c3n", "old");
    win._applyCloudSnapshot({ [PREFIX + "c3n"]: "b" });   // 覆盖 → 1
    expect(win.buildDiagReport()).toContain("云同步: 上次云端覆盖 1 键");
    expect(win.document.getElementById("apiPullCover").textContent).toBe("1 键");
  });
});

describe("阶段3 下行按需增量拉取（5 分钟定时，开关制）", () => {
  /* 直接调 tick（_syncIncrementalPullTick），不用假时钟推进 setInterval —— 实测：vitest 的
     假时钟只覆盖**测试 realm** 的计时器，页面脚本（jsdom realm）里建的 setInterval 收不到
     推进（测侧自建间隔触发 360 次、页面里的 0 次）。tick 已抽成命名函数，覆盖它的全部
     判断分支即可；间隔时长（5 分钟）是源码里的常量，由注释与文档钉住。 */
  const tick = async (win) => {
    win._syncIncrementalPullTick();
    await new Promise((r) => setTimeout(r, 60));   // 等 tick 里 window.doSync 的 async 链跑完
  };

  it("开关关 + 已登录：tick 不产生任何请求（零行为变化）", async () => {
    const win = await loadApp({ storage: {} });
    win.apiSetTokens("t", "r", Date.now() + 3600 * 1000);
    const calls = mockFetch(win, okSnapshot);
    await tick(win);
    await tick(win);
    expect(calls.length).toBe(0);
  });

  it("未登录：即使开关开也不请求（tick 自带登录判断）", async () => {
    const win = await loadApp({ storage: on() });
    const calls = mockFetch(win, okChanges());
    await tick(win);
    expect(calls.length).toBe(0);
  });

  it("开关开 + 已登录：tick 触发一次「无上也拉」（日志清空后 changes 为空也发，只为拿远端变更）", async () => {
    const win = await loadApp({ storage: on() });
    win.apiSetTokens("t", "r", Date.now() + 3600 * 1000);
    /* 启动期写入（演示数据种子等）在开关开时也会入日志 —— 那不是"用户编辑"，但确实是要上行的本地变更；
       这里清空日志再 tick，验证"日志为空也照样拉"（阶段 2 的下行只捎带在上行时的缺口就在这里）。 */
    win.clearSyncChangelog();
    const calls = mockFetch(win, okChanges({ token: 9 }));
    await tick(win);
    expect(calls.length).toBe(1);
    expect(calls[0].method + " " + calls[0].path).toBe("POST /api/sync/changes");
    expect(calls[0].body.changes).toEqual([]);
    expect(calls[0].body.since).toBe(0);
  });

  it("发生过「服务端不支持」回退后，后续 tick 不再打扰那个部署", async () => {
    const win = await loadApp({ storage: on() });
    win.apiSetTokens("t", "r", Date.now() + 3600 * 1000);
    const calls = mockFetch(win, (path, body, n) => (n === 1 ? { ok: false, status: 404, data: null } : okSnapshot()));
    await tick(win);
    expect(calls.map((c) => c.path), "第一次 tick：增量 404 → 自动回退全量").toEqual(["/api/sync/changes", "/api/sync/snapshot"]);
    await tick(win);
    await tick(win);
    expect(calls.length, "回退过一次就不再轮询（同一部署不会自己长出增量端点）").toBe(2);
  });
});

describe("mv+提示：冲突消费 / 任务自动合并 / 冲突面板", () => {
  it("lww（默认）：响应无冲突 → 不写冲突键、面板保持隐藏（整段不触发）", async () => {
    const win = await loadApp({ storage: on() });
    mockFetch(win, okChanges({ token: 2, conflictPolicy: "lww", conflicts: [] }));
    await win.syncRound();
    expect(win.localStorage.getItem(PREFIX + "sync_conflicts")).toBeNull();
    expect(win.document.getElementById("syncConflicts").classList.contains("u-hidden")).toBe(true);
  });

  it("mv：非任务键的冲突列进面板（含双方值预览），且不做自动合并上行", async () => {
    const win = await loadApp({ storage: on() });
    const calls = mockFetch(win, okChanges({ token: 3, conflictPolicy: "mv", conflicts: [{ k: PREFIX + "notes", local: { v: "[\"L\"]", ts: 5 }, remote: { v: "[\"R\"]", ts: 9 } }] }));
    await win.syncRound();
    expect(calls.length, "没有自动合并要上行，只有那一轮").toBe(1);
    const stored = JSON.parse(win.localStorage.getItem(PREFIX + "sync_conflicts") || "[]");
    expect(stored.length).toBe(1);
    expect(stored[0].k).toBe(PREFIX + "notes");
    const box = win.document.getElementById("syncConflicts");
    expect(box.classList.contains("u-hidden")).toBe(false);
    expect(box.textContent).toContain("本机");
    expect(box.textContent).toContain("云端");
    expect(box.textContent).toContain("保留本机");
  });

  it("mv：任务键自动合并（按 id×updatedAt）并上行合并值；合并后该键不再留在面板", async () => {
    const win = await loadApp({ storage: on() });
    const local = JSON.stringify([{ id: "t1", title: "L1", updatedAt: 100 }, { id: "t2", title: "L2", updatedAt: 50 }]);
    const remote = JSON.stringify([{ id: "t2", title: "R2", updatedAt: 90 }, { id: "t3", title: "R3", updatedAt: 10 }]);
    const calls = mockFetch(win, okChanges({ token: 4, conflictPolicy: "mv", conflicts: [{ k: PREFIX + "tasks", local: { v: local, ts: 5 }, remote: { v: remote, ts: 9 } }] }));
    await win.syncRound();
    expect(calls.length, "自动合并会多发一轮上行").toBe(2);
    expect(calls[1].path).toBe("/api/sync/changes");
    const merged = JSON.parse(calls[1].body.changes[0].v);
    expect(merged.length, "三去重后的任务").toBe(3);
    const m2 = merged.find((x) => x.id === "t2");
    expect(m2.title, "t2 取 updatedAt 更大的远端值").toBe("R2");
    expect(JSON.parse(win.localStorage.getItem(PREFIX + "tasks")).length).toBe(3);
    expect(JSON.parse(win.localStorage.getItem(PREFIX + "sync_conflicts") || "[]").length).toBe(0);
  });

  it("mv：用户「保留本机」→ 调 /resolve(local) 且本机值落盘、面板移除该项", async () => {
    const win = await loadApp({ storage: on() });
    const calls = mockFetch(win, (path, body, n) => (n === 1
      ? okChanges({ token: 5, conflictPolicy: "mv", conflicts: [{ k: PREFIX + "notes", local: { v: "[\"L\"]", ts: 5 }, remote: { v: "[\"R\"]", ts: 9 } }] })()
      : { ok: true, status: 200, data: { token: 6 } }));
    await win.syncRound();
    await win._resolveSyncConflict(PREFIX + "notes", "local");
    expect(calls[1].method + " " + calls[1].path).toBe("POST /api/sync/resolve");
    expect(calls[1].body.choice).toBe("local");
    expect(win.localStorage.getItem(PREFIX + "notes")).toBe("[\"L\"]");
    expect(JSON.parse(win.localStorage.getItem(PREFIX + "sync_conflicts") || "[]").length).toBe(0);
    expect(win.document.getElementById("syncConflicts").classList.contains("u-hidden")).toBe(true);
  });

  it("mv：用户「使用云端」→ /resolve(remote) 且云端值落盘", async () => {
    const win = await loadApp({ storage: on() });
    const calls = mockFetch(win, (path, body, n) => (n === 1
      ? okChanges({ token: 7, conflictPolicy: "mv", conflicts: [{ k: PREFIX + "notes", local: { v: "[\"L\"]", ts: 5 }, remote: { v: "[\"R\"]", ts: 9 } }] })()
      : { ok: true, status: 200, data: { token: 8 } }));
    await win.syncRound();
    await win._resolveSyncConflict(PREFIX + "notes", "remote");
    expect(calls[1].body.choice).toBe("remote");
    expect(win.localStorage.getItem(PREFIX + "notes")).toBe("[\"R\"]");
  });
});
