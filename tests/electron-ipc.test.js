// 阶段二·Electron IPC mock 测试
// 目标：验证 electron/main.js 中 ipcMain.handle("get-auto-launch") 与 ipcMain.on("set-auto-launch")
//      正确调用 app.getLoginItemSettings / app.setLoginItemSettings 并返回预期值。
// 策略：把 "electron" 整体替换为 stub（用 vi.fn 构造，保持 vitest mock 语义），再动态 import
//      main.js 触发顶层注册，捕获 ipcMain.handle/on 注册的句柄后手动触发并断言。main.js 不改动。

// 用 node 环境：main.js 顶层使用 fs/path/zlib/Buffer 等 Node 内置能力。
// @vitest-environment node

import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from "vitest";
import Module from "node:module";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

/* 受信发送方 URL：= 仓库根 agent-workbench.html（main.js _APP_FILES 成员），按本文件位置动态构造。
 * 不要写死某台机器的绝对路径 —— 此前写死 file:///F:/Nexus/... 使 CI Ubuntu 上 checkout 路径不同，
 * 信任校验把"受信"页也拒了，19 条用例全红（v3.7.61 后 CI 实测）。 */
const TRUSTED_FILE_URL = pathToFileURL(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "agent-workbench.html")).href;

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

// v1.11.1 [M4]：主进程 IPC 已加 sender 信任校验（assertTrustedSender 要求 senderFrame.url 为本应用自己的页面），
// 测试事件对象需模拟真实渲染端形态。
// v3.7.59：判定口径收紧为与导航守卫 _isInternalUrl 同源 —— 只认「本应用自己的页面 + about:blank」，
// 非本应用的 file:// 同样拒绝。故这里补 foreignFileEv() 守这一行为（下方用例）。
function trustedEv(id){
  return { sender: { id: id || "s1" }, senderFrame: { url: TRUSTED_FILE_URL } };
}
function forgedEv(){
  return { sender: { id: "evil" }, senderFrame: { url: "https://evil.example.com/index.html" } };
}
/** 非本应用的本地 HTML —— 修复前会被 `file://` 前缀判定放行 */
function foreignFileEv(){
  return { sender: { id: "evil-local" }, senderFrame: { url: "file:///C:/Users/public/evil.html" } };
}
/** 报表打印窗口：window.open("") + document.write 产生，必须放行 */
function blankEv(id){
  return { sender: { id: id || "s1" }, senderFrame: { url: "about:blank" } };
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
      await expect(ipcHandlers["chat"]({ sender: { id: "s1" }, senderFrame: { url: TRUSTED_FILE_URL } }, chatReq())).rejects.toThrow("AI base URL 不安全");
      expect(calls.length).toBe(0);
    });
    it("http://localhost 放行并携带 Key", async () => {
      freshConfig({ enabled: true, profiles: { p1: { base: "http://localhost:1234/v1", model: "m", key: "secret" } } });
      const { calls } = installFetch();
      const r = await ipcHandlers["chat"]({ sender: { id: "s1" }, senderFrame: { url: TRUSTED_FILE_URL } }, chatReq());
      expect(r.choices[0].message.content).toBe("hi");
      expect(calls.length).toBe(1);
      expect(calls[0].url).toBe("http://localhost:1234/v1/chat/completions");
      expect(calls[0].opts.headers.Authorization).toBe("Bearer secret");
    });
    it("未配置（无 ai-config.enc）抛 AI 未配置", async () => {
      const { calls } = installFetch();
      await expect(ipcHandlers["chat"]({ sender: { id: "s1" }, senderFrame: { url: TRUSTED_FILE_URL } }, chatReq())).rejects.toThrow("AI 未配置");
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
      const r = await ipcHandlers["chat"]({ sender: { id: "s1" }, senderFrame: { url: TRUSTED_FILE_URL } }, Object.assign(chatReq(), { profileId: "b" }));
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
      const p = ipcHandlers["chat"]({ sender: { id: "s1" }, senderFrame: { url: TRUSTED_FILE_URL } }, chatReq());
      const assertion = expect(p).rejects.toThrow("请求过于频繁"); // 先 attach，避免 advance 期间 unhandled rejection
      await vi.advanceTimersByTimeAsync(7000);
      await assertion;
      expect(calls.length).toBe(3);
    });
    it("请求超时抛超时错误", async () => {
      vi.useFakeTimers();
      freshConfig({ enabled: true, profiles: { p1: { base: "https://api.example.com/v1", model: "m", key: "k" } } });
      installFetch("pending");
      const p = ipcHandlers["chat"]({ sender: { id: "s1" }, senderFrame: { url: TRUSTED_FILE_URL } }, chatReq({ timeoutSec: 5 }));
      const assertion = expect(p).rejects.toThrow("请求超时"); // 先 attach
      await vi.advanceTimersByTimeAsync(6000);
      await assertion;
    });
    it("进行中取消 → __USER_CANCEL__", async () => {
      freshConfig({ enabled: true, profiles: { p1: { base: "https://api.example.com/v1", model: "m", key: "k" } } });
      installFetch("pending");
      const p = ipcHandlers["chat"]({ sender: { id: "s1" }, senderFrame: { url: TRUSTED_FILE_URL } }, chatReq());
      ipcHandlers["abort-chat"]({ sender: { id: "s1" }, senderFrame: { url: TRUSTED_FILE_URL } });
      await expect(p).rejects.toThrow("__USER_CANCEL__");
    });
    it("退避 sleep 窗口内取消 → 下一轮不发出请求", async () => {
      vi.useFakeTimers();
      freshConfig({ enabled: true, profiles: { p1: { base: "https://api.example.com/v1", model: "m", key: "k" } } });
      const { calls } = installFetch("status", 429);
      const p = ipcHandlers["chat"]({ sender: { id: "s1" }, senderFrame: { url: TRUSTED_FILE_URL } }, chatReq());
      const assertion = expect(p).rejects.toThrow("__USER_CANCEL__"); // 先 attach
      await vi.advanceTimersByTimeAsync(500); // 第一次 429 已返回，处于第一次退避 sleep 中
      ipcHandlers["abort-chat"]({ sender: { id: "s1" }, senderFrame: { url: TRUSTED_FILE_URL } });
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
    /* v3.7.59：判定收紧为「本应用页面 + about:blank」。这两条守的就是收紧本身 ——
       没有它们，任何人把 assertTrustedSender 改回 `url.startsWith("file://")` 都不会被发现。 */
    it("非本应用的 file:// 来源被拒绝（收紧前会被 file:// 前缀放行）", async () => {
      freshConfig({ enabled: true, profiles: { p1: { base: "https://api.example.com/v1", model: "m", key: "k" } } });
      const { calls } = installFetch();
      await expect(ipcHandlers["chat"](foreignFileEv(), chatReq())).rejects.toThrow("不受信任");
      expect(calls.length, "被拒的请求不得发出").toBe(0);
    });
    it("非本应用的 file:// 调 set-ai-config 被拒且不落盘", async () => {
      freshConfig({ enabled: false, profiles: {} });
      expect(() => ipcHandlers["set-ai-config"](foreignFileEv(), { enabled: true, profiles: [] })).toThrow("不受信任");
      expect(readConfigFile()).toEqual({ enabled: false, profiles: {} });
    });
    it("about:blank 来源放行（报表打印窗口依赖）", async () => {
      // get-ai-config 会返回配置对象；能拿到结果即说明未被 assertTrustedSender 拦下
      const r = await ipcHandlers["get-ai-config"](blankEv());
      expect(r).toBeTruthy();
      expect(typeof r.enabled).toBe("boolean");
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

/* ============================================================
 * notify-send：主进程代渲染进程发群机器人 webhook（v3.7.66）
 * 为什么需要这条 IPC：真实网络实测 —— 钉钉 webhook 的预检与 POST 都不回
 * Access-Control-Allow-Origin、企业微信预检 403，而 webhook 是 application/json
 * 的 POST 必触发预检；本窗口 sandbox:true 且未关 webSecurity，渲染进程走 Chromium
 * 网络栈 → 发不出去。主进程用 Node 全局 fetch，不受 CORS 约束。
 * 这条 IPC 等于「渲染进程可以让主进程对一个 URL 发 POST」，所以白名单是承重墙：
 * 下面每一拒绝路径都必须断言 fetch 一次都没发生（否则就是 SSRF / 数据外泄出口）。
 * ============================================================ */
describe("Electron IPC: notify-send 主进程 webhook 外发", () => {
  let tmpDir = null;
  let origGetPathImpl = null;
  const OK_URL = "https://oapi.dingtalk.com/robot/send?access_token=TOK-abc123";
  const OK_PAYLOAD = { msgtype: "text", text: { content: "hello" } };

  const installFetch = (behavior) => {
    const calls = [];
    const fn = vi.fn((url, opts) => {
      calls.push({ url, opts });
      if (behavior === "boom") return Promise.reject(new Error("ECONNREFUSED"));
      if (behavior === "pending"){
        /* 必须真的响应 abort：真实 fetch 在 signal 触发时是**拒绝**的，
           替身若永不 settle，超时用例只会等到 vitest 自身超时（实测 60s 挂死），
           根本测不到被测代码的超时分支。 */
        return new Promise((resolve, reject) => {
          if (opts && opts.signal){
            if (opts.signal.aborted) { const e = new Error("aborted"); e.name = "AbortError"; reject(e); return; }
            opts.signal.addEventListener("abort", () => { const e = new Error("aborted"); e.name = "AbortError"; reject(e); });
          }
        });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ errcode: 0, errmsg: "ok" }) });
    });
    vi.stubGlobal("fetch", fn);
    return { fn, calls };
  };
  const logText = () => {
    try { return readFileSync(path.join(tmpDir, "logs", "app.log"), "utf8"); } catch (e) { return ""; }
  };

  beforeEach(async () => {
    await ensureMain();
    const app = mockAppRef.current;
    if (origGetPathImpl === null) origGetPathImpl = app.getPath.getMockImplementation();
    tmpDir = mkdtempSync(path.join(os.tmpdir(), "aw-notify-"));
    app.getPath.mockReturnValue(tmpDir);
  });
  afterEach(() => {
    if (tmpDir) { try { rmSync(tmpDir, { recursive: true, force: true }); } catch (e) { /* noop */ } tmpDir = null; }
    const app = mockAppRef.current;
    if (app && origGetPathImpl !== null) app.getPath.mockImplementation(origGetPathImpl);
    vi.unstubAllGlobals();
  });

  it("白名单内：POST 带 JSON，返回主进程读到的业务体", async () => {
    const { calls } = installFetch();
    const r = await ipcHandlers["notify-send"](trustedEv(), { url: OK_URL, payload: OK_PAYLOAD });
    expect(r.ok).toBe(true);
    expect(r.status).toBe(200);
    expect(r.body.errcode).toBe(0);
    expect(calls.length).toBe(1);
    expect(calls[0].url).toBe(OK_URL);
    expect(calls[0].opts.method).toBe("POST");
    expect(calls[0].opts.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(calls[0].opts.body)).toEqual(OK_PAYLOAD);
  });

  it("飞书、企业微信与 Slack（v3.7.69）都在白名单内", async () => {
    const { calls } = installFetch();
    for (const u of ["https://open.feishu.cn/open-apis/bot/v2/hook/abc",
                    "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=abc",
                    "https://hooks.slack.com/services/T0/B0/xyz"]) {
      const r = await ipcHandlers["notify-send"](trustedEv(), { url: u, payload: OK_PAYLOAD });
      expect(r.ok, u).toBe(true);
    }
    expect(calls.length).toBe(3);
  });

  /* 以下每条都是「拒绝 + 零请求」：白名单一旦被写成前缀匹配或放行任意 https，
     这条 IPC 就变成让渲染进程驱动主进程打任意主机（SSRF + 内网探测）的出口。 */
  it("非白名单主机：拒绝且一次请求都不发", async () => {
    const { calls } = installFetch();
    const r = await ipcHandlers["notify-send"](trustedEv(), { url: "https://evil.example.com/robot/send", payload: OK_PAYLOAD });
    expect(r.ok).toBe(false);
    expect(r.error).toBe("unsafe_webhook_url");
    expect(calls.length).toBe(0);
  });

  it("Slack 子域伪装（hooks.slack.com.evil）：拒绝（v3.7.69）", async () => {
    const { calls } = installFetch();
    const r = await ipcHandlers["notify-send"](trustedEv(), { url: "https://hooks.slack.com.evil.example.com/services/T0/B0/x", payload: OK_PAYLOAD });
    expect(r.error).toBe("unsafe_webhook_url");
    expect(calls.length).toBe(0);
  });

  it("子域伪装（oapi.dingtalk.com.evil）：拒绝 —— 白名单必须精确匹配主机", async () => {
    const { calls } = installFetch();
    const r = await ipcHandlers["notify-send"](trustedEv(), { url: "https://oapi.dingtalk.com.evil.example.com/robot/send", payload: OK_PAYLOAD });
    expect(r.error).toBe("unsafe_webhook_url");
    expect(calls.length).toBe(0);
  });

  it("userinfo 拼接（https://oapi.dingtalk.com@evil）：拒绝", async () => {
    const { calls } = installFetch();
    const r = await ipcHandlers["notify-send"](trustedEv(), { url: "https://oapi.dingtalk.com@evil.example.com/x", payload: OK_PAYLOAD });
    expect(r.error).toBe("unsafe_webhook_url");
    expect(calls.length).toBe(0);
  });

  it("明文 http、回环与私网：一律拒绝（webhook 只可能是 https）", async () => {
    const { calls } = installFetch();
    for (const u of ["http://oapi.dingtalk.com/robot/send", "https://127.0.0.1:8124/x",
                    "https://169.254.169.254/latest/meta-data", "javascript:alert(1)", "not-a-url", ""]) {
      const r = await ipcHandlers["notify-send"](trustedEv(), { url: u, payload: OK_PAYLOAD });
      expect(r.error, `应拒绝 ${JSON.stringify(u)}`).toBe("unsafe_webhook_url");
    }
    expect(calls.length).toBe(0);
  });

  it("payload 非对象或数组：拒绝且不发请求", async () => {
    const { calls } = installFetch();
    for (const bad of ["string", 42, null, undefined, ["a"], () => {}]) {
      const r = await ipcHandlers["notify-send"](trustedEv(), { url: OK_URL, payload: bad });
      expect(r.error, `应拒绝 payload=${typeof bad === "function" ? "function" : JSON.stringify(bad)}`).toBe("bad_payload");
    }
    expect(calls.length).toBe(0);
  });

  it("空对象 payload 属合法结构（内容由调用方负责），仍会发出请求", async () => {
    const { calls } = installFetch();
    const r = await ipcHandlers["notify-send"](trustedEv(), { url: OK_URL, payload: {} });
    expect(r.ok).toBe(true);
    expect(calls.length).toBe(1);
  });

  it("未受信发送方：直接抛错（与 chat 同一道 M4 门）", async () => {
    const { calls } = installFetch();
    await expect(ipcHandlers["notify-send"](forgedEv(), { url: OK_URL, payload: OK_PAYLOAD })).rejects.toThrow();
    await expect(ipcHandlers["notify-send"](foreignFileEv(), { url: OK_URL, payload: OK_PAYLOAD })).rejects.toThrow();
    expect(calls.length).toBe(0);
  });

  it("网络异常：返回 {ok:false,error}，绝不把异常抛回渲染进程", async () => {
    installFetch("boom");
    const r = await ipcHandlers["notify-send"](trustedEv(), { url: OK_URL, payload: OK_PAYLOAD });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/ECONNREFUSED/);
  });

  it("超时：到点 abort 并回报超时", async () => {
    installFetch("pending");
    const t0 = Date.now();
    const r = await ipcHandlers["notify-send"](trustedEv(), { url: OK_URL, payload: OK_PAYLOAD, timeoutMs: 1000 });
    expect(r.ok).toBe(false);
    expect(r.error, "超时必须报成超时而不是静默失败：" + r.error).toMatch(/超时/);
    expect(Date.now() - t0).toBeLessThan(5000);
  });

  it("timeoutMs 越界被钳制（不许设成 0 立即 abort，也不许无限等）", async () => {
    installFetch();
    const r1 = await ipcHandlers["notify-send"](trustedEv(), { url: OK_URL, payload: OK_PAYLOAD, timeoutMs: 0 });
    expect(r1.ok, "timeoutMs=0 应被钳到下限而不是当成 0 超时").toBe(true);
    const r2 = await ipcHandlers["notify-send"](trustedEv(), { url: OK_URL, payload: OK_PAYLOAD, timeoutMs: 999999 });
    expect(r2.ok).toBe(true);
  });

  /* 日志泄露是这类"代外部请求"最容易漏的一环：token 在 URL 里、签名在 URL/body 里、正文是用户数据。 */
  it("日志只记主机与状态码，绝不记 access_token / 正文", async () => {
    const { calls } = installFetch();
    await ipcHandlers["notify-send"](trustedEv(), {
      url: OK_URL + "&timestamp=1700000000000&sign=SIGN-SECRET-VALUE",
      payload: { msgtype: "text", text: { content: "机密正文-DO-NOT-LOG" } }
    });
    expect(calls.length).toBe(1);
    const log = logText();
    expect(log, "日志必须有记录").toMatch(/notify/);
    expect(log, "🔴 日志泄露 access_token").not.toContain("TOK-abc123");
    expect(log, "🔴 日志泄露 sign").not.toContain("SIGN-SECRET-VALUE");
    expect(log, "🔴 日志泄露消息正文").not.toContain("机密正文-DO-NOT-LOG");
    expect(log).toContain("oapi.dingtalk.com");
  });
});

/* ============================================================
 * jira-fetch：Jira REST 请求主进程中转（v3.7.79）
 * 为什么必须中转：Atlassian 的 REST 端点不回 CORS 头（真网络实测 file:// 与 http(s)
 * 双双被拦、主进程 Node fetch 可达）—— 浏览器形态连验证都发不出去。
 * 这条 IPC = 让渲染进程驱动主进程带 Bearer token 访问网站，域名/路径/方法白名单是承重墙：
 * 下面每条拒绝路径都必须断言 fetch 一次都没发生（否则就是 SSRF / 凭据外泄出口）。
 * ============================================================ */
describe("Electron IPC: jira-fetch 主进程中转", () => {
  /* notify-send 组的 installFetch 是那个 describe 的局部常量，这里自带一份同款 */
  const installFetch = () => {
    const calls = [];
    const fn = vi.fn((url, opts) => {
      calls.push({ url, opts });
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ accountId: "u1" }) });
    });
    vi.stubGlobal("fetch", fn);
    return { fn, calls };
  };
  afterEach(() => { vi.unstubAllGlobals(); });
  const OK_ARG = { domain: "corp.atlassian.net", path: "/rest/api/3/myself", method: "GET", token: "TK-secret" };
  const logText2 = () => { try { return readFileSync(path.join(mockAppRef.current.getPath("userData"), "logs", "app.log"), "utf8"); } catch (e) { return ""; } };

  it("合法调用：GET https://<domain><path> 带 Bearer，无 body", async () => {
    const { calls } = installFetch();
    const r = await ipcHandlers["jira-fetch"](trustedEv(), OK_ARG);
    expect(r.ok).toBe(true);
    expect(calls.length).toBe(1);
    expect(calls[0].url).toBe("https://corp.atlassian.net/rest/api/3/myself");
    expect(calls[0].opts.method).toBe("GET");
    expect(calls[0].opts.headers.Authorization).toBe("Bearer TK-secret");
    expect(calls[0].opts.body).toBeUndefined();
  });

  it("POST 带 body 原样透传；PUT/DELETE 在白名单内", async () => {
    const { calls } = installFetch();
    await ipcHandlers["jira-fetch"](trustedEv(), Object.assign({}, OK_ARG, { method: "POST", path: "/rest/api/3/issue", body: JSON.stringify({ fields: {} }) }));
    await ipcHandlers["jira-fetch"](trustedEv(), Object.assign({}, OK_ARG, { method: "PUT", path: "/rest/api/3/issue/1" }));
    await ipcHandlers["jira-fetch"](trustedEv(), Object.assign({}, OK_ARG, { method: "DELETE", path: "/rest/api/3/issue/1" }));
    expect(calls.length).toBe(3);
    expect(calls[0].opts.body).toContain("fields");
  });

  it("域名白名单必须精确：子域伪装 / 裸 atlassian.net / 任意主机 / 端口 / 路径粘连 一律拒", async () => {
    const { calls } = installFetch();
    for (const d of ["evil.atlassian.net.evil.com", "atlassian.net", "x.github.com", "a.atlassian.net.evil", "corp.atlassian.net/x", "corp.atlassian.net:8443"]) {
      const r = await ipcHandlers["jira-fetch"](trustedEv(), Object.assign({}, OK_ARG, { domain: d }));
      expect(r.error, d).toBe("bad_domain");
    }
    expect(calls.length).toBe(0);
  });

  it("大小写归一化：CORP.ATLASSIAN.NET 放行（主进程统一 toLowerCase 判定）", async () => {
    const { calls } = installFetch();
    const r = await ipcHandlers["jira-fetch"](trustedEv(), Object.assign({}, OK_ARG, { domain: "CORP.ATLASSIAN.NET" }));
    expect(r.ok).toBe(true);
    expect(calls[0].url).toBe("https://corp.atlassian.net/rest/api/3/myself");
  });

  it("路径必须 /rest/ 开头（只放 REST 面）；方法白名单；token 必填；body 上限", async () => {
    const { calls } = installFetch();
    expect((await ipcHandlers["jira-fetch"](trustedEv(), Object.assign({}, OK_ARG, { path: "/admin/users" }))).error).toBe("bad_path");
    expect((await ipcHandlers["jira-fetch"](trustedEv(), Object.assign({}, OK_ARG, { path: "rest/api" }))).error).toBe("bad_path");
    expect((await ipcHandlers["jira-fetch"](trustedEv(), Object.assign({}, OK_ARG, { method: "PATCH" }))).error).toBe("bad_method");
    expect((await ipcHandlers["jira-fetch"](trustedEv(), Object.assign({}, OK_ARG, { token: "" }))).error).toBe("no_token");
    const big = "x".repeat(2 * 1024 * 1024 + 1);
    expect((await ipcHandlers["jira-fetch"](trustedEv(), Object.assign({}, OK_ARG, { method: "POST", body: big }))).error).toBe("body_too_large");
    expect(calls.length).toBe(0);
  });

  it("未受信 sender：拒绝", async () => {
    installFetch();
    await expect(ipcHandlers["jira-fetch"](forgedEv(), OK_ARG)).rejects.toThrow("IPC 拒绝");
  });

  it("🔴 日志只记主机与状态码：绝不出现 token 与正文", async () => {
    installFetch();
    await ipcHandlers["jira-fetch"](trustedEv(), Object.assign({}, OK_ARG, { method: "POST", path: "/rest/api/3/issue", body: JSON.stringify({ fields: { summary: "机密正文-DO-NOT-LOG" } }) }));
    const log = logText2();
    expect(log).toContain("corp.atlassian.net");
    expect(log, "🔴 日志泄露 token").not.toContain("TK-secret");
    expect(log, "🔴 日志泄露消息正文").not.toContain("机密正文-DO-NOT-LOG");
  });
});

/* ============================================================
 * ics-fetch：ICS 订阅只读中转（v3.7.84）
 * 与 jira-fetch 同为「用户自填 URL」类接口，但 URL 完全开放 —— 安全面按**开放 SSRF**取严：
 * https 必 / 拒 userinfo / 拒回环·私网·链路本地·.local / **redirect:error**（防 302 跳内网）/
 * ≤2MB / 12s / 不带认证头 / 日志只记主机与状态码。每条拒绝路径都必须零请求。
 * ============================================================ */
describe("Electron IPC: ics-fetch 订阅只读中转", () => {
  const OK_ARG = { url: "https://cal.example.com/basic.ics" };
  const icsLog = () => { try { return readFileSync(path.join(mockAppRef.current.getPath("userData"), "logs", "app.log"), "utf8"); } catch (e) { return ""; } };
  const installFetch2 = (behavior) => {
    const calls = [];
    const fn = vi.fn((url, opts) => {
      calls.push({ url, opts });
      if (behavior === "boom") return Promise.reject(new Error("ECONNREFUSED"));
      return Promise.resolve({ ok: true, status: 200, headers: { get: (k) => (k === "etag" ? "ET1" : "") }, arrayBuffer: async () => new TextEncoder().encode("BEGIN:VCALENDAR\r\nEND:VCALENDAR").buffer });
    });
    vi.stubGlobal("fetch", fn);
    return { fn, calls };
  };
  afterEach(() => { vi.unstubAllGlobals(); });

  it("合法订阅：GET + Accept:text/calendar + 回传正文与 etag", async () => {
    const { calls } = installFetch2();
    const r = await ipcHandlers["ics-fetch"](trustedEv(), OK_ARG);
    expect(r.ok).toBe(true);
    expect(calls.length).toBe(1);
    expect(calls[0].url).toBe("https://cal.example.com/basic.ics");
    expect(calls[0].opts.method).toBe("GET");
    expect(calls[0].opts.redirect).toBe("error");
    expect(String(calls[0].opts.headers.Accept)).toMatch(/text\/calendar/);
    expect(r.text).toContain("VCALENDAR");
    expect(r.etag).toBe("ET1");
  });

  it("条件请求头透传（If-None-Match / If-Modified-Since）", async () => {
    const { calls } = installFetch2();
    await ipcHandlers["ics-fetch"](trustedEv(), Object.assign({}, OK_ARG, { etag: "ET9", lastModified: "LM9" }));
    expect(calls[0].opts.headers["If-None-Match"]).toBe("ET9");
    expect(calls[0].opts.headers["If-Modified-Since"]).toBe("LM9");
  });

  it("🔴 非 https / userinfo：拒且零请求", async () => {
    const { calls } = installFetch2();
    for (const bad of ["http://cal.example.com/x.ics", "https://user:pass@cal.example.com/x.ics", "not-a-url"]) {
      const r = await ipcHandlers["ics-fetch"](trustedEv(), Object.assign({}, OK_ARG, { url: bad }));
      expect(r.ok, bad).toBe(false);
    }
    expect(calls.length).toBe(0);
  });

  it("🔴 回环 / 私网 / 链路本地 / .local / localhost：拒且零请求（开放 SSRF 的核心防线）", async () => {
    const { calls } = installFetch2();
    for (const h of ["127.0.0.1", "127.0.0.1:8124", "10.0.0.5", "192.168.1.1", "172.16.0.9", "169.254.169.254"   /* 172.32 是公网段，不该被当私网拒 */, "0.0.0.0", "localhost", "nas.local", "box.internal", "[::1]"]) {
      const r = await ipcHandlers["ics-fetch"](trustedEv(), Object.assign({}, OK_ARG, { url: "https://" + h + "/x.ics" }));
      expect(r.error, h).toBe("forbidden_host");
    }
    expect(calls.length).toBe(0);
  });

  it("未受信 sender：拒绝", async () => {
    installFetch2();
    await expect(ipcHandlers["ics-fetch"](forgedEv(), OK_ARG)).rejects.toThrow("IPC 拒绝");
  });

  it("🔴 日志只记主机与状态码", async () => {
    installFetch2();
    await ipcHandlers["ics-fetch"](trustedEv(), OK_ARG);
    const log = icsLog();
    expect(log).toContain("cal.example.com");
    expect(log).not.toContain("basic.ics");
  });
});

/* ============================================================
 * webdav-fetch：WebDAV 云同步中转（v3.7.87）
 * 与 ics-fetch 同一套防线（https / 拒 userinfo / 拒回环·私网·链路本地 / redirect:error /
 * 方法白名单 / body 封顶 / 日志只记主机与方法）。412（ETag 冲突）如实回传。
 * ============================================================ */
describe("Electron IPC: webdav-fetch 云同步中转", () => {
  const WD_OK = { url: "https://dav.example.com/dav/agent-workshop-snapshot.json", method: "PUT", body: "{}", auth: "Basic dXNlcjpwYXNz" };
  const wdLog = () => { try { return readFileSync(path.join(mockAppRef.current.getPath("userData"), "logs", "app.log"), "utf8"); } catch (e) { return ""; } };
  const installWd = (behavior) => {
    const calls = [];
    const fn = vi.fn((url, opts) => {
      calls.push({ url, opts });
      if (behavior === "conflict") return Promise.resolve({ ok: false, status: 412, headers: new Map([["etag", '"v1"']]) });
      if (behavior === "propfind") return Promise.resolve({ ok: true, status: 207, headers: new Map() });
      return Promise.resolve({ ok: true, status: 201, headers: new Map([["etag", '"v1"'], ["last-modified", "LM"]]), text: async () => "{}" });
    });
    vi.stubGlobal("fetch", fn);
    return { fn, calls };
  };
  afterEach(() => { vi.unstubAllGlobals(); });

  it("PUT 合法调用：带 Authorization 参数（不记日志）+ 回传 ETag", async () => {
    const { calls } = installWd();
    const r = await ipcHandlers["webdav-fetch"](trustedEv(), WD_OK);
    expect(r.ok).toBe(true);
    expect(r.etag).toBe('"v1"');
    expect(calls[0].url).toBe("https://dav.example.com/dav/agent-workshop-snapshot.json");
    expect(calls[0].opts.method).toBe("PUT");
    expect(calls[0].opts.redirect).toBe("error");
    expect(calls[0].opts.headers.Authorization).toBe("Basic dXNlcjpwYXNz");
    const log = wdLog();
    expect(log).toContain("dav.example.com");
    expect(log, "🔴 日志泄露应用密码").not.toContain("dXNlcjpwYXNz");
  });

  it("条件头透传：If-Match / If-None-Match / Depth / Range", async () => {
    const { calls } = installWd();
    await ipcHandlers["webdav-fetch"](trustedEv(), Object.assign({}, WD_OK, { ifMatch: '"v1"', ifNoneMatch: "*", range: "bytes=0-99" }));
    expect(calls[0].opts.headers["If-Match"]).toBe('"v1"');
    expect(calls[0].opts.headers["If-None-Match"]).toBe("*");
    expect(calls[0].opts.headers.Range).toBe("bytes=0-99");
  });

  it("PROPFIND 207 视作可达；412 视作冲突（conflict=true）如实回传", async () => {
    installWd("propfind");
    expect((await ipcHandlers["webdav-fetch"](trustedEv(), { url: "https://dav.example.com/dav/", method: "PROPFIND", depth: "0", auth: "Basic x" })).ok).toBe(true);
    vi.unstubAllGlobals();
    installWd("conflict");
    const r = await ipcHandlers["webdav-fetch"](trustedEv(), WD_OK);
    expect(r.conflict).toBe(true);
  });

  it("🔴 http / userinfo / 私网·回环 / 非法方法 / 超大 body：拒且零请求", async () => {
    const { calls } = installWd();
    const bad = [
      Object.assign({}, WD_OK, { url: "http://dav.example.com/x" }),
      Object.assign({}, WD_OK, { url: "https://user:pass@dav.example.com/x" }),
      Object.assign({}, WD_OK, { url: "https://127.0.0.1/x" }),
      Object.assign({}, WD_OK, { url: "https://192.168.1.5/dav" }),
      Object.assign({}, WD_OK, { url: "https://169.254.169.254/latest" }),
      Object.assign({}, WD_OK, { url: "https://nas.local/dav" }),
      Object.assign({}, WD_OK, { method: "PATCH" }),
      Object.assign({}, WD_OK, { body: "x".repeat(2 * 1024 * 1024 + 1) }),
    ];
    for (const arg of bad) {
      const r = await ipcHandlers["webdav-fetch"](trustedEv(), arg);
      expect(r.ok, JSON.stringify(String(arg.url).slice(0, 40)) + " " + arg.method).toBe(false);
    }
    expect(calls.length, "所有拒绝路径必须零请求").toBe(0);
  });

  it("未受信 sender：拒绝", async () => {
    installWd();
    await expect(ipcHandlers["webdav-fetch"](forgedEv(), WD_OK)).rejects.toThrow("IPC 拒绝");
  });
});
