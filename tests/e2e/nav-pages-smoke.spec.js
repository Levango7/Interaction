/**
 * 侧栏 + 工作台 tiles 冒烟（v3.7.120 · 评估补缺；刀 2 2026-11-16 扩面）
 * ----------------------------------------------------------------------------
 * 背景：本仓 e2e 一直按「功能主题」切片（i18n / mobile / viewport / theme-matrix …），
 * 不按页面切片。评估（docs/evaluation-test-coverage.md）实测：旧 17 项边栏菜单里 9 项
 * 只有渲染级覆盖、没有任何「打开该页 → 断言其专属内容」的用例。
 *
 * 刀 2（2026-11-16 接手续做）把 7 场景 + 场景联动从侧栏收进工作台 tiles，侧栏 17→10
 * （见 tests/ia-three-zones.test.js）。为不把覆盖缩水成「少测 8 页」，本 spec 同步改为
 * 10 个侧栏入口 + 8 个 tile（7 场景 + 场景联动）= 18 个目的地；仍是一次导航后顺序切页，
 * 只付一次 chromium 启动成本（同 toolbox.spec.js 的做法）。
 *
 * 清单**运行时从 _buildSideMenu() 取**，不写死 —— 写死的话新增/改名菜单项会悄悄脱离
 * 覆盖（同 toolbox.spec.js 的理由）。当前返回四组共 10 个节点：
 *   今日 3（主页/任务/时间轴）+ 工作台 1（工作台，tiles 页）
 *   + 助手 1（AI）+ 更多 5（工具箱/商店/回收站/设置/说明）。
 * tile 清单同样运行时从 `#main .wb-tile[data-tile-sc]` 取。
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
const { waitSideNav } = require("./helpers/wait-settled.cjs");

const APP_URL = "./agent-workbench.html";
const BAD_ARTIFACTS = ["${", "[object Object]", "undefined", "NaN"];

/** 桌面专属：窄屏下侧栏不可见，本 spec 的点击路径不成立 */
function skipIfNarrow(page) {
  const vp = page.viewportSize();
  test.skip(!!vp && vp.width <= 767, "侧栏在窄屏下改走底部导航 + 抽屉，桌面 IA 不适用");
}

/** 取侧栏清单（运行时，不写死） */
async function sideMenuItems(page) {
  /* 批十：桌面导航 5 项 = 对话/主页/任务/工作台/商店。这里读**实际渲染**的 nav-item，
     不再读 _buildSideMenu() 全量数据（那份仍 10 项，移动端底栏要用）。 */
  return page.evaluate(() =>
    Array.from(document.querySelectorAll("#side .nav-item")).map((el) => ({
      id: el.getAttribute("data-menu") || el.getAttribute("data-sc") || "",
      label: (el.textContent || "").trim(),
      sc: el.getAttribute("data-sc") || "",
      chat: el.getAttribute("data-chat") === "1",
    }))
  );
}

/** 每项的点击选择器：对话走 data-chat；有 sc 用 data-sc；其余用 data-menu */
function selOf(it) {
  if (it.chat) return '#side .nav-item[data-chat="1"]';
  return it.sc ? `#side .nav-item[data-sc="${it.sc}"]` : `#side .nav-item[data-menu="${it.id}"]`;
}

/** 刀 2：回工作台页并取 tile 清单（运行时，不写死 8） */
async function workbenchTiles(page) {
  await page.click('#side .nav-item[data-sc="workbench"]');
  await page.waitForSelector("#main .wb-tile", { timeout: 15_000 });
  return page.$$eval("#main .wb-tile", (els) =>
    els.map((el) => ({ id: el.getAttribute("data-tile-sc") || "", label: (el.textContent || "").trim() }))
  );
}

/** 刀 2：从工作台页点一个 tile；tab 已存在时 formATabOpenScene 幂等切换 */
async function openWorkbenchTile(page, tileId) {
  await page.click('#side .nav-item[data-sc="workbench"]');
  const sel = `#main .wb-tile[data-tile-sc="${tileId}"]`;
  await page.waitForSelector(sel, { timeout: 15_000 });
  await page.click(sel);
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

test.describe("桌面侧栏 5 入口 + 工作台 8 tile 冒烟", () => {
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
    await waitSideNav(page, 5);

    const items = await sideMenuItems(page);
    /* 覆盖面守门员：清单为空说明取数方式坏了，此时"全绿"毫无意义。
       批九后桌面侧栏 5 入口；8 个场景/联动目的地由下面的 tile 循环接着覆盖。 */
    expect(items.length, "桌面边栏应渲染 5 项导航（对话/主页/任务/工作台/商店）")
      .toBe(5);

    const problems = [];
    for (const it of items) {
      errors.length = 0;
      const sel = selOf(it);
      const n = await page.locator(sel).count();
      if (n !== 1) {
        problems.push(`${it.label}(${it.id}): 选择器 ${sel} 命中 ${n} 个，期望 1 个`);
        continue;
      }

      /* 批十：「对话」不是页面，落的是聊天首页（#main 让位、#chat 占中栏）。
         不能套页面容器探针，否则会把正常聊天误报成空壳。 */
      if (it.chat) {
        await page.click(sel);
        await page.waitForFunction(() => document.querySelector(".body").classList.contains("chat-home"), null, { timeout: 5_000 }).catch(() => {});
        const ok = await page.evaluate(() => {
          const c = document.querySelector("#chat");
          return !!c && getComputedStyle(c).display !== "none" && c.getBoundingClientRect().height > 80;
        });
        if (!ok) problems.push(`${it.label}: 聊天首页未占中栏`);
        if (errors.length) problems.push(`${it.label}: 打开时报错 ${errors[0]}`);
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

    /* 刀 2：场景从侧栏移到工作台 tiles，逐 tile 走同一组不变量，覆盖面 5 + 8 = 13 */
    const tiles = await workbenchTiles(page);
    expect(tiles.length, "工作台应有 7 场景 + 场景联动 = 8 个 tile").toBeGreaterThanOrEqual(8);
    for (const tile of tiles) {
      errors.length = 0;
      const label = `工作台 tile ${tile.label || tile.id}`;
      await openWorkbenchTile(page, tile.id);
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
      if (r.textLen === 0) problems.push(`${label}: 页面无任何文本（空壳）`);
      if (r.ctrls < 1) problems.push(`${label}: 页面上没有任何可交互控件`);
      if (r.hit.length) problems.push(`${label}: 渲染结果含模板残渣 ${r.hit.join(" / ")}`);
      if (errors.length) problems.push(`${label}: 打开时报错 ${errors[0]}`);
    }

    /* 一次性报全，便于看出"是一页坏还是全体坏" */
    expect(problems, "侧栏 + 工作台页面冒烟问题：\n" + problems.join("\n")).toEqual([]);
  });

  test("13 个目的地连切不残留、不报错", async ({ page }) => {
    skipIfNarrow(page);

    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message.split("\n")[0].slice(0, 140)));

    await page.goto(APP_URL);
    await waitSideNav(page, 5);

    const sels = (await sideMenuItems(page)).map(selOf);
    let clicked = 0;
    for (const s of sels) {
      if ((await page.locator(s).count()) === 1) {
        await page.click(s);
        clicked++;
      }
    }
    /* 刀 2：8 个 tile destinations 接着切；运行清单，不写死 */
    const tiles = await workbenchTiles(page);
    for (const tile of tiles) {
      await openWorkbenchTile(page, tile.id);
      clicked++;
    }
    /* 防空转：一条都没点上时，"无报错"毫无意义；批九后 5 侧栏 + 8 tile = 13 */
    expect(clicked, "应至少点到 13 个目的地（5 侧栏 + 8 tile）").toBeGreaterThanOrEqual(13);
    await page.waitForTimeout(300);

    expect(errors, "连续切换 18 个目的地出现报错：" + errors.join(" | ")).toEqual([]);
  });

  /* 溢出这条只在窄屏有意义，所以它自己把视口设成 375px。
     用 setActive + render 直接切页而不是点侧栏 —— 375px 下侧栏本来就不可见（那是移动 IA），
     点不到不是缺陷。没有 sc 的三项（AI / 设置 / 说明）由 uiView 驱动，不走这条路径，
     其窄屏表现由 viewport.spec.js 的触控目标不变量覆盖（如实说明，不假装全覆盖）。 */
  test("有 sc 的页面在 375px 下不产生横向溢出", async ({ page }) => {
    await page.goto(APP_URL);
    await waitSideNav(page, 5);
    /* tile 清单必须在桌面视口取（375 下侧栏不可见，点不到工作台入口） */
    const tileSc = (await workbenchTiles(page)).map((t) => t.id).filter(Boolean);
    await page.setViewportSize({ width: 375, height: 667 });

    const sideSc = (await sideMenuItems(page)).filter((it) => it.sc && it.sc !== "").map((it) => it.sc);
    const scs = Array.from(new Set(sideSc.concat(tileSc)));
    expect(scs.length, "应至少取到 9 个 sc 驱动的页面（4 侧栏 sc + 8 tile，去重后）")
      .toBeGreaterThanOrEqual(9);

    const overflow = [];
    for (const sc of scs) {
      await page.evaluate((s) => {
        setActive(s);
        render();
      }, sc);
      await page.waitForFunction(() => (document.body.textContent || "").trim().length > 0, null, {
        timeout: 5_000,
      }).catch(() => {});
      const w = await page.evaluate(() => ({
        doc: document.documentElement.scrollWidth,
        win: window.innerWidth,
      }));
      /* 允许 1px 的舍入差 */
      if (w.doc > w.win + 1) overflow.push(`${sc}: ${w.doc} > ${w.win}`);
    }

    expect(overflow, "以下页面在 375px 下横向溢出：\n" + overflow.join("\n")).toEqual([]);
  });
});
