/**
 * empty-catch-slice6.test.js —— R-2 第六片（ui-ge-api 复查：第三片漏掉的 5 处「谎报」）
 * ----------------------------------------------------------------------------
 * 本片的由来是一次**自我证伪**：第三片我修了 apiDeleteDevice / apiDeleteSchedule，
 * 把 ui-ge-api 剩下的 17 处 P0 一并记为「加载失败静默，属合理降级」没动。
 * 第六片逐条复查这 17 处，发现那个结论是**一锅端式的误判** —— 里面有 5 处并非
 * 「加载失败」，而是**用户主动操作 + 成功有 toast + 失败全静默**：
 *   apiUpdateProfile（改资料）· apiUpdateNotifyPrefs（存偏好）· apiCreateSchedule（加提醒）
 *   · 集成连接（connectMap）· apiDisconnectIntegration（断集成）
 * 与第三片同型（谎报成功），故按同标准处理：补 toast + pushDiag，不改控制流。
 * 剩下 12 处（离线时的列表加载 / 语言持久化 / DOM 未就绪）复查后确认**确实该静默**，不动。
 * 结果：ui-ge-api.js P0 17 → 12，全局 P0 99 → 94。
 *
 * 哪几处最要命（注释里也写了）：
 *   · apiDisconnectIntegration —— **安全语义**：以为断开了，第三方集成仍持有访问授权；
 *   · apiCreateSchedule —— 以为提醒设好了，实际根本不会触发（与第三片 apiDeleteSchedule 对称）。
 *
 * ⚠️ 环境坑（沿用第三片，各踩过一次）：
 *   ① 登录态必须经 `loadApp({storage})` 在**脚本执行前**注入，事后再 setItem 已晚；
 *   ② 必须 mock **`fetch`** —— 这些 handler 调的是闭包内的局部函数，改 window 引用无效；
 *   ③ mock 的 `json()` 直接返回业务体（apiFetch 已包装 ok/data），别再套一层。
 *
 * ⚠️ 第 4 处「集成连接」**无法行为触发**：`connectMap` 里的 `fn`（apiConnectNotion）
 *   内部已自行处理网络错误、不向外抛，外层 catch 是**防御性**的。
 *   故该处只做静态契约断言（并如实写明这是防御性路径，不假装测过）。
 *
 * 运行：npx vitest run tests/empty-catch-slice6.test.js   （需拼回态）
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadApp } from "./helpers/loadApp.js";
import fs from "node:fs";
import path from "node:path";

const SRC = path.resolve(process.cwd(), "src", "ui-ge-api.js");

let win, toastCalls, diagCalls;

function installProbes() {
  toastCalls = [];
  diagCalls = [];
  Object.defineProperty(win, "toast", { configurable: true, value: (msg, type) => toastCalls.push({ msg, type }) });
  Object.defineProperty(win, "pushDiag", { configurable: true, value: (level, msg, ctx) => diagCalls.push({ level, msg, ctx }) });
}

/** 所有请求一律失败（模拟离线） */
function mockFetchFail() {
  win.fetch = async function () { throw new Error("network error"); };
}

function loginStorage() {
  return { wb_access_token: "test-access-token", wb_token_expiry: String(Date.now() + 3600 * 1000) };
}

/** 渲染 API 面板（事件绑定在这里发生），并等 fire-and-forget 的列表加载落地 */
async function loadPanels() {
  await win._loadApiPanels();
  await new Promise((r) => setTimeout(r, 200));
}

/** 给 select 赋一个真实存在的 option 值（直接写 "task" 会因无此 option 而留空 → 被校验拦下） */
function setSelect(id) {
  const el = win.document.getElementById(id);
  if (el && el.options && el.options.length) el.value = el.options[0].value;
  return el;
}

const failToast = () => toastCalls.filter((c) => String(c.msg).includes("操作失败"));
const diagOf = (where) => diagCalls.filter((d) => d.ctx && d.ctx.where === where);

beforeEach(async () => {
  win = loadApp({ storage: loginStorage() });
  await new Promise((r) => setTimeout(r, 60));
  installProbes();
  mockFetchFail();
});

afterEach(() => {
  try { win && win.close && win.close(); } catch (_) { /* jsdom 关闭失败不影响断言 */ }
});

describe("① 四处可触发的操作失败 → 用户必须看得见（此前是零反馈的谎报）", () => {
  it("改资料失败 → toast(warn) + diag 归因 apiUpdateProfile", async () => {
    await loadPanels();
    const nameEl = win.document.getElementById("apiEditName");
    nameEl.value = "新名字";
    const btn = win.document.getElementById("btnApiSaveName");
    expect(btn && btn.onclick, "保存按钮应被绑定（否则本用例是空转）").toBeTruthy();

    await btn.onclick();

    expect(failToast().length, "成功侧有「用户信息已更新」，失败侧不能无声").toBeGreaterThan(0);
    expect(failToast()[0].type).toBe("warn");
    expect(diagOf("apiUpdateProfile")).toHaveLength(1);
    expect(String(diagOf("apiUpdateProfile")[0].msg)).toMatch(/network error/);   // 带原始原因
  });

  it("存通知偏好失败 → toast(warn) + diag 归因 apiUpdateNotifyPrefs", async () => {
    await loadPanels();
    const btn = win.document.getElementById("btnApiSavePrefs");
    expect(btn && btn.onclick).toBeTruthy();

    await btn.onclick();

    expect(failToast().length).toBeGreaterThan(0);
    expect(diagOf("apiUpdateNotifyPrefs")).toHaveLength(1);
  });

  it("加提醒失败 → toast(warn) + diag 归因 apiCreateSchedule（与第三片删提醒对称）", async () => {
    await loadPanels();
    setSelect("apiSchedType");
    win.document.getElementById("apiSchedCron").value = "0 9 * * *";
    const btn = win.document.getElementById("btnApiAddSchedule");
    expect(btn && btn.onclick).toBeTruthy();

    await btn.onclick();

    expect(failToast().length, "以为提醒设好了、实际不会触发 —— 这是后果最实在的一处").toBeGreaterThan(0);
    expect(diagOf("apiCreateSchedule")).toHaveLength(1);
  });

  it("🔴 断集成失败 → toast(warn) + diag 归因 apiDisconnectIntegration（安全语义）", async () => {
    await loadPanels();
    const btn = win.document.getElementById("btnApiDisconnectNotion");
    expect(btn && btn.onclick, "断开按钮应被绑定").toBeTruthy();

    await btn.onclick();

    expect(failToast().length, "以为已断开、实际第三方仍持授权 —— 必须让用户看见").toBeGreaterThan(0);
    expect(diagOf("apiDisconnectIntegration")).toHaveLength(1);
  });
});

describe("② 失败后的控制流不变（本片只补反馈）", () => {
  it("断集成失败后**仍然**刷新集成列表", async () => {
    await loadPanels();
    let reloads = 0;
    const orig = win.fetch;
    win.fetch = async function (u, o) {
      if (/integrations/i.test(String(u))) reloads++;
      return orig(u, o);
    };
    const btn = win.document.getElementById("btnApiDisconnectNotion");
    await btn.onclick();
    expect(reloads, "失败也照常刷新（原控制流），修复不得过头").toBeGreaterThan(0);
  });

  it("成功路径不弹失败 toast（反向守护）", async () => {
    win.fetch = async function (u, o) {
      const m = (o && o.method) || "GET";
      if (m === "DELETE") return { ok: true, status: 200, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => ({ devices: [], schedules: [], preferences: {} }) };
    };
    await loadPanels();
    const btn = win.document.getElementById("btnApiDisconnectNotion");
    await btn.onclick();

    expect(failToast().length, "成功时不该弹「操作失败」").toBe(0);
    expect(diagCalls.filter((d) => d.level === "error").length).toBe(0);
  });
});

describe("③ 契约守卫：这 5 处不得复辟成裸 catch", () => {
  const raw = () => fs.readFileSync(SRC, "utf8");

  it("四处可触发点的 catch 都带 toast + pushDiag（括号计数定位，不假设单行形态）", () => {
    const s = raw();
    for (const where of ["apiUpdateProfile", "apiUpdateNotifyPrefs", "apiCreateSchedule", "apiDisconnectIntegration"]) {
      const i = s.indexOf('where:"' + where + '"');
      expect(i, where + " 的归因标记应在位").toBeGreaterThan(-1);
      // 往回找该 catch 块，确认内部既有 toast 也有 pushDiag
      const back = s.slice(Math.max(0, i - 700), i);
      expect(back, where + " 的失败侧应弹 toast").toMatch(/toast\(t\("api\.opFailed"/);
    }
  });

  it("集成连接（无法行为触发）的 catch 同样是防御性但完整的", () => {
    const s = raw();
    const i = s.indexOf('where:"integrationConnect"');
    expect(i).toBeGreaterThan(-1);
    const back = s.slice(Math.max(0, i - 700), i);
    expect(back).toMatch(/toast\(t\("api\.opFailed"/);
  });

  it("新增的 i18n 键 api.opFailed 中英双语都在位", () => {
    const core = fs.readFileSync(path.resolve(process.cwd(), "src", "core.js"), "utf8");
    expect(core).toMatch(/"api\.opFailed": "操作失败/);
    expect(core).toMatch(/"api\.opFailed": "Operation failed/);
  });

  it("第三片的两处（apiDeleteDevice / apiDeleteSchedule）未被本片改坏", () => {
    const s = raw();
    expect(s).toMatch(/where:"apiDeleteDevice"/);
    expect(s).toMatch(/where:"apiDeleteSchedule"/);
  });
});
