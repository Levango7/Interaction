// T3.4 提醒通知测试
// 覆盖：getNotifyEnabled/setNotifyEnabled（权限+持久化）、checkDueTasks（到期/去重/已完成过滤）、
//       checkChainBreak（3 天断链/最近有完成/每链每天去重）、dailyDigestNotify（今日到期/同天去重/无到期不触发）、
//       runNotifyCheck（开关关闭时不触发）、markNotifiedIds/markChainBreakNotified/markDigestSent（副作用标记）。
// 策略：每个 it 用 loadApp 取独立 window，win.localStorage.clear() 重置后手动写数据，
//       从 win.__test 取被测函数断言。Notification API 在 jsdom 不存在，用 vi.stubGlobal 模拟。
// 注意：通知键 wb_notify_enabled / wb_notified_ids / wb_chain_break_notified / wb_digest_date 不带 wb_agent_ 前缀，
//       setup.js 只清 wb_agent_*，故每个 it 手动 win.localStorage.clear()。

import { describe, it, expect, vi } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

// 通知存储键（与实现保持一致）
const NOTIFY_KEY = "wb_notify_enabled";
const NOTIFY_IDS_KEY = "wb_notified_ids";
const CHAIN_BREAK_KEY = "wb_chain_break_notified";
const DIGEST_DATE_KEY = "wb_digest_date";

// 当天 12:00 的时间戳（offsetDays=0 是今天，1 是昨天，依此类推）
function noonNow(offsetDays) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - offsetDays);
  return d.getTime();
}
// YYYY-MM-DD of today (offsetDays=0 是今天)
function ymd(offsetDays) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - offsetDays);
  const p = n => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}
// 构造任务（默认未完成、今日到期）
function mkTask(id, sc, title, dueStr, extra) {
  return Object.assign(
    { id, sc, title, status: "todo", doneAt: null, tags: [], created: noonNow(0), due: dueStr || ymd(0) },
    extra || {}
  );
}

describe("T3.4 提醒通知 - 权限管理", () => {
  it("1: getNotifyEnabled 默认返回 false（无存储时）", () => {
    const win = loadApp();
    const { getNotifyEnabled } = win.__test;
    win.localStorage.clear();
    expect(getNotifyEnabled()).toBe(false);
  });

  it("2: setNotifyEnabled(true) 持久化到 wb_notify_enabled 且 getNotifyEnabled 读回 true", () => {
    const win = loadApp();
    const { setNotifyEnabled, getNotifyEnabled } = win.__test;
    win.localStorage.clear();
    const v = setNotifyEnabled(true);
    expect(v).toBe(true);
    expect(win.localStorage.getItem(NOTIFY_KEY)).toBe(JSON.stringify(true));
    expect(getNotifyEnabled()).toBe(true);
  });

  it("3: setNotifyEnabled(false) 持久化为 false", () => {
    const win = loadApp();
    const { setNotifyEnabled, getNotifyEnabled } = win.__test;
    win.localStorage.clear();
    setNotifyEnabled(true);
    setNotifyEnabled(false);
    expect(win.localStorage.getItem(NOTIFY_KEY)).toBe(JSON.stringify(false));
    expect(getNotifyEnabled()).toBe(false);
  });

  it("4: setNotifyEnabled(true) 时调用 Notification.requestPermission（mock 验证）", () => {
    const win = loadApp();
    const { setNotifyEnabled } = win.__test;
    win.localStorage.clear();
    // jsdom 无 Notification，在 loadApp 的 window 上注入 mock
    const reqSpy = vi.fn(() => Promise.resolve("granted"));
    win.Notification = Object.assign(vi.fn(), { requestPermission: reqSpy, permission: "default" });
    setNotifyEnabled(true);
    expect(reqSpy).toHaveBeenCalledTimes(1);
  });
});

describe("T3.4 提醒通知 - checkDueTasks 到期检测", () => {
  it("5: 有到期任务（due <= today 且未完成）返回需提醒列表", () => {
    const win = loadApp();
    const { setTasks, checkDueTasks } = win.__test;
    win.localStorage.clear();
    setTasks([
      mkTask("t1", "office", "提交周报", ymd(0)),       // 今天到期
      mkTask("t2", "code", "修 bug", ymd(1)),          // 昨天到期（逾期，ymd(1)=昨天）
      mkTask("t3", "study", "复习", ymd(-1))            // 明天到期（未到期，ymd(-1)=明天）
    ]);
    const due = checkDueTasks();
    expect(due).toHaveLength(2);
    expect(due.map(d => d.id).sort()).toEqual(["t1", "t2"]);
    expect(due[0]).toHaveProperty("msg");
    expect(due[0].msg).toContain("任务到期");
  });

  it("6: 已提醒的任务不重复（wb_notified_ids 去重）", () => {
    const win = loadApp();
    const { setTasks, checkDueTasks, markNotifiedIds } = win.__test;
    win.localStorage.clear();
    setTasks([
      mkTask("t1", "office", "提交周报", ymd(0)),
      mkTask("t2", "code", "修 bug", ymd(0))
    ]);
    // 第一次检查：两条都需提醒
    const due1 = checkDueTasks();
    expect(due1).toHaveLength(2);
    // 标记 t1 已提醒
    markNotifiedIds(["t1"]);
    expect(win.localStorage.getItem(NOTIFY_IDS_KEY)).toBe(JSON.stringify(["t1"]));
    // 第二次检查：只剩 t2
    const due2 = checkDueTasks();
    expect(due2).toHaveLength(1);
    expect(due2[0].id).toBe("t2");
    // 标记 t2 后全部去重
    markNotifiedIds(["t2"]);
    const due3 = checkDueTasks();
    expect(due3).toHaveLength(0);
  });

  it("7: 已完成任务（status=done）不提醒", () => {
    const win = loadApp();
    const { setTasks, checkDueTasks } = win.__test;
    win.localStorage.clear();
    setTasks([
      mkTask("t1", "office", "已完成任务", ymd(0), { status: "done", doneAt: noonNow(0) }),
      mkTask("t2", "office", "未完成任务", ymd(0))
    ]);
    const due = checkDueTasks();
    expect(due).toHaveLength(1);
    expect(due[0].id).toBe("t2");
  });

  it("8: 已软删任务（deletedAt）不提醒", () => {
    const win = loadApp();
    const { setTasks, checkDueTasks } = win.__test;
    win.localStorage.clear();
    setTasks([
      mkTask("t1", "office", "已删除", ymd(0), { deletedAt: noonNow(0) }),
      mkTask("t2", "office", "正常", ymd(0))
    ]);
    const due = checkDueTasks();
    expect(due).toHaveLength(1);
    expect(due[0].id).toBe("t2");
  });

  it("9: 无 due 字段的任务不提醒", () => {
    const win = loadApp();
    const { setTasks, checkDueTasks } = win.__test;
    win.localStorage.clear();
    setTasks([
      mkTask("t1", "office", "无到期", null, { due: undefined }),
      mkTask("t2", "office", "有到期", ymd(0))
    ]);
    const due = checkDueTasks();
    expect(due).toHaveLength(1);
    expect(due[0].id).toBe("t2");
  });
});

describe("T3.4 提醒通知 - checkChainBreak 断链检测", () => {
  it("10: 源场景最近 3 天无完成任务 → 返回断链列表", () => {
    const win = loadApp();
    const { setTasks, checkChainBreak, getLinks } = win.__test;
    win.localStorage.clear();
    // 默认链 l1: office→study, l2: study→code, l3: code→life
    // 不放任何已完成任务 → 所有链的源场景最近 3 天都无完成
    setTasks([]);
    const breaks = checkChainBreak();
    expect(breaks.length).toBeGreaterThanOrEqual(1);
    breaks.forEach(b => {
      expect(b).toHaveProperty("id");
      expect(b).toHaveProperty("fromSc");
      expect(b).toHaveProperty("toSc");
      expect(b.msg).toContain("习惯链可能断裂");
      expect(b.msg).toContain("3 天未触发");
    });
  });

  it("11: 源场景最近有完成（今天完成）→ 不报断链", () => {
    const win = loadApp();
    const { setTasks, checkChainBreak } = win.__test;
    win.localStorage.clear();
    // 给所有 4 个场景今天都完成一个任务 → 所有链源场景都有完成
    setTasks([
      mkTask("a1", "office", "x", ymd(0), { status: "done", doneAt: noonNow(0) }),
      mkTask("a2", "study", "x", ymd(0), { status: "done", doneAt: noonNow(0) }),
      mkTask("a3", "code", "x", ymd(0), { status: "done", doneAt: noonNow(0) }),
      mkTask("a4", "life", "x", ymd(0), { status: "done", doneAt: noonNow(0) })
    ]);
    const breaks = checkChainBreak();
    expect(breaks).toHaveLength(0);
  });

  it("12: 源场景前天完成（3 天窗口边界）→ 不报断链", () => {
    const win = loadApp();
    const { setTasks, checkChainBreak } = win.__test;
    win.localStorage.clear();
    // 前天完成（offsetDays=2，在 3 天窗口内：今天+昨天+前天）
    setTasks([
      mkTask("a1", "office", "x", ymd(2), { status: "done", doneAt: noonNow(2) }),
      mkTask("a2", "study", "x", ymd(2), { status: "done", doneAt: noonNow(2) }),
      mkTask("a3", "code", "x", ymd(2), { status: "done", doneAt: noonNow(2) }),
      mkTask("a4", "life", "x", ymd(2), { status: "done", doneAt: noonNow(2) })
    ]);
    const breaks = checkChainBreak();
    expect(breaks).toHaveLength(0);
  });

  it("13: 源场景 4 天前完成（超出窗口）→ 报断链", () => {
    const win = loadApp();
    const { setTasks, checkChainBreak } = win.__test;
    win.localStorage.clear();
    // 4 天前完成（超出 3 天窗口）
    setTasks([
      mkTask("a1", "office", "x", ymd(4), { status: "done", doneAt: noonNow(4) }),
      mkTask("a2", "study", "x", ymd(4), { status: "done", doneAt: noonNow(4) }),
      mkTask("a3", "code", "x", ymd(4), { status: "done", doneAt: noonNow(4) }),
      mkTask("a4", "life", "x", ymd(4), { status: "done", doneAt: noonNow(4) })
    ]);
    const breaks = checkChainBreak();
    expect(breaks.length).toBeGreaterThanOrEqual(1);
  });

  it("14: 每条链每天只提醒一次（wb_chain_break_notified 含日期标记）", () => {
    const win = loadApp();
    const { setTasks, checkChainBreak, markChainBreakNotified } = win.__test;
    win.localStorage.clear();
    setTasks([]);
    // 第一次检查：有断链
    const breaks1 = checkChainBreak();
    expect(breaks1.length).toBeGreaterThanOrEqual(1);
    // 标记已提醒
    markChainBreakNotified(breaks1.map(b => b.id), ymd(0));
    // 第二次检查：今天不再提醒
    const breaks2 = checkChainBreak();
    expect(breaks2).toHaveLength(0);
    // 存储中含日期标记
    const stored = JSON.parse(win.localStorage.getItem(CHAIN_BREAK_KEY) || "[]");
    expect(stored.length).toBeGreaterThanOrEqual(1);
    expect(stored[0]).toContain("|");
  });

  it("15: 禁用的链（enabled=false）不报断链", () => {
    const win = loadApp();
    const { setTasks, checkChainBreak, saveCustomLinks } = win.__test;
    win.localStorage.clear();
    // 自定义链：全部禁用
    saveCustomLinks([
      { id: "x1", name: "测试", fromSc: "office", kw: "x", toSc: "study", enabled: false }
    ]);
    setTasks([]);
    const breaks = checkChainBreak();
    expect(breaks).toHaveLength(0);
  });
});

describe("T3.4 提醒通知 - dailyDigestNotify 每日汇总", () => {
  it("16: 今日有到期任务 → 返回 digest 消息含数量", () => {
    const win = loadApp();
    const { setTasks, dailyDigestNotify } = win.__test;
    win.localStorage.clear();
    setTasks([
      mkTask("t1", "office", "任务A", ymd(0)),
      mkTask("t2", "code", "任务B", ymd(0)),
      mkTask("t3", "study", "昨日任务", ymd(1))   // 昨天到期（ymd(1)=昨天），不计入今日 digest
    ]);
    const dig = dailyDigestNotify();
    expect(dig).not.toBeNull();
    expect(dig.count).toBe(2);
    expect(dig.msg).toContain("2");
    expect(dig.msg).toContain("待办");
    expect(dig.ids).toHaveLength(2);
  });

  it("17: 同一天不重复（wb_digest_date 标记后返回 null）", () => {
    const win = loadApp();
    const { setTasks, dailyDigestNotify, markDigestSent } = win.__test;
    win.localStorage.clear();
    setTasks([mkTask("t1", "office", "任务A", ymd(0))]);
    // 第一次：触发
    const dig1 = dailyDigestNotify();
    expect(dig1).not.toBeNull();
    // 标记已发送
    markDigestSent(ymd(0));
    expect(win.localStorage.getItem(DIGEST_DATE_KEY)).toBe(JSON.stringify(ymd(0)));
    // 第二次：同一天不重复
    const dig2 = dailyDigestNotify();
    expect(dig2).toBeNull();
  });

  it("18: 今日无到期任务 → 返回 null", () => {
    const win = loadApp();
    const { setTasks, dailyDigestNotify } = win.__test;
    win.localStorage.clear();
    setTasks([
      mkTask("t1", "office", "昨日任务", ymd(1)),   // ymd(1)=昨天
      mkTask("t2", "code", "明日任务", ymd(-1))     // ymd(-1)=明天
    ]);
    const dig = dailyDigestNotify();
    expect(dig).toBeNull();
  });

  it("19: 今日到期但已完成的任务不计入 digest", () => {
    const win = loadApp();
    const { setTasks, dailyDigestNotify } = win.__test;
    win.localStorage.clear();
    setTasks([
      mkTask("t1", "office", "已完成", ymd(0), { status: "done", doneAt: noonNow(0) }),
      mkTask("t2", "code", "未完成", ymd(0))
    ]);
    const dig = dailyDigestNotify();
    expect(dig).not.toBeNull();
    expect(dig.count).toBe(1);
  });
});

describe("T3.4 提醒通知 - runNotifyCheck 调度入口", () => {
  it("20: 通知未开启时 runNotifyCheck 不触发任何提醒", () => {
    const win = loadApp();
    const { setTasks, runNotifyCheck, setNotifyEnabled } = win.__test;
    win.localStorage.clear();
    setNotifyEnabled(false);
    setTasks([mkTask("t1", "office", "到期", ymd(0))]);
    const stats = runNotifyCheck();
    expect(stats.due).toBe(0);
    expect(stats.breaks).toBe(0);
    expect(stats.digest).toBe(false);
  });

  it("21: 通知开启 + 有到期任务 → runNotifyCheck 触发 due 提醒并标记去重", () => {
    const win = loadApp();
    const { setTasks, runNotifyCheck, setNotifyEnabled, checkDueTasks } = win.__test;
    win.localStorage.clear();
    setNotifyEnabled(true);
    setTasks([mkTask("t1", "office", "到期任务", ymd(0))]);
    // stub Notification 避免 jsdom 报错（notifySystem 会 fallback 到 toast，不报错）
    const stats = runNotifyCheck();
    expect(stats.due).toBe(1);
    // 已标记到 wb_notified_ids，再次 checkDueTasks 返回空
    expect(checkDueTasks()).toHaveLength(0);
  });

  it("22: startNotifyScheduler/stopNotifyScheduler 幂等且可停止", () => {
    const win = loadApp();
    const { startNotifyScheduler, stopNotifyScheduler } = win.__test;
    win.localStorage.clear();
    const t1 = startNotifyScheduler();
    expect(t1).toBeTruthy();
    // 重复调用幂等（返回相同 timer）
    const t2 = startNotifyScheduler();
    expect(t2).toBe(t1);
    stopNotifyScheduler();
    // 停止后可再次启动
    const t3 = startNotifyScheduler();
    expect(t3).toBeTruthy();
    stopNotifyScheduler();
  });
});