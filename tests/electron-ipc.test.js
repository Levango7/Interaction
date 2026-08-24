// 阶段二·Electron IPC mock 测试
// 目标：验证 electron/main.js 中 ipcMain.handle("get-auto-launch") 与 ipcMain.on("set-auto-launch")
//      正确调用 app.getLoginItemSettings / app.setLoginItemSettings 并返回预期值。
// 策略：把 "electron" 整体替换为 stub（用 vi.fn 构造，保持 vitest mock 语义），再动态 import
//      main.js 触发顶层注册，捕获 ipcMain.handle/on 注册的句柄后手动触发并断言。main.js 不改动。

// 用 node 环境：main.js 顶层使用 fs/path/zlib/Buffer 等 Node 内置能力。
// @vitest-environment node

import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import Module from "node:module";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

// vi.mock 工厂会被提升到文件顶部，因此工厂内不能直接引用外部 const 变量。
// 用 vi.hoisted 把共享容器与 stub 工厂也提升到顶部，工厂与测试体通过引用读写同一对象。
const { ipcHandlers, mockAppRef, createElectronStub, originalLoadRef, cachedStubRef } = vi.hoisted(() => ({
  // key -> handler 句柄；ipcMain.handle 与 ipcMain.on 共用此表（key 不冲突）
  ipcHandlers: {},
  // 存放工厂内创建的 mockApp，供测试体读取
  mockAppRef: { current: null },
  // 存放被替换前的 Module._load，用于 afterAll 还原
  originalLoadRef: { current: null },
  // stub 缓存：首次 createElectronStub 创建后缓存，后续 require("electron") 返回同一对象，
  // 避免 main.js 或其依赖（如 electron-updater）再次 require("electron") 时创建新 stub 覆盖 mockAppRef.current
  cachedStubRef: { current: null },
  // 构造 electron stub；首次调用创建并缓存，后续调用直接返回缓存对象
  createElectronStub: () => {
    if (cachedStubRef.current) return cachedStubRef.current;
    mockAppRef.current = {
      getVersion: vi.fn(() => "1.0.0"),
      isPackaged: false,
      getPath: vi.fn((k) => (k === "exe" ? "C:/fake/app.exe" : "C:/fake")),
      getLoginItemSettings: vi.fn(() => ({ openAtLogin: false })),
      setLoginItemSettings: vi.fn(),
      setAppUserModelId: vi.fn(),
      requestSingleInstanceLock: vi.fn(() => true),
      whenReady: vi.fn(() => Promise.resolve()),
      on: vi.fn(),
      quit: vi.fn(),
    };
    const stub = {
      app: mockAppRef.current,
      // BrowserWindow 既作为构造函数，又带静态 getAllWindows（activate 处理器用到）
      BrowserWindow: Object.assign(
        vi.fn(() => ({
          on: vi.fn(),
          loadFile: vi.fn(),
          show: vi.fn(),
          focus: vi.fn(),
          hide: vi.fn(),
          isVisible: vi.fn(() => true),
        })),
        { getAllWindows: vi.fn(() => []) }
      ),
      Tray: vi.fn(() => ({
        setToolTip: vi.fn(),
        setContextMenu: vi.fn(),
        on: vi.fn(),
      })),
      Menu: { buildFromTemplate: vi.fn() },
      nativeImage: { createFromBuffer: vi.fn() },
      session: { defaultSession: { webRequest: { onHeadersReceived: vi.fn() } } },
      safeStorage: {
        isEncryptionAvailable: () => true,
        encryptString: (s) => Buffer.from(s, "utf8"),
        decryptString: (buf) => (Buffer.isBuffer(buf) ? buf.toString("utf8") : String(buf)),
      },
      ipcMain: {
        handle: (key, fn) => {
          ipcHandlers[key] = fn;
        },
        on: (key, fn) => {
          ipcHandlers[key] = fn;
        },
      },
    };
    cachedStubRef.current = stub;
    return stub;
  },
}));

// 保险：若走 ESM import "electron" 路径，vi.mock 仍可拦截。
vi.mock("electron", () => createElectronStub());

// 关键：main.js 是 CJS，vitest 动态 import 时会用 Node 原生 require 加载它，绕过 vite 管线，
// 导致 vi.mock 无法拦截其内部 require("electron")。这里在 Node 模块系统层面拦截
// require("electron")，返回同一份 stub。仅拦截 "electron" 这一个请求，其余透传原实现。
originalLoadRef.current = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === "electron") {
    return createElectronStub();
  }
  return originalLoadRef.current.call(this, request, parent, isMain);
};

afterAll(() => {
  // 还原 Module._load，避免影响后续测试文件
  if (originalLoadRef.current) {
    Module._load = originalLoadRef.current;
    originalLoadRef.current = null;
  }
});

// v1.11.1 [M4]：主进程 IPC 已加 sender 信任校验（assertTrustedSender 要求 senderFrame.url 为 file://），
// 测试事件对象需模拟真实渲染端形态。
function trustedEv(id){
  return { sender: { id: id || "s1" }, senderFrame: { url: "file:///F:/Nexus/Interaction/electron/agent-workbench.html" } };
}
function forgedEv(){
  return { sender: { id: "evil" }, senderFrame: { url: "https://evil.example.com/index.html" } };
}

// 动态 import main.js 触发顶层注册（含 ipcMain.handle/on 注册与 app.whenReady 副作用）。
// 用 mainLoaded 守卫避免重复 import 触发重复注册/重复副作用。
let mainLoaded = false;
async function ensureMain() {
  if (!mainLoaded) {
    await import("../electron/main.js");
    mainLoaded = true;
  }
}

describe("Electron IPC: 开机自启", () => {
  beforeEach(() => {
    // 不清除 ipcHandlers：main.js 仅注册一次，清除后句柄会丢失。
    // 仅复位 getLoginItemSettings 的默认实现，避免上一个用例的 mockImplementation 残留。
    const app = mockAppRef.current;
    if (app) {
      app.getLoginItemSettings.mockReturnValue({ openAtLogin: false });
      app.getLoginItemSettings.mockClear();
      app.setLoginItemSettings.mockClear();
    }
  });

  it("get-auto-launch 返回当前 openAtLogin 布尔", async () => {
    await ensureMain();
    const mockApp = mockAppRef.current;
    mockApp.getLoginItemSettings.mockReturnValue({ openAtLogin: true });
    const result = await ipcHandlers["get-auto-launch"](trustedEv());
    expect(result).toBe(true);
    expect(mockApp.getLoginItemSettings).toHaveBeenCalled();
  });

  it("get-auto-launch 在 getLoginItemSettings 抛错时返回 false", async () => {
    await ensureMain();
    const mockApp = mockAppRef.current;
    mockApp.getLoginItemSettings.mockImplementation(() => {
      throw new Error("perm");
    });
    const result = await ipcHandlers["get-auto-launch"](trustedEv());
    expect(result).toBe(false);
  });

  it("set-auto-launch(true) 调用 setLoginItemSettings with openAtLogin:true", async () => {
    await ensureMain();
    const mockApp = mockAppRef.current;
    ipcHandlers["set-auto-launch"](trustedEv(), true);
    expect(mockApp.setLoginItemSettings).toHaveBeenCalledWith({
      openAtLogin: true,
      path: "C:/fake/app.exe",
      args: [],
    });
  });

  it("set-auto-launch(false) 调用 setLoginItemSettings with openAtLogin:false", async () => {
    await ensureMain();
    const mockApp = mockAppRef.current;
    mockApp.setLoginItemSettings.mockClear();
    ipcHandlers["set-auto-launch"](trustedEv(), false);
    expect(mockApp.setLoginItemSettings).toHaveBeenCalledWith({
      openAtLogin: false,
      path: "C:/fake/app.exe",
      args: [],
    });
  });
});

/* ============================================================
 * 阶段二·F1-F7：AI 配置与 chat 安全（IPC 加固）
 * 覆盖：base URL 校验 / 取消语义（含退避窗口）/ 429 重试 / 超时 /
 *       per-profile 存储 / key 保留与清除 / 旧单配置迁移
 * 策略：app.getPath 指向真实临时目录（ai-config.enc 读写真实发生），
 *       safeStorage mock 为「原样字符串往返」，fetch 用 stubGlobal 接管。
 * ============================================================ */
describe("Electron IPC: AI 配置与 chat 安全（F1-F7）", () => {
  let tmpDir = null;
  let origGetPathImpl = null;

  const cfgPath = () => path.join(tmpDir, "ai-config.enc");
  const freshConfig = (obj) => writeFileSync(cfgPath(), JSON.stringify(obj));
  const readConfigFile = () => {
    try { return JSON.parse(readFileSync(cfgPath(), "utf8")); }
    catch (e) { return null; }
  };
  const makeAbortError = () => { const e = new Error("aborted"); e.name = "AbortError"; return e; };
  const installFetch = (behavior, status) => {
    const calls = [];
    const pending = [];
    const fn = vi.fn((url, opts) => {
      calls.push({ url, opts });
      if (behavior === "pending"){
        return new Promise((resolve, reject) => {
          pending.push({ resolve, reject });
          if (opts && opts.signal){
            if (opts.signal.aborted){ reject(makeAbortError()); return; }
            opts.signal.addEventListener("abort", () => reject(makeAbortError()));
          }
        });
      }
      if (behavior === "status"){
        return Promise.resolve({ ok: false, status });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ ok: 1, choices: [{ message: { content: "hi" } }] }) });
    });
    vi.stubGlobal("fetch", fn);
    return { fn, calls, pending };
  };
  const chatReq = (extra) => Object.assign({ profileId: "p1", messages: [], temperature: 0.7, timeoutSec: 5 }, extra);

  beforeEach(async () => {
    await ensureMain();
    const app = mockAppRef.current;
    if (origGetPathImpl === null){
      origGetPathImpl = app.getPath.getMockImplementation();
    }
    tmpDir = mkdtempSync(path.join(os.tmpdir(), "aw-ipc-"));
    app.getPath.mockReturnValue(tmpDir);
  });
  afterEach(() => {
    if (tmpDir){ try { rmSync(tmpDir, { recursive: true, force: true }); } catch (e) { /* noop */ } tmpDir = null; }
    const app = mockAppRef.current;
    if (app && origGetPathImpl !== null) app.getPath.mockImplementation(origGetPathImpl);
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  describe("F1 base URL 校验", () => {
    it("http:// 公网 base 直接拒绝且不发请求", async () => {
      freshConfig({ enabled: true, profiles: { p1: { base: "http://evil.example.com/v1", model: "m", key: "k" } } });
      const { calls } = installFetch();
      await expect(ipcHandlers["chat"]({ sender: { id: "s1" }, senderFrame: { url: "file:///F:/Nexus/Interaction/electron/agent-workbench.html" } }, chatReq())).rejects.toThrow("AI base URL 不安全");
      expect(calls.length).toBe(0);
    });
    it("http://localhost 放行并携带 Key", async () => {
      freshConfig({ enabled: true, profiles: { p1: { base: "http://localhost:1234/v1", model: "m", key: "secret" } } });
      const { calls } = installFetch();
      const r = await ipcHandlers["chat"]({ sender: { id: "s1" }, senderFrame: { url: "file:///F:/Nexus/Interaction/electron/agent-workbench.html" } }, chatReq());
      expect(r.choices[0].message.content).toBe("hi");
      expect(calls.length).toBe(1);
      expect(calls[0].url).toBe("http://localhost:1234/v1/chat/completions");
      expect(calls[0].opts.headers.Authorization).toBe("Bearer secret");
    });
    it("未配置（无 ai-config.enc）抛 AI 未配置", async () => {
      const { calls } = installFetch();
      await expect(ipcHandlers["chat"]({ sender: { id: "s1" }, senderFrame: { url: "file:///F:/Nexus/Interaction/electron/agent-workbench.html" } }, chatReq())).rejects.toThrow("AI 未配置");
      expect(calls.length).toBe(0);
    });
  });

  describe("F3 per-profile 取配置", () => {
    it("chat 按 profileId 取对应 base/model/key", async () => {
      freshConfig({
        enabled: true,
        profiles: {
          a: { base: "https://a.example.com/v1", model: "ma", key: "ka" },
          b: { base: "https://b.example.com/v1", model: "mb", key: "kb" },
        },
      });
      const { calls } = installFetch();
      const r = await ipcHandlers["chat"]({ sender: { id: "s1" }, senderFrame: { url: "file:///F:/Nexus/Interaction/electron/agent-workbench.html" } }, Object.assign(chatReq(), { profileId: "b" }));
      expect(r.choices[0].message.content).toBe("hi");
      expect(calls.length).toBe(1);
      expect(calls[0].url).toBe("https://b.example.com/v1/chat/completions");
      expect(calls[0].opts.headers.Authorization).toBe("Bearer kb");
    });
  });

  describe("F2 重试 / 超时 / 取消", () => {
    it("429 退避重试 3 次后报「请求过于频繁」", async () => {
      vi.useFakeTimers();
      freshConfig({ enabled: true, profiles: { p1: { base: "https://api.example.com/v1", model: "m", key: "k" } } });
      const { calls } = installFetch("status", 429);
      const p = ipcHandlers["chat"]({ sender: { id: "s1" }, senderFrame: { url: "file:///F:/Nexus/Interaction/electron/agent-workbench.html" } }, chatReq());
      const assertion = expect(p).rejects.toThrow("请求过于频繁"); // 先 attach，避免 advance 期间 unhandled rejection
      await vi.advanceTimersByTimeAsync(7000);
      await assertion;
      expect(calls.length).toBe(3);
    });
    it("请求超时抛超时错误", async () => {
      vi.useFakeTimers();
      freshConfig({ enabled: true, profiles: { p1: { base: "https://api.example.com/v1", model: "m", key: "k" } } });
      installFetch("pending");
      const p = ipcHandlers["chat"]({ sender: { id: "s1" }, senderFrame: { url: "file:///F:/Nexus/Interaction/electron/agent-workbench.html" } }, chatReq({ timeoutSec: 5 }));
      const assertion = expect(p).rejects.toThrow("请求超时"); // 先 attach
      await vi.advanceTimersByTimeAsync(6000);
      await assertion;
    });
    it("进行中取消 → __USER_CANCEL__", async () => {
      freshConfig({ enabled: true, profiles: { p1: { base: "https://api.example.com/v1", model: "m", key: "k" } } });
      installFetch("pending");
      const p = ipcHandlers["chat"]({ sender: { id: "s1" }, senderFrame: { url: "file:///F:/Nexus/Interaction/electron/agent-workbench.html" } }, chatReq());
      ipcHandlers["abort-chat"]({ sender: { id: "s1" }, senderFrame: { url: "file:///F:/Nexus/Interaction/electron/agent-workbench.html" } });
      await expect(p).rejects.toThrow("__USER_CANCEL__");
    });
    it("退避 sleep 窗口内取消 → 下一轮不发出请求", async () => {
      vi.useFakeTimers();
      freshConfig({ enabled: true, profiles: { p1: { base: "https://api.example.com/v1", model: "m", key: "k" } } });
      const { calls } = installFetch("status", 429);
      const p = ipcHandlers["chat"]({ sender: { id: "s1" }, senderFrame: { url: "file:///F:/Nexus/Interaction/electron/agent-workbench.html" } }, chatReq());
      const assertion = expect(p).rejects.toThrow("__USER_CANCEL__"); // 先 attach
      await vi.advanceTimersByTimeAsync(500); // 第一次 429 已返回，处于第一次退避 sleep 中
      ipcHandlers["abort-chat"]({ sender: { id: "s1" }, senderFrame: { url: "file:///F:/Nexus/Interaction/electron/agent-workbench.html" } });
      await vi.advanceTimersByTimeAsync(3000); // sleep 结束 → 循环顶部捕获标记
      await assertion;
      expect(calls.length).toBe(1);
    });
  });

  describe("F3/F4 set/get-ai-config", () => {
    it("profiles 结构往返（不含明文 key）", async () => {
      await ipcHandlers["set-ai-config"](trustedEv(), {
        enabled: true,
        profiles: [
          { id: "a", base: "https://a/v1", model: "ma", key: "ka" },
          { id: "b", base: "https://b/v1", model: "mb", key: "kb" },
        ],
      });
      const c = await ipcHandlers["get-ai-config"](trustedEv());
      expect(c.enabled).toBe(true);
      expect(c.profiles).toEqual([
        { id: "a", base: "https://a/v1", model: "ma", keySet: true },
        { id: "b", base: "https://b/v1", model: "mb", keySet: true },
      ]);
      // 明文 key 绝不出现在返回值
      expect(JSON.stringify(c)).not.toContain("ka");
      expect(JSON.stringify(c)).not.toContain("kb");
    });
    it("key 省略 → 保留既有", async () => {
      await ipcHandlers["set-ai-config"](trustedEv(), { enabled: true, profiles: [{ id: "a", base: "https://a/v1", model: "ma", key: "ka" }] });
      await ipcHandlers["set-ai-config"](trustedEv(), { enabled: true, profiles: [{ id: "a", base: "https://a2/v1", model: "ma2" }] });
      const c = await ipcHandlers["get-ai-config"](trustedEv());
      expect(c.profiles[0]).toMatchObject({ id: "a", base: "https://a2/v1", model: "ma2", keySet: true });
    });
    it("key:null → 清除（F4）", async () => {
      await ipcHandlers["set-ai-config"](trustedEv(), { enabled: true, profiles: [{ id: "a", base: "https://a/v1", model: "ma", key: "ka" }] });
      await ipcHandlers["set-ai-config"](trustedEv(), { enabled: true, profiles: [{ id: "a", key: null }] });
      const c = await ipcHandlers["get-ai-config"](trustedEv());
      expect(c.profiles[0].keySet).toBe(false);
    });
    it("旧单配置自动迁移到 __legacy__ 并重写文件", async () => {
      freshConfig({ base: "https://old/v1", model: "mo", key: "oldkey", enabled: true });
      const c = await ipcHandlers["get-ai-config"](trustedEv());
      expect(c.profiles).toEqual([{ id: "__legacy__", base: "https://old/v1", model: "mo", keySet: true }]);
      const file = readConfigFile();
      expect(file.profiles.__legacy__.key).toBe("oldkey");
    });
  });

  /* ============================================================
   * v1.11.1 [M4] IPC sender 信任校验 + [M1] 导航守卫注册 + [L2] 自愈
   * 覆盖：伪造来源（https senderFrame）调用敏感 IPC 被拒；
   *       get-auto-launch 对不可信来源返回 false（fail-closed 不抛错）；
   *       web-contents-created 全局守卫已在主进程注册（冒烟）；
   *       注册路径失效时按当前 exe 重新注册。
   * ============================================================ */
  describe("M4 sender 信任校验 / M1 导航守卫 / L2 自愈", () => {
    it("伪造来源调用 chat 被拒绝（不受信任的调用来源）", async () => {
      freshConfig({ enabled: true, profiles: { p1: { base: "https://api.example.com/v1", model: "m", key: "k" } } });
      const { calls } = installFetch();
      await expect(ipcHandlers["chat"](forgedEv(), chatReq())).rejects.toThrow("不受信任");
      expect(calls.length).toBe(0);
    });
    it("伪造来源调用 set-ai-config 被拒绝且不落盘", async () => {
      freshConfig({ enabled: false, profiles: {} });
      // set-ai-config 为同步 handler：真实 Electron 会把同步抛错包装为 invoke 的
      // rejected promise；mock 直调表现为同步 throw，两种形态都验证拒绝语义。
      expect(() => ipcHandlers["set-ai-config"](forgedEv(), { enabled: true, profiles: [] })).toThrow("不受信任");
      expect(readConfigFile()).toEqual({ enabled: false, profiles: {} });
    });
    it("get-auto-launch 对不可信来源返回 false（fail-closed 不抛错）", async () => {
      const mockApp = mockAppRef.current;
      mockApp.getLoginItemSettings.mockReturnValue({ openAtLogin: true });
      const result = await ipcHandlers["get-auto-launch"](forgedEv());
      expect(result).toBe(false);
    });
    it("set-auto-launch 对不可信来源不产生副作用", async () => {
      const mockApp = mockAppRef.current;
      mockApp.setLoginItemSettings.mockClear();
      ipcHandlers["set-auto-launch"](forgedEv(), true);
      expect(mockApp.setLoginItemSettings).not.toHaveBeenCalled();
    });
    it("M1 冒烟：主进程源码含全局导航守卫（web-contents-created + setWindowOpenHandler + will-navigate）", async () => {
      // restoreMocks 会清空 mock 调用记录，import 期的 app.on 注册无法事后断言——
      // 改为对 main.js 源码做静态冒烟：三要素齐备即守卫已接线（行为级验证由 e2e/打包态覆盖）。
      const { fileURLToPath } = await import("node:url");
      const mainSrc = readFileSync(fileURLToPath(new URL("../electron/main.js", import.meta.url)), "utf8");
      expect(mainSrc).toContain('app.on("web-contents-created"');
      expect(mainSrc).toContain("setWindowOpenHandler");
      expect(mainSrc).toContain('"will-navigate"');
      expect(mainSrc).toContain("shell.openExternal");
    });
    it("L2 自愈：注册路径与当前 exe 不一致时 get-auto-launch 触发重新注册", async () => {
      const mockApp = mockAppRef.current;
      // 本 describe 的 beforeEach 将 getPath 整体指向 tmpDir，这里恢复 exe 的真实 mock 返回值
      mockApp.getPath.mockImplementation((k) => (k === "exe" ? "C:/fake/app.exe" : "C:/fake"));
      mockApp.getLoginItemSettings.mockReturnValue({ openAtLogin: true, path: "C:/moved/old-app.exe" });
      mockApp.setLoginItemSettings.mockClear();
      const result = await ipcHandlers["get-auto-launch"](trustedEv());
      expect(result).toBe(true);
      expect(mockApp.setLoginItemSettings).toHaveBeenCalledWith({ openAtLogin: true, path: "C:/fake/app.exe", args: [] });
    });
  });
});
