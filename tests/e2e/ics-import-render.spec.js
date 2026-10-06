/**
 * ics-import-render.spec.js —— 本地 .ics 导入 → 日历渲染的真实浏览器不变量（审计 R-1）
 * ----------------------------------------------------------------------------
 * 为什么单测不够、必须有这一条：
 *   v3.7.90 的 P0 是「导入 .ics 后打开日历直接崩」—— 事件对象经 localStorage 的 JSON 往返后
 *   `start` 变成**字符串**，而 `renderCalendarView` 在 `src/ui-ge-calendar.js:93` 直接调
 *   `e.start.getHours()`。修法是 `getIcsSubs()` 读回时把字符串 hydrate 成 Date。
 *   jsdom 侧已有 `tests/ics-parse.test.js:395` 守住**逻辑**（直接调函数），但它守住的是函数，
 *   不是**接线**：`<input type=file>` → FileReader → icsImportLocal → 落盘 → 重开页面重渲染
 *   这条真实链路里任何一环断掉（入口实死、绑定漏、容器换 id），jsdom 全绿照过。
 *   同型缺陷本轮已实证三次：WebDAV 浏览器形态死 UI、禁用按钮标签夹 `">`、ICS 崩日历 ——
 *   **全部由真浏览器探针抓到、门禁全绿放过**（见 docs/audit-2026-10-06.md R-1）。
 *
 * 覆盖的不变量：
 *   ① 日历视图里的 ICS 入口 `[data-ics-open]` 在真浏览器里可见可点（v3.7.86 B2 曾把翻月与 ICS
 *      入口绑到化石容器 #calendarView，导致按钮实死 —— 那条修复同样没有浏览器断言守着）。
 *   ② 真实文件选择（label→filechooser，走用户路径，不用 element.click() 穿透隐藏 input）
 *      导入含「全天 + 定时」两条事件的 .ics，面板列出该源。
 *   ③ 真 localStorage 往返：落盘形态里 start **必须是字符串**（这是根因锁 —— JSON 表达不了 Date，
 *      谁也不许通过"改存储格式"绕开 hydrate；有字符串形态在，读回侧就必须 hydrate）。
 *   ④ 刷新后重开日历：**零未捕获异常**，且当日出现 `.cal-ics` 徽章（消费者侧真渲染）。
 *   ⑤ 徽章 tooltip 带着 .ics 解析出的 SUMMARY（渲染用的是真数据）。
 *   ⑥ 点徽章 → 详情浮层**在屏幕上真的可见**。本用例第一次跑就抓出 v3.7.86 B1 的实死缺陷：
 *      浮层建进 DOM、内容正确，但内层 `.cmd` 计算样式 `display:none`（见 docs/audit-2026-10-06.md R-5）。
 *   ⑦ 多条可翻页（v3.7.86 B1 承诺）：翻得到的那一条里必须含导入的外部事件。
 *
 * 跑哪几个项目：desktop + tablet（tablet 顺带压 768 宽的月格布局）。
 * 全程不联网：本地文件导入路径不发任何请求（④ 另有一断言核对零网络）。
 */
import { test, expect } from "./_fixture.js";

const FILE_URL = "./agent-workbench.html";

/** 当日 key 与 _ymd() 同口径：YYYY-MM-DD（本地时区） */
const ymd = (d) =>
  d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");

/** 生成落在**当天**的 .ics —— 不能写死日期，否则跨月即假绿/假红 */
function icsForToday() {
  const d = new Date();
  const ymdc = ymd(d).replace(/-/g, "");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//agent-workbench//e2e//CN",
    "BEGIN:VEVENT",
    "UID:e2e-allday-" + ymdc,
    "DTSTAMP:" + ymdc + "T000000Z",
    "DTSTART;VALUE=DATE:" + ymdc,
    "DTEND;VALUE=DATE:" + ymdc,
    "SUMMARY:E2E 全天事件",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "UID:e2e-timed-" + ymdc,
    "DTSTAMP:" + ymdc + "T000000Z",
    /* 浮动本地时间：崩点正是 e.start.getHours()，只有带时刻的事件才会走到 */
    "DTSTART:" + ymdc + "T093000",
    "DTEND:" + ymdc + "T100000",
    "SUMMARY:E2E 定时会议",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

/** 进入「任务 → 日历」视图（active 键是应用自身支持的入口，setActive 即写它；load() 走 JSON.parse，故须按 JSON 形态写） */
async function gotoCalendarTab(page) {
  await page.evaluate(() => localStorage.setItem("wb_agent_active", JSON.stringify("tasks")));
  await page.reload();
  await page.locator('[data-tasks-view="calendar"]').click();
  await expect(page.locator("#tasksCalView")).toBeVisible();
}

test.describe("本地 .ics 导入 → 日历渲染（真浏览器不变量）", () => {
  test.beforeAll(() => { test.skip(!process.env.E2E, "set E2E=1 to run"); });

  test("导入 .ics → 刷新 → 日历不崩且当日有徽章，点徽章出详情", async ({ page }) => {
    /** 核心不变量：任何未捕获异常都必须让用例红 */
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e && e.message)));
    const netReqs = [];
    page.on("request", (r) => { if (!r.url().startsWith("file://")) netReqs.push(r.url()); });

    await page.goto(FILE_URL);
    await gotoCalendarTab(page);

    // ① 入口真的可见可点（不是 jsdom 式 element.click()）
    const openBtn = page.locator("#tasksCalView [data-ics-open]");
    await expect(openBtn).toBeInViewport();
    await openBtn.click();
    await expect(page.locator("#tasksCalView .ics-panel")).toBeVisible();

    // ② 真实文件选择：点 label 触发 filechooser（隐藏 input 走的是用户路径而非 DOM 直调）
    const fcPromise = page.waitForEvent("filechooser");
    await page.locator('#tasksCalView label[for="icsFile"]').click();
    const fc = await fcPromise;
    await fc.setFiles({ name: "e2e-cal.ics", mimeType: "text/calendar", buffer: Buffer.from(icsForToday(), "utf8") });
    await expect(page.locator("#tasksCalView .ics-item-name")).toContainText("e2e-cal.ics");

    // ③ 根因锁：落盘形态必须是字符串（JSON 无从表达 Date，所以读回侧必须 hydrate）
    const persisted = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("wb_agent_cal_ics_subs") || "[]"));
    expect(persisted.length, "导入后应存在 1 个日历源").toBe(1);
    const evs = persisted[0].evs || [];
    expect(evs.length, "两条 VEVENT 都应被解析").toBe(2);
    expect(typeof evs[0].start, "落盘形态：start 是字符串而非 Date").toBe("string");

    // ④ 刷新（真往返）后重开日历：零未捕获异常 + 当日徽章
    await gotoCalendarTab(page);
    const badge = page.locator(`#tasksCalView .cal-ics[data-ics-day="${ymd(new Date())}"]`);
    await expect(badge, "导入的当日事件必须渲染出日历徽章").toBeVisible();
    expect(errors, "日历渲染路径不得有未捕获异常：" + errors.join(" | ")).toEqual([]);

    // ⑤ 徽章 tooltip 带着 .ics 里的 SUMMARY（证明渲染用的是解析出来的真数据，而非空壳）
    await expect(badge).toHaveAttribute("title", /E2E (全天事件|定时会议)/);

    // ⑥ 点徽章 → 详情浮层真的可见（v3.7.86 B1 的浮层曾整块不渲染：外层 .overlay 加了 show，
    //    内层 .cmd 基类 display:none 没加 —— jsdom 不应用样式表，只有真浏览器看得见）
    await badge.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // ⑦ 多条可翻页（v3.7.86 B1 承诺）：翻到某一条时必须能翻到我们的外部 ICS 事件。
    //    当日条目顺序 = 本地会议 → 本地任务 → 外部事件，且种子数据里当天就有任务/会议，
    //    所以不能假定首条即外部事件；循环上界取浮层自报的条数（种子数据变化也不会假红）。
    const total = Number((((await dialog.textContent()) || "").match(/当日共\s*(\d+)\s*条/) || [])[1] || 1);
    let sawExternal = false;
    for (let i = 0; i < Math.max(1, Math.min(total, 8)) && !sawExternal; i++) {
      const txt = (await dialog.textContent()) || "";
      if (/E2E (全天事件|定时会议)/.test(txt)) sawExternal = true;
      else await dialog.locator('[data-ev-step="1"]').click();
    }
    expect(sawExternal, `详情浮层翻页应能到达导入的外部 ICS 事件（当日共 ${total} 条）`).toBe(true);

    // 本地导入全程零外发（不该有任何非 file:// 请求）
    expect(netReqs, "本地 .ics 导入路径不应发出任何网络请求：" + netReqs.join(" | ")).toEqual([]);
  });
});
