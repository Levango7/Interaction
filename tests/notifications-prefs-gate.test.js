// @vitest-environment node
/* 通知偏好消费门控钉子（v3.7.157 修复批）。
 *
 * 背景（审计 P1「保存即谎报」）：fireDueSchedules 此前从不读 store.getNotifyPrefs ——
 * 面板开关只存不读，用户关掉提醒照推。修法：服务端唯一真实发送方必须读偏好。
 * 语义：enabled=false ⇒ 全停；schedules.push=false ⇒ 只停定时提醒；缺省 = 维持旧行为。
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const srvRequire = createRequire(join(ROOT, "server", "package.json"));
const notificationsMod = srvRequire("./src/notifications.js");

function makeFakeStore(schedules, subs, prefsByUser) {
  const audit = [];
  return {
    audit,
    listAllSchedules() { return schedules; },
    listPushSubs(uid) { return subs.filter(s => s.userId === uid); },
    removePushSub() {},
    upsertSchedule() {},
    addAudit(uid, ev, ctx) { audit.push([uid, ev, ctx]); },
    getNotifyPrefs(uid) { return (prefsByUser && prefsByUser[uid]) || null; },
  };
}

const NOW = Date.now();
function oneDueSchedule(userId) {
  return [{ id: "s1", userId, enabled: true, when: NOW - 1000, cron: "0 9 * * *", title: "晨会", note: "九点开始" }];
}
const SUBS = [{ endpoint: "https://fcm/x", userId: "u1", p256dh: "p", auth: "a" }];

describe("fireDueSchedules · 偏好门控", () => {
  it("enabled=false → 不推送（总开关关）", async () => {
    const store = makeFakeStore(oneDueSchedule("u1"), SUBS, { u1: { enabled: false } });
    const sent = [];
    await notificationsMod.fireDueSchedules(store, "https://fcm.googleapis.com", async () => { sent.push(1); return { ok: true }; });
    expect(sent).toHaveLength(0);
    expect(store.audit).toHaveLength(0);
  });

  it("schedules.push=false → 不推送（只停定时提醒）", async () => {
    const store = makeFakeStore(oneDueSchedule("u1"), SUBS, { u1: { enabled: true, schedules: { push: false } } });
    const sent = [];
    await notificationsMod.fireDueSchedules(store, "https://fcm.googleapis.com", async () => { sent.push(1); return { ok: true }; });
    expect(sent).toHaveLength(0);
  });

  it("schedules.push=true → 正常推送", async () => {
    const store = makeFakeStore(oneDueSchedule("u1"), SUBS, { u1: { enabled: true, schedules: { push: true } } });
    const sent = [];
    await notificationsMod.fireDueSchedules(store, "https://fcm.googleapis.com", async (sub, payload) => { sent.push({ sub, payload }); return { ok: true }; });
    expect(sent).toHaveLength(1);
    expect(sent[0].sub.endpoint).toBe("https://fcm/x");
  });

  it("无偏好记录（null）→ 维持旧行为（开）", async () => {
    const store = makeFakeStore(oneDueSchedule("u1"), SUBS, null);
    const sent = [];
    await notificationsMod.fireDueSchedules(store, "https://fcm.googleapis.com", async () => { sent.push(1); return { ok: true }; });
    expect(sent).toHaveLength(1);
  });
});