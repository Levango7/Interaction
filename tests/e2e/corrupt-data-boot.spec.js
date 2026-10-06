/**
 * corrupt-data-boot.spec.js —— 「存储里躺着一个形状不对的 tasks 键」时的真浏览器启动不变量
 * ----------------------------------------------------------------------------
 * 为什么单测不够、必须有这一条（docs/audit-2026-10-06.md R-2 第一片的连带风险）：
 *   切片一把迁移契约改成**备份写不进去就不重置**（与既有 `_brokenBackup` 同契约）。于是
 *   localStorage 里可以**合法地**留着一个非数组的 `wb_agent_tasks` 等人工找回 —— 这是新状态，
 *   此前从未存在过。它把崩溃点从写入侧**移到了读取侧**：本机实测两处（`cleanupRecycle`、
 *   引导渲染 `_onboardRenderStep`）因此在**启动的异步链**里抛未捕获拒绝，而不经过错误边界，
 *   用户侧症状是"应用安静地少了一半功能"，而不是任何看得见的报错。
 *   jsdom 侧 `tests/empty-catch-slice1.test.js` 第⑥组已经钉住这条，但这类"异步链 + 全局兜底"
 *   的时序只有在真 Chromium 里才走得到完整启动路径；本轮同类缺陷已实证三次都是真浏览器抓到的
 *   （WebDAV 死 UI / 禁用按钮夹 `">` / ICS 崩日历，见 R-1）。
 *
 * 覆盖的不变量：
 *   ① 备份可用时：损坏原值**先落到独立 `_broken_` 键**、tasks 重置为 `[]`、启动零未捕获异常、
 *      顶栏/侧栏/主内容照常渲染（= 修复前后行为不变，防我把"不销毁"改成"永不重置"）。
 *   ② 备份写失败时（用 addInitScript 让 `_broken_` 键的 setItem 抛 QuotaExceeded）：原值
 *      **仍在存储里**（不被销毁）、启动零未捕获异常、UI 照常渲染，且诊断缓冲里**点到了失败原因**
 *      —— "保留原值"必须对用户可解释，否则只是把静默换了个方向。
 *   ③ 真浏览器里 `getTasks()` / `getActiveTasks()` 对这种形状退化成 `[]` 而不是抛，
 *      且整个启动过程诊断缓冲里**没有任何 `.filter is not a function`**（读者守卫的现场锁）。
 *
 * 跑哪几个项目：desktop + tablet（config 的 testIgnore 决定，mobile 档只跑移动专属 spec）——
 *   本条测的是数据层启动语义，与视口无关，两档同绿即可。
 * 全程不联网：只读 file:// 本地产物。
 */
import { test, expect } from "./_fixture.js";

const FILE_URL = "./agent-workbench.html";
const BAD = JSON.stringify({ broken: true }); // 合法 JSON 但非数组：正是校验器会判"格式异常"的那一类

/** 先注册页内错误收集，再 goto —— 漏了这一步就等于允许启动崩 */
function watchErrors(page) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(String((e && e.message) || e)));
  return errors;
}

async function seedCorruptTasks(page, { breakBackup = false } = {}) {
  await page.addInitScript(({ bad, blockBackup }) => {
    try { localStorage.setItem("wb_agent_tasks", bad); } catch (e) { /* 存储不可用则保持默认路径 */ }
    if (blockBackup) {
      const orig = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) {
        /* 只掐断"损坏原值备份"这一类写入，模拟配额满 / 隐私模式；其余写入照常 */
        if (String(k).indexOf("_broken_") >= 0) {
          const err = new Error("QuotaExceededError (e2e injected)");
          err.name = "QuotaExceededError";
          throw err;
        }
        return orig.call(this, k, v);
      };
    }
  }, { bad: BAD, blockBackup: breakBackup });
}

async function booted(page) {
  await page.waitForSelector("#main", { state: "attached", timeout: 15_000 });
  await expect(page.locator(".topbar"), "顶栏必须照常渲染").toBeVisible();
  await expect(page.locator("#side"), "侧栏必须照常渲染").toBeVisible();
  await expect(page.locator("#main"), "主内容必须照常渲染").toBeVisible();
  /* 错误边界的兜底页（含「数据异常」）出现 = 启动链真的崩过 */
  await expect(page.locator("#main"), "主内容不得落到数据异常兜底页").not.toContainText("数据异常");
}

const diag = (page) => page.evaluate(() =>
  (typeof window.getDiag === "function" ? window.getDiag() : []).map((d) => String(d.msg || "")));

test.describe("存储里有一个形状不对的 tasks 键时的启动不变量", () => {
  test.beforeAll(() => { test.skip(!process.env.E2E, "set E2E=1 to run"); });

  test("① 备份可用：原值先备份、再重置为空，启动零未捕获异常", async ({ page }) => {
    const errors = watchErrors(page);
    await seedCorruptTasks(page);
    await page.goto(FILE_URL);
    await booted(page);

    const after = await page.evaluate(() => localStorage.getItem("wb_agent_tasks"));
    expect(after, "备份成功时行为不变：损坏值应被重置为 []").toBe("[]");

    const backed = await page.evaluate((bad) => {
      const keys = Object.keys(localStorage).filter((k) => k.indexOf("_broken_") >= 0);
      return { count: keys.length, kept: keys.map((k) => localStorage.getItem(k)).indexOf(bad) >= 0 };
    }, BAD);
    expect(backed.count, "必须写出一条 _broken_ 备份键（否则所谓重置就是销毁）").toBeGreaterThan(0);
    expect(backed.kept, "备份键里必须原样存着损坏的原始串").toBe(true);

    expect(errors, "损坏数据启动不得抛未捕获异常：" + errors.join(" | ")).toEqual([]);
  });

  test("② 备份写失败：原值保留不销毁、启动不崩、诊断里说清原因", async ({ page }) => {
    const errors = watchErrors(page);
    await seedCorruptTasks(page, { breakBackup: true });
    await page.goto(FILE_URL);
    await booted(page);

    const after = await page.evaluate(() => localStorage.getItem("wb_agent_tasks"));
    expect(after, "备份没成功就绝不重置 —— 原值必须还在存储里等人工找回").toBe(BAD);

    /* ③ 读者收口点在真浏览器里的行为：退化成空表而不是抛 */
    const reads = await page.evaluate(() => ({
      tasks: window.getTasks().length,
      active: window.getActiveTasks().length,
    }));
    expect(reads.tasks, "getTasks() 面对非数组原值应返回空表").toBe(0);
    expect(reads.active, "getActiveTasks() 面对非数组原值应返回空表").toBe(0);

    const dg = await diag(page);
    expect(
      dg.some((m) => /\.filter is not a function|is not a function/.test(m)),
      "启动链里不许有形状不符导致的 TypeError（诊断缓冲）：" + dg.join(" | ")
    ).toBe(false);
    expect(
      dg.some((m) => /broken-data backup FAILED/.test(m) && /tasks/.test(m)),
      "必须留痕为什么没重置，且点名是哪个键 —— 否则用户只看到一个没变化的坏数据"
    ).toBe(true);

    expect(errors, "备份失败路径不得抛未捕获异常：" + errors.join(" | ")).toEqual([]);
  });
});
