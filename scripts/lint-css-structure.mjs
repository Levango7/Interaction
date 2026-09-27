#!/usr/bin/env node
/**
 * lint-css-structure.mjs — 样式表**结构**门禁（括号配平 / 意外嵌套）
 *
 * 起因（v3.7.60 实测）：`.cmd li.cmd-group{...}` 漏了一个右括号，紧跟其后的
 * `.cmd li b.cmd-hit{...}` 被浏览器按 CSS 嵌套解析成
 * `.cmd li.cmd-group .cmd li b.cmd-hit` —— 永不命中，命令面板的模糊匹配高亮
 * 从 v3.7.8 起静默失效（真实 Chromium 实测计算色 = 继承来的正文色、背景 transparent）。
 * 存活 6 个版本的原因很简单：**没有任何门禁看结构**。ESLint 只看 JS，
 * lint-colors 只看色值字面量，浏览器遇到残缺只会静默做错误恢复。
 *
 * 本模块自己走一遍样式表（注释 / 字符串 / 括号均按 CSS 词法处理），报四类问题：
 *   E1 ORPHAN_BRACE       顶层多余的 `}` —— 不是无害：实测它会**连带吞掉紧随其后的那条规则**
 *   E2 UNCLOSED           样式块结束仍有 `{` 未闭合
 *   E3 NESTED_RULE        规则声明块内部又出现 `{`（= 上一条漏右括号的最强信号）
 *   E4 DECL_AFTER_NESTED  同一声明块里「子规则之后还有声明」→ 那些声明会意外
 *                         归到父选择器上（本例的 color/cursor/letter-spacing 就是这么跑偏的）
 *
 * 用法（CLI）：node scripts/lint-css-structure.mjs [file] [--verbose]
 * 用法（测试）：import { scanCssStructure } from "../scripts/lint-css-structure.mjs"
 *   —— 测试走**进程内**函数而不是 spawn 子进程：全量 100 文件并发时，同步 spawn 会占住
 *   vitest worker 的事件循环，实测触发过 `[vitest-worker]: Timeout calling "onTaskUpdate"`
 *   （用例全绿但 npm 退出码 1）。先例见 scripts/lib/code-scan.mjs + tests/code-scan.test.js。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/* ---------- 1. 抽出所有**真** <style> 块 ----------
   ⚠️ 不能直接正则扫 `<style>`：本文件的应用 JS 里有 5 处字符串常量含 `<style>`
   （导出/打印模板、window.document.write 等）。源码态下它们是占位标记、扫不到；
   一旦拼回成交付态（pre 钩子之后），直接正则会把 3.4MB 的 JS 当 CSS 解析 ——
   实测报 1766 条假阳性。所以做一次线性走查：遇到 <style> 收内容、
   遇到 <script>/<!-- --> 整段跳过。纯 indexOf 跳转，不建字符数组（交付态 3.4MB）。 */
export function findStyleBlocks(text) {
  const out = [];
  const lower = text.toLowerCase();          /* 只做一次小写化，用于定位标签 */
  let pos = 0;
  for (;;) {
    const styleAt = lower.indexOf("<style", pos);
    const scriptAt = lower.indexOf("<script", pos);
    const commentAt = text.indexOf("<!--", pos);
    const next = Math.min(styleAt < 0 ? Infinity : styleAt,
                          scriptAt < 0 ? Infinity : scriptAt,
                          commentAt < 0 ? Infinity : commentAt);
    if (next === Infinity) break;
    if (next === styleAt) {
      const openEnd = text.indexOf(">", styleAt);
      const close = lower.indexOf("</style>", openEnd + 1);
      if (openEnd < 0 || close < 0) break;
      out.push({ bodyStart: openEnd + 1, bodyEnd: close });
      pos = close + 8;
    } else if (next === scriptAt) {
      const openEnd = text.indexOf(">", scriptAt);
      /* 外链 <script src> 没有内联内容，跳过标签本身即可 */
      const isSrc = /\bsrc\s*=/i.test(text.slice(scriptAt, openEnd + 1));
      const close = isSrc ? -1 : lower.indexOf("</script", openEnd + 1);
      pos = isSrc ? openEnd + 1 : (close < 0 ? text.length : text.indexOf(">", close) + 1);
    } else {
      const end = text.indexOf("-->", commentAt + 4);
      pos = end < 0 ? text.length : end + 3;
    }
  }
  return out;
}

/* ---------- 2. 逐字符走一遍，维护上下文栈 ---------- */
export function scanCssStructure(src) {
  const errors = [];
  let totalRules = 0, totalAt = 0;
  const blocks = findStyleBlocks(src).map((s) => ({
    css: src.slice(s.bodyStart, s.bodyEnd),
    startLine: src.slice(0, s.bodyStart).split("\n").length,
  }));

  for (const { css, startLine } of blocks) {
    const stack = [];     /* { kind:'at'|'rule', prelude, line, nested:[], declAfterNested:bool } */
    let buf = "";
    let line = startLine;
    let inComment = false, inStr = null, paren = 0;
    const flushDecl = () => {
      const t = buf.trim();
      buf = "";
      if (!t) return;
      const top = stack[stack.length - 1];
      if (top && top.kind === "rule" && top.nested.length) top.declAfterNested = true;
    };

    for (let i = 0; i < css.length; i++) {
      const c = css[i], n = css[i + 1];
      if (c === "\n") line++;
      if (inComment) { if (c === "*" && n === "/") { inComment = false; i++; } continue; }
      if (inStr) {
        if (c === "\\") { i++; continue; }
        if (c === inStr) inStr = null;
        continue;
      }
      if (c === "/" && n === "*") { inComment = true; i++; continue; }
      if (c === '"' || c === "'") { inStr = c; buf += c; continue; }
      if (c === "(") { paren++; buf += c; continue; }
      if (c === ")") { paren = Math.max(0, paren - 1); buf += c; continue; }
      if (paren > 0) { buf += c; continue; }        /* url(...) 等内容不参与配平 */

      if (c === "{") {
        const prelude = buf.trim();
        buf = "";
        const kind = prelude.startsWith("@") ? "at" : "rule";
        if (kind === "at") totalAt++; else totalRules++;
        const top = stack[stack.length - 1];
        if (top && top.kind === "rule") {
          errors.push({ code: "E3 NESTED_RULE", line, msg:
            `规则 \`${top.prelude}\` 的声明块内部又出现 \`{\`（子规则 \`${prelude}\`）`
            + ` —— 多半是上一条漏了 \`}\`；浏览器会把它当 CSS 嵌套，`
            + `实际生效选择器变成 \`${top.prelude} ${prelude}\`` });
          top.nested.push(prelude);
        }
        stack.push({ kind, prelude, line, nested: [], declAfterNested: false });
        continue;
      }
      if (c === "}") {
        flushDecl();
        const top = stack[stack.length - 1];
        if (!top) {
          errors.push({ code: "E1 ORPHAN_BRACE", line, msg:
            "顶层多余的 `}`（无对应 `{`）—— 实测它会连带吞掉紧随其后的那条规则，"
            + "被吞的规则不会出现在 CSSOM 里，所以「浏览器没报错」不等于「没影响」" });
          continue;
        }
        stack.pop();
        buf = "";
        if (top.kind === "rule" && top.nested.length) {
          errors.push({ code: "E4 DECL_AFTER_NESTED", line: top.line, msg:
            `\`${top.prelude}\` 在子规则之后仍有声明` +
            (top.declAfterNested ? "（这些声明会被意外算进该选择器）" : "") +
            `；子规则：${top.nested.map((x) => "`" + x + "`").join("、")}` });
        }
        continue;
      }
      buf += c;
      if (c === ";") buf = "";
    }
    flushDecl();
    for (const open of stack) {
      errors.push({ code: "E2 UNCLOSED", line: open.line, msg: `\`${open.prelude}\` 的 \`{\` 直到样式块结束都没闭合` });
    }
  }
  return { errors, blocks, totalRules, totalAt };
}

/* ---------- 3. CLI（被 import 时不执行） ---------- */
const isMain = !!process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const file = process.argv[2] && !process.argv[2].startsWith("--")
    ? path.resolve(process.argv[2])
    : path.resolve(__dirname, "..", "agent-workbench.html");
  if (!fs.existsSync(file)) { console.error(`ERR: 找不到目标文件 ${file}`); process.exit(2); }
  const { errors, blocks, totalRules, totalAt } = scanCssStructure(fs.readFileSync(file, "utf8"));
  if (!blocks.length) { console.error("ERR: 目标文件里没有 <style> 块"); process.exit(2); }
  const rel = path.relative(process.cwd(), file) || file;
  if (errors.length) {
    console.error(`[lint-css-structure] ✗ ${rel}：${errors.length} 处结构问题`);
    for (const e of errors) console.error(`  ${e.code}  第 ${e.line} 行  ${e.msg}`);
    process.exit(1);
  }
  if (process.argv.includes("--verbose")) {
    console.log(`[lint-css-structure] ✓ ${rel}：${blocks.length} 个 style 块 / ${totalRules} 条规则 / ${totalAt} 个 at-rule —— 括号配平、无意外嵌套`);
  } else {
    console.log(`[lint-css-structure] ✓ ${totalRules} 条规则括号配平、无意外嵌套`);
  }
}
