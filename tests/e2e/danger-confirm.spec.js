/**
 * danger-confirm.spec.js —— 危险操作确认在真实浏览器里「看得见、点得到」
 * ----------------------------------------------------------------------------
 * 为什么必须有一层真浏览器（vitest/jsdom 那边已经钉过契约字段了）：
 *   AI 用的旧确认框骨架是 `.recycle-modal` —— 它是**页面内卡片**（position:static），
 *   插到 body 末端时 `getBoundingClientRect().top` 正好等于视口高度，整块在视口外；
 *   只有 trapFocus 的 focus() 把文档滚下 138px 才露出一点。2026-10-20 实测：
 *   375×667 下「确认执行」按钮落在 y=632–651，而固定底部导航从 y=610 开始，
 *   `document.elementFromPoint` 命中的是 `mob-bar-btn` —— 按钮被导航栏压住，**点不到**。
 *   jsdom 没有排版引擎，这类缺陷在它那里全绿（`getElementById` 恒真）。
 *
 * 判据只用两个可测事实：① 按钮盒子完整在视口内 ② 按钮中心的命中测试就是它自己。
 * 反向对照（别删）：同一趟里用旧骨架插一份，断言探测器**能**判它不合格 ——
 * 否则"全绿"可能只是尺子坏了。
 */
const { test, expect } = require("./_fixture");

const APP_URL = "./agent-workbench.html";

/** 在页面里真点一次危险确认，返回按钮几何与命中测试结果 */
const probeConfirm = (page, message) => page.evaluate((msg) => {
  window.dangerConfirm({ message: msg, confirmText: "确认执行" });
  const btn = document.getElementById("dangerConfirmModalYes");
  const wrap = document.getElementById("dangerConfirmModal");
  const r = btn.getBoundingClientRect();
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  const cs = getComputedStyle(wrap);
  return {
    inViewport: r.top >= 0 && r.bottom <= window.innerHeight && r.left >= 0 && r.right <= window.innerWidth,
    hitIsButton: hit === btn,
    hitTarget: hit ? (hit.id || hit.className || hit.tagName).toString().slice(0, 40) : null,
    position: cs.position,
    zIndex: cs.zIndex,
    top: Math.round(r.top), bottom: Math.round(r.bottom),
    vh: window.innerHeight,
  };
}, message);

/** 旧骨架的对照样本：静态卡片 —— 探针必须能指出它"整块在视口外" */
const probeLegacySkeleton = (page) => page.evaluate(() => {
  const wrap = document.createElement("div");
  wrap.className = "recycle-modal";
  wrap.id = "legacyProbe";
  wrap.innerHTML = '<div class="recycle-card u-max-w-440">'
    + '<div class="recycle-header"><h2>危险操作确认</h2></div>'
    + '<div><button type="button" id="legacyYes">确认执行</button></div></div>';
  document.body.appendChild(wrap);
  const box = wrap.getBoundingClientRect();
  const beforeFocus = { top: Math.round(box.top), vh: window.innerHeight,
    outsideViewport: box.top >= window.innerHeight };
  document.getElementById("legacyYes").focus(); /* 复刻 trapFocus 的那次自动滚动 */
  const btn = document.getElementById("legacyYes");
  const r = btn.getBoundingClientRect();
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  const out = { ...beforeFocus, position: getComputedStyle(wrap).position,
    hitIsButton: hit === btn,
    hitTarget: hit ? (hit.id || hit.className || hit.tagName).toString().slice(0, 40) : null };
  wrap.remove();
  return out;
});

test.describe("窄屏手机（375×667，有固定底部导航）", () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test("确认按钮在视口内且能被点中（不被底部导航压住）", async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForSelector("#main");
    const got = await probeConfirm(page, "删除这条任务？（将进入回收站，可恢复）");
    expect(got.position, "必须用真浮层骨架").toBe("fixed");
    expect(Number(got.zIndex)).toBeGreaterThan(40); /* 底部导航是 --z-sidebar:40 */
    expect(got.inViewport, JSON.stringify(got)).toBe(true);
    expect(got.hitIsButton, `命中被 ${got.hitTarget} 抢走`).toBe(true);
  });

  test("反向对照：旧骨架同一条判据必须判红", async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForSelector("#main");
    const legacy = await probeLegacySkeleton(page);
    expect(legacy.position, "旧骨架是页面内卡片，不是浮层").toBe("static");
    expect(legacy.outsideViewport,
      `对照样本应整块落在视口外（实测 top=${legacy.top} / vh=${legacy.vh}），否则探测器没射程`)
      .toBe(true);
  });
});

test.describe("桌面（1280×800）", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("遮罩铺满视口、点遮罩不关掉、Esc 关掉", async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForSelector("#main");
    const got = await probeConfirm(page, "确定清空全部数据？此操作不可恢复！");
    expect(got.position, "必须用真浮层骨架").toBe("fixed");
    expect(got.inViewport).toBe(true);
    expect(got.hitIsButton).toBe(true);

    /* 点遮罩正中（远离卡片）→ 确认类不吃遮罩 */
    await page.mouse.click(640, 30);
    expect(await page.evaluate(() => !!document.getElementById("dangerConfirmModal")),
      "点遮罩不应关掉危险确认").toBe(true);

    /* Esc 关掉 */
    await page.keyboard.press("Escape");
    expect(await page.evaluate(() => !!document.getElementById("dangerConfirmModal")),
      "Esc 应关掉危险确认").toBe(false);
  });

  test("点确认后按钮回调真的执行（不是只把节点摘掉）", async ({ page }) => {
    await page.goto(APP_URL);
    await page.waitForSelector("#main");
    const val = await page.evaluate(async () => {
      const p = window.dangerConfirm({ message: "吊销此 API Key？" });
      document.getElementById("dangerConfirmModalYes").click();
      return p;
    });
    expect(val).toBe(true);
  });
});
