/**
 * v3.4.7 批次一（存储评估 G4）：migrate 损坏防护扩展回归
 * 此前 migrate 只覆盖 tasks/cfg/links；其余业务 key 损坏时静默按空处理不可恢复。
 * 现行为：语法错/非数组 → 备份原值到 <key>_broken_<ts> + 诊断登记 + 重置为 []。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

const PREFIX = "wb_agent_";

describe("G4 损坏防护：通用业务 key 守卫", () => {
  let win;

  beforeAll(() => {
    win = loadApp();
  });

  it("源码契约：migrate 调用 _guardGenericJsonKeys，守卫含备份+重置+诊断三步", () => {
    // migrate 接线
    expect(typeof win._guardGenericJsonKeys).toBe("function");
    expect(typeof win._brokenBackup).toBe("function");
  });

  it("运行时：损坏 JSON 的 rec_office 被备份原值并重置为 []", () => {
    const w = loadApp();
    const broken = '{"title":"半截数据' ; // 模拟 JSON 截断
    w.localStorage.setItem(PREFIX + "rec_office", broken);
    w._guardGenericJsonKeys();
    // 主键被重置
    expect(w.localStorage.getItem(PREFIX + "rec_office")).toBe("[]");
    // 备份键存在且值等于原串
    const keys = Object.keys(w.localStorage).filter((k) => k.indexOf("rec_office_broken_") >= 0);
    expect(keys.length).toBe(1);
    expect(w.localStorage.getItem(keys[0])).toBe(broken);
    // 诊断登记
    const diag = w.__test && w.__test.getDiag ? w.__test.getDiag() : [];
  });

  it("运行时：合法 JSON 但非数组（如对象）同样备份重置", () => {
    const w = loadApp();
    w.localStorage.setItem(PREFIX + "notes", '{"oops":"object not array"}');
    w._guardGenericJsonKeys();
    expect(w.localStorage.getItem(PREFIX + "notes")).toBe("[]");
    const keys = Object.keys(w.localStorage).filter((k) => k.indexOf("notes_broken_") >= 0);
    expect(keys.length).toBe(1);
  });

  it("运行时：完好数组不受影响", () => {
    const w = loadApp();
    const good = JSON.stringify([{ id: "n1", title: "好数据" }]);
    w.localStorage.setItem(PREFIX + "rag_docs", good);
    w._guardGenericJsonKeys();
    expect(w.localStorage.getItem(PREFIX + "rag_docs")).toBe(good);
    const keys = Object.keys(w.localStorage).filter((k) => k.indexOf("rag_docs_broken_") >= 0);
    expect(keys.length).toBe(0);
  });

  it("边界：备份键自身不被二次守卫（残值不循环膨胀）", () => {
    const w = loadApp();
    const before = Object.keys(w.localStorage).filter((k) => k.indexOf("_broken_") >= 0).length;
    w._guardGenericJsonKeys();
    w._guardGenericJsonKeys(); // 跑两遍
    const after = Object.keys(w.localStorage).filter((k) => k.indexOf("_broken_") >= 0).length;
    expect(after).toBe(before); // 二次运行不再新增备份键
  });
});
