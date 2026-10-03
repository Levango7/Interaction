/**
 * github-device-flow.test.js —— GitHub 设备流 + Gist 载体（v3.7.86 B4）
 * ----------------------------------------------------------------------------
 * 实测前提（`_probe/github-cors2.mjs` 存档）：api.github.com 回 `ACAO:*`、预检 204 放行写操作
 * → 浏览器直连成立，不经主进程。device/code 端点需**有效 client_id**（用户注册 OAuth App 后填入），
 * 故本文件全部用 fetch 替身，断言**请求形状**（client_id + scope=gist、无 secret、轮询语义）
 * 与 **token 加密落盘**（与 AI Key 同款设备密钥 AES-GCM）+ Gist 上行/下行形状。
 */
import { describe, it, expect, beforeEach } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

const PREFIX = "wb_agent_";

function app() {
  return loadApp({ storage: { [PREFIX + "tasks"]: "[]", [PREFIX + "cfg"]: JSON.stringify({ enabled: true, base: "https://api.x", key: "k" }) } });
}

/** fetch 替身：按 url+method 路由，返回 {calls, stub} */
function stubFetch(win, routes) {
  const calls = [];
  win.fetch = async (url, opts) => {
    const body = opts && opts.body ? JSON.parse(opts.body) : null;
    calls.push({ url: String(url), method: (opts && opts.method) || "GET", body, headers: (opts && opts.headers) || {} });
    for (const r of routes) {
      if (r.match(String(url), opts && opts.method, body)) {
        return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.data };
      }
    }
    return { ok: false, status: 404, json: async () => ({ message: "not stubbed" }) };
  };
  return calls;
}

describe("GitHub 设备流：请求形状与诚实门控", () => {
  let win;
  beforeEach(() => { win = app(); });

  it("start：POST device/code，body 含 client_id + scope=gist，**不含 secret**", async () => {
    const calls = stubFetch(win, [{
      match: (u, m) => /login\/device\/code/.test(u) && m === "POST",
      status: 200, data: { device_code: "dc_1", user_code: "WXYZ-1234", verification_uri: "https://github.com/login/device", interval: 5, expires_in: 900 }
    }]);
    const r = await win.githubDeviceStart("Iv1.test");
    expect(r.ok).toBe(true);
    expect(r.userCode).toBe("WXYZ-1234");
    expect(r.verifyUrl).toBe("https://github.com/login/device");
    expect(calls.length).toBe(1);
    expect(calls[0].body.client_id).toBe("Iv1.test");
    expect(calls[0].body.scope).toBe("gist");
    expect(JSON.stringify(calls[0].body)).not.toMatch(/secret/);   /* device flow 永远不带 secret */
  });

  it("未给 client_id：直接拒、零请求（不做无效外发）", async () => {
    const calls = stubFetch(win, []);
    const r = await win.githubDeviceStart("");
    expect(r.ok).toBe(false);
    expect(r.error).toBe("no_client_id");
    expect(calls.length).toBe(0);
  });

  it("无效 client_id → 如实报 bad_client_id（不假装成功）", async () => {
    stubFetch(win, [{ match: (u) => /device\/code/.test(u), status: 404, data: { error: "Not Found" } }]);
    const r = await win.githubDeviceStart("bad");
    expect(r.ok).toBe(false);
    expect(r.error).toBeTruthy();
  });

  it("poll：pending → ok 但 done=false；拿到 token → done=true 且**密文落盘**（明文不在存储）", async () => {
    let phase = 0;
    stubFetch(win, [{
      match: (u, m, b) => /oauth\/access_token/.test(u) && m === "POST" && b.grant_type === "urn:ietf:params:oauth:grant-type:device_code",
      status: 200, data: { error: "authorization_pending" }
    }]);
    /* 先测 pending（GitHub 明确回 error:authorization_pending 才算等待） */
    const p1 = await win.githubDevicePoll("Iv1.t", "dc_1");
    expect(p1.ok).toBe(true);
    expect(p1.pending).toBe(true);
    /* 再测拿到 token */
    phase = 1;
    win.fetch = async () => ({ ok: true, status: 200, json: async () => ({ access_token: "gho_SECRET_TOKEN" }) });
    const p2 = await win.githubDevicePoll("Iv1.t", "dc_1");
    expect(p2.done).toBe(true);
    expect(win.githubHasToken(), "授权后应有 token").toBe(true);
    expect(await win.githubToken()).toBe("gho_SECRET_TOKEN");   /* 解密可还原 */
    const raw = win.localStorage.getItem(PREFIX + "github_device_token");
    expect(raw, "存储里必须是密文而非明文").not.toContain("gho_SECRET_TOKEN");
    expect(raw, "密文形态带 __enc 标记").toMatch(/__enc/);
  });

  it("poll：slow_down / expired_token / access_denied 分别如实归类", async () => {
    const one = async (data) => { win.fetch = async () => ({ ok: true, status: 200, json: async () => data }); };
    await one({ error: "slow_down" });
    expect((await win.githubDevicePoll("c", "d")).slowDown).toBe(true);
    await one({ error: "expired_token" });
    expect((await win.githubDevicePoll("c", "d")).error).toBe("expired_token");
    await one({ error: "access_denied" });
    expect((await win.githubDevicePoll("c", "d")).error).toBe("access_denied");
  });

  it("清除 token 与 Gist 指针；清除后 hasToken=false", async () => {
    stubFetch(win, [{ match: (u) => /oauth\/access_token/.test(u), status: 200, data: { access_token: "gho_X" } }]);
    await win.githubDevicePoll("c", "d");
    win.save(PREFIX + "github_gist_id", "gist_1");
    expect(win.githubGistId()).toBe("gist_1");
    win.githubTokenClear();
    expect(win.githubHasToken()).toBe(false);
    expect(win.githubGistId()).toBe("");
  });
});

describe("Gist 快照载体", () => {
  let win;
  beforeEach(() => { win = app(); });

  it("未授权：上行/下行都拒且零请求", async () => {
    const calls = stubFetch(win, []);
    expect((await win.gistSyncPut("{}")).error).toBe("not_authorized");
    expect((await win.gistSyncGet()).error).toBe("not_authorized");
    expect(calls.length).toBe(0);
  });

  it("上行：无 gist → POST /gists（public:false + snapshot 文件）；带 gist → PATCH", async () => {
    stubFetch(win, [{ match: (u) => /oauth\/access_token/.test(u), status: 200, data: { access_token: "gho_X" } }]);
    await win.githubDevicePoll("c", "d");
    let calls = stubFetch(win, [
      { match: (u, m) => /\/gists$/.test(u) && m === "POST", status: 201, data: { id: "gist_1", html_url: "https://gist.github.com/gist_1" } },
      { match: (u, m) => /\/gists\/gist_1/.test(u) && m === "PATCH", status: 200, data: { id: "gist_1" } },
    ]);
    const r1 = await win.gistSyncPut('{"tasks":[]}');
    expect(r1.ok).toBe(true);
    expect(r1.gistId).toBe("gist_1");
    expect(win.githubGistId(), "首次上行后记住 gist 指针").toBe("gist_1");
    const post = calls.find((c) => c.method === "POST");
    expect(post.body.public, "必须私有").toBe(false);
    expect(post.body.files["agent-workshop-snapshot.json"].content).toBe('{"tasks":[]}');
    expect(post.headers.Authorization).toBe("Bearer gho_X");
    const r2 = await win.gistSyncPut('{"tasks":[1]}');
    expect(r2.ok).toBe(true);
    expect(calls.find((c) => c.method === "PATCH"), "第二次走 PATCH（保留 revision 历史）").toBeTruthy();
  });

  it("下行：读回快照内容；文件缺失/截断如实失败", async () => {
    stubFetch(win, [{ match: (u) => /oauth\/access_token/.test(u), status: 200, data: { access_token: "gho_X" } }]);
    await win.githubDevicePoll("c", "d");
    win.save(PREFIX + "github_gist_id", "gist_9");
    stubFetch(win, [
      { match: (u, m) => /\/gists\/gist_9/.test(u) && m === "GET", status: 200, data: { files: { "agent-workshop-snapshot.json": { content: '{"tasks":[2]}' } } } },
    ]);
    const g1 = await win.gistSyncGet();
    expect(g1.ok).toBe(true);
    expect(g1.text).toBe('{"tasks":[2]}');
    stubFetch(win, [
      { match: (u, m) => /\/gists\/gist_9/.test(u) && m === "GET", status: 200, data: { files: { "agent-workshop-snapshot.json": { truncated: true, content: "" } } } },
    ]);
    expect((await win.gistSyncGet()).error).toBe("file_truncated");
    stubFetch(win, [
      { match: (u, m) => /\/gists\/gist_9/.test(u) && m === "GET", status: 200, data: { files: {} } },
    ]);
    expect((await win.gistSyncGet()).error).toBe("file_missing");
  });
});

describe("集成页 GitHub 段：诚实门控", () => {
  it("未配置 client_id：只显示说明与保存按钮，**没有**「开始授权」按钮", () => {
    const win = app();
    win.renderIntegrationPanel();
    const panel = win.document.getElementById("integrationPanel");
    expect(panel.textContent).toMatch(/client_id|Client ID/);
    expect(panel.querySelector("#ghSaveCid")).toBeTruthy();
    expect(panel.querySelector("#ghDevStart"), "未配置时不得渲染授权按钮").toBeFalsy();
  });

  it("配置了 client_id 但未授权：有「开始授权」+「检查授权结果」；授权后只剩断开按钮", () => {
    const win = app();
    win.integrationSetHttpClient(async () => ({ ok: false, status: 404, json: async () => ({}) }));
    const cfg = win.getCfg();
    cfg.githubClientId = "Iv1.abc";
    win.save(PREFIX + "cfg", cfg);
    win.renderIntegrationPanel();
    let panel = win.document.getElementById("integrationPanel");
    expect(panel.querySelector("#ghDevStart")).toBeTruthy();
    expect(panel.querySelector("#ghDevPoll")).toBeTruthy();
    expect(panel.querySelector("#ghClear")).toBeFalsy();
    win.localStorage.setItem(PREFIX + "github_device_token", '{"__enc":true,"iv":"x","data":"y"}');
    win.renderIntegrationPanel();
    panel = win.document.getElementById("integrationPanel");
    expect(panel.querySelector("#ghClear"), "已授权后应能断开").toBeTruthy();
    expect(panel.querySelector("#ghDevStart")).toBeFalsy();
  });
});