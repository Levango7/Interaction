/**
 * sm2-auto-enqueue.test.js —— 解耦 S0 的行为等价性测试
 * ----------------------------------------------------------------------------
 * S0 把「错题自动入 SM-2 复习」的实现从 core 的 SCENE_FEATURE_BIND.study.exercise.onSave
 * 搬到了 Data 层（data-rw），通过 AppBridge 注册。核心层只保留钩子调用。
 *
 * 这个测试要证明两件事：
 *   ① **行为完全不变**：正确率 < 70 且有题干 → 写入 study 复习队列；否则不写
 *      （字段、状态文案、id 前缀、下次复习日期与搬迁前一致）
 *   ② **通道正确**：实现由 Data 层在加载时注册到 AppBridge；未注册时钩子是安全空操作、不抛错
 *
 * 为什么必须有它：这次改动**没有现成测试覆盖**（此前那批测试没碰过这条路径），
 * 而"搬实现"最容易出的错就是漏字段 / 改判断条件 —— 断言要具体到字段值，不能只看条数。
 */
import { describe, it, expect } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

const tomorrowStr = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
};

describe("解耦 S0 · 错题自动入 SM-2（行为等价 + 桥接注册）", () => {
  it("加载后由 Data 层注册了实现（core 里只留接口）", () => {
    const win = loadApp();
    expect(win.__test.AppBridge, "AppBridge 应存在").toBeTruthy();
    expect(typeof win.__test.AppBridge.onExerciseSave, "Data 层应已注册实现").toBe("function");
    /* 核心层不得持有实现细节：core 里的钩子只负责转发 */
    expect(typeof win.__test.AppBridge.render, "render 接口应先声明为安全空操作").toBe("function");
  });

  it("正确率 < 70 且有题干 → 写入 study 复习队列（字段逐个核对）", () => {
    const win = loadApp();
    const before = win.__test.getRec("study").length;
    win.__test.SCENE_FEATURE_BIND.study.exercise.onSave({
      id: "ex1", subject: "数学", question: "1+1=?", correct: 50, explain: "应为 2"
    });
    const list = win.__test.getRec("study");
    expect(list.length).toBe(before + 1);
    const rec = list[0];
    expect(rec.id.startsWith("sm2_")).toBe(true);
    expect(rec.id).toContain("ex1");
    expect(rec.title).toContain("错题复习：");
    expect(rec.title).toContain("数学");
    expect(rec.title).toContain("1+1=?");
    expect(rec.status).toBe("未复习");
    expect(rec.nextReview).toBe(tomorrowStr());
    expect(rec.note).toContain("来源练习题（正确率 50%）：");
    expect(rec.note).toContain("应为 2");
    expect(typeof rec.created).toBe("number");
  });

  it("正确率 >= 70 → 不入队", () => {
    const win = loadApp();
    const before = win.__test.getRec("study").length;
    win.__test.SCENE_FEATURE_BIND.study.exercise.onSave({ id: "ex2", question: "2+2=?", correct: 70 });
    expect(win.__test.getRec("study").length).toBe(before);
  });

  it("无题干 → 不入队（即使正确率很低）", () => {
    const win = loadApp();
    const before = win.__test.getRec("study").length;
    win.__test.SCENE_FEATURE_BIND.study.exercise.onSave({ id: "ex3", correct: 10 });
    expect(win.__test.getRec("study").length).toBe(before);
  });

  it("无 explain/answer 时 note 正常生成（不出现 undefined）", () => {
    const win = loadApp();
    win.__test.SCENE_FEATURE_BIND.study.exercise.onSave({ id: "ex4", question: "只填题干", correct: 30 });
    const rec = win.__test.getRec("study")[0];
    expect(rec.note).not.toContain("undefined");
  });

  it("未注册实现时，钩子是安全空操作（不抛错）—— 加载顺序不会变成隐性依赖", () => {
    const win = loadApp();
    const saved = win.__test.AppBridge.onExerciseSave;
    win.__test.AppBridge.onExerciseSave = null;
    expect(() => win.__test.SCENE_FEATURE_BIND.study.exercise.onSave({ id: "ex5", question: "x", correct: 1 })).not.toThrow();
    win.__test.AppBridge.onExerciseSave = saved;
  });
});
