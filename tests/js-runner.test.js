import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadApp } from "./helpers/loadApp.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HTML = path.resolve(__dirname, "..", "agent-workbench.html");

/**
 * v3.0.1 B-3：真·JS 运行器测试。
 * vitest jsdom 环境没有真实 Web Worker，通过 runJsSnippet 的 opts.workerFactory
 * 注入假 Worker，按消息协议（log / error / done / 主线程 onerror）驱动各分支；
 * 超时分支用 opts.timeout 注入极短时限。
 */
describe("B-3 runJsSnippet（沙箱 JS 运行器）", () => {
  let win;
  let runJsSnippet;

  beforeAll(() => {
    expect(fs.existsSync(HTML), "agent-workbench.html 应存在").toBe(true);
    win = loadApp();
    runJsSnippet = win.runJsSnippet;
    expect(typeof runJsSnippet).toBe("function");
  });

  /** 构造假 Worker：记录 terminate 次数，提供 _emit/_fail 模拟 worker 内部消息与主线程 error */
  function makeFakeWorkerFactory(afterCreate) {
    const created = [];
    const factory = function (script) {
      const w = {
        _script: script,
        onmessage: null,
        onerror: null,
        terminateCount: 0,
        terminate() { this.terminateCount++; },
        _emit(data) { if (this.onmessage) this.onmessage({ data }); },
        _fail(message) { if (this.onerror) this.onerror({ message }); },
      };
      created.push(w);
      if (afterCreate) afterCreate(w);
      return w;
    };
    factory.created = created;
    return factory;
  }

  it("已加入 window.__test 导出", () => {
    expect(win.__test).toBeTruthy();
    expect(typeof win.__test.runJsSnippet).toBe("function");
  });

  it("正常运算：console.log(2+3) 经 log+done 协议返回 ok 与输出 5", async () => {
    const factory = makeFakeWorkerFactory((w) => {
      // 模拟胶水行为：用户代码 console.log(2+3) → log 消息 → 同步代码结束 → done 信号
      setTimeout(() => {
        w._emit({ type: "log", text: "5" });
        w._emit({ type: "done" });
      }, 0);
    });
    const res = await runJsSnippet("console.log(2 + 3)", { workerFactory: factory });
    expect(res.ok).toBe(true);
    expect(res.output).toContain("5");
    expect(typeof res.ms).toBe("number");
    // 结束后必须 terminate Worker（资源清理契约）
    expect(factory.created[0].terminateCount).toBe(1);
  });

  it("多条 log 按\n合并；对象参数 JSON 序列化由胶水侧完成（协议层保序拼接）", async () => {
    const factory = makeFakeWorkerFactory((w) => {
      setTimeout(() => {
        w._emit({ type: "log", text: "line-1" });
        w._emit({ type: "log", text: 'obj {"a":1}' });
        w._emit({ type: "done" });
      }, 0);
    });
    const res = await runJsSnippet("// demo", { workerFactory: factory });
    expect(res.ok).toBe(true);
    expect(res.output).toBe("line-1\nobj {\"a\":1}");
  });

  it("无任何输出且正常结束时返回友好占位文案", async () => {
    const factory = makeFakeWorkerFactory((w) => {
      setTimeout(() => w._emit({ type: "done" }), 0);
    });
    const res = await runJsSnippet("var x = 1;", { workerFactory: factory });
    expect(res.ok).toBe(true);
    expect(res.output).toBe("(无输出)");
  });

  it("运行时错误（胶水内 error 消息先行）→ ok:false 且携带错误信息", async () => {
    const factory = makeFakeWorkerFactory((w) => {
      setTimeout(() => {
        w._emit({ type: "error", text: "ReferenceError: x is not defined" });
        w._emit({ type: "done" });
      }, 0);
    });
    const res = await runJsSnippet("x.foo()", { workerFactory: factory });
    expect(res.ok).toBe(false);
    expect(res.output).toContain("ReferenceError");
  });

  it("语法错误：主线程 onerror 兜底捕获（胶水未执行场景）", async () => {
    const factory = makeFakeWorkerFactory((w) => {
      setTimeout(() => w._fail("SyntaxError: Unexpected token ')'"), 0);
    });
    const res = await runJsSnippet("syntax error(", { workerFactory: factory });
    expect(res.ok).toBe(false);
    expect(res.output).toContain("SyntaxError");
    expect(factory.created[0].terminateCount).toBe(1);
  });

  it("超时：注入 timeout 后返回 执行超时 且 ok:false（并已 terminate）", async () => {
    const factory = makeFakeWorkerFactory(() => { /* 永不响应 */ });
    const res = await runJsSnippet("while(true){}", { workerFactory: factory, timeout: 30 });
    expect(res.ok).toBe(false);
    expect(res.output).toContain("执行超时");
    expect(factory.created[0].terminateCount).toBe(1);
  }, 5000);

  it("workerFactory 抛异常 → 返回 Worker 创建失败，不产生未处理拒绝", async () => {
    const res = await runJsSnippet("1;", {
      workerFactory: () => { throw new Error("no worker in jsdom"); },
    });
    expect(res.ok).toBe(false);
    expect(res.output).toContain("Worker 创建失败");
    expect(res.output).toContain("no worker in jsdom");
  });

  it("jsdom 默认路径（无真实 Worker）：默认工厂抛错被捕获而非崩溃", async () => {
    const res = await runJsSnippet("console.log(1)");
    expect(res.ok).toBe(false);
    expect(res.output.length).toBeGreaterThan(0);
  });

  it("Worker 注入的源码包含 console 重写胶水、用户代码与 done 信号", async () => {
    let captured = "";
    const factory = makeFakeWorkerFactory(() => {});
    // 拦截工厂入参；注入短 timeout——本用例只验证源码注入形态，fake worker 不响应消息
    const spyFactory = (script) => { captured = script; return factory(script); };
    await runJsSnippet('console.log("hello")', { workerFactory: spyFactory, timeout: 50 });
    expect(captured).toContain("self.console=");
    expect(captured).toContain('console.log("hello")');
    expect(captured).toContain("self.postMessage({type:'done'})");
  });
});