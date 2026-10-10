/* server/src/rate-limit.js —— 进程内速率限制（固定窗口）
 *
 * 为什么需要（2026-10-10）：`ac1114a` 那份后端对 login / register / email-code
 * **没有任何频次约束** —— 可暴力破解口令、可枚举撞库、可对同一邮箱滥发验证码。
 * 这是评估文档 §七 点名的生产必需项（后端单边可解，不依赖客户端改契约）。
 * 客户端契约不变：命中的请求返回 **429 + {ok:false, error:"rate_limited"}**
 * （前端 apiFetch 的 errKind 已按 4xx 归 client 分支，提示语义不破）。
 *
 * 边界（如实记账）：
 *   · 计数在**进程内存** —— 多实例部署各算各的；要全局一致需外置存储。
 *     这与本仓「JSON 文件存储、单实例」的既有假设同源（README 已写明多实例不安全）。
 *   · 固定窗口有临界突刺（窗口边界可放过 2×max），对该场景的量级足够。
 */
"use strict";

/**
 * @param {{windowMs?:number, max?:number, key?:(req)=>string}} options
 *        key 默认取客户端 IP；可传函数按邮箱等维度分桶。
 */
function rateLimit(options) {
  const opts = Object.assign({ windowMs: 60000, max: 30 }, options || {});
  const buckets = new Map();   // key -> { n, reset }
  let calls = 0;
  return function limit(req, res, next) {
    const now = Date.now();
    let k = "ip";
    try { k = String((opts.key ? opts.key(req) : (req.ip || "")) || "ip"); } catch (e) { k = "ip"; }
    let b = buckets.get(k);
    if (!b || b.reset <= now) { b = { n: 0, reset: now + opts.windowMs }; buckets.set(k, b); }
    b.n++;
    if (b.n > opts.max) {
      const retryAfter = Math.max(1, Math.ceil((b.reset - now) / 1000));
      res.set("Retry-After", String(retryAfter));
      return res.status(429).json({ ok: false, error: "rate_limited", data: { retryAfter: retryAfter } });
    }
    /* 顺带清理过期桶（每 64 次请求扫一次），防长期运行内存无界增长 */
    if ((++calls & 63) === 0) {
      for (const [kk, bb] of buckets) if (bb.reset <= now) buckets.delete(kk);
    }
    next();
  };
}

/** 按请求体里的 email 字段分桶（登录/发码这类"同一目标反复试"的维度） */
function byEmailField(req) {
  const e = String((req.body && req.body.email) || "").trim().toLowerCase();
  return "email:" + (e || "?");
}

module.exports = { rateLimit, byEmailField };
