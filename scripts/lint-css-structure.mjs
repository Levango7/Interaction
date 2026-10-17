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
   一旦拼回成交付态（with-injected 注入之后），直接正则会把 3.5MB 的 JS 当 CSS 解析 ——
   实测报 1766 条假阳性。所以做一次线性走查：遇到 <style> 收内容、
   遇到 <script>/<!-- --> 整段跳过。纯 indexOf 跳转，不建字符数组（交付态 3.5MB）。 */
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
  /* v3.7.132（CSS 分区守卫）：分区注释与 keyframes 台账。
     · sections：`/* ===== 标题 ===== *／` 形态的注释 —— 它们是样式表**事实上的分区目录**
       （当前 90+ 个）。守两条：必须在花括号深度 0（嵌在规则里的"节标题"是假分区，会骗导航）；
       重复标题不拦（历史确实有同名节），由 --sections 报告暴露给人看。
     · keyframes：`@keyframes` 台账 —— 守重复名（后者静默覆盖前者）与孤儿（定义了没人引用）。 */
  const sections = [];        /* { title, line, depth } */
  const keyframes = [];       /* { name, line } */
  const blocks = findStyleBlocks(src).map((s) => ({
    css: src.slice(s.bodyStart, s.bodyEnd),
    startLine: src.slice(0, s.bodyStart).split("\n").length,
  }));

  for (const { css, startLine } of blocks) {
    const stack = [];     /* { kind:'at'|'rule', prelude, line, nested:[], declAfterNested:bool } */
    let buf = "";
    let line = startLine;
    let inComment = false, inStr = null, paren = 0;
    let commentBuf = "";
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
      if (inComment) {
        if (c === "*" && n === "/") {
          inComment = false; i++;
          /* 分区注释台账（注释体结束的那一刻才完整） */
          const m = /^\s*=====\s*(.+?)\s*=====\s*$/.exec(commentBuf);
          if (m) sections.push({ title: m[1], line, depth: stack.length });
          commentBuf = "";
        } else commentBuf += c;
        continue;
      }
      if (inStr) {
        if (c === "\\") { i++; continue; }
        if (c === inStr) inStr = null;
        continue;
      }
      if (c === "/" && n === "*") { inComment = true; commentBuf = ""; i++; continue; }
      if (c === '"' || c === "'") { inStr = c; buf += c; continue; }
      if (c === "(") { paren++; buf += c; continue; }
      if (c === ")") { paren = Math.max(0, paren - 1); buf += c; continue; }
      if (paren > 0) { buf += c; continue; }        /* url(...) 等内容不参与配平 */

      if (c === "{") {
        const prelude = buf.trim();
        buf = "";
        const kind = prelude.startsWith("@") ? "at" : "rule";
        if (kind === "at") {
          totalAt++;
          const kf = /^@keyframes\s+([\w-]+)/.exec(prelude);
          if (kf) keyframes.push({ name: kf[1], line });
        } else totalRules++;
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

    /* ---- C5 SECTION_NESTED：分区注释必须落在花括号深度 0 ----
       嵌在规则内部的"节标题"会让按标题导航的人直接跳进某条规则的肚子 —— 假分区比没有分区更误导。 */
    for (const sec of sections) {
      if (sec.depth > 0) {
        errors.push({ code: "C5 SECTION_NESTED", line: sec.line, msg:
          `分区注释「===== ${sec.title} =====」出现在花括号深度 ${sec.depth}（嵌在某条规则的内部）`
          + ` —— 分区标题必须落在顶层，否则按标题导航会跳进规则的肚子` });
      }
    }
    /* ---- C6 KEYFRAMES_DUP：同名 @keyframes 后者静默覆盖前者 ---- */
    const seen = new Map();
    for (const kf of keyframes) {
      if (seen.has(kf.name)) {
        errors.push({ code: "C6 KEYFRAMES_DUP", line: kf.line, msg:
          `@keyframes \`${kf.name}\` 重复定义（首次在第 ${seen.get(kf.name)} 行）—— `
          + `后者会静默覆盖前者，两处动画实际只有一份生效` });
      } else seen.set(kf.name, kf.line);
    }
  }
  return { errors, blocks, totalRules, totalAt, sections, keyframes };
}

/* ---------- 2b. 孤儿 @keyframes（需要"引用语料"才能判，故独立成纯函数） ----------
   判据刻意放宽：`animation: 1s spin ...` 这类「时长在前」的合法简写、CSS 变量间接引用、
   甚至 JS 里 style.animation = "..." —— 只要名字在语料里以整词出现过**超过定义次数**，就不算孤儿。
   误报孤儿比漏报孤儿贵：前者会逼人删掉活代码。 */
export function findOrphanKeyframes(keyframes, corpus) {
  const names = new Map();
  for (const kf of keyframes) names.set(kf.name, (names.get(kf.name) || 0) + 1);
  const orphans = [];
  for (const [name, defCount] of names) {
    const re = new RegExp("(?<![\\w$-])" + name.replace(/\$/g, "\\$") + "(?![\\w$-])", "g");
    const uses = (corpus.match(re) || []).length;
    if (uses <= defCount) orphans.push({ name, defCount, uses, line: keyframes.find((k) => k.name === name).line });
  }
  return orphans;
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
  const text = fs.readFileSync(file, "utf8");
  const { errors, blocks, totalRules, totalAt, sections, keyframes } = scanCssStructure(text);
  if (!blocks.length) { console.error("ERR: 目标文件里没有 <style> 块"); process.exit(2); }
  const rel = path.relative(process.cwd(), file) || file;

  /* --sections：输出分区目录（给人看的导航，不判失败） */
  if (process.argv.includes("--sections")) {
    console.log(`[lint-css-structure] ${rel} 分区目录：${sections.length} 节 / ${keyframes.length} 个 @keyframes`);
    const lines = text.split("\n");
    for (let i = 0; i < sections.length; i++) {
      const end = i + 1 < sections.length ? sections[i + 1].line - 1 : (text.split("\n").length);
      console.log(`  L${String(sections[i].line).padStart(5)}-L${String(end).padStart(5)}  ${sections[i].title}`);
    }
    console.log(`  （@keyframes：${keyframes.map((k) => k.name).join(", ")}）`);
  }

  /* ---- C7 KEYFRAMES_ORPHAN：定义了却没人引用（语料 = 本文件 + src/*.js，防漏 JS 侧内联动画） ---- */
  let corpus = text;
  const srcDir = path.join(__dirname, "..", "src");
  if (fs.existsSync(srcDir)) {
    for (const f of fs.readdirSync(srcDir).filter((x) => x.endsWith(".js"))) {
      corpus += "\n" + fs.readFileSync(path.join(srcDir, f), "utf8");
    }
  }
  for (const o of findOrphanKeyframes(keyframes, corpus)) {
    errors.push({ code: "C7 KEYFRAMES_ORPHAN", line: o.line, msg:
      `@keyframes \`${o.name}\` 定义了但全仓（样式表 + src JS）没有任何整词引用 —— 死动画，删掉或补引用` });
  }

  if (errors.length) {
    console.error(`[lint-css-structure] ✗ ${rel}：${errors.length} 处结构问题`);
    for (const e of errors) console.error(`  ${e.code}  第 ${e.line} 行  ${e.msg}`);
    process.exit(1);
  }
  if (process.argv.includes("--verbose")) {
    console.log(`[lint-css-structure] ✓ ${rel}：${blocks.length} 个 style 块 / ${totalRules} 条规则 / ${totalAt} 个 at-rule / ${sections.length} 节 —— 括号配平、无意外嵌套、分区与 keyframes 台账干净`);
  } else {
    console.log(`[lint-css-structure] ✓ ${totalRules} 条规则括号配平、无意外嵌套（${sections.length} 节 / keyframes 无孤儿）`);
  }
}
