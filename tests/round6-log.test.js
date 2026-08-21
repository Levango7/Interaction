// 第六轮 R3 · 主进程日志结构化（JSON Lines）
// 策略：与 round4-batch4-electron.test.js 相同——Node 模块层拦截 require("electron") 返回 stub，
//      动态 import main.js；userData 指向独立临时目录。触发 chat 请求（内部调用 logLine），
//      读取 userData/logs/app.log 断言每行是合法 JSON 且含 ts/scope/msg。
// @vitest-environment node

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import Module from "node:module";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "awb-r6-log-"));

const { handlers, stubRef, originalLoadRef } = vi.hoisted(() => ({
  handlers: {},
  stubRef: { current: null },
  originalLoadRef: { current: null },
}));

function createStub(){
  if (stubRef.current) return stubRef.current;
  const app = {
    getVersion: vi.fn(() => "1.1.6"),
    isPackaged: false,
    getPath: vi.fn((k) => (k === "userData" ? userDataDir : (k === "exe" ? "C:/fake/app.exe" : "C:/fake"))),
    getLoginItemSettings: vi.fn(() => ({ openAtLogin: false })),
    setLoginItemSettings: vi.fn(),
    setAppUserModelId: vi.fn(),
    requestSingleInstanceLock: vi.fn(() => true),
    whenReady: vi.fn(() => Promise.resolve()),
    on: vi.fn(),
    quit: vi.fn(),
  };
  const stub = {
    app,
    BrowserWindow: Object.assign(
      vi.fn(() => ({ on: vi.fn(), loadFile: vi.fn(), show: vi.fn(), focus: vi.fn(), hide: vi.fn(), isVisible: vi.fn(() => true) })),
      { getAllWindows: vi.fn(() => []) }
    ),
    Tray: vi.fn(() => ({ setToolTip: vi.fn(), setContextMenu: vi.fn(), on: vi.fn() })),
    Menu: { buildFromTemplate: vi.fn(), setApplicationMenu: vi.fn() },
    nativeImage: { createFromBuffer: vi.fn(() => ({})) },
    ipcMain: {
      handle: (key, fn) => { handlers[key] = fn; },
      on: (key, fn) => { handlers[key] = fn; },
    },
  };
  stubRef.current = stub;
  return stub;
}

vi.mock("electron", () => createStub());
originalLoadRef.current = Module._load;
Module._load = function patchedLoad(request){
  if (request === "electron") return createStub();
  return originalLoadRef.current.apply(this, arguments);
};
afterAll(() => {
  if (originalLoadRef.current) { Module._load = originalLoadRef.current; originalLoadRef.current = null; }
});

beforeAll(async () => {
  // 预置旧版派生密钥格式的 ai-config.enc，使 loadAiConfig 能解出带 key 的配置
  const key = crypto.createHash("sha256").update("agent-workbench::ai::" + os.hostname() + "::" + (process.env.USERNAME || process.env.USER || "")).digest();
  const payload = JSON.stringify({ base: "", model: "gpt-4o-mini", enabled: true, key: "sk-test" });
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([c.update(payload, "utf8"), c.final()]);
  fs.writeFileSync(path.join(userDataDir, "ai-config.enc"), Buffer.concat([iv, c.getAuthTag(), enc]));
  await import("../electron/main.js");
  await new Promise((r) => setTimeout(r, 0)); // 等 whenReady().then 完成注册
});

describe("R3 · 主进程日志结构化", () => {
  it("chat 请求写出的日志每行均为合法 JSON（ts/scope/msg）", async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, status: 401 }));
    global.fetch = fetchMock;
    // v1.11.1 [M4]：chat IPC 已加 sender 信任校验，事件需带 file:// 的 senderFrame
    const trustedEv = { sender: { id: "s1" }, senderFrame: { url: "file:///F:/Nexus/Interaction/electron/agent-workbench.html" } };
    // 触发一次 chat：内部走 logLine("chat", ...)
    await expect(handlers.chat(trustedEv, { messages: [{ role: "user", content: "hi" }], temperature: 0.7, timeoutSec: 30 }))
      .rejects.toThrow("API Key 无效");
    const logFile = path.join(userDataDir, "logs", "app.log");
    expect(fs.existsSync(logFile)).toBe(true);
    const lines = fs.readFileSync(logFile, "utf8").split("\n").filter(Boolean);
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines){
      let obj;
      expect(() => { obj = JSON.parse(line); }).not.toThrow();
      expect(typeof obj.ts).toBe("string");
      expect(typeof obj.scope).toBe("string");
      expect(typeof obj.msg).toBe("string");
      expect(obj.scope).toBe("chat");
    }
  });
});
