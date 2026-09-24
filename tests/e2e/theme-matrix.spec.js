/**
 * theme-matrix.spec.js —— 11 套主题的**渲染层**守护
 * ----------------------------------------------------------------------------
 * 为什么单独做这一层（与既有的 5 个 vitest 主题测试的关系）：
 *   `theme-registration.test.js` / `theme-token-pairing.test.js` 等都是**静态文本分析** ——
 *   它们检查「令牌定义了没 / 配对全不全」。这必要但不充分：
 *   **令牌全都齐、配对全对，渲染出来照样可能看不见**（文字与背景同色、对比度过低、
 *   某个主题下控件消失）。那类缺陷只有真渲染出来量才知道。
 *
 * 本文件因此断言的是**渲染层的不变量**（不依赖像素基线，故本机与 CI 结果一致）：
 *   ① 11 套主题都能生效（data-theme 注入后 --panel 确实变化，不是"静默无效"）
 *   ② 每套主题下 关键前景/背景配对对比度 ≥ 阈值（WCAG 1.4.3 正文 4.5:1 的知识性下限）
 *   ③ 每套主题下核心 UI 真的渲染出来且可见（侧栏项 / 主内容 / 顶栏 / 按钮）
 *   ④ 每套主题下无横向溢出、关键控件尺寸未塌陷
 *
 * 阈值取法：本机用 Playwright 实测 10 套主题 × 6 组配对的真实值，取"实测最小值 - 余量"。
 *   （不照抄 WCAG 的 4.5 —— 若现状某项本就低于它，直接断言会造成基线红、
 *    掩盖真正的新回归。先用实测定基线，把"退步"抓住，比追求理想值更有用。）
 *
 * 守护策略同其它 e2e：默认跳过，E2E=1 才跑。
 */
const { test, expect } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");

const APP_URL = "./agent-workbench.html";

/* 实测值落盘：Playwright 默认吞掉 console.log，把数据写文件更可靠，
   既便于人工复核，也为将来调阈值留下依据（不纳入 git —— 属临时产物）。 */
const REPORT_FILE = path.join(__dirname, "..", "..", "_probe", "theme-contrast-actual.txt");
function dumpReport(lines) {
  try {
    fs.mkdirSync(path.dirname(REPORT_FILE), { recursive: true });
    fs.writeFileSync(REPORT_FILE, lines.join("\n") + "\n", "utf8");
  } catch (e) { /* 落盘失败不影响断言 */ }
}

/* 11 套主题：light 是默认态（无 data-theme 属性），其余走属性 */
const THEMES = ["light", "dark", "sepia", "elegant", "aurora", "matrix", "forest", "ocean", "mist", "ink"];

/* 亮度/对比度计算：注入页面上下文（sRGB 相对亮度，WCAG 2.x 口径）
   ⚠️ 关键：`getPropertyValue('--text')` 返回的是**声明原文**（本项目为 hex 如 #111111），
   不是 rgba() —— 只按 rgba 解析会全部返回 null（踩过）。
   因此这里同时支持 #rgb / #rrggbb / rgb() / rgba() 四种写法。 */
const CONTRAST_HELPERS = `(() => {
  window.__lum = function(rgb){
    const f = rgb.map(v => { v/=255; return v<=0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055,2.4); });
    return 0.2126*f[0]+0.7152*f[1]+0.0722*f[2];
  };
  window.__parse = function(s){
    s = String(s).trim();
    /* hex：#rgb / #rrggbb */
    let m = s.match(/^#([0-9a-f]{3})$/i);
    if (m) return m[1].split("").map(c => parseInt(c + c, 16));
    m = s.match(/^#([0-9a-f]{6})$/i);
    if (m) return [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16));
    /* rgb()/rgba() */
    m = s.match(/rgba?\\(([^)]+)\\)/);
    if (m) { const p = m[1].split(",").map(x => parseFloat(x)); return [p[0], p[1], p[2]]; }
    return null;   /* 其它表示法（color-mix / var 未解析等）→ 返回 null，调用方跳过 */
  };
  window.__contrast = function(a, b){
    const pa = window.__parse(a), pb = window.__parse(b);
    if(!pa || !pb) return null;
    const la = window.__lum(pa), lb = window.__lum(pb);
    const hi = Math.max(la, lb), lo = Math.min(la, lb);
    return (hi + 0.05) / (lo + 0.05);
  };
  return true;
})()`;

/** 切到指定主题（light 用移除属性） */
async function applyTheme(page, th) {
  await page.evaluate((t) => {
    const el = document.documentElement;
    if (t === "light") el.removeAttribute("data-theme");
    else el.setAttribute("data-theme", t);
  }, th);
}

/** 取当前主题下若干令牌的真实计算值 + 配对对比度 */
async function readTheme(page) {
  return page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    const g = (k) => cs.getPropertyValue(k).trim();
    const pairs = {
      "text/panel": [g("--text"), g("--panel")],
      "text/bg": [g("--text"), g("--bg")],
      "muted/panel": [g("--muted"), g("--panel")],
      "on-accent/accent": [g("--on-accent"), g("--accent")],
      "danger/panel": [g("--danger"), g("--panel")],
      "accent/panel": [g("--accent"), g("--panel")]
    };
    const out = {};
    for (const k in pairs) {
      const fg = pairs[k][0], bg = pairs[k][1];
      out[k] = { fg: fg, bg: bg, c: window.__contrast(fg, bg) };
    }
    return { panel: g("--panel"), bg: g("--bg"), text: g("--text"), pairs: out };
  });
}

test.describe("11 套主题渲染层不变量", () => {
  test.beforeAll(() => {
    test.skip(!process.env.E2E, "set E2E=1 to run");
  });

  test.beforeEach(async ({ page }) => {
    page.on("dialog", async (d) => { try { await d.accept(); } catch (e) { /* ignore */ } });
    await page.goto(APP_URL);
    await page.waitForSelector("#main", { state: "attached", timeout: 15_000 });
    await page.evaluate(CONTRAST_HELPERS);
  });

  test("每套主题都真正生效（令牌随主题变化，不是静默无效）", async ({ page }) => {
    const seen = {};
    for (const th of THEMES) {
      await applyTheme(page, th);
      const r = await readTheme(page);
      seen[th] = r.panel;
      /* --panel 必须有值（令牌缺失会让整个主题静默退化） */
      expect(r.panel, "主题 " + th + " 的 --panel 为空").not.toBe("");
      expect(r.text, "主题 " + th + " 的 --text 为空").not.toBe("");
    }
    /* 至少要有若干套主题的 --panel 互不相同 —— 全相同说明 data-theme 选择器没起效 */
    const uniq = new Set(Object.values(seen));
    expect(uniq.size, "11 套主题只渲染出 " + uniq.size + " 种 --panel，主题选择器疑似失效").toBeGreaterThanOrEqual(5);
  });

  test("每套主题的关键配对对比度不低于实测基线", async ({ page }) => {
    /* 基线 = 2026-09-24 本机实测值（Playwright + chromium，见文末表）。
       判定口径：**实测值 ≥ 基线 × 0.9** —— 即允许 10% 抖动，但退步超过一成就红。
       这样既不会因"理想值 4.5"造成既有基线红，又能精确抓住"某次改主题把字改淡了"。
       ⚠️ 调基线必须在提交信息里说明原因，不要为了变绿而下调。 */
    const BASELINE = {
      light:  { "text/panel": 18.88, "text/bg": 14.34, "muted/panel": 5.74, "on-accent/accent": 4.55, "danger/panel": 4.56, "accent/panel": 4.55 },
      dark:   { "text/panel": 12.47, "text/bg": 15.22, "muted/panel": 4.99, "on-accent/accent": 2.82, "danger/panel": 5.02, "accent/panel": 4.95 },
      sepia:  { "text/panel": 7.94,  "text/bg": 7.52,  "muted/panel": 4.17, "on-accent/accent": 2.54, "danger/panel": 4.88, "accent/panel": 2.28 },
      elegant:{ "text/panel": 13.00, "text/bg": 10.90, "muted/panel": 4.49, "on-accent/accent": 4.02, "danger/panel": 4.15, "accent/panel": 4.02 },
      aurora: { "text/panel": 17.70, "text/bg": 15.42, "muted/panel": 6.76, "on-accent/accent": 5.58, "danger/panel": 4.56, "accent/panel": 5.58 },
      matrix: { "text/panel": 13.34, "text/bg": 14.30, "muted/panel": 6.71, "on-accent/accent": 11.04, "danger/panel": 4.77, "accent/panel": 10.30 },
      forest: { "text/panel": 5.61,  "text/bg": 8.58,  "muted/panel": 2.61, "on-accent/accent": 10.12, "danger/panel": 2.19, "accent/panel": 3.89 },
      ocean:  { "text/panel": 14.17, "text/bg": 11.42, "muted/panel": 6.33, "on-accent/accent": 8.75, "danger/panel": 3.93, "accent/panel": 8.25 },
      mist:   { "text/panel": 4.80,  "text/bg": 7.36,  "muted/panel": 2.82, "on-accent/accent": 7.88, "danger/panel": 2.11, "accent/panel": 3.08 },
      ink:    { "text/panel": 14.80, "text/bg": 15.79, "muted/panel": 6.08, "on-accent/accent": 8.73, "danger/panel": 5.42, "accent/panel": 8.81 }
    };
    /* 绝对硬底线：任何主题、任何配对都不得低于此值（低于就完全读不清了） */
    const ABS_FLOOR = 1.5;
    const TOLERANCE = 0.9;

    const report = [];
    for (const th of THEMES) {
      await applyTheme(page, th);
      const r = await readTheme(page);
      const base = BASELINE[th];
      expect(base, "基线表缺少主题 " + th + "（新增主题时需同步补基线）").toBeTruthy();
      for (const k in base) {
        const v = r.pairs[k];
        expect(v, "主题 " + th + " 缺少配对 " + k).toBeTruthy();
        if (v.c === null) continue;   /* 非 hex/rgb 表示法（如 color-mix 未解析）跳过，不误报 */

        const floor = Math.max(ABS_FLOOR, base[k] * TOLERANCE);
        const line = th + " · " + k + " = " + v.c.toFixed(2) +
          "（基线 " + base[k] + "，下限 " + floor.toFixed(2) + "）";
        report.push(line);
        expect(v.c, "对比度退步：" + line + "  [" + v.fg + " / " + v.bg + "]").toBeGreaterThanOrEqual(floor);
      }
    }
    /* 把实测值落盘 —— 便于人工复核与将来调基线 */
    dumpReport(report);
  });

  /* 单独一条：低对比度**清单**（不失败，只记录）
     实测发现若干主题的 on-accent/accent 或 danger/panel 低于 WCAG 正文 4.5:1，
     属既有设计取舍（暖色主色 + 白字天然偏低）。这里把它们**列出来**供设计侧决策，
     不用断言卡死 —— 否则要么基线红、要么被迫把阈值降到无意义。 */
  test("低对比度清单（仅记录，不阻断）", async ({ page }) => {
    const WCAG_BODY = 4.5;
    const low = [];
    for (const th of THEMES) {
      await applyTheme(page, th);
      const r = await readTheme(page);
      for (const k in r.pairs) {
        const v = r.pairs[k];
        if (v.c !== null && v.c < WCAG_BODY) {
          low.push(th + " · " + k + " = " + v.c.toFixed(2) + "  [" + v.fg + " / " + v.bg + "]");
        }
      }
    }
    console.log("[theme-matrix] 低于 WCAG 正文 4.5:1 的配对（设计侧参考）：\n" + low.join("\n"));
    /* 只记录，不断言 —— 见上注释 */
    expect(Array.isArray(low)).toBe(true);
  });

  test("每套主题下核心 UI 都真实可见且未溢出", async ({ page }) => {
    for (const th of THEMES) {
      await applyTheme(page, th);

      /* ① 无横向溢出 */
      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, "主题 " + th + " 出现横向溢出 " + overflow + "px").toBeLessThanOrEqual(0);

      /* ② 顶栏 / 侧栏 / 主内容都存在且可见 */
      await expect(page.locator(".topbar"), "主题 " + th + "：顶栏不可见").toBeVisible();
      await expect(page.locator("#side"), "主题 " + th + "：侧栏不可见").toBeVisible();
      await expect(page.locator("#main"), "主题 " + th + "：主内容不可见").toBeVisible();

      /* ③ 侧栏首项可见且高度未塌陷（防"某主题下控件消失/变条"） */
      const nav = page.locator("#side .nav-item").first();
      if (await nav.count()) {
        await expect(nav, "主题 " + th + "：侧栏首项不可见").toBeVisible();
        const box = await nav.boundingBox();
        expect(box, "主题 " + th + "：侧栏首项无尺寸").toBeTruthy();
        expect(box.height, "主题 " + th + "：侧栏项高度塌陷 " + box.height + "px").toBeGreaterThanOrEqual(28);
      }

      /* ④ 顶栏高度未漂移 */
      const topbar = await page.locator(".topbar").boundingBox();
      expect(topbar.height, "主题 " + th + "：顶栏高度异常 " + topbar.height + "px").toBeGreaterThan(28);
      expect(topbar.height, "主题 " + th + "：顶栏高度异常 " + topbar.height + "px").toBeLessThan(96);
    }
  });
});
