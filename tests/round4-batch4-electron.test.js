// 第四轮 批次④ · B7 托盘图标 PNG 有效性 + B8 主进程 chat 参数钳制
// 策略：与 electron-ipc.test.js 相同——Node 模块层拦截 require("electron") 返回 stub，
//      动态 import main.js 触发注册；userData 指向独立临时目录（不污染真实数据）。
// @vitest-environment node

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import Module from "node:module";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "awb-batch4-"));

const { handlers, pngBuffers, stubRef, originalLoadRef } = vi.hoisted(() => ({
  handlers: {},
  pngBuffers: [],
  stubRef: { current: null },
  originalLoadRef: { current: null },
}));

function createStub(){
  if (stubRef.current) return stubRef.current;
  const app = {
    getVersion: vi.fn(() => "1.1.5"),
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
    nativeImage: { createFromBuffer: vi.fn((buf) => { pngBuffers.push(Buffer.from(buf)); return {}; }) },
    session: { defaultSession: { webRequest: { onHeadersReceived: vi.fn() } } },
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

// v1.11.1 [M4]：主进程 IPC 已加 sender 信任校验，测试事件需带 file:// 的 senderFrame
function trustedEv(){
  return { sender: { id: "s1" }, senderFrame: { url: "file:///F:/Nexus/Interaction/electron/agent-workbench.html" } };
}

// 预置旧版派生密钥格式的 ai-config.enc，使 loadAiConfig 能解出带 key 的配置
beforeAll(async () => {
  const key = crypto.createHash("sha256").update("agent-workbench::ai::" + os.hostname() + "::" + (process.env.USERNAME || process.env.USER || "")).digest();
  const payload = JSON.stringify({ base: "", model: "gpt-4o-mini", enabled: true, key: "sk-test" });
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([c.update(payload, "utf8"), c.final()]);
  fs.writeFileSync(path.join(userDataDir, "ai-config.enc"), Buffer.concat([iv, c.getAuthTag(), enc]));
  await import("../electron/main.js");
  await new Promise((r) => setTimeout(r, 0)); // 等 whenReady().then 完成注册
});

/* ---------- PNG 解析工具（本项目生成的 PNG 每行 filter 字节恒为 0，可直接读像素） ---------- */
function parsePng(buf){
  expect([...buf.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]); // PNG 签名
  let off = 8, w = 0, h = 0, colorType = 0, idat = [];
  while (off < buf.length){
    const len = buf.readUInt32BE(off);
    const type = buf.subarray(off + 4, off + 8).toString("ascii");
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === "IHDR"){ w = data.readUInt32BE(0); h = data.readUInt32BE(4); colorType = data[9]; }
    if (type === "IDAT") idat.push(data);
    off += 12 + len;
  }
  const raw = require("node:zlib").inflateSync(Buffer.concat(idat));
  const px = (x, y) => { const o = y * (w * 4 + 1) + 1 + x * 4; return [raw[o], raw[o + 1], raw[o + 2], raw[o + 3]]; };
  return { w, h, colorType, px };
}

describe("B7 · 托盘图标 PNG", () => {
  it("生成了 32×32 RGBA PNG（窗口图标 + 托盘图标各一份）", () => {
    expect(pngBuffers.length).toBeGreaterThanOrEqual(2);
    const img = parsePng(pngBuffers[0]);
    expect(img.w).toBe(32);
    expect(img.h).toBe(32);
    expect(img.colorType).toBe(6); // RGBA
  });

  it("圆角四角透明、边缘为蓝底（不再是纯色方块）", () => {
    const img = parsePng(pngBuffers[0]);
    expect(img.px(1, 1)[3]).toBe(0);        // 圆角外：全透明
    const edge = img.px(16, 1);              // 顶部边缘中央：蓝底
    expect(edge[3]).toBe(255);
    expect(edge[0]).toBe(0x0a); expect(edge[1]).toBe(0x6c); expect(edge[2]).toBe(0xbd);
  });

  it("中央绘制了白色 A 字标（笔画处接近白色，笔画间为蓝底）", () => {
    const img = parsePng(pngBuffers[0]);
    const stroke = img.px(12, 16);           // 左斜边笔画上
    expect(stroke[0]).toBeGreaterThan(180);
    expect(stroke[1]).toBeGreaterThan(180);
    expect(stroke[2]).toBeGreaterThan(180);
    const gap = img.px(16, 23);              // 两腿之间：蓝底
    expect(gap[0]).toBe(0x0a); expect(gap[1]).toBe(0x6c); expect(gap[2]).toBe(0xbd);
  });
});

describe("B8 · 主进程 chat 参数钳制", () => {
  it("temperature 超范围被钳制到 2，超时被钳制到 120s，并体现在请求体/定时器", async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, status: 401 }));
    global.fetch = fetchMock;
    const stSpy = vi.spyOn(global, "setTimeout");
    try {
      await expect(handlers.chat(trustedEv(), { messages: [{ role: "user", content: "hi" }], temperature: 5, timeoutSec: 999 }))
        .rejects.toThrow("API Key 无效");
      // 请求体温度已钳制
      const call = fetchMock.mock.calls[0];
      const body = JSON.parse(call[1].body);
      expect(body.temperature).toBe(2);
      // 超时定时器使用钳制后的 120s
      const delays = stSpy.mock.calls.map((c) => c[1]);
      expect(delays).toContain(120000);
    } finally {
      stSpy.mockRestore();
    }
  });

  it("非法参数（非数字）回退默认值 0.7 / 30s", async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, status: 401 }));
    global.fetch = fetchMock;
    const stSpy = vi.spyOn(global, "setTimeout");
    try {
      await expect(handlers.chat(trustedEv(), { messages: [], temperature: "abc", timeoutSec: "xyz" }))
        .rejects.toThrow("API Key 无效");
      const body = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(body.temperature).toBe(0.7);
      const delays = stSpy.mock.calls.map((c) => c[1]);
      expect(delays).toContain(30000);
    } finally {
      stSpy.mockRestore();
    }
  });
});
