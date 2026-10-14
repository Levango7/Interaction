import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { loadApp } from "./helpers/loadApp.js";

/**
 * integration-auth-form.test.js —— Linear / Jira 的**凭据形态**（v3.7.94）
 *
 * 为什么单独一组用例：这两家一直连不通的**根因不是"没配凭据"，是"凭据发错了形状"**，
 * 而形状是跨进程重复手写的（渲染进程 6 处、主进程中继 1 处各拼一次 header）：
 *   · Linear 个人 API Key 必须**原样**发（官方 curl 就是把 key 直接放 Authorization 值上），
 *     `Bearer` 前缀只属于 OAuth token；本仓此前 5 处全发成 `Bearer lin_api_…`，真机恒
 *     401 AUTHENTICATION_ERROR。
 *   · Atlassian Cloud 是 `Basic base64(email:apiToken)`，`Bearer <PAT>` 只有 Server/DC 认；
 *     分界就是「有没有 email」，而配置面板此前**根本没有 email 字段** —— 用户没有正确形态可填。
 *
 * 三面都锁：① 渲染进程实际发出的 header；② 中继 IPC 载荷里 email 有没有被带过去
 * （漏一个调用点 = 那个功能仍然 401，而这正是此前反复出现的形态）；③ 主进程那份**同语义实现**
 * 与渲染侧输出逐条相等 —— 两侧分叉的症状是"浏览器版能连、桌面版连不上"，最难查的那类假象。
 * 全程走注入的假 HTTP / 假中继，**不发任何真实网络请求**。
 */
const MAIN_JS = path.resolve(process.cwd(), "electron", "main.js");
const CLOUD = { domain: "acme.atlassian.net", token: "api-token-123", email: "dev@acme.com", projectKey: "ACME" };

function freshWin() {
  const win = loadApp();
  win.localStorage.clear();
  return win;
}

/** 记录渲染进程发出的每个请求（含 GraphQL query，便于按 mutation 造真实响应） */
function spyHeaders(win, respond) {
  const calls = [];
  win.integrationSetHttpClient(async (url, opts) => {
    const headers = (opts && opts.headers) || {};
    let query = "";
    try { query = String(JSON.parse(opts.body || "{}").query || ""); } catch (e) { /* 非 GraphQL 请求 */ }
    const rec = { url: String(url), auth: String(headers.Authorization || headers.authorization || ""), query: query, variables: (function(){ try { return JSON.parse(opts.body || "{}").variables || {}; } catch (e) { return {}; } })() };
    calls.push(rec);
    const out = respond ? respond(rec) : { ok: true, body: { data: { viewer: { id: "u1" } } } };
    return { ok: out.ok !== false, status: out.status || 200, body: out.body || {}, json: async () => out.body };
  });
  return calls;
}

/** 假主进程中继：只记录载荷（断言 email 被带到每一跳），不真发请求 */
function relayStub(win) {
  const sent = [];
  win.electronAPI = {
    jiraFetch: (arg) => {
      sent.push(arg);
      return Promise.resolve({ ok: true, status: 200, body: { transitions: [], issues: [], projects: [] } });
    }
  };
  return sent;
}

/** Linear 的 GraphQL 响应要**按 query 分派**，否则替身不真实（失败的分支会被算成被测代码坏了） */
function linearRespond(rec) {
  if (rec.query.indexOf("viewer") >= 0) return { ok: true, body: { data: { viewer: { id: "u1" } } } };
  if (rec.query.indexOf("team(id: $id)") >= 0) return { ok: true, body: { data: { team: { id: "uuid-team-1" } } } };
  if (rec.query.indexOf("issueUpdate") >= 0) return { ok: true, body: { data: { issueUpdate: { success: true, issue: { id: rec.variables.id } } } } };
  if (rec.query.indexOf("issues(") >= 0) return { ok: true, body: { data: { issues: { nodes: [{ id: "i1", title: "T" }] } } } };
  return { ok: true, body: { data: { issueCreate: { success: true, issue: { id: "issue-1" } } } } };
}

/**
 * 从 electron/main.js 文本里**抠出**主进程那份 jiraAuthHeader。
 * 它是 app.whenReady 闭包内的箭头函数，require 不到；用文本抽取 + 注入 Buffer 求值，
 * 才能拿"真实实现"对比，而不是在测试里抄一份等价断言（抄的那份改了不会红）。
 */
function mainProcessHeaderBuilder() {
  const src = readFileSync(MAIN_JS, "utf8");
  const sig = "const jiraAuthHeader = (token, email) => {";
  const start = src.indexOf(sig);
  expect(start, "electron/main.js 里必须仍有 jiraAuthHeader（主进程凭据形态的唯一实现）").toBeGreaterThan(-1);
  const close = src.indexOf("\n    };", start);
  expect(close, "jiraAuthHeader 的函数体边界没找到（主进程改了缩进就得同步改本抽取逻辑）").toBeGreaterThan(start);
  /* 切到 "\n    }" 为止（把箭头函数的收尾大括号带进来），**不含**结尾的分号 */
  const arrow = src.slice(start + "const jiraAuthHeader = ".length, close + "\n    }".length);
  return new Function("Buffer", "return (" + arrow + ")")(Buffer);
}

describe("Linear：个人 API Key 原样发，不许叠 Bearer", () => {
  let win;
  beforeEach(() => { win = freshWin(); });

  it("验证连接时 Authorization 就是 key 本身", async () => {
    const calls = spyHeaders(win, linearRespond);
    const prov = await win.linearConnect({ token: "lin_api_TESTKEY", teamId: "" });
    expect(prov, "前提：连接成功").toBeTruthy();
    expect(calls.length, "至少发过一次验证请求").toBeGreaterThan(0);
    for (const c of calls) expect(c.auth, "Linear 个人 API Key 必须原样发").toBe("lin_api_TESTKEY");
  });

  it("用户从文档连 `Bearer ` 一起粘进来时剥掉前缀，而不是叠成 `Bearer Bearer …`", async () => {
    const calls = spyHeaders(win, linearRespond);
    await win.linearConnect({ token: "Bearer lin_api_TESTKEY", teamId: "" });
    expect(calls[0].auth).toBe("lin_api_TESTKEY");
  });

  it("列 issue 与推 issue 也是同一形态（每个调用点都得过 _linearAuthHeader）", async () => {
    const calls = spyHeaders(win, linearRespond);
    await win.linearConnect({ token: "Bearer lin_api_TESTKEY", teamId: "uuid-team-1" });
    await win.linearListIssues({});
    const res = await win.linearSyncIssue({ id: "t1", title: "推一条", description: "备注", status: "todo" }, "push");
    expect(res.success, "前提：推送这条真发出了请求：" + JSON.stringify(res)).toBe(true);
    expect(calls.length, "前提：三个调用点都发过请求").toBeGreaterThanOrEqual(3);
    for (const c of calls) expect(c.auth, "Linear 调用点里任何一处漏改都会在这里红：" + c.query.slice(0, 40)).toBe("lin_api_TESTKEY");
  });

  it("空凭据返回空串（不许拼出 `Bearer undefined`）", () => {
    expect(win._linearAuthHeader("")).toBe("");
    expect(win._linearAuthHeader(undefined)).toBe("");
  });
});

describe("Jira：Cloud 走 Basic(email:token)，Server/DC 走 Bearer(PAT)", () => {
  let win;
  beforeEach(() => { win = freshWin(); });

  it("渲染进程直连（无中继）时按 email 决定形态", async () => {
    const calls = spyHeaders(win);
    await win._jiraRequest(CLOUD.domain, "/rest/api/3/myself", { method: "GET", token: CLOUD.token, email: CLOUD.email });
    expect(calls[0].auth, "有 email = Cloud = Basic base64(email:token)")
      .toBe("Basic " + Buffer.from(CLOUD.email + ":" + CLOUD.token, "utf8").toString("base64"));
  });

  it("桌面形态：每一个调用点都把 email 带进中继载荷（漏一个点 = 那个功能仍然 401）", async () => {
    const sent = relayStub(win);
    const prov = await win.jiraConnect({ domain: CLOUD.domain, token: CLOUD.token, email: CLOUD.email, projectKey: CLOUD.projectKey });
    expect(prov, "前提：有中继才允许连 Jira").toBeTruthy();
    expect(sent[0].email, "验证请求要带 email").toBe(CLOUD.email);
    sent.length = 0;

    await win.jiraListIssues({ jql: "project = ACME" });
    expect(sent.length, "前提：listIssues 走了中继").toBeGreaterThan(0);
    expect(sent[sent.length - 1].email, "listIssues 漏传 email").toBe(CLOUD.email);
    sent.length = 0;

    const res = await win.jiraSyncIssue({ id: "t9", title: "推一条", description: "d", status: "todo" }, "push");
    expect(sent.length, "前提：syncIssue 走了中继（结果：" + JSON.stringify(res) + "）").toBeGreaterThan(0);
    for (const s of sent) expect(s.email, "创建每一条都得带 email").toBe(CLOUD.email);
    sent.length = 0;

    /* 更新路径（PUT issue + 拉 transitions + 命中才 POST）此前**完全没被覆盖**：
       新 issue 没有 syncInfo 只走 create，而 M3 变异（漏传 transitions 那一跳的 email）在只测 create
       时是绿的 —— 等于门禁没锁住。这里用应用自己的记账 API 造出 syncInfo，把三条请求都跑出来。 */
    win._intRecordSync("jira", "t9", "ACME-1", "issue");
    const res2 = await win.jiraSyncIssue({ id: "t9", title: "推一条（改）", description: "d2", status: "doing" }, "push");
    expect(sent.length, "前提：更新路径也发了请求（结果：" + JSON.stringify(res2) + "）").toBeGreaterThan(0);
    const paths = sent.map((s) => String(s.path || ""));
    expect(paths.some((p) => /\/transitions/.test(p)), "前提：拉到过 transitions 那一跳（实际路径：" + paths.join(",") + "）").toBe(true);
    for (const s of sent) expect(s.email, "更新/流转每一条都得带 email（path=" + s.path + "）").toBe(CLOUD.email);
  });

  it("没有 email 的配置（Server/DC PAT）仍发 Bearer，不许退化成 Basic …undefined", () => {
    expect(win._jiraAuthHeader("pat-abc", undefined)).toBe("Bearer pat-abc");
    expect(win._jiraAuthHeader("pat-abc", "   ")).toBe("Bearer pat-abc");
  });
});

describe("跨进程对称：渲染进程与主进程的 Jira header 必须逐条同值", () => {
  /* 纯函数比较，共用一次 jsdom 装载（loadApp 每次约 4s，逐个用例新建会把门禁拖成 30s 噪声） */
  let shared = null;
  const symWin = () => { if (!shared) shared = freshWin(); return shared; };
  const cases = [
    ["api-token-123", "dev@acme.com"],
    ["api-token-123", ""],
    ["api-token-123", "   "],
    ["  spaced-token  ", " spaced@acme.com "],
    ["tok-ünicode", "user@acme.com"],
    ["", "no-token@acme.com"],
    ["", ""],
  ];
  for (const [token, email] of cases) {
    it("token=" + JSON.stringify(token) + " email=" + JSON.stringify(email), () => {
      const win = symWin();
      expect(mainProcessHeaderBuilder()(token, email), "两侧实现分叉了（症状：浏览器版能连、桌面版连不上）")
        .toBe(win._jiraAuthHeader(token, email));
    });
  }

  it("非 ASCII token 两侧都按 UTF-8 编 base64（渲染侧不许裸 btoa，主侧不许默认 latin1）", () => {
    const win = freshWin();
    const b64 = Buffer.from("user@acme.com:tok-ünicode", "utf8").toString("base64");
    expect(win._jiraAuthHeader("tok-ünicode", "user@acme.com")).toBe("Basic " + b64);
    expect(mainProcessHeaderBuilder()("tok-ünicode", "user@acme.com")).toBe("Basic " + b64);
  });
});
