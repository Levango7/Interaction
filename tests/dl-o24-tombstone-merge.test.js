/**
 * dl-o24-tombstone-merge.test.js —— DL-O24（用户 2026-11-10 裁选项②）钉子
 * ---------------------------------------------------------------------------
 * 裁决：软删除 tombstone 的活性优先于 LWW —— 合并判据里，一方有 deletedAt
 * 另一方无 ⇒ 无 deletedAt（活跃）版赢，与时间戳无关；双方同态（都删/都活）
 * ⇒ 维持原 LWW。根因：软删除只置 deletedAt 不 bump updatedAt
 * （src/ui-scene-bind.js:54），纯按 (updatedAt||created) 的 LWW 救不回被删任务
 * （DL-O02 真机 run4 步 6）。两处合并点同判据：
 *   A _applyCloudSnapshot（快照恢复，src/render-overview.js）
 *   B _autoMergeTasksConflict（冲突自动合并，同文件）
 * 七场景：S1 本机删/云端活 ⇒ 复活；S2 本机活/云端删 ⇒ 本机活赢；
 *        S3 云端新增 id ⇒ 进（!lt 回归）；S4 双方删 ⇒ LWW；S5 双方活 ⇒ LWW；
 *        S6 本机删且 ts 更新/云端活且 ts 更旧 ⇒ 仍云端活赢（活性压过时间戳）；
 *        S7 双方都活且本机 ts 更大 ⇒ 同态维持 LWW，本机版赢（同态分支双向钉死）。
 * 注：wb_agent_tasks 启动即被示例数据播种（cloud-sync-stage2.test.js:224 同款坑），
 *     每例先用自有数组覆盖该键再测。
 */
import { describe, it, expect } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

const PREFIX = "wb_agent_";
const TASKS = PREFIX + "tasks";
const put = (win, arr) => win.localStorage.setItem(TASKS, JSON.stringify(arr));
const read = (win) => JSON.parse(win.localStorage.getItem(TASKS) || "[]");

/* 合并点 B：直接喂 {local,remote} 双版本（v 为 JSON 字符串，与服务端 conflict 清单同形），
   mockFetch 接住它合并后必发的 POST /api/sync/changes。 */
const autoMerge = async (win, localArr, remoteArr) => {
  const calls = [];
  win.apiFetch = async (path, opts) => {
    calls.push({ path, method: (opts && opts.method) || "GET", body: opts && opts.body ? JSON.parse(opts.body) : null });
    return path.includes("/api/sync/changes")
      ? { ok: true, status: 200, data: { token: 5, changed: [], removed: [], needsFull: false } }
      : { ok: true, status: 200, data: {} };
  };
  await win._autoMergeTasksConflict({
    k: TASKS,
    local: { v: JSON.stringify(localArr) },
    remote: { v: JSON.stringify(remoteArr) },
    at: 1
  });
  return calls;
};

describe("DL-O24 合并点 A：_applyCloudSnapshot（快照恢复）", () => {
  it("S1 本机已删 / 云端活跃（同 ts）⇒ 活跃版复活，不被 tombstone 压住", () => {
    const win = loadApp({ storage: {} });
    put(win, [{ id: "t1", title: "本机", deletedAt: 100, updatedAt: 100, created: 100 }]);
    win._applyCloudSnapshot({ [TASKS]: JSON.stringify([{ id: "t1", title: "云端", updatedAt: 100, created: 100 }]) });
    expect(read(win)).toEqual([{ id: "t1", title: "云端", updatedAt: 100, created: 100 }]);
  });

  it("S2 本机活跃 / 云端已删（同 ts）⇒ 本机活跃版赢，不被 tombstone 盖掉", () => {
    const win = loadApp({ storage: {} });
    put(win, [{ id: "t1", title: "本机", updatedAt: 100, created: 100 }]);
    win._applyCloudSnapshot({ [TASKS]: JSON.stringify([{ id: "t1", title: "云端", deletedAt: 100, updatedAt: 100, created: 100 }]) });
    expect(read(win)).toEqual([{ id: "t1", title: "本机", updatedAt: 100, created: 100 }]);
  });

  it("S3 云端新增 id（本机无）⇒ 照常进（!lt 新增回归，不被活性判据误伤）", () => {
    const win = loadApp({ storage: {} });
    put(win, [{ id: "a", title: "本机", updatedAt: 1, created: 1 }]);
    win._applyCloudSnapshot({ [TASKS]: JSON.stringify([{ id: "b", title: "云端新", updatedAt: 1, created: 1 }]) });
    expect(read(win).map((t) => t.id).sort()).toEqual(["a", "b"]);
  });

  it("S4 双方都删（异 ts）⇒ 同态维持 LWW，ts 大者赢", () => {
    const win = loadApp({ storage: {} });
    put(win, [{ id: "t1", title: "旧删", deletedAt: 100, updatedAt: 100, created: 1 }]);
    win._applyCloudSnapshot({ [TASKS]: JSON.stringify([{ id: "t1", title: "新删", deletedAt: 200, updatedAt: 200, created: 1 }]) });
    expect(read(win)).toEqual([{ id: "t1", title: "新删", deletedAt: 200, updatedAt: 200, created: 1 }]);
  });

  it("S5 双方都活（异 ts）⇒ 同态维持 LWW，ts 大者赢", () => {
    const win = loadApp({ storage: {} });
    put(win, [{ id: "t1", title: "旧活", updatedAt: 100, created: 1 }]);
    win._applyCloudSnapshot({ [TASKS]: JSON.stringify([{ id: "t1", title: "新活", updatedAt: 200, created: 1 }]) });
    expect(read(win)).toEqual([{ id: "t1", title: "新活", updatedAt: 200, created: 1 }]);
  });

  it("S7 双方都活且本机 ts 更大 ⇒ 同态维持 LWW，本机版赢（同态分支双向钉死）", () => {
    const win = loadApp({ storage: {} });
    put(win, [{ id: "t1", title: "本机新活", updatedAt: 200, created: 1 }]);
    win._applyCloudSnapshot({ [TASKS]: JSON.stringify([{ id: "t1", title: "云端旧活", updatedAt: 100, created: 1 }]) });
    expect(read(win)).toEqual([{ id: "t1", title: "本机新活", updatedAt: 200, created: 1 }]);
  });

  it("S6 本机删且 ts 更新 / 云端活且 ts 更旧 ⇒ 活性压过时间戳，云端活跃版仍赢", () => {
    const win = loadApp({ storage: {} });
    put(win, [{ id: "t1", title: "本机删", deletedAt: 999, updatedAt: 999, created: 1 }]);
    win._applyCloudSnapshot({ [TASKS]: JSON.stringify([{ id: "t1", title: "云端活且更旧", updatedAt: 1, created: 1 }]) });
    expect(read(win)).toEqual([{ id: "t1", title: "云端活且更旧", updatedAt: 1, created: 1 }]);
  });
});

describe("DL-O24 合并点 B：_autoMergeTasksConflict（冲突自动合并）", () => {
  it("S1 本机已删 / 云端活跃（同 ts）⇒ 活跃版复活，且以新 ts 上行", async () => {
    const win = loadApp({ storage: {} });
    const calls = await autoMerge(win,
      [{ id: "t1", title: "本机", deletedAt: 100, updatedAt: 100, created: 100 }],
      [{ id: "t1", title: "云端", updatedAt: 100, created: 100 }]);
    expect(read(win)).toEqual([{ id: "t1", title: "云端", updatedAt: 100, created: 100 }]);
    expect(calls[0].method + " " + calls[0].path).toBe("POST /api/sync/changes");
    expect(calls[0].body.changes[0].k).toBe(TASKS);
  });

  it("S2 本机活跃 / 云端已删（同 ts）⇒ 本机活跃版赢", async () => {
    const win = loadApp({ storage: {} });
    await autoMerge(win,
      [{ id: "t1", title: "本机", updatedAt: 100, created: 100 }],
      [{ id: "t1", title: "云端", deletedAt: 100, updatedAt: 100, created: 100 }]);
    expect(read(win)).toEqual([{ id: "t1", title: "本机", updatedAt: 100, created: 100 }]);
  });

  it("S3 云端新增 id（本机无）⇒ 照常进（!lt 新增回归）", async () => {
    const win = loadApp({ storage: {} });
    await autoMerge(win,
      [{ id: "a", title: "本机", updatedAt: 1, created: 1 }],
      [{ id: "b", title: "云端新", updatedAt: 1, created: 1 }]);
    expect(read(win).map((t) => t.id).sort()).toEqual(["a", "b"]);
  });

  it("S4 双方都删（异 ts）⇒ 同态维持 LWW，ts 大者赢", async () => {
    const win = loadApp({ storage: {} });
    await autoMerge(win,
      [{ id: "t1", title: "旧删", deletedAt: 100, updatedAt: 100, created: 1 }],
      [{ id: "t1", title: "新删", deletedAt: 200, updatedAt: 200, created: 1 }]);
    expect(read(win)).toEqual([{ id: "t1", title: "新删", deletedAt: 200, updatedAt: 200, created: 1 }]);
  });

  it("S5 双方都活（异 ts）⇒ 同态维持 LWW，ts 大者赢", async () => {
    const win = loadApp({ storage: {} });
    await autoMerge(win,
      [{ id: "t1", title: "旧活", updatedAt: 100, created: 1 }],
      [{ id: "t1", title: "新活", updatedAt: 200, created: 1 }]);
    expect(read(win)).toEqual([{ id: "t1", title: "新活", updatedAt: 200, created: 1 }]);
  });

  it("S7 双方都活且本机 ts 更大 ⇒ 同态维持 LWW，本机版赢（同态分支双向钉死）", async () => {
    const win = loadApp({ storage: {} });
    const calls = await autoMerge(win,
      [{ id: "t1", title: "本机新活", updatedAt: 200, created: 1 }],
      [{ id: "t1", title: "云端旧活", updatedAt: 100, created: 1 }]);
    expect(read(win)).toEqual([{ id: "t1", title: "本机新活", updatedAt: 200, created: 1 }]);
    expect(calls[0].method + " " + calls[0].path).toBe("POST /api/sync/changes");
  });

  it("S6 本机删且 ts 更新 / 云端活且 ts 更旧 ⇒ 活性压过时间戳，云端活跃版仍赢", async () => {
    const win = loadApp({ storage: {} });
    await autoMerge(win,
      [{ id: "t1", title: "本机删", deletedAt: 999, updatedAt: 999, created: 1 }],
      [{ id: "t1", title: "云端活且更旧", updatedAt: 1, created: 1 }]);
    expect(read(win)).toEqual([{ id: "t1", title: "云端活且更旧", updatedAt: 1, created: 1 }]);
  });
});
