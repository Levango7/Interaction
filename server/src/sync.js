/* server/src/sync.js
 * 云同步端点：GET / PUT /api/sync/snapshot
 *
 * 为什么补这个文件（2026-10-10）：客户端一直在调它 ——
 *   src/render-overview.js:1302  GET  （读快照）
 *   src/render-overview.js:1316  PUT  （写快照，body { snapshot, updatedAt }）
 * 但 ac1114a 那份后端**从未实现这两个端点**，于是「即使把后端部署起来，云同步依然不工作」。
 * 客户端代码注释里自己写着「本仓库不含该后端，需部署方实现同名端点」——
 * 现在仓库含了，这句注释就成了历史陈述（客户端在 src/ 下，本轮不动）。
 *
 * 契约严格对齐客户端（勿擅改字段名）：
 *   PUT  body { snapshot: Object, updatedAt: Number }
 *   GET  响应 { ok: true, data: { snapshot: Object|null } }   ← 客户端读 r.data.snapshot
 *   均需 Bearer 鉴权（快照含该用户全部数据）
 *
 * 冲突策略：**全量快照 + last-write-wins**（与 docs/cloud-sync-incremental-contract.md 记载的现状一致）。
 * 这里刻意不发明「增量 / 水位 / 冲突合并」——那需要客户端契约同步升级，
 * 单方面在服务端做只会造成「后端以为在合并、客户端以为被覆盖」的错位。
 */
"use strict";

function syncRouter(cfg, store) {
  const express = require("express");
  const router = express.Router();
  const jwt = require("jsonwebtoken");

  const ok = (res, data) => res.json({ ok: true, data: data || {} });
  const fail = (res, status, error, data) => res.status(status || 400).json({ ok: false, error: error, data: data || {} });

  /* 鉴权中间件：与 auth.js / extras.js 同款。
     已知重复（第三处）—— 抽公共模块会改动那两个已验证的文件，
     本轮遵循「只做加法」不动它们；后续如需抽取，注意三处行为必须保持等价。 */
  const am = (req, res, next) => {
    const h = req.header("authorization") || "";
    const token = h.startsWith("Bearer ") ? h.slice(7) : null;
    if (!token) return res.status(401).json({ ok: false, error: "no_token" });
    try { req.user = jwt.verify(token, cfg.jwt.accessSecret); next(); }
    catch (e) { return res.status(401).json({ ok: false, error: "invalid_token" }); }
  };

  const MAX_SNAPSHOT_BYTES = (cfg.sync && cfg.sync.maxSnapshotBytes) || 2 * 1024 * 1024;

  // ---- 读快照 ----
  router.get("/snapshot", am, (req, res) => {
    const rec = store.getSnapshot(req.user.sub);
    /* updatedAt 回传的是**客户端写入时自报的时间**，不做服务端替换 ——
       客户端拿它跟本地 lastPushAt 比大小（render-overview.js:1413）并按本地时区展示（:1428），
       换成服务端时间会让跨设备场景的比较判错方向。详见 store.setSnapshot 的注释。
       无快照时 snapshot 为 null，客户端据此判定「未同步过」——不能省成 {}，
       否则客户端会把空对象当成一份真实快照应用下去。 */
    return ok(res, { snapshot: rec ? rec.snapshot : null, updatedAt: rec ? rec.updatedAt : null });
  });

  // ---- 写快照（LWW 全量覆盖）----
  router.put("/snapshot", am, (req, res) => {
    const body = req.body || {};
    const snapshot = body.snapshot;
    if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
      return fail(res, 400, "invalid_snapshot");
    }
    let size = 0;
    try { size = Buffer.byteLength(JSON.stringify(snapshot), "utf8"); } catch (e) {
      return fail(res, 400, "invalid_snapshot");
    }
    /* express.json 已限 2mb，这里再按业务口径卡一次：
       超限要给出**明确错误**而不是静默截断 —— 静默截断会让客户端以为同步成功，实际丢数据。 */
    if (size > MAX_SNAPSHOT_BYTES) {
      return fail(res, 413, "snapshot_too_large", { size, limit: MAX_SNAPSHOT_BYTES });
    }
    const clientUpdatedAt = Number(body.updatedAt) || null;
    const rec = store.setSnapshot(req.user.sub, snapshot, clientUpdatedAt);
    return ok(res, { updatedAt: rec.updatedAt, size });
  });

  return router;
}

module.exports = syncRouter;
