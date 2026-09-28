/**
 * i18n 端到端（v3.7.54）
 * ----------------------------------------------------------------------------
 * 守的是四类真实缺陷的复发，全部先在浏览器里实测过才写成断言：
 *   ① 字典若在模块级常量**之后**才声明，`SCENARIOS/TOOL_APPS/SCENE_FEATURES` 里的
 *      `t("scenario.office","办公")` 只会拿到中文兜底 → 英文界面大面积中文。
 *   ② 运行中切语言只 render() 换不掉上述常量 → 必须重载。
 *   ③ 动态模板里的 [data-i18n] 节点若不在 render() 收口处翻译，英文模式恒为中文。
 *   ④ en 字典若照抄中文，key 在也等于没翻。
 *
 * 视口无关（跑的是语言而非布局），按 theme-matrix 的先例只在 desktop 项目跑一次。
 * 守护策略同其余 spec：默认跳过，E2E=1 才跑。
 */
const { test, expect } = require("./_fixture");

const APP_URL = "./agent-workbench.html";

/* 统计"肉眼可见"的中文文本节点（隐藏节点、脚本样式里的中文不算缺陷） */
const COUNT_VISIBLE_CN = () => {
  const R = /[一-鿿]/;
  const seen = new Set();
  const it = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = it.nextNode())) {
    const t = (n.nodeValue || "").trim();
    if (!t || !R.test(t)) continue;
    const el = n.parentElement;
    if (!el || el.closest("script,style,template,noscript")) continue;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    seen.add(t.slice(0, 40));
  }
  return [...seen];
};

/* 剩余中文必须是"用户自己的数据"（种子任务标题/标签/笔记正文），这类按设计不翻译 */
const looksLikeUserData = (s) =>
  /周报|评审|登录页|水电费|防抖|Raft|分布式|鸡蛋|洗衣液|论文|在读|产品\/研发|排期|共识算法|日志复制/.test(s);

test.describe("i18n 端到端", () => {
  test.beforeAll(() => { test.skip(!process.env.E2E, "set E2E=1 to run"); });

  test("① 英文模式全新加载：模块级常量必须已是英文", async ({ page }) => {
    await page.goto(APP_URL);
    await page.evaluate(() => localStorage.setItem("wb_agent_lang", "en"));
    await page.reload();
    await page.waitForSelector("#side", { timeout: 15_000 });
    await page.waitForTimeout(1500);

    const st = await page.evaluate(() => ({
      cur: _currentLang,
      scene: SCENARIOS.office.name,
      feat: (SCENE_FEATURES.office || [])[0].label,
      field: SCENARIOS.office.record.fields[0].label,
      tool: (Object.values(TOOL_APPS).find((a) => a && a.name) || {}).name,
    }));
    expect(st.cur).toBe("en");
    /* 断言"不含中文"而不是"等于某个英文字串"：改文案不该让测试变红 */
    for (const [name, v] of Object.entries(st).filter(([k]) => k !== "cur")) {
      expect(/[一-鿿]/.test(String(v)), `${name} 在英文模式下仍是中文（字典求值晚于常量？）：${v}`).toBe(false);
    }

    const cn = await page.evaluate(COUNT_VISIBLE_CN);
    const notUserData = cn.filter((s) => !looksLikeUserData(s));
    /* 实测基线：全新加载英文模式下只剩 17 条唯一串，且全部是种子数据。
       留一点余量给"以后新增视图但忘了接 t()"这类情况不至于立刻误红，但阈值仍远小于历史 196。 */
    expect(notUserData.length, "英文模式下仍有非用户数据的可见中文：" + notUserData.slice(0, 10).join(" / ")).toBeLessThanOrEqual(6);
  });

  test("③ 动态渲染的 [data-i18n] 节点在每条路由上都已被翻译", async ({ page }) => {
    await page.goto(APP_URL);
    await page.evaluate(() => localStorage.setItem("wb_agent_lang", "en"));
    await page.reload();
    await page.waitForSelector("#side", { timeout: 15_000 });
    await page.waitForTimeout(1200);
    /* render() 有 12 条提前 return 的路由：收口钩子若被挪回 try 尾部，只有场景页会幸免 */
    const routes = ["overview", "stats", "tasks", "toolbox", "store", "timeline", "recycle", "chainpage", "office", "data", "design", "code"];
    for (const r of routes) {
      await page.evaluate((vv) => { try { setActive(vv); render(); } catch (e) { /* 未知路由忽略 */ } }, r);
      await page.waitForTimeout(300);
      const bad = await page.evaluate(() => {
        const R = /[一-鿿]/;
        const n = [...document.querySelectorAll("[data-i18n]")];
        /* 空键（data-i18n=""）是静态模板里等 JS 填充的占位，applyI18n 本就跳过它，不算缺陷 */
        const keyed = n.filter((e) => (e.getAttribute("data-i18n") || "").trim());
        return { cjk: keyed.filter((e) => R.test(e.textContent || "")).length, raw: keyed.filter((e) => (e.textContent || "").trim() === e.getAttribute("data-i18n")).length };
      });
      expect(bad.cjk, `${r} 路由上仍有未翻译的 [data-i18n] 节点` + (bad.cjk ? `（${bad.cjk} 个）` : "")).toBe(0);
      expect(bad.raw, `${r} 路由上有 [data-i18n] 渲染成了裸 key（字典缺这条）`).toBe(0);
    }
  });

  test("② 用真实下拉切换语言：页面重载后常量按新语言求值", async ({ page }) => {
    await page.goto(APP_URL);
    await page.evaluate(() => localStorage.setItem("wb_agent_lang", "zh"));
    await page.reload();
    await page.waitForSelector("#side", { timeout: 15_000 });
    await page.waitForTimeout(1200);
    expect(await page.evaluate(() => SCENARIOS.office.name)).toBe("办公");

    const found = await page.evaluate(() => !!document.querySelector("#cfgLang"));
    expect(found, "设置里应存在语言下拉 #cfgLang").toBe(true);
    await page.evaluate(() => {
      const sel = document.querySelector("#cfgLang");
      sel.value = "en";
      sel.dispatchEvent(new Event("change", { bubbles: true }));
    });
    /* 切换应触发整页重载；重载后常量才是新语言 */
    await page.waitForFunction(() => { try { return typeof _currentLang !== "undefined" && _currentLang === "en"; } catch (e) { return false; } }, null, { timeout: 15_000 });
    await page.waitForTimeout(800);
    const after = await page.evaluate(() => ({ cur: _currentLang, scene: SCENARIOS.office.name, stored: localStorage.getItem("wb_agent_lang") }));
    expect(after.stored).toBe("en");
    expect(after.cur).toBe("en");
    expect(/[一-鿿]/.test(after.scene), `切到英文后场景名仍是中文（说明没有重载）：${after.scene}`).toBe(false);
  });

  test("④ 中文模式同样不得漏翻（防单向修复）", async ({ page }) => {
    await page.goto(APP_URL);
    await page.evaluate(() => localStorage.setItem("wb_agent_lang", "zh"));
    await page.reload();
    await page.waitForSelector("#side", { timeout: 15_000 });
    await page.waitForTimeout(1200);
    const st = await page.evaluate(() => ({ scene: SCENARIOS.office.name, feat: (SCENE_FEATURES.office || [])[0].label }));
    expect(/[一-鿿]/.test(st.scene), `中文模式下场景名反而出英文了：${st.scene}`).toBe(true);
    expect(/[一-鿿]/.test(st.feat), `中文模式下功能 tab 名出英文了：${st.feat}`).toBe(true);
    const cn = await page.evaluate(COUNT_VISIBLE_CN);
    expect(cn.length).toBeGreaterThan(50); /* 中文模式本就该满是中文 */
  });
});
