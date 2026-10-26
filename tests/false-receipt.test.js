/**
 * false-receipt.test.js —— 「假回执」门禁的判别力单测（R-37，2026-10-27 新增）
 * ----------------------------------------------------------------------------
 * 缺陷原型（台账 R-34）：`navigator.clipboard.writeText(x)` 返回 Promise，同步 try/catch
 * 抓不到 rejection，而 toast 在 promise 落地之前就弹了 —— **失败也报成功**。
 *
 * 本测只打判定层（scripts/lib/false-receipt.mjs）+ 读基线，**不 spawn 子进程**
 * （与 empty-catch.test.js 同款理由：本机 execFileSync 会 EBUSY，靠跑 CLI 验等于验不了）。
 *
 * 每条都对应一个**本门禁自己踩过的坑**，钉死防复发：
 *   ① 丢弃 + toast  ⇒ P0
 *   ② 丢弃 + 布尔标志置真 ⇒ P0（`copied = true` 这种不靠 toast 的回执也必须算）
 *   ③ `.then(空, 空)` 吞掉 ⇒ P0（外面看着"处理过了"，比丢弃更隐蔽）
 *   ④ `.catch(空)` 吞掉 ⇒ 也要抓到
 *   ⑤ **证据区不得越出 try 块** —— 首版固定往后看 600 字符，把 `ui-daily.js:21` 判成 P0，
 *      证据其实来自 try 块**外面**下一行的每日播报 toast（与本次调用无关）
 *   ⑥ 正确写法（await / 赋值后接 .then / then(非空,非空) / return）⇒ **必须 0 命中**，
 *      否则门禁就是在给正确代码泼脏水
 *   ⑦ 现有 src/ 全量 ⇒ 0 命中（修完这 6 处之后的回归基线）
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  findFalseReceipts, hasSuccessReceipt, evidenceEnd, PROMISE_APIS,
} from "../scripts/lib/false-receipt.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");
const BASELINE = join(ROOT, "scripts", "lint-false-receipt.baseline.json");

const scan = (code, file = "fixture.js") => findFalseReceipts(code, file);
const nP = (code, lv = "P0") => scan(code).filter((i) => i.level === lv).length;

describe("R-37 假回执 · 判别力（每条对应一个真实踩坑）", () => {
  it("① 丢弃 + 成功 toast ⇒ P0", () => {
    const code = 'try{ navigator.clipboard.writeText(x); toast("已复制", "ok"); }catch(_){}';
    const items = scan(code);
    expect(items.length, "必须抓到").toBe(1);
    expect(items[0].level).toBe("P0");
    expect(items[0].kind).toBe("discard");
  });

  it("② 丢弃 + 布尔标志置真 ⇒ P0（不靠 toast 的回执也要算）", () => {
    const code = "try{ navigator.clipboard.writeText(r); copied = true; }catch(_){}";
    expect(nP(code)).toBe(1);
  });

  it("③ `.then(空, 空)` 吞掉 ⇒ P0 且 kind=swallow", () => {
    const code = "try{ navigator.clipboard.writeText(r).then(function(){}, function(){}); copied = true; }catch(_){}";
    const items = scan(code);
    expect(items.length).toBe(1);
    expect(items[0].level).toBe("P0");
    expect(items[0].kind).toBe("swallow");
  });

  it("④ `.catch(空)` 也算吞掉（箭头函数体同样认）", () => {
    expect(nP("try{ navigator.clipboard.writeText(r).catch(()=>{}); ok = true; }catch(_){}")).toBe(1);
  });

  it("⑤ 证据区不得越出 try 块 —— 块外的 toast 不能拿来定罪", () => {
    /* 首版 bug：`Notification.requestPermission()` 后面虽无回执，却被 try 块**外面**
       下一行的 toast 判成 P0（真实案例 ui-daily.js:21）。 */
    const code = 'try { Notification.requestPermission(); } catch (e) {}\ntoast("每日播报", "ok");';
    const items = scan(code);
    expect(items.length, "调用本身仍应被记一笔（rejection 无人接）").toBe(1);
    expect(items[0].level, "但只能算 P1，不能算假回执").toBe("P1");
  });

  it("⑤b evidenceEnd：try 块内取块尾，块外才退化为 300 字符", () => {
    const raw = "try{ a(); }\n" + "x".repeat(500) + "\ntoast();";
    const inside = raw.indexOf("a();");
    expect(evidenceEnd(raw, inside)).toBe(raw.indexOf("}"));
  });

  it("⑥ 正确写法 ⇒ 0 命中（门禁不许给正确代码泼脏水）", () => {
    const good = [
      'async function f(){ await navigator.clipboard.writeText(x); toast("已复制","ok"); }',
      'const p = navigator.clipboard.writeText(x); if(p && p.then) p.then(ok, fail);',
      'navigator.clipboard.writeText(x).then(function(){ toast("已复制","ok"); }, function(){ toast("复制失败","warn"); });',
      'function f(){ return navigator.clipboard.writeText(x); }',
      'function f(){ const p = navigator.clipboard.writeText(x); if(p && typeof p.then === "function") p.then(ok, fail); else ok(); }',
    ];
    for (const g of good) {
      expect(scan(g).length, "这行是规范写法，不该被判：" + g).toBe(0);
    }
  });

  it("⑦ 现有 src/ 全量 ⇒ 0 命中（修完 6 处之后的回归基线）", () => {
    const files = readdirSync(SRC).filter((f) => f.endsWith(".js"));
    expect(files.length).toBeGreaterThan(20);
    let hits = 0;
    for (const f of files) hits += scan(readFileSync(join(SRC, f), "utf8"), f).length;
    expect(hits, "src/ 里不该再有被丢弃/吞掉的 Promise 回执").toBe(0);
  });

  it("⑧ 白名单里的 API 都得能被认出来（不是只认剪贴板）", () => {
    expect(PROMISE_APIS.length).toBeGreaterThan(3);
    expect(nP('try{ navigator.share({title:"x"}); toast("已分享","ok"); }catch(_){}')).toBe(1);
    expect(nP('try{ Notification.requestPermission(); ok = true; }catch(_){}')).toBe(1);
  });

  it("⑨ hasSuccessReceipt：warn/error 级别的 toast 不算成功回执", () => {
    expect(hasSuccessReceipt('toast("复制失败","warn");', 0, 40)).toBe(false);
    expect(hasSuccessReceipt('toast("已复制","ok");', 0, 40)).toBe(true);
  });
});

describe("R-37 基线文件", () => {
  it("可解析且为空（修完之后不准再有任何存量）", () => {
    expect(existsSync(BASELINE)).toBe(true);
    const j = JSON.parse(readFileSync(BASELINE, "utf8"));
    expect(Array.isArray(j.items)).toBe(true);
    expect(j.items.length, "基线应为空 —— 有存量说明还有假回执没修").toBe(0);
  });
});
