/**
 * 记忆语义召回 + 上下文装配预算（v3.7.59 · 任务 #19 / #20）· 用例验证
 * ----------------------------------------------------------------------------
 * #19：recallMemories 原来是纯词法（按空白切词 + substring）。中文没有空格，整句是一个 token，
 *      「关键词命中 +2」这一档对中文永远不生效 —— 它不是召不回，而是**全量返回、排序失效**，
 *      于是注入上下文的 6 个名额归谁只由插入顺序决定，用户后沉淀的偏好永远挤不进去。
 *      现在接 v3.7.57 建好的 embedding 通道做混合召回（RRF 融合），用例按这个真实退化来构造。
 * #20：每轮注入的上下文原先三段各自为政（记忆/目标、技能、检索），检索固定 top5×200 字，
 *      既无总量约束也无出处。现在统一走 cfg.ctxBudgetTokens 预算，并给每条带
 *      [序号·来源·召回方式] 的引用标签。
 *
 * 测试替身（都是"外部服务/浏览器能力"，不是被测逻辑）：
 *   - fetch → /embeddings：返回**按概念词典**构造的向量。这不是在假装自己是语义模型，
 *     而是把"两个没有任何共同字面的说法落在同一维"这一前提显式写死，
 *     从而能单独验证召回链路真的用上了向量（词法路径在同样的数据下必然召不回）。
 *   - idbKeys/idbReadKey/idbMirrorKey/idbDeleteKey → 内存 Map（jsdom 没有 IndexedDB）。
 *
 * 运行：npx vitest run tests/ai-memory-context.test.js
 */
import { describe, it, expect } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

const PREFIX = "wb_agent_";

/** 概念词典：命中哪个词组就点亮哪一维。两条文本只要属同一概念就同维 → 余弦相似 */
const CONCEPTS = [
  ["简洁", "短一点", "简短", "精炼", "别啰嗦"],   // dim0：说话风格
  ["周报", "本周总结", "汇报"],                  // dim1：周度汇报
  ["加班", "晚点走", "通宵"],                    // dim2：工时
];
const DIM = CONCEPTS.length;

function fakeEmbedding(text){
  const v = new Array(DIM).fill(0);
  let hit = false;
  CONCEPTS.forEach((words, i) => {
    if(words.some(w => String(text).includes(w))){ v[i] = 1; hit = true; }
  });
  if(!hit) v[DIM - 1] = 1;   // 无概念命中也给个方向，避免零向量被 ragCosine 直接判 0
  return v;
}

/** 装好 AI profile + /embeddings 的 mock；返回 {win, calls} */
async function bootOurs({ rag = true, agent, budget, extraEmbedCalls } = {}) {
  const win = loadApp();
  win.localStorage.clear();
  await new Promise((r) => setTimeout(r, 60));
  win.__test._resetCrypto();
  const cfg = {
    enabled: true,
    profiles: [{ id: "p1", name: "T", base: "https://api.test.com/v1", key: "sk-t", model: "m", embedModel: "bge-m3" }],
    activeId: "p1",
    rag,
  };
  if(agent !== undefined) cfg.agent = agent;
  if(budget) cfg.ctxBudgetTokens = budget;
  win.localStorage.setItem(PREFIX + "cfg", JSON.stringify(cfg));

  // IDB 替身
  const store = new Map();
  win.idbKeys = async () => [...store.keys()];
  win.idbReadKey = async (k) => store.get(k);
  win.idbMirrorKey = async (k, v) => { store.set(k, v); return true; };
  win.idbDeleteKey = async (k) => { store.delete(k); return true; };
  /* v3.7.101：ragVecLoadAll 现在先用 idbOpen() 探「IDB 是否真的可用」（不可用则本次不缓存、下次重读）。
     本用例是内存替身、无真实 IndexedDB → 必须一并 stub，否则探针恒为 null、向量通道被跳过。 */
  win.idbOpen = async () => ({ __stub: true });
  win.__idbStore = store;

  const embedCalls = [];
  const realFetch = win.fetch;
  win.fetch = async (url, init) => {
    const u = String(url);
    if(u.indexOf("/embeddings") >= 0){
      embedCalls.push(u);
      const body = JSON.parse(init.body);
      const inputs = Array.isArray(body.input) ? body.input : [body.input];
      return {
        ok: true, status: 200,
        headers: { get: () => "application/json" },
        json: async () => ({ data: inputs.map((t, i) => ({ index: i, embedding: fakeEmbedding(t) })) }),
      };
    }
    if(extraEmbedCalls) return extraEmbedCalls(u, init);
    return realFetch ? realFetch(url, init) : { ok: false, status: 404, json: async () => ({}) };
  };
  win.__embedCalls = embedCalls;
  return win;
}

/** 把记忆直接写进存储（addMemory 会走 uid，测试需要固定 id 时用这个） */
function seedMemories(win, list){
  win.localStorage.setItem(PREFIX + "memory", JSON.stringify(list));
}

/* =========================================================================
 * #19 记忆语义召回
 * ========================================================================= */
describe("#19 工作记忆 · 语义召回", () => {
  /* 实测修正（写这组用例时才发现）：旧的词法召回不是"召不回"，而是**全量返回、排序失效** ——
     recallMemoriesLex 不按分数设阈值过滤，所有同场景记忆都会回来，只是排序里
     「关键词命中 +2」对中文永远不生效（整句是一个 token，substring 对不上）。
     于是真正受损的是**名额分配**：注入上下文的只有前 6 条（agentContextPrompt 传 limit=6），
     谁进这 6 条完全由插入顺序决定，用户后来沉淀的偏好永远挤不进去。
     所以下面的用例都按"多条竞争 6 个名额"来构造，这才贴近真实退化。 */
  const FILLERS = [
    "周三下午两点开产品评审", "把报销单交给财务", "预约牙科诊所复查",
    "给妈妈买生日蛋糕", "续费和讯会议会员", "整理Q3目标拆解表",
    "把键盘寄修取回来", "更新家里的wifi密码", "订下周四去上海的高铁",
  ];
  const DAY = 86400000;
  /**
   * 时间戳必须给**确定性**的间隔：旧写法在模块加载时算一次 Date.now()，
   * 而词法打分里的近期加权是按天衰减（3 - 天龄×0.05），填秒级间隔时各条只差 1e-7，
   * 排序实际由"测试跑到第几秒"决定 —— 同一份代码两个用例里目标条一次排第 1 一次排第 3。
   * 这里按天铺：fillers 依次老 1 天，目标条压到 30 天前 → 词法排序里它必然垫底。
   */
  const targetMem = (id) => ({ id: id || "mt", scope: "global", text: "我喜欢简洁的回复", ts: Date.now() - 30 * DAY, hits: 0 });
  const fillerMems = (n) => Array.from({ length: n || FILLERS.length }, (_, i) => ({
    id: "f" + i, scope: "global", text: FILLERS[i] || "无关联想事项 " + i, ts: Date.now() - (i + 1) * DAY, hits: 0,
  }));

  function seedTen(win){ seedMemories(win, fillerMems().concat([targetMem()])); }

  it("没备好查询向量时，recallMemories 与纯词法逐条同序（改造零风险基线）", async () => {
    const win = await bootOurs();
    seedTen(win);
    const a = win.recallMemories("以后说得短一点", "office", 8).map(m => m.id);
    const b = win.recallMemoriesLex("以后说得短一点", "office", 8).map(m => m.id);
    expect(a).toEqual(b);
    expect(a).toHaveLength(8);
    expect(a, "词法按新近度排 → 30 天前那条偏好连 8 个名额都进不去").not.toContain("mt");
  });

  it("cfg.rag 关着时一个 embedding 请求都不发，行为与改造前一致", async () => {
    const win = await bootOurs({ rag: false });
    seedMemories(win, [targetMem()]);
    expect(await win.memPrimeQueryVector("以后说得短一点")).toBe(false);
    expect(win.__embedCalls.length).toBe(0);
    const hits = win.recallMemories("以后说得短一点", "office", 8);
    expect(hits.map(m => m.id)).toEqual(["mt"]);          // 纯词法：全量返回、无 via 标注
    expect(hits[0]._via, "未走向量路就不该编出召回方式").toBeUndefined();
  });

  it("开了 rag 后，那条偏好从「8 个名额都进不去」被顶到首位", async () => {
    const win = await bootOurs();
    seedTen(win);
    expect(win.recallMemories("以后说得短一点", "office", 8).map(m => m.id)).not.toContain("mt"); // 预备前：捞不到
    expect(await win.memPrimeQueryVector("以后说得短一点")).toBe(true);
    const hits = win.recallMemories("以后说得短一点", "office", 8);
    expect(hits[0].id, "与查询同概念、但没有任何共同字面的那条必须排第一").toBe("mt");
    expect(hits[0]._via, "词法没有关键词命中 → 只有向量这一条路").toBe("vec");
  });

  it("字面和语义都命中时标 both（查询里带分词空格，词法那条对中文几乎永远不触发）", async () => {
    const win = await bootOurs();
    seedMemories(win, fillerMems(3).concat([targetMem()]));
    expect(await win.memPrimeQueryVector("回复 简洁 一点")).toBe(true);
    const hits = win.recallMemories("回复 简洁 一点", "office", 8);
    expect(hits[0].id).toBe("mt");
    expect(hits[0]._via).toBe("both");
  });

  it("记忆多过词法窗口时，只有向量这条路能把它捞出来（词法根本没看到它）", async () => {
    const win = await bootOurs();
    // recallMemories(…, 8) 的词法窗口是 topK*3=24；给 25 条 fillers 把目标挤到窗口之外
    seedMemories(win, fillerMems(25).concat([targetMem()]));
    expect(await win.memPrimeQueryVector("以后说得短一点")).toBe(true);
    expect(win.recallMemoriesLex("以后说得短一点", "office", 24).map(m => m.id)).not.toContain("mt");
    const hits = win.recallMemories("以后说得短一点", "office", 8);
    expect(hits[0].id, "语义命中不该被「最老的无关填充项」用同分挤掉").toBe("mt");
    expect(hits[0]._via).toBe("vec");
  });

  it("语义召回真的改变了系统提示里的 6 个名额归属（这是用户能感知的差别）", async () => {
    const win = await bootOurs();
    seedTen(win);
    const before = win.chatSysPrompt("以后说得短一点");
    expect(before, "预备前：那条偏好挤不进 6 个名额 → 模型看不到用户的偏好")
      .not.toContain("我喜欢简洁的回复");
    await win.memPrimeQueryVector("以后说得短一点");
    const after = win.chatSysPrompt("以后说得短一点");
    expect(after).toContain("我喜欢简洁的回复");
    expect(after).toContain("·语义");
  });

  it("向量落在 IDB 的 memvec: 前缀下，绝不进 localStorage（wb_agent_ 前缀会被同步镜像回写，30KB/条直接爆配额）", async () => {
    const win = await bootOurs();
    seedMemories(win, [{ id: "m1", scope: "global", text: "我喜欢简洁的回复", ts: Date.now(), hits: 0 }]);
    await win.memEnsureVectors();
    const keys = [...win.__idbStore.keys()];
    expect(keys).toEqual(["memvec:m1"]);
    const rec = win.__idbStore.get("memvec:m1");
    expect(String(rec.m)).toBe("bge-m3", "必须带模型戳，否则换模型后静默召不回");
    expect(Array.from(rec.v)).toHaveLength(DIM);
    for(const k of Object.keys(win.localStorage)){
      expect(k.startsWith(PREFIX + "memvec"), "memvec 不得出现在 localStorage：" + k).toBe(false);
    }
  });

  it("换 embedModel 后旧向量按模型戳作废，不会拿错空间的向量硬凑", async () => {
    const win = await bootOurs();
    seedMemories(win, [{ id: "m1", scope: "global", text: "我喜欢简洁的回复", ts: Date.now(), hits: 0 }]);
    await win.memEnsureVectors();
    expect(win.__idbStore.get("memvec:m1").m).toBe("bge-m3");
    // 换 profile 的 embedModel：靠 _memVecCache 自带的 model 字段自动重载，无需任何显式通知
    win.__test._resetCrypto();
    win.localStorage.setItem(PREFIX + "cfg", JSON.stringify({
      enabled: true, rag: true, activeId: "p1",
      profiles: [{ id: "p1", name: "T", base: "https://api.test.com/v1", key: "sk-t", model: "m", embedModel: "other-model" }],
    }));
    const stats = await win.memEnsureVectors();
    expect(stats.done, "旧模型的向量应被判失效并重算").toBeGreaterThan(0);
    expect(win.__idbStore.get("memvec:m1").m).toBe("other-model");
  });

  it("清空记忆后残留的孤儿向量会被清扫，且不会污染召回", async () => {
    const win = await bootOurs();
    seedMemories(win, [
      { id: "g1", scope: "global", text: "第一条", ts: Date.now(), hits: 0 },
      { id: "g2", scope: "global", text: "第二条", ts: Date.now(), hits: 0 },
    ]);
    await win.memEnsureVectors();
    expect([...win.__idbStore.keys()].length).toBe(2);
    seedMemories(win, []);                 // 命令面板「清空工作记忆」就是直接 save 空数组，不经过模块钩子
    await win.memEnsureVectors();
    expect([...win.__idbStore.keys()], "孤儿向量应被清掉").toEqual([]);
  });

  it("forgetMemory 连带删掉它的向量；embedding 通道挂了时静默退回纯词法不抛", async () => {
    const win = await bootOurs();
    seedMemories(win, [{ id: "f1", scope: "global", text: "我喜欢简洁的回复", ts: Date.now(), hits: 0 }]);
    await win.memEnsureVectors();
    expect(win.__idbStore.has("memvec:f1")).toBe(true);
    win.forgetMemory("f1");
    expect(win.__idbStore.has("memvec:f1"), "遗忘记忆要把向量一起带走").toBe(false);

    const win2 = await bootOurs();
    seedMemories(win2, [{ id: "x1", scope: "global", text: "我喜欢简洁的回复", ts: Date.now(), hits: 0 }]);
    win2.fetch = async () => { throw new Error("provider 挂了"); };
    expect(await win2.memPrimeQueryVector("以后说得短一点")).toBe(false);
    expect(() => win2.recallMemories("以后说得短一点", "office", 8)).not.toThrow();
  });

  it("cfg.agent=false 时不做语义预备（记忆段本来就不注入，省一次网络往返）", async () => {
    const win = await bootOurs({ agent: false });
    seedMemories(win, [{ id: "m1", scope: "global", text: "我喜欢简洁的回复", ts: Date.now(), hits: 0 }]);
    expect(await win.memPrimeQueryVector("以后说得短一点")).toBe(false);
    expect(win.__embedCalls.length).toBe(0);
  });
});

/* =========================================================================
 * #20 上下文装配预算 + 可溯源引用
 * ========================================================================= */
describe("#20 上下文装配 · 预算与溯源", () => {
  async function seedDocs(win, n){
    for(let i = 0; i < n; i++){
      await win.ragIndexAdd("d" + i, "登录页问题记录 " + i + "：" + "详细内容".repeat(20), "工作记录");
    }
  }

  it("默认预算下：注入条数受约束，并如实说明还有几条没进来", async () => {
    const win = await bootOurs({ budget: 600 });
    await seedDocs(win, 8);
    const block = await win.ragInjectContext("登录页问题记录");
    expect(block).toContain("【相关上下文】");
    expect(block).toContain("受上下文预算限制");
    const kept = (block.match(/^\d+\. \[/gm) || []).length;
    expect(kept, "预算 600 装不下 8 条长文本").toBeLessThan(8);
    expect(kept).toBeGreaterThan(0);
    expect(block).toMatch(/\[1·工作记录·(词法|语义|词法\+语义)\]/);
  });

  it("预算放宽后能全量注入，且不再出现截断说明", async () => {
    const win = await bootOurs({ budget: 4000 });
    await seedDocs(win, 3);
    const block = await win.ragInjectContext("登录页问题记录");
    expect((block.match(/^\d+\. \[/gm) || []).length).toBe(3);
    expect(block).not.toContain("受上下文预算限制");
  });

  it("提示模型标注引用出处（可溯源），而不是把检索结果当成模型自己的知识", async () => {
    const win = await bootOurs();
    await seedDocs(win, 1);
    const block = await win.ragInjectContext("登录页问题记录");
    expect(block).toContain("引用时请标注来源编号");
    expect(block).toContain("说明是推断");
  });

  it("预算口径：乱填/0/负数都回默认 1200，正数钳制到 200~4000", async () => {
    const win = await bootOurs();
    const set = (v) => {
      const c = JSON.parse(win.localStorage.getItem(PREFIX + "cfg"));
      if(v === null) delete c.ctxBudgetTokens; else c.ctxBudgetTokens = v;
      win.__test._resetCrypto();
      win.localStorage.setItem(PREFIX + "cfg", JSON.stringify(c));
      return win.ctxBudgetTokens();
    };
    // 0 / 负数 / 非数字 = "等于没配"，回默认值（而不是悄悄变成一个极小的预算把上下文掐没）
    expect(set(null)).toBe(1200);
    expect(set("abc")).toBe(1200);
    expect(set(0)).toBe(1200);
    expect(set(-5)).toBe(1200);
    expect(set(999999)).toBe(4000);
    expect(set(50)).toBe(200);   // 真填了一个正数但太小 → 钳到下限，不是回默认
    expect(set(800)).toBe(800);
  });

  it("技能段也受预算约束（技能很多时不会把每轮固定成本推到几千 token）", async () => {
    const win = await bootOurs();
    const many = [];
    for(let i = 0; i < 20; i++){
      many.push({ name: "流程" + i, desc: "说明" + i, prompt: "做一件很长的事".repeat(20), enabled: true });
    }
    win.__test.saveAiConfig("skills", { custom: JSON.stringify(many) });
    const block = win.skillsPromptBlock("流程3");
    const shown = (block.match(/^- 流程\d/gm) || []).length;
    expect(shown, "20 条不该全量注入").toBeLessThan(20);
    expect(shown).toBeGreaterThanOrEqual(1);
    expect(block).toContain("流程3");   // 命中的那条必须在
  });

  it("rag 关闭时检索段为空串，且不动记忆链路", async () => {
    const win = await bootOurs({ rag: false });
    await seedDocs(win, 3);
    expect(await win.ragInjectContext("登录页问题记录")).toBe("");
  });
});
