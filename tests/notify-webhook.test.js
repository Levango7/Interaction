import { describe, it, expect, beforeEach } from "vitest";
import { webcrypto, createHmac } from "node:crypto";
import { loadApp } from "./helpers/loadApp.js";

/**
 * notify-webhook.test.js —— 飞书 / 钉钉「群机器人 webhook」通知通道（v3.7.66）
 *
 * 用户 2026-09-29 的两条决定：渠道选飞书 + 钉钉；**凭据绝不落盘**（"不要上远程，本地也不要"）。
 * 所以本文件最重要的不是"能不能发出去"，而是第 ① 组那三条：
 *   配了、发了、甚至发了十条 —— 磁盘上必须一个字节都没有。
 * 其余各组锁的是容易静默出错的地方：两个平台签名算法方向相反、钉钉 HTTP 200 仍可能业务失败、
 * 验证不过必须退回未配置、外发失败绝不能影响本地通知。
 *
 * 全部用 integrationSetHttpClient 替掉真实 HTTP，测试期间零外网请求。
 */
function freshWin() {
  const win = loadApp();
  win.localStorage.clear();
  /* jsdom 不一定给 window 装 WebCrypto；签名要用，显式补上 Node 的实现 */
  if (!win.crypto || !win.crypto.subtle) Object.defineProperty(win, "crypto", { value: webcrypto, configurable: true, writable: true });
  return win;
}
const flush = (ms = 60) => new Promise((r) => setTimeout(r, ms));
/* 密封写盘是 Promise 链（`_intQueuePersist` → `_intSealState`，crypto 就绪时还要过 subtle），
   不是同步 setItem。固定墙钟 flush(150) 在全量并行下等不住 —— 实测这条用例单跑绿、
   全量红（107 文件并发时 crypto 排队远超 150ms）。判据改成「轮询到状态成立为止」：
   只等结果、不等时间，超上限才判失败。 */
async function waitFor(fn, ms = 15000) {
  const t0 = Date.now();
  for (;;) {
    if (fn()) return true;
    if (Date.now() - t0 > ms) return false;
    await flush(20);
  }
}
const FEISHU_URL = "https://open.feishu.cn/open-apis/bot/v2/hook/abcdef-1234";
const DING_URL = "https://oapi.dingtalk.com/robot/send?access_token=SECRET-TOKEN-xyz";

/** 记录每次请求，并返回一个"成功"响应 */
function spy(win, resp) {
  const calls = [];
  win.integrationSetHttpClient(async (url, opts) => {
    calls.push({ url: String(url), method: (opts && opts.method) || "GET", body: opts && opts.body ? JSON.parse(opts.body) : null, headers: (opts && opts.headers) || {} });
    const r = Object.assign({ ok: true, status: 200, body: {} }, resp || {});
    r.json = async () => r.body;
    r.text = async () => JSON.stringify(r.body);
    return r;
  });
  return calls;
}
/** 监听 localStorage 的一切写入 */
function watchStorage(win) {
  const writes = [];
  const proto = Object.getPrototypeOf(win.localStorage);
  const orig = proto.setItem;
  proto.setItem = function (k, v) { writes.push(String(k)); return orig.call(this, k, v); };
  return writes;
}

describe("① 凭据绝不落盘（用户的核心要求）", () => {
  it("配置 + 发送全程不写 localStorage，且 providers 键根本不存在", async () => {
    const win = freshWin();
    const writes = watchStorage(win);
    spy(win);
    const prov = await win.feishuConnect({ url: FEISHU_URL, secret: "s3cr3t" });
    expect(prov, "连接应当成功").toBeTruthy();
    await win.notifyHookBroadcast("测试标题", "测试正文", "daily");
    await flush();
    const hookWrites = writes.filter((k) => /integration|hook|feishu|dingtalk/i.test(k));
    expect(hookWrites, "配置/发送过程不该写任何集成相关键：" + JSON.stringify(writes)).toEqual([]);
    expect(win.localStorage.getItem("wb_integration_providers"), "wb_integration_providers 不得被创建").toBeNull();
    expect(JSON.stringify([...Array(win.localStorage.length)].map((_, i) => win.localStorage.key(i)))).not.toMatch(/feishu|dingtalk|hook/i);
  });

  it("刷新（新窗口）即失效：不残留任何配置", async () => {
    const win = freshWin();
    spy(win);
    /* 用飞书而不是钉钉测这条：钉钉在非桌面形态下会被能力门直接拒掉（见 §⑥），
       而这里要验的是「连上了也不落盘」这个属性本身，必须是真能连通的渠道。 */
    await win.feishuConnect({ url: FEISHU_URL, secret: "" });
    expect(win.notifyHookGet("feishu").configured, "前提：本会话确实连上了").toBe(true);
    const win2 = freshWin();                       /* 等价于刷新 */
    expect(win2.notifyHookGet("feishu").configured, "新会话必须是未配置态").toBe(false);
    expect(win2.notifyHookGet("dingtalk").configured).toBe(false);
  });

  it("只接受 https 的 webhook；非 https / 空值一律拒并留未配置", async () => {
    const win = freshWin();
    spy(win);
    for (const bad of ["http://open.feishu.cn/hook/x", "javascript:alert(1)", "//open.feishu.cn/x", "", "   "]) {
      expect(win.notifyHookSet("feishu", { url: bad }), `应拒绝 ${JSON.stringify(bad)}`).toBe(false);
      expect(win.notifyHookGet("feishu").configured).toBe(false);
    }
  });

  it("面板回显脱敏：只给 host + 路径末段前 4 位，绝不回显完整 token", () => {
    const win = freshWin();
    win.notifyHookSet("dingtalk", { url: DING_URL, secret: "topsecret" });
    const g = win.notifyHookGet("dingtalk");
    expect(g.urlHint).toContain("oapi.dingtalk.com");
    expect(g.urlHint, "回显里不得出现完整 access_token：" + g.urlHint).not.toContain("SECRET-TOKEN-xyz");
    expect(g.urlHint).not.toContain("topsecret");
    expect(g.hasSecret).toBe(true);
  });
});

describe("② 两个平台的签名与报文（方向相反，最容易写反）", () => {
  /* 用 Node 的 crypto 独立算一份期望值做交叉验证，而不是拿实现自证 */
  const nodeHmacB64 = (key, msg) => createHmac("sha256", key).update(msg, "utf8").digest("base64");

  it("钉钉：sign 走 URL query，且 sign = HMAC(key=secret, data=timestamp+\"\\n\"+secret)", async () => {
    const win = freshWin();
    const calls = spy(win);
    win.notifyHookSet("dingtalk", { url: DING_URL, secret: "SECabc" });
    const before = Date.now();
    const r = await win.notifyHookSend("dingtalk", "hi");
    expect(r.ok).toBe(true);
    const u = new URL(calls[0].url);
    const ts = Number(u.searchParams.get("timestamp"));
    expect(ts).toBeGreaterThanOrEqual(before - 2000);
    expect(ts).toBeLessThanOrEqual(Date.now() + 2000);
    expect(u.searchParams.get("sign")).toBe(nodeHmacB64("SECabc", ts + "\n" + "SECabc"));
    expect(calls[0].body).toEqual({ msgtype: "text", text: { content: "hi" } });
  });

  it("飞书：sign 走 JSON body，且 sign = HMAC(key=timestamp+\"\\n\"+secret, data=空串)", async () => {
    const win = freshWin();
    const calls = spy(win);
    win.notifyHookSet("feishu", { url: FEISHU_URL, secret: "SECxyz" });
    const r = await win.notifyHookSend("feishu", "hi");
    expect(r.ok).toBe(true);
    expect(calls[0].url).toBe(FEISHU_URL);                    /* 飞书不往 URL 上挂签名 */
    const ts = calls[0].body.timestamp;
    expect(ts).toMatch(/^\d+$/);
    expect(Number(ts)).toBeGreaterThanOrEqual(Math.floor(Date.now() / 1000) - 5);   /* 秒级，不是毫秒 */
    expect(calls[0].body.sign).toBe(nodeHmacB64(ts + "\n" + "SECxyz", ""));
    expect(calls[0].body.msg_type).toBe("text");
    expect(calls[0].body.content).toEqual({ text: "hi" });
  });

  it("机器人未开加签时不带 sign（两家都是）", async () => {
    const win = freshWin();
    const calls = spy(win);
    win.notifyHookSet("feishu", { url: FEISHU_URL, secret: "" });
    win.notifyHookSet("dingtalk", { url: DING_URL, secret: "" });
    await win.notifyHookSend("feishu", "a");
    await win.notifyHookSend("dingtalk", "b");
    expect(calls[0].body.sign).toBeUndefined();
    expect(calls[0].body.timestamp).toBeUndefined();
    expect(new URL(calls[1].url).searchParams.get("sign")).toBeNull();
  });
});

describe("③ 业务失败不能当成功", () => {
  it("钉钉 HTTP 200 但 errcode≠0 → 判失败并带原因", async () => {
    const win = freshWin();
    spy(win, { body: { errcode: 310000, errmsg: "keywords not in content" } });
    win.notifyHookSet("dingtalk", { url: DING_URL, secret: "" });
    const r = await win.notifyHookSend("dingtalk", "hi");
    expect(r.ok).toBe(false);
    expect(r.error).toContain("310000");
    expect(r.error).toContain("keywords not in content");
  });
  it("飞书 HTTP 200 但 code≠0 → 判失败并带原因", async () => {
    const win = freshWin();
    spy(win, { body: { code: 190001, msg: "param invalid" } });
    win.notifyHookSet("feishu", { url: FEISHU_URL, secret: "" });
    const r = await win.notifyHookSend("feishu", "hi");
    expect(r.ok).toBe(false);
    expect(r.error).toContain("190001");
  });
  it("「连接」验证失败 → 退回未配置（不留一个发不出去的死配置）", async () => {
    const win = freshWin();
    spy(win, { ok: false, status: 403, body: {} });
    const prov = await win.feishuConnect({ url: FEISHU_URL, secret: "" });
    expect(prov).toBeNull();
    expect(win.notifyHookGet("feishu").configured, "验证失败后必须回到未配置").toBe(false);
  });
});

describe("④ 通知漏斗：外发绝不干扰本地体验", () => {
  it("外发抛错时本地 toast 照常出现，且不抛出到调用方", async () => {
    const win = freshWin();
    win.integrationSetHttpClient(async () => { throw new Error("network down"); });
    win.notifyHookSet("feishu", { url: FEISHU_URL, secret: "" });
    let threw = null;
    try { win.notifySystem("每日播报", "3 项待处理", "daily"); } catch (e) { threw = e; }
    expect(threw).toBeNull();
    await new Promise((r) => setTimeout(r, 80));
    expect(win.document.querySelectorAll("#toasts .toast").length, "本地 toast 必须照常渲染").toBeGreaterThan(0);
  });
  it("按事件类型开关：关掉 due 就只推 daily", async () => {
    const win = freshWin();
    const calls = spy(win);
    win.notifyHookSet("dingtalk", { url: DING_URL, secret: "" });
    win.notifyHookKindSet("due", false);
    win.notifyHookBroadcast("到期提醒", "", "due");
    await flush();
    expect(calls.length, "关掉的事件类型不该外发").toBe(0);
    win.notifyHookBroadcast("每日播报", "", "daily");
    await flush();
    expect(calls.length).toBe(1);
    expect(calls[0].body.text.content).toContain("每日播报");
    expect(calls[0].body.text.content).toMatch(/^\[Agent工坊\]/);   /* 关键词前缀：机器人可配自定义关键词 */
  });
  it("未登记的类别不得成为关不掉的通道：落到 daily 开关上", async () => {
    const win = freshWin();
    const calls = spy(win);
    win.notifyHookSet("dingtalk", { url: DING_URL, secret: "" });
    win.notifyHookBroadcast("未分类事件", "", "bogus");
    await flush();
    expect(calls.length, "未登记类别默认按 daily 放行").toBe(1);
    win.notifyHookKindSet("daily", false);
    win.notifyHookBroadcast("未分类事件", "", "bogus");
    await flush();
    expect(calls.length, "关掉 daily 后未登记类别也必须一起静音").toBe(1);
  });
  it("未配置任何通道时漏斗零请求（默认状态不能平白往外发）", async () => {
    const win = freshWin();
    const calls = spy(win);
    win.notifyHookBroadcast("任意", "内容", "daily");
    await flush();
    expect(calls).toEqual([]);
  });
});

describe("⑤ 历史凭据清理与 UI 口径", () => {
  it("_notifyScrubPersisted 把已落盘的 feishu / dingtalk 抹掉且写回，其他 provider 不动", async () => {
    const win = freshWin();
    win.localStorage.setItem("wb_integration_providers", JSON.stringify({
      feishu: { name: "feishu", config: { appId: "cli_x", appSecret: "leak" }, enabled: true },
      dingtalk: { name: "dingtalk", config: { accessKey: "k", accessSecret: "leak2" }, enabled: true },
      notion: { name: "notion", config: { token: "keep" }, enabled: true },
    }));
    win._intResetIntegrationCache();
    const n = win._notifyScrubPersisted();
    expect(n).toBe(2);
    const read = () => JSON.parse(win.localStorage.getItem("wb_integration_providers") || "{}");
    expect(await waitFor(() => Object.keys(read()).sort().join(",") === "notion"),
      "回扫必须真的写回存储；实际残留 " + JSON.stringify(Object.keys(read()))).toBe(true);
    expect(JSON.stringify(read())).not.toMatch(/leak/);
    /* 上一步已经等到写盘落定，这里必须**立刻**为 0 —— 用轮询等 0 会把「反复清除」
       也一起咽掉，那就不是幂等断言了。 */
    win._intResetIntegrationCache();
    expect(win._notifyScrubPersisted(), "幂等：第二次不该再报清除").toBe(0);
  });
  it("断开连接同时清内存与存储", async () => {
    const win = freshWin();
    win.localStorage.setItem("wb_integration_providers", JSON.stringify({ feishu: { config: { appSecret: "x" }, enabled: true } }));
    win.notifyHookSet("feishu", { url: FEISHU_URL, secret: "" });
    win.feishuDisconnect();
    expect(win.notifyHookGet("feishu").configured, "内存态必须先清掉").toBe(false);
    expect(await waitFor(() => JSON.parse(win.localStorage.getItem("wb_integration_providers") || "{}").feishu === undefined),
      "存储里的历史 feishu 条目必须被抹掉").toBe(true);
  });
  /* 面板文案的诚实度守护不在这儿 —— 归 tests/integration-jira-domain.test.js
     的「集成中心文案只承诺真接了的能力」（唯一归属，避免两处各写一份、改一处就假绿）。
     这里只测通道本身的行为。 */
});

/* ⑥ 传输分流与渠道能力门（v3.7.66）
   起因是真实网络实测（带 Origin 头打预检与 POST）：钉钉 webhook **不回 Access-Control-Allow-Origin**、
   企业微信预检直接 403，而 webhook 是 application/json 的 POST 必触发预检；本应用 Electron 窗口是
   sandbox:true 且没关 webSecurity，渲染进程走 Chromium 网络栈 —— 于是钉钉在浏览器和桌面版**都**发不出去，
   只有主进程 Node fetch 能发。这组用例锁的就是「不能对用户谎报钉钉可用」。 */
describe("⑥ 传输分流与渠道能力门", () => {
  /** 假装自己是桌面版：只给一个 notifySend，其余 electronAPI 能力不需要 */
  function asDesktop(win, resp) {
    const calls = [];
    win.electronAPI = {
      notifySend: async (arg) => { calls.push(arg); return Object.assign({ ok: true, status: 200, body: { errcode: 0, code: 0 } }, resp || {}); }
    };
    return calls;
  }

  it("能力判据按「origin + 传输」两轴走：jsdom 是 http 源，故飞书可用、钉钉仍不可用", () => {
    const win = freshWin();
    /* 本文件的 jsdom 固定在 http://localhost（loadApp 的 url），等价于「启动本地服务」形态。
       file:// 那一条轴由 e2e 覆盖 —— 那些 spec 真的跑在 file:// 上，比在这里伪造 origin 强。 */
    expect(win.notifyOriginIsHttpish(), "前提：jsdom 的 location 是 http 源").toBe(true);
    expect(win.notifyHasMainSender(), "没有 electronAPI 就不该假装是桌面版").toBe(false);
    expect(win.notifyChannelAvailable("feishu")).toBe(true);
    expect(win.notifyChannelAvailable("dingtalk"), "钉钉只有主进程发送可用").toBe(false);
    expect(win.notifyChannelAvailable("slack"), "Slack 同钉钉：hooks.slack.com 不回 CORS 头，只有桌面版可用（v3.7.69 实测）").toBe(false);
    expect(win.notifyChannelAvailable("weixin"), "未登记的渠道一律判不可用").toBe(false);
    expect(win.notifyUnavailableKey("dingtalk")).toBe("int.desktopOnly");
    expect(win.notifyUnavailableKey("slack"), "Slack 缺的也是主进程，不是 origin").toBe("int.desktopOnly");
    expect(win.notifyUnavailableKey("feishu"), "飞书缺的是 origin，不是桌面版").toBe("int.needHttpOrigin");
    expect(win.notifyUnavailableHint("dingtalk")).toMatch(/桌面|CORS/);
    expect(win.notifyUnavailableHint("feishu")).toMatch(/file:|http|本地服务/);
  });

  it("非桌面形态下「连接」钉钉：必须返回 null 且不留任何死配置", async () => {
    const win = freshWin();
    const calls = spy(win);
    const prov = await win.dingtalkConnect({ url: DING_URL, secret: "SECabc" });
    expect(prov, "发不出去的渠道不该返回一个 provider 对象").toBeNull();
    expect(win.notifyHookGet("dingtalk").configured, "更不能把 webhook 存进内存冒充已连接").toBe(false);
    expect(calls.length, "被拒的渠道一个请求都不能发").toBe(0);
  });

  it("桌面形态：钉钉走主进程 IPC，且请求参数是 {url, payload}", async () => {
    const win = freshWin();
    const ipc = asDesktop(win);
    const rendererCalls = spy(win);   /* 渲染进程 fetch 若被用到，说明分流错了 */
    const prov = await win.dingtalkConnect({ url: DING_URL, secret: "SECabc" });
    expect(prov, "有主进程发送就该连得上").toBeTruthy();
    expect(await waitFor(() => ipc.length >= 1), "连接成功的问候消息必须经主进程发出").toBe(true);
    expect(Object.keys(ipc[0]).sort()).toEqual(["payload", "url"]);
    expect(ipc[0].url).toContain("oapi.dingtalk.com");
    expect(ipc[0].url, "加签信息必须已经在 URL query 上（主进程不再算签名）").toMatch(/timestamp=\d+&sign=/);
    expect(ipc[0].payload.msgtype).toBe("text");
    expect(ipc[0].payload.text.content).toMatch(/^\[Agent工坊\]/);
    expect(rendererCalls.length, "桌面形态不得再走渲染进程 fetch").toBe(0);
  });

  it("桌面形态下飞书也优先走主进程（两条路径只留一份成功判定）", async () => {
    const win = freshWin();
    const ipc = asDesktop(win);
    win.notifyHookSet("feishu", { url: FEISHU_URL, secret: "SECxyz" });
    await win.notifyHookSend("feishu", "测试");
    expect(ipc.length).toBe(1);
    expect(ipc[0].payload.msg_type).toBe("text");
    expect(ipc[0].payload.timestamp, "飞书签名放 JSON body（与钉钉的 URL query 方向相反）").toBeTruthy();
    expect(ipc[0].payload.sign).toBeTruthy();
    expect(ipc[0].url).toBe(FEISHU_URL);
  });

  it("主进程回报失败（ok:false）时「连接」必须退回未配置", async () => {
    const win = freshWin();
    asDesktop(win, { ok: false, status: 0, error: "unsafe_webhook_url" });
    const prov = await win.dingtalkConnect({ url: DING_URL, secret: "" });
    expect(prov).toBeNull();
    expect(win.notifyHookGet("dingtalk").configured, "验证不过不能留下死配置").toBe(false);
  });

  it("业务失败（HTTP 200 + errcode≠0）经主进程路径同样判失败", async () => {
    const win = freshWin();
    asDesktop(win, { ok: true, status: 200, body: { errcode: 310000, errmsg: "keywords not in content" } });
    const prov = await win.dingtalkConnect({ url: DING_URL, secret: "" });
    expect(prov, "钉钉 200 但业务失败，不能当连接成功").toBeNull();
    expect(win.notifyHookGet("dingtalk").configured).toBe(false);
  });

  /* ---- v3.7.69 Slack：与钉钉同款的「仅桌面版」通道 ---- */

  it("非桌面形态下「连接」Slack：必须返回 null 且零请求（hooks.slack.com 不回 CORS 头）", async () => {
    const win = freshWin();
    const calls = spy(win);
    const prov = await win.slackConnect({ url: "https://hooks.slack.com/services/T0/B0/xyz" });
    expect(prov, "发不出去的渠道不该返回一个 provider 对象").toBeNull();
    expect(win.notifyHookGet("slack").configured, "更不能把 webhook 存进内存冒充已连接").toBe(false);
    expect(calls.length, "被拒的渠道一个请求都不能发").toBe(0);
  });

  it("桌面形态：Slack 走主进程 IPC，payload 是 {text}，成功只看 HTTP 200（响应是纯文本）", async () => {
    const win = freshWin();
    const ipc = asDesktop(win, { ok: true, status: 200, body: null });   /* Slack 200 正文是 "ok" 纯文本，body 为 null */
    const prov = await win.slackConnect({ url: "https://hooks.slack.com/services/T0/B0/xyz" });
    expect(prov, "200 即通路成立（无加签、无业务码）").toBeTruthy();
    expect(await waitFor(() => ipc.length >= 1), "问候消息必须经主进程发出").toBe(true);
    expect(ipc[0].url).toBe("https://hooks.slack.com/services/T0/B0/xyz");
    expect(Object.keys(ipc[0].payload).sort()).toEqual(["text"], "Incoming Webhook 只收 {text}，无 msgtype/code 结构");
    expect(ipc[0].payload.text).toMatch(/^\[Agent工坊\]/);
  });

  it("Slack 通道的 URL 主机钉死 hooks.slack.com：配成别家主机在渲染侧就被拒（主进程白名单是第二道门）", async () => {
    const win = freshWin();
    const ipc = asDesktop(win);
    win.notifyHookSet("slack", { url: "https://oapi.dingtalk.com/robot/send?access_token=x" });
    const r = await win.notifyHookSend("slack", "hi");
    expect(r.ok).toBe(false);
    expect(r.error).toBe("invalid_slack_host");
    expect(ipc.length, "渲染侧已拒，不该再劳烦主进程").toBe(0);
  });

  it("主进程回报失败（ok:false）时「连接」Slack 必须退回未配置", async () => {
    const win = freshWin();
    asDesktop(win, { ok: false, status: 404, error: "not_found" });
    const prov = await win.slackConnect({ url: "https://hooks.slack.com/services/T0/B0/xyz" });
    expect(prov, "404 no_team 一类失败不能当连接成功").toBeNull();
    expect(win.notifyHookGet("slack").configured, "验证不过不能留下死配置").toBe(false);
  });
});

/* ⑦ 面板禁用态的**渲染正确性**（v3.7.90）
   起因：动态死接线普查（`_probe/audit-dead-wiring-dynamic.mjs`）在真浏览器里发现
   浏览器形态下那几个「仅桌面版」的禁用按钮**标签里夹着 `">`** ——
   因为 `p4.html.intConnDisabled` 这个 i18n 片段自带开头的 `">`（本仓老写法：片段负责补上
   闭合引号与尖括号），而拼接处又写了一个 `'">' +`，于是标签变成 `">连接（当前形态不可用）`。
   原有断言只查了"按钮被禁用 + title"，**没查标签文字**，所以一路绿着上了线。
   这条把它钉住：禁用按钮的可见文字必须是干净的那句。 */
describe("⑦ 禁用按钮的可见文字（拼接错位回归）", () => {
  it("浏览器形态：禁用态「连接」按钮的文字不含多余的 \">", () => {
    const win = freshWin();
    win.renderIntegrationPanel();
    const rows = [...win.document.querySelectorAll("#integrationPanel .int-row")];
    const dings = rows.filter((r) => (r.querySelector(".int-label") || {}).textContent === "钉钉");
    expect(dings.length, "前提：面板里有钉钉行").toBe(1);
    const btn = dings[0].querySelector(".int-action button");
    expect(btn.disabled, "前提：浏览器形态下钉钉的连接按钮是禁用的").toBe(true);
    const label = (btn.textContent || "").trim();
    expect(label, "标签里不得出现多余的 \">（拼接多写了一个引号+尖括号）：" + label).not.toContain('">');
    expect(label, "应为干净的整句：" + label).toBe("连接（当前形态不可用）");
  });
});
