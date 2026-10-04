/**
 * ics-parse.test.js —— ICS 日历源（v3.7.84）
 * ----------------------------------------------------------------------------
 * 守三件事：
 *   ① RFC5545 子集解析：行折叠 / 转义还原 / DATE 与 DATE-TIME（含时区）/ 有限 RRULE 展开；
 *   ② 存储与刷新：本地导入零网络；订阅经桌面中继（etag 304 保留原事件、只更新时间）；
 *   ③ 诚实边界：复杂 RRULE（BYDAY 等）只取本体；无中继的浏览器形态不假装成功。
 */
import { describe, it, expect, vi } from "vitest";
import { loadApp } from "./helpers/loadApp.js";

const PREFIX = "wb_agent_";
const ICS = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "BEGIN:VEVENT",
  "UID:evt-1@example.com",
  "SUMMARY:产品评审会",
  "LOCATION:三号会议室",
  "DESCRIPTION:第一行\\n第二行",
  "DTSTART;VALUE=DATE:20260115",
  "DTEND;VALUE=DATE:20260116",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:evt-2@example.com",
  "SUMMARY:电话\\; 讨论（续）",
  "DTSTART:20260120T090000+0800",
  "DTEND:20260120T100000+0800",
  "RRULE:FREQ=WEEKLY;COUNT=3",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:evt-cancel@example.com",
  "SUMMARY:已取消的会",
  "DTSTART:20260122T090000Z",
  "STATUS:CANCELLED",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

function app() {
  return loadApp({ storage: { [PREFIX + "tasks"]: "[]" } });
}

describe("icsParseEvents：RFC5545 子集", () => {
  it("解析 DATE / DATE-TIME / 转义 / 行折叠", () => {
    const win = app();
    const evs = win.icsParseEvents(ICS);
    expect(evs.length, "CANCELLED 的事件应剔除：" + JSON.stringify(evs.map(e => e.title))).toBe(4);  /* evt-1 一条 + evt-2 展开 3 条 */
    const e1 = evs.find((e) => e.uid === "evt-1@example.com");
    expect(e1.title).toBe("产品评审会");
    expect(e1.location).toBe("三号会议室");
    expect(e1.desc).toBe("第一行\n第二行");
    expect(e1.allDay).toBe(true);
    expect(e1.start.getFullYear()).toBe(2026);
    expect(e1.start.getMonth()).toBe(0);
    expect(e1.start.getDate()).toBe(15);
    const e2 = evs.filter((e) => e.uid === "evt-2@example.com");
    expect(e2[0].title, "\\; 应还原为 ;").toBe("电话; 讨论（续）");
    expect(e2.length, "FREQ=WEEKLY;COUNT=3 → 3 条").toBe(3);
    expect(e2[1].start.getTime() - e2[0].start.getTime()).toBe(7 * 24 * 3600 * 1000);
  });

  it("行折叠：续行首空格是折叠标记、应被去掉（RFC5545）", () => {
    const win = app();
    const folded = "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:x\r\nSUMMARY:很长\r\n 的标题\r\nDTSTART:20260101\r\nEND:VEVENT\r\nEND:VCALENDAR";
    const evs = win.icsParseEvents(folded);
    expect(evs[0].title).toBe("很长的标题");
  });

  it("诚实边界：复杂 RRULE（BYDAY）只取本体，不假装展开", () => {
    const win = app();
    const byday = ["BEGIN:VCALENDAR", "BEGIN:VEVENT", "UID:y", "SUMMARY:每周三例会",
      "DTSTART:20260107T100000", "RRULE:FREQ=WEEKLY;BYDAY=WE", "END:VEVENT", "END:VCALENDAR"].join("\r\n");
    expect(win.icsParseEvents(byday).length).toBe(1);
  });

  it("上限：单源 ≤2000 条（防恶意大文件打爆 localStorage）", () => {
    const win = app();
    const many = ["BEGIN:VCALENDAR"];
    for (let i = 0; i < 2100; i++) many.push("BEGIN:VEVENT", "UID:e" + i, "SUMMARY:E" + i, "DTSTART:20260101", "END:VEVENT");
    many.push("END:VCALENDAR");
    expect(win.icsParseEvents(many.join("\r\n")).length).toBe(2000);
  });
});

describe("日历源存储与刷新", () => {
  it("本地导入：零网络 + 立即进日期分桶", () => {
    const win = app();
    let net = 0;
    win.fetch = async () => { net++; throw new Error("不应有网络"); };
    const r = win.icsImportLocal("我的日历.ics", ICS);
    expect(r.count).toBe(4);
    expect(win.getIcsSubs().length).toBe(1);
    const byDate = win._icsEventsByDate();
    expect(byDate["2026-01-15"][0].title).toBe("产品评审会");
    expect(net).toBe(0);
    win.icsRemoveSub(win.getIcsSubs()[0].id);
    expect(Object.keys(win._icsEventsByDate()).length).toBe(0);
  });

  it("订阅仅收 https 链接（http/裸域一律拒）", () => {
    const win = app();
    expect(win.icsAddSub("x", "http://evil.example.com/cal.ics")).toBeNull();
    expect(win.icsAddSub("x", "evil.example.com/cal.ics")).toBeNull();
    expect(win.getIcsSubs().length).toBe(0);
    expect(win.icsAddSub("ok", "https://cal.example.com/basic.ics")).toBeTruthy();
  });

  it("桌面中继刷新：200 拉取并入库 + etag；再刷 304 只更新时间不动事件", async () => {
    const win = app();
    const calls = [];
    win.electronAPI = {
      icsFetch: async (arg) => {
        calls.push(arg);
        if (arg.etag) return { ok: true, status: 304, notModified: true, etag: arg.etag };
        return { ok: true, status: 200, etag: "ET1", lastModified: "LM1", text: ICS };
      },
    };
    const sub = win.icsAddSub("订阅", "https://cal.example.com/basic.ics");
    const r1 = await win.icsRefreshSub(win.getIcsSubs().find((s) => s.id === sub.id));
    expect(r1.ok).toBe(true);
    expect(r1.count).toBe(4);
    let subs = win.getIcsSubs();
    expect(subs[0].etag).toBe("ET1");
    const r2 = await win.icsRefreshSub(win.getIcsSubs()[0]);
    expect(r2.ok).toBe(true);
    expect(r2.notModified, "etag 命中 → 304").toBe(true);
    expect(calls[1].etag).toBe("ET1");
    expect(win.getIcsSubs()[0].evs.length, "304 后事件仍在").toBe(4);
    expect(win.getIcsSubs()[0].lastCheckedAt).toBeTruthy();
    void subs;
  });

  it("无中继的浏览器形态：不假装成功（错误如实回传、零写库）", async () => {
    const win = app();
    const sub = win.icsAddSub("订阅", "https://cal.example.com/basic.ics");
    win.fetch = async () => { throw new Error("CORS"); };
    const r = await win.icsRefreshSub(win.getIcsSubs().find((s) => s.id === sub.id));
    expect(r.ok).toBe(false);
    expect(win.getIcsSubs()[0].evs.length).toBe(0);
  });
});

describe("订阅面板（容器内视图）", () => {
  it("渲染面板 + 添加/导入入口齐备；返回后按当前 offset 重渲染月历", () => {
    const win = app();
    const c = win.document.createElement("div");
    c.dataset.offset = "2";
    win.document.body.appendChild(c);
    win.openIcsPanel(c);
    expect(c.querySelector(".ics-panel"), "面板应渲染").toBeTruthy();
    expect(c.querySelector("#icsAdd")).toBeTruthy();
    expect(c.querySelector("#icsFile")).toBeTruthy();
    expect(c.textContent).toMatch(/ICS|订阅/);
    /* 返回：月历重新出现且保留偏移 2 */
    c.querySelector("[data-ics-back]").click();
    expect(c.querySelector(".cal-grid"), "返回后应回到月历").toBeTruthy();
    expect(c.dataset.offset).toBe("2");
  });
});

describe("ICS 导出（零凭据双向的另一半）", () => {
  const tasks = [
    { id: "t1", title: "修登录; 报错,\n第二行", note: "描述带;逗号", status: "todo", due: "2026-03-05" },
    { id: "t2", title: "完成项", status: "done", due: "2026-03-06" },
    { id: "t3", title: "无日期不导出", status: "todo" }
  ];
  const meetings = [
    { id: "m1", title: "周会", date: "2026-03-05", startTime: "09:30", place: "三号会议室" },
    { id: "m2", title: "全天活动", date: "2026-03-07" }
  ];

  it("导出 → 本应用解析器回读，往返一致（标题/描述转义可还原）", () => {
    const win = app();
    const ics = win.icsBuildExport(tasks, meetings);
    expect(ics.startsWith("BEGIN:VCALENDAR")).toBe(true);
    expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
    /* 导出物本身必须已转义（不能把裸分号塞进 ICS） */
    expect(ics).toContain("修登录\\; 报错\\,\\n第二行");
    const back = win.icsParseEvents(ics);
    expect(back.length, "两任务（无日期的不导出）+ 两会议").toBe(4);
    const t1 = back.find((e) => e.title.indexOf("修登录") === 0);
    expect(t1.title).toBe("修登录; 报错,\n第二行");
    expect(t1.desc).toBe("描述带;逗号");
    expect(back.some((e) => e.title === "完成项（已完成）")).toBe(true);
    const m1 = back.find((e) => e.title === "周会");
    expect(m1.location).toBe("三号会议室");
    expect(m1.allDay, "带开始时间 → 非全天").toBe(false);
    const m2 = back.find((e) => e.title === "全天活动");
    expect(m2.allDay).toBe(true);
    /* 会议带时刻：小时/分钟应落回 9:30 */
    expect(m1.start.getHours()).toBe(9);
    expect(m1.start.getMinutes()).toBe(30);
  });

  it("下载不可用环境如实返回 false（不假装成功）", () => {
    const win = app();
    const orig = URL.createObjectURL;
    try{ delete URL.createObjectURL; }catch(e){}
    const okDl = win.icsDownload(win.icsBuildExport(tasks, []), "x.ics");
    expect(okDl).toBe(false);
    if (orig) URL.createObjectURL = orig;
  });
});

describe("事件详情浮层（v3.7.86 B1）", () => {
  function seed(win) {
    win.icsImportLocal("工作日历.ics", [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT", "UID:ev-1", "SUMMARY:客户现场会议",
      "LOCATION:客户方会议室", "DESCRIPTION:讨论上线时间表",
      "DTSTART;VALUE=DATE:20260305", "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n"));
    win.setTasks([{ id: "tt1", title: "交方案", status: "todo", due: "2026-03-05", note: "带附件" }]);
  }

  it("外部事件 + 本地任务聚合到同一浮层：类型/时间/地点/详情齐备", () => {
    const win = app();
    seed(win);
    /* 列表序固定为 会议 → 本地任务 → 外部日历（_evCollectDay） */
    win.openEventDetail("2026-03-05", 0);
    const ov = win.document.getElementById("evDetailOverlay");
    expect(ov, "浮层应挂载").toBeTruthy();
    let txt = ov.textContent;
    expect(txt, "0 号为同日本地任务：" + txt).toContain("交方案");
    expect(txt).toMatch(/任务（未完成）/);
    expect(txt).toContain("带附件");
    expect(ov.querySelector("[data-ev-step]"), "多条时应可翻页").toBeTruthy();
    /* 翻到外部事件（1 号） */
    ov.querySelector("[data-ev-step='1']").click();
    txt = win.document.getElementById("evDetailOverlay").textContent;
    expect(txt, "1 号为外部事件：" + txt).toContain("客户现场会议");
    expect(txt).toContain("客户方会议室");
    expect(txt).toContain("讨论上线时间表");
    expect(txt).toMatch(/外部日历/);
    win.closeEventDetail();
    expect(win.document.getElementById("evDetailOverlay")).toBeFalsy();
  });

  it("翻页与关闭：点下一条换到另一条、点 ✕ 关闭、点遮罩关闭", () => {
    const win = app();
    seed(win);
    win.openEventDetail("2026-03-05", 0);
    const ov1 = win.document.getElementById("evDetailOverlay");
    ov1.querySelector("[data-ev-step='1']").click();
    const ov2 = win.document.getElementById("evDetailOverlay");
    expect(ov2, "翻页后浮层仍在").toBeTruthy();
    expect(ov2.textContent).not.toBe(ov1.textContent);
    ov2.querySelector("[data-ev-close]").click();
    expect(win.document.getElementById("evDetailOverlay")).toBeFalsy();
    win.openEventDetail("2026-03-05", 0);
    const ov3 = win.document.getElementById("evDetailOverlay");
    ov3.dispatchEvent(new win.Event("click", { bubbles: true }));   /* 点遮罩本体 */
    expect(win.document.getElementById("evDetailOverlay"), "点遮罩应关闭").toBeFalsy();
  });

  it("当日无事件：如实 toast、不挂空浮层", () => {
    const win = app();
    win.openEventDetail("2026-01-01", 0);
    expect(win.document.getElementById("evDetailOverlay"), "空日不该挂浮层").toBeFalsy();
  });
});

describe("ICS 增强（v3.7.87 D）", () => {
  it("重命名：id/chunk docId 不变 → 零重嵌（哈希 diff 天然不触发）", () => {
    const win = app();
    win.icsImportLocal("旧名.ics", "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:a\r\nSUMMARY:甲会\r\nDTSTART;VALUE=DATE:20260310\r\nEND:VEVENT\r\nEND:VCALENDAR");
    const before = win.getIcsSubs()[0];
    const docIdsBefore = before.evs.map(c => c.docId);
    expect(win.icsRenameSub(before.id, "新名.ics")).toBe(true);
    const after = win.getIcsSubs()[0];
    expect(after.name).toBe("新名.ics");
    expect(after.id).toBe(before.id);
    expect(after.evs.map(c => c.docId)).toEqual(docIdsBefore);
    expect(win.icsRenameSub("无此 id", "x")).toBe(false);
  });

  it("诊断：坏 VEVENT 计数写进源记录（缺 SUMMARY / 缺 DTSTART 各计 1）", () => {
    const win = app();
    const r = win.icsImportLocal("含坏事件.ics", "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:g1\r\nSUMMARY:正常会\r\nDTSTART;VALUE=DATE:20260310\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:bad1\r\nSUMMARY:缺开始时间\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:bad2\r\nDTSTART;VALUE=DATE:20260311\r\nEND:VEVENT\r\nEND:VCALENDAR");
    expect(r.count).toBe(1);              /* 只有一条完整 */
    const sub = win.getIcsSubs()[0];
    expect(sub.diag.count, "两条坏事件应被计出").toBe(2);
    expect(sub.diag.first).toBe("missing_title_or_start");
    expect(win.icsParseWithDiag("").diag.first).toBe("empty");
    expect(win.icsParseWithDiag("BEGIN:VCALENDAR\r\nEND:VCALENDAR").diag.first).toBe("no_vevent");
  });

  it("面板：诊断计数显示在源行；重命名按钮在列", () => {
    const win = app();
    win.icsImportLocal("含坏事件.ics", "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:g1\r\nSUMMARY:正常会\r\nDTSTART;VALUE=DATE:20260310\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:bad1\r\nSUMMARY:缺开始时间\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:bad2\r\nDTSTART;VALUE=DATE:20260311\r\nEND:VEVENT\r\nEND:VCALENDAR");
    const c = win.document.createElement("div");
    win.document.body.appendChild(c);
    win.openIcsPanel(c);
    expect(c.textContent, "应显示解析异常计数").toMatch(/解析异常|failed to parse/);
    expect(c.querySelector("[data-ics-rename]"), "应有重命名按钮").toBeTruthy();
  });
});

describe("B3 收尾（v3.7.89）：VALARM 提醒 / 颜色 / 启用开关", () => {
  it("TRIGGER 解析：-PT15M → 15；-P1D → 1440；无 VALARM → 0", () => {
    const win = app();
    expect(win._icsTriggerMin("-PT15M")).toBe(15);
    expect(win._icsTriggerMin("-P1D")).toBe(1440);
    expect(win._icsTriggerMin("-PT1H30M")).toBe(90);
    expect(win._icsTriggerMin("PT15M")).toBe(0);   /* 事后型不提醒 */
    const evs = win.icsParseEvents("BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:alarm-1\r\nSUMMARY:健康检查会\r\nCATEGORIES:健康\r\nDTSTART:20260312T100000+0800\r\nBEGIN:VALARM\r\nTRIGGER:-PT15M\r\nEND:VALARM\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:noalarm-1\r\nSUMMARY:无提醒会\r\nDTSTART:20260312T140000+0800\r\nEND:VEVENT\r\nEND:VCALENDAR");
    expect(evs.find(e => e.uid === "alarm-1").reminderMin).toBe(15);
    expect(evs.find(e => e.uid === "alarm-1").categories).toBe("健康");
    expect(evs.find(e => e.uid === "noalarm-1").reminderMin).toBe(0);
  });

  it("提醒窗口：提前 15 分钟内命中 → 通知一次并去重；窗口外不通知", () => {
    const win = app();
    win.icsImportLocal("健康.ics", "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:alarm-1\r\nSUMMARY:健康检查会\r\nCATEGORIES:健康\r\nDTSTART:20260312T100000+0800\r\nBEGIN:VALARM\r\nTRIGGER:-PT15M\r\nEND:VALARM\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:noalarm-1\r\nSUMMARY:无提醒会\r\nDTSTART:20260312T140000+0800\r\nEND:VEVENT\r\nEND:VCALENDAR");
    /* 事件开始 = 2026-03-12T10:00+0800（本地时区视安装环境而定，用相对窗口测）：
       把 now 设在 (start-15min) 与 start 之间 → 命中；再查一次 → 已去重 */
    const st = new Date("2026-03-12T10:00:00+08:00");
    const inWindow = st.getTime() - 10 * 60000;
    const r1 = win.getDueIcsReminders(inWindow);
    expect(r1.length, "窗口内应命中 1 条：" + JSON.stringify(r1)).toBe(1);
    expect(r1[0].msg).toMatch(/健康检查会/);
    expect(r1[0].color).toBe("var(--sc-health)");   /* CATEGORIES=健康 → 场景色 */
    const r2 = win.getDueIcsReminders(inWindow + 60000);
    expect(r2.length, "已提醒过（同事件）不得重复").toBe(0);
    const r3 = win.getDueIcsReminders(st.getTime() - 30 * 60000);
    expect(r3.length, "窗口外（提前太多）不通知").toBe(0);
    const r4 = win.getDueIcsReminders(st.getTime() + 60000);
    expect(r4.length, "已开始不通知").toBe(0);
  });

  it("停用的源：不进日历分桶、不提醒；启用恢复", () => {
    const win = app();
    win.icsImportLocal("健康.ics", "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:alarm-1\r\nSUMMARY:健康检查会\r\nCATEGORIES:健康\r\nDTSTART:20260312T100000+0800\r\nBEGIN:VALARM\r\nTRIGGER:-PT15M\r\nEND:VALARM\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:noalarm-1\r\nSUMMARY:无提醒会\r\nDTSTART:20260312T140000+0800\r\nEND:VEVENT\r\nEND:VCALENDAR");
    const id = win.getIcsSubs()[0].id;
    win.icsSetSubEnabled(id, false);
    expect(Object.keys(win._icsEventsByDate()).length, "停用后分桶为空").toBe(0);
    const st = new Date("2026-03-12T10:00:00+08:00");
    expect(win.getDueIcsReminders(st.getTime() - 10 * 60000).length, "停用后不提醒").toBe(0);
    win.icsSetSubEnabled(id, true);
    expect(Object.keys(win._icsEventsByDate()).length > 0, "启用恢复").toBe(true);
  });

  it("颜色映射：类别/标题关键字 → 场景色令牌；默认绿系", () => {
    const win = app();
    expect(win._icsColorOf({ categories: "会议" })).toBe("var(--sc-office)");
    expect(win._icsColorOf({ title: "Weekly review" })).toBe("var(--sc-office)");
    expect(win._icsColorOf({ categories: "健身" })).toBe("var(--sc-health)");
    expect(win._icsColorOf({})).toBe("var(--ok-text)");
  });

  it("提醒循环接线：runNotifyCheck 经 AppBridge 消费（第 4 块存在且不炸）", () => {
    const win = app();
    win.icsImportLocal("健康.ics", "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:alarm-1\r\nSUMMARY:健康检查会\r\nCATEGORIES:健康\r\nDTSTART:20260312T100000+0800\r\nBEGIN:VALARM\r\nTRIGGER:-PT15M\r\nEND:VALARM\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:noalarm-1\r\nSUMMARY:无提醒会\r\nDTSTART:20260312T140000+0800\r\nEND:VEVENT\r\nEND:VCALENDAR");
    expect(typeof win.__test.AppBridge.getDueIcsReminders).toBe("function");
    win.runNotifyCheck();   /* 不炸即可（到窗口的事件会 notifySystem） */
  });
});

/* v3.7.90：**落盘往返**这一环此前没有用例 —— 而 P0 就出在这一环。
   夹具里的 start 一直是内存中的 Date，从没过一遍存储；真机上导入 .ics 会立刻 saveIcsSubs()，
   JSON 把 Date 变成字符串，读回来消费方调 .getHours()/.getTime() 直接抛
   `TypeError: e.start.getHours is not a function` —— 表现是「导入成功、紧接着日历页崩」。
   下面两条把「过一遍存储再渲染」钉死。 */
describe("ICS：落盘往返后仍可渲染（v3.7.90 回归）", () => {
  /* 事件必须落在**当月**：下面第二条要调 renderCalendarView(0)（渲染当前月）。
     写死月份会随日期推移失效 —— 我第一版写 2026-01，结果渲染的是 10 月、徽章断言假红。 */
  const _d = new Date();
  const _ymd = _d.getFullYear() + String(_d.getMonth() + 1).padStart(2, "0") + String(_d.getDate()).padStart(2, "0");
  const SUB_ICS = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "BEGIN:VEVENT",
    "UID:rr-1@example.com", "SUMMARY:往返用事件", "DTSTART:" + _ymd + "T090000", "DTEND:" + _ymd + "T100000",
    "CATEGORIES:工作", "BEGIN:VALARM", "TRIGGER:-PT15M", "ACTION:DISPLAY", "END:VALARM",
    "END:VEVENT", "END:VCALENDAR", ""
  ].join("\r\n");

  it("导入并落盘后，getIcsSubs() 读回的 start/end 必须是 Date", () => {
    const win = loadApp();
    const r = win.icsImportLocal("probe.ics", SUB_ICS);
    expect(r && r.count, "前提：导入成功").toBeGreaterThan(0);

    /* 前提取证：存储里确实是字符串（这正是 Date 被 JSON 化的证据） */
    const stored = JSON.parse(win.localStorage.getItem(PREFIX + "cal_ics_subs") || "[]");
    expect(typeof stored[0].evs[0].start, "存储里应是字符串（JSON 化后的形态）").toBe("string");

    const back = win.getIcsSubs()[0].evs[0];
    /* 判据要用 **win.Date**：start 是在 jsdom realm 里构造的，用 Node 的 Date 判 instanceof
       恒为 false（跨 realm 的构造器不同一）——这一条我第一版就踩了，假红。 */
    expect(back.start instanceof win.Date, "读回必须是 Date，否则消费方 .getHours() 会抛").toBe(true);
    expect(back.end instanceof win.Date).toBe(true);
    expect(back.start.getHours(), "且时间不能被解析歪").toBe(9);
  });

  it("落盘往返后渲染日历不抛，且当日出现 ICS 徽章（消费者侧真路径）", () => {
    const win = loadApp();
    win.icsImportLocal("probe.ics", SUB_ICS);
    /* renderCalendarView 是崩溃现场：月视图徽章提示要用 e.start.getHours()。
       这里用真实入口渲染 2026-01 那一屏（事件在 1/15）。 */
    let html = "";
    let threw = null;
    try { html = win.renderCalendarView(0); } catch (e) { threw = e; }
    expect(threw, "渲染不得抛：" + (threw && threw.message)).toBeNull();
    expect(typeof html).toBe("string");
    expect(html, "渲染结果里应带上 ICS 徽章容器类").toContain("cal-ics");
  });
});
