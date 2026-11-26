import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const workerSource = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "service-worker.js"), "utf8");
const workerUrl = "https://example.test/service-worker.js";

function loadWorker({ network, offline = false, cached = null } = {}) {
  const listeners = {};
  const puts = [];
  const cache = {
    put: (request, response) => { puts.push({ request, response }); return Promise.resolve(); },
    keys: () => Promise.resolve([]),
    match: () => Promise.resolve(cached)
  };
  class WorkerRequest {
    constructor(input, init = {}) {
      this.url = new URL(input, workerUrl).href;
      this.method = init.method || "GET";
      this.cache = init.cache || "default";
      this.mode = init.mode || "cors";
      this.credentials = init.credentials || "same-origin";
      this.headers = new Headers(init.headers || {});
    }
  }
  const response = network || new Response("offline", { status: 200 });
  Object.defineProperty(response, "type", { value: "basic" });
  const sandbox = {
    URL,
    Headers,
    Request: WorkerRequest,
    Response,
    console,
    caches: { open: () => Promise.resolve(cache), match: cache.match },
    fetch: () => offline ? Promise.reject(new Error("offline")) : Promise.resolve(response),
    self: {
      location: { origin: "https://example.test", href: workerUrl },
      addEventListener: (type, handler) => { listeners[type] = handler; },
      clients: { claim: () => Promise.resolve() },
      skipWaiting: () => Promise.resolve()
    }
  };
  vm.runInNewContext(workerSource, sandbox);
  return {
    puts,
    request: async ({ cacheMode = "no-store", url = "https://example.test/agent-workbench.html?wb_update_check=1" } = {}) => {
      let respondWith;
      listeners.fetch({
        request: {
          url,
          method: "GET",
          mode: "cors",
          cache: cacheMode,
          credentials: "omit",
          headers: new Headers()
        },
        respondWith: (promise) => { respondWith = promise; }
      });
      const result = await respondWith;
      await new Promise((resolve) => setImmediate(resolve));
      return result;
    }
  };
}

describe("Service Worker 版本探针缓存边界", () => {
  it.each(["no-store", "default"])("%s 探针的线上响应不写入 Cache Storage", async (cacheMode) => {
    const worker = loadWorker({ network: new Response("online") });
    const response = await worker.request({ cacheMode });
    expect(response.status).toBe(200);
    expect(worker.puts).toEqual([]);
  });

  it.each(["no-store", "default"])("%s 探针离线时不返回缓存页面", async (cacheMode) => {
    const worker = loadWorker({ offline: true, cached: new Response("cached") });
    const response = await worker.request({ cacheMode });
    expect(response.status).toBe(504);
  });

  it("普通 network-first 请求仍缓存线上响应", async () => {
    const worker = loadWorker({ network: new Response("asset"), cached: null });
    const response = await worker.request({ cacheMode: "default", url: "https://example.test/data.json" });
    expect(response.status).toBe(200);
    expect(worker.puts).toHaveLength(2);
  });
});
