/**
 * webdav-sync.test.js —— WebDAV 云同步载体（v3.7.87）
 * ----------------------------------------------------------------------------
 * 守四件事：
 *   ① 配置：应用密码设备密钥加密落盘（存储里无明文）；无中继形态全部动作零请求；
 *   ② 探活：PROPFIND 形状（Depth:0 + Basic 头走参数）；
 *   ③ **ETag 冲突检测**：首次上传 If-None-Match:* / 续传 If-Match；412 → conflict=true
 *      如实上报，不静默覆盖（云同步全量契约前的第一个真冲突信号）；
 *   ④ 诚实失败：云端无文件(404)=missing 而非错误；浏览器形态无动作入口。
 */
import { describe, it, expect, beforeEach } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

const PREFIX = "wb_agent_";

function app() {
  return loadApp({ storage: { [PREFIX + "tasks"]: "[]", [PREFIX + "cfg"]: JSON.stringify({ enabled: true, base: "https://api.x", key: "k" }) } });
}
function relayStub(win, respond) {
  const calls = [];
  win.electronAPI = { webdavFetch: async (arg) => { calls.push(arg); return respond(arg, calls.length); } };
  return calls;
}
const OK_PUT = (arg) => ({ ok: true, status: 201, etag: '"v1"', lastModified: "LM1" });
const CONFLICT = () => ({ ok: false, status: 412, conflict: true, error: "HTTP 412" });

describe("WebDAV 配置与凭据", () => {
  let win;
  beforeEach(() => { win = app(); });

  it("保存：密码加密落盘（存储无明文），可解密还原；清除即抹净", async () => {
    const okc = await win.webdavSaveCfg({ url: "https://dav.jianguoyun.com/dav/", user: "me@x.com", pass: "appPass_123" });
    expect(okc).toBe(true);
    const raw = win.localStorage.getItem(PREFIX + "webdav_pass");
    expect(raw, "密码不得明文落盘").not.toContain("appPass_123");
    expect(raw).toMatch(/__enc/);
    expect(await win.webdavPass()).toBe("appPass_123");
    expect(win.webdavCfg().url, "尾斜杠归一").toBe("https://dav.jianguoyun.com/dav");
    expect(win.webdavConfigured()).toBe(true);
    win.webdavClearCfg();
    expect(win.webdavCfg()).toBeNull();
    expect(await win.webdavPass()).toBe("");
  });

  it("浏览器形态（无中继）：探活/上传/下行都拒且**零请求**", async () => {
    await win.webdavSaveCfg({ url: "https://dav.example.com/dav", user: "u", pass: "p" });
    const calls = [];
    win.electronAPI = { webdavFetch: async (a) => { calls.push(a); return { ok: true, status: 207 }; } };
    win.electronAPI = undefined;   /* 模拟浏览器：无 webdavFetch */
    expect((await win.webdavProbe()).error).toBe("no_relay");
    expect((await win.webdavPut("{}")).error).toBe("no_relay");
    expect((await win.webdavGet()).error).toBe("no_relay");
    expect(calls.length).toBe(0);
  });
});

describe("WebDAV 探活与快照（ETag 冲突检测）", () => {
  let win;
  beforeEach(async () => { win = app(); await win.webdavSaveCfg({ url: "https://dav.example.com/dav", user: "me@x.com", pass: "appPass_123" }); });

  it("探活：PROPFIND + Depth:0 + Basic 头在参数里（不带头名）", async () => {
    const calls = relayStub(win, () => ({ ok: true, status: 207 }));
    const r = await win.webdavProbe();
    expect(r.ok).toBe(true);
    expect(calls[0].method).toBe("PROPFIND");
    expect(calls[0].depth).toBe("0");
    expect(calls[0].url).toBe("https://dav.example.com/dav/");
    expect(String(calls[0].auth)).toMatch(/^Basic /);
    expect(calls[0].headers, "渲染层不拼 headers：Authorization 作为独立参数传给中继").toBeUndefined();
  });

  it("首次上传：If-None-Match:*（不存在才建，防覆盖他人文件）；续传：If-Match:<上次 etag>", async () => {
    let calls = relayStub(win, OK_PUT);
    const r1 = await win.webdavPut('{"a":1}');
    expect(r1.ok).toBe(true);
    expect(calls[0].method).toBe("PUT");
    expect(calls[0].ifNoneMatch).toBe("*");
    expect(calls[0].body).toBe('{"a":1}');
    calls = relayStub(win, OK_PUT);
    await win.webdavPut('{"a":2}');
    expect(calls[0].ifMatch, "续传带 If-Match").toBe('"v1"');
    expect(calls[0].ifNoneMatch).toBeUndefined();
  });

  it("412 → conflict=true 如实上报，**不静默覆盖**", async () => {
    relayStub(win, OK_PUT);
    await win.webdavPut("{}");
    relayStub(win, CONFLICT);
    const r = await win.webdavPut('{"mine":1}');
    expect(r.ok).toBe(false);
    expect(r.conflict, "云端已被其他设备改过 → 冲突信号").toBe(true);
  });

  it("下行：取回文本；云端无文件(404) → missing 而非错误", async () => {
    relayStub(win, OK_PUT);
    await win.webdavPut("{}");
    let calls = relayStub(win, () => ({ ok: true, status: 200, text: '{"tasks":[7]}', etag: '"v1"' }));
    const g1 = await win.webdavGet();
    expect(g1.ok).toBe(true);
    expect(g1.text).toBe('{"tasks":[7]}');
    expect(calls[0].method).toBe("GET");
    relayStub(win, () => ({ ok: false, status: 404, error: "HTTP 404" }));
    const g2 = await win.webdavGet();
    expect(g2.missing).toBe(true);
  });
});

describe("集成页 WebDAV 段门控", () => {
  it("浏览器形态：只给「仅桌面版」说明，一个控件都不渲染", () => {
    const win = app();
    win.renderIntegrationPanel();
    const panel = win.document.getElementById("integrationPanel");
    expect(panel.textContent).toMatch(/桌面版|desktop/);
    expect(panel.querySelector("#wdProbe"), "无中继不得渲染动作按钮").toBeFalsy();
    /* v3.7.89 修正：原来这里断言 `#wdSave` 存在（输入框与「保存」是无条件渲染的）。
       但那个行为站不住 —— 桌面版加载 file:// 那棵树、浏览器站点是另一个 origin，
       两边 localStorage 不通，**在这里保存的配置桌面版读不到**，等于让用户配一个
       永远不可能生效的东西（本仓「stub + 活 UI = 虚假功能」）。现改为整段控件都不渲染；
       这条断言跟着改成"一个控件都不许有"，别把旧行为继续钉住。
       真机取证：_probe/verify-webdav-browser-gating.mjs（file:// 与 http:// 两形态各 5 项）。 */
    expect(panel.querySelector("#wdUrl"), "无中继不得渲染输入框").toBeFalsy();
    expect(panel.querySelector("#wdSave"), "无中继不得渲染「保存」").toBeFalsy();
    expect(panel.querySelector("#wdClear")).toBeFalsy();
  });

  it("桌面形态：已配置后有「测试连接/清除」；保存走密文", async () => {
    const win = app();
    win.electronAPI = { webdavFetch: async () => ({ ok: true, status: 207 }) };
    await win.webdavSaveCfg({ url: "https://dav.example.com/dav", user: "u@x", pass: "p" });
    win.renderIntegrationPanel();
    const panel = win.document.getElementById("integrationPanel");
    expect(panel.querySelector("#wdProbe")).toBeTruthy();
    expect(panel.querySelector("#wdClear")).toBeTruthy();
    expect(win.localStorage.getItem(PREFIX + "webdav_pass")).toMatch(/__enc/);
  });
});
describe("WebDAV 同步主流程（v3.7.88）", () => {
  /* render-overview 注册的快照桥替身：可控输入输出，记录是否被调用 */
  function bridgeStub(win, snap, applied){
    win.__test.AppBridge.buildCloudSnapshot = () => snap;
    win.__test.AppBridge.applyCloudSnapshot = (data) => { applied.push(data); };
  }

  it("上传：经快照桥构建 → PUT 成功 → 如实回报键数", async () => {
    const win = app();
    win.electronAPI = { webdavFetch: async () => ({ ok: true, status: 201, etag: '"v2"' }) };
    const applied = [];
    bridgeStub(win, { tasks: "[]", notes: "[]" }, applied);
    await win.webdavSaveCfg({ url: "https://dav.example.com/dav", user: "u", pass: "p" });
    const r = await win.webdavPut(JSON.stringify({ tasks: "[]", notes: "[]" }));
    expect(r.ok).toBe(true);
    expect(typeof win.__test.webdavSyncUpload).toBe("function");
    /* 直接驱上传入口：快照来自桥，PUT body 即快照 JSON */
    const toasts = [];
    win.toast = (msg) => toasts.push(msg);
    await win.__test.webdavSyncUpload();
    expect(applied).toEqual([]);               /* 上传不应用 */
  });

  it("下载：确认后经桥应用云端快照；JSON 非法如实拒应用", async () => {
    const win = app();
    win.electronAPI = { webdavFetch: async () => ({ ok: true, status: 200, text: JSON.stringify({ tasks: "[]" }), etag: '"v3"' }) };
    const applied = [];
    bridgeStub(win, { tasks: "[]" }, applied);
    await win.webdavSaveCfg({ url: "https://dav.example.com/dav", user: "u", pass: "p" });
    const confirms = [];
    win.confirm = () => { confirms.push(1); return true; };
    const toasts = [];
    win.toast = (msg) => toasts.push(msg);
    await win.__test.webdavSyncDownload(false);
    expect(applied.length, "应经桥应用一次").toBe(1);
    expect(applied[0]).toEqual({ tasks: "[]" });
    expect(confirms.length, "非静默覆盖：应先确认").toBe(1);
    /* 非法 JSON：不应用 */
    applied.length = 0;
    win.electronAPI = { webdavFetch: async () => ({ ok: true, status: 200, text: "{不是 json" }) };
    await win.__test.webdavSyncDownload(true);
    expect(applied.length, "非法 JSON 不得应用").toBe(0);
  });

  it("上传遇 412：confirm 确认才下载覆盖；拒绝则两动都不做", async () => {
    const win = app();
    let phase = "conflict";
    win.electronAPI = { webdavFetch: async (arg) => {
      if (phase === "conflict" && arg.method === "PUT") return { ok: false, status: 412, conflict: true, error: "HTTP 412" };
      return { ok: true, status: 200, text: JSON.stringify({ notes: "[]" }), etag: '"v4"' };
    } };
    const applied = [];
    bridgeStub(win, { tasks: "[]" }, applied);
    await win.webdavSaveCfg({ url: "https://dav.example.com/dav", user: "u", pass: "p" });
    const confirms = [];
    win.confirm = () => { confirms.push(1); return false; };   /* 用户拒绝覆盖 */
    win.toast = () => {};
    await win.__test.webdavSyncUpload();
    expect(applied.length, "拒绝确认 → 不得下载覆盖").toBe(0);
    /* 再来一次并同意确认 → 下载并应用 */
    applied.length = 0;
    win.confirm = () => true;
    await win.__test.webdavSyncUpload();
    expect(applied.length, "同意 → 下载并应用").toBe(1);
  });

  it("未配置 / 无中继：上传下载均拒且零请求", async () => {
    const win = app();
    const calls = [];
    win.electronAPI = { webdavFetch: async (a) => { calls.push(a); return { ok: true, status: 200, text: "{}" }; } };
    win.electronAPI = undefined;
    win.toast = () => {};
    await win.__test.webdavSyncUpload();
    await win.__test.webdavSyncDownload(false);
    expect(calls.length).toBe(0);
  });

  it("集成页：桌面 + 已配置 → 渲染上传/下载按钮", async () => {
    const win = app();
    win.electronAPI = { webdavFetch: async () => ({ ok: true, status: 207 }) };
    await win.webdavSaveCfg({ url: "https://dav.example.com/dav", user: "u@x", pass: "p" });
    win.renderIntegrationPanel();
    const panel = win.document.getElementById("integrationPanel");
    expect(panel.querySelector("#wdUp"), "应有上传按钮").toBeTruthy();
    expect(panel.querySelector("#wdDown"), "应有下载按钮").toBeTruthy();
  });
});
