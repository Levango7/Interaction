/**
 * 侧栏 17 页冒烟（v3.7.120 · 评估补缺）
 * ----------------------------------------------------------------------------
 * 背景：本仓 e2e 一直按「功能主题」切片（i18n / mobile / viewport / theme-matrix …），
 * 不按页面切片。评估（docs/evaluation-test-coverage.md）实测：17 项边栏菜单里 9 项
 * 只有渲染级覆盖、没有任何「打开该页 → 断言其专属内容」的用例。
 *
 * 为什么一个文件覆盖 17 页、而不是每页开一个 spec：每个用例都要新起 chromium 加载
 * 3.7MB 单文件（单例启动开销约 2.7s），17 次冷启动会直接把 e2e 时长推上去；本 spec
 * 在**一次导航后顺序切页**，只付一次启动成本（同 toolbox.spec.js 的做法）。
 *
 * 清单**运行时从 _buildSideMenu() 取**，不写死 —— 写死的话新增/改名菜单项会悄悄脱离
 * 覆盖（同 toolbox.spec.js 的理由）。_buildSideMenu() 返回五组共 17 个节点：
 *   总览 4（主页/任务/场景联动/时间轴）+ 场景 7（ORDER 驱动）+ AI 1
 *   + 工具 2（工具箱/商店）+ 系统 3（回收站/设置/说明）。
 *
 * 每页断言：
 *   ① 导航项唯一可命中（挡住「选择器写错、locator 返回 0 也算过」这类空转）
 *   ② 切换后可见页面容器有实际文本（不是空壳）
 *   ③ 至少一个可交互控件（挡住"渲染出空壳"）
 *   ④ 切换过程无 pageerror / console error
 *   ⑤ 渲染结果无未插值的模板残渣（美元花括号 / [object Object] / undefined / NaN）
 *   ⑥ 375px 窄屏不产生横向溢出
 *
 * 默认跳过，E2E=1 才跑。桌面专属：≤767px 时侧栏 #side 不可见、改走 #mobBar + #sideSheet，
 * 那套 IA 归 mobile.spec.js。这里用**用例内 skip** 而不是改 playwright.config 的 project
 * 列表 —— 配置文件是共享面，能不动就不动。
 */
const { test, expect } = require("./_fixture");

const APP_URL = "./agent-workbench.html";
const BAD_ARTIFACTS = ["${", "[object Object]", "undefined", "NaN"];

/** 桌面专属：窄屏下侧栏不可见，本 spec 的点击路径不成立 */
function skipIfNarrow(page) {
  const vp = page.viewportSize();
  test.skip(!!vp && vp.width <= 767, "侧栏在窄屏下改走底部导航 + 抽屉，桌面 IA 不适用");
}

/** 取侧栏清单（运行时，不写死） */
async function sideMenuItems(page) {
  return page.evaluate(() => {
    const out = [];
    _buildSideMenu().forEach((g) =>
      (g.nodes || []).forEach((n) => {
        if (n && n.id) out.push({ id: n.id, label: n.label, sc: n.sc || "" });
      })
    );
    return out;
  });
}

/** 每项的点击选择器：有 sc 用 data-sc；AI / 设置 / 说明 没有 sc，用 data-menu */
function selOf(it) {
  return it.sc ? `#side .nav-item[data-sc="${it.sc}"]` : `#side .nav-item[data-menu="${it.id}"]`;
}

/* 取「当前可见的页面容器」：主区 / 设置抽屉 / 说明页，三选一。
   设置与说明不是渲染进 #main 的（设置会把 #drawer 移进 .main-wrap 变成整页），
   所以不能只盯 #main —— 只盯 #main 会把这两页误报成"空壳"。 */
const PROBE_FN = (artifacts) => {
  const cands = ["#main", "#drawer", "#helpPage"].map((s) => document.querySelector(s)).filter(Boolean);
  const root = cands.find((el) => el.getClientRects().length > 0) || cands[0] || document.body;
  const html = root.innerHTML || "";
  return {
    textLen: (root.textContent || "").trim().length,
    ctrls: root.querySelectorAll("input,textarea,select,button").length,
    hit: artifacts.filter((s) => html.includes(s)),
  };
};

test.describe("侧栏 17 页冒烟", () => {
  test.beforeAll(() => {
    test.skip(!process.env.E2E, "set E2E=1 to run");
  });

  test("每页都能打开、渲染出内容、且不报错", async ({ page }) => {
    skipIfNarrow(page);

    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message.split("\n")[0].slice(0, 140)));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push("[console] " + m.text().slice(0, 140));
    });

    await page.goto(APP_URL);
    await page.waitForSelector("#side .nav-item", { timeout: 15_000 });

    const items = await sideMenuItems(page);
    /* 覆盖面守门员：清单为空说明取数方式坏了，此时"全绿"毫无意义 */
    expect(items.length, "边栏应能枚举出 17 项菜单（4 总览 + 7 场景 + 1 AI + 2 工具 + 3 系统）")
      .toBeGreaterThanOrEqual(17);

    const problems = [];
    for (const it of items) {
      errors.length = 0;
      const sel = selOf(it);
      const n = await page.locator(sel).count();
      if (n !== 1) {
        problems.push(`${it.label}(${it.id}): 选择器 ${sel} 命中 ${n} 个，期望 1 个`);
        continue;
      }

      await page.click(sel);
      /* 等页面容器真的出内容，替代固定 sleep —— 固定 sleep 是本仓 flaky 的共性根因。
         这里只用作"尽快返回"的等待；真出不来内容会被下面的 textLen 断言如实报出来。 */
      await page
        .waitForFunction(
          () => {
            const cands = ["#main", "#drawer", "#helpPage"].map((s) => document.querySelector(s)).filter(Boolean);
            const root = cands.find((el) => el.getClientRects().length > 0);
            return !!root && (root.textContent || "").trim().length > 0;
          },
          null,
          { timeout: 5_000 }
        )
        .catch(() => {});

      const r = await page.evaluate(PROBE_FN, BAD_ARTIFACTS);

      if (r.textLen === 0) problems.push(`${it.label}: 页面无任何文本（空壳）`);
      if (r.ctrls < 1) problems.push(`${it.label}: 页面上没有任何可交互控件`);
      if (r.hit.length) problems.push(`${it.label}: 渲染结果含模板残渣 ${r.hit.join(" / ")}`);
      if (errors.length) problems.push(`${it.label}: 打开时报错 ${errors[0]}`);
    }

    /* 一次性报全，便于看出"是一页坏还是全体坏" */
    expect(problems, "侧栏页面冒烟问题：\n" + problems.join("\n")).toEqual([]);
  });

  test("17 页连切不残留、不报错", async ({ page }) => {
    skipIfNarrow(page);

    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message.split("\n")[0].slice(0, 140)));

    await page.goto(APP_URL);
    await page.waitForSelector("#side .nav-item", { timeout: 15_000 });

    const sels = (await sideMenuItems(page)).map(selOf);
    let clicked = 0;
    for (const s of sels) {
      if ((await page.locator(s).count()) === 1) {
        await page.click(s);
        clicked++;
      }
    }
    /* 防空转：一条都没点上时，"无报错"毫无意义 */
    expect(clicked, "应至少点到 17 个导航项").toBeGreaterThanOrEqual(17);
    await page.waitForTimeout(300);

    expect(errors, "连续切换 17 页出现报错：" + errors.join(" | ")).toEqual([]);
  });

  /* 溢出这条只在窄屏有意义，所以它自己把视口设成 375px。
     用 setActive + render 直接切页而不是点侧栏 —— 375px 下侧栏本来就不可见（那是移动 IA），
     点不到不是缺陷。没有 sc 的三项（AI / 设置 / 说明）由 uiView 驱动，不走这条路径，
     其窄屏表现由 viewport.spec.js 的触控目标不变量覆盖（如实说明，不假装全覆盖）。 */
  test("有 sc 的页面在 375px 下不产生横向溢出", async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForSelector("#side .nav-item", { timeout: 15_000 });
    await page.setViewportSize({ width: 375, height: 667 });

    const items = (await sideMenuItems(page)).filter((it) => it.sc && it.sc !== "");
    expect(items.length, "应至少取到 14 个 sc 驱动的页面").toBeGreaterThanOrEqual(14);

    const overflow = [];
    for (const it of items) {
      await page.evaluate((sc) => {
        setActive(sc);
        render();
      }, it.sc);
      await page.waitForFunction(() => (document.body.textContent || "").trim().length > 0, null, {
        timeout: 5_000,
      }).catch(() => {});
      const w = await page.evaluate(() => ({
        doc: document.documentElement.scrollWidth,
        win: window.innerWidth,
      }));
      /* 允许 1px 的舍入差 */
      if (w.doc > w.win + 1) overflow.push(`${it.label}(${it.sc}): ${w.doc} > ${w.win}`);
    }

    expect(overflow, "以下页面在 375px 下横向溢出：\n" + overflow.join("\n")).toEqual([]);
  });
});
