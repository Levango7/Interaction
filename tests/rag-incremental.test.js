/**
 * rag-incremental.test.js —— RAG 增量索引（v3.7.67）
 * ----------------------------------------------------------------------------
 * 背景（v3.7.59 在 ui-ge-notes.js 登记的原话）：「笔记改动同样要等『重建索引』才进真 RAG，
 * 任务/记录/对话历史一直如此。」v3.7.67 落地增量：写路径（setTasks/setRec/saveNotes/
 * appendChat）经 core 的 emitDataMutate 广播（低层 emit、高层注册，避免 Data→AI 逆层边），
 * ai-tools 的 ragSyncIncremental 按内容哈希 diff 只落变更文档，手动 ragReindex 保留作全量兜底。
 *
 * 本文件守三件事：
 *   ① 广播链路真实连通：写路径触发 → 防抖 → 自动落库（不是只测同步函数本身）；
 *   ② diff 语义正确：新增/更新/删除各归其位；内容没变就一个字节都不动（含"只改不入索引
 *      的字段（如 status）不得触发重建"的反向断言）；
 *   ③ 降级诚实：未配 embedding 通道时词法维护照常、零外发请求。
 *
 * 对话历史 docId 按数组下标编（chat:sc:i）——slice(-50) 裁剪会整体平移下标，属已知
 * 取舍（防抖 + 单飞已把风暴合并成一轮，哈希 diff 保证只有位移条目重建），此处不测。
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

const PREFIX = "wb_agent_";
const AI_CFG = { enabled: true, base: "http://127.0.0.1:11434/v1", key: "sk-test", model: "qwen", embedModel: "bge-m3" };

function app(extraStorage) {
  return loadApp({
    /* 预置空 tasks 键：data-migrate 的 seed() 只在「无 init 且无 tasks 键」时播种演示任务，
       不挡住它会把 3 条演示任务混进 diff 计数（首跑实测 ragReindex 返回 7 而非 4）。 */
    storage: Object.assign(
      { [PREFIX + "cfg"]: JSON.stringify(AI_CFG), [PREFIX + "tasks"]: "[]" },
      extraStorage || {}
    ),
  });
}

/** 极小 embedding 桩：返回合法 2 维向量并计数（维度任意，ragVecPut 只存不比维度） */
function stubEmbeds(win) {
  const calls = { count: 0, texts: [] };
  win.fetch = async (url, opts) => {
    if (!/\/embeddings$/.test(String(url))) throw new TypeError("test: only /embeddings is stubbed");
    calls.count++;
    const body = JSON.parse((opts && opts.body) || "{}");
    const inputs = Array.isArray(body.input) ? body.input : [body.input];
    calls.texts.push(...inputs);
    return {
      ok: true, status: 200,
      json: async () => ({ data: inputs.map((t, i) => ({ index: i, embedding: [t.length % 2, 1], object: "embedding" })) }),
    };
  };
  return calls;
}

function seedFour(win) {
  win.setTasks([{ id: "t1", title: "修复登录页 500 报错", note: "网关超时重试", tags: ["bug"] }]);
  win.setRec("life", [{ id: "r1", title: "周末采买", note: "牛奶 鸡蛋" }]);
  win.saveNotes([{ id: "n1", title: "SSO 备忘", content: "SAML 登录排查步骤", tags: ["auth"] }]);
  win.appendChat("life", { role: "user", content: "帮我把会议纪要排个摘要" });
}
const ids = (win) => win.getRagDocs().map(d => d.docId).sort();

afterEach(() => { vi.useRealTimers(); });

describe("_ragDocHash 内容指纹", () => {
  it("同串同值、异串异值、尾部空白敏感", () => {
    const win = app();
    expect(win._ragDocHash("abc")).toBe(win._ragDocHash("abc"));
    expect(win._ragDocHash("abc")).not.toBe(win._ragDocHash("abd"));
    expect(win._ragDocHash("修复登录页")).not.toBe(win._ragDocHash("修复登录页 "));
  });
});

describe("ragSyncIncremental diff 语义", () => {
  it("四类来源一次同步全入库（task/rec/note/chat）", async () => {
    const win = app();
    const calls = stubEmbeds(win);
    seedFour(win);
    const r = await win.ragSyncIncremental();
    expect(r.added).toBe(4);
    expect(r.updated).toBe(0);
    expect(r.removed).toBe(0);
    expect(ids(win)).toEqual(["chat:life:0", "note:n1", "rec:life:r1", "task:t1"]);
    // 入库即建向量（≤CAP 时逐条直嵌，不批量）：4 个 changed → 4 次 embedding
    expect(calls.count).toBe(4);
  });

  it("内容更新 → 只重建该条（updated=1），数量不变、新内容可检索", async () => {
    const win = app();
    stubEmbeds(win);
    seedFour(win);
    await win.ragSyncIncremental();
    win.setTasks([{ id: "t1", title: "修复登录页 401 未授权", note: "token 过期", tags: ["bug"] }]);
    const r = await win.ragSyncIncremental();
    expect(r).toEqual({ added: 0, updated: 1, removed: 0 });
    const doc = win.getRagDocs().find(d => d.docId === "task:t1");
    expect(doc.content).toContain("401");
    expect(doc.content).not.toContain("500");
  });

  it("删除 → removed 对应递减，docId 消失（含软删除被构建器过滤）", async () => {
    const win = app();
    stubEmbeds(win);
    seedFour(win);
    await win.ragSyncIncremental();
    // t1 整条移除；t2 带软删除标记 —— 构建器按当前表算：前者消失、后者被 deletedAt 过滤不入库
    win.setTasks([{ id: "t2", title: "新任务", deletedAt: Date.now() }]);
    const r = await win.ragSyncIncremental();
    expect(r.removed).toBe(1);           // task:t1 消失
    expect(r.added).toBe(0);             // t2 被 deletedAt 过滤，不入库
    expect(ids(win)).not.toContain("task:t1");
    expect(ids(win)).not.toContain("task:t2");
  });

  it("内容没变就一个字节都不动：只改不入索引的字段（status）→ 三计数全 0、零 embedding", async () => {
    const win = app();
    seedFour(win);
    await win.ragSyncIncremental();       // 首轮入库（本步 embed 失败无所谓，向量缺失不影响本测）
    const calls = stubEmbeds(win);        // 从现在起计请求
    win.setTasks([{ id: "t1", title: "修复登录页 500 报错", note: "网关超时重试", tags: ["bug"], status: "done" }]);
    const r = await win.ragSyncIncremental();
    expect(r).toEqual({ added: 0, updated: 0, removed: 0 });
    expect(calls.count, "内容未变不得发起任何 embedding 请求").toBe(0);
  });

  it("大批量（>CAP）退回批量回填而非逐条直嵌", async () => {
    const win = app();
    const calls = stubEmbeds(win);
    win.setTasks(Array.from({ length: 60 }, (_, i) => ({ id: "t" + i, title: "任务" + i })));
    const r = await win.ragSyncIncremental();
    expect(r.added).toBe(60);
    // 60 > CAP(48)：changed 走 skipEmbed → ragIndexAdd 零直嵌；ragEnsureVectors 内部按 32 条/请求分批 → 2 次请求吞 60 条
    expect(calls.count).toBe(2);
    expect(calls.texts.length).toBe(60);
  });
});

describe("写路径广播 → 防抖自动同步（不经手动调用）", () => {
  it("setTasks 后 4s 内自动落库；未配 embedding 也照常入库且零外发", async () => {
    // 未配 AI：cfg 不带 base → _embedCfg() 为 null → 全程零网络（同样挡掉 boot 播种）
    const win = loadApp({ storage: { [PREFIX + "tasks"]: "[]" } });
    let netCalls = 0;
    win.fetch = async () => { netCalls++; throw new TypeError("test: 任何外发都算失败"); };
    vi.useFakeTimers();
    win.setTasks([{ id: "t9", title: "防抖链路验证任务" }]);
    expect(ids(win), "防抖窗口内尚未落库").toEqual([]);
    await vi.advanceTimersByTimeAsync(4000);
    expect(ids(win)).toContain("task:t9");
    expect(netCalls, "未配 embedding 通道不得外发").toBe(0);
  });

  it("saveNotes / setRec / appendChat 的广播同样连通", async () => {
    const win = app();
    stubEmbeds(win);
    vi.useFakeTimers();
    win.saveNotes([{ id: "n2", title: "防抖笔记" }]);
    win.setRec("code", [{ id: "r2", title: "防抖记录" }]);
    win.appendChat("code", { role: "assistant", content: "防抖对话" });
    await vi.advanceTimersByTimeAsync(4000);
    expect(ids(win)).toEqual(["chat:code:0", "note:n2", "rec:code:r2"]);
  });
});

describe("单飞与 ragReindex 回归", () => {
  it("同步进行中的并发调用只登记 pending（返回全 0），数据最终收敛", async () => {
    const win = app();
    let release;
    const gate = new Promise(res => { release = res; });
    win.fetch = async (url, opts) => {
      if (!/\/embeddings$/.test(String(url))) throw new TypeError("stub");
      await gate;                        // 第一轮卡住，制造并发窗口
      const body = JSON.parse((opts && opts.body) || "{}");
      const inputs = Array.isArray(body.input) ? body.input : [body.input];
      return { ok: true, status: 200, json: async () => ({ data: inputs.map((t, i) => ({ index: i, embedding: [1, 0], object: "embedding" })) }) };
    };
    seedFour(win);
    const first = win.ragSyncIncremental();
    const second = await win.ragSyncIncremental();   // 进行中 → 只登记 pending
    expect(second).toEqual({ added: 0, updated: 0, removed: 0 });
    release();
    expect(await first).toEqual({ added: 4, updated: 0, removed: 0 });
    expect(ids(win)).toHaveLength(4);
  });

  it("ragReindex 重构后行为不变：全量入库并返回计数", async () => {
    const win = app();
    stubEmbeds(win);
    seedFour(win);
    const count = await win.ragReindex();
    expect(count).toBe(4);
    expect(ids(win)).toEqual(["chat:life:0", "note:n1", "rec:life:r1", "task:t1"]);
  });
});
