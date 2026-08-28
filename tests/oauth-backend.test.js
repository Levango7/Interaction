// B3：OAuth 轻后端 全生命周期测试（真实 HTTP 回调 + 本地 mock token 端点）
// 策略与 electron-ipc.test.js 相同：整体 stub electron → 动态 import main.js →
// 捕获 ipcMain.handle 句柄手动触发；回调走真实 HTTP（127.0.0.1:PORT/oauth/callback），
// token 交换指向测试内自起的 mock 端点（校验 grant_type / code_verifier）。
// @vitest-environment node

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import Module from "node:module";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import net from "node:net";

const { ipcHandlers, mockAppRef, originalLoadRef, cachedStubRef, shellRef, userDataRef } = vi.hoisted(() => ({
  ipcHandlers: {},
  mockAppRef: { current: null },
  originalLoadRef: { current: null },
  cachedStubRef: { current: null },
  shellRef: { current: null },
  userDataRef: { current: null },
}));

function createStub() {
  if (cachedStubRef.current) return cachedStubRef.current;
  userDataRef.current = mkdtempSync(path.join(os.tmpdir(), "aw-oauth-test-"));
  mockAppRef.current = {
    getVersion: vi.fn(() => "3.1.0"),
    isPackaged: false,
    getPath: vi.fn((k) => (k === "userData" ? userDataRef.current : "C:/fake")),
    requestSingleInstanceLock: vi.fn(() => true),
    whenReady: vi.fn(() => Promise.resolve()),
    on: vi.fn(),
    quit: vi.fn(),
    setAppUserModelId: vi.fn(),
  };
  shellRef.current = { openExternal: vi.fn() };
  const stub = {
    app: mockAppRef.current,
    BrowserWindow: Object.assign(
      vi.fn(() => ({
        on: vi.fn(), loadFile: vi.fn(), show: vi.fn(), focus: vi.fn(),
        hide: vi.fn(), isVisible: vi.fn(() => true),
      })),
      { getAllWindows: vi.fn(() => []) }
    ),
    Tray: vi.fn(() => ({ setToolTip: vi.fn(), setContextMenu: vi.fn(), on: vi.fn() })),
    Menu: { buildFromTemplate: vi.fn() },
    nativeImage: { createFromBuffer: vi.fn() },
    session: { defaultSession: { webRequest: { onHeadersReceived: vi.fn() } } },
    // 走 legacy AES-256-GCM 兜底路径 → 落盘为真密文，可断言"明文不落盘"
    safeStorage: { isEncryptionAvailable: () => false },
    shell: shellRef.current,
    ipcMain: {
      handle: (key, fn) => { ipcHandlers[key] = fn; },
      on: (key, fn) => { ipcHandlers[key] = fn; },
    },
  };
  cachedStubRef.current = stub;
  return stub;
}

vi.mock("electron", () => createStub());
originalLoadRef.current = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === "electron") return createStub();
  return originalLoadRef.current.call(this, request, parent, isMain);
};
afterAll(() => {
  if (originalLoadRef.current) {
    Module._load = originalLoadRef.current;
    originalLoadRef.current = null;
  }
  try { rmSync(userDataRef.current, { recursive: true, force: true }); } catch (e) { /* ignore */ }
});

function trustedEv() {
  return { sender: { id: "s1" }, senderFrame: { url: "file:///F:/Nexus/Interaction/electron/agent-workbench.html" } };
}
function forgedEv() {
  return { sender: { id: "evil" }, senderFrame: { url: "https://evil.example.com/index.html" } };
}

// ── 找空闲端口（bind 0 取号后释放，竞态概率可忽略）──
function freePort() {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => {
      const p = s.address().port;
      s.close(() => resolve(p));
    });
  });
}

// ── mock token 端点：记录请求体，按 grant_type 发牌 ──
const tokenHits = [];
let mockTokenUrl = null;
let mockServer = null;
function startMockTokenEndpoint() {
  return new Promise((resolve) => {
    mockServer = http.createServer((req, res) => {
      let body = "";
      req.on("data", (ch) => { body += ch; });
      req.on("end", () => {
        const params = new URLSearchParams(body);
        tokenHits.push(Object.fromEntries(params));
        const grant = params.get("grant_type");
        if (grant === "authorization_code") {
          if (!params.get("code_verifier")) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "pkce verifier required" }));
            return;
          }
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ access_token: "AT_1", refresh_token: "RT_1", expires_in: 3600, scope: "read" }));
        } else if (grant === "refresh_token") {
          if (params.get("refresh_token") !== "RT_1") {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "bad refresh token" }));
            return;
          }
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ access_token: "AT_2", refresh_token: "RT_2", expires_in: 3600 }));
        } else {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "unsupported grant" }));
        }
      });
    });
    mockServer.listen(0, "127.0.0.1", () => {
      mockTokenUrl = "http://127.0.0.1:" + mockServer.address().port + "/token";
      resolve();
    });
  });
}

let PORT = null;
let mainLoaded = false;
async function ensureMain() {
  if (mainLoaded) return;
  PORT = await freePort();
  process.env.INTERACTION_SYNC_PORT = String(PORT);
  await startMockTokenEndpoint();
  await import("../electron/main.js");
  await new Promise((r) => setTimeout(r, 200)); // whenReady 微任务 → server listen + handler 注册
  mainLoaded = true;
}
function get(pathname) {
  return new Promise((resolve, reject) => {
    http.get("http://127.0.0.1:" + PORT + pathname, (res) => {
      let body = "";
      res.on("data", (ch) => { body += ch; });
      res.on("end", () => resolve({ status: res.statusCode, body }));
    }).on("error", reject);
  });
}

beforeAll(async () => { await ensureMain(); });

describe("B3 OAuth 轻后端：授权发起（oauth-begin）", () => {
  it("PKCE：返回含 state/code_challenge/redirect_uri 的授权 URL 并唤起系统浏览器", () => {
    const r = ipcHandlers["oauth-begin"](trustedEv(), {
      provider: "notion",
      authorizeUrl: "https://auth.example.com/authorize",
      tokenUrl: mockTokenUrl,
      clientId: "cid-1",
      scope: "read",
      usePkce: true,
    });
    expect(r.ok).toBe(true);
    const u = new URL(r.url);
    expect(u.origin + u.pathname).toBe("https://auth.example.com/authorize");
    expect(u.searchParams.get("response_type")).toBe("code");
    expect(u.searchParams.get("client_id")).toBe("cid-1");
    expect(u.searchParams.get("redirect_uri")).toBe("http://127.0.0.1:" + PORT + "/oauth/callback");
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
    expect(u.searchParams.get("code_challenge")).toBeTruthy();
    expect(u.searchParams.get("state")).toBe(r.state);
    expect(shellRef.current.openExternal).toHaveBeenCalledWith(r.url);
  });

  it("缺字段/伪造来源被拒", () => {
    const bad = ipcHandlers["oauth-begin"](trustedEv(), { provider: "x" });
    expect(bad.ok).toBe(false);
    expect(() => ipcHandlers["oauth-begin"](forgedEv(), {
      provider: "x", authorizeUrl: "https://a", tokenUrl: "https://t", clientId: "c",
    })).toThrow();
  });
});

describe("B3 OAuth 轻后端：回调闭环（GET /oauth/callback）", () => {
  let state = null;
  it("完整流程：回调 → PKCE 交换 → 加密落盘 → IPC 取回明文", async () => {
    const r = ipcHandlers["oauth-begin"](trustedEv(), {
      provider: "notion",
      authorizeUrl: "https://auth.example.com/authorize",
      tokenUrl: mockTokenUrl,
      clientId: "cid-1",
      usePkce: true,
    });
    expect(r.ok).toBe(true);
    state = r.state;

    const res = await get("/oauth/callback?code=AUTHCODE&state=" + encodeURIComponent(state));
    expect(res.status).toBe(200);
    expect(res.body).toContain("\u2713");
    // v3.1.1 强化：成功页必须是真实渲染的样式与符号，而不是未求值的拼接源码文本
    // （此前 finishHtml 把 `+ (ok ? ...)` 写进了字符串字面量，弱断言 \u2713 仍会放行）
    expect(res.body).toContain("color:#34a853");
    expect(res.body).not.toContain("(ok ?");
    expect(res.body).not.toContain("' + ");
    // mock 端点确实收到 code + code_verifier（PKCE 闭环）
    expect(tokenHits.length).toBeGreaterThan(0);
    const hit = tokenHits[tokenHits.length - 1];
    expect(hit.grant_type).toBe("authorization_code");
    expect(hit.code).toBe("AUTHCODE");
    expect(hit.code_verifier).toBeTruthy();
    // 主进程按需下发明文
    const t = await ipcHandlers["oauth-tokens"](trustedEv(), "notion");
    expect(t.ok).toBe(true);
    expect(t.token.accessToken).toBe("AT_1");
    expect(t.token.expiresAt).toBeGreaterThan(Date.now());
    // 落盘为密文：文件字节不含明文 token
    const raw = readFileSync(path.join(userDataRef.current, "oauth-tokens.json.enc"));
    expect(raw.toString("latin1")).not.toContain("AT_1");
    expect(raw.toString("latin1")).not.toContain("RT_1");
  });

  it("state 一次性：重放同一 state → 400 且不再换牌", () => {
    const before = tokenHits.length;
    return get("/oauth/callback?code=AUTHCODE&state=" + encodeURIComponent(state)).then((res) => {
      expect(res.status).toBe(400);
      expect(tokenHits.length).toBe(before);
    });
  });

  it("未知 state / error 参数 → 400", async () => {
    expect((await get("/oauth/callback?code=x&state=unknown")).status).toBe(400);
    expect((await get("/oauth/callback?error=access_denied&state=whatever")).status).toBe(400);
  });

  it("v3.1.1 XSS 回归：error 参数经 HTML 转义，不反射原始标签", async () => {
    // 用一次新的 oauth-begin 取合法 state（error 分支现要求 state 有效才反射错误详情）
    const r = ipcHandlers["oauth-begin"](trustedEv(), {
      provider: "notion",
      authorizeUrl: "https://auth.example.com/authorize",
      tokenUrl: mockTokenUrl,
      clientId: "cid-1",
      usePkce: true,
    });
    expect(r.ok).toBe(true);
    const payload = "<script>alert(1)</script><img src=x onerror=fetch('/sync/download')>";
    const res = await get("/oauth/callback?error=" + encodeURIComponent(payload) + "&state=" + encodeURIComponent(r.state));
    expect(res.status).toBe(400);
    expect(res.body).not.toContain("<script>alert(1)");
    expect(res.body).not.toContain("<img");
    expect(res.body).toContain("&lt;script&gt;");
  });

  it("v3.1.1 伪造回调：未知 state 的 error 不反射 URL 参数（只给通用文案）", async () => {
    const res = await get("/oauth/callback?error=" + encodeURIComponent("FAKE_MARKER_XYZ") + "&state=forged-state");
    expect(res.status).toBe(400);
    expect(res.body).not.toContain("FAKE_MARKER_XYZ");
    expect(res.body).toContain("state 无效或已过期");
  });
});

describe("B3 OAuth 轻后端：刷新 / 列表 / 撤销", () => {
  it("oauth-refresh：用 RT_1 换 AT_2 并更新落盘", async () => {
    const r = await ipcHandlers["oauth-refresh"](trustedEv(), "notion");
    expect(r.ok).toBe(true);
    const t = await ipcHandlers["oauth-tokens"](trustedEv(), "notion");
    expect(t.token.accessToken).toBe("AT_2");
    const raw = readFileSync(path.join(userDataRef.current, "oauth-tokens.json.enc"));
    expect(raw.toString("latin1")).not.toContain("AT_2");
  });

  it("oauth-list：显示已连接", async () => {
    const l = await ipcHandlers["oauth-list"](trustedEv());
    expect(l.ok).toBe(true);
    expect(l.providers.notion.connected).toBe(true);
  });

  it("oauth-revoke：删除后 not connected；伪造来源被拒", async () => {
    expect((await ipcHandlers["oauth-revoke"](trustedEv(), "notion")).ok).toBe(true);
    const t = await ipcHandlers["oauth-tokens"](trustedEv(), "notion");
    expect(t.ok).toBe(false);
    expect(() => ipcHandlers["oauth-revoke"](forgedEv(), "notion")).toThrow();
  });
});
