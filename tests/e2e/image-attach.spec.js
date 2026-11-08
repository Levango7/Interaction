/**
 * 图片附件 · 真浏览器端到端（2026-11-08）
 * ----------------------------------------------------------------------------
 * jsdom 里证明不了的三件事：
 *   ① FileReader → Image → canvas 这条压缩链**真的跑得通**（jsdom 没有 canvas）；
 *   ② 压缩后的 dataURL 真被塞进请求体的 content 数组（假 provider 端点收包）；
 *   ③ 体积/类型闸门在真 File 上生效（反向对照）。
 * 默认跳过，E2E=1 才跑；只在 desktop 项目跑（聊天坞在窄屏是抽屉形态）。
 */
const { test, expect } = require("./_fixture");

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(!process.env.E2E, "set E2E=1 to run");
  test.skip(testInfo.project.name !== "desktop-1280x800", "chat dock is a drawer on narrow viewports");
  await page.goto("./agent-workbench.html");
  await page.waitForFunction(() => document.getElementById("chat")?.children.length > 0);
  await page.evaluate(() => {
    localStorage.setItem("wb_agent_onboarded", "true");
    _resetCrypto();
    localStorage.setItem("wb_agent_cfg", JSON.stringify({
      enabled: true,
      profiles: [{ id: "p1", name: "E2E", base: "http://127.0.0.1:11434/v1", key: "sk-e2e", model: "m" }],
      activeId: "p1",
    }));
  });
});

test("压缩后以 content 数组发出；体积/类型闸门生效", async ({ page }) => {
  test.setTimeout(60_000);
  /* 假 provider：把请求体记在 window 上，供断言收包形状 */
  await page.route("**/chat/completions", async (route) => {
    const cors = { "access-control-allow-origin": "*" };
    if (route.request().method() === "OPTIONS") {
      return route.fulfill({
        status: 204,
        headers: Object.assign({}, cors, {
          "access-control-allow-headers": "content-type,authorization",
          "access-control-allow-methods": "POST,OPTIONS",
        }),
      });
    }
    await page.evaluate((b) => { window.__sentBody = b; }, route.request().postDataJSON());
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: cors,
      body: JSON.stringify({ choices: [{ message: { role: "assistant", content: "收到图了" } }] }),
    });
  });

  /* 反向对照：文件选择器必须接受图片类型（否则用户根本选不到图） */
  const accept = await page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('body > input[type="file"]'));
    const inp = inputs.find((x) => (x.accept || "").indexOf("image/png") >= 0);
    return inp ? inp.accept : "";
  });
  expect(accept).toContain("image/png");

  /* 真 2000×600 图：超过 1024 边长，必须被压缩 */
  await page.evaluate(async () => {
    const cv = document.createElement("canvas");
    cv.width = 2000; cv.height = 600;
    const ctx = cv.getContext("2d");
    const g = ctx.createLinearGradient(0, 0, 2000, 600);
    g.addColorStop(0, "#ff0000"); g.addColorStop(1, "#0000ff");
    ctx.fillStyle = g; ctx.fillRect(0, 0, 2000, 600);
    const blob = await new Promise((r) => cv.toBlob(r, "image/png"));
    await _attachImageFile(new File([blob], "wide.png", { type: "image/png" }));
  });
  await expect(page.locator("#chatAttachStrip .attach-chip img")).toHaveCount(1);

  const pending = await page.evaluate(async () => {
    const url = pendingImages()[0];
    const w = await new Promise((resolve) => {
      const im = new Image();
      im.onload = () => resolve(im.naturalWidth);
      im.onerror = () => resolve(-1);
      im.src = url;
    });
    return { url, w, len: url.length };
  });
  expect(pending.url).toMatch(/^data:image\/(png|jpeg);base64,/);
  expect(pending.w).toBeGreaterThan(0);
  expect(pending.w).toBeLessThanOrEqual(1024);
  expect(pending.len).toBeLessThanOrEqual(400 * 1024);

  /* 类型与体积闸门：坏类型、超 8MB 都不得进条（反向对照） */
  const gate = await page.evaluate(async () => {
    const before = pendingImages().length;
    await _attachImageFile(new File(["<svg/>"], "x.svg", { type: "image/svg+xml" }));
    const big = new Uint8Array(8 * 1024 * 1024 + 1);
    await _attachImageFile(new File([big], "big.png", { type: "image/png" }));
    return { before, after: pendingImages().length };
  });
  expect(gate.after).toBe(gate.before);

  /* 发出去：请求体最后一条 user 是 content 数组，带同一张图 */
  await page.fill("#chatTextInput", "看这张图");
  await page.evaluate(() => onChatSubmit({ preventDefault() {}, target: { msg: document.getElementById("chatTextInput") } }));
  await expect.poll(() => page.evaluate(() => !!window.__sentBody), { timeout: 20_000 }).toBe(true);
  const sent = await page.evaluate(() => window.__sentBody);
  const lastUser = sent.messages[sent.messages.length - 1];
  expect(lastUser.role).toBe("user");
  expect(Array.isArray(lastUser.content)).toBe(true);
  expect(lastUser.content[0]).toEqual({ type: "text", text: "看这张图" });
  expect(lastUser.content[1].type).toBe("image_url");
  expect(lastUser.content[1].image_url.url).toBe(pending.url);

  /* 历史里落了图：气泡内缩略图可见，待发条清空 */
  await expect(page.locator("#chat .msg-imgs img")).toHaveCount(1);
  await expect(page.locator("#chatAttachStrip")).toBeHidden();
  await expect(page.locator("#chat")).toContainText("收到图了");
});