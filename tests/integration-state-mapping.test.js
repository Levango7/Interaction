/**
 * integration-state-mapping.test.js —— Linear/Jira 状态映射运行时化（v3.7.85）
 * ----------------------------------------------------------------------------
 * 背景：v3.7.70/79 把 Linear/Jira 的推送接了，但**状态变换**被冻结在废弃名单里 ——
 * 理由是「状态名→远端 ID」需要真实工作区验证。v3.7.85 换了个角度：**查工作流状态
 * 本身不需要我持有工作区**，用用户自己的 token 在连接/推送时查一次即可，映射随各工作区
 * 实况走。本文件钉住：
 *   ① Linear：connect 拉 team.states → stateMap；推送命中则带 stateId，未命中不带；
 *   ② Jira（仅桌面可达，v3.7.79）：更新后按 issue 拉 transitions → 本地状态名匹配 →
 *      POST transition；不命中不变换；
 *   ③ 候选名表：中文状态名（进行中）也能匹配；
 *   ④ 诚实性：拉取失败路径都**不阻断推送**（同步成功但状态不变换，如实回 transitioned:false）。
 */
import { describe, it, expect, beforeEach } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

const PREFIX = "wb_agent_";
const STATES = { nodes: [{ id: "st_1", name: "Backlog" }, { id: "st_2", name: "In Progress" }, { id: "st_3", name: "Done" }] };

function app() {
  return loadApp({ storage: { [PREFIX + "tasks"]: "[]" } });
}
/* GraphQL 响应体只包一层 data */
const gqlOK = (data) => ({ ok: true, status: 200, json: async () => ({ data }) });

describe("Linear：connect 建 stateMap + 推送带 stateId", () => {
  let win, calls;
  beforeEach(() => {
    win = app();
    calls = [];
    win.integrationSetHttpClient(async (url, opts) => {
      const b = opts && opts.body ? JSON.parse(opts.body) : {};
      calls.push({ query: String(b.query || ""), variables: b.variables || null });
      if (/viewer/.test(b.query || "")) return gqlOK({ viewer: { id: "u1" } });
      if (/states/.test(b.query || "")) return gqlOK({ team: { states: STATES } });
      if (/issueCreate/.test(b.query || "")) return gqlOK({ issueCreate: { success: true, issue: { id: "li_1" } } });
      if (/issueUpdate/.test(b.query || "")) return gqlOK({ issueUpdate: { success: true, issue: { id: "li_1" } } });
      return { ok: false, status: 500, json: async () => ({}) };
    });
  });

  it("连接时拉 team.states 建立 {小写名: id} 映射并落进 provider 配置（含落盘复现）", async () => {
    const prov = await win.linearConnect({ token: "TK", teamId: "team_1" });
    expect(prov).toBeTruthy();
    expect(prov.config._verified).toBe(true);
    expect(prov.config.stateMap["in progress"]).toBe("st_2");
    expect(prov.config.stateMap["done"]).toBe("st_3");
    expect(calls.filter((c) => /states/.test(c.query)).length).toBe(1);
    expect(win.integrationGetProvider("linear").config.stateMap["backlog"], "映射必须落盘（不能只活在内存）").toBe("st_1");
  });

  it("推送创建：状态命中 → mutation 带 stateId（todo→Backlog→st_1）", async () => {
    await win.linearConnect({ token: "TK", teamId: "team_1" });
    const r = await win.linearSyncIssue({ id: "t1", title: "X", note: "N", status: "todo" });
    expect(r.success).toBe(true);
    const mut = calls.find((c) => /issueCreate/.test(c.query));
    expect(mut.variables.input.stateId).toBe("st_1");
  });

  it("推送更新：in_progress 命中 In Progress→st_2", async () => {
    await win.linearConnect({ token: "TK", teamId: "team_1" });
    await win.linearSyncIssue({ id: "t2", title: "X", status: "todo" });       /* 建：落 remoteId */
    const r2 = await win.linearSyncIssue({ id: "t2", title: "X2", status: "in_progress" });  /* 更 */
    expect(r2.success).toBe(true);
    const mut = calls.find((c) => /issueUpdate/.test(c.query));
    expect(mut.variables.input.stateId).toBe("st_2");
  });

  it("诚实性：states 拉取失败 → 无映射 → 推送不带 stateId 但仍算成功（落团队默认）", async () => {
    win.integrationSetHttpClient(async (url, opts) => {
      const b = opts && opts.body ? JSON.parse(opts.body) : {};
      if (/viewer/.test(b.query || "")) return gqlOK({ viewer: { id: "u1" } });
      if (/states/.test(b.query || "")) return { ok: true, status: 200, json: async () => ({ data: { errors: [{ message: "no team" }] } }) };
      return gqlOK({ issueCreate: { success: true, issue: { id: "li_9" } } });
    });
    await win.linearConnect({ token: "TK", teamId: "team_1" });
    expect(win.integrationGetProvider("linear").config.stateMap, "拉失败不该留半张表").toBeUndefined();
    const r = await win.linearSyncIssue({ id: "t3", title: "Y", status: "in_progress" });
    expect(r.success).toBe(true);
  });
});

describe("Jira（仅桌面可达）：更新后按 transitions 运行时变换", () => {
  let win, calls;
  beforeEach(() => {
    win = app();
    calls = [];
    win.electronAPI = { jiraFetch: async (arg) => {
      const u = arg.url + arg.path, m = arg.method;
      calls.push({ url: u, method: m, body: arg.body ? JSON.parse(arg.body) : null });
      if (/\/rest\/api\/3\/myself/.test(u)) return { ok: true, status: 200, body: { accountId: "u1" } };
      if (/\/transitions$/.test(u) && m === "GET") return { ok: true, status: 200, body: { transitions: win.__trans || [] } };
      if (/\/transitions$/.test(u)) return { ok: true, status: 204, body: null };
      if (/\/rest\/api\/3\/issue$/.test(u)) return { ok: true, status: 201, body: { id: "10001", key: "PRJ-1" } };
      return { ok: true, status: 204, body: null };
    } };
  });

  it("更新后命中 transition → POST transitions，结果带 transitioned:true", async () => {
    win.__trans = [{ id: "31", name: "In Progress" }, { id: "41", name: "Done" }];
    const prov = await win.jiraConnect({ token: "TK", domain: "corp.atlassian.net", projectKey: "PRJ" });
    expect(prov).toBeTruthy();
    const first = await win.jiraSyncIssue({ id: "t1", title: "X", description: "D", status: "todo" }, "push");
    expect(first.success).toBe(true);
    const r2 = await win.jiraSyncIssue({ id: "t1", title: "X2", description: "D2", status: "in_progress" }, "push");
    expect(r2.success).toBe(true);
    expect(r2.transitioned, "In Progress 应命中 transition 31").toBe(true);
    const trPost = calls.find((c) => /\/transitions$/.test(c.url) && c.method === "POST");
    expect(trPost, "应发出 transitions POST").toBeTruthy();
    expect(trPost.body).toEqual({ transition: { id: "31" } });
  });

  it("匹配不上：同步成功但 transitioned:false（对方状态保持不动，不猜）", async () => {
    win.__trans = [{ id: "41", name: "Done" }];
    await win.jiraConnect({ token: "TK", domain: "corp.atlassian.net", projectKey: "PRJ" });
    await win.jiraSyncIssue({ id: "t3", title: "X", status: "todo" }, "push");
    const r2 = await win.jiraSyncIssue({ id: "t3", title: "Y", status: "in_progress" }, "push");
    expect(r2.success).toBe(true);
    expect(r2.transitioned).toBe(false);
    expect(calls.some((c) => /\/transitions$/.test(c.url) && c.method === "POST"), "没命中就不该 POST").toBe(false);
  });

  it("浏览器形态（无中继）：连接当场拒、不留死配置（v3.7.79 门在位）", async () => {
    const win2 = app();
    const prov = await win2.jiraConnect({ token: "TK", domain: "corp.atlassian.net", projectKey: "PRJ" });
    expect(prov).toBeNull();
    expect(win2.integrationGetProvider("jira")).toBeFalsy();
  });

  it("中文状态名也能匹配（候选表含中文）", () => {
    const win3 = app();
    expect(win3._matchTransitionName([{ id: "9", name: "进行中" }], "in_progress")).toBe("9");
    expect(win3._matchTransitionName([{ id: "9", name: "进行中" }], "进行中")).toBe("9");
    expect(win3._matchTransitionName([], "in_progress")).toBe("");
  });
});