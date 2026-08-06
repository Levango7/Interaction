import { JSDOM } from "jsdom";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { webcrypto } from "node:crypto";
import { TextEncoder, TextDecoder } from "node:util";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HTML_PATH = path.resolve(__dirname, "..", "..", "agent-workbench.html");

export function loadApp() {
  const html = fs.readFileSync(HTML_PATH, "utf8");
  const dom = new JSDOM(html, {
    runScripts: "dangerously",
    resources: "usable",
    url: "http://localhost/",
    beforeParse(window) {
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
    },
  });
  return dom.window;
}