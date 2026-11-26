/**
 * schedule-edit-cron-ui.test.js —— 定时提醒「编辑 cron」（2026-11-26 批，#22 边界闭合）
 * ----------------------------------------------------------------------------
 * 缺口：提醒能建/暂停/删除，但改一个触发时间只能删了重建。本批复用创建表单做编辑态：
 * 行「编辑」预填 type/cron → 按钮变「保存修改」（旁边出「取消」）→ PUT 只传 type+cron。
 * 钉子：
 *   ① 预填：点「编辑」后表单值对、按钮变「保存修改」、取消按钮可见；
 *   ② 保存：PUT body 精确等于 {type,cron}（**不含 enabled**——暂停的提醒改完仍是暂停），
 *      按钮复位「新增提醒」、列表重载显示新 cron；
 *   ③ 取消：按钮复位、零 PUT；
 *   ④ 失败：toast+诊断留痕且**保持编辑态**（可重试），按钮仍「保存修改」；
 *   ⑤ 暂停行编辑：body 不含 enabled，重载后行仍 is-paused（改 cron 不擅自启用）。
 * 环境坑同 schedule-pause-ui.test.js：登录态注入、mock fetch、json() 给业务体、
 * 捕获数组绑本次安装（probe-binding 判据）。
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

let win, puts, schedState, failPut, diagCalls, toastCalls;
const orig = {};

function loginStorage() {
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
  await new Promise((r) => setTimeout(r, 250));
}

const rows = () => [...win.document.querySelectorAll("#apiScheduleList .api-schedule-row")];
const rowBtn = (row, label) => [...row.querySelectorAll("button")].find((b) => b.textContent === label);
const addBtn = () => win.document.getElementById("btnApiAddSchedule");
const cancelBtn = () => win.document.getElementById("btnApiCancelEditSchedule");
const cronInput = () => win.document.getElementById("apiSchedCron");
const typeInput = () => win.document.getElementById("apiSchedType");

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

describe("定时提醒编辑 cron（表单编辑态）", () => {
  it("① 点「编辑」：表单预填 type/cron，按钮变「保存修改」，取消可见", async () => {
    await loadPanels();
    rowBtn(rows()[0], "编辑").click();
    expect(typeInput().value).toBe("taskDue");
    expect(cronInput().value).toBe("0 9 * * *");
    expect(addBtn().textContent).toBe("保存修改");
    expect(cancelBtn(), "编辑态应出现取消按钮").toBeTruthy();
    expect(cancelBtn().style.display).not.toBe("none");
  });

  it("② 保存：PUT 精确 {type,cron}（不含 enabled），按钮复位、列表显示新 cron", async () => {
    schedState = { "sch-on": schedState["sch-on"] };
    await loadPanels();
    rowBtn(rows()[0], "编辑").click();
    cronInput().value = "30 10 * * *";
    addBtn().click();
    await new Promise((r) => setTimeout(r, 350));
    expect(puts.length).toBe(1);
    expect(puts[0].id).toBe("sch-on");
    expect(puts[0].body, "只传 type+cron：不带 enabled（暂停语义不被编辑破坏）").toEqual({ type: "taskDue", cron: "30 10 * * *" });
    expect(addBtn().textContent).toBe("添加");
    expect(rows()[0].querySelector(".api-device-meta").textContent).toContain("30 10 * * *");
  });

  it("③ 取消：按钮复位、零 PUT", async () => {
    await loadPanels();
    rowBtn(rows()[0], "编辑").click();
    cancelBtn().click();
    expect(addBtn().textContent).toBe("添加");
    expect(cancelBtn().style.display).toBe("none");
    expect(puts.length).toBe(0);
  });

  it("④ 失败：toast+留痕且保持编辑态（可重试）", async () => {
    schedState = { "sch-on": schedState["sch-on"] };
    failPut = true;
    await loadPanels();
    rowBtn(rows()[0], "编辑").click();
    addBtn().click();
    await new Promise((r) => setTimeout(r, 350));
    expect(toastCalls.some((x) => x.msg.includes("操作失败"))).toBe(true);
    expect(diagCalls.some((d) => /update schedule failed/i.test(d.msg))).toBe(true);
    expect(addBtn().textContent, "失败不重置表单——用户改了一半的内容不能丢").toBe("保存修改");
    expect(puts.length).toBe(0);
  });

  it("⑤ 暂停行编辑：body 不含 enabled，重载后行仍 is-paused", async () => {
    schedState = { "sch-off": schedState["sch-off"] };
    await loadPanels();
    rowBtn(rows()[0], "编辑").click();
    cronInput().value = "15 7 * * *";
    addBtn().click();
    await new Promise((r) => setTimeout(r, 350));
    expect(puts.length).toBe(1);
    expect(puts[0].body, "编辑 cron 不擅自启用暂停的提醒").toEqual({ type: "dailyDigest", cron: "15 7 * * *" });
    expect(rows()[0].className).toContain("is-paused");
  });
});
