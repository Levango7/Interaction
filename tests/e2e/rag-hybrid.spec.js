/**
 * 知识库混合召回 · 真浏览器端到端（v3.7.57）
 * ----------------------------------------------------------------------------
 * 单元测试（tests/rag-semantic.test.js）跑在 jsdom 里，有三件事它结构上证明不了：
 *   ① 向量到底有没有**持久化**（jsdom 没有 IndexedDB，缓存是唯一副本 → 刷新即失也测不出）；
 *   ② /embeddings 请求在真实 CSP + CORS 下**发得出去吗**（connect-src 放行回环是 v3.7.56 才有的）；
 *   ③ 检索结果最后**真进了 system prompt 片段**（ragInjectContext 是 AI 问答的关键路径）。
 * 所以这条 spec 专门补这三段，用的是"假 embedding 端点 + 真浏览器"。
 *
 * 另一个动机是本轮实测到的两处名不副实（写在 tests/rag-semantic.test.js 顶部）：
 * 仓库自带的 sql.js 构建没编 FTS5，且 unicode61 不切汉字 —— 旧的"FTS5 全文检索"
 * 其实一次都没跑通过。现在词法一路是自带 BM25，汉字查询必须真能召回。
 *
 * 默认跳过，E2E=1 才跑；只在 desktop 项目跑（见 playwright.config.js 的 testIgnore）。
 */
const { test, expect } = require("./_fixture");

const APP_URL = "./agent-workbench.html";
const API_BASE = "http://127.0.0.1:11434/v1";   // validateBaseUrl 只放行 https 与回环 http

/* 概念词表假 embedding：登录/login/认证 → 同一维，中英之间可算出高余弦。
   与真实模型同构（单位球面上的稀疏向量），足以验证"通道形状 + 融合排序 + 持久化"。 */
const VOCAB = ["auth", "bug", "groceries", "meeting"];
const TERM2CONCEPT = {
  "登录": "auth", "认证": "auth", "鉴权": "auth", "login": "auth", "auth": "auth", "sso": "auth",
  "报错": "bug", "修复": "bug", "缺陷": "bug", "bug": "bug", "error": "bug", "500": "bug",
  "牛奶": "groceries", "采买": "groceries", "清单": "groceries", "购物": "groceries",
  "会议": "meeting", "评审": "meeting", "纪要": "meeting",
};
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
 * 装假 /embeddings 端点。
 * ⚠️ 页面是 file://（origin=null）、这里是 http://127.0.0.1 —— 跨源，
 *    所以 ① 必须带 CORS 头，② POST 前的 OPTIONS 预检也要接住（否则会真发两次请求）。
 * @param {import("@playwright/test").Page} page
 * @param {{fail?:boolean}} [opt] fail:true 模拟 provider 没有 /embeddings
 */
async function stubEmbeddings(page, opt = {}) {
  const calls = { n: 0 };
  await page.route("**/embeddings", (route) => {
    const cors = { "access-control-allow-origin": "*" };
    if (route.request().method() === "OPTIONS") {
      return route.fulfill({
        status: 204,
        headers: Object.assign({}, cors, {
          "access-control-allow-headers": "content-type,authorization",
          "access-control-allow-methods": "POST,OPTIONS",
        }),
      });
    }
    calls.n++;
    if (opt.fail) return route.fulfill({ status: 404, contentType: "application/json", headers: cors, body: JSON.stringify({ error: "no such endpoint" }) });
    const body = route.request().postDataJSON() || {};
    const inputs = Array.isArray(body.input) ? body.input : [body.input];
    const data = inputs.map(fakeEmbed).map((embedding, index) => ({ index, embedding, object: "embedding" }));
    return route.fulfill({ status: 200, contentType: "application/json", headers: cors, body: JSON.stringify({ data }) });
  });
  return calls;
}

/** 写入 AI 配置（profile 形态）并回载，使 getActiveProfile() 能拿到 base/key/embedModel */
async function seedCfg(page) {
  await page.goto(APP_URL);
  await page.waitForSelector("#side", { timeout: 20000 });
  await page.evaluate(([base]) => {
    localStorage.setItem("wb_agent_cfg", JSON.stringify({
      enabled: true, base, key: "sk-test", model: "qwen", rag: true,
      profiles: [{ id: "p-probe", name: "probe", base, key: "sk-test", model: "qwen", embedModel: "bge-m3" }],
      activeId: "p-probe",
    }));
  }, [API_BASE]);
  await page.reload();
  await page.waitForSelector("#side", { timeout: 20000 });
}

test.describe("知识库混合召回（真浏览器）", () => {
  test.beforeAll(() => { test.skip(!process.env.E2E, "set E2E=1 to run"); });
  /* 首屏加载 3.5MB 单文件 + 两次 reload：默认 30s 在本机实测会顶到线（同 workflow.spec.js 的处置） */
  test.setTimeout(90_000);

  test("汉字查询走词法就能召回（旧的 FTS5 路径做不到这件事）", async ({ page }) => {
    await stubEmbeddings(page, { fail: true });   // 故意让 embedding 通道不可用
    await seedCfg(page);
    const hits = await page.evaluate(async () => {
      await ragIndexAdd("doc-auth", "修复登录页 500 报错", "工作记录");
      await ragIndexAdd("doc-shop", "周末采买清单：牛奶", "工作记录");
      const r = await ragSearch("登录", 5);
      return r.map(h => ({ id: h.docId, via: h.via, score: h.score }));
    });
    const top = hits.find(h => h.id === "doc-auth");
    expect(top, "「登录」召不回写着「修复登录页…」的条目 = 汉字没被切开").toBeTruthy();
    expect(top.via, "embedding 通道已关，只可能来自词法").toBe("lex");
    expect(hits.map(h => h.id), "不相关条目不该混进来").toEqual(["doc-auth"]);
  });

  test("跨语言语义召回 + 向量真的落到 IndexedDB 并扛得住刷新", async ({ page }) => {
    const calls = await stubEmbeddings(page);
    await seedCfg(page);
    const before = await page.evaluate(async () => {
      await ragIndexAdd("doc-auth", "修复登录页 500 报错", "工作记录");
      await ragIndexAdd("doc-shop", "周末采买清单：牛奶", "工作记录");
      const en = await ragSearch("login bug", 5);
      const keys = (await idbKeys()).filter(k => String(k).indexOf("ragvec:") === 0);
      const rec = keys.length ? await idbReadKey(keys[0]) : null;
      return { en: en.map(h => ({ id: h.docId, via: h.via })), vecKeys: keys.length, recModel: rec && rec.m, hasVec: !!(rec && rec.v && rec.v.length > 0) };
    });
    expect(before.en[0], "英文查询应召回中文条目").toMatchObject({ id: "doc-auth" });
    expect(before.en[0].via).toMatch(/vec|both/);
    expect(before.vecKeys, "向量没写进 IDB（前缀/镜像通道用错）").toBe(2);
    /* 落盘形状必须是 {m: 模型, v: 向量}：只存裸向量的话，以后换 embedModel 就会
       因为维度不符而"静默召不回"，且没有任何地方能判断这批向量已失效。 */
    expect(before.recModel, "IDB 记录没带模型号").toBe("bge-m3");
    expect(before.hasVec, "IDB 记录里没有向量本体").toBe(true);
    expect(calls.n, "两篇入库 + 一次查询至少 3 次 embedding 调用").toBeGreaterThanOrEqual(3);

    /* 刷新：内存缓存清零，只剩 IDB —— 还能召回才证明"持久化"是真的 */
    await page.reload();
    await page.waitForSelector("#side", { timeout: 20000 });
    /* v3.7.98 诊断：本用例历史上偶发 flaky（刷新后召不回，CI 上 1.1s 快速失败）。
       失败时 after.en 为空，但**单看断言无法区分三种成因**：
         ① 向量没落 IDB；② embedding 调用没发生/失败（只剩词法，而 "login bug" 是英文召不回中文）；
         ③ IDB 或应用未就绪（#side 是静态 HTML，等它不等于等 startup 完成）。
       在断言前打印现场，让下次 flaky 在 CI 日志里自证。**不影响任何断言**。 */
    const callsAtReload = calls.n;
    const diag = await page.evaluate(async () => {
      const out = {};
      try { out.vecKeys = (await idbKeys()).filter((k) => String(k).indexOf("ragvec:") === 0).length; } catch (e) { out.vecErr = String((e && e.message) || e); }
      try { out.navItems = document.querySelectorAll("#side .nav-item").length; } catch (e) { out.navErr = String((e && e.message) || e); }
      try { out.tasks = typeof getTasks === "function" ? getTasks().length : "no-fn"; } catch (e) { out.tasksErr = String((e && e.message) || e); }
      /* v3.7.99 追加：v3.7.98 的现场显示失败时 embedCallsAfterReload=0 而 vecKeys=2 ——
         即"数据在 IDB，但 ragVectorSearch 在 aiEmbedTexts 之前就 return 了"（ragVecLoadAll 返回了空缓存）。
         这里把 ragVecLoadAll 的输入/输出全摊开：IDB 连接、内存缓存状态、期望模型 vs 记录模型。 */
      try { out.idbDb = (await idbOpen()) ? "ok" : "null"; } catch (e) { out.idbDbErr = String((e && e.message) || e); }
      try { out.wantModel = typeof _ragVecModel === "function" ? _ragVecModel() : "n/a"; } catch (e) { out.wantModelErr = String((e && e.message) || e); }
      try {
        const c = typeof _ragVecCache !== "undefined" ? _ragVecCache : null;
        out.ragCache = c ? { model: c.model, size: c.map ? c.map.size : -1 } : null;
      } catch (e) { out.ragCacheErr = String((e && e.message) || e); }
      try {
        const ks = (await idbKeys()).filter((k) => String(k).indexOf("ragvec:") === 0);
        const r0 = ks.length ? await idbReadKey(ks[0]) : null;
        out.recModel = r0 && r0.m;
        out.recHasVec = !!(r0 && r0.v && r0.v.length > 0);
      } catch (e) { out.recErr = String((e && e.message) || e); }
      return out;
    });
    const after = await page.evaluate(async () => {
      const en = await ragSearch("login bug", 5);
      return { en: en.map(h => ({ id: h.docId, via: h.via })) };
    });
    console.log("[rag-hybrid diag] " + JSON.stringify(Object.assign({}, diag, { embedCallsAfterReload: calls.n - callsAtReload, after: after.en })));
    expect(after.en[0], "刷新后召不回 = 向量只是活在内存里").toMatchObject({ id: "doc-auth" });
  });

  test("两路都命中时 via=both，且检索结果真进了上下文片段", async ({ page }) => {
    await stubEmbeddings(page);
    await seedCfg(page);
    const out = await page.evaluate(async () => {
      await ragIndexAdd("doc-auth", "修复登录页 500 报错", "工作记录");
      await ragIndexAdd("doc-meet", "需求评审会议纪要", "工作记录");
      const hits = await ragSearch("认证 报错", 5);
      const ctxText = await ragInjectContext("上次登录报 500 的事");
      return { via: hits.map(h => h.via), top: hits[0] && hits[0].docId, ctx: ctxText };
    });
    expect(out.top).toBe("doc-auth");
    expect(out.via, "词法与向量都该命中 doc-auth").toContain("both");
    expect(out.ctx, "ragInjectContext 为空 = 开关/检索/拼接某一段断了").toContain("修复登录页 500 报错");
  });

  test("整条链路不产生 pageerror / console error（CSP 拦请求会以 console error 现形）", async ({ page }) => {
    const errs = [];
    page.on("pageerror", (e) => errs.push("pageerror: " + e.message.split("\n")[0].slice(0, 160)));
    page.on("console", (m) => {
      const t = m.text();
      /* file:// 下 manifest.json / 自加载 HTML 的 CORS 噪声与本用例无关，且是既有已知项 */
      if (m.type() === "error" && !/manifest\.json|URL scheme "file"|Failed to load resource/.test(t)) {
        errs.push("console: " + t.slice(0, 160));
      }
    });
    await stubEmbeddings(page);
    await seedCfg(page);
    await page.evaluate(async () => {
      await ragIndexAdd("doc-auth", "修复登录页 500 报错", "工作记录");
      await ragSearch("login bug", 5);
      await ragReindex();
    });
    expect(errs, errs.slice(0, 3).join("\n")).toEqual([]);
  });
});
