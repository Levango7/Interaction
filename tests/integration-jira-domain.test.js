import { describe, it, expect, beforeEach } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

/**
 * integration-jira-domain.test.js —— Jira 站点域名不得被拼成任意主机（v3.7.60）
 *
 * 真机实测出的凭据外泄面（_probe/integration-census.mjs）：`jiraConnect` 把用户填的
 * `domain` 直接拼成 `"https://" + domain + "/rest/api/3/myself"`，并带上
 * `Authorization: Bearer <token>`；而 CSP 的 `connect-src` 含裸 `https:`，任何 https 主机都放行。
 *   domain="evil.example.com/?x="   → https://evil.example.com/?x=/rest/api/3/myself
 *   domain="attacker.io/@x"         → https://attacker.io/@x/rest/api/3/myself
 * 即：把 domain 填成攻击者控制的值（或被诱导粘贴），Jira API Token 就发到那个主机去了。
 * 修法是 `_intJiraBase()` 只接受「纯主机名（可带端口）」，三处拼 URL 的点全部走它。
 *
 * 这里锁的是**行为**（发了几次请求、URL 长什么样），不是去读私有函数 ——
 * 用既有的 `integrationSetHttpClient` 注入假 HTTP 通道，所以不会真的外发。
 */
function freshWin() {
  const win = loadApp();
  win.localStorage.clear();
  return win;
}

/** 装一个记录调用的假 HTTP 客户端 */
function spyClient(win, ok = true) {
  const calls = [];
  win.integrationSetHttpClient((url, opts) => {
    calls.push({ url: String(url), auth: String((opts && opts.headers && (opts.headers.Authorization || opts.headers.authorization)) || "") });
    return Promise.resolve({ ok, status: ok ? 200 : 401, body: { ok } });
  });
  return calls;
}

const EVIL = [
  "evil.example.com/?x=",        // 查询串截走路径
  "attacker.io/@x",              // 伪 userinfo
  "a.com/#evil",                 // 片段吞掉路径
  "a.com/redirect?url=",          // 路径前缀
  "http://a.com",                // 协议降级
  "//a.com",                     // 协议相对
  "a.com:443@evil.io",           // 凭据分隔符
  "evil.io\\a.com",              // 反斜杠
  "a.com evil.io",               // 空白（URL 解析会截断）
  "a.com\tevil.io",              // 制表符：Chromium 会**剥掉**它 → 两个主机粘成 a.comevil.io
  "a.com\n evil.io",             // 换行同理
  "",
];

describe("Jira 站点域名校验（凭据不外泄）", () => {
  let win;
  beforeEach(() => { win = freshWin(); });

  it("合法裸主机名：打到 <host>/rest/api/3/myself 并带 Bearer", async () => {
    const calls = spyClient(win);
    const prov = await win.jiraConnect({ token: "TK", domain: "jira.acme.atlassian.net" });
    expect(prov).toBeTruthy();
    expect(calls.length).toBe(1);
    expect(calls[0].url).toBe("https://jira.acme.atlassian.net/rest/api/3/myself");
    expect(calls[0].auth).toBe("Bearer TK");
  });

  it("用户粘贴完整 https:// 前缀也能归一化（不出现 https://https//）", async () => {
    const calls = spyClient(win);
    await win.jiraConnect({ token: "TK", domain: "https://jira.acme.com" });
    expect(calls.length).toBe(1);
    expect(calls[0].url).toBe("https://jira.acme.com/rest/api/3/myself");
  });

  it("自建 Jira 的非标准端口仍可用（校验不能把合法部署挡死）", async () => {
    const calls = spyClient(win);
    await win.jiraConnect({ token: "TK", domain: "jira.internal.example.com:8443" });
    expect(calls.length).toBe(1);
    expect(calls[0].url).toBe("https://jira.internal.example.com:8443/rest/api/3/myself");
  });

  it(`十二种注入/畸形形态一律拒发请求（0 次外发 + 返回 null）`, async () => {
    expect(EVIL.length).toBe(12);
    for (const domain of EVIL) {
      const calls = spyClient(win);
      const prov = await win.jiraConnect({ token: "SECRET-TK", domain });
      expect(prov, `domain=${JSON.stringify(domain)} 不该被接受`).toBeFalsy();
      expect(calls, `domain=${JSON.stringify(domain)} 不该发出任何请求`).toEqual([]);
    }
  });

  it("已注册 provider 里的 domain 被改成恶意值后，sync / list 同样不发请求", async () => {
    const c1 = spyClient(win);
    await win.jiraConnect({ token: "TK", domain: "jira.acme.com" });
    expect(c1.length).toBe(1);
    /* 篡改已落盘的配置（模拟存储被改写 / 旧版本遗留的脏值） */
    win.integrationGetProvider("jira").config.domain = "evil.example.com/?x=";
    const c2 = spyClient(win);
    const r1 = await win.jiraSyncIssue({ id: "t1", title: "x", status: "doing" }, "push");
    const r2 = await win.jiraListIssues({ jql: "project = P" });
    expect(c2, "坏域名下 sync/list 都必须 0 外发").toEqual([]);
    expect(r1 && r1.error).toBe("invalid_domain");
    expect(r2).toEqual([]);
  });

  it("校验函数只接受 https + 纯主机名（直接盯 _intJiraBase 的边界）", () => {
    const base = (d) => win._intJiraBase(d);
    expect(base("a.atlassian.net")).toBe("https://a.atlassian.net");
    expect(base("  a.atlassian.net  ")).toBe("https://a.atlassian.net");
    expect(base("a.atlassian.net:8443")).toBe("https://a.atlassian.net:8443");
    /* 空片段被丢弃后主机不变 —— 归一化即可，不必拒（真正危险的是"带内容的"片段，见 EVIL） */
    expect(base("a.com/#")).toBe("https://a.com");
    for (const d of EVIL) expect(base(d), `应拒绝 ${JSON.stringify(d)}`).toBeNull();
  });
});

describe("集成中心文案只承诺真接了的能力", () => {
  let win;
  beforeEach(() => { win = freshWin(); });

  it("7 个 provider 的描述都写明「同步 / 通知尚未接入」", () => {
    const keys = ["int.notionDesc", "int.linearDesc", "int.jiraDesc", "int.slackDesc",
      "int.feishuDesc", "int.dingtalkDesc", "int.calendarDesc"];
    for (const k of keys) {
      const v = win.t(k, "");
      expect(v, `${k} 文案为空`).toBeTruthy();
      expect(v, `${k} 仍在承诺未接入的能力：${v}`).toMatch(/尚未接入|not implemented/);
      expect(v, `${k} 不该再写成"同步…到 X"/"接收…通知"这种承诺`).not.toMatch(/^(同步|接收|Sync |Receive )/);
    }
  });

  it("面板总说明明确「连接本身不会向任何服务发送数据」", () => {
    const v = win.t("integration.desc", "");
    expect(v).toMatch(/不会向任何服务发送数据|does not send data/);
    expect(v).toMatch(/验证凭据|verify credentials/);
  });
});
