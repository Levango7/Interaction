/**
 * draw-responsive.spec.js —— Design 模式窄屏零溢出 + 画布真指针可用（真浏览器量布局）
 * ----------------------------------------------------------------------------
 * 为什么必须走 e2e：`docs/design-mode-phase-b.md` 的三栏网格是 `240px / 1fr / 300px`，
 * 在 320/375/412 上 jsdom 量不出来（没有布局引擎），CSS 文本存在 ≠ 渲染不溢出
 * （本仓踩过的坑：元素存在≠可见可点，topbar-overflow 同一口径）。
 *
 * 钉四件事：
 *  ① ≤1023px 单栏：横向溢出 = 0，且画布真的占满（宽 + 高），图列表停靠收起；
 *     另守 2026-11-02 布局修复的回归：画布高度不再退化、AI 浮条不盖底部导航。
 *  ② 画布在窄屏仍可用：真指针放一个节点 → 命中 `g.dnode` → 拖动后坐标变化。
 *      只测"渲染出 SVG"不算数 —— 那样窄屏给一块死图也能绿。
 *  ③ 真实双击改名（2026-11-02 修复）：CDP 双击复现真人双击（Chromium 对注入事件 detail=0，
 *      故双击判据=同一目标 350ms 内第二击）——修复前画布每次 pointerdown 都重建 SVG，
 *      真实用户的双击根本触发不了改名。
 *  ④ 桌面图列表停靠落位（2026-11-02 修复）：必须是 .body 的网格项且完全在视口内
 *      ——修复前误挂 nav.side，CSS 网格规则全失效、dock 底部越出视口。
 *
 * 守护策略同其余 spec：默认跳过，E2E=1 才跑。
 */
const { test, expect } = require("./_fixture");

const APP_URL = "./agent-workbench.html";
const NARROW = [320, 375, 412];

test.beforeAll(() => { test.skip(!process.env.E2E, "set E2E=1 to run"); });

test.describe("Design 模式窄屏", () => {
  test.use({ viewport: { width: 375, height: 667 } });

  /** 切到 Design 模式（2026-11-03 起模式按钮不再盲循环；2026-11-10 起入口是左上角
   *  胶囊分段开关——直接点「设计」段。旧契约的两连击=work→code→design，早已失效）。
   *  ⚠️ 选择器钉住 `.app > .body`：正文列表项曾复用同名 `.body`，裸 `.body` 在 Playwright
   *  严格模式下会因命中多个元素而报错（本 spec 首轮 CI 的真实红法）；2026-11-03 那批列表项
   *  已改名 `.body-row`（496607f），`.body` 重新唯一，但钉壳选择器留作保险，防将来再有复用。 */
  const SHELL = ".app > .body";
  async function toDesign(page) {
    await page.click('#uiModePill .mode-pill-item[data-mode="design"]');
    await expect(page.locator(SHELL)).toHaveClass(/design-mode/);
    await page.waitForSelector("#drawCanvasHost svg", { state: "attached" });
  }

  for (const w of NARROW) {
    test(`① ${w}px Design 模式零横向溢出，画布占满中栏`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 700 });
      await page.goto(APP_URL);
      await toDesign(page);
      const m = await page.evaluate(() => {
        const doc = document;
        const stage = document.getElementById("drawStage");
        const host = document.getElementById("drawCanvasHost");
        const dock = document.getElementById("diagramDock");
        const sr = stage ? stage.getBoundingClientRect() : null;
        const hr = host ? host.getBoundingClientRect() : null;
        const rail = document.getElementById("chatPanelRail");
        const mob = document.getElementById("mobBar");
        const rr = rail ? rail.getBoundingClientRect() : null;
        const mr = mob ? mob.getBoundingClientRect() : null;
        return {
          scrollWidth: doc.documentElement.scrollWidth,
          clientWidth: doc.documentElement.clientWidth,
          stageW: sr ? Math.round(sr.width) : -1,
          hostW: hr ? Math.round(hr.width) : -1,
          hostH: hr ? Math.round(hr.height) : -1,
          dockShown: dock ? getComputedStyle(dock).display !== "none" : false,
          railBottom: rr ? Math.round(rr.bottom) : -1,
          mobTop: mr ? Math.round(mr.top) : -1,
        };
      });
      expect(m.scrollWidth, `视口 ${w}px 出现横向溢出`).toBeLessThanOrEqual(m.clientWidth);
      /* 画布区铺满视口；宿主再扣掉 #drawStage 的 8px 两侧内边距与 1px 边框。
         容差写死在这些实测量上，不用「乘以百分比」那种会随视口变宽的松判据。 */
      expect(m.stageW, `画布区必须铺满视口宽度（单栏降级）；实测 ${m.stageW}/${m.clientWidth}`)
        .toBeGreaterThanOrEqual(m.clientWidth - 2);
      expect(m.hostW, `画布宿主宽度应随视口收缩；实测 ${m.hostW}，画布区 ${m.stageW}`)
        .toBeGreaterThanOrEqual(m.stageW - 20);
      /* 2026-11-02 修复前 .body.design-mode{display:block} 让 main-wrap 高度退化为
         SVG viewBox 固有宽高比，700 高视口下画布只有约 200px（844 高视口也只有 242）。
         修复后实测 320/375/412×700 均为 374；断言 300 留渲染浮动余量。 */
      expect(m.hostH, `画布宿主必须真正铺满中栏高度；实测 ${m.hostH}`).toBeGreaterThan(300);
      expect(m.dockShown, "窄屏图列表停靠应收起（三栏在 320 上必溢出）").toBe(false);
      /* 同修复带出的回归守卫：底部导航是 position:fixed，rail 若留在流内底部会与它
         同层叠互相盖住。修复方案 = 窄屏 design 下底栏改 static 进列布局，rail 落它上方。 */
      expect(m.railBottom, `AI 浮条不得盖住底部导航；rail bottom=${m.railBottom}, 底栏 top=${m.mobTop}`)
        .toBeLessThanOrEqual(m.mobTop);
    });
  }

  test("② 窄屏画布真能用：放一个节点 + 拖动它（坐标真的变了）", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 700 });
    await page.goto(APP_URL);
    await toDesign(page);

    /* 放节点走工具条按钮（与用户路径一致，不是直接调 API） */
    await page.click('.dc-toolbar .dc-btn[data-dshape="rect"]');
    const node = page.locator("#drawCanvasHost g.dnode").first();
    await expect(node).toBeVisible();

    const before = await page.evaluate(() => {
      const svg = document.getElementById("drawSvg");
      const d = dcActive();
      const n = d.nodes[0];
      const sr = svg.getBoundingClientRect();
      /* 世界坐标 → 屏幕坐标（与产品同一套 getScreenCTM 换算） */
      const pt = svg.createSVGPoint();
      pt.x = n.x + n.w / 2; pt.y = n.y + n.h / 2;
      const sc = pt.matrixTransform(svg.getScreenCTM());
      return { id: n.id, x: n.x, y: n.y, sx: sc.x, sy: sc.y, svgW: Math.round(sr.width) };
    });

    /* 真指针拖动（Playwright 的 mouse 走完整事件链：pointerdown/move/up） */
    const box = page.viewportSize();
    const cx = Math.min(Math.max(before.sx, 20), box.width - 20);
    const cy = Math.min(Math.max(before.sy, 20), box.height - 20);
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 40, cy + 30, { steps: 6 });
    await page.mouse.up();

    const after = await page.evaluate((id) => {
      const d = dcActive();
      const n = d.nodes.find((m) => m.id === id);
      return { x: n.x, y: n.y };
    }, before.id);
    expect(after.x, "拖动后 X 必须变化（窄屏不是死图）").not.toBe(before.x);
    expect(after.y, "拖动后 Y 必须变化").not.toBe(before.y);
    /* 10px 吸附：落点必须是 10 的整数倍 */
    expect(after.x % 10, "坐标应吸附到 10px 网格").toBe(0);
    expect(after.y % 10, "坐标应吸附到 10px 网格").toBe(0);
  });

  test("③ 真实双击改名（同一目标 350ms 内第二击）：弹浮层并回写节点文字", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 700 });
    await page.goto(APP_URL);
    await toDesign(page);

    await page.click('.dc-toolbar .dc-btn[data-dshape="rect"]');
    const node = page.locator("#drawCanvasHost g.dnode").first();
    await expect(node).toBeVisible();
    const before = await page.evaluate(() => {
      const n = dcActive().nodes[0];
      return { id: n.id, text: n.text };
    });

    /* 真实双击 = CDP clickCount=2，与真人鼠标走同一管线。
       修复前这里必红：首击 pointerdown 会触发整画布重渲染（host.innerHTML=...），
       按下时命中的元素在抬起前已被替换，浏览器因此不合成 click/dblclick，
       改名浮层对真实鼠标用户永不出现（线上 v3.7.152 真浏览器实测确认）。
       修复后第二击在重渲染之前由双击判据（detail===2 或 350ms 时间窗）转交改名逻辑。 */
    await node.dblclick({ delay: 80 });

    /* 浮层 input 直接挂 body（position:fixed，无类名——按位置与类型定位） */
    const input = page.locator('body > input[type="text"]');
    await expect(input).toBeVisible();
    await input.fill("双击改名");
    await input.press("Enter");

    const after = await page.evaluate((id) => {
      const n = dcActive().nodes.find((m) => m.id === id);
      return n.text;
    }, before.id);
    expect(after, "双击后节点文字必须回写").toBe("双击改名");
  });

  test("④ 桌面（≥1024）图列表停靠落位：是 .body 网格项且完全在视口内（2026-11-02 修复）", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(APP_URL);
    await toDesign(page);
    const m = await page.evaluate(() => {
      const dock = document.getElementById("diagramDock");
      const b = dock ? dock.getBoundingClientRect() : null;
      return {
        inSide: dock ? !!dock.closest("nav.side") : true,
        parentIsBody: dock ? dock.parentElement.classList.contains("body") : false,
        dockBottom: b ? Math.round(b.bottom) : -1,
        dockH: b ? Math.round(b.height) : -1,
        vh: innerHeight,
      };
    });
    /* 修复前 dock 由 side.appendChild 挂进 nav.side：CSS 把它按 .body 的 1/2 网格项写
       （grid-column:1;grid-row:2），作为 side 后代这些规则全部失效，落点 bottom=971
       越出 900 视口，头部只有约 14px 可见、要滚侧栏才看得到图列表。 */
    expect(m.inSide, "图列表不得是 nav.side 的后代（CSS 按它作为 .body 网格项写）").toBe(false);
    expect(m.parentIsBody, "图列表父节点必须是 .body").toBe(true);
    expect(m.dockH, "dock 必须有实际高度").toBeGreaterThan(0);
    expect(m.dockBottom, `dock 必须完全落在视口内；实测 bottom=${m.dockBottom}/vh=${m.vh}`)
      .toBeLessThanOrEqual(m.vh);
  });

  test("⑤ 768–1023 中间档 Design：侧栏收起、底栏顶上、画布真正铺开（2026-11-05 #110 方案乙）", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto(APP_URL);
    await toDesign(page);
    const m = await page.evaluate(() => {
      const side = document.getElementById("side");
      const mob = document.getElementById("mobBar");
      const host = document.getElementById("drawCanvasHost");
      const svg = document.getElementById("drawSvg");
      const hr = host ? host.getBoundingClientRect() : null;
      const sv = svg ? svg.getBoundingClientRect() : null;
      return {
        sideShown: side ? getComputedStyle(side).display !== "none" : true,
        mobShown: mob ? getComputedStyle(mob).display !== "none" : false,
        mobBtns: mob ? mob.querySelectorAll(".mob-bar-btn").length : 0,
        hostH: hr ? Math.round(hr.height) : -1,
        svgH: sv ? Math.round(sv.height) : -1,
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      };
    });
    /* 修前 768 档：#side 可见且 flex:0 0 auto 吃掉 874px，main-wrap 只剩 85px
       ⇒ hostH≈2 / svgH=0、图被画到视口外。下面四条会同时红，是本用例的射程，
       不是靠「元素存在」蒙绿。320/375/412 三档没有这条问题（侧栏本就走底栏隐藏）。 */
    expect(m.sideShown, "中间档侧栏必须收起，否则它会吃掉几乎全部高度").toBe(false);
    expect(m.mobShown, "侧栏收起后必须有底部导航顶替，不能让用户没地方切场景").toBe(true);
    expect(m.mobBtns, "底栏必须真的有可点按钮").toBeGreaterThan(0);
    expect(m.hostH, `画布宿主必须真正铺开；实测 ${m.hostH}`).toBeGreaterThan(300);
    expect(m.svgH, `SVG 必须有真实高度；实测 ${m.svgH}`).toBeGreaterThan(300);
    expect(m.scrollWidth, "768 档不得出现横向溢出").toBeLessThanOrEqual(m.clientWidth);
    /* 反向对照：底栏不是摆设，真点一个按钮要能弹出抽屉（抽屉外观也在本档补齐了）。 */
    await page.locator("#mobBar .mob-bar-btn").first().click();
    await expect(page.locator("#sideSheet"), "点底栏按钮必须弹出场景抽屉").toBeVisible();
  });
});
