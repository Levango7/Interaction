// @vitest-environment node
/* 服务端审计修复批单测（v3.7.156）——「绿却残废」修复的钉子测试。
 *
 * 覆盖对象与为什么必须直测（而非经 client-contract-check 的 HTTP 层）：
 *   · cron.js：服务端 cron 解析是 schedules 的单一权威 —— 解析错了，提醒永远不准时，
 *     且这类错误在 HTTP 层表现为「创建成功 200」，只有单测能钉住语义（不可能日期 →
 *     创建时拒绝，而不是存一个永不触发的记录）。
 *   · web-push.js：零依赖 RFC8291 加密自己实现 —— 必须有「第三方解密往返」，
 *     否则 push 发出去是 201 但浏览器解不开，无人知晓。往返用 crypto 独立复算
 *     （与被测代码零共享，同 verify 口径）。
 *   · store.js：损坏抛错（STORE_CORRUPT）与滚动备份是数据韧性的最后防线 ——
 *     旧实现「静默重置空库 + 原子覆盖」合起来等于数据消失双保险，且全程无报错。
 *     这里钉死的是**拒绝启动后磁盘文件不得被改写**（否则防了个寂寞）。
 *   · fireDueSchedules：调度器核心 —— P0 的那一条「提醒永不触发」的修复本体。
 *
 * 运行：node scripts/with-injected.mjs vitest run tests/server-audit-fixes.test.js
 * 搭法沿用 tests/server-sms-providers.test.js：createRequire 指向 server/package.json
 * 才能解析 express 等 server/node_modules 依赖。
 */
import { describe, it, expect, afterEach } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const srvRequire = createRequire(join(ROOT, "server", "package.json"));
const wp = srvRequire("./src/web-push.js");
const cron = srvRequire("./src/cron.js");
const Store = srvRequire("./src/store.js");
const notificationsMod = srvRequire("./src/notifications.js");

const _savedAuditMax = process.env.AUDIT_MAX;
afterEach(() => {
  if (_savedAuditMax === undefined) delete process.env.AUDIT_MAX;
  else process.env.AUDIT_MAX = _savedAuditMax;
});

function tmpStoreFile() {
  const dir = fs.mkdtempSync(join(os.tmpdir(), "awb-store-"));
  return path.join(dir, "auth.json");
}

/* RFC 8188 记录头解析（与 web-push.js 的 parseRecordHeader 独立复算口径一致，
   供测试自行定位密文边界） */
function recordParts(body) {
  const h = wp.parseRecordHeader(body);
  expect(h).toBeTruthy();
  const ctStart = 21 + h.keyid.length;
  const tagLen = 16;
  return {
    header: h,
    aad: body.subarray(0, ctStart),
    ct: body.subarray(ctStart, body.length - tagLen),
    tag: body.subarray(body.length - tagLen),
  };
}

/* RFC 8188 去填充：最后一个非零字节必须是分隔符 0x02 */
function unpad(plain) {
  let i = plain.length - 1;
  while (i >= 0 && plain[i] === 0) i--;
  expect(i).toBeGreaterThanOrEqual(0);
  expect(plain[i]).toBe(2);
  return plain.subarray(0, i).toString("utf8");
}

describe("server/src/cron.js：5 字段解析与下次触发", () => {
  it("合法表达式校验通过（含逗号、范围、步长、7=周日）", () => {
    expect(cron.cronValidationError("0 9 * * *")).toBeNull();
    expect(cron.cronValidationError("*/15 * * * *")).toBeNull();
    expect(cron.cronValidationError("0 0 1 1 *")).toBeNull();
    expect(cron.cronValidationError("30 22 * * 7")).toBeNull();
    expect(cron.cronValidationError("0,30 8-18 * * 1-5")).toBeNull();
    expect(cron.cronValidationError("0 9 31 2 *")).toBeNull(); // 语法合法；语义不可能由 nextCronTime 判
  });

  it("非法表达式校验拒绝（宏、越界、字段数、空）", () => {
    expect(cron.cronValidationError("0 9 * * L")).toMatch(/不支持/); // L 宏明拒
    expect(cron.cronValidationError("60 * * * *")).toMatch(/越界/);
    expect(cron.cronValidationError("0 9 * *")).toMatch(/5 个字段/); // 缺字段
    expect(cron.cronValidationError("0 9 * * * *")).toMatch(/5 个字段/); // 多字段
    expect(cron.cronValidationError("")).toMatch(/5 个字段/);
    expect(cron.cronValidationError(null)).toMatch(/5 个字段/);
    expect(cron.cronValidationError("5-1 * * * *")).toMatch(/上界小于下界/);
  });

  it("nextCronTime：当天下一刻、跨周、严格大于 from", () => {
    const past = new Date(Date.UTC(2026, 10, 6, 8, 0, 0)); // 2026-11-06T08:00:00Z 周五
    expect(cron.nextCronTime("0 9 * * *", past)).toBe(Date.UTC(2026, 10, 6, 9, 0, 0));
    // 同一分钟内不算：08:30:30 的下一刻是 09:00 而不是 08:31（0 9 只有 9 点）
    const halfPast = new Date(Date.UTC(2026, 10, 6, 9, 30, 0));
    expect(cron.nextCronTime("0 9 * * *", halfPast)).toBe(Date.UTC(2026, 10, 7, 9, 0, 0));
    // 周日（0 与 7 都要认）
    expect(cron.nextCronTime("0 0 * * 0", past)).toBe(Date.UTC(2026, 10, 8, 0, 0, 0));
    expect(cron.nextCronTime("0 0 * * 7", past)).toBe(Date.UTC(2026, 10, 8, 0, 0, 0));
    // 步长：*/15 从 08:00 的下一刻是 08:15
    expect(cron.nextCronTime("*/15 * * * *", past)).toBe(Date.UTC(2026, 10, 6, 8, 15, 0));
  });

  it("nextCronTime：不可能日期返回 null（创建侧据此拒绝，不存永不着）", () => {
    const past = new Date(Date.UTC(2026, 10, 6, 8, 0, 0));
    expect(cron.nextCronTime("0 9 31 2 *", past)).toBeNull();
    expect(cron.nextCronTime("0 9 31 4 *", past)).toBeNull(); // 4 月也没有 31 号
  });

  it("nextCronTime：日与周的 Vixie 规则（一侧为星由另一侧决定；两侧受限是「或」不是「且」）", () => {
    const past = new Date(Date.UTC(2026, 10, 6, 8, 0, 0)); // 2026-11-06 周五，正好是 6 号
    // 两侧都受限（dom 与 dow 都非星）：任一命中即触发（OR）
    // 11-06 本身就是 6 号（尽管是周五不是周一）⇒ 今天 09:00 就触发 —— 若实现成 AND 就会等到「既是 6 号又是周一」
    expect(cron.nextCronTime("0 9 6 * 1", past)).toBe(Date.UTC(2026, 10, 6, 9, 0, 0));
    // 从 11-07（6 号已过）算：下一个 6 号 = 12-06，下一个周一 = 11-09，OR 取更早的 11-09
    const past2 = new Date(Date.UTC(2026, 10, 7, 8, 0, 0));
    expect(cron.nextCronTime("0 9 6 * 1", past2)).toBe(Date.UTC(2026, 10, 9, 9, 0, 0));
    // 一侧为星：由另一侧独占决定
    expect(cron.nextCronTime("0 9 6 * *", past2)).toBe(Date.UTC(2026, 11, 6, 9, 0, 0)); // 只看日
    expect(cron.nextCronTime("0 9 * * 1", past2)).toBe(Date.UTC(2026, 10, 9, 9, 0, 0)); // 只看周
  });
});

describe("server/src/web-push.js：RFC8291 加密 / VAPID / 发送", () => {
  it("加密→解密往返（UTF-8 CJK 载荷），错 auth 密钥必须解不开", () => {
    const sub = crypto.createECDH("prime256v1"); sub.generateKeys();
    const auth = crypto.randomBytes(16);
    const msg = JSON.stringify({ title: "定时提醒", body: "该喝水了 ☕", ts: 1730000000000 });
    const body = wp.encrypt(sub.getPublicKey().toString("base64url"), auth.toString("base64url"), msg);

    const h = wp.parseRecordHeader(body);
    expect(h.rs).toBe(4096);
    expect(h.keyid.length).toBe(65);
    const { cek, nonce } = wp.deriveSubscriberKeys(sub, h.keyid, auth, h.salt);
    const { aad, ct, tag } = recordParts(body);
    const dec = crypto.createDecipheriv("aes-128-gcm", cek, nonce);
    dec.setAAD(aad);
    dec.setAuthTag(tag);
    expect(unpad(Buffer.concat([dec.update(ct), dec.final()]))).toBe(msg);

    // 错 auth 密钥：GCM 认证标签校验必须失败
    const bad = wp.deriveSubscriberKeys(sub, h.keyid, crypto.randomBytes(16), h.salt);
    const dec2 = crypto.createDecipheriv("aes-128-gcm", bad.cek, bad.nonce);
    dec2.setAAD(aad);
    dec2.setAuthTag(tag);
    expect(() => { dec2.update(ct); dec2.final(); }).toThrow();
  });

  it("encrypt 拒绝坏 p256dh 与超长载荷（RFC8291 上界）", () => {
    expect(() => wp.encrypt(Buffer.alloc(33).toString("base64url"), "aaaa", "x")).toThrow(/bad_p256dh/);
    const sub = crypto.createECDH("prime256v1"); sub.generateKeys();
    expect(() => wp.encrypt(sub.getPublicKey().toString("base64url"), "aaaa", "x".repeat(4001))).toThrow(/payload_too_large/);
  });

  it("ensureVapidKeys：生成、持久化、幂等；applicationServerKey 是 65B 未压缩点", () => {
    const saved = [];
    const store = {
      getVapidKeys() { return saved.length ? saved[0] : null; },
      setVapidKeys(k) { saved.push(k); },
    };
    const k1 = wp.ensureVapidKeys(store);
    const k2 = wp.ensureVapidKeys(store);
    expect(k1.publicKey).toBeTruthy();
    expect(k1.privateKey).toBeTruthy();
    expect(k2).toEqual(k1); // 第二次走持久化值不再生成
    expect(saved).toEqual([k1]); // 恰好写一次

    const raw = Buffer.from(wp.applicationServerKey(k1.publicKey), "base64url");
    expect(raw.length).toBe(65);
    expect(raw[0]).toBe(0x04); // 未压缩点前缀

    expect(wp.ensureVapidKeys(null).publicKey).toBeTruthy(); // 无 store 也能生成
  });

  it("vapidJwt：签名可被公钥验签（raw R‖S 回 DER），claims 齐全", () => {
    const pair = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const privB64u = pair.privateKey.export({ type: "pkcs8", format: "der" }).toString("base64url");
    const pubB64u = pair.publicKey.export({ type: "spki", format: "der" }).toString("base64url");
    const token = wp.vapidJwt(privB64u, "https://fcm.googleapis.com", "mailto:t@e.com");
    const parts = token.split(".");
    expect(parts).toHaveLength(3);
    const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    expect(claims.aud).toBe("https://fcm.googleapis.com");
    expect(claims.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
    expect(claims.sub).toBe("mailto:t@e.com");

    // raw R‖S（64B）回 DER 验签 —— DER 整数高位为 1 时须补 0x00 前缀
    const sigRaw = Buffer.from(parts[2], "base64url");
    expect(sigRaw.length).toBe(64);
    const toInt = (b) => {
      let x = b;
      while (x.length > 1 && x[0] === 0) x = x.subarray(1);
      if (x[0] & 0x80) x = Buffer.concat([Buffer.from([0]), x]);
      return Buffer.concat([Buffer.from([0x02, x.length]), x]);
    };
    const inner = Buffer.concat([toInt(sigRaw.subarray(0, 32)), toInt(sigRaw.subarray(32))]);
    const der = Buffer.concat([Buffer.from([0x30, inner.length]), inner]);
    const pub = crypto.createPublicKey({ key: Buffer.from(pubB64u, "base64url"), format: "der", type: "spki" });
    expect(crypto.verify("sha256", Buffer.from(parts[0] + "." + parts[1], "utf8"), pub, der)).toBe(true);

    expect(() => wp.vapidJwt(privB64u, "", "x")).toThrow(/bad_audience/);
  });

  it("sendPush：201 ok / 410 gone / 500 瞬时失败 / 网络错误 / 坏订阅 / 无 vapid / 坏端点", async () => {
    const pair = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
    const vapid = {
      publicKey: pair.publicKey.export({ type: "spki", format: "der" }).toString("base64url"),
      privateKey: pair.privateKey.export({ type: "pkcs8", format: "der" }).toString("base64url"),
    };
    const sub = crypto.createECDH("prime256v1"); sub.generateKeys();
    const good = {
      endpoint: "https://fcm.googleapis.com/fcm/send/abc",
      keys: { p256dh: sub.getPublicKey().toString("base64url"), auth: crypto.randomBytes(16).toString("base64url") },
    };
    const calls = [];
    const fetchImpl = async (url, opts) => {
      calls.push({ url, method: opts.method, len: opts.body.length, auth: opts.headers["Authorization"], ckey: opts.headers["Crypto-Key"] });
      return { status: 201 };
    };
    const r1 = await wp.sendPush(good, "hello", vapid, fetchImpl);
    expect(r1.ok).toBe(true);
    expect(r1.status).toBe(201);
    expect(r1.gone).toBeFalsy();
    expect(calls).toHaveLength(1);
    expect(/^vapid t=[^,]+,k=[A-Za-z0-9_-]+$/.test(calls[0].auth)).toBe(true);
    expect(calls[0].ckey.indexOf("p256ecdsa=")).toBe(0);
    expect(calls[0].len).toBeGreaterThan(21 + 65); // 头部 + 密文

    expect((await wp.sendPush(good, "hi", vapid, async () => ({ status: 410 }))).gone).toBe(true);
    const r500 = await wp.sendPush(good, "hi", vapid, async () => ({ status: 500 }));
    expect(r500.ok).toBe(false);
    expect(r500.gone).toBe(false);
    expect(r500.status).toBe(500);
    expect((await wp.sendPush(good, "hi", vapid, async () => { throw new Error("net down"); })).error).toBe("net down");
    expect((await wp.sendPush({}, "hi", vapid)).error).toBe("bad_subscription");
    expect((await wp.sendPush(good, "hi", null)).error).toBe("no_vapid_keys");
    expect((await wp.sendPush({ endpoint: "not-a-url", keys: good.keys }, "hi", vapid)).error).toBe("bad_endpoint");
    // 坏 VAPID 密钥：按 sendPush 的 JSDoc 契约必须**返回** ok:false 而不是抛出 ——
    // 抛出会让 fireDueSchedules 的整轮因一条坏配置中断（其余用户的提醒全被跳过且每轮重演）
    const rBad = await wp.sendPush(good, "hi", { publicKey: "x", privateKey: "y" }, fetchImpl);
    expect(rBad.ok).toBe(false);
    expect(rBad.error).toBe("bad_vapid_keys");
  });
});

describe("server/src/store.js：损坏抛错、滚动备份、用户隔离、清扫", () => {
  it("正常文件加载与持久化往返", () => {
    const file = tmpStoreFile();
    const st = new Store(file);
    st.setNotifyPrefs("u1", { enabled: true });
    const st2 = new Store(file);
    expect(st2.getNotifyPrefs("u1")).toEqual({ enabled: true });
  });

  it("损坏 JSON：抛 STORE_CORRUPT，且磁盘文件原样保留（不得静默重建空库后覆盖）", () => {
    const dir = fs.mkdtempSync(join(os.tmpdir(), "awb-store-"));
    const file = path.join(dir, "auth.json");
    const corrupt = "{ users: { broken, ";
    fs.writeFileSync(file, corrupt, "utf8");
    let thrown = null;
    try { new Store(file); } catch (e) { thrown = e; }
    expect(thrown).not.toBeNull();
    expect(thrown.code).toBe("STORE_CORRUPT");
    // 防的正是「旧实现」：解析失败 → 静默重建空库 → 下次原子 rename 把磁盘覆盖成空库。
    // 这里拒绝启动后，磁盘文件必须一个字节都没动。
    expect(fs.readFileSync(file, "utf8")).toBe(corrupt);
  });

  it("顶层非对象同样按 STORE_CORRUPT 拒绝", () => {
    const dir = fs.mkdtempSync(join(os.tmpdir(), "awb-store-"));
    const file = path.join(dir, "auth.json");
    fs.writeFileSync(file, "[1,2,3]", "utf8");
    let thrown = null;
    try { new Store(file); } catch (e) { thrown = e; }
    expect(thrown && thrown.code).toBe("STORE_CORRUPT");
  });

  it("滚动备份：多次写盘后 .bak 最多留 3 份", () => {
    const file = tmpStoreFile();
    const st = new Store(file);
    for (let i = 0; i < 6; i++) {
      st.setNotifyPrefs("u" + i, { n: i });
    }
    const dir = path.dirname(file);
    const pref = path.basename(file) + ".bak.";
    const baks = fs.readdirSync(dir).filter(n => n.startsWith(pref));
    expect(baks.length).toBeGreaterThanOrEqual(1);
    expect(baks.length).toBeLessThanOrEqual(3);
  });

  it("integrations 按 userId 隔离：B 看不到也删不掉 A 的；缺 userId 直接拒写", () => {
    const file = tmpStoreFile();
    const st = new Store(file);
    expect(st.setIntegration("userA", "notion", { token: "t1" })).toBeTruthy();
    expect(st.listIntegrations("userA")).toEqual([{ provider: "notion", connected: true, createdAt: expect.any(Number) }]);
    expect(st.listIntegrations("userB")).toEqual([]);
    st.removeIntegration("userB", "notion"); // B 的删除必须空转，不动 A
    expect(st.listIntegrations("userA")).toHaveLength(1);
    st.removeIntegration("userA", "notion");
    expect(st.listIntegrations("userA")).toEqual([]);
    // 漏 userId / provider 即拒 —— 漏 userId 写进去就退回实例级
    expect(st.setIntegration(null, "notion", {})).toBeNull();
    expect(st.setIntegration("userA", null, {})).toBeNull();
    // 持久化：重开实例仍是隔离形态
    st.setIntegration("userA", "todoist", { token: "t2" });
    const st2 = new Store(file);
    expect(st2.listIntegrations("userA")).toHaveLength(1);
    expect(st2.listIntegrations("userB")).toEqual([]);
  });

  it("审计环有界（AUDIT_MAX）且只返回本人", () => {
    process.env.AUDIT_MAX = "5";
    const st = new Store(tmpStoreFile());
    for (let i = 0; i < 8; i++) st.addAudit("u1", "login", { i });
    const evs = st.getAudit("u1");
    expect(evs).toHaveLength(5); // 丢最旧
    expect(evs[0].ctx.i).toBe(3);
    expect(evs[4].ctx.i).toBe(7);
    expect(st.getAudit("u2")).toEqual([]); // 无入口读他人
    // since 游标
    const mid = evs[2].at;
    expect(st.getAudit("u1", mid)).toHaveLength(2);
  });

  it("清扫：过期验证码 / 过期会话 / 陈旧 oauth state", () => {
    const st = new Store(tmpStoreFile());
    st.setCode("a@x.com", "111111", -1, "register"); // ttl 为负 ⇒ 立即过期
    expect(st.sweepCodes()).toBe(1);
    expect(st.sweepCodes()).toBe(0); // 已清干净
    st.saveSession({ refreshToken: "rt1", userId: "u1", deviceName: "d", createdAt: Date.now(), expiresAt: Date.now() - 1000 });
    expect(st.sweepSessions()).toBe(1);
    expect(st.getSession("rt1")).toBeNull();
    st.setOAuthState("st1", "github", {});
    expect(st.sweepOAuthStates(-1)).toBe(1); // maxAge 为负 ⇒ 全部判陈旧
    // 未过期的不得被误清
    st.setCode("b@x.com", "222222", 600, "register");
    expect(st.sweepCodes()).toBe(0);
    expect(st.getCode("b@x.com", "register")).toBeTruthy();
  });
});

describe("fireDueSchedules：调度器核心（P0「提醒永不触发」的修复本体）", () => {
  function makeFakeStore(schedules, subs) {
    const saved = [];
    const removedSubs = [];
    const audit = [];
    let vapid = null;
    return {
      saved, removedSubs, audit,
      listAllSchedules() { return schedules; },
      listPushSubs(uid) { return subs.filter(s => s.userId === uid); },
      removePushSub(ep, uid) { removedSubs.push([ep, uid]); },
      upsertSchedule(s) { saved.push(s); },
      addAudit(uid, ev, ctx) { audit.push([uid, ev, ctx]); },
      getVapidKeys() { return vapid; },
      setVapidKeys(k) { vapid = k; },
    };
  }

  it("到点：推送到达 + 落审计 + cron 型重排到未来", async () => {
    const now = Date.now();
    const schedules = [{
      id: "s1", userId: "u1", enabled: true, when: now - 1000,
      cron: "0 9 * * *", type: "taskDue", title: "晨会", note: "九点开始",
    }];
    const subs = [{ endpoint: "https://fcm/x", userId: "u1", p256dh: "p", auth: "a" }];
    const store = makeFakeStore(schedules, subs);
    const sent = [];
    await notificationsMod.fireDueSchedules(store, "https://fcm.googleapis.com", async (sub, payload) => {
      sent.push({ sub, payload });
      return { ok: true, status: 201 };
    });
    expect(sent).toHaveLength(1);
    expect(sent[0].sub.endpoint).toBe("https://fcm/x");
    expect(JSON.parse(sent[0].payload)).toMatchObject({ title: "晨会", body: "九点开始", scheduleId: "s1" });
    expect(store.audit).toEqual([["u1", "schedule_fired", expect.any(Object)]]);
    expect(store.saved).toHaveLength(1);
    const next = store.saved[0];
    expect(next.when).toBeGreaterThan(now);
    expect(next.enabled).toBe(true);
    expect(next.lastFiredAt).toBeGreaterThan(now - 5000);
  });

  it("一次性（无 cron）：触发即停，保留 when 与 lastFiredAt 供客户端展示「已触发」", async () => {
    const now = Date.now();
    const schedules = [{ id: "s2", userId: "u1", enabled: true, when: now - 1000, cron: null, title: "一次性", note: "" }];
    const store = makeFakeStore(schedules, [{ endpoint: "https://fcm/y", userId: "u1", p256dh: "p", auth: "a" }]);
    const sent = [];
    await notificationsMod.fireDueSchedules(store, "https://fcm.googleapis.com", async () => { sent.push(1); return { ok: true, status: 201 }; });
    expect(sent).toHaveLength(1);
    expect(store.saved).toHaveLength(1);
    expect(store.saved[0].enabled).toBe(false);
    expect(store.saved[0].lastFiredAt).toBeGreaterThan(now - 5000);
  });

  it("未到点与已停用：不推、不改排", async () => {
    const now = Date.now();
    const store = makeFakeStore([
      { id: "s3", userId: "u1", enabled: true, when: now + 60000, cron: null, title: "还没到" }, // 未来
      { id: "s4", userId: "u1", enabled: false, when: now - 1000, cron: null, title: "已停用" }, // 停用
    ], [{ endpoint: "https://fcm/z", userId: "u1", p256dh: "p", auth: "a" }]);
    const sent = [];
    await notificationsMod.fireDueSchedules(store, "https://fcm.googleapis.com", async () => { sent.push(1); return { ok: true }; });
    expect(sent).toHaveLength(0);
    expect(store.saved).toHaveLength(0);
  });

  it("订阅 gone（410）：自动清理该订阅，不影响推送结果上报", async () => {
    const now = Date.now();
    const schedules = [{ id: "s5", userId: "u1", enabled: true, when: now - 1000, cron: null, title: "t" }];
    const store = makeFakeStore(schedules, [{ endpoint: "https://fcm/gone", userId: "u1", p256dh: "p", auth: "a" }]);
    await notificationsMod.fireDueSchedules(store, "https://fcm.googleapis.com", async () => ({ ok: false, gone: true, status: 410 }));
    expect(store.removedSubs).toEqual([["https://fcm/gone", "u1"]]);
  });
});
