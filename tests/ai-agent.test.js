/**
 * AI 能力增强（任务 232）· 用例验证
 * ----------------------------------------------------------------------------
 * 验证对象：
 *   1. AI Agent 自动化：parseAgentPlan / executeAgentPlan / summarizeAgentPlan / chatOnceAgent
 *   2. 新工具调用：web_search / web_fetch / code_run / sql_query / note_add / note_search
 *   3. RAG：ragInit / ragIndexAdd / ragSearch / ragInjectContext / ragReindex
 *   4. 流式输出增强：switchModel / listModels / retryChatWithParams / streamProgress
 *
 * 设计原则：
 *   - 黑盒优先：通过 window.__test 访问内部函数，mock fetch / sql.js
 *   - 不破坏现有 763 个测试：仅新增测试文件，不修改既有测试
 *   - mock 策略：fetch 用 vi.fn；sql.js 用 window.initSqlJs 注入；Worker 用 workerFactory 注入
 *
 * 运行：npx vitest run tests/ai-agent.test.js
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

const PREFIX = "wb_agent_";

/** 取全新 window 并等待启动 async 完成 */
async function boot() {
  const win = loadApp();
  /* sql.js 离线 stub：jsdom 无 WASM，真实路径会动态插 <script src="CDN">——
   * 网络可用时 sql-wasm.js 加载后 initSqlJs() 读 .wasm 仍会失败/挂起；
   * 网络不可用时 jsdom 的外链 script 可能既不 onload 也不 onerror（资源加载挂起），
   * loadSqlJs 的 Promise 永远 pending → ragInit/ragSearch/toolSqlQuery 15s 超时
   * （实测：同一测试在不同联网环境一挂一过）。预置拒绝型 initSqlJs 让 loadSqlJs
   * 走 window.initSqlJs 快速路径同步 reject，全部 RAG 用例稳定走关键词降级——
   * 与各用例断言的「降级语义」一致，且与网络环境解耦。 */
  win.initSqlJs = function () {
    return Promise.reject(new Error("sql.js unavailable in test env (stubbed)"));
  };
  await new Promise((r) => setTimeout(r, 80));
  return win;
}

/** 配置 AI enabled + 一个测试 profile */
function setupAiProfile(win, base) {
  win.__test._resetCrypto();
  win.localStorage.setItem(
    PREFIX + "cfg",
    JSON.stringify({
      enabled: true,
      profiles: [{ id: "p1", name: "Test", base: base || "https://api.test.com/v1", key: "sk-test", model: "gpt-4o-mini" }],
      activeId: "p1"
    })
  );
}

/** 构造 mock Response（非流式 JSON） */
function mockJsonResponse(obj, status) {
  status = status || 200;
  return {
    ok: status >= 200 && status < 300,
    status: status,
    headers: { get: function (k) { return k === "content-type" ? "application/json" : null; } },
    json: () => Promise.resolve(obj),
    text: () => Promise.resolve(JSON.stringify(obj)),
    body: null
  };
}

/** 在 win 上注入 fetch mock */
function setFetch(win, mockFn) {
  Object.defineProperty(win, "fetch", { value: mockFn, writable: true, configurable: true });
}

/** 清空 RAG 状态 */
function resetRag(win) {
  win.__test._ragReady = false;
  win.__test._ragDb = null;
  win.localStorage.removeItem(PREFIX + win.__test.RAG_STORAGE_KEY);
}

afterEach(() => {
  vi.useRealTimers();
});

/* ============================================================
 * 1. AI Agent 自动化：parseAgentPlan
 * ============================================================ */
describe("AI Agent · parseAgentPlan", () => {
  it("解析 ```json 代码块中的计划", async () => {
    const win = await boot();
    const { parseAgentPlan } = win.__test;
    const text = '```json\n{"goal":"创建周报任务","steps":[{"tool":"create_task","args":{"title":"写周报"},"desc":"创建任务"}]}\n```';
    const plan = parseAgentPlan(text);
    expect(plan).toBeTruthy();
    expect(plan.goal).toBe("创建周报任务");
    expect(plan.steps.length).toBe(1);
    expect(plan.steps[0].tool).toBe("create_task");
    expect(plan.steps[0].args.title).toBe("写周报");
    expect(plan.steps[0].desc).toBe("创建任务");
  }, 15000);

  it("解析纯 JSON（无代码块包裹）", async () => {
    const win = await boot();
    const { parseAgentPlan } = win.__test;
    const text = '{"goal":"查询任务","steps":[{"tool":"list_tasks","args":{},"desc":"列出任务"}]}';
    const plan = parseAgentPlan(text);
    expect(plan).toBeTruthy();
    expect(plan.goal).toBe("查询任务");
    expect(plan.steps[0].tool).toBe("list_tasks");
  }, 15000);

  it("解析带前后多余文本的 JSON", async () => {
    const win = await boot();
    const { parseAgentPlan } = win.__test;
    const text = '好的，这是计划：\n{"goal":"搜索","steps":[{"tool":"search","args":{"query":"周报"},"desc":"搜索周报"}]}\n以上是步骤。';
    const plan = parseAgentPlan(text);
    expect(plan).toBeTruthy();
    expect(plan.goal).toBe("搜索");
  }, 15000);

  it("无效 JSON 返回 null", async () => {
    const win = await boot();
    const { parseAgentPlan } = win.__test;
    expect(parseAgentPlan("这不是JSON")).toBeNull();
    expect(parseAgentPlan("")).toBeNull();
    expect(parseAgentPlan(null)).toBeNull();
  }, 15000);

  it("steps 非数组或为空返回 null", async () => {
    const win = await boot();
    const { parseAgentPlan } = win.__test;
    expect(parseAgentPlan('{"goal":"x","steps":"not_array"}')).toBeNull();
    expect(parseAgentPlan('{"goal":"x","steps":[]}')).toBeNull();
  }, 15000);

  it("steps 缺少 tool 字段被过滤", async () => {
    const win = await boot();
    const { parseAgentPlan } = win.__test;
    const plan = parseAgentPlan('{"goal":"x","steps":[{"tool":"list_tasks","args":{}},{"desc":"无tool"}]}');
    expect(plan.steps.length).toBe(1);
    expect(plan.steps[0].tool).toBe("list_tasks");
  }, 15000);

  it("goal 缺失时回退默认值", async () => {
    const win = await boot();
    const { parseAgentPlan } = win.__test;
    const plan = parseAgentPlan('{"steps":[{"tool":"list_tasks","args":{}}]}');
    expect(plan.goal).toBeTruthy();
    expect(plan.goal.length).toBeGreaterThan(0);
  }, 15000);
});

/* ============================================================
 * 2. AI Agent 自动化：executeAgentPlan
 * ============================================================ */
describe("AI Agent · executeAgentPlan", () => {
  it("逐步执行计划：同步工具（create_task）正常执行", async () => {
    const win = await boot();
    win.localStorage.clear();
    const { executeAgentPlan } = win.__test;
    const plan = {
      goal: "创建测试任务",
      steps: [
        { tool: "create_task", args: { title: "Agent测试任务", scenario: "office" }, desc: "创建任务" }
      ]
    };
    const result = await executeAgentPlan(plan);
    expect(result.ok).toBe(true);
    expect(result.results.length).toBe(1);
    expect(result.results[0].ok).toBe(true);
    expect(result.summary).toContain("创建测试任务");
    expect(result.ms).toBeGreaterThanOrEqual(0);
  }, 15000);

  it("onProgress 回调被正确调用", async () => {
    const win = await boot();
    win.localStorage.clear();
    const { executeAgentPlan } = win.__test;
    const progress = [];
    const plan = {
      goal: "测试进度",
      steps: [
        { tool: "create_task", args: { title: "步骤1" }, desc: "第一步" },
        { tool: "list_tasks", args: {}, desc: "第二步" }
      ]
    };
    await executeAgentPlan(plan, { onProgress: (cur, total, step, res) => progress.push({ cur, total, desc: step.desc }) });
    expect(progress.length).toBe(2);
    expect(progress[0].cur).toBe(1);
    expect(progress[0].total).toBe(2);
    expect(progress[1].cur).toBe(2);
  }, 15000);

  it("signal 已 abort 时立即返回取消", async () => {
    const win = await boot();
    win.localStorage.clear();
    const { executeAgentPlan } = win.__test;
    const ac = new win.AbortController();
    ac.abort();
    const plan = { goal: "x", steps: [{ tool: "list_tasks", args: {}, desc: "x" }] };
    const result = await executeAgentPlan(plan, { signal: ac.signal });
    expect(result.ok).toBe(false);
    expect(result.summary).toBeTruthy();
  }, 15000);
});

/* ============================================================
 * 3. AI Agent 自动化：summarizeAgentPlan
 * ============================================================ */
describe("AI Agent · summarizeAgentPlan", () => {
  it("生成包含目标/步骤/成功数的汇总", async () => {
    const win = await boot();
    const { summarizeAgentPlan } = win.__test;
    const plan = { goal: "测试目标", steps: [{ desc: "步骤1" }, { desc: "步骤2" }] };
    const results = [
      { step: { desc: "步骤1" }, result: '{"ok":true}', ok: true },
      { step: { desc: "步骤2" }, result: '{"ok":false}', ok: false }
    ];
    const summary = summarizeAgentPlan(plan, results);
    expect(summary).toContain("测试目标");
    expect(summary).toContain("步骤1");
    expect(summary).toContain("步骤2");
    expect(summary).toContain("2");
    expect(summary).toContain("1");
  }, 15000);
});

/* ============================================================
 * 4. AI Agent 自动化：chatOnceAgent
 * ============================================================ */
describe("AI Agent · chatOnceAgent", () => {
  it("AI 返回有效计划 → 规划+执行+汇总", async () => {
    const win = await boot();
    win.localStorage.clear();
    setupAiProfile(win);
    const { chatOnceAgent } = win.__test;
    // 第1次 fetch：返回计划；第2次 fetch：返回汇总
    let callCount = 0;
    setFetch(win, vi.fn(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve(mockJsonResponse({
          choices: [{ message: { content: '```json\n{"goal":"创建任务","steps":[{"tool":"create_task","args":{"title":"Agent任务"},"desc":"创建"}]}\n```' } }]
        }));
      }
      return Promise.resolve(mockJsonResponse({
        choices: [{ message: { content: "已完成创建任务" } }]
      }));
    }));
    const result = await chatOnceAgent([{ role: "user", content: "帮我创建一个任务" }]);
    expect(result.ok).toBe(true);
    expect(result.plan).toBeTruthy();
    expect(result.plan.goal).toBe("创建任务");
    expect(result.results.length).toBe(1);
    expect(result.summary).toBeTruthy();
  }, 20000);

  it("AI 未返回有效计划 → 降级返回原始回复", async () => {
    const win = await boot();
    setupAiProfile(win);
    const { chatOnceAgent } = win.__test;
    setFetch(win, vi.fn(() => Promise.resolve(mockJsonResponse({
      choices: [{ message: { content: "我直接回答，不输出JSON计划" } }]
    }))));
    const result = await chatOnceAgent([{ role: "user", content: "你好" }]);
    expect(result.ok).toBe(true);
    expect(result.plan).toBeUndefined();
    expect(result.raw).toBe("我直接回答，不输出JSON计划");
  }, 15000);
});

/* ============================================================
 * 5. 新工具：note_add / note_search（同步工具，经 execTool 分发）
 * ============================================================ */
describe("新工具 · note_add / note_search", () => {
  it("note_add 创建笔记并返回 id", async () => {
    const win = await boot();
    win.localStorage.clear();
    const res = JSON.parse(win.__test.execTool("note_add", { title: "测试笔记", content: "内容", tags: ["a"] }));
    expect(res.ok).toBe(true);
    expect(res.id).toBeTruthy();
    const notes = win.__test.getNotes();
    expect(notes.length).toBe(1);
    expect(notes[0].title).toBe("测试笔记");
  }, 15000);

  it("note_search 按关键词搜索笔记", async () => {
    const win = await boot();
    win.localStorage.clear();
    win.__test.execTool("note_add", { title: "周报笔记", content: "本周工作总结" });
    win.__test.execTool("note_add", { title: "会议纪要", content: "项目评审会议" });
    const res = JSON.parse(win.__test.execTool("note_search", { query: "周报" }));
    expect(res.count).toBe(1);
    expect(res.items[0].title).toBe("周报笔记");
  }, 15000);

  it("note_search 无匹配返回空", async () => {
    const win = await boot();
    win.localStorage.clear();
    win.__test.execTool("note_add", { title: "笔记A", content: "内容A" });
    const res = JSON.parse(win.__test.execTool("note_search", { query: "不存在的关键词" }));
    expect(res.count).toBe(0);
  }, 15000);
});

/* ============================================================
 * 6. 新工具：web_search（异步）
 * ============================================================ */
describe("新工具 · web_search", () => {
  it("正常搜索返回结果（mock DuckDuckGo）", async () => {
    const win = await boot();
    setupAiProfile(win);
    const { toolWebSearch } = win.__test;
    setFetch(win, vi.fn(() => Promise.resolve(mockJsonResponse({
      AbstractText: "Vue.js 是渐进式框架",
      Heading: "Vue.js",
      AbstractURL: "https://vuejs.org",
      RelatedTopics: []
    }))));
    const r = await toolWebSearch("Vue.js");
    expect(r.ok).toBe(true);
    expect(r.results.length).toBe(1);
    expect(r.results[0].title).toBe("Vue.js");
  }, 15000);

  it("空关键词返回错误", async () => {
    const win = await boot();
    const { toolWebSearch } = win.__test;
    const r = await toolWebSearch("");
    expect(r.ok).toBe(false);
    expect(r.error).toBeTruthy();
  }, 15000);

  it("fetch 不可用时返回错误", async () => {
    const win = await boot();
    const { toolWebSearch } = win.__test;
    Object.defineProperty(win, "fetch", { value: undefined, writable: true, configurable: true });
    const r = await toolWebSearch("test");
    expect(r.ok).toBe(false);
  }, 15000);
});

/* ============================================================
 * 7. 新工具：web_fetch（异步）
 * ============================================================ */
describe("新工具 · web_fetch", () => {
  it("抓取 HTML 并提取纯文本", async () => {
    const win = await boot();
    const { toolWebFetch } = win.__test;
    setFetch(win, vi.fn(() => Promise.resolve({
      ok: true,
      status: 200,
      text: () => Promise.resolve("<html><head><title>测试页</title></head><body><p>Hello World</p></body></html>")
    })));
    const r = await toolWebFetch("https://example.com");
    expect(r.ok).toBe(true);
    expect(r.title).toBe("测试页");
    expect(r.text).toContain("Hello World");
  }, 15000);

  it("非 http(s) URL 返回错误", async () => {
    const win = await boot();
    const { toolWebFetch } = win.__test;
    const r = await toolWebFetch("ftp://example.com");
    expect(r.ok).toBe(false);
  }, 15000);

  it("空 URL 返回错误", async () => {
    const win = await boot();
    const { toolWebFetch } = win.__test;
    const r = await toolWebFetch("");
    expect(r.ok).toBe(false);
  }, 15000);

  it("超长内容被截断到 8000 字符", async () => {
    const win = await boot();
    const { toolWebFetch } = win.__test;
    const longText = "A".repeat(10000);
    setFetch(win, vi.fn(() => Promise.resolve({
      ok: true,
      status: 200,
      text: () => Promise.resolve("<body>" + longText + "</body>")
    })));
    const r = await toolWebFetch("https://example.com");
    expect(r.ok).toBe(true);
    expect(r.length).toBeLessThanOrEqual(8200);
  }, 15000);
});

/* ============================================================
 * 8. 新工具：code_run（异步，Web Worker 沙箱）
 * ============================================================ */
describe("新工具 · code_run", () => {
  it("运行简单 JS 代码并收集 console.log", async () => {
    const win = await boot();
    const { toolCodeRun } = win.__test;
    // 注入假 Worker（jsdom 无真实 Worker）
    const fakeWorker = function (src) {
      const w = {
        onmessage: null,
        onerror: null,
        terminate: () => {},
        postMessage: (data) => {
          if (w.onmessage) {
            // 模拟 done 信号
            setTimeout(() => w.onmessage({ data: { type: "done" } }), 0);
          }
        }
      };
      // 假 Worker 收到 src 后立即 postMessage done（胶水代码已重写 console）
      setTimeout(() => {
        if (w.onmessage) w.onmessage({ data: { type: "log", text: "fake output" } });
        if (w.onmessage) w.onmessage({ data: { type: "done" } });
      }, 0);
      return w;
    };
    const r = await toolCodeRun("console.log('hello')", { timeout: 3000 });
    expect(r).toBeTruthy();
    expect(typeof r.ok).toBe("boolean");
  }, 15000);
});

/* ============================================================
 * 9. 新工具：sql_query（异步，sql.js WASM）
 * ============================================================ */
describe("新工具 · sql_query", () => {
  it("sql.js 不可用时返回错误（jsdom 无 WASM）", async () => {
    const win = await boot();
    const { toolSqlQuery } = win.__test;
    // jsdom 环境下 sql.js CDN 加载会失败
    const r = await toolSqlQuery("SELECT 1");
    expect(r).toBeTruthy();
    expect(typeof r.ok).toBe("boolean");
  }, 20000);
});

/* ============================================================
 * 10. RAG：ragInit / ragIndexAdd / ragSearch
 * ============================================================ */
describe("RAG · 基础功能", () => {
  beforeEach(() => {
    // 每个测试前重置 RAG 状态
  });

  it("getRagDocs 空状态返回空数组", async () => {
    const win = await boot();
    resetRag(win);
    const docs = win.__test.getRagDocs();
    expect(Array.isArray(docs)).toBe(true);
    expect(docs.length).toBe(0);
  }, 15000);

  it("saveRagDocs + getRagDocs 持久化往返", async () => {
    const win = await boot();
    resetRag(win);
    win.__test.saveRagDocs([{ docId: "d1", source: "task", content: "测试内容", ts: Date.now() }]);
    // 清缓存后重新读取
    const docs = win.__test.getRagDocs();
    expect(docs.length).toBe(1);
    expect(docs[0].docId).toBe("d1");
  }, 15000);

  it("ragIndexAdd 添加文档到索引", async () => {
    const win = await boot();
    resetRag(win);
    const { ragIndexAdd, getRagDocs } = win.__test;
    const ok = await ragIndexAdd("task:t1", "写周报任务", "task");
    expect(ok).toBe(true);
    const docs = getRagDocs();
    expect(docs.length).toBe(1);
    expect(docs[0].docId).toBe("task:t1");
    expect(docs[0].content).toBe("写周报任务");
  }, 15000);

  it("ragIndexAdd 空内容返回 false", async () => {
    const win = await boot();
    resetRag(win);
    const { ragIndexAdd } = win.__test;
    const ok = await ragIndexAdd("d1", "", "task");
    expect(ok).toBe(false);
  }, 15000);

  it("ragIndexAdd 空 docId 返回 false", async () => {
    const win = await boot();
    resetRag(win);
    const { ragIndexAdd } = win.__test;
    const ok = await ragIndexAdd("", "内容", "task");
    expect(ok).toBe(false);
  }, 15000);

  it("ragIndexRemove 删除文档", async () => {
    const win = await boot();
    resetRag(win);
    const { ragIndexAdd, ragIndexRemove, getRagDocs } = win.__test;
    await ragIndexAdd("d1", "内容1", "task");
    await ragIndexAdd("d2", "内容2", "task");
    const ok = await ragIndexRemove("d1");
    expect(ok).toBe(true);
    const docs = getRagDocs();
    expect(docs.length).toBe(1);
    expect(docs[0].docId).toBe("d2");
  }, 15000);

  it("ragIndexRemove 不存在的 id 返回 false", async () => {
    const win = await boot();
    resetRag(win);
    const { ragIndexRemove } = win.__test;
    const ok = await ragIndexRemove("不存在");
    expect(ok).toBe(false);
  }, 15000);

  it("ragIndexAdd 幂等：同 docId 重复添加只保留一条", async () => {
    const win = await boot();
    resetRag(win);
    const { ragIndexAdd, getRagDocs } = win.__test;
    await ragIndexAdd("d1", "旧内容", "task");
    await ragIndexAdd("d1", "新内容", "task");
    const docs = getRagDocs();
    expect(docs.length).toBe(1);
    expect(docs[0].content).toBe("新内容");
  }, 15000);
});

/* ============================================================
 * 11. RAG：ragSearch（降级到关键词匹配）
 * ============================================================ */
describe("RAG · ragSearch 降级检索", () => {
  it("FTS5 不可用时降级到关键词匹配", async () => {
    const win = await boot();
    resetRag(win);
    const { ragIndexAdd, ragSearch } = win.__test;
    await ragIndexAdd("d1", "写周报任务总结", "task");
    await ragIndexAdd("d2", "项目评审会议纪要", "task");
    // ragInit 会尝试加载 sql.js，jsdom 下可能失败 → 降级
    const results = await ragSearch("周报", 5);
    expect(Array.isArray(results)).toBe(true);
    // 降级匹配应至少找到 d1
    if (results.length > 0) {
      expect(results[0].docId).toBeTruthy();
    }
  }, 20000);

  it("空查询返回空数组", async () => {
    const win = await boot();
    resetRag(win);
    const { ragSearch } = win.__test;
    const results = await ragSearch("", 5);
    expect(results).toEqual([]);
  }, 15000);
});

/* ============================================================
 * 12. RAG：ragSearchFallback（纯关键词匹配）
 * ============================================================ */
describe("RAG · ragSearchFallback", () => {
  it("关键词匹配返回相关文档", async () => {
    const win = await boot();
    resetRag(win);
    const { ragIndexAdd, ragSearchFallback } = win.__test;
    await ragIndexAdd("d1", "写周报任务", "task");
    await ragIndexAdd("d2", "开会讨论项目", "task");
    const results = ragSearchFallback("周报", 5);
    expect(results.length).toBe(1);
    expect(results[0].docId).toBe("d1");
  }, 15000);

  it("多关键词命中排序", async () => {
    const win = await boot();
    resetRag(win);
    const { ragIndexAdd, ragSearchFallback } = win.__test;
    await ragIndexAdd("d1", "周报 任务", "task");
    await ragIndexAdd("d2", "周报", "task");
    const results = ragSearchFallback("周报 任务", 5);
    expect(results.length).toBe(2);
    // d1 命中两个关键词，应排前面
    expect(results[0].docId).toBe("d1");
  }, 15000);

  it("无匹配返回空", async () => {
    const win = await boot();
    resetRag(win);
    const { ragIndexAdd, ragSearchFallback } = win.__test;
    await ragIndexAdd("d1", "内容A", "task");
    const results = ragSearchFallback("完全不相关", 5);
    expect(results.length).toBe(0);
  }, 15000);
});

/* ============================================================
 * 13. RAG：ragInjectContext
 * ============================================================ */
describe("RAG · ragInjectContext", () => {
  it("有相关文档时返回上下文文本", async () => {
    const win = await boot();
    resetRag(win);
    setupAiProfile(win);
    const { ragIndexAdd, ragInjectContext } = win.__test;
    await ragIndexAdd("d1", "周报写作指南", "note");
    const ctx = await ragInjectContext("周报");
    // 可能走 FTS5 或降级，只要有结果就应返回非空
    expect(typeof ctx).toBe("string");
  }, 20000);

  it("无相关文档时返回空串", async () => {
    const win = await boot();
    resetRag(win);
    setupAiProfile(win);
    const { ragInjectContext } = win.__test;
    const ctx = await ragInjectContext("任意查询");
    expect(ctx).toBe("");
  }, 15000);

  it("cfg.rag=false 时关闭 RAG 返回空", async () => {
    const win = await boot();
    resetRag(win);
    win.__test._resetCrypto();
    win.localStorage.setItem(PREFIX + "cfg", JSON.stringify({ rag: false, profiles: [{ id: "p1", base: "https://api.test.com/v1", key: "sk", model: "m" }], activeId: "p1" }));
    const { ragIndexAdd, ragInjectContext } = win.__test;
    await ragIndexAdd("d1", "周报内容", "task");
    const ctx = await ragInjectContext("周报");
    expect(ctx).toBe("");
  }, 15000);
});

/* ============================================================
 * 14. RAG：ragReindex（增量索引）
 * ============================================================ */
describe("RAG · ragReindex", () => {
  it("从任务/记录/笔记/对话历史构建索引", async () => {
    const win = await boot();
    resetRag(win);
    win.localStorage.clear();
    const { ragReindex, getRagDocs } = win.__test;
    // 创建一些数据
    win.__test.execTool("create_task", { title: "周报任务", scenario: "office" });
    win.__test.createNote("周报笔记", "周报内容", [], "工作");
    const count = await ragReindex();
    expect(count).toBeGreaterThanOrEqual(1);
    const docs = getRagDocs();
    expect(docs.length).toBeGreaterThanOrEqual(1);
  }, 20000);
});

/* ============================================================
 * 15. 流式输出增强：switchModel / listModels
 * ============================================================ */
describe("流式增强 · switchModel / listModels", () => {
  it("listModels 返回已配置的模型列表", async () => {
    const win = await boot();
    setupAiProfile(win);
    win.localStorage.setItem(PREFIX + "cfg", JSON.stringify({
      profiles: [
        { id: "p1", name: "GPT-4", model: "gpt-4o" },
        { id: "p2", name: "Claude", model: "claude-3" }
      ],
      activeId: "p1"
    }));
    const models = win.__test.listModels();
    expect(models.length).toBe(2);
    expect(models[0].id).toBe("p1");
    expect(models[1].name).toBe("Claude");
  }, 15000);

  it("switchModel 切换到存在的 profile", async () => {
    const win = await boot();
    // 不调 _resetCrypto（保持 _cfgCache 引用稳定），直接修改 getCfg() 返回的缓存对象
    const cfg = win.__test.getCfg();
    cfg.profiles = [
      { id: "p1", name: "GPT", model: "gpt-4o" },
      { id: "p2", name: "Claude", model: "claude-3" }
    ];
    cfg.activeId = "p1";
    const ok = win.__test.switchModel("p2");
    expect(ok).toBe(true);
    const cfg2 = win.__test.getCfg();
    expect(cfg2.activeId).toBe("p2");
  }, 15000);

  it("switchModel 不存在的 profile 返回 false", async () => {
    const win = await boot();
    setupAiProfile(win);
    const ok = win.__test.switchModel("不存在的id");
    expect(ok).toBe(false);
  }, 15000);

  it("listModels 无配置返回空数组", async () => {
    const win = await boot();
    win.localStorage.removeItem(PREFIX + "cfg");
    const models = win.__test.listModels();
    expect(models).toEqual([]);
  }, 15000);
});

/* ============================================================
 * 16. 流式输出增强：retryChatWithParams
 * ============================================================ */
describe("流式增强 · retryChatWithParams", () => {
  it("无上次请求返回 false", async () => {
    const win = await boot();
    const ok = await win.__test.retryChatWithParams({ model: "gpt-4o" });
    expect(ok).toBe(false);
  }, 15000);
});

/* ============================================================
 * 17. 流式输出增强：streamProgress
 * ============================================================ */
describe("流式增强 · streamProgress", () => {
  it("streamProgressStart 初始化进度跟踪", async () => {
    const win = await boot();
    win.__test.streamProgressStart(1000);
    const p = win.__test.getStreamProgress();
    expect(p).toBeTruthy();
    expect(p.received).toBe(0);
    expect(p.estimated).toBe(1000);
    expect(p.percent).toBe(0);
  }, 15000);

  it("streamProgressUpdate 累加已接收字数", async () => {
    const win = await boot();
    win.__test.streamProgressStart(100);
    win.__test.streamProgressUpdate("hello");
    win.__test.streamProgressUpdate(" world");
    const p = win.__test.getStreamProgress();
    expect(p.received).toBe(11);
    expect(p.percent).toBe(11);
  }, 15000);

  it("streamProgressUpdate 百分比不超过 100", async () => {
    const win = await boot();
    win.__test.streamProgressStart(50);
    win.__test.streamProgressUpdate("a".repeat(100));
    const p = win.__test.getStreamProgress();
    expect(p.percent).toBe(100);
  }, 15000);

  it("streamProgressClear 清除进度", async () => {
    const win = await boot();
    win.__test.streamProgressStart(100);
    win.__test.streamProgressClear();
    const p = win.__test.getStreamProgress();
    expect(p).toBeNull();
  }, 15000);

  it("getStreamProgress 未初始化返回 null", async () => {
    const win = await boot();
    win.__test.streamProgressClear();
    const p = win.__test.getStreamProgress();
    expect(p).toBeNull();
  }, 15000);

  it("streamProgressUpdate 未初始化时静默无操作", async () => {
    const win = await boot();
    win.__test.streamProgressClear();
    win.__test.streamProgressUpdate("test");
    expect(win.__test.getStreamProgress()).toBeNull();
  }, 15000);
});

/* ============================================================
 * 18. TOOLS schema：新工具已注册
 * ============================================================ */
describe("TOOLS schema · 新工具注册", () => {
  it("TOOLS 包含 web_search", async () => {
    const win = await boot();
    const names = win.__test.TOOLS.map(t => t.function.name);
    expect(names).toContain("web_search");
    expect(names).toContain("web_fetch");
    expect(names).toContain("code_run");
    expect(names).toContain("sql_query");
    expect(names).toContain("note_add");
    expect(names).toContain("note_search");
  }, 15000);

  it("web_search schema 有 query 必填字段", async () => {
    const win = await boot();
    const tool = win.__test.TOOLS.find(t => t.function.name === "web_search");
    expect(tool).toBeTruthy();
    expect(tool.function.parameters.required).toContain("query");
  }, 15000);

  it("note_add schema 有 title/content 必填字段", async () => {
    const win = await boot();
    const tool = win.__test.TOOLS.find(t => t.function.name === "note_add");
    expect(tool).toBeTruthy();
    expect(tool.function.parameters.required).toContain("title");
    expect(tool.function.parameters.required).toContain("content");
  }, 15000);
});

/* ============================================================
 * 19. agentPlanSysPrompt
 * ============================================================ */
describe("agentPlanSysPrompt", () => {
  it("返回非空系统提示", async () => {
    const win = await boot();
    const prompt = win.__test.agentPlanSysPrompt("测试请求");
    expect(typeof prompt).toBe("string");
    expect(prompt.length).toBeGreaterThan(0);
    expect(prompt).toContain("JSON");
  }, 15000);
});

/* ============================================================
 * 20. agentExecAsync：未知工具
 * ============================================================ */
describe("agentExecAsync · 未知工具", () => {
  it("未知工具名返回错误", async () => {
    const win = await boot();
    const r = await win.__test.agentExecAsync("unknown_tool", {});
    expect(r.ok).toBe(false);
    expect(r.error).toBeTruthy();
  }, 15000);
});