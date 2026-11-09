/**
 * ics-cloud-snapshot-pin.test.js —— ICS 订阅缓存（cal_ics_subs）不上云钉（2026-11-10 批）
 * ----------------------------------------------------------------------------
 * 缘起：10-06 审计收尾侦察时记下一条「ICS 明文 + 云快照」存疑项（未深核）。
 * 2026-11-10 深核结论＝HEAD 上无缺陷可修，只落本钉防回归：
 *   · `cal_ics_subs`（src/ui-ge-calendar.js:998）存的是**订阅 URL + 解析后的事件缓存**
 *     （标题/地点/起止时间，getIcsSubs 每次直读 localStorage）——属业务数据，
 *     与 tasks/notes 同口径明文落本机、自动备份/导出同口径携带，这是仓内既定原则；
 *   · 云快照面自 v3.7.148 起由 DATA_KEY_REGISTRY 派生（dataKeySyncAllowed：
 *     未登记 ⇒ 不上云），而该键**未登记** ⇒ 出站 _buildCloudSnapshot 与入站
 *     _applyCloudSnapshot 双向都丢它（render-overview.js:1603 / :1728 同一判据）。
 * 本文件钉的是「这个真实键在真实载荷下确实不上云」，不是抽象判据：
 *   ① 注册表层：dataKeySyncAllowed(cal_ics_subs) === false；
 *   ② 出站行为面：键有值（含事件缓存）时快照产物不含它、本地值不被误删，
 *      同跑一次业务键照常进快照（防「快照是空壳」的假绿）；
 *   ③ 入站行为面：云端快照携带该键时 apply 后本机不落该键，
 *      同一次 apply 业务键照常恢复（防「什么都没写」的假绿）。
 * 窄变异自证（认领行所载）：把该键临时登记成 sync:true ⇒ ①②③ 同红（出站泄漏 +
 * 入站落盘同时被抓），还原后复绿。
 */
import { describe, it, expect } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

const PREFIX = "wb_agent_";
const ICS_KEY = PREFIX + "cal_ics_subs";

/* 与 icsAddSub / icsRefreshSub 落盘形状同构：URL（私有 feed 会在 URL 里带 token，
   正是不上云要防的东西）+ 解析后的事件缓存（ISO 字符串日期，getIcsSubs 读回时还原 Date） */
const SUBS = [
  {
    id: "s1", name: "工作日历", url: "https://cal.example.com/feed/private-token-abc123.ics",
    color: "#3b82f6", enabled: true, lastCheckedAt: 1762700000000, diag: { count: 0 },
    evs: [
      { title: "季度评审", location: "3F 会议室", start: "2026-11-12T10:00:00", end: "2026-11-12T11:00:00" },
      { title: "一对一面谈", location: "", start: "2026-11-12T14:00:00", end: "2026-11-12T14:30:00" },
    ],
  },
];

function boot(extra) {
  return loadApp({ storage: Object.assign({ [PREFIX + "onboarded"]: "true" }, extra || {}) });
}

describe("ICS 订阅缓存（cal_ics_subs）不上云钉", () => {
  it("① 注册表层：该键未登记 ⇒ dataKeySyncAllowed 判不上云", () => {
    const win = boot();
    expect(win.__test.dataKeySyncAllowed(ICS_KEY)).toBe(false);
  });

  it("② 出站行为面：有值（含事件缓存）时快照不含它、本地值不被误删，业务键同跑照常进快照", () => {
    const win = boot({
      [ICS_KEY]: JSON.stringify(SUBS),
      [PREFIX + "notes"]: JSON.stringify([{ id: "n1", title: "本地笔记" }]),
    });
    const snap = win.__test._buildCloudSnapshot();
    expect(snap[ICS_KEY], "云快照不得携带 ICS 订阅缓存（URL 里的私有 token + 事件明文）").toBeUndefined();
    expect(win.localStorage.getItem(ICS_KEY), "排除的是快照不是本机存储：本地值必须原样仍在")
      .toBe(JSON.stringify(SUBS));
    /* 阳性对照：同一次 build 里业务键照常进快照 ⇒ 钉有区分力，不是「快照恒空」 */
    expect(snap[PREFIX + "notes"], "业务键必须照常进快照（对照）").toBe(JSON.stringify([{ id: "n1", title: "本地笔记" }]));
  });

  it("③ 入站行为面：云端快照携带该键时 apply 后本机不落该键，业务键同次照常恢复", () => {
    const win = boot();
    win._applyCloudSnapshot({
      [ICS_KEY]: JSON.stringify(SUBS),
      [PREFIX + "notes"]: JSON.stringify([{ id: "n2", title: "云端笔记" }]),
      _deviceMeta: { deviceId: "d" },
    });
    expect(win.localStorage.getItem(ICS_KEY), "入站与出站同一判据：旧云端副本/被篡改链路都不得把该键写回本机").toBeNull();
    /* 阳性对照：同一次 apply 里业务键照常恢复 ⇒ 不是「什么都没写」的假绿 */
    expect(win.localStorage.getItem(PREFIX + "notes")).toBe(JSON.stringify([{ id: "n2", title: "云端笔记" }]));
  });
});
