/**
 * 工具箱 23 页冒烟（v3.7.54 · 任务 #11）
 * ----------------------------------------------------------------------------
 * 工具清单**运行时从 TOOL_APPS 取**，不写死 —— 写死的话新增/改名工具会悄悄脱离覆盖。
 *
 * 每页断言：
 *   ① 走的是真实实现（出现 #toolAppBody），而不是「该工具正在规划中」占位页
 *   ② 至少有一个可交互控件（挡住"渲染出空壳"）
 *   ③ render+bind 过程无 pageerror
 *   ④ 渲染结果里没有未插值的模板残渣（${ / [object Object] / undefined / NaN）
 *   ⑤ **bind() 里引用的每个 #id 都必须存在于渲染后的 DOM**（render 改了 id、bind 还找旧的
 *      是这类单文件应用最典型的静默坏法 —— 本轮就是靠这条抓到 des-imggen 的 #igOut：
 *      AI 一启用点「生成图片」即 null.innerHTML 抛错，而默认配置下按钮 disabled 所以长期没人踩到）
 *   ⑥ 「← 返回」能退出工具页
 *   ⑦ 375px 窄屏不产生横向溢出
 *
 * 默认跳过，E2E=1 才跑。只在 desktop 项目跑（窄屏那条在用例内部自己改视口）。
 */
const { test, expect } = require("@playwright/test");

const APP_URL = "./agent-workbench.html";

test.describe("工具箱 23 页冒烟", () => {
  test.beforeAll(() => { test.skip(!process.env.E2E, "set E2E=1 to run"); });

  test("每个工具页都能打开、渲染、且 render/bind 不脱节", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message.split("\n")[0].slice(0, 140)));
    page.on("console", (m) => { if (m.type() === "error") errors.push("[console] " + m.text().slice(0, 140)); });

    await page.goto(APP_URL);
    await page.waitForSelector("#side", { timeout: 15_000 });
    await page.waitForTimeout(1200);

    const ids = await page.evaluate(() => Object.keys(TOOL_APPS));
    /* 覆盖面的守门员：清单为空说明取数方式坏了，此时"全绿"毫无意义 */
    expect(ids.length, "TOOL_APPS 应能枚举出工具清单").toBeGreaterThanOrEqual(23);

    const problems = [];
    let refsSeen = 0;
    for (const id of ids) {
      errors.length = 0;
      const r = await page.evaluate((tid) => {
        openToolStub(tid);
        const body = document.getElementById("toolAppBody");
        const html = body ? body.innerHTML : "";
        /* 抽 bind() 源码里引用到的 #id 字面量（三种取法都认） */
        const refs = new Set();
        try {
          const src = (TOOL_APPS[tid] && TOOL_APPS[tid].bind && TOOL_APPS[tid].bind.toString()) || "";
          for (const m of src.matchAll(/\$\(\s*["']#([\w-]+)["']\s*\)/g)) refs.add(m[1]);
          for (const m of src.matchAll(/getElementById\(\s*["']([\w-]+)["']\s*\)/g)) refs.add(m[1]);
          for (const m of src.matchAll(/querySelector\(\s*["']#([\w-]+)["']\s*\)/g)) refs.add(m[1]);
        } catch (e) { /* bind 不可 toString 时跳过该项检查 */ }
        const missing = [...refs].filter((x) => !document.getElementById(x));
        return {
          isReal: !!body,
          refCount: refs.size,
          isStub: /该工具正在规划中|comingSoon|即将上线/.test((document.getElementById("main") || {}).textContent || ""),
          ctrls: body ? body.querySelectorAll("input,textarea,select,button").length : 0,
          missing,
          /* 未插值的模板残渣：只看渲染出的 HTML 源码，textContent 会漏掉属性里的 */
          artifacts: ["${", "[object Object]", "undefined", "NaN"].filter((s) => html.includes(s)),
          hasBack: !!document.getElementById("toolStubBack"),
        };
      }, id);

      if (!r.isReal) problems.push(`${id}: 没走真实实现（缺 #toolAppBody）`);
      refsSeen += r.refCount;
      if (r.isStub) problems.push(`${id}: 落到了「规划中」占位页`);
      if (r.ctrls < 1) problems.push(`${id}: 页面上没有任何可交互控件`);
      if (!r.hasBack) problems.push(`${id}: 缺「← 返回」按钮`);
      if (r.missing.length) problems.push(`${id}: bind() 引用的 id 在 DOM 里不存在 → [${r.missing.join(", ")}]`);
      if (r.artifacts.length) problems.push(`${id}: 渲染结果含模板残渣 ${r.artifacts.join("/")}`);
      if (errors.length) problems.push(`${id}: 打开时报错 ${errors[0]}`);
    }

    /* 防空转：id 抽取正则一旦失效，上面那条"缺失=[]"会**静默全绿**。
       实测 23 个工具共引用 130+ 个 id，故设一个远低于实际、远高于 0 的下限。 */
    expect(refsSeen, "bind() 里引用的 id 总数异常偏低，说明抽取逻辑失效了").toBeGreaterThan(60);

    /* 一次性报全，便于看出"是一个工具坏还是全体坏" */
    expect(problems, "工具页冒烟问题：\n" + problems.join("\n")).toEqual([]);
  });

  test("每个工具页在 375px 窄屏下不产生横向溢出", async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForSelector("#side", { timeout: 15_000 });
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(600);

    const ids = await page.evaluate(() => Object.keys(TOOL_APPS));
    const overflow = [];
    for (const id of ids) {
      const w = await page.evaluate((tid) => {
        openToolStub(tid);
        return { doc: document.documentElement.scrollWidth, win: window.innerWidth };
      }, id);
      /* 允许 1px 的舍入差 */
      if (w.doc > w.win + 1) overflow.push(`${id}: ${w.doc} > ${w.win}`);
    }
    expect(overflow, "以下工具页在 375px 下横向溢出：\n" + overflow.join("\n")).toEqual([]);
  });

  test("工具页之间连续切换不残留、不报错", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message.split("\n")[0].slice(0, 140)));
    await page.goto(APP_URL);
    await page.waitForSelector("#side", { timeout: 15_000 });
    await page.waitForTimeout(1000);

    const ids = await page.evaluate(() => Object.keys(TOOL_APPS));
    await page.evaluate(async (list) => {
      for (const id of list) { openToolStub(id); }
      /* 最后回一次主页，确认退出路径也干净 */
      const back = document.getElementById("toolStubBack");
      if (back) back.click();
    }, ids);
    await page.waitForTimeout(900);

    expect(errors, "连续切换 23 个工具页出现报错：" + errors.join(" | ")).toEqual([]);
    const stillTool = await page.evaluate(() => ({
      uiView: typeof uiView !== "undefined" ? uiView : "(n/a)",
      hasAppBody: !!document.getElementById("toolAppBody"),
    }));
    expect(stillTool.hasAppBody, "点「← 返回」后应已退出工具页").toBe(false);
  });

  test("code_run 真的能执行（真 Worker，不是桩）", async ({ page }) => {
    /* 这条只能待在 e2e：jsdom 跑不了 Worker，所以单测全绿时 code_run 可能整个是坏的 ——
       v3.7.54 实测就是如此（CSP 缺 worker-src → blob Worker 被拒 → 工具恒返回"未知执行错误"，
       而 README 写着"本机沙箱执行、不需联网"）。
       契约（src/ai-tools.js:1159）：返回 {ok, output, ms}，output **只含 console 文本**，
       不含末表达式值 —— 别按"返回值"写断言（第一版就把 console 输出误读成了返回值）。 */
    await page.goto(APP_URL);
    await page.waitForSelector("#side", { timeout: 15_000 });
    await page.waitForTimeout(1000);

    const ok = await page.evaluate(async () => JSON.parse(await execToolAuto("code_run", { code: "console.log(6*7); console.log('hi');" })));
    expect(ok.ok, "code_run 应执行成功，实际：" + JSON.stringify(ok)).toBe(true);
    expect(String(ok.output)).toContain("42");
    expect(String(ok.output), "多条 console 输出都应被捕获").toContain("hi");

    /* 反向：运行时异常必须被 Worker 捕获成 ok:false + 错误文本，而不是静默成功或超时 */
    const bad = await page.evaluate(async () => JSON.parse(await execToolAuto("code_run", { code: "throw new Error('boom-xyz');" })));
    expect(bad.ok, "抛异常时不得报成功").toBe(false);
    expect(String(bad.output), "异常信息应回传：" + JSON.stringify(bad)).toContain("boom-xyz");
  });
});
