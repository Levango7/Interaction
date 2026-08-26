import { describe, it, expect, beforeAll } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

/**
 * v3.1 SQL Playground 测试。
 * jsdom 环境无真实网络，无法从 CDN 加载 sql.js WASM；通过在 beforeAll 中注入
 * 假 initSqlJs（返回最小 SQL.Database mock）使 loadSqlJs 直接 resolve，
 * 从而验证 runSql 的协议（ok/cols/rows/ms/error）与导出契约。
 */
describe("v3.1 SQL Playground", () => {
  let w;

  beforeAll(() => {
    w = loadApp();
    // 注入假 initSqlJs：避免 jsdom 无网络时 CDN 加载失败
    // mock 支持最小 SQL 语义：SELECT 1 as val / 空串 / 语法错误
    w.initSqlJs = async function () {
      return {
        Database: function () {
          this.exec = function (sql) {
            if (!sql || !sql.trim()) return [];
            var trimmed = sql.trim();
            // SELECT 1 as val → 单行单列
            if (/^select\s+1\s+as\s+val/i.test(trimmed)) {
              return [{ columns: ["val"], values: [[1]] }];
            }
            // 明显非法语句 → 抛错（模拟 sql.js 解析失败）
            if (/^invalid/i.test(trimmed) || /!!!/.test(trimmed)) {
              throw new Error('syntax error near "!!!"');
            }
            // 其他合法但无返回行的语句
            return [];
          };
          this.close = function () {};
        },
      };
    };
  });

  it("runSql 函数已导出到 window.__test", () => {
    expect(typeof w.__test.runSql).toBe("function");
  });

  it("loadSqlJs 函数已导出到 window.__test", () => {
    expect(typeof w.__test.loadSqlJs).toBe("function");
  });

  it("bindCodeSqlCard 函数已导出到 window.__test", () => {
    expect(typeof w.__test.bindCodeSqlCard).toBe("function");
  });

  it("runSql 返回 Promise", () => {
    const result = w.__test.runSql("SELECT 1 as val");
    // jsdom 跨 realm：用 thenable 契约代替 instanceof Promise
    expect(result).toBeTruthy();
    expect(typeof result.then).toBe("function");
    expect(typeof result.catch).toBe("function");
    // 避免未处理拒绝
    result.catch(function () {});
  });

  it("runSql 空字符串返回 ok（无返回行）", async () => {
    const result = await w.__test.runSql("");
    expect(result.ok).toBe(true);
    expect(result.cols).toEqual([]);
    expect(result.rows).toEqual([]);
    expect(typeof result.ms).toBe("number");
  });

  it("runSql 语法错误返回 error", async () => {
    const result = await w.__test.runSql("INVALID SQL !!!");
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("runSql SELECT 1 as val 返回单行单列", async () => {
    const result = await w.__test.runSql("SELECT 1 as val");
    expect(result.ok).toBe(true);
    expect(result.cols).toEqual(["val"]);
    expect(result.rows).toEqual([[1]]);
  });

  it("runSql 带 schemaDdl 先执行 DDL（容错）", async () => {
    // mock 中 DDL exec 返回 []，不报错；后续 SELECT 走正常分支
    const result = await w.__test.runSql("SELECT 1 as val", "CREATE TABLE t(a);");
    expect(result.ok).toBe(true);
    expect(result.cols).toEqual(["val"]);
  });
});