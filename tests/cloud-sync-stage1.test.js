/**
 * cloud-sync-stage1.test.js —— 云同步增量契约 · 阶段1（C1 变更日志 + C2 上行体积看板）
 * ----------------------------------------------------------------------------
 * 依据 docs/cloud-sync-incremental-contract.md §三/§四：阶段 1 = C1 + C2 —— 纯客户端、零协议变更。
 * 实现纪律（同文 §三 注）：接线点留好、UI 不承诺、**守护钉死"开关关闭时行为零变化"**。
 *   · C1：save() / 共享安全删除 记 {k, op, ts, h} 到有界队列（门控 cfg.syncIncremental，默认关）；
 *   · C2：apiPutSnapshot 先记体积/键数 → 设置面板行 + 诊断报告行（口径与后端 2MB 上限一致）。
 * 本文件即那条"守护"：开关关时逐项断言零行为变化；开关开时断言记录格式与边界。
 * 断言一律**按 key 过滤**，不假设队列只有本次操作产生的条目（启动期本就有真实删除/写入）。
 */
import { describe, it, expect } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

const PREFIX = "wb_agent_";
const CHLOG = PREFIX + "sync_changelog";
const CFG = PREFIX + "cfg";
const META = PREFIX + "sync_meta";
/** 开态播种：与生产路径同形 —— 开关落在持久化的 cfg 里，由 getCfg() 读出 */
const on = () => ({ [CFG]: JSON.stringify({ syncIncremental: true }) });
/** 只看某个键的记录（避免被启动期其他真实变更干扰） */
const entries = (win, k) => win.getSyncChangelog().filter((e) => e.k === k);

describe("阶段1/C1 本地变更日志（门控）", () => {
  it("开关关闭（默认）：save() 零行为变化 —— 不产生队列、业务写入照常、删除路径同样零记录", async () => {
    const win = await loadApp({ storage: {} });
    expect(win.getCfg().syncIncremental, "前置：默认 cfg 无该字段").toBeUndefined();
    expect(win.save(PREFIX + "probe", { a: 1 })).toBe(true);
    expect(win.localStorage.getItem(CHLOG)).toBeNull();
    expect(win.getSyncChangelog(), "开关关时队列必须为空").toEqual([]);
    expect(JSON.parse(win.localStorage.getItem(PREFIX + "probe"))).toEqual({ a: 1 });
    win._sharedSafeLSRemove(PREFIX + "probe");
    expect(win.localStorage.getItem(CHLOG), "开关关时删除也不进日志").toBeNull();
  });

  it("开关打开：save() 记一条 {k, op:'set', ts, h}，h = fnv1aHex(序列化值)", async () => {
    const win = await loadApp({ storage: on() });
    expect(win.getCfg().syncIncremental, "前置：播种的开关已生效").toBe(true);
    const v = { n: 1, s: "你好" };
    win.save(PREFIX + "probe", v);
    const mine = entries(win, PREFIX + "probe");
    expect(mine.length).toBe(1);
    expect(mine[0].op).toBe("set");
    expect(mine[0].ts).toBeGreaterThan(0);
    expect(mine[0].h).toBe(win.fnv1aHex(JSON.stringify(v)));
  });

  it("开关可在会话内开启（生产路径：cfg 缓存 + 落盘更新后门控即生效，无需重启）", async () => {
    const win = await loadApp({ storage: {} });
    await win.initCrypto(); // 与真实启动一致：让 _cfgCache 就位
    win.save(PREFIX + "probe_before", { a: 1 });
    expect(entries(win, PREFIX + "probe_before").length).toBe(0);
    const c = win.getCfg();
    c.syncIncremental = true; // saveCfg 同款：改 cfg 的人负责更新缓存
    expect(win.getCfg().syncIncremental, "前置：getCfg 返回活缓存对象").toBe(true);
    await win.persistCfg(c); // 同时落盘（下次启动也生效）
    win.save(PREFIX + "probe_after", { a: 2 });
    expect(entries(win, PREFIX + "probe_after").map((e) => e.op)).toEqual(["set"]);
  });

  it("开关打开：共享安全删除记 op:'del'（h 为空串）；对不存在的键不记假信号", async () => {
    const win = await loadApp({ storage: on() });
    win._sharedSafeLSRemove(PREFIX + "probe_absent"); // 键不存在 → removeItem 是 no-op → 不记
    expect(entries(win, PREFIX + "probe_absent").length).toBe(0);
    win.localStorage.setItem(PREFIX + "probe_del", "x");
    win._sharedSafeLSRemove(PREFIX + "probe_del");
    expect(win.localStorage.getItem(PREFIX + "probe_del")).toBeNull();
    const mine = entries(win, PREFIX + "probe_del");
    expect(mine.length).toBe(1);
    expect(mine[0]).toMatchObject({ op: "del", h: "" });
  });

  it("有界队列：上限 500，溢出丢最旧", async () => {
    const win = await loadApp({ storage: on() });
    for (let i = 0; i < 600; i++) win._chlogRecord(PREFIX + "k" + i, "set", String(i));
    const arr = win.getSyncChangelog();
    expect(arr.length).toBe(500);
    expect(arr[arr.length - 1].k).toBe(PREFIX + "k599");
    expect(arr.some((e) => e.k === PREFIX + "k0"), "最旧的应被丢弃").toBe(false);
  });

  it("队列自身键不进日志（防递归）：写队列键只落我写的原值；开关关时 _chlogRecord 直接返回", async () => {
    const win = await loadApp({ storage: on() });
    win.save(CHLOG, [{ k: "x", op: "set", ts: 1, h: "" }]);
    const arr = win.getSyncChangelog();
    expect(arr.length, "不得为队列键自身追加递归条目").toBe(1);
    expect(arr[0].k).toBe("x");
    const win2 = await loadApp({ storage: {} });
    win2._chlogRecord(PREFIX + "k", "set", "1");
    expect(win2.localStorage.getItem(CHLOG)).toBeNull();
  });

  it("队列读失败不影响 save() 的返回值与落盘（契约：日志不得影响业务写入）", async () => {
    const win = await loadApp({ storage: on() });
    win.getSyncChangelog = function () { throw new Error("read boom"); };
    const before = win.getDiag().length;
    expect(win.save(PREFIX + "probe_ro", { b: 2 })).toBe(true);
    expect(JSON.parse(win.localStorage.getItem(PREFIX + "probe_ro"))).toEqual({ b: 2 });
    const diag = win.getDiag();
    expect(diag.length).toBeGreaterThan(before);
    expect(diag.some((e) => /changelog write failed/.test(e.msg || ""))).toBe(true);
  });

  it("队列写失败（配额）不影响业务写入，且高频路径只留一次痕", async () => {
    const win = await loadApp({ storage: on() });
    const orig = win.Storage.prototype.setItem;
    win.Storage.prototype.setItem = function (k, v) {
      if (String(k) === CHLOG) throw new win.DOMException("QuotaExceededError", "QuotaExceededError");
      return orig.call(this, k, v);
    };
    expect(win.save(PREFIX + "probe_q", { q: 1 })).toBe(true);
    expect(JSON.parse(win.localStorage.getItem(PREFIX + "probe_q"))).toEqual({ q: 1 });
    win.save(PREFIX + "probe_q2", { q: 2 });
    expect(
      win.getDiag().filter((e) => /changelog write failed/.test(e.msg || "")).length,
      "同一失败只应留一次痕"
    ).toBe(1);
  });

  it("云快照排除：队列键不上云（_buildCloudSnapshot 不含它，业务键照常在内）", async () => {
    const win = await loadApp({ storage: on() });
    win.save(PREFIX + "probe_snap", { c: 3 });
    expect(win.localStorage.getItem(CHLOG)).not.toBeNull();
    const snap = win._buildCloudSnapshot();
    expect(snap[CHLOG]).toBeUndefined();
    expect(Object.keys(snap)).toContain(PREFIX + "probe_snap");
  });
});

describe("阶段1/C2 上行体积看板", () => {
  it("上传尝试即记录体积/键数（失败也记）；字节口径 = snapshot 的 UTF-8（不含 updatedAt 包装）", async () => {
    const win = await loadApp({ storage: { [PREFIX + "tasks"]: JSON.stringify([{ id: "t1", title: "x" }]) } });
    let sent = null;
    win.apiFetch = async (_path, opts) => { sent = JSON.parse(opts.body); return { ok: false, errKind: "http" }; };
    const ok = await win.apiPutSnapshot();
    expect(ok).toBe(false);
    const meta = JSON.parse(win.localStorage.getItem(META) || "{}");
    expect(meta.lastPushBytes).toBe(win._sharedUtf8Bytes(JSON.stringify(sent.snapshot)).length);
    expect(meta.lastPushKeys).toBe(Object.keys(sent.snapshot).length);
    expect(meta.lastPushKeys).toBeGreaterThanOrEqual(2); // 至少业务键 + _deviceMeta
  });

  it("设置面板行 #apiPushSize：未上传过为 —，上传后显示体积 · 键数", async () => {
    const win = await loadApp({ storage: {} });
    const el = win.document.getElementById("apiPushSize");
    expect(el, "面板行应存在于静态 HTML").not.toBeNull();
    expect(el.textContent).toBe("—");
    win.apiFetch = async () => ({ ok: true });
    await win.apiPutSnapshot();
    const txt = win.document.getElementById("apiPushSize").textContent;
    expect(txt).toMatch(/(KB|MB|B)/);
    expect(txt).toContain("键");
  });

  it("诊断报告含云同步体积行（与快照同源）", async () => {
    const win = await loadApp({ storage: {} });
    expect(win.buildDiagReport()).toContain("云同步: 尚未上传过快照");
    win.apiFetch = async () => ({ ok: true });
    await win.apiPutSnapshot();
    expect(win.buildDiagReport()).toMatch(/云同步: 上次上传快照 [\d.]+ KB \/ 含 \d+ 键/);
  });
});
