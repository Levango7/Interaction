/**
 * form-controls.spec.js —— 表单控件**交互层**守护（日期手输 + 下拉可滚）
 * ----------------------------------------------------------------------------
 * 这两个用例都来自用户实测反馈的真 bug（v3.7.43 修复），且都属于
 * 「静态检查/单测发现不了、只有真浏览器操作才暴露」的类型：
 *
 *  ① **日期框完全无法手输**（用户："时间这个时分秒为什么只能下拉框选择，
 *     不能手动输入？应该是能选择、也能输入的吧"）
 *     根因：模板写了 `inputmode="none"` —— 本意是"移动端不弹软键盘"，
 *     桌面端把键盘输入一并吞掉；且没有任何 input 委托解析键入值。
 *     实测证据：点击后面板正常弹出，但键入 "2026-10-01" 后 input.value 仍是 ""。
 *
 *  ② **滚动下拉列表，列表当场缩回去**（用户："一滑动，下拉框就缩回去"）
 *     根因：`window.addEventListener("scroll", dsClose, true)` 用了**捕获阶段**，
 *     于是收得到任意元素的 scroll —— 包括下拉列表自己（.ds-list 有
 *     max-height:264px; overflow-y:auto）。列表内一滚就被自己关掉。
 *     实测证据：288 项的时间下拉 h=264 / scrollHeight≈9947，却 scrollTop 恒为 0。
 *
 * 本文件用**真实鼠标/键盘事件**复现并锁死这两条，防止回退。
 * 守护策略同其它 e2e：默认跳过，E2E=1 才跑。
 */
const { test, expect } = require("@playwright/test");

const APP_URL = "./agent-workbench.html";

/* 进入有日期字段的场景（办公 → 会议）。办公是默认场景，会议 tab 里有 date 字段。 */
async function gotoForm(page) {
  await page.goto(APP_URL);
  await page.waitForSelector("#main", { timeout: 15_000 });
  await page.click("text=会议", { timeout: 10_000 }).catch(() => {});
  await page.waitForTimeout(700);
}

const DATE_SEL = 'input[data-date-picker="1"]';

test.describe("表单控件交互不变量", () => {
  test.beforeAll(() => {
    test.skip(!process.env.E2E, "set E2E=1 to run");
  });

  test.beforeEach(async ({ page }) => {
    page.on("dialog", async (d) => { try { await d.accept(); } catch (e) { /* ignore */ } });
  });

  /* ---------- ① 日期框必须能**手输** ---------- */
  test("日期框：鼠标点击后可键盘输入，且面板实时跟随", async ({ page }) => {
    await gotoForm(page);

    const box = page.locator(DATE_SEL).first();
    await expect(box, "会议表单应存在日期字段").toHaveCount(1);

    /* 关键回归点：inputmode="none" 会让桌面端也吞掉键盘输入。
       这里显式断言它**不存在**，让"手滑加回来"在 CI 上立刻红。 */
    const im = await box.getAttribute("inputmode");
    expect(im, '日期框不应再带 inputmode="none"（会吞掉键盘输入）').not.toBe("none");

    // 鼠标点击 → 焦点应留在输入框（否则没法直接敲）
    await box.click();
    await page.waitForTimeout(350);
    const focusOnInput = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      return document.activeElement === el;
    }, DATE_SEL);
    expect(focusOnInput, "鼠标点击日期框后焦点应留在输入框（便于直接键入）").toBe(true);

    // 直接敲（不重新点击）
    await page.keyboard.type("2026-10-01", { delay: 30 });
    await page.waitForTimeout(300);
    await expect(box, "键入的日期应真实写入输入框").toHaveValue("2026-10-01");

    // 面板应跟随跳到该月
    const title = await page.evaluate(() => {
      const e = document.querySelector(".dp-panel .dp-title");
      return e ? e.textContent.trim() : null;
    });
    expect(title, "面板应跟随输入跳到 2026 年 10 月").toContain("2026");
  });

  test("日期框：宽松格式可解析，非法值被清空不残留", async ({ page }) => {
    await gotoForm(page);
    const box = page.locator(DATE_SEL).first();

    /* ⚠️ 每轮结束都必须确保**面板已关**。
       日期面板打开时会有 .dp-overlay（position:fixed;inset:0）盖住全屏，
       下一轮的点击会先落到 overlay 上（只触发"点外部关闭"），
       表现为"点不动输入框"、locator 一直等不到 → 用例挂死（踩过）。
       这里改用真实鼠标点击聚焦（见 typeAndBlur），并在每轮开头主动关掉残留面板。

       ⚠️ v3.7.43：**不要用 JS `el.focus()` 代替鼠标点击**。
       踩过（_probe/replay-case2.mjs）：程序化 focus 不带 pointerdown，
       会被应用的 `_dpPointerDown` 判据当成"键盘进入"，
       于是 `_dpOpen` 把焦点移进日格（而不是留在输入框）→
       后续 `keyboard.type` 全打到日格上，输入框始终为空，
       表现为所有断言都拿到空值（误以为功能坏了）。
       真实鼠标点击（page.click）会先派发 pointerdown，判据正确。 */
    async function closePanel() {
      await page.evaluate(() => {
        const ov = document.querySelector(".dp-overlay");
        if (ov) ov.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      });
      await page.waitForTimeout(200);
    }

    async function typeAndBlur(text) {
      await closePanel();
      /* 真实鼠标点击 → 触发 pointerdown → 应用判为"鼠标进入"，
         焦点留在输入框，且（v3.7.43）已有值会被全选，直接敲即整体替换。 */
      await box.click({ timeout: 8_000 });
      await page.waitForTimeout(250);
      /* 全选已被应用处理；为稳妥再显式全选一次，确保是"替换"而非"插入" */
      await box.press("Control+a");
      await page.keyboard.type(text, { delay: 25 });
      await page.waitForTimeout(200);
      await box.evaluate((el) => el.blur());
      await page.waitForTimeout(350);
      return box.evaluate((el) => (el ? el.value : "(元素不存在)"));
    }

    // 斜杠 → 规范化为短横
    expect(await typeAndBlur("2026/12/25"), "斜杠格式应被接受并规范化").toBe("2026-12-25");
    // 八位纯数字 → 规范化
    expect(await typeAndBlur("20270315"), "八位纯数字应被接受并规范化").toBe("2027-03-15");
    /* 非法值必须清空 —— 这块曾漏过：_dpParseVal 的正则只校验 \d{2} 格式、
       不校验范围，于是 "2026-13-45"（13 月 45 日）被当成合法值存了下来。 */
    expect(await typeAndBlur("2026-13-45"), "非法日期（13 月 45 日）应被清空，不留脏值").toBe("");
    // 闰年 2/29 合法
    expect(await typeAndBlur("2028-02-29"), "闰年 2 月 29 日应被接受").toBe("2028-02-29");
    // 平年 2/29 非法
    expect(await typeAndBlur("2027-02-29"), "平年 2 月 29 日应被拒绝").toBe("");

    // 收尾：确认面板已关（不留 overlay 影响后续用例）
    await closePanel();
    expect(await page.evaluate(() => !!document.querySelector(".dp-overlay")), "用例结束后面板应已关闭").toBe(false);
    expect(box, "日期框应始终存在").toHaveCount(1);
  });

  test("日期框：键盘 Tab 进入时焦点移入日格（键盘导航可用）", async ({ page }) => {
    await gotoForm(page);

    /* 鼠标点开时焦点留在输入框；键盘进入时应把焦点移进日格，
       否则 ←→↑↓ 那套 roving tabindex 导航永远不成立。 */
    const focused = await page.evaluate((sel) => {
      const target = document.querySelector(sel);
      const all = Array.from(document.querySelectorAll("input:not([type=hidden]), select, textarea, button"))
        .filter((x) => { const r = x.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
      const i = all.indexOf(target);
      if (i <= 0) return false;
      all[i - 1].focus();
      return true;
    }, DATE_SEL);
    expect(focused, "应能定位到日期框的前驱元素").toBe(true);

    await page.keyboard.press("Tab");
    await page.waitForTimeout(450);

    const st = await page.evaluate(() => ({
      isDay: !!(document.activeElement.classList && document.activeElement.classList.contains("dp-day")),
      panelOpen: !!document.querySelector(".dp-panel"),
    }));
    expect(st.panelOpen, "Tab 进入后日期面板应打开").toBe(true);
    expect(st.isDay, "键盘进入时焦点应落在日格上（使方向键导航可用）").toBe(true);
  });

  /* ---------- ② 下拉列表必须**能滚动** ---------- */
  test("下拉列表：列表内滚动不关闭，页面滚动才关闭", async ({ page }) => {
    await gotoForm(page);

    /* ⚠️ 这里**必须用页面上真实存在的时间下拉**（会议场景的「开始时间」，288 项），
       不要在 document.body 里注入巨型 DOM ——
       踩过：注入 288 项的 fixed 浮层 + 触发 MutationObserver 增强，
       渲染进程在用例中途直接崩掉（`Protocol error: session closed`），
       表现为"3 did not run / 挂到 600s 超时"，看起来像测试挂死，其实是浏览器死了。
       真实字段既稳定又更贴近用户场景。 */
    const TIME_SEL = 'select[data-editable="1"]';
    const sel = page.locator(TIME_SEL).first();
    await expect(sel, "会议记录表单应存在可编辑的时间下拉").toHaveCount(1);
    expect(await page.evaluate((s) => document.querySelector(s).options.length, TIME_SEL),
      "时间下拉应是 288 项量级（否则测不到列表溢出）").toBeGreaterThan(100);

    // 用原生 trigger 点击打开（避免与浮层层级竞争）
    await page.evaluate((s) => { const el = document.querySelector(s); el.__ds && el.__ds.trigger.click(); }, TIME_SEL);
    await page.waitForTimeout(400);

    const geo = await page.evaluate(() => {
      const l = document.querySelector(".ds-list:not([hidden])");
      if (!l) return null;
      const r = l.getBoundingClientRect();
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + 40),
        canScroll: l.scrollHeight > l.clientHeight, scrollH: l.scrollHeight };
    });
    expect(geo, "下拉列表应已打开").not.toBeNull();
    expect(geo.canScroll, "真实时间列表应溢出（否则测不到滚动）").toBe(true);

    // ① 在列表内部滚动 → 必须保持打开且真的滚动了
    await page.mouse.move(geo.x, geo.y);
    await page.mouse.wheel(0, 300);
    await page.waitForTimeout(450);
    const inList = await page.evaluate(() => {
      const l = document.querySelector(".ds-list:not([hidden])");
      return { open: !!l, scrollTop: l ? l.scrollTop : -1 };
    });
    expect(inList.open, "在列表内滚动**不应**关闭下拉（v3.7.43 修复的真 bug）").toBe(true);
    expect(inList.scrollTop, "列表应真的滚动起来（此前 scrollTop 恒为 0）").toBeGreaterThan(0);

    /* ② 在页面空白处滚动 → 列表**保持打开且与触发框保持贴合**。
       ⚠️ v3.7.44 语义变更：旧断言是"滚页面就关"——那是**误关**的根源之一。
       列表 .ds-list 是 position:absolute 定位于 .ds-select，与触发框同在
       .main-wrap 滚动容器内：容器滚动时两者**一起位移、不会错位**，
       此时关闭只会打断用户（滚着页面想继续选时间，列表却没了）。
       新不变量：任何滚动之后，列表与触发框的间距必须仍 ≤24px（贴合）；
       真正错位（间距 >24px）才会被关闭 —— 这是 v3.7.44 的关闭判据本身。 */
    await page.mouse.move(640, 400);
    await page.mouse.wheel(0, 300);
    await page.waitForTimeout(500);
    const pageScroll = await page.evaluate(() => {
      const inst = document.querySelector('select[data-editable="1"]').__ds;
      if (!inst || inst.list.hidden) return { open: false };
      const tr = inst.trigger.getBoundingClientRect();
      const lr = inst.list.getBoundingClientRect();
      const gap = (lr.top >= tr.bottom) ? (lr.top - tr.bottom)
                : (lr.bottom <= tr.top) ? (tr.top - lr.bottom) : 0;
      return { open: true, gap: Math.round(gap) };
    });
    expect(pageScroll.open, "滚动页面后下拉应保持打开（列表与触发框同容器、一起位移）").toBe(true);
    expect(pageScroll.gap, "页面滚动后列表应仍贴合触发框（间距 ≤24px，v3.7.44 错位判据）").toBeLessThanOrEqual(24);

    // ③ 列表不得被祖先滚动容器裁切（用户"列表被窗口/容器硬切、上半截点不到"的回归守护）
    const clipCheck = await page.evaluate(() => {
      const l = document.querySelector(".ds-list:not([hidden])");
      if (!l) return null;
      const lr = l.getBoundingClientRect();
      let clip = null, p = l.parentElement;
      while (p && p !== document.body){
        if (getComputedStyle(p).overflowY !== "visible"){ clip = p; break; }
        p = p.parentElement;
      }
      if (!clip) return { hasClip: false };
      const cr = clip.getBoundingClientRect();
      return {
        hasClip: true,
        clippedTop: lr.top < cr.top - 1,
        clippedBottom: lr.bottom > cr.bottom + 1,
      };
    });
    expect(clipCheck, "应能定位列表的裁切容器").not.toBeNull();
    expect(clipCheck.clippedTop, "列表顶部不得被祖先滚动容器裁切").toBe(false);
    expect(clipCheck.clippedBottom, "列表底部不得被祖先滚动容器裁切").toBe(false);
  });
});
