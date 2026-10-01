import { describe, it, expect } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

/**
 * linear-push.test.js —— Linear「任务单向推送」消费点（v3.7.70）
 *
 * 与 Notion 同款形状（共用 `_intPushEach` 记账骨架），但 Linear 有两处**它独有**的坑，
 * 所以单独一组用例而不是复制粘贴：
 *   ① GraphQL 的失败是 **HTTP 200 + `errors[]`** —— 只看 resp.ok 会把失败当成功；
 *   ② 状态字段是 `stateId`（ID）而不是状态名。本轮**故意不带状态**（没有可验证的工作区
 *      来把状态名映射成 ID），所以这里要反过来钉住"请求里不许出现 state/stateId"，
 *      防止有人又把手边的状态名塞进去。
 */
function freshWin() {
  const win = loadApp();
  win.localStorage.clear();
  return win;
}

/** Linear 是 GraphQL：按 body.query 分派响应；返回 recorded 请求列表 */
function stubLinear(win, respond) {
  const calls = [];
  win.integrationSetHttpClient(async (url, opts) => {
    const body = opts && opts.body ? JSON.parse(opts.body) : {};
    const rec = { url: String(url), method: (opts && opts.method) || "GET", query: body.query || "", variables: body.variables || {}, headers: (opts && opts.headers) || {} };
    calls.push(rec);
    const out = respond ? respond(rec) : { status: 200, body: { data: { issueCreate: { success: true, issue: { id: "issue-1" } } } } };
    return { ok: out.status === 200, status: out.status, body: out.body, json: async () => out.body };
  });
  return calls;
}

const T = (id, title) => ({ id: id, sc: "office", title: title, status: "todo", due: "", priority: "", doneAt: null, note: "备注内容", tags: [], created: Date.now() });

async function connected(win, respond) {
  /* 默认响应必须**按 mutation 名分派**：只造 issueCreate 的话，更新走 issueUpdate 时
     拿不到对应节点会被判失败 —— 那不是被测代码的锅，是替身不真实。 */
  const defaultRespond = (r) => {
    if (r.query.indexOf("viewer") >= 0) return { status: 200, body: { data: { viewer: { id: "u1" } } } };
    if (r.query.indexOf("issueUpdate") >= 0) return { status: 200, body: { data: { issueUpdate: { success: true, issue: { id: r.variables.id } } } } };
    return { status: 200, body: { data: { issueCreate: { success: true, issue: { id: "issue-1" } } } } };
  };
  const calls = stubLinear(win, respond || defaultRespond);
  const prov = await win.linearConnect({ token: "lin_api_test", teamId: "team-1" });
  expect(prov, "前提：Linear 已连接").toBeTruthy();
  calls.length = 0;
  return calls;
}

describe("Linear 单向推送", () => {
  it("建 issue：issueCreate + teamId/title，且**不带状态**（stateId 映射未接线）", async () => {
    const win = freshWin();
    const calls = await connected(win);
    const r = await win.linearPushTasks([T("t1", "写周报")]);
    expect(r.ok).toBe(true);
    expect(r.created).toBe(1);
    expect(calls.length).toBe(1);
    expect(calls[0].url).toBe("https://api.linear.app/graphql");
    expect(calls[0].query).toMatch(/issueCreate/);
    expect(calls[0].variables.input.teamId).toBe("team-1");
    expect(calls[0].variables.input.title).toBe("写周报");
    const inputKeys = Object.keys(calls[0].variables.input);
    expect(inputKeys, "不许再塞状态名（Linear 要的是 stateId，名字会被 schema 拒）：" + inputKeys.join(",")).not.toContain("state");
    expect(inputKeys).not.toContain("stateId");
    expect(calls[0].headers.Authorization).toBe("Bearer lin_api_test");
  });

  it("已推送过的再推 → issueUpdate(id)，按 updated 计数", async () => {
    const win = freshWin();
    const calls = await connected(win);
    const first = await win.linearPushTasks([T("t1", "写周报")]);
    expect(first.created).toBe(1);
    calls.length = 0;
    const second = await win.linearPushTasks([T("t1", "写周报（改）")]);
    expect(second.created).toBe(0);
    expect(second.updated).toBe(1);
    expect(calls[0].query).toMatch(/issueUpdate/);
    expect(calls[0].variables.id, "更新要打回第一次创建的那个 issue").toBe("issue-1");
  });

  /* 🔴 这条是本文件存在的核心理由：GraphQL 用 HTTP 200 返回业务错误。 */
  it("GraphQL errors[]（HTTP 200）：必须判失败并把平台给的原因带出来", async () => {
    const win = freshWin();
    const calls = await connected(win, (r) => (r.query.indexOf("viewer") >= 0
      ? { status: 200, body: { data: { viewer: { id: "u1" } } } }
      : { status: 200, body: { errors: [{ message: "Argument 'state' is not defined by type IssueCreateInput." }] } }));
    const r = await win.linearPushTasks([T("t1", "写周报")]);
    expect(r.ok, "HTTP 200 但 GraphQL 报错，不能当成功").toBe(false);
    expect(r.created).toBe(0);
    expect(r.failed.length).toBe(1);
    expect(r.failed[0].error, "平台给的原因必须带出来：" + r.failed[0].error).toMatch(/not defined by type IssueCreateInput/);
    expect(calls.length).toBe(1);
  });

  it("success=false（无 errors[]）同样判失败，不许静默成功", async () => {
    const win = freshWin();
    await connected(win, (r) => (r.query.indexOf("viewer") >= 0
      ? { status: 200, body: { data: { viewer: { id: "u1" } } } }
      : { status: 200, body: { data: { issueCreate: { success: false, issue: null } } } }));
    const r = await win.linearPushTasks([T("t1", "写周报")]);
    expect(r.ok).toBe(false);
    expect(r.failed[0].error).toBeTruthy();
  });

  it("HTTP 层面失败（401）：判失败且不发第二次", async () => {
    const win = freshWin();
    const calls = await connected(win, (r) => (r.query.indexOf("viewer") >= 0
      ? { status: 200, body: { data: { viewer: { id: "u1" } } } }
      : { status: 401, body: { errors: [{ message: "Authentication required" }] } }));
    const r = await win.linearPushTasks([T("t1", "写周报")]);
    expect(r.ok).toBe(false);
    expect(calls.length).toBe(1);
    expect(r.failed[0].error).toMatch(/Authentication required|HTTP 401/);
  });

  it("没填 Team ID：建 issue 时如实失败，零请求（不许静默建到别处）", async () => {
    const win = freshWin();
    const calls = stubLinear(win, (r) => (r.query.indexOf("viewer") >= 0
      ? { status: 200, body: { data: { viewer: { id: "u1" } } } }
      : { status: 200, body: {} }));
    await win.linearConnect({ token: "lin_api_test" });   /* 故意不给 teamId */
    calls.length = 0;
    const r = await win.linearPushTasks([T("t1", "写周报")]);
    expect(r.ok).toBe(false);
    expect(r.failed[0].error).toBe("missing_team_id");
    expect(calls.length).toBe(0);
  });

  it("未连接：provider_not_available 且零请求", async () => {
    const win = freshWin();
    const calls = stubLinear(win);
    calls.length = 0;
    const r = await win.linearPushTasks([T("t1", "x")]);
    expect(r.error).toBe("provider_not_available");
    expect(calls.length).toBe(0);
  });

  it("部分失败如实报（与 Notion 共用 _intPushEach 骨架，这里锁 Linear 这一侧）", async () => {
    const win = freshWin();
    await connected(win, (r) => {
      if (r.query.indexOf("viewer") >= 0) return { status: 200, body: { data: { viewer: { id: "u1" } } } };
      const bad = r.variables.input && r.variables.input.title === "会被拒";
      return { status: 200, body: bad ? { errors: [{ message: "Title too long" }] } : { data: { issueCreate: { success: true, issue: { id: "ok-" + Math.random().toString(36).slice(2, 6) } } } } };
    });
    const r = await win.linearPushTasks([T("t1", "正常一"), T("t2", "会被拒"), T("t3", "正常二")]);
    expect(r.ok).toBe(false);
    expect(r.created).toBe(2);
    expect(r.failed.length).toBe(1);
    expect(r.failed[0].title).toBe("会被拒");
    expect(r.failed[0].error).toMatch(/Title too long/);
  });
});

describe("Linear 推送：面板入口（函数正确 ≠ 被接线）", () => {
  it("连接后出现 [data-int-push=linear]，未连接时没有", async () => {
    const win = freshWin();
    stubLinear(win);
    win.renderIntegrationPanel();
    expect(win.document.querySelector('[data-int-push="linear"]'), "未连接不该有入口").toBeNull();
    await win.linearConnect({ token: "lin_api_test", teamId: "team-1" });
    win.renderIntegrationPanel();
    const btn = win.document.querySelector('[data-int-push="linear"]');
    expect(btn, "连接后必须出现推送入口").toBeTruthy();
    expect(btn.textContent).toContain("推送");
  });
});
