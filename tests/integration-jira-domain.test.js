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

/** v3.7.79：桌面形态 —— 装一个 jiraFetch 中继替身，观察渲染侧发给主进程的调用形状 */
function spyRelay(win) {
  const calls = [];
  win.electronAPI = { jiraFetch: async (arg) => { calls.push(arg); return { ok: true, status: 200, body: { accountId: "u1" } }; } };
  return calls;
}

describe("Jira 站点域名校验（凭据不外泄）", () => {
  let win;
  beforeEach(() => { win = freshWin(); });

  it("桌面形态：合法 atlassian.net 主机名经中继打 /rest/api/3/myself 并带 Bearer", async () => {
    const relay = spyRelay(win);
    const prov = await win.jiraConnect({ token: "TK", domain: "jira.acme.atlassian.net" });
    expect(prov).toBeTruthy();
    expect(relay.length).toBe(1);
    expect(relay[0].domain).toBe("jira.acme.atlassian.net");
    expect(relay[0].path).toBe("/rest/api/3/myself");
    expect(relay[0].method).toBe("GET");
    expect(relay[0].token).toBe("TK");
  });

  it("用户粘贴完整 https:// 前缀也能归一化（中继收到的只有主机名）", async () => {
    const relay = spyRelay(win);
    await win.jiraConnect({ token: "TK", domain: "https://jira.acme.atlassian.net" });
    expect(relay.length).toBe(1);
    expect(relay[0].domain).toBe("jira.acme.atlassian.net");
  });

  it("已知边界：自建域名/端口在两种形态下都不可用（浏览器 CORS 拦、中继只放 *.atlassian.net）", async () => {
    /* 渲染侧 _intJiraBase 仍接受端口（函数级断言见下一条）；但中继只传主机名 ——
       主进程白名单是 atlassian.net 云实例面，自建部署经中继会被 bad_domain 拒。
       这是如实的功能边界（自建 Jira 的 CORS 同样拿不到），不是校验误杀。 */
    const relay = spyRelay(win);
    await win.jiraConnect({ token: "TK", domain: "jira.internal.example.com:8443" });
    expect(relay.length).toBe(1);
    expect(relay[0].domain, "端口不进中继；主机是否放行由主进程白名单裁决").toBe("jira.internal.example.com");
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

  it("浏览器形态（无中继）：连接当场拒且零请求——不存「连上了但发不出去」的死配置", async () => {
    const prov = await win.jiraConnect({ token: "TK", domain: "jira.acme.atlassian.net" });
    expect(prov, "无中继必须返回 null").toBeNull();
    expect(win.integrationGetProvider("jira"), "更不能落成一个 provider").toBeFalsy();
  });

  it("已注册 provider 里的 domain 被改成恶意值后，sync / list 同样不发请求", async () => {
    const relay1 = spyRelay(win);
    await win.jiraConnect({ token: "TK", domain: "jira.acme.atlassian.net" });
    expect(relay1.length).toBe(1);
    /* 篡改已落盘的配置（模拟存储被改写 / 旧版本遗留的脏值） */
    win.integrationGetProvider("jira").config.domain = "evil.example.com/?x=";
    const relay2 = spyRelay(win);
    const r1 = await win.jiraSyncIssue({ id: "t1", title: "x", status: "doing" }, "push");
    const r2 = await win.jiraListIssues({ jql: "project = P" });
    expect(relay2, "坏域名下 sync/list 都必须 0 外发").toEqual([]);
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

  /* v3.7.66：飞书 / 钉钉真接了群机器人 webhook，"7 家全写尚未接入"的旧口径不再成立。
     守护不松，改成分组断言：本文件是「文案诚实度」的唯一归属（describe 即此职），
     `tests/notify-webhook.test.js` 不再重复断言措辞，只测通道行为。 */
  it("未接线的 3 个 provider 仍必须写明「同步 / 通知尚未接入」（v3.7.79 Jira 转已接线）", () => {
    const keys = ["int.notionDesc", "int.linearDesc", "int.calendarDesc"];
    for (const k of keys) {
      const v = win.t(k, "");
      expect(v, `${k} 文案为空`).toBeTruthy();
      expect(v, `${k} 仍在承诺未接入的能力：${v}`).toMatch(/尚未接入|not implemented/);
      expect(v, `${k} 不该再写成"同步…到 X"/"接收…通知"这种承诺`).not.toMatch(/^(同步|接收|Sync |Receive )/);
    }
  });

  it("已接线的飞书 / 钉钉 / Slack：必须写得出真发了什么，并如实交代凭据仅会话内存", () => {
    for (const k of ["int.feishuDesc", "int.dingtalkDesc", "int.slackDesc"]) {
      const v = win.t(k, "");
      expect(v, `${k} 文案为空`).toBeTruthy();
      expect(v, `${k} 应写明走群机器人 webhook：${v}`).toMatch(/webhook/i);
      expect(v, `${k} 已接通，不许再写"尚未接入"这种过时口径：${v}`).not.toMatch(/尚未接入|not implemented/);
      /* 存不下是产品决定，写进文案才是诚实：不交代就是让用户以为刷新后还在。 */
      expect(v, `${k} 必须交代凭据刷新即失效：${v}`).toMatch(/本次会话|会话内存|刷新即失效|this session|lost on reload/);
      expect(v, `${k} 不许反过来承诺同步（同步仍未接线）：${v}`).not.toMatch(/同步.*到|任务同步|sync.*notes?/i);
    }
  });

  /* v3.7.66 实测：钉钉 webhook 不回 CORS 头（预检与 POST 都没有），企业微信预检 403 ——
     所以钉钉只有借主进程发送的桌面版才真发得出去。文案若写得像两家都一样，就是新的空头承诺。 */
  it("钉钉 / Slack 文案必须写明「仅桌面版」，飞书不许被误标", () => {
    expect(win.t("int.dingtalkDesc", "")).toMatch(/仅桌面版|桌面版|desktop/i);
    expect(win.t("int.slackDesc", ""), "Slack 与钉钉同款不回 CORS 头，必须写明仅桌面版").toMatch(/仅桌面版|桌面版|desktop/i);
    const jr = win.t("int.jiraDesc", "");
    expect(jr, "Jira 必须写明仅桌面版：" + jr).toMatch(/仅桌面版|桌面版|desktop/i);
    expect(jr, "Jira 凭据是加密落盘的（不是会话内存），文案不许写反：" + jr).not.toMatch(/仅本次会话|刷新即失效/);
    expect(jr, "Jira 已接通，不许再写尚未接入：" + jr).not.toMatch(/尚未接入|not implemented/);
    const fs = win.t("int.feishuDesc", "");
    expect(fs, "飞书有 ACAO，浏览器可用，不该被一并标成桌面版专属：" + fs).not.toMatch(/仅桌面版|desktop only/i);
    const d = win.t("integration.desc", "");
    expect(d, "总说明必须解释清钉钉为什么只限桌面版：" + d).toMatch(/CORS|桌面版|desktop/i);
  });

  it("面板总说明：同步仍未接入要说清，且不许写得像「一连上就自动外发」", () => {
    const v = win.t("integration.desc", "");
    expect(v).toMatch(/同步.*仍未接入|同步仍未|is still not implemented|sync is still not/);
    expect(v).toMatch(/验证凭据|凭据|credentials/i);
    expect(v, "总说明必须写明外发只发生在用户主动推送这一侧").toMatch(/除你主动推送|unless you push|主动/);
  });

  it("会话内存态提示条存在且写明三条不落盘去向", () => {
    const v = win.t("p4.html.intEphemeralHint", "");
    expect(v).toBeTruthy();
    expect(v).toMatch(/不写入本地存储|never written to local storage/);
    expect(v).toMatch(/备份|backups/);
    expect(v).toMatch(/刷新|关闭页面|reload/);
  });
});
