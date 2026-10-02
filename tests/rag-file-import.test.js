/**
 * rag-file-import.test.js —— 知识库文件导入（RAG 文件知识，v3.7.76）
 * ----------------------------------------------------------------------------
 * 能力：知识库弹窗导入纯文本文件（.txt/.md/.html 等）→ 按段落切块 → 存入
 * rag_files（data-rw 的第五数据源）→ 经 ragSyncIncremental 哈希 diff 进检索索引。
 *
 * 本文件守四件事：
 *   ① 导入→索引链路真通（切块落库 → diff 出 file:* 文档，向量经假通道建立）；
 *   ② 哈希派生 docId 的收益：同名同内容重导入 = 零重嵌零请求（改内容才重嵌）；
 *   ③ 删除文件 → 其全部块随 diff 连文档带向量移除（v3.7.67 双刃剑的兑付面）；
 *   ④ 准入诚实：不支持类型 / 超大小上限一律拒并零入库。
 */
import { describe, it, expect } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

const PREFIX = "wb_agent_";
const AI_CFG = { enabled: true, base: "http://127.0.0.1:11434/v1", key: "sk-test", model: "qwen", embedModel: "bge-m3" };

function app() {
  return loadApp({
    /* 预置空 tasks 挡 boot 播种（seed() 会把 3 条演示任务混进 diff，见 rag-incremental.test.js） */
    storage: { [PREFIX + "cfg"]: JSON.stringify(AI_CFG), [PREFIX + "tasks"]: "[]" },
  });
}
function stubEmbeds(win) {
  const calls = { count: 0, texts: [] };
  win.fetch = async (url, opts) => {
    if (!/\/embeddings$/.test(String(url))) throw new TypeError("test: only /embeddings is stubbed");
    calls.count++;
    const body = JSON.parse((opts && opts.body) || "{}");
    const inputs = Array.isArray(body.input) ? body.input : [body.input];
    calls.texts.push(...inputs);
    return { ok: true, status: 200, json: async () => ({ data: inputs.map((t, i) => ({ index: i, embedding: [t.length % 2, 1], object: "embedding" })) }) };
  };
  return calls;
}
const fileDocIds = (win) => win.getRagDocs().filter((d) => String(d.docId).startsWith("file:")).map((d) => d.docId).sort();

describe("导入 → 索引链路", () => {
  it("txt 多段文本切块落库，同步后以 file:* 文档进检索索引", async () => {
    const win = app();
    stubEmbeds(win);
    /* 三段各约 600 字：任意两段合计 >1000 → 各自成块（聚合阈值 1000 的确定性切法） */
    const para = (tag) => tag + Array.from({ length: 60 }, (_, i) => "这是" + tag + "的第" + i + "句展开内容。").join("");
    const r = await win.ragImportText("周会纪要.txt", para("甲") + "\n\n" + para("乙") + "\n\n" + para("丙"));
    expect(r, "导入应成功").toBeTruthy();
    expect(r.added).toBe(3);                       /* 三段合计都超 1000 → 各自成块 */
    const r2 = await win.ragSyncIncremental();
    expect(r2.added).toBe(3);
    expect(fileDocIds(win)).toHaveLength(3);
    const sources = [...new Set(win.getRagDocs().filter((d) => d.docId.startsWith("file:")).map((d) => d.source))];
    expect(sources).toEqual(["file:周会纪要.txt"]);
  });

  it("短段聚合：三段合为一块（≤1000），docId 内容派生", async () => {
    const win = app();
    stubEmbeds(win);
    await win.ragImportText("短.txt", "甲段。\n\n乙段。\n\n丙段。");
    expect(win.getRagFiles().length).toBe(1);
    expect(win.getRagFiles()[0].chunks.length).toBe(1);   /* 三短段聚合为一块 */
    const r = await win.ragSyncIncremental();
    expect(r.added).toBe(1);
    expect(fileDocIds(win)).toHaveLength(1);
    const doc = win.getRagDocs().find((d) => d.docId.startsWith("file:"));
    expect(doc.source).toBe("file:短.txt");
    expect(doc.content).toContain("甲段");
    expect(doc.content).toContain("丙段");
  });

  it("html 导入剥 script/style/标签，取正文文本", async () => {
    const win = app();
    stubEmbeds(win);
    const r = await win.ragImportText("page.html", "<html><head><style>.x{color:red}</style><script>alert(1)</script></head><body><h1>部署清单</h1><p>先备份再升级</p></body></html>");
    expect(r).toBeTruthy();
    const chunkText = win.getRagFiles()[0].chunks.map((c) => c.text).join("\n");
    expect(chunkText).toContain("部署清单");
    expect(chunkText).toContain("先备份再升级");
    expect(chunkText).not.toMatch(/<h1>|<p>|script|color:red/);
  });

  it("单段超长按句读硬切：~3000 字无空行段落产出多块且每块 ≤1600", async () => {
    const win = app();
    stubEmbeds(win);
    const longPara = Array.from({ length: 200 }, (_, i) => "这是第" + i + "句话，用于撑长度。").join("");
    expect(longPara.length, "前提：确实超过 1600 硬切阈值").toBeGreaterThan(1600);
    const r = await win.ragImportText("long.txt", longPara);
    const chunks = win.getRagFiles()[0].chunks;
    expect(chunks.length, "超长段落必须切成多块").toBeGreaterThan(1);
    for (const c of chunks) expect(c.text.length).toBeLessThanOrEqual(1600);
    expect(r.added).toBe(chunks.length);
  });
});

describe("哈希派生 docId 的收益（v3.7.67 diff 体系的兑付面）", () => {
  it("同名同内容重导入：docId 不变 → 第二轮 diff 零变更零请求", async () => {
    const win = app();
    stubEmbeds(win);
    const text = "条款一：凭据零落盘。\n\n条款二：索引随 diff 收敛。";
    await win.ragImportText("守则.txt", text);
    await win.ragSyncIncremental();
    const ids1 = fileDocIds(win);
    const calls = stubEmbeds(win);                  /* 从现在起计请求 */
    await win.ragImportText("守则.txt", text);      /* 同名同内容重导入（fid 会换，docId 不换） */
    const r2 = await win.ragSyncIncremental();
    expect(r2).toEqual({ added: 0, updated: 0, removed: 0 });
    expect(fileDocIds(win)).toEqual(ids1);
    expect(calls.count, "内容未变不得重嵌").toBe(0);
  });

  it("同名改内容 → 旧块移除、新块入库（按名替换语义）", async () => {
    const win = app();
    stubEmbeds(win);
    await win.ragImportText("old.txt", "内容甲的正文。");
    await win.ragSyncIncremental();
    await win.ragImportText("old.txt", "内容乙的正文，已修订。");   /* 同名替换 */
    const r = await win.ragSyncIncremental();
    expect(r.removed).toBe(1);
    expect(r.added).toBe(1);
    const doc = win.getRagDocs().find((d) => d.docId.startsWith("file:"));
    expect(doc.content).toContain("内容乙");
  });

  it("删除文件 → 其全部块连文档带出 diff，索引随之清空", async () => {
    const win = app();
    stubEmbeds(win);
    /* 两段各约 600 字 → 各自成块（短段会被聚合成 1 块，见上文聚合用例） */
    const para = (tag) => tag + Array.from({ length: 60 }, (_, i) => "这是" + tag + "的第" + i + "句展开内容。").join("");
    await win.ragImportText("待删.txt", para("甲") + "\n\n" + para("乙"));
    await win.ragSyncIncremental();
    const before = fileDocIds(win);
    expect(before).toHaveLength(2);
    win.ragDeleteFile(win.getRagFiles()[0].id);
    const r = await win.ragSyncIncremental();
    expect(r.removed).toBe(2);
    expect(fileDocIds(win)).toEqual([]);
  });
});

describe("准入诚实（拒的绝不入库）", () => {
  it("不支持类型（pdf）返回 null：零落库、零入库、零外发", async () => {
    const win = app();
    const calls = stubEmbeds(win);
    const r = await win.ragImportText("report.pdf", "二进制假装文本");
    expect(r).toBeNull();
    expect(win.getRagFiles()).toEqual([]);
    expect(fileDocIds(win)).toEqual([]);
    expect(calls.count).toBe(0);
  });

  it("超大小上限（>256K 字符）拒绝", async () => {
    const win = app();
    stubEmbeds(win);
    const big = new Array(256 * 1024 + 1).fill("字").join("");
    const r = await win.ragImportText("big.txt", big);
    expect(r).toBeNull();
    expect(win.getRagFiles()).toEqual([]);
  });

  it("ragReindex 回归：文件块计入全量重建", async () => {
    const win = app();
    stubEmbeds(win);
    await win.ragImportText("reg.txt", "重建回归块甲。\n\n重建回归块乙。");
    const count = await win.ragReindex();
    expect(count, "文件块应计入 ragReindex 全量计数").toBeGreaterThanOrEqual(1);
    expect(fileDocIds(win)).toHaveLength(win.getRagFiles()[0].chunks.length);
  });
});
