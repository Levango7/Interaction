/**
 * schedule-pause-ui.test.js —— 定时提醒「暂停/恢复 + 下次触发时间」（2026-11-26 批）
 * ----------------------------------------------------------------------------
 * 缺口：服务端 PUT /schedules/:id 早已支持 enabled（调度器扫 enabled && when<=now），
 * 但面板行只有「删除」——用户想暂停一个提醒只能删了重建；且创建后看不到「下次什么时候响」。
 * 本批：行渲染补下次触发时间/暂停态灰化，新增暂停/恢复按钮（apiUpdateSchedule enabled）。
 * 边界：编辑 cron 不在本批（表单只有 type+cron 的既有形态不动）。
 *
 * 钉子（外部可见结果 + 控制流）：
 *   ① 渲染：启用行显示「下次：…」与「暂停」；暂停行灰化（is-paused）+「已暂停」+「恢复」；
 *   ② 旧形状兼容：无 enabled/when 字段的记录 = 启用（与调度器缺省一致），meta 精确等于 cron；
 *   ③ 暂停：点击后 PUT body {enabled:false}，列表重载后行翻为暂停态；
 *   ④ 恢复：对称，body {enabled:true}，行翻回启用态；
 *   ⑤ 失败：PUT 抛网络错 ⇒ toast「操作失败」+ 诊断留痕 + 状态不被本地假翻（行仍启用）。
 *
 * 环境坑（沿用 empty-catch-slice13 三条结论）：登录态 loadApp({storage}) 注入；
 * 必须 mock fetch（IIFE 闭包内局部函数，改 window 引用无效）；json() 直接给业务体。
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

let win, puts, schedState, failPut, diagCalls, toastCalls;
const orig = {};

function loginStorage() {
  /* jsdom 假凭据：仅为通过登录门控，非真实密钥（同 empty-catch-slice13 的用途）。 */
  const fake = (name) => ["test", name, "token"].join("-");
  return {
    wb_access_token: fake("access"),
    wb_refresh_token: fake("refresh"),
    wb_token_expiry: String(Date.now() + 3600 * 1000),
  };
}

function installProbes() {
  const d = [];
  diagCalls = d;
  const origDiag = win.pushDiag;
  win.pushDiag = function (level, msg, ctx) {
    d.push({ level, msg: String(msg), ctx });
    return origDiag && origDiag.apply(win, arguments);
  };
  const tc = [];
  toastCalls = tc;
  const origToast = win.toast;
  win.toast = function (msg, kind) {
    tc.push({ msg: String(msg), kind });
    return origToast && origToast.apply(win, arguments);
  };
}

function mockFetch() {
  /* 捕获数组绑在本次安装上（probe-binding 判据：窗口包装里 push 的必须是局部量，
     否则上一窗口 fire-and-forget 的迟到条目会写进下一用例的数组） */
  const p = [];
  puts = p;
  win.fetch = async function (url, opts) {
    const u = String(url);
    const method = (opts && opts.method) || "GET";
    if (/\/api\/notifications\/schedules\/[^/]+$/.test(u) && method === "PUT") {
      if (failPut) throw new TypeError("Failed to fetch");
      const id = u.match(/schedules\/([^/]+)$/)[1];
      const body = JSON.parse(opts.body);
      p.push({ id, body });
      schedState[id] = Object.assign({}, schedState[id], body);
      return { ok: true, status: 200, json: async () => ({ schedule: schedState[id] }) };
    }
    if (/\/api\/notifications\/schedules$/.test(u)) {
      return { ok: true, status: 200, json: async () => ({ schedules: Object.keys(schedState).map((k) => schedState[k]) }) };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  };
}

async function loadPanels() {
  await win._loadApiPanels();
  await new Promise((r) => setTimeout(r, 250)); // 内部 fire-and-forget，不等会拿到空 DOM
}

const rows = () => [...win.document.querySelectorAll("#apiScheduleList .api-schedule-row")];
const rowBtn = (row, label) => [...row.querySelectorAll("button")].find((b) => b.textContent === label);

beforeEach(async () => {
  puts = [];
  failPut = false;
  schedState = {
    "sch-on": { id: "sch-on", type: "taskDue", cron: "0 9 * * *", enabled: true, when: 1893456000000 },
    "sch-off": { id: "sch-off", type: "dailyDigest", cron: "0 8 * * *", enabled: false, when: null },
  };
  win = loadApp({ storage: loginStorage() });
  await new Promise((r) => setTimeout(r, 60));
  orig.setItem = win.Storage.prototype.setItem;
  orig.getItem = win.Storage.prototype.getItem;
  installProbes();
  mockFetch();
});

afterEach(() => {
  win.Storage.prototype.setItem = orig.setItem;
  win.Storage.prototype.getItem = orig.getItem;
  try { win.close(); } catch (_e) { /* jsdom 关闭失败不影响断言 */ }
});

describe("定时提醒暂停/恢复与下次触发显示", () => {
  it("① 渲染：启用行显示下次触发+「暂停」；暂停行灰化+「已暂停」+「恢复」", async () => {
    await loadPanels();
    const rs = rows();
    expect(rs.length).toBe(2);
    expect(rs[0].querySelector(".api-device-meta").textContent).toContain("下次：");
    expect(rowBtn(rs[0], "暂停"), "启用行应有「暂停」按钮").toBeTruthy();
    expect(rs[1].className).toContain("is-paused");
    expect(rs[1].querySelector(".api-device-meta").textContent).toContain("已暂停");
    expect(rowBtn(rs[1], "恢复"), "暂停行应有「恢复」按钮").toBeTruthy();
  });

  it("② 旧形状兼容：无 enabled/when 字段 = 启用，meta 精确等于 cron", async () => {
    schedState = { "sch-old": { id: "sch-old", type: "taskDue", cron: "0 9 * * *" } };
    await loadPanels();
    const rs = rows();
    expect(rs.length).toBe(1);
    expect(rs[0].querySelector(".api-device-meta").textContent).toBe("0 9 * * *");
    expect(rs[0].className).not.toContain("is-paused");
    expect(rowBtn(rs[0], "暂停")).toBeTruthy();
  });

  it("③ 暂停：PUT body {enabled:false}，重载后行翻为暂停态", async () => {
    schedState = { "sch-on": schedState["sch-on"] };
    await loadPanels();
    rowBtn(rows()[0], "暂停").click();
    await new Promise((r) => setTimeout(r, 350));
    expect(puts.length).toBe(1);
    expect(puts[0].id).toBe("sch-on");
    expect(puts[0].body).toEqual({ enabled: false });
    const rs = rows();
    expect(rs[0].className).toContain("is-paused");
    expect(rowBtn(rs[0], "恢复"), "重载后应变为「恢复」").toBeTruthy();
  });

  it("④ 恢复：PUT body {enabled:true}，重载后行翻回启用态", async () => {
    schedState = { "sch-off": schedState["sch-off"] };
    await loadPanels();
    rowBtn(rows()[0], "恢复").click();
    await new Promise((r) => setTimeout(r, 350));
    expect(puts.length).toBe(1);
    expect(puts[0].body).toEqual({ enabled: true });
    const rs = rows();
    expect(rs[0].className).not.toContain("is-paused");
    expect(rowBtn(rs[0], "暂停"), "重载后应变为「暂停」").toBeTruthy();
  });

  it("⑤ 失败：toast「操作失败」+ 诊断留痕 + 状态不被本地假翻", async () => {
    schedState = { "sch-on": schedState["sch-on"] };
    failPut = true;
    await loadPanels();
    rowBtn(rows()[0], "暂停").click();
    await new Promise((r) => setTimeout(r, 350));
    expect(puts.length, "PUT 在网络层就失败，不应有载荷落账").toBe(0);
    expect(diagCalls.some((d) => /toggle schedule failed/i.test(d.msg)), "失败必须留痕").toBe(true);
    expect(toastCalls.some((x) => x.msg.includes("操作失败")), "失败必须可见（与成功 toast 对称）").toBe(true);
    const rs = rows();
    expect(rs[0].className, "状态未被本地假翻：仍是启用态").not.toContain("is-paused");
  });
});
