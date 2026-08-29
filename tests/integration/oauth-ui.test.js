// OAuth UI 接线回归（v3.1.1）：
// 修复前：electron/main.js 的 B3 OAuth 轻后端（oauth-begin PKCE + /oauth/callback +
// oauth-status 事件 + 加密令牌）完整可用，但渲染层零调用——"已实现但不可达"。
// 修复后：集成中心日历配置弹窗提供「OAuth 授权」路径——填 Client ID → 经主进程授权 →
// token 自动回填并走统一 connect 验证。本文件覆盖胶水函数与弹窗交互的可测面。
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadApp } from "../helpers/loadApp.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HTML = path.resolve(__dirname, "..", "..", "agent-workbench.html");

describe("OAuth UI：integrationOAuthBegin 胶水函数", () => {
  let win;

  beforeAll(() => {
    win = loadApp();
  });

  it("CALENDAR_OAUTH_ENDPOINTS 端点映射为服务商公共标准端点", () => {
    // 顶层 const 不挂 window（jsdom 同 INTEGRATION_TYPES 模式），端点契约经源码断言防漂移
    const m = /const CALENDAR_OAUTH_ENDPOINTS = \{[\s\S]*?\n\};/.exec(
      fs.readFileSync(HTML, "utf8")
    );
    expect(m).toBeTruthy();
    const body = m[0];
    expect(body).toContain("https://accounts.google.com/o/oauth2/v2/auth");
    expect(body).toContain("https://oauth2.googleapis.com/token");
    expect(body).toContain("https://www.googleapis.com/auth/calendar");
    expect(body).toContain("https://login.microsoftonline.com/common/oauth2/v2.0/authorize");
    expect(body).toContain("https://login.microsoftonline.com/common/oauth2/v2.0/token");
    expect(body).toContain("https://graph.microsoft.com/Calendars.ReadWrite");
    expect((body.match(/usePkce: true/g) || []).length).toBe(2); // 两家都走 PKCE
  });

  it("非 Electron 形态：明确提示仅桌面版支持，不静默失败", async () => {
    // jsdom 环境无 electronAPI（isElectron() false），返回带指引的错误
    const r = await win.integrationOAuthBegin("google_calendar", { clientId: "test-client-id" });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("Electron");
    expect(r.error).toContain("手动");
  });

  it("缺 Client ID：拦截并提示需先注册应用", async () => {
    const r = await win.integrationOAuthBegin("google_calendar", {});
    expect(r.ok).toBe(false);
    expect(r.error).toContain("Client ID");
  });

  it("未知 provider：拒绝并列出名字", async () => {
    const r = await win.integrationOAuthBegin("not_a_provider", { clientId: "x" });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("not_a_provider");
  });

  it("Electron 形态（stub electronAPI）：发起授权并经 oauth-status 事件拿 token", async () => {
    // 模拟 preload 暴露面：oauthBegin 返回 {ok:true,url,opened:true}；
    // onOauthStatus 注册回调后，主进程会在令牌交换完成时推送 {provider, ok, token:{accessToken}}
    let statusCb = null;
    const fakeApi = {
      oauthBegin: async (cfg) => {
        // 断言传给主进程的形状与 electron/main.js oauth-begin 的字段校验一致
        expect(cfg.provider).toBe("google_calendar");
        expect(cfg.authorizeUrl).toContain("accounts.google.com");
        expect(cfg.tokenUrl).toContain("oauth2.googleapis.com");
        expect(cfg.clientId).toBe("stub-client-id");
        expect(cfg.usePkce).toBe(true);
        return { ok: true, state: "s-state", url: "https://accounts.google.com/o/oauth2/v2/auth?...", opened: true };
      },
      onOauthStatus: (cb) => { statusCb = cb; },
      offOauthStatus: (cb) => { if (statusCb === cb) statusCb = null; }
    };
    const oldApi = win.electronAPI;
    win.electronAPI = fakeApi;
    try {
      const p = win.integrationOAuthBegin("google_calendar", { clientId: "stub-client-id" });
      // 模拟主进程令牌交换完成的推送（微任务后触发，确保监听已注册）
      await new Promise((res) => setTimeout(res, 20));
      expect(statusCb).toBeTruthy(); // onOauthStatus 已被调用（监听在位）
      statusCb({ provider: "google_calendar", ok: true, token: { accessToken: "stub-access-token" } });
      const r = await p;
      expect(r.ok).toBe(true);
      expect(r.token).toBe("stub-access-token");
      expect(statusCb).toBeNull(); // 完成后注销监听，无泄漏
    } finally {
      win.electronAPI = oldApi;
    }
  });

  it("Electron 形态：超时无回调 → 超时拒绝并注销监听（不悬挂 Promise）", async () => {
    let statusCb = null;
    const fakeApi = {
      oauthBegin: async () => ({ ok: true, url: "https://example.com", opened: true }),
      onOauthStatus: (cb) => { statusCb = cb; },
      offOauthStatus: (cb) => { if (statusCb === cb) statusCb = null; }
    };
    const oldApi = win.electronAPI;
    win.electronAPI = fakeApi;
    try {
      const t0 = Date.now();
      const r = await win.integrationOAuthBegin("google_calendar", { clientId: "stub-client-id" }, { timeout: 300 });
      const dt = Date.now() - t0;
      expect(r.ok).toBe(false);
      expect(r.error).toContain("超时");
      expect(dt).toBeGreaterThanOrEqual(280); // 真实走了 300ms 超时路径
      expect(dt).toBeLessThan(5000);
      expect(statusCb).toBeNull();
    } finally {
      win.electronAPI = oldApi;
    }
  });
});

describe("OAuth UI：配置弹窗交互", () => {
  let win;

  beforeAll(() => {
    win = loadApp();
  });

  afterEach(() => {
    const ov = win.document.getElementById("intCfgOverlay");
    if (ov) ov.remove();
  });

  it("日历配置弹窗含 Client ID 输入与 OAuth 授权按钮；其他 provider 无", () => {
    win.openIntegrationConfig("calendar");
    expect(win.document.getElementById("intcfg__calType")).toBeTruthy();
    expect(win.document.getElementById("intcfg_clientId")).toBeTruthy();
    expect(win.document.getElementById("intcfg_token")).toBeTruthy();
    expect(win.document.getElementById("btnIntCfgOAuth")).toBeTruthy();

    const ov2 = win.document.getElementById("intCfgOverlay");
    if (ov2) ov2.remove();
    win.openIntegrationConfig("notion");
    expect(win.document.getElementById("intcfg_token")).toBeTruthy();
    expect(win.document.getElementById("btnIntCfgOAuth")).toBeFalsy(); // 仅日历有 OAuth 路径
  });

  it("未选日历服务或未填 Client ID 时点 OAuth：toast 拦截，不发起授权", async () => {
    win.openIntegrationConfig("calendar");
    const btn = win.document.getElementById("btnIntCfgOAuth");
    // 不填任何内容直接点 → 第一个校验（日历服务有默认值，会走到 clientId 校验）
    let called = false;
    win.electronAPI = { oauthBegin: async () => { called = true; return { ok: true }; }, onOauthStatus: () => {}, offOauthStatus: () => {} };
    try {
      await btn.onclick();
      expect(called).toBe(false); // clientId 为空被拦，未到达 oauthBegin
      // 按钮文案恢复（不卡在「授权中…」）
      expect(btn.textContent).toBe("OAuth 授权");
    } finally {
      delete win.electronAPI;
    }
  });
});

describe("OAuth UI：源码契约（防回归）", () => {
  let src;

  beforeAll(() => {
    src = fs.readFileSync(HTML, "utf8");
  });

  it("渲染层真实调用 oauthBegin（不再零调用）", () => {
    expect(src).toContain("api.oauthBegin({");
  });

  it("授权状态监听有注销（offOauthStatus），无事件监听泄漏", () => {
    expect(src).toContain("offOauthStatus(onStatus)");
  });

  it("OAuth 错误路径明确指引浏览器形态不可用（不静默）", () => {
    expect(src).toContain("仅 Electron 桌面版支持");
  });

  it("传给主进程的 cfg 形状与 electron/main.js oauth-begin 字段校验一致", () => {
    const m = fs.readFileSync(path.resolve(__dirname, "..", "..", "electron", "main.js"), "utf8");
    expect(m).toContain("provider, authorizeUrl, tokenUrl, clientId, clientSecret, scope, usePkce");
    expect(src).toContain("authorizeUrl: ep.authorizeUrl");
    expect(src).toContain("tokenUrl: ep.tokenUrl");
    expect(src).toContain("clientId: clientId");
  });
});
