/**
 * code-scan.test.js —— 守住静态分析词法预处理 scripts/lib/code-scan.mjs
 * ----------------------------------------------------------------------------
 * 为什么要专门给它写测试：module-graph 的依赖边/循环/逆层计数**全部**建立在
 * "先把注释和字符串剥掉，再抽标识符"这一步上。这一步出错的形态不是报错，而是
 * **静默少算**：一个引号误判就能把成百上千行真实代码抹平，门禁于是显示得比实况干净。
 *
 * 真实事故（v3.7.57 定位）：旧实现不认正则字面量，src/ai-tools.js 里的 `/["']/g`
 * 被当成字符串开头，一路吃到后面的引号才收尾，该文件 61834 字节被剥到只剩 35079，
 * 区间内的 getChat / lastChatRequest 等真实引用整个消失 —— 少算了 5 条循环、
 * 6 组逆层块对（修好后同一份 HEAD 源码测出 循环 44 / 逆层 35，旧口径是 39 / 29）。
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { stripCommentsAndStrings } from "../scripts/lib/code-scan.mjs";

const strip = (s) => stripCommentsAndStrings(s);

describe("基本剥除", () => {
  it("行注释 / 块注释都剥掉", () => {
    expect(strip("a1; // say b1\n")).not.toContain("b1");
    expect(strip("/* c1 d1 */ a2;")).not.toContain("c1");
    expect(strip("/* multi\n   line */ a3;")).not.toContain("multi");
  });

  it("字符串内容剥掉，但模板里的 ${表达式} 保留", () => {
    expect(strip('t("chain.reset")')).not.toContain("chain.reset");
    expect(strip("`${getTasks()} 条`")).toContain("getTasks");
    expect(strip("`${getTasks()} 条`")).not.toContain("条");
  });

  it("代码本体保留", () => {
    expect(strip("function keepMe(){ return dropMe; }")).toContain("keepMe");
  });
});

describe("正则字面量（这次事故的正主）", () => {
  it("字符类里带引号的正则不会把后面的代码吃进去", () => {
    const src = [
      "function normalize(q){",
      "  return q.replace(/[\"']/g, \" \").trim();",
      "}",
      "const hist = getChat(sc);          // ← 旧实现在这一行之后整个消失",
      "if(!lastChatRequest) return false;",
    ].join("\n");
    const out = strip(src);
    expect(out, "正则里的引号被误判成字符串开头 = 老 bug 复发").toContain("getChat");
    expect(out).toContain("lastChatRequest");
    expect(out).toContain("normalize");
  });

  it("字符类里的 / 不算正则结束；flags 一并吃掉", () => {
    const out = strip("const re = /[a/]+/g; afterMe;");
    expect(out).toContain("afterMe");
    expect(out).not.toContain("a/]+");
  });

  it("除号不被误判成正则（误判方向安全：顶多少剥几个字符，不能吞代码）", () => {
    const out = strip("const half = total / 2; tail;");
    expect(out).toContain("total");
    expect(out).toContain("tail");
  });

  it("return / 正则 /.test(x) 这种关键字后的斜杠按正则处理", () => {
    const out = strip("function f(s){ return /^[a-z]+$/.test(s); }");
    expect(out).toContain("test");
    expect(out).toContain("s");
  });
});

describe("未闭合引号的污染范围", () => {
  it("单引号没闭合只影响本行，下一行代码仍在", () => {
    const out = strip("const a = 'oops\nconst mustSurvive = 1;\n");
    expect(out, "一个孤立引号吃掉后半篇 = 门禁失明").toContain("mustSurvive");
  });

  it("字符串里有转义引号仍能正确收尾", () => {
    const out = strip("const a = \"say \\\"hi\\\"\"; afterEscape;");
    expect(out).toContain("afterEscape");
    expect(out).not.toContain("say");
  });
});

describe("真实源块的全局不变式（回归哨兵）", () => {
  const SRC = join(process.cwd(), "src");
  const order = JSON.parse(readFileSync(join(SRC, "order.json"), "utf8"));
  const blocks = order.map(o => ({ name: o.name, raw: readFileSync(join(SRC, o.name + ".js"), "utf8") }));

  /** 括号配对检查：吞掉一段代码几乎必然留下落单的 ( [ { 或反过来多出一个闭合符 */
  const imbalance = (code) => {
    const open = { "(": 1, "[": 1, "{": 1 };
    const close = { ")": "(", "]": "[", "}": "{" };
    const stack = [];
    for (const ch of code) {
      if (open[ch]) stack.push(ch);
      else if (close[ch]) {
        if (stack.pop() !== close[ch]) return ch;
      }
    }
    return stack.length ? "余" + stack.length : null;
  };

  it("每个块剥完仍是配对的括号（吞代码必然破坏配对）", () => {
    for (const b of blocks) {
      expect(imbalance(strip(b.raw)), `块 ${b.name} 剥注释/字符串后括号不配对 —— 极可能是词法误判吞了代码`).toBeFalsy();
    }
  });

  it("每个块里所有顶层函数名都还留在剥后的代码里（被吞掉就查得出）", () => {
    for (const b of blocks) {
      const names = [...b.raw.matchAll(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm)].map(m => m[1]);
      const out = strip(b.raw);
      const lost = names.filter(n => !new RegExp("\\b" + n + "\\b").test(out));
      expect(lost, `块 ${b.name} 剥完丢了 ${lost.length} 个函数名（前 3：${lost.slice(0, 3)}）`).toEqual([]);
    }
  });
});

describe("哨兵本身有牙（用旧实现跑一遍，必须被抓住）", () => {
  /* 事故现场的最小复现：一个 /["']/g 就让旧实现把后面整段代码当字符串吃掉 */
  const FIXTURE = [
    "function first(){ return \"x\"; }",
    "const re = /[\"']/g;",
    "function getChat(sc){ return chats[sc] || []; }",
    "function lastOne(){ return 1; }",
    "",
  ].join("\n");

  /** v3.7.57 之前的实现（只认引号、不认正则），用来证明上面两条不变式不是空断言 */
  function legacyStrip(text) {
    let out = "";
    let i = 0;
    const n = text.length;
    while (i < n) {
      const c = text[i], d = text[i + 1];
      if (c === "/" && d === "/") { while (i < n && text[i] !== "\n") i++; continue; }
      if (c === "/" && d === "*") { i += 2; while (i < n && !(text[i] === "*" && text[i + 1] === "/")) i++; i += 2; continue; }
      if (c === '"' || c === "'" || c === "`") {
        const q = c; i++; out += " ";
        while (i < n && text[i] !== q) {
          if (text[i] === "\\") { i += 2; continue; }
          if (q === "`" && text[i] === "$" && text[i + 1] === "{") {
            let depth = 1; i += 2;
            while (i < n && depth > 0) {
              if (text[i] === "{") depth++;
              else if (text[i] === "}") { depth--; if (!depth) { i++; break; } }
              out += text[i]; i++;
            }
            continue;
          }
          i++;
        }
        i++; continue;
      }
      out += c; i++;
    }
    return out;
  }

  it("旧实现在这个 fixture 上确实吞掉了两个函数名", () => {
    const legacy = legacyStrip(FIXTURE);
    expect(legacy, "若这里不再复现，说明 fixture 或哨兵失效了").not.toContain("getChat");
    expect(legacy).not.toContain("lastOne");
    /* 而新实现两个都留得住 —— 两条断言合起来才证明哨兵不是空转 */
    const now = strip(FIXTURE);
    expect(now).toContain("getChat");
    expect(now).toContain("lastOne");
  });
});
