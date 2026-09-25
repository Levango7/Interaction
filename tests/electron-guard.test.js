/**
 * electron-guard.test.js —— Electron 外壳的安全与「API 存在性」守护
 * ----------------------------------------------------------------------------
 * 背景（v3.7.52 实测）：
 *   ① 页面侧调用了 preload **从未暴露**的 electronAPI.syncPush / syncGet，而 electron/main.js 里
 *      也没有 127.0.0.1:8124 同步服务 → Electron 形态下启动即抛 TypeError 且每 60s 弹一次失败告警。
 *   ② _isInternalUrl 把**任意 file:** 当"内部页面"放行，而 IPC 侧 assertTrustedSender 也只校验
 *      file:// 前缀 → 任意本地 HTML 被导航/新窗口打开即可拿到带 preload 的窗口（= electronAPI）。
 *   ③ shell.openExternal 无协议白名单，URL 原样交给系统处理器（可触 ms-msdt: 一类本机协议）。
 * 本文件是**静态结构断言**（读磁盘文件，不启动 Electron），防止这三类回潮。
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const mainSrc = read("electron/main.js");
const preloadSrc = read("electron/preload.js");

describe("Electron ① 页面用到的 electronAPI 必须在 preload 暴露或显式守卫", () => {
  it("src/ 里每个 electronAPI.<name> 都满足：preload 已暴露，或有 typeof 能力守卫", () => {
    const exposed = new Set([...preloadSrc.matchAll(/exposeInMainWorld|(\w+)\s*:\s*\(/g)].map((m) => m[1]).filter(Boolean));
    const files = readdirSync(join(root, "src")).filter((f) => f.endsWith(".js"));
    const offenders = [];
    for (const f of files) {
      const code = read(join("src", f));
      for (const m of code.matchAll(/electronAPI\.([A-Za-z_$][\w$]*)/g)) {
        const name = m[1];
        if (exposed.has(name)) continue;
        /* 守卫写法：typeof window.electronAPI.<name> === "function" */
        const guarded = new RegExp(`typeof\\s+window\\.electronAPI\\.${name}\\s*===\\s*["']function["']`).test(code);
        if (!guarded) offenders.push(`${f}: electronAPI.${name}`);
      }
    }
    expect(offenders, "页面调用了 preload 未暴露的 API，且没有能力守卫（Electron 形态会抛 TypeError）").toEqual([]);
  });

  it("preload 暴露面保持最小：通道清单与 main.js 的 ipcMain 注册一一对应", () => {
    const exposedChannels = [...preloadSrc.matchAll(/ipcRenderer\.(?:invoke|send)\("([^"]+)"/g)].map((m) => m[1]).sort();
    const registered = [...mainSrc.matchAll(/ipcMain\.(?:handle|on)\("([^"]+)"/g)].map((m) => m[1]).sort();
    expect(exposedChannels).toEqual(registered);
  });
});

describe("Electron ② 导航守卫：只放行本应用页面", () => {
  it("_isInternalUrl 不得把任意 file: 当内部页面", () => {
    const fn = mainSrc.slice(mainSrc.indexOf("function _isInternalUrl"), mainSrc.indexOf("function _openExternalSafe"));
    expect(fn).toContain("_APP_FILES");
    expect(fn, "不得出现「任意 file: 即内部」的旧判据").not.toMatch(/protocol\s*===\s*["']file:["']\s*\|\|/);
  });
  it("_APP_FILES 由本应用页面构成", () => {
    const block = mainSrc.slice(mainSrc.indexOf("const _APP_FILES"), mainSrc.indexOf("function _isInternalUrl"));
    expect(block).toContain("agent-workbench.html");
    expect(block).toContain("path.resolve");
  });
});

describe("Electron ③ 外链必须过协议白名单", () => {
  it("shell.openExternal 只允许出现在 _openExternalSafe 内，且带协议白名单", () => {
    const calls = [...mainSrc.matchAll(/shell\.openExternal\(/g)].length;
    expect(calls).toBe(1);
    const fn = mainSrc.slice(mainSrc.indexOf("function _openExternalSafe"));
    const body = fn.slice(0, fn.indexOf("app.on("));
    expect(body).toContain('u.protocol !== "http:"');
    expect(body).toContain('u.protocol !== "https:"');
  });
  it("两处导航出口都走 _openExternalSafe（不得直连 shell.openExternal）", () => {
    const nav = mainSrc.slice(mainSrc.indexOf('app.on("web-contents-created"'));
    expect([...nav.matchAll(/_openExternalSafe\(url\)/g)].length).toBe(2);
  });
});
