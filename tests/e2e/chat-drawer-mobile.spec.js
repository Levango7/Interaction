/**
 * chat-drawer-mobile.spec.js —— 手机（≤767）上「问 AI 助手」必须真的把聊天抽屉拉出来
 * ----------------------------------------------------------------------------
 * 为什么必须单独钉一条（R-31 销账，2026-10-25）：
 *   台账 R-31（2026-10-21）写着"手机上聊天面板打不开：≤767 靠 `.chat-panel.show` 滑入，
 *   但全仓没有任何代码给它加 `.show`"，还留了句"谁都可以接"。**那条结论是错的** ——
 *   `src/ai-retry.js:1226` 的 `window.__aiPanelExpand()` 在 <768 时走
 *   `setChatDrawer(true)`，里面是 `panel.classList.toggle("show", open)`。
 *   台账当时的 grep 写的是 `panel.classList.add("show")`，**漏了 `toggle("show", …)` 这种写法**
 *   ⇒ 已修的被记成未修。这是本仓第 5 次「待办其实已经办完」。
 *
 *   但"已修"不能只靠读代码断言 —— 抽屉的可见性是**排版问题**，jsdom 没有排版引擎
 *   （`getBoundingClientRect` 恒 0、`transform:translateX(100%)` 它看不见），
 *   必须真浏览器 + 真视口。所以这条用例同时干两件事：
 *     ① 证明手机入口现在**真的能用**（销账的机械证据）；
 *     ② 当守护 —— 将来谁把 `setChatDrawer` 或 `.chat-panel.show` 的 CSS 约定改坏，这里红。
 *
 * 判据（可测事实，不用"看起来开了"）：
 *   · `#chatPanel` 有 `.show` 类，且 `transform` 不是 `translateX(100%)`（即真滑进来了）；
 *   · 面板盒子完整落在视口内，右缘贴视口右侧；
 *   · 输入框中心 `elementFromPoint` 命中的就是它自己（不被固定底部导航 #mobBar 压住）；
 *   · 遮罩 `#chatBackdrop.show` 在，点遮罩能关上。
 */
const { test, expect } = require("./_fixture");

const APP_URL = "./agent-workbench.html";

/** 探针：开抽屉，返回几何 / 命中测试 / transform 实值 */
const probeDrawer = (page) => page.evaluate(() => {
  const p = document.getElementById("chatPanel");
  const ta = document.getElementById("chatTextInput");
  const r = p.getBoundingClientRect();
  /* 命中测试要打在**输入框自己的中心**上 —— 打在面板任意一点会命中头部/遮罩，
     判据就废了（与 tests/e2e/danger-confirm.spec.js 同一套做法）。 */
  const ir = ta ? ta.getBoundingClientRect() : null;
  const hit = ir
    ? document.elementFromPoint(ir.left + ir.width / 2, ir.top + ir.height / 2)
    : null;
  return {
    hasShow: p.classList.contains("show"),
    transform: getComputedStyle(p).transform,
    left: Math.round(r.left), right: Math.round(r.right),
    top: Math.round(r.top), bottom: Math.round(r.bottom),
    vw: window.innerWidth, vh: window.innerHeight,
    inputExists: !!ta,
    inputBox: ir ? { top: Math.round(ir.top), bottom: Math.round(ir.bottom) } : null,
    hitId: hit ? (hit.id || hit.className || hit.tagName).toString().slice(0, 40) : null,
    backdrop: !!document.querySelector("#chatBackdrop.show"),
  };
});

test.describe("手机 375×667（有固定底部导航 #mobBar）", () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test("R-31：点场景头「问 AI 助手」→ 抽屉滑入、在视口内、输入框点得到、遮罩可关", async ({ page }) => {
    await page.addInitScript(() => {
      /* AI 未就绪时 askAiAboutScene 只会 toast + 跳设置页，抽屉不会开。
         预置一份最小合法配置，让入口走"真开抽屉"那条路。 */
      localStorage.setItem("wb_agent_cfg", JSON.stringify({
        enabled: true, activeId: "p",
        profiles: [{ id: "p", name: "默认", base: "https://example.invalid/v1", key: "k", model: "" }],
      }));
    });
    await page.goto(APP_URL);
    await page.waitForSelector("#main");
    await page.waitForSelector("#phAiAskBtn");

    await page.click("#phAiAskBtn");
    await page.waitForFunction(() => document.getElementById("chatPanel").classList.contains("show"));

    const g = await probeDrawer(page);
    expect(g.hasShow, "抽屉必须有 .show").toBe(true);
    expect(g.transform, `transform 仍是 ${g.transform} —— 面板没滑进来`).not.toContain("matrix(1, 0, 0, 1, 375, 0)");
    expect(g.left, "抽屉左缘应在视口内").toBeLessThan(g.vw);
    expect(g.vw - g.right, "抽屉右缘应贴视口右侧").toBeLessThanOrEqual(1);
    expect(g.top, "抽屉顶缘应在视口内").toBeGreaterThanOrEqual(0);
    expect(g.bottom, "抽屉底缘应在视口内").toBeLessThanOrEqual(g.vh);
    expect(g.inputExists, "输入框必须存在").toBe(true);
    expect(g.inputBox, "输入框盒子必须已布局（jsdom 恒 0，真浏览器才有真值）").not.toBeNull();
    expect(g.hitId, `输入框中心命中被 ${g.hitId} 抢走（疑被底部导航压住）`).toBe("chatTextInput");
    expect(g.backdrop, "遮罩应显示").toBe(true);

    /* 点遮罩（远离卡片）→ 关上 */
    await page.mouse.click(6, 300);
    await page.waitForFunction(() => !document.getElementById("chatPanel").classList.contains("show"));
  });

  test("反向对照：把 .show 摘掉，同一条判据必须判红（证明尺子有射程）", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("wb_agent_cfg", JSON.stringify({
        enabled: true, activeId: "p",
        profiles: [{ id: "p", name: "默认", base: "https://example.invalid/v1", key: "k", model: "" }],
      }));
    });
    await page.goto(APP_URL);
    await page.waitForSelector("#main");
    await page.waitForSelector("#phAiAskBtn");
    /* 破坏 CSS 约定：让 .chat-panel.show 不再生效（等价于"没有任何代码加 .show"的旧状态） */
    await page.addStyleTag({ content: "@media (max-width:767px){.chat-panel.show{transform:translateX(100%) !important}}" });
    await page.click("#phAiAskBtn");
    await page.waitForFunction(() => document.getElementById("chatPanel").classList.contains("show"));
    const g = await probeDrawer(page);
    expect(g.left, "对照样本应整块落在视口外（= 旧缺陷形态）").toBeGreaterThanOrEqual(g.vw);
  });
});
