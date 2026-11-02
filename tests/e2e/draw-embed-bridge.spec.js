/**
 * draw-embed-bridge.spec.js —— AI 桥「在画布打开」在真浏览器里真的把底稿画出来（Phase B §七）
 * ----------------------------------------------------------------------------
 * 为什么必须走 e2e，jsdom 的 ⑬–⑰ 不够：底稿是**嵌套 `<svg>`**，jsdom 没有布局引擎，
 * 量不出"这张图真的占了一块可见区域"。本仓的老坑是「元素存在 ≠ 可见可点」
 * （topbar-overflow / draw-responsive 同一口径）—— 结构对而渲染 0 高的话，单测会全绿。
 *
 * 钉三件事：
 *   ① 聊天里的 draw_svg 产物卡真有这个按钮，真点得动；点完模式切到 Design、底稿真有尺寸；
 *   ② 底稿可整体拖动（真指针走完整事件链），落盘带回 inner；
 *   ③ 反向对照：底稿双击**不**弹文字浮层（专用回执），普通节点双击**要**弹 ——
 *      两条必须同批出现，否则"没弹"可能只是监听器压根没跑（假绿与假红同形）。
 *
 * 守护策略同其余 spec：默认跳过，E2E=1 才跑。
 */
const { test, expect } = require("./_fixture");

const APP_URL = "./agent-workbench.html";
const SHELL = ".app > .body";
const GOOD_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100">'
  + '<rect x="6" y="6" width="188" height="88" fill="#dbeafe" stroke="#1d4ed8"/>'
  + '<text x="20" y="55">AI 画的架构图</text></svg>';

/** 走真实回执形态把一张 draw_svg 产物塞进聊天（与 draw-marker-render 的单测同一形状）。 */
async function seedSvgCard(page) {
  await page.evaluate((svg) => {
    const raw = "__SVG__" + JSON.stringify({ title: "架构图", svg: svg });
    appendChat("office", {
      role: "tool",
      tool_call_id: "call-draw_svg",
      content: raw,
      _disp: '工具 draw_svg({"a":1}) → ' + raw,
      _raw: _markerRaw(raw),
    });
    renderChat();
  }, GOOD_SVG);
}

test.beforeAll(() => { test.skip(!process.env.E2E, "set E2E=1 to run"); });

test.describe("AI 桥：产物卡 → 画布底稿", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("①② 按钮真点得动：切 Design + 底稿可见有尺寸 + 真指针拖动生效 + 落盘带回 inner", async ({ page }) => {
    await page.goto(APP_URL);
    await seedSvgCard(page);

    const btn = page.locator('.svg-msg [data-canvasembed]');
    await expect(btn, "draw_svg 产物卡上要有「在画布打开」").toBeVisible();
    await expect(page.locator(SHELL), "点之前还在 Work 模式").not.toHaveClass(/design-mode/);

    await btn.click();

    await expect(page.locator(SHELL), "桥的另一端在画布：应自动切到 Design").toHaveClass(/design-mode/);
    const nested = page.locator("#drawCanvasHost g.dnode svg svg").first();
    await expect(nested, "底稿应作为嵌套 <svg> 出现在某个 dnode 里").toBeAttached();
    const box = await nested.boundingBox();
    expect(box, "底稿必须有真实外框（jsdom 量不到这一步）").not.toBeNull();
    expect(box.width, `底稿宽度应随定标框缩放；实测 ${Math.round(box.width)}×${Math.round(box.height)}`)
      .toBeGreaterThanOrEqual(60);
    expect(box.height).toBeGreaterThanOrEqual(30);

    const before = await page.evaluate(() => {
      const n = dcActive().nodes.find((m) => m.type === "embed");
      return { id: n.id, x: n.x, y: n.y, vb: n.vb, hasInner: String(n.inner || "").indexOf("<rect") >= 0 };
    });
    expect(before.vb).toBe("0 0 200 100");
    expect(before.hasInner, "底稿内容入库（不然刷新就丢）").toBe(true);

    /* 真指针从底稿中心拖起：命中靠热区 rect，不靠调 API */
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 40, { steps: 8 });
    await page.mouse.up();

    const after = await page.evaluate((id) => {
      const n = dcActive().nodes.find((m) => m.id === id);
      return { x: n.x, y: n.y };
    }, before.id);
    expect(after.x, "底稿要能整体移动（X 变了）").not.toBe(before.x);
    expect(after.y, "底稿要能整体移动（Y 变了）").not.toBe(before.y);
    expect(after.x % 10, "落点吸附到 10px 网格").toBe(0);

    const persisted = await page.evaluate(() =>
      (JSON.parse(localStorage.getItem("wb_agent_diagrams") || "[]")[0].nodes || [])
        .filter((n) => n.type === "embed").length);
    expect(persisted, "拖动后落盘仍带着这张底稿").toBe(1);
  });

  test("③ 双向判据：底稿双击不弹文字浮层（给专用回执），普通节点双击必须弹", async ({ page }) => {
    await page.goto(APP_URL);
    await seedSvgCard(page);
    await page.locator('.svg-msg [data-canvasembed]').click();
    await expect(page.locator(SHELL)).toHaveClass(/design-mode/);

    const embed = page.locator("#drawCanvasHost g.dnode svg svg").first();
    const ebox = await embed.boundingBox();
    await page.mouse.dblclick(ebox.x + ebox.width / 2, ebox.y + ebox.height / 2);
    const state1 = await page.evaluate(() => ({
      inputs: document.querySelectorAll("body > input").length,
      texts: [...document.querySelectorAll("#toasts .toast")].map((e) => e.textContent).join("|"),
    }));
    expect(state1.inputs, "底稿没有文字维度：不该弹浮层").toBe(0);
    expect(state1.texts, "拒了要说为什么").toContain("底稿不支持改文字");

    /* 反向对照：同一条双击路径对普通矩形必须真弹输入框，否则上面那条"没弹"是空转的绿 */
    await page.click('.dc-toolbar .dc-btn[data-dshape="rect"]');
    const rect = page.locator("#drawCanvasHost g.dnode").last();
    const rbox = await rect.boundingBox();
    await page.mouse.dblclick(rbox.x + rbox.width / 2, rbox.y + rbox.height / 2);
    const state2 = await page.evaluate(() => document.querySelectorAll("body > input").length);
    expect(state2, "普通节点双击仍要能改字").toBe(1);
  });
});
