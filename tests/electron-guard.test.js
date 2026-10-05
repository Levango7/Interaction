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

/* ---------------------------------------------------------------------------
 * ④ CSP 响应头注入（v3.7.91 新增）
 * 背景：HTML 的 meta CSP 中 `frame-ancestors` **被 Chromium 忽略**（规范如此），
 *   而 v3.7.54 的 HTML 注释曾声称「由 Electron 主进程 onHeadersReceived 注入第二层」——
 *   实测 electron/main.js 里**从未**有 session/webRequest/onHeadersReceived，该层不存在。
 *   本组断言：① 那一层现在真实存在；② 注入内容正确地追加了 frame-ancestors；
 *   ③ 不引入新的 script-src 限制（单文件内联架构不能被误伤）。
 * ------------------------------------------------------------------------- */
describe("Electron ④ CSP 响应头注入（第二层防护）", () => {
  it("main.js 真实调用 session.defaultSession.webRequest.onHeadersReceived", () => {
    expect(mainSrc, "必须 require session").toMatch(/\bsession\b/);
    expect(mainSrc, "必须注册 onHeadersReceived").toContain("onHeadersReceived");
    expect(mainSrc, "必须用 defaultSession").toContain("session.defaultSession");
    // 防回潮：HTML 注释里那条「声称有第二层」的历史，必须以真实实现落地
    expect(mainSrc, "不得只写注释不实现").not.toMatch(/\/\*\s*TODO[^*]*onHeadersReceived[^*]*\*\//);
  });

  it("installCsp 在 createWindow 之前调用（否则首个请求不带 CSP 头）", () => {
    const boot = mainSrc.slice(mainSrc.indexOf("app.whenReady().then"));
    const iCsp = boot.indexOf("installCsp()");
    const iWin = boot.indexOf("createWindow()");
    expect(iCsp, "whenReady 内必须调用 installCsp()").toBeGreaterThan(-1);
    expect(iWin).toBeGreaterThan(-1);
    expect(iCsp, "installCsp 必须排在 createWindow 之前").toBeLessThan(iWin);
  });

  it("buildCspHeader 输出：保留 meta 全部指令 + 追加 frame-ancestors 'none'", () => {
    // 提取真实函数体并在隔离作用域内执行（不启动 Electron）
    const fnSrc = mainSrc.slice(mainSrc.indexOf("function buildCspHeader"));
    const body = fnSrc.slice(0, fnSrc.indexOf("\n}\n") + 3);
    const metaRe = mainSrc.match(/const _CSP_META_RE = (.+);/)[1];
    const html = read("agent-workbench.html");
    const shim = new Function("fs", "resolveHtml", "_CSP_META_RE",
      metaRe.replace(/^/, "") + "\n" + body + "\nreturn buildCspHeader();"
    );
    const out = shim(
      { readFileSync: () => html },
      () => "agent-workbench.html",
      eval(metaRe)
    );

    expect(out, "必须含 frame-ancestors 'none'（meta 中无效，只有响应头生效）").toContain("frame-ancestors 'none'");
    expect(out, "必须保留 script-src").toContain("script-src");
    expect(out, "必须保留 unsafe-inline（单文件内联架构不能误伤）").toContain("'unsafe-inline'");
    expect(out, "必须保留 wasm-unsafe-eval").toContain("wasm-unsafe-eval");
    expect(out, "必须保留回环 connect-src（本地模型/代理）").toMatch(/127\.0\.0\.1/);
    expect(out, "不得出现空指令导致的双分号").not.toContain(";;");
    // 关键回归：content 值内部含单引号，正则若用 [^"']* 会被截断成 "default-src"（v3.7.91 实测踩过）
    expect(out, "不得被单引号截断（曾退化成只有 default-src）").not.toBe("default-src; frame-ancestors 'none'");
    expect(out.length, "合理长度应 > 200 字符").toBeGreaterThan(200);
  });

  it("HTML meta CSP 本身不得包含 frame-ancestors（放了也无效，且会造成误解）", () => {
    const html = read("agent-workbench.html");
    const m = html.match(/<meta[^>]*http-equiv=["']Content-Security-Policy["'][^>]*content=("([^"]*)"|'([^']*)')/i);
    expect(m, "HTML 必须保留 meta CSP（网页形态依赖它）").toBeTruthy();
    const content = (m[2] !== undefined ? m[2] : m[3]) || "";
    expect(content, "meta 中的 frame-ancestors 会被 Chromium 忽略，应只由响应头下发").not.toContain("frame-ancestors");
  });
});
