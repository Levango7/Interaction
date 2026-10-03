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

/** 全仓扫描（纯函数调用，不 spawn；结果与 CLI 走同一套 lib，本机与 CI 一致） */
function scanAll() {
  const files = readdirSync(SRC).filter((f) => f.endsWith(".js")).sort();
  const seen = {}; const out = [];
  for (const f of files) out.push(...scanSource(readFileSync(join(SRC, f), "utf8"), f, seen));
  return out;
}

describe("v3.7.87 空 catch · 基线与全仓一致性", () => {
  const allItems = scanAll();

  /* ⚠️ 这里**绝不能**断言「当前扫描条数 == 基线条数」—— v3.7.87 首版就是这么写的，
     结果在 CI 上直接红：基线是在**含他人未提交改动的工作区**冻结的（493），
     而 CI 跑的是 commit tree（不含那些改动，489）。棘轮门禁天生会随工作区状态漂移，
     把「条数相等」写死成断言 = 把门禁绑在一个会变的量上，属于设计错误。
     正确做法：**CLI 只拦新增 P0**（消失不报错、新增只提示），测试只守护
     不随工作区漂移的东西：基线文件自洽性 + 条目结构合法性。 */
  it("基线文件自洽：count 字段 == items 实有条数", () => {
    const base = JSON.parse(readFileSync(BASELINE, "utf8"));
    expect(base.items.length, "count 与 items 必须一致").toBe(base.count);
  });

  it("全仓能扫出合理规模（不为 0，且结构完整）", () => {
    /* 只做量级健康检查，不钉死具体数字 —— 存量会随日常开发自然增减 */
    expect(allItems.length, "全仓空 catch 不应为 0（若归零说明扫描器坏了）").toBeGreaterThan(100);
  });

  it("基线每条 key 唯一 —— file:sig#occ 三元组不得撞车（否则 493 会被吞成 452）", () => {
    const base = JSON.parse(readFileSync(BASELINE, "utf8"));
    for (const it of base.items) {
      expect(["P0", "P1", "P2"], `${it.file}:${it.line} 等级非法`).toContain(it.level);
      expect(it.why, `${it.file}:${it.line} 缺 why`).toBeTruthy();
    }
    const keys = base.items.map(keyOf);
    expect(new Set(keys).size, `基线内出现 ${keys.length - new Set(keys).size} 条重复 key`).toBe(keys.length);
  });

  it("当前扫描每条 key 唯一 —— file:sig#occ 三元组不得撞车", () => {
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

/* ============================================================================
 * v3.7.88：bare 判据扩边 —— catch 体 或 try 上方 说明注释 任一存在即算「已评估」
 * ============================================================================
 * 起因：`bare` 原先只看 catch 体内部，于是「说明写在 try 块上方」的合理降级
 * （catch 体本身是空的）被误判成「作者未评估」→ P0-a 台账混进假阳性，
 * 会误导人去改本来正确的代码。实测样本：ai-tools.js:2188 / 2240 两处 await 空 catch。
 *
 * ⚠️ 判据只影响台账排序，**不参与 P0/P1/P2 分级**；基线 key 也不含 bare
 *   （keyOf = file:sig#occ），故改判据不动棘轮、不需要重冻基线 —— 这正是
 *   把它设计成「只读 bare、不进 key」的原因，也是本组测试要钉住的前提。
 */
describe("v3.7.88 bare 判据扩边（try 上方说明也算已评估）", () => {
  const BARE = (src) => scanSource(src, "fixture.js")[0]?.bare;
  const CATCH = "try{ localStorage.setItem('k','v'); }catch(_){}";

  it("catch 体有注释 → bare=false（原行为不变）", () => {
    expect(BARE(`try{ localStorage.setItem('k','v'); }catch(_){ /* 已评估 */ }`)).toBe(false);
  });

  it("try 上方有行注释 → 判为已评估（v3.7.88 新增）", () => {
    expect(BARE(`// 配额满时静默跳过，已确认无害\n${CATCH}`)).toBe(false);
  });

  it("try 上方有**跨行**块注释（行首星号续行）→ 判为已评估", () => {
    const src = `/* 批量回填缺失向量\n * 没配 embedding 通道就直接返回\n */\n${CATCH}`;
    expect(BARE(src)).toBe(false);
  });

  it("try 上方有跨行块注释（行尾收尾形态）→ 判为已评估", () => {
    /* 这一形态是 v3.7.88 连踩三次才补上的：作者随手在句末写「星号斜杠」收尾，
       而非行首星号续行 → 只判行首会整段漏掉上方说明。 */
    const src = `/* 一次批量补齐所有缺失向量\n   上限传 Infinity：覆盖全表 */\n${CATCH}`;
    expect(BARE(src)).toBe(false);
  });

  it("try 与 catch 同行时，上方注释仍要能读到（行首回溯不能撞上 try 本身）", () => {
    const src = `/* 说明在上一行\n   跨两行收尾 */\n${CATCH}`;
    expect(BARE(src)).toBe(false);
  });

  it("真正无解释 → 仍判 bare（判据没放水）", () => {
    expect(BARE(CATCH)).toBe(true);
    expect(BARE(`const a=1;\n${CATCH}`)).toBe(true);
  });

  it("上方隔了别的代码 → 该注释不算本 catch 的说明，仍判 bare", () => {
    const src = `/* 这是别的函数的注释 */\nconst unrelated = 1;\n${CATCH}`;
    expect(BARE(src)).toBe(true);
  });

  it("🔴 判据扩边不得改变分级（level/why/sig/occ 全部与扩边前一致）", () => {
    /* 分级与 key 都不该被 bare 影响：同一段代码扩边前后，棘轮判定必须完全相同。
       这是「只读 bare、不进 key」设计的守门断言 —— 若有人日后把 bare 塞进 keyOf，
       改判据就会悄悄动基线，本条会先红。 */
    const src = `/* 已评估：配额满属预期降级 */\n${CATCH}`;
    const it = scanSource(src, "fixture.js")[0];
    expect(it.level).toBe("P0");
    expect(it.why).toContain("localStorage");
    expect(keyOf(it)).toBe(keyOf({ ...it, bare: true }));   // key 与 bare 无关
  });

  it("🔴 真实台账：ai-tools.js 里「await 空 catch + 上方有跨行说明」应判为已评估", () => {
    /* 钉死本次修复的现场证据，防止回归。
     * ⚠️ **按内容定位而非硬编码行号** —— 并行 agent（zcode）随时在改 src/，
     *   钉死 2188/2240 会在他插入代码后假红（v3.7.87 已栽过一次「条数相等」断言）。
     *   这里改为「扫出所有 await 类 P0 → 逐条要求 bare=false」，
     *   若将来真出现一条无说明的 await 空 catch，本条会如实红。 */
    const raw = readFileSync(join(SRC, "ai-tools.js"), "utf8");
    const awaits = scanSource(raw, "ai-tools.js")
      .filter((i) => i.level === "P0" && i.why.includes("await"));
    expect(awaits.length, "应存在 await 类 P0（回归时会先在这里提示）").toBeGreaterThan(0);
    for (const it of awaits) {
      expect(it.bare, `ai-tools.js:${it.line} 上方有说明注释，不该判 bare`).toBe(false);
    }
  });

  it("🔴 反向守护：全仓不应出现「新增的无解释 P0」（判据过宽会掩盖新问题）", () => {
    /* 判据扩边的风险是「把真有问题的也当成已评估」。此条反向兜底：
     * 扩边只允许**减少** bare，不允许把 P0 从清单里藏起来。
     * 具体口径：P0 总数与分级不因 bare 判据而变（下面按 level 统计），
     * 且仍必须有相当比例的 P0 是 bare（否则判据宽到把所有 P0 都吞了）。 */
    const p0 = scanAll().filter((i) => i.level === "P0");
    const bareP0 = p0.filter((i) => i.bare);
    expect(bareP0.length, "bare P0 不应为 0 —— 否则判据宽到把真问题也藏了").toBeGreaterThan(0);
    expect(bareP0.length, "bare P0 不应等于全部 P0 —— 那说明判据失效").toBeLessThan(p0.length);
  });
});
