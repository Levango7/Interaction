// 局域网同步 HTTP server 真实集成测试（v3.1.1 快照架构）
// 目标：不打桩 http 层——动态加载 electron/main.js 让 startSyncServer() 真实监听
//      127.0.0.1 动态端口，用原生 fetch 发起真实请求验证下载/push 白名单/upload 中转/404。
// 策略与 electron-ipc.test.js 相同：Module._load 拦截 require("electron")，
// 但 BrowserWindow 实例补齐 webContents.send 探针以覆盖 upload 中转分支。
// @vitest-environment node

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import Module from "node:module";
import net from "node:net";

// 并发安全：每个 vitest worker 是独立进程。先探一个空闲端口，
// 经 INTERACTION_SYNC_PORT 覆写 main.js 默认的 8124，避免与其他
// 加载 main.js 的测试 worker 双重绑定同一回环端口（Windows → ECONNRESET）。
let SYNC_BASE = ""; // waitForServer 首次调用时确定实际基址

function pickFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

const { ipcHandlers, originalLoadRef, cachedStubRef, webSendSpyRef, appEventCbsRef } = vi.hoisted(() => ({
  ipcHandlers: {},
  originalLoadRef: { current: null },
  cachedStubRef: { current: null },
  webSendSpyRef: { current: null },
  appEventCbsRef: { current: {} },
}));

function createElectronStub() {
  if (cachedStubRef.current) return cachedStubRef.current;
  webSendSpyRef.current = vi.fn();
  const makeWinInstance = () => {
    const target = {
      isDestroyed: () => false,
      webContents: new Proxy(
        { send: webSendSpyRef.current },
        { get(t, k) { if (k === "then") return undefined; if (k in t) return t[k]; return (...a) => ({}); } },
      ),
    };
    return new Proxy(target, {
      get(t, k) {
        if (k === "then") return undefined;
        if (k in t) return t[k];
        return (...a) => ({});
      },
    });
  };
  cachedStubRef.current = {
    app: {
      getVersion: vi.fn(() => "1.0.0"),
      isPackaged: false,
      getPath: vi.fn((k) => (k === "exe" ? "C:/fake/app.exe" : "C:/fake")),
      getLoginItemSettings: vi.fn(() => ({ openAtLogin: false })),
      setLoginItemSettings: vi.fn(),
      setAppUserModelId: vi.fn(),
      requestSingleInstanceLock: vi.fn(() => true),
      whenReady: vi.fn(() => Promise.resolve()),
      quit: vi.fn(),
      on: vi.fn((ev, cb) => { appEventCbsRef.current[ev] = cb; }),
    },
    BrowserWindow: Object.assign(vi.fn(() => makeWinInstance()), { getAllWindows: vi.fn(() => []) }),
    Tray: vi.fn(() => ({ setToolTip: vi.fn(), setContextMenu: vi.fn(), on: vi.fn() })),
    Menu: { buildFromTemplate: vi.fn() },
    nativeImage: { createFromBuffer: vi.fn() },
    session: { defaultSession: { webRequest: { onHeadersReceived: vi.fn() } } },
    safeStorage: {
      isEncryptionAvailable: () => true,
      encryptString: (s) => Buffer.from(s, "utf8"),
      decryptString: (buf) => (Buffer.isBuffer(buf) ? buf.toString("utf8") : String(buf)),
    },
    ipcMain: {
      handle: (key, fn) => { ipcHandlers[key] = fn; },
      on: (key, fn) => { ipcHandlers[key] = fn; },
    },
  };
  return cachedStubRef.current;
}

vi.mock("electron", () => createElectronStub());
originalLoadRef.current = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === "electron") return createElectronStub();
  return originalLoadRef.current.call(this, request, parent, isMain);
};

afterAll(async () => {
  // 触发 before-quit 关闭 server，释放端口并让 vitest 事件循环可退出
  const quit = appEventCbsRef.current["before-quit"];
  if (typeof quit === "function") quit();
  await new Promise((r) => setTimeout(r, 150));
  if (originalLoadRef.current) {
    Module._load = originalLoadRef.current;
    originalLoadRef.current = null;
  }
});

function trustedEv() {
  return { sender: { id: "s1" }, senderFrame: { url: "file:///F:/Nexus/Interaction/agent-workbench.html" } };
}

let mainLoaded = false;
async function waitForServer(timeoutMs = 3000) {
  if (!mainLoaded) {
    const port = await pickFreePort();
    process.env.INTERACTION_SYNC_PORT = String(port);
    SYNC_BASE = `http://127.0.0.1:${port}`;
    await import("../electron/main.js");
    mainLoaded = true;
  }
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${SYNC_BASE}/sync/download`);
      if (r.ok) return;
    } catch (_) { /* not yet */ }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("sync server 未在超时内就绪");
}

describe("局域网同步 server（127.0.0.1 动态端口）真实集成", () => {
  beforeAll(() => waitForServer());

  it("GET /sync/download：空快照时返回 _deviceMeta(deviceId 稳定, empty=true)", async () => {
    const r1 = await fetch(`${SYNC_BASE}/sync/download`);
    expect(r1.status).toBe(200);
    const b1 = await r1.json();
    expect(b1._deviceMeta.empty).toBe(true);
    expect(typeof b1._deviceMeta.deviceId).toBe("string");
    expect(b1._deviceMeta.deviceId).toMatch(/^[0-9a-f-]{36}$/);

    const r2 = await fetch(`${SYNC_BASE}/sync/download`);
    const b2 = await r2.json();
    expect(b2._deviceMeta.deviceId).toBe(b1._deviceMeta.deviceId); // 会话内稳定
  });

  it("sync-push：白名单过滤后快照经 download 可见；非法载荷拒绝", async () => {
    const ok = await ipcHandlers["sync-push"](
      trustedEv(),
      { wb_agent_mem: '{"k":1}', wb_custom_links: "[1]", junk_key: "should-drop", bad_type: 42 },
    );
    expect(ok).toEqual({ ok: true, keys: 2 });

    const r = await fetch(`${SYNC_BASE}/sync/download`);
    const b = await r.json();
    expect(b.wb_agent_mem).toBe('{"k":1}');
    expect(b.wb_custom_links).toBe("[1]");
    expect(b.junk_key).toBeUndefined();
    expect(b._deviceMeta.empty).toBe(false);

    const bad = await ipcHandlers["sync-push"](trustedEv(), null);
    expect(bad.ok).toBe(false);
    const arr = await ipcHandlers["sync-push"](trustedEv(), [1, 2]);
    expect(arr.ok).toBe(false);
  });

  it("POST /sync/upload：合法 JSON → 202 并中转 sync-upload-request 给渲染进程", async () => {
    const payload = { wb_agent_x: "hello" };
    const r = await fetch(`${SYNC_BASE}/sync/upload`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    expect(r.status).toBe(202);
    expect(await r.json()).toEqual({ accepted: true });
    expect(webSendSpyRef.current).toHaveBeenCalledWith("sync-upload-request", payload);
  });

  it("POST /sync/upload：坏 JSON → 400", async () => {
    const r = await fetch(`${SYNC_BASE}/sync/upload`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not-json",
    });
    expect(r.status).toBe(400);
  });

  it("未知路径 → 404", async () => {
    const r = await fetch(`${SYNC_BASE}/nope`);
    expect(r.status).toBe(404);
  });
});

