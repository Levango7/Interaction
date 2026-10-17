/**
 * ai-observability.test.js —— 上下文预算三件套之「可观测」（v3.7.132）
 * ----------------------------------------------------------------------------
 * 背景（docs/evaluation-product-2026-10-16.md §五/八）：估算（_estTokens）与策略
 * （trimChatHist 裁剪 / ragInjectContext 装配预算 / v3.7.118 滚动摘要）早已存在，
 * **usage 也自 v3.5.0 就在落盘**（ai_tokens 键，90 天留存）—— 但三件事全都"算了/存了却看不见"：
 *   ① 发送前不展示估算（发了多少条、估多少 token、预算多少，用户无从知道）；
 *   ② ai_tokens 全仓没有第二个读者（写完就躺在 localStorage 里）。
 * 本文件守三件事：
 *   ① recordSendEstimate 的估算口径（字符串 / 多模态数组 / 预算钳制）；
 *   ② aiTokensUsage 的读取（今日 / 累计 / 天数，键格式与 addTokensUsage 一致）；
 *   ③ 诊断报告真的有「AI 用量」「上次发送」两行 —— 这是用户的唯一查看入口，删了就是退回黑盒。
 */
import { describe, it, expect } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

const PREFIX = "wb_agent_";
const tick = (ms = 80) => new Promise((r) => setTimeout(r, ms));

/** 与 addTokensUsage 同一格式的日期键（本地时区） */
function todayKey(d = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
}

describe("发送估算 recordSendEstimate / lastSendEstimate", () => {
  it("① 估算口径：字符串按 _estTokens 累加，多模态数组取 text 段", () => {
    const win = loadApp();
    expect(typeof win.recordSendEstimate, "记录点必须挂在 window 上（ai-retry 调它）").toBe("function");
    const msgs = [
      { role: "system", content: "一二三四五六七八九十" },                       // 10 个中文字 → 10
      { role: "user", content: "abcdefgh" },                                    // 8 字符英文 → 2
      { role: "user", content: [{ type: "text", text: "一二三四五六" }] },       // 6
    ];
    const est = win.recordSendEstimate(msgs);
    expect(est.n).toBe(3);
    expect(est.tokens, "10 + 2 + 6 = 18（粗算口径，与 _estTokens 同源）").toBe(18);
    expect(est.budget, "默认预算 1200").toBe(1200);
  });

  it("② 预算随 cfg.ctxBudgetTokens 走（并按 200..4000 钳制）", () => {
    const win = loadApp({ storage: { [PREFIX + "cfg"]: JSON.stringify({ ctxBudgetTokens: 2000 }) } });
    expect(win.recordSendEstimate([{ role: "user", content: "hi" }]).budget).toBe(2000);
    const win2 = loadApp({ storage: { [PREFIX + "cfg"]: JSON.stringify({ ctxBudgetTokens: 99999 }) } });
    expect(win2.recordSendEstimate([{ role: "user", content: "hi" }]).budget, "上限 4000").toBe(4000);
  });

  it("③ 后一次调用覆盖前一次（lastSendEstimate 只反映最近一轮）", async () => {
    const win = loadApp();
    win.recordSendEstimate([{ role: "user", content: "一二三四五六七八九十" }]);
    await tick();
    win.recordSendEstimate([{ role: "user", content: "a" }]);
    await tick();
    expect(win.lastSendEstimate().n).toBe(1);
    expect(win.lastSendEstimate().tokens).toBe(1);
  });
});

describe("AI 用量 aiTokensUsage（ai_tokens 键的第一个消费者）", () => {
  it("④ 今日 / 累计 / 天数按 addTokensUsage 的落盘格式读取", () => {
    const win = loadApp({ storage: {
      [PREFIX + "ai_tokens"]: JSON.stringify({ total: 123, days: { [todayKey()]: 45, "2026-10-01": 78 } }),
    } });
    const u = win.aiTokensUsage();
    expect(u.today).toBe(45);
    expect(u.total).toBe(123);
    expect(u.days).toBe(2);
  });

  it("⑤ 键不存在 / 坏 JSON：归零不抛错（统计绝不能把对话打断）", () => {
    const w1 = loadApp();
    expect(w1.aiTokensUsage()).toEqual({ today: 0, total: 0, days: 0 });
    const w2 = loadApp({ storage: { [PREFIX + "ai_tokens"]: "{not-json" } });
    expect(w2.aiTokensUsage()).toEqual({ today: 0, total: 0, days: 0 });
  });
});

describe("诊断报告：可观测的两个展示行", () => {
  it("⑥ 报告里有「AI 用量」与「上次发送」两行，且未发送时如实说", () => {
    const win = loadApp();
    expect(typeof win.buildDiagReport, "buildDiagReport 必须可从 window 取（ui-backup-stats 顶层函数）").toBe("function");
    const rep = win.buildDiagReport();
    expect(rep).toMatch(/AI 用量: /);
    expect(rep).toMatch(/暂无记录|今日 \d+/);
    expect(rep).toMatch(/上次发送: 本页尚未发送过对话/);
  });

  it("⑦ 发送估算入账后，报告展示条数 / 估算 / 预算", () => {
    const win = loadApp();
    win.recordSendEstimate([{ role: "user", content: "一二三四五六七八九十" }]);
    const rep = win.buildDiagReport();
    expect(rep).toMatch(/上次发送: 1 条 \/ 估算 ~10 tokens（预算 1200）/);
  });
});
