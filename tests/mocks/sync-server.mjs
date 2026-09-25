/**
 * 云同步契约的 mock 后端 —— 供 tests/e2e/sync-contract.spec.js 使用
 * ----------------------------------------------------------------------------
 * 为什么要真起一个 HTTP 服务而不是 mock fetch：被测链路里
 * `apiFetch()` 的 401→refresh→重试、`offline` 判定（fetch 抛 TypeError）、
 * CORS 预检、以及 `apiGetSnapshot()` 对 `data.snapshot` 的形状要求，
 * 全都只有真 fetch 才走得到。mock 掉 fetch 就等于只测了自己写的分支。
 *
 * 端口用 0（临时端口）：Playwright 的三个 project 会并行跑，写死端口必然撞车。
 * 监听 file:// 页面发起的跨源请求（Origin: null），故必须给 CORS 头 + 处理 OPTIONS。
 */
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/* 不能用 import.meta.url：Playwright 把 .spec.js 按 CJS 转译后再加载相邻 .mjs，
   届时 `import.meta` 会直接 SyntaxError（实测）。npx playwright test 的工作目录就是仓库根。 */
const ROOT = process.cwd();
if (!existsSync(join(ROOT, "agent-workbench.html"))) {
  throw new Error("sync-server: 工作目录下找不到 agent-workbench.html（cwd=" + ROOT + "）");
}

const readBody = (req) => new Promise((resolve) => {
  let s = "";
  req.on("data", (c) => { s += c; });
  req.on("end", () => resolve(s));
});

/**
 * @returns {Promise<{url:string, port:number, requests:Array, state:Object, setBehaviors:(b:Object)=>void, close:()=>Promise<void>}>}
 */
export function startSyncMock() {
  /* 服务端持有的"云端数据" */
  const state = { snapshot: null, updatedAt: 0 };
  /* 客户端行为记录，供断言"真的发出了什么" */
  const requests = [];
  /* 可注入的行为开关（测 401/500/404 等异常路径） */
  const behaviors = { requireAuth: false, putFails: 0, getEmpty: false, refreshFails: false };
  let accessSeq = 0;

  const server = createServer(async (req, res) => {
    const body = await readBody(req);
    const auth = req.headers.authorization || "";
    requests.push({ method: req.method, path: req.url, auth, body, at: Date.now() });

    const send = (code, obj) => {
      res.writeHead(code, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,PUT,POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      });
      res.end(obj === undefined ? "" : JSON.stringify(obj));
    };

    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,PUT,POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Max-Age": "0",
      });
      res.end();
      return;
    }

    const path = (req.url || "").split("?")[0];

    /* 同源托管应用本身：让页面与 API 同 origin，这样 `connect-src 'self' https:` 就够用，
       不必为了测试去放宽 CSP（实测放宽回环会让 tablet 的 workflow e2e 稳定挂住）。 */
    if (req.method === "GET" && (path === "/" || path === "/agent-workbench.html")) {
      try {
        const buf = readFileSync(join(ROOT, "agent-workbench.html"));
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(buf);
      } catch (e) {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("app not built? run `npm run src:inject` first: " + e.message);
      }
      return;
    }

    if (path === "/api/health") return send(200, { ok: true });

    if (path === "/api/auth/login" && req.method === "POST") {
      let p = {}; try { p = JSON.parse(body || "{}"); } catch (e) { /* 容忍坏 body */ }
      if (!p.email) return send(400, { error: "email required" });
      accessSeq++;
      return send(200, {
        accessToken: "mock-access-" + accessSeq,
        refreshToken: "mock-refresh-1",
        user: { id: 7, email: p.email, name: "Mock User" },
      });
    }

    if (path === "/api/auth/refresh" && req.method === "POST") {
      if (behaviors.refreshFails) return send(403, { error: "refresh disabled in mock" });
      accessSeq++;
      return send(200, { accessToken: "mock-access-" + accessSeq });
    }

    if (path === "/api/sync/snapshot") {
      if (behaviors.requireAuth && auth !== "Bearer mock-access-" + accessSeq) {
        return send(401, { error: "unauthorized" });
      }
      if (req.method === "GET") {
        if (behaviors.getEmpty || !state.snapshot) return send(404, { error: "no snapshot" });
        return send(200, { snapshot: state.snapshot, updatedAt: state.updatedAt });
      }
      if (req.method === "PUT") {
        if (behaviors.putFails > 0) { behaviors.putFails--; return send(500, { error: "mock put failure" }); }
        let p = {}; try { p = JSON.parse(body || "{}"); } catch (e) { return send(400, { error: "invalid json" }); }
        /* 契约要求：body 必须是 { snapshot, updatedAt }，且快照内含 _deviceMeta */
        if (!p.snapshot || typeof p.snapshot !== "object") return send(400, { error: "snapshot required" });
        if (typeof p.updatedAt !== "number") return send(400, { error: "updatedAt must be number" });
        if (!p.snapshot._deviceMeta || !p.snapshot._deviceMeta.deviceId) return send(400, { error: "_deviceMeta.deviceId required" });
        state.snapshot = p.snapshot;
        state.updatedAt = p.updatedAt;
        return send(200, { ok: true, updatedAt: p.updatedAt });
      }
      return send(405, { error: "method not allowed" });
    }

    return send(404, { error: "unknown path " + path });
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      resolve({
        port,
        url: "http://127.0.0.1:" + port,
        requests,
        state,
        setBehaviors: (b) => Object.assign(behaviors, b),
        /* 让客户端手里的 access token 立刻作废（服务端只认最新签发的那枚）——
           用来触发 apiFetch 的「401 → 自动 refresh → 重试一次」这条真实路径 */
        advanceToken: () => { accessSeq++; return "mock-access-" + accessSeq; },
        reset: () => { requests.length = 0; state.snapshot = null; state.updatedAt = 0; },
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}
