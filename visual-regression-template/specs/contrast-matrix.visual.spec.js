/**
 * contrast-matrix.visual.spec.js —— 主题 × 关键配色对比度矩阵（pilot：Interaction）
 * ----------------------------------------------------------------------------
 * 模板自带的示范 spec：把「渲染层不变量」在 Interaction 上跑起来。三条用例分别断言：
 *   ① 每套主题都真正生效（applyTheme 后 --panel 等令牌确实变化，不是静默无效）；
 *   ② 每套主题的关键前景/背景配对对比度 ≥ max(ABS_FLOOR, 基线×TOLERANCE)（抓「退步」）；
 *   ③ 每套主题下核心 UI 真实可见、无横向溢出、关键控件尺寸未塌陷。
 *
 * 为什么不依赖像素基线：以上全部由 getComputedStyle + 布局测量得出，任何环境结果一致，
 *   本机与 CI 同样可信。像素基线是另一类守护（CI-only 可选插件），见 baselines/README.md。
 *
 * 项目适配点（换项目时改这里 + helpers/ 三个文件，其余不用动）：
 *   · 入口页面：默认 agent-workbench.html，环境变量 VISUAL_APP_ENTRY 可覆盖；
 *   · 引导浮层：Interaction 首次启动有 3 步全屏引导（#onboardModal 拦截点击），下面
 *     的 fixture 预置「已引导」标记绕开；其他项目若无引导浮层，删掉 addInitScript 块即可；
 *   · 核心控件选择器（.topbar / #side / #main / #side .nav-item）是 Interaction 的
 *     骨架，换项目时换成自己项目的「顶栏 / 侧栏 / 主区 / 侧栏首项」。
 *
 * 与 Interaction 主 e2e 的关系：tests/e2e/theme-matrix.spec.js 是同一思路的权威深守护
 *   （另有场景色/-text 系列 ≥4.5 硬断言、低对比度清单）。本 spec 是模板化后的可复制核心，
 *   基线表与之同源同值（v3.7.52 口径）—— 改基线时两边同步，详见 README「阈值口径」。
 *
 * 模块格式：CommonJS（require）—— 与项目 playwright.config 的 require 解析一致，
 *   ESM 会触发 MODULE_TYPELESS_PACKAGE_JSON 警告。
 */
const base = require("@playwright/test");
const { expect } = base;

const { THEMES, THEME_ATTR, LIGHT_THEME } = require("../helpers/theme-list.cjs");
const { CONTRAST_PAIRS } = require("../helpers/contrast-pairs.cjs");
const { CONTRAST_BASELINE } = require("../helpers/contrast-baseline.cjs");
const {
  CONTRAST_INJECT, ABS_FLOOR, TOLERANCE,
  applyTheme, readTokens, readPairs, checkOverflow, checkVisible, dumpReport
} = require("../helpers/measure.cjs");

/** 入口页面（相对 baseURL，即项目根）。Interaction 为根目录单文件；其他项目用环境变量覆盖。 */
const APP_ENTRY = process.env.VISUAL_APP_ENTRY || "agent-workbench.html";

/** 核心控件选择器（项目适配层）：换项目时改成自己项目的骨架控件。 */
const CORE_SELECTORS = {
  topbar: ".topbar",
  side: "#side",
  main: "#main",
  firstNavItem: "#side .nav-item"
};

/** 主题应用参数（Interaction 口径：属性 data-theme，light 为默认态）。 */
const themeOpts = { attr: THEME_ATTR, lightValue: LIGHT_THEME };

/* Interaction 适配：预置「已引导」标记，绕开首次启动 3 步全屏引导（#onboardModal 会
   拦截一切点击）。来源：tests/e2e/_fixture.js（v3.7.65）。其他项目无引导浮层时，
   可删掉 addInitScript 块、直接用 base.test。 */
const test = base.test.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => {
      try { localStorage.setItem("wb_agent_onboarded", "true"); } catch (e) { /* 存储不可用时保持原行为 */ }
    });
    await use(page);
  },
});

/** 取当前主题下的配对对比度 + 单令牌值（panel/bg/text 单独取，供主题生效断言）。 */
async function readTheme(page) {
  const pairs = await readPairs(page, CONTRAST_PAIRS);
  const single = await readTokens(page, ["--panel", "--bg", "--text"]);
  return { panel: single["--panel"], bg: single["--bg"], text: single["--text"], pairs };
}

test.describe("主题 × 关键配色渲染层不变量（contrast-matrix）", () => {
  test.beforeEach(async ({ page }) => {
    page.on("dialog", async (d) => { try { await d.accept(); } catch (e) { /* ignore */ } });
    await page.goto(APP_ENTRY);
    await page.waitForSelector(CORE_SELECTORS.main, { state: "attached", timeout: 15_000 });
    await page.evaluate(CONTRAST_INJECT);
  });

  test("每套主题都真正生效（令牌随主题变化，不是静默无效）", async ({ page }) => {
    const seen = {};
    for (const th of THEMES) {
      await applyTheme(page, th, themeOpts);
      const r = await readTheme(page);
      seen[th] = r.panel;
      /* 令牌必须有值（令牌缺失会让整个主题静默退化） */
      expect(r.panel, "主题 " + th + " 的 --panel 为空").not.toBe("");
      expect(r.text, "主题 " + th + " 的 --text 为空").not.toBe("");
    }
    /* 至少要有若干套主题的 --panel 互不相同 —— 全相同说明 data-theme 选择器没起效 */
    const uniq = new Set(Object.values(seen));
    expect(uniq.size, THEMES.length + " 套主题只渲染出 " + uniq.size +
      " 种 --panel，主题选择器疑似失效").toBeGreaterThanOrEqual(5);
  });

  test("每套主题的关键配对对比度不低于实测基线", async ({ page }) => {
    /* 先量后断：实测值无条件落盘（失败时也有数据可抄去补基线），再统一断言。
       判定：实测值 ≥ max(ABS_FLOOR, 基线 × TOLERANCE)；基线缺失项进失败清单并给出建议值。 */
    const report = [];
    const failures = [];
    for (const th of THEMES) {
      await applyTheme(page, th, themeOpts);
      const r = await readTheme(page);
      const baseRows = CONTRAST_BASELINE[th];
      for (const k in CONTRAST_PAIRS) {
        const v = r.pairs[k];
        if (!v) { failures.push("主题 " + th + " 缺少配对 " + k); continue; }
        if (v.c === null) {
          report.push(th + " · " + k + " = 无法解析（" + v.fg + " / " + v.bg + "），按约定跳过");
          continue;   /* 非 hex/rgb 表示法（如 color-mix 未解析）跳过，不误报 */
        }
        if (!baseRows || baseRows[k] === undefined) {
          const line = th + " · " + k + " = " + v.c.toFixed(2) + "（无基线，待补）";
          report.push(line);
          failures.push("基线表缺少 " + th + " / " + k + "：实测 " + v.c.toFixed(2) +
            "，建议基线 " + (v.c * TOLERANCE).toFixed(2));
          continue;
        }
        const floor = Math.max(ABS_FLOOR, baseRows[k] * TOLERANCE);
        const line = th + " · " + k + " = " + v.c.toFixed(2) +
          "（基线 " + baseRows[k] + "，下限 " + floor.toFixed(2) + "）";
        report.push(line);
        if (v.c < floor) {
          failures.push("对比度退步：" + line + "  [" + v.fg + " / " + v.bg + "]");
        }
      }
    }
    dumpReport(report, "contrast-matrix");
    expect(failures, "对比度矩阵未通过（" + failures.length +
      " 项；全部实测值见 _probe/contrast-matrix.txt）：\n" + failures.join("\n")).toEqual([]);
  });

  test("每套主题下核心 UI 都真实可见且未溢出", async ({ page }) => {
    for (const th of THEMES) {
      await applyTheme(page, th, themeOpts);

      /* ① 无横向溢出 */
      const overflow = await checkOverflow(page);
      expect(overflow, "主题 " + th + " 出现横向溢出 " + overflow + "px").toBeLessThanOrEqual(0);

      /* ② 核心三容器可见（#side 的可见等于是重试断言，给异步注入的导航项留出时间） */
      await expect(page.locator(CORE_SELECTORS.side), "主题 " + th + "：侧栏不可见").toBeVisible();
      const vis = await checkVisible(page, [CORE_SELECTORS.topbar, CORE_SELECTORS.side, CORE_SELECTORS.main]);
      for (const sel in vis) {
        expect(vis[sel], "主题 " + th + "：" + sel + " 不可见").toBe(true);
      }

      /* ③ 侧栏首项高度未塌陷（防「某主题下控件消失/变条」；异步注入，先判存在） */
      const nav = page.locator(CORE_SELECTORS.firstNavItem).first();
      if (await nav.count()) {
        const box = await nav.boundingBox();
        expect(box, "主题 " + th + "：侧栏首项无尺寸").toBeTruthy();
        expect(box.height, "主题 " + th + "：侧栏项高度塌陷 " + box.height + "px").toBeGreaterThanOrEqual(28);
      }

      /* ④ 顶栏高度未漂移 */
      const topbar = await page.locator(CORE_SELECTORS.topbar).boundingBox();
      expect(topbar.height, "主题 " + th + "：顶栏高度异常 " + topbar.height + "px").toBeGreaterThan(28);
      expect(topbar.height, "主题 " + th + "：顶栏高度异常 " + topbar.height + "px").toBeLessThan(96);
    }
  });
});
