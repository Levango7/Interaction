/**
 * draw-embed-bridge.spec.js —— AI 桥「在画布打开」在真浏览器里真的把底稿画出来（Phase B §七）
 * ----------------------------------------------------------------------------
 * 为什么必须走 e2e，jsdom 的 ⑬–⑰ 不够：底稿是**嵌套 `<svg>`**，jsdom 没有布局引擎，
 * 量不出"这张图真的占了一块可见区域"。本仓的老坑是「元素存在 ≠ 可见可点」
 * （topbar-overflow / draw-responsive 同一口径）—— 结构对而渲染 0 高的话，单测会全绿。
 *
 * 钉五件事：
 *   ① 聊天里的 draw_svg 产物卡真有这个按钮，真点得动；点完模式切到 Design、底稿真有尺寸；
 *   ② 底稿可整体拖动（真指针走完整事件链），落盘带回 inner；
 *   ③ 反向对照：底稿双击**不**弹文字浮层（专用回执），普通节点双击**要**弹 ——
 *      两条必须同批出现，否则"没弹"可能只是监听器压根没跑（假绿与假红同形）。
 *   ④ Phase C1：底稿里的 id 与画布自身撞名时真浏览器里不再互相覆盖
 *      （**整棵画布子树 id 唯一** —— 这是浏览器按 id 解析 url(#x) 的硬前提，jsdom 不判它）；
 *   ⑤ Phase C1：老盘（v3.7.153 形状、内层裸 id）在**真启动路径**上载入即补隔离，
 *      且补在首次绘制之前而不是之后。
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

/** 走真实回执形态把一张 draw_svg 产物塞进聊天（与 draw-marker-render 的单测同一形状）。
 *  ⚠️ 还要展开对话坞：面板默认收起（v3.2 的布局决定），卡片在收起的容器里 DOM 有、但不可见 ——
 *  Playwright 的 toBeVisible 因此判 hidden（本机首轮实测就是这个形状）。 */
async function seedSvgCard(page, svg) {
  /* 先等应用自己把聊天面板画过一轮，再塞卡。boot 尾部的 render() 走
     renderChatDisabled()，它用 `#chat.innerHTML = 问候语` **整体重写**面板；抢在这一帧之前
     append，卡片会被抹掉，表现为「element(s) not found」且再也不会回来。
     本机实测：只在"本 worker 的第一条用例"上红（浏览器冷、boot 慢），V8 热了同一条就绿
     —— 判据换成"面板已经有应用画出来的东西"，不是把超时调大。
     e2e 走全新存储 ⇒ cfg.enabled 恒为 false，这一帧必然画出那句问候语。 */
  await page.waitForFunction(() => {
    const el = document.getElementById("chat");
    return !!el && el.children.length > 0;
  }, null, { timeout: 10000 });
  await page.evaluate((s) => {
    const raw = "__SVG__" + JSON.stringify({ title: "架构图", svg: s });
    appendChat("office", {
      role: "tool",
      tool_call_id: "call-draw_svg",
      content: raw,
      _disp: '工具 draw_svg({"a":1}) → ' + raw,
      _raw: _markerRaw(raw),
    });
    renderChat();
    if (typeof window.__aiPanelExpand === "function") window.__aiPanelExpand();
  }, svg || GOOD_SVG);
  await expect(page.locator("#chatPanel")).toBeVisible();
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
    /* 先核模型再核几何：DOM 选择器写错时，这条能立刻区分"底稿没进去"与"我没找对元素"。 */
    const before = await page.evaluate(() => {
      const n = dcActive().nodes.find((m) => m.type === "embed");
      return n
        ? { id: n.id, x: n.x, y: n.y, vb: n.vb, hasInner: String(n.inner || "").indexOf("<rect") >= 0 }
        : null;
    });
    expect(before, "画布里应多出一个 embed 底稿节点").toBeTruthy();
    expect(before.vb).toBe("0 0 200 100");
    expect(before.hasInner, "底稿内容入库（不然刷新就丢）").toBe(true);

    /* 嵌套形状：外层是画布根 <svg id="drawSvg">，底稿是 g.dnode 的直接子 <svg> ⇒ 选择器只到一层
       （首轮我写成 `g.dnode svg svg`，那是"底稿里再套一个 svg"，本机实测恒 not found）。 */
    const nested = page.locator("#drawCanvasHost g.dnode svg").first();
    await expect(nested, "底稿应作为嵌套 <svg> 出现在某个 dnode 里").toBeAttached();
    const box = await nested.boundingBox();
    expect(box, "底稿必须有真实外框（jsdom 量不到这一步）").not.toBeNull();
    expect(box.width, `底稿宽度应随定标框缩放；实测 ${Math.round(box.width)}×${Math.round(box.height)}`)
      .toBeGreaterThanOrEqual(60);
    expect(box.height).toBeGreaterThanOrEqual(30);

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

    /* 用**增量**判浮层，不判绝对数：对话坞展开后 body 下未必是 0 个 input（首轮就栽过一次），
       绝对数会把"本来就有一个"读成"弹了两个"。 */
    const base = await page.evaluate(() => document.querySelectorAll("body > input").length);
    const embed = page.locator("#drawCanvasHost g.dnode svg").first();
    const ebox = await embed.boundingBox();
    await page.mouse.dblclick(ebox.x + ebox.width / 2, ebox.y + ebox.height / 2);
    const state1 = await page.evaluate(() => ({
      inputs: document.querySelectorAll("body > input").length,
      texts: [...document.querySelectorAll("#toasts .toast")].map((e) => e.textContent).join("|"),
    }));
    expect(state1.inputs, "底稿没有文字维度：不该新增浮层").toBe(base);
    expect(state1.texts, "拒了要说为什么").toContain("底稿不支持改文字");

    /* 反向对照：同一条双击路径对普通矩形必须真弹**一个**输入框，
       否则上面那条"没弹"是空转的绿；弹两个则是转交路径与原生 dblclick 各走了一遍。 */
    await page.click('.dc-toolbar .dc-btn[data-dshape="rect"]');
    const rect = page.locator("#drawCanvasHost g.dnode").last();
    const rbox = await rect.boundingBox();
    await page.mouse.dblclick(rbox.x + rbox.width / 2, rbox.y + rbox.height / 2);
    const state2 = await page.evaluate(() => document.querySelectorAll("body > input").length);
    expect(state2, "普通节点双击应恰好弹出一个文字浮层（实收新增 " + (state2 - base) + " 个）").toBe(base + 1);
  });

  /* ---- Phase C1：底稿 id 前缀隔离。这两条只能真浏览器判：
     `url(#x)` 是**按文档 id 空间解析**的，jsdom 既不解析也不判重，单测里"改对了名"
     不等于"浏览器解析得到"。 ---- */
  const COLLIDE_SVG =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100">'
    + '<defs><marker id="darr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7">'
    + '<path d="M0 0L10 5L0 10z" fill="#dc2626"/></marker>'
    + '<linearGradient id="g1"><stop offset="0" stop-color="#fde68a"/><stop offset="1" stop-color="#f59e0b"/></linearGradient></defs>'
    + '<rect x="10" y="10" width="80" height="40" fill="url(#g1)"/>'
    + '<path d="M110 50L170 50" stroke="#1d4ed8" marker-end="url(#darr)"/></svg>';

  test("④ 撞名不再互相覆盖：整棵画布子树 id 唯一，底稿带的是自己的前缀", async ({ page }) => {
    await page.goto(APP_URL);
    await seedSvgCard(page, COLLIDE_SVG);
    await page.locator('.svg-msg [data-canvasembed]').click();
    await expect(page.locator(SHELL)).toHaveClass(/design-mode/);

    const st = await page.evaluate(() => {
      const host = document.getElementById("drawCanvasHost");
      const ids = [...host.querySelectorAll("[id]")].map((e) => e.id);
      const embed = host.querySelector("g.dnode svg");
      return {
        ids,
        dup: ids.filter((x, i) => ids.indexOf(x) !== i),
        embedHtml: embed ? embed.innerHTML : "",
        nodePfx: (dcActive().nodes.find((n) => n.type === "embed") || {}).pfx || "",
      };
    });
    expect(st.nodePfx, "节点存下了这张底稿的专属前缀").toMatch(/^dce-[a-z0-9]+-$/);
    expect(st.dup, "画布子树里不该有重复 id（真浏览器按 id 解析 url(#x)，重复即串色）").toEqual([]);
    expect(st.ids.filter((x) => x === "darr"), "裸 #darr 只剩画布自己那一个").toHaveLength(1);
    expect(st.embedHtml, "底稿里的渐变引用跟着改了名").toContain("url(#" + st.nodePfx + "g1)");
    expect(st.embedHtml).toContain('id="' + st.nodePfx + 'darr"');
    expect(st.embedHtml, "不该再留裸 #g1：那会解析到别人的 defs 或解析不到").not.toContain("url(#g1)");
  });

  test("⑤ 老盘（裸 id、无 pfx）在真启动路径上载入即补隔离，且补在首次绘制之前", async ({ page }) => {
    await page.goto(APP_URL);
    await page.evaluate(() => {
      /* save() 落的是 JSON.stringify 后的串，所以键值要带引号写 —— 裸串会被读成对象解析失败。 */
      localStorage.setItem("wb_agent_diagrams", JSON.stringify([{
        id: "doc-old", title: "老图", updatedAt: 1,
        nodes: [{
          id: "n1", type: "embed", x: 0, y: 0, w: 320, h: 160, vb: "0 0 200 100", text: "",
          inner: '<marker id="darr" viewBox="0 0 10 10"/><path d="M0 0L50 0" marker-end="url(#darr)"/>'
        }],
        edges: []
      }]));
      localStorage.setItem("wb_agent_diagram_active", JSON.stringify("doc-old"));
      localStorage.setItem("wb_agent_uimode", JSON.stringify("design"));
    });
    await page.reload();
    await expect(page.locator(SHELL), "持久化的设计模式要真回到 Design").toHaveClass(/design-mode/);

    const st = await page.evaluate(() => {
      const n = JSON.parse(localStorage.getItem("wb_agent_diagrams") || "[]")[0].nodes[0];
      const host = document.getElementById("drawCanvasHost");
      return {
        pfx: n.pfx || "", inner: n.inner,
        paintedIds: [...(host ? host.querySelectorAll("[id]") : [])].map((e) => e.id),
      };
    });
    expect(st.pfx, "补隔离要留标记，否则每次载入都要重扫").toMatch(/^dce-[a-z0-9]+-$/);
    expect(st.inner).toContain('id="' + st.pfx + 'darr"');
    expect(st.inner).toContain("url(#" + st.pfx + "darr)");
    /* 首屏就对了才算"补在绘制之前"：盘上改了但画面还是旧串 = 用户看到的那一帧仍在串色。 */
    expect(st.paintedIds.some((x) => x.indexOf("dce-") === 0),
      "画出来的那一帧就该已带前缀（实收 " + JSON.stringify(st.paintedIds) + "）").toBe(true);
    expect(st.paintedIds.filter((x) => x === "darr"), "画布裸 #darr 仍是唯一").toHaveLength(1);
  });
});
