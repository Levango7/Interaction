/* server/src/tools-fetch.js —— 网页抓取代理（web_fetch 的 CORS 兜底，v3.7.111）
 *
 * 为什么补：客户端 `src/ai-tools.js` 的 `toolWebFetch` 在浏览器直连被 CORS 拦断时，会退到
 * `cfg.fetchProxy`（独立代理）或 `cfg.apiBase + /api/tools/fetch`（复用自建后端）；而
 * `ac1114a` 那份后端**从未实现这个端点** —— 与 `/api/sync/snapshot` 同一形态
 * （「客户端一直在调、后端没有」）。现补齐，shape 严格对齐客户端的真实调用
 * （`GET /api/tools/fetch?url=<编码后 URL>`，客户端去标签、服务端只回原文）。
 *
 * 安全口径（评估文档 §五 点名的承重墙标准，与 ics-fetch / notify-webhook 同一套）：
 *   · URL 只由用户自己填写；**必须 Bearer 鉴权** —— 不做开放代理（否则谁都能拿它当跳板）；
 *   · 拒 userinfo；拒回环 / 私网 / 链路本地 / .local（`_netHostForbidden`，
 *     与 electron/main.js 的同名函数同口径；两侧运行时不同，刻意各自一份）；
 *   · **手动跟随重定向，且每一跳都重新校验**：`redirect:"error"` 会让正常站点全部不可用，
 *     `redirect:"follow"` 则 302 一跳就能绕过主机校验（SSRF 的经典绕过）；
 *   · `cfg.tools.fetch.allowHosts` 是**显式白名单**（默认空）：只为「内网部署 + 联调」开口子，
 *     列进白名单的主机跳过私网检查 —— 显式 opt-in，默认一切私网目标一律拒绝；
 *   · 响应 ≤ maxBytes、超时、日志只记主机与状态码；不转发任何客户端认证头。
 */
"use strict";

function toolsFetchRouter(cfg, store) {
  const express = require("express");
  const router = express.Router();
  const jwt = require("jsonwebtoken");

  const ok = (res, data) => res.json({ ok: true, data: data || {} });
  const fail = (res, status, error, data) => res.status(status || 400).json({ ok: false, error: error, data: data || {} });

  /* 鉴权：与 sync.js 同款（复制而非抽取 —— 抽公共模块要动两个已验证文件，见 auth.js 同款注释） */
  const am = (req, res, next) => {
    const h = req.header("authorization") || "";
    const token = h.startsWith("Bearer ") ? h.slice(7) : null;
    if (!token) return res.status(401).json({ ok: false, error: "no_token" });
    try { req.user = jwt.verify(token, cfg.jwt.accessSecret); next(); }
    catch (e) { return res.status(401).json({ ok: false, error: "invalid_token" }); }
  };

  const fcfg = (cfg.tools && cfg.tools.fetch) || {};
  const MAX_BYTES = Number(fcfg.maxBytes) || 1024 * 1024;
  const TIMEOUT_MS = Number(fcfg.timeoutMs) || 10000;
  const MAX_REDIRECTS = Number(fcfg.maxRedirects) || 3;
  /* allowHosts 容忍数组或逗号分隔字符串（env 覆盖只会给字符串）；空 = 不放行任何私网目标 */
  const ALLOW = new Set((function () {
    const a = fcfg.allowHosts;
    const list = Array.isArray(a) ? a : (typeof a === "string" ? a.split(",") : []);
    return list.map((h) => String(h || "").trim().toLowerCase()).filter((h) => !!h);
  })());

  /* 与 electron/main.js `_netHostForbidden` 同口径（挡回环/私网/链路本地/.local） */
  function _netHostForbidden(host) {
    let h = String(host || "").toLowerCase();
    if (!h) return true;
    /* v3.7.129（R-24 收口）：判定前先**规范化表示法**。WHATWG URL 不做这件事 ——
       `new URL("http://[::ffff:7f00:1]/").hostname` 仍是 `[::ffff:7f00:1]`
       （展开写法 `0:0:0:0:0:ffff:7f00:1`、点分写法 `::ffff:127.0.0.1`、大写
       `::FFFF:7F00:1` 也都归一成这个压缩形态），而下面的私网规则只认点分/单冒号，
       于是这类地址绕过全部规则直达回环 —— 实测 `[::ffff:7f00:1]` = 127.0.0.1、
       `[::ffff:a9fe:a9fe]` = 169.254.169.254（云元数据）。门禁
       `scripts/lint-server-ssrf.mjs` 覆盖 6 种映射形态，与服务端同口径的
       `electron/main.js` 那份必须一起过。 */
    h = h.replace(/^\[|\]$/g, "");
    const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(h);
    if (mapped) {
      const hi = parseInt(mapped[1], 16), lo = parseInt(mapped[2], 16);
      h = ((hi >> 8) & 255) + "." + (hi & 255) + "." + ((lo >> 8) & 255) + "." + (lo & 255);
    } else {
      const dotted = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(h);
      if (dotted) h = dotted[1];
    }
    if (h === "localhost" || /\.local$/.test(h) || /\.localhost$/.test(h) || /\.internal$/.test(h)) return true;
    if (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h) || /^0\./.test(h)) return true;
    /* CGNAT 100.64/10（RFC 6598）：同属「能到达运营商内网」，R-24 点名的另一处缺口 */
    const cg = /^100\.(\d+)\./.exec(h);
    if (cg && +cg[1] >= 64 && +cg[1] <= 127) return true;
    const p2 = /^172\.(\d+)\./.exec(h);
    if (p2 && +p2[1] >= 16 && +p2[1] <= 31) return true;
    if (/^\[?::1\]?$/.test(h) || /^f[cd][0-9a-f]{2}:/i.test(h) || /^fe[89ab][0-9a-f]:/i.test(h)) return true;
    return false;
  }
  /** 主机是否放行：显式白名单 > 私网检查（白名单是联调/内网部署的显式逃生舱） */
  function hostAllowed(u) {
    const h = String(u.hostname || "").toLowerCase();
    if (ALLOW.has(h)) return true;
    return !_netHostForbidden(h);
  }
  function checkUrl(raw) {
    let u;
    try { u = new URL(String(raw || "")); } catch (err) { return { error: "bad_url" }; }
    if (u.protocol !== "https:" && u.protocol !== "http:") return { error: "http_https_only" };
    if (u.username || u.password) return { error: "userinfo_forbidden" };
    if (!hostAllowed(u)) return { error: "forbidden_host" };
    return { url: u };
  }

  router.get("/fetch", am, async (req, res) => {
    const raw = String((req.query && req.query.url) || "").trim();
    if (!raw) return fail(res, 400, "url_required");
    let cur = checkUrl(raw);
    if (cur.error) return fail(res, 400, cur.error);
    try {
      for (let hop = 0; ; hop++) {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
        let r;
        try {
          r = await fetch(cur.url.href, {
            method: "GET",
            redirect: "manual",          // 手动跟随：每一跳都要重新过 hostAllowed
            signal: ctrl.signal,
            headers: { "Accept": "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8" }
          });
        } catch (err) {
          clearTimeout(timer);
          const msg = (err && err.name === "AbortError") ? "timeout" : ((err && err.message) || String(err));
          console.log("[tools-fetch] host=" + cur.url.hostname + " error=" + msg);
          return fail(res, 504, msg);
        }
        clearTimeout(timer);
        const loc = r.headers.get("location");
        if (r.status >= 300 && r.status < 400 && loc) {
          if (hop >= MAX_REDIRECTS) return fail(res, 502, "too_many_redirects");
          let next;
          try { next = new URL(loc, cur.url.href); } catch (err) { return fail(res, 502, "bad_redirect"); }
          const checked = checkUrl(next.href);
          if (checked.error) return fail(res, 400, "forbidden_redirect");   // 302 跳内网 = 拒绝，不跟随
          cur = checked;
          continue;
        }
        console.log("[tools-fetch] host=" + cur.url.hostname + " status=" + r.status);
        if (r.status === 204 || r.status === 304) return ok(res, { text: "", status: r.status });
        if (!r.ok) return fail(res, r.status, "HTTP " + r.status);
        const buf = Buffer.from(await r.arrayBuffer());
        if (buf.length > MAX_BYTES) return fail(res, 413, "too_large", { size: buf.length, limit: MAX_BYTES });
        return ok(res, { text: buf.toString("utf8"), status: r.status, finalUrl: cur.url.href });
      }
    } catch (e) {
      return fail(res, 500, "server_error", { detail: (e && e.message) || String(e) });
    }
  });

  return router;
}

module.exports = toolsFetchRouter;
