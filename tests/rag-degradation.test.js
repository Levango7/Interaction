/**
 * rag-degradation.test.js —— 语义召回降级**必须可见**（v3.7.115，迭代计划该批验收）
 * ----------------------------------------------------------------------------
 * 背景：这条链路上「不可用」从来不是错误，而是**静默降级**——
 *   embedding 通道 404/401/403 → 10 分钟失败缓存 + 纯词法（v3.7.71）；
 *   IndexedDB 读不到 → 空 Map + 纯词法（v3.7.101 起不钉死、可重试）；
 *   cfg.rag=false → 不注入。
 * 用户看到的现象统一是「AI 好像找不到我写过的东西」，但此前**没有任何入口能告诉
 * 他是哪一种降级、该修哪里**。v3.7.115 加了诊断行（buildDiagReport 的「语义召回」），
 * 本文件守两件事：
 *   ① semanticRecallStatus() 读的是**既有降级标志**（与 ragVectorSearch / aiEmbedTexts
 *      同源），不是另造一套状态 —— 所以用例全部走真实代码路径去触发降级，再断言状态；
 *   ② 诊断报告里那一行真的出现了（且文案与状态对应），排障表指向它。
 */
import { describe, it, expect } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

const PREFIX = "wb_agent_";

/** 与 rag-semantic.test.js 同款假通道：概念词表 → 同维度向量（真实模型的结构同构） */
function stubEmbeddings(win, { fail = false } = {}) {
  win.fetch = async (url) => {
    if (!/\/embeddings$/.test(String(url))) throw new TypeError("test: only /embeddings is stubbed");
    if (fail) return { ok: false, status: 404, json: async () => ({ error: "no such endpoint" }) };
    return { ok: true, status: 200, json: async () => ({ data: [{ index: 0, embedding: [1, 0, 0, 0] }] }) };
  };
}
/** jsdom 没有 IndexedDB —— 把三个原语 + idbOpen 换成内存桩（rag-semantic 同款手法） */
function stubIdb(win) {
  const records = {};
  win.idbKeys = async () => Object.keys(records);
  win.idbReadKey = async (k) => records[k];
  win.idbMirrorKey = async (k, v) => { records[k] = v; };
  win.idbDeleteKey = async (k) => { delete records[k]; };
  win.idbOpen = async () => ({ __stub: true });
}
const withAi = (extra) => loadApp({
  storage: Object.assign({
    [PREFIX + "cfg"]: JSON.stringify({ enabled: true, base: "http://127.0.0.1:11434/v1", key: "sk-test", model: "qwen", embedModel: "bge-m3" })
  }, extra || {})
});

describe("semanticRecallStatus：读既有降级标志（不另造状态）", () => {
  it("未配置 AI：unconfigured，且不发任何请求", async () => {
    const win = loadApp();
    let called = 0;
    win.fetch = async () => { called++; return { ok: true, status: 200, json: async () => ({}) }; };
    const st = win.semanticRecallStatus();
    expect(st.mode).toBe("unconfigured");
    expect(called, "状态查询不得发探测请求").toBe(0);
  });

  it("cfg.rag=false：off（用户主动关，不是降级）", () => {
    const win = withAi({ [PREFIX + "cfg"]: JSON.stringify({ enabled: true, base: "http://x/v1", key: "k", model: "m", embedModel: "e", rag: false }) });
    expect(win.semanticRecallStatus().mode).toBe("off");
  });

  it("通道 404 后走一次检索：channel（与 aiEmbedTexts 的失败缓存同一标志）", async () => {
    const win = withAi();
    stubEmbeddings(win, { fail: true });
    stubIdb(win);
    await win.ragIndexAdd("d1", "修复登录页 500 报错", "工作记录");
    await win.ragSearch("登录", 5);          // 真实路径：embedding 404 → 失败缓存
    const st = win.semanticRecallStatus();
    expect(st.mode, "通道不可用必须报 channel，而不是假装 vector").toBe("channel");
    expect(st.probed).toBe(true);
  });

  it("通道可用 + IDB 可用：vector（走完全链路后）", async () => {
    const win = withAi();
    stubEmbeddings(win);
    stubIdb(win);
    await win.ragIndexAdd("d1", "修复登录页 500 报错", "工作记录");
    await win.ragSearch("登录", 5);          // 真实路径：写向量 + 读回
    const st = win.semanticRecallStatus();
    expect(st.mode).toBe("vector");
    expect(st.probed).toBe(true);
  });

  it("IDB 探不到（idbOpen → null）：idb（v3.7.101 起不再钉死，但状态要如实说）", async () => {
    const win = withAi();
    stubEmbeddings(win);
    win.idbOpen = async () => null;          // 模拟 IDB 不可用（jsdom 默认也没有）
    await win.ragIndexAdd("d1", "任意内容", "工作记录");
    await win.ragSearch("任意", 5);           // 真实路径：ragVecLoadAll 读到空且 loaded=false
    const st = win.semanticRecallStatus();
    expect(st.mode, "IDB 不可用必须报 idb").toBe("idb");
  });

  /* v3.7.130（R-26）：上面那条只验了「状态如实」，**没验检索结果**——缺口正在这里。
     raInit 的有界回填是「发起即走、未 await」，于是 IDB 未就绪时：回填还在飞、cache 还空，
     ragVectorSearch 的 `!cache.size` 直接 return []，这次检索白丢（CI 上 rag-hybrid:132 /
     workflow:91 首跑红、同 commit 重跑绿就是它）。下面这条把它钉住。 */
  it("v3.7.130（R-26）：IDB 不可用时检索必须**等有界回填**，而不是抢跑返回空", async () => {
    const win = withAi();
    stubEmbeddings(win);
    win.idbOpen = async () => null;                 // IDB 不可用（jsdom 默认也没有）
    /* skipEmbed：只入库不建向量 —— 于是「cache 空、文档在 localStorage」，
       与刷新后「IDB 未就绪 + 回填在飞」同形（回填的文档来源是 getRagDocs()，不依赖 IDB）。 */
    await win.ragIndexAdd("d-auth", "修复登录页 500 报错", "工作记录", { skipEmbed: true });
    const hits = await win.ragSearch("登录", 5);
    expect(hits.length, "回填完成后必须能召回（原实现抢跑 → 结果为空）").toBeGreaterThan(0);
    expect(hits[0].via, "必须走到向量路径，而不是只靠词法兜底").toMatch(/vec|both/);
  });

  it("本页没走过一次向量加载：unknown 且 probed=false（不谎报可用，也不画成降级）", () => {
    const win = withAi();
    const st = win.semanticRecallStatus();
    expect(st.mode).toBe("unknown");
    expect(st.probed).toBe(false);
  });
});

describe("诊断报告：语义召回行", () => {
  it("通道不可用时报告里出现「词法降级 — embedding 通道不可用」", async () => {
    const win = withAi();
    stubEmbeddings(win, { fail: true });
    stubIdb(win);
    await win.ragIndexAdd("d1", "内容", "工作记录");
    await win.ragSearch("内容", 5);
    const report = win.buildDiagReport();
    const line = report.split("\n").find((l) => l.indexOf("语义召回: ") === 0);
    expect(line, "诊断报告必须有语义召回行").toBeTruthy();
    expect(line).toContain("词法降级");
    expect(line).toContain("embedding 通道不可用");
  });

  it("向量可用时报告写「向量检索可用」", async () => {
    const win = withAi();
    stubEmbeddings(win);
    stubIdb(win);
    await win.ragIndexAdd("d1", "内容", "工作记录");
    await win.ragSearch("内容", 5);
    const line = win.buildDiagReport().split("\n").find((l) => l.indexOf("语义召回: ") === 0);
    expect(line).toContain("向量检索可用");
  });
});
