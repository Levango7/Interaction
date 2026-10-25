/**
 * chat-usage-visibility.test.js —— B4：把 token 用量与预算从「诊断报告纯文本」提到对话面
 * ----------------------------------------------------------------------------
 * 实测起点（2026-10-26 读码核对）：计数链**早就通了** —— addTokensUsage 挂在 ai-loop 的三个真出口，
 * aiTokensUsage() / lastSendEstimate() 也各有读者；但两个读者都在「设置 → 关于 → 诊断与反馈」的
 * 字符串里，正常对话时看不见。本文件守的是"提到对话面"这一层：
 *   ① usageFromResp 的归一与**不编数**（没回 usage 就返回 null，气泡不许显示估算当账单）；
 *   ② 气泡尾行真的渲染实际用量，缺字段时一行都不出；
 *   ③ ctxBudgetPreview 的分级判定（ok / warn / over 的边界就是产品口径，必须钉死）；
 *   ④ 芯片写进 DOM（不是只算不画）；
 *   ⑤ 发送链上的软提醒：只提醒不拦，且同一档位**只说一次**；
 *   ⑥ 设置页保存 → 写回 cfg → 芯片与预算立即一致（"改了没生效"是这类面板最常见的死法）。
 */
import { afterEach, describe, expect, it } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

const PREFIX = "wb_agent_";
const windows = [];
afterEach(() => windows.splice(0).forEach((w) => w.close()));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function boot(storage) {
  const win = loadApp({ storage: Object.assign({ [PREFIX + "onboarded"]: "true" }, storage || {}) });
  windows.push(win);
  win.__test._resetCrypto();
  win.__test.setActive("office");
  win.__test.render();
  return win;
}

describe("① usageFromResp 归一", () => {
  it("三种上游给法都归一成 {in,out,total}", () => {
    const win = boot();
    expect(win.usageFromResp({ usage: { prompt_tokens: 900, completion_tokens: 334, total_tokens: 1234 } }))
      .toEqual({ in: 900, out: 334, total: 1234 });
    expect(win.usageFromResp({ usage: { prompt_tokens: 5, completion_tokens: 7 } }), "只给分项时 total 由分项相加")
      .toEqual({ in: 5, out: 7, total: 12 });
    expect(win.usageFromResp({ usage: { total_tokens: 42 } }), "只给总数时分项记 0，不猜比例")
      .toEqual({ in: 0, out: 0, total: 42 });
  });

  it("没有 usage / 全 0 / 响应本身为空 ⇒ null（不许拿估算冒充实际用量）", () => {
    const win = boot();
    expect(win.usageFromResp({ choices: [] })).toBe(null);
    expect(win.usageFromResp({ usage: { prompt_tokens: 0, completion_tokens: 0 } })).toBe(null);
    expect(win.usageFromResp(null)).toBe(null);
    expect(win.usageFromResp(undefined)).toBe(null);
  });
});

describe("② 气泡尾行的实际用量", () => {
  it("有 _usage 才出现 .msg-usage，且写的是 总 / 入 / 出", () => {
    const win = boot();
    win.__test.appendChat("office", { role: "assistant", content: "答好了", _usage: { in: 900, out: 334, total: 1234 } });
    win.renderChat();
    const el = win.document.querySelector(".msg-usage");
    expect(el, "有真实 usage 时尾行必须出现").toBeTruthy();
    expect(el.textContent).toContain("1234");
    expect(el.textContent).toContain("900");
    expect(el.textContent).toContain("334");
  });

  it("无 _usage / total=0：整行不渲染（不伪造用量）", () => {
    const win = boot();
    win.__test.appendChat("office", { role: "assistant", content: "老消息没有用量" });
    win.__test.appendChat("office", { role: "assistant", content: "上游没回 usage", _usage: null });
    win.renderChat();
    expect(win.document.querySelectorAll(".msg-usage").length).toBe(0);
  });
});

describe("③④ 预算预览与阈值", () => {
  it("分级边界：80% 起 warn，严格大于预算才 over", () => {
    const win = boot({ [PREFIX + "cfg"]: JSON.stringify({ ctxBudgetTokens: 200 }) });
    win.recordSendEstimate([{ role: "user", content: "一二三四五六七八九十" }]);   // 10
    expect(win.ctxBudgetPreview("").level, "10/200=5% 属正常").toBe("ok");
    expect(win.ctxBudgetPreview("一二三四五六七八九十".repeat(15)).level, "10+150=160 恰达 80% ⇒ warn").toBe("warn");
    expect(win.ctxBudgetPreview("一二三四五六七八九十".repeat(19)).level, "10+190=200 等于预算，还没超 ⇒ warn").toBe("warn");
    expect(win.ctxBudgetPreview("一二三四五六七八九十".repeat(20)).level, "210>200 ⇒ over").toBe("over");
    expect(win.ctxBudgetPreview("").pct).toBe(5);
  });

  it("提醒阈值默认 80，可配置并钳在 50~150", () => {
    expect(boot().ctxWarnPct()).toBe(80);
    expect(boot({ [PREFIX + "cfg"]: JSON.stringify({ ctxWarnPct: 10 }) }).ctxWarnPct(), "低于 50 抬到 50").toBe(50);
    expect(boot({ [PREFIX + "cfg"]: JSON.stringify({ ctxWarnPct: 900 }) }).ctxWarnPct(), "高于 150 压到 150").toBe(150);
    const w = boot({ [PREFIX + "cfg"]: JSON.stringify({ ctxBudgetTokens: 200, ctxWarnPct: 150 }) });
    w.recordSendEstimate([{ role: "user", content: "一二三四五六七八九十" }]);
    expect(w.ctxBudgetPreview("一二三四五六七八九十".repeat(15)).level, "阈值 150% 时 160/200 不该报 warn").toBe("ok");
  });
});

describe("⑤ 输入条芯片的接线", () => {
  it("renderCtxBudgetChip 真的写 DOM：文本含 估算/预算，等级写进 class", () => {
    const win = boot({ [PREFIX + "cfg"]: JSON.stringify({ ctxBudgetTokens: 200 }) });
    win.recordSendEstimate([{ role: "user", content: "一二三四五六七八九十" }]);
    const ta = win.document.getElementById("chatTextInput");
    ta.value = "一二三四五六七八九十".repeat(20);
    const p = win.renderCtxBudgetChip();
    const chip = win.document.getElementById("ctxBudgetChip");
    expect(p.level).toBe("over");
    expect(chip.textContent).toContain("210");
    expect(chip.textContent).toContain("200");
    expect(chip.className).toContain("is-over");
    expect(chip.getAttribute("title"), "口径必须写在 tooltip 里").toContain("估算");
    ta.value = "";
    expect(win.renderCtxBudgetChip().level).toBe("ok");
    expect(win.document.getElementById("ctxBudgetChip").className).not.toContain("is-");
  });

  it("没有聊天面板（沉浸页/其它布局）时静默跳过，不抛错", () => {
    const win = boot();
    win.document.getElementById("ctxBudgetChip").remove();
    expect(win.renderCtxBudgetChip()).toBe(null);
  });
});

describe("⑥ 发送链上的软提醒（真接线）", () => {
  it("超预算只提醒一次，同档位重复发送不重复播报；回到正常档后再越档会重新提醒", async () => {
    const win = boot({ [PREFIX + "cfg"]: JSON.stringify({ ctxBudgetTokens: 200 }) });
    win.__test.appendChat("office", { role: "user", content: "一二三四五六七八九十".repeat(25) });
    const hist = win.getChat("office");
    /* runChatLoop 入口会自己 recordSendEstimate(messages)，所以"档位"由传进去的 messages 决定：
       长包 = over，短包 = ok。用它来验证去重与重置，不靠测试侧伪造状态。 */
    const longPack = [{ role: "system", content: "sys" }].concat(hist.map((m) => ({ ...m })));
    const shortPack = [{ role: "system", content: "sys" }, { role: "user", content: "短" }];
    let n = 0;
    win.toast = function(msg, type){ if(type === "warn" && String(msg).indexOf("预算") >= 0) n++; };
    win.chatOnce = async () => ({ choices: [{ message: { role: "assistant", content: "好了" } }], usage: { prompt_tokens: 260, completion_tokens: 5, total_tokens: 265 } });

    await win.__test.runChatLoop(longPack, hist);
    await wait(30);
    expect(n, "第一次越档必须提醒").toBe(1);
    const last = hist[hist.length - 1];
    expect(last._usage, "assistant 记录要带上游真实用量").toEqual({ in: 260, out: 5, total: 265 });
    win.renderChat();
    expect(win.document.querySelector(".msg-usage").textContent).toContain("265");

    await win.__test.runChatLoop(longPack, hist);
    await wait(30);
    expect(n, "同一档位重复发送不该再播一次（噪声会把提醒训练成忽略）").toBe(1);

    await win.__test.runChatLoop(shortPack, hist);
    await wait(30);
    expect(n, "回到正常档不该播报").toBe(1);

    await win.__test.runChatLoop(longPack, hist);
    await wait(30);
    expect(n, "先回正常再越档 ⇒ 重新提醒一次").toBe(2);
  }, 25000);
});

describe("⑧ 接线的消费者：谁在刷芯片", () => {
  it("发送结束后不必手工调用，runChatLoop 尾部的 renderChat 会把新估算画上芯片", async () => {
    /* 这条专门守"接线"本身：ctxBudgetPreview 算得对、renderCtxBudgetChip 画得对，
       都不等于渲染链真的会调它。探针实测（_probe/probe-chip.log）：bindChatPanel 只在启动时
       刷一次，且启动是**延后**跑的 —— 所以断言前必须先让芯片完成初始化并取样，
       否则"启动那次正好发生在发送之后"会让本用例假绿（写第一版时就是这样骗过去的）。 */
    const win = boot({ [PREFIX + "cfg"]: JSON.stringify({ ctxBudgetTokens: 200 }) });
    const chip = win.document.getElementById("ctxBudgetChip");
    for (let i = 0; i < 20 && !chip.textContent; i++) await wait(50);
    expect(chip.textContent, "启动时芯片应已初始化").not.toBe("");
    win.renderCtxBudgetChip();
    const before = chip.textContent;
    win.chatOnce = async () => ({ choices: [{ message: { role: "assistant", content: "好了" } }], usage: { total_tokens: 10 } });
    win.__test.appendChat("office", { role: "user", content: "短问题" });
    const hist = win.getChat("office");
    await win.__test.runChatLoop(
      [{ role: "system", content: "sys" }, { role: "user", content: "一二三四五六七八九十".repeat(18) }], hist);
    await wait(40);
    expect(chip.textContent, "芯片必须随渲染刷新，不能停在发送前的旧值").not.toBe(before);
    expect(chip.textContent, "本轮装配量 1+180=181（预算 200）应体现在芯片上").toContain("181");
    expect(chip.className, "181/200=91% 已到 80% 阈值 ⇒ 应带 is-warn").toContain("is-warn");
  }, 20000);
});

describe("⑦ 设置页保存 → 生效", () => {
  it("填预算与阈值并保存：写回 cfg、芯片立刻反映、重开后回填", async () => {
    const win = boot();
    const cb = win.document.getElementById("aiCtxBudget");
    const cw = win.document.getElementById("aiCtxWarnPct");
    expect(cb, "设置页 AI→记忆 要有预算字段").toBeTruthy();
    cb.value = "3000";
    cw.value = "60";
    win.document.getElementById("aiMemSave").click();
    await wait(40);
    const cfg = JSON.parse(win.localStorage.getItem(PREFIX + "cfg"));
    expect(cfg.ctxBudgetTokens).toBe(3000);
    expect(cfg.ctxWarnPct, "阈值落进 cfg，ctxWarnPct() 才读得到").toBe(60);
    expect(win.ctxBudgetTokens()).toBe(3000);
    expect(win.ctxWarnPct()).toBe(60);
    win.__test.render();
    const chip = win.document.getElementById("ctxBudgetChip");
    expect(chip.textContent).toContain("3000");

    const win2 = boot({ [PREFIX + "cfg"]: JSON.stringify({ ctxBudgetTokens: 3000, ctxWarnPct: 60 }) });
    expect(win2.document.getElementById("aiCtxBudget").value, "打开设置必须回填现值，否则用户以为没存上")
      .toBe("3000");
    expect(win2.document.getElementById("aiCtxWarnPct").value).toBe("60");
  }, 15000);
});
