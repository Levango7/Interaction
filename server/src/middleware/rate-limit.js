// 零依赖内存限流中间件（单实例部署足够；多实例部署需改用外置 Redis，见 server/README.md）
//
// 两种模式：
// 1. 计数模式（failureOnly: false）：统计窗口内所有请求，超过 max 直接 429
// 2. 失败锁定模式（failureOnly: true）：仅统计失败响应，成功响应清零计数，
//    窗口内失败达到 max 后锁定（后续请求一律 429）——用于登录防爆破

const store = new Map(); // key -> { count, resetAt, blockedUntil }

/** 清空限流状态（仅供测试使用） */
export function resetRateLimitStore() {
  store.clear();
}

/** 清理已过期的条目，防止长期运行时内存缓慢增长 */
function sweepExpired(now) {
  for (const [key, entry] of store) {
    if (entry.resetAt <= now && (!entry.blockedUntil || entry.blockedUntil <= now)) {
      store.delete(key);
    }
  }
}

/**
 * 创建限流中间件
 * @param {Object} [opts]
 * @param {number} [opts.windowMs=900000] 统计窗口毫秒数（默认 15 分钟）
 * @param {number} [opts.max=60] 窗口内允许的最大次数（失败锁定模式下为最大失败次数）
 * @param {boolean} [opts.failureOnly=false] 是否为失败锁定模式
 * @param {(status: number) => boolean} [opts.failureStatus] 判定"失败"的响应状态码谓词
 * @param {(req: import('express').Request) => string} [opts.keyGenerator] 追加到 IP 后的计数键（如邮箱）
 * @param {string} [opts.message] 触发限流时的错误文案
 * @returns {import('express').RequestHandler}
 */
export function createRateLimiter(opts = {}) {
  const {
    windowMs = 15 * 60 * 1000,
    max = 60,
    failureOnly = false,
    failureStatus = (status) => status >= 400,
    keyGenerator = () => '',
    message = '请求过于频繁，请稍后再试',
  } = opts;

  return function rateLimiter(req, res, next) {
    const now = Date.now();
    const key = `${req.ip || 'unknown'}|${keyGenerator(req)}`;
    const entry = store.get(key);

    // 已处于锁定期（仅失败锁定模式会出现）
    if (entry && entry.blockedUntil && entry.blockedUntil > now) {
      res.set('Retry-After', String(Math.ceil((entry.blockedUntil - now) / 1000)));
      return res.status(429).json({ error: message });
    }

    if (!failureOnly) {
      // 计数模式：本次请求计入窗口，超出上限直接拒绝
      const current = entry && entry.resetAt > now
        ? entry
        : { count: 0, resetAt: now + windowMs, blockedUntil: 0 };
      current.count += 1;
      if (store.size > 500) sweepExpired(now);
      store.set(key, current);
      if (current.count > max) {
        res.set('Retry-After', String(Math.ceil((current.resetAt - now) / 1000)));
        return res.status(429).json({ error: message });
      }
      return next();
    }

    // 失败锁定模式：先放行，在响应结束时统计成败
    if (store.size > 500) sweepExpired(now);
    res.on('finish', () => {
      if (failureStatus(res.statusCode)) {
        const now2 = Date.now();
        const cur = store.get(key);
        const e = cur && cur.resetAt > now2
          ? cur
          : { count: 0, resetAt: now2 + windowMs, blockedUntil: 0 };
        e.count += 1;
        // 失败达到上限：从现在起锁定一个完整窗口
        if (e.count >= max) e.blockedUntil = now2 + windowMs;
        store.set(key, e);
      } else if (res.statusCode < 400) {
        // 登录成功：清零该键的失败计数
        store.delete(key);
      }
    });
    return next();
  };
}
