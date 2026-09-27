import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scanCssStructure } from "../scripts/lint-css-structure.mjs";

/**
 * css-structure.test.js —— 样式表**结构**门禁的契约与自证
 *
 * 三条互不相干的实测缺陷，共同点是「浏览器静默做错误恢复，所以没人发现」：
 *   ① .cmd li.cmd-group 漏右括号 → 紧跟的 .cmd-hit 被解析成 CSS 嵌套选择器
 *      `.cmd li.cmd-group .cmd li b.cmd-hit`，永不命中：命令面板的模糊匹配高亮
 *      自 v3.7.8 起静默失效（真实 Chromium 实测计算色＝继承来的正文色、背景 transparent）。
 *   ② 删区间收紧规则时留下一个孤立 `}` —— 它**不是静默无害**：实测它把紧随其后的
 *      `select[name="priority"]{max-width:120px}` 整条吞掉（该规则根本不在 CSSOM 里）。
 *   ③ #toasts 的 top 由 --topbar-h 推导，而那个令牌写的是 54px、实测 65px，
 *      于是 toast 带（y=66..103）正好压在常驻工具行（y=65..110）上，
 *      3.6s 内读不到「今天 N 件待处理」这条消息栏。
 *
 * ⚠️ 这里**不起子进程**跑门禁脚本，而是 import 同一份 scanCssStructure 在进程内调用。
 *   原因实测过：spawn 子进程（哪怕异步）在全量 100 文件并发时会让 vitest worker 的
 *   RPC 超时（`[vitest-worker]: Timeout calling "onTaskUpdate"` —— 用例全绿、
 *   npm 退出码却是 1）。门禁脚本本身仍由 `npm run lint` 第四道负责执行。
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const HTML = path.join(ROOT, "agent-workbench.html");
const SRC = fs.readFileSync(HTML, "utf8");

/** 把一段样式表包成最小 HTML 后走门禁 */
const scanCss = (css) => scanCssStructure(`<style>\n${css}\n</style>`);
const codes = (r) => r.errors.map((e) => e.code).join(",");

describe("样式表结构门禁 scanCssStructure", () => {
  it("真实现存样式表 0 结构问题", () => {
    const r = scanCssStructure(SRC);
    expect(r.blocks.length, "应至少扫到 1 个 style 块").toBeGreaterThan(0);
    expect(r.errors.map((e) => `第${e.line}行 ${e.code} ${e.msg}`).join("\n"), "现存样式表应无结构问题").toBe("");
  });

  it("门禁与「注入/抽取」状态无关：源码态与拼装态同结论", () => {
    /* 交付态里应用 JS 有 5 处字符串常量含 `<style>`（导出/打印模板、document.write）。
       早期版本直接正则扫 <style>，源码态 exit 0、拼回后报 1766 条假阳性。
       这里用同一份 HTML 的两种规模切面做等价性代理：块数必须都是 1（真 style 只有一个）。 */
    const r = scanCssStructure(SRC);
    expect(r.blocks.length, "只应有 1 个真 <style> 块").toBe(1);
    expect(r.totalRules).toBeGreaterThan(2000);
    const withScript = scanCss([
      ".real{color:red}",
      "</style>",
      "<script>const t='<style>.gen{color:blue', function f(a){ return {a}; };</style>';document.write('<style>x{}}</style>');</script>",
      "<style>.real2{color:blue}",
    ].join("\n"));
    expect(withScript.blocks.length, "script 里的假 <style> 不得被当成样式块").toBe(2);
    expect(withScript.errors.length).toBe(0);
  });

  it("变异验证①：漏右括号造成的意外嵌套必须被报出", () => {
    const r = scanCss([
      ".a{color:red;",          // ← 故意漏掉 }
      ".b{font-weight:600}",    // 于是这条变成「意外嵌套」，被 .a 吞进去
      "  cursor:pointer}",      // 子规则之后还有声明 → E4
    ].join("\n"));
    expect(codes(r)).toContain("E3 NESTED_RULE");
    expect(codes(r)).toContain("E4 DECL_AFTER_NESTED");
    /* 报错必须给出「浏览器实际生效的选择器」，否则读者不知道错在哪 */
    expect(r.errors.map((e) => e.msg).join("\n")).toContain(".a .b");
  });

  it("变异验证②：顶层孤立右括号必须被报出", () => {
    const r = scanCss(".x{color:red}\n}\n.y{color:blue}");
    expect(codes(r)).toContain("E1 ORPHAN_BRACE");
  });

  it("变异验证③：未闭合的 { 必须被报出（且不误报成意外嵌套）", () => {
    const r = scanCss("@media (max-width:100px){\n.x{color:red}");
    expect(codes(r)).toContain("E2 UNCLOSED");
    expect(codes(r)).not.toContain("E3 NESTED_RULE");
  });

  it("不误伤合法写法：url() 内的括号、@media 里的规则、字符串里的花括号", () => {
    const r = scanCss([
      "@media (max-width:100px){ .a{background:url(data:image/svg+xml;utf8,<svg></svg>)} }",
      ".b{content:'{ 未闭合的引号内花括号 }'}",
      ".c{grid-template-columns:repeat(auto-fit,minmax(160px,1fr))}",
    ].join("\n"));
    expect(r.errors.map((e) => e.code + " " + e.msg).join("\n"), "合法样式不应报错").toBe("");
  });

  it("门禁已接进 npm run lint（防止写了却没接、像 lint-xss 那样长期空转）", () => {
    const scripts = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).scripts;
    expect(scripts.lint, "lint 链里必须含结构门禁").toContain("lint-css-structure.mjs");
  });
});

describe("CSS 契约（防静默回退）", () => {
  it("命令面板命中高亮是**独立规则**，不是被夹在别人声明块里的嵌套块", () => {
    /* 缺陷形态：.cmd-group{... \n .cmd li b.cmd-hit{...} \n color:...} */
    expect(SRC).toMatch(/\.cmd li\.cmd-group\{[^}]*\}\s*(\/\*[\s\S]*?\*\/\s*)?\.cmd li b\.cmd-hit\{/);
  });

  it(".cmd-hit 规则带 accent 前景与淡底（回归护栏）", () => {
    const rule = /\.cmd li b\.cmd-hit\{([^}]*)\}/.exec(SRC);
    expect(rule, "应存在 .cmd li b.cmd-hit 独立规则").toBeTruthy();
    expect(rule[1]).toContain("var(--accent-text,var(--accent))");
    expect(rule[1]).toContain("color-mix(in srgb, var(--accent) 12%");
  });

  it("#toasts 锚在实测的 --chrome-h 上，不再用 --topbar-h 推导", () => {
    /* --topbar-h 记 54px、实测 65px（v1.15 之后没人回改）；用它推导会压住常驻工具行 */
    const rule = /#toasts\{[^}]*\}/.exec(SRC);
    expect(rule, "应存在 #toasts 规则").toBeTruthy();
    expect(rule[0]).toMatch(/top:calc\(var\(--chrome-h\) \+ var\(--space-3\)\)/);
    expect(rule[0]).not.toMatch(/top:calc\(var\(--topbar-h\)/);
    expect(SRC).toMatch(/--chrome-h:110px/);
  });
});
