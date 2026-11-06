const { test: base, expect } = require("./_fixture");
const { _electron } = require("playwright");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60" viewBox="0 0 120 60"><rect x="10" y="10" width="40" height="40" fill="#ff0000"/><rect x="70" y="10" width="40" height="40" fill="#0000ff"/></svg>';
const executablePath = process.env.DRAW_ELECTRON_EXECUTABLE;
/* Electron 模式用主进程 will-download 取文件：Playwright 在 Electron 下不派发 page "download" 事件 */
let electronApp = null;
let electronOutput = null;
const test = base.extend({
  page: async ({ page }, use, testInfo) => {
    if (!process.env.E2E || !executablePath || testInfo.project.name !== "desktop-1280x800") { await use(page); return; }
    const profile = await fs.mkdtemp(path.join(os.tmpdir(), "draw-electron-"));
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    let app;
    try {
      app = await _electron.launch({ executablePath, args: [path.resolve(__dirname, "../../electron/main.js"), "--user-data-dir=" + profile], env });
      const identity = await app.evaluate(({ app }) => ({ userData: app.getPath("userData"), appPath: app.getAppPath(), electron: process.versions.electron }));
      expect(path.resolve(identity.userData).toLowerCase()).toBe(path.resolve(profile).toLowerCase());
      expect(path.resolve(identity.appPath)).toBe(path.resolve(__dirname, "../../electron"));
      await testInfo.attach("electron-identity", { body: JSON.stringify(identity), contentType: "application/json" });
      const window = await app.firstWindow();
      await app.context().addInitScript(() => localStorage.setItem("wb_agent_onboarded", "true"));
      await window.reload();
      const output = testInfo.outputPath("native-downloads");
      await fs.mkdir(output, { recursive: true });
      await app.evaluate(({ BrowserWindow }, directory) => {
        const contents = BrowserWindow.getAllWindows()[0].webContents;
        globalThis.__drawAcceptance = { navigations: [], downloads: [] };
        const probe = globalThis.__drawAcceptance;
        contents.on("will-navigate", (_event, url) => probe.navigations.push(url));
        contents.session.on("will-download", (_event, item) => {
          const record = { filename: item.getFilename(), state: "started" };
          probe.downloads.push(record);
          item.setSavePath(directory + "/" + record.filename);
          item.once("done", (_event, state) => {
            record.state = state;
            record.savedPath = item.getSavePath();
          });
        });
      }, output);
      electronApp = app;
      electronOutput = output;
      await use(window);
      const native = await app.evaluate(() => globalThis.__drawAcceptance);
      expect(native.downloads.length).toBeGreaterThan(0);
      expect(native.downloads.every(d => d.state === "completed")).toBe(true);
      /* 两半都要有：will-download 触发（上面）+ will-navigate 一次都没触发（这里） */
      expect(native.navigations).toEqual([]);
      for (const record of native.downloads) {
        const saved = await fs.readFile(path.join(output, record.filename));
        expect(saved.length).toBeGreaterThan(0);
      }
      await testInfo.attach("electron-native-download", { body: JSON.stringify(native), contentType: "application/json" });
    } finally {
      electronApp = null;
      electronOutput = null;
      if (app) {
        /* 本应用关窗只隐藏到托盘；Playwright 默认 close 会卡到超时，先强退再兜底 */
        try { await Promise.race([app.evaluate(({ app }) => app.exit(0)).catch(() => {}), new Promise(r => setTimeout(r, 3000))]); } catch (_e) { /* 已退出 */ }
        try { await Promise.race([app.close(), new Promise(r => setTimeout(r, 5000))]); } catch (_e) { /* 已退出 */ }
        try { const proc = app.process(); if (proc && !proc.killed) proc.kill(); } catch (_e) { /* 已退出 */ }
      }
      await fs.rm(profile, { recursive: true, force: true });
    }
  },
});

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(!process.env.E2E, "set E2E=1 to run");
  test.skip(!!executablePath && testInfo.project.name !== "desktop-1280x800", "Electron acceptance uses the desktop project");
  if (!executablePath) await page.goto("./agent-workbench.html");
  await page.waitForFunction(() => document.getElementById("chat")?.children.length > 0);
});

async function seedCard(page, kind) {
  await page.evaluate(({ svg, kind }) => {
    const raw = kind === "svg"
      ? execTool("draw_svg", { title: "export-proof", svg })
      : execTool("render_chart", { type: "bar", data: [{ label: "A", value: 20 }, { label: "B", value: 40 }] });
    appendChat("office", { role: "tool", content: raw, _raw: _markerRaw(raw), _disp: raw });
    renderChat();
    if (typeof window.__aiPanelExpand === "function") window.__aiPanelExpand();
  }, { svg: SVG, kind });
  await expect(page.locator('#chat [data-svgexp="png"]').last()).toBeVisible();
}

async function saveDownload(page, format, testInfo) {
  const before = page.url();
  const nav = [];
  const onNavigation = frame => { if (frame === page.mainFrame()) nav.push(frame.url()); };
  page.on("framenavigated", onNavigation);
  try {
    const button = page.locator(`#chat [data-svgexp="${format}"]`).last();
    if (electronApp) {
      /* Electron：Playwright 不派发 page download 事件，改等主进程 will-download 落盘 */
      const startIndex = await electronApp.evaluate(() => globalThis.__drawAcceptance.downloads.length);
      await button.click();
      let record = null;
      for (let i = 0; i < 60; i++) {
        /* evaluate 的第一个参数永远是 electron 模块，用户实参从第二个开始 */
        record = await electronApp.evaluate((_electron, n) => globalThis.__drawAcceptance.downloads[n], startIndex);
        if (record && record.state === "completed") break;
        await page.waitForTimeout(200);
      }
      expect(record && record.state).toBe("completed");
      const file = path.join(electronOutput, record.filename);
      await expect(button).toBeEnabled();
      expect(page.url()).toBe(before);
      expect(nav).toEqual([]);
      await testInfo.attach(record.filename, { path: file });
      return { name: record.filename, bytes: await fs.readFile(file) };
    }
    const pending = page.waitForEvent("download");
    await button.click();
    const download = await pending;
    const file = testInfo.outputPath(download.suggestedFilename());
    await download.saveAs(file);
    expect(await download.failure()).toBeNull();
    await expect(button).toBeEnabled();
    expect(page.url()).toBe(before);
    expect(nav).toEqual([]);
    await testInfo.attach(download.suggestedFilename(), { path: file });
    return { name: download.suggestedFilename(), bytes: await fs.readFile(file) };
  } finally { page.off("framenavigated", onNavigation); }
}

async function pngPixels(page, bytes) {
  expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  expect(width).toBeGreaterThan(0);
  expect(height).toBeGreaterThan(0);
  const colors = await page.evaluate(async encoded => {
    const blob = new Blob([Uint8Array.from(atob(encoded), c => c.charCodeAt(0))], { type: "image/png" });
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let red = 0, blue = 0, colored = 0, white = 0;
    for (let i = 0; i < data.length; i += 4) {
      const [r, g, b, a] = data.slice(i, i + 4);
      if (a === 255 && r > 245 && g > 245 && b > 245) white++;
      if (a > 0 && Math.max(r, g, b) - Math.min(r, g, b) > 30) colored++;
      if (a === 255 && r > 240 && g < 15 && b < 15) red++;
      if (a === 255 && b > 240 && g < 15 && r < 15) blue++;
    }
    return { red, blue, colored, white };
  }, bytes.toString("base64"));
  expect(colors.colored).toBeGreaterThan(100);
  expect(colors.white).toBeGreaterThan(100);
  return { width, height, ...colors };
}

test("draw_svg PNG 下载完成且保留两色图形、尺寸与白底", async ({ page }, testInfo) => {
  await seedCard(page, "svg");
  const result = await saveDownload(page, "png", testInfo);
  expect(result.name).toMatch(/^export-proof-\d{8}-\d{4}\.png$/);
  const pixels = await pngPixels(page, result.bytes);
  expect([pixels.width, pixels.height]).toEqual([240, 120]);
  expect(pixels.red).toBeGreaterThan(5000);
  expect(pixels.blue).toBeGreaterThan(5000);
  await expect(page.locator("#toasts")).toContainText("已导出");
});

test("render_chart PNG 真栅格化包含主题色而不是空白图", async ({ page }, testInfo) => {
  await seedCard(page, "chart");
  const result = await saveDownload(page, "png", testInfo);
  expect(result.name).toMatch(/^chart-bar-\d{8}-\d{4}\.png$/);
  await pngPixels(page, result.bytes);
});

test("SVG 下载完成且源码可重新解析", async ({ page }, testInfo) => {
  await seedCard(page, "svg");
  const result = await saveDownload(page, "svg", testInfo);
  expect(result.name).toMatch(/^export-proof-\d{8}-\d{4}\.svg$/);
  const parsed = await page.evaluate(text => {
    const doc = new DOMParser().parseFromString(text, "image/svg+xml");
    return { error: !!doc.querySelector("parsererror"), rects: doc.querySelectorAll("rect").length };
  }, result.bytes.toString("utf8"));
  expect(parsed).toEqual({ error: false, rects: 2 });
});

test("Mermaid 导出的 SVG 保留节点与连线标签且不含 foreignObject", async ({ page }, testInfo) => {
  await page.evaluate(async () => {
    appendChat("office", { role: "assistant", content: "```mermaid\ngraph TD\nA[开始] -->|继续| B[结束]\n```" });
    renderChat();
    if (typeof window.__aiPanelExpand === "function") window.__aiPanelExpand();
    await renderMermaidBlocks(document.getElementById("chat"));
  });
  await expect(page.locator("#chat .mermaid-figure svg")).toBeVisible();
  const result = await saveDownload(page, "svg", testInfo);
  const svg = result.bytes.toString("utf8");
  expect(svg).not.toContain("foreignObject");
  const labels = await page.evaluate(text => [...new DOMParser().parseFromString(text, "image/svg+xml").querySelectorAll("text")].map(n => n.textContent).join(" "), svg);
  expect(labels).toContain("开始");
  expect(labels).toContain("结束");
  expect(labels).toContain("继续");
});

test("草图刷新可恢复，聊天裁剪后画布底稿仍独立保存", async ({ page }, testInfo) => {
  await seedCard(page, "svg");
  await page.reload();
  await page.waitForFunction(() => document.getElementById("chat")?.children.length > 0);
  await page.evaluate(() => { renderChat(); window.__aiPanelExpand(); });
  await expect(page.locator("#chat .svg-msg svg rect")).toHaveCount(2);
  await page.locator("#chat [data-canvasembed]").click();
  const diagram = await page.evaluate(() => dcActive().id);
  await page.evaluate(() => {
    for (let i = 0; i < 50; i++) appendChat("office", { role: "user", content: "后续消息 " + i });
  });
  await page.reload();
  await page.waitForFunction(() => document.getElementById("chat")?.children.length > 0);
  const state = await page.evaluate(id => ({
    messages: getChat("office").length,
    hasSvg: getChat("office").some(m => String(m._raw || m.content).startsWith("__SVG__")),
    embed: dcById(id)?.nodes.find(n => n.type === "embed")?.inner,
  }), diagram);
  expect(state.messages).toBe(50);
  expect(state.hasSvg).toBe(false);
  expect(state.embed).toContain("rect");
  await page.evaluate(() => setUIMode("work"));
  await seedCard(page, "svg");
  await saveDownload(page, "svg", testInfo);
});

test("toBlob 返回 null 时确实下载 SVG 而非伪 PNG",  async ({ page }, testInfo) => {
  await seedCard(page, "svg");
  await page.evaluate(() => {
    window.__drawToBlobCalls = 0;
    HTMLCanvasElement.prototype.toBlob = function (callback) { window.__drawToBlobCalls++; callback(null); };
  });
  const result = await saveDownload(page, "png", testInfo);
  expect(await page.evaluate(() => window.__drawToBlobCalls)).toBe(1);
  expect(result.name).toMatch(/\.svg$/);
  expect(result.bytes.toString("utf8")).toContain("<svg");
  await expect(page.locator("#toasts")).toContainText("PNG 导出不可用，已下载 SVG");
});
