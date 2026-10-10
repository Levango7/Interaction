/* 网页抓取代理检查（/api/tools/fetch，v3.7.111）—— SSRF 承重墙的实证
 *
 * 运行：cd server && node verify/tools-fetch-check.cjs
 *
 * 端点补齐的背景：客户端的 web_fetch 直连被 CORS 拦时会退到该端点，而 ac1114a 那份后端
 * 从未实现它（与 /api/sync/snapshot 同形态）。本脚本钉住三件事：
 *   · **真的能代抓**（按客户端的真实调用：GET + ?url=；断言代回了目标内容，而不只是 200）；
 *   · **SSRF 防线**：拒 userinfo / 私网 / 云元数据 / 重定向跳内网；默认连回环都不放行
 *     （白名单是显式逃生舱，默认空）；
 *   · ** titular 边界**：体积封顶 413、超时 504、无 token 401。
 * 目标用本机自建的 http 服务（allowHosts 放开 127.0.0.1），不依赖外网。
 */
"use strict";
const { spawn } = require("node:child_process");
const http = require("node:http");
const path = require("node:path");

const SRV = path.join(__dirname, "..");
const PORT = "4577";
const TARGET_PORT = 4599;
const BASE = "http://127.0.0.1:" + PORT;
const TARGET = "http://127.0.0.1:" + TARGET_PORT;

/* ---- 目标服务（被代理抓的那一端）---- */
const BIG = "x".repeat(2 * 1024 * 1024);
const target = http.createServer((req, res) => {
  const u = req.url || "/";
  if (u === "/ok") { res.writeHead(200, { "Content-Type": "text/plain" }); res.end("hello-tools-fetch"); return; }
  if (u === "/html") { res.writeHead(200, { "Content-Type": "text/html" }); res.end("<html><title>T</title><body>hi</body></html>"); return; }
  if (u === "/redir") { res.writeHead(302, { Location: "/ok" }); res.end(); return; }
  if (u === "/redir-private") { res.writeHead(302, { Location: "http://10.0.0.1/secret" }); res.end(); return; }
  if (u === "/big") { res.writeHead(200, { "Content-Type": "text/plain" }); res.end(BIG); return; }
  if (u === "/slow") { setTimeout(() => { res.writeHead(200); res.end("late"); }, 3000); return; }
  res.writeHead(404); res.end("no");
});

function startServer(extraEnv) {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, ["src/index.js"], {
      cwd: SRV,
      env: Object.assign({}, process.env, {
        PORT, ALLOW_PLACEHOLDER_SECRETS: "true",
        TOOLS__FETCH__ALLOWHOSTS: "127.0.0.1",   // 显式逃生舱：本脚本的目标在回环上
        TOOLS__FETCH__TIMEOUTMS: "1000",         // 压低超时，让超时用例秒级跑完
        TOOLS__FETCH__MAXBYTES: "1048576"
      }, extraEnv || {}),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    p.stdout.on("data", (d) => { out += d.toString(); });
    p.stderr.on("data", (d) => { out += d.toString(); });
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true; clearInterval(tick);
      reject(new Error("启动超时\n子进程输出：[" + out + "]"));
    }, 20000);
    const tick = setInterval(async () => {
      if (settled) return;
      try {
        const j = await (await fetch(BASE + "/api/health")).json();
        if (j && j.name === "agent-workbench-auth") { settled = true; clearTimeout(timer); clearInterval(tick); resolve(p); }
      } catch (_e) { /* 未就绪 */ }
    }, 200);
    p.on("error", (err) => { if (settled) return; settled = true; clearTimeout(timer); clearInterval(tick); reject(new Error("spawn 失败：" + err.message)); });
    p.on("exit", (code) => {
      if (settled || code === 0 || code === null) return;
      settled = true; clearTimeout(timer); clearInterval(tick);
      reject(new Error("进程退出 code=" + code + "\n子进程输出：[" + out + "]"));
    });
  });
}

let TOKEN = null;
async function hit(method, urlPath, body, opts) {
  const headers = {};
  if (body) headers["Content-Type"] = "application/json";
  const wantAuth = opts ? opts.auth !== false : true;
  if (wantAuth && TOKEN) headers["Authorization"] = "Bearer " + TOKEN;
  const r = await fetch(BASE + urlPath, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let j = null;
  try { j = await r.json(); } catch (_e) { /* 非 JSON */ }
  return { status: r.status, json: j };
}
const fetchUrl = async (u, opts) => hit("GET", "/api/tools/fetch?url=" + encodeURIComponent(u), null, opts);

let passN = 0, failN = 0;
function check(label, cond, detail) {
  if (cond) { passN++; console.log("  PASS  " + label.padEnd(52) + (detail ? "| " + detail : "")); }
  else { failN++; console.log("  FAIL  " + label.padEnd(52) + (detail ? "| " + detail : "")); }
}
function group(name) { console.log("\n" + name); }

(async () => {
  await new Promise((r) => target.listen(TARGET_PORT, "127.0.0.1", r));
  const mail = "tools" + Date.now() + "@example.com";
  let proc = await startServer();
  try {
    const reg = await hit("POST", "/api/auth/register", { email: mail, password: "abcd12345" }, { auth: false });
    TOKEN = reg.json && reg.json.data && reg.json.data.accessToken;

    group("① 真的能代抓（按客户端真实调用：GET + ?url=）");
    const t1 = await fetchUrl(TARGET + "/ok");
    check("200 且代回目标原文", t1.status === 200 && t1.json && t1.json.ok === true && t1.json.data.text === "hello-tools-fetch", "text=" + (t1.json && t1.json.data && t1.json.data.text));
    const t1b = await fetchUrl(TARGET + "/html");
    check("HTML 原样代回（去标签是客户端的活）", !!t1b.json && !!t1b.json.data && /<title>T<\/title>/.test(t1b.json.data.text || ""));

    group("② 入站校验：协议 / userinfo / 坏 URL");
    check("非 http(s) 协议 → 400 http_https_only", (await fetchUrl("ftp://127.0.0.1/x")).status === 400);
    const ui = await fetchUrl("http://user:pass@" + "127.0.0.1:" + TARGET_PORT + "/ok");
    check("带 userinfo → 400 userinfo_forbidden", ui.status === 400 && ui.json && ui.json.error === "userinfo_forbidden", ui.json && ui.json.error);
    check("坏 URL → 400 bad_url", (await fetchUrl("not-a-url")).status === 400);

    group("③ SSRF：私网 / 云元数据默认一律拒绝");
    for (const [label, u] of [["私网 10/8", "http://10.0.0.1/secret"], ["私网 192.168", "http://192.168.1.1/"], ["链路本地（云元数据）", "http://169.254.169.254/latest/meta-data"], [".local", "http://foo.local/"]]) {
      const r = await fetchUrl(u);
      check("拒绝 " + label, r.status === 400 && r.json && r.json.error === "forbidden_host", r.json && r.json.error);
    }

    group("④ 默认连回环都不放行（白名单是显式逃生舱，默认空）");
    try { proc.kill(); } catch (e) { /* 已退出 */ }
    await new Promise((r) => setTimeout(r, 800));
    proc = await startServer({ TOOLS__FETCH__ALLOWHOSTS: "" });
    TOKEN = (await hit("POST", "/api/auth/login", { email: mail, password: "abcd12345" }, { auth: false })).json.data.accessToken;
    const noAllow = await fetchUrl(TARGET + "/ok");
    check("无白名单时 127.0.0.1 也拒", noAllow.status === 400 && noAllow.json && noAllow.json.error === "forbidden_host", noAllow.json && noAllow.json.error);

    group("⑤ 白名单显式放行（证明③④的拒绝来自主机检查，不是通路问题）");
    try { proc.kill(); } catch (e) { /* 已退出 */ }
    await new Promise((r) => setTimeout(r, 800));
    proc = await startServer();
    TOKEN = (await hit("POST", "/api/auth/login", { email: mail, password: "abcd12345" }, { auth: false })).json.data.accessToken;
    check("白名单含 127.0.0.1 后同一目标通", (await fetchUrl(TARGET + "/ok")).status === 200);

    group("⑥ 重定向：手动跟随，且每一跳都重新校验");
    const r6 = await fetchUrl(TARGET + "/redir");
    check("站内 302 正常跟随并拿到最终内容", r6.status === 200 && r6.json.data.text === "hello-tools-fetch");
    const r7 = await fetchUrl(TARGET + "/redir-private");
    check("302 跳私网 → 400 forbidden_redirect（不跟随）", r7.status === 400 && r7.json && r7.json.error === "forbidden_redirect", r7.json && r7.json.error);

    group("⑦ 体积 / 超时 / 鉴权边界");
    check("超过 maxBytes → 413 too_large", (await fetchUrl(TARGET + "/big")).status === 413);
    check("超过 timeoutMs → 504", (await fetchUrl(TARGET + "/slow")).status === 504);
    const noTok = await fetchUrl(TARGET + "/ok", { auth: false });
    check("无 token → 401（不做开放代理）", noTok.status === 401 && noTok.json && noTok.json.error === "no_token");
    const missing = await hit("GET", "/api/tools/fetch", null, null);
    check("缺 url 参数 → 400 url_required", missing.status === 400 && missing.json && missing.json.error === "url_required");
  } finally {
    try { proc.kill(); } catch (e) { /* 已退出 */ }
    target.close();
  }

  console.log("\n=== 汇总：" + passN + "/" + (passN + failN) + " 通过 ===");
  process.exit(failN ? 1 : 0);
})().catch((e) => {
  console.error("验证脚本异常：", e);
  target.close();
  process.exit(2);
});
