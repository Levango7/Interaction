import { JSDOM, VirtualConsole } from "jsdom";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { webcrypto } from "node:crypto";
import { TextEncoder, TextDecoder } from "node:util";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HTML_PATH = path.resolve(__dirname, "..", "..", "agent-workbench.html");

/* v3.7.59：源码态守卫。
   本仓库是「双态」架构：提交进 git 的是**源码态**（HTML 里只有 SRC 块占位标记、代码在 src/，
   约 605KB），交付态（约 3.4MB）由 pre 钩子拼回。`posttest` 会在每次 `npm test` 结束后
   **自动抽回源码态** —— 于是此后任何不经 npm 生命周期的直跑（`npx vitest run`）都会拿到
   一个「没有应用 JS」的 HTML：脚本执行中断 → 末尾的 `window.__test` 从未挂载 →
   每个用例都以 `TypeError: Cannot read properties of undefined` 或
   `ReferenceError: t is not defined` 报错。实测 3 个文件会因此产生 37 个**假失败**，
   而失败信息完全指向错误的方向（看着像被测代码坏了）。
   这里提前 fail-fast 并给出可执行的修复命令，把「37 个莫名其妙的红」换成 1 句人话。
   阈值与 scripts/check-source-state.mjs 保持一致（1.2MB）。
   ⚠️ 注意：本注释刻意不写出完整的 SRC 标记字面量 —— 其中的注释结束符会提前闭合块注释
   （项目文档记过两次，我 2026-09-27 又踩了一次，直接导致本文件语法错误、整个测试文件无法加载）。 */
function assertDeliveredState(html) {
  const bytes = Buffer.byteLength(html);
  if (bytes < 1_200_000) {
    throw new Error(
      `[loadApp] agent-workbench.html 处于**源码态**（${(bytes / 1024).toFixed(0)}KB < 1200KB），` +
      "应用 JS 不在 HTML 里 —— 测试会全量假失败（ReferenceError: t is not defined）。\n" +
      "  修复：npm run src:inject   （或直接用 npm test，它的 pretest 会自动拼回）\n" +
      "  说明：npm test 的 posttest 每次都会把 HTML 抽回源码态，故直跑 vitest 前必须重新拼回。"
    );
  }
}

/* 只过滤 jsdom 的 CSS 解析噪声（见文件顶部说明与提交信息），其余错误/日志照常转发 */
function makeQuietVirtualConsole() {
  const vc = new VirtualConsole();
  vc.on("jsdomError", (err) => {
    const msg = String((err && err.message) || err || "");
    if (/could not parse css stylesheet/i.test(msg)) return;
    try { console.error("[jsdom] " + msg); } catch (_e) { /* 忽略 */ }
  });
  ["log", "info", "warn", "error", "debug"].forEach((m) => {
    vc.on(m, (...args) => { try { console[m](...args); } catch (_e) { /* 忽略 */ } });
  });
  return vc;
}

export function loadApp({ storage = {} } = {}) {
  const html = fs.readFileSync(HTML_PATH, "utf8");
  assertDeliveredState(html);
  const dom = new JSDOM(html, {
    virtualConsole: makeQuietVirtualConsole(),
    runScripts: "dangerously",
    resources: "usable",
    url: "http://localhost/",
    beforeParse(window) {
      // 模拟刷新前的持久化状态，必须在应用脚本执行前注入。
      Object.entries(storage).forEach(([key, value]) => window.localStorage.setItem(key, value));
      // jsdom 不提供 requestAnimationFrame，注入最小 polyfill（生产无影响）
      window.requestAnimationFrame = function (cb) {
        return setTimeout(() => cb(Date.now()), 0);
      };
      window.cancelAnimationFrame = function (id) {
        clearTimeout(id);
      };
      // jsdom 的 window.crypto 没有 subtle，注入 Node webcrypto 作为 polyfill
      if (!window.crypto || !window.crypto.subtle) {
        Object.defineProperty(window, "crypto", { value: webcrypto, writable: true, configurable: true });
      }
      // jsdom 不提供 TextEncoder/TextDecoder（Web Crypto API 编解码需要）
      if (typeof window.TextEncoder === "undefined") { window.TextEncoder = TextEncoder; }
      if (typeof window.TextDecoder === "undefined") { window.TextDecoder = TextDecoder; }
      // T5.3 浏览器兼容：jsdom 不暴露 ReadableStream（Node 全局有），注入 polyfill
      // 真实浏览器（Chrome/Firefox）都有 ReadableStream，此处仅补齐 jsdom 测试环境
      if (typeof window.ReadableStream === "undefined" && typeof ReadableStream !== "undefined") {
        Object.defineProperty(window, "ReadableStream", { value: ReadableStream, writable: true, configurable: true });
      }
      // 测试环境：jsdom 未实现 confirm/alert（默认返回 false / 抛 Not implemented）。
      // 注入默认「确认」与空实现，使依赖确认框的交互（导入覆盖、清空记忆、删除习惯链等）
      // 在测试中可继续推进；真实浏览器行为不受影响。
      window.confirm = function () { return true; };
      window.alert = function () {};
    },
  });
  return dom.window;
}