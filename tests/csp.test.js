/**
 * CSP 结构守护（v3.7.54 新增）
 * ----------------------------------------------------------------------------
 * 起因是两条实测：
 *   ① code_run 的 `new Worker(URL.createObjectURL(...))` 被 CSP 拦死 —— 全仓库没有 worker-src/child-src
 *      时 Worker 回落到 script-src（不含 blob:），于是这个工具**每一次调用都失败**，
 *      而 README 与 docs/product-scope.md 都写着"本机沙箱执行、不需联网"，测试却全绿
 *      （jsdom 跑不了真 Worker，所以只有真浏览器能暴露）。
 *   ② 改 CSP 时我把相邻注释的起始行吃掉，剩下 5 行成了 <head> 里的裸文本 —— 会被浏览器搬进
 *      body **显示出来**。所以这里同时守"head 不得有游离文本"。
 * 本文件只读 HTML，不依赖拼回态（CSP meta 一直在内联 head 里，不在 src 块内）。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(join(root, "agent-workbench.html"), "utf8");

const headEnd = html.indexOf("</head>");
const HEAD = headEnd > 0 ? html.slice(0, headEnd) : "";
const cspMeta = (HEAD.match(/<meta[^>]*http-equiv="Content-Security-Policy"[^>]*>/i) || [])[0] || "";
const cspContent = (cspMeta.match(/content="([^"]*)"/i) || [])[1] || "";
const directives = {};
for (const part of cspContent.split(";")) {
  const d = part.trim();
  if (!d) continue;
  /* CSP 的「指令名 值」用空白分隔，不是冒号 —— 按冒号切会把 https: 当成边界 */
  const m = d.match(/^([\w-]+)\s+([\s\S]*)$/);
  if (m) directives[m[1].toLowerCase()] = m[2].trim();
}

describe("CSP 必须声明的关键指令", () => {
  it("meta CSP 存在且能解析出指令", () => {
    expect(cspMeta, "找不到 Content-Security-Policy meta").toBeTruthy();
    expect(Object.keys(directives).length).toBeGreaterThan(6);
  });

  it("worker-src 必须含 blob: —— 否则 code_run 的 Worker 建不起来", () => {
    /* 这条断言是**功能**守护而非安全守护：没有它，AI 的 code_run 会静默恒失败 */
    expect(directives["worker-src"], "CSP 缺 worker-src（Worker 会回落 script-src，blob: 被拒）").toBeTruthy();
    expect(directives["worker-src"]).toContain("blob:");
  });

  it("既有的安全底线不得被放宽", () => {
    /* object-src/base-uri 是历史约定。connect-src 的策略（v3.7.56 起）：
       'self' + https: + **仅回环** http —— 本地 Ollama / 自建后端是真实需求
       （_apiBase 默认值就是 http://localhost:3001），但远程明文 http 一律不许。
       这里不用等值比较而是逐条约束，免得以后有人加个 http://0.0.0.0 也能过。 */
    expect(directives["object-src"]).toBe("'none'");
    expect(directives["base-uri"]).toBe("'self'");
    const cs = directives["connect-src"] || "";
    expect(cs, "connect-src 必须保留 'self'").toContain("'self'");
    expect(cs, "connect-src 必须保留 https:").toContain("https:");
    /* 按 token 判定，别用 /\shttp:/ —— `http://127.0.0.1` 本身就以 `http:` 开头，
       那样写会把合法的回环源误判成"任意 http"（第一版就踩了）。 */
    const toks = cs.split(/\s+/).filter(Boolean);
    expect(toks, "禁止用裸 `http:` 放开任意明文源").not.toContain("http:");
    for (const tok of toks) {
      if (tok.startsWith("http://")) {
        expect(tok, `connect-src 里出现了非回环的 http 源：${tok}`).toMatch(/^http:\/\/(127\.0\.0\.1|localhost)(:\*)?$/);
      }
    }
    expect(directives["script-src"], "script-src 不得被扩到 blob:").not.toContain("blob:");
  });
});

describe("head 结构完整（改 CSP 时极易连带破坏）", () => {
  it("<head> 内不得有游离文本节点", () => {
    expect(headEnd, "找不到 </head>").toBeGreaterThan(0);
    const stripped = HEAD
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<!doctype[^>]*>/gi, "")
      .replace(/<\/?(?:html|head|body)(?:\s[^>]*)?>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<title[\s\S]*?<\/title>/gi, "")
      .replace(/<meta[^>]*>/gi, "")
      .replace(/<link[^>]*>/gi, "")
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .trim();
    expect(stripped, "head 里出现裸文本，浏览器会把它搬进 body 显示出来：" + stripped.slice(0, 120)).toBe("");
  });

  it("注释必须成对闭合", () => {
    const opens = (HEAD.match(/<!--/g) || []).length;
    const closes = (HEAD.match(/-->/g) || []).length;
    expect(closes, `head 内 <!-- 有 ${opens} 个但 --> 只有 ${closes} 个`).toBe(opens);
  });
});
