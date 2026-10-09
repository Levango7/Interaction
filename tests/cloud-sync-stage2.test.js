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
