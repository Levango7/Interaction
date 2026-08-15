/**
 * C2 条件求值沙箱加固 · 回归验证（v1.11.1 修复）
 * ----------------------------------------------------------------------------
 * 审查报告 C2（严重）：_evalCondition 的"字符过滤 + 黑名单正则 + new Function"路线
 * 可被 \uXXXX 标识符转义绕过（转义文本不命中字面正则，new Function 解析时还原为
 * 任意标识符），静态推演可执行任意 JS。
 *
 * v1.11.1 修复：字符串条件改经 wfEvalCondition（白名单递归下降解析器，无 eval、
 * 无全局对象可达），不可解析一律返回 false（fail-closed）。
 *
 * 本文件验证：
 *   ① 注入载荷全部 fail-closed（含原漏洞 PoC 形态 \u0065val）；
 *   ② 合法条件语义保持（比较/逻辑/字符串/in/contains/严格相等）；
 *   ③ boolean/undefined/function 分支行为不变；
 *   ④ wfEvalCondition 的 === / !== 新语法支持。
 */

import { describe, it, expect, beforeEach } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

function freshWin() {
  const win = loadApp();
  win.localStorage.clear();
  return win;
}

describe("C2 条件求值加固（v1.11.1 修复回归）", () => {
  let win;
  beforeEach(() => { win = freshWin(); });

  describe("注入载荷 fail-closed", () => {
    const PAYLOADS = [
      "\\u0065val('x')",            // 原 C2 漏洞 PoC：Unicode 转义 eval
      "\\u0061lert(1)",             // 转义 alert
      "constru\\u0063tor.constructor('return 1')()", // 转义 constructor 链
      "alert(1)",                   // 未转义但语法外（无调用语法）
      "globalThis",                 // 旧黑名单词：现为未定义变量 → falsy
      "fetch('https://evil.example.com')",
      "throw new Error('x')",
      "var x = 1",                  // 语句而非表达式
      "a;b",
      "window.location",
    ];
    for (const p of PAYLOADS) {
      it(`_evalCondition(${JSON.stringify(p)}) 返回 false 且不抛错`, () => {
        expect(() => win.__test._evalCondition(p, {})).not.toThrow();
        expect(win.__test._evalCondition(p, {})).toBe(false);
      });
    }

    it("原始 PoC 形态在含匹配 context 时也不能借解析器逃逸（fail-closed 而非求值成功）", () => {
      // 即使 context 里塞入同名函数，解析器也不支持调用语法 → 解析失败 → false
      const ctx = { eval: () => true, alert: () => true };
      expect(win.__test._evalCondition("\\u0065val('x')", ctx)).toBe(false);
      expect(win.__test._evalCondition("alert(1)", ctx)).toBe(false);
    });
  });

  describe("合法条件语义保持", () => {
    it("数值比较", () => {
      expect(win.__test._evalCondition("value > 10", { value: 50 })).toBe(true);
      expect(win.__test._evalCondition("value > 10", { value: 5 })).toBe(false);
      expect(win.__test._evalCondition("value >= 3 || level == 'high'", { value: 1, level: "high" })).toBe(true);
    });
    it("字符串相等 + 逻辑组合", () => {
      expect(win.__test._evalCondition("a == 'foo' && b == 2", { a: "foo", b: 2 })).toBe(true);
      expect(win.__test._evalCondition("a == 'foo' && b == 2", { a: "bar", b: 2 })).toBe(false);
      expect(win.__test._evalCondition("!(a == 'bar')", { a: "foo" })).toBe(true);
    });
    it("成员路径访问", () => {
      expect(win.__test._evalCondition("task.status == 'done'", { task: { status: "done" } })).toBe(true);
      expect(win.__test._evalCondition("task.count >= 2", { task: { count: 3 } })).toBe(true);
    });
    it("in / contains", () => {
      expect(win.__test._evalCondition("x in ['a','b']", { x: "a" })).toBe(true);
      expect(win.__test._evalCondition("name contains 'lic'", { name: "Alice" })).toBe(true);
      expect(win.__test._evalCondition("name contains 'zz'", { name: "Alice" })).toBe(false);
    });
    it("算术组合", () => {
      expect(win.__test._evalCondition("a + b > 10", { a: 6, b: 7 })).toBe(true);
      expect(win.__test._evalCondition("a * 2 <= 10", { a: 5 })).toBe(true);
    });
  });

  describe("非字符串分支行为不变", () => {
    it("undefined / null 条件默认通过", () => {
      expect(win.__test._evalCondition(undefined, {})).toBe(true);
      expect(win.__test._evalCondition(null, {})).toBe(true);
    });
    it("boolean 条件直通", () => {
      expect(win.__test._evalCondition(true, {})).toBe(true);
      expect(win.__test._evalCondition(false, {})).toBe(false);
    });
    it("function 条件求值其结果", () => {
      expect(win.__test._evalCondition((ctx) => ctx.ok, { ok: true })).toBe(true);
      expect(win.__test._evalCondition(() => { throw new Error("x"); }, {})).toBe(false);
    });
  });

  describe("wfEvalCondition 严格相等新语法（v1.11.1）", () => {
    it("=== / !== 支持（兼容 JS 写法的既有条件）", () => {
      expect(win.__test.wfEvalCondition("b === 2", { b: 2 })).toBe(true);
      expect(win.__test.wfEvalCondition("b === '2'", { b: 2 })).toBe(false);
      expect(win.__test.wfEvalCondition("b !== 2", { b: 3 })).toBe(true);
      expect(win.__test._evalCondition("b === 2 && c !== 'x'", { b: 2, c: "y" })).toBe(true);
    });
  });
});
