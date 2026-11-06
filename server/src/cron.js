/* server/src/cron.js —— 5 字段 Cron 解析与「下次触发时刻」计算（零依赖）
 *
 * 为什么本仓要自己写：定时提醒（schedules）此前**完全没有调度器** —— 客户端存
 * `{type, cron, enabled}`、服务端读 `{title, when, ...}`，字段错位之外更根本的是
 * 没有任何东西会按时去触发。做调度器就必须由某一侧把 cron 变成「下次触发的绝对
 * 时刻」；客户端解析存在两个硬伤：① 页面关掉就没有下一次了；② 每个客户端各自
 * 算，服务端无法扫描「谁到期了」。<--- 所以解析放服务端（单一权威），客户端
 * 只负责提交 cron 字符串与业务类型。
 *
 * 支持的语法（刻意收窄，与设置面板的三个预设匹配）：
 *   · 5 字段：分 时 日 月 周（空格分隔）；多余/缺失字段直接报错，不猜。
 *   · 每个字段：`*` | 数字 | `a-b` | `a-b/n` | 星号加步长 | 用逗号组合上述任意片段。
 *   · 不支持 L / W / # / ? / @ yearly 之类宏 —— 面板里用不到，不支持就明着拒绝，
 *     比起"解析成了一个宽松的值然后不准时"更诚实。
 *   · 周：0 和 7 都是周日（与 cron 同口径）。
 *
 * 时区：**一律 UTC 字段**（getUTC*）。理由是行为与进程时区无关、可测试可复现；
 * 自托管单实例的时区由部署者通过进程 TZ 控制。客户端文案里如实说明。
 *
 * 「下次触发」的搜索上界是 4 年（覆盖闰年周期），找不到（如 `0 9 31 2 *`，
 * 2 月没有 31 号）返回 null —— 调用方（notifications.js）在**创建时**就以此
 * 拒绝，而不是存一个永远不会触发的提醒。
 */
"use strict";

const FIELD_RANGES = [
  { name: "minute", min: 0, max: 59 },
  { name: "hour", min: 0, max: 23 },
  { name: "day-of-month", min: 1, max: 31 },
  { name: "month", min: 1, max: 12 },
  { name: "day-of-week", min: 0, max: 7 }   // 0 与 7 均为周日
];

class CronError extends Error {
  constructor(msg) { super(msg); this.name = "CronError"; this.code = "bad_cron"; }
}

/** 解析单个字段片段（不含逗号），返回该片段覆盖的数值数组（未排序）。 */
function _parsePart(part, range) {
  if (part === "*") {
    const out = [];
    for (let v = range.min; v <= range.max; v++) out.push(v);
    return out;
  }
  /* 星号加斜杠再加步长：全范围按步长取值（星/15 = 0,15,30,45）—— 与 a-b/n 同语义，只是下界退到字段最小值 */
  let star = /^\*\/(\d+)$/.exec(part);
  if (star) {
    const step = Number(star[1]);
    if (!(step >= 1)) throw new CronError(range.name + "：步长必须 >=1：" + part);
    const out = [];
    for (let v = range.min; v <= range.max; v += step) out.push(v);
    return out;
  }
  let m = /^(\d+)(?:-(\d+))?(?:\/(\d+))?$/.exec(part);
  if (!m) throw new CronError(range.name + "：不支持的字段片段「" + part + "」（支持 * / 数字 / a-b / a-b/n / */n / 逗号组合；不支持 L W # ?）");
  const lower = Number(m[1]);
  const hasRange = m[2] !== undefined;
  const hasStep = m[3] !== undefined;
  const upper = hasRange ? Number(m[2]) : (hasStep ? range.max : lower);
  const step = hasStep ? Number(m[3]) : 1;
  if (lower < range.min || upper > range.max) {
    throw new CronError(range.name + "：取值越界（允许 " + range.min + "-" + range.max + "）：" + part);
  }
  if (upper < lower) throw new CronError(range.name + "：区间上界小于下界：" + part);
  if (!(step >= 1)) throw new CronError(range.name + "：步长必须 >=1：" + part);
  const out = [];
  for (let v = lower; v <= upper; v += step) out.push(v);
  return out;
}

/** 解析整条 cron 表达式。返回 { mins, hours, doms, months, dows, domStar, dowStar }。 */
function parseCron(cron) {
  const parts = String(cron || "").trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new CronError("需要恰好 5 个字段（分 时 日 月 周），收到 " + parts.length + " 个：" + cron);
  }
  const fields = parts.map((p, i) => {
    const set = new Set();
    p.split(",").forEach(piece => _parsePart(piece, FIELD_RANGES[i]).forEach(v => set.add(v)));
    return Array.from(set).sort((a, b) => a - b);
  });
  /* 周：cron 允许 0 或 7 表示周日，JS 的 getUTCDay 用 0。统一归一到 7，两侧同口径才不会漏匹配
     （`0 0 * * 0` 这种「每周日」写法若不归一，解析出 [0] 而比较侧给 7 ⇒ 永不触发）。 */
  fields[4] = fields[4].map(v => (v === 0 ? 7 : v));
  return {
    mins: fields[0], hours: fields[1], doms: fields[2], months: fields[3], dows: fields[4],
    domStar: parts[2] === "*", dowStar: parts[4] === "*"
  };
}

/**
 * 计算下次触发时刻（epoch ms）。
 * @param {string} cron 5 字段表达式
 * @param {number|Date} from 基准时刻（默认现在）；返回值严格大于 from（同一分钟内不算）
 * @returns {number|null} epoch ms；4 年内找不到合法时刻返回 null
 * 日与周的匹配遵循 Vixie cron 规则：两侧都受限时任一命中即可；一侧为 * 时由另一侧决定。
 */
function nextCronTime(cron, from) {
  const c = parseCron(cron);
  const base = (from instanceof Date) ? from.getTime() : (Number(from) > 0 ? Number(from) : Date.now());
  /* 从下一分钟整开始（同一分钟内已过的时刻不重发） */
  const start = new Date(base - (base % 60000) + 60000);
  const monthSet = new Set(c.months);
  const DAY = 86400000;
  const limit = start.getTime() + 4 * 366 * DAY;
  for (let ts = start.getTime(); ts <= limit; ts += DAY) {
    const d = new Date(ts);
    if (!monthSet.has(d.getUTCMonth() + 1)) continue;
    const dom = d.getUTCDate();
    const domOk = c.doms.indexOf(dom) !== -1;
    const jsDow = d.getUTCDay() === 0 ? 7 : d.getUTCDay();   // JS 周日=0，归一到 cron 口径
    const dowOk = c.dows.indexOf(jsDow) !== -1;
    const dayMatch = (c.domStar || c.dowStar) ? (domOk && dowOk) : (domOk || dowOk);
    if (!dayMatch) continue;
    for (let hi = 0; hi < c.hours.length; hi++) {
      for (let mi = 0; mi < c.mins.length; mi++) {
        const cand = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), dom, c.hours[hi], c.mins[mi], 0, 0);
        if (cand >= start.getTime()) return cand;
      }
    }
  }
  return null;
}

/** 校验 + 返回人类可读的错误（无错误返回 null）。供路由直接回 400 用。 */
function cronValidationError(cron) {
  try { parseCron(cron); return null; } catch (e) { return (e && e.message) || String(e); }
}

module.exports = { parseCron, nextCronTime, cronValidationError, CronError };
