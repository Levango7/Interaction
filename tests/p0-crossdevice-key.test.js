/**
 * P0-5 跨设备导入静默丢失 AI Key · 回归验证
 * ----------------------------------------------------------------------------
 * 闭环目标：把「跨设备导入后 AI Key 静默丢失 → 静默 401」变为「显式告警 + 浏览器态
 * 显式勾选可移植路径（安全默认：不勾选不出明文）」。
 *
 * 设计原则（test-discipline / anti-gaming）：
 *  - 黑盒优先：经 jsdom 全局直调顶层函数 doExport / doImport / getCfg / initCrypto；
 *    通过 mock Blob / URL / anchor / FileReader 在内存内完成，不落任何临时文件。
 *  - 沿用既有 harness（loadApp / window.__test）。不改 electron/*.js 与其它生产代码。
 *  - 断言「可观测行为」：导出 data 的 _meta/_portableKey、导入后 getCfg().key、toast 文案。
 *
 * 运行：npx vitest run tests/p0-crossdevice-key.test.js
 */

import { describe, it, expect, vi } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

const PREFIX = "wb_agent_";

function freshWin() {
  const win = loadApp();
  win.localStorage.clear();
  return win;
}

// 非 Electron 态：启用 AI 并持有明文 Key（经 initCrypto 迁移为加密存储，_cfgCache.key 为明文）
async function enableKey(win, key) {
  win.localStorage.setItem(
    PREFIX + "cfg",
    JSON.stringify({ enabled: true, base: "https://api.openai.com/v1", model: "gpt-4o-mini", key })
  );
  await win.initCrypto();
}

// stub doExport 的 Blob/URL/anchor，捕获导出的 data 对象（内存内，无临时文件）
function stubExport(win) {
  let captured = null;
  win.Blob = class {
    constructor(parts) {
      captured = JSON.parse(parts[0]);
    }
  };
  win.URL.createObjectURL = () => "blob:fake";
  win.URL.revokeObjectURL = () => {};
  win.HTMLAnchorElement.prototype.click = function () {};
  return () => captured;
}

// stub FileReader：readAsText 后用给定内容触发 onload（模拟浏览器异步读取）
function stubImport(win, content) {
  class FakeFileReader {
    constructor() {
      this.result = "";
    }
    readAsText() {
      this.result = content;
      setTimeout(() => {
        if (typeof this.onload === "function") this.onload({ target: this });
      }, 0);
    }
  }
  win.FileReader = FakeFileReader;
}

function toastMsgs(spy) {
  return spy.mock.calls.map((c) => c[0]).join(" | ");
}

// 等待异步导入链路真正完成：doImport 在 onload 内经 FileReader 异步读取 + await initCrypto()
// 后才 emit 收尾 toast。固定 50ms 在整套并行负载下偶发不足（getCfg().key 读到中间态）→ 改为
// 轮询「收尾 toast 已触发」这一确定性完成信号，消除 flaky。
// ⚠️ 2026-09-20 复查（结论）：本文件的抖动**分两种，别混为一谈**——
//  ① **源码态陷阱（与抖动无关，但会造出更大的假象）**：`loadApp` 直接读 `agent-workbench.html`，
//     而源码态里应用代码被 src 标记取代 → 应用起不来 → `t is not defined` → **全部走 loadApp 的测试共 638 条**一起挂。
//     跑测试前必须先拼回：`node scripts/src-split.mjs && node scripts/pet-art.mjs`。
//     （我为了"还原源码态"先 extract 再跑测试，自己造出过这个 638 条失败。）
//  ② **本文件自身的抖动**：**并行**跑时这套 jsdom 异步链（FileReader + initCrypto）偶尔**根本不完成**，
//     连 20s 的 testTimeout 都会被打满（`Test timed out in 20000ms`）；单跑必过。
//     对策：两个 describe 加 `{ retry: 2 }`（有限重试，只针对这类环境抖动；CI 干净机器上一直绿）。
function waitFor(predicate, timeout = 2000, interval = 10) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      let ok = false;
      try { ok = predicate(); } catch (e) { ok = false; }
      if (ok) return resolve(true);
      if (Date.now() - start > timeout) return reject(new Error("waitFor timeout"));
      setTimeout(tick, interval);
    };
    tick();
  });
}

describe("P0-5 跨设备 · T1 浏览器态未勾选", { retry: 2 }, () => {
  it("导出标记 keyExcluded(device-encrypted)、不写 _portableKey；新设备导入后 key 为空且告警含『本机无 AI Key』", async () => {
    const win = freshWin();
    await enableKey(win, "sk-secret-aaa");
    const getExported = stubExport(win);

    win.doExport();
    const data = getExported();
    expect(data["_meta"]).toBeDefined();
    expect(data["_meta"].keyExcluded).toBe(true);
    expect(data["_meta"].reason).toBe("device-encrypted");
    expect(data._portableKey).toBeUndefined();

    // 新设备：全新窗口导入；剔除设备专属密钥 wb_agent___dk，模拟「device key 不相同」的跨设备场景
    delete data[PREFIX + "__dk"];
    const winB = freshWin();
    stubImport(winB, JSON.stringify(data));
    const toastSpy = vi.spyOn(winB, "toast");
    winB.doImport({ name: "b.json" });
    await waitFor(() => toastSpy.mock.calls.length > 0);

    expect(winB.getCfg().key).toBe("");
    expect(toastMsgs(toastSpy)).toContain("本机无 AI Key");
    toastSpy.mockRestore();
  });
});

describe("P0-5 跨设备 · T2 浏览器态勾选（opt-in 明文携带）", { retry: 2 }, () => {
  it("勾选后导出写入 _portableKey 明文；新设备导入恢复为明文 key 且 ok toast 含『AI Key 已就绪』", async () => {
    const win = freshWin();
    await enableKey(win, "sk-portable-bbb");
    const getExported = stubExport(win);
    win.document.getElementById("exportKeyOpt").checked = true;

    win.doExport();
    const data = getExported();
    expect(data._portableKey).toBe("sk-portable-bbb");
    expect(data["_meta"].keyExcluded).toBe(false);

    // 新设备：剔除 wb_agent___dk，模拟跨设备（device key 不相同，旧密文无法解密）
    delete data[PREFIX + "__dk"];
    const winB = freshWin();
    stubImport(winB, JSON.stringify(data));
    const toastSpy = vi.spyOn(winB, "toast");
    winB.doImport({ name: "b.json" });
    await waitFor(() => toastSpy.mock.calls.length > 0);

    expect(winB.getCfg().key).toBe("sk-portable-bbb");
    expect(toastMsgs(toastSpy)).toContain("AI Key 已就绪");
    toastSpy.mockRestore();
  });
});

describe("P0-5 跨设备 · T3 Electron 态", { retry: 2 }, () => {
  it("导出告警含『本机安全存储保管』；导入后 enabled 仍 true、key 为空、告警含『本机无 AI Key』", async () => {
    const win = freshWin();
    win.electronAPI = { getAiConfig: async () => ({ keySet: false }), setAiConfig: async () => {} };
    win.localStorage.setItem(PREFIX + "cfg", JSON.stringify({ enabled: true, base: "b", model: "m" }));
    await win.initCrypto();
    const getExported = stubExport(win);

    const exportSpy = vi.spyOn(win, "toast");
    win.doExport();
    expect(toastMsgs(exportSpy)).toContain("本机安全存储保管");
    exportSpy.mockRestore();
    const data = getExported();
    expect(data["_meta"].keyExcluded).toBe(true);
    expect(data._portableKey).toBeUndefined(); // Electron 态无明文可写

    const winB = freshWin();
    winB.electronAPI = { getAiConfig: async () => ({ keySet: false }), setAiConfig: async () => {} };
    stubImport(winB, JSON.stringify(data));
    const importSpy = vi.spyOn(winB, "toast");
    winB.doImport({ name: "b.json" });
    await waitFor(() => importSpy.mock.calls.length > 0);

    expect(winB.getCfg().enabled).toBe(true);
    expect(winB.getCfg().key).toBe("");
    expect(toastMsgs(importSpy)).toContain("本机无 AI Key");
    importSpy.mockRestore();
  });
});

describe("P0-5 跨设备 · T4 未启用 AI 护栏（向后兼容）", { retry: 2 }, () => {
  it("未启用 AI：导出/导入均不弹任何 Key 相关告警", async () => {
    const win = freshWin(); // 默认 cfg 未启用
    const getExported = stubExport(win);
    const exportSpy = vi.spyOn(win, "toast");
    win.doExport();
    const data = getExported();
    expect(data["_meta"]).toBeUndefined();
    expect(data._portableKey).toBeUndefined();

    const winB = freshWin();
    stubImport(winB, JSON.stringify(data));
    const importSpy = vi.spyOn(winB, "toast");
    winB.doImport({ name: "b.json" });
    await waitFor(() => importSpy.mock.calls.length > 0);

    const all = toastMsgs(exportSpy) + " || " + toastMsgs(importSpy);
    expect(all).not.toContain("本机无 AI Key");
    expect(all).not.toContain("本机安全存储保管");
    expect(all).not.toMatch(/AI Key/);
    exportSpy.mockRestore();
    importSpy.mockRestore();
  });
});
