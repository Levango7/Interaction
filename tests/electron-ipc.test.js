// 阶段二·Electron IPC mock 测试
// 目标：验证 electron/main.js 中 ipcMain.handle("get-auto-launch") 与 ipcMain.on("set-auto-launch")
//      正确调用 app.getLoginItemSettings / app.setLoginItemSettings 并返回预期值。
// 策略：把 "electron" 整体替换为 stub（用 vi.fn 构造，保持 vitest mock 语义），再动态 import
//      main.js 触发顶层注册，捕获 ipcMain.handle/on 注册的句柄后手动触发并断言。main.js 不改动。

// 用 node 环境：main.js 顶层使用 fs/path/zlib/Buffer 等 Node 内置能力。
// @vitest-environment node

import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import Module from "node:module";

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
    const result = await ipcHandlers["get-auto-launch"]();
    expect(result).toBe(true);
    expect(mockApp.getLoginItemSettings).toHaveBeenCalled();
  });

  it("get-auto-launch 在 getLoginItemSettings 抛错时返回 false", async () => {
    await ensureMain();
    const mockApp = mockAppRef.current;
    mockApp.getLoginItemSettings.mockImplementation(() => {
      throw new Error("perm");
    });
    const result = await ipcHandlers["get-auto-launch"]();
    expect(result).toBe(false);
  });

  it("set-auto-launch(true) 调用 setLoginItemSettings with openAtLogin:true", async () => {
    await ensureMain();
    const mockApp = mockAppRef.current;
    ipcHandlers["set-auto-launch"]({}, true);
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
    ipcHandlers["set-auto-launch"]({}, false);
    expect(mockApp.setLoginItemSettings).toHaveBeenCalledWith({
      openAtLogin: false,
      path: "C:/fake/app.exe",
      args: [],
    });
  });
});
