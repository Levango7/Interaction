/**
 * empty-catch.test.js —— 空 catch 判定逻辑的单测（v3.7.87 新增）
 * ----------------------------------------------------------------------------
 * `catch(_){}` 是**静默失败的唯一温床**：用户遇到"点了没反应/数据没保存/面板空白"，
 * 控制台干净、日志为空 —— 因为异常被吞了。这类缺陷浏览器根本不报错，只能靠构建期扫描。
 *
 * 本测直接 import `scripts/lib/empty-catch.mjs` 的纯函数，**不 spawn 子进程**：
 *   ① 走 execFileSync 在受限环境会 EBUSY（本机实测），本机就验不了 → 门禁形同虚设；
 *   ② 项目既定原则（见 lib/code-scan.mjs 注释）：判定逻辑必须能被单测**直接打到**，
 *      而不是靠跑整个 CLI 再读 stdout 间接观察。
 *
 * 每条用例对应本项目**实际踩过的一个坑**，钉死防复发：
 *   ① 行号必须落在原文真实行 —— 曾在剥离后的文本上算行号，多行模板字符串被删导致行数漂移，
 *      位置落到 `${esc(p.name)}` 这种 HTML 字面量行上
 *   ② 嵌套花括号不得误判 —— 老正则 `\{([^{}]*)\}` 遇 `catch(e){ if(x){ y(); } }` 只吃到内层，
 *      把 92 处报成 489 处
 *   ③ 注释-only 算空 —— 只有注释 == 什么都没做
 *   ④ 反馈性调用不算债 —— `try{ pushDiag(...) }catch(_){}` 是规范写法，删掉反而制造递归风险
 *   ⑤ P0 诱因要认得出 —— localStorage / JSON.parse / await / save 系（内部就是 setItem）
 *   ⑥ 同类多处不得被 keyOf 去重 —— 曾 493 处被吞成 452 条，修一处另一处跟着"消失"
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { scanSource, findEmptyCatches, tryBlockBefore, classify, stripFeedbackCalls, keyOf, P0_PATTERNS } from "../scripts/lib/empty-catch.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");
const BASELINE = join(ROOT, "scripts", "lint-empty-catch.baseline.json");

/** 扫一段源码，返回 {P0,P1,P2} 各级条数 */
function levels(code, file = "fixture.js") {
  const items = scanSource(code, file);
  const n = (lv) => items.filter((i) => i.level === lv).length;
  return { P0: n("P0"), P1: n("P1"), P2: n("P2"), items };
}

describe("v3.7.87 空 catch · 判别力（每条对应一个真实踩坑）", () => {
  it("① 行号必须落在原文真实行（不得漂到模板字符串行）", () => {
    const code = [
      "function render(){",
      '  const html = `<div>${esc(name)}</div>`;',
      "  return html;",
      "}",
      "function go(){ try{ JSON.parse(s); }catch(_){} }"   // 真实位置：第 5 行
    ].join("\n");
    const { items } = levels(code, "lines.js");
    expect(items.length, "应识别出 1 处空 catch").toBe(1);
    expect(items[0].line, `位置应落在第 5 行，实际第 ${items[0].line} 行`).toBe(5);
  });

  it("② 嵌套花括号不得误判为空（老实现曾把 92 处报成 489 处）", () => {
    const code = `
      function a(){ try{ risky(); }catch(e){ if(window.__debug){ console.log(e); } } }
      function b(){ try{ risky2(); }catch(e){ try{ log(x); }catch(_){} } }
    `;
    const r = levels(code, "nest.js");
    expect(r.P0, "嵌套体里有真实代码，不该算空").toBe(0);
    /* b 的内层 `catch(_){}` 才是真空的那一个 —— 它确实什么都没做 */
    expect(r.items.length).toBe(1);
  });

  it("③ 注释-only 的 catch 判定为「空」，并标记 bare=false", () => {
    const { items } = levels("function a(){ try{ JSON.parse(s); }catch(_){ /* 脏数据忽略 */ } }", "c.js");
    expect(items.length).toBe(1);
    expect(items[0].level).toBe("P0");
    expect(items[0].bare, "有注释 ⇒ bare=false（作者至少留了理由）").toBe(false);
  });

  it("④ 无注释的同款 P0 必须标记 bare=true（它是优先处理对象）", () => {
    const { items } = levels("function a(){ try{ JSON.parse(s); }catch(_){} }", "bare.js");
    expect(items[0].bare, "无注释 ⇒ bare=true").toBe(true);
  });

  it("⑤ 反馈性调用不算债：try{ pushDiag/toast/console }catch(_){} 是规范写法", () => {
    const r = levels(`
      function a(){ try{ pushDiag("error","x",{where:"a"}); }catch(_){ /* 诊断不可用时静默 */ } }
      function b(){ try{ toast("hi","info"); }catch(_){} }
      function c(){ try{ console.warn("noop"); }catch(_){} }
    `, "fb.js");
    expect(r.P2, "三条都应归 P2").toBe(3);
    expect(r.P0).toBe(0);
    expect(r.P1).toBe(0);
  });

  it("⑥ 四类 P0 诱因都要认得出（localStorage/JSON.parse/await/save 系）", () => {
    const r = levels(`
      async function a(){ try{ localStorage.getItem("k"); }catch(_){} }
      function b(){ try{ JSON.parse(s); }catch(_){} }
      async function c(){ try{ await idbPut(x); }catch(_){} }
      function d(){ try{ save(PREFIX+"k", v); }catch(_){} }
    `, "p0.js");
    expect(r.P0, `四类应全部判 P0，实际 ${JSON.stringify(r)}`).toBe(4);
  });

  it("⑦ 三档能分开：同一文件里 P0/P1/P2 各一", () => {
    const r = levels(`
      function a(){ try{ localStorage.setItem("k","1"); }catch(_){} }
      function b(){ try{ doSomethingBusiness(); }catch(_){} }
      function c(){ try{ return typeof window.X === "function"; }catch(_){} }
    `, "mix.js");
    expect(r.P0).toBe(1); expect(r.P1).toBe(1); expect(r.P2).toBe(1);
  });

  it("⑧ P0 优先于 P2：能力探测里混了 await 必须仍判 P0（宽判无害才是真危险）", () => {
    const r = levels(`async function a(){ try{ if(typeof X!=="undefined"){ await X.init(); } }catch(_){} }`, "mix2.js");
    expect(r.P0).toBe(1);
  });
});

describe("v3.7.87 空 catch · 基线与全仓一致性", () => {
  /* 全仓扫描走纯函数调用（不 spawn），结果与 CLI 走同一套 lib，本机与 CI 一致 */
  const allItems = (() => {
    const files = readdirSync(SRC).filter((f) => f.endsWith(".js")).sort();
    const seen = {}; const out = [];
    for (const f of files) out.push(...scanSource(readFileSync(join(SRC, f), "utf8"), f, seen));
    return out;
  })();

  it("全仓扫出的条数与基线完全一致（不多不少）", () => {
    const base = JSON.parse(readFileSync(BASELINE, "utf8"));
    expect(allItems.length).toBe(base.count);
    expect(allItems.length).toBe(base.items.length);
  });

  it("每条 key 唯一 —— file:sig#occ 三元组不得撞车（否则 493 会被吞成 452）", () => {
    const keys = allItems.map(keyOf);
    expect(new Set(keys).size, `keyOf 必须带 occ：${keys.length - new Set(keys).size} 条重复`).toBe(keys.length);
  });

  it("每条必须是三档之一且带 why（报告要能直接指导行动）", () => {
    for (const it of allItems) {
      expect(["P0", "P1", "P2"], `${it.file}:${it.line} 等级非法`).toContain(it.level);
      expect(it.why, `${it.file}:${it.line} 缺 why`).toBeTruthy();
      expect(typeof it.bare, `${it.file}:${it.line} bare 非布尔`).toBe("boolean");
    }
  });

  it("每条都落在真实行号范围内（1 ≤ line ≤ 文件总行数）", () => {
    for (const it of allItems) {
      const total = readFileSync(join(SRC, it.file), "utf8").split("\n").length;
      expect(it.line, `${it.file}:${it.line} 超出范围（共 ${total} 行）`).toBeGreaterThanOrEqual(1);
      expect(it.line).toBeLessThanOrEqual(total);
    }
  });

  it("P0 的集合必须与 P0_PATTERNS 自洽（随手改规则不会静默改变结论）", () => {
    /* 抽一条已知 P0 复核：它的 try 体必须真能命中某条规则 */
    const p0 = allItems.filter((i) => i.level === "P0");
    expect(p0.length).toBeGreaterThan(0);
    const sample = p0.find((i) => i.why.includes("localStorage"));
    expect(sample, "应存在 localStorage 类 P0").toBeTruthy();
    expect(P0_PATTERNS.some((p) => sample.why === p.why), "why 应取自规则表").toBe(true);
  });
});
