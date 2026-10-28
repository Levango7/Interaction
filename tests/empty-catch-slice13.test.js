/**
 * empty-catch-slice13.test.js —— B8-a 第一片（`src/ui-ge-api.js` 的 11 处 P0 空 catch 消解）
 * ----------------------------------------------------------------------------
 * 背景：`scripts/lint-empty-catch.baseline.json` 里 ui-ge-api.js 有 12 处 P0（全为 P0-b「作者写过说明」）。
 * 本片消解 11 处，**保留 1 处**（`:63` 的 `JSON.parse` → 旧明文回落）：那条不是吞错，而是**迁移路径本身** ——
 * 密文改造前的所有 token 都是明文，解析失败按明文读才是正确行为，报诊断只会在每次启动时刷噪音。
 *
 * 与 slice3 的分工：slice3 钉的是 apiDeleteDevice / apiDeleteSchedule 这类"失败后谎报成功"；
 * 本片钉的是 slice3 当时判定为"合理降级"的**加载面静默** —— 这次重新定性，理由只有一条：
 *   **空列表会被读成"没有设备 / 没有提醒"，而真相是"没连上"—— 这是相反结论，不是体验瑕疵。**
 * 因此设备/提醒两个列表在失败时写一行"加载失败"，其余（资料/偏好/集成/语言/登出）补诊断留痕。
 *
 * 🔴 每条断言的都是外部可见结果 + **控制流不变**（原先静默继续的，改后依然继续）：
 *   ① 设备/提醒列表拉失败 ⇒ 面板出现"加载失败"，且诊断点名是哪个列表；
 *   ② 资料/偏好/集成拉失败 ⇒ 三条诊断都在（用户仍看得见旧值，但账上必须留痕）；
 *   ③ token 存储读抛错 ⇒ 诊断点名不可读，且启动照常按"未登录"走完（不抛、不卡）；
 *   ④ 语言持久化抛错 ⇒ 内存切换**照旧生效**（消解不得改成"失败就拒绝切换"）；
 *   ⑤ 登出时服务端调用 reject ⇒ 本机凭据照旧清掉，但必须留痕"服务端会话可能仍活着"；
 *   ⑥ 反向对照：一切正常 ⇒ 一条失败诊断都不许有（防止把"永远报失败"当成可观测）。
 *
 * ⚠️ 环境坑（沿用 slice3 的三条结论）：登录态必须在脚本执行前经 `loadApp({storage})` 注入；
 *    必须 mock **`fetch`**（渲染函数调的是 IIFE 闭包内的局部函数，改 window 引用无效）；
 *    `apiFetch` 已把 `{ok,data}` 包好，mock 的 `json()` 直接给业务体。
 *
 * 运行：npm run test:local -- tests/empty-catch-slice13.test.js
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

let win, diagCalls;
const orig = {};

function installProbes() {
  diagCalls = [];
  const origDiag = win.pushDiag;
  win.pushDiag = function (level, msg, ctx) {
    diagCalls.push({ level, msg: String(msg), ctx });
    return origDiag && origDiag.apply(win, arguments);
  };
}

function loginStorage() {
  return {
    wb_access_token: "test-access-token",
    // apiLogout 的服务端调用被 `if(_refreshToken)` 门控 —— 只给 access 的话那条分支根本不走，
    // ⑤ 会退化成"没发请求所以没诊断"的空转（首版就踩在这里）。
    wb_refresh_token: "test-refresh-token",
    wb_token_expiry: String(Date.now() + 3600 * 1000)
  };
}

/**
 * @param {{failLoads?:boolean}} opt failLoads ⇒ 所有 API 请求抛错（模拟离线 / 后端未起）
 *   注意：真实形态就是 fetch 抛 TypeError（DNS/拒绝连接在浏览器里不可分辨），不是伪造状态码。
 */
function mockFetch(opt) {
  opt = opt || {};
  win.fetch = async function (url, opts) {
    if (opt.failLoads) throw new TypeError("Failed to fetch");
    const u = String(url);
    if (/\/api\/auth\/devices$/.test(u)) {
      return { ok: true, status: 200, json: async () => ({ devices: [{ id: "dev-1", deviceName: "测试设备", lastSeen: "2026-10-27" }] }) };
    }
    if (/\/api\/notifications\/schedules$/.test(u)) {
      return { ok: true, status: 200, json: async () => ({ schedules: [{ id: "sch-1", type: "提醒", cron: "0 9 * * *" }] }) };
    }
    if (/\/api\/auth\/profile$/.test(u)) {
      return { ok: true, status: 200, json: async () => ({ user: { name: "测试用户", email: "a@b.c" } }) };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  };
}

async function loadPanels() {
  await win._loadApiPanels();
  await new Promise((r) => setTimeout(r, 200)); // 内部是 fire-and-forget，不等就会拿到空 DOM
}

const hasDiag = (re) => diagCalls.find((d) => re.test(d.msg));

beforeEach(async () => {
  win = loadApp({ storage: loginStorage() });
  await new Promise((r) => setTimeout(r, 60));
  orig.setItem = win.Storage.prototype.setItem;
  orig.getItem = win.Storage.prototype.getItem;
  installProbes();
});

afterEach(() => {
  win.Storage.prototype.setItem = orig.setItem;
  win.Storage.prototype.getItem = orig.getItem;
  try { win.close(); } catch (_e) { /* jsdom 关闭失败不影响断言 */ }
});

describe("① 列表类：失败必须写成「加载失败」，不许留成空列表", () => {
  it("设备列表拉失败 → 容器出现「加载失败」且诊断点名 _loadDeviceList", async () => {
    mockFetch({ failLoads: true });
    await loadPanels();
    const el = win.document.getElementById("apiDeviceList");
    expect(el.textContent, "空列表会被读成「这个账号下没有设备」").toContain("加载失败");
    const hit = hasDiag(/device list load failed/i);
    expect(hit, "诊断必须留痕").toBeTruthy();
    expect(hit.ctx && hit.ctx.where).toBe("_loadDeviceList");
  });

  it("定时提醒拉失败 → 同样写「加载失败」并点名 _loadSchedules", async () => {
    mockFetch({ failLoads: true });
    await loadPanels();
    const el = win.document.getElementById("apiScheduleList");
    expect(el.textContent).toContain("加载失败");
    const hit = hasDiag(/schedule list load failed/i);
    expect(hit.ctx && hit.ctx.where).toBe("_loadSchedules");
  });
});

describe("② 其余加载面：值可以留在旧值，但账上必须留痕", () => {
  it("资料 / 通知偏好 / 集成 三条诊断齐全", async () => {
    mockFetch({ failLoads: true });
    await loadPanels();
    expect(hasDiag(/profile load failed/i), "账号面板停在旧值/空值，用户分不清是没数据还是没连上").toBeTruthy();
    expect(hasDiag(/notify prefs load failed/i), "勾选框留在 HTML 默认值 —— 与账号真实偏好可能相反").toBeTruthy();
    expect(hasDiag(/integrations load failed/i), "全部显示未连接，而真值可能是已授权").toBeTruthy();
  });
});

describe("③ token 存储读不出来：降级成「未登录」可以，但必须留痕", () => {
  it("getItem 对 token 键抛错 → 诊断点名 store unreadable，且启动照常按未登录走完", async () => {
    win.Storage.prototype.getItem = function (k) {
      if (String(k).includes("token")) throw new win.DOMException("SecurityError", "SecurityError");
      return orig.getItem.call(this, k);
    };
    win.__test.initApiClient();          // 同一条代码路径，二次触发（水合发生在启动时，事后 patch 赶不上）
    await new Promise((r) => setTimeout(r, 120));
    const hit = hasDiag(/token store unreadable/i);
    expect(hit, "「读不出来」与「真没登录」是两件事，必须可查").toBeTruthy();
    expect(hit.ctx && hit.ctx.where).toBe("_restoreTokens");
    expect(win.__test.isApiLoggedIn(), "控制流不变：依旧降级为未登录，不抛不卡").toBe(false);
  });
});

describe("④⑤ 持久化与登出：消解只加留痕，不改判定", () => {
  it("语言持久化抛错 → 留痕，且内存切换照旧生效（不得改成「失败就拒绝切换」）", () => {
    win.Storage.prototype.setItem = function (k, v) {
      if (String(k).includes("lang")) throw new win.DOMException("QuotaExceededError", "QuotaExceededError");
      return orig.setItem.call(this, k, v);
    };
    const okResult = win.__test.setLang("en");
    expect(okResult, "持久化失败不影响内存切换 —— 这条原有语义必须保住").toBe(true);
    expect(win.__test.getLang()).toBe("en");
    const hit = hasDiag(/lang persist failed/i);
    expect(hit, "但刷新后会回到旧语言，用户会以为切换没生效").toBeTruthy();
    expect(hit.ctx && hit.ctx.where).toBe("setLang");
  });

  it("登出时服务端 reject → 本机凭据照旧清掉，并留痕「服务端会话可能仍活着」", async () => {
    mockFetch({ failLoads: true });
    await win.apiLogout();
    await new Promise((r) => setTimeout(r, 80));
    expect(win.__test.isApiLoggedIn(), "本机必须仍然登出（控制流不变）").toBe(false);
    const hit = hasDiag(/server logout not executed/i);
    expect(hit, "否则「已登出」这句话在本机成立、在服务端不成立").toBeTruthy();
    expect(hit.ctx && hit.ctx.where).toBe("apiLogout");
  });
});

describe("⑥ 反向对照：一切正常时一条失败诊断都不许有", () => {
  it("全部成功 → 列表真渲染出行，且没有 load failed / persist failed 诊断", async () => {
    mockFetch({});
    await loadPanels();
    expect(win.document.querySelectorAll("#apiDeviceList .api-device-row").length,
      "成功路径必须照常渲染（否则「加载失败」会永远盖住真数据）").toBeGreaterThan(0);
    expect(win.document.getElementById("apiDeviceList").textContent).not.toContain("加载失败");
    expect(diagCalls.filter((d) => /load failed|store unreadable|persist failed/i.test(d.msg)),
      "happy path 不得产生噪音诊断").toEqual([]);
  });
});

/* --------------------------------------------------------------------------
 * ⑦ 本批真踩过的坑（首版实现把它带了出来）：
 *   失败上报路径**自己**再抛错时，会把"被吞掉的错误"升级成"未处理拒绝" ——
 *   真机形态是 jsdom/页面销毁后 `document` 已不可用，而 fire-and-forget 的加载器还在飞。
 *   首版 `catch(e){ pushDiag… ; document.getElementById(...).textContent = … }` 就是这样的：
 *   实测在 tests/empty-catch-slice3.test.js 里造出 5 条 Unhandled Rejection（用例全过但 npm test 退 1）。
 *   现在整段留痕动作被二次保护包住：本用例跑通的判据是"没有未处理拒绝冒出"，
 *   并且诊断确实记到了（证明失败路径真的被执行过，不是空转）。
 * -------------------------------------------------------------------------- */
describe("⑦ 留痕动作自身抛错 ⇒ 必须被二次保护吸收，不得变成未处理拒绝", () => {
  it("document 在失败回调里不可用 → 诊断仍记账，且不冒出未处理拒绝", async () => {
    mockFetch({ failLoads: true });
    const origGet = win.document.getElementById;
    /* 只让目标容器查不到（模拟"页面已销毁/节点不存在"），其余 id 照常 ——
       首版把 getElementById 整体改成必抛，结果连 _updateUserButton 都被打断，
       用例红在无关路径上（那是探针错，不是产品错）。 */
    win.document.getElementById = function (id) {
      if(String(id) === "apiDeviceList" || String(id) === "apiScheduleList") throw new Error("document is gone");
      return origGet.call(this, id);
    };
    try {
      await win._loadApiPanels();
      await new Promise((r) => setTimeout(r, 200));
    } finally {
      win.document.getElementById = origGet;
    }
    expect(hasDiag(/device list load failed/i),
      "上报顺序必须是先记账再写界面 —— 界面写不动也不能丢掉这条痕").toBeTruthy();
  });
});
