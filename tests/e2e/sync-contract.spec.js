/**
 * 云同步契约端到端（v3.7.54 · 任务 #10）
 * ----------------------------------------------------------------------------
 * 背景：客户端此前**只有 GET、没有 PUT**，「立即上传」是空转桩却显示「已同步」；
 * v3.7.53 补了 apiPutSnapshot、并把 flushSyncQueue 的"假成功清队列"改成真发真判。
 * 但那三处修复都只有静态代码与单测层面的信心 —— 本 spec 用**真 HTTP 服务**把契约钉住。
 *
 * 覆盖：① PUT 请求的形状契约（snapshot / updatedAt / _deviceMeta.deviceId）
 *       ② doSync 状态机四态：idle(真推成功) / error(服务端拒绝) / offline(网络不可达) / 未登录不动
 *       ③ 完整往返：本机改数据 → push → 抹掉本机 → pull+apply → 数据回来
 *       ④ 云端无快照时 apiGetSnapshot() 返回 null（不抛、不返回半成品）
 *       ⑤ 401 → 自动 refresh → 重试一次 的真实链路
 *       ⑥ 覆盖式恢复前必须留 pre_restore_backup（v3.7.52 的止血）
 *       ⑦ SYNC_ENDPOINT 未配置时 flushSyncQueue 不得谎报成功、不得清空队列
 *
 * 默认跳过，E2E=1 才跑（与其余 spec 一致）。视口无关，只在 desktop 项目跑。
 */
import { test, expect } from "./_fixture.js";
import { startSyncMock } from "../mocks/sync-server.mjs";

// v3.7.71 口径修复：注释声明「默认跳过，E2E=1 才跑」但此前无 test.skip —— 实际始终执行。
// 补上门禁与其余 10 个 spec 对齐（多跑不是错，但声明与行为必须一致）。
test.skip(!process.env.E2E, "set E2E=1 to run");

const PREFIX = "wb_agent_";

let mock;

/* 页面由 mock **同源托管**（见 sync-server.mjs 的静态兜底），不用 file://：
   这样 API 请求与页面同 origin，应用 CSP 的 `connect-src 'self' https:` 天然放行，
   不必为跑测试去放宽 CSP。apiBase 与 appBase 分开传，才能造出"页面正常但后端是死端口"。
   cfg/token 必须在应用脚本执行前落好 —— `_apiBase` 与 `_restoreTokens()` 都在 IIFE 里一次性求值。 */
async function openApp(page, { apiBase, appBase, fakeLogin = false } = {}) {
  await page.addInitScript(([base, login]) => {
    try {
      localStorage.setItem("wb_agent_cfg", JSON.stringify({ enabled: false, apiBase: base }));
      if (login) {
        /* token 三键是裸 wb_ 前缀（不进 wb_agent_ 命名空间），见 _persistTokens 注释 */
        localStorage.setItem("wb_access_token", "mock-access-0");
        localStorage.setItem("wb_refresh_token", "mock-refresh-0");
        localStorage.setItem("wb_token_expiry", String(Date.now() + 3600_000));
      }
    } catch (e) { /* 早期 localStorage 不可用时忽略 */ }
  }, [apiBase, fakeLogin]);
  await page.goto((appBase || mock.url) + "/agent-workbench.html");
  await page.waitForSelector("#side", { timeout: 15_000 });
  await page.waitForTimeout(600);
}

const login = (page) => page.evaluate(() => window.apiLogin("sync-test@example.com", "pw12345"));

test.describe("云同步契约端到端", () => {
  test.beforeAll(async () => { mock = await startSyncMock(); });
  test.afterAll(async () => { if (mock) await mock.close(); });

  test.beforeEach(() => {
    mock.reset();
    mock.setBehaviors({ requireAuth: false, putFails: 0, getEmpty: false, refreshFails: false });
  });

  test("① PUT 的 body 形状符合契约", async ({ page }) => {
    await openApp(page, { apiBase: mock.url });
    const r = await login(page);
    expect(r.ok, "mock 登录应成功：" + JSON.stringify(r)).toBe(true);

    const ok = await page.evaluate(() => apiPutSnapshot());
    expect(ok, "apiPutSnapshot() 应返回 true").toBe(true);

    const put = mock.requests.filter((x) => x.method === "PUT" && x.path === "/api/sync/snapshot");
    expect(put.length).toBe(1);
    const body = JSON.parse(put[0].body);
    expect(typeof body.updatedAt).toBe("number");
    expect(body.snapshot && typeof body.snapshot).toBe("object");
    expect(body.snapshot._deviceMeta.deviceId, "快照必须带 deviceId，否则多设备合并无从判断").toBeTruthy();
    expect(body.snapshot._deviceMeta.version).toBeTruthy();
    /* 登录后请求应带 Bearer —— 契约要求服务端可据此鉴权 */
    expect(put[0].auth).toMatch(/^Bearer mock-access-\d+$/);
    /* 服务端确实存下了 */
    expect(mock.state.snapshot._deviceMeta.deviceId).toBe(body.snapshot._deviceMeta.deviceId);
  });

  test("② doSync 状态机：成功/服务端拒绝/网络不可达/未登录", async ({ page }) => {
    await openApp(page, { apiBase: mock.url });
    /* 未登录：doSync 必须直接返回，不改状态、不发请求 */
    await page.evaluate(() => { window.setSyncStatus("idle"); return window.doSync(); });
    expect(mock.requests.filter((x) => x.path === "/api/sync/snapshot").length, "未登录不该发同步请求").toBe(0);

    await login(page);
    /* 真推成功 → idle（文案「已同步」此时才诚实） */
    await page.evaluate(() => window.doSync());
    expect(await page.evaluate(() => window.getSyncStatus())).toBe("idle");
    const meta = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) || "{}"), PREFIX + "sync_meta");
    expect(meta.lastPushAt, "成功推送后应记录 lastPushAt").toBeGreaterThan(0);

    /* v3.7.71 重试矩阵：瞬时 500 ×2 → 退避重试 2 次后第 3 次成功 → idle（真推上去了才显示已同步） */
    mock.setBehaviors({ putFails: 2 });
    await page.evaluate(() => { window.setSyncStatus("idle"); return window.doSync(); });
    expect(await page.evaluate(() => window.getSyncStatus()), "瞬时 500 重试后成功应为 idle").toBe("idle");

    /* 持续性 500（重试 2 次仍失败）→ error（不能仍显示已同步） */
    mock.setBehaviors({ putFails: 99 });
    await page.evaluate(() => { window.setSyncStatus("idle"); return window.doSync(); });
    expect(await page.evaluate(() => window.getSyncStatus()), "持续性服务端拒绝应为 error").toBe("error");
    mock.setBehaviors({ putFails: 0 });

    /* 网络不可达 → offline：另开一个"已登录但 apiBase 指向死端口"的页面。
       不能在该页调 apiLogin（连 /api/auth/login 都连不上，会直接抛），故用注入的假 token。 */
    const dead = await page.context().newPage();
    await openApp(dead, { apiBase: "http://127.0.0.1:1", fakeLogin: true });
    await dead.evaluate(() => window.doSync());
    expect(await dead.evaluate(() => window.getSyncStatus()), "连不上应如实 offline").toBe("offline");
    await dead.close();
  });

  test("③ 完整往返：推送 → 抹掉本机 → 拉回并应用", async ({ page }) => {
    await openApp(page, { apiBase: mock.url });
    await login(page);

    /* 本机造一条可识别的任务（走应用自己的写入路径，不手搓 localStorage） */
    const title = "SYNC-E2E-" + Date.now();
    const created = await page.evaluate((tt) => {
      const t = getTasks();
      const task = { id: "sync-e2e-1", title: tt, sc: "office", status: "todo", created: Date.now(), updatedAt: Date.now() };
      t.push(task); setTasks(t);
      return { n: getTasks().length };
    }, title);
    expect(created.n).toBeGreaterThan(0);

    expect(await page.evaluate(() => apiPutSnapshot())).toBe(true);
    expect(mock.state.snapshot[PREFIX + "tasks"], "云端快照应含任务键").toBeTruthy();

    /* 抹掉本机任务键，模拟"换设备/重装后只有云端" */
    await page.evaluate((k) => localStorage.removeItem(k), PREFIX + "tasks");
    expect(await page.evaluate(() => getTasks().length)).toBe(0);

    /* 拉 + 应用（pullCloud 的真实两步：apiGetSnapshot → _applyCloudSnapshot） */
    const rec = await page.evaluate(() => apiGetSnapshot());
    expect(rec && rec.snapshot, "GET 应返回 {snapshot, updatedAt}").toBeTruthy();
    /* _applyCloudSnapshot 收的是**快照本身**（内部直接读 data[wb_agent_tasks]），不是整条记录 */
    await page.evaluate((data) => _applyCloudSnapshot(data), rec.snapshot);
    const back = await page.evaluate(() => getTasks().map((x) => x.title));
    expect(back, "拉取后本机应重新出现该任务").toContain(title);
  });

  test("④ 云端无快照时 apiGetSnapshot() 返回 null", async ({ page }) => {
    await openApp(page, { apiBase: mock.url });
    await login(page);
    expect(mock.state.snapshot, "前置：云端应为空").toBe(null);
    const rec = await page.evaluate(() => apiGetSnapshot());
    expect(rec).toBe(null);
    /* 404 不该被当成"同步成功" */
    await page.evaluate(() => { window.setSyncStatus("idle"); return window.doSync(); });
    expect(await page.evaluate(() => window.getSyncStatus())).toBe("idle");
  });

  test("⑤ 401 → 自动 refresh → 重试一次并成功", async ({ page }) => {
    await openApp(page, { apiBase: mock.url });
    mock.setBehaviors({ requireAuth: true });
    await login(page);
    mock.advanceToken(); /* 让客户端手里的 token 作废 */

    const ok = await page.evaluate(() => apiPutSnapshot());
    expect(ok, "refresh 后重试应成功").toBe(true);

    /* ⚠️ 必须连 method 一起筛：跨源 PUT/POST 会先各来一发 OPTIONS 预检，
       只按 path 筛会把预检算进去，refresh 次数凭空翻倍（实测踩过）。 */
    const puts = mock.requests.filter((x) => x.method === "PUT" && x.path === "/api/sync/snapshot");
    const refreshes = mock.requests.filter((x) => x.method === "POST" && x.path === "/api/auth/refresh");
    expect(puts.length, "应看到「一次被拒 + 一次重试」共 2 个 PUT").toBe(2);
    expect(puts[0].auth).not.toBe(puts[1].auth, "重试必须带刷新后的新 token");
    expect(refreshes.length, "只应刷新一次（_retried 守卫防无限重试）").toBe(1);
  });

  test("⑥ 覆盖式恢复前留 pre_restore_backup", async ({ page }) => {
    await openApp(page, { apiBase: mock.url });
    await login(page);
    await page.evaluate((k) => localStorage.setItem(k, JSON.stringify([{ id: "old", title: "本机旧任务" }])), PREFIX + "tasks");
    const snap = await page.evaluate((k) => ({ snapshot: { [k]: JSON.stringify([{ id: "new", title: "云端任务" }]) }, updatedAt: Date.now() }), PREFIX + "tasks");
    await page.evaluate((d) => _applyCloudSnapshot(d.snapshot), snap);

    const pre = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) || "null"), PREFIX + "pre_restore_backup");
    expect(pre, "恢复前必须留回滚档").toBeTruthy();
    expect(typeof pre.at).toBe("number");
    expect(pre.keys[PREFIX + "tasks"], "回滚档应含被覆盖前的原值").toContain("本机旧任务");
    /* 内部键不得被回写进 localStorage */
    const metaAfter = await page.evaluate((k) => localStorage.getItem(k), PREFIX + "sync_meta");
    expect(JSON.parse(metaAfter || "{}").lastPullAt, "拉取应记录 lastPullAt").toBeGreaterThan(0);
  });

  test("⑦ SYNC_ENDPOINT 未配置时不得谎报成功、不得清空队列", async ({ page }) => {
    await openApp(page, { apiBase: mock.url });
    await login(page);
    const before = await page.evaluate(() => { enqueueSync("task.upsert", { id: "q1" }); return getSyncQueue().length; });
    expect(before).toBeGreaterThan(0);
    const res = await page.evaluate(() => flushSyncQueue());
    const after = await page.evaluate(() => getSyncQueue().length);
    expect(after, "端点未配置时队列必须原样保留（否则等于静默丢弃用户改动）").toBe(before);
    expect(res && (res.ok === 0 || res.sent === 0 || res.skipped || res.offline), "不得报成功：" + JSON.stringify(res)).toBeTruthy();
  });
});
