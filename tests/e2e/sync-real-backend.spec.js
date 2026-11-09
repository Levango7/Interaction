/**
 * sync-real-backend.spec.js —— DL-O01（2026-11-09）：客户端 → 真后端的增量往返
 * ----------------------------------------------------------------------------
 * 此前「客户端→真 server」这一段零覆盖：
 *   · tests/e2e/sync-contract.spec.js 验的是 mock 后端（不实现 POST /changes）；
 *   · server/verify/incremental-check.cjs 验的是服务端合并语义（不经客户端）；
 *   · 单元测试把 apiFetch stub 掉（测不到任何网络面）。
 * 结果「开关切了路径」与「真上传成功」两件事从未被同一条用例区分开。
 *
 * 本 spec 的做法：起**真 server 进程**（隔离 DATAFILE + 占位密钥 + 屏蔽本机
 * config.json，配方同 server/verify/incremental-check.cjs），前面再架一层
 * **记录型反代** —— 页面所有 /api/* 请求先落日志（method/path/body）再原样
 * 转发。于是「客户端代码真的发出了 POST /api/sync/changes、body 是契约形状、
 * 服务端真的把它合并进快照」三件事都有请求级证据，而不是看数据文件猜。
 *
 * 两条用例：
 *   ① 增量开：种子任务走应用自己的 save() 主入口入变更日志 → doSync →
 *      POST /changes 携带该键（证据一）→ 真服务端快照里读回同值（证据二，
 *      不是「请求发出去」就算数）→ 客户端水位推进 + changelog 清空（证据三）
 *      → 本轮无全量 PUT（证据四：开关真的切了路径）。
 *   ② 增量关（对照）：同一 doSync 只出现 PUT /snapshot、零 POST /changes ——
 *      证明①区分的是开关，而不是「网络碰巧通」。
 *
 * 默认跳过，E2E=1 才跑（与其余 spec 一致）。视口无关，只在 desktop 项目跑。
 */
const { test, expect } = require("./_fixture.js");
const http = require("node:http");
const net = require("node:net");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

test.skip(!process.env.E2E, "set E2E=1 to run");

const ROOT = path.join(__dirname, "..", "..");
const PREFIX = "wb_agent_";

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => resolve(p)); });
    s.on("error", reject);
  });
}

/** 真 server 进程：隔离数据文件 + 占位密钥 + 屏蔽本机 config.json（配方同 incremental-check.cjs）。 */
function startRealServer() {
  return new Promise(async (resolve, reject) => {
    let settled = false;
    let port;
    try { port = await freePort(); } catch (e) { return reject(e); }
    const dataFile = path.join(os.tmpdir(), "wb-sync-real-" + process.pid + "-" + Date.now() + ".json");
    const userCfg = path.join(os.tmpdir(), "wb-sync-real-userconfig-" + process.pid + ".json");
    const child = spawn(process.execPath, ["src/index.js"], {
      cwd: path.join(ROOT, "server"),
      env: {
        ...process.env,
        PORT: String(port),
        ALLOW_PLACEHOLDER_SECRETS: "true",
        AGENT_WORKBENCH_USER_CONFIG: userCfg,   /* 不存在的路径 → 屏蔽本机 config.json */
        DATAFILE: dataFile,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let boot = "";
    child.stdout.on("data", (d) => { boot += d; });
    child.stderr.on("data", (d) => { boot += d; });
    child.on("exit", (code) => { if (!settled) reject(new Error("server exited early code=" + code + "\n" + boot)); });
    const deadline = Date.now() + 15000;
    (function poll() {
      fetch("http://127.0.0.1:" + port + "/api/health")
        .then((r) => r.json())
        .then((j) => {
          if (j && j.name === "agent-workbench-auth") { settled = true; resolve({ child, port, dataFile }); }
          else if (Date.now() > deadline) reject(new Error("server boot timeout\n" + boot));
          else setTimeout(poll, 200);
        })
        .catch(() => { if (Date.now() > deadline) reject(new Error("server boot timeout\n" + boot)); else setTimeout(poll, 200); });
    })();
  });
}

/**
 * 记录型反代 + 静态托管：页面与 API 同 origin（CSP connect-src 'self' 放行），
 * /api/* 先记一笔（method/path/body）再原样转给真 server。
 */
function startStaticProxy(targetPort) {
  const log = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const body = Buffer.concat(chunks);
      if (req.url.indexOf("/api/") === 0) {
        log.push({ method: req.method, path: (req.url || "").split("?")[0], body: body.length ? body.toString("utf8") : "" });
        const headers = Object.assign({}, req.headers);
        delete headers.host;
        delete headers["content-length"];
        const up = http.request({ host: "127.0.0.1", port: targetPort, method: req.method, path: req.url, headers }, (ur) => {
          res.writeHead(ur.statusCode, ur.headers);
          ur.pipe(res, { end: true });
        });
        up.on("error", (e) => {
          if (!res.headersSent) res.writeHead(502, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "proxy: " + e.message }));
        });
        up.end(body);
        return;
      }
      const rel = (req.url || "/").split("?")[0].replace(/^\/+/, "");
      const file = path.join(ROOT, rel === "" ? "agent-workbench.html" : rel);
      if (file.indexOf(ROOT) !== 0 || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404, { "content-type": "text/plain" });
        res.end("not found");
        return;
      }
      const ext = path.extname(file);
      const mime = ext === ".html" ? "text/html; charset=utf-8"
        : ext === ".js" ? "text/javascript; charset=utf-8"
        : ext === ".css" ? "text/css; charset=utf-8"
        : "application/octet-stream";
      try { res.writeHead(200, { "content-type": mime }); res.end(fs.readFileSync(file)); }
      catch (e) { res.writeHead(500); res.end(String(e)); }
    });
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port, log })));
}

async function openApp(page, port) {
  await page.goto("http://127.0.0.1:" + port + "/agent-workbench.html");
  await page.waitForSelector("#side", { timeout: 15_000 });
  await page.waitForFunction(
    () => { try { return document.querySelectorAll("#side .nav-item").length >= 17; } catch (e) { return false; } },
    null,
    { timeout: 15_000 }
  );
}

function describeLog(log) {
  return log.map((r) => r.method + " " + r.path + (r.body ? " " + r.body.slice(0, 120) : "")).join("\n  ");
}

test.describe("云同步真后端往返（DL-O01）", () => {
  test("增量开：doSync 真发 POST /api/sync/changes 且服务端合并落盘", async ({ page }) => {
    const srv = await startRealServer();
    const proxy = await startStaticProxy(srv.port);
    try {
      const email = "dl-o01-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) + "@example.com";
      const pw = "DlO01-Pw-123";
      const seeded = [{ id: "dl-o01-t1", title: "增量真上传证据任务", done: false, updatedAt: new Date().toISOString() }];

      await page.addInitScript(({ apiBase }) => {
        localStorage.setItem("wb_agent_cfg", JSON.stringify({ enabled: false, apiBase: apiBase, syncIncremental: true }));
      }, { apiBase: "http://127.0.0.1:" + proxy.port });
      await openApp(page, proxy.port);

      const reg = await page.evaluate(({ email, pw }) => window.apiRegister(email, pw, "DL-O01"), { email, pw });
      expect(reg.ok, "注册应成功（真后端）：" + JSON.stringify(reg)).toBe(true);

      /* 用应用自己的持久化主入口写种子任务 —— 变更日志由 save() 内部 _chlogRecord 自动记，
         不手搓内部键形状；这同时证明「开关开时写路径真的在产增量原料」。 */
      await page.evaluate(({ key, seeded }) => { save(key, seeded); }, { key: PREFIX + "tasks", seeded });
      await page.evaluate(() => window.doSync());

      /* 证据一：客户端真的发出了增量请求，body 是契约形状 */
      const posts = proxy.log.filter((r) => r.method === "POST" && r.path === "/api/sync/changes");
      expect(posts.length, "应有 POST /api/sync/changes：\n  " + describeLog(proxy.log)).toBeGreaterThan(0);
      const withTasks = posts.filter((r) => {
        try {
          return (JSON.parse(r.body).changes || []).some((c) => c.k === PREFIX + "tasks" && c.v === JSON.stringify(seeded));
        } catch (e) { return false; }
      });
      expect(withTasks.length, "POST /changes 的 body.changes 应携带种子任务：\n  " + posts.map((p) => p.body.slice(0, 200)).join("\n  ")).toBeGreaterThan(0);
      expect(Number(JSON.parse(withTasks[0].body).since) || 0, "since 应为当前水位（首轮是 0）").toBeGreaterThanOrEqual(0);

      /* 证据二：真服务端把它合并进快照（不是「请求发出去」就算数）。
         注：localStorage 里的 token 是密文（_restoreTokens 要解密），
         这里用应用自己的 apiGetHeaders() 取明文授权头，再从 Node 侧直连真 server 读回。 */
      const authHeader = await page.evaluate(() => window.apiGetHeaders().Authorization);
      expect(authHeader, "register 已签发 token，应用应持有明文 Authorization 头").toBeTruthy();
      const snap = await fetch("http://127.0.0.1:" + srv.port + "/api/sync/snapshot", {
        headers: { authorization: authHeader },
      }).then((r) => r.json());
      expect(snap.ok, "GET /api/sync/snapshot 应 ok：" + JSON.stringify(snap)).toBe(true);
      expect(JSON.parse(snap.data.snapshot[PREFIX + "tasks"])).toEqual(seeded);

      /* 证据三：客户端水位推进（token 落盘 + lastPushAt）+ changelog 清空 */
      const meta = await page.evaluate(() => JSON.parse(localStorage.getItem("wb_agent_sync_meta") || "{}"));
      expect(Number(meta.syncToken) || 0, "syncToken 应推进到服务端权威水位").toBeGreaterThan(0);
      expect(Number(meta.lastPushAt) || 0, "lastPushAt 应被 doSync 更新").toBeGreaterThan(0);
      const chlog = await page.evaluate(() => (typeof getSyncChangelog === "function" ? getSyncChangelog().length : -1));
      expect(chlog, "增量成功后变更日志应清空（收敛游标）").toBe(0);

      /* 证据四（区分「开关切了路径」与「真上传」）：增量开时本轮不该有全量 PUT */
      const puts = proxy.log.filter((r) => r.method === "PUT" && r.path === "/api/sync/snapshot");
      expect(puts.length, "增量开时不应出现全量 PUT：\n  " + describeLog(proxy.log)).toBe(0);
    } finally {
      srv.child.kill("SIGTERM");
      await new Promise((r) => proxy.server.close(r));
      try { fs.unlinkSync(srv.dataFile); } catch (e) { /* 已清理 */ }
    }
  });

  test("增量关（对照）：同一 doSync 只走全量 PUT、零 POST /changes", async ({ page }) => {
    const srv = await startRealServer();
    const proxy = await startStaticProxy(srv.port);
    try {
      const email = "dl-o01-full-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) + "@example.com";
      const pw = "DlO01-Pw-123";
      const seeded = [{ id: "dl-o01-t2", title: "全量对照任务", done: true, updatedAt: new Date().toISOString() }];

      await page.addInitScript(({ apiBase }) => {
        localStorage.setItem("wb_agent_cfg", JSON.stringify({ enabled: false, apiBase: apiBase }));
      }, { apiBase: "http://127.0.0.1:" + proxy.port });
      await openApp(page, proxy.port);

      const reg = await page.evaluate(({ email, pw }) => window.apiRegister(email, pw, "DL-O01"), { email, pw });
      expect(reg.ok, "注册应成功（真后端）：" + JSON.stringify(reg)).toBe(true);

      await page.evaluate(({ key, seeded }) => { save(key, seeded); }, { key: PREFIX + "tasks", seeded });
      await page.evaluate(() => window.doSync());

      const puts = proxy.log.filter((r) => r.method === "PUT" && r.path === "/api/sync/snapshot");
      expect(puts.length, "开关关应走全量 PUT：\n  " + describeLog(proxy.log)).toBeGreaterThan(0);
      const putBody = JSON.parse(puts[puts.length - 1].body);
      expect(JSON.parse(putBody.snapshot[PREFIX + "tasks"])).toEqual(seeded);
      expect(proxy.log.filter((r) => r.method === "POST" && r.path === "/api/sync/changes").length,
        "开关关时不应出现 POST /changes（区分的是开关，不是网络）").toBe(0);
    } finally {
      srv.child.kill("SIGTERM");
      await new Promise((r) => proxy.server.close(r));
      try { fs.unlinkSync(srv.dataFile); } catch (e) { /* 已清理 */ }
    }
  });
});
