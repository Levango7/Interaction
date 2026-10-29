/**
 * rag-orphan-vectors.test.js —— B9（台账 R-40 / R-41 的真修）
 * ----------------------------------------------------------------------------
 * R-40 幽灵命中：`ragVecDelete` 先删内存缓存、再删 IDB；后一步失败时只留一条 warn，
 *   IDB 里那条向量就成了孤儿。载入侧此前**只校验 embedModel、不过 live 集合**，
 *   于是已删文档下次重载会复活成「正文为空、分数非零」的命中 —— `_ragDocMeta` 对找不到的
 *   docId 返回 `{source:"",content:""}`，它白占一个 topK 名额，还会把真结果挤下去。
 *   修法：`ragVecLoadAll` 载入时按 `getRagDocs()` 过滤；**但过滤的输入本身会失败**
 *   （文档表读坏时 `getRagDocs()` 也返回 `[]`），此时照滤会把正常向量全丢掉 ⇒ 必须退回不滤。
 *
 * R-41 静默 null：`aiEmbedTexts` 在「HTTP 200 但形状不可识别 / 条数不符」两处 `return null`，
 *   与「根本没配通道」在调用方同形。本批只**留痕**，返回值与降级行为一律不动。
 *
 * ⚠️ 射程（别把下面读成"真 IndexedDB 验过了"）：jsdom 没有 indexedDB，IDB 三个原语
 *   （idbOpen/idbKeys/idbReadKey）在用例里换成内存桩，验的是**载入侧过滤逻辑**；
 *   真实 IDB 的"删除失败"形态需真浏览器（`tests/e2e/rag-hybrid.spec.js` 是现成基座）。
 *
 * 运行：npm run test:local -- tests/rag-orphan-vectors.test.js
 */
import { describe, expect, it } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

const PREFIX = "wb_agent_";
const MODEL = "bge-m3";
const CFG = { enabled: true, base: "http://127.0.0.1:11434/v1", key: "sk-test", model: "qwen", embedModel: MODEL };
/** 查询与向量同向 ⇒ 余弦为 1，任何进到缓存里的向量都会成为命中（这样"少了谁"才是容器的功劳，不是分数的功劳） */
const VEC = [1, 0, 0, 0];

const doc = (docId, content) => ({ docId, source: "工作记录", content, ts: Date.now() });

/**
 * @param {{ragDocs?: string, embedPayload?: any, idbRecords?: Record<string, any>}} opt
 *   ragDocs 传字符串是故意的：要能塞进**读坏的**原始值（`"{oops"`）来验"不滤"那条保命分支。
 */
async function boot(opt = {}) {
  const storage = { [PREFIX + "cfg"]: JSON.stringify(CFG) };
  if (opt.ragDocs !== undefined) storage[PREFIX + "rag_docs"] = opt.ragDocs;
  const win = loadApp({ storage });
  await new Promise((r) => setTimeout(r, 60));

  const diagCalls = [];
  const origDiag = win.pushDiag;
  win.pushDiag = function (level, msg, ctx) {
    diagCalls.push({ level, msg: String(msg), ctx });
    return origDiag && origDiag.apply(win, arguments);
  };

  const records = opt.idbRecords || {};
  win.idbOpen = async () => ({ __stub: true });          // 不 stub 就恒为 null，向量通道整段被跳过
  win.idbKeys = async () => Object.keys(records);
  win.idbReadKey = async (k) => records[k];
  win.idbMirrorKey = async (k, v) => { records[k] = v; };
  win.idbDeleteKey = async (k) => { delete records[k]; };

  win.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => (opt.embedPayload !== undefined ? opt.embedPayload : { data: [{ index: 0, embedding: VEC }] }),
  });

  return { win, diagCalls, records };
}

const vecRec = (v = VEC) => ({ m: MODEL, v: Float32Array.from(v) });
const findDiag = (calls, re) => calls.find((c) => re.test(c.msg));

describe("R-40 · 载入侧按文档表过滤孤儿向量", () => {
  it("IDB 里留着已删文档的向量 → 不得复活成命中，且必须留痕（orphaned=N）", async () => {
    const { win, diagCalls } = await boot({
      ragDocs: JSON.stringify([doc("doc-live", "修复登录页 500 报错")]),
      idbRecords: { "ragvec:doc-live": vecRec(), "ragvec:doc-ghost": vecRec() },
    });

    const hits = await win.ragSearch("login bug", 5);
    expect(hits.some((h) => h.docId === "doc-ghost"), "已删文档仍被召回 = 孤儿向量没过 live 过滤").toBe(false);
    expect(hits.some((h) => h.docId === "doc-live"), "过滤把**现存**文档的向量也丢了 = 筛子筛穿了").toBe(true);

    const hit = findDiag(diagCalls, /vectors orphaned=1/);
    expect(hit, "孤儿被静默跳过 ⇒ 下次没人知道 IDB 在长垃圾").toBeTruthy();
    expect(hit.ctx && hit.ctx.where).toBe("ragVecLoadAll");
    expect(hit.level).toBe("warn");
  });

  it("反向对照：文档表里**有**这条时照常命中，且一条孤儿诊断都不许有", async () => {
    const { win, diagCalls } = await boot({
      ragDocs: JSON.stringify([doc("doc-live", "修复登录页 500 报错"), doc("doc-ghost", "评审纪要")]),
      idbRecords: { "ragvec:doc-live": vecRec(), "ragvec:doc-ghost": vecRec() },
    });

    const hits = await win.ragSearch("login bug", 5);
    expect(hits.map((h) => h.docId).sort()).toEqual(["doc-ghost", "doc-live"]);
    expect(findDiag(diagCalls, /orphaned=/), "正常状态报孤儿 = 把常态刷成红色").toBeFalsy();
  });

  it("保命分支：文档表**读不出来**时不许过滤（宁可留幽灵，也不误删真向量）", async () => {
    /* 这条是整批里最危险的一面：`getRagDocs()` 在"读坏了"和"确实没文档"两种情况下都返回 `[]`。
       若照滤，正常向量会被全当成孤儿丢掉，且 `loaded` 已置位 ⇒ 本次会话语义召回永久降级成纯词法。
       ⚠️ 触发方式是被迫的：**不能**预置一个损坏的 JSON 值 —— 启动期 `_guardGenericJsonKeys`
       （data-migrate.js）会把它备份成 `*_broken_<ts>` 再把原键重置成 `[]`，到载入侧时已经是合法空表。
       真实可达的形态是 `getItem` 本身抛错（存储被策略禁用 / 配额异常），所以这里在运行期替换 getItem。 */
    const { win, diagCalls } = await boot({ idbRecords: { "ragvec:doc-ghost": vecRec() } });
    const origGet = win.Storage.prototype.getItem;
    win.Storage.prototype.getItem = function (k) {
      if (String(k) === PREFIX + "rag_docs") throw new win.DOMException("SecurityError", "SecurityError");
      return origGet.call(this, k);
    };

    const hits = await win.ragSearch("login bug", 5);
    expect(hits.some((h) => h.docId === "doc-ghost"), "读失败时仍把向量丢了 = 保命分支没生效").toBe(true);
    const hit = findDiag(diagCalls, /rag docs unreadable/);
    expect(hit, "退回旧行为必须留痕，否则「为什么这次没滤」无从查起").toBeTruthy();
    expect(hit.ctx && hit.ctx.where).toBe("ragVecLoadAll");
  });
});

describe("R-41 · aiEmbedTexts 的两个静默 return null 要留痕（返回值不变）", () => {
  it("200 但形状不可识别 → 返回 null（降级照旧），诊断点名看到的键", async () => {
    const { win, diagCalls } = await boot({ embedPayload: { result: "weird" } });
    const out = await win.aiEmbedTexts(["x"]);
    expect(out, "不得把降级改成抛错").toBeNull();
    const hit = findDiag(diagCalls, /无可识别向量/);
    expect(hit, "「服务答了个不认识的形状」与「你没开语义召回」同形 ⇒ 必须能分辨").toBeTruthy();
    expect(hit.ctx && hit.ctx.where).toBe("aiEmbedTexts");
    expect(hit.msg, "诊断要带上实际键名，否则查不出是哪家 provider 的形状").toContain("result");
  });

  it("条数不符（要 1 条给 2 条）→ 返回 null（不猜），诊断带上两个数", async () => {
    const { win, diagCalls } = await boot({ embedPayload: { data: [{ embedding: [1, 0] }, { embedding: [0, 1] }] } });
    const out = await win.aiEmbedTexts(["x"]);
    expect(out, "「不猜」这条契约没变").toBeNull();
    const hit = findDiag(diagCalls, /条数不符/);
    expect(hit).toBeTruthy();
    expect(hit.msg).toMatch(/期望 1 条、返回 2 条/);
  });

  it("对照组：正常形状 → 两条新诊断都不许出现（否则每次检索都刷屏）", async () => {
    const { win, diagCalls } = await boot({ embedPayload: { data: [{ embedding: VEC }] } });
    const out = await win.aiEmbedTexts(["x"]);
    expect(out && out.length).toBe(1);
    expect(diagCalls.filter((c) => /无可识别向量|条数不符/.test(c.msg))).toEqual([]);
  });
});
