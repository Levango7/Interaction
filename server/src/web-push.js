/* server/src/web-push.js —— 零依赖 Web Push 发送（RFC 8188 aes128gcm 内容编码 + RFC 8291 密钥协商 + RFC 8292 VAPID）
 *
 * 为什么自己写而不引 web-push 库：本仓后端的定位是**零运行时依赖**（express /
 * bcryptjs / jsonwebtoken / nodemailer 之外不再加），单文件 JSON 存储、单实例
 * 自托管。RFC 8291/8292 的密码学链路用 node 内建 crypto 就能正确实现
 * （ECDH P-256 + HKDF-SHA256 + AES-128-GCM + ES256），配套单测做**解密往返**
 * 验证——不靠"能跑通"，靠"能被同一套标准解回来"。
 *
 * 背景（为什么需要它）：定时提醒此前全链路是断的 —— 客户端 VAPID 公钥是写死的
 * 占位值（真实浏览器会因 applicationServerKey 非法点而**抛错**，订阅根本建不起来）、
 * 订阅也从不 POST 给服务端 ⇒ 服务端 pushSubs 表永远是空的。光补调度器只会把
 * 提醒"触发"进虚空；要让用户真收到，必须把发送侧补齐。
 *
 * 对外 API：
 *   · ensureVapidKeys(store) —— 懒生成并持久化发送方密钥（公开值可下发客户端）
 *   · applicationServerKey(publicKeyB64u) —— SPKI DER → 原始未压缩点（65B）的 base64url，
 *     供客户端 pushManager.subscribe({applicationServerKey}) 直接使用
 *   · encrypt(p256dh, auth, payload) —— 单条 aes128gcm 记录
 *   · sendPush(sub, payloadString, vapid) —— 加密 + VAPID 签名 + POST，返回 {ok,status,gone,error}
 *
 * 发送结果语义（调用方按此处理）：
 *   · 2xx(200/201/202)            —— 已投递给 push 服务
 *   · 404 / 410                    —— 订阅已失效（gone），调用方应删除该订阅
 *   · 403 / 400                    —— VAPID 或端点配置问题（记日志，不重试）
 *   · 其它 / 网络错误               —— 瞬时失败，靠下一轮调度自然重试
 */
"use strict";

const crypto = require("crypto");

const SUBJECT_DEFAULT = "mailto:agent-workbench@localhost";

const b64u = {
  toBuf(s) {
    const str = String(s || "").trim();
    const pad = str.length % 4 === 0 ? "" : "=".repeat(4 - str.length % 4);
    return Buffer.from(str.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
  },
  fromBuf(b) { return Buffer.from(b).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_"); }
};

/** HKDF-SHA256（RFC 5869）手动实现：crypto.hkdfSync 在旧版 node 上口径不稳，手写 10 行更可控。 */
function hkdf(ikm, salt, info, len) {
  const prk = crypto.createHmac("sha256", salt).update(ikm).digest();
  let prev = Buffer.alloc(0);
  const parts = [];
  for (let i = 1; Buffer.concat(parts).length < len; i++) {
    prev = crypto.createHmac("sha256", prk).update(Buffer.concat([prev, info, Buffer.from([i])])).digest();
    parts.push(prev);
  }
  return Buffer.concat(parts).slice(0, len);
}

/** RFC 8188 单条记录加密：salt(16) | rs(u32=4096) | idlen(1) | keyid(发送方公钥 65B) | 密文+tag */
function encrypt(p256dhB64u, authB64u, payload) {
  const content = Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload), "utf8");
  if (content.length > 4000) throw Object.assign(new Error("payload_too_large（>4000B，单记录上限 4079B）"), { code: "payload_too_large" });
  const uaPublic = b64u.toBuf(p256dhB64u);        // 订阅者公钥：原始未压缩点
  const authSecret = b64u.toBuf(authB64u);       // 订阅者 auth secret（16B）
  if (uaPublic.length !== 65) throw Object.assign(new Error("bad_p256dh（应为 65 字节未压缩点，收到 " + uaPublic.length + "）"), { code: "bad_p256dh" });
  const serverKeys = crypto.createECDH("prime256v1");
  serverKeys.generateKeys();
  const shared = serverKeys.computeSecret(uaPublic);
  /* RFC 8291 §3.3：PRK = HKDF(auth_secret, ecdh_secret, "WebPush: info\0" || 订阅者公钥 || 发送方公钥) */
  const info = Buffer.concat([
    Buffer.from("WebPush: info\0"),
    uaPublic,
    serverKeys.getPublicKey()
  ]);
  const prk = hkdf(shared, authSecret, info, 32);
  const salt = crypto.randomBytes(16);
  const cek = hkdf(prk, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16);
  const nonce = hkdf(prk, salt, Buffer.from("Content-Encoding: nonce\0"), 12);
  const keyid = serverKeys.getPublicKey();        // 65B
  const rs = Buffer.alloc(4); rs.writeUInt32BE(4096, 0);
  const header = Buffer.concat([salt, rs, Buffer.from([keyid.length]), keyid]);
  /* RFC 8188 §4：内容后必须跟一个分隔字节 0x02，再跟可选的 0x00 填充 */
  const cipher = crypto.createCipheriv("aes-128-gcm", cek, nonce);
  cipher.setAAD(header);
  const ct = Buffer.concat([cipher.update(Buffer.concat([content, Buffer.from([2])])), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([header, ct, tag]);
}

/** 从一条加密记录解出头部信息（单测解密往返用；服务端从不解自己的消息）。 */
function parseRecordHeader(body) {
  const b = Buffer.isBuffer(body) ? body : Buffer.from(body);
  if (b.length < 21) return null;
  const idlen = b[20];
  if (b.length < 21 + idlen) return null;
  return {
    salt: b.subarray(0, 16),
    rs: b.readUInt32BE(16),
    keyid: b.subarray(21, 21 + idlen)
  };
}

/** 用订阅者私钥（ECDH 句柄）算共享密钥，再按 RFC 8291 推回 CEK/nonce —— 供单测反向验证。 */
function deriveSubscriberKeys(subscriberEcdh, serverPublic, authSecret, salt) {
  const shared = subscriberEcdh.computeSecret(serverPublic);
  const uaPublic = subscriberEcdh.getPublicKey();
  const info = Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, serverPublic]);
  const prk = hkdf(shared, authSecret, info, 32);
  return {
    cek: hkdf(prk, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16),
    nonce: hkdf(prk, salt, Buffer.from("Content-Encoding: nonce\0"), 12)
  };
}

// ---------- VAPID（RFC 8292）----------

/** SPKI DER(base64url) → 原始未压缩公钥点(base64url)，客户端 applicationServerKey 用。 */
function applicationServerKey(publicKeyB64u) {
  const der = b64u.toBuf(publicKeyB64u);
  if (der.length < 66) throw new Error("bad_public_key_der");
  return der.subarray(der.length - 65).toString("base64url");
}

/** DER ECDSA 签名 → JWS 原始 R||S（各 32 字节定长）。
 *  DER 布局：30 L2 02 rLen R(rLen 字节) 02 sLen S(sLen 字节)
 *  ⇒ R 在 [4, 4+rLen)，0x02 在 4+rLen，sLen 在 5+rLen，S 在 [6+rLen, 6+rLen+sLen)。
 *  （此处的 1 字节偏移会把 S 的首字节误读为 sLen，静默产生错误签名——
 *   单测 50/50 全挂即此偏移，已用仓外 wp-debug.cjs 定位修掉。） */
function derToRaw(der) {
  if (der.length < 8 || der[0] !== 0x30 || der[2] !== 0x02) throw new Error("bad_der_signature");
  const rLen = der[3];
  if (der.length < 6 + rLen) throw new Error("bad_der_signature（R 截断）");
  if (der[4 + rLen] !== 0x02) throw new Error("bad_der_signature（缺 S 的 INTEGER 标签）");
  const sLen = der[5 + rLen];
  if (der.length < 6 + rLen + sLen) throw new Error("bad_der_signature（S 截断）");
  const r = der.subarray(4, 4 + rLen);
  const s = der.subarray(6 + rLen, 6 + rLen + sLen);
  const fix = (b) => {
    let x = b;
    while (x.length > 32 && x[0] === 0) x = x.subarray(1);
    if (x.length > 32) throw new Error("bad_der_signature（分量超 32 字节）");
    const out = Buffer.alloc(32);
    x.copy(out, 32 - x.length);
    return out;
  };
  return Buffer.concat([fix(r), fix(s)]);
}

/** 构造并签名 VAPID JWT（ES256）。aud 取推送端点的 origin；sub 由调用方传（默认 mailto）。 */
function vapidJwt(privateKeyB64u, audience, subject, expSec) {
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    aud: String(audience || ""),
    exp: now + (Number(expSec) > 0 ? Number(expSec) : 43200),   // 默认 12h
    sub: String(subject || SUBJECT_DEFAULT)
  };
  if (!claims.aud) throw new Error("bad_audience");
  const headerB = Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const payloadB = Buffer.from(JSON.stringify(claims));
  const input = b64u.fromBuf(headerB) + "." + b64u.fromBuf(payloadB);
  const priv = crypto.createPrivateKey({ key: b64u.toBuf(privateKeyB64u), format: "der", type: "pkcs8" });
  const sigDer = crypto.createSign("sha256").update(Buffer.from(input, "utf8")).sign(priv);
  return input + "." + b64u.fromBuf(derToRaw(sigDer));
}

/** 懒生成并持久化 VAPID 密钥（P-256）。store 见 store.js 的 getVapidKeys/setVapidKeys。 */
function ensureVapidKeys(store) {
  let k = store && typeof store.getVapidKeys === "function" ? store.getVapidKeys() : null;
  if (k && k.publicKey && k.privateKey) return k;
  const pair = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  k = {
    publicKey: pair.publicKey.export({ type: "spki", format: "der" }).toString("base64url"),
    privateKey: pair.privateKey.export({ type: "pkcs8", format: "der" }).toString("base64url")
  };
  if (store && typeof store.setVapidKeys === "function") store.setVapidKeys(k);
  return k;
}

/**
 * 推送一条消息。
 * @param {{endpoint:string, keys:{p256dh:string, auth:string}}} sub 订阅记录（pushSubs 表的形态）
 * @param {string} payload 明文（JSON 字符串；>4000B 抛错）
 * @param {{publicKey:string, privateKey:string, subject?:string}} vapid ensureVapidKeys 的产物
 * @param {function} [fetchImpl] 可注入的 fetch（单测用）
 * @returns {Promise<{ok:boolean, status:number, gone:boolean, error?:string}>}
 */
async function sendPush(sub, payload, vapid, fetchImpl) {
  if (!sub || !sub.endpoint || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) {
    return { ok: false, status: 0, gone: false, error: "bad_subscription" };
  }
  if (!vapid || !vapid.publicKey || !vapid.privateKey) {
    return { ok: false, status: 0, gone: false, error: "no_vapid_keys" };
  }
  let origin;
  try { origin = new URL(sub.endpoint).origin; } catch (e) { return { ok: false, status: 0, gone: false, error: "bad_endpoint" }; }
  let body;
  try { body = encrypt(sub.keys.p256dh, sub.keys.auth, payload); }
  catch (e) { return { ok: false, status: 0, gone: false, error: (e && e.message) || String(e) }; }
  /* VAPID 派生（SPKI→原始点 + JWT 签名）异常同样按本函数契约**返回**而不是抛出：
     本函数的 JSDoc 声明所有失败都走 {ok:false}。若抛出，fireDueSchedules 的
     for-of 会因**一条**坏订阅/坏密钥中断整轮 —— 其余全部用户的提醒这一轮全部
     被跳过（且每 30s 重演一次）。vapid 来自 ensureVapidKeys 时不会进这里，
     这条路是防御写死坏配置与并发改配置的。 */
  let rawKeyB64u, token;
  try {
    rawKeyB64u = applicationServerKey(vapid.publicKey);
    token = vapidJwt(vapid.privateKey, origin, vapid.subject);
  } catch (e) { return { ok: false, status: 0, gone: false, error: "bad_vapid_keys" }; }
  const headers = {
    "Authorization": "vapid t=" + token + ",k=" + rawKeyB64u,
    "Crypto-Key": "p256ecdsa=" + rawKeyB64u,
    "Content-Encoding": "aes128gcm",
    "Content-Type": "application/octet-stream",
    "TTL": "86400"
  };
  const f = fetchImpl || (typeof fetch === "function" ? fetch : null);
  if (!f) return { ok: false, status: 0, gone: false, error: "no_fetch_runtime" };
  try {
    const r = await f(sub.endpoint, { method: "POST", body: body, headers: headers });
    const ok = r.status === 200 || r.status === 201 || r.status === 202;
    return { ok: ok, status: r.status, gone: r.status === 404 || r.status === 410 };
  } catch (e) {
    return { ok: false, status: 0, gone: false, error: (e && e.message) || String(e) };
  }
}

module.exports = {
  b64u, hkdf, encrypt, parseRecordHeader, deriveSubscriberKeys,
  applicationServerKey, vapidJwt, ensureVapidKeys, sendPush, SUBJECT_DEFAULT
};
