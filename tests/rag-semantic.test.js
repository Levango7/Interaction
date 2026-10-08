/**
 * rag-semantic.test.js —— 知识库检索：词法 BM25 + 向量召回，RRF 混合
 * ----------------------------------------------------------------------------
 * 背景：这一版之前的"知识库"检索有两处名不副实（都实测过）：
 *   ① 声明用 SQLite FTS5/BM25，但仓库自带的 assets/sql/sql-wasm.wasm（SQLite 3.45.2）
 *      编译时没开 FTS5 —— `CREATE VIRTUAL TABLE … USING fts5(…)` 直接
 *      "no such module: fts5"，于是 ragInit 恒失败、词法召回恒为空；
 *   ② 即使换成开了 FTS5 的构建也救不了中文：unicode61 把连续汉字当成一个 token，
 *      「修复登录页 500 报错」这条记录，MATCH '登录' 召不回、MATCH '修复登录页' 才召得回。
 * 现在词法一路改成自带分词（汉字二元组 + 拉丁按词）+ BM25，向量一路走 provider 的
 * /embeddings。本文件守的是这两条能力**以及它们各自的降级**，必须证明语义召回
 * 不是靠词法蒙对的，也要证明词法召回不依赖 embedding 通道是否可用。
 *
 * 手法：把 embedding 换成一个"概念词表"假通道（登录/login/认证 → 同一个维度），
 * 于是中英文之间、字面不重合的问与答可以算出高余弦；再用"关掉 embedding 通道"
 * 作对照组。
 */
import { describe, it, expect, beforeEach } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

const PREFIX = "wb_agent_";
const VOCAB = ["auth", "bug", "groceries", "meeting"];
const TERM2CONCEPT = {
  "登录": "auth", "认证": "auth", "鉴权": "auth", "login": "auth", "auth": "auth", "sso": "auth",
  "报错": "bug", "修复": "bug", "缺陷": "bug", "bug": "bug", "error": "bug", "500": "bug",
  "牛奶": "groceries", "采买": "groceries", "清单": "groceries", "购物": "groceries",
  "会议": "meeting", "评审": "meeting", "纪要": "meeting",
};

/** 假 embedding：命中哪些概念就是几，再归一化 —— 与真实模型同构（单位球面上的稀疏向量） */
function fakeEmbed(text) {
  const s = String(text).toLowerCase();
  const v = VOCAB.map(() => 0);
  for (const [term, concept] of Object.entries(TERM2CONCEPT)) {
    if (s.includes(term.toLowerCase())) v[VOCAB.indexOf(concept)] = 1;
  }
  const n = Math.sqrt(v.reduce((a, x) => a + x * x, 0));
  return n ? v.map((x) => +(x / n).toFixed(6)) : v;
}

/**
 * 装一个假的 /embeddings 端点，返回形状可按 OpenAI / Ollama 切换。
 * fail=true 时模拟"provider 没有这个端点"（404）—— 检索必须退化成纯词法而不是报错。
 */
function stubEmbeddings(win, { shape = "openai", fail = false } = {}) {
  win.fetch = async (url, opts) => {
    if (!/\/embeddings$/.test(String(url))) throw new TypeError("test: only /embeddings is stubbed");
    if (fail) return { ok: false, status: 404, json: async () => ({ error: "no such endpoint" }) };
    const body = JSON.parse((opts && opts.body) || "{}");
    const inputs = Array.isArray(body.input) ? body.input : [body.input];
    const vecs = inputs.map(fakeEmbed);
    let payload;
    if (shape === "openai") payload = { data: vecs.map((embedding, index) => ({ index, embedding, object: "embedding" })) };
    else if (shape === "ollamaBatch") payload = { embeddings: vecs };
    else payload = { embedding: vecs[0] };
    return { ok: true, status: 200, json: async () => payload };
  };
}

function appWithAi() {
  const win = loadApp({
    storage: { [PREFIX + "cfg"]: JSON.stringify({ enabled: true, base: "http://127.0.0.1:11434/v1", key: "sk-test", model: "qwen", embedModel: "bge-m3" }) },
  });
  return win;
}

describe("假通道自身可信（否则后面的断言都没意义）", () => {
  it("中英文同概念落到同一维度", () => {
    expect(fakeEmbed("login failure")).toEqual(fakeEmbed("登录"));
    expect(fakeEmbed("修复登录页 500 报错")[0]).toBeGreaterThan(0);
    expect(fakeEmbed("周末采买清单")[0]).toBe(0);
  });
});

describe("ragTokenize：汉字要切开（这正是 FTS5+unicode61 做不到的）", () => {
  it("连续汉字产出二元组，拉丁与数字按词", () => {
    const win = appWithAi();
    const toks = win.ragTokenize("修复登录页 500 报错 loginFailed");
    expect(toks).toContain("登录");      // ← 旧实现整段成一个 token，这一条就过不了
    expect(toks).toContain("报错");
    expect(toks).toContain("500");
    expect(toks).toContain("loginfailed");
    expect(toks).toContain("修复");
  });

  it("单字查询也有产出（否则「猫」这类一字问题永远召不回）", () => {
    const win = appWithAi();
    expect(win.ragTokenize("猫")).toEqual(["猫"]);
    expect(win.ragTokenize("")).toEqual([]);
  });
});

describe("ragCosine 向量代数", () => {
  it("同向 1 / 正交 0 / 维度不符或零向量 0", () => {
    const win = appWithAi();
    const c = win.ragCosine;
    expect(c(Float32Array.from([1, 0]), Float32Array.from([1, 0]))).toBeCloseTo(1, 6);
    expect(c(Float32Array.from([1, 0]), Float32Array.from([0, 1]))).toBeCloseTo(0, 6);
    expect(c(Float32Array.from([1, 0, 2]), Float32Array.from([1, 0]))).toBe(0);
    expect(c(Float32Array.from([0, 0]), Float32Array.from([0, 0]))).toBe(0);
    expect(c(null, Float32Array.from([1]))).toBe(0);
  });
});

describe("aiEmbedTexts 通道形状与失败处理", () => {
  it("OpenAI / Ollama 两种批量形状都能解析", async () => {
    for (const shape of ["openai", "ollamaBatch"]) {
      const win = appWithAi();
      stubEmbeddings(win, { shape });
      const out = await win.aiEmbedTexts(["登录报错", "采买清单"]);
      expect(out, shape + " 形状应解析成功").toHaveLength(2);
      expect(out[0]).toBeInstanceOf(win.Float32Array);
      out[0].forEach((x, i) => expect(x).toBeCloseTo(fakeEmbed("登录报错")[i], 5));
    }
  });

  it("HTTP 非 2xx 返回 null（不抛），让调用方降级", async () => {
    const win = appWithAi();
    stubEmbeddings(win, { fail: true });
    expect(await win.aiEmbedTexts(["随便"])).toBe(null);
  });

  it("未配置 AI 时返回 null，且不发请求", async () => {
    const win = loadApp();
    let called = 0;
    win.fetch = async () => { called++; return { ok: true, status: 200, json: async () => ({}) }; };
    expect(await win.aiEmbedTexts(["随便"])).toBe(null);
    expect(called, "没有可用 base 时不该发出 embedding 请求").toBe(0);
  });
});

describe("词法召回：不配 embedding 也必须能用（中文分词是这里的关键）", () => {
  let win;
  beforeEach(async () => {
    win = appWithAi();
    stubEmbeddings(win, { fail: true });   // 通道关掉：下面所有命中都只能来自词法
    await win.ragIndexAdd("doc-auth", "修复登录页 500 报错", "工作记录");
    await win.ragIndexAdd("doc-shop", "周末采买清单：牛奶", "工作记录");
  });

  it("查询「登录」召回到写着「修复登录页」的条目", async () => {
    const hits = await win.ragSearch("登录", 5);
    const top = hits.find((h) => h.docId === "doc-auth");
    expect(top, "词法召回失效（分词没切开 / 索引没跟着写入更新）").toBeTruthy();
    expect(top.via, "没配 embedding 通道时只能是词法").toBe("lex");
    expect(top.score).toBeGreaterThan(0);
  });

  it("数字与中英混排都算命中：查询「500 报错」排第一", async () => {
    const hits = await win.ragSearch("500 报错", 5);
    expect(hits[0].docId).toBe("doc-auth");
    expect(hits.map((h) => h.docId)).not.toContain("doc-shop");
  });

  it("更新文档后索引立即反映新内容（倒排缓存必须作废重建）", async () => {
    await win.ragIndexAdd("doc-auth", "重构了支付网关的对账任务", "工作记录");
    const hits = await win.ragSearch("登录", 5);
    expect(hits.some((h) => h.docId === "doc-auth"), "旧内容还留在索引里 = 更新没生效").toBe(false);
    expect((await win.ragSearch("支付网关", 5))[0].docId).toBe("doc-auth");
  });
});

describe("语义召回：字面不重合也能命中（本轮新增的能力）", () => {
  let win;
  beforeEach(async () => {
    win = appWithAi();
    stubEmbeddings(win);
    await win.ragIndexAdd("doc-auth", "修复登录页 500 报错", "工作记录");
    await win.ragIndexAdd("doc-shop", "周末采买清单：牛奶", "工作记录");
  });

  it("英文查询召回中文条目，且标明来自向量", async () => {
    const hits = await win.ragSearch("login bug", 5);
    expect(hits.length, "应至少召回一条").toBeGreaterThan(0);
    expect(hits[0].docId).toBe("doc-auth");
    expect(String(hits[0].via), "via 应体现向量参与（vec 或 both）").toMatch(/vec|both/);
    expect(hits[0].score).toBeGreaterThan(0);
  });

  it("对照组：embedding 通道不可用时，同一条英文查询召不回（证明不是词法蒙对）", async () => {
    const win2 = appWithAi();
    stubEmbeddings(win2, { fail: true });
    await win2.ragIndexAdd("doc-auth", "修复登录页 500 报错", "工作记录");
    await win2.ragIndexAdd("doc-shop", "周末采买清单：牛奶", "工作记录");
    const hits = await win2.ragSearch("login bug", 5);
    expect(hits.some((h) => h.docId === "doc-auth"), "embedding 不可用时不该靠字面匹配命中").toBe(false);
  });

  it("语义相近但用词不同的第二条也能排对序", async () => {
    await win.ragIndexAdd("doc-meet", "需求评审会议纪要", "工作记录");
    const hits = await win.ragSearch("auth error", 5);
    expect(hits[0].docId).toBe("doc-auth");
    expect(hits.map((h) => h.docId), "不相关的采买条目不应排在前").not.toContain("doc-meet");
  });

  it("两路都命中的条目排在单路命中之前（RRF 融合确实在起作用）", async () => {
    await win.ragIndexAdd("doc-meet", "需求评审会议纪要", "工作记录");
    // 「认证」在向量路上与 doc-auth 同概念，同时字面也出现在 doc-auth 的改写条目里
    const hits = await win.ragSearch("认证 报错", 5);
    const top = hits[0];
    expect(top.docId).toBe("doc-auth");
    expect(top.via, "词法+向量都该命中").toBe("both");
    const onlyOne = hits.find((h) => h.via !== "both");
    if (onlyOne) expect(top.score).toBeGreaterThan(onlyOne.score);
  });

  it("删除文档后向量同步清掉，不会再被召回", async () => {
    await win.ragIndexRemove("doc-auth");
    const hits = await win.ragSearch("login bug", 5);
    expect(hits.some((h) => h.docId === "doc-auth"), "已删文档仍被召回 = 向量没跟着删").toBe(false);
  });
});

describe("向量落盘格式带模型号（换 embedModel 不能静默失灵）", () => {
  /* 动机：换了向量模型后，旧向量的维度/语义空间都不同，ragCosine 只会一律返回 0 ——
     症状是"明明配了 embedModel，语义召回却不命中"，而且全程没有任何报错。
     jsdom 没有 IndexedDB，所以这里直接把 IDB 三个原语换成内存桩来观察真实读写形状。 */
  const MODEL = "bge-m3";

  function appWithIdbStub(records) {
    const win = appWithAi();
    const written = {};
    win.idbKeys = async () => Object.keys(records);
    win.idbReadKey = async (k) => records[k];
    win.idbMirrorKey = async (k, v) => { written[k] = v; };
    win.idbDeleteKey = async (k) => { delete records[k]; };
    /* v3.7.101：ragVecLoadAll 现在先用 idbOpen() 探「IDB 是否真的可用」（不可用则本次不缓存、下次重读）。
       本用例是内存桩、无真实 IndexedDB → 必须一并 stub，否则探针恒为 null、向量通道被跳过。 */
    win.idbOpen = async () => ({ __stub: true });
    win.__written = written;
    return win;
  }

  it("ragVecPut 写的是 {m: 模型, v: 向量}，不是裸向量", async () => {
    const win = appWithIdbStub({});
    stubEmbeddings(win);
    await win.ragIndexAdd("doc-auth", "修复登录页 500 报错", "工作记录");
    const rec = win.__written["ragvec:doc-auth"];
    expect(rec, "向量没写到 ragvec: 键下").toBeTruthy();
    expect(rec.m, "没记录模型号 → 换模型后无从判断哪些向量已失效").toBe(MODEL);
    expect(Array.from(rec.v)).toEqual(expect.arrayContaining([expect.any(Number)]));
  });

  it("载入时丢掉别的模型产出的向量（并因此不再冒充语义命中）", async () => {
    const vec = Float32Array.from(fakeEmbed("修复登录页 500 报错"));
    const win = appWithIdbStub({
      "ragvec:doc-auth": { m: "some-other-embedding", v: vec },
    });
    stubEmbeddings(win);
    const hits = await win.ragSearch("login bug", 5);
    expect(hits.some(h => h.docId === "doc-auth" && /vec|both/.test(String(h.via))),
      "旧模型的向量仍被当成语义命中 = 模型号过滤没生效").toBe(false);
  });

  it("同模型的向量正常载入并命中", async () => {
    const vec = Float32Array.from(fakeEmbed("修复登录页 500 报错"));
    const win = appWithIdbStub({ "ragvec:doc-auth": { m: MODEL, v: vec } });
    stubEmbeddings(win);
    const hits = await win.ragSearch("login bug", 5);
    expect(hits[0]).toMatchObject({ docId: "doc-auth" });
    expect(String(hits[0].via)).toMatch(/vec|both/);
  });

  it("旧格式（裸向量、无模型号）一律重算，不猜它来自哪个模型", async () => {
    const win = appWithIdbStub({ "ragvec:doc-auth": Float32Array.from(fakeEmbed("修复登录页 500 报错")) });
    stubEmbeddings(win);
    const hits = await win.ragSearch("login bug", 5);
    expect(hits.some(h => /vec|both/.test(String(h.via))), "无模型号的旧向量仍被使用").toBe(false);
  });
});

describe("降级路径保持原行为", () => {
  it("ragInjectContext 显式关闭 rag（cfg.rag===false）时不注入", async () => {
    /* v3.7.71 语义反转：RAG 默认开（旧「!==true」判定在开关 UI 缺失下等效永久关闭）。
       「关闭」现在需要显式 cfg.rag=false —— 本用例守的就是这个降级路径。 */
    const win = loadApp({ storage: { [PREFIX + "cfg"]: JSON.stringify({ enabled: true, base: "http://127.0.0.1:11434/v1", key: "k", model: "m", rag: false }) } });
    stubEmbeddings(win);
    await win.ragIndexAdd("d1", "修复登录页 500 报错", "s");
    expect(await win.ragInjectContext("login bug")).toBe("");
  });

  it("空查询直接返回空数组，不发 embedding 请求", async () => {
    const win = appWithAi();
    let called = 0;
    win.fetch = async () => { called++; return { ok: true, status: 200, json: async () => ({ data: [] }) }; };
    expect(await win.ragSearch("   ")).toEqual([]);
    expect(called).toBe(0);
  });

  it("索引为空时返回空数组（不抛）", async () => {
    const win = appWithAi();
    stubEmbeddings(win);
    expect(await win.ragSearch("随便查点什么", 5)).toEqual([]);
  });
});
