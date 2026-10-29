/**
 * empty-catch-reject-v2.test.js —— `.catch()` / `.then()` 空处理器判定的单测（v3.7.152 新增）
 * ----------------------------------------------------------------------------
 * 背景：`findEmptyRejectionHandlers()` 原来的「整形状正则」实现有两个实证缺陷，2026-10-30 实测后重写：
 *   ① **惰性跨段匹配**：`\{\s*(?:\/\*[\s\S]*?\*\/|\/\/[^\n]*)*\s*\}` 里的 `[\s\S]*?` 会往文件后面扩张，
 *      直到找到某处块注释收尾符且其后紧跟 `}` ⇒ 「体首句是注释、后面有真语句」的处理器被判成空。
 *      实证 `ui-backup-stats.js:401`：体里明明有 `pushDiag`，仍被计 P0。
 *   ② **不判注释/字符串**：在 raw 原文上跑 ⇒ 注释里引用的旧代码也计数
 *      （`ui-backup-stats.js:878` 落在描述 R-34 假回执的块注释里）。
 *
 * 本测钉死三件事：
 *   ① 缺陷 ①/② 的**回归锁**（有留痕的不算空、注释里的不算数）；
 *   ② 真·空处理器**仍然抓得到**（不能因为修假阳性就把真问题放过去）；
 *   ③ `maskCommentsAndStrings()` 的**保位不变量**（长度相等、换行位置一致）——
 *      这条一旦破，行号就会漂，门禁报的位置全是错的。
 *
 * 另有一条**实现过程中踩到的坑**也钉在这里：`() => resolve({})` 的第一个 `{` 是
 * **实参里的空对象字面量**，不是函数体 —— 按「取第一个 `{`」实现会把它误判成空处理器。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { findEmptyRejectionHandlers, scanSource } from "../scripts/lib/empty-catch.mjs";
import { maskCommentsAndStrings, stripCommentsAndStrings } from "../scripts/lib/code-scan.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");

/** 数一段代码里被判为「空处理器」的个数 */
const n = (code) => findEmptyRejectionHandlers(code).length;
const lineOf = (code, i) => code.slice(0, i).split("\n").length;

describe("① 假阳性回归锁：这些**不是**空处理器", () => {
  it("体里有真语句（首句是注释）—— :401 的实证形态", () => {
    expect(n('p.catch(function(e){\n  /* 过去这里完全静默，现在留痕 */\n  try{ pushDiag("warn","x"); }catch(_){}\n});')).toBe(0);
  });

  it("箭头体里有真语句", () => {
    expect(n('p.catch(e => {\n  /* 说明 */\n  pushDiag("warn", e);\n});')).toBe(0);
  });

  it("注释里引用的旧代码不算数—— :878 的实证形态", () => {
    const code = "/* 旧实现：.catch(()=>{}); 两个处理器都是空的，剪贴板被拒时谎报成功（R-34） */\nconst x = 1;\n";
    expect(n(code)).toBe(0);
  });

  it("字符串里的字样不算数", () => {
    expect(n('const s = "p.catch(()=>{})";\n')).toBe(0);
  });

  it("表达式体箭头 `() => resolve({})` 不是空处理器（实参里的 {} 是对象字面量）", () => {
    expect(n("p.catch(() => resolve({}));")).toBe(0);
    expect(n("p.then(ok, () => fallback({})) ;")).toBe(0);
  });

  it("传具名函数引用不算空处理器（没有块体可判）", () => {
    expect(n("p.catch(handleErr);")).toBe(0);
  });
});

describe("② 真·空处理器必须仍然抓得到（修假阳性不许放掉真问题）", () => {
  it("四种空形态各命中一次", () => {
    expect(n("p.catch(()=>{});")).toBe(1);
    expect(n("p.catch(function(){});")).toBe(1);
    expect(n("p.catch(function(e){});")).toBe(1);
    expect(n("p.then(ok, ()=>{});")).toBe(1);
  });

  it("只有注释的体仍算空（注释 == 什么都没做）", () => {
    expect(n("p.catch(function(){ /* 拒绝时静默降级到 toast */ });")).toBe(1);
  });

  it("`.then(a, b, c)` 的第三参**不计** —— 标准 Promise.then 只接两参，第三参运行时根本不会被调用", () => {
    /* 旧实现的正则前缀 `(?:[A-Za-z_$][\w$]*\s*,\s*)*` 会把第三参也当处理器，
       于是 `.then(a, b, ()=>{})` 被计入 —— 但那个处理器**永远不会被执行**，
       计它只会制造一条永远无法复现的假条目。新实现只认第 2 参（rejection 位）。 */
    expect(n("p.then(a, b, ()=>{});")).toBe(0);
    expect(n("p.then(a, ()=>{});")).toBe(1);
  });

  it("一行里两处各算一处，不互相吞", () => {
    expect(n("p.catch(()=>{}); q.catch(()=>{});")).toBe(2);
  });

  it("行号必须落在原文真实行（保位掩码的意义就在这里）", () => {
    const code = "// 第 1 行\nconst a = 1;\np.catch(()=>{});\n";
    const hits = findEmptyRejectionHandlers(code);
    expect(hits.length).toBe(1);
    expect(lineOf(code, hits[0].idx)).toBe(3);
  });
});

describe("③ 保位掩码不变量（破了行号就全错）", () => {
  const cases = [
    "const a = 1; // 行注释\n",
    "/* 块\n   注释 */\nconst b = 2;\n",
    "const s = `模板 ${1 + 2} 串`;\n",
    "const r = /a\\/b/g;\n",
    "const t = \"未闭合\n",
  ];
  for (const c of cases) {
    it("长度与换行位置一一对齐：" + JSON.stringify(c.slice(0, 18)), () => {
      const m = maskCommentsAndStrings(c);
      expect(m.length).toBe(c.length);
      for (let i = 0; i < c.length; i++) {
        if (c[i] === "\n") expect(m[i]).toBe("\n");
      }
    });
  }

  it("注释内容在掩码里被抹掉，注释外的代码逐字保留（否则定位结果全是错的）", () => {
    /* 注意：不能拿「剥一遍掩码」去和「直接剥」比 —— 掩码把注释换成**等长空格**，
       剥则是**删除**，两者空白数量本就不同。可比的是"内容"：注释里的字必须消失，代码必须原样。 */
    const raw = "/* note here */ const a = 1;\n";
    const m = maskCommentsAndStrings(raw);
    expect(m).not.toContain("note");
    expect(m.slice(m.indexOf("const"))).toBe("const a = 1;\n");
    /* 同一份输入，剥模式必须把注释整个删掉 */
    expect(stripCommentsAndStrings(raw).trim()).toBe("const a = 1;");
  });
});

describe("④ 真实源码上的契约：掉的是误判，留的是真空", () => {
  const p0Lines = (file) => scanSource(readFileSync(join(SRC, file), "utf8"), file)
    .filter((i) => i.level === "P0" && i.kind === "reject")
    .map((i) => i.line);

  it("ui-backup-stats.js:401 不再被计入（体里有 pushDiag）", () => {
    expect(p0Lines("ui-backup-stats.js")).not.toContain(401);
    /* 同时钉住：那条留痕本身还在 —— 别把「不再计入」干成「把留痕删了」 */
    expect(readFileSync(join(SRC, "ui-backup-stats.js"), "utf8").includes("备份：图片键读取失败")).toBe(true);
  });

  it("ui-ge-integrations.js:246 仍在（它是真·空处理器，不该被这次修正误删）", () => {
    expect(p0Lines("ui-ge-integrations.js")).toContain(246);
  });

  it("全仓 reject 类 P0 共 7 处（28 处 P0 里 21 处是 try/catch）", () => {
    let total = 0;
    for (const f of ["ai-loop.js", "ai-tools.js", "render-widgets.js", "ui-backup-stats.js",
      "ui-daily.js", "ui-ge-integrations.js"]) total += p0Lines(f).length;
    expect(total).toBe(7);
  });
});
