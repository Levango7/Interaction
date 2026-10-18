/**
 * three-state-layout.spec.js —— 「元素级溢出」守护（真实浏览器 · 三视口 × 三数据态）
 * ----------------------------------------------------------------------------
 * 为什么还要这一层（与已有 spec 的分工）：
 *   · `three-state-render.test.js`（vitest/jsdom）证明**渲染得出来**：不空白、不漏
 *     `undefined`/`NaN`/`[object Object]`、空态可见、超长与体量不崩。
 *     但 jsdom **没有排版引擎** —— 它不知道"文字挤出卡片"长什么样，这类缺陷在它那里全绿。
 *   · `viewport.spec.js` 在真实浏览器里查的是**文档级**横向溢出（页面出现横向滚动条）。
 *     但内容溢出的常见形态是**元素自己溢出、页面却没事**：定宽卡片里的 nowrap 标题、
 *     一行放不下的 12 个标签、撑破行的长徽标 —— 文档 `scrollWidth` 完全不变。
 *   · `nav-pages-smoke.spec.js` 的"不溢出"同上，仍是文档级。
 *
 * 所以这里补的是**元素级**判据，且只在"真溢出"时红：
 *   盒子内容比盒子宽（scrollWidth > clientWidth + 2）**且** `overflow-x: visible`
 *   —— 即内容真的画到盒子外面去了。
 *   刻意**不**判 `ellipsis` 截断与 `overflow: auto/scroll` 容器：那是处理方式，不是缺陷；
 *   本应用大量用 nowrap + 省略号是设计，判它会制造一堆假红。
 *
 * 反向对照（本 spec 自带，别删）：
 *   每次跑先往 #main 塞一个**必然溢出**的对照元素，断言探测器抓得到它 ——
 *   否则"零命中"可能只是尺子坏了（2026-10-18 首次探针实测：注入了 1140px 溢出的对照块
 *   才确认探测器有效，此前 90 次渲染的"零溢出"才有意义）。
 *
 * 覆盖：15 个视图 × 3 个数据态（空 / 正常 / 极端）× 3 个视口 = 9 条用例、135 次渲染。
 * 数据从 localStorage 直接种（addInitScript，先于页面脚本执行），不点 UI 造数据 ——
 * 极端态（200 字标题 + 12 标签 + 长备注）用 UI 造既慢又脆。
 *
 * 守护策略同其它 e2e：默认跳过，E2E=1 才跑。
 */
const { test, expect } = require("./_fixture");
const { waitMainRendered } = require("./helpers/wait-settled.cjs");

const APP_URL = "./agent-workbench.html";

/** 17 个菜单项里除「设置」「说明」外的全部视图（与 vitest 侧 three-state-render 同一口径） */
const VIEWS = ["office", "data", "design", "study", "code", "life", "health",
  "overview", "tasks", "chainpage", "timeline", "ai", "toolbox", "store", "recycle"];

const LONG_TITLE = "这是一条刻意写得非常长的任务标题用来检查标题超长时卡片会不会把版面撑破或者把文字挤成一团导致后面的截止日期和优先级标签完全看不见";

function task(i, over) {
  return Object.assign({
    id: "t" + i, sc: "office", title: "任务 " + i, due: "2026-12-31",
    priority: "P1", tags: [], note: "", status: "todo", created: Date.now() - i * 1000,
  }, over || {});
}

const STATES = [
  ["空", []],
  ["正常", [task(1), task(2, { status: "doing", priority: "P0" }), task(3, { status: "done", tags: ["周报"] })]],
  ["极端", [
    task(1, {
      title: LONG_TITLE, tags: Array.from({ length: 12 }, (_, k) => "标签" + k), note: "备注".repeat(80),
    }),
  ]],
];

/** 收集「内容比盒子宽且没被裁剪」的元素（=真溢出） */
const collectOverflow = () => {
  const out = [];
  for (const el of document.querySelectorAll("#main *")) {
    const st = getComputedStyle(el);
    if (st.overflowX !== "visible") continue;      // auto/scroll/hidden 都是刻意处理
    if (!el.clientWidth) continue;                  // 未布局（display:none 等）
    const over = el.scrollWidth - el.clientWidth;
    if (over <= 2) continue;
    out.push({
      sel: el.tagName.toLowerCase() + (el.className ? "." + String(el.className).trim().split(/\s+/).slice(0, 2).join(".") : ""),
      id: el.id || "",
      over,
      text: (el.textContent || "").trim().slice(0, 30),
    });
  }
  return out;
};

for (const [stateName, tasks] of STATES) {  test.describe(`元素级溢出 · ${stateName}数据`, () => {
    test.beforeAll(() => {
      test.skip(!process.env.E2E, "set E2E=1 to run");
    });

    test.beforeEach(async ({ page }) => {
      /* 数据必须先于页面脚本落好：init 标记一并写，避免 seed() 把示例任务种进来污染"空"态 */
      await page.addInitScript((t) => {
        try {
          localStorage.setItem("wb_agent_init", "true");
          localStorage.setItem("wb_agent_tasks", JSON.stringify(t));
        } catch (e) { /* 存储不可用时保持原行为 */ }
      }, tasks);
    });

    test("探测器自检 + 全视图无元素级溢出", async ({ page }) => {
      await page.goto(APP_URL);
      await page.waitForSelector("#main", { timeout: 15_000 });
      await waitMainRendered(page);

      /* ---- 反向对照：先证明这把尺子量得出东西 ---- */
      /* 三步分开（注入 → 用同一个探测器量 → 移除），不把探测器源码 eval 进页面：
         页面内 eval 受 CSP 约束，而 CDP 的 evaluate 不受 —— 两者混用会出现
         "本机能过、换了 CSP 就红"的隐性耦合，没必要。 */
      await page.evaluate(() => {
        const box = document.createElement("div");
        box.id = "overflow-control";
        box.style.cssText = "width:120px;white-space:nowrap;overflow:visible";
        box.textContent = "对照用超长文本".repeat(12);
        document.getElementById("main").appendChild(box);
      });
      const controlHit = await page.evaluate(collectOverflow);
      await page.evaluate(() => {
        const el = document.getElementById("overflow-control");
        if (el) el.remove();
      });
      const hit = controlHit.filter((x) => x.id === "overflow-control");
      expect(hit.length, "探测器失效：人为注入的溢出都没抓到 ⇒ 本 spec 的『零溢出』不可信").toBe(1);
      expect(hit[0].over, "对照块的溢出量应显著大于阈值").toBeGreaterThan(2);

      /* ---- 全视图逐个量 ---- */
      const bad = [];
      for (const view of VIEWS) {
        await page.evaluate((v) => { window.setActive(v); window.render(); }, view);
        await waitMainRendered(page);
        const docOver = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth
        );
        if (docOver > 1) bad.push(`${view}：文档横向溢出 ${docOver}px`);
        const els = await page.evaluate(collectOverflow);
        for (const e of els) bad.push(`${view}：<${e.sel}${e.id ? "#" + e.id : ""}> 溢出 ${e.over}px · "${e.text}"`);
      }

      expect(bad, `[${stateName}] 内容画到盒子外面（视口 ${page.viewportSize().width}px）：\n  ` + bad.join("\n  ")).toEqual([]);
    });
  });
}

/* ============================================================
 * 「待办栏」与「卡片」左右边界必须一致（2026-10-18 用户走查发现）
 * ------------------------------------------------------------
 * 现场：1280 宽下待办栏 238→942、卡片 226→954 —— 上面那条比下面窄一圈，左右各内缩 12px。
 * 根因：两者都是 .main-wrap 里的满宽兄弟，横向内边距必须同值才对得齐；
 *   基础规则 .main 用 var(--space-4)=16px，而 @media(1024–1439) 里 .toolbar-row 写了
 *   var(--space-7)=28px。只有这一档写岔（<768 与 768–1023 是 16/16、>=1440 是 32/32 都对齐），
 *   偏偏 1024–1439 是最主流的桌面宽度。
 *
 * 为什么用**多个宽度档**而不是吃三个 project 的视口：断点错位是"某一档写岔"，
 * 只测 1280 会漏掉 1440 那档、只测 375 会漏掉桌面档。这里在一条用例里扫 11 个宽度。
 * ============================================================ */
test.describe("布局不变量 · 待办栏与卡片左右边界一致", () => {
  test.beforeAll(() => {
    test.skip(!process.env.E2E, "set E2E=1 to run");
  });

  test("12 个宽度档 + 折叠态下左右边界偏差均 ≤1px", async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForSelector("#main", { timeout: 15_000 });
    await page.evaluate(() => { window.setActive("study"); window.render(); });

    const WIDTHS = [375, 520, 767, 768, 900, 1023, 1024, 1280, 1439, 1440, 1680, 1920];
    const bad = [];
    const check = async (tag) => {
      const r = await page.evaluate(() => {
        const bar = document.querySelector("#todoBar");
        const card = document.querySelector("#main .card");
        if (!bar || !card) return null;
        const b = bar.getBoundingClientRect(), c = card.getBoundingClientRect();
        return { dl: b.left - c.left, dr: b.right - c.right };
      });
      if (!r) { bad.push(`${tag}：取不到待办栏或卡片（守护失效，别当通过）`); return; }
      if (Math.abs(r.dl) > 1) bad.push(`${tag}：左边界差 ${r.dl.toFixed(1)}px`);
      if (Math.abs(r.dr) > 1) bad.push(`${tag}：右边界差 ${r.dr.toFixed(1)}px`);
    };

    /* ① 每个宽度单独打开（侧栏默认态） */
    for (const w of WIDTHS) {
      await page.setViewportSize({ width: w, height: 900 });
      await waitMainRendered(page);
      await check(`${w}px`);
    }

    /* ② 侧栏折叠 + 宽屏：这是本 bug 真正发生的形态，光测默认态会漏掉。
       复现方式：从 768 打开（窄屏 IA）再拉宽 —— 与用户折叠侧栏/把窗口拉宽看到的一致。
       现场：1920 下卡片被 --content-max 收窄到 1440 并居中，待办栏却横到边，两侧各差 91.5px。 */
    await page.setViewportSize({ width: 768, height: 900 });
    await waitMainRendered(page);
    for (const w of [1440, 1680, 1920]) {
      await page.setViewportSize({ width: w, height: 900 });
      await page.waitForTimeout(260); // 折叠态的宽度切换不是同步重排，等一帧稳定
      await check(`${w}px 折叠态`);
    }

    expect(bad, "待办栏与卡片没对齐（两者都应是 .main-wrap 内容宽 + 同一 --content-max 上限）：\n  " + bad.join("\n  ")).toEqual([]);
  });
});
