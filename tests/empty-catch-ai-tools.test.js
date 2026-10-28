/**
 * empty-catch-ai-tools.test.js —— B8-a 第二片（`src/ai-tools.js` 的 11 处 P0，本片消解 6 处）
 * ----------------------------------------------------------------------------
 * 这片守的不是"有没有日志"，而是**每条静默会不会让用户得出相反结论**。逐条核对后分两堆：
 *
 *   消解（6，补处方 (a) 的具名诊断，**控制流一字未改**）：
 *     ① `addTokensUsage` 写不进 `ai_tokens` ⇒ 统计页"今日/累计"偏低，把"没记上"呈现成"没花"；
 *     ② `ragReindex` 丢弃 `{done,left}` ⇒ "正文全入库、向量一条没补"被 `return count` 呈现成"重建完成"；
 *     ③ `ragSyncIncremental` 大批量回填整趟抛错 ⇒ 留痕（但**不**按 `left` 报，见下面的假阳性对照组）；
 *     ④ `ragVecDelete` 的 IDB 删除失败 ⇒ 孤儿向量下次重载会复活成幽灵命中（台账 R-40）；
 *     ⑤ `ragVectorSearch` 等待回填时吞掉的 rejection ⇒ 留痕，但**吞仍是吞**（不得改成抛）；
 *     ⑥ `chatOnceAgent` 汇总失败 ⇒ 兜底 summary 照交付，但"这次小结是拼的不是模型写的"必须可查。
 *   保留（5，写明理由，不硬凑消解数）：
 *     `:926` 记忆孤儿向量清扫（载入侧有 `live` 过滤，核对后"不影响召回"**成立**）；
 *     `:1648` / `:1788` 工具结果非 JSON → 如实记 step 失败、原文回喂（前批已按判据④ 评估过）；
 *     `:3377` 图表 spec 解析失败 → 回退文本（界面看得见差异，不是相反结论）；
 *     `:680` `notifications/initialized` 某些实现直接报错 —— 每次连接刷一条 warn 会淹掉真信号。
 *
 * 🔴 两条"反假阳性"对照组和正向用例同等重要：
 *     - `ragSyncIncremental` 的 cap 是 `min(64, changed)`，**没补完是设计如此** ⇒ `left>0` 不许叫；
 *     - `ragReindex` 在**没配 embedding 通道**时 left 必然 >0 ⇒ 那是用户的选择，不是故障，也不许叫。
 *     少了这两条，"加了诊断"就等于"把常态刷成红色"。
 *
 * ⚠️ 射程说明（诚实起见写在这里，别把下面几条读成"全仓都有单测罩着"）：
 *     ④ 靠把 `win.idbDeleteKey` 换成 reject 来触发（jsdom 本身没有 indexedDB，
 *     `tests/empty-catch-slice9.test.js:169` 记过同一条限制）；真实 IDB 里的失败形态要真浏览器才算验过。
 *     ⑤ 的等待条件本身也是判据：首版让通道**立即** reject，回填在同一微任务批次就 settle，
 *     `_ragEnsuring` 已清成 null ⇒ 分支没进、用例对着空集合断言，变异（把吞掉改成抛）**照样全绿**。
 *     现在让通道延迟 80ms 才失败，分支确定性进入 —— 这条假绿是 M7 变异抓出来的，不是想出来的。
 *
 * 运行：npm run test:local -- tests/empty-catch-ai-tools.test.js
 */
import { beforeEach, describe, expect, it } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

const PREFIX = "wb_agent_";
/** 一份"能用的 embedding 通道"配置：base 合法 + embedModel 有值 ⇒ `_embedCfg()` 非 null */
const CFG = { enabled: true, base: "http://127.0.0.1:11434/v1", key: "sk-test", model: "qwen", embedModel: "bge-m3" };

let win, diagCalls;

async function boot(cfg) {
  win = loadApp({ storage: cfg ? { [PREFIX + "cfg"]: JSON.stringify(cfg) } : {} });
  await new Promise((r) => setTimeout(r, 60));
  diagCalls = [];
  const origDiag = win.pushDiag;
  win.pushDiag = function (level, msg, ctx) {
    diagCalls.push({ level, msg: String(msg), ctx });
    return origDiag && origDiag.apply(win, arguments);
  };
  return win;
}

function hasDiag(re) { return diagCalls.find((c) => re.test(c.msg)); }

beforeEach(() => { win = null; });

describe("① addTokensUsage：记不上账必须留痕，且不阻断 AI 调用", () => {
  it("ai_tokens 读不出来 → 留痕点名 addTokensUsage，调用本身不抛", async () => {
    await boot(CFG);
    const origGet = win.Storage.prototype.getItem;
    win.Storage.prototype.getItem = function (k) {
      if (String(k).includes("ai_tokens")) throw new win.DOMException("SecurityError", "SecurityError");
      return origGet.call(this, k);
    };
    expect(() => win.addTokensUsage({ usage: { total_tokens: 123 } }), "消解不得把静默改成抛错").not.toThrow();
    const hit = hasDiag(/token usage not recorded/i);
    expect(hit, "用量没记上 ≠ 没用过，统计页会把它读成后者").toBeTruthy();
    expect(hit.ctx && hit.ctx.where).toBe("_addTokenUsage");   // where 名沿用 WorkBuddy 已推的 slice17 契约
    expect(hit.level).toBe("warn");
  });

  it("对照组：通道正常 → 一条诊断都不许有，且账目真的加上了", async () => {
    await boot(CFG);
    win.addTokensUsage({ usage: { total_tokens: 50 } });
    const raw = JSON.parse(win.localStorage.getItem(PREFIX + "ai_tokens"));
    expect(raw.total).toBe(50);
    expect(diagCalls.filter((c) => /token usage/i.test(c.msg))).toEqual([]);
  });
});

describe("② ragReindex：全量重建的 left 是信号（cap=Infinity，不存在「故意没补完」）", () => {
  it("通道在、一条没补上 → 留痕点名 done/left，返回值仍是正文条数（控制流不变）", async () => {
    await boot(CFG);
    await win.saveRagDocs([
      { docId: "d1", source: "笔记", content: "修复登录页 500 报错", ts: Date.now() },
      { docId: "d2", source: "笔记", content: "周末采买清单：牛奶", ts: Date.now() },
      { docId: "d3", source: "笔记", content: "评审纪要", ts: Date.now() },
    ]);
    win.aiEmbedTexts = async () => null;          // 通道"不可用"契约：返回 null，不抛
    const n = await win.ragReindex();
    expect(typeof n).toBe("number");
    const hit = hasDiag(/reindex vectors short/i);
    expect(hit, "重建报完成但语义召回其实没覆盖 ⇒ 必须可查").toBeTruthy();
    // 诊断里必须出现 done/left 两个数，且 left>0（应用启动时已自动索引过若干条，故不断言具体条数）
    const m = hit.msg.match(/done=(\d+) left=(\d+)/);
    expect(m, "留痕必须带上「补了多少 / 还差多少」，否则查不出影响面").toBeTruthy();
    expect(Number(m[1])).toBe(0);
    expect(Number(m[2])).toBeGreaterThan(0);
    expect(hit.ctx && hit.ctx.where).toBe("ragReindex");
  });

  it("假阳性对照组：**没配** embedding 通道 → 一条 warn 都不许有（那是用户的选择，不是故障）", async () => {
    await boot({ enabled: true, model: "qwen" });   // 无 base ⇒ _embedCfg() 返回 null
    await win.saveRagDocs([
      { docId: "d1", source: "笔记", content: "甲", ts: Date.now() },
      { docId: "d2", source: "笔记", content: "乙", ts: Date.now() },
    ]);
    await win.ragReindex();
    expect(diagCalls.filter((c) => /reindex vectors short/i.test(c.msg)), "没配通道就每次重建刷红").toEqual([]);
  });
});

describe("③ ragSyncIncremental：整趟挂了要留痕，按设计没补完不许叫", () => {
  /** 造 >RAG_SYNC_EMBED_CAP(48) 条"变更"，且已索引集合为空 ⇒ bigBatch 分支成立 */
  function forceBigBatch(count) {
    win.ragInit = async () => {};
    win.ragIndexAdd = async () => true;
    win._ragCurrentDocs = () => Array.from({ length: count }, (_, i) => ({
      docId: "d" + i, content: "内容" + i, source: "测试",
    }));
  }

  it("回填整趟抛错 → 留痕点名 ragSyncIncremental，且同步照常返回 added", async () => {
    await boot(CFG);
    forceBigBatch(49);
    win.ragEnsureVectors = async () => { throw new Error("backfill dead"); };
    const r = await win.ragSyncIncremental();
    expect(r.added, "消解不得把「吞掉」改成「中断同步」").toBe(49);
    const hit = hasDiag(/rag batch backfill failed/i);
    expect(hit).toBeTruthy();
    expect(hit.msg).toMatch(/backfill dead/);
    expect(hit.ctx && hit.ctx.where).toBe("ragIndexSync/bigBatch");   // 同上：沿用对方已推的命名
  });

  it("假阳性对照组：cap 内没补完（done=10 / left=39 是常态）→ 一条 warn 都不许有", async () => {
    await boot(CFG);
    forceBigBatch(49);
    win.ragEnsureVectors = async () => ({ done: 10, left: 39 });
    const r = await win.ragSyncIncremental();
    expect(r.added).toBe(49);
    expect(diagCalls.filter((c) => /backfill failed/i.test(c.msg))).toEqual([]);
  });
});

describe("④ ragVecDelete：IDB 删除失败 ⇒ 孤儿向量必须留痕（台账 R-40 的前半）", () => {
  it("idbDeleteKey 抛错 → 留痕点名 orphaned 与 docId，正文照旧删掉（控制流不变）", async () => {
    await boot(CFG);
    await win.ragIndexAdd("d-ghost", "已删除但仍会被召回的正文", "笔记");
    expect(win.getRagDocs().some((d) => d.docId === "d-ghost")).toBe(true);
    win.idbDeleteKey = async () => { throw new Error("IDB AbortError"); };
    await win.ragIndexRemove("d-ghost");
    expect(win.getRagDocs().some((d) => d.docId === "d-ghost"), "只补可观测性：删除本身照旧").toBe(false);
    const hit = hasDiag(/rag vector orphaned/i);
    expect(hit, "删不掉的向量下次重载会复活成空正文幽灵命中").toBeTruthy();
    expect(hit.ctx && hit.ctx.where).toBe("ragVecDelete");
    expect(hit.ctx && hit.ctx.docId).toBe("d-ghost");
  });

  it("对照组：正常删除 → 没有 orphaned 诊断", async () => {
    await boot(CFG);
    await win.ragIndexAdd("d-ok", "正常删除的文档", "笔记");
    await win.ragIndexRemove("d-ok");
    expect(diagCalls.filter((c) => /orphaned/i.test(c.msg))).toEqual([]);
  });
});

describe("⑥ chatOnceAgent：汇总降级可以，但「这次小结不是模型写的」必须可查", () => {
  it("第二次 chatOnce reject → 结果仍 ok、兜底 summary 照交付，且留痕 degraded", async () => {
    await boot(CFG);
    const plan = { goal: "整理本周", steps: [{ tool: "note_add", args: { title: "周记", content: "x" }, desc: "写一条周记" }] };
    let calls = 0;
    win.chatOnce = async () => {
      calls++;
      if (calls === 1) return { choices: [{ message: { role: "assistant", content: "```json\n" + JSON.stringify(plan) + "\n```" } }] };
      throw new Error("summarize down");
    };
    // 执行阶段与本片无关（slice10 已守），打桩只为了让汇总分支确定性地跑到
    win.executeAgentPlanReactive = async () => ({
      summary: "1. 写一条周记 → ok", results: [{ step: { desc: "写一条周记" }, result: "ok" }], ms: 5,
    });
    const r = await win.chatOnceAgent([{ role: "user", content: "整理本周" }], {});
    expect(r.ok, "降级不得改成失败").toBe(true);
    expect(r.summary).toBe("1. 写一条周记 → ok");
    const hit = hasDiag(/summary degraded/i);
    expect(hit).toBeTruthy();
    expect(hit.ctx && hit.ctx.where).toBe("chatOnceAgent");
  });
});

describe("⑤ ragVectorSearch：等回填时吞掉的 rejection 要留痕，但不许改成抛", () => {
  /**
   * 触发条件必须是"检索进来时 `_ragEnsuring` 还活着"：
   * 首版这里写成 `aiEmbedTexts` **立刻** reject，回填在同一个微任务批次里就 settle 了，
   * `_ragEnsuring` 已被 `.finally` 清成 null ⇒ 那条分支根本没进，用例对着空集合断言"没抛"——
   * 变异（把 handler 改成 re-throw）实测**照样全绿**，就是这个空转暴露出来的。
   * 现在让通道延迟 80ms 才失败：回填确定性地"仍在飞"，检索才会走进 race 并接住那条 rejection。
   */
  it("回填在飞且随后 reject → 检索照常返回空数组（不抛），且留痕点名 in-flight backfill aborted", async () => {
    await boot(CFG);
    await win.saveRagDocs([{ docId: "d1", source: "笔记", content: "修复登录页 500 报错", ts: Date.now() }]);
    win.aiEmbedTexts = async () => {
      await new Promise((r) => setTimeout(r, 80));
      throw new Error("embed dead");
    };
    const p = win.ragEnsureVectors(Infinity);          // 发射后不管，制造"回填在飞"
    const hits = await win.ragVectorSearch("登录", 5);
    await p.catch(() => {});
    expect(Array.isArray(hits), "语义召回不可用时照常降级，留痕不得把吞掉改成抛").toBe(true);
    expect(hits.length).toBe(0);
    const hit = hasDiag(/in-flight backfill aborted/i);
    expect(hit, "这条 rejection 一丢，用户侧症状只是「没命中」，与「没配通道」同形").toBeTruthy();
    expect(hit.msg).toMatch(/embed dead/);
    expect(hit.ctx && hit.ctx.where).toBe("ragVectorSearch");
  });
});
