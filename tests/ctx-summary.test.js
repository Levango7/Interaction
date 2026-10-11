/**
 * ctx-summary.test.js —— 上下文滚动摘要（v3.7.118，迭代计划最后一批）
 * ----------------------------------------------------------------------------
 * 背景（架构评估点名的第三块天花板）：上下文是「有界全量」——每轮把 ≤50 条/≤6000 token
 * 的整段历史全发，**token 成本随会话轮数线性涨**，长会话首先在这里撞墙（而不是模型能力）。
 *
 * 本批：超过阈值时把最旧的对话段折成一次摘要（**一次额外请求**），摘要拼进 system 提示、
 * 最近 N 条原样发送。三条纪律：
 *   ① 阈值内**零额外请求**（行为与现在完全一致 —— 默认值下短会话无感）；
 *   ② 摘要请求**失败就回退**既有全量路径，不报错、不阻塞（降级路径优先于新功能）；
 *   ③ **不静默改历史**：chats[sc] 原样不动，摘要只是「发送时的投影」，且按**会话**隔离
 *      （存进 session 对象 —— 切会话不串味，删会话随它一起消失）。
 *
 * 手法：win.chatOnce 记账（次数 + 每次的 messages），断言请求体形状而非内部变量。
 */
import { describe, it, expect } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

const PREFIX = "wb_agent_";

/** 往场景聊天里灌 N 条历史（启动前写 storage → 迁移成一个 session） */
function seedHistory(n) {
  const msgs = [];
  for (let i = 0; i < n; i++) {
    msgs.push(i % 2 === 0
      ? { role: "user", content: "问题" + i + " " + "x".repeat(20), createdAt: 1000 + i }
      : { role: "assistant", content: "回答" + i + " " + "y".repeat(20), createdAt: 1000 + i });
  }
  return { [PREFIX + "chat_office"]: JSON.stringify(msgs) };
}
async function boot(storage) {
  const win = loadApp({ storage });
  await new Promise((r) => setTimeout(r, 60));
  win.__test._resetCrypto();
  win.__test.setActive("office");
  return win;
}
/** 记账型 chatOnce：第 1 次=摘要请求（messages 里有"压缩/摘要"字样），第 2 次=主请求 */
function countingOnce(win, { failSummary = false } = {}) {
  const calls = [];
  win.chatOnce = async (messages) => {
    calls.push(messages);
    const isSummary = messages.some((m) => /摘要|压缩/.test(String(m.content || "")));
    if (isSummary && failSummary) throw new Error("summary endpoint down");
    const text = isSummary ? "【摘要】早前讨论了 A/B/C，结论是 X。" : "好的";
    return { choices: [{ message: { role: "assistant", content: text } }] };
  };
  return calls;
}
const submit = (win, text) => win.onChatSubmit({ preventDefault() {}, target: { msg: { value: text } } });

describe("① 阈值内零额外请求（行为不变）", () => {
  it("历史 10 条：只有一次请求，且不带任何摘要段", async () => {
    const win = await boot(seedHistory(10));
    const calls = countingOnce(win);
    await submit(win, " hello ");
    expect(calls.length, "短会话不该有多余的摘要请求").toBe(1);
    const sys = String(calls[0][0].content || "");
    expect(sys).not.toContain("较早对话摘要");
    expect(calls[0].length, "消息数 = system + 10 条历史 + 1 条新输入").toBe(12);
  });
});

describe("② 超阈值：一次摘要请求 + 实际少发 token", () => {
  it("历史 45 条：多一次摘要请求，主请求只剩 system + 最近 N 条", async () => {
    const win = await boot(seedHistory(45));
    const calls = countingOnce(win);
    await submit(win, " hello ");
    expect(calls.length, "超阈值应有两次请求（摘要 + 主）").toBe(2);
    expect(/摘要|压缩/.test(String(calls[0][0].content || "")), "第一次是摘要请求").toBe(true);
    const main = calls[1];
    expect(main[0].content, "摘要拼进 system 提示（不破坏消息交替）").toContain("较早对话摘要");
    expect(main[0].content).toContain("早前讨论了");
    /* 关键断言：主请求的消息数**显著少于** 46（system + 45 历史 + 1 新输入） */
    expect(main.length, "折叠后只剩 system + 最近 N 条 + 新输入").toBeLessThan(30);
    expect(main.length).toBeGreaterThan(3);
    /* 最近的消息仍在（不是只发摘要） */
    expect(String(main[main.length - 1].content)).toContain("hello");
  });
});

describe("③ 摘要失败 → 回退全量，不报错不阻塞", () => {
  it("摘要端点挂掉：主请求照发全量历史，提交不出错", async () => {
    const win = await boot(seedHistory(45));
    const calls = countingOnce(win, { failSummary: true });
    await submit(win, " hello ");
    expect(calls.length, "摘要失败也要有一次主请求").toBe(2);
    const main = calls[1];
    expect(main.length, "回退成既有全量路径（system + 45 + 1）").toBe(47);
    expect(String(main[0].content || "")).not.toContain("较早对话摘要");
    /* 提交本身不抛：聊天里有正常回复 */
    expect(String(win.getChat("office").slice(-1)[0].content)).toBe("好的");
  });
});

describe("④ 不静默改历史 + 按会话隔离", () => {
  it("折叠后本机历史原样保留（摘要只是发送时的投影）", async () => {
    const win = await boot(seedHistory(45));
    countingOnce(win);
    await submit(win, " hello ");
    expect(win.getChat("office").length, "历史不能被摘要悄悄改掉").toBeGreaterThanOrEqual(45);
  });

  it("摘要按会话隔离存储（不复用场景键，删会话随它一起消失）", async () => {
    const win = await boot(seedHistory(45));
    countingOnce(win);
    await submit(win, " hello ");
    /* A 会话（默认迁移出来的那条）有自己的摘要 */
    const sessA = win.getActiveSessionObj();
    expect(sessA.sum && sessA.sum.covered, "A 的摘要存在").toBeTruthy();
    const coveredA = sessA.sum.covered;
    /* 新建会话 B：同一个 office 场景，但**摘要不共用**（存各自对象里，不是 Prefix+chat_sum_office 这种共享键） */
    win.createSession("office");
    const sessB = win.getActiveSessionObj();
    expect(sessB.id).not.toBe(sessA.id);
    expect(sessB.sum, "B 不该带着 A 的摘要开头").toBeFalsy();
    expect(win.ctxSummaryState().covered, "当前激活会话（B）的折叠数从 0 开始").toBe(0);
    /* 删掉 B 不影响 A 的摘要（对象级隔离，无需额外清理键） */
    win.deleteSession(sessB.id);
    const st = win.ctxSummaryState();
    expect(st.covered, "删 B 后 A 的摘要仍在其对象里（按当前激活会话读数）").toBeGreaterThanOrEqual(0);
    win.setActiveSession(sessA.id);
    expect(win.ctxSummaryState().covered).toBe(coveredA);
  });
});
