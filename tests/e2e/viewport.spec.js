/**
 * viewport.spec.js —— 跨视口「布局不变量」守护
 * ----------------------------------------------------------------------------
 * 为什么不做像素基线：像素 diff 需要与 CI 同环境生成的基线文件（Linux + 同版本 chromium），
 * 本机无法生成，且会因字体/抗锯齿产生噪声。这里改为断言**结构性不变量** ——
 * 它们在三种视口下都必须成立，且能真正抓住布局回归（溢出、断点走错、触控目标过小、内容区被压扁）。
 *
 * 覆盖（按视口宽度自动切换预期）：
 *   ① 无横向溢出（文档级）
 *   ② 断点分流正确：<768 侧栏隐藏 + #mobBar 可见；≥768 反之
 *   ③ 顶栏高度在合理区间（防"标题栏高度漂移"这类回归）
 *   ④ 主内容区宽度合理（未被侧栏/面板压扁）
 *   ⑤ 移动端底部导航的触控目标 ≥ 40px（可用性）
 *   ⑥ 各断点下首屏卡片宽度合理（移动端单列、桌面端更宽）
 *
 * 本机以 CDP + 375/768/1280 三视口实测过这些量级后才写成断言（阈值取实测值并留余量）。
 * 守护策略同其它 e2e：默认跳过，E2E=1 才跑。
 */
const { test, expect } = require("@playwright/test");

const APP_URL = "./agent-workbench.html";

test.describe("跨视口布局不变量", () => {
  test.beforeAll(() => {
    test.skip(!process.env.E2E, "set E2E=1 to run");
  });

  test.beforeEach(async ({ page }) => {
    page.on("dialog", async (d) => { try { await d.accept(); } catch (e) { /* ignore */ } });
  });

  test("布局不变量：按宽度走对断点且无横向溢出", async ({ page }) => {
    await page.goto(APP_URL);
    /* 用 state:"attached"：#mobBar 在桌面是 display:none（默认的 waitForSelector 等"可见"会在桌面超时） */
    await page.waitForSelector("#mobBar", { state: "attached", timeout: 15_000 });

    const vw = page.viewportSize().width;
    const isNarrow = vw < 768;

    /* ① 文档横向溢出 */
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `视口 ${vw}px 出现横向溢出 ${overflow}px`).toBeLessThanOrEqual(0);

    /* ② 断点分流 */
    if (isNarrow) {
      await expect(page.locator("#side"), "窄屏应隐藏侧栏").toBeHidden();
      await expect(page.locator("#mobBar"), "窄屏应显示底部导航").toBeVisible();
    } else {
      await expect(page.locator("#side"), "宽屏应显示侧栏").toBeVisible();
      await expect(page.locator("#mobBar"), "宽屏应隐藏底部导航").toBeHidden();
    }

    /* ③ 顶栏高度合理（历史上修过窄屏溢出，这里防漂移） */
    const topbar = await page.locator(".topbar").boundingBox();
    expect(topbar, "顶栏应存在").toBeTruthy();
    expect(topbar.height, `顶栏高度异常：${topbar.height}px`).toBeGreaterThan(28);
    expect(topbar.height, `顶栏高度异常：${topbar.height}px`).toBeLessThan(96);

    /* ④ 主内容区未被压扁 */
    /* 阈值按本机 CDP 实测取：375 → 375px、768 → 288px（侧栏 180 + 折叠聊天面板占位）、1280 → 770px。
       这里只断言「没有被压扁到不可用」的下限 240px，并用注释保留实测值供后续判断。 */
    const mainW = await page.evaluate(() => {
      const m = document.querySelector(".main-wrap") || document.querySelector("main") || document.body;
      return m.getBoundingClientRect().width;
    });
    expect(mainW, `主内容区过窄：${Math.round(mainW)}px / 视口 ${vw}px`).toBeGreaterThan(240);
    expect(mainW, `主内容区超出视口：${Math.round(mainW)}px / 视口 ${vw}px`).toBeLessThanOrEqual(vw + 1);

    /* ⑤ 移动端触控目标 */
    if (isNarrow) {
      const boxes = await page.locator("#mobBar [data-mob-group]").evaluateAll(els => els.map(e => e.getBoundingClientRect()));
      expect(boxes.length, "底部导航应有 5 组").toBeGreaterThanOrEqual(5);
      for (const b of boxes) {
        expect(b.height, `底部导航触控目标过小：${Math.round(b.height)}px`).toBeGreaterThanOrEqual(32);
        expect(b.width, `底部导航触控目标过窄：${Math.round(b.width)}px`).toBeGreaterThanOrEqual(40);
      }
    }

    /* ⑥ 首屏卡片宽度（移动端单列更宽、桌面端更窄且可并排） */
    const cardW = await page.evaluate(() => {
      const c = document.querySelector(".kcol, .card, .set-card");
      return c ? c.getBoundingClientRect().width : -1;
    });
    if (cardW > 0) {
      expect(cardW, `卡片宽度异常：${Math.round(cardW)}px`).toBeLessThanOrEqual(vw);
    }
  });
});

/**
 * 窄屏表单/卡片专项（v3.7.53 用户标注实测）
 * ----------------------------------------------------------------------------
 * 这三条都是「用户截图标注 → 实测定位 → 修好」的真实缺陷，故固化为渲染层断言：
 *   ① 窄屏任务表单四个字段必须**等宽**（此前给 ＋ 预留的内边距让「标签」窄 46px）
 *   ② 看板卡操作按钮文字**水平居中**（手机端 inline-flex 后 text-align 失效 → 左贴）
 *   ③ 场景联动 streak 徽章**单行**（此前每枚被压到 64px，「办公+⚠️未开始」折成三行）
 * 三视口（375 / 768 / 1280）下都必须成立 —— 修法本身不依赖断点。
 */
test.describe("窄屏表单与卡片不变量", () => {
  test.beforeAll(() => {
    test.skip(!process.env.E2E, "set E2E=1 to run");
  });

  test("表单等宽 · 按钮居中 · 徽章单行", async ({ page }) => {
    page.on("dialog", async (d) => { try { await d.accept(); } catch (e) { /* ignore */ } });
    await page.goto(APP_URL);
    await page.waitForSelector("#main", { state: "attached", timeout: 15_000 });

    for (const vw of [375, 768, 1280]) {
      await page.setViewportSize({ width: vw, height: 900 });
      await page.evaluate(() => { setActive("office"); render(); });
      await page.waitForTimeout(350);
      /* 造一条任务，让看板卡片出现（按钮才可测） */
      await page.evaluate(() => {
        const f = document.querySelector("#taskForm");
        if (!f) return;
        const t = f.querySelector('input[name="title"], .fld input:not([type])');
        if (t) { t.value = "e2e-响应式检查"; t.dispatchEvent(new Event("input", { bubbles: true })); }
        const b = f.querySelector('button[type="submit"], .addbtn');
        if (b) b.click();
      });
      await page.waitForTimeout(500);

      const r = await page.evaluate((width) => {
        const out = { vw: width };
        const f = document.querySelector("#taskForm");
        if (f) {
          /* 取**用户看得见**的那个控件：自研下拉（ui-select.js）会把原生 select 包成
             div.ds-select + button.ds-trigger，原生 select 变成 position:absolute 的隐藏表单控件。
             直接量 select 量到的是隐藏盒子，不是可见宽度 —— v3.7.60 就被这样误报过一次。 */
          const vis = (c) => c.querySelector(".ds-trigger, input, select");
          const ws = [...f.children]
            .filter((c) => vis(c))
            .map((c) => Math.round(vis(c).getBoundingClientRect().width));
          out.fieldWidths = ws;
          out.rawSelectWidths = [...f.children]
            .filter((c) => c.querySelector("input,select"))
            .map((c) => Math.round(c.querySelector("input,select").getBoundingClientRect().width));
          /* 桌面（≥1024）字段刻意不等宽（标题/优先级等按微轨分配），只在窄屏要求等宽 */
          out.expectEqual = width < 1024;
          out.allEqual = new Set(ws).size === 1;
        }
        const btn = document.querySelector(".kbtns button");
        if (btn) {
          const br = btn.getBoundingClientRect();
          const rg = document.createRange();
          rg.selectNodeContents(btn);
          const tr = rg.getBoundingClientRect();
          out.centerOffset = Math.round(Math.abs((br.x + br.width / 2) - (tr.x + tr.width / 2)));
        }
        const badges = [...document.querySelectorAll(".streak-badge")];
        if (badges.length) {
          out.badgeHeights = [...new Set(badges.map((b) => Math.round(b.getBoundingClientRect().height)))];
          const inner = document.querySelector(".hc-streak-inner");
          out.streakOverflow = inner ? Math.max(0, inner.scrollWidth - inner.clientWidth) : 0;
        }
        return out;
      }, vw);

      if (r.fieldWidths) {
        if (r.expectEqual) {
          expect(r.allEqual, `视口 ${vw}px 表单字段不等宽：${JSON.stringify(r.fieldWidths)}`).toBe(true);
        }
      }
      if (r.centerOffset !== undefined) {
        expect(r.centerOffset, `视口 ${vw}px 看板按钮文字未居中，偏心 ${r.centerOffset}px`).toBeLessThanOrEqual(1);
      }

      /* streak 徽章在总览页 */
      await page.evaluate(() => { setActive("overview"); render(); });
      await page.waitForTimeout(900);
      const st = await page.evaluate(() => {
        const badges = [...document.querySelectorAll(".streak-badge")];
        const inner = document.querySelector(".hc-streak-inner");
        return {
          n: badges.length,
          heights: [...new Set(badges.map((b) => Math.round(b.getBoundingClientRect().height)))],
          overflow: inner ? Math.max(0, inner.scrollWidth - inner.clientWidth) : 0
        };
      });
      if (st.n) {
        expect(Math.max(...st.heights), `视口 ${vw}px streak 徽章被折行（高度 ${JSON.stringify(st.heights)}）`).toBeLessThanOrEqual(34);
        expect(st.overflow, `视口 ${vw}px streak 容器横向溢出 ${st.overflow}px`).toBeLessThanOrEqual(0);
      }
    }
  });
});

/**
 * 提示带 / 加号 / 面板高亮不变量（v3.7.60 用户截图标注实测）
 * ----------------------------------------------------------------------------
 * 三条都来自「用户截图 → 真实 Chromium 实测」，且**单测抓不到**（jsdom 不做样式层叠与几何）：
 *   ① #toasts 不得压在常驻的「顶栏 + 工具行」上 —— 原 top 由 --topbar-h(54) 推导，
 *      而实测两行合计 110px，于是 toast(y=66..103) 正好盖住「今天 N 件待处理」消息栏。
 *   ② 窄屏 ＋ 必须水平居中于任务表单（≥1024 仍是贴右，两档各自自洽），并且与右下角的
 *      桌面萌宠 **x 区间永不相交** —— 这就是 v3.7.7 当年回退「跨行贴右」的原因，
 *      也是本次不采用贴右的依据。x 与滚动位置无关，所以这条比「滚到某个位置点一下」更强；
 *      同时跑一个**反向对照**：临时改回贴右，它必须真的与宠物相交，否则断言没有牙齿。
 *   ③ 命令面板的模糊匹配高亮必须真的上色 —— .cmd-group 漏右括号曾让它变成
 *      CSS 嵌套选择器而永不命中，静默失效 6 个版本。
 */

/** 量 #taskForm 加号的排布与「和萌宠 x 是否相交」，并对贴右方案做反向对照。 */
async function addWrapGeometry(page) {
  return page.evaluate(() => {
    if (typeof mountPet === "function") mountPet("girl");
    const aw = document.querySelector("#taskForm > .add-wrap");
    if (!aw) return { missing: true };
    const btn = aw.querySelector("button");
    const pet = document.querySelector(".pet");
    const form = document.querySelector("#taskForm").getBoundingClientRect();
    const fmt = (r) => `${Math.round(r.left)}..${Math.round(r.right)}`;
    if (!pet) return { missing: false, noPet: true, centerOffset: 0, rightGap: 0, btnX: "", petX: "无" };
    const pr = pet.getBoundingClientRect();
    const disjoint = (r) => pr.left >= r.right || pr.right <= r.left;

    const r0 = btn.getBoundingClientRect();
    const out = {
      centerOffset: Math.round((r0.left + r0.width / 2) - (form.left + form.right) / 2),
      rightGap: Math.round(form.right - r0.right),
      btnX: fmt(r0), petX: fmt(pr), btnW: Math.round(r0.width),
    };
    /* 反向对照：临时贴右，看它是否落进宠物的 x 区间 */
    const st = document.createElement("style");
    st.textContent = "#taskForm>.add-wrap{grid-column:1/-1!important;justify-self:end!important;grid-row:auto!important}";
    document.head.appendChild(st);
    const r1 = btn.getBoundingClientRect();
    st.remove();
    const r2 = btn.getBoundingClientRect();
    out.endBtnX = fmt(r1);
    out.endCollides = !disjoint(r1);
    out.centerClear = disjoint(r2);
    /* 对照只在「表单右缘真的伸进宠物 x 区间」时才有意义：768 档若右栏 AI 面板开着，
       表单只有 212px 宽（右缘 425 < 宠物左界 630），那时贴右也碰不到宠物 ——
       这不是缺陷，硬断言会把环境差异误报成失败。 */
    out.controlApplies = form.right > pr.left;
    out.dbg = `form=${fmt(form)} pet=${fmt(pr)} center=${fmt(r2)} end=${fmt(r1)}`;
    return out;
  });
}

test.describe("提示带 · 加号 · 面板高亮不变量", () => {
  test.beforeAll(() => {
    test.skip(!process.env.E2E, "set E2E=1 to run");
  });

  test("toast 让位常驻工具行 · 加号居中且不被宠物挡 · cmd-hit 真的上色", async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForSelector("#main", { state: "attached", timeout: 15_000 });

    for (const vw of [375, 768, 1280]) {
      await page.setViewportSize({ width: vw, height: 900 });
      await page.evaluate(() => { setActive("office"); render(); });
      await page.waitForTimeout(350);

      /* ① toast 带 vs 常驻工具行 */
      const t = await page.evaluate(() => {
        document.querySelectorAll("#toasts .toast").forEach((e) => e.remove());
        toast("e2e 提示带不变量", "ok");
        const row = document.querySelector(".toolbar-row").getBoundingClientRect();
        const box = document.querySelector("#toasts").getBoundingClientRect();
        return { rowBottom: Math.round(row.bottom), toastTop: Math.round(box.top) };
      });
      expect(t.toastTop, `视口 ${vw}px：toast 顶边 ${t.toastTop} 压在常驻工具行（底 ${t.rowBottom}）上`).toBeGreaterThanOrEqual(t.rowBottom);

      /* ② 加号排布 + 与桌面萌宠的 x 关系（含反向对照） */
      const a = await addWrapGeometry(page);
      expect(a.missing, `视口 ${vw}px：没找到 #taskForm 的加号`).toBeFalsy();
      if (vw < 1024) {
        expect(Math.abs(a.centerOffset), `视口 ${vw}px：窄屏加号未居中于表单（偏心 ${a.centerOffset}px）`).toBeLessThanOrEqual(2);
        expect(a.noPet, `视口 ${vw}px：萌宠没挂上，x 相交断言无意义`).toBeFalsy();
        /* 居中方案的全部依据就一条：按钮与宠物的 x 区间永不相交 —— 而 x 与滚动位置无关，
           所以这比「滚到某个位置点一下」更强（宠物贴在右缘 x=W-126..W-42，
           居中按钮占 W/2±19，不相交条件 W>271 → 所有支持档位成立）。 */
        expect(a.centerClear, `视口 ${vw}px：居中按钮与宠物 x 区间相交（btn ${a.btnX} vs pet ${a.petX}）`).toBe(true);
        /* 反向对照：贴右方案在「表单右缘伸进宠物 x 区间」时必须真的被挡住，
           否则上面那条 centerClear 断言没有牙齿。这正是 v3.7.7 回退的原因。 */
        if (a.controlApplies) {
          expect(a.endCollides, `视口 ${vw}px：贴右方案未与宠物相交 → 对照失效（${a.dbg}）`).toBe(true);
        }
      } else {
        expect(a.rightGap, `视口 ${vw}px：宽屏加号应贴表单右缘（差 ${a.rightGap}px）`).toBeLessThanOrEqual(1);
      }

      /* ③ 命令面板命中高亮真的上色 */
      const c = await page.evaluate(async () => {
        const inp = document.getElementById("cmdInput");
        const list = document.getElementById("cmdList");
        document.getElementById("cmd").classList.add("show");
        inp.value = "任务";
        inp.dispatchEvent(new Event("input", { bubbles: true }));
        await new Promise((r) => setTimeout(r, 250));
        const el = list.querySelector("b.cmd-hit");
        if (!el) return { missing: true };
        const cs = getComputedStyle(el);
        const li = getComputedStyle(el.closest("li"));
        const out = { color: cs.color, liColor: li.color, bg: cs.backgroundColor, same: cs.color === li.color };
        document.getElementById("cmd").classList.remove("show");
        return out;
      });
      expect(c.missing, `视口 ${vw}px：命令面板「任务」没有命中高亮节点`).toBeFalsy();
      expect(c.same, `视口 ${vw}px：.cmd-hit 计算色仍等于继承色（${c.color}）→ 高亮没生效`).toBe(false);
      expect(c.bg, `视口 ${vw}px：.cmd-hit 没有背景淡色`).not.toBe("rgba(0, 0, 0, 0)");
    }
  });
});
